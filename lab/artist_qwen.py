"""HERESY 1169 · 1318: the Artist's Qwen painters (Viktor 10.10.2026: «Повышай версию diffusers > 0.41. Подключай Qwen Image 2.1»;
on its licence: «мы предупреждаем пользователя по этому поводу»; «Забирай 2512 тоже в Студию… мои safetensors — это реальный минимум
24GB VRAM… А её я люблю»; «как альтернативу для менее мощных карт бери смело … Q6_K + Lightning … Для 16 ГБ — Q4_K_M»).

    qwen2512-q4, qwen2512-q6   Qwen-Image 2512 (Apache-2.0): the transformer from unsloth's GGUF, the rest from Qwen/Qwen-Image-2512
    qwen2512-fp8               a ComfyUI fp8 file in artwork/Qwen-Image-2512/checkpoints/ (ask «model»): its keys under
                               model.diffusion_model., e4m3fn or e5m2; read in bf16, kept on the card in its own fp8, each layer in
                               bf16 while it computes; the adapters loaded before that, their own layers left in bf16 (PEFT makes
                               them in the base weight's type, and an fp8 adapter layer has nothing to compute with)
    qwen21                     Qwen-Image 2.1 (the Qwen Research Licence: research and evaluation only), its own folder; a
                               reference is a picture it edits by the prompt's words

Lightning (artwork/Qwen-Image-2512/lightning/, Apache-2.0) paints 2512 in a few steps with its own schedule (shift log 3): at 1.0
and 8 steps by its README for the base, at 0.55 and 12 steps for a fine-tune as Viktor runs it in ComfyUI. Measured on an RTX 3090,
10.10.2026, 1328²: Q6_K 32 s a picture, 17.6 GB at the peak; Q4_K_M 30 s, 14.3 GB; the JibMix v6 fp8 fine-tune at 0.55 and 12 steps
37 s, 21.0 GB. The text encoder (Qwen2.5-VL-7B, 16.6 GB in bf16) reads the prompt on the card when it holds it, else on the CPU, and
leaves before the painter comes (HERESY 1338b: on the card when the room free there now holds it). A shape is drawn at Qwen-Image's own size and kept at the room's (Lanczos)."""
import gc, json, math, os, re, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import art_job  # noqa: E402
import artist_loras  # noqa: E402

KIT = art_job.KIT
Q2512 = KIT / "artwork" / "Qwen-Image-2512"
Q21 = KIT / "artwork" / "Qwen-Image-2.1"
GGUF = {"qwen2512-q4": "qwen-image-2512-Q4_K_M.gguf", "qwen2512-q6": "qwen-image-2512-Q6_K.gguf"}
LIGHTNING = "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors"
SHAPES = {"1:1": ((1328, 1328), (1280, 1280)), "16:9": ((1664, 928), (1920, 1080)), "9:16": ((928, 1664), (1080, 1920))}
THUMB = 512
SPEED = {"base": (1.0, 8), "fine": (0.55, 12)}       # Lightning's strength and steps when it is on
OFF_BY_DEFAULT = {"fine"}                             # HERESY 1328: a fine-tune paints finished realism: Lightning only when asked
SLOW = (30, 4.0)                                      # without Lightning: steps, true CFG (2512's own way)
NEGATIVE = " "                                        # 2512's own negative when guided
# HERESY 1338b: the room the text encoder wants on a card (15.5 GiB in bf16, 15.8 at its peak with its work) and a margin
ENC_ROOM = int(float(os.environ.get("ART_ENC_ROOM_GB") or 16.5) * 2 ** 30)
# HERESY 1342 (Viktor 10.10.2026: «Четыре адаптера убили VRAM. Адаптивный offload на CPU можно предусмотреть в таких случаях?»): what a
# run needs on the card beside the painter's weights (the activations, the VAE's tiles, the card's own context), measured; a painter
# whose weights with this do not fit the room free on its card streams its blocks from RAM (STREAMS: the painters tried so)
WORK_ROOM = int(float(os.environ.get("ART_WORK_ROOM_GB") or 2.0) * 2 ** 30)
STREAMS = {"qwen2512-fp8"}


def weights_bytes(m):
    """HERESY 1342: a module's parameters and buffers as they are stored (an fp8 painter's own fp8, its adapters' bf16)."""
    return sum(t.numel() * t.element_size() for t in list(m.parameters()) + list(m.buffers()))


def place(pipe, painter):
    """HERESY 1342: the painter on the card whole when the room free there holds its weights and its work; else its blocks stream from
    RAM (diffusers' group offloading over a CUDA stream: a block comes onto the card while the one before it computes, and leaves after
    it), slower by what the bus cannot hide. ART_STREAM=1 asks for it (the lab, when no card here takes the run whole). Returns what
    is said of it, or None."""
    import torch
    tr = pipe.transformer
    size, free = weights_bytes(tr), torch.cuda.mem_get_info()[0]
    asked = os.environ.get("ART_STREAM") == "1"
    if painter not in STREAMS or (not asked and free >= size + WORK_ROOM):
        tr.to("cuda")
        return None
    # HERESY 1342b: the blocks the room holds stay (the parts outside the blocks too, and two blocks' room for the one coming in), the
    # rest stream; fewer than half staying, every block streams with diffusers' prefetching instead
    blocks = list(tr.transformer_blocks)
    per = max(weights_bytes(b) for b in blocks)
    rest = size - sum(weights_bytes(b) for b in blocks)
    keep = int((free - WORK_ROOM - rest - 2 * per) // per)
    if os.environ.get("ART_STREAM_KEEP"):                    # a test's own share
        keep = int(os.environ["ART_STREAM_KEEP"])
    keep = max(0, min(len(blocks) - 1, keep))
    cuda, cpu = torch.device("cuda"), torch.device("cpu")
    if keep < len(blocks) // 2:
        tr.enable_group_offload(onload_device=cuda, offload_device=cpu, offload_type="block_level", num_blocks_per_group=1, use_stream=True)
        keep = 0
    else:
        from diffusers.hooks import apply_group_offloading
        from diffusers.hooks.hooks import HookRegistry
        for name, child in tr.named_children():
            if name != "transformer_blocks":
                child.to(cuda)
        for t in list(tr.parameters(recurse=False)) + list(tr.buffers(recurse=False)):
            t.data = t.data.to(cuda)
        for b in blocks[:keep]:
            b.to(cuda)
        tail = torch.nn.Module()
        tail.blocks = torch.nn.ModuleList(blocks[keep:])
        apply_group_offloading(tail, onload_device=cuda, offload_device=cpu, offload_type="block_level", num_blocks_per_group=1, use_stream=True)
        for b in blocks[keep:]:
            # no prefetching here (diffusers' lazy hook would live on this wrapper's forward, which never runs): a block's copy is
            # finished before it computes, else its first look could read weights still on their way
            HookRegistry.check_if_exists_or_initialize(b).get_hook("group_offloading").group.non_blocking = False
    return {"stream": True, "weights_gb": round(size / 2 ** 30, 1), "free_gb": round(free / 2 ** 30, 1), "asked": asked, "kept": keep, "of": len(blocks)}


def lightning():
    d = Q2512 / "lightning"
    p = d / LIGHTNING
    return p if p.is_file() else None


def checkpoints():
    d = Q2512 / "checkpoints"
    return sorted(p.name for p in d.glob("*.safetensors")) if d.is_dir() else []


def checkpoint(model):
    name = Path(str(model or "")).name
    if name not in checkpoints():
        raise RuntimeError(f"no such fine-tune in artwork/Qwen-Image-2512/checkpoints/: {model}")
    return Q2512 / "checkpoints" / name


def modules_of(ckpt):
    """The layer names a checkpoint's tensors carry (a GGUF, a single file, or a diffusers folder's index)."""
    ckpt = Path(ckpt)
    names = []
    if ckpt.suffix == ".gguf":
        import gguf
        names = [t.name for t in gguf.GGUFReader(str(ckpt)).tensors]
    elif ckpt.is_dir():
        idx = next(iter(ckpt.glob("*.safetensors.index.json")), None)
        if idx:
            names = list(json.load(open(idx, encoding="utf-8"))["weight_map"])
        else:
            from safetensors import safe_open
            for f in ckpt.glob("*.safetensors"):
                with safe_open(str(f), "pt") as h:
                    names += list(h.keys())
    else:
        from safetensors import safe_open
        with safe_open(str(ckpt), "pt") as h:
            names = list(h.keys())
    return {n.replace("model.diffusion_model.", "", 1)[:-len(".weight")] for n in names if n.endswith(".weight")}


def fp8_transformer(f):
    """A ComfyUI fp8 file as diffusers' transformer: its tensors read in bf16 (fp8 → bf16 is exact), the fp8 kind kept to store them
    in again on the card (bf16 → the same fp8 is exact too)."""
    import torch
    from accelerate import init_empty_weights
    from diffusers import QwenImageTransformer2DModel
    from safetensors import safe_open
    with init_empty_weights(include_buffers=False):          # the weights empty, the buffers (rotary frequencies) real
        tr = QwenImageTransformer2DModel.from_config(QwenImageTransformer2DModel.load_config(str(Q2512 / "transformer")))
    sd, kinds = {}, set()
    with safe_open(str(f), "pt") as h:
        for k in h.keys():
            v = h.get_tensor(k)
            kinds.add(str(v.dtype))
            sd[k.replace("model.diffusion_model.", "", 1)] = v.to(torch.bfloat16)
    tr.load_state_dict(sd, strict=True, assign=True)
    del sd
    return tr, (torch.float8_e5m2 if "torch.float8_e5m2" in kinds else torch.float8_e4m3fn if "torch.float8_e4m3fn" in kinds else None)


def adapter_dict(p, modules):
    """An adapter's tensors as diffusers' Qwen loader reads them: PEFT's «.default.» taken out, a kohya file renamed by the
    checkpoint's own layer names."""
    from safetensors.torch import load_file
    sd = load_file(str(p))
    if any(".default." in k for k in sd):
        sd = {k.replace(".lora_A.default.", ".lora_A.").replace(".lora_B.default.", ".lora_B."): v for k, v in sd.items()}
    missed = 0
    if any(k.startswith("lora_unet_") for k in sd):
        sd, missed = artist_loras.kohya_to_comfy(sd, modules)
    return sd, missed


def load_adapters(pipe, wanted, modules):
    """wanted: [(name, path, weight, id)]; each onto the transformer, set at its weight; one that reaches no layer stops the run."""
    names, weights, out = [], [], []
    for name, p, w, lid in wanted:
        sd, missed = adapter_dict(p, modules)
        pipe.load_lora_weights(sd, adapter_name=name)
        reached = sum(1 for _, m in pipe.transformer.named_modules() if name in (getattr(m, "lora_A", None) or {}))
        if not reached:
            raise RuntimeError(Path(p).name + " reaches none of this painter's layers: an adapter for another model")
        names.append(name)
        weights.append(float(w))
        out.append({"id": lid, "weight": float(w), "layers": reached, "missed": missed})
    if names:
        pipe.set_adapters(names, adapter_weights=weights)
    return out


def build(painter, model, loras, speed):
    """The pipeline for a run, its adapters on: (pipe, the adapters said, steps, true CFG, the card's own work left)."""
    import torch
    from diffusers import FlowMatchEulerDiscreteScheduler, GGUFQuantizationConfig, QwenImagePipeline, QwenImageTransformer2DModel
    wanted = [("a%d" % i, artist_loras.path_of(KIT, l["id"]), l.get("weight", artist_loras.WEIGHT), l["id"]) for i, l in enumerate(loras or [])]
    if painter == "qwen21":
        from diffusers import QwenImage21Pipeline
        pipe = QwenImage21Pipeline.from_pretrained(str(Q21), torch_dtype=torch.bfloat16)
        said = load_adapters(pipe, wanted, modules_of(Q21 / "transformer")) if wanted else []
        import artist_job
        artist_job.set_schedule(pipe, speed)                 # HERESY 1319
        return pipe, said, int(speed.get("steps") or 30), 1.0
    store = None
    if painter in GGUF:
        ckpt = Q2512 / "gguf" / GGUF[painter]
        tr = QwenImageTransformer2DModel.from_single_file(str(ckpt), quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
                                                          config=str(Q2512 / "transformer"), torch_dtype=torch.bfloat16)
        kind = "base"
    else:
        ckpt = checkpoint(model)
        tr, store = fp8_transformer(ckpt)
        kind = "fine"
    pipe = QwenImagePipeline.from_pretrained(str(Q2512), transformer=tr, torch_dtype=torch.bfloat16)
    lw, steps = SPEED[kind]
    if speed.get("lightning") is not None:
        lw = float(speed["lightning"])
    elif kind in OFF_BY_DEFAULT:                             # HERESY 1328: not asked: a fine-tune without it
        lw = 0.0
    if speed.get("steps"):
        steps = int(speed["steps"])
    li = lightning()
    if li and lw > 0:                                        # Lightning's own schedule: shift log 3 at every size
        pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config({**pipe.scheduler.config, "base_shift": math.log(3), "max_shift": math.log(3), "shift_terminal": None})
        wanted.append(("speed", li, lw, "lightning"))
        cfg = 1.0
    else:
        steps, cfg = (int(speed.get("steps") or SLOW[0]), float(speed.get("cfg") or SLOW[1]))
    said = load_adapters(pipe, wanted, modules_of(ckpt)) if wanted else []
    import artist_job
    artist_job.set_schedule(pipe, speed)                     # HERESY 1319: the sampler and the schedule asked
    if store is not None:                                    # fp8 on the card, each layer bf16 while it computes; the adapters' own bf16
        from diffusers.hooks.layerwise_casting import DEFAULT_SKIP_MODULES_PATTERN
        pipe.transformer.enable_layerwise_casting(storage_dtype=store, compute_dtype=torch.bfloat16,
                                                  skip_modules_pattern=tuple(DEFAULT_SKIP_MODULES_PATTERN) + ("lora_A", "lora_B", "lora_magnitude"))
    return pipe, said, steps, cfg


def flagged(img, state={}):
    """The content filter's word (the studio's rule for every painter, as Krea 2's licence asks for its own): the nsfw score."""
    if not (art_job.FILTER / "config.json").is_file():
        return None
    if "f" not in state:
        from transformers import pipeline
        state["f"] = pipeline("image-classification", model=str(art_job.FILTER), device="cpu")
    scores = {r["label"].lower(): r["score"] for r in state["f"](img.convert("RGB"))}
    return round(scores.get("nsfw", 0.0), 3)


def live(run, n, gw, gh, w, h, steps):
    """A step's picture from 2512's latents (Wan 2.1's latent space, as Krea's): unpacked, projected to RGB, an eighth the size."""
    import torch
    from PIL import Image
    import artist_job
    (run / "preview").mkdir(exist_ok=True)
    out = run / "preview" / f"{n:02d}.jpg"

    def step(pipe, i, t, kw):
        x = pipe._unpack_latents(kw["latents"], gh, gw, pipe.vae_scale_factor)[0, :, 0].float()
        f = torch.tensor(artist_job.RGB_FACTORS, device=x.device)
        rgb = (x.permute(1, 2, 0) @ f + torch.tensor(artist_job.RGB_BIAS, device=x.device)).add(1).div(2).clamp(0, 1)
        img = Image.fromarray(rgb.mul(255).byte().cpu().numpy()).resize((max(1, w // 8), max(1, h // 8)))
        img.save(out, "JPEG", quality=85)
        of = len(pipe.scheduler.timesteps) if getattr(pipe.scheduler, "timesteps", None) is not None else steps   # HERESY 1333: its stages too
        print(json.dumps({"live": n, "step": i + 1, "of": of, "file": f"preview/{n:02d}.jpg"}), flush=True)
        return {}
    return step


def mu_of(pipe, gw, gh):
    """HERESY 1320: the shift the pipeline gives a picture of this size (Lightning's: log 3 at every size)."""
    from diffusers.pipelines.qwenimage.pipeline_qwenimage import calculate_shift
    c = pipe.scheduler.config
    return calculate_shift((gh // 16) * (gw // 16), c.get("base_image_seq_len", 256), c.get("max_image_seq_len", 4096), c.get("base_shift", 0.5), c.get("max_shift", 1.15))


def cover(img, w, h):
    """The picture filling w × h, cut from its middle."""
    from PIL import Image
    s = max(w / img.width, h / img.height)
    im = img.resize((max(w, round(img.width * s)), max(h, round(img.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def main(run, ask, painter):
    import torch
    from PIL import Image
    t0 = time.time()
    prompt, seed, count = str(ask["prompt"]), int(ask["seed"]), max(1, min(4, int(ask.get("count") or 1)))
    shapes = [s for s in ask.get("shapes") or ["1:1"] if s in SHAPES]
    preview = bool(ask.get("preview"))
    pipe, said, steps, cfg = build(painter, ask.get("model"), ask.get("loras") or [], ask.get("sampling") or ask.get("speed") or {})   # HERESY 1319
    if said:
        print(json.dumps({"loras": said}), flush=True)
    ref = Image.open(run / ask["ref"]).convert("RGB") if ask.get("ref") else None
    mask = Image.open(run / ask["mask"]).convert("L") if ask.get("mask") else None
    big = torch.cuda.mem_get_info()[0] >= ENC_ROOM          # HERESY 1338b: the room free now, not the card's size
    if painter == "qwen21":                                  # its parts on the card in turn (16.4 GB from words, 19.1 editing, 3090)
        if mask is not None or ask.get("fit"):
            raise RuntimeError("Qwen-Image 2.1 edits a picture by the prompt's words: a mask or «Paint around it» wants Krea 2 or Qwen-Image 2512")
        pipe.enable_model_cpu_offload()
        e = m = None
    else:
        dev = torch.device("cuda" if big else "cpu")        # the encoder on the card when it holds it (16.6 GB), else on the CPU
        pipe.text_encoder.to(dev)
        with torch.inference_mode():
            e, m = pipe.encode_prompt(prompt, device=dev)
            ne, nm = pipe.encode_prompt(NEGATIVE, device=dev) if cfg > 1 else (None, None)
        pipe.text_encoder.to("cpu")
        gc.collect()
        torch.cuda.empty_cache()
        e = e.to("cuda")
        m = m.to("cuda") if m is not None else None
        if ne is not None:
            ne = ne.to("cuda")
            nm = nm.to("cuda") if nm is not None else None
        streamed = place(pipe, painter)                      # HERESY 1342: whole on the card, or its blocks streamed from RAM
        if streamed:
            print(json.dumps(streamed), flush=True)
        torch.cuda.reset_peak_memory_stats()                 # HERESY 1342b: the painting's own peak, the encoder's moment before it left out
        pipe.vae.to("cuda")
        pipe.vae.enable_tiling()
    (run / "thumbs").mkdir(exist_ok=True)
    fits, x0s, masks = {}, {}, {}                            # HERESY 1320
    n = 0
    for k in range(count):
        for shape in shapes:
            (gw, gh), (w, h) = SHAPES[shape]
            n += 1
            t1 = time.time()
            g = torch.Generator("cuda").manual_seed(seed + k)
            if hasattr(pipe.scheduler, "heresy"):         # HERESY 1333: our samplers noise by the pictures seed
                pipe.scheduler.heresy = dict(pipe.scheduler.heresy, seed=seed + k)
            more = {"callback_on_step_end": live(run, n, gw, gh, w, h, steps), "callback_on_step_end_tensor_inputs": ["latents"]} if preview and painter != "qwen21" else {}
            if painter == "qwen21":
                kw = {"prompt": prompt, "width": gw, "height": gh, "num_inference_steps": steps, "generator": g}
                if ref is not None:
                    kw["image"] = cover(ref, gw, gh)
                img = pipe(**kw).images[0]
            else:
                kw = {"prompt_embeds": e, "prompt_embeds_mask": m, "width": gw, "height": gh, "num_inference_steps": steps, "true_cfg_scale": cfg, "generator": g, **more}
                if cfg > 1:
                    kw.update(negative_prompt_embeds=ne, negative_prompt_embeds_mask=nm)
                pl = (ask.get("place") or {}).get(shape) if ref is not None else None   # HERESY 1346: the canvas's place
                if pl is not None:
                    import artist_job
                    if shape not in fits:
                        fits[shape] = artist_job.placed(ref, mask, gw, gh, pl)
                    if shape not in x0s:
                        x0s[shape] = artist_job.ref_latents(pipe, fits[shape][0], gw, gh)
                    sig, s0 = artist_job.ref_sigmas(pipe, float(ask.get("strength") or 0.6) if fits[shape][2] else 1.0, steps, mu_of(pipe, gw, gh))
                    noise = torch.randn(x0s[shape].shape, generator=g, device="cuda", dtype=x0s[shape].dtype)
                    kw.update(latents=(1 - s0) * x0s[shape] + s0 * noise, sigmas=sig, num_inference_steps=len(sig))
                    if fits[shape][1] is not None:
                        grow, edge, soft, grain = artist_job.mask_opts(ask)
                        if shape not in masks:
                            masks[shape] = artist_job.mask_tokens(pipe, fits[shape][1], gw, gh, grow, edge, soft)
                        kw.update(callback_on_step_end=artist_job.blender(masks[shape][0], x0s[shape], noise, len(sig), soft, grain, kw.get("callback_on_step_end")),
                                  callback_on_step_end_tensor_inputs=["latents"])
                    img = pipe(**kw).images[0]
                    if fits[shape][1] is not None:
                        img = artist_job.composite(img, fits[shape][0], masks[shape][1], artist_job.mask_opts(ask)[3])
                elif ref is not None:                # HERESY 1320: as Krea's: the reference noised to the strength's sigma, the tail
                    import artist_job                # from there; the mask's kept part put back each step (diffusers' Qwen inpaint
                    fit = bool(ask.get("fit"))       # binarized the mask)
                    if fit and shape not in fits:
                        fits[shape] = artist_job.fitted(ref, mask, gw, gh)
                    if shape not in x0s:
                        x0s[shape] = artist_job.ref_latents(pipe, fits[shape][0] if fit else ref, gw, gh)
                    sig, s0 = artist_job.ref_sigmas(pipe, 1.0 if fit else float(ask.get("strength") or 0.6), steps, mu_of(pipe, gw, gh))
                    noise = torch.randn(x0s[shape].shape, generator=g, device="cuda", dtype=x0s[shape].dtype)
                    kw.update(latents=(1 - s0) * x0s[shape] + s0 * noise, sigmas=sig, num_inference_steps=len(sig))
                    if mask is not None or fit:
                        grow, edge, soft, grain = artist_job.mask_opts(ask)
                        if shape not in masks:
                            masks[shape] = artist_job.mask_tokens(pipe, fits[shape][1] if fit else mask, gw, gh, grow, edge, soft)
                        kw.update(callback_on_step_end=artist_job.blender(masks[shape][0], x0s[shape], noise, len(sig), soft, grain, kw.get("callback_on_step_end")),
                                  callback_on_step_end_tensor_inputs=["latents"])
                    img = pipe(**kw).images[0]
                    if mask is not None or fit:
                        img = artist_job.composite(img, fits[shape][0] if fit else artist_job.cover(ref, gw, gh), masks[shape][1], artist_job.mask_opts(ask)[3])
                else:
                    img = pipe(**kw).images[0]
            img = img.convert("RGB")
            if (img.width, img.height) != (w, h):
                img = cover(img, w, h)
            score = flagged(img)
            row = {"n": n, "shape": shape, "seed": seed + k, "w": w, "h": h, "nsfw": score, "took": round(time.time() - t1, 1)}
            pl = (ask.get("place") or {}).get(shape) if ref is not None and painter != "qwen21" else None
            if pl is not None:                       # HERESY 1346: placed on the canvas
                row.update(ref=float(ask.get("strength") or 0.6) if fits[shape][2] else 1.0, placed="covers" if fits[shape][2] else "around")
                if mask is not None:
                    row["masked"] = True
            elif ref is not None:
                row["ref"] = float(ask.get("strength") or 0.6)
                if mask is not None:
                    row["masked"] = True
                if ask.get("fit"):
                    row["fit"] = True
            if score is not None and score >= 0.5:
                row["kept"] = False
            else:
                name = f"{n:02d}-{shape.replace(':', 'x')}-s{seed + k}"
                img.save(run / (name + ".png"))
                small = img.copy()
                small.thumbnail((THUMB, THUMB), resample=3)
                small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
                row.update(kept=True, file=name + ".png", thumb="thumbs/" + name + ".jpg")
            print(json.dumps(row), flush=True)
    print(json.dumps({"done": True, "painter": painter, "took": round(time.time() - t0, 1), "steps": steps, "cfg": cfg,
                      "peak_gb": round(torch.cuda.max_memory_reserved() / 2 ** 30, 1)}), flush=True)   # HERESY 1342: the card's peak, said
