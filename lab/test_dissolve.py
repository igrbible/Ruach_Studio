"""HERESY 1949: the dissolve between sections: _melts (at a change of section only, both shots longer than it, none for a cut), and a clip of a
red verse and a blue chorus: with a dissolve the picture is half red, half blue a quarter second after the chorus starts and wholly each a little
before and after, with a cut wholly blue there, and both clips the song's length to the frame. python3 lab/test_dissolve.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


sec = lambda *names: [{"section": x} for x in names]   # noqa: E731
check("a dissolve at each change of section", V._melts(sec("v", "v", "c", "v"), [50, 50, 50, 50], 12) == {1, 2})
check("none for a cut (xd 0)", V._melts(sec("v", "c"), [50, 50], 0) == set())
check("none where a shot is no longer than the dissolve", V._melts(sec("v", "c", "v"), [50, 12, 50], 12) == set())
check("a shot not shown is passed over", V._melts(sec("v", "v", "c"), [50, 0, 50], 12) == {0})

kit = Path(tempfile.mkdtemp())
name = "20261030-200000-test"
d = kit / "user" / "videos"; d.mkdir(parents=True)
shots = [{"t0": 0, "t1": 3, "words": "", "section": "verse", "sung": False, "scene": {}, "frame": "20261030-200000-000-001.jpg", "move": "in"},
         {"t0": 3, "t1": 6, "words": "", "section": "verse", "sung": False, "scene": {}, "frame": "20261030-200000-000-001.jpg", "move": "in"},
         {"t0": 6, "t1": 9, "words": "", "section": "chorus", "sung": False, "scene": {}, "frame": "20261030-200000-000-002.jpg", "move": "in"}]
json.dump({"title": "Тест", "seconds": 9, "look": {}, "shots": shots}, open(d / (name + ".json"), "w"))
fd = V.frames_dir(kit, name); fd.mkdir(parents=True)
for f, c in (("20261030-200000-000-001.jpg", "red"), ("20261030-200000-000-002.jpg", "blue")):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={c}:s=640x640", "-frames:v", "1", str(fd / f)], check=True)
audio = kit / "a.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "9", str(audio)], check=True)


def rgb(clipf, at):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{at:.3f}", "-i", str(clipf), "-frames:v", "1", "-vf", "scale=8:8", "-pix_fmt", "rgb24",
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    n = max(1, len(raw) // 3)
    return tuple(round(sum(raw[k::3]) / n) for k in range(3))


def frames(clipf):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0",
                          str(clipf)], capture_output=True, text=True).stdout.strip()
    return int(out or 0)


r = V.clip(kit, name, audio, None, shape="1:1", between="dissolve")
f = V.clip_path(kit, name, "1:1")
before, mid, after, n_melt = rgb(f, 5.8), rgb(f, 6.24), rgb(f, 6.7), frames(f)
V.clip(kit, name, audio, None, shape="1:1", between="cut")
cut_mid, n_cut = rgb(f, 6.24), frames(f)
check("the clip says its dissolve", r.get("between") == "dissolve", r)
check("before the chorus: red", before[0] > 200 and before[2] < 50, before)
check("a quarter second into the chorus: red and blue both", 70 < mid[0] < 190 and 70 < mid[2] < 190, mid)
check("after the dissolve: blue", after[2] > 200 and after[0] < 50, after)
check("with a cut, blue at once", cut_mid[2] > 200 and cut_mid[0] < 50, cut_mid)
check("both clips the song's length to the frame (225)", n_melt == 225 and n_cut == 225, (n_melt, n_cut))
try:
    V.clip(kit, name, audio, None, shape="1:1", between="melt")
    check("an unknown way between refused", False)
except ValueError:
    check("an unknown way between refused", True)
shutil.rmtree(kit, ignore_errors=True)
print("test_dissolve  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
