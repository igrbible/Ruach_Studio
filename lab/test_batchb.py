"""HERESY 2247–2252: the Videographer's batch B: section changes on the DAW's bars, karaoke words lit as sung, the colour match to one shot's picture,
the primary correction before the look, the crop up and down by the subject, 4K scaled from the finished 1080p (measured against 4K made whole).
Renders of 16 s on the processor from the pictures an earlier plan painted (user/videos/20261028-200830-1-a.frames). .venv/bin/python lab/test_batchb.py"""
import json, shutil, subprocess, sys, tempfile, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import luts  # noqa: E402
import videographer as V  # noqa: E402
from PIL import Image  # noqa: E402

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


# ---- 2247: the bars
sh = lambda *cut: [{"t0": a, "t1": b, "section": s} for (a, b), s in zip(zip(cut, cut[1:]), "vvcc")]
bars, grid = V.bar_grid([0.5 * k for k in range(40)], 120.0, (120, 4, 4), None, 20)
check("2247 · the DAW's grid when the take keeps its tempo: a bar of 2 s from 0", grid == "daw" and bars[:3] == [0, 2.0, 4.0], (grid, bars[:4]))
bars2, grid2 = V.bar_grid([0.25 + 0.5 * k for k in range(40)], 120.0, (90, 4, 4), [1, 1, 5, 1] * 10, 20)
check("  another tempo: bars on the heard beats from the strongest", grid2 == "heard" and bars2[:2] == [1.25, 3.25], (grid2, bars2[:3]))
check("  half or double the tempo is the same grid", V.bar_grid([0.25 * k for k in range(80)], 240.0, (120, 4, 4))[1] == "daw")
s = sh(0, 3.0, 6.3, 9.5, 14)
ch, mv, at = V.snap_sections(s, bars)
check("  the change of section (6.3 s) on the bar at 6 s; the others untouched", ch == 1 and mv == 1 and at == {1} and s[1]["t1"] == 6.0 == s[2]["t0"]
      and s[1]["as_sung"] == [3.0, 6.3] and s[0]["t1"] == 3.0, s)
m, _ = V.snap_cuts(s, [3.1, 6.2, 9.4], skip=at)
check("  then the beats: a cut on its bar is not pulled to a beat", s[1]["t1"] == 6.0 and s[0]["t1"] == 3.1 and m == 2, s)
s = sh(0, 3.0, 4.9, 9.5, 14)
check("  a bar more than half a bar off, or leaving a shot under 1.5 s: not moved", V.snap_sections(s, [0, 8, 16])[1] == 0 and s[1]["t1"] == 4.9)
w = Path(tempfile.mkdtemp())
audio = w / "click.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=1000:r=22050:d=0.03,apad=whole_dur=0.5", "-af", "aloop=loop=39:size=11025",
                "-t", "20", str(audio)], check=True)
kit = w / "kit"
(kit / "user/videos").mkdir(parents=True)
json.dump({"title": "t", "seconds": 20, "shots": sh(0, 3.0, 6.3, 9.5, 20)}, open(kit / "user/videos/b.json", "w"))
r = V.on_beat(kit, "b", audio, meter=(120, 4, 4))
p = V.get(kit, "b")
check(f"  on_beat on a 120 bpm click: the DAW's grid, the change on its bar ({r.get('grid')}, {r.get('on_bar')} of {r.get('sections')})",
      r["grid"] == "daw" and r["on_bar"] == 1 and abs(p["shots"][1]["t1"] - 6.0) < 0.06, r)

# ---- 2248: karaoke
rows = [{"text": "Неотразимый чудный свет.", "start": 1.0, "end": 3.0, "guessed": False, "tt": [[1.0, 2.0], [2.0, 2.5], [2.5, 3.0]]},
        {"text": "Ангел мой", "start": 4.0, "end": 6.0, "guessed": True, "tt": [None]}]
n, heard = V.lyrics_ass(rows, w / "k.ass", 10, 1920, 1080, True)
t = (w / "k.ass").read_text(encoding="utf-8")
check("2248 · karaoke: each word lit at its own time, the lead-in first, the gold lit and white to sing", n == 2 and heard == 3
      and "{\\fad(180,220)}{\\k10}{\\k100}Неотразимый {\\k50}чудный {\\k50}свет." in t and ",&H0066D9FF,&H00FFFFFF," in t and "SecondaryColour" in t, t[-500:])
check("  a line with no word heard: its words share it", "{\\k10}{\\k100}Ангел {\\k100}мой" in t, t[-200:])
check("  the plain lines as they were", V.lyrics_ass(rows, w / "p.ass", 10) == 2 and "\\k" not in (w / "p.ass").read_text(encoding="utf-8"))

# ---- 2249: the colour match
for c, f in (("0xc04020", "warm.png"), ("0x2040a0", "cold.png")):
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c={c}:s=320x180,noise=alls=30:allf=t", "-frames:v", "1", str(w / f)], check=True)
pw, pc = V.palette_of(w / "warm.png"), V.palette_of(w / "cold.png")
g = V.match_gains(pc, pw, 1.0)
im = V._graded(Image.open(w / "cold.png").convert("RGB"), g)
after = [sum(ch.get_flattened_data() if hasattr(ch, "get_flattened_data") else ch.getdata()) / (320 * 180) for ch in im.split()]
check("2249 · a cold picture matched to a warm one comes out warm (its means near the reference's)", all(abs(a - m) < 12 for a, (m, _) in zip(after, pw)), (after, pw))
check("  the same picture against itself: nothing to move", V.match_gains(pw, pw) is None and V.match_vf(None) == "")
check("  for a shot's video: lutrgb a channel", V.match_vf(g).startswith("lutrgb=r='clip(val*") and ":b='" in V.match_vf(g))

# ---- 2250: the primaries
check("2250 · none at 0", luts.primary_vf() is None and luts.primary_vf(0, 0, 0, 0, 0) is None)
pv = luts.primary_vf(0.2, 0.5, 0.3, 0.4, -0.5)
check("  lift, gamma and gain in lutrgb; contrast and saturation in eq", pv.startswith("lutrgb=r='clip(255*pow(") and "eq=contrast=1.2068:saturation=0.5000" in pv, pv)
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=0x808080:s=64x36", "-frames:v", "1", str(w / "grey.png")], check=True)
for vf, want, what in ((luts.primary_vf(gamma=1), lambda x: x > 160, "gamma +1 lifts the middle grey"), (luts.primary_vf(lift=-1), lambda x: x < 128, "lift −1 lowers it"),
                       (luts.primary_vf(saturation=-1), lambda x: True, "saturation runs")):
    q = subprocess.run(["ffmpeg", "-v", "error", "-i", str(w / "grey.png"), "-vf", vf + ",format=gray", "-f", "rawvideo", "-"], capture_output=True)
    v = sum(q.stdout) / max(1, len(q.stdout))
    check(f"  ffmpeg: {what} ({v:.0f})", q.returncode == 0 and want(v), q.stderr[-200:])

# ---- 2251: the subject down the picture
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=0x303030:s=1500x1000,drawbox=x=650:y=80:w=200:h=260:c=0xe0d0c0:t=fill", "-frames:v", "1",
                str(w / "high.png")], check=True)
y = V.subject_y(w / "high.png")
fy = V.subject_focus_y(w / "high.png", 1920, 1080)
check("2251 · the subject found high in a 3:2 picture; the wide crop keeps it, room above", y < 0.3 and fy < 0.25, (y, fy))
check("  a picture that fits the height: the middle", V.subject_focus_y(w / "high.png", 1080, 1920) == 0.5)

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
name = "20261108-000000-batchb"
json.dump(plan, open(d / (name + ".json"), "w", encoding="utf-8"))
shutil.copytree(str(src) + ".frames", d / (name + ".frames"))
frames = sorted((d / (name + ".frames")).glob("*.jpg"))
audio = kit / "a.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=220:r=48000", "-t", "16", "-ac", "2", str(audio)], check=True)
lyr = [{"text": "Свет во тьме светит", "start": 2.0, "end": 5.0, "guessed": False, "tt": [[2.0, 2.6], [2.6, 3.4], [3.4, 4.0], [4.0, 5.0]]},
       {"text": "и тьма не объяла его", "start": 6.0, "end": 9.5, "guessed": False, "tt": [[6, 6.4], [6.4, 7], [7, 7.5], [7.5, 8.4], [8.4, 9.5]]}]
t0 = time.time()
cover = R / "outputs/20261013-193414-pre-chorus-anew-b-chorus-anew-a/artwork.jpg"   # a cover painted for another take: a palette of its own
r = V.clip(kit, name, audio, cover if cover.is_file() else frames[-1], rows=lyr, lyrics=True, words=True, match=0, primary={"contrast": 0.3, "saturation": 0.2, "lift": -0.2}, draft=True)
wd, ht, du = probe(V.clip_path(kit, name, "16:9", True))
check(f"2248–2250 · a draft with karaoke, the match to shot 1 and the primaries: 640 × 360, 16 s ({time.time() - t0:.1f} s; spread {r['match'] and r['match']['spread_before']} → {r['match'] and r['match']['spread_after']})",
      (wd, ht) == (640, 360) and abs(du - 16) < 0.3 and r["words"] == 9 and r["primary"] and r["match"]["spread_after"] < r["match"]["spread_before"], (wd, ht, du, r))
t0 = time.time()
r = V.clip(kit, name, audio, frames[-1], shape="4k", between="dissolve", rows=lyr, lyrics=True, words=True)
scaled = time.time() - t0
wd, ht, du = probe(V.clip_path(kit, name, "4k"))
check(f"2252 · 4K scaled from 1080p: 3840 × 2160, 16 s, made at 1920 × 1080 ({scaled:.1f} s)", (wd, ht) == (3840, 2160) and abs(du - 16) < 0.3 and r["made_at"] == [1920, 1080], (wd, ht, du, r))
sb = V.clip_path(kit, name, "4k").stat().st_size
t0 = time.time()
r = V.clip(kit, name, audio, frames[-1], shape="4k", between="dissolve", rows=lyr, lyrics=True, words=True, native=True)
whole = time.time() - t0
check(f"  4K made whole as before: {whole:.1f} s against {scaled:.1f} s scaled (×{whole / max(0.1, scaled):.1f}); {V.clip_path(kit, name, '4k').stat().st_size / 1e6:.1f} MB against {sb / 1e6:.1f} MB",
      r["made_at"] == [3840, 2160] and probe(V.clip_path(kit, name, "4k"))[:2] == (3840, 2160), r)
print(f"MEASURE 4k_scaled_s={scaled:.1f} 4k_whole_s={whole:.1f}")
keep = R / "heresy/MISC/claude-arc/video-2247"
keep.mkdir(parents=True, exist_ok=True)
shutil.copy(V.clip_path(kit, name, "16:9", True), keep / "karaoke-match-primaries.draft.mp4")
shutil.rmtree(kit, ignore_errors=True)
shutil.rmtree(w, ignore_errors=True)
print("test_batchb  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
