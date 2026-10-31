"""HERESY 1868 · 1870 (Viktor 29.10.2026: «мне нужна реальная DDiT генерация живого видеоклипа, а не просто слайдшоу»; «Наша Студия
абсолютно автономная и эргономная»): the Videographer's H3 worker. One process a card, run in the Artist's environment (.venv-art) on the
studio's own runtime (lab/h3rt), MiniMax H3 loaded once from models/minimax-h3 and kept while shots come: the lab drops a job as JSON into
the card's spool folder, the worker takes it (renamed .run), makes it the take's shot video and leaves .done (or .failed) beside it with its
times. Its state (loading, ready, busy with the step it is at, gone) is in the spool's worker.json. It leaves the card when no job has come
for a while (--idle), so the card is free for the other rooms.
A job: {"prompt", "seconds", "width", "height", "steps", "seed", "first" (a picture for the first frame, FL2VA), "out" (an .mp4)}.
    .venv-art/bin/python lab/h3_worker.py --gpu 1 --spool user/videos/.h3/gpu1-h3 [--partition fl2va_pruned] [--offload 0.7] [--idle 600] [--fast]"""
import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
H3 = KIT / "models/minimax-h3"
FPS = 24

ap = argparse.ArgumentParser()
ap.add_argument("--gpu", type=int, required=True)
ap.add_argument("--spool", required=True)
ap.add_argument("--partition", default="fl2va_pruned")
ap.add_argument("--offload", type=float, default=0.7)
ap.add_argument("--idle", type=float, default=600)
ap.add_argument("--fast", action="store_true")                # FastH3 (FastVideo, 8 steps on its trained ladder, VSA, text alone)
a = ap.parse_args()

spool = Path(a.spool)
spool.mkdir(parents=True, exist_ok=True)
state = spool / "worker.json"


def say(**kw):
    tmp = state.with_suffix(".part")
    tmp.write_text(json.dumps(dict(kw, pid=os.getpid(), gpu=a.gpu, at=time.time())), encoding="utf-8")
    tmp.replace(state)


os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"
os.environ["CUDA_VISIBLE_DEVICES"] = str(a.gpu)                 # its own card alone: Triton's kernels launch on the current device (cuda:1 failed so)
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
sys.path.insert(0, str(HERE))                                   # lab/, for h3rt
say(status="loading")
try:
    import torch  # noqa: E402
    from h3rt.runtime import H3 as Runtime  # noqa: E402
    dev = "cuda:0"                                       # the card --gpu names, the only one it sees
    t0 = time.time()
    # the shipped quantization kept (int8 ConvRot, nvfp4); most of the DiT's blocks streamed from RAM, the encoder through the same card layer by
    # layer: measured 29.10 on a 3090, a peak of 15 GB at 832×480
    h3 = Runtime(H3, fast=a.fast, partition=a.partition, device=dev, offload=a.offload, status=lambda s: print(s, flush=True)).load()
    load_s = round(time.time() - t0)
except Exception as e:  # noqa: BLE001
    say(status="failed", error=f"{type(e).__name__}: {e}"[:600])
    raise

say(status="ready", load_s=load_s)
last = time.time()
while True:
    jobs = sorted(spool.glob("*.json"), key=lambda p: p.stat().st_mtime)
    jobs = [j for j in jobs if j.name != "worker.json"]
    if not jobs:
        if time.time() - last > a.idle:
            say(status="gone", why="idle")
            break
        time.sleep(1.5)
        continue
    job = jobs[0]
    run = job.with_suffix(".run")
    try:
        job.replace(run)
    except OSError:
        continue                                            # taken by another
    spec = json.loads(run.read_text(encoding="utf-8"))
    say(status="busy", job=run.stem, load_s=load_s)
    h3.sample_step_hook = lambda i, n, stem=run.stem: say(status="busy", job=stem, step=i, steps=n, load_s=load_s)
    t1 = time.time()
    try:
        secs = max(4.0, min(15.0, float(spec.get("seconds") or 4)))
        frames = 17 * max(1, -(-(int(round(secs * FPS)) - 5) // 17)) + 5   # H3's grid of 17n+5 frames, at least the shot's length (cut to it later)
        out = Path(spec["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        part = out.with_suffix(".part.mp4")
        torch.cuda.reset_peak_memory_stats(dev)
        h3.shoot(str(spec["prompt"]), part, width=int(spec.get("width") or 1344), height=int(spec.get("height") or 768), frames=frames,
                 steps=int(spec.get("steps") or 28), seed=int(spec.get("seed") or 1), first=None if a.fast else (spec.get("first") or None))
        part.replace(out)
        done = dict(spec, status="done", seconds_made=round((frames - 1) / FPS, 3), took_s=round(time.time() - t1, 1),
                    peak_gb=round(torch.cuda.max_memory_allocated(dev) / 2**30, 2), gpu=a.gpu)
        run.with_suffix(".done").write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        run.with_suffix(".failed").write_text(json.dumps(dict(spec, status="failed", error=f"{type(e).__name__}: {e}"[:600],
                                                               trace=traceback.format_exc()[-1500:]), ensure_ascii=False), encoding="utf-8")
        if isinstance(e, torch.OutOfMemoryError) or "CUDA" in str(e):   # a CUDA error spoils the process (an «unknown error» came after an OOM, 29.10):
            run.unlink(missing_ok=True)                            # it leaves, and the next shot starts a fresh worker
            say(status="gone", why="cuda: " + str(e)[:200])
            break
    run.unlink(missing_ok=True)
    h3.sample_step_hook = None
    last = time.time()
    say(status="ready", load_s=load_s)
