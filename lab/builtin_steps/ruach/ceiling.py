"""HERESY 1738 · True-peak ceiling (Shaumarov's last tool on the master, Pro-L 2 at about −0.5 dBTP, read 22.10.2026 for the Refiner): Plenio's
4x-oversampled lookahead limiter, its ceiling checked by an independent true-peak meter and corrected if a hair over. «As it came» holds the
ceiling at the file's own loudness (a limiter that only catches the overs); a loudness target drives into it (Plenio's master: up to three
passes, the limiter's gain reduction bounded to 6 dB).
    ceiling.py AUDIO OUTDIR PARAMS.json   (PARAMS: ceiling dBTP, loudness: as | −14 | −11 | −9)"""
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


def main():
    t0 = time.time()
    audio, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    ceiling = max(-3.0, min(-0.1, float(p.get("ceiling", -0.5))))
    aim = str(p.get("loudness", "as"))
    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    x = x[:, :2]
    before = ld.measure(x.T, sr)
    if aim == "as":
        y, info = dyn.limit(x.T, sr, ceiling_dbtp=ceiling, drive_db=0.0)
        after = ld.measure(y, sr)
        if after.true_peak_dbtp is not None and after.true_peak_dbtp > ceiling:
            y = y * 10 ** ((ceiling - after.true_peak_dbtp - 0.05) / 20)
            after = ld.measure(y, sr)
        reduction = info.get("max_reduction_db")
    else:
        y, _rate, info = dyn.master(x.T, sr, dyn.Target(integrated_lufs=float(aim), ceiling_dbtp=ceiling))
        after = ld.measure(y, sr)
        last = (info.get("attempts") or [{}])[-1]
        reduction = (last.get("limiter") or {}).get("max_reduction_db")
    y = np.asarray(y).T
    sf.write(str(outdir / "ceiling.flac"), y.astype(np.float32), sr, subtype="PCM_24")
    b, a = before.to_dict(), after.to_dict()
    name = f"Ceiling {ceiling:g} dBTP" + ("" if aim == "as" else f", {float(aim):g} LUFS")
    print(json.dumps({"files": [{"name": name, "file": "ceiling.flac", "seconds": round(len(y) / sr, 2)}],
                      "measure": {"ceiling_dbtp": ceiling, "loudness": aim, "before": b, "after": a, "max_reduction_db": reduction},
                      "summary": f"true peak {b['true_peak_dbtp']} → {a['true_peak_dbtp']} dBTP, {b['integrated_lufs']} → {a['integrated_lufs']} LUFS",
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
