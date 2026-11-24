"""HERESY 2963 (G27, question 11 of 22.11.2026 by consent): the Narrator's voice over the song's clip, the lab's half. The voice kept in the clip's plan
(clamped, taken off, kept when the plan is cut again), its words as lines in the song's time and as their own ASS style, and the mix measured with
ffmpeg on made-up sound: the song 12 dB down under the voice and back after it, the clip as long as the song.   python3 lab/test_video_voice_2963.py"""
import array, json, math, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as V  # noqa: E402

bad, seen = [], []


def check(what, ok, got=""):
    seen.append(what)
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory(prefix="vdvoice-test-") as tmp:
    kit = Path(tmp)
    name = "zz-take-2963"
    V._write(kit, name, {"name": name, "title": "zz", "seconds": 120.0, "shots": [{"t0": 0.0, "t1": 120.0, "scene": {}}], "look": {}})
    p = V.voice_set(kit, name, {"take": "zz-voice-2963", "at": 3.25, "duck": -12})
    check("the voice kept in the plan: its take, its start, its duck", p.get("voice") == {"take": "zz-voice-2963", "at": 3.25, "duck": -12.0}, p.get("voice"))
    p = V.voice_set(kit, name, {"take": "zz-voice-2963", "at": 999, "duck": -80})
    check("  its start within the song, its duck within −30…0 dB", p["voice"]["at"] == 120.0 and p["voice"]["duck"] == -30.0, p["voice"])
    for bad_take in ("", "../x", "a/b", ".hidden"):
        try:
            V.voice_set(kit, name, {"take": bad_take})
            check("  a take that is no take name refused: " + repr(bad_take), False, "kept")
        except ValueError:
            pass
    check("  never a step of the plan's history (the voice lies over the clip)", not V.get(kit, name).get("undo"), V.get(kit, name).get("undo"))
    p = V.voice_set(kit, name, None)
    check("  taken off", "voice" not in p and "voice" not in json.loads(V._file(kit, name).read_text()), p.get("voice"))

    lines = V.voice_lines([{"at": [0.0, 10.0], "plain": "One two. Three four five six."}, {"at": [12.0, 14.0], "plain": "End!"},
                           {"plain": "no time of its own"}, {"at": [20.0, 20.1], "plain": "too short"}], at=5.0)
    check("its words: each piece's sentences sharing its time by their letters, in the song's time; a piece without time left out",
          [(round(a, 2), round(b, 2), t) for a, b, t in lines] == [(5.0, 7.86, "One two."), (7.86, 15.0, "Three four five six."), (17.0, 19.0, "End!")], lines)
    ass = kit / "voice.ass"
    n = V.voice_ass(lines + [(18.9, 19.0, "under 0.3 s")], ass, 18.5, 1920, 1080)
    txt = ass.read_text(encoding="utf-8")
    style = [l for l in txt.splitlines() if l.startswith("Style: Voice,")]
    check("  as their own ASS style: italic, a little smaller, a line below the sung ones; a line cut at the clip's end, one too short left out",
          n == 3 and style and style[0].split(",")[7] == "1" and int(style[0].split(",")[2]) < round(1080 * 0.05) and "Dialogue: 1,0:00:17.00,0:00:18.50,Voice," in txt, txt[-400:])

    e = V.duck_volume(2.0, 2.0, -12)
    check("the song's volume: down 0.3 s before the voice, −12 dB under it, back over 0.8 s after it", "1.700" in e and "4.800" in e and "0.25119" in e and e.endswith(":eval=frame"), e)

    def make(path, src, secs):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"{src}:d={secs}", "-ar", "16000", "-ac", "1", str(path)], check=True)
    song, voice, out = kit / "song.wav", kit / "voice.wav", kit / "mix.wav"
    make(song, "sine=frequency=440:sample_rate=16000", 8)
    make(voice, "anullsrc=r=16000:cl=mono", 2)
    ins, amap = V.voice_mix({"file": str(voice), "at": 2.0, "seconds": 2.0, "duck": -12}, song=0)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(song), *ins, *amap, "-ac", "1", "-ar", "16000", "-f", "s16le", str(out)], check=True)
    pcm = array.array("h", out.read_bytes())

    def rms(a, b):
        xs = pcm[int(a * 16000):int(b * 16000)]
        return math.sqrt(sum(x * x for x in xs) / max(1, len(xs)))
    full, under, back = rms(0.5, 1.5), rms(2.5, 3.5), rms(5.5, 6.5)
    db = 20 * math.log10(under / full) if full and under else 0
    check("  measured: the song 12 dB down under the voice, as loud as before after it; the mix as long as the song",
          abs(db + 12) < 0.6 and abs(back / full - 1) < 0.02 and abs(len(pcm) / 16000 - 8) < 0.05, {"db": round(db, 2), "back": round(back / full, 3), "secs": len(pcm) / 16000})
    # the clip's last ffmpeg as clip() runs it: the pictures joined, the song and the voice mixed, the voice's words burnt in by -vf beside the mix's graph
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=320x180:r=24:d=8", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(kit / "0000.mp4")], check=True)
    (kit / "list.txt").write_text("file '0000.mp4'\n", encoding="utf-8")
    V.voice_ass(lines, kit / "voice.ass", 8, 320, 180)
    ins, amap = V.voice_mix({"file": str(voice), "at": 2.0, "seconds": 2.0, "duck": -12})
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", str(song), *ins, "-map", "0:v", *amap,
                        "-vf", "subtitles=voice.ass", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-shortest", "out.mp4"],
                       cwd=str(kit), capture_output=True, text=True)
    pr = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(kit / "out.mp4")], capture_output=True, text=True).stdout.split()
    check("  the clip's own ffmpeg: -vf for the words beside the mix's graph, a video and its mixed sound", r.returncode == 0 and sorted(pr) == ["audio", "video"], (r.stderr[-300:], pr))
print(f"{len(seen) - len(bad)}/{len(bad)}")
sys.exit(1 if bad else 0)
