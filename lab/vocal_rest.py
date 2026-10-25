"""HERESY 1717 (lab/vocal_rest.py): where the voice sings in a stretch of a take, for the cuts of «Sing it once more» and «Insert an interlude»
(section.py), on the processor (the cards may all be a training's): the stretch's vocal stem by the vocal model alone of htdemucs_ft
(separation/demucs, the stems' own weights, nothing downloaded; one model of its four, a quarter of the time: ~0.9 s a second of sound), its
loudness in 40 ms frames smoothed over 0.12 s; the voice is over max(−45 dB, its peak − 30 dB); a gap under 0.2 s does not part it, a sound
under 0.15 s is not it. Run in a process of its own, so torch never sits in the lab's.
Prints one line of JSON {"from": A, "to": B, "voice": [[start, end], …]} (seconds in the take), or {"error": words}.
    python3 vocal_rest.py WAV A B"""
import json, os, sys
from math import gcd
from pathlib import Path
os.environ["CUDA_VISIBLE_DEVICES"] = ""
for _k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ.setdefault(_k, "6")                 # a share of the processor, not all of it: a training may be feeding its cards
try:
    os.nice(10)                                    # and behind it: a wave's data loading goes first
except OSError:
    pass
import numpy as np
import soundfile as sf

KIT = Path(__file__).resolve().parent.parent
DEMUCS_DIR = os.environ.get("LAB_DEMUCS_DIR", str(KIT / "separation/demucs"))   # as stems_job.py's


def vocals(wav, a, b):
    import torch
    from scipy.signal import resample_poly
    import audio_separator.separator as sep
    sys.path.insert(0, os.path.join(os.path.dirname(sep.__file__), "uvr_lib_v5"))   # as its Demucs separator: the weights name «demucs» modules
    from audio_separator.separator.uvr_lib_v5.demucs.pretrained import get_model
    from audio_separator.separator.uvr_lib_v5.demucs.apply import apply_model
    torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "6")))
    bag = get_model(name="htdemucs_ft", repo=Path(DEMUCS_DIR))
    vi = bag.sources.index("vocals")
    one = bag.models[[i for i, w in enumerate(bag.weights) if w[vi] > 0][0]]   # the one of the four that answers for the voice
    one.eval()
    x, sr = sf.read(wav, always_2d=True)
    i, j = max(0, int(a * sr)), min(len(x), int(b * sr))
    g = gcd(sr, one.samplerate)
    y = resample_poly(x[i:j].T, one.samplerate // g, sr // g, axis=1)
    ref = y.mean(0)
    mu, sd = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(one, torch.tensor((y - mu) / sd, dtype=torch.float32)[None], shifts=0, split=True, overlap=0.25, progress=False)
    return (out[0, vi].numpy() * sd + mu).mean(0), one.samplerate, i / sr


def main():
    wav, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    try:
        m, sr, t0 = vocals(wav, max(0.0, a), b)
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"[:300]})); return
    hop = max(1, int(sr * 0.04))
    n = (len(m) // hop) * hop
    if n < hop * 10:
        print(json.dumps({"error": "too short a stretch"})); return
    db = 20 * np.log10(np.sqrt((m[:n].reshape(-1, hop) ** 2).mean(axis=1) + 1e-12))
    db = np.convolve(db, np.ones(3) / 3, mode="same")
    on = db >= max(-45.0, float(db.max()) - 30.0)
    t = lambda k: round(t0 + k * hop / sr, 2)
    runs, k = [], 0
    while k < len(on):
        if on[k]:
            s = k
            while k < len(on) and on[k]:
                k += 1
            if runs and (s - runs[-1][1]) * hop / sr < 0.2:
                runs[-1][1] = k                    # a breath under 0.2 s does not part the voice
            else:
                runs.append([s, k])
        else:
            k += 1
    voice = [[t(s), t(e)] for s, e in runs if (e - s) * hop / sr >= 0.15]
    print(json.dumps({"from": round(t0, 2), "to": t(len(on)), "voice": voice}))


if __name__ == "__main__":
    main()
