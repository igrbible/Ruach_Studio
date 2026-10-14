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
  - Qwen/Qwen-Image-2512
---

# Ruach Studio · Models v2

<p align="center"><img src="https://ruachstudio.igr.bible/assets/ruach-banner.png" alt="Ruach Studio · OSEM: Open Source, Engaged &amp; Musical" width="760"></p>

<p align="center"><a href="https://ruachstudio.igr.bible">Website</a> · <a href="https://github.com/igrbible/Ruach_Studio">GitHub</a> ·
<a href="https://github.com/igrbible/Ruach_Studio/blob/main/docs/GUIDE.md">The guide</a> ·
<a href="https://buy.stripe.com/cNi4gz39t2R77bT6ey67S02"><b>☕ Buy me a Coffee Machine</b></a></p>

The weights [Ruach Studio](https://github.com/igrbible/Ruach_Studio) runs on that are not published elsewhere in the form it needs, laid out as its own folders: the legacy and blend sound decoders and the sixteen voice and genre sliders, as GGUF, converted once (`models/`, `sliders/`), and the Artist's models (`artwork/`): Krea 2 Muse by Stable Yogi with Krea 2's text encoder and VAE (whole on a card of 16 GB, its blocks streamed from RAM on a smaller one). From 2.0.0-rc4 the studio's install takes the decoders and the sliders from here, at a pinned revision, instead of fetching their checkpoints (1.3 GB) and converting them on your machine; the Artist's models follow with the next update. Nothing else lives here: only what the studio runs on. It replaces [goldhub/Ruach_Studio_Models](https://huggingface.co/goldhub/Ruach_Studio_Models), which goes after 17 October 2026.

```bash
cd Ruach_Studio                      # the root of the studio
hf download goldhub/Ruach_Studio_Models_v2 --local-dir . --include "models/*" "sliders/*"
```

and the Artist's, when you want it (17.7 GB with Krea 2 Muse Q4, 32.3 GB with Q8 too):

```bash
hf download goldhub/Ruach_Studio_Models_v2 --local-dir . --include "artwork/Krea-2-Turbo/*" "artwork/Krea-2-Muse/*Q4*" "artwork/Krea-2-Muse/*.txt" "artwork/Krea-2-Muse/*.pdf"
```

**Nothing here is ours but the conversions.** These are the works of the people and teams credited below: the decoders and the sliders converted to GGUF (F32) by `convert-extras.py` of [yue2-kit](https://github.com/IronWolve/yue2-kit) with their values unchanged, Krea 2 Muse and Krea 2's parts unchanged, the Qwen-Image 2512 fine-tunes and the adapters unchanged (each its author's own file, byte for byte). The conversion is deterministic: the studio's own copies made on 30.09.2026 and a fresh conversion of the same pinned sources on 09.10.2026 have the same SHA-256, file for file (`SHA256SUMS`). Every file keeps its source's licence (the decoders and the sliders **CC BY-NC 4.0: non-commercial, with attribution**; the Artist's models their own, below). Not affiliated with M-A-P, Mothersuperior, NTC-AI, Krea, Stable Yogi, the Qwen team, Civitai or the fine-tunes' and adapters' authors named below. If you are an author and want a file of yours taken down, open a discussion here and it goes.

---

## What is here

| file | size | for | source, at the revision converted | licence |
|---|---|---|---|---|
| `models/YuE2-Vae-legacy-F32.gguf` | 530 MB | the first sound decoder, **Legacy** in the studio | [m-a-p/YuE2-Vae-legacy](https://huggingface.co/m-a-p/YuE2-Vae-legacy) @ `5ddd12f`, `model.safetensors` (SHA-256 `b6d28362…5044`) | CC BY-NC 4.0 |
| `models/YuE2-Vae-blend-F32.gguf` | 530 MB | a 0.666 merge of the default decoder and the first, **Blend** in the studio | [Mothersuperior/YuE2-Vae-merge-0.666](https://huggingface.co/Mothersuperior/YuE2-Vae-merge-0.666) @ `b00bdfc`, `model.safetensors` (SHA-256 `aa242992…acf3`) | CC BY-NC 4.0 |
| `sliders/*.gguf` (16) and `sliders/catalog.json` | 254 MB | the voice and genre sliders (experimental, 0 to 1): female, male, acoustic folk, afrobeats, country, disco funk, hip-hop, house, indie rock, K-pop, lo-fi, metal, pop, pop punk, reggaeton, R&B | [ntc-ai/yue2-particle-sliders](https://huggingface.co/ntc-ai/yue2-particle-sliders) @ `33cf42f`, release `particle-gmix-1600-v2` | CC BY-NC 4.0 (weights); the loader's code MIT |
| `artwork/Krea-2-Muse/` | `museByStableYogi_v35Q8Extended.gguf` · `…Q4Extended.gguf` | 14.6 · 8.3 GB | paints a take's artwork (player, cards, the MP3's cover): **Krea 2 Muse by Stable Yogi** v3.5 Extended, a fine-tune of Krea 2 Turbo, 8 steps | [Muse by Stable Yogi](https://civitai.com/models/2741166) by Stable Yogi, the author's own GGUF files, unchanged | Krea 2 Community License |
| `artwork/Krea-2-Turbo/` | `text_encoder/` (Qwen3-VL-4B), `vae/` (Qwen-Image), `tokenizer/`, `scheduler/`, `model_index.json`, `transformer/config.json` (no transformer weights: the fine-tune above brings its own) | 9.4 GB | what Krea 2 needs beside its transformer | [krea/Krea-2-Turbo](https://huggingface.co/krea/Krea-2-Turbo), unchanged | Krea 2 Community License |
| `artwork/Qwen-Image-2512/checkpoints/JibMix QW2512 v6 fp8.safetensors` | ComfyUI's single file, fp8 e4m3fn | 20.4 GB | the Artist's painter for finished realism on a card of 24 GB (with Qwen-Image 2512's own parts from Qwen) | [Jib Mix Qwen](https://civitai.com/models/1936965?modelVersionId=2753478) v6.0 by J1B, unchanged | the author's: share and sell (Civitai) |
| `artwork/Qwen-Image-2512/checkpoints/IntoRealism QW2512 v1 fp8.safetensors` | the same | 20.4 GB | the same | [IntoRealism Qwen](https://civitai.com/models/2510144?modelVersionId=2821489) v1.0 by enzino, unchanged | the author's: share and sell (Civitai) |
| `artwork/Qwen-Image-2512/checkpoints/Real QW2512 v2 fp8.safetensors` | the same | 20.4 GB | the same | [Real-Qwen-Image](https://civitai.com/models/1898752?modelVersionId=2607270) v2.0 fp8 by wikeeyang, unchanged | the author's: share and sell (Civitai) |
| `artwork/Qwen-Image-2512/checkpoints/BASE QW2512 fp8_e4m3fn.safetensors` | the same | 20.4 GB | Qwen-Image 2512 itself in fp8, the fine-tunes' base | [Qwen-Image-2512](https://civitai.com/models/2268063?modelVersionId=2552908) fp8_e4m3fn as Civitai publishes it, unchanged | Apache-2.0 (Qwen) |
| `artwork/loras/` | seven adapters, `.safetensors` | 3.1 GB | the Artist's LoRA library: for Krea 2 [Cinematic Movie Still](https://civitai.com/models/2840790) and [Cinematic Dark Lighting](https://civitai.com/models/2477155) by vizsumit, [Lenovo UltraReal](https://civitai.com/models/1662740) by Danrisi; for Qwen-Image 2.1 Lenovo UltraReal by Danrisi and the [Frank Frazetta Style](https://civitai.com/models/1720935) by tarn59; for Qwen-Image 2512 [Film Photography](https://civitai.com/models/1901782) by bluejaysierra and [Photostyle by Sean Archer](https://civitai.com/models/1632416) (SFW) by FASCIUM | their authors' files, unchanged | each its author's: share and sell (Civitai) |

**CyberRealistic XL went** (12.10.2026, for 2.0.0-rc7): the studio paints a take's artwork with Krea 2 Muse on any card now, so the SDXL fine-tune by Cyberdelia it kept for cards under 16 GB is no longer here. A studio pinned to an earlier revision of this repository (2.0.0-rc6 and before) still finds it there.

**What the conversion changed:** the format only. Each decoder's tensors go into one GGUF (F32) through yue2.cpp's own converter (its VAE path); each slider's routed-particle adapter weights (on the 112 attention projections of the AR stage) into one GGUF, and `catalog.json` names each slider (id, label, description, file) with the SHA-256 of the source file it was made from. Every source was checked against its published checksum before conversion.

The default decoder (`YuE2-Vae-F32.gguf`), the music model itself (`YuE2-3B-*.gguf`) and the transcriber are not here: they come already as GGUF from [Serveurperso/YuE2-GGUF](https://huggingface.co/Serveurperso/YuE2-GGUF), converted from [m-a-p/YuE2-3B](https://huggingface.co/m-a-p/YuE2-3B) and its siblings, and the studio's install fetches them there.

The Qwen-Image 2512 fine-tunes and the adapters are here because their authors let them be shared: on Civitai each allows its use without credit, selling what it makes, running it on services and sharing and selling the model itself and its merges (they are credited all the same). The many others the Artist paints with stay with their authors: the studio's LoRA library looks them up on Civitai by their SHA-256, and they are fetched from there.

```bash
hf download goldhub/Ruach_Studio_Models_v2 --local-dir . --include "artwork/Qwen-Image-2512/checkpoints/JibMix*"   # one fine-tune, 20.4 GB
hf download goldhub/Ruach_Studio_Models_v2 --local-dir . --include "artwork/loras/*"                                # the seven adapters, 3.1 GB
```

In the studio: Engine → Models and LoRAs, or the Artist's own Get painters and adapters… under its painter.

## Licences

- The decoders and the sliders: **CC BY-NC 4.0** ([`LICENSE`](LICENSE), as M-A-P publishes it with YuE2-Vae-legacy; the merge and the sliders inherit it from their sources).
- **Krea 2 Community License** — Krea 2 and Krea 2 Muse (`artwork/Krea-2-Turbo/`, `artwork/Krea-2-Muse/`). By taking these files you agree to it and to Krea's [Acceptable Use Policy](https://www.krea.ai/krea-2-use-policy); its copy (`LICENSE.pdf`) and the `NOTICE.txt` it asks for lie beside them. In short: use, copy and share them (with that licence and notice); commercial use only while your yearly revenue stays under one million US dollars; whoever deploys them must filter what is generated (section 4.2).
- **Qwen-Image 2512** (`BASE QW2512 fp8_e4m3fn`) — Apache-2.0, the Qwen team's; the fine-tunes on it and the adapters — their authors' permissions on Civitai, as above (share and sell, use without credit).
- Third-party code named by the decoders' sources: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), with the full texts in `licenses/` (stable-audio-tools, MIT, Stability AI; SnakeBeta/BigVGAN, MIT, NVIDIA).
- The sliders' code licences as their repository ships them: `licenses/particle-sliders-LICENSE.txt` and `licenses/particle-sliders-LOADER_LICENSE.txt` (MIT).

Using the decoders in research, please cite [YuE](https://arxiv.org/abs/2503.08638), as M-A-P asks.

## Credits

- **YuE2 and its decoders** — the Multimodal Art Projection team ([m-a-p](https://huggingface.co/m-a-p)).
- **The 0.666 decoder merge** — [Mothersuperior](https://huggingface.co/Mothersuperior).
- **Particle sliders** — [ntc-ai](https://huggingface.co/ntc-ai).
- **Krea 2** — [Krea](https://krea.ai) (Krea 2 is licensed under the Krea 2 Community License Agreement; see https://krea.ai/krea-2-licensing); its text encoder Qwen3-VL-4B and its VAE from Qwen-Image — the Qwen team.
- **Krea 2 Muse** — [Stable Yogi](https://civitai.com/models/2741166), who modified Krea 2 into it.
- **Qwen-Image 2512** — the Qwen team (Alibaba); its fp8 single file as Civitai publishes it.
- **The Qwen-Image 2512 fine-tunes** — J1B (Jib Mix Qwen), enzino (IntoRealism Qwen), wikeeyang (Real-Qwen-Image).
- **The adapters** — vizsumit (Cinematic Movie Still, Cinematic Dark Lighting), Danrisi (Lenovo UltraReal), tarn59 (Frank Frazetta Style), bluejaysierra (Film Photography), FASCIUM (Photostyle by Sean Archer).
- **The conversion** — `convert-extras.py` of the YuE2 Kit by IronWolve ([yue2-kit](https://github.com/IronWolve/yue2-kit)), through the converter of [yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp) by Serveurperso.

Converted and gathered for Ruach Studio by Viktor Zhuromskyy (ЙирмиЙа́Ѓу) with Claude (Anthropic) · HERETICAL TANDEM™.
