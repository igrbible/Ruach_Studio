"""HERESY 2022 (Viktor 02.11.2026: «вот те пики, срез которых мы удалили из движка, их можно помечать оттенком, всю waveform немного подкрасить на её
пиковых краях»): a take's wave for the family tree, with the peaks the engine's old Peak clip would have cut.

The cut taken out in 2007 (`audio_normalize` with peak_clip 10) raised a song until the 99.999th percentile of |sample| over both channels met full
scale and cut flat what stood above it. wave() reads the file twice, a block at a time: the first pass finds that level by the old rule (the
sample at index floor((n - 1) × 0.99999) of all |samples| sorted, kept as the smallest of the top n − index), and the second gives the wave
(the loudest frame of each of n stretches), the samples above the level and the places they stand in (runs of frames over it, a millisecond apart
or more). A take made before 2007 was cut already: its flat top is counted as `flat` (samples at full scale), so the page can mark those.

    wave(path, n=1200) -> {"peaks": [0…1 × n], "seconds", "cut", "over", "places", "flat", "hot": [stretches over the level],
                           "flats": [stretches at full scale]}"""
import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf

CLIP = 10            # the old default: the top 0.001 % cut
FULL = 0.99999       # a 24-bit sample at full scale reads 0.99999988
BLOCK = 1 << 20      # frames a read


def _top(f, k):
    """The k largest |samples| of the whole file, both channels."""
    best = np.empty(0, dtype=np.float32)
    f.seek(0)
    while True:
        y = f.read(BLOCK, dtype="float32", always_2d=True)
        if not len(y):
            break
        a = np.abs(y).ravel()
        if len(a) > k:
            a = np.partition(a, len(a) - k)[-k:]
        best = np.concatenate([best, a])
        if len(best) > k:
            best = np.partition(best, len(best) - k)[-k:]
    return best


def wave(path, n=1200):
    n = max(100, min(4000, int(n)))
    with sf.SoundFile(str(path)) as f:
        frames, rate, ch = f.frames, f.samplerate, f.channels
        total = frames * ch
        if not total:
            return {"peaks": [0.0] * n, "seconds": 0.0, "cut": 0.0, "over": 0, "places": 0, "flat": 0, "hot": [], "flats": []}
        idx = int((total - 1) * (1.0 - CLIP / 1e6))
        k = total - idx
        cut = float(_top(f, k).min())
        step = max(1, frames // n)
        peaks = np.zeros(n, dtype=np.float32)
        hot_b, flat_b = set(), set()
        over = flat = places = 0
        last = -10 ** 9                              # the last frame over the level, for the places
        gap = max(1, rate // 1000)
        f.seek(0)
        at = 0
        while at < frames:
            y = f.read(BLOCK, dtype="float32", always_2d=True)
            if not len(y):
                break
            a = np.abs(y)
            m = a.max(axis=1)
            b = np.minimum((np.arange(at, at + len(m)) // step), n - 1)
            np.maximum.at(peaks, b, m)
            over += int((a > cut).sum())
            flat += int((a >= FULL).sum())
            hot = np.nonzero(m > cut)[0]
            hot_b.update(int(x) for x in np.unique(b[hot]))
            flat_b.update(int(x) for x in np.unique(b[m >= FULL]))
            if len(hot):
                hot = hot + at
                starts = np.diff(np.concatenate([[last], hot])) > gap
                places += int(starts.sum())
                last = int(hot[-1])
            at += len(m)
    return {"peaks": [round(float(v), 3) for v in peaks], "seconds": round(frames / rate, 3), "cut": round(cut, 5),
            "over": over, "places": places, "flat": flat, "hot": sorted(hot_b), "flats": sorted(flat_b)}


def bands(path, n=600, edges=(250.0, 4000.0)):
    """HERESY 2044 (Viktor 03.11.2026: «упрощённый спектроанализ с раскраской волны по силе частотных диапазонов, чтобы визуально увидеть, где
    тектоника басов, а где сверлящая нежность верхов»): each of n stretches' energy under 250 Hz, from there to 4 kHz and over it, as shares of
    that stretch's whole (the channels as one), from frames of 2048 that do not overlap (shorter for a short file, so every stretch has one),
    read a block at a time. A silent stretch gives zeros.
        bands(path, n=600) -> {"bands": [[low, mid, high] × n], "seconds"}"""
    n = max(50, min(2000, int(n)))
    with sf.SoundFile(str(path)) as f:
        frames, rate = f.frames, f.samplerate
        if not frames:
            return {"bands": [[0.0, 0.0, 0.0]] * n, "seconds": 0.0}
        size = 2048
        while size > 256 and frames // size < n:
            size //= 2
        freq = np.fft.rfftfreq(size, 1.0 / rate)
        lo, hi = freq < edges[0], freq >= edges[1]
        mid = ~lo & ~hi
        win = np.hanning(size).astype(np.float32)
        acc, cnt = np.zeros((n, 3), dtype=np.float64), np.zeros(n, dtype=np.int64)
        step = frames / n
        block = max(size, (BLOCK // size) * size)
        at, rest = 0, np.zeros(0, dtype=np.float32)
        f.seek(0)
        while True:
            y = f.read(block, dtype="float32", always_2d=True)
            if not len(y):
                break
            m = np.concatenate([rest, y.mean(axis=1)])
            k = len(m) // size
            if k:
                p = np.abs(np.fft.rfft(m[:k * size].reshape(k, size) * win, axis=1)) ** 2
                e = np.stack([p[:, lo].sum(axis=1), p[:, mid].sum(axis=1), p[:, hi].sum(axis=1)], axis=1)
                b = np.minimum(((at + np.arange(k) * size) / step).astype(np.int64), n - 1)
                np.add.at(acc, b, e)
                np.add.at(cnt, b, 1)
            at += k * size
            rest = m[k * size:]
    have = np.nonzero(cnt)[0]
    if 0 < len(have) < n:                            # a short file: a stretch no frame began in takes its nearest neighbour's
        at_ = np.arange(n)
        r = np.clip(np.searchsorted(have, at_), 0, len(have) - 1)
        lft = np.clip(r - 1, 0, len(have) - 1)
        acc = acc[np.where(np.abs(at_ - have[lft]) < np.abs(have[r] - at_), have[lft], have[r])]
    tot = acc.sum(axis=1, keepdims=True)
    share = np.divide(acc, tot, out=np.zeros_like(acc), where=tot > 0)
    return {"bands": [[round(float(x), 3) for x in r] for r in share], "seconds": round(frames / rate, 3)}


def channels(path, n=900):
    """HERESY 2997 (Viktor 25.11.2026: «Наша waveform в плеерах не похожа на стерео волну»): the player's peaks each channel apart, the left drawn
    above the middle and the right below it. The stretches are the engine's (/library/peaks) and daw.file_peaks's: n of frames // n frames each,
    read a block of whole stretches at a time; a file shorter than n frames gives one frame a stretch and zeros after. A one-channel file gives one
    list, a file of more channels its first two.
        channels(path, n=900) -> {"peaks": [the louder of the two × n], "channels": [[left × n], [right × n]] or [[mono × n]], "seconds"}"""
    n = max(1, min(4000, int(n)))
    with sf.SoundFile(str(path)) as f:
        frames, rate, ch = f.frames, f.samplerate, min(2, max(1, f.channels))
        size = max(1, frames // n)
        out = np.zeros((ch, n), dtype=np.float32)
        step = max(size, BLOCK // size * size)
        at, end = 0, min(frames, size * n)
        while at < end:
            y = f.read(min(step, end - at), dtype="float32", always_2d=True)
            if not len(y):
                break
            a = np.abs(y[:, :ch])
            b0, k = at // size, len(a) // size
            if k:
                out[:, b0:b0 + k] = np.maximum(out[:, b0:b0 + k], a[:k * size].reshape(k, size, ch).max(axis=1).T)
            if len(a) % size and b0 + k < n:          # a short read at the file's end
                out[:, b0 + k] = np.maximum(out[:, b0 + k], a[k * size:].max(axis=0))
            at += len(a)
    return {"peaks": [round(float(v), 3) for v in out.max(axis=0)], "channels": [[round(float(v), 3) for v in row] for row in out],
            "seconds": round(frames / rate, 3) if rate else 0.0}


def take_peaks(d, n=900):
    """HERESY 2997: a take's peaks.json (d, its folder) with each channel's peaks beside the engine's one list, which stays as it was for every
    reader of "peaks". The page asks for it when the engine's file has no channels, so an old take gets them at its first draw and the Library is
    never gone over at once; a take the engine has not drawn yet gets the whole file on the engine's n stretches. Written whole (a .part, then
    renamed), so the engine never serves half of it.
        take_peaks(d) -> {"peaks", "seconds", "channels"} as kept in d/peaks.json"""
    cache = Path(d) / "peaks.json"
    try:
        old = json.loads(cache.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    if not isinstance(old, dict) or not isinstance(old.get("peaks"), list) or not old["peaks"]:
        old = {}
    if old and isinstance(old.get("channels"), list) and old["channels"]:
        return old
    audio = next((Path(d) / f for f in ("audio.mp3", "audio.wav", "audio.flac") if (Path(d) / f).is_file()), None)   # the engine's pick (audio_file_of), then the FLAC
    if audio is None:
        raise FileNotFoundError("this take has no audio")
    w = channels(audio, len(old.get("peaks") or ()) or n)
    out = old or {"peaks": w["peaks"], "seconds": w["seconds"]}
    out["channels"] = w["channels"]
    part = cache.with_name(".peaks.json.part")
    part.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    os.replace(part, cache)
    return out
