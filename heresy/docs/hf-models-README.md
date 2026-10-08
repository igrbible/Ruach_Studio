---
license: other
license_name: mixed-non-commercial
license_link: LICENSE.md
tags:
  - music-generation
  - yue2
  - gguf
  - text-to-music
  - speech
library_name: ggml
pipeline_tag: text-to-audio
---

# Ruach Studio · Models

> ⚠️ **Work in progress.** Ruach Studio is not released yet: the files, the folders and this card may still change. Its code repository opens with the release.

Every weight Ruach Studio (its code repository opens with the release) uses, in one repository, laid out exactly as the studio's own folders, so one command puts each file where the studio looks for it:

```bash
cd Ruach_Studio                      # the root of the studio
hf download goldhub/Ruach_Studio_Models --local-dir .
```

or only what you need:

```bash
hf download goldhub/Ruach_Studio_Models --local-dir . --include "models/YuE2-3B-Q8_0.gguf" "models/YuE2-Vae-F32.gguf"
```

**Nothing here is ours.** These are the works of the people and teams credited below, re-hosted unchanged (the GGUF files as converted by yue2.cpp's tools, byte for byte the same as their sources'), so that a studio install does not have to visit a dozen repositories. Every file keeps its own licence; most are **non-commercial** (CC BY-NC 4.0). Using this repository you accept each licence of the files you take. If you are an author and want a file of yours taken down, open a discussion here and it goes.

---

## What is here

| folder | files | size | for | source | licence |
|---|---|---|---|---|---|
| `models/` | `YuE2-3B-BF16.gguf` | 6.7 GB | the music model (24 GB GPUs) | [Serveurperso/YuE2-GGUF](https://huggingface.co/Serveurperso/YuE2-GGUF), from [m-a-p/YuE2-3B](https://huggingface.co/m-a-p/YuE2-3B) | CC BY-NC 4.0 |
| `models/` | `YuE2-3B-Q8_0` · `Q6_K` · `Q5_K_M.gguf` | 3.6 · 2.8 · 2.5 GB | the same, quantized (12–16 GB GPUs) | as above | CC BY-NC 4.0 |
| `models/` | `YuE2-Vae-F32.gguf` | 0.5 GB | the sound decoder (default) | [m-a-p/YuE2-Vae](https://huggingface.co/m-a-p/YuE2-Vae), converted | CC BY-NC 4.0 |
| `models/` | `YuE2-Vae-legacy-F32.gguf` | 0.5 GB | the first decoder | [m-a-p/YuE2-Vae-legacy](https://huggingface.co/m-a-p/YuE2-Vae-legacy), converted | CC BY-NC 4.0 |
| `models/` | `YuE2-Vae-blend-F32.gguf` | 0.5 GB | a 0.666 merge of the two | [Mothersuperior/YuE2-Vae-merge-0.666](https://huggingface.co/Mothersuperior/YuE2-Vae-merge-0.666), converted | CC BY-NC 4.0 |
| `models/` | `SheetSage2-F32.gguf` · `SheetSage2-Q8_0.gguf` | 2.6 · 0.9 GB | audio → score (covers) | [m-a-p/SheetSage2](https://huggingface.co/m-a-p/SheetSage2) + [m-a-p/MERT-v2-FullSong](https://huggingface.co/m-a-p/MERT-v2-FullSong), converted | CC BY-NC 4.0 |
| `sliders/` | 16 sliders + `catalog.json` | 0.2 GB | voice and genre sliders | [ntc-ai/yue2-particle-sliders](https://huggingface.co/ntc-ai/yue2-particle-sliders), converted | CC BY-NC 4.0 |
| `loras/YuE2-instrumental-cot-full-loras/` | `ar_lora_inst_v3abc.safetensors` + its README and scripts | 0.3 GB | instrumental pieces | [Mothersuperior/YuE2-instrumental-cot-full-loras](https://huggingface.co/Mothersuperior/YuE2-instrumental-cot-full-loras) | CC BY-NC 4.0 |
| `whisper/whisper-large-v3-ct2-float16/` | CTranslate2 float16 | 2.9 GB | the lyrics check, karaoke timing, trim to the text | [Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3) @ `edaa852`, from [openai/whisper-large-v3](https://huggingface.co/openai/whisper-large-v3) | MIT |
| `separation/demucs/` | `htdemucs_ft` (4 models + yaml) | 0.3 GB | drums, bass, other, vocals | [facebookresearch/demucs](https://github.com/facebookresearch/demucs), as fetched by [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator) | MIT |
| `universr/` | `pytorch_model.bin`, `config.yaml` | 0.2 GB | upscale: redraws the top of the spectrum | [woongzip1/universr-audio](https://huggingface.co/woongzip1/universr-audio), code [woongzip1/UniverSR](https://github.com/woongzip1/UniverSR) | CC BY 4.0 |
| `listener/Qwen2.5-Omni-7B-GGUF/` | `Q8_0` · `Q4_K_M` · `mmproj-f16` | 8.1 · 4.7 · 2.6 GB | the style listener: drafts a track's style tags for training sets (llama.cpp) | [ggml-org/Qwen2.5-Omni-7B-GGUF](https://huggingface.co/ggml-org/Qwen2.5-Omni-7B-GGUF) @ `89b7854`, from [Qwen/Qwen2.5-Omni-7B](https://huggingface.co/Qwen/Qwen2.5-Omni-7B) | Apache-2.0 |
| `listener/Qwen2.5-Omni-7B-GGUF/` | `Q6_K` · `Q5_K_M` · `Q3_K_M` · `UD-Q2_K_XL` | 6.3 · 5.4 · 3.8 · 3.2 GB | the same, more sizes | [unsloth/Qwen2.5-Omni-7B-GGUF](https://huggingface.co/unsloth/Qwen2.5-Omni-7B-GGUF) @ `de13a22` | Apache-2.0 |
| `listener/Qwen2.5-Omni-7B-GGUF/` | `mmproj-Q8_0` | 1.5 GB | the audio projector, smaller | [mradermacher/Qwen2.5-Omni-7B-GGUF](https://huggingface.co/mradermacher/Qwen2.5-Omni-7B-GGUF) @ `658a1c7` | Apache-2.0 |
| `artwork/Krea-2-Muse/` | `museByStableYogi_v35Q8Extended.gguf` · `…Q4Extended.gguf` | 14.6 · 8.3 GB | paints a take's artwork (player, cards, the MP3's cover): **Krea 2 Muse by Stable Yogi** v3.5 Extended, a fine-tune of Krea 2 Turbo, 8 steps | [Muse by Stable Yogi](https://civitai.com/models/2741166) by Stable Yogi, the author's own GGUF files, unchanged | Krea 2 Community License |
| `artwork/Krea-2-Turbo/` | `text_encoder/` (Qwen3-VL-4B), `vae/` (Qwen-Image), `tokenizer/`, `scheduler/`, `model_index.json`, `transformer/config.json` (no transformer weights: the fine-tune above brings its own) | 9.4 GB | what Krea 2 needs beside its transformer | [krea/Krea-2-Turbo](https://huggingface.co/krea/Krea-2-Turbo), unchanged | Krea 2 Community License |
| `artwork/CyberRealistic-XL-v10/` | diffusers, fp16 | 6.5 GB | the artwork's painter on cards under 16 GB (Krea 2 wants about 15 GB at Q4, 21 GB at Q8, its prompt writer included) | [CyberRealistic XL v10](https://civitai.com/models/312530) by Cyberdelia (SDXL 1.0 finetune), converted from fp32 | CreativeML Open RAIL++-M |

Any LLM quant goes with either projector (`mmproj-f16` or `mmproj-Q8_0`): llama.cpp takes them as a pair. Measured on one 120 s excerpt (RTX 3090, peak VRAM): Q8_0 + mmproj-f16 11.3 GB, Q4_K_M + mmproj-f16 8.4 GB, about 5 s a track; the full bf16 model through transformers 18.3 GB. Every size heard the same tags: a draft to correct, not a description to trust.

### Not here, and why

| what | why | where to get it |
|---|---|---|
| BS-Roformer ep317 (vocal stems) | its licence is not stated by its author | fetched by audio-separator at first use, or `heresy/fetch-heresy.sh` |
| `yue2-industrial-rock-lora`, `yue2-steps-from-hell` (monsterovich), `YuE2_Deathmetalv1_lora` (pduncan) | no licence given: all rights stay with the authors | their repositories, through the studio's `tools/download-loras.sh` |
| the raw checkpoints (`m-a-p/YuE2-3B` and the rest) | only needed to convert again | their repositories, `tools/download-checkpoints.sh` |
| Qwen3-4B-Instruct-2507 (7.6 GB), the artwork's prompt writer | it is already where it belongs, under Apache-2.0 | [Qwen/Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), pinned, through `heresy/fetch-heresy.sh --artwork` |

---

## Licences in short

- **CC BY-NC 4.0** — share and adapt, with credit, **not for commercial purposes**. This covers YuE2, its decoders, SheetSage2, MERT, the sliders and the LoRA here. Their licences speak of the weights, not of the music made with them (YuE2's licence file: the weights, under CC BY-NC 4.0).
- **Krea 2 Community License** — Krea 2 and Krea 2 Muse (`artwork/Krea-2-Turbo/`, `artwork/Krea-2-Muse/`). By taking these files you agree to it and to Krea's [Acceptable Use Policy](https://www.krea.ai/krea-2-use-policy); its copy (`LICENSE.pdf`) and the `NOTICE.txt` it asks for lie beside them. In short: use, copy and share them (with that licence and notice); commercial use only while your yearly revenue stays under one million US dollars; whoever deploys them must filter what is generated (section 4.2).
- **CreativeML Open RAIL++-M** — CyberRealistic XL (from SDXL 1.0): free use; its use restrictions (Attachment A, in `artwork/CyberRealistic-XL-v10/LICENSE.md`) bind everyone who uses it.
- **Apache-2.0** — Qwen3-4B-Instruct-2507.
- **MIT** — Whisper large-v3 as converted by SYSTRAN (from OpenAI's weights, themselves Apache-2.0).
- **MIT** — Demucs (Meta AI Research).
- **CC BY 4.0** — UniverSR weights.
- **Apache-2.0** — Qwen2.5-Omni-7B and its GGUF conversions (its `LICENSE` beside them).

The full texts and every file's source are in [LICENSE.md](LICENSE.md).

## Credits

- **YuE2, its decoders, SheetSage2, MERT** — the Multimodal Art Projection team ([m-a-p](https://huggingface.co/m-a-p)).
- **GGUF conversions** — Serveurperso ([yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp), [YuE2-GGUF](https://huggingface.co/Serveurperso/YuE2-GGUF)).
- **The YuE2 Kit** these files were gathered by — IronWolve ([yue2-kit](https://github.com/IronWolve/yue2-kit)).
- **VAE merge, instrumental LoRA** — Mothersuperior.
- **Particle sliders** — ntc-ai.
- **Whisper** — OpenAI; CTranslate2 and faster-whisper — SYSTRAN.
- **Demucs** — Meta AI Research; **python-audio-separator** — nomadkaraoke.
- **UniverSR** — woongzip1.
- **Qwen2.5-Omni-7B** — the Qwen team (Alibaba); its GGUF — ggml-org, unsloth, mradermacher.
- **Krea 2** — [Krea](https://krea.ai) (Krea 2 is licensed under the Krea 2 Community License Agreement; see https://krea.ai/krea-2-licensing); its text encoder Qwen3-VL-4B and its VAE from Qwen-Image — the Qwen team.
- **Krea 2 Muse** — [Stable Yogi](https://civitai.com/models/2741166), who modified Krea 2 into it.
- **CyberRealistic XL** — Cyberdelia.

Gathered for Ruach Studio by Viktor Zhuromskyy (ЙирмиЙа́Ѓу) with Claude (Anthropic) · HERETICAL TANDEM™.
