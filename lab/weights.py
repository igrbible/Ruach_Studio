"""HERESY 1289 (Viktor 10.10.2026: «И нужно в Engine добавить докачку моделей и LoRA»): the Engine's Models card over
heresy/fetch-heresy.sh, the one list of what the studio needs beside itself: its pins, its sizes checked file by file, a
download cut short going on from where it stopped, a second try after half a minute. The lab runs it and keeps its words.

    GET  /weights               the last whole run's verdicts, part by part (the install's own run too: fetch-heresy.sh keeps
                                them in tmp/fetch-heresy.list), the extras here or not, a run under way and its words
    POST /weights/check         fetch-heresy.sh --check: what is here and what is missing; nothing is downloaded
    POST /weights/fetch {…}     one run at a time, on the user's word (the page has said the size): {"part": "missing"}
                                everything the install brings that is not here, {"part": "loras"} one part of it, or one
                                extra: {"backbone": "BF16"}, {"ira": "Q8_0"} (1490), {"irae": "IRAEv2-Q8_0"} (1689), {"fw": "2.4x0.75-Q8_0"} (1794), {"listener": "Q8_0"}, {"artwork": "q4"}, {"trainer": "int8"}

A test page (?scope=…) checks but fetches nothing: the lab refuses. New LoRAs reach the engine at once; new backbones,
decoders and sliders at its next start (it reads them when it starts), which the card says."""
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

# what the install brings, part by part (fetch-heresy.sh --only NAME): what a fetch of the whole part takes, measured on the
# Forge 10.10.2026 (HERESY 1290: the extras come converted, from goldhub/Ruach_Studio_Models_v2: nothing is made here any more)
PARTS = {"extras": "1.3 GB", "whisper": "3.1 GB", "stems": "1.0 GB", "upscale": "0.2 GB", "loras": "2.3 GB"}   # HERESY 1292: du -sb, decimal
# HERESY 1794 (Viktor 25.10.2026: «2.4 ep - самый безопасный, и пусть он будет базовой моделью»): Ruach Studio's own fine-tune, YuE2-RS-FW, its
# saves folded into m-a-p's base at seven points (epoch x strength), from goldhub/YuE2-RS-Finetunes; the default one comes with the install as a
# part, at the quant of m-a-p's backbone here (BF16, Q8_0 or Q6_K: there is no Q5_K_M of it, so a Q5_K_M install keeps m-a-p's alone)
FW_MERGES = ["0.7x0.75", "1.5x0.75", "2.4x0.75", "3.4x0.7", "3.4x0.75", "4.0x0.65", "4.0x0.7"]
FW_DEFAULT = "2.4x0.75"
FW_SIZES = {"BF16": "7.2 GB", "Q8_0": "3.8 GB", "Q6_K": "2.9 GB"}


def fw_quant(kit):
    """the quant the install's fine-tune comes at: m-a-p's backbone here, the fullest first; "" where none of the three is"""
    return next((q for q in FW_SIZES if (Path(kit) / "models" / f"YuE2-3B-{q}.gguf").is_file()), "")


def parts_of(kit):   # (not «parts»: _last_run keeps a list of that name)
    """the parts the install brings and their sizes, the fine-tune's at its quant (none on a Q5_K_M install)"""
    q = fw_quant(kit)
    return dict(PARTS, fw=FW_SIZES[q]) if q else dict(PARTS)

OMNI = "checkpoints/Qwen2.5-Omni-7B-GGUF/"
PROJ = OMNI + "mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"
# HERESY 1297: the prompt writer by its shards' index (_here checks every shard it names), not by its config.json, which comes
# first: a fetch cut short left the config and one shard on Viktor's laptop, and the card said «here»
# HERESY 1428: the covers' helpers, which came with Krea 2's set: the content filter and the prompt writer
HELPERS = ["artwork/nsfw-filter/model.safetensors", "artwork/Qwen3-4B-Instruct-2507/model.safetensors.index.json"]
# HERESY 1323 (Viktor 10.10.2026: «Забирай 2512 тоже в Студию»; «как альтернативу для менее мощных карт бери смело … Q6_K + Lightning…
# Для 16 ГБ — Q4_K_M»; on Qwen-Image-2.1: «мы предупреждаем пользователя по этому поводу»): the Qwen painters, as artist.py's
# qwen_ready() wants them; the sizes from the pinned file lists (Qwen/Qwen-Image-2512 25468b9: its parts 16.8 GB, the GGUF 13.2 and
# 16.8, Lightning 0.85; Qwen/Qwen-Image-2.1 d26bb61: 33.1)
Q2512 = "artwork/Qwen-Image-2512/"
Q2512_PARTS = [Q2512 + "model_index.json", Q2512 + "transformer/config.json", Q2512 + "text_encoder/model.safetensors.index.json",
               Q2512 + "vae/diffusion_pytorch_model.safetensors", Q2512 + "lightning/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors"]
QWEN21 = ["artwork/Qwen-Image-2.1/model_index.json", "artwork/Qwen-Image-2.1/transformer/diffusion_pytorch_model.safetensors.index.json",
          "artwork/Qwen-Image-2.1/text_encoder/model.safetensors.index.json", "artwork/Qwen-Image-2.1/vae/diffusion_pytorch_model.safetensors"]
# HERESY 1347: the fp8 fine-tunes of 2512 and the Artist's adapters in our models repo, shared there by their authors' leave
QFINE = Q2512 + "checkpoints/"
# HERESY 1440: v2 rebuilt whole (14.10.2026), the adapters their authors let be shared laid flat by family; 1441 (Viktor: «пользователь
# волен переименовать скачанное»): each known by its content, as v2's MANIFEST.tsv says it: renamed, or moved into a folder of the user's
# own, it is here all the same
ART_LORAS = [
    {"path": "artwork/loras/qwen-image-2512/Film Photography v1.safetensors", "size": 147686840, "sha256": "92124455ff640222b41db8283a4a584efdb22a72445047bfd7b40ed42da75ed2", "tensors": "b1cf8d57a3fa67cd6d4f18b69b47ef0e837bbcae2767bf5315c9031550893d43"},
    {"path": "artwork/loras/qwen-image-2512/PHOTOSTYLE BY SEAN ARCHER - SFW v2.safetensors", "size": 590058800, "sha256": "1be6b336f939642837ec96dd84dc7d6dbc1d6697c9c68e90807dc5fb4814dc01", "tensors": "c6d234099677bc6af6349e32049bce118d17874b6dd665c9994a7850dbef38f0"},
    {"path": "artwork/loras/qwen-image-2512/QWEN-2512-Lightning-4steps-V1.0-bf16.safetensors", "size": 849608296, "sha256": "de0d236e54ecf2c43b32447d13478c6eae0d361b1fed48c69675b084fa240d87", "tensors": "8565b490cb6d9ef9b43a0e0e5fd9f55a29ed7b63600f887fb3c75cf993edc2c3"},
    {"path": "artwork/loras/qwen-image-2512/QWEN-2512-Lightning-4steps-V1.0-fp32.safetensors", "size": 1698951104, "sha256": "ad12117461cb41e2ea637fec8df6392ce8e8550c47fbe2b829ed3deb98262066", "tensors": "5810ddd50f1fae9721eafe87563a55a1f9a7f339fbd3dead4ae45569e1c6e2f2"},
    {"path": "artwork/loras/qwen-image-2512/QWEN-2512-Lightning-8steps-V1.0-fp32.safetensors", "size": 1698951104, "sha256": "4f98e28203397d36fe10f1a122d8cb790096f8c5b916d7b1cfe103ae45555fc7", "tensors": "f5141c5f40871f4d061d666e54b5198b215da11e3a80566bd578a195da47d3f0"},
    {"path": "artwork/loras/qwen-image-2512/qwen-sketch-smudge.safetensors", "size": 1179978088, "sha256": "364d567a430374691360e93f73382974c8126e2c7578ed2f9b54f387b1d2e8a1", "tensors": "b1dc96939cffc851f8b49ee7bc43b87b8cc6c7128620f4d04dbbe08df6707d71"},
    {"path": "artwork/loras/qwen-image-2.1/Fantasy ArtStyle v1.safetensors", "size": 293659760, "sha256": "d8ed904e65ecec11f2c4b2f2e7aedaa4a8c0884e9346c451880861c97b37861f", "tensors": "6e2fb2580284166e677ccf9c008252b935bfd6ece6cce2fe1ddc8d63787c8ae2"},
    {"path": "artwork/loras/qwen-image-2.1/Frank Frazetta.safetensors", "size": 872495848, "sha256": "874fbe8a1ded21cf572e766a0da98135a64be48c4aa8dce197d92ec6a08b73fe", "tensors": "f23e7b4c3bbcc9140b9b6aee912ccf50fd2d700cb11aa241ec2f2807d30fc07d"},
    {"path": "artwork/loras/qwen-image-2.1/GPT-Image-2 Anime.safetensors", "size": 83943992, "sha256": "8f43f3d2f30d98eae38f7b167fb493a09148affff7d901686f5f0017422fdb19", "tensors": "df83900299208316bea382c9f71a611686bf9cdf54a926b59fa5ca104f246b6c"},
    {"path": "artwork/loras/qwen-image-2.1/Lenovo UltraReal.safetensors", "size": 79743896, "sha256": "7f1e95c3ec1e9c7cea197f7b6f80f601af8e6b479f6ead78ab16df542f447c0e", "tensors": "d8aae6968836ea7e20d71f7a2f0a52de20c9667d2262d323231499c04a5ec4ca"},
]
# the extras, each only when asked for, with fetch-heresy.sh's own sizes and notes; a variant is here when all its files are
EXTRAS = [
    {"name": "backbone", "label": "Backbone", "restart": True,
     "what": "M-A-P's YuE2 as GGUF (Serveurperso's, from goldhub/Ruach_Studio_Models_v2): Compute chooses between those here",
     "variants": [
         {"id": "BF16", "size": "7.2 GB", "note": "the whole model; on a card older than Ampere (an RTX 20xx, a Quadro RTX) it runs without its tensor cores, slower than Q8_0",
          "files": ["models/YuE2-3B-BF16.gguf"]},
         {"id": "Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-Q8_0.gguf"]},
         {"id": "Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-Q6_K.gguf"]},
         {"id": "Q5_K_M", "size": "2.6 GB", "files": ["models/YuE2-3B-Q5_K_M.gguf"]}]},
    # HERESY 1490 (Viktor 16.10.2026: «прикрутить скачивание этих GGUF в студии и выбор активной модели к базовым m-a-p весам»)
    {"name": "ira", "label": "IRA merge", "restart": True,
     "what": "YuE2-3B with two of Mothersuperior's adapters folded in, Instrumental on the music half (0.75) and Real Audio v9 on the sound half (0.85): Ruach Studio's merge, from goldhub/YuE2-3B-Ruach_Studio-IRA-Merge (CC BY-NC 4.0). Compute chooses it beside m-a-p's backbones; do not add those two adapters on top",
     "variants": [
         {"id": "BF16", "size": "7.2 GB", "files": ["models/YuE2-3B-IRA-BF16.gguf"]},
         {"id": "Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-IRA-Q8_0.gguf"]},
         {"id": "Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-IRA-Q6_K.gguf"]}]},
    # HERESY 1689 (Viktor 21.10.2026: «Собирай IRAE* мёрджи, пушай их в IRA репо и прикручивай к загрузчику»): IRA with monsterovich's Epic Trailer on top
    {"name": "irae", "label": "IRAE merge", "restart": True,
     "what": "IRA with monsterovich's Epic Trailer adapter folded in on top, at three strengths (music / sound): IRAE 0.32 / 0.32, the fullest by ear; IRAEv2 0.28 / 0.24, cleaner; IRAEv3 0.5 / 0.375, its author's own, at its best on instrumentals. Ruach Studio's merges, from goldhub/YuE2-3B-Ruach_Studio-IRA-Merge (CC BY-NC 4.0). Compute chooses them beside m-a-p's backbones; do not add Instrumental, Real Audio or Epic Trailer on top. IRAE-IR (0.4 / 0.6) and IRAE-IRv2 (0.32 / 0.6) carry monsterovich's Industrial Rock as well: experimental, highly unstable on lyrics, mostly for rock instrumentals; nor Industrial Rock on them",   # HERESY 1708: and IRAE-IR, IRAE-IRv2
     "variants": [
         {"id": "IRAE-BF16", "size": "7.2 GB", "files": ["models/YuE2-3B-IRAE-BF16.gguf"]},
         {"id": "IRAE-Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-IRAE-Q8_0.gguf"]},
         {"id": "IRAE-Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-IRAE-Q6_K.gguf"]},
         {"id": "IRAEv2-BF16", "size": "7.2 GB", "files": ["models/YuE2-3B-IRAEv2-BF16.gguf"]},
         {"id": "IRAEv2-Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-IRAEv2-Q8_0.gguf"]},
         {"id": "IRAEv2-Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-IRAEv2-Q6_K.gguf"]},
         {"id": "IRAEv3-BF16", "size": "7.2 GB", "files": ["models/YuE2-3B-IRAEv3-BF16.gguf"]},
         {"id": "IRAEv3-Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-IRAEv3-Q8_0.gguf"]},
         {"id": "IRAEv3-Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-IRAEv3-Q6_K.gguf"]},
         {"id": "IRAE-IR-BF16", "size": "7.2 GB", "files": ["models/YuE2-3B-IRAE-IR-BF16.gguf"]},
         {"id": "IRAE-IR-Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-IRAE-IR-Q8_0.gguf"]},
         {"id": "IRAE-IR-Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-IRAE-IR-Q6_K.gguf"]},
         {"id": "IRAE-IRv2-BF16", "size": "7.2 GB", "files": ["models/YuE2-3B-IRAE-IRv2-BF16.gguf"]},
         {"id": "IRAE-IRv2-Q8_0", "size": "3.8 GB", "files": ["models/YuE2-3B-IRAE-IRv2-Q8_0.gguf"]},
         {"id": "IRAE-IRv2-Q6_K", "size": "2.9 GB", "files": ["models/YuE2-3B-IRAE-IRv2-Q6_K.gguf"]}]},
    # HERESY 1794: Ruach Studio's own fine-tune, the seven merges at three quants each (models/YuE2-3B-RS-FW-<merge>-<quant>.gguf)
    {"name": "fw", "label": "RS-FW merge", "restart": True,
     "what": "YuE2-3B with Ruach Studio's own fine-tune folded in (YuE2-RS-FW, at seven points of its training: epoch x strength): 2.4x0.75 is the studio's default, the safest; from goldhub/YuE2-RS-Finetunes (CC BY-NC-SA 4.0). Compute chooses it beside m-a-p's backbones; the adapters themselves are not published",
     "variants": [dict({"id": f"{v}-{q}", "size": size, "files": [f"models/YuE2-3B-RS-FW-{v}-{q}.gguf"]}, **({"note": "the studio's default"} if v == FW_DEFAULT else {}))
                  for v in FW_MERGES for q, size in FW_SIZES.items()]},
    # HERESY 1811 (Viktor 28.10.2026: «прикручивай как Local Studio LLM… дай выбор юзеру выбрать либо мой качественный квант, либо более сжатый»)
    {"name": "writer", "label": "Studio writer",
     "what": "Qwopus3.5-9B-v3 (Jackrong's fine-tune of Qwen3.5-9B, Apache-2.0), quantized with AutoRound and moved into GGUF bit for bit, from goldhub/Ruach_Studio_Models_v2: the Writer's own language model on this machine, through llama.cpp (vendor/llama.cpp, built by launcher/extras.sh); Engine → Writer chooses between those here",
     "variants": [
         {"id": "quality", "label": "Quality", "size": "6.7 GB", "note": "about 7.5 GB of VRAM with its 12K context: a 12 GB card",
          "files": ["checkpoints/Qwopus3.5-9B-GGUF/Qwopus3.5-9B-v3-AR-Q4_0.gguf"]},
         {"id": "compact", "label": "Compact", "size": "5.5 GB", "note": "about 6.5 GB of VRAM with its 12K context: an 8 GB card",
          "files": ["checkpoints/Qwopus3.5-9B-GGUF/Qwopus3.5-9B-v3-AR-compact.gguf"]}]},
    {"name": "listener", "label": "Style listener",
     "what": "Qwen2.5-Omni-7B: hears the songs of a training set and writes each one's style tags; the GGUF ones run through llama.cpp (vendor/llama.cpp, built by you)",
     "variants": [
         {"id": "Q8_0", "size": "9.6 GB", "note": "10.3 GB of VRAM when it listens", "files": [OMNI + "Qwen2.5-Omni-7B-Q8_0.gguf", PROJ]},
         {"id": "Q5_K_M", "size": "6.9 GB", "note": "8.0 GB of VRAM when it listens", "files": [OMNI + "unsloth/Qwen2.5-Omni-7B-Q5_K_M.gguf", PROJ]},
         {"id": "Q4_K_M", "size": "6.2 GB", "note": "7.3 GB of VRAM when it listens", "files": [OMNI + "Qwen2.5-Omni-7B-Q4_K_M.gguf", PROJ]},
         {"id": "bf16", "size": "22 GB", "note": "18.3 GB of VRAM when it listens: a 24 GB card",
          "files": ["checkpoints/Qwen2.5-Omni-7B/model.safetensors.index.json"]}]},
    None,   # the artwork's, by the biggest card here (below)
    {"name": "qwen", "label": "Qwen painters",
     "what": "the Artist's Qwen-Image painters: 2512 with Lightning's 8 steps (Apache-2.0: its parts from Qwen, the transformer as GGUF) and 2.1 (Qwen's research licence)",
     "variants": [
         {"id": "2512-q4", "label": "Qwen-Image 2512 Q4", "size": "31 GB",
          "note": "31 GB fetched, its text encoder (16.6 GB) among it: the encoder reads the prompt and leaves the card, then the painter takes about 15 GB; for a card of 16 GB (below 20 GB the encoder reads on the processor: 17 GB of RAM); about two minutes a cover on a 3090; less when some of it is here",
          "files": Q2512_PARTS + [Q2512 + "gguf/qwen-image-2512-Q4_K_M.gguf"]},
         {"id": "2512-q6", "label": "Qwen-Image 2512 Q6", "size": "34.5 GB", "note": "its text encoder among it, gone from the card before the painter comes: the painter takes about 20 GB, for a card of 20 GB; less when some of it is here",
          "files": Q2512_PARTS + [Q2512 + "gguf/qwen-image-2512-Q6_K.gguf"]},
         {"id": "2.1", "label": "Qwen-Image 2.1", "size": "33.1 GB",
          "note": "under Qwen's research licence: research and evaluation only, not for commercial use (a cover for a song that is sold is commercial use); a card of 24 GB, about two minutes a picture",
          "files": QWEN21}]},
    # HERESY 1347 (Viktor: «Залей в него все модели диффузные… и LoRA адаптеры, и настрой выборочное скачивание прямо в студии Художника»)
    {"name": "qwen-fine", "label": "Qwen fine-tunes",
     "what": "the fp8 fine-tunes of Qwen-Image 2512 for finished realism (a card of 24 GB), from goldhub/Ruach_Studio_Models_v2, shared there by their authors' leave (Civitai: share and sell)",
     "variants": [
         {"id": "jibmix-v6", "label": "Jib Mix Qwen v6 by J1B", "size": "20.4 GB", "note": "and Qwen-Image 2512's parts (17.7 GB) when they are not here",
          "files": [QFINE + "JibMix QW2512 v6 fp8.safetensors"] + Q2512_PARTS},
         {"id": "intorealism-v1", "label": "IntoRealism Qwen v1 by enzino", "size": "20.4 GB", "note": "and Qwen-Image 2512's parts (17.7 GB) when they are not here",
          "files": [QFINE + "IntoRealism QW2512 v1 fp8.safetensors"] + Q2512_PARTS},
         {"id": "real-v2", "label": "Real-Qwen-Image v2 by wikeeyang", "size": "20.4 GB", "note": "and Qwen-Image 2512's parts (17.7 GB) when they are not here",
          "files": [QFINE + "Real QW2512 v2 fp8.safetensors"] + Q2512_PARTS},
         {"id": "base-fp8", "label": "Qwen-Image 2512 itself in fp8", "size": "20.4 GB", "note": "and Qwen-Image 2512's parts (17.7 GB) when they are not here",
          "files": [QFINE + "BASE QW2512 fp8_e4m3fn.safetensors"] + Q2512_PARTS}]},
    {"name": "art-loras", "label": "Artist's adapters",
     "what": "adapters for the Artist's painters, from goldhub/Ruach_Studio_Models_v2, shared there by their authors' leave (Civitai: share and sell; Sketch Smudge and Lightning Apache-2.0): Fantasy ArtStyle, Frank Frazetta, GPT-Image-2 Anime and Lenovo UltraReal for Qwen-Image 2.1; Film Photography, Photostyle by Sean Archer, Sketch Smudge and Lightning in 4 and 8 steps for 2512",
     "variants": [{"id": "all", "label": "ten adapters", "size": "7.5 GB", "files": ART_LORAS}]},
    # HERESY 1303: MERT-v2-FullSong comes with the base (2.5 GB): the set's latent cache needs it; 1445: all three from v2, unchanged
    {"name": "trainer", "label": "LoRA trainer's base",
     "what": "Comfy-Org's YuE2 for the Trainer, with Mothersuperior's tokenizer head and m-a-p's MERT-v2-FullSong (the set's latent cache hears with it), from goldhub/Ruach_Studio_Models_v2 (CC BY-NC 4.0)",
     "variants": [
         {"id": "bf16", "size": "10.3 GB", "note": "trains on unquantized weights; MERT-v2-FullSong's 2.5 GB among them, less when it is here",
          "files": ["checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors", "checkpoints/MERT-v2-FullSong/model.safetensors"]},
         {"id": "int8", "size": "6.5 GB", "note": "for a smaller card; MERT-v2-FullSong's 2.5 GB among them, less when it is here",
          "files": ["checkpoints/comfy/checkpoints/yue2_3b_int8_convrot.safetensors", "checkpoints/MERT-v2-FullSong/model.safetensors"]}]},
]
# HERESY 1425 (Viktor 13.10.2026: «В МОДЕЛЯХ и LoRA только Krea 2 Muse доступна, тогда как выше я могу выбрать из полного списка»):
# the row named by its painter, beside «Qwen painters»; Engine → Artwork chooses among the painters these rows fetch
ARTWORK_BIG = {"name": "artwork", "label": "Covers' helpers",   # HERESY 1428: Krea 2 gone; what came with it and every painter uses
               "what": "the prompt writer (Qwen3-4B-Instruct-2507, Apache-2.0) that writes a picture's prompt from the song, and the content filter (Falconsai/nsfw_image_detection, Apache-2.0) every picture passes; the painters are the Qwen ones below",
               "variants": [{"id": "all", "label": "the prompt writer and the filter", "size": "8.4 GB", "note": "less when some of it is here", "files": HELPERS}]}

LINE = re.compile(r"^(here|differs|missing|fetched|unknown|failed)\s+(.*)$")
SUM = re.compile(r"^here (\d+) · unknown (\d+) · differs (\d+) · fetched (\d+) · missing (\d+) · failed (\d+)$")
JOB = {}
LOCK = threading.Lock()
_BIG = []


def _biggest_card_mb():
    """The biggest card's memory, as fetch-heresy.sh --artwork judges it (0 without nvidia-smi); asked once."""
    if not _BIG:
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=20).stdout
            _BIG.append(max([int(x) for x in out.split() if x.strip().isdigit()] or [0]))
        except (OSError, subprocess.SubprocessError):
            _BIG.append(0)
    return _BIG[0]


_HFX = []


def _by_content(kit, want):
    """HERESY 1441: an adapter known by its content (tools/hf_expect.py's own finder): under its family's folder, renamed or moved."""
    if not _HFX:
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("hf_expect", kit / "tools" / "hf_expect.py")
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            _HFX.append(m)
        except (OSError, ImportError, SyntaxError):
            _HFX.append(None)
    m = _HFX[0]
    if m is None or not hasattr(m, "find_by_content"):
        return False
    ids = m.load_ids()
    hit = m.find_by_content(str(kit / os.path.dirname(want["path"])), want.get("size"), want.get("sha256"), want.get("tensors"), ids)
    m.save_ids(ids)
    return bool(hit)


def _here(kit, files):
    for rel in files:
        if isinstance(rel, dict):                    # HERESY 1441: known by its content
            f = kit / rel["path"]
            if not (f.is_file() and f.stat().st_size == rel.get("size", f.stat().st_size)) and not _by_content(kit, rel):
                return False
            continue
        f = kit / rel
        try:
            if not f.is_file() or f.stat().st_size == 0:
                return False
            if rel.endswith(".safetensors.index.json"):          # every shard its index names
                shards = set(json.loads(f.read_text(encoding="utf-8")).get("weight_map", {}).values())
                if not shards or any(not (f.parent / s).is_file() or (f.parent / s).stat().st_size == 0 for s in shards):
                    return False
        except (OSError, ValueError):
            return False
    return True


def _extras(kit):
    out = []
    for e in EXTRAS:
        e = e or ARTWORK_BIG                        # HERESY 1405: any card (SDXL gone)
        out.append(dict({k: v for k, v in e.items() if k != "variants"},
                        variants=[dict({k: v for k, v in x.items() if k != "files"}, here=_here(kit, x["files"])) for x in e["variants"]]))
    return out


def _strip(kit, text):
    for root in {str(kit), os.path.realpath(kit)}:
        text = text.replace(root + "/", "")
    return text


def _last_run(kit):
    """The last whole run's verdicts (tmp/fetch-heresy.list): parts, each with its rows; None before the first."""
    f = kit / "tmp" / "fetch-heresy.list"
    try:
        lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    parts, counts, mode, at, cur = [], None, "", int(f.stat().st_mtime), None
    for line in lines:
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        st, what, words = cols[0], _strip(kit, cols[1]), _strip(kit, cols[2])
        if st == "##":
            cur = {"part": what, "label": words, "size": parts_of(kit).get(what, ""), "rows": []}   # HERESY 1794: the fine-tune's at its quant
            parts.append(cur)
        elif st == "#sum":
            n = what.split()
            if len(n) == 6:
                counts = dict(zip(("here", "unknown", "differs", "fetched", "missing", "failed"), map(int, n)))
            m = words.split()
            mode, at = (m[0] if m else ""), (int(m[1]) if len(m) > 1 and m[1].isdigit() else at)
        elif cur is not None:
            cur["rows"].append({"state": st, "text": (what + " " + words).strip()})
    return {"parts": parts, "counts": counts, "mode": mode, "at": at}


def _free(kit):
    try:
        st = os.statvfs(kit)
        return st.f_bavail * st.f_frsize
    except OSError:
        return None


def _job_view(kit):
    with LOCK:
        if not JOB:
            return None
        j = {k: v for k, v in JOB.items() if k not in ("lines", "free0")}
        j["lines"] = JOB["lines"][-200:]
        if JOB["status"] == "running" and JOB.get("free0") is not None:
            now = _free(kit)
            j["written"] = max(0, JOB["free0"] - now) if now is not None else None   # the disk's free room it took so far
    return j


def listing(kit):
    script = kit / "heresy" / "fetch-heresy.sh"
    return {"script": script.is_file(), "last": _last_run(kit), "extras": _extras(kit), "parts": parts_of(kit),   # HERESY 1794
            "job": _job_view(kit), "now": int(time.time())}


def running():
    with LOCK:
        return bool(JOB) and JOB.get("status") == "running"


NAMES = {"extras": "the extra decoders", "whisper": "Whisper", "stems": "the stems' models", "upscale": "UniverSR",
         "loras": "the LoRAs", "fw": "Ruach Studio's own fine-tune"}   # HERESY 1794


def _args(body):
    """fetch-heresy.sh's arguments and the run's name for a POST /weights/fetch body; ValueError for anything else."""
    part = str(body.get("part", "") or "")
    if part == "missing":
        return [], "what is missing"
    if part in PARTS or part == "fw":                # HERESY 1794: the fine-tune's part, at the backbone's quant
        return ["--only", part], NAMES[part]
    for e in EXTRAS:
        name = e["name"] if e else "artwork"
        v = body.get(name)
        if v is None:
            continue
        v = str(v)
        ids = [x["id"] for x in (e or ARTWORK_BIG)["variants"]]
        if v not in ids:
            raise ValueError(f"{name} takes {', '.join(ids)}")
        x = (e or ARTWORK_BIG)["variants"]
        label = (e or ARTWORK_BIG)["label"]
        what = "the " + (label if label[:2].isupper() else label[0].lower() + label[1:]) + " " + next((y.get("label") or y["id"] for y in x if y["id"] == v), v)   # 1490: «the IRA merge»
        if name == "artwork":
            return ["--only", "none", "--artwork-q8" if v == "q8" else "--artwork", "--yes"], what
        return ["--only", "none", "--" + name, v, "--yes"], what
    raise ValueError("say what to fetch: a part (missing, " + ", ".join(list(PARTS) + ["fw"]) + ") or an extra (backbone, ira, irae, fw, writer, listener, artwork, qwen, qwen-fine, art-loras, trainer)")


def _bytes(size):
    """HERESY 1302: «7.2 GB», «56 MB» → bytes, decimal as the sizes are measured (du -sb); None where it says no number."""
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(GB|MB)\b", str(size or ""))
    return int(float(m.group(1)) * (1e9 if m.group(2) == "GB" else 1e6)) if m else None


def _which(body, kit=None):
    """HERESY 1302: what a fetch was asked for, for the page to draw its progress at that row ({"part": …} or {"extra": …,
    "variant": …}), and the bytes the card says it brings (None for «what is missing»: its size is not one number)."""
    part = str(body.get("part", "") or "")
    if part:
        return {"part": part}, _bytes((parts_of(kit) if kit else PARTS).get(part))   # HERESY 1794: the fine-tune's at its quant
    for e in EXTRAS:
        name = e["name"] if e else "artwork"
        if body.get(name) is None:
            continue
        v = str(body[name])
        x = (e or ARTWORK_BIG)["variants"]
        return {"extra": name, "variant": v}, _bytes(next((y["size"] for y in x if y["id"] == v), ""))
    return {}, None


def _start(kit, args, what, kind, then_check, which=None, expect=None):
    with LOCK:
        if JOB.get("status") == "running":
            raise ValueError(f"a run is under way ({JOB.get('what')}): one at a time")
        JOB.clear()
        JOB.update(kind=kind, what=what, args=args, status="running", started=time.time(), ended=None, rc=None, lines=[],
                   counts=None, restart=False, free0=_free(kit) if kind == "fetch" else None,
                   which=which or {}, expect=expect)   # HERESY 1302
    threading.Thread(target=_run, args=(kit, args, then_check), daemon=True).start()
    return listing(kit)


def check(kit):
    if not (kit / "heresy" / "fetch-heresy.sh").is_file():
        raise FileNotFoundError("no heresy/fetch-heresy.sh in this tree")
    return _start(kit, ["--check"], "what is here", "check", False)


def fetch(kit, body, scope=""):
    if scope:
        raise ValueError("a test page fetches nothing: open the studio without ?scope= to fetch")
    if not (kit / "heresy" / "fetch-heresy.sh").is_file():
        raise FileNotFoundError("no heresy/fetch-heresy.sh in this tree")
    body = body if isinstance(body, dict) else {}
    args, what = _args(body)
    which, expect = _which(body, kit)               # HERESY 1302: the page's progress at the row pressed (1794: the kit, for the fine-tune's size)
    # a part fetched alone leaves the whole list as it was: a check after it says where everything stands
    return _start(kit, args, what, "fetch", bool(args and args[0] == "--only" and args[1] != "none"), which, expect)


def _say(kit, args):
    """One run of fetch-heresy.sh into JOB["lines"]; its exit status (0: nothing failed)."""
    env = dict(os.environ, NO_COLOR="1", HF_HUB_DISABLE_TELEMETRY="1")
    p = subprocess.Popen(["bash", str(kit / "heresy" / "fetch-heresy.sh")] + args, cwd=str(kit), env=env, stdin=subprocess.DEVNULL,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        line = _strip(kit, line.rstrip("\n"))
        with LOCK:
            JOB["lines"].append(line)
            del JOB["lines"][:-1000]
            m = SUM.match(line)
            if m:
                JOB["counts"] = dict(zip(("here", "unknown", "differs", "fetched", "missing", "failed"), map(int, m.groups())))
            # a backbone, a decoder or the sliders: the engine reads those when it starts (LoRAs it reads each time)
            if JOB["kind"] == "fetch" and re.match(r"^fetched\s+(models/|legacy and blend decoders)", line):   # 1449: no sliders
                JOB["restart"] = True
    return p.wait()


def _run(kit, args, then_check):
    try:
        rc = _say(kit, args)
        with LOCK:
            JOB["rc"] = rc
        if then_check:
            with LOCK:
                JOB["lines"].append("")
                JOB["lines"].append("— the check, after it —")
                JOB["checking"] = True
                counts = JOB["counts"]
            _say(kit, ["--check"])
            with LOCK:
                JOB["checking"] = False
                JOB["after"] = JOB["counts"]
                JOB["counts"] = counts
        with LOCK:
            JOB["status"] = "done" if rc == 0 else "failed"
    except (OSError, subprocess.SubprocessError) as e:
        with LOCK:
            JOB["lines"].append(f"failed: {e}")
            JOB["status"] = "failed"
    finally:
        with LOCK:
            JOB["ended"] = time.time()
