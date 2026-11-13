"""HERESY 2396: the Videographer's verse card drawn by HyperFrames with its alpha and laid over a clip, on the processor. Skipped (said so) where
HyperFrames or Node 22 is not installed. RUACH_HYPERFRAMES=<folder with node_modules/hyperframes> [RUACH_NODE=…] [RUACH_CHROME=…] python3 lab/test_video_templates_2396.py"""
import os, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import video_templates as T  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


a = T.available()
if not a["ok"]:
    print("  skip  " + a["why"])
    sys.exit(0)
with tempfile.TemporaryDirectory(prefix="vdtpl-test-") as tmp:
    tmp = Path(tmp)
    mov = T.render("verse-card", {"verse": "Свет во тьме светит, и тьма не объяла его.", "address": "Иоанна 1:5"}, tmp / "card.mov",
                   font="/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", chrome=os.environ.get("RUACH_CHROME"))
    pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=codec_name,pix_fmt,width,height,nb_frames", "-of", "csv=p=0", str(mov)],
                        capture_output=True, text=True).stdout.strip()
    check("the card: ProRes with its alpha, 1920 × 1080, about 5.7 s at 24 fps", pr.split(",")[:3] == ["prores", "1920", "1080"] and pr.split(",")[3].startswith("yuva444p") and int(pr.split(",")[-1]) >= 130, pr)

    def alpha(t, x, y):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", str(mov), "-frames:v", "1", "-vf", f"crop=1:1:{x}:{y},format=rgba", "-f", "rawvideo", "-"],
                             capture_output=True).stdout
        return raw[3] if len(raw) == 4 else -1
    check("transparent where the card is not, opaque on it once it has risen, clear again before it rises", alpha(2.5, 20, 20) == 0 and alpha(2.5, 960, 860) > 100 and alpha(0.05, 960, 860) < 20,
          (alpha(2.5, 20, 20), alpha(2.5, 960, 860), alpha(0.05, 960, 860)))
    src = tmp / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x334455:s=1920x1080:r=24:d=8", "-f", "lavfi", "-i", "sine=f=330:d=8",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src)], check=True)
    out = T.overlay(src, mov, tmp / "out.mp4", at=1.0)

    def px(f, t, x, y):
        return subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", str(f), "-frames:v", "1", "-vf", f"crop=1:1:{x}:{y},format=rgb24", "-f", "rawvideo", "-"],
                              capture_output=True).stdout
    check("laid over the clip from 1.0 s: the card at 3.5 s, the clip untouched at 0.5 s and at the corner", px(out, 3.5, 960, 860) != px(src, 3.5, 960, 860)
          and px(out, 0.5, 960, 860) == px(src, 0.5, 960, 860), (px(out, 3.5, 960, 860), px(src, 3.5, 960, 860)))
    au = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout.strip()
    check("the sound kept as it was", au == "aac", au)
print(f"{'FAILED ' + str(len(bad)) if bad else 'all passed'}")
sys.exit(1 if bad else 0)
