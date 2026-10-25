"""HERESY 1555 · Voice upscale (the Refiner's open order of 15.10.2026, «Vocal upscale per stem»): the separators work at 44.1 kHz and
dull a voice's top (its air, its breath, the edge of its consonants); UniverSR draws it anew stem by stem, the voices only, each at
the mode asked, the original kept below the cutoff sample for sample (the studio's own upscale_job.py, one variant), then back at the
set's own rate and length so the DAW takes it as a version of its stem. The rest of the set is left as it is.
HERESY 1583 (Viktor 19.10.2026, after the A/B on Krik's voice: «тройка в среднем и громчайший чистят отдельно в своём ракурсе… связка
даёт баланс»): the bundle. UniverSR, Apollo-vocal and FlashSR each draw the top (upbundle_job.py fetches the two from the studio's own models or their authors on
first use), each is joined to the original below the cut, and above it they are blended as UVR blends separators: «avg» the complex
average of the three (measured closest to a voice's true top, 9.5 dB LSD against 11.6–13.9 alone), «max» the loudest of them in each
cell (the brightest), «air» the average up to 16 kHz and the loudest above it; «top» lifts or lowers what was drawn.
    vupscale.py STEMS_DIR OUTDIR PARAMS.json"""
import json
import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

LAB = Path(__file__).resolve().parent.parent.parent      # lab/builtin_steps/ruach → lab
WHICH = {"lead": ["lead_vocal", "vocals"], "voices": ["lead_vocal", "backing_vocals", "vocals"]}
NAMES = {"lead_vocal": "Lead Vocal", "backing_vocals": "Backing Vocals", "vocals": "Vocals"}


def top_db(x, sr, lo=12000.0, hi=20000.0):
    """The level of the band the separators dull, against the whole: dB."""
    m = x.mean(1) if x.ndim > 1 else x
    n = min(len(m), sr * 60)
    s = np.abs(np.fft.rfft(m[:n] * np.hanning(n))) ** 2
    f = np.fft.rfftfreq(n, 1 / sr)
    band, whole = s[(f >= lo) & (f < min(hi, sr / 2))].sum(), s.sum()
    return 10 * math.log10(max(band, 1e-20) / max(whole, 1e-20))


CUT = {"subtle": 12000.0, "normal": 8000.0, "high": 6000.0}
TOPS = {"0": 0.0, "+2": 2.0, "-2": -2.0, "-4": -4.0}


def join(orig, new, sr, cut):
    """The original below the cut, the new above it: upscale_job.py's raised-cosine crossover an octave-sixth wide."""
    n = min(len(orig), len(new))
    F = np.fft.rfftfreq(n, 1 / sr)
    lo, hi = cut / 2 ** (1 / 6), cut * 2 ** (1 / 6)
    g = np.clip((np.log2(np.maximum(F, 1)) - math.log2(lo)) / (math.log2(hi) - math.log2(lo)), 0, 1)
    g = (0.5 - 0.5 * np.cos(math.pi * g))[:, None]
    return np.fft.irfft(np.fft.rfft(orig[:n], axis=0) * (1 - g) + np.fft.rfft(new[:n], axis=0) * g, n, axis=0)


def blend(orig, drawn, sr, cut, how, lift_db):
    """Above the cut, the drawn ones bundled per STFT cell (2048, hop 1024, as UVR's ensembler): avg the complex mean, max the
    loudest, air the mean up to 16 kHz and the loudest above it; the band then lifted or lowered by lift_db; below, the original."""
    from scipy.signal import istft, stft
    n = min([len(orig)] + [len(d) for d in drawn])
    out = []
    for c in range(orig.shape[1]):
        f, _, X = stft(orig[:n, c], sr, nperseg=2048, noverlap=1024)
        S = np.array([stft(d[:n, c], sr, nperseg=2048, noverlap=1024)[2] for d in drawn])
        mean = S.mean(0)
        loud = np.take_along_axis(S, np.argmax(np.abs(S), 0)[None], 0)[0]
        E = mean if how == "avg" else loud if how == "max" else np.where((f >= 16000)[:, None], loud, mean)
        E = E * 10 ** (lift_db / 20)
        Z = np.where((f >= cut)[:, None], E, X)
        out.append(istft(Z, sr, nperseg=2048, noverlap=1024)[1][:n])
    return np.stack(out, 1)


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    mode = p.get("mode") if p.get("mode") in ("subtle", "normal", "high") else "subtle"
    how = p.get("blend") if p.get("blend") in ("avg", "max", "air") else "universr"   # HERESY 1583: UniverSR alone, as before, unless asked
    lift_db = TOPS.get(str(p.get("top", "0")), 0.0)   # not top_db: that one measures
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    files = {f["name"]: f for f in man.get("files", []) if (sdir / f["file"]).is_file()}
    names = [n for n in WHICH.get(p.get("which"), WHICH["voices"]) if n in files]
    if "lead_vocal" in names and "vocals" in names:          # the eight's parts, not their sum
        names.remove("vocals")
    if not names:
        raise SystemExit("this set has no voice stem: split the take into stems with the voices apart")
    given = p.get("_versions") or {}
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    set_rel = rel.relative_to(take).as_posix()
    env = dict(os.environ)
    env.setdefault("HF_HOME", str(LAB.parent / "hf_cache"))
    out, said, measure = [], [], {}
    for n in names:
        src = given.get(n) or str(sdir / files[n]["file"])
        x, sr = sf.read(src, dtype="float64", always_2d=True)
        with tempfile.TemporaryDirectory(dir=outdir) as tmp:
            r = subprocess.run([sys.executable, str(LAB / "upscale_job.py"), src, tmp, mode, "1000", "keep"], env=env,
                               capture_output=True, text=True, timeout=7200)
            if r.returncode != 0:
                raise SystemExit(f"{n}: the upscale failed: " + (r.stderr.strip().splitlines() or ["no output"])[-1][-300:])
            made = json.loads(r.stdout.strip().splitlines()[-1])["files"][0]
            y, ysr = sf.read(str(Path(tmp) / made["file"]), dtype="float64", always_2d=True)
            if how != "universr":                            # HERESY 1583: the other two, joined below the cut, then the bundle
                b = subprocess.run([sys.executable, str(LAB / "upbundle_job.py"), src, tmp], env=env, capture_output=True, text=True, timeout=7200)
                if b.returncode != 0:
                    raise SystemExit(f"{n}: the bundle failed: " + (b.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                x48 = x if sr == ysr else resample_poly(x, int(ysr) // math.gcd(int(sr), int(ysr)), int(sr) // math.gcd(int(sr), int(ysr)), axis=0)
                if x48.shape[1] != y.shape[1]:
                    x48 = np.repeat(x48[:, :1], y.shape[1], 1) if x48.shape[1] == 1 else x48[:, : y.shape[1]]
                cut = CUT[mode]
                drawn = [y] + [join(x48, sf.read(str(Path(tmp) / f), dtype="float64", always_2d=True)[0][:, : y.shape[1]], ysr, cut)
                               for f in ("apollo.flac", "flashsr.flac")]
                y = blend(x48, drawn, ysr, cut, how, lift_db)
                pk = float(np.max(np.abs(y)))
                if pk > 0.999:
                    y *= 0.999 / pk
        if ysr != sr:                                        # back at the set's rate: the DAW mixes one rate
            g = math.gcd(int(sr), int(ysr))
            y = resample_poly(y, int(sr) // g, int(ysr) // g, axis=0)
        y = np.pad(y, ((0, max(0, len(x) - len(y))), (0, 0)))[: len(x)]
        if y.shape[1] != x.shape[1]:
            y = np.repeat(y[:, :1], x.shape[1], 1) if y.shape[1] == 1 else y[:, : x.shape[1]]
        sf.write(str(outdir / f"{n}.flac"), y.astype(np.float32), sr, subtype="PCM_24")
        before, after = top_db(x, sr), top_db(y, sr)
        measure[n] = {"top_before_db": round(before, 1), "top_after_db": round(after, 1), "peak_scaled": made.get("peak", 0) > 0.999}
        said.append(f"{NAMES.get(n, n)} {after - before:+.1f} dB at 12–20 kHz")
        out.append({"name": f"{NAMES.get(n, n)} (top redrawn" + ("" if how == "universr" else ", " + how) + ")", "file": f"{n}.flac", "seconds": round(len(x) / sr, 2),
                    "source": f"{set_rel}/{files[n]['file']}"})
    word = {"universr": "UniverSR", "avg": "the bundle, averaged", "max": "the bundle, the loudest", "air": "the bundle, air"}[how]
    print(json.dumps({"files": out, "measure": {"mode": mode, "blend": how, "top_db": lift_db, "stems": measure},
                      "summary": "the voices' top drawn anew (" + word + (f", top {lift_db:+g} dB" if lift_db and how != "universr" else "") + "): " + ", ".join(said),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
