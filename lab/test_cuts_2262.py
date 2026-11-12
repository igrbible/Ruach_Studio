"""HERESY 2262: the cuts' strictness: off, sections (each change of section where the take's music itself changes, on its bar or beat, else on
the bar), beats (the sections so, then every other cut on its beat); the rhythm heard once and kept for the ruler; the strictness read back from the
shots after an undo; a failure to hear the changes said, never taken for none. python3 lab/test_cuts_2262.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def sh(*t, secs=None):
    return [{"t0": a, "t1": b, "section": (secs[i] if secs else "verse")} for i, (a, b) in enumerate(zip(t, t[1:]))]


bars = [2.0 * k for k in range(11)]                    # a bar every 2 s (120 bpm in 4/4)
beats = [0.5 * k for k in range(41)]
# a change heard 0.9 s before the cut as sung (where the drums come in), its bar 0.1 s from it: the cut on that bar
s = sh(0, 5.0, 9.4, 14, secs=["intro", "verse", "chorus"])
said = {}
n, mv, at = V.snap_sections(s, bars, changes=[{"t": 4.1, "strength": 0.6}, {"t": 9.2, "strength": 0.3}, {"t": 9.85, "strength": 0.9}], beats=beats, said=said)
check("a change heard within 1.5 s goes first, set on its bar: 5.0 → 4.0 (the change at 4.1); the strongest of two: 9.4 → 10.0 (9.85 → its bar)",
      [x["t1"] for x in s] == [4.0, 10.0, 14] and said == {"by_change": 2} and n == 2 and mv == 2, ([x["t1"] for x in s], said, n, mv))
check("  the times as sung kept beside them", s[0]["as_sung"] == [0, 5.0] and s[1]["as_sung"] == [5.0, 9.4] and s[2]["as_sung"] == [9.4, 14], s)
s = sh(0, 5.0, 12, secs=["verse", "chorus"])
V.snap_sections(s, [0.0, 8.0], changes=[{"t": 4.7, "strength": 1}], beats=[3.0, 4.75, 6.0])
check("no bar near the change: on the beat within 0.3 s of it (4.7 → 4.75)", s[0]["t1"] == 4.75, s)
s = sh(0, 5.0, 12, secs=["verse", "chorus"])
V.snap_sections(s, [0.0, 8.0], changes=[{"t": 4.6, "strength": 1}], beats=[])
check("neither a bar nor a beat near it: on the change itself (4.6)", s[0]["t1"] == 4.6, s)
s = sh(0, 5.1, 12, secs=["verse", "chorus"])
said = {}
V.snap_sections(s, bars, changes=[{"t": 7.0, "strength": 1}], beats=beats, said=said)
check("a change 1.9 s off is not the section's: the bar as in 2247 (5.1 → 6.0)", s[0]["t1"] == 6.0 and said["by_change"] == 0, (s, said))
s = sh(0, 2.0, 12, secs=["verse", "chorus"])
V.snap_sections(s, [], changes=[{"t": 1.0, "strength": 1}], beats=[])
check("a change that would leave a shot under 1.5 s: not taken, the cut stays", s[0]["t1"] == 2.0 and "as_sung" not in s[0], s)
s = sh(0, 5.0, 9.0, 12, secs=["verse", "verse", "chorus"])
n, mv, at = V.snap_sections(s, bars, changes=[{"t": 5.0, "strength": 1}], beats=beats)
check("a change inside a section moves nothing there: only cuts where the section changes", s[0]["t1"] == 5.0 and n == 1, (s, n))

# ---- on_beat at each strictness, on a click every 0.5 s (the DAW's grid at 120 bpm 4/4)
w = Path(tempfile.mkdtemp())
audio = w / "click.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=1000:r=22050:d=0.03,apad=whole_dur=0.5", "-af", "aloop=loop=39:size=11025",
                "-t", "20", str(audio)], check=True)
kit = w / "kit"
(kit / "user/videos").mkdir(parents=True)
plan0 = {"title": "t", "seconds": 20, "shots": sh(0, 3.1, 6.3, 9.62, 13.3, 20, secs=["verse", "verse", "chorus", "chorus", "outro"])}
json.dump(plan0, open(kit / "user/videos/b.json", "w"))
heard = []
real = V.beat_times
V.beat_times = lambda a, strength=False: heard.append(1) or real(a, strength)
r = V.on_beat(kit, "b", audio, meter=(120, 4, 4), how="sections", changes=[{"t": 5.9, "strength": 0.8}])
p = V.get(kit, "b")
t1 = [x["t1"] for x in p["shots"]]
check(f"sections: the changes alone: 6.3 → 6.0 (the change at 5.9, its bar), 13.3 → 14.0 (the bar), the cuts inside sections as sung ({t1})",
      abs(t1[1] - 6.0) < 0.06 and abs(t1[3] - 14.0) < 0.06 and t1[0] == 3.1 and t1[2] == 9.62 and r["by_change"] == 1 and r["on_bar"] == 1
      and r["moved"] == 0 and r["how"] == "sections" and p["beats"]["how"] == "sections", (t1, r))
check("  the rhythm kept with the plan for the ruler: the beats, the DAW's bars, the changes heard",
      len(p["rhythm"]["beats"]) >= 30 and p["rhythm"]["grid"] == "daw" and abs(p["rhythm"]["bars"][3] - 6.0) < 1e-6 and p["rhythm"]["changes"] == [5.9], p.get("rhythm"))
check("  the strictness read from the shots: sections", V._level(p["shots"]) == "sections")
r = V.on_beat(kit, "b", audio, meter=(120, 4, 4), how="beats", changes=[{"t": 5.9, "strength": 0.8}])
p = V.get(kit, "b")
t1 = [x["t1"] for x in p["shots"]]
check(f"beats: the sections so, then the cuts inside sections on their beats (3.1 → 3.0, 9.62 → 9.5) ({t1})",
      abs(t1[0] - 3.0) < 0.06 and abs(t1[1] - 6.0) < 0.06 and abs(t1[2] - 9.5) < 0.06 and abs(t1[3] - 14.0) < 0.06 and r["moved"] == 2 and p["beats"]["how"] == "beats", (t1, r))
check("  each from the times as sung: the as_sung of the first pass kept, not the moved times", p["shots"][1]["as_sung"] == [3.1, 6.3], p["shots"][1])
check("  the take heard once: the second strictness took the kept beats", len(heard) == 1, len(heard))
check("  the strictness read from the shots: beats", V._level(p["shots"]) == "beats")
q = V.recut_undo(kit, "b")
check("Ctrl+Z on the timeline back to the sections: the plan's strictness said so", q["beats"]["how"] == "sections" and V._level(q["shots"]) == "sections", q.get("beats"))
q = V.recut_undo(kit, "b")
check("  and back to as sung: no strictness left", "beats" not in q and [x["t1"] for x in q["shots"]] == [3.1, 6.3, 9.62, 13.3, 20], (q.get("beats"), [x["t1"] for x in q["shots"]]))
V.on_beat(kit, "b", audio, meter=(120, 4, 4), how="beats", changes=[])
r = V.on_beat(kit, "b", audio, how="off")
p = V.get(kit, "b")
check("off: every cut back where it was sung, the rhythm still on the ruler", [x["t1"] for x in p["shots"]] == [3.1, 6.3, 9.62, 13.3, 20] and "beats" not in p
      and p.get("rhythm", {}).get("beats") and r["how"] == "off" and r["undone"] >= 2, (r, [x["t1"] for x in p["shots"]]))
r = V.on_beat(kit, "b", audio, meter=(120, 4, 4), how="sections", changes=None, changes_error="no audio.wav")
check("changes not heard: said with the answer, never «none heard» (changes None); the bars as in 2247",
      r["changes"] is None and r["changes_error"] == "no audio.wav" and r["by_change"] == 0 and r["on_bar"] == 2, r)
try:
    V.on_beat(kit, "b", audio, how="bars")
    check("an unknown strictness refused", False)
except ValueError:
    check("an unknown strictness refused", True)
V.beat_times = real
shutil.rmtree(w, ignore_errors=True)
print("test_cuts_2262  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
