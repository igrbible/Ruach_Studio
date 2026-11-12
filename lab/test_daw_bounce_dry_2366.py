"""HERESY 2366 (Viktor 11.11.2026, «сухой баунс — сделать вариантом»): a dry bounce is the strips' own sum without their share of the room and the
delay: the same as the wet one with both returns muted, the report saying it; with nothing sent, dry and wet are one; the job takes «dry» from its
spec and the wet bounce of 2316 is unchanged (its test still holds).
python3 lab/test_daw_bounce_dry_2366.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


rate, secs = 48000, 3
rng = np.random.default_rng(2366)
t = np.arange(rate * secs) / rate


def tone(f, a):
    x = a * np.sin(2 * np.pi * f * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * t))
    return np.stack([x, 0.8 * x + 0.02 * rng.standard_normal(len(t))])


signals = [("drums", tone(110, 0.3)), ("bass", tone(55, 0.35)), ("guitar", tone(330, 0.25)), ("lead_vocal", tone(440, 0.2)), ("rest", tone(880, 0.02))]
mix = {"schema": dm.SCHEMA,
       "strips": {"drums": {"gain_db": -2, "pan": -0.3, "reverb": 0.4, "comp": {"on": True, "threshold_db": -20, "ratio": 3}},
                  "bass": {"gain_db": 1.5, "delay": 0.3},
                  "guitar": {"width": 1.6, "pan": 0.4, "reverb": 0.2, "delay": 0.1, "muted": [[1.0, 1.4]]},
                  "lead_vocal": {"comp": {"on": True, "threshold_db": -24, "ratio": 2, "key": "drums"}, "reverb": 0.3}},
       "reverb": {"preset": "room", "return_db": -3, "predelay_ms": 20, "lowcut_hz": 150},
       "delay": {"time_ms": 250, "feedback": 0.4, "lowpass_hz": 5000, "return_db": -6},
       "buses": [{"id": "b1", "name": "Rhythm", "members": ["drums", "bass"], "gain_db": -1, "comp": {"on": True, "threshold_db": -18, "ratio": 2}}],
       "groups": [{"id": "v1", "name": "Tops", "members": ["guitar", "lead_vocal"], "gain_db": -2}]}
muted = json.loads(json.dumps(mix))
muted["reverb"]["mute"] = True
muted["delay"]["mute"] = True
for members, what in ((["drums", "bass"], "the bus «Rhythm»"), (["guitar", "lead_vocal"], "the VCA «Tops»"), (["guitar"], "one lane")):
    wet, rw = dm.bounce(rate, signals, mix, members)
    dry, rd = dm.bounce(rate, signals, mix, members, dry=True)
    ref, _ = dm.bounce(rate, signals, muted, members)
    d = float(np.max(np.abs(dry - ref)))
    check(f"{what}: dry is the bounce with both returns muted, to 1e-12", d < 1e-12, d)
    check(f"{what}: the report says dry, no returns in it", rd.get("dry") is True and rd["returns"] == [], (rd.get("dry"), rd["returns"]))
    check(f"{what}: the wet one keeps the room and the delay, its report not dry", rw.get("dry") is False and set(rw["returns"]) == {"room", "delay"}, (rw.get("dry"), rw["returns"]))
    check(f"{what}: dry and wet differ (something was sent)", float(np.max(np.abs(wet - dry))) > 1e-4, float(np.max(np.abs(wet - dry))))
plain = json.loads(json.dumps(mix))
for s in plain["strips"].values():
    s.pop("reverb", None); s.pop("delay", None)
w2, _ = dm.bounce(rate, signals, plain, ["guitar"])
d2, _ = dm.bounce(rate, signals, plain, ["guitar"], dry=True)
check("nothing sent: dry and wet are one", float(np.max(np.abs(w2 - d2))) == 0.0, float(np.max(np.abs(w2 - d2))))

# ---- the job takes «dry» from its spec
with tempfile.TemporaryDirectory() as td:
    d = Path(td)
    src = np.stack([tone(220, 0.2)[0] * 3, tone(220, 0.2)[1] * 3])
    sf.write(str(d / "audio.wav"), src.T.astype(np.float32), rate, subtype="FLOAT")
    (d / "derived" / "stems-x").mkdir(parents=True)
    for n in ("drums", "bass", "other"):
        sf.write(str(d / "derived" / "stems-x" / f"{n}.wav"), tone(220, 0.2).T.astype(np.float32), rate, subtype="FLOAT")
    json.dump({"kind": "stems", "source": "the take", "files": [{"name": n, "file": f"{n}.wav"} for n in ("drums", "bass", "other")]},
              open(d / "derived" / "stems-x" / "manifest.json", "w"))
    value = {"schema": dm.SCHEMA, "strips": {"drums": {"gain_db": -3, "reverb": 0.4}}, "reverb": {"preset": "room", "return_db": 0}}
    got = {}
    for flag in (False, True):
        out = d / "derived" / f"bounce-{int(flag)}.part"
        spec = d / f"spec{int(flag)}.json"
        json.dump({"set": "derived/stems-x", "mix": value, "versions": {}, "bounce": {"members": ["drums"], "title": "D", "track": "bounce_1", "dry": flag}}, open(spec, "w"))
        r = subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "daw_job.py"), str(d), str(spec), str(out)], capture_output=True, text=True, timeout=300)
        check(f"the job ran ({'dry' if flag else 'wet'})", r.returncode == 0, r.stderr[-400:])
        if r.returncode == 0:
            j = json.loads(r.stdout.strip().splitlines()[-1])
            got[flag] = (j["report"], sf.read(str(out / j["files"][0]["file"]))[0])
    if len(got) == 2:
        check("…the dry job's report says dry, the wet one's not", got[True][0].get("dry") is True and got[False][0].get("dry") is False, (got[True][0].get("dry"), got[False][0].get("dry")))
        n = min(len(got[True][1]), len(got[False][1]))
        check("…the two files differ: the room is in the wet one only", float(np.max(np.abs(got[False][1][:n] - got[True][1][:n]))) > 1e-3,
              float(np.max(np.abs(got[False][1][:n] - got[True][1][:n]))))

print("test_daw_bounce_dry_2366: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
