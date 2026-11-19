"""HERESY 2677: a voice over the user's own backing (lab/backing.py), its parts each against what they must do, on sound made here (nothing of
the Library read, nothing written outside a temporary folder):
  bed()        a transcriber's score made a bed: every bar, meter, key and chord symbol kept where it was, the Vocal notes left out, the Ins voice
               empty, the sections counted; a score the lab's reader refuses is refused, never half made
  _rests()     a rest split into the lengths the dialect writes
  guide()      a split voice near the band is a guide vocal, one 20 LU and more under it the ghost of a lead synth
  plan()       each bar's stretch lands it on the backing's bar; a bar that asks more than the limit is held to it and the bars after catch up
  steady()     a few bars' swing of the aligner's path and back taken out (HERESY 2680), a steady drift kept
  warp()       one rubberband pass lands a click where the plan says (within a few ms), the voice cut or padded to the backing's length
  align()      a band of other timbres, 3 % slower and 0.6 s late, found back bar by bar by its chords
  voice()      the whole: the stems written at the mix's level (their sum is the mix), the report says the residual, the levels and the beats
    python3 lab/test_backing_2677.py      (the Studio's .venv: librosa, soundfile, plenio_core; ffmpeg with rubberband)"""
import json
import math
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backing  # noqa: E402

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed, failed = passed + bool(ok), failed + (not ok)
    print(("  PASS  " if ok else "  FAIL  ") + name + ("" if ok or detail == "" else "  (" + str(detail) + ")"))


SCORE = """X:1
T:
M:4/4
L:1/16
Q:1/4=96
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Am
% intro
V: Vocal
Z|"Am"z8"F"z8|"C"z16|"G"z4"Em"z12|
V: Ins
z2A2a2g2f2e2f2d2|b4g2f2e2d2e2^g2|c4c'2d'2e'2d'2c'2a2|b4g2f2e2d2e2d2|
% verse
V: Vocal
"Am"z4a2agf2e2z2ed|"F"g4e2z2"G"z8|"C"z4f2e2"G"f2eed3c|"Am"g4z4"E7"z8|
V: Ins
Z4|
V: Vocal
M:3/4
"F"e4z8|
V: Ins
M:3/4
z8z2A2|
V: Vocal
M:4/4
"Am"z6agf4e2d2|[K:C]"C"g4e4"G"z8|
V: Ins
M:4/4
f4aaz8z2|[K:C]z16|
% chorus
V: Vocal
"F"d'6d'e'f'2e'd'd'2c'2|"G"c'2b12z2|"C"z4c'2d'2e'2d'd'3d'c'|"Am"d'8z8|
V: Ins
Z3|z8a'2g'2f'2e'2|
"""

# ---------------------------------------------------------------- bed
import abc_tools  # noqa: E402
src = abc_tools.parse_abc(SCORE)
b = backing.bed(SCORE)
made = abc_tools.parse_abc(b["abc"])
check("bed: every bar, meter and key of the score kept (a 3/4 bar among 4/4, a key changed inside a bar)",
      made.voices["Vocal"].bars == src.voices["Vocal"].bars and made.voices["Vocal"].keys == src.voices["Vocal"].keys and len(b["abc"]) > 0, b["bars"])
check("  every chord symbol where it was", made.voices["Vocal"].chords == src.voices["Vocal"].chords and b["chords"] == len(src.voices["Vocal"].chords))
check("  the Vocal voice resting (its notes counted and left out), the Ins voice empty",
      not made.voices["Vocal"].notes and not made.voices["Ins"].notes and b["notes"] == len(src.voices["Vocal"].notes), b["notes"])
check("  the sections by the transcriber's names, their bars counted",
      [(f["name"], f["first"], f["bars"]) for f in b["form"]] == [("intro", 0, 4), ("verse", 4, 7), ("chorus", 11, 4)], b["form"])
check("  its key, meter and tempo said", (b["key"], b["meter"], b["bpm"]) == ("Am", "4/4", 96.0), (b["key"], b["meter"], b["bpm"]))
check("  the header as the dialect keeps it (X:1, T:, M:, L:, Q:, the two voices, K:)", b["abc"].split("\n")[:8] == SCORE.split("\n")[:8])
try:
    backing.bed(SCORE.replace('"G"z4"Em"z12|', '"G"z4"Em"z11|'))
    check("a score the lab's reader refuses is refused, nothing made", False)
except ValueError as e:
    check("a score the lab's reader refuses is refused, nothing made", "could not be read" in str(e), e)

# ---------------------------------------------------------------- rests
ok = all(sum(int(x or 1) for x in __import__("re").findall(r"z(\d*)", backing._rests(n))) == n and
         all(int(x or 1) in backing.DURS for x in __import__("re").findall(r"z(\d*)", backing._rests(n))) for n in range(1, 49))
check("_rests: every length 1–48 written in the dialect's own lengths, summing to it", ok, backing._rests(13))

# ---------------------------------------------------------------- guide
check("guide: a voice 3 LU under the band is a guide vocal", backing.guide({"lufs": -21.0}, {"lufs": -18.0}) == {"guide": True, "gap": 3.0})
check("  one 44 LU under it is the split's ghost, the backing kept whole", backing.guide({"lufs": -62.6}, {"lufs": -18.2})["guide"] is False)
check("  silence split off is no guide", backing.guide({"lufs": None}, {"lufs": -18.0})["guide"] is False)

# ---------------------------------------------------------------- plan
knots = [[0.5 + 2.04 * k, 2.0 * k] for k in range(10)]             # the take 2 % slower, half a second late
p = backing.plan(knots)
check("plan: each bar played 2 % faster lands on the backing's bar, nothing held", all(abs(r - 1.02) < 1e-6 for _a, r in p["segments"][1:-1]) and
      max(abs(x) for x in p["residual"]) < 1e-6 and not p["held"] and p["shift"] == -0.5, p["segments"][:3])
knots = [[2.0 * k + (1.0 if k >= 4 else 0.0), 2.0 * k] for k in range(12)]   # the take a bar's half longer at bar 4
p = backing.plan(knots, 0.15)
check("  a bar that asks 50 % is held to 15 %, said, and the bars after catch up within the limit",
      p["held"] == [3, 4, 5] and all(1 / 1.15 - 1e-9 <= r <= 1.15 + 1e-9 for _a, r in p["segments"]) and abs(p["residual"][-1]) < 1e-6 and
      max(abs(x) for x in p["residual"]) > 0.4, {"held": p["held"], "residual": p["residual"]})

# ---------------------------------------------------------------- steady (HERESY 2680)
live = [0.446] * 12 + [0.067, -0.312, -0.318, 0.061] + [0.44, 0.446, 0.531, 0.574]
st = backing.steady([2.1 * k for k in range(len(live))], live)
check("steady: the live check's four bars swung 0.4 s and back are set back to the bars around them (within 30 ms)",
      max(abs(x - 0.446) for x in st[:17]) < 0.03, [round(float(x), 3) for x in st])
drift = [0.012 * k for k in range(20)]                         # a backing 0.6 % slower than the take, bar after bar
st = backing.steady([2.0 * k for k in range(20)], drift)
check("  a steady drift kept as it is, to its ends (within 2 ms)", max(abs(st[k] - drift[k]) for k in range(20)) < 0.002,
      [round(float(x), 3) for x in st[:6]])

# ---------------------------------------------------------------- warp
T = Path(tempfile.mkdtemp(prefix="backing-test-"))
sr = 48000
x = np.zeros((24 * sr, 2), dtype=np.float32)
clicks = np.arange(0.25, 23.5, 0.5)
for c in clicks:
    x[int(c * sr):int(c * sr) + 48, :] = 0.8 * np.hanning(48)[:, None]
sf.write(str(T / "clicks.wav"), x, sr, subtype="FLOAT")
tau = np.arange(0.0, 24.01, 2.0)
rat = 1.0 + 0.06 * np.sin(np.arange(len(tau) - 1))
segs = [[float(tau[k]), float(rat[k])] for k in range(len(rat))]
out_b = np.concatenate([[0.0], np.cumsum(np.diff(tau) / rat)])
backing.warp(T / "clicks.wav", T / "warped.wav", segs, 0.3, int(25 * sr))
y, _ = sf.read(str(T / "warped.wav"), dtype="float32", always_2d=True)
env, peaks, i = np.abs(y[:, 0]), [], 0
while i < len(env):
    if env[i] > 0.3:
        j = i + int(0.1 * sr)
        peaks.append((i + int(np.argmax(env[i:j]))) / sr)
        i = j
    else:
        i += 1
want = np.array([0.3 + out_b[min(int(c // 2), len(rat) - 1)] + (c - tau[min(int(c // 2), len(rat) - 1)]) / rat[min(int(c // 2), len(rat) - 1)] for c in clicks])
err = (np.array(peaks[:len(want)]) - want[:len(peaks)] - 0.0005) * 1000 if len(peaks) == len(want) else np.array([1e9])
check("warp: every click lands where the plan puts it, within 8 ms (one pass, the tempo changed at each knot, 0.3 s later)",
      len(peaks) == len(clicks) and np.abs(err).max() < 8, {"clicks": len(clicks), "found": len(peaks), "worst_ms": round(float(np.abs(err).max()), 1)})
check("  cut or padded to the length asked", len(y) == 25 * sr, len(y) / sr)
import os  # noqa: E402
# HERESY 2681: an ffmpeg without rubberband: our own phase vocoder. A vocoder spreads a click over its window, so the bars are told by tone
# bursts (440 Hz, 120 ms, every half second), their onsets where their 5 ms loudness first passes half of a burst's, in and out alike
tb = np.arange(int(0.12 * sr)) / sr
burst = (0.5 * np.sin(2 * np.pi * 440 * tb) * np.minimum(1, np.minimum(tb, 0.12 - tb) / 0.005)).astype(np.float32)
xb = np.zeros((24 * sr, 2), dtype=np.float32)
for c in clicks:
    xb[int(c * sr):int(c * sr) + len(burst), :] = burst[:, None]
sf.write(str(T / "bursts.wav"), xb, sr, subtype="FLOAT")
os.environ["BACKING_STRETCHER"] = "vocoder"
backing.warp(T / "bursts.wav", T / "warped-vocoder.wav", segs, 0.3, int(25 * sr))
del os.environ["BACKING_STRETCHER"]
y2, _ = sf.read(str(T / "warped-vocoder.wav"), dtype="float32", always_2d=True)
def bursts_on(z):
    h = int(0.005 * sr)
    e = np.sqrt(np.mean(z[: len(z) // h * h, 0].reshape(-1, h) ** 2, 1))
    lev = np.median(e[e > e.max() / 4])
    on, last = [], -1.0
    for i in range(1, len(e)):
        if e[i] > lev / 2 and e[i - 1] <= lev / 2 and i * h / sr - last > 0.3:
            on.append(i * h / sr)
            last = on[-1]
    return np.array(on)
on_in, on_out = bursts_on(xb), bursts_on(y2)
def mapped(tt):
    k = min(int(tt // 2), len(rat) - 1)
    return 0.3 + out_b[k] + (tt - tau[k]) / rat[k]
err2 = np.array([on_out[i] - mapped(on_in[i]) for i in range(min(len(on_in), len(on_out)))]) * 1000
check("  with our own phase vocoder where ffmpeg has no rubberband (2681): every burst within 12 ms (a hop) of where the plan puts it",
      len(on_out) == len(on_in) == len(clicks) and np.abs(err2).max() < 12, {"bursts": [len(on_in), len(on_out)], "worst_ms": round(float(np.abs(err2).max()), 1), "err": [int(e) for e in err2]})

# ---------------------------------------------------------------- align and voice, on chords made here
PROG = [(57, "min"), (53, "maj"), (48, "maj"), (55, "maj")]   # Am F C G, a bar each
def chords(seconds_a_bar, n_bars, lead, timbre, total):
    t = np.arange(int(total * sr)) / sr
    s = np.zeros_like(t)
    for k in range(n_bars):
        root, q = PROG[k % 4]
        a, z = lead + k * seconds_a_bar, lead + (k + 1) * seconds_a_bar
        m = (t >= a) & (t < z)
        for st in (0, 3 if q == "min" else 4, 7, 12):
            f = 440.0 * 2 ** ((root + st - 69) / 12)
            w = np.sin(2 * np.pi * f * t[m]) if timbre == "sine" else np.sign(np.sin(2 * np.pi * f * t[m])) * 0.4
            s[m] += w * 0.08
        s[m] *= 0.6 + 0.4 * np.exp(-(t[m] - a) * 3)          # each bar struck
    return np.stack([s, s], axis=1).astype(np.float32)
bars = [2.0 * k for k in range(16)]
back = chords(2.0, 16, 0.0, "sine", 32.0)
band = chords(2.06, 16, 0.6, "square", 34.0)                    # the take's own band: other timbre, 3 % slower, 0.6 s late
t = np.arange(len(band)) / sr
voice = np.zeros(len(band), dtype=np.float32)
for k in range(1, 15):                                         # a sung note each bar, its pitch the chord's fifth
    a = 0.6 + k * 2.06 + 0.3
    m = (t >= a) & (t < a + 1.2)
    voice[m] = 0.25 * np.sin(2 * np.pi * 440.0 * 2 ** ((PROG[k % 4][0] + 7 - 69) / 12) * t[m]) * np.hanning(m.sum())
voice = np.stack([voice, voice], axis=1)
sf.write(str(T / "back.wav"), back, sr, subtype="FLOAT")
sf.write(str(T / "band.wav"), band, sr, subtype="FLOAT")
sf.write(str(T / "voice.wav"), voice, sr, subtype="FLOAT")
import librosa  # noqa: E402
al = backing.align(librosa.resample(back.mean(1), orig_sr=sr, target_sr=backing.SR), librosa.resample(band.mean(1), orig_sr=sr, target_sr=backing.SR),
                   backing.SR, bars, backing.span(voice, sr))
truth = [0.6 + 1.03 * bk for _tk, bk in al["knots"]]
e = np.abs(np.array([tk for tk, _bk in al["knots"]]) - np.array(truth))
check("align: the band of other timbres, 3 % slower and 0.6 s late, found back bar by bar (each knot within 150 ms)",
      len(al["knots"]) >= 10 and e.max() < 0.15, {"knots": len(al["knots"]), "worst_ms": round(float(e.max()) * 1000), "median_ms": round(float(np.median(e)) * 1000)})
rep = backing.voice({"backing": str(T / "back.wav"), "take_vocals": str(T / "voice.wav"), "take_band": str(T / "band.wav"), "bars": bars, "num": 4}, T / "out")
mix, _ = sf.read(str(T / "out" / "audio.wav"), dtype="float64", always_2d=True)
v, _ = sf.read(str(T / "out" / "vocals.flac"), dtype="float64", always_2d=True)
bk, _ = sf.read(str(T / "out" / "instrumental.flac"), dtype="float64", always_2d=True)
check("voice: the mix, the voice and the backing written, each as long as the backing", len(mix) == len(v) == len(bk) == len(back), (len(mix), len(v), len(bk)))
check("  the two stems sum to the mix (24-bit apart at most): the DAW's rest is silence", np.abs(mix - (v + bk)).max() < 3e-6, float(np.abs(mix - (v + bk)).max()))
check("  the backing as it came (its level kept unless the mix had to come down)", np.abs(bk - back.astype(np.float64) * 10 ** (-rep["loudness"]["lowered_db"] / 20)).max() < 2e-5,
      rep["loudness"]["lowered_db"])
check("  the voice within a bar of the backing at every knot, nothing held", rep["residual"]["max_bars"] < 0.1 and rep["held"] == [], rep["residual"])
# where each sung note now starts (its envelope past a third of its loudest, 50 ms frames), against where the truth puts the note as it was sung
def onsets(x):
    hop = int(0.05 * sr)
    e = np.abs(x[: len(x) // hop * hop, 0]).reshape(-1, hop).max(1)
    on, last = [], -1e9
    for i in range(1, len(e)):
        if e[i] > e.max() / 3 and e[i - 1] <= e.max() / 3 and i * hop / sr - last > 0.8:
            on.append(i * hop / sr)
            last = on[-1]
    return np.array(on)
sung, laid = onsets(voice), onsets(v)
want = (sung - 0.6) / 1.03                                   # the take's seconds on the backing's, as the band was made
off = [float(np.min(np.abs(laid - w))) for w in want] if len(laid) else [9.9]
check("  each sung note now starts where the backing would have it (within 100 ms of the truth)", len(laid) == len(sung) == 14 and max(off) < 0.1,
      {"notes": [len(sung), len(laid)], "worst_ms": round(max(off) * 1000)})
check("  its report: the loudness each way, the gain, the beats checked apart from the chroma", all(k in rep["loudness"] for k in ("backing", "take_voice", "take_band", "gain_db")) and
      "median_ms" in rep["beat_check"], json.dumps(rep["loudness"]))
import shutil  # noqa: E402
shutil.rmtree(T, ignore_errors=True)
print(f"\ntest_backing_2677: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
