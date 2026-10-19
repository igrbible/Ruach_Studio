"""HERESY 1557 · Before and after (Viktor 18.10.2026, the ideas he approved: «отчёт до/после на каждую ветку»; after his first print
through the lamp: «Нужны твои замеры и сравнение спектрограмм, в доказательство»). A branch of the tree against what it was made from:
the file a step took (its manifest's source; a set of stems or a mix of one goes back to the file the set was split from; the take when
nothing else). Both measured the same way: integrated loudness, true peak, loudness range (Plenio's BS.1770), crest, width (side over
mid), correlation, the share of four bands; the average spectra in sixth-octave bands at equal loudness and their difference; the
short-term loudness through the song. A picture of it and the numbers as a page beside it. The take itself has no before: it is
measured alone.
    report.py AUDIO OUTDIR PARAMS.json"""
import json
import math
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


def clock(s):
    return f"{int(s) // 60}:{int(s) % 60:02d}"


def main():
    t0 = time.time()
    audio, outdir = Path(sys.argv[1]), Path(sys.argv[2])
    take, rel = take_of(audio)
    before = before_of(take, rel)
    x, sr = read(audio)
    a = {"file": rel, **measures(x, sr)}
    fa, pa = spectrum(x, sr)
    a["bands"] = shares(fa, pa)
    sa = short_term(x, sr)
    b = None
    if before is not None:
        y, sry = read(before)
        b = {"file": before.relative_to(take.resolve()).as_posix() if take.resolve() in before.parents else before.name, **measures(y, sry)}
        fb, pb = spectrum(y, sry)
        b["bands"] = shares(fb, pb)
        sb = short_term(y, sry)
    ca, da = sixth(fa, pa)
    # equal loudness: each spectrum referred to its own loudness, so the difference is of shape, not of level
    da_eq = da - (a["lufs"] or 0)
    if b:
        cb, db_ = sixth(fb, pb)
        n = min(len(ca), len(cb))
        diff = da_eq[:n] - (db_[:n] - (b["lufs"] or 0))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.grid": True, "grid.alpha": 0.25, "axes.spines.top": False, "axes.spines.right": False})
    rows = 3 if b else 2
    fig, ax = plt.subplots(rows, 1, figsize=(12, 3.2 * rows), dpi=110)
    k = 0
    ax[k].semilogx(ca, da_eq, color="#b5163a", lw=1.6, label="after" if b else "this file")
    if b:
        ax[k].semilogx(cb, db_ - (b["lufs"] or 0), color="#6b7280", lw=1.4, label="before")
    ax[k].set_xlim(25, 20000)
    ax[k].set_ylabel("dB (equal loudness)")
    ax[k].set_title("Average spectrum, sixth-octave bands")
    ax[k].legend(loc="lower left")
    k += 1
    if b:
        ax[k].semilogx(ca[:n], diff, color="#b5163a", lw=1.6)
        ax[k].axhline(0, color="#111", lw=0.8)
        ax[k].fill_between(ca[:n], -1, 1, color="#9ca3af", alpha=0.18, lw=0)
        ax[k].set_xlim(25, 20000)
        lim = max(3.0, float(np.ceil(np.abs(diff).max() + 0.5)))
        ax[k].set_ylim(-lim, lim)
        ax[k].set_ylabel("after − before, dB")
        ax[k].set_title("What changed in the balance (equal loudness; the grey band is ±1 dB)")
        k += 1
    t = np.arange(len(sa))
    ax[k].plot(t, sa, color="#b5163a", lw=1.2, label="after" if b else "this file")
    if b:
        ax[k].plot(np.arange(len(sb)), sb, color="#6b7280", lw=1.0, label="before")
    ax[k].set_ylim(max(-50, float(np.percentile(sa, 2)) - 6), float(np.max(sa)) + 3)
    ax[k].set_xlabel("seconds")
    ax[k].set_ylabel("LUFS (3 s)")
    ax[k].set_title("Short-term loudness through the song")
    ax[k].legend(loc="lower left")
    fig.tight_layout()
    fig.savefig(str(outdir / "report.png"))
    plt.close(fig)

    def row(name, key, unit):
        va = a.get(key)
        if not b:
            return f"| {name} | {'—' if va is None else f'{va:.2f}'} {unit} |"
        vb = b.get(key)
        d = "—" if va is None or vb is None else f"{va - vb:+.2f}"
        return f"| {name} | {'—' if vb is None else f'{vb:.2f}'} | {'—' if va is None else f'{va:.2f}'} | {d} | {unit} |"
    lines = [f"# Before and after · {rel}", ""]
    if b:
        lines += [f"Before: `{b['file']}`  ", f"After: `{a['file']}`", "", "| | before | after | change | |", "|---|---|---|---|---|"]
    else:
        lines += ["The take itself: nothing before it, measured alone.", "", "| | | |", "|---|---|---|"]
    lines += [row("Integrated loudness", "lufs", "LUFS"), row("True peak", "true_peak_dbtp", "dBTP"), row("Loudness range", "lra_lu", "LU"),
              row("Crest", "crest_db", "dB"), row("Width (side over mid)", "width_db", "dB"), row("Correlation", "correlation", "")]
    for name, _lo, _hi in BANDS:
        va = a["bands"][name]
        lines.append(f"| Share of the {name} | {b['bands'][name]:.2f} | {va:.2f} | {va - b['bands'][name]:+.2f} | dB |" if b else f"| Share of the {name} | {va:.2f} dB |")
    said = []
    if b:
        lines += ["", "**The balance at equal loudness** (sixth-octave bands, after − before):", ""]
        big = sorted(range(n), key=lambda i: -abs(diff[i]))[:6]
        for i in sorted(big):
            lines.append(f"- {ca[i]:.0f} Hz: {diff[i]:+.2f} dB")
        if a["lufs"] is not None and b["lufs"] is not None:
            said.append(f"{a['lufs'] - b['lufs']:+.1f} LU")
        if a["true_peak_dbtp"] is not None and b["true_peak_dbtp"] is not None:
            said.append(f"true peak {b['true_peak_dbtp']:.1f} → {a['true_peak_dbtp']:.1f} dBTP")
        i = int(np.argmax(np.abs(diff)))
        said.append(f"most at {ca[i]:.0f} Hz ({diff[i]:+.1f} dB)")
        if a.get("crest_db") is not None and b.get("crest_db") is not None:
            said.append(f"crest {b['crest_db']:.1f} → {a['crest_db']:.1f} dB")
        summary = "against " + b["file"] + ": " + ", ".join(said)
    else:
        summary = f"{a['lufs']} LUFS, true peak {a['true_peak_dbtp']} dBTP, range {a['lra_lu']} LU"
    lines += [""]
    (outdir / "report.md").write_text("\n".join(lines), encoding="utf-8")
    secs = round(len(x) / sr, 2)
    print(json.dumps({"files": [{"name": "Before and after", "file": "report.md"}, {"name": "Before and after (picture)", "file": "report.png"}],
                      "measure": {"after": a, "before": b}, "summary": summary, "took": round(time.time() - t0, 1), "seconds": secs}))


if __name__ == "__main__":
    main()
