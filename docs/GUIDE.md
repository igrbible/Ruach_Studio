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
- **No take outside a workspace**: whatever makes a take (Generate, Replace a section, Import) waits for a workspace in hand that takes new takes, never a 💎 set, its sections or a frozen workspace. The only one open comes into hand by itself, a new install gets *My songs*, and otherwise the studio asks; nothing is sent until one is chosen, and nothing while the Librarian does not answer.
- **EN** (the language's two letters): the page in another language, kept with your settings: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, each named in its own words. Numbers and dates follow the language, and this guide opens in it.
- **☀ / ☾**: day, night, or as the system says.
- In Compose's head: **Save** a prompt (all that Generate would send) as JSON or YAML, and **Open** it again; **Clear** the words (title, style, lyrics, score, seeds) and keep the rest, or begin a **New song** (the mode, sampling and LoRAs back to the defaults too; *Sound and output* stays). **Open** says what of a file the form could not take in, and what it holds instead.
- **Export to DAW** (in ☰, and in the Refiner: beside the take in hand and in its Stems): the way out of the studio. Either the mixed track as it is (WAV, FLAC, MP3), or the whole take into your own DAW, where the rest happens outside the studio. The page finds REAPER, Waveform and Bitwig on the studio's machine, or you name yours. Any take goes out from its menu (right-click it): *Export to DAW → REAPER project* or *DAWproject* (Waveform, Bitwig, Studio One, Cubase), your own DAW first; the DAW tab of this guide says what is inside.
- **Unload model**: drops every idle model from the GPU's memory now; tinted red while a model is loaded.
- **☰**: the rest. The card and its memory, the model copy, the sound decoder (VAE), **Export to DAW**, themes, the Engine room and this guide. **Text size** there sets the whole page's text from −2 to +4 pt (the layout stays), and a lifted frame has its own −, + and ⟲ on top of it (−4 to +6 pt); each screen keeps its own. When a plugin of your own lies in `user/plugins/`, **Own plugins** there turns it off for this browser: the Refiner, the DAW and MIDI then show only what a public studio has, for a test of the public way, a promo or pictures; nothing is deleted, and the page reloads.

![Behind the ☰](guide/more-menu.png)

### Your First Song, in Six Steps

1. **Title** it, and pick the **Key** if you have one in mind (or leave *as written*).
2. Write the **Style**: language, genre, voice, instruments, tempo. One or two plain lines are enough. The ♪ beside it lists 200 instruments with what YuE2 really plays (see *Creator*).
3. Paste the **Lyrics** with section tags on their own lines: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Keep **Full plan** as the planning mode: YuE2 writes a melody and chords first, then the song.
5. Press **Generate song**. The run shows its stages: the score, the music tokens, the sound, the decode.
6. The take opens in the middle, with its player, its score and everything to make it again.

> Measured on an RTX 3090: a 6:12 song in Direct mode took 135 seconds, a 7:25 song in Full plan 212 seconds (the score is written first). Shorter songs are faster.

### The Player, the Takes and the Server Log

- **The player** at the bottom: the waveform across, one soft cloud with the part already heard in the accent (a click jumps there); under it the take (its artwork when it has one, its title, the first words of its style, 👍 👎 ★), then **shuffle**, previous, play, next and **repeat** (off · the whole list again · this take again, marked 1), then the time (a click on the total turns it to the time left), *play on click* (a click in a list plays the take at once), *play on* (when a take ends, the next one down the list starts), *play new takes* (a song made here plays when it is done, unless something plays), 🔔 *a sound when a run ends* (two notes up when it is done, once for a queue of runs, two down when one fails; none over a new song that starts playing by itself), the **speed** (0.50× to 2.00×, the pitch kept), the volume and a dot for the state (it beats while a take plays). What you do not need this moment stays faint until the pointer comes; every icon says what it does when the pointer rests on it. The pointer over the waveform shows the time a click would jump to. The keyboard's and a headset's media keys drive the player, and the desktop's media panel shows the take. ⏪ and ⏩ go to the last or the next mark every 15 s from 0:00, ← and → to the marks every 5 s (Shift: 30 s). The status pill at the player's right end (green while a take plays, the accent's colour while one is made) opens the take or the run; with Compose lifted over the room it turns the frame to the take's. A right click on the wave, the picture or the title opens the take's menu, as in a list. The wave shows the take's sections: the lyrics' own tags, each where Whisper hears its first line (once a take, about half a minute; by itself on a machine of two cards or more, else the take's menu → *Find the sections by ear*); a take never heard shows the marks of its score. A thin line at each start, its name at the foot; a click by a line goes to the section's very start; the pointer over the wave shows a card with the section, its time and its lines as written, the line sung there lit; a section marked ? was not heard clearly. The pointer resting on the wave a moment brings up the take's whole spectrogram over the player (the spectrum switch beside 🔔 turns it off): as wide as the wave and in time with it, about a third of the window high, the section's card above it; in it the sections, the spectral centroid as a magenta line (where the sound's weight sits: its brightness), the RMS in a lane at its foot with the take's own average dashed, the playhead; under the pointer its time, the spectrum of that moment beside the line with its loudest frequency and note, and up in the picture the frequency there, its note and its level. *Log* or *Linear* in its head; a click goes there as on the wave; the pointer away or Esc takes it down. The take is measured once, by the lab, as for its Spectrum. The volume goes up to 150 %: past 100 % it boosts a quiet take, and the slider stops at 100 % first (let go and drag again to go past it).
- **Two rows or one**: the player keeps the waveform over its controls where songs are heard and compared (the Creator, the Refiner, the Librarian) and is one row in the Writer, the Artist, the Trainer and the Engine, and in the Creator while a frame is lifted or the lyrics are over everything. After a reload (F5) it comes back with its take and its place. In the Artist the Takes start folded and the server log stands at the left.
- **The cards live**: in Engine → GPUs each card has a row of its own under it, its load and its memory a bar every two seconds for four minutes, with its temperature and power; the server log, unfolded, shows the cards that have a role beside it, each headed by its role, the studio's card framed. The samples come in all the while, so the log unfolds on its last minutes.
- **The line to the studio** shows beside the server log (*Forge · 85 ms*, or *here* on the same machine). When the studio is far, a like, a favourite or a pin shows at once and the studio only confirms it.
- **Takes** on the right: search with words, `*` and `?`; *Favourites*; fold the column with »; ⋯ for the list's own actions. In ⋯, *From all Workspaces* shows every workspace's takes in this column, the workspace in hand left as it is.
- **Takes, folded**: resting the mouse on the » strip opens the list over the take; it folds again a second after the mouse leaves (its Fold button, pressed then, keeps it open). The ⋯ menu opens upwards where the player leaves no room under it.
- **The server log** sits right above the player in every room: folded, it shows the last thing the engine said (in red when something failed); unfolded, ten lines, *Follow*, *Copy*, and the way to the whole log in Engine. With a frame lifted over the room it stands at the left, off the frame's buttons. The arrow on its inner edge takes it to the other side of the page, and each room keeps its side (the Artist's is the left). Its outer edge drags it wider, up to 1200 px (kept; a double click gives its own width back); with the cards beside it, it is 920 px wide, their column 390. The frame has two views, **Server** and **Artist** (the Artist's own log: what was asked, what the lab answered, each run's way to its end), and each room opens on its own; **⧉** opens the log in a window of its own, over every window in Chrome or to carry to another monitor. While a LoRA trains, a bar of its own stands over the log, a run a line: its card, its step, how much is done and about how long it has left; a click opens the Trainer.

![The server log, unfolded](guide/log-dock.png)

## Creator

### Compose: The Song Form

![Title, key, seeds and style](guide/compose-top.png)

- **Start from an idea**: one line about the song; the chat model of the Writer drafts the title, the style and the lyrics (*Write the brief*).
- **Title**, **Key**: the key goes into the score (`K:`). With a score in the form, a new key moves it there; without one, the choice waits and moves the score that comes.
- **Versions** (beside *Save to Writer…*): the form is kept under its title on every Generate, on Ctrl+S, after the piano roll writes into the score, and before anything overwrites it (an example, a take, the Writer, a version), with its knobs, so a change is never lost; a click picks a version, a second shows the two as a diff, *Into the form* brings one back; a star, a label, a lock. Deleting a take never takes its versions. **Version**, beside Title, takes digits and dots (4.2.3): a take is called «Title v4.2.3», as tracks are named, and the versions keep one tree per title with a branch per version (a title typed with its version splits into the two fields). *Delete the tree…* sends a title's whole tree into the versions' trash; *The Creator's versions* in the Writer brings it back.
- **Music seed** and **Sound seed**: the dice for the two halves. Empty is random; a number repeats a take. Keep the music seed and change the sound seed to hear the same song rendered differently. They stand first in *Sampling and Denoising*. Beside each, its **mode**: *Random (−1)* a new seed each run (the field empty), *Random, fixed* a random one put in and kept, *Fixed* the one written, *Next* and *Previous* move it after each Generate past the seeds it used (the versions for the music, the variations for the sound). The Artist's seed has the same modes. A fixed music seed is watched: when its adapters (their music halves) or the backbone moved since it last ran, or it broke a plan with these same adapters, the run asks first: **A new seed** or **Keep the seed**. A plan no longer writes its seed into the field, and **A new score** takes new seeds.
- **Style**: language, genre, voice, instruments, tempo. *Save style…* keeps it under a name. **♂** and **♀** in its head put *male vocals* or *female vocals* into it (in place of the other gender's word, else before the BPM); the lit one takes its tag out. **Free tempo**, beside them, makes the music from the score without its tempo marks (Q:): the voice and the beat breathe on their own, the lyrics no longer tied to the bar (rubato, non-linear); on by itself when the Style asks for rubato or non-linear and names no BPM, and a BPM in the Style while it is on is said under the box. A score planned alone (*Create ABC Score*) comes without its tempo too.
- **Letters other than Latin** in the Style are named under it: YuE2 reads the style as English tags. **✦ Suggest** reads the lyrics whole (up to 8000 characters). The saved styles, the profiles, the text profiles and the Writer's documents are chosen in the studio's own dialog, a filter on a long list, as the workspace is.

### The Instruments Cheat-Sheet ♪

The ♪ beside the style opens a table of 200 instruments the studio probed: their family, home, how they sound (English and Russian), and the words that call them. ▶ A and ▶ B play two 60-second probes of each. The verdict per row comes from a human ear: heard, questioned, or **NOT IDENTIFIED IN YUE2** (YuE2 does not know it; it needs more sophisticated prompting). A click copies the name and asks where it goes: at the end of the style on a line of its own, or in place of it; a name the style holds is marked in the table, and the table's text can be selected and copied.

**YuE2 decides when an instrument comes in.** A style line is a request, not an order: however hard you ask, the model brings an instrument in where its training says the song wants it, and the seed decides a great deal. The same prompt gave one take with the instrument and one without. Hear several seeds before you judge an instrument.

**Heard, but not as real as a live one.** Many instruments do play, yet less clearly and less true than the real thing: that is what YuE2 knows of them. The verdicts say whether YuE2 plays an instrument at all, not how real it sounds. Making it real is the work of an **instrument LoRA**: a few dozen clean recordings of it, trained in the LoRA Trainer.

![The instruments cheat-sheet](guide/instruments.png)

### Lyrics and Text Profiles

- Section tags on their own lines; YuE2 knows `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- Leave an instrumental tag such as `[Instrumental Outro]` without words: words under it make the tail wander off into made-up singing, take after take. Put the last words under a `[Breakdown]` before it.
- **Text profile**: paste a whole text, pick a profile, *Apply*: its rules (cleanup, phonetics) and its shape (`[Intro]`, `[Verse]` at blank lines, `[Interlude]` after long paragraphs) make it ready to read. *Undo* brings the text back. Profiles are made in the Writer.

### The Lyrics' Meter and the Phonetic Hand

- **The meter** beside the lyrics: each line's syllables as a bar against its group's ruler — verse and bridge one group, the pre-chorus its own, the chorus its own, any other section its own. A pause, a break, a silence, an interlude, a prelude or an instrumental cue inside a sung section opens no group: its name stands dimmed beside it and the section's ruler goes on. Tags are never counted: a line of tags alone (`[Break] [Silence]`) counts as none, a tag inside a line is left out. The ruler stands at the group's usual length; within a syllable the bar is green, two or three off amber, more red. What is in round brackets is drawn hatched after the bar: YuE2 may sing it. Under the box: the lyrics' characters, syllables and lines, the section tags, the brackets and the phonetic hand; the browser's spelling check in the lyrics' language (switched off there); a box drawn taller by hand keeps its height until *Auto height*.
- **Line numbers and marks**: the lyrics box numbers its lines as a code editor does (a wrapped line once, on its first row; *Line numbers* under the box switches them off). **Alt+K** marks the cursor's line or unmarks it, **Alt+J** goes to the next mark, **Alt+Shift+J** to the one before, **Alt+Shift+K** clears them; a marked line's number is amber, and the marks follow their lines as you write above them. Every [tag] lies under a thin amber layer. The Writer's lyrics have the same. As in mcedit: **Alt+O** clears the marks too, **Alt+L** goes to a line by its number, **Ctrl+Y** deletes the line, **Alt+↑** and **Alt+↓** move the line (or the lines selected) with its mark. *Keys* under the box lists them all, and the Writer's LYRICS label says them on hover. **⤢** beside Lyrics lifts the box over everything, 60 % of the screen wide and four tenths larger, with all of this, and its own −, + and ⟲ for the text's size (kept in this browser); Esc puts it back. Beside **⤢**, two buttons keep the lyrics as plain text: the first saves them as a `.txt` named by the Title, the second puts a `.txt` (UTF-8) in their place (it asks first when the box has words, and **Ctrl+Z** in the box brings them back; an empty Title takes the file's name).
- **Brackets checked**: a «[» not closed on its line, a «]» with none open, a «[» inside a tag and an empty tag number their line red, and *Tags not closed or astray* under the box goes from one to the next; a round bracket left open or closed with none open is amber (an echo may run on). A «[» still being typed is left alone until the cursor leaves its line. **Generate asks first** when a tag is broken: what follows a «[» not closed may be lost in the song and its end may go wrong; *Go to the line*, or *Generate as it is*.
- **Stress marks astray**: a mark off a vowel — at a line's start, after a space or a sign, on a consonant, a second one on the same letter, or a spacing ´ in its place — shows a red button under the box (*Stress marks off a vowel*) and a mark before the line's count; the button selects each one in turn. A word with two marks gets an amber one: meant, or a slip? In the count a stress mark is no syllable; ע and a Latin vowel inside a Russian word are. A syllable is one vowel sound, one note, counted by each language's rules: one vowel letter in Russian, Ukrainian and Belarusian (and as the meter measures the time a line takes, a word with no vowel — с, в, к, з, й, ў — and a stop closed against an affricate inside a word — глу-п-цо́в — take a beat of their own, drawn lighter: «Я же вижу глупцо́в с приду́рческим планом» is 12 syllables and 2 such beats, 14); in Greek αι, ει, οι, ου, αυ, ευ are one (a diaeresis or the accent parts them: τσά-ι); in Spanish and Italian a weak i or u joins its neighbour (cie-lo, cuo-re), two strong vowels are two (po-e-ta); in English a silent final e is none (make, but ta-ble); Hebrew counts its vowel points; Chinese, Japanese and Korean one sign each. Latin words count as English, Spanish or Italian: by the style's word for the language, else by the lyrics' own small words.
- **The arc**: the verses numbered 1, 2, 3… (none missing, none twice, no unnumbered one among numbered ones); inside a verse's cycle Verse › Pre-Chorus › Chorus › Post-Chorus, a section left out but none turned back; a Bridge or an instrumental part opens the cycle again; an Intro only before the song, nothing sung after an Outro. Its slips: **Arc to look at** in amber, a press to the next.
- **Ctrl+F** in the lyrics or the style (and in the Writer's boxes) finds in that box alone: Enter and Shift+Enter go through the matches, Esc from the find field puts the cursor back with the match selected; from the box itself (clicked into elsewhere) it closes the bar and leaves the cursor where it is, and words typed there meanwhile do not move the view. A stress mark is not looked for, ё is е, and о and а find ע and the Latin o and a too. **F4** or **Ctrl+H** opens a second row to replace: **Enter** puts the new words in place of the match in hand and goes on to the next, **Ctrl+Enter** (or *All*) replaces every match at once, and one **Ctrl+Z** in the box takes it back; **Aa** (**Alt+C**) finds only as the case is typed.
- **Tags under a «[»**: a «[» typed at a line's start in the lyrics (the Creator's or the Writer's) opens the section tags, as a code editor offers its words, in the order a song goes through them, from Intro to End. Letters typed after it narrow the list (in a Russian or Ukrainian layout too), a number numbers the tag (`v2` is `[Verse 2]`), and lyrics that number their verses are offered the next one. ↑ ↓ choose, Enter or Tab puts the tag on a line of its own (Ctrl+Z takes it back), Esc or `]` closes the list. Intro, Outro and End already in the lyrics stay in their place, dimmed, with their line: ↑ ↓ reach them and read what they are, but they are not put in twice. Ctrl+Space opens the list, and at a line's start types the «[» itself. The list stands in two columns: the tags, and beside them what the one in hand is (in our words, after Genius's guide to song sections) and how often the 110 official examples write it; the box keeps its size as the list narrows. Sections none of them writes are marked TEST. **A second and a third tag** on a line: a «[» typed right after a line's tag gets its space by itself and offers the tags that are no section (who sings, as the examples write it; Female Vocals, Break and Silence marked TEST); Enter puts it on the same line, a «…» in it selected for your words; Ctrl+Space types « [» there too.
- **The phonetic hand** (Viktor's, from SUNO; YuE2 follows it as well):
  - **A stress mark** (the combining acute, U+0301) after a vowel: `обе́щано`, `сули́т`. It holds in about 90 % of lines; the rest is the seed's luck.
  - **A capital stressed vowel** pushes the stress where the rhyme wants it, against the dictionary: `базилиО́`. A capital alone, without the mark (`дрОв`), seldom moves the stress.
  - **ע (ayin) inside a Russian word** sings as a soft о/а, as living speech says an unstressed о: `кעмо́рка`, `пעле́но`, `Ка́рлע`. It also brakes rap that runs faster and faster.
  - **A Latin o inside a Russian word** sings a hard, open o where the model would say а: `Кo дну`.
  - **A stretched vowel** (`о-о-о`, `БУ… РА… ТИ… НО`) holds a note; where the music has room for it, not on every line.
  - **[Interlude]** between parts makes a pause in rap and slows down speech that keeps speeding up (not always).
  - **Round brackets** are no command: one or two words in the lyrics' own language in them are mostly sung as a choir's echo; a direction in them (`(Music slowly fades)`) is mostly passed by, or sung. A command goes in square brackets.
  - **Lead and choir** (Viktor's find, 20.10.2026): split the lyrics into the lead's lines and the choir's answers. With `female choir backing` and `solo lead` in the style, a short line in round brackets in the song's own language is mostly sung by the choir, on a line of its own or at the end of the lead's line. Two ways work: plain brackets, the steadiest (`это же (божественный экстаз!)`), and `(Choir: …)`, which does not take every time; `(Choir backing: …)` fails altogether. With English lyrics plain brackets may slip now and then. Split so, the lead comes out with much air around it. **Three dots** (`...`) after a word make a short pause. Written so, a song may run long (his went to 8:27), or shorter than before with the same words, which leaves room for instrumental breaks.
  - **A Hebrew word with its vowel points** (`רוּחַ`) the model says better than in transliteration.
  - **Square brackets are a command** to YuE2: a section, a voice, how a line is sung or said. Here there is a lot to play with.
- **Voices** (no section: the lines stay in the section before). Viktor's form: `[Vocal: Female - …]` or `[Vocal: Male - …]` for a sung line, `[Spoken: Female - …]` or `[Spoken: Male - …]` for a said one; who first, then after a dash how (`[Spoken: Female - Soft Whisper, Intimate, Sacred]`). A spoken tag may lead the line itself: `[Spoken: Female - Soft Whisper] Ты слышишь?`. On a long ballad with a male voice adapter and a woman narrating (13.10.2026) YuE2 followed such tags about 95 % of the time, steadier than SUNO. **Solo** is not heard in a voice's tag (the examples keep it for instruments: `[Guitar Solo]`): name the voice. «[» offers them after the sections, marked *not a section*.
- **One syllable moves the whole song.** YuE2 reads the lyrics as one chain before it writes the music: change a syllable, a «», a tag, and the same seed walks another road from there to the end. The seed is the dice, not the song. To change a line and keep the rest, replace its section (a right click on the player's wave); to judge new words, hear them on several seeds.
- **Length**: YuE2 holds a song of 8 to 9 minutes, more than SUNO v6's 6:15. *Max length* goes to 15 minutes for a narration, but past 9 it is the seed's luck.

### VAE and LoRAs

- **VAE** turns the written song into sound: **Standard** (the best sound), **Legacy** (the benchmark one), **Blend** (a mix of the two, an add-on). A finished take can add another decode later from its own page. It is chosen in the **☰** menu, under the model, for the songs to come; a take decodes again with another from its card in seconds (from rc2 every take keeps its latents; one made before renders its sound again).
- **LoRAs**: adapters for the music half, the sound half, or both, each with its own strength: the music half's slider opens with a chord, the sound half's with a wave (the pointer on either names it). A name longer than its column is cut short and shows whole under the pointer. **Add a LoRA** keeps the adapters not in the song behind one line: a search finds them by any word (the name, the kind, the halves, the tag, the trigger, the note), the kinds filter them (*voice*, *vocal*, *style*, *instrument*, *score*), each kind is a stripe at the tile's left (a speaker's voice has a second one, its colour from the first letter of the name, as a phone's contacts), two columns on a 1080p screen and more on a wider one, its own scroll past 800 px.

**A LoRA's wave.** An adapter pushes with its strength from the first second to the last: flat. The small picture at the end of its row opens its wave: **Flat** keeps it so; **Arch** lets it rise to the full strength in the middle of the song and ease back at both ends; **Draw** shapes it by hand: drag a point up for a flare, down for a fade, along the song to move it; double-click to add a point, double-click a point to take it out. The strength you set is the top of the wave; a pair's two files (the music half and the sound half) ride one wave. The music half runs it token by token as the music is written, the sound half frame by frame as the sound is made, from the start to the end of the song's length; it goes into the take's request, so a take made again runs the same wave, and the take's card says *a wave*. **Sections** lets it sound only in the sections you tick, a short ramp at each border: the borders come from the score's bars when the song has one, else roughly from the lyrics' lines.

![A voice adapter's wave drawn by hand: it rises, holds, eases and comes back](guide/lora-wave.png)

**The wave's grid.** The graph counts the strength in quarters and the song in minutes and seconds. Its time runs over the length set in **Output** (Max length), not over the song's own length: the engine spreads the wave over that length. Type about how long the song will run into **Song ≈**: a dashed line marks its end, and what you draw past it is not heard. **Shift** keeps a dragged point on the grid, a right-click takes a point out, and the read-out above the graph says where the pointer stands. The button beside the LoRAs' name lifts them over the page, up to 1800 px wide, for fine moves of the points; Esc puts them back. Set **Output** near the length you expect, so that the whole wave is heard: a take asked for 9:00 that ended at 6:37 left the last quarter of its waves unheard.

**An emotional arc.** A voice adapter on an arch grows toward the middle of the song and eases at its ends, and the song breathes with it. Under **In order**, when two adapters together pass the red line, what the upper one's wave lets go, the lower one takes: a duduk on an arch over a voice hands the song between them. It shows in the measures too: in a take whose duduk adapter was drawn high, then low, then rising, the winds' stem split from the song followed the same line (−30 dB at the start, −59 dB in the middle, −36 dB toward the end).

![LoRAs: each strength on a road from green to red, and the music half together](guide/loras.png)

Every strength sits on a **road**: green is safe, yellow is its limit, red is past it. The limits are measured:

- every adapter alike, on the sliders' tenths: the music half green to **0.4**, red from **0.5**, **0.75** at most (a score adapter, one that plans ABC, keeps its own: green to 1.0);
- the sound half green to **0.6**, red from **0.75**, **1.0** at most;
- **Music, together** and **Sound, together**: stacked adapters add up, and each may sit in its own green while the sum still breaks the score. While the model writes the score, the music half together is green to **1.2** and red at **1.4**, its most: on the studio's plans (13–20.10.2026) none of 6 broke up to 1.0 together, 14 of 35 from 1.0 to 1.2 (8 of 10 on IRAEv3), 8 of 9 past 1.2. With a score in the form the music half writes none, and the bar goes to 3.5 (whole up to 2.25 on real takes, broken from 2.5). The sound half together is green to 1.2, 1.5 at most. The plan has a fuse besides: in Full with no score yet, adapters past **1.0** together (**0.8** on IRAEv3) plan the score eased in proportion to it, and the song is sung on it at their own strengths. A plan that comes out broken is not sung: with a random music seed it is planned again once; past that, or on a fixed seed, the Babel window says what weighed on it (the adapters, the backbone, the seed, the fuse) and plans it again with a new seed on a word.

**Budget.** With two adapters or more, **Budget** stands under the road. Neither mode lit: no budget, each runs at its own strength, as before; the lit one pressed again lets the budget go. **Share**: the adapters that push on the same layers share one budget a half, the red line its cap; past it, each gives way in proportion. **In order**: the top row takes its strength first, the next what the red line leaves, and what a wave lets go, the next one takes; drag the rows by their names to set their order. The engine keeps the budget at every moment of the song. Which adapters share their layers the studio measures itself: the tip on an adapter's name says where it pushes (the layers on each half, attention against MLP, how far it moves a layer at 1.0), and the notes beside the LoRAs' name say when two share their layers and how they pull: the same way (together they push harder than their strengths say), against each other, or across. A strength the budget holds back shows what runs: its number turns amber, its road dims past the cut, and its tip says why; **Music, together** and **Sound, together** show what runs of what is asked (the same sum in both modes, the rows differ). The sliders move in tenths; a double-click types hundredths.

**Past the limits.** The box at the end of the budget's row lets every slider go past its own most (the music half to 1.5, the sound half to 2) and the together ones too; the roads keep their colours, so the measured red still shows, and the budget holds none. It is for an adapter whose wave plays only part of the song (a duduk loud in the intro, then gone): it need not take its share from the others for the whole song. The score is still planned with the music half eased to the plan's fuse (1.0 together, 0.8 on IRAEv3), then sung at the strengths set. **Out of the score** (right-click a row): its music half sings the score but does not write it; the plan is made without it, the row says *sung only*.

**Double-click** a number to type a strength exactly. The hints under the block say what matters: a trigger word missing from the style, an adapter trained in another planning mode, a strength past its limit. While the pointer is on a slider or drags it, the exact strength stands over the pointer in its road's colour. The Instrumental adapter stops at 1.0, where it starts: past it, its scores go astray.

> **An instrumental score adapter with words to sing.** Such an adapter plans scores *without a vocal line*. At 1.00 it gave a take with one note in 127 vocal bars: the singer spoke over two looping bars. With lyrics, keep it low, 0.3 to 0.5. The ⚠ beside the LoRAs' name says so when it happens.

### Profiles and Planning Modes

- **Profile** sets the mode, length, sampling, guidance, steps, VAE, LoRAs and output in one go; the texts and seeds stay. *Save profile…* keeps the current knobs under a name.
- **Planning mode**:
  - **Full plan**, the default: melody and chords written first (an editable score), then the song. Best for new songs.
  - **Melody only**: a melody plan, free accompaniment. Recommended for covers.
  - **Direct**: straight from lyrics and style, no score. Adapters trained without a score belong here.
  - **Instrumental**: no vocals, the official YuE2 recipe. It stands at the right of the planning mode's head.
- **Chords**, under the modes: *Off*, *Gentle*, *Varied* or *Bold*, how far the chords of a score the model plans may wander. Left alone, the planner tends to loop one progression through the whole song; *Gentle*, *Varied* and *Bold* make a chord heard among the recent changes come back later and keep a section's opening chords apart from the one before, and *Bold* lets a chord step outside the key now and then. They act only when the model writes the score: Full plan or Melody only, with no score of yours or only its opening. Measured on one song's plan: off, six chords and one four-chord run thirteen times; at *Varied*'s strength, nine chords and the commonest run four times. After Yeufonic, through timoncool's yue2.cpp. *Gentle* is the default.
- **Full or Direct.** Viktor's word after a week of songs: Direct is SUNO's hit and miss (about two good takes in a hundred, by his count); Full is the way for everyone, even without reading a note of ABC: the tags are kept, the sound settles, the speech holds and the tempo can be foreseen. Measured on his rap, fourteen takes of each with Whisper listening: the best take of all was a Full one with his conservative recipe (84 % of the words heard, 76 % in the last quarter). Where Full fails, it fails at the end: a take is as long as its score, and the plan may hold fewer sections than the text (then the last verses are left out, or an earlier one is sung again); after the last words the score's leftover bars play on, and that is the 10–15 s after a song's proper fade, not the guidance. Listen to a Full take's end: *End at…* cuts a tail, *Regenerate from…* writes a lost end anew.

### Covers, Remixes and Your Own Score

- **Cover or remix**: take the tune of a recording (*Transcribe*: its melody only, not the words or the singer), or the melody of one of your takes, and give it a new style.
- **Match sections** (beside *Transcribe*, once the recording's score is in): Whisper hears where each block of your lyrics begins in the recording, and each block takes the tag of the score section it is sung in. Words never change: a block already named for its kind keeps its tag, one not heard keeps its place (unsure), a chorus written once is copied where it is sung again, and the sections the voice does not sing get an empty tag. You see the proposal, and can edit it, before it goes into the form; the lyrics there before are kept as a version. After timoncool's YuE2-Studio and HOT-Step's Cover Studio.
- **Supply your own score**: an ABC score, followed in Full plan and Melody only. Transpose it (nearest, up or down), move one voice by steps of the scale, import a MIDI file (one melodic line per voice), export MIDI or markers for a DAW, load an example, make it instrumental. **Generate** with a score here asks first: on this score, or a new one (the field emptied, the song model writes one). The score remembers the adapters and the music strengths it was written with (a plan, a take's own score); when those on now differ, a line under it says so, and the question too: at other strengths the music may part from the score, Industrial Rock and instrumentals most. In Full the score stays open while it holds one. **Only the opening**, under the score: the score in the box is only the song's start, a few bars played on the roll or a MIDI keyboard, hummed and written from the sound, or typed, and the model plans the rest of the song on from it, in its key and meter; the whole score, your opening first, is sung and kept as the take's. Full plan or Melody only; *Chords* steer what the model adds. After Mothersuperior's hum-to-song, through timoncool's yue2.cpp.
- **The piano roll** (the button with a staff on it, beside *Remove score*): the score over the whole window. Above, the score on paper twice: as YuE2 wrote it, and as it stands now. Below, time flows down to two keyboards, Vocal's over Ins's, the keys one size on every screen, the octaves beyond at the edges (a small keyboard of them on hover). A click writes a note of the grid's length, a drag moves it, its lower edge stretches it, right-click or Delete takes it away; a voice of YuE2 sings one note at a time, so a note laid over another gives way. The lyrics' syllables stand on Vocal's notes. **Shift** and keys together make a chord set on the cursor's bar; the computer's keys play a keyboard and a half (white on A…', black on W…], Z and X an octave), a MIDI keyboard plays too (**MIDI**), and with **Rec** the key played is written at the cursor. **Play** (Space) plays from the cursor, the original or the edited, Ins as keys, Vocal sung on the notes' names, or both. **Write into the score** writes back only the lines that changed. By night the paper is dark, by day grey. The papers follow the lane (the playhead, the cursor or where the lane was scrolled), the bar in hand lit on both; a paper scrolled by hand takes the other and the lane along, and a click on a paper's note puts the cursor on its bar. Ins sounds as a grand piano; Vocal sings the vowels themselves, a, e, i, o, u, as VocalSet's singers hold them, with no noise before them. **Sound ▾** beside **Play** holds the **Pedal** (*Long notes*, the default: a note of a beat or longer rings on past its end, dying away, until the pedal is changed on the next bar line; *Always*: every note; *Off*), the **Acoustics** around the piano and the voice (*Dry*, *Room*, *Hall*) and the grand's **Lid** (*Raised*; *Closed*, darker and softer). The keys' guide lies faint over the lane's low octaves; its box folds it. **Engine → Hardware → MIDI** turns MIDI on for the whole studio: a keyboard plays the roll, an M-Audio Oxygen's DAW port (Mackie Control) runs Play, Stop and Record. The browser gives MIDI only to a page opened as localhost or over https: from another computer, `ssh -L 7777:localhost:7777` to the studio's machine and open http://localhost:7777. Arrows at the keyboards' ends move the keys an octave and ◎ brings them back to the score's notes; a lever between the papers and the roll gives either more room (kept; a double click as at first), and on a tall screen Ins's keys take a grand's own length. **Play** plays at the tempo beside it (a score in free tempo has none, so the roll takes the last one set), and ↑ takes a paper back to its start. Vocal sings a phrase as one voice, on the lyrics' syllables or *Do Re Mi*. A MIDI keyboard's pitch wheel runs the cursor through time and its modulation wheel sets a new note's length. **⇅ Transpose**: drag along the bar numbers at the left to pick a segment, then draw the shift on a line of points, by a semitone, a quarter, a third or a half of an octave, an octave or two, held or gliding; *To minor* or *To major* turns a part with its chords, *In the key* keeps its notes in the key; *Apply* is one step to undo. The keys' count in the head opens its list: how many keys one's own MIDI keyboard has (88, 61, 37 or 25, each said what it is) and the octaves in sight; the tempo, a bold button beside **Play**, opens its own: −4, −1, +1, +4, a slider and the score's own. With no bars picked, **⇅ Transpose** takes the section at the cursor. The lyrics stand under the Vocal staff of both papers too, and the few notes an intro gives the voice before the verse sing the verse's first syllables. A score YuE2 wrote with a bar off its meter (18/16, say) opens as well: the roll reads such a bar evened (what runs over cut, a short bar filled with a rest) and says so, and a line you leave goes back as YuE2 wrote it. The papers' words are in Noto Sans, narrowed as on a printed page: the voices' names to 76 %, chords and lyrics to 90 %.
- **Recite the lyrics on a score** (*Lay the lyrics on this score…*, under the score once it reads): the narrator of the studio's promo, for your words. Each line goes on the bars of the score, a syllable an eighth (a sixteenth, as rap is said, where eighths would leave lines out) on a tone of its bar's chord, a breath after a comma and a full stop, the line's last syllable a quarter lower; each section starts on a two-bar phrase after a bar's rest, or after a vocalise when you tick it. The instruments, chords, key and tempo stay; the score's sections follow your tags, with an intro and an outro around them. For spoken word, readings and rap over a bed: make the bed, *Write it from the sound*, then this; it asks first, and Ctrl+Z in each box brings the old text back.
- **Chord bed** (*Chord bed* under the score: the key, the meter, the tempo and *Write a bed*): a score with no melody, only its frame. Each section of your lyrics gets bars, about 2.5 s a sung line in pairs of bars, a break, an intro and an outro a few of their own, and every bar a chord; the voice's bars are rests, the instruments' are empty. The key and the tempo come from the style when it names them, and each press draws new progressions: the verses one, the choruses another, the bridges a third. The planning mode turns to *Full plan*. The model writes the melody itself and sings your words over that harmony: you choose the chords and the form, it finds the tune. Measured on two takes (22.10.2026): the sound followed the bed's chords bar by bar, closer than all 300 shuffles of the same chords and than the same chords in any other key; it sang over the rests (the voice in 75 % and 34 % of the frames, against 79 % and 49 % on a planned score); and a take is not held to the bed's length: both ran about 70 s on a bed of 40 s and went on with its last progression. Ported from timoncool's YuE2-Studio (MIT).

### Sampling and Denoising

![Sampling: the score planner and the music tokens, the token limits locked](guide/sampling.png)

The defaults are tuned. The three **shape** rows (Composition, Performance, Style) move the knobs together in five steps; the knobs themselves are below.

- **Score planner** and **Music tokens**: temperature, top-p, top-k, repetition penalty, penalty window.
- **Min tokens** and **Max tokens** are **locked** against a stray edit: click the 🔒 beside the name to change them, and again to lock them. The floors are fuses: a score may not end before 200 tokens, the music not before 750 (30 seconds; a shorter requested length lowers it to that length). The music's maximum shows as **Max length**, in time (25 tokens a second), with no lock: it is the song's length at most, set here only (Sound and output has no length field).
- Every knob is held inside sane bounds; a value past them is pulled back, and the page says so.
- **Guidance (CFG)**: the music's guidance, the style's pull in the music stage; 1.6 by default in every mode.
- **Lyrics guidance**: the lyrics' own, apart from the style's: a third branch, the prompt without its lyrics, beside the two the guidance always had; 2.2 by default. Viktor's ear on one folk song: Guidance 4.0 with the lyrics at 2.2 the brightest, 3.0 with 2.2 as bright, 3.0 with 1.6 a depth of its own, the lyrics at 2.6 bring the shaker forward; at 1.6 the words dissolve, velvety. Equal, half the lyrics drift into hallucination, the С (s) is lost and the vowels' stress goes askew: keep the two 0.4 to 1.0 apart. A light beside each field says it: green inside his range (the music 1.0–4.0, the lyrics 1.0–2.6, apart by 0.4 or more), amber a little past it, red far past; nothing is clamped. Empty, the lyrics follow Guidance, as before.
- **Sound and output**, the block's lower section: **Denoising steps** and **Solver** for the sound half, **Format** (WAV 24-bit, 16-bit, 32-bit float or MP3 with its bitrate) and **Peak clip**; *Reset output* puts them back. Of the solvers, *Midpoint · release* and *Heun* take two network calls a step, *Multistep · AB2* (Adams–Bashforth of the second order: it reuses the step before) one call a step, and *Euler · draft* one call of the first order. **Sound decode** after them: *Whole song · standard* (the default, and the only decode anywhere else in the Studio) or *Ladder · experimental*: the sound half in even pieces of about 20 s, each hearing 2 s past its edges, the joints crossfaded; on the same codes and seeds it comes out close to the whole-song decode, not the same.

**A conservative recipe for Russian** (Viktor's, by ear): Composition *low*, Performance *low*, Style influence *high*: the score planner at temperature 0.85, top-p 0.92, top-k 40, the music tokens at 0.85, 0.93, 80, the repetition penalties 1.005 and 1.3 over a window of 100, guidance 1.6 with the lyrics' own 2.2; 32 denoising steps with Midpoint. No speeding up, rap at a moderate pace. It is the built-in profile *Musical Heresy of Creator's Ear*, his to set: Save over it in Profiles keeps his values on Forge, Delete brings these back.

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
- **Make again**: *Retake* (a new take from the same request), *Reuse* (the request back into the form), *Re-render sound* (the same music, new sound), *Regenerate from…* (keep the start, write the rest anew), *Transcribe this take*, *Trim to the text* (cut a tail after the last sung line), *End at…* (the take ending at the moment you choose, its last 2 s faded; from its kept latents, in seconds), *Fade in…* (its first seconds rising from silence, 2 s unless you say otherwise; the same way). *Extend…* keeps the whole take and goes on past its end, 0:15 to 2:00 more, with new lines after its own if you give them (a take planned with a score goes on Direct: its score ends where the take ends).
- **Edit** (each a new take; this one stays): *Crop…* keeps the stretch from one section to another; *Remove a section…* takes sections out; *Repeat a section…* plays the sections ticked twice, the copy right after them (the last chorus once more); *Insert a part…* puts a copy of one section after another (an intro or a break as an interlude); *Speed…* makes it faster or slower, its pitch kept. All on the score's bar lines (the take's own score, or the one written from its sound), each join healed by a short crossfade, the score joined along. Each of these dialogs, and those of the wave's own menu, shows the take's wave with its stretches marked: what is copied, where it goes, what goes and what stays, following your ticks.
- **Refiner**: *Spectrum*, *Lyrics check*. **Files**: the request and the score. *Loop…*: 1, 2, 4 or 8 bars on the score's bar lines from the bar where the player stands, seamless (its end runs into its start), saved as a WAV named with its tempo and key.
- **Note**: what works, what to fix, where it goes.
- The card below says how it was made: mode, format, VAE, model, steps, the shape, the LoRAs with their strengths and waves, both seeds (copy them to repeat it).
- **Over the room** (⤡) the take stands in two columns: what to do with it, its Style and its lyrics on the left; how it was made, its VAE and its score on the right. A new take opens with its Style and Lyrics folded; the tools stand in framed groups.

![How a take was made](guide/take-info.png)

### Replace a Section

When the studio has timed a take's lyrics by ear (the sections drawn on the player's wave), one section can be sung anew while the rest stays as it was. Right-click the wave over the section → **Replace this section…**.

- **What is sung**: every section heard clearly is a chip; the one you clicked is ticked, and you may tick more, up to eight. Each ticked section shows its lines as the lyrics have them: change the words, or keep them and let only the music be new. The dialog says when the new words hold more syllables than the section did (the model sings them faster or runs over the cut) or fewer. **Sing it anew** starts it.
- **What comes**: one or two versions, each a take of its own and a child of this one, named by the section and its stretch («Song · Chorus 1:02–1:25 anew A»). They land in the take's workspace (in «Replace a section» when that one takes no new takes) and show in Takes as each is done.
- **How it is joined**: the cuts lie in the rests heard by ear around the section. The take's music up to the first cut is kept, the section is sung on a new music seed, joined to the take's own music after it in the model's own tokens, and the whole is rendered again with the take's own sound seed: what is not replaced sounds as it did, and the joins are not heard. Several sections are sung in turn and the length stays the same, so the later cuts stay where you heard them.
- **On the player** the new stretch is tinted and edged, with «anew» over it; its card says the rest is as its parent made it.
- **Small edits land best**: a line with the same syllables, a word, a tag. A new seed may also sing a section without its words: hear both versions. A check that each version sang its words comes in 2.1.0.
- **Sing it once more…** and **Insert an interlude after it…** (the same menu): the section sung again right after itself, straight on or after about 4 or 7 s of music, a variation on the take's music seed + 1 (and + 2), not a copy; or about 5, 7 or 10 s of music after it, nothing sung again. The model plays as long as it likes, so the studio cuts by the draft's own voice, split off on the processor, and on the score's bar lines: whole bars of its music go in (from its middle when it played longer), and the take's own music after them goes on in its beat. New takes; this one stays.
- **Re-sing this line…** (the same menu, over a line): that one line sung anew on a new music seed, its words changed or kept, cut halfway to the lines around it; the rest of the take stays as it was. Where the lines run into each other with no breath between them, hear both versions.
- **Sing a window anew…** (the same menu, anywhere on the wave, no sections needed): a stretch you lay by a drag on the take's wave, sung anew with adapters of its own: the take's own at first, each with its music and sound strength and its wave over the window (flat, arch, rise, fall), and more may be added from your loras/. Over the ramps before and after it (2 s each at first) the take's adapters give way to the window's and back, so the change comes in and goes out instead of switching; the rest of the take stays as it was, rendered again on its own sound seed. One or two versions, children of the take, marked on the player as a replaced section is.

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

The steps are nodes on the canvas below, of three kinds as the work goes: **Hear and look** (Spectrum, Artifacts, Lyrics), **Mend** (Debuzz, Upscale, Stems) and **Finish** (DAW, Remaster). A click on a node opens its step in a window over the canvas, and what is made from the take hangs on its tree. A plugin's own steps join **Finish** with a dashed edge (see `docs/PLUGINS.md`). A plugin's step marked **GPU** runs on a card of the lab's jobs, in their turn, and a step made for one kind of file (a voice stem, say) picks the last such file as its source until you pick another.

Everything made from a take hangs on its **tree** (*Made from this take*), the newest on top: **the original** first, with its player and its FLAC, then every branch, playable and usable as a source for the next step. What runs shows where you look: in the room's head, at the top of the step's own block, and as a beating dot on its tab. Each step's block lists what it made for the take (*Made here*: a click finds it in the tree), and the step open lights its own branches. **Delete** at the end of a branch's head moves it into the take's trash (asked; a branch others were made from asks again and takes them with it); **Trash** under the tree brings one back, and **Empty the trash** deletes for good. The tree has its own place at the end of the Refiner's column of steps: **Made from This Take** under *This Take*, its mark the number of its branches; a click opens it where a step stands, and it lights the branches of the step you came from. Whatever runs on Forge also has its bar above the player in every room, with the time it has left. With a monitor kept in **Audio I/O** (a second output on Forge), each row has **On Forge**: the file plays through it from where its player stands, and again stops it.

**Compare all** (on the original's row, or *Compare* on any branch) opens every version in one player, as SUNO switches versions: the original, the debuzzed, the remasters, the upscales, the stems. A click on another version, or its number (1–9), plays it **from the same second**; Space plays and pauses, ← → move five seconds, Esc closes. The same music in other takes stands in it too, after the original: its re-renders under another VAE or sound seed, each named by its VAE, its seed and when it was made; a take you disliked is left out. With **Equal loudness** (on until you turn it off) each version is turned down to the quietest one's loudness, measured on Forge, and its row says it: the ear compares the sound, not the level.

### Import a Track

WAV, FLAC, MP3… from anywhere: it becomes a take in the library (48 kHz, 24-bit), marked *imported*, ready for stems, remaster and the rest. Lyrics are optional; the lyrics check matches against them.

### The Steps

![The steps](guide/post-steps.png)

No chain is laid out for you: you draw the way the take goes on the canvas, node to node (see *Your own way* below), or start from a pipeline, and **Run the way** in the room's head runs it. On a way that splits stems from the debuzzed (and upscaled) take, the remaster mixes them, so its preset and de-esser work there too; an upscale before the split lets the separators hear the whole song, and one at the end draws anew the top that the stems and the remaster leave (a hiss above 20 kHz, almost nothing above 22). One by one:

1. **Spectrum**: spectrogram, average spectrum, band energy; lay another take over it to compare.
2. **Artifacts**: a tone that will not leave, the VAE's 25-frame buzz in the highs, clicks, clipping, dropouts, stereo that fights itself. A time plays from there.
3. **Debuzz**: YuE2's decoder writes sound in frames of 1920 samples, 25 a second, and its highs tremble with them. This takes out the part locked to that frame clock above 2 kHz. 80 % is the ear's choice; 100 % thins the start.
4. **Lyrics**: Whisper listens and matches what it hears to your lyrics, minute by minute; *Time the lines* for karaoke timing. On the vocal stem it hears the words without the music. The timed lines download as .lrc and .srt, and as **.lrc (words)**, every word timed, for a player that sings along (the lines stay yours; only the times come from Whisper).
5. **Stems**: four stems (BS-Roformer for the voice, then htdemucs_ft for drums, bass and the rest; the instrumental too), six stems (the same voice, then jarredou's BS-Roformer-SW: drums, bass, guitar, piano and the rest), eight stems (six with the voice in two by a karaoke model, **Lead Vocal** and **Backing Vocals**, and the winds out of the rest), or vocals + instrumental. Each stem carries its proper name (Lead Vocal, Drums, Winds…) in the tree, in its download and in your DAW. *Source* is the take or a debuzzed or upscaled file of it, each source with a set of its own; your DAW gets the newest set of each kind.
6. **Remaster**: mix the stems or take the take; clean, de-ess, optionally retune 440 → 432 Hz, loudness (LUFS) and true peak. Each run is a new branch. The preset and the de-esser work on stems before they are mixed: with the take or any single file as the source they are off, and on a way they work when it splits stems.
7. **Upscale**: UniverSR draws the top of the spectrum anew; the original stays sample for sample below the cutoff. On a remaster (the last step of a way) the whole file is turned down if the new top passes the remaster's true-peak ceiling.
8. **Digital Gateway**: the take or any branch through an analog character in numbers on Forge: tape (30, 15, 7.5 or 3.75 ips: the head bump, the top, hiss, wow and flutter, azimuth), console, tube (with its sag), transformer or vinyl (lows in mono, crackle, rumble). The curve runs oversampled; the result is as loud as it came, its true peak under −0.3 dBTP, and the tree says what it adds to a −12 dBFS tone. Starting points set a character in one click; a branch of it can be the analog gateway's source or the Remaster's.
9. **Whole lead**: on a set of eight stems, where the split put the lead voice into Backing Vocals (louder there than in the lead, loud enough and centred), it is moved back into Lead Vocal with short ramps. Lead and backing together stay what they were, sample for sample: the mix does not change, only which stem holds the voice. Both come back as versions of their stems, for the DAW and the way's next steps; the tree says where the voice was moved and for how long.
10. **Voice upscale**: UniverSR on the voice stems only (lead and backing, or the lead alone) draws anew the air, the breath and the edge of the consonants the separators dulled, the rest kept sample for sample below the cutoff; each comes back at the set's own rate as a version of its stem. Its **Upscaler** is UniverSR alone (the default) or the bundle of three, UniverSR, Apollo-vocal and FlashSR, blended above the cut: averaged (measured closest to a voice's own top), the loudest, or air (averaged to 16 kHz, the loudest above); **Drawn top** lifts or lowers what they drew. The pipelines *Voices: subtle, normal, high, air, bright* use it. Apollo-vocal is non-commercial (CC BY-NC-SA 4.0): a song made with it is yours to share, not to sell; FlashSR comes on first use, its weights from the studio's own models (Apache 2.0, as its author stated) and its code from him.
11. **Before and after**: any file of the tree against what it was made from (a mix or a remaster of stems against the file the stems were split from; the take when nothing else), with its own button on every file: loudness, true peak, loudness range, crest, width, correlation and the share of four bands side by side, the average spectra at equal loudness and their difference, and the short-term loudness through the song; a picture and a page of numbers land in the tree.
12. **Match to a reference**: a file's tone moved toward a reference's (a file of this take's tree or another take), loudness left out: up to eight of the DAW's own bands (frequency, gain, Q), each kept only if it helps and stays within the bound you set. The file comes back with the same EQ rendered, as loud as it came or as the reference and never over −1 dBTP; its branch's **Onto the DAW's master** puts the bands on the master's EQ to hear them live on your mix.
13. **Mono Maker**: below a frequency (120 Hz unless you choose another) the side of the stereo is taken out, with no phase shift, the mid as it was: the bass and the kick sit in the centre, and the stereo above stays where it lives. Shaumarov's first tool on the instrument bus and the master; the branch says how much of the lows was side before and after.
14. **Peak glue**: a gentle compressor before anything else: only the loud moments lose the dB asked (3 unless you choose another), the sharpest transients pass, and the file comes back as loud as it came. It holds no ceiling: that is the next step's.
15. **True-peak ceiling**: the last step of a way: an oversampled lookahead limiter holds −0.5 dBTP (or −0.3, −1), checked by a true-peak meter. *as it came* only catches the overs at the file's own loudness; a loudness target (−14, −11, −9 LUFS) drives into it, with at most 6 dB of limiting.
16. **Voice tamer**: on the voice stems, where the voice's spectrum bulges over its own course at that moment (a resonance, a harsh overtone: the wolf in the voice), the bulge is lowered by part of how far it stands out, 4 dB at most unless you choose another, eased in and out; by default only what rises over the voice's own usual colour, and nothing under 2.5 kHz, where the vowels live. What does not stand out is not touched; a ringing «s» is softened where it rings and never cut short; one gain for both channels keeps the voice where it stood. Shaumarov's soothe2 and SpecCraft, taken as a hint; the branch says how much of the time it held and where.
17. **Voice attack and body**: on the voice stems, the beginnings of words are raised a little (2 dB at most) and the dying away of a sound a little too (1.5 dB); a held vowel and the silence stay as they are: the voice comes forward without a compressor's squeeze. Shaumarov's two transient compressors on the voice, taken as a hint.
18. **Bass under the kick**: the kick is found on the drum stem; while it sounds, the low octave of the bass stem (under 120 Hz unless you choose another, split with no phase shift) goes down by up to 3 dB, as far as the kick is loud; between the kicks and above the split the bass is what it was. Needs a set with the drums and the bass apart; Shaumarov's soothe2 keyed from the kick, taken as a hint.
19. **Details up**: three bands; in each, the quiet moments are raised toward its own loud level, the loud ones are never pushed down, the floor and the hiss are left; mixed in at 10 % as Shaumarov uses OTT, then back to the loudness it came at: the detail under the loud parts comes up, not the level.

**Pipelines.** Beside **Run the way** stands the way in hand: **My way** or a pipeline to start from. The studio ships *Quick polish*, *Song: stems and remaster*, *Song: my DAW mix*, *Song: full air*, *Warm tape*, *Spoken word* and *Look only*, and a plugin may bring its own. A pipeline is drawn on the canvas node to node; *Bypass on the way* in a node's right-click skips a step of it. Each step works on what the one before it made, a file or the set of stems as mended so far, so the Remaster and the DAW mix the whole lead and the redrawn voices rather than the stems as split. *As the DAW is set* takes the mix the DAW holds for this take. A pipeline's wires are yours to cut and draw anew as your own way's are: the first cut or wire makes it **My way**.

**Many takes.** **On the workspace…** beside **Run the way** runs the way in hand on every take of the workspace in hand, or of the whole library when none is, one after another on Forge, after asking first; the Librarian's menu on checked takes has **Refine N along the way**. The batch's line beside them says how far it is, what failed and which take is in hand; **Stop** lets that take finish and skips the rest.

### The Canvas: Nodes and Wires

![The Refiner as a canvas: every step a node, wired the way the sound goes](guide/studio-post-canvas.png)

The Refiner is a canvas of nodes, as ComfyUI lays its own: the take and every step in columns as the work goes, wired the way the sound goes, and at the left's bottom what feeds them, Import a Track and Audio I/O; at the bottom right **Made from This Take**, its window the tree of every file made from the take. The whole room fits one screen at 1080p (a narrow window takes the columns in two bands of three). The nodes are numbered as the work flows, the way's steps first, and **1…9, 0** open the node of that number, and two digits typed within half a second one past ten (**1** then **2**: the twelfth); every node says what it does under the pointer. A click opens a node in a window over the canvas, as large as what it holds; **Alt+← →** go to the step before and after, **Esc** back; the take's node opens the Takes, to pick another. Drag a node where you want it: it snaps to the canvas's 10 px grid. The grid icon in the room's head, **Arrange**, lays them out anew.

A node's **right-click**: *Open*, *Run up to here* (the way up to this node and no further, a step bypassed on it skipped), *Bypass on the way* (its step skipped, the node greyed), *Test the way up to here*, *Make it the target*, *Off the way*, *Clone* and *Arrange*.

**Your own way.** The way is yours to draw. A new studio starts with the take alone: drag a wire from its dot onto the first step, then from that step's dot onto the next; a studio that ran the old chain finds it here as its first **My way**. A click on a wire of the way cuts it there, and the steps after it are off the way. A wire dragged from a node's dot onto another puts that step right after it on the way (from the take's dot, first), and the newest file of the first becomes the other's **Source**. *Off the way* takes one step out and joins the steps around it. The way so drawn is **My way**, beside the pipelines, and this browser keeps it; **New way**, the eraser beside it, empties it to draw from nothing; **Ctrl+Z** gives back the way before the last cut, wire or emptying. A way starts from one of two sources: the take, or **Import a Track**. One drawn from Import a Track runs by itself on each track imported next. A way with no step on it runs nothing and says so.

**Slots and wires.** A node's inputs are named on its left and its outputs on its right, as ComfyUI's slots, of three classes: a file (amber), a set of stems (teal), one stem (violet). A wire leaves the slot of its class and lands on the slot that takes it, in its colour: the DAW takes stems and the voices' versions and gives a mix; a step on one stem takes it out of a set. The way is drawn thick; what was made from what, thin; a step's own source, dotted, only off the way; while a wire is dragged, the roads it may take show and only the nodes that can take it light up. A wire from a step off the way puts it where its kind stands (after Stems, Stems put in when missing), then the other after it; a wire into the DAW also sets its lanes to that step's newest files. The legend in the canvas's corner says it, and folds.

**Test and target.** *Test the way up to here* draws the way as it flows up to this node and checks each step against what comes to it: a set of stems for a step that mixes them, the stem a step mends, the interfaces in Audio I/O for a step that goes through hardware. Nothing runs: the wires flow, the steps that hold turn green, and the first that does not turns red with its reason. *Make it the target* marks the node with ◎: **Run the way** then runs up to it and no further, and a test goes to it; *No target* takes the mark off.

**Clones.** *Clone* puts a second node of the step beside it, Remaster ② say, with settings of its own: its window is the step's panel with the clone's settings in, the step's own come back when it closes, and a run from there runs with the clone's. The way runs the step's own settings, never a clone's.

**Profiles.** The sliders icon in the room's head keeps setups by name. **Save as…** keeps what every step is set to and where the nodes stand, never a take's sources or cut points; a click on a profile's name sets it all as a hand would; **Keep the setup as it is now under** writes the setup over a profile, **Delete** takes one away. The studio keeps them, so every browser sees them.

Every choice is in sight, no dropdowns: up to eight as a column of rows (short ones in a row), more behind a button that opens the list over the page, with a filter when it is long.

**Folds.** **▾** on the jobs' strip folds it to its first job and how many more.

### The DAW: Stems on Lanes

![The DAW: the stems on lanes over the console](guide/studio-daw.png)

**Preview.** The step **DAW** (in **Finish**, before the Remaster) lays a set of the take's stems on lanes, as a DAW does: each stem a lane, and one more, **Rest**, what the source holds beyond the stems (what the separation missed). All the lanes as they are give the source back, so a separation's misses are heard only where you change the mix. Each lane wears the colour of what it holds: the voices amber, drums red, bass violet, guitar green, keys blue, the rest grey.

On each lane: its **Version** (the stem as split, or a file made from it, a cleaned voice say), its level from −60 to +12 dB (a double-click puts it back at 0), **M** to mute it and **S** to solo it, and a meter as it plays. Drag along a wave to silence a stretch, right-click it to give it back, click to play from there. Everything is heard at once, every lane on one clock, sample for sample, as it will be mixed. **Reset** puts every lane back as split, the returns and the master too. **A** takes the lane's volume line in hand: a click on the wave puts a point there and drags it, a right-click takes it away, a double-click sets it to 0 dB; the volume is heard and mixed after the fader, straight in dB from point to point. A click on the version steps to the next, so two are compared as it plays; a right-click shows them all in the strip's devices. A silenced stretch's top corners fade into it and out of it, as long as you drag them (a double-click gives back ten milliseconds), and its sides move it.

**The ruler** over the lanes: a click goes there, a drag draws the loop and turns it on, and the loop plays round until **L** turns it off. **Ctrl+wheel** zooms about the pointer, **Shift+wheel** goes along the song, **−**, **+** and **Fit** on the ruler's left do the same by steps; the view follows the playhead. A click on a lane's name picks it for the keys (see *Shortcuts & Tricks*). Under the time, the song's sections as the player has timed them (the lyrics' own tags, placed by Whisper): a click on one goes to its start, a double-click loops it, **[** and **]** go to the section before and after.

The DAW's own full-screen button lays it over the whole window, the lanes as tall as the screen gives them; **F11** on the studio's tab does the same while the DAW is in sight. **Esc**, **F11** or the button again bring it back.

**The Console** under the lanes (**Console** in the DAW's bar shows and hides it) is a mixing desk: each lane a strip, then the two returns, **Room** and **Delay**, and the **Master**, kept in sight at the right. A strip from the top: its name (a click opens its devices), its inserts (**EQ** with its curve in small, **Comp** with its reduction as it plays), the sends to the room and the delay, width and pan, **Ø** for polarity, **M** and **S**, and the fader with its meter on one scale: the peak and RMS of both sides, the peak held a moment, and under it the loudest peak since it was cleared (a click clears). **+ VCA** after the strips adds a VCA, one fader over a group of strips (the strip picked is its first member): its fader adds its dB to each member's own, which stay where they are, its **M** mutes them and its **S** solos them; its devices name it and choose its members, and a strip may be in more than one.

Knobs and faders: drag up and down (**Shift** finer), the wheel, or the arrows once picked; a double-click puts one back where it was. A knob's or a fader's number takes a value typed: a click on it, or a digit while one is picked, opens a field; Enter sets it in its own words (dB, Hz with k for thousands, ms or s, %, 4:1, L30 or R30, −∞ for a send), Esc leaves it. **Ctrl+Z** undoes and **Ctrl+Shift+Z** redoes, the whole mix step by step. **A** and **B** hold two mixes of the set to compare as it plays: B starts as a copy of A, and what you set goes into the one lit.

**Mixes**, the console's third tab: the mix you are setting is kept on Forge beside the set's stems a moment after your hand stops, so the DAW opens as you left it in any browser, on any machine; **Save as** keeps it by name, a click on a name calls it back (Undo behind it), and **✕** deletes one when you say so. Where Forge did not keep it, the tab says why.

A strip's **Devices** (a click on its name, its **EQ** or its **Comp**): **Input** (trim, polarity, the stem's version), **EQ** (up to eight bands: bell, low and high shelf, low and high cut, notch; a double-click on the curve adds a band there, drag its point, the wheel over it sets its width, a right-click takes it away; behind the curve, the strip's own sound as it plays), **Compressor** (threshold, ratio, attack, release, knee and make-up, five starting points, its curve and its reduction) and **Output** (width, pan, the sends). The **Room** has three spaces, room 1.2 s, plate 1.6 s and hall 2.4 s, and its return; the **Delay** its time (in ms, or a note at a tempo), feedback, a low-pass that darkens each echo, and its return. The **Master** shows the loudness as it plays by BS.1770 (momentary, short-term, integrated since play was pressed), the true peak, the correlation of the sides and the spectrum. **Mono** and **Dim** under the master change only what you hear, never the mix. The compressor's **Listens to** keys it to another strip as that strip enters its own compressor, and **Duck** keys a strip to the lead vocal: the band under the voice. The master's devices draw the goniometer too: mid up, side across. The **Master**'s devices hold its chain in the order the sound goes: **EQ**, **Compressor** (it listens to itself) and **Limiter** (Plenio's lookahead limiter: ceiling, drive, release), then its fader; the master strip shows them as slots, each with its reduction as it plays. The compressor's **Blend** is parallel compression: its sound mixed with the dry one, 100 % the compressor alone; the starting point **Parallel** sets it at 40 %, the mix on Forge the same. **Gate**, a third insert on every strip, is a downward expander against the bleed a separation leaves between the phrases: it listens to the strip itself after its EQ, and below its **Threshold** lowers it by its **Ratio**, never more than its **Range**; the mix on Forge the same. Each return has its **Low cut** and **High cut** too (Off at 20 Hz and 20 kHz; on the delay they cut all its echoes alike, after its feedback), and the room its **Pre-delay**, on top of its space's own: the word clear before its room comes in; the mix on Forge the same. The master's devices show two more numbers beside them: LRA, the loudness range since play by EBU Tech 3342 (how far the short-term loudness moves), and PLR, the true peak over the integrated (the smaller, the more squashed); when a mix is made, its message says the render's LRA too.

**Automation beyond the volume.** **A** on a lane takes a line in hand, and the chip beside it says which knob the line draws: **Vol** (the volume, after the fader), **L–R** (the pan), **Wid** (the width), **Rm** and **Dly** (the sends to the room and to the delay); a click goes to the next. A click on the wave puts a point and drags it, a right-click takes it away, a double-click gives it the knob's rest (0 dB, the centre, as it is, none). A knob with a line plays its line instead of its own value, live and in the mix, straight between the points.

**Inserts and Print.** A strip's **Input** has **Insert**: the strip's version as it plays, through the **Digital Gateway** (tape, console, tube, transformer, vinyl) or a plugin's step on a file, on Forge. What comes back becomes the strip's new version, heard at once as it will be mixed, and its versions keep the way back. The master's **Print** sends the mix as the DAW holds it (its versions and every knob) through the Digital Gateway: a branch in the tree beside the DAW's own mixes.

**Audio buses.** **+ Bus** on the console makes a bus of the strip picked: its members' sound (after their pan; their sends still leave from their own strips) summed and run through the bus's own EQ, compressor, fader, width and pan into the master. Its devices choose its members (a strip goes to one bus; one in another bus moves over), its name, EQ, compressor and output; **M** silences them all. The mix on Forge sums and processes them the same way.

**Moving and copying.** **Shift** and a drag along a lane picks a stretch (a plain drag still silences one). **Ctrl+C** copies it, **Ctrl+X** takes it to move, **Ctrl+V** lays it at the playhead on its own lane: what was there is replaced with 10 ms crossfades, the stretch drawn with the wave it brings, and a moved one's source falls silent (the next Ctrl+V lays a copy). **Delete** silences the stretch in hand, **Esc** lets it go, a right-click on a laid stretch takes it away; undo takes any of it back. A laid stretch lies over the lane's cuts, and the mix on Forge lays it the same way.

**The reference, the solo light and the song's fade.** **Ref** in the DAW's bar (or **R**) plays the sound as it came, the one the stems were split from, in place of the mix and as loud as the mix over what has played, so you compare the sound and not the level (louder always seems better); the button says by how much it was raised or lowered, **Mono** and **Dim** hear it too, and a second press gives the mix back. While a lane is soloed the bar shows **S · n**, how many lanes are heard, since **Mix** makes only them: a click on it, or **Alt**+click on any **S**, lets every lane be heard again. The **Master**'s devices hold the song's **Fade**: **Fade in** brings it up from −60 dB, **Fade out** takes it down to −60 dB before its end, and **Ends at** puts the end at the playhead (silent after it; **At the song's end** gives the end back). The fade is linear in dB, after the master's fader, drawn dark over the lanes, and the mix on Forge has it the same.

What you hear is what is mixed: the same EQ bands, the same Plenio compressor (in the browser's audio thread, or on the page's own thread when the studio is opened by its network address), the browser's stereo panner and its law in the mix, the same room's impulse, the same echoes. One difference only: after a jump in the song the compressor's memory starts afresh.

**Mix** renders the mix as it is heard, on the studio's machine, on Plenio's own EQ, compressor, room and delay (Plenio 0.8.0, Apache-2.0, carried unchanged): a new branch on the tree, its loudness measured; a mix peaking above −0.3 dBFS is lowered to it and says by how much. **+stems** beside it writes every strip as it sounds in the mix, and each return, as its own file beside the mix, for a DAW of your own. While it runs, **Stop** beside it ends it on Forge and nothing is made. The master's chain is mixed by Plenio's own too, the limiter included.

## Artist

The room that paints: a cover for each take, a 16:9 for its video, a 9:16 for a short, from your words, from a picture of yours, or from both. The form on the left, the stage in the middle, the library on the right. The whole room in depth, every control and how it is made inside, with recipes and the numbers: [The Artist in Depth](https://github.com/igrbible/Ruach_Studio/blob/main/docs/ARTIST.md).

### Pictures for Your Songs

Write what you see for the song, in sentences: Qwen-Image reads a prompt as a description, not as a list of tags. Put what is in the picture first, then the light, the colours and the medium (oils, ink, a photograph), and end with *no text* when you want no letters in it. **From the take** puts in the prompt the take in hand got its artwork from, or one made of its title and style, to start from.

**Shapes**: **1:1** (1280 × 1280) for the cover, **16:9** (1920 × 1080) for a video, **9:16** (1080 × 1920) for a short. The shapes of one press share their seed, so they come out as one series: the same scene in the same colours, each composed for its own frame rather than one picture cut three ways. **Variations** draws the next seeds too (the seed, the seed + 1, …), each in every shape.

**Seed**, with its mode beside it: **Random** (−1: a new seed each press, the field empty), **Random, fixed** (a random seed put in at once and kept), **Fixed** (the one written), **Next** and **Previous** (after a press, the field moves past the seeds its variations used). A number typed into the field is that seed (Random turns Fixed); an emptied field is a new seed each press (Fixed turns Random); ⟲ is Random again. The seed of a picture you liked draws it again: each run shows its seed, and **To the form** brings it back with the prompt.

**Three columns**: the prompt and its knobs on the left, the stage in the middle (the run being painted develops there, its progress across its top; else the picture you picked, its buttons under it, its run's data and prompt in a tip beside it, over the library, while the pointer is on the picture), the library on the right; drag the edges between them to widen a column (← → from the keyboard, a double click for its own width). The column's choices stretch with it, never narrower than the painters' names. From a window 920 px tall the room stands whole in it: the page stands still, the form and the library scroll on their own, and Draw's row stays at the form's foot.

**Live preview** (on by default): the place of the picture being painted shows each of its steps, from the noise to the picture, an eighth of its size and seen without the decoder, so it costs nothing; off, the place waits for the finished picture. A bar across the stage's top follows the run, picture by picture and step by step.

**Two runs at a time**: while one goes, **Draw** asks the next one, which waits behind it (Ctrl+Enter too); **Stop**, beside Draw while a run goes, ends the drawing one (else the waiting one leaves the queue); the pictures it finished stay.

### The Painters

**The Artist's brushes** is one list of every painter and file here, grouped by model: Qwen-Image 2512 from a GGUF (Q4, Q6), each fp8 file in `artwork/Qwen-Image-2512/checkpoints/` (2512's own BASE and the fine-tunes) and Qwen-Image 2.1. **⚡ Lightning** marks a brush that paints with it by default; a fine-tune is marked as one. A file put into `checkpoints/` becomes a brush of its own when the room reads the list again (after a fetch, or when the page is reloaded). Krea 2 Muse left the studio in October 2026: Qwen-Image 2512 follows the words better and letters a title right.

**Qwen-Image 2.1's fine-tunes**: an fp8 single file in `artwork/Qwen-Image-2.1/checkpoints/` (ComfyUI's; FinalCut v1 the first) is a brush of 2.1, said *Fine-tune · fp8 · its name*; 2512's own fp8 file is said *Base weights*. A fine-tune of 2.1 is 2.1 in every other way: its licence, edits by words, lettering, Turbo.

**Qwen-Image 2512** (Apache-2.0) from a GGUF at **Q4** (a card of 15.5 GB) or **Q6** (20 GB), or an **fp8 fine-tune** of it (22.5 GB: ComfyUI's single files put into `artwork/Qwen-Image-2512/checkpoints/`, each a brush of its own); about half a minute a picture with Lightning, after a minute or two of loading. **Qwen-Image 2.1**, under the Qwen Research Licence (research and evaluation only: not for a cover you sell), paints from words and edits a reference picture by the prompt's words; a mask and *Paint around it* want Qwen-Image 2512. On a card that holds neither its text encoder nor its painter whole (a 16 GB card, or a card under a lower VRAM limit) both stream from RAM: under a 15.5 GB limit on a 3090, 135 s from words at 4.1 GB at the peak, 129 s editing at 7.9 GB.

Each painter shows only when its files are here; the others are named under the painter. **Engine → Models and LoRAs → Qwen painters** fetches Qwen-Image 2512 at Q4 (31 GB) or Q6 (34.5 GB) with Lightning, and Qwen-Image 2.1 (33.1 GB), each asked first with its size (2.1 with its licence too). From a terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Get painters and adapters…** under the painter lists in the room itself what the studio can fetch for the Artist: the Qwen painters, four fp8 fine-tunes of Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image and 2512 itself, 20.4 GB each, shared in the studio's models repository by their authors' leave) and four adapters, each with its size, here or **Fetch**.

**Which card paints**: a press waits in the lab's queue for a card with room, as the takes' artwork and the stems do; while it waits, **Off the queue** takes it back. A card nothing else uses takes a run whose need fits its memory less 512 MiB (the CUDA runtime's own share); a card in use takes it when its free memory holds the need. A Qwen-Image 2512 painter no card here can hold whole streams its blocks from RAM instead: the blocks that fit stay on the card, the rest come as each is needed, and the picture is the same, slower by what the bus cannot hide (with four adapters on a 24 GB card about a sixth; every block streamed, it takes 2.3 GB of the card, so a card of 6 GB paints it, given about 30 GB of RAM); another painter no card can hold is refused at once, with the numbers and the painter that would fit. Qwen-Image reads the prompt with its text encoder (Qwen2.5-VL-7B, 15.5 GB) on the card when the room free there holds it, else on the processor, before the painter comes: the picture is the same either way.

**The content filter**: every picture passes a content filter (Falconsai's nsfw_image_detection, Apache-2.0), whatever painted it (the studio's rule for every painter): one it flags is not kept, and the run says so.

### Lightning

**What it is**: Lightning (lightx2v, Apache-2.0) is an adapter that teaches Qwen-Image 2512 to paint in a few steps without guidance: the model's own long guided way distilled into 8 steps. Its file lives in `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0.85 GB) and comes with the Qwen painters' fetch.

**How the studio lays it in**: with Lightning on, the painter loads it as one more adapter beneath your own LoRAs, at its strength: **1.0** for the GGUF Q4 and Q6 and 2512's own fp8 BASE (the base it was distilled from, at the 8 steps its makers give) and **0.55** for an fp8 fine-tune, at 12 steps (a fine-tune has moved away from the base, and Lightning at full strength would pull it back; Viktor's own setting in ComfyUI). The schedule becomes Lightning's own: a shift of log 3 at every size, as it was trained. Guidance is off (true CFG 1): one pass of the model a step.

**With it off**, the painter takes 2512's own way: 30 steps by default (10 to 60) and **guidance** 4 (true CFG with its empty negative: two passes a step). Sixty passes against eight: the painting itself takes some seven times as long, the loading the same, and gives the detail and the light of finished realism.

**Turbo** is Qwen-Image 2.1's own speed-up, as Lightning is 2512's: the *Turbo 4step* adapter (AiMetatron's) in `artwork/loras/qwen-image-2.1/`, under the same switch in *Sampling*, named Turbo there; off unless asked (2.1 paints as it always did, 30 steps), on 4 to 16 steps. On an RTX 3090 at 1280²: 30 steps 96 s, Turbo's 4 steps 42 s.

**Its defaults**: the GGUF Q4 and Q6 paint with it (drafts, smaller cards); an fp8 fine-tune paints without it unless you switch it on (finished realism); a take's own artwork is painted with it (*Engine → Artwork*). The rule behind them: Lightning for drafts and covers, not for professional realism.

**The switch**: in Sampling, with its strength beside it; with it on the steps go 4 to 16 and Guidance hides; off, Guidance shows. Without its file there is no switch, and 2512 paints its own way. The strength is kept for each painter; your adapters' sum (*Together*, below) does not count Lightning.

**What it costs**: on an RTX 3090 at 1328 × 1328, Qwen-Image 2512 with Lightning paints in about 30 s a picture at Q4 (14.3 GB at the peak) and 32 s at Q6 (17.6 GB); an fp8 fine-tune at 0.55 and 12 steps in 37 s (21.0 GB). A take's cover with Lightning took about a minute and a half with the loading and the prompt.

### Samplers and Schedules

**Sampling** under the painter, folded, its values in its summary: the steps, the sampler and the schedule, kept for each painter; **Reset** gives the painter's own back. The steps: Qwen-Image 2512 with Lightning, 4 to 16; else 10 to 60; a number past the range is kept at its edge. The form's estimate of the time counts the sampler's passes.

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

**What two matrices showed** (54 pictures through a test lab, one prompt, one seed): on Qwen-Image 2512 **with Lightning, Karras, Exponential and KL optimal can paint the subject twice** (two lighthouses where one was asked): with Lightning keep Simple, Beta, Beta 57, SGM uniform or Bong tangent. **Without Lightning, Euler SDE paints Qwen soft and hazy**: Euler, ER-SDE or RES keep the detail. The form says both when they apply.

**Where they come from**: written for the studio from the methods' papers and ComfyUI's formulas (GPL-3.0, which the studio's AGPL may take); RES4LYF's were read for their mathematics only, as its licence bars commercial services: none of its code is here; Heun++ is Carzit's (MIT).

### Regions

**Regions** under *Sampling*, folded: up to three parts of the frame, each a place (a half, a third, a quarter or the middle; a small map beside it shows where) and words of its own. At every step the painter is asked once more for each region, with the prompt and the region's words, and its answers are blended by soft-edged boxes, as Latent Couple does; the rest of the frame follows the prompt alone. So the prompt says the whole scene and a region what stands there: *two animals in a snowy forest clearing*, then *a red fox* on the left half and *a white owl on a stump* on the right. Each region costs a whole pass more a step (on a 3090 at 16:9, Qwen-Image 2512 fp8: 141 s alone, 281 s with two regions). Kept in this browser; a region without words is not sent; **Again** paints with the run's own. For Qwen-Image 2512; Qwen-Image 2.1 edits by words and paints without them.

### Lettering

**Lettering** under *Regions*, folded: a title, and a second line under it (the artist, the album), lettered as part of the painting rather than laid over it. Its words go in fields of their own, never in the prompt: **Title**, **Second line**, **The letters** (what they look like, in words; empty: classical serif capitals in warm gold), **Where** (at the top, in the middle, at the bottom) and **How**: *painted with the picture* (Qwen-Image 2512 or 2.1 paints the prompt's scene with the letters in it; a take's «No text» is taken out of the prompt) or *on the reference picture* (Qwen-Image 2.1 letters a finished picture by words and keeps the rest; **Letter it** on a picture makes it the reference and opens the block). The painters misspell words they have rarely seen («RUOCH STUDIO»), so each picture is read back by the listener (Qwen2.5-Omni, about 5 s a picture) and one misspelled is painted again with another seed, up to three times: the first spelled exactly is kept, the others go into the run's misspelled/ folder. A mark beside each picture says how it reads: ✓ spelled as asked, ⚠ misspelled in every try (its tip says what it reads), ? not read back (the listener is not on the machine). On a 3090 Qwen-Image 2.1 lettered a square in 118 s; Qwen-Image 2512 fp8 (without Lightning) painted one with its letters in 230 s, its loading counted. Cyrillic too, surest in capitals. Kept in this browser; **Again** letters with the run's own words.

### Adapters

**LoRA** under the painter: the adapters of its family (Qwen-Image 2.1, Qwen-Image 2512), up to four, each at its strength (0 to 1.5); a click on one of its trigger words puts it into the prompt. **Add…** opens the library: the folders on the left, the cards with their pictures, a search. The adapters live in the studio's `artwork/loras/<family>/` (`qwen-image-2.1`, `qwen-image-2512`): any folders inside become groups, and a picture beside a file with its name (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) shows on its card. Get them from Civitai by their base model (Qwen) and put the `.safetensors` there; **Look up on Civitai** sends each file's SHA-256 and nothing else, and keeps the answer beside it (`NAME.civitai.info`: its name, base model and trigger words, and its first picture rated safe when it has none). What ComfyUI's LoRA Manager or Stability Matrix wrote beside a file is read as well. An adapter made for another model, which would reach none of the painter's layers, stops the run and says so. A right click on an adapter's row **mutes** it: it stays in the list at its strength and leaves the run (**Unmute** brings it back); an adapter at nought is not loaded either. The four adapters their authors let be shared come from **Get painters and adapters…**.

**Together**: from two adapters, a bar under them gives their strengths' sum on the Creator's road: green to 1.2, amber to 1.8, red past it. Stacked adapters add up, and past about 1.8 a picture burns (its colours and edges overdone) however modest each one is; the zones are a first measure for pictures, to be set by eye. Drag the bar to move them all at once, each in proportion to where it stood.

### A Picture to Paint From

**Reference picture**: a picture to paint from, as image to image: drop one on its place under the prompt, paste one (Ctrl+V), choose a file, or take the stage's picture with **As reference**. **How much it may change** says how far from it the painting begins: 0.3 keeps it nearly as it is, 0.6 keeps its composition and changes its matter, 0.9 paints the prompt's scene in its light and colours, 1.0 paints anew. Each shape is covered by the picture and cut from its middle; **Again** paints from the run's own; ✕ paints from the noise again.

**Use it** under the picture says how: *to paint from* (as above, by the form's painter, as far as *How much it may change* says), *to edit by words* or *for its style only*, both by Qwen-Image 2.1 when it is here (off otherwise). Edited by words, the scene stays and the prompt says what changes (*the same lighthouse in a snowy winter night*: the snow came where it belongs, the tower and the rocks kept). For its style, the prompt's own scene is painted in the picture's technique, brushwork, palette and light, nothing of its subject kept (the lighthouse in oils gave *a red fox in a snowy forest under the moon* in its brush). Either way the run is Qwen-Image 2.1's whatever the form's painter: the form's model, sampling, adapters, mask and canvas are not sent, and its licence (research and evaluation only) holds. About two minutes a picture on a 3090.

**Mask…** beside it paints over the picture what to repaint (Paint, Erase, the brush, Invert, Clear): the rest stays exactly as it was, as inpainting. **Paint around it** holds the whole picture in each shape's middle and paints the edges anew (a square cover into a 16:9 or a 9:16), as outpainting. **The take's cover** takes the cover of the take picked on the right. With a mask or **Paint around it**, four options under the picture: **Grow** (the mask grown by so many pixels, or shrunk), **Edge** (how soft its edge is), **Soft** (soft repainting, as differential diffusion: where the edge is grey the picture changes only in the last steps, so no seam) and **Grain** (how much of the new paint the kept part takes, its grain and light sewn to the new; 0 keeps it exactly).

**Canvas…** beside **Mask…** opens the canvas, as InvokeAI's: each shape's frame a tab on top, saying how it will be painted (**from it**: the picture covers the frame and the run paints from it, image to image at the strength asked; **around**: the part of the frame it leaves bare is painted around it). On the board **Move** (V) drags the picture, or a corner to scale it with the opposite corner kept; **Brush** (B) and **Eraser** (E) paint the inpaint mask over it; **Hand** (H, or Space held) moves the board; the wheel zooms, Alt+wheel scales the picture about the pointer, the arrows nudge it. On the right the layers (the mask with **Invert** and **Clear**, the reference with its opacity on the board only) and its place in numbers (width, X, Y in the frame's share); on top **Fit**, **Fill**, **Centre** and **Same in all** (the picture as large in pixels in the other frames), undo and redo (Ctrl+Z). **Done** keeps the places with the reference and the mask in the form; under the strength the form says how each shape lies, and ✕ takes it off the canvas.

### The Stage and the Library

A click on a picture puts it on the stage with its run under it; a click on the stage's picture (or a double click on a picture) opens it over the page in its own shape (← → walk the run, or the gallery when it was opened there; Esc closes), with ★, **To the form**, **Set as cover** and **Download** (PNG, full size). On the stage, **Note…** keeps a note of your own with the picture in its run (what it was made for, the words that lettered it, what to try next); the picture's tip shows it.

**Runs or Gallery**: the runs show each press of Draw with its prompt and seed, the newest on top; the gallery shows every picture of every run in one grid, the newest first, by shape (1:1, 16:9, 9:16) or starred (☆ on a picture stars it), in three sizes, in even tiles: equal columns, every tile the same box, each picture whole in it.

**Compare**: the stage's **Compare…**, then the other picture picked in the library: the two lie one over the other under a divider you drag (← → move it), or side by side (S); X swaps them, Esc closes. **Ctrl** (or ⌘) **+ click** picks pictures and **Shift + click** a range: the library's bar then stars them or puts them in the trash at once (Esc lets go).

**A picture's menu**: a right click on any picture (a run's, the gallery's, the stage's, the one over the page): **Over the page**, **To the stage**, **To the form** (its prompt, seed and shape), **All of it to the form** (its painter, fine-tune, sampling and adapters as well: Draw paints that picture again), **As reference**, **Compare…**, **Set as cover**, **Upscale** (2K or 4K, the sizes they give), **Star it**, **Pick it**, **Copy the prompt**, **Copy the seed**, **Download**, **The file in a new tab**, **Its run** (the Runs look, its card lit), **To the trash**. A run developing on the stage has none. Over the page the menu stands over the picture and has the keys while it is open: Esc closes the menu, the next Esc the picture.

### Upscale

**Upscale…** on the stage makes the picture **2K** or **4K**: its long side 2560 or 3840 px (a square cover 2560² or 3840², a 16:9 2560×1440 or 3840×2160), with an upscaler (ESRGAN, DAT, HAT, SPAN and their kin, read by spandrel) picked in the row that opens (kept; 4x_Nomos8kDAT first when it is there); each button's tip says the size it gives, and a picture as large already has the button off. The model runs as often as the size needs (twice at most) and the result is brought to the exact size. The large picture is a run of its own beside its source, under a minute on a 3090; **Again** upscales the same picture again, perhaps with another model. The upscalers live in the studio's `artwork/upscalers/` (`.pth` or `.safetensors`, folders allowed); OpenModelDB lists hundreds: mind each one's licence.

**Outpaint…** on the stage paints a picture's edges on: the picture whole in the middle of a wider (16:9), taller (9:16) or square canvas, the rest painted by Qwen-Image 2.1 with the *Outpaint v2* adapter (AusBoss's, in `artwork/loras/qwen-image-2.1/`), its own pixels pasted back over the result. Words of what lies beyond its edges are a wish, not a need. 25 steps; a 1:1 into 16:9 took 90 s on an RTX 3090.

**Second pass…** beside it paints the picture over larger, as Viktor's ComfyUI workflow does after its first pass: the picture brought up **×1.5** or **×2** (by nearest, as his) and painted again by its own run's painter, fine-tune, adapters, prompt and seed, from part of the way (*How much it may change*: 0.3 keeps the drawing and adds detail, 0.5 sharpens its matter, 0.7 repaints its forms). The steps, sampler, schedule and Lightning are the form's when the form paints with the same painter, else the run's own: his recipe gives the second pass many steps and no Lightning. A 16:9 of 1920×1080 comes out 3840×2160. Measured on a 3090: Qwen-Image 2512 fp8 at 3840×2160 in 220 s with 12 steps and Lightning (22.9 GB). Not for Qwen-Image 2.1, which edits by words; no mask or canvas with it. **Extra noise** in its row (0.6 first, as his) and under a reference's *How much it may change* (0 first) is his workflow's InjectLatentNoise: fresh noise on the picture before the painting starts from it; 0.3 brings new grain and detail, above 1 the picture's forms begin to break.

### A Cover for the Take

A square picture has **Set as cover**: it becomes the cover of the take in hand (pick one on the right), in its card, in the player and in its MP3. The cover it had is kept beside the take (`artwork-removed/`), as a redraw keeps it, and the other letter of an A/B pair gets the new one too when it has none.

**A take's own artwork** (*Draw artwork* in its menu, in the Librarian, for one take or many) is painted by the painter in **Engine → Artwork**: by the cards (Qwen-Image 2512 Q6 or Q4 whole where a card holds it, else Q4 streamed from RAM on a smaller card), or the one you choose among the Qwen painters this machine has: Qwen-Image 2512 Q4 or Q6 and each fp8 fine-tune with Lightning, Qwen-Image 2.1 with its licence said (not for a song that is sold). A fine-tune chosen that is no longer here gives way to the cards' choice, and the artwork says who painted it.

### The Artist's Trash

The runs stay in the studio's `artist/` folder. **Trash** on a run moves it to `trash/artist/`; the stage's **Trash** puts a picture aside. The **Trash** look beside Runs and Gallery shows the pictures put aside first, each with **Restore** and ✕, and **Restore all**; then the runs in the trash, each with **Restore** and **Delete for good**; **Wipe out** at its head deletes all it shows. Each deletion asks first and cannot be undone.

**Trash (Art)** in the Librarian's column, under Out of sight, holds the art put away as tiles (a click on one ticks it): the Artist's runs in the trash, the pictures put aside, and the covers taken off the takes (by a redraw, by Remove, by a new cover), each with its picture and what it weighs. Tick them to give them back (a cover goes back to its take, the one it has now kept in its place) or to delete them for good, asked first; with none ticked, **Wipe out the art's trash**. A frozen workspace's covers stay as they are.

### The Artist's Log

The server log's frame has five views, **Server**, **Creator**, **Trainer**, **Refiner** and **Artist**, and each room opens on its own: the Artist's room on the Artist's. The Artist's log, kept in this browser (its last 400 lines), says what was asked (the painter, the fine-tune, the shapes, the seed, the sampling, the adapters), what the lab answered (a refusal in its own words), each run's way to its end (waits and why, paints on GPU N, done, stopped, failed and why), and the lab's own lines about the Artist. **Copy** takes the view's lines; folded, the frame says the view's last line. **⧉** opens the log in a window of its own, both views mirrored: in Chrome it stays over every window (Document Picture-in-Picture); elsewhere it is a window to carry to another monitor. The window carries the cards live beside the log; the frame folds while it is open and unfolds when it closes, if it was open. **Creator**, **Trainer** and **Refiner** show the server's lines that are each room's own: the engine's and the page's the Creator's, a training run's the Trainer's, stems, remaster, upscale and the DAW's mixes the Refiner's; the view picked is kept for the room, and a room with nothing in the log yet says so.

### Coming to the Artist

The versions of a take's picture; SeedVR as an upscaler (with the DAW phase, in 2.1.0).

## Librarian

### Every Take

![The Librarian](guide/studio-collection.png)

- **The heading** names the collection open (*Librarian › Fosforida*) and what it holds: takes, hours, likes, favourites, notes, how they were made.
- **Workspaces** on the left: All, Favourites, Not in a workspace, your workspaces, *+ New workspace*; Hidden and the Trash out of sight. Right-click a workspace for its **locks** (*Lock Workspace Deletion*, *Lock Tracks Deletion*): a 🔒 by its name, and nothing in it goes to the trash. The 💎 workspaces (the studio's public sets) stand at the tree's foot, by name, and the 💎 … LoRA ones lowest of all.
- **The playlist** stands first in the column, a place of its own: it is never renamed, deleted or frozen. A take goes in from its menu (*Add to playlist* › *First*, *Last* or *Random*; on a checked card, all the checked ones), and × takes it out of the playlist alone, never out of the library. Its view is one list of wide cards: ▶ first, then the title, when it was made and its length, its marks, and the cover last. Drag a card to its place; *Shuffle the deck* deals them all anew. *Play from the top*, or ▶ on any card, plays the playlist in its own order to its end, whatever *play on* says, and a thin strip under the player names the take before, the place in the playlist (*Playlist · 3 / 12*) and the take after: a click on a name plays it, and × leaves the playlist. The player's last button opens the same list in a window, with the player still in sight under it. Its head holds the crossfade, 0 to 4 s: the next take comes in under the tail of the one before, both held in the page beforehand, so neither waits on the line; Previous and Next change at once.
- **Search** with words, `*` and `?`; **sort** newest, oldest, by title, longest; **Tiles** or **List**: all three in the heading line, beside the counts.
- **A card** wears its take's artwork in its top right corner, beside the title, when it has one (*Draw artwork* in the take's menu); a click shows the picture whole over the studio, where ‹ › and the arrow keys walk the pictures of the cards shown, ▶ plays its take and Esc closes. The card that plays glows with the song's own peaks. A thin stripe down a card's left side says your verdict on it: the accent for ★, green for 👍, a muted red for 👎, grey for none.
- **Fresh takes**: a take you have not played yet wears a light dashed line; its first play takes it off. A regenerated take carries a *regen* badge and keeps its note, like and star.
- **The workspaces column**: drag its edge to widen or narrow it; « folds it away, and the cards grow wider: their columns stay, so the eye keeps its place.
- **Sections**: a workspace can hold sections, two levels deep at most (⋯ beside its name → *New section…*), to sort what is in it without a new workspace each time. A workspace shows its sections' takes too. Whatever the Refiner makes something of goes by itself into the section *Refined* of its workspaces. A workspace with sections has a small triangle at the left of its row: a click folds its sections out of the column or brings them back, and the folded ones are remembered. The column scrolls on its own and stays under the room's head, so its top is always in reach.
- **Drag a card onto a workspace** on the left to move it there (all the checked ones, when it is checked); hold **Ctrl** to add it there and keep it here too. The studio asks first, and Ctrl+Z gives it back.
- **Pinned takes**: up to four in each workspace, in a strip of their own tone above the cards (right-click a take → *Pin here*; × unpins). When you check takes, the bar of the checked takes the strip's place, so the cards never move. That bar is a row of framed icons: the choice, the marks, the workspaces, the export, and the trash at its end; each says itself on hover.
- **Filter** (the button at the end of the search row) opens a window as the workspace chooser does: tick what to look for in three groups (how it was made: raw (straight from the model), imported, regenerated, re-rendered; marked: liked, disliked, favourites, with a note, with artwork; what it has: stems, debuzz, remaster, upscale), each with how many takes of the place, and how the ticked join: all of them (AND), any (OR) or none (NOR). *Show* applies them; the button then says how many are on and how they join.
- **Select** several, as in a file manager: check one, and from then on a click anywhere on another card checks it too (Shift: the whole range). A drag on the empty space between the cards draws a band that checks what it touches; **Ctrl+drag** draws it from anywhere and keeps what was already checked. The bar of the checked floats above the player: favourite, add to a workspace, move to one, take out of this one, hide, export a ZIP, to the trash.
- **The trash** gives back, or wipes out after you confirm. **Trash (Art)**, beside it in the column, holds the art put away (the Artist's runs in the trash, the pictures put aside, the covers taken off the takes) and gives it back, or deletes it for good after you confirm; a frozen workspace's covers stay.

### A Take's Menu

![Right-click a take](guide/collection-menu.png)

**Regenerate with a new seed** (in the take's menu: Edit, then Regenerate): the take made again from everything it was made with, but new seeds; the new one takes the old one's workspaces and note, and the old one waits in the section *Sourced for Regeneration* of its workspace (its workspace does not show it among its own) until you empty it; the new one keeps its note, like, star and picture. A probe comes out its full two minutes. Play, open in the Creator or in the Refiner, the sheet (its score), the datasheet (all it was made with: the style and the lyrics, the score drawn, every knob, the LoRAs with their strengths and waves; a Direct take has no score, and *Write it from the sound* asks the transcriber for one), like, dislike, favourite, a note, rename, **workspaces** (one take can sit in several), **move to** one workspace (on a checked card: every checked take, out of the workspace open), hide, send to the Writer, copy, download, **export to DAW** (REAPER project or DAWproject, on any take: with its stems once the Refiner has split them), the trash. **On a checked card, with others checked**, the menu acts on all of them, and its head says how many: like, dislike, favourite, artwork, the artwork taken off, workspaces, hide, a ZIP; drawing artwork for several and regenerating several ask first, as they cost a card's minutes.

**Draw artwork**: a small language model (Qwen3-4B) reads the take's style and words and writes one picture prompt; Qwen-Image 2512 paints it with Lightning (1328 px, kept at 1024), in about two minutes on a 16 GB card with the prompt and the look-over (on a smaller card its blocks stream from RAM, a little slower; *Engine → Artwork* picks the painter). It shows in the player, on the card, in the desktop's media panel, and inside the MP3 you download (as its front cover). Once a take has its picture, the menu says *Open the artwork* (over the page, as a click on the card's picture or on the player's square) and *Redraw artwork* (a new prompt and a new picture; the old one is kept beside the take, in `artwork-removed/`). The prompt writer and the content filter come with `heresy/fetch-heresy.sh --artwork` (8.4 GB, asked first), the painter with `--qwen 2512-q4` or `2512-q6`. *Engine → Artwork* offers every Qwen painter here: Qwen-Image 2512 and its fp8 fine-tunes with Lightning, and Qwen-Image 2.1 (see Artist › A Cover for the Take).

### The Instruments under the Style

Under the Style box, the studio names what your prompt asks for: a chip for each instrument and style of the cheat-sheet it finds, coloured by what the ear found (green heard, amber questioned, red not played by that name) and wearing the instrument's picture. Rest the pointer on one for its card: the picture, its home, how it sounds, ▶ A and ▶ B with their seeds. A click shows the picture whole. **Alt+I** opens the cheat-sheet from anywhere.

### Artwork: What Draws It, What It Cannot, Another Painter

**What draws it.** A small language model (Qwen3-4B) reads the take's style and words and writes one picture prompt, its subject first; Qwen-Image 2512 paints it with Lightning (at 1328 px, kept at 1024), its blocks streamed from RAM where it does not fit whole (*Engine → Artwork*). When the take is named for an instrument (an instrument's probe), its look leads the prompt word for word (what the instrument is, and what it is not), and Omni (the listener's model) looks at the picture by that look: a picture it does not find the instrument in is painted again, three pictures at most, and when none shows it truly the take keeps no picture rather than a false one. About two minutes a picture on a 16 GB card, all of it counted.

**What it cannot** (a disclaimer, said plainly): the painter draws what it knows. An instrument it has never seen by name (the duduk, the morin khuur, the khomus, crystal singing bowls…) comes out as a guess: a wooden pipe, a violin, kitchen bowls. Where Omni found the instrument in none of the three pictures, the picture is marked **≈ a guess**, in the overlay and in the instruments' cheat-sheet. An artwork is the take's mood, not a reference picture of an instrument: to know how an instrument looks, look it up.

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

**How strong a voice adapter.** Heard on a song (19.10.2026: a narrator's adapter, rank 32, on a tragic folk ballad): at 1.0 the voice drowns the music and the take grows unstable, 0.8 still burns it, 0.7 is the ceiling to start from, and 0.4–0.6 carries the voice best. A low strength lets the persona's own pitch go and keeps the voice's tonality: the song takes its colour, not its stamp. Its two halves are not alike: the music half (AR) writes the score with the model, for both staves, and a voice taught on speech mutes the notes when it stands high; keep it at 0.5 at most, and give the sound half (NAR), which carries the timbre, up to 1.0 (heard the same day: AR 0.4 with NAR 1.0 kept the music whole and the voice steady). The sliders draw a voice adapter's road so: an adapter whose name says voice or vocal turns red past 0.5 on the music half and past 1.0 on the sound half.

![The LoRA Trainer: a run's telemetry](guide/studio-train.png)

### Why Your Own Adapters

A bare open model, however strong, still falls short on instruments, styles and voices: it knows what its own training heard, and your sound is rarely among it. Your own adapters close that gap; they are the armour of a professional audio and music warrior. The surest step up: gather your best tracks, the ones you made on SUNO (on a paid plan they are yours) or anywhere else whose rights you hold, and train a **Style** adapter on them, with the exact lyrics beside each. YuE2 then writes in your sound instead of near it: your instruments, your arrangements, your production. Add a **Voice** adapter for the singer you want, and the songs are sung in that colour. A style trained on twenty of your songs lifts the model further than any prompt can push it.

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
- **Trainer**: **Ruach Studio**, the studio's own, on unquantized bf16 weights; it makes the set's latent cache itself; Direct or with a score, on the songs as they are or separated. Ported line by line from Ostris' **AI-Toolkit** (MIT), whose curves it matched epoch by epoch on the same set; AI-Toolkit itself left the studio once all it trained was here.
- **Base weights**: bf16, the whole model (a 24 GB card), or int8 for smaller cards, a little less exact. The base model's file never changes: only the adapter learns.
- **Cards**: how many GPUs the run takes, 1, 2 or 3, among the cards given to training in Engine → GPUs. Each card holds the whole model and learns its own songs; their lessons are averaged at every step (data-parallel), so two cards go through an epoch about twice as fast and three about three times, an odd number as well as an even one. The batch grows with the cards and the learning rate follows it (× √cards): nothing else to set. One matrix cut across cards (tensor parallelism) is not used: YuE2 fits whole on a 24 GB card, and on cards without NVLink cutting every layer costs more than it gives.
- **Epochs**: how many times the run goes through the set, every track once an epoch, one track a step: its steps are the set's tracks times this (2016 tracks for 12 epochs are 24 192 steps). The sound half hears a 60-second window of the track, cut at random each time; the music half reads the song from its start.
- **Save every N epochs**: an adapter at the end of every Nth epoch, each to be heard and compared, all kept, with the optimizer's state beside the newest (a stopped run keeps what it learned). **Stop at the plateau, then the sound half alone** (on by default): two in a hundred of the tracks held out and heard at every epoch; when the sound half stops getting better on them for 3 epochs, the music half stands still at its best epoch and the sound half goes on alone for up to 12 more. A voice came out cleaner so. N goes down to a tenth of an epoch (0.1: ten saves an epoch, named e001.3 and so on), so a big set can be heard while it learns.
- **Rank**: how wide the adapter is; its share of the weights and its size are in the field's tip (what each rank costs and which for what: below).
- **Learning rate**: how big each step of the sound half is (AdamW, the same for the whole run); the music half's is this times **AR speed**. The kinds keep 0.0001; half of it is gentler, for a long run over a big set; higher learns faster and forgets more.
- **LR fade, epochs** and **LR at the end, %**: over the run's last epochs the learning rate goes down in a straight line, to what is left of it at the last step (0 % fades it out): the usual way to end a run, the last saves settling instead of stepping on as hard. It follows the run's length, so a run gone on to more epochs fades at its new end, and going on takes every knob the run was given, the fade among them. 0 epochs, as at first: no fade, the rate the same to the end.
- **AR weight**, **AR anchor (KL)**, **AR speed**: the music half's three knobs, below.
- **Mode**: **Direct** is for songs made in Direct mode; **Full (score)** and **Melody**, for songs made in those modes, also teach the music half to write a score first, transcribed from every song by the engine before the run; half the steps go without the score, so Direct is not forgotten. **Separate vocals and music**: every song is first split into voice and music by the studio's separator (once a set, a few minutes a song), and the music half also learns the voice from the lyrics alone and the music from the tags alone.
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
- **Epochs**: the music half learns a small set by heart fast (its loss falls toward 0): the green epochs in the Telemetry are the ones to hear first, often well before the last.
- **The material's sample rate**: the sound half works at 48 kHz, the music half hears at 24 kHz. A 24 kHz recording teaches the music half everything, but the sound half only a dull top: resampling adds nothing above half the original rate. For a timbre, give it 44.1 or 48 kHz.
- **Memory**: a 24 GB card is the measure. The bf16 weights take 7.5 GB; the adapter, its gradients and its optimizer 16 bytes a weight (rank 32: under 1 GB; rank 128: 3.8 GB; rank 256: 7.5 GB); the rest is the lesson's activations, and the music half reads the whole song: measured 17.7 GB at the peak with rank 32 on songs of minutes, about 11 GB on short voice clips. **Under 16 GB, do not train big ranks**: int8 weights, rank 16 to 32, short clips. Rank 256 on a 24 GB card is at the edge.
- **Every save is a moving average** of the adapter over about its last epoch (EMA), both halves, and the held-out tracks are heard on it: the noise of single steps is smoothed out of what you hear and of what stops the run. The raw weights to go on from are kept beside it (`resume.safetensors.raw`).

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

Every run is a card on the right: *Active*, *All*, *Archived*, *Trash*, searchable. A training run is lit like a playing take. ⋯ on a card: its telemetry, its log, archive it, stop it, or delete it into the trash (you are asked whether its adapters in loras/ go with it). From the Trash it comes back, or goes for good. Under them, the runs by state: **Training**, **Paused**, **Done**, **Stopped**, **Failed**, each with its count, one at a time (a click again shows all). **Pause** on a training run saves what it has learned and waits; **Resume** goes on from that save with the same set, knobs and cards.

## Engine

The Engine opens over the room you are in (☰ › Engine, or Ctrl+Alt+9), its cards by theme behind tabs at the left, in the order you go through them: **Server and log**, **Hardware** (the card, Compute, the GPUs), **Models and LoRAs** (with the VAEs and the LoRAs), **Writer and Artwork**, **Folders and Security**, **Appearance**, **Updates and About**. ↑ and ↓ move between the tabs, and the Engine opens again on the tab you left; Esc, **Close** or a click on the dimmed room around it closes it.

### The Machine

![Engine](guide/studio-engine.png)

- **Server**: what the engine runs: the model, the decoders, the context, the library.
- **Compute**: the **model** copy (BF16 7.2 GB, Q8_0 3.8 GB, Q6_K and Q5_K_M smaller), **GPU memory preset** (*Auto* fits the context and the VAE tiles to the card; *Auto within N GB* does it for that much, the rest of the card left to what else runs on it (on a 16 GB laptop, 14); *Manual* leaves them to you), **Keep models loaded**. **Scan the machine** says what the machine has and what suits it (the backbone, Auto's knobs, the painter), as a new studio does once at its first start. Merges you fetched (**More models**) stand in the list after m-a-p's own, in their line: IRA, IRAE, IRAEv2, IRAEv3; each in its formats, the fullest first. Ruach Studio's own fine-tune, **RS-FW** (seven merges of YuE2-RS-FW, each named by its epoch and strength), comes with the install as RS-FW 2.4x0.75, the studio's default, and starts whenever no model was chosen; the six others are under **More models**.
- **Hardware**: the card's memory now; **Unload model** frees it at once.

### GPUs: Which Card Does What

![Which card does what](guide/engine-gpus.png)

On a machine with several cards, give each its work: the **studio** (synthesis) on one card, **training** on the cards you give it, the lab's **jobs** (the listener, Whisper, stems, remaster, upscale) on theirs. While a run trains on the studio's own card, a synthesis waits, and the page says why. With one card, that is how it works: train, then create. A new card for the studio takes effect after a restart (the button appears when it is needed). The lab's jobs keep to the cards ticked for them, the Artist among them: when those are full, a job waits for one of them (Whisper turns to the processor) and never takes a card not ticked for the lab. An Artist run goes to the card where its painter is kept from the run before, the weights already in RAM.

**Intel Arc (beta).** The studio's synthesis also runs on an Intel Arc card, with its engine built by `./build.sh --sycl` (INSTALL.md, «Intel Arc (beta)»): songs, adapters, Full, Extend. The cards listed here are NVIDIA's; the Arc engine computes on its own card, while training and the covers stay on NVIDIA's.

### Decoders, Adapters, the Writer's Model, the Look

- **VAEs**, **LoRAs**: every file the studio found, with its source and what it does.
- **Models and LoRAs**: what the install brings, part by part (the extra decoders, Whisper, the stems' models, UniverSR, the LoRAs), as its last run found it, and **Check again** to look anew. A part not whole lists what is missing and has its **Fetch**; **Fetch what is missing** takes them all; a download cut short goes on where it stopped. **More models**: another backbone (BF16 beside Q8_0), the style listener, the Artist's painter, the trainer's base, each with its variants and sizes, a variant here said so, each asked first with its size. A new backbone or decoder reaches the engine at its next start (**Restart the engine**); new LoRAs at once. Among them the IRA and IRAE merges: YuE2 with community adapters folded in (Instrumental and Real Audio by Mothersuperior; in IRAE, Epic Trailer by monsterovich, at three strengths).
- **Known by their content**: an adapter or a model file renamed, moved into a folder of your own or with its header rewritten is still here: the studio and its install know it by its SHA-256 and, for a `.safetensors`, by its tensors' SHA-256 (from the models repo's `MANIFEST.tsv`), and fetch nothing again.
- **Artwork**: who paints a take's artwork: by the cards (Qwen-Image 2512 Q6 or Q4 whole where a card holds it, else Q4 streamed from RAM on a smaller card), or one chosen among the Qwen painters this machine has (Qwen-Image 2512 Q4 or Q6 and each fp8 fine-tune, with Lightning; Qwen-Image 2.1 with its licence said).
- **Writer**: the local chat server's address (vLLM, LM Studio, Ollama), *Test connection*.
- **Appearance**: 22 themes (chosen to work in: clear and quiet), corners, the four fonts (text, headings, numbers, the rooms' names). **Take time**: a take's time on its card and wherever it is shown, how long ago (the default) or the exact date and time; a click on a card's time flips it for that take.
- **Fonts**: besides the text, the headings, the numbers and the rooms' names, the *section marks* on the wave (IBM Plex Mono by default) and the *buttons* (the text's by default); each but the text with its size against the text's, −2 to +2 pt.
- **Server log**: the whole log; **About**: every project the studio stands on, linked.
- **Updates**: Ruach Studio's releases on GitHub against this version: how often to look (every day, week, month, never), release candidates too, and when one is out, ask or update by itself when nothing runs (only where the studio is a clone of its repository; elsewhere it says how to update by hand). A new studio, and each update, offers the 💎 sets it does not have yet.
- **Security**: who may open the studio: this computer only, this computer and private networks (the default; a café's or a hotel's Wi-Fi is one too), or this computer and the networks you list (10.0.0.0/24); the engine keeps it in `user/access.json` and answers by it at once. A studio whose user never decided asks at its start, with a short guide and «My decision is a conscious one». A choice that would close it to the machine you ask from is asked again; deleting `user/access.json` goes back to private networks.
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
- The song lasts its bars × that. The check's line under the score says it: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · ≈ 0:22 long · 0 sections`.
- A line of lyrics needs its syllables' time: at an eighth a syllable a bar of 4/4 holds 8 of them, at a sixteenth 16 (a rap: Viktor's Buratino verses run `FFFFFEEEE2zDDDDD`).
- To end the song sooner, take bars out at the end of the score, in both voices; for an outro, add bars there.

### The Voice's Space: Vocal

- Vocal is what is sung: about a syllable a note, a tied note one syllable held, rests where the singer breathes. The check's table says how many notes, how many a minute, the range, and how much of the time the voice sounds.
- Notes and syllables: with more notes than syllables the model stretches syllables over them, or adds some of its own; with fewer it crowds the words. The lyrics meter in Compose counts each line by the time it takes: give the line about that many notes.
- Rap is dense (sixteenths on one or two pitches: the rhythm carries it), a ballad has long notes. Leave a rest at a line's end: there the voice breathes and the instruments answer.
- The voice shift under the score (*Move*) moves Vocal by steps of the scale (a third, a fourth, an octave) where it sits too high or too low for the singer; the chords and Ins stay. Measured 21.10.2026: the model follows Vocal moved an octave down (it sang 9 to 10 semitones lower), and a voice can change its register with it: a female contralto moved down came out a male tenor or baritenor, and a male voice moved up may come out female; the band can go down too. The ▼ ▲ beside a voice adapter (in Full, with a score) do the same once.

### The Instruments' Space: Ins

- Ins is the instruments' own line: the intro's riff, the answers between phrases, a solo, the outro. A melody, not the chords (those stand in Vocal): one line, and YuE2 arranges the band around it.
- **Under the voice Ins mostly rests.** The official covers keep `Z4` under every sung group and play in the intro, between the sections and at the end; Viktor's Full takes do the same (an arpeggio in the intro, `Z4` under the verses, a fill at the turns). A busy Ins under a sung line is a second melody against the voice, and the native scores avoid it.
- The check sums it up as **Ins : Vocal**, the notes of one against the other: above 1.5 the instruments carry most notes, below 0.67 the voice does, between them about even.
- An instrumental: Vocal rests (`Z`) through the song and Ins carries the melody. *Make instrumental* moves a score's vocal melody to Ins (the official recipe) and ticks *Instrumental*. An instrumental score adapter at full strength with words to sing gives a voice without notes: keep it low when there are lyrics (Creator › VAE and LoRAs).

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
| **[** · **]** · **Ctrl+Z** · **Ctrl+Shift+Z** | the DAW | the section before · the section after · undo · redo |
| **Space** · **Home** · **L** | the DAW in sight | play and stop · to the start (the loop's, when it is on) · the loop on and off |
| **M** · **S** · **↑ ↓** | the DAW, the lane picked by a click on its name | mute it · solo it · pick another lane |
| **+** **−** **0** · **Ctrl+wheel** · **Shift+wheel** | the DAW | zoom in, out, the whole song · zoom about the pointer · go along the song |
| **F11** | the studio's tab | the DAW in sight over the whole screen and back; elsewhere the studio full screen |
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
