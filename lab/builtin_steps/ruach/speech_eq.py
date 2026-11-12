"""HERESY 2336 · Speech EQ, the Reader's node (speech_core.py says the chain): a voice's equalizer by preset. Clear: the rumble under 80 Hz
out, the mud at 250 Hz down 2 dB, the presence at 3.5 kHz up 2 dB, air above 10 kHz up 1.5 dB. Warm: a fuller low end, a softer presence.
Broadcast: the radio voice, its mud out and its presence forward. Rumble: only the rumble out. Amount scales every band but the high-pass.
    speech_eq.py AUDIO OUTDIR PARAMS.json   (PARAMS: preset clear | warm | broadcast | rumble, amount 0..1.5)"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import speech_core as sc  # noqa: E402


def main():
    t0 = time.time()
    audio, outdir, p = Path(sys.argv[1]), Path(sys.argv[2]), json.load(open(sys.argv[3], encoding="utf-8"))
    preset = str(p.get("preset", "clear")) if str(p.get("preset", "clear")) in sc.EQ_PRESETS else "clear"
    amount = max(0.0, min(1.5, float(p.get("amount", 1.0))))
    x, sr = sc.read(audio)
    y, settings = sc.eq(x, sr, preset, amount)
    sc.write(outdir / "speech_eq.flac", y, sr)
    sc.answer([{"name": f"Speech EQ {preset}" + ("" if amount == 1 else f" ×{amount:g}"), "file": "speech_eq.flac", "seconds": round(y.shape[1] / sr, 2)}],
              {"preset": preset, "amount": amount, "eq": settings, "speech_db": [sc.speech_db(x, sr), sc.speech_db(y, sr)]},
              f"{preset}: " + ", ".join(f"{b['type']} {b['frequency_hz']:g} Hz" + (f" {b['gain_db']:+g} dB" if b["type"] != "highpass" else "") for b in settings["bands"]),
              time.time() - t0)


if __name__ == "__main__":
    main()
