"""HERESY 2421 · Speech de-clicker, the Reader's node (Viktor 11.11.2026: «…и/или нодой "Де-кликер", чтобы оригинал не зацепить»): the short
low knock a speech codec leaves where a generation ends (lab/reader_seam.py says what it is and how it was measured) found and mended in a
take that is already made; the original stays as it is, the result is a branch of the take.

In a take of the Narrator (its request names the run, and the file is as long as the take) the knocks are looked for in the pieces as the
engine gave them, each piece's chosen version, and placed in the take by the run's layout: exact, whatever level the take was brought to.
Any other spoken take is listened to as it is. Each spot is mended by reader_seam.repair: its last 90 ms above 100 Hz and faded to the floor;
the samples outside the spots are the take's own, one for one.

    speech_declick.py AUDIO OUTDIR PARAMS.json   (PARAMS: fade ms 20..80, reel true|false)
Files: speech_declick.flac (the take mended), declick-ab.flac (each spot, before then after, when there are spots and the reel is on),
declick.md (where, and the knock and the step at each, before and after)."""
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
LAB = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(LAB))
import speech_core as sc  # noqa: E402
import reader_seam as seam  # noqa: E402

REEL_MAX = 40               # spots in the reel at most
BEFORE_S, AFTER_S = 1.2, 0.4


def _take_dir(audio):
    for d in (audio.parent, *audio.parents):
        if (d / "request.json").is_file():
            return d
        if d == LAB.parent:
            break
    return None


def run_spots(audio, n, sr):
    """The knocks of a Narrator take found in its own pieces, in the take's seconds; None when this is no Narrator take or not as long as one."""
    import soundfile as sf
    take = _take_dir(audio)
    if take is None:
        return None
    try:
        rid = (json.load(open(take / "request.json", encoding="utf-8")).get("reader") or {}).get("run")
        rd = LAB.parent / "reader" / "runs" / str(rid)
        run = json.load(open(rd / "run.json", encoding="utf-8"))
        if abs(sf.info(str(take / "audio.wav")).frames - n) > 2 or sf.info(str(take / "audio.wav")).samplerate != sr:
            return None
    except (OSError, ValueError, TypeError):
        return None
    out = []
    for p in run.get("pieces") or []:
        if not p.get("at"):
            continue
        v = int(p.get("v") or 0)
        f = rd / (f"piece-{p['i']:03d}.v{v}.wav" if v else f"piece-{p['i']:03d}.wav")
        if not f.is_file():
            continue
        raw, psr = sf.read(str(f), dtype="float64", always_2d=True)
        raw = raw.mean(1)
        lead, a0, a1 = float(p.get("lead") or 0), float(p["at"][0]), float(p["at"][1])
        for s in seam.find(raw, psr):
            if lead <= s["start"] and s["end"] <= lead + (a1 - a0):
                sh = a0 - lead
                out.append(dict(s, at=round(s["at"] + sh, 4), start=round(s["start"] + sh, 4), end=round(s["end"] + sh, 4), piece=p["i"] + 1,
                                in_piece=s["at"]))
    return out


def _mmss(t):
    return f"{int(t // 60)}:{t % 60:06.3f}"


def main():
    t0 = time.time()
    audio, outdir, p = Path(sys.argv[1]), Path(sys.argv[2]), json.load(open(sys.argv[3], encoding="utf-8"))
    fade = max(20.0, min(80.0, float(p.get("fade", 45))))
    reel_on = p.get("reel", True) not in (False, "false", "off", 0)
    seam.FADE_S = fade / 1000.0
    x, sr = sc.read(audio)                                # (channels, n)
    spots = run_spots(audio, x.shape[1], sr)
    how = "the Narrator's pieces as read"
    for s in spots or []:                                 # its place to the sample in the take as levelled and resampled
        d = seam.refine(x.mean(0), sr, s["at"]) - s["at"]
        s.update(at=round(s["at"] + d, 5), start=round(s["start"] + d, 5), end=round(s["end"] + d, 5))
    if spots is None:
        spots, how = [dict(s, piece=None) for s in seam.find(x.mean(0), sr)], "the take itself"
    y = seam.repair(x, sr, spots) if spots else x.copy()
    sc.write(outdir / "speech_declick.flac", y, sr)
    before, after = seam.measure(x.mean(0), sr, spots), seam.measure(y.mean(0), sr, spots)
    changed = int((np.abs(y - x).max(0) > 0).sum())
    files = [{"name": f"Speech de-clicker: {len(spots)} knock{'s' if len(spots) != 1 else ''} mended", "file": "speech_declick.flac",
              "seconds": round(y.shape[1] / sr, 2)}]
    if spots and reel_on:
        gap, rest, parts = np.zeros((x.shape[0], int(0.35 * sr))), np.zeros((x.shape[0], int(0.8 * sr))), []
        for s in spots[:REEL_MAX]:
            a, b = max(0, int((s["at"] - BEFORE_S) * sr)), min(x.shape[1], int((s["at"] + AFTER_S) * sr))
            parts += [x[:, a:b], gap, y[:, a:b], rest]
        reel = np.concatenate(parts, axis=1)
        sc.write(outdir / "declick-ab.flac", reel, sr)
        files.append({"name": f"Before and after, spot by spot ({min(len(spots), REEL_MAX)})", "file": "declick-ab.flac",
                      "seconds": round(reel.shape[1] / sr, 2)})
    lines = [f"# Speech de-clicker · {len(spots)} knock{'s' if len(spots) != 1 else ''}", "",
             f"Found in {how}; fade {fade:g} ms. {changed / sr:.2f} s of {x.shape[1] / sr:.1f} s touched, every other sample the take's own.", ""]
    if spots:
        lines += ["| # | in the take | piece | low knock 30–100 Hz, dBFS | step, dB |", "|---|---|---|---|---|"]
        for k, (s, b, a) in enumerate(zip(spots, before, after), 1):
            lines.append(f"| {k} | {_mmss(s['at'])} | {s.get('piece') or '—'} | {b['low_db']} → {a['low_db']} | {b['step_db']} → {a['step_db']} |")
    (outdir / "declick.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    files.append({"name": "Where the knocks were", "file": "declick.md"})
    summary = (f"{len(spots)} knock{'s' if len(spots) != 1 else ''} mended ({how}), {changed / sr:.2f} s touched, the rest sample for sample"
               if spots else "no knock found: the take comes back as it was")
    sc.answer(files, {"spots": len(spots), "found_in": how, "fade_ms": fade, "seconds_touched": round(changed / sr, 3),
                      "at": [s["at"] for s in spots], "before": before, "after": after}, summary, time.time() - t0)


if __name__ == "__main__":
    main()
