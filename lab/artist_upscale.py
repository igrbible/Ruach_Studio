"""HERESY 1169 · 1322: the Artist's upscale (Viktor 10.10.2026: «В ~/Documents/AI/DIFFUSION_MODELS_etc у меня дохерища всего, что я
скачивал за многие годы для ComfyUI. И модели апскейлеров… 637GB золота»; his ComfyUI workflow's upscale stack: 4x_Nomos8kDAT,
Remacri, UltraMix): a picture of a run made 2 or 4 times as large by one of the models in artwork/upscalers/ (ESRGAN, DAT, ATD, HAT,
SPAN, OmniSR…, read by spandrel, MIT, whose loader unpickles only what a model is made of), in tiles of 512 with 32 of overlap, each
tile's middle kept; a 4x model asked for 2x paints at 4x and is brought down (Lanczos), finer than a 2x model. Its run is a new one
whose one picture is the large one.

    CUDA_VISIBLE_DEVICES=N ART_PAINTER=upscale .venv-art/bin/python lab/artist_job.py RUN_DIR

RUN_DIR/ask.json: {"source": {"id", "file"}, "model": NAME, "factor": 2|4}.

HERESY 1355 (Viktor 11.10.2026: «можно ли двух-трёх проходный апскейл делать наподобие того, как у меня в ComfyUI workflow?»): passes, as his
AIO QWEN IMAGE 2512 HERESY workflow's CR Multi Upscale Stack and CR Apply Multi Upscale do them: {"passes": [{"model", "factor"}…]}, each pass
running its model over the picture as it stands and bringing the result to the source's size × its factor (each factor the source's, not
the pass before's: 4x_Nomos8kDAT ×4, then Remacri ×1.5 runs over the ×4 and lands at ×1.5); "resample" brings it there (bilinear, his
choice; lanczos, bicubic); "long" the long side after the passes (his DF_Image_scale_to_side 7680, Lanczos); "match" the colours put back
to the picture's (his ColorMatch hm-mvgd-hm: histograms, then the colours' mean and spread, then histograms again). Comfyroll's 8×
supersampling before each resize is left out: a downscale by PIL's filters (support scaled to the reduction) already averages every
pixel it covers. A pass whose model would make more than CAP_PX pixels has its input brought down first, and says so."""
import json, math, re, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import art_job  # noqa: E402

KIT = art_job.KIT
UPSCALERS = KIT / "artwork" / "upscalers"
TILE, OVERLAP, THUMB = 512, 32, 512
CAP_PX = 600 * 10 ** 6                                  # HERESY 1355: the most a pass's model may make (1.8 GB as 8-bit RGB)
RESAMPLE = {"bilinear": 2, "lanczos": 1, "bicubic": 3}  # PIL's filters by name
INFO = {}
try:                                                     # HERESY 1355: what each upscaler is for, measured here (lab/upscalers.json)
    with open(HERE / "upscalers.json", encoding="utf-8") as _f:
        INFO = json.load(_f).get("models") or {}
except (OSError, ValueError):
    pass


def models():
    """The upscalers here: [{name, scale (by its name's 1x/2x/4x/8x, else 4), mb}] (a face restorer like GFPGAN is not one)."""
    out = []
    if UPSCALERS.is_dir():
        for p in sorted(UPSCALERS.rglob("*")):
            if p.suffix.lower() not in (".pth", ".safetensors") or not p.is_file() or re.search(r"gfpgan|codeformer|restoreformer", p.name, re.I):
                continue
            m = re.match(r"^(\d)x", p.name, re.I)
            e = {"name": p.relative_to(UPSCALERS).as_posix(), "scale": int(m.group(1)) if m else 4, "mb": round(p.stat().st_size / 2 ** 20, 1)}
            if p.name in INFO:                       # HERESY 1355: its notes
                e["info"] = INFO[p.name]
                e["scale"] = int(INFO[p.name].get("scale") or e["scale"])
            out.append(e)
    return out


def model_path(name):
    name = str(name or "").replace("\\", "/").strip("/")
    p = UPSCALERS / name
    if not name or ".." in name.split("/") or not p.is_file():
        raise RuntimeError(f"no such upscaler in artwork/upscalers/: {name}")
    return p


def upscale(img, path, factor, device="cuda", size=None, tta=False, loaded=None):
    """The picture through the model in tiles, brought to factor × its size, or to size (W, H) exactly, the model run again while
    its result is still smaller (twice at most): (the picture, the model's own scale, its kind). HERESY 1364: tta, each tile in its eight
    orientations; loaded, the (model, precision) a batch loaded once."""
    import numpy as np
    import torch
    from PIL import Image
    from spandrel import ModelLoader
    md, dtype = loaded or load(path, device)
    s = md.scale
    if size:                                           # HERESY 1332: as many passes as the size needs
        cur = img.convert("RGB")
        passes = 1 if s <= 1 or max(cur.size) * s >= max(size) else 2   # a 1x model (a restorer) once, then the size by Lanczos
        for _ in range(passes):
            cur = _through(md, cur, s, dtype, device, tta)
        return cur.resize(tuple(size), Image.LANCZOS), s, md.architecture.name if hasattr(md, "architecture") else type(md.model).__name__
    big = _through(md, img.convert("RGB"), s, dtype, device, tta)
    W, H = img.size
    if s != factor:
        big = big.resize((W * factor, H * factor), Image.LANCZOS)
    return big, s, md.architecture.name if hasattr(md, "architecture") else type(md.model).__name__


def load(path, device="cuda"):
    """The model and the precision it runs in: half where it holds, else bfloat16, else float32, tried on a small tile first. HERESY 1355:
    ATD says it takes bfloat16 and fails in it («expected scalar type Float but found BFloat16», 4x_Nomos8k_atd_jpg, measured 11.10.2026)."""
    import torch
    from spandrel import ModelLoader
    md = ModelLoader(device=device).load_from_file(str(path))
    md.eval()
    for dtype in [d for d in (torch.float16 if md.supports_half else None, torch.bfloat16 if md.supports_bfloat16 else None, torch.float32) if d is not None]:
        md.model.to(dtype)
        try:
            with torch.inference_mode():
                md(torch.zeros(1, 3, 64, 64, device=device, dtype=dtype))
            return md, dtype
        except RuntimeError:
            continue
    md.model.to(torch.float32)
    return md, torch.float32


def _tta(md, t):
    """HERESY 1364 (from Upscayl's TTA): the tile in its eight orientations (four turns, each mirrored) through the model, each result
    turned back, the eight averaged: steadier edges and textures, eight times the time."""
    import torch
    acc = None
    for flip in (False, True):
        a = torch.flip(t, dims=[3]) if flip else t
        for k in range(4):
            r = torch.rot90(md(torch.rot90(a, k, dims=[2, 3])).float(), -k, dims=[2, 3])
            r = torch.flip(r, dims=[3]) if flip else r
            acc = r if acc is None else acc + r
    return acc / 8


def _through(md, img, s, dtype, device, tta=False):
    """One pass of the model over the picture in tiles of TILE with OVERLAP, each tile's middle kept (HERESY 1364: tta, each tile in its
    eight orientations, averaged)."""
    import numpy as np
    import torch
    from PIL import Image
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    H, W = a.shape[:2]
    out = np.zeros((H * s, W * s, 3), dtype=np.uint8)       # HERESY 1355: 8-bit as it comes, the same rounding as before
    step = TILE - 2 * OVERLAP
    # HERESY 1371: where the pass is, on stderr, five seconds apart at most and at its last tile: the lab's watchdog (1340) hears a long
    # pass (DAT with TTA: 24 s a tile) as alive
    n, i, t0, said = len(range(0, H, step)) * len(range(0, W, step)), 0, time.time(), time.time()
    with torch.inference_mode():
        for y in range(0, H, step):
            for x in range(0, W, step):
                i += 1
                y0, x0 = max(0, y - OVERLAP), max(0, x - OVERLAP)
                y1, x1 = min(H, y + step + OVERLAP), min(W, x + step + OVERLAP)
                t = torch.from_numpy(a[y0:y1, x0:x1]).permute(2, 0, 1)[None].to(device, dtype)
                r = (_tta(md, t) if tta else md(t))[0].float().clamp(0, 1).permute(1, 2, 0).cpu().numpy()
                cy0, cx0 = (y - y0) * s, (x - x0) * s                      # the tile's own middle, without its overlap
                cy1, cx1 = cy0 + (min(H, y + step) - y) * s, cx0 + (min(W, x + step) - x) * s
                out[y * s:min(H, y + step) * s, x * s:min(W, x + step) * s] = (r[cy0:cy1, cx0:cx1] * 255.0 + 0.5).clip(0, 255).astype(np.uint8)
                if time.time() - said >= 5 or i == n:
                    print(f"upscale · tile {i} of {n} · {(time.time() - t0) / i:.2f} s/it", file=sys.stderr, flush=True)
                    said = time.time()
    return Image.fromarray(out)


def chain(img, passes, resample="bilinear", device="cuda", say=None, tta=False):
    """HERESY 1355: the picture through its passes, CR Apply Multi Upscale's way: each pass's model over the picture as it stands, its
    result brought to the source's size × the pass's factor. Returns (the picture, [what each pass did]). HERESY 1364: tta in each pass."""
    import gc
    import torch
    from PIL import Image
    W, H = img.size
    cur, done = img.convert("RGB"), []
    for k, ps in enumerate(passes):
        path, factor = model_path(ps["model"]), float(ps["factor"])
        md, dtype = load(path, device)
        s, note = md.scale, ""
        if cur.width * s * cur.height * s > CAP_PX:      # its input brought down so the model makes CAP_PX at most
            r = math.sqrt(CAP_PX / (cur.width * s * cur.height * s))
            note = f"its input brought down from {cur.width}×{cur.height} to fit {CAP_PX // 10 ** 6} MP"
            cur = cur.resize((max(1, int(cur.width * r)), max(1, int(cur.height * r))), Image.LANCZOS)
        t0 = time.time()
        big = _through(md, cur, s, dtype, device, tta)
        size = (max(1, int(W * factor)), max(1, int(H * factor)))
        cur = big if big.size == size else big.resize(size, RESAMPLE.get(resample, 2))
        done.append({"model": path.name, "factor": factor, "scale": s, "arch": md.architecture.name, "took": round(time.time() - t0, 1), **({"note": note} if note else {})})
        if say:
            say(k + 1, len(passes), done[-1])
        del md, big
        gc.collect()
        torch.cuda.empty_cache()
    return cur, done


def match(img, ref):
    """HERESY 1355: the colours of img put back to ref's, hm-mvgd-hm as Viktor's ColorMatch does it (the color-matcher library's method):
    each channel's histogram matched, then the colours' mean and covariance carried over (Monge-Kantorovich), then the histograms again.
    The statistics from both pictures at a size of about a megapixel; the transfer over the whole picture, a band at a time."""
    import numpy as np
    from PIL import Image

    def small(im):
        k = min(1.0, math.sqrt(1e6 / (im.width * im.height)))
        return np.asarray(im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.BILINEAR), dtype=np.float32).reshape(-1, 3) / 255.0

    def hist_luts(a, b):                               # per channel: a's values onto b's distribution
        luts = []
        for c in range(3):
            av, bv = np.sort(a[:, c]), np.sort(b[:, c])
            q = np.linspace(0, 1, 256)
            luts.append(np.interp(np.interp(np.arange(256) / 255.0, av, np.linspace(0, 1, av.size)), q, np.quantile(bv, q)))
        return luts

    def sqrtm(m):
        w, v = np.linalg.eigh(m)
        return (v * np.sqrt(np.clip(w, 1e-12, None))) @ v.T

    def mvgd(a, b):                                   # the transfer x → (x - mu_a) T + mu_b
        ma, mb = a.mean(0), b.mean(0)
        ca, cb = np.cov(a, rowvar=False) + np.eye(3) * 1e-6, np.cov(b, rowvar=False) + np.eye(3) * 1e-6
        ra = sqrtm(ca)
        ra_inv = np.linalg.inv(ra)
        t = ra_inv @ sqrtm(ra @ cb @ ra) @ ra_inv
        return ma, t, mb

    src, dst = small(img), small(ref)
    l1 = hist_luts(src, dst)
    s1 = np.stack([np.interp(src[:, c], np.arange(256) / 255.0, l1[c]) for c in range(3)], 1)
    ma, t, mb = mvgd(s1, dst)
    s2 = np.clip((s1 - ma) @ t + mb, 0, 1)
    l2 = hist_luts(s2, dst)
    a = np.asarray(img.convert("RGB"))
    out = np.empty_like(a)
    for y in range(0, a.shape[0], 512):                # a band at a time: a 7680-wide picture without a float copy of it all
        x = a[y:y + 512].reshape(-1, 3).astype(np.float32) / 255.0
        x = np.stack([np.interp(x[:, c], np.arange(256) / 255.0, l1[c]) for c in range(3)], 1)
        x = np.clip((x - ma) @ t + mb, 0, 1)
        x = np.stack([np.interp(x[:, c], np.arange(256) / 255.0, l2[c]) for c in range(3)], 1)
        out[y:y + 512] = (x * 255.0 + 0.5).clip(0, 255).astype(np.uint8).reshape(a[y:y + 512].shape)
    return Image.fromarray(out)


def main(run, ask):
    from PIL import Image
    t0 = time.time()
    if ask.get("sources"):                           # HERESY 1364: the pictures picked, in one run
        return _main_batch(run, ask, t0)
    src = ask.get("source") or {}
    p = KIT / "artist" / str(src.get("id") or "") / str(src.get("file") or "")
    if not p.is_file():
        raise RuntimeError("the picture to upscale is not here any more")
    img = Image.open(p).convert("RGB")
    (run / "thumbs").mkdir(exist_ok=True)
    t1 = time.time()
    shape = str(ask.get("shape") or "1:1")
    if ask.get("passes"):                            # HERESY 1355: in passes, as Viktor's ComfyUI stack
        return _main_chain(run, ask, img, src, shape, t0, t1)
    factor = 4 if int(ask.get("factor") or 2) >= 4 else 2
    path = model_path(ask.get("model"))
    size = ask.get("size") if isinstance(ask.get("size"), list) and len(ask["size"]) == 2 else None
    big, s, arch = upscale(img, path, factor, size=size, tta=bool(ask.get("tta")))
    tail = str(ask.get("target") or "").lower() if size else f"{factor}x"   # HERESY 1332: -up2k, -up4k
    name = f"01-{shape.replace(':', 'x')}-s{int(ask.get('seed') or 0)}-up{tail}"
    big.save(run / (name + ".png"))
    small = big.copy()
    small.thumbnail((THUMB, THUMB), resample=3)
    small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
    print(json.dumps({"n": 1, "shape": shape, "seed": int(ask.get("seed") or 0), "w": big.width, "h": big.height, "nsfw": None, "took": round(time.time() - t1, 1),
                      "kept": True, "file": name + ".png", "thumb": "thumbs/" + name + ".jpg", "upscaled": {"from": src, "model": path.name, "scale": s, "arch": arch, "factor": factor, "target": ask.get("target") or ""}}), flush=True)
    print(json.dumps({"done": True, "painter": "upscale", "took": round(time.time() - t0, 1)}), flush=True)


def _main_chain(run, ask, img, src, shape, t0, t1):
    """HERESY 1355: an upscale in passes, its picture and its line (what each pass did, the colours matched, the long side)."""
    from PIL import Image

    def say(k, of, d):
        print(json.dumps({"chain": {"k": k, "of": of, "model": d["model"], "factor": d["factor"], "took": d["took"]}}), flush=True)
    big, done = chain(img, ask["passes"], ask.get("resample") or "bilinear", say=say, tta=bool(ask.get("tta")))
    long = int(ask.get("long") or 0)
    if long and max(big.size) != long:                # his DF_Image_scale_to_side: the long side, Lanczos
        k = long / max(big.size)
        big = big.resize((max(1, round(big.width * k)), max(1, round(big.height * k))), Image.LANCZOS)
    if ask.get("match"):
        big = match(big, img)
    name = f"01-{shape.replace(':', 'x')}-s{int(ask.get('seed') or 0)}-up{len(done)}p"
    big.save(run / (name + ".png"))
    small = big.copy()
    small.thumbnail((THUMB, THUMB), resample=3)
    small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
    print(json.dumps({"n": 1, "shape": shape, "seed": int(ask.get("seed") or 0), "w": big.width, "h": big.height, "nsfw": None, "took": round(time.time() - t1, 1),
                      "kept": True, "file": name + ".png", "thumb": "thumbs/" + name + ".jpg",
                      "upscaled": {"from": src, "passes": done, "resample": ask.get("resample") or "bilinear", "long": long or None, "match": bool(ask.get("match"))}}), flush=True)
    print(json.dumps({"done": True, "painter": "upscale", "took": round(time.time() - t0, 1)}), flush=True)


def _main_batch(run, ask, t0):
    """HERESY 1364 (from Upscayl's batch): the pictures picked, each upscaled as one would be (a model to 2K or 4K or ×2/×4, or the passes),
    their pictures in the run's order (01-…, 02-…); a model of one pass loaded once for them all. ART_ONLY: the numbers this card does."""
    import gc
    import os
    import torch
    from PIL import Image
    only = {int(x) for x in os.environ.get("ART_ONLY", "").split(",") if x.strip().isdigit()}
    (run / "thumbs").mkdir(exist_ok=True)
    tta = bool(ask.get("tta"))
    loaded = load(model_path(ask.get("model"))) if not ask.get("passes") else None
    for k, src in enumerate(ask["sources"], 1):
        if only and k not in only:
            continue
        t1 = time.time()
        p = KIT / "artist" / str(src.get("id") or "") / str(src.get("file") or "")
        shape, seed = str(src.get("shape") or "1:1"), int(src.get("seed") or 0)
        if not p.is_file():
            print(json.dumps({"n": k, "shape": shape, "seed": seed, "kept": False, "why": "the picture to upscale is not here any more"}), flush=True)
            continue
        img = Image.open(p).convert("RGB")
        if ask.get("passes"):
            big, done = chain(img, ask["passes"], ask.get("resample") or "bilinear", tta=tta)
            long = int(ask.get("long") or 0)
            if long and max(big.size) != long:
                f = long / max(big.size)
                big = big.resize((max(1, round(big.width * f)), max(1, round(big.height * f))), Image.LANCZOS)
            if ask.get("match"):
                big = match(big, img)
            tail, up = f"{len(done)}p", {"passes": done, "resample": ask.get("resample") or "bilinear", "long": long or None, "match": bool(ask.get("match"))}
        else:
            path = model_path(ask.get("model"))
            size = src.get("size") if isinstance(src.get("size"), list) and len(src["size"]) == 2 else None
            factor = 4 if int(ask.get("factor") or 2) >= 4 else 2
            big, s, arch = upscale(img, path, factor, size=size, tta=tta, loaded=loaded)
            tail = str(ask.get("target") or "").lower() if size else f"{factor}x"
            up = {"model": path.name, "scale": s, "arch": arch, "factor": factor, "target": ask.get("target") or ""}
        name = f"{k:02d}-{shape.replace(':', 'x')}-s{seed}-up{tail}"
        big.save(run / (name + ".png"))
        small = big.copy()
        small.thumbnail((THUMB, THUMB), resample=3)
        small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
        print(json.dumps({"n": k, "shape": shape, "seed": seed, "w": big.width, "h": big.height, "nsfw": None, "took": round(time.time() - t1, 1),
                          "kept": True, "file": name + ".png", "thumb": "thumbs/" + name + ".jpg",
                          "upscaled": dict(up, **{"from": {"id": src.get("id"), "file": src.get("file")}, "tta": tta})}), flush=True)
        del img, big, small
        gc.collect()
    del loaded
    torch.cuda.empty_cache()
    print(json.dumps({"done": True, "painter": "upscale", "took": round(time.time() - t0, 1)}), flush=True)
