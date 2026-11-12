"""HERESY 2336 · Speech loudness, the Reader's node (speech_core.py says the chain): the take to a speech loudness, −16 LUFS as podcasts by
default (−18, −19, −14, −23 for EBU R128 broadcast), its true peak held under the ceiling by plenio_core's limiter and checked by an
independent meter.
    speech_loud.py AUDIO OUTDIR PARAMS.json   (PARAMS: loudness -14 | -16 | -18 | -19 | -23, ceiling dBTP -3..-0.5)"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import speech_core as sc  # noqa: E402


def main():
    t0 = time.time()
    audio, outdir, p = Path(sys.argv[1]), Path(sys.argv[2]), json.load(open(sys.argv[3], encoding="utf-8"))
    target = float(p.get("loudness", "-16")) if str(p.get("loudness", "-16")) in sc.TARGETS else -16.0
    ceiling = max(-3.0, min(-0.5, float(p.get("ceiling", -1.0))))
    x, sr = sc.read(audio)
    before = sc.measure(x, sr)
    y, info = sc.loud(x, sr, target, ceiling)
    after = sc.measure(y, sr)
    sc.write(outdir / "speech_loud.flac", y, sr)
    last = (info.get("attempts") or [{}])[-1]
    sc.answer([{"name": f"Speech loudness {target:g} LUFS", "file": "speech_loud.flac", "seconds": round(y.shape[1] / sr, 2)}],
              {"target_lufs": target, "ceiling_dbtp": ceiling, "before": before, "after": after, "max_reduction_db": (last.get("limiter") or {}).get("max_reduction_db")},
              f"{before['integrated_lufs']} → {after['integrated_lufs']} LUFS, true peak {before['true_peak_dbtp']} → {after['true_peak_dbtp']} dBTP",
              time.time() - t0)


if __name__ == "__main__":
    main()
