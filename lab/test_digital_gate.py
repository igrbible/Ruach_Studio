"""HERESY 1547: the Digital Gateway against what it claims: as loud as it came, under the ceiling; the source untouched at mix 0;
tape's top by its speed; wow measured as the % asked; tube even, console odd; vinyl's lows in mono; crosstalk at its level;
azimuth as late as asked; one seed one sound; a long file in blocks as the whole; a mono file; refusals. python3 lab/test_digital_gate.py"""
import math
import sys
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))
import digital_gate as dg  # noqa: E402
from plenio_core.audio.loudness import measure  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


sr = 48000
rng = np.random.default_rng(1547)
n = sr * 6
t = np.arange(n) / sr
music = np.stack([rng.standard_normal(n), rng.standard_normal(n)], 1)
music = signal.sosfilt(signal.butter(2, 4000, fs=sr, output="sos"), music, axis=0)
music *= 0.25 / np.sqrt(np.mean(music ** 2)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t))[:, None]
lufs = lambda y: measure(y.T, sr, with_true_peak=False).integrated_lufs   # noqa: E731

for ch in dg.CHARS:
    y, rep = dg.process(music, sr, {"character": ch})
    check(f"{ch}: as loud as it came (±0.2 LU), its true peak under −0.3 dBTP, said", abs(lufs(y) - lufs(music)) < 0.2 and rep["tp_out"] <= -0.29 and rep["harmonics"]["thd_pct"] > 0,
          (lufs(y), lufs(music), rep["tp_out"], rep["harmonics"]))
quiet = music * 0.3                                   # under the ceiling, so nothing is lowered
y, rep = dg.process(quiet, sr, {"character": "tape", "mix": 0, "grain_db": -120})
check("mix 0: the source as it came, sample for sample", np.max(np.abs(y - quiet)) < 1e-9 and rep["matched_db"] == 0 and rep["lowered_db"] == 0, np.max(np.abs(y - quiet)))
y, rep = dg.process(music * 3, sr, {"character": "console"})
check("a hot source: lowered to −0.3 dBTP and said by how much", rep["lowered_db"] > 0 and rep["tp_out"] <= -0.29, rep)

# the top by the speed: a cassette's 3.75 ips darker above 12 kHz than 30 ips
white = rng.standard_normal((n, 2)) * 0.1
hi = lambda y: 10 * math.log10(np.mean(signal.sosfilt(signal.butter(4, 12000, "high", fs=sr, output="sos"), y, axis=0) ** 2))   # noqa: E731
a30, _ = dg.process(white, sr, {"character": "tape", "speed": "30", "wow": 0, "flutter": 0, "grain_db": -120, "level": "out"})
a375, _ = dg.process(white, sr, {"character": "tape", "speed": "3.75", "wow": 0, "flutter": 0, "grain_db": -120, "level": "out"})
check("tape's top by its speed: 3.75 ips at least 6 dB darker above 12 kHz than 30 ips", hi(a30) - hi(a375) > 6, (hi(a30), hi(a375)))

# wow: a 1 kHz tone's frequency wanders by the % asked
tone = np.stack([0.3 * np.sin(2 * np.pi * 1000 * t)] * 2, 1)
w, _ = dg.process(tone, sr, {"character": "tape", "wow": 0.5, "flutter": 0, "grain_db": -120, "drive_db": -6, "level": "out"})
def wander(w):                                        # the tone alone (900–1100 Hz), its frequency smoothed under 5 Hz, its middle 90 %
    f = signal.sosfiltfilt(signal.butter(4, [900, 1100], "band", fs=sr, output="sos"), w[:, 0])
    inst = np.diff(np.unwrap(np.angle(signal.hilbert(f)))) * sr / (2 * np.pi)
    inst = signal.sosfiltfilt(signal.butter(2, 5, fs=sr, output="sos"), inst)[sr // 2: -sr // 2]
    return (np.percentile(inst, 99.5) - np.percentile(inst, 0.5)) / 2 / 1000 * 100
dev = wander(w)
w0, _ = dg.process(tone, sr, {"character": "tape", "wow": 0, "flutter": 0, "grain_db": -120, "drive_db": -6, "level": "out"})
check("no wow: the tone steady (under ±0.02 %)", wander(w0) < 0.02, wander(w0))
check("wow 0.5 %: the tone's frequency wanders ±0.5 % (±0.1)", abs(dev - 0.5) < 0.1, dev)

_, tu = dg.process(music, sr, {"character": "tube"})
_, co = dg.process(music, sr, {"character": "console"})
check("tube: the 2nd harmonic over the 3rd; console: the 3rd over the 2nd", tu["harmonics"]["h2_db"] > tu["harmonics"]["h3_db"] and co["harmonics"]["h3_db"] > co["harmonics"]["h2_db"],
      (tu["harmonics"], co["harmonics"]))

v, _ = dg.process(music, sr, {"character": "vinyl", "grain_db": -120, "crackle": 0, "rumble_db": -120, "wow": 0, "flutter": 0, "crosstalk_db": -120})
side = (v[:, 0] - v[:, 1]) / 2
lo = lambda s: 10 * math.log10(np.mean(signal.sosfilt(signal.butter(4, 60, fs=sr, output="sos"), s) ** 2) + 1e-30)   # noqa: E731
check("vinyl: the lows folded to mono (the side under 60 Hz 30 dB below the source's)", lo((music[:, 0] - music[:, 1]) / 2) - lo(side) > 30,
      (lo((music[:, 0] - music[:, 1]) / 2), lo(side)))

left = np.zeros((n, 2)); left[:, 0] = rng.standard_normal(n) * 0.1
xt, _ = dg.process(left, sr, {"character": "console", "crosstalk_db": -40, "grain_db": -120, "drive_db": -6, "level": "out"})
hp = lambda s: np.sqrt(np.mean(signal.sosfilt(signal.butter(4, 4000, "high", fs=sr, output="sos"), s) ** 2))   # noqa: E731
check("crosstalk −40 dB: the other side's highs come in at −40 dB (±1.5)", abs(20 * math.log10(hp(xt[:, 1]) / hp(xt[:, 0])) + 40) < 1.5, 20 * math.log10(hp(xt[:, 1]) / hp(xt[:, 0])))

az, _ = dg.process(tone, sr, {"character": "tape", "azimuth_us": 20, "wow": 0, "flutter": 0, "grain_db": -120, "drive_db": -6, "level": "out"})
c = np.fft.irfft(np.fft.rfft(az[:, 1]) * np.conj(np.fft.rfft(az[:, 0])))
phase = np.angle(np.sum(np.fft.rfft(az[:, 1]) * np.conj(np.fft.rfft(az[:, 0]))))
check("azimuth 20 µs: the second side 20 µs late at 1 kHz (±1 µs)", abs(-phase / (2 * np.pi * 1000) * 1e6 - 20) < 1, -phase / (2 * np.pi * 1000) * 1e6)

y1, _ = dg.process(music, sr, {"character": "vinyl"})
y2, _ = dg.process(music, sr, {"character": "vinyl"})
check("one seed, one sound (noise, crackle, wow the same twice)", np.array_equal(y1, y2))

long_ = np.tile(music, (25, 1))[: sr * 140]
p = dg.settings({"character": "tube", "drive_db": 9})
whole = dg.signal.resample_poly(dg.curve(dg.signal.resample_poly(long_[: sr * 3], 4, 1, axis=0) * 10 ** 0.45, "tube") / 10 ** 0.45, 1, 4, axis=0)
part = dg.through(long_[: sr * 3], sr, p)
check("the curve in blocks is the curve over the whole (the blocks' seams exact)", np.max(np.abs(whole - part)[64:-64]) < 1e-9, np.max(np.abs(whole - part)[64:-64]))

mono = music[:, :1]
ym, rm = dg.process(mono, sr, {"character": "console"})
check("a mono file: mono out, as loud as it came", ym.shape[1] == 1 and abs(lufs(ym) - lufs(mono)) < 0.2)

for wrong, why in (({"character": "plate"}, "an unknown character"), ({"drive_db": 40}, "a drive past +24"), ({"speed": "45"}, "a speed no deck has"),
                   ({"oversample": 3}, "oversampling 3×"), ({"gian_db": -60}, "a typo")):
    try:
        dg.settings(wrong)
        check("refused: " + why, False, "taken")
    except ValueError:
        check("refused: " + why, True)
print("test_digital_gate:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
