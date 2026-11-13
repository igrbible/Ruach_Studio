"""HERESY 2418: the speech chain's denoiser keeps the take where it was. ffmpeg's afftdn gave its output 25 ms late (600, 1102 and 1200 samples at
24, 44.1 and 48 kHz), the take's last 25 ms dropped; speech_core.denoise pads the tail and takes the head off by as much. A click at a known
sample through the step's own function at three rates: found where it was, the length the take's.
    .venv/bin/python lab/test_speech_chain_2418.py"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent / "builtin_steps" / "ruach"))
import speech_core as sc  # noqa: E402

ok = 0
with tempfile.TemporaryDirectory() as tmp:
    for sr in (24000, 44100, 48000):
        rng = np.random.default_rng(0)
        x = (rng.standard_normal(sr * 4) * 0.02).astype(np.float32)
        at = int(sr * 1.5)
        x[at:at + 40] = 0.9
        src, dst = Path(tmp) / f"in-{sr}.wav", Path(tmp) / f"out-{sr}.flac"
        sf.write(str(src), x, sr, subtype="FLOAT")
        sc.denoise(src, dst, 10.0, -40.0)
        y, sr2 = sf.read(str(dst), dtype="float32")
        assert sr2 == sr and len(y) == len(x), f"{sr}: {len(y)} samples, not {len(x)}"
        c = np.fft.irfft(np.fft.rfft(y, 2 * len(x)) * np.conj(np.fft.rfft(x, 2 * len(x))))
        lag = int(np.argmax(np.abs(c)))
        lag = lag if lag < len(x) else lag - 2 * len(x)
        assert lag == 0, f"{sr}: the take {lag} samples off ({lag / sr * 1000:.1f} ms)"
        ok += 2
print(f"test_speech_chain_2418: {ok} checks passed (the denoised take in place at 24, 44.1 and 48 kHz)")
