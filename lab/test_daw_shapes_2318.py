"""HERESY 2318: the lines' shapes. A point's shape checked (a bend from -1 to 1, "hold", "s"); a shaped segment laid out as the points a straight
line goes through; the render hears them so (a held level steps 1 ms before the next point, a bend comes late or early, an S is half a cosine);
and the page lays out the very same points (heresy-mixer.js expandPts run under node, against expand() here, to 1e-9).
python3 lab/test_daw_shapes_2318.py      (RUACH_CONSOLE=folder: the page's sources from there, else build/tools/console beside the lab)"""
import glob
import json
import math
import os
import random
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad, skipped = [], []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


# ---- a shape checked
check("none is straight", dm.shape_of(None, "x") is None)
check("a bend under 0.001 is straight", dm.shape_of(0.0004, "x") is None)
check("a bend kept", dm.shape_of(-0.5, "x") == -0.5)
check("hold and s kept", dm.shape_of("hold", "x") == "hold" and dm.shape_of("s", "x") == "s")
for wrong in (1.5, "curve", True):
    try:
        dm.shape_of(wrong, "x")
        check(f"refused: {wrong!r}", False, "accepted")
    except PlenioUserError:
        check(f"refused: {wrong!r}", True)

# ---- laid out
e = dm.expand([(1.0, -6.0, "hold"), (2.0, 0.0, None)])
check("hold: the value kept to 1 ms before the next point", e == [(1.0, -6.0), (1.999, -6.0), (2.0, 0.0)], e)
e = dm.expand([(0.0, 0.0, "s"), (1.0, 10.0, None)])
mid = [v for t, v in e if abs(t - 0.5) < 1e-9]
check("s: half a cosine, its middle half way, a point every 20 ms (24 at most)", len(e) == 25 and mid and abs(mid[0] - 5.0) < 1e-9, (len(e), mid))
e = dm.expand([(0.0, 0.0, 0.8), (0.5, 10.0, None)])
q1 = [v for t, v in e if abs(t - 0.125) < 1e-9][0]
check("a bend above 0 comes late (a quarter of the way: far under a quarter of the change)", q1 < 1.0, q1)
e = dm.expand([(0.0, 0.0, -0.8), (0.5, 10.0, None)])
q1 = [v for t, v in e if abs(t - 0.125) < 1e-9][0]
check("a bend under 0 comes early", q1 > 5.0, q1)
e = dm.expand([(0.0, 0.0, 0.5), (0.03, 1.0, None)])
check("a short segment: two pieces at least", len(e) == 3, e)
check("the last point's shape goes nowhere", dm.expand([(0.0, 1.0, "s")]) == [(0.0, 1.0)])
v = dm.parse({"schema": dm.SCHEMA, "strips": {"a": {"auto": [[0, -12, "hold"], [1, 0]], "autos": {"pan": [[0, -1, "s"], [2, 1]]}}}}, ["a"], 48000)
check("the mix's value takes [t, dB, shape]", v["strips"]["a"]["auto"][:3] == [(0.0, -12.0), (0.999, -12.0), (1.0, 0.0)], v["strips"]["a"]["auto"][:3])
check("…and the knobs' lines too (an S of 2 s: 24 pieces)", len(v["strips"]["a"]["autos"]["pan"]) == 25, len(v["strips"]["a"]["autos"]["pan"]))
try:
    dm.parse({"schema": dm.SCHEMA, "strips": {"a": {"auto": [[0, -12, "zig"]]}}}, ["a"], 48000)
    check("a shape it does not know refused", False, "accepted")
except PlenioUserError as x:
    check("a shape it does not know refused", "shape" in str(x), str(x))

# ---- heard so: a held level renders as a step
rate = 48000
x = 0.5 * np.ones((2, rate * 2))                       # under −0.3 dBFS: the render lowers nothing
out, rep, _ = dm.render(rate, [("a", x), ("rest", np.zeros((2, rate * 2)))], {"schema": dm.SCHEMA, "strips": {"a": {"auto": [[0.5, -20, "hold"], [1.5, 0]]}}})
lvl = 20 * np.log10(np.abs(out[0]) + 1e-12) - 20 * np.log10(0.5)
check("held: −20 dB up to 1 ms before 1.5 s", abs(lvl[int(1.0 * rate)] + 20) < 1e-6 and abs(lvl[int(1.4985 * rate)] + 20) < 1e-6, (lvl[int(1.0 * rate)], lvl[int(1.4985 * rate)]))
check("…then 0 dB", abs(lvl[int(1.5005 * rate)]) < 1e-6, lvl[int(1.5005 * rate)])
out2, _, _ = dm.render(rate, [("a", x), ("rest", np.zeros((2, rate * 2)))], {"schema": dm.SCHEMA, "strips": {"a": {"auto": [[0.5, -20], [1.5, 0]]}}})
l2 = 20 * np.log10(np.abs(out2[0]) + 1e-12) - 20 * np.log10(0.5)
check("straight as before (linear in dB): −10 dB half way", abs(l2[int(1.0 * rate)] + 10) < 1e-3, l2[int(1.0 * rate)])

# ---- the page lays out the same points
def node_bin():
    for c in sorted(glob.glob(os.path.expanduser("~/.nvm/versions/node/*/bin/node"))) + ["/usr/bin/node", "/usr/local/bin/node"]:
        if os.path.isfile(c):
            return c
    return None


here = Path(__file__).resolve().parent
console = Path(os.environ.get("RUACH_CONSOLE") or here.parent / "build" / "tools" / "console")
mixer = console / "heresy-mixer.js"
node = node_bin()
if not node or not mixer.is_file():
    print(f"  SKIP  the page's expandPts against expand(): {'no node' if not node else 'no ' + str(mixer)}")
    skipped.append("page")
else:
    src = mixer.read_text(encoding="utf-8")
    m = re.search(r"  var BEND_K = 5, HOLD_EDGE = 0\.001, SUB_S = 0\.02, SUB_MAX = 24;\n  function expandPts\(pts\) \{.*?\n  \}\n", src, re.S)
    if not m:
        check("the page's expandPts found in heresy-mixer.js", False, mixer)
    else:
        rnd = random.Random(2318)
        cases = []
        for _ in range(60):
            n, t, pts = rnd.randint(2, 9), rnd.random(), []
            for _k in range(n):
                t += rnd.choice([0.0015, 0.01, 0.03, 0.2, 1.0, 3.7]) * rnd.random() + 0.0011
                sh = rnd.choice([None, None, "hold", "s", round(rnd.uniform(-1, 1), 3), 0.0005])
                pts.append([round(t, 3), round(rnd.uniform(-60, 12), 2)] + ([] if sh is None else [sh]))
            cases.append(pts)
        js = m.group(0) + "\nprocess.stdout.write(JSON.stringify(" + json.dumps(cases) + ".map(expandPts)));\n"
        r = subprocess.run([node, "-e", js], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            check("the page's expandPts runs", False, r.stderr[-300:])
        else:
            page = json.loads(r.stdout)
            worst, same_len = 0.0, True
            for pts, got in zip(cases, page):
                want = dm.expand([(p[0], p[1], dm.shape_of(p[2] if len(p) > 2 else None, "x")) for p in pts])
                if len(want) != len(got):
                    same_len = False
                    continue
                for (a, b), (c, d) in zip(want, got):
                    worst = max(worst, abs(a - c), abs(b - d))
            check("the page lays out as many points as the render, for 60 random lines", same_len)
            check("…the same points, to 1e-9", worst < 1e-9, worst)

print("test_daw_shapes_2318: " + ("all passed" if not bad else f"{len(bad)} FAILED") + (f", {len(skipped)} skipped (said above)" if skipped else ""))
sys.exit(1 if bad else 0)
