"""HERESY 2865: the DAW's Forge way, its pieces against the bounce's own whole render (lab/daw_mix.render, no lowering), on the processor.
    python3 test_daw_play_pieces.py [TAKE_DIR SET_REL [SECONDS]]
A busy mix with every time-bound thing the pieces redo on their windows: a lane shifted and on one channel, cuts with their own fades, a
copy and a move laid along a lane, volume and pan drawn (one shaped), the song's fade in and out and its end; and the strip chain, the
groups, a bus, both returns and the master's chain. The song's first SECONDS (default 40) are compared: every sample within 1e-4 of the
whole (−80 dBFS) away from the seams, and the seams themselves within 2e-3 after the crossfade."""
import json, os, sys, time
from pathlib import Path
import numpy as np
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
LAB = Path(__file__).resolve().parent
if not (LAB / "daw_mix.py").is_file():
    LAB = Path.home() / "Documents/AI/Ruach_Studio/lab"
sys.path.insert(0, str(LAB))
import soundfile as sf  # noqa: E402
import daw, daw_mix, daw_play  # noqa: E402

R = Path.home() / "Documents/AI/Ruach_Studio"
d = Path(sys.argv[1]) if len(sys.argv) > 1 else R / "outputs/20261028-124546-song"
rel = sys.argv[2] if len(sys.argv) > 2 else "derived/stems-eight-20261030-213721"
SECS = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
if not (d / rel / "manifest.json").is_file():
    print("test_daw_play_pieces: skipped (no set of stems at", d / rel, ")")
    sys.exit(0)
derived = [json.load(open(m)) for m in sorted((d / "derived").glob("*/manifest.json"))]
info = daw.set_info(d, rel, derived)
rate, ch = int(info["rate"]), int(info["channels"])
names = [s["name"] for s in info["strips"]] + [daw.REST]
n0, n1, n2 = names[0], names[1], names[2]
mix = {"schema": daw_mix.SCHEMA,
       "strips": {n0: {"eq": {"on": True, "bands": [{"type": "highpass", "frequency_hz": 60}, {"type": "peak", "frequency_hz": 2500, "gain_db": 3, "q": 1.4}]},
                       "comp": {"on": True, "threshold_db": -24, "ratio": 4}, "reverb": 0.3, "delay": 0.15, "pan": -0.2, "width": 1.3,
                       "muted": [[6.2, 7.9, 0.3, 0.05], [12.0, 12.5]], "auto": [[0, 0], [8, -6, 0.6], [14, 2], [30, -3, "s"], [36, 0]],
                       "autos": {"pan": [[0, -0.5], [20, 0.5]]}, "gate": {"on": True, "threshold_db": -45}},
                  n1: {"offset_s": 0.37, "chan": "l", "gain_db": -2, "edits": [{"op": "copy", "a": 3.0, "b": 6.5, "to": 14.2}, {"op": "move", "a": 20.0, "b": 21.0, "to": 9.4}],
                       "comp": {"on": True, "key": n0, "threshold_db": -30, "ratio": 3}},
                  n2: {"offset_s": -0.5, "solo": False, "delay": 0.4, "trim_db": 2, "invert": True},
                  daw.REST: {"gain_db": -4, "reverb": 0.2}},
       "reverb": {"preset": "hall", "return_db": -3}, "delay": {"time_ms": 375, "feedback": 0.45},
       "groups": [{"id": "g1", "name": "G", "members": [n0, n1], "gain_db": -1.5}],
       "buses": [{"id": "b1", "name": "B", "members": [n2], "gain_db": 1, "comp": {"on": True, "threshold_db": -20}}],
       "master": {"eq": {"on": True, "bands": [{"type": "low_shelf", "frequency_hz": 120, "gain_db": 1.5}]}, "comp": {"on": True, "threshold_db": -16, "ratio": 2},
                  "limit": {"on": True, "ceiling_db": -1}, "fade_in_s": 2.5, "fade_out_s": 6.0, "end_s": SECS - 1.0}}
spec = {"rate": rate, "ch": ch, "frames": round(SECS * rate), "names": names,
        "paths": {s["name"]: str(daw._inside(d, s["path"])) for s in info["strips"]},
        "strips": [{"name": s["name"], "own": str(daw._inside(d, s["path"])), "added": bool(s.get("added"))} for s in info["strips"]],
        "source": str(daw._inside(d, info["source"])), "mix": mix, "ref": {}, "mono": False}
try:
    daw_mix.parse(mix, names, rate)
except Exception as e:                       # the buses' shape is the page's: say it plainly if the test's value is off
    print("the test's mix does not parse:", e)
    raise
frames = spec["frames"]


def rd(p):
    x = sf.read(p, dtype="float32", always_2d=True, frames=frames)[0].T.astype(np.float64)
    return np.pad(x, ((0, 0), (0, frames - x.shape[1])))


src = rd(spec["source"])
rest = src.copy()
sig = []
for s in spec["strips"]:
    x = rd(s["own"])
    if not s["added"]:
        rest -= x
    sig.append((s["name"], x))
sig.append((daw.REST, rest))
keep = daw_mix.CEILING_DBFS
daw_mix.CEILING_DBFS = 600.0
t = time.time()
whole, rep, _ = daw_mix.render(rate, sig, mix)
tw = time.time() - t
daw_mix.CEILING_DBFS = keep
pf = round(daw_play.PIECE * rate)
parts, said, tp = [], [], time.time()
for k in range(int(np.ceil(frames / pf))):
    p, s = daw_play.render_piece(spec, k)
    parts.append(p.astype(np.float64)); said.append(s)
tp = time.time() - tp
# the pieces joined as send_wav joins them: each one's start crossfaded from the tail of the one before
joined = []
for k, p in enumerate(parts):
    x = p[:, :said[k]["frames"]].copy()
    if k and said[k - 1]["tail"]:
        tt = min(said[k - 1]["tail"], x.shape[1])
        w = 0.5 - 0.5 * np.cos(np.pi * (np.arange(tt) + 0.5) / tt)
        x[:, :tt] = parts[k - 1][:, said[k - 1]["frames"]:said[k - 1]["frames"] + tt] * (1 - w) + x[:, :tt] * w
    joined.append(x)
joined = np.concatenate(joined, axis=1)
diff = np.abs(joined - whole)
seams = np.zeros(frames, bool)
for k in range(1, len(parts)):
    seams[max(0, k * pf - 2 * rate // 1000):k * pf + round(daw_play.XF * rate) + 2 * rate // 1000] = True
inner, at_seams = diff[:, ~seams].max(), diff[:, seams].max()
db = lambda v: 20 * np.log10(max(v, 1e-12))
print(f"{SECS:.0f} s, {len(parts)} pieces of {daw_play.PIECE:g} s (+{daw_play.PRE:g} s before): whole {tw:.1f} s, pieces {tp:.1f} s; peak {rep['peak_db']} dBFS")
print(f"  away from the seams: max |diff| {inner:.2e} ({db(inner):.0f} dBFS) at {np.unravel_index(np.argmax(np.where(seams[None, :], 0, diff)), diff.shape)[1] / rate:.3f} s")
print(f"  at the seams:        max |diff| {at_seams:.2e} ({db(at_seams):.0f} dBFS)")
m = said[1]["m"]
print("  meters of piece 1:", sorted(m)[:12], "· master blocks", len(m["*"]["kw"]), "· a block's peak", m["*"]["pk"][0])
bad = []
if inner > 1e-4:
    bad.append("pieces differ from the whole away from the seams")
if at_seams > 2e-3:
    bad.append("a seam differs from the whole")
if len(m["*"]["kw"]) != round(daw_play.PIECE / daw_play.BLOCK):
    bad.append("the master's blocks are not a piece's")
print("test_daw_play_pieces:", "all passed" if not bad else "FAILED: " + "; ".join(bad))
sys.exit(1 if bad else 0)
