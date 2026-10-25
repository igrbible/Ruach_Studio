"""HERESY 1738 · Peak glue (Shaumarov's «preparing» compressor, read 22.10.2026 for the Refiner: only the peaks shaved, two to four dB, before
anything else): Plenio's linked compressor (soft knee 6 dB, ratio 2.5, 10 ms attack, 120 ms release, RMS over 1 ms), its threshold found so
that the loud moments (the 99.5th percentile of the gain taken) lose the dB asked; then as loud as it came (BS.1770), so only the peaks move.
No ceiling here: the Ceiling node holds the true peak at the chain's end.
    glue.py AUDIO OUTDIR PARAMS.json   (PARAMS: reduction dB, attack ms, release ms)"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB))
from plenio_core.audio import dynamics as dyn  # noqa: E402
from plenio_core.audio import loudness as ld  # noqa: E402


def shaved(x, sr, th, attack, release):
    c = dyn.Compressor(threshold_db=th, ratio=2.5, knee_db=6.0, attack_ms=attack, release_ms=release, sidechain_hz=0.0, detector="RMS")
    y, info = dyn.compress(x.T, sr, c)
    # the gain taken on the loud moments: input and output compared on 50 ms frames, the loudest 0.5 % of them
    hop = max(1, int(sr * 0.05))
    n = (x.shape[0] // hop) * hop
    if n < hop:
        return y.T, 0.0, info
    a = np.sqrt(np.mean(x[:n].reshape(-1, hop, x.shape[1]) ** 2, axis=(1, 2)) + 1e-20)
    b = np.sqrt(np.mean(y.T[:n].reshape(-1, hop, x.shape[1]) ** 2, axis=(1, 2)) + 1e-20)
    taken = 20 * np.log10(a / b)
    return y.T, float(np.percentile(taken, 99.5)), info


def main():
    t0 = time.time()
    audio, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    want = max(1.0, min(6.0, float(p.get("reduction", 3))))
    attack = max(1.0, min(50.0, float(p.get("attack", 10))))
    release = max(30.0, min(500.0, float(p.get("release", 120))))
    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    x = x[:, :2]
    lin = ld.measure(x.T, sr, with_true_peak=False).integrated_lufs
    pk = 20 * np.log10(max(float(np.max(np.abs(x))), 1e-12))
    lo, hi, best = pk - 40.0, pk, None                    # the threshold between 40 dB under the peak and the peak itself
    for _ in range(9):
        th = (lo + hi) / 2
        y, got, info = shaved(x, sr, max(-60.0, min(0.0, th)), attack, release)
        if best is None or abs(got - want) < abs(best[1] - want):
            best = (y, got, info, th)
        if got > want:
            lo = th
        else:
            hi = th
    y, got, info, th = best
    lout = ld.measure(y.T, sr, with_true_peak=False).integrated_lufs
    if lin is not None and lout is not None:
        y = y * 10 ** ((lin - lout) / 20)                # as loud as it came: only the peaks moved
    held = 0.0                                           # no ceiling here (the Ceiling node's at the end): only full scale kept, for the file
    top = float(np.max(np.abs(y))) if len(y) else 0.0
    if top > 0.999:
        held = 20 * np.log10(0.999 / top)
        y = y * (0.999 / top)
    sf.write(str(outdir / "peak-glue.flac"), y.astype(np.float32), sr, subtype="PCM_24")
    pk_out = 20 * np.log10(max(float(np.max(np.abs(y))), 1e-12))
    print(json.dumps({"files": [{"name": f"Peak glue, {got:.1f} dB", "file": "peak-glue.flac", "seconds": round(len(y) / sr, 2)}],
                      "measure": {"asked_db": want, "taken_on_peaks_db": round(got, 2), "threshold_db": round(th, 2), "ratio": 2.5,
                                  "attack_ms": attack, "release_ms": release, "lufs": round(lin, 2) if lin is not None else None,
                                  "peak_in_dbfs": round(pk, 2), "peak_out_dbfs": round(pk_out, 2), "held_db": round(held, 2),
                                  "max_reduction_db": info.get("max_reduction_db")},
                      "summary": f"the loud moments {got:.1f} dB down, the loudness kept, the sharpest transients through" + (f"; {held:.1f} dB down to stay under full scale" if held else ""),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
