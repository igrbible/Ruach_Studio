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
from model import ABC_END, CODEC_OFFSET, MUSIC_END, MUSIC_START  # noqa: E402
from prompt import parse_caption, tokenizer_from_checkpoint  # noqa: E402

KIT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

DEFAULTS = {"steps": 1500, "rank": 32, "lr": 1e-4, "save_every": 250, "ar_loss_weight": 0.5, "ar_kl_weight": 0.2,
            "ar_lr_multiplier": 0.5, "train_window_frames": 1500, "seed": 42, "max_grad_norm": 1.0, "chunk": 512,
            "ar_max_tokens": 0}          # 0: the AR's loss over the whole song (AI-Toolkit's default); N: its first N tokens


class StepLog:
    """Every step into loss_log.db, the schema AI-Toolkit's UI logger writes (the run cards read it)."""
    def __init__(self, path):
        self.con = sqlite3.connect(path)
        self.con.execute("CREATE TABLE IF NOT EXISTS steps (step INTEGER PRIMARY KEY, wall_time REAL)")
        self.con.execute("CREATE TABLE IF NOT EXISTS metric_keys (key TEXT PRIMARY KEY, first_seen_step INTEGER, last_seen_step INTEGER)")
        self.con.execute("CREATE TABLE IF NOT EXISTS metrics (step INTEGER, key TEXT, value_real REAL, value_text TEXT, PRIMARY KEY (step, key))")
        self.con.commit()

    def log(self, step, values):
        self.con.execute("INSERT OR REPLACE INTO steps(step, wall_time) VALUES(?, ?)", (step, time.time()))
        for k, v in values.items():
            self.con.execute("INSERT OR REPLACE INTO metrics(step, key, value_real, value_text) VALUES(?, ?, ?, NULL)", (step, k, float(v)))
            self.con.execute("INSERT INTO metric_keys(key, first_seen_step, last_seen_step) VALUES(?, ?, ?) "
                             "ON CONFLICT(key) DO UPDATE SET last_seen_step = excluded.last_seen_step", (k, step, step))
        if step % 10 == 0:
            self.con.commit()


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
    lack = latent_cache.missing(cfg["dataset"])
    if lack:                                              # the set's cache first, then the model: never both on the card
        latent_cache.build(cfg["dataset"], cfg["checkpoint"], KIT, dev, lack)
    items = load_set(cfg["dataset"])
    tok = tokenizer_from_checkpoint(cfg["checkpoint"])
    heads = {it[0]: torch.tensor(tok.prefix_head_ids(**parse_caption(it[1]), cot="off"), dtype=torch.long) for it in items}
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
        log.con.commit()

    saved_at = step
    try:
        while step < cfg["steps"]:
            if not order:
                order = list(range(len(items)))
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
            head = model.ar.embed(heads[name].to(dev))
            song = tokens.to(dev).long()

            def inputs(tok_ids, end_token):
                parts = [torch.tensor([ABC_END, MUSIC_START], device=dev), tok_ids + CODEC_OFFSET]
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
            loss = flow
            if ce is not None:
                loss = loss + cfg["ar_loss_weight"] * ce
            if kl is not None:
                loss = loss + cfg["ar_kl_weight"] * kl
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(ar_p + nar_p, cfg["max_grad_norm"])
            opt.step()
            step += 1
            values = {"loss/loss": loss.item(), "loss/flow": flow.item()}    # loss/loss is the whole sum, as AI-Toolkit logs it
            if ce is not None:
                values["loss/ar_ce"] = ce.item()
            if kl is not None:
                values["loss/ar_kl"] = kl.item()
            log.log(step, values)
            el = time.time() - t_start
            per = el / max(1, step - done_at_start)
            eta = per * (cfg["steps"] - step)
            print(f"{run}: {100 * step // cfg['steps']:3d}%| {step}/{cfg['steps']} [{int(el // 60):02d}:{int(el % 60):02d}<{int(eta // 3600)}:{int(eta % 3600 // 60):02d}:{int(eta % 60):02d}, "
                  f"{per:.2f}s/it, lr: {cfg['lr']:.1e} loss: {values['loss/loss']:.3e}]", flush=True)
            if step % cfg["save_every"] == 0 or step == cfg["steps"]:
                save(step)
                saved_at = step
    except KeyboardInterrupt:                         # Stop (SIGINT from the lab): keep what was learned, as AI-Toolkit does
        if step > saved_at:
            save(step)
        print(f"stopped at step {step}; saved", flush=True)
    save_file(state_dict(loras), os.path.join(out, f"{run}.safetensors"), metadata={"name": run, "studio": "Ruach Studio", "trainer": "ruach"})
    log.con.commit()
    peak = f" · VRAM peak {torch.cuda.max_memory_allocated() / 2**30:.1f} GB" if dev == "cuda" else ""
    print(f"done: {step} steps in {(time.time() - t_start) / 60:.0f} min{peak}", flush=True)


if __name__ == "__main__":
    main()
