"""HERESY 1834 (Viktor 28.10.2026: «вживляй MuScriptor в Студию — в паспорт треков и в самого Огранщика»; «забирай large модель muscriptor, и
пропишешь все три размера в Engine. Автоматом предлагаем large для нормальной видеокарты»): a take, a stem or any sound of a take's tree into
multi-instrument MIDI with MuScriptor (Mirelo and Kyutai; its weights CC BY-NC 4.0, non-commercial use only) through
build/build-muscriptor/ruach-muscriptor (muscriptor.cpp, MIT, on ggml; build.sh builds it). The weights are fetched by Engine → Models
(fetch-heresy.sh --muscriptor SIZE) into models/muscriptor/v1/.

One transcription at a time: the program's threads wait on each other between operations, and two runs at once slow both several times. The
sound goes in as 16 kHz mono float32 (ffmpeg); the program's lines give the progress; the lab keeps the set under the take's derived/, as the
stems are (lab.py's midi_async).

Prelude forcing (the reference's default: notes still sounding carried into the next 5 s chunk) is off: with it the medium model filled a
gospel take of 100 s with woodwinds that were not there (2719 notes, 877 of them a bassoon, in 580 s), without it 651 notes, the piano, the
voice, the drums and the bass, in 70 s. Off, a note held across a chunk's edge may come back as two."""
import json
import os
import subprocess
import threading
from pathlib import Path

SIZES = ("small", "medium", "large")
BYTES = {"small": 209425152, "medium": 618442496, "large": 2739142176}
_DEV = {}
_ONE = threading.Lock()


def binary(kit):
    return Path(kit) / "build" / "build-muscriptor" / "ruach-muscriptor"


def weights(kit, size):
    return Path(kit) / "models" / "muscriptor" / "v1" / f"muscriptor-{size}-f16.gguf"


def here(kit):
    """The sizes here, whole, smallest first."""
    out = []
    for s in SIZES:
        f = weights(kit, s)
        try:
            if f.is_file() and f.stat().st_size == BYTES[s]:
                out.append(s)
        except OSError:
            pass
    return out


def devices(kit):
    """The devices the program can run on, asked once a build: [(backend, MB, name)]. The cards are hidden from it for the asking."""
    b = binary(kit)
    try:
        key = (str(b), b.stat().st_mtime_ns)
    except OSError:
        return []
    if key not in _DEV:
        try:
            out = subprocess.run([str(b), "--devices"], capture_output=True, text=True, timeout=60,
                                 env=dict(os.environ, CUDA_VISIBLE_DEVICES="")).stdout
        except (OSError, subprocess.SubprocessError):
            out = ""
        _DEV.clear()
        _DEV[key] = [(p[2], int(p[3]), " ".join(p[4:])) for p in (line.split() for line in out.splitlines())
                     if len(p) >= 5 and p[0] == "DEVICE" and p[3].isdigit()]
    return _DEV[key]


def suggest(kit):
    """large where the program runs on a card of 8 GB or more; else small (on the processor large is several times slower than the song)."""
    return "large" if any(b != "CPU" and mb >= 8000 for b, mb, _ in devices(kit)) else "small"


def pick(kit, size=""):
    """The size asked (it must be here); else the suggested one if here; else, with a card the biggest here, without one the smallest."""
    h = here(kit)
    if size:
        if size not in SIZES:
            raise ValueError("the size is small, medium or large")
        if size not in h:
            raise FileNotFoundError(f"the {size} MuScriptor model is not here: Engine → Models → Sound to MIDI fetches it")
        return size
    s = suggest(kit)
    if s in h:
        return s
    return (h[-1] if s == "large" else h[0]) if h else None


def threads():
    """Half the processor at most (the lab's own rule for its CPU work), 16 at most: past 16 it went no faster (28.10.2026, 64 threads)."""
    return max(2, min(16, (os.cpu_count() or 4) // 2))


def status(kit):
    """For the page: is the program built, the sizes here, the suggested one, the devices."""
    return {"built": binary(kit).is_file(), "here": here(kit), "suggest": suggest(kit), "sizes": list(SIZES),
            "devices": [{"backend": b, "mb": mb, "name": n} for b, mb, n in devices(kit)], "threads": threads(),
            "licence": "MuScriptor (Mirelo and Kyutai): CC BY-NC 4.0, non-commercial use only"}


def run(kit, audio, out, size, only="", job=None):
    """A sound (anything ffmpeg reads) into out/: song.mid (a track an instrument, the drums on channel 10, every note at velocity 100: the
    model gives none) and notes.json ([onset, offset, pitch, program, drum] and the instruments with their counts). Returns notes.json read."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    raw = out / "sound.f32"
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(audio), "-ac", "1", "-ar", "16000", "-f", "f32le", str(raw)],
                       capture_output=True, text=True, timeout=900)
    if p.returncode != 0 or not raw.is_file():
        raise RuntimeError("ffmpeg did not read the sound: " + (p.stderr.strip()[-200:] or "no output"))
    args = [str(binary(kit)), "--model", str(weights(kit, size)), "--in", str(raw), "--json", str(out / "notes.json"),
            "--mid", str(out / "song.mid"), "--threads", str(threads()), "--device", "cpu", "--no-prelude"]
    if only:
        args += ["--only", only]
    err = ""
    with _ONE:
        if job is not None:
            job["status"] = "running"
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
                                env=dict(os.environ, CUDA_VISIBLE_DEVICES=""))
        for line in proc.stdout:
            parts = line.split()
            if job is not None:
                if parts[:1] == ["PROGRESS"] and len(parts) >= 4:
                    job["progress"], job["notes"] = float(parts[1]), int(parts[3])
                elif parts[:1] == ["LOAD"] and len(parts) >= 2:
                    job["loading"] = float(parts[1])
                elif parts[:1] == ["DEVICE"]:
                    job["device"] = " ".join(parts[1:])
                if job.get("cancel"):
                    proc.kill()
            if parts[:1] == ["ERROR"]:
                err = line[6:].strip()
        rc = proc.wait()
    raw.unlink(missing_ok=True)
    if job is not None and job.get("cancel"):
        raise RuntimeError("stopped")
    if rc != 0:
        raise RuntimeError(err or f"the transcriber stopped ({rc})")
    return json.load(open(out / "notes.json", encoding="utf-8"))
