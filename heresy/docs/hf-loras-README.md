---
license: cc-by-nc-4.0
base_model: m-a-p/YuE2-3B
pipeline_tag: text-to-audio
tags:
  - yue2
  - lora
  - music
  - instrument
  - shofar
  - duduk
  - ruach-studio
---

# Ruach Studio · instrument LoRAs for YuE2

Adapters that teach [YuE2](https://huggingface.co/m-a-p/YuE2-3B) an instrument it plays weakly or not at all, made in
the LoRA Trainer of **Ruach Studio** (its own trainer, bf16 throughout) and chosen by ear, epoch by epoch, by the
studio's author. The repo has four rooms: `instruments/` (these), `styles/`, `vocals/` (singing voices) and `voices/`
(speaking voices) for what comes next; each adapter's folder is as the studio keeps it in its `loras/`.

| adapter | what it gives | epochs here |
|---|---|---|
| `instruments/shofar-yt-r16` | the **shofar**, which YuE2 does not know at all (asked for by name, the base model gives no horn): long blasts and broken calls in a large space | e099 · **e110** · e121 · e167 |
| `instruments/duduk-yt-r16` | the **duduk**: the base model already plays one; the adapter brings the recordings' reedy breath and phrasing | e080 · e140 · e160 · e180 · e200 |

**Where to start.** The shofar: **e110**, the author's choice by ear (a long Yemenite horn, a whole meditation);
e099 and e121 are its neighbours, e167 the run's last epoch (thinner, weaker). The duduk: any of the five; the samples
below put each beside the base model on the same seeds.

## In Ruach Studio

1. Put an adapter's folder from `instruments/` (or one file of it) into the studio's `loras/`:
   `loras/shofar-yt-r16/shofar-yt-r16-e110.safetensors`.
2. In the Creator, the LoRA picker shows it. The samples here are **Direct** (no score), both halves at **1.0**.
   With a planned score (*Full plan*, *Melody only*) keep the music half low (0.5 and less): stacked music strengths
   past the studio's measured ceiling break the score.
3. The style: begin with the instrument's name, as its captions did (`shofar, …`, `duduk, …`). The samples' styles:
   - shofar: *shofar, Instrumental, solo shofar, a ram's horn blown in long sustained blasts and broken calls, tekiah,
     shevarim, teruah, raw piercing horn tone with breath, huge reverberant space, ritual and solemn, nothing else
     playing*
   - duduk: *Instrumental, solo duduk. A slow, meditative piece played by a single duduk, close-miked and in front,
     nothing else playing. Natural room, no vocals.*

Both halves are in one file, with AI-Toolkit's key names (`text_encoders.*` the music half, `diffusion_model.*` the
sound half), so other YuE2 front ends that read AI-Toolkit adapters load them as they are.

## How they were made

Ruach Studio's LoRA Trainer, its own engine: the bf16 model, nothing quantized; rank 16, learning rate 1e-4; music
half (AR) loss weight 0.5 with a KL anchor of 0.2 and half the learning rate; 60-second windows; Direct (no score).

| | material | steps · epochs | checkpoints | one RTX 3090 |
|---|---|---|---|---|
| `duduk-yt-r16` | 5 non-repeating stretches of one recording, 12.6 min | 1000 · 200 | every 20 epochs | 44 min, 18.7 GiB peak |
| `shofar-yt-r16` | 9 stretches of six recordings, 37.8 min, sorted by ear (worship pads and voices out) | 1503 · 167 | every 11 epochs | 97 min, 21.6 GiB peak |

The recordings are public videos of the instruments (YouTube `-0ajtTFYm2k` for the duduk; `wXrt6S9aGUI`,
`PtiEU7ZEKgs`, `TXQV2bMnGlk`, `gjlh864Mhbg`, `o8-AFAcNl0E`, `qckg_d1mYO8` for the shofar). Only the stretches that
do not repeat were used: some of them loop the same minutes for hours.

## Licence

The adapters: **CC BY-NC 4.0**, as the YuE2 weights they adapt. The samples (audio and pictures): **CC BY-NC-ND 4.0**,
as everything published with Ruach Studio; the studio's code is AGPL-3.0-or-later.

## Samples

Each epoch on two seeds, A and B: most on 5101/6101 (A) and 5102/6102 (B), so they compare; a sample made again
with new seeds says its own. The length is the take's own.
