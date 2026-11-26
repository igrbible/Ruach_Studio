#!/usr/bin/env python3
"""HERESY 2649 (the native Windows port): the Studio's Python on Windows, run by launcher/install.ps1 in the fresh .venv: the lab's packages
(lab/requirements.txt as on Linux: CUDA 12.8 wheels, or the CPU ones with --cpu for a machine without an NVIDIA card), the pinned downloader
(tools/downloader-requirements.txt), psutil (lab/winx.py reads the processor and memory through it), then the models a song needs
(launcher/fetch_models.py) and their cards (launcher/fetch_cards.py). Safe to run again: what is here stays.

    .venv\\Scripts\\python launcher\\setup_win.py [--cpu | --torch-cpu] [--yes] [--no-models]

--torch-cpu (HERESY 2686): the lab's packages for the processor and the models for the card, for a card older than PyTorch's CUDA 12.8
wheels (compute below 7.5, Pascal and Volta: install.ps1 asks nvidia-smi); the engine sings on the card all the same.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent


def uv():
    for c in (ROOT / "tmp" / "uv" / "uv.exe", ROOT / "tmp" / "uv" / "uv"):
        if c.is_file():
            return str(c)
    return shutil.which("uv")


MAC = sys.platform == "darwin"
# HERESY 2933 (the 2.1.0-rc1 Windows soak: no gguf, no mido in the VM's venv): what lab/install-venv.sh puts in beside lab/requirements.txt
# on Linux, the same pins (lab/test_win_extras_2933.py holds the two lists equal): gguf for the LoRA's measure (lora_alchemy) and the painter's
# GGUF, pretty_midi (mido with it) for the score's MIDI (2927), mir_eval for the transcriber's measures
EXTRA = ["gguf==0.19.0", "mir_eval==0.8.2", "pretty_midi==0.2.10"]
# HERESY 2986 (the check of 2984: the upscale ended «No module named 'universr'» on Windows while Engine → Models said it was here): what UniverSR's
# inference imports that only its own «pip install -e vendor/UniverSR» brings on Linux (lab/install-venv.sh), pinned as lab/requirements-lock.txt;
# its code is read where Engine → Models puts it, vendor/UniverSR (lab/upscale_job.py), with no editable install (fetch_heresy.py brings these too)
UNIVERSR = ["einops==0.8.2", "timm==1.0.30", "torchdiffeq==0.2.5"]


def requirements(cpu):
    """lab/requirements.txt for this machine: the CUDA index and +cu128 pins, or the CPU index and plain pins; Linux-only lines out."""
    out = []
    for line in (ROOT / "lab" / "requirements.txt").read_text(encoding="utf-8").splitlines():
        s = line.split("#", 1)[0].strip()
        if not s or s.startswith("-e "):
            continue
        if s.startswith("--extra-index-url"):
            if MAC:
                continue                                # a Mac: PyPI's torch (MPS), no CUDA index
            s = "--extra-index-url https://download.pytorch.org/whl/cpu" if cpu else s
        elif cpu or MAC:
            s = re.sub(r"\+cu\d+", "", s).replace("audio-separator[gpu]", "audio-separator[cpu]")
        out.append(s)
    out += EXTRA + UNIVERSR + ["psutil"]
    p = ROOT / "tmp" / ("requirements-win-cpu.txt" if cpu else "requirements-win.txt")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    return p


def msvc_runtime():
    """HERESY 2685 (found 18.11.2026 on a clean Windows 11: «Error loading torch\\lib\\c10.dll… Microsoft Visual C++ Redistributable is not
    installed»): a fresh Windows has no msvcp140.dll, and PyTorch's DLLs (any C++ extension) need it. The package's engine carries the MSVC
    runtime app-local, as Microsoft lets it be redistributed; the same files go beside the Studio's own python.exe, the folder Windows
    searches for every DLL the lab loads. The missing ones only, never over Python's own, and never into a Python outside the Studio."""
    if os.name != "nt":
        return
    base = Path(sys.base_prefix)
    if not str(base).lower().startswith(str(ROOT).lower() + os.sep):
        print(f"the MSVC runtime: {base} is not the Studio's own Python; PyTorch needs Microsoft's Visual C++ Redistributable there", flush=True)
        return
    for d in (ROOT / "engine" / "cpu", ROOT / "engine" / "cuda", ROOT / "engine"):
        dlls = [f for f in (d.glob("*.dll") if d.is_dir() else [])
                if re.fullmatch(r"(msvcp140.*|vcruntime140.*|concrt140|vcomp140|vccorlib140)\.dll", f.name, re.I)]
        if not dlls:
            continue
        put = []
        for f in dlls:
            if not (base / f.name).exists():
                shutil.copy2(f, base / f.name)
                put.append(f.name)
        if put:
            print(f"── the MSVC runtime beside the Studio's python.exe ({len(put)} files from {d.relative_to(ROOT)})", flush=True)
        return
    print("the MSVC runtime: no engine folder here carries it; PyTorch needs Microsoft's Visual C++ Redistributable", flush=True)


def utf8_out():
    """HERESY 2935 (run by hand with its output in a file, cp1251 there, it ended on «──» with a UnicodeEncodeError): stdout and stderr in
    UTF-8, what cannot be said replaced. (lab/winx.utf8_console's own half: this script runs before the lab's packages.)"""
    for s in (sys.stdout, sys.stderr):
        try:
            if s is not None and (getattr(s, "encoding", "") or "").lower().replace("-", "").replace("_", "") != "utf8":
                s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError, OSError):
            pass


def main(argv):
    utf8_out()
    ap = argparse.ArgumentParser()
    ap.add_argument("--cpu", action="store_true", help="the CPU wheels (no NVIDIA card)")
    ap.add_argument("--torch-cpu", action="store_true", help="the CPU wheels, the card's models (a card below compute 7.5)")
    ap.add_argument("--yes", action="store_true", help="download the models without asking")
    ap.add_argument("--no-models", action="store_true")
    a = ap.parse_args(argv)
    u = uv()
    if not u:
        print("ruach install stopped: no uv (launcher/install.ps1 brings it into tmp/uv)")
        return 1
    req = requirements(a.cpu or a.torch_cpu)
    print(f"── the Studio's Python packages ({'CPU' if a.cpu or a.torch_cpu else 'CUDA 12.8'}): a few GB the first time", flush=True)
    env = dict(os.environ, UV_CACHE_DIR=str(ROOT / "tmp" / "uv-cache"), UV_LINK_MODE="copy", PYTHONUTF8="1")
    cmd = [u, "pip", "install", "--python", sys.executable, "--index-strategy", "unsafe-best-match", "-r", str(req),
           "-r", str(ROOT / "tools" / "downloader-requirements.txt")]
    r = subprocess.run(cmd, env=env)
    if r.returncode:
        print("ruach install stopped: the Python packages did not install (the lines above say which)")
        return 1
    msvc_runtime()
    if a.no_models:
        return 0
    print("── the models a song needs", flush=True)
    rc = subprocess.call([sys.executable, str(ROOT / "launcher" / "fetch_models.py")] + (["--yes"] if a.yes else []) + (["--quant", "Q5_K_M"] if a.cpu else []))
    # HERESY 2879, 3000: the model cards (licences and credits, a few KB) into models/misc/cards/, said card by card; one that does not come stops
    # nothing (Install again fetches it). Only Pinokio's install.js fetched them until rc3
    print("── the model cards: the models' licences and credits", flush=True)
    subprocess.call([sys.executable, str(ROOT / "launcher" / "fetch_cards.py")])
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
