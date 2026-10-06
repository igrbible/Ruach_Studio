# Changelog

Ruach Studio is a music studio on [YuE2](https://huggingface.co/m-a-p/YuE2-3B): one machine with an NVIDIA card,
your own songs, nothing in a cloud. It grew over [YuE2 Kit](https://github.com/IronWolve/yue2-kit) v12 by IronWolve,
which runs [yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp) by ServeurpersoCom. Every change has a number
(HERESY 1001 and up); `heresy/docs/HERESY.md` tells each one with what was measured, and `heresy/engine/` keeps each
change to the engine and the page as a patch of its own.

## 2.0.0-rc1 · 2026-10-06

The release candidate: the alpha after three days of daily use and what that use asked for (HERESY 1167).

### Everywhere

- The page boots under a veil (the logo large, *Loading the Sound Heresy*, seven seconds at least); a test browser
  never gets it.
- **Cancel run** from wherever you are, in every room; the take frame at rest says *Smithery is Idle*.
- A field that refuses a value says why, in a note beside it (Guidance 1–4, sound steps 1–160, Max length, takes,
  peak clip); a number field cleared to nothing refills when you leave it, not while you type.
- What cannot be undone asks first (*Clear*, *New song*); tips show after 400 ms, the style chips' after 600 ms.
- The default look: *Scroll & Brick*, softer corners, the hover accent and its glow, Noto Sans with Noto Sans Mono;
  the day theme on #f8f9fa. The Creator, the Writer and the Refiner say in two lines what they are, beside their
  names.

### Creator

- **Direct** by default (the model sings straight from the words; *Full* plans a score first, and *Plan* is off in
  Direct). Guidance (CFG) on one line, up to 4: measured, 1.4–1.6 is the steady ground, 2.0 moves more, 2.4 is the
  most that stays stable.
- The music's lengths in time beside their tokens, kept in step with *Max length*.
- **Play new takes**: a take made here plays when it is done. The Takes column hides a take you dislike (as SUNO
  does), stars a favourite on its row, and counts the workspace's own takes (the total under All Workspaces).
- The take card: Sliders over LoRAs, long names and values wrapped inside the card.
- **LoRAs**: the sound half's strengths together on a slider of their own beside the music's (by ear, 2.0 together
  brought a heavy bass, 0.55 sounded right); an adapter of two files, music and sound, is one card (*both*); a
  right-click **mutes** one (left out of the run, its strengths kept) or takes one trained here out of the list (its
  checkpoint stays in its Trainer run); the adapters' **trigger words go at the style's end by themselves** when the
  song is made, never doubled.

### Writer

- **The style as tags** beside the readable one: short tags, the most important first, the tempo last, as an SD/SDXL
  prompt is written (YuE2 follows short tags best). *Into the form* puts the tags by default, or the readable style.
- **Saved briefs** by name, kept by the lab (every browser sees them); the writer and the model remembered; the
  request and its answer in the server log, OpenRouter's too; *Send the request to LLM* with its progress beside it.
- A request sent while the notebook has another document open asks first: put that one into the Creator and send on
  it, or send on the Creator's song as it is.

### Librarian

- Cards in whole rows, about thirty at a time; the bar follows the workspace opened; 👍 and 👎 filters beside the
  favourites (a dislike hides a take everywhere but under *Only the disliked*); the numbers in two lines.
- **Artwork** by **Krea 2 Muse** (Stable Yogi; GGUF Q4 from 16 GB, Q8 for a repaint), SDXL kept for the small cards;
  one artwork a take, shown at the card's full height and downloadable from the overlay; an artwork job waits for a
  card instead of failing.
- A workspace's name is 80 characters at most, said aloud past it.

### LoRA Trainer

- No twin of the last epoch; the Runs column the window's height; the log in a frame at the page's foot.
- `lab/voice_kind.py`: a set's voice by measure (male or female, and the register from bass to tenor and contralto to
  soprano, by the speaking pitch; 140–175 Hz is shared, so there it asks), to name a voice adapter by its kind,
  never by a person.

### The player

- The waveform on its own ground with its bars at 15 %, the player a little see-through.

### Languages

- Everything new in all seven languages: English, Russian, Ukrainian, Belarusian, Greek, Spanish, Italian.

## 2.0.0-alpha · 2026-10-03

The first release under its own name: 166 changes over the Kit (HERESY 1001–1166). Stable in daily use on one machine (three RTX 3090)
for its makers; *alpha* because it has not yet met other machines.

**Licence**: the code under the GNU AGPL, version 3 or later (a fork stays open); the logo, the name, and the audio and
pictures published with the studio under CC BY-NC-ND 4.0 (`LICENSE-ASSETS.md`).

### Five rooms

- **Creator · Writer · Refiner · Librarian · LoRA Trainer**, each with its own work, a bar that fits at any zoom,
  and **the guide** inside the studio (the `?`: every room, the DAW, the shortcuts), opened on the room you are in.
- **The player** at the bottom of every room: the waveform as one soft cloud, the take's artwork, shuffle and
  repeat, speed 0.50×–2.00× with the pitch kept, *play on click*, *play on*, media keys and the desktop's media
  panel, the time under the pointer, and a dot that beats while it plays.
- **22 themes** (day, night, warm, cool, high contrast), each giving its own tones and washes; lines that breathe
  (no hard line anywhere); the logo: RUACH, the winged woman out of a cloud, STUDIO; where the words do not fit, the same woman
  without them.
- **Languages**: the page whole in English, Russian, Ukrainian, Belarusian, Greek, Spanish and Italian (every room,
  menu, tip and message; numbers and dates in the language's own way; the guide too), at a click in the bar, kept
  with your settings; the logo's words follow: РУАХ СТУДИЯ, РУАХ СТУДІЯ, ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ…
- A tip for every control that needs one; text selects only where it is meant to (fields, the log, the guide), and
  Ctrl+A only in a field.

### Creator

- **The kitchen**: the form in two columns of cards, the words beside the machine, over two thirds of the room; the take
  over its takes in the last third (compact cards, a line to drag, folded to a strip at the right); every LoRA not
  in use behind «Add a LoRA»; the player in one row; closed parts that read as closed.
- Songs up to **8 minutes** (speech up to 15), sound steps up to 160, four sound solvers, sampling tips that say what
  goes wrong; the form survives a reload; profiles (*Music*, *Speech*) and a library of styles.
- Planning modes: **Full plan** (melody and chords first), **Melody only**, **Direct**; your own score; covers from a
  take or a recording (the transcriber); **regenerate from here**; sound variations of a long song.
- Keys: the song's key beside the title, transposition, the score checked before the music is built on it
  (**Babel in the score**: a broken score stops the run before anything is spent on it, and says why).
- VAEs (standard, legacy, blend), sliders, LoRAs with strengths in safe zones and the music half's strengths together
  on a slider of their own (it moves them all, each in proportion); each voice or genre slider's **curve** through the
  song (flat, an arch, or drawn by hand: flares and fades); the instruments cheat-sheet ♪ (200 instruments
  with what YuE2 really plays, the ear's verdicts in English, and the prompts of the probes kept).

### Writer

- Songs as documents with versions and the takes made from each; text profiles; a writing room on a chat server of
  your own (vLLM, LM Studio, Ollama) or **OpenRouter** (Qwen and DeepSeek picks), which says where its words come from.
- The writing room knows what this engine plays: the instruments heard and not, those only the studio's LoRAs play,
  the styles kept by ear with their words, the voices given and not, and how to ask for speech with no singing.

### Refiner

- Numbered steps: **Spectrum · Artifacts · Debuzz · Lyrics check · Stems · Remaster · Upscale**, and **Run the
  chain** for all of them in order. Stems (BS-Roformer, htdemucs_ft), the Debunker v6 remaster (432 Hz, loudness in
  two passes), UniverSR upscale, debuzz of the VAE's 25-frame buzz, a lyrics check by Whisper, karaoke timing
  (LRC, SRT), trim to the text. The remaster's preset and de-esser act on stems, and are off where they would not.
- Everything made from a take hangs under it as a tree; progress shows where the eye is (the room's head, the step's
  own block, its tab); each step shows what it made; the column lists the takes refined, the newest first.
- **Import** a track from elsewhere: every tool works on it.

### Librarian

- Every take as a tile or a row (past 2K more tiles rather than wider ones, 6 at 4K, and the rows in two
  columns), searched (`*`, `?`), filtered, sorted; workspaces (locks, pins), the take in hand's
  workspace in the bar, hidden takes, the trash that gives back.
- Selection as in a file manager (a click, Shift, a rubber band, Ctrl+drag), the keyboard (**Ctrl+A, Esc, Delete,
  Ctrl+Z**) and **undo** for moves, pins, marks and the trash; like, dislike, favourite, notes; the peek, the sheet,
  the **datasheet** (all a take was made with, LoRAs and their strengths, its score drawn, or written from its sound).
- **Export to DAW** from any take's menu (REAPER project, DAWproject), your own DAW first.
- **💎 sets from Hugging Face**: the studio's approved probe sets (instruments, the LoRAs' A/B, styles, voices), each
  fetched on your word into a workspace of its own, locked; one of that name here is never written over unasked:
  rename yours first, or restore the original.
- **Freeze** a workspace you keep but do not use now: its takes are heard and read, never changed, moved or thrown
  away, and they leave All Workspaces and the search until you unfreeze it.
- **Artwork** for a take, asked for: a small model writes the picture's prompt from the style and the words, an SDXL
  model paints it; it shows in the player, on the card, in the media panel, and in the MP3 as its cover; a click
  shows it whole over the studio (‹ › through the cards' pictures), never in another tab. An instrument's picture is
  looked at by Omni and drawn again when its instrument is missing; the painter is any SDXL finetune behind
  `artwork/SDXL-Artwork-Model`; *Remove current artwork* keeps it beside the take.

### LoRA Trainer

- LoRA adapters for YuE2 from your own songs: the material, the set (captions by the listener, Qwen2.5-Omni), the
  knobs with the rank said in plain words, a VRAM gate, runs in units of their own, telemetry, the epochs worth
  hearing first, starter sets (GTSinger RU and EN samples). Our own trainer, needing nothing of AI-Toolkit.

### Out of the studio

- **DAW**, two ways out and only two: the mixed track as it is (WAV, FLAC, MP3), or the whole take into your DAW:
  the **REAPER project** (the mix, every stem, the score as MIDI, the lyrics on the timeline, the sections as regions,
  checked by REAPER itself) and **DAWproject** (the same for Waveform 14, Bitwig, Studio One, Cubase, checked against
  its schema). REAPER can also make a song or bring a take from inside itself (`extras/reaper/`), the selected MIDI
  items as the song's melody: sung as written, the tempo, meter and key read or guessed, and said.
- **The API** (`/api/v1`, OpenAPI 3.1) for scripts, DAWs and agents on this machine and its network, and an **MCP
  server** for agents (`extras/ruach-mcp.py`, twelve tools); the Refiner's steps are on it too. A MIDI file can be a
  song's melody there as well (`midi_b64`, or `midi_file` for an agent), its score checked before anything is spent.
- **Compare** every version of a take in one player (the original, debuzz, remasters, upscales, stems), switching at
  the same second, as SUNO does.

### The machine

- **The Engine page** in rows that fit a 1080p screen: server and hardware beside the log, compute beside the GPUs,
  the look beside the Writer, the VAEs beside the LoRAs (trained here apart from those from Hugging Face); a room in
  the bar leaves it, asking first about GPU roles not saved; the credits in three columns under their makers' marks.
- **What runs and what waits**, under the engine's lamp in the bar: the songs (the regenerations too) and the lab's
  work on the cards (artwork, stems, upscale, Whisper); a waiting one comes off its queue with its ✕, pressed twice.
- **Which card does what**, and a GPU guard: a job goes only to a card that has room for it, never to one a heavy
  program of someone else holds; the studio's own processes come first; Engine → GPUs shows its verdict on each card.
  Unload in the bar. Whisper runs on the CPU when no card can take it.
- The services come back after any fall; the line to the studio is watched (a far studio is answered at once and
  confirmed after); this machine and private networks only; settings on disk; one Python environment.
- The Kit's own tests pass against this page (the page test with the mock, the real server on the CPU), the real one
  never touching the user's lab; `heresy/tools/check-player.mjs` checks the player.
- `build.sh` builds the page (read from disk by the server, with no copy inside it and nothing gzipped: a reload shows it)
  and the server when its C++ changed;
  `fetch-models.sh` fetches every weight, pinned and checked (the listener and the artwork models when asked).
