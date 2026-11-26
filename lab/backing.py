"""HERESY 2677 · a voice over the user's own backing track (Viktor 18.11.2026: «Голос поверх своей минусовки … строй, раз сам предложил, и строй
основательно, чтобы не возвращаться к этому позже»).

The way, end to end (lab.py runs it; this file holds the parts that do the work, each one testable alone):

  1. the backing: a file brought in through the upload gate (an import, HERESY 2659) or a take of the Library or a file of its tree (a stem);
     a guide vocal on it is split off by BS-Roformer (stems_job.py, as the Refiner splits), measured, and the split is used only when a voice
     was there: its stem at most GUIDE_LU under the band (a split of a true instrumental leaves its lead synth's ghost, 20 LU and more under);
  2. SheetSage2 (the engine's /transcribe) writes the backing's score: its key, meter, tempo, bars, chord symbols and named sections;
  3. bed(): that score made a bed, the score YuE2 sings on: every bar and chord symbol where the backing has them, the sections by the
     transcriber's own names (the dialect the model learnt its plans in), the Vocal voice resting and the instruments' voice empty, so the
     music half writes the melody itself and sings the user's lyrics over that harmony (the chord bed of HERESY 1704, measured 22.10.2026: the
     sound follows the bed's chords bar by bar); the song's length is the backing's, its music not let end before it (min_tokens);
  4. the voice of that take split off (BS-Roformer again), and laid on the backing bar by bar: align() follows the take's own band against the
     backing by their chroma (subsequence DTW over the part where the voice sounds), the backing's bars (bargrid.py's grid on its own score)
     are the knots, plan() gives each bar the stretch that lands it on the backing's bar, at most LIMIT either way (said where it needed more:
     the next bars catch up within the limit), and warp() stretches the voice in one pass, rubberband through ffmpeg, the tempo changed at
     each knot (asendcmd), its pitch kept;
  5. the voice set as loud against the backing as the model set it against its own band (their loudness apart, BS.1770 integrated, between
     LEVEL_LOW and LEVEL_HIGH), mixed by the Mixer's own render (daw_mix.render, nothing on the strips) and kept as a new take with both
     stems, written at the mix's level (the sum of the two is the take, to the bit), so the DAW opens on them as balanced and rebalances them.

The limits, said to the user: the melody is the model's; a voice that drifts from the backing more than LIMIT a bar is held to it and said;
a guide vocal split off leaves a trace of itself in the backing.

    python3 backing.py grid AUDIO SCORE.abc             the backing's bar grid (bargrid.py), one line of JSON
    python3 backing.py level A.flac B.flac              the two files' loudness (LUFS) and peaks, one line of JSON
    python3 backing.py voice SPEC.json OUTDIR           align, stretch, level and mix: vocals.flac, instrumental.flac, audio.wav in OUTDIR
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
from fractions import Fraction
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

GUIDE_LU = 15.0                 # a split voice this near the band (LU under it, or louder) was a guide vocal
LIMIT = 0.15                    # a bar stretched at most 15 % either way
LEVEL_LOW, LEVEL_HIGH = -8.0, 3.0   # the voice against the band, LU, as the model set it: held within these
RATE = 48000                    # the Studio's rate
SR = 22050                      # what the aligner listens at
MAX_FRAMES = 4000               # the DTW's side at most: the hop grows with a long song
SWING = 6                       # HERESY 2680: each knot read off a line through the knots within 6 bars of it
DURS = (48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1)   # the rest lengths the native dialect writes (abc_tools.DURATIONS), longest first


# ---------------------------------------------------------------- the bed

def _rests(units):
    out, left = [], int(units)
    for d in DURS:
        while left >= d:
            out.append("z" + (str(d) if d != 1 else ""))
            left -= d
    return "".join(out)


def _bar_units(meter, unit_den):
    n, d = meter
    return Fraction(unit_den * n, d)


def bed(abc):
    """The backing's score (SheetSage2's) made a bed: {abc, bars, form [{name, first, bars}], notes (the Vocal notes left out), key, meter,
    bpm}. Its bars, meters, keys and chord symbols as they were (checked by reading both back with abc_tools: what is written must read the
    same), the Vocal voice resting between them, the Ins voice empty. Raises ValueError for a score the lab's reader refuses."""
    import abc_tools
    try:
        src = abc_tools.parse_abc(abc)
    except (ValueError, KeyError, IndexError) as e:
        raise ValueError(f"the backing's score could not be read: {e}")
    lines = abc.replace("\r", "").split("\n")
    while lines and not lines[-1].strip():
        lines.pop()
    unit = re.fullmatch(r"L:1/(\d+)", lines[3].strip()) if len(lines) > 3 else None
    if not unit:
        raise ValueError("the backing's score has no L: line where the dialect keeps it")
    unit_den = int(unit.group(1))
    out, i = [], 0
    while i < len(lines) and not lines[i].startswith("K:"):
        out.append(lines[i])
        i += 1
    if i >= len(lines):
        raise ValueError("the backing's score has no key line")
    out.append(lines[i])
    key0 = lines[i][2:].strip()
    m0 = re.search(r"^M:\s*(\d+)/(\d+)", abc, re.M)
    meter = (int(m0.group(1)), int(m0.group(2))) if m0 else (4, 4)
    q = re.search(r"^Q:\s*1/4\s*=\s*(\d+(?:\.\d+)?)", abc, re.M)
    voice, vmeter, form, nbars, dropped = None, {"Vocal": meter, "Ins": meter}, [], 0, 0
    for line in lines[i + 1:]:
        s = line.strip()
        if not s:
            continue
        if s.startswith("%"):
            name = s.lstrip("%").strip()
            if name:
                form.append({"name": name, "first": nbars, "bars": 0})
            out.append(s)
            continue
        if s.startswith("V:"):
            voice = s[2:].strip().split()[0]
            out.append(s)
            continue
        fm = re.fullmatch(r"([A-Za-z]):\s*(.*)", s)
        if fm:
            if fm.group(1) == "M" and voice in vmeter:
                mm = re.fullmatch(r"(\d+)/(\d+)", fm.group(2).strip())
                if mm:
                    vmeter[voice] = (int(mm.group(1)), int(mm.group(2)))
            out.append(s)
            continue
        if not s.endswith("|"):
            raise ValueError(f"the backing's score has a line the bed cannot read: {s[:40]}")
        bars = []
        for b in s[:-1].split("|"):
            b = b.strip()
            z = re.fullmatch(r"Z(\d+)?", b)
            bars.extend(["Z"] * int(z.group(1) or 1) if z else [b])
        if voice in vmeter:
            length = _bar_units(vmeter[voice], unit_den)
            made = []
            for b in bars:
                if b == "Z":
                    made.append("Z")
                    continue
                pos, marks = Fraction(0), []
                for t in abc_tools.TOKEN.finditer(b):
                    if t.group("chord") is not None:
                        if voice == "Vocal":                   # the chord symbols stay where they were; the notes go
                            marks.append((pos, '"' + t.group("chord") + '"'))
                    elif t.group("key") is not None:           # a key changed inside a bar stays, in both voices (their keys must agree)
                        marks.append((pos, "[K:" + t.group("key") + "]"))
                    else:
                        if t.group("note") != "z" and voice == "Vocal":
                            dropped += 1
                        pos += int(t.group("duration") or "1")
                text, at = "", Fraction(0)
                for off, mark in marks:
                    if off > at:
                        text += _rests(off - at)
                        at = off
                    text += mark
                if at < length:
                    text += _rests(length - at)
                made.append(text if marks else "Z")
            if voice == "Ins" and all(m == "Z" for m in made):
                out.append(("Z" if len(made) == 1 else f"Z{len(made)}") + "|")
            else:
                out.append("|".join(made) + "|")
            if voice == "Vocal":
                nbars += len(bars)
                if form:
                    form[-1]["bars"] += len(bars)
        else:
            raise ValueError(f"the backing's score has music outside its two voices: {s[:40]}")
    text = "\n".join(out)
    try:
        made = abc_tools.parse_abc(text)
    except (ValueError, KeyError, IndexError) as e:   # fail closed: what the lab writes must read back
        raise ValueError(f"the bed did not read back: {e}")
    a, b = src.voices["Vocal"], made.voices["Vocal"]
    if a.bars != b.bars or a.chords != b.chords or a.keys != b.keys:
        raise ValueError("the bed lost a bar, a chord or a key of the backing's score")
    if not form:
        form = [{"name": "song", "first": 0, "bars": nbars}]
    return {"abc": text, "bars": nbars, "form": [f for f in form if f["bars"]], "notes": dropped, "key": key0,
            "meter": f"{meter[0]}/{meter[1]}", "bpm": float(q.group(1)) if q else None, "chords": len(a.chords)}


# ---------------------------------------------------------------- sound

def load(path, sr=None, mono=False):
    """(samples [frames, channels] float32, rate): resampled to sr when given; mono when asked."""
    import soundfile as sf
    x, r = sf.read(str(path), dtype="float32", always_2d=True)
    if sr and r != sr:
        from scipy.signal import resample_poly
        g = math.gcd(int(sr), int(r))
        x = resample_poly(x, sr // g, r // g, axis=0).astype("float32")
        r = sr
    if mono:
        x = x.mean(axis=1, keepdims=True)
    return x, r


def stereo(x):
    return np.repeat(x, 2, axis=1) if x.shape[1] == 1 else x[:, :2]


def fit(x, frames):
    """x cut or padded with silence to frames."""
    if len(x) >= frames:
        return x[:frames]
    return np.pad(x, ((0, frames - len(x)), (0, 0)))


def loud(x, sr):
    """{lufs, peak_db} of [frames, channels]: BS.1770 integrated loudness (plenio_core, as the lab's /loudness), None for silence."""
    from plenio_core.audio.loudness import measure
    m = measure(np.ascontiguousarray(x.T, dtype=np.float64), sr, with_true_peak=False)
    pk = float(np.max(np.abs(x))) if x.size else 0.0
    return {"lufs": None if m.integrated_lufs is None or not math.isfinite(m.integrated_lufs) else round(float(m.integrated_lufs), 2),
            "peak_db": round(20 * math.log10(pk), 2) if pk > 0 else None}


def guide(vocal, band):
    """Whether a split's voice was a guide vocal: {guide, gap} from the two loudness readings (gap: LU the voice sits under the band)."""
    if vocal.get("lufs") is None:
        return {"guide": False, "gap": None}
    if band.get("lufs") is None:
        return {"guide": True, "gap": None}
    gap = round(band["lufs"] - vocal["lufs"], 1)
    return {"guide": gap <= GUIDE_LU, "gap": gap}


def span(voice, sr, floor_db=-35.0):
    """(start, end) seconds where the voice sounds: 50 ms windows within floor_db of its loudest (and above −60 dBFS); None when silent."""
    m = voice.mean(axis=1) if voice.ndim == 2 else voice
    hop = int(0.05 * sr)
    n = len(m) // hop
    if n < 2:
        return None
    rms = np.sqrt(np.mean(m[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    on = np.flatnonzero(db > max(db.max() + floor_db, -60.0))
    if not len(on):
        return None
    return float(on[0] * hop / sr), float((on[-1] + 1) * hop / sr)


# ---------------------------------------------------------------- alignment

def chroma(y, sr, hop):
    import librosa
    c = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    return c / np.maximum(np.linalg.norm(c, axis=0, keepdims=True), 1e-9)


def steady(bt, raw, swing=SWING):
    """HERESY 2680: the knots' offsets (take second − backing second, a bar each, at the backing's seconds bt) with a few bars' swing of the
    path taken out. A swing and back is the chroma's (a chorus whose chords the two bands strike apart), not the song's (the live check of
    18.11.2026: twelve bars at one offset, four swung 0.4 s and back to it), while a steady drift is the song's (a take a little faster than its
    backing). So each knot is read off a line fitted to the knots within swing bars of it: Theil and Sen's (the median of the pairwise slopes,
    which a third of the knots gone astray does not move), then least squares on the knots within 60 ms of it (or three spreads of their own)."""
    x0, y0 = np.asarray(bt, dtype=float), np.asarray(raw, dtype=float)
    n = len(y0)
    if n < 4:
        return y0.copy()
    out = np.empty(n)
    for i in range(n):
        a = min(max(0, i - swing), max(0, n - 2 * swing - 1))   # at the ends the window moves inward, keeping its size
        z = min(n, a + 2 * swing + 1)
        x, y = x0[a:z], y0[a:z]
        sl = [(y[q] - y[p]) / (x[q] - x[p]) for p in range(len(x)) for q in range(p + 1, len(x)) if x[q] - x[p] > 1e-6]
        m = float(np.median(sl)) if sl else 0.0
        c = float(np.median(y - m * x))
        r = y - (m * x + c)
        keep = np.abs(r) <= max(0.06, 3 * 1.4826 * float(np.median(np.abs(r - np.median(r)))))
        if keep.sum() >= 3:
            m, c = np.polyfit(x[keep], y[keep], 1)
        out[i] = m * x0[i] + c
    return out


def _path(take, back, sr, a, b, Y, hop):
    """The subsequence DTW of the take's stretch a…b (s) against the backing's chroma Y: (take seconds, backing seconds) a backing frame
    (the take's frames' mean), the path's mean distance."""
    import librosa
    X = chroma(take[int(a * sr): int(b * sr)], sr, hop)
    if X.shape[1] < 8:
        raise ValueError("too little music to align")
    if X.shape[1] > 2 * Y.shape[1]:
        raise ValueError("the take's voiced part is more than twice the backing's length: they cannot be laid on each other")
    D, wp = librosa.sequence.dtw(X=X, Y=Y, metric="cosine", subseq=True, weights_add=np.array([0.0, 0.08, 0.08]))
    wp = np.asarray(wp)[::-1]
    hs = hop / sr
    ys, inv = np.unique(wp[:, 1], return_inverse=True)
    mx = a + (np.bincount(inv, weights=wp[:, 0].astype(float)) / np.bincount(inv)) * hs
    return mx, ys * hs, float(D[wp[-1, 0], wp[-1, 1]] / max(1, len(wp)))


def align(back, take, sr, bars, where):
    """Where the backing's bars fall in the take: back and take mono [n] at sr (the backing; the take's own band, its voice split off),
    bars the backing's bar starts (s), where (start, end) of the take the voice sounds in. Subsequence DTW of the take's stretch (two seconds
    either side of the voice) against the whole backing by their chroma; HERESY 2680: then again over the part of that stretch the backing
    can hold (a take that lags its backing runs on past the backing's end, and the path squeezed that overhang into the last bars); each
    bar start's place in the take from the path, the offsets read off steady().
    → {knots [[take_s, back_s]…], bars [k…] (the backing's bar index of each knot), hop_s, cost (the path's mean distance, 0 same … 1),
       covered [back_s, back_s] the backing's stretch the take's part matched, set_back (knots steady() moved by more than a quarter beat),
       swing_s (the most it moved one)}"""
    a = max(0.0, where[0] - 2.0)
    b = min(len(take) / sr, where[1] + 2.0)
    longest = max(int((b - a) * sr), len(back))
    hop = 1024 * max(1, math.ceil(longest / 1024 / MAX_FRAMES))
    Y = chroma(back, sr, hop)
    if Y.shape[1] < 8:
        raise ValueError("too little music to align")
    hs = hop / sr
    mx, yt, cost = _path(take, back, sr, a, b, Y, hop)
    o = float(np.median(mx - yt))                  # the take's lag against the backing, as the first path has it
    a2, b2 = max(a, o), min(b, len(back) / sr + o)
    if (a2 - a > 2 * hs or b - b2 > 2 * hs) and b2 - a2 > 8 * hs:
        mx, yt, cost = _path(take, back, sr, a2, b2, Y, hop)
    lo, hi = float(yt[0]), float(yt[-1])
    ks = [k for k, t in enumerate(bars) if lo <= t <= hi]
    if len(ks) < 2:
        raise ValueError("the voice spans less than two of the backing's bars")
    bt = np.array([bars[k] for k in ks])
    raw = np.interp(bt, yt, mx) - bt
    off = steady(bt, raw)
    beat = float(np.median(np.diff(bt))) / 4 if len(bt) > 1 else 0.5
    set_back = int(np.sum(np.abs(raw - off) > beat / 4))
    knots = [[round(float(t + o), 4), round(float(t), 4)] for t, o in zip(bt, off)]
    for i in range(1, len(knots)):                 # the take's knots never go back
        if knots[i][0] <= knots[i - 1][0]:
            knots[i][0] = round(knots[i - 1][0] + 1e-3, 4)
    return {"knots": knots, "bars": ks, "hop_s": round(hs, 4), "cost": round(cost, 4), "covered": [round(lo, 2), round(hi, 2)], "set_back": set_back,
            "swing_s": round(float(np.max(np.abs(raw - off))), 3)}


def plan(knots, limit=LIMIT):
    """The stretch of each bar: knots [[take_s, back_s]…] → {segments [[take_from, tempo]…] (tempo = take seconds a backing second, the
    voice played that much faster), residual [s…] (where each knot's take second lands against its backing second, after the limit),
    held [bar indexes whose stretch the limit held], shift (backing second − take second of the first knot)}. A bar asking more than the limit
    is held to it and the bars after it catch up, each within the limit."""
    lo, hi = 1.0 / (1.0 + limit), 1.0 + limit
    t0, b0 = knots[0]
    pos = b0                                        # where the voice now is, in the backing's seconds
    segs, resid, held = [[0.0, 1.0]], [0.0], []
    for k in range(len(knots) - 1):
        (ta, _ba), (tb, bb) = knots[k], knots[k + 1]
        span_in, want = tb - ta, bb - pos
        r = span_in / want if want > 1e-3 else hi
        rc = min(hi, max(lo, r))
        if abs(rc - r) > 1e-9:
            held.append(k)
        segs.append([ta, rc])
        pos += span_in / rc
        resid.append(pos - bb)
    segs.append([knots[-1][0], 1.0])
    return {"segments": [[round(a, 4), round(r, 6)] for a, r in segs], "residual": [round(float(x), 4) for x in resid], "held": held,
            "shift": round(b0 - t0, 4)}


_STRETCHER = {}


def stretcher():
    """HERESY 2681: rubberband when this ffmpeg has it (made for voices, the pitch and the formants kept), else a phase vocoder of our own
    (vocoder(): the bars land the same, within a hop of 5 ms; a held vowel a little rounder). Not ffmpeg's atempo: told a new tempo it drops its
    buffer, 21 ms a bar, and the voice falls behind (243 ms by the 12th bar, measured 18.11.2026). BACKING_STRETCHER names one for the checks."""
    want = os.environ.get("BACKING_STRETCHER", "")
    if want in ("rubberband", "vocoder"):
        return want
    if "name" not in _STRETCHER:
        try:
            p = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace")
            _STRETCHER["name"] = "rubberband" if re.search(r"\srubberband\s", p.stdout) else "vocoder"
        except (OSError, subprocess.SubprocessError):
            _STRETCHER["name"] = "vocoder"
    return _STRETCHER["name"]


def vocoder(x, rate, segments, n_fft=1024, hop=256):
    """x [frames, channels] stretched by segments ([[take_from, tempo]…]) with a phase vocoder whose every output frame reads the input at the
    second the plan maps it to (each channel the same steps, the phases carried as librosa's phase_vocoder carries them)."""
    import librosa
    a = np.array([q for q, _r in segments], dtype=float)
    r = np.array([t for _q, t in segments], dtype=float)
    dur_out = np.diff(np.append(a, len(x) / rate)) / r          # each segment's length out
    out_at = np.concatenate([[0.0], np.cumsum(dur_out)])
    t_out = np.arange(int(out_at[-1] * rate / hop) + 1) * hop / rate
    k = np.clip(np.searchsorted(out_at, t_out, side="right") - 1, 0, len(a) - 1)
    steps = (a[k] + (t_out - out_at[k]) * r[k]) * rate / hop      # the input frame each output frame reads
    chans = []
    for c in range(x.shape[1]):
        D = librosa.stft(x[:, c], n_fft=n_fft, hop_length=hop)
        D = np.pad(D, [(0, 0), (0, 2)])
        adv = np.linspace(0, np.pi * hop, D.shape[0])
        acc = np.angle(D[:, 0])
        Y = np.zeros((D.shape[0], len(steps)), dtype=np.complex64)
        for j, st in enumerate(np.minimum(steps, D.shape[1] - 2.001)):
            i = int(st)
            f = st - i
            m = (1 - f) * np.abs(D[:, i]) + f * np.abs(D[:, i + 1])
            Y[:, j] = m * np.exp(1j * acc)
            dp = np.angle(D[:, i + 1]) - np.angle(D[:, i]) - adv
            acc += adv + dp - 2 * np.pi * np.round(dp / (2 * np.pi))
        chans.append(librosa.istft(Y, hop_length=hop, n_fft=n_fft))
    n = min(len(y) for y in chans)
    return np.stack([y[:n] for y in chans], axis=1).astype("float32")


def warp(src, dst, segments, shift, frames, rate=RATE):
    """The voice in src stretched by segments ([[take_from, tempo]…], one rubberband pass through ffmpeg, its tempo changed at each take
    second by asendcmd, its pitch kept), moved by shift seconds, cut or padded to frames at rate; float WAV dst. → its length before the fit"""
    import soundfile as sf
    if stretcher() == "vocoder":
        x, r0 = sf.read(str(src), dtype="float32", always_2d=True)
        y = vocoder(x, r0, segments)
        n = len(y)
        k = int(round(abs(shift) * rate))
        y = np.pad(y, ((k, 0), (0, 0))) if shift > 0 else y[k:]
        sf.write(str(dst), fit(stereo(y), frames), rate, subtype="FLOAT")
        return n / rate
    with tempfile.TemporaryDirectory(prefix="backing-warp-") as tmp:
        cmds = Path(tmp) / "tempo.cmd"
        cmds.write_text("".join(f"{max(0.0, a):.6f} rubberband tempo {r:.6f};\n" for a, r in segments), encoding="utf-8")
        out = Path(tmp) / "out.wav"
        flt = (f"apad=pad_dur=1,asendcmd=f={cmds.name},rubberband=tempo={segments[0][1]:.6f}:transients=crisp:pitchq=quality:"
               "channels=together:formant=preserved")
        p = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(Path(src).resolve()), "-af", flt, "-ar", str(rate), "-c:a", "pcm_f32le",
                            str(out)], capture_output=True, text=True, timeout=1800, cwd=tmp, encoding="utf-8", errors="replace")
        if p.returncode != 0:
            raise RuntimeError("the stretch failed: " + (p.stderr.strip().splitlines() or ["ffmpeg said nothing"])[-1][-300:])
        y, r = sf.read(str(out), dtype="float32", always_2d=True)
    n = len(y)
    k = int(round(abs(shift) * rate))
    y = np.pad(y, ((k, 0), (0, 0))) if shift > 0 else y[k:]
    sf.write(str(dst), fit(stereo(y), frames), rate, subtype="FLOAT")
    return n / rate


def beats(y, sr):
    import librosa
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=256)
    _t, fr = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=256)
    return librosa.frames_to_time(np.asarray(fr, dtype=int), sr=sr, hop_length=256)


def beat_check(back, take, sr, lo, hi, beat_s):
    """An ear apart from the aligner's (onsets, not chroma): the beats heard in the backing between lo and hi seconds, each against the
    nearest beat heard in the take's band as it now lies → {beats, median_ms, within (share within a fifth of a beat), worst_beats}"""
    bb, tb = beats(back, sr), beats(take, sr)
    bb = bb[(bb >= lo) & (bb <= hi)]
    if not len(bb) or not len(tb):
        return {"beats": int(len(bb)), "median_ms": None, "within": None, "worst_beats": None}
    d = np.array([np.min(np.abs(tb - t)) for t in bb])
    return {"beats": int(len(bb)), "median_ms": round(float(np.median(d)) * 1000, 1),
            "within": round(float(np.mean(d <= 0.2 * beat_s)), 3), "worst_beats": round(float(d.max() / beat_s), 2)}


def voice(spec, outdir):
    """The voice laid on the backing: spec {backing, take_vocals, take_band, bars, bpm, num, den, limit}; writes vocals.flac (the voice,
    stretched and levelled), instrumental.flac (the backing) and audio.wav (their mix) at RATE into outdir. → the report"""
    import soundfile as sf
    import daw_mix
    t_start = time.time()
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    back, _ = load(spec["backing"], RATE)
    back = stereo(back)
    frames = len(back)
    tv, _ = load(spec["take_vocals"], RATE)
    tv = stereo(tv)
    tb, _ = load(spec["take_band"], RATE)
    tb = stereo(tb)
    where = span(tv, RATE)
    if not where:
        raise ValueError("the take sang nothing the split could hear: no voice to lay on the backing")
    bars = [float(t) for t in spec["bars"]]
    if len(bars) < 2:
        raise ValueError("the backing has no bar grid to lay the voice on")
    import librosa
    b_m = librosa.resample(back.mean(axis=1), orig_sr=RATE, target_sr=SR)
    t_m = librosa.resample(tb.mean(axis=1), orig_sr=RATE, target_sr=SR)
    al = align(b_m, t_m, SR, bars, where)
    pl = plan(al["knots"], float(spec.get("limit") or LIMIT))
    bar_len = float(np.median(np.diff(bars)))
    beat_s = bar_len / max(1, int(spec.get("num") or 4))
    with tempfile.TemporaryDirectory(prefix="backing-voice-") as tmp:
        wv, wb = Path(tmp) / "voice.wav", Path(tmp) / "band.wav"
        sf.write(str(Path(tmp) / "tv.wav"), tv, RATE, subtype="FLOAT")
        sf.write(str(Path(tmp) / "tb.wav"), tb, RATE, subtype="FLOAT")
        warp(Path(tmp) / "tv.wav", wv, pl["segments"], pl["shift"], frames)
        warp(Path(tmp) / "tb.wav", wb, pl["segments"], pl["shift"], frames)
        v, _ = load(wv)
        band_now, _ = load(wb)
    lo_s, hi_s = al["covered"]
    check = beat_check(b_m, librosa.resample(band_now.mean(axis=1), orig_sr=RATE, target_sr=SR), SR, lo_s, hi_s, beat_s)
    lb, ltv, ltb, lv = loud(back, RATE), loud(tv, RATE), loud(tb, RATE), loud(v, RATE)
    if lv["lufs"] is None:
        raise ValueError("the voice is silent after the stretch")
    rel = (ltv["lufs"] - ltb["lufs"]) if ltv["lufs"] is not None and ltb["lufs"] is not None else -2.0
    rel_used = min(LEVEL_HIGH, max(LEVEL_LOW, rel))
    gain = ((lb["lufs"] if lb["lufs"] is not None else lv["lufs"]) + rel_used) - lv["lufs"]
    v = v * (10 ** (gain / 20))
    mix, rep, _p = daw_mix.render(RATE, [("vocals", v.T.astype(np.float64)), ("instrumental", back.T.astype(np.float64))], {"schema": daw_mix.SCHEMA})
    lowered = float(rep.get("lowered_db") or 0.0)
    if lowered > 0:                                 # the stems at the mix's level: their sum is the take, to the bit
        k = 10 ** (-lowered / 20)
        v, back = v * k, back * k
    mix = (v + back).astype(np.float32)
    sf.write(str(outdir / "vocals.flac"), v, RATE, subtype="PCM_24")
    sf.write(str(outdir / "instrumental.flac"), back, RATE, subtype="PCM_24")
    sf.write(str(outdir / "audio.wav"), mix, RATE, subtype="PCM_24")
    res = np.abs(np.array(pl["residual"]))
    return {"seconds": round(frames / RATE, 3), "voice": [round(where[0], 2), round(where[1], 2)], "knots": len(al["knots"]),
            "bars": [al["bars"][0] + 1, al["bars"][-1] + 1], "covered": al["covered"], "cost": al["cost"], "shift_s": pl["shift"],
            "set_back": al["set_back"], "swing_s": al["swing_s"],
            "tempo": {"min": round(min(r for _a, r in pl["segments"]), 4), "max": round(max(r for _a, r in pl["segments"]), 4)},
            "held": [al["bars"][k] + 1 for k in pl["held"]], "limit": float(spec.get("limit") or LIMIT),
            "residual": {"median_s": round(float(np.median(res)), 3), "max_s": round(float(res.max()), 3),
                         "max_beats": round(float(res.max() / beat_s), 2), "max_bars": round(float(res.max() / bar_len), 3)},
            "beat_check": check, "bar_s": round(bar_len, 3), "stretcher": stretcher(),
            "loudness": {"backing": lb["lufs"], "take_voice": ltv["lufs"], "take_band": ltb["lufs"], "voice_vs_band": round(rel, 2),
                         "voice_vs_band_used": round(rel_used, 2), "gain_db": round(gain, 2), "lowered_db": round(lowered, 2)},
            "peak_db": rep.get("peak_db"), "took": round(time.time() - t_start, 1)}


def grid(audio, abc_text):
    """The backing's bar grid by bargrid.py: its beats heard, the score's bars laid on them."""
    import bargrid
    req = {"abc": abc_text}
    prior = bargrid.prior_of(req)
    heard = bargrid.hear(audio, prior[0] * prior[2] / 4.0 if prior[3] else None)
    out = bargrid.derive(heard, prior, None, abc_text, None, heard.get("seconds"))
    return {k: out.get(k) for k in ("bars", "bar_numbers", "beats", "bpm", "num", "den", "said", "phase_sure", "how")}


def main(argv):
    if len(argv) >= 3 and argv[0] == "grid":
        print(json.dumps(grid(argv[1], Path(argv[2]).read_text(encoding="utf-8")), ensure_ascii=False))
        return 0
    if len(argv) >= 3 and argv[0] == "level":
        a, ra = load(argv[1])
        b, rb = load(argv[2])
        print(json.dumps({"a": loud(a, ra), "b": loud(b, rb)}))
        return 0
    if len(argv) >= 3 and argv[0] == "voice":
        print(json.dumps(voice(json.loads(Path(argv[1]).read_text(encoding="utf-8")), argv[2]), ensure_ascii=False))
        return 0
    print(__doc__.strip().splitlines()[-3:], file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
