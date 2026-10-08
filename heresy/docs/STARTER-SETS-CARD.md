---
license: cc-by-nc-sa-4.0
language:
- ru
- en
task_categories:
- text-to-audio
tags:
- singing
- yue2
- lora
- ruach-studio
pretty_name: Ruach Studio starter sets (GTSinger, joined into songs)
size_categories:
- n<1K
---

<!-- The dataset card of goldhub/Ruach_Studio_Starter_Sets on Hugging Face (HERESY 1100): edit here, then hf upload it as README.md -->

# Ruach Studio · starter sets

Ready-to-train vocal sets for the **LoRA Trainer** of Ruach Studio, the YuE2 song studio: put a folder under `datasets/raw/` (the trainer's **Starter sets** button does it) and train. They are here so a first adapter can be tried without first building a set by hand.

| folder | singer | tracks | size |
|---|---|---|---|
| `GTSinger-RU/` | Russian, female alto (one singer) | 148 | 2.2 GB |
| `GTSinger-EN/` | English, two female altos and a male tenor | 514 | 6.5 GB |
| `GTSinger-RU-sample/` | a slice of the Russian set: plain singing first, every song heard | 10 | 0.1 GB |
| `GTSinger-EN-sample/` | a slice of the English set, the tenor | 7 | 0.1 GB |

Every track is three files: the WAV (48 kHz, 24-bit, mono, dry a cappella), its lyrics as the studio reads them (`.txt`: `[Verse]` and the sung words, a new line at every pause) and its style line (`.style.txt`: language, genre, the singer's range, the technique sung, pace, emotion, "a cappella, dry studio vocal, no instruments").

## Source and changes

All audio and word timings come from **GTSinger** (Zhang et al., *GTSinger: A Global Multi-Technique Singing Corpus with Realistic Music Scores for All Singing Tasks*, NeurIPS 2024 Datasets and Benchmarks; [github.com/AaronZ345/GTSinger](https://github.com/AaronZ345/GTSinger), [huggingface.co/datasets/GTSinger/GTSinger](https://huggingface.co/datasets/GTSinger/GTSinger)), licensed **CC BY-NC-SA 4.0**.

Changed here (by `lab/gtsinger.py` of Ruach Studio): the phrases of each song and technique group were joined in singing order into one track (YuE2 learns from songs, not five-second phrases); lyrics were written out from the word timings; a style line was written from GTSinger's own labels. Paired speech was left out. Nothing was re-recorded, pitched or processed.

## Terms

The same as GTSinger's: **attribution, non-commercial, share-alike**. An adapter trained on these sets carries the same terms.
