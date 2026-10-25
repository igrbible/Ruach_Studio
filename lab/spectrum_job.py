"""The spectrum of one take, computed on Forge (HERESY 1020), for the page to draw.

The method of our Audio Spectral Comparator v3 (audio_spectrum_compare.py), in numpy:
  mono at the file's own rate (48 kHz for the Kit: the full 24 kHz, nothing resampled);
  STFT: periodic Hann 2048, hop 2048, half a window of zeros at both ends, each frame
        scaled by 1/sum(window), 20·log10 — scipy.signal.stft's defaults;
  Welch: periodic Hann 4096, half overlap, constant detrend, density scaling, one-sided;
  bands: mean Welch power in SUB 20–80, LOW 80–300, MID 300–2k, HI-MID 2–6k, HIGH 6–12k, AIR 12–20k.

HERESY 1740 (Viktor 22.10.2026: «добавь в визуализацию спектрограмм и в плеере и в Огранщике переключатели всех возможных видов: моно усреднение
дефолтное, Mid/Side рядом с Log/Linear, и стерео общим представлением в две строки, и… единый спектр с проявкой разниц»): a mode, the third argument:
mono (the default, the file as before, byte for byte), lr (left and right, two planes), ms (mid and side, two planes), pan (one plane of the two
sides' power and a second of where each bin stands between left and right, 0 left … 255 right, for the page to colour). The planes follow one
another; the header names them ("planes", "kinds"); the Welch average and the bands stay the mix's.

Output, as it is (HERESY 1166: nothing gzipped, a studio of one machine and its network): b"HSP1",
uint32 LE header length, the header JSON, then the spectrogram as uint8 (0.5 dB steps from
-120 dB, frame after frame), the Welch average as float32 dB and the six band energies as
float32 dB. About 10 MB for 7 minutes, against 80–120 MB of audio the page used to fetch.

    spectrum_job.py AUDIO.wav OUT.spec [mono|lr|ms|pan]
"""
import json, struct, sys, wave
import numpy as np

src, out = sys.argv[1], sys.argv[2]
mode = sys.argv[3] if len(sys.argv) > 3 else "mono"   # HERESY 1740
if mode not in ("mono", "lr", "ms", "pan"):
    raise SystemExit(f"unknown mode {mode}")
if not src.lower().endswith(".wav"):          # HERESY 1021: FLAC stems, read by soundfile
    import soundfile as sf
    data, sr = sf.read(src, dtype="float64", always_2d=True)
    x, sw, ch = data.mean(1), 0, 1
    both = data[:, :2] if data.shape[1] >= 2 else None   # HERESY 1740: the two sides, for the modes that want them
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
if sw != 0:
    both = np.asarray(x, np.float64).reshape(-1, ch)[:, :2] if ch > 1 else None   # HERESY 1740
x = x.reshape(-1, ch).mean(1).astype(np.float64) if ch > 1 else np.asarray(x, np.float64)
if mode != "mono" and both is None:
    mode = "mono"                                  # a file of one channel: its spectrum is the one there is
peak = float(np.abs(x).max()) if x.size else 0.0

def hann(m):
    return 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(m) / m)

# STFT, scipy.signal.stft(x, sr, nperseg=2048, noverlap=0)
N, HOP = 2048, 2048
win = hann(N)
pad = np.concatenate([np.zeros(N // 2), x, np.zeros(N // 2)])
frames = (len(pad) - N) // HOP + 1
spec = np.empty((frames, N // 2 + 1), np.uint8)
planes, kinds = ["mono"], ["db"]
if mode == "mono":
    for s in range(0, frames, 1024):
        e = min(frames, s + 1024)
        idx = np.arange(N)[None, :] + HOP * np.arange(s, e)[:, None]
        mag = np.abs(np.fft.rfft(pad[idx] * win, axis=1)) / win.sum()
        db = 20 * np.log10(mag + 1e-10)
        spec[s:e] = np.clip(np.round((db + 120) * 2), 0, 255).astype(np.uint8)
else:                                              # HERESY 1740: two planes, on the same frames
    zl = np.zeros(N // 2)
    a = np.concatenate([zl, both[:, 0], zl]); b = np.concatenate([zl, both[:, 1], zl])
    if mode == "ms":
        a, b = (a + b) / 2, (a - b) / 2
    spec2 = np.empty_like(spec)
    q = lambda m: np.clip(np.round((20 * np.log10(m + 1e-10) + 120) * 2), 0, 255).astype(np.uint8)
    for s in range(0, frames, 1024):
        e = min(frames, s + 1024)
        idx = np.arange(N)[None, :] + HOP * np.arange(s, e)[:, None]
        ma = np.abs(np.fft.rfft(a[idx] * win, axis=1)) / win.sum()
        mb = np.abs(np.fft.rfft(b[idx] * win, axis=1)) / win.sum()
        if mode == "pan":                          # the two sides' power, and where it stands: 0 all left, 128 the middle, 255 all right
            spec[s:e] = q(np.sqrt((ma * ma + mb * mb) / 2))
            spec2[s:e] = np.clip(np.round((mb - ma) / (ma + mb + 1e-12) * 127.5 + 127.5), 0, 255).astype(np.uint8)
        else:
            spec[s:e] = q(ma); spec2[s:e] = q(mb)
    planes, kinds = {"lr": (["L", "R"], ["db", "db"]), "ms": (["M", "S"], ["db", "db"]), "pan": (["mix", "pan"], ["db", "pan"])}[mode]

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

fields = {"sr": sr, "frames": int(frames), "bins": N // 2 + 1, "hop": HOP, "seconds": len(x) / sr, "peak": peak,
          "db0": -120, "dbStep": 0.5, "welchBins": NW // 2 + 1, "welchN": NW}
if mode != "mono":                                 # HERESY 1740: the mono file's header as it was
    fields.update(mode=mode, planes=planes, kinds=kinds)
head = json.dumps(fields).encode()
with open(out, "wb") as f:
    f.write(b"HSP1" + struct.pack("<I", len(head)) + head)
    f.write(spec.tobytes())
    if mode != "mono":
        f.write(spec2.tobytes())                   # HERESY 1740: the second plane right after the first
    f.write(avg.tobytes()); f.write(bands.tobytes())
