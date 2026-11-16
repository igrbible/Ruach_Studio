"""HERESY 2649 (Viktor 16.11.2026: «добей этот Викноуз порт»): what the lab asks of Linux, said once for Windows too.

On Linux and macOS every function here does exactly what the lab's own lines did before (the same calls, the same numbers): the native
Windows build gets its own answers through psutil and the Windows API, nothing else changes. One place instead of forty files.

    NT                     True on Windows
    group_kwargs()         Popen's own process group (start_new_session; CREATE_NEW_PROCESS_GROUP on Windows)
    kill_group(pid, sig)   the group ended (os.killpg; the process tree by taskkill on Windows)
    nice(n)                a command's niceness prefix (["nice", "-n", n]; nothing on Windows, the priority set after start)
    fcntl                  the fcntl module on Linux; on Windows its flock alone, over msvcrt's byte lock (LOCK_SH taken as LOCK_EX)
    cpu_times()            {"cpu": (busy, total, iowait), "cpu0": …} as /proc/stat gives them
    meminfo_mb()           (used, total, cache, swap used, swap total) in MB as /proc/meminfo gives them
"""
import os
import signal
import subprocess
import time

NT = os.name == "nt"

if NT:
    import msvcrt

    class _Flock:
        """fcntl.flock over msvcrt.locking on the file's first byte: blocking waits (as flock does), LOCK_NB raises BlockingIOError."""
        LOCK_SH, LOCK_EX, LOCK_NB, LOCK_UN = 1, 2, 4, 8

        @staticmethod
        def flock(f, op):
            fd = f if isinstance(f, int) else f.fileno()
            pos = os.lseek(fd, 0, os.SEEK_CUR)
            os.lseek(fd, 0, os.SEEK_SET)
            try:
                if op & 8:
                    try:
                        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
                    except OSError:
                        pass                          # not held: flock lets go of nothing quietly too
                    return
                while True:
                    try:
                        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                        return
                    except OSError as e:
                        if op & 4:
                            raise BlockingIOError(e.errno, "the lock is held") from e
                        time.sleep(0.1)
            finally:
                os.lseek(fd, pos, os.SEEK_SET)

    fcntl = _Flock()
else:
    import fcntl  # noqa: F401  (the lab's own: «from winx import fcntl»)


def group_kwargs():
    """Popen's keywords for a process group of its own, so a Stop ends the tool and what it started."""
    if NT:
        return {"creationflags": getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200)}
    return {"start_new_session": True}


def kill_group(pid, sig=signal.SIGTERM):
    """The process group (the tree on Windows) ended; OSError as os.killpg raises it, for the callers' own except."""
    if not NT:
        os.killpg(pid, sig)
        return
    r = subprocess.run(["taskkill", "/PID", str(int(pid)), "/T"] + (["/F"] if sig != signal.SIGINT else []),
                       capture_output=True, text=True, timeout=30)
    if r.returncode not in (0, 128):          # 128: there was no such process
        raise ProcessLookupError(r.stderr.strip() or r.stdout.strip() or f"taskkill {pid}: {r.returncode}")


def nice(n):
    """The prefix that runs a command at niceness n: nice on Linux, nothing on Windows (below-normal set by the caller if it wants)."""
    return [] if NT else ["nice", "-n", str(int(n))]


def cpu_times():
    """{"cpu": (busy, total, iowait), "cpu0": …}: from /proc/stat on Linux; psutil's times on Windows (no iowait there: 0)."""
    if not NT:
        out = {}
        with open("/proc/stat") as f:
            for line in f:
                if not line.startswith("cpu"):
                    break
                parts = line.split()
                v = [int(x) for x in parts[1:9]] + [0] * max(0, 8 - len(parts[1:9]))
                total = sum(v)
                idle, iowait = v[3], v[4]
                out[parts[0]] = (total - idle - iowait, total, iowait)
        return out
    import psutil
    out = {}

    def one(t):
        total = sum(t)
        return (total - t.idle, total, 0)
    out["cpu"] = one(psutil.cpu_times())
    for i, t in enumerate(psutil.cpu_times(percpu=True)):
        out[f"cpu{i}"] = one(t)
    return out


def meminfo_mb():
    """(used, total, cache, swap used, swap total) in MB: /proc/meminfo on Linux, psutil on Windows (no page cache there: 0)."""
    if not NT:
        m = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, _, rest = line.partition(":")
                try:
                    m[k] = int(rest.split()[0]) // 1024
                except (ValueError, IndexError):
                    pass
        total = m.get("MemTotal", 0)
        avail = m.get("MemAvailable", m.get("MemFree", 0))
        cache = m.get("Cached", 0) + m.get("Buffers", 0) + m.get("SReclaimable", 0)
        return total - avail, total, cache, m.get("SwapTotal", 0) - m.get("SwapFree", 0), m.get("SwapTotal", 0)
    import psutil
    vm, sw = psutil.virtual_memory(), psutil.swap_memory()
    mb = 1024 * 1024
    return (vm.total - vm.available) // mb, vm.total // mb, 0, sw.used // mb, sw.total // mb
