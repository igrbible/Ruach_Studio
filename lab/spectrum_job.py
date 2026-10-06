"""The spectrum of one take, computed on Forge (HERESY 1020), for the page to draw.

The method of our Audio Spectral Comparator v3 (audio_spectrum_compare.py), in numpy:
  mono at the file's own rate (48 kHz for the Kit: the full 24 kHz, nothing resampled);
  STFT: periodic Hann 2048, hop 2048, half a window of zeros at both ends, each frame
        scaled by 1/sum(window), 20·log10 — scipy.signal.stft's defaults;
  Welch: periodic Hann 4096, half overlap, constant detrend, density scaling, one-sided;
  bands: mean Welch power in SUB 20–80, LOW 80–300, MID 300–2k, HI-MID 2–6k, HIGH 6–12k, AIR 12–20k.

Output, as it is (HERESY 1166: nothing gzipped, a studio of one machine and its network): b"HSP1",
uint32 LE header length, the header JSON, then the spectrogram as uint8 (0.5 dB steps from
-120 dB, frame after frame), the Welch average as float32 dB and the six band energies as
float32 dB. About 10 MB for 7 minutes, against 80–120 MB of audio the page used to fetch.

    spectrum_job.py AUDIO.wav OUT.spec
"""
import json, struct, sys, wave
import numpy as np

src, out = sys.argv[1], sys.argv[2]
if not src.lower().endswith(".wav"):          # HERESY 1021: FLAC stems, read by soundfile
    import soundfile as sf
    data, sr = sf.read(src, dtype="float64", always_2d=True)
    x, sw, ch = data.mean(1), 0, 1
else:
    w = wave.open(src)
    sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
    raw = w.readframes(n)
if sw == 0:
    pass
elif sw == 3:
    b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
    x = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)); x = np.where(x & 0x800000, x - 0x1000000, x) / 2 ** 23
elif sw == 2:
    x = np.frombuffer(raw, np.int16) / 2 ** 15
elif sw == 4:
    x = np.frombuffer(raw, np.int32) / 2 ** 31
else:
    raise SystemExit(f"unsupported sample width {sw}")
x = x.reshape(-1, ch).mean(1).astype(np.float64) if ch > 1 else np.asarray(x, np.float64)
peak = float(np.abs(x).max()) if x.size else 0.0

def hann(m):
    return 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(m) / m)

# STFT, scipy.signal.stft(x, sr, nperseg=2048, noverlap=0)
N, HOP = 2048, 2048
win = hann(N)
pad = np.concatenate([np.zeros(N // 2), x, np.zeros(N // 2)])
frames = (len(pad) - N) // HOP + 1
spec = np.empty((frames, N // 2 + 1), np.uint8)
for s in range(0, frames, 1024):
    e = min(frames, s + 1024)
    idx = np.arange(N)[None, :] + HOP * np.arange(s, e)[:, None]
    mag = np.abs(np.fft.rfft(pad[idx] * win, axis=1)) / win.sum()
    db = 20 * np.log10(mag + 1e-10)
    spec[s:e] = np.clip(np.round((db + 120) * 2), 0, 255).astype(np.uint8)

# Welch, scipy.signal.welch(x, sr, nperseg=4096)
NW, HW = 4096, 2048
ww = hann(NW)
segs = (len(x) - NW) // HW + 1
acc = np.zeros(NW // 2 + 1)
for s in range(0, max(segs, 0), 512):
    e = min(segs, s + 512)
    seg = x[np.arange(NW)[None, :] + HW * np.arange(s, e)[:, None]]
    seg = (seg - seg.mean(1, keepdims=True)) * ww
    acc += (np.abs(np.fft.rfft(seg, axis=1)) ** 2).sum(0)
power = acc / max(segs, 1) / (sr * (ww ** 2).sum())
power[1:-1] *= 2
freqs = np.fft.rfftfreq(NW, 1 / sr)
avg = (10 * np.log10(power + 1e-10)).astype(np.float32)
BANDS = [(20, 80), (80, 300), (300, 2000), (2000, 6000), (6000, 12000), (12000, 20000)]
bands = np.array([10 * np.log10(power[(freqs >= lo) & (freqs < hi)].mean() + 1e-10) for lo, hi in BANDS], np.float32)

head = json.dumps({"sr": sr, "frames": int(frames), "bins": N // 2 + 1, "hop": HOP, "seconds": len(x) / sr, "peak": peak,
                   "db0": -120, "dbStep": 0.5, "welchBins": NW // 2 + 1, "welchN": NW}).encode()
with open(out, "wb") as f:
    f.write(b"HSP1" + struct.pack("<I", len(head)) + head)
    f.write(spec.tobytes()); f.write(avg.tobytes()); f.write(bands.tobytes())
