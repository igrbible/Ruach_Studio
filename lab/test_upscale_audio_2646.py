"""HERESY 2646 (issue #9): the audio upscale run as its callers run it (lab.py, vupscale.py): AUDIO OUTDIR MODE SEEDS…, a second of sound, on the
card UniverSR needs (CUDA); skipped where its weights or a CUDA card are not on this machine."""
import os, subprocess, sys, tempfile, wave, struct, math
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import paths


def test_audio_upscale_runs():
    own = paths.at(paths.REFINER_UNIVERSR, HERE.parent)
    if not own.is_dir() or not any(own.iterdir()):
        print("skipped: no UniverSR weights here"); return
    d = Path(tempfile.mkdtemp())
    src = d / "a.wav"
    with wave.open(str(src), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes(b"".join(struct.pack("<hh", int(8000 * math.sin(2 * math.pi * 440 * i / 48000)), 0) for i in range(48000)))
    import torch
    if not torch.cuda.is_available():
        print("skipped: no CUDA card here (UniverSR runs on one)"); return
    env = dict(os.environ)
    r = subprocess.run([sys.executable, str(HERE / "upscale_job.py"), str(src), str(d / "out"), "subtle", "1000", "keep"], capture_output=True, text=True, env=env, timeout=1800)
    assert r.returncode == 0, r.stderr[-1500:]
    assert any((d / "out").glob("*.wav")) or any((d / "out").glob("*.flac")), list((d / "out").iterdir())


if __name__ == "__main__":
    test_audio_upscale_runs(); print("ok")
