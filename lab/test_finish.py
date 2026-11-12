"""HERESY 2242–2246: the Videographer's finishing batch: the film's halation and jitter, the passes between shots (through white, a push, a zoom;
at every cut; a shot's own), the output presets (4k, tg) and the crop by the subject, the quick draft, the titles' templates. Renders of 16 s on
the processor from the pictures an earlier plan painted (user/videos/20261028-200830-1-a.frames). python3 lab/test_finish.py"""
import json, shutil, subprocess, sys, tempfile, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import luts  # noqa: E402
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def probe(f):
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", str(f)],
                       capture_output=True, text=True)
    d = json.loads(p.stdout or "{}")
    s = (d.get("streams") or [{}])[0]
    return s.get("width"), s.get("height"), round(float((d.get("format") or {}).get("duration") or 0), 2)


def grey(f, at, crop="iw:ih:0:0"):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(at), "-i", str(f), "-frames:v", "1", "-vf", f"crop={crop},scale=64:36,format=gray",
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    return sum(raw) / max(1, len(raw))


# ---- the film (2242)
f0 = luts.film_vf(0, 0, 0, 0)
fh, fj = luts.film_vf(0, 0, 0.7, 0), luts.film_vf(0, 0, 0, 0.5, 1920, 1080)
check("2242 · none at 0; halation a screened red glow; jitter a weave cropped and scaled back", f0 is None and "blend=all_mode=screen" in fh and "colorchannelmixer" in fh
      and fj.startswith("crop=iw-") and "scale=1920:1080" in fj, (fh, fj))
all4 = luts.film_vf(0.5, 0.5, 0.5, 0.5)
check("  the order: the weave, the glow, the lens, the grain", all4.index("crop=") < all4.index("blend") < all4.index("vignette") < all4.index("noise"), all4)
w = Path(tempfile.mkdtemp())
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=0x101010:s=320x180,drawbox=x=140:y=70:w=40:h=40:c=white:t=fill", "-frames:v", "1",
                str(w / "spot.png")], check=True)
p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", "spot.png", "-vf", luts.film_vf(0, 0, 1, 0, 320, 180), "-frames:v", "5", "glow%d.png"],
                   cwd=str(w), capture_output=True, text=True)
from PIL import Image  # noqa: E402
if p.returncode == 0:
    im = Image.open(w / "glow5.png").convert("RGB")
    r, g, b = im.getpixel((137, 90))                    # just outside the white square: the glow, red over green and blue
    check("  ffmpeg lays it: a red glow beside the light, the frame its size", r > 40 and r > g + 15 and r > b + 25 and im.size == (320, 180), (r, g, b, im.size))
else:
    check("  ffmpeg lays it", False, p.stderr[-300:])

# ---- the passes (2243)
sh = [{"section": s} for s in ("v", "v", "c", "c")]
check("2243 · the clip's pass at a change of section only, at every cut when every", [V.into(sh, i, "push") for i in range(4)] == ["cut", "cut", "push", "cut"]
      and [V.into(sh, i, "push", True) for i in range(4)] == ["cut", "push", "push", "push"])
sh[1]["into"] = "zoom"; sh[2]["into"] = "cut"
check("  a shot's own pass first, a cut too", [V.into(sh, i, "white", True) for i in range(4)] == ["cut", "zoom", "cut", "white"])
check("  the laid-over passes by xfade's names; black and flash stay fades of their own", V._melts_by(sh, [50] * 4, 12, lambda b: V.into(sh, b, "white", True)) == {0: "zoomin", 2: "fadewhite"}
      and V._melts_by(sh, [50] * 4, 12, lambda b: V.into(sh, b, "black", True)) == {0: "zoomin"} and V._edges(sh, 3, "black", True)[0].startswith("fade=t=in"))

# ---- the titles (2246)
a = w / "t.ass"
V.titles_ass(a, 30, 1920, 1080, "Ночная гостья", "", "В. Журомский", "Ин 1:1", "lower")
t = a.read_text(encoding="utf-8")
check("2246 · a lower third: its band style, from 1 s, the author and the verse under the title", ",Lower,{\\fad(400,500)}Ночная гостья\\N{\\b0\\fs" in t
      and "}В. Журомский · Ин 1:1" in t and "Dialogue: 0,0:00:01.00," in t and "Style: Lower,DejaVu Sans,54,&H00FFFFFF,&H64000000,&H00000000,1,0,3," in t, t[-400:])
V.titles_ass(a, 30, 1920, 1080, "T", "", "", "Пс 22", "corner")
check("  the corner: small at the top left", ",Corner,{\\fad(400,500)}T\\N" in a.read_text(encoding="utf-8") and "}Пс 22" in a.read_text(encoding="utf-8"))
V.titles_ass(a, 30, 1920, 1080, "T", "", "", "", "centre")
check("  the centre as it was when no author nor verse", "Dialogue: 0,0:00:00.40,0:00:05.00,Title,{\\fad(500,600)}T\n" in a.read_text(encoding="utf-8"))

# ---- the subject (2244)
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=0x303030:s=1600x900,drawbox=x=1150:y=250:w=220:h=420:c=0xe0d0c0:t=fill", "-frames:v", "1",
                str(w / "right.png")], check=True)
x = V.subject_x(w / "right.png")
fo = V.subject_focus(w / "right.png", 1080, 1920)
check("2244 · the subject found at the right; the tall crop moved to it", 0.68 < x < 0.86 and fo > 0.8, (x, fo))
check("  a flat picture: the middle", V.subject_x(w / "spot.png") > 0.4 and V.subject_focus(w / "right.png", 1920, 1080) == 0.5)

# ---- renders from painted pictures
R = Path(__file__).resolve().parent.parent
src = R / "user/videos/20261028-200830-1-a"
kit = Path(tempfile.mkdtemp())
d = kit / "user/videos"; d.mkdir(parents=True)
plan = json.load(open(str(src) + ".json", encoding="utf-8"))
plan["shots"] = [s for s in plan["shots"] if s["t0"] < 16]
plan["shots"][-1]["t1"] = 16.0
plan["seconds"] = 16.0
for s in plan["shots"]:
    s.pop("video", None); s.pop("focus", None)
name = "20261108-000000-finish"
json.dump(plan, open(d / (name + ".json"), "w", encoding="utf-8"))
shutil.copytree(str(src) + ".frames", d / (name + ".frames"))
frames = sorted((d / (name + ".frames")).glob("*.jpg"))
audio = kit / "a.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=220:r=48000", "-t", "16", "-ac", "2", str(audio)], check=True)
V.save(kit, name, {"clip_title": "Финиш", "author": "Руах Студия", "verse": "Ин 1:5", "intos": [None, "zoom"] + [None] * 8})
check("the plan keeps the author, the verse and a shot's own pass", V.get(kit, name).get("author") == "Руах Студия" and V.get(kit, name)["shots"][1].get("into") == "zoom")
t0 = time.time()
r = V.clip(kit, name, audio, frames[-1], between="push", every=True, titles=True, title_style="lower", grain=0.3, halation=0.6, jitter=0.5, draft=True)
dt = time.time() - t0
wd, ht, du = probe(V.clip_path(kit, name, "16:9", True))
check(f"2245 · a draft: 640 × 360, the song's 16 s, its own file ({dt:.1f} s)", (wd, ht) == (640, 360) and abs(du - 16) < 0.3 and r["draft"] and not V.clip_path(kit, name).is_file()
      and r["film"]["halation"] == 0.6, (wd, ht, du, r))
lower = grey(V.clip_path(kit, name, "16:9", True), 4.0, "iw/2:ih/5:iw/20:ih*7/10")
t0 = time.time()
r = V.clip(kit, name, audio, frames[-1], between="white", every=True, shape="tg", titles=False)
wd, ht, du = probe(V.clip_path(kit, name, "tg"))
check(f"2244 · Telegram: 1280 × 720, 16 s ({time.time() - t0:.1f} s)", (wd, ht) == (1280, 720) and abs(du - 16) < 0.3, (wd, ht, du))
plain = grey(V.clip_path(kit, name, "tg"), 4.0, "iw/2:ih/5:iw/20:ih*7/10")
check("2246 · the lower third shows at the foot's left at 4 s (the band and the white title)", abs(lower - plain) > 4, (lower, plain))
t0 = time.time()
r = V.clip(kit, name, audio, frames[-1], shape="9:16", reframe="subject", draft=True)
wd, ht, du = probe(V.clip_path(kit, name, "9:16", True))
check(f"2244 · Shorts by the subject, as a draft: 360 × 640 ({time.time() - t0:.1f} s)", (wd, ht) == (360, 640) and r["reframe"] == "subject", (wd, ht, r))
t0 = time.time()
r = V.clip(kit, name, audio, frames[-1], shape="4k", between="dissolve")
wd, ht, du = probe(V.clip_path(kit, name, "4k"))
check(f"2244 · YouTube 4K: 3840 × 2160, 16 s ({time.time() - t0:.1f} s)", (wd, ht) == (3840, 2160) and abs(du - 16) < 0.3, (wd, ht, du))
for k in ("between", "shape", "reframe", "title_style"):
    try:
        V.clip(kit, name, audio, None, **{k: "nope"})
        check(f"an unknown {k} refused", False)
    except ValueError:
        check(f"an unknown {k} refused", True)
keep = R / "heresy/MISC/claude-arc/video-2242"
keep.mkdir(parents=True, exist_ok=True)
for sh_, dr in (("16:9", True), ("tg", False), ("9:16", True)):
    shutil.copy(V.clip_path(kit, name, sh_, dr), keep / V.clip_path(kit, name, sh_, dr).name)
shutil.rmtree(kit, ignore_errors=True)
shutil.rmtree(w, ignore_errors=True)
print("test_finish  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
