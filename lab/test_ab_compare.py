"""HERESY 1991: lab/ab_compare.py on sounds made here: an after that comes late, quieter, brighter, its loud moments pressed and its left side
lower is found where it meets the before, compared at equal loudness, and said so; the same file against itself changes nothing; an inverted
one is said inverted; the pictures and the page land.   python3 lab/test_ab_compare.py"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ab_compare as ab  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


SR = 48000
rng = np.random.default_rng(7)
n = 40 * SR
white = rng.standard_normal((n, 2))
pink = sosfilt(butter(1, 400, fs=SR, output="sos"), white, axis=0) + 0.05 * white      # a slope like music's
env = 0.25 + 0.75 * (0.5 + 0.5 * np.sin(2 * np.pi * np.arange(n) / SR / 5.0)) ** 2   # loud and quiet stretches, five seconds apart
music = pink * env[:, None]
music = 0.3 * music / np.abs(music).max()
# the after: 1234 samples late, the highs up by a shelf, its loud moments pressed (a slow gain on the envelope), its left 1 dB down, 3 dB quieter
hi = sosfilt(butter(2, 4000, btype="highpass", fs=SR, output="sos"), music, axis=0)
after = music + 0.6 * hi
lev = np.sqrt(np.convolve((after ** 2).mean(1), np.ones(SR // 10) / (SR // 10), mode="same"))
gain = np.minimum(1.0, (lev / np.percentile(lev, 60)) ** -0.35)
after = after * gain[:, None]
after[:, 0] *= 10 ** (-1 / 20)
after = after * 10 ** (-3 / 20) * (np.sqrt((music ** 2).mean()) / np.sqrt((after ** 2).mean()))
after = np.concatenate([np.zeros((1234, 2)), after])[:n]
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    sf.write(str(d / "before.flac"), music, SR, subtype="PCM_24")
    sf.write(str(d / "after.flac"), after, SR, subtype="PCM_24")
    sf.write(str(d / "inverted.flac"), -music, SR, subtype="PCM_24")
    R = ab.compare(d / "before.flac", d / "after.flac", ("before", "after"), d / "out")
    said = " ".join(ab.said(s) for s in R["verdict"])
    check("the after found where it meets the before: 1234 samples late (the shelf's own phase within 3), the same polarity, one music", abs(R["lag_samples"] - 1234) <= 3 and R["polarity"] == "same" and R["likeness"] > 0.8,
          (R["lag_samples"], R["polarity"], R["likeness"]))
    check("  quieter (3 dB by its RMS, less by BS.1770 for its brighter top), said apart; the rest at equal loudness", -3.4 < R["level_db"] < -2 and "Quieter" in said, (R["level_db"], said[:200]))
    check("  brighter: the highs up, the lows not", R["zones_db"]["high"] > 1 and R["zones_db"]["air"] > 1 and abs(R["zones_db"]["low"]) < 1, R["zones_db"])
    check("  the loud moments pressed against the middle ones: a glue, said so", R["dynamics"]["glue_db"] < -0.5 and "compression" in said, R["dynamics"])
    check("  the left side lower: the balance said", R["after"]["balance_db"] - R["before"]["balance_db"] < -0.7 and "Left against right" in said, (R["before"]["balance_db"], R["after"]["balance_db"]))
    check("  what no filter makes from the before stands above an EQ's (a pressing gain is not a filter)", R["nonlinear"]["whole_db"] > -40, R["nonlinear"]["whole_db"])
    check("  the page, the spectrograms and the measures land", all((d / "out" / f).is_file() for f in ("compare.md", "compare.json", "spectrograms.jpg", "measures.png")) and
          "## Verdict" in (d / "out/compare.md").read_text(encoding="utf-8"))
    S = ab.compare(d / "before.flac", d / "before.flac")
    check("the same file against itself: nothing moved, nothing said but that", S["lag_samples"] == 0 and abs(S["level_db"]) < 0.01 and S["likeness"] > 0.999 and
          "The tone stayed" in " ".join(ab.said(s) for s in S["verdict"]) and abs(S["dynamics"]["glue_db"]) < 0.05, (S["level_db"], S["likeness"], S["dynamics"]))
    V = ab.compare(d / "before.flac", d / "inverted.flac")
    check("an inverted one: said inverted, compared as the same music", V["polarity"] == "inverted" and V["likeness"] > 0.999 and
          "inverted" in " ".join(ab.said(s) for s in V["verdict"]), (V["polarity"], V["likeness"]))
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
