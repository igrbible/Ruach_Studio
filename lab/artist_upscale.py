"""HERESY 1169 · 1322: the Artist's upscale (Viktor 10.10.2026: «В ~/Documents/AI/DIFFUSION_MODELS_etc у меня дохерища всего, что я
скачивал за многие годы для ComfyUI. И модели апскейлеров… 637GB золота»; his ComfyUI workflow's upscale stack: 4x_Nomos8kDAT,
Remacri, UltraMix): a picture of a run made 2 or 4 times as large by one of the models in artwork/upscalers/ (ESRGAN, DAT, ATD, HAT,
SPAN, OmniSR…, read by spandrel, MIT, whose loader unpickles only what a model is made of), in tiles of 512 with 32 of overlap, each
tile's middle kept; a 4x model asked for 2x paints at 4x and is brought down (Lanczos), finer than a 2x model. Its run is a new one
whose one picture is the large one.

    CUDA_VISIBLE_DEVICES=N ART_PAINTER=upscale .venv-art/bin/python lab/artist_job.py RUN_DIR

RUN_DIR/ask.json: {"source": {"id", "file"}, "model": NAME, "factor": 2|4}."""
import json, re, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import art_job  # noqa: E402

KIT = art_job.KIT
UPSCALERS = KIT / "artwork" / "upscalers"
TILE, OVERLAP, THUMB = 512, 32, 512


def models():
    """The upscalers here: [{name, scale (by its name's 1x/2x/4x/8x, else 4), mb}] (a face restorer like GFPGAN is not one)."""
    out = []
    if UPSCALERS.is_dir():
        for p in sorted(UPSCALERS.rglob("*")):
            if p.suffix.lower() not in (".pth", ".safetensors") or not p.is_file() or re.search(r"gfpgan|codeformer|restoreformer", p.name, re.I):
                continue
            m = re.match(r"^(\d)x", p.name, re.I)
            out.append({"name": p.relative_to(UPSCALERS).as_posix(), "scale": int(m.group(1)) if m else 4, "mb": round(p.stat().st_size / 2 ** 20, 1)})
    return out


def model_path(name):
    name = str(name or "").replace("\\", "/").strip("/")
    p = UPSCALERS / name
    if not name or ".." in name.split("/") or not p.is_file():
        raise RuntimeError(f"no such upscaler in artwork/upscalers/: {name}")
    return p


def upscale(img, path, factor, device="cuda", size=None):
    """The picture through the model in tiles, brought to factor × its size, or to size (W, H) exactly, the model run again while
    its result is still smaller (twice at most): (the picture, the model's own scale, its kind)."""
    import numpy as np
    import torch
    from PIL import Image
    from spandrel import ModelLoader
    md = ModelLoader(device=device).load_from_file(str(path))
    md.eval()
    dtype = torch.float16 if md.supports_half else torch.bfloat16 if md.supports_bfloat16 else torch.float32
    md.model.to(dtype)
    s = md.scale
    if size:                                           # HERESY 1332: as many passes as the size needs
        cur = img.convert("RGB")
        passes = 1 if s <= 1 or max(cur.size) * s >= max(size) else 2   # a 1x model (a restorer) once, then the size by Lanczos
        for _ in range(passes):
            cur = _through(md, cur, s, dtype, device)
        return cur.resize(tuple(size), Image.LANCZOS), s, md.architecture.name if hasattr(md, "architecture") else type(md.model).__name__
    big = _through(md, img.convert("RGB"), s, dtype, device)
    W, H = img.size
    if s != factor:
        big = big.resize((W * factor, H * factor), Image.LANCZOS)
    return big, s, md.architecture.name if hasattr(md, "architecture") else type(md.model).__name__


def _through(md, img, s, dtype, device):
    """One pass of the model over the picture in tiles of TILE with OVERLAP, each tile's middle kept."""
    import numpy as np
    import torch
    from PIL import Image
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    H, W = a.shape[:2]
    out = np.zeros((H * s, W * s, 3), dtype=np.float32)
    step = TILE - 2 * OVERLAP
    with torch.inference_mode():
        for y in range(0, H, step):
            for x in range(0, W, step):
                y0, x0 = max(0, y - OVERLAP), max(0, x - OVERLAP)
                y1, x1 = min(H, y + step + OVERLAP), min(W, x + step + OVERLAP)
                t = torch.from_numpy(a[y0:y1, x0:x1]).permute(2, 0, 1)[None].to(device, dtype)
                r = md(t)[0].float().clamp(0, 1).permute(1, 2, 0).cpu().numpy()
                cy0, cx0 = (y - y0) * s, (x - x0) * s                      # the tile's own middle, without its overlap
                cy1, cx1 = cy0 + (min(H, y + step) - y) * s, cx0 + (min(W, x + step) - x) * s
                out[y * s:min(H, y + step) * s, x * s:min(W, x + step) * s] = r[cy0:cy1, cx0:cx1]
    return Image.fromarray((out * 255.0 + 0.5).clip(0, 255).astype(np.uint8))


def main(run, ask):
    from PIL import Image
    t0 = time.time()
    src = ask.get("source") or {}
    p = KIT / "artist" / str(src.get("id") or "") / str(src.get("file") or "")
    if not p.is_file():
        raise RuntimeError("the picture to upscale is not here any more")
    factor = 4 if int(ask.get("factor") or 2) >= 4 else 2
    path = model_path(ask.get("model"))
    img = Image.open(p).convert("RGB")
    (run / "thumbs").mkdir(exist_ok=True)
    t1 = time.time()
    size = ask.get("size") if isinstance(ask.get("size"), list) and len(ask["size"]) == 2 else None
    big, s, arch = upscale(img, path, factor, size=size)
    shape = str(ask.get("shape") or "1:1")
    tail = str(ask.get("target") or "").lower() if size else f"{factor}x"   # HERESY 1332: -up2k, -up4k
    name = f"01-{shape.replace(':', 'x')}-s{int(ask.get('seed') or 0)}-up{tail}"
    big.save(run / (name + ".png"))
    small = big.copy()
    small.thumbnail((THUMB, THUMB), resample=3)
    small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
    print(json.dumps({"n": 1, "shape": shape, "seed": int(ask.get("seed") or 0), "w": big.width, "h": big.height, "nsfw": None, "took": round(time.time() - t1, 1),
                      "kept": True, "file": name + ".png", "thumb": "thumbs/" + name + ".jpg", "upscaled": {"from": src, "model": path.name, "scale": s, "arch": arch, "factor": factor, "target": ask.get("target") or ""}}), flush=True)
    print(json.dumps({"done": True, "painter": "upscale", "took": round(time.time() - t0, 1)}), flush=True)
