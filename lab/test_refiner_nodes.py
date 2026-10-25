"""HERESY 1748–1751: the Refiner's Voice tamer, Bass under the kick, Details up and Voice attack and body on made sounds.
    python3 lab/test_refiner_nodes.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import plugins as pk  # noqa: E402
from plenio_core.audio import loudness as ld  # noqa: E402

bad = []
sr = 48000


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def run(script, src, out, params):
    out.mkdir(parents=True, exist_ok=True)
    pf = out.parent / (out.name + ".json")
    json.dump(params, open(pf, "w"))
    p = subprocess.run([sys.executable, str(HERE / "builtin_steps/ruach" / script), str(src), str(out), str(pf)], capture_output=True, text=True)
    return (pk.result(p.stdout) if p.returncode == 0 else None), p.stderr[-400:]


def stems(root, parts):
    """A take's stem set as the lab lays it out: <take>/derived/<set>/ with its manifest."""
    d = root / "take" / "derived" / "stems-test"
    d.mkdir(parents=True, exist_ok=True)
    files = []
    for name, x in parts.items():
        sf.write(str(d / f"{name}.wav"), x, sr, subtype="FLOAT")
        files.append({"name": name, "file": f"{name}.wav", "title": name.replace("_", " ").title()})
    json.dump({"files": files}, open(d / "manifest.json", "w"))
    return d


def band_db(x, lo, hi, a=0, b=None):
    """The band's level over [a, b): the whole signal filtered first, then the stretch read (a short stretch filtered alone is its filter's ringing)."""
    s = sosfiltfilt(butter(4, [lo, hi], btype="bandpass", fs=sr, output="sos"), x.mean(axis=1))[a:b]
    return 10 * np.log10(np.mean(s * s) + 1e-20)


def db(x, a=0, b=None):
    return 10 * np.log10(np.mean(x[a:b] ** 2) + 1e-20)


rng = np.random.default_rng(1748)
with tempfile.TemporaryDirectory() as d:
    d = Path(d)

    # ---------------------------------------------------------------- Voice tamer
    print("Voice tamer")
    n = sr * 6
    t = np.arange(n) / sr
    f0 = 180 * (1 + 0.01 * np.sin(2 * np.pi * 5 * t))                    # a sung tone with a little vibrato
    ph = 2 * np.pi * np.cumsum(f0) / sr
    plain, rung = np.zeros(n), np.zeros(n)
    for k in range(1, 45):
        fk = 180 * k
        plain += 1.0 / k * np.sin(k * ph)
        rung += 1.0 / k * (4.0 if 3000 <= fk <= 3400 else 1.0) * np.sin(k * ph)   # a resonance: the overtones by 3.2 kHz 12 dB over their neighbours
    syll = ((t % 1.0) < 0.8).astype(float)                              # 0.8 s sung, 0.2 s of silence, five times
    syll[t >= 5.0] = 0
    wolf = ((t >= 1.0) & (t < 2.0)) | ((t >= 3.0) & (t < 4.0))          # the resonance rings in the 2nd and the 4th only: the wolf, not the voice's colour
    v = np.where(wolf, rung, plain)
    s_burst = sosfilt(butter(4, [5000, 10000], btype="bandpass", fs=sr, output="sos"), rng.standard_normal(n))
    s_burst = s_burst * ((t >= 5.2) & (t < 5.5))                        # a final «с», 300 ms of broad noise
    voice = 0.25 * v / np.abs(v).max() * syll + 0.08 * s_burst / np.abs(s_burst).max()
    vx = np.stack([voice, 0.8 * voice], axis=1)                          # stands a little to the left
    sd = stems(d / "a", {"vocals": vx, "other": 0.1 * rng.standard_normal((n, 2))})
    r, err = run("tamer.py", sd, d / "tamer", {"depth": 4})
    check("runs, one version back: the voice stem (the other stem left alone)", r is not None and len(r["files"]) == 1 and r["files"][0]["source"].endswith("vocals.wav"), err or r)
    if r:
        z, _ = sf.read(str(d / "tamer" / r["files"][0]["file"]), always_2d=True)
        s1, s2 = int(1.1 * sr), int(1.7 * sr)                            # the 2nd syllable, where the wolf rings
        res = band_db(vx, 3000, 3400, s1, s2) - band_db(z, 3000, 3400, s1, s2)
        check("the resonance by 3.2 kHz down 2–5 dB where it rings", 2.0 <= res <= 5.0, round(res, 2))
        calm = abs(band_db(vx, 3000, 3400, int(0.1 * sr), int(0.7 * sr)) - band_db(z, 3000, 3400, int(0.1 * sr), int(0.7 * sr)))
        check("3.2 kHz within 0.5 dB where it does not (the voice's colour kept)", calm < 0.5, round(calm, 2))
        nb = abs(band_db(vx, 1500, 2500, s1, s2) - band_db(z, 1500, 2500, s1, s2))
        check("its neighbours 1.5–2.5 kHz within 1 dB", nb < 1.0, round(nb, 2))
        lowk = abs(band_db(vx, 150, 1000, s1, s2) - band_db(z, 150, 1000, s1, s2))
        check("the body under 1 kHz within 0.3 dB", lowk < 0.3, round(lowk, 2))
        env_in = np.abs(sosfiltfilt(butter(4, [5000, 10000], btype="bandpass", fs=sr, output="sos"), vx[:, 0]))
        env_out = np.abs(sosfiltfilt(butter(4, [5000, 10000], btype="bandpass", fs=sr, output="sos"), z[:, 0]))
        a, b = int(5.1 * sr), int(5.7 * sr)
        def span(e):
            w = np.convolve(e[a:b], np.ones(240) / 240, mode="same")
            on = np.where(w > w.max() * 0.1)[0]
            return (on[-1] - on[0]) / sr if len(on) else 0.0
        check("the «с» as long as it was (within 5 ms)", abs(span(env_in) - span(env_out)) < 0.005, (round(span(env_in), 3), round(span(env_out), 3)))
        sl = band_db(vx, 5000, 10000, int(5.2 * sr), int(5.5 * sr)) - band_db(z, 5000, 10000, int(5.2 * sr), int(5.5 * sr))
        check("tamed a little at most (its level within 3 dB), never cut short", -0.5 < sl < 3.0, round(sl, 2))
        gap = db(z, int(0.85 * sr), int(0.95 * sr))
        check("the silence between phrases stays silent", gap < -80, round(gap, 1))
        ratio = db(z[:, :1], s1, s2) - db(z[:, 1:], s1, s2)
        check("one gain for both channels: the voice stands where it stood (L/R 1.94 dB)", abs(ratio - 20 * np.log10(1 / 0.8)) < 0.05, round(ratio, 3))
    rx = np.stack([0.25 * rung / np.abs(rung).max() * syll] * 2, axis=1)      # a resonance in every syllable: the voice's colour itself
    sd = stems(d / "a2", {"vocals": rx})
    r, err = run("tamer.py", sd, d / "tamer-all", {"depth": 4, "colour": "all"})
    check("«every bulge»: runs", r is not None, err)
    if r:
        z, _ = sf.read(str(d / "tamer-all" / r["files"][0]["file"]), always_2d=True)
        res = band_db(rx, 3000, 3400, int(0.1 * sr), int(0.7 * sr)) - band_db(z, 3000, 3400, int(0.1 * sr), int(0.7 * sr))
        check("«every bulge»: a resonance in every syllable down 2–5 dB too", 2.0 <= res <= 5.0, round(res, 2))
    r, err = run("tamer.py", sd, d / "tamer-keep", {"depth": 4})
    if r:
        z, _ = sf.read(str(d / "tamer-keep" / r["files"][0]["file"]), always_2d=True)
        res = abs(band_db(rx, 3000, 3400, int(0.1 * sr), int(0.7 * sr)) - band_db(z, 3000, 3400, int(0.1 * sr), int(0.7 * sr)))
        check("by default the same, ringing always, is the voice's colour: within 0.5 dB", res < 0.5, round(res, 2))

    # ---------------------------------------------------------------- Bass under the kick
    print("Bass under the kick")
    n = sr * 10
    t = np.arange(n) / sr
    kick = np.zeros(n)
    for k0 in np.arange(0.25, 10, 0.5):                                  # twenty kicks, every half second
        i = int(k0 * sr); m = int(0.12 * sr)
        tt = np.arange(m) / sr
        kick[i:i + m] += np.sin(2 * np.pi * 60 * tt) * np.exp(-tt / 0.04)
    hats = sosfilt(butter(4, 7000, btype="highpass", fs=sr, output="sos"), rng.standard_normal(n)) * 0.05
    drums = np.stack([0.8 * kick + hats] * 2, axis=1)
    bass1 = 0.3 * np.sin(2 * np.pi * 55 * t) + 0.1 * np.sin(2 * np.pi * 440 * t)
    bass = np.stack([bass1] * 2, axis=1)
    sd = stems(d / "b", {"drums": drums, "bass": bass, "vocals": np.zeros((n, 2))})
    r, err = run("duck.py", sd, d / "duck", {"depth": 3, "freq": 120})
    check("runs, one version back: the bass stem", r is not None and len(r["files"]) == 1 and r["files"][0]["source"].endswith("bass.wav"), err or r)
    if r:
        z, _ = sf.read(str(d / "duck" / r["files"][0]["file"]), always_2d=True)
        check("the twenty kicks found", 18 <= r["measure"]["kicks"] <= 22, r["measure"])
        under = np.mean([band_db(bass, 40, 70, int((k0 + 0.005) * sr), int((k0 + 0.03) * sr)) - band_db(z, 40, 70, int((k0 + 0.005) * sr), int((k0 + 0.03) * sr)) for k0 in np.arange(1.25, 9, 0.5)])
        check("the bass's low down 2–3.5 dB while a kick sounds", 2.0 <= under <= 3.5, round(under, 2))
        between = np.mean([abs(band_db(bass, 40, 70, int((k0 + 0.38) * sr), int((k0 + 0.48) * sr)) - band_db(z, 40, 70, int((k0 + 0.38) * sr), int((k0 + 0.48) * sr))) for k0 in np.arange(1.25, 9, 0.5)])
        check("as it was between the kicks (within 0.4 dB)", between < 0.4, round(between, 3))
        hi = abs(band_db(bass, 350, 550) - band_db(z, 350, 550))
        check("above the split as it was (440 Hz within 0.1 dB)", hi < 0.1, round(hi, 3))

    # ---------------------------------------------------------------- Details up
    print("Details up")
    n = sr * 8
    noise = rng.standard_normal((n, 2))
    lvl = np.ones(n)
    for i in range(8):                                                   # loud, quiet, loud, quiet… a second each; the last quiet one at the floor
        lvl[i * sr:(i + 1) * sr] = 1.0 if i % 2 == 0 else (10 ** (-24 / 20) if i < 7 else 10 ** (-70 / 20))
    x = 0.2 * noise * lvl[:, None]
    a = d / "lift.wav"; sf.write(str(a), x, sr, subtype="FLOAT")
    r, err = run("lift.py", a, d / "lift", {"amount": 10, "most": 12})
    check("runs", r is not None, err)
    if r:
        z, _ = sf.read(str(d / "lift" / r["files"][0]["file"]), always_2d=True)
        q_in = db(x, int(3.2 * sr), int(3.8 * sr)) - db(x, int(2.2 * sr), int(2.8 * sr))
        q_out = db(z, int(3.2 * sr), int(3.8 * sr)) - db(z, int(2.2 * sr), int(2.8 * sr))
        check("the quiet passages raised against the loud ones by 1–4 dB (at 10 %)", 1.0 <= q_out - q_in <= 4.0, round(q_out - q_in, 2))
        li = ld.measure(x.T, sr, with_true_peak=False).integrated_lufs
        lo = ld.measure(z.T, sr, with_true_peak=False).integrated_lufs
        check("the loudness as it came (within 0.3 LU)", abs(li - lo) < 0.3, (round(li, 2), round(lo, 2)))
        fl = (db(z, int(7.2 * sr), int(7.8 * sr)) - db(z, int(6.2 * sr), int(6.8 * sr))) - (db(x, int(7.2 * sr), int(7.8 * sr)) - db(x, int(6.2 * sr), int(6.8 * sr)))
        check("the floor (−70 dB) not raised (within 0.5 dB against the loud)", abs(fl) < 0.5, round(fl, 2))

    # ---------------------------------------------------------------- Voice attack and body
    print("Voice attack and body")
    n = sr * 5
    t = np.arange(n) / sr
    env = np.zeros(n)
    for k0 in (0.5, 2.0, 3.5):                                           # three notes: 5 ms in, 300 ms held, a 400 ms tail
        i = int(k0 * sr)
        a_, h_, d_ = int(0.005 * sr), int(0.3 * sr), int(0.4 * sr)
        env[i:i + a_] = np.linspace(0, 1, a_)
        env[i + a_:i + a_ + h_] = 1.0
        env[i + a_ + h_:i + a_ + h_ + d_] = np.exp(-np.arange(d_) / sr / 0.08)
    tone = env * np.sin(2 * np.pi * 300 * t) * 0.3
    vx = np.stack([tone, tone], axis=1)
    sd = stems(d / "c", {"lead_vocal": vx, "backing_vocals": np.zeros((n, 2)) + 1e-6 * rng.standard_normal((n, 2)), "drums": np.zeros((n, 2))})
    r, err = run("shape.py", sd, d / "shape", {"attack": 2, "body": 1.5, "voices": "lead"})
    check("runs, one version back: the lead (voices: lead)", r is not None and len(r["files"]) == 1 and r["files"][0]["source"].endswith("lead_vocal.wav"), err or r)
    if r:
        z, _ = sf.read(str(d / "shape" / r["files"][0]["file"]), always_2d=True)
        att = np.mean([db(z, int(k0 * sr), int((k0 + 0.015) * sr)) - db(vx, int(k0 * sr), int((k0 + 0.015) * sr)) for k0 in (2.0, 3.5)])
        check("the note's beginning raised 0.7–2.2 dB", 0.7 <= att <= 2.2, round(att, 2))
        hold = np.mean([abs(db(z, int((k0 + 0.15) * sr), int((k0 + 0.28) * sr)) - db(vx, int((k0 + 0.15) * sr), int((k0 + 0.28) * sr))) for k0 in (2.0, 3.5)])
        check("the held middle as it was (within 0.3 dB)", hold < 0.3, round(hold, 3))
        tail = np.mean([db(z, int((k0 + 0.4) * sr), int((k0 + 0.55) * sr)) - db(vx, int((k0 + 0.4) * sr), int((k0 + 0.55) * sr)) for k0 in (2.0, 3.5)])
        check("its dying away raised 0.4–1.6 dB", 0.4 <= tail <= 1.6, round(tail, 2))

print("\nall passed" if not bad else f"\n{len(bad)} failed")
sys.exit(1 if bad else 0)
