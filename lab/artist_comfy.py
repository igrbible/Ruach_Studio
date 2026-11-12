"""HERESY 2332 (Viktor 09.11.2026: «выход из ComfyUI… перенести мои два воркфлоу»; the orders protocol: «Перенос твоих двух воркфлоу»):
ComfyUI's way of painting with Qwen-Image 2512, rebuilt in the Artist, so that his two workflows run here without ComfyUI:

    AIO QWEN IMAGE 2512 HERESY Draft #4   his cover painter: two passes and the 8K chain (artist_upscale's passes)
    Ultimate Samplers Testing             his grid: samplers × schedules × an adapter's strengths × fine-tunes × prompts, one run

The same seed paints the same picture as there, because each part is ComfyUI's own arithmetic (GPL-3.0, which the Studio's AGPL may
take) or the custom nodes' (SeedVarianceEnhancer, MIT-0): the starting noise drawn on the CPU from the seed in the latent's own shape,
ER-SDE's noise on the card from the same seed, the schedules from the model's own sampling (Qwen-Image's flow shift 1.15, or
ModelSamplingFlux's max and base shift by the picture's size as his AIO #4 patches it), the guidance as ComfyUI's (x0 = uncond + cfg ·
(cond − uncond), no rescale) with Skimmed CFG's linear interpolation (its rule re-said here from its mathematics: the node's repository
names no licence), the conditioning as entries that each act within their share of the steps and are averaged (ConditioningZeroOut,
ConditioningConcat, SeedVarianceEnhancer), a LoRA hooked to some entries only whose strength follows keyframes (ComfyUI's hooks, its
keyframe rule as comfy/hooks.py has it), the sigma given to the model in float32 (diffusers would round it to bfloat16).
RES4LYF's samplers and bong_tangent come from lab/artist_samplers.py (their mathematics only, HERESY 1333).

And three things diffusers does its own way are done ComfyUI's way, each measured on the CPU against ComfyUI's own code equal to the
bit: the adapters laid into an fp8 painter (merged in float16, rounded back to fp8 by chance with each layer's seed, the hooked one on
top while its entry paints: Fp8Lora), the painter's forward (its rotary table in bfloat16, its fused multiply-adds and norms:
comfy_forward), and the text encoder (its file's bfloat16 kept, float32 at work: comfy_te). What stays diffusers' is the VAE and
its tiles. ComfyUI's dynamic VRAM (its default since comfy-aimdo, when nothing is hooked) lays the adapters its own way again, a
layer's first pass unrounded and the seed of its name: followed so when nothing is hooked (Fp8Lora.arm_dynamic; merge "fp8" asks for
the classic load instead), the classic load under hooks, as ComfyUI itself does.

    ask["comfy"] = {cfg, skim, zero_neg, also, variance: {pct, strength, switch, seed}, hook: {id, weight, trigger, keys, main}, encoder,
                    vae, sampling: {kind: flow|flux, shift | max_shift, base_shift}, seed, start, inject_seed, keep_size, match,
                    merge: auto|fp8|dynamic|peft, forward: comfy|diffusers, te32}
    ask["grid"]  = {cells: [{sampler, schedule, steps, cfg, loras: {id: weight}, model, prompt, seed}], prompts: [...], axes: {...}}
"""
import gc, json, math, os, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import art_job  # noqa: E402
import artist_loras  # noqa: E402
import paths  # noqa: E402   HERESY 2330: where the weights live

KIT = art_job.KIT
ONLY = {int(x) for x in os.environ.get("ART_ONLY", "").split(",") if x.strip().isdigit()}
Q2512 = paths.at(paths.ARTIST, KIT) / "Qwen-Image-2512"
ENCODERS = Q2512 / "encoders"          # his ComfyUI text encoders (Qwen2.5-VL-7B in ComfyUI's single file), the Studio's copy
VAES = Q2512 / "vaes"                  # his ComfyUI VAEs (Wan 2.1's layout), the Studio's copy
ENCODER_FILES = {"abliterated": "Qwen2.5-VL-7B-Abliterated-bf16.safetensors"}
VAE_FILES = {"clear": "qwen_image_clear_vae.safetensors"}
SAMPLERS = ("euler", "er_sde", "res_2s", "res_2s_ode", "res_3s", "res_3s_ode", "heunpp2", "exp_heun_2_x0", "exp_heun_2_x0_sde")
SCHEDULES = ("simple", "normal", "sgm_uniform", "beta", "beta57", "kl_optimal", "karras", "exponential", "bong_tangent")
LATENTS_MEAN = [-0.7571, -0.7089, -0.9113, 0.1075, -0.1745, 0.9653, -0.1517, 1.5508,
                0.4134, -0.0715, 0.5517, -0.3632, -0.1922, -0.9497, 0.2503, -0.2921]
LATENTS_STD = [2.8184, 1.4541, 2.3275, 2.6558, 1.2196, 1.7708, 2.6052, 2.0743,
               3.2687, 2.1526, 2.8652, 1.5579, 1.6382, 1.1253, 2.8251, 1.9160]
THUMB = 512


def say(**row):
    """A line for the lab on stdout: a picture, a step's picture, the adapters on, the end."""
    print(json.dumps(row, ensure_ascii=False), flush=True)


def note(text):
    """A line for the log on stderr (the lab's watchdog hears it as the painter alive; it never becomes a picture)."""
    print("comfy · " + text, file=sys.stderr, flush=True)


# ------------------------------------------------------------------------------------------------ the model's sampling (ComfyUI)
class Sampling:
    """ComfyUI's model sampling for Qwen-Image: its own (ModelSamplingDiscreteFlow, shift 1.15, multiplier 1, a thousand points) or
    ModelSamplingFlux's (his AIO #4: max_shift and base_shift by the picture's size, ten thousand points). sigma(t), percent_to_sigma(p),
    the table of sigmas, its least and greatest, as comfy/model_sampling.py has them."""

    def __init__(self, kind="flow", shift=1.15, max_shift=1.15, base_shift=0.5, w=1024, h=1024):
        import torch
        self.kind = kind
        if kind == "flux":
            x1, x2 = 256, 4096
            mm = (max_shift - base_shift) / (x2 - x1)
            b = base_shift - mm * x1
            self.shift = (w * h / (8 * 8 * 2 * 2)) * mm + b
            self.sigmas = self.sigma(torch.arange(1, 10001, 1) / 10000)
        else:
            self.shift = float(shift)
            self.sigmas = self.sigma((torch.arange(1, 1001, 1) / 1000) * 1.0)

    def sigma(self, t):
        if self.kind == "flux":
            return math.exp(self.shift) / (math.exp(self.shift) + (1 / t - 1) ** 1.0)
        a = self.shift
        return t if a == 1.0 else a * t / (1 + (a - 1) * t)

    def timestep(self, sigma):
        return sigma

    @property
    def sigma_min(self):
        return self.sigmas[0]

    @property
    def sigma_max(self):
        return self.sigmas[-1]

    def percent_to_sigma(self, p):
        if p <= 0.0:
            return 1.0
        if p >= 1.0:
            return 0.0
        return self.sigma(1.0 - p)


def schedule(ms, name, steps):
    """The sigmas of a schedule (steps + 1, the last 0) as ComfyUI computes them from the model's sampling; bong_tangent RES4LYF's (its
    mathematics, artist_samplers.bong_tangent), beta57 ComfyUI's beta at 0.5 and 0.7."""
    import numpy
    import torch
    if name == "simple":
        ss = len(ms.sigmas) / steps
        return torch.FloatTensor([float(ms.sigmas[-(1 + int(x * ss))]) for x in range(steps)] + [0.0])
    if name in ("normal", "sgm_uniform"):
        start, end = ms.timestep(ms.sigma_max), ms.timestep(ms.sigma_min)
        zero = True
        if name == "sgm_uniform":
            ts = torch.linspace(start, end, steps + 1)[:-1]
        else:
            if math.isclose(float(ms.sigma(end)), 0, abs_tol=0.00001):
                steps += 1
                zero = False
            ts = torch.linspace(start, end, steps)
        sigs = [float(ms.sigma(t)) for t in ts]
        return torch.FloatTensor(sigs + ([0.0] if zero else []))
    if name in ("beta", "beta57"):
        import scipy.stats
        a, b = (0.5, 0.7) if name == "beta57" else (0.6, 0.6)
        total = len(ms.sigmas) - 1
        ts = numpy.rint(scipy.stats.beta.ppf(1 - numpy.linspace(0, 1, steps, endpoint=False), a, b) * total)
        sigs, last = [], -1
        for t in ts:
            if t != last:
                sigs.append(float(ms.sigmas[int(t)]))
            last = t
        return torch.FloatTensor(sigs + [0.0])
    smin, smax = float(ms.sigma_min), float(ms.sigma_max)
    if name == "kl_optimal":
        k = torch.arange(steps, dtype=torch.float).div_(steps - 1)
        out = k.new_zeros(steps + 1)
        out[:-1] = (k * math.atan(smin) + (1 - k) * math.atan(smax)).tan_()
        return out
    if name == "karras":
        ramp = torch.linspace(0, 1, steps)
        lo, hi = smin ** (1 / 7.0), smax ** (1 / 7.0)
        return torch.cat([(hi + ramp * (lo - hi)) ** 7.0, torch.zeros(1)])
    if name == "exponential":
        return torch.cat([torch.linspace(math.log(smax), math.log(smin), steps).exp(), torch.zeros(1)])
    if name == "bong_tangent":
        import artist_samplers
        return torch.tensor([float(v) for v in artist_samplers.bong_tangent(steps)], dtype=torch.float32)
    raise ValueError("no such schedule: " + str(name))


# ------------------------------------------------------------------------------------------------ the latents' own shapes
def norm_stats(device, dtype):
    import torch
    m = torch.tensor(LATENTS_MEAN, device=device, dtype=dtype).view(1, 16, 1, 1, 1)
    s = torch.tensor(LATENTS_STD, device=device, dtype=dtype).view(1, 16, 1, 1, 1)
    return m, s


def pack(x5):
    """[1, 16, 1, h, w] (ComfyUI's latent) → [1, (h/2)·(w/2), 64] (the transformer's tokens, in the order both ComfyUI and diffusers patch)."""
    b, c, _, h, w = x5.shape
    x = x5[:, :, 0].reshape(b, c, h // 2, 2, w // 2, 2).permute(0, 2, 4, 1, 3, 5)
    return x.reshape(b, (h // 2) * (w // 2), c * 4)


def unpack(x, h, w):
    """The tokens back to [1, 16, 1, h, w]."""
    b = x.shape[0]
    x = x.reshape(b, h // 2, w // 2, 16, 2, 2).permute(0, 3, 1, 4, 2, 5)
    return x.reshape(b, 16, h, w).unsqueeze(2)


def comfy_noise(seed, h, w):
    """KSamplerAdvanced's noise: torch.manual_seed(seed), randn in the latent's shape [1, 16, 1, h, w] on the CPU, float32."""
    import torch
    g = torch.manual_seed(int(seed))
    return torch.randn([1, 16, 1, h, w], dtype=torch.float32, generator=g, device="cpu")


class StepNoise:
    """ComfyUI's default noise sampler for a stochastic sampler: a generator on the card seeded with the run's seed, randn of the latent's
    own shape each call, packed."""

    def __init__(self, seed, h, w, device):
        import torch
        self.g = torch.Generator(device=device)
        self.g.manual_seed(int(seed))
        self.h, self.w, self.device = h, w, device

    def __call__(self, *_):
        import torch
        return pack(torch.randn([1, 16, 1, self.h, self.w], dtype=torch.float32, device=self.device, generator=self.g))


# ------------------------------------------------------------------------------------------------ the conditioning
class Entry:
    """One entry of a ComfyUI conditioning: its tokens [1, L, 3584] (float32, CPU), whether the hooked adapter acts on it, the share of the
    steps it acts in (start, end percent; None for all)."""

    def __init__(self, emb, hooked=False, start=None, end=None):
        self.emb, self.hooked, self.start, self.end = emb, hooked, start, end
        self.t_start = self.t_end = None

    def at(self, ms):
        self.t_start = ms.percent_to_sigma(self.start) if self.start is not None else None
        self.t_end = ms.percent_to_sigma(self.end) if self.end is not None else None
        return self

    def acts(self, sigma):
        if self.t_start is not None and sigma > self.t_start:
            return False
        if self.t_end is not None and sigma < self.t_end:
            return False
        return True


def concat(entries, more):
    """ConditioningConcat: each entry's tokens followed by the first tokens of «more»."""
    import torch
    return [Entry(torch.cat((e.emb, more), 1), e.hooked, e.start, e.end) for e in entries]


def zero_out(entries):
    """ConditioningZeroOut: the same entries, their tokens zeros."""
    import torch
    return [Entry(torch.zeros_like(e.emb), e.hooked, e.start, e.end) for e in entries]


def variance(entries, pct=50.0, strength=20.0, switch=20.0, seed=0, where="beginning"):
    """SeedVarianceEnhancer 2.2 (ChangeTheConstants, MIT-0), «noise on beginning steps»: of two entries or more, the first is noised (uniform
    noise of ±strength on pct % of its values, the CPU's generator seeded with seed, then seed + 1 for the choice) and acts until switch %,
    the second after it; of one, the same entry noised, then itself. Null tokens and a mask of the prompt's start or end are not used
    here (his workflows have none)."""
    import torch
    if not entries or not strength:
        return entries
    pct, sw = max(1.0, min(100.0, pct)) / 100, max(1.0, min(99.0, switch)) / 100
    first = entries[0]
    other = entries[1] if len(entries) >= 2 else entries[0]
    reset = True
    if int(strength / 1000000000) == 1:                # the node's own way back to its 2.1 seeds
        strength -= 1000000000
        reset = False
    torch.manual_seed(int(seed))
    noise = torch.rand_like(first.emb) * 2 * strength - strength
    if reset:
        torch.manual_seed(int(seed) + 1)
    chosen = torch.bernoulli(torch.ones_like(first.emb) * pct).bool()
    noisy = Entry(first.emb + noise * chosen, first.hooked, 0.0, sw)
    return [noisy, Entry(other.emb, other.hooked, sw, 1.0)]


# ------------------------------------------------------------------------------------------------ a LoRA hooked by keyframes
class Keyframes:
    """ComfyUI's hook keyframes (comfy/hooks.py HookKeyframeGroup): [(start percent, strength multiplier, guarantee steps)], sorted by
    their start (equal starts keep their order); each start a sigma by the model's sampling; at each step the one in force by the rule
    there (a keyframe with guaranteed steps holds them, the search for the next stops at the first not started yet)."""

    def __init__(self, keys):
        self.keys = sorted([(float(p), float(s), int(g)) for p, s, g in keys], key=lambda k: k[0])
        self.t = []
        self.reset()

    def start(self, ms, max_sigma):
        self.t = [ms.percent_to_sigma(p) for p, _, _ in self.keys]
        self.max_sigma = float(max_sigma)
        self.reset()

    def reset(self):
        self.i, self.used, self.curr = 0, 0, None

    def _guar(self, i):
        return 0 if self.t[i] > self.max_sigma else self.keys[i][2]

    def strength(self, sigma):
        """The multiplier in force at this sigma (called once a model evaluation; a second call at the same sigma changes nothing)."""
        if not self.keys:
            return 1.0
        sigma = float(sigma)
        if sigma != self.curr:
            if self.used >= self._guar(self.i):
                for j in range(self.i + 1, len(self.keys)):
                    if self.t[j] >= sigma:
                        self.i, self.used = j, 0
                        if self._guar(j) > 0:
                            break
                    else:
                        break
            self.used += 1
            self.curr = sigma
        return self.keys[self.i][1]


def interpolated(keys, s0, s1, how, p0, p1, count):
    """CreateHookKeyframesInterpolated: count keyframes from p0 to p1 (linear in the share of steps), their strengths from s0 to s1 by how
    (linear, ease_in, ease_out, ease_in_out); the first holds a step."""
    import numpy as np
    import torch
    ps = torch.linspace(p0, p1, count)
    idx = torch.linspace(0, 1, count)
    d = s1 - s0
    if how == "linear":
        ss = torch.linspace(s0, s1, count)
    elif how == "ease_in":
        ss = d * np.power(idx, 2) + s0
    elif how == "ease_out":
        ss = d * (1 - np.power(1 - idx, 2)) + s0
    else:
        ss = d * ((1 - np.cos(idx * np.pi)) / 2) + s0
    return keys + [(float(p), float(s), 1 if k == 0 else 0) for k, (p, s) in enumerate(zip(ps, ss))]


def his_keys(steps):
    """His AIO #4's «QW Character LoRA Hooks» as ComfyUI runs them: a keyframe at 0 (strength 0), then 0.4 → 1 linear from 30 % to 50 %,
    1 → 1 from 50 % to 80 %, 1 → 0.8 ease-out from 80 % to 100 %, each with as many keyframes as the steps. Its «MAIN CONTROL» keyframes
    (0 → 1 ease-in, 30 % → 100 %) are not here: ComfyUI's CombineHooks keeps one hook of the same LoRA node, the first (measured on his
    QWEN2_00075's graph, HERESY 2332); they are main_keys, laid over these by Both when asked (HERESY 2360)."""
    k = [(0.0, 0.0, 1)]
    k = interpolated(k, 0.4, 1.0, "linear", 0.3, 0.5, steps)
    k = interpolated(k, 1.0, 1.0, "linear", 0.5, 0.8, steps)
    return interpolated(k, 1.0, 0.8, "ease_out", 0.8, 1.0, steps)


# HERESY 2360 (Viktor 11.11.2026, the report's advice taken: «как задумал: рабочая ручка лучше копии чужого бага»): his graph's «MAIN CONTROL - Create
# Hook Keyframes» sets a second keyframe group on the same hooked adapter and combines the two hooks; ComfyUI keeps the first of two hooks of one
# LoRA node and drops it, so in ComfyUI it does nothing. Here it does what its name says: a master envelope over the character's keyframes, its
# strength multiplied into theirs at every step (0 until it starts, his ease-in from 0 at 30 % to 1 at 100 %). Off, the run is ComfyUI's to the bit.
MAIN = {"from": 0.0, "to": 1.0, "how": "ease_in", "start": 0.3, "end": 1.0}
CURVES = ("linear", "ease_in", "ease_out", "ease_in_out")


def main_keys(m, steps):
    """MAIN CONTROL's keyframes as his node makes them (CreateHookKeyframesInterpolated with no keyframes before it): count keyframes from its
    start to its end, from «from» to «to» by its curve; before its start its first keyframe holds (strength «from»)."""
    m = dict(MAIN, **(m or {}))
    return interpolated([], float(m["from"]), float(m["to"]), str(m["how"]), float(m["start"]), float(m["end"]), int(steps))


class Both:
    """Two keyframe groups on one hooked adapter, each stepped by ComfyUI's own rule (Keyframes), their strengths multiplied: the character's
    shape under MAIN CONTROL's envelope (HERESY 2360)."""

    def __init__(self, a, b):
        self.a, self.b = a, b

    def start(self, ms, max_sigma):
        self.a.start(ms, max_sigma)
        self.b.start(ms, max_sigma)

    def reset(self):
        self.a.reset()
        self.b.reset()

    def strength(self, sigma):
        return self.a.strength(sigma) * self.b.strength(sigma)


def hook_keys(hook):
    """The hooked adapter's keyframes for a run: its own (hook «keys») or his character's (his_keys, his Steps slider's count), under MAIN
    CONTROL's envelope when hook «main» asks it (HERESY 2360)."""
    hook = hook or {}
    count = int(hook.get("count") or 12)
    kf = Keyframes(hook.get("keys") or his_keys(count))
    if hook.get("main"):
        kf = Both(kf, Keyframes(main_keys(hook["main"], count)))
    return kf


def laying(c):
    """How the adapters go into an fp8 painter, as today's ComfyUI chooses (HERESY 2332): «dynamic» (its dynamic VRAM's way, its default) when
    nothing is hooked, «classic» under hooks; merge «fp8» asks the classic load, «dynamic» the dynamic way where nothing is hooked."""
    return "dynamic" if (c.get("merge") or "auto") in ("auto", "dynamic") and not c.get("hook") else "classic"


# ------------------------------------------------------------------------------------------------ the parts: encoder, VAE
def swap_encoder(pipe, name):
    """The text encoder's weights replaced in place by one of his ComfyUI files (models/artist/Qwen-Image-2512/encoders/): its keys in the old
    layout (model.layers…, visual…) put where transformers 5 keeps them; its own lm_head none (never used to read a prompt: the one there
    stays)."""
    from safetensors.torch import load_file
    f = ENCODERS / ENCODER_FILES[name]
    if not f.is_file():
        raise RuntimeError(f"the text encoder «{name}» is not here: {f.name} goes into {paths.ARTIST}/Qwen-Image-2512/encoders/")
    sd = load_file(str(f))
    have = set(pipe.text_encoder.state_dict().keys())
    out = {}
    for k, v in sd.items():
        if k.startswith("visual."):
            k = "model." + k
        elif k.startswith("model.") and not k.startswith("model.language_model.") and not k.startswith("model.visual."):
            k = "model.language_model." + k[len("model."):]
        out[k] = v
    missing = sorted(have - set(out))
    extra = sorted(set(out) - have)
    if extra or [m for m in missing if m != "lm_head.weight"]:
        raise RuntimeError(f"{f.name} does not fit Qwen2.5-VL-7B here: {len(extra)} keys of its own, {len(missing)} missing")
    pipe.text_encoder.load_state_dict(out, strict=False, assign=False)
    del sd, out
    gc.collect()
    return f.name


def swap_vae(pipe, name):
    """The VAE's weights replaced in place by one of his ComfyUI VAEs (models/artist/Qwen-Image-2512/vaes/), Wan 2.1's layout brought to diffusers'
    by diffusers' own converter (it gives the Studio's VAE back tensor for tensor from ComfyUI's qwen_image_vae, measured 10.11.2026)."""
    from diffusers.loaders.single_file_utils import convert_wan_vae_to_diffusers
    from safetensors.torch import load_file
    f = VAES / VAE_FILES[name]
    if not f.is_file():
        raise RuntimeError(f"the VAE «{name}» is not here: {f.name} goes into {paths.ARTIST}/Qwen-Image-2512/vaes/")
    sd = convert_wan_vae_to_diffusers(dict(load_file(str(f))))
    dt = next(pipe.vae.parameters()).dtype
    pipe.vae.load_state_dict({k: v.to(dt) for k, v in sd.items()}, strict=True)
    return f.name


def encode(pipe, text, device, f32=False):
    """A prompt read as ComfyUI's Qwen-Image text encoder reads it: the template around it, the last hidden state, from the token after
    «<|im_start|>user\\n» to the end (float32 on the CPU, as ComfyUI keeps a conditioning). f32: read by comfy_te, ComfyUI's own way."""
    import torch
    tpl = "<|im_start|>system\nDescribe the image by detailing the color, shape, size, texture, quantity, text, spatial relationships of the objects and background:<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n"
    ids = pipe.tokenizer(tpl.format(text), return_tensors="pt").input_ids
    row = ids[0].tolist()
    end, seen = -1, 0
    for i, v in enumerate(row):
        if v == 151644 and seen < 2:
            end, seen = i, seen + 1
    if len(row) > end + 3 and row[end + 1] == 872 and row[end + 2] == 198:
        end += 3
    te = pipe.text_encoder
    with torch.inference_mode():
        if f32:
            hs = comfy_te(te.model.language_model, ids.to(device))
        else:
            out = te.model(input_ids=ids.to(device), attention_mask=torch.ones_like(ids).to(device), output_hidden_states=True)
            hs = out.hidden_states[-1] if getattr(out, "hidden_states", None) is not None else out.last_hidden_state
    return hs[:, end:].float().cpu()


def comfy_te(lm, ids):
    """Qwen2.5-VL's text model as ComfyUI's llama.py computes a prompt (sd1_clip with float32 at work, comfy.ops.manual_cast), on
    transformers' own weights (bfloat16, as ComfyUI keeps them): the tokens embedded out in float32; per layer torch's fused rms_norm, the projections with
    their weights cast to float32, the rotary turn from float32 cos and sin (one product, two fused adds), the four key heads repeated to
    twenty-eight, torch's attention under an additive causal mask of float32's min / 4, the residual adds, SiLU's gate; the last norm.
    Returns the last hidden state [1, tokens, 3584], float32."""
    import torch
    F = torch.nn.functional
    cfg = lm.config
    nh, nkv = cfg.num_attention_heads, cfg.num_key_value_heads
    hd = getattr(cfg, "head_dim", None) or cfg.hidden_size // nh
    x = F.embedding(ids, lm.embed_tokens.weight).to(torch.float32)
    b, n = ids.shape
    dev = ids.device
    num = torch.arange(0, hd, 2, device=dev).float()
    theta = getattr(cfg, "rope_theta", None) or (getattr(cfg, "rope_parameters", None) or {}).get("rope_theta") or 1000000.0
    inv = 1.0 / (float(theta) ** (num / hd))
    pos = torch.arange(0, n, device=dev).unsqueeze(0)
    freqs = (inv[None, :, None].float().expand(pos.shape[0], -1, 1).float() @ pos[:, None, :].float()).transpose(1, 2)
    emb = torch.cat((freqs, freqs), dim=-1)
    cos, sin = emb.cos().unsqueeze(1), emb.sin().unsqueeze(1)
    half = sin.shape[-1] // 2
    sin_a, nsin = sin[..., :half], -sin[..., half:]
    mask = 1.0 - torch.ones((b, n), device=dev).to(x.dtype).reshape((b, 1, -1, n)).expand(b, 1, n, n)
    mask = mask.masked_fill(mask.to(torch.bool), torch.finfo(x.dtype).min / 4)
    mask = mask + torch.empty(n, n, dtype=x.dtype, device=dev).fill_(torch.finfo(x.dtype).min / 4).triu_(1)

    def lin(m, t):
        return F.linear(t, m.weight.to(t.dtype), m.bias.to(t.dtype) if m.bias is not None else None)

    def rms(m, t):
        return F.rms_norm(t, m.weight.shape, m.weight.to(t.dtype), getattr(m, "variance_epsilon", getattr(m, "eps", 1e-6)))

    def turn(t):
        e = t * cos
        h = e.shape[-1] // 2
        e[..., :h].addcmul_(t[..., h:], nsin)
        e[..., h:].addcmul_(t[..., :h], sin_a)
        return e
    for layer in lm.layers:
        at = layer.self_attn
        r = x
        h = rms(layer.input_layernorm, x)
        q = lin(at.q_proj, h).view(b, n, nh, hd).transpose(1, 2)
        k = lin(at.k_proj, h).view(b, n, nkv, hd).transpose(1, 2)
        v = lin(at.v_proj, h).view(b, n, nkv, hd).transpose(1, 2)
        q, k = turn(q).to(x.dtype), turn(k).to(x.dtype)
        k = k.repeat_interleave(nh // nkv, dim=1)
        v = v.repeat_interleave(nh // nkv, dim=1)
        o = F.scaled_dot_product_attention(q, k, v, attn_mask=mask, dropout_p=0.0, is_causal=False)
        o = lin(at.o_proj, o.transpose(1, 2).reshape(b, -1, nh * hd))
        x = r + o
        r = x
        h = rms(layer.post_attention_layernorm, x)
        mlp = layer.mlp
        x = r + lin(mlp.down_proj, F.silu(lin(mlp.gate_proj, h)) * lin(mlp.up_proj, h))
    return rms(lm.norm, x)


# ------------------------------------------------------------------------------------------------ LoRAs laid into fp8 as ComfyUI lays them
def string_to_seed(data):
    """comfy.utils.string_to_seed: a layer's seed for its rounding, the CRC-32 of its key."""
    crc = 0xFFFFFFFF
    for ch in data:
        crc ^= ord(ch)
        for _ in range(8):
            crc = (crc >> 1) ^ 0xEDB88320 if crc & 1 else crc >> 1
    return crc ^ 0xFFFFFFFF


def _round_fp8(x, dtype, generator):
    """comfy.float.manual_stochastic_round_to_float8: x in float16, its mantissa rounded up with the chance of its remainder."""
    import torch
    eb_, mb_, bias = (4, 3, 7) if dtype == torch.float8_e4m3fn else (5, 2, 15)
    x = x.half()
    sign = torch.sign(x)
    a = x.abs()
    sign = torch.where(a == 0, 0, sign)
    exponent = torch.clamp(torch.floor(torch.log2(a)) + bias, 0, 2 ** eb_ - 1)
    normal = ~(exponent == 0)
    m = torch.where(normal, (a / (2.0 ** (exponent - bias)) - 1.0) * (2 ** mb_), (a / (2.0 ** (-bias + 1 - mb_))))
    m += torch.rand(m.size(), dtype=m.dtype, layout=m.layout, device=m.device, generator=generator)
    a[:] = m.floor() / (2 ** mb_)
    sign *= torch.where(normal, (2.0 ** (exponent - bias)) * (1.0 + a), (2.0 ** (-bias + 1)) * a)
    fi = torch.finfo(dtype)
    torch.clamp(sign, min=fi.min, max=fi.max, out=sign)
    return sign


def stochastic_fp8(value, dtype, seed):
    """comfy.float.stochastic_rounding to an fp8 type: a generator on the value's device seeded with the layer's seed, the rows in slices
    of about 4096² values, each slice rounded in turn."""
    import torch
    g = torch.Generator(device=value.device)
    g.manual_seed(seed)
    out = torch.empty_like(value, dtype=dtype)
    slices = max(1, (value.numel() / (4096 * 4096)))
    size = max(1, round(value.shape[0] / slices))
    for i in range(0, value.shape[0], size):
        out[i:i + size].copy_(_round_fp8(value[i:i + size], dtype, g))
    return out


def lora_parts(path, modules):
    """A LoRA file as ComfyUI reads it: {layer: (up, down, alpha / rank or 1)} by the painter's own layer names (diffusion_model. and
    transformer. taken off; kohya's lora_unet_ names found among the layers; PEFT's «.default.» out)."""
    from safetensors.torch import load_file
    sd = load_file(str(path))
    kohya = {"lora_unet_" + m.replace(".", "_"): m for m in modules}
    out = {}
    for k in sd:
        for tail_d, tail_u in ((".lora_down.weight", ".lora_up.weight"), (".lora_A.weight", ".lora_B.weight"), (".lora_A.default.weight", ".lora_B.default.weight")):
            if not k.endswith(tail_d):
                continue
            base = k[:-len(tail_d)]
            up = sd.get(base + tail_u)
            if up is None:
                continue
            name = base
            for pre in ("diffusion_model.", "transformer."):   # the prefixes ComfyUI's key map knows for Qwen-Image (PEFT's own it skips)
                if name.startswith(pre):
                    name = name[len(pre):]
            name = kohya.get(name, name)
            if name not in modules:
                continue
            down = sd[k]
            alpha = sd.get(base + ".alpha")
            out[name] = (up, down, (float(alpha.item()) / down.shape[0]) if alpha is not None else 1.0)
    return out


class Fp8Lora:
    """ComfyUI's way of putting LoRAs into an fp8 painter, so its weights are ComfyUI's to the bit: each layer's patches (up · down ·
    strength · alpha / rank, float32) added in turn to its weight in float16 on the card (lora_compute_dtype of an Ampere card), the sum
    rounded to fp8 stochastically with the layer's own seed (patch_weight_to_device); a hooked adapter's patch added in float32 to that
    while a hooked entry is painted and rounded again with the same seed (patch_hook_weight_to_device), the layer given back after."""

    def __init__(self, tr, base, hook=None, kind=None, device="cuda"):
        import torch
        self.lin = {n: m for n, m in tr.named_modules() if isinstance(m, torch.nn.Linear)}
        names = set(self.lin)
        # the fp8 the file stores every layer in (a layer diffusers keeps in bf16 holds the same fp8 values), worked where ComfyUI works it
        self.kind = kind or next((p.dtype for p in tr.parameters() if p.dtype in (torch.float8_e4m3fn, torch.float8_e5m2)), torch.float8_e4m3fn)
        self.device = device
        self.base = [(lora_parts(p, names), float(w)) for p, w in base if float(w) != 0]
        self.counts = [len(lp) for lp, _ in self.base]
        self.hook = lora_parts(hook, names) if hook else {}
        self.s = None
        self.kept = {}
        self.orig = {}
        for name in self.hook:
            m = self.lin[name]
            m.register_forward_pre_hook(self._pre)
            m.register_forward_hook(self._post)
            m._heresy_name = name

    def merge(self, keep=False):
        """The base adapters into the weights, once, worked on the card (keep: the weights before, kept in RAM for restore()). Written
        into the weights' own storage, wherever it is: in RAM before the painter is placed, or the pinned copies its streamed blocks come
        from after it."""
        import torch
        torch.backends.cuda.matmul.allow_tf32 = False     # as ComfyUI leaves it: float32 products in float32
        done = 0
        with torch.inference_mode():
            for name, m in self.lin.items():
                parts = [(lp[name], w) for lp, w in self.base if name in lp]
                if not parts:
                    continue
                W = m.weight
                if keep:
                    self.orig[name] = W.data.to("cpu", copy=True)
                t = W.data.to(device=self.device, dtype=torch.float16, copy=True)   # lora_compute_dtype of an Ampere card
                for (up, down, alpha), w in parts:
                    d = torch.mm(up.to(self.device, torch.float32).flatten(start_dim=1), down.to(self.device, torch.float32).flatten(start_dim=1)).reshape(t.shape)
                    t += ((w * alpha) * d).type(torch.float16)
                W.data.copy_(stochastic_fp8(t, self.kind, string_to_seed("diffusion_model." + name + ".weight")).to(W.dtype))
                done += 1
        self.base = []
        return done

    def arm_dynamic(self, keep=False):
        """ComfyUI's dynamic VRAM (its default since comfy-aimdo, when nothing is hooked: ModelPatcherDynamic) lays the adapters its own
        way: a layer's first pass adds them to its weight read in bfloat16 (LowVramPatch, the product in bfloat16 too) and paints with
        that unrounded; the sum is then rounded to fp8 by chance with the seed of the layer's name (not its weight's) and kept, and every
        later pass paints with it (comfy/ops.py, resolve_cast_module_with_vbar). Hooks here do the same on each layer's first pass (keep:
        the weights before kept in RAM for restore()). Armed after the painter is placed: the rounded sum goes into the weight's own
        storage, the card's or the pinned copy its streamed block comes from."""
        self.first, self.store = {}, {}
        for name, m in self.lin.items():
            parts = [(lp[name], w) for lp, w in self.base if name in lp]
            if not parts:
                continue
            if keep:
                self.orig[name] = m.weight.data.to("cpu", copy=True)
            self.first[name] = parts
            self.store[name] = m.weight.data
            m._heresy_dyn = name
            self.handles = getattr(self, "handles", []) + [m.register_forward_pre_hook(self._dyn_pre), m.register_forward_hook(self._dyn_post)]
        self.base = []
        return len(self.first)

    def _dyn_pre(self, m, args):
        name = m._heresy_dyn
        parts = self.first.get(name)
        if parts is None:
            return
        import torch
        with torch.inference_mode():
            x = m.weight.data.to(device=self.device, dtype=torch.bfloat16, copy=True)
            for (up, down, alpha), w in parts:
                d = torch.mm(up.to(self.device, torch.bfloat16).flatten(start_dim=1), down.to(self.device, torch.bfloat16).flatten(start_dim=1)).reshape(x.shape)
                x += ((w * alpha) * d).type(torch.bfloat16)
        self.kept[name] = (m.weight.data, x)
        m.weight.data = x

    def _dyn_post(self, m, args, out):
        name = m._heresy_dyn
        if name not in self.kept:
            return out
        import torch
        orig, x = self.kept.pop(name)
        del self.first[name]
        m.weight.data = orig
        store = self.store.pop(name)                  # no reference kept past this: the storage the weight moves on from must be let go
        with torch.inference_mode():
            y = stochastic_fp8(x, self.kind, string_to_seed("diffusion_model." + name))
            for t in {id(orig): orig, id(store): store}.values():
                t.copy_(y.to(t.dtype))
        return out

    def disarm(self):
        for h in getattr(self, "handles", []):
            h.remove()
        self.handles = []
        self.first, self.store = {}, {}

    def restore(self):
        """The weights as they were before merge(keep=True)."""
        import torch
        with torch.inference_mode():
            for name, w in self.orig.items():
                self.lin[name].weight.data.copy_(w)
        self.orig = {}

    def _pre(self, m, args):
        if not self.s:
            return
        import torch
        up, down, alpha = self.hook[m._heresy_name]
        W = m.weight
        self.kept[m._heresy_name] = W.data
        with torch.no_grad():
            t = W.data.to(device=self.device, dtype=torch.float32, copy=True)
            d = torch.mm(up.to(self.device, torch.float32).flatten(start_dim=1), down.to(self.device, torch.float32).flatten(start_dim=1)).reshape(t.shape)
            t += ((self.s * alpha) * d).type(torch.float32)
            W.data = stochastic_fp8(t, self.kind, string_to_seed("diffusion_model." + m._heresy_name + ".weight")).to(W.device, W.dtype)

    def _post(self, m, args, out):
        k = self.kept.pop(getattr(m, "_heresy_name", ""), None)
        if k is not None:
            m.weight.data = k
        return out


# ------------------------------------------------------------------------------------------------ the painter's forward in ComfyUI's arithmetic
def comfy_forward(tr):
    """Qwen-Image's forward as ComfyUI computes it (comfy/ldm/qwen_image/model.py, its rotary embedding by comfy_kitchen's eager code as on
    a card whose torch is not built for CUDA 13), on diffusers' own layers: the rotary table from float64 angles kept in bfloat16 and applied
    in bfloat16 (one product rounded, the second fused), the modulations and gates as fused multiply-adds (the words' first gate a product
    and a sum), the norms of the queries, the keys and the words as torch's fused rms_norm, the attention on [batch, heads, tokens, dim],
    the last layer a fused multiply-add. Set before the painter is placed, so blocks that stream still come onto the card when called."""
    import types
    tr.forward = types.MethodType(_cf_forward, tr)
    for b in tr.transformer_blocks:
        b.forward = types.MethodType(_cf_block, b)
    tr._heresy_rope = {}


def _cf_rope(pos, dim, theta):
    import torch
    scale = torch.linspace(0, (dim - 2) / dim, steps=dim // 2, dtype=torch.float64, device=pos.device)
    omega = 1.0 / (theta ** scale)
    out = torch.einsum("...n,d->...nd", pos.to(dtype=torch.float32), omega)
    out = torch.stack([torch.cos(out), -torch.sin(out), torch.sin(out), torch.cos(out)], dim=-1)
    return out.reshape(*out.shape[:-1], 2, 2).to(dtype=torch.float32)


def _cf_table(tr, hp, wp, n_txt, device, dtype):
    """ComfyUI's positions (the words from max(w, h) / 2 on, the picture's centred) through its EmbedND, in the model's dtype."""
    import torch
    key = (hp, wp, n_txt, str(device), str(dtype))
    if key in tr._heresy_rope:
        return tr._heresy_rope[key]
    start = round(max(((2 * wp + 1) // 2) // 2, ((2 * hp + 1) // 2) // 2))
    txt_ids = torch.arange(start, start + n_txt, device=device).reshape(1, -1, 1).repeat(1, 1, 3)
    img_ids = torch.zeros((1, hp, wp, 3), device=device)
    img_ids[:, :, :, 1] = img_ids[:, :, :, 1] + torch.linspace(0, hp - 1, steps=hp, device=device, dtype=dtype).unsqueeze(1).unsqueeze(0) - (hp // 2)
    img_ids[:, :, :, 2] = img_ids[:, :, :, 2] + torch.linspace(0, wp - 1, steps=wp, device=device, dtype=dtype).unsqueeze(0).unsqueeze(0) - (wp // 2)
    ids = torch.cat((txt_ids, img_ids.reshape(1, -1, 3)), dim=1)
    axes = list(getattr(tr.config, "axes_dims_rope", (16, 56, 56)))
    pe = torch.cat([_cf_rope(ids[..., i], axes[i], 10000) for i in range(ids.shape[-1])], dim=-3).unsqueeze(1).to(dtype).contiguous()
    tr._heresy_rope = {key: pe}                        # one size at a time
    return pe


def _cf_rms(x, norm):
    import torch
    return torch.nn.functional.rms_norm(x, (x.shape[-1],), norm.weight.to(dtype=x.dtype, device=x.device), norm.eps)


def _cf_rope1(x, pe):
    x_ = x.to(dtype=pe.dtype).reshape(*x.shape[:-1], -1, 1, 2)
    out = pe[..., 0] * x_[..., 0]
    out.addcmul_(pe[..., 1], x_[..., 1])
    return out.reshape(*x.shape).type_as(x)


def _cf_modulate(x, mod):
    import torch
    shift, scale, gate = torch.chunk(mod, 3, dim=-1)
    return torch.addcmul(shift.unsqueeze(1), x, 1 + scale.unsqueeze(1)), gate.unsqueeze(1)


def _cf_mlp(ff, x):
    import torch
    return ff.net[2](torch.nn.functional.gelu(ff.net[0].proj(x), approximate="tanh"))


def _cf_attention(attn, im, tm, pe):
    import torch
    b, si, st, nh = im.shape[0], im.shape[1], tm.shape[1], attn.heads
    iq = attn.to_q(im).view(b, si, nh, -1).transpose(1, 2).contiguous()
    ik = attn.to_k(im).view(b, si, nh, -1).transpose(1, 2).contiguous()
    iv = attn.to_v(im).view(b, si, nh, -1).transpose(1, 2)
    tq = attn.add_q_proj(tm).view(b, st, nh, -1).transpose(1, 2).contiguous()
    tk = attn.add_k_proj(tm).view(b, st, nh, -1).transpose(1, 2).contiguous()
    tv = attn.add_v_proj(tm).view(b, st, nh, -1).transpose(1, 2)
    iq, ik, tq, tk = _cf_rms(iq, attn.norm_q), _cf_rms(ik, attn.norm_k), _cf_rms(tq, attn.norm_added_q), _cf_rms(tk, attn.norm_added_k)
    q = _cf_rope1(torch.cat([tq, iq], dim=2), pe)
    k = _cf_rope1(torch.cat([tk, ik], dim=2), pe)
    v = torch.cat([tv, iv], dim=2)
    o = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=0.0, is_causal=False)
    o = o.transpose(1, 2).reshape(b, -1, nh * o.shape[-1])
    return attn.to_out[0](o[:, st:, :]), attn.to_add_out(o[:, :st, :])


def _cf_block(self, hs, txt, temb, pe):
    import torch
    img_mod1, img_mod2 = self.img_mod(temb).chunk(2, dim=-1)
    txt_mod1, txt_mod2 = self.txt_mod(temb).chunk(2, dim=-1)
    im, ig1 = _cf_modulate(torch.nn.functional.layer_norm(hs, (hs.shape[-1],), None, None, self.img_norm1.eps), img_mod1)
    tm, tg1 = _cf_modulate(torch.nn.functional.layer_norm(txt, (txt.shape[-1],), None, None, self.txt_norm1.eps), txt_mod1)
    ia, ta = _cf_attention(self.attn, im, tm, pe)
    hs = torch.addcmul(hs, ig1, ia)
    txt = txt + tg1 * ta
    im2, ig2 = _cf_modulate(torch.nn.functional.layer_norm(hs, (hs.shape[-1],), None, None, self.img_norm2.eps), img_mod2)
    hs = torch.addcmul(hs, ig2, _cf_mlp(self.img_mlp, im2))
    tm2, tg2 = _cf_modulate(torch.nn.functional.layer_norm(txt, (txt.shape[-1],), None, None, self.txt_norm2.eps), txt_mod2)
    txt = torch.addcmul(txt, tg2, _cf_mlp(self.txt_mlp, tm2))
    return txt, hs


def _cf_forward(self, hidden_states=None, encoder_hidden_states=None, encoder_hidden_states_mask=None, timestep=None, img_shapes=None,
                return_dict=False, **kw):
    import torch
    _, hp, wp = img_shapes[0][0]
    hs = self.img_in(hidden_states)
    txt = self.txt_in(_cf_rms(encoder_hidden_states, self.txt_norm))
    temb = self.time_text_embed(timestep, hs)
    pe = _cf_table(self, hp, wp, txt.shape[1], hs.device, hs.dtype)
    for b in self.transformer_blocks:
        txt, hs = b(hs, txt, temb, pe)
    emb = self.norm_out.linear(torch.nn.functional.silu(temb))
    scale, shift = torch.chunk(emb, 2, dim=1)
    hs = torch.addcmul(shift[:, None, :], torch.nn.functional.layer_norm(hs, (hs.shape[-1],), None, None, self.norm_out.norm.eps), (1 + scale)[:, None, :])
    return (self.proj_out(hs),)


# ------------------------------------------------------------------------------------------------ the model, guided as ComfyUI guides it
class Painter:
    """The transformer asked as ComfyUI's sampling_function asks it: each active entry of the positive and of the negative its own pass
    (the hooked adapter at its keyframe's strength on hooked entries, nought on the others), averaged; Skimmed CFG's linear interpolation
    on the negative's answer, then cond_scale. x0 = x − σ·v (CONST); the sigma reaches the time embedding in float32."""

    def __init__(self, pipe, h, w, base, hook=None, fp8=None):
        self.pipe, self.h, self.w = pipe, h, w
        self.base = base                                 # [(adapter name, weight)] always on (PEFT's way)
        self.hook = hook                                 # (adapter name or None, weight, Keyframes) or None
        self.fp8 = fp8                                   # Fp8Lora: the adapters laid into the fp8 weights as ComfyUI lays them
        self.state = None
        self.evals = 0
        tr = pipe.transformer
        if not getattr(tr, "_heresy_t32", False):        # the time embedding fed the float32 sigma kept here
            emb = tr.time_text_embed
            orig = emb.forward

            def fwd(timestep, *a, **kw):
                t = getattr(tr, "_heresy_sigma", None)
                return orig(t if t is not None else timestep, *a, **kw)
            emb.forward = fwd
            tr._heresy_t32 = True

    def set(self, entries_pos, entries_neg, cfg, skim, ms, sigmas):
        self.pos, self.neg = [e.at(ms) for e in entries_pos], [e.at(ms) for e in entries_neg]
        self.cfg, self.skim = float(cfg), float(skim or 0)
        if self.hook is not None:
            self.hook[2].start(ms, float(sigmas.max()))
        self._w = None

    def weights(self, hooked, sigma):
        if self.fp8 is not None:                         # ComfyUI's way: the hooked adapter merged for this pass, or none
            self.fp8.s = self.hook[1] * self.hook[2].strength(sigma) if (hooked and self.hook is not None) else None
            return self.fp8.s
        names = [n for n, _ in self.base]
        ws = [w for _, w in self.base]
        if self.hook is not None:
            names.append(self.hook[0])
            ws.append(self.hook[1] * self.hook[2].strength(sigma) if hooked else 0.0)
        key = tuple(round(w, 6) for w in ws)
        if names and key != self._w:
            self.pipe.set_adapters(names, adapter_weights=ws)
            self._w = key
        return key

    def v(self, x, sigma, emb):
        import torch
        tr = self.pipe.transformer
        tr._heresy_sigma = torch.full([x.shape[0]], float(sigma), dtype=torch.float32, device=x.device)
        try:
            out = tr(hidden_states=x.to(torch.bfloat16), encoder_hidden_states=emb.to(x.device, torch.bfloat16), encoder_hidden_states_mask=None,
                     timestep=tr._heresy_sigma, img_shapes=[[(1, self.h // 2, self.w // 2)]], return_dict=False)[0]
        finally:
            tr._heresy_sigma = None
        self.evals += 1
        return out.float()

    def batch(self, entries, x, sigma):
        import torch
        acc, n = None, 0
        for e in entries:
            if not e.acts(sigma):
                continue
            self.weights(e.hooked, sigma)
            d = x - sigma * self.v(x, sigma, e.emb)
            acc = d if acc is None else acc + d
            n += 1
        return acc / n if n else torch.zeros_like(x)

    def __call__(self, x, sigma):
        """The guided x0 at this sigma."""
        guided = not math.isclose(self.cfg, 1.0)
        if self.hook is not None and any(e.hooked and e.acts(sigma) for e in self.pos + (self.neg if guided else [])):
            self.hook[2].strength(sigma)                 # the keyframe in force now, as ComfyUI prepares it before the passes (once per sigma)
        cond = self.batch(self.pos, x, sigma)
        if not guided:
            return cond
        unc = self.batch(self.neg, x, sigma)
        if self.skim > 0 and bool(unc.any()):
            unc = skimmed(x, cond, unc, self.cfg, self.skim)
        return unc + (cond - unc) * self.cfg


def skimmed(x, cond, unc, scale, skim):
    """Skimmed CFG's linear interpolation (Extraltodeus), as its arithmetic goes: where guidance at full scale would push a value further out
    the way both answers already lean, and the step would carry it away from x the same way, the negative's answer is moved toward the
    positive's so that the push there is skim's, not scale's; asked both ways round, the negative's answer each time."""
    w = skim / scale

    def mask(c, u):
        full = x - ((x - u) + scale * ((x - c) - (x - u)))
        return ((c - u).sign() == c.sign()) & (c.sign() == (c * scale - u * (scale - 1)).sign()) & (full.sign() == (full - x).sign())
    unc = unc.clone()
    m = mask(cond, unc)
    unc[m] = cond[m] * (1 - w) + unc[m] * w
    m = mask(unc, cond)
    unc[m] = cond[m] * (1 - w) + unc[m] * w
    return unc


# ------------------------------------------------------------------------------------------------ the samplers
def er_sde(model, x, sigmas, ms, noise, live=None):
    """ComfyUI's sample_er_sde (ER-SDE-Solver-3, max stage 3, its noise scaler x·(e^{x^0.3} + 10), 200 integration points), the first sigma
    offset as offset_first_sigma_for_snr does on a flow model."""
    import torch
    sig = sigmas.clone().to(x.device)
    if len(sig) > 1 and float(sig[0]) >= 1:
        sig[0] = ms.percent_to_sigma(1e-4)
    lam = sig.logit().neg().neg().exp()                  # er_lambda = σ/α
    pts = torch.arange(0, 200.0, dtype=torch.float32, device=x.device)

    def ns(v):
        return v * ((v ** 0.3).exp() + 10.0)
    old = old_d = None
    for i in range(len(sig) - 1):
        d = model(x, float(sig[i]))
        st = min(3, i + 1)
        if float(sig[i + 1]) == 0:
            x = d
        else:
            ls, lt = lam[i], lam[i + 1]
            a_s, a_t = sig[i] / ls, sig[i + 1] / lt
            r = ns(lt) / ns(ls)
            x = (a_t / a_s) * r * x + a_t * (1 - r) * d
            if st >= 2:
                dt = lt - ls
                step = -dt / 200.0
                pos = lt + pts * step
                sc = ns(pos)
                s = torch.sum(1 / sc) * step
                dd = (d - old) / (ls - lam[i - 1])
                x = x + a_t * (dt + s * ns(lt)) * dd
                if st >= 3:
                    su = torch.sum((pos - ls) / sc) * step
                    du = (dd - old_d) / ((ls - lam[i - 2]) / 2)
                    x = x + a_t * ((dt ** 2) / 2 + su * ns(lt)) * du
                old_d = dd
            x = x + a_t * noise() * (lt ** 2 - ls ** 2 * r ** 2).sqrt().nan_to_num(nan=0.0)
        old = d
        if live:
            live(i, len(sig) - 1, x)
    return x


def euler(model, x, sigmas, ms, noise, live=None):
    for i in range(len(sigmas) - 1):
        s, s1 = float(sigmas[i]), float(sigmas[i + 1])
        d = model(x, s)
        x = d if s1 == 0 else x + (x - d) / s * (s1 - s)
        if live:
            live(i, len(sigmas) - 1, x)
    return x


def ours(name, seed):
    """RES4LYF's samplers and Heun++ as the Studio has them (lab/artist_samplers.py, HERESY 1333), driven on the sigmas given."""
    def run(model, x, sigmas, ms, noise, live=None):
        import torch
        import artist_samplers
        from diffusers import FlowMatchEulerDiscreteScheduler
        cfg = {k: v for k, v in FlowMatchEulerDiscreteScheduler().config.items()}
        cfg.update(use_dynamic_shifting=False, shift=1.0, shift_terminal=None, use_karras_sigmas=False, use_exponential_sigmas=False,
                   use_beta_sigmas=False, stochastic_sampling=False)
        sch = artist_samplers.HeresyFlowScheduler.from_config(cfg)
        sch.heresy = {"sampler": name, "schedule": "", "seed": int(seed) % (2 ** 63)}
        sch.set_timesteps(sigmas=[float(v) for v in sigmas[:-1]], device=x.device)
        n = len(sch._plan)
        for k in range(n):
            s = float(sch._evals[k])
            d = model(x, s)
            v = (x - d) / max(s, 1e-9)
            x = sch.step(v, sch.timesteps[k], x, return_dict=False)[0].float()
            if live and sch._plan[k][1] == sch._plan[k][2] - 1:
                live(sch._plan[k][0], len(sigmas) - 1, x)
        return x
    return run


def sampler(name, seed):
    if name == "er_sde":
        return er_sde
    if name == "euler":
        return euler
    return ours(name, seed)


# ------------------------------------------------------------------------------------------------ pictures in and out
def decode(pipe, x, h, w, tiled=True):
    """The latents through the VAE to a picture, in tiles of 512 with 64 of overlap as his VAEDecodeTiled (untiled only when asked)."""
    import torch
    from PIL import Image
    m, s = norm_stats(x.device, torch.float32)
    z = unpack(x, h, w) * s + m
    vae = pipe.vae
    if tiled:                                        # tiles of 512 with 64 of overlap, as his VAEDecodeTiled
        vae.enable_tiling(512, 512, 448, 448)
    else:
        vae.disable_tiling()
    with torch.inference_mode():
        img = vae.decode(z.to(vae.dtype), return_dict=False)[0][:, :, 0]
    # ComfyUI's way to 8 bits: (x + 1) / 2 clamped, × 255, truncated (its SaveImage)
    a = ((img[0].float() + 1.0) / 2.0).clamp(0, 1).mul(255.0).to(torch.uint8).permute(1, 2, 0).cpu().numpy()
    return Image.fromarray(a)


def encode_picture(pipe, img, tiled=True):
    """A picture through the VAE to its raw latent [1, 16, 1, h, w] (float32, CPU), the mode, as ComfyUI's VAEEncode keeps it."""
    import numpy as np
    import torch
    a = torch.from_numpy(np.asarray(img.convert("RGB"), dtype=np.float32) / 127.5 - 1.0).permute(2, 0, 1)[None, :, None]
    vae = pipe.vae
    if tiled:
        vae.enable_tiling(512, 512, 448, 448)
    with torch.inference_mode():
        z = vae.encode(a.to("cuda", vae.dtype)).latent_dist.mode()
    return z.float().cpu()


def stepper(run, n, h, w, show):
    """Each step said on stderr with its seconds (the lab's watchdog hears a long pass as alive: «s/it»); with show, its picture from the
    latents too (Wan 2.1's latent-to-RGB factors, as the Artist's previews), an eighth of the size."""
    import torch
    from PIL import Image
    import artist_job
    out = run / "preview" / f"{n:02d}.jpg"
    t = {"last": time.time()}

    def live(i, of, x):
        now = time.time()
        note(f"picture {n} · step {i + 1} of {of} · {now - t['last']:.2f} s/it")
        t["last"] = now
        if not show:
            return
        (run / "preview").mkdir(exist_ok=True)
        z = unpack(x, h, w)[0, :, 0].float()
        f = torch.tensor(artist_job.RGB_FACTORS, device=z.device)
        rgb = (z.permute(1, 2, 0) @ f + torch.tensor(artist_job.RGB_BIAS, device=z.device)).add(1).div(2).clamp(0, 1)
        Image.fromarray(rgb.mul(255).byte().cpu().numpy()).save(out, "JPEG", quality=85)
        say(live=n, step=i + 1, of=of, file=f"preview/{n:02d}.jpg")
    return live


def save(run, n, shape, seed, img, t1, extra):
    import artist_qwen
    score = artist_qwen.flagged(img)
    row = {"n": n, "shape": shape, "seed": seed, "w": img.width, "h": img.height, "nsfw": score, "took": round(time.time() - t1, 1)}
    row.update(extra)
    if score is not None and score >= 0.5:
        row["kept"] = False
    else:
        name = f"{n:02d}-{shape.replace(':', 'x')}-s{seed}"
        img.save(run / (name + ".png"))
        small = img.copy()
        small.thumbnail((THUMB, THUMB), resample=3)
        (run / "thumbs").mkdir(exist_ok=True)
        small.save(run / "thumbs" / (name + ".jpg"), "JPEG", quality=85, optimize=True)
        row.update(kept=True, file=name + ".png", thumb="thumbs/" + name + ".jpg")
    say(**row)


# ------------------------------------------------------------------------------------------------ a run
def build_parts(painter, ask, c, loras):
    """The pipeline (artist_qwen.build: the painter, its adapters, Lightning when asked), then his encoder and VAE when asked. Returns
    (pipe, said, base [(name, weight)], hook (name, weight) or None)."""
    import artist_job
    import artist_qwen
    artist_job.drop()
    speed = dict(ask.get("sampling") or {})
    pipe, said, _, _ = artist_qwen.build(painter, ask.get("model"), loras, speed)
    base = [("a%d" % i, float(l.get("weight", artist_loras.WEIGHT))) for i, l in enumerate(loras)]
    lw = artist_qwen.tune(painter, speed)[0]
    if lw > 0:
        base.append(("speed", lw))
    hook = None
    if c.get("hook"):
        k = len(loras) - 1                               # the hooked adapter is the last one asked
        hook = ("a%d" % k, float(c["hook"]["weight"]))
        base = [b for b in base if b[0] != hook[0]]
    if c.get("encoder") and c["encoder"] != "qwen":
        note("text encoder " + swap_encoder(pipe, c["encoder"]))
    if c.get("vae") and c["vae"] != "qwen":
        note("VAE " + swap_vae(pipe, c["vae"]))
    return pipe, said, base, hook


def read_prompts(pipe, texts, c):
    """Each text the run needs, read once, the encoder on the card when the room there holds it, then gone before the painter comes."""
    import torch
    import artist_qwen
    dev = torch.device("cuda" if torch.cuda.mem_get_info()[0] >= artist_qwen.ENC_ROOM else "cpu")
    # ComfyUI keeps Qwen-Image's text encoder in its file's own dtype (llama_detect gives QwenImageTEModel its dtype_llama: bfloat16 for
    # his abliterated file and for Qwen's, whatever its log says of float16) and works in float32 (sd1_clip embeds the tokens out in float32,
    # comfy.ops.manual_cast casts each layer's weight to that): comfy_te does the same, equal to the bit on ComfyUI's own module
    # (te32: false reads with transformers' forward in bfloat16 instead)
    dt = torch.bfloat16
    f32 = c.get("te32", True)
    pipe.text_encoder.to(dev, dt)
    torch.backends.cuda.matmul.allow_tf32 = False          # float32 products in float32, as ComfyUI leaves them
    out = {}
    for t in texts:
        if t not in out:
            out[t] = encode(pipe, t, dev, f32)
    pipe.text_encoder.to("cpu", torch.bfloat16)
    gc.collect()
    torch.cuda.empty_cache()
    note(f"{len(out)} texts read on {dev}, weights in bfloat16" + (", worked in float32 as ComfyUI works them" if f32 else ""))
    return out


def conds(c, prompt, emb, steps):
    """The positive and the negative entries as his graph makes them: the prompt (and the hook's trigger beside it, the hooked one the
    prompt's), the second words concatenated to each, the variance on the positive; the negative zeros when asked, else the negative's
    words."""
    pos = [Entry(emb[prompt])]
    neg = [Entry(emb[c.get("negative") or ""])]
    if c.get("hook"):
        pos = [Entry(emb[c["hook"].get("trigger") or ""]), Entry(emb[prompt], hooked=True)]
        neg = [Entry(emb[""]), Entry(emb[c.get("negative") or ""], hooked=True)]
    if c.get("also"):
        pos = concat(pos, emb[c["also"]])
    if c.get("zero_neg", True):
        neg = zero_out(neg)
    v = c.get("variance")
    if v:
        pos = variance(pos, float(v.get("pct", 50)), float(v.get("strength", 12)), float(v.get("switch", 25)), int(v.get("seed") or 0))
    return pos, neg


def texts_of(c, prompts):
    out = list(prompts) + [c.get("negative") or "", ""]
    if c.get("hook"):
        out.append(c["hook"].get("trigger") or "")
    if c.get("also"):
        out.append(c["also"])
    return out


def main(run, ask, painter):
    """A run in ComfyUI's way: ask «comfy» (one picture from words, or a second pass over a picture from a step of its schedule), or «grid»."""
    if ask.get("grid"):
        return grid(run, ask, painter)
    import torch
    from PIL import Image
    t0 = time.time()
    c = dict(ask.get("comfy") or {})
    smp = dict(ask.get("sampling") or {})
    steps = int(smp.get("steps") or 20)
    sname, sched = smp.get("sampler") or "euler", smp.get("schedule") or "simple"
    seed = int(c.get("seed") or ask["seed"])
    import artist_qwen
    fp8 = painter == "qwen2512-fp8" and c.get("merge") != "peft"   # ComfyUI's own way of laying LoRAs into fp8 (PEFT's when asked)
    if fp8:
        lw = artist_qwen.tune(painter, smp)[0]
        files = [(artist_loras.path_of(KIT, l["id"]), float(l.get("weight", artist_loras.WEIGHT)), l["id"]) for l in ask.get("loras") or []]
        if lw > 0 and artist_qwen.lightning():
            files.append((artist_qwen.lightning(), lw, "lightning"))   # after the form's adapters, as his Lightning loader follows his #1 LoRAs
        pipe, _, _, _ = build_parts(painter, dict(ask, sampling=dict(smp, lightning=0)), c, [])
        base, hook = [], ((None, float(c["hook"]["weight"])) if c.get("hook") else None)
    else:
        loras = list(ask.get("loras") or [])
        if c.get("hook"):
            loras.append({"id": c["hook"]["id"], "weight": float(c["hook"]["weight"])})
        pipe, said, base, hook = build_parts(painter, ask, c, loras)
        if said:
            say(loras=said)
    ref = Image.open(run / ask["ref"]).convert("RGB") if ask.get("ref") else None
    shape = (ask.get("shapes") or ["1:1"])[0]
    import artist_job
    import artist_qwen
    if ref is not None and ask.get("scale"):          # the second pass: the picture brought up as his workflow does (nearest), then painted
        s = float(ask["scale"])
        gw, gh = int(round(ref.width * s / 16)) * 16, int(round(ref.height * s / 16)) * 16
        src = ref.resize((gw, gh), Image.NEAREST)
    elif ref is not None:
        gw, gh = (int(ref.width // 16) * 16, int(ref.height // 16) * 16)
        src = ref.crop((0, 0, gw, gh))
    else:
        (gw, gh), _ = artist_job.sized(artist_qwen.SHAPES, shape, ask)
        src = None
    h, w = gh // 8, gw // 8
    emb = read_prompts(pipe, texts_of(c, [str(ask["prompt"])]), c)
    pos, neg = conds(c, str(ask["prompt"]), emb, steps)
    mspec = c.get("sampling") or {"kind": "flow", "shift": 1.15}
    ms = Sampling(mspec.get("kind", "flow"), float(mspec.get("shift", 1.15)), float(mspec.get("max_shift", 1.15)), float(mspec.get("base_shift", 0.5)), gw, gh)
    sigmas = schedule(ms, sched, steps)
    start = int(c.get("start") or 0)
    if start:
        sigmas = sigmas[start:]
    lat = None
    if src is not None:                               # the picture's raw latent, his InjectLatentNoise+ on it (CPU, its own seed)
        pipe.vae.to("cuda")
        lat = encode_picture(pipe, src, tiled=True)
        inj = float(ask.get("inject") or c.get("inject") or 0)
        if inj:
            torch.manual_seed(int(c.get("inject_seed") or 0))
            lat = lat + torch.randn_like(lat) * inj
    lay = None
    # ComfyUI's own load as it runs today: its dynamic VRAM's way when nothing is hooked (its default), the classic load under hooks;
    # merge "fp8" asks for the classic load, "dynamic" for the dynamic way, "peft" for the Studio's own
    dyn = laying(c) == "dynamic"
    if fp8:                                          # the adapters into the weights before they are placed, ComfyUI's rounding and seeds
        lay = Fp8Lora(pipe.transformer, [(p, w) for p, w, _ in files], artist_loras.path_of(KIT, c["hook"]["id"]) if c.get("hook") else None)
        n_ = 0 if dyn else lay.merge()
        if not dyn:
            note(f"{n_} layers of the painter carry the adapters as ComfyUI lays them into fp8 (stochastic rounding, each layer's own seed)")
        said = [{"id": lid, "weight": w, "layers": k} for (p, w, lid), k in zip([f for f in files if f[1] != 0], lay.counts)]
        if c.get("hook"):
            said.append({"id": c["hook"]["id"], "weight": float(c["hook"]["weight"]), "layers": len(lay.hook), "hooked": True})
        say(loras=said)
    if c.get("forward") != "diffusers":             # the painter's forward in ComfyUI's own arithmetic (diffusers' when asked)
        comfy_forward(pipe.transformer)
    pipe.vae.to("cpu")                               # off the card while the painter paints (its second pass at 3328 × 1856 needs the room)
    gc.collect()
    torch.cuda.empty_cache()
    streamed = artist_qwen.place(pipe, painter)
    if streamed:
        say(**streamed)
    if fp8 and dyn:
        note(f"{lay.arm_dynamic()} layers take the adapters as ComfyUI's dynamic VRAM does: unrounded on their first pass, then rounded")
    torch.cuda.reset_peak_memory_stats()
    noise = comfy_noise(seed, h, w)
    m, sd = norm_stats("cpu", torch.float32)
    x5 = noise if lat is None else float(sigmas[0]) * noise + (1.0 - float(sigmas[0])) * ((lat - m) / sd)
    if lat is None:
        x5 = float(sigmas[0]) * noise
    x = pack(x5).to("cuda")
    kf = hook_keys(c.get("hook"))                     # his Steps slider gives the count: 12; HERESY 2360: under MAIN CONTROL when asked
    model = Painter(pipe, h, w, base, (hook[0], hook[1], kf) if hook else None, fp8=lay)
    model.set(pos, neg, float(c.get("cfg", 1.0)), float(c.get("skim") or 0), ms, sigmas)
    t1 = time.time()
    n = 1
    live = stepper(run, n, h, w, bool(ask.get("preview")))
    at = {int(v) for v in os.environ.get("ART_COMFY_LATENT_AT", "").split(",") if v.strip().isdigit()}
    if at:                                           # a comparison's aid: the latent after these steps too, as ComfyUI's SaveLatent keeps it
        shown = live

        def live(i, of, xs):
            shown(i, of, xs)
            if i + 1 in at:
                m_, s_ = norm_stats(xs.device, torch.float32)
                torch.save({"samples": (unpack(xs, h, w) * s_ + m_).cpu()}, run / f"{n:02d}.step{i + 1:02d}.latent.pt")
    with torch.inference_mode():
        x = sampler(sname, seed)(model, x, sigmas.to("cuda"), ms, StepNoise(seed, h, w, "cuda"), live)
    if os.environ.get("ART_COMFY_LATENT"):           # the raw latent as ComfyUI keeps it, for a comparison with its own
        m_, s_ = norm_stats(x.device, torch.float32)
        torch.save({"samples": (unpack(x, h, w) * s_ + m_).cpu()}, run / f"{n:02d}.latent.pt")
    if not streamed:                                 # the painter off the card before the VAE (a 3090 holds one of them at a time)
        pipe.transformer.to("cpu")
    gc.collect()
    torch.cuda.empty_cache()
    pipe.vae.to("cuda")
    img = decode(pipe, x, h, w)
    if ref is not None and c.get("match"):            # his ColorMatch (hm-mvgd-hm) against the picture as it came in
        import artist_upscale
        img = artist_upscale.match(img, src)
    if not c.get("keep_size", True):
        _, (kw_, kh_) = artist_job.sized(artist_qwen.SHAPES, shape, ask)
        img = artist_qwen.cover(img, kw_, kh_)
    extra = {"comfy": {"seed": seed, "sampler": sname, "schedule": sched, "steps": steps, "start": start, "cfg": c.get("cfg"), "skim": c.get("skim"),
                       "evals": model.evals, "shift": round(ms.shift, 4), "main": bool((c.get("hook") or {}).get("main"))}}
    if ref is not None:
        extra["ref"] = 1.0
    save(run, n, shape, seed, img, t1, extra)
    say(done=True, painter=painter, took=round(time.time() - t0, 1), steps=steps, cfg=c.get("cfg"), peak_gb=round(torch.cuda.max_memory_reserved() / 2 ** 30, 1))


def grid(run, ask, painter):
    """His Ultimate Samplers Testing as one run: every cell its sampler, schedule, steps, guidance, adapters' strengths, fine-tune, prompt and
    seed; the painter loaded once a fine-tune (the cells in the order of their fine-tunes), every prompt read once, only the adapters'
    strengths changed between cells. A cell's line says its cell."""
    import torch
    import artist_job
    import artist_qwen
    t0 = time.time()
    g = ask["grid"]
    c = dict(ask.get("comfy") or {})
    cells = [dict(x, n=k + 1) for k, x in enumerate(g["cells"])]
    if ONLY:
        cells = [x for x in cells if x["n"] in ONLY]
    shape = (ask.get("shapes") or ["1:1"])[0]
    (gw, gh), _ = artist_job.sized(artist_qwen.SHAPES, shape, ask)
    h, w = gh // 8, gw // 8
    ids = []                                          # every adapter any cell names, loaded once, each cell setting their strengths
    for x in cells:
        for lid in (x.get("loras") or {}):
            if lid not in ids:
                ids.append(lid)
    by_model = {}
    for x in cells:
        by_model.setdefault(x.get("model") or ask.get("model") or "", []).append(x)
    done = 0
    fp8 = painter == "qwen2512-fp8" and c.get("merge") != "peft"   # ComfyUI's own way of laying LoRAs into fp8 (PEFT's when asked)
    for model_name, mine in by_model.items():
        ask_m = dict(ask, model=model_name or ask.get("model"), sampling={"lightning": 0})
        loras = [] if fp8 else [{"id": lid, "weight": 1.0} for lid in ids]
        pipe, said, _, _ = build_parts(painter, ask_m, c, loras)
        if said:
            say(loras=said, model=model_name)
        emb = read_prompts(pipe, texts_of(c, sorted({x["prompt"] for x in mine})), c)
        if c.get("forward") != "diffusers":
            comfy_forward(pipe.transformer)
        streamed = artist_qwen.place(pipe, painter)
        if streamed:
            say(**streamed)
        pipe.vae.to("cuda")
        names = ["a%d" % i for i in range(len(ids))]
        sigs = []                                     # the cells of one set of strengths together: merged once a set
        for x in mine:
            sg = tuple((x.get("loras") or {}).items())
            if sg not in sigs:
                sigs.append(sg)
        mine = sorted(mine, key=lambda x: sigs.index(tuple((x.get("loras") or {}).items())))
        lay, laid = None, None
        for x in mine:
            t1 = time.time()
            sg = tuple((x.get("loras") or {}).items())
            if fp8 and sg != laid:
                if lay is not None:
                    lay.disarm()
                    lay.restore()
                lay = Fp8Lora(pipe.transformer, [(artist_loras.path_of(KIT, lid), wt) for lid, wt in sg])
                dyn = (c.get("merge") or "auto") in ("auto", "dynamic")   # nothing is hooked in a grid: ComfyUI's dynamic VRAM's way
                k_ = lay.arm_dynamic(keep=len(sigs) > 1) if dyn else lay.merge(keep=len(sigs) > 1)
                laid = sg
                note(f"{k_} layers carry this cell's adapters as ComfyUI" + ("'s dynamic VRAM lays them (unrounded on their first pass, then rounded)" if dyn else " lays them into fp8"))
            base = [] if fp8 else [(names[i], float((x.get("loras") or {}).get(lid, 0.0))) for i, lid in enumerate(ids)]
            model = Painter(pipe, h, w, base, fp8=lay if fp8 else None)
            pos, neg = conds(c, x["prompt"], emb, int(x["steps"]))
            ms = Sampling("flow", 1.15)
            sig = schedule(ms, x["schedule"], int(x["steps"]))
            model.set(pos, neg, float(x.get("cfg", 1.0)), float(c.get("skim") or 0), ms, sig)
            seed = int(x["seed"])
            xs = pack(float(sig[0]) * comfy_noise(seed, h, w)).to("cuda")
            with torch.inference_mode():
                xs = sampler(x["sampler"], seed)(model, xs, sig.to("cuda"), ms, StepNoise(seed, h, w, "cuda"), stepper(run, x["n"], h, w, bool(ask.get("preview"))))
            torch.cuda.empty_cache()
            img = decode(pipe, xs, h, w)
            cell = {k: x.get(k) for k in ("sampler", "schedule", "steps", "cfg", "loras", "model", "prompt_i", "seed")}
            save(run, x["n"], shape, seed, img, t1, {"cell": cell, "comfy": {"evals": model.evals}})
            done += 1
        del pipe
        artist_job.drop()
        gc.collect()
        torch.cuda.empty_cache()
    say(done=True, painter=painter, took=round(time.time() - t0, 1), cells=done, peak_gb=round(torch.cuda.max_memory_reserved() / 2 ** 30, 1))
