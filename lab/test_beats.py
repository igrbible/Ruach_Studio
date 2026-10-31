"""HERESY 1947: the cuts on the beats: snap_cuts (the nearest beat within the window, no shot too short, the times as sung kept), the beats heard
from a click track, on_beat and its undo, «Cut it again» finding a moved shot's scene by its times as sung. python3 lab/test_beats.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


sh = lambda *t: [{"t0": a, "t1": b} for a, b in zip(t, t[1:])]   # noqa: E731
s = sh(0, 4.1, 8.45, 11.5, 14)
m, mean = V.snap_cuts(s, [0, 4.0, 8.5, 11.0, 12.0])
check("4.1 → 4.0 and 8.45 → 8.5 moved; 11.5 (nearest beat 11.0, 0.5 s off) stays", [x["t1"] for x in s] == [4.0, 8.5, 11.5, 14], [x["t1"] for x in s])
check("the shots back to back still", all(abs(s[i]["t1"] - s[i + 1]["t0"]) < 1e-9 for i in range(len(s) - 1)))
check("the moved ones keep their times as sung", s[0]["as_sung"] == [0, 4.1] and s[1]["as_sung"] == [4.1, 8.45] and s[2]["as_sung"] == [8.45, 11.5] and "as_sung" not in s[3], s)
check("two moved, their mean shift 75 ms", m == 2 and abs(mean - 0.075) < 1e-9, (m, mean))
s = sh(0, 1.6, 6)
check("no shot under 1.5 s: a cut that would leave one is not moved", V.snap_cuts(s, [1.4])[0] == 0 and s[0]["t1"] == 1.6)
check("no beats: nothing moved", V.snap_cuts(sh(0, 3, 6), [])[0] == 0)

kit = Path(tempfile.mkdtemp())
audio = kit / "clicks.wav"
import math, struct, wave
with wave.open(str(audio), "wb") as w:                    # a click every 0.5 s for 20 s
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    w.writeframes(b"".join(struct.pack("<h", int(20000 * math.sin(2 * math.pi * 1000 * n / 22050)) if n % 11025 < 441 else 0) for n in range(22050 * 20)))
beats, tempo = V.beat_times(audio)
check("a click every 0.5 s heard at about 120 bpm", 110 <= tempo <= 130 and len(beats) >= 30, (tempo, len(beats)))
name = "20261030-180000-test"
(kit / "user" / "videos").mkdir(parents=True)
rows = [{"start": 0.0, "end": 4.13, "text": "a"}, {"start": 6.2, "end": 10.13, "text": "b"}, {"start": 12.2, "end": 16.62, "text": "c"}]
p0 = V.make(kit, name, {"title": "t", "seconds": 20}, {"lyrics": ""}, rows)
V.save(kit, name, {"scenes": [{"shot": f"s{i}"} for i in range(len(p0["shots"]))]})
was = [(x["t0"], x["t1"]) for x in V.get(kit, name)["shots"]]
r = V.on_beat(kit, name, audio)
p = V.get(kit, name)
moved = [x for x in p["shots"] if x.get("as_sung")]
check("on_beat: cuts moved onto the beats (each within 30 ms of a beat)", r["moved"] >= 2 and all(min(abs(x["t1"] - b) for b in beats) < 0.03 or min(abs(x["t0"] - b) for b in beats) < 0.03 for x in moved), (r, [(x["t0"], x["t1"]) for x in p["shots"]]))
check("the edit on the timeline's undo", len(p.get("undo") or []) == 1 and [(x["t0"], x["t1"]) for x in p["undo"][0]] == was, p.get("undo"))
check("the plan says its tempo and what moved", p.get("beats", {}).get("moved") == r["moved"], p.get("beats"))
cut = V.make(kit, name, {"title": "t", "seconds": 20}, {"lyrics": ""}, rows)
check("«Cut it again» finds every moved shot's scene by its times as sung", [(x.get("scene") or {}).get("shot") for x in cut["shots"]] == [f"s{i}" for i in range(len(was))], [(x.get("scene") or {}).get("shot") for x in cut["shots"]])
V.on_beat(kit, name, audio)
r2 = V.on_beat(kit, name, audio, undo=True)
p = V.get(kit, name)
check("undo: every cut back where it was sung", [(x["t0"], x["t1"]) for x in p["shots"]] == was and "beats" not in p and r2["undone"] >= 2, ([(x["t0"], x["t1"]) for x in p["shots"]], r2))
shutil.rmtree(kit, ignore_errors=True)
print("test_beats  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
