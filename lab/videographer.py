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
import threading                                  # HERESY 2308
import time
import zipfile                                     # HERESY 1946
from pathlib import Path

MAX_SUNG, MAX_BARE, MIN_SHOT, GAP = 5.0, 5.0, 2.5, 2.0
# HERESY 2356 (Viktor 10.11.2026 on «Буратино»: «очень много артефактов на глазах… надо начинать на 720»; «Видеографа лечи так, как качественнее,
# а не быстрее»): a shot of at most 5 s (12 sung and 8 bare before), so MiniMax H3 at 1280 × 704 makes it in one pass (124 frames, 5.17 s at 24 fps:
# lab/h3rt/runtime.chunk_latents) and no seam of two passes ever falls inside it (the diagnosis of 10.11: at a seam the picture jumps 6–9 times as
# much as between two frames). A shot a little longer than one pass is made in one and stretched to its length by at most STRETCH (the clip, the
# frames evenly repeated); a longer one of an older plan is cut by split_long
PASS_S, STRETCH = 124 / 24, 1.12
SCENE_KEYS = ("shot", "camera", "motion", "light")
PLACES = ("slices", "one")                         # HERESY 2356: the look's places in a frame (the Writer's slices his taste) or one place a frame
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
        if b - a <= PASS_S:
            out.append({"t0": a, "t1": b, "words": " / ".join(g["text"] for g in group), "section": group[0]["_sec"], "sung": True})
        else:                                           # HERESY 2356: a breath carried into the line before made it longer than one pass
            for x, y in _split(a, b, MAX_SUNG):
                ws = [g["text"] for g in group if x <= (g["start"] + g["end"]) / 2 < y]
                out.append({"t0": x, "t1": y, "words": " / ".join(ws), "section": group[0]["_sec"], "sung": True})
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
        if merged and s["t1"] - s["t0"] < MIN_SHOT:
            m = merged[-1]
            if m["t1"] - m["t0"] + s["t1"] - s["t0"] <= PASS_S:
                m["t1"] = s["t1"]
                m["words"] = " / ".join(w for w in (m["words"], s["words"]) if w)
                m["sung"] = m["sung"] or s["sung"]
                continue
            if not m["sung"]:                           # HERESY 2356: the two would be longer than one pass: a bare one shares its time evenly,
                m["t1"] = (m["t0"] + s["t1"]) / 2       # a sung one is never cut inside its line (the short one stays a short shot)
        merged.append(dict(s))
        if len(merged) > 1 and merged[-1]["t0"] != merged[-2]["t1"]:
            merged[-1]["t0"] = merged[-2]["t1"]
    if len(merged) > 1 and merged[0]["t1"] - merged[0]["t0"] < MIN_SHOT:
        if merged[1]["t1"] - merged[0]["t0"] <= PASS_S:
            merged[1]["t0"] = merged[0]["t0"]
            merged[1]["words"] = " / ".join(w for w in (merged[0]["words"], merged[1]["words"]) if w)
            merged.pop(0)
        elif not merged[1]["sung"]:                     # HERESY 2356: as above
            merged[0]["t1"] = merged[1]["t0"] = (merged[0]["t0"] + merged[1]["t1"]) / 2
    final = []
    for s in merged:                                    # HERESY 2356: none longer than one pass (a gap given to the shot after it, 2 s at most)
        if s["t1"] - s["t0"] <= PASS_S + 1e-6:
            final.append(s)
            continue
        parts = _split(s["t0"], s["t1"], MAX_SUNG)
        lines = [w for w in (s["words"] or "").split(" / ") if w]
        for k, (x, y) in enumerate(parts):
            ws = [w for j, w in enumerate(lines) if j * len(parts) // len(lines) == k]
            final.append(dict(s, t0=x, t1=y, words=" / ".join(ws)))
    for s in final:
        s["t0"], s["t1"] = round(s["t0"], 2), round(s["t1"], 2)
    return final


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
    plan.update({k: old[k] for k in ("hero", "brief", "seed", "rhythm", "places") if old.get(k)})   # HERESY 1913: the clip's hero, its brief and its seed stay; 2262: the beats heard; 2356: the places
    if old.get("exists"):                                 # HERESY 2268: cut again, a step of the history: the plan before it one Undo away
        plan["undo"] = (old.get("undo") or [])[-(UNDO - 1):] + [_state(old, "remake")]
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def save(kit, name, data):
    """The look and the scenes as the page edited them (the shot times stay the plan's)."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet")
    prev = _state(plan, "edit")                          # HERESY 2268: a step of the history when anything kept changes
    hero0 = json.dumps(plan.get("hero"), sort_keys=True)
    look = data.get("look") or {}
    plan["look"] = {k: str(look.get(k, plan["look"].get(k, "")))[:2000] for k in LOOK_KEYS}
    scenes = data.get("scenes") or []
    for i, s in enumerate(plan["shots"]):
        if i < len(scenes) and isinstance(scenes[i], dict):   # HERESY 2207: a part merged: a shot sent as null and a field left out stay as they were
            s["scene"] = {k: str(scenes[i].get(k, (s.get("scene") or {}).get(k, "")))[:600] for k in SCENE_KEYS}
    if "brief" in data:                                  # HERESY 1913: the clip's idea in a line or a few, the Writer's start
        plan["brief"] = str(data.get("brief") or "")[:2000]
    if data.get("places") in PLACES:                     # HERESY 2356: several places in a frame (slices) or one place a frame
        plan["places"] = data["places"]
    if isinstance(plan.get("hero"), dict):               # HERESY 2356: the hero's own words, the one character line of every prompt, and his skin
        if isinstance(data.get("hero_words"), str):
            plan["hero"]["words"] = " ".join(data["hero_words"].split())[:1000]
        if "hero_human" in data and data["hero_human"] in (True, False, None):
            if data["hero_human"] is None:
                plan["hero"].pop("human", None)
            else:
                plan["hero"]["human"] = bool(data["hero_human"])
        if "hero_last" in data and data["hero_last"] in (True, False):   # HERESY 2361: the hero's picture as the last frame of his shots (H3 FL2VA)
            if data["hero_last"]:
                plan["hero"]["last"] = True
            else:
                plan["hero"].pop("last", None)
    for k, most in (("clip_title", 200), ("credits", 1000), ("author", 200), ("verse", 200)):   # HERESY 1948: the clip's titles, his to write; 2246
        if k in data:
            plan[k] = str(data.get(k) or "")[:most]
    heroes = data.get("heroes")                          # HERESY 1913: whether the hero is in each shot (null: as the page decides, the sung ones)
    if isinstance(heroes, list):
        for i, s in enumerate(plan["shots"]):
            if i < len(heroes) and isinstance(heroes[i], bool):
                s["hero"] = heroes[i]
            elif i < len(heroes):
                s.pop("hero", None)
    intos = data.get("intos")                            # HERESY 2243: the pass into each shot («» or null for the clip's own)
    if isinstance(intos, list):
        for i, s in enumerate(plan["shots"]):
            if i < len(intos) and intos[i] in BETWEEN and i > 0:
                s["into"] = intos[i]
            elif i < len(intos):
                s.pop("into", None)
    moves = data.get("moves")                            # HERESY 1844: the moves chosen («» for the camera's own)
    if isinstance(moves, list):
        for i, s in enumerate(plan["shots"]):
            if i < len(moves) and moves[i] in MOVES + ("still",):
                s["move"] = moves[i]
            elif i < len(moves):
                s.pop("move", None)
    if _same(prev, _state(plan, "edit")):
        if json.dumps(plan.get("hero"), sort_keys=True) != hero0:   # HERESY 2356: the hero's words or skin changed alone: written, no step (the hero stays as chosen)
            plan.pop("exists", None)
            _write(kit, name, plan)
        return _auto(dict(plan, exists=True))            # HERESY 2268: nothing changed, nothing written, no step
    _step(plan, prev)
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


SETTING = threading.RLock()   # HERESY 2308: a picture, a video or an upscale set into a plan one at a time (read, changed, written whole)


def _write(kit, name, plan):
    f = _file(kit, name)
    tmp = f.with_name(f"{f.name}.{os.getpid()}-{threading.get_ident()}.part")   # HERESY 2308: a writer's own; a shared «.json.part» interleaved two
    plan = dict(plan, shots=[{k: v for k, v in s.items() if k != "auto"} for s in plan.get("shots", [])])   # HERESY 1844: «auto» is worked out, not kept
    with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
        json.dump(plan, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
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

CW, CH, FPS, DRIFT = 1920, 1080, 24, 0.10              # HERESY 2356: 24 fps, MiniMax H3's own (at 25 every 25th frame of a shot came twice)
UPSCALE = ("lanczos", "seedvr2")                     # HERESY 2356: a shot's video brought to the clip's size by Lanczos (as H3 drew it) or SeedVR2's
JITTER_MAX = 0.3                                     # HERESY 2356: the gate's weave at most 0.3 (at 1.0 it swayed ±5 px and shook the faces)
# HERESY 1917 (the plan's phase A, «форматы 16:9, 9:16 и 1:1 из одного плана»): the clip's shapes, each a file of its own beside the wide one
SHAPES = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}
SUFFIX = {"16:9": "", "9:16": "-9x16", "1:1": "-1x1"}
# HERESY 2244 (the note of 02.11.2026, §2 item 8): the output presets beside the shapes: YouTube 4K (3840 × 2160) and Telegram (1280 × 720, lighter);
# Shorts and Reels are the tall 9:16. Each its own file, its own encoding: ENCODE[shape] = (crf of the last pass, the sound's bitrate)
SHAPES.update({"4k": (3840, 2160), "tg": (1280, 720)})
SUFFIX.update({"4k": "-4k", "tg": "-tg"})
ENCODE = {"4k": ("18", "256k"), "tg": ("26", "128k")}
REFRAME = ("hand", "centre", "subject")
TITLE_STYLES = ("centre", "lower", "corner")                # HERESY 2246
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
    with SETTING:                                    # HERESY 2308
        return _frame_set(kit, name, i, src, origin)


def _frame_set(kit, name, i, src, origin):
    """A picture for shot i (a path, or an image's bytes): kept as a JPEG of at most 3840 px in NAME.frames/, the one it replaces put off."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    plan = get(kit, name)
    shot = _shot_of(plan, i)
    if isinstance(src, (bytes, bytearray)) and len(src) > 64 * 1024 * 1024:
        raise ValueError("a picture of up to 64 MB, please")
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(src) if isinstance(src, (bytes, bytearray)) else src)).convert("RGB")
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError(f"not a picture the Studio can read ({e})")
    im.thumbnail((3840, 3840))
    d = frames_dir(kit, name)
    d.mkdir(parents=True, exist_ok=True)
    now = time.time()
    f = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + f"-{int(now * 1000) % 1000:03d}-{i:03d}.jpg"
    im.save(d / f, quality=92)
    if not (isinstance(origin, dict) and origin.get("by") == "frames"):   # HERESY 2268: his pick a step; what the Artist draws for the shots, not
        _step(plan, _state(plan, f"picture:{int(i)}"))
    _put_off(kit, name, shot.get("frame"))
    shot.update(frame=f, frame_from=origin, frame_wh=[im.width, im.height])
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def frame_off(kit, name, i):
    plan = get(kit, name)
    shot = _shot_of(plan, i)
    if shot.get("frame"):
        _step(plan, _state(plan, f"picture-off:{int(i)}"))   # HERESY 2268
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


def _still(src, out, w=CW, h=CH, fit=False, focus=0.5, focus_y=0.5, grade=None):
    """A shot's picture at twice the clip's size (the slow move then does not step): one as wide as the clip or wider fills it (HERESY 1917: cut
    across at its focus, 0 the left edge, 1 the right), a narrower one stands whole over itself blurred and darkened (and so does any with fit: a
    card of words is never cut); none, the dark ground. HERESY 2251: focus_y, its place down a picture cut at the top and foot (0.5 the middle).
    HERESY 2249: grade, the colour match's gains (match_gains), laid on the picture first."""
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    W, H = 2 * w, 2 * h
    if src is None:
        _ground(None).resize((W, H)).save(out, quality=90)
        return
    im = _graded(ImageOps.exif_transpose(Image.open(src)).convert("RGB"), grade)
    k = max(W / im.width, H / im.height)
    if not fit and im.width / im.height >= 0.84 * W / H:      # 1.5 for the wide clip, as it was
        im = im.resize((max(W, round(im.width * k)), max(H, round(im.height * k))), Image.LANCZOS)
        x, y = round((im.width - W) * min(1.0, max(0.0, float(focus)))), round((im.height - H) * min(1.0, max(0.0, float(focus_y))))
        im.crop((x, y, x + W, y + H)).save(out, quality=90)
        return
    small = im.resize((max(W // 8, round(im.width * k / 8)), max(H // 8, round(im.height * k / 8))))
    x, y = (small.width - W // 8) // 2, (small.height - H // 8) // 2
    ground = ImageEnhance.Brightness(small.crop((x, y, x + W // 8, y + H // 8)).filter(ImageFilter.GaussianBlur(6))).enhance(0.42).resize((W, H), Image.BILINEAR)
    s = min(W / im.width, H / im.height)                 # whole: as large as the clip lets it
    fg = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    ground.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    ground.save(out, quality=90)


def clip_path(kit, name, shape="16:9", draft=False):
    if shape not in SHAPES:
        raise ValueError("the clip's shape: 16:9, 9:16, 1:1, 4k or tg")
    return _file(kit, name).with_name(name + ".clip" + SUFFIX[shape] + (".draft" if draft else "") + ".mp4")   # HERESY 2245: a draft beside the clip


CLIP_RE = re.compile(r"^(?P<name>[\w.-]+?)\.clip(?P<suf>-9x16|-1x1|-4k|-tg)?\.mp4$")


def clips_index(kit):
    """HERESY 2327 (Viktor 10.11.2026: a finished clip has no card in the Library beside its song): the finished clips (drafts left out) by take,
    for the Library's cards: {take: [{shape, made, bytes, seconds, title}]}, the length and the title from the take's plan."""
    shape_of = {v: k for k, v in SUFFIX.items()}
    out = {}
    for f in _dir(kit).glob("*.clip*.mp4"):
        m = CLIP_RE.match(f.name)
        if not m:
            continue
        try:
            st = f.stat()
            p = json.load(open(_file(kit, m["name"]), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        out.setdefault(m["name"], []).append({"shape": shape_of.get(m["suf"] or "", "16:9"), "made": st.st_mtime, "bytes": st.st_size,
                                             "seconds": p.get("seconds"), "title": p.get("clip_title") or p.get("title") or ""})
    for v in out.values():
        v.sort(key=lambda c: list(SUFFIX).index(c["shape"]) if c["shape"] in SUFFIX else 9)
    return out


def settings_path(clip_file):
    """HERESY 2356: the settings a clip was made with, beside it (NAME.clip.settings, JSON; never .json, which the plans' listing reads)."""
    return Path(clip_file).with_suffix(".settings")


def clip_info(kit, name, shape="16:9", draft=False):
    f = clip_path(kit, name, shape, draft)
    if not f.is_file():
        return {"name": name, "exists": False, "shape": shape, "draft": bool(draft)}
    st = f.stat()
    out = {"name": name, "exists": True, "made": st.st_mtime, "bytes": st.st_size, "shape": shape, "draft": bool(draft)}
    try:                                                 # HERESY 2356: what it was made with, when that was kept
        out["settings"] = json.loads(settings_path(f).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    return out


def draft_size(W, H):
    """HERESY 2245: a draft's frame, a third of the clip's each way, even (640 × 360 for the wide one)."""
    return 2 * max(1, round(W / 6)), 2 * max(1, round(H / 6))


def subject_x(src):
    """HERESY 2244: where across a picture its subject stands (0 the left edge, 1 the right), for a crop of a narrower shape: the columns weighed by
    their edges and by how far they stand from the picture's mean brightness (a figure against a sky, a face against a wall); 0.5 when nothing
    stands out. Pillow alone, on a small copy."""
    from PIL import Image, ImageChops, ImageFilter, ImageStat
    try:
        im = Image.open(src).convert("L")
    except (OSError, ValueError):
        return 0.5
    im.thumbnail((256, 256))
    if im.width < 8 or im.height < 8:
        return 0.5
    edges = im.filter(ImageFilter.FIND_EDGES).crop((2, 2, im.width - 2, im.height - 2))
    mean = round(ImageStat.Stat(im).mean[0])
    far = ImageChops.difference(im, Image.new("L", im.size, mean)).crop((2, 2, im.width - 2, im.height - 2))
    e = list(edges.resize((edges.width, 1), Image.BOX).getdata())
    d = list(far.resize((far.width, 1), Image.BOX).getdata())
    col = [a + 0.5 * b for a, b in zip(e, d)]
    floor = sorted(col)[len(col) // 2]
    w = [max(0.0, c - floor) for c in col]
    if sum(w) <= 1e-6:
        return 0.5
    return min(1.0, max(0.0, sum(i * x for i, x in enumerate(w)) / sum(w) / max(1, len(w) - 1)))


def subject_y(src):
    """HERESY 2251: where down a picture its subject stands (0 the top, 1 the foot), weighed as subject_x weighs the columns, its rows."""
    from PIL import Image
    try:
        im = Image.open(src)
        im = im.transpose(Image.Transpose.ROTATE_90)     # its rows as columns, the top at the left
    except (OSError, ValueError):
        return 0.5
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "PNG")
    buf.seek(0)
    return subject_x(buf)


def subject_focus_y(src, W, H, head=0.42):
    """HERESY 2251: the crop's place down a picture wider than the frame but not wide enough (a 3:2 in the wide clip): its subject at `head` of the
    frame's height from the top (room above a face), 0 the top kept, 1 the foot; 0.5 when the picture fits the height."""
    from PIL import Image
    try:
        with Image.open(src) as im:
            iw, ih = im.size
    except (OSError, ValueError):
        return 0.5
    k = max(W / iw, H / ih)
    sh = ih * k
    if sh - H < 2:
        return 0.5
    top = subject_y(src) * sh - head * H
    return round(min(1.0, max(0.0, top / (sh - H))), 3)


# HERESY 2249 (the note of 02.11.2026, §2 item 2): the colour match, every picture's colours moved towards one shot's (its mean and spread a
# channel), so pictures painted apart become one film; at MATCH of the way, the spread's change held to 0.6–1.6
MATCH = 0.8


def palette_of(src):
    """A picture's colour as [(mean, spread)] for red, green and blue (0–255), on a small copy; None when it cannot be read."""
    from PIL import Image, ImageStat
    try:
        im = Image.open(src).convert("RGB")
    except (OSError, ValueError):
        return None
    im.thumbnail((160, 160))
    st = ImageStat.Stat(im)
    return [(m, max(1.0, s)) for m, s in zip(st.mean, st.stddev)]


def match_gains(p, ref, strength=MATCH):
    """[(a, b)] a channel, out = a·in + b, moving palette p towards ref by strength; None when either is unknown or nothing would move."""
    if not p or not ref:
        return None
    k = max(0.0, min(1.0, float(strength)))
    out = []
    for (m, s), (mr, sr) in zip(p, ref):
        a = min(1.6, max(0.6, sr / s))
        b = mr - a * m
        out.append((round(1 + k * (a - 1), 4), round(k * b, 2)))
    return None if all(abs(a - 1) < 0.005 and abs(b) < 0.5 for a, b in out) else out


def match_vf(g):
    """The gains as ffmpeg's lutrgb (for a shot's own video)."""
    if not g:
        return ""
    return "lutrgb=" + ":".join(f"{c}='clip(val*{a}+{b},0,255)'" for c, (a, b) in zip("rgb", g))


def _graded(im, g):
    if not g:
        return im
    bands = [ch.point(lambda v, a=a, b=b: max(0, min(255, round(v * a + b)))) for ch, (a, b) in zip(im.split(), g)]
    from PIL import Image
    return Image.merge("RGB", bands)


def subject_focus(src, W, H):
    """HERESY 2244: the crop's place (as a shot's focus: 0 its left edge at the picture's, 1 its right at the picture's) that centres the subject."""
    from PIL import Image
    try:
        with Image.open(src) as im:
            iw, ih = im.size
    except (OSError, ValueError):
        return 0.5
    k = max(W / iw, H / ih)
    sw = iw * k
    if sw - W < 2:
        return 0.5
    left = subject_x(src) * sw - W / 2
    return round(min(1.0, max(0.0, left / (sw - W))), 3)


BETWEEN = ("cut", "black", "flash", "dissolve", "white", "push", "zoom")   # HERESY 1949: «dissolve»; 2243: through white, a push, a zoom
# HERESY 2243 (the note of 02.11.2026, §2 item 6): the passes that lay two shots over each other, as ffmpeg's xfade names them
XFADE = {"dissolve": "fade", "white": "fadewhite", "push": "slideleft", "zoom": "zoomin"}
DIP, FLASH = 0.35, 0.18                                  # HERESY 1916: through black, each side of the cut; a flash of white fading into the shot
MELT = 0.5                                               # HERESY 1949: a dissolve, the next section fading in over the last one's tail


# HERESY 1946: the plan as an editor's project (OpenTimelineIO, CMX3600 EDL, SRT) with its media, one zip beside the plan. HERESY 2361 (the night
# report of 10→11.11: «Проект для монтажки (EDL/OTIO) остался в 25 к/с, клип теперь в 24»): at the clip's own 24 fps, H3's, so a shot's frames are
# the editor's frames one for one and its timecodes land where the clip cuts
EDIT_FPS = FPS


def edit_path(kit, name):
    return _file(kit, name).with_name(name + ".edit.zip")


def _tc(frames, fps=EDIT_FPS):
    f = max(0, int(frames))
    return f"{f // (3600 * fps):02d}:{f // (60 * fps) % 60:02d}:{f // fps % 60:02d}:{f % fps:02d}"


def _srt_time(t):
    ms = int(round(max(0.0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def _secs(p):
    try:                                              # HERESY 2011 (C12): with a timeout, as 1430 gave every other one
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True,
                           timeout=30)
    except subprocess.TimeoutExpired:
        return None
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


def beat_times(audio, strength=False):
    """The take's beats (seconds) and its tempo, heard by librosa from its sound (mono, 22.05 kHz). HERESY 2247: strength, each beat's onset
    strength too (for where the bars begin)."""
    import librosa
    import numpy as np
    y, sr = librosa.load(str(audio), sr=22050, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr)
    beats = [float(t) for t in librosa.frames_to_time(frames, sr=sr)]
    if strength:
        return beats, float(np.atleast_1d(tempo)[0]), [float(env[min(len(env) - 1, int(k))]) for k in frames]
    return beats, float(np.atleast_1d(tempo)[0])


# HERESY 2247 (the note of 02.11.2026, §2 item 5): a change of section cut on a bar line, the bar grid the DAW's (dawproject.tempo_meter: the
# score's Q: and M:, from 0 s) when the take keeps that tempo, else bars counted on the heard beats from the strongest downbeat
TEMPO_AGREE = 0.04


def bar_grid(beats, tempo, meter=None, strengths=None, end=0.0):
    """(the bar lines in s, "daw" or "heard"). meter (bpm, beats a bar, its note): the DAW's grid from 0 s while the heard tempo is that bpm (or its
    half or double) within 4 %; else every num-th heard beat from the phase whose beats sound strongest. [] with no beats nor meter."""
    num = int(meter[1]) if meter else 4
    if meter and tempo:
        bpm, den = float(meter[0]), int(meter[2] or 4)
        q = bpm * den / 4.0                              # the beats a minute as the meter counts them
        if any(abs(tempo * k / q - 1) <= TEMPO_AGREE for k in (0.5, 1.0, 2.0)):
            bar = num * 60.0 / q
            last = max(end, beats[-1] if beats else 0.0)
            return [round(k * bar, 3) for k in range(int(last / bar) + 2)], "daw"
    beats = list(beats or [])
    if len(beats) < num:
        return [], "heard"
    st = list(strengths or [1.0] * len(beats))
    phase = max(range(num), key=lambda p: sum(st[p::num]) / max(1, len(st[p::num])))
    return [round(b, 3) for b in beats[phase::num]], "heard"


# HERESY 2262: a change of section where the take's music itself changes, by the player's own rule (1358: the strongest change heard within 1.5 s
# of where the section is sung), set on the bar line or else the beat within 0.3 s of it; the cuts' strictness picked as off, sections or beats
SNAP_CHANGE, ON_GRID = 1.5, 0.3
CUTS_ON = ("off", "sections", "beats")


def _nearest(xs, t):
    import bisect
    j = bisect.bisect_left(xs, t)
    near = [xs[k] for k in (j - 1, j) if 0 <= k < len(xs)]
    return min(near, key=lambda x: abs(x - t)) if near else None


def snap_sections(shots, bars, least=BEAT_LEAST, changes=None, beats=None, said=None):
    """Each cut where the section changes (shots back to back) moved to the nearest bar line within half a bar (2 s at most), no shot under `least`
    s; the times as sung kept (as_sung). (the cuts at a change, the cuts moved, the set of their places). HERESY 2262: with the take's own changes
    ([{t, strength}], takechanges), the strongest heard within 1.5 s of the cut and leaving both shots `least` long goes first, set on the bar line
    or else the beat within 0.3 s of it (on the change itself when neither is); `said` (a dict) gets by_change, the cuts placed so."""
    bars = sorted(bars or [])
    beats = sorted(float(b) for b in beats or [])
    heard = sorted((float(c["t"]), float(c.get("strength") or 0)) for c in changes or [] if isinstance(c, dict) and c.get("t") is not None)
    half = min(2.0, (bars[1] - bars[0]) / 2) if len(bars) > 1 else 0.0
    count, moved, at, by = 0, 0, set(), 0
    for i in range(len(shots) - 1):
        a, b = shots[i], shots[i + 1]
        t1 = float(a["t1"])
        if (a.get("section") or "") == (b.get("section") or "") or abs(float(b["t0"]) - t1) > 1e-6:
            continue
        count += 1
        t, how = None, ""
        near = [c for c in heard if abs(c[0] - t1) <= SNAP_CHANGE and c[0] - float(a["t0"]) >= least and float(b["t1"]) - c[0] >= least]
        if near:
            m = max(near, key=lambda c: c[1])[0]
            g = _nearest(bars, m)
            if g is None or abs(g - m) > ON_GRID:
                g = _nearest(beats, m)
            t, how = (g if g is not None and abs(g - m) <= ON_GRID else m), "change"
        elif bars:
            g = _nearest(bars, t1)
            if abs(g - t1) <= half:
                t, how = g, "bar"
        if t is None or t - float(a["t0"]) < least or float(b["t1"]) - t < least:
            continue
        at.add(i)
        by += how == "change"
        if abs(t - t1) < 0.01:
            continue
        for s in (a, b):
            s.setdefault("as_sung", [s["t0"], s["t1"]])
        a["t1"] = b["t0"] = round(t, 3)
        moved += 1
    if isinstance(said, dict):
        said["by_change"] = by
    return count, moved, at


def snap_cuts(shots, beats, window=BEAT_WINDOW, least=BEAT_LEAST, skip=()):
    """Each cut between two shots back to back moved to the nearest beat within `window` s, no shot under `least` s; a moved shot keeps its times
    as sung (as_sung, the first ones). (cuts moved, their mean shift in s)."""
    import bisect
    beats = sorted(float(b) for b in beats or [])
    moved, shift = 0, 0.0
    for i in range(len(shots) - 1):
        b = float(shots[i]["t1"])
        if not beats or i in skip or abs(float(shots[i + 1]["t0"]) - b) > 1e-6:   # HERESY 2247: a cut already on its bar stays
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


def _level(shots):
    """HERESY 2262: the strictness the shots were cut by, read from them: none moved off its time as sung «off»; a cut inside a section moved
    «beats»; else «sections»."""
    if not any(s.get("as_sung") for s in shots):
        return "off"
    inside = any(s.get("as_sung") and abs(float(s["t1"]) - float(s["as_sung"][1])) > 0.005 and (s.get("section") or "") == (n.get("section") or "")
                 for s, n in zip(shots, shots[1:]))
    return "beats" if inside else "sections"


def _rhythm(plan, audio, meter, grid=None):
    """HERESY 2262: the take's beats, tempo and bars, heard once for its audio as it is and kept with the plan (rhythm): the timeline's ruler
    shows them, and another strictness needs no second hearing. HERESY 2361 (Viktor's plan of 08.11.2026 §2.6, «Резы по битам и секциям — от той
    же сетки тактов, что в DAW»): with the DAW's own grid of the take (bargrid.grid: the beats heard in its sound at the tempo the score or the hand
    gives, its bars on the score's or the hand's downbeat, kept beside the take), its beats and bars are the cuts' (grid «daw»); without it, as
    before (the score's tempo from 0 s while the take keeps it, else the bars heard)."""
    import os
    if isinstance(grid, dict) and grid.get("bars") and grid.get("beats"):
        rh = {"of": ["daw", grid.get("seconds"), len(grid["bars"]), grid["bars"][0], grid.get("settings") or {}], "tempo": round(float(grid.get("bpm") or 0), 1),
              "grid": "daw", "beats": [round(float(b), 3) for b in grid["beats"]], "bars": [round(float(b), 3) for b in grid["bars"]],
              "said": str(grid.get("said") or "")[:300]}
        plan["rhythm"] = rh
        return rh
    st = os.stat(str(audio))
    of = [int(st.st_mtime), int(st.st_size), [float(x) for x in meter] if meter else None]
    rh = plan.get("rhythm") or {}
    if rh.get("of") != of or not rh.get("beats") or rh.get("said"):    # HERESY 2361: the DAW's grid kept before, not this one: heard again
        beats, tempo, strengths = beat_times(audio, strength=True)
        bars, grid = bar_grid(beats, tempo, meter, strengths, float(plan.get("seconds") or 0))
        rh = {"of": of, "tempo": round(tempo, 1), "grid": grid, "beats": [round(b, 3) for b in beats], "bars": bars}
    plan["rhythm"] = rh
    return rh


def on_beat(kit, name, audio, undo=False, meter=None, how=None, changes=None, changes_error="", grid=None, grid_error=""):
    """HERESY 1947: a plan's cuts on its take's beats (or, undo, every cut back where it was sung); the edit on the timeline's undo too.
    HERESY 2247: first each change of section on a bar line (bar_grid: the DAW's grid from meter, (bpm, num, den), when the take keeps it).
    HERESY 2262: how strictly: «off» (every cut back where it was sung, as undo), «sections» (the changes of section alone, first where the music
    itself changes, from `changes`, the take's own [{t, strength}]), «beats» (the sections so, then every other cut on its beat, as before); each
    from the times as sung, so one strictness follows another; the beats and bars kept with the plan (rhythm). `changes` None with a
    `changes_error`: the changes could not be heard, said with the answer and never taken for none heard. HERESY 2361: `grid` the DAW's own bar grid
    of the take (bargrid.grid, the same the DAW's ruler shows), its bars and beats the cuts'; none, or one that could not be made (`grid_error`,
    said with the answer), the bars as before."""
    how = "off" if undo else (how or "beats")
    if how not in CUTS_ON:
        raise ValueError("the cuts: off, sections or beats")
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    plan.pop("exists", None)
    before = _state(plan, "cuts:" + how)                 # HERESY 2268: a step of the history
    n = 0
    for s in plan["shots"]:
        if s.get("as_sung"):
            s["t0"], s["t1"] = s.pop("as_sung")
            n += 1
    if how == "off":
        plan.pop("beats", None)
        out = {"undone": n, "how": how}
    else:
        rh = _rhythm(plan, audio, meter, grid)
        if changes is not None:
            rh["changes"] = [round(float(c["t"]), 2) for c in changes if isinstance(c, dict) and c.get("t") is not None]
        beats, bars, said = rh["beats"], rh["bars"], {}
        count, on_bar, at = snap_sections(plan["shots"], bars, changes=changes, beats=beats, said=said)
        moved, mean = snap_cuts(plan["shots"], beats, skip=at) if how == "beats" else (0, 0.0)
        by = said.get("by_change", 0)
        plan["beats"] = {"tempo": rh["tempo"], "count": len(beats), "moved": moved, "grid": rh["grid"], "bars": len(bars), "on_bar": len(at) - by,
                         "by_change": by, "how": how}
        out = {"tempo": rh["tempo"], "beats": len(beats), "moved": moved, "cuts": max(0, len(plan["shots"]) - 1), "mean_ms": round(mean * 1000),
               "sections": count, "on_bar": len(at) - by, "by_change": by, "bar_moved": on_bar, "grid": rh["grid"],
               "bpm": round(float(meter[0]), 1) if meter else None, "how": how, "changes": None if changes is None else len(changes)}
        if changes is None and changes_error:
            out["changes_error"] = str(changes_error)[:300]
        if rh.get("said"):                               # HERESY 2361: what the DAW's grid says of itself (its tempo heard, bar 1, unsure)
            out["grid_said"] = rh["said"]
        elif grid_error or (grid is not None and not (isinstance(grid, dict) and grid.get("bars"))):   # asked and not had: said, never «no grid»
            out["grid_error"] = str(grid_error or (grid or {}).get("said") or "the DAW's grid has no bars for this take")[:300]
    _step(plan, before)
    plan["edited"] = time.time()
    _write(kit, name, plan)
    return dict(out, plan=_auto(dict(plan, exists=True)))


def _ass_time(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def _karaoke(r, a, b):
    """HERESY 2248: a line's words as ASS karaoke, each lit as it is sung (timing._word_times: Whisper's own time a word, the rest shared between
    them), the lead-in from a; (text, the words with a time heard)."""
    import timing
    ws = timing._word_times(r)
    tt = r.get("tt") if not r.get("guessed") else None
    heard = sum(1 for x in tt or [] if x)
    end = min(b, float(r["end"]))
    out, at = [], a
    for k, (w, s) in enumerate(ws):
        s = max(at, float(s))
        nxt = float(ws[k + 1][1]) if k + 1 < len(ws) else end
        if at < s:
            out.append(f"{{\\k{round((s - at) * 100)}}}")
            at = s
        d = max(0.01, max(nxt, s) - s)
        out.append(f"{{\\k{max(1, round(d * 100))}}}" + w.replace("\\", "/").replace("{", "(").replace("}", ")") + (" " if k + 1 < len(ws) else ""))
        at = s + d
    return "".join(out), heard


def lyrics_ass(rows, out, end, w=CW, h=CH, words=False):
    """HERESY 1916: the sung lines as an ASS file, each in its own time (from a little before to a little after, never into the next), white with a
    dark edge at the foot of the picture, fading in and out; DejaVu Sans writes Latin, Cyrillic, Greek and Hebrew. The lines written, or 0.
    HERESY 2248: words, karaoke: the line shown whole and each word lit warm gold as it is sung; (lines, words with Whisper's own time)."""
    rows = sorted((r for r in rows or [] if r.get("start") is not None and r.get("end") is not None and str(r.get("text") or "").strip()),
                  key=lambda r: float(r["start"]))
    side, foot = round(w * 0.06), round(h * (0.16 if h > w else 0.08))   # HERESY 1917: upright, above the phone's own buttons
    head = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
            "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV", f"Style: Line,DejaVu Sans,{round(min(w, h) * 0.05)},&H00FFFFFF,&H00101010,&H80000000,0,0,1,3,1,2,{side},{side},"
            f"{foot}", "", "[Events]", "Format: Layer, Start, End, Style, Text"]
    if words:                                            # HERESY 2248: the lit colour first, the colour still to sing second
        head[8] = ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, "
                   "Shadow, Alignment, MarginL, MarginR, MarginV")
        head[9] = f"Style: Line,DejaVu Sans,{round(min(w, h) * 0.05)},&H0066D9FF,&H00FFFFFF,&H00101010,&H80000000,0,0,1,3,1,2,{side},{side},{foot}"
    lines, heard = [], 0
    for i, r in enumerate(rows):
        a = float(r["start"]) - 0.1
        b = float(r["end"]) + 0.3
        if i + 1 < len(rows):
            b = min(b, float(rows[i + 1]["start"]) - 0.05)
        b = min(b, end)
        if b - a < 0.3:
            continue
        text = str(r["text"]).strip().replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")
        if words:
            text, n = _karaoke(dict(r, text=str(r["text"]).strip().replace("\n", " ")), a, b)
            heard += n
        lines.append(f"Dialogue: 0,{_ass_time(a)},{_ass_time(b)},Line,{{\\fad(180,220)}}{text}")
    Path(out).write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    return (len(lines), heard) if words else len(lines)


def titles_ass(out, end, w=CW, h=CH, title="", credits="", author="", verse="", style="centre"):
    """HERESY 1948: the clip's title over its first seconds (from 0.4 s to 5 s, or half a short clip; large, in the picture's middle) and the credits
    over its last 7 s (a line each, smaller), white with a dark edge, faded in and out; DejaVu Sans. The lines written: 0, 1 or 2.
    HERESY 2246: the author and the verse's address in a smaller line under the title; style, the title's template: «centre» (as it was), «lower»
    (a lower third: on a dark band at the left of the foot, from 1 s to 8 s), «corner» (small at the top left over the first 6 s)."""
    title, credits = " ".join(str(title or "").split()), str(credits or "").strip()
    sub_line = " · ".join(x for x in (" ".join(str(author or "").split()), " ".join(str(verse or "").split())) if x)
    side, big, small = round(w * 0.08), round(min(w, h) * 0.075), round(min(w, h) * 0.04)
    head = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
            "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV", f"Style: Title,DejaVu Sans,{big},&H00FFFFFF,&H00101010,&H80000000,1,0,1,3,2,5,{side},{side},0",
            f"Style: Credits,DejaVu Sans,{small},&H00FFFFFF,&H00101010,&H80000000,0,0,1,2,1,5,{side},{side},0",
            f"Style: Lower,DejaVu Sans,{round(min(w, h) * 0.05)},&H00FFFFFF,&H64000000,&H00000000,1,0,3,{max(6, round(min(w, h) * 0.014))},0,1,"
            f"{round(w * 0.05)},{side},{round(h * (0.16 if h > w else 0.1))}",
            f"Style: Corner,DejaVu Sans,{round(min(w, h) * 0.04)},&H00FFFFFF,&H00101010,&H80000000,1,0,1,2,1,7,{round(w * 0.04)},{side},{round(h * 0.05)}", "", "[Events]",
            "Format: Layer, Start, End, Style, Text"]
    clean = lambda t: t.replace("\\", "/").replace("{", "(").replace("}", ")")   # noqa: E731
    lines, title_end = [], min(5.0, max(1.5, end * 0.5))
    sub_line = clean(sub_line)
    if title and style == "lower":                       # HERESY 2246: a lower third
        title_end = min(8.0, max(2.0, end * 0.6))
        lines.append(f"Dialogue: 0,{_ass_time(1.0)},{_ass_time(title_end)},Lower,{{\\fad(400,500)}}{clean(title)}"
                     + (f"\\N{{\\b0\\fs{round(min(w, h) * 0.034)}}}{sub_line}" if sub_line else ""))
    elif title and style == "corner":
        title_end = min(6.0, max(1.5, end * 0.5))
        lines.append(f"Dialogue: 0,{_ass_time(0.4)},{_ass_time(title_end)},Corner,{{\\fad(400,500)}}{clean(title)}"
                     + (f"\\N{{\\b0\\fs{round(min(w, h) * 0.028)}}}{sub_line}" if sub_line else ""))
    elif title:
        lines.append(f"Dialogue: 0,{_ass_time(0.4)},{_ass_time(title_end)},Title,{{\\fad(500,600)}}{clean(title)}"
                     + (f"\\N{{\\b0\\fs{small}}}{sub_line}" if sub_line else ""))
    rows = [clean(l.strip()) for l in credits.splitlines() if l.strip()]
    if rows:
        a = max(end - 7.0, title_end + 0.2 if title else 0.0)
        b = max(a + 1.0, end - 0.2)
        lines.append(f"Dialogue: 0,{_ass_time(a)},{_ass_time(b)},Credits,{{\\fad(600,500)}}" + "\\N".join(rows))
    Path(out).write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    return len(lines)


def into(shots, i, between, every=False):
    """HERESY 2243: the pass into shot i: its own (a shot's «into», one of BETWEEN), else the clip's where a section changes, or at every cut when
    every; the first shot and a plain cut: «cut»."""
    if i <= 0 or i >= len(shots):
        return "cut"
    own = shots[i].get("into")
    if own in BETWEEN:
        return own
    return between if every or shots[i].get("section") != shots[i - 1].get("section") else "cut"


def _edges(shots, i, between, every=False):
    """HERESY 1916: a shot's own fades at a change of section: (fade in from black or white, fade out to black), as ffmpeg filters, or ''.
    2243: by the pass into it and into the next one (into())."""
    kin, kout = into(shots, i, between, every), into(shots, i + 1, between, every)
    fin = f"fade=t=in:st=0:d={DIP}" if kin == "black" else f"fade=t=in:st=0:d={FLASH}:color=white" if kin == "flash" else ""
    fout = f"fade=t=out:st={{T}}:d={DIP}" if kout == "black" else ""
    return fin, fout


def _melts(shots, lens, xd):
    """HERESY 1949: the shots that dissolve into the next one shown (lens: each shot's frames, 0 for one not shown): at a change of section, both
    longer than the dissolve; none when xd is 0."""
    return set(_melts_by(shots, lens, xd, lambda b: "dissolve" if shots[b].get("section") != shots[b - 1].get("section") else "cut"))


def _melts_by(shots, lens, xd, kind):
    """HERESY 2243: {a: xfade's transition} for each shot shown that passes into the next one shown by a laid-over pass (kind(b), the pass into b,
    one of XFADE), both longer than the pass."""
    shown = [i for i, k in enumerate(lens) if k > 0]
    return {a: XFADE[kind(b)] for a, b in zip(shown, shown[1:]) if xd and kind(b) in XFADE and lens[a] > xd and lens[b] > xd}


def _melt(tmp, parts, lens, melts, xd, nice=(), threads="2", enc=("-preset", "veryfast", "-crf", "20")):
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
            graph.append(f"[{prev}][v{k}]xfade=transition={melts.get(run[k - 1], 'fade') if isinstance(melts, dict) else 'fade'}:duration={xd / FPS:.3f}:offset={at / FPS:.3f}[x{k}]")
            prev = f"x{k}"
        name = f"melt{run[0]:04d}.mp4"
        ins = [a for i in run for a in ("-i", f"{i:04d}.mp4")]
        p = subprocess.run(list(nice) + ["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(graph), "-map", f"[{prev}]",
                                         "-frames:v", str(sum(lens[i] for i in run)), "-c:v", "libx264", *enc,
                                         "-pix_fmt", "yuv420p", "-threads", threads, name], cwd=str(tmp), capture_output=True, text=True, timeout=1800)
        if p.returncode != 0 or not (tmp / name).is_file():
            raise RuntimeError(f"ffmpeg, the dissolve after shot {run[0] + 1}: " + (p.stderr.strip()[-300:] or "no output"))
        out.append(f"file '{name}'")
    return out


def _tick(job, share, **kw):
    """HERESY 2326 (Viktor 10.11.2026: the clip's render showed no progress while its last pass ran): the clip job's progress (share of 1), its stage
    («shots» with the shot at and of, «melt», «final» with the seconds written and the song's) and the seconds it has run, as the page reads them."""
    if job is not None:
        job.update(progress=round(min(1.0, max(0.0, share)), 3), elapsed=round(time.time() - float(job.get("started") or time.time())), **kw)


def _watched(cmd, cwd, job, end, base, timeout=1800):
    """HERESY 2326: ffmpeg's last pass with its progress read as it goes (-progress pipe:1): the job from base to 1 by the seconds it has written of
    end. (return code, its error output)."""
    p = subprocess.Popen(cmd[:cmd.index("ffmpeg") + 1] + ["-progress", "pipe:1", "-nostats"] + cmd[cmd.index("ffmpeg") + 1:], cwd=cwd,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    err = []
    th = threading.Thread(target=lambda: err.extend(p.stderr), daemon=True)
    th.start()
    t0 = time.time()
    _tick(job, base, stage="final", at=0, of=round(end, 1))
    for line in p.stdout:
        if line.startswith("out_time_us="):
            try:
                t = int(line.split("=", 1)[1]) / 1e6
            except ValueError:
                continue
            if end > 0:
                _tick(job, base + (1 - base) * min(1.0, t / end), stage="final", at=round(t, 1), of=round(end, 1))
        if time.time() - t0 > timeout:
            p.kill()
            break
    try:
        p.wait(timeout=60)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait()
    th.join(timeout=5)
    return p.returncode, "".join(err)


def clip(kit, name, audio, cover=None, job=None, labels=None, rows=None, lyrics=False, between="cut", shape="16:9", titles=False, look="none", look_strength=1.0,
         grain=0.0, vignette=0.0, every=False, halation=0.0, jitter=0.0, reframe="hand", draft=False, title_style="centre", words=False, match=None,
         match_strength=MATCH, primary=None, native=False, upscale="lanczos"):
    """The clip cut from the shots' pictures in the song's time, with its sound; {file, shots, own, seconds}. A shot with no picture of its own
    shows the take's cover; in a take with none, its words and scene (the animatic's card, held still: what is still to picture).
    HERESY 1916: lyrics burns the sung lines in (rows: the take's Whisper timing); between: «cut», «black» or «flash» where a section changes;
    1949: «dissolve». 2010: look, a 3D LUT over every picture at look_strength (lab/luts.py), under the lyrics and the titles.
    2242: halation and jitter in the film. 2243: every, the pass at every cut (a shot's own «into» first); white, push, zoom. 2244: the 4k and tg
    presets; reframe, the crop of a narrower shape («hand»: each shot's focus, «centre», «subject»: found in the picture where no hand set it).
    2245: draft, a third of the size each way, quickly encoded, a file of its own. 2246: title_style («centre», «lower» third, «corner»).
    2248: words, the lyrics as karaoke, each word lit as sung. 2249: match, the shot whose picture every other is graded towards (match_strength).
    2250: primary {lift, gamma, gain, contrast, saturation}, each −1…1, before the look. 2251: «subject» finds the place down a picture too. 2252: 4K
    made at 1080p and scaled up after the look and the film, under the words (native, at 4K throughout as before).
    HERESY 2356 (Viktor 10.11.2026: «Видеографа лечи так, как качественнее, а не быстрее»): 24 fps, H3's own; upscale «lanczos» (a shot's video as
    H3 drew it, brought to the clip's size by Lanczos: no detail invented, no new face at a batch's seam) or «seedvr2» (SeedVR2's upscale where a shot
    has one); a shot's video shorter than its shot by at most STRETCH stretched to it (its frames evenly repeated), else its last frame held;
    jitter at most JITTER_MAX; the settings written beside the clip (NAME.clip.settings) and into its own metadata (comment)."""
    if upscale not in UPSCALE:
        raise ValueError("the upscale: lanczos or seedvr2")
    jitter = min(JITTER_MAX, max(0.0, float(jitter or 0)))
    if between not in BETWEEN:
        raise ValueError("between the shots: a cut, through black, a flash, a dissolve, through white, a push or a zoom")
    W, H = SHAPES.get(shape) or (0, 0)                   # HERESY 1917
    if not W:
        raise ValueError("the clip's shape: 16:9, 9:16, 1:1, 4k or tg")
    if reframe not in REFRAME:
        raise ValueError("the crop: hand, centre or subject")
    if title_style not in TITLE_STYLES:
        raise ValueError("the titles' template: centre, lower or corner")
    if draft:                                            # HERESY 2245
        W, H = draft_size(W, H)
    OW, OH = W, H                                        # HERESY 2252: the file's size; the pictures made at 1080p for a 4K one, scaled at the end
    if shape == "4k" and not draft and not native:
        W, H = SHAPES["16:9"]
    enc = ("-preset", "ultrafast", "-crf", "30") if draft else ("-preset", "veryfast", "-crf", "20")
    last_crf, abr = ("30", "96k") if draft else ENCODE.get(shape, ("20", "192k"))
    from PIL import Image
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    shots = plan["shots"]
    out = clip_path(kit, name, shape, draft)
    tmp = out.with_suffix(".part")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    end = max(float(plan.get("seconds") or 0), shots[-1]["t1"])
    cuts = [0] + [round(s["t0"] * FPS) for s in shots[1:]] + [round(end * FPS)]   # in frames: the cuts land on whole frames, the sum is the song
    nice = ["nice", "-n", "10"] if shutil.which("nice") else []
    threads = str(max(2, min(8, (os.cpu_count() or 4) // 4)))
    stills, parts, own, live, used = {}, [], 0, 0, []
    # HERESY 2326: the shots' share of the progress, the rest the last pass's (with words, a look, the film or a scaling it is encoded again whole)
    share = 0.45 if (lyrics or titles or (look and look != "none") or grain or vignette or halation or jitter or primary or (OW, OH) != (W, H)) else 0.9
    _tick(job, 0, stage="shots", at=0, of=len(shots))
    xd = round(MELT * FPS)                               # HERESY 1949: the shot before a dissolve runs on xd frames under the next one
    lens = [cuts[i + 1] - cuts[i] for i in range(len(shots))]
    melts = _melts_by(shots, lens, xd, lambda b: into(shots, b, between, every))   # HERESY 2243: each laid-over pass by its own kind
    ref, gains, spread = None, {}, []                   # HERESY 2249: the reference's palette, each picture's gains, the palettes before and after
    if match is not None and 0 <= int(match) < len(shots) and shots[int(match)].get("frame"):
        try:
            ref = palette_of(frame_path(kit, name, shots[int(match)]["frame"]))
        except (OSError, ValueError):
            ref = None

    def grade_of(src):
        if ref is None or src is None:
            return None
        k = str(src)
        if k not in gains:
            p = palette_of(src)
            gains[k] = match_gains(p, ref, match_strength)
            if p:
                g = gains[k] or [(1, 0)] * 3
                spread.append(([m for m, _ in p], [min(255, max(0, a * m + b)) for (m, _), (a, b) in zip(p, g)]))
        return gains[k]

    def focus_y_of(src):                                 # HERESY 2251: the subject's place down the picture, «subject» only
        return subject_focus_y(src, W, H) if reframe == "subject" and src is not None else 0.5

    def focus_of(s, src):                                # HERESY 2244: the crop's place across the picture
        if reframe == "centre":
            return 0.5
        if reframe == "subject" and "focus" not in s and src is not None:
            return subject_focus(src, W, H)
        return min(1.0, max(0.0, float(s.get("focus", 0.5))))
    for i, s in enumerate(shots):
        n = cuts[i + 1] - cuts[i]
        if n <= 0:
            continue
        m = n + (xd if i in melts else 0)                    # HERESY 1949: the frames rendered
        vid = None                                          # HERESY 1868: its own video, cut to the shot's length (its last frame held)
        if s.get("video"):
            for f in ((s.get("video_up") if upscale == "seedvr2" else None), s["video"]):   # HERESY 1876b: its upscale when there is one; 2356: when asked
                try:
                    vid = shot_video_path(kit, name, f) if f else None
                except (OSError, ValueError):
                    vid = None
                if vid is not None:
                    break
        if vid is not None:
            part = f"{i:04d}.mp4"
            thumb = None
            try:
                thumb = shot_video_path(kit, name, s["video"], thumb=True) if reframe == "subject" else None
            except (OSError, ValueError):
                thumb = None
            fx, fy = focus_of(s, thumb), focus_y_of(thumb)
            try:
                gv = match_vf(grade_of(shot_video_path(kit, name, s["video"], thumb=True))) if ref is not None else ""   # HERESY 2249
            except (OSError, ValueError):
                gv = ""
            have, k = _secs(vid) or 0.0, 1.0                 # HERESY 2356: a little short of the shot (one H3 pass), stretched to it
            if 0 < have < n / FPS <= have * STRETCH + 1e-3:
                k = n / FPS / have
            used.append({"i": i, "video": vid.name, "stretch": round(k, 4)})
            vf = (f"setpts={k:.5f}*PTS," if k > 1.0005 else "") + \
                f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}:(iw-{W})*{fx}:(ih-{H})*{fy},tpad=stop_mode=clone:stop_duration=15,format=yuv420p"
            vf = ",".join(x for x in (gv, vf) if x)
            vf = ",".join(x for x in (vf, *_edges(shots, i, between, every)) if x).replace("{T}", f"{max(0.0, n / FPS - DIP):.3f}")   # HERESY 1916
            p = subprocess.run(nice + ["ffmpeg", "-v", "error", "-y", "-i", str(vid), "-an", "-vf", vf, "-frames:v", str(m), "-c:v", "libx264", *enc,
                                        "-threads", threads, part], cwd=str(tmp), capture_output=True, text=True, timeout=1800)
            if p.returncode != 0 or not (tmp / part).is_file():
                raise RuntimeError(f"ffmpeg, shot {i + 1}'s video: " + (p.stderr.strip()[-300:] or "no output"))
            parts.append(f"file '{part}'")
            live += 1
            _tick(job, share * (i + 1) / len(shots), stage="shots", at=i + 1, of=len(shots))   # HERESY 2326
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
        card = str(src) in stills
        fx = 0.5 if card else focus_of(s, src)   # HERESY 2244: a card of words is whole, never cropped
        fy = 0.5 if card else focus_y_of(src)                # HERESY 2251
        gr = None if card else grade_of(src)                 # HERESY 2249
        key = f"{src}|{fx}|{fy}"
        if str(src) in stills:
            stills.setdefault(key, stills[str(src)])
        if key not in stills:
            stills[key] = tmp / f"still{len(stills):03d}.jpg"
            _still(src, stills[key], W, H, focus=fx, focus_y=fy, grade=gr)
        part = f"{i:04d}.mp4"
        vf = ",".join(x for x in (_move(move, m, W, H), *_edges(shots, i, between, every)) if x).replace("{T}", f"{max(0.0, n / FPS - DIP):.3f}")   # HERESY 1916
        p = subprocess.run(nice + ["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(stills[key]), "-vf", vf,
                                   "-frames:v", str(m), "-c:v", "libx264", *enc,  "-threads", threads, part],
                           cwd=str(tmp), capture_output=True, text=True, timeout=1800)
        if p.returncode != 0 or not (tmp / part).is_file():
            raise RuntimeError(f"ffmpeg, shot {i + 1}: " + (p.stderr.strip()[-300:] or "no output"))
        parts.append(f"file '{part}'")
        _tick(job, share * (i + 1) / len(shots), stage="shots", at=i + 1, of=len(shots))   # HERESY 2326
    if melts:                                               # HERESY 1949: each run of shots joined by dissolves made one part
        _tick(job, share, stage="melt")                     # HERESY 2326
        parts = _melt(tmp, parts, lens, melts, xd, nice, threads, enc)
    (tmp / "list.txt").write_text("\n".join(parts) + "\n", encoding="utf-8")
    sung, heard = lyrics_ass(rows, tmp / "lyrics.ass", end, OW, OH, True) if lyrics and words else (lyrics_ass(rows, tmp / "lyrics.ass", end, OW, OH) if lyrics else 0, 0)   # HERESY 1916; 1917: in the clip's shape; 2248
    shown = titles_ass(tmp / "titles.ass", end, OW, OH, plan.get("clip_title") or plan.get("title") or "", plan.get("credits") or "",
                       plan.get("author") or "", plan.get("verse") or "", title_style) if titles else 0   # HERESY 1948; 2246: the template, the author, the verse
    subs = ",".join(x for x in ("subtitles=lyrics.ass" if sung else "", "subtitles=titles.ass" if shown else "") if x)
    import luts                                          # HERESY 2010: the look, under the words
    graded = luts.vf(kit, look, look_strength, tmp) if look and look != "none" else None
    film = luts.film_vf(grain, vignette, halation, jitter, W, H)   # HERESY 2017: the grain and the vignette, after the look, under the words; 2242: halation, jitter
    prim = luts.primary_vf(**(primary or {})) if isinstance(primary, dict) else None   # HERESY 2250: before the look
    up = f"scale={OW}:{OH}:flags=lanczos" if (OW, OH) != (W, H) else None   # HERESY 2252: the finished 1080p scaled to 4K, under the words
    chain = ",".join(x for x in (prim, graded, film, up, subs) if x)
    video = ["-vf", chain, "-c:v", "libx264", enc[0], enc[1], "-crf", last_crf, "-threads", threads] if chain else ["-c:v", "copy"]
    kept = {"by": "Ruach Studio · Videographer", "made": round(time.time(), 1), "fps": FPS, "upscale": upscale, "shape": shape, "size": [OW, OH],   # HERESY 2356
            "made_at": [W, H], "draft": bool(draft), "native": bool(native), "between": between, "every": bool(every), "reframe": reframe,
            "look": look if graded else "none", "look_strength": round(float(look_strength), 3) if graded else None,
            "film": {"grain": round(float(grain or 0), 3), "vignette": round(float(vignette or 0), 3), "halation": round(float(halation or 0), 3),
                     "jitter": round(jitter, 3)},
            "primary": primary if prim else None, "lyrics": bool(sung), "words": bool(lyrics and words), "titles": bool(shown), "title_style": title_style,
            "match": int(match) if ref is not None else None, "match_strength": round(float(match_strength), 3) if ref is not None else None,
            "shots": len(shots), "own": own, "live": live, "videos": used}
    meta = ["-metadata", "comment=" + json.dumps(kept, ensure_ascii=False, separators=(",", ":"))]
    rc, err = _watched(nice + ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", str(audio), "-map", "0:v", "-map", "1:a",
                               *video, "-c:a", "aac", "-b:a", abr, *meta, "-shortest", "-movflags", "+faststart", "out.mp4"], str(tmp), job, end, share)   # HERESY 2326
    if rc != 0 or not (tmp / "out.mp4").is_file():
        raise RuntimeError("ffmpeg: " + (err.strip()[-300:] or "no output"))
    (tmp / "out.mp4").replace(out)
    part = settings_path(out).with_suffix(".settings-part")   # HERESY 2356: the settings beside the clip, whole or not at all
    part.write_text(json.dumps(kept, ensure_ascii=False, indent=1), encoding="utf-8")
    part.replace(settings_path(out))
    shutil.rmtree(tmp, ignore_errors=True)
    _tick(job, 1.0, stage="done")
    return {"file": out.name, "shots": len(shots), "own": own, "live": live, "seconds": round(end, 2), "lines": sung, "between": between, "shape": shape,
            "titles": shown, "look": look if graded else "none", "film": {"grain": grain, "vignette": vignette, "halation": halation, "jitter": jitter} if film else None,
            "every": bool(every), "reframe": reframe, "draft": bool(draft), "size": [OW, OH], "title_style": title_style if shown else None,
            "words": heard if lyrics and words else None, "primary": bool(prim), "made_at": [W, H],   # HERESY 2248, 2250, 2252
            "fps": FPS, "upscale": upscale, "settings": settings_path(out).name,   # HERESY 2356
            "match": {"ref": int(match), "spread_before": _spread([a for a, _ in spread]), "spread_after": _spread([b for _, b in spread])} if ref is not None else None}


def _spread(ms):
    """HERESY 2249: how far the pictures' mean colours stand apart: the mean distance (0–255, RGB) of each from their common mean."""
    if len(ms) < 2:
        return 0.0
    c = [sum(m[k] for m in ms) / len(ms) for k in range(3)]
    return round(sum(sum((m[k] - c[k]) ** 2 for k in range(3)) ** 0.5 for m in ms) / len(ms), 2)


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
    _step(plan, _state(plan, "split" if len(out) > len(old) else "join" if len(out) < len(old) else "move"))   # HERESY 2268
    plan.update(shots=out, edited=time.time())
    plan.pop("exists", None)
    plan.pop("beats", None)                                 # HERESY 1947: cut by hand now, not on the beats
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def recut_undo(kit, name):
    """The plan as it stood before its last edit (HERESY 2268: any edit of the plan, not the timeline's alone)."""
    return history(kit, name)


def split_long(kit, name, rows=None, lyrics=""):
    """HERESY 2356: a plan cut before 2356 (shots of up to 12 s) made ready for MiniMax H3 at 1280 × 704: each shot longer than one pass stretched by
    STRETCH cut into equal pieces of at most one pass (PASS_S), its scene, section, move and hero in each; the first piece keeps its picture, its
    video and the pass into it, the others get none, so «Draw the shots» paints each its own picture of the same scene (its own seed: another
    framing of the moment, a cut and never a seam). The words read again from the timing. One step of the plan's history. The plan with
    `split`, the shots cut."""
    with SETTING:
        plan = get(kit, name)
        if not plan.get("exists"):
            raise ValueError("no plan for this take yet: Make the plan first")
        plan.pop("exists", None)
        secs, out, n = sections_of(lyrics), [], 0
        before = _state(plan, "split-long")
        for s in plan["shots"]:
            if s["t1"] - s["t0"] <= PASS_S * STRETCH + 1e-6:
                out.append(s)
                continue
            n += 1
            for k, (a, b) in enumerate(_split(float(s["t0"]), float(s["t1"]), PASS_S)):
                p = {"t0": round(a, 2), "t1": round(b, 2), "scene": dict(s.get("scene") or {x: "" for x in SCENE_KEYS}), "section": s.get("section", "")}
                p.update({x: s[x] for x in ("move", "hero") if x in s})
                if rows:
                    p["words"], sec = _words_in(rows, secs, p["t0"], p["t1"])
                    p["section"] = sec or p["section"]
                else:
                    p["words"] = s.get("words", "") if k == 0 else ""
                p["sung"] = bool(p["words"]) or bool(s.get("sung"))
                if k == 0:
                    p.update({x: s[x] for x in ("frame", "frame_from", "frame_wh", "video", "video_from", "video_up", "video_up_from", "into") if x in s})
                out.append(p)
        out[-1]["t1"] = plan["shots"][-1]["t1"]
        if not n:
            return _auto(dict(plan, exists=True, split=0))
        _step(plan, before)
        plan.update(shots=out, edited=time.time())
        plan.pop("beats", None)                             # cut by hand now, not on the beats (as recut)
        _write(kit, name, plan)
        return _auto(dict(plan, exists=True, split=n))


# ---- HERESY 2268 (Viktor 08.11.2026: «В видеографе по незакрытым и по идеям, что возникнут у тебя по ходу, гони без моего одобрения»; the
# Videographer's open row «a project with history»): the plan's history. Each edit of the plan (the timeline's cut, join and move, the cuts'
# strictness, the scenes, the look and the titles kept, a shot's picture picked or taken off, the plan cut again) keeps the plan's state before it
# as a step, named, with the plan (so it outlives a reload, a restart, another browser): Undo goes a step back, Redo forward again, a new edit
# drops the steps undone. What the machines made since (a shot's video and its upscale, a picture the Artist drew for a shot) is never taken back
# by an undo of something else: it is carried into the state brought back by the shot's times. The clip's hero stays as chosen
HIST = ("shots", "look", "brief", "clip_title", "credits", "author", "verse", "beats", "places")   # HERESY 2356: the places
MADE = ("video", "video_from", "video_up", "video_up_from")


def _state(plan, what):
    st = json.loads(json.dumps({k: plan[k] for k in HIST if k in plan}, ensure_ascii=False))
    st["shots"] = [{k: v for k, v in s.items() if k != "auto"} for s in st.get("shots", [])]
    st.update(what=what, at=round(time.time(), 1))
    return st


def _same(a, b):
    return {k: a.get(k) for k in HIST} == {k: b.get(k) for k in HIST}


def _step(plan, state):
    plan["undo"] = (plan.get("undo") or [])[-(UNDO - 1):] + [state]
    plan.pop("redo", None)


def history(kit, name, redo=False):
    """Undo (or Redo) one step of the plan's history; the plan back with `step` {undone|redone: what}."""
    plan = get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    plan.pop("exists", None)
    src, dst = ("redo", "undo") if redo else ("undo", "redo")
    stack = list(plan.get(src) or [])
    if not stack:
        raise ValueError("nothing to redo" if redo else "nothing to undo")
    back = stack.pop()
    whole = isinstance(back, dict)
    if not whole:                                         # a step before 2268: the timeline's shots alone
        back = {"shots": back, "what": "timeline"}
    what = str(back.get("what") or "timeline")
    here = _state(plan, what)
    shots = [dict(s) for s in back.get("shots") or plan["shots"]]
    now = {(round(float(s["t0"]), 2), round(float(s["t1"]), 2)): s for s in plan["shots"]}
    pic = int(what.split(":")[1]) if what.startswith("picture") and ":" in what else None
    for i, s in enumerate(shots):                         # what the machines made since stays
        c = now.get((round(float(s["t0"]), 2), round(float(s["t1"]), 2)))
        if not c:
            continue
        if c.get("video") and not s.get("video"):
            s.update({k: c[k] for k in MADE if k in c})
        elif c.get("video_up") and c.get("video") == s.get("video") and not s.get("video_up"):
            s.update({k: c[k] for k in ("video_up", "video_up_from") if k in c})
        if c.get("frame") and not s.get("frame") and i != pic and (c.get("frame_from") or {}).get("by") == "frames":
            s.update({k: c[k] for k in ("frame", "frame_from", "frame_wh") if k in c})
    off = frames_dir(kit, name) / "off"                   # the pictures it brings back, from where they were put off
    for f in {s.get("frame") for s in shots if s.get("frame")}:
        if f and FRAME_RE.fullmatch(f) and not (frames_dir(kit, name) / f).is_file() and (off / f).is_file():
            (off / f).replace(frames_dir(kit, name) / f)
    kept = {s.get("frame") for s in shots}
    for s in plan["shots"]:                               # a picture it takes away, put off (kept), as frame_off does
        if s.get("frame") and s["frame"] not in kept:
            _put_off(kit, name, s["frame"])
    sd = shots_dir(kit, name)                             # its shots' videos too, with their first frames and upscales
    for f in {s.get("video") for s in shots if s.get("video")}:
        if f and SHOT_RE.fullmatch(f) and not (sd / f).is_file() and (sd / "off" / f).is_file():
            for q in [sd / "off" / f, (sd / "off" / f).with_suffix(".jpg")] + sorted((sd / "off").glob(Path(f).stem + "-up*.mp4")):
                if q.is_file():
                    q.replace(sd / q.name)
    vids = {s.get("video") for s in shots}
    for s in plan["shots"]:
        if s.get("video") and s["video"] not in vids:
            _put_video_off(kit, name, s["video"])
    plan["shots"] = shots
    if whole:
        for k in HIST[1:]:
            if k in back:
                plan[k] = back[k]
            else:
                plan.pop(k, None)
    elif isinstance(plan.get("beats"), dict):             # HERESY 2262: the strictness as the shots brought back were cut
        lv = _level(shots)
        if lv == "off":
            plan.pop("beats", None)
        else:
            plan["beats"]["how"] = lv
    plan[src] = stack
    plan[dst] = (plan.get(dst) or [])[-(UNDO - 1):] + [here]
    plan["edited"] = time.time()
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True, step={("redone" if redo else "undone"): what}))


# ---- HERESY 1868 (Viktor 29.10.2026: «мне нужна реальная DDiT генерация живого видеоклипа, а не просто слайдшоу»): a shot's own video, made by
# MiniMax H3 (lab/h3_shots.py): in NAME.shots/, its first frame beside it (.jpg) for the timeline; the one it replaces put off (kept); the clip
# takes it in the shot's place, cut to the shot's length (its last frame held when it is shorter)
SHOT_RE = re.compile(r"\d{8}-\d{6}-\d{3}-\d{3}\.mp4")
SHOT_UP_RE = re.compile(r"\d{8}-\d{6}-\d{3}-\d{3}-up(?:720|1080|1440)\.mp4")   # HERESY 2324: 720p too   # HERESY 1876b: a shot's video upscaled by SeedVR2


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
    with SETTING:                                    # HERESY 2308
        return _shot_video_set(kit, name, job)


def _shot_video_set(kit, name, job):
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
    s["video_from"] = {k: job.get(k) for k in ("mode", "steps", "seed", "width", "height", "took_s", "gpu", "seconds_made", "first", "last")}   # 2361: its last frame
    s["video_from"]["model"] = "MiniMax H3"
    plan.pop("exists", None)
    _write(kit, name, plan)
    return _auto(dict(plan, exists=True))


def shot_up_set(kit, name, video, up, info):
    with SETTING:                                    # HERESY 2308
        return _shot_up_set(kit, name, video, up, info)


def _shot_up_set(kit, name, video, up, info):
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
