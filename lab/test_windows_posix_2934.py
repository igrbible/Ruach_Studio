"""HERESY 2934: what lab/ asked of Linux alone answers on Windows and macOS, checked on this Linux machine with Windows' Python faked (winx.NT,
no /proc, no os.killpg, os.getpgid, os.nice nor os.fchmod, a psutil of our own, sys.platform), and a lock on the class: a new /proc read, a bare
os.kill(pid, 0), a «nice» prefix or an environment's bin/python in code turn this test red, so the class stays closed.
    .venv/bin/python lab/test_windows_posix_2934.py"""
import collections
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import types
import urllib.error
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import winx

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


# ── a psutil of our own: the processes, the sockets, the disks a test names ──────────────────────────────────────────────────────────────
class NoSuchProcess(Exception):
    pass


class AccessDenied(Exception):
    pass


PROCS = {}       # pid -> {"cmdline", "exe", "environ", "ppid", "denied"}
NICED = []


class FakeProcess:
    def __init__(self, pid=None):
        self.pid = os.getpid() if pid is None else pid
        if pid is not None and pid not in PROCS:
            raise NoSuchProcess(pid)

    def _get(self, k):
        p = PROCS[self.pid]
        if p.get("denied"):
            raise AccessDenied(self.pid)
        return p[k]

    def cmdline(self):
        return self._get("cmdline")

    def exe(self):
        return self._get("exe")

    def environ(self):
        return self._get("environ")

    def ppid(self):
        return self._get("ppid")

    def parents(self):
        out, q = [], PROCS.get(self.pid, {}).get("ppid")
        while q in PROCS:
            out.append(FakeProcess(q))
            q = PROCS[q].get("ppid")
        return out

    def nice(self, v):
        NICED.append(v)


Conn = collections.namedtuple("Conn", "status laddr pid")
Addr = collections.namedtuple("Addr", "ip port")
Disk = collections.namedtuple("Disk", "read_bytes write_bytes read_time write_time")
DiskBusy = collections.namedtuple("DiskBusy", "read_bytes write_bytes read_time write_time busy_time")
Part = collections.namedtuple("Part", "device mountpoint fstype opts")
LISTEN = []
IO = {}
PARTS = []
fake = types.ModuleType("psutil")
fake.NoSuchProcess, fake.AccessDenied, fake.Error = NoSuchProcess, AccessDenied, Exception
fake.Process = FakeProcess
fake.pid_exists = lambda pid: pid in PROCS
fake.CONN_LISTEN = "LISTEN"
fake.net_connections = lambda kind="tcp": list(LISTEN)
fake.disk_io_counters = lambda perdisk=False: dict(IO)
fake.disk_partitions = lambda all=False: list(PARTS)
fake.IDLE_PRIORITY_CLASS, fake.BELOW_NORMAL_PRIORITY_CLASS = 64, 16384
sys.modules["psutil"] = fake

# ── Windows' Python, as far as this machine can pretend: no process groups, no nice, no fchmod ───────────────────────────────────────────
HIDDEN = {}
REAL = {"NT": winx.NT, "PROC": winx.PROC, "platform": sys.platform, "which": shutil.which, "TMP": winx.TMP}


def windows(on):
    if on:
        for k in ("killpg", "getpgid", "nice", "fchmod"):
            if hasattr(os, k):
                HIDDEN[k] = getattr(os, k)
                delattr(os, k)
        winx.NT, winx.PROC, sys.platform, winx.TMP = True, False, "win32", tempfile.gettempdir()
    else:
        for k, v in HIDDEN.items():
            setattr(os, k, v)
        HIDDEN.clear()
        winx.NT, winx.PROC, sys.platform, winx.TMP = REAL["NT"], REAL["PROC"], REAL["platform"], REAL["TMP"]


real_os_kill = os.kill


def no_signal0(pid, sig):
    if sig == 0:
        raise AssertionError("os.kill(pid, 0) asked on Windows: a Ctrl+C to a console group there")
    return real_os_kill(pid, sig)


tmp = Path(tempfile.mkdtemp(prefix="t2934-"))
try:
    # ── winx itself ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    windows(True)
    os.kill = no_signal0
    check(winx.native(".venv/bin/python") == ".venv/Scripts/python.exe" and winx.native(Path("k/.venv-art/bin/python")) == Path("k/.venv-art/Scripts/python.exe"),
          "an environment's bin/python is Scripts\\python.exe on Windows (a str a str, a Path a Path)")
    check(winx.native("../../../.venv-read/bin/python") == "../../../.venv-read/Scripts/python.exe" and winx.native(".venv/bin/hf") == ".venv/Scripts/hf.exe"
          and winx.native("C:\\R\\.venv\\bin\\audio-separator") == "C:\\R\\.venv\\Scripts\\audio-separator.exe",
          "a plugin's ../../../.venv-read/bin/python, hf and audio-separator the same way, either slash")
    check(winx.native("/usr/bin/python") == "/usr/bin/python" and winx.native("vendor/llama.cpp/build/bin/llama-server") == "vendor/llama.cpp/build/bin/llama-server",
          "a bin/ that is no Python environment's is left as it is")
    check(winx.venv_python("K", ".venv-art") == Path("K/.venv-art/Scripts/python.exe"), "venv_python: the Artist's Python on Windows")
    PROCS.clear()
    PROCS.update({100: {"cmdline": ["/R/engine/cuda/yue-server.exe", "--port", "7777"], "exe": "/R/engine/cuda/yue-server.exe",
                        "environ": {"GGML_BACKEND": "CUDA1"}, "ppid": 90},
                  90: {"cmdline": ["python.exe", "launcher/start.py"], "exe": "/R/.venv/Scripts/python.exe", "environ": {}, "ppid": 1},
                  1: {"cmdline": [], "exe": "", "environ": {}, "ppid": 0},
                  200: {"cmdline": ["x"], "exe": "x", "environ": {}, "ppid": 1, "denied": True}})
    winx.kill0(100)
    try:
        winx.kill0(4321)
        check(False, "a pid that runs nowhere refused")
    except ProcessLookupError:
        check(True, "kill0 on Windows asks psutil, never os.kill(pid, 0): a running pid passes, a gone one is ProcessLookupError")
    check(winx.alive(100) and not winx.alive(4321) and not winx.alive("x") and not winx.alive(0), "alive(): True, False, False for no pid and for 0")
    check(winx.in_group(100, 90) and winx.in_group(90, 90) and not winx.in_group(90, 100) and not winx.in_group(4321, 90),
          "in_group on Windows: a process under the leader is of its group, the leader's parent is not, a gone one is not")
    check(winx.proc_cmdline(100)[0].endswith("yue-server.exe") and winx.proc_environ(100) == {"GGML_BACKEND": "CUDA1"} and winx.proc_ppid(100) == 90,
          "proc_cmdline, proc_environ and proc_ppid through psutil where there is no /proc")
    try:
        winx.proc_cmdline(200)
        check(False, "another user's process refused")
    except PermissionError:
        check(True, "another user's process: PermissionError, as /proc says it")
    try:
        winx.proc_environ(4321)
        check(False, "a gone process refused")
    except ProcessLookupError:
        check(True, "a gone process: ProcessLookupError, an OSError the callers' excepts take")
    LISTEN[:] = [Conn("ESTABLISHED", Addr("127.0.0.1", 7777), 55), Conn("LISTEN", Addr("127.0.0.1", 7777), 100)]
    check(winx.listener_pid(7777) == 100 and winx.listener_pid(7778) is None, "listener_pid: the engine is who listens on its port")
    NICED.clear()
    winx.lower_priority(19)
    winx.lower_priority(10)
    check(NICED == [64, 16384], "lower_priority on Windows: idle at 15 and more, below normal under it (Windows has no os.nice)")
    e = FileNotFoundError(2, "The system cannot find the file specified", "C:\\RuachStudio\\training\\train.log")
    check(winx.said(e) == "no train.log here" and "Errno" not in winx.said(FileNotFoundError(2, "No such file or directory", "/x/y.json")),
          "said(): a file not there is «no NAME here», no system code, no path")
    check(winx.said(RuntimeError("nvidia-smi did not answer: [WinError 2] The system cannot find the file specified")) ==
          "nvidia-smi did not answer: The system cannot find the file specified", "said(): a system code inside the lab's own words taken out")
    check(winx.said(urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))) == "Connection refused" and winx.said(ValueError("bad take name")) == "bad take name",
          "said(): a refused connection by its reason; the lab's own words as they were")

    # ── the rooms' processes on Windows ───────────────────────────────────────────────────────────────────────────────────────────────
    import h3_shots, upscale_shots
    check(h3_shots._py(tmp) == tmp / ".venv-art" / "Scripts" / "python.exe" and upscale_shots._py(tmp) == tmp / ".venv-art" / "Scripts" / "python.exe",
          "the Videographer's H3 and SeedVR2 workers look for the Artist's Python in Scripts\\ on Windows")
    sp = tmp / "user/videos/.h3/gpu0-h3"
    sp.mkdir(parents=True)
    (sp / "worker.json").write_text(json.dumps({"status": "ready", "pid": 100, "gpu": 0}), encoding="utf-8")
    KILLED, POPENED = [], []
    real_kill_group, real_popen = winx.kill_group, subprocess.Popen
    winx.kill_group = lambda pid, sig=signal.SIGTERM: KILLED.append((int(pid), sig))
    check(h3_shots._alive(sp)["pid"] == 100, "an H3 worker alive by psutil, not by os.kill(pid, 0)")
    check(h3_shots.stop_workers(tmp) == {"stopped": 1} and KILLED == [(100, signal.SIGTERM)], "an H3 worker sent away on Windows: its tree, by taskkill /T")

    class P:
        def __init__(self, cmd, **kw):
            POPENED.append((cmd, kw))
            self.pid = 777
    h3_shots.subprocess.Popen = P
    try:
        h3_shots._spawn(tmp, 0, next(iter(h3_shots.MODES)))
    finally:
        h3_shots.subprocess.Popen = real_popen
    cmd, kw = POPENED[-1]
    check(cmd[0].endswith("python.exe") and "nice" not in cmd and "start_new_session" not in kw and kw.get("creationflags"),
          "an H3 worker started on Windows: no «nice» (no such program there), a process group of its own by its creation flags")
    a = tmp / "a.mp4"
    a.write_bytes(b"0" * 64)
    link = tmp / "in" / "001.mp4"
    link.parent.mkdir()
    real_symlink = Path.symlink_to

    def refused(self, *x, **k):
        raise OSError(1314, "A required privilege is not held by the client")
    Path.symlink_to = refused
    try:
        upscale_shots.put_in(a, link)
    finally:
        Path.symlink_to = real_symlink
    check(link.is_file() and not link.is_symlink() and link.read_bytes() == a.read_bytes(),
          "SeedVR2's input with no symlink right (Windows without Developer Mode): a hard link, else a copy")

    import reader
    reader.H["kit"] = str(tmp)
    check(reader._python({"cpu": ".venv/bin/python"}, "cpu") == tmp / ".venv" / "Scripts" / "python.exe",
          "the Narrator's engine manifests (.venv/bin/python) read as Scripts\\python.exe on Windows: Drama 3 finds its Python")
    w = reader.Worker.__new__(reader.Worker)

    class Gone:
        pid = 100
        stdin = types.SimpleNamespace(write=lambda s: None, flush=lambda: None)

        def wait(self, timeout=None):
            raise subprocess.TimeoutExpired("x", timeout)
    w.p = Gone()
    KILLED.clear()
    w.close()
    check(KILLED == [(100, 9)], "a Narrator's worker that will not quit is ended with its tree on Windows (os.killpg there is an AttributeError)")
    check(reader._in_session(100, 90) and not reader._in_session(4321, 90), "the worker's server counted as its own on Windows (its tree, not os.getpgid)")
    winx.kill_group = real_kill_group

    import lamp
    os.environ.pop("RUACH_LAMP_DIR", None)
    check(lamp.where() == Path(tempfile.gettempdir()), "the lamp's lock on Windows lives in the system's temp folder, not in a C:\\tmp that is not there")
    fd = lamp._open(tmp / "lamp.lock")
    os.close(fd)
    check(lamp._alive(100) and not lamp._alive(4321), "the lamp's queue opens without os.fchmod and reads its holders alive by psutil")

    import bankbuilder
    import socket
    bank = tmp / "bank"
    bank.mkdir()
    (bank / ".claim").write_text(f"{socket.gethostname()} 4321")
    check(bankbuilder.claim(bank), "a claim of a worker gone is taken over on Windows (it read /proc/PID, so every claim looked gone)")
    (bank / ".claim").write_text(f"{socket.gethostname()} 100")
    check(not bankbuilder.claim(bank), "a claim of a worker that runs is left to it")

    import gpu_guard
    check(gpu_guard._ours(100, "/R") and not gpu_guard._ours(4321, "/R") and gpu_guard._name(100) == "yue-server.exe",
          "the cards' guard knows the Studio's own processes on Windows (their program and command line by psutil)")
    real_run = subprocess.run

    def no_tool(cmd, *x, **k):
        if cmd and cmd[0] in ("nvidia-smi", "systemctl", "journalctl", "openssl"):
            raise FileNotFoundError(2, "The system cannot find the file specified")
        return real_run(cmd, *x, **k)
    subprocess.run = no_tool
    try:
        try:
            gpu_guard.snapshot("/R")
            check(False, "no nvidia-smi refused")
        except RuntimeError as e:
            check(str(e) == winx.NO_NVSMI, "the cards' guard with no nvidia-smi: «" + winx.NO_NVSMI + "», no [WinError 2]")
        import training, machine
        check(training.gpus() == {"error": winx.NO_NVSMI}, "/gpus, /train/datasets: the cards with no nvidia-smi said in words")
        try:
            machine.cards()
            check(False, "/machine with no nvidia-smi refused")
        except RuntimeError as e:
            check(str(e) == winx.NO_NVSMI, "/machine: the same words")
        import debugbundle
        check("WinError" not in debugbundle.journal("ruach-studio", 60) and "no systemd" in debugbundle.journal("ruach-studio", 60),
              "the tester's bundle with no journalctl: «no journalctl, no systemd»")
    finally:
        subprocess.run = real_run
    import gpu_live
    real_gl = gpu_live.subprocess.Popen

    def no_smi(*x, **k):
        raise FileNotFoundError(2, "The system cannot find the file specified")
    gpu_live.subprocess.Popen = no_smi
    try:
        gpu_live._run()
    finally:
        gpu_live.subprocess.Popen = real_gl
    check(gpu_live.STATE["error"] == winx.NO_NVSMI, "/gpus/live: the same words")

    import gpu_roles
    shutil.which = lambda name, *x, **k: None if name in ("systemctl", "systemd-run", "nvidia-smi", "openssl", "journalctl") else REAL["which"](name, *x, **k)
    check(gpu_roles.studio_now() == 1, "the Studio's card on Windows without systemd: the engine found on its port, GGML_BACKEND=CUDA1 read from it")
    PROCS[100]["exe"] = "/R/engine/cpu/yue-server.exe"
    check(gpu_roles.studio_now() is None, "the Windows package's engine\\cpu computes on no card")
    PROCS[100]["exe"] = "/R/engine/cuda/yue-server.exe"
    sys.platform = "darwin"
    check(gpu_roles.studio_now() is None, "a Mac's Metal engine computes on no CUDA card")
    sys.platform = "win32"

    import writer_llm
    PROCS[300] = {"cmdline": ["/R/vendor/llama.cpp/build/bin/llama-server.exe", "--port", str(writer_llm.PORT), "-m", "x.gguf"],
                  "exe": "x", "environ": {"CUDA_VISIBLE_DEVICES": "0"}, "ppid": 1}
    LISTEN[:] = [Conn("LISTEN", Addr("127.0.0.1", writer_llm.PORT), 300)]
    check(writer_llm._is_writer(300) and writer_llm._port_owner() == 300, "the writer's server on its port found on Windows (llama-server.exe, psutil's sockets)")
    check(not writer_llm._ended(300) and writer_llm._ended(4321), "a server ended when no process has its pid (no /proc/PID/stat)")
    check(writer_llm.server(tmp).name == "llama-server.exe", "the writer's llama-server is llama-server.exe on Windows")

    import sys_live
    sys_live._drive_number = lambda letter: {"C:": 0, "D:": 1}.get(letter)
    IO.clear()
    IO.update({"PhysicalDrive0": Disk(512 * 10, 512 * 20, 5, 7), "PhysicalDrive1": Disk(0, 512, 1, 1)})
    got = sys_live._diskstats({"C:", "D:", "E:"})
    check(got == {"C:": (10, 20, 12), "D:": (0, 1, 2)}, "the system bar's disk speeds on Windows: each drive letter read from its PhysicalDriveN (they were «—»)")

    import audio_io
    d = audio_io.devices(user_dir=str(tmp))
    check(d["said"] == [audio_io.NOT_HERE] and d["physical"] == [] and "asound" not in json.dumps(d) and d.get("linux_only"),
          "/audio/devices on Windows: one sentence that the tab reads ALSA, Linux's, not «/proc/asound has none» and «aplay is not here»")
    try:
        audio_io.probe("hw:0", 48000, 2)
        check(False, "a measure on Windows refused")
    except ValueError as e:
        check(str(e) == audio_io.NOT_HERE, "the gateway's measure on Windows refused in the same words, no aplay started")

    import places
    places.setup(tmp, lambda: False, None, tmp / "settings.json")
    pl = places.plan("outputs", str(tmp / "elsewhere"))
    check(not pl["ok"] and "Developer Mode" in pl["why"], "moving a folder on Windows: said it stays inside the Studio's folder, no link tried")

    import plugins
    pf = tmp / "plug"
    pf.mkdir()
    (pf / "s.py").write_text("print(1)\n")
    (tmp / ".venv-read" / "Scripts").mkdir(parents=True)
    (tmp / ".venv-read" / "Scripts" / "python.exe").write_text("")
    st = plugins._step({"id": "tvu", "script": "s.py", "python": "../.venv-read/bin/python"}, pf)
    check(st is not None and st["python"].endswith(os.path.join("Scripts", "python.exe")),
          "a plugin step's ../.venv-read/bin/python is found as Scripts\\python.exe on Windows (it was dropped as missing)")

    import training
    (tmp / "user/plugins/p1").mkdir(parents=True)
    (tmp / "user/plugins/p1/t.py").write_text("")
    (tmp / "user/plugins/p1/plugin.json").write_text(json.dumps({"id": "p1", "trainers": [{"id": "t1", "script": "t.py"}]}))
    check(training.plugin_trainers(tmp)["t1"]["python"].endswith(os.path.join(".venv", "Scripts", "python.exe")),
          "a plugin trainer with no python of its own runs the Studio's, Scripts\\python.exe on Windows")
    os.kill = real_os_kill
    windows(False)

    # ── a Mac: no /proc, but POSIX ────────────────────────────────────────────────────────────────────────────────────────────────────
    winx.PROC = False
    PARTS[:] = [Part("/dev/disk3s1s1", "/", "apfs", "ro"), Part("/dev/disk3s5", "/System/Volumes/Data", "apfs", "rw"),
                Part("/dev/disk3s6", "/System/Volumes/VM", "apfs", "rw"), Part("/dev/disk5s1", "/Volumes/Songs", "exfat", "rw")]
    sys_live.DISKS.update(list=[], at=0.0)
    ds = sys_live._disks()
    check([x["id"] for x in ds] == ["disk3", "disk5"] and ds[0]["mounts"] == ["/"] and "system" in ds[0]["role"],
          "a Mac's disks in the system bar (it listed none): the system's container by «/», a USB volume beside it, the system's own volumes left out")
    IO.clear()
    IO.update({"disk3": DiskBusy(512 * 4, 512 * 8, 1, 1, 9)})
    check(sys_live._diskstats({"disk3", "disk5"}) == {"disk3": (4, 8, 9)}, "a Mac's disk speeds from psutil, its own busy time where it keeps one")
    winx.PROC = REAL["PROC"]

    # ── Linux unchanged ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
    check(winx.native(".venv/bin/python") == ".venv/bin/python" and winx.venv_python("K") == Path("K/.venv/bin/python"), "Linux: bin/python as before")
    check(winx.alive(os.getpid()) and not winx.alive(2 ** 22 + 12345), "Linux: os.kill(pid, 0) as before")
    check(winx.proc_cmdline(os.getpid())[0].endswith("python") or "python" in winx.proc_cmdline(os.getpid())[0], "Linux: /proc/PID/cmdline as before")
    check(winx.in_group(os.getpid(), os.getpgid(os.getpid())), "Linux: os.getpgid as before")

    # ── the base's measure for the LoRA profile: a failure kept and said ──────────────────────────────────────────────────────────────
    import lora_alchemy
    sys.modules["gguf"] = None                           # «No module named 'gguf'», as the Windows soak's .venv had it
    cf = tmp / "base.json"
    lora_alchemy._base_state.update(running=True)
    lora_alchemy._measure_base(tmp / "model.gguf", cf)
    check("gguf" in lora_alchemy._base_state["error"] and lora_alchemy._base_state["failed"] == str(cf) and not lora_alchemy._base_state["running"],
          "the base's measure that fails keeps why (it died in its thread, unsaid)")
    lora_alchemy._base_file = lambda: (tmp / "model.gguf", cf)
    real_thread = lora_alchemy.threading.Thread
    lora_alchemy.threading.Thread = lambda *x, **k: (_ for _ in ()).throw(AssertionError("measured again"))
    try:
        check(lora_alchemy.base_norms() is None, "a measure that failed is not run again at every ask for the same file")
        check("gguf" in lora_alchemy.report([])["base_error"], "/lora/profile says why «how far it moves a layer» is not known")
    finally:
        lora_alchemy.threading.Thread = real_thread
        del sys.modules["gguf"]

    # ── /train/log with no run, or a run with no log ──────────────────────────────────────────────────────────────────────────────────
    try:
        training.log_file(tmp, "")
        check(False, "no run named refused")
    except ValueError:
        check(True, "/train/log with no run named: «which run?», not the training folder's own train.log")
    try:
        training.log_file(tmp, "r1")
        check(False, "a run with no log refused")
    except FileNotFoundError as e:
        check("[Errno" not in winx.said(e) and "r1" in winx.said(e) and str(tmp) not in winx.said(e), "/train/log of a run with no log: said in words, no path, no [Errno 2]")

    # ── fetch-heresy.sh: audio-separator and the Artist's Python in Scripts\ on Windows ───────────────────────────────────────────────
    fh = (LAB.parent / "heresy" / "fetch-heresy.sh").read_text(encoding="utf-8")
    fn = next(l for l in fh.splitlines() if l.startswith("venv_exe()"))
    root = tmp / "R"
    (root / ".venv/Scripts").mkdir(parents=True)
    (root / ".venv/Scripts/audio-separator.exe").write_text("")
    os.chmod(root / ".venv/Scripts/audio-separator.exe", 0o755)
    out = subprocess.run(["bash", "-c", fn + '\nROOT="$1"; venv_exe .venv audio-separator; venv_exe .venv-art python', "x", str(root)], capture_output=True, text=True).stdout.split()
    check(out == [f"{root}/.venv/Scripts/audio-separator.exe", f"{root}/.venv-art/bin/python"],
          "fetch-heresy.sh finds audio-separator.exe in Scripts\\ where a Windows .venv keeps it; bin/ where Linux does (as before)")
    check("ART_ENV_HOW" in fh and "the Artist paints on Linux for now" in fh, "fetch-heresy.sh on Windows says the Artist's environment is Linux's for now")

    # ── the lock on the class: nothing of it comes back unseen ────────────────────────────────────────────────────────────────────────
    PROC_OK = {"winx.py", "sys_live.py", "perf.py", "survivors.py", "training.py", "artist.py", "reader.py", "audio_io.py", "writer_llm.py",
               "places.py", "gpu_live.py", "gpu_roles.py"}
    # each a read of /proc that runs on Linux alone: behind winx.PROC, systemd's unit (survivors, the Trainer's runs), the Arc's sysfs
    # (gpu_live, writer_llm), sys.platform (audio_io) or a try that says «not WSL» (places)
    bad = []
    import ast
    for f in sorted(LAB.rglob("*.py")):
        rel = f.relative_to(LAB).as_posix()
        if rel.startswith("test_") or ("/" in rel and not rel.startswith(("reader_engines/", "builtin_steps/", "trainer/"))):
            continue
        name, src = f.name, f.read_text(encoding="utf-8", errors="replace")
        try:
            tree = ast.parse(src)
        except SyntaxError as e:
            bad.append(f"{rel}: does not parse ({e})")
            continue
        docs = {id(n.body[0].value) for n in ast.walk(tree) if isinstance(n, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
                and n.body and isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant)}
        wrapped = {id(x) for n in ast.walk(tree) if isinstance(n, ast.Call) and (getattr(n.func, "attr", "") == "native" or getattr(n.func, "id", "") == "native")
                   for a in n.args for x in ast.walk(a)}            # winx.native(ENV / "bin" / NAME): the way it is meant to be written
        for n in ast.walk(tree):
            at = f"{rel}:{getattr(n, 'lineno', '?')}"
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and isinstance(n.func.value, ast.Name) and n.func.value.id == "os":
                fn = n.func.attr
                if fn in ("killpg", "getpgid") and name != "winx.py":
                    bad.append(f"{at} os.{fn}: winx.kill_group(_of), winx.in_group")
                if fn == "kill" and len(n.args) == 2 and isinstance(n.args[1], ast.Constant) and n.args[1].value == 0 and name != "winx.py":
                    bad.append(f"{at} os.kill(pid, 0) is a Ctrl+C on Windows: winx.kill0 or winx.alive")
                if fn == "nice" and name != "winx.py" and 'os.name == "posix"' not in src.splitlines()[n.lineno - 1]:
                    bad.append(f"{at} os.nice: winx.lower_priority, or a preexec_fn behind os.name == \"posix\"")
            if isinstance(n, ast.keyword) and n.arg == "preexec_fn" and not (isinstance(n.value, ast.Constant) and n.value.value is None) \
                    and 'os.name == "posix"' not in ast.get_source_segment(src, n.value):
                bad.append(f"{rel}:{n.value.lineno} preexec_fn without os.name == \"posix\": Windows refuses it")
            if isinstance(n, ast.List) and n.elts and isinstance(n.elts[0], ast.Constant) and n.elts[0].value == "nice" and name != "winx.py" \
                    and 'shutil.which("nice")' not in src.splitlines()[n.lineno - 1]:
                bad.append(f"{at} a «nice» prefix: winx.nice(n)")
            if isinstance(n, ast.BinOp) and id(n) not in wrapped and isinstance(n.op, ast.Div) and isinstance(n.right, ast.Constant) and n.right.value in ("python", "hf", "pip") \
                    and isinstance(n.left, ast.BinOp) and isinstance(n.left.right, ast.Constant) and n.left.right.value == "bin":
                bad.append(f"{at} an environment's bin/{n.right.value}: winx.venv_python or winx.native")
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docs:
                if re.fullmatch(r"\.venv[\w-]*/bin/\w+", n.value):
                    bad.append(f"{at} an environment's {n.value}: winx.venv_python or winx.native")
                if "/proc/" in n.value and name not in PROC_OK:
                    bad.append(f"{at} a /proc read in a module that runs on Windows: through winx")
    check(not bad, "the lock: no os.killpg, os.getpgid, os.kill(pid, 0), bare preexec_fn, os.nice, «nice» prefix, bin/python or new /proc read outside winx"
          + ("".join("\n      " + b for b in bad)))
finally:
    windows(False)
    os.kill = real_os_kill
    shutil.which = REAL["which"]
    shutil.rmtree(tmp, ignore_errors=True)
print(f"{ok} passed")
