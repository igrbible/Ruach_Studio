"""HERESY 1868 (Viktor 29.10.2026: «мне нужна реальная DDiT генерация живого видеоклипа, а не просто слайдшоу»; «Забирай все GPUs»): the Videographer's
shots made alive by MiniMax H3. A shot asked for goes as a job into a card's spool (user/videos/.h3/gpuN-KIND/); a worker a card (lab/h3_worker.py in the
Artist's environment, on the studio's own runtime lab/h3rt since 1870) takes it, keeps H3 loaded while shots come and leaves the card when none has come for ten minutes. Both modes are H3 FL2VA with
the shot's picture as its first frame: «draft» at 8 steps and 832×480 (measured 29.10 on a 3090: 102 s, a peak of 15 GB, a clean picture), «final» at
28 steps and H3's own 768p; so one worker a card serves both. What a worker made is set into the shot by collect() (the lab's thread and every
status): the video in NAME.shots/, its first frame beside it for the timeline, the one before put off (kept). A shot whose times changed since it was
asked for keeps its video aside, not set."""
import json
import os
import random
import signal
import subprocess
import threading
import time
from pathlib import Path

import videographer as vg
from h3rt.files import needed as h3_needed

WORKER = Path(__file__).resolve().parent / "h3_worker.py"
MODES = {"draft": {"steps": 8, "fast": False}, "final": {"steps": 28, "fast": False}}   # 29.10: the Turbo LoRA through AI-Toolkit gave noise,
# FastH3 (fast: True, text alone) is past 24 GB at 768p; the base model at 8 steps keeps the shot's picture and fits
SIZES = {"final": {"16:9": (1344, 768), "9:16": (768, 1344), "1:1": (1024, 1024)},   # H3's own 768p
         "draft": {"16:9": (832, 480), "9:16": (480, 832), "1:1": (640, 640)}}
NEED_MB = 17000
LOCK = threading.Lock()


def _py(kit):
    return Path(os.environ.get("LAB_ART_PY") or Path(kit) / ".venv-art/bin/python")      # the Artist's environment (lab/install-venv.sh --art)


def ready(kit):
    """Whether shots can be made here: the Artist's environment and the H3 files (fetch-heresy.sh --h3 int8)."""
    missing = [str(p.relative_to(kit)) for p in h3_needed(Path(kit) / "models/minimax-h3") if not p.is_file()]
    if not _py(kit).is_file():
        missing.append(str(_py(kit)))
    return {"ready": not missing, "missing": missing}


def _root(kit):
    return Path(kit) / "user/videos/.h3"


def _kind(mode):
    """The model a mode needs: the modes of one kind share a card's worker (its spool gpuN-KIND)."""
    return "fast" if MODES[mode]["fast"] else "h3"


def _alive(sp):
    try:
        w = json.loads((sp / "worker.json").read_text(encoding="utf-8"))
        if int(w["pid"]) == 0:                              # just spawned: alive for two minutes while it loads
            return w if time.time() - float(w.get("at", 0)) < 120 else None
        os.kill(int(w["pid"]), 0)
    except (OSError, ValueError, KeyError):
        return None
    return w if w.get("status") in ("loading", "ready", "busy") else None


def workers(kit):
    out = []
    for sp in sorted(_root(kit).glob("gpu*-*")) if _root(kit).is_dir() else []:
        gpu, kind = sp.name[3:].split("-", 1)
        w = _alive(sp)
        if not w and kind not in {_kind(m) for m in MODES}:      # a spool of a kind gone (1868's gpuN-draft): its records kept, no worker
            continue
        out.append({"gpu": int(gpu), "kind": kind, "alive": bool(w), "status": (w or {}).get("status", "gone"), "queued": len([j for j in sp.glob("*.json") if j.name != "worker.json"]),
                    "running": len(list(sp.glob("*.run")))})
    return out


def _spawn(kit, gpu, mode):
    sp = _root(kit) / f"gpu{gpu}-{_kind(mode)}"
    sp.mkdir(parents=True, exist_ok=True)
    cmd = ["nice", "-n", "5", str(_py(kit)), "-u", str(WORKER), "--gpu", str(gpu), "--spool", str(sp), "--idle", "600"]
    if MODES[mode]["fast"]:
        cmd += ["--fast"]
    log = open(sp / "worker.log", "ab")
    subprocess.Popen(cmd, cwd=str(kit), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    (sp / "worker.json").write_text(json.dumps({"status": "loading", "pid": 0, "gpu": gpu, "at": time.time(), "spawned": True}), encoding="utf-8")


def shoot(kit, name, i, prompt, mode="draft", free_cards=(), seed=None, first=True, size="16:9"):
    """A shot into a card's queue: the card already running a worker of this mode's kind with the shortest queue, else a free card (its worker started)."""
    if mode not in MODES:
        raise ValueError("draft or final")
    r = ready(kit)
    if not r["ready"]:
        raise FileNotFoundError("MiniMax H3 is not here: " + ", ".join(r["missing"]) + " (heresy/fetch-heresy.sh --h3 int8)")
    plan = vg.get(kit, name)
    s = vg._shot_of(plan, i)
    prompt = str(prompt or "").strip()
    if not prompt:
        raise ValueError("no prompt for this shot: write its scene first")
    w, h = SIZES[mode].get(size, SIZES[mode]["16:9"])
    with LOCK:
        mine = [x for x in workers(kit) if x["alive"] and x["kind"] == _kind(mode)]
        cards = sorted(mine, key=lambda x: x["queued"] + x["running"])
        gpu = cards[0]["gpu"] if cards and (cards[0]["queued"] + cards[0]["running"] == 0 or not free_cards) else None
        busy = {x["gpu"] for x in workers(kit) if x["alive"]}
        fresh = [g for g in free_cards if g not in busy]
        if gpu is None and fresh:
            gpu = fresh[0]
            _spawn(kit, gpu, mode)
        if gpu is None and cards:
            gpu = cards[0]["gpu"]
        if gpu is None:
            raise RuntimeError("no card free for MiniMax H3 now: it needs about 17 GB of one card")
        sp = _root(kit) / f"gpu{gpu}-{_kind(mode)}"
        sp.mkdir(parents=True, exist_ok=True)
        now = time.time()
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + f"-{int(now * 1000) % 1000:03d}"
        out = vg.shots_dir(kit, name) / f"{stamp}-{i:03d}.mp4"
        pic = ""
        if first and s.get("frame"):
            try:
                pic = str(vg.frame_path(kit, name, s["frame"]))
            except (OSError, ValueError):
                pic = ""
        job = {"name": name, "i": i, "t0": s["t0"], "t1": s["t1"], "prompt": prompt, "seconds": round(max(4.0, min(15.0, s["t1"] - s["t0"])), 2),
               "width": w, "height": h, "steps": MODES[mode]["steps"], "seed": int(seed or random.randint(1000, 999999999)), "first": pic, "out": str(out),
               "mode": mode, "gpu": gpu, "queued": now}
        f = sp / f"{name}--{i:03d}--{stamp}.json"
        tmp = f.with_suffix(".part")
        tmp.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        tmp.replace(f)
    return dict(job, file=f.name)


def collect(kit):
    """What the workers made, set into their shots (a .done becomes .set; a shot whose times changed keeps its video aside: .aside)."""
    done = []
    for f in sorted(_root(kit).glob("gpu*-*/*.done")) if _root(kit).is_dir() else []:
        try:
            job = json.loads(f.read_text(encoding="utf-8"))
            vg.shot_video_set(kit, job["name"], job)
            f.replace(f.with_suffix(".set"))
            done.append(job["name"])
        except vg.Moved:
            f.replace(f.with_suffix(".aside"))
        except (OSError, ValueError, KeyError):
            f.replace(f.with_suffix(".bad"))
    return done


def status(kit, name):
    """A take's shots on their way: queued, running (with how long), failed (and why); and the workers."""
    collect(kit)
    jobs = []
    for sp in sorted(_root(kit).glob("gpu*-*")) if _root(kit).is_dir() else []:
        w = _alive(sp) or {}
        for f in sp.iterdir():
            if not f.name.startswith(name + "--") or f.suffix not in (".json", ".run", ".failed"):
                continue
            try:
                j = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            job = {"i": j.get("i"), "state": {".json": "queued", ".run": "running", ".failed": "failed"}[f.suffix], "mode": j.get("mode"),
                   "gpu": j.get("gpu"), "since": round(time.time() - (f.stat().st_mtime if f.suffix == ".run" else j.get("queued", time.time()))),
                   "error": j.get("error", ""), "file": f.name}
            if f.suffix == ".run" and w.get("job") == f.stem and w.get("steps"):      # HERESY 1870: the step it is at
                job.update(step=w.get("step"), steps=w.get("steps"))
            jobs.append(job)
    return {"name": name, "jobs": sorted(jobs, key=lambda j: (j["i"] or 0)), "workers": workers(kit), **ready(kit)}


def cancel(kit, name, i=None):
    """Queued shots of a take taken back (one, or all); a running one ends on its own."""
    n = 0
    for f in _root(kit).glob(f"gpu*-*/{name}--*.json") if _root(kit).is_dir() else []:
        if i is None or f.name.startswith(f"{name}--{int(i):03d}--"):
            f.unlink(missing_ok=True)
            n += 1
    return {"cancelled": n}


def stop_workers(kit):
    """The workers sent away now (their cards back): a running shot is lost."""
    n = 0
    for x in workers(kit):
        if x["alive"]:
            w = _alive(_root(kit) / f"gpu{x['gpu']}-{x['kind']}")
            try:
                os.killpg(os.getpgid(int(w["pid"])), signal.SIGTERM)
                n += 1
            except (OSError, ValueError, KeyError, TypeError):
                pass
    return {"stopped": n}


def collector(kit, every=10):
    while True:
        try:
            collect(kit)
        except Exception:  # noqa: BLE001 — the thread must not die of one odd file
            pass
        time.sleep(every)
