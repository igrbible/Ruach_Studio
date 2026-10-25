"""HERESY 1762: the returns as a mixer sets them. The room's own pre-delay moves its return later by whole samples, the rest of it the same;
a low cut and a high cut on each return take the low and the high off it and leave the middle; the delay's cuts are on its return, after its
loop (each echo as the loop makes it, the cut over all of them alike); unsaid, or at 20 Hz and 20 kHz, as before to the sample; refused out of
range, and a pre-delay on the delay (its time is that). python3 lab/test_daw_returns.py"""
import math
import sys
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
t = np.arange(rate * 3) / rate
V = lambda strips=None, **kw: dict({"schema": dm.SCHEMA, "strips": strips or {}}, **kw)   # noqa: E731
tail = round(dm.TAIL_FADE_SECONDS * rate)


def returns(x, bus, said):
    sig = [("lead_vocal", np.stack([x, x])), ("rest", np.zeros((2, len(x))))]
    _y, _r, printed = dm.render(rate, sig, V({"lead_vocal": {bus: 1.0, "gain_db": -12}}, **{bus: said}), keep=True)
    return printed["return-" + ("room" if bus == "reverb" else "delay")]


def level(w, a=1.5, b=2.5):
    return 10 * math.log10(np.mean(w[0, int(a * rate):int(b * rate)] ** 2))


burst = np.where(t < 0.2, np.sin(2 * np.pi * 440 * t), 0.0)
r0 = returns(burst, "reverb", {"preset": "room"})
r1 = returns(burst, "reverb", {"preset": "room", "predelay_ms": 0, "lowcut_hz": 20, "highcut_hz": 20000})
d0 = returns(burst, "delay", {"time_ms": 250})
d1 = returns(burst, "delay", {"time_ms": 250, "lowcut_hz": 20, "highcut_hz": 20000})
check("unsaid, or at 0 ms, 20 Hz and 20 kHz: the room and the delay as before, to the sample", np.array_equal(r0, r1) and np.array_equal(d0, d1))

k = round(30 * rate / 1000)
rp = returns(burst, "reverb", {"preset": "room", "predelay_ms": 30})
onset = lambda w: int(np.argmax(np.abs(w[0]) > 1e-9))   # noqa: E731
e = np.max(np.abs(rp[:, k:-tail] - r0[:, : -tail - k]))
check("the room's pre-delay, 30 ms: its return 1440 samples later, the rest of it the same", onset(rp) - onset(r0) == k and e < 1e-9 * np.max(np.abs(r0)), (onset(rp) - onset(r0), e))

for bus, said in (("reverb", {"preset": "room"}), ("delay", {"time_ms": 250, "feedback": 0.35, "lowpass_hz": 20000})):
    lo, mid, hi = (returns(np.sin(2 * np.pi * f * t), bus, said) for f in (60, 1000, 9000))
    lo2, mid2, hi2 = (returns(np.sin(2 * np.pi * f * t), bus, dict(said, lowcut_hz=300, highcut_hz=3000)) for f in (60, 1000, 9000))
    dl, dm_, dh = level(lo2) - level(lo), level(mid2) - level(mid), level(hi2) - level(hi)
    check(f"the {'room' if bus == 'reverb' else 'delay'}'s cuts at 300 Hz and 3 kHz: 60 Hz down over 20 dB, 9 kHz down over 15, 1 kHz within 1 dB",
          dl < -20 and dh < -15 and abs(dm_) < 1, (round(dl, 2), round(dm_, 2), round(dh, 2)))

said = {"time_ms": 250, "feedback": 0.5, "lowpass_hz": 4000, "lowcut_hz": 400, "highcut_hz": 2500}
dc = returns(burst, "delay", said)
raw = returns(burst, "delay", dict(said, lowcut_hz=None, highcut_hz=None))
bands = {"on": True, "bands": [{"id": "lowcut", "enabled": True, "type": "highpass", "frequency_hz": 400, "gain_db": 0.0, "q": 1 / math.sqrt(2)},
                               {"id": "highcut", "enabled": True, "type": "lowpass", "frequency_hz": 2500, "gain_db": 0.0, "q": 1 / math.sqrt(2)}]}
want = dm.peq.apply(raw, rate, dm.eq_settings(bands))
e = np.max(np.abs(dc[:, :-tail] - want[:, :-tail]))
check("the delay's cuts on its return, after the loop: its echoes as before, then the two cuts over them all", e < 1e-12, e)

x = np.sin(2 * np.pi * 12000 * t)
r441 = dm.render(44100, [("lead_vocal", np.stack([x, x])[:, :44100]), ("rest", np.zeros((2, 44100)))],
                 V({"lead_vocal": {"reverb": 1.0}}, reverb={"preset": "room", "highcut_hz": 19990}))
check("a high cut over 0.45 of the rate (19 990 Hz at 44.1 kHz) cuts at 19 845, not refused", r441[0].shape == (2, 44100))

for wrong, why in ((("reverb", {"preset": "room", "predelay_ms": 300}), "a pre-delay over 250 ms"), (("reverb", {"preset": "room", "lowcut_hz": 10}), "a low cut under 20 Hz"),
                   (("reverb", {"preset": "room", "lowcut_hz": 3000}), "a low cut over 2 kHz"), (("delay", {"highcut_hz": 500}), "a high cut under 1 kHz"),
                   (("delay", {"highcut_hz": 30000}), "a high cut over 20 kHz"), (("delay", {"predelay_ms": 20}), "a pre-delay on the delay")):
    try:
        returns(burst, wrong[0], wrong[1])
        check("refused: " + why, False, "rendered")
    except PlenioUserError:
        check("refused: " + why, True)
print("test_daw_returns:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
