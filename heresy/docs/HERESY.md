# HERESY · what this fork adds to yue2-kit

> The patch log of **Ruach Studio** (once "YuE2 OS"). The guide to the whole is HERETICA-GUIDE.md.
> Grown with every patch.
> Maintainers: **Viktor Zhuromskyy (ЙирмиЙа́Ѓу)** with Claude (Anthropic), HERETICAL TANDEM™.

This is [IronWolve/yue2-kit](https://github.com/IronWolve/yue2-kit) **v12** running
[ServeurpersoCom/yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp) `603be27` with the Kit's
58 patches, plus our own work on top. Nothing upstream is edited in place: every change is a
numbered patch (from **1001**, so it never collides with the Kit's own numbering) or a file of
ours in the Kit root. You can read, drop or re-apply any single one.

We make long songs (6–8 minutes), in Russian and other non-English languages, on three RTX 3090.
Most of what follows came from that: measured on real takes, not guessed.

---

## At a glance

| | |
|---|---|
| **Longer songs** | limits 6144 score / 12000 music tokens / 480 s — eight minutes, engine and page in step |
| **Sound solvers** | midpoint (release), multistep, Heun, Euler — convergence measured, not assumed |
| **Writing room** | YuE2 Studio's songwriting assistant, on vLLM / LM Studio / Ollama or OpenRouter |
| **Lyrics check** | Whisper large-v3 matches every take to its lyrics, minute by minute |
| **Spectrum** | spectrogram, average spectrum and band energy in the take card; A/B two takes |
| **Full screen** | spectrum and staff zoom and scroll; the staff prints on US Letter |
| **Form comfort** | draft survives F5, changed knobs marked, folding blocks, a play-on player |
| **heresy-lab** | a Python neighbour for what needs Python models, behind the Kit's own port |
| **Keys** | move a score to any key; a style naming another key is caught; the key sits beside the title |
| **Four tabs** | Create · Writer · Post · Collection; igr.bible themes by day and by night |
| **Collection** | every take as a card or a row, searched, filtered, rated, noted, grouped in workspaces, exported, trashed and given back |
| **Writer's notebook** | songs and readings in the making: STYLE, LYRICS, NOTES, PARAMS, versions, the takes made from each |
| **The chain** | Debuzz → Upscale → Remaster (432 Hz), then the checks, as one job on the GPU box |
| **Readings** | long spoken Scripture in four languages, text profiles that prepare the text, trim to the text |
| **Listening** | the player hears a lossless FLAC beside every WAV; play-on stays in the zone it started from |

---

## Layout

```
upstream/     yue2.cpp as released                     — never edited
build/        yue2.cpp + the Kit's 58 patches + ours   ← branch heresy
kit/          the Kit repo as released (v12)           — never edited; its upstream remote removed (our own project)
heresy/       our patches, their tooling and skills    (its own git)
  engine/     1001-….patch …  against build/
  kit/        (none yet)      against kit/
  apply.sh    --export · --status · apply (idempotent, by git patch-id)
  skills/     yue2-style/SKILL.md — style prompts for agents
lab/          heresy-lab: lab.py and its jobs (collection.py, writer.py, debuzz.py …)   its own git
whisper/      Whisper large-v3 (CTranslate2, float16), 2.9 GB
build.sh      the page (read from disk by the server), the server when its C++ changed, the restart when idle
```

The page is part of `build/` (`build/tools/console`); `build.sh` inlines it into one file,
`build/tools/public/index.html`, which the server reads from disk at every load (HERESY 1130): a page
built anew shows on a reload. It inlines any `heresy-*.js` module that `index.html` names, so new
modules need no edit of the build script.

```bash
./build.sh --patches    # heresy/apply.sh, the page, the server when its C++ changed
./lab/start-lab.sh      # heresy-lab on :41870 (reached through the Kit at /lab/)
./start.sh              # the Kit server
```

---

## The patches

### 1001 · Eight-minute songs
Score tokens 4096 → **6144**, music tokens 9000 → **12000**, duration 360 → **480 s** (25 music
tokens a second). Changed in the engine (`src/sampling.h`, `src/request.cpp`) and on the page
together: the page takes its defaults from the engine's `/props`, so a page-only change did
nothing. 8192 score tokens leave the lyrics too little of the 24,576-token context. The prompt
counter reads the live knobs instead of constants.

### 1002 · The form survives a reload
Title, style, lyrics, seeds and every knob are kept per browser and restored after F5.

### 1003 · Sound steps up to 160

### 1004 · Sound solvers
`solver`: **midpoint** (the release, 2 network calls a step), **multistep** (Adams–Bashforth 2,
1 call), **Heun** (2 calls), **Euler** (1 call). Measured on one song against a 160-step
midpoint reference, fixed noise, 20 s (SNR, dB — higher is closer):

| steps | euler | midpoint | heun | multistep |
|---|---|---|---|---|
| 8 | 14.2 | 25.6 | 20.5 | 17.4 |
| 16 | 20.3 | 35.9 | 29.0 | 25.4 |
| 32 | 25.6 | **46.8** | 40.7 | 36.1 |
| 64 | 31.0 | 52.9 | 52.1 | 47.8 |

Midpoint 32 (the release) is already past audibility; Heun is not better at the same cost.
Solvers shape only the sound, never the words: those are fixed before (see *Where things live*).

### 1005 · Sampling tips that say what goes wrong
Every sampler knob, the guidance and the shape cards: default, ✓ what to try, ⚠ what breaks
past it, with the measurement or source. Tip type 12 → 14 px.

### 1006 · Form comfort
Title on its own line, seeds side by side; lyrics under the style; Style, Lyrics, VAE, Sliders
and LoRAs fold; the text boxes grow to 8 and 16 lines; a knob off its default gets an amber
frame; a favicon (treble clef with A4, glyphs from Noto Music, SIL OFL); no 404 probes against
vLLM.

### 1007 · Spectrum, full screen, the staff on paper
- **Spectrum** in the take card: our *Audio Spectral Comparator v3* ported to the page with the
  same method — STFT Hann 2048/2048 with scipy's scaling, floor −80 dB, log or linear frequency;
  Welch average spectrum with SUB…AIR zones; band energy with Δ. Another take can be laid over.
  A click plays from there.
- **Full-screen viewer**: Ctrl+wheel zooms around the pointer, drag and wheel scroll, + − 0 Esc.
  Raster pictures are redrawn at every zoom, not stretched.
- The **staff** engraves at 1050 wide (was 700) and **prints on US Letter**, portrait or
  landscape, one system per SVG so a page never breaks inside a system.

### 1008 · `yue-synth --no-fa-lm`
Flash attention off in the music half (AR) only, for experiments. Without FA the sound half of a
7-minute song needs a 15.9 GB attention buffer and does not fit a 24 GB card.

### 1009 · Player and card
Previous / next take and **Play on**: when a take ends the next one down the list starts. The
take card's Prompt and Lyrics start folded. The style counter flags what the official examples
never hold.

### 1010 · `/lab/` on the Kit's own port
`GET /lab/<path>` is passed to heresy-lab on `127.0.0.1:41870`: one origin, one port to reach
over a VPN, no CORS.

### 1011 · Writing room and lyrics check
- **Writing room**: the songwriting assistant of
  [YuE2 Studio](https://github.com/vrgamegirl19/Yue2_Studio) (Apache License 2.0) — its `songwriter.md` **verbatim** and
  its five tasks (song, lyrics, style, review, adapt) with the current title, style, lyrics and
  score as context, standing writing preferences, a JSON draft with notes that are never sung,
  apply all / lyrics / style and undo. One rule added and measured: *style against the score*.
- **Lyrics check**: Whisper large-v3 on the server, loaded for one take and gone from VRAM after
  (~17 s for 7 minutes on a 3090); per-minute match to the lyrics, the furthest line reached,
  returns back, every heard segment beside its closest lyric line. A Whisper loop on one text
  is flagged as a void measurement.

### 1012 · Writers and softer style rules
OpenRouter beside the local chat server; one-click addresses for vLLM, LM Studio and Ollama; an
empty field in a draft means *unchanged* and never wipes the form; style length up to ~1,600
characters and ASCII `->` accepted, the Unicode arrow flagged.

### 1013 · heresy-lab is asynchronous
A request never waits for a job: `202` with the job's state while it runs, the result when done;
the page asks again every two seconds. Long jobs (stems, AudioSR) need nothing else.

### 1014 · Three workspaces: Create, Write, Post
Tabs in the top bar. **Create** is the Kit as it was; **Write** is the writing room at full size
with the song in the form beside it; **Post** is what is done to a finished take — Spectrum and
Lyrics check, with places for Stems and AudioSR. The takes list stays in all three, and the take
card's *Post* row opens that take there.

### 1015 · Themes: igr.bible by day and by night
*Scroll & Brick* (the default) and *Scroll by Lamplight*, from YuE2 Studio: background and accent
as Studio defines them, the rest derived with Studio's own mixes, every text colour pushed until
it clears 4.5:1 on every surface. A day / night / as-the-system button; day and night keep their
own themes.

### 1016 · Form trimming
The Kit's idea writer retired (its section templates live on in the writing room's *Structure*);
an adapter shows only the slider of the half it has; Guidance (CFG) lost its long hint; the (i)
marks left the tab order, so TAB goes from field to field.

### 1017 · A top bar that fits at 120%
Icons (Font Awesome 6 Free outlines, CC BY 4.0, taken from the fonts igr.bible ships; our own sun,
since theirs reads as a gear at 17 px); the theme button a palette and a dot; the takes list
folds to a 40 px strip on the right.

### 1018 · Keys
`heresy-transpose.js` moves a score to any key: every note by the same semitones and a fixed
number of letters, against both key signatures and bar-scoped accidentals; chord symbols move
too; it checks every note it moved (byte-identical to the Python transposer of our B♭ minor
experiment, and D minor → B♭ minor → D minor returns the original). A style naming another key
than the score's is flagged with *Move the score to …* / *Write … in the style*. Adapter rows
line up again: the name with its trigger word small under it, the sliders, remove.

### 1019 · The song's key beside the title
With a score in the form, a choice moves it; with none, the choice waits and moves the next
score that arrives (a plan, a Retake, a transcription). In Full mode the model writes its own
score and may ignore a key named in the style: this makes the key a choice of the user's.

### 1020 · Spectrum measured on the server
heresy-lab computes it (`lab/spectrum_job.py`, numpy, 48 kHz) and sends a block of about 10 MB (gzipped
until 1166) instead of the whole take: 36 s → 9.6 s the first time, 5.5 s from the cache, over a phone line.

---

### 1021 · Stems and the tree of what is made from a take
BS-Roformer ep317 (voice) and htdemucs_ft (drums, bass, other) in the lab. Everything made from a
take lives in `outputs/TAKE/derived/ID/` with a manifest; the page shows it as a tree, and any file
of it goes to the spectrum, the lyrics check or the next step. The proxy passes Range, so the
players seek; the spectrum is drawn up to 3840 px wide.

### 1022 · Remaster: the Debunker v6
Viktor's SUNO post-processing pipeline on a take or its stems: preset mix, cleanup and fade,
de-ess, 432 Hz (off keeps 440, for the public), loudness in two passes (measured, then a linear
gain; 48 kHz out). Loudness in and out are measured, so A/B is honest.

### 1023 · Import a track from elsewhere
WAV, FLAC, MP3… (a SUNO track) becomes a take, 48 kHz 24-bit, marked imported; lyrics optional.

### 1024 · Upscale: UniverSR
Subtle / Normal / High / Extreme redraw above 12 / 8 / 6 / 4 kHz; the original kept below the
cutoff by default; 20 s chunks with 1 s equal-power crossfades (no step at a join beyond the
difference between two renders, measured).

### 1025 · Artifacts
Held tones named as notes (a drone is music, a 17 kHz whine is not), the VAE's frame buzz per
30 s, click candidates, clipping, dropouts, DC, stereo per band, loudness. CPU, cached.

### 1026 · YuE2 OS
The logo (the favicon's treble clef; the OS plate inverts by night), no web links in the
workspace (they live in the Engine room), the take's ID in its card, a player that follows a
click in the list, toasts that stay longer, a style field that no longer jumps while typing.

### 1027 · Settings on disk
The page's settings mirrored to `~/.config/yue2_os/settings.json` (see HERETICA-GUIDE §3): merged
per key, a mass disappearance never erases the file, nothing written when the file could not be
read at load. A reset button in the Engine room. The GPU memory preset stays as chosen.

### 1028 · The score: check, MIDI, one voice moved
`abc_tools.py` ported to JS (counts equal to the Python on three takes): notes per voice, range,
the Ins : Vocal ratio; MIDI out (a track per voice, sections as markers) and in; a marker CSV;
one voice moved by scale steps. **Fix:** the 1018 transposer left a note after a rest (`zd`) where
it was — 1 to 11 wrong notes a score; now 0 of 2883 in 15 transpositions.

### 1029 · Post as numbered steps
One tool at a time, in the order the work goes; a step is ticked once done for the take in hand.

### 1030 · Debuzz
The VAE writes 1920 samples a frame; its highs ripple with the frame clock (the "metallic
buzz"). Debuzz divides that ripple out above 2 kHz (80 % by Viktor's ear), measuring it in and
out against control periods; on a track the VAE did not make it finds none.

### 1031 · Viktor's stable sampling as the defaults
Score 0.95 · 0.95 · 50; music 0.9 · 0.95 · 100, penalty 1.3 over 100; guidance 1.6 in every mode.
The wanted key now follows a new plan over an old score.

### 1032 · Library of styles and profiles; Speech up to 15:00
Saved styles and profiles on disk (`presets.json`); built-in Music (8:00) and Speech (15:00,
Direct). The engine cuts a music budget that does not fit beside the prompt instead of failing.
**Fix:** the guidance field filled itself with 1.0, so 1031's 1.6 never went out.

### 1033 · Corners follow the profile everywhere
A `--r-pill` token; every chip, step and badge follows Rounded / Softer / Square.

### 1034 · Trim to the text
A reading that goes on after its text ends is cut where Whisper hears the last words
(`lab/textend_job.py`), re-rendered from its own codes up to there: the same take, shorter.

### 1035 · Examples as a menu
A random official demo, or one of ours by name: the Readings (Jude, John 1 in four languages).

### 1036 · Transcribe a take of the library
`/transcribe?take=NAME` reads the take's own `audio.wav`; nothing goes up from the browser.

### 1037 · Regenerate from here
`semantic_keep` keeps a take's music up to a moment; from there the model writes anew. The
music budget is cut to what fits beside the prompt instead of failing.

### 1038 · Trim only when the end can be trusted
**Fix:** a trim cut live Greek text when Whisper misplaced the end. Now the end must be heard
with confidence, or the take stays whole and says why.

### 1039 · Sound variations of a long song
**Fix:** several sound variations of an 8-minute song aborted the server (CUDA illegal memory
access): the NAR's attention outgrew 2³¹ elements. Variations now go in groups that fit
(heads × variations × frames × (score length + frames + 256) < 2³¹).

### 1040 · Titles, and play on click
Titles up to 80 characters, cleaned of invisible bidi and zero-width controls (they can make a
file name read other than it is). A click on a take plays it, with a switch to turn that off.

### 1041 · The Collection
A fourth tab: every take as a tile or a row; search with `*` and `?`; filters by what a take is
(generated, imported, regenerated, re-rendered) and what is made from it; workspaces, as SUNO
has them, with the one in hand in the header (new takes land in it); many takes at once
(favourite, add, hide, ZIP export in FLAC or WAV); the trash in the page (`trash/DATE/TAKE`),
given back until emptied, emptied by itself after 7, 14 or 28 days only when chosen.

### 1042 · Like, dislike, favourite
In the player and on every card; "All Workspaces" for the whole library.

### 1043 · Text profiles
A pasted text made ready to read: replacement rules in order (literal or regular expression),
then the shape: `[Intro]`, `[Verse]` at blank lines, `[Interlude]` after a long paragraph, up to
10 000 characters. Built in: plain reading, and LCV (from Viktor's own bash preparation script).
Edited with a live preview in the Writer tab; kept in `presets.json`.

### 1044 · A note on every take
Viktor's own words on a take, in its card, the Collection and the sheet.

### 1045 · Ruach Studio
The name and the dove over a staff, in the header and the Engine room; Write becomes Writer;
the play buttons in the Collection follow the player.

### 1046 · Peek and sheet
In the Collection, a hover of 400 ms shows the style and the first lyrics; a click opens the
take's sheet in place. Create or Post only by choice.

### 1047 · The Writer's notebook
Documents of four parts: STYLE, LYRICS, NOTES (Markdown) and PARAMS (every knob of the form).
Both ways with Create: "Save to Writer" keeps the song as tuned, "Load into Create" puts it
back and puts the document in hand; takes made meanwhile are linked to it. Typing autosaves; a
sitting is one version; "Keep this version" keeps one by name; a version is read, restored or
copied as a new document. `KIT/writer/ID.json`; a deleted one goes to `writer/.trash/`.

### 1048 · The studio's own menu
A right-click on any take (or ⋯): play, Create, Post, sheet, like, dislike, favourite, note,
rename, workspaces, hide, Writer, copy, download, to the trash. Cards carry like, dislike,
favourite and Post; a Post button in the takes column. Tiles four across.

### 1049 · Rename in place
A pencil by the title on a card, a click on the sheet's title.

### 1050 · Workspaces renamed and deleted
Deleting asks what becomes of the takes: they stay unsorted, move into another workspace, or go
to the trash with it (sparing those in another workspace). Selected takes move between
workspaces.

### 1051 · Drawn player icons
Play, pause, previous, next, like, dislike, star after Lucide (ISC); no ring or plate behind them,
the icon itself larger.

### 1052 · Play-on stays in its zone
Started from the Collection, play-on and ⏮⏭ follow what its search and filters show; started
from the takes column, the column.

### 1053 · The player hears FLAC
`listen.flac` is written beside `audio.wav` when a take is saved (lossless, 70–74 % of the
bytes at 24 bit; 6.9 GB against 9.8 GB over the whole library), or at a take's first listen;
`/library/listen` serves it as a file, so seeking is native. Downloads stay the WAV.

### 1054 · Run the chain
One row above Post's steps: Debuzz (every YuE2 take; off for an import) → Upscale (optional) →
Remaster with the Remaster step's settings (432 Hz, LUFS, preset), then Artifacts and Spectrum on
the final file, the lyrics on the take, stems. One job on the GPU box, each step on the file the
one before made; the page only watches.

### 1055 · Debuzz frame from /props
The fold period is the model's own (`sample_rate / frame_rate`), not 1920 written in.

### 1056 · Karaoke timing
Whisper with word times (cached apart from the lyrics check) gives every sung word its moment, for
the lyrics shown with the song.

### 1057 · The studio's own dialogs
`heresy-dialog.js` instead of the browser's `confirm()` and `prompt()`: in the theme, keyboard first.

### 1058 · Collection details
Every dropdown in the studio's dress (no native arrow, a drawn chevron); a note is a mark at the
row's end, so cards keep one height; the card that sounds pulses; buttons say what they will do;
"Not in a workspace" as a place.

### 1059 · The datasheet and "Open in"
Everything a take was made with, as Create shows it, without going there; "Open in Collection"
brings the take into sight, flashed; the menu offers the other rooms only.

### 1060 · Progress in Post
A bar under every job in the tree and a floating card while the GPU box works; estimated from the
rates measured, since the lab says running or queued, not how far.

### 1061 · The tree's files from the engine
A file of a take's tree (`derived/…`) is served by the engine itself, with native Range: big ones
play and seek, where the lab's proxy failed.

### 1062 · The staff on white pages
As printed, in every theme and full screen; Full screen at the end of its row.

### 1063 · Train: LoRA adapters for YuE2
A wizard: a raw folder of `datasets/raw/` → its tracks (in or out, lyrics matched by version name
and cleaned to YuE2's sections, a style of their own) → the set (`datasets/prepared/NAME/`, 48 kHz
WAV + captions in AI-Toolkit's YuE2 form) → a kind of adapter (style, voice, language, artist) and
its knobs → the run. Underneath for now: Ostris' AI-Toolkit (MIT), one LoRA over both experts; the
engine loads its LoRAs as they are. The guide: `LORA-TRAINING.md`.

### 1064 · The player says why
A song that does not start says why: press ▶ (autoplay), the connection dropped, or the file
really cannot be played; an aborted load says nothing.

### 1065 · Dropdowns
The focused box keeps the field's colour (the theme's focus fill painted the whole box and its
`background` shorthand reset the chevron's geometry: restated); a dropdown in a row of buttons is
as tall as they are.

### 1066 · The run's VRAM peak
Sampled every 5 s on the run's own GPU, kept with the run: the figure the trainer's VRAM gate is
built on.

### 1067 · Epochs and history
A checkpoint per epoch, every one kept; steps rounded up to whole epochs. Every step into
`loss_log.db`; a card a run in Runs: its set, knobs, time, speed, VRAM peak, the flow loss and
`ar_ce` drawn, a warning when the AR learns the songs by heart, and its epochs, each one into
`loras/RUN/RUN-eNNN.safetensors` on a click (a hard link: no second copy).

### 1068 · The listener
`lab/listener.py`: Qwen2.5-Omni-7B (its thinker only) writes a line of style tags a track, a draft
for the captions; 18.3 GB at bf16, 42 songs in 6 minutes.

### 1069 · The instruments cheat-sheet
The ♪ beside the Style prompt: 174 instruments the probes asked YuE2 for, by family, with home,
sound (en, ru) and the words for a style; a click puts a name into the style, ▶ A / ▶ B play its
60 s probes. The ear's verdict per row: heard (kept in the workspace "Instrumental Probe"),
questioned (a flag of the author's), NOT IDENTIFIED IN YUE2 (red), not judged yet. The Writer's
assistant is told both lists.

### 1070 · Workspace locks
Right-click a workspace: Lock / Unlock Workspace Deletion, Lock / Unlock Tracks Deletion; a 🔒 by
its name. The lab keeps locked takes out of the trash and says so; the page will not delete them
for good.

### 1071 · Auto and Manual
The GPU memory presets went: the page guessed one from the knobs, and 24 and 32 GB differed only
by "Keep models loaded", so a 24 GB card showed "32 GB · more than this GPU". Auto fits the
backbone, context and VAE tiles to the GPU found; Manual leaves the knobs to you.

### 1072 · Runs in units of their own
A training run is the systemd unit `ruach-train-RUN`, not the lab's child: restarting the lab
killed its whole cgroup and the run with it. The lab watches the unit, finds running runs again
when it starts, and collects the LoRA when a run ends; the same name goes on from its last
checkpoint.

### 1073 · GTSinger
`lab/gtsinger.py` turns one language of GTSinger (CC BY-NC-SA 4.0) into a raw folder: WAV, lyrics,
and its own style (`NAME.style.txt`, which the wizard reads).

### 1074 · DAWproject
Download → DAWproject on a take: its mix and stems as 24-bit WAV tracks, the tempo and meter of
its score, for openDAW (File → Import → DAWproject…), Bitwig, Studio One. Packed into the take's
`derived/dawproject/` and served by the engine.

### 1075 · The DAW button
openDAW beside the studio in a tab of its own (`ruach-daw` unit, `tools/serve-opendaw.py` with the
COOP/COEP headers it needs); the address is a page setting.

### 1076 · The trainer's VRAM gate
Every run keeps the peak of its card; the need of a base is the largest peak measured with it. A card
smaller than that closes the Train button and says why, with the measured number; nothing is guessed.

### 1077 · The listener through llama.cpp
A GGUF listener (Qwen2.5-Omni-7B at Q8_0 or Q4_K_M with its audio projector) runs through
`vendor/llama.cpp` (`llama-mtmd-cli --mmproj`): 11.3 and 8.4 GiB instead of 18.3 at bf16, the same tags.

### 1078 · The listener in the wizard
Omni hears 120 s of every track of a set and drafts its style; the drafts are corrected in place and
written into the captions as "trigger, the track's tags. the shared line"; earlier drafts kept aside.

### 1079 · `fetch-heresy.sh --listener`
Q8_0, Q4_K_M or bf16, asked first with its size: a 7–22 GB download is never a surprise.

### 1080 · One environment
`.venv` in the studio's root for everything Python (the lab, the trainer, the tools); every script
names it.

### 1081 · LoRA strengths with care
The music half (AR) of an adapter capped at 0.75 (a score adapter excepted); a strength typed exactly
on a double-click (1081b: the field is wide enough to be read); an emptied knob shows its default.

### 1082 · Create's takes carry the Collection's marks
Likes, dislikes and workspace tags on the takes in Create's column, as in the Collection.

### 1083 · Our own trainer, stage 1
`lab/trainer/`: the YuE2 network and the Comfy-Org loader (int8 convrot unpacked exactly), a LoRA in
AI-Toolkit's key names, the training loop; exact against AI-Toolkit in float32 (`PARITY.md`).

### 1084 · The strength road
Each strength slider a road from green (safe) to yellow (its limit) to red: measured limits per
adapter (`sources.json` may set its own), stricter for adapters trained here; past the limit, said.

### 1085 · Two trainers
`training.py` runs `engine: ruach` (the studio's own, bf16 by default: nothing quantized) or
`ai-toolkit` (the reference); each in its own unit.

### 1086 · The trainer needs nothing of AI-Toolkit
`lab/trainer/cache.py` makes a set's latent cache itself (the VAE in float32, the MERT head's codec
tokens); the trainer reads only that. `fetch-heresy.sh --trainer bf16|int8` fetches its base. The Train
room says by name what the chosen trainer lacks.

### 1087 · Babel in the score
The engine judges the score the music half wrote before any music is built on it: `M:`, `L:` and `K:`
present and clean, `Q:` a tempo, never three colons in a row (calibrated on the studio's takes: every
good one passes, every broken one is caught). A broken one stops the run; the page says why, which
adapters weighed on the music half and how far past their limits, shows what was written, and can
bring the strengths into the green. `score_guard: false` in a request lets a run through anyway.

### 1088 · Floors as fuses
A score may not end before 200 tokens (the broken ones ended at 40–54), the music not before 750
(30 s; a shorter requested length lowers it). Min and Max tokens are locked against a stray edit (the
lock opens them); every sampling knob is held inside sane bounds and says so when it pulls a value back.
An old draft's floors (32, 200) become the new ones.

### 1089 · The music half together
Stacked adapters add up: a strength may sit in its own green and the sum still break the score.
Measured on the takes: whole at 1.55, 1.75 and 2.25 together, broken at 2.5, 2.5 and 3.1. A road for
the sum under the adapters (green to 1.75, yellow to 2.25, red past it). Plan score only clears a score
already in the field instead of refusing.

### 1090 · The Train room on par
Live runs on top (progress, time left, speed, both losses); the steps in a row as in Post, one open at
a time; Telemetry: tiles, both halves' curves with what they mean, a cursor reading, the epochs (into
`loras/`, out of it, or downloaded under their `loras/` name); every run a card in a column (Active,
All, Archived, Trash; archive, delete to `trash/training/` with its adapters asked about, restore,
delete for good). The player steps down to a strip in this room; what plays plays on. The lab's proxy
passes adapters over 100 MB.

### 1091 · Which card does what
Engine → GPUs: every card with its memory and what runs on it now; the studio on one card (`start.sh` takes
it from `user/gpus.json` at its next start; a button restarts it when it is idle), training only on the cards
given to it, the lab's other jobs (listener, Whisper, stems, remaster, upscale) on theirs. While a run trains
on the studio's own card, a synthesis does not start: the page says why and offers Train. Defaults: the studio
on GPU0, training on the other cards (on GPU0 too when it is the only one), jobs on all. The Train room's
start dialog says when the run may take the studio's card. In the Telemetry, the reading under the cursor has
a line of its own, so the block keeps its height.

### 1092 · A short bar
After the workspace only day/night, Save, Clear and the DAW; the card and its memory, the model, themes,
Open, examples, Unload and the Engine behind the ☰, each with its words. The ☰ is not a menu of the old
kind: the menus it holds (examples, the themes) open inside it.

### 1093 · The epochs worth hearing first
In the Telemetry, green: the first epoch whose sound loss has settled (within 15 % of the run's span above
its floor), the one with the lowest sound loss, and the last before the music half knows the songs by heart
(ar_ce under 0.3); said as a guess read off the curves, the ear decides. The epochs in loras/ are amber with
their ✓, green ticks under the curves for the candidates.

### 1094 · The server log in every room
Right above the player, 600 px wide: folded to one line (the last thing the engine said, in its colour),
unfolded to ten with Follow, Copy and the way to Engine's whole log; the same stream, not a second one.

### 1095 · An instrumental score adapter with words to sing
A score adapter that plans instrumentals, above 0.5 in a mode that writes a score, with lyrics to sing: said
in the LoRA block (measured at 1.00: one note in 127 vocal bars, the music looping on two bars). Low, 0.3–0.5,
for a sung song (Viktor, by ear).

### 1096 · The guide, in the studio
`docs/GUIDE.md`, room by room, is also the studio's own guide: the **?** in the bar (and Guide in the ☰) opens
it as an overlay on the room you are in, one tab per room, its stops on the left, pictures large on a click.
The lab serves `docs/` at `/lab/guide/`. A browser that has never seen the studio gets it by itself a minute
after the start, once. The pictures: Viktor's day theme at 1920×1080, crops at 125 %; the Kit's screenshots
went to the trash.

### 1097 · Five rooms with names
Creator, Writer, Refiner (was Post), Librarian (was Collection), LoRA Trainer (was Train); Viktor's names,
02.10. The words on the page follow; the tab ids and the stored settings stay as they were.

### 1098 · The Librarian says what it holds
The heading names the collection open (*Librarian › Fosforida*) and counts it: takes (and how many shown),
hours, liked, disliked, ★, with a note, how they were made, and how many sit in the library.

### 1099 · Themes to work in
53 → 22: Viktor's two, the classic editor themes and the quiet ones; the 31 loud, glossy and novelty ones are gone
(their archive too, by Viktor's hand). Families: All, Favorites, Classic, Soft.
"Not a beauty salon but a working tool: clear and elegant" (Viktor, 02.10).

### 1100 · Starter sets, Forge, a proper ?
- **Starter sets** in the LoRA Trainer's Material step: GTSinger joined into songs, Russian (one alto, 148 tracks) and
  English (two altos and a tenor, 514), each whole and as a 100 MB slice, on Hugging Face
  (`goldhub/Ruach_Studio_Starter_Sets`, CC BY-NC-SA 4.0 like GTSinger). Fetched only after the size and the terms
  are shown and agreed, into `tmp/starter/` and into `datasets/raw/` only when whole (`lab/starter.py`). The two
  slices also travel with the code in `datasets/raw/`; the rest of `datasets/` stays home (gitignore).
- **Forge**, not Forge, in every word of the page and the lab: the machine's public name (Viktor, 02.10).
- **The guide's ?** is Font Awesome 4.7's question mark (SIL OFL 1.1), drawn like the bar's other icons, also in the ☰.
- **yt-dlp** in the lab's requirements (instrument sets from long recordings); ffmpeg and node said as system needs.

### 1101 · Speed, selection as in Plasma, ranks said
- **The player's speed**, 0.5× to 2×, the pitch kept; kept like the volume (a new source would reset it: both
  rates are set).
- **The Librarian selects as a file manager does** (Viktor: "повадки, как в Плазме под Кедами"): once a card is
  checked, a click anywhere on another checks it (Shift: the range); a drag on the empty space draws a band that
  checks what it touches, Ctrl+drag from anywhere and adding to what was checked; the page scrolls on at the edges.
- **Move to** beside the workspaces' pins in a take's menu; on a checked card, for every checked take.
- **The note icon** lost its own tooltip: the hover card already shows the note.
- **Ranks said where they are chosen**: beside the trainer's rank, its share of the weights it adapts and its size
  (measured on YuE2: 224 matrices, 2048 wide, 1.41 B weights a half; r16 1 %, r64 4 %, r128 8 %, r256 17 %); the
  field stops at 128; *How to choose ›* opens the guide at its new stop on ranks and the other knobs.
- **The guide**: YuE2 decides when an instrument comes in (the seed decides a lot: hear several); an instrument that
  plays but not as a live one is the work of an instrument LoRA; both in the troubleshooting too.

### 1102 · openDAW out, the way out of the studio in
Viktor: web DAWs are not the way. openDAW is gone (its unit, its clone, its server; install-units.sh removes the
unit where it was installed). The DAW button opens the way out: the mixed track as it is, or the whole take into
the user's own DAW, where the rest happens outside the studio; nothing comes back in. REAPER first, Waveform next,
others by pull request. `lab/dawbridge.py` finds them on the studio's machine without starting them (REAPER's
version from its whatsnew.txt, Waveform's from dpkg); a DAW on another computer is named by the user. DAWproject
(Bitwig, Studio One, Cubase) stays in a take's menu.

### 1103 · Pins, and a strip that never moves the cards
Above the Librarian's grid a strip of fixed height: the place's pinned takes (four at most, in their own tone;
right-click → *Pin here*, × to unpin; kept in collection.json, renamed and deleted with their workspace), and the bar
of the checked in the same place when something is checked: the cards stay where they were. Search, sort and the
view moved up into the heading line beside the counts (Viktor: it stood half empty).

### 1104 · The take as a REAPER project
`lab/rpp.py`, from the DAW landing (*Export the take*) or a take's menu (Download → REAPER project): a ZIP with
TITLE.RPP beside audio/: the mix (muted when there are stems) and every stem on its own track, the score as MIDI (the
page writes it from the ABC, the lab packs it; one track a voice), the tempo and meter the way REAPER itself saves
them (TEMPO and the tempo envelope's first point), the lyrics as empty items carrying each line and the sections as
regions when Whisper has timed the take, the recipe in the project's notes. Checked by REAPER 7.81 itself, not only
written: a Lua script opened the projects under a virtual display (Xvfb, its own config file) and reported 71 bpm in
2/4, the stems, 577 and 398 notes, the regions. REAPER applies the tempo map a few UI cycles after loading: asked at
once it says 120 (a measurement error of ours, first taken for a fault of the file).

### 1105 · Pinned, whole names, favourites in step, a glass player, gold checks, keys
- **Pinned** on the Librarian's left: every take pinned anywhere; an unpin is seen at once (a far lab answers later).
- A workspace name the column cuts is shown whole over the grid while the pointer is on it; the column keeps its width.
- A favourite set in the player, on a card or in a menu shows everywhere at once (the player's star used to wait for
  the next reload of the cards).
- The player is 20 % see-through, the page blurred under it; the speed box no longer eats the waveform.
- Checkboxes and radios in the theme's colour, never the browser's blue: `--check` where a theme names one (Viktor's
  two: dark gold beside the brick), else the theme's accent.
- The guide's own tab **Shortcuts & tricks**, read from the code: every key and mouse gesture the page answers.
- README: FEATURESET and an honest table of where Ruach Studio's YuE2 beats SUNO and where it does not;
  OSEM (say it: awesome) · Open Source, Engaged & Musical (Viktor kept this one; OSMGSU went).

### 1106 · The player of fosforida.quest
Viktor's own player (WEBSITES/fosforida.quest, Player.astro) with everything of ours inside, drawn by our own canvas
(no wavesurfer): the waveform across the whole bar; under it a cover tile (one hue from the take's name, until covers
are drawn), the title and the style's first words, 👍 👎 ★; shuffle, ⏮, play, ⏭, repeat (off · the list · this take,
marked 1), both new; the time, play-on-click and play-on as icons with tips, the speed, the volume, the state. Every
play, pause, previous, next drawn as a thin outline (Lucide's shapes, ISC), the cards' too: "легко и не удушающе".

### 1107 · The guard of the line
`heresy-net.js`: the round trip to the studio every 20 s (the engine's /health, the middle of five), beside the
server log (*Forge · 85 ms*; *here* on the same machine). Likes and dislikes join pins and favourites: seen at once,
confirmed by the studio, taken back when refused. Measured 02.10: the laptop on a phone's line through the VPN,
0.3–0.9 s a round trip; the engine itself, while rendering, answers /health in 2–6 s: the page's lag then is the
engine's, and the marks no longer wait for it.

### 1108 · Mass actions as in Plasma
Ctrl+drag turns over what it crosses (a second pass unchecks); 👍 👎 ★ on a checked card, or on the bar of the checked
(👍 👎 new there), act on every checked take, and take the mark back when all have it; taking several out of a
workspace asks first (the trash always did).

### 1109 · No CUDA_VISIBLE_DEVICES for the engine
Viktor: most have one card; who has more knows the kitchen. start.sh no longer sets it; a studio card other than
the first is named to the engine as GGML_BACKEND=CUDAn (CUDA_DEVICE_ORDER=PCI_BUS_ID keeps n = nvidia-smi's); the lab
reads either, and neither means the first card. Measured before: the engine computes on CUDA0 alone, but opens a
context of 256 MiB on every visible card as it lists them (the page asks): on a three-card machine 512 MiB of the
training cards go to the studio. The lab's own jobs still get their card by CUDA_VISIBLE_DEVICES, one each.

### 1110 · The Writing room says where its words come from
A line at the top of the room: the writer (the chat server under Engine, or OpenRouter), its address and model, and
whether it answers, checked on entering the Writer; red when it does not, with what to do. The room stands first in
its column. (02.10: neither vLLM on Forge, 8008 nor 8009, was running: the room was silent about it until asked.)

### 1111 · The player, lighter still
No ring round play; the speeds with two decimals (0.50×…2.00×); the state a dot without words (the tip says them),
larger, beating while a take plays, 60 % see-through otherwise; shuffle, repeat, the skips, the toggles, the speed,
the volume, the marks and the time faint until the pointer comes. Ours on top: the system's media keys, a headset's
buttons and the desktop's media panel drive the player (Media Session); the pointer over the waveform shows the time
a click would jump to; ← → seek 5 s (Shift: 30 s), M mutes; a click on the total shows the time left.

### 1112 · The GPU guard, and services that always come back
`lab/gpu_guard.py` (Viktor: "жёсткий сторож с фолбеками, во избежание OOM"): a card is given to the studio's work
only with at least 70 % of its memory free and no other program on it; a vLLM or anyone's own run keeps the card out
whatever it leaves. The studio's own processes are known by running from its folder. The lab tries the role's cards
first, then (for its jobs) any card that passes; training stays on its cards, and a card named by hand passes the
guard too; none will do: refused aloud, card by card. start.sh picks the engine's card through it and says so.
Proved 02.10 with a stranger's CUDA context on GPU1: refused, by name and pid. The units: Restart=always,
StartLimitIntervalSec=0: up again after any fall, without end. The root's systemd/ is now the git copy (the old one
still carried openDAW's unit). docs/FINISH-LINE.md: the living list of what is left.

### 1113 · The guard as a laptop needs it; Unload in the bar
Viktor: on a laptop the desktop's own (X11, a browser, CopyQ, GoldenDict) keep a quarter of the card busy and are
legitimate; banning the card for them would leave the studio dead for most users. Now a card closes only to a heavy
stranger (a program not of the studio above 2 GiB: a vLLM's kind) or when our job does not fit (start.sh asks 8 GB
for the engine's weights and their cache). What our trainer or our inference holds is ours: a stranger starting after
it and finding no room is not the studio's to prevent. Unload moved into the bar before ☰, tinted the theme's red at
20 % while a model sits in the card's memory, its tip saying how much. Omni's pass over the 60 s probes: 32 of 293
moved to "Instrumental Probe" (both answers agreeing); the rest wait for the ear.

### 1114 · This machine and private networks only
Viktor: most machines stand open to the internet on every port. The engine answers 127/8, 10/8, 172.16/12,
192.168/16, 169.254/16, 100.64/10 (carrier-grade NAT, Tailscale's), ::1, fc00::/7, fe80::/10 and IPv4 in IPv6
dress; anyone else gets 403 with the reason (RUACH_ALLOW_PUBLIC=1 opens it). The lab listens on 127.0.0.1 only
(LAB_HOST overrides): the page reaches it through the engine. 22 addresses tested both ways.

### 1115 · Tones and washes
Every theme gave flat colours only (no gradient anywhere in themes.css). Now each theme's accent and ground give a
ramp (--tone-1…4, --wash-1…2, --shade-1, mixed in OKLab so the steps look even) and the surfaces carry it faintly:
the bar and the rooms' heads a fading wash, the player a tone from the top, the cards a breath of the accent
(deeper hovered, checked, playing), pins and drawers their own shade; the waveform's played part runs from the
accent's brighter tone at the peaks to its own at the middle. In every theme, without a line added to any theme.

### 1116 · The API and the MCP server
One door for scripts, DAWs and agents on this machine and its network (Viktor: "не в интернет, а для локальных
сервисов машины или сети"): the engine's /api/… goes to `lab/api.py`. `/api/v1`: health (the engine, the lab, the
guard's verdict per card), songs (make one: style, lyrics, mode direct/full/melody, instrumental, duration, seeds,
adapters, the workspace it lands in), jobs (state, takes, cancel), takes (list, one with what it was made with, its
audio, marks, the REAPER project), workspaces (list; add, take out, move). OpenAPI 3.1 at /api/v1/openapi.json. A
token only when RUACH_API_TOKEN is set, and only of callers not on the machine. WAV 24 by default, as the page asks
(the engine's own default is MP3); the REAPER and DAWproject exports take whatever audio a take has.
`extras/ruach-mcp.py`: the API as an MCP server (generate_song, job_status, cancel_job, list_takes, get_take,
mark_take, list_workspaces, file_takes, export_reaper, studio_health), the SDK's v1 and v2 both. Proved 02.10: a
client listed the ten tools and made a 15 s song through them in 9 s. The page now files only the runs it started:
a run from elsewhere (the API, another browser) used to land in whatever workspace the open page had in hand.

### 1117 · Lines that breathe
Viktor: "никаких 100% жёстких линий… всё должно дышать… Незаметная, но вездесущая". Every line of the page takes its
theme's colour at 40 % (`--line-a`, `--line-strong-a`), the accents' at 60 % (`--amber-a`); a hover still sharpens a
line, and the keyboard's focus rings keep their full strength (to be found). The search field is a field like the
others (it had the browser's raw border), as tall as the sort beside it.

### 1118 · The cloud, the rubato, one light
The waveform is one blended cloud instead of bars: the peaks as a smooth envelope, mirrored, drawn in three soft
layers (haze, body, core), the quiet lifted a little; drawn once per song, size and theme into two sprites, cut at
the playhead each frame. Its strengths come from `HeresyWave` (the console: `HeresyWave.set({rest, restNight,
played})`, for Viktor to try values live). The card that sounds glows with the song's own peaks (rubato): quick to
rise, slow to fall, measured against the song's own quiet and loud. The Librarian's cards share one light fixed to
the window, falling from the top left; a state (hover, checked, playing) is a tint over it, not a second light.

### 1119 · The logo
From Viktor's draft: RUACH · the winged woman · [STUDIO]. She is white, out of a cloud in the accent (darkened a
quarter: a dark cloud by day, embers by night) that reaches over the words' inner ends; RUACH in Montserrat Black,
STUDIO at 460 (OFL, turned to paths). In the bar's dead centre, out of the flow; she descends below the bar's edge (a
tab cannot draw above the window). Too narrow for the words: the woman alone on her square, then at the bar's start.
The icon: her on a full square of the cloud, the outer feathers cut by its edges; the favicon is its 64 px. The
logo lives on a clock of its own, ten steps a second (SMIL cost a quarter of a core, measured; this a fifth of
that), still for those who ask for less motion, asleep in a hidden tab. Sources in `heresy/brand/` (make_logo.py,
make_icon.py, Inkscape copies). `rebuild.sh` now does it all: patches, page, server, and the restart when idle.

### 1120 · Artwork for takes
Viktor: "просто иконка в плеере, в карточке и в mp3 файле… спойлер на багажнике нашего Руах-Феррари". Asked for in a
take's menu (*Draw artwork*), never on its own: Qwen3-4B-Instruct-2507 writes one picture prompt from the take's style
and words, CyberRealistic XL v10 (an SDXL finetune, CreativeML Open RAIL++-M) paints it once, 1024 px, 28 steps,
kept at 768 px (`lab/art_job.py`, a process of its own on a card the guard gives; 14.2 GB of VRAM at the peak, about
27 s). It shows in the player's square, under a card's play button, in the desktop's media panel, and in the MP3
download as its front cover (the engine makes the MP3 again when the artwork is newer). The API: GET and POST
/api/v1/takes/NAME/artwork; the MCP server's eleventh tool, draw_artwork. The models: `artwork/` at the root, from
`heresy/fetch-heresy.sh --artwork` (14 GB, asked first).

### 1121 · The rooms open the bar
The engine's lamp leaves the bar's start and its word: the rooms come first; the lamp alone follows the workspace,
its words in the tip.

### 1122 · REAPER inside
`extras/reaper/`: three ReaScript actions (Lua) that reach the studio through its API, from its own machine or another
on the network; the way stays one way (out of the studio). *Generate here* makes a song and lays it on a new track at
the time selection (the lyrics from the selected items' notes, which the exported project keeps); *Bring a take*
finds one in the Librarian by words; *Settings* holds the address, the token, the workspace. Checked by REAPER 7.81
under Xvfb against the studio on another machine (`heresy/tools/reaper-harness.lua`): 20 s made and placed in 12 s.

### 1123 · The DAW window finds its take; the piano keys
The window offered nothing with a take playing ("open a take first"): it now takes the one open in the Creator, else
the one in the player, else the one checked in the Librarian. The DAW button is a piano keyboard (Viktor: «🎹, так
понятнее, чем иконка настроек»), drawn as a solid glyph like its neighbours.

### 1124–1128 · The Librarian's details
The datasheet's lyrics reach down to where the parameters end; the Takes column has the Librarian's filters in every
room (liked, without the disliked, with a note, the hidden ones too, shown faded with *Show again* in their menu);
the workspaces column scrolls on its own above the player and the Takes column past the floating log; the datasheet
shows LoRAs as a take keeps them (music and sound strengths) and sliders with theirs.

### 1129 · The Refiner's progress up top
What runs shows where the eye already is: in the room's head (always in sight), at the top of the step's own block,
as a beating dot on its tab, and first in the tree (the tree grows upward). The floating card that sat over the log
is gone. Each step shows what it made for the take (chips that find it in the tree), and the step open lights its
own branches there.

### 1130 · The page from disk; one build script
Viktor: «Система Студии для локальной машины и максимум локальной сети. Нахера нам билдить gz?» The server reads the
page from disk at every load (RUACH_PAGE, set by start.sh, which also builds it when it is missing or older than its
sources): a page built anew shows on a reload, with no server build, no restart, no gzip. The embedded copy is only
the fallback, refreshed when the server itself is built. `build.sh` is the one build script (the page; the server
when its C++ changed, then the restart when the studio is idle; `--patches`, `--server`, `--no-restart`);
`build-page.sh` and `rebuild.sh` retired.

### 1131 · The score in the datasheet
Drawn and open, its ABC under it (the folded block of 1126 showed an empty fold for Direct takes). A Direct take writes
no score: *Write it from the sound* asks the engine's transcriber (SheetSage2) on the take's own audio; the sheet
watches that job itself (the page never adopts it, so the Creator's cover form is not touched), and the lab keeps
the score beside the take (`score-from-sound.abc`).

### 1132 · The Refiner's own column
In the Refiner the Takes column holds what was refined, the newest refine first (the lab's `/refined` index; a running
job counts as now); *Refined* beside *Favourites* turns to every take for a new one. F5 in the Refiner brings back
the take it was refining (Viktor: «обновил страницу и потерялся полностью»).

### 1133 · No private address; the Writer on OpenRouter by default
start.sh prints the machine's own address (the first `hostname -I`), the chat presets name this machine (vLLM :8000,
LM Studio, Ollama), the docs and the MCP and REAPER examples say 127.0.0.1. With no chat server set, the Writer
starts on OpenRouter (Viktor: Qwen and DeepSeek): DeepSeek V4 Pro by default, quick picks DeepSeek V4.1 Flash,
Qwen3.8 Max, Qwen3.8 Flash (ids read from OpenRouter's list, 02.10.2026). Set ones stay as they are.

### 1134 · The DAWproject as full as the REAPER project
The score as note tracks (one a voice, the page's MIDI of the ABC), the sections as markers once the take is timed,
the style and the lyrics in its notes; checked against the format's own Project.xsd (xmllint: validates). Waveform 14
imports it, as Bitwig, Studio One and Cubase do; the DAW window's Waveform and Bitwig cards export it. Waveform 13 (the
newest on Linux) reads only its own .trkarch archives: their binary project file waits for a check in Waveform itself.

### 1135 · Undo and the keyboard in the Librarian
As a file manager has them: Ctrl+A checks every take shown, Esc none, Delete sends the checked to the trash (asked),
Ctrl+Z gives back the last change. A pill above the player says what was done, with its Undo, for ten seconds: a move,
adding to or taking out of a workspace, hiding or showing, a pin, a mark on several takes, a trash move (the takes
come back from today's folder of the trash with their workspaces and marks). Never while typing or with a window open.

### 1136 · 2.0.0-alpha, said in one place
`VERSION` at the root; start.sh says it in its first line, the API beside its own (`/api/v1` → `studio`), the Engine
room's About beside the name. `CHANGELOG.md`, `INSTALL.md` and `INSTALL_by_LLM_Agent.md` at the root.
`heresy/tools/make-release.sh` assembles the public tree: the root as the repository, only what the studio's git
repositories track, yue2.cpp with every patch as a plain folder, the patches kept as text (the built page's binary
diffs out: 54 MB → 2.2 MB), the places the studio fills empty, and a scan for anything of this machine.

### 1137 · What a fresh install found
The release cloned into a clean folder and installed as a stranger would: `lab/requirements.txt` named UniverSR by a
relative path pip cannot take (it worked here only because it was installed by hand long ago); `install-venv.sh` now
clones it at its tested commit and installs it, and no longer rewrites the repository's lock. `build.sh` configures
cmake itself on a fresh clone (CUDA, flash attention, the card's own architecture); its words are English for
everyone. Then: venv 1:33, models checked (missing 0), the engine built in about two minutes, the services up on
ports of their own beside the running studio, a 20 s song made through its API and filed in its workspace.

### 1138 · The original in the tree; every version compared
The take is a node of the Refiner's tree like its branches (it plays, its FLAC downloads). *Compare all* (or
*Compare* on any branch) opens every version in one player, as SUNO switches versions: the original, then debuzz,
remasters, upscales, stems; a click or its number (1–9) plays it from the same second, Space plays and pauses, ← →
five seconds. Each version is its own audio element: the one coming in seeks and starts before the one going out stops.

### 1139 · Waveform 14 at least
Viktor: «Обновляемся на Waveform14 и закрепляем как минимум». The DAW window and the guide ask Waveform 14 or newer (it
opens the studio's DAWproject); Waveform 13 is no longer supported.

### 1140 · The guard's verdict in Engine → GPUs
Each card's row says what the GPU guard says of it this moment: *open*, with what is free (the desktop's small programs
named in the tip), or *closed* and by whose service (a program not of the studio holding more than 2 GiB).

### 1141 · Whisper on the CPU when no card can take it
The lyrics check and karaoke timing used to be refused when the guard gave no card; now they run on the CPU (int8, 16
threads) and say so in the result. Measured: 15 s of audio heard in 7.9 s after a 6.4 s load. Stems stay on a card (on
a CPU they would take tens of minutes a song), refused aloud with the card's reason.

### 1142 · Narrow windows and phones
Measured at 390 and 768 px in every room: the player fell below the screen under 1150 px (an old rule of the Kit made it
sticky without a bottom), the floating log sat where its controls are, the room heads' notes did not wrap, the
Librarian's tools and the Refiner tree's rows ran past the edge. Now the player is fixed at every width, the log sits
above it (and steps aside on a phone, where Engine has the whole log), the heads wrap, the tree's rows fold (the
player across, the buttons under it), and a phone's player keeps the transport and the time (its own keys do the
volume). Nothing runs past the edge in any room at 390 px.

### 1143 · The line's time, not the browser's queue
The line guard (1107) timed its ping from the call to the answer, so a ping queued behind the browser's six connections
a host (the log stream, the audio, the polls during a render) read as 2–6 s of distance. It now takes the request's
own time on the wire (Resource Timing: its start to the first byte). Measured from the laptop over the VPN: 186 ms.

### 1144 · The Refiner on the API
`/api/v1/takes/NAME/derived` (the tree, every file with its url), `/file?path=`, and the steps: `stems`, `debuzz`,
`remaster`, `upscale`, `lyrics-check`, each answering 202 with its job while it runs. The MCP server's twelfth tool,
`refine_take`, waits for a step and returns the tree. Proved on a test take: a debuzz started, landed, its file fetched.

### 1145 · A melody from REAPER, the score of the song
*Generate here* takes the selected MIDI items as the song's melody: their notes in the time selection (or the items'
own span) go to the studio as one standard MIDI file, a track per REAPER track from the top, the project's tempo and
meter there, the key when a take has REAPER's key snap on a major or minor scale. The lab reads it as the Creator's
MIDI import does (`lab/midi_score.py`, a port of `HeresyAbc.fromMidi`) and checks the score with YuE2 Studio's own
reader (`lab/abc_tools.py`, Apache-2.0, as it is): it must parse and give back the very notes it was written from.
On the API: `midi_b64` (with `midi_key`, `midi_ins`) on `POST /songs`, and `POST /score/from-midi` to see the score
first; the MCP server's `generate_song` takes `midi_file`. The song is made in melody mode, placed where the melody
starts, and the new item's notes say how the melody was read. Measured:

- **The port against the page**: 3,336 cases (the Library's 17 scores through the page's own MIDI writer, 400 made-up
  files with odd grids and meters, chords, overlaps, running status, SysEx, no tempo, broken key signatures, each read
  with eight keys): the same score byte for byte, or both refusing for the same reason. Different only where meant: no
  key in the file (the page writes C, the lab guesses; with C asked, the same) and a file cut short (the lab refuses,
  the page read past its end).
- **A bug of the page it found**: after a SysEx event the page's reader landed one byte short (`p += rv()` read `p`
  before `rv()` moved it), and every time after it was garbage; DAW files often open with a GM reset. Fixed there.
- **The key from the notes** (Krumhansl's profiles, each pitch weighed by its length), on the Library's 17 scores: 14
  the key written, 1 its relative (the same signature), 2 one accidental off. C, the page's default, is right once.
- **REAPER, end to end** (7.81 under Xvfb, the harness writing the melody itself): 8 bars on *Lead vocal*, chords on
  *Piano*, a 19 s song placed at the selection's start 10–14 s after the click; all 20 notes reached the score as
  written (a dotted one, one held over a bar line). A waltz (3/4 at 90, no time selection) placed at the items' start.
- **Who carries the tune.** Each take written back from its sound by the transcriber and compared with the line given
  (the line a whole tone up as the control: 35% at most). The score steers every take; but the chords' top notes as the
  instruments' melody let an instrument take the tune: one melody, an accordion waltz style, seeds 11 · 22 · 33 —
  instruments 90% · voice 95% · instruments 95%; the sung line alone — voice 90 · 90 · 100%. A gusli ballad style
  kept it in the voice either way (4 of 4). So a chord track gives no Ins line here (`midi_ins: keep` keeps it, as
  the page does); its notes still count for the key.
- **The transcriber's bar 1**: in 5 of 16 takes the score written from the sound began about a bar early (2.2 s; a
  bar is 2.4 s), while a pitch track of the vocal stem heard the voice on time (E G A B in bar 1, as given). The
  datasheet's *score from its sound* can be shifted by a bar.
- **A score the API dropped**: `abc` with no mode went to the engine in direct mode, which makes the music without a
  score, and nothing said so. Now a score picks `melody` (no chord symbols) or `full` itself; `direct` with a score is
  refused, with the reason.

### 1146 · The Kit's own tests, green again
The Kit's page test (`tools/cdp-console.mjs`, against the mock) and its real-server test (`tools/test-real.sh`, the engine on
the CPU and a 1 s song) had not run since the studio grew out of the Kit: 166 of 203 page checks passed, then the run stopped.
Each failure was read against the page and settled one of two ways: a design of ours, the check rewritten with its HERESY
number (the bar, About, Auto and Manual, 22 themes, the dot of the player, the Refiner's group, Viktor's sampling defaults,
the example menu, the studio's own dialog, LoRA halves and caps, the retired idea writer skipped with its reason), or a
fault, mended. Now: **314 passed, 0 failed, 8 skipped** (page) and **6 of 6** (real server, its page 14 of 14).

What they found, besides the SysEx of 1145:
- **A long style hidden after Retake, Reuse, Open and Edit and re-render.** These fill the form after a fetch, when the
  click's own refit has run; the style box kept its old height with `overflow-y: hidden`, so the rest of the style was cut
  off with no scrollbar until the next click (text set by script: the box stayed at 87 px over 936 px of it). They now
  refit every box: after Retake, a take's 838-character style comes back at 199 px, scrolling.
- **The score's head ran past the take column** at 1280 px (its last button 54 px out): it wraps.
- **Ten controls of the form, the take, the bar and the log had no help**: tips written from what each does; a tip on a
  control's own label (the MIDI Import button's) counts as its help.
- **The real-server test reached the studio's own lab** (its server forwards /lab/ to 41870): on its first run tonight its
  page loaded Viktor's page settings and saved them back with its own Creator draft and the Legacy VAE. Restored from the
  lab's one-step-back copy within minutes (the damaged file kept beside it). The test server now gets a lab port nobody
  listens on, and the test's proof that it touched nothing covers `user/` too.
- **The mock had grown stale**: the Kit's sampling defaults (a default song read "lowest" and "high" on our sliders) and no
  `/library/listen`; both as the engine has them now.
- **The test browser plays muted**: never into anyone's speakers, and on a machine without a sound card an unmuted headless
  Chrome's audio clock stands still.

The studio's own player (play on click, play on) has a check of its own, `heresy/tools/check-player.mjs`, on a fresh page:
late in the Kit's long run a take sits fully buffered at `readyState` 1 and never plays on (not understood yet). The Kit's
FLAC test needs the reference `flac` and `metaflac` (not on Forge); its downloaders test passes (14).

### 1147 · The logo loses only its words; FLAC needs nothing more
Viktor, 03.10: the wide logo approved; the square for the favicon, not for the bar: «Для бара возьми главный логотип,
убери из него текст и сделай его 1.4:1… Так тень Девы останется прежней и лого при скейле страницы будет терять
только свой текст». `heresy/brand/make_compact.py` cuts the bar's copy to 1.4 : 1 around her, its own height kept, the
words out and the cloud fading at the sides (no hard edge); in the page it takes the square's place from 1659 px down,
at the same 62 px. Measured by day and by night at 1920, 1500 and 1300 px: she is drawn at 42.08 × 57.21 px in the full
logo and in the compact alike; the bar stays 52 px and one row (at 1100 px too). Inkscape copies, day and night, beside.

FLAC: the studio needs nothing more for it (the engine encodes it itself, the Refiner and the exports through ffmpeg);
`flac` and `metaflac` serve only the Kit's FLAC test, now that they are on Forge 18 of 18. README, INSTALL and the
agent's guide say so, with the tests and what each gives here.

The artwork upload carries the painter alone (6.5 GB, CyberRealistic XL v10 as diffusers, which its author publishes
on Civitai only); the prompt writer comes from Qwen's own repository, so the repo card lists it as not here.

### 1148 · The page learns languages; a tip for every control; out to a DAW from any take
**Languages** (Viktor, 01.10 and 03.10: English by default; Russian, Ukrainian, Belarusian, Greek, Chinese, Spanish,
Italian; no Hebrew: «не будем мучить интерфейс с перекладкой в RTL»). `heresy-i18n.js` translates the page as it is:
catalogs keyed by its English (`heresy-i18n-LANG.js`), text nodes and the title, placeholder, aria-label, data-tip and
alt attributes, looked up as they appear (a MutationObserver, only while a language other than English is on) and again
when the language changes; `{0}`… for the parts that change; nothing under `[translate=no]`, nothing a catalog lacks
(it stays English, whole). The choice is `yue2.lang`, mirrored to `user/settings.json` with every `yue2.*` key, so F5
and a cleared browser keep it; the head hides the page for the first pass (2.5 s at most) so a reload shows no English
first. The bar's two-letter button opens the languages, each named in its own words. The logo's words follow
(«В русском РУАХ СТУДИЯ, укр. РУАХ СТУДІЯ, греч. ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ, и т.п. но никаких spirit»): `src/brand/make_words.py`
sets РУАХ СТУДИЯ, РУАХ СТУДІЯ, РУАХ СТУДЫЯ, ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ, 鲁阿赫 工作室, RUAJ ESTUDIO, RUACH STUDIO (Italian) as paths
(Montserrat; Noto Sans for Greek; Noto Sans CJK SC for Chinese), the woman and the cloud where they are, a word never
wider than RUACH (the bar's breakpoints were measured on it); every language's logo also as files in `src/brand/i18n/`.
Three buttons read their own words back as data ("Inspect again", "Listen again", "Time again"): they read the English
now (`RuachI18n.en`). Russian holds the rooms and the bar so far; the catalogs come next. `heresy/tools/check-i18n.mjs`:
14 checks (a reload in Russian, the logo, attributes, later text, text the catalog lacks, `[translate=no]`, back).

**A tip for every control.** The 70 controls of the studio's own rooms without one: 40 tips for 42 of them, from what each
does in the code (the remaster's chain of filters, the trainer's options as `lab/training.py` reads them, where the
OpenRouter key goes); 28 say all in their label (a title, a search, a sort) and are listed as such in `help.js`. The page
test holds the rooms to it now (its skip became a check).

**The remaster says what it does.** The preset and the de-esser act on stems before the Debunker mixes them; on the take
or any single file it goes straight on, and both did nothing, silently. They are off there now, with the tip saying why;
the chain (which remasters one file) no longer names a preset and records no de-ess. «Fade out» faded in as well: it is
*Fade in and out*; Cleanup runs with a fade anyway, and its tip says so.

**Out to a DAW from any take** (Viktor: «прикрути Export to DAW… как лучше?»; on every take, refined or not: a DAW is a
refiner too). *Export to DAW* in a take's menu: REAPER project and DAWproject, the user's own DAW first, saying whether
stems go with it; Download keeps the take's own files. Ardour out (it opens no DAWproject); Bitwig's Flatpak found.

**The page is no document to select** (Viktor: «защита от случайного выделения текста мышью, и Ctrl+A только в полях
ввода»): text selects in fields, the log, the guide, notes and the take's id only; Ctrl+A works in a field one types into
and nowhere else (by the key's place, so in the Cyrillic layout too). Measured: a double click on a card selects nothing,
Ctrl+A outside a field 0 characters, in the style box its text.

**The Librarian and the bar.** In the tiles the check box went down into the play column, on the likes' line (the title
starts 48 px from the card's edge, one column narrower); the list keeps its one line. WORKSPACE leaves the bar with the
logo's words (from 1659 px down; «так бар продолжит дышать»); a room's name never wraps ("LoRA Trainer" did, at Viktor's
zoom); the browser's ResizeObserver note is no longer a red "Page error".

**The cheat-sheet** carries Viktor's verdicts: the shofar («Сделаны многократные пробы, но безуспешно. YuE2 не знает шофар»),
its v3 (B near a Yemenite shofar, a battle cry, no more), v5 (dross with a spark of heavy rock), the natural horn (not
like a horn), the bassoon (no such reed; both probes deleted); the shofar's probes are kept and listed with the prompts
they were made with, a click puts one into the style. The approved workspace is "Instrumental Probe" (to hear:
"… 60s"; to make again: "… FAILED, to REGENERATE").

Beside: the logo's sources in `src/brand/` (Viktor: «SVG файлы положи в проект в src/»), the root's `src` a link as `docs`
and `extras`, the release copying it; DAW marked experimental (README, guide, the DAW window), README with the three
DAWs' pages, trials and prices, every dependency, Viktor's machines; the OpenRouter calls titled "Ruach Studio" (were
"YuE2 Kit"); the Hugging Face check (the starter sets clean; in the models one `.gitattributes` of a mirrored repo, which
`upload-artwork.sh` now removes in the same write session that uploads the painter and the card).

Training (Viktor: «Ты вчера запускал тренировку адаптеров для Шофара и Дудука? Если нет, запусти»): not run yesterday;
now the **duduk** (`duduk-yt-r16`, GPU1: the 5 stretches of his source that do not repeat, 12.6 min, a duduk over a drone
to CLAP in every window) and the **shofar** (`shofar-yt-r16`, GPU2: 9 stretches, 37.8 min, chosen by his ear from 20
clips, where CLAP heard only worship music and pads and the listener said no to all but a few). Both ours, bf16, r16,
AR weight 0.5. A lesson kept: for an instrument YuE2 does not know, the machines that would sort its sound do not know it
either; the ear sorts.

Tests: the page 316 passed, 0 failed, 7 skipped (was 314/0/8); check-i18n 14/0; check-player 3/0; the real server 6/6.

### 1149 · The bar gives way by what it holds; the (i) drawn, not written; the instruments the styles named
**The bar** (Viktor: «даже при 1920×1080 WORKSPACE упирается в лого», with his screenshot). His Chrome is at about 110 %:
the page is 1741 px wide, and the right side came 14 px from the logo. A width breakpoint cannot see a workspace's long
name; `fitBar` measures: within 18 px of the centred logo the word WORKSPACE goes, then the workspace box narrows to
150 px; again on a resize, a language, the fonts arriving and a change of the workspaces. Measured with the longest
name: at 2560 and 1920 (100 %) the word stays (420 and 100 px to spare), at 1700 it goes (68 px).

**The (i)** of every help mark is drawn by CSS (`::before`), not written in the page: Chrome's reading mode, which Viktor
opened by chance, read «Model ithe backbone file» (the mark's letter and the hint glued), and a copy took the letter
too. All 72 marks: none written, all drawn; each keeps `role=img` and its "About …" for a screen reader. Reading mode
itself is the browser's: no page can switch it off (offered: the browser's right-click menu off outside fields and
links, Shift+right-click keeping it).

**The cheat-sheet's source** (`heresy/tools/instruments_src.py`) holds what 1148 wrote into the page by hand (Viktor's
verdicts, the kept probes' prompts) and writes the page's DATA itself (`--page FILE`): regenerated, the 174 entries
are byte for byte the hand-written ones.

**The instruments Viktor's styles name and no probe asked** («Самбука?»; read in `ALL STYLES — YuE2.md`): sambuca as his
styles name it (plucked strings of a hollow body) and as what it was (a small triangular harp, Daniel's sabbeka),
crystal singing bowls (the sheet had the metal ones), a whole string section (it had a quartet), birdsong, cicadas, a
rushing river and a waterfall (PARDES and "Я вернулась" lay nature under the music). The tsymbaly were there already
(the hammered dulcimer's tag). 14 probes as every probe60 (direct, 60 s, seeds 5101/6101 and 5102/6102) into his
to-hear workspace, each with a note as the others have. His ear's first word: the sambuca as his styles name it, to be
made again; as the triangular harp, kept in the pool. He heard darbuka-b play a darbuka and a sambuca in duo.

### 1150 · One row for the player where the logo is compact; the verdicts on the styles' instruments
**The player** (Viktor: «при скейле, когда лого минимальное, компактируем плеер, сдвигаю верхнюю часть с волной в базовый
ряд — перед кнопками воспроизведения»): from 1659 px down (where the bar's logo has lost its words) to 601 px, the
waveform moves into the player's row, before the transport: the take, the waveform, the transport, the rest. The player is
70 px instead of 124, and the page takes the height back (`--playbar-h`). Measured: at 1600, 1366 and 1100 px one row, the
waveform 643, 409 and 589 px wide and 40 high, left of the play button; at 1920 and on a phone (500 px) the two rows as
before. The waveform draws itself to its box, so nothing else changed.

**Viktor's ear on the new probes:** the sambuca as his styles name it fails; asked for as the ancient triangular harp
(sabbeka) it works; birdsong fails. In the sheet as his verdicts. His rule for making a rejected probe again: change the
style as well as the seed (a new phrasing, as sambuca-v2 found the sambuca where "sambuca strings" did not).

### 1151 · The peek in the corner; the trash takes every checked take; the duduk adapter heard
**The peek** (Viktor: «попап тултип при наведении на карточку перенести в фиксированный правый верхний угол? Так никому
мешать не будет»): a card's hover peek stands in the window's top right corner, 10 px under the bar, never over the cards
beside the one hovered. Measured on the real Librarian: 16 px from the right, its top 10 px under the bar.

**The trash, for every checked take** («При выделенных нескольких карточках Move to Trash пусть всё выделение убирает в
корзину»): on a checked card the menu's item reads «Move 2 to the trash…» and takes them all, with its undo, as *Move to*
did already; on an unchecked card, that card alone.

**The duduk adapter** (`duduk-yt-r16`, ours, bf16, r16, 1000 steps on 12.6 minutes of his source): the music half's loss
fell from 3.8 to 0.58 without learning the set by heart, the sound half's was lowest at step 800. Epochs 80, 160 and 200 in
`loras/duduk-yt-r16/`, and an A/B by ear in "LoRA A-B · Duduk": the probe's own prompt and seeds, without the adapter and
with each epoch. Viktor: «Дудук теперь у нас настоящий, в полном спектре»; the take he moved to the approved
"Instrumental Probe LoRA" first was the one without the adapter («ab-duduk-base-a отлично звучит»), so what the adapter
adds is for the epochs' takes to tell. A new workspace for that: "Instrumental Probe LoRA" (Viktor's). The kept shofar
probes, now among the approved ("Instruments Probe" renamed "Instrumental Probe"), say they are not a shofar.

### 1152 · A failed verdict stays failed; 💎 marks what goes public
**Failed is failed** (Viktor: «Пробы шофара в approved — это ложность… Добавляй эти треки в шпаргалку, но пометки сделай.
Это далеко не шофар. Tested, Failed. Other pipe/horn discovered.»). His rename put the kept shofar probes among the
approved, and the sheet showed «✓ kept» beside them. A verdict can now be a failure (`FAILED` in
`heresy/tools/instruments_src.py`): the row is red wherever its probes stand, never "kept", and the Writer is told the
name is not played. The shofar and its seven phrasings carry his words; failed too: the natural horn, the bassoon, the
sambuca as named, birdsong. The duduk, which has no 60 s probe and so read NOT IDENTIFIED, carries his word after the
A/B: a real duduk, in full spectrum, with its own adapter. Read on the real sheet: 8 shofar rows red with his words, the
sambuca as the triangular harp «✓ kept · Works».

**💎** (Viktor: «добавляю в approved воркспейсы, которые мы добавляем в репо и для подтягивания в свежий сетап студии —
💎 эмоджи»): a workspace named with 💎 first is approved and published. The sheet finds its approved workspace with the
💎 or without it.

### 1153 · The page in Russian
`heresy-i18n-ru.js`: 999 entries and 18 patterns, the page's own words taken from it as it stands (the strings were
extracted from the page and numbered, the Russian written by number, so no English key was typed again and none can
miss by an apostrophe). Every room, the bar, the player, the Engine, the drawers' descriptions and the long tips of the
form (sampling, guidance, the solver, the style and the lyrics). Read on the page in Russian: of 1 202 strings 117 stay
English, and they are names and data (fonts, models, LoRAs and their files, addresses, the mock's takes).

The terms, for Viktor's word: the rooms Творец · Писатель · Огранщик · Библиотекарь · Тренер LoRA; take = дубль;
workspace = пространство; score = партитура; seed = сид; Debuzz = Антигул; Refine = Огранить; Retake = Новый дубль;
Reuse = Взять в форму; the user is «вы»; no word of the root «раб» (a build check refuses one: «Доработанная» became
«Настроенная»).

The core learned three things on the way: a key matches whatever line breaks and indents the page source gave its text;
a textarea's placeholder and title translate while what is typed in it never does; and what the user wrote or the
machine said keeps its words whatever they are (take titles and styles, notes, workspace names, the logs, the Writer's
documents, the cheat-sheet's style words and probe prompts). A pattern meant for the Trainer's summary («style · rank 32
· bf16») caught the LoRA cards and half-translated them; it now knows the four kinds by name.

### 1154 · The studio is its own canvas; the artwork beside the title; probes of two minutes; Russian on «ты»
**No browser menu** (Viktor: «убрать браузерное меню вне полей и ссылок — абсолютное ДА. По всей студии. Как в ComfyUI —
всё — собственный канвас как система в окне браузера»): a right click gives the browser's menu only in a field or on a link
(paste, copy, open in a new tab); elsewhere the studio's own menu or nothing. Shift+right-click still gives the browser's.

**The artwork** (Viktor: «не в кнопку плей, а справа от заголовка трека. Видишь, карточка испортилась?»): in the play
button it made the button 44 px and threw the tile's columns out. It stands now in the card's top right corner beside the
title, a link to the whole picture; the play button is the play button again (30 px, the check box under it). In the
list, a small one before the buttons. **The take's menu**: Move to above Pin here («подними над Pin»).

**Probes of two minutes** («YuE2 не успевает ввести инструмент»: the crystal bowls came in at the 30th second, a handbell
in the last one): every probe made again runs 120 s, titled probe120-, with more sections to fill, on a seed of its own,
its style made stronger (the instrument named from the very first second to the end, and what it does). 49 queued, the
duduk first: the 39 waiting in "Instrumental Probe FAILED, to REGENERATE" (only the letter that failed), the duduk, and
the shaman's instruments Viktor asked for («Шаманские инструменты подумай, якутский губной»): khomus (the Yakut jaw harp),
the Siberian shaman drum, morin khuur, igil, now in the sheet too. The sheet hears a probe120 before the 60 s one it
replaces. Verdicts: the cowbell approved but «не колокол, а электрогитара с реверб процессором»; the didgeridoo's B, «очень
под шаманский вибро».

**Russian, Viktor's terms**: take = семпл (every case), Reuse = «Взять за основу», the user is «ты» (phrases with their
verbs first: «пока ты их не сменишь», «куда скажешь»; then the words; a check refuses any «вы» or «дубль» left).

### 1155 · The artwork over the page; the peek over the bar; Redraw artwork
**The artwork over the page** (Viktor: «Клик открывает в новой вкладке. Сделай оверлеем. Не уходим из студии в другие
окна и вкладки, если не нужно»): the card's picture, the player's square and *Open the artwork* in the take's menu show
the whole picture over the studio, the player left free below it. ‹ › and the arrow keys walk the pictures of the cards
shown, ▶ plays the take whose picture it is, Space still plays and pauses; Esc, × or a click beside it closes. What still
opens a tab is what has to: the sites of the projects we stand on, the training's log, the score sent to the printer.

**The take's menu** (Viktor: «Для Draw Artwork, когда есть иллюстрация, заменяй на Redraw Artwork»): *Draw artwork*
while there is none; *Open the artwork* and *Redraw artwork* once there is (the submenu gone). The page asks the lab every
20 s, while it is in sight, which takes have pictures: drawn meanwhile (a batch, the API, another browser), they reach the
cards in place (nothing else repainted: a rename being typed survives) and the menu says Redraw.

**The peek over the bar** (Viktor: «Тултип покрывает первый ряд карточек… меньше по высоте. И тултип смести прямо поверх
бара, он же временный»): from the window's top, over the bar, no lower than where the cards begin (measured on the
Librarian at 1700 × 1000: 184 px tall, the cards from 276); the style in three lines, the note in two, the words without
empty lines and a run of bare section tags on one line (an instrumental's whole text: [Intro] [Verse] [Outro]).

### 1156 · Artwork that looks at itself; the painter on a link; the sheet's pictures, seeds and styles; probes of their full length
**The critic** (Viktor: «У нас же есть VLM? Пропускать через VLM вместе с промптом, и регенерить по адаптации промпта самой
VLM»; the duduk's picture was a board on a table): a picture whose subject is named (an instrument's probe, by its title)
is looked at by Omni, the listener's model (Qwen2.5-Omni-7B Q8_0 through llama.cpp, the Q8_0 projector reads pictures as
well as sound: 5.7 s a look). It looks blind, the picture and the subject only, and says what it sees before it judges:
with the prompt before it, it said the prompt back («a duduk resting on a woven rug») over a board. When the subject is
not there, Omni writes the prompt again from the prompt and what it saw, and the painter tries again, three pictures at
most. Measured by eye on known pictures: the board NO, an empty table NO, the didgeridoo and the harp YES; a wooden pipe
on a carpet YES (lenient: a 7B critic catches the empty picture, not every wrong instrument). Songs keep the first
picture, as before: judged by its first phrase, «a storm with a woman of harp strings» was rewritten into «a glowing harp».

**What the painter does not know** (Viktor: «что не знает, то не генерит. Так же как с cat и hat»): the cheat-sheet now
says how 94 rare instruments look, in plain visual words (art_looks.json, from instruments_src.py), and where they are at
home; the prompter is told both (the duduk in an Armenian courtyard, not «a lone duduk on a weathered wooden table» eight
times over), the critic the first, and what stands in for them (ordinary ceramic bowls for crystal ones: «в
probe120-crystal-singing-bowls-b — обычные керамические глубокие тарелки»; a violin and a live horse for the morin khuur).
A picture whose subject the critic did not find in three is kept, marked ≈ a guess (in the overlay and the sheet): the
morin khuur came out a violin each time. The prompts begin with their subject and stay under 50 words: CLIP reads 77
tokens and drops the rest (a 79-token prompt lost its last words).

**The painter on a link** (Viktor: «на нашу модель дать рядом относительный симлинк SDXL-Artwork-Model, чтобы на этот
симлинк можно было бы посадить другие веса SDXL»; «SDXL — лёгкая и качественная. Никаких FLUX»): the studio paints with
whatever artwork/SDXL-Artwork-Model points at (fetch-heresy.sh makes it, → CyberRealistic-XL-v10): a diffusers folder or
one .safetensors file (the parts' configs from our folder, offline); anything not an SDXL (SD 1.5, SD 3, FLUX) is refused
with what it is, before a minute is spent. The guide's new section *Artwork* says it, with the disclaimer.

**Remove current artwork** (Viktor: «В меню мыши Remove current Artwork»): the picture off the take, kept beside it
(artwork-removed/), and the MP3s made with it as their cover dropped (the server makes an MP3 again only for a newer
picture: a cover gone would have stayed inside them). The approved workspaces' takes drawn by a batch, one at a time.

**The sheet** (Viktor: «на странице шпаргалки будет возможность увидеть картинку»; «В шпаргалке указываем seed на каждый
A/B»; «красным по белому предупреждаем, что инструменты на 90% звучат, как в A/B семплах»): each instrument's picture
(an approved probe's first, whole over the page at a click); under ▶ A and ▶ B the music and sound seeds, as text (64-bit
seeds are past what a page's numbers hold exact: a seed rounded is another seed); a warning in red: a name is a request,
not a promise, and some superb probes agree in A and B yet are not the instrument named. A tab **Styles** («в новую
вкладку стилей»): 35 rows, his genres (the Fosforida styles, his takes', УКРАЇНА's military march and Мавка's trance),
the modes of major and minor on one trio (harp, viola, cello: the minor family on B♭, the major on D♭, as his styles),
and what the instrument probes gave instead (the orchestral cymbals, «Это оркестр»; the cicadas, «не инструмент, а целый
стиль»). A style is heard once its probe stands in «💎 Musical Styles».

**Probes of their full length** (Viktor: «Для проб стилей сто процентов 120 секунд»; «Таргетим в пробы 120 сек, но держим
близкое — полторы и выше»): the music half ends where its structure does, the duration being only a ceiling (a «two
minutes» probe of five sections came out 34–62 s; 25 of 45 style probes under 120 s). The API's songs take min_seconds:
the music may not end before it (the engine's own floor, 750 frames, raised). And a song asked of the API is filed into
its workspace for as long as it waits (the watch gave up after an hour: a queue of fifty two-minute probes outlives one),
remembered on disk, so a lab restarted meanwhile files it still.

### 1157 · The lab's work in the Server log; the lamp pulses while any card works; no cut logo
**The log** (Viktor: «SDXL рисовалка не идёт в системный лог. Перепроверь логирование всех GPU активностей»): the Server
log is the engine's own stderr, and the lab's work never reached it. The lab now keeps a log of its own: every job
(artwork, stems, remaster, upscale, debuzz, Whisper's timing and check, spectrum, inspection) and every training run and
listening, as it waits, starts (on which card), ends or fails (the artwork with what the critic saw); the page merges it
into the Server log as «[Lab] …» lines (GET /activity?since=N).

**The lamp** («Зелёную точку в баре анимируй всегда, когда идёт GPU активность в студии, и тултипом при наведении running
jobs status»): it pulses while anything works on a card: amber for the engine's songs, green for the lab's work while the
engine rests; its tip lists what runs, on which card, how far (a training's step, a job's minutes).

**The logo** («обрезанное лого на высоких скейлах… Вообще не пляшет… Может вообще убрать логотип в таких случаях?»): where
it would lose its words (1659 px and narrower), it goes whole.

### 1158 · What the style names, under the style
Viktor: «В Творце/Creator подумай, как удобнее шпаргалку вызывать и попапить картинки нами одобренных инструментов».
Under the Style prompt, a chip for each instrument and style the prompt names (the sheet's names, the longest first so
«Celtic harp» is not also «harp»; a name in brackets only when it is one, so «sopilka (low)» does not catch «low
drone»), coloured by the sheet's verdict and wearing the instrument's picture; the pointer on one shows its card (the
picture, its home, its verdict, how it sounds, ▶ A and ▶ B with their seeds); a click shows the picture whole, or opens
the sheet at that name. Alt+I opens the sheet from anywhere, whatever the keyboard's language. Tried on КРИК's style:
fourteen chips, and the one in red is the sambuca, which the sheet says YuE2 does not play by that name.

### 1159 · Takes dragged onto a workspace; the shofar's adapter in the sheet
**Drag and drop** (Viktor: «Drag&Drop для перемещения выбранного в другой воркспейс… С диалогом подтверждения, чтобы не
произошло случайного перемещения треков»): a card dragged onto a workspace on the left moves there, all the checked ones
when it is checked; with Ctrl it is added there and stays here. Asked first, always (what, where to, and out of where:
the workspace open, or every other one from All Workspaces); Ctrl+Z gives it back. A title being renamed in place keeps
the mouse for its text (the card is not draggable meanwhile).

**The shofar** (Viktor, the A/B «LoRA A-B · Shofar»: e110 «АХУЙ, такого шофарист не слышал. Целая медитация. Это сто
процентов йеменский шофар, рог антилопы, двухметровый»; e167 «переучился. Слаб и тонок»; e066 «не доучен. смесь с
трубой»; base «НОЛЬ»): the sheet says YuE2 does not know it and its adapter does, at epoch 110; the epochs beside it
(99, 121) made for his ear.

### 1160 · Regenerate with a new seed
Viktor: «Над писателем в меню — регенерировать этот же трек, но с другим случайным зерном. И тогда я меньше просить тебя
буду. Авто замена существующего. Новая часть среди воркспейсов — Sourced for Regeneration». In the take's menu, above
the Writer: *Regenerate with a new seed* (on a checked card in the Librarian, every checked take). The lab makes it again
from its own request with new seeds (its codes and the score its plan wrote dropped; a score the user brought kept), and
when the new take lands it takes the old one's places, its workspaces and its note, and the old one moves to the
workspace «Sourced for Regeneration», kept until he empties it. A probe runs its two minutes, not ended before 90 s.
Watched by the lab, not the page, and remembered on disk: the swap happens with the page closed and across a restart;
the activity log says each one. Tried on a take of mine: queued, landed 31 s later, swapped.

### 1161 · Sections in a workspace; the Refiner's work filed by itself
Viktor: «В воркспейсы можно один уровень подразделов? Максимум два. Так сортировка по отборам в воркспейсе будет
доступна и не нужно будет плодить их каждый раз. Туда же можно автоматом создавать подразделы при факте работы с
рефайнером». A section is a workspace named by its path, «Parent / Section», two levels below a workspace at most (a third
is refused aloud). On the left it stands under its workspace, indented, by its own name; a workspace shows its sections'
takes too and counts each once; the workspace in hand takes them in as well. *New section…* in a workspace's ⋯ menu;
renaming a workspace carries its sections (and their locks and pins) along, deleting it takes them with it (the takes
stay), a merge waits until its sections are merged or gone. A section of an approved workspace is approved (💎 by its
root). When the Refiner has made something of a take (stems, a remaster, an upscale, debuzz), the take goes into the
section «Refined» of each workspace it stands in, made when first needed, and the activity log says so. Tried on a
workspace of mine: made, shown, its take counted once in the parent, a drag onto it asked and declined, deleted again.

### 1162 · AGPL; the logo kerned and its cloud lighter; fresh cards; regens keep their marks; the workspaces column folds
**The licence** (Viktor: «AGPL-3.0-or-later однозначно»; the logo and the name apart, «и все аудио генерации с наших
репо воркспейсов»): the code under the GNU AGPL, version 3 or later (`LICENSE`, the FSF's text); the logo, the name and
the audio and pictures we publish under CC BY-NC-ND 4.0 (`LICENSE-ASSETS.md`); README, CHANGELOG, the release copies both.

**The logo** (Viktor: «Тень под Девой в логотипах очень агрессивная. Осветли её на добрых 40%»; «В РУАХ… кернинг нулевой
между У и А. Учитывай это во всех языках. Для других сойдёт, но не для Виктора»): the cloud is the accent with a breath
of white instead of a quarter of black (OKLab lightness 0.32 → 0.45 on the default accent; the written-in copies
#5f0f1d → #942736 by day, #a24b4b → #f17777 by night). The words keep their font's own kerning (kern.py: the GPOS pairs,
the variable font set to the logo's weight first): РУАХ had 0 where Montserrat gives Р·У −25, У·А −40, А·Х −40; RUACH
U·A −15, A·C −10; every language. make_all.sh makes every file of the logo again, the icon's pictures and the page's
words; the page's two inline logos and its favicon put in by a transform checked to give back the old ones exactly.

**Fresh cards** (Viktor: «карточку помечать лёгкой пунктирной обводкой и снимать её при первом же проигрывании трека. То же
самое и на новые треки»): a take made since this came and never played wears a light dashed line, in the Librarian and
in the Creator's list; its first play takes it off (the collection keeps what was played).

**Regenerations** («При риджене оставляй в новой версии пометки»; «Помечаем в карточке реджены»; «Sourced for regen давай
как подкатегорию исходного воркспейса»): the new take gets the old one's note, like, star and picture (a dislike stays
behind: it is why a take is made again), and a «regen» badge naming what it came from; the old one goes into the
section «Sourced for Regeneration» of its workspace, which its workspace does not show among its own. The regenerations
made before moved there; the one workspace of that name gone.

**One picture for an A/B pair** («Для A/B семплов зачем нам мучиться с двумя картинками?»): the other letter of a pair
gets the picture its partner has instead of a new one; a picture drawn for one goes to the other when it has none.

**The workspaces column** («возможность перетягивать, менять ширину, и схлопывать эту колонку… при схлопнутой добавлять
ещё одну колонку в тайл карточек»): its edge dragged sets the width (kept); « folds it away and the tiles take one
column more; a double click on the edge or Enter folds too.

**And**: Hidden showed nothing (its cards wore .is-hidden, which is the page's display:none; renamed); the small
dropdowns 12 → 14 px («добавь 2pt уверенно. Пусть будет кратное значение»); the sheet: an instrument with no probe at
all plain red text, nothing to press («а вдруг YuE3 добавит»); an instrument shapes the style of the whole piece; a
crackle like a worn record is an unlucky seed; the gong failed; the orchestral cymbals renamed by him probe60-orchestral
(Styles → Orchestral), my full-length takes of them on the same seeds style120-orchestral, the genre style120-symphonic-
orchestral, and the cymbals asked again without the word. The 36 rejected probes made again went to the trash (his word);
the duduk's epochs 40, 120, 140, 180 and the B of bugle, frame drum and kalimba made.

### 1163 · Russian for the day's new words; SDXL Turbo and its kin
**Russian** (Viktor, in the Russian page: «Многое не пересведено пока ещё»; his screenshot showed the bulk bar in
English): 42 strings by hand: the bulk bar (Добавить в пространство…, Переместить в пространство…, Выбрано: N), the
take's new items (Открыть обложку, Перерисовать обложку, Снять обложку, Перегенерировать с новым зерном), New section…,
the sheet's tabs, groups and red warning, the lamp's tip, the column's edge, the drag's question, the «реджен» badge.
The menus, toasts and dialogs at large still wait for their pass (FINISH-LINE).

**SDXL Turbo** (Viktor: «SDXL Turbo файнтюны будут так же работать?»): they load, being SDXL, but want a few steps and
little guidance, and at the studio's 28 steps and 5.5 they come out burnt. A painter whose name says Turbo, Lightning,
Hyper or LCM is painted with 8 steps, guidance 2 and Euler ancestral (trailing timesteps); any painter with what
artwork/SDXL-Artwork-Model.json beside the link says ({"steps", "cfg", "sampler"}); each artwork.json says what it was
painted with.

### 1164 · РУАХ set by eye
Viktor, after 1162: «Между У и А ещё 20–25% убери воздуха. В общий кернинг в РУАХ добавь 5%». РУАХ (ru, uk, be) gets 5 % of
its em more between every two letters, and the air between У and А, measured on the letters (the mean ink-to-ink
distance across the rows both fill), 22.5 % less than at 1162: 324.7 → 251.6 font units; Р·У 285 → 335, А·Х 259 → 309.
make_words.py measures it on the outlines (TUNE), so another font keeps the rule, not a number. The other words keep
their fonts' spacing («Для других сойдёт»).

### 1165 · What waits, off its queue; the run from any room; regenerations seen at once; the overlay's hollow play
**The queue under the lamp** (Viktor: «В баре тултипом под красную/зелёную — вывод списка очереди, и возможность удалить из
очереди то или иное ожидающее действо»): the engine's lamp opens, on hover or a click, what runs and what waits: the songs
(this page's, and the regenerations the lab queued: the engine's log names a run only when it begins, so the lab lists
the ones still waiting, from what its watchers read anyway: `GET /activity` → `queue`) and the lab's work on the cards.
A waiting one comes off its queue by its ✕, pressed twice: a song by the engine's cancel (it is skipped when its turn
comes), a lab job by `POST /jobs/cancel {key}` — the jobs that wait for the lab's one heavy lock take it through
`turn(job)` now, and one taken off ends *failed: taken off the queue* when its turn comes, which every poller of the page
already shows and stops on (a new request starts it anew). What runs is refused there: it stops where it is shown. The
list is built again only when what it holds changes, the times in place: the lamp repaints every half second, and a
button replaced under the pointer between press and release loses its click (measured: a 600 ms click armed it).

**The context menu and the log** (Viktor: «Если консоль серверного лога открыта и там движение, убивается фокус курсора на
мышином меню»): the menu closed on any scroll anywhere, and the log dock following its new lines scrolls itself every
moment. Now, as the tips already did, only a scroll that moves what the menu was opened over closes it.

**The player's dot** (Viktor: «Кликание по кружочку… на регенерации как минимум не работает»): *Click to watch it* showed
the run in the Creator's own view, unseen from the Librarian; it goes to the Creator first now (and *Click to open it*
too).

**Regenerations in the Librarian** (Viktor: «В Instrumental Probe FAILED, to REGENERATE какая-то аномалия. Не вижу, или
что перегенерилось»): the lab files a regenerated take a moment after the engine ends it; the page read its takes again
then, not the workspaces, so the old card stayed where the new one stood, and a second Regenerate on it made one more
version from the take already set aside, which landed in no workspace (and the old one in a top-level «Sourced for
Regeneration»). The page reads the Librarian again whenever the lab says it filed (never under a title being typed);
a take regenerated from a «Sourced for Regeneration» section lands in that section's parent. The one misfiled kantele-b
put where it belongs, the stray workspace taken away (its one take stays in its section).

**The artwork overlay** (Viktor: «В оверлее картинок сделай такие же эстетичные полые кнопки воспроизведения как и везде»):
its play is the cards' hollow one, light on the overlay's dark in both themes. **Fresh cards** (Viktor: «в regen очень
жирная кайма»): the dashed outline 1pt, was 1.5 px.

**LoRA epochs and the shofar's picture** (Viktor 03.10): published and kept — the duduk e080, e140, e160, e180, e200 (the
run's last file), the shofar e099, e110, e121, e167 (its last); e040 and e120 of the duduk and e066 of the shofar taken
out of loras/ by the Trainer's own *Out of loras/* (their checkpoints stay in the runs). The painter drew a ram for the
shofar every time; his own picture (`shofar.webp`, 768 px) is the artwork of every take made with the shofar adapter, the
drawn ones kept in each take's `artwork-removed/`. **The LoRA repo** (his «эти чекпоинты оформляй в репо»):
`heresy/tools/upload-loras.sh` stages goldhub/Ruach_Studio_LoRAs in `tmp/hf-loras/` (the nine epochs as hard links, the
last file of each run under its epoch's name; the newest take of each title in «💎 Instrumental Probe LoRA» as a 320k
MP3 with its cover, and the picture; the card `heresy/docs/hf-loras-README.md` with a table of the samples' seeds made
from their requests) and uploads it with his write token (`--stage` only stages). **Regenerate with its own seeds**
(`POST /regen {names, same_seeds: true}`; his rule: before publishing, the approved probes again «с теми же сидами
карточек, по 2 минуты всё»): the duduk's eight 60-second A/B samples made again at full length on 5101/6101 and
5102/6102, filed as a regeneration (the 60-second ones in «💎 Instrumental Probe LoRA / Sourced for Regeneration»); an
A/B sample (`ab-…`) now counts as a probe: 120 s, not ended before 90.

**Translation groundwork** (the turnkey translation, under way): a catalog entry may now give its language's plural
forms ({one, few, many, other}, Intl.PluralRules on the key's first number: 1 трек, 2 трека, 5 треков), a part
`{#0}` takes a number only (so "{#0} MB" never swallows a longer text that ends in MB), and the parts of a pattern are
looked up in turn (a pattern inside a pattern, three deep); workspace names, LoRA and font names, repositories and
take titles in the menus are kept as typed (`translate="no"`: an `<option>` without a value is its own text, so a
translated workspace name would have moved takes to a workspace that does not exist); the LoRA and VAE tiles and their
tips are translated piece by piece where they are made and drawn again when the language changes.

### 1166 · The studio in seven languages, turnkey; the Librarian past 2K; the 💎 sets from Hugging Face
**Every language whole** (Viktor: «Заканчивай под ключь с переводами интерфейса и текстами по всей студии»): the page in
Russian, Ukrainian, Belarusian, Greek, Spanish and Italian beside the English, every key the page has in each (2,429):
the Russian by hand, the others built by `build_tr_cat.py` from the translators' tables, so no key is retyped; a
translation must carry its key's parts and its language's own plural forms (one/few/many/other in Ukrainian and
Belarusian, one/many/other in Spanish and Italian, one/other in Greek), else nothing is written. What the code itself
says was English in a translated page: its toasts, dialogs, menus, hints and tips, found by a scan of the code and by
harvesting the real page in each language (every room, menu, sheet, dialog, overlay and pane), from 1,107 untranslated
texts down to the names, units and the cheat-sheet's own notes; what the code glued from words, names and numbers is
made of translated pieces where it is made, and drawn again when the language changes; names stay as typed
(`translate="no"`). The rich tips of `<template>` and the recaps of `kit/loras/sources.json` are translated in their
tips. No word of the root «раб/роб» in Ukrainian and Belarusian, none of δουλ- in Greek (its own «раб»). Chinese was
made and called off (Viktor: «Отмена по китайской»): out of the page and of the language list, its tables shelved.

**Numbers and dates in the language** (`RuachI18n.locales`): 24 576 in Russian, 24,576 in English; Belarusian borrows
Russian's formats (Chrome has no Belarusian dates), and the Writer's dates go numeric there, so no Russian month shows.
`{#N}` takes a number grouped by plain spaces too, and its plural reads it whole. **Icon buttons follow the language**:
`HeresyIcons.dress()` takes a button's words in English (`RuachI18n.en`, and `enAttr` for its title); it ran after the
translator's first pass, so a page loaded in another language had pinned its icons' tips to that language.

**The guide in every language**: `heresy-guide.js` reads `docs/GUIDE.<lang>.md` (else the English); the whole guide in
each of the six, in the page's own words, every heading ending in the English one's id (`<!-- #id -->`), so the
page's links into the guide find the same stop in every language (checked in each: «Babel in the score» from the
Creator); the same images, code and numbers, checked by a script against the English.

**Russian made consistent on the way**: the Writer's notebook «блокнот» throughout (it was also «тетрадь»), PARAMS
«ПАРАМЕТРЫ», the theme tip naming the day and night themes as the list does, «Какую DAW ты используешь?», the fonts
button named as it is; two homonyms parted in English (the inspection's "pitch", the Train dialog's "Start training").

**The Librarian past 2K** (Viktor, at 4K: «давай сделаем богаче замощение канваса с карточками. 6 карточке в 4K
разрешении. Pinned оставляем 4 макс.»; on the List: «Делай две колонки выше 2K разрешения»): the tiles take more
columns instead of wider cards, 5 from 2880 px and 6 from 3360 px (at 3840 a card is 584 px, about as wide as at 2K),
one more while the workspaces column is folded; the pinned strip takes the same columns, so its four at most stand
over the cards. The List in two columns from 2880 px, read row by row as the tiles are (a long list read down one
column, then the other, would hide its second half); 2560 and below as they were (two would fit at 2560 too: 1131 px
a row).

**Unpin where it was pinned** (Viktor: «Unpin исчез после появления обложки в карточке, что закреплена. И в меню нет
Unpin»; «Анпинить можно только в воркспейсе, где прикреплено»): the take had been moved out of the workspace that pinned
it, and its pin stayed there, where nothing could reach it. The lab now keeps a workspace's pins to its own takes (its
sections' too) on every change, and shows them so before the file heals; the Pinned view's menu has Unpin, from every
place the take is pinned in.

**The 💎 workspaces for the public** (Viktor: «смело переименовывай все треки в законченных 💎 воркспейсах. Под единый
стиль»; «Мои вердикты в читшите музыкальном делай на английском»): every take of «💎 Instrumental Probe», «… LoRA»,
«💎 Musical Styles» and «💎 Voice Types» renamed to one style («Hang Drum · A», «Dorian · B», «Bass · sung · A»), the
notes in English with the Russian as a second paragraph, his own words kept beside their English; no covers for the
styles and the voices (his word). The cheat-sheet: the verdicts in English, the oboe failed («К сожалению, oboe нет в
YuE2»), fifteen palette instruments added (the grand piano by its lid, helmet and table gusli, kantele, the kinnor, the
nevel, the kithara, the lyre of Ur, the psaltery plucked and bowed, the concert zither, the cimbalom, the gudok): 200.
The public titles live with the sheet's data (`heresy/tools/instruments_src.py`: `title_of`, `style_title`, no two
alike), and the sheet finds a probe by its old title, its public title or its folder's name, which a rename never
changes. A take made again keeps the old one's title.

**About** (Viktor: «В Engine логотип заменить. Все наши восходящие HF репозитории добавь в колонку Ruach Studio, через
пустую строку»; «После лого новая строка»): the bar's own logo, its words in the page's language, the tagline under it;
our four Hugging Face repositories under Ruach Studio's credits, a line's space between.

**The Engine's LoRAs in two groups** (Viktor: «раздели блок LoRA на два: ЛОКАЛЬНЫЕ оттрененные… и второй — те чужие
адаптеры из HF»): *Trained here*, the files with no web link to a source, and *From Hugging Face*, the add-on badge
with them.

**Leaving the Engine page** (Viktor: «единственная возможность уйти с неё, либо кнопка «Назад к сочинению», либо F5.
Добавь кликание по бару Студии… если в GPU что-то изменил, но не сохранил, требовать в попап диалоге действие —
сохранить/игнорировать»): a room in the bar and the logo leave it as Back and Esc do; GPU roles changed and not saved
are saved or put back first, in a dialog only its two buttons answer.

**Music, together** (Viktor: «В Креаторе ползунок Music Together не работает. Подсчёт общей силы не работает. Сам по
скрину посчитай»): the bar was counted when the form was painted and never while a strength was dragged; his screen
showed 3.55, the five adapters' first strengths (1.0 + 0.75 + 0.6 × 3), over 1.55 on the sliders. It follows every
strength now, and it is a slider of its own: dragged, it moves every music strength at once, each in proportion to where
it stood, none past its own max, the 0.005 grid's remainders shared so the sum lands where it is let go.

**The Engine page in his rows** (Viktor: «как всё ужать и передвинуть, чтобы на 1080p всё встало красиво и не таким
длинным полотенцем… Ты всё замерь и пересмотри»): from 1400 px one grid of thirty columns, so thirds, fifths and sixths
share it: Server over Hardware beside the log (1/3 · 2/3, the log filling the height), Compute | GPUs (2/5 · 3/5),
Appearance | Writer (4/6 · 2/6), VAEs | LoRAs (1/6 · 5/6), Sliders, About; the cards in that order in the source, so the
keys walk them as they are seen; narrower, the flex rows as before. At 1920×1080 the page went from 3 975 px to 3 187.
About in one band of three columns (his word: «RUACH STUDIO | YuE2 + ggml + yue2.cpp | Sound decoders, Sliders, Loras.
В колонке YuE2 — логотип так же, как в первой наш»): ours with the layout it took after, then the model, the engine and
the tensor library under YuE2's own mark, then the add-ons. The mark is M-A-P's (the one on map-yue2.github.io), traced
from the picture Viktor downloaded (a beige ground, much air): each ink split from the ground, traced, cropped, 17.8 KB
inline; the word takes the theme's ink, the circle and the ² a terracotta drawn a little toward it. The files, for a light
and a dark ground, in `src/brand/yue2/`.

**The 💎 workspaces from Hugging Face** (Viktor: «Воркспейсы с 💎 — именно эти идут в соответствующие репозитории. И
допиши код подтягивания этих воркспейсов из репо, по запросу пользователя, и если такой существует, спрашивать о
восстановлении оригинальной копией, и краткий быстрый гайд в попап оверлее… Вдруг чел туда своего напишет, а мы
перезатрём всё»). A published workspace is a folder of its repo: each take as MP3 320k with its cover, and
`workspace.json` (the takes with their titles, notes and sections, the meta and the request of each: seeds, settings,
music codes). `heresy/tools/publish-workspaces.sh` writes and uploads it (private; it stops while takes under 90 s are
there, by his rule that approved probes are made again at full length first); `lab/diamond.py` lists the sets and
fetches one on the user's word: through `tmp/diamond/` into `outputs/` (meta.json last, so the library sees a take only
whole) and into the Collection, locked. The Librarian's «💎 From Hugging Face…» shows each set (here or not, its takes and
size, or the hub's own words when it is not published) with one button. A set whose name is here already is never
written over unasked: the lab answers 409, and the page asks, saying how to keep yours: rename it, then Get, and the
original comes in beside it. Restoring brings back the takes it lacks, the published titles (through the engine) and
notes, the published takes in the workspace (what was added leaves it and stays in the library; sections of its own
stay). Checked against the real private repo in a sandbox studio (Get: 20 takes, 99 MB in 19 s; asked again: 409;
Restore after a stray take, a note, a lost take and a changed title: one take fetched, the rest put back), and the dialog
in each language with the lab's answers stubbed. «💎 Instrumental Probe LoRA» is published in
`goldhub/Ruach_Studio_LoRAs/samples`; the three others wait for their full-length takes and for Viktor's word on where
(datasets named after his bucket, `…_WS`, are the default; the bucket itself needs a newer hub client).

**The Writer knows what the probes found** (Viktor: «И не забудь, мы по всем инструментам хотели для комнаты Писателя
для LLM дописать в уставы знакомые YuE2 инструменты, как минимум те стили музыкальные, что нагенерили, и т.п.»): the
writing room's charter, besides the instruments heard and those not (1069), is told the instruments only our adapters
play (the shofar at epoch 110, the duduk's breath), the 35 styles kept in «💎 Musical Styles» by their own words, and
the voices of «💎 Voice Types» by the words that gave each (fifteen sung, nine spoken); the four not given (a boy treble
came out a girl, an old man a woman, an old woman a young contralto, and no children at all), the metallic buzz on high
female voices and choirs (a dry, close vocal against it), and how the spoken probes asked for speech with no singing.
The voices and the adapters live in the sheet's source with the rest (`instruments_src.py`: `VOICES`, `ADAPTERS`), the
styles count when their probes stand in a 💎 workspace; the charter is about 16,000 characters.

**A frozen workspace** (Viktor: «Деактивация воркспейса. Замораживаются все треки в этом представлении, никаких
действий по ним, в `All Workspaces` и в поиске не отображаются. Сам деактивированный воркспейс немного засЕривается как
неактивный»; and of the API tests' workspace: «я бы сделал неактивным… удалять его невовремя»): ⋯ → Freeze… The lab
keeps it so: nothing changes a take frozen with it (a take in no workspace that is not frozen) or its membership, its
sections with it: no like, note, hide, pin, move, rename, merge, deletion, trash or regeneration, each refused in words;
a move from elsewhere never takes a take out of it; a take also in a living workspace lives on there. The Librarian
greys the workspace (❄) and shows its takes only inside it, greyed, heard and read (Play, the datasheet), nothing
else; they leave All Workspaces, the search and the counts. Unfreeze in its menu brings everything back. «API test ·
Claude» frozen (20 takes; All Workspaces 620 → 600). Checked: the lab's rules on a sandbox collection (17 checks),
the page on the real studio, the words in the seven languages.

**The sheet against his verdicts, and our two LoRA sets on it** (Viktor: «гайд по инструментам полностью пересмотри и
сверь с тем, что я одобрил + наши два набора LoRA — Дудук и Шофар»): read row by row against «💎 Instrumental Probe»:
200 instruments, 159 heard, 6 kept with his own words (the cowbell that is an electric guitar, the accordion like a
harmonica, the didgeridoo's B, the sambuca as a harp, the duduk, the cicadas a style), 35 not identified: his «Tested,
Failed» (the oboe, the shofar's eight attempts, the natural horn, the sambuca's strings) and the instruments whose
probes he took out; none waits. The duduk's and the shofar's rows carry their adapter's A/B by epoch from «💎
Instrumental Probe LoRA»: the engine alone, then e080 to e200 for the duduk; e099, e110, e121 and e167 for the shofar,
▶ A and ▶ B with their seeds and his marks (e110 liked twice, e167 disliked twice).

**Slider curves** (Viktor: «по кривым… либо было flat, как сейчас (как базовое состояние), и кривую в виде
арки/параболы, либо амплитуду вручную мышкой двигая вспышки и затухания по слайдеру»; «Slider curves делай и тестируй.
В гайды также добавь концепт»): a slider's strength runs through the song along its curve. In the request a slider may
carry `curve`, points `[t, k]` (t the music from its first frame to the end of its budget, k the share of the strength)
or a name (`flat`, `arch`, `rise`, `fall`); none is flat, as before. In the engine the gain became a one-number tensor the
graph reads, set before each step to gain × curve(t), eased between two points by half a cosine, so the static decode
graph is never rebuilt; the kept part of a song made again from a point counts in t; the curve goes back into the
take's request, so a take made again runs the same; the log gives each curve at the song's quarters and where it stands
every 250 steps. In the Creator a slider's row shows its curve small; a click opens its editor: Flat, Arch, Draw (a point
dragged up for a flare, down for a fade, along the song; a double-click adds one, on a point takes it out). Tested on two
throwaway servers beside the studio: a flat slider writes the very same 750 music tokens on the new binary and the one
before; an arch and a drawn dip run their schedule. The guide says it in the seven languages.

**Smaller, the same evening**: the cover's overlay as large as its picture (Viktor: «при 1024 обложке попап растягивался
до 1024x1024»), and the painter keeps its 1024 px (it kept 768); the workspaces' « no longer sits on the Librarian's
filters (Viktor: «Сделай отступ от кнопочки сворачивания»; the other rooms' fold buttons measured, 10 px and more); a
voice probe is a probe too when made again (it came back at its old 40 s).

**The server log, read while it runs** (Viktor: «кнопочку полной распашки консоли на всю высоту, и чекбокс автопрокрутки
по дефолту, — не возможно во время активности прокрутить и глянуть, что до этого»): the unfolded dock's ⤢ gives the log the
window's full height (⤡ back; kept as chosen); Follow stays on by default, and a scroll up by hand lets go of it (it unticks)
until you are back at the newest line (it ticks again). While you read, the lines under your eye stay put: the oldest go
only past five times the count, and the view moves back by what went. The same in Engine's log. Checked live with the
regenerations writing: 180 → 829 px at 1080p, 400 → 411 lines arrived and the view held.

**Nothing gzipped** (Viktor: «Мы договорились избавиться от index.html.gz и других .gz, потому что это локальный сервис
и нам нет смысла экономить на сжатии файлов»): the server carries no copy of the page any more (no xxd header, no
`tools/public/index.html.gz` in git, no 406 without gzip); it reads `build/tools/public/index.html` from disk, from
RUACH_PAGE or else beside its own build, and a page not built yet answers 503 with what to run. `build.sh` lost its
gzip line, the lab's spectrum goes as it is (`cache/*.spec`, about 10 MB for 7 minutes) and the page reads it without
unpacking (and a spectrum overtaken by another take no longer leaves its "Forge is measuring…" over the newer one's
result). The patches to 1166 still carry the old page as binary; the release strips it, as before.

**A photograph says whose it is** (Viktor: «Instrument pictures одобряю. Тримай и апскейли их до нашего стандартного
1024x1024»): where the painter could only guess an instrument, its probes get a photograph from Wikimedia Commons,
squared to 1024 (trimmed on a plain ground, else its middle; 4x_ClearRealityV1 first where the original is small). Its
`artwork.json` carries the source, file, page, licence, author and a `credit` line; the lab lists the credits with the
pictures (`/lab/arts` → `credits`), and the overlay shows it under the picture («Picture: author · licence · Wikimedia
Commons», the page one click away), in the seven languages. The picture it replaces is kept in `artwork-removed/`.

**The 💎 sets in one bucket** (Viktor: «Упаковывай воркспейсы 💎 в goldhub/Ruach_Studio_Instruments_Probe_WS бакет.
Поставил его в private»): the four published workspaces live in that Storage Bucket, a folder each (`instrumental-probe-
lora/`, `instrumental-probe/`, `musical-styles/`, `voice-types/`: the takes as MP3 320k with their covers, and
`workspace.json`). A bucket is known only to huggingface_hub 2.x, and the studio's is pinned at 0.36 (transformers 4.57
holds it under 1.0), so the lab reads the bucket over plain HTTPS: `workspace.json` and each file from
`/buckets/…/resolve/…`, the token sent to the Hub only, never to the signed address the bytes come from (a header is
latin-1 only: a 💎 in the User-Agent stopped the first try). `heresy/tools/publish-workspaces.sh` fills it with an hf of
its own (2.1.1 in `tmp/hf-buckets-venv`, set up at its first run) and a write token (`HF_HOME`), `sync --delete` inside
the set's folder. The About card's link says «Probes, styles and voices».

### 1167 · The Creator as a kitchen; the LoRA repo in four rooms

**The Creator as a kitchen** (Viktor 05.10.2026: «Левую промптинг генерации на 2/3 слева как основную, разделить её на
две колонки по 1/3, всё пересмотреть и реорганизовать. Статистику/карту трека реально нужно на 1/3 ширины справа…
[дубли] во втором фрейме 1/3 ширины вниз этого фрейма под-фреймом… Каждую секцию отчётливо обособить… карточным
абажуром. Схлопнутые блоки… более контрастно»; on the draft: «Одобряю», the takes folded to the right, the player
minimal): the form regrouped, no field changed, into two columns of barely raised cards, the words (the song with the
Writer's document, the style, the lyrics) and the machine (the profile, the plan and the seeds, the sound, the adapters,
the four drawers two by two). From 1600 px they stand side by side over two thirds of the room; the last third is the
take over its takes, a line between them to drag (Home or a double-click for the default; kept as a share of the
height), the takes in compact cards of two lines, folded to a strip at the right edge with its word on its side. Every
adapter not in use waits behind one line, «Add a LoRA» with its count, remembered open or closed; folded parts and
closed drawers stand on a firmer ground with the chevron in the accent. The Creator's player is one row from 1660 px,
as the scaled-up page has it. Below 1600 px the three columns and their grips stay. A tip reached by the keyboard now
stays while the pointer only passes (the kitchen scrolls under a still pointer when a field takes the focus). At 2560
the kitchen fits without a scroll; at 1920 it scrolls by about 430 px. Made beside the studio first (a worktree on
:41994), merged after his look.

**The LoRA repo in four rooms** (Viktor 05.10.2026: «Для репо LoRA, пока ещё не поздно, сделай структуру: instruments,
styles, vocals (певчие), voices (говорящие)»): goldhub/Ruach_Studio_LoRAs holds `instruments/` (the duduk and the shofar
with their A/B samples), `styles/`, `vocals/` (singing voices) and `voices/` (speaking voices), the last three with a
README each until their adapters come. `heresy/tools/upload-loras.sh` stages it so; the old top-level folders left the
repo once each of their files had its copy under `instruments/`. The studio's `loras/` is unchanged: an adapter's folder
goes there as it comes.

## heresy-lab

`lab/lab.py` — standard-library Python, port 41870, reached by the page through the Kit
(`/lab/…`). One heavy job at a time; each runs in its own process on the GPU with the most free
memory and leaves VRAM when it ends. CPU jobs (spectrum, artifacts, debuzz, remaster) one at a
time of their own. Packages: `lab/requirements.txt`. The endpoints are listed in
HERETICA-GUIDE §7.

### Running in production: two systemd user units

```bash
./systemd/install-units.sh                         # writes ruach-studio.service and heresy-lab.service with this folder in them
./lab/start-lab.sh stop                            # stop a lab started by hand, if any
systemctl --user enable --now heresy-lab ruach-studio
sudo loginctl enable-linger $USER                  # once: alive without a login, up at boot
journalctl --user -u ruach-studio -f                   # logs
```

---

## What we measured

Findings from our takes, with the conditions, so they can be checked.

**Where things live.** The music half (AR) writes the score and the semantic tokens: *what* is
sung. The sound half (NAR, flow matching) and the VAE render them: *how it sounds*. Garbled
words are an AR matter; solvers and steps cannot fix them.

**Glossolalia on long songs.** Two kinds: the words break down in the middle of the text, or the
text ends and the model goes round singing earlier lines. The "high" Performance card
(T 1.1 · top-p 0.97 · top-k 140) produced the first on a 7-minute song; the cover configs on
r/StableDiffusion keep the music temperature at 0.80–0.95.

**Flash attention.** Kept on everywhere.
- Off in the AR: a different performance from the first tokens; on two seeds both takes were
  4–9 dB brighter in 2–12 kHz and less clear in diction.
- Off in the NAR (same tokens): band energies equal to 0.1 dB, SNR 39 dB, 3.2× slower.

**Style against the score.** Same score (`K:Dm M:2/4 Q:1/4=71`), same lyrics, two seeds, Whisper
against the lyrics (mean match per minute):

| style | seed A | seed B |
|---|---|---|
| as written for another model (B♭ minor, 74 BPM, 4/4) | 0.60 | 0.61 |
| the same with key, meter and tempo set to the score | **0.76** | **0.73** |
| a 292-character tag line | 0.68 | 0.73 |

The contradiction, not the length, cost the diction — most of all in the first minute.

**The official examples** (110 prompts shipped with the Kit): style 4…999 characters, median 124;
no arrows, no dynamics marks; 29 of them have lines in brackets inside the lyrics (instrument
cues like `(saxophone)`, voice cues, backing echoes).

**Whisper over music loops** on its own hallucinations unless `condition_on_previous_text` is off.

---

## Patches or commits?

In the fork the patches become what they already are in `build/`: **commits on a branch on top of
upstream**, one per patch, same messages. `heresy/apply.sh --export` still writes them out as
`.patch` files — for rebasing on a new Kit release and for offering single ones upstream.

---

## Credits

[yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp) · [yue2-kit](https://github.com/IronWolve/yue2-kit) ·
[YuE2](https://github.com/multimodal-art-projection/YuE) (M-A-P) · [YuE2 Studio](https://github.com/vrgamegirl19/Yue2_Studio) (songwriting
assistant, Apache-2.0) · [abcjs](https://www.abcjs.net/) · Noto Music (SIL OFL 1.1) ·
Whisper (OpenAI) via faster-whisper / CTranslate2 · [ggml](https://github.com/ggml-org/ggml) ·
[python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator) · [UniverSR](https://github.com/woongzip1/UniverSR) ·
[openDAW](https://github.com/andremichelle/openDAW) (AGPL-3.0, vendored for later) · [Lucide](https://lucide.dev) (ISC) ·
[Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0). Ideas from
[music-generator](https://github.com/jrlabanza/music-generator) (jrlabanza) and the ComfyUI nodes named in the guide.
