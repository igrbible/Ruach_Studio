"""HERESY 1946: the Videographer's editor's project: the timeline (a video for its length, its picture after it, a gap where a shot has neither), the
EDL's events and timecodes, the SRT, the zip's files; OpenTimelineIO reads the .otio when it is installed (OTIO_PY=path to a python with it).
python3 lab/test_edit_bundle.py"""
import json, os, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


kit = Path(tempfile.mkdtemp())
name = "20261030-170000-test"
d = kit / "user" / "videos"; d.mkdir(parents=True)
fdir, sdir = d / (name + ".frames"), d / (name + ".shots"); fdir.mkdir(); sdir.mkdir()
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:d=2", "-r", "25", str(sdir / "20261030-170001-000-000.mp4")], check=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1", "-frames:v", "1", str(fdir / "20261030-170002-000-001.jpg")], check=True)
audio = kit / "audio.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=440:d=12", str(audio)], check=True)
plan = {"title": "T", "seconds": 12, "shots": [
    {"t0": 0, "t1": 4, "words": "one", "section": "verse", "sung": True, "scene": {}, "video": "20261030-170001-000-000.mp4", "frame": "20261030-170002-000-001.jpg"},
    {"t0": 4, "t1": 8, "words": "two", "section": "verse", "sung": True, "scene": {}, "frame": "20261030-170002-000-001.jpg"},
    {"t0": 8, "t1": 12, "words": "", "section": "outro", "sung": False, "scene": {}}]}
json.dump(plan, open(d / (name + ".json"), "w"))
rows = [{"start": 0.5, "end": 3.5, "text": "Строка одна"}, {"start": 4.2, "end": 7.9, "text": "two"}]
tl = V.edit_timeline(kit, name, audio, "Ночная гостья", rows)
v1 = tl["otio"]["tracks"]["children"][0]["children"]
kinds = [(x["OTIO_SCHEMA"].split(".")[0], int(x["source_range"]["duration"]["value"])) for x in v1]
check("V1: the video 2 s (50), its picture to the shot's end (50), the second shot's picture (100), the third a gap (100)",
      kinds == [("Clip", 50), ("Clip", 50), ("Clip", 100), ("Gap", 100)], kinds)
check("the media: the video, the pictures under their shots' numbers, the take's sound",
      sorted(tl["media"]) == ["media/shot-001.jpg", "media/shot-001.mp4", "media/shot-002.jpg", "media/Ночная_гостья.wav"], sorted(tl["media"]))
edl = tl["edl"].splitlines()
ev = [l for l in edl if l[:3].isdigit()]
check("EDL: three picture events and the sound, record timecodes end to end",
      len(ev) == 4 and ev[0].split()[1] == "SHOT001" and ev[1].split()[1] == "STILL001" and ev[2].split()[-1] == "00:00:08:00" and ev[3].split()[1] == "AUDIO", ev)
check("EDL: each event's clip named below it", "* FROM CLIP NAME: shot-001.mp4" in edl and "* FROM CLIP NAME: shot-002.jpg" in edl)
check("SRT: two lines in their own time, the Cyrillic kept", tl["srt"].startswith("1\n00:00:00,500 --> 00:00:03,500\nСтрока одна"), tl["srt"][:60])
info = V.edit_bundle(kit, name, audio, "Ночная гостья", rows)
z = zipfile.ZipFile(V.edit_path(kit, name))
names = sorted(z.namelist())
check("the zip: .otio, .edl, .srt, README and the media", {"Ночная_гостья.otio", "Ночная_гостья.edl", "Ночная_гостья.srt", "README.txt", "media/shot-001.mp4"} <= set(names), names)
check("its facts said", info["shots"] == 3 and info["events"] == 3 and info["media"] == 4 and info["size"] > 1000, info)
py = os.environ.get("OTIO_PY")
if py:
    out = Path(tempfile.mkdtemp()); z.extractall(out)
    r = subprocess.run([py, "-c", "import opentimelineio as o, sys; t = o.adapters.read_from_file(sys.argv[1]); v = t.video_tracks()[0]; print(len(v), t.duration().to_seconds(), len(t.audio_tracks()[0]))",
                        str(out / "Ночная_гостья.otio")], capture_output=True, text=True)
    check("OpenTimelineIO reads it: 4 items on V1, 12 s, the sound on A1", r.stdout.split() == ["4", "12.0", "1"], (r.stdout, r.stderr[-300:]))
    shutil.rmtree(out, ignore_errors=True)
else:
    print("  (OpenTimelineIO not checked: OTIO_PY not set)")
try:
    V.edit_timeline(kit, "20261030-170000-none", audio)
    check("no plan: refused", False)
except FileNotFoundError:
    check("no plan: refused", True)
shutil.rmtree(kit, ignore_errors=True)
print("test_edit_bundle  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
