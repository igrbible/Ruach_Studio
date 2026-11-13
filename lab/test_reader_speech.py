"""HERESY 2336: the speech chain's four steps (the Reader's nodes), without a card: a made-up voice at 48 kHz in stereo with a hiss under it and
bursts of an «s», run through each step's own script as the lab runs a plugin's step (AUDIO OUTDIR PARAMS.json, its JSON on stdout): the noise
between the words comes down and the voice stays; only the hiss band comes down, and only where the «s» is; the clear preset moves 250 Hz and
3.5 kHz the right way; the reading lands on −16 LUFS under −1 dBTP. Then the plugin as the lab loads it: four steps of the Reader's realm after
the TTS Voice Upscaler, and the pipeline valid."""
import json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
STEPS = HERE / "builtin_steps" / "ruach"
SR = 48000
rng = np.random.default_rng(3)


def band_db(x, lo, hi, a=0.0, b=None):
    y = x.mean(0)[int(a * SR):int(b * SR) if b else None]
    S = np.abs(np.fft.rfft(y * np.hanning(len(y)))) ** 2
    f = np.fft.rfftfreq(len(y), 1 / SR)
    return 10 * np.log10(S[(f >= lo) & (f <= hi)].sum() + 1e-12)


def run(step, src, params, out):
    out.mkdir(parents=True, exist_ok=True)
    (out / "p.json").write_text(json.dumps(params))
    p = subprocess.run([sys.executable, str(STEPS / f"speech_{step}.py"), str(src), str(out), str(out / "p.json")], capture_output=True, text=True, timeout=600)
    assert p.returncode == 0, p.stderr[-800:]
    a = json.loads(p.stdout.strip().splitlines()[-1])
    y, sr = sf.read(str(out / a["files"][0]["file"]), dtype="float64", always_2d=True)
    return a, y.T, sr


t = np.arange(int(SR * 6)) / SR
f0 = 120 + 15 * np.sin(2 * np.pi * 0.7 * t)
voice = sum(np.sin(k * 2 * np.pi * np.cumsum(f0) / SR) / k for k in range(1, 30)) * (0.5 + 0.5 * np.sin(2 * np.pi * 2.2 * t) ** 2)
voice *= (t % 1.5 < 1.1)                                     # words, then a pause
hiss = np.zeros_like(t)
for s0 in (0.3, 1.8, 3.3, 4.8):                              # an «s» at the start of each word
    m = (t >= s0) & (t < s0 + 0.18)
    from scipy.signal import butter, sosfilt
    hiss[m] = sosfilt(butter(4, [5500, 9500], "band", fs=SR, output="sos"), rng.standard_normal(m.sum())) * 0.9
x = 0.12 * voice / np.abs(voice).max() + 0.15 * hiss + 0.002 * rng.standard_normal(len(t))
x = np.stack([x, x * 0.97])
with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    src = d / "take.wav"
    sf.write(str(src), x.T.astype(np.float32), SR, subtype="PCM_24")
    # denoise: the noise between the words comes down, the voice stays
    a, y, sr = run("denoise", src, {"amount": 12}, d / "dn")
    assert sr == SR and y.shape == x.shape, y.shape
    assert a["measure"]["after"]["floor_db"] < a["measure"]["before"]["floor_db"] - 4, a["measure"]
    assert abs(a["measure"]["after"]["speech_db"] - a["measure"]["before"]["speech_db"]) < 1.0, a["measure"]
    # de-esser: the hiss band down where the «s» is, the voice's body and the words without an «s» as they were
    a, y, sr = run("deess", src, {"threshold": 0, "depth": 8, "from": "5000"}, d / "de")
    assert y.shape == x.shape and 0 < a["measure"]["frames_lowered"] < 0.25 and a["measure"]["max_db"] > 4, a["measure"]   # the «s» only, never the room
    assert band_db(y, 5500, 9500, 1.8, 1.98) < band_db(x, 5500, 9500, 1.8, 1.98) - 3, "the hiss did not come down"
    assert abs(band_db(y, 150, 3000, 0.6, 1.0) - band_db(x, 150, 3000, 0.6, 1.0)) < 0.2, "the voice's body moved"
    assert np.max(np.abs(y[:, int(0.7 * SR):int(1.0 * SR)] - x[:, int(0.7 * SR):int(1.0 * SR)])) < 2e-3, "a word without an s changed"
    # EQ clear: the mud down, the presence up, the rumble out
    a, y, sr = run("eq", src, {"preset": "clear", "amount": 1}, d / "eq")
    assert band_db(y, 200, 300) < band_db(x, 200, 300) - 1 and band_db(y, 3000, 4000) > band_db(x, 3000, 4000) + 1, "the clear preset"
    assert a["measure"]["preset"] == "clear" and len(a["measure"]["eq"]["bands"]) == 4
    a0, y0, _ = run("eq", src, {"preset": "warm", "amount": 0}, d / "eq0")
    assert all(b["gain_db"] == 0 for b in a0["measure"]["eq"]["bands"])                         # amount 0: only the rumble filter left
    # loudness: −16 LUFS under −1 dBTP
    a, y, sr = run("loud", src, {"loudness": "-16", "ceiling": -1}, d / "ld")
    assert abs(a["measure"]["after"]["integrated_lufs"] + 16) <= 0.3 and a["measure"]["after"]["true_peak_dbtp"] <= -0.95, a["measure"]["after"]
    a, y, sr = run("loud", src, {"loudness": "-23", "ceiling": -2}, d / "ld23")
    assert abs(a["measure"]["after"]["integrated_lufs"] + 23) <= 0.3, a["measure"]["after"]
# the plugin as the lab loads it, and its pipeline
import plugins, refiner_profiles
pl, errs = plugins.load_all(HERE.parent / "user" / "plugins-none", HERE / "builtin_steps")
r = [p for p in pl if p["id"] == "ruach"][0]
ids = [s["id"] for s in r["steps"]]
sp = [s for s in r["steps"] if s["id"].startswith("speech_")]
# HERESY 2421: the de-clicker first, then the four
assert [s["id"] for s in sp] == ["speech_declick", "speech_denoise", "speech_deess", "speech_eq", "speech_loud"] and all(s["realm"] == "reader" and s["input"] == "file" for s in sp), sp
assert ids.index("speech_declick") == ids.index("tts_upscale") + 1 if "tts_upscale" in ids else True
chain = [p for p in r["pipelines"] if p["id"] == "speech-chain"][0]["pipeline"]
assert [s.get("sid") for s in chain][:2] == ["speech_declick", "speech_denoise"] and chain[0]["params"]["reel"] is False, chain
assert "speech-chain" in [p["id"] for p in refiner_profiles.pipelines(HERE, pl)]
print("test_reader_speech: ok")
