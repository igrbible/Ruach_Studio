"""HERESY 1564: copies and moves along a lane in the DAW's render. python3 lab/test_daw_edits.py"""
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


sr, n = 8000, 8000 * 6
t = np.arange(n) / sr
x = np.zeros((2, n))
x[:, sr:2 * sr] = 0.3 * np.sin(2 * np.pi * 220 * t[sr:2 * sr])          # a phrase at 1–2 s
x[:, 4 * sr:5 * sr] = 0.2 * np.sin(2 * np.pi * 330 * t[4 * sr:5 * sr])  # another at 4–5 s
V = lambda strip: {"schema": dm.SCHEMA, "strips": {"a": strip}}
rms = lambda y, a, b: float(np.sqrt((y[:, int(a * sr):int(b * sr)] ** 2).mean()))
c, rep, _p = dm.render(sr, [("a", x)], V({"edits": [{"op": "copy", "a": 1, "b": 2, "to": 4}]}))
check("a copy: the phrase at 1–2 s also at 4–5 s, what was there replaced", abs(rms(c, 1.1, 1.9) - rms(x, 1.1, 1.9)) < 1e-6 and np.abs(c[:, int(4.1 * sr):int(4.9 * sr)] - x[:, int(1.1 * sr):int(1.9 * sr)]).max() < 1e-9,
      (rms(c, 1.1, 1.9), rms(c, 4.1, 4.9)))
mv, _r, _p = dm.render(sr, [("a", x)], V({"edits": [{"op": "move", "a": 1, "b": 2, "to": 3}]}))
check("a move: the phrase at 3–4 s, its source silent", rms(mv, 1.05, 1.95) < 1e-9 and np.abs(mv[:, int(3.1 * sr):int(3.9 * sr)] - x[:, int(1.1 * sr):int(1.9 * sr)]).max() < 1e-9, (rms(mv, 1.05, 1.95),))
edge = c[:, int(4 * sr) - 40:int(4 * sr) + 120]
check("  its edges cross in 10 ms, no click (no step larger than the tone's own)", np.abs(np.diff(edge, axis=1)).max() < 0.06, np.abs(np.diff(edge, axis=1)).max())
cut, _r, _p = dm.render(sr, [("a", x)], V({"muted": [[1, 2]], "edits": [{"op": "copy", "a": 1, "b": 2, "to": 4}]}))
check("a paste lies over the cuts: the phrase cut at 1–2 s, its copy still at 4–5 s", rms(cut, 1.05, 1.95) < 1e-9 and abs(rms(cut, 4.1, 4.9) - rms(x, 1.1, 1.9)) < 1e-6)
tail, _r, _p = dm.render(sr, [("a", x)], V({"edits": [{"op": "copy", "a": 1, "b": 2, "to": 5.5}]}))
check("a paste past the end is cut at the end", tail.shape == x.shape and rms(tail, 5.6, 5.95) > 0.1)
check("the report counts a strip's edits", rep["strips"][0].get("edits") == 1, rep["strips"][0])
for raw, why in (([{"op": "swap", "a": 1, "b": 2, "to": 3}], "an op there is not"), ([{"op": "copy", "a": 2, "b": 1, "to": 3}], "b before a"), ([{"op": "copy", "a": 1, "b": 2, "to": 3}] * 65, "65 edits")):
    try:
        dm.render(sr, [("a", x)], V({"edits": raw}))
        check("refused: " + why, False, "accepted")
    except PlenioUserError:
        check("refused: " + why, True)
print("test_daw_edits:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
