#!/usr/bin/env python3
"""HERESY 2989 (Viktor 25.11.2026: «По всем моделям и по не ASCII путям с пробелами всё зафикси в Windows порте»): the Studio's two other
Pythons on Windows, made by the uv and the Python 3.12 the install brought (launcher/install.ps1: tmp/uv, tmp/python), as Linux makes them:

    art    .venv-art, the Artist's and the Videographer's: lab/requirements-art.txt, as lab/install-venv.sh --art makes it
    read   .venv-read, the Narrator's Higgs TTS 3: torch and torchaudio at TORCH, transformers at TRANSFORMERS, as tools/narrator-higgs-setup.sh
           --python makes it (lab/test_win_tools_2989.py holds the pins equal to that script's)

PyTorch for the card (CUDA 12.8 wheels) when nvidia-smi answers with a card of compute 7.5 or newer, the oldest PyTorch's CUDA 12.8 wheels
run on (HERESY 2686, as install.ps1 decides for .venv); for the processor otherwise. A Python that went in whole carries the mark ruach-made,
and only then is it «here» (a cut install is made again where it stopped, uv keeping what came).

    python launcher/venvs_win.py art|read [--cpu] [--check] [--plan]
Exit 0 when it is here (or was made), 1 when not, 2 for arguments it does not take.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent
NT = os.name == "nt"
CUDA_INDEX = "https://download.pytorch.org/whl/cu128"
CPU_INDEX = "https://download.pytorch.org/whl/cpu"
TORCH, TRANSFORMERS = "2.11.0", "5.19.0"                # tools/narrator-higgs-setup.sh's (11.11.2026: Whisper heard its three test pieces word for word)
MADE = "ruach-made"
ENVS = {
    "art": {"dir": ".venv-art", "what": "the Artist's and the Videographer's Python",
            "check": "import torch, transformers, diffusers, gguf"},
    "read": {"dir": ".venv-read", "what": "the Narrator's Python for Higgs TTS 3",
             "check": "import torch, torchaudio, soundfile, numpy, safetensors, transformers"},
}


def python_of(name, root=ROOT, nt=None):
    nt = NT if nt is None else nt
    d = Path(root) / ENVS[name]["dir"]
    return d / "Scripts" / "python.exe" if nt else d / "bin" / "python"


def here(name, root=ROOT, nt=None):
    return python_of(name, root, nt).is_file() and (Path(root) / ENVS[name]["dir"] / MADE).is_file()


def smi(nt=None):
    if NT if nt is None else nt:
        c = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "nvidia-smi.exe"
        if c.is_file():
            return str(c)
    return shutil.which("nvidia-smi")


def device(caps=None, nt=None):
    """«cuda» when a card of compute 7.5 or newer answers (CAPS: the compute capabilities nvidia-smi lists; asked when None), else «cpu»."""
    if caps is None:
        caps, s = [], smi(nt)
        if s:
            try:
                r = subprocess.run([s, "--query-gpu=compute_cap", "--format=csv,noheader"], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace")
                caps = [float(x) for x in re.findall(r"\d+\.\d+", r.stdout)] if r.returncode == 0 else []
            except (OSError, subprocess.SubprocessError):
                caps = []
    return "cuda" if any(c >= 7.5 for c in caps) else "cpu"


def art_requirements(root, dev):
    """lab/requirements-art.txt for this machine, as setup_win.requirements makes .venv's: the CUDA index and +cu128 pins for the card,
    PyTorch's CPU index and plain pins for the processor."""
    out = []
    for line in (Path(root) / "lab" / "requirements-art.txt").read_text(encoding="utf-8").splitlines():
        s = line.split("#", 1)[0].strip()
        if not s or s.startswith("-e "):
            continue
        if s.startswith("--extra-index-url"):
            s = f"--extra-index-url {CPU_INDEX}" if dev == "cpu" else s
        elif dev == "cpu":
            s = re.sub(r"\+cu\d+", "", s)
        out.append(s)
    return out


def plan(name, root=ROOT, dev="cuda", uv="uv", nt=None):
    """The commands that make it, in order (nothing run): the venv by uv with the install's Python 3.12, its packages by uv, then its imports."""
    root = Path(root)
    d, py = root / ENVS[name]["dir"], python_of(name, root, nt)
    cmds = [] if py.is_file() else [[uv, "venv", "--python", "3.12", "--seed", str(d)]]
    pip = [uv, "pip", "install", "--python", str(py)]
    if name == "art":
        req = root / "tmp" / f"requirements-art-{dev}.txt"
        cmds.append(pip + ["--index-strategy", "unsafe-best-match", "-r", str(req)])
    else:
        idx = CUDA_INDEX if dev == "cuda" else CPU_INDEX
        cmds.append(pip + [f"torch=={TORCH}", f"torchaudio=={TORCH}", "--index-url", idx])
        cmds.append(pip + [f"transformers=={TRANSFORMERS}", "soundfile", "numpy", "safetensors", "accelerate"])
    cmds.append([str(py), "-c", ENVS[name]["check"]])
    return cmds


def env_for(root=ROOT):
    """uv's environment as install.ps1 sets it: the Python it brought (tmp/python), its cache in tmp/uv-cache, copies (no links)."""
    root = Path(root)
    return dict(os.environ, UV_PYTHON_INSTALL_DIR=str(root / "tmp" / "python"), UV_CACHE_DIR=str(root / "tmp" / "uv-cache"),
                UV_LINK_MODE="copy", PYTHONUTF8="1")


def make(name, root=ROOT, dev=None, out=None, run=subprocess.run, uv=None, nt=None):
    """Made: None, or why not in plain words. What uv says goes to OUT a line at a time."""
    out = out or (lambda s: print(s, flush=True))
    root = Path(root)
    if here(name, root, nt):
        return None
    if uv is None:
        import setup_win                               # the uv the install brought (tmp/uv)
        uv = setup_win.uv()
    if not uv:
        return "no uv here to make it: run the install again (RuachStudio.exe, or launcher\\install.ps1)"
    dev = dev or device(nt=nt)
    if name == "art":
        req = root / "tmp" / f"requirements-art-{dev}.txt"
        try:
            req.parent.mkdir(parents=True, exist_ok=True)
            req.write_text("\n".join(art_requirements(root, dev)) + "\n", encoding="utf-8")
        except OSError as e:
            return f"lab/requirements-art.txt could not be read or written into tmp/: {e.strerror or e}"
    out(f"          {ENVS[name]['dir']}, {ENVS[name]['what']}, with PyTorch for the {'card (CUDA 12.8)' if dev == 'cuda' else 'processor'}: "
        "a few GB the first time")
    for c in plan(name, root, dev, uv, nt):
        try:
            r = run(c, env=env_for(root), stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", errors="replace")
        except OSError as e:
            return f"{Path(c[0]).name} did not start: {e}"
        said = ((r.stdout or "") + (r.stderr or "")).strip().splitlines()
        if r.returncode:
            return f"{' '.join(Path(c[0]).name if i == 0 else x for i, x in enumerate(c[:3]))} failed: {(said or ['it said nothing'])[-1][:240]}"
    (root / ENVS[name]["dir"] / MADE).write_text(f"{dev}\n", encoding="utf-8")
    return None


def main(argv):
    names = [a for a in argv if a in ENVS]
    if len(names) != 1 or any(a not in ENVS and a not in ("--cpu", "--check", "--plan") for a in argv):
        print("python launcher/venvs_win.py art|read [--cpu] [--check] [--plan]", file=sys.stderr)
        return 2
    n = names[0]
    dev = "cpu" if "--cpu" in argv else None
    if "--plan" in argv:
        print(json.dumps(plan(n, ROOT, dev or device(), "uv"), indent=1))
        return 0
    if "--check" in argv:
        ok = here(n)
        print(f"{'here' if ok else 'missing'}  {ENVS[n]['dir']} ({ENVS[n]['what']})")
        return 0 if ok else 1
    why = make(n, ROOT, dev)
    print(f"{ENVS[n]['dir']}: {why}" if why else f"{ENVS[n]['dir']} is ready: {python_of(n)}")
    return 1 if why else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
