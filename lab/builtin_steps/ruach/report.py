"""HERESY 1557 · Before and after (Viktor 18.10.2026, the ideas he approved: «отчёт до/после на каждую ветку»; after his first print
through the lamp: «Нужны твои замеры и сравнение спектрограмм, в доказательство»). A branch of the tree against what it was made from:
the file a step took (its manifest's source; a set of stems or a mix of one goes back to the file the set was split from; the take when
nothing else). The take itself has no before: it is measured alone (integrated loudness, true peak, loudness range, crest, width,
correlation, the share of four bands, the average spectrum, the short-term loudness; a picture and a page).
HERESY 1991 (Viktor 01.11.2026: «заказываю тебе ноду анализатора ДО и ПОСЛЕ… со спектрограммами, разницами в сравнительном наложении
спектрограмм, замеры до и после, разница. Вердикт, что и как, и куда пошло… ей должно быть похер, откуда брать источники. Два аудио входа на
ней»): its second input, Before: what it was made from when nothing is chosen, else any file of the tree or another take (an import: a print
through gear, a reference). The two are measured by lab/ab_compare.py: found where they meet, compared at equal loudness, the spectrograms of
both and their difference, the measures and the dynamics, what no filter makes from the before, a verdict in words.
    report.py AUDIO OUTDIR PARAMS.json   (PARAMS: before = its path and before_name, given by the lab; empty: what it was made from)"""
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB))
from plenio_core.audio import loudness as ld  # noqa: E402

BANDS = (("lows", 20, 200), ("mids", 200, 2000), ("presence", 2000, 6000), ("air", 8000, 16000))


def take_of(audio):
    """The take's folder and the file's place in it: derived/ID/FILE, or the take's own audio."""
    a = audio.resolve()
    if a.parent.parent.name == "derived":
        return a.parent.parent.parent, a.relative_to(a.parent.parent.parent).as_posix()
    return a.parent, a.name


def take_audio(take):
    return next((take / f for f in ("audio.wav", "audio.flac") if (take / f).is_file()), None)


def before_of(take, rel, hops=0):
    """What the file at rel was made from: a file of the tree or the take's audio; None for the take itself."""
    if hops > 8 or not rel.startswith("derived/"):
        return None
    man = take / Path(rel).parent / "manifest.json"
    if not man.is_file():
        return None
    m = json.load(open(man, encoding="utf-8"))
    src = str(m.get("source") or "the take")
    if src == "the take":
        return take_audio(take)
    p = (take / src).resolve()
    if take.resolve() not in p.parents:
        return None
    if p.is_file():
        return p
    if p.is_dir() and (p / "manifest.json").is_file():   # a set of stems: the file it was split from
        sm = json.load(open(p / "manifest.json", encoding="utf-8"))
        s2 = str(sm.get("source") or "the take")
        return take_audio(take) if s2 == "the take" else ((take / s2).resolve() if (take / s2).is_file() else None)
    return None


def measures(x, sr):
    m = ld.measure(x.T, sr, with_true_peak=True)
    mono = x.mean(1)
    rms = float(np.sqrt((mono ** 2).mean())) or 1e-12
    out = {"lufs": m.integrated_lufs, "true_peak_dbtp": m.true_peak_dbtp, "lra_lu": m.loudness_range_lu,
           "crest_db": 20 * math.log10(max(float(np.abs(x).max()), 1e-12) / rms)}
    if x.shape[1] > 1:
        mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
        out["width_db"] = 20 * math.log10(max(float(np.sqrt((side ** 2).mean())), 1e-12) / max(float(np.sqrt((mid ** 2).mean())), 1e-12))
        a, b = x[:, 0] - x[:, 0].mean(), x[:, 1] - x[:, 1].mean()
        out["correlation"] = float((a * b).sum() / max(math.sqrt(float((a * a).sum() * (b * b).sum())), 1e-12))
    return {k: (None if v is None else round(float(v), 2)) for k, v in out.items()}


def spectrum(x, sr, n=1 << 15):
    """The average power spectrum (Welch, Hann, half overlap) of the mid, dB."""
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
    """Sixth-octave bands from 25 Hz to 20 kHz: centres and dB."""
    c = 25 * 2 ** (np.arange(0, 60) / 6)
    c = c[c <= min(20000, f[-1] / 1.06)]
    out = []
    for fc in c:
        sel = (f >= fc / 2 ** (1 / 12)) & (f < fc * 2 ** (1 / 12))
        out.append(10 * math.log10(max(float(p[sel].mean()) if sel.any() else 1e-30, 1e-30)))
    return c, np.array(out)


def shares(f, p):
    tot = float(p.sum()) or 1e-30
    return {name: round(10 * math.log10(max(float(p[(f >= a) & (f < b)].sum()), 1e-30) / tot), 2) for name, a, b in BANDS}


def short_term(x, sr):
    """Short-term loudness (3 s windows, a second apart), LUFS."""
    power = ld._weighted_power(np.ascontiguousarray(x.T), sr, ld.no_cancel)
    blocks = ld._block_powers(power, sr, 3.0, 1.0)
    return np.asarray(ld._lufs(blocks), dtype=float) if len(blocks) else np.array([-70.0])


def read(p):
    x, sr = sf.read(str(p), dtype="float64", always_2d=True)
    return x[:, :2], sr


def alone(audio, rel, outdir, t0):
    """The take itself: nothing before it, measured alone."""
    x, sr = read(audio)
    a = {"file": rel, **measures(x, sr)}
    fa, pa = spectrum(x, sr)
    a["bands"] = shares(fa, pa)
    sa = short_term(x, sr)
    ca, da = sixth(fa, pa)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.grid": True, "grid.alpha": 0.25, "axes.spines.top": False, "axes.spines.right": False})
    fig, ax = plt.subplots(2, 1, figsize=(12, 6.4), dpi=110)
    ax[0].semilogx(ca, da - (a["lufs"] or 0), color="#b5163a", lw=1.6, label="this file")
    ax[0].set_xlim(25, 20000)
    ax[0].set_ylabel("dB (equal loudness)")
    ax[0].set_title("Average spectrum, sixth-octave bands")
    ax[0].legend(loc="lower left")
    ax[1].plot(np.arange(len(sa)), sa, color="#b5163a", lw=1.2, label="this file")
    ax[1].set_ylim(max(-50, float(np.percentile(sa, 2)) - 6), float(np.max(sa)) + 3)
    ax[1].set_xlabel("seconds")
    ax[1].set_ylabel("LUFS (3 s)")
    ax[1].set_title("Short-term loudness through the song")
    ax[1].legend(loc="lower left")
    fig.tight_layout()
    fig.savefig(str(outdir / "report.png"))
    plt.close(fig)
    rows = [("Integrated loudness", "lufs", "LUFS"), ("True peak", "true_peak_dbtp", "dBTP"), ("Loudness range", "lra_lu", "LU"),
            ("Crest", "crest_db", "dB"), ("Width (side over mid)", "width_db", "dB"), ("Correlation", "correlation", "")]
    lines = [f"# Before and after · {rel}", "", "The take itself: nothing before it, measured alone.", "", "| | | |", "|---|---|---|"]
    lines += [f"| {n} | {'—' if a.get(k) is None else f'{a[k]:.2f}'} {u} |" for n, k, u in rows]
    lines += [f"| Share of the {name} | {a['bands'][name]:.2f} dB |" for name, _lo, _hi in BANDS] + [""]
    (outdir / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"files": [{"name": "Before and after", "file": "report.md"}, {"name": "Before and after (picture)", "file": "report.png"}],
                      "measure": {"after": a, "before": None}, "summary": f"{a['lufs']} LUFS, true peak {a['true_peak_dbtp']} dBTP, range {a['lra_lu']} LU",
                      "took": round(time.time() - t0, 1), "seconds": round(len(x) / sr, 2)}))


def against(audio, rel, before, bname, outdir, t0):
    """HERESY 1991: the two through ab_compare: the page, the measures' picture, the spectrograms; the four bands' shares as 1557 gave them."""
    import ab_compare as ab
    R = ab.compare(before, audio, (bname, rel), outdir)
    os.replace(outdir / "compare.md", outdir / "report.md")
    os.replace(outdir / "measures.png", outdir / "report.png")
    x, sr = read(audio)
    y, sry = read(before)
    fa, pa = spectrum(x, sr)
    fb, pb = spectrum(y, sry)
    a, b = {"file": rel, **R["after"], "bands": shares(fa, pa)}, {"file": bname, **R["before"], "bands": shares(fb, pb)}
    t, i = R["tone"], int(np.argmax(np.abs(R["tone"]["db"]))) if R["tone"]["db"] else 0
    said = [f"{R['level_db']:+.1f} LU"]
    if a.get("true_peak_dbtp") is not None and b.get("true_peak_dbtp") is not None:
        said.append(f"true peak {b['true_peak_dbtp']:.1f} → {a['true_peak_dbtp']:.1f} dBTP")
    if t["db"]:
        said.append(f"most at {t['centres'][i]:.0f} Hz ({t['db'][i]:+.1f} dB)")
    said.append(f"crest {b['crest_db']:.1f} → {a['crest_db']:.1f} dB")
    d = R["dynamics"]
    said.append(f"loud moments {d['glue_db']:+.1f} dB, peaks {d['peak_shave_db']:+.1f} dB")
    print(json.dumps({"files": [{"name": "Before and after", "file": "report.md"}, {"name": "Before and after (measures)", "file": "report.png"},
                                {"name": "Before and after (spectrograms)", "file": "spectrograms.jpg"}],
                      "measure": {"after": a, "before": b, "level_db": R["level_db"], "lag_ms": R["lag_ms"], "polarity": R["polarity"], "likeness": R["likeness"],
                                  "zones_db": R["zones_db"], "glue_db": d["glue_db"], "peak_shave_db": d["peak_shave_db"], "nonlinear_db": R["nonlinear"]["whole_db"],
                                  "verdict": [ab.said(s) for s in R["verdict"]]},
                      "summary": ("against " + bname + ": " + ", ".join(said))[:300], "took": round(time.time() - t0, 1), "seconds": R["seconds"]}))


def main():
    t0 = time.time()
    audio, outdir = Path(sys.argv[1]), Path(sys.argv[2])
    p = {}
    if len(sys.argv) > 3 and Path(sys.argv[3]).is_file():
        p = json.load(open(sys.argv[3], encoding="utf-8"))
    take, rel = take_of(audio)
    given = str(p.get("before") or "")                 # HERESY 1991: the second input, chosen; else what it was made from
    before = Path(given) if given else before_of(take, rel)
    if before is None:
        return alone(audio, rel, outdir, t0)
    bname = str(p.get("before_name") or "") or (before.resolve().relative_to(take.resolve()).as_posix() if take.resolve() in before.resolve().parents else before.name)
    against(audio, rel, before, bname, outdir, t0)


if __name__ == "__main__":
    main()
