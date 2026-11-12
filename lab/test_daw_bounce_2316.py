"""HERESY 2316: bounce in place. What a bus, a VCA's lanes or one lane put into the master (their strips as heard, the bus's chain, their share of
the room and the delay) laid in a lane of its own at 0 dB with them muted gives the master the same sum: the mix rendered before and after is
the same to 1e-9, its chain and fade after it too. A bus shared with lanes left out is refused; a soloed member's solo goes to the new lane; a
bounce above full scale is written lower and its lane raised as much. The job (daw_job.py) writes a lane the set reads as its own.
python3 lab/test_daw_bounce_2316.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw  # noqa: E402
import daw_mix as dm  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


rate, secs = 48000, 4
rng = np.random.default_rng(2316)
t = np.arange(rate * secs) / rate


def tone(f, a):
    x = a * np.sin(2 * np.pi * f * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * t))
    return np.stack([x, 0.8 * x + 0.02 * rng.standard_normal(len(t))])


signals = [("drums", tone(110, 0.3)), ("bass", tone(55, 0.35)), ("guitar", tone(330, 0.25)), ("lead_vocal", tone(440, 0.2)), ("rest", tone(880, 0.02))]
mix = {"schema": dm.SCHEMA,
       "strips": {"drums": {"gain_db": -2, "pan": -0.3, "reverb": 0.4, "comp": {"on": True, "threshold_db": -20, "ratio": 3}, "auto": [[0.5, -6, "s"], [2.5, 0]]},
                  "bass": {"gain_db": 1.5, "delay": 0.3, "eq": {"on": True, "bands": [{"id": "1", "type": "low_shelf", "enabled": True, "frequency_hz": 120, "gain_db": 3, "q": 0.7}]}},
                  "guitar": {"width": 1.6, "pan": 0.4, "reverb": 0.2, "delay": 0.1, "muted": [[1.0, 1.4]]},
                  "lead_vocal": {"comp": {"on": True, "threshold_db": -24, "ratio": 2, "key": "drums"}, "reverb": 0.3}},
       "reverb": {"preset": "room", "return_db": -3, "predelay_ms": 20, "lowcut_hz": 150},
       "delay": {"time_ms": 250, "feedback": 0.4, "lowpass_hz": 5000, "return_db": -6},
       "buses": [{"id": "b1", "name": "Rhythm", "members": ["drums", "bass"], "gain_db": -1, "comp": {"on": True, "threshold_db": -18, "ratio": 2}, "pan": 0.1}],
       "groups": [{"id": "v1", "name": "Tops", "members": ["guitar", "lead_vocal"], "gain_db": -2}],
       "master": {"limit": {"on": True, "ceiling_db": -1}, "fade_out_s": 1.0}}


def after(value, members, track, y, gain_db=0.0, solo=False):
    v = json.loads(json.dumps(value))
    for n in members:
        v["strips"].setdefault(n, {})["mute"] = True
        v["strips"][n].pop("solo", None)
    v["strips"][track] = {"gain_db": gain_db} if gain_db else {}
    if solo:
        v["strips"][track]["solo"] = True
    return v, signals[:-1] + [(track, y)] + signals[-1:]


before, rep0, _ = dm.render(rate, signals, mix)
for members, what in ((["drums", "bass"], "the bus «Rhythm»"), (["guitar", "lead_vocal"], "the VCA «Tops»"), (["guitar"], "one lane")):
    y, rep = dm.bounce(rate, signals, mix, members)
    v2, sig2 = after(mix, members, "bounce_1", y)
    out, rep2, _ = dm.render(rate, sig2, v2)
    d = float(np.max(np.abs(out - before)))
    check(f"{what}: the mix the same to 1e-9 with it bounced and its lanes muted", d < 1e-9, d)
    check(f"{what}: the room's and the delay's share in it", set(rep["returns"]) == {"room", "delay"}, rep["returns"])
try:
    dm.bounce(rate, signals, mix, ["drums"])
    check("a bus shared with lanes left out refused", False, "accepted")
except PlenioUserError as e:
    check("a bus shared with lanes left out refused", "Rhythm" in str(e) and "bass" in str(e), str(e))
try:
    dm.bounce(rate, signals, mix, ["nobody"])
    check("no strip of the set refused", False, "accepted")
except PlenioUserError:
    check("no strip of the set refused", True)
solo = json.loads(json.dumps(mix))
solo["strips"]["guitar"]["solo"] = True
b_solo, _, _ = dm.render(rate, signals, solo)
y, _ = dm.bounce(rate, signals, solo, ["guitar"])
v3, sig3 = after(solo, ["guitar"], "bounce_1", y, solo=True)
o3, _, _ = dm.render(rate, sig3, v3)
check("a soloed member: its solo goes to the new lane, the mix the same", float(np.max(np.abs(o3 - b_solo))) < 1e-9, float(np.max(np.abs(o3 - b_solo))))
loud = json.loads(json.dumps(mix))
loud["strips"]["bass"]["gain_db"] = 12
loud["buses"][0]["gain_db"] = 12
y, _ = dm.bounce(rate, signals, loud, ["drums", "bass"])
pk = float(np.max(np.abs(y)))
g = round(20 * np.log10(pk / 0.999), 3)                  # as daw_job.py writes it
v4, sig4 = after(loud, ["drums", "bass"], "bounce_1", y / 10 ** (g / 20), gain_db=g)
o4, _, _ = dm.render(rate, sig4, v4)
b4, _, _ = dm.render(rate, signals, loud)
check("above full scale: written lower, its lane raised as much, the mix the same", pk > 1 and float(np.max(np.abs(o4 - b4))) < 1e-9, (pk, float(np.max(np.abs(o4 - b4)))))

# ---- the job: a take of three stems, a bounce written as a lane the set reads as its own
with tempfile.TemporaryDirectory() as td:
    d = Path(td)
    src = np.stack([tone(220, 0.2)[0] * 3, tone(220, 0.2)[1] * 3])
    sf.write(str(d / "audio.wav"), src.T.astype(np.float32), rate, subtype="FLOAT")
    (d / "derived" / "stems-x").mkdir(parents=True)
    for n in ("drums", "bass", "other"):
        sf.write(str(d / "derived" / "stems-x" / f"{n}.wav"), tone(220, 0.2).T.astype(np.float32), rate, subtype="FLOAT")
    json.dump({"kind": "stems", "source": "the take", "files": [{"name": n, "file": f"{n}.wav"} for n in ("drums", "bass", "other")]},
              open(d / "derived" / "stems-x" / "manifest.json", "w"))
    out = d / "derived" / "bounce-test.part"
    spec = d / "spec.json"
    value = {"schema": dm.SCHEMA, "strips": {"drums": {"gain_db": -3, "reverb": 0.2}}, "buses": [{"id": "b", "name": "B", "members": ["drums", "bass"]}]}
    json.dump({"set": "derived/stems-x", "mix": value, "versions": {}, "bounce": {"members": ["drums", "bass"], "title": "B", "track": "bounce_1"}}, open(spec, "w"))
    r = subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "daw_job.py"), str(d), str(spec), str(out)], capture_output=True, text=True, timeout=300)
    check("the job ran", r.returncode == 0, r.stderr[-400:])
    if r.returncode == 0:
        got = json.loads(r.stdout.strip().splitlines()[-1])
        f = got["files"][0]
        check("…one file, its track named", f["track"] == "bounce_1" and f["file"] == "bounce.flac" and (out / "bounce.flac").is_file(), got["files"])
        man = {"id": "bounce-test", "kind": "bounce", "files": [dict(f, path="derived/bounce-test/bounce.flac")], "created": "2026-11-10 20:00"}
        out.rename(d / "derived" / "bounce-test")
        json.dump(man, open(d / "derived" / "bounce-test" / "manifest.json", "w"))
        info = daw.set_info(d, "derived/stems-x", [man, json.load(open(d / "derived" / "stems-x" / "manifest.json"))])
        names = [s["name"] for s in info["strips"]]
        check("the set reads it as a lane of its own, added (no part of the rest)", "bounce_1" in names and [s for s in info["strips"] if s["name"] == "bounce_1"][0].get("added"), names)

print("test_daw_bounce_2316: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
