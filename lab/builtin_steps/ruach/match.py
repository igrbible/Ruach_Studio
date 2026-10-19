"""HERESY 1558 · Match to a reference (Viktor 18.10.2026, the ideas he approved: «reference match»). A file's tone moved toward a
reference's, loudness left out: Plenio's tone matching (lab/plenio_core/audio/eq.py: each one's spectrum in sixth-octave smoothing with a
silence gate, the difference weighted by how sure each band is, peak bands added one at a time where the most is left and refined
together, each kept only if it helps and stays within the bound). The bands are the DAW's own (peak, frequency, gain, Q): the page can
put them on the master's EQ to hear it live, the file is the same EQ rendered. Then as loud as it came, or as the reference; never
over −1 dBTP.
    match.py AUDIO OUTDIR PARAMS.json   (PARAMS: reference = the reference's path, given by the lab)"""
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB))
from plenio_core.audio import eq as peq  # noqa: E402
from plenio_core.audio import loudness as ld  # noqa: E402

CEILING = -1.0


def read(p):
    x, sr = sf.read(str(p), dtype="float64", always_2d=True)
    return x[:, :2], sr


def main():
    t0 = time.time()
    audio, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    ref = Path(str(p.get("reference") or ""))
    if not ref.is_file():
        raise SystemExit("choose a reference: a file of this take's tree or another take")
    x, sr = read(audio)
    r, rsr = read(ref)
    amount = max(0.0, min(1.0, float(p.get("amount", 50)) / 100))
    limit = max(0.5, min(6.0, float(p.get("limit", 3))))
    nb = max(1, min(8, int(float(p.get("bands", 6)))))
    grid = peq.display_grid(sr)
    src = peq.spectral_profile(x.T, sr, grid)
    tgt = peq.spectral_profile(r.T, rsr, grid)
    settings, info = peq.fit(src, tgt, sr, strength=amount, max_gain_db=limit, max_bands=nb)
    y = peq.apply(x.T, sr, settings).T if settings["bands"] else x.copy()
    lin = ld.measure(x.T, sr, with_true_peak=False).integrated_lufs
    lref = ld.measure(r.T, rsr, with_true_peak=False).integrated_lufs
    lout = ld.measure(y.T, sr, with_true_peak=False).integrated_lufs
    aim = lref if p.get("loudness") == "reference" else lin
    if aim is not None and lout is not None:
        y = y * 10 ** ((aim - lout) / 20)
    tp = 20 * math.log10(max(ld.true_peak(y.T, sr), 1e-12))   # Plenio's true_peak is linear
    held = 0.0
    if tp is not None and tp > CEILING:
        held = CEILING - tp
        y = y * 10 ** (held / 20)
    sf.write(str(outdir / "matched.flac"), y.astype(np.float32), sr, subtype="PCM_24")
    # the picture: the two tones at equal loudness, what was asked and what the bands give
    m = (grid >= 40) & (grid <= 16000)
    delta = tgt["power_db"] - src["power_db"]
    delta = delta - np.median(delta[m])
    resp = peq.response_db(settings, sr, grid) if settings["bands"] else np.zeros_like(grid)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.grid": True, "grid.alpha": 0.25, "axes.spines.top": False, "axes.spines.right": False})
    fig, ax = plt.subplots(2, 1, figsize=(12, 6.4), dpi=110)
    s0 = src["power_db"] - np.median(src["power_db"][m])
    t0_ = tgt["power_db"] - np.median(tgt["power_db"][m])
    ax[0].semilogx(grid, s0, color="#6b7280", lw=1.4, label="this file")
    ax[0].semilogx(grid, t0_, color="#1f6feb", lw=1.4, label="the reference")
    ax[0].semilogx(grid, s0 + resp, color="#b5163a", lw=1.6, label="matched")
    ax[0].set_xlim(25, 20000)
    ax[0].set_ylabel("dB (each at its own level)")
    ax[0].set_title("The tones")
    ax[0].legend(loc="lower left")
    ax[1].semilogx(grid[m], np.clip(delta[m], -12, 12), color="#1f6feb", lw=1.0, alpha=0.6, label="the whole difference")
    ax[1].semilogx(grid[m], np.clip(delta[m] * amount, -limit, limit), color="#6b7280", lw=1.2, ls="--", label=f"asked: {round(amount * 100)} %, at most ±{limit:g} dB")
    ax[1].semilogx(grid, resp, color="#b5163a", lw=1.8, label=f"the {len(settings['bands'])} bands")
    for b in settings["bands"]:
        ax[1].axvline(b["frequency_hz"], color="#b5163a", lw=0.6, alpha=0.4)
    ax[1].axhline(0, color="#111", lw=0.8)
    ax[1].set_xlim(25, 20000)
    ax[1].set_ylim(-max(4, limit + 2), max(4, limit + 2))
    ax[1].set_ylabel("dB")
    ax[1].set_title("What the EQ does")
    ax[1].legend(loc="lower left", fontsize=9)
    fig.tight_layout()
    fig.savefig(str(outdir / "match.png"))
    plt.close(fig)
    bands = [{"id": b["id"], "type": "peak", "enabled": True, "frequency_hz": round(b["frequency_hz"], 1), "gain_db": round(b["gain_db"], 2), "q": round(b["q"], 3)}
             for b in settings["bands"]]
    rname = str(p.get("reference_name") or ref.name)
    lines = [f"# Matched to {rname}", "", f"Amount {round(amount * 100)} %, at most ±{limit:g} dB, up to {nb} bands. "
             + ("The fit: " + (f"{info.get('before_error_db', 0):.2f} dB off before, {info.get('after_error_db', 0):.2f} dB after" if "after_error_db" in info else info.get("reason", ""))) + ".", ""]
    if bands:
        lines += ["| band | Hz | dB | Q |", "|---|---|---|---|"] + [f"| {i + 1} | {b['frequency_hz']:.0f} | {b['gain_db']:+.2f} | {b['q']:.2f} |" for i, b in enumerate(bands)]
    else:
        lines += ["No band was worth adding: " + str(info.get("reason", "the tones are close already")) + "."]
    lines += ["", f"Loudness: {lin:.2f} LUFS in, the reference {lref:.2f}, out {(aim or 0):.2f}" + (f"; turned down {held:.2f} dB to hold {CEILING:g} dBTP" if held else "") + ".",
              "", "The bands, as the DAW's master EQ takes them:", "", "```json", json.dumps({"on": True, "bands": bands}, indent=1), "```", ""]
    (outdir / "match.md").write_text("\n".join(lines), encoding="utf-8")
    said = ", ".join(f"{b['frequency_hz']:.0f} Hz {b['gain_db']:+.1f}" for b in bands) or "nothing worth an EQ"
    print(json.dumps({"files": [{"name": f"Matched to {rname}", "file": "matched.flac", "seconds": round(len(y) / sr, 2)},
                                {"name": "The match", "file": "match.md"}, {"name": "The match (picture)", "file": "match.png"}],
                      "measure": {"reference": rname, "bands": bands, "fit": {k: v for k, v in info.items() if isinstance(v, (int, float, str, bool))},
                                  "lufs_in": round(lin, 2) if lin is not None else None, "lufs_reference": round(lref, 2) if lref is not None else None,
                                  "held_db": round(held, 2)},
                      "summary": f"toward {rname}: {said}", "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
