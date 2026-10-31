"""HERESY 1870: MiniMax H3 held in one card for the Videographer's shots, in place of AI-Toolkit's MinimaxH3Model and its BaseModel: the
files of models/minimax-h3 loaded as they ship (the DiT in int8 ConvRot, most of its blocks streamed from RAM; the Qwen3-VL encoder in nvfp4,
streamed layer by layer; the VAEs on the card), a shot sampled the way AI-Toolkit samples it (the same seed gives the same draw: the CPU
generator, the shot's picture shown to the encoder and laid in as the first frame) and written as an .mp4 by ffmpeg.
    h3 = H3(Path("models/minimax-h3"), device="cuda:0"); h3.load()
    h3.shoot("a prompt", "out.mp4", width=832, height=480, frames=107, steps=8, seed=1, first="shot.png")"""
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from safetensors.torch import load_file

from h3rt.files import FILES, ORIGINAL, needed
from h3rt.util import flush
from h3rt.minimax_h3 import packing
from h3rt.minimax_h3.audio_vae import MiniMaxH3AudioVAE
from h3rt.minimax_h3.pipeline import MiniMaxH3Pipeline
from h3rt.minimax_h3.text_encoder import TEXT_ENCODER_LAYER, encode_minimax_h3_prompt
from h3rt.minimax_h3.transformer import MiniMaxH3Transformer
from h3rt.minimax_h3.vae import MiniMaxH3VideoVAE


class PromptEmbeds:
    """What the sampler reads of AI-Toolkit's AdvancedPromptEmbeds: the embeds and their token tags, one entry a prompt."""

    def __init__(self, text_embeds, text_token_tags):
        self.text_embeds = text_embeds
        self.text_token_tags = text_token_tags


class H3:
    video_sigma_shift = packing.VIDEO_SIGMA_SHIFT
    t1000_sample_ladder = False

    def __init__(self, root, fast=False, partition="fl2va_pruned", device="cuda:0", offload=0.7, te_offload=1.0, sample_audio=True,
                 max_text_length=512, status=print):
        self.root = Path(root)
        self.fast = bool(fast)
        self.partition = partition
        self.device_torch = torch.device(device)
        self.torch_dtype = torch.bfloat16
        self.offload = float(offload)
        self.te_offload = float(te_offload)
        self.sample_audio = bool(sample_audio)
        self.max_text_length = int(max_text_length)
        self.status = status
        self.sample_step_hook = None                 # (i, n) after each step, for the worker's progress
        if self.fast:                                 # FastH3 8-Step V2: its own shift and its trained ladder, text alone
            self.video_sigma_shift = 10.0
            self.t1000_sample_ladder = True
        self.model = self.text_encoder = self.tokenizer = self.processor = self.video_vae = self.audio_vae = self.pipeline = None

    @property
    def transformer(self):
        return self.model

    # ---- loading: AI-Toolkit's MinimaxH3Model.load_model, its policy for the files as they ship ----
    def load(self):
        missing = [str(p) for p in needed(self.root, self.fast, self.partition) if not p.is_file()]
        if missing:
            raise FileNotFoundError("MiniMax H3 is not all here: " + ", ".join(missing) + " (heresy/fetch-heresy.sh --h3 int8)")
        self.status("Loading MiniMax-H3 model")
        dit = self.root / FILES["fasth3" if self.fast else self.partition]
        self.status(f"Loading transformer from {dit}")
        transformer = MiniMaxH3Transformer.load_model(str(dit), dtype=self.torch_dtype)
        if self.fast:
            if not transformer.params.gate_compress:
                raise ValueError("FastH3 needs a VSA-trained checkpoint with blocks.N.attn.to_gate_compress weights")
            transformer.vsa_sparsity = 0.8
        transformer.aitk_post_load(qtype="convrot8", offload=self.offload, dtype=self.torch_dtype, device=self.device_torch,
                                   quantize_device=self.device_torch, status_fn=self.status)
        flush()
        self.tokenizer, self.processor, self.text_encoder = self._load_text_encoder()
        flush()
        self.status("Loading video VAE")
        self.video_vae = MiniMaxH3VideoVAE.load_model(str(self.root / FILES["video_vae"])).to(self.device_torch)
        self.status("Loading audio VAE")
        self.audio_vae = MiniMaxH3AudioVAE.load_model(str(self.root / FILES["audio_vae"])).to(self.device_torch)
        flush()
        self.model = transformer
        self.pipeline = MiniMaxH3Pipeline(self)
        self.status("Model Loaded")
        return self

    def _load_text_encoder(self):
        from accelerate import init_empty_weights
        from transformers import AutoConfig, AutoProcessor, AutoTokenizer

        from h3rt.qwen3_vl import Qwen3VLTextEncoder
        from h3rt.quant.comfy_quant_import import import_comfy_quantized_layers
        from h3rt.quant.ostris_quant import OstrisLinear

        o = self.root / ORIGINAL
        tokenizer = AutoTokenizer.from_pretrained(str(o / "tokenizer"))
        processor = AutoProcessor.from_pretrained(str(o / "processor"))
        te_file = self.root / FILES["text_encoder"]
        self.status(f"Loading Qwen3-VL text encoder from {te_file}")
        # the single-file ComfyUI checkpoint: 50 decoder layers, no final norm, no lm_head; LM linears nvfp4 (AWQ), embeddings int8, vision
        # bf16. Only hidden_states[50] is read: the stack is cut to 50 layers and the final norm made an Identity below
        config = AutoConfig.from_pretrained(str(o / "text_encoder"))
        config.text_config.num_hidden_layers = TEXT_ENCODER_LAYER
        config.tie_word_embeddings = False
        with init_empty_weights():
            text_encoder = Qwen3VLTextEncoder(config)
        text_encoder.lm_head = None
        state_dict = load_file(str(te_file))

        def key_map(prefix: str) -> str:
            if prefix.startswith("model."):
                return "model.language_model." + prefix[len("model."):]
            if prefix.startswith("visual."):
                return "model." + prefix
            return prefix

        state_dict, num_quantized = import_comfy_quantized_layers(text_encoder, state_dict, orig_dtype=self.torch_dtype, key_map=key_map)
        self.status(f" - attached {num_quantized} pre-quantized nvfp4/int8 layers")
        state_dict = {key_map(k[: k.rfind(".")]) + k[k.rfind("."):]: v for k, v in state_dict.items()}
        result = text_encoder.load_state_dict(state_dict, assign=True, strict=False)
        quantized_keys = {f"{name}.weight" for name, m in text_encoder.named_modules() if isinstance(m, OstrisLinear)}
        allowed = ("lm_head", "model.language_model.norm", "model.language_model.embed_tokens")
        bad = [k for k in result.missing_keys if k not in quantized_keys and not k.startswith(allowed)]
        if bad or result.unexpected_keys:
            raise ValueError(f"MiniMax-H3 text encoder load mismatch: missing {bad[:8]}, unexpected {result.unexpected_keys[:8]}")
        del state_dict
        text_encoder.model.language_model.norm = torch.nn.Identity()
        text_encoder.eval()
        text_encoder.requires_grad_(False)
        if any(isinstance(m, OstrisLinear) for m in text_encoder.modules()):
            text_encoder.aitk_is_quantized = True
        text_encoder.aitk_post_load(qtype="nvfp4", offload=self.te_offload, dtype=self.torch_dtype, device=self.device_torch,
                                    quantize_device=self.device_torch, status_fn=self.status)
        return tokenizer, processor, text_encoder

    # ---- the prompt: AI-Toolkit's get_prompt_embeds for one prompt and its picture ----
    @torch.no_grad()
    def prompt_embeds(self, prompt, picture=None):
        """The picture is shown to the encoder as AI-Toolkit shows it: the file as it is, through a bfloat16 tensor on the card and back."""
        if self.text_encoder.device == torch.device("cpu"):
            self.text_encoder.to(self.device_torch)
        keyframes = None
        if picture is not None:
            img = picture.convert("RGB") if isinstance(picture, Image.Image) else Image.open(picture).convert("RGB")   # HERESY 1879b: a chunk's picture
            t = torch.from_numpy(np.asarray(img)).permute(2, 0, 1).float().div(255.0).to(self.device_torch, dtype=self.torch_dtype)
            arr = (t.float().clamp(0, 1) * 255).round().to(torch.uint8)
            keyframes = [Image.fromarray(arr.permute(1, 2, 0).cpu().numpy())]
        embeds, tags = encode_minimax_h3_prompt(self.text_encoder, self.tokenizer, self.processor, str(prompt).strip(), keyframes=keyframes,
                                                device=self.device_torch, dtype=self.torch_dtype, max_length=self.max_text_length)
        return PromptEmbeds([embeds], [tags])

    # ---- the VAEs, as the sampler asks for them ----
    @torch.no_grad()
    def encode_keyframe_latents(self, frames: torch.Tensor) -> torch.Tensor:
        """(B, 3, 1, H, W) in [-1, 1] → normalized latents, the released recipe: a seeded posterior sample (seed 42, whatever the shot's
        seed) rounded to fp16 before normalization."""
        generator = torch.Generator(device="cpu").manual_seed(packing.KEYFRAME_ENCODE_SEED)
        latents = self.video_vae.encode(frames.to(self.device_torch, self.video_vae.dtype), sample=True, generator=generator, fp16_round=True)
        return latents.float()

    def decode_latents(self, latents: torch.Tensor, device=None, dtype=None):
        video = self.video_vae.decode(latents.to(self.video_vae.device, self.video_vae.dtype))
        return video if device is None else video.to(device, dtype=dtype)

    def decode_audio_latents(self, latents: torch.Tensor):
        return self.audio_vae.decode(latents.to(self.audio_vae.device, torch.float32))

    def _pdd_weights(self, sigma_v, sigma_v_next=None):
        n = self.model.params.pdd_steps
        if n <= 1:
            return None
        return packing.build_pdd_weights(sigma_v.flatten().tolist(), n, self.video_sigma_shift,
                                         sigma_v_next=None if sigma_v_next is None else sigma_v_next.flatten().tolist())

    def _emit_sample_step(self, x0, i, n):
        self.sample_step_hook(i + 1, n)

    # ---- a shot ----
    @torch.no_grad()
    def shoot(self, prompt, out, width=1344, height=768, frames=121, steps=28, seed=1, first=None):
        """One shot into out (.mp4, its sound with it); returns what it took. first: a picture for the first frame (FL2VA; FastH3 takes
        text alone). The draw is AI-Toolkit's: torch's global CPU generator seeded, then the prompt, then the sampler."""
        t0 = time.time()
        if self.fast:
            first = None
        torch.manual_seed(int(seed))
        torch.cuda.manual_seed(int(seed))
        generator = torch.manual_seed(int(seed))
        embeds = self.prompt_embeds(prompt, first)
        sc = 32                                         # 16× VAE compression × 2×2 patch
        width = max(sc, int(width) // sc * sc)
        height = max(sc, int(height) // sc * sc)
        frames = packing.align_num_frames_down(int(frames)) if int(frames) > 1 else 1
        ctrl = None
        if first is not None:
            ctrl = packing.prepare_keyframe_image(Image.open(first).convert("RGB"), height, width, stretch=True)
        per = chunk_latents(width, height)
        if frames > 1 and packing.video_latent_num_frames(frames) > per:   # HERESY 1879: past one card, in chunks, decoded as one
            return self._shoot_chunks(prompt, out, embeds, ctrl, width, height, frames, int(steps), int(seed), per, t0)
        result = self.pipeline(conditional_embeds=embeds, height=height, width=width, num_frames=frames, num_inference_steps=int(steps),
                               generator=generator, ctrl_img=ctrl, with_audio=self.sample_audio and frames > 1)
        if frames == 1:
            result[0].save(out)
        else:
            write_mp4(out, result["video"], result["fps"], result.get("audio"), result.get("audio_sample_rate"))
        flush()
        return {"frames": frames, "width": width, "height": height, "took_s": round(time.time() - t0, 1)}


    # HERESY 1879 (Viktor 29.10.2026: «Придётся резать на куски… абы таки на склейке не было разницы по песку латентов»): a shot longer than one card
    # holds, made chunk after chunk. A chunk but the last keeps its whole groups of latent frames (a group is 17 frames: the first one and four of
    # four), so the chunks lie end to end on the VAE's own grid; each next chunk carries the last CONTEXT latent frames of the one before at their
    # own times before its frame 0 (the community's H3 Extend, two frames), noise-augmented as a keyframe is; the whole shot decoded in one pass,
    # so its grain does not change at a seam. The first chunk keeps the shot's picture as its first frame; the others take the prompt alone.
    def _seam_picture(self, lat, width, height):
        """HERESY 1879b: a chunk's last frame, its last whole group decoded alone, as the next chunk's picture."""
        v = self.decode_latents(lat[:, :, -5:])
        f = ((v[0, :, -1].float().clamp(-1, 1) + 1.0) * 127.5).round().to(torch.uint8).permute(1, 2, 0).cpu().numpy()
        flush()
        return packing.prepare_keyframe_image(Image.fromarray(f), height, width, stretch=True)

    def _shoot_chunks(self, prompt, out, embeds, ctrl, width, height, frames, steps, seed, per, t0):
        keep = per - 2
        grid = packing._temporal_position_grid(per, 0.0)
        total = packing.video_latent_num_frames(frames)
        want = 17 * (total - 2) // 5 + 5
        plan, made = [], 0
        while True:                                     # each chunk's latent frames
            rest = total - made
            if rest <= per:
                plan.append(rest)
                break
            plan.append(per)
            made += keep
        hook, kept, plain, cuts = self.sample_step_hook, [], None, []
        for c, n_lat in enumerate(plan):
            last = c == len(plan) - 1
            n_frames = 17 * (n_lat - 2) // 5 + 5
            if hook:
                self.sample_step_hook = lambda i, n, c=c: hook(c * n + i, n * len(plan))
            kw = dict(height=height, width=width, num_frames=n_frames, num_inference_steps=steps, generator=torch.manual_seed(seed + c),
                      with_audio=False, decode=False)
            if c == 0:
                r = self.pipeline(conditional_embeds=embeds, ctrl_img=ctrl, **kw)
            else:
                ctx = kept[-1][:, :, -CONTEXT:]
                offs = [float(grid[keep - CONTEXT + j] - grid[keep]) for j in range(CONTEXT)]
                if SEAM:                                # HERESY 1879b: the chunk before's last frame, this chunk's picture
                    pic = self._seam_picture(kept[-1], width, height)
                    cuts.append(17 * sum(k.shape[2] for k in kept) // 5)
                    r = self.pipeline(conditional_embeds=self.prompt_embeds(prompt, pic), ctrl_img=pic, context_latents=ctx, context_offsets=offs,
                                      ctrl_time=None if SEAM == "first" else -packing._ROPE_FRAME_RESCALE, **kw)
                else:
                    plain = plain or self.prompt_embeds(prompt, None)
                    r = self.pipeline(conditional_embeds=plain, context_latents=ctx, context_offsets=offs, **kw)
            lat = r["latents"]
            kept.append(lat if last else lat[:, :, :keep])
            flush()
        self.sample_step_hook = hook
        latents = torch.cat(kept, dim=2)
        video = self.decode_latents(latents)
        video = ((video.float().clamp(-1, 1) + 1.0) * 127.5).round().to(torch.uint8)[0].permute(1, 2, 3, 0).cpu()
        if SEAM == "first" and cuts:                    # HERESY 1879b: each seam's frame made twice: its copy out
            drop = set(cuts)
            video = video[[i for i in range(video.shape[0]) if i not in drop]]
            if video.shape[0] < want:                   # a frame a seam: the last one held for them (42 ms each), the clip cuts a shot to its time anyway
                video = torch.cat([video, video[-1:].expand(want - video.shape[0], -1, -1, -1)])
        write_mp4(out, video, packing.FPS)
        flush()
        return {"frames": int(video.shape[0]), "width": width, "height": height, "chunks": len(plan), "took_s": round(time.time() - t0, 1)}


MAX_TOKENS = 33000      # HERESY 1879: measured 29.10 on a 3090, 70 % of the DiT in RAM: 768p × 107 frames (32 256 tokens) 22.1 GB; 480p × 226 (26 130) 18.6 GB
CONTEXT = 2             # the latent frames of the chunk before carried into the next (the community's H3 Extend starts at two)
SEAM = "first"          # HERESY 1879b: the chunk before's last frame as the next one's picture at its frame 0 (measured 29.10: no seam), "before" it, or None


def chunk_latents(width, height):
    """The most latent frames one pass holds at this size: whole groups of five and the first frame's two (5n + 2)."""
    per = max(1, (int(height) // 32) * (int(width) // 32))
    return 5 * max(1, (MAX_TOKENS // per - 2) // 5) + 2


def write_mp4(out, video, fps, audio=None, sample_rate=None):
    """(T, H, W, 3) uint8 frames and (2, samples) float audio → an H.264 .mp4 with AAC sound, by the studio's ffmpeg."""
    t, h, w, _ = video.shape
    out = Path(out)
    with tempfile.TemporaryDirectory(dir=out.parent) as tmp:
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "pipe:0"]
        if audio is not None:
            raw = Path(tmp) / "audio.f32"
            audio.float().clamp(-1, 1).T.contiguous().numpy().astype("<f4").tofile(raw)
            cmd += ["-f", "f32le", "-ar", str(int(sample_rate)), "-ac", str(int(audio.shape[0])), "-i", str(raw), "-c:a", "aac", "-b:a", "192k"]
        cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
        p = subprocess.run(cmd, input=video.contiguous().numpy().tobytes(), capture_output=True)
        if p.returncode != 0:
            raise RuntimeError("ffmpeg: " + p.stderr.decode("utf-8", "replace")[-400:])
