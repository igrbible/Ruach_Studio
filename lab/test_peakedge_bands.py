"""HERESY 2044: peakedge.bands: a 60 Hz half then an 8 kHz half read as the bass, then the highs; 1 kHz as the middle; silence as zeros;
a short file still fills every stretch.   python3 lab/test_peakedge_bands.py"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import peakedge  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as tmp:
    rate = 44100
    t = np.arange(rate * 20) / rate
    y = np.where(t < 10, np.sin(2 * np.pi * 60 * t), np.sin(2 * np.pi * 8000 * t)).astype(np.float32) * 0.5
    p = Path(tmp) / "two.flac"
    sf.write(str(p), np.stack([y, y], axis=1), rate)
    b = peakedge.bands(p, 100)
    B = np.array(b["bands"])
    check("100 stretches, the length said", len(B) == 100 and abs(b["seconds"] - 20) < 0.01, (len(B), b["seconds"]))
    check("the first half is the bass", B[5:45, 0].min() > 0.95, B[5:45, 0].min())
    check("the second half is the highs", B[55:95, 2].min() > 0.95, B[55:95, 2].min())
    check("each stretch's shares make one", np.allclose(B.sum(axis=1), 1.0, atol=0.01), B.sum(axis=1)[:5])
    q = Path(tmp) / "mid.wav"
    sf.write(str(q), (np.sin(2 * np.pi * 1000 * t[:rate * 3]) * 0.5).astype(np.float32), rate)
    M = np.array(peakedge.bands(q, 600)["bands"])
    check("1 kHz is the middle, and a 3 s file fills all 600", M[:, 1].min() > 0.95, M[:, 1].min())
    z = Path(tmp) / "quiet.wav"
    sf.write(str(z), np.zeros(rate * 5, dtype=np.float32), rate)
    Z = np.array(peakedge.bands(z, 100)["bands"])
    check("silence gives zeros, not a guess", float(Z.sum()) == 0.0, Z.sum())

print("\n" + ("all well" if not bad else str(len(bad)) + " failed"))
sys.exit(1 if bad else 0)
