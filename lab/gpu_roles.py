"""HERESY 1091 (Viktor, 02.10.2026): which card does what. The studio's synthesis runs on one card (start.sh
reads it from here); training only on the cards given to training; the lab's other jobs (the listener,
Whisper, stems, remaster, upscale) only on theirs. While a run trains on the studio's own card, the page
does not start a synthesis: one card, one heavy job.

    user/gpus.json   {"studio": 0, "train": [1, 2], "jobs": [0, 1, 2], "limits": {"0": 14336}}

HERESY 1294 (Viktor 10.10.2026: «ползунка для выбора лимита VRAM по GPU»): "limits", MiB a card, the most the studio's work may
hold on it (a laptop's desktop and browser keep the rest); a card without one has its whole memory. The page's Auto sets the
engine's knobs for the studio card's limit; the guard (gpu_guard.py) gives a card to a job only when the job fits under it.

Defaults when the file is missing: the studio on GPU0; training on every other card, or on GPU0 too when
it is the only one (then synthesis waits while it trains); jobs on every card."""
import json
import os
import subprocess
import sys
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


_LAST = {}                                           # HERESY 1430: the last user/gpus.json read whole


def load(kit, cards):
    roles = defaults(cards)
    try:
        saved = json.load(open(path(kit), encoding="utf-8"))
        if not isinstance(saved, dict):
            raise ValueError("not an object")
        _LAST.clear()
        _LAST.update(saved)
    except FileNotFoundError:
        saved = {}                                   # never set: the defaults
    except (OSError, ValueError) as e:               # HERESY 1430: written by hand and broken: the roles read before, said
        print(f"[lab] {path(kit)} unreadable ({e}): " + ("keeping the roles read before" if _LAST else "the defaults: every card for the lab's jobs"),
              file=sys.stderr, flush=True)
        saved = dict(_LAST)
    ids = indices(cards)
    if isinstance(saved.get("studio"), int) and (not ids or saved["studio"] in ids):
        roles["studio"] = saved["studio"]
    for role in ("train", "jobs"):
        if isinstance(saved.get(role), list):
            keep = [i for i in saved[role] if isinstance(i, int) and (not ids or i in ids)]
            if keep:
                roles[role] = keep
    roles["limits"] = _limits(saved.get("limits"), cards)   # HERESY 1294
    return roles


def _limits(got, cards):
    """{"0": MiB} kept for the cards there are, each between 4 GiB and the card's own size (its size or more: no limit)."""
    total = {c["index"]: c.get("total_mb") for c in cards} if isinstance(cards, list) else {}
    out = {}
    for k, v in (got.items() if isinstance(got, dict) else []):
        try:
            i, mb = int(k), int(v)
        except (TypeError, ValueError):
            continue
        if total and i not in total:
            continue
        if mb < 4096 or (total.get(i) and mb >= total[i]):
            continue
        out[str(i)] = mb
    return out


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
    out["limits"] = _limits(data.get("limits"), cards)       # HERESY 1294: a card's VRAM limit, MiB
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
