"""HERESY 1755–1756: the DAW's reference and the song's fade. The reference: /daw/chunk's «source» strip is the set's source as it came,
and its loudness blocks are what the page's meter reads (K-weighted, 100 ms, both sides; a mono source on both), their gating the
integrated loudness Plenio measures. The fade: linear in dB from −60 dB up and down to it, the lower where the two meet, nothing after
the end; in the render after the master's fader, said in the report, the printed strips the master's input; refused out of range.
python3 lab/test_daw_fade_ref.py"""
import io
import json
import math
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw  # noqa: E402
import daw_mix as dm  # noqa: E402
from plenio_core.audio import loudness as pl  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def page_gated(z):
    """The page's own gating of 100 ms blocks (heresy-mixer.js loudness(): 400 ms windows a block apart, −70 LUFS, then 10 LU under)."""
    lufs = lambda p: -0.691 + 10 * math.log10(p) if p > 0 else -1e9   # noqa: E731
    win = [(z[k] + z[k - 1] + z[k - 2] + z[k - 3]) / 4 for k in range(3, len(z))]
    a = [w for w in win if lufs(w) > -70]
    if not a:
        return None
    rel = lufs(sum(a) / len(a)) - 10
    g = [w for w in a if lufs(w) > rel]
    return lufs(sum(g) / len(g)) if g else None


rate = 48000
rng = np.random.default_rng(1755)
root = Path(tempfile.mkdtemp())
d = root / "take"
(d / "derived/stems-two").mkdir(parents=True)
n = rate * 6
t = np.arange(n) / rate
song = np.stack([np.sin(2 * np.pi * 220 * t) * 0.2 * (1 + 0.5 * np.sin(2 * np.pi * 0.3 * t)), rng.standard_normal(n) * 0.05])
song[:, rate * 2: rate * 3] *= 0.05                    # a quiet second: the gate has something to leave out
voc, inst = song * 0.6, song * 0.4
sf.write(d / "audio.wav", song.T.astype(np.float32), rate, subtype="FLOAT")
for k, x in (("vocals", voc), ("instrumental", inst)):
    sf.write(d / f"derived/stems-two/{k}.flac", x.T.astype(np.float32), rate, subtype="PCM_24")
json.dump({"id": "stems-two", "kind": "stems", "mode": "two", "source": "the take", "files": [{"name": k, "file": k + ".flac"} for k in ("vocals", "instrumental")]},
          open(d / "derived/stems-two/manifest.json", "w"))
info = daw.set_info(d, "derived/stems-two", [])

# 1755 · the reference
x, _ = sf.read(io.BytesIO(daw.chunk(d, info, daw.SOURCE, "", 1.5, 2.0)), dtype="float64", always_2d=True)
check("the «source» strip of /daw/chunk is the set's source as it came (16-bit)", x.shape == (rate * 2, 2) and np.max(np.abs(x.T - song[:, int(1.5 * rate): int(3.5 * rate)])) < 1e-4,
      np.max(np.abs(x.T - song[:, int(1.5 * rate): int(3.5 * rate)])))
lo = daw.source_loudness(d, info)
whole = pl.integrated_loudness(song, rate) if hasattr(pl, "integrated_loudness") else None
p = pl._weighted_power(song, rate, pl.no_cancel)
want_z = p[: len(p) // 4800 * 4800].reshape(-1, 4800).mean(axis=1)
check("its blocks: the K-weighted power of each 100 ms, both sides summed, as the page's meter sums them", lo["block"] == 0.1 and len(lo["z"]) == 60 and
      max(abs(a - b) / max(b, 1e-12) for a, b in zip(lo["z"], want_z)) < 1e-4, (len(lo["z"]), lo["block"]))
pg = page_gated(lo["z"])
check("  gated as the page gates the mix's, they give the integrated loudness Plenio measures", lo["integrated"] is not None and pg is not None and abs(pg - lo["integrated"]) < 0.05 and
      (whole is None or abs(lo["integrated"] - whole) < 0.05), (pg, lo["integrated"], whole))
part = page_gated(lo["z"][30:60])
check("  and over a stretch alone (3 s to the end), what that stretch measures", part is not None and abs(part - pl.integrated_from_blocks(pl._block_powers(p[3 * rate:], rate, 0.4, 0.1))) < 0.05,
      part)
(d / "derived/stems-mono").mkdir()
sf.write(d / "derived/mono.wav", song[0].astype(np.float32), rate, subtype="FLOAT")
sf.write(d / "derived/stems-mono/vocals.flac", (song[0] * 0.5).astype(np.float32), rate, subtype="PCM_24")
json.dump({"id": "stems-mono", "kind": "stems", "mode": "two", "source": "derived/mono.wav", "files": [{"name": "vocals", "file": "vocals.flac"}]},
          open(d / "derived/stems-mono/manifest.json", "w"))
mi = daw.set_info(d, "derived/stems-mono", [])
ml = daw.source_loudness(d, mi)
pm = pl._weighted_power(np.stack([song[0], song[0]]), rate, pl.no_cancel)
check("  a mono source measured as the page plays it, on both sides", abs(ml["z"][10] - pm[48000:52800].mean()) / pm[48000:52800].mean() < 1e-4, (ml["z"][10], pm[48000:52800].mean()))

# 1756 · the song's fade
env = dm.fade_envelope(n, rate, 2.0, 3.0, 5.0)
at = lambda s: env[int(round(s * rate))]   # noqa: E731
check("the fade: −60 dB at the start, −30 dB halfway in, 0 dB from its end", abs(20 * math.log10(at(0)) + 60) < 1e-9 and abs(20 * math.log10(at(1.0)) + 30) < 1e-9 and at(2.0) == 1.0,
      (at(0), at(1.0), at(2.0)))
check("  out: 0 dB to its start, −30 dB halfway, silence from the end on", at(2.0) == 1.0 and abs(20 * math.log10(at(3.5)) + 30) < 1e-9 and at(5.0) == 0.0 and at(5.9) == 0.0,
      (at(3.5), at(5.0)))
both = dm.fade_envelope(n, rate, 4.0, 4.0, None)
check("  a fade in and out that meet: the lower of the two; none given: the song's own end", abs(20 * math.log10(both[3 * rate]) - min(-60 * (1 - 3 / 4), -60 * (3 - 2) / 4)) < 1e-9 and both[-1] < 0.0011,
      both[3 * rate])
sig = [("vocals", voc), ("instrumental", inst), ("rest", song - voc - inst)]
V = lambda **kw: {"schema": dm.SCHEMA, "strips": {}, **kw}   # noqa: E731
y, rep, pr = dm.render(rate, sig, V(master={"fade_in_s": 2.0, "fade_out_s": 3.0, "end_s": 5.0, "gain_db": -2}), keep=True)
check("the render: the fade after the master's fader, said, not neutral", np.max(np.abs(y - song * dm.db(-2) * env[None, :])) < 1e-12 and rep["master"]["fade"] == {"in_s": 2.0, "out_s": 3.0, "end_s": 5.0} and
      not rep["neutral"], (np.max(np.abs(y - song * dm.db(-2) * env[None, :])), rep["master"]))
check("  the printed strips are the master's input (no fade in them), said so", rep["printed_at"] == "the master's input" and np.max(np.abs(sum(pr.values()) - song)) < 1e-12)
y, rep, _ = dm.render(rate, sig, V(master={"fade_in_s": 0, "fade_out_s": 0}))
check("  nothing faded: the source, neutral", np.max(np.abs(y - song)) < 1e-12 and rep["neutral"] and "fade" not in rep["master"])
for wrong, why in (({"fade_in_s": 121}, "a fade over two minutes"), ({"fade_out_s": -1}, "a fade below 0"), ({"end_s": 0}, "an end at 0"), ({"fade_n_s": 2}, "a typo in the fade")):
    try:
        dm.render(rate, sig, V(master=wrong))
        check("  refused: " + why, False, "rendered")
    except PlenioUserError:
        check("  refused: " + why, True)
print("test_daw_fade_ref:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
