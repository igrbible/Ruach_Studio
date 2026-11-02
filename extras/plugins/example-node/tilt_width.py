"""Tilt and width: the example node's step that changes the sound (extras/plugins/example-node, CC0: copy it as the start of your own).

The lab runs a step as

    PYTHON tilt_width.py AUDIO OUTDIR PARAMS.json

in the plugin's folder, and reads the LAST line it prints: one line of JSON naming the files it wrote into OUTDIR. Every line before it is its log.
AUDIO is the take or the file of its tree chosen as the source; it is never written to. PARAMS.json holds the fields of plugin.json, already
cleaned by the lab to their kinds and bounds.

What it does: the tone tilted about a pivot (the highs up and the lows down by half the tilt each, or the other way), the stereo made wider or
narrower through mid and side, the result as loud as it came and never over full scale. Put your own sound into process(); the rest is the
contract every step keeps."""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt


def process(x, sr, tilt_db, pivot_hz, width):
    """The sound itself. x: (samples, channels), float64, −1…1. The same shape comes back."""
    sos = butter(1, pivot_hz, btype="lowpass", fs=sr, output="sos")
    low = sosfiltfilt(sos, x, axis=0)                     # zero-phase: low + (x − low) is x again, sample for sample
    high = x - low
    y = low * 10 ** (-tilt_db / 40) + high * 10 ** (tilt_db / 40)   # half the tilt each way: the pivot stays where it was
    if y.shape[1] == 2 and width != 1.0:
        mid, side = (y[:, 0] + y[:, 1]) / 2, (y[:, 0] - y[:, 1]) / 2 * width
        y = np.stack([mid + side, mid - side], axis=1)
    return y


def rms_db(x):
    return 20 * np.log10(max(float(np.sqrt(np.mean(np.square(x)))), 1e-12))


def main():
    t0 = time.time()
    audio, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    p = json.loads(pfile.read_text(encoding="utf-8"))
    tilt = float(p.get("tilt", 1.5))                     # each field read with its default: an older profile may lack a newer field
    pivot = float(p.get("pivot", 1000))
    width = float(p.get("width", 100)) / 100
    keep = bool(p.get("keep_loudness", True))

    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    if not len(x):
        raise SystemExit("the file has no sound in it")    # an error: its last line is what the tree and the panel show
    print(f"tilt {tilt:+.1f} dB about {pivot:.0f} Hz, width {width:.0%}, {len(x) / sr:.1f} s at {sr} Hz", flush=True)   # a log line

    y = process(x, sr, tilt, pivot, width)
    gain = rms_db(x) - rms_db(y) if keep else 0.0
    y = y * 10 ** (gain / 20)
    peak, held = float(np.abs(y).max()), 0.0
    if peak > 0.999:                                       # never clipped: turned down until it fits
        held = 20 * np.log10(0.999 / peak)
        y = y * (0.999 / peak)

    sound = outdir / "tilt_width.flac"                     # plain names inside OUTDIR, nothing else
    sf.write(str(sound), y, sr, subtype="PCM_24")
    page = outdir / "tilt_width.md"
    page.write_text("\n".join([
        "# Tilt and width", "",
        f"- Tilt: {tilt:+.1f} dB about {pivot:.0f} Hz (the highs {tilt / 2:+.2f} dB, the lows {-tilt / 2:+.2f} dB)",
        f"- Width: {width:.0%} of the side",
        f"- Loudness: {'kept' if keep else 'left as it came out'} ({gain:+.2f} dB)" + (f", then {held:.2f} dB to stay under full scale" if held else ""),
        f"- Source: `{audio.name}`, {len(x) / sr:.1f} s at {sr} Hz", ""]), encoding="utf-8")

    summary = f"tilt {tilt:+.1f} dB about {pivot:.0f} Hz, width {width:.0%}" + (f", {held:.1f} dB down to fit" if held else "")
    print(json.dumps({
        "files": [{"name": f"tilt {tilt:+.1f} dB, width {round(width * 100)} %", "file": sound.name, "seconds": round(len(y) / sr, 2)},
                  {"name": "what it did", "file": page.name}],     # a .md is a page to read in the tree, not a sound
        "measure": {"tilt_db": tilt, "pivot_hz": pivot, "width": width, "gain_db": round(gain, 2), "held_db": round(held, 2)},
        "summary": summary, "took": round(time.time() - t0, 2)}))


if __name__ == "__main__":
    main()
