# Ruach Studio · The Guide

Songs from words, on your own machine: every room, what each thing does, and the numbers we measured.

## Start Here

### What This Is

Ruach Studio turns a style line and lyrics into a finished song with **YuE2**, the open song model, running on your own GPU. Nothing leaves the machine. Around the model there is a whole studio: a writing room with a chat model, post-production (stems, remaster, upscale, a lyrics check), a collection of every take, and a room that trains LoRA adapters on your own songs.

![The Creator: the form on the left, the take in the middle, every take on the right](guide/studio-create.png "The Creator: the form, the take you are listening to, and all your takes")

YuE2 has **two halves**, and most of what you set in the studio is aimed at one of them:

| half | what it does | what you steer there |
|---|---|---|
| **Music** (AR, the language model) | writes the song: first a score (ABC notation), then the music tokens, 25 a second | the planning mode, the score, the music seed, the music strength of a LoRA |
| **Sound** (NAR + VAE) | renders the tokens into sound | the sound seed, the VAE, the sound strength of a LoRA, steps and solver |

### The Six Rooms

| room | for |
|---|---|
| **Creator** | the song form and the take you are listening to |
| **Writer** | your songs as documents with versions; a chat model drafts and revises with you |
| **Refiner** | after the render: spectrum, artifacts, debuzz, lyrics check, stems, remaster, upscale |
| **Artist** | pictures for your songs from a prompt of your own: square, wide and tall from one seed; a square one becomes a take's cover (an early preview) |
| **Librarian** | every take: workspaces, search, likes, notes, bulk actions, the trash |
| **LoRA Trainer** | LoRA adapters from your own songs: the set, the run, its telemetry and its epochs |

### The Bar

![The bar: rooms, the workspace, and the few buttons you use all the time](guide/bar.png)

The rooms open the bar in the order of the work: Creator, Writer, Refiner, Artist (an early preview: pictures for your songs) and Librarian; the logo stands in its middle, the Trainer right after it; on the right, the workspace, the engine's lamp (green: ready; amber: working; red: something failed) and the few buttons. The pointer on the lamp (or a click) opens **what runs and what waits**: the songs, the regenerations and the lab's work on the cards (artwork, stems, upscale, Whisper). A waiting one comes off its queue with its ✕, pressed twice (the first press asks); what already runs stops where it is shown: a song in its run, a training in the Trainer.

- **Workspace**: the workspace in hand. The takes list shows only it, and every new take lands in it. *All Workspaces* shows everything. Where the bar is narrow (no logo there), the word *Workspace* goes too; the box stays.
- **EN** (the language's two letters): the page in another language, kept with your settings: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, each named in its own words. Numbers and dates follow the language, and this guide opens in it.
- **☀ / ☾**: day, night, or as the system says.
- In Compose's head: **Save** a prompt (all that Generate would send) as JSON or YAML, and **Open** it again; **Clear** the words (title, style, lyrics, score, seeds) and keep the rest, or begin a **New song** (the mode, sampling, sliders and LoRAs back to the defaults too; *Sound and output* stays). **Open** says what of a file the form could not take in, and what it holds instead.
- **Export to DAW** (in ☰, and in the Refiner: beside the take in hand and in its Stems): the way out of the studio. Either the mixed track as it is (WAV, FLAC, MP3), or the whole take into your own DAW, where the rest happens outside the studio. The page finds REAPER, Waveform and Bitwig on the studio's machine, or you name yours. Any take goes out from its menu (right-click it): *Export to DAW → REAPER project* or *DAWproject* (Waveform, Bitwig, Studio One, Cubase), your own DAW first; the DAW tab of this guide says what is inside.
- **Unload model**: drops every idle model from the GPU's memory now; tinted red while a model is loaded.
- **☰**: the rest. The card and its memory, the model copy, the sound decoder (VAE), **Export to DAW**, themes, the Engine room and this guide. **Text size** there sets the whole page's text from −2 to +4 pt (the layout stays), and a lifted frame has its own −, + and ⟲ on top of it (−4 to +6 pt); each screen keeps its own.

![Behind the ☰](guide/more-menu.png)

### Your First Song, in Six Steps

1. **Title** it, and pick the **Key** if you have one in mind (or leave *as written*).
2. Write the **Style**: language, genre, voice, instruments, tempo. One or two plain lines are enough. The ♪ beside it lists 200 instruments with what YuE2 really plays (see *Creator*).
3. Paste the **Lyrics** with section tags on their own lines: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Keep **Full plan** as the planning mode: YuE2 writes a melody and chords first, then the song.
5. Press **Generate song**. The run shows its stages: the score, the music tokens, the sound, the decode.
6. The take opens in the middle, with its player, its score and everything to make it again.

> Measured on an RTX 3090: a 6:12 song in Direct mode took 126 seconds, a 7:25 song in Full plan 198 seconds (the score is written first). Shorter songs are faster.

### The Player, the Takes and the Server Log

- **The player** at the bottom: the waveform across, one soft cloud with the part already heard in the accent (a click jumps there); under it the take (its artwork when it has one, its title, the first words of its style, 👍 👎 ★), then **shuffle**, previous, play, next and **repeat** (off · the whole list again · this take again, marked 1), then the time (a click on the total turns it to the time left), *play on click* (a click in a list plays the take at once), *play on* (when a take ends, the next one down the list starts), *play new takes* (a song made here plays when it is done, unless something plays), 🔔 *a sound when a run ends* (two notes up when it is done, once for a queue of runs, two down when one fails; none over a new song that starts playing by itself), the **speed** (0.50× to 2.00×, the pitch kept), the volume and a dot for the state (it beats while a take plays). What you do not need this moment stays faint until the pointer comes; every icon says what it does when the pointer rests on it. The pointer over the waveform shows the time a click would jump to. The keyboard's and a headset's media keys drive the player, and the desktop's media panel shows the take. ⏪ and ⏩ go to the last or the next mark every 15 s from 0:00, ← and → to the marks every 5 s (Shift: 30 s). The status pill at the player's right end (green while a take plays, the accent's colour while one is made) opens the take or the run; with Compose lifted over the room it turns the frame to the take's. A right click on the wave, the picture or the title opens the take's menu, as in a list. The wave shows the take's sections: the lyrics' own tags, each where Whisper hears its first line (once a take, about half a minute; by itself on a machine of two cards or more, else the take's menu → *Find the sections by ear*); a take never heard shows the marks of its score. A thin line at each start, its name at the foot; a click by a line goes to the section's very start; the pointer over the wave shows a card with the section, its time and its lines as written, the line sung there lit; a section marked ? was not heard clearly. The pointer resting on the wave a moment brings up the take's whole spectrogram over the player (the spectrum switch beside 🔔 turns it off): as wide as the wave and in time with it, about a third of the window high, the section's card above it; in it the sections, the spectral centroid as a magenta line (where the sound's weight sits: its brightness), the RMS in a lane at its foot with the take's own average dashed, the playhead; under the pointer its time, the spectrum of that moment beside the line with its loudest frequency and note, and up in the picture the frequency there, its note and its level. *Log* or *Linear* in its head; a click goes there as on the wave; the pointer away or Esc takes it down. The take is measured once, by the lab, as for its Spectrum.
- **Two rows or one**: the player keeps the waveform over its controls where songs are heard and compared (the Creator, the Refiner, the Librarian) and is one row in the Writer, the Artist, the Trainer and the Engine, and in the Creator while a frame is lifted or the lyrics are over everything. After a reload (F5) it comes back with its take and its place. In the Artist the Takes start folded and the server log stands at the left.
- **The cards live**: in Engine → GPUs each card has a row of its own under it, its load and its memory a bar a second for two minutes, with its temperature and power; the server log, unfolded, shows the cards that have a role beside it, each headed by its role, the studio's card framed.
- **The line to the studio** shows beside the server log (*Forge · 85 ms*, or *here* on the same machine). When the studio is far, a like, a favourite or a pin shows at once and the studio only confirms it.
- **Takes** on the right: search with words, `*` and `?`; *Favourites*; fold the column with »; ⋯ for the list's own actions.
- **The server log** sits right above the player in every room: folded, it shows the last thing the engine said (in red when something failed); unfolded, ten lines, *Follow*, *Copy*, and the way to the whole log in Engine. With a frame lifted over the room it stands at the left, off the frame's buttons. The arrow on its inner edge takes it to the other side of the page, and each room keeps its side (the Artist's is the left). Its outer edge drags it wider, up to 1200 px (kept; a double click gives its own width back); with the cards beside it, it is 920 px wide, their column 390. The frame has two views, **Server** and **Artist** (the Artist's own log: what was asked, what the lab answered, each run's way to its end), and each room opens on its own; **⧉** opens the log in a window of its own, over every window in Chrome or to carry to another monitor.

![The server log, unfolded](guide/log-dock.png)

## Creator

### Compose: The Song Form

![Title, key, seeds and style](guide/compose-top.png)

- **Start from an idea**: one line about the song; the chat model of the Writer drafts the title, the style and the lyrics (*Write the brief*).
- **Title**, **Key**: the key goes into the score (`K:`). With a score in the form, a new key moves it there; without one, the choice waits and moves the score that comes.
- **Music seed** and **Sound seed**: the dice for the two halves. Empty is random; a number repeats a take. Keep the music seed and change the sound seed to hear the same song rendered differently. They stand first in *Sampling and Denoising*. Beside each, its **mode**: *Random (−1)* a new seed each run (the field empty), *Random, fixed* a random one put in and kept, *Fixed* the one written, *Next* and *Previous* move it after each Generate past the seeds it used (the versions for the music, the variations for the sound). The Artist's seed has the same modes.
- **Style**: language, genre, voice, instruments, tempo. *Save style…* keeps it under a name. **♂** and **♀** in its head put *male vocals* or *female vocals* into it (in place of the other gender's word, else before the BPM); the lit one takes its tag out.

### The Instruments Cheat-Sheet ♪

The ♪ beside the style opens a table of 200 instruments the studio probed: their family, home, how they sound (English and Russian), and the words that call them. ▶ A and ▶ B play two 60-second probes of each. The verdict per row comes from a human ear: heard, questioned, or **NOT IDENTIFIED IN YUE2** (YuE2 does not know it; it needs more sophisticated prompting). A click copies the name and asks where it goes: at the end of the style on a line of its own, or in place of it; a name the style holds is marked in the table, and the table's text can be selected and copied.

**YuE2 decides when an instrument comes in.** A style line is a request, not an order: however hard you ask, the model brings an instrument in where its training says the song wants it, and the seed decides a great deal. The same prompt gave one take with the instrument and one without. Hear several seeds before you judge an instrument.

**Heard, but not as real as a live one.** Many instruments do play, yet less clearly and less true than the real thing: that is what YuE2 knows of them. The verdicts say whether YuE2 plays an instrument at all, not how real it sounds. Making it real is the work of an **instrument LoRA**: a few dozen clean recordings of it, trained in the LoRA Trainer.

![The instruments cheat-sheet](guide/instruments.png)

### Lyrics and Text Profiles

- Section tags on their own lines; YuE2 knows `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- **Text profile**: paste a whole text, pick a profile, *Apply*: its rules (cleanup, phonetics) and its shape (`[Intro]`, `[Verse]` at blank lines, `[Interlude]` after long paragraphs) make it ready to read. *Undo* brings the text back. Profiles are made in the Writer.

### The Lyrics' Meter and the Phonetic Hand

- **The meter** beside the lyrics: each line's syllables as a bar against its group's ruler — verse and bridge one group, the pre-chorus its own, the chorus its own, any other section its own. A pause, a break, a silence, an interlude, a prelude or an instrumental cue inside a sung section opens no group: its name stands dimmed beside it and the section's ruler goes on. Tags are never counted: a line of tags alone (`[Break] [Silence]`) counts as none, a tag inside a line is left out. The ruler stands at the group's usual length; within a syllable the bar is green, two or three off amber, more red. What is in round brackets is drawn hatched after the bar: YuE2 may sing it. Under the box: the lyrics' characters, syllables and lines, the section tags, the brackets and the phonetic hand; the browser's spelling check in the lyrics' language (switched off there); a box drawn taller by hand keeps its height until *Auto height*.
- **Line numbers and marks**: the lyrics box numbers its lines as a code editor does (a wrapped line once, on its first row; *Line numbers* under the box switches them off). **Alt+K** marks the cursor's line or unmarks it, **Alt+J** goes to the next mark, **Alt+Shift+J** to the one before, **Alt+Shift+K** clears them; a marked line's number is amber, and the marks follow their lines as you write above them. Every [tag] lies under a thin amber layer. The Writer's lyrics have the same. As in mcedit: **Alt+O** clears the marks too, **Alt+L** goes to a line by its number, **Ctrl+Y** deletes the line, **Alt+↑** and **Alt+↓** move the line (or the lines selected) with its mark. *Keys* under the box lists them all, and the Writer's LYRICS label says them on hover. **⤢** beside Lyrics lifts the box over everything, 60 % of the screen wide and four tenths larger, with all of this, and its own −, + and ⟲ for the text's size (kept in this browser); Esc puts it back. Beside **⤢**, two buttons keep the lyrics as plain text: the first saves them as a `.txt` named by the Title, the second puts a `.txt` (UTF-8) in their place (it asks first when the box has words, and **Ctrl+Z** in the box brings them back; an empty Title takes the file's name).
- **Brackets checked**: a «[» not closed on its line, a «]» with none open, a «[» inside a tag and an empty tag number their line red, and *Tags not closed or astray* under the box goes from one to the next; a round bracket left open or closed with none open is amber (an echo may run on). A «[» still being typed is left alone until the cursor leaves its line. **Generate asks first** when a tag is broken: what follows a «[» not closed may be lost in the song and its end may go wrong; *Go to the line*, or *Generate as it is*.
- **Stress marks astray**: a mark off a vowel — at a line's start, after a space or a sign, on a consonant, a second one on the same letter, or a spacing ´ in its place — shows a red button under the box (*Stress marks off a vowel*) and a mark before the line's count; the button selects each one in turn. A word with two marks gets an amber one: meant, or a slip? In the count a stress mark is no syllable; ע and a Latin vowel inside a Russian word are. A syllable is one vowel sound, one note, counted by each language's rules: one vowel letter in Russian, Ukrainian and Belarusian (and as the meter measures the time a line takes, a word with no vowel — с, в, к, з, й, ў — and a stop closed against an affricate inside a word — глу-п-цо́в — take a beat of their own, drawn lighter: «Я же вижу глупцо́в с приду́рческим планом» is 12 syllables and 2 such beats, 14); in Greek αι, ει, οι, ου, αυ, ευ are one (a diaeresis or the accent parts them: τσά-ι); in Spanish and Italian a weak i or u joins its neighbour (cie-lo, cuo-re), two strong vowels are two (po-e-ta); in English a silent final e is none (make, but ta-ble); Hebrew counts its vowel points; Chinese, Japanese and Korean one sign each. Latin words count as English, Spanish or Italian: by the style's word for the language, else by the lyrics' own small words.
- **Ctrl+F** in the lyrics or the style (and in the Writer's boxes) finds in that box alone: Enter and Shift+Enter go through the matches, Esc from the find field puts the cursor back with the match selected; from the box itself (clicked into elsewhere) it closes the bar and leaves the cursor where it is, and words typed there meanwhile do not move the view. A stress mark is not looked for, ё is е, and о and а find ע and the Latin o and a too. **F4** or **Ctrl+H** opens a second row to replace: **Enter** puts the new words in place of the match in hand and goes on to the next, **Ctrl+Enter** (or *All*) replaces every match at once, and one **Ctrl+Z** in the box takes it back; **Aa** (**Alt+C**) finds only as the case is typed.
- **Tags under a «[»**: a «[» typed at a line's start in the lyrics (the Creator's or the Writer's) opens the section tags, as a code editor offers its words, in the order a song goes through them, from Intro to End. Letters typed after it narrow the list (in a Russian or Ukrainian layout too), a number numbers the tag (`v2` is `[Verse 2]`), and lyrics that number their verses are offered the next one. ↑ ↓ choose, Enter or Tab puts the tag on a line of its own (Ctrl+Z takes it back), Esc or `]` closes the list. Intro, Outro and End already in the lyrics stay in their place, dimmed, with their line: ↑ ↓ reach them and read what they are, but they are not put in twice. Ctrl+Space opens the list, and at a line's start types the «[» itself. The list stands in two columns: the tags, and beside them what the one in hand is (in our words, after Genius's guide to song sections) and how often the 110 official examples write it; the box keeps its size as the list narrows. Sections none of them writes are marked TEST. **A second and a third tag** on a line: a «[» typed right after a line's tag gets its space by itself and offers the tags that are no section (who sings, as the examples write it; Female Vocals, Break and Silence marked TEST); Enter puts it on the same line, a «…» in it selected for your words; Ctrl+Space types « [» there too.
- **The phonetic hand** (Viktor's, from SUNO; YuE2 follows it as well):
  - **A stress mark** (the combining acute, U+0301) after a vowel: `обе́щано`, `сули́т`. It holds in more than 95 % of lines.
  - **A capital stressed vowel** pushes the stress where the rhyme wants it, against the dictionary: `базилиО́`.
  - **ע (ayin) inside a Russian word** sings as a soft о/а, as living speech says an unstressed о: `кעмо́рка`, `пעле́но`, `Ка́рлע`. It also brakes rap that runs faster and faster.
  - **A Latin o inside a Russian word** sings a hard, open o where the model would say а: `Кo дну`.
  - **A stretched vowel** (`о-о-о`, `БУ… РА… ТИ… НО`) holds a note; where the music has room for it, not on every line.
  - **[Interlude]** between parts makes a pause in rap and slows down speech that keeps speeding up (not always).
  - **Round brackets** may be sung (the first Buratino takes sang them): an echo, a backing line; a stage direction in brackets can come out too.
  - **A Hebrew word with its vowel points** (`רוּחַ`) the model says better than in transliteration.

### VAE, Sliders and LoRAs

- **VAE** turns the written song into sound: **Standard** (the best sound), **Legacy** (the benchmark one), **Blend** (a mix of the two, an add-on). A finished take can add another decode later from its own page. It is chosen in the **☰** menu, under the model, for the songs to come; a take decodes again with another from its card in seconds (from rc2 every take keeps its latents; one made before renders its sound again).
- **Sliders**: genre and voice shapers applied while the music is written; 0 is off, 1 is full.
- **LoRAs**: adapters for the music half, the sound half, or both, each with its own strength.

**A slider's curve.** A slider pushes with its strength from the first second to the last: flat. The small picture beside its strength opens its curve: **Arch** lets it rise to the full strength in the middle of the song and ease back at both ends; **Draw** shapes it by hand: drag a point up for a flare, down for a fade, along the song to move it; double-click to add a point, double-click a point to take it out. The strength you set is the top of the curve. The curve runs over the music as it is written, from its first frame to the end of the song's length, and goes into the take's request, so a take made again runs the same curve.

![LoRAs: each strength on a road from green to red, and the music half together](guide/loras.png)

Every strength sits on a **road**: green is safe, yellow is its limit, red is past it. The limits are measured:

- a score adapter (one that plans ABC) up to 1.0 green; any other music half up to 0.5 green, 0.75 at most; adapters trained in this studio are stricter on the music half (0.5 green, 0.6 limit);
- the sound half up to 1.0 green, 1.5 limit;
- **Music, together**: stacked adapters add up. Each may sit in its own green and the sum still break the score. Measured on real takes: whole up to **2.25** together, broken from **2.5**. The bar under the adapters shows the sum on the same road.

**Double-click** a number to type a strength exactly. The hints under the block say what matters: a trigger word missing from the style, an adapter trained in another planning mode, a strength past its limit. While the pointer is on a slider or drags it, the exact strength stands over the pointer in its road's colour. The Instrumental adapter stops at 1.0, where it starts: past it, its scores go astray.

> **An instrumental score adapter with words to sing.** Such an adapter plans scores *without a vocal line*. At 1.00 it gave a take with one note in 127 vocal bars: the singer spoke over two looping bars. With lyrics, keep it low, 0.3 to 0.5. The ⚠ beside the LoRAs' name says so when it happens.

### Profiles and Planning Modes

- **Profile** sets the mode, length, sampling, guidance, steps, VAE, sliders, LoRAs and output in one go; the texts and seeds stay. *Save profile…* keeps the current knobs under a name.
- **Planning mode**:
  - **Full plan**, the default: melody and chords written first (an editable score), then the song. Best for new songs.
  - **Melody only**: a melody plan, free accompaniment. Recommended for covers.
  - **Direct**: straight from lyrics and style, no score. Adapters trained without a score belong here.
  - **Instrumental**: no vocals, the official YuE2 recipe. It stands at the right of the planning mode's head.
- **Full or Direct.** Viktor's word after a week of songs: Direct is SUNO's hit and miss (about two good takes in a hundred, by his count); Full is the way for everyone, even without reading a note of ABC: the tags are kept, the sound settles, the speech holds and the tempo can be foreseen. Measured on his rap, fourteen takes of each with Whisper listening: the best take of all was a Full one with his conservative recipe (84 % of the words heard, 76 % in the last quarter). Where Full fails, it fails at the end: a take is as long as its score, and the plan may hold fewer sections than the text (then the last verses are left out, or an earlier one is sung again); after the last words the score's leftover bars play on, and that is the 10–15 s after a song's proper fade, not the guidance. Listen to a Full take's end: *End at…* cuts a tail, *Regenerate from…* writes a lost end anew.

### Covers, Remixes and Your Own Score

- **Cover or remix**: take the tune of a recording (*Transcribe*: its melody only, not the words or the singer), or the melody of one of your takes, and give it a new style.
- **Supply your own score**: an ABC score, followed in Full plan and Melody only. Transpose it (nearest, up or down), move one voice by steps of the scale, import a MIDI file (one melodic line per voice), export MIDI or markers for a DAW, load an example, make it instrumental. **Generate** with a score here asks first: on this score, or a new one (the field emptied, the song model writes one). The score remembers the adapters and the music strengths it was written with (a plan, a take's own score); when those on now differ, a line under it says so, and the question too: at other strengths the music may part from the score, Industrial Rock and instrumentals most. In Full the score stays open while it holds one.
- **Recite the lyrics on a score** (*Lay the lyrics on this score…*, under the score once it reads): the narrator of the studio's promo, for your words. Each line goes on the bars of the score, a syllable an eighth (a sixteenth, as rap is said, where eighths would leave lines out) on a tone of its bar's chord, a breath after a comma and a full stop, the line's last syllable a quarter lower; each section starts on a two-bar phrase after a bar's rest, or after a vocalise when you tick it. The instruments, chords, key and tempo stay; the score's sections follow your tags, with an intro and an outro around them. For spoken word, readings and rap over a bed: make the bed, *Write it from the sound*, then this; it asks first, and Ctrl+Z in each box brings the old text back.

### Sampling and Denoising

![Sampling: the score planner and the music tokens, the token limits locked](guide/sampling.png)

The defaults are tuned. The three **shape** rows (Composition, Performance, Style) move the knobs together in five steps; the knobs themselves are below.

- **Score planner** and **Music tokens**: temperature, top-p, top-k, repetition penalty, penalty window.
- **Min tokens** and **Max tokens** are **locked** against a stray edit: click the 🔒 beside the name to change them, and again to lock them. The floors are fuses: a score may not end before 200 tokens, the music not before 750 (30 seconds; a shorter requested length lowers it to that length). The music's maximum shows as **Max length**, in time (25 tokens a second), with no lock: it is the song's length at most, set here only (Sound and output has no length field).
- Every knob is held inside sane bounds; a value past them is pulled back, and the page says so.
- **Guidance (CFG)**: 1.6 by default in every mode.
- **Sound and output**, the block's lower section: **Denoising steps** and **Solver** for the sound half, **Format** (WAV 24-bit, 16-bit, 32-bit float or MP3 with its bitrate) and **Peak clip**; *Reset output* puts them back.

**A conservative recipe for Russian** (Viktor's, by ear): Composition *low*, Performance *low*, Style influence *high*: the score planner at temperature 0.85, top-p 0.92, top-k 40, the music tokens at 0.85, 0.93, 80, the repetition penalties 1.005 and 1.3 over a window of 100, guidance (CFG) 1.8; 32 denoising steps with Midpoint. No speeding up, rap at a moderate pace. It is the built-in profile *Russian · conservative (Viktor's)*.

### Create ABC Score, and Generate

- **Create ABC Score** writes the score and stops: read it, edit it, then *Generate* renders exactly that score. A score already in the field is written over, after a question.
- **Probes** and **Variations**, beside Generate: Probes is how many probes, the music written anew in each, a music seed each (seed, seed + 1…); the engine writes as many at a time as its batch allows, the rest in further passes. Variations is how many times each probe's sound is rendered from its one music, a sound seed each, the same for every probe: each costs about the time of one sound, hardly any memory. Probes × Variations takes come out: 2 × 4 = 8.
- **Generate song** runs it all. The run shows its stages as they go.

### Babel in the Score

![The engine stopped a run whose score was not a score](guide/babel.png)

When the music half writes garbage for a score (adapters pushed past their limits do that: no key, no meter, colons in runs), the **engine stops the run before any music is made on it**, in seconds instead of minutes. The window says why, which adapters weighed on the music half and how far past their limits, shows what was written, and can bring the music strengths into the green with one click.

### The Take

![A take: download, make again, post, files](guide/take-head.png)

- **The head**: ▶ and the take's buttons on its first row (👍 👎 ☆, the Librarian, rename, delete), and at its end ⇆ and ⤡, which lift a frame over the room; the title under them on one line; how it was made under that.
- **Download**: WAV, FLAC (the same samples, about three quarters of the size), MP3 at the bitrate you pick.
- **Make again**: *Retake* (a new take from the same request), *Reuse* (the request back into the form), *Re-render sound* (the same music, new sound), *Regenerate from…* (keep the start, write the rest anew), *Transcribe this take*, *Trim to the text* (cut a tail after the last sung line), *End at…* (the take ending at the moment you choose, its last 2 s faded; from its kept latents, in seconds), *Fade in…* (its first seconds rising from silence, 2 s unless you say otherwise; the same way).
- **Refiner**: *Spectrum*, *Lyrics check*. **Files**: the request and the score. *Loop…*: 1, 2, 4 or 8 bars on the score's bar lines from the bar where the player stands, seamless (its end runs into its start), saved as a WAV named with its tempo and key.
- **Note**: what works, what to fix, where it goes.
- The card below says how it was made: mode, format, VAE, model, steps, the shape, the sliders, the LoRAs with their strengths, both seeds (copy them to repeat it).
- **Over the room** (⤡) the take stands in two columns: what to do with it, its Style and its lyrics on the left; how it was made, its VAE and its score on the right. A new take opens with its Style and Lyrics folded; the tools stand in framed groups.

![How a take was made](guide/take-info.png)

### The Score

The take's plan as a staff or as ABC: print it to PDF (US Letter, portrait or landscape), export MIDI or markers, *Edit and re-render*, or open it full screen.

## Writer

### Songs as Documents

![The Writer](guide/studio-writer.png)

Every song can live in the Writer as a document: its **style**, **lyrics**, **notes** (Markdown, with a preview) and **params** (every knob of the Creator's form). *New*, *From the Creator* (the form as it is), *Load into the Creator*.

- **Versions**: *Keep this version* at any point; *Restore this version* or take it *As a new document*.
- **The list's width**: drag the edge between the list and the document (← → from the keyboard, a double click for its own width).
- **Takes made from it**: every take whose request came from this document.
- **The song now**: title, style, the score's key, meter and tempo (the style must agree with them), the lyrics; *Edit in the Creator*.
- **Export all** (the disk) and **Import** (the folder): the whole notebook in one file for a backup, every document with its versions, the takes made from it and the trash; an import brings in what is missing, leaves the same alone and puts a document that differs beside its namesake as a copy: nothing is written over.

### Text Profiles

How a pasted text becomes ready to read: replacement rules in order (literal or regular expressions), then the shape (`[Intro]`, `[Verse]` at blank lines, `[Interlude]` after long paragraphs). *+ Rule*, then **Try it from Lyrics** shows what comes out before you save.

### The Writing Room

![The writing room: a chat model drafts, you decide](guide/writer-room.png)

A chat model reads your style, lyrics and score, then drafts or revises them. **Nothing changes until you apply it.**

- **What's the song about?** or what to change; **Help me with** the style, the lyrics or both; **Structure**: the section order for new lyrics.
- The model: a local chat server (vLLM, LM Studio, Ollama: anything with a `/v1` chat endpoint, set in Engine) or any OpenRouter model with its API key. Its field offers OpenRouter's whole list as you type, each model with its price per million tokens in and out and its context; the price of the one chosen stands under the field, and a name the list does not know is said so.
- *Create a draft*, then **Apply draft**, **Use lyrics** or **Use style**; *Undo* takes it back.

## Refiner

### After the Render

![The Refiner: the take on the right, the steps in a row](guide/studio-post.png)

Pick a take on the right; the tools work on it, or on a stem of it. The column on the right holds **the takes refined here**, the newest refine first (*Refined* beside *Favourites* turns it to every take, to start a new one), and after a reload the room comes back to the take it was refining.

Everything made from a take hangs on its **tree** (*Made from this take*), the newest on top: **the original** first, with its player and its FLAC, then every branch, playable and usable as a source for the next step. What runs shows where you look: in the room's head, at the top of the step's own block, and as a beating dot on its tab. Each step's block lists what it made for the take (*Made here*: a click finds it in the tree), and the step open lights its own branches.

**Compare all** (on the original's row, or *Compare* on any branch) opens every version in one player, as SUNO switches versions: the original, the debuzzed, the remasters, the upscales, the stems. A click on another version, or its number (1–9), plays it **from the same second**; Space plays and pauses, ← → move five seconds, Esc closes. The same music in other takes stands in it too, after the original: its re-renders under another VAE or sound seed, each named by its VAE, its seed and when it was made; a take you disliked is left out.

### Import a Track

WAV, FLAC, MP3… from anywhere: it becomes a take in the library (48 kHz, 24-bit), marked *imported*, ready for stems, remaster and the rest. Lyrics are optional; the lyrics check matches against them.

### The Steps and the Chain

![The chain and the steps](guide/post-steps.png)

The **chain** runs several steps in one go: *Debuzz → Upscale → Stems → Remaster → Upscale*, then any of *Artifacts*, *Spectrum*, *Lyrics*. The stems are split from the debuzzed (and upscaled) take and the remaster mixes them, so its preset and de-esser work in the chain too; the first upscale lets the separators hear the whole song, the last one draws anew the top that the stems and the remaster leave (a hiss above 20 kHz, almost nothing above 22). The stems are four unless you choose otherwise. One by one:

1. **Spectrum**: spectrogram, average spectrum, band energy; lay another take over it to compare.
2. **Artifacts**: a tone that will not leave, the VAE's 25-frame buzz in the highs, clicks, clipping, dropouts, stereo that fights itself. A time plays from there.
3. **Debuzz**: YuE2's decoder writes sound in frames of 1920 samples, 25 a second, and its highs tremble with them. This takes out the part locked to that frame clock above 2 kHz. 80 % is the ear's choice; 100 % thins the start.
4. **Lyrics**: Whisper listens and matches what it hears to your lyrics, minute by minute; *Time the lines* for karaoke timing. On the vocal stem it hears the words without the music.
5. **Stems**: four stems (BS-Roformer for the voice, then htdemucs_ft for drums, bass and the rest; the instrumental too), or vocals + instrumental. *Source* is the take or a debuzzed or upscaled file of it, each source with a set of its own; your DAW gets the newest set of each kind.
6. **Remaster**: mix the stems or take the take; clean, de-ess, optionally retune 440 → 432 Hz, loudness (LUFS) and true peak. Each run is a new branch. The preset and the de-esser work on stems before they are mixed: with the take or any single file as the source they are off, and in the chain they work when it splits stems.
7. **Upscale**: UniverSR draws the top of the spectrum anew; the original stays sample for sample below the cutoff. On a remaster (the chain's last step) the whole file is turned down if the new top passes the remaster's true-peak ceiling.

## Artist

The room that paints: a cover for each take, a 16:9 for its video, a 9:16 for a short, from your words, from a picture of yours, or from both. The form on the left, the stage in the middle, the library on the right. The whole room in depth, every control and how it is made inside, with recipes and the numbers: [The Artist in Depth](https://github.com/igrbible/Ruach_Studio/blob/main/docs/ARTIST.md).

### Pictures for Your Songs

Write what you see for the song, in sentences: Krea 2 Muse and Qwen-Image read a prompt as a description, not as a list of tags. Put what is in the picture first, then the light, the colours and the medium (oils, ink, a photograph), and end with *no text* when you want no letters in it. **From the take** puts in the prompt the take in hand got its artwork from, or one made of its title and style, to start from.

**Shapes**: **1:1** (1280 × 1280) for the cover, **16:9** (1920 × 1080) for a video, **9:16** (1080 × 1920) for a short. The shapes of one press share their seed, so they come out as one series: the same scene in the same colours, each composed for its own frame rather than one picture cut three ways. **Variations** draws the next seeds too (the seed, the seed + 1, …), each in every shape.

**Seed**, with its mode beside it: **Random** (−1: a new seed each press, the field empty), **Random, fixed** (a random seed put in at once and kept), **Fixed** (the one written), **Next** and **Previous** (after a press, the field moves past the seeds its variations used). A number typed into the field is that seed (Random turns Fixed); an emptied field is a new seed each press (Fixed turns Random); ⟲ is Random again. The seed of a picture you liked draws it again: each run shows its seed, and **To the form** brings it back with the prompt.

**Three columns**: the prompt and its knobs on the left, the stage in the middle (the run being painted develops there, its progress across its top; else the picture you picked, its buttons under it, its run's data and prompt in a tip beside it, over the library, while the pointer is on the picture), the library on the right; drag the edges between them to widen a column (← → from the keyboard, a double click for its own width). The column's choices stretch with it, never narrower than the painters' names. From a window 920 px tall the room stands whole in it: the page stands still, the form and the library scroll on their own, and Draw's row stays at the form's foot.

**Live preview** (on by default): the place of the picture being painted shows each of its steps, from the noise to the picture, an eighth of its size and seen without the decoder, so it costs nothing; off, the place waits for the finished picture. A bar across the stage's top follows the run, picture by picture and step by step.

**Two runs at a time**: while one goes, **Draw** asks the next one, which waits behind it (Ctrl+Enter too); **Stop**, beside Draw while a run goes, ends the drawing one (else the waiting one leaves the queue); the pictures it finished stay.

### The Painters

**Krea 2 Muse** by Stable Yogi, a fine-tune of Krea 2 Turbo (Krea 2 Community License): **Q4** on a card with 12.5 GB free, **Q8** (finer) with 18.5 GB. A Turbo model, it paints in its own few steps without guidance: about 35 s a picture at 1:1 and 47 s at 16:9 or 9:16 on an RTX 3090, and loading it about 25 s more a press.

**Qwen-Image 2512** (Apache-2.0) from a GGUF at **Q4** (a card of 15.5 GB) or **Q6** (20 GB), or an **fp8 fine-tune** of it (22.5 GB: ComfyUI's single files put into `artwork/Qwen-Image-2512/checkpoints/`, picked under the painter); about half a minute a picture with Lightning, after a minute or two of loading. **Qwen-Image 2.1**, under the Qwen Research Licence (research and evaluation only: not for a cover you sell), paints from words and edits a reference picture by the prompt's words; a mask and *Paint around it* want Krea 2 or Qwen-Image 2512. On a card that holds neither its text encoder nor its painter whole (a 16 GB card, or a card under a lower VRAM limit) both stream from RAM: under a 15.5 GB limit on a 3090, 135 s from words at 4.1 GB at the peak, 129 s editing at 7.9 GB.

Each painter shows only when its files are here; the others are named under the painter. **Engine → Models and LoRAs → Qwen painters** fetches Qwen-Image 2512 at Q4 (31 GB) or Q6 (34.5 GB) with Lightning, and Qwen-Image 2.1 (33.1 GB), each asked first with its size (2.1 with its licence too). From a terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Get painters and adapters…** under the painter lists in the room itself what the studio can fetch for the Artist: Krea 2 Muse, the Qwen painters, four fp8 fine-tunes of Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image and 2512 itself, 20.4 GB each, shared in the studio's models repository by their authors' leave) and seven adapters, each with its size, here or **Fetch**.

**Which card paints**: a press waits in the lab's queue for a card with room, as the takes' artwork and the stems do; while it waits, **Off the queue** takes it back. A card nothing else uses takes a run whose need fits its memory less 512 MiB (the CUDA runtime's own share); a card in use takes it when its free memory holds the need. A Qwen-Image 2512 or Krea 2 Muse painter no card here can hold whole streams its blocks from RAM instead: the blocks that fit stay on the card, the rest come as each is needed, and the picture is the same, slower by what the bus cannot hide (with four adapters on a 24 GB card about a sixth; every block streamed, the Q4 takes 2.2 GB of the card, so a card of 8 GB paints it); another painter no card can hold is refused at once, with the numbers and the painter that would fit. Qwen-Image reads the prompt with its text encoder (Qwen2.5-VL-7B, 15.5 GB) on the card when the room free there holds it, else on the processor, before the painter comes: the picture is the same either way.

**The content filter**: every picture passes the filter Krea 2's licence asks for, whatever painted it (the studio's rule for every painter): one it flags is not kept, and the run says so.

### Lightning

**What it is**: Lightning (lightx2v, Apache-2.0) is an adapter that teaches Qwen-Image 2512 to paint in a few steps without guidance: the model's own long guided way distilled into 8 steps. Its file lives in `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0.85 GB) and comes with the Qwen painters' fetch.

**How the studio lays it in**: with Lightning on, the painter loads it as one more adapter beneath your own LoRAs, at its strength: **1.0** for the GGUF Q4 and Q6 (the base it was distilled from, at the 8 steps its makers give) and **0.55** for an fp8 fine-tune, at 12 steps (a fine-tune has moved away from the base, and Lightning at full strength would pull it back; Viktor's own setting in ComfyUI). The schedule becomes Lightning's own: a shift of log 3 at every size, as it was trained. Guidance is off (true CFG 1): one pass of the model a step.

**With it off**, the painter takes 2512's own way: 30 steps by default (10 to 60) and **guidance** 4 (true CFG with its empty negative: two passes a step). Sixty passes against eight: the painting itself takes some seven times as long, the loading the same, and gives the detail and the light of finished realism.

**Its defaults**: the GGUF Q4 and Q6 paint with it (drafts, smaller cards); an fp8 fine-tune paints without it unless you switch it on (finished realism); a take's own artwork is painted with it (*Engine → Artwork*). The rule behind them: Lightning for drafts and covers, not for professional realism.

**The switch**: in Sampling, with its strength beside it; with it on the steps go 4 to 16 and Guidance hides; off, Guidance shows. Without its file there is no switch, and 2512 paints its own way. Krea 2 Muse has none: a Turbo model, its few steps are its own. The strength is kept for each painter; your adapters' sum (*Together*, below) does not count Lightning.

**What it costs**: on an RTX 3090 at 1328 × 1328, Qwen-Image 2512 with Lightning paints in about 30 s a picture at Q4 (14.3 GB at the peak) and 32 s at Q6 (17.6 GB); an fp8 fine-tune at 0.55 and 12 steps in 37 s (21.0 GB). A take's cover with Lightning took about a minute and a half with the loading and the prompt.

### Samplers and Schedules

**Sampling** under the painter, folded, its values in its summary: the steps, the sampler and the schedule, kept for each painter; **Reset** gives the painter's own back. The steps: Krea 2, and Qwen-Image 2512 with Lightning, 4 to 16; else 10 to 60; a number past the range is kept at its edge. The form's estimate of the time counts the sampler's passes.

**The samplers**: at each step the model says which way the picture lies; the sampler decides how to walk there.

- **Euler**: one pass a step, the plain step; the reference, and the one Lightning was distilled with.
- **Euler SDE**: Euler with a little fresh noise each step: more grain, a little less faithful.
- **ER-SDE**: a stochastic solver of the third order (ER-SDE-Solver-3), one pass a step, the two steps before it kept: finer than Euler for the same time.
- **RES 2s** and **RES 3s**: the refined exponential solver's single-step methods, two and three passes a step, half the noise put back after each; their **ODE** twins put none back, so one seed paints one picture, the closest to the exact path.
- **Heun++** (heunpp2): three passes a step where it can, two, then one at the end.
- **Exponential Heun** (exp_heun_2_x0, and its SDE): a second-order exponential method, two passes a step; the SDE puts the noise back.

A sampler of two or three passes a step costs two or three times Euler's time at the same steps; at Lightning's 8 steps the higher orders change the detail, not the composition. Against the exact path of a toy flow at 8 steps they rank as their orders say: Euler 0.138, Heun++ 0.111, exponential Heun 0.084, RES 2s 0.058, RES 3s 0.046 (the error: lower is closer).

**The schedules** say where the steps are spent, from all noise to none:

- **Simple**: evenly in the painter's own time, its shift kept.
- **Karras** and **Exponential**: more steps at little noise, for the detail.
- **Beta** and **Beta 57**: dense at both ends, sparse in the middle (Beta 57 with 0.5 and 0.7).
- **KL optimal**: the spacing Align Your Steps found optimal.
- **SGM uniform**: uniform in time, the last step dropped.
- **Bong tangent**: two arctangent slopes, from all noise to half and from half to none.

**What two matrices showed** (54 pictures through a test lab, one prompt, one seed): every sampler and schedule painted a whole picture on Krea 2 Muse. On Qwen-Image 2512 **with Lightning, Karras, Exponential and KL optimal can paint the subject twice** (two lighthouses where one was asked): with Lightning keep Simple, Beta, Beta 57, SGM uniform or Bong tangent. **Without Lightning, Euler SDE paints Qwen soft and hazy**: Euler, ER-SDE or RES keep the detail. The form says both when they apply.

**Where they come from**: written for the studio from the methods' papers and ComfyUI's formulas (GPL-3.0, which the studio's AGPL may take); RES4LYF's were read for their mathematics only, as its licence bars commercial services: none of its code is here; Heun++ is Carzit's (MIT).

### Regions

**Regions** under *Sampling*, folded: up to three parts of the frame, each a place (a half, a third, a quarter or the middle; a small map beside it shows where) and words of its own. At every step the painter is asked once more for each region, with the prompt and the region's words, and its answers are blended by soft-edged boxes, as Latent Couple does; the rest of the frame follows the prompt alone. So the prompt says the whole scene and a region what stands there: *two animals in a snowy forest clearing*, then *a red fox* on the left half and *a white owl on a stump* on the right. Each region costs a whole pass more a step (on a 3090 at 16:9, Krea 2 Q4: 48 s alone, 137 s with two regions; Qwen-Image 2512 fp8: 141 and 281 s). Kept in this browser; a region without words is not sent; **Again** paints with the run's own. Krea 2 and Qwen-Image 2512; Qwen-Image 2.1 edits by words and paints without them.

### Adapters

**LoRA** under the painter: the adapters of its family (Krea 2, Qwen-Image 2.1, Qwen-Image 2512, SDXL), up to four, each at its strength (0 to 1.5); a click on one of its trigger words puts it into the prompt. **Add…** opens the library: the folders on the left, the cards with their pictures, a search. The adapters live in the studio's `artwork/loras/<family>/` (`krea2`, `qwen-image-2.1`, `qwen-image-2512`, `sdxl`): any folders inside become groups, and a picture beside a file with its name (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) shows on its card. Get them from Civitai by their base model (Krea 2, Qwen, SDXL 1.0) and put the `.safetensors` there; **Look up on Civitai** sends each file's SHA-256 and nothing else, and keeps the answer beside it (`NAME.civitai.info`: its name, base model and trigger words, and its first picture rated safe when it has none). What ComfyUI's LoRA Manager or Stability Matrix wrote beside a file is read as well. An adapter made for another model, which would reach none of the painter's layers, stops the run and says so. A right click on an adapter's row **mutes** it: it stays in the list at its strength and leaves the run (**Unmute** brings it back); an adapter at nought is not loaded either. The seven adapters their authors let be shared come from **Get painters and adapters…**.

**Together**: from two adapters, a bar under them gives their strengths' sum on the Creator's road: green to 1.2, amber to 1.8, red past it. Stacked adapters add up, and past about 1.8 a picture burns (its colours and edges overdone) however modest each one is; the zones are a first measure for pictures, to be set by eye. Drag the bar to move them all at once, each in proportion to where it stood.

### A Picture to Paint From

**Reference picture**: a picture to paint from, as image to image: drop one on its place under the prompt, paste one (Ctrl+V), choose a file, or take the stage's picture with **As reference**. **How much it may change** says how far from it the painting begins: 0.3 keeps it nearly as it is, 0.6 keeps its composition and changes its matter, 0.9 paints the prompt's scene in its light and colours, 1.0 paints anew. Each shape is covered by the picture and cut from its middle; **Again** paints from the run's own; ✕ paints from the noise again.

**Use it** under the picture says how: *to paint from* (as above, by the form's painter, as far as *How much it may change* says), *to edit by words* or *for its style only*, both by Qwen-Image 2.1 when it is here (off otherwise). Edited by words, the scene stays and the prompt says what changes (*the same lighthouse in a snowy winter night*: the snow came where it belongs, the tower and the rocks kept). For its style, the prompt's own scene is painted in the picture's technique, brushwork, palette and light, nothing of its subject kept (the lighthouse in oils gave *a red fox in a snowy forest under the moon* in its brush). Either way the run is Qwen-Image 2.1's whatever the form's painter: the form's model, sampling, adapters, mask and canvas are not sent, and its licence (research and evaluation only) holds. About two minutes a picture on a 3090.

**Mask…** beside it paints over the picture what to repaint (Paint, Erase, the brush, Invert, Clear): the rest stays exactly as it was, as inpainting. **Paint around it** holds the whole picture in each shape's middle and paints the edges anew (a square cover into a 16:9 or a 9:16), as outpainting. **The take's cover** takes the cover of the take picked on the right. With a mask or **Paint around it**, four options under the picture: **Grow** (the mask grown by so many pixels, or shrunk), **Edge** (how soft its edge is), **Soft** (soft repainting, as differential diffusion: where the edge is grey the picture changes only in the last steps, so no seam) and **Grain** (how much of the new paint the kept part takes, its grain and light sewn to the new; 0 keeps it exactly).

**Canvas…** beside **Mask…** opens the canvas, as InvokeAI's: each shape's frame a tab on top, saying how it will be painted (**from it**: the picture covers the frame and the run paints from it, image to image at the strength asked; **around**: the part of the frame it leaves bare is painted around it). On the board **Move** (V) drags the picture, or a corner to scale it with the opposite corner kept; **Brush** (B) and **Eraser** (E) paint the inpaint mask over it; **Hand** (H, or Space held) moves the board; the wheel zooms, Alt+wheel scales the picture about the pointer, the arrows nudge it. On the right the layers (the mask with **Invert** and **Clear**, the reference with its opacity on the board only) and its place in numbers (width, X, Y in the frame's share); on top **Fit**, **Fill**, **Centre** and **Same in all** (the picture as large in pixels in the other frames), undo and redo (Ctrl+Z). **Done** keeps the places with the reference and the mask in the form; under the strength the form says how each shape lies, and ✕ takes it off the canvas.

### The Stage and the Library

A click on a picture puts it on the stage with its run under it; a click on the stage's picture (or a double click on a picture) opens it over the page in its own shape (← → walk the run, or the gallery when it was opened there; Esc closes), with ★, **To the form**, **Set as cover** and **Download** (PNG, full size).

**Runs or Gallery**: the runs show each press of Draw with its prompt and seed, the newest on top; the gallery shows every picture of every run in one grid, the newest first, by shape (1:1, 16:9, 9:16) or starred (☆ on a picture stars it), in three sizes, in even tiles: equal columns, every tile the same box, each picture whole in it.

**Compare**: the stage's **Compare…**, then the other picture picked in the library: the two lie one over the other under a divider you drag (← → move it), or side by side (S); X swaps them, Esc closes. **Ctrl** (or ⌘) **+ click** picks pictures and **Shift + click** a range: the library's bar then stars them or puts them in the trash at once (Esc lets go).

**A picture's menu**: a right click on any picture (a run's, the gallery's, the stage's, the one over the page): **Over the page**, **To the stage**, **To the form** (its prompt, seed and shape), **All of it to the form** (its painter, fine-tune, sampling and adapters as well: Draw paints that picture again), **As reference**, **Compare…**, **Set as cover**, **Upscale** (2K or 4K, the sizes they give), **Star it**, **Pick it**, **Copy the prompt**, **Copy the seed**, **Download**, **The file in a new tab**, **Its run** (the Runs look, its card lit), **To the trash**. A run developing on the stage has none. Over the page the menu stands over the picture and has the keys while it is open: Esc closes the menu, the next Esc the picture.

### Upscale

**Upscale…** on the stage makes the picture **2K** or **4K**: its long side 2560 or 3840 px (a square cover 2560² or 3840², a 16:9 2560×1440 or 3840×2160), with an upscaler (ESRGAN, DAT, HAT, SPAN and their kin, read by spandrel) picked in the row that opens (kept; 4x_Nomos8kDAT first when it is there); each button's tip says the size it gives, and a picture as large already has the button off. The model runs as often as the size needs (twice at most) and the result is brought to the exact size. The large picture is a run of its own beside its source, under a minute on a 3090; **Again** upscales the same picture again, perhaps with another model. The upscalers live in the studio's `artwork/upscalers/` (`.pth` or `.safetensors`, folders allowed); OpenModelDB lists hundreds: mind each one's licence.

**Second pass…** beside it paints the picture over larger, as Viktor's ComfyUI workflow does after its first pass: the picture brought up **×1.5** or **×2** (by nearest, as his) and painted again by its own run's painter, fine-tune, adapters, prompt and seed, from part of the way (*How much it may change*: 0.3 keeps the drawing and adds detail, 0.5 sharpens its matter, 0.7 repaints its forms). The steps, sampler, schedule and Lightning are the form's when the form paints with the same painter, else the run's own: his recipe gives the second pass many steps and no Lightning. A 16:9 of 1920×1080 comes out 3840×2160. Measured on a 3090: Krea 2 Q4 at 2560² in 86 s (14.5 GB at the peak), Qwen-Image 2512 fp8 at 3840×2160 in 220 s with 12 steps and Lightning (22.9 GB). Not for Qwen-Image 2.1, which edits by words; no mask or canvas with it. **Extra noise** in its row (0.6 first, as his) and under a reference's *How much it may change* (0 first) is his workflow's InjectLatentNoise: fresh noise on the picture before the painting starts from it; 0.3 brings new grain and detail, above 1 the picture's forms begin to break.

### A Cover for the Take

A square picture has **Set as cover**: it becomes the cover of the take in hand (pick one on the right), in its card, in the player and in its MP3. The cover it had is kept beside the take (`artwork-removed/`), as a redraw keeps it, and the other letter of an A/B pair gets the new one too when it has none.

**A take's own artwork** (*Draw artwork* in its menu, in the Librarian, for one take or many) is painted by the painter in **Engine → Artwork**: by the cards (Krea 2 Muse Q4 from 16 GB, else SDXL), or the one you choose: Krea 2 Muse Q4 or Q8, SDXL CyberRealistic, and the Qwen painters this machine has: Qwen-Image 2512 Q4 or Q6 and each fp8 fine-tune with Lightning, Qwen-Image 2.1 with its licence said (not for a song that is sold). A fine-tune chosen that is no longer here gives way to the cards' choice, and the artwork says who painted it.

### The Artist's Trash

The runs stay in the studio's `artist/` folder. **Trash** on a run moves it to `trash/artist/`; the stage's **Trash** puts a picture aside. The **Trash** look beside Runs and Gallery shows the pictures put aside first, each with **Restore** and ✕, and **Restore all**; then the runs in the trash, each with **Restore** and **Delete for good**; **Wipe out** at its head deletes all it shows. Each deletion asks first and cannot be undone.

**Trash (Art)** in the Librarian's column, under Out of sight, holds the art put away in one list: the Artist's runs in the trash, the pictures put aside, and the covers taken off the takes (by a redraw, by Remove, by a new cover), each with its picture and what it weighs. Tick them to give them back (a cover goes back to its take, the one it has now kept in its place) or to delete them for good, asked first; with none ticked, **Wipe out the art's trash**. A frozen workspace's covers stay as they are.

### The Artist's Log

The server log's frame has two views, **Server** and **Artist**, and each room opens on its own: the Artist's room on the Artist's. The Artist's log, kept in this browser (its last 400 lines), says what was asked (the painter, the fine-tune, the shapes, the seed, the sampling, the adapters), what the lab answered (a refusal in its own words), each run's way to its end (waits and why, paints on GPU N, done, stopped, failed and why), and the lab's own lines about the Artist. **Copy** takes the view's lines; folded, the frame says the view's last line. **⧉** opens the log in a window of its own, both views mirrored: in Chrome it stays over every window (Document Picture-in-Picture); elsewhere it is a window to carry to another monitor. The window carries the cards live beside the log; the frame folds while it is open and unfolds when it closes, if it was open.

### Coming to the Artist

The title and the artist's name written on a cover; the versions of a take's picture; SeedVR as an upscaler (with the DAW phase, in 2.1.0).

## Librarian

### Every Take

![The Librarian](guide/studio-collection.png)

- **The heading** names the collection open (*Librarian › Fosforida*) and what it holds: takes, hours, likes, favourites, notes, how they were made.
- **Workspaces** on the left: All, Favourites, Not in a workspace, your workspaces, *+ New workspace*; Hidden and the Trash out of sight. Right-click a workspace for its **locks** (*Lock Workspace Deletion*, *Lock Tracks Deletion*): a 🔒 by its name, and nothing in it goes to the trash. The 💎 workspaces (the studio's public sets) stand at the tree's foot, by name, and the 💎 … LoRA ones lowest of all.
- **Search** with words, `*` and `?`; **sort** newest, oldest, by title, longest; **Tiles** or **List**: all three in the heading line, beside the counts.
- **A card** wears its take's artwork in its top right corner, beside the title, when it has one (*Draw artwork* in the take's menu); a click shows the picture whole over the studio, where ‹ › and the arrow keys walk the pictures of the cards shown, ▶ plays its take and Esc closes. The card that plays glows with the song's own peaks.
- **Fresh takes**: a take you have not played yet wears a light dashed line; its first play takes it off. A regenerated take carries a *regen* badge and keeps its note, like and star.
- **The workspaces column**: drag its edge to widen or narrow it; « folds it away, and the cards grow wider: their columns stay, so the eye keeps its place.
- **Sections**: a workspace can hold sections, two levels deep at most (⋯ beside its name → *New section…*), to sort what is in it without a new workspace each time. A workspace shows its sections' takes too. Whatever the Refiner makes something of goes by itself into the section *Refined* of its workspaces.
- **Drag a card onto a workspace** on the left to move it there (all the checked ones, when it is checked); hold **Ctrl** to add it there and keep it here too. The studio asks first, and Ctrl+Z gives it back.
- **Pinned takes**: up to four in each workspace, in a strip of their own tone above the cards (right-click a take → *Pin here*; × unpins). When you check takes, the bar of the checked takes the strip's place, so the cards never move. That bar is a row of framed icons: the choice, the marks, the workspaces, the export, and the trash at its end; each says itself on hover.
- **Filter** (the button at the end of the search row) opens a window as the workspace chooser does: tick what to look for in three groups (how it was made: generated, imported, regenerated, re-rendered; marked: liked, disliked, favourites, with a note, with artwork; what it has: stems, debuzz, remaster, upscale), each with how many takes of the place, and how the ticked join: all of them (AND), any (OR) or none (NOR). *Show* applies them; the button then says how many are on and how they join.
- **Select** several, as in a file manager: check one, and from then on a click anywhere on another card checks it too (Shift: the whole range). A drag on the empty space between the cards draws a band that checks what it touches; **Ctrl+drag** draws it from anywhere and keeps what was already checked. The bar of the checked floats above the player: favourite, add to a workspace, move to one, take out of this one, hide, export a ZIP, to the trash.
- **The trash** gives back, or wipes out after you confirm. **Trash (Art)**, beside it in the column, holds the art put away (the Artist's runs in the trash, the pictures put aside, the covers taken off the takes) and gives it back, or deletes it for good after you confirm; a frozen workspace's covers stay.

### A Take's Menu

![Right-click a take](guide/collection-menu.png)

**Regenerate with a new seed** (above the Writer in the take's menu): the take made again from everything it was made with, but new seeds; the new one takes the old one's workspaces and note, and the old one waits in the section *Sourced for Regeneration* of its workspace (its workspace does not show it among its own) until you empty it; the new one keeps its note, like, star and picture. A probe comes out its full two minutes. Play, open in the Creator or in the Refiner, the sheet (its score), the datasheet (all it was made with: the style and the lyrics, the score drawn, every knob, the LoRAs and sliders with their strengths; a Direct take has no score, and *Write it from the sound* asks the transcriber for one), like, dislike, favourite, a note, rename, **workspaces** (one take can sit in several), **move to** one workspace (on a checked card: every checked take, out of the workspace open), hide, send to the Writer, copy, download, **export to DAW** (REAPER project or DAWproject, on any take: with its stems once the Refiner has split them), the trash. **On a checked card, with others checked**, the menu acts on all of them, and its head says how many: like, dislike, favourite, artwork, the artwork taken off, workspaces, hide, a ZIP; drawing artwork for several and regenerating several ask first, as they cost a card's minutes.

**Draw artwork**: a small language model (Qwen3-4B) reads the take's style and words and writes one picture prompt; Krea 2 Muse paints it, 1024 px, in about half a minute on a 16 GB card (on a smaller card SDXL, CyberRealistic XL; *Engine → Artwork* picks the painter). It shows in the player, on the card, in the desktop's media panel, and inside the MP3 you download (as its front cover). Once a take has its picture, the menu says *Open the artwork* (over the page, as a click on the card's picture or on the player's square) and *Redraw artwork* (a new prompt and a new picture; the old one is kept beside the take, in `artwork-removed/`). The two models come with `heresy/fetch-heresy.sh --artwork` (14 GB, asked first). *Engine → Artwork* offers the Qwen painters here too: Qwen-Image 2512 and its fp8 fine-tunes with Lightning, and Qwen-Image 2.1 (see Artist › A Cover for the Take).

### The Instruments under the Style

Under the Style box, the studio names what your prompt asks for: a chip for each instrument and style of the cheat-sheet it finds, coloured by what the ear found (green heard, amber questioned, red not played by that name) and wearing the instrument's picture. Rest the pointer on one for its card: the picture, its home, how it sounds, ▶ A and ▶ B with their seeds. A click shows the picture whole. **Alt+I** opens the cheat-sheet from anywhere.

### Artwork: What Draws It, What It Cannot, Another Painter

**What draws it.** A small language model (Qwen3-4B) reads the take's style and words and writes one picture prompt, its subject first; Krea 2 Muse paints it (1024 px), or SDXL where Krea does not fit (*Engine → Artwork*). When the take is named for an instrument (an instrument's probe), the studio tells both how the instrument looks and where it is at home, and Omni (the listener's model) looks at the picture: when it does not find the instrument, it writes the prompt again from what it saw, and the painter tries once more, three pictures at most. About half a minute a picture on a 16 GB card. A Qwen painter chosen there paints with Lightning: at 1328 px, kept at 1024.

**What it cannot** (a disclaimer, said plainly): the painter draws what it knows. An instrument it has never seen by name (the duduk, the morin khuur, the khomus, crystal singing bowls…) comes out as a guess: a wooden pipe, a violin, kitchen bowls. Where Omni found the instrument in none of the three pictures, the picture is marked **≈ a guess**, in the overlay and in the instruments' cheat-sheet. An artwork is the take's mood, not a reference picture of an instrument: to know how an instrument looks, look it up.

**Pro tip: another painter.** When the painter is SDXL (chosen in *Engine → Artwork*, or on a card under 16 GB), it is whatever SDXL the link `artwork/SDXL-Artwork-Model` points at; ours is `CyberRealistic-XL-v10`. Put another SDXL finetune beside it, as a diffusers folder or as one `.safetensors` file (as Civitai gives them), and point the link at it, relative:

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

and back: `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. The next picture uses it, no restart. **Only SDXL finetunes work**: SD 1.5, SD 3, FLUX and other families are refused, and the studio says what it found instead. A Turbo, Lightning, Hyper or LCM finetune wants a few steps and little guidance: when its name says so, the studio paints it with 8 steps, guidance 2 and Euler ancestral. For any painter, a file beside the link sets its numbers: `artwork/SDXL-Artwork-Model.json` with `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (or `"dpmpp"`, the studio's own).

## LoRA Trainer

Tested on our own songs and voices, the trainer is held at 90 % for now: your sets and scenarios are not ours, so tell us how it went (the repository's *Trainer report*: the set, the mode, the settings, what you heard).

### What a LoRA Teaches YuE2

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

**Voice**: *Measure the voice* hears up to twelve of the folder's tracks and says, on speech, male or female and the register (bass, baritone, baritenor, tenor; contralto, mezzo, soprano) with the speaking pitch, and offers a name for the set made of them, as the published voice adapters are named (`voice-ru-m-baritenor-117`): no person's name. On singing it gives the range sung and leaves the voice to your ear. Where the pitch alone cannot tell (140–175 Hz spoken), say ♂ or ♀ and measure again. A draft by measure: the ear decides, and the voice YuE2 then sings may sit higher or lower.

### 2 The Set

A **trigger word** (an unusual word, e.g. `fosforida`) calls the style by name later; the **shared style line** says what is heard. *Make the set* writes `datasets/prepared/NAME/`: 48 kHz audio and a caption per track.

The **listener** (Qwen2.5-Omni, on any card with about 8 GB free) hears every track and drafts its tags; you correct them and *Write into the captions*. It is a draft at any size: read it.

### 3 Train

![A kind, the knobs, a card](guide/train-knobs.png)

Pick a set made in step 2, then a **kind**: it sets the knobs for what you teach (the table under the list), and each can be changed before *Train*. The form, field by field:

- **Kind**: style, voice, language or artist.
- **Run name**: the run's folder (`training/NAME/`) and its adapters' names (`loras/NAME/NAME-eNNN`, among the Creator's LoRAs at once). A name belongs to one run: the page asks for another when it is taken.
- **Trainer**: **Ruach Studio** (the studio's own, on unquantized bf16 weights; it makes the set's latent cache itself; Direct mode) or **AI-Toolkit** by Ostris (the reference; it can also train with a score and on separated vocals). Both save the same LoRA format; on the same set their curves agree epoch by epoch.
- **Base weights**: bf16, the whole model (a 24 GB card), or int8 for smaller cards, a little less exact. The base model's file never changes: only the adapter learns.
- **Steps**: how many in all, one track a step. The sound half hears a 60-second window of the track, cut at random each time; the music half reads the song from its start. The run is rounded up to whole epochs (an epoch: every track once): 2016 tracks for 12 epochs are 24 192 steps.
- **Save every N epochs**: an adapter at the end of every Nth epoch, each to be heard and compared, all kept, with the optimizer's state beside the newest (a stopped run keeps what it learned).
- **Rank**: how wide the adapter is; its share of the weights and its size are in the field's tip (what each rank costs and which for what: below).
- **Learning rate**: how big each step of the sound half is (AdamW, the same for the whole run); the music half's is this times **AR speed**. The kinds keep 0.0001; half of it is gentler, for a long run over a big set; higher learns faster and forgets more.
- **AR weight**, **AR anchor (KL)**, **AR speed**: the music half's three knobs, below.
- **Mode** and **Separate vocals and music**, AI-Toolkit only: **Direct** is for songs made in Direct mode; **Full (score)** and **Melody**, for songs made in those modes, also teach the music half to write a score first, transcribed from every song; **separated**, every song is first split into voice and music, and the music half also learns the voice from the lyrics alone and the music from the tags alone.
- Below the button: the measured VRAM of earlier runs, and which card is free enough now.

| kind | rank | steps | AR weight | AR anchor | AR speed | what for |
|---|---|---|---|---|---|---|
| **Style** | 32 | 1500 | 0.5 | 0.2 | 0.5 | a sound: genre, production, a band's |
| **Voice** | 16 | 1500 | 0.3 | 0.3 | 0.5 | a timbre: the music half held near the base |
| **Language** | 32 | 3000 | 1.0 | 0.1 | 1.0 | diction: the music half meant to change |
| **Artist** | 32 | 3000 | 0.7 | 0.2 | 0.7 | all of it |

### Rank and the Other Knobs

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
- **The material's sample rate**: the sound half works at 48 kHz, the music half hears at 24 kHz. A 24 kHz recording teaches the music half everything, but the sound half only a dull top: resampling adds nothing above half the original rate. For a timbre, give it 44.1 or 48 kHz.

### The Music Half's Three Knobs

Every step teaches the two halves apart. The sound half always learns the sound: to take the noise off its window of the track (the flow loss). The music half learns only when **AR weight** is above 0, and then two things pull on it at once:

- **its lesson** (ar_ce): to predict the song's own tokens from the song's start, word by word and note by note: diction, phrasing, melodic habits, the shape of a song;
- **the anchor** (ar_kl): at each of those places the trainer asks the base model, the same music half with the adapter switched off, what it would write there, and fines the adapter for every step away from that.

A step's loss is flow + AR weight × ar_ce + AR anchor × ar_kl. What each knob does:

- **AR weight** decides whether the music half learns at all, and how hard its lesson pulls against the anchor. At 0 the music half stays the base model (its part of the adapter stays empty: all zeros, measured), the adapter is a timbre on the sound half only, and the anchor does nothing.
- **AR anchor** pulls the music half back toward the base model, so it keeps what the set does not show: singing after a set of readings, other languages, following new words, writing a score. With no anchor it drifts wherever the set leads.
- **The two pull against each other, and only their ratio counts, not their size.** AdamW scales every step by the size of its own recent gradients, so a loss multiplied by a number teaches what it taught before: 0.5 with an anchor of 0.2 is 1.0 with 0.4. Read the anchor as a share of the weight: a tenth of it lets the music half move (Language), as much as the weight holds it near the base (Voice).
- **AR speed** is the music half's real throttle: its learning rate is the learning rate times this, the one knob that makes the music half learn faster or slower. The kinds keep it at 0.5 (Language at 1.0): the music half learns a small set by heart long before the sound half has its timbre.

Measured here (10.10.2026: 40 steps on a set of 60 readings, rank 16, one seed; *moved*: how large the adapter's change to the music half's matrices came out):

| AR weight · anchor · speed | moved | apart from the first row | ar_kl, its last ten steps |
|---|---|---|---|
| 0.5 · 0.2 · 0.5 (Style's) | 1.32 | the same run again: 1 % | 0.257 |
| 1.0 · 0.4 · 0.5 (both doubled) | 1.36 | 5 % | 0.262 |
| 0.5 · 0 · 0.5 (no anchor) | 1.44 | 23 % | — |
| 0.5 · 0.5 · 0.5 (the anchor as large) | 1.21 | 17 % | 0.132 |
| 0.5 · 0.2 · 1.0 (speed doubled) | 2.32 | 99 % | 0.443 |
| 0 · 0 · 0.5 | 0 | nothing learnt | — |

Doubling both changed the adapter by 5 %, against 1 % for the same run twice; the anchor's share moved it by a sixth to a quarter; doubling the speed took it three quarters farther. The sound half shares only the gradient clipping with the music half: between the rows it differed by 4 to 13 %, against 2 % for the same run twice.

What to turn, by what you hear and see:

| when | turn |
|---|---|
| you want a timbre only (a voice from readings, an instrument) | AR weight low with the anchor as large (Voice's 0.3 and 0.3), or AR weight 0 |
| you want a language's diction, a style's phrasing | AR weight 1.0, the anchor a tenth of it, AR speed 1.0 (Language's) |
| ar_ce falls under 0.3 early: it knows the songs by heart | AR speed down, or the anchor's share up; or hear an earlier epoch |
| the adapter sings the training songs' tunes over new words, or loses the lyrics | the anchor's share up: as large as the weight, or more |
| ar_kl stays near 0 and the diction did not come | AR speed up, or the anchor's share down |

### 4 Telemetry

![Both halves' curves, explained under each](guide/train-charts.png)

The runs that are training stand on top of the room with their progress, time left and both losses. A run's telemetry shows its progress, then tiles: its speed, the time it has run and has left, the last values of flow, ar_ce and **ar_kl** (how far the music half has moved from the base model: 0 while AR weight is 0), the VRAM peak and the card; then two curves:

- **Sound half · flow loss**: how well the sound half predicts the noise it must take away. It jumps from step to step (each step draws a random noise level): read the bold line, the running average.
- **Music half · ar_ce**: how well the music half predicts the song's own tokens. Close to 0 it knows the songs by heart; an earlier epoch is then the better adapter.

Hover a curve to read the step, its epoch and the value there. **Compare with…** lays another run's curves over these, dashed. The button beside **The log** puts the two curves one under the other, each the whole width, or side by side again. **The log** opens at the room's foot, as wide as its lines, beside the server log.

### The Epochs Worth Hearing First

![Green: worth hearing first; ✓: in loras/](guide/train-epochs.png)

Every saved epoch is a chip. **Green** ones are worth hearing first, read off the curves: the first epoch whose sound loss has settled, the one with the lowest sound loss, and the last before the music half knows the songs by heart. It is a guess; the ear decides. Pick an epoch: **Into loras/ → the Creator** (it appears among the LoRAs at once), **Out of loras/**, or **Download** it.

> **An adapter trained without a score (Direct) belongs on the music half only in Direct runs.** In Full plan its music half can break the score even at low strength: give it the sound half only there.

### Runs

![Every run a card](guide/train-runs.png)

Every run is a card on the right: *Active*, *All*, *Archived*, *Trash*, searchable. A training run is lit like a playing take. ⋯ on a card: its telemetry, its log, archive it, stop it, or delete it into the trash (you are asked whether its adapters in loras/ go with it). From the Trash it comes back, or goes for good.

## Engine

### The Machine

![Engine](guide/studio-engine.png)

- **Server**: what the engine runs: the model, the decoders, the context, the library.
- **Compute**: the **model** copy (BF16 7.2 GB, Q8_0 3.8 GB, Q6_K and Q5_K_M smaller), **GPU memory preset** (*Auto* fits the context and the VAE tiles to the card; *Auto within N GB* does it for that much, the rest of the card left to what else runs on it (on a 16 GB laptop, 14); *Manual* leaves them to you), **Keep models loaded**. **Scan the machine** says what the machine has and what suits it (the backbone, Auto's knobs, the painter), as a new studio does once at its first start.
- **Hardware**: the card's memory now; **Unload model** frees it at once.

### GPUs: Which Card Does What

![Which card does what](guide/engine-gpus.png)

On a machine with several cards, give each its work: the **studio** (synthesis) on one card, **training** on the cards you give it, the lab's **jobs** (the listener, Whisper, stems, remaster, upscale) on theirs. While a run trains on the studio's own card, a synthesis waits, and the page says why. With one card, that is how it works: train, then create. A new card for the studio takes effect after a restart (the button appears when it is needed). The lab's jobs keep to the cards ticked for them, the Artist among them: when those are full, a job waits for one of them (Whisper turns to the processor) and never takes a card not ticked for the lab. An Artist run goes to the card where its painter is kept from the run before, the weights already in RAM.

### Decoders, Adapters, Sliders, the Writer's Model, the Look

- **VAEs**, **LoRAs**, **Sliders**: every file the studio found, with its source and what it does.
- **Models and LoRAs**: what the install brings, part by part (the extra decoders and the sliders, Whisper, the stems' models, UniverSR, the LoRAs), as its last run found it, and **Check again** to look anew. A part not whole lists what is missing and has its **Fetch**; **Fetch what is missing** takes them all; a download cut short goes on where it stopped. **More models**: another backbone (BF16 beside Q8_0), the style listener, the Artist's painter, the trainer's base, each with its variants and sizes, a variant here said so, each asked first with its size. A new backbone, decoder or slider reaches the engine at its next start (**Restart the engine**); new LoRAs at once.
- **Artwork**: who paints a take's artwork: by the cards (Krea 2 Muse Q4 from 16 GB, else SDXL), or one chosen: Krea 2 Muse Q4 or Q8, SDXL CyberRealistic, and the Qwen painters this machine has (Qwen-Image 2512 Q4 or Q6 and each fp8 fine-tune, with Lightning; Qwen-Image 2.1 with its licence said).
- **Writer**: the local chat server's address (vLLM, LM Studio, Ollama), *Test connection*.
- **Appearance**: 22 themes (chosen to work in: clear and quiet), corners, the three fonts (text, headings, numbers).
- **Server log**: the whole log; **About**: every project the studio stands on, linked.
- **Updates**: Ruach Studio's releases on GitHub against this version: how often to look (every day, week, month, never), release candidates too, and when one is out, ask or update by itself when nothing runs (only where the studio is a clone of its repository; elsewhere it says how to update by hand). A new studio, and each update, offers the 💎 sets it does not have yet.
- **Folders**: where your work lives (the songs with the workspaces fetched from Hugging Face, the trash, the Artist's pictures, the Writer's documents), what each holds and the room left on its disk. **Move…** takes one to any folder or disk: the studio first says what it will do (on the same disk a rename; on another a copy, checked file by file, then the link switched) and moves only on a second yes, while nothing renders; the old copy stays, renamed, until you remove it. **Back home** brings a folder into the studio's folder again; **Link again** points the studio at a folder whose disk came back. The models, the LoRAs and the training sets keep their places.

## DAW

**Experimental.** The way into a DAW works and was checked, but it still needs crash tests on other machines and projects, and more work.

### Two Ways out of the Studio

The studio hands a song out in one of two ways, and only these two:

1. **The mixed track**, as the studio made it and the Refiner finished it: WAV, FLAC or MP3, no DAW in between.
2. **The whole take into your own DAW**, as a project of that DAW: from there on, everything happens outside the studio. No audio and no project comes back in: the studio does not read a DAW's project (REAPER can give it what a song is made from: its words and a melody).

**Export to DAW** opens this choice: in ☰, or in the Refiner beside the take in hand. The page shows which DAWs the studio's own machine has (REAPER, Waveform, Bitwig), with their versions. When the studio runs on another computer than your DAW (a server at home, a laptop on the road), mark yours with *I use this one*.

| DAW | what the studio gives it | state |
|---|---|---|
| **REAPER** | its own project (.RPP): the mix, the stems, the score as MIDI, tempo and meter, sections, lyrics, the recipe | ready, checked by REAPER itself |
| **Waveform** (Tracktion), 14 or newer | DAWproject: the mix and the stems, the score as note tracks, the sections as markers, tempo and meter | ready, checked against the format's schema |
| **Bitwig** | DAWproject, the same | ready, checked against the format's schema |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, the same | ready |

### REAPER: Install

- **Linux**: from reaper.fm, the *Linux x86_64* tarball; unpack it and run `./install-reaper.sh`: it goes to `/opt/REAPER`, without anything else.
- **Windows, macOS**: the installer from reaper.fm.
- REAPER gives 60 days with every function, then asks for a licence ($60 for personal use or a small business).

### The Fullest Project: Three Steps First

What the project carries depends on what the take has. For everything:

1. **Full plan** when you make the song: the score becomes the MIDI tracks and gives the tempo and the meter. (A Direct take has no score: no MIDI; the tempo comes from "NN bpm" in the style, or stays a placeholder of 120.)
2. **Refiner → Stems**: each stem gets its own track (two: vocals and instrumental; four: with drums, bass and the rest).
3. **Refiner → Lyrics check**: Whisper times every line; the lines come onto the timeline and the sections ([Verse], [Chorus]…) become regions.

None of the three is needed: the project takes what there is and says what it lacked.

### REAPER: Export and Open

1. Open the take (in the Creator, the Refiner or the Librarian), then **Export to DAW → REAPER → Export the take**; or right-click any take → **Download → REAPER project**.
2. The studio packs the take: the audio as 24-bit WAV at 48 kHz, so a seven-minute song with two stems is about 350 MB. The browser saves `TITLE.reaper.zip`.
3. Unpack it anywhere, the whole of it: `TITLE/TITLE.RPP` and `TITLE/audio/` stay side by side.
4. Open `TITLE.RPP` in REAPER (File → Open project, or a double-click).

### What Is Inside

| track | what it is |
|---|---|
| **Mix** | the song as the studio rendered it; **muted** when there are stems, so the stems sound and the mix waits as the reference |
| **Vocals**, **Instrumental** (or Drums, Bass, Other) | the stems, each from 0 over the whole song |
| **Score · Vocal**, **Score · Ins** | the score as MIDI, one track a voice. It is the score *as written*: the song as sung may drift from it. It makes no sound until you give it an instrument (the track's FX: ReaSynth, or any VSTi) |
| **Lyrics** | every lyric line as an empty item with the line in its note, where Whisper heard it |

- **Regions**: the sections of the lyrics, from the first timed line of each to the next.
- **Tempo and meter**: from the score (its `Q:` and `M:`), else "NN bpm" in the style, else 120 in 4/4 as a placeholder; the project's notes say which.
- **The project's notes** (in REAPER's project settings): the title, the style, both seeds, the take's own name: the way back to the take in the Librarian.

### REAPER: When Something Looks Wrong

| what you see | why | what to do |
|---|---|---|
| media offline | the audio folder is not beside the .RPP | unpack the whole ZIP, keep `audio/` next to the project |
| no lyrics, no regions | the take was never timed | Refiner → Lyrics check, then export again |
| no MIDI tracks | a Direct take, or one without a score | make it in Full plan, or bring your own score in the Creator |
| the tempo reads 120 | the take has no tempo of its own | set it in REAPER, or write "NN bpm" in the style next time |
| the MIDI runs ahead or behind the voice | the score is the plan, the singing its performance | use the MIDI as a sketch, or stretch it to the stems |
| Hebrew or Greek lyrics show as boxes | REAPER's font lacks the script | a font with those scripts in REAPER's theme or preferences |

### REAPER: Songs from inside REAPER

Three REAPER actions in `extras/reaper/` (ReaScript, Lua) reach the studio through its API, from the studio's own machine or another one on your network. Sound goes one way: songs come out of the studio into REAPER, and no audio or project goes back in. What REAPER gives the studio is what a song is made from: its words, and its melody.

- **Ruach - Generate here**: the style, the length and the mode, asked; the song is made in the studio and lands on a new track at the time selection's start (its length the selection's). The lyrics come from the notes of the selected items (the exported project keeps every section's words there), or from the dialog. **Selected MIDI items are the song's melody**: their notes become its score (the topmost track sung; a track of chords is not given as a line, as an instrument could take the tune), at the project's tempo and meter, in the key of the take's key snap or the one the notes suggest, made in *Melody only* mode; the new item's notes say how the melody was read. REAPER stays free while the studio works.
- **Ruach - Bring a take**: words (title or note, `*` and `?`), a workspace if you like, and the take you pick lands at the edit cursor.
- **Ruach - Settings**: the studio's address, its token if it asks one, and the workspace songs from REAPER land in.

Install: copy the folder into REAPER's `Scripts`, then *Actions → New action → Load ReaScript* for the three, and run *Settings* once. They need `curl` (every Linux, macOS, and Windows 10 and later have it). The folder's README says the rest.

### DAWproject (Bitwig, Studio One, Cubase)

Right-click a take → **Download → DAWproject**, or *Export the take* on the Waveform or Bitwig card of the DAW window: one `.dawproject` file with the mix and every stem (the mix muted when there are stems), the score as note tracks, one a voice, the sections as markers once the take is timed, at the take's tempo and meter; the style and the lyrics ride in its notes. Open it with the DAW's import for DAWproject: Waveform 14 or newer (*File > Import Other > Import a DAWproject file*; the studio asks Waveform 14 at least), Bitwig, Studio One, Cubase. Checked against the format's own schema (Project.xsd).

### From Your Own Scripts

Everything above is also the studio's API: `POST /api/v1/takes/NAME/reaper` packs the project and says where to fetch it. See **docs/API.md**: songs, jobs, takes, marks, workspaces, and an MCP server for agents.

## Score

In Full plan the music half writes a score before a note sounds, and the song follows it bar by bar; with *Supply your own score* the score is yours. This tab reads it line by line: the dialect YuE2 and SheetSage2 write, how its two voices share the bars, and how to change them without breaking the song.

### What the Score Does

The score is ABC text: a head, then the song in groups of one to four bars, each group once for the voice (**Vocal**) and once for the instruments (**Ins**), on one grid of bars. The engine reads it before the music: the voice's notes carry the words, the chords lead the harmony, the bars give the time.

- **A take is as long as its score.** Six Full takes ended within 0.5–5 s of their score's length. Bars after the last words still play: that is a tail (*End at…* cuts it, or take those bars out of the score).
- **What the score lacks is not sung.** If the plan holds fewer sections than the lyrics, the last verses are left out or an earlier one comes again.
- **The studio reads it strictly.** What the check does not know it refuses, and it says where: the group, the voice, the bar. The engine may still play such a score, but MIDI, the markers, the voice shift and the reciting need the native dialect.

### The Head

Eight lines, always these, in this order:

```
X:1
T:
M:4/4
L:1/16
Q:1/4=85
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:D#m
```

- `X:1` and an empty `T:` as they are: the title lives in the form.
- `M:` the meter as a fraction: `4/4`, `3/4`, `6/8`, `2/4`; its lower number a power of two.
- `L:` the unit: a note without a number lasts this long. YuE2 writes `L:1/16`, a sixteenth, and everything below counts in it.
- `Q:1/4=` the tempo: quarters a minute, a whole number.
- The two `V:` lines word for word: the engine knows the voices by them.
- `K:` the key: a major one by its name (C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb) or a minor one with m (Am, Em, Bm, F#m, C#m, G#m, D#m, A#m, Dm, Gm, Cm, Fm, Bbm, Ebm, Abm). Another spelling of the same key is refused: `Eb`, not `D#`.

### Groups, Voices and Bars

After the head the song goes in groups:

```
% verse
V: Vocal
"Gm"B2B2B2B2B2B2B2G2|"Eb"B2B2B2B2B2B2B2F2|"F"F2F2F2F2F2G2F2F2|"Gm"G4z12|
V: Ins
Z4|
```

- A group: a section comment where a section begins (`% verse`), then `V: Vocal` and one line of one to four bars, then `V: Ins` and one line of **the same number of bars**. Every line ends with `|`; no `||`, no repeats.
- `Z` is a whole bar of rest, `Z2`, `Z3`, `Z4` that many bars; `z` is a rest with a length, like a note.
- A new meter or key comes as an `M:` or `K:` line right after a group's `V:` line, the same in both voices: the check wants the two voices on one grid and in one key at every moment. Inside a bar a key change is written `[K:Em]`.

### Notes and Their Lengths

- Letters are pitches: `C D E F G A B` the octave from middle C (C4), lowercase `c d e f g a b` the octave above; `'` raises a letter an octave and `,` lowers it: `B,` is B3, `c'` is C6.
- `^` sharp, `_` flat, `=` natural (`^^` and `__` double): a mark holds for that letter to the bar's end. The key's own sharps and flats need no mark.
- The number after a note is its length in units (at `L:1/16`): `1` a sixteenth, `2` an eighth, `3` a dotted eighth, `4` a quarter, `6` a dotted quarter, `8` a half, `12` a dotted half, `16` a whole; `24`, `32` and `48` for longer ones. Only these: another length is two notes tied (`F4-F` for five).
- `-` ties a note to the next one of the same pitch, across a bar line too: one note held, one syllable.
- **Every bar adds up to its meter exactly**: at `L:1/16` sixteen units in 4/4, twelve in 3/4 and in 6/8. A bar a unit short or long is refused, with its numbers.

### Chords

- A chord is its name in quotes before the note where it begins: `"Gm"B2`. It holds until the next one. Chords live in **Vocal** only (the check refuses them in Ins): they are the band's harmony, not the singer's notes.
- A name is a root (A to G, with `#` or `b`) and one of: major (nothing), `m`, `dim`, `aug`, `7`, `maj7`, `m7`, `dim7`, `m7b5`, `sus4`, `sus2`, `6`, `m6`, `7sus4`, `m(maj7)`; a bass after a slash: `C/E`.
- A rest can carry a chord: `"Bmaj7"z16` is a bar of that chord with the voice silent, as in an intro.
- With chords a score is played in **Full plan**; with none, in **Melody only** (a melody plan, the accompaniment free). The engine tells which from the score itself.

### Sections

- `% intro`, `% verse`, `% chorus`, `% bridge`, `% outro` on a line of their own before a group mark where a section begins. They reach your DAW as markers (*Markers*, and inside the REAPER project), and they are where the plan meets your lyrics.
- Give the score the sections of your lyrics, in their order, each with room for its lines. The planner sometimes writes fewer: on one long rap, 2 to 17 sections for the 32 of the text. Add them, or shorten the lyrics, before *Generate*.

### Time

- A bar lasts its quarters × 60 ÷ the tempo, in seconds (the tempo counts quarters): in 4/4 at 85 BPM 2.82 s, at 103 BPM 2.33 s; in 3/4 at 90 BPM 2 s.
- The song lasts its bars × that. The check's line under the score says it: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · 0:22 · 0 sections`.
- A line of lyrics needs its syllables' time: at an eighth a syllable a bar of 4/4 holds 8 of them, at a sixteenth 16 (a rap: Viktor's Buratino verses run `FFFFFEEEE2zDDDDD`).
- To end the song sooner, take bars out at the end of the score, in both voices; for an outro, add bars there.

### The Voice's Space: Vocal

- Vocal is what is sung: about a syllable a note, a tied note one syllable held, rests where the singer breathes. The check's table says how many notes, how many a minute, the range, and how much of the time the voice sounds.
- Notes and syllables: with more notes than syllables the model stretches syllables over them, or adds some of its own; with fewer it crowds the words. The lyrics meter in Compose counts each line by the time it takes: give the line about that many notes.
- Rap is dense (sixteenths on one or two pitches: the rhythm carries it), a ballad has long notes. Leave a rest at a line's end: there the voice breathes and the instruments answer.
- The voice shift under the score (*Move*) moves Vocal by steps of the scale (a third, a fourth, an octave) where it sits too high or too low for the singer; the chords and Ins stay.

### The Instruments' Space: Ins

- Ins is the instruments' own line: the intro's riff, the answers between phrases, a solo, the outro. A melody, not the chords (those stand in Vocal): one line, and YuE2 arranges the band around it.
- **Under the voice Ins mostly rests.** The official covers keep `Z4` under every sung group and play in the intro, between the sections and at the end; Viktor's Full takes do the same (an arpeggio in the intro, `Z4` under the verses, a fill at the turns). A busy Ins under a sung line is a second melody against the voice, and the native scores avoid it.
- The check sums it up as **Ins : Vocal**, the notes of one against the other: above 1.5 the instruments carry most notes, below 0.67 the voice does, between them about even.
- An instrumental: Vocal rests (`Z`) through the song and Ins carries the melody. *Make instrumental* moves a score's vocal melody to Ins (the official recipe) and ticks *Instrumental*. An instrumental score adapter at full strength with words to sing gives a voice without notes: keep it low when there are lyrics (Creator › VAE, sliders and LoRAs).

### Changing It in the Studio

- **Create ABC Score**, read it and change it, then **Generate**: the surest way to the score you want. Or write your own in *Supply your own score*.
- The check under the score reads it as you type: ✓ with the key, tempo, meter, bars, length and sections, a table for each voice and the **Ins : Vocal** line; or ✗ with what is wrong and where: `group 3, Ins, bar 9: duration 15/4 quarter notes != meter duration 4`.
- **Key** moves the whole score (to the nearest, up or down); *Move* moves only Vocal or only Ins, by steps of the scale.
- **MIDI** out for a DAW (a track a voice, the sections as markers), and in from one (one melodic line a voice); **Markers**: the sections with their seconds, as a CSV.
- *Write it from the sound* and *Transcribe this take*: SheetSage2 listens to a recording and writes its melody and chords in this dialect (with the chords, or the melody only, as you choose under *Cover or remix*).
- *Lay the lyrics on this score…*: your lines on the score's bars; the next tab tells how it came about.
- The take's score as a staff, full screen, printed to PDF: Creator › The score.

### When the Check Says No

| it says | it means | do |
|---|---|---|
| `duration … != meter duration …` | a bar does not add up | count its units: 16 in 4/4 at `L:1/16` |
| `unsupported duration 5` | a length outside 1 2 3 4 6 8 12 16 24 32 48 | tie two: `F4-F` |
| `voices have different measure counts` | Vocal and Ins hold different numbers of bars in a group | give the shorter one `Z` bars |
| `Native chord symbols belong in Vocal, not Ins` | a chord in Ins | move it to Vocal, the same bar |
| `unresolved tie at end of score` | the last note ties to nothing | take its `-` away |
| `tie changes pitch` | a tie between two pitches | tie a pitch only to itself |
| `Unsupported key` | a key outside the list | the same key as the list spells it: `Eb`, not `D#` |
| `expected 1–4 measures` | a line of more than four bars | split the group in two |
| `Preserve native Vocal and Ins voice definitions` | the head was changed | the eight lines as above |

## Voices on a Score

How the studio's promo got its sound: a narrator saying the promo's lines over a music bed, women's voices singing between the lines, each line near the moment its scene needed, all in one take. The way works for any spoken word, reading or rap over a bed; *Lay the lyrics on this score…* does its middle part for you.

### The Bed and Its Clock

- First the music without words: takes in the bed's style (for the promo an epic trailer, D#m, 103 BPM, 128 s), until one sounds right.
- Then *Write it from the sound* on it: SheetSage2 writes the bed's own score, its chords and its bars. That score is the clock: at 103 BPM in 4/4 a bar lasts 2.33 s and a sixteenth 0.146 s, so while the meter stays, bar n begins at n × 2.33 s.
- Sung in Full plan on that score, the new song keeps that clock: the same chords in the same bars, and the words where the score puts them.

### A Line on Its Bars

- Each line had a moment to be said: its scene. It goes to the bar that begins nearest that moment; if the line before still sounds there, to the next free bar.
- The line becomes notes: a syllable an eighth on a tone of its bar's chord, the stressed name a quarter higher, a breath after a comma (an eighth) and after a full stop (a quarter), the line's last syllable a quarter and lower. A narrator wants few pitches: the chord's tones are enough, and the chords come from the bed.
- At the line's first bar the score gets its section comment and the lyrics the same tag: `% verse` there, `[Verse]` here. A line a section: the plan and the lyrics meet one to one, and nothing is left out.
- Words the model stresses wrong get Viktor's marks: an acute on the stressed vowel (обе́щано), the name spelled as it sounds (рУ́ах in Russian, רוּ-אַח in English).

### Two Voices in One Take

- The narrator and the women are one take, not a mix. The style names both: `male baritone narrator, spoken word, clear English diction, female a cappella vocalise, oooh aaah, epic cinematic trailer`, and the tempo, `103 bpm`.
- The lyrics give each line and after it, in parentheses, the vocalise: `(Ooh, aah)`. In the promo's takes the women sang it.
- The score gives the vocalise its own notes in the bars between the lines: a half note on the chord's upper tone, then the rest of the bar on its reciting tone, two octaves above the narrator's notes. The bed's own vocalise stays at the end: the outro keeps the bed's bars, notes and all.
- A voice adapter can give the narrator a voice; keep it low (0.45 on the music half and 0.3 on the sound half were enough), or it takes the music over.

### Many Takes, Then the Best

- Six seeds a language, Full plan, guidance 1.6, the length fixed at the bed's 128 s, the score and the lyrics as made. Each take says its lines a little differently: one lands nearer, another speaks clearer.
- Where the lines really are: Refiner › Lyrics › *Time the lines* gives Whisper's time for every line, word by word. Whisper's own segments are too coarse for this: a segment often begins on the vocalise before a line.
- Set each line's time against its bar: in the promo's best take 7 of 11 lines began within 1.5 s of their bar (1.7 s on average, the farthest 7.5 s); the other takes strayed more. The score leads the voice, it does not pin it.
- Rank them: the lines within 1.5 s first, then the lines heard, then the mean distance; listen to the first few.

### The Double Ring

- Viktor's word: make the tracks right first, then fit the film to them, even if their lengths differ. So the picture follows the take: a scene comes up just before its line, a caption while its words are said, and the end card holds to the take's last second.
- A line need not land on its bar to the tenth of a second, then: the film moves to it. The same holds without a film: a reading paced to slides, a rap to a beat's sections.

### In the Studio Now

- *Lay the lyrics on this score…* (Creator › Covers, remixes and your own score) does the line-on-bars part for any score in the form: your sections, a syllable an eighth on the chord's tones, the breaths, an intro and an outro, the vocalise when you tick it.
- *Time the lines* (Refiner › Lyrics) gives each line's time; *End at…* ends a take after its last line.
- Not in the studio yet: each line at a second you choose (the promo's scene moments) and the ranking of takes by distance. The promo did those with scripts of its own.

## Shortcuts & Tricks

**In the Librarian:** **Ctrl+A** checks every take shown, **Esc** none, **Delete** sends the checked to the trash (it asks first), **Ctrl+Z** gives back the last change (a move, a workspace, hiding, a pin, marks, the trash); the pill above the player has the same Undo for ten seconds.

### Keys

| key | where | what it does |
|---|---|---|
| **Space** | anywhere but a text field | play or pause the take in hand |
| **←** **→** (with **Shift**: 30 s) | anywhere but a text field or a menu | 5 seconds back or on |
| **M** | anywhere but a text field | sound off and on |
| the media keys | the keyboard, a headset, the desktop's media panel | play, pause, previous, next |
| **Ctrl+Alt+1** … **9** | anywhere | **1** Creator, **2** Writer, **3** Refiner, **4** Artist, **5** Librarian, **7** Trainer, **8** out to your DAW, **9** the Engine; **6** is kept for a room to come (Ctrl+1…9 are the browser's own tabs) |
| **Esc** | anywhere | closes what is open: a menu, a dialog, the guide, a full-screen view, the Engine room |
| **F1** (or **Shift+F1**) | anywhere | this guide, on the room you are in; again to close it (the browser's own help does not come) |
| **Shift+Tab** | the Creator | the frames' key, not the fields' way back: a frame lifted turns to the other, none lifted lifts the form's (Compose); a dialog, a menu and the find bar keep their own Shift+Tab |
| **F5**, **Ctrl+R**, **Ctrl+Shift+R** | anywhere but the Librarian | after anything typed (since the page came or since **Ctrl+S**) ask first, else reload at once; asking, they say what a reload takes and what it keeps; with a song in the form, *Save to the Writer, then reload* keeps it there as well; **Ctrl+F5** reloads at once (in the Librarian **F5** reads the library again) |
| **Enter** / **Esc** | a dialog, a rename in place, a LoRA's typed value | keep / cancel; in a dialog with long text **Shift+Enter** is a new line |
| **Enter** | *Start from an idea* | the chat model drafts the song; **Shift+Enter** is a new line |
| **Ctrl+S**, **Ctrl+Shift+S** | everywhere | keep everything now: the song in the form, the Writer's open document, the settings (never the browser's Save page) |
| **Ctrl+N** | everywhere, in Pinokio's window | New song in the Creator (it asks first when the form holds words); a browser keeps Ctrl+N for its own new window |
| **Alt+K** · **Alt+J** | the lyrics, the Creator's and the Writer's | mark the cursor's line or unmark it · go to the next mark (**Alt+Shift+J** the one before, **Alt+Shift+K** clears them) |
| **Alt+E** | the Creator | lifts the lyrics over everything and puts them back; **Shift+Tab** over them puts them into the lifted form |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | the lyrics, as in mcedit | clear the marks · go to a line by its number · delete the line · move the line (or the lines selected) |
| **Ctrl+F** · **F4**, **Ctrl+H** | the lyrics, the style, the Writer's boxes | find in that box alone · find and replace (**Enter** the match in hand, **Ctrl+Enter** all of them; **Alt+C** the case as typed) |
| **↑ ↓** · **→** · **←** | a menu | move · open a submenu · back out of it |
| **arrows** | the theme picker | move between the themes |
| **+** **−** **0** | a full-screen staff or spectrum | zoom in, out, back to fit; **Ctrl+wheel** zooms where the pointer is |
| **← →** (with **Shift**: bigger steps) · **Home** | a column's edge, focused | the column narrower or wider · its own width again |
| **Enter** or **Space** | a run's card in the LoRA Trainer | open the run |

### The Mouse

- **Right-click** a take anywhere (the takes list, a card, a pinned take) for its menu; right-click a workspace for its locks, rename and delete.
- **Double-click**: a take in the takes list plays it; a workspace's name renames it; a column's edge gives it back its own width; the staff or the spectrum opens full screen; a LoRA's value lets you type it exactly.
- **In the Librarian, as in a file manager**: once one card is checked, a click anywhere on another checks it too; **Shift**+click checks the whole range; a drag over the empty space between the cards draws a band that checks what it touches; **Ctrl**+drag draws it from anywhere and turns over what it crosses: unchecked cards are checked, checked ones unchecked. The page scrolls on when the band reaches an edge.
- **Marks for many**: with several checked, 👍, 👎 or ★ on any of them (or on the bar of the checked) marks them all; when all of them have that mark already, it is taken back. Taking several out of a workspace asks first; the trash always asks.
- **Hover** a workspace name cut short: it shows whole, over the grid.
- **The speed** in the player (0.5× to 2×) keeps the pitch: slow down to hear a detail, speed up to skim.

### Small Tricks

- Keep the **music seed** and change the **sound seed**: the same song, rendered anew.
- Hear an instrument on **several seeds** before you judge it: YuE2 brings it in when the seed and the song let it.
- **Pin** the takes you keep coming back to (four in each workspace); **Pinned** on the left lists them all.
- **⋯** on a card is its right-click menu, for a touchpad.

## Tips

### When Something Goes Wrong

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

### Good Habits

- Keep the **music seed** when a song is right and change only the **sound seed** to hear its sound anew.
- Note what works in each take's **Note**: next week you will not remember which seed it was.
- Give each project its **workspace**, and lock the finished ones.
- Train on what you want to hear: the adapter learns the set's sound, its faults included.
