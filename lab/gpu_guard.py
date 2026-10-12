"""HERESY 1112 (Viktor, 02.10.2026: "по видеокартам сторож жёсткий, с фолбеками, во избежание OOM"), as HERESY 1113 made
it fit a laptop. A card is given to the studio's work only when

  1  no heavy stranger computes on it: a program not of the studio holding more than 2 GiB (a vLLM, someone's own
     run) closes the card, whatever memory it leaves; the desktop's small ones (X11, a browser, a clipboard, a
     dictionary: a gig or two between them) are legitimate and do not;
  2  the job fits: the memory free covers what the job needs (our weights and their cache); HERESY 1294: on a card with a VRAM
     limit (user/gpus.json, the page's Engine → GPUs), the room left under it does (the limit less what the card holds).
     The studio's own start (--pick, start.sh) reads the free memory as before: its knobs keep it under the limit.

What our own trainer or inference holds is ours: a stranger starting after it and finding no room is not the studio's
to prevent (Viktor: "пусть другие новые процессы падают").

The studio's own processes are known by where they run from (the studio's folder in their program or command
line): its engine (which since HERESY 1109 opens 256 MiB on every card it can see), its lab, the lab's jobs, its runs.
A failure to read the cards is said, never taken for "every card free".

    python3 lab/gpu_guard.py              every card and the verdict on it
    python3 lab/gpu_guard.py --pick N [MB]  the card to use, N first if it passes and has MB free (start.sh)"""
import json, os, subprocess, sys
from pathlib import Path

HEAVY_MB = 2048                                     # a stranger above this is a service, not the desktop
KIT = Path(__file__).resolve().parent.parent


def _ours(pid, root):
    root = str(root)
    try:
        exe = os.path.realpath(f"/proc/{pid}/exe")
        cmd = Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "replace")
    except OSError:
        return False                                   # gone, or not ours to read: not counted as ours
    return exe.startswith(root) or root in cmd


def _name(pid):
    try:
        cmd = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
        words = [c.decode("utf-8", "replace") for c in cmd if c]
        for w in words:
            if "vllm" in w.lower():
                return "vLLM"
        return os.path.basename(words[0]) if words else "?"
    except OSError:
        return "?"


def _limits(root):
    """HERESY 1294: {index: MiB} from user/gpus.json; none when it has none."""
    try:
        got = json.load(open(Path(root) / "user" / "gpus.json", encoding="utf-8")).get("limits") or {}
        return {int(k): int(v) for k, v in got.items()}
    except (OSError, ValueError, TypeError, AttributeError):
        return {}


def snapshot(root=KIT):
    """[{index, total_mb, free_mb, limit_mb, room_mb, share, foreign: [(pid, name, mb)], ok, why}] for every card."""
    q = subprocess.run(["nvidia-smi", "--query-gpu=index,uuid,memory.total,memory.free", "--format=csv,noheader,nounits"],
                       capture_output=True, text=True, timeout=20)
    a = subprocess.run(["nvidia-smi", "--query-compute-apps=pid,gpu_uuid,used_memory", "--format=csv,noheader,nounits"],
                       capture_output=True, text=True, timeout=20)
    if q.returncode != 0 or not q.stdout.strip():
        raise RuntimeError("nvidia-smi did not answer: " + (q.stderr.strip() or "no cards listed"))
    apps = {}
    for line in a.stdout.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) == 3 and parts[0].isdigit():
            apps.setdefault(parts[1], []).append((int(parts[0]), int(parts[2]) if parts[2].isdigit() else 0))
    cards, limits = [], _limits(root)
    for line in q.stdout.strip().splitlines():
        i, uuid, total, free = [p.strip() for p in line.split(",")]
        total, free = int(total), int(free)
        foreign = [(pid, _name(pid), mb) for pid, mb in apps.get(uuid, []) if not _ours(pid, root)]
        heavy = [f for f in foreign if f[2] > HEAVY_MB]
        share = free / total if total else 0.0
        why = ("a service on it: " + ", ".join(f"{n} (pid {p}, {mb} MiB)" for p, n, mb in heavy)) if heavy else ""
        lim = limits.get(int(i))
        lim = lim if lim and lim < total else None
        room = max(0, free - (total - lim)) if lim else free     # what the studio's work may still take under the card's limit
        cards.append({"index": int(i), "total_mb": total, "free_mb": free, "limit_mb": lim, "room_mb": room, "share": round(share, 3),
                      "foreign": foreign, "ok": not why, "why": why})
    return cards


def verdict(cards):
    return "; ".join(f"GPU{c['index']}: " + (c["why"] or f"free, {c['free_mb']} MiB") for c in cards)


def check(card, need_mb=0, root=KIT):
    """A card named by hand (the trainer's "GPU 1"): refused aloud when the guard would not give it."""
    for c in snapshot(root):
        if c["index"] == card:
            if not c["ok"]:
                raise ValueError(f"GPU{card} is not given to work now: {c['why']}")
            if c["room_mb"] < need_mb:
                raise ValueError(f"GPU{card} has {c['room_mb']} MiB free" + (f" under its limit of {c['limit_mb']} MiB" if c.get("limit_mb") else "") +
                                 f"; this needs {need_mb}")
            return c
    raise ValueError(f"there is no GPU{card}")


EMPTY_MB = 1024                     # HERESY 1331: a card with so little taken is empty (the driver's own share)
SPARE_MB = 512                      # Viktor: «Минус 512 MB. Это CUDA runtime у меня, а у других может быть и больше»


def empty_fits(c, need_mb):
    """HERESY 1331: an empty card (no one's process on it, no limit of its own) takes a job whose estimate fits its whole memory
    less SPARE_MB: the estimates carry their own margin, and a job a few MiB over an empty card's free memory waited for ever."""
    return (not c.get("foreign") and not c.get("limit_mb") and c["free_mb"] >= c["total_mb"] - EMPTY_MB
            and need_mb <= c["total_mb"] - SPARE_MB)


def pick(preferred, fallback=True, need_mb=0, root=KIT, limited=True, less=None, held=None):
    """The preferred cards in their order of free memory, then (with fallback) any card the guard passes; None when
    none will do (the caller says why, with verdict()). limited (HERESY 1294): the room under each card's limit counts, not
    its whole free memory (the studio's own start passes False). less (HERESY 1376): {index: MiB} given to jobs a moment ago
    whose processes may not hold them yet, taken off the card's room; a card with such a claim is not an empty one. held (HERESY
    1378): {index: MiB} a process holds that will do the job itself (a kept painter), counted as free on its card."""
    cards = snapshot(root)
    for c in cards:                                     # HERESY 1378: the job's own process, its memory the job's
        mb = (held or {}).get(c["index"]) or 0
        if mb > 0:
            c["free_mb"] = min(c["total_mb"], c["free_mb"] + mb)
            c["room_mb"] = max(0, c["free_mb"] - (c["total_mb"] - c["limit_mb"])) if c.get("limit_mb") else c["free_mb"]
    key = "room_mb" if limited else "free_mb"
    less = less or {}

    def room(c):
        return c[key] - less.get(c["index"], 0)
    good = [c for c in cards if c["ok"] and (room(c) >= need_mb or (not less.get(c["index"]) and empty_fits(c, need_mb)))]
    first = sorted((c for c in good if c["index"] in preferred), key=lambda c: -room(c))
    rest = sorted((c for c in good if c["index"] not in preferred), key=lambda c: -room(c)) if fallback else []
    return (first + rest or [None])[0], cards


if __name__ == "__main__":
    try:
        if len(sys.argv) in (3, 4) and sys.argv[1] == "--pick":
            c, cards = pick([int(sys.argv[2])], need_mb=int(sys.argv[3]) if len(sys.argv) == 4 else 0, limited=False)   # the studio's own start
            print(c["index"] if c else "")
            print(verdict(cards), file=sys.stderr)
        else:
            for c in snapshot():
                small = [f for f in c["foreign"] if f[2] <= HEAVY_MB]
                print(f"GPU{c['index']}  {c['free_mb']:6d} of {c['total_mb']} MiB free ({c['share']:.0%})" + (f", {c['room_mb']} under its limit of {c['limit_mb']}" if c.get("limit_mb") else "") +
                      "  " + ("ok" if c["ok"] else "NO: " + c["why"])
                      + (f"  · the desktop's own: {len(small)} small" if small else ""))
    except (OSError, RuntimeError, subprocess.SubprocessError) as e:
        print(f"the guard could not read the cards: {e}", file=sys.stderr)
        sys.exit(1)
