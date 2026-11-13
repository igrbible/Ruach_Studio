"""HERESY 2336 (the unified plan of 08.11.2026, the Reader's links with the Studio: «Огранщик: речевая цепочка»; §5 of the protocol: «шумодав,
де-эссер, эквалайзер речи, громкость −16 LUFS, аналоговый проход через VLA III — Чтец»): the speech chain's own sound, shared by its four steps,
each a node of the Reader's realm (plugin.json "realm": "reader": the Refiner shows them for the Reader's takes, the lab refuses them on a song).

    denoise(path_in, path_out, amount_db)        ffmpeg's FFT denoiser (afftdn) with the noise floor measured on the take's quietest stretches,
                                                 noise tracked through it; the speech itself left as it is
    deess(x, sr, threshold_db, depth_db, lo_hz)  a split-band de-esser in the short-time spectrum: where the hiss band (lo..11 kHz) rises
                                                 over the voice's body (150 Hz..4 kHz) past the threshold, only that band comes down (4:1,
                                                 depth at most, an attack of one frame, about 5 ms, and a release of 60 ms), the rest of the
                                                 voice passing as it was (to float precision); the frames it took and how deep
    eq(x, sr, preset, amount)                    a speech EQ by preset (plenio_core's RBJ biquads): clear, warm, broadcast, rumble
    loud(x, sr, target, ceiling)                 the take to a speech loudness (−16 LUFS as podcasts, −18, −19, −14, −23 EBU R128) with
                                                 plenio_core's limiter and an independent true-peak check
    floor_db(x, sr)                              the quietest tenth of 50 ms frames, dBFS: the noise between the words"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

LAB = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB))
from plenio_core.audio import dynamics as dyn  # noqa: E402
from plenio_core.audio import eq as peq  # noqa: E402
from plenio_core.audio import loudness as ld  # noqa: E402

EQ_PRESETS = {
    "clear": [("highpass", 80, 0.0, 0.707), ("peak", 250, -2.0, 1.0), ("peak", 3500, 2.0, 1.0), ("high_shelf", 10000, 1.5, 0.707)],
    "warm": [("highpass", 70, 0.0, 0.707), ("low_shelf", 150, 1.5, 0.707), ("peak", 350, -1.5, 1.0), ("peak", 3000, 1.0, 1.0), ("high_shelf", 12000, 1.0, 0.707)],
    "broadcast": [("highpass", 100, 0.0, 0.707), ("peak", 300, -3.0, 1.0), ("peak", 4000, 3.0, 1.2), ("high_shelf", 10000, 2.0, 0.707)],
    "rumble": [("highpass", 80, 0.0, 0.707)],
}
TARGETS = ("-14", "-16", "-18", "-19", "-23")


def frames_db(x, sr, ms=50):
    """dBFS of frames of ms milliseconds of a mono or (channels, n) signal."""
    m = x.mean(0) if x.ndim == 2 else x
    hop = max(1, int(sr * ms / 1000))
    n = len(m) // hop
    if n == 0:
        return np.array([-120.0])
    return 20 * np.log10(np.sqrt((m[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))


def floor_db(x, sr):
    db = frames_db(x, sr)
    return round(float(np.percentile(db, 10)), 1)


def speech_db(x, sr):
    db = frames_db(x, sr)
    on = db > max(-50.0, db.max() - 40.0)
    return round(float(10 * np.log10(np.mean(10 ** (db[on] / 10)))), 1) if on.any() else round(float(db.max()), 1)


def denoise(src, dst, amount_db, floor):
    """ffmpeg afftdn: nr the reduction, nf the measured floor (within afftdn's -80..-20), tn on (the noise followed as it moves)."""
    nf = max(-80.0, min(-20.0, floor))
    af = f"afftdn=nr={max(0.01, min(97.0, float(amount_db))):.2f}:nf={nf:.1f}:tn=1"
    # HERESY 2418: afftdn gives its output 25 ms late (half its 50 ms window: measured at 24, 44.1 and 48 kHz, 600, 1102 and 1200 samples), the
    # take's last 25 ms dropped; the chain's take was a beat behind its pieces' times. The tail padded by as much and the head taken off, so the
    # result lies sample for sample where the take was, its length the take's
    import soundfile as sf
    lat = int(round(0.025 * sf.info(str(src)).samplerate))
    af = f"apad=pad_len={lat},{af},atrim=start_sample={lat},asetpts=PTS-STARTPTS"
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-c:a", "flac", "-sample_fmt", "s32", str(dst)],
                       capture_output=True, text=True, timeout=3600)
    if p.returncode != 0:
        raise RuntimeError("ffmpeg's denoiser failed: " + ((p.stderr or "").strip().splitlines() or ["?"])[-1])
    return af


BLOCK = 2048                         # frames of the short-time spectrum taken at a time: an hour's chapter never held whole as a spectrum


def _frames(y, n, hop):
    """The padded signal's frames as a view (nothing copied) and the padded length."""
    pad = np.concatenate([np.zeros(n, np.float32), y.astype(np.float32), np.zeros(n, np.float32)])
    return np.lib.stride_tricks.sliding_window_view(pad, n)[::hop], len(pad)


def deess(x, sr, threshold_db=0.0, depth_db=6.0, lo_hz=5000.0, ratio=4.0, hi_hz=11000.0):
    """x: (channels, n) float. Returns (y, measure). The detector reads the mid; every channel takes the same gain. hi_hz: the band's top
    (HERESY 2417: the TTS Voice Upscaler's voice profiles ask 4 to 8 kHz for a man's voice, 6 to 11 kHz for a woman's)."""
    n = 1024 if sr <= 48000 else 2048
    hop = n // 4
    win = np.hanning(n + 1)[:-1].astype(np.float32)
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    hi_hz = min(float(hi_hz), sr / 2 - 500)
    sib = (freqs >= lo_hz) & (freqs <= hi_hz)
    body = (freqs >= 150) & (freqs <= 4000)
    F, total = _frames(x.mean(0), n, hop)
    k = F.shape[0]
    e_sib, e_body, lvl = np.empty(k), np.empty(k), np.empty(k)
    for a in range(0, k, BLOCK):
        P = np.abs(np.fft.rfft(F[a:a + BLOCK] * win, axis=1)) ** 2
        e_sib[a:a + BLOCK], e_body[a:a + BLOCK], lvl[a:a + BLOCK] = P[:, sib].sum(1) + 1e-12, P[:, body].sum(1) + 1e-12, P.sum(1) + 1e-12
    rel, lvl, sib_db = 10 * np.log10(e_sib / e_body), 10 * np.log10(lvl), 10 * np.log10(e_sib)
    red = np.clip((rel - threshold_db) * (1 - 1 / ratio), 0, depth_db) * (sib_db > lvl.max() - 30)   # a hiss loud enough to hear, not the room's
    rel_a = np.exp(-hop / (sr * 0.060))                 # 60 ms release; the attack is a frame (about 5 ms at 48 kHz: a hiss is never late)
    sm = np.zeros_like(red)
    for i, r in enumerate(red):
        sm[i] = r if r >= (sm[i - 1] if i else 0) else (sm[i - 1] * rel_a + r * (1 - rel_a))
    ramp = np.clip((freqs - (lo_hz - 500)) / 500, 0, 1)    # half a kilohertz eased in under the band, eased out above it
    ramp[freqs > hi_hz] = np.clip(1 - (freqs[freqs > hi_hz] - hi_hz) / 1000, 0, 1)
    wsum = np.zeros(total, np.float32)
    for a in range(0, k, BLOCK):
        for i in range(min(BLOCK, k - a)):
            wsum[(a + i) * hop:(a + i) * hop + n] += win ** 2
    y = np.empty((x.shape[0], x.shape[1]), np.float32)
    for c in range(x.shape[0]):
        Fc, _t = _frames(x[c], n, hop)
        out = np.zeros(total, np.float32)
        for a in range(0, k, BLOCK):
            g = 10 ** (-(sm[a:a + BLOCK, None] * ramp[None, :]) / 20)
            fr = np.fft.irfft(np.fft.rfft(Fc[a:a + BLOCK] * win, axis=1) * g, n=n, axis=1).astype(np.float32) * win
            for i, f in enumerate(fr):
                out[(a + i) * hop:(a + i) * hop + n] += f
        y[c] = (out / np.maximum(wsum, 1e-8))[n:n + x.shape[1]]
    took = sm > 0.5
    return y.astype(np.float64), {"frames_lowered": round(float(took.mean()), 4), "max_db": round(float(sm.max()), 1),
                                  "mean_db_when_lowered": round(float(sm[took].mean()), 1) if took.any() else 0.0, "band_hz": [int(lo_hz), int(hi_hz)]}


def eq(x, sr, preset="clear", amount=1.0):
    bands = []
    for i, (kind, f, g, q) in enumerate(EQ_PRESETS.get(preset, EQ_PRESETS["clear"])):
        bands.append({"id": f"b{i}", "type": kind, "frequency_hz": f, "gain_db": round(g * float(amount), 2) if kind != "highpass" else 0.0, "q": q})
    settings = {"schema": peq.SCHEMA, "preamp_db": 0.0, "bands": bands}
    return np.asarray(peq.apply(x, sr, settings)), settings


def loud(x, sr, target=-16.0, ceiling=-1.0):
    y, _rate, info = dyn.master(x, sr, dyn.Target(integrated_lufs=float(target), ceiling_dbtp=float(ceiling)))
    return np.asarray(y), info


def measure(x, sr):
    m = ld.measure(x, sr).to_dict()
    return {"integrated_lufs": m.get("integrated_lufs"), "true_peak_dbtp": m.get("true_peak_dbtp"), "lra": m.get("loudness_range_lu", m.get("lra")),
            "speech_db": speech_db(x, sr), "floor_db": floor_db(x, sr)}


def read(path):
    import soundfile as sf
    x, sr = sf.read(str(path), dtype="float64", always_2d=True)
    return x[:, :2].T.copy(), sr


def write(path, y, sr):
    import soundfile as sf
    sf.write(str(path), np.asarray(y).T.astype(np.float32), sr, subtype="PCM_24")


def answer(files, measure_, summary, took):
    print(json.dumps({"files": files, "measure": measure_, "summary": summary, "took": round(took, 1)}, ensure_ascii=False))
