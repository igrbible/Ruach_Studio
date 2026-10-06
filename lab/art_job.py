"""HERESY 1120: artwork for a take (Viktor, 02.10.2026: «просто иконка в плеере, в карточке и в mp3 файле… спойлер на
багажнике нашего Руах-Феррари»). Nothing special, and conservative: a small language model reads the take's style
and words and writes one picture prompt; an SDXL finetune draws it once, 1024 px, a fixed number of steps; the
picture is kept at 768 px as JPEG. Runs as its own process on the card the lab gives it and leaves nothing behind.

HERESY 1156 (Viktor, 03.10.2026: «Пропускать через VLM вместе с промптом, и регенерить по адаптации промпта самой
VLM»; «что не знает, то не генерит»): a picture whose subject is named (an instrument's probe) is looked at. Omni (the
listener's model, through llama.cpp) gets the picture and says what it sees and whether the subject is there; when it
is not, Omni writes the prompt again from the prompt and what it saw, and the painter tries once more, three pictures
at most. A subject an image model does not know by name (a duduk came out a board on a table) is described to both of
them in plain visual words (art_looks.json, from the instruments cheat-sheet). The painter is the SDXL behind the link artwork/SDXL-Artwork-Model (Viktor: «чтобы на этот
симлинк можно было бы посадить другие веса SDXL»; «SDXL — лёгкая и качественная. Никаких FLUX»).

    .venv/bin/python lab/art_job.py TAKE_DIR OUT.jpg [SEED]

    prompter  artwork/Qwen3-4B-Instruct-2507   (Apache 2.0; absent: the prompt is built from the style)
    painter   artwork/SDXL-Artwork-Model       a link to an SDXL: ours, CyberRealistic-XL-v10 (an SDXL 1.0 finetune by
                                               Cyberdelia; CreativeML Open RAIL++-M), or any SDXL finetune, as a diffusers
                                               folder or one .safetensors file; FLUX, SD 1.5, SD 3 are refused aloud
    critic    checkpoints/Qwen2.5-Omni-7B-GGUF (llama.cpp's llama-mtmd-cli; absent: the first picture is kept, unseen)

HERESY 1167 (Viktor 05.10.2026, the A/B of SDXL against Krea 2 on twelve instruments: «Muse - отличный файнтюн… убирай
SDXL долой с глаз»; «Для карт ниже 24GB VRAM… оставим SDXL»): the painter is Krea 2 Muse by Stable Yogi (a fine-tune of Krea 2
Turbo; the author's GGUF, Q4 or Q8; 8 steps, no guidance) through diffusers' Krea2Pipeline with Krea's own text encoder
(Qwen3-VL-4B), VAE and tokenizer (artwork/Krea-2-Turbo), in its own environment (.venv-art: transformers 5, diffusers 0.40);
SDXL stays for cards too small for it. ART_PAINTER says which: krea2-q4 (11.6 GB at the peak, 23 s a picture on an RTX
3090), krea2-q8 (17.4 GB, 21.5 s), sdxl (14.2 GB with the prompter, 9 s); the lab sets it. A Krea picture passes a content
filter before it is kept (Krea 2 Community License, 4.2: Falconsai/nsfw_image_detection in artwork/nsfw-filter): flagged, it
is dropped and the next seed tries.

Prints one JSON line: the prompt, the seed, the models, each picture the critic saw and its word, the time taken."""
import json, os, random, re, subprocess, sys, time
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
PROMPTER = KIT / "artwork" / "Qwen3-4B-Instruct-2507"
LINK = KIT / "artwork" / "SDXL-Artwork-Model"
OURS = KIT / "artwork" / "CyberRealistic-XL-v10"
LOOKS = Path(__file__).resolve().parent / "art_looks.json"
CLI = KIT / "vendor" / "llama.cpp" / "build" / "bin" / "llama-mtmd-cli"
OMNI = KIT / "checkpoints" / "Qwen2.5-Omni-7B-GGUF"
# the listener's ladder (training.py LISTENERS), its llama.cpp rungs: the first on disk looks (Q8_0 with the Q8_0
# projector: 5.7 s a picture, 10.5 GB, measured 03.10.2026; the projector reads pictures as well as sound)
CRITICS = [("Qwen2.5-Omni-7B-Q8_0.gguf", "mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"),
           ("unsloth/Qwen2.5-Omni-7B-Q5_K_M.gguf", "mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"),
           ("Qwen2.5-Omni-7B-Q4_K_M.gguf", "mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"),
           ("Qwen2.5-Omni-7B-Q8_0.gguf", "mmproj-Qwen2.5-Omni-7B-f16.gguf"),
           ("Qwen2.5-Omni-7B-Q4_K_M.gguf", "mmproj-Qwen2.5-Omni-7B-f16.gguf")]
# HERESY 1166 (Viktor 04.10.2026: «1024x1024, если сейчас так генерится, то оставляй в этом размере»): kept as drawn
SIZE, KEEP, STEPS, CFG = 1024, 1024, 28, 5.5
# HERESY 1163 (Viktor: «SDXL Turbo файнтюны будут так же работать?»): they load, being SDXL, but want a few steps and little
# guidance; at our 28 and 5.5 they come out burnt. A painter whose name says Turbo, Lightning, Hyper or LCM is painted
# with 8 steps, guidance 2 and Euler ancestral; any painter with what a file beside the link says:
# artwork/SDXL-Artwork-Model.json {"steps": 8, "cfg": 2.0, "sampler": "euler_a" | "dpmpp"}
NUMBERS = KIT / "artwork" / "SDXL-Artwork-Model.json"
# HERESY 1167: Krea 2 Muse by Stable Yogi, the author's GGUF; Krea's own parts beside it; the content filter
KREA = KIT / "artwork" / "Krea-2-Turbo"
MUSE = {"krea2-q4": KIT / "artwork" / "Krea-2-Muse" / "museByStableYogi_v35Q4Extended.gguf",
        "krea2-q8": KIT / "artwork" / "Krea-2-Muse" / "museByStableYogi_v35Q8Extended.gguf"}
FILTER = KIT / "artwork" / "nsfw-filter"
KREA_STEPS = 8
PAINTERS = ("krea2-q4", "krea2-q8", "sdxl")
# the GGUF's names (Krea's own) → diffusers' (checked on all 430, the values against Krea's own weights, 05.10.2026)
KREA_RULES = [
    (r"^blocks\.(\d+)\.", r"transformer_blocks.\1."), (r"^txtfusion\.", "text_fusion."),
    (r"\.attn\.wq\.", ".attn.to_q."), (r"\.attn\.wk\.", ".attn.to_k."), (r"\.attn\.wv\.", ".attn.to_v."),
    (r"\.attn\.wo\.", ".attn.to_out.0."), (r"\.attn\.gate\.", ".attn.to_gate."),
    (r"\.attn\.qknorm\.qnorm\.scale$", ".attn.norm_q.weight"), (r"\.attn\.qknorm\.knorm\.scale$", ".attn.norm_k.weight"),
    (r"\.mlp\.", ".ff."), (r"\.prenorm\.scale$", ".norm1.weight"), (r"\.postnorm\.scale$", ".norm2.weight"),
    (r"\.mod\.lin$", ".scale_shift_table"),
    (r"^first\.", "img_in."), (r"^last\.linear\.", "final_layer.linear."), (r"^last\.modulation\.lin$", "final_layer.scale_shift_table"),
    (r"^last\.norm\.scale$", "final_layer.norm.weight"),
    (r"^tmlp\.0\.", "time_embed.linear_1."), (r"^tmlp\.2\.", "time_embed.linear_2."), (r"^tproj\.1\.", "time_mod_proj."),
    (r"^txtmlp\.0\.scale$", "txt_in.norm.weight"), (r"^txtmlp\.1\.", "txt_in.linear_1."), (r"^txtmlp\.3\.", "txt_in.linear_2."),
]


class ContentFlagged(RuntimeError):
    """HERESY 1167: a picture the content filter flagged (not kept; the next seed tries)."""


def which_painter():
    p = (os.environ.get("ART_PAINTER") or "krea2-q4").strip().lower()
    return p if p in PAINTERS else "krea2-q4"


def krea_transformer(path):
    """Krea 2's transformer from a GGUF: built empty from Krea's config, the GGUF's tensors renamed and set as they are
    (a quantized weight keeps its packed shape, which load_state_dict refuses; diffusers' own GGUF loader sets them so),
    dequantized layer by layer as it runs."""
    import torch
    from diffusers import Krea2Transformer2DModel
    from diffusers.models.model_loading_utils import load_gguf_checkpoint
    from diffusers.quantizers.gguf import utils as gu
    sd = {}
    for k, v in load_gguf_checkpoint(str(path)).items():
        if k.endswith("mod.lin"):
            v = v.reshape(6, -1)
        if not isinstance(v, gu.GGUFParameter):
            v = v.to(torch.bfloat16)
        n = k
        for a, b in KREA_RULES:
            n = re.sub(a, b, n)
        sd[n] = v
    with torch.device("meta"):
        m = Krea2Transformer2DModel.from_config(Krea2Transformer2DModel.load_config(KREA / "transformer"))
        gu._replace_with_gguf_linear(m, torch.bfloat16, sd)
    want = set(m.state_dict().keys())
    if want != set(sd):
        raise RuntimeError(f"{path.name} does not fit Krea 2: {len(want ^ set(sd))} tensor names apart")
    for name, v in sd.items():
        owner, _, p = name.rpartition(".")
        (m.get_submodule(owner) if owner else m)._parameters[p] = v if isinstance(v, torch.nn.Parameter) else torch.nn.Parameter(v, requires_grad=False)
    return m.eval().requires_grad_(False)


class Krea:
    """The Krea 2 painter: the text encoder on the card only while it reads a prompt, the transformer and the VAE while they
    paint; to("cpu") gives the card to the critic. Pictures pass the content filter."""

    def __init__(self, painter):
        import torch
        import transformers
        if int(transformers.__version__.split(".")[0]) < 5:
            raise RuntimeError("Krea 2 paints in .venv-art (transformers 5): lab/install-venv.sh --art")
        from diffusers import Krea2Pipeline
        path = MUSE[painter]
        for need in (path, KREA / "text_encoder", KREA / "vae"):
            if not need.exists():
                raise RuntimeError(f"{need.relative_to(KIT)} is not here: heresy/fetch-heresy.sh --artwork")
        self.te = Krea2Pipeline.from_pretrained(KREA, transformer=None, vae=None, torch_dtype=torch.bfloat16)
        self.pipe = Krea2Pipeline.from_pretrained(KREA, transformer=krea_transformer(path), text_encoder=None, torch_dtype=torch.bfloat16)
        self.pipe.set_progress_bar_config(disable=True)
        self.where, self.filter = "cpu", None

    def to(self, device):
        self.pipe.to(device)
        self.where = device
        return self

    def encode(self, prompt):
        import torch
        if self.where == "cuda":                      # the encoder's turn on the card
            self.to("cpu")
            torch.cuda.empty_cache()
        self.te.text_encoder.to("cuda")
        with torch.inference_mode():
            e, m = self.te.encode_prompt(prompt, device=torch.device("cuda"))
        e, m = e.to("cpu"), m.to("cpu")
        self.te.text_encoder.to("cpu")
        torch.cuda.empty_cache()
        return e, m

    def draw(self, prompt, seed, embeds=None):
        import torch
        e, m = embeds or self.encode(prompt)
        self.to("cuda")
        g = torch.Generator("cuda").manual_seed(seed)
        return self.pipe(prompt_embeds=e.to("cuda"), prompt_embeds_mask=m.to("cuda"), num_inference_steps=KREA_STEPS,
                         guidance_scale=0.0, height=SIZE, width=SIZE, generator=g).images[0]

    def flagged(self, img):
        """The content filter's word on a picture (Krea 2 Community License, 4.2): its nsfw score, or None without the filter."""
        if not (FILTER / "config.json").is_file():
            return None
        if self.filter is None:
            from transformers import pipeline
            self.filter = pipeline("image-classification", model=str(FILTER), device="cpu")
        scores = {r["label"].lower(): r["score"] for r in self.filter(img.convert("RGB"))}
        return round(scores.get("nsfw", 0.0), 3)


def painter_numbers(name):
    steps, cfg, sampler = STEPS, CFG, "dpmpp"
    if re.search(r"turbo|lightning|hyper|lcm", name, re.I):
        steps, cfg, sampler = 8, 2.0, "euler_a"
    try:
        o = json.load(open(NUMBERS, encoding="utf-8"))
        steps, cfg, sampler = int(o.get("steps", steps)), float(o.get("cfg", cfg)), str(o.get("sampler", sampler))
    except (OSError, ValueError):
        pass
    return steps, cfg, sampler
PICTURES = 3
NEGATIVE = ("text, letters, words, typography, title, watermark, signature, logo, frame, border, collage, "
            "nsfw, nude, naked, gore, lowres, blurry, jpeg artifacts, deformed, extra fingers, bad anatomy")
# HERESY 1156: the subject first and at most 50 words: CLIP reads 77 tokens and drops the rest (a 79-token prompt lost
# its last words, measured 03.10.2026)
ASK = ("You write one prompt for an image model that paints the cover artwork of a song. From the song's style "
       "and lyrics below, imagine ONE strong picture that carries the song's mood: its subject, the place, the light, "
       "the colours, and an art style (photograph, oil painting, ink, digital art…). Concrete things you can see, not "
       "music words: no instruments unless they are the picture's subject, no text or letters in the picture, no "
       "real people, no brands, nothing sexual or gory. Begin with the picture's subject. One line, at most 50 words, "
       "comma-separated phrases. Write the prompt and nothing else.")


def take_words(d):
    req = json.load(open(d / "request.json", encoding="utf-8")) if (d / "request.json").is_file() else {}
    style = " ".join(str(req.get("style") or "").split())[:1200]
    lyrics = "\n".join(l for l in str(req.get("lyrics") or "").splitlines()
                       if l.strip() and not re.match(r"^\s*\[.*\]\s*$", l))[:1500]
    title = str(req.get("title") or d.name)
    return title, style, lyrics


def subject_of(title):
    """The instrument a take is named for (probe120-duduk-a, ab-duduk-e080-a), from the cheat-sheet's list, the longest
    name first (crystal-singing-bowls before singing-bowls); None for a song."""
    try:
        looks = json.load(open(LOOKS, encoding="utf-8"))
    except (OSError, ValueError):
        return None
    t = "-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") + "-"
    for slug in sorted(looks, key=len, reverse=True):
        if "-" + slug + "-" in t:
            return dict(looks[slug], slug=slug)
    return None


def write_prompt(title, style, lyrics, seed, subject):
    """The prompt from the style and the words; without the prompter, from the style alone."""
    import torch
    looks = subject.get("looks") if subject else ""
    if not (PROMPTER / "config.json").is_file():
        head = (looks + ", ") if looks else ""
        return head + "album cover artwork, " + ", ".join(style.replace(".", ",").split(",")[:8]) + ", cinematic light, painterly", "template"
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(PROMPTER)
    model = AutoModelForCausalLM.from_pretrained(PROMPTER, dtype=torch.bfloat16).to("cuda")   # dtype: transformers 4.56 on and 5
    user = f"Title: {title}\nStyle: {style}\nLyrics:\n{lyrics or '(instrumental)'}"
    if subject:
        home = subject.get("home") or ""
        user += (f"\nThe picture's subject is the {subject['name']}" +
                 (f", which the image model does not know by name: describe it by how it looks: {looks}" if looks else "") +
                 (f". Show it in its home, {home}: a place, a landscape or a room of that land." if home and home != "everywhere" else "."))
    msgs = [{"role": "system", "content": ASK}, {"role": "user", "content": user}]
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt")
    if hasattr(ids, "keys"):                          # HERESY 1167: transformers 5 answers a dict (in .venv-art)
        ids = ids["input_ids"]
    ids = ids.to("cuda")
    torch.manual_seed(seed)
    out = model.generate(ids, max_new_tokens=140, do_sample=True, temperature=0.7, top_p=0.9)
    text = tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()
    del model
    torch.cuda.empty_cache()
    text = " ".join(text.split()).strip('"').strip()
    if not text:
        raise RuntimeError("the prompter wrote nothing")
    return text, PROMPTER.name


def painter():
    """The painter ART_PAINTER names (HERESY 1167): Krea 2 Muse at Q4 or Q8, or the SDXL behind the link (ours without it),
    and the name it is known by. Anything not an SDXL behind the link is refused with what it is, before a minute is spent."""
    kind = which_painter()
    if kind != "sdxl":
        return Krea(kind), "Krea 2 Muse by Stable Yogi (" + kind[-2:].upper() + ")", (KREA_STEPS, 0.0, "flow-euler")
    import torch
    from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
    if LINK.is_symlink() and not LINK.exists():
        raise RuntimeError(f"artwork/{LINK.name} points at nothing ({os.readlink(LINK)}): point it at an SDXL folder or .safetensors file")
    real = (LINK if LINK.exists() else OURS).resolve()
    if real.is_dir():
        try:
            kind = json.load(open(real / "model_index.json", encoding="utf-8")).get("_class_name", "")
        except (OSError, ValueError):
            raise RuntimeError(f"{real.name} is no diffusers folder (no model_index.json): an SDXL folder or one .safetensors file")
        if "StableDiffusionXL" not in kind:
            raise RuntimeError(f"{real.name} is a {kind or 'model of another kind'}, not an SDXL: only SDXL finetunes paint here")
        pipe = StableDiffusionXLPipeline.from_pretrained(real, torch_dtype=torch.float16, use_safetensors=True)
    elif real.suffix == ".safetensors":
        from safetensors import safe_open
        with safe_open(str(real), "pt") as f:              # SDXL carries two text encoders; SD 1.5 one, FLUX none of these
            sdxl = any(k.startswith("conditioner.embedders.1.") for k in f.keys())
        if not sdxl:
            raise RuntimeError(f"{real.name} is not an SDXL checkpoint (SD 1.5, SD 3, FLUX… do not paint here): only SDXL finetunes")
        cfg = str(OURS) if (OURS / "model_index.json").is_file() else None   # the parts' configs from our folder: offline
        pipe = StableDiffusionXLPipeline.from_single_file(str(real), torch_dtype=torch.float16, config=cfg, local_files_only=bool(cfg))
    else:
        raise RuntimeError(f"artwork/{LINK.name} leads to {real.name}: neither an SDXL folder nor a .safetensors file")
    name = real.name if real.is_dir() else real.stem
    numbers = painter_numbers(name)                      # HERESY 1163
    if numbers[2] == "euler_a":
        from diffusers import EulerAncestralDiscreteScheduler
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    else:
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
    pipe.set_progress_bar_config(disable=True)
    return pipe, name, numbers


def paint(pipe, numbers, prompt, seed, out):
    import torch
    if isinstance(pipe, Krea):                       # HERESY 1167: Krea 2 Muse, then the content filter
        img = pipe.draw(prompt, seed)
        score = pipe.flagged(img)
        if score is not None and score >= 0.5:
            raise ContentFlagged(f"the content filter flagged this picture (nsfw {score}): not kept")
        lo, hi = img.convert("L").getextrema()
        if hi - lo < 8:
            raise RuntimeError(f"the picture came out flat ({lo}..{hi}): not kept")
        img.resize((KEEP, KEEP), resample=3).convert("RGB").save(out, "JPEG", quality=90, optimize=True)
        return
    pipe.to("cuda")
    g = torch.Generator("cuda").manual_seed(seed)
    steps, cfg, _ = numbers
    img = pipe(prompt=prompt, negative_prompt=NEGATIVE, width=SIZE, height=SIZE, num_inference_steps=steps,
               guidance_scale=cfg, generator=g).images[0]
    lo, hi = img.convert("L").getextrema()
    if hi - lo < 8:                               # a black or flat picture is a failure, said aloud, not kept
        raise RuntimeError(f"the picture came out flat ({lo}..{hi}): not kept")
    img.resize((KEEP, KEEP), resample=3).convert("RGB").save(out, "JPEG", quality=90, optimize=True)


def critic():
    if not CLI.is_file():
        return None
    for m, p in CRITICS:
        if (OMNI / m).is_file() and (OMNI / p).is_file():
            return OMNI / m, OMNI / p
    return None


def omni(crit, image, text, n):
    r = subprocess.run([str(CLI), "-m", str(crit[0]), "--mmproj", str(crit[1]), "--image", str(image), "-p", text,
                        "-ngl", "99", "-c", "8192", "-n", str(n), "--temp", "0"], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError("the critic failed: " + (r.stderr.strip().splitlines() or ["no output"])[-1][-200:])
    return r.stdout.strip()


def look(crit, image, prompt, subject):
    """Is the subject there: True, False, or None when the answer cannot be read; and what the picture shows. Asked
    blind: the critic sees the picture and the subject only, never the prompt, and says what it sees before judging
    (with the prompt before it, it said the prompt back as what it saw: measured 03.10.2026, a duduk «seen» on a board).
    A song's subject is its prompt's first phrase (the prompter begins with it)."""
    what = (f"the {subject['name']}" + (f" ({subject['looks']})" if subject.get("looks") else "")) if subject \
        else prompt.split(",")[0].strip()
    # a rare one is not seen in the common instrument painted in its place (the morin khuur came out a violin beside a
    # live horse, and the critic said yes: 03.10.2026)
    common = ""
    if subject and subject.get("not"):                  # its own likeliest stand-ins (art_looks.json "not")
        common = f" {subject['not'][0].upper()}{subject['not'][1:]} in its place is NO."
    elif subject and subject.get("looks"):
        common = " An ordinary violin, cello, guitar, flute, oboe, clarinet or trumpet in its place is NO."
    text = ("Look at this picture. Answer in two lines.\n"
            "Line 1: what the picture shows, the main object first, in one sentence.\n"
            f"Line 2: YES if {what} is clearly in the picture, NO if it is not or something else stands in its place.{common}")
    said = omni(crit, image, text, 90)
    votes = re.findall(r"\b(yes|no)\b", said, re.I)
    verdict = votes[-1].lower() == "yes" if votes else None      # the verdict is asked last: its word is the last
    first = next((l.strip() for l in said.splitlines() if l.strip()), "")
    first = re.sub(r"^line\s*\d\s*:\s*", "", first, flags=re.I)
    first = re.sub(r"\s*\b(yes|no)\b\.?\s*$", "", first, flags=re.I)
    return verdict, " ".join(first.split())[:300]


def adapt(crit, image, prompt, subject, shows):
    """The prompt again, written by the critic from what it saw: the subject described first."""
    what = f"the {subject['name']}" if subject else "the prompt's main subject"
    knows = f"\nWhat it looks like: {subject['looks']}." if subject and subject.get("looks") else ""
    text = (f"An image model was asked to paint {what} from this prompt:\n{prompt}\n"
            f"It failed: the picture shows {shows or 'something else'}. The image model does not know {what} by name.{knows}\n"
            f"Write a NEW prompt for it. Begin with {what} described in plain visual words (its shape, size, material, "
            "colour, its distinctive parts, how it lies or is held), then the place, the light and the mood of the old "
            "prompt. No sounds or music words, no text or letters. One line, comma-separated phrases, at most 50 words. "
            "Write the prompt and nothing else.")
    line = " ".join(omni(crit, image, text, 140).split()).strip().strip('"')
    return line if len(line) > 20 else None


def main():
    d, out = Path(sys.argv[1]), Path(sys.argv[2])
    seed = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else random.randrange(2 ** 31)
    import torch
    t0 = time.time()
    title, style, lyrics = take_words(d)
    subject = subject_of(title)
    prompt, prompter = write_prompt(title, style, lyrics, seed, subject)
    t1 = time.time()
    pipe, painter_name, numbers = painter()
    # the critic looks where the picture has a subject named (an instrument): a song's picture is a mood, and judged by
    # its first phrase it was pulled toward what the painter could draw (a storm with a woman of harp strings became a
    # glowing harp: 03.10.2026); songs keep the first picture, as before
    crit = critic() if subject else None
    tries, seen, kept, took_critic, why = [], None, None, 0.0, ""
    try:
        for k in range(PICTURES):
            pic = out.with_name(out.stem + f".try{k}.jpg")
            try:
                paint(pipe, numbers, prompt, seed + k, pic)
            except ContentFlagged as e:              # HERESY 1167: not kept; the next seed tries
                tries.append({"prompt": prompt, "seed": seed + k, "filtered": str(e)})
                if k == PICTURES - 1:
                    raise RuntimeError(f"the content filter flagged all {PICTURES} pictures: none kept")
                continue
            kept, row = pic, {"prompt": prompt, "seed": seed + k}
            tries.append(row)
            if crit is None:
                why = ("no subject named: a song's picture kept as drawn" if not subject else
                       "no critic here (the listener's Omni is not downloaded): the first picture kept, unseen")
                break
            pipe.to("cpu")                                # the critic's 10 GB where the painter was
            torch.cuda.empty_cache()
            tc = time.time()
            try:
                seen, row["shows"] = look(crit, pic, prompt, subject)
                row["seen"] = seen
                if seen is None:
                    why = "the critic's answer could not be read: this picture kept, unseen"
                elif seen is False and k < PICTURES - 1:
                    new = adapt(crit, pic, prompt, subject, row["shows"])
                    if new:
                        prompt = new
                    else:
                        why = "the critic wrote no new prompt: this picture kept"
            except (RuntimeError, subprocess.TimeoutExpired) as e:
                seen, why = None, f"{e}: this picture kept, unseen"
            took_critic += time.time() - tc
            if seen is not False or why:
                break
        if seen is False and not why:
            why = f"the subject not found in {len(tries)} pictures: the last kept"
        kept.replace(out)
    finally:                                              # no picture left behind in the take's folder, whatever happened
        for k in range(PICTURES):
            out.with_name(out.stem + f".try{k}.jpg").unlink(missing_ok=True)
    peak = round(torch.cuda.max_memory_reserved() / 2 ** 30, 1)       # the painter's; the critic is its own process
    print(json.dumps({"prompt": tries[-1]["prompt"], "negative": NEGATIVE, "seed": tries[-1]["seed"], "prompter": prompter,
                      "painter": painter_name, "critic": crit[0].stem if crit else None,
                      "subject": subject["name"] if subject else None, "seen": seen, "why": why, "tries": tries,
                      "size": KEEP, "steps": numbers[0], "cfg": numbers[1], "sampler": numbers[2], "vram_peak_gb": peak,
                      "negative": NEGATIVE if not isinstance(pipe, Krea) else "",   # Krea 2 Turbo paints without guidance
                      "took": {"prompt": round(t1 - t0, 1), "paint": round(time.time() - t1 - took_critic, 1),
                               "critic": round(took_critic, 1)}},
                     ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
