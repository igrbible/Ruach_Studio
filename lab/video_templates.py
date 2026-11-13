"""HERESY 2396 (Viktor 11.11.2026: «караоке (HyperFrames), оформленные титры, шаблоны»): the Videographer's templates as HyperFrames compositions.
HyperFrames (HeyGen, Apache-2.0, npm «hyperframes») renders an HTML/CSS composition by seeking it frame by frame in headless Chrome and writes it with
its alpha (ProRes 4444 in a .mov); the clip lays it over the picture with ffmpeg's overlay. Measured 11.11.2026 on the Forge's processor: the verse
card (5.7 s at 24 fps, 1920 × 1080) in 20.6 s with two workers, software GPU, Chrome for Testing through tmp/cft-chrome.sh (off the Arc).

Nothing here downloads: HyperFrames is found where it was installed (RUACH_HYPERFRAMES, a folder holding node_modules/hyperframes), with Node 22 or
newer (RUACH_NODE or the PATH's), telemetry off. Without them available() says why, and no template is offered. Templates live beside this file in
video_templates/<name>/index.html; a template reads its words as HyperFrames variables and its font as font.ttf in its own folder."""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent / "video_templates"
TEMPLATES = ("verse-card",)


def _node():
    n = os.environ.get("RUACH_NODE") or shutil.which("node")
    if not n:
        return None, "no Node.js (22 or newer) on this machine"
    try:
        v = subprocess.run([n, "--version"], capture_output=True, text=True, timeout=20).stdout.strip()
        major = int(v.lstrip("v").split(".")[0])
    except (OSError, ValueError, subprocess.SubprocessError):
        return None, "Node.js does not answer"
    if major < 22:
        return None, f"Node.js {v}: HyperFrames needs 22 or newer"
    return n, ""


def _home():
    h = os.environ.get("RUACH_HYPERFRAMES")
    if h and (Path(h) / "node_modules" / "hyperframes" / "package.json").is_file():
        return Path(h)
    return None


def available():
    """{ok, why, version}: whether the templates can be drawn here."""
    n, why = _node()
    if not n:
        return {"ok": False, "why": why}
    h = _home()
    if not h:
        return {"ok": False, "why": "HyperFrames is not installed (RUACH_HYPERFRAMES names the folder holding node_modules/hyperframes)"}
    v = json.loads((h / "node_modules" / "hyperframes" / "package.json").read_text(encoding="utf-8")).get("version", "")
    return {"ok": True, "why": "", "version": v}


def render(name, variables, out, font=None, chrome=None, workers=2, timeout=900):
    """The template drawn with its alpha into out (.mov, ProRes 4444): its path. font: a .ttf/.otf for the template's own face (else DejaVu Sans)."""
    if name not in TEMPLATES:
        raise ValueError("no such template")
    a = available()
    if not a["ok"]:
        raise RuntimeError(a["why"])
    node, _ = _node()
    with tempfile.TemporaryDirectory(prefix="vdtpl-") as tmp:
        proj = Path(tmp) / name
        shutil.copytree(HERE / name, proj)
        if font:
            shutil.copyfile(font, proj / "font.ttf")
        env = dict(os.environ, HYPERFRAMES_NO_TELEMETRY="1", DO_NOT_TRACK="1")
        if chrome:
            env["HYPERFRAMES_BROWSER_PATH"] = str(chrome)
        entry = _home() / "node_modules" / "hyperframes" / "bin" / "hyperframes.mjs"   # the command itself (bin/ holds a font helper beside it)
        if not entry.is_file():
            raise RuntimeError("HyperFrames' command is missing from its folder")
        nice = ["nice", "-n", "19"] if shutil.which("nice") else []
        part = Path(str(out) + ".part.mov")
        p = subprocess.run(nice + [node, str(entry), "render", str(proj), "--format", "mov", "--workers", str(workers), "--no-browser-gpu", "--quiet",
                                   "--variables", json.dumps(variables, ensure_ascii=False), "-o", str(part)],
                           cwd=tmp, env=env, capture_output=True, text=True, timeout=timeout)
        if p.returncode != 0 or not part.is_file():
            part.unlink(missing_ok=True)
            raise RuntimeError("HyperFrames: " + ((p.stderr or p.stdout).strip()[-400:] or "no output"))
        part.replace(out)
    return Path(out)


def overlay(video, layer, out, at=0.0, threads="4"):
    """The layer (with its alpha) laid over the video from second at, the sound as it was; its path."""
    part = Path(str(out) + ".part.mp4")
    nice = ["nice", "-n", "19"] if shutil.which("nice") else []
    p = subprocess.run(nice + ["ffmpeg", "-v", "error", "-y", "-i", str(video), "-itsoffset", f"{float(at):.3f}", "-i", str(layer), "-filter_complex",
                               "[0:v][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]", "-map", "[v]", "-map", "0:a?", "-c:v", "libx264",
                               "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "-threads", threads, "-movflags", "+faststart", str(part)],
                       capture_output=True, text=True, timeout=3600)
    if p.returncode != 0 or not part.is_file():
        part.unlink(missing_ok=True)
        raise RuntimeError("ffmpeg, the overlay: " + (p.stderr.strip()[-300:] or "no output"))
    part.replace(out)
    return Path(out)
