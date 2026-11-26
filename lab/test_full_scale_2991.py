"""HERESY 2991: the VAE never takes a decode past full scale (lab/trainer/cache.py full_scale). Within the bounds the very object comes
back (a PCM WAV, an honest mp3, light overs); past them the giga-set builders' mode refuses it by name and measure, the Train room's mode
scales it to -0.1 dBFS; a decode that is not finite is refused in both; build() guards every track before the VAE.
    .venv/bin/python lab/test_full_scale_2991.py"""
import ast, math, sys
from pathlib import Path

import torch

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB / "trainer"))
import cache  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


def refused(w, mode="refuse"):
    try:
        cache.full_scale(w, "fma-train-00062-of-00972-24", mode=mode)
    except cache.OverFullScale as e:
        return str(e)
    return ""


sr = 48000
t = torch.arange(sr * 4, dtype=torch.float32) / sr
song = torch.stack([torch.sin(2 * math.pi * 440 * t), torch.sin(2 * math.pi * 220 * t)]) * 0.9
check(cache.OVER_SHARE_MAX == 0.001 and cache.OVER_PEAK_MAX == 2.0, "the bounds: 0.1 % of the samples past ±1, a peak of +6 dBFS")
check(issubclass(cache.OverFullScale, ValueError), "the refusal is a ValueError: every builder's except keeps it as the track's failure")
check(cache.full_scale(song, "pcm") is song, "a decode within ±1 comes back as the very tensor")
arr = song.numpy().copy()
check(cache.full_scale(arr, "pcm") is arr, "... and as the very numpy array (the ffmpeg decodes of the giga-set builders)")
pcm = song.clone()
pcm[0, 0] = -1.0
check(cache.full_scale(pcm) is pcm, "a PCM WAV's lowest sample (-1.0) is within full scale")
light = song.clone()
light[:, ::997] *= 1.27
peak = float(light.abs().max())
check(1.0 < peak < 1.2 and cache.full_scale(light) is light, f"light overs (peak {20 * math.log10(peak):+.1f} dBFS on a few samples) stay as they are")
empty = torch.zeros(2, 0)
check(cache.full_scale(empty) is empty, "an empty decode is left to the VAE's own refusal")

hot = song * 55                                          # the noise-rock cover: +34.8 dBFS, more than half its samples past ±1
msg = refused(hot)
check("fma-train-00062-of-00972-24" in msg and "+33.9 dBFS" in msg and "% of its samples past ±1" in msg and "HERESY 2991" in msg,
      f"a decode far past full scale refused by name and measure: {msg}")
check(refused(hot.numpy()), "... from a numpy array too")
spike = song.clone()
spike[1, 1000] = 3.0
check("+9.5 dBFS" in refused(spike), "one sample past +6 dBFS is enough")
dense = song.clone()
dense[:, :int(dense.shape[1] * 0.005)] = 1.1
check("0.50 %" in refused(dense), "or 0.5 % of the samples past ±1 at only +0.8 dBFS")

out = cache.full_scale(hot, "my-float-mix", mode="normalise")
check(out is not hot and out.shape == hot.shape and out.dtype == hot.dtype, "the Train room's mode returns a new tensor of the same shape and type")
check(abs(float(out.abs().max()) - 0.99) < 1e-5 and torch.allclose(out * (float(hot.abs().max()) / 0.99), hot, rtol=1e-5),
      "scaled as a whole to a peak of 0.99 (-0.1 dBFS): the shape of the wave kept")
check(cache.full_scale(light, mode="normalise") is light, "light overs stay as they are in that mode too")
nan = song.clone()
nan[0, 5] = float("nan")
check("not finite" in refused(nan) and "not finite" in refused(nan, mode="normalise"), "a decode with NaN is refused in both modes")
inf = song.clone()
inf[1, 7] = float("inf")
check("not finite" in refused(inf, mode="normalise"), "and one with Inf")

src = (LAB / "trainer" / "cache.py").read_text(encoding="utf-8")
build = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "build")
body = ast.get_source_segment(src, build)
check('full_scale(stereo48_track(set_folder, stem), stem, mode="normalise")' in body
      and body.index("full_scale(") < body.index("vae.encode("), "build() guards every track before the VAE, in the Train room's mode")
print(f"{ok} passed")
