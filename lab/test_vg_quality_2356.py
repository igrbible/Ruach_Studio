#!/usr/bin/env python3
"""HERESY 2356 (Viktor 10.11.2026: «Видеографа лечи так, как качественнее, а не быстрее»): the Videographer's quality defaults on a studio of their
own in a temporary folder (never this Studio's), the processor only:
  the plan's shots at most one H3 pass at 1280 × 704 (124 frames, 5.17 s), a sung line never cut by a short neighbour; split_long on a plan of
  before (pieces of one pass, the first with its picture and video, the others with the scene and no picture; one step of the history);
  the places kept (slices by default, one when chosen) and the hero's words and skin saved;
  H3: the draft at 1280 × 704, «fast» at 832 × 480, the one-pass rule (a shot a little past one pass asks for one pass, a longer one for more);
  the hero's own words read from a prompt, his skin from his words; the Skin Detailer left out when he has none;
  the clip at 24 fps, Lanczos by default (a SeedVR2 upscale taken only when asked), a video a little short of its shot stretched to it, the weave
  at most 0.3, the settings beside the clip and in its metadata; SeedVR2's batches overlapping (45 and 4 frames for 7B sharp and 3B).
  .venv/bin/python lab/test_vg_quality_2356.py"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as v  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
bad = []


def check(name, ok, detail=""):
    print(f"  {G + 'ok  ' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))
    if not ok:
        bad.append(name)


def probe(f, entries):
    return subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "json", str(f)], capture_output=True,
                          text=True).stdout


kit = Path(tempfile.mkdtemp(prefix="vq2356-"))
try:
    print("the plan's shots")
    rows, t = [], 0.0
    import random
    rnd = random.Random(7)
    for k in range(80):
        a = t + rnd.uniform(0.1, 2.6)
        b = a + rnd.uniform(0.6, 7.5)
        rows.append({"start": a, "end": b, "text": f"w{k}"})
        t = b
    sh = v.shots(rows, t + 7)
    check("no shot longer than one H3 pass at 704p (5.17 s)", max(s["t1"] - s["t0"] for s in sh) <= v.PASS_S + 0.011, max(s["t1"] - s["t0"] for s in sh))
    check("back to back to the end (the first from where the singing starts, as before)", sh[0]["t0"] < v.GAP and all(abs(x["t1"] - y["t0"]) < 1e-6 for x, y in zip(sh, sh[1:])) and abs(sh[-1]["t1"] - (t + 7)) < 0.02)
    sh = v.shots([{"start": 0.0, "end": 4.13, "text": "a"}, {"start": 6.2, "end": 10.13, "text": "b"}], 12)
    check("a sung line is not cut by the short music after it (it stays a short shot of its own)", [(s["t0"], s["t1"]) for s in sh][:2] == [(0.0, 4.13), (4.13, 6.2)],
          [(s["t0"], s["t1"]) for s in sh])

    print("split_long on a plan of before")
    name = "t"
    (kit / "user/videos").mkdir(parents=True)
    plan = {"name": name, "title": "a test", "seconds": 18.5, "look": {}, "shots": [
        {"t0": 0.0, "t1": 5.5, "words": "a", "section": "verse", "sung": True, "scene": {"shot": "s0"}},
        {"t0": 5.5, "t1": 16.0, "words": "b", "section": "verse", "sung": True, "scene": {"shot": "s1", "camera": "close"}, "move": "left", "hero": True},
        {"t0": 16.0, "t1": 18.5, "words": "", "section": "outro", "sung": False, "scene": {"shot": "s2"}}]}
    v._write(kit, name, plan)
    from PIL import Image
    pic = kit / "p.jpg"
    Image.new("RGB", (64, 36), (200, 40, 40)).save(pic)
    v.frame_set(kit, name, 1, pic, "disk")
    q = v.split_long(kit, name)
    ts = [(s["t0"], s["t1"]) for s in q["shots"]]
    check("5.5 s kept (one pass, stretched); 10.5 s cut into three of 3.5 s; the outro kept", ts == [(0.0, 5.5), (5.5, 9.0), (9.0, 12.5), (12.5, 16.0), (16.0, 18.5)], ts)
    p1, p2 = q["shots"][1], q["shots"][2]
    check("the first piece keeps its picture; the others its scene, move and hero, and no picture", p1.get("frame") and not p2.get("frame")
          and p2["scene"]["camera"] == "close" and p2.get("move") == "left" and p2.get("hero") is True and q["split"] == 1, q["shots"][1:3])
    check("one step of the history, named", (q.get("undo") or [{}])[-1].get("what") == "split-long")
    check("a plan with nothing long: nothing changed", v.split_long(kit, name)["split"] == 0)

    print("the places, the hero's words and skin")
    p = v.get(kit, name)
    p["hero"] = {"run": "h", "file": "01.png", "words": "a wooden boy"}
    p.pop("exists")
    v._write(kit, name, p)
    check("the places: none said, none kept (the page's default is slices)", "places" not in v.get(kit, name))
    q = v.save(kit, name, {"places": "one"})
    check("«one» kept, a step of the history", q.get("places") == "one" and q["undo"][-1]["what"] == "edit")
    q = v.save(kit, name, {"places": "odd"})
    check("an unknown value left out", q.get("places") == "one")
    n = len(v.get(kit, name).get("undo") or [])
    q = v.save(kit, name, {"hero_words": "  Buratino,   a long  sharp nose ", "hero_human": False})
    check("the hero's words (spaces tidied) and his skin kept, no step of the history", q["hero"]["words"] == "Buratino, a long sharp nose" and q["hero"]["human"] is False
          and len(q.get("undo") or []) == n, q.get("hero"))
    q = v.save(kit, name, {"hero_human": None})
    check("his skin back to his words' say (null)", "human" not in q["hero"], q["hero"])

    print("the hero's own words and skin (frames_job)")
    import types
    sys.modules.setdefault("artist", types.ModuleType("artist"))
    import frames_job as fj
    hp = ("Buratino, a life-sized boy puppet carved from rough pine wood, a long sharp wooden nose, a red-and-white striped knit cap, a coarse linen "
          "shirt, the wood grain and the joints of his arms visible, no strings, a defiant grin, standing in Carlo's tiny cupboard workshop under the "
          "stairs, sawdust and carving tools, a single candle, amber light and deep shadows, gritty film photograph, grain, a still frame of a music video, no text.")
    w = fj.hero_words(hp)
    check("Buratino's words up to «standing in…» (the grain of his wood kept)", w.endswith("a defiant grin") and "wood grain" in w and "workshop" not in w, w)
    check("a man in a bar: up to «in a smoky bar»", fj.hero_words("A bearded man in his forties with grey eyes, a black leather jacket, in a smoky bar, cinematic photo")
          == "A bearded man in his forties with grey eyes, a black leather jacket")
    check("a lead of the Videographer's own taken off first", fj.hero_words(fj.EDIT_LEAD + "a girl with red hair, at the sea") == "a girl with red hair")
    check("wood: no person's skin; a man: a person's; chosen: as chosen", fj.human({"words": w}) is False and fj.human({"words": "a bearded man"}) is True
          and fj.human({"words": w, "human": True}) is True)
    import paths   # HERESY 2330: where the weights live
    real = paths.at(paths.ARTIST_LORAS, kit) / "qwen-image-2512/PUBLIC"
    real.mkdir(parents=True)
    for i, _ in fj.REAL:
        (paths.at(paths.ARTIST_LORAS, kit) / i).write_bytes(b"x")
    check("the Skin Detailer left out without a person's skin, the film kept", [x["id"] for x in fj._real(kit, False)] == [fj.REAL[1][0]]
          and len(fj._real(kit, True)) == 2)

    p = v.get(kit, name)
    p["hero"] = {"run": "h", "file": "01.png"}
    p.pop("exists")
    v._write(kit, name, p)
    q = fj.hero_fill(kit, name)
    check("a hero of before 2356 gets his words once (none readable here: an empty line, asked once)", q["hero"].get("words") == "" and fj.hero_fill(kit, name)["hero"]["words"] == "", q["hero"])

    print("MiniMax H3: the draft at 1280 × 704, one pass")
    import h3_shots as h
    check("one pass: 124 frames at 1280 × 704, 277 at 832 × 480", h.pass_frames(1280, 704) == 124 and h.pass_frames(832, 480) == 277)
    check("the draft 1280 × 704, «fast» 832 × 480, final 1280 × 704 too (HERESY 2361); each its room", h.SIZES["draft"]["16:9"] == (1280, 704) and h.SIZES["fast"]["16:9"] == (832, 480)
          and h.SIZES["final"]["16:9"] == (1280, 704)
          and h.MODES["fast"]["steps"] == 8 and h.need_mb("draft") > h.need_mb("fast"))
    paths.at(paths.VIDEO_H3, kit).mkdir(parents=True)
    h.ready = lambda k: {"ready": True, "missing": []}
    p = v.get(kit, name)
    p["shots"] = [{"t0": 0.0, "t1": 5.5, "scene": {}}, {"t0": 5.5, "t1": 12.0, "scene": {}}, {"t0": 12.0, "t1": 18.5, "scene": {}}]
    p.pop("exists")
    v._write(kit, name, p)
    sp = kit / "user/videos/.h3/gpu0-h3"
    sp.mkdir(parents=True)
    import os
    import time
    (sp / "worker.json").write_text(json.dumps({"status": "ready", "pid": os.getpid(), "gpu": 0, "at": time.time()}))
    j0 = h.shoot(kit, name, 0, "a prompt", "draft")
    j1 = h.shoot(kit, name, 1, "a prompt", "draft")
    j2 = h.shoot(kit, name, 1, "a prompt", "fast")
    check("5.5 s at 704p asks for one pass (124 frames); 6.5 s for more; at 480p one pass holds it", j0.get("frames") == 124 and j0["width"] == 1280
          and "frames" not in j1 and j2["width"] == 832 and "frames" not in j2, (j0.get("frames"), j1.get("frames"), j2.get("frames")))
    try:
        h.shoot(kit, name, 0, "a prompt", "slow")
        check("an unknown mode refused", False)
    except ValueError as e:
        check("an unknown mode refused, said", "fast" in str(e), e)

    print("the clip: 24 fps, Lanczos, the stretch, the weave, its settings")
    audio = kit / "a.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=18.5", str(audio)], check=True)
    p = v.get(kit, name)
    p["shots"] = [{"t0": 0.0, "t1": 5.5, "scene": {}}, {"t0": 5.5, "t1": 18.5, "scene": {}}]
    p.pop("exists")
    v._write(kit, name, p)
    sd = v.shots_dir(kit, name)
    sd.mkdir(parents=True)
    vid, up = sd / "20261111-010101-000-000.mp4", sd / "20261111-010101-000-000-up1080.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x176:r=24:d=5.1667", "-pix_fmt", "yuv420p", str(vid)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=640x352:r=24:d=5.1667", "-pix_fmt", "yuv420p", str(up)], check=True)
    p = v.get(kit, name)
    p["shots"][0].update(video=vid.name, video_up=up.name)
    p.pop("exists")
    v._write(kit, name, p)
    r = v.clip(kit, name, audio, None, {}, {}, draft=True, jitter=0.9)
    f = v.clip_path(kit, name, draft=True)
    fr = json.loads(probe(f, "stream=r_frame_rate,nb_frames"))["streams"][0]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "2.0", "-i", str(f), "-frames:v", "1", "-vf", "scale=4:4", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True).stdout
    check("24 fps, the song's length in frames", fr["r_frame_rate"] == "24/1" and abs(int(fr["nb_frames"]) - round(18.5 * 24)) <= 1, fr)
    check("Lanczos by default: H3's own video (red), not SeedVR2's (blue)", raw[0] > 150 and raw[2] < 80, list(raw[:3]))
    st = json.loads(v.settings_path(f).read_text(encoding="utf-8"))
    vu = (st.get("videos") or [{}])[0]
    check("the 5.17 s video stretched to its 5.5 s shot (×1.064)", abs(vu.get("stretch", 0) - 5.5 / (124 / 24)) < 0.01, vu)
    check("the weave held to 0.3; the settings beside the clip, as clip_info reads them", st["film"]["jitter"] == 0.3 and st["fps"] == 24 and st["upscale"] == "lanczos"
          and v.clip_info(kit, name, draft=True)["settings"]["film"]["jitter"] == 0.3 and r["film"]["jitter"] == 0.3, st)
    tags = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=comment", "-of", "json", str(f)], capture_output=True,
                                     text=True).stdout).get("format", {}).get("tags", {})
    check("and in the clip's own metadata", json.loads(tags.get("comment") or "{}").get("upscale") == "lanczos", tags)
    v.clip(kit, name, audio, None, {}, {}, draft=True, upscale="seedvr2")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "2.0", "-i", str(f), "-frames:v", "1", "-vf", "scale=4:4", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True).stdout
    check("SeedVR2 when asked: its upscale (blue)", raw[2] > 150 and raw[0] < 80, list(raw[:3]))
    check("no settings file among the plans", [x["name"] for x in v.listing(kit)["plans"]] == [name])
    try:
        v.clip(kit, name, audio, None, {}, {}, draft=True, upscale="esrgan")
        check("an unknown upscale refused", False)
    except ValueError:
        check("an unknown upscale refused", True)

    print("SeedVR2: batches overlapping")
    import upscale_shots as us
    check("7B sharp and 3B in batches of 45, fp8 of 21; 4 frames of overlap; a batch of 45 asks for the whole card", us.MODELS["7b"]["batch"] == 45
          and us.MODELS["3b"]["batch"] == 45 and us.MODELS["7b-fp8"]["batch"] == 21 and us.OVERLAP == 4 and us.need_mb(1080, "7b") > us.need_mb(1080, "7b-fp8"))
    src = (Path(__file__).resolve().parent / "upscale_job.py").read_text(encoding="utf-8")
    check("the job runs SeedVR2 with its batch and the overlap (a job of before: 21, 16 blocks)", '"--temporal_overlap"' in src and 'job.get("batch") or 21' in src)
finally:
    shutil.rmtree(kit, ignore_errors=True)
print("test_vg_quality_2356  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
