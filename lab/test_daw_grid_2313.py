"""HERESY 2313–2314: a take's bar grid (bargrid.py). The level that brings the heard pulse to the take's own tempo; the bar's phase from where the
music changes and the downbeats sound; the score's bars, chords and keys laid on the heard beats (a bar of 3/4 among 4/4 kept); what the hand
sets kept and derived again without hearing; a click track with accented downbeats heard end to end (librosa); the lab's GET and POST.
python3 lab/test_daw_grid_2313.py"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bargrid  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def score(bars, chords=None, meter="4/4", bpm=120, key="Am"):
    """A native two-voice score of `bars` bars (each a rest), chords as {bar: symbol} on the bar's first beat, a 3/4 bar where bars says '3'."""
    lines = ["X:1", "T:", f"M:{meter}", "L:1/16", f"Q:1/4={bpm}", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"', 'V: Ins clef=treble name="Ins Melody" snm="Inst."',
             f"K:{key}"]
    for i, b in enumerate(bars):
        m = "3/4" if b == "3" else meter
        ch = (chords or {}).get(i)
        head = f'"{ch}"' if ch else ""
        lines += ["V: Vocal", f"M:{m}", head + ("z12" if b == "3" else "z16") + "|", "V: Ins", f"M:{m}", ("z12" if b == "3" else "z16") + "|"]
    return "\n".join(lines) + "\n"


# ---- the level
reg = [round(0.1 + 0.25 * k, 3) for k in range(200)]          # a pulse at 240 a minute
check("a pulse twice the prior's is halved", bargrid.level_auto(reg, 120) == 0.5, bargrid.level_auto(reg, 120))
check("a pulse at the prior is kept", bargrid.level_auto(reg, 240) == 1.0)
check("a pulse half the prior's is doubled", bargrid.level_auto(reg, 480) == 2.0)
check("no prior: as heard", bargrid.level_auto(reg, None) == 1.0)
st = [1.0 if k % 2 else 0.2 for k in range(200)]
b2, s2 = bargrid.at_level(reg, st, 0.5)
check("halved on the run that sounds strongest", b2[0] == reg[1] and len(b2) == 100, b2[:3])
b3, _ = bargrid.at_level(reg[:5], [1] * 5, 2.0)
check("doubled: a beat between each two", len(b3) == 9 and abs(b3[1] - 0.225) < 1e-9, b3)

# ---- the phase: beats every 0.5 s from 0.1 s, the music changing on every 4th from the second (2.1, 4.1, …), those beats sounding strongest
heard = {"beats": [round(0.1 + 0.5 * k, 3) for k in range(120)], "strength": [3.0 if k % 4 == 1 else 1.0 for k in range(120)], "seconds": 60.0}
changes = [{"t": round(0.6 + 2.0 * k, 2), "strength": 0.8} for k in range(1, 20, 3)]
g = bargrid.derive(heard, (120.0, 4, 4, "style"), {}, "", changes, 60.0)
check("the bar's phase where the music changes and the downbeat sounds", abs(g["bars"][0] - 0.6) < 1e-6, (g["phase"], g["bars"][:3]))
check("its bars four beats apart, numbered from 1", abs(g["bars"][1] - 2.6) < 1e-6 and g["bar_numbers"][:3] == [1, 2, 3], (g["bars"][:3], g["bar_numbers"][:3]))
check("the tempo heard said", g["bpm"] == 120.0 and "120 bpm heard" in g["said"], g["said"])
check("sure of it", g["phase_sure"] is True, g["phases"])
g0 = bargrid.derive(heard, (120.0, 4, 4, "style"), {}, "", [], 60.0)
check("no changes heard: the downbeats' strength decides", abs(g0["bars"][0] - 0.6) < 1e-6, (g0["bars"][:2], g0["phases"]))
gs = bargrid.derive(heard, (120.0, 4, 4, "style"), {"downbeat": 1.1}, "", changes, 60.0)
check("the hand's «a bar begins here» wins", abs(gs["bars"][0] - 1.1) < 1e-6 and abs(gs["bars"][1] - 3.1) < 1e-6 and gs["phase_how"] == "set by hand", (gs["phase"], gs["bars"][:2]))
g3 = bargrid.derive(heard, (120.0, 4, 4, "style"), {"num": 3}, "", [], 60.0)
check("three beats a bar by hand", g3["num"] == 3 and abs((g3["bars"][1] - g3["bars"][0]) - 1.5) < 1e-6, g3["bars"][:3])
gf = bargrid.derive(heard, (120.0, 4, 4, "style"), {"factor": 2}, "", [], 60.0)
check("twice the tempo by hand: twice the beats", gf["level"] == 2.0 and gf["bpm"] == 240.0, (gf["level"], gf["bpm"]))
gn = bargrid.derive({"beats": [0.5, 1.0], "strength": [1, 1], "seconds": 3}, (120.0, 4, 4, "style"), {}, "", [], 3.0)
check("too few beats: no grid, said", gn["how"] == "none" and gn["bars"] == [] and "too few" in gn["said"], gn["said"])

# ---- the score's bars, chords and keys on the heard beats (beats drifting 2 % slow: the score's grid would drift, these do not)
drift = [round(0.0 + 0.51 * k, 4) for k in range(80)]
hs = {"beats": drift, "strength": [2.0 if k % 4 == 0 else 1.0 for k in range(80)], "seconds": 40.0}
abc = score(["4", "4", "3", "4", "4"], chords={0: "Am", 1: "F", 2: "C", 3: "G", 4: "G"})
gsc = bargrid.derive(hs, (120.0, 4, 4, "score"), {}, abc, [], 40.0)
want = [0.0, 4 * 0.51, 8 * 0.51, 11 * 0.51, 15 * 0.51]
check("the score's bars on the heard beats, its 3/4 bar kept", all(abs(a - b) < 2e-3 for a, b in zip(gsc["bars"], want)) and gsc["bar_numbers"][:5] == [1, 2, 3, 4, 5],
      (gsc["bars"][:6], want))
check("past the score's end, on in bars of its last length", abs(gsc["bars"][5] - 19 * 0.51) < 2e-3 and gsc["bar_numbers"][5] == 6, gsc["bars"][5:7])
ch = gsc["chords"]
check("its chords on those bars, a chord held over two bars one span", [c[2] for c in ch] == ["Am", "F", "C", "G"] and abs(ch[3][0] - 11 * 0.51) < 2e-3 and abs(ch[3][1] - 19 * 0.51) < 2e-3,
      ch)
check("its key", gsc["keys"] == [[0.0, "Am"]], gsc["keys"])
check("the score's own meter over the style's", gsc["num"] == 4 and gsc["score"] is True)
broken = bargrid.derive(hs, (120.0, 4, 4, "score"), {}, "X:1\nT:\nnot a score", [], 40.0)
check("a score that cannot be read: said, the grid as heard", broken["chords"] == [] and "could not be read" in broken["said"] and broken["bars"], broken["said"])

# ---- end to end: a click track at 100 bpm, its downbeats accented, the first at 0.3 s; kept, set by hand, derived again without hearing
rate, bpm = 22050, 100.0
y = np.zeros(int(rate * 30))
for k in range(int(30 * bpm / 60)):
    t = 0.3 + k * 60 / bpm
    i = int(t * rate)
    if i + 400 >= len(y):
        break
    amp = 1.0 if k % 4 == 0 else 0.35
    y[i:i + 400] += amp * np.sin(2 * np.pi * 1500 * np.arange(400) / rate) * np.exp(-np.arange(400) / 80)
with tempfile.TemporaryDirectory() as td:
    d = Path(td)
    sf.write(str(d / "audio.wav"), y.astype(np.float32), rate)
    req = {"style": "a click, 100 bpm", "abc": ""}
    g = bargrid.grid(d, d / "audio.wav", req, changes=[])
    ibi = np.median(np.diff(g["beats"]))
    check("the click heard at 100 bpm", abs(g["bpm"] - 100) < 1.5, g["bpm"])
    check("its beats on the clicks (within 25 ms)", min(abs(np.array(g["beats"]) - 0.3)) < 0.025 and abs(ibi - 0.6) < 0.01, (g["beats"][:4], ibi))
    check("its bar where the accent is", any(abs(b - 0.3) < 0.03 for b in g["bars"][:2]) and all(min(abs(b - (0.3 + 2.4 * k)) for k in range(13)) < 0.03 for b in g["bars"][:6]),
          g["bars"][:6])
    check("kept beside the take", (d / "bargrid.json").is_file() and json.loads((d / "bargrid.json").read_text())["heard"]["beats"])
    real_hear, bargrid.hear = bargrid.hear, lambda *a, **k: (_ for _ in ()).throw(AssertionError("heard again"))
    try:
        g2 = bargrid.settle(d, d / "audio.wav", req, {"factor": 2}, changes=[])
        check("twice the tempo by hand, nothing heard again", abs(g2["bpm"] - 200) < 3 and g2["settings"].get("factor") == 2.0, (g2["bpm"], g2["settings"]))
        g3 = bargrid.grid(d, d / "audio.wav", req, changes=[])
        check("what the hand set kept for the next ask", g3["settings"].get("factor") == 2.0)
        g4 = bargrid.settle(d, d / "audio.wav", req, {"reset": True}, changes=[])
        check("as heard again", g4["settings"] == {} and abs(g4["bpm"] - 100) < 1.5, g4["settings"])
        for wrong in ({"num": 11}, {"factor": 16}, {"downbeat": "x"}):
            try:
                bargrid.settle(d, d / "audio.wav", req, wrong, changes=[])
                check(f"refused: {wrong}", False, "accepted")
            except ValueError:
                check(f"refused: {wrong}", True)
    finally:
        bargrid.hear = real_hear

# ---- the take's own tempo and meter
check("the score's Q: is the prior", bargrid.prior_of({"abc": score(["4"], bpm=88)})[0] == 88.0 and bargrid.prior_of({"abc": score(["4"], bpm=88)})[3] == "score")
check("else the style's bpm", bargrid.prior_of({"style": "synth-pop, 114 bpm"})[:1] == (114.0,) and bargrid.prior_of({"style": "synth-pop, 114 bpm"})[3] == "style")
check("else none said (the 120 a placeholder)", bargrid.prior_of({"style": "ballad"})[3] == "")

print("test_daw_grid_2313: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
