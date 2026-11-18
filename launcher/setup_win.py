#!/usr/bin/env python3
"""HERESY 2649 (the native Windows port): the Studio's Python on Windows, run by launcher/install.ps1 in the fresh .venv: the lab's packages
(lab/requirements.txt as on Linux: CUDA 12.8 wheels, or the CPU ones with --cpu for a machine without an NVIDIA card), the pinned downloader
(tools/downloader-requirements.txt), psutil (lab/winx.py reads the processor and memory through it), then the models a song needs
(launcher/fetch_models.py). Safe to run again: what is here stays.

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
    out += ["psutil"]
    p = ROOT / "tmp" / ("requirements-win-cpu.txt" if cpu else "requirements-win.txt")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    return p


def main(argv):
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
    if a.no_models:
        return 0
    print("── the models a song needs", flush=True)
    return subprocess.call([sys.executable, str(ROOT / "launcher" / "fetch_models.py")] + (["--yes"] if a.yes else []) + (["--quant", "Q5_K_M"] if a.cpu else []))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
