"""HERESY 1531: the mixer's render, stage by stage against what it claims to be: neutral is the source; the pan is the Web Audio
stereo panner's law; the width is mid/side; the EQ is Plenio's, band for band; the compressor is Plenio's with its make-up; the
returns are Plenio's room and delay at their own level; mute, solo and the rest; refused typos; printed strips that sum to the mix;
daw_job.py takes the value end to end and the old one still. python3 lab/test_daw_mix.py"""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402
from plenio_core.audio import eq as peq  # noqa: E402
from plenio_core.audio.dynamics import Compressor, compress, limit  # noqa: E402
from plenio_core.audio.effects import delay as pdelay, reverb as preverb  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


rate, n = 48000, 48000 * 2
rng = np.random.default_rng(1531)
parts = {k: rng.standard_normal((2, n)) * 0.05 for k in ("lead_vocal", "drums", "bass")}
parts["drums"][1] *= 0.3                                  # not the same on both sides: the pan and the width have work to do
rest = rng.standard_normal((2, n)) * 0.01
sig = [(k, x) for k, x in parts.items()] + [("rest", rest)]
src = sum(x for _k, x in sig)
V = lambda strips=None, **kw: dict({"schema": dm.SCHEMA, "strips": strips or {}}, **kw)   # noqa: E731

y, rep, _ = dm.render(rate, sig, V())
check("neutral: the source again, nothing lowered, said neutral", np.max(np.abs(y - src)) < 1e-12 and rep["neutral"] and rep["lowered_db"] == 0, np.max(np.abs(y - src)))

# the pan: the Web Audio StereoPannerNode for a stereo input, written out again here from the spec's words
def web_pan(x, p):
    t = (p + 1 if p <= 0 else p) * math.pi / 2
    gl, gr = math.cos(t), math.sin(t)
    return np.stack([x[0] + x[1] * gl, x[1] * gr]) if p <= 0 else np.stack([x[0] * gl, x[1] + x[0] * gr])


for p in (-1, -0.4, 0.3, 1):
    y, _r, _ = dm.render(rate, sig, V({"drums": {"pan": p}}))
    want = src - parts["drums"] + web_pan(parts["drums"], p)
    check(f"pan {p:+g}: the Web Audio stereo panner's law", np.max(np.abs(y - want)) < 1e-12, np.max(np.abs(y - want)))
y, _r, _ = dm.render(rate, [("drums", parts["drums"])], V({"drums": {"width": 0}}))
check("width 0: mono, the two sides the same", np.max(np.abs(y[0] - y[1])) < 1e-12 and np.max(np.abs(y[0] - parts["drums"].mean(axis=0))) < 1e-12)
y, _r, _ = dm.render(rate, [("drums", parts["drums"])], V({"drums": {"width": 2}}))
m, s = parts["drums"].mean(axis=0), (parts["drums"][0] - parts["drums"][1]) / 2
check("width 2: the side doubled, the mid kept", np.max(np.abs((y[0] + y[1]) / 2 - m)) < 1e-12 and np.max(np.abs((y[0] - y[1]) / 2 - 2 * s)) < 1e-12)

bands = [{"id": "lo", "type": "highpass", "frequency_hz": 80, "q": 0.7}, {"id": "mud", "type": "peak", "frequency_hz": 300, "gain_db": -4, "q": 1.4},
         {"id": "air", "type": "high_shelf", "frequency_hz": 9000, "gain_db": 3}, {"id": "off", "type": "notch", "frequency_hz": 1000, "q": 5, "enabled": False}]
y, _r, _ = dm.render(rate, [("lead_vocal", parts["lead_vocal"])], V({"lead_vocal": {"eq": {"bands": bands}}}))
want = peq.apply(parts["lead_vocal"], rate, {"schema": peq.SCHEMA, "preamp_db": 0, "bands": [dict(b, slope=1.0) for b in bands[:3]]})
check("EQ: Plenio's RBJ bands, a disabled one left out, a shelf's slope 1", np.max(np.abs(y - want)) < 1e-12 and np.max(np.abs(y - parts["lead_vocal"])) > 1e-3)
y, _r, _ = dm.render(rate, [("lead_vocal", parts["lead_vocal"])], V({"lead_vocal": {"eq": {"on": False, "bands": bands}}}))
check("EQ off: the strip as it came", np.max(np.abs(y - parts["lead_vocal"])) < 1e-12)

comp = {"threshold_db": -30, "ratio": 4, "attack_ms": 5, "release_ms": 80, "knee_db": 6, "makeup_db": 3}
y, rep, _ = dm.render(rate, [("lead_vocal", parts["lead_vocal"])], V({"lead_vocal": {"comp": comp, "gain_db": -2}}))
c, _said = compress(parts["lead_vocal"], rate, Compressor(threshold_db=-30, ratio=4, knee_db=6, attack_ms=5, release_ms=80, sidechain_hz=0.0))
want = c * 10 ** (3 / 20) * 10 ** (-2 / 20)
check("compressor: Plenio's, its make-up, then the fader; its reduction said", np.max(np.abs(y - want)) < 1e-12 and rep["strips"][0]["gain_reduction_db"] > 0, rep["strips"][0])

pts = [[0.5, -6], [1.0, 0], [1.5, -20]]           # HERESY 1535: automation, after the fader, linear in dB
y, rep, _ = dm.render(rate, [("bass", parts["bass"])], V({"bass": {"auto": [[1.5, -20], [0.5, -6], [1.0, 0]], "gain_db": -2}}))
env = np.interp(np.arange(n) / rate, [p[0] for p in pts], [p[1] for p in pts])
check("automation: the points in any order, linear in dB between them, the first's level before, the last's after, after the fader",
      np.max(np.abs(y - parts["bass"] * 10 ** (-2 / 20) * 10 ** (env / 20))) < 1e-12 and rep["strips"][0]["auto_points"] == 3 and abs(env[0] + 6) < 1e-12 and abs(env[-1] + 20) < 1e-12)
for wrong, why in (({"bass": {"auto": [[1, 20]]}}, "an automation point above +12 dB"), ({"bass": {"auto": [[1]]}}, "an automation point without its level")):
    try:
        dm.render(rate, [("bass", parts["bass"])], V(wrong))
        check("refused: " + why, False, "rendered")
    except PlenioUserError:
        check("refused: " + why, True)
cfg = {"threshold_db": -30, "ratio": 4, "knee_db": 6, "attack_ms": 5, "release_ms": 80, "makeup_db": 0}   # HERESY 1537: the key
own, _s = dm.compress_keyed(parts["lead_vocal"], parts["lead_vocal"], rate, cfg)
plen, _s2 = compress(parts["lead_vocal"], rate, Compressor(threshold_db=-30, ratio=4, knee_db=6, attack_ms=5, release_ms=80, sidechain_hz=0.0))
check("the keyed compressor on its own strip is Plenio's, sample for sample", np.max(np.abs(own - plen)) < 1e-12, np.max(np.abs(own - plen)))
loudv = parts["lead_vocal"] * 4
y, rep, _ = dm.render(rate, [("lead_vocal", loudv), ("drums", parts["drums"])], V({"drums": {"comp": dict(cfg, key="lead_vocal")}}))
want, _s3 = dm.compress_keyed(parts["drums"], loudv, rate, cfg)
check("the drums ducked under the voice: their compressor listens to the voice as it enters its own (not to the drums)",
      np.max(np.abs(y - (loudv + want))) < 1e-12 and rep["strips"][1]["key"] == "lead_vocal" and rep["strips"][1]["gain_reduction_db"] > 3, rep["strips"][1])
y, rep, _ = dm.render(rate, [("lead_vocal", loudv), ("drums", parts["drums"])], V({"lead_vocal": {"mute": True}, "drums": {"comp": dict(cfg, key="lead_vocal")}}))
check("  a muted key still keys (the voice silent in the mix, the drums still ducked)", np.max(np.abs(y - want)) < 1e-12)
for wrong, why in (({"drums": {"comp": dict(cfg, key="drums")}}, "a strip keyed by itself"), ({"drums": {"comp": dict(cfg, key="piano")}}, "a key not of this set")):
    try:
        dm.render(rate, [("lead_vocal", loudv), ("drums", parts["drums"])], V(wrong))
        check("refused: " + why, False, "rendered")
    except PlenioUserError:
        check("refused: " + why, True)
y, _r, _ = dm.render(rate, [("bass", parts["bass"])], V({"bass": {"invert": True, "trim_db": 6}}))
check("polarity and trim", np.max(np.abs(y + parts["bass"] * 10 ** (6 / 20))) < 1e-12)

y, _r, _ = dm.render(rate, sig, V({"drums": {"mute": True}}))
check("a muted strip leaves exactly itself out", np.max(np.abs(y - (src - parts["drums"]))) < 1e-12)
y, _r, _ = dm.render(rate, sig, V({"bass": {"solo": True}, "drums": {"solo": True, "mute": True}}))
check("solo beats mute; the soloed alone, the rest silent too", np.max(np.abs(y - (parts["bass"] + parts["drums"]))) < 1e-12)

y, rep, _ = dm.render(rate, sig, V({"lead_vocal": {"reverb": 0.5, "pan": 0.5}}, reverb={"preset": "plate", "return_db": -6}))
send = web_pan(parts["lead_vocal"], 0.5) * 0.5
wet = preverb("plate")(send, rate)
k = round(0.05 * rate)
wet[:, -k:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(k) + 0.5) / k)
want = src - parts["lead_vocal"] + web_pan(parts["lead_vocal"], 0.5) + wet * 10 ** (-6 / 20)
check("the room: Plenio's plate on the send after the pan, at its return level", np.max(np.abs(y - want)) < 1e-9 and rep["returns"] == ["room"], np.max(np.abs(y - want)))
y, rep, _ = dm.render(rate, sig, V({"lead_vocal": {"reverb": 0.5}}, reverb={"mute": True}))
check("the room muted: no return", np.max(np.abs(y - src)) < 1e-12 and rep["returns"] == [])
y, rep, _ = dm.render(rate, sig, V({"drums": {"delay": 0.4}}, delay={"time_ms": 250, "feedback": 0.5, "lowpass_hz": 3000, "return_db": -3}))
wet = pdelay(time_ms=250, feedback=0.5, lowpass_hz=3000)(parts["drums"] * 0.4, rate)
wet[:, -k:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(k) + 0.5) / k)
want = src + wet * 10 ** (-3 / 20)
check("the delay: Plenio's feedback delay with its low-pass, at its return level", np.max(np.abs(y - want)) < 1e-12 and rep["returns"] == ["delay"], np.max(np.abs(y - want)))
ir = dm.reverb_ir(rate, "hall")
check("the room's impulse (/daw/ir): two sides, unit energy each, the hall's length", ir.shape == (2, round(2.4 * rate)) and np.allclose(np.sum(ir ** 2, axis=1), 1.0, atol=1e-9))
w, srate = sf.read(__import__("io").BytesIO(dm.ir_wav(rate, "room")), dtype="float32", always_2d=True)
check("  served as a float WAV, the same impulse", srate == rate and np.max(np.abs(w.T - dm.reverb_ir(rate, "room"))) < 1e-6)

loud = [(k, x * 8) for k, x in sig]
y, rep, _ = dm.render(rate, loud, V(master={"gain_db": 6}))
check("a mix over −0.3 dBFS lowered to it and said", abs(np.max(np.abs(y)) - 10 ** (-0.3 / 20)) < 1e-9 and rep["lowered_db"] > 0, rep["lowered_db"])

y, rep, pr = dm.render(rate, sig, V({"lead_vocal": {"reverb": 0.3, "gain_db": -3}, "drums": {"delay": 0.2, "pan": -0.3}, "bass": {"mute": True}}, master={"gain_db": -2}), keep=True)
check("printed: every audible strip and each return, summing to the mix", sorted(pr) == ["drums", "lead_vocal", "rest", "return-delay", "return-room"] and
      np.max(np.abs(sum(pr.values()) - y)) < 1e-12, sorted(pr))

for wrong, why in (({"drums": {"gian_db": 3}}, "a typo"), ({"drums": {"pan": 2}}, "pan out of range"), ({"drums": {"comp": {"ratio": 30}}}, "ratio out of range"),
                   ({"drums": {"eq": {"bands": [{"type": "tilt"}]}}}, "an unknown band type"), ({"drums": {"muted": [[3, 1]]}}, "a range that ends before it starts")):
    try:
        dm.render(rate, sig, V(wrong))
        check("refused: " + why, False, "rendered")
    except PlenioUserError:
        check("refused: " + why, True)
_y, rep, _ = dm.render(rate, sig, V({"piano": {"gain_db": -3}}))
check("a strip not of this set: left out and said", rep["notes"] and "piano" in rep["notes"][0])

# HERESY 1542: a cut's fall and rise its own
from plenio_core.audio.stems import mute_envelope  # noqa: E402
cuts = [(0.2, 0.5), (0.45, 0.9), (1.2, 1.205), (1.9, 2.5)]
check("a cut's edges: [start, end] alone is Plenio's mute envelope, sample for sample (touching cuts one, a short one shared, one past the end)",
      np.array_equal(dm.cut_envelope(n, rate, [(a, b, 0.01, 0.01) for a, b in cuts]), mute_envelope(n, rate, cuts)))
e = dm.cut_envelope(n, rate, [(0.5, 1.5, 0.4, 0.1)])
i0, f0 = round(0.5 * rate), round(0.4 * rate)
check("  its own fall: 0.4 s of raised cosine from its start, then silence, then 0.1 s of rise to its end",
      abs(e[i0 + f0 // 2] - 0.5) < 1e-3 and e[i0 + f0 + 10] == 0 and abs(e[round(1.45 * rate)] - 0.5) < 1e-3 and e[round(1.5 * rate)] == 1 and e[i0 - 1] == 1)
e = dm.cut_envelope(n, rate, [(0.5, 0.8, 0.4, 0.2)])
check("  longer edges than the cut: shared by their lengths (two thirds falling, a third rising), never past it",
      e[round(0.5 * rate) + round(0.2 * rate) - 1] < 0.01 and e[round(0.8 * rate)] == 1 and e[round(0.5 * rate) - 1] == 1)
e = dm.cut_envelope(n, rate, [(0.5, 1.0, 0.3, 0.05), (0.9, 1.4, 0.02, 0.25)])
check("  two cuts that touch: one, the first's fall and the last's rise", abs(e[round(0.65 * rate)] - 0.5) < 1e-3 and abs(e[round(1.275 * rate)] - 0.5) < 1e-3)
e = dm.cut_envelope(n, rate, [(0.5, 1.0, 0, 0)])
check("  a fall of 0: a hard cut", e[round(0.5 * rate)] == 0 and e[round(0.5 * rate) - 1] == 1 and e[round(1.0 * rate) - 1] == 0)
y, rep, _ = dm.render(rate, sig, V({"drums": {"muted": [[0.5, 1.5, 0.4, 0.1]]}}))
want = src - parts["drums"] + parts["drums"] * dm.cut_envelope(n, rate, [(0.5, 1.5, 0.4, 0.1)])
check("  the render takes [start, end, fall, rise]", np.max(np.abs(y - want)) < 1e-12)
for wrong, why in (([[0.5, 1, 0.1]], "three numbers"), ([[0.5, 1, -0.1, 0.1]], "a negative fall"), ([[0.5, 1, 0.1, 31]], "a rise over 30 s")):
    try:
        dm.render(rate, sig, V({"drums": {"muted": wrong}}))
        check("  refused: " + why, False, "rendered")
    except PlenioUserError:
        check("  refused: " + why, True)

# HERESY 1543: groups, a console's VCAs
G = lambda **kw: dict({"id": "band", "name": "Band", "members": ["drums", "bass"]}, **kw)   # noqa: E731
y, rep, _ = dm.render(rate, sig, V({"drums": {"gain_db": -2}}, groups=[G(gain_db=-6)]))
want = src - parts["drums"] - parts["bass"] + parts["drums"] * dm.db(-8) + parts["bass"] * dm.db(-6)
check("a group's fader adds its dB to each member's (−2 and −6 is −8), the others as they are; said in the report",
      np.max(np.abs(y - want)) < 1e-12 and [r.get("vca_db") for r in rep["strips"] if r["name"] == "bass"] == [-6], np.max(np.abs(y - want)))
y, rep, _ = dm.render(rate, sig, V(groups=[G(mute=True)]))
check("  its mute mutes its members", np.max(np.abs(y - (parts["lead_vocal"] + rest))) < 1e-12 and not rep["neutral"])
y, rep, _ = dm.render(rate, sig, V(groups=[G(solo=True)]))
check("  its solo solos them", np.max(np.abs(y - (parts["drums"] + parts["bass"]))) < 1e-12)
y, rep, _ = dm.render(rate, sig, V({"lead_vocal": {"solo": True}}, groups=[G(solo=True)]))
check("  with a strip's own solo beside it: both heard", np.max(np.abs(y - (parts["drums"] + parts["bass"] + parts["lead_vocal"]))) < 1e-12)
y, rep, _ = dm.render(rate, sig, V(groups=[G(gain_db=-3), {"id": "low", "members": ["bass"], "gain_db": -3}]))
check("  a strip in two groups: their dB add", np.max(np.abs(y - (src - parts["drums"] - parts["bass"] + parts["drums"] * dm.db(-3) + parts["bass"] * dm.db(-6)))) < 1e-12)
y, rep, _ = dm.render(rate, sig, V(groups=[G(members=["drums", "piano"], gain_db=-3)]))
check("  a member not of this set: left out of it and said", "piano" in " ".join(rep["notes"]) and np.max(np.abs(y - (src - parts["drums"] + parts["drums"] * dm.db(-3)))) < 1e-12)
y, rep, _ = dm.render(rate, sig, V(groups=[G()]))
check("  a group at 0 dB, neither muted nor soloed: the source, neutral", np.max(np.abs(y - src)) < 1e-12 and rep["neutral"])
for wrong, why in (([G(), G()], "two groups of one id"), ([G(gian_db=1)], "a typo in a group"), ([G(gain_db=20)], "a group's fader past +12"), ([G(members="drums")], "members not a list"),
                   ([G(id="g%d" % i) for i in range(17)], "seventeen groups")):
    try:
        dm.render(rate, sig, V(groups=wrong))
        check("  refused: " + why, False, "rendered")
    except PlenioUserError:
        check("  refused: " + why, True)

# HERESY 1544: the master's chain: EQ, compressor, Plenio's limiter, then the fader
hot = [(k, x * 6) for k, x in sig]
hsrc = src * 6
y, rep, pr = dm.render(rate, hot, V(master={"limit": {"ceiling_db": -1.0}}), keep=True)
want, said = limit(hsrc, rate, ceiling_dbtp=-1.0, drive_db=0, lookahead_ms=3.0, release_ms=100)
check("the master's limiter is Plenio's (4×, 3 ms, ceiling −1 dBTP), sample for sample; said, and nothing lowered after it",
      np.max(np.abs(y - want)) < 1e-12 and rep["master"]["limit"] and rep["master"]["limit_reduction_db"] == said["max_reduction_db"] > 0 and rep["lowered_db"] == 0,
      (np.max(np.abs(y - want)), rep["master"], rep["lowered_db"]))
check("  printed: what enters the master, said so (the chain is the mix's alone)", rep["printed_at"] == "the master's input" and np.max(np.abs(sum(pr.values()) - hsrc)) < 1e-12)
mb = [{"id": "air", "type": "high_shelf", "frequency_hz": 9000, "gain_db": 2, "q": 0.7}]
mc = {"threshold_db": -20, "ratio": 2, "attack_ms": 20, "release_ms": 200, "makeup_db": 1.5}
y, rep, _ = dm.render(rate, hot, V(master={"eq": {"bands": mb}, "comp": mc, "limit": {"ceiling_db": -2, "drive_db": 1, "release_ms": 60}, "gain_db": -1}))
w1 = peq.apply(hsrc, rate, dm.eq_settings({"on": True, "bands": [dict(mb[0], enabled=True)]}))
w2, _s = compress(w1, rate, Compressor(threshold_db=-20, ratio=2, knee_db=6, attack_ms=20, release_ms=200, sidechain_hz=0.0))
w3, _s = limit(w2 * dm.db(1.5), rate, ceiling_dbtp=-2, drive_db=1, lookahead_ms=3.0, release_ms=60)
check("  in its order: EQ · compressor and its make-up · limiter (its drive, its release) · the fader", np.max(np.abs(y - w3 * dm.db(-1))) < 1e-12 and not rep["neutral"],
      np.max(np.abs(y - w3 * dm.db(-1))))
y, rep, _ = dm.render(rate, sig, V(master={"limit": {"on": False}, "comp": dict(mc, on=False)}))
check("  a chain all off: the source, neutral", np.max(np.abs(y - src)) < 1e-12 and rep["neutral"] and rep["master"] == {} and rep["printed_at"] == "the mix")
for wrong, why in (({"limit": {"ceiling_db": -0.1}}, "a ceiling above −0.3"), ({"limit": {"ceilng_db": -1}}, "a typo in the limit"), ({"comp": {"key": "drums"}}, "a key on the master")):
    try:
        dm.render(rate, sig, V(master=wrong))
        check("  refused: " + why, False, "rendered")
    except PlenioUserError:
        check("  refused: " + why, True)

# end to end: daw_job.py on a take folder
root = Path(tempfile.mkdtemp())
d = root / "take"
(d / "derived/stems-four").mkdir(parents=True)
sf.write(d / "audio.wav", src.T.astype(np.float32), rate, subtype="FLOAT")
for k2, x in parts.items():
    sf.write(d / f"derived/stems-four/{k2}.flac", x.T.astype(np.float32), rate, subtype="PCM_24")
json.dump({"id": "stems-four", "kind": "stems", "mode": "four", "source": "the take", "files": [{"name": k2, "file": k2 + ".flac"} for k2 in parts]},
          open(d / "derived/stems-four/manifest.json", "w"))


def job(mix, printed=False):
    out = root / f"out-{abs(hash(json.dumps(mix, sort_keys=True)))}-{int(printed)}"
    spec = root / "spec.json"
    json.dump({"set": "derived/stems-four", "mix": mix, "versions": {}, "print": printed}, open(spec, "w"))
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("daw_job.py")), str(d), str(spec), str(out)], capture_output=True, text=True)
    return r, out


r, out = job(V({"drums": {"pan": -0.5, "comp": comp}, "lead_vocal": {"reverb": 0.2}}), printed=True)
res = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else {}
files = [f["file"] for f in res.get("files", [])]
check("daw_job.py: the mixer's value rendered, the mix first, each strip and return printed beside it",
      r.returncode == 0 and files[0] == "mix.flac" and "stems/drums.flac" in files and "stems/return-room.flac" in files and res["report"]["schema"] == dm.SCHEMA,
      r.stderr[-400:] or files)
if r.returncode == 0:
    y, _ = sf.read(out / "mix.flac", dtype="float64", always_2d=True)
    want, _r, _ = dm.render(rate, [(k2, sf.read(d / f"derived/stems-four/{k2}.flac", dtype="float64", always_2d=True)[0].T) for k2 in parts] +
                            [("rest", src - sum(sf.read(d / f"derived/stems-four/{k2}.flac", dtype="float64", always_2d=True)[0].T for k2 in parts))],
                            V({"drums": {"pan": -0.5, "comp": comp}, "lead_vocal": {"reverb": 0.2}}))
    check("  the file is the render (24-bit)", np.max(np.abs(y.T - want)) < 1e-6, np.max(np.abs(y.T - want)))
r, out = job({"schema": "plenio.stem_mix/1", "strips": {"drums": {"mute": True}}})
check("daw_job.py: Plenio's own value as before", r.returncode == 0 and json.loads(r.stdout.strip().splitlines()[-1])["report"]["schema"] == "plenio.stem_mix/1", r.stderr[-300:])
print("test_daw_mix:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
