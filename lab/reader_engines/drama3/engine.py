"""HERESY 2263 (Viktor 09.11.2026: «переводи Драму Чтеца на audio.cpp»; «гони сегодня Чтеца с
Видеографом по максимуму»): the Reader's open engine, Fish Audio Drama 3 (35B MoE, 3B active), read through audio.cpp (Apache-2.0, its
fish_drama3 family) from our own GGUF quants in models/narrator/drama-3-gguf (made from the original weights on 08.11, LICENSE and NOTICE beside
them), no longer through SGLang-Omni and its int4 build (HERESY 2255).

The tier comes from the lab in READER_TIER (JSON: id, model, device, cel, threads, rtf, opts): reader.py chose it from the card's free memory and
the machine's (HERESY 2263, 2287), as measured on one RTX 3090 on 09.11 with a 27 s Russian piece, Whisper CER 0 unless said:
    alone on the card
    Q4_K experts, Q8_0 backbone, 4 expert banks in RAM    RTF 0.62   VRAM 21.5 GiB   RAM  3.0 GiB    speed
    Q6_K experts, Q8_0 backbone, 16 banks in RAM          RTF 1.16   VRAM 21.9 GiB   RAM 11.2 GiB    quality
    Q8_0, all 40 expert banks in RAM                      RTF 2.43   VRAM  6.9 GiB   RAM 33.2 GiB    ram
    beside a dataset worker (the card and the processor shared, load 14-21)
    Q4_K, 20 banks in RAM                                 RTF 1.34   VRAM 15.7 GiB   RAM  9.8 GiB    mid-q4 (cuda_perf 1.46: off)
    Q6_K, 28 banks in RAM, cuda_perf                      RTF 1.74   VRAM 13.8 GiB   RAM 18.6 GiB    mid-q6 (off 2.18; CER 0.026, one word)
    Q4_K, all 40 banks in RAM, cuda_perf                  RTF 1.75   VRAM  7.3 GiB   RAM 18.3 GiB    ram-q4 (median of 4, 1.42-2.25; off 2.44)
    Q6_K, all 40 banks in RAM, cuda_perf                  RTF 2.46   VRAM  7.3 GiB   RAM 26.0 GiB    ram-q6 (median of 3, 1.47-2.55; off 2.61)
    Q8_0 on the processor alone (08.11)                   RTF 7.0                    RAM 39.4 GiB    cpu
A tier's opts are its session options (cuda_perf: fused MoE, attention buckets, sampling on the card; only where it measured faster).
A CUDA out-of-memory, at its load or at a piece, starts the server again with four more expert banks in RAM (as monday_gpu_drama3.sh does), up
to all 40; the piece is read again.

HERESY 2426 (Viktor 11.11.2026: Drama 3 on the Arc «когда свободна и безопасно»): on an Intel card (the lab's xpu, the Arc B50) it reads through
audio.cpp's Vulkan build in a tier of its own (device xpu), the Vulkan loader limited to Mesa's Intel driver, the device it took checked by name
in the server's log after the first piece: no Intel device named, stopped and said, never read on the processor in the card's name. Vulkan's
out-of-memory moves four more banks to RAM as CUDA's does.

The server (audiocpp_server, the CUDA build, the Vulkan one or the processor's) is this worker's child in the worker's own session: the lab letting the worker
go (its process group) takes it along. A request: the text with its fish brackets ([calm, warm] …), a seed (audio.cpp's sampling is
reproducible), the temperature, the frames by the text's length, the whole piece in one generation (HERESY 2419: text_chunk_size); a voice is
its clip and the clip's words, given by path; the answer is the sound and the codec's codes (/v1/tasks/run; the worker keeps them). top_k is never
sent: audio.cpp keeps every candidate as Fish's own Space does (a cap of 30 left takes stuck in silence). 44.1 kHz mono out.

Fish Audio Community License v1.0: no TTS service for others, nothing it makes used to train or distill any model, its watermark kept; the
Studio carries none of Fish's code (audio.cpp is Apache-2.0) and none of its weights. «Built with Fish Audio»."""
import atexit
import hashlib
import io
import json
import os
import re
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))   # lab/
import paths  # noqa: E402   HERESY 2330: where the weights live

SR = 44100
FPS = 21.5                          # the codec's frames a second
FRAMES_MAX = 1400                   # about 65 s a piece
CONTEXT = 4096                      # prompt, reference and frames
BANKS = 40                          # expert banks of Drama 3
UP_S = 1200                         # a server's start and its first piece, at most
PIECE_S = 1800                      # one piece at most (a long one on the processor)
MODEL_ID = "drama3"
OOM = ("out of memory", "cudamalloc", "failed to allocate", "cuda_error_out_of_memory", "not enough memory",
       "erroroutofdevicememory", "erroroutofhostmemory", "device memory allocation", "exceeds device memory allocation limit")   # 2426: Vulkan's
ERR_RE = re.compile(r"GGML_ASSERT|what\(\)|terminate called|std::terminate|exception|out of memory|CUDA error|\berror\b|\bfailed\b|abort", re.I)
FRAME_RE = re.compile(r"^\s*(/\S+|\S+\.so[.\d]*)\(\+0x[0-9a-f]+\)|^\s*#\d+\s+0x[0-9a-f]+")
# HERESY 2374: the release's own build first (build/audio.cpp, vendored at its pin and built by tools/narrator-setup.sh), then the kitchen's
BIN = {"cuda": ["build/audio.cpp/build/linux-cuda-release/bin/audiocpp_server", "heresy/MISC/audio.cpp/build/linux-cuda-release/bin/audiocpp_server",
                "engines/audio.cpp/cuda/audiocpp_server"],
       "cpu": ["build/audio.cpp/build/linux-cpu-release/bin/audiocpp_server", "heresy/MISC/audio.cpp/build/linux-cpu-release/bin/audiocpp_server",
               "engines/audio.cpp/cpu/audiocpp_server", "build/audio.cpp/build/linux-cuda-release/bin/audiocpp_server",
               "heresy/MISC/audio.cpp/build/linux-cuda-release/bin/audiocpp_server"],
       # HERESY 2426: the Intel card through audio.cpp's Vulkan build (it has no SYCL); never a CUDA or processor build in its place
       "xpu": ["build/audio.cpp/build/linux-vulkan-release/bin/audiocpp_server", "heresy/MISC/audio.cpp/build/linux-vulkan-release/bin/audiocpp_server",
               "engines/audio.cpp/vulkan/audiocpp_server"]}
# HERESY 2426: the Vulkan loader sees Mesa's Intel driver alone, so the processor's llvmpipe (lvp) or nouveau can never be «device 0»
INTEL_ICD = "/usr/share/vulkan/icd.d/intel_icd.json"
# HERESY 2426: on the Intel card 28 of the 40 expert banks read on the processor (16 GB on the card); measured 12.11 beside a training,
# its step went from 7–9 s to 10.8–10.9 s while Drama read at normal priority: the server yields the processor (nice 10) to whatever else runs
XPU_NICE = 10
# HERESY 2516 (Viktor 12.11.2026: «максимальная длина на выдачу аудио токенов, а не резка на куски»): on the Intel card the server's session
# is audio.cpp's streaming one. Offline, audio.cpp decodes a piece's codec frames in ONE graph whose memory grows with the piece: the
# Russian testimony's last third in one generation (45–55 s) asked Vulkan for 8.6 and 10.1 GB at 28 and 32 banks and never sounded
# (12.11, 20:50), and at all 40 banks it peaked at 15.0–15.3 GB of 15.9 and lost its device on the fourth take. Streaming, the codec
# decodes four frames at a time beside the generation, with its state carried, and the whole sound still comes back whole, its codes
# with it, through the same /v1/tasks/run and /v1/audio/speech: the same take (40 banks, same seed) 1083 frames both ways, its two
# decodes 51 dB apart (correlation 0.999996), 9.1 GB at peak instead of 15.1 and 252 s instead of 286. CUDA keeps offline (not measured).
VK_DEV_RE = re.compile(r"ggml_vulkan:\s*(\d+)\s*=\s*([^\n|]+)")
WHOLE = 4096                        # HERESY 2419: audio.cpp's text_chunk_size: a piece read in one generation (its own default, 128
                                    # characters, cut a Greek piece of 199 in two and joined their sound with no fade: the «тук» of 11.11)
LOG_MAX = 64 * 1024 ** 2            # HERESY 2374: the server's log (the «CUDA Graph id N reused» chatter: 38 MB in three days) kept to one old copy


def _port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def server_bin(kit, device):
    """The audio.cpp server for this device: READER_AUDIOCPP_SERVER when set, else the first build found under the kit."""
    own = os.environ.get("READER_AUDIOCPP_VULKAN" if device == "xpu" else "READER_AUDIOCPP_SERVER")
    if own:
        return Path(own)
    for rel in BIN[device if device in ("cuda", "xpu") else "cpu"]:
        p = Path(kit) / rel
        if p.is_file() and os.access(p, os.X_OK):
            return p
    if device == "xpu":
        raise RuntimeError("no Vulkan build of audio.cpp here (build/audio.cpp/build/linux-vulkan-release/bin/audiocpp_server): Drama 3 reads on an "
                           "Intel card only through it: bash tools/narrator-setup.sh --build --vulkan (HERESY 2436, 2520)")
    raise RuntimeError("no audio.cpp server here (build/audio.cpp/build/linux-" + ("cuda" if device == "cuda" else "cpu") + "-release/bin/audiocpp_server): "
                       "bash tools/narrator-setup.sh builds it" + (" for the card" if device == "cuda" else " (--cpu for the processor)"))


def vk_index():
    """HERESY 2426: the Intel card's index among the Vulkan devices the Intel driver alone shows: the lab's ONEAPI_DEVICE_SELECTOR (level_zero:N,
    the N-th Intel card) names it, 0 without one."""
    m = re.fullmatch(r"\s*level_zero:(\d+)\s*", os.environ.get("ONEAPI_DEVICE_SELECTOR") or "")
    return int(m.group(1)) if m else 0


def vk_env(env):
    """The server's environment on an Intel card: the Vulkan loader limited to Mesa's Intel driver (both names the loader reads), no CUDA."""
    if not Path(INTEL_ICD).is_file():
        raise RuntimeError(f"Mesa's Intel Vulkan driver is not here ({INTEL_ICD}, the package mesa-vulkan-drivers): Drama 3 does not read on the "
                           "Intel card without it, and never on the processor in its place")
    env = dict(env, VK_ICD_FILENAMES=INTEL_ICD, VK_DRIVER_FILES=INTEL_ICD, CUDA_VISIBLE_DEVICES="")
    env.pop("GGML_VK_VISIBLE_DEVICES", None)
    return env


def vk_device_of(log_text, index=0):
    """HERESY 2426: the Vulkan device the server says it took («ggml_vulkan: 0 = Intel(R) Graphics (BMG G21) …»), or None when it named none.
    A server that names no Intel device would read on the processor behind the card's back: the load refuses it."""
    for m in VK_DEV_RE.finditer(log_text or ""):
        if int(m.group(1)) == index:
            return m.group(2).strip()
    return None


def config(h, port):
    """The server's config (a function of its own so a test reads it without a card)."""
    back = {"cuda": "cuda", "xpu": "vulkan"}.get(h["device"], "cpu")
    return {"host": "127.0.0.1", "port": port, "backend": back, "device": h.get("vk", 0) if back == "vulkan" else 0, "threads": h["threads"],
            "lazy_load": False, "max_loaded_models": 1,
            "models": [{"id": MODEL_ID, "family": "fish_drama3", "path": str(h["model"]), "task": "tts",
                        "mode": "streaming" if back == "vulkan" else "offline",   # HERESY 2516
                        "session_options": dict(h.get("opts") or {}, **{"fish_drama3.cpu_expert_layers": h["cel"],
                                                                         "fish_drama3.context_length": CONTEXT})}]}


def _opts(t):
    """A tier's own session options (HERESY 2287: cuda_perf, disk experts), fish_drama3's only, plain values; the banks and the context stay
    the engine's."""
    o = t.get("opts") if isinstance(t.get("opts"), dict) else {}
    return {k: v for k, v in o.items() if isinstance(k, str) and k.startswith("fish_drama3.") and isinstance(v, (str, int, float, bool))
            and k not in ("fish_drama3.cpu_expert_layers", "fish_drama3.context_length")}


def frames(text):
    """Frames for a piece: its length with room to spare (Russian reads about 14 characters a second), never above FRAMES_MAX."""
    return max(80, min(FRAMES_MAX, int((len(text) / 9.0 + 4.0) * FPS)))


def body(text, ref, opts):
    """The /v1/audio/speech request of one piece."""
    b = {"model": MODEL_ID, "input": text, "response_format": "wav", "max_tokens": frames(text),
         "options": {"temperature": round(float(opts.get("temperature", 0.8)), 3), "text_chunk_size": WHOLE}}
    if opts.get("seed") is not None:
        b["seed"] = int(opts["seed"])
    if ref:
        b["voice_ref"] = ref["path"]
        b["reference_text"] = ref["text"] or ""
    if opts.get("previous"):                            # HERESY 2474: the pieces before as audio.cpp's history (previous_takes)
        b["options"]["previous_takes"] = json.dumps(previous_takes(opts["previous"]), separators=(",", ":"))
    return b


def previous_takes(prev):
    """HERESY 2474: [{text, codes: a piece-NNN.codes.npz the worker kept}] as Drama 3's history, [{text, vq_codes: 10 codebooks × frames}];
    a file that is not there or not ten codebooks fails the piece aloud (the lab keeps the bridge only where the codes are)."""
    import numpy as np
    out = []
    for t in prev:
        with np.load(str(t["codes"])) as z:
            c = np.asarray(z["codes"])
        if c.ndim == 2 and c.shape[0] != 10 and c.shape[1] == 10:
            c = c.T
        if c.ndim != 2 or c.shape[0] != 10 or c.shape[1] < 1:
            raise RuntimeError(f"the codes of the piece before are not 10 codebooks × frames: {c.shape}")
        out.append({"text": str(t["text"]), "vq_codes": c.astype(int).tolist()})
    return out


def _tier():
    try:
        t = json.loads(os.environ.get("READER_TIER") or "{}")
    except ValueError:
        t = {}
    return t if isinstance(t, dict) else {}


def load(device, kit):
    if device not in ("cuda", "xpu", "cpu"):
        raise RuntimeError("Drama 3 reads on a CUDA card, an Intel card (Vulkan) or the processor")
    t = _tier()
    model = paths.narrator_file(str(t.get("model") or ("drama-3-gguf/" + ("drama-3-experts-Q4_K-backbone-Q8_0.gguf" if device == "cuda"
                                                                                 else "drama-3-Q8_0.gguf"))), kit)
    d = model.parent
    if not model.is_file():
        raise RuntimeError(f"its model is not here: {model}")
    missing = [n for n in ("LICENSE", "NOTICE") if not (d / n).is_file()]
    if missing:
        raise RuntimeError(f"the Fish Audio Community License files must lie beside the model, and {', '.join(missing)} is not in {d}")
    if device == "xpu" and t.get("device") != "xpu":
        raise RuntimeError("Drama 3 on the Intel card wants a tier of its own (device xpu): the lab gave " + (t.get("id") or "none"))
    cel = BANKS if device == "cpu" else max(0, min(BANKS, int(t.get("cel", 4))))
    logs = Path(kit) / "reader" / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    tmp = Path(kit) / "reader" / "tmp" / "drama3-refs"
    tmp.mkdir(parents=True, exist_ok=True)
    h = {"kit": Path(kit), "device": device, "model": model, "cel": cel, "tier": str(t.get("id") or ""),
         "opts": _opts(t) if device in ("cuda", "xpu") else {}, "threads": int(t.get("threads") or (32 if device == "cpu" else 16)), "bin": server_bin(kit, device),
         "log": logs / "drama3-server.log", "refs": tmp, "proc": None, "url": "", "retries": 0, "vk": vk_index() if device == "xpu" else 0}
    signal.signal(signal.SIGTERM, lambda *_: (_stop(h), os._exit(0)))
    atexit.register(_stop, h)
    _up(h)
    where = {"cuda": "the card", "xpu": f"the Intel card ({h.get('vk_name') or 'Vulkan'})"}.get(device, "the processor")
    print(f"drama3: {model.name} on {where}, {h['cel']} expert banks in RAM, "
          f"{h['threads']} threads" + "".join(f", {k.split('.', 1)[1]}={v}" for k, v in h["opts"].items()), flush=True)
    return h


def _up(h):
    """The server up with h's banks and its first piece read (the model loaded, its graphs warm); a CUDA out-of-memory on the way, again with
    four more banks in RAM until all 40 are there."""
    while True:
        try:
            _serve(h)
            _post(h, {"model": MODEL_ID, "input": "Проверка.", "response_format": "wav", "max_tokens": 60, "seed": 1}, UP_S)
            if h["device"] == "xpu":
                _on_intel(h)
            return
        except RuntimeError as e:
            if not _more_banks(h, e):
                raise


def _on_intel(h):
    """HERESY 2426: the server read its first piece on the Intel card, as its log names the Vulkan device it took; anything else (no Vulkan
    device named, or one that is not Intel's) is stopped and said, never left to read on the processor while the run says «the Intel card»."""
    try:
        with open(h["log"], "rb") as f:
            f.seek(h.get("log_at", 0))
            text = f.read(4 * 1024 ** 2).decode("utf-8", "replace")
    except OSError:
        text = ""
    name = vk_device_of(text, h.get("vk", 0))
    if not name or "intel" not in name.lower() or "llvmpipe" in name.lower():
        _stop(h)
        raise RuntimeError("Drama 3's Vulkan server did not take the Intel card (" + (f"its device {h.get('vk', 0)} is «{name}»" if name else
                           "it named no Vulkan device") + "): stopped, not read on the processor in its place")
    h["vk_name"] = name


def _serve(h):
    """The server started (again) with h's banks, its log appended to; returns when it answers /health."""
    _stop(h)
    port = _port()
    cfg = h["refs"].parent / f"drama3-server-{os.getpid()}.json"
    cfg.write_text(json.dumps(config(h, port), indent=1))
    cmd = [str(h["bin"]), "--config", str(cfg), "--no-ui", "--busy-timeout-ms", "0"]
    try:                                                 # HERESY 2374: one old copy kept, the rest let go
        if h["log"].stat().st_size > LOG_MAX:
            h["log"].replace(h["log"].with_suffix(".log.1"))
    except OSError:
        pass
    log = open(h["log"], "a")
    log.write(f"\n==== {time.strftime('%F %T')} tier {h['tier'] or '?'} · {h['model'].name} · cpu_expert_layers={h['cel']}"
              f"{''.join(f' · {k}={v}' for k, v in h.get('opts', {}).items())} · {' '.join(cmd)}\n")
    log.flush()
    h["log_at"] = h["log"].stat().st_size
    env = dict(os.environ)
    if h["device"] == "xpu":
        env = vk_env(env)
    elif h["device"] != "cuda":
        env["CUDA_VISIBLE_DEVICES"] = ""
    h["proc"] = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, cwd=str(h["kit"]), env=env,
                                 preexec_fn=(lambda: os.nice(XPU_NICE)) if h["device"] == "xpu" else None)
    h["url"] = f"http://127.0.0.1:{port}"
    t0 = time.time()
    while True:
        if h["proc"].poll() is not None:
            raise RuntimeError(f"its server ended at its start (code {h['proc'].returncode}): " + _log_tail(h))
        try:
            urllib.request.urlopen(h["url"] + "/health", timeout=5).read()
            return
        except OSError:
            if time.time() - t0 > UP_S:
                _stop(h)
                raise RuntimeError(f"its server did not come up in {UP_S // 60} minutes")
            time.sleep(2)


def _log_tail(h, scan=262144):
    """The server's last lines since its start, and before them the first lines that say why it failed (an assert, an exception's what(),
    a CUDA or other error, std::terminate): a crash ends in twenty stack frames, and the last lines alone lost the cause (2303)."""
    try:
        with open(h["log"], "rb") as f:
            end = f.seek(0, 2)
            f.seek(max(h.get("log_at", 0), end - scan))
            lines = [x for x in f.read().decode("utf-8", "replace").splitlines() if x.strip()]
    except OSError:
        return ""
    tail = lines[-6:]
    why = list(dict.fromkeys(x.strip() for x in lines[:-6] if ERR_RE.search(x) and not FRAME_RE.search(x)))[:4]
    tail = [x for x in tail if not FRAME_RE.search(x)][-3:] or tail[-2:]
    return " | ".join(why + (["…"] if why else []) + tail)[:1400]


def _oom(h, e):
    s = (str(e) + " " + _log_tail(h)).lower()
    return any(k in s for k in OOM)


def _more_banks(h, e):
    """A card's out-of-memory (CUDA's, or Vulkan's on the Intel card, HERESY 2426): the server again with four more expert banks in RAM (True), or
    nothing more to move (False)."""
    if h["device"] not in ("cuda", "xpu") or h["cel"] >= BANKS or not _oom(h, e):
        return False
    h["cel"], h["retries"] = min(BANKS, h["cel"] + 4), h["retries"] + 1
    print(f"drama3: out of memory on the {'Intel ' if h['device'] == 'xpu' else ''}card, again with {h['cel']} expert banks in RAM", flush=True)
    return True


def _stop(h):
    pr = h.get("proc")
    if pr is not None and pr.poll() is None:
        pr.terminate()
        try:
            pr.wait(60)
        except subprocess.TimeoutExpired:
            pr.kill()


def _post(h, b, timeout=PIECE_S, path="/v1/audio/speech"):
    req = urllib.request.Request(h["url"] + path, data=json.dumps(b, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        return urllib.request.urlopen(req, timeout=timeout).read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Drama 3 said {e.code}: {e.read()[:600].decode('utf-8', 'replace')}")
    except OSError as e:
        if h["proc"] is not None:                       # a dying server closes the socket before its last words reach the log (2303)
            try:
                h["proc"].wait(5)
            except subprocess.TimeoutExpired:
                pass
        dead = h["proc"] is not None and h["proc"].poll() is not None
        raise RuntimeError(f"its server {'ended' if dead else 'did not answer'} ({e}): " + _log_tail(h))


def reference(h, wav, sr, text):
    import numpy as np
    import soundfile as sf
    wav = np.ascontiguousarray(wav, dtype=np.float32)
    p = h["refs"] / (hashlib.sha1(wav.tobytes()).hexdigest()[:16] + ".wav")
    if not p.is_file():
        sf.write(str(p), wav, int(sr), subtype="PCM_16")
    return {"path": str(p), "text": " ".join(str(text or "").split())}


def task(b):
    """HERESY 2419: the speech request as audio.cpp's /v1/tasks/run takes it, so its result carries the codes (drama3_take) beside the sound."""
    r = {"text": b["input"], "max_tokens": b["max_tokens"], "options": dict(b["options"])}
    for k in ("seed", "voice_ref", "reference_text"):
        if k in b:
            r[k] = b[k]
    return {"model": b["model"], "request": r}


def codes_of(res):
    """The piece's codec codes from a /v1/tasks/run result: {"codes": 10 codebooks × frames, "codec", "sample_rate", "hop"}, or None."""
    import base64
    for a in res.get("artifacts") or []:
        if a.get("kind") == "acoustic_tokens" and a.get("id") == "drama3_take":
            take = json.loads(base64.b64decode(a.get("payload") or ""))
            return {"codes": take["vq_codes"], "codec": "fish_drama3 (Fish Audio DAC, 10 codebooks)", "sample_rate": SR, "hop": 2048,
                    "schema": (a.get("meta") or {}).get("schema", "drama3_take_v1")}
    return None


def say(h, text, ref, opts):
    """One piece read whole (HERESY 2419): through /v1/tasks/run for the sound and its codes (h["last_codes"], which the worker keeps beside
    the piece); a server without that route reads it through /v1/audio/speech, the sound alone."""
    import base64
    import numpy as np
    import soundfile as sf
    b = body(text, ref, opts)
    while True:
        try:
            if h.get("tasks", True):
                try:
                    res = json.loads(_post(h, task(b), path="/v1/tasks/run"))
                    data = base64.b64decode(res["audio"])
                    try:
                        h["last_codes"] = codes_of(res)
                    except (ValueError, KeyError, TypeError) as e:
                        print(f"drama3: its codes not read: {e!r}", flush=True)
                    break
                except RuntimeError as e:
                    if " said 404" not in str(e) and " said 405" not in str(e):
                        raise
                    h["tasks"] = False                    # an older server: the speech route, without the codes
            data = _post(h, b)
            break
        except RuntimeError as e:
            if not _more_banks(h, e):
                raise
            _up(h)
    w, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return np.ascontiguousarray(w.mean(1)), int(sr)


def state(h):
    """What the lab shows of this engine now: its tier, the banks in RAM (more after an out-of-memory), the restarts."""
    return {"tier": h["tier"], "model": h["model"].name, "cel": h["cel"], "retries": h["retries"], "device": h["device"],
            **({"vulkan": h.get("vk_name")} if h["device"] == "xpu" else {})}
