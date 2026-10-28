"""HERESY 1169 · 1255: the Artist room's painter (lab/artist.py runs it in .venv-art). The painter (Qwen-Image; Krea 2 Muse
until 1428) once for a run, the prompt read once, then every variation in every shape asked for, each picture through the
content filter (the studio's rule for every painter: a flagged picture is not kept, and its line says so). A shape is drawn at multiples of 16 and cut
to its size from the middle; the VAE decodes in tiles (measured 08.10.2026 on an RTX 3090, Krea 2 Muse Q8: 1920×1088
peaks at 16.9 GB so and 22.7 GB at once, in the same 46 s).

    CUDA_VISIBLE_DEVICES=N ART_PAINTER=qwen2512-q4|qwen2512-q6|qwen2512-fp8|qwen21|qwen21-fp8 .venv-art/bin/python lab/artist_job.py RUN_DIR

RUN_DIR/ask.json: {"prompt", "shapes": ["1:1", "16:9", "9:16"], "seed", "count", "preview"}; HERESY 1305: "ref" (a picture
beside it to paint from) and "strength" (0.2 to 1.0: how much the painting may change it). On stdout, as each picture is
drawn, one JSON line ({"n", "shape", "seed", "w", "h", "nsfw", "took", "kept", "file", "thumb"}); with "preview" (HERESY 1257)
a line at every step too ({"live": n, "step", "of", "file": "preview/NN.jpg"}); the last line the run's ({"done": true,
"painter", "took"}). HERESY 1370: ART_SERVE=1 without RUN_DIR serves runs one by one from stdin (serve()), the painter kept
between them."""
import copy, json, os, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
ONLY = {int(x) for x in os.environ.get("ART_ONLY", "").split(",") if x.strip().isdigit()}   # HERESY 1354: this card's pictures of the run
import art_job  # noqa: E402
SERVE = os.environ.get("ART_SERVE") == "1"           # HERESY 1370: a painter kept between runs (serve())
KEPT = art_job.KEPT                                  # HERESY 1370: what this process keeps, one dict with artist_qwen's

# a shape: (drawn at, kept at); Krea 2 takes multiples of 16
SHAPES = {"1:1": ((1280, 1280), (1280, 1280)), "16:9": ((1920, 1088), (1920, 1080)), "9:16": ((1088, 1920), (1080, 1920))}
THUMB = 512
# HERESY 1257 (Viktor 08.10.2026: «живую проявку с латентного шума до готовой картинки, чтобы пользователь мог следить за
# процессом? В InvokeAI можно либо выключить, либо включить»): each step's latents seen as a picture an eighth the size, without
# the VAE: the Wan 2.1 VAE's latent-to-RGB factors (Krea 2 decodes with it), as InvokeAI carries them (Apache-2.0,
# invokeai/backend/architectures/facets/latent_space.py, WAN21_LATENT_RGB_FACTORS)
RGB_FACTORS = [
    [-0.1299, -0.1692, 0.2932], [0.0671, 0.0406, 0.0442], [0.3568, 0.2548, 0.1747], [0.0372, 0.2344, 0.1420],
    [0.0313, 0.0189, -0.0328], [0.0296, -0.0956, -0.0665], [-0.3477, -0.4059, -0.2925], [0.0166, 0.1902, 0.1975],
    [-0.0412, 0.0267, -0.1364], [-0.1293, 0.0740, 0.1636], [0.0680, 0.3019, 0.1128], [0.0032, 0.0581, 0.0639],
    [-0.1251, 0.0927, 0.1699], [0.0060, -0.0633, 0.0005], [0.3477, 0.2275, 0.2950], [0.1984, 0.0913, 0.1861],
]
RGB_BIAS = [-0.1835, -0.0868, -0.3360]


def live(run, n, gw, gh, w, h):
    """A step's picture: the packed latents unpacked, projected to RGB, cut to the shape, saved over the last one."""
    import torch
    from PIL import Image
    (run / "preview").mkdir(exist_ok=True)
    out = run / "preview" / f"{n:02d}.jpg"

    def step(pipe, i, t, kw):
        x = pipe._unpack_latents(kw["latents"], gh, gw)[0, :, 0].float()            # 16 × h/8 × w/8
        f = torch.tensor(RGB_FACTORS, device=x.device)
        rgb = (x.permute(1, 2, 0) @ f + torch.tensor(RGB_BIAS, device=x.device)).add(1).div(2).clamp(0, 1)
        img = Image.fromarray(rgb.mul(255).byte().cpu().numpy())
        cw, ch = round(img.width * w / gw), round(img.height * h / gh)
        img = img.crop(((img.width - cw) // 2, (img.height - ch) // 2, (img.width - cw) // 2 + cw, (img.height - ch) // 2 + ch))
        img.save(out, "JPEG", quality=85)
        print(json.dumps({"live": n, "step": i + 1, "of": pipe._num_timesteps if hasattr(pipe, "_num_timesteps") else art_job.FEW_STEPS,
                          "file": f"preview/{n:02d}.jpg"}), flush=True)
        return {}
    return step


def sized(shapes, shape, ask):
    """HERESY 1384: a shape's (drawn, kept) sizes, both times the run's scale (a second pass: 1.5 or 2), the drawn at multiples of 16."""
    (gw, gh), (w, h) = shapes[shape]
    s = float(ask.get("scale") or 1)
    if s == 1:
        return (gw, gh), (w, h)
    return (int(round(gw * s / 16)) * 16, int(round(gh * s / 16)) * 16), (round(w * s), round(h * s))


def ref_rs(ask):
    """HERESY 1384: how the reference is brought to the drawn size: nearest for a second pass (as Viktor's workflow: nearest-exact),
    else None (Lanczos)."""
    from PIL import Image
    return Image.NEAREST if ask.get("ref_resample") == "nearest" else None


def ref_latents(pipe, ref, gw, gh, resample=None):
    """HERESY 1305: the reference as Krea 2's packed latents for a shape: covered and cut from the middle to the drawn size, through
    the VAE (the Wan 2.1 VAE: a frame of one), normalized as the pipeline decodes (latents · std + mean). HERESY 1384: resample,
    how it is brought there (Lanczos by default)."""
    import torch
    from PIL import Image
    s = min(ref.width / gw, ref.height / gh)
    img = ref.resize((max(gw, round(ref.width / s)), max(gh, round(ref.height / s))), resample=resample or Image.LANCZOS)
    img = img.crop(((img.width - gw) // 2, (img.height - gh) // 2, (img.width - gw) // 2 + gw, (img.height - gh) // 2 + gh))
    x = pipe.image_processor.preprocess(img, height=gh, width=gw).to("cuda", pipe.vae.dtype).unsqueeze(2)
    with torch.no_grad():
        z = pipe.vae.encode(x).latent_dist.mode()
    zc = pipe.vae.config.z_dim
    mean = torch.tensor(pipe.vae.config.latents_mean).view(1, zc, 1, 1, 1).to(z.device, z.dtype)
    std = torch.tensor(pipe.vae.config.latents_std).view(1, zc, 1, 1, 1).to(z.device, z.dtype)
    x0 = ((z - mean) / std)[:, :, 0]
    return pipe._pack_latents(x0, 1, zc, x0.shape[-2], x0.shape[-1]).to(torch.bfloat16)


def jolt(pipe, x0, ask, seed):
    """HERESY 1385: his ComfyUI workflow's InjectLatentNoise+ (comfyui_essentials, MIT: samples + randn · strength) on a picture's
    packed latents: the noise added in the VAE's own space, as ComfyUI's latents are, so that ask's "inject" means what it means
    there (a packed channel of VAE channel c gets inject / std[c]); its own seed beside the picture's. The clean latents stay for
    what the mask keeps."""
    import torch
    k = float(ask.get("inject") or 0)
    if not k:
        return x0
    std = torch.tensor(pipe.vae.config.latents_std, device=x0.device, dtype=torch.float32)
    per = x0.shape[-1] // std.numel()
    std = std.repeat_interleave(per) if per * std.numel() == x0.shape[-1] else std.mean()
    g = torch.Generator(x0.device).manual_seed(int(seed) + 1385)
    n = torch.randn(x0.shape, generator=g, device=x0.device, dtype=torch.float32)
    return (x0.float() + k * n / std).to(x0.dtype)


def region_prompts(prompt, ask):
    """HERESY 1387: each region's own prompt: the main prompt and the region's words, so its part stays in the picture's scene."""
    return [prompt.rstrip(" .,;") + ". " + r["prompt"] for r in ask.get("regions") or []]


def region_tokens(pipe, ask, gw, gh):
    """HERESY 1387: each region's box as the packed latents' tokens, soft-edged (a twenty-fifth of the shorter side), [1, n, 1] each."""
    from PIL import Image, ImageDraw
    out = []
    for r in ask.get("regions") or []:
        x, y, w, h = r["box"]
        m = Image.new("L", (gw, gh), 0)
        ImageDraw.Draw(m).rectangle([round(x * gw), round(y * gh), round((x + w) * gw) - 1, round((y + h) * gh) - 1], fill=255)
        out.append(mask_tokens(pipe, m, gw, gh, 0, max(4, min(gw, gh) // 25), True)[0])
    return out


def regions_set(tr, base=None, regions=None, key="encoder_attention_mask"):
    """HERESY 1387: the transformer's forward wrapped once, a pass-through until a picture sets its regions here (base: the guided prompt's
    embeds; regions: [(embeds, mask, tokens)]); each picture sets them, or None, before it paints. A guided pass (its prompt is the
    base) is asked once more for each region, and the answers blend: a region's token weight its box's (shared where boxes overlap),
    the rest the main prompt's. The unguided pass and every pass without regions go through untouched."""
    import torch
    if not getattr(tr, "_heresy_regions_on", False):
        orig = tr.forward

        def forward(*a, **kw):
            spec = getattr(tr, "_heresy_regions", None)
            out = orig(*a, **kw)
            if not spec:
                return out
            head, regs, mk = spec
            enc = kw.get("encoder_hidden_states")
            if enc is None or enc.shape[0] != 1 or enc.shape[1] < head.shape[1] or not torch.equal(enc[:, :head.shape[1]].float(), head):
                return out
            v = out[0] if isinstance(out, tuple) else out.sample
            total = sum(t.float() for _, _, t in regs)
            scale = total.clamp(min=1.0)
            acc = v.float() * (1 - total.clamp(max=1.0))
            for e, m, t in regs:
                kw2 = dict(kw, encoder_hidden_states=e)
                kw2[mk] = m
                vi = orig(*a, **kw2)
                vi = vi[0] if isinstance(vi, tuple) else vi.sample
                acc = acc + vi.float() * (t.float() / scale)
            res = acc.to(v.dtype)
            return (res,) + tuple(out[1:]) if isinstance(out, tuple) else type(out)(sample=res)
        tr.forward = forward
        tr._heresy_regions_on = True
    tr._heresy_regions = (base[:, :16].float(), regions, key) if base is not None and regions else None


def cover(img, gw, gh, resample=None):
    """A picture covering the shape, cut from the middle (as the reference and its mask are)."""
    from PIL import Image
    s = min(img.width / gw, img.height / gh)
    img = img.resize((max(gw, round(img.width / s)), max(gh, round(img.height / s))), resample=resample or Image.LANCZOS)
    return img.crop(((img.width - gw) // 2, (img.height - gh) // 2, (img.width - gw) // 2 + gw, (img.height - gh) // 2 + gh))


def contain(img, gw, gh, resample=None):
    """HERESY 1307: the whole picture in the shape's middle: (the picture scaled to fit, its box (x, y, w, h))."""
    from PIL import Image
    s = min(gw / img.width, gh / img.height)
    w, h = max(1, round(img.width * s)), max(1, round(img.height * s))
    return img.resize((w, h), resample=resample or Image.LANCZOS), ((gw - w) // 2, (gh - h) // 2, w, h)


def fitted(ref, mask, gw, gh):
    """HERESY 1307: for painting around: the reference contained in the shape over itself stretched and blurred (the VAE sees its
    colours under the edges), and the mask: white on the edges it leaves, the user's own mask placed as the picture is."""
    from PIL import Image, ImageFilter
    inner, (x, y, w, h) = contain(ref, gw, gh)
    under = cover(ref, gw, gh).filter(ImageFilter.GaussianBlur(48))
    under.paste(inner, (x, y))
    # the repainted edges reach a little into the picture, softly (6 % of its side), so the new paint meets the old across a
    # band and not at a line (tried 10.10.2026: a hard edge left a seam where the walls did not run on)
    from PIL import ImageChops
    pad = max(8, round(min(w, h) * 0.06))
    m = Image.new("L", (gw, gh), 255)
    m.paste(Image.new("L", (max(1, w - 2 * pad), max(1, h - 2 * pad)), 0), (x + pad, y + pad))
    m = m.filter(ImageFilter.GaussianBlur(pad / 2))
    if mask is not None:
        own = Image.new("L", (gw, gh), 0)
        own.paste(contain(mask.convert("L"), gw, gh, Image.BILINEAR)[0], (x, y))
        m = ImageChops.lighter(m, own)
    return under, m


def placed(ref, mask, gw, gh, p):
    """HERESY 1346: the reference where the canvas put it in this shape's frame (p: x, y its middle in the frame's share, s its width in
    frame widths): (what the VAE sees, the mask or None, whether the picture covers the frame). Covering it, the picture as placed, the
    user's mask placed with it; leaving some of the frame bare, the picture over itself stretched and blurred (as fitted), the bare part
    white in the mask and a soft band into the picture where its edge lies inside the frame, the user's mask added."""
    from PIL import Image, ImageChops, ImageFilter
    rw, rh = ref.size
    w = max(1, round(p["s"] * gw))
    h = max(1, round(w * rh / rw))
    left, top = round(p["x"] * gw - w / 2), round(p["y"] * gh - h / 2)
    covered = left <= 0 and top <= 0 and left + w >= gw and top + h >= gh
    vis = (max(0, left), max(0, top), min(gw, left + w), min(gh, top + h))   # the part of the picture inside the frame
    seen = vis[2] > vis[0] and vis[3] > vis[1]
    box = ((vis[0] - left) * rw / w, (vis[1] - top) * rh / h, (vis[2] - left) * rw / w, (vis[3] - top) * rh / h)   # in the picture's pixels
    under = cover(ref, gw, gh) if covered else cover(ref, gw, gh).filter(ImageFilter.GaussianBlur(48))
    if seen:
        under.paste(ref.resize((vis[2] - vis[0], vis[3] - vis[1]), resample=Image.LANCZOS, box=box), (vis[0], vis[1]))
    own = None
    if mask is not None and seen:                     # the user's mask, placed as the picture is
        mk = mask.convert("L")
        sx, sy = mk.width / rw, mk.height / rh
        own = Image.new("L", (gw, gh), 0)
        own.paste(mk.resize((vis[2] - vis[0], vis[3] - vis[1]), resample=Image.BILINEAR, box=(box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy)), (vis[0], vis[1]))
    if covered:
        return under, own, True
    m = Image.new("L", (gw, gh), 255)
    if seen:                                          # a soft band into the picture on the edges that lie inside the frame (as 1307's)
        pad = max(8, round(min(vis[2] - vis[0], vis[3] - vis[1]) * 0.06))
        x0 = vis[0] + (pad if left > 0 else 0)
        y0 = vis[1] + (pad if top > 0 else 0)
        x1 = vis[2] - (pad if left + w < gw else 0)
        y1 = vis[3] - (pad if top + h < gh else 0)
        if x1 > x0 and y1 > y0:
            m.paste(Image.new("L", (x1 - x0, y1 - y0), 0), (x0, y0))
        m = m.filter(ImageFilter.GaussianBlur(pad / 2))
    if own is not None:
        m = ImageChops.lighter(m, own)
    return under, m, False


def grow_mask(m, px):
    """HERESY 1320: the mask grown by px (shrunk when px is negative), a pixel at a time in 3 × 3 (64 px: half a second at 2 MP)."""
    from PIL import ImageFilter
    f = ImageFilter.MaxFilter(3) if px > 0 else ImageFilter.MinFilter(3)
    for _ in range(min(128, abs(int(px)))):
        m = m.filter(f)
    return m


def mask_opts(ask):
    """HERESY 1320: the mask's options asked: (grow, edge, soft, grain); without them as before 1320 (no grow, a 12 px feather, hard)."""
    o = ask.get("mask_opts") or {}
    return int(o.get("grow") or 0), int(o.get("edge", 12)), bool(o.get("soft")), float(o.get("grain") or 0)


def mask_tokens(pipe, mask, gw, gh, grow=0, edge=12, soft=False):
    """HERESY 1306: the mask as the packed latents' tokens (1 repaints, 0 keeps): at the latent's size, softened by one latent
    pixel, each token the largest over its 2 × 2 patch; (tokens [1, n, 1], the pixel mask feathered for the last composite)."""
    import torch
    import torch.nn.functional as F
    from PIL import Image, ImageFilter
    m = mask.convert("L") if mask.size == (gw, gh) else cover(mask.convert("L"), gw, gh, Image.BILINEAR)   # 1307: a fitted mask is the shape's
    if grow:                                         # HERESY 1320: grown or shrunk
        m = grow_mask(m, grow)
    feather = m.filter(ImageFilter.GaussianBlur(edge)) if edge > 0 else m   # HERESY 1320: the edge asked (12 px before)
    p = getattr(pipe, "patch_size", 2)               # HERESY 1320: Qwen-Image packs 2 × 2 as Krea does
    if soft:                                         # HERESY 1320: the soft edge's values kept, for differential diffusion
        t = torch.from_numpy(__import__("numpy").asarray(feather, dtype="float32") / 255.0)[None, None]
        lat = F.adaptive_avg_pool2d(t, (gh // pipe.vae_scale_factor, gw // pipe.vae_scale_factor))
        tok = F.avg_pool2d(lat, p).clamp(0, 1)
        return tok.flatten(2).transpose(1, 2).to("cuda", torch.bfloat16), feather
    t = torch.from_numpy(__import__("numpy").asarray(m, dtype="float32") / 255.0)[None, None]           # 1 × 1 × H × W
    lat = F.adaptive_max_pool2d(t, (gh // pipe.vae_scale_factor, gw // pipe.vae_scale_factor))
    lat = F.avg_pool2d(F.pad(lat, (1, 1, 1, 1), mode="replicate"), 3, stride=1).clamp(0, 1)          # softened by a pixel
    tok = F.max_pool2d(lat, p)                                                                      # 1 × 1 × H/16 × W/16
    return tok.flatten(2).transpose(1, 2).to("cuda", torch.bfloat16), feather


def blender(tok, x0, noise, n, soft=False, grain=0.0, show=None):
    """HERESY 1306, 1320: the step's callback: the kept part put back noised to the next sigma; with soft (differential diffusion) a
    token is painted only from the step where the noise has come down to its own value; with grain the kept part takes that share of
    the painting at each step."""
    def blend(pipe, i, t, kw):
        sig = pipe.scheduler.sigmas
        s_next = float(sig[min(i + 1, len(sig) - 1)])
        lat = kw["latents"]
        steps = max(1, len(sig) - 1)                  # HERESY 1333: the scheduler's own count (a method's stages lay more than n)
        m = (tok > (1 - (i + 1) / steps)).to(lat.dtype) if soft else tok
        keep = (1 - s_next) * x0 + s_next * noise
        if grain:
            keep = (1 - grain) * keep + grain * lat
        kw["latents"] = m * lat + (1 - m) * keep
        if show:
            show(pipe, i, t, kw)
        return {"latents": kw["latents"]}
    return blend


def composite(img, base, feather, grain=0.0):
    """HERESY 1306, 1320: outside the mask the reference's own pixels, feathered; with grain that share of the painting kept there too."""
    from PIL import Image
    if grain:
        feather = feather.point(lambda v: round(v + (255 - v) * grain))
    return Image.composite(img.convert("RGB"), base, feather)


def set_schedule(pipe, sampling):
    """HERESY 1319: the schedule and the sampler asked (diffusers' flow-match Euler: Karras, exponential or beta spacing of the
    pipeline's own sigmas; stochastic for Euler SDE); nothing when the painter's own are asked."""
    from diffusers import FlowMatchEulerDiscreteScheduler
    import artist_samplers                           # HERESY 1333: the studio's own samplers and schedules
    if artist_samplers.install(pipe, sampling):
        return
    sc = (sampling or {}).get("schedule") or "simple"
    flags = {"use_karras_sigmas": sc == "karras", "use_exponential_sigmas": sc == "exponential", "use_beta_sigmas": sc == "beta",
             "stochastic_sampling": (sampling or {}).get("sampler") == "euler-sde"}
    if any(flags.values()):
        pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config({**pipe.scheduler.config, **flags})


def ref_sigmas(pipe, strength, n=None, mu=1.15):
    """HERESY 1305: the tail of the pipeline's own sigmas (1 … 1/8) whose first, as the scheduler shifts it (mu 1.15: Krea 2
    Turbo is distilled), is nearest the strength asked, two steps at least: (sigmas, that first sigma shifted)."""
    import copy
    import numpy as np
    n = n or art_job.FEW_STEPS                      # HERESY 1319: the run's own steps
    s = np.linspace(1.0, 1 / n, n)
    best = None
    for k in range(n - 1):
        sch = copy.deepcopy(pipe.scheduler)
        sch.set_timesteps(sigmas=[float(v) for v in s[k:]], mu=mu, device="cpu")   # HERESY 1320: a painter's own shift (Krea 1.15)
        s0 = float(sch.sigmas[0])
        if best is None or abs(s0 - strength) < abs(best[1] - strength):
            best = ([float(v) for v in s[k:]], s0)
    return best


def lora_sched(loras):
    """HERESY 1365: the adapters loaded as a0, a1… with their strengths and keyframes, when one of them has keyframes; else None."""
    if not any(l.get("keys") for l in loras or []):
        return None
    return [("a%d" % i, float(l.get("weight", 0.8)), l.get("keys")) for i, l in enumerate(loras)]


def lora_steps(pipe, sched, n, inner=None):
    """HERESY 1365: an adapter's strength set before each step by its keyframes (step 0's set before the run: lora_start); the callback
    after the others (the live picture, the mask), whose answer it passes on."""
    import artist_loras

    def step(p, i, t, kw):
        r = inner(p, i, t, kw) if inner else {}
        if i + 1 < n:
            ws = artist_loras.step_weights(sched, i + 1, n)
            pipe.set_adapters([a for a, _ in ws], adapter_weights=[w for _, w in ws])
        return r
    return step


def lora_start(pipe, sched, n):
    """HERESY 1365: the strengths of step 0, set before the run."""
    import artist_loras
    ws = artist_loras.step_weights(sched, 0, n)
    pipe.set_adapters([a for a, _ in ws], adapter_weights=[w for _, w in ws])


def drop():
    """HERESY 1370: the painter a serving process keeps, let go before another loads (its RAM and its card's memory back)."""
    if not KEPT:
        return
    KEPT.clear()
    import gc
    import torch
    gc.collect()
    torch.cuda.empty_cache()


def rest():
    """HERESY 1370: a served run done: the kept painter's weights back in RAM, its card free for whatever comes next. False when nothing
    is kept to paint the next one (its blocks streamed, or a painter not kept): the process then ends, as a run's own did."""
    import gc
    import torch
    if not KEPT.get("key") or KEPT.get("streamed"):
        return False
    if KEPT.get("pipe") is not None:
        KEPT["pipe"].transformer.to("cpu")
        KEPT["pipe"].vae.to("cpu")
    gc.collect()
    torch.cuda.empty_cache()
    return True


def serve():
    """HERESY 1370 (Viktor 11.10.2026: «Да, отпускай модели Художника через 10 минут. Это правильно»): runs one by one from stdin, a JSON
    line each ({"run", "painter", "only", "stream"}), each answered as a process of its own answers it (its rows, then {"done"}); the
    painter kept between them, its weights in RAM and the card free (rest()), and painting the next at once when it is the same painter
    with the same adapters (said: {"kept": true}), else let go and loaded anew. After each run {"idle": true}, or {"idle": false} and the
    end when nothing could be kept. An error ends the process as it ended a run's own (the lab starts another for the next run)."""
    import artist_qwen
    for line in sys.stdin:
        if not line.strip():
            continue
        job = json.loads(line)
        os.environ["ART_PAINTER"] = str(job.get("painter") or "")
        os.environ["ART_STREAM"] = "1" if job.get("stream") else ""
        for only in (ONLY, artist_qwen.ONLY):        # HERESY 1354: this card's pictures of the run
            only.clear()
            only.update(int(n) for n in job.get("only") or [])
        KEPT.pop("streamed", None)
        main(job["run"])
        ok = rest()
        print(json.dumps({"idle": ok}), flush=True)
        if not ok:
            return


def main(run=None):
    run = Path(run or sys.argv[1])
    ask = json.load(open(run / "ask.json", encoding="utf-8"))
    asked = (os.environ.get("ART_PAINTER") or "").strip().lower()
    if asked == "upscale":                           # HERESY 1322: a picture made larger by an upscaler (its ask has no prompt)
        import artist_upscale
        return artist_upscale.main(run, ask)
    prompt, seed, count = str(ask["prompt"]), int(ask["seed"]), max(1, min(4, int(ask.get("count") or 1)))
    preview = bool(ask.get("preview"))
    shapes = [s for s in ask.get("shapes") or ["1:1"] if s in SHAPES]
    if asked.startswith("qwen"):                     # HERESY 1318: Qwen-Image 2512 and 2.1 paint in artist_qwen.py
        import artist_qwen
        return artist_qwen.main(run, ask, asked)
    # HERESY 1428 (Viktor 14.10.2026: «Krea вырезаем, однозначно»): Krea 2's own path gone with it; any painter but Qwen-Image's is said so
    raise SystemExit(f"{asked or 'no painter named'}: the Artist paints with Qwen-Image (Krea 2 left the studio, HERESY 1428)")

if __name__ == "__main__":
    if SERVE and len(sys.argv) < 2:                  # HERESY 1370
        serve()
    else:
        main()
