"""Width meter: the example node's step that only looks (extras/plugins/example-node, CC0: copy it as the start of your own).

Run by the lab as `PYTHON width_meter.py AUDIO OUTDIR PARAMS.json`, like every step. A look changes no sound: it writes what it found as a page
(.md, .txt, .csv or .json are read in the tree, never played) and one "summary" line of 300 characters at most, shown beside its branch. Its
group in plugin.json is "look": on the canvas it has no output wire and stands in the looks' column.

What it measures, in the lows (below 200 Hz), the mids (200 Hz–4 kHz) and the highs (above 4 kHz) and over the whole: the width (the side's
level against the mid's, dB), the correlation of left and right (1 mono, 0 unrelated, below 0 out of phase) and the balance (left over right, dB)."""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

BANDS = (("lows", 0, 200), ("mids", 200, 4000), ("highs", 4000, 0), ("whole", 0, 0))


def band(x, sr, lo, hi):
    if lo and hi:
        return sosfiltfilt(butter(4, [lo, hi], btype="bandpass", fs=sr, output="sos"), x, axis=0)
    if hi:
        return sosfiltfilt(butter(4, hi, btype="lowpass", fs=sr, output="sos"), x, axis=0)
    if lo:
        return sosfiltfilt(butter(4, lo, btype="highpass", fs=sr, output="sos"), x, axis=0)
    return x


def db(a, b):
    return 20 * np.log10(max(a, 1e-12) / max(b, 1e-12))


def main():
    t0 = time.time()
    audio, outdir = Path(sys.argv[1]), Path(sys.argv[2])
    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    if x.shape[1] < 2:
        raise SystemExit("a file of one channel has no width to measure")
    x = x[:, :2]
    rows = []
    for name, lo, hi in BANDS:
        y = band(x, sr, lo, hi)
        l, r = y[:, 0], y[:, 1]
        mid, side = (l + r) / 2, (l - r) / 2
        rms = lambda v: float(np.sqrt(np.mean(np.square(v))))
        corr = float(np.dot(l - l.mean(), r - r.mean()) / max(np.sqrt(np.dot(l - l.mean(), l - l.mean()) * np.dot(r - r.mean(), r - r.mean())), 1e-12))
        rows.append({"band": name, "width_db": round(db(rms(side), rms(mid)), 2), "correlation": round(corr, 3), "balance_db": round(db(rms(l), rms(r)), 2)})
    page = outdir / "width.md"
    page.write_text("\n".join(["# Width meter", "", f"`{audio.name}`", "", "| band | width, dB | correlation | left over right, dB |", "|---|---|---|---|"] +
                              [f"| {r['band']} | {r['width_db']:+.2f} | {r['correlation']:.3f} | {r['balance_db']:+.2f} |" for r in rows] + [""]), encoding="utf-8")
    table = outdir / "width.csv"
    table.write_text("band,width_db,correlation,balance_db\n" + "".join(f"{r['band']},{r['width_db']},{r['correlation']},{r['balance_db']}\n" for r in rows), encoding="utf-8")
    w = rows[-1]
    print(json.dumps({"files": [{"name": "width by band", "file": page.name}, {"name": "width by band (CSV)", "file": table.name}],
                      "measure": {r["band"]: {k: v for k, v in r.items() if k != "band"} for r in rows},
                      "summary": f"width {w['width_db']:+.1f} dB, correlation {w['correlation']:.2f}, left over right {w['balance_db']:+.1f} dB",
                      "took": round(time.time() - t0, 2)}))


if __name__ == "__main__":
    main()
