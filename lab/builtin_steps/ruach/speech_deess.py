"""HERESY 2336 · Speech de-esser, the Reader's node (speech_core.py says the chain): where the hiss of an s or a sh rises over the voice's body
past the threshold, only its band comes down, 4:1, its depth at most; the voice below the band untouched.
    speech_deess.py AUDIO OUTDIR PARAMS.json   (PARAMS: threshold dB -12..12, depth dB 2..12, from Hz 4000 | 5000 | 6000)"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import speech_core as sc  # noqa: E402


def main():
    t0 = time.time()
    audio, outdir, p = Path(sys.argv[1]), Path(sys.argv[2]), json.load(open(sys.argv[3], encoding="utf-8"))
    thr = max(-12.0, min(12.0, float(p.get("threshold", 0))))
    depth = max(2.0, min(12.0, float(p.get("depth", 6))))
    lo = float(p.get("from", "5000")) if str(p.get("from", "5000")) in ("4000", "5000", "6000") else 5000.0
    x, sr = sc.read(audio)
    y, m = sc.deess(x, sr, thr, depth, lo)
    sc.write(outdir / "speech_deess.flac", y, sr)
    sc.answer([{"name": f"Speech de-esser {thr:+g} dB, {depth:g} dB deep", "file": "speech_deess.flac", "seconds": round(y.shape[1] / sr, 2)}],
              dict(m, threshold_db=thr, depth_db=depth),
              f"the hiss lowered in {m['frames_lowered'] * 100:.1f} % of the frames, {m['mean_db_when_lowered']} dB on average there, {m['max_db']} dB at most",
              time.time() - t0)


if __name__ == "__main__":
    main()
