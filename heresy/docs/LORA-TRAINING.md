# Training a LoRA for YuE2 in Ruach Studio

A guide for preparing the raw material and choosing the settings. The studio prepares the set and
starts the run. Two trainers can do the work (step 3, **Trainer**):

- **Ruach Studio** (the default since 02.10.2026): the studio’s own, in `lab/trainer/`, ported from the
  YuE2 code of [AI-Toolkit](https://github.com/ostris/ai-toolkit) by Ostris (MIT) and accepted stage by
  stage against it (`lab/trainer/PARITY.md`). It needs nothing of AI-Toolkit: it makes a set’s latent
  cache itself (the VAE in float32, the codec tokens from Mothersuperior’s realaudio head over
  MERT-v2-FullSong) and trains on unquantized bf16 weights. Its base: `heresy/fetch-heresy.sh --trainer bf16`
  (7.8 GB; `int8`, 4.0 GB, for a card that cannot hold bf16). Direct mode, unseparated, for now.
- **AI-Toolkit** (the reference): Ostris’ trainer itself, cloned beside the studio
  (`~/Documents/AI/AI_Toolkit`, or `AITK_ROOT`); it also trains with a score (Full, Melody) and on separated
  stems.

Both train one LoRA over both halves of the model and save it under the same key names, so Create loads
either the same way. Measured on GTSinger RU-Alto (148 songs, rank 16): the studio’s trainer 1.9 s a step
at 11.4 GB (bf16), AI-Toolkit 2.1–2.4 s at its int8 peak.

---

## 1 · What a LoRA can teach YuE2

YuE2 is two experts on one backbone:

| half | what it does | what a LoRA on it changes |
|---|---|---|
| **AR** (music) | reads the style line and the lyrics, writes the song as codec tokens, 25 a second | composition, arrangement, phrasing, **following the lyrics**, diction of a language |
| **NAR** (sound) | renders those tokens into sound with flow matching | timbre, production, mix, the sound of an instrument or a voice |

By Ostris' own notes: **the style comes mostly from the NAR, lyric following from the AR**, and the AR
**learns the training songs by heart on a small set** — its loss (`ar_ce`) starts near 5 and falls toward 0
within a few hundred steps, and from then on the model only recalls those songs. Hence the anchor
`ar_kl_weight` (keeps the AR near the base model) and a slower AR (`ar_lr_multiplier`).

So, by kind of adapter:

| adapter | data | AR | NAR |
|---|---|---|---|
| **Style** (genre, production, a band's sound) | 20–100 different songs of that style | light: `ar_loss_weight` 0.3–0.5, `ar_kl_weight` 0.2 | the main part |
| **Voice** (one singer's timbre) | 30+ songs or a few hours of one voice, ideally dry stems | light | the main part |
| **Language / diction** (sing Russian well) | many songs **with exact lyrics** in that language, many voices | the main part | light |
| **Artist** (all of it) | a large, varied catalogue | medium, with the anchor | full |

## 2 · The raw material

Put each set in its own folder: `datasets/raw/NAME/`. The studio reads WAV, FLAC, MP3, OGG and M4A
and makes every track 48 kHz stereo itself.

**Choose the songs**

- **Different songs, not versions of one song.** Ten takes of the same song teach the AR that song, not
  the style. One or two versions per song are enough. (Example: `Fosforida_v2` holds 42 tracks, but they
  are versions of about a dozen songs — pick the best version of each.)
- **30 seconds to 6 minutes each.** The AR trains over the whole song from its start; very long songs cost
  memory and time without teaching more.
- **The best source you have**: WAV or FLAC over MP3; no clipping, no long silences or talk at the start
  or the end, a similar loudness across the set.
- **Quantity**: a style wants 20 or more different songs; a language wants a hundred and more.

**Write the captions** (the wizard does it with you; a `.txt` beside a track is read as its start)

Each track gets one caption in AI-Toolkit's YuE2 form:

```
dark cinematic gothic metal, female contralto vocal, church choir, slow, D minor
[Lyrics]
[Verse]
first line as it is sung
second line
[Chorus]
…
```

- **The style line describes what is heard**, in the words you will use when you generate: genre,
  instruments, vocal type, mood; tempo and key if you know them. A SUNO prompt is **not** a description of
  its track: SUNO follows its style prompt loosely, so use it as a hint at best.
- **Lyrics exactly as sung**, with section tags (`[Verse]`, `[Chorus]`, `[Bridge]`…). Wrong lyrics teach the
  AR to sing the wrong words. An instrumental has no `[Lyrics]` block.
- **Never leave a caption empty**: a blank prompt breaks lyric following (AI-Toolkit's note).
- **A style of its own for every track** beats one line for the whole set: the songs differ, the
  album's vibe is shared. Write `trigger, what this track sounds like. The shared line.` A file
  `NAME.style.txt` beside a track fills its style field in the wizard.
- **The listener** (`lab/listener.py`, Qwen2.5-Omni-7B) writes a draft of tags per track from 120 s past
  the intro. The lab takes the best that fits a free card. Measured peaks on one 120 s excerpt
  (02.10.2026, the whole ladder in `tmp/listener-bench/table.md`):

  | model | audio projector | peak | a track | heard |
  |---|---|---|---|---|
  | bf16 (transformers) | — | 18.3 GB | ~9 s | the reference |
  | Q8_0 | Q8_0 | **10.3 GB** | 6 s | the same tags |
  | Q5_K_M | Q8_0 | **8.0 GB** | 6 s | the same tags |
  | Q4_K_M | Q8_0 | **7.3 GB** | 6 s | the same tags |
  | Q3_K_M | Q8_0 | 6.6 GB | 5 s | drifts (modal → minor): not offered |
  | UD-Q2_K_XL | Q8_0 | 6.0 GB | 5 s | invents (dubstep, drum machine, fast): not offered |

  The Q8_0 projector (1.5 GB) hears as the f16 one (2.6 GB) and takes half the time. `fetch-heresy.sh
  --listener Q8_0|Q5_K_M|Q4_K_M|bf16` fetches a pair, asking first with its size. It is a draft at any size:
  on Fosforida it heard "piano" or "synthesizer" where harp and low strings play. Read and correct it.
- A **trigger word** (an unusual word, e.g. `fosforida`) at the start of every style line lets you call
  the style by name later.

## 3 · The settings

| setting | start with | when to change |
|---|---|---|
| steps | 1500 | rounded up to whole epochs (one epoch = one pass over the set, a step a track) |
| save every | 1 epoch | every checkpoint is kept, so the epochs can be heard against each other |
| rank | 32 (style), 16 (voice) | bigger learns more, and memorizes faster |
| learning rate | 1e-4 | |
| `ar_loss_weight` | 0.5 | 0 = NAR only (sound alone, as the old YuE2 Studio trainer did); 1 = full AR |
| `ar_kl_weight` | 0.2 | higher keeps the AR closer to the base model |
| `ar_lr_multiplier` | 0.5 | lower slows the AR against the NAR |
| mode (`cot`) | off (Direct) | `full` also trains the score path (SheetSage2 writes a sheet per song at cache time; slower) |
| separation | off | on: vocals and music are split, and the AR learns (lyrics → vocals) and (tags → music) too |
| base weights | int8 | bf16 on a 24 GB card for a little more precision |

A run takes a GPU of its own for hours; Whisper, stems and the rest of the lab go on beside it. The first
run fetches Comfy-Org's repack of YuE2 into `checkpoints/comfy/`.

## 4 · Watching it (Telemetry)

The runs that are training stand on top of the room with their progress, time left, speed and both
losses; a click on one (or on its card in the column) opens step 4, **Telemetry**:

- **Sound half · flow loss (NAR)**: how well the sound half predicts the noise it has to take away. It
  jumps from step to step (batch 1, a random noise level each step): read the bold line, the running
  average. It drifts down slowly. (AI-Toolkit logs only the whole sum; the room shows its flow part.)
- **Music half · ar_ce (AR)**: how well the music half predicts the song’s own tokens. It falls fast.
  **Near 0 is memorization**: an earlier epoch is the better adapter; or train again with fewer steps, a
  lower `ar_loss_weight`, a higher `ar_kl_weight`, or more songs.
- The ticks under both curves are the epochs; a green one is in `loras/`. The cursor over a curve reads
  the step, its epoch and both values there.
- A checkpoint is saved after every epoch (`training/RUN/output/`), all kept. Pick one under the curves:
  **Into loras/** puts it into `loras/RUN/RUN-eNNN.safetensors` (a hard link, no second copy), ready in
  Create; **Out of loras/** takes it back out (the checkpoint stays); **Download** saves it under that name.
- A run is a systemd unit of its own (`ruach-train-RUN`): restarting the lab or the studio does not
  touch it, and the lab finds it again when it starts. The same name started again goes on from its last
  checkpoint. **Stop** saves what was learned on the way out.
- The column on the right: every run a card (Active, All, Archived, Trash). ⋯ on a card: archive it, or
  delete it into `trash/training/` (its adapters in `loras/` are asked about: out with it, or kept usable),
  from where Trash restores it or deletes it for good.

## 5 · Trying it

In Create, pick the LoRA and set the two strengths (music half, sound half) apart. Render the same song
with the same seeds with and without it: the difference is the adapter. A style LoRA usually wants the
sound half near 1 and the music half lower.

## 6 · GTSinger

[GTSinger](https://github.com/AaronZ345/GTSinger) ([dataset](https://huggingface.co/datasets/GTSinger/GTSinger),
**CC BY-NC-SA 4.0**: an adapter trained on it is non-commercial and shared under the same terms) is dry
studio singing with word timing, notes and technique labels. Fetch it yourself (using it accepts its
terms), then:

```bash
.venv/bin/python lab/gtsinger.py /path/to/GTSinger/Russian
```

Every phrase becomes a WAV, its lyrics (`[Verse]`, a line at every pause) and its own style
(`russian, pop, female alto vocal, breathy, slow pace, happy, a cappella, dry studio vocal`) in
`datasets/raw/GTSinger-RU/`. Measured: the Russian part is **one alto, six songs, 195 phrases** (about
0.2 GB): a diction sample of one voice, not a language adapter of many.

---

Thanks: Ostris (AI-Toolkit), Kytra and Mothersuperior (the realaudio tokenizer the training conditions
on, since the official audio encoder is unreleased), vrgamegirl19 (YuE2 Studio, whose trainers came first).
