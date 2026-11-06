"""HERESY 2010: the Videographer's looks on a kit of their own: the Studio's sixteen made as 33³ .cube files that read back; a HaldCLUT of the
identity turned into a .cube that is the identity; a picture through a look at half strength between itself and the look; the filter the clip's
last pass takes, applied by ffmpeg to a frame; a look outside its pack refused.   python3 lab/test_luts.py"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import luts  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as k:
    k = Path(k)
    sh = luts.shelf(k)
    own = [x for x in sh["luts"] if x["pack"] == "ruach"]
    check("the Studio's own: sixteen looks on the shelf, CC0", len(own) == 16 and next(p for p in sh["packs"] if p["id"] == "ruach")["licence"] == "CC0", len(own))
    t = luts.read_cube(luts.cube(k, "ruach:noir.cube"))
    check("  a look reads back as a 33³ table", t.shape == (33, 33, 33, 3), t.shape)
    mid = luts.sample(t, np.array([[0.8, 0.2, 0.2]]))[0]
    check("  noir is grey: its red comes back with equal channels", abs(mid[0] - mid[1]) < 0.01 and abs(mid[1] - mid[2]) < 0.01, mid)
    # an identity HaldCLUT of level 4 (64 × 64, 16 entries an axis)
    from PIL import Image
    n = 16
    v = np.linspace(0, 255, n).round().astype(np.uint8)
    b, g, r = np.meshgrid(v, v, v, indexing="ij")
    img = np.stack([r, g, b], -1).reshape(64, 64, 3)
    (k / "user/luts/test").mkdir(parents=True)
    Image.fromarray(img).save(k / "user/luts/test/identity.png")
    sh = luts.shelf(k)
    check("yours: a HaldCLUT in user/luts listed", any(x["id"] == "user:test/identity.png" and x["kind"] == "hald" for x in sh["luts"]), [x["id"] for x in sh["luts"] if x["pack"] == "user"])
    ti = luts.read_cube(luts.cube(k, "user:test/identity.png"))
    probe = np.random.default_rng(1).random((500, 3))
    err = float(np.abs(luts.sample(ti, probe) - probe).max())
    check("  turned into a .cube that is the identity", err < 0.02, err)
    a = np.full((4, 4, 3), 0.6, np.float32)
    full = luts.sample(t, a)
    half = a * 0.5 + full * 0.5
    jpg = luts.preview(k, "ruach:noir.cube", None, 0.5)
    check("a preview: a JPEG through a look (a test card when the take has none)", jpg[:2] == b"\xff\xd8" and len(jpg) > 1000, len(jpg))
    w = k / "job"
    w.mkdir()
    f = luts.vf(k, "ruach:sepia.cube", 0.5, w)
    check("the clip's filter at half strength: a blend over the picture as it was, the look copied in as look.cube", "blend" in f and "all_opacity=0.500" in f and (w / "look.cube").is_file(), f)
    check("  at full strength the look alone; at none, no filter", luts.vf(k, "ruach:sepia.cube", 1, w) == "lut3d=file=look.cube:interp=tetrahedral" and luts.vf(k, "none", 1, w) is None and luts.vf(k, "ruach:sepia.cube", 0, w) is None)
    Image.fromarray(np.full((64, 64, 3), (200, 60, 60), np.uint8)).save(w / "in.png")
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "in.png", "-vf", luts.vf(k, "ruach:noir.cube", 1, w), "out.png"], cwd=str(w), capture_output=True, text=True)
    o = np.asarray(Image.open(w / "out.png").convert("RGB"), dtype=int)[32, 32] if p.returncode == 0 else None
    check("ffmpeg lays the look: red through noir comes out grey", o is not None and max(o) - min(o) <= 3, (p.stderr[-200:], o))
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "in.png", "-vf", luts.vf(k, "ruach:noir.cube", 0.5, w), "out2.png"], cwd=str(w), capture_output=True, text=True)
    check("  and at half strength in between", p.returncode == 0, p.stderr[-200:])
    for lid in ("user:../../etc/passwd", "user:/etc/passwd", "ruach:nothing.cube", "elsewhere:x.cube"):
        try:
            luts.cube(k, lid)
            check(f"a look outside its pack refused: {lid}", False, "taken")
        except ValueError:
            check(f"a look outside its pack refused: {lid}", True)
# HERESY 2017: the film over the clip: none at 0; ffmpeg lays a vignette (the corner darker than the middle) and a grain (a flat grey no longer flat)
check("2017 · no film at 0, a vignette and a grain by their own words", luts.film_vf(0, 0) is None and "vignette" in luts.film_vf(0, 0.5) and "noise" in luts.film_vf(1, 0)
      and luts.film_vf(0.5, 0.5).index("vignette") < luts.film_vf(0.5, 0.5).index("noise"), luts.film_vf(0.5, 0.5))
with tempfile.TemporaryDirectory() as w:
    w = Path(w)
    from PIL import Image
    Image.fromarray(np.full((96, 96, 3), 128, np.uint8)).save(w / "grey.png")
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "grey.png", "-vf", luts.film_vf(1, 1), "film.png"], cwd=str(w), capture_output=True, text=True)
    o = np.asarray(Image.open(w / "film.png").convert("L"), dtype=float) if p.returncode == 0 else None
    check("2017 · ffmpeg lays it: the corner darker than the middle, the grey grained", o is not None and o[2:8, 2:8].mean() < o[44:52, 44:52].mean() - 10 and o[30:66, 30:66].std() > 2,
          (p.stderr[-200:], None if o is None else (round(o[2:8, 2:8].mean(), 1), round(o[44:52, 44:52].mean(), 1), round(o[30:66, 30:66].std(), 2))))
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
