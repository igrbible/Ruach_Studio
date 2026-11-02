"""The example node's own check, without the Studio: a test sound through each step exactly as the lab runs it (PYTHON SCRIPT AUDIO OUTDIR
PARAMS.json), its last line read as the lab reads it. Keep a check like this beside your own node: it tells you the node works before the Studio
does. From the Studio's folder:

    .venv/bin/python user/plugins/example-node/check.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
SR = 48000
fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def run(script, audio, outdir, params):
    """As the lab: the step's own folder, its arguments; the last line of JSON, the files checked to be plain names inside OUTDIR."""
    pf = outdir / "params.json"
    pf.write_text(json.dumps(params), encoding="utf-8")
    r = subprocess.run([sys.executable, script, str(audio), str(outdir), str(pf)], cwd=HERE, capture_output=True, text=True, timeout=120)
    if r.returncode:
        return None, (r.stderr.strip().splitlines() or ["?"])[-1]
    last = json.loads([l for l in r.stdout.strip().splitlines() if l.strip()][-1])
    for f in last["files"]:
        assert "/" not in f["file"] and (outdir / f["file"]).is_file(), f
    return last, ""


def level(x, f):
    """The level of a sine at f in the mid, dB (its bin of a Hann-windowed spectrum)."""
    m = x.mean(1)
    S = np.abs(np.fft.rfft(m * np.hanning(len(m))))
    k = int(round(f * len(m) / SR))
    return 20 * np.log10(S[k - 2:k + 3].max())


t = np.arange(4 * SR) / SR
lows, highs = 0.2 * np.sin(2 * np.pi * 100 * t), 0.2 * np.sin(2 * np.pi * 6000 * t)
stereo = np.stack([lows + highs + 0.05 * np.sin(2 * np.pi * 800 * t), lows + highs - 0.05 * np.sin(2 * np.pi * 800 * t)], 1)
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    src = d / "take.flac"
    sf.write(str(src), stereo, SR, subtype="PCM_24")
    x, _ = sf.read(str(src), always_2d=True)
    for name, params in (("flat", {"tilt": 0, "pivot": "1000", "width": 100, "keep_loudness": True}), ("bright", {"tilt": 4, "pivot": "1000", "width": 100, "keep_loudness": False}),
                         ("mono", {"tilt": 0, "pivot": "1000", "width": 0, "keep_loudness": False}), ("loud", {"tilt": 6, "pivot": "500", "width": 200, "keep_loudness": False})):
        out = d / name
        out.mkdir()
        if name == "loud":                                 # a hot source, near full scale: the tilt and the width push it over
            hot = d / "hot.flac"
            sf.write(str(hot), stereo * 2.1, SR, subtype="PCM_24")
        res, err = run("tilt_width.py", hot if name == "loud" else src, out, params)
        if res is None:
            check(f"tilt_width.py {name}: ran", False, err)
            continue
        y, _ = sf.read(str(out / res["files"][0]["file"]), always_2d=True)
        if name == "flat":
            check("no tilt, the width as it was: the sound back as it came, sample for sample (24-bit)", np.abs(y - x).max() < 1e-5, np.abs(y - x).max())
            check("  the contract: the last line names the sound first, then its page; a summary and the measure", res["files"][0]["file"].endswith(".flac") and
                  res["files"][1]["file"].endswith(".md") and res["summary"] and "tilt_db" in res["measure"], res)
        if name == "bright":
            hi, lo = level(y, 6000) - level(x, 6000), level(y, 100) - level(x, 100)
            check("a tilt of +4 dB: the highs about +2, the lows about −2", 1.5 < hi < 2.2 and -2.2 < lo < -1.5, (hi, lo))
        if name == "mono":
            check("width 0: left and right the same", np.abs(y[:, 0] - y[:, 1]).max() < 1e-5, np.abs(y[:, 0] - y[:, 1]).max())
        if name == "loud":
            check("never over full scale: turned down to fit, and said so", np.abs(y).max() <= 0.9991 and res["measure"]["held_db"] < 0, (np.abs(y).max(), res["measure"]))
    out = d / "meter"
    out.mkdir()
    res, err = run("width_meter.py", src, out, {})
    check("the meter only looks: a page and a table, a summary of the whole", res is not None and [f["file"] for f in res["files"]] == ["width.md", "width.csv"] and
          res["summary"].startswith("width ") and res["measure"]["lows"]["correlation"] > 0.99, err or res)
    one = d / "one.flac"
    sf.write(str(one), stereo[:, :1], SR, subtype="PCM_24")
    out = d / "meter-one"
    out.mkdir()
    res, err = run("width_meter.py", one, out, {})
    check("an error says why, on its last line (the tree and the panel show it)", res is None and "one channel" in err, err)
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
