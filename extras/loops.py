#!/usr/bin/env python3
"""How much of a long recording is new? (Ruach Studio extras; first used on 02.10.2026, when two "three hour"
YouTube recordings for instrument LoRAs turned out to be loops: 26 and 17 new minutes of 180.)

Every window (10 s by default) is fingerprinted (32 log band energies, every half second); the best earlier
match is the candidate, and the waveform itself decides: a repeat of the same audio correlates near 1 within a
second either way, the same note played again does not. With --keep, the new stretches are cut out of the
original (its own rate and depth, no re-encoding of what stays) into DIR, one file per stretch.

    python3 extras/loops.py FILE [FILE ...] [--window 10] [--keep DIR] [--min 20]

Needs ffmpeg on the PATH and numpy (the studio's .venv has it: .venv/bin/python extras/loops.py …)."""
import argparse, os, subprocess, sys
import numpy as np

SR, HOP = 8000, 4000          # the analysis rate and a frame every half second


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def fingerprint(x):
    n = len(x) // HOP - 1
    win = np.hanning(2 * HOP).astype(np.float32)
    fr = np.lib.stride_tricks.sliding_window_view(x, 2 * HOP)[::HOP][:n] * win
    spec = np.abs(np.fft.rfft(fr, axis=1)) ** 2
    freqs = np.fft.rfftfreq(2 * HOP, 1 / SR)
    edges = np.geomspace(60, SR / 2 - 1, 33)
    F = np.stack([np.log10(spec[:, (freqs >= a) & (freqs < b)].sum(1) + 1e-9) for a, b in zip(edges[:-1], edges[1:])], 1)
    F -= F.mean(1, keepdims=True)
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9
    return F.astype(np.float32)


def wavecorr(x, a, b, W):
    seg = x[a * HOP:(a + W) * HOP]
    lo, hi = max(0, b * HOP - SR), min(len(x), (b + W) * HOP + SR)
    ref = x[lo:hi]
    if len(ref) < len(seg) or seg.std() < 1e-4:
        return 0.0
    n = 1 << int(np.ceil(np.log2(len(ref) + len(seg))))
    c = np.fft.irfft(np.fft.rfft(ref, n) * np.conj(np.fft.rfft(seg, n)), n)[:len(ref) - len(seg) + 1]
    e = np.sqrt(np.convolve(ref ** 2, np.ones(len(seg)), "valid"))
    return float(np.max(c / (e * np.linalg.norm(seg) + 1e-9)))


def analyse(path, window):
    W = max(2, int(round(window * SR / HOP)))
    x = decode(path)
    F = fingerprint(x)
    n = len(F)
    new = []
    for i in range(0, n - W, W):
        if i < W:
            new.append(True)
            continue
        sims = np.zeros(n - W, np.float32)
        for k in range(W):
            sims += F[k:n - W + k] @ F[i + k]
        sims /= W
        sims[i - W + 1:] = -1                       # only earlier audio, never itself
        j = int(np.argmax(sims))
        new.append(not (sims[j] > 0.97 and wavecorr(x, i, j, W) > 0.9))
    return len(x) / SR, W * HOP / SR, new


def stretches(new, step, min_s):
    out, start = [], None
    for k, v in enumerate(new + [False]):
        if v and start is None:
            start = k
        if not v and start is not None:
            if (k - start) * step >= min_s:
                out.append((start * step, k * step))
            start = None
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("--window", type=float, default=10, help="seconds a window (10)")
    ap.add_argument("--keep", help="cut the new stretches into this folder")
    ap.add_argument("--min", type=float, default=20, help="the shortest stretch to keep, seconds (20)")
    a = ap.parse_args()
    for f in a.files:
        if not os.path.isfile(f):
            print(f"{f}: no such file, skipped")
            continue
        try:
            total, step, new = analyse(f, a.window)
        except subprocess.CalledProcessError as e:     # said, not passed over: an unread file is not an empty one
            print(f"{os.path.basename(f)}: ffmpeg could not read it ({(e.stderr or b'').decode(errors='replace').strip()[-200:]}), skipped")
            continue
        fresh = sum(new) * step
        print(f"{os.path.basename(f)}: {total / 60:.1f} min, new {fresh / 60:.1f} min ({100 * fresh / max(total, 1):.0f} %), "
              f"repeated {(len(new) - sum(new)) * step / 60:.1f} min")
        if a.keep:
            os.makedirs(a.keep, exist_ok=True)
            stem = os.path.splitext(os.path.basename(f))[0]
            for k, (s0, s1) in enumerate(stretches(new, step, a.min), 1):
                out = os.path.join(a.keep, f"{stem}.new{k:02d}.flac")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s0:.2f}", "-to", f"{s1:.2f}", "-i", f, out], check=True)
                print(f"   {out}  {s0 / 60:.1f}–{s1 / 60:.1f} min")


if __name__ == "__main__":
    sys.exit(main())
