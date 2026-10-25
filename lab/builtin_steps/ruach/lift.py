"""HERESY 1750 · Details up (OTT as Shaumarov uses it, read 22.10.2026 for the Refiner, a hint and not a law: upward only, «at ten per cent at most
to lift the small details»; Viktor: «максимально привнести в обе сферы»). Three bands, split zero-phase and complementary (the bands sum back to
the file exactly): in each the quiet moments are raised toward the band's own loud level, the louder they already are the less, up to the dB
asked; the loud moments are not touched (nothing pushed down: no pumping). Mixed in at the share asked, then the file brought back to the
loudness it came at (BS.1770), so what changes is the detail under the loud parts, not the level.
    lift.py AUDIO OUTDIR PARAMS.json   (PARAMS: amount %, most dB, low Hz, high Hz)"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

LAB = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB))
from plenio_core.audio import loudness as ld  # noqa: E402


def split(x, sr, f):
    lp = signal.butter(2, f, btype="lowpass", fs=sr, output="sos")
    low = signal.sosfiltfilt(lp, x, axis=0)
    return low, x - low


def level_db(band, sr, ms=30.0):
    """The band's level over time: RMS over short windows, eased (a hop of 5 ms, held up to 150 ms on the way down)."""
    hop = max(1, int(sr * 0.005))
    m = band.mean(axis=1) if band.ndim > 1 else band
    k = len(m) // hop
    p = (m[: k * hop] ** 2).reshape(k, hop).mean(axis=1)
    w = max(1, int(ms / 5))
    p = np.convolve(p, np.ones(w) / w, mode="same")
    db = 10 * np.log10(p + 1e-12)
    out = np.empty_like(db)
    prev = db[0] if len(db) else -120.0
    r = np.exp(-1.0 / 30)                                # 150 ms to fall: the lift does not breathe with every syllable
    for i, v in enumerate(db):
        prev = v if v > prev else r * prev + (1 - r) * v
        out[i] = prev
    return out, hop


def up(band, sr, most_db):
    """The band with its quiet moments raised: below its loud level (90th percentile) by d dB it gains d/2, up to most_db; over 40 dB below
    that it is left (the floor and the hiss are not raised)."""
    lv, hop = level_db(band, sr)
    if not len(lv):
        return band, 0.0
    top = float(np.percentile(lv, 90))
    d = top - lv
    g_db = np.where(d > 40, 0.0, np.clip(d / 2, 0, most_db))
    g = np.repeat(10 ** (g_db / 20), hop)
    g = np.pad(g, (0, max(0, len(band) - len(g))), mode="edge")[: len(band)]
    return band * g[:, None], float(np.mean(g_db))


def main():
    t0 = time.time()
    audio, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    amount = max(0.0, min(30.0, float(p.get("amount", 10)))) / 100
    most = max(2.0, min(18.0, float(p.get("most", 12))))
    f1 = max(80.0, min(800.0, float(p.get("low", 250))))
    f2 = max(f1 * 2, min(10000.0, float(p.get("high", 3000))))
    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    low, rest = split(x, sr, f1)
    mid, high = split(rest, sr, f2)
    del rest
    wet, means = np.zeros_like(x), []
    for b in (low, mid, high):
        u, mdb = up(b, sr, most)
        wet += u
        means.append(mdb)
        del u
    del low, mid, high                                   # let go before the mix: a song's worth of float64 is 180 MB a copy
    y = (1 - amount) * x + amount * wet
    del wet
    li_i = ld.measure(x.T, sr, with_true_peak=False).integrated_lufs
    lo_i = ld.measure(y.T, sr, with_true_peak=False).integrated_lufs
    back = 0.0
    if li_i is not None and lo_i is not None:
        back = float(li_i - lo_i)
        y *= 10 ** (back / 20)
    pk = float(np.max(np.abs(y))) if len(y) else 0.0
    held = 0.0
    if pk > 0.999:
        held = 20 * np.log10(0.999 / pk)
        y *= 0.999 / pk
    sf.write(str(Path(outdir) / "details-up.flac"), y.astype(np.float32), sr, subtype="PCM_24")
    print(json.dumps({"files": [{"name": f"Details up, {round(amount * 100)} %", "file": "details-up.flac", "seconds": round(len(y) / sr, 2)}],
                      "measure": {"amount_pct": round(amount * 100), "most_db": most, "low_hz": f1, "high_hz": f2,
                                  "band_lift_db": {"low": round(means[0], 2), "mid": round(means[1], 2), "high": round(means[2], 2)},
                                  "loudness_back_db": round(back, 2), "held_db": round(held, 2)},
                      "summary": f"the quiet details lifted in three bands (mean lift in the band {means[0]:.1f} / {means[1]:.1f} / {means[2]:.1f} dB, "
                                 f"mixed at {round(amount * 100)} %), the loudness as it came" + (f"; {held:.1f} dB down to stay under full scale" if held < -0.05 else ""),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
