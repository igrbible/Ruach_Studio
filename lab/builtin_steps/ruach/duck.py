"""HERESY 1749 · Bass under the kick (Shaumarov's soothe2 keyed from the kick on the bass, read 22.10.2026 for the Refiner, a hint and not a law):
the kick and the bass fight for the same low octave; here the bass makes room only while the kick sounds, and only in that octave. The kick is
found on the drum stem (its own low band, a quick envelope: it takes hold in a millisecond and lets go over 80 ms); the bass stem is split at the
frequency asked, zero-phase and complementary (low + high is the bass, sample for sample), and its low part lowered by up to the dB asked, as
far as the kick is loud. Between kicks, and above the split always, the bass is what it was. Back: the bass stem, a version for the DAW and the
chain's next steps.
    duck.py STEMS_DIR OUTDIR PARAMS.json   (PARAMS: depth dB, freq Hz, release ms)"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal


def follow(env, sr, attack_ms, release_ms):
    """A peak follower: one pole each way, quick up and slow down."""
    a, r = np.exp(-1.0 / (sr * attack_ms / 1000)), np.exp(-1.0 / (sr * release_ms / 1000))
    zi = np.empty_like(env)
    prev = 0.0
    for i, v in enumerate(env):                          # a plain loop, made fast below with a coarser hop
        c = a if v > prev else r
        prev = c * prev + (1 - c) * v
        zi[i] = prev
    return zi


def kick_key(drums, sr, release_ms=80.0):
    """0…1 over time: how loud the kick is now, against the kick's own loud level (its 99th percentile)."""
    band = signal.butter(2, [35, 120], btype="bandpass", fs=sr, output="sos")
    low = signal.sosfiltfilt(band, drums.mean(axis=1))    # zero phase (the file is all here): the key lands with the kick, not a filter's delay after
    hop = max(1, sr // 2000)                             # half a millisecond: fine enough for a kick, 24x lighter than per sample
    env = np.abs(low)[: len(low) // hop * hop].reshape(-1, hop).max(axis=1)
    env = follow(env, 2000, 1.0, release_ms)
    ref = float(np.percentile(env, 99)) or 1.0
    key = np.clip(env / ref, 0.0, 1.0)
    key = np.repeat(key, hop)
    return np.pad(key, (0, max(0, len(drums) - len(key))), mode="edge")[: len(drums)]


def duck(bass, drums, sr, depth=3.0, freq=120.0, release_ms=80.0):
    n = min(len(bass), len(drums))
    bass, drums = bass[:n], drums[:n]
    lp = signal.butter(2, freq, btype="lowpass", fs=sr, output="sos")
    low = signal.sosfiltfilt(lp, bass, axis=0)            # zero phase; the high part is the rest, so the two sum back to the bass exactly
    high = bass - low
    key = kick_key(drums, sr, release_ms)
    gain = 10 ** (-depth * key / 20)
    return low * gain[:, None] + high, key, low


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    depth = max(0.5, min(9.0, float(p.get("depth", 3))))
    freq = max(60.0, min(250.0, float(p.get("freq", 120))))
    release = max(30.0, min(300.0, float(p.get("release", 80))))
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    files = {f["name"]: f for f in man.get("files", [])}
    if "bass" not in files or "drums" not in files:
        raise SystemExit("this set has no bass and drums apart: split the take into four stems or more")
    given = p.get("_versions") or {}
    bass, sr = sf.read(given.get("bass") or str(sdir / files["bass"]["file"]), dtype="float64", always_2d=True)
    drums, sr2 = sf.read(given.get("drums") or str(sdir / files["drums"]["file"]), dtype="float64", always_2d=True)
    if sr != sr2:
        raise SystemExit("the bass and the drums are at different rates")
    y, key, low = duck(bass, drums, sr, depth, freq, release)
    pk = float(np.max(np.abs(y))) if len(y) else 0.0
    if pk > 0.999:
        y *= 0.999 / pk
    sf.write(str(Path(outdir) / "bass.flac"), y.astype(np.float32), sr, subtype="PCM_24")
    # the kicks found (the key's rises over a half), and how much the bass's low lost while they sounded
    on = key > 0.5
    kicks = int(np.sum(on[1:] & ~on[:-1]))
    during = float(np.mean(key[on])) * depth if on.any() else 0.0
    e_in, e_out = float(np.sum(low * low)), float(np.sum((y - (bass[: len(y)] - low)) ** 2))
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    set_rel = rel.relative_to(take).as_posix()
    print(json.dumps({"files": [{"name": "Bass (under the kick)", "file": "bass.flac", "seconds": round(len(y) / sr, 2), "source": f"{set_rel}/{files['bass']['file']}"}],
                      "measure": {"kicks": kicks, "depth_db": depth, "freq_hz": freq, "release_ms": release, "mean_while_kick_db": round(during, 2),
                                  "low_band_change_db": round(10 * np.log10((e_out + 1e-12) / (e_in + 1e-12)), 2)},
                      "summary": f"{kicks} kicks found; the bass under {freq:g} Hz lowered by {during:.1f} dB on average while they sound, as it was between them",
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
