#!/usr/bin/env python3
"""HERESY 2649 (Viktor 16.11.2026: «Виндоуз порт не должен уступить нашей Linux кухне ни на йоту»): start.sh's twin in Python, for the
native Windows Studio (and any machine without bash). Linux keeps start.sh; this one reads the same files and picks the same way:

  the card      user/gpus.json's «studio» (YUE2CPP_GPU overrides), checked by lab/gpu_guard.py (no heavy stranger, 8 GB free), else the
                freest that passes; a card past 0 named to the engine as GGML_BACKEND=CUDAn (CUDA_DEVICE_ORDER=PCI_BUS_ID)
  the backbone  YUE2CPP_QUANT, else settings.json's «model», else RS-TW 2.0x0.75 then RS-FW 2.4x0.75 at the fullest quant here, else
                m-a-p's own (BF16, Q8_0, Q6_K, Q5_K_M); a named one gone starts the default, said
  the decoders  RS x3 v1 first (the default), v2, then Standard; every other backbone present, by its file's name
  the rest      the transcriber pair (F32, the Q8_0 one beside it), SheetSage2-Refined, LoRAs, FP16 matmul on compute 7.x, the batch
  the engine    HERESY 2686: the Windows package brings two, engine\\cuda when nvidia-smi answers with a card, else engine\\cpu (YUE2_ENGINE=cpu
                or cuda chooses); else engine/ itself (the Mac package, an engine unpacked by hand), else what was built here (build/build)

    python launcher/start.py            run the engine (its log in this window)
    python launcher/start.py --dry-run  print the command only (YUE2CPP_DRY_RUN=1 too)
Extra arguments go to yue-server (for example --keep-loaded).
"""
import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent   # not resolve(): in the dev Studio launcher/ is a link into heresy/root
sys.path.insert(0, str(ROOT / "lab"))
import paths  # noqa: E402  the weights' places, as launcher/paths.sh says them
import winx  # noqa: E402
winx.utf8_console()   # HERESY 2935: this window in UTF-8 (code page 866 garbled yue-server's Cyrillic in it), this script's output too
winx.runtime_path(ROOT)   # HERESY 2989: the Windows package's programs (runtime/ffmpeg, runtime/fluidsynth) first on PATH
NT = os.name == "nt"
EXE = ".exe" if NT else ""


def say(s=""):
    print(s, flush=True)


def jload(p, default=None):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def bb(name):
    """A backbone's file by its name (Q8_0, RS-TW-2.0x0.75-Q8_0, IRA-Q8_0), wherever under models/engine/ it lies."""
    return Path(paths.engine_gguf(f"YuE2-{name}.gguf" if name.startswith("4.6B-") else f"YuE2-3B-{name}.gguf", ROOT))   # HERESY 2660


def size(p):
    try:
        n = Path(p).stat().st_size
    except OSError:
        return "?"
    for u in ("B", "K", "M", "G", "T"):
        if n < 1024 or u == "T":
            return f"{n:.1f}{u}" if u not in ("B", "K") else f"{n:.0f}{u}"
        n /= 1024


def engine_bin(card=False):
    """The engine. HERESY 2686: the Windows package's engine\\cuda when a card answers (card), else its engine\\cpu; YUE2_ENGINE=cpu or
    cuda takes that one only. Then engine/ itself (the Mac package, an engine unpacked by hand), then build/build (Linux, built here) and
    the Windows build's folders."""
    want = os.environ.get("YUE2_ENGINE", "").strip().lower()
    kinds = (want,) if want in ("cpu", "cuda") else ("cuda", "cpu") if card else ("cpu", "cuda")
    for p in [ROOT / "engine" / k / f"yue-server{EXE}" for k in kinds] + [
              ROOT / "engine" / f"yue-server{EXE}", ROOT / "build" / "build" / f"yue-server{EXE}",
              ROOT / "build" / "build" / "Release" / f"yue-server{EXE}", ROOT / "build" / "build" / "bin" / f"yue-server{EXE}"]:
        if p.is_file():
            return p
    return ROOT / "engine" / kinds[0] / f"yue-server{EXE}" if NT else ROOT / "engine" / f"yue-server{EXE}"


def smi():
    """nvidia-smi on PATH, or in Windows' System32; None without it (WSL's /usr/lib/wsl/lib went out with the WSL port, HERESY 2999)."""
    s = shutil.which("nvidia-smi")
    if not s and NT:
        c = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "nvidia-smi.exe"
        s = str(c) if c.is_file() else None
    return s


def card_answers(s):
    """HERESY 2686: nvidia-smi lists a card (a driver left behind without its card answers with an error, and gets the CPU engine)."""
    if not s:
        return False
    try:
        r = subprocess.run([s, "-L"], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace")
    except (OSError, subprocess.SubprocessError):
        return False
    return r.returncode == 0 and "GPU " in r.stdout


def listen_host(env):
    """HERESY 2936 (Viktor 21.11.2026: «Для Windows по умолчанию только этот компьютер, конечно… Тогда запроса нет»): where the engine
    listens. On this computer alone (127.0.0.1) while user/access.json says «this computer only», and a first start on Windows or macOS
    writes that there, so neither system's firewall asks anything; private networks or a list, chosen in Engine → Security, on every
    address (0.0.0.0) from the next start, the firewall asking once. A broken file is private networks, as the engine reads it. Linux
    keeps start.sh (every address, the engine's gate deciding). YUE2CPP_HOST overrides."""
    if env.get("YUE2CPP_HOST"):
        return env["YUE2CPP_HOST"]
    p = Path(env.get("RUACH_ACCESS") or ROOT / "user" / "access.json")
    try:
        mode = json.loads(p.read_text(encoding="utf-8")).get("mode")
    except FileNotFoundError:
        if not (NT or sys.platform == "darwin"):
            return "0.0.0.0"                       # no decision yet: private networks, as the engine answers them
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps({"mode": "local", "nets": []}, indent=1) + "\n", encoding="utf-8")
            say("  access       this computer only, written to user/access.json (a first start here: no firewall question); "
                "Engine → Security opens it to your network")
        except OSError as e:
            say(f"  access       user/access.json could not be written ({e}): this computer only all the same")
        return "127.0.0.1"
    except (OSError, ValueError, AttributeError):
        mode = "private"
    return "127.0.0.1" if mode == "local" else "0.0.0.0"


def main(argv):
    dry = "--dry-run" in argv or bool(os.environ.get("YUE2CPP_DRY_RUN"))
    extra = [a for a in argv if a != "--dry-run"]
    env = os.environ
    env["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"
    env["PYTHONUNBUFFERED"] = "1"
    env["TMPDIR"] = env["TMP"] = env["TEMP"] = str(ROOT / "tmp") if not NT else env.get("TEMP", str(ROOT / "tmp"))
    (ROOT / "tmp").mkdir(exist_ok=True)
    py = sys.executable

    # the weights moved into models/<room>/ once (an install of 2.0.6), before anything is read
    subprocess.run([py, str(ROOT / "lab" / "migrate_models.py"), "--auto"], cwd=str(ROOT))

    # the card (HERESY 1091, 1109, 1112, 1113)
    studio_gpu = env.get("YUE2CPP_GPU", "")
    if not studio_gpu:
        studio_gpu = str(int((jload(ROOT / "user" / "gpus.json", {}) or {}).get("studio", 0) or 0))
    if studio_gpu.isdigit() and int(studio_gpu) >= 100:
        studio_gpu = "0"                                # an Arc's index (SYCL is the Linux engine's for now)
    guard_say = ""
    s = smi()
    binp = engine_bin(card_answers(s))
    cpu_engine = binp.parent.name == "cpu"              # HERESY 2686: the package's CPU engine takes no card, so no guard and no CUDAn
    if not env.get("YUE2CPP_GPU") and s and not cpu_engine:
        r = subprocess.run([py, str(ROOT / "lab" / "gpu_guard.py"), "--pick", studio_gpu or "0", "8000"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        pick, told = r.stdout.strip(), r.stderr.strip()
        if pick and pick != (studio_gpu or "0"):
            guard_say, studio_gpu = f"GPU{studio_gpu or 0} did not pass the guard; GPU{pick} instead · {told}", pick
        elif not pick:
            guard_say = f"no card passes the guard; GPU{studio_gpu or 0} all the same, it may run out of memory · {told}"
    if studio_gpu and studio_gpu != "0" and not env.get("GGML_BACKEND") and not cpu_engine:
        env["GGML_BACKEND"] = "CUDA" + studio_gpu

    port = env.get("YUE2CPP_PORT", "7777")
    batch = env.get("YUE2CPP_BATCH", "2")

    # the backbone (HERESY 1794, 2065, 2183)
    quant = env.get("YUE2CPP_QUANT", "") or str((jload(ROOT / "settings.json", {}) or {}).get("model") or "")

    def studio_default():
        for m in ("RS-TW-2.0x0.75", "RS-FW-2.4x0.75"):
            for q in ("BF16", "Q8_0", "Q6_K"):
                if bb(f"{m}-{q}").is_file():
                    return f"{m}-{q}"
        return ""
    if not quant:
        quant = studio_default()
    if quant and not bb(quant).is_file():
        wanted, quant = quant, studio_default() or quant
        if quant != wanted:
            say(f"no {bb(wanted).name}: using {quant}, the Studio's default")
    if not quant or not bb(quant).is_file():
        wanted = quant
        quant = next((q for q in ("BF16", "Q8_0", "Q6_K", "Q5_K_M") if bb(q).is_file()), "") or wanted or "BF16"
        if wanted and quant != wanted:
            say(f"no {bb(wanted).name}: using {quant}")

    model = bb(quant)
    vae_dir, misc = Path(paths.at(paths.ENGINE_VAE, ROOT)), Path(paths.at(paths.MISC, ROOT))
    vae = vae_dir / "YuE2-Vae-F32.gguf"
    outputs = ROOT / "outputs"
    transcriber = misc / "SheetSage2-F32.gguf"
    if not (transcriber.is_file() and (misc / "MERT-v2-FullSong-F32.gguf").is_file()):
        transcriber = misc / "SheetSage2-Q8_0.gguf"
    if not transcriber.is_file():
        transcriber = misc / "SheetSage2-F32.gguf"
    small = misc / "SheetSage2-Q8_0.gguf" if (transcriber.name == "SheetSage2-F32.gguf" and (misc / "SheetSage2-Q8_0.gguf").is_file()
                                              and (misc / "MERT-v2-FullSong-Q8_0.gguf").is_file()) else None
    missing = [p for p in (binp, model, vae) if not p.is_file()]
    for p in missing:
        say(f"missing {p.relative_to(ROOT) if ROOT in p.parents else p}")
    if missing:
        say("the engine comes with the package (engine\\cuda and engine\\cpu on Windows, engine/ on a Mac), the models from the installer or Engine -> Models")
        return 1

    host = listen_host(env)                            # HERESY 2936: this computer alone on Windows and macOS until Engine → Security opens it
    args = ["--host", host, "--port", port, "--model", f"{quant}={model}"]
    for rs in ("v1", "v2"):                             # HERESY 2306: RS x3 v1 first, the default
        f = vae_dir / f"YuE2-VAE-RS-x3_{rs}-F32.gguf"
        if f.is_file():
            args += ["--vae", f"rs-x3-{rs}={f}"]
    args += ["--vae", f"standard={vae}", "--outputs", str(outputs), "--max-batch", batch, "--settings", str(ROOT / "settings.json")]
    models = [f"{quant} {size(model)} starts"]
    others = ["BF16", "Q8_0", "Q6_K", "Q5_K_M"]
    for f in paths.backbones(ROOT):                     # HERESY 1490, 2330: every merge present, by its file's name
        n = Path(f).name
        n = n[len("YuE2-3B-"):] if n.startswith("YuE2-3B-") else n[len("YuE2-"):] if n.startswith("YuE2-") else n   # HERESY 2660: «4.6B-X»
        n = n[:-5] if n.endswith(".gguf") else n
        if "-" in n:
            others.append(n)
    for q in others:
        if q != quant and bb(q).is_file():
            args += ["--model", f"{q}={bb(q)}"]
            models.append(f"{q} {size(bb(q))}")

    # the card's name, memory and compute capability; FP16 matmul on compute 7.x (RTX 20, Volta)
    gpu_name = cc = ""
    gpu_used = gpu_total = 0.0
    if s:
        r = subprocess.run([s, "-i", studio_gpu or "0", "--query-gpu=name,memory.used,memory.total,compute_cap", "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        line = (r.stdout.strip().splitlines() or [""])[0]
        parts = [x.strip() for x in line.split(",")]
        if len(parts) == 4:
            gpu_name, cc = parts[0], parts[3]
            try:
                gpu_used, gpu_total = float(parts[1]), float(parts[2])
            except ValueError:
                pass
    on_gpu = env.get("CUDA_VISIBLE_DEVICES", "all") != "" and not env.get("GGML_BACKEND", "").startswith("CPU") and not cpu_engine
    fp16 = env.get("YUE2CPP_FP16_MATMUL", "auto")
    if fp16 == "auto":
        fp16 = "1" if (on_gpu and cc.startswith("7.")) else "0"
    if fp16 == "1":
        args.append("--fp16-matmul")

    loras = ROOT / "loras"
    if loras.is_dir():
        args += ["--loras", str(loras)]
    mert = misc / ("MERT-v2-FullSong-" + transcriber.name.rsplit("-", 1)[-1])
    if transcriber.is_file() and mert.is_file() and transcriber.stat().st_size < 500_000_000:
        args += ["--transcriber", str(transcriber)]
        if small:
            args += ["--transcriber-small", str(small)]
        refined = misc / "SheetSage2-Refined-F16.gguf"
        if refined.is_file():
            args += ["--transcriber-refined", str(refined)]

    # what this start is, said as start.sh says it
    try:
        lan = socket.gethostbyname(socket.gethostname())
    except OSError:
        lan = "127.0.0.1"
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip() if (ROOT / "VERSION").is_file() else "?"
    if host.startswith("127."):                         # HERESY 2936
        say(f"Ruach Studio {version} · {ROOT.name}  http://127.0.0.1:{port}")
        say(f"The Studio's port: {port}  · this computer only: http://127.0.0.1:{port}  · Engine → Security opens it to your network")
    else:
        say(f"Ruach Studio {version} · {ROOT.name}  http://{lan}:{port}")
        say(f"The Studio's port: {port}  · this machine: http://127.0.0.1:{port}  · your network: http://{lan}:{port}")
    if guard_say:
        say("guard " + guard_say)
    if gpu_name and on_gpu:
        say(f"  gpu          {gpu_name} · {gpu_used / 1024:.1f} of {gpu_total / 1024:.1f} GiB in use · compute {cc}")
    elif gpu_name:
        say("  gpu          hidden: this run uses the CPU (" + ("the CPU engine, YUE2_ENGINE=cpu" if cpu_engine else
                                                               "GGML_BACKEND=CPU or an empty CUDA_VISIBLE_DEVICES") + ")")
    elif sys.platform == "darwin":
        say("  gpu          Apple GPU (Metal) · memory shared with macOS")
    else:
        say("  gpu          no NVIDIA GPU found: runs on the CPU (slow)")
    if fp16 == "1":
        say(f"  matmul       FP16 tensor cores (compute {cc} has no BF16 tensor cores; YUE2CPP_FP16_MATMUL=0 turns it off)")
    say("  backbones    " + ", ".join(models))
    kind = binp.parent.name if binp.parent.name in ("cuda", "cpu") else ""   # HERESY 2686: which of the package's two runs
    say("  engine       " + (f"engine{os.sep}{kind} · " if kind else "") + "up to " + (f"{batch} songs" if batch != "1" else "1 song") + " per pass")
    page = ROOT / "build" / "tools" / "public" / "index.html"
    env["RUACH_PAGE"] = str(page)
    if not page.is_file():
        say("the page is missing (build/tools/public/index.html): the Windows package brings it built")
    cmd = [str(binp)] + args + extra
    if dry:
        say(subprocess.list2cmdline(cmd) if NT else " ".join(cmd))
        return 0
    try:                                                # HERESY 2936: where it listens, for Engine → Security's words (lab/listen.py)
        (ROOT / "tmp" / "engine-listen.json").write_text(json.dumps({"host": host, "port": int(port), "pid": os.getpid()}) + "\n", encoding="utf-8")
    except (OSError, ValueError):
        pass
    os.chdir(str(ROOT))
    if NT:                                              # Windows has no exec: the engine runs as this script's child, its exit is ours
        return subprocess.call(cmd, env=env)
    os.execvpe(cmd[0], cmd, env)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
