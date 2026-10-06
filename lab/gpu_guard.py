"""HERESY 1112 (Viktor, 02.10.2026: "по видеокартам сторож жёсткий, с фолбеками, во избежание OOM"), as HERESY 1113 made
it fit a laptop. A card is given to the studio's work only when

  1  no heavy stranger computes on it: a program not of the studio holding more than 2 GiB (a vLLM, someone's own
     run) closes the card, whatever memory it leaves; the desktop's small ones (X11, a browser, a clipboard, a
     dictionary: a gig or two between them) are legitimate and do not;
  2  the job fits: the memory free covers what the job needs (our weights and their cache).

What our own trainer or inference holds is ours: a stranger starting after it and finding no room is not the studio's
to prevent (Viktor: "пусть другие новые процессы падают").

The studio's own processes are known by where they run from (the studio's folder in their program or command
line): its engine (which since HERESY 1109 opens 256 MiB on every card it can see), its lab, the lab's jobs, its runs.
A failure to read the cards is said, never taken for "every card free".

    python3 lab/gpu_guard.py              every card and the verdict on it
    python3 lab/gpu_guard.py --pick N [MB]  the card to use, N first if it passes and has MB free (start.sh)"""
import os, subprocess, sys
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


def snapshot(root=KIT):
    """[{index, total_mb, free_mb, share, foreign: [(pid, name, mb)], ok, why}] for every card."""
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
    cards = []
    for line in q.stdout.strip().splitlines():
        i, uuid, total, free = [p.strip() for p in line.split(",")]
        total, free = int(total), int(free)
        foreign = [(pid, _name(pid), mb) for pid, mb in apps.get(uuid, []) if not _ours(pid, root)]
        heavy = [f for f in foreign if f[2] > HEAVY_MB]
        share = free / total if total else 0.0
        why = ("a service on it: " + ", ".join(f"{n} (pid {p}, {mb} MiB)" for p, n, mb in heavy)) if heavy else ""
        cards.append({"index": int(i), "total_mb": total, "free_mb": free, "share": round(share, 3),
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
            if c["free_mb"] < need_mb:
                raise ValueError(f"GPU{card} has {c['free_mb']} MiB free; this needs {need_mb}")
            return c
    raise ValueError(f"there is no GPU{card}")


def pick(preferred, fallback=True, need_mb=0, root=KIT):
    """The preferred cards in their order of free memory, then (with fallback) any card the guard passes; None when
    none will do (the caller says why, with verdict())."""
    cards = snapshot(root)
    good = [c for c in cards if c["ok"] and c["free_mb"] >= need_mb]
    first = sorted((c for c in good if c["index"] in preferred), key=lambda c: -c["free_mb"])
    rest = sorted((c for c in good if c["index"] not in preferred), key=lambda c: -c["free_mb"]) if fallback else []
    return (first + rest or [None])[0], cards


if __name__ == "__main__":
    try:
        if len(sys.argv) in (3, 4) and sys.argv[1] == "--pick":
            c, cards = pick([int(sys.argv[2])], need_mb=int(sys.argv[3]) if len(sys.argv) == 4 else 0)
            print(c["index"] if c else "")
            print(verdict(cards), file=sys.stderr)
        else:
            for c in snapshot():
                small = [f for f in c["foreign"] if f[2] <= HEAVY_MB]
                print(f"GPU{c['index']}  {c['free_mb']:6d} of {c['total_mb']} MiB free ({c['share']:.0%})  " + ("ok" if c["ok"] else "NO: " + c["why"])
                      + (f"  · the desktop's own: {len(small)} small" if small else ""))
    except (OSError, RuntimeError, subprocess.SubprocessError) as e:
        print(f"the guard could not read the cards: {e}", file=sys.stderr)
        sys.exit(1)
