"""HERESY 1738: the Refiner's Mono Maker, Peak glue and True-peak ceiling on made sounds. python3 lab/test_mixtools.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import plugins as pk  # noqa: E402
from plenio_core.audio import loudness as ld  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def run(script, audio, out, params):
    out.mkdir(parents=True, exist_ok=True)
    pf = out.parent / (out.name + ".json")
    json.dump(params, open(pf, "w"))
    p = subprocess.run([sys.executable, str(HERE / "builtin_steps/ruach" / script), str(audio), str(out), str(pf)], capture_output=True, text=True)
    return (pk.result(p.stdout) if p.returncode == 0 else None), p.stderr[-400:]


def band_side(x, sr, lo, hi):
    sos = butter(4, [lo, hi], btype="bandpass", fs=sr, output="sos")
    s = sosfilt(sos, (x[:, 0] - x[:, 1]) / 2)
    return float(np.sum(s * s))


sr, n = 48000, 48000 * 10
rng = np.random.default_rng(1738)
low = sosfilt(butter(4, 90, "lowpass", fs=sr, output="sos"), rng.standard_normal((n, 2)), axis=0)   # wide lows: side as strong as mid
high = sosfilt(butter(4, 2000, "highpass", fs=sr, output="sos"), rng.standard_normal((n, 2)), axis=0)
x = 0.3 * low / np.abs(low).max() + 0.2 * high / np.abs(high).max()
t = np.arange(n) / sr
bursts = (np.sin(2 * np.pi * 0.7 * t) > 0.97)[:, None] * 2.5 + 1.0               # loud moments, a few % of the time
y = x * bursts
y = 0.95 * y / np.abs(y).max()
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    a = d / "in.wav"; sf.write(str(a), y, sr, subtype="PCM_24")
    print("Mono Maker")
    r, err = run("mono.py", a, d / "mono", {"freq": 120, "amount": 100})
    check("runs", r is not None, err)
    if r:
        m = r["measure"]; z, _ = sf.read(str(d / "mono" / r["files"][0]["file"]), always_2d=True)
        check("the side's share of the lows from about half to under 3 %", m["side_of_lows_before_pct"] > 30 and m["side_of_lows_after_pct"] < 3, m)
        keep = band_side(z, sr, 3000, 12000) / band_side(y, sr, 3000, 12000)
        check("the side above it as it was (3–12 kHz within 3 %, the full-scale guard aside)", abs(keep * 10 ** (-2 * m["held_db"] / 20) - 1) < 0.03, keep)
    r, err = run("mono.py", a, d / "mono50", {"freq": 120, "amount": 50})
    check("half: about a quarter of the side's energy left", r is not None and 8 < r["measure"]["side_of_lows_after_pct"] < 25, r and r["measure"])
    print("Peak glue")
    r, err = run("glue.py", a, d / "glue", {"reduction": 3})
    check("runs", r is not None, err)
    if r:
        m = r["measure"]; z, _ = sf.read(str(d / "glue" / r["files"][0]["file"]), always_2d=True)
        check("the loud moments lose about the 3 dB asked", 2.5 <= m["taken_on_peaks_db"] <= 3.5, m)
        lin, lout = ld.measure(y.T, sr, with_true_peak=False).integrated_lufs, ld.measure(z.T, sr, with_true_peak=False).integrated_lufs
        check("as loud as it came (within 0.3 LU, the full-scale guard aside)", abs((lout - m["held_db"]) - lin) < 0.3, (lin, lout, m["held_db"]))
    print("True-peak ceiling")
    body = x / np.abs(x).max()                                                      # the ceiling on a body without bursts, as music's
    hot = np.clip(body * 1.15, -1, 1)                                               # over full scale between the samples
    h = d / "hot.wav"; sf.write(str(h), hot, sr, subtype="PCM_24")
    r, err = run("ceiling.py", h, d / "ceil", {"ceiling": -0.5, "loudness": "as"})
    check("runs", r is not None, err)
    if r:
        m = r["measure"]
        check("the true peak under −0.5 dBTP, from over it", m["before"]["true_peak_dbtp"] > -0.5 and m["after"]["true_peak_dbtp"] <= -0.48, m)
        check("its loudness kept (within 0.5 LU)", abs(m["after"]["integrated_lufs"] - m["before"]["integrated_lufs"]) < 0.5, m)
    q = d / "body.wav"; sf.write(str(q), 0.3 * body, sr, subtype="PCM_24")
    r, err = run("ceiling.py", q, d / "ceil14", {"ceiling": -1.0, "loudness": "-14"})
    check("a loudness target: −14 LUFS within 0.5, the ceiling −1 dBTP held", r is not None and abs(r["measure"]["after"]["integrated_lufs"] + 14) < 0.5 and r["measure"]["after"]["true_peak_dbtp"] <= -0.98, r and r["measure"]["after"])
print("\nall passed" if not bad else f"\n{len(bad)} failed")
sys.exit(1 if bad else 0)
