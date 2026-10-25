"""HERESY 1751 · Voice attack and body (Shaumarov's two transient compressors on the voice, Richter twice, read 22.10.2026 for the Refiner, a hint
and not a law: «a little of each», the voice brought «in the face»). On the voice stems: two envelopes of the voice, a quick one (1 ms up, 20 ms
down) and a slow one (25 ms up, 250 ms down); where the quick one stands over the slow one a word begins, and that moment is raised by up to the
dB asked for the attack; where it falls under it a sound is dying away, and that is raised by up to the dB asked for the body. Nothing else
moves: a held vowel, its level steady, is left as it is. One gain for both channels. Back: each voice stem shaped, a version for the DAW and the
chain's next steps.
    shape.py STEMS_DIR OUTDIR PARAMS.json   (PARAMS: attack dB, body dB, voices "lead"|"all")"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 4000                                              # the envelopes at 4 kHz: a quarter-millisecond, fine for a consonant


def follow(env, attack_ms, release_ms):
    a, r = np.exp(-1.0 / (RATE * attack_ms / 1000)), np.exp(-1.0 / (RATE * release_ms / 1000))
    out = np.empty_like(env)
    prev = float(env[0]) if len(env) else 0.0
    for i, v in enumerate(env):
        c = a if v > prev else r
        prev = c * prev + (1 - c) * v
        out[i] = prev
    return out


def shape(x, sr, attack_db=2.0, body_db=1.5):
    hop = max(1, sr // RATE)
    m = np.abs(x).max(axis=1)
    k = len(m) // hop
    env = m[: k * hop].reshape(k, hop).max(axis=1) if k else np.zeros(1)
    fast = 20 * np.log10(follow(env, 1.0, 20.0) + 1e-9)
    slow = 20 * np.log10(follow(env, 25.0, 250.0) + 1e-9)
    d = fast - slow
    floor = float(np.percentile(fast, 95)) - 50           # not in the silence between phrases
    live = fast > floor
    g_db = np.where(d > 0, attack_db * np.clip(d / 6, 0, 1), body_db * np.clip(-d / 6, 0, 1)) * live
    # eased over 2 ms so no step is heard
    w = max(1, int(RATE * 0.002))
    g_db = np.convolve(g_db, np.ones(w) / w, mode="same")
    g = np.repeat(10 ** (g_db / 20), hop)
    g = np.pad(g, (0, max(0, len(x) - len(g))), mode="edge")[: len(x)]
    # a lift never takes a sample over full scale: where it would, it lifts only as far as there is room (never under the voice as it was), so
    # the stem is not turned down whole to fit a few raised peaks
    room = 0.999 / np.maximum(np.abs(x).max(axis=1), 1e-9)
    g = np.where(g > 1, np.maximum(1.0, np.minimum(g, room)), g)
    return x * g[:, None], g_db, d, live


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    attack = max(0.0, min(6.0, float(p.get("attack", 2))))
    body = max(0.0, min(6.0, float(p.get("body", 1.5))))
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    files = {f["name"]: f for f in man.get("files", [])}
    parts = [n for n in ("lead_vocal", "backing_vocals") if n in files]   # as the DAW takes them: a set of eight's «vocals» (the voice whole) left
    names = parts or [n for n in ("vocals",) if n in files]
    if p.get("voices", "all") == "lead":
        names = names[:1]
    if not names:
        raise SystemExit("this set has no voice stem: split the take into stems first")
    given = p.get("_versions") or {}
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    set_rel = rel.relative_to(take).as_posix()
    out, measure, said = [], {}, []
    for n in names:
        x, sr = sf.read(given.get(n) or str(sdir / files[n]["file"]), dtype="float64", always_2d=True)
        y, g_db, d, live = shape(x, sr, attack, body)
        pk = float(np.max(np.abs(y))) if len(y) else 0.0
        if pk > 0.999:
            y *= 0.999 / pk
        sf.write(str(Path(outdir) / f"{n}.flac"), y.astype(np.float32), sr, subtype="PCM_24")
        on = (d > 1) & live
        starts = int(np.sum(on[1:] & ~on[:-1]))
        measure[n] = {"word_starts": starts, "attack_mean_db": round(float(g_db[(d > 0) & live].mean()) if ((d > 0) & live).any() else 0.0, 2),
                      "body_mean_db": round(float(g_db[(d < 0) & live].mean()) if ((d < 0) & live).any() else 0.0, 2)}
        title = files[n].get("title") or n
        out.append({"name": f"{title} (attack and body)", "file": f"{n}.flac", "seconds": round(len(y) / sr, 2), "source": f"{set_rel}/{files[n]['file']}"})
        said.append(f"{title}: {starts} beginnings lifted by {measure[n]['attack_mean_db']} dB on average, the dying away by {measure[n]['body_mean_db']} dB")
    print(json.dumps({"files": out, "measure": dict(measure, attack_db=attack, body_db=body), "summary": "; ".join(said), "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
