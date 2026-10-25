"""HERESY 1583: the Voice upscale's bundle, without a card: join() keeps the original below the cut, blend() averages, takes the
loudest, or takes air (the mean to 16 kHz, the loudest above), lifts or lowers the drawn band, and leaves the original below the cut.
    python3 lab/test_vupscale_bundle.py"""
import importlib.util
import sys
from pathlib import Path

import numpy as np
from scipy.signal import stft

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vupscale", HERE / "builtin_steps/ruach/vupscale.py")
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


sr, n = 48000, 48000 * 3
t = np.arange(n) / sr
rng = np.random.default_rng(1583)
low = np.sin(2 * np.pi * 440 * t) * 0.3
orig = np.stack([low, low], 1)
def top(f0, a):                                   # a tone above the cut, as an upscaler would draw one
    return np.stack([np.sin(2 * np.pi * f0 * t) * a] * 2, 1)
A, B, Cc = orig + top(14000, 0.02), orig + top(14000, 0.05), orig + top(18000, 0.04)


def band(x, lo, hi):
    f, _, Z = stft(x[:, 0], sr, nperseg=4096, noverlap=2048)
    return 10 * np.log10(np.sum(np.abs(Z[(f >= lo) & (f < hi)]) ** 2) + 1e-20)


j = V.join(orig, B, sr, 12000)
check("join: below the cut the original as it was (the 440 Hz tone within 0.1 dB)", abs(band(j, 300, 600) - band(orig, 300, 600)) < 0.1, (band(j, 300, 600), band(orig, 300, 600)))
check("  above it the new top", abs(band(j, 13000, 15000) - band(B, 13000, 15000)) < 0.5, (band(j, 13000, 15000), band(B, 13000, 15000)))
same = V.blend(orig, [A, A, A], sr, 12000, "avg", 0)
check("blend avg of three alike: what they drew", abs(band(same, 13000, 15000) - band(A, 13000, 15000)) < 0.3)
mx = V.blend(orig, [A, B, A], sr, 12000, "max", 0)
check("  max: the loudest of them in each cell (B's 14 kHz)", abs(band(mx, 13000, 15000) - band(B, 13000, 15000)) < 0.3, (band(mx, 13000, 15000), band(B, 13000, 15000)))
av = V.blend(orig, [A, B, A], sr, 12000, "avg", 0)
check("  avg: between the quietest and the loudest", band(A, 13000, 15000) < band(av, 13000, 15000) < band(B, 13000, 15000))
air = V.blend(orig, [A, Cc, A], sr, 12000, "air", 0)
check("  air: under 16 kHz the mean (A's tone two thirds), above it the loudest (C's 18 kHz whole)",
      abs(band(air, 17000, 19000) - band(Cc, 17000, 19000)) < 0.3 and band(air, 13000, 15000) < band(A, 13000, 15000), (band(air, 17000, 19000), band(Cc, 17000, 19000)))
lift = V.blend(orig, [B, B, B], sr, 12000, "avg", -4.0)
check("  top −4 dB: the drawn band 4 dB lower", abs((band(lift, 13000, 15000) - band(B, 13000, 15000)) + 4.0) < 0.3, band(lift, 13000, 15000) - band(B, 13000, 15000))
check("  below the cut the original, whatever the blend", all(abs(band(x, 300, 600) - band(orig, 300, 600)) < 0.1 for x in (same, mx, av, air, lift)))
print("test_vupscale_bundle:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
