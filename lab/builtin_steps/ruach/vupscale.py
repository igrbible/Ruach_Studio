"""HERESY 1555 · Voice upscale (the Refiner's open order of 15.10.2026, «Vocal upscale per stem»): the separators work at 44.1 kHz and
dull a voice's top (its air, its breath, the edge of its consonants); UniverSR draws it anew stem by stem, the voices only, each at
the mode asked, the original kept below the cutoff sample for sample (the studio's own upscale_job.py, one variant), then back at the
set's own rate and length so the DAW takes it as a version of its stem. The rest of the set is left as it is.
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


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    mode = p.get("mode") if p.get("mode") in ("subtle", "normal", "high") else "subtle"
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
        out.append({"name": f"{NAMES.get(n, n)} (top redrawn)", "file": f"{n}.flac", "seconds": round(len(x) / sr, 2),
                    "source": f"{set_rel}/{files[n]['file']}"})
    print(json.dumps({"files": out, "measure": {"mode": mode, "stems": measure},
                      "summary": "the voices' top drawn anew: " + ", ".join(said), "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
