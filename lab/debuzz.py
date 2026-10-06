"""Take the VAE's frame buzz out of the highs, HERESY 1030.

YuE2's VAE writes sound in frames of 1920 samples (48000 / 1920 = 25 a second). Folding the
4–12 kHz envelope of a take on exactly 1920 samples shows a shape that repeats in every frame,
~20 % deep, with its peak at the seam between frames; folding on 1900 or 1940 shows 5 % (noise).
Measured on one take decoded by standard, legacy and blend VAEs alike (30.09.2026). That is a
gain ripple locked to the frame clock: heard as a buzz at 25 Hz and its multiples in the highs.

The cure follows from the measure: split at CROSS Hz (linear phase), learn the in-frame gain
shape of the highs over a sliding window of WIN frames, divide STRENGTH of it out (bounded to
±LIMIT dB), add the lows back untouched. Only the part locked to the frame clock is removed:
the music's own movement averages out of the fold, because it is not locked to 1920 samples.
Viktor's ear, 30.09.2026: 100 % thinned the opening; 80 % was right there.

The fold is measured before and after, against control periods (1900, 1940): a track not made
by this VAE (an import) shows no more at 1920 than at the controls, and is said to have none.

    debuzz.py IN OUT.flac [STRENGTH=0.8] [CROSS=2000] [WIN=50] [LIMIT=3] [PERIOD=1920] [RATE=48000]
    PERIOD and RATE are the model's (HERESY 1055: the page sends sample_rate / frame_rate from /props)
    prints one line of JSON: the fold depth in, out and at the controls, the gain range
"""
import json, sys, time
import numpy as np
import soundfile as sf

src, dst = sys.argv[1], sys.argv[2]
STRENGTH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.8
CROSS = float(sys.argv[4]) if len(sys.argv) > 4 else 2000
WIN = int(sys.argv[5]) if len(sys.argv) > 5 else 50
LIMIT = float(sys.argv[6]) if len(sys.argv) > 6 else 3
P = int(sys.argv[7]) if len(sys.argv) > 7 else 1920
RATE = int(sys.argv[8]) if len(sys.argv) > 8 else 48000
C1, C2 = P - round(P / 96), P + round(P / 96)       # the controls, ~1 % off the frame: 1900 and 1940 at 1920, as measured
t0 = time.time()
x, sr = sf.read(src, dtype="float64", always_2d=True)
if sr != RATE:
    raise SystemExit("frames of %d samples are a %d Hz fact: this file is %d Hz" % (P, RATE, sr))
n, ch = x.shape
k = n // P
F = np.fft.rfftfreq(n, 1 / sr)


def envelope(sig):
    M = np.fft.rfft(sig)
    M[(F < 4000) | (F >= 12000)] = 0
    return np.abs(np.fft.irfft(M, n))


def smooth(p, w=48):
    return np.convolve(np.r_[p[-w:], p, p[:w]], np.ones(w) / w, "same")[w:-w]


def depth(env, period):
    m = len(env) // period
    e = env[:m * period].reshape(m, period)
    prof = smooth((e / (e.mean(1, keepdims=True) + 1e-12)).mean(0))
    return float(100 * (prof.max() - prof.min()))


lo_, hi_ = CROSS / 2 ** (1 / 6), CROSS * 2 ** (1 / 6)
g = np.clip((np.log2(np.maximum(F, 1)) - np.log2(lo_)) / (np.log2(hi_) - np.log2(lo_)), 0, 1)
g = 0.5 - 0.5 * np.cos(np.pi * g)
high = np.stack([np.fft.irfft(np.fft.rfft(x[:, c]) * g, n) for c in range(ch)], 1)
low = x - high

env_in = envelope(x.mean(1))
before = {"frame": depth(env_in, P), "control": max(depth(env_in, C1), depth(env_in, C2))}
env = env_in[:k * P].reshape(k, P)
env = env / (env.mean(1, keepdims=True) + 1e-12)          # each frame's own level out
quiet = np.abs(x.mean(1))[:k * P].reshape(k, P).max(1) < 1e-4

gain = np.ones(k * P)
half = WIN // 2
cs = np.cumsum(np.r_[np.zeros((1, P)), np.where(quiet[:, None], 0, env)], 0)
cnt = np.cumsum(np.r_[0, ~quiet])
for i in range(k):                                        # a frame at a time: 25 a second of song
    a, b = max(0, i - half), min(k, i + half + 1)
    m = cnt[b] - cnt[a]
    if m < 8:
        continue
    prof = smooth((cs[b] - cs[a]) / m)
    prof /= prof.mean()
    gain[i * P:(i + 1) * P] = np.clip(prof ** -STRENGTH, 10 ** (-LIMIT / 20), 10 ** (LIMIT / 20))
gain = np.r_[gain, np.ones(n - k * P)]
y = low + high * gain[:, None]
peak = float(np.abs(y).max())
if peak > 0.999:
    y *= 0.999 / peak
sf.write(dst, y.astype(np.float32), sr, subtype="PCM_24")
env_out = envelope(y.mean(1))
after = {"frame": depth(env_out, P), "control": max(depth(env_out, C1), depth(env_out, C2))}
print(json.dumps({"before": {k_: round(v, 2) for k_, v in before.items()}, "after": {k_: round(v, 2) for k_, v in after.items()},
                  "found": before["frame"] > 1.6 * before["control"], "strength": STRENGTH,
                  "gain_db": [round(20 * float(np.log10(gain.min())), 2), round(20 * float(np.log10(gain.max())), 2)],
                  "scaled_db": round(20 * float(np.log10(min(1.0, 0.999 / peak))), 2) if peak > 0.999 else 0.0,
                  "seconds": round(n / sr, 2), "took": round(time.time() - t0, 1)}))
