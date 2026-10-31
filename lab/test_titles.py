"""HERESY 1948: the clip's titles: titles_ass (the title's time and style, the credits a line each over the last seconds, nothing when neither),
the plan keeping clip_title and credits, and a clip with titles brighter in the middle of its first seconds than one without. python3 lab/test_titles.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


kit = Path(tempfile.mkdtemp())
a = kit / "t.ass"
n = V.titles_ass(a, 60, 1920, 1080, "Ночная гостья", "Слова и музыка: В. Ж.\nГолос: …\n\n")
t = a.read_text(encoding="utf-8")
check("two lines: the title and the credits", n == 2, n)
check("the title from 0.4 s to 5 s, its own style, faded", "Dialogue: 0,0:00:00.40,0:00:05.00,Title,{\\fad(500,600)}Ночная гостья" in t, t[-300:])
check("the credits over the last 7 s, a line each", "Dialogue: 0,0:00:53.00,0:00:59.80,Credits," in t and "Слова и музыка: В. Ж.\\NГолос: …" in t, t[-200:])
check("braces and backslashes never reach libass", V.titles_ass(a, 60, 1920, 1080, "a{b}\\c", "") == 1 and "a(b)/c" in a.read_text(encoding="utf-8"))
check("neither: no line", V.titles_ass(a, 60, 1920, 1080, "", "  \n ") == 0)
check("a short clip: the title over its first half, the credits after it", V.titles_ass(a, 6, 1920, 1080, "T", "C") == 2 and ",0:00:03.00,Title," in a.read_text(encoding="utf-8")
      and "Dialogue: 0,0:00:03.20," in a.read_text(encoding="utf-8"), a.read_text(encoding="utf-8")[-200:])
name = "20261030-190000-test"
d = kit / "user" / "videos"; d.mkdir(parents=True)
json.dump({"title": "Тест", "seconds": 8, "look": {}, "shots": [{"t0": 0, "t1": 4, "words": "", "section": "verse", "sung": False, "scene": {}},
                                                                {"t0": 4, "t1": 8, "words": "", "section": "verse", "sung": False, "scene": {}}]},
          open(d / (name + ".json"), "w"))
p = V.save(kit, name, {"clip_title": "Мой заголовок", "credits": "Строка один\nСтрока два"})
check("the plan keeps the title shown and the credits", p.get("clip_title") == "Мой заголовок" and p.get("credits") == "Строка один\nСтрока два", p)
audio = kit / "a.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "8", str(audio)], check=True)
cover = kit / "c.jpg"
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x202020:s=640x640", "-frames:v", "1", str(cover)], check=True)


def mid(clipf, at):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(at), "-i", str(clipf), "-frames:v", "1", "-vf", "crop=iw/2:ih/4:iw/4:ih*3/8,scale=64:16,format=gray",
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    return sum(raw) / max(1, len(raw))


r1 = V.clip(kit, name, audio, cover, shape="1:1", titles=True)
on = mid(V.clip_path(kit, name, "1:1"), 2.5)
r0 = V.clip(kit, name, audio, cover, shape="1:1", titles=False)
off = mid(V.clip_path(kit, name, "1:1"), 2.5)
check("the clip says its titles (2 with, 0 without)", r1.get("titles") == 2 and r0.get("titles") == 0, (r1, r0))
check("with titles the picture's middle is brighter at 2.5 s (the title in white)", on > off + 3, (on, off))
shutil.rmtree(kit, ignore_errors=True)
print("test_titles  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
