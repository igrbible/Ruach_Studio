---
license: other
license_name: mixed-non-commercial
license_link: LICENSE.md
tags:
  - music-generation
  - yue2
  - gguf
  - ruach-studio
library_name: ggml
base_model:
  - m-a-p/YuE2-Vae-legacy
  - Mothersuperior/YuE2-Vae-merge-0.666
  - ntc-ai/yue2-particle-sliders
  - krea/Krea-2-Turbo
---

# Ruach Studio · Models v2

<p align="center"><img src="https://ruachstudio.igr.bible/assets/ruach-banner.png" alt="Ruach Studio · OSEM: Open Source, Engaged &amp; Musical" width="760"></p>

<p align="center"><a href="https://ruachstudio.igr.bible">Website</a> · <a href="https://github.com/igrbible/Ruach_Studio">GitHub</a> ·
<a href="https://github.com/igrbible/Ruach_Studio/blob/main/docs/GUIDE.md">The guide</a> ·
<a href="https://buy.stripe.com/cNi4gz39t2R77bT6ey67S02"><b>☕ Buy me a Coffee Machine</b></a></p>

The weights [Ruach Studio](https://github.com/igrbible/Ruach_Studio) runs on that are not published elsewhere in the form it needs, laid out as its own folders: the legacy and blend sound decoders and the sixteen voice and genre sliders, as GGUF, converted once (`models/`, `sliders/`), and the Artist's models (`artwork/`): Krea 2 Muse by Stable Yogi with Krea 2's text encoder and VAE, and CyberRealistic XL for cards under 16 GB. From 2.0.0-rc4 the studio's install takes the decoders and the sliders from here, at a pinned revision, instead of fetching their checkpoints (1.3 GB) and converting them on your machine; the Artist's models follow with the next update. Nothing else lives here: only what the studio runs on. It replaces [goldhub/Ruach_Studio_Models](https://huggingface.co/goldhub/Ruach_Studio_Models), which goes after 17 October 2026.

```bash
cd Ruach_Studio                      # the root of the studio
hf download goldhub/Ruach_Studio_Models_v2 --local-dir . --include "models/*" "sliders/*"
```

and the Artist's, when you want it (17.7 GB with Krea 2 Muse Q4, 32.3 GB with Q8 too; CyberRealistic XL alone 6.9 GB):

```bash
hf download goldhub/Ruach_Studio_Models_v2 --local-dir . --include "artwork/Krea-2-Turbo/*" "artwork/Krea-2-Muse/*Q4*" "artwork/Krea-2-Muse/*.txt" "artwork/Krea-2-Muse/*.pdf"
```

**Nothing here is ours but the conversions.** These are the works of the people and teams credited below: the decoders and the sliders converted to GGUF (F32) by `convert-extras.py` of [yue2-kit](https://github.com/IronWolve/yue2-kit) with their values unchanged, Krea 2 Muse and Krea 2's parts unchanged, CyberRealistic XL converted from fp32 to diffusers fp16. The conversion is deterministic: the studio's own copies made on 30.09.2026 and a fresh conversion of the same pinned sources on 09.10.2026 have the same SHA-256, file for file (`SHA256SUMS`). Every file keeps its source's licence (the decoders and the sliders **CC BY-NC 4.0: non-commercial, with attribution**; the Artist's models their own, below). Not affiliated with M-A-P, Mothersuperior, NTC-AI, Krea, Stable Yogi or Cyberdelia. If you are an author and want a file of yours taken down, open a discussion here and it goes.

---

## What is here

| file | size | for | source, at the revision converted | licence |
|---|---|---|---|---|
| `models/YuE2-Vae-legacy-F32.gguf` | 530 MB | the first sound decoder, **Legacy** in the studio | [m-a-p/YuE2-Vae-legacy](https://huggingface.co/m-a-p/YuE2-Vae-legacy) @ `5ddd12f`, `model.safetensors` (SHA-256 `b6d28362…5044`) | CC BY-NC 4.0 |
| `models/YuE2-Vae-blend-F32.gguf` | 530 MB | a 0.666 merge of the default decoder and the first, **Blend** in the studio | [Mothersuperior/YuE2-Vae-merge-0.666](https://huggingface.co/Mothersuperior/YuE2-Vae-merge-0.666) @ `b00bdfc`, `model.safetensors` (SHA-256 `aa242992…acf3`) | CC BY-NC 4.0 |
| `sliders/*.gguf` (16) and `sliders/catalog.json` | 254 MB | the voice and genre sliders (experimental, 0 to 1): female, male, acoustic folk, afrobeats, country, disco funk, hip-hop, house, indie rock, K-pop, lo-fi, metal, pop, pop punk, reggaeton, R&B | [ntc-ai/yue2-particle-sliders](https://huggingface.co/ntc-ai/yue2-particle-sliders) @ `33cf42f`, release `particle-gmix-1600-v2` | CC BY-NC 4.0 (weights); the loader's code MIT |
| `artwork/Krea-2-Muse/` | `museByStableYogi_v35Q8Extended.gguf` · `…Q4Extended.gguf` | 14.6 · 8.3 GB | paints a take's artwork (player, cards, the MP3's cover): **Krea 2 Muse by Stable Yogi** v3.5 Extended, a fine-tune of Krea 2 Turbo, 8 steps | [Muse by Stable Yogi](https://civitai.com/models/2741166) by Stable Yogi, the author's own GGUF files, unchanged | Krea 2 Community License |
| `artwork/Krea-2-Turbo/` | `text_encoder/` (Qwen3-VL-4B), `vae/` (Qwen-Image), `tokenizer/`, `scheduler/`, `model_index.json`, `transformer/config.json` (no transformer weights: the fine-tune above brings its own) | 9.4 GB | what Krea 2 needs beside its transformer | [krea/Krea-2-Turbo](https://huggingface.co/krea/Krea-2-Turbo), unchanged | Krea 2 Community License |
| `artwork/CyberRealistic-XL-v10/` | diffusers, fp16 | 6.5 GB | the artwork's painter on cards under 16 GB (Krea 2 wants about 15 GB at Q4, 21 GB at Q8, its prompt writer included) | [CyberRealistic XL v10](https://civitai.com/models/312530) by Cyberdelia (SDXL 1.0 finetune), converted from fp32 | CreativeML Open RAIL++-M |

**What the conversion changed:** the format only. Each decoder's tensors go into one GGUF (F32) through yue2.cpp's own converter (its VAE path); each slider's routed-particle adapter weights (on the 112 attention projections of the AR stage) into one GGUF, and `catalog.json` names each slider (id, label, description, file) with the SHA-256 of the source file it was made from. Every source was checked against its published checksum before conversion.

The default decoder (`YuE2-Vae-F32.gguf`), the music model itself (`YuE2-3B-*.gguf`) and the transcriber are not here: they come already as GGUF from [Serveurperso/YuE2-GGUF](https://huggingface.co/Serveurperso/YuE2-GGUF), converted from [m-a-p/YuE2-3B](https://huggingface.co/m-a-p/YuE2-3B) and its siblings, and the studio's install fetches them there.

## Licences

- The decoders and the sliders: **CC BY-NC 4.0** ([`LICENSE`](LICENSE), as M-A-P publishes it with YuE2-Vae-legacy; the merge and the sliders inherit it from their sources).
- **Krea 2 Community License** — Krea 2 and Krea 2 Muse (`artwork/Krea-2-Turbo/`, `artwork/Krea-2-Muse/`). By taking these files you agree to it and to Krea's [Acceptable Use Policy](https://www.krea.ai/krea-2-use-policy); its copy (`LICENSE.pdf`) and the `NOTICE.txt` it asks for lie beside them. In short: use, copy and share them (with that licence and notice); commercial use only while your yearly revenue stays under one million US dollars; whoever deploys them must filter what is generated (section 4.2).
- **CreativeML Open RAIL++-M** — CyberRealistic XL (from SDXL 1.0): free use; its use restrictions (Attachment A, in `artwork/CyberRealistic-XL-v10/LICENSE.md`) bind everyone who uses it.
- Third-party code named by the decoders' sources: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), with the full texts in `licenses/` (stable-audio-tools, MIT, Stability AI; SnakeBeta/BigVGAN, MIT, NVIDIA).
- The sliders' code licences as their repository ships them: `licenses/particle-sliders-LICENSE.txt` and `licenses/particle-sliders-LOADER_LICENSE.txt` (MIT).

Using the decoders in research, please cite [YuE](https://arxiv.org/abs/2503.08638), as M-A-P asks.

## Credits

- **YuE2 and its decoders** — the Multimodal Art Projection team ([m-a-p](https://huggingface.co/m-a-p)).
- **The 0.666 decoder merge** — [Mothersuperior](https://huggingface.co/Mothersuperior).
- **Particle sliders** — [ntc-ai](https://huggingface.co/ntc-ai).
- **Krea 2** — [Krea](https://krea.ai) (Krea 2 is licensed under the Krea 2 Community License Agreement; see https://krea.ai/krea-2-licensing); its text encoder Qwen3-VL-4B and its VAE from Qwen-Image — the Qwen team.
- **Krea 2 Muse** — [Stable Yogi](https://civitai.com/models/2741166), who modified Krea 2 into it.
- **CyberRealistic XL** — Cyberdelia.
- **The conversion** — `convert-extras.py` of the YuE2 Kit by IronWolve ([yue2-kit](https://github.com/IronWolve/yue2-kit)), through the converter of [yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp) by Serveurperso.

Converted and gathered for Ruach Studio by Viktor Zhuromskyy (ЙирмиЙа́Ѓу) with Claude (Anthropic) · HERETICAL TANDEM™.
