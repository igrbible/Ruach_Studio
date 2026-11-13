"""HERESY 2407 (Viktor 11.11.2026, A6: «Принимаю совет. Делай так»): a dry bounce copies its lanes' sends onto the new lane instead of losing their room
and delay. The report carries the new lane's send levels (the least-squares fit of what the members sent to the stretch): one lane's own levels exactly,
so the mix with it bounced dry, its lane muted and the levels on the new lane is the mix as it was to 1e-9; lanes that send differently get levels
between theirs and a mix nearer the original than the dry bounce without sends; a wet bounce and a muted return carry none.
python3 lab/test_daw_bounce_sends_2407.py"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


rate, secs = 48000, 3
rng = np.random.default_rng(2407)
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
       "groups": [{"id": "v1", "name": "Tops", "members": ["guitar", "lead_vocal"], "gain_db": -2}],
       "master": {"limit": {"on": True, "ceiling_db": -1}, "fade_out_s": 1.0}}


def landed(value, members, y, sends):
    """the page's bounceLand: the members muted, the new lane at 0 dB with the report's sends"""
    v = json.loads(json.dumps(value))
    for n in members:
        v["strips"].setdefault(n, {})["mute"] = True
    v["strips"]["bounce_1"] = dict(sends)
    return v, signals[:-1] + [("bounce_1", y)] + signals[-1:]


before, _, _ = dm.render(rate, signals, mix)
y, rep = dm.bounce(rate, signals, mix, ["guitar"], dry=True)
s = rep.get("sends") or {}
check("one lane: its own send levels in the report (room 0.2, delay 0.1)", abs(s.get("reverb", -1) - 0.2) < 1e-4 and abs(s.get("delay", -1) - 0.1) < 1e-4, s)
v2, sig2 = landed(mix, ["guitar"], y, s)
d = float(np.max(np.abs(dm.render(rate, sig2, v2)[0] - before)))
check("  the mix with it bounced dry and the sends on the new lane is the mix as it was, to 1e-9", d < 1e-9, d)
v0, sig0 = landed(mix, ["guitar"], y, {})
d0 = float(np.max(np.abs(dm.render(rate, sig0, v0)[0] - before)))
check("  (without the sends it would lose them: the difference > 1e-3)", d0 > 1e-3, d0)

for members, what, lo in ((["guitar", "lead_vocal"], "the VCA «Tops» (room 0.2 and 0.3, delay 0.1 and none)", {"reverb": (0.2, 0.3), "delay": (0.0, 0.1)}),
                          (["drums", "bass"], "the bus «Rhythm» (its sends taken before its −1 dB and compressor, so a level may pass the members')", {"reverb": (0.0, 1.0), "delay": (0.0, 1.0)})):
    y, rep = dm.bounce(rate, signals, mix, members, dry=True)
    s = rep.get("sends") or {}
    check(f"{what}: levels in their range", all(k in s and lo[k][0] - 1e-6 <= s[k] <= lo[k][1] + 1e-6 for k in lo), s)
    va, sa = landed(mix, members, y, s)
    vb, sb = landed(mix, members, y, {})
    da = float(np.sqrt(np.mean((dm.render(rate, sa, va)[0] - before) ** 2)))
    db = float(np.sqrt(np.mean((dm.render(rate, sb, vb)[0] - before) ** 2)))
    check(f"  the mix nearer the original with the sends than without (rms {da:.2e} < {db:.2e})", da < db, (da, db))

_, rw = dm.bounce(rate, signals, mix, ["guitar"])
check("a wet bounce carries no sends (its room and delay are in the file)", rw.get("sends") == {}, rw.get("sends"))
muted = json.loads(json.dumps(mix))
muted["reverb"]["mute"] = True
_, rm = dm.bounce(rate, signals, muted, ["guitar"], dry=True)
check("a muted room carries no room send, the delay's still", "reverb" not in rm["sends"] and abs(rm["sends"].get("delay", -1) - 0.1) < 1e-4, rm["sends"])

print(("FAILED " + str(len(bad))) if bad else "all ok")
sys.exit(1 if bad else 0)
