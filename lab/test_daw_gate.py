"""HERESY 1760: a strip's gate, a downward expander. A loud passage keeps its level; a quiet one settles at the ratio's reduction, never below the
range; it opens by the attack and closes by the release; off (or unsaid) the strip as before, to the sample; it listens to the strip itself when
the compressor is keyed to another, and its gain multiplies the compressor's; refused out of range. And the page's kernel (heresy-mixdsp.js, by
node when it is found) gives the same numbers, a cell later. python3 lab/test_daw_gate.py [heresy-mixdsp.js]"""
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
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:400] + ")"))
    if not ok:
        bad.append(what)


rate = 48000
amp = lambda dbfs: 10 ** (dbfs / 20) * math.sqrt(2)   # noqa: E731   a sine whose RMS is dbfs
t = np.arange(rate * 3) / rate
G = {"on": True, "threshold_db": -50, "ratio": 4, "range_db": 40, "attack_ms": 2, "release_ms": 150}


def tone(dbfs, f=1000.0, n=None):                     # 1 kHz: a whole period a 1 ms cell, so each cell's level is the tone's
    x = np.sin(2 * np.pi * f * t[: n or len(t)]) * amp(dbfs)
    return np.stack([x, x])


def at(env, s):
    return 20 * math.log10(env[int(s * rate)])


e, _ = dm.gate_env(tone(-20), rate, G)
check("a loud passage (−20 dBFS, the threshold −50): the gate stays open, 0 dB", abs(at(e, 2.5)) < 1e-9, at(e, 2.5))
e, _ = dm.gate_env(tone(-70), rate, G)
check("  a quiet one (−70 dBFS): 3 × (−20) is −60, the range holds it at −40 dB", abs(at(e, 2.5) + 40) < 0.05, at(e, 2.5))
e, _ = dm.gate_env(tone(-60), rate, dict(G, ratio=2))
check("  −60 dBFS at a ratio of 2: −10 dB", abs(at(e, 2.5) + 10) < 0.05, at(e, 2.5))
burst = tone(-70)
burst[:, rate:2 * rate] = tone(-20)[:, rate:2 * rate]
e, _ = dm.gate_env(burst, rate, G)
check("  it opens by the attack (2 ms: open within 15 ms of the burst) and closes by the release (150 ms: about 63 % of the way 150 ms after)",
      at(e, 1.015) > -0.5 and -30 < at(e, 2.15) < -22 and at(e, 2.9) < -39, (at(e, 1.015), at(e, 2.15), at(e, 2.9)))

voc, drm = tone(-70, 220), tone(-20, 110)
sig = [("lead_vocal", voc), ("drums", drm), ("rest", np.zeros_like(voc))]
V = lambda strips=None, **kw: dict({"schema": dm.SCHEMA, "strips": strips or {}}, **kw)   # noqa: E731
y0, r0, _ = dm.render(rate, sig, V())
y1, r1, _ = dm.render(rate, sig, V({"lead_vocal": {"gate": dict(G, on=False)}}))
check("the gate off: the strip as before, to the sample", np.array_equal(y0, y1) and "gate_reduction_db" not in r1["strips"][0])
y2, r2, _ = dm.render(rate, sig, V({"lead_vocal": {"gate": G}}))
ge, _s = dm.gate_env(voc, rate, G)
check("  on: the strip times its gain, said in the report", np.max(np.abs(y2 - (voc * ge[None, :] + drm))) < 1e-12 and abs(r2["strips"][0]["gate_reduction_db"] - 40) < 0.05,
      (np.max(np.abs(y2 - (voc * ge[None, :] + drm))), r2["strips"][0].get("gate_reduction_db")))
C = {"threshold_db": -40, "ratio": 4, "attack_ms": 5, "release_ms": 100, "knee_db": 0, "makeup_db": 0, "key": "drums"}
y3, r3, _ = dm.render(rate, sig, V({"lead_vocal": {"gate": G, "comp": C}}))
y4, r4, _ = dm.render(rate, sig, V({"lead_vocal": {"comp": C}}))
check("  the compressor keyed to the drums, the gate still listening to the voice: the two gains multiply",
      np.max(np.abs((y3 - drm) - (y4 - drm) * ge[None, :])) < 1e-12, np.max(np.abs((y3 - drm) - (y4 - drm) * ge[None, :])))
for wrong, why in (({"threshold_db": 5}, "a threshold over 0"), ({"ratio": 0.5}, "a ratio under 1"), ({"range_db": 100}, "a range over 80"),
                   ({"attack_ms": 0}, "an attack of 0"), ({"hold_ms": 10}, "a field it has not")):
    try:
        dm.render(rate, sig, V({"lead_vocal": {"gate": dict(G, **wrong)}}))
        check("refused: " + why, False, "rendered")
    except PlenioUserError:
        check("refused: " + why, True)

# the page's kernel: the gate alone, and with the compressor (and its blend), a cell later
js_file = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Documents/AI/Ruach_Studio/heresy/MISC/creator/build/tools/console/heresy-mixdsp.js"
node = shutil.which("node") or str(Path.home() / ".nvm/versions/node/v24.21.0/bin/node")
if js_file.exists() and os.path.exists(node) and "HERESY 1760" in js_file.read_text(encoding="utf-8"):
    d = Path(tempfile.mkdtemp())
    burst.astype(np.float32).tofile(d / "x.f32")
    n = burst.shape[1]
    js = """
global.window = {}; eval(require("fs").readFileSync(%s, "utf8").replace("window.RuachMixDsp", "global.RuachMixDsp"));
const K = RuachMixDsp.kernel, buf = new Float32Array(require("fs").readFileSync(%s).buffer.slice(0)), n = buf.length / 2;
const L = buf.subarray(0, n), R = buf.subarray(n), out = [];
for (const p of [{ on: false, gate: %s }, { on: true, threshold_db: -40, ratio: 4, knee_db: 0, attack_ms: 5, release_ms: 100, makeup_db: 3, mix: 0.6, gate: %s }]) {
  const c = new K.Comp(%d, 2); c.set(p);
  const oL = new Float32Array(n), oR = new Float32Array(n);
  for (let a = 0; a < n; a += 128) { const k = Math.min(128, n - a); c.run(L.subarray(a, a + k), R.subarray(a, a + k), oL.subarray(a, a + k), oR.subarray(a, a + k), k); }
  out.push(Buffer.from(oL.buffer));
}
require("fs").writeFileSync(%s, Buffer.concat(out));
""" % (json.dumps(str(js_file)), json.dumps(str(d / "x.f32")), json.dumps(G), json.dumps(G), rate, json.dumps(str(d / "y.f32")))
    (d / "run.js").write_text(js, encoding="utf-8")
    r = subprocess.run([node, str(d / "run.js")], capture_output=True, text=True)
    if r.returncode == 0:
        got = np.fromfile(d / "y.f32", dtype=np.float32).reshape(2, n).astype(np.float64)
        cell = round(rate / 1000)
        eg, _s = dm.gate_env(burst, rate, G)
        want1 = burst[0] * eg
        y, _r, _p = dm.render(rate, [("lead_vocal", burst), ("rest", np.zeros_like(burst))],
                              V({"lead_vocal": {"gate": G, "comp": {"threshold_db": -40, "ratio": 4, "knee_db": 0, "attack_ms": 5, "release_ms": 100, "makeup_db": 3, "mix": 0.6}}}))
        e1 = np.max(np.abs(got[0, cell:] - want1[:-cell]))
        sc = float(np.max(np.abs(y)))
        want2 = y[0]                                  # the render is not lowered here (sc under the ceiling, checked below)
        e2 = np.max(np.abs(got[1, cell:] - want2[:-cell]))
        check("the page's kernel: the gate alone, and the gate over the compressor and its blend, the same a cell later, to float precision",
              e1 < 2e-6 and e2 < 2e-6 and sc < dm.db(dm.CEILING_DBFS), (e1, e2, sc))
    else:
        check("the page's kernel ran", False, r.stderr[-300:])
    shutil.rmtree(d, ignore_errors=True)
else:
    print("  --    the page's kernel not checked here (no node, or heresy-mixdsp.js without 1760)")
print("test_daw_gate:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
