"""HERESY 2336 · Speech denoise, the Reader's node (speech_core.py says the chain): the noise between and under the words brought down by ffmpeg's
FFT denoiser, its floor measured on the take's quietest stretches and followed as it moves; the voice left as it is.
    speech_denoise.py AUDIO OUTDIR PARAMS.json   (PARAMS: amount, dB 3..30)"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import speech_core as sc  # noqa: E402


def main():
    t0 = time.time()
    audio, outdir, p = Path(sys.argv[1]), Path(sys.argv[2]), json.load(open(sys.argv[3], encoding="utf-8"))
    amount = max(3.0, min(30.0, float(p.get("amount", 10))))
    x, sr = sc.read(audio)
    before = sc.measure(x, sr)
    af = sc.denoise(audio, outdir / "speech_denoise.flac", amount, before["floor_db"])
    y, _sr = sc.read(outdir / "speech_denoise.flac")
    after = sc.measure(y, sr)
    sc.answer([{"name": f"Speech denoise {amount:g} dB", "file": "speech_denoise.flac", "seconds": round(y.shape[1] / sr, 2)}],
              {"amount_db": amount, "filter": af, "before": before, "after": after},
              f"noise between the words {before['floor_db']} → {after['floor_db']} dBFS, speech {before['speech_db']} → {after['speech_db']} dBFS",
              time.time() - t0)


if __name__ == "__main__":
    main()
