"""HERESY 1169 · 1255: the Artist room's painter (lab/artist.py runs it in .venv-art). Krea 2 Muse once for a run, the
prompt read once, then every variation in every shape asked for, each picture through the content filter (Krea 2
Community License 4.2: a flagged picture is not kept, and its line says so). A shape is drawn at multiples of 16 and cut
to its size from the middle; the VAE decodes in tiles (measured 08.10.2026 on an RTX 3090, Krea 2 Muse Q8: 1920×1088
peaks at 16.9 GB so and 22.7 GB at once, in the same 46 s).

    CUDA_VISIBLE_DEVICES=N ART_PAINTER=krea2-q4|krea2-q8 .venv-art/bin/python lab/artist_job.py RUN_DIR

RUN_DIR/ask.json: {"prompt", "shapes": ["1:1", "16:9", "9:16"], "seed", "count", "preview"}. On stdout, as each picture is
drawn, one JSON line ({"n", "shape", "seed", "w", "h", "nsfw", "took", "kept", "file", "thumb"}); with "preview" (HERESY 1257)
a line at every step too ({"live": n, "step", "of", "file": "preview/NN.jpg"}); the last line the run's ({"done": true,
"painter", "took"})."""
import json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import art_job  # noqa: E402

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
        print(json.dumps({"live": n, "step": i + 1, "of": pipe._num_timesteps if hasattr(pipe, "_num_timesteps") else art_job.KREA_STEPS,
                          "file": f"preview/{n:02d}.jpg"}), flush=True)
        return {}
    return step


def main():
    run = Path(sys.argv[1])
    ask = json.load(open(run / "ask.json", encoding="utf-8"))
    prompt, seed, count = str(ask["prompt"]), int(ask["seed"]), max(1, min(4, int(ask.get("count") or 1)))
    preview = bool(ask.get("preview"))
    shapes = [s for s in ask.get("shapes") or ["1:1"] if s in SHAPES]
    import torch
    t0 = time.time()
    painter = art_job.which_painter()
    krea = art_job.Krea(painter)
    e, m = krea.encode(prompt)                       # the encoder's turn on the card, then the painter's
    krea.to("cuda")
    krea.pipe.vae.enable_tiling()
    (run / "thumbs").mkdir(exist_ok=True)
    n = 0
    for k in range(count):                           # a variation is the next seed; its shapes share it
        for shape in shapes:
            (gw, gh), (w, h) = SHAPES[shape]
            n += 1
            t1 = time.time()
            g = torch.Generator("cuda").manual_seed(seed + k)
            more = {"callback_on_step_end": live(run, n, gw, gh, w, h), "callback_on_step_end_tensor_inputs": ["latents"]} if preview else {}
            img = krea.pipe(prompt_embeds=e.to("cuda"), prompt_embeds_mask=m.to("cuda"), num_inference_steps=art_job.KREA_STEPS,
                            guidance_scale=0.0, height=gh, width=gw, generator=g, **more).images[0]
            if (gw, gh) != (w, h):
                x, y = (gw - w) // 2, (gh - h) // 2
                img = img.crop((x, y, x + w, y + h))
            score = krea.flagged(img)
            row = {"n": n, "shape": shape, "seed": seed + k, "w": w, "h": h, "nsfw": score, "took": round(time.time() - t1, 1)}
            if score is not None and score >= 0.5:
                row["kept"] = False
            else:
                name = f"{n:02d}-{shape.replace(':', 'x')}-s{seed + k}"
                img = img.convert("RGB")
                img.save(run / (name + ".png"))
                small = img.copy()
                small.thumbnail((THUMB, THUMB), resample=3)
                small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
                row.update(kept=True, file=name + ".png", thumb="thumbs/" + name + ".jpg")
            print(json.dumps(row), flush=True)
    print(json.dumps({"done": True, "painter": painter, "took": round(time.time() - t0, 1)}), flush=True)


if __name__ == "__main__":
    main()
