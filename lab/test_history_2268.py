"""HERESY 2268: the plan's history: a save, a cut, the cuts' strictness, a picture picked a step each, named; Undo and Redo across a reload (the
plan read again from the disk); a new edit drops what was undone; what the machines made since stays; a step of before 2268 still undone.
python3 lab/test_history_2268.py"""
import json, shutil, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


w = Path(tempfile.mkdtemp())
kit = w / "kit"
(kit / "user/videos").mkdir(parents=True)
name = "h"
shot = lambda a, b, sec="verse": {"t0": a, "t1": b, "words": "w", "section": sec, "sung": True, "scene": {k: "" for k in V.SCENE_KEYS}}   # noqa: E731
json.dump({"name": name, "title": "t", "seconds": 12, "look": {k: "" for k in V.LOOK_KEYS}, "shots": [shot(0, 4), shot(4, 8), shot(8, 12, "chorus")]},
          open(kit / "user/videos/h.json", "w"))
times = lambda p: [(s["t0"], s["t1"]) for s in p["shots"]]   # noqa: E731

p = V.save(kit, name, {"scenes": [{"shot": "a wide field"}, None, None], "look": {"palette": "amber"}})
check("a save that changes something: a step named «edit»", [s["what"] for s in p.get("undo", [])] == ["edit"], p.get("undo"))
p = V.save(kit, name, {"scenes": [{"shot": "a wide field"}, None, None], "look": {"palette": "amber"}})
check("  a save that changes nothing: no step", len(p.get("undo", [])) == 1, len(p.get("undo", [])))
p = V.recut(kit, name, [[0, 2], [2, 4], [4, 8], [8, 12]], [0, 0, 1, 2])
check("a cut on the timeline: a step named «split»", [s["what"] for s in p["undo"]] == ["edit", "split"], [s["what"] for s in p["undo"]])
p = V.get(kit, name)                                      # the page reloaded: the plan read again from the disk
p = V.history(kit, name)
check("Undo after a reload: the split taken back, said («undone: split»), one step to redo",
      times(p) == [(0, 4), (4, 8), (8, 12)] and p["step"] == {"undone": "split"} and [s["what"] for s in p["redo"]] == ["split"], (times(p), p.get("step")))
p = V.history(kit, name)
check("  Undo again: the scene and the palette back as before the save",
      p["shots"][0]["scene"]["shot"] == "" and p["look"]["palette"] == "" and p["step"] == {"undone": "edit"} and not p.get("undo"), (p["shots"][0]["scene"], p["look"]))
p = V.history(kit, name, redo=True)
check("Redo: the save again", p["shots"][0]["scene"]["shot"] == "a wide field" and p["look"]["palette"] == "amber" and p["step"] == {"redone": "edit"}, p.get("step"))
# a video arrives from MiniMax for shot 2 while one step stays to redo; an Undo of the save never takes it back
q = V.get(kit, name)
q["shots"][1].update(video="20261109-120000-001.mp4", video_from={"mode": "i2v"})
q.pop("exists", None)
V._write(kit, name, q)
p = V.history(kit, name)
check("what the machines made since stays: the shot's video kept through an Undo of the save", p["shots"][1].get("video") == "20261109-120000-001.mp4"
      and p["shots"][0]["scene"]["shot"] == "", p["shots"][1])
p = V.history(kit, name, redo=True)
check("  and through its Redo", p["shots"][1].get("video") == "20261109-120000-001.mp4" and p["shots"][0]["scene"]["shot"] == "a wide field", p["shots"][1])
p = V.history(kit, name, redo=True)
check("  Redo again: the split back", times(p) == [(0, 2), (2, 4), (4, 8), (8, 12)] and not p.get("redo"), times(p))
# a picture picked for shot 0 (a step), one the Artist drew for shot 3 (none)
from PIL import Image
pic = w / "p.png"
Image.new("RGB", (64, 36), (200, 100, 50)).save(pic)
p = V.frame_set(kit, name, 0, str(pic), {"run": "r", "file": "f"})
check("a picture he picked: a step «picture:0»", p["undo"][-1]["what"] == "picture:0", p["undo"][-1]["what"])
p = V.frame_set(kit, name, 3, str(pic), {"run": "r", "file": "f", "by": "frames"})
check("  one the Artist drew for the shots: no step", p["undo"][-1]["what"] == "picture:0" and p["shots"][3].get("frame"), p["undo"][-1]["what"])
f0 = p["shots"][0]["frame"]
p = V.history(kit, name)
check("Undo the pick: shot 1's picture off (kept in off/), the Artist's picture of shot 4 stays",
      not p["shots"][0].get("frame") and (V.frames_dir(kit, name) / "off" / f0).is_file() and p["shots"][3].get("frame"), (p["shots"][0], p["shots"][3].get("frame")))
p = V.history(kit, name, redo=True)
check("  Redo: the picture back from off/", p["shots"][0].get("frame") == f0 and (V.frames_dir(kit, name) / f0).is_file(), p["shots"][0])
p = V.history(kit, name)
p = V.save(kit, name, {"scenes": [{"shot": "a new idea"}, None, None, None]})
check("a new edit after an Undo drops the steps undone", not p.get("redo") and p["undo"][-1]["what"] == "edit", p.get("redo"))
# a step written before 2268: the shots alone
q = V.get(kit, name)
q["undo"].append([shot(0, 6), shot(6, 12, "chorus")])
q.pop("exists", None)
V._write(kit, name, q)
p = V.history(kit, name)
check("a step of before 2268 (the shots alone) still undone, named «timeline»; the scenes as they are",
      times(p) == [(0, 6), (6, 12)] and p["step"] == {"undone": "timeline"} and p["look"]["palette"] == "amber", (times(p), p.get("step")))
try:
    for _ in range(40):
        V.history(kit, name)
    check("Undo past the first step refused", False)
except ValueError as e:
    check("Undo past the first step refused: «nothing to undo»", str(e) == "nothing to undo", e)
shutil.rmtree(w, ignore_errors=True)
print("test_history_2268  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
