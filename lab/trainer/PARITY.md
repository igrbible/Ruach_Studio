# The trainer's parity log

Each stage of `heresy/docs/TRAINER-PLAN.md` is accepted only on numbers against AI-Toolkit (the reference,
`~/Documents/AI/AI_Toolkit`, Ostris, MIT), on the same input. Kept here, newest last.

## Stage 1 · load — accepted 02.10.2026, 02:50

Checkpoint `checkpoints/comfy/checkpoints/yue2_3b_int8_convrot.safetensors` (Comfy-Org int8 convrot),
229 int8 layers unpacked by `load.py`. One fixed input (seed 1234): 384 random AR ids, 250 frames of
noise, t = 0.5. Both sides on the CPU (`parity_aitk.py` in AI-Toolkit's venv, `parity.py` in ours).

| check | bf16 | float32 |
|---|---|---|
| weights (7 layers incl. lm_head, embed_tokens) | identical (0) | identical (0) |
| AR logits, last 16 positions, relative | 1.7e-2 | **9.6e-7** |
| AR top-1 agreement | 94 % | **100 %** |
| NAR velocity, relative | 1.8e-2 | **1.6e-6** |

The port is exact: in float32 the two networks agree to float32 noise. The bf16 difference is the order
of bf16 operations (AI-Toolkit's ConvRot layers compute in their rotated basis), not a difference of the
network. Note for stage 3: AI-Toolkit's *training* path always simulates W8A8 (int8 activations by
fake-quant); ours trains bf16 — its curves may differ a little for that reason alone.

## Stage 2 · cache — accepted 02.10.2026, 04:50 (by the decode, not by the bytes)

`cache.py`: per track the VAE's latents (float32) and the realaudio head's codec tokens (MERT on bf16
autocast, as the reference), into `_ruach_cache/NNN_ruach.safetensors` in AI-Toolkit's layout. Track 001
of `gtsinger-ru-alto` (89 s, 24-bit, a cappella), against AI-Toolkit's `_latent_cache`:

| check | result |
|---|---|
| the audio as each side reads it (torchaudio in AI-Toolkit's venv, soundfile in ours) | identical (0) |
| AI-Toolkit's own VAE code, run by hand on the CPU, against our cache | 2.1e-3 (fp16 vs fp32 weights) |
| our latents (CPU fp32 = GPU fp32, 2e-4) against AI-Toolkit's cache | rel 0.38, cos 0.93 |
| codec tokens, GPU against GPU | 97.7 % equal |
| decoded by the same VAE, against the track itself (60 s) | SNR 15.66 dB ours, 15.61 dB theirs; log-mel L1 **0.72 ours**, 0.85 theirs |

**Why the latents differ.** The VAE encoder is extremely sensitive to the faintest broadband change of its
input: white noise of 1e-7 (abs) moves the latents by 2e-4, 1e-6 by 3e-3, 1e-5 (−72 dB) by 0.13, 1e-4 by 0.39.
TF32 convolutions (10-bit mantissa) move them by 0.025; **bf16 autocast moves them by 0.33**, and then lands
nearer AI-Toolkit's cache (0.22) than float32 does (0.38): AI-Toolkit's cache was computed under bf16, ours is
float32. Byte parity is impossible by nature; the judge is the decoder, and it renders ours as well as theirs,
the spectrum a little closer. Ours stays float32 (Viktor: nothing cut down in our trainer).

## GPU smoke — 02.10.2026, 04:30

4 GTSinger tracks copied into a set with no cache at all, bf16 base, rank 16, voice knobs: the trainer made
its own cache (4 tracks), trained 40 steps at **1.88 s/step** (AI-Toolkit int8 on the same set: 2.1–2.4),
**11.4 GB peak** (AI-Toolkit int8 rank 32 on Fosforida: 18.9), saved at 20 and 40, went on from 40 to 50.
The LoRA: 448 tensors, AI-Toolkit's key names, bf16. Next: the twin run `gtsinger-ru-alto-voice-r16-ruach`
(the full set, 20 epochs, the same knobs as AI-Toolkit's `gtsinger-ru-alto-voice-r16`), its curves against the
reference's, then Viktor's ear on the same epoch of both.

## Stage 5 · a run — 02.10.2026, 06:05 (curves accepted; the ear decides)

`gtsinger-ru-alto-voice-r16-ruach`: the twin of AI-Toolkit's `gtsinger-ru-alto-voice-r16` — the same 148
tracks, rank 16, lr 1e-4, AR 0.3, KL 0.3, ×0.5, window 60 s, 2960 steps (20 epochs). Ours: bf16 weights, its
own float32 cache, 2.08 s/step, 103 min, 12.0 GB peak. Theirs: int8 base with W8A8 training, 2.25 s/step.

Epoch means over 19 epochs: **ar_ce equal within 0.015, ar_kl within 0.005, epoch by epoch** (e.g. e10:
3.952 / 3.956, 0.398 / 0.396). **flow: ours 2.7 % higher** (0.578 against 0.563, higher in 16 of 19).

The cause, by an experiment that changes one thing: our trainer twice, the same seed (the same windows and
noise levels at every step), 296 steps, once on our cache and once on AI-Toolkit's: flow +0.0084 (1.4 %)
with ours, higher in 248 of 296 steps; ar_ce and ar_kl the same. So half the gap is the latents (float32
keeps the fine detail that bf16 encoding scrambles, and it is harder to predict); the rest, most likely,
AI-Toolkit's W8A8 int8 training against our plain bf16. A higher flow loss on a richer target is not a
worse adapter: epochs 5, 6, 10 and 13 of both runs are in loras/ for Viktor's ear.

## Autonomy — 02.10.2026, 10:28 (AI-Toolkit's folder renamed away by Viktor)

`fosforida-v2-ruach-autonomy`, started from the Train room's own path: with no AI-Toolkit on the machine, the
trainer made the set's cache itself (42 songs, 178 s), trained 210 steps (5 epochs, rank 32, bf16) at 6.65 s
a step (AI-Toolkit on the same set: 6.5–6.9), 18.0 GB allocated, 22.1 GB at the card's peak; every epoch saved,
the final adapter in loras/. Against AI-Toolkit's `fosforida-v2-tags-r32`, the same set and knobs, epochs 1–5:
ar_ce 5.162 / 4.732 / 4.574 / 4.475 / 4.399 against 5.136 / 4.718 / 4.553 / 4.467 / 4.403; flow 0.978 / 0.946 /
0.933 / 0.924 / 0.941 against 1.029 / 0.948 / 0.928 / 0.921 / 0.927. The studio trains on its own.
