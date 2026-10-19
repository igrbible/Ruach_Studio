"""HERESY 1563: the DAW's audio buses in the render. python3 lab/test_daw_buses.py"""
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


sr, n = 8000, 8000 * 2
t = np.arange(n) / sr
a = np.stack([0.2 * np.sin(2 * np.pi * 220 * t)] * 2)
b = np.stack([0.2 * np.sin(2 * np.pi * 330 * t)] * 2)
c = np.stack([0.1 * np.sin(2 * np.pi * 440 * t)] * 2)
sig = [("a", a), ("b", b), ("c", c)]
V = lambda **kw: dict({"schema": dm.SCHEMA, "strips": {}}, **kw)
plain, _r, _p = dm.render(sr, sig, V(strips={"a": {"gain_db": -6}, "b": {"gain_db": -6}}))
bus, rep, pr = dm.render(sr, sig, V(buses=[{"id": "b1", "name": "Drums", "members": ["a", "b"], "gain_db": -6}]), keep=True)
check("a bus sums its members and its fader moves them together (as the members' own −6 dB)", np.abs(plain - bus).max() < 1e-9, np.abs(plain - bus).max())
check("  the bus printed beside the strips, the report names it and its members", "bus-b1" in pr and rep["buses"][0]["members"] == ["a", "b"]
      and [x.get("bus") for x in rep["strips"]] == ["b1", "b1", None], (list(pr), rep["buses"], [x.get("bus") for x in rep["strips"]]))
muted, rep2, _p = dm.render(sr, sig, V(buses=[{"id": "b1", "members": ["a", "b"], "mute": True}]))
check("  muted, its members are not heard", np.abs(muted - c).max() < 1e-9, np.abs(muted - c).max())
comp, rep3, _p = dm.render(sr, sig, V(buses=[{"id": "b1", "members": ["a", "b"], "comp": {"on": True, "threshold_db": -30, "ratio": 8, "attack_ms": 1, "release_ms": 50}}]))
check("  its compressor works on the sum", rep3["buses"][0].get("gain_reduction_db", 0) > 3 and np.abs(comp - c).max() < np.abs(plain * 2 - c).max(), rep3["buses"][0])
wide, _r, _p = dm.render(sr, [("a", np.stack([a[0], -a[0]]))], V(buses=[{"id": "b1", "members": ["a"], "width": 0}]))
check("  its width at 0 makes the sum mono", np.abs(wide[0] - wide[1]).max() < 1e-9)
for raw, why in (([{"id": "b1", "members": ["a"]}, {"id": "b2", "members": ["a"]}], "a strip in two buses"), ([{"id": "b1"}, {"id": "b1"}], "two buses of one id"),
                 ([{"id": "b1", "comp": {"on": True, "key": "a"}}], "a bus's compressor keyed to a strip"), ([{"id": "b%d" % i} for i in range(9)], "nine buses")):
    try:
        dm.render(sr, sig, V(buses=raw))
        check("refused: " + why, False, "accepted")
    except PlenioUserError:
        check("refused: " + why, True)
_m, rep4, _p = dm.render(sr, sig, V(buses=[{"id": "b1", "members": ["a", "zz"]}]))
check("a member not of this set is said and left out", any("zz" in x for x in rep4.get("notes", [])), rep4.get("notes"))
print("test_daw_buses:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
