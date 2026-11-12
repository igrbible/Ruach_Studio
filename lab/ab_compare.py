"""HERESY 1991 · Before and after, from any two sounds (Viktor 01.11.2026: «заказываю тебе ноду анализатора ДО и ПОСЛЕ, именно то, что я заказал
тебе, со спектрограммами, разницами в сравнительном наложении спектрограмм, замеры до и после, разница. Вердикт, что и как, и куда пошло. Эта нода
может функционировать как публичная, потому что ей должно быть похер, откуда брать источники. Два аудио входа на ней»). What 1557's step measured
against the file a branch was made from, now between any two recordings of one music: a take and its print through a lamp, a mix and its master, a
file of the tree and an import.

  read      any file soundfile or ffmpeg reads, two channels at 48 kHz.
  align     where the after's music sits against the before's (a print through a loop comes back late): the decimated mids cross-correlated
            within ±30 s, then sample-exact at the full rate; the polarity from the peak's sign; how alike they are, 0–1. Only the stretch both
            hold is compared.
  level     the after turned to the before's loudness (BS.1770), so what is left is a change of shape, not of level; the level is said apart.
  measures  each side: integrated loudness, true and sample peak, loudness range, crest, width, correlation, the balance of left and right,
            clipped runs (3+ samples at full scale), the quietest moments.
  tone      the average spectra (Welch) in sixth-octave bands at equal loudness and their difference.
  dynamics  the music's own 50 ms levels, before against after: how much the loud moments lost against the quiet ones (a compressor's
            glue), and the sharpest 10 ms peaks (a limiter's or a tube's shave).
  linear    the share of the after a filter cannot make from the before (coherence, per band): distortion, noise and the pumping of a
            compressor; an EQ, a delay or a phase turn leave it near nothing.
  pictures  the spectrograms of both at equal loudness and their difference (red: the after louder there, blue: quieter), in log frequency;
            the spectra, the difference, the dynamics and the short-term loudness.
  verdict   what changed, how, and where it went, in sentences with their numbers.

    ab_compare.py BEFORE AFTER OUTDIR [--names before,after]   → OUTDIR/compare.json, compare.md, spectrograms.jpg, measures.png (200 dpi)"""
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from plenio_core.audio import loudness as ld  # noqa: E402

SR = 48000
MOST_LAG = 30.0
BANDS = (("lows", 20, 200), ("mids", 200, 2000), ("presence", 2000, 6000), ("air", 8000, 16000))
ZONES = (("sub", 20, 80), ("low", 80, 300), ("mid", 300, 2000), ("hi-mid", 2000, 6000), ("high", 6000, 12000), ("air", 12000, 20000))


def read(path, sr=SR, seconds=None):
    """Two channels at sr, float64; a file of one channel heard on both; its first `seconds` alone when given (HERESY 2011, P3)."""
    p = str(path)
    try:
        frames = -1 if seconds is None else int(seconds * sf.info(p).samplerate)
        x, r = sf.read(p, frames=frames, dtype="float64", always_2d=True)
    except (RuntimeError, sf.LibsndfileError):
        cut = [] if seconds is None else ["-t", str(seconds)]
        try:                                          # HERESY 2011 (C12): a disk that stops answering held the request's thread for good
            raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p] + cut + ["-f", "f32le", "-ac", "2", "-ar", str(sr), "-"], capture_output=True,
                                 check=True, timeout=600).stdout
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"ffmpeg did not finish reading {Path(p).name} in 600 s")
        x, r = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64), sr
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    x = x[:, :2]
    if r != sr:
        from scipy.signal import resample_poly
        g = math.gcd(int(r), sr)
        x = resample_poly(x, sr // g, int(r) // g, axis=0)
    return np.ascontiguousarray(x)


def align(a, b, sr=SR, most=MOST_LAG):
    """(lag, polarity, likeness): b[n + lag] answers a[n]."""
    from scipy.signal import correlate, resample_poly
    D = 8
    am, bm = resample_poly(a.mean(1), 1, D), resample_poly(b.mean(1), 1, D)
    c = correlate(bm, am, mode="full", method="fft")
    lags = np.arange(-len(am) + 1, len(bm))
    keep = np.abs(lags) <= most * sr / D
    c, lags = c[keep], lags[keep]
    i = int(np.argmax(np.abs(c)))
    coarse, sign = int(lags[i]) * D, 1 if c[i] >= 0 else -1
    # sample-exact: a loud stretch of the before against the after around the coarse lag
    am1 = a.mean(1)
    w = min(len(am1), 20 * sr)
    cs = np.concatenate(([0.0], np.cumsum(am1 ** 2)))          # a second's energy, every tenth of a second (a running sum, not a convolution)
    e = (cs[sr:] - cs[:-sr])[::sr // 10] if len(am1) > 2 * sr else np.array([0.0])
    s0 = int(np.argmax(e)) * (sr // 10)
    s0 = max(0, min(s0 - w // 2, len(am1) - w))
    seg = am1[s0:s0 + w]
    span = 4 * D
    best, at = -1.0, coarse
    bm1 = b.mean(1)
    for k in range(coarse - span, coarse + span + 1):
        lo = s0 + k
        if lo < 0 or lo + w > len(bm1):
            continue
        v = float(np.dot(seg, bm1[lo:lo + w])) * sign
        if v > best:
            best, at = v, k
    sa, sb = overlap(a, b, at)
    ma, mb = sa.mean(1), sb.mean(1) * sign
    like = float(np.dot(ma, mb) / max(math.sqrt(float(np.dot(ma, ma) * np.dot(mb, mb))), 1e-12))
    return at, sign, round(like, 4)


def overlap(a, b, lag):
    s_a = max(0, -lag)
    s_b = s_a + lag
    n = min(len(a) - s_a, len(b) - s_b)
    return a[s_a:s_a + n], b[s_b:s_b + n]


def runs(x, level=0.9995, least=3):
    """Clipped runs: least or more samples in a row at full scale, in any channel."""
    n = 0
    for ch in range(x.shape[1]):
        hit = np.abs(x[:, ch]) >= level
        if not hit.any():
            continue
        d = np.diff(np.concatenate(([0], hit.astype(np.int8), [0])))
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        n += int(np.sum(ends - starts >= least))
    return n


def levels(x, sr=SR, win=0.05):
    """The mid's RMS every win seconds, dBFS."""
    m = x.mean(1)
    k = int(win * sr)
    n = len(m) // k
    r = np.sqrt(np.mean(m[:n * k].reshape(n, k) ** 2, axis=1))
    return 20 * np.log10(np.maximum(r, 1e-12))


def peaks(x, sr=SR, win=0.01):
    """The highest sample of either channel every win seconds, dBFS."""
    k = int(win * sr)
    n = len(x) // k
    p = np.abs(x[:n * k]).reshape(n, k, x.shape[1]).max(axis=(1, 2))
    return 20 * np.log10(np.maximum(p, 1e-12))


def measures(x, sr=SR):
    m = ld.measure(x.T, sr, with_true_peak=True)
    mono = x.mean(1)
    rms = float(np.sqrt((mono ** 2).mean())) or 1e-12
    pk = float(np.abs(x).max())
    out = {"lufs": m.integrated_lufs, "true_peak_dbtp": m.true_peak_dbtp, "peak_dbfs": 20 * math.log10(max(pk, 1e-12)), "lra_lu": m.loudness_range_lu,
           "crest_db": 20 * math.log10(max(pk, 1e-12) / rms)}
    if m.integrated_lufs is not None and m.true_peak_dbtp is not None:
        out["plr_db"] = m.true_peak_dbtp - m.integrated_lufs
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    out["width_db"] = 20 * math.log10(max(float(np.sqrt((side ** 2).mean())), 1e-12) / max(float(np.sqrt((mid ** 2).mean())), 1e-12))
    a, b = x[:, 0] - x[:, 0].mean(), x[:, 1] - x[:, 1].mean()
    out["correlation"] = float((a * b).sum() / max(math.sqrt(float((a * a).sum() * (b * b).sum())), 1e-12))
    out["balance_db"] = 20 * math.log10(max(float(np.sqrt((x[:, 0] ** 2).mean())), 1e-12) / max(float(np.sqrt((x[:, 1] ** 2).mean())), 1e-12))
    lv = levels(x, sr)
    act = lv[lv > -70]
    out["quiet_dbfs"] = float(np.percentile(act, 3)) if len(act) else None
    r = {k: (None if v is None else round(float(v), 2)) for k, v in out.items()}
    r["clipped_runs"] = runs(x)
    return r


def welch(x, sr=SR, n=1 << 15):
    mono = x.mean(1)
    if len(mono) < n:
        mono = np.pad(mono, (0, n - len(mono)))
    w = np.hanning(n)
    acc, k = np.zeros(n // 2 + 1), 0
    for i in range(0, len(mono) - n + 1, n // 2):
        acc += np.abs(np.fft.rfft(mono[i:i + n] * w)) ** 2
        k += 1
    return np.fft.rfftfreq(n, 1 / sr), acc / max(k, 1)


def sixth(f, p):
    c = 25 * 2 ** (np.arange(0, 60) / 6)
    c = c[c <= min(20000, f[-1] / 1.06)]
    out = []
    for fc in c:
        sel = (f >= fc / 2 ** (1 / 12)) & (f < fc * 2 ** (1 / 12))
        out.append(10 * math.log10(max(float(p[sel].mean()) if sel.any() else 1e-30, 1e-30)))
    return c, np.array(out)


def zone_db(f, p, lo, hi):
    return 10 * math.log10(max(float(p[(f >= lo) & (f < hi)].sum()), 1e-30))


def short_term(x, sr=SR):
    power = ld._weighted_power(np.ascontiguousarray(x.T), sr, ld.no_cancel)
    blocks = ld._block_powers(power, sr, 3.0, 1.0)
    return np.asarray(ld._lufs(blocks), dtype=float) if len(blocks) else np.array([-70.0])


def logspec(x, sr=SR, rows=240, frames=1600, lo=25.0, hi=20000.0):
    """The mid's spectrogram in log-spaced rows (power averaged into each, the nearest bin where a row is narrower than a bin): dB, the times."""
    from scipy.signal import stft
    m = x.mean(1)
    hop = max(512, len(m) // frames)
    f, t, Z = stft(m, sr, window="hann", nperseg=4096, noverlap=max(0, 4096 - hop), boundary=None, padded=False)
    P = np.abs(Z) ** 2
    edges = lo * (hi / lo) ** (np.arange(rows + 1) / rows)
    out = np.empty((rows, P.shape[1]))
    for i in range(rows):
        sel = (f >= edges[i]) & (f < edges[i + 1])
        out[i] = P[sel].mean(axis=0) if sel.any() else P[int(np.argmin(np.abs(f - math.sqrt(edges[i] * edges[i + 1]))))]
    return 10 * np.log10(np.maximum(out, 1e-20)), t, np.sqrt(edges[:-1] * edges[1:])


def coherence_bands(a, b, sr=SR):
    """Per sixth-octave band: how much of the after no filter makes from the before, dB under the after (10·log10(1 − coherence))."""
    from scipy.signal import coherence
    f, c = coherence(a.mean(1), b.mean(1), fs=sr, nperseg=8192)
    cen = 25 * 2 ** (np.arange(0, 60) / 6)
    cen = cen[cen <= 20000]
    out = []
    for fc in cen:
        sel = (f >= fc / 2 ** (1 / 12)) & (f < fc * 2 ** (1 / 12))
        v = float(np.mean(c[sel])) if sel.any() else float(c[int(np.argmin(np.abs(f - fc)))])
        out.append(10 * math.log10(max(1 - min(v, 0.999999), 1e-6)))
    fa, pa = welch(b, sr, 8192)
    # the whole: the incoherent power over the after's power
    cc = np.interp(fa, f, c)
    whole = 10 * math.log10(max(float(np.sum(pa * (1 - np.minimum(cc, 0.999999)))) / max(float(np.sum(pa)), 1e-30), 1e-9))
    return cen, np.array(out), whole


def dynamics(a, b, sr=SR):
    """The music's own levels before against after (equal loudness): the change by the before's level, the glue, the peaks' shave."""
    la, lb = levels(a, sr), levels(b, sr)
    n = min(len(la), len(lb))
    la, lb = la[:n], lb[:n]
    act = la > max(-60.0, float(np.max(la)) - 50)
    la, lb = la[act], lb[act]
    d = lb - la
    edges = np.arange(math.floor(la.min()), math.ceil(la.max()) + 2, 2.0)
    curve = []
    for i in range(len(edges) - 1):
        sel = (la >= edges[i]) & (la < edges[i + 1])
        if sel.sum() >= 20:
            curve.append([round(float(edges[i] + 1), 1), round(float(np.median(d[sel])), 2), int(sel.sum())])
    loud, mid = la >= np.percentile(la, 90), (la >= np.percentile(la, 30)) & (la < np.percentile(la, 60))
    glue = float(np.median(d[loud]) - np.median(d[mid])) if loud.any() and mid.any() else 0.0
    pa, pb = peaks(a, sr), peaks(b, sr)
    k = min(len(pa), len(pb))
    pa, pb = pa[:k], pb[:k]
    top = pa >= np.percentile(pa, 99)
    shave = float(np.median(pb[top] - pa[top])) if top.any() else 0.0
    return {"curve": curve, "glue_db": round(glue, 2), "peak_shave_db": round(shave, 2)}


def compare(before, after, names=("before", "after"), out=None, sr=SR, words=None, nums=None):
    """Everything above for two files; with out, the pictures and the page land there. The result as a dict.
    HERESY 2286: nums (the two sides' numbers, «1» and «3») for First and second, the compare window's and the Library's: the verdict also as
    templates the page says in its language (verdict12), the pictures in the words given (pic_words); without them the node's own, as it was."""
    t0 = time.time()
    A0, B0 = read(before, sr), read(after, sr)
    lag, sign, like = align(A0, B0, sr)
    A, B = overlap(A0, B0 * sign, lag)
    ma, mb = measures(A, sr), measures(B, sr)
    gain = (mb["lufs"] - ma["lufs"]) if ma["lufs"] is not None and mb["lufs"] is not None else 0.0
    Bm = B * 10 ** (-gain / 20)
    fa, pa = welch(A, sr)
    fb, pb = welch(Bm, sr)
    ca, da = sixth(fa, pa)
    cb, db_ = sixth(fb, pb)
    n = min(len(ca), len(cb))
    tone = db_[:n] - da[:n]
    zones = {z: round(zone_db(fb, pb, lo, hi) - zone_db(fa, pa, lo, hi), 2) for z, lo, hi in ZONES}
    dyn = dynamics(A, Bm, sr)
    cen, incoh, whole = coherence_bands(A, Bm, sr)
    sa, sb = short_term(A, sr), short_term(B, sr)
    R = {"names": list(names), "files": [str(before), str(after)], "seconds": round(len(A) / sr, 2),
         "lag_ms": round(lag / sr * 1000, 2), "lag_samples": int(lag), "polarity": "inverted" if sign < 0 else "same", "likeness": like,
         "before": ma, "after": mb, "level_db": round(gain, 2),
         "tone": {"centres": [round(float(c), 1) for c in ca[:n]], "db": [round(float(v), 2) for v in tone]}, "zones_db": zones,
         "dynamics": dyn, "nonlinear": {"centres": [round(float(c), 1) for c in cen], "db": [round(float(v), 1) for v in incoh], "whole_db": round(whole, 1)}}
    R["verdict"] = verdict(R)
    if nums:
        R["nums"] = [str(nums[0]), str(nums[1])]
        R["verdict12"] = verdict12(R, *R["nums"])
    if out:
        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        pictures(A, Bm, sr, R, ca[:n], da[:n], db_[:n], sa, sb - gain, cen, incoh, out, pic_words(words, nums))
        (out / "compare.json").write_text(json.dumps(R, ensure_ascii=False, indent=1), encoding="utf-8")
        (out / "compare.md").write_text(page(R), encoding="utf-8")
    R["took"] = round(time.time() - t0, 1)
    return R


def sg(v):
    return f"{v:+.2f}"


def nu(v):
    return f"{v:.2f}"


def verdict(R):
    """[[english sentence with {0}…, [its numbers as text]]]: what changed, how, and where it went; the page translates the sentence."""
    a, b, say = R["before"], R["after"], []
    if R["likeness"] < 0.5:
        say.append(["The two are not one music (likeness {0}): what follows compares two different sounds.", [nu(R["likeness"])]])
    if abs(R["lag_ms"]) >= 1:
        say.append(["The after comes {0} ms later than the before; compared from where they meet.", [nu(R["lag_ms"])]])
    if R["polarity"] == "inverted":
        say.append(["The after's polarity is inverted against the before.", []])
    if abs(R["level_db"]) >= 0.2:
        say.append(["{0}: the after is {1} LU against the before; everything below compares them at equal loudness.", ["Quieter" if R["level_db"] < 0 else "Louder", sg(R["level_db"])]])
    t = R["tone"]
    big = sorted(range(len(t["db"])), key=lambda i: -abs(t["db"][i]))
    if t["db"] and abs(t["db"][big[0]]) < 0.5:
        say.append(["The tone stayed: no sixth-octave band moved by half a dB.", []])
    else:
        z = R["zones_db"]
        moved = [(k, v) for k, v in sorted(z.items(), key=lambda kv: -abs(kv[1])) if abs(v) >= 0.3]
        if moved:
            say.append(["The tone: " + ", ".join("{%d} {%d} dB" % (2 * i, 2 * i + 1) for i in range(len(moved))) + ".", [x for k, v in moved for x in (k, sg(v))]])
        say.append(["The most at {0} Hz: {1} dB.", [str(round(t["centres"][big[0]])), sg(t["db"][big[0]])]])
    d = R["dynamics"]
    if d["glue_db"] <= -0.3:
        say.append(["The loud moments lost {0} dB against the middle ones: compression, a glue.", [nu(abs(d["glue_db"]))]])
    elif d["glue_db"] >= 0.3:
        say.append(["The loud moments gained {0} dB against the middle ones: the dynamics opened.", [nu(d["glue_db"])]])
    else:
        say.append(["The dynamics stayed: the loud and the middle moments moved alike.", []])
    if d["peak_shave_db"] <= -0.3:
        say.append(["The sharpest 10 ms peaks came down {0} dB at equal loudness: they are shaved.", [nu(abs(d["peak_shave_db"]))]])
    elif d["peak_shave_db"] >= 0.3:
        say.append(["The sharpest 10 ms peaks stand {0} dB higher at equal loudness: they are not shaved; a turned phase can raise them.", [nu(d["peak_shave_db"])]])
    else:
        say.append(["The sharpest peaks stayed where they were against the loudness.", []])
    if a.get("plr_db") is not None and b.get("plr_db") is not None and abs(b["plr_db"] - a["plr_db"]) >= 0.3:
        say.append(["Peak over loudness {0} → {1} dB.", [nu(a["plr_db"]), nu(b["plr_db"])]])
    if a.get("lra_lu") is not None and b.get("lra_lu") is not None and abs(b["lra_lu"] - a["lra_lu"]) >= 0.3:
        say.append(["Loudness range {0} → {1} LU.", [nu(a["lra_lu"]), nu(b["lra_lu"])]])
    if abs(b["correlation"] - a["correlation"]) >= 0.01 or abs(b["width_db"] - a["width_db"]) >= 0.3:
        say.append(["The stereo: correlation {0} → {1}, width {2} → {3} dB.", [f"{a['correlation']:.3f}", f"{b['correlation']:.3f}", nu(a["width_db"]), nu(b["width_db"])]])
    if abs(b["balance_db"] - a["balance_db"]) >= 0.3:
        say.append(["Left against right {0} → {1} dB: one side lost or gained.", [sg(a["balance_db"]), sg(b["balance_db"])]])
    if b["clipped_runs"] > a["clipped_runs"]:
        say.append(["{0} clipped runs in the after (the before had {1}).", [str(b["clipped_runs"]), str(a["clipped_runs"])]])
    nl = R["nonlinear"]
    say.append(["What no filter makes from the before: {0} dB under the music (distortion, noise, pumping); an EQ or a delay alone leaves it near −40.", [f"{nl['whole_db']:.1f}"]])
    worst = sorted(zip(nl["centres"], nl["db"]), key=lambda cv: -cv[1])
    worst = [cv for cv in worst if 30 <= cv[0] <= 16000][:2]
    if worst:
        say.append(["Most of it at " + " and ".join("{%d} Hz ({%d} dB)" % (2 * i, 2 * i + 1) for i in range(len(worst))) + ".", [x for cv in worst for x in (str(round(cv[0])), f"{cv[1]:.1f}")]])
    return say


# HERESY 2286 (Viktor 09.11.2026: «Для пользователя в сравнителе название "До и После" — это вообще непонятная фигня… заменить название на "Первый и
# второй"… Нет переводов…»): First and second's own words. The sides go by their numbers («1», «3»), so a sentence needs no case of a word; the page
# says each template in its language (its catalogs), a zone as {"w": id}, the tone's zones as {"zones": [[id, "+0.30"], …]}
def verdict12(R, a, b):
    A, B, say = R["before"], R["after"], []
    if R["likeness"] < 0.5:
        say.append(["The two are not one music (likeness {0}): what follows compares two different sounds.", [nu(R["likeness"])]])
    if abs(R["lag_ms"]) >= 1:
        say.append(["{1} comes {0} ms later than {2}; compared from where they meet.", [nu(R["lag_ms"]), b, a]])
    if R["polarity"] == "inverted":
        say.append(["The polarity of {0} is inverted against {1}.", [b, a]])
    if abs(R["level_db"]) >= 0.2:
        say.append(["{0} is {1} LU quieter than {2}; everything below compares them at equal loudness." if R["level_db"] < 0 else
                    "{0} is {1} LU louder than {2}; everything below compares them at equal loudness.", [b, nu(abs(R["level_db"])), a]])
    t = R["tone"]
    big = sorted(range(len(t["db"])), key=lambda i: -abs(t["db"][i]))
    if t["db"] and abs(t["db"][big[0]]) < 0.5:
        say.append(["The tone stayed: no sixth-octave band moved by half a dB.", []])
    else:
        moved = [[k, sg(v)] for k, v in sorted(R["zones_db"].items(), key=lambda kv: -abs(kv[1])) if abs(v) >= 0.3]
        if moved:
            say.append(["The tone of {0} against {1}: {2}.", [b, a, {"zones": moved}]])
        if t["db"]:
            say.append(["The most at {0} Hz: {1} dB.", [str(round(t["centres"][big[0]])), sg(t["db"][big[0]])]])
    d = R["dynamics"]
    if d["glue_db"] <= -0.3:
        say.append(["The loud moments lost {0} dB against the middle ones: compression, a glue.", [nu(abs(d["glue_db"]))]])
    elif d["glue_db"] >= 0.3:
        say.append(["The loud moments gained {0} dB against the middle ones: the dynamics opened.", [nu(d["glue_db"])]])
    else:
        say.append(["The dynamics stayed: the loud and the middle moments moved alike.", []])
    if d["peak_shave_db"] <= -0.3:
        say.append(["The sharpest 10 ms peaks came down {0} dB at equal loudness: they are shaved.", [nu(abs(d["peak_shave_db"]))]])
    elif d["peak_shave_db"] >= 0.3:
        say.append(["The sharpest 10 ms peaks stand {0} dB higher at equal loudness: they are not shaved; a turned phase can raise them.", [nu(d["peak_shave_db"])]])
    else:
        say.append(["The sharpest peaks stayed where they were against the loudness.", []])
    if A.get("plr_db") is not None and B.get("plr_db") is not None and abs(B["plr_db"] - A["plr_db"]) >= 0.3:
        say.append(["Peak over loudness {0} → {1} dB.", [nu(A["plr_db"]), nu(B["plr_db"])]])
    if A.get("lra_lu") is not None and B.get("lra_lu") is not None and abs(B["lra_lu"] - A["lra_lu"]) >= 0.3:
        say.append(["Loudness range {0} → {1} LU.", [nu(A["lra_lu"]), nu(B["lra_lu"])]])
    if abs(B["correlation"] - A["correlation"]) >= 0.01 or abs(B["width_db"] - A["width_db"]) >= 0.3:
        say.append(["The stereo: correlation {0} → {1}, width {2} → {3} dB.", [f"{A['correlation']:.3f}", f"{B['correlation']:.3f}", nu(A["width_db"]), nu(B["width_db"])]])
    if abs(B["balance_db"] - A["balance_db"]) >= 0.3:
        say.append(["Left against right {0} → {1} dB: one side lost or gained.", [sg(A["balance_db"]), sg(B["balance_db"])]])
    if B["clipped_runs"] > A["clipped_runs"]:
        say.append(["{0} clipped runs in {1} ({2} had {3}).", [str(B["clipped_runs"]), b, a, str(A["clipped_runs"])]])
    nl = R["nonlinear"]
    say.append(["What no filter makes of {1} from {2}: {0} dB under the music (distortion, noise, pumping); an EQ or a delay alone leaves it near −40.", [f"{nl['whole_db']:.1f}", b, a]])
    worst = [cv for cv in sorted(zip(nl["centres"], nl["db"]), key=lambda cv: -cv[1]) if 30 <= cv[0] <= 16000][:2]
    if len(worst) == 2:
        say.append(["Most of it at {0} Hz ({1} dB) and {2} Hz ({3} dB).", [str(round(worst[0][0])), f"{worst[0][1]:.1f}", str(round(worst[1][0])), f"{worst[1][1]:.1f}"]])
    elif worst:
        say.append(["Most of it at {0} Hz ({1} dB).", [str(round(worst[0][0])), f"{worst[0][1]:.1f}"]])
    return say


# HERESY 2286: the pictures' words: the node's as they were; First and second's, in the page's language when it gives them (a translation that does
# not take its places is left in English)
PIC_BA = {"eq": "{0} (at equal loudness)", "diff": "after − before (red: louder after, blue: quieter after; ±6 dB)", "time": "seconds",
          "spec": "Average spectrum at equal loudness", "tone": "What changed in the tone (grey: ±1 dB) · blue: what no filter makes",
          "nolin": "no filter makes it, dB under the music", "dynx": "the before's 50 ms level, dBFS", "dyny": "after − before, dB",
          "dyn": "Dynamics: glue {0} dB, peaks {1} dB", "st": "Short-term loudness"}
PIC_12 = dict(PIC_BA, diff="{1} − {0}: red where it is louder, blue where it is quieter (±6 dB)", time="time, s",
              dynx="the level of {0} in 50 ms windows, dBFS", dyny="{1} − {0}, dB")


def pic_words(words, nums):
    W = dict(PIC_12 if nums else PIC_BA)
    for k, v in (words or {}).items():
        if k in W and isinstance(v, str) and v.strip():
            try:
                v.format("1", "2")
                W[k] = v
            except (IndexError, KeyError, ValueError):
                pass
    return W


def grid(files, names, out, sr=SR, words=None):
    """HERESY 2286: three or four sounds: each placed against the first and turned to its loudness as compare does, their spectrograms side by
    side on the first's scale (grid.jpg)"""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    W = pic_words(words, ("1", "2"))
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                         "font.family": ["DejaVu Sans", "WenQuanYi Zen Hei", "Droid Sans Fallback"]})
    X0 = read(files[0], sr)
    l0 = ld.measure(X0.T, sr).integrated_lufs
    S, top = [], None
    for k, f in enumerate(files):
        x = X0
        if k:
            y = read(f, sr)
            lag, sign, _ = align(X0, y, sr)
            _a, x = overlap(X0, y * sign, lag)
            lk = ld.measure(x.T, sr).integrated_lufs
            if l0 is not None and lk is not None:
                x = x * 10 ** ((l0 - lk) / 20)
        s, t, fr = logspec(x, sr)
        if top is None:
            top = float(np.percentile(s, 99.9))
        S.append((s, t, fr))
    rows = (len(files) + 1) // 2
    fig, ax = plt.subplots(rows, 2, figsize=(16, 4.4 * rows), dpi=110, squeeze=False)
    yt = (31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)
    yl = ["31", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"]
    for k, (s, t, fr) in enumerate(S):
        a_ = ax[k // 2, k % 2]
        im = a_.imshow(s, origin="lower", aspect="auto", extent=[t[0], t[-1], 0, len(fr)], cmap="magma", vmin=top - 90, vmax=top, interpolation="nearest")
        a_.set_title(names[k] if not k else W["eq"].format(names[k]))
        a_.set_yticks([float(np.interp(math.log(f), np.log(fr), np.arange(len(fr)))) for f in yt])
        a_.set_yticklabels(yl)
        a_.set_ylabel("Hz")
        a_.set_xlabel(W["time"])
        fig.colorbar(im, ax=a_, pad=0.01, label="dB")
    for k in range(len(S), rows * 2):
        ax[k // 2, k % 2].axis("off")
    fig.tight_layout()
    fig.savefig(str(Path(out) / "grid.jpg"), dpi=170, pil_kwargs={"quality": 90})
    plt.close(fig)


def many(files, names, out, words=None):
    """HERESY 2286: two to four sounds, each against the first: a folder a pair (pair1…pair3, compare's own, its sides numbered), and with more
    than two the spectrograms of all side by side"""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    for k in range(1, len(files)):
        compare(files[0], files[k], (names[0], names[k]), out / f"pair{k}", words=words, nums=("1", str(k + 1)))
    if len(files) > 2:
        grid(files, names, out, words=words)


def said(s):
    text, args = s
    return text.format(*args)


def page(R):
    a, b = R["before"], R["after"]
    nb, na = R["names"]
    rows = [("Integrated loudness", "lufs", "LUFS"), ("True peak", "true_peak_dbtp", "dBTP"), ("Sample peak", "peak_dbfs", "dBFS"),
            ("Peak over loudness", "plr_db", "dB"), ("Loudness range", "lra_lu", "LU"), ("Crest", "crest_db", "dB"),
            ("Width (side over mid)", "width_db", "dB"), ("Correlation", "correlation", ""), ("Left over right", "balance_db", "dB"),
            ("The quietest moments", "quiet_dbfs", "dBFS"), ("Clipped runs", "clipped_runs", "")]
    L = [f"# Before and after", "", f"Before: `{nb}`  ", f"After: `{na}`  ", f"Compared: {R['seconds']} s from where they meet; the after {R['lag_ms']} ms later, "
         f"polarity {R['polarity']}, likeness {R['likeness']}.", "", "## Verdict", ""]
    L += ["- " + said(s) for s in R["verdict"]]
    L += ["", "## The numbers", "", "| | before | after | change | |", "|---|---|---|---|---|"]
    for name, k, unit in rows:
        va, vb = a.get(k), b.get(k)
        ch = "—" if va is None or vb is None else (f"{vb - va:+d}" if isinstance(va, int) and isinstance(vb, int) else f"{vb - va:+.2f}")
        L.append(f"| {name} | {'—' if va is None else va} | {'—' if vb is None else vb} | {ch} | {unit} |")
    L += ["", "## The tone at equal loudness, by zone (after − before, dB)", "", "| " + " | ".join(R["zones_db"]) + " |", "|" + "---|" * len(R["zones_db"]),
          "| " + " | ".join(f"{v:+.2f}" for v in R["zones_db"].values()) + " |", "", "## The dynamics (after − before at equal loudness, by the before's 50 ms level)", "",
          "| level, dBFS | change, dB | moments |", "|---|---|---|"]
    L += [f"| {c[0]} | {c[1]:+.2f} | {c[2]} |" for c in R["dynamics"]["curve"]]
    return "\n".join(L) + "\n"


def pictures(A, Bm, sr, R, cen, da, db_, sa, sb, ncen, incoh, out, W=None):
    W = W or pic_words(None, None)
    sides = R.get("nums") or ["", ""]
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import TwoSlopeNorm
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    if R.get("nums"):                                  # HERESY 2286: the page's language, Chinese and Japanese too where a font has them
        plt.rcParams.update({"font.family": ["DejaVu Sans", "WenQuanYi Zen Hei", "Droid Sans Fallback"]})
    SA, t, fr = logspec(A, sr)
    SB, _, _ = logspec(Bm, sr)
    k = min(SA.shape[1], SB.shape[1])
    SA, SB, t = SA[:, :k], SB[:, :k], t[:k]
    top = float(np.percentile(SA, 99.9))
    D = SB - SA
    from scipy.ndimage import uniform_filter
    D = uniform_filter(D, size=(3, 5))
    D[(SA < top - 80) & (SB < top - 80)] = 0
    ext = [t[0], t[-1], 0, len(fr)]
    yt = [f for f in (31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)]
    yi = [float(np.interp(math.log(f), np.log(fr), np.arange(len(fr)))) for f in yt]
    yl = ["31", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"]
    nb, na = R["names"]
    fig, ax = plt.subplots(3, 1, figsize=(14, 11), dpi=110, sharex=True)
    for i, (S, name) in enumerate(((SA, nb), (SB, W["eq"].format(na)))):
        im = ax[i].imshow(S, origin="lower", aspect="auto", extent=ext, cmap="magma", vmin=top - 90, vmax=top, interpolation="nearest")
        ax[i].set_title(name)
        fig.colorbar(im, ax=ax[i], pad=0.01, label="dB")
    im = ax[2].imshow(D, origin="lower", aspect="auto", extent=ext, cmap="RdBu_r", norm=TwoSlopeNorm(0, -6, 6), interpolation="nearest")
    ax[2].set_title(W["diff"].format(*sides))
    fig.colorbar(im, ax=ax[2], pad=0.01, label="dB")
    for a_ in ax:
        a_.set_yticks(yi)
        a_.set_yticklabels(yl)
        a_.set_ylabel("Hz")
    ax[2].set_xlabel(W["time"])
    fig.tight_layout()
    fig.savefig(str(out / "spectrograms.jpg"), dpi=200, pil_kwargs={"quality": 92})   # 1991: a good resolution to download
    plt.close(fig)

    plt.rcParams.update({"axes.grid": True, "grid.alpha": 0.25})
    fig, ax = plt.subplots(2, 2, figsize=(14, 8), dpi=110)
    ax[0, 0].semilogx(cen, da - R["before"]["lufs"], color="#6b7280", lw=1.4, label=nb)
    ax[0, 0].semilogx(cen, db_ - R["before"]["lufs"], color="#b5163a", lw=1.4, label=na)
    ax[0, 0].set_xlim(25, 20000)
    ax[0, 0].set_title(W["spec"])
    ax[0, 0].legend(loc="lower left")
    tone = np.array(R["tone"]["db"])
    ax[0, 1].semilogx(cen, tone, color="#b5163a", lw=1.6)
    ax[0, 1].axhline(0, color="#111", lw=0.8)
    ax[0, 1].fill_between(cen, -1, 1, color="#9ca3af", alpha=0.18, lw=0)
    ax[0, 1].set_xlim(25, 20000)
    lim = max(3.0, float(np.ceil(np.abs(tone).max() + 0.5)))
    ax[0, 1].set_ylim(-lim, lim)
    ax2 = ax[0, 1].twinx()
    ax2.semilogx(ncen, incoh, color="#1f6feb", lw=1.0, alpha=0.7)
    ax2.set_ylim(-60, 0)
    ax2.set_ylabel(W["nolin"], color="#1f6feb")
    ax2.grid(False)
    ax[0, 1].set_title(W["tone"])
    c = np.array(R["dynamics"]["curve"]) if R["dynamics"]["curve"] else np.zeros((0, 3))
    if len(c):
        ax[1, 0].plot(c[:, 0], c[:, 1], "o-", color="#b5163a", ms=3)
    ax[1, 0].axhline(0, color="#111", lw=0.8)
    ax[1, 0].set_xlabel(W["dynx"].format(*sides))
    ax[1, 0].set_ylabel(W["dyny"].format(*sides))
    ax[1, 0].set_title(W["dyn"].format(f"{R['dynamics']['glue_db']:+.2f}", f"{R['dynamics']['peak_shave_db']:+.2f}"))
    ax[1, 1].plot(np.arange(len(sa)), sa, color="#6b7280", lw=1.0, label=nb)
    ax[1, 1].plot(np.arange(len(sb)), sb, color="#b5163a", lw=1.0, label=W["eq"].format(na))
    ax[1, 1].set_ylim(max(-50, float(np.percentile(sa, 2)) - 6), float(np.max(sa)) + 3)
    ax[1, 1].set_xlabel(W["time"])
    ax[1, 1].set_ylabel("LUFS (3 s)")
    ax[1, 1].set_title(W["st"])
    ax[1, 1].legend(loc="lower left")
    fig.tight_layout()
    fig.savefig(str(out / "measures.png"), dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    args = sys.argv[1:]
    names = ("before", "after")
    if "--names" in args:
        i = args.index("--names")
        names = tuple(args[i + 1].split(",", 1))
        del args[i:i + 2]
    r = compare(args[0], args[1], names, args[2] if len(args) > 2 else None)
    print(json.dumps({k: r[k] for k in ("seconds", "lag_ms", "polarity", "likeness", "level_db", "zones_db", "took")}, ensure_ascii=False))
    for s in r["verdict"]:
        print("·", said(s))
