---
name: yue2-style
description: Write or rewrite the style prompt and clean the lyrics for YuE2 (yue2.cpp, Ruach Studio). Use when a style is long, SUNO-shaped (arcs with arrows, dynamics like p→f→ff, "Mood:"/"Arc:" fields, section plans), when a take sings or whispers words from the style or from notes in the lyrics, or when style, tempo and key must agree with an ABC score.
---

# YuE2 style

HERESY · Ruach Studio · 30.09.2026. In the Kit page, the Writing room (HERESY 1010,
`build/tools/console/heresy-assist.js`) runs YuE2 Studio's songwriting instructions with the
score rule below; its "Style for YuE2" chip asks for exactly this rewrite.

## Why this exists

YuE2 puts the style **verbatim** under a `[Tags]` header, right before `[Lyrics]`
(`build/src/prompt.h`):

```
<|endoftext|>instruction\n[Tags]\n STYLE \n[Lyrics]\n LYRICS \n<abc>score</abc><|music_start|>
```

The engine has no style limit and no cleaning. What the model does with the text is
what it learned. Measured on the **110 official example styles**
(`build/tools/webui/example/*.json`):

| in the style | official examples |
|---|---|
| length | 4 … 999 characters; half 69 … 399; median 124 |
| arrows → | 0 |
| dynamics marks (p, mp, f, ff) | 0 |
| "Label:" fields (Genre:, Mood:) | 5 |
| a key | 3 |
| a tempo in BPM | 20 |

A take on 30.09.2026 whispered a line of a 2 269-character style
(`Mood: dark accusation → tectonic rage → …`). SUNO reads such prose; YuE2 was not
trained on it. The official skill (`YuE/skills/yue2-music/SKILL.md`) says:

> Put genre, instruments, vocal character, language and intended tempo in `style`;
> put section tags and actual words in `lyrics`. Keep implementation notes out of lyrics.
> Put tempo and meter in the ABC and describe them consistently in the style.

## The style line

One line of comma-separated tags, in this order. Short is not the point: a 964-character
style that agreed with its score sang as clearly as a 292-character one (below). Agreement is.

1. the language of the lyrics, first;
2. genre and style, then two or three mood words;
3. the voice: sex and register, timbre, delivery;
4. two to five instruments, the leading ones first;
5. two to four words of texture or production;
6. the tempo as `N BPM`.

Rules:

- Keep every concrete, audible fact. Keep rare instrument names (duduk, oud). Tags in English.
- An arc becomes two or three mood words. Never keep arrows.
- Dynamics and section plans are dropped: the score and the lyrics' section tags carry the form.
- No negative prompt exists. `no harmonies, no backing vocals` → `solo vocal`;
  `no auto-tune` → `natural voice`; `no vibrato` → `straight tone`; otherwise drop it.
- Model instructions become a tag only when they describe sound
  (`music never overwhelms voice` → `vocal-forward mix`); otherwise drop them.
- No `Label:` prefixes, no brackets, no semicolons, no sentences.
- Tempo, meter and key belong to the ABC. Read its header (`K:`, `M:`, `Q:`): the tempo tag
  takes `Q:`; a key stays only if it agrees with `K:`; report every disagreement.
- Invent nothing.

## The lyrics

Section tags on their own lines and the words that are sung. **Lines in brackets are part of
the training form**: 29 of the 110 official examples have them — instrument cues `(saxophone)`,
`(brass)`, voice cues `(male)`, backing echoes `(I'm so good)`, section names. Keep them short
and in that shape. None of the official ones holds a `Label:`, an arrow or a `p`/`f` mark, so
`(Music: swells slightly - upright - f)` is the one kind to rewrite (`(upright bass swells)`).

## Measured: agreement with the score

`~/Temp/style_test`, 30.09.2026. Same score (`K:Dm M:2/4 Q:1/4=71`) and lyrics, two seeds;
Whisper against the lyrics, mean per minute (first minute in brackets):

| style | seed A | seed B |
|---|---|---|
| SUNO style as is (B♭ minor, 74 BPM, 4/4) | 0.60 (0.41) | 0.61 (0.49) |
| the same, key/tempo/meter set to the score | 0.76 (0.79) | 0.73 (0.78) |
| the 292-character tag line below | 0.68 (0.72) | 0.73 (0.78) |

The contradiction, not the length, cost the diction — most of all in the first minute, where
a line of the style was heard whispered.

## Worked example

Score header of the take: `K:Dm  M:2/4  Q:1/4=71`. The style, as fed to SUNO (964 characters):

```
Russian, dynamic dramatic ballad, fully sung. Female contralto profondo, solo, no harmonies,
no backing vocals. Vocal: raw, close-mic'd, raspy, heavy breathing; sustained melodic lines,
swells p→f→ff→fff; controlled belting at Bridge peak; no vibrato, no auto-tune, no recitation.
Mood: dark accusation → tectonic rage → maternal defiance → final silence. Key: B♭ minor,
Phrygian inflections. Tempo: 74 BPM, 4/4, rubato accents, forward momentum. Instruments
(≤3 at once, solo entry, then layers): Duduk (primary melody, warm, unresolved); Cello (low
drone, dark foundation); Bowed viola (swelling counter-melody); Low flute (spectral breath,
weeping); Celtic harp (sparse plucked intervals, ringing silence). Arc: Intro p → … → Outro p.
Linear: sparse→dense→burst→decay; reverb gaps. Production: wide stereo, deep reverb, raw;
music never overwhelms voice; 4/4 grid, micro-timing on vowels.
```

For YuE2 (about 300 characters):

```
Russian, dark dramatic ballad, tragic, furious, defiant, female contralto, raw raspy voice,
close-mic, heavy breathing, belting, straight tone, solo vocal, duduk, cello drone, bowed viola,
low flute, celtic harp, sparse arrangement, wide stereo, deep reverb, vocal-forward mix, rubato, 71 BPM
```

Conflicts to report: key B♭ minor against the score's `K:Dm`; tempo 74 against `Q:1/4=71`;
meter 4/4 against `M:2/4`. Dropped: the dynamics (`p→f→ff→fff`, belting "at Bridge peak"),
the arc and the section plan, `Linear: …`, `reverb gaps`, `micro-timing on vowels`,
`fully sung` and `no recitation` (instructions), `Phrygian inflections` (the score's pitches decide).

The style carries the sound; the score carries key, meter, tempo and form; the lyrics carry
the words. Each thing in one place.

## Check before a render

- the line has no `→ -> =>` and no `p f ff mp` (none of the 110 official styles has them);
- the tempo tag equals the score's `Q:`; a key, if any, equals `K:`;
- bracket lines in the lyrics are short cues, with no `Label:`, arrow or `p`/`f` inside.
