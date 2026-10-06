"""Look for artifacts in one take (or a file made from it), HERESY 1025. numpy, CPU.

  tones      narrow peaks standing above their neighbours in much of the song: mains hum
             (50/60 Hz and harmonics), a whine, the "metallic" ring Viktor hears on vowels.
             For each: frequency, level above the neighbourhood, share of the time it stands.
  clicks     samples whose second difference jumps far above the local level (a click is a
             corner in the waveform, not a loud sound); clustered within 50 ms.
  clipping   runs of 3+ samples at full scale.
  dropouts   the level falling 30+ dB for 10–300 ms between sound on both sides.
  dc         offset of zero per channel.
  stereo     correlation of left and right per band, and the stretches where it goes negative.
  loudness   integrated LUFS, loudness range and true peak (ffmpeg ebur128).
  framebuzz  the top (4–12 kHz) trembling at the VAE's frame rate: YuE2's VAE turns latents into
             sound at 48000 / 1920 = 25 frames a second, and peaks of the high band's envelope at
             exactly 25, 50, 75, 100, 125, 150 Hz are what an "electric buzz in the highs" is made
             of (measured on a take on 30.09.2026: up to 22 dB above their neighbours). Per 30 s.

    inspect_job.py AUDIO OUT.json
"""
import json, subprocess, sys, time
import numpy as np
import soundfile as sf

src, out = sys.argv[1], sys.argv[2]
t0 = time.time()
x, sr = sf.read(src, dtype="float64", always_2d=True)
n, ch = x.shape
mono = x.mean(1)
secs = n / sr
R = {"seconds": round(secs, 2), "rate": sr, "channels": ch}


def t(i):
    return round(i / sr, 3)


# ---- tones: a long STFT put on a log-frequency grid (30 Hz – 20 kHz, 4096 points), where the
#      ±1/6-octave neighbourhood is a window of constant width: a bin standing 8+ dB above the
#      median of its neighbourhood, in a large share of the frames, is a tone that stays.
N, HOP = 16384, 8192
win = np.hanning(N)
frames = max(1, (n - N) // HOP + 1)
F = np.fft.rfftfreq(N, 1 / sr)
G = np.geomspace(30, min(20000, sr / 2 - 1), 4096)
half = int(round(4096 * (1 / 6) / np.log2(G[-1] / G[0])))        # 1/6 octave in grid points
from numpy.lib.stride_tricks import sliding_window_view
stand = np.zeros(len(G)); level = np.zeros(len(G)); count = 0
for s in range(0, frames, 32):
    e = min(frames, s + 32)
    seg = mono[np.arange(N)[None, :] + HOP * np.arange(s, e)[:, None]] * win
    db = 20 * np.log10(np.abs(np.fft.rfft(seg, axis=1)) + 1e-12)
    for row in db:
        g = np.interp(G, F, row)
        if g.max() < -100:                     # silence tells nothing
            continue
        count += 1
        pad = np.pad(g, half, mode="edge")
        base = np.median(sliding_window_view(pad, 2 * half + 1), axis=1)
        peak = np.zeros(len(g), bool)
        peak[1:-1] = (g[1:-1] > g[:-2]) & (g[1:-1] >= g[2:])
        above = np.where(peak, g - base, 0)
        hit = above >= 8
        stand[hit] += 1
        level[hit] += above[hit]
tones = []
if count:
    share = stand / count
    for k in np.argsort(-share):
        if share[k] < 0.35 or len(tones) >= 12:
            break
        hz = float(G[k])
        if any(abs(hz - q["hz"]) < hz * 0.02 + 3 for q in tones):
            continue                           # a neighbour of one already listed
        mains = next((m for m in (50, 60) if hz < 2000 and round(hz / m) >= 1 and abs(hz / m - round(hz / m)) < 0.03), None)
        midi = 69 + 12 * np.log2(hz / 440)
        cents = 100 * (midi - round(midi))
        note = "C C# D D# E F F# G G# A A# B".split()[int(round(midi)) % 12] + str(int(round(midi)) // 12 - 1)
        musical = hz < 5000 and abs(cents) <= 20 and not mains       # a held note of the song, not a fault
        tones.append({"hz": round(hz, 1), "share": round(float(share[k]), 3), "above_db": round(float(level[k] / max(stand[k], 1)), 1),
                      "mains": f"{mains} Hz × {round(hz / mains)}" if mains else None,
                      "note": f"{note} {cents:+.0f}c", "musical": bool(musical)})
R["tones"] = sorted(tones, key=lambda q: q["hz"])

# ---- clicks: the second difference against its local level (a median over 50 ms)
d2 = np.abs(np.diff(mono, 2))
blk = int(0.05 * sr)
nb = len(d2) // blk
local = np.median(d2[:nb * blk].reshape(nb, blk), axis=1) + 1e-9
ratio = d2[:nb * blk].reshape(nb, blk) / local[:, None]
cand = np.argwhere(ratio > 40)
clicks = []
for b, j in cand:
    i = b * blk + j
    if clicks and i - clicks[-1]["i"] < blk:
        if ratio[b, j] > clicks[-1]["x"]:
            clicks[-1].update(i=int(i), x=float(ratio[b, j]))
        continue
    clicks.append({"i": int(i), "x": float(ratio[b, j])})
clicks = sorted(clicks, key=lambda c: -c["x"])[:40]
R["clicks"] = sorted([{"at": t(c["i"]), "strength": round(c["x"], 1)} for c in clicks], key=lambda c: c["at"])

# ---- clipping: 3+ samples in a row at full scale
clip = []
for c in range(ch):
    full = np.abs(x[:, c]) >= 0.999
    if not full.any():
        continue
    edges = np.flatnonzero(np.diff(np.r_[0, full.view(np.int8), 0]))
    for a, b in zip(edges[::2], edges[1::2]):
        if b - a >= 3:
            clip.append({"at": t(a), "samples": int(b - a), "channel": c})
R["clipping"] = {"runs": len(clip), "first": clip[:20]}

# ---- dropouts: 10 ms level, a fall of 30+ dB for 10–300 ms with sound on both sides
w10 = int(0.01 * sr)
m10 = len(mono) // w10
lev = 10 * np.log10((mono[:m10 * w10].reshape(m10, w10) ** 2).mean(1) + 1e-14)
drops = []
i = 1
while i < m10 - 1:
    if lev[i] < lev[i - 1] - 30:
        j = i
        while j < m10 and lev[j] < lev[i - 1] - 30 and j - i < 31:
            j += 1
        if j < m10 and 1 <= j - i <= 30 and lev[j] > lev[i - 1] - 12:
            drops.append({"at": round(i * 0.01, 2), "ms": (j - i) * 10, "depth_db": round(float(lev[i - 1] - lev[i:j].min()), 1)})
        i = j
    i += 1
R["dropouts"] = drops[:30]

# ---- dc offset
R["dc"] = [round(float(x[:, c].mean()), 6) for c in range(ch)]

# ---- stereo: correlation per band, and negative stretches (1 s windows, full band)
if ch == 2:
    L, Rr = x[:, 0], x[:, 1]
    FL, FR = np.fft.rfft(L), np.fft.rfft(Rr)
    FF = np.fft.rfftfreq(n, 1 / sr)
    bands = []
    for lo, hi, name in ((20, 150, "low"), (150, 2000, "mid"), (2000, 8000, "high"), (8000, 20000, "air")):
        m = (FF >= lo) & (FF < hi)
        num = np.real((FL[m] * np.conj(FR[m])).sum())
        den = np.sqrt((np.abs(FL[m]) ** 2).sum() * (np.abs(FR[m]) ** 2).sum()) + 1e-20
        bands.append({"band": name, "correlation": round(float(num / den), 3)})
    w1 = sr
    neg = []
    for s in range(0, n - w1, w1):
        a, b = L[s:s + w1], Rr[s:s + w1]
        c = np.dot(a, b) / (np.sqrt(np.dot(a, a) * np.dot(b, b)) + 1e-20)
        if c < 0:
            neg.append({"at": t(s), "correlation": round(float(c), 3)})
    R["stereo"] = {"bands": bands, "negative": neg[:30]}

# ---- frame buzz: the 4–12 kHz envelope's spectrum at the multiples of 25 Hz, per 30 s window
def buzz(seg):
    X = np.fft.rfft(seg); f = np.fft.rfftfreq(len(seg), 1 / sr)
    X[(f < 4000) | (f >= 12000)] = 0
    env = np.abs(np.fft.irfft(X, len(seg)))
    d = max(1, sr // 2000); env = env[: len(env) // d * d].reshape(-1, d).mean(1); fs = sr / d
    env = env - env.mean()
    E = np.abs(np.fft.rfft(env * np.hanning(len(env)))); fe = np.fft.rfftfreq(len(env), 1 / fs)
    vals = []
    for target in (25, 50, 75, 100, 125, 150):
        at = (fe > target - 0.6) & (fe < target + 0.6)
        ref = ((fe > target - 8) & (fe < target - 2)) | ((fe > target + 2) & (fe < target + 8))
        vals.append(float(20 * np.log10(E[at].max() / (np.median(E[ref]) + 1e-20) + 1e-20)))
    return vals
wins = []
for a in range(0, max(1, int(secs) - 29), 30):
    v = buzz(mono[int(a * sr):int((a + 30) * sr)])
    wins.append({"at": a, "by_hz": [round(q, 1) for q in v], "mean_db": round(float(np.mean(v)), 1)})
R["framebuzz"] = {"hz": [25, 50, 75, 100, 125, 150], "windows": wins,
                  "mean_db": round(float(np.mean([w["mean_db"] for w in wins])), 1) if wins else None,
                  "worst": sorted(wins, key=lambda w: -w["mean_db"])[:3]}

# ---- loudness (ffmpeg ebur128)
p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
                   capture_output=True, text=True)
lo = {}
for line in p.stderr.splitlines():
    s = line.strip()
    for key, tag in (("I:", "lufs"), ("LRA:", "lra"), ("Peak:", "true_peak")):
        if s.startswith(key) and ("LUFS" in s or "LU" in s or "dBFS" in s):
            try:
                lo[tag] = float(s.split()[1])
            except (ValueError, IndexError):
                pass
R["loudness"] = lo
R["took"] = round(time.time() - t0, 1)
json.dump(R, open(out, "w"), ensure_ascii=False)
print(json.dumps({"ok": True, "took": R["took"]}))
