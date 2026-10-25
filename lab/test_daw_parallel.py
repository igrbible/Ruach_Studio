"""HERESY 1759: parallel compression. A compressor's mix blends its sound (with its make-up) with the dry one, dry × (1 − mix) + wet × mix, on a
strip, a bus and the master; mix 1, or none, is the compressor as before, to the sample; refused outside 0–1. And the page's kernel (heresy-mixdsp.js,
run here by node when it is found) gives the same numbers, a cell later, as the page plays it.
python3 lab/test_daw_parallel.py [heresy-mixdsp.js]"""
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402
from plenio_core.audio.dynamics import Compressor, compress  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:400] + ")"))
    if not ok:
        bad.append(what)


rate, n = 48000, 48000 * 2
rng = np.random.default_rng(1759)
t = np.arange(n) / rate
env = np.where((t % 0.5) < 0.2, 1.0, 0.2)
voc = np.stack([np.sin(2 * np.pi * 220 * t) * 0.4 * env, np.sin(2 * np.pi * 330 * t) * 0.3 * env])
drm = rng.standard_normal((2, n)) * 0.1 * env
sig = [("lead_vocal", voc), ("drums", drm), ("rest", np.zeros((2, n)))]
V = lambda strips=None, **kw: dict({"schema": dm.SCHEMA, "strips": strips or {}}, **kw)   # noqa: E731


def capped(w):
    """as the render keeps a mix: lowered to −0.3 dBFS when it peaks above it"""
    pk = float(np.max(np.abs(w)))
    return w * dm.db(dm.CEILING_DBFS) / pk if pk > dm.db(dm.CEILING_DBFS) else w


C = {"threshold_db": -24, "ratio": 6, "attack_ms": 5, "release_ms": 120, "knee_db": 0, "makeup_db": 8}
wet, _s = compress(voc, rate, Compressor(threshold_db=-24, ratio=6, knee_db=0, attack_ms=5, release_ms=120, sidechain_hz=0.0))
wet = wet * dm.db(8)

y, rep, _ = dm.render(rate, sig, V({"lead_vocal": {"comp": dict(C, mix=0.4)}}))
want = capped(voc * 0.6 + wet * 0.4 + drm)
check("a strip's blend at 40 %: the dry at 60 % beside the compressed sound with its make-up at 40 %, said in the report",
      np.max(np.abs(y - want)) < 1e-12 and rep["strips"][0].get("comp_mix") == 0.4, np.max(np.abs(y - want)))
y1, rep1, _ = dm.render(rate, sig, V({"lead_vocal": {"comp": dict(C, mix=1)}}))
y0, rep0, _ = dm.render(rate, sig, V({"lead_vocal": {"comp": dict(C)}}))
check("  at 100 %, or not said: the compressor as before, to the sample", np.array_equal(y1, y0) and np.max(np.abs(y0 - capped(wet + drm))) < 1e-12 and "comp_mix" not in rep0["strips"][0],
      np.max(np.abs(y0 - capped(wet + drm))))
y, rep, _ = dm.render(rate, sig, V({"lead_vocal": {"comp": dict(C, mix=0)}}))
check("  at 0 %: the dry alone", np.max(np.abs(y - capped(voc + drm))) < 1e-12)
y, rep, _ = dm.render(rate, sig, V(buses=[{"id": "b1", "members": ["lead_vocal", "drums"], "comp": dict(C, mix=0.5)}]))
src = voc + drm
bw, _s = compress(src, rate, Compressor(threshold_db=-24, ratio=6, knee_db=0, attack_ms=5, release_ms=120, sidechain_hz=0.0))
check("a bus's blend at 50 %", np.max(np.abs(y - capped(src * 0.5 + bw * dm.db(8) * 0.5))) < 1e-12, np.max(np.abs(y - capped(src * 0.5 + bw * dm.db(8) * 0.5))))
y, rep, _ = dm.render(rate, sig, V(master={"comp": dict(C, mix=0.3)}))
mw, _s = compress(src, rate, Compressor(threshold_db=-24, ratio=6, knee_db=0, attack_ms=5, release_ms=120, sidechain_hz=0.0))
mwant = capped(src * 0.7 + mw * dm.db(8) * 0.3)
check("the master's blend at 30 %, said", np.max(np.abs(y - mwant)) < 1e-12 and rep["master"].get("comp_mix") == 0.3, np.max(np.abs(y - mwant)))
for wrong, why in (({"lead_vocal": {"comp": dict(C, mix=1.2)}}, "a blend over 100 %"), ({"lead_vocal": {"comp": dict(C, mix=-0.1)}}, "a blend under 0"),
                   ({"lead_vocal": {"comp": dict(C, mix=True)}}, "a blend that is not a number")):
    try:
        dm.render(rate, sig, V(wrong))
        check("refused: " + why, False, "rendered")
    except PlenioUserError:
        check("refused: " + why, True)

# the page's kernel, as the page plays it: the same cells, a cell later
js_file = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Documents/AI/Ruach_Studio/heresy/MISC/creator/build/tools/console/heresy-mixdsp.js"
node = shutil.which("node") or str(Path.home() / ".nvm/versions/node/v24.21.0/bin/node")
if js_file.exists() and os.path.exists(node) and "HERESY 1759" in js_file.read_text(encoding="utf-8"):
    d = Path(tempfile.mkdtemp())
    voc.astype(np.float32).tofile(d / "x.f32")
    js = """
global.window = {}; eval(require("fs").readFileSync(%s, "utf8").replace("window.RuachMixDsp", "global.RuachMixDsp"));
const K = RuachMixDsp.kernel, buf = new Float32Array(require("fs").readFileSync(%s).buffer.slice(0)), n = buf.length / 2;
const L = buf.subarray(0, n), R = buf.subarray(n), c = new K.Comp(%d, 2);
c.set({ on: true, threshold_db: -24, ratio: 6, knee_db: 0, attack_ms: 5, release_ms: 120, makeup_db: 8, mix: 0.4 });
const oL = new Float32Array(n), oR = new Float32Array(n);
for (let a = 0; a < n; a += 128) { const k = Math.min(128, n - a); c.run(L.subarray(a, a + k), R.subarray(a, a + k), oL.subarray(a, a + k), oR.subarray(a, a + k), k); }
require("fs").writeFileSync(%s, Buffer.concat([Buffer.from(oL.buffer), Buffer.from(oR.buffer)]));
""" % (json.dumps(str(js_file)), json.dumps(str(d / "x.f32")), rate, json.dumps(str(d / "y.f32")))
    (d / "run.js").write_text(js, encoding="utf-8")
    r = subprocess.run([node, str(d / "run.js")], capture_output=True, text=True)
    if r.returncode == 0:
        out = np.fromfile(d / "y.f32", dtype=np.float32).reshape(2, n).astype(np.float64)
        cell = round(rate / 1000)
        ref = voc * 0.6 + wet * 0.4
        err = np.max(np.abs(out[:, cell:] - ref[:, :-cell]))
        check("the page's kernel blends the same, a cell later, to float precision", err < 2e-6, err)
    else:
        check("the page's kernel ran", False, r.stderr[-300:])
    shutil.rmtree(d, ignore_errors=True)
else:
    print("  --    the page's kernel not checked here (no node, or heresy-mixdsp.js without 1759)")
print("test_daw_parallel:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
