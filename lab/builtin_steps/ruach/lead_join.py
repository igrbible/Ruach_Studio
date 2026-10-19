"""HERESY 1554 · Whole lead (Viktor 15.10.2026 on «Крик», 2:08–2:22: «вокал в яме»; measured: the karaoke split put the voice into
Backing Vocals there, lead −60, backing −25 dBFS and centred). Where the backing stem carries the lead (louder than the lead by the
margin, loud enough, and in the centre as a lead voice is) it is moved back into the lead, with short ramps at the edges; short gaps
between such stretches are closed, stretches shorter than a second left. Lead and backing together are what they were, sample for
sample: the mix does not change, only which stem holds the voice. Back: the lead whole and the backing less it, each a version of
its stem for the DAW (and the chain's next steps).
    lead_join.py STEMS_DIR OUTDIR PARAMS.json"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

HOP = 0.25


def frames_db(x, sr):
    h = int(HOP * sr)
    k = len(x) // h
    return 20 * np.log10(np.sqrt((x[: k * h] ** 2).reshape(k, h).mean(1)) + 1e-9)


def regions(lead, back, sr, margin=6.0, floor=-40.0, centre=9.0, close_s=1.0, min_s=1.0):
    """The stretches where the backing holds the lead: [(start_s, end_s)]."""
    lm, bm = lead.mean(1), back.mean(1)
    bs = (back[:, 0] - back[:, 1]) / 2 if back.shape[1] > 1 else np.zeros(len(back))
    dl, db_, ds = frames_db(lm, sr), frames_db(bm, sr), frames_db(bs, sr)
    hit = (db_ > dl + margin) & (db_ > floor) & (db_ - ds > centre)
    k = len(hit)
    close = int(round(close_s / HOP))
    i = 0
    while i < k:                                        # close short gaps between hits
        if not hit[i] and i > 0 and hit[i - 1]:
            j = i
            while j < k and not hit[j]:
                j += 1
            if j < k and j - i <= close:
                hit[i:j] = True
            i = j
        else:
            i += 1
    out, i = [], 0
    while i < k:
        if hit[i]:
            j = i
            while j < k and hit[j]:
                j += 1
            if (j - i) * HOP >= min_s:
                out.append((max(0.0, (i - 1) * HOP), min(len(lead) / sr, (j + 1) * HOP)))
            i = j
        else:
            i += 1
    return out


def join(lead, back, sr, regs, ramp_s=0.05):
    w = np.zeros(len(lead))
    r = max(1, int(ramp_s * sr))
    for a, b in regs:
        i, j = int(a * sr), min(len(w), int(b * sr))
        w[i:j] = 1.0
        up = 0.5 - 0.5 * np.cos(np.pi * np.arange(r) / r)
        w[max(0, i - r):i] = np.maximum(w[max(0, i - r):i], up[r - (i - max(0, i - r)):])
        w[j:j + r] = np.maximum(w[j:j + r], up[::-1][: len(w[j:j + r])])
    w = w[:, None]
    return lead + back * w, back * (1 - w)


def clock(s):
    return f"{int(s) // 60}:{int(s) % 60:02d}"


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    files = {f["name"]: f for f in man.get("files", [])}
    if "lead_vocal" not in files or "backing_vocals" not in files:
        raise SystemExit("this set has no lead and backing apart: split the take into eight stems")
    given = p.get("_versions") or {}                   # the stems as the chain left them (the lab's word), else as split
    lead, sr = sf.read(given.get("lead_vocal") or str(sdir / files["lead_vocal"]["file"]), dtype="float64", always_2d=True)
    back, sr2 = sf.read(given.get("backing_vocals") or str(sdir / files["backing_vocals"]["file"]), dtype="float64", always_2d=True)
    if sr != sr2:
        raise SystemExit("the lead and the backing are at different rates")
    n = min(len(lead), len(back))
    lead, back = lead[:n], back[:n]
    if lead.shape[1] != back.shape[1]:
        lead, back = (np.repeat(lead[:, :1], 2, 1) if lead.shape[1] == 1 else lead[:, :2]), (np.repeat(back[:, :1], 2, 1) if back.shape[1] == 1 else back[:, :2])
    regs = regions(lead, back, sr, float(p.get("margin", 6)), float(p.get("floor", -40)), float(p.get("centre", 9)), 1.0, float(p.get("min_s", 1)))
    nl, nb = join(lead, back, sr, regs)
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    set_rel = rel.relative_to(take).as_posix()
    sf.write(str(Path(outdir) / "lead_vocal.flac"), nl.astype(np.float32), sr, subtype="PCM_24")
    sf.write(str(Path(outdir) / "backing_vocals.flac"), nb.astype(np.float32), sr, subtype="PCM_24")
    moved = sum(b - a for a, b in regs)
    said = ("the lead whole: " + ", ".join(f"{clock(a)}–{clock(b)}" for a, b in regs) + f" moved back from the backing ({moved:.0f} s)") if regs \
        else "the lead was whole already: the backing never held it"
    print(json.dumps({"files": [{"name": "Lead Vocal (whole)", "file": "lead_vocal.flac", "seconds": round(n / sr, 2), "source": f"{set_rel}/{files['lead_vocal']['file']}"},
                                {"name": "Backing Vocals (less the lead)", "file": "backing_vocals.flac", "seconds": round(n / sr, 2), "source": f"{set_rel}/{files['backing_vocals']['file']}"}],
                      "measure": {"regions": [[round(a, 2), round(b, 2)] for a, b in regs], "moved_s": round(moved, 2)},
                      "summary": said, "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
