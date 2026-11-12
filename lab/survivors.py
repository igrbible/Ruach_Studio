"""HERESY 2367 (Viktor 11.11.2026, «Пока что делай как советуешь там» on the mega report's advice «KillMode=process для юнита лабы: воркеры H3 и
SeedVR2 переживут перезапуск лабы, новая лаба подберёт их кадры»): the lab's unit kills only the lab itself now (KillMode=process), and this module
ends the rest of what the lab started, as the unit's cgroup kill did before, sparing the Videographer's MiniMax H3 workers (lab/h3_worker.py) and
its SeedVR2 upscales (lab/upscale_job.py) with whatever they started. Both work through their folders: a worker's pid and state in its spool's
worker.json (user/videos/.h3/gpuN-KIND/), what it made left as a .done; an upscale's pid in its job folder, its done.json at the end. A new lab
reads them there and sets what they made into their shots (h3_shots.collect, upscale_shots.collect), so a restart loses no shot.

    install(say)   at the lab's start, under its unit only: what an earlier lab of the unit left behind (but the survivors) is ended (a lab
                   killed outright, or one whose own ending did not finish); then SIGTERM ends the lab the same way: its other processes
                   (the Reader's, the Artist's, a chain's tools, the Writer's server…) asked to go, killed after three seconds, the lab last.

Outside the unit (start.sh, the launcher, a test) it does nothing: there the lab's children were never ended with it, and nothing changes.
The unit is heresy-lab.service, or HERESY_LAB_UNIT (lab/test_survivors_2367.py runs a lab of its own in a transient unit)."""
import os
import signal
import time
from pathlib import Path

KEEP = ("h3_worker.py", "upscale_job.py")          # the survivors: the first words of their command name one of these scripts
GRACE_S = 3.0


def unit():
    return os.environ.get("HERESY_LAB_UNIT") or "heresy-lab.service"


def unit_cgroup():
    """The lab's unit's cgroup (v2) when this process runs as that unit under systemd, else None."""
    if not os.environ.get("INVOCATION_ID"):
        return None
    try:
        for line in Path("/proc/self/cgroup").read_text().splitlines():
            if line.startswith("0::") and line[3:].rstrip("/").endswith("/" + unit()):
                return line[3:]
    except OSError:
        pass
    return None


def procs(cg):
    try:
        return [int(x) for x in Path("/sys/fs/cgroup" + cg + "/cgroup.procs").read_text().split()]
    except (OSError, ValueError):
        return []


def _ppid(pid):
    try:
        s = Path(f"/proc/{pid}/stat").read_text()
        return int(s[s.rindex(")") + 2:].split()[1])
    except (OSError, ValueError, IndexError):
        return None


def is_survivor(pid):
    try:
        argv = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")[:6]
    except OSError:
        return False
    return any(os.path.basename(a.decode("utf-8", "replace")) in KEEP for a in argv)


def spared(pids, me):
    """Of these, the survivors and what runs under one, and what this lab itself started (its own children are its own business)."""
    out = set()
    for p in pids:
        q, n = p, 0
        while q and n < 64:
            if q == me or is_survivor(q):
                out.add(p)
                break
            q, n = _ppid(q), n + 1
    return out


def end(pids, grace=GRACE_S):
    """Asked to go (SIGTERM), killed (SIGKILL) if still here after grace seconds; [pid] that went."""
    for p in pids:
        try:
            os.kill(p, signal.SIGTERM)
        except OSError:
            pass
    left, t0 = list(pids), time.time()
    while left and time.time() - t0 < grace:
        time.sleep(0.1)
        left = [p for p in left if _alive(p)]
    for p in left:
        try:
            os.kill(p, signal.SIGKILL)
        except OSError:
            pass
    return pids


def _alive(pid):
    try:
        st = Path(f"/proc/{pid}/stat").read_text()
        return st[st.rindex(")") + 2] != "Z"
    except (OSError, ValueError, IndexError):
        return False


def others(cg, me):
    """The unit's processes to end: all but this lab and the spared."""
    pids = [p for p in procs(cg) if p != me]
    keep = spared(pids, me)
    return [p for p in pids if p not in keep], sorted(keep)


def install(say=print):
    cg = unit_cgroup()
    if not cg:
        return False
    me = os.getpid()
    gone, keep = others(cg, me)
    left_kept = [p for p in keep if _ppid(p) != me]
    if gone:
        end(gone)
        say(f"[lab] an earlier lab's processes ended: {len(gone)}")
    if left_kept:
        say(f"[lab] lived through the restart: {len(left_kept)} process(es) of MiniMax H3 or SeedVR2; their shots are taken up from their folders")

    def on_term(signum, frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            gone, keep = others(cg, me)
            # the lab's own children are «spared» by spared() only for the sweep at the start; at its end they go too, but the survivors
            mine = [p for p in keep if not _under_survivor(p)]
            end(gone + mine)
        finally:
            os._exit(0)
    signal.signal(signal.SIGTERM, on_term)
    return True


def _under_survivor(pid):
    q, n = pid, 0
    while q and n < 64:
        if is_survivor(q):
            return True
        q, n = _ppid(q), n + 1
    return False
