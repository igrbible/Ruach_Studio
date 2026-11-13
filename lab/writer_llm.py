"""HERESY 1811 (Viktor 28.10.2026: «Не многие смогут настроить LLM для Писателя. У меня есть очень хороший квант QWEN 3.5-9B, а именно Qwopus3.5-9B…
забирай копию этого кванта в Студию, прикручивай как Local Studio LLM, через llama.cpp… и пусть это будет опция по умолчанию для установок, где VRAM
позволяет. Так не нужно будет юзеру коннектиться на внешние сервисы»; «дай выбор юзеру выбрать либо мой качественный квант, либо более сжатый, чтобы в 8
или 12GB точно лёг»): the Studio's own writer. Qwopus3.5-9B-v3 (Jackrong's, on Qwen3.5-9B, Apache-2.0), quantized by Viktor with AutoRound and moved
into GGUF bit for bit, served by llama.cpp's llama-server (vendor/llama.cpp, built by the install) behind the lab's /llm/v1, the same OpenAI-style
path every chat server has: the Writer, the Writing room, Tighten and the rest reach it as any other, from the Studio's own address (no CORS, no key,
nothing leaves the machine).

The server starts at the first question (its weights read into the card: a few seconds from a warm disk), on the card the guard gives it with room for
it; with none, on the processor, slower and said so (never a part of it squeezed onto a card that lacks the room). It leaves the
card after IDLE_S without a question, or when asked (Engine → Writer → Unload), so the songs' engine and the lab's jobs get it back.

Two quants (the user chooses in Engine → Writer; fetch-heresy.sh --writer brings either):
  quality  Viktor's AutoRound 4 bits as they are (Q4_0, exact), what he kept in BF16 at Q8_0: 6.7 GB, about 7.5 GB on a card with its 12K context
  compact  the same 4 bits byte for byte, what he kept in BF16 lower (the embeddings Q4_K, the output Q6_K, the linear attention Q5_K): 5.5 GB,
           about 6.5 GB on a card: an 8 GB one

HERESY 2060 (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»; the audit of 02.11.2026, C10): a server left on the writer's port by a lab
that ended without its stop (restarted by hand, under Pinokio, ./lab/start-lab.sh; under systemd it ends with its lab) is taken over as the lab's own:
looked for at the lab's start and every 30 s while the lab runs none, and at the first question. Its pid is the port's owner, its quant its -m, its card
its CUDA_VISIBLE_DEVICES; the idle unload, the guard's reclaim, Unload, a quant chosen anew, the lab's atexit and the status treat it as the one the lab
starts. A server another running lab started (its parent a lab.py that lives) stays that lab's: used, never stopped from here.

HERESY 2463 (Viktor 12.11.2026: «Писатель на Arc у нас на вечер, железно. Нужно комнату Писателя закрыть по-взрослому»): the writer on the Intel Arc.
Engine → Writer chooses where it runs: Auto (a CUDA card with room, else the Arc when nobody is on it, else the processor), a CUDA card, the Intel Arc
(waits for its turn there, never the processor behind its back), or the processor. On the Arc it runs llama.cpp's own Arc builds, the backend chosen
beside the device (vendor/llama.cpp/build-vulkan through Mesa's Intel driver alone, or build-sycl through Level Zero with oneAPI's environment and no
kernel cache), and it takes its turn on the card: one process on the Arc at a time (11.11.2026: two of ours on it at once hung the card). It goes only
when the Arc's lock is free (ARC_LOCK, the one our probes and the nightly songs take), the Arc's watchdog holds nothing, the Studio's engine sings
nothing there (an idle engine's models let go, as the Narrator does) and xpu-smi shows nobody else holding the card's memory; while it runs it watches
the same every two seconds and leaves the card the moment a song, Drama or anything else comes, saying so in the Studio's log and in its status (the
page's Generate asks it to leave first: yield_arc). It leaves the Arc after ARC_IDLE_S without a question.

HERESY 2464 (the audit of 12.11.2026, 3.2: the room's instructions alone are 7 989 tokens, and three of Viktor's songs with their score did not fit the
12 288 of before): the window is CTX = 32 768 (Qwen3.5's hybrid attention keeps its cache small: measured on the Arc, see VARIANTS), every question is
counted with the writer's own template and tokenizer first (count(): the page says «N tokens in, M left for the answer» before it sends), and its
answer's limit is the window minus that input, never more; a question that leaves no room for an answer is refused with its numbers.

HERESY 2469: a question in flight can be stopped (cancel(): the connection to llama-server closed, which stops its generation), and a wait for the Arc
with it."""
import atexit, fcntl, http.client, json, os, signal, socket, subprocess, sys, threading, time, urllib.error, urllib.request
from pathlib import Path

import gpu_guard
import gpu_roles
import paths                       # HERESY 2330: where the weights live

DIR = paths.WRITER + "/Qwopus3.5-9B-GGUF/"
# HERESY 2464: need_mb with the 32 768 window (its cache about 1 GB on top of the 12 288 of before's): measured on the Arc, see the report of 12.11
VARIANTS = {
    "quality": {"file": DIR + "Qwopus3.5-9B-v3-AR-Q4_0.gguf", "need_mb": 8400, "label": "quality"},     # 6.7 GB, the embeddings stay in RAM
    "compact": {"file": DIR + "Qwopus3.5-9B-v3-AR-compact.gguf", "need_mb": 7400, "label": "compact"},   # 5.5 GB
}
ALIAS = "Qwopus3.5-9B (the Studio's own)"
PORT = 7790
CTX = 32768                         # HERESY 2464
MIN_ANSWER = 512                    # HERESY 2464: a question that leaves less than this for its answer is refused, with its numbers
IDLE_S = 600
ANSWER_S = 960                      # HERESY 2469: one answer's longest wait, a minute past the page's 15
LOCK = threading.Lock()
# HERESY 2463: where it may run, and the Arc's two backends
DEVICES = ("auto", "cuda", "arc", "cpu")
BACKENDS = ("sycl", "vulkan")
BACKEND_DEFAULT = "sycl"            # until the Vulkan lane of 12.11 calls Vulkan stable for the writer; Engine → Writer switches it
ARC_LOCK = os.environ.get("RUACH_ARC_LOCK") or "/tmp/claude-arc.lock"   # the Arc's one door: our probes and the nightly songs take it too
ARC_FLAG_REL = "tmp/arc-reset.json"   # the Arc's watchdog: fresh while it resets the card (lab.py ARC_FLAG)
ARC_IDLE_S = 300                    # on the Arc it leaves sooner: the songs and Drama share that card
ARC_WAIT_S = 600                    # the Arc chosen by hand: its turn waited for this long, then refused with why
ARC_OTHERS_MB = 1024                # what others may hold on the Arc beside the writer (the idle engine holds ~30 MB)
INTEL_ICD = "/usr/share/vulkan/icd.d/intel_icd.json"
ONEAPI = "/opt/intel/oneapi/setvars.sh"
ENGINE_URL = "http://127.0.0.1:" + os.environ.get("YUE2CPP_PORT", "7777")
CPU_NICE = 10                       # HERESY 2463: the writer on the processor at nice 10 (Drama's XPU_NICE): a training's step keeps its pace
KIT_ROOT = str(Path(__file__).resolve().parent.parent)   # the lab lives in the kit's lab/: for a writer taken over before any question names the kit
# HERESY 2060: pid, a server an earlier lab left and this one took over (proc stays None then); elsewhere, the pid of another running lab whose server
# answers on the port (that lab's own). HERESY 2463: where ("cuda", "arc", "cpu") and the backend it runs; arc_fd, the Arc's lock held while it is
# there; waiting, why it waits for the Arc now; yielded, the last time it gave the Arc away and why. HERESY 2469: inflight, the connection of the
# question being answered; cut, why it was cut ("stop" or the yield's words)
S = {"proc": None, "pid": None, "elsewhere": None, "variant": None, "gpu": None, "fit": False, "started": 0.0, "used": 0.0, "busy": 0, "error": "",
     "where": None, "backend": None, "arc_fd": None, "waiting": "", "yielded": None, "inflight": None, "cut": "", "cancel_wait": False}


def server(kit, where=None, backend=None):
    """The llama-server for where it runs: the install's CUDA build for a CUDA card and the processor, llama.cpp's Arc builds for the Intel card
    (HERESY 2463)."""
    if where == "arc":
        return Path(kit) / "vendor" / "llama.cpp" / ("build-vulkan" if backend == "vulkan" else "build-sycl") / "bin" / "llama-server"
    return Path(kit) / "vendor" / "llama.cpp" / "build" / "bin" / "llama-server"


def here(kit):
    return [v for v, x in VARIANTS.items() if (Path(kit) / x["file"]).is_file()]


def _saved(kit):
    try:
        return json.load(open(Path(kit) / "user" / "writer.json", encoding="utf-8"))
    except (OSError, ValueError):
        return {}


_BIG = []


def _biggest(kit):
    """The biggest card's memory, read once: the cards do not change while the lab runs, and nvidia-smi under a training's load answers in seconds
    (a /models that waited for it made the page's 3 s check say «not answering»)."""
    if not _BIG:
        try:
            _BIG.append(max((c["total_mb"] for c in gpu_guard.snapshot(kit)), default=0))
        except (OSError, RuntimeError, subprocess.SubprocessError):
            return 0
    return _BIG[0]


def chosen(kit):
    """The quant the user chose, if it is here; else the one the biggest card takes (quality from 12 GB), else whichever is here."""
    h = here(kit)
    v = _saved(kit).get("variant")
    if v in h:
        return v
    for want in (["quality", "compact"] if _biggest(kit) >= 11500 else ["compact", "quality"]):
        if want in h:
            return want
    return None


def _keep(kit, data):
    p = Path(kit) / "user" / "writer.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".part")
    with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
        fh.write(json.dumps(data, ensure_ascii=False, indent=1))
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


def choose(kit, variant):
    if variant not in VARIANTS:
        raise ValueError("the writer's quant is quality or compact")
    data = _saved(kit)
    data["variant"] = variant
    _keep(kit, data)
    if _alive() and S["variant"] != variant:          # HERESY 2060: the one taken over too
        stop("another quant chosen")
    return status(kit)


def device(kit):
    """HERESY 2463: where the user wants it: auto, cuda, arc or cpu (auto when nothing is kept)."""
    d = _saved(kit).get("device")
    return d if d in DEVICES else "auto"


def backend(kit):
    """HERESY 2463: the Arc's backend the user chose, else BACKEND_DEFAULT."""
    b = _saved(kit).get("backend")
    return b if b in BACKENDS else BACKEND_DEFAULT


def place(kit, dev=None, back=None):
    """HERESY 2463: the device and the Arc's backend kept (either may be left out); a running writer that is not where it is now asked to be leaves, and
    the next question starts it there."""
    data = _saved(kit)
    if dev is not None:
        if dev not in DEVICES:
            raise ValueError("the writer runs on auto, cuda, arc or cpu")
        if dev == "arc" and not arc_here():
            raise ValueError("no Intel Arc on this machine (an xe or i915 card with its own sensors)")
        data["device"] = dev
    if back is not None:
        if back not in BACKENDS:
            raise ValueError("the Arc's backend is sycl or vulkan")
        data["backend"] = back
    _keep(kit, data)
    if _alive() and S["proc"] is not None:
        moved = (dev == "arc" and S["where"] != "arc") or (dev in ("cuda", "cpu") and S["where"] != dev) or \
                (S["where"] == "arc" and back is not None and S["backend"] != back)
        if moved:
            stop("asked to run elsewhere")
    return status(kit)


# ---------------------------------------------------------------- HERESY 2463: the Intel Arc
_ARC = {"bdf": None, "looked": 0.0, "total": None}


def arc_bdf():
    """The Intel card with sensors of its own (a discrete Arc: xe or i915, vendor 0x8086, a hwmon), its PCI address; None without one. Looked for
    again every five minutes (as gpu_live does)."""
    if time.time() - _ARC["looked"] < 300:
        return _ARC["bdf"]
    found = None
    for card in sorted(Path("/sys/class/drm").glob("card[0-9]*")):
        if "-" in card.name:
            continue
        dev = card / "device"
        try:
            drv = os.path.basename(os.path.realpath(dev / "driver"))
            vendor = (dev / "vendor").read_text().strip()
        except OSError:
            continue
        if drv in ("xe", "i915") and vendor == "0x8086" and list(dev.glob("hwmon/hwmon*")):
            found = os.path.basename(os.path.realpath(dev))
            break
    _ARC.update(bdf=found, looked=time.time())
    return found


def arc_here():
    return arc_bdf() is not None


def arc_builds(kit):
    """Which of llama.cpp's Arc builds are here, and what each needs beside it (Mesa's Intel Vulkan driver; oneAPI's environment)."""
    return {"vulkan": server(kit, "arc", "vulkan").is_file() and Path(INTEL_ICD).is_file(),
            "sycl": server(kit, "arc", "sycl").is_file() and Path(ONEAPI).is_file()}


def _xpu(args, timeout=10):
    try:
        out = subprocess.run(["xpu-smi"] + args + ["-j"], capture_output=True, text=True, timeout=timeout).stdout
        return json.loads(out[out.find("{"):]) if "{" in out else {}
    except (OSError, ValueError, subprocess.SubprocessError):
        return {}


def arc_mem():
    """(used MiB, total MiB) of the Arc by xpu-smi (its stats' memory.used_mib, its discovery's physical size); (None, None) when it cannot say.
    Unknown is never taken for free."""
    if _ARC["total"] is None:
        d = _xpu(["discovery", "-d", "0"], 20)
        if d.get("memory_physical_size_byte"):
            _ARC["total"] = round(int(d["memory_physical_size_byte"]) / 2 ** 20)
    st = _xpu(["stats", "-d", "0"])
    try:
        used = float(st["memory"]["used_mib"]["tile_0"]["current"])
    except (KeyError, TypeError, ValueError):
        return None, _ARC["total"]
    return used, _ARC["total"]


def _drm_vram(pids=None):
    """{pid: MiB} the processes hold on the Arc (the kernel's DRM fdinfo, drm-resident-vram0, each client once); only pids when given."""
    bdf, out, seen = arc_bdf(), {}, set()
    if not bdf:
        return out
    procs = [str(p) for p in pids] if pids else [d for d in os.listdir("/proc") if d.isdigit()]
    for pid in procs:
        try:
            fds = os.listdir(f"/proc/{pid}/fd")
        except OSError:
            continue
        for fd in fds:
            try:
                if not os.readlink(f"/proc/{pid}/fd/{fd}").startswith("/dev/dri/"):
                    continue
                info = dict(line.split(":", 1) for line in open(f"/proc/{pid}/fdinfo/{fd}").read().splitlines() if ":" in line)
            except (OSError, ValueError):
                continue
            key = (info.get("drm-pdev", "").strip(), info.get("drm-client-id", "").strip())
            if key[0] != bdf or key in seen:
                continue
            seen.add(key)
            kib = int((info.get("drm-resident-vram0", "0").split() or ["0"])[0] or 0)
            out[int(pid)] = out.get(int(pid), 0) + kib / 1024
    return out


def _holders(skip=None):
    """Who holds the Arc now, said: «yue-server 10.2 GB, audiocpp_server 3.1 GB» (those above 256 MB, the writer itself left out)."""
    rows = []
    for pid, mb in sorted(_drm_vram().items(), key=lambda x: -x[1]):
        if mb < 256 or pid == skip:
            continue
        try:
            name = Path(f"/proc/{pid}/comm").read_text().strip()
        except OSError:
            name = str(pid)
        rows.append(f"{name} {mb / 1024:.1f} GB")
    return ", ".join(rows) or "a process the kernel does not name"


def _flag_fresh(kit):
    try:
        return time.time() - (Path(kit) / ARC_FLAG_REL).stat().st_mtime < 600
    except OSError:
        return False


def _engine_hw():
    try:
        with urllib.request.urlopen(ENGINE_URL + "/hardware", timeout=4) as r:
            return json.load(r)
    except (OSError, ValueError):
        return None


def _engine_on_arc(hw):
    return any(str(g.get("name", "")).startswith("SYCL") or "Intel" in str(g.get("description", "")) for g in (hw or {}).get("gpus") or [])


def _engine_unload():
    """The Studio's idle engine lets its models go from the Arc (as lab.engine_unload: idle at two looks three seconds apart, then /unload); the MB
    freed, 0 when it renders, holds nothing, or does not answer."""
    try:
        for look in (0, 1):
            if look:
                time.sleep(3)
            hw = _engine_hw()
            if not hw or hw.get("busy") or (hw.get("loaded_bytes") or 0) < 256 * 2 ** 20:
                return 0
        req = urllib.request.Request(ENGINE_URL + "/unload", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.load(r)
        freed = int(d.get("freed_mb") or 0) if d.get("applied") else 0
    except (OSError, ValueError):
        return 0
    if freed:
        _say(f"the engine's models left the Intel Arc for the Writer ({freed} MB): they load again with the next song")
        time.sleep(1.5)
    return freed


def _arc_free(kit, need):
    """Why the Arc is not the writer's now, or None: the watchdog's flag fresh, a song on it, someone else holding its memory, too little room."""
    if _flag_fresh(kit):
        return "the Arc's watchdog is resetting the card"
    hw = _engine_hw()
    on = _engine_on_arc(hw)
    if on and hw.get("busy"):
        return "the Studio sings on it"
    used, total = arc_mem()
    if used is None:
        return "xpu-smi cannot read its memory now (unknown is not free)"
    if used > ARC_OTHERS_MB and on and (hw.get("loaded_bytes") or 0) >= 256 * 2 ** 20 and _engine_unload():
        used, total = arc_mem()
        if used is None:
            return "xpu-smi cannot read its memory now (unknown is not free)"
    if used > ARC_OTHERS_MB:
        return f"{used / 1024:.1f} GB of it are held ({_holders()})"
    if total and total - used < need:
        return f"{(total - used) / 1024:.1f} GB of it are free, the writer needs {need / 1024:.1f}"
    return None


def _arc_take(kit, need, wait_s):
    """The Arc for the writer: its lock taken and the card free (_arc_free). None when it is ours (the lock kept in S["arc_fd"] until stop()), else
    why not, after waiting up to wait_s (0: one look). The wait says why in the Studio's log and the writer's status, and a cancel ends it."""
    _arc_release()                                     # a lock left by a start that failed after taking it: our own fd would refuse us
    fd = open(ARC_LOCK, "a")
    t0, said = time.time(), ""
    S["cancel_wait"] = False
    try:
        while True:
            why = None
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                why = "another job of the Studio is on it (its lock " + ARC_LOCK + ")"
            if why is None:
                why = _arc_free(kit, need)
                if why:
                    fcntl.flock(fd, fcntl.LOCK_UN)
            if why is None:
                S["arc_fd"], fd = fd, None
                return None
            if wait_s <= 0 or time.time() - t0 > wait_s or S["cancel_wait"]:
                return why
            if why != said:
                S["waiting"] = "waits for the Intel Arc: " + why
                _say(S["waiting"])
                said = why
            time.sleep(5)
    finally:
        S["waiting"] = ""
        if fd is not None:
            fd.close()


def _arc_release():
    fd, S["arc_fd"] = S["arc_fd"], None
    if fd is not None:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
            fd.close()
        except OSError:
            pass


def _arc_env(env, back):
    env = dict(env, CUDA_VISIBLE_DEVICES="")
    if back == "vulkan":                               # Mesa's Intel driver alone, so the processor's llvmpipe is never «device 0»
        env.update(VK_ICD_FILENAMES=INTEL_ICD, VK_DRIVER_FILES=INTEL_ICD, GGML_VK_VISIBLE_DEVICES="0")
    else:                                              # the first Intel card by Level Zero; no kernel cache (arc-b50: a stale one hangs it)
        env.update(ONEAPI_DEVICE_SELECTOR="level_zero:0", SYCL_CACHE_PERSISTENT="0", ZES_ENABLE_SYSMAN="1")
    return env


def yield_arc(why):
    """The writer leaves the Intel Arc now, even mid-answer (the answer then says it gave the card away): a song, Drama or the watchdog needs it.
    True when it was there."""
    if S["where"] != "arc" or not _alive():
        return False
    S["yielded"] = {"at": time.time(), "why": why}
    _cut(why)
    stop("it gave the Intel Arc to " + why)
    time.sleep(1.5)                                    # the driver hands the memory back
    return True


def _watch_arc(kit, pid):
    """While the writer is on the Arc: every two seconds the engine (a song there) and the watchdog's flag, every six xpu-smi (someone else on the card,
    twice running); the first that comes, it leaves."""
    n = strikes = 0
    while S["where"] == "arc" and _alive() and (S["pid"] or (S["proc"] and S["proc"].pid)) == pid:
        time.sleep(2)
        n += 1
        why = None
        if _flag_fresh(kit):
            why = "the Arc's watchdog"
        else:
            hw = _engine_hw()
            if hw and _engine_on_arc(hw) and hw.get("busy"):
                why = "the Studio's song"
            elif n % 3 == 0:
                used, _total = arc_mem()
                own = sum(_drm_vram([pid]).values())
                strikes = strikes + 1 if used is not None and used - own > ARC_OTHERS_MB else 0
                if strikes >= 2:
                    why = "another process on the card (" + _holders(pid) + ")"
        if why and (S["where"] == "arc" and (S["pid"] or (S["proc"] and S["proc"].pid)) == pid):
            yield_arc(why)
            return



def _alive():
    p = S["proc"]
    if p is not None:
        return p.poll() is None
    return bool(S["pid"]) and _is_writer(S["pid"])   # HERESY 2060: the one taken over, while its pid is still the writer


def status(kit):
    up = _alive()
    # HERESY 2060: adopted, a server an earlier lab left and this one took over (it runs on its card and leaves as the lab's own does); elsewhere, the pid
    # of another running lab whose server answers the questions (that lab's to stop, not this one's)
    # HERESY 2463: where it runs (cuda, arc, cpu) and on which backend; the device and the Arc's backend asked; the Arc here and its builds; why it
    # waits for the Arc now; the last time it gave the Arc away (shown for ten minutes); a question in flight
    y = S["yielded"] if S["yielded"] and time.time() - S["yielded"]["at"] < 600 else None
    return {"here": here(kit), "variant": chosen(kit), "server": server(kit).is_file() or any(arc_builds(kit).values()), "running": up,
            "gpu": S["gpu"] if up else None, "fit": S["fit"] if up else False, "ctx": CTX, "alias": ALIAS,
            "idle_s": ARC_IDLE_S if up and S["where"] == "arc" else IDLE_S, "error": S["error"],
            "adopted": up and S["proc"] is None, "elsewhere": None if up else S["elsewhere"],
            "where": S["where"] if up else None, "backend": S["backend"] if up and S["where"] == "arc" else None,
            "device": device(kit), "arc_backend": backend(kit), "arc": arc_here(), "arc_builds": arc_builds(kit), "cuda_server": server(kit).is_file(),
            "waiting": S["waiting"], "yielded": y, "busy": S["busy"] > 0,
            "variants": {v: {"label": x["label"], "need_mb": x["need_mb"], "here": v in here(kit)} for v, x in VARIANTS.items()}}


def models(kit):
    """The OpenAI-style list: the Studio's writer when its weights and its server are here; listing it never starts it."""
    ok = chosen(kit) and (server(kit).is_file() or any(arc_builds(kit).values()))   # HERESY 2463: an Arc build alone serves it too
    return {"object": "list", "data": [{"id": ALIAS, "object": "model", "owned_by": "ruach"}] if ok else []}


def _health(timeout=2):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=timeout) as r:
            return r.status == 200
    except (OSError, urllib.error.URLError):
        return False


def _cmd(pid):
    try:
        return [w.decode("utf-8", "replace") for w in Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0") if w]
    except OSError:
        return []


def _arg(words, key):
    return next((words[i + 1] for i in range(len(words) - 1) if words[i] == key), "")


def _is_writer(pid):
    """HERESY 2060: pid is the Studio's writer: a llama-server serving on its port (a pid the system has given to another process since is not; an ended
    one's cmdline is empty)."""
    w = _cmd(pid)
    return bool(w) and os.path.basename(w[0]) == "llama-server" and _arg(w, "--port") == str(PORT)


def _port_owner():
    """HERESY 2060: the writer that holds its port, found by the port's owner: the listening socket's inode in /proc/net/tcp, then the llama-server whose
    descriptors hold it. None when none does, or it is another user's (its descriptors cannot be read)."""
    want, socks = f":{PORT:04X}", set()
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            rows = Path(table).read_text(encoding="ascii", errors="replace").splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            f = row.split()
            if len(f) > 9 and f[3] == "0A" and f[1].endswith(want):   # 0A: listening
                socks.add(f"socket:[{f[9]}]")
    for d in os.listdir("/proc") if socks else []:
        if not d.isdigit() or not _is_writer(d):
            continue
        try:
            if any(os.readlink(f"/proc/{d}/fd/{fd}") in socks for fd in os.listdir(f"/proc/{d}/fd")):
                return int(d)
        except OSError:
            continue                                    # it ended while it was read
    return None


def _lab_of(pid):
    """HERESY 2060: the pid of another running lab that started this server (its parent, a lab.py), else None: a server whose lab ended has the system
    for its parent."""
    try:
        ppid = int(Path(f"/proc/{pid}/stat").read_text(encoding="utf-8", errors="replace").rsplit(")", 1)[1].split()[1])
    except (OSError, ValueError, IndexError):
        return None
    if ppid in (0, 1, os.getpid()):
        return None
    return ppid if any(w.endswith("lab.py") for w in _cmd(ppid)) else None


def _adopt():
    """HERESY 2060 (the audit of 02.11.2026, C10): the server that answers on the writer's port, recorded when an earlier lab left it: its pid (the port's
    owner), its quant (its -m), its card (its CUDA_VISIBLE_DEVICES; the processor with -ngl 0). Its 10 minutes without a question begin now. True when taken
    over; a server another running lab started stays that lab's (S["elsewhere"]), and one whose owner cannot be found is used as it is. Under LOCK."""
    pid = _port_owner()
    if pid is None:
        return False
    other = _lab_of(pid)
    if other:
        if S["elsewhere"] != other:
            print(f"[lab] the Studio's writer on port {PORT} is the lab's at pid {other}: used, never stopped from here", file=sys.stderr, flush=True)
        S["elsewhere"] = other
        return False
    w = _cmd(pid)
    model = os.path.basename(_arg(w, "-m"))
    v = next((k for k, x in VARIANTS.items() if os.path.basename(x["file"]) == model), None)
    try:
        env = dict(e.split(b"=", 1) for e in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0") if b"=" in e)
    except OSError:
        env = {}
    cvd = env.get(b"CUDA_VISIBLE_DEVICES", b"").decode("ascii", "replace")
    gpu = int(cvd) if cvd.isdigit() and _arg(w, "-ngl") != "0" else None
    # HERESY 2463: one of llama.cpp's Arc builds is on the Intel card: its lock taken if it is free (one look), and watched there as the lab's own
    exe = w[0] if w else ""
    arc = ("build-vulkan" in exe or "build-sycl" in exe) and _arg(w, "-ngl") != "0"
    S.update(proc=None, pid=pid, elsewhere=None, variant=v, gpu=None if arc else gpu, fit=gpu is None and not arc, started=time.time(),
             used=time.time(), error="", where="arc" if arc else ("cpu" if gpu is None else "cuda"),
             backend=("vulkan" if "build-vulkan" in exe else "sycl") if arc else None)
    where = "the Intel Arc" if arc else "the processor" if gpu is None else f"GPU {gpu}"
    if arc:
        try:
            fd = open(ARC_LOCK, "a")
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            S["arc_fd"] = fd
        except OSError:
            pass                                        # held by another of ours: the watcher still makes it leave when the card is wanted
        threading.Thread(target=_watch_arc, args=(KIT_ROOT, pid), daemon=True, name="writer-arc-watch").start()
    print(f"[lab] the Studio's writer: the one an earlier lab left (pid {pid}, {v or model}) on {where}, taken over", file=sys.stderr, flush=True)
    _say(f"its model ({v or model}) on {where}, left by an earlier lab, taken over")
    return True


def _look():
    """HERESY 2060: a writer an earlier lab left on the port, looked for at the lab's start and every 30 s while the lab runs none, and taken over, so the
    status says it runs and its 10 minutes begin before anyone asks it (a port nobody holds refuses at once: the look costs nothing then)."""
    if not _health(1):
        S["elsewhere"] = None
        return
    if LOCK.acquire(blocking=False):                   # ensure() starting one holds it
        try:
            if S["proc"] is None and not _alive():
                _adopt()
        finally:
            LOCK.release()


def _card(kit, need):
    """The card for the writer: one the guard gives with room for all of it (the lab's job cards first), else the processor. Never a part of it on a card
    without that room: what holds the rest of that card (the songs' engine, a training at its peak) would lose the memory it grows into (the fork,
    28.10.2026: a training's card with 0.5 GB free stops the run at an out-of-memory)."""
    try:
        roles = gpu_roles.load(kit, gpu_guard.snapshot(kit))
        c, _cards = gpu_guard.pick(roles.get("jobs") or [], need_mb=need, root=kit)
        return (c["index"], False) if c else (None, True)
    except (OSError, RuntimeError, subprocess.SubprocessError):
        return None, True


# HERESY 1990: what the Writer's model does, said in the Studio's log (the lab sets it to its act_say; the Writer's view of the log shows these lines)
SAY = None
# HERESY 2206: what was said before the lab gave its log: the takeover at the lab's start happens in the idle thread this module starts as it is imported,
# before lab.py reaches speak(); kept here (the last 20) and said when it does
EARLY = []


def speak(say):
    """HERESY 2206: the Studio's log for the Writer's lines, and what was said before it was given, said into it now (in the order it came)."""
    global SAY
    SAY = say
    while EARLY:
        _say(EARLY.pop(0))


def _say(text):
    if not SAY:
        EARLY.append(text)
        del EARLY[:-20]
        return
    try:
        SAY("the Writer · " + text)
    except Exception:  # noqa: BLE001 — the log is a courtesy, never a reason to fail an answer
        pass


def ensure(kit):
    """The server up for the chosen quant, started if it is not; ValueError says why it cannot be."""
    with LOCK:
        if _alive() and _health():
            return
        if _alive():
            stop("not answering")
        if _health():                                  # one left from a lab that ended without its stop: HERESY 2060, taken over as the lab's own
            _adopt()
            return
        v = chosen(kit)
        if not v:
            raise ValueError("the Studio's writer is not here: Engine → Models and LoRAs → Studio writer fetches it")
        need, dev, back = VARIANTS[v]["need_mb"], device(kit), backend(kit)
        # HERESY 2463: where it goes. Auto and a CUDA card: the guard's card with room; Auto then the Arc when it is free at one look; the Arc chosen by
        # hand waits its turn (ARC_WAIT_S) and is never the processor behind its back; the processor last, and said why
        where, gpu, fit, why = "cpu", None, True, ""
        builds = arc_builds(kit)
        if dev in ("auto", "cuda"):
            if server(kit).is_file():
                gpu, fit = _card(kit, need)
                if gpu is not None:
                    where = "cuda"
            if where == "cpu" and dev == "auto" and arc_here() and builds.get(back):
                why = _arc_take(kit, need, 0)
                if why is None:
                    where = "arc"
                else:
                    why = "the Intel Arc is not free: " + why
        elif dev == "arc":
            if not arc_here():
                raise ValueError("Engine → Writer runs it on the Intel Arc, and there is no Intel Arc on this machine: choose Auto, a CUDA card or "
                                 "the processor there")
            if not builds.get(back):
                raise ValueError(f"llama.cpp's {back.upper()} build for the Arc is not here (vendor/llama.cpp/build-{back}/bin/llama-server"
                                 + (", and Mesa's Intel Vulkan driver" if back == "vulkan" else ", with oneAPI in /opt/intel/oneapi") + ")")
            why = _arc_take(kit, need, ARC_WAIT_S)
            if why is not None:
                raise ValueError(("the Writer's wait for the Intel Arc was stopped: " if S["cancel_wait"] else
                                  f"the Writer did not get the Intel Arc in {ARC_WAIT_S // 60} minutes: ") + why)
            where = "arc"
        exe = server(kit, where, back)
        if not exe.is_file():
            _arc_release()
            raise ValueError("llama.cpp's llama-server is not built: launcher/extras.sh builds it (a few minutes)")
        args = ["-m", str(Path(kit) / VARIANTS[v]["file"]), "--host", "127.0.0.1", "--port", str(PORT), "-c", str(CTX), "-np", "1",
                "--jinja", "--alias", ALIAS, "--no-webui", "-t", str(max(2, (os.cpu_count() or 4) // 2))]
        args += ["-ngl", "999"] if where in ("cuda", "arc") else ["-ngl", "0"]
        if where == "arc":
            env = _arc_env(os.environ, back)
            cmd = [str(exe)] + args
            if back == "sycl":                          # oneAPI's environment for its libraries; setvars.sh never sees the server's own arguments
                cmd = ["bash", "-c", 'exe="$0"; a=("$@"); set --; source ' + ONEAPI + ' >/dev/null 2>&1; exec "$exe" "${a[@]}"', str(exe)] + args
        else:
            env = dict(os.environ, CUDA_VISIBLE_DEVICES="" if gpu is None else str(gpu))
            cmd = [str(exe)] + args
            if gpu is None:                             # HERESY 2463: on the processor it yields to whatever else runs there (a training's optimizer), as Drama does
                cmd = ["nice", "-n", str(CPU_NICE)] + cmd
        log = Path(kit) / "tmp" / "writer-llm.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        said = ("the Intel Arc (" + back.upper() + ")" if where == "arc" else "the processor" if gpu is None
                else f"GPU {gpu}" + (", part on the processor" if fit else ""))
        print(f"[lab] the Studio's writer: {v} on {said}" + (f" ({why})" if why else ""), file=sys.stderr, flush=True)
        S.update(proc=subprocess.Popen(cmd, env=env, stdout=open(log, "ab"), stderr=subprocess.STDOUT, start_new_session=True),
                 pid=None, elsewhere=None, variant=v, gpu=gpu if where == "cuda" else None, fit=where == "cpu" or (where == "cuda" and fit),
                 started=time.time(), used=time.time(), error="", where=where, backend=back if where == "arc" else None)
        _say(f"its model ({v}) starting on {said}" + (f" ({why})" if why else ""))
        if where == "arc":
            threading.Thread(target=_watch_arc, args=(kit, S["proc"].pid), daemon=True, name="writer-arc-watch").start()
        t0 = time.time()
        while time.time() - t0 < 300:
            if not _alive():
                S["error"] = "llama-server stopped while it started: " + _tail(log)
                _say(S["error"])
                _arc_release()
                raise ValueError(S["error"])
            if _health():
                _say(f"its model ready in {time.time() - t0:.0f} s")
                return
            time.sleep(0.5)
        stop("did not start in 5 minutes")
        raise ValueError("the Studio's writer did not start in 5 minutes: " + _tail(log))


def _tail(log):
    try:
        return " ".join(Path(log).read_text(encoding="utf-8", errors="replace").strip().splitlines()[-3:])[-400:]
    except OSError:
        return ""


def _local(path, payload, timeout=60):
    """A POST to the writer's own llama-server: its JSON answer."""
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(payload, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def _tokens(data):
    """HERESY 2464: the question's input in tokens, as the writer itself reads it: its chat template (thinking off as asked) and its tokenizer.
    None when the server cannot say (then nothing is cut by a guess)."""
    try:
        body = {"messages": data.get("messages") or []}
        if data.get("chat_template_kwargs"):
            body["chat_template_kwargs"] = data["chat_template_kwargs"]
        prompt = _local("/apply-template", body).get("prompt")
        return len(_local("/tokenize", {"content": prompt}).get("tokens") or []) if isinstance(prompt, str) else None
    except (OSError, ValueError):
        return None


def _prepare(data):
    """HERESY 2464: the question shaped for the writer: its model's name, thinking off unless asked, and the answer's limit the window minus the input
    (never more than asked). (input tokens or None, room left)."""
    data["model"] = ALIAS
    kw = data.get("chat_template_kwargs") or {}
    kw.setdefault("enable_thinking", False)
    data["chat_template_kwargs"] = kw
    n = _tokens(data)
    left = CTX - n - 8 if n is not None else None
    if left is not None:
        if left < MIN_ANSWER:
            raise ValueError(f"the question is {n} tokens and the Studio's writer reads {CTX}: only {max(0, left)} would be left for its answer. "
                             "Shorten the brief, the lyrics or the preferences, or leave the score out")
        asked = data.get("max_tokens")
        data["max_tokens"] = min(int(asked), left) if isinstance(asked, (int, float)) and asked > 0 else left
    return n, left


def count(kit, body):
    """HERESY 2464: how big a question is before it is asked: {"in": tokens, "ctx": the window, "left": what the answer may use}. The writer starts for
    it (on the Arc, in its turn), as the question that follows needs it anyway."""
    data = json.loads(body.decode("utf-8"))
    ensure(kit)
    with LOCK:
        S["used"] = time.time()
    data["max_tokens"] = None
    try:
        n, left = _prepare(data)
    except ValueError as e:
        n = _tokens(data)
        return {"in": n, "ctx": CTX, "left": max(0, CTX - (n or 0) - 8), "error": str(e)}
    return {"in": n, "ctx": CTX, "left": left}


def _cut(why):
    """HERESY 2469: the question in flight cut: its connection to llama-server closed (the server stops generating when its client goes), and the
    answer says why."""
    S["cut"] = why
    c = S["inflight"]
    if c is not None and c.sock is not None:
        try:
            c.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


def cancel():
    """HERESY 2469: Stop in the Writing room: the answer being written, and a wait for the Arc."""
    S["cancel_wait"] = True
    busy = S["inflight"] is not None
    if busy:
        _cut("stop")
        _say("a question stopped by the user")
    return {"stopped": busy, "waiting": bool(S["waiting"])}


def chat(kit, body):
    """A chat completion through the Studio's writer: (status, bytes). Its thinking is off unless the request asks for it (a song's brief wants the
    answer, not the way to it). HERESY 2464: its answer's limit the window minus its input; 2469: stopped or given away, said in its error."""
    data = json.loads(body.decode("utf-8"))
    if data.get("stream"):
        raise ValueError("the Studio's writer answers whole (stream: false)")
    ensure(kit)
    with LOCK:
        S["busy"] += 1
        S["used"] = time.time()
    S["cut"] = ""
    S["cancel_wait"] = False
    try:
        n, left = _prepare(data)
        t0 = time.time()
        c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=ANSWER_S)
        S["inflight"] = c
        try:
            c.request("POST", "/v1/chat/completions", body=json.dumps(data, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
            r = c.getresponse()
            code, out = r.status, r.read()
        except (OSError, http.client.HTTPException) as e:
            cut = S["cut"]
            if cut == "stop":
                return 409, json.dumps({"error": "stopped: the answer was cut off at your word", "stopped": True}).encode()
            if cut:
                return 503, json.dumps({"error": f"the Studio's writer gave the Intel Arc to {cut}: send the question again when it is done",
                                        "yielded": cut}, ensure_ascii=False).encode()
            if isinstance(e, (socket.timeout, TimeoutError)):
                return 504, json.dumps({"error": f"no answer in {ANSWER_S // 60} minutes", "timeout": True}).encode()
            raise
        finally:
            S["inflight"] = None
            c.close()
        if code == 200:
            try:
                n_out = (json.loads(out).get("usage") or {}).get("completion_tokens")
            except ValueError:
                n_out = None
            _say(f"answered in {time.time() - t0:.1f} s" + (f", {n} tokens in" if n else "") + (f", {n_out} out" if n_out else "")
                 + (f" (room for {left})" if left else ""))
        else:
            _say(f"its model refused a question ({code})")
        return code, out
    finally:
        with LOCK:
            S["busy"] -= 1
            S["used"] = time.time()


def stop(why=""):
    p, pid, ended = S["proc"], S["pid"], False
    if p is not None and p.poll() is None:
        p.terminate()
        try:
            p.wait(timeout=20)
        except subprocess.TimeoutExpired:
            p.kill()
        ended = True
    elif p is None and pid and _is_writer(pid):        # HERESY 2060: the one taken over ends as the lab's own does
        _end(pid)
        ended = True
    if ended:
        what = "the Intel Arc" if S["where"] == "arc" else "its card" if S["where"] == "cuda" else "the processor"
        print(f"[lab] the Studio's writer left {what}" + (f": {why}" if why else ""), file=sys.stderr, flush=True)
        _say(f"its model left {what}" + (f": {why}" if why else ""))
    S.update(proc=None, pid=None, gpu=None, fit=False, where=None, backend=None)
    _arc_release()                                     # HERESY 2463: the Arc's lock goes with it
    return {"running": False}


def _ended(pid):
    """HERESY 2060: pid has ended, its descriptors (the port among them) closed: gone from /proc, or a zombie the system has yet to reap. Its cmdline is
    empty a moment earlier, while it still holds the port."""
    try:
        return Path(f"/proc/{pid}/stat").read_text(encoding="utf-8", errors="replace").rsplit(")", 1)[1].split()[0] in ("Z", "X")
    except (OSError, IndexError):
        return True


def _end(pid):
    """HERESY 2060: a writer the lab took over ends as Popen ends the lab's own: SIGTERM, 20 s to go, then SIGKILL; its pid checked to be the writer still
    before each signal (not the lab's child, it is reaped by the system). Back when it has ended, or its pid already names another process."""
    try:
        os.kill(pid, signal.SIGTERM)
        t0 = time.time()
        while time.time() - t0 < 20:
            if _ended(pid) or (_cmd(pid) and not _is_writer(pid)):
                return
            time.sleep(0.1)
        if _is_writer(pid):
            os.kill(pid, signal.SIGKILL)
    except OSError:
        pass                                            # gone already, or not this user's to end


def _idle():
    while True:
        if S["proc"] is None and not _alive():         # HERESY 2060: one an earlier lab left, taken over (looked for first as the lab starts)
            _look()
        time.sleep(30)
        idle = ARC_IDLE_S if S["where"] == "arc" else IDLE_S   # HERESY 2463: the Arc is shared with the songs and Drama
        if _alive() and not S["busy"] and time.time() - S["used"] > idle:
            with LOCK:
                if not S["busy"] and time.time() - S["used"] > idle:
                    stop(f"{idle // 60} minutes without a question")


def _held():
    """HERESY 1813: the card the writer holds and the memory it would give back, while it is not answering (a question in flight keeps it)."""
    if not _alive() or S["gpu"] is None or S["busy"]:
        return {}
    return {S["gpu"]: VARIANTS.get(S["variant"] or "", {}).get("need_mb", 0)}


def _leave(card):
    if not LOCK.acquire(timeout=2):                    # HERESY 2463: a start waiting for the Arc holds LOCK; the guard never waits on it
        return False
    try:
        if S["gpu"] != card or S["busy"] or not _alive():
            return False
        stop("a room of the Studio needs its card")
        return True
    finally:
        LOCK.release()


gpu_guard.register_yielder(_held, _leave)
threading.Thread(target=_idle, daemon=True, name="writer-idle").start()
atexit.register(stop, "the lab stops")
