"""HERESY 3005 (the Windows tools' critic of 25.11.2026): the Videographer's own font, DejaVu Sans, is the Studio's (lab/fonts/DejaVuSans.ttf and
DejaVuSans-Bold.ttf, Bitstream Vera licence beside them), not the system's: FONTS points there, the animatic's cards draw Cyrillic, Greek and
Hebrew in it, and every clip's subtitles get fontsdir with DejaVu laid in, so libass finds «DejaVu Sans» where the system has none (Windows,
macOS): played here by a fontconfig that knows no system font.
    .venv/bin/python lab/test_studio_font_dejavu.py"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import videographer  # noqa: E402
import video_fonts  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


F = LAB / "fonts"
check([Path(f) for f in videographer.FONTS] == [F / "DejaVuSans.ttf", F / "DejaVuSans-Bold.ttf"], "FONTS: lab/fonts' DejaVu Sans, regular and bold")
check(all(Path(f).stat().st_size > 500_000 for f in videographer.FONTS), "both files are there, whole")
lic = (F / "DejaVu-LICENSE.txt").read_text(encoding="utf-8")
check("Bitstream Vera" in lic and "DejaVu changes are in public domain" in lic, "their licence beside them (DejaVu-LICENSE.txt)")
check("DejaVu-LICENSE.txt" in (F / "README.md").read_text(encoding="utf-8")
      and "lab/fonts/DejaVu-LICENSE.txt" in next(p for p in (LAB.parent / "heresy" / "root" / "LICENSE-ASSETS.md", LAB.parent / "LICENSE-ASSETS.md")
                                                   if p.is_file()).read_text(encoding="utf-8"),
      "lab/fonts/README.md and LICENSE-ASSETS.md name it")
check(video_fonts.STUDIO == "DejaVu Sans", "the Studio's family is still DejaVu Sans")
from PIL import Image, ImageDraw, ImageFont  # noqa: E402
fnt = videographer._font(False, 40)
check(isinstance(fnt, ImageFont.FreeTypeFont) and fnt.getname()[0] == "DejaVu Sans", "the card's font is DejaVu Sans, not Pillow's default")
im = Image.new("L", (900, 80))
ImageDraw.Draw(im).text((5, 5), "Тест Ελλάδα עברית", font=fnt, fill=255)
check(im.getbbox() is not None and im.getbbox()[2] > 300, "a card's Cyrillic, Greek and Hebrew drawn")
src = (LAB / "videographer.py").read_text(encoding="utf-8")
check('fd = ":fontsdir=fonts"\n' in src and 'fd = ":fontsdir=fonts" if fam else ""' not in src, "every clip's subtitles get fontsdir")
check("shutil.copyfile(f, tmp / \"fonts\" / Path(f).name)" in src, "the Studio's DejaVu is laid into the render's fonts/ every time")
check("/usr/share/fonts" not in src, "no system font path left in the Videographer")

ff = shutil.which("ffmpeg")
if ff:
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        (t / "fonts").mkdir()
        for f in videographer.FONTS:
            shutil.copyfile(f, t / "fonts" / Path(f).name)
        (t / "fc.conf").write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><cachedir>' + str(t / "fc") + "</cachedir></fontconfig>", encoding="utf-8")
        (t / "t.ass").write_text("[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 120\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Bold\n"
                                 "Style: Default,DejaVu Sans,48,&H00FFFFFF,0\n\n[Events]\nFormat: Layer, Start, End, Style, Text\n"
                                 "Dialogue: 0,0:00:00.00,0:00:05.00,Default,Тест Ελλάδα\n", encoding="utf-8")
        env = dict(os.environ, FONTCONFIG_FILE=str(t / "fc.conf"))
        def frame(fd):
            r = subprocess.run([ff, "-v", "error", "-f", "lavfi", "-i", "color=black:s=640x120:d=1", "-vf", "subtitles=t.ass" + fd,
                                "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], cwd=t, env=env, capture_output=True, timeout=60)
            return r.returncode, sum(1 for b in r.stdout if b > 128), r.stderr.decode("utf-8", "replace")[-200:]
        rc0, lit0, _ = frame("")
        check(lit0 == 0, "the stand-in knows no font: without fontsdir libass draws nothing (as a Windows without DejaVu)")
        rc, lit, err = frame(":fontsdir=fonts")
        check(rc == 0 and lit > 500, f"libass with no system font draws the title from fontsdir's DejaVu ({lit} lit pixels) {err}")
else:
    print("skip: no ffmpeg here, the libass render is not checked")
print(f"{ok} passed")
