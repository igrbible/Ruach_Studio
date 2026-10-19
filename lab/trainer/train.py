"""Ruach Studio's own LoRA trainer for YuE2 (HERESY 1083; heresy/docs/TRAINER-PLAN.md).

One LoRA over both experts, as AI-Toolkit trains it (Ostris, MIT; its yue2_model.py read line by line):
  · every step one track, one window of `train_window_frames` (25 a second) cut at random;
  · the AR sees  prefix head + [ABC_END, MUSIC_START] + the window's tokens + [MUSIC_END]  and its KV
    cache (detached: the flow loss does not train the AR) conditions the NAR;
  · NAR: flow matching — t ~ logit-normal (sigmoid of a normal), noisy = (1-t)·x + t·noise, target
    noise - x, mean squared error;
  · AR (ar_loss_weight > 0): next-token cross entropy over the song's tokens FROM ITS START (else the AR
    learns that lyrics and music may start anywhere), in chunks of 512 positions; plus, with
    ar_kl_weight > 0, KL(base ‖ adapted) against the same AR with the adapter switched off;
  · AdamW (eps 1e-6, weight decay 1e-2), constant lr, the AR's adapter at lr × ar_lr_multiplier, gradients
    clipped at 1.0; gradient checkpointing.
Score mode (HERESY 1420; cot "full" or "melody"): each track's sheet by the engine's transcriber (cache.sheets, beside the latents);
per step, with probability abc_dropout (0.5, AI-Toolkit's) the track trains as Direct (the off instruction, no sheet), else the AR
sees the cot's instruction and the sheet's ids before [ABC_END, MUSIC_START]: the sheet in the AR's targets and in the NAR's
conditioning alike (AI-Toolkit's _item_prefix_and_abc and _ar_inputs). A track without a sheet trains as Direct, said in the log.
The separation (HERESY 1422; do_separation): each track split into voice and instrumental by the studio's separator (cache.stems:
the stems' codec tokens, and in score mode their sheets); each step the AR also learns the voice from the lyrics alone and the music
from the tags alone (the prompts ("", lyrics) and (style, "")), from the song's start; its lesson (ce + 0.5·ce_vocals + 1.0·ce_music)
/ 2.5 and its KL the mean of the three (AI-Toolkit's), the NAR's flow on the mix only. Each stem's part goes backward on its own
after the mix's: the same gradient as one sum, without three graphs on the card at once.
Data: a prepared set (datasets/prepared/NAME: NNN.wav + NNN.txt captions) and the studio's own latent cache
(_ruach_cache: latent [T, 64] and dto.tokens [T] per track, AI-Toolkit's layout), made here by cache.py
before the model loads for the tracks that have none. Nothing AI-Toolkit made is read.
Out: OUT/output/RUN/RUN_<step>.safetensors per save, RUN.safetensors at the end, loss_log.db (the
lab's run cards read it), and on stdout a progress line the lab's watcher reads (step/total, loss).
A run of the same name goes on from its last save (the adapter and the optimizer state).

    .venv/bin/python lab/trainer/train.py CONFIG.json"""
import glob, json, math, os, random, sqlite3, sys, time

import torch
import torch.nn.functional as F
from safetensors import safe_open
from safetensors.torch import load_file, save_file

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cache as latent_cache  # noqa: E402   (the name `cache` is the AR's KV cache in the loop)
from load import load_model  # noqa: E402
from lora import inject, load_into, set_enabled, state_dict  # noqa: E402
from model import ABC_END, CODEC_OFFSET, EOD, MUSIC_END, MUSIC_START  # noqa: E402
from prompt import parse_caption, tokenizer_from_checkpoint  # noqa: E402

KIT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

DEFAULTS = {"steps": 1500, "rank": 32, "lr": 1e-4, "save_every": 250, "ar_loss_weight": 0.5, "ar_kl_weight": 0.2,
            "ar_lr_multiplier": 0.5, "train_window_frames": 1500, "seed": 42, "max_grad_norm": 1.0, "chunk": 512,
            "ar_max_tokens": 0,          # 0: the AR's loss over the whole song (AI-Toolkit's default); N: its first N tokens
            "cot": "off", "abc_dropout": 0.5,   # HERESY 1420: score mode, "full" or "melody"; a sheet dropped half the steps
            "do_separation": False, "separation_vocals_weight": 0.5, "separation_music_weight": 1.0,   # HERESY 1422
            # HERESY 1497 (Viktor 16.10.2026: «у Тренера… есть ранняя остановка обучения при стабильном оверфите в NAR половинке по последним
            # 2-3 эпохам? И если такой сторож у нас будет идеальным, то можно и 100 эпох выставлять»): a share of the tracks held out of the
            # training (val_fraction, val_min…val_max of them) and measured at every save; patience saves in a row with no held-out flow
            # lower by min_delta (relative) than the best stop the run, the best named (val.json)
            "val_fraction": 0.0, "val_min": 4, "val_max": 16, "patience": 0, "min_delta": 0.003}


class StepLog:
    """Every step into loss_log.db, the schema AI-Toolkit's UI logger writes (the run cards read it).
    HERESY 1507: 16.10.2026 a run of 4 h died here at step 35189, a commit refused («database is locked») after sqlite's 5 s while
    the lab read the whole log: WAL now (readers and this writer never wait on each other), 60 s for a lock, and a commit or an
    insert refused never ends the run: said in the run's log, the steps kept for the next commit."""
    def __init__(self, path):
        self.con = sqlite3.connect(path, timeout=60)
        self.refused = 0
        try:
            self.con.execute("PRAGMA journal_mode=WAL")
        except sqlite3.Error as e:
            print(f"[step log] WAL refused ({e}): the rollback journal stays", flush=True)
        self.con.execute("CREATE TABLE IF NOT EXISTS steps (step INTEGER PRIMARY KEY, wall_time REAL)")
        self.con.execute("CREATE TABLE IF NOT EXISTS metric_keys (key TEXT PRIMARY KEY, first_seen_step INTEGER, last_seen_step INTEGER)")
        self.con.execute("CREATE TABLE IF NOT EXISTS metrics (step INTEGER, key TEXT, value_real REAL, value_text TEXT, PRIMARY KEY (step, key))")
        self.con.commit()

    def commit(self):
        try:
            self.con.commit()
        except sqlite3.OperationalError as e:
            self.refused += 1
            print(f"[step log] a commit refused ({e}): the steps kept for the next one, the run goes on ({self.refused} so far)", flush=True)
            return
        if self.refused:
            print(f"[step log] written again after {self.refused} refused commit(s)", flush=True)
            self.refused = 0

    def log(self, step, values):
        try:
            self.con.execute("INSERT OR REPLACE INTO steps(step, wall_time) VALUES(?, ?)", (step, time.time()))
            for k, v in values.items():
                self.con.execute("INSERT OR REPLACE INTO metrics(step, key, value_real, value_text) VALUES(?, ?, ?, NULL)", (step, k, float(v)))
                self.con.execute("INSERT INTO metric_keys(key, first_seen_step, last_seen_step) VALUES(?, ?, ?) "
                                 "ON CONFLICT(key) DO UPDATE SET last_seen_step = excluded.last_seen_step", (k, step, step))
        except sqlite3.OperationalError as e:
            print(f"[step log] step {step} not logged ({e}): the run goes on", flush=True)   # a gap in the curve, said; never the run's end
            return
        if step % 10 == 0:
            self.commit()


def load_set(folder):
    """[(name, caption, latent [T,64] bf16, tokens [T] int32)] for every caption, from the studio's own cache
    (_ruach_cache, made by cache.py); AI-Toolkit's _latent_cache is never read."""
    items = []
    for cap in sorted(glob.glob(os.path.join(folder, "*.txt"))):
        stem = os.path.splitext(os.path.basename(cap))[0]
        path = os.path.join(folder, "_ruach_cache", stem + "_ruach.safetensors")
        if not os.path.isfile(path):
            raise FileNotFoundError(f"no latent cache for {stem}: {path}")
        with safe_open(path, "pt") as f:
            meta = f.metadata() or {}
            if meta.get("filename") not in (None, stem + ".wav"):
                raise ValueError(f"{path} is the cache of {meta.get('filename')}, not {stem}.wav")
            items.append((stem, open(cap, encoding="utf-8").read(), f.get_tensor("latent"), f.get_tensor("dto.tokens")))
    if not items:
        raise ValueError(f"no captions in {folder}")
    return items


def ar_losses(model, embeds, ids, chunk, kl_on, loras):
    """Next-token CE over `ids` (the positions after the prefix head), and KL(base ‖ adapted) when asked;
    logits recomputed per chunk under checkpointing, so [n, vocab] in float32 never exists at once."""
    n = ids.shape[0]
    _, hidden = model.ar.prefill(embeds, return_hidden=True)
    hidden = hidden[0, -n - 1: -1]
    base = None
    if kl_on:
        set_enabled(loras, False)
        try:
            with torch.no_grad():
                _, base = model.ar.prefill(embeds, return_hidden=True)
                base = base[0, -n - 1: -1]
        finally:
            set_enabled(loras, True)
    head = model.ar.model.lm_head

    def piece(h, tgt, bh):
        logits = head(h).float()
        ce = F.cross_entropy(logits, tgt, reduction="sum")
        if bh is None:
            return ce, ce.new_zeros(())
        with torch.no_grad():
            base_logp = torch.log_softmax(head(bh).float(), -1)
        return ce, F.kl_div(torch.log_softmax(logits, -1), base_logp, log_target=True, reduction="sum")

    ce_sum = hidden.new_zeros((), dtype=torch.float32)
    kl_sum = hidden.new_zeros((), dtype=torch.float32)
    for s in range(0, n, chunk):
        ce, kl = torch.utils.checkpoint.checkpoint(piece, hidden[s: s + chunk], ids[s: s + chunk],
                                                   None if base is None else base[s: s + chunk], use_reentrant=False)
        ce_sum, kl_sum = ce_sum + ce, kl_sum + kl
    return ce_sum / n, (kl_sum / n if kl_on else None)


def main():
    cfg = dict(DEFAULTS, **json.load(open(sys.argv[1], encoding="utf-8")))
    run, out = cfg["name"], os.path.join(cfg["out"], "output", cfg["name"])
    os.makedirs(out, exist_ok=True)
    random.seed(cfg["seed"]); torch.manual_seed(cfg["seed"])
    dev = os.environ.get("DEV", "cuda")
    t0 = time.time()
    cot = cfg["cot"]
    if cot not in ("off", "full", "melody"):
        raise ValueError(f"cot {cot!r}: off, full or melody")
    lack = latent_cache.missing(cfg["dataset"])
    if lack:                                              # the set's cache first, then the model: never both on the card
        latent_cache.build(cfg["dataset"], cfg["checkpoint"], KIT, dev, lack)
    if cot != "off" and latent_cache.missing_sheets(cfg["dataset"], cot):
        latent_cache.sheets(cfg["dataset"], cot, KIT)
    sep = bool(cfg["do_separation"])
    if sep and latent_cache.missing_stems(cfg["dataset"], cot):     # HERESY 1422: the stems after the mix's cache (cut to its length)
        latent_cache.stems(cfg["dataset"], KIT, cot, dev)
    items = load_set(cfg["dataset"])
    # HERESY 1497: the held-out tracks, the same on every start of the run (by the seed, over the set's sorted names)
    val_idx = []
    if cfg["val_fraction"] > 0 and len(items) > cfg["val_min"] + 1:
        k = max(cfg["val_min"], min(cfg["val_max"], round(len(items) * cfg["val_fraction"])))
        val_idx = sorted(random.Random(cfg["seed"] + 1497).sample(range(len(items)), min(k, len(items) - 1)))
    train_idx = [i for i in range(len(items)) if i not in set(val_idx)]
    tok = tokenizer_from_checkpoint(cfg["checkpoint"])
    heads = {it[0]: torch.tensor(tok.prefix_head_ids(**parse_caption(it[1]), cot="off"), dtype=torch.long) for it in items}
    heads_cot, abcs = {}, {}                              # HERESY 1420: score mode's prompt and sheet per track
    if cot != "off":
        for name, cap, _lat, _tok in items:
            text = latent_cache.read_sheet(cfg["dataset"], name, cot)
            if text is None:
                continue
            ids = tok.encode(text)
            if any(not 0 <= t < EOD for t in ids):
                raise ValueError(f"the sheet of {name} leaves the ordinary text vocabulary")
            abcs[name] = torch.tensor(ids, dtype=torch.long)
            heads_cot[name] = torch.tensor(tok.prefix_head_ids(**parse_caption(cap), cot=cot), dtype=torch.long)
        print(f"score mode {cot}: {len(abcs)} of {len(items)} tracks with a sheet" +
              (f" ({len(items) - len(abcs)} without: Direct always)" if len(abcs) < len(items) else "") +
              f"; a sheet dropped on {cfg['abc_dropout']:.0%} of the steps", flush=True)
    # HERESY 1422: the separation: per stem its tokens, its prompt (Direct and, in score mode, the cot's) and its sheet
    SEP_W = {"vocals": cfg["separation_vocals_weight"], "music": cfg["separation_music_weight"]}
    stem_tok, stem_heads, stem_heads_cot, stem_sheets = {}, {v: {} for v in SEP_W}, {v: {} for v in SEP_W}, {v: {} for v in SEP_W}
    if sep:
        for name, cap, _lat, _tok in items:
            stem_tok[name] = latent_cache.read_stems(cfg["dataset"], name)
            p = parse_caption(cap)
            for v in SEP_W:
                style, lyrics = ("", p["lyrics"]) if v == "vocals" else (p["style"], "")
                stem_heads[v][name] = torch.tensor(tok.prefix_head_ids(style, lyrics, cot="off"), dtype=torch.long)
                text = latent_cache.read_stem_sheet(cfg["dataset"], name, v, cot) if cot != "off" else None
                if text is not None:
                    ids = tok.encode(text)
                    if any(not 0 <= t < EOD for t in ids):
                        raise ValueError(f"the {v} sheet of {name} leaves the ordinary text vocabulary")
                    stem_sheets[v][name] = torch.tensor(ids, dtype=torch.long)
                    stem_heads_cot[v][name] = torch.tensor(tok.prefix_head_ids(style, lyrics, cot=cot), dtype=torch.long)
        print(f"separation: {len(stem_tok)} tracks split, the AR's lesson (mix + {SEP_W['vocals']}·vocals + {SEP_W['music']}·music) / "
              f"{1 + sum(SEP_W.values())}" + (f"; stem sheets {len(stem_sheets['vocals'])} / {len(stem_sheets['music'])}" if cot != "off" else ""), flush=True)
    model = load_model(cfg["checkpoint"], dev)
    model.enable_gradient_checkpointing()
    model.train()
    loras = inject(model, cfg["rank"])
    ar_p = [p for m in loras["ar"] for p in (m.lora_A, m.lora_B)]
    nar_p = [p for m in loras["nar"] for p in (m.lora_A, m.lora_B)]
    opt = torch.optim.AdamW([{"params": nar_p, "lr": cfg["lr"]}, {"params": ar_p, "lr": cfg["lr"] * cfg["ar_lr_multiplier"]}],
                            lr=cfg["lr"], eps=1e-6, weight_decay=1e-2)
    step = 0
    saves = sorted(glob.glob(os.path.join(out, f"{run}_[0-9]*.safetensors")))
    if saves:                                             # go on from the last save
        last = saves[-1]
        load_into(loras, load_file(last))
        step = int(os.path.basename(last).rsplit("_", 1)[1].split(".")[0])
        if os.path.isfile(os.path.join(out, "optimizer.pt")):
            opt.load_state_dict(torch.load(os.path.join(out, "optimizer.pt"), map_location=dev))
        print(f"going on from {os.path.basename(last)} (step {step})", flush=True)
    log = StepLog(os.path.join(out, "loss_log.db"))
    if val_idx:
        print(f"held out: {len(val_idx)} of {len(items)} tracks, measured at every save" +
              (f"; the run stops after {cfg['patience']} saves with no held-out flow {cfg['min_delta'] * 100:g} % lower than the best" if cfg["patience"] > 0 else ""), flush=True)
    print(f"{len(items)} tracks · rank {cfg['rank']} · {cfg['steps']} steps · ready in {time.time() - t0:.0f} s · " +
          (f"VRAM {torch.cuda.memory_allocated() / 2**30:.1f} GB" if dev == "cuda" else "on " + dev), flush=True)
    order, epoch_seed = [], cfg["seed"]
    train_ar, kl_on = cfg["ar_loss_weight"] > 0, cfg["ar_kl_weight"] > 0
    t_start, done_at_start = time.time(), step
    def save(at):
        path = os.path.join(out, f"{run}_{at:09d}.safetensors")
        save_file(state_dict(loras), path, metadata={"name": run, "studio": "Ruach Studio", "trainer": "ruach", "step": str(at),
                                                     "rank": str(cfg["rank"]), "format": "pt"})
        torch.save(opt.state_dict(), os.path.join(out, "optimizer.pt"))
        log.commit()

    # HERESY 1497: the held-out measure: each held-out track's middle window, the NAR's flow at five fixed t's with fixed noise (and the
    # AR's CE from the song's start, when the AR trains), so two measures differ by the adapter alone; Direct's prompt
    T_GRID = (0.1, 0.3, 0.5, 0.7, 0.9)
    vpath = os.path.join(out, "val.json")
    val = json.load(open(vpath, encoding="utf-8")) if os.path.isfile(vpath) else {"held_out": [items[i][0] for i in val_idx], "history": []}

    def evaluate():
        g = torch.Generator().manual_seed(cfg["seed"] + 7)
        flows, ces = [], []
        with torch.no_grad():
            for i in val_idx:
                name, _cap, latent, tokens = items[i]
                total, w = tokens.shape[0], cfg["train_window_frames"]
                start = 0 if w <= 0 or total <= w else (total - w) // 2
                end = total if w <= 0 or total <= w else start + w
                x = latent[start:end][None].to(dev, torch.bfloat16)
                head = model.ar.embed(heads[name].to(dev))
                song = tokens.to(dev).long()
                ids = torch.cat([torch.tensor([ABC_END, MUSIC_START], device=dev), song[start:end] + CODEC_OFFSET, torch.tensor([MUSIC_END], device=dev)])
                embeds = torch.cat([head, model.ar.embed(ids)], 0)[None]
                kv, _ = model.ar.prefill(embeds)
                for tv in T_GRID:
                    noise = torch.randn(tuple(x.shape), generator=g).to(dev, torch.bfloat16)
                    t = torch.full((1,), tv, device=dev)
                    pred = model.nar((1 - t) * x + t * noise, t.to(torch.bfloat16), kv, embeds.shape[1])
                    flows.append(F.mse_loss(pred.float(), (noise - x).float()).item())
                del kv
                if train_ar:
                    limit = total if cfg["ar_max_tokens"] <= 0 else min(total, cfg["ar_max_tokens"])
                    a_ids = torch.cat([torch.tensor([ABC_END, MUSIC_START], device=dev), song[:limit] + CODEC_OFFSET] +
                                      ([torch.tensor([MUSIC_END], device=dev)] if limit == total else []))
                    ce, _ = ar_losses(model, torch.cat([head, model.ar.embed(a_ids)], 0)[None], a_ids, cfg["chunk"], False, loras)
                    ces.append(ce.item())
        return sum(flows) / len(flows), (sum(ces) / len(ces) if ces else None)

    def held_out(at):
        # the measure at a save, kept (val.json, loss_log.db's val/…) and said; True when the run should stop
        f, c = evaluate()
        log.log(at, dict({"val/flow": f}, **({"val/ar_ce": c} if c is not None else {})))
        log.commit()
        val["history"].append({"step": at, "flow": round(f, 6), "ar_ce": None if c is None else round(c, 5)})
        best = val.get("best")
        if best is None or f < best["flow"] * (1 - cfg["min_delta"]):
            val["best"], val["since_best"] = {"step": at, "flow": round(f, 6)}, 0
        else:
            val["since_best"] = val.get("since_best", 0) + 1
        stop = cfg["patience"] > 0 and val["since_best"] >= cfg["patience"]
        if stop:
            val["stopped"] = {"step": at, "why": f"no held-out flow under {val['best']['flow'] * (1 - cfg['min_delta']):.6f} (the best {val['best']['flow']} "   # HERESY 1521: what was measured
                                                f"less {cfg['min_delta'] * 100:g} %) for {val['since_best']} saves"}
        json.dump(val, open(vpath, "w", encoding="utf-8"), indent=1)
        print(f"held-out at step {at}: flow {f:.5f}" + (f" · ar_ce {c:.4f}" if c is not None else "") +
              f" · best {val['best']['flow']:.5f} at step {val['best']['step']}" + (f" · {val['since_best']} saves without one {cfg['min_delta'] * 100:g} % lower" if val["since_best"] else ""), flush=True)
        return stop

    saved_at = step
    try:
        while step < cfg["steps"]:
            if not order:
                order = list(train_idx)
                random.Random(epoch_seed + step).shuffle(order)
            name, _cap, latent, tokens = items[order.pop()]
            total = tokens.shape[0]
            w = cfg["train_window_frames"]
            start = 0 if w <= 0 or total <= w else random.randint(0, total - w)
            end = total if w <= 0 or total <= w else start + w
            x = latent[start:end][None].to(dev, torch.bfloat16)
            noise = torch.randn_like(x)
            t = torch.sigmoid(torch.randn(1, device=dev))             # logit-normal, AI-Toolkit's "sigmoid"
            noisy = (1 - t) * x + t * noise
            target = noise - x
            # HERESY 1420: score mode: the sheet and its instruction, or (abc_dropout of the steps, and a track without one) Direct
            sheet = abcs.get(name) if abcs and random.random() >= cfg["abc_dropout"] else None
            head = model.ar.embed((heads_cot if sheet is not None else heads)[name].to(dev))
            song = tokens.to(dev).long()

            def inputs(tok_ids, end_token, head=head, sheet=sheet):
                parts = ([sheet.to(dev)] if sheet is not None else []) + [torch.tensor([ABC_END, MUSIC_START], device=dev), tok_ids + CODEC_OFFSET]
                if end_token:
                    parts.append(torch.tensor([MUSIC_END], device=dev))
                ids = torch.cat(parts)
                return torch.cat([head, model.ar.embed(ids)], 0)[None], ids

            embeds, ids = inputs(song[start:end], True)
            ce = kl = None
            if train_ar:
                if start == 0 and end == total:
                    ce, kl = ar_losses(model, embeds, ids, cfg["chunk"], kl_on, loras)
                else:                                           # the AR's loss sees the song from its start
                    limit = total if cfg["ar_max_tokens"] <= 0 else min(total, cfg["ar_max_tokens"])
                    ar_embeds, ar_ids = inputs(song[:limit], limit == total)
                    ce, kl = ar_losses(model, ar_embeds, ar_ids, cfg["chunk"], kl_on, loras)
            with torch.no_grad():
                cache, _ = model.ar.prefill(embeds)
            cache = [(k.detach(), v.detach()) for k, v in cache]
            pred = model.nar(noisy, t.to(torch.bfloat16), cache, embeds.shape[1])
            flow = F.mse_loss(pred.float(), target.float())
            # HERESY 1422: with the separation the mix's AR part is its share of (ce + 0.5·ce_vocals + 1.0·ce_music) / 2.5 and its KL a
            # third of the mean; each stem's part goes backward on its own right after (the same gradient as one sum)
            split = sep and ce is not None
            share, kl_share = (1.0 / (1.0 + sum(SEP_W.values())), 1.0 / 3.0) if split else (1.0, 1.0)
            loss = flow
            if ce is not None:
                loss = loss + cfg["ar_loss_weight"] * share * ce
            if kl is not None:
                loss = loss + cfg["ar_kl_weight"] * kl_share * kl
            opt.zero_grad(set_to_none=True)
            loss.backward()
            total_loss, stem_ce, stem_kl = loss.item(), {}, []
            if split:
                for v in SEP_W:
                    s_sheet = stem_sheets[v].get(name) if stem_sheets[v] and random.random() >= cfg["abc_dropout"] else None
                    s_head = model.ar.embed((stem_heads_cot[v] if s_sheet is not None else stem_heads[v])[name].to(dev))
                    s_song = stem_tok[name][v].to(dev).long()
                    s_lim = s_song.shape[0] if cfg["ar_max_tokens"] <= 0 else min(s_song.shape[0], cfg["ar_max_tokens"])
                    s_embeds, s_ids = inputs(s_song[:s_lim], s_lim == s_song.shape[0], head=s_head, sheet=s_sheet)
                    s_ce, s_kl = ar_losses(model, s_embeds, s_ids, cfg["chunk"], kl_on, loras)
                    part = cfg["ar_loss_weight"] * share * SEP_W[v] * s_ce
                    if s_kl is not None:
                        part = part + cfg["ar_kl_weight"] * kl_share * s_kl
                        stem_kl.append(s_kl.item())
                    part.backward()
                    total_loss += part.item()
                    stem_ce[v] = s_ce.item()
                    del s_embeds, s_ids, s_ce, s_kl, part
            torch.nn.utils.clip_grad_norm_(ar_p + nar_p, cfg["max_grad_norm"])
            opt.step()
            step += 1
            values = {"loss/loss": total_loss, "loss/flow": flow.item()}    # loss/loss is the whole sum, as AI-Toolkit logs it
            if abcs:
                values["score/sheet"] = 1.0 if sheet is not None else 0.0        # HERESY 1420: which prompt the step had
            if ce is not None:
                values["loss/ar_ce"] = ce.item()
            if kl is not None:
                values["loss/ar_kl"] = (kl.item() + sum(stem_kl)) / (1 + len(stem_kl))   # HERESY 1422: the mean of the three, as AI-Toolkit logs it
            for v, x in stem_ce.items():
                values["loss/ar_ce_" + v] = x
            log.log(step, values)
            el = time.time() - t_start
            per = el / max(1, step - done_at_start)
            eta = per * (cfg["steps"] - step)
            print(f"{run}: {100 * step // cfg['steps']:3d}%| {step}/{cfg['steps']} [{int(el // 60):02d}:{int(el % 60):02d}<{int(eta // 3600)}:{int(eta % 3600 // 60):02d}:{int(eta % 60):02d}, "
                  f"{per:.2f}s/it, lr: {cfg['lr']:.1e} loss: {values['loss/loss']:.3e}]", flush=True)
            if step % cfg["save_every"] == 0 or step == cfg["steps"]:
                save(step)
                saved_at = step
                if val_idx and held_out(step):                # HERESY 1497: the early stop
                    print(f"early stop at step {step}: {val['stopped']['why']}; the best held-out is step {val['best']['step']}", flush=True)
                    break
    except KeyboardInterrupt:                         # Stop (SIGINT from the lab): keep what was learned, as AI-Toolkit does
        if step > saved_at:
            save(step)
        print(f"stopped at step {step}; saved", flush=True)
    save_file(state_dict(loras), os.path.join(out, f"{run}.safetensors"), metadata={"name": run, "studio": "Ruach Studio", "trainer": "ruach"})
    log.commit()
    peak = f" · VRAM peak {torch.cuda.max_memory_allocated() / 2**30:.1f} GB" if dev == "cuda" else ""
    print(f"done: {step} steps in {(time.time() - t_start) / 60:.0f} min{peak}", flush=True)


if __name__ == "__main__":
    main()
