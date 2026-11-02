"""HERESY 1989: a lane's channel and its shift in the DAW's render. python3 lab/test_daw_lanes.py"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


sr, n = 8000, 8000 * 4
t = np.arange(n) / sr
x = np.zeros((2, n))
x[0, sr:2 * sr] = 0.4 * np.sin(2 * np.pi * 220 * t[sr:2 * sr])          # the left side: a tone at 1–2 s
x[1, sr:2 * sr] = 0.2 * np.sin(2 * np.pi * 330 * t[sr:2 * sr])          # the right side: another
V = lambda strip: {"schema": dm.SCHEMA, "strips": {"a": strip}}
rms = lambda y, ch, a, b: float(np.sqrt((y[ch, int(a * sr):int(b * sr)] ** 2).mean()))
base, _r, _p = dm.render(sr, [("a", x)], V({}))
L, _r, _p = dm.render(sr, [("a", x)], V({"chan": "l"}))
check("L: the left side on both, the right one gone", np.abs(L[0] - L[1]).max() < 1e-9 and abs(rms(L, 1, 1.1, 1.9) - rms(base, 0, 1.1, 1.9)) < 1e-6, (rms(L, 1, 1.1, 1.9), rms(base, 0, 1.1, 1.9)))
R, _r, _p = dm.render(sr, [("a", x)], V({"chan": "r"}))
check("R: the right side on both", np.abs(R[0] - R[1]).max() < 1e-9 and abs(rms(R, 0, 1.1, 1.9) - rms(base, 1, 1.1, 1.9)) < 1e-6)
M, _r, _p = dm.render(sr, [("a", x)], V({"chan": "m"}))
want = 0.5 * (base[0] + base[1])
check("M: the two summed, half each, on both", np.abs(M[0] - M[1]).max() < 1e-9 and np.abs(M[0] - want).max() < 1e-6, np.abs(M[0] - want).max())
S, _r, _p = dm.render(sr, [("a", x)], V({"chan": "st"}))
check("S: both as they are (the same as no channel)", np.abs(S - base).max() < 1e-12)
late, _r, _p = dm.render(sr, [("a", x)], V({"offset_s": 0.5}))
check("+0.5 s: the tone at 1.5–2.5 s, silence where it was, the song's length kept",
      late.shape == base.shape and rms(late, 0, 1.0, 1.45) < 1e-9 and abs(rms(late, 0, 1.6, 2.4) - rms(base, 0, 1.1, 1.9)) < 1e-6)
early, _r, _p = dm.render(sr, [("a", x)], V({"offset_s": -0.75}))
check("−0.75 s: the tone at 0.25–1.25 s, silence at its end", rms(early, 0, 0.35, 1.15) > 0.2 and rms(early, 0, 1.3, 4) < 1e-9 and early.shape == base.shape)
cut, _r, _p = dm.render(sr, [("a", x)], V({"offset_s": 0.5, "muted": [[1.5, 2.0]]}))
check("a cut lies in the song's time as drawn: after a +0.5 s shift, a cut at 1.5–2 s silences the tone's first half",
      rms(cut, 0, 1.55, 1.95) < 1e-9 and rms(cut, 0, 2.05, 2.45) > 0.2)
both, rep, _p = dm.render(sr, [("a", x)], V({"chan": "m", "offset_s": 0.5, "invert": True}))
check("the channel, the shift and the polarity together", np.abs(both[0] + np.roll(want, int(0.5 * sr))[:n]).max() < 1e-6)
for raw, why in (({"chan": "x"}, "a channel there is not"), ({"offset_s": 31}, "a shift past 30 s")):
    try:
        dm.render(sr, [("a", x)], V(raw))
        check("refused: " + why, False, "rendered")
    except PlenioUserError as e:
        check("refused: " + why, True, e)
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
