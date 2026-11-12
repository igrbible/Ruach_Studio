"""HERESY 2010 (Viktor 01.11.2026: «ещё раз пройдись через интерфейс Видеографа, исследуй Davinci Resolve и вычлени самое лучшее. Также было бы очень
хорошо заиметь библиотеку с Luts'ами для применения цветовых эффектов»): the looks of the Videographer's clip, a 3D LUT over the whole picture as a
colourist lays one in Resolve, its strength from a breath to all of it, the lyrics and titles over it untouched.

  the Studio's own   sixteen looks made here (models/videographer/luts/ruach/*.cube, 33³), drawn by this file's own curves: CC0, ours, they ship as code;
  film               the RawTherapee Film Simulation Collection (Pat David, Pavlov Dmitry, Michael Ezra; CC BY-SA 4.0), HaldCLUT PNGs of film
                     stocks, fetched on asking (422 MB) into models/videographer/luts/rawtherapee/ and turned into a .cube of 33³ the first time one is used;
  yours              any .cube or HaldCLUT .png laid in user/luts/ (a folder a pack).

A look's id is pack:relative/path. shelf() lists them, preview() draws a picture through one (cached), cube() gives the .cube ffmpeg reads,
vf() the filter for the clip's last pass."""
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import threading
import time
import zipfile
from pathlib import Path

import numpy as np

import paths                       # HERESY 2330: where the weights live

N = 33                                              # a .cube's size: 33³ points, the size film LUTs ship at
FILM_URL = "https://rawtherapee.com/shared/HaldCLUT.zip"
FILM_BYTES = 421602289
PACKS = {"ruach": {"name": "The Studio's own", "licence": "CC0", "author": "Ruach Studio"},
         "rawtherapee": {"name": "Film (RawTherapee)", "licence": "CC BY-SA 4.0",
                         "author": "Pat David, Pavlov Dmitry, Michael Ezra (RawTherapee Film Simulation Collection)", "url": FILM_URL, "bytes": FILM_BYTES},
         "user": {"name": "Yours", "licence": "yours", "author": ""}}
_fetch = {"state": "idle", "done": 0, "total": FILM_BYTES, "error": ""}
_lock = threading.Lock()


# ---- the Studio's own looks: curves on a grid, everything here ours (CC0)
def _lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def _sat(c, s):
    y = _lum(c)[..., None]
    return y + (c - y) * s


def _contrast(c, k):
    return np.clip((c - 0.5) * k + 0.5, 0, 1)


def _lift_gain(c, lift, gain):                      # lift raises the blacks, gain lowers or raises the whites (per channel arrays)
    return c * (np.asarray(gain) - np.asarray(lift)) + np.asarray(lift)


def _split(c, shadow, highlight, amount):           # split toning: a colour into the shadows, another into the highlights, by luminance
    y = _lum(c)[..., None]
    return np.clip(c + amount * ((1 - y) * (np.asarray(shadow) - 0.5) + y * (np.asarray(highlight) - 0.5)), 0, 1)


def _mono(c, tint=(1, 1, 1)):
    y = _lum(c)[..., None]
    return np.clip(y * np.asarray(tint), 0, 1)


LOOKS = {
    "warm-film": lambda c: _sat(_contrast(_lift_gain(c, (0.03, 0.02, 0.0), (1.0, 0.97, 0.9)), 1.08), 0.92),
    "teal-and-orange": lambda c: _sat(_split(_contrast(c, 1.1), (0.35, 0.55, 0.6), (0.68, 0.52, 0.38), 0.5), 1.05),
    "bleach-bypass": lambda c: _contrast(c * 0.45 + _mono(c) * 0.55, 1.25),
    "faded-matte": lambda c: _sat(_lift_gain(c, (0.08, 0.08, 0.09), (0.95, 0.95, 0.94)), 0.85),
    "sepia": lambda c: _contrast(_mono(c, (1.07, 0.93, 0.72)), 1.05),
    "noir": lambda c: _contrast(_mono(c), 1.35),
    "silver": lambda c: _lift_gain(_contrast(_mono(c), 1.05), (0.04, 0.04, 0.05), (0.96, 0.96, 0.97)),
    "golden-hour": lambda c: _sat(_split(c, (0.52, 0.45, 0.55), (0.72, 0.58, 0.36), 0.45), 1.08),
    "blue-hour": lambda c: _sat(_lift_gain(c, (0.0, 0.01, 0.05), (0.78, 0.84, 1.0)), 0.75),
    "cross-process": lambda c: np.clip(np.stack([np.clip((c[..., 0] - 0.5) * 1.3 + 0.55, 0, 1), np.clip((c[..., 1] - 0.5) * 1.15 + 0.52, 0, 1),
                                                 c[..., 2] * 0.75 + 0.12], -1), 0, 1),
    "kodachrome-like": lambda c: _contrast(_sat(_lift_gain(c, (0.0, 0.0, 0.02), (1.0, 0.98, 0.92)), 1.25), 1.12),
    "cinema-cool": lambda c: _sat(_split(_contrast(c, 1.06), (0.42, 0.5, 0.6), (0.52, 0.5, 0.48), 0.4), 0.8),
    "seventies": lambda c: _sat(_lift_gain(c, (0.06, 0.06, 0.02), (0.98, 0.95, 0.82)), 0.8),
    "pastel": lambda c: _sat(_lift_gain(_contrast(c, 0.85), (0.06, 0.05, 0.07), (0.98, 0.97, 0.98)), 0.75),
    "desert": lambda c: _contrast(_sat(_lift_gain(c, (0.03, 0.01, 0.0), (1.0, 0.92, 0.75)), 1.1), 1.12),
    "sacred-gold": lambda c: _sat(_split(_contrast(c, 1.1), (0.45, 0.4, 0.38), (0.75, 0.62, 0.35), 0.55), 0.95),
}
NAMES = {"warm-film": "Warm film", "teal-and-orange": "Teal and orange", "bleach-bypass": "Bleach bypass", "faded-matte": "Faded matte", "sepia": "Sepia",
         "noir": "Noir", "silver": "Silver", "golden-hour": "Golden hour", "blue-hour": "Blue hour", "cross-process": "Cross process",
         "kodachrome-like": "Saturated slide film", "cinema-cool": "Cinema cool", "seventies": "Seventies", "pastel": "Pastel", "desert": "Desert",
         "sacred-gold": "Sacred gold"}


def _grid():
    v = np.linspace(0, 1, N)
    b, g, r = np.meshgrid(v, v, v, indexing="ij")    # .cube: red runs fastest, then green, then blue
    return np.stack([r, g, b], -1)


def write_cube(path, table, title):
    """table (N, N, N, 3) indexed [b][g][r] → a .cube file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    flat = np.clip(table, 0, 1).reshape(-1, 3)
    tmp = path.with_suffix(".part")
    with open(tmp, "w", encoding="ascii") as f:
        f.write(f'TITLE "{title}"\nLUT_3D_SIZE {table.shape[0]}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        np.savetxt(f, flat, fmt="%.6f")
    tmp.replace(path)


def make_ruach(kit, force=False):
    """The Studio's own looks into models/videographer/luts/ruach/ (made once; their curves are this file's)."""
    d = paths.at(paths.VIDEO_LUTS, kit) / "ruach"
    g = _grid()
    for key, fn in LOOKS.items():
        p = d / f"{key}.cube"
        if p.is_file() and not force:
            continue
        write_cube(p, fn(g.copy()), NAMES[key])
    return d


# ---- reading a .cube and a HaldCLUT
def read_cube(path):
    size, rows = 0, []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.upper().startswith("LUT_3D_SIZE"):
                size = int(s.split()[1])
                continue
            if s[0].isalpha():
                continue
            parts = s.split()
            if len(parts) >= 3:
                rows.append([float(parts[0]), float(parts[1]), float(parts[2])])
    if not size or len(rows) != size ** 3:
        raise ValueError(f"not a 3D .cube: {Path(path).name}")
    return np.asarray(rows, dtype=np.float32).reshape(size, size, size, 3)


def read_hald(path):
    """A HaldCLUT image (level L: L³ × L³ pixels, L² entries an axis) → (n, n, n, 3) indexed [b][g][r]."""
    from PIL import Image
    im = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    side = im.shape[0]
    level = round(side ** (1 / 3))
    if level ** 3 != side or im.shape[1] != side:
        raise ValueError(f"not a HaldCLUT: {Path(path).name}")
    n = level * level
    return im.reshape(-1, 3).reshape(n, n, n, 3)


def sample(table, rgb):
    """Trilinear: table (n, n, n, 3) [b][g][r], rgb (..., 3) in 0..1."""
    n = table.shape[0]
    x = np.clip(rgb, 0, 1) * (n - 1)
    i0 = np.floor(x).astype(int)
    i1 = np.minimum(i0 + 1, n - 1)
    f = x - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]
    r1, g1, b1 = i1[..., 0], i1[..., 1], i1[..., 2]
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]
    c = lambda b, g, r: table[b, g, r]
    c00 = c(b0, g0, r0) * (1 - fr) + c(b0, g0, r1) * fr
    c01 = c(b0, g1, r0) * (1 - fr) + c(b0, g1, r1) * fr
    c10 = c(b1, g0, r0) * (1 - fr) + c(b1, g0, r1) * fr
    c11 = c(b1, g1, r0) * (1 - fr) + c(b1, g1, r1) * fr
    c0 = c00 * (1 - fg) + c01 * fg
    c1 = c10 * (1 - fg) + c11 * fg
    return c0 * (1 - fb) + c1 * fb


# ---- the shelf
def _rel_name(rel):
    stem = Path(rel).stem
    stem = re.sub(r"[_]+", " ", stem)
    return stem.strip()


def shelf(kit):
    kit = Path(kit)
    make_ruach(kit)
    out = []
    for key in LOOKS:
        out.append({"id": f"ruach:{key}.cube", "name": NAMES[key], "pack": "ruach", "group": "", "kind": "cube"})
    film = paths.at(paths.VIDEO_LUTS, kit) / "rawtherapee"
    if film.is_dir():
        for p in sorted(film.rglob("*.png")):
            rel = p.relative_to(film).as_posix()
            g = p.parent.relative_to(film).as_posix()
            out.append({"id": f"rawtherapee:{rel}", "name": _rel_name(rel), "pack": "rawtherapee", "group": "" if g == "." else g, "kind": "hald"})
    mine = kit / "user/luts"
    if mine.is_dir():
        for p in sorted(list(mine.rglob("*.cube")) + list(mine.rglob("*.png"))):
            rel = p.relative_to(mine).as_posix()
            g = p.parent.relative_to(mine).as_posix()
            out.append({"id": f"user:{rel}", "name": _rel_name(rel), "pack": "user", "group": "" if g == "." else g, "kind": "cube" if p.suffix == ".cube" else "hald"})
    packs = [dict(PACKS[k], id=k, present=(k == "ruach" or (k == "rawtherapee" and film.is_dir()) or (k == "user" and mine.is_dir()))) for k in PACKS]
    return {"luts": out, "packs": packs, "fetch": dict(_fetch)}


def _where(kit, lid):
    kit = Path(kit)
    pack, _, rel = str(lid).partition(":")
    base = {"ruach": paths.at(paths.VIDEO_LUTS, kit) / "ruach", "rawtherapee": paths.at(paths.VIDEO_LUTS, kit) / "rawtherapee", "user": kit / "user/luts"}.get(pack)
    if not base or not rel or ".." in Path(rel).parts or rel.startswith("/"):
        raise ValueError(f"no look {lid!r}")
    p = (base / rel).resolve()
    if not str(p).startswith(str(base.resolve()) + os.sep) or not p.is_file():
        raise ValueError(f"no look {lid!r}")
    return p


def cube(kit, lid):
    """The .cube ffmpeg reads for a look: the file itself, or a HaldCLUT turned into a 33³ .cube once (cache/luts/)."""
    if str(lid).startswith("ruach:"):
        make_ruach(kit)
    p = _where(kit, lid)
    if p.suffix.lower() == ".cube":
        return p
    h = hashlib.sha1(f"{p}:{p.stat().st_mtime_ns}".encode()).hexdigest()[:16]
    out = Path(kit) / "cache/luts" / f"{h}.cube"
    if not out.is_file():
        write_cube(out, sample(read_hald(p), _grid()), p.stem)
    return out


def _table(kit, lid):
    p = cube(kit, lid)
    return read_cube(p)


def test_card(w=480, h=270):
    """A picture to try a look on when a take has no cover: a sky, skin tones, foliage, a grey ramp."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.zeros((h, w, 3), np.float32)
    img[..., 0] = 0.35 + 0.4 * (y / h)
    img[..., 1] = 0.5 + 0.2 * (y / h)
    img[..., 2] = 0.85 - 0.3 * (y / h)
    sw = [(0.87, 0.67, 0.55), (0.72, 0.5, 0.38), (0.45, 0.3, 0.22), (0.25, 0.45, 0.2), (0.75, 0.15, 0.12), (0.95, 0.85, 0.3)]
    for i, col in enumerate(sw):
        img[int(h * 0.55):int(h * 0.85), int(w * (0.04 + i * 0.16)):int(w * (0.16 + i * 0.16))] = col
    img[int(h * 0.9):, :] = (x[int(h * 0.9):, :, None] / w)
    return img


def _ppath(kit, lid, src, s, width):
    key = hashlib.sha1(f"{lid}|{src}|{Path(src).stat().st_mtime_ns if src and Path(src).is_file() else 0}|{s:.2f}|{width}".encode()).hexdigest()[:20]
    return Path(kit) / "cache/luts/preview" / f"{key}.jpg"


def preview_path(kit, lid, src=None, strength=1.0, width=320):
    """preview() made (or found) on disk: its path, for the lab to send as a file."""
    preview(kit, lid, src, strength, width)
    return _ppath(kit, lid, src, max(0.0, min(1.0, float(strength))), width)


def preview(kit, lid, src=None, strength=1.0, width=320):
    """A JPEG of a picture through a look (the take's cover, else a test card), cached by the look, the picture and the strength."""
    from PIL import Image
    kit = Path(kit)
    s = max(0.0, min(1.0, float(strength)))
    out = _ppath(kit, lid, src, s, width)
    if out.is_file():
        return out.read_bytes()
    if src and Path(src).is_file():
        im = Image.open(src).convert("RGB")
        im.thumbnail((width, width * 2))
        a = np.asarray(im, dtype=np.float32) / 255.0
    else:
        a = test_card(width, round(width * 9 / 16))
    if lid and lid != "none":
        t = _table(kit, lid)
        a = a * (1 - s) + sample(t, a) * s
    buf = io.BytesIO()
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)).save(buf, "JPEG", quality=86)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(buf.getvalue())
    return buf.getvalue()


def film_vf(grain=0.0, vignette=0.0, halation=0.0, jitter=0.0, w=1920, h=1080):
    """HERESY 2017 (from Resolve: the film over the picture): a vignette (ffmpeg's vignette, its lens angle 0.2–0.9 rad; ffmpeg's own is π/5) and a grain
    that moves (ffmpeg's noise on the luma, a new pattern each frame, up to 28), each from 0 to 1, laid after the look. None when all are 0.
    HERESY 2242 (the note of 02.11.2026, §2 item 4): halation, the red glow film lays round its brightest lights (the highlights above 72 % lifted
    out, blurred by 0.6–1.8 % of the frame's height, turned red-orange and screened back over at 25–85 %), and jitter, the gate's gentle weave
    (the frame drifting up to 0.45 % of its height on two slow sines a side with a breath of tremor, cropped and scaled back to w × h). The order:
    the weave, the glow, the lens, the grain."""
    g = max(0.0, min(1.0, float(grain or 0)))
    v = max(0.0, min(1.0, float(vignette or 0)))
    hl = max(0.0, min(1.0, float(halation or 0)))
    j = max(0.0, min(1.0, float(jitter or 0)))
    out = []
    if j > 0.001:
        a = max(1, round(h * 0.0045 * j))
        out.append(f"crop=iw-{2 * a}:ih-{2 * a}:{a}+{a}*(0.5*sin(2*PI*t*0.7)+0.3*sin(2*PI*t*2.3+1.3)+0.2*(2*random(1)-1))"
                   f":{a}+{a}*(0.5*sin(2*PI*t*0.53+2)+0.3*sin(2*PI*t*1.9)+0.2*(2*random(2)-1)),scale={w}:{h}")
    if hl > 0.001:
        sigma = max(2.0, h * (0.006 + 0.012 * hl))
        out.append(f"format=gbrp,split[hl0][hl1];[hl1]colorlevels=rimin=0.72:gimin=0.72:bimin=0.72,gblur=sigma={sigma:.1f},"
                   f"colorchannelmixer=rr=1:gg=0.32:bb=0.12[hl2];[hl0][hl2]blend=all_mode=screen:all_opacity={0.25 + 0.6 * hl:.3f},format=yuv420p")
    if v > 0.001:
        out.append(f"vignette=angle={0.2 + 0.7 * v:.3f}")
    if g > 0.001:
        out.append(f"noise=c0s={max(1, round(28 * g))}:c0f=t+u")
    return ",".join(out) or None


def primary_vf(lift=0.0, gamma=0.0, gain=0.0, contrast=0.0, saturation=0.0):
    """HERESY 2250 (the note of 02.11.2026, §2 item 3; Resolve's primaries): the picture's own correction before the look, each −1…1 and 0 as it is:
    lift raises or lowers the blacks (±0.15), gamma bends the middle (×2 or ½), gain the whites (×1.5 or ⅔), the blacks held; contrast round the
    middle grey (×1.6 or ⅝), saturation from grey (0) to twice. ffmpeg's lutrgb and eq; None when all are 0."""
    v = [max(-1.0, min(1.0, float(x or 0))) for x in (lift, gamma, gain, contrast, saturation)]
    if all(abs(x) < 0.005 for x in v):
        return None
    lo, gm, gn = 0.15 * v[0], 2.0 ** v[1], 1.5 ** v[2]
    out = []
    if abs(v[0]) >= 0.005 or abs(v[1]) >= 0.005 or abs(v[2]) >= 0.005:
        e = f"clip(255*pow(clip(val/255*({gn:.4f}-({lo:.4f}))+({lo:.4f}),0,1),{1 / gm:.4f}),0,255)"
        out.append("lutrgb=" + ":".join(f"{c}='{e}'" for c in "rgb"))
    if abs(v[3]) >= 0.005 or abs(v[4]) >= 0.005:
        out.append(f"eq=contrast={1.6 ** v[3]:.4f}:saturation={1 + v[4]:.4f}")
    return ",".join(out)


def vf(kit, lid, strength, workdir):
    """The clip's last pass: the look over the picture as a filter graph (the .cube copied into the job's folder as look.cube, so no path needs
    escaping), its strength by a blend over the picture as it was. None when no look."""
    if not lid or lid == "none":
        return None
    s = max(0.0, min(1.0, float(strength if strength is not None else 1.0)))
    if s <= 0.0:
        return None
    shutil.copyfile(cube(kit, lid), Path(workdir) / "look.cube")
    if s >= 0.999:
        return "lut3d=file=look.cube:interp=tetrahedral"
    return f"split[lo][lb];[lb]lut3d=file=look.cube:interp=tetrahedral[lc];[lc][lo]blend=all_mode=normal:all_opacity={s:.3f}"


# ---- the film pack, fetched on asking
def fetch(kit, url=FILM_URL):
    """The RawTherapee Film Simulation Collection into models/videographer/luts/rawtherapee/ (a job: fetch_state())."""
    with _lock:
        if _fetch["state"] == "running":
            return dict(_fetch)
        _fetch.update(state="running", done=0, error="", started=time.time())
    kit = Path(kit)

    def work():
        part = paths.at(paths.VIDEO_LUTS, kit) / "rawtherapee.zip.part"
        dest = paths.at(paths.VIDEO_LUTS, kit) / "rawtherapee"
        try:
            part.parent.mkdir(parents=True, exist_ok=True)
            p = subprocess.Popen(["curl", "-fL", "--retry", "3", "-s", "-o", str(part), url])
            while p.poll() is None:
                time.sleep(1)
                _fetch["done"] = part.stat().st_size if part.exists() else 0
            if p.returncode != 0:
                raise RuntimeError(f"the download stopped (curl {p.returncode})")
            tmp = dest.with_name("rawtherapee.part")
            shutil.rmtree(tmp, ignore_errors=True)
            with zipfile.ZipFile(part) as z:
                for m in z.infolist():
                    name = m.filename
                    if m.is_dir() or ".." in Path(name).parts or name.startswith("/"):
                        continue
                    low = name.lower()
                    if not (low.endswith(".png") or "licen" in low or low.endswith(".txt") or low.endswith(".md")):
                        continue
                    target = tmp / Path(*Path(name).parts[1:]) if len(Path(name).parts) > 1 else tmp / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(m) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
            (tmp / "SOURCE.json").write_text(json.dumps({"url": url, "licence": "CC BY-SA 4.0", "authors": PACKS["rawtherapee"]["author"],
                                                         "fetched": time.strftime("%Y-%m-%d %H:%M")}, indent=1), encoding="utf-8")
            if dest.exists():
                shutil.rmtree(dest)
            tmp.rename(dest)
            part.unlink(missing_ok=True)
            _fetch.update(state="done", done=_fetch.get("total", 0))
        except Exception as e:  # noqa: BLE001 — said on the window, not swallowed
            _fetch.update(state="failed", error=str(e)[:300])

    threading.Thread(target=work, daemon=True).start()
    return dict(_fetch)


def fetch_state():
    return dict(_fetch)
