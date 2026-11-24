"""HERESY 2649 (Viktor 16.11.2026: «добей этот Викноуз порт»): what the lab asks of Linux, said once for Windows too.

On Linux every function here does exactly what the lab's own lines did before (the same calls, the same numbers): the native Windows
build gets its own answers through psutil and the Windows API, nothing else changes. One place instead of forty files. macOS is POSIX
(fcntl, process groups, nice as on Linux) but has no /proc: CPU and memory come from psutil there, as on Windows.

    NT                     True on Windows
    PROC                   True where /proc/stat exists (Linux); False on Windows and macOS
    group_kwargs()         Popen's own process group (start_new_session; CREATE_NEW_PROCESS_GROUP on Windows)
    kill_group(pid, sig)   the group ended (os.killpg; the process tree by taskkill on Windows)
    nice(n)                a command's niceness prefix (["nice", "-n", n]; nothing on Windows, the priority set after start)
    fcntl                  the fcntl module on Linux; on Windows its flock alone, over msvcrt's byte lock (LOCK_SH taken as LOCK_EX)
    cpu_times()            {"cpu": (busy, total, iowait), "cpu0": …} as /proc/stat gives them
    meminfo_mb()           (used, total, cache, swap used, swap total) in MB as /proc/meminfo gives them
HERESY 2934 (the rest, after 2.1.0-rc1's Windows soak):
    TMP                    the folder of the machine's shared locks (/tmp; the system's temp folder on Windows)
    NO_NVSMI               the words for a machine without nvidia-smi (no NVIDIA card, or no driver)
    native(p) · venv_python(root, venv)   a Python environment's programs: bin/NAME, Scripts\\NAME.exe on Windows
    kill0(pid) · alive(pid)               os.kill(pid, 0) as a question on every system (on Windows signal 0 is a Ctrl+C)
    kill_group_of(pid, sig) · in_group(pid, leader)   os.killpg(os.getpgid(pid)) and os.getpgid(pid) == leader; the tree on Windows
    proc_cmdline · proc_exe · proc_environ · proc_ppid (pid)   /proc/PID/… on Linux, psutil elsewhere, OSError alike
    listener_pid(port)     the process listening on a TCP port (psutil), None when it cannot be known
    lower_priority(n)      os.nice(n); below-normal or idle priority on Windows
    said(e)                an exception in words for the page, no [WinError N] nor [Errno N]
    utf8_console()         HERESY 2935: the console (Windows) and this process's stdout and stderr in UTF-8
"""
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path, PurePath

NT = os.name == "nt"
PROC = os.path.isfile("/proc/stat")

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
                       capture_output=True, text=True, timeout=30, encoding="oem", errors="replace")
    # HERESY 2935: taskkill speaks the console's code page (866 on a Russian Windows); read as UTF-8 under PYTHONUTF8 its «УСПЕШНО» was a
    # UnicodeDecodeError, which no caller's except takes
    if r.returncode not in (0, 128):          # 128: there was no such process
        raise ProcessLookupError(r.stderr.strip() or r.stdout.strip() or f"taskkill {pid}: {r.returncode}")


def nice(n):
    """The prefix that runs a command at niceness n: nice on Linux, nothing on Windows (below-normal set by the caller if it wants)."""
    return [] if NT else ["nice", "-n", str(int(n))]


def cpu_times():
    """{"cpu": (busy, total, iowait), "cpu0": …}: from /proc/stat on Linux; psutil's times on Windows and macOS (no iowait there: 0)."""
    if PROC:
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
    """(used, total, cache, swap used, swap total) in MB: /proc/meminfo on Linux, psutil on Windows and macOS (no page cache there: 0)."""
    if PROC:
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


# ── HERESY 2934 (the agent's Windows item after 2.1.0-rc1, Viktor's law of 21.11.2026: «если мы начали фиксить баг или недоработку, которая
#    глобальна в Студии, мы должны дофиксить её полностью»): the rest of what the lab asked of Linux alone, said once here for Windows and macOS.
#    On Linux each answers exactly as the lab's own lines did (the same calls); Windows and macOS get theirs through psutil and the Windows API.

TMP = tempfile.gettempdir() if NT else "/tmp"          # the machine's one folder for locks every instance shares (/tmp on Linux and macOS, as before)
NO_NVSMI = "no nvidia-smi here: no NVIDIA card, or its driver is not installed"
_VENV_DIR = re.compile(r"^\.?v?env([-_.].*)?$", re.I)   # .venv, .venv-art, .venv-read, venv, .env


def native(p):
    """A program in a Python environment written the Linux way (ENV/bin/NAME, as the code and the manifests say it) as this machine keeps it:
    ENV\\Scripts\\NAME.exe on Windows (python, pip, hf, audio-separator), unchanged elsewhere and for any other path. A str comes back a str,
    a Path a Path."""
    if not NT:
        return p
    s = str(p)
    m = re.match(r"^(.*?)([^\\/]+)([\\/])bin[\\/]([^\\/]+)$", s)
    if not m or not _VENV_DIR.match(m.group(2)):
        return p
    name = m.group(4)
    name = "python.exe" if re.fullmatch(r"python(3(\.\d+)?)?", name) else name if "." in name else name + ".exe"
    out = m.group(1) + m.group(2) + m.group(3) + "Scripts" + m.group(3) + name
    return type(p)(out) if isinstance(p, PurePath) else out


def venv_python(root, venv=".venv"):
    """The Python of the Studio's environment venv (.venv, .venv-art, .venv-read): bin/python on Linux and macOS, Scripts\\python.exe on Windows."""
    return native(Path(root) / venv / "bin" / "python")


def kill0(pid):
    """os.kill(pid, 0), the question «does pid run?», on every system: it returns when pid runs, raises ProcessLookupError when it does not
    and PermissionError when it runs as another user, as os.kill does on Linux and macOS (where it is os.kill itself). On Windows os.kill(pid, 0)
    is no question at all: signal 0 is CTRL_C_EVENT there, a Ctrl+C sent to a console's process group, so psutil is asked."""
    if not NT:
        os.kill(int(pid), 0)
        return
    pid = int(pid)
    import psutil
    if pid <= 0 or not psutil.pid_exists(pid):
        raise ProcessLookupError(3, f"no process {pid}")


def alive(pid):
    """True while pid runs (another user's too); False when it has ended, or pid names no process."""
    try:
        kill0(pid)
        return True
    except PermissionError:
        return True
    except (OSError, ValueError, TypeError, OverflowError, ImportError):
        return False


def kill_group_of(pid, sig=signal.SIGTERM):
    """The process group pid belongs to ended: os.killpg(os.getpgid(pid), sig) on Linux and macOS, as the lab did; on Windows the process tree
    under pid (taskkill /T, as kill_group). OSError as either raises it."""
    if not NT:
        os.killpg(os.getpgid(int(pid)), sig)
        return
    kill_group(pid, sig)


def in_group(pid, leader):
    """pid is leader or of its group: os.getpgid on Linux and macOS (OSError when pid has ended, for the caller's except); on Windows, leader
    or a process under it (the tree kill_group ends), False when either has ended."""
    pid, leader = int(pid), int(leader)
    if pid == leader:
        return True
    if not NT:
        return os.getpgid(pid) == leader
    try:
        import psutil
        return any(p.pid == leader for p in psutil.Process(pid).parents())
    except Exception:  # noqa: BLE001   psutil's NoSuchProcess and AccessDenied, or no psutil: not of the group
        return False


def _ps(pid, what):
    """what(psutil.Process(pid)), psutil's refusals as the OSErrors /proc raises: gone ProcessLookupError, another user's PermissionError."""
    import psutil
    try:
        return what(psutil.Process(int(pid)))
    except psutil.NoSuchProcess as e:
        raise ProcessLookupError(3, f"no process {pid}") from e
    except psutil.AccessDenied as e:
        raise PermissionError(13, f"process {pid} is not this user's to read") from e
    except psutil.Error as e:
        raise OSError(str(e)) from e


def proc_cmdline(pid):
    """pid's command line, its words (none empty): /proc/PID/cmdline on Linux, psutil elsewhere; OSError when it has ended or is not ours to read."""
    if PROC:
        with open(f"/proc/{int(pid)}/cmdline", "rb") as f:
            return [w.decode("utf-8", "replace") for w in f.read().split(b"\0") if w]
    return [w for w in _ps(pid, lambda p: p.cmdline()) if w]


def proc_exe(pid):
    """The program pid runs, its real path: /proc/PID/exe's on Linux (os.path.realpath, as the lab read it), psutil's elsewhere (OSError there
    when it has ended or is not ours to read)."""
    if PROC:
        return os.path.realpath(f"/proc/{int(pid)}/exe")
    return os.path.realpath(_ps(pid, lambda p: p.exe()) or "")


def proc_environ(pid):
    """pid's environment {name: value}: /proc/PID/environ on Linux, psutil elsewhere; OSError when it has ended or is not ours to read."""
    if PROC:
        with open(f"/proc/{int(pid)}/environ", "rb") as f:
            return {k.decode("utf-8", "replace"): v.decode("utf-8", "replace") for k, v in
                    (e.split(b"=", 1) for e in f.read().split(b"\0") if b"=" in e)}
    return dict(_ps(pid, lambda p: p.environ()))


def proc_ppid(pid):
    """pid's parent: /proc/PID/stat on Linux, psutil elsewhere; OSError when it has ended, ValueError when the stat does not read."""
    if PROC:
        with open(f"/proc/{int(pid)}/stat", encoding="utf-8", errors="replace") as f:
            return int(f.read().rsplit(")", 1)[1].split()[1])
    return int(_ps(pid, lambda p: p.ppid()))


def listener_pid(port):
    """The process listening on TCP port, by psutil's sockets; None when none does, or the system will not say (no psutil, or macOS keeping
    another process's sockets from this user)."""
    try:
        import psutil
        for c in psutil.net_connections(kind="tcp"):
            if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == int(port) and c.pid:
                return int(c.pid)
    except Exception:  # noqa: BLE001   ImportError, psutil.AccessDenied, OSError: not known, never «nobody»
        return None
    return None


def lower_priority(n):
    """This process behind the others: os.nice(n) on Linux and macOS (an OSError for its caller, as before); on Windows, which has no os.nice,
    its priority class below normal (n under 15) or idle (15 and more) through psutil; nothing where neither can be had."""
    if hasattr(os, "nice"):
        os.nice(int(n))
        return
    try:
        import psutil
        psutil.Process().nice(psutil.IDLE_PRIORITY_CLASS if int(n) >= 15 else psutil.BELOW_NORMAL_PRIORITY_CLASS)
    except Exception:  # noqa: BLE001   no psutil, or a refusal: the job runs at the normal priority, as it would have
        pass


def said(e):
    """An exception in words for the page (the Windows soak's sweep found «[WinError 2] The system cannot find the file specified» and «[Errno 2]
    No such file or directory: 'C:\\…\\train.log'» in the lab's answers): an error the system raised (an OSError with its code) loses the code,
    a file or program not there is «no NAME here», any other its own words and the file's name; a refused connection is said by its reason;
    the lab's own exceptions as they were, any bracketed system code taken out."""
    import urllib.error
    if isinstance(e, urllib.error.URLError) and isinstance(getattr(e, "reason", None), OSError):
        return said(e.reason)
    if isinstance(e, OSError) and (e.errno is not None or getattr(e, "winerror", None)):
        name = re.split(r"[\\/]", str(e.filename).rstrip("\\/"))[-1] if e.filename else ""   # either slash, whatever system wrote it
        if isinstance(e, FileNotFoundError):
            return f"no {name} here" if name else "a file or program it needs is not here"
        words = (e.strerror or "").strip() or type(e).__name__
        return f"{words}: {name}" if name else words
    return re.sub(r"\[(?:WinError|Errno) -?\d+\] ?", "", str(e))


def utf8_console():
    """HERESY 2935 (a tester's Windows console showed Cyrillic as gibberish, code page 866): this process's text in UTF-8 wherever it goes.
    On Windows its console, when it has one, is switched to UTF-8 (SetConsoleOutputCP and SetConsoleCP 65001), so what a program started in it
    prints in UTF-8 (yue-server, ffmpeg) reads right there; its own stdout and stderr, when they go to a pipe or a file in the system's code
    page (cp1251, with no PYTHONUTF8), are made UTF-8 with what cannot be said replaced: never a UnicodeEncodeError on «» or ──. On Linux and
    macOS the streams are UTF-8 already and nothing changes."""
    if NT:
        try:
            import ctypes
            k32 = ctypes.windll.kernel32
            k32.SetConsoleOutputCP(65001)                # no console (the launcher's hidden services): refused, and nothing is lost
            k32.SetConsoleCP(65001)
        except (OSError, AttributeError):
            pass
    for s in (sys.stdout, sys.stderr):
        try:
            if s is not None and (getattr(s, "encoding", "") or "").lower().replace("-", "").replace("_", "") != "utf8":
                s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError, OSError):
            pass
