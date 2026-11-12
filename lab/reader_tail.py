"""HERESY 2335 (the unified plan of 08.11.2026, the Reader's guards on every piece: «Whisper по CER, с перечиткой куска; высота тона; «ummm» и тоны
на хвостах; громкость −16 LUFS»): what a piece sounds after its last word, a steady tone anywhere in it, and its level among the run's pieces.

The ear (reader_hear.py) gives each piece's words with their times. After the text's last word (found among the last three heard: Whisper may
write a hum as «Мм» after it) the speech ends at the first silence (a tenth of a second 35 dB under the piece's speech); what still sounds
after that, a third of a second or more of it, is a tail: «voiced» when pYIN finds a voice in half of it (a hum, an «ммм», a syllable of no
word), «tone» when a steady narrow peak stands there (an engine left an 8 kHz tone 17 dB over its neighbours in the last three seconds of a
turn on 06.11), else «noise» (a breath, a rustle: left as it is, a breath ends a phrase). A voiced or tonal tail is cut where the speech ended,
20 ms faded; the piece as read is kept beside it (piece-NNN.tail.wav). A tail joined to the last word with no silence between is said and
never cut (Whisper's word end may fall inside the word: a cut there would take the word's ending). A piece whose text ends in an engine's tag ([laughs], [sighs]) keeps its
tail: the sound was asked for. A tone found under the words cannot be cut away: it is said, for the take's editor to read that piece again.

    check(path, said, words, fold, tag_end=False) -> {"db", "seconds", "tail": {kind, from, to, s, cut, db} | None, "tone": {hz, from, to, over_db} | None,
                                                      "hole": {from, s} (a silence of HOLE_S or more inside the speech), when there is one}
    cut(path, at, keep)                            the piece cut at `at` seconds (20 ms faded), the reading as it was moved to `keep`
Standard numpy and soundfile, librosa for pYIN (the lab's own Python has them); nothing here takes a card."""
import os
import re

import numpy as np

HOP_S = 0.01            # frames of 10 ms
GAP_S = 0.10            # a silence this long ends the speech
UNDER_DB = 35.0         # ...this far under the piece's speech level (and under -60 dBFS at most)
TAIL_MIN_S = 0.30       # less than this after the speech is the word's own decay
VOICED_MIN = 0.45       # a tail this much voiced (pYIN) is a voice
TONE_MIN_HZ = 3000.0    # a tone above the voice's own harmonics (a spoken vowel's high harmonics never hold a bin this long)
TONE_MIN_S = 0.60
TONE_OVER_DB = 15.0     # a peak this far over the median of its neighbourhood (about ±340 Hz)
FADE_S = 0.02
HOLE_S = 1.2            # a silence this long inside a piece's speech is said (a piece is a sentence or two: the engine stalled)
WORD_SLACK_S = 0.15     # Whisper's end of the last word may come this early
RUNON_MIN_S = 0.90      # a sound running on this long past it, with no silence, is a joined tail (said, never cut); 2345: 0.5 said one
                        # English word ending of 130 pieces (Whisper ends «institutions.» 0.6 s early), 0.9 says none of them
RUNON_SEEK_S = 1.5      # how far past the last word the end of the speech is looked for
N_FFT, HOP_FFT = 4096, 1024


def _mono(path):
    import soundfile as sf
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return np.ascontiguousarray(x.mean(1)), int(sr)


def frames_db(x, sr):
    hop = max(1, int(sr * HOP_S))
    n = len(x) // hop
    if n == 0:
        return np.array([-120.0]), hop
    return 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)), hop


def speech_db(db):
    """The level of the frames within 40 dB of the loudest (above -50 dBFS): the piece's speech, dBFS."""
    on = db > max(-50.0, db.max() - 40.0)
    return float(10 * np.log10(np.mean(10 ** (db[on] / 10)))) if on.any() else float(db.max())


def voiced_share(y, sr):
    """The share of a stretch pYIN calls voiced (60-500 Hz), 0..1."""
    import librosa
    if len(y) < int(sr * 0.1):
        return 0.0
    z = librosa.resample(y, orig_sr=sr, target_sr=16000) if sr != 16000 else y
    _f0, vf, _p = librosa.pyin(z, fmin=60.0, fmax=500.0, sr=16000, frame_length=1024, hop_length=160)
    return float(np.mean(vf)) if len(vf) else 0.0


def tone_scan(y, sr, t0=0.0):
    """The longest steady narrow peak above TONE_MIN_HZ in y: {hz, from, to, over_db} when it lasts TONE_MIN_S, else None."""
    if len(y) < N_FFT * 2:
        return None
    from scipy.ndimage import median_filter
    win = np.hanning(N_FFT).astype(np.float32)
    n = 1 + (len(y) - N_FFT) // HOP_FFT
    idx = np.arange(N_FFT)[None, :] + HOP_FFT * np.arange(n)[:, None]
    mag = 20 * np.log10(np.abs(np.fft.rfft(y[idx] * win, axis=1)) + 1e-9)
    lo = int(TONE_MIN_HZ * N_FFT / sr)
    hi = min(mag.shape[1] - 1, int(min(sr / 2 - 500, 20000) * N_FFT / sr))
    if hi - lo < 80:
        return None
    band = mag[:, lo:hi]
    over = band - median_filter(band, size=(1, 65), mode="nearest")
    top = band.max(axis=1)
    k = over.argmax(axis=1)
    ok = (over[np.arange(n), k] >= TONE_OVER_DB) & (band[np.arange(n), k] >= top - 50) & (band[np.arange(n), k] > -100)
    best, run_a = None, None
    for f in range(n + 1):
        cont = f < n and ok[f] and run_a is not None and abs(int(k[f]) - int(k[run_a])) <= 1
        if f < n and ok[f] and run_a is None:
            run_a = f
            continue
        if cont:
            continue
        if run_a is not None:
            span = (f - run_a) * HOP_FFT / sr
            if span >= TONE_MIN_S and (best is None or span > best[1]):
                best = (run_a, span, f)
            run_a = f if f < n and ok[f] else None
    if best is None:
        return None
    a, span, b = best
    hz = (lo + float(np.median(k[a:b]))) * sr / N_FFT
    return {"hz": round(hz, 1), "from": round(t0 + a * HOP_FFT / sr, 2), "to": round(t0 + (b * HOP_FFT + N_FFT) / sr, 2),
            "over_db": round(float(np.median(over[np.arange(a, b), k[a:b]])), 1)}


def _last_end(words, fold, last_key):
    """The end of the text's last word among the last three heard (Whisper may put a hum's «Мм» after it); None when it is not there."""
    for s, e, w in reversed([x for x in (words or []) if isinstance(x, (list, tuple)) and len(x) >= 3][-3:]):
        k = fold(str(w))
        if k and last_key and (k == last_key or (len(last_key) >= 4 and (k.startswith(last_key[:-1]) or last_key.startswith(k[:-1]))
                                                 and abs(len(k) - len(last_key)) <= 2)):
            return float(e)
    return None


def check(path, said, words, fold, tag_end=False):
    x, sr = _mono(path)
    db, hop = frames_db(x, sr)
    lvl = speech_db(db)
    out = {"db": round(lvl, 1), "seconds": round(len(x) / sr, 2), "tail": None, "tone": None}
    if len(x) < sr // 4:
        return out
    out["tone"] = tone_scan(x, sr)
    keys = [fold(w) for w in re.findall(r"\S+", said or "")]
    keys = [k for k in keys if k]
    end = _last_end(words, fold, keys[-1] if keys else "")
    thr = max(lvl - UNDER_DB, -60.0)
    on = np.where(db >= thr)[0]
    if len(on) >= 2:                                     # the longest silence inside the speech (an engine stalled mid-phrase)
        inner = db[on[0]:(int(end / HOP_S) if end is not None else on[-1]) + 1] < thr
        best = cur = 0
        best_at = at = 0
        for j, q in enumerate(inner):
            if q:
                if cur == 0:
                    at = j
                cur += 1
                if cur > best:
                    best, best_at = cur, at
            else:
                cur = 0
        if best * HOP_S >= HOLE_S:
            out["hole"] = {"from": round((on[0] + best_at) * HOP_S, 2), "s": round(best * HOP_S, 2)}
    if end is None or tag_end:
        return out
    gap = max(1, int(round(GAP_S / HOP_S)))
    j0 = max(0, int((end - 0.05) / HOP_S))
    stop = None
    for j in range(j0, min(len(db), int((end + RUNON_SEEK_S) / HOP_S))):
        if j + gap <= len(db) and (db[j:j + gap] < thr).all():
            stop = j
            break
    on_to = stop * HOP_S if stop is not None else min(len(db) * HOP_S, end + RUNON_SEEK_S)
    if on_to - (end + WORD_SLACK_S) >= RUNON_MIN_S:      # the sound runs on past the word with no silence between: a tail joined to it
        a, b = int((end + WORD_SLACK_S) / HOP_S), int(on_to / HOP_S)
        y = x[a * hop:b * hop]
        tone = tone_scan(y, sr, a * HOP_S)
        kind = "tone" if tone else "voiced" if voiced_share(y, sr) >= VOICED_MIN else "noise"
        if kind != "noise":                              # said, never cut: Whisper's word end may fall inside the word, a cut would take its ending
            out["tail"] = {"kind": kind, "from": round(a * HOP_S, 2), "to": round(b * HOP_S, 2), "s": round((b - a) * HOP_S, 2),
                           "cut": round(a * HOP_S, 2), "db": round(speech_db(db[a:b]) - lvl, 1), "word_end": round(end, 2), "joined": True}
            if tone:
                out["tail"]["hz"] = tone["hz"]
            return out
    if stop is None:
        return out
    cut_at = stop * HOP_S
    rest = db[int(cut_at / HOP_S):]
    loud = np.where(rest >= thr)[0]
    if not len(loud):
        return out
    a = int(cut_at / HOP_S) + int(loud[0])
    b = int(cut_at / HOP_S) + int(loud[-1]) + 1
    dur = float(len(loud) * HOP_S)
    if dur < TAIL_MIN_S:
        return out
    y = x[a * hop:b * hop]
    tone = tone_scan(y, sr, a * HOP_S)
    kind = "tone" if tone else "voiced" if voiced_share(y, sr) >= VOICED_MIN else "noise"
    out["tail"] = {"kind": kind, "from": round(a * HOP_S, 2), "to": round(b * HOP_S, 2), "s": round(dur, 2), "cut": round(cut_at, 2),
                   "db": round(speech_db(db[a:b]) - lvl, 1), "word_end": round(end, 2)}
    if tone:
        out["tail"]["hz"] = tone["hz"]
    return out


def cut(path, at, keep):
    """The piece cut at `at` s with a FADE_S fade out, written where it was (float, as the worker writes it); the reading as read moved to keep."""
    import soundfile as sf
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    n = max(int(sr * 0.05), min(len(x), int(round(at * sr))))
    y = x[:n].copy()
    f = min(int(sr * FADE_S), len(y) // 2)
    if f > 1:
        y[-f:] *= np.linspace(1.0, 0.0, f, dtype=np.float32)[:, None]
    os.replace(str(path), str(keep))
    sf.write(str(path), y if y.shape[1] > 1 else y[:, 0], sr, subtype="FLOAT")
    return round(len(y) / sr, 3)
