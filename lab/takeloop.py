"""HERESY 1325 (from SUNO v6, TODO.md: «A loop from the song: 1, 2, 4 or 8 bars cut on the score's bar lines, seamless, as a WAV
(SUNO's Sounds: loops and one-shots with BPM and key)»): a stretch of a take's own WAV made into a loop. Its first XFADE seconds are
crossfaded (a half cosine) from the sound that follows the stretch in the song into its own: played round, the end runs into the
start as the song itself ran on, with no click. Written at the take's own rate and depth; the page names it (bars, BPM, key)."""
import numpy as np
import soundfile as sf

XFADE = 0.03


def cut(src, start, seconds, out):
    """The loop of src from start for seconds into out; {rate, frames, seconds, xfade}. ValueError for a stretch it cannot be."""
    info = sf.info(str(src))
    sr = info.samplerate
    a, n = int(round(float(start) * sr)), int(round(float(seconds) * sr))
    if a < 0 or n < sr // 4 or n > 120 * sr:
        raise ValueError("a loop from a quarter of a second to two minutes, within the take")
    if a + n > info.frames:
        raise ValueError("the take ends before the loop does")
    x = int(round(XFADE * sr))
    have = min(x, info.frames - (a + n))                  # the sound after the stretch, for the seam
    data, _ = sf.read(str(src), start=a, frames=n + have, dtype="float64", always_2d=True)
    seg = data[:n].copy()
    if have >= x // 2:
        w = (0.5 * (1.0 - np.cos(np.pi * np.arange(have) / have)))[:, None]
        seg[:have] = seg[:have] * w + data[n:n + have] * (1.0 - w)
        seam = have
    else:                                                 # the take's very end: both edges faded instead
        k = max(1, min(x, n // 8))
        w = (0.5 * (1.0 - np.cos(np.pi * np.arange(k) / k)))[:, None]
        seg[:k] *= w
        seg[-k:] *= w[::-1]
        seam = 0
    sub = info.subtype if info.subtype in ("PCM_16", "PCM_24", "PCM_32", "FLOAT") else "PCM_24"
    sf.write(str(out), np.clip(seg, -1.0, 1.0), sr, subtype=sub)
    return {"rate": sr, "frames": n, "seconds": n / sr, "xfade": seam / sr}
