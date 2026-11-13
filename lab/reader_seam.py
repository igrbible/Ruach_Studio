"""HERESY 2420 (Viktor 11.11.2026: «как будто контакт в штекере отходит на миллисекунду»; «Если сможешь вылечить сразу на выхлопе, то это
супер, и/или нодой "Де-кликер", чтобы оригинал не зацепить»): the speech codec's end-of-sound «тук», found and mended.

What it is, measured on the testimony's takes on 11.11 (heresy/MISC/claude-arc/night-2026-11-11/narrator-sound.md): where a generation ends
(a piece, or one of audio.cpp's own 128-character chunks inside it, HERESY 2419) the codec's last frame drops a breath or the voice's room
noise to its 16-bit floor at one sample, often with one low cycle (50 to 70 Hz) just before it. In a quiet pause that is heard as a short low
knock. The Greek takes carry a room noise in their pauses (the voice's own), so they have it: 4 and 5 such drops in their pieces as read;
English 0 and 1, Hebrew none, Russian 2 and 0, Ukrainian none, because their pauses are already at the floor when a generation ends.

    chunks(text)             audio.cpp's own cut of a text into generations (128 characters), as its split_text_chunks_default does
    find(x, sr)              the drops in a mono signal: each {at, start, end, pre_db, floor_db, low_db} (seconds and dBFS)
    repair(x, sr, spots)     a copy with each drop mended: its window high-passed above the knock (the voice above 100 Hz kept) and faded to
                             the floor over FADE_S, crossfaded in over XFADE_S; everything outside the windows untouched to the sample
    guard(y, sr)             the piece's own lows under 20 Hz and its offset taken out (zero phase), so no step is left for a fade to cut
    measure(x, sr, spots)    the low knock (30-100 Hz, dBFS) and the sharpest fall of the noise (dB) at each spot, before or after

Works on one channel; repair() on (n,) or (channels, n) applies the same mend to every channel."""
import re

import numpy as np

BLOCK_S = 64 / 44100        # the step's block: 1.45 ms, a few cycles of the room noise
QUIET_AFTER_S = 0.07        # the floor holds this long after the drop
STEP = 3.0                  # the block before the drop at least this many times the block after
PRE_MIN, PRE_MAX = 1.9, 60.0   # the noise before the drop: this many times the floor at least, and at most (above it: the voice's own stop)
POST_MAX = 1.5              # the floor after it: under this many times the floor for QUIET_AFTER_S
WIN_S = 0.09                # the mended window: this long before the drop...
TAIL_S = 0.02               # ...and this long after it
HOLD_S = 0.008              # after the drop, the codec's own click held under this long, then the floor let back in over the rest
FADE_S = 0.045              # the fade to the floor that replaces the drop
XFADE_S = 0.01              # the crossfade into the high-passed window
AT_SPAN_S = 0.015           # repair(): the drop looked for again this far around its given place, in the signal mended
HP_HZ = 100.0               # above the knock (50-70 Hz) and below a man's voice (its pitch 100-150 Hz in these takes)
GUARD_HZ = 20.0             # guard(): the lows under this and the offset out of a piece (under the voice, over the codec's drift)


def _blocks(x, w):
    n = len(x) // w
    return x[:n * w].reshape(n, w).std(1) if n else np.zeros(0)


def floor_of(x, sr):
    """The signal's own floor: the 1st percentile of the non-silent blocks' spread (zeros between pieces left out)."""
    w = max(16, int(round(sr * BLOCK_S)))
    s = _blocks(np.asarray(x, dtype=np.float64), w)
    s = s[s > 1e-7]
    return max(1e-5, float(np.percentile(s, 1))) if len(s) > 50 else 2e-5


def _db(v):
    return float(20 * np.log10(max(float(v), 1e-12)))


def _band(x, sr, lo, hi):
    from scipy.signal import butter, sosfiltfilt
    if len(x) < 64:
        return np.zeros_like(x)
    sos = butter(4, [lo, hi], "band", fs=sr, output="sos") if hi else butter(4, lo, "high", fs=sr, output="sos")
    return sosfiltfilt(sos, x)


def find(x, sr, floor=None):
    """The one-sample drops of a breath or a room noise to the floor: [{at, start, end, pre_db, floor_db, low_db}], at = the drop (s)."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(0) if x.shape[0] <= 8 else x.mean(1)
    w = max(16, int(round(sr * BLOCK_S)))
    s = _blocks(x, w)
    fl = floor_of(x, sr) if floor is None else float(floor)
    after = max(4, int(QUIET_AFTER_S * sr / w))
    out, last = [], -10 ** 9
    for k in range(2, len(s) - after - 1):
        pre = s[k - 1]
        if not (PRE_MIN * fl < pre < PRE_MAX * fl):         # a breath or a room noise over the floor, never the voice itself
            continue
        post = s[k + 1:k + 1 + after]
        if post.max() >= POST_MAX * fl or post.min() < 0.3 * fl:   # the codec's own floor after it (not a join's digital silence)
            continue
        if pre / max(s[k + 1], 1e-9) <= STEP:
            continue
        # the exact sample: where the spread of 32 samples before over 32 after is largest, within this block and the next
        a0 = (k - 1) * w
        best, at = 0.0, k * w
        for j in range(a0 + 32, min(len(x) - 32, (k + 2) * w), 4):
            r = x[j - 32:j].std() / (x[j:j + 32].std() + 1e-9)
            if r > best:
                best, at = r, j
        if at - last < int(0.1 * sr):
            continue
        last = at
        a, b = max(0, at - int(WIN_S * sr)), min(len(x), at + int(TAIL_S * sr))
        lo = _band(x[max(0, a - int(0.05 * sr)):b], sr, 30, 100)
        out.append({"at": round(at / sr, 4), "start": round(a / sr, 4), "end": round(b / sr, 4), "pre_db": round(_db(pre), 1),
                    "floor_db": round(_db(fl), 1), "low_db": round(_db(np.abs(lo).max() if len(lo) else 0), 1)})
    return out


def _step(x, sr, at, span, fl):
    """The sharpest fall of the sound within span seconds of at: the spread of 32 samples before over 32 after at its largest, each held
    at the floor fl at least (a fade into digital silence is no fall below the floor), dB."""
    c, w = int(round(at * sr)), int(span * sr)
    best = 1.0
    for j in range(max(32, c - w), min(len(x) - 32, c + w), 2):
        best = max(best, max(x[j - 32:j].std(), fl) / max(x[j:j + 32].std(), fl))
    return _db(best)


def measure(x, sr, spots):
    """For each spot, within AT_SPAN_S of its place: the low knock's peak (30-100 Hz) and the sharpest fall of the noise (dB); the same
    instants before a repair and after it."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(0) if x.shape[0] <= 8 else x.mean(1)
    out, fl = [], floor_of(x, sr)
    for sp in spots:
        at = int(round(sp["at"] * sr))
        a, b = max(0, at - int(0.15 * sr)), min(len(x), at + int(0.05 * sr))
        lo = _band(x[a:b], sr, 30, 100)
        k0, w = at - a, int(AT_SPAN_S * sr)
        knock = np.abs(lo[max(0, k0 - int(0.06 * sr)):k0 + w]).max() if len(lo) else 0.0
        out.append({"at": sp["at"], "low_db": round(_db(knock), 1), "step_db": round(_step(x, sr, sp["at"], AT_SPAN_S, fl), 1)})
    return out


def _mend_one(y, sr, sp):
    """y (n,) float64 mended in place at one spot."""
    from scipy.signal import butter, sosfiltfilt
    at = int(round(refine(y, sr, sp["at"], AT_SPAN_S) * sr))   # the drop to the sample in this very signal
    a, b = max(0, at - int(WIN_S * sr)), min(len(y), at + int(TAIL_S * sr))
    ctx = int(0.1 * sr)                                   # the filter sees context around the window, so no edge of its own enters
    c0, c1 = max(0, a - ctx), min(len(y), b + ctx)
    hp = sosfiltfilt(butter(4, HP_HZ, "high", fs=sr, output="sos"), y[c0:c1])[a - c0:b - c0]
    seg = y[a:b].copy()
    nx = max(2, min(int(XFADE_S * sr), (at - a) // 2))
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, nx))
    mix = np.ones(b - a)
    mix[:nx] = ramp                                       # the original into the high-passed
    new = seg * (1 - mix) + hp * mix
    k = at - a
    nf = max(2, min(int(FADE_S * sr), k - nx))           # the drop becomes a fade that ends where it stood...
    fade = np.ones(b - a)
    fade[k - nf:k] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nf))
    fade[k:] = 0.0
    new = new * fade
    h = min(b - a, k + int(HOLD_S * sr))                  # ...the click the codec left just after it held under, then the floor as it was
    back = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, max(1, b - a - h)))
    new[h:] = seg[h:] * back
    y[a:b] = new


def repair(x, sr, spots):
    """A copy of x with each spot mended (x: (n,) or (channels, n) or (n, channels)); outside the windows sample for sample."""
    arr = np.array(x, dtype=np.float64, copy=True)
    if arr.ndim == 1:
        for sp in spots:
            _mend_one(arr, sr, sp)
        return arr
    chan_first = arr.shape[0] <= 8 and arr.shape[0] < arr.shape[1]
    view = arr if chan_first else arr.T
    for c in range(view.shape[0]):
        row = view[c].copy()
        for sp in spots:
            _mend_one(row, sr, sp)
        view[c] = row
    return arr


def guard(y, sr):
    """A piece's offset and its lows under GUARD_HZ out, zero phase (the voice untouched): no step left at its edges for a fade to cut."""
    from scipy.signal import butter, sosfiltfilt
    y = np.asarray(y, dtype=np.float64)
    if len(y) < int(0.05 * sr):
        return (y - y.mean()).astype(np.float32)
    pad = int(0.05 * sr)
    z = np.concatenate([np.zeros(pad), y - y.mean(), np.zeros(pad)])
    return sosfiltfilt(butter(2, GUARD_HZ, "high", fs=sr, output="sos"), z)[pad:-pad].astype(np.float32)


# ---------------------------------------------------------------- the joins audio.cpp made inside a piece (HERESY 2419)
CHUNK = 128                 # audio.cpp's own text budget for one generation, in characters (fish_drama3: text_chunk_size, its default)
SB = (".", "!", "?", "。", "！", "？")
CLOSE = "\"')”’»」』）"
CB = (",", ";", ":", "，", "、", "；", "：")


def chunks(text, budget=CHUNK):
    """audio.cpp's split_text_chunks_default, word for word: a text over the budget cut at the latest sentence stop that fits, else the latest
    clause stop, else a word; the Greek question mark (;) is a clause stop there, the ano teleia (·) neither."""
    t = " ".join(str(text or "").split())
    if len(t) <= budget:
        return [t] if t else []
    words = []
    for m in re.finditer(r"\S+", t):
        core = m.group(0).rstrip(CLOSE)
        words.append((m.start(), m.end(), bool(core) and core[-1] in SB, bool(core) and core[-1] in CB))
    out, s = [], 0
    while s < len(words):
        h = s
        while h < len(words) and words[h][1] - words[s][0] <= budget:
            h += 1
        if h == s:
            h = s + 1
        e = h
        if h < len(words) and h > s + 1:
            e = next((i for i in range(h, s + 1, -1) if words[i - 1][2]), None) or next((i for i in range(h, s + 1, -1) if words[i - 1][3]), h)
        out.append(t[words[s][0]:words[e - 1][1]].strip())
        s = e
    return out


def refine(x, sr, at, span=0.004):
    """A drop's place found again in another copy of the sound (the take, resampled and levelled): the sample within span seconds where the
    spread of 32 samples before over 32 after is largest; seconds."""
    x = np.asarray(x, dtype=np.float64)
    c, w = int(round(at * sr)), int(span * sr)
    best, got = 0.0, c
    for j in range(max(32, c - w), min(len(x) - 32, c + w)):
        r = x[j - 32:j].std() / (x[j:j + 32].std() + 1e-9)
        if r > best:
            best, got = r, j
    return got / sr
