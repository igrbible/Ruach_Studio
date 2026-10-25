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
HERESY 1631 (Viktor 20.10.2026: «заменяй TP на DDP… сможем и нечётные количества по картам гнать»; «по батчингу с градиент аккумуляцией допили в
тренере… автоматизация без костлявых пальцев пользователей»; RIVALS 10, «EMA в обучении LoRA… и resume_from любой эпохи»: «ОДОБРЯЮ в 2.0.0»):
  · cards: started by torchrun (--nproc_per_node=N over N cards), each card holds the whole model and trains its own tracks; the adapters'
    gradients are averaged over the cards before each optimizer step (data-parallel), so N cards go through an epoch about N times faster;
    the first card alone writes the log, the saves and the held-out measure;
  · accum: tracks per card before an optimizer step (gradient accumulation). The batch is cards × accum tracks; `step` still counts tracks,
    so epochs, saves and the lab's progress mean what they meant at batch 1; the learning rate × √batch (lr_scale "sqrt"; "none" keeps it);
  · checkpointing: on (as before); "auto" starts without it and turns it on at the first step out of memory (said in the log). Measured
    20.10.2026 on GPU1 (shofar-yt, songs of minutes, the AR's lesson over the whole song): without it the first step wanted more than
    24 GB, so on stays the default; a set of short voice clips may fit without it;
  · ema: every save is the moving average of the adapter's weights (both halves) over about ema_epochs of training, warmed up from the
    start; the held-out measure is taken on it; the raw weights and the optimizer for going on are kept in resume.safetensors.raw and
    optimizer.pt; resume_from: a save's step to go on from (its weights, a fresh optimizer) instead of the last one.

    .venv/bin/python lab/trainer/train.py CONFIG.json
    .venv/bin/python -m torch.distributed.run --standalone --nproc_per_node=2 lab/trainer/train.py CONFIG.json"""
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


def tail_lr(base, step, steps, tail_from, floor):
    """HERESY 1752: the rate at a step: base until tail_from (0: never), then in a straight line down to floor × base at the run's last step."""
    if not tail_from or step < tail_from or steps <= tail_from:
        return base
    frac = min(1.0, (step - tail_from) / float(steps - tail_from))
    return base * (1.0 - frac * (1.0 - floor))


def tail_start(cfg):
    """HERESY 1752: the step the tail begins at: the run's last lr_tail_epochs epochs (0, or no epoch's length known: no tail)."""
    epochs, per = float(cfg.get("lr_tail_epochs") or 0), int(cfg.get("steps_per_epoch") or 0)
    if epochs <= 0 or per <= 0:
        return 0
    return max(1, int(cfg["steps"]) - int(round(epochs * per)))

DEFAULTS = {"steps": 1500, "rank": 32, "rank_ar": 0, "rank_nar": 0, "lr": 1e-4, "save_every": 250, "ar_loss_weight": 0.5, "ar_kl_weight": 0.2,
            "ar_lr_multiplier": 0.5, "train_window_frames": 1500, "seed": 42, "max_grad_norm": 1.0, "chunk": 512,
            "ar_max_tokens": 0,          # 0: the AR's loss over the whole song (AI-Toolkit's default); N: its first N tokens
            "cot": "off", "abc_dropout": 0.5,   # HERESY 1420: score mode, "full" or "melody"; a sheet dropped half the steps
            "do_separation": False, "separation_vocals_weight": 0.5, "separation_music_weight": 1.0,   # HERESY 1422
            # HERESY 1497 (Viktor 16.10.2026: «у Тренера… есть ранняя остановка обучения при стабильном оверфите в NAR половинке по последним
            # 2-3 эпохам? И если такой сторож у нас будет идеальным, то можно и 100 эпох выставлять»): a share of the tracks held out of the
            # training (val_fraction, val_min…val_max of them) and measured at every save; patience saves in a row with no held-out flow
            # lower by min_delta (relative) than the best stop the run, the best named (val.json)
            "val_fraction": 0.0, "val_min": 4, "val_max": 16, "patience": 0, "min_delta": 0.003,
            # HERESY 1622: at the plateau the sound half goes on alone (the AR of the lowest held-out ar_ce frozen), up to so many epochs
            "nar_phase_epochs": 0, "nar_phase_patience": 6, "nar_phase_min_delta": 0.001,
            # HERESY 1631: tracks per card before a step, the rate by the batch, checkpointing by the card's room, the saves as a moving average
            "accum": 1, "lr_scale": "sqrt", "checkpointing": True, "ema": True, "ema_epochs": 1.0, "resume_from": 0,
            "lr_tail_epochs": 0.0, "lr_tail_floor": 0.0,   # HERESY 1752: over the last so many epochs the rate falls in a line to floor × itself
            # HERESY 1662: the latents read when a track is taken ("auto": a set over LAZY_OVER tracks); an epoch's length for the sound half's phase
            "lazy_cache": "auto", "steps_per_epoch": 0}
LAZY_OVER = 4000


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


class LazyTrack:
    """HERESY 1662: a track of a big set as load_set's tuple, its latents read from the cache when asked (item 2 or 3, or unpacked)"""
    __slots__ = ("stem", "caption", "path")

    def __init__(self, stem, caption, path):
        self.stem, self.caption, self.path = stem, caption, path

    def _tensors(self):
        with safe_open(self.path, "pt") as f:
            return f.get_tensor("latent"), f.get_tensor("dto.tokens")

    def __len__(self):
        return 4

    def __getitem__(self, k):
        if k == 0:
            return self.stem
        if k == 1:
            return self.caption
        if k in (2, 3):
            return self._tensors()[k - 2]
        raise IndexError(k)

    def __iter__(self):
        latent, tokens = self._tensors()
        return iter((self.stem, self.caption, latent, tokens))


def load_set(folder, lazy="auto"):
    """[(name, caption, latent [T,64] bf16, tokens [T] int32)] for every caption, from the studio's own cache
    (_ruach_cache, made by cache.py); AI-Toolkit's _latent_cache is never read. HERESY 1662: a set over LAZY_OVER tracks (or lazy "on") as
    LazyTrack, the same four, read when asked."""
    items = []
    caps = sorted(glob.glob(os.path.join(folder, "*.txt")))
    lazy = str(lazy).lower() in ("on", "true", "1") or (str(lazy).lower() == "auto" and len(caps) > LAZY_OVER)
    for cap in caps:
        stem = os.path.splitext(os.path.basename(cap))[0]
        path = os.path.join(folder, "_ruach_cache", stem + "_ruach.safetensors")
        if not os.path.isfile(path):
            raise FileNotFoundError(f"no latent cache for {stem}: {path}")
        with safe_open(path, "pt") as f:
            meta = f.metadata() or {}
            if meta.get("filename") not in (None, stem + ".wav"):
                raise ValueError(f"{path} is the cache of {meta.get('filename')}, not {stem}.wav")
            if lazy:
                items.append(LazyTrack(stem, open(cap, encoding="utf-8").read(), path))
                continue
            items.append((stem, open(cap, encoding="utf-8").read(), f.get_tensor("latent"), f.get_tensor("dto.tokens")))
    if not items:
        raise ValueError(f"no captions in {folder}")
    return items


def track_weights(folder):
    """HERESY 1662: {stem: n} of the tracks dataset.json gives a weight over 1 (n times in an epoch)"""
    path = os.path.join(folder, "dataset.json")
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as f:
        out = {}
        for t in json.load(f).get("tracks", []):
            try:
                n = int(t.get("weight") or 1)
            except (TypeError, ValueError):
                n = 1
            if n > 1:
                out[str(t.get("stem"))] = n
        return out


def no_ar_stems(folder):
    """HERESY 1643: the tracks the set's dataset.json marks "no_ar": true (a voice whose words are not known): the NAR's lesson only"""
    path = os.path.join(folder, "dataset.json")
    if not os.path.isfile(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {str(t.get("stem")) for t in json.load(f).get("tracks", []) if t.get("no_ar")}


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
    # HERESY 1631: the cards torchrun gives, a process a card; the first one builds the cache, speaks, writes and measures
    world, rank_id = int(os.environ.get("WORLD_SIZE", "1")), int(os.environ.get("RANK", "0"))
    main0, dist = rank_id == 0, None
    dev = os.environ.get("DEV", "cuda")
    if world > 1:
        import datetime
        import torch.distributed as dist
        local = int(os.environ.get("LOCAL_RANK", "0")) % max(1, torch.cuda.device_count())   # DIST_BACKEND=gloo: two on one card, for a check
        torch.cuda.set_device(local)
        dev = f"cuda:{local}"
        backend = os.environ.get("DIST_BACKEND", "nccl")
        dist.init_process_group(backend, timeout=datetime.timedelta(hours=12),   # the first card may build the cache for hours
                                **({"device_id": torch.device(dev)} if backend == "nccl" else {}))

    def say(text):
        if main0:
            print(text, flush=True)
    os.makedirs(out, exist_ok=True)
    random.seed(cfg["seed"]); torch.manual_seed(cfg["seed"])
    t0 = time.time()
    cot = cfg["cot"]
    if cot not in ("off", "full", "melody"):
        raise ValueError(f"cot {cot!r}: off, full or melody")
    sep = bool(cfg["do_separation"])
    if main0:                                             # the set's cache first, then the model: never both on the card
        lack = latent_cache.missing(cfg["dataset"])
        if lack:
            latent_cache.build(cfg["dataset"], cfg["checkpoint"], KIT, dev, lack)
        if cot != "off" and latent_cache.missing_sheets(cfg["dataset"], cot):
            latent_cache.sheets(cfg["dataset"], cot, KIT)
        if sep and latent_cache.missing_stems(cfg["dataset"], cot):     # HERESY 1422: the stems after the mix's cache (cut to its length)
            latent_cache.stems(cfg["dataset"], KIT, cot, dev)
    if dist:
        dist.barrier()                                    # the other cards wait for the first one's cache
    items = load_set(cfg["dataset"], cfg["lazy_cache"])   # HERESY 1662: a big set's latents read when taken
    no_ar = no_ar_stems(cfg["dataset"])                  # HERESY 1643
    weights = track_weights(cfg["dataset"])              # HERESY 1662
    # HERESY 1497: the held-out tracks, the same on every start of the run (by the seed, over the set's sorted names)
    val_idx = []
    if cfg["val_fraction"] > 0 and len(items) > cfg["val_min"] + 1:
        k = max(cfg["val_min"], min(cfg["val_max"], round(len(items) * cfg["val_fraction"])))
        pool = range(len(items)) if not weights else [i for i in range(len(items)) if items[i][0] not in weights]   # HERESY 1662: never a weighted one
        val_idx = sorted(random.Random(cfg["seed"] + 1497).sample(pool, min(k, len(pool) - 1)))
    held = set(val_idx)
    train_idx = [i for i in range(len(items)) if i not in held]
    order = [i for i in train_idx for _ in range(weights.get(items[i][0], 1))]   # HERESY 1662: an epoch, each track as many times as its weight
    tok = tokenizer_from_checkpoint(cfg["checkpoint"])
    heads = {it[0]: torch.tensor(tok.prefix_head_ids(**parse_caption(it[1]), cot="off"), dtype=torch.long) for it in items}
    heads_cot, abcs = {}, {}                              # HERESY 1420: score mode's prompt and sheet per track
    if cot != "off":
        for it in items:                                  # HERESY 1662: the name and caption alone (a lazy track's latents stay on disk)
            name, cap = it[0], it[1]
            text = latent_cache.read_sheet(cfg["dataset"], name, cot)
            if text is None:
                continue
            ids = tok.encode(text)
            if any(not 0 <= t < EOD for t in ids):
                raise ValueError(f"the sheet of {name} leaves the ordinary text vocabulary")
            abcs[name] = torch.tensor(ids, dtype=torch.long)
            heads_cot[name] = torch.tensor(tok.prefix_head_ids(**parse_caption(cap), cot=cot), dtype=torch.long)
        say(f"score mode {cot}: {len(abcs)} of {len(items)} tracks with a sheet" +
            (f" ({len(items) - len(abcs)} without: Direct always)" if len(abcs) < len(items) else "") +
            f"; a sheet dropped on {cfg['abc_dropout']:.0%} of the steps")
    # HERESY 1422: the separation: per stem its tokens, its prompt (Direct and, in score mode, the cot's) and its sheet
    SEP_W = {"vocals": cfg["separation_vocals_weight"], "music": cfg["separation_music_weight"]}
    stem_tok, stem_heads, stem_heads_cot, stem_sheets = {}, {v: {} for v in SEP_W}, {v: {} for v in SEP_W}, {v: {} for v in SEP_W}
    if sep:
        for it in items:                                  # HERESY 1662
            name, cap = it[0], it[1]
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
        say(f"separation: {len(stem_tok)} tracks split, the AR's lesson (mix + {SEP_W['vocals']}·vocals + {SEP_W['music']}·music) / "
            f"{1 + sum(SEP_W.values())}" + (f"; stem sheets {len(stem_sheets['vocals'])} / {len(stem_sheets['music'])}" if cot != "off" else ""))
    model = load_model(cfg["checkpoint"], dev)
    # HERESY 1631: checkpointing "auto" starts without (the card's room buys speed) and turns on at the first step out of memory
    ck = str(cfg["checkpointing"]).lower()
    ckpt_on = ck not in ("auto", "false", "off", "0")
    if ckpt_on:
        model.enable_gradient_checkpointing()
    else:
        model.disable_gradient_checkpointing()
    model.train()
    ranks = {"ar": int(cfg.get("rank_ar") or cfg["rank"]), "nar": int(cfg.get("rank_nar") or cfg["rank"])}   # HERESY 1642: a rank a half
    loras = inject(model, cfg["rank"], ranks=ranks)
    rank_said = str(ranks["ar"]) if ranks["ar"] == ranks["nar"] else f"{ranks['ar']} music · {ranks['nar']} sound"
    ar_p = [p for m in loras["ar"] for p in (m.lora_A, m.lora_B)]
    nar_p = [p for m in loras["nar"] for p in (m.lora_A, m.lora_B)]
    accum = max(1, int(cfg["accum"]))
    batch = world * accum                                 # HERESY 1631: tracks an optimizer step
    lr = cfg["lr"] * (math.sqrt(batch) if str(cfg["lr_scale"]) == "sqrt" and batch > 1 else 1.0)

    def adamw(ar_lr):
        return torch.optim.AdamW([{"params": nar_p, "lr": lr}, {"params": ar_p, "lr": ar_lr}], lr=lr, eps=1e-6, weight_decay=1e-2)
    opt = adamw(lr * cfg["ar_lr_multiplier"])
    step = 0
    saves = sorted(glob.glob(os.path.join(out, f"{run}_[0-9]*.safetensors")))
    rpath = os.path.join(out, "resume.safetensors.raw")   # HERESY 1631: the raw weights at the last save, when the saves are averages (not a *.safetensors: the lab lists those)
    went_on = None
    if int(cfg["resume_from"] or 0) > 0:                  # HERESY 1631: from a save of one's choosing, its weights and a fresh optimizer
        went_on = os.path.join(out, f"{run}_{int(cfg['resume_from']):09d}.safetensors")
        if not os.path.isfile(went_on):
            raise FileNotFoundError(f"resume_from {cfg['resume_from']}: no {os.path.basename(went_on)}")
        load_into(loras, load_file(went_on))
        step = int(cfg["resume_from"])
        say(f"going on from {os.path.basename(went_on)} (step {step}) with a fresh optimizer")
    elif saves:                                           # go on from the last save
        went_on = saves[-1]
        step = int(os.path.basename(went_on).rsplit("_", 1)[1].split(".")[0])
        raw = went_on
        if os.path.isfile(rpath):
            with safe_open(rpath, "pt") as f:
                if (f.metadata() or {}).get("step") == str(step):
                    raw = rpath
        load_into(loras, load_file(raw))
        if os.path.isfile(os.path.join(out, "optimizer.pt")):
            opt.load_state_dict(torch.load(os.path.join(out, "optimizer.pt"), map_location=dev))
        say(f"going on from {os.path.basename(went_on)} (step {step})" + (", its raw weights from resume.safetensors.raw" if raw == rpath else ""))
    if dist:                                              # one adapter on every card
        for p in ar_p + nar_p:
            dist.broadcast(p.data, 0)
        random.seed(cfg["seed"] + 7919 * rank_id); torch.manual_seed(cfg["seed"] + 7919 * rank_id)   # each card its own windows and noise
    # HERESY 1631 (RIVALS 10, FS_Audio Suite: «every exported checkpoint is the EMA of both halves»): the saves are the moving average of the
    # adapter over about ema_epochs, warmed up from the start (timm's (1+n)/(10+n)); kept by the first card, which saves and measures
    ema, ema_n = None, step // batch
    ema_host = world > 1                                  # HERESY 1671: under DDP the average in the host's memory (the first card kept 1.8 GB more)
    ema_buf = None

    def hold(p):                                          # one weight's copy for the average
        return p.detach().to("cpu", copy=True).pin_memory() if ema_host else p.detach().clone()
    steps_per_epoch = max(1, math.ceil(len(order) / batch))   # HERESY 1662: the weighted epoch
    ema_decay = 1 - 1 / max(2.0, float(cfg["ema_epochs"]) * steps_per_epoch)
    if cfg["ema"] and main0:
        if went_on:                                       # the save one goes on from is the average to go on with
            keep = [p.detach().clone() for p in ar_p + nar_p]
            load_into(loras, load_file(went_on))
            ema = [hold(p) for p in ar_p + nar_p]
            for p, k in zip(ar_p + nar_p, keep):
                p.data.copy_(k)
            del keep
        else:
            ema = [hold(p) for p in ar_p + nar_p]

    def ema_update():
        nonlocal ema_n, ema_buf
        ema_n += 1
        d = min(ema_decay, (1 + ema_n) / (10 + ema_n))
        with torch.no_grad():
            if ema_host:                                  # HERESY 1671: the weights into pinned buffers, the average follows them in one pass
                if ema_buf is None:
                    ema_buf = [torch.empty_like(e).pin_memory() for e in ema]
                for b, p in zip(ema_buf, ar_p + nar_p):
                    b.copy_(p.detach(), non_blocking=True)
                torch.cuda.synchronize()
                was = torch.get_num_threads()             # HERESY 1671b: eight threads for the pass alone (torchrun gives one)
                torch.set_num_threads(max(was, 8))
                try:
                    torch._foreach_lerp_(ema, ema_buf, 1 - d)
                finally:
                    torch.set_num_threads(was)
                return
            for e, p in zip(ema, ar_p + nar_p):
                e.mul_(d).add_(p.detach(), alpha=1 - d)

    def swap():                                           # the average into the adapter and back (twice is none)
        with torch.no_grad():
            for e, p in zip(ema, ar_p + nar_p):
                tmp = p.data.clone()
                p.data.copy_(e)
                e.copy_(tmp)
    log = StepLog(os.path.join(out, "loss_log.db")) if main0 else None
    if val_idx:
        say(f"held out: {len(val_idx)} of {len(items)} tracks, measured at every save" +
            (f"; the run stops after {cfg['patience']} saves with no held-out flow {cfg['min_delta'] * 100:g} % lower than the best" if cfg["patience"] > 0 else ""))
    if weights:                                           # HERESY 1662
        say(f"weights: {len(weights)} tracks more than once (" + ", ".join(f"×{n} {sum(1 for v in weights.values() if v == n)}" for n in sorted(set(weights.values()), reverse=True)) +
            f"); an epoch is {len(order)} tracks")
    if items and isinstance(items[0], LazyTrack):
        say(f"latents read when a track is taken, not held: {len(items)} tracks")
    say(f"{len(items)} tracks · rank {rank_said} · {cfg['steps']} steps · ready in {time.time() - t0:.0f} s · " +
        (f"VRAM {torch.cuda.memory_allocated() / 2**30:.1f} GB" if dev.startswith("cuda") else "on " + dev))
    if batch > 1 or ema is not None or not ckpt_on:
        say(f"cards {world} · {accum} track(s) a card a step: {batch} a step, lr {lr:.2e}" + (f" (× √{batch})" if lr != cfg["lr"] else "") +
            (f" · saves the moving average over {float(cfg['ema_epochs']):g} epoch ({steps_per_epoch} steps, decay {ema_decay:.4f})" if ema is not None else "") +
            (" · gradient checkpointing off while the card has room" if not ckpt_on else ""))
    names, epoch_seed = [], cfg["seed"]
    train_ar, kl_on = cfg["ar_loss_weight"] > 0, cfg["ar_kl_weight"] > 0
    if no_ar and train_ar:
        say(f"{sum(1 for it in items if it[0] in no_ar)} of {len(items)} tracks without the AR's lesson (no_ar in dataset.json): the NAR's only")
    MEASURES = ["loss/loss", "loss/flow", "score/sheet", "loss/ar_ce", "loss/ar_kl"] + ["loss/ar_ce_" + v for v in SEP_W]   # the same on every card
    t_start, done_at_start = time.time(), step

    def take(n):                                          # the next n tracks in their epoch's order, the same on every card
        got = []
        while len(got) < n:
            if not names:
                names.extend(order)                       # HERESY 1662: weighted
                random.Random(epoch_seed + step + len(got)).shuffle(names)
            got.append(names.pop())
        return got

    def save(at):
        path = os.path.join(out, f"{run}_{at:09d}.safetensors")
        meta = {"name": run, "studio": "Ruach Studio", "trainer": "ruach", "step": str(at), "rank": str(max(ranks.values())), "rank_ar": str(ranks["ar"]), "rank_nar": str(ranks["nar"]), "format": "pt"}
        if ema is not None:
            save_file(state_dict(loras), rpath, metadata=dict(meta, raw="1"))
            swap()
            save_file(state_dict(loras), path, metadata=dict(meta, ema=f"{ema_decay:.5f}"))
            swap()
        else:
            save_file(state_dict(loras), path, metadata=meta)
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
        # the measure at a save, kept (val.json, loss_log.db's val/…) and said; True when the run should stop. HERESY 1631: on the
        # average, the weights the save holds
        if ema is not None:
            swap()
        try:
            f, c = evaluate()
        finally:
            if ema is not None:
                swap()
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

    # HERESY 1622 (Viktor 20.10.2026: «Это правильный ход с заморозкой AR после плато и дообучением. Внедряй в пайплайн»): at the plateau
    # a run whose AR trained goes on with the sound half alone: the AR of the save with the lowest held-out ar_ce stands still (its weights,
    # lr 0, no AR loss), the NAR from the best held-out flow with a fresh optimizer, nar_phase_patience saves at nar_phase_min_delta, up to
    # nar_phase_epochs more epochs, in the same run (val.json says the phase). HERESY 1631: planned by the first card (phase_plan: None when
    # there is no such phase to go into), gone into by every card (phase_in)
    def phase_plan(at):
        hist = [h for h in val.get("history", []) if h.get("ar_ce") is not None]
        if cfg["nar_phase_epochs"] <= 0 or not train_ar or not hist or val.get("phase") or not val.get("best"):
            return None
        a, b = min(hist, key=lambda h: h["ar_ce"]), val["best"]
        pa, pb = (os.path.join(out, f"{run}_{x:09d}.safetensors") for x in (a["step"], b["step"]))
        if not (os.path.isfile(pa) and os.path.isfile(pb)):
            print(f"the sound half's phase left out: no checkpoint of step {a['step']} or {b['step']}", flush=True)
            return None
        ph = {"from": at, "ar_step": a["step"], "ar_ce": a["ar_ce"], "nar_step": b["step"], "flow": b["flow"], "until": at + int(cfg["steps_per_epoch"] or cfg["save_every"]) * cfg["nar_phase_epochs"]}   # HERESY 1662: epochs, not saves
        val.pop("stopped", None)
        val["since_best"] = 0
        val["phase"] = ph
        json.dump(val, open(vpath, "w", encoding="utf-8"), indent=1)
        print(f"the sound half goes on alone from step {at}: the AR of step {a['step']} (lowest held-out ar_ce {a['ar_ce']}) stands still, "
              f"the NAR from step {b['step']} (best held-out flow {b['flow']}); {cfg['nar_phase_patience']} saves at {cfg['nar_phase_min_delta'] * 100:g} %, "
              f"up to step {ph['until']}", flush=True)
        return ph

    def phase_in(ph):
        nonlocal opt, train_ar, kl_on, ema
        pa, pb = (os.path.join(out, f"{run}_{x:09d}.safetensors") for x in (ph["ar_step"], ph["nar_step"]))
        both = {k: v for k, v in load_file(pb).items() if k.startswith("diffusion_model.")}
        both.update({k: v for k, v in load_file(pa).items() if k.startswith("text_encoders.")})
        load_into(loras, both)
        opt = adamw(0.0)
        train_ar = kl_on = False
        cfg.update(ar_loss_weight=0.0, ar_kl_weight=0.0, ar_lr_multiplier=0.0, patience=cfg["nar_phase_patience"], min_delta=cfg["nar_phase_min_delta"],
                   steps=ph["until"])
        if ema is not None:                               # the average starts again from the weights it goes on with
            ema = [hold(p) for p in ar_p + nar_p]

    def micro(i):
        """one track's forward and backward, its gradients 1/accum of the step's; its measures"""
        name, _cap, latent, tokens = items[i]
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
        if train_ar and name not in no_ar:                  # HERESY 1643: a track without the AR's lesson
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
        (loss / accum).backward()
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
                (part / accum).backward()
                total_loss += part.item()
                stem_ce[v] = s_ce.item()
                del s_embeds, s_ids, s_ce, s_kl, part
        values = {"loss/loss": total_loss, "loss/flow": flow.item()}    # loss/loss is the whole sum, as AI-Toolkit logs it
        if abcs:
            values["score/sheet"] = 1.0 if sheet is not None else 0.0        # HERESY 1420: which prompt the step had
        if ce is not None:
            values["loss/ar_ce"] = ce.item()
        if kl is not None:
            values["loss/ar_kl"] = (kl.item() + sum(stem_kl)) / (1 + len(stem_kl))   # HERESY 1422: the mean of the three, as AI-Toolkit logs it
        for v, x in stem_ce.items():
            values["loss/ar_ce_" + v] = x
        return values

    saved_at = step
    try:
        while step < cfg["steps"]:
            mine = take(batch)[rank_id * accum:(rank_id + 1) * accum]   # HERESY 1631: this card's share of the step's tracks
            while True:
                opt.zero_grad(set_to_none=True)
                short = False
                try:
                    got = [micro(i) for i in mine]
                except torch.cuda.OutOfMemoryError:
                    if ckpt_on:
                        raise
                    short = True
                if not short:
                    break
                ckpt_on = True                                # HERESY 1631: no room without it: on for the rest of the run, the step again
                model.enable_gradient_checkpointing()
                opt.zero_grad(set_to_none=True)
                torch.cuda.empty_cache()
                print(f"[card {rank_id}] out of memory without gradient checkpointing at step {step}: on from now, the step again", flush=True)
            # HERESY 1643: each measure the mean over the tracks that have it; the AR's gradient the mean over the tracks that took its lesson
            sums, counts = {}, {}
            for v in got:
                for k, x in v.items():
                    sums[k], counts[k] = sums.get(k, 0.0) + x, counts.get(k, 0) + 1
            n_ar = sum(1 for v in got if "loss/ar_ce" in v)
            if dist:                                          # the cards' gradients and measures averaged
                if train_ar:                                  # a card with no AR lesson this step sends zeros, so every card sends the same
                    for p in ar_p:
                        if p.grad is None:
                            p.grad = torch.zeros_like(p)
                grads = [p.grad for p in ar_p + nar_p if p.grad is not None]
                for wk in [dist.all_reduce(g, async_op=True) for g in grads]:
                    wk.wait()
                for g in grads:
                    g.div_(world)
                keys = MEASURES                               # every measure a track can give (micro); the same list on every card
                both = torch.tensor([sums.get(k, 0.0) for k in keys] + [float(counts.get(k, 0)) for k in keys] + [float(n_ar)], device=dev, dtype=torch.float64)
                dist.all_reduce(both)
                both = both.tolist()
                sums = {k: both[i] for i, k in enumerate(keys)}
                counts = {k: both[len(keys) + i] for i, k in enumerate(keys)}
                n_ar = int(round(both[-1]))
            values = {k: sums[k] / counts[k] for k in sums if counts.get(k)}
            if train_ar and n_ar < batch:                     # the AR's mean over its own tracks; none this step: the AR stays as it was
                for p in ar_p:
                    if p.grad is not None:
                        if n_ar:
                            p.grad.mul_(batch / n_ar)
                        else:
                            p.grad = None
            torch.nn.utils.clip_grad_norm_(ar_p + nar_p, cfg["max_grad_norm"])
            # HERESY 1752: the rate from the config at every step (a run gone on from a save used to keep optimizer.pt's), with its tail
            lr_now = tail_lr(lr, step, cfg["steps"], tail_start(cfg), min(1.0, max(0.0, float(cfg.get("lr_tail_floor") or 0.0))))
            opt.param_groups[0]["lr"] = lr_now
            opt.param_groups[1]["lr"] = lr_now * cfg["ar_lr_multiplier"]
            opt.step()
            if ema is not None:
                ema_update()
            prev, step = step, step + batch
            if main0:
                log.log(step, values)
                el = time.time() - t_start
                per = el / max(1, step - done_at_start)
                shown = min(step, cfg["steps"])
                eta = per * max(0, cfg["steps"] - step)
                print(f"{run}: {100 * shown // cfg['steps']:3d}%| {shown}/{cfg['steps']} [{int(el // 60):02d}:{int(el % 60):02d}<{int(eta // 3600)}:{int(eta % 3600 // 60):02d}:{int(eta % 60):02d}, "
                      f"{per:.2f}s/it, lr: {lr_now:.1e} loss: {values['loss/loss']:.3e}]", flush=True)   # HERESY 1752: the rate this step used
            if step // cfg["save_every"] > prev // cfg["save_every"] or step >= cfg["steps"]:
                at = cfg["steps"] if step >= cfg["steps"] else step - step % cfg["save_every"]   # a save at its epoch's own number
                if main0:
                    save(at)
                saved_at = step
                stop, ph = False, None
                if val_idx:
                    if main0:
                        stop = held_out(at)                   # HERESY 1497: the early stop
                        if stop:
                            ph = phase_plan(at)               # HERESY 1622: or the sound half on alone
                    if dist:
                        box = [stop, ph]
                        dist.broadcast_object_list(box, 0)
                        stop, ph = box
                    if stop:
                        if ph:
                            phase_in(ph)
                            continue
                        if main0:
                            print(f"early stop at step {at}: {val['stopped']['why']}; the best held-out is step {val['best']['step']}", flush=True)
                        break
    except KeyboardInterrupt:                         # Stop (SIGINT from the lab): keep what was learned, as AI-Toolkit does
        if main0 and step > saved_at:
            save(step)
        say(f"stopped at step {step}; saved")
    if main0:
        final = os.path.join(out, f"{run}.safetensors")
        if ema is not None:
            swap()
        save_file(state_dict(loras), final, metadata=dict({"name": run, "studio": "Ruach Studio", "trainer": "ruach"}, **({"ema": f"{ema_decay:.5f}"} if ema is not None else {})))
        if ema is not None:
            swap()
        log.commit()
        peak = f" · VRAM peak {torch.cuda.max_memory_allocated() / 2**30:.1f} GB" if dev.startswith("cuda") else ""
        print(f"done: {step} steps in {(time.time() - t_start) / 60:.0f} min{peak}", flush=True)
    if dist:
        if os.environ.get("RUACH_DDP_CHECK"):             # every card's adapter the same: a sum of its weights, said by each
            with torch.no_grad():
                print(f"[card {rank_id}] adapter sum {sum(float(p.double().sum()) for p in ar_p + nar_p):.10e}", flush=True)
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
