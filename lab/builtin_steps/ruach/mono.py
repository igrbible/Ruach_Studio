"""HERESY 1738 · Mono Maker (Shaumarov's first tool, read 22.10.2026 for the Refiner; Viktor: «Берём это всё… новые ноды, рекомендуемые этим
звукотехнарём, с его дефолтными пресетами»): the low end in the middle. Below the frequency the side (L − R) is taken out, as much as asked;
above it nothing changes. The side is high-passed with a zero-phase 4th-order Butterworth and the mid left as it is, so the lows sit in the
centre and the stereo stays where it lives. Measured: the side's share of the lows before and after.
    mono.py AUDIO OUTDIR PARAMS.json   (PARAMS: freq Hz, amount %)"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal


def share(x, sr, f):
    """The side's share of the energy below f, in %."""
    lp = signal.butter(4, f, btype="lowpass", fs=sr, output="sos")
    m = signal.sosfilt(lp, (x[:, 0] + x[:, 1]) / 2)
    s = signal.sosfilt(lp, (x[:, 0] - x[:, 1]) / 2)
    em, es = float(np.sum(m * m)), float(np.sum(s * s))
    return 100.0 * es / (em + es) if em + es > 0 else 0.0


def main():
    t0 = time.time()
    audio, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    f = max(40.0, min(300.0, float(p.get("freq", 120))))
    amount = max(0.0, min(1.0, float(p.get("amount", 100)) / 100))
    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    if x.shape[1] < 2:
        raise SystemExit("this file is mono already: its lows are in the middle")
    x = x[:, :2]
    m, s = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    hp = signal.butter(2, f, btype="highpass", fs=sr, output="sos")
    s_hi = signal.sosfiltfilt(hp, s)                     # zero phase: twice a 2nd order, a 4th-order slope, no smear
    s_new = s_hi + (1.0 - amount) * (s - s_hi)
    y = np.stack([m + s_new, m - s_new], axis=1)
    held = 0.0
    pk = float(np.max(np.abs(y))) if len(y) else 0.0
    if pk > 0.999:                                       # the sum may come over full scale where it was at it: down, said
        held = 20 * np.log10(0.999 / pk)
        y *= 0.999 / pk
    before, after = share(x, sr, f), share(y, sr, f)
    name = f"Mono below {f:g} Hz" + ("" if amount >= 1 else f", {round(amount * 100)} %")
    sf.write(str(outdir / "mono-lows.flac"), y.astype(np.float32), sr, subtype="PCM_24")
    print(json.dumps({"files": [{"name": name, "file": "mono-lows.flac", "seconds": round(len(y) / sr, 2)}],
                      "measure": {"freq_hz": f, "amount": round(amount * 100), "side_of_lows_before_pct": round(before, 2),
                                  "side_of_lows_after_pct": round(after, 2), "held_db": round(held, 2)},
                      "summary": f"the side's share of the lows under {f:g} Hz: {before:.1f} % → {after:.1f} %" + (f"; {held:.1f} dB down to stay under full scale" if held else ""),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
