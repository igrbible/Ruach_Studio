#!/usr/bin/env python3
"""HERESY 1838 · 1844 · 1845 · 1847: lab/videographer.py and the Remaster's new Colours on a studio of their own in a temporary folder (never this studio's):
a shot's picture set from a file and from bytes (a wide one, a square one), replaced and taken off (kept in off/, never deleted), refused when it is no
picture; the moves (the camera's words, the turn, a choice saved and cleared, «auto» never in the file); a new cut on the same times keeping a shot's
picture and move; the clip of a short plan (its length, its picture size, a shot with no picture shown as its words); and the cassette, radio and hall
Colours on a short tone (the radio mono and its lows gone). ffmpeg and Pillow, the processor only; about half a minute.
  .venv/bin/python lab/test_videographer.py"""
import io
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as v  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def probe(f, what):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", what, "-of", "csv=p=0", str(f)], capture_output=True, text=True)
    return r.stdout.strip().splitlines()


kit = Path(tempfile.mkdtemp(prefix="claude-vg-"))
try:
    from PIL import Image
    (kit / "user/videos").mkdir(parents=True)
    wide, square = kit / "wide.png", kit / "square.jpg"
    Image.new("RGB", (1600, 900), (180, 40, 40)).save(wide)
    Image.new("RGB", (800, 800), (40, 40, 180)).save(square)
    plan = {"name": "t", "title": "a test", "seconds": 9, "look": {}, "shots": [
        {"t0": 0, "t1": 3, "words": "one", "section": "verse", "sung": True, "scene": {"shot": "a red wall", "camera": "slow push-in"}},
        {"t0": 3, "t1": 6, "words": "two", "section": "verse", "sung": True, "scene": {"shot": "a blue door", "camera": "static, locked off"}},
        {"t0": 6, "t1": 9, "words": "", "section": "outro", "sung": False, "scene": {"shot": "an empty stage"}}]}
    json.dump(plan, open(kit / "user/videos/t.json", "w"))
    print("the moves")
    g = v.get(kit, "t")
    check("the camera's words read: push-in, locked off; a shot without them takes its turn", [s["auto"] for s in g["shots"]] == ["in", "still", "out"], [s["auto"] for s in g["shots"]])
    q = v.save(kit, "t", {"scenes": [s["scene"] for s in g["shots"]], "moves": ["left", "", "right"]})
    raw = json.load(open(kit / "user/videos/t.json"))
    check("a choice is kept, «» takes it back to the camera's; «auto» is worked out, never in the file",
          [s.get("move") for s in raw["shots"]] == ["left", None, "right"] and not any("auto" in s for s in raw["shots"]) and [v.move_of(s, i) for i, s in enumerate(q["shots"])] == ["left", "still", "right"],
          json.dumps(raw["shots"]))
    q = v.save(kit, "t", {"scenes": []})
    check("a save without moves leaves them as they are", [s.get("move") for s in q["shots"]] == ["left", None, "right"])
    print("a shot's picture")
    q = v.frame_set(kit, "t", 0, wide, {"test": 1})
    f0 = q["shots"][0]["frame"]
    check("a picture from a file: a JPEG in t.frames/, its size kept", (kit / "user/videos/t.frames" / f0).is_file() and q["shots"][0]["frame_wh"] == [1600, 900], q["shots"][0])
    buf = io.BytesIO(); Image.new("RGB", (640, 640), (20, 160, 20)).save(buf, "PNG")
    q = v.frame_set(kit, "t", 0, buf.getvalue(), "disk")
    f1 = q["shots"][0]["frame"]
    check("replaced by bytes from the disk: the old one goes to off/, kept", f1 != f0 and (kit / "user/videos/t.frames/off" / f0).is_file() and q["shots"][0]["frame_from"] == "disk")
    try:
        v.frame_set(kit, "t", 1, b"not a picture", "disk"); bad = None
    except ValueError as e:
        bad = str(e)
    check("bytes that are no picture: refused, said so", bad and "not a picture" in bad, bad)
    try:
        v.frame_set(kit, "t", 7, wide, "x"); bad = None
    except ValueError as e:
        bad = str(e)
    check("a shot that is not there: refused", bad == "no such shot", bad)
    q = v.frame_off(kit, "t", 0)
    check("taken off: the shot has none, the file in off/", "frame" not in q["shots"][0] and (kit / "user/videos/t.frames/off" / f1).is_file())
    q = v.frame_set(kit, "t", 1, square, {"test": 2})
    print("the brief, the hero, the seed (1913)")
    q13 = v.save(kit, "t", {"brief": "a quiet evening", "heroes": [None, True, False]})
    raw = json.load(open(kit / "user/videos/t.json"))
    check("the brief kept; a shot's hero choice kept, null the page's own", raw.get("brief") == "a quiet evening" and [s.get("hero") for s in raw["shots"]] == [None, True, False],
          (raw.get("brief"), [s.get("hero") for s in raw["shots"]]))
    raw.update(hero={"run": "r", "file": "f.png"}, seed=4242)
    json.dump(raw, open(kit / "user/videos/t.json", "w"))
    import frames_job
    errs = []
    for args in (("nope", [0], {"0": "x"}, []), ("t", [0], {"0": " "}, []), ("t", [], {}, [])):
        try:
            frames_job.start(kit, *args)
        except ValueError as e:
            errs.append(str(e))
    check("the Artist's drawing refused: no plan, a shot with nothing to draw, no shot", len(errs) == 3 and "no plan" in errs[0] and "nothing to draw" in errs[1] and "no shot" in errs[2], errs)
    print("a new cut on the same times")
    m = v.make(kit, "t", {"title": "a test", "seconds": 9}, {"lyrics": "[verse]\none\ntwo"},
               [{"start": 0.2, "end": 2.8, "text": "one"}, {"start": 3.1, "end": 5.8, "text": "two"}])
    same = [(s["t0"], s["t1"]) for s in m["shots"]] == [(s["t0"], s["t1"]) for s in q["shots"]]
    check("a cut made again keeps the clip's hero, brief and seed (1913), and a shot's hero where its times are the same",
          m.get("hero") == {"run": "r", "file": "f.png"} and m.get("brief") == "a quiet evening" and m.get("seed") == 4242 and (not same or m["shots"][1].get("hero") is True),
          (m.get("hero"), m.get("brief"), m.get("seed")))
    check("where the times are the same, the shot keeps its picture and its move", not same or (m["shots"][1].get("frame") == q["shots"][1]["frame"] and m["shots"][0].get("move") == "left"),
          [(s["t0"], s["t1"], s.get("frame"), s.get("move")) for s in m["shots"]])
    json.dump(dict(plan, shots=[dict(s, **({"frame": q["shots"][1]["frame"]} if i == 1 else {})) for i, s in enumerate(plan["shots"])]), open(kit / "user/videos/t.json", "w"))
    print("the clip")
    audio = kit / "a.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=9", "-ar", "48000", "-ac", "2", str(audio)], check=True)
    job = {}
    r = v.clip(kit, "t", audio, None, job, {"shot": "What is seen"})
    out = v.clip_path(kit, "t")
    dur = float((probe(out, "format=duration") or ["0"])[0])
    wh = (probe(out, "stream=width,height") or [""])[0]
    check("the clip: 9 s, 1920 × 1080, one shot with a picture of its own, the job at 100 %",
          abs(dur - 9) < 0.2 and wh == "1920,1080" and r["own"] == 1 and job.get("progress") == 1.0, (dur, wh, r, job))
    check("its working folder gone, the clip told by clip_info", not out.with_name("t.clip.part").exists() and v.clip_info(kit, "t")["exists"])
    print("the clip's lyrics and its transitions (1916)")
    rows = [{"start": 0.4, "end": 2.6, "text": "one line {in braces}"}, {"start": 3.2, "end": 5.5, "text": "two"}]
    r = v.clip(kit, "t", audio, None, {}, {"shot": "What is seen"}, rows=rows, lyrics=True, between="black")
    dur = float((probe(out, "format=duration") or ["0"])[0])

    def luma(t):                                         # the frame at t, its mean brightness (0–255)
        px = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", str(out), "-frames:v", "1", "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"],
                            capture_output=True).stdout
        return sum(px) / max(1, len(px))
    mid, edge = luma(4.5), luma(5.96)
    check("the lyrics burnt in, both lines; through black where the verse gives way to the outro (the frame at the cut darker than the shot's middle)",
          r["lines"] == 2 and r["between"] == "black" and abs(dur - 9) < 0.2 and edge < 0.5 * mid, (r, round(dur, 2), round(mid, 1), round(edge, 1)))
    bad = None
    try:
        v.clip(kit, "t", audio, None, {}, {}, between="wipe")
    except ValueError as e:
        bad = str(e)
    check("an unknown transition refused, said so", bad and "between the sections" in bad, bad)
    print("the clip's shapes (1917)")
    for shape, wh in (("9:16", "1080,1920"), ("1:1", "1080,1080")):
        r = v.clip(kit, "t", audio, None, {}, {"shot": "What is seen"}, rows=rows, lyrics=True, shape=shape)
        f = v.clip_path(kit, "t", shape)
        got = (probe(f, "stream=width,height") or [""])[0]
        d = float((probe(f, "format=duration") or ["0"])[0])
        check(f"{shape}: its own file, {wh.replace(',', ' × ')}, the song's length, the lyrics in it; the wide clip left as it was",
              f.is_file() and got == wh and abs(d - 9) < 0.2 and r["lines"] == 2 and r["shape"] == shape and v.clip_path(kit, "t").is_file()
              and v.clip_info(kit, "t", shape)["exists"], (got, round(d, 2), r))
    print("the animatic (1847)")
    r = v.animatic(kit, "t", audio, None, {"shot": "What is seen"})
    a_out = v.animatic_path(kit, "t")
    adur = float((probe(a_out, "format=duration") or ["0"])[0])
    check("the animatic: 9 s, its three frames, the one with a picture of its own drawn over it", abs(adur - 9) < 0.3 and r["shots"] == 3, (adur, r))
    print("the timeline's edits (1864)")
    g = v.get(kit, "t")
    rows = [{"start": 0.2, "end": 2.8, "text": "one"}, {"start": 3.1, "end": 5.8, "text": "two"}]
    pic = g["shots"][1].get("frame")
    r = v.recut(kit, "t", [[0, 3], [3, 4.5], [4.5, 6], [6, 9]], [0, 1, 1, 2], rows, "[verse]\none\ntwo")
    sh = r["shots"]
    check("a shot cut in two: both pieces its scene, the second a copy of its picture, the words read again",
          len(sh) == 4 and sh[1]["scene"] == g["shots"][1]["scene"] == sh[2]["scene"] and sh[1].get("frame") == pic and sh[2].get("frame") not in (None, pic)
          and (kit / "user/videos/t.frames" / sh[2]["frame"]).is_file() and sh[1]["words"] == "two" and sh[2]["words"] == "" and sh[0]["words"] == "one",
          [(s["t0"], s["t1"], s.get("frame"), s["words"]) for s in sh])
    r = v.recut(kit, "t", [[0, 4.5], [4.5, 9]], [0, 2], rows, "")
    check("two joined and an edit point moved: the first keeps its own, the other's picture put off, kept", len(r["shots"]) == 2 and r["shots"][0]["t1"] == 4.5
          and (kit / "user/videos/t.frames/off" / pic).is_file(), [(s["t0"], s["t1"], s.get("frame")) for s in r["shots"]])
    for bad_cut in ([[0, 4], [4.2, 9]], [[0, 9.5]], [[0.3, 9]]):
        try:
            v.recut(kit, "t", bad_cut, [0] * len(bad_cut), rows, ""); bad = None
        except ValueError as e:
            bad = str(e)
        check(f"refused: {bad_cut}", bool(bad), bad)
    u = v.recut_undo(kit, "t")
    check("undo: the four shots back, the picture put off brought back", len(u["shots"]) == 4 and (kit / "user/videos/t.frames" / pic).is_file())
    u = v.recut_undo(kit, "t")
    check("undo again: the plan as it was before the edits", [(s["t0"], s["t1"]) for s in u["shots"]] == [(s["t0"], s["t1"]) for s in g["shots"]])
    print("a shot's own video (1868)")
    import h3_shots  # noqa: E402
    g = v.get(kit, "t")
    sd = v.shots_dir(kit, "t"); sd.mkdir(exist_ok=True)
    vid = sd / "20261029-140000-000-001.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=832x480:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(vid)], check=True)
    job = {"name": "t", "i": 1, "t0": g["shots"][1]["t0"], "t1": g["shots"][1]["t1"], "out": str(vid), "mode": "draft", "steps": 8, "seed": 5}
    r = v.shot_video_set(kit, "t", job)
    check("a worker's video set into its shot, its first frame beside it", r["shots"][1].get("video") == vid.name and vid.with_suffix(".jpg").is_file()
          and r["shots"][1]["video_from"]["model"] == "MiniMax H3", r["shots"][1])
    try:
        v.shot_video_set(kit, "t", dict(job, t0=99, t1=100)); bad = None
    except v.Moved as e:
        bad = str(e)
    check("a video for times no shot has any more: aside, not set", bad == "the shot's times changed", bad)
    r = v.clip(kit, "t", audio, None, {}, {"shot": "What is seen"})
    dur = float((probe(v.clip_path(kit, "t"), "format=duration") or ["0"])[0])
    check("the clip takes the live shot (a 2 s video held to its 3 s), the song's length kept", r["live"] == 1 and abs(dur - 9) < 0.2, (r, dur))
    w = h3_shots.ready(kit)
    check("H3's readiness said, the missing named", w["ready"] is False and any("minimax-h3" in m for m in w["missing"]), w)
    print("the mini library (1861)")
    row = (v.listing(kit)["plans"] or [{}])[0]
    check("the listing says each plan's clip, animatic, pictures and length", row.get("name") == "t" and row.get("clip", {}).get("exists") and row.get("animatic", {}).get("exists")
          and [f["i"] for f in row.get("frames", [])] == [1] and row.get("seconds") == 9, row)
finally:
    shutil.rmtree(kit, ignore_errors=True)

print("the Remaster's new Colours")
import debunker as db  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
w = Path(tempfile.mkdtemp(prefix="claude-col-"))
try:
    src = w / "s.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.3:seed=3:d=6", "-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.3:seed=4:d=6",
                    "-filter_complex", "[0:a][1:a]amerge=inputs=2,volume=-6dB", "-ar", "48000", str(src)], check=True)   # two sides of their own: a true stereo
    x, sr = sf.read(src)
    lows = lambda y: float(np.sum(np.abs(np.fft.rfft(y.mean(axis=1))[: int(200 * len(y) / sr)]) ** 2))
    for kind in ("cassette", "radio", "hall"):
        o = w / f"{kind}.wav"
        ok = db.apply_colour(str(src), str(o), kind, -36.0, 48000, 5)
        y, _ = sf.read(o) if o.is_file() else (np.zeros((1, 2)), sr)
        corr = float(np.corrcoef(y[:, 0], y[:, 1])[0, 1]) if len(y) > 10 else 0
        if kind == "radio":
            check("radio: made, mono, its lows under 300 Hz mostly gone", ok and corr > 0.999 and lows(y) < 0.2 * lows(x), (ok, round(corr, 4), lows(y) / lows(x)))
        else:
            check(f"{kind}: made, as long as the song, still stereo", ok and abs(len(y) - len(x)) < 10 and abs(corr) < 0.5, (ok, len(y), len(x), round(corr, 4)))
finally:
    shutil.rmtree(w, ignore_errors=True)

print(f"\ntest_videographer  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
