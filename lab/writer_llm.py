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
starts. A server another running lab started (its parent a lab.py that lives) stays that lab's: used, never stopped from here."""
import atexit, json, os, signal, subprocess, sys, threading, time, urllib.error, urllib.request
from pathlib import Path

import gpu_guard
import gpu_roles
import paths                       # HERESY 2330: where the weights live

DIR = paths.WRITER + "/Qwopus3.5-9B-GGUF/"
VARIANTS = {
    "quality": {"file": DIR + "Qwopus3.5-9B-v3-AR-Q4_0.gguf", "need_mb": 7600, "label": "quality"},     # 6.7 GB, the embeddings stay in RAM
    "compact": {"file": DIR + "Qwopus3.5-9B-v3-AR-compact.gguf", "need_mb": 6600, "label": "compact"},   # 5.5 GB
}
ALIAS = "Qwopus3.5-9B (the Studio's own)"
PORT = 7790
CTX = 12288
IDLE_S = 600
LOCK = threading.Lock()
# HERESY 2060: pid, a server an earlier lab left and this one took over (proc stays None then); elsewhere, the pid of another running lab whose server
# answers on the port (that lab's own)
S = {"proc": None, "pid": None, "elsewhere": None, "variant": None, "gpu": None, "fit": False, "started": 0.0, "used": 0.0, "busy": 0, "error": ""}


def server(kit):
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


def choose(kit, variant):
    if variant not in VARIANTS:
        raise ValueError("the writer's quant is quality or compact")
    p = Path(kit) / "user" / "writer.json"
    data = _saved(kit)
    data["variant"] = variant
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".part")
    with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
        fh.write(json.dumps(data, ensure_ascii=False, indent=1))
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)
    if _alive() and S["variant"] != variant:          # HERESY 2060: the one taken over too
        stop("another quant chosen")
    return status(kit)


def _alive():
    p = S["proc"]
    if p is not None:
        return p.poll() is None
    return bool(S["pid"]) and _is_writer(S["pid"])   # HERESY 2060: the one taken over, while its pid is still the writer


def status(kit):
    up = _alive()
    # HERESY 2060: adopted, a server an earlier lab left and this one took over (it runs on its card and leaves as the lab's own does); elsewhere, the pid
    # of another running lab whose server answers the questions (that lab's to stop, not this one's)
    return {"here": here(kit), "variant": chosen(kit), "server": server(kit).is_file(), "running": up, "gpu": S["gpu"] if up else None,
            "fit": S["fit"] if up else False, "ctx": CTX, "alias": ALIAS, "idle_s": IDLE_S, "error": S["error"],
            "adopted": up and S["proc"] is None, "elsewhere": None if up else S["elsewhere"],
            "variants": {v: {"label": x["label"], "need_mb": x["need_mb"], "here": v in here(kit)} for v, x in VARIANTS.items()}}


def models(kit):
    """The OpenAI-style list: the Studio's writer when its weights and its server are here; listing it never starts it."""
    ok = chosen(kit) and server(kit).is_file()
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
    S.update(proc=None, pid=pid, elsewhere=None, variant=v, gpu=gpu, fit=gpu is None, started=time.time(), used=time.time(), error="")
    where = "the processor" if gpu is None else f"GPU {gpu}"
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
        exe = server(kit)
        if not exe.is_file():
            raise ValueError("llama.cpp's llama-server is not built: launcher/extras.sh builds it (a few minutes)")
        gpu, fit = _card(kit, VARIANTS[v]["need_mb"])
        cmd = [str(exe), "-m", str(Path(kit) / VARIANTS[v]["file"]), "--host", "127.0.0.1", "--port", str(PORT), "-c", str(CTX), "-np", "1",
               "--jinja", "--alias", ALIAS, "--no-webui", "-t", str(max(2, (os.cpu_count() or 4) // 2))]
        cmd += ["-ngl", "999"] if gpu is not None else ["-ngl", "0"]
        env = dict(os.environ, CUDA_VISIBLE_DEVICES="" if gpu is None else str(gpu))
        log = Path(kit) / "tmp" / "writer-llm.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        print(f"[lab] the Studio's writer: {v} on " + ("the processor" if gpu is None else f"GPU{gpu}" + (", part on the processor" if fit else "")),
              file=sys.stderr, flush=True)
        S.update(proc=subprocess.Popen(cmd, env=env, stdout=open(log, "ab"), stderr=subprocess.STDOUT, start_new_session=True),
                 pid=None, elsewhere=None, variant=v, gpu=gpu, fit=fit or gpu is None, started=time.time(), used=time.time(), error="")
        _say(f"its model ({v}) starting on " + ("the processor" if gpu is None else f"GPU {gpu}" + (", part on the processor" if fit else "")))
        t0 = time.time()
        while time.time() - t0 < 300:
            if not _alive():
                S["error"] = "llama-server stopped while it started: " + _tail(log)
                _say(S["error"])
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


def chat(kit, body):
    """A chat completion through the Studio's writer: (status, bytes). Its thinking is off unless the request asks for it (a song's brief wants the
    answer, not the way to it)."""
    data = json.loads(body.decode("utf-8"))
    if data.get("stream"):
        raise ValueError("the Studio's writer answers whole (stream: false)")
    data["model"] = ALIAS
    kw = data.get("chat_template_kwargs") or {}
    kw.setdefault("enable_thinking", False)
    data["chat_template_kwargs"] = kw
    ensure(kit)
    with LOCK:
        S["busy"] += 1
        S["used"] = time.time()
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions", data=json.dumps(data, ensure_ascii=False).encode(),
                                     headers={"Content-Type": "application/json"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=900) as r:
                out = r.read()
                try:
                    n = (json.loads(out).get("usage") or {}).get("completion_tokens")
                except ValueError:
                    n = None
                _say(f"answered in {time.time() - t0:.1f} s" + (f", {n} tokens" if n else ""))
                return r.status, out
        except urllib.error.HTTPError as e:
            _say(f"its model refused a question ({e.code})")
            return e.code, e.read()
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
        print(f"[lab] the Studio's writer left its card" + (f": {why}" if why else ""), file=sys.stderr, flush=True)
        _say("its model left its card" + (f": {why}" if why else ""))
    S.update(proc=None, pid=None, gpu=None, fit=False)
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
        if _alive() and not S["busy"] and time.time() - S["used"] > IDLE_S:
            with LOCK:
                if not S["busy"] and time.time() - S["used"] > IDLE_S:
                    stop(f"{IDLE_S // 60} minutes without a question")


def _held():
    """HERESY 1813: the card the writer holds and the memory it would give back, while it is not answering (a question in flight keeps it)."""
    if not _alive() or S["gpu"] is None or S["busy"]:
        return {}
    return {S["gpu"]: VARIANTS.get(S["variant"] or "", {}).get("need_mb", 0)}


def _leave(card):
    with LOCK:
        if S["gpu"] != card or S["busy"] or not _alive():
            return False
        stop("a room of the Studio needs its card")
        return True


gpu_guard.register_yielder(_held, _leave)
threading.Thread(target=_idle, daemon=True, name="writer-idle").start()
atexit.register(stop, "the lab stops")
