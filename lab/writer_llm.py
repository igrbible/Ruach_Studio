"""HERESY 1811 (Viktor 28.10.2026: «Не многие смогут настроить LLM для Писателя. У меня есть очень хороший квант QWEN 3.5-9B, а именно Qwopus3.5-9B…
забирай копию этого кванта в Студию, прикручивай как Local Studio LLM, через llama.cpp… и пусть это будет опция по умолчанию для установок, где VRAM
позволяет. Так не нужно будет юзеру коннектиться на внешние сервисы»; «дай выбор юзеру выбрать либо мой качественный квант, либо более сжатый, чтобы в 8
или 12GB точно лёг»): the studio's own writer. Qwopus3.5-9B-v3 (Jackrong's, on Qwen3.5-9B, Apache-2.0), quantized by Viktor with AutoRound and moved
into GGUF bit for bit, served by llama.cpp's llama-server (vendor/llama.cpp, built by the install) behind the lab's /llm/v1, the same OpenAI-style
path every chat server has: the Writer, the Writing room, Tighten and the rest reach it as any other, from the studio's own address (no CORS, no key,
nothing leaves the machine).

The server starts at the first question (its weights read into the card: a few seconds from a warm disk), on the card the guard gives it with room for
it; with none, on the processor, slower and said so (never a part of it squeezed onto a card that lacks the room). It leaves the
card after IDLE_S without a question, or when asked (Engine → Writer → Unload), so the songs' engine and the lab's jobs get it back.

Two quants (the user chooses in Engine → Writer; fetch-heresy.sh --writer brings either):
  quality  Viktor's AutoRound 4 bits as they are (Q4_0, exact), what he kept in BF16 at Q8_0: 6.7 GB, about 7.5 GB on a card with its 12K context
  compact  the same 4 bits byte for byte, what he kept in BF16 lower (the embeddings Q4_K, the output Q6_K, the linear attention Q5_K): 5.5 GB,
           about 6.5 GB on a card: an 8 GB one"""
import atexit, json, os, subprocess, sys, threading, time, urllib.error, urllib.request
from pathlib import Path

import gpu_guard
import gpu_roles

DIR = "checkpoints/Qwopus3.5-9B-GGUF/"
VARIANTS = {
    "quality": {"file": DIR + "Qwopus3.5-9B-v3-AR-Q4_0.gguf", "need_mb": 7600, "label": "quality"},     # 6.7 GB, the embeddings stay in RAM
    "compact": {"file": DIR + "Qwopus3.5-9B-v3-AR-compact.gguf", "need_mb": 6600, "label": "compact"},   # 5.5 GB
}
ALIAS = "Qwopus3.5-9B (the studio's own)"
PORT = 7790
CTX = 12288
IDLE_S = 600
LOCK = threading.Lock()
S = {"proc": None, "variant": None, "gpu": None, "fit": False, "started": 0.0, "used": 0.0, "busy": 0, "error": ""}


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
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)
    if S["proc"] and S["variant"] != variant:
        stop("another quant chosen")
    return status(kit)


def _alive():
    p = S["proc"]
    return p is not None and p.poll() is None


def status(kit):
    return {"here": here(kit), "variant": chosen(kit), "server": server(kit).is_file(), "running": _alive(), "gpu": S["gpu"] if _alive() else None,
            "fit": S["fit"] if _alive() else False, "ctx": CTX, "alias": ALIAS, "idle_s": IDLE_S, "error": S["error"],
            "variants": {v: {"label": x["label"], "need_mb": x["need_mb"], "here": v in here(kit)} for v, x in VARIANTS.items()}}


def models(kit):
    """The OpenAI-style list: the studio's writer when its weights and its server are here; listing it never starts it."""
    ok = chosen(kit) and server(kit).is_file()
    return {"object": "list", "data": [{"id": ALIAS, "object": "model", "owned_by": "ruach"}] if ok else []}


def _health(timeout=2):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=timeout) as r:
            return r.status == 200
    except (OSError, urllib.error.URLError):
        return False


def _card(kit, need):
    """The card for the writer: one the guard gives with room for all of it (the lab's job cards first), else the processor. Never a part of it on a card
    without that room: what holds the rest of that card (the songs' engine, a training at its peak) would lose the memory it grows into (the fork,
    28.10.2026: a T1 card with 0.5 GB free stops the run at an out-of-memory)."""
    try:
        roles = gpu_roles.load(kit, gpu_guard.snapshot(kit))
        c, _cards = gpu_guard.pick(roles.get("jobs") or [], need_mb=need, root=kit)
        return (c["index"], False) if c else (None, True)
    except (OSError, RuntimeError, subprocess.SubprocessError):
        return None, True


def ensure(kit):
    """The server up for the chosen quant, started if it is not; ValueError says why it cannot be."""
    with LOCK:
        if _alive() and _health():
            return
        if _alive():
            stop("not answering")
        if _health():                                  # one left from a lab that ended without its stop: used as it is
            return
        v = chosen(kit)
        if not v:
            raise ValueError("the studio's writer is not here: Engine → Models and LoRAs → Studio writer fetches it")
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
        print(f"[lab] the studio's writer: {v} on " + ("the processor" if gpu is None else f"GPU{gpu}" + (", part on the processor" if fit else "")),
              file=sys.stderr, flush=True)
        S.update(proc=subprocess.Popen(cmd, env=env, stdout=open(log, "ab"), stderr=subprocess.STDOUT, start_new_session=True),
                 variant=v, gpu=gpu, fit=fit or gpu is None, started=time.time(), used=time.time(), error="")
        t0 = time.time()
        while time.time() - t0 < 300:
            if not _alive():
                S["error"] = "llama-server stopped while it started: " + _tail(log)
                raise ValueError(S["error"])
            if _health():
                return
            time.sleep(0.5)
        stop("did not start in 5 minutes")
        raise ValueError("the studio's writer did not start in 5 minutes: " + _tail(log))


def _tail(log):
    try:
        return " ".join(Path(log).read_text(encoding="utf-8", errors="replace").strip().splitlines()[-3:])[-400:]
    except OSError:
        return ""


def chat(kit, body):
    """A chat completion through the studio's writer: (status, bytes). Its thinking is off unless the request asks for it (a song's brief wants the
    answer, not the way to it)."""
    data = json.loads(body.decode("utf-8"))
    if data.get("stream"):
        raise ValueError("the studio's writer answers whole (stream: false)")
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
        try:
            with urllib.request.urlopen(req, timeout=900) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
    finally:
        with LOCK:
            S["busy"] -= 1
            S["used"] = time.time()


def stop(why=""):
    p = S["proc"]
    if p is not None and p.poll() is None:
        p.terminate()
        try:
            p.wait(timeout=20)
        except subprocess.TimeoutExpired:
            p.kill()
        print(f"[lab] the studio's writer left its card" + (f": {why}" if why else ""), file=sys.stderr, flush=True)
    S.update(proc=None, gpu=None, fit=False)
    return {"running": False}


def _idle():
    while True:
        time.sleep(30)
        if _alive() and not S["busy"] and time.time() - S["used"] > IDLE_S:
            with LOCK:
                if not S["busy"] and time.time() - S["used"] > IDLE_S:
                    stop(f"{IDLE_S // 60} minutes without a question")


threading.Thread(target=_idle, daemon=True, name="writer-idle").start()
atexit.register(stop, "the lab stops")
