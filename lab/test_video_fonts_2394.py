"""HERESY 2394, 2395: the Videographer's own fonts and the clip's light copy. A system font sent as bytes is kept once by its hash with the family it
names, refused when it is no TrueType/OpenType; the ASS styles name that family; libass, handed the render's fonts folder, really draws with it (the
frame differs from the Studio's DejaVu Sans); a plan keeps the choice and refuses a made-up id; a font laid for a render that was taken away raises.
The light copy: 720 p, beside the clip, never listed as a clip, said by clip_info only when it is of this very clip. python3 lab/test_video_fonts_2394.py"""
import json, shutil, subprocess, sys, tempfile, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import video_fonts as F  # noqa: E402
import videographer as V  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


SERIF = Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf")
kit = Path(tempfile.mkdtemp(prefix="vdfont-"))
try:
    data = SERIF.read_bytes()
    a = F.save(kit, data, "Liberation Serif Bold")
    b = F.save(kit, data, "again")
    check("a font kept once by its hash, with the family and style it names", a["id"] == b["id"] and a["family"] == "Liberation Serif" and a["style"] == "Bold" and a["ass"] == "Liberation Serif"
          and len(list((kit / "user" / "fonts").glob("*.ttf"))) == 1, (a, b))
    check("the listing names it, sorted, and the Studio's own", [x["id"] for x in F.listing(kit)["fonts"]] == [a["id"]] and F.listing(kit)["studio"] == "DejaVu Sans")
    for junk, why in ((b"wOF2" + b"0" * 100, "WOFF"), (b"ttcf" + b"0" * 100, "collection"), (b"<html>", "not a TrueType"), (b"\x00\x01\x00\x00" + b"x" * 64, "could not be read")):
        try:
            F.save(kit, junk)
            check("refused: " + why, False, "kept")
        except ValueError as e:
            check("refused: " + why, why in str(e), e)
    for fid in ("../../etc/passwd", "abc.ttf", "", "0123456789abcdef.woff"):
        try:
            F.path(kit, fid)
            check("no path out of the folder for «" + fid + "»", False)
        except (ValueError, FileNotFoundError):
            check("no path out of the folder for «" + fid + "»", True)
    check("a comma never ends the style's font field", V._ass_font("Evil, Font") == "Evil Font" and V._ass_font("") == "DejaVu Sans")

    # the ASS names the family, and libass draws with the font laid in the render's folder
    work = kit / "render"
    fam = F.lay(kit, [a["id"], ""], work / "fonts")
    check("lay copies the chosen font and names its family", fam == {a["id"]: "Liberation Serif"} and (work / "fonts" / a["id"]).is_file(), fam)
    n = V.titles_ass(work / "t.ass", 6.0, 640, 360, title="Ruach Studio Ab", style="centre", font=fam[a["id"]])
    d = V.titles_ass(work / "d.ass", 6.0, 640, 360, title="Ruach Studio Ab", style="centre")
    txt = (work / "t.ass").read_text(encoding="utf-8")
    check("the titles' styles name the family (all four)", n == 1 and txt.count(",Liberation Serif,") == 4 and "DejaVu" not in txt, txt[:400])
    rows = [{"start": 0.5, "end": 3.0, "text": "один два", "tt": [[0.5, 1.0], [1.0, 2.0]]}]
    V.lyrics_ass(rows, work / "k.ass", 6.0, 640, 360, True, font="Liberation Serif")
    check("the karaoke's style names it too", ",Liberation Serif," in (work / "k.ass").read_text(encoding="utf-8"))

    def frame(ass, fd):
        out = work / (ass + ".png")
        p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=3", "-vf", "subtitles=" + ass + (":fontsdir=fonts" if fd else ""),
                            "-ss", "2", "-frames:v", "1", str(out)], cwd=str(work), capture_output=True, text=True)
        return out.read_bytes() if p.returncode == 0 and out.is_file() else p.stderr
    serif, plain = frame("t.ass", True), frame("d.ass", False)
    check("libass draws the title in the laid font: its frame differs from DejaVu Sans's", isinstance(serif, bytes) and isinstance(plain, bytes) and serif != plain,
          (str(serif)[:200], str(plain)[:200]))

    # the folder itself: a font the system does not have (a Montserrat out of fontconfig's sight, where this machine has one) is drawn only through it
    mont = Path.home() / "Documents/AI/Ruach_Studio/heresy/MISC/claude-probes/dove/Montserrat.ttf"
    known = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout.lower()
    if mont.is_file() and "montserrat" not in known:
        m = F.save(kit, mont.read_bytes(), "Montserrat")
        F.lay(kit, [m["id"]], work / "fonts")
        V.titles_ass(work / "m.ass", 6.0, 640, 360, title="Ruach Studio Ab", style="centre", font=F.family(kit, m["id"]))
        check("a typographic family (Montserrat) named in the ASS by the name libass matches (Montserrat Thin)", m["family"] == "Montserrat" and F.family(kit, m["id"]) == "Montserrat Thin", m)
        with_dir, without = frame("m.ass", True), frame("m.ass", False)
        check("a font out of the system's sight: drawn through the render's folder, not without it", isinstance(with_dir, bytes) and isinstance(without, bytes) and with_dir != without,
              (m["family"], str(with_dir)[:120], str(without)[:120]))
    else:
        print("  skip  the folder-only font (no Montserrat out of fontconfig's sight here)")

    # the plan keeps the choice
    plan = {"name": "t1", "title": "t", "seconds": 6, "shots": [{"t0": 0, "t1": 6, "words": "", "section": "verse", "scene": {}}], "look": {k: "" for k in V.LOOK_KEYS}}
    (kit / "user" / "videos").mkdir(parents=True, exist_ok=True)
    (kit / "user" / "videos" / "t1.json").write_text(json.dumps(plan), encoding="utf-8")
    q = V.save(kit, "t1", {"font_titles": a["id"]})
    check("the plan keeps the titles' font, a step of its history", q.get("font_titles") == a["id"] and len(q.get("undo") or []) == 1, q.get("font_titles"))
    q = V.save(kit, "t1", {"font_titles": ""})
    check("«» gives the titles back to the Studio's font", "font_titles" not in q)
    try:
        V.save(kit, "t1", {"font_lyrics": "../x.ttf"})
        check("a made-up font id refused by the plan", False)
    except ValueError:
        check("a made-up font id refused by the plan", True)
    (kit / "user" / "fonts" / a["id"]).unlink()
    try:
        F.lay(kit, [a["id"]], work / "fonts2")
        check("a font taken away raises at the render, never a silent DejaVu", False)
    except FileNotFoundError:
        check("a font taken away raises at the render, never a silent DejaVu", True)

    # HERESY 2395: the light copy
    clip = kit / "user" / "videos" / "t1.clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=24:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "8", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(clip)], check=True)
    rate = V.rate_of(clip)
    check("the master's rate read (a heavy one here)", rate > V.VIEW_OVER, rate)
    info = V.clip_info(kit, "t1")
    check("a heavy clip without its copy: heavy, no view", info.get("heavy") is True and "view" not in info, info)
    v = V.make_view(clip)
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(v)], capture_output=True, text=True).stdout.strip()
    check("the light copy: NAME.clip.view.mp4 at 1280×720, lighter than the master", v.name == "t1.clip.view.mp4" and probe == "1280,720" and V.rate_of(v) < rate, (v.name, probe, V.rate_of(v)))
    check("the clips' listing never takes it for a clip", [c["shape"] for c in V.clips_index(kit).get("t1", [])] == ["16:9"], V.clips_index(kit))
    check("clip_info says the copy of this very clip", (V.clip_info(kit, "t1").get("view") or {}).get("exists") is True)
    time.sleep(1.1)
    clip.touch()
    check("a clip made again after its copy: the old copy not said", "view" not in V.clip_info(kit, "t1"))
    tall = kit / "user" / "videos" / "t1.clip-9x16.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=24:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(tall)], check=True)
    tv = V.make_view(tall, force=True)
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(tv)], capture_output=True, text=True).stdout.strip()
    check("a tall clip's copy stands tall, its short side 720 (no sound is no failure)", probe == "720,1280", probe)
finally:
    shutil.rmtree(kit, ignore_errors=True)
print(f"{'FAILED ' + str(len(bad)) if bad else 'all passed'}")
sys.exit(1 if bad else 0)
