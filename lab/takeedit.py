"""HERESY 1356 (from SUNO v6, TODO.md: «Crop and Remove a section on the score's bar lines, each cut healed by a short crossfade (SUNO: Crop,
Remove Section, Heal Edits)»; «Adjust speed without changing the pitch (a time stretch), the new tempo written into the score»; Viktor
11.10.2026: «Идеи из SUNO внедряй для релиза 2.0.0, чтобы не возвращаться к этому больше. Это базовые быстрые функции»): a take's own sound
cut or stretched into a new take, the take itself untouched. Crop keeps one stretch; Remove takes stretches out; each join is healed by a
crossfade of XFADE seconds (a half cosine, as a loop's seam) centred on the cut, so the music runs on in time (the page cuts on the score's bar lines, where the
beat goes on the same). Speed stretches the sound by ffmpeg's rubberband (its pitch kept; atempo where ffmpeg has no rubberband), its
score's tempo written anew by the page. The new take has the old one's request and meta, its own sound, length and title, the page's
score for it (or none), and «edited» saying from which take and how; no latents (its sound is no longer theirs), so it is not decoded again."""
import json, os, re, shutil, subprocess, time
from pathlib import Path

import numpy as np
import soundfile as sf

XFADE = 0.06                    # the crossfade at each join, s (a half cosine, its middle on the cut)
EDGE = 0.01                     # a cropped start or end faded over this much, s, so it does not click
SPEED = (0.5, 2.0)              # the factors a stretch keeps its sound within


def _join(parts, sr):
    """The kept stretches as one, each join crossfaded over XFADE with its middle on the cut (a half cosine, as the loops are healed:
    the two sides are the same music, so their gains add to one): the stretch before runs on past its cut fading out while the next
    comes in from before its own. parts: [(audio, a, b)], audio the whole take, a and b a stretch's frames. The length is the stretches'
    own, the cuts keep their time."""
    x, n = parts[0][0], len(parts)
    h = int(round(XFADE * sr / 2))
    hs = []
    for i in range(1, n):
        (_, a0, b0), (_, a1, b1) = parts[i - 1], parts[i]
        hs.append(max(0, min(h, len(x) - b0, a1, (b0 - a0) // 2, (b1 - a1) // 2)))
    out = []
    for i, (_, a, b) in enumerate(parts):
        out.append(x[a + (hs[i - 1] if i else 0):b - (hs[i] if i < n - 1 else 0)])
        if i < n - 1 and hs[i] > 0:
            hh, a1 = hs[i], parts[i + 1][1]
            w = (0.5 * (1.0 - np.cos(np.pi * (np.arange(2 * hh) + 0.5) / (2 * hh))))[:, None]
            out.append(x[b - hh:b + hh] * (1.0 - w) + x[a1 - hh:a1 + hh] * w)
    return np.concatenate(out) if out else np.zeros((0, x.shape[1]))


def cut(src, spans, out, keep=True):
    """src's sound with spans kept (keep) or taken out, its joins healed, into out at src's own rate and depth: {seconds, joins}.
    spans: [[a, b]] in seconds, within the take."""
    info = sf.info(str(src))
    sr, n = info.samplerate, info.frames
    sp = sorted([max(0.0, float(a)), min(n / sr, float(b))] for a, b in spans)
    if not sp or any(b - a < 0.5 for a, b in sp):
        raise ValueError("each stretch half a second at least, within the take")
    for (a1, b1), (a2, b2) in zip(sp, sp[1:]):
        if a2 < b1:
            raise ValueError("the stretches overlap")
    if not keep:                                       # what stays: the gaps around the stretches taken out
        stay, at = [], 0.0
        for a, b in sp:
            if a - at >= 0.05:
                stay.append([at, a])
            at = b
        if n / sr - at >= 0.05:
            stay.append([at, n / sr])
        sp = stay
    if not sp or sum(b - a for a, b in sp) < 1.0:
        raise ValueError("nothing would be left of the take")
    x, _ = sf.read(str(src), dtype="float64", always_2d=True)
    parts = [(x, int(round(a * sr)), int(round(b * sr))) for a, b in sp]
    y = _join(parts, sr)
    e = int(round(EDGE * sr))
    if parts[0][1] > 0 and len(y) > 2 * e:              # a start cut into the song: faded in, not clicked
        y[:e] *= np.linspace(0, 1, e)[:, None]
    if parts[-1][2] < n and len(y) > 2 * e:             # an end cut out of it: faded out
        y[-e:] *= np.linspace(1, 0, e)[:, None]
    sub = info.subtype if info.subtype in ("PCM_16", "PCM_24", "PCM_32", "FLOAT") else "PCM_24"
    sf.write(str(out), np.clip(y, -1.0, 1.0), sr, subtype=sub)
    return {"seconds": len(y) / sr, "joins": max(0, len(sp) - 1), "kept": sp}


def arrange(src, spans, out):
    """HERESY 1714: src's stretches in the order given, the same one more than once if asked (a section repeated, a part inserted after
    another), each join healed by _join, into out at src's own rate and depth: {seconds, joins, kept}. spans: [[a, b]] in seconds, within the
    take, half a second each at least; their order is the new take's."""
    info = sf.info(str(src))
    sr, n = info.samplerate, info.frames
    sp = [[max(0.0, float(a)), min(n / sr, float(b))] for a, b in spans]
    if not sp or any(b - a < 0.5 for a, b in sp):
        raise ValueError("each stretch half a second at least, within the take")
    if sum(b - a for a, b in sp) < 1.0:
        raise ValueError("nothing would be left of the take")
    x, _ = sf.read(str(src), dtype="float64", always_2d=True)
    parts = [(x, int(round(a * sr)), int(round(b * sr))) for a, b in sp]
    y = _join(parts, sr)
    e = int(round(EDGE * sr))
    if parts[0][1] > 0 and len(y) > 2 * e:              # a start cut into the song: faded in, not clicked
        y[:e] *= np.linspace(0, 1, e)[:, None]
    if parts[-1][2] < n and len(y) > 2 * e:             # an end cut out of it: faded out
        y[-e:] *= np.linspace(1, 0, e)[:, None]
    sub = info.subtype if info.subtype in ("PCM_16", "PCM_24", "PCM_32", "FLOAT") else "PCM_24"
    sf.write(str(out), np.clip(y, -1.0, 1.0), sr, subtype=sub)
    return {"seconds": len(y) / sr, "joins": max(0, len(sp) - 1), "kept": sp}


def rubberband_here():
    try:
        p = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True, timeout=20)
        return " rubberband " in p.stdout
    except (OSError, subprocess.SubprocessError):
        return False


def stretch(src, factor, out):
    """src played factor times as fast, its pitch kept: ffmpeg's rubberband (its finer engine where it has one), else atempo.
    {seconds, by}."""
    f = float(factor)
    if not SPEED[0] <= f <= SPEED[1]:
        raise ValueError(f"a speed from ×{SPEED[0]} to ×{SPEED[1]}")
    info = sf.info(str(src))
    codec = {"PCM_16": "pcm_s16le", "PCM_32": "pcm_s32le", "FLOAT": "pcm_f32le"}.get(info.subtype, "pcm_s24le")
    by = "rubberband" if rubberband_here() else "atempo"
    af = f"rubberband=tempo={f:.6f}:pitchq=quality:transients=smooth" if by == "rubberband" else f"atempo={f:.6f}"
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-c:a", codec, "-ar", str(info.samplerate), str(out)],
                       capture_output=True, text=True, timeout=1800)
    if p.returncode != 0:
        raise RuntimeError("ffmpeg could not stretch it: " + (p.stderr.strip().splitlines() or ["?"])[-1][-300:])
    return {"seconds": sf.info(str(out)).frames / info.samplerate, "by": by}


def make(outputs, name, body, take_dir):
    """A new take beside name, its sound edited (body: {op: crop | remove | arrange | speed, spans, factor, abc, title}): its folder's name."""
    src = take_dir(name)
    wav = src / "audio.wav"
    if not wav.is_file():
        raise FileNotFoundError("this take has no audio.wav to edit")
    op = str(body.get("op") or "")
    if op not in ("crop", "remove", "arrange", "speed"):          # HERESY 1714: arrange
        raise ValueError("op: crop, remove, arrange or speed")
    title = str(body.get("title") or "").strip()[:200]
    abc = body.get("abc")
    if abc is not None and (not isinstance(abc, str) or len(abc) > 2 ** 20):
        raise ValueError("the score: ABC text, a megabyte at most")
    stem = re.sub(r"[^a-z0-9]+", "-", name.split("-", 3)[-1].lower()).strip("-")[:40] or "take"
    new = time.strftime("%Y%m%d-%H%M%S") + "-01-" + op + "-" + stem
    d = Path(outputs) / new
    if d.exists():
        raise ValueError("a take of that name is there already: try again in a second")
    tmp = Path(outputs) / ("." + new + ".part")
    tmp.mkdir(parents=True)
    try:
        if op == "speed":
            said = stretch(wav, body.get("factor"), tmp / "audio.wav")
            how = {"op": op, "factor": round(float(body.get("factor")), 4), "by": said["by"]}
        else:
            spans = body.get("spans")
            if not isinstance(spans, list) or not spans or len(spans) > 64:
                raise ValueError("the stretches: one to sixty-four [start, end] in seconds")
            if op == "arrange":                            # HERESY 1714: the stretches in the page's order, repeats allowed
                said = arrange(wav, spans, tmp / "audio.wav")
                how = {"op": op, "spans": [[round(float(a), 3), round(float(b), 3)] for a, b in spans], "xfade": XFADE}
            else:
                said = cut(wav, spans, tmp / "audio.wav", keep=(op == "crop"))
                how = {"op": op, "spans": [[round(a, 3), round(b, 3)] for a, b in sp(spans)], "kept": [[round(a, 3), round(b, 3)] for a, b in said["kept"]],
                       "xfade": XFADE}
        meta = json.loads((src / "meta.json").read_text(encoding="utf-8")) if (src / "meta.json").is_file() else {}
        req = json.loads((src / "request.json").read_text(encoding="utf-8")) if (src / "request.json").is_file() else {}
        how.update({"from": name, "at": time.strftime("%Y-%m-%d %H:%M")})
        meta.update({"title": title or (meta.get("title") or name), "created": int(time.time()), "seconds": said["seconds"], "format": "wav24",
                     "favorite": False, "truncated": False, "edited": how})
        meta.pop("rating", None)
        if title:
            req["title"] = title
        if abc is not None:                            # the page's score for the new take, or none
            if abc:
                req["abc"] = abc
            else:
                req.pop("abc", None)
        req.pop("parent", None)                        # not the same music under another decoder: its own lineage is «edited»
        req["edited"] = how
        (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=4), encoding="utf-8")
        (tmp / "request.json").write_text(json.dumps(req, ensure_ascii=False), encoding="utf-8")
        tmp.rename(d)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return {"name": new, "title": meta["title"], "seconds": round(said["seconds"], 2), "edited": how}


def sp(spans):
    return sorted([float(a), float(b)] for a, b in spans)
