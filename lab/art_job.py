"""HERESY 1120: artwork for a take (Viktor, 02.10.2026: «просто иконка в плеере, в карточке и в mp3 файле… спойлер на
багажнике нашего Руах-Феррари»). Nothing special, and conservative: a small language model reads the take's style
and words and writes one picture prompt; an SDXL finetune draws it once, 1024 px, a fixed number of steps; the
picture is kept at 768 px as JPEG. Runs as its own process on the card the lab gives it and leaves nothing behind.

HERESY 1156 (Viktor, 03.10.2026: «Пропускать через VLM вместе с промптом, и регенерить по адаптации промпта самой
VLM»; «что не знает, то не генерит»): a picture whose subject is named (an instrument's probe) is looked at. Omni (the
listener's model, through llama.cpp) gets the picture and says what it sees and whether the subject is there; when it
is not, Omni writes the prompt again from the prompt and what it saw, and the painter tries once more, three pictures
at most. A subject an image model does not know by name (a duduk came out a board on a table) is described to both of
them in plain visual words (art_looks.json, from the instruments cheat-sheet). The painter was then the SDXL behind the link artwork/SDXL-Artwork-Model (gone since 1405; Viktor: «чтобы на этот
симлинк можно было бы посадить другие веса SDXL»; «SDXL — лёгкая и качественная. Никаких FLUX»).

    .venv/bin/python lab/art_job.py TAKE_DIR OUT.jpg [SEED]

    prompter  artwork/Qwen3-4B-Instruct-2507   (Apache 2.0; absent: the prompt is built from the style)
    painter   artwork/Krea-2-Muse              Krea 2 Muse by Stable Yogi, Q4 or Q8 (HERESY 1167); a Qwen painter (1338)
    critic    checkpoints/Qwen2.5-Omni-7B-GGUF (llama.cpp's llama-mtmd-cli; absent: the first picture is kept, unseen)

HERESY 1167 (Viktor 05.10.2026, the A/B of SDXL against Krea 2 on twelve instruments: «Muse - отличный файнтюн… убирай
SDXL долой с глаз»; «Для карт ниже 24GB VRAM… оставим SDXL»): the painter is Krea 2 Muse by Stable Yogi (a fine-tune of Krea 2
Turbo; the author's GGUF, Q4 or Q8; 8 steps, no guidance) through diffusers' Krea2Pipeline with Krea's own text encoder
(Qwen3-VL-4B), VAE and tokenizer (artwork/Krea-2-Turbo), in its own environment (.venv-art: transformers 5, diffusers 0.40);
(1405: SDXL is gone; a card too small for Krea whole streams its blocks from RAM, ART_STREAM=1). ART_PAINTER says which: krea2-q4 (11.6 GB at the peak, 23 s a picture on an RTX
3090), krea2-q8 (17.4 GB, 21.5 s); the lab sets it. A Krea picture passes a content
filter before it is kept (Krea 2 Community License, 4.2: Falconsai/nsfw_image_detection in artwork/nsfw-filter): flagged, it
is dropped and the next seed tries.

HERESY 1338 (Viktor 10.10.2026: «в Engine не забудь прописать выборы всех генеративных art моделей»; the plan he took: «Автообложки
дублей с Lightning»): Qwen-Image paints a take's artwork as well, through the Artist room's loader (artist_qwen.build): 2512 from the
GGUF Q4 or Q6 with Lightning at 1.0 and 8 steps, an fp8 fine-tune (ART_MODEL, a file in artwork/Qwen-Image-2512/checkpoints/) with
Lightning at 0.55 and 12 steps, or 2.1 (Qwen's research licence: the page says what that means for a song that is sold), drawn at
1328 px and kept at 1024, through the same content filter.

Prints one JSON line: the prompt, the seed, the models, each picture the critic saw and its word, the time taken."""
import json, os, random, re, subprocess, sys, time
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
KEPT = {}                  # HERESY 1370: what a serving Artist process keeps between runs (artist_job.serve), one dict for its modules
PROMPTER = KIT / "artwork" / "Qwen3-4B-Instruct-2507"
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
# HERESY 1167: Krea 2 Muse by Stable Yogi, the author's GGUF; Krea's own parts beside it; the content filter
KREA = KIT / "artwork" / "Krea-2-Turbo"
MUSE = {"krea2-q4": KIT / "artwork" / "Krea-2-Muse" / "museByStableYogi_v35Q4Extended.gguf",
        "krea2-q8": KIT / "artwork" / "Krea-2-Muse" / "museByStableYogi_v35Q8Extended.gguf"}
FILTER = KIT / "artwork" / "nsfw-filter"
KREA_STEPS = 8
PAINTERS = ("krea2-q4", "krea2-q8", "qwen2512-q4", "qwen2512-q6", "qwen2512-fp8", "qwen21")   # HERESY 1338: the Qwen painters; 1405: SDXL gone
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
        self.painter, self.streamed = painter, None      # HERESY 1405

    def to(self, device):
        # HERESY 1405: a card too small for Krea whole (the lab says ART_STREAM=1): its blocks stream from RAM as the Artist room's do
        # (artist_qwen.place), the VAE alone moves; the critic after it finds the card nearly empty
        if os.environ.get("ART_STREAM") == "1":
            if device == "cuda" and self.streamed is None:
                import artist_qwen
                self.streamed = artist_qwen.place(self.pipe, self.painter) or {}
            self.pipe.vae.to(device)
            self.where = device
            return self
        self.pipe.to(device)
        self.where = device
        return self

    def encode(self, prompt):
        import torch
        if self.where == "cuda":                      # the encoder's turn on the card
            self.to("cpu")
            torch.cuda.empty_cache()
        # HERESY 1405: the encoder (Qwen3-VL) on the card when the room there holds it, else on the CPU (a small card)
        size = sum(t.numel() * t.element_size() for t in self.te.text_encoder.parameters())
        dev = torch.device("cuda" if torch.cuda.mem_get_info()[0] >= size + 2 ** 30 else "cpu")
        self.te.text_encoder.to(dev)
        with torch.inference_mode():
            e, m = self.te.encode_prompt(prompt, device=dev)
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


class Qwen:
    """HERESY 1338: Qwen-Image as a take's painter, through the Artist room's loader (artist_qwen.build) with Lightning on: the base at
    1.0 and 8 steps, a fine-tune at 0.55 and 12; 2.1 its parts on the card in turn. to("cpu") gives the card to the critic, as Krea's."""
    NAMES = {"qwen2512-q4": "Qwen-Image 2512 (Q4)", "qwen2512-q6": "Qwen-Image 2512 (Q6)", "qwen2512-fp8": "Qwen-Image 2512 fine-tune",
             "qwen21": "Qwen-Image 2.1"}

    def __init__(self, painter, model=None):
        import artist_qwen
        self.aq, self.painter = artist_qwen, painter
        speed = {"lightning": artist_qwen.SPEED["fine"][0]} if painter == "qwen2512-fp8" else {}   # a fine-tune's Lightning only when asked
        self.pipe, _, self.steps, self.cfg = artist_qwen.build(painter, model, [], speed)
        self.pipe.set_progress_bar_config(disable=True)
        self.name = self.NAMES[painter] + (" · " + Path(str(model)).stem if model else "") + (" with Lightning" if painter != "qwen21" and self.cfg <= 1.0 else "")
        self.where = "cpu"
        if painter == "qwen21":
            self.pipe.enable_model_cpu_offload()

    def to(self, device):
        if self.painter != "qwen21":                    # 2.1 moves its own parts
            self.pipe.transformer.to(device)
            self.pipe.vae.to(device)
            self.where = device
        return self

    def draw(self, prompt, seed):
        import gc
        import torch
        (gw, gh), _ = self.aq.SHAPES["1:1"]
        g = torch.Generator("cuda").manual_seed(seed)
        if self.painter == "qwen21":
            return self.pipe(prompt=prompt, width=gw, height=gh, num_inference_steps=self.steps, generator=g).images[0]
        if self.where == "cuda":                        # the encoder's turn on the card
            self.to("cpu")
            torch.cuda.empty_cache()
        dev = torch.device("cuda" if torch.cuda.mem_get_info()[0] >= self.aq.ENC_ROOM else "cpu")   # 1338b: the room free now
        self.pipe.text_encoder.to(dev)
        with torch.inference_mode():
            e, m = self.pipe.encode_prompt(prompt, device=dev)
            ne, nm = self.pipe.encode_prompt(self.aq.NEGATIVE, device=dev) if self.cfg > 1 else (None, None)
        self.pipe.text_encoder.to("cpu")
        gc.collect()
        torch.cuda.empty_cache()
        self.to("cuda")
        self.pipe.vae.enable_tiling()
        kw = {"prompt_embeds": e.to("cuda"), "prompt_embeds_mask": m.to("cuda") if m is not None else None, "width": gw, "height": gh,
              "num_inference_steps": self.steps, "true_cfg_scale": self.cfg, "generator": g}
        if ne is not None:
            kw.update(negative_prompt_embeds=ne.to("cuda"), negative_prompt_embeds_mask=nm.to("cuda") if nm is not None else None)
        return self.pipe(**kw).images[0]

    def flagged(self, img):
        return self.aq.flagged(img)


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
    # HERESY 1405: on the card when it has the room (about 9 GB), else on the CPU (a small card; a prompt of 140 tokens)
    dev = "cuda" if torch.cuda.is_available() and torch.cuda.mem_get_info()[0] >= int(9.5 * 2 ** 30) else "cpu"
    model = AutoModelForCausalLM.from_pretrained(PROMPTER, dtype=torch.bfloat16 if dev == "cuda" else torch.float32).to(dev)   # dtype: transformers 4.56 on and 5
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
    ids = ids.to(dev)
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
    """The painter ART_PAINTER names (HERESY 1167): Krea 2 Muse at Q4 or Q8, or a Qwen painter (1338), and the name it is known by;
    SDXL refused, said (1405)."""
    kind = which_painter()
    if kind.startswith("qwen"):                          # HERESY 1338
        q = Qwen(kind, os.environ.get("ART_MODEL") or None)
        return q, q.name, (q.steps, q.cfg, "flow-euler")
    if kind == "sdxl":                                   # HERESY 1405: gone from the studio
        raise RuntimeError("SDXL left the studio (HERESY 1405): Krea 2 Muse paints a take's artwork, its blocks streamed from RAM on a small card")
    return Krea(kind), "Krea 2 Muse by Stable Yogi (" + kind[-2:].upper() + ")", (KREA_STEPS, 0.0, "flow-euler")


def paint(pipe, numbers, prompt, seed, out):
    import torch
    if not isinstance(pipe, (Krea, Qwen)):            # HERESY 1405: SDXL gone; no other painter here
        raise RuntimeError("no painter: Krea 2 Muse or Qwen-Image")
    if True:                                         # HERESY 1167: Krea 2 Muse, then the content filter; 1338: Qwen-Image as well
        img = pipe.draw(prompt, seed)
        score = pipe.flagged(img)
        if score is not None and score >= 0.5:
            raise ContentFlagged(f"the content filter flagged this picture (nsfw {score}): not kept")
        lo, hi = img.convert("L").getextrema()
        if hi - lo < 8:
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
                      "negative": NEGATIVE if not isinstance(pipe, (Krea, Qwen)) else "",   # Krea 2 Turbo paints without guidance; 1338: Qwen with Lightning
                      "took": {"prompt": round(t1 - t0, 1), "paint": round(time.time() - t1 - took_critic, 1),
                               "critic": round(took_critic, 1)}},
                     ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
