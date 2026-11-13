# The Narrator's second engine: Higgs TTS 3 (Boson AI)

From release 2.0.8 the Narrator reads with two engines: Fish Audio's Drama 3 and Boson AI's Higgs TTS 3 (also called Higgs Audio v3: 4B on Qwen3, with its own audio tokenizer). Ruach Studio never mirrors Higgs. You fetch it yourself, from Boson's own repositories on Hugging Face, under Boson's licence. Ruach Studio breaks none of its terms, and this page says what those terms ask of you.

## Fetching it

In the Studio: **Engine → Models**, the row **Narrator · Higgs TTS 3 (Boson AI)**, Fetch. The question names both licences with their links, and its button says «Accept and fetch»: fetching means you accept them. If Boson ever puts the model behind a gate on Hugging Face, the Studio says so and asks, once: open the model's page, sign in, accept its conditions (when its authors approve requests by hand, wait for their e-mail), then paste a Hugging Face access token (read) into the field. The token goes with that one download and is saved nowhere: not in a file, not in a log, not in your settings.

From a terminal, in the Studio's folder: `bash heresy/fetch-heresy.sh --only none --higgs bf16`. For a gated repository, put your token in the environment of that one command: `HF_TOKEN=hf_… bash heresy/fetch-heresy.sh --only none --higgs bf16`.

Every file comes at the commit the release pins, and each is checked against its size and SHA-256 before it takes its place.

## Its Python

Higgs reads through 🤗 transformers 5 (5.5 or newer) with torch, in a Python of its own beside the Studio's: `.venv-read` in the Studio's folder. One command makes it, then asks your yes to Boson's licences and fetches the model if it is not here yet:

```
bash tools/narrator-higgs-setup.sh            # its Python, then the model after your yes
bash tools/narrator-higgs-setup.sh --check    # what is here and what is not
bash tools/narrator-higgs-setup.sh --python --cpu   # only its Python, for the processor even beside a card
```

With an NVIDIA card it takes torch's CUDA 12.8 wheels (about 5 GB), else the processor's (about 1 GB). Python 3.10 or newer with venv is needed. The Narrator's room shows the engine «Boson AI Higgs TTS 3» once its Python and the model are both here, and says what is still missing until then. On a card BF16 takes about 11 GB of its memory; on the processor it reads several times slower than real time (about 7 seconds for each second of speech on eight threads).

## Where the files go

Fetched by hand, the files must sit exactly here, under the Studio's folder:

```
models/narrator/
├── higgs-tts-3-4b/                         from bosonai/higgs-tts-3-4b (Boson AI), commit 239f63f
│   ├── model.safetensors                   9.3 GB, SHA-256 2f796526…ae3d5a
│   ├── model.safetensors.index.json
│   ├── tokenizer.json                      SHA-256 eb883de2…737d4d1c1
│   ├── tokenizer_config.json
│   ├── chat_template.jinja
│   ├── LICENSE                             Boson Higgs TTS 3 Research and Non-Commercial License
│   ├── README.md · PROMPTING.md
│   ├── config.json                         ┐ the transformers loader: three small files from
│   ├── configuration_higgs_multimodal_qwen3.py │ multimodalart/higgs-audio-v3-tts-4b-transformers,
│   └── modeling_higgs_multimodal_qwen3.py  ┘ commit 30f0159 (its weights are Boson's, byte for byte)
└── higgs-audio-v2-tokenizer/               from bosonai/higgs-audio-v2-tokenizer (Boson AI), commit 815a03f
    ├── model.safetensors                   806 MB
    ├── config.json · preprocessor_config.json
    ├── LICENSE                             Boson Higgs Audio 2 Community License
    └── README.md
```

Boson publishes Higgs TTS 3 for SGLang-Omni and vLLM-Omni; the Studio runs it with 🤗 transformers (5.5 or newer), which needs the three loader files from the port. The weights and the tokenizer are taken from Boson, never from the port.

## What the licence asks of you

Higgs TTS 3 comes under the **Boson Higgs TTS 3 Research and Non-Commercial License** (last updated 8 July 2026); its audio tokenizer under the **Boson Higgs Audio 2 Community License**, which builds on Meta's Llama 3 Community License. Read both before you fetch: the links are in the Studio's question and in the two LICENSE files. In short, and the licences themselves are the word:

- **Free for research and non-commercial use**: personal and hobby work, evaluation, benchmarks, research.
- **Your own creative work may be published and monetized** (podcasts, videos, audiobooks, posts on channels you own or control) under the Creator Use Grant, if each published work acknowledges Boson AI's Higgs Audio in the audio itself or prominently in the text beside it. Boson suggests: «This audio was created with Boson AI's Higgs Audio — https://www.boson.ai/higgs-audio».
- **A separate written licence from Boson is needed** to host or serve it for others (an API, a service, a shared Studio), to put it in a product or service for third parties, to redistribute it or anything made from it (quantized and converted versions included), and for any use beyond that which is commercial.
- **Never train a model on what it makes.** No speech, audio, language or multimodal model may be trained, fine-tuned, distilled or improved with its output, unless Boson agrees in writing. The Studio marks every Higgs take «never for training», and the Trainer refuses marked files.
- **No real person's voice without their explicit, verifiable consent**, kept as a record for any public-facing use. No fraud, harassment, deception, sexual content involving minors, election or political impersonation, biometric surveillance, and AI-made audio is disclosed where a listener would otherwise be misled.
- **Keep the notices.** Do not remove its attribution, watermarks or provenance signals. Do not name anything you make «Higgs TTS …» or «Boson TTS», or anything that suggests Boson made or endorses it.
- **The tokenizer's licence** asks the same attribution of any product that uses it: «Built with Higgs Materials licensed from Boson AI USA, Inc.» together with Meta Llama 3's notice. Above 100,000 annual active users of a product built on it, Boson's expanded licence is needed.

## What Ruach Studio does on its side

- It fetches Higgs from Boson's own repositories and mirrors none of it, in no repository of ours.
- It names both licences with their links where you fetch it, and the two LICENSE files come beside the model and its tokenizer.
- It is a free, non-commercial application that uses Higgs, and it does what Boson's licence asks of one (Section IV(a)): the engine's folder (lab/reader_engines/higgs) carries a NOTICE with «Boson Higgs TTS 3 is licensed under the Boson Higgs TTS 3 Research and Non-Commercial License, Copyright (c) Boson AI USA, Inc. All Rights Reserved.», and the Engine's About names «Built with Higgs TTS 3 licensed from Boson AI USA, Inc.» and, for the tokenizer, «Built with Higgs Materials licensed from Boson AI USA, Inc., Copyright Boson AI USA, Inc., All Rights Reserved and Meta Llama 3 licensed under the Meta Llama 3 Community License, Copyright Meta Platforms, Inc., All Rights Reserved».
- Every Higgs take carries Boson's suggested acknowledgment as its credit, in its result line and in the Content Credentials of its downloads, so the line you publish beside your work is already there.
- It marks every take Higgs reads as never for training, in the take's files and in its WAV.
- It keeps no Hugging Face token of yours.
- Where you run it and what you make with it is yours to answer for, as with every model the Studio fetches for you.
