# Ruach Studio · the guide

Songs from words, on your own machine: every room, what each thing does, and the numbers we measured.

## Start here

### What this is

Ruach Studio turns a style line and lyrics into a finished song with **YuE2**, the open song model, running on your own GPU. Nothing leaves the machine. Around the model there is a whole studio: a writing room with a chat model, post-production (stems, remaster, upscale, a lyrics check), a collection of every take, and a room that trains LoRA adapters on your own songs.

![The Creator: the form on the left, the take in the middle, every take on the right](guide/studio-create.png "The Creator: the form, the take you are listening to, and all your takes")

YuE2 has **two halves**, and most of what you set in the studio is aimed at one of them:

| half | what it does | what you steer there |
|---|---|---|
| **Music** (AR, the language model) | writes the song: first a score (ABC notation), then the music tokens, 25 a second | the planning mode, the score, the music seed, the music strength of a LoRA |
| **Sound** (NAR + VAE) | renders the tokens into sound | the sound seed, the VAE, the sound strength of a LoRA, steps and solver |

### The five rooms

| room | for |
|---|---|
| **Creator** | the song form and the take you are listening to |
| **Writer** | your songs as documents with versions; a chat model drafts and revises with you |
| **Refiner** | after the render: spectrum, artifacts, debuzz, lyrics check, stems, remaster, upscale |
| **Librarian** | every take: workspaces, search, likes, notes, bulk actions, the trash |
| **LoRA Trainer** | LoRA adapters from your own songs: the set, the run, its telemetry and its epochs |

### The bar

![The bar: rooms, the workspace, and the few buttons you use all the time](guide/bar.png)

The rooms open the bar; the logo stands in its middle; on the right, the workspace, the engine's lamp (green: ready; amber: working; red: something failed) and the few buttons. The pointer on the lamp (or a click) opens **what runs and what waits**: the songs, the regenerations and the lab's work on the cards (artwork, stems, upscale, Whisper). A waiting one comes off its queue with its ✕, pressed twice (the first press asks); what already runs stops where it is shown: a song in its run, a training in the Trainer.

- **Workspace**: the workspace in hand. The takes list shows only it, and every new take lands in it. *All Workspaces* shows everything. Where the bar is narrow (the logo without its words), the word *Workspace* goes too; the box stays.
- **EN** (the language's two letters): the page in another language, kept with your settings: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, each named in its own words. Numbers and dates follow the language, and this guide opens in it.
- **☀ / ☾**: day, night, or as the system says.
- **Save** a prompt (the whole form) as JSON or YAML; **Clear** the form.
- **DAW**: the way out of the studio. Either the mixed track as it is (WAV, FLAC, MP3), or the whole take into your own DAW, where the rest happens outside the studio. The page finds REAPER, Waveform and Bitwig on the studio's machine, or you name yours. Any take goes out from its menu (right-click it): *Export to DAW → REAPER project* or *DAWproject* (Waveform, Bitwig, Studio One, Cubase), your own DAW first; the DAW tab of this guide says what is inside.
- **?**: this guide, opened on the room you are in.
- **☰**: the rest. The card and its memory, the model copy, themes, opening a saved prompt, examples, unloading the model, the Engine room and this guide.

![Behind the ☰](guide/more-menu.png)

### Your first song, in six steps

1. **Title** it, and pick the **Key** if you have one in mind (or leave *as written*).
2. Write the **Style prompt**: language, genre, voice, instruments, tempo. One or two plain lines are enough. The ♪ beside it lists 200 instruments with what YuE2 really plays (see *Creator*).
3. Paste the **Lyrics** with section tags on their own lines: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Keep **Full plan** as the planning mode: YuE2 writes a melody and chords first, then the song.
5. Press **Generate song**. The run shows its stages: the score, the music tokens, the sound, the decode.
6. The take opens in the middle, with its player, its score and everything to make it again.

> Measured on an RTX 3090: a 6:12 song in Direct mode took 126 seconds, a 7:25 song in Full plan 198 seconds (the score is written first). Shorter songs are faster.

### The player, the takes and the server log

- **The player** at the bottom: the waveform across, one soft cloud with the part already heard in the accent (a click jumps there); under it the take (its artwork when it has one, its title, the first words of its style, 👍 👎 ★), then **shuffle**, previous, play, next and **repeat** (off · the whole list again · this take again, marked 1), then the time (a click on the total turns it to the time left), *play on click* (a click in a list plays the take at once), *play on* (when a take ends, the next one down the list starts), the **speed** (0.50× to 2.00×, the pitch kept), the volume and a dot for the state (it beats while a take plays). What you do not need this moment stays faint until the pointer comes; every icon says what it does when the pointer rests on it. The pointer over the waveform shows the time a click would jump to. The keyboard's and a headset's media keys drive the player, and the desktop's media panel shows the take.
- **The line to the studio** shows beside the server log (*Forge · 85 ms*, or *here* on the same machine). When the studio is far, a like, a favourite or a pin shows at once and the studio only confirms it.
- **Takes** on the right: search with words, `*` and `?`; *Favourites*; fold the column with »; ⋯ for the list's own actions.
- **The server log** sits right above the player in every room: folded, it shows the last thing the engine said (in red when something failed); unfolded, ten lines, *Follow*, *Copy*, and the way to the whole log in Engine.

![The server log, unfolded](guide/log-dock.png)

## Creator

### Compose: the song form

![Title, key, seeds and style](guide/compose-top.png)

- **Start from an idea**: one line about the song; the chat model of the Writer drafts the title, the style and the lyrics (*Write the brief*).
- **Title**, **Key**: the key goes into the score (`K:`). With a score in the form, a new key moves it there; without one, the choice waits and moves the score that comes.
- **Music seed** and **Sound seed**: the dice for the two halves. Empty is random; a number repeats a take. Keep the music seed and change the sound seed to hear the same song rendered differently.
- **Style prompt**: language, genre, voice, instruments, tempo. *Save style…* keeps it under a name.

### The instruments cheat-sheet ♪

The ♪ beside the style opens a table of 200 instruments the studio probed: their family, home, how they sound (English and Russian), and the words that call them. ▶ A and ▶ B play two 60-second probes of each. The verdict per row comes from a human ear: heard, questioned, or **NOT IDENTIFIED IN YUE2** (YuE2 does not know it; it needs more sophisticated prompting). A click puts the instrument's name into the style.

**YuE2 decides when an instrument comes in.** A style line is a request, not an order: however hard you ask, the model brings an instrument in where its training says the song wants it, and the seed decides a great deal. The same prompt gave one take with the instrument and one without. Hear several seeds before you judge an instrument.

**Heard, but not as real as a live one.** Many instruments do play, yet less clearly and less true than the real thing: that is what YuE2 knows of them. The verdicts say whether YuE2 plays an instrument at all, not how real it sounds. Making it real is the work of an **instrument LoRA**: a few dozen clean recordings of it, trained in the LoRA Trainer.

![The instruments cheat-sheet](guide/instruments.png)

### Lyrics and text profiles

- Section tags on their own lines; YuE2 knows `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Inst]`, `[Outro]`.
- **Text profile**: paste a whole text, pick a profile, *Apply*: its rules (cleanup, phonetics) and its shape (`[Intro]`, `[Verse]` at blank lines, `[Interlude]` after long paragraphs) make it ready to read. *Undo* brings the text back. Profiles are made in the Writer.

### VAE, sliders and LoRAs

- **VAE** turns the written song into sound: **Standard** (the best sound), **Legacy** (the benchmark one), **Blend** (a mix of the two, an add-on). A finished take can add another decode later from its own page.
- **Sliders**: genre and voice shapers applied while the music is written; 0 is off, 1 is full.
- **LoRAs**: adapters for the music half, the sound half, or both, each with its own strength.

**A slider's curve.** A slider pushes with its strength from the first second to the last: flat. The small picture beside its strength opens its curve: **Arch** lets it rise to the full strength in the middle of the song and ease back at both ends; **Draw** shapes it by hand: drag a point up for a flare, down for a fade, along the song to move it; double-click to add a point, double-click a point to take it out. The strength you set is the top of the curve. The curve runs over the music as it is written, from its first frame to the end of the song's length, and goes into the take's request, so a take made again runs the same curve.

![LoRAs: each strength on a road from green to red, and the music half together](guide/loras.png)

Every strength sits on a **road**: green is safe, yellow is its limit, red is past it. The limits are measured:

- a score adapter (one that plans ABC) up to 1.0 green; any other music half up to 0.5 green, 0.75 at most; adapters trained in this studio are stricter on the music half (0.5 green, 0.6 limit);
- the sound half up to 1.0 green, 1.5 limit;
- **Music, together**: stacked adapters add up. Each may sit in its own green and the sum still break the score. Measured on real takes: whole up to **2.25** together, broken from **2.5**. The bar under the adapters shows the sum on the same road.

**Double-click** a number to type a strength exactly. The hints under the block say what matters: a trigger word missing from the style, an adapter trained in another planning mode, a strength past its limit.

> **An instrumental score adapter with words to sing.** Such an adapter plans scores *without a vocal line*. At 1.00 it gave a take with one note in 127 vocal bars: the singer spoke over two looping bars. With lyrics, keep it low, 0.3 to 0.5. The LoRA block says so when it happens.

### Profiles and planning modes

- **Profile** sets the mode, length, sampling, guidance, steps, VAE, sliders, LoRAs and output in one go; the texts and seeds stay. *Save profile…* keeps the current knobs under a name.
- **Planning mode**:
  - **Full plan**: melody and chords written first (an editable score), then the song. Best for new songs.
  - **Melody only**: a melody plan, free accompaniment. Recommended for covers.
  - **Direct**: straight from lyrics and style, no score. Adapters trained without a score belong here.
  - **Instrumental**: no vocals, the official YuE2 recipe.

### Covers, remixes and your own score

- **Cover or remix**: take the tune of a recording (*Transcribe*: its melody only, not the words or the singer), or the melody of one of your takes, and give it a new style.
- **Supply your own score**: an ABC score, followed in Full plan and Melody only. Transpose it (nearest, up or down), move one voice by steps of the scale, import a MIDI file (one melodic line per voice), export MIDI or markers for a DAW, load an example, make it instrumental.

### Sampling

![Sampling: the score planner and the music tokens, the token limits locked](guide/sampling.png)

The defaults are tuned. The three **shape** rows (Composition, Performance, Style) move the knobs together in five steps; the knobs themselves are below.

- **Score planner** and **Music tokens**: temperature, top-p, top-k, repetition penalty, penalty window.
- **Min tokens** and **Max tokens** are **locked** against a stray edit: click the 🔒 beside the name to change them, and again to lock them. The floors are fuses: a score may not end before 200 tokens, the music not before 750 (30 seconds; a shorter requested length lowers it to that length).
- Every knob is held inside sane bounds; a value past them is pulled back, and the page says so.
- **Guidance (CFG)**: 1.6 by default in every mode.
- **ODE steps** and **Solver** for the sound half; **Max length** in seconds; **Sound variations** renders the same music 1 to 9 times with different sound; **Format**: WAV 24-bit, 16-bit, 32-bit float or MP3.

### Plan score only, and Generate

- **Plan score only** writes the score and stops: read it, edit it, then *Generate* renders exactly that score. A score already in the field is cleared first.
- **Generate song** runs it all. The run shows its stages as they go.

### Babel in the score

![The engine stopped a run whose score was not a score](guide/babel.png)

When the music half writes garbage for a score (adapters pushed past their limits do that: no key, no meter, colons in runs), the **engine stops the run before any music is made on it**, in seconds instead of minutes. The window says why, which adapters weighed on the music half and how far past their limits, shows what was written, and can bring the music strengths into the green with one click.

### The take

![A take: download, make again, post, files](guide/take-head.png)

- **Download**: WAV, FLAC (the same samples, about three quarters of the size), MP3 at the bitrate you pick.
- **Make again**: *Retake* (a new take from the same request), *Reuse* (the request back into the form), *Re-render sound* (the same music, new sound), *Regenerate from…* (keep the start, write the rest anew), *Transcribe this take*, *Trim to the text* (cut a tail after the last sung line).
- **Refiner**: *Spectrum*, *Lyrics check*. **Files**: the request and the score.
- **Note**: what works, what to fix, where it goes.
- The card below says how it was made: mode, format, VAE, model, steps, the shape, the sliders, the LoRAs with their strengths, both seeds (copy them to repeat it).

![How a take was made](guide/take-info.png)

### The score

The take's plan as a staff or as ABC: print it to PDF (US Letter, portrait or landscape), export MIDI or markers, *Edit and re-render*, or open it full screen.

## Writer

### Songs as documents

![The Writer](guide/studio-writer.png)

Every song can live in the Writer as a document: its **style**, **lyrics**, **notes** (Markdown, with a preview) and **params** (every knob of the Creator's form). *New*, *From the Creator* (the form as it is), *Load into the Creator*.

- **Versions**: *Keep this version* at any point; *Restore this version* or take it *As a new document*.
- **Takes made from it**: every take whose request came from this document.
- **The song now**: title, style, the score's key, meter and tempo (the style must agree with them), the lyrics; *Edit in the Creator*.

### Text profiles

How a pasted text becomes ready to read: replacement rules in order (literal or regular expressions), then the shape (`[Intro]`, `[Verse]` at blank lines, `[Interlude]` after long paragraphs). *+ Rule*, then **Try it from Lyrics** shows what comes out before you save.

### The writing room

![The writing room: a chat model drafts, you decide](guide/writer-room.png)

A chat model reads your style, lyrics and score, then drafts or revises them. **Nothing changes until you apply it.**

- **What's the song about?** or what to change; **Help me with** the style, the lyrics or both; **Structure**: the section order for new lyrics.
- The model: a local chat server (vLLM, LM Studio, Ollama: anything with a `/v1` chat endpoint, set in Engine) or any OpenRouter model with its API key.
- *Create a draft*, then **Apply draft**, **Use lyrics** or **Use style**; *Undo* takes it back.

## Refiner

### After the render

![The Refiner: the take on the right, the steps in a row](guide/studio-post.png)

Pick a take on the right; the tools work on it, or on a stem of it. The column on the right holds **the takes refined here**, the newest refine first (*Refined* beside *Favourites* turns it to every take, to start a new one), and after a reload the room comes back to the take it was refining.

Everything made from a take hangs on its **tree** (*Made from this take*), the newest on top: **the original** first, with its player and its FLAC, then every branch, playable and usable as a source for the next step. What runs shows where you look: in the room's head, at the top of the step's own block, and as a beating dot on its tab. Each step's block lists what it made for the take (*Made here*: a click finds it in the tree), and the step open lights its own branches.

**Compare all** (on the original's row, or *Compare* on any branch) opens every version in one player, as SUNO switches versions: the original, the debuzzed, the remasters, the upscales, the stems. A click on another version, or its number (1–9), plays it **from the same second**; Space plays and pauses, ← → move five seconds, Esc closes.

### Import a track

WAV, FLAC, MP3… from anywhere: it becomes a take in the library (48 kHz, 24-bit), marked *imported*, ready for stems, remaster and the rest. Lyrics are optional; the lyrics check matches against them.

### The steps and the chain

![The chain and the steps](guide/post-steps.png)

The **chain** runs several steps in one go: *Debuzz → Upscale → Remaster*, then any of *Artifacts*, *Spectrum*, *Lyrics*, *Stems*. One by one:

1. **Spectrum**: spectrogram, average spectrum, band energy; lay another take over it to compare.
2. **Artifacts**: a tone that will not leave, the VAE's 25-frame buzz in the highs, clicks, clipping, dropouts, stereo that fights itself. A time plays from there.
3. **Debuzz**: YuE2's decoder writes sound in frames of 1920 samples, 25 a second, and its highs tremble with them. This takes out the part locked to that frame clock above 2 kHz. 80 % is the ear's choice; 100 % thins the start.
4. **Lyrics**: Whisper listens and matches what it hears to your lyrics, minute by minute; *Time the lines* for karaoke timing. On the vocal stem it hears the words without the music.
5. **Stems**: vocals + instrumental (BS-Roformer), or four stems (+ htdemucs_ft for drums, bass, other).
6. **Remaster**: mix the stems or take the take; clean, de-ess, optionally retune 440 → 432 Hz, loudness (LUFS) and true peak. Each run is a new branch. The preset and the de-esser work on stems before they are mixed: with the take or any single file as the source (and in the chain) they are off.
7. **Upscale**: UniverSR draws the top of the spectrum anew; the original stays sample for sample below the cutoff.

## Librarian

### Every take

![The Librarian](guide/studio-collection.png)

- **The heading** names the collection open (*Librarian › Fosforida*) and what it holds: takes, hours, likes, favourites, notes, how they were made.
- **Workspaces** on the left: All, Favourites, Not in a workspace, your workspaces, *+ New workspace*; Hidden and the Trash out of sight. Right-click a workspace for its **locks** (*Lock Workspace Deletion*, *Lock Tracks Deletion*): a 🔒 by its name, and nothing in it goes to the trash.
- **Search** with words, `*` and `?`; **sort** newest, oldest, by title, longest; **Tiles** or **List**: all three in the heading line, beside the counts.
- **A card** wears its take's artwork in its top right corner, beside the title, when it has one (*Draw artwork* in the take's menu); a click shows the picture whole over the studio, where ‹ › and the arrow keys walk the pictures of the cards shown, ▶ plays its take and Esc closes. The card that plays glows with the song's own peaks.
- **Fresh takes**: a take you have not played yet wears a light dashed line; its first play takes it off. A regenerated take carries a *regen* badge and keeps its note, like and star.
- **The workspaces column**: drag its edge to widen or narrow it; « folds it away, and the cards take one column more.
- **Sections**: a workspace can hold sections, two levels deep at most (⋯ beside its name → *New section…*), to sort what is in it without a new workspace each time. A workspace shows its sections' takes too. Whatever the Refiner makes something of goes by itself into the section *Refined* of its workspaces.
- **Drag a card onto a workspace** on the left to move it there (all the checked ones, when it is checked); hold **Ctrl** to add it there and keep it here too. The studio asks first, and Ctrl+Z gives it back.
- **Pinned takes**: up to four in each workspace, in a strip of their own tone above the cards (right-click a take → *Pin here*; × unpins). When you check takes, the bar of the checked takes the strip's place, so the cards never move.
- **Filters**: how it was made (generated, imported, regenerated, re-rendered), liked or not, what it has (stems, debuzz, remaster, upscale).
- **Select** several, as in a file manager: check one, and from then on a click anywhere on another card checks it too (Shift: the whole range). A drag on the empty space between the cards draws a band that checks what it touches; **Ctrl+drag** draws it from anywhere and keeps what was already checked. The bar of the checked floats above the player: favourite, add to a workspace, move to one, take out of this one, hide, export a ZIP, to the trash.
- **The trash** gives back, or wipes out after you confirm.

### A take's menu

![Right-click a take](guide/collection-menu.png)

**Regenerate with a new seed** (above the Writer in the take's menu): the take made again from everything it was made with, but new seeds; the new one takes the old one's workspaces and note, and the old one waits in the section *Sourced for Regeneration* of its workspace (its workspace does not show it among its own) until you empty it; the new one keeps its note, like, star and picture. A probe comes out its full two minutes. Play, open in the Creator or in the Refiner, the sheet (its score), the datasheet (all it was made with: the style and the lyrics, the score drawn, every knob, the LoRAs and sliders with their strengths; a Direct take has no score, and *Write it from the sound* asks the transcriber for one), like, dislike, favourite, a note, rename, **workspaces** (one take can sit in several), **move to** one workspace (on a checked card: every checked take, out of the workspace open), hide, send to the Writer, copy, download, **export to DAW** (REAPER project or DAWproject, on any take: with its stems once the Refiner has split them), the trash.

**Draw artwork**: a small language model (Qwen3-4B) reads the take's style and words and writes one picture prompt; an SDXL model (CyberRealistic XL) paints it, 768 px, in about half a minute on a 16 GB card. It shows in the player, on the card, in the desktop's media panel, and inside the MP3 you download (as its front cover). Once a take has its picture, the menu says *Open the artwork* (over the page, as a click on the card's picture or on the player's square) and *Redraw artwork* (a new prompt and a new picture). The two models come with `heresy/fetch-heresy.sh --artwork` (14 GB, asked first).

### The instruments under the style

Under the Style prompt, the studio names what your prompt asks for: a chip for each instrument and style of the cheat-sheet it finds, coloured by what the ear found (green heard, amber questioned, red not played by that name) and wearing the instrument's picture. Rest the pointer on one for its card: the picture, its home, how it sounds, ▶ A and ▶ B with their seeds. A click shows the picture whole. **Alt+I** opens the cheat-sheet from anywhere.

### Artwork: what draws it, what it cannot, another painter

**What draws it.** A small language model (Qwen3-4B) reads the take's style and words and writes one picture prompt, its
subject first; an SDXL model paints it (1024 px, kept at 768). When the take is named for an instrument (an instrument's
probe), the studio tells both how the instrument looks and where it is at home, and Omni (the listener's model) looks at
the picture: when it does not find the instrument, it writes the prompt again from what it saw, and the painter tries
once more, three pictures at most. About half a minute a picture on a 16 GB card.

**What it cannot** (a disclaimer, said plainly): the painter draws what it knows. An instrument it has never seen by name
(the duduk, the morin khuur, the khomus, crystal singing bowls…) comes out as a guess: a wooden pipe, a violin, kitchen
bowls. Where Omni found the instrument in none of the three pictures, the picture is marked **≈ a guess**, in the
overlay and in the instruments' cheat-sheet. An artwork is the take's mood, not a reference picture of an instrument:
to know how an instrument looks, look it up.

**Pro tip: another painter.** The studio paints with whatever SDXL the link `artwork/SDXL-Artwork-Model` points at; ours
is `CyberRealistic-XL-v10`. Put another SDXL finetune beside it, as a diffusers folder or as one `.safetensors` file (as
Civitai gives them), and point the link at it, relative:

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

and back: `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. The next picture uses it, no restart. **Only SDXL finetunes
work**: SD 1.5, SD 3, FLUX and other families are refused, and the studio says what it found instead. A Turbo, Lightning,
Hyper or LCM finetune wants a few steps and little guidance: when its name says so, the studio paints it with 8 steps,
guidance 2 and Euler ancestral. For any painter, a file beside the link sets its numbers:
`artwork/SDXL-Artwork-Model.json` with `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (or `"dpmpp"`, the studio's own).

## LoRA Trainer

### What a LoRA teaches YuE2

A LoRA is a small adapter over both halves. **The style comes mostly from the sound half; following the lyrics from the music half**, and the music half learns small sets by heart quickly (its loss falls toward 0). Kinds:

| kind | data | what it learns |
|---|---|---|
| **Style** | 20+ songs of one sound | genre, production, a band's sound |
| **Voice** | one voice, sung or spoken: singing (ideally a cappella), readings, audiobooks | a timbre |
| **Language** | many voices, exact lyrics | diction of a language |
| **Artist** | a large, varied catalogue | all of it |

**A voice adapter learns from any form of the voice**, not only from singing: readings and audiobooks work too. Measured here (05.10.2026): an adapter trained on an actor's readings spoke in his voice, and when it sang, it sang with his colour. Name such an adapter by its kind (bass, baritenor, contralto…), never by a person: `lab/voice_kind.py` measures a set's voice from its speaking pitch.

![The LoRA Trainer: a run's telemetry](guide/studio-train.png)

### 1 Material

Put a folder of songs into `datasets/raw/` and pick it. Choose which tracks go in, give each its lyrics (found beside it by name when they exist) and, if it needs one, a style of its own. Tracks under 30 seconds are left out by default; long ones are fine (the music half trains on the whole song).

### 2 The set

A **trigger word** (an unusual word, e.g. `fosforida`) calls the style by name later; the **shared style line** says what is heard. *Make the set* writes `datasets/prepared/NAME/`: 48 kHz audio and a caption per track.

The **listener** (Qwen2.5-Omni, on any card with about 8 GB free) hears every track and drafts its tags; you correct them and *Write into the captions*. It is a draft at any size: read it.

### 3 Train

![A kind, the knobs, a card](guide/train-knobs.png)

- **Kind** presets the knobs (rank, steps, how much the music half learns).
- **Trainer**: **Ruach Studio** (the studio's own, on unquantized bf16 weights; it makes the set's latent cache itself) or **AI-Toolkit** by Ostris (the reference; it can also train with a score). Both save the same LoRA format; on the same set their curves agree epoch by epoch.
- **Base weights**: bf16 (24 GB cards) or int8 (smaller cards, a little less exact).
- **Steps**, **Save every** N epochs (every epoch is kept), **Rank**, **Learning rate**, **AR weight** (how much the music half learns; 0 = sound only), **AR anchor** (keeps it near the base model), **AR speed**.
- Below the button: the measured VRAM of earlier runs, and which card is free enough now.

### Rank and the other knobs

**Rank** is how wide the adapter's change to each matrix is. A LoRA adapts 224 matrices of YuE2, 112 a half; each is 2048 wide, 28 layers deep, 1.41 billion weights a half. What a rank costs, measured on these shapes:

| rank | of the weights it adapts | file, a half (bf16) |
|---|---|---|
| 16 | 1 % | 29 MB |
| 32 | 2 % | 59 MB |
| 64 | 4 % | 117 MB |
| 128 | 8 % | 235 MB |
| 256 | 17 % | 470 MB |

- **One voice, one instrument, one sound** (20 to 50 songs): **16**, at most 32.
- **A style or an artist** (a varied catalogue): **32**.
- **A large set of many voices** (hours of them, a tag for each voice): **64**, and **128 at most**, only when 64 measurably falls short. The trainer stops at 128: 256 would change a sixth of the weights it touches, more than any set here needs.
- The base model's file never changes. The risk of a big rank is the adapter itself: at full strength it forgets what it was not shown (singing, if it learned from speech).
- **Steps**: the music half learns a small set by heart fast (its loss falls toward 0): the green epochs in the Telemetry are the ones to hear first, often well before the last.
- **Learning rate**: keep the kind's own; higher learns faster and forgets more.
- **AR weight**: 0 teaches only the sound (a timbre); raise it for diction and style, which live in the music half.
- **The material's sample rate**: the sound half works at 48 kHz, the music half hears at 24 kHz. A 24 kHz recording teaches the music half everything, but the sound half only a dull top: resampling adds nothing above half the original rate. For a timbre, give it 44.1 or 48 kHz.

### 4 Telemetry

![Both halves' curves, explained under each](guide/train-charts.png)

The runs that are training stand on top of the room with their progress, time left and both losses. A run's telemetry shows its progress, speed, time, memory, and two curves:

- **Sound half · flow loss**: how well the sound half predicts the noise it must take away. It jumps from step to step (each step draws a random noise level): read the bold line, the running average.
- **Music half · ar_ce**: how well the music half predicts the song's own tokens. Close to 0 it knows the songs by heart; an earlier epoch is then the better adapter.

Hover a curve to read the step, its epoch and the value there. **Compare with…** lays another run's curves over these, dashed.

### The epochs worth hearing first

![Green: worth hearing first; ✓: in loras/](guide/train-epochs.png)

Every saved epoch is a chip. **Green** ones are worth hearing first, read off the curves: the first epoch whose sound loss has settled, the one with the lowest sound loss, and the last before the music half knows the songs by heart. It is a guess; the ear decides. Pick an epoch: **Into loras/ → the Creator** (it appears among the LoRAs at once), **Out of loras/**, or **Download** it.

> **An adapter trained without a score (Direct) belongs on the music half only in Direct runs.** In Full plan its music half can break the score even at low strength: give it the sound half only there.

### Runs

![Every run a card](guide/train-runs.png)

Every run is a card on the right: *Active*, *All*, *Archived*, *Trash*, searchable. A training run is lit like a playing take. ⋯ on a card: its telemetry, its log, archive it, stop it, or delete it into the trash (you are asked whether its adapters in loras/ go with it). From the Trash it comes back, or goes for good.

## Engine

### The machine

![Engine](guide/studio-engine.png)

- **Server**: what the engine runs: the model, the decoders, the context, the library.
- **Compute**: the **model** copy (BF16 7.2 GB, Q8_0 3.8 GB, Q6_K and Q5_K_M smaller), **GPU memory preset** (*Auto* fits the context and the VAE tiles to the card; *Manual* leaves them to you), **Keep models loaded**.
- **Hardware**: the card's memory now; **Unload model** frees it at once.

### GPUs: which card does what

![Which card does what](guide/engine-gpus.png)

On a machine with several cards, give each its work: the **studio** (synthesis) on one card, **training** on the cards you give it, the lab's **jobs** (the listener, Whisper, stems, remaster, upscale) on theirs. While a run trains on the studio's own card, a synthesis waits, and the page says why. With one card, that is how it works: train, then create. A new card for the studio takes effect after a restart (the button appears when it is needed).

### Decoders, adapters, sliders, the writer's model, the look

- **VAEs**, **LoRAs**, **Sliders**: every file the studio found, with its source and what it does.
- **Writer**: the local chat server's address (vLLM, LM Studio, Ollama), *Test connection*.
- **Appearance**: 22 themes (chosen to work in: clear and quiet), corners, the three fonts (text, headings, numbers).
- **Server log**: the whole log; **About**: every project the studio stands on, linked.

## DAW

**Experimental.** The way into a DAW works and was checked, but it still needs crash tests on other machines and
projects, and more work.

### Two ways out of the studio

The studio hands a song out in one of two ways, and only these two:

1. **The mixed track**, as the studio made it and the Refiner finished it: WAV, FLAC or MP3, no DAW in between.
2. **The whole take into your own DAW**, as a project of that DAW: from there on, everything happens outside the studio. No audio and no project comes back in: the studio does not read a DAW's project (REAPER can give it what a song is made from: its words and a melody).

The **DAW** button in the bar opens this choice. The page shows which DAWs the studio's own machine has (REAPER, Waveform, Bitwig), with their versions. When the studio runs on another computer than your DAW (a server at home, a laptop on the road), mark yours with *I use this one*.

| DAW | what the studio gives it | state |
|---|---|---|
| **REAPER** | its own project (.RPP): the mix, the stems, the score as MIDI, tempo and meter, sections, lyrics, the recipe | ready, checked by REAPER itself |
| **Waveform** (Tracktion), 14 or newer | DAWproject: the mix and the stems, the score as note tracks, the sections as markers, tempo and meter | ready, checked against the format's schema |
| **Bitwig** | DAWproject, the same | ready, checked against the format's schema |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, the same | ready |

### REAPER: install

- **Linux**: from reaper.fm, the *Linux x86_64* tarball; unpack it and run `./install-reaper.sh`: it goes to `/opt/REAPER`, without anything else.
- **Windows, macOS**: the installer from reaper.fm.
- REAPER gives 60 days with every function, then asks for a licence ($60 for personal use or a small business).

### The fullest project: three steps first

What the project carries depends on what the take has. For everything:

1. **Full plan** when you make the song: the score becomes the MIDI tracks and gives the tempo and the meter. (A Direct take has no score: no MIDI; the tempo comes from "NN bpm" in the style, or stays a placeholder of 120.)
2. **Refiner → Stems**: each stem gets its own track (two: vocals and instrumental; four: with drums, bass and the rest).
3. **Refiner → Lyrics check**: Whisper times every line; the lines come onto the timeline and the sections ([Verse], [Chorus]…) become regions.

None of the three is needed: the project takes what there is and says what it lacked.

### REAPER: export and open

1. Open the take (in the Creator, the Refiner or the Librarian), then **DAW → REAPER → Export the take**; or right-click any take → **Download → REAPER project**.
2. The studio packs the take: the audio as 24-bit WAV at 48 kHz, so a seven-minute song with two stems is about 350 MB. The browser saves `TITLE.reaper.zip`.
3. Unpack it anywhere, the whole of it: `TITLE/TITLE.RPP` and `TITLE/audio/` stay side by side.
4. Open `TITLE.RPP` in REAPER (File → Open project, or a double-click).

### What is inside

| track | what it is |
|---|---|
| **Mix** | the song as the studio rendered it; **muted** when there are stems, so the stems sound and the mix waits as the reference |
| **Vocals**, **Instrumental** (or Drums, Bass, Other) | the stems, each from 0 over the whole song |
| **Score · Vocal**, **Score · Ins** | the score as MIDI, one track a voice. It is the score *as written*: the song as sung may drift from it. It makes no sound until you give it an instrument (the track's FX: ReaSynth, or any VSTi) |
| **Lyrics** | every lyric line as an empty item with the line in its note, where Whisper heard it |

- **Regions**: the sections of the lyrics, from the first timed line of each to the next.
- **Tempo and meter**: from the score (its `Q:` and `M:`), else "NN bpm" in the style, else 120 in 4/4 as a placeholder; the project's notes say which.
- **The project's notes** (in REAPER's project settings): the title, the style, both seeds, the take's own name: the way back to the take in the Librarian.

### REAPER: when something looks wrong

| what you see | why | what to do |
|---|---|---|
| media offline | the audio folder is not beside the .RPP | unpack the whole ZIP, keep `audio/` next to the project |
| no lyrics, no regions | the take was never timed | Refiner → Lyrics check, then export again |
| no MIDI tracks | a Direct take, or one without a score | make it in Full plan, or bring your own score in the Creator |
| the tempo reads 120 | the take has no tempo of its own | set it in REAPER, or write "NN bpm" in the style next time |
| the MIDI runs ahead or behind the voice | the score is the plan, the singing its performance | use the MIDI as a sketch, or stretch it to the stems |
| Hebrew or Greek lyrics show as boxes | REAPER's font lacks the script | a font with those scripts in REAPER's theme or preferences |

### REAPER: songs from inside REAPER

Three REAPER actions in `extras/reaper/` (ReaScript, Lua) reach the studio through its API, from the studio's own machine or another one on your network. Sound goes one way: songs come out of the studio into REAPER, and no audio or project goes back in. What REAPER gives the studio is what a song is made from: its words, and its melody.

- **Ruach - Generate here**: the style, the length and the mode, asked; the song is made in the studio and lands on a new track at the time selection's start (its length the selection's). The lyrics come from the notes of the selected items (the exported project keeps every section's words there), or from the dialog. **Selected MIDI items are the song's melody**: their notes become its score (the topmost track sung; a track of chords is not given as a line, as an instrument could take the tune), at the project's tempo and meter, in the key of the take's key snap or the one the notes suggest, made in *Melody only* mode; the new item's notes say how the melody was read. REAPER stays free while the studio works.
- **Ruach - Bring a take**: words (title or note, `*` and `?`), a workspace if you like, and the take you pick lands at the edit cursor.
- **Ruach - Settings**: the studio's address, its token if it asks one, and the workspace songs from REAPER land in.

Install: copy the folder into REAPER's `Scripts`, then *Actions → New action → Load ReaScript* for the three, and run *Settings* once. They need `curl` (every Linux, macOS, and Windows 10 and later have it). The folder's README says the rest.

### DAWproject (Bitwig, Studio One, Cubase)

Right-click a take → **Download → DAWproject**, or *Export the take* on the Waveform or Bitwig card of the DAW window: one `.dawproject` file with the mix and every stem (the mix muted when there are stems), the score as note tracks, one a voice, the sections as markers once the take is timed, at the take's tempo and meter; the style and the lyrics ride in its notes. Open it with the DAW's import for DAWproject: Waveform 14 or newer (*File > Import Other > Import a DAWproject file*; the studio asks Waveform 14 at least), Bitwig, Studio One, Cubase. Checked against the format's own schema (Project.xsd).

### From your own scripts

Everything above is also the studio's API: `POST /api/v1/takes/NAME/reaper` packs the project and says where to fetch it. See **docs/API.md**: songs, jobs, takes, marks, workspaces, and an MCP server for agents.

## Shortcuts & tricks

**In the Librarian:** **Ctrl+A** checks every take shown, **Esc** none, **Delete** sends the checked to the trash (it
asks first), **Ctrl+Z** gives back the last change (a move, a workspace, hiding, a pin, marks, the trash); the pill
above the player has the same Undo for ten seconds.

### Keys

| key | where | what it does |
|---|---|---|
| **Space** | anywhere but a text field | play or pause the take in hand |
| **←** **→** (with **Shift**: 30 s) | anywhere but a text field or a menu | 5 seconds back or on |
| **M** | anywhere but a text field | sound off and on |
| the media keys | the keyboard, a headset, the desktop's media panel | play, pause, previous, next |
| **Esc** | anywhere | closes what is open: a menu, a dialog, the guide, a full-screen view, the Engine room |
| **Enter** / **Esc** | a dialog, a rename in place, a LoRA's typed value | keep / cancel; in a dialog with long text **Shift+Enter** is a new line |
| **Enter** | *Start from an idea* | the chat model drafts the song; **Shift+Enter** is a new line |
| **Ctrl+S** | the Writer | saves the document now |
| **↑ ↓** · **→** · **←** | a menu | move · open a submenu · back out of it |
| **arrows** | the theme picker | move between the themes |
| **+** **−** **0** | a full-screen staff or spectrum | zoom in, out, back to fit; **Ctrl+wheel** zooms where the pointer is |
| **← →** (with **Shift**: bigger steps) · **Home** | a column's edge, focused | the column narrower or wider · its own width again |
| **Enter** or **Space** | a run's card in the LoRA Trainer | open the run |

### The mouse

- **Right-click** a take anywhere (the takes list, a card, a pinned take) for its menu; right-click a workspace for its locks, rename and delete.
- **Double-click**: a take in the takes list plays it; a workspace's name renames it; a column's edge gives it back its own width; the staff or the spectrum opens full screen; a LoRA's value lets you type it exactly.
- **In the Librarian, as in a file manager**: once one card is checked, a click anywhere on another checks it too; **Shift**+click checks the whole range; a drag over the empty space between the cards draws a band that checks what it touches; **Ctrl**+drag draws it from anywhere and turns over what it crosses: unchecked cards are checked, checked ones unchecked. The page scrolls on when the band reaches an edge.
- **Marks for many**: with several checked, 👍, 👎 or ★ on any of them (or on the bar of the checked) marks them all; when all of them have that mark already, it is taken back. Taking several out of a workspace asks first; the trash always asks.
- **Hover** a workspace name cut short: it shows whole, over the grid.
- **The speed** in the player (0.5× to 2×) keeps the pitch: slow down to hear a detail, speed up to skim.

### Small tricks

- Keep the **music seed** and change the **sound seed**: the same song, rendered anew.
- Hear an instrument on **several seeds** before you judge it: YuE2 brings it in when the seed and the song let it.
- **Pin** the takes you keep coming back to (four in each workspace); **Pinned** on the left lists them all.
- **⋯** on a card is its right-click menu, for a touchpad.

## Tips

### When something goes wrong

| what you see | what it is | what to do |
|---|---|---|
| *Babel in the score* | the music half wrote garbage for a score | strengths into the green, fewer adapters on the music half, or Direct |
| the singer speaks over a loop | an instrumental score adapter too strong for a sung song | keep it at 0.3–0.5 |
| *GPU0 is training…* | a run trains on the studio's own card | wait, stop the run, or give training another card (Engine → GPUs) |
| the page says the server is unavailable | the studio restarted | wait a few seconds; reload the page (F5) after an update |
| a take sounds metallic in the highs | the VAE's 25-frame buzz | Refiner → Debuzz at 80 % |
| the lyrics drift from the text | the music half lost the words | Refiner → Lyrics check; *Regenerate from…* the minute it went wrong |
| the instrument you asked for is not there | YuE2 decides when an instrument comes in, and the seed decides a lot | the same prompt with a **random music seed**; hear several takes before you judge |
| the instrument plays, but not like the real one | what YuE2 knows of it | an instrument LoRA (LoRA Trainer) |

### Good habits

- Keep the **music seed** when a song is right and change only the **sound seed** to hear its sound anew.
- Note what works in each take's **Note**: next week you will not remember which seed it was.
- Give each project its **workspace**, and lock the finished ones.
- Train on what you want to hear: the adapter learns the set's sound, its faults included.
