"""HERESY 1091 (Viktor, 02.10.2026): which card does what. The studio's synthesis runs on one card (start.sh
reads it from here); training only on the cards given to training; the lab's other jobs (the listener,
Whisper, stems, remaster, upscale) only on theirs. While a run trains on the studio's own card, the page
does not start a synthesis: one card, one heavy job.

    user/gpus.json   {"studio": 0, "train": [1, 2], "jobs": [0, 1, 2]}

Defaults when the file is missing: the studio on GPU0; training on every other card, or on GPU0 too when
it is the only one (then synthesis waits while it trains); jobs on every card."""
import json
import os
import subprocess
from pathlib import Path


def path(kit):
    return Path(kit) / "user" / "gpus.json"


def indices(cards):
    return [c["index"] for c in cards] if isinstance(cards, list) else []


def defaults(cards):
    ids = indices(cards) or [0]
    studio = 0 if 0 in ids else ids[0]
    others = [i for i in ids if i != studio]
    return {"studio": studio, "train": others or [studio], "jobs": ids}


def load(kit, cards):
    roles = defaults(cards)
    try:
        saved = json.load(open(path(kit), encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    ids = indices(cards)
    if isinstance(saved.get("studio"), int) and (not ids or saved["studio"] in ids):
        roles["studio"] = saved["studio"]
    for role in ("train", "jobs"):
        if isinstance(saved.get(role), list):
            keep = [i for i in saved[role] if isinstance(i, int) and (not ids or i in ids)]
            if keep:
                roles[role] = keep
    return roles


def save(kit, data, cards):
    ids = indices(cards)
    studio = data.get("studio")
    if not isinstance(studio, int) or (ids and studio not in ids):
        raise ValueError(f"the studio needs one card of {ids}")
    out = {"studio": studio}
    for role in ("train", "jobs"):
        got = data.get(role)
        if not isinstance(got, list) or not got or any(not isinstance(i, int) or (ids and i not in ids) for i in got):
            raise ValueError(f"{role}: give it at least one card of {ids}")
        out[role] = sorted(set(got))
    path(kit).parent.mkdir(parents=True, exist_ok=True)
    tmp = path(kit).with_suffix(".json.part")
    tmp.write_text(json.dumps(out, indent=1), encoding="utf-8")
    os.replace(tmp, path(kit))
    return out


def studio_now():
    """The card the running studio computes on, or None when it is not running: GGML_BACKEND=CUDAn names it
    (HERESY 1109), an older start's CUDA_VISIBLE_DEVICES did; neither means the first card, the engine's own choice.
    The saved choice may wait for a restart."""
    try:
        pid = subprocess.run(["systemctl", "--user", "show", "-p", "MainPID", "--value", "ruach-studio"],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        if not pid or pid == "0":
            return None
        env = dict(e.split(b"=", 1) for e in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0") if b"=" in e)
        backend = env.get(b"GGML_BACKEND", b"").decode().strip()
        if backend.startswith("CUDA") and backend[4:].isdigit():
            return int(backend[4:])
        if backend:                                    # CPU, Vulkan…: no CUDA card of ours
            return None
        old = env.get(b"CUDA_VISIBLE_DEVICES")
        if old is not None:
            v = old.decode().split(",")[0].strip()
            return int(v) if v.isdigit() else None
        return 0
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
