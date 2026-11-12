"""HERESY 2313 · a take's bar grid, one for the DAW and the Videographer (Viktor's plan of 08.11.2026, §2.4 «Сетка тактов и привязка к долям:
вырезки, копии, петля» and §2.6 «Резы по битам и секциям — от той же сетки тактов, что в DAW»).

The take's own tempo and meter come first: the score's Q: and M: (dawproject.tempo_meter), else a bpm in its style. But a song as YuE2 sings it
does not keep its score's tempo to the beat: measured 10.11.2026 on seven of Viktor's takes, the beats heard ran 0.1 to 1.3 % off the score
(Буратино v9.3.6, written at 85, sang at 86.1: 5.6 s ahead by the end of its seven minutes), and a take without Q: (read at 120) sang at 132
or 143. So a grid at the score's tempo from 0 s is bars off by the end, and this one follows the beats heard in the take's own sound:
librosa's beat tracker on its onset strength, the take's tempo its prior; a beat heard twice as fast as the score's is halved, half as fast
doubled. Its bars begin on the beat whose phase best fits where the take's music itself changes (takechanges, the changes the player snaps the
sections to), where its downbeats sound strongest, and, with a score, near the song's start (the score's first bar is the song's first).

With a score, its bars are the score's own (a bar of 3/4 among 4/4 kept), each laid on the heard beats, and its chord symbols and keys on
them too: the DAW's chord lane. The hand may set the tempo twice or half what was heard, where a bar begins and how many beats a bar holds;
what it sets is kept with the beats, and the grid made again from them, nothing heard again.

Kept beside the take (bargrid.json) for its audio's time and size, as takechanges keeps changes.json.

    grid(take_dir, audio, req)            the grid, heard once and kept
    derive(heard, prior, settings, score) the grid from beats already heard (no sound read): what the hand's settings make
    settle(take_dir, audio, req, change)  the hand's settings changed and kept; the grid made again
"""
from __future__ import annotations

import json
import math
import os
import time
from fractions import Fraction
from pathlib import Path

import numpy as np

SR, HOP = 22050, 256                                  # 11.6 ms frames
KEEP = "bargrid.json"
VERSION = 1
LEVELS = (0.25, 0.5, 1.0, 2.0, 3.0, 4.0)             # grid beats a heard beat: every fourth, every other, as heard, one more between, two, three
LEVEL_TOL = 0.18                                      # a heard tempo this near a level of the prior takes that level
METERS = (2, 3, 4, 5, 6, 7, 9, 12)


def _key(audio):
    st = os.stat(audio)
    return [int(st.st_mtime), int(st.st_size)]


def prior_of(req):
    """(bpm in quarter notes, beats a bar, its note, where it came from: "score", "style" or "") — the take's own tempo and meter."""
    import re
    abc = (req or {}).get("abc") or ""
    src = ""
    if re.search(r"^Q:\s*(?:\d+/\d+\s*=\s*)?\d", abc, re.M):
        src = "score"
    elif re.search(r"\d{2,3}(?:\.\d+)?\s*bpm", (req or {}).get("style") or "", re.I):
        src = "style"
    from dawproject import tempo_meter
    bpm, num, den = tempo_meter(req or {})
    return float(bpm), int(num), int(den), src


def hear(audio, prior_beats_a_minute=None):
    """The beats heard in the take's sound (librosa's tracker on its onset strength, 22 050 Hz mono), each with its onset strength (the
    strongest frame within 23 ms of it); the prior steers which pulse it follows."""
    import librosa
    y, sr = librosa.load(str(audio), sr=SR, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    kw = {"start_bpm": float(prior_beats_a_minute)} if prior_beats_a_minute else {}
    _tempo, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, **kw)
    frames = np.asarray(frames, dtype=int)
    beats = librosa.frames_to_time(frames, sr=sr, hop_length=HOP)
    st = [float(env[max(0, f - 2):f + 3].max()) if len(env) else 0.0 for f in frames]
    return {"beats": [round(float(b), 3) for b in beats], "strength": [round(s, 3) for s in st], "seconds": round(len(y) / sr, 3)}


def level_auto(beats, prior_beats_a_minute):
    """The level that brings the heard pulse to the prior's: 0.5 when the tracker heard twice as many beats, 2 when half as many; 1 when
    there is no prior or none fits."""
    if not prior_beats_a_minute or len(beats) < 8:
        return 1.0
    ibi = float(np.median(np.diff(beats)))
    want = 60.0 / prior_beats_a_minute
    for lv in LEVELS:
        if abs(ibi / lv / want - 1) <= LEVEL_TOL:
            return lv
    return 1.0


def at_level(beats, strength, level):
    """The heard beats at a level: below 1 every n-th (the run whose beats sound strongest), above 1 evenly between each two."""
    b, s = list(beats), list(strength)
    if level >= 1:
        k = int(round(level))
        if k <= 1 or len(b) < 2:
            return b, s
        ob, os_ = [], []
        for i in range(len(b) - 1):
            for j in range(k):
                ob.append(round(b[i] + (b[i + 1] - b[i]) * j / k, 3))
                os_.append(s[i] if j == 0 else 0.0)
        ob.append(b[-1])
        os_.append(s[-1])
        return ob, os_
    n = int(round(1 / level))
    if n <= 1 or len(b) < n:
        return b, s
    p = max(range(n), key=lambda q: float(np.mean(s[q::n])) if s[q::n] else -1.0)
    return b[p::n], s[p::n]


def extend(beats, seconds):
    """The beats carried past both ends of the song at the pace of their first and last eight (so bar lines exist from 0 s to the end):
    (beats, how many were added before)."""
    b = list(beats)
    if len(b) < 2:
        return b, 0
    head = float(np.mean(np.diff(b[:9])))
    tail = float(np.mean(np.diff(b[-9:])))
    pre = []
    t = b[0] - head
    while t > -head and head > 0.05:
        pre.insert(0, round(t, 3))
        t -= head
    post = []
    t = b[-1] + tail
    while t < seconds + tail and tail > 0.05:
        post.append(round(t, 3))
        t += tail
    return pre + b + post, len(pre)


def phase_scores(beats, strength, num, changes, pre, has_score):
    """Each phase of the bar (0 … num−1, the beat a bar begins on, counted in the extended beats) and why: the music's own changes near its
    bar lines (their strength's share), its downbeats' onset strength against the mean, and, with a score, a bar line near 0 s."""
    b = np.asarray(beats, dtype=float)
    st = np.asarray([0.0] * pre + list(strength) + [0.0] * (len(beats) - pre - len(strength)), dtype=float)
    heard = st[pre:pre + len(strength)]
    mean = float(heard.mean()) if len(heard) else 0.0
    ibi = float(np.median(np.diff(b))) if len(b) > 1 else 0.5
    tol = min(0.3, 0.4 * ibi)
    total = sum(float(c.get("strength") or 0) for c in changes) or 0.0
    out = []
    for p in range(num):
        lines = b[p::num]
        ons = st[p::num]
        ons = ons[ons > 0]
        a = float(ons.mean()) / mean if mean > 0 and len(ons) else 0.0
        hit = 0.0
        for c in changes:
            t = float(c.get("t") or 0)
            if len(lines) and float(np.min(np.abs(lines - t))) <= tol:
                hit += float(c.get("strength") or 0)
        ch = hit / total if total > 0 else 0.0
        near0 = float(np.min(np.abs(lines))) if len(lines) else 9.0
        s0 = math.exp(-(near0 / (0.5 * ibi)) ** 2) if has_score else 0.0
        out.append({"phase": p, "changes": round(ch, 3), "onsets": round(a, 3), "start": round(s0, 3),
                    "score": round(2.0 * ch + 1.0 * (a - 1.0) + 0.5 * s0, 4)})
    return out


def score_of(req, take_dir=None):
    """(the score's text, where from: "request" or "from sound", or ("", "")): the take's own score, else the one the transcriber wrote."""
    abc = ((req or {}).get("abc") or "").strip()
    if abc:
        return abc, "request"
    if take_dir:
        f = Path(take_dir) / "score-from-sound.abc"
        try:
            t = f.read_text(encoding="utf-8").strip()
            if t:
                return t, "from sound"
        except OSError:
            pass
    return "", ""


def score_marks(abc):
    """(bars [(start, length, meter) in quarter notes], chords [(start, symbol)], keys [(start, key)], meter (n, d), why): the score as the
    lab's checker reads it; why says what kept it from being read."""
    if not abc:
        return [], [], [], None, ""
    import abc_tools
    try:
        sc = abc_tools.parse_abc(abc)
    except (ValueError, KeyError, IndexError) as e:
        return [], [], [], None, (str(e)[:120] or type(e).__name__)
    v = sc.voices["Vocal"]
    bars = [(Fraction(a), Fraction(n), m) for a, n, m in v.bars]
    chords = sorted((Fraction(t), c) for t, c in v.chords)
    keys = sorted((Fraction(t), k) for t, k in v.keys)
    meter = tuple(bars[0][2]) if bars else None
    return bars, chords, keys, meter, ""


def _time_at(beats, idx):
    """The time of a (fractional) beat index on the extended beats, carried on at the edges' pace."""
    n = len(beats)
    if n == 0:
        return 0.0
    if n == 1:
        return float(beats[0])
    if idx <= 0:
        return float(beats[0] + (beats[1] - beats[0]) * idx)
    if idx >= n - 1:
        return float(beats[-1] + (beats[-1] - beats[-2]) * (idx - (n - 1)))
    i = int(math.floor(idx))
    return float(beats[i] + (beats[i + 1] - beats[i]) * (idx - i))


def _first(ext, phase, num, ibi):
    """Bar 1 for a phase: the downbeat nearest the song's start; one a little before 0 s too (its first beat lost in the song's first
    frames), never more than a third of a bar before it."""
    downs = list(range(phase, len(ext), num))
    if not downs:
        return 0
    first = min(downs, key=lambda i: abs(ext[i]))
    if ext[first] < -0.35 * ibi * num and first + num < len(ext):
        first += num
    return first


def derive(heard, prior, settings=None, score=None, changes=None, seconds=None):
    """The grid from beats already heard: {beats, bars, bar_numbers…, chords, keys, num, den, bpm, level, phase, how, said}. `prior` (bpm in
    quarters, num, den, source); `settings` what the hand set ({factor, downbeat, num}); `score` its text; `changes` the take's [{t, strength}]."""
    settings = dict(settings or {})
    bpm0, num0, den0, src = prior
    seconds = float(seconds if seconds is not None else heard.get("seconds") or 0)
    abc = score or ""
    sbars, schords, skeys, smeter, why = score_marks(abc)
    if smeter:                                        # the score's own meter over its style's
        num0, den0 = int(smeter[0]), int(smeter[1])
    num = int(settings.get("num") or num0 or 4)
    if num not in METERS:
        num = 4
    den = int(den0 or 4)
    prior_beats = (bpm0 * den / 4.0) if src else None   # a placeholder 120 is no prior
    hb, hs = heard.get("beats") or [], heard.get("strength") or []
    out = {"v": VERSION, "how": "heard", "num": num, "den": den, "prior": {"bpm": round(bpm0, 2), "from": src or "none"},
           "settings": {k: settings[k] for k in ("factor", "downbeat", "num") if settings.get(k) is not None}, "seconds": round(seconds, 3)}
    if len(hb) < 8:
        out.update({"how": "none", "beats": [], "bars": [], "chords": [], "keys": [], "bpm": None, "level": 1.0, "phase": 0,
                    "said": "too few beats heard in the take's sound to lay a grid on"})
        return out
    auto = level_auto(hb, prior_beats)
    factor = float(settings.get("factor") or 1.0)
    level = auto * factor
    level = min(LEVELS, key=lambda x: abs(math.log(x / level))) if level > 0 else 1.0
    beats, strength = at_level(hb, hs, level)
    ext, pre = extend(beats, seconds)
    ibi = float(np.median(np.diff(beats)))
    scores = phase_scores(ext, strength, num, list(changes or []), pre, bool(sbars))
    per_q = den / 4.0                                 # grid beats a quarter note
    ranked = sorted(scores, key=lambda x: -x["score"])
    sure = len(ranked) < 2 or ranked[0]["score"] - ranked[1]["score"] >= 0.15
    if settings.get("downbeat") is not None:          # the hand: a bar begins on the beat nearest this second
        t = float(settings["downbeat"])
        i = int(np.argmin(np.abs(np.asarray(ext) - t)))
        phase, how_phase = i % num, "set by hand"
    else:
        best = max(scores, key=lambda x: x["score"])
        phase, how_phase = best["phase"], "heard"
    first = _first(ext, phase, num, ibi)
    bars, numbers = [], []
    chords, keys = [], []
    if sbars:                                         # the score's bars, laid on the beats from bar 1
        def tq(q):
            return round(_time_at(ext, first + float(q) * per_q), 3)
        for k, (a, _n, _m) in enumerate(sbars):
            t = tq(a)
            if -0.05 <= t <= seconds + 0.01:
                bars.append(round(max(0.0, t), 3))
                numbers.append(k + 1)
        end_q = sbars[-1][0] + sbars[-1][1]
        idx, step, k = first + float(end_q) * per_q, float(sbars[-1][1]) * per_q, len(sbars)
        while step > 0:                               # past the score's end: on in bars of its last length
            t = round(_time_at(ext, idx), 3)
            if t > seconds + 0.01:
                break
            if t >= -0.05:
                bars.append(round(max(0.0, t), 3))
                numbers.append(k + 1)
            k += 1
            idx += step
        span_end = round(min(seconds, tq(end_q)), 3)
        for j, (q, c) in enumerate(schords):
            if j and schords[j - 1][1] == c:
                continue
            t0 = tq(q)
            if t0 >= seconds:
                break
            chords.append([t0, None, c])
        for j in range(len(chords)):
            chords[j][1] = chords[j + 1][0] if j + 1 < len(chords) else max(span_end, chords[j][0])
        for q, kname in skeys:
            t0 = tq(q)
            if t0 < seconds and not (keys and keys[-1][1] == kname):
                keys.append([max(0.0, t0), kname])
    else:
        for n, i in enumerate(range(first, len(ext), num), 1):
            if ext[i] > seconds + 0.01:
                break
            if ext[i] >= -0.05:
                bars.append(round(max(0.0, ext[i]), 3))
                numbers.append(n)
    grid_beats = [round(max(0.0, t), 3) for t in ext if -0.05 <= t <= seconds + 0.01]
    bpm = round(60.0 / ibi * (4.0 / den), 2) if ibi > 0 else None
    if bpm and src:
        drift = (bpm / bpm0 - 1) * 100
        said = f"{bpm:g} bpm heard ({src}: {bpm0:g}, {'+' if drift >= 0 else '−'}{abs(drift):.1f} %)"
    else:
        said = f"{bpm:g} bpm heard" if bpm else "no tempo heard"
    if level != 1.0:
        said += f", the tracker's beats ×{level:g}"
    said += (f"; {num}/{den}, bar 1 at {bars[0]:.2f} s ({how_phase}" + ("" if sure or how_phase != "heard" else ", unsure: set it by hand") + ")") if bars else ""
    if why:
        said += f"; the score could not be read ({why})"
    out.update({"beats": grid_beats, "bars": bars, "bar_numbers": numbers, "chords": chords, "keys": keys, "bpm": bpm, "level": level,
                "level_auto": auto, "phase": phase, "phase_how": how_phase, "phase_sure": bool(sure), "phases": scores, "score": bool(sbars), "said": said})
    return out


def _load(take_dir):
    try:
        return json.loads((Path(take_dir) / KEEP).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write(take_dir, data):
    f = Path(take_dir) / KEEP
    tmp = f.with_name(f"{KEEP}.{os.getpid()}.part")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, f)


def grid(take_dir, audio, req, changes=None, keep=True):
    """The take's grid: its beats heard once (kept in bargrid.json for its audio's time and size and its tempo prior), the grid derived from
    them with what the hand set. `changes`: the take's [{t, strength}] (takechanges), or None when not heard."""
    prior = prior_of(req)
    key = _key(audio) + [round(prior[0], 3), prior[1], prior[2], prior[3]]
    kept = _load(take_dir) if keep else {}
    heard = kept.get("heard") if kept.get("of") == key and kept.get("v") == VERSION else None
    if not heard:
        prior_beats = prior[0] * prior[2] / 4.0 if prior[3] else None
        heard = hear(audio, prior_beats)
        kept = {"v": VERSION, "of": key, "heard": heard, "settings": kept.get("settings") or {}, "made": time.strftime("%Y-%m-%d %H:%M")}
        if keep:
            _write(take_dir, kept)
    abc, whence = score_of(req, take_dir)
    out = derive(heard, prior, kept.get("settings"), abc, changes, heard.get("seconds"))
    out["score_from"] = whence
    out["changes"] = None if changes is None else len(changes)
    return out


def settle(take_dir, audio, req, change, changes=None):
    """What the hand sets, kept: {factor: ×2 or ÷2 of the tempo heard (a number, multiplied in), downbeat: a second a bar begins on (null: as
    heard), num: beats a bar (null: the score's), reset: true (all of it as heard)}; the grid made again."""
    kept = _load(take_dir)
    s = dict(kept.get("settings") or {})
    change = dict(change or {})
    if change.get("reset"):
        s = {}
    if "factor" in change:
        f = float(change["factor"]) * float(s.get("factor") or 1.0)
        if not 0.24 <= f <= 4.01:
            raise ValueError("the tempo can be set from a quarter to four times what was heard")
        s["factor"] = round(f, 4) if abs(f - 1) > 1e-6 else None
    if "downbeat" in change:
        d = change["downbeat"]
        if d is not None and not (isinstance(d, (int, float)) and 0 <= float(d) <= 86400):
            raise ValueError("downbeat: a second of the take, or null")
        s["downbeat"] = None if d is None else round(float(d), 3)
    if "num" in change:
        n = change["num"]
        if n is not None and int(n) not in METERS:
            raise ValueError(f"num: beats a bar, one of {list(METERS)}, or null")
        s["num"] = None if n is None else int(n)
    s = {k: v for k, v in s.items() if v is not None}
    out = grid(take_dir, audio, req, changes)        # heard first (kept), then the settings laid on
    kept = _load(take_dir)
    kept["settings"] = s
    _write(take_dir, kept)
    abc, whence = score_of(req, take_dir)
    res = derive(kept["heard"], prior_of(req), s, abc, changes, kept["heard"].get("seconds"))
    res["score_from"] = whence
    res["changes"] = out.get("changes")
    return res
