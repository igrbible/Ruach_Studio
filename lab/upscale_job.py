"""Upscale one take (or a file made from it) with UniverSR on Forge, HERESY 1024.

UniverSR (ICASSP 2026, MIT, vendor/UniverSR): vocoder-free flow matching in the complex STFT
domain, trained on speech, music and effects. It takes audio band-limited to 8/12/16/24 kHz
and draws everything above anew, at 48 kHz. Viktor's four modes are how deep it redraws:

    subtle   from 24 kHz input: everything above 12 kHz is new
    normal   from 16 kHz: above 8 kHz
    high     from 12 kHz: above 6 kHz
    extreme  from  8 kHz: above 4 kHz

Measured on 30 s of a take (subtle): below 12 kHz unchanged to 0.1 dB, 16–20 kHz -3 dB,
20–24 kHz +7.5 dB — a different top, not a louder one. The model also touches the low band
slightly (whole-signal SNR 28.8 dB), so by default the result keeps the original below the
cutoff sample for sample and takes only the new top, joined by a smooth crossover.

Stereo is done channel by channel (the model takes mono). The take is cut into chunks with
an overlap and joined by equal-power crossfades; each variant is one noise seed.

    upscale_job.py AUDIO OUTDIR MODE SEEDS [keep|all]
    SEEDS: comma separated, one file per seed. Prints one line of JSON.
"""
import json, math, os, sys, time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio

audio, outdir, mode = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
seeds = [int(s) for s in sys.argv[4].split(",") if s.strip()]
keep_low = (sys.argv[5] if len(sys.argv) > 5 else "keep") == "keep"
INPUT = {"subtle": 24000, "normal": 16000, "high": 12000, "extreme": 8000}[mode]
CUT = INPUT / 2                      # what lies above is drawn anew
CHUNK, OVERLAP = 20.0, 1.0           # seconds; 20 s keeps the peak near 10 GB on a 3090

from universr import UniverSR  # noqa: E402

t0 = time.time()
outdir.mkdir(parents=True, exist_ok=True)
x, sr = sf.read(str(audio), dtype="float32", always_2d=True)
if sr != 48000:
    x = torchaudio.functional.resample(torch.from_numpy(x.T.copy()), sr, 48000).numpy().T
    sr = 48000
n = len(x)
model = UniverSR.from_pretrained("woongzip1/universr-audio", device="cuda")
load_s = time.time() - t0


def render(channel, seed):
    """One channel, chunk by chunk, joined by equal-power crossfades."""
    step, ov = int((CHUNK - OVERLAP) * sr), int(OVERLAP * sr)
    out = np.zeros(n, np.float64)
    fade_in = np.sin(np.linspace(0, math.pi / 2, ov)) ** 2
    start = 0
    while start < n:
        end = min(n, start + int(CHUNK * sr))
        piece = torch.from_numpy(channel[start:end].copy())
        low = torchaudio.functional.resample(piece, sr, INPUT)
        y = model.enhance(low, input_sr=INPUT, seed=seed).reshape(-1).float().cpu().numpy()
        y = np.pad(y, (0, max(0, (end - start) - len(y))))[: end - start]
        if start > 0:                              # cross-fade the overlap with what is there
            k = min(ov, end - start)
            y[:k] = out[start:start + k] * (1 - fade_in[:k]) + y[:k] * fade_in[:k]
        out[start:end] = y
        if end == n:
            break
        start += step
    return out


def crossover(original, new):
    """The original below the cutoff, the new top above it: a raised-cosine crossover an
    octave-sixth wide in the spectrum, done once over the whole signal."""
    F = np.fft.rfftfreq(len(original), 1 / sr)
    lo, hi = CUT / 2 ** (1 / 6), CUT * 2 ** (1 / 6)
    g = np.clip((np.log2(np.maximum(F, 1)) - math.log2(lo)) / (math.log2(hi) - math.log2(lo)), 0, 1)
    g = 0.5 - 0.5 * np.cos(math.pi * g)                     # 0 below, 1 above
    return np.fft.irfft(np.fft.rfft(original) * (1 - g) + np.fft.rfft(new) * g, len(original))


files = []
for i, seed in enumerate(seeds):
    chans = []
    for c in range(x.shape[1]):
        y = render(x[:, c], seed)
        chans.append(crossover(x[:, c].astype(np.float64), y) if keep_low else y)
    out = np.stack(chans, 1)
    peak = float(np.abs(out).max())
    if peak > 0.999:                                         # never clip: scale the whole file down
        out *= 0.999 / peak
    name = f"upscale-{mode}-{'AB'[i] if i < 2 else i + 1}"
    sf.write(str(outdir / f"{name}.flac"), out.astype(np.float32), sr, subtype="PCM_24")
    files.append({"name": f"{mode} · variant {'AB'[i] if i < 2 else i + 1}", "file": f"{name}.flac",
                  "seconds": round(n / sr, 2), "seed": seed, "peak": round(peak, 4)})
    torch.cuda.empty_cache()
print(json.dumps({"files": files, "mode": mode, "input_sr": INPUT, "cutoff_hz": CUT, "keep_low": keep_low,
                  "load_s": round(load_s, 1), "took": round(time.time() - t0, 1)}))
