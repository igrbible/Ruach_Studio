"""HERESY 1824 (Viktor 28.10.2026: «Я помню Видеографа на примере Maestro репо + воркфлоу китайца… можно закодить и LLM интеракцию в создании видео
роликов + hyperframes»; «Пишем своим кодом то, что берём из Maestro»; «Именно MiniMax H3… Уведомление о лицензии и ограничениях по странам - в
предупреждение в видеографе, и не более»): the Videographer's plan of a take, before any picture is made.

A take's song cut into shots of at most 12 s at the boundaries of its sung lines (its Whisper timing; a line longer than that cut between its words),
what is not sung in shots of at most 8 s, each shot with its section and words; the look of the whole clip (who is in it, where, its colours) and each
shot's scene (the shot, the camera, the motion, the light), written by the Writer in the page and kept here. user/videos/NAME.json, one plan a take.
The pictures and the moving shots come later (MiniMax H3, when a card is free); this is what they will be made from.
"""
import json
import re
import subprocess
import time
import zipfile                                     # HERESY 1946
from pathlib import Path

MAX_SUNG, MAX_BARE, MIN_SHOT, GAP = 12.0, 8.0, 2.5, 2.0
SCENE_KEYS = ("shot", "camera", "motion", "light")
LOOK_KEYS = ("characters", "setting", "palette", "notes")


def _dir(kit):
    d = Path(kit) / "user" / "videos"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _file(kit, name):
    if not re.fullmatch(r"[\w.-]{1,160}", name or ""):
        raise ValueError("no such take")
    return _dir(kit) / (name + ".json")


def sections_of(lyrics):
    """Each sung line's section, in order ([Verse], [Chorus]…; before any tag, the song's start)."""
    out, tag = [], "intro"
    for line in (lyrics or "").splitlines():
        s = line.strip()
        if not s:
            continue
        m = re.fullmatch(r"\[([^\]]+)\]", s)
        if m:
            tag = m.group(1).strip().lower()
            continue
        out.append(tag)
    return out


def _split(a, b, most):
    """[a, b] in equal pieces of at most `most` seconds."""
    n = max(1, int((b - a) / most + 0.999))
    step = (b - a) / n
    return [(a + i * step, a + (i + 1) * step) for i in range(n)]


def shots(rows, seconds, sections=None):
    """The shots of a take: [{t0, t1, words, section, sung}], back to back from 0 to its end."""
    rows = sorted((r for r in rows or [] if r.get("end") is not None and r.get("start") is not None), key=lambda r: r["start"])
    secs = sections or []
    out, at = [], 0.0

    def bare(a, b, where):
        for x, y in _split(a, b, MAX_BARE):
            if y - x > 0.05:
                out.append({"t0": x, "t1": y, "words": "", "section": where, "sung": False})

    group = []

    def flush():
        if not group:
            return
        a, b = group[0]["start"], group[-1]["end"]
        out.append({"t0": a, "t1": b, "words": " / ".join(g["text"] for g in group), "section": group[0]["_sec"], "sung": True})
        group.clear()

    for i, r in enumerate(rows):
        r = dict(r, _sec=secs[i] if i < len(secs) else "")
        start, end = max(at, float(r["start"])), float(r["end"])
        if end <= start:
            continue
        r["start"] = start
        last_end = group[-1]["end"] if group else (out[-1]["t1"] if out else 0.0)
        if start - last_end >= GAP:                     # a pause: what is not sung gets shots of its own
            flush()
            bare(last_end, start, "intro" if not out else "instrumental")
        elif group and start > group[-1]["end"]:
            group[-1]["end"] = start                    # a short breath belongs to the line before
        if end - start > MAX_SUNG:                      # a long line cut between its words
            flush()
            words, times = r["text"].split(), [t for t in (r.get("tt") or []) if t]
            cuts = _split(start, end, MAX_SUNG)
            for x, y in cuts:
                part = [w for w, t in zip(words, r.get("tt") or []) if t and x <= t[0] < y] if times else []
                out.append({"t0": x, "t1": y, "words": " ".join(part) or r["text"], "section": r["_sec"], "sung": True})
            at = end
            continue
        if group and (end - group[0]["start"] > MAX_SUNG or r["_sec"] != group[0]["_sec"]):
            flush()
        group.append(r)
        at = end
    flush()
    end = float(seconds or (out[-1]["t1"] if out else 0))
    last = out[-1]["t1"] if out else 0.0
    if end - last > 0.05:
        bare(last, end, "outro")
    # back to back, none shorter than MIN_SHOT (a short one joins its neighbour)
    for i in range(1, len(out)):
        out[i]["t0"] = out[i - 1]["t1"]
    merged = []
    for s in out:
        if merged and s["t1"] - s["t0"] < MIN_SHOT and merged[-1]["t1"] - merged[-1]["t0"] + s["t1"] - s["t0"] <= MAX_SUNG + MIN_SHOT:
            m = merged[-1]
            m["t1"] = s["t1"]
            m["words"] = " / ".join(w for w in (m["words"], s["words"]) if w)
            m["sung"] = m["sung"] or s["sung"]
            continue
        merged.append(dict(s))
    if len(merged) > 1 and merged[0]["t1"] - merged[0]["t0"] < MIN_SHOT:
        merged[1]["t0"] = merged[0]["t0"]
        merged[1]["words"] = " / ".join(w for w in (merged[0]["words"], merged[1]["words"]) if w)
        merged.pop(0)
    for s in merged:
        s["t0"], s["t1"] = round(s["t0"], 2), round(s["t1"], 2)
    return merged


def get(kit, name):
    f = _file(kit, name)
    if not f.is_file():
        return {"name": name, "exists": False}
    return _auto(dict(json.load(open(f, encoding="utf-8")), exists=True))   # HERESY 1844: each shot's move without a choice


def make(kit, name, meta, request, timing_rows):
    """A take's plan made again from its timing; scenes already written for the same shot times are kept."""
    old = get(kit, name)
    key = lambda s: tuple(s.get("as_sung") or (s["t0"], s["t1"]))   # noqa: E731   HERESY 1947: a shot moved onto a beat found by its times as sung
    keep = {key(s): s.get("scene") for s in old.get("shots", [])} if old.get("exists") else {}
    pics = {key(s): {k: s[k] for k in ("frame", "frame_from", "frame_wh", "move", "hero") if k in s} for s in old.get("shots", [])} if old.get("exists") else {}   # 1844: its move; 1913: its hero
    cut = shots(timing_rows, meta.get("seconds"), sections_of(request.get("lyrics", "")))
    for s in cut:
        s["scene"] = keep.get((s["t0"], s["t1"])) or {k: "" for k in SCENE_KEYS}
        s.update(pics.get((s["t0"], s["t1"])) or {})                    # HERESY 1838: its own picture kept too
    plan = {"name": name, "title": meta.get("title") or name, "style": request.get("style", ""), "seconds": round(float(meta.get("seconds") or 0), 2),
            "made": time.time(), "look": old.get("look") or {k: "" for k in LOOK_KEYS}, "shots": cut, "model": "MiniMax H3"}
    plan.update({k: old[k] for k in ("hero", "brief", "seed") if old.get(k)})   # HERESY 1913: the clip's hero, its brief and its seed stay
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def save(kit, name, data):
    """The look and the scenes as the page edited them (the shot times stay the plan's)."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet")
    look = data.get("look") or {}
    plan["look"] = {k: str(look.get(k, plan["look"].get(k, "")))[:2000] for k in LOOK_KEYS}
    scenes = data.get("scenes") or []
    for i, s in enumerate(plan["shots"]):
        if i < len(scenes) and isinstance(scenes[i], dict):
            s["scene"] = {k: str(scenes[i].get(k, ""))[:600] for k in SCENE_KEYS}
    if "brief" in data:                                  # HERESY 1913: the clip's idea in a line or a few, the Writer's start
        plan["brief"] = str(data.get("brief") or "")[:2000]
    for k, most in (("clip_title", 200), ("credits", 1000)):   # HERESY 1948: the clip's titles, his to write
        if k in data:
            plan[k] = str(data.get(k) or "")[:most]
    heroes = data.get("heroes")                          # HERESY 1913: whether the hero is in each shot (null: as the page decides, the sung ones)
    if isinstance(heroes, list):
        for i, s in enumerate(plan["shots"]):
            if i < len(heroes) and isinstance(heroes[i], bool):
                s["hero"] = heroes[i]
            elif i < len(heroes):
                s.pop("hero", None)
    moves = data.get("moves")                            # HERESY 1844: the moves chosen («» for the camera's own)
    if isinstance(moves, list):
        for i, s in enumerate(plan["shots"]):
            if i < len(moves) and moves[i] in MOVES + ("still",):
                s["move"] = moves[i]
            elif i < len(moves):
                s.pop("move", None)
    plan["edited"] = time.time()
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def listing(kit):
    out = []
    for f in sorted(_dir(kit).glob("*.json"), key=lambda p: -p.stat().st_mtime):
        try:
            p = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        name = p.get("name")
        try:                                              # HERESY 1861: the mini library's row: its films and its pictures
            films = {"clip": clip_info(kit, name), "animatic": animatic_info(kit, name)}
        except (ValueError, OSError):
            films = {}
        out.append(dict({"name": name, "title": p.get("title"), "shots": len(p.get("shots", [])), "videos": sum(1 for s in p.get("shots", []) if s.get("video")),
                         "written": sum(1 for s in p.get("shots", []) if any((s.get("scene") or {}).values())), "made": p.get("made"), "seconds": p.get("seconds"),
                         "frames": [{"i": i, "f": s["frame"]} for i, s in enumerate(p.get("shots", [])) if s.get("frame")]}, **films))
    return {"plans": out}


def _write(kit, name, plan):
    f = _file(kit, name)
    tmp = f.with_suffix(".json.part")
    plan = dict(plan, shots=[{k: v for k, v in s.items() if k != "auto"} for s in plan.get("shots", [])])   # HERESY 1844: «auto» is worked out, not kept
    json.dump(plan, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    tmp.replace(f)


# ---- HERESY 1837 (Viktor 28.10.2026: «Не забудь про Видеографа 🎥. Начаток уже есть, и это радует»): the plan seen in the song's own time before
# any picture is made: an animatic. A frame a shot (its number, time and section, its words, its scene) over the take's cover blurred and darkened,
# shown for the shot's length, with the take's own sound: user/videos/NAME.animatic.mp4. Pillow draws the frames, ffmpeg joins them (the processor
# alone, no picture model). DejaVu writes Latin, Cyrillic and Greek; Japanese and Chinese words wait for a font that has them
import shutil
import subprocess

AW, AH = 1280, 720
FONTS = ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")


def _font(bold, size):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(FONTS[1 if bold else 0], size)
    except OSError:
        return ImageFont.load_default()


def _clock(t):
    m = int(t // 60)
    return f"{m}:{t - 60 * m:04.1f}"


def _wrap(draw, text, font, width, most):
    words, out, line = str(text or "").split(), [], ""
    for w in words:
        t = (line + " " + w).strip()
        if draw.textlength(t, font=font) <= width:
            line = t
            continue
        if line:
            out.append(line)
        line = w
        if len(out) == most:
            break
    if line and len(out) < most:
        out.append(line)
    if len(out) == most and " ".join(out) != " ".join(words):
        out[-1] = out[-1].rstrip(".,;:") + " …"
    return out


def _ground(cover, light=0.36, blur=14):
    from PIL import Image, ImageEnhance, ImageFilter
    if cover and Path(cover).is_file():
        im = Image.open(cover).convert("RGB")
        r = max(AW / im.width, AH / im.height)
        im = im.resize((int(im.width * r) + 1, int(im.height * r) + 1))
        x, y = (im.width - AW) // 2, (im.height - AH) // 2
        return ImageEnhance.Brightness(im.crop((x, y, x + AW, y + AH)).filter(ImageFilter.GaussianBlur(blur))).enhance(light)
    return Image.new("RGB", (AW, AH), (22, 18, 15))


def _frame(ground, i, n, shot, title, labels):
    from PIL import ImageDraw
    im = ground.copy()
    d = ImageDraw.Draw(im)
    small, big, mid = _font(False, 26), _font(True, 50), _font(False, 24)
    d.text((48, 36), f"{i + 1} / {n}   ·   {_clock(shot['t0'])} – {_clock(shot['t1'])}   ·   {str(shot.get('section') or '').upper()}", font=small, fill=(222, 196, 160))
    y = 150
    for line in _wrap(d, shot.get("words") or "♪", big, AW - 96, 3):
        d.text((48, y), line, font=big, fill=(255, 255, 255))
        y += 64
    y = max(y + 28, 380)
    scene = shot.get("scene") or {}
    for k in SCENE_KEYS:
        if not scene.get(k):
            continue
        for line in _wrap(d, f"{labels.get(k) or k}: {scene[k]}", mid, AW - 96, 2):
            if y > AH - 80:
                break
            d.text((48, y), line, font=mid, fill=(228, 222, 212))
            y += 32
    d.text((48, AH - 50), str(title or ""), font=small, fill=(170, 160, 150))
    return im


def animatic_path(kit, name):
    return _file(kit, name).with_name(name + ".animatic.mp4")


def animatic_info(kit, name):
    f = animatic_path(kit, name)
    if not f.is_file():
        return {"name": name, "exists": False}
    st = f.stat()
    return {"name": name, "exists": True, "made": st.st_mtime, "bytes": st.st_size}


def animatic(kit, name, audio, cover=None, labels=None, job=None):
    """The take's plan as an MP4 in its own time and with its own sound; {file, shots, seconds}."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    shots, labels = plan["shots"], labels or {}
    out = animatic_path(kit, name)
    tmp = out.with_name(name + ".animatic.part")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    ground, lines, grounds = _ground(cover), [], {}
    for i, s in enumerate(shots):
        f = f"{i:04d}.png"
        g = ground
        if s.get("frame"):                               # HERESY 1847: a shot's own picture under its words, seen (less blurred, less dark)
            try:
                p = frame_path(kit, name, s["frame"])
                g = grounds.get(str(p)) or grounds.setdefault(str(p), _ground(p, 0.55, 4))
            except (OSError, ValueError):
                g = ground
        _frame(g, i, len(shots), s, plan.get("title") or name, labels).save(tmp / f)
        lines += [f"file '{f}'", f"duration {max(0.04, s['t1'] - s['t0']):.3f}"]
        if job is not None:
            job["progress"] = round(0.4 * (i + 1) / len(shots), 3)
    lines.append(f"file '{f}'")                          # the concat demuxer reads the last duration only with its file again
    (tmp / "list.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", str(audio), "-map", "0:v", "-map", "1:a",
                        "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-crf", "24", "-r", "25", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", "out.mp4"],
                       cwd=str(tmp), capture_output=True, text=True, timeout=1800)
    if p.returncode != 0 or not (tmp / "out.mp4").is_file():
        raise RuntimeError("ffmpeg: " + (p.stderr.strip()[-300:] or "no output"))
    (tmp / "out.mp4").replace(out)
    shutil.rmtree(tmp, ignore_errors=True)
    if job is not None:
        job["progress"] = 1.0
    return {"file": out.name, "shots": len(shots), "seconds": plan.get("seconds")}



# ---- HERESY 1838 (Viktor 28.10.2026: «Не забудь про Видеографа 🎥»; MorningDAW's «Bounce to picture», taken as a thought): a picture of its own for
# each shot (one of the Artist's, or one from the disk) and the clip cut from them in the song's own time, with the take's sound:
# user/videos/NAME.clip.mp4, 1920 × 1080. Each shot moves slowly as its scene's camera says (a push-in, a pull-back, a pan; still when it is locked
# off), else in turn; a shot without a picture of its own shows the take's cover, whole over itself blurred. The cuts fall where the shots begin,
# that is on the sung lines. Pillow readies the pictures, ffmpeg moves and joins them: the processor alone, no video model
import io
import os

CW, CH, FPS, DRIFT = 1920, 1080, 25, 0.10
# HERESY 1917 (the plan's phase A, «форматы 16:9, 9:16 и 1:1 из одного плана»): the clip's shapes, each a file of its own beside the wide one
SHAPES = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}
SUFFIX = {"16:9": "", "9:16": "-9x16", "1:1": "-1x1"}
FRAME_RE = re.compile(r"\d{8}-\d{6}-\d{3}-\d{3}\.jpg")
MOVES = ("in", "right", "out", "left")
MOVE_WORDS = (("out", r"pull(?:s|ing)? (?:back|out)|zoom(?:s|ing)? out|dolly(?:ing)? (?:back|out)|widen"),
              ("in", r"push(?:es|ing)?[- ]in|zoom(?:s|ing)? in|dolly(?:ing)? in|mov(?:es|ing) in|clos(?:es|ing) in|creep"),
              ("left", r"pan(?:s|ning)? (?:to the )?left|track(?:s|ing)? left|truck(?:s|ing)? left"),
              ("right", r"pan(?:s|ning)? (?:to the )?right|track(?:s|ing)? right|truck(?:s|ing)? right"),
              ("still", r"static|locked|tripod|still camera|fixed camera"))


def frames_dir(kit, name):
    return _file(kit, name).with_name(name + ".frames")


def frame_path(kit, name, f):
    if not FRAME_RE.fullmatch(str(f or "")):
        raise ValueError("no such picture")
    p = frames_dir(kit, name) / f
    if not p.is_file():
        raise FileNotFoundError("no such picture")
    return p


def _shot_of(plan, i):
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    if not isinstance(i, int) or not 0 <= i < len(plan["shots"]):
        raise ValueError("no such shot")
    return plan["shots"][i]


def _put_off(kit, name, f):
    """A shot's picture taken off or replaced goes to NAME.frames/off/: kept, never deleted."""
    if f and FRAME_RE.fullmatch(f):
        p = frames_dir(kit, name) / f
        if p.is_file():
            (p.parent / "off").mkdir(exist_ok=True)
            p.replace(p.parent / "off" / f)


def frame_set(kit, name, i, src, origin):
    """A picture for shot i (a path, or an image's bytes): kept as a JPEG of at most 3840 px in NAME.frames/, the one it replaces put off."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    plan = get(kit, name)
    shot = _shot_of(plan, i)
    if isinstance(src, (bytes, bytearray)) and len(src) > 64 * 1024 * 1024:
        raise ValueError("a picture of up to 64 MB, please")
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(src) if isinstance(src, (bytes, bytearray)) else src)).convert("RGB")
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError(f"not a picture the studio can read ({e})")
    im.thumbnail((3840, 3840))
    d = frames_dir(kit, name)
    d.mkdir(parents=True, exist_ok=True)
    now = time.time()
    f = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + f"-{int(now * 1000) % 1000:03d}-{i:03d}.jpg"
    im.save(d / f, quality=92)
    _put_off(kit, name, shot.get("frame"))
    shot.update(frame=f, frame_from=origin, frame_wh=[im.width, im.height])
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def frame_off(kit, name, i):
    plan = get(kit, name)
    shot = _shot_of(plan, i)
    _put_off(kit, name, shot.pop("frame", None))
    shot.pop("frame_from", None)
    shot.pop("frame_wh", None)
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def move_of(shot, i):
    """How the shot moves: as chosen for it (1844), else as its scene's camera and motion say, else in turn (in, right, out, left)."""
    if shot.get("move") in MOVES + ("still",):
        return shot["move"]
    return auto_move(shot, i)


def _auto(plan):
    """HERESY 1844: each shot's move as the clip takes it without a choice, for the page to say."""
    for i, s in enumerate(plan.get("shots") or []):
        s["auto"] = auto_move(s, i)
    return plan


def auto_move(shot, i):
    """The move without a choice: as the scene's camera and motion say, else in turn."""
    sc = shot.get("scene") or {}
    words = (str(sc.get("camera") or "") + " " + str(sc.get("motion") or "")).lower()
    for move, pat in MOVE_WORDS:
        if re.search(pat, words):
            return move
    return MOVES[i % len(MOVES)]


def _move(move, n, w=CW, h=CH):
    t, mid_x, mid_y = f"on/{max(1, n - 1)}", "(iw-iw/zoom)/2", "(ih-ih/zoom)/2"
    z, x, y = {"in": (f"1+{DRIFT}*{t}", mid_x, mid_y), "out": (f"{1 + DRIFT}-{DRIFT}*{t}", mid_x, mid_y),
               "right": (f"{1 + DRIFT}", f"(iw-iw/zoom)*{t}", mid_y), "left": (f"{1 + DRIFT}", f"(iw-iw/zoom)*(1-{t})", mid_y),
               "still": (f"1+0.02*{t}", mid_x, mid_y)}[move]
    return f"zoompan=z={z}:x={x}:y={y}:d={n}:s={w}x{h}:fps={FPS},format=yuv420p"


def _still(src, out, w=CW, h=CH, fit=False, focus=0.5):
    """A shot's picture at twice the clip's size (the slow move then does not step): one as wide as the clip or wider fills it (HERESY 1917: cut
    across at its focus, 0 the left edge, 1 the right), a narrower one stands whole over itself blurred and darkened (and so does any with fit: a
    card of words is never cut); none, the dark ground."""
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    W, H = 2 * w, 2 * h
    if src is None:
        _ground(None).resize((W, H)).save(out, quality=90)
        return
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    k = max(W / im.width, H / im.height)
    if not fit and im.width / im.height >= 0.84 * W / H:      # 1.5 for the wide clip, as it was
        im = im.resize((max(W, round(im.width * k)), max(H, round(im.height * k))), Image.LANCZOS)
        x, y = round((im.width - W) * min(1.0, max(0.0, float(focus)))), (im.height - H) // 2
        im.crop((x, y, x + W, y + H)).save(out, quality=90)
        return
    small = im.resize((max(W // 8, round(im.width * k / 8)), max(H // 8, round(im.height * k / 8))))
    x, y = (small.width - W // 8) // 2, (small.height - H // 8) // 2
    ground = ImageEnhance.Brightness(small.crop((x, y, x + W // 8, y + H // 8)).filter(ImageFilter.GaussianBlur(6))).enhance(0.42).resize((W, H), Image.BILINEAR)
    s = min(W / im.width, H / im.height)                 # whole: as large as the clip lets it
    fg = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    ground.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    ground.save(out, quality=90)


def clip_path(kit, name, shape="16:9"):
    if shape not in SHAPES:
        raise ValueError("the clip's shape: 16:9, 9:16 or 1:1")
    return _file(kit, name).with_name(name + ".clip" + SUFFIX[shape] + ".mp4")


def clip_info(kit, name, shape="16:9"):
    f = clip_path(kit, name, shape)
    if not f.is_file():
        return {"name": name, "exists": False, "shape": shape}
    st = f.stat()
    return {"name": name, "exists": True, "made": st.st_mtime, "bytes": st.st_size, "shape": shape}


BETWEEN = ("cut", "black", "flash", "dissolve")                   # HERESY 1949: «dissolve»
DIP, FLASH = 0.35, 0.18                                  # HERESY 1916: through black, each side of the cut; a flash of white fading into the shot
MELT = 0.5                                               # HERESY 1949: a dissolve, the next section fading in over the last one's tail


# HERESY 1946: the plan as an editor's project (OpenTimelineIO, CMX3600 EDL, SRT) with its media, one zip beside the plan
EDIT_FPS = 25


def edit_path(kit, name):
    return _file(kit, name).with_name(name + ".edit.zip")


def _tc(frames, fps=EDIT_FPS):
    f = max(0, int(frames))
    return f"{f // (3600 * fps):02d}:{f // (60 * fps) % 60:02d}:{f // fps % 60:02d}:{f % fps:02d}"


def _srt_time(t):
    ms = int(round(max(0.0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def _secs(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def edit_timeline(kit, name, audio, title="", rows=None, fps=EDIT_FPS):
    """The editor's timeline of a take's plan: {"otio": dict, "edl": str, "srt": str, "media": {zip path: file}, "shots", "events"}. A shot's video
    (its upscale first) for as long as it lasts within the shot, then its picture to the shot's end; a shot with neither leaves a gap."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise FileNotFoundError("no plan for this take yet")
    title = str(title or plan.get("title") or name)
    safe = re.sub(r"[^\w.-]+", "_", title).strip("_")[:60] or name
    rt = lambda v: {"OTIO_SCHEMA": "RationalTime.1", "rate": float(fps), "value": float(v)}   # noqa: E731
    span = lambda a, d: {"OTIO_SCHEMA": "TimeRange.1", "start_time": rt(a), "duration": rt(d)}   # noqa: E731
    fr = lambda s: int(round(float(s) * fps))   # noqa: E731
    media, v1, events, t = {}, [], [], 0
    sdir, fdir = shots_dir(kit, name), frames_dir(kit, name)

    def gap(d):
        v1.append({"OTIO_SCHEMA": "Gap.1", "name": "", "source_range": span(0, d), "effects": [], "markers": [], "metadata": {}})

    def put(key, src, d, avail, i, still):
        media[key] = src
        v1.append({"OTIO_SCHEMA": "Clip.1", "name": f"{i + 1:03d} · {Path(key).name}", "source_range": span(0, d), "effects": [], "markers": [],
                   "metadata": {"ruach": {"shot": i + 1, "still": still}},
                   "media_reference": {"OTIO_SCHEMA": "ExternalReference.1", "target_url": key, "available_range": span(0, avail), "metadata": {}}})
        events.append((key, d, still))

    for i, s in enumerate(plan.get("shots") or []):
        a, b = fr(s["t0"]), fr(s["t1"])
        if a > t:
            gap(a - t)
            t = a
        if b <= t:
            continue
        d, used = b - t, 0
        vid = next((sdir / f for f in (s.get("video_up"), s.get("video")) if f and (sdir / f).is_file()), None)
        pic = fdir / s["frame"] if s.get("frame") and (fdir / s["frame"]).is_file() else None
        if vid is not None:
            have = fr(_secs(vid) or 0)
            used = min(d, have) if have > 0 else 0
            if used:
                put(f"media/shot-{i + 1:03d}{vid.suffix}", vid, used, have, i, False)
        if d - used > 0:
            if pic is not None:
                put(f"media/shot-{i + 1:03d}.jpg", pic, d - used, d - used, i, True)
            else:
                gap(d - used)
        t = b
    a_secs = _secs(audio) or (t / fps)
    a_key = f"media/{safe}{Path(audio).suffix or '.wav'}"
    media[a_key] = Path(audio)
    a1 = [{"OTIO_SCHEMA": "Clip.1", "name": Path(a_key).name, "source_range": span(0, fr(a_secs)), "effects": [], "markers": [], "metadata": {},
           "media_reference": {"OTIO_SCHEMA": "ExternalReference.1", "target_url": a_key, "available_range": span(0, fr(a_secs)), "metadata": {}}}]
    track = lambda nm, kind, kids: {"OTIO_SCHEMA": "Track.1", "name": nm, "kind": kind, "children": kids, "source_range": None,   # noqa: E731
                                    "effects": [], "markers": [], "metadata": {}}
    otio = {"OTIO_SCHEMA": "Timeline.1", "name": title, "global_start_time": rt(0), "metadata": {"ruach": {"take": name, "fps": fps}},
            "tracks": {"OTIO_SCHEMA": "Stack.1", "name": "tracks", "children": [track("V1", "Video", v1), track("A1", "Audio", a1)],
                       "source_range": None, "effects": [], "markers": [], "metadata": {}}}
    lines = [f"TITLE: {title}", "FCM: NON-DROP FRAME", ""]
    rec = 0
    for item in v1:
        d = int(item["source_range"]["duration"]["value"])
        if item["OTIO_SCHEMA"] == "Clip.1":
            n = len([x for x in lines if x[:3].isdigit()]) + 1
            key = item["media_reference"]["target_url"]
            reel = ("STILL" if item["metadata"]["ruach"]["still"] else "SHOT") + f"{item['metadata']['ruach']['shot']:03d}"
            lines += [f"{n:03d}  {reel:<8} V     C        {_tc(0, fps)} {_tc(d, fps)} {_tc(rec, fps)} {_tc(rec + d, fps)}", f"* FROM CLIP NAME: {Path(key).name}", ""]
        rec += d
    n = len([x for x in lines if x[:3].isdigit()]) + 1
    lines += [f"{n:03d}  AUDIO    A     C        {_tc(0, fps)} {_tc(fr(a_secs), fps)} {_tc(0, fps)} {_tc(fr(a_secs), fps)}", f"* FROM CLIP NAME: {Path(a_key).name}", ""]
    srt, k = [], 0
    for r in sorted((r for r in rows or [] if r.get("start") is not None and r.get("end") is not None and str(r.get("text") or "").strip()),
                    key=lambda r: float(r["start"])):
        k += 1
        srt += [str(k), f"{_srt_time(float(r['start']))} --> {_srt_time(float(r['end']))}", str(r["text"]).strip().replace("\n", " "), ""]
    return {"otio": otio, "edl": "\n".join(lines), "srt": "\n".join(srt), "media": media, "safe": safe, "title": title,
            "shots": len(plan.get("shots") or []), "events": len(events)}


EDIT_README = """{title} · an editor's project from Ruach Studio's Videographer

{safe}.otio  OpenTimelineIO: V1 the shots in the song's time, A1 the take's sound. DaVinci Resolve: File → Import → Timeline… → this file (the media/
             folder beside it is found by its relative paths). Kdenlive: File → Import → OpenTimelineIO project (Kdenlive 23.04 and later).
{safe}.edl   the same cut as a CMX3600 EDL at {fps} fps (one event a shot, its clip's name on the line below): any editor reads it; relink to media/.
{safe}.srt   the sung lines in their own time, as subtitles or the titles' text.
media/       shot-NNN.mp4: a shot's video (its upscale where it has one); shot-NNN.jpg: its picture, where it has no video or its video is shorter
             than the shot; the take's sound.
"""


def edit_bundle(kit, name, audio, title="", rows=None, fps=EDIT_FPS):
    """HERESY 1946: the zip itself, written beside the plan anew on each ask (media stored, the texts compressed); its facts."""
    tl = edit_timeline(kit, name, audio, title, rows, fps)
    out = edit_path(kit, name)
    part = out.with_name(out.name + ".part")
    with zipfile.ZipFile(part, "w") as z:
        z.writestr(f"{tl['safe']}.otio", json.dumps(tl["otio"], ensure_ascii=False, indent=1), zipfile.ZIP_DEFLATED)
        z.writestr(f"{tl['safe']}.edl", tl["edl"] + "\n", zipfile.ZIP_DEFLATED)
        z.writestr(f"{tl['safe']}.srt", tl["srt"] + "\n", zipfile.ZIP_DEFLATED)
        z.writestr("README.txt", EDIT_README.format(title=tl["title"], safe=tl["safe"], fps=fps), zipfile.ZIP_DEFLATED)
        for key, src in tl["media"].items():
            z.write(src, key, zipfile.ZIP_STORED)
    part.replace(out)
    return {"size": out.stat().st_size, "shots": tl["shots"], "events": tl["events"], "media": len(tl["media"]), "title": tl["title"]}


# HERESY 1947: the cuts between shots on the take's beats
BEAT_WINDOW, BEAT_LEAST = 0.3, 1.5


def beat_times(audio):
    """The take's beats (seconds) and its tempo, heard by librosa from its sound (mono, 22.05 kHz)."""
    import librosa
    import numpy as np
    y, sr = librosa.load(str(audio), sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    return [float(t) for t in beats], float(np.atleast_1d(tempo)[0])


def snap_cuts(shots, beats, window=BEAT_WINDOW, least=BEAT_LEAST):
    """Each cut between two shots back to back moved to the nearest beat within `window` s, no shot under `least` s; a moved shot keeps its times
    as sung (as_sung, the first ones). (cuts moved, their mean shift in s)."""
    import bisect
    beats = sorted(float(b) for b in beats or [])
    moved, shift = 0, 0.0
    for i in range(len(shots) - 1):
        b = float(shots[i]["t1"])
        if not beats or abs(float(shots[i + 1]["t0"]) - b) > 1e-6:
            continue
        j = bisect.bisect_left(beats, b)
        t = min((beats[k] for k in (j - 1, j) if 0 <= k < len(beats)), key=lambda x: abs(x - b))
        if abs(t - b) < 0.01 or abs(t - b) > window:
            continue
        if t - float(shots[i]["t0"]) < least or float(shots[i + 1]["t1"]) - t < least:
            continue
        for s in (shots[i], shots[i + 1]):
            s.setdefault("as_sung", [s["t0"], s["t1"]])
        shots[i]["t1"] = shots[i + 1]["t0"] = round(t, 3)
        moved += 1
        shift += abs(t - b)
    return moved, (shift / moved if moved else 0.0)


def on_beat(kit, name, audio, undo=False):
    """HERESY 1947: a plan's cuts on its take's beats (or, undo, every cut back where it was sung); the edit on the timeline's undo too."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    plan.pop("exists", None)
    before = [{k: v for k, v in s.items() if k != "auto"} for s in plan["shots"]]
    if undo:
        n = 0
        for s in plan["shots"]:
            if s.get("as_sung"):
                s["t0"], s["t1"] = s.pop("as_sung")
                n += 1
        plan.pop("beats", None)
        out = {"undone": n}
    else:
        beats, tempo = beat_times(audio)
        moved, mean = snap_cuts(plan["shots"], beats)
        plan["beats"] = {"tempo": round(tempo, 1), "count": len(beats), "moved": moved}
        out = {"tempo": round(tempo, 1), "beats": len(beats), "moved": moved, "cuts": max(0, len(plan["shots"]) - 1), "mean_ms": round(mean * 1000)}
    plan["undo"] = (plan.get("undo") or [])[-(UNDO - 1):] + [before]
    plan["edited"] = time.time()
    _write(kit, name, plan)
    return dict(out, plan=_auto(dict(plan, exists=True)))


def _ass_time(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def lyrics_ass(rows, out, end, w=CW, h=CH):
    """HERESY 1916: the sung lines as an ASS file, each in its own time (from a little before to a little after, never into the next), white with a
    dark edge at the foot of the picture, fading in and out; DejaVu Sans writes Latin, Cyrillic, Greek and Hebrew. The lines written, or 0."""
    rows = sorted((r for r in rows or [] if r.get("start") is not None and r.get("end") is not None and str(r.get("text") or "").strip()),
                  key=lambda r: float(r["start"]))
    side, foot = round(w * 0.06), round(h * (0.16 if h > w else 0.08))   # HERESY 1917: upright, above the phone's own buttons
    head = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
            "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV", f"Style: Line,DejaVu Sans,{round(min(w, h) * 0.05)},&H00FFFFFF,&H00101010,&H80000000,0,0,1,3,1,2,{side},{side},"
            f"{foot}", "", "[Events]", "Format: Layer, Start, End, Style, Text"]
    lines = []
    for i, r in enumerate(rows):
        a = float(r["start"]) - 0.1
        b = float(r["end"]) + 0.3
        if i + 1 < len(rows):
            b = min(b, float(rows[i + 1]["start"]) - 0.05)
        b = min(b, end)
        if b - a < 0.3:
            continue
        text = str(r["text"]).strip().replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")
        lines.append(f"Dialogue: 0,{_ass_time(a)},{_ass_time(b)},Line,{{\\fad(180,220)}}{text}")
    Path(out).write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    return len(lines)


def titles_ass(out, end, w=CW, h=CH, title="", credits=""):
    """HERESY 1948: the clip's title over its first seconds (from 0.4 s to 5 s, or half a short clip; large, in the picture's middle) and the credits
    over its last 7 s (a line each, smaller), white with a dark edge, faded in and out; DejaVu Sans. The lines written: 0, 1 or 2."""
    title, credits = " ".join(str(title or "").split()), str(credits or "").strip()
    side, big, small = round(w * 0.08), round(min(w, h) * 0.075), round(min(w, h) * 0.04)
    head = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
            "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV", f"Style: Title,DejaVu Sans,{big},&H00FFFFFF,&H00101010,&H80000000,1,0,1,3,2,5,{side},{side},0",
            f"Style: Credits,DejaVu Sans,{small},&H00FFFFFF,&H00101010,&H80000000,0,0,1,2,1,5,{side},{side},0", "", "[Events]",
            "Format: Layer, Start, End, Style, Text"]
    clean = lambda t: t.replace("\\", "/").replace("{", "(").replace("}", ")")   # noqa: E731
    lines, title_end = [], min(5.0, max(1.5, end * 0.5))
    if title:
        lines.append(f"Dialogue: 0,{_ass_time(0.4)},{_ass_time(title_end)},Title,{{\\fad(500,600)}}{clean(title)}")
    rows = [clean(l.strip()) for l in credits.splitlines() if l.strip()]
    if rows:
        a = max(end - 7.0, title_end + 0.2 if title else 0.0)
        b = max(a + 1.0, end - 0.2)
        lines.append(f"Dialogue: 0,{_ass_time(a)},{_ass_time(b)},Credits,{{\\fad(600,500)}}" + "\\N".join(rows))
    Path(out).write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    return len(lines)


def _edges(shots, i, between):
    """HERESY 1916: a shot's own fades at a change of section: (fade in from black or white, fade out to black), as ffmpeg filters, or ''."""
    if between not in ("black", "flash"):
        return "", ""
    first = i > 0 and shots[i].get("section") != shots[i - 1].get("section")
    last = i + 1 < len(shots) and shots[i].get("section") != shots[i + 1].get("section")
    fin = (f"fade=t=in:st=0:d={DIP}" if between == "black" else f"fade=t=in:st=0:d={FLASH}:color=white") if first else ""
    fout = f"fade=t=out:st={{T}}:d={DIP}" if last and between == "black" else ""
    return fin, fout


def _melts(shots, lens, xd):
    """HERESY 1949: the shots that dissolve into the next one shown (lens: each shot's frames, 0 for one not shown): at a change of section, both
    longer than the dissolve; none when xd is 0."""
    shown = [i for i, k in enumerate(lens) if k > 0]
    return {a for a, b in zip(shown, shown[1:]) if xd and shots[a].get("section") != shots[b].get("section") and lens[a] > xd and lens[b] > xd}


def _melt(tmp, parts, lens, melts, xd, nice=(), threads="2"):
    """HERESY 1949: each run of parts joined by dissolves (a part before one rendered xd frames longer) cross-faded into one part, the next part
    fading in from its own start over the one before's tail: every shot starts at its own time and the run keeps its frames. The parts' list,
    each run in its members' place."""
    runs = []
    for line in parts:
        i = int(line.split("'")[1][:4])
        if runs and runs[-1][-1] in melts:
            runs[-1].append(i)
        else:
            runs.append([i])
    out = []
    for run in runs:
        if len(run) == 1:
            out.append(f"file '{run[0]:04d}.mp4'")
            continue
        graph = [f"[{k}:v]fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[v{k}]" for k in range(len(run))]
        prev, at = "v0", 0
        for k in range(1, len(run)):
            at += lens[run[k - 1]]
            graph.append(f"[{prev}][v{k}]xfade=transition=fade:duration={xd / FPS:.3f}:offset={at / FPS:.3f}[x{k}]")
            prev = f"x{k}"
        name = f"melt{run[0]:04d}.mp4"
        ins = [a for i in run for a in ("-i", f"{i:04d}.mp4")]
        p = subprocess.run(list(nice) + ["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(graph), "-map", f"[{prev}]",
                                         "-frames:v", str(sum(lens[i] for i in run)), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                                         "-pix_fmt", "yuv420p", "-threads", threads, name], cwd=str(tmp), capture_output=True, text=True, timeout=1800)
        if p.returncode != 0 or not (tmp / name).is_file():
            raise RuntimeError(f"ffmpeg, the dissolve after shot {run[0] + 1}: " + (p.stderr.strip()[-300:] or "no output"))
        out.append(f"file '{name}'")
    return out


def clip(kit, name, audio, cover=None, job=None, labels=None, rows=None, lyrics=False, between="cut", shape="16:9", titles=False):
    """The clip cut from the shots' pictures in the song's time, with its sound; {file, shots, own, seconds}. A shot with no picture of its own
    shows the take's cover; in a take with none, its words and scene (the animatic's card, held still: what is still to picture).
    HERESY 1916: lyrics burns the sung lines in (rows: the take's Whisper timing); between: «cut», «black» or «flash» where a section changes;
    1949: «dissolve»."""
    if between not in BETWEEN:
        raise ValueError("between the sections: a cut, through black, a flash or a dissolve")
    W, H = SHAPES.get(shape) or (0, 0)                   # HERESY 1917
    if not W:
        raise ValueError("the clip's shape: 16:9, 9:16 or 1:1")
    from PIL import Image
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    shots = plan["shots"]
    out = clip_path(kit, name, shape)
    tmp = out.with_suffix(".part")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    end = max(float(plan.get("seconds") or 0), shots[-1]["t1"])
    cuts = [0] + [round(s["t0"] * FPS) for s in shots[1:]] + [round(end * FPS)]   # in frames: the cuts land on whole frames, the sum is the song
    nice = ["nice", "-n", "10"] if shutil.which("nice") else []
    threads = str(max(2, min(8, (os.cpu_count() or 4) // 4)))
    stills, parts, own, live = {}, [], 0, 0
    xd = round(MELT * FPS) if between == "dissolve" else 0   # HERESY 1949: the shot before a dissolve runs on xd frames under the next one
    lens = [cuts[i + 1] - cuts[i] for i in range(len(shots))]
    melts = _melts(shots, lens, xd)
    for i, s in enumerate(shots):
        n = cuts[i + 1] - cuts[i]
        if n <= 0:
            continue
        m = n + (xd if i in melts else 0)                    # HERESY 1949: the frames rendered
        vid = None                                          # HERESY 1868: its own video, cut to the shot's length (its last frame held)
        if s.get("video"):
            for f in (s.get("video_up"), s["video"]):             # HERESY 1876b: its upscale when there is one
                try:
                    vid = shot_video_path(kit, name, f) if f else None
                except (OSError, ValueError):
                    vid = None
                if vid is not None:
                    break
        if vid is not None:
            part = f"{i:04d}.mp4"
            fx = min(1.0, max(0.0, float(s.get("focus", 0.5))))
            vf = f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}:(iw-{W})*{fx}:(ih-{H})/2,tpad=stop_mode=clone:stop_duration=15,format=yuv420p"
            vf = ",".join(x for x in (vf, *_edges(shots, i, between)) if x).replace("{T}", f"{max(0.0, n / FPS - DIP):.3f}")   # HERESY 1916
            p = subprocess.run(nice + ["ffmpeg", "-v", "error", "-y", "-i", str(vid), "-an", "-vf", vf, "-frames:v", str(m), "-c:v", "libx264", "-preset", "veryfast",
                                       "-crf", "20", "-threads", threads, part], cwd=str(tmp), capture_output=True, text=True, timeout=1800)
            if p.returncode != 0 or not (tmp / part).is_file():
                raise RuntimeError(f"ffmpeg, shot {i + 1}'s video: " + (p.stderr.strip()[-300:] or "no output"))
            parts.append(f"file '{part}'")
            live += 1
            if job is not None:
                job["progress"] = round(0.95 * (i + 1) / len(shots), 3)
            continue
        src = None
        if s.get("frame"):
            try:
                src = frame_path(kit, name, s["frame"])
                own += 1
            except (OSError, ValueError):
                src = None
        src, move = src or cover, move_of(s, i)
        if src is None:
            card, move = tmp / f"card{i:04d}.jpg", "still"
            _frame(_ground(None), i, len(shots), s, plan.get("title") or name, labels or {}).resize((2 * CW, 2 * CH), Image.LANCZOS).save(card, quality=90)
            src = tmp / f"cardfit{i:04d}.jpg"
            _still(card, src, W, H, fit=True)                # HERESY 1917: a card of words whole in any shape
            stills[str(src)] = src
        key = f"{src}|{s.get('focus', 0.5)}"
        if str(src) in stills:
            stills.setdefault(key, stills[str(src)])
        if key not in stills:
            stills[key] = tmp / f"still{len(stills):03d}.jpg"
            _still(src, stills[key], W, H, focus=s.get("focus", 0.5))
        part = f"{i:04d}.mp4"
        vf = ",".join(x for x in (_move(move, m, W, H), *_edges(shots, i, between)) if x).replace("{T}", f"{max(0.0, n / FPS - DIP):.3f}")   # HERESY 1916
        p = subprocess.run(nice + ["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(stills[key]), "-vf", vf,
                                   "-frames:v", str(m), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", threads, part],
                           cwd=str(tmp), capture_output=True, text=True, timeout=1800)
        if p.returncode != 0 or not (tmp / part).is_file():
            raise RuntimeError(f"ffmpeg, shot {i + 1}: " + (p.stderr.strip()[-300:] or "no output"))
        parts.append(f"file '{part}'")
        if job is not None:
            job["progress"] = round(0.95 * (i + 1) / len(shots), 3)
    if melts:                                               # HERESY 1949: each run of shots joined by dissolves made one part
        parts = _melt(tmp, parts, lens, melts, xd, nice, threads)
    (tmp / "list.txt").write_text("\n".join(parts) + "\n", encoding="utf-8")
    sung = lyrics_ass(rows, tmp / "lyrics.ass", end, W, H) if lyrics else 0      # HERESY 1916; 1917: in the clip's shape
    shown = titles_ass(tmp / "titles.ass", end, W, H, plan.get("clip_title") or plan.get("title") or "", plan.get("credits") or "") if titles else 0   # HERESY 1948
    subs = ",".join(x for x in ("subtitles=lyrics.ass" if sung else "", "subtitles=titles.ass" if shown else "") if x)
    video = ["-vf", subs, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", threads] if subs else ["-c:v", "copy"]
    p = subprocess.run(nice + ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", str(audio), "-map", "0:v", "-map", "1:a",
                               *video, "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", "out.mp4"],
                       cwd=str(tmp), capture_output=True, text=True, timeout=1800)
    if p.returncode != 0 or not (tmp / "out.mp4").is_file():
        raise RuntimeError("ffmpeg: " + (p.stderr.strip()[-300:] or "no output"))
    (tmp / "out.mp4").replace(out)
    shutil.rmtree(tmp, ignore_errors=True)
    if job is not None:
        job["progress"] = 1.0
    return {"file": out.name, "shots": len(shots), "own": own, "live": live, "seconds": round(end, 2), "lines": sung, "between": between, "shape": shape,
            "titles": shown}


# ---- HERESY 1864 (Viktor 29.10.2026: «Davinci Resolve стиль — это будет ахуй»): the timeline's edits. The page lays the cuts (a shot cut in two at
# the playhead, two shots joined, an edit point moved) and says which shot each piece came of; the scene, the move and the picture follow it (a
# second piece of one shot gets a copy of its picture: taking one off never takes the other's), the words and the section are read again from the
# timing. The plan before is kept, twenty steps back.
UNDO = 20


def _words_in(rows, secs, t0, t1):
    rows = sorted((r for r in rows or [] if r.get("start") is not None and r.get("end") is not None), key=lambda r: r["start"])
    got, sec = [], ""
    for i, r in enumerate(rows):
        mid = (float(r["start"]) + float(r["end"])) / 2
        if t0 <= mid < t1:
            got.append(r.get("text", ""))
            if not sec and i < len(secs):
                sec = secs[i]
    return " / ".join(g for g in got if g), sec


def recut(kit, name, cuts, parents, rows=None, lyrics=""):
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    old = plan["shots"]
    if not isinstance(cuts, list) or not isinstance(parents, list) or len(cuts) != len(parents) or not cuts:
        raise ValueError("cuts and parents, one each")
    end = float(plan.get("seconds") or old[-1]["t1"])
    cuts = [[round(float(a), 2), round(float(b), 2)] for a, b in cuts]
    if abs(cuts[0][0]) > 0.05 or abs(cuts[-1][1] - end) > 0.1:
        raise ValueError("the shots must run from the start to the end")
    for i, (a, b) in enumerate(cuts):
        if b - a < 0.4:
            raise ValueError("a shot of at least 0.4 s")
        if i and abs(cuts[i - 1][1] - a) > 0.01:
            raise ValueError("the shots back to back, no gap")
        if not isinstance(parents[i], int) or not 0 <= parents[i] < len(old):
            raise ValueError("no such shot to come of")
    secs = sections_of(lyrics)
    seen, out = set(), []
    for (a, b), p in zip(cuts, parents):
        src = old[p]
        s = {"t0": a, "t1": b, "scene": dict(src.get("scene") or {k: "" for k in SCENE_KEYS})}
        if src.get("move"):
            s["move"] = src["move"]
        if rows:
            s["words"], s["section"] = _words_in(rows, secs, a, b)
            s["section"] = s["section"] or src.get("section", "")
        else:
            s["words"], s["section"] = src.get("words", ""), src.get("section", "")
        s["sung"] = bool(s["words"])
        if src.get("frame"):
            f = src["frame"]
            if p in seen:                                   # a second piece: a copy of the picture of its own
                now = time.time()
                g = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + f"-{int(now * 1000) % 1000:03d}-{len(out):03d}.jpg"
                try:
                    shutil.copy2(frames_dir(kit, name) / f, frames_dir(kit, name) / g)
                    f = g
                    time.sleep(0.002)
                except OSError:
                    f = None
            if f:
                s.update(frame=f, frame_from=src.get("frame_from"), frame_wh=src.get("frame_wh"))
        if src.get("video") and p not in seen and abs(a - src["t0"]) < 0.01:   # HERESY 1868: its video with the piece that starts where it did
            s["video"], s["video_from"] = src["video"], src.get("video_from")
            if src.get("video_up"):                         # HERESY 1876b: and its upscale
                s["video_up"], s["video_up_from"] = src["video_up"], src.get("video_up_from")
        seen.add(p)
        out.append(s)
    kept = {s.get("video") for s in out}
    for i, s in enumerate(old):                             # a shot no piece came of: its picture goes off, kept
        if i not in seen and s.get("frame"):
            _put_off(kit, name, s["frame"])
        if s.get("video") and s["video"] not in kept:          # HERESY 1868: and a video no piece took
            _put_video_off(kit, name, s["video"])
    undo = (plan.get("undo") or [])[-(UNDO - 1):] + [old]
    plan.update(shots=out, undo=undo, edited=time.time())
    plan.pop("exists", None)
    plan.pop("beats", None)                                 # HERESY 1947: cut by hand now, not on the beats
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def recut_undo(kit, name):
    """The shots as they stood before the last edit of the timeline (its pictures as they were, those put off brought back)."""
    plan = get(kit, name)
    undo = plan.get("undo") or []
    if not undo:
        raise ValueError("nothing to undo")
    back = undo.pop()
    have = {s.get("frame") for s in back if s.get("frame")}
    off = frames_dir(kit, name) / "off"
    for f in have:
        if f and FRAME_RE.fullmatch(f) and not (frames_dir(kit, name) / f).is_file() and (off / f).is_file():
            (off / f).replace(frames_dir(kit, name) / f)
    plan.update(shots=back, undo=undo, edited=time.time())
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


# ---- HERESY 1868 (Viktor 29.10.2026: «мне нужна реальная DDiT генерация живого видеоклипа, а не просто слайдшоу»): a shot's own video, made by
# MiniMax H3 (lab/h3_shots.py): in NAME.shots/, its first frame beside it (.jpg) for the timeline; the one it replaces put off (kept); the clip
# takes it in the shot's place, cut to the shot's length (its last frame held when it is shorter)
SHOT_RE = re.compile(r"\d{8}-\d{6}-\d{3}-\d{3}\.mp4")
SHOT_UP_RE = re.compile(r"\d{8}-\d{6}-\d{3}-\d{3}-up(?:1080|1440)\.mp4")   # HERESY 1876b: a shot's video upscaled by SeedVR2


class Moved(ValueError):
    """The shot a video was made for is not there any more at those times."""


def shots_dir(kit, name):
    return _file(kit, name).with_name(name + ".shots")


def shot_video_path(kit, name, f, thumb=False):
    if not (SHOT_RE.fullmatch(str(f or "")) or (not thumb and SHOT_UP_RE.fullmatch(str(f or "")))):
        raise ValueError("no such video")
    p = shots_dir(kit, name) / f
    p = p.with_suffix(".jpg") if thumb else p
    if not p.is_file():
        raise FileNotFoundError("no such video")
    return p


def _put_video_off(kit, name, f):
    if f and SHOT_RE.fullmatch(f):
        d = shots_dir(kit, name)
        for p in [d / f, (d / f).with_suffix(".jpg")] + sorted(d.glob(Path(f).stem + "-up*.mp4")):   # HERESY 1876b: its upscales with it
            if p.is_file():
                (d / "off").mkdir(exist_ok=True)
                p.replace(d / "off" / p.name)


def shot_video_set(kit, name, job):
    """A worker's video set into the shot it was made for (found by its times), its first frame drawn beside it."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise Moved("no plan")
    out = Path(job["out"])
    if out.parent != shots_dir(kit, name) or not SHOT_RE.fullmatch(out.name) or not out.is_file():
        raise ValueError("not a shot's video")
    hit = [s for s in plan["shots"] if abs(s["t0"] - float(job["t0"])) < 0.01 and abs(s["t1"] - float(job["t1"])) < 0.01]
    if not hit:
        raise Moved("the shot's times changed")
    s = hit[0]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out), "-frames:v", "1", "-vf", "scale=480:-2", str(out.with_suffix(".jpg"))], capture_output=True, timeout=120)
    if s.get("video") and s["video"] != out.name:
        _put_video_off(kit, name, s["video"])
    if s.get("video") != out.name:                       # HERESY 1876b: a new video, no upscale of it yet
        s.pop("video_up", None)
        s.pop("video_up_from", None)
    s["video"] = out.name
    s["video_from"] = {k: job.get(k) for k in ("mode", "steps", "seed", "width", "height", "took_s", "gpu", "seconds_made", "first")}
    s["video_from"]["model"] = "MiniMax H3"
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def shot_up_set(kit, name, video, up, info):
    """HERESY 1876b: an upscale of a shot's video set into the shot that still has that video (else Moved: kept aside)."""
    plan = get(kit, name)
    if not plan.get("exists") or not SHOT_UP_RE.fullmatch(str(up or "")) or not (shots_dir(kit, name) / up).is_file():
        raise Moved("no plan, or no such upscale")
    hit = [s for s in plan["shots"] if s.get("video") == video]
    if not hit:
        raise Moved("the shot's video changed")
    s = hit[0]
    if s.get("video_up") and s["video_up"] != up:
        old = shots_dir(kit, name) / s["video_up"]
        if old.is_file():
            (shots_dir(kit, name) / "off").mkdir(exist_ok=True)
            old.replace(shots_dir(kit, name) / "off" / old.name)
    s["video_up"], s["video_up_from"] = up, dict(info or {})
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def shot_video_off(kit, name, i):
    plan = get(kit, name)
    s = _shot_of(plan, i)
    _put_video_off(kit, name, s.pop("video", None))
    s.pop("video_from", None)
    s.pop("video_up", None)                              # HERESY 1876b
    s.pop("video_up_from", None)
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))
