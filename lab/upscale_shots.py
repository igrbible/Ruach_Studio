"""HERESY 1876b (Viktor 29.10.2026: «если апскейлер на финал прикрутишь, то с ним сможем вытянуть клип и в 2-4K»; «SeedVR2 обе 3B и 7B просчитай по ресурсам
и прогони 7B на предмет на OOM под 24GB VRAM»): the Videographer's shots made larger by SeedVR2 (lab/seedvr2rt, models/seedvr2). The shots asked for are
dealt among the free cards (by their frames), one job a card: lab/upscale_job.py runs SeedVR2 once over the card's shots (the model loaded once, kept for
all of them) in the Artist's environment and leaves done.json; collect() sets each into its shot (NAME.shots/STEM-upRES.mp4, the shot's «video_up»), a
shot whose video changed meanwhile keeps it aside. 7B sharp with 16 of its blocks in RAM (20 GB of a card at 1080p, 21 at 1440p) or 3B (18.6 GB)."""
import json
import os
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path

import videographer as vg

HERE = Path(__file__).resolve().parent
RT = HERE / "seedvr2rt"
JOB = HERE / "upscale_job.py"
MODELS = {"7b": {"dit": "seedvr2_ema_7b_sharp_fp16.safetensors", "swap": 16, "label": "SeedVR2 7B sharp"},
          "3b": {"dit": "seedvr2_ema_3b_fp16.safetensors", "swap": 0, "label": "SeedVR2 3B"}}
RES = (1080, 1440)
NEED_MB = 21500                                   # measured 29.10: 7B sharp 19.7 GB at 1080p, 20.9 at 1440p, with room
LOCK = threading.Lock()


def _py(kit):
    return Path(os.environ.get("LAB_ART_PY") or Path(kit) / ".venv-art/bin/python")


def ready(kit, model="7b"):
    """Whether shots can be upscaled here with this model: its weights (fetch-heresy.sh --upscaler), the runtime and the Artist's environment."""
    m = MODELS.get(model) or MODELS["7b"]
    need = [Path(kit) / "models/seedvr2" / m["dit"], Path(kit) / "models/seedvr2/ema_vae_fp16.safetensors", RT / "inference_cli.py"]
    missing = [str(p.relative_to(kit)) if str(p).startswith(str(kit)) else str(p) for p in need if not p.is_file()]
    if not _py(kit).is_file():
        missing.append(str(_py(kit)))
    return {"ready": not missing, "missing": missing}


def _root(kit):
    return Path(kit) / "user/videos/.sr"


def _frames(p):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets",
                              "-of", "csv=p=0", str(p)], capture_output=True, text=True, timeout=60).stdout.strip()
        return int(out or 0)
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0


def _alive(jd):
    try:
        j = json.loads((jd / "job.json").read_text(encoding="utf-8"))
        os.kill(int(j.get("pid") or 0), 0)
        return int(j.get("pid") or 0) > 0 and not (jd / "done.json").is_file()
    except (OSError, ValueError):
        return False


def start(kit, name, shots, model="7b", res=1080, free_cards=()):
    """The shots asked for (their indices; those without a video left out), dealt among the free cards by their frames; a job a card."""
    if model not in MODELS or int(res) not in RES:
        raise ValueError("7b or 3b, 1080 or 1440")
    r = ready(kit, model)
    if not r["ready"]:
        raise FileNotFoundError("SeedVR2 is not here: " + ", ".join(r["missing"]) + " (heresy/fetch-heresy.sh --upscaler 7b)")
    plan = vg.get(kit, name)
    items = []
    for i in shots:
        s = vg._shot_of(plan, int(i))
        if not s.get("video"):
            continue
        src = vg.shot_video_path(kit, name, s["video"])
        items.append({"i": int(i), "video": s["video"], "t0": s["t0"], "t1": s["t1"], "frames": _frames(src), "src": str(src)})
    if not items:
        raise ValueError("no shot with a video of its own: shoot them with MiniMax H3 first")
    cards = list(free_cards)
    if not cards:
        raise RuntimeError("no card free for SeedVR2 now: it needs about 21 GB of one card")
    with LOCK:
        loads = {c: [] for c in cards}
        for it in sorted(items, key=lambda x: -x["frames"]):         # the longest first, each to the card with the fewest frames so far
            c = min(cards, key=lambda c: sum(x["frames"] for x in loads[c]))
            loads[c].append(it)
        jobs = []
        stamp = time.strftime("%Y%m%d-%H%M%S")
        for c, its in loads.items():
            if not its:
                continue
            jd = _root(kit) / f"{name}--{stamp}-gpu{c}"
            (jd / "in").mkdir(parents=True, exist_ok=True)
            (jd / "out").mkdir(exist_ok=True)
            for it in its:
                link = jd / "in" / f"{it['i']:03d}.mp4"
                if not link.exists():
                    link.symlink_to(it["src"])
            job = {"name": name, "model": model, "res": int(res), "gpu": c, "items": its, "queued": time.time(), "pid": 0}
            (jd / "job.json").write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
            log = open(jd / "log", "ab")
            p = subprocess.Popen(["nice", "-n", "5", str(_py(kit)), "-u", str(JOB), str(jd)], cwd=str(kit), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            job["pid"] = p.pid
            (jd / "job.json").write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
            jobs.append({"gpu": c, "shots": [x["i"] for x in its], "frames": sum(x["frames"] for x in its)})
    return {"jobs": jobs}


def collect(kit):
    """Finished jobs' videos set into their shots (STEM-upRES.mp4 beside the shot's video); a shot whose video changed keeps it aside."""
    done = []
    for jd in sorted(_root(kit).glob("*--*")) if _root(kit).is_dir() else []:
        if not (jd / "done.json").is_file() or (jd / "set.json").is_file():
            continue
        try:
            job = json.loads((jd / "job.json").read_text(encoding="utf-8"))
            fin = json.loads((jd / "done.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        set_, aside = [], []
        for it in job["items"]:
            out = jd / "out" / f"{it['i']:03d}.mp4"
            if not out.is_file():
                continue
            dest = vg.shots_dir(kit, job["name"]) / (Path(it["video"]).stem + f"-up{job['res']}.mp4")
            try:
                shutil.move(str(out), str(dest))
                vg.shot_up_set(kit, job["name"], it["video"], dest.name, {"model": MODELS[job["model"]]["label"], "res": job["res"], "took_s": fin.get("took_s"), "gpu": job["gpu"]})
                set_.append(it["i"])
            except vg.Moved:
                aside.append(it["i"])
            except (OSError, ValueError):
                aside.append(it["i"])
        (jd / "set.json").write_text(json.dumps({"set": set_, "aside": aside, "at": time.time()}), encoding="utf-8")
        done.append(job["name"])
    return done


def status(kit, name):
    """A take's upscales on their way: each job's card, its shots, how far it is (SeedVR2's batches) and how long it has run; what failed and why."""
    collect(kit)
    jobs = []
    for jd in sorted(_root(kit).glob(f"{name}--*")) if _root(kit).is_dir() else []:
        try:
            job = json.loads((jd / "job.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        fin = None
        try:
            fin = json.loads((jd / "done.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        if (jd / "set.json").is_file():
            continue
        state = "failed" if fin and fin.get("rc") else "done" if fin else "running" if _alive(jd) else "gone"
        made = len(list((jd / "out").glob("*.mp4"))) if (jd / "out").is_dir() else 0
        jobs.append({"gpu": job["gpu"], "shots": [x["i"] for x in job["items"]], "made": made, "model": job["model"], "res": job["res"], "state": state,
                     "since": round(time.time() - job.get("queued", time.time())), "error": (fin or {}).get("error", "")})
    return {"name": name, "jobs": jobs, "models": {k: ready(kit, k)["ready"] for k in MODELS}}


def cancel(kit, name):
    """A take's running upscales stopped (their cards back); what was made stays out of the shots."""
    n = 0
    for jd in _root(kit).glob(f"{name}--*") if _root(kit).is_dir() else []:
        if _alive(jd):
            try:
                j = json.loads((jd / "job.json").read_text(encoding="utf-8"))
                os.killpg(os.getpgid(int(j["pid"])), signal.SIGTERM)
                (jd / "done.json").write_text(json.dumps({"rc": -15, "error": "stopped"}), encoding="utf-8")
                n += 1
            except (OSError, ValueError, KeyError):
                pass
    return {"stopped": n}


def collector(kit, every=15):
    while True:
        try:
            collect(kit)
        except Exception:  # noqa: BLE001 — the thread must not die of one odd file
            pass
        time.sleep(every)
