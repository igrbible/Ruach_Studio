"""HERESY 1289 (Viktor 10.10.2026: «И нужно в Engine добавить докачку моделей и LoRA»): the Engine's Models card over
heresy/fetch-heresy.sh, the one list of what the studio needs beside itself: its pins, its sizes checked file by file, a
download cut short going on from where it stopped, a second try after half a minute. The lab runs it and keeps its words.

    GET  /weights               the last whole run's verdicts, part by part (the install's own run too: fetch-heresy.sh keeps
                                them in tmp/fetch-heresy.list), the extras here or not, a run under way and its words
    POST /weights/check         fetch-heresy.sh --check: what is here and what is missing; nothing is downloaded
    POST /weights/fetch {…}     one run at a time, on the user's word (the page has said the size): {"part": "missing"}
                                everything the install brings that is not here, {"part": "loras"} one part of it, or one
                                extra: {"backbone": "BF16"}, {"listener": "Q8_0"}, {"artwork": "q4"}, {"trainer": "int8"}

A test page (?scope=…) checks but fetches nothing: the lab refuses. New LoRAs reach the engine at once; new backbones,
decoders and sliders at its next start (it reads them when it starts), which the card says."""
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

# what the install brings, part by part (fetch-heresy.sh --only NAME): what a fetch of the whole part takes, measured on the
# Forge 10.10.2026 (HERESY 1290: the extras come converted, from goldhub/Ruach_Studio_Models_v2: nothing is made here any more)
PARTS = {"extras": "1.3 GB", "whisper": "2.9 GB", "stems": "0.9 GB", "upscale": "0.2 GB", "loras": "2.1 GB"}

OMNI = "checkpoints/Qwen2.5-Omni-7B-GGUF/"
PROJ = OMNI + "mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"
MUSE = "artwork/Krea-2-Muse/museByStableYogi_v35{}Extended.gguf"
KREA = ["artwork/Krea-2-Turbo/text_encoder/model.safetensors", "artwork/Krea-2-Turbo/vae/diffusion_pytorch_model.safetensors",
        "artwork/nsfw-filter/model.safetensors", "artwork/Qwen3-4B-Instruct-2507/config.json"]
# the extras, each only when asked for, with fetch-heresy.sh's own sizes and notes; a variant is here when all its files are
EXTRAS = [
    {"name": "backbone", "label": "Backbone", "restart": True,
     "what": "M-A-P's YuE2 as GGUF (Serveurperso/YuE2-GGUF): Compute chooses between those here",
     "variants": [
         {"id": "BF16", "size": "7.2 GB", "note": "the whole model; on a card older than Ampere (an RTX 20xx, a Quadro RTX) it runs without its tensor cores, slower than Q8_0",
          "files": ["models/YuE2-3B-BF16.gguf"]},
         {"id": "Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-Q8_0.gguf"]},
         {"id": "Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-Q6_K.gguf"]},
         {"id": "Q5_K_M", "size": "2.6 GB", "files": ["models/YuE2-3B-Q5_K_M.gguf"]}]},
    {"name": "listener", "label": "Style listener",
     "what": "Qwen2.5-Omni-7B: hears the songs of a training set and writes each one's style tags; the GGUF ones run through llama.cpp (vendor/llama.cpp, built by you)",
     "variants": [
         {"id": "Q8_0", "size": "9.6 GB", "note": "10.3 GB of VRAM when it listens", "files": [OMNI + "Qwen2.5-Omni-7B-Q8_0.gguf", PROJ]},
         {"id": "Q5_K_M", "size": "6.9 GB", "note": "8.0 GB of VRAM when it listens", "files": [OMNI + "unsloth/Qwen2.5-Omni-7B-Q5_K_M.gguf", PROJ]},
         {"id": "Q4_K_M", "size": "6.2 GB", "note": "7.3 GB of VRAM when it listens", "files": [OMNI + "Qwen2.5-Omni-7B-Q4_K_M.gguf", PROJ]},
         {"id": "bf16", "size": "22 GB", "note": "18.3 GB of VRAM when it listens: a 24 GB card",
          "files": ["checkpoints/Qwen2.5-Omni-7B/model.safetensors.index.json"]}]},
    None,   # the artwork's, by the biggest card here (below)
    {"name": "trainer", "label": "LoRA trainer's base",
     "what": "Comfy-Org/YuE2 for the Trainer, with Mothersuperior's tokenizer head (MERT-v2 comes with the Kit's tools/download-checkpoints.sh)",
     "variants": [
         {"id": "bf16", "size": "7.8 GB", "note": "trains on unquantized weights", "files": ["checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors"]},
         {"id": "int8", "size": "4.0 GB", "note": "for a smaller card", "files": ["checkpoints/comfy/checkpoints/yue2_3b_int8_convrot.safetensors"]}]},
]
ARTWORK_BIG = {"name": "artwork", "label": "Artwork",
               "what": "the Artist's painter: Krea 2 Muse by Stable Yogi with Krea 2's text encoder and VAE, the content filter its licence asks for, and the prompt writer (Qwen3-4B)",
               "variants": [
                   {"id": "q4", "label": "Krea 2 Muse Q4", "size": "26 GB", "note": "less when some of it is here", "files": [MUSE.format("Q4")] + KREA},
                   {"id": "q8", "label": "Krea 2 Muse Q4 and Q8", "size": "41 GB", "note": "less when some of it is here",
                    "files": [MUSE.format("Q4"), MUSE.format("Q8")] + KREA}]}
ARTWORK_SMALL = {"name": "artwork", "label": "Artwork",
                 "what": "the Artist's painter (no card here has the 16 GB Krea 2 wants): SDXL CyberRealistic, and the prompt writer (Qwen3-4B)",
                 "variants": [
                     {"id": "sdxl", "label": "SDXL CyberRealistic", "size": "14 GB", "note": "a 16 GB card when it draws",
                      "files": ["artwork/CyberRealistic-XL-v10/model_index.json", "artwork/CyberRealistic-XL-v10/unet/diffusion_pytorch_model.safetensors",
                                "artwork/Qwen3-4B-Instruct-2507/config.json"]}]}

LINE = re.compile(r"^(here|differs|missing|fetched|unknown|failed)\s+(.*)$")
SUM = re.compile(r"^here (\d+) · unknown (\d+) · differs (\d+) · fetched (\d+) · missing (\d+) · failed (\d+)$")
JOB = {}
LOCK = threading.Lock()
_BIG = []


def _biggest_card_mb():
    """The biggest card's memory, as fetch-heresy.sh --artwork judges it (0 without nvidia-smi); asked once."""
    if not _BIG:
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=20).stdout
            _BIG.append(max([int(x) for x in out.split() if x.strip().isdigit()] or [0]))
        except (OSError, subprocess.SubprocessError):
            _BIG.append(0)
    return _BIG[0]


def _here(kit, files):
    for rel in files:
        f = kit / rel
        try:
            if not f.is_file() or f.stat().st_size == 0:
                return False
            if rel.endswith(".safetensors.index.json"):          # every shard its index names
                shards = set(json.loads(f.read_text(encoding="utf-8")).get("weight_map", {}).values())
                if not shards or any(not (f.parent / s).is_file() or (f.parent / s).stat().st_size == 0 for s in shards):
                    return False
        except (OSError, ValueError):
            return False
    return True


def _extras(kit):
    out = []
    for e in EXTRAS:
        e = e or (ARTWORK_BIG if _biggest_card_mb() >= 16000 else ARTWORK_SMALL)
        out.append(dict({k: v for k, v in e.items() if k != "variants"},
                        variants=[dict({k: v for k, v in x.items() if k != "files"}, here=_here(kit, x["files"])) for x in e["variants"]]))
    return out


def _strip(kit, text):
    for root in {str(kit), os.path.realpath(kit)}:
        text = text.replace(root + "/", "")
    return text


def _last_run(kit):
    """The last whole run's verdicts (tmp/fetch-heresy.list): parts, each with its rows; None before the first."""
    f = kit / "tmp" / "fetch-heresy.list"
    try:
        lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    parts, counts, mode, at, cur = [], None, "", int(f.stat().st_mtime), None
    for line in lines:
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        st, what, words = cols[0], _strip(kit, cols[1]), _strip(kit, cols[2])
        if st == "##":
            cur = {"part": what, "label": words, "size": PARTS.get(what, ""), "rows": []}
            parts.append(cur)
        elif st == "#sum":
            n = what.split()
            if len(n) == 6:
                counts = dict(zip(("here", "unknown", "differs", "fetched", "missing", "failed"), map(int, n)))
            m = words.split()
            mode, at = (m[0] if m else ""), (int(m[1]) if len(m) > 1 and m[1].isdigit() else at)
        elif cur is not None:
            cur["rows"].append({"state": st, "text": (what + " " + words).strip()})
    return {"parts": parts, "counts": counts, "mode": mode, "at": at}


def _free(kit):
    try:
        st = os.statvfs(kit)
        return st.f_bavail * st.f_frsize
    except OSError:
        return None


def _job_view(kit):
    with LOCK:
        if not JOB:
            return None
        j = {k: v for k, v in JOB.items() if k not in ("lines", "free0")}
        j["lines"] = JOB["lines"][-200:]
        if JOB["status"] == "running" and JOB.get("free0") is not None:
            now = _free(kit)
            j["written"] = max(0, JOB["free0"] - now) if now is not None else None   # the disk's free room it took so far
    return j


def listing(kit):
    script = kit / "heresy" / "fetch-heresy.sh"
    return {"script": script.is_file(), "last": _last_run(kit), "extras": _extras(kit), "parts": PARTS,
            "job": _job_view(kit), "now": int(time.time())}


def running():
    with LOCK:
        return bool(JOB) and JOB.get("status") == "running"


NAMES = {"extras": "the extra decoders and the sliders", "whisper": "Whisper", "stems": "the stems' models", "upscale": "UniverSR",
         "loras": "the LoRAs"}


def _args(body):
    """fetch-heresy.sh's arguments and the run's name for a POST /weights/fetch body; ValueError for anything else."""
    part = str(body.get("part", "") or "")
    if part == "missing":
        return [], "what is missing"
    if part in PARTS:
        return ["--only", part], NAMES[part]
    for e in EXTRAS:
        name = e["name"] if e else "artwork"
        v = body.get(name)
        if v is None:
            continue
        v = str(v)
        ids = [x["id"] for x in (e or ARTWORK_BIG)["variants"]] + ([] if e else ["sdxl"])
        if v not in ids:
            raise ValueError(f"{name} takes {', '.join(ids)}")
        x = (e or ARTWORK_BIG)["variants"] + ([] if e else ARTWORK_SMALL["variants"])
        label = (e or ARTWORK_BIG)["label"]
        what = "the " + label[0].lower() + label[1:] + " " + next((y.get("label") or y["id"] for y in x if y["id"] == v), v)
        if name == "artwork":
            return ["--only", "none", "--artwork-q8" if v == "q8" else "--artwork", "--yes"], what
        return ["--only", "none", "--" + name, v, "--yes"], what
    raise ValueError("say what to fetch: a part (missing, " + ", ".join(PARTS) + ") or an extra (backbone, listener, artwork, trainer)")


def _start(kit, args, what, kind, then_check):
    with LOCK:
        if JOB.get("status") == "running":
            raise ValueError(f"a run is under way ({JOB.get('what')}): one at a time")
        JOB.clear()
        JOB.update(kind=kind, what=what, args=args, status="running", started=time.time(), ended=None, rc=None, lines=[],
                   counts=None, restart=False, free0=_free(kit) if kind == "fetch" else None)
    threading.Thread(target=_run, args=(kit, args, then_check), daemon=True).start()
    return listing(kit)


def check(kit):
    if not (kit / "heresy" / "fetch-heresy.sh").is_file():
        raise FileNotFoundError("no heresy/fetch-heresy.sh in this tree")
    return _start(kit, ["--check"], "what is here", "check", False)


def fetch(kit, body, scope=""):
    if scope:
        raise ValueError("a test page fetches nothing: open the studio without ?scope= to fetch")
    if not (kit / "heresy" / "fetch-heresy.sh").is_file():
        raise FileNotFoundError("no heresy/fetch-heresy.sh in this tree")
    args, what = _args(body if isinstance(body, dict) else {})
    # a part fetched alone leaves the whole list as it was: a check after it says where everything stands
    return _start(kit, args, what, "fetch", bool(args and args[0] == "--only" and args[1] != "none"))


def _say(kit, args):
    """One run of fetch-heresy.sh into JOB["lines"]; its exit status (0: nothing failed)."""
    env = dict(os.environ, NO_COLOR="1", HF_HUB_DISABLE_TELEMETRY="1")
    p = subprocess.Popen(["bash", str(kit / "heresy" / "fetch-heresy.sh")] + args, cwd=str(kit), env=env, stdin=subprocess.DEVNULL,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        line = _strip(kit, line.rstrip("\n"))
        with LOCK:
            JOB["lines"].append(line)
            del JOB["lines"][:-1000]
            m = SUM.match(line)
            if m:
                JOB["counts"] = dict(zip(("here", "unknown", "differs", "fetched", "missing", "failed"), map(int, m.groups())))
            # a backbone, a decoder or the sliders: the engine reads those when it starts (LoRAs it reads each time)
            if JOB["kind"] == "fetch" and re.match(r"^fetched\s+(models/|legacy, blend and sliders)", line):
                JOB["restart"] = True
    return p.wait()


def _run(kit, args, then_check):
    try:
        rc = _say(kit, args)
        with LOCK:
            JOB["rc"] = rc
        if then_check:
            with LOCK:
                JOB["lines"].append("")
                JOB["lines"].append("— the check, after it —")
                JOB["checking"] = True
                counts = JOB["counts"]
            _say(kit, ["--check"])
            with LOCK:
                JOB["checking"] = False
                JOB["after"] = JOB["counts"]
                JOB["counts"] = counts
        with LOCK:
            JOB["status"] = "done" if rc == 0 else "failed"
    except (OSError, subprocess.SubprocessError) as e:
        with LOCK:
            JOB["lines"].append(f"failed: {e}")
            JOB["status"] = "failed"
    finally:
        with LOCK:
            JOB["ended"] = time.time()
