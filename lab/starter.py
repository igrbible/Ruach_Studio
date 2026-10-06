"""HERESY 1100: the trainer's starter sets (Viktor, 02.10.2026: "чтобы человек мог начать экспериментировать, а не
биться головой об стену"). GTSinger joined into songs by gtsinger.py, Russian and English, a 100 MB slice of each and
the whole, kept on Hugging Face (goldhub/Ruach_Studio_Starter_Sets, CC BY-NC-SA 4.0 like GTSinger itself).

Fetched only on the user's word, after the page has shown the size and the terms. Into tmp/starter/ first and into
datasets/raw/NAME only when whole, so the Material step never lists half a set. A failure is said with hf's own
words, never shown as an empty list.

    GET  /train/starter            the sets, which are in datasets/raw/, what is downloading
    POST /train/starter {name}     fetch one"""
import os, shutil, subprocess, threading, time
from pathlib import Path

REPO = "goldhub/Ruach_Studio_Starter_Sets"
TERMS = "GTSinger, CC BY-NC-SA 4.0: attribution, non-commercial, share-alike; an adapter trained on it carries the same terms"
SETS = [
    {"name": "GTSinger-RU-sample", "what": "Russian · female alto · a slice: plain singing first, every song heard", "tracks": 10, "bytes": 99805765},
    {"name": "GTSinger-EN-sample", "what": "English · male tenor · a slice: plain singing first, every song heard", "tracks": 7, "bytes": 96636592},
    {"name": "GTSinger-RU", "what": "Russian · female alto · the whole set", "tracks": 148, "bytes": 2304798797},
    {"name": "GTSinger-EN", "what": "English · two female altos and a male tenor · the whole set", "tracks": 514, "bytes": 6962888411},
]
JOBS = {}
LOCK = threading.Lock()


def _stage(kit):
    return kit / "tmp" / "starter"


def _size(*dirs):
    return sum(f.stat().st_size for d in dirs if d.is_dir() for f in d.rglob("*") if f.is_file())


def _revision(kit):
    """The pin in tools/hf-revisions.txt, when the release has set one; until then the main branch."""
    pins = kit / "tools" / "hf-revisions.txt"
    for line in pins.read_text(encoding="utf-8").splitlines() if pins.is_file() else []:
        parts = line.split()
        if len(parts) >= 2 and parts[0] == REPO:
            return parts[1]
    return ""


def listing(kit):
    raw, stage = kit / "datasets" / "raw", _stage(kit)
    out = []
    for s in SETS:
        item = dict(s, present=(raw / s["name"]).is_dir())
        job = JOBS.get(s["name"])
        if job:
            item["job"] = {k: job[k] for k in ("status", "started", "error") if k in job}
            if job["status"] == "running":
                item["job"]["got"] = _size(stage / s["name"], stage / ".cache" / "huggingface" / "download" / s["name"])
        out.append(item)
    return {"repo": REPO, "terms": TERMS, "sets": out}


def fetch(kit, name):
    s = next((x for x in SETS if x["name"] == name), None)
    if not s:
        raise ValueError(f"no starter set named {name}")
    if (kit / "datasets" / "raw" / name).is_dir():
        raise ValueError(f"{name} is already in datasets/raw/")
    with LOCK:
        if JOBS.get(name, {}).get("status") == "running":
            return listing(kit)
        JOBS[name] = {"status": "running", "started": time.time()}
    threading.Thread(target=_run, args=(kit, s), daemon=True).start()
    return listing(kit)


def _run(kit, s):
    stage, name = _stage(kit), s["name"]
    stage.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, HF_HOME=str(kit / "tmp" / "hf"), HF_HUB_DISABLE_TELEMETRY="1")
    token = Path.home() / ".cache" / "huggingface" / "token"     # private until the release: the owner's own token
    if "HF_TOKEN" not in env and token.is_file():
        env["HF_TOKEN_PATH"] = str(token)
    cmd = [str(kit / ".venv" / "bin" / "hf"), "download", REPO, "--repo-type", "dataset",
           "--include", name + "/*", "--local-dir", str(stage)]
    rev = _revision(kit)
    if rev:
        cmd += ["--revision", rev]
    try:
        r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=6 * 3600)
        got = stage / name
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else f"hf exited {r.returncode}")
        wavs = len(list(got.glob("*.wav"))) if got.is_dir() else 0
        if wavs != s["tracks"]:
            raise RuntimeError(f"{wavs} of {s['tracks']} tracks arrived; nothing was put into datasets/raw/")
        dst = kit / "datasets" / "raw" / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(got), str(dst))
        JOBS[name].update(status="done")
    except (OSError, RuntimeError, subprocess.SubprocessError) as e:
        JOBS[name].update(status="failed", error=str(e))
