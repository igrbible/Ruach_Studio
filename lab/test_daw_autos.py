"""HERESY 1559: pan, width and the sends drawn over time in the DAW's render. python3 lab/test_daw_autos.py"""
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


sr = 8000
n = sr * 4
t = np.arange(n) / sr
tone = 0.25 * np.sin(2 * np.pi * 220 * t)
st = np.stack([tone, tone])
V = lambda strip: {"schema": dm.SCHEMA, "strips": {"a": strip}}
v = dm.parse(V({"autos": {"pan": [[1, -1], [3, 1]], "width": [[0, 0]], "reverb": [[0, 0], [2, 0.5]]}}), ["a"], sr)
check("autos read: each its points in order", v["strips"]["a"]["autos"] == {"pan": [(1.0, -1.0), (3.0, 1.0)], "width": [(0.0, 0.0)], "reverb": [(0.0, 0.0), (2.0, 0.5)]},
      v["strips"]["a"]["autos"])
for bad_v, why in (({"autos": {"tilt": [[0, 1]]}}, "a knob there is not"), ({"autos": {"pan": [[0, 2]]}}, "pan past hard right"),
                   ({"autos": {"width": [[0, -1]]}}, "a width under mono"), ({"autos": [[0, 1]]}, "not a map of knobs")):
    try:
        dm.parse(V(bad_v), ["a"], sr)
        check("refused: " + why, False, "accepted")
    except PlenioUserError:
        check("refused: " + why, True)
mix, rep, _p = dm.render(sr, [("a", st)], V({"autos": {"pan": [[1, -1], [3, 1]]}}))
L, R = mix[0], mix[1]
early, late, mid = slice(0, sr // 2), slice(int(3.5 * sr), n), slice(2 * sr - 200, 2 * sr + 200)
rms = lambda x: float(np.sqrt((x ** 2).mean()))
check("pan drawn: hard left before the first point, hard right after the last, the centre between as the panner's law",
      rms(R[early]) < 1e-6 and rms(L[late]) < 1e-6 and abs(rms(L[mid]) - rms(R[mid])) < 0.01 * rms(L[mid]), (rms(R[early]), rms(L[late]), rms(L[mid]), rms(R[mid])))
law = dm.pan_law(st, np.full(n, 0.3))
check("  a pan a sample equal to the same pan held", np.abs(law - dm.pan_law(st, 0.3)).max() < 1e-12)
sides = np.stack([tone, -tone])
w0, _r, _p = dm.render(sr, [("a", sides)], V({"autos": {"width": [[0, 0]]}}))
check("width drawn at 0: mono, the side gone", np.abs(w0[0] - w0[1]).max() < 1e-9, np.abs(w0[0] - w0[1]).max())
m0, r0, _p = dm.render(sr, [("a", st)], V({"reverb": 0.5, "autos": {"reverb": [[0, 0]]}}))
m1, r1, _p = dm.render(sr, [("a", st)], V({"reverb": 0.0, "autos": {"reverb": [[0, 0.6]]}}))
m2, r2, _p = dm.render(sr, [("a", st)], V({}))
check("a send drawn takes the knob's place: drawn at 0, no room though the knob says half; drawn up, a room though the knob says none",
      np.abs(m0 - m2).max() < 1e-9 and np.abs(m1 - m2).max() > 1e-3, (np.abs(m0 - m2).max(), np.abs(m1 - m2).max()))
rs = rep["strips"] if isinstance(rep, dict) else rep
check("the report counts a lane's drawn knobs", rs[0].get("autos") == {"pan": 2}, rs[0])
print("test_daw_autos:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
