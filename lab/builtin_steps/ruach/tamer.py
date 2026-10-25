"""HERESY 1748 · Voice tamer (Shaumarov's soothe2 and SpecCraft, read 22.10.2026 for the Refiner, taken as a hint and not a law; Viktor: «максимально
вычистить волчью квинту из вокала, минимально потерять в инструментале»; «ссс не нужно укорачивать»). On the voice stems only: where the voice's
spectral envelope bulges over its own course at that moment (a resonance, a harsh overtone ringing over its neighbours), the bulge is lowered by
part of its excess, a few dB at most, eased in and out over time. By default only what rises over the voice's own colour is lowered: each
frequency's usual bulge (a singer's formant is the voice's presence, not a fault) is taken off first, so the wolf goes and the timbre stays;
«every bulge» lowers the colour too. What does not stand out is not touched: the overtones keep their order, the breath stays, and a ringing «с»
or «ц» is softened a little where it rings, never cut short. One gain for both channels: the voice stays where it stands. The rest of the mix is
not touched at all, and nothing under 2.5 kHz by default: the vowels' formants live there, and flattened they blur the words (measured on Krik:
from 1.2 kHz it took 2–3 dB out of 1–3 kHz). Back: each voice stem tamed, a version of its stem for the DAW and the chain's next steps.
    tamer.py STEMS_DIR OUTDIR PARAMS.json   (PARAMS: depth dB, threshold dB, low Hz, high Hz, colour "keep"|"all", voices "lead"|"all")"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import maximum_filter1d

N_FFT, HOP = 2048, 512                                   # 43 ms windows at 48 kHz, a quarter of them a hop


def smooth_over_freq(db, freqs, octave=1 / 3):
    """Each bin's neighbourhood mean over a band of the octave's fraction around it (log-spaced), per frame: the spectrum's own shape."""
    k = np.arange(len(freqs))
    df = freqs[1] - freqs[0]
    half = np.maximum(1, np.round(freqs * (2 ** (octave / 2) - 1) / df)).astype(int)
    lo, hi = np.clip(k - half, 0, len(k) - 1), np.clip(k + half + 1, 1, len(k))
    cs = np.concatenate([np.zeros((db.shape[0], 1), dtype=db.dtype), np.cumsum(db, axis=1)], axis=1)   # in the spectrum's own precision
    return (cs[:, hi] - cs[:, lo]) / (hi - lo)


def ease(red, attack_frames, release_frames):
    """Over time, per bin: quick to take hold, slower to let go (a one-pole each way), so the gain never flutters."""
    a, r = np.exp(-1.0 / max(attack_frames, 1e-3)), np.exp(-1.0 / max(release_frames, 1e-3))
    out = np.empty_like(red)
    prev = np.zeros(red.shape[1])
    for t in range(red.shape[0]):
        c = red[t]
        coef = np.where(c > prev, a, r)
        prev = coef * prev + (1 - coef) * c
        out[t] = prev
    return out


BLOCK = 2000                                             # frames a block: ~10 s of the stem, ~30 MB in hand whatever its length
STEP = N_FFT // HOP                                      # frames over one another at any sample


def frames(ch, start, count):
    """count Hann-windowed frames of ch (padded by half a window at each end), from frame start, as float32 rows."""
    seg = np.lib.stride_tricks.sliding_window_view(ch, N_FFT)[start * HOP:(start + count) * HOP:HOP]
    return seg.astype(np.float32) * WIN


WIN = signal.get_window("hann", N_FFT).astype(np.float32)


def tame(x, sr, depth=4.0, threshold=2.0, low=2500.0, high=12000.0, ratio=0.75, keep=True):
    """x: (n, ch). Returns the tamed voice and the reduction map (frames × bins, dB) with its frequencies. Analysis and synthesis by hand,
    a block of frames at a time (a weighted overlap-add of Hann frames): scipy's whole-song transforms wanted 7.4 GB on a four-minute stem."""
    n, chs = x.shape
    pad = np.pad(x.astype(np.float32), ((N_FFT // 2, N_FFT // 2 + HOP), (0, 0)))
    nf = (len(pad) - N_FFT) // HOP + 1
    f = np.fft.rfftfreq(N_FFT, 1 / sr)
    db = np.empty((nf, len(f)), dtype=np.float32)
    for s0 in range(0, nf, BLOCK):                      # both channels' power together: one gain for both
        c = min(BLOCK, nf - s0)
        P = np.zeros((c, len(f)), dtype=np.float32)
        for k in range(chs):
            Z = np.fft.rfft(frames(pad[:, k], s0, c), axis=1)
            P += (Z.real ** 2 + Z.imag ** 2).astype(np.float32)
        db[s0:s0 + c] = 10 * np.log10(P / chs + 1e-20)
    # a voice's spectrum is its overtones with valleys between: against a plain mean every overtone «stands out». So the shape is drawn over the
    # overtones' tops (a running maximum over 300 Hz, a high voice's spacing, then smoothed over a sixth of an octave), and a resonance is
    # where that drawn line bulges over its own wide course (an octave). Its excess goes to every bin under the bulge: the formant is lowered,
    # the overtones keep their order, none is notched alone
    df = f[1] - f[0]
    tops = smooth_over_freq(maximum_filter1d(db, size=max(3, int(round(300 / df)) | 1), axis=1, mode="nearest"), f, 1 / 6).astype(np.float32)
    bulge = (tops - smooth_over_freq(tops, f, 1.0)).astype(np.float32)
    del tops
    if keep:
        # the voice's own colour kept: a voice always bulges somewhere (a singer's formant is its presence, not a fault). Each frequency's usual
        # bulge, the median over the frames where the voice sounds, is taken off first, so what is lowered is what rises over the voice's
        # own colour at that moment: the wolf, not the timbre
        sounding = np.max(db, axis=1) >= float(np.max(db)) - 40
        if sounding.any():
            bulge -= np.maximum(np.median(bulge[sounding], axis=0), 0)[None, :]
    red = np.clip((bulge - threshold) * ratio, 0.0, depth).astype(np.float32)
    del bulge
    # only the band asked, eased in over its first half-octave and out over its last, nothing at all outside it (so «from 2.5 kHz» is so); only
    # where the voice sounds: within 45 dB of the moment's loudest bin and within 60 dB of the stem's loudest, so the floor, the air between
    # phrases and the silence are never worked
    w = np.clip(np.minimum(np.log2(np.maximum(f, 1) / low) * 2, np.log2(high / np.maximum(f, 1)) * 2), 0, 1).astype(np.float32)
    red *= w[None, :]
    red *= (db >= (np.max(db, axis=1, keepdims=True) - 45)) & (db >= float(np.max(db)) - 60)
    red = ease(red, attack_frames=sr * 0.004 / HOP, release_frames=sr * 0.06 / HOP)
    red = signal.convolve2d(red, np.ones((1, 5), dtype=np.float32) / 5, mode="same", boundary="symm").astype(np.float32)   # no single-bin notches
    y = np.zeros((len(pad), chs), dtype=np.float64)
    norm = np.zeros(len(pad), dtype=np.float64)
    for s0 in range(0, nf, BLOCK):
        c = min(BLOCK, nf - s0)
        g = 10 ** (-red[s0:s0 + c] / 20)
        # overlap-add: a hop is a quarter of the window, so the frames of one residue mod 4 lie end to end and go in as one slice each
        for r in range(STEP):
            m = len(range(r, c, STEP))
            if m:
                at = (s0 + r) * HOP
                norm[at:at + m * N_FFT] += np.tile(WIN ** 2, m)
        for k in range(chs):
            back = np.fft.irfft(np.fft.rfft(frames(pad[:, k], s0, c), axis=1) * g, n=N_FFT, axis=1) * WIN
            for r in range(STEP):
                sel = back[r::STEP]
                if len(sel):
                    at = (s0 + r) * HOP
                    y[at:at + sel.size, k] += sel.ravel()
    y = y / np.maximum(norm, 1e-9)[:, None]
    return y[N_FFT // 2:N_FFT // 2 + n], red, f, db


def regions(per_bin, f, fewest_octave=1 / 3, most=4):
    """The bulges it lowered most, one frequency each, at least a third of an octave apart."""
    picked = []
    for i in np.argsort(per_bin)[::-1]:
        if per_bin[i] <= 0.05 or len(picked) >= most:
            break
        if all(abs(np.log2(max(f[i], 1) / max(f[j], 1))) >= fewest_octave for j in picked):
            picked.append(i)
    return [int(round(f[i])) for i in picked]


def voices(files, which):
    """The voice stems to work on, as the DAW takes them: in a set of eight the lead and the backing (its «vocals», the voice whole beside them,
    is left, as the DAW leaves it); in four or six the one vocals stem."""
    parts = [n for n in ("lead_vocal", "backing_vocals") if n in files]
    names = parts or [n for n in ("vocals",) if n in files]
    return names[:1] if which == "lead" else names


def clock(s):
    return f"{int(s // 60)}:{int(s % 60):02d}"


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    depth = max(1.0, min(9.0, float(p.get("depth", 4))))
    threshold = max(1.0, min(9.0, float(p.get("threshold", 2))))
    low = max(200.0, min(6000.0, float(p.get("low", 2500))))   # the vowels' formants live under it: never flattened
    high = max(low * 2, min(20000.0, float(p.get("high", 12000))))
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    files = {f["name"]: f for f in man.get("files", [])}
    names = voices(files, p.get("voices", "all"))
    if not names:
        raise SystemExit("this set has no voice stem: split the take into stems first")
    given = p.get("_versions") or {}                    # the stems as the chain left them (the lab's word), else as split
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    set_rel = rel.relative_to(take).as_posix()
    out, measure, said = [], {}, []
    for n in names:
        x, sr = sf.read(given.get(n) or str(sdir / files[n]["file"]), dtype="float64", always_2d=True)
        y, red, f, db = tame(x, sr, depth, threshold, low, high, keep=p.get("colour", "keep") != "all")
        pk = float(np.max(np.abs(y))) if len(y) else 0.0
        if pk > 0.999:
            y *= 0.999 / pk
        sf.write(str(Path(outdir) / f"{n}.flac"), y.astype(np.float32), sr, subtype="PCM_24")
        active = red.max(axis=1) > 0.5                      # frames where it took hold by more than half a dB
        per_bin = red.mean(axis=0)
        top = regions(per_bin, f)
        e_in, e_out = float(np.sum(x * x)), float(np.sum(y * y))
        measure[n] = {"held_share_pct": round(100 * float(active.mean()), 1), "mean_db": round(float(red[active].max(axis=1).mean()) if active.any() else 0.0, 2),
                      "deepest_db": round(float(red.max()), 2), "where_hz": top, "level_change_db": round(10 * np.log10((e_out + 1e-12) / (e_in + 1e-12)), 2)}
        title = files[n].get("title") or n
        out.append({"name": f"{title} (tamed)", "file": f"{n}.flac", "seconds": round(len(y) / sr, 2), "source": f"{set_rel}/{files[n]['file']}"})
        said.append(f"{title}: held {measure[n]['held_share_pct']} % of the time, {measure[n]['mean_db']} dB there, most at "
                    + (", ".join(f"{h / 1000:.1f} kHz" if h >= 1000 else f"{h} Hz" for h in top[:3]) or "nowhere"))
    print(json.dumps({"files": out, "measure": dict(measure, depth_db=depth, threshold_db=threshold, low_hz=low, high_hz=high, colour=p.get("colour", "keep")),
                      "summary": "; ".join(said), "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
