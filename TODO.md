# Ruach Studio · TODO

Everything planned, wished for and put off, in one place: gathered from Viktor's and Claude's chats of 30.09–09.10.2026, the finish-line notes, the rooms' audits and Viktor's first list of 28.09. Kept up to date as we go, in the open, as the chat itself is.

**Marks:** ✅ done (with the release or patch it came in) · ☐ open · ❓ Viktor's call · 💡 an idea, not decided. Patch numbers point to `heresy/docs/HERESY.md`.

## The road

- ✅ **2.0.0-rc1** (06.10.2026), **rc2** (07.10), **rc3** (09.10; cut again the same day with the logo the name alone everywhere, the GitHub pre-release with it).
- ☐ **RC4 when the community grows.** Viktor 09.10: «Давай договоримся RC4 релизить при росте Issues и PR, и 100+ stars. А пока жжём стабильно и движемся к 2.0.0 release». Until then every fix goes to the live studio and into the CHANGELOG's *2.0.0-rc4 · In the Making*, a pre-release with every RC («К каждым RC генери и предрелиз»).
- ☐ **2.0.0, the release.** Before it, in one go: every screenshot of the guide, the README and the site taken again (curated: nothing private in them), the new strings in the six other languages, every approved 💎 probe made again full length on its own seeds, and the promo video with everything in.
- ☐ **2.1.0**: the Videographer room (below) and what SUNO's interface teaches us (below); the working release once issues and pull requests settle.
- 💡 YuE3 → Ruach Studio 3.

## Creator

- ✅ rc3: Full plan by default, Create ABC Score, the lyrics box as a code editor (numbers, Alt+K marks, Alt+J, mcedit's keys, «[» tags along a song's arc, brackets checked), End at…, Recite the lyrics on a score, lifted frames (Shift+Tab between them), the lyrics over everything, the text's size, LoRA strengths over the pointer.
- ✅ 1268–1269 (live, rc4 in the making): the Alt+K marks come back with their text after a reload; Alt+E lifts the lyrics and puts them back; Shift+Tab from the lifted lyrics into the lifted form; Ctrl+S and Ctrl+Shift+S keep everything, never the browser's Save page; F5 asks only after something was typed; Recite in sixteenths where eighths would leave lines out; the Writer's document in hand a chip of its own; the Score's full screen stays on its row; the LoRA tip at 14 pt.
- ✅ 1276: **F4 / Ctrl+H**: find and replace in the lyrics (the style and the Writer's boxes too), with and without case (Aa, Alt+C).
- ✅ 1277: **the lyrics as plain text**: export and import a `.txt`, the file named by the Title (beside ⤢; not UTF-8 refused out loud).
- ✅ 1278: **«[» chained**: a second and a third tag on one line after a valid tag, a space put between them by itself; only the tags that are not sections (who sings, Break, Silence).
- ✅ 1279: **paragraph spacing** in tips, the guide and the cheat-sheets, studio-wide (the lyrics' box untouched). ❓ The Style's box: a textarea draws no air between paragraphs; where else should the Style's paragraphs breathe?
- ☐ **Versions of the lyrics and the style by the base Title** (design first). Viktor: «Такого точно ни у кого нет».
- ✅ 1275: **a sound when a run ends** (Viktor's first list, 28.09: «звуковое оповещение при окончании генерации»): 🔔 in the player, two notes up, two down when one fails.
- ✅ 1280: **the take's menu over the player's wave** (a right click on the wave, its picture or its title).
- 💡 Stems straight from the score: the Vocal and the Ins voices of a Full plan rendered apart (Viktor's first list).
- 💡 A grid render over adapter weights (style × score × sound strengths), on the batch we already have.
- 💡 A negative prompt, if the engine can carry one.
- ❓ The Creator's MIDI import and a chord track: the lab leaves a chord track out of the Ins line (an instrument took the tune in 2 of 3 takes with it); the same rule in the page?

## Writer

- ✅ rc3: OpenRouter's models with their prices; the notebook's export and import.
- ✅ 1268: the documents list as wide as its edge is dragged.
- ☐ A local chat model started by the studio itself (Ollama on a port of its own, under the guard).

## Refiner and the DAW

- ☐ **The DAW bundle**: Plenio's score editor (jplenio/Plenio-Music-Production-System, Apache-2.0: piano roll, chord lane, lyrics over notes, MIDI keyboard), its Vue front end built apart and mounted in the Refiner, with a bridge ABC ↔ its song sheet. Viktor: «аж слюнки потекли».
- ☐ REAPER: the lyrics as MIDI lyric events; the sections from the score where they are not timed; a chord track as chord symbols.
- ☐ Bitwig: our DAWproject opened by it, the crash test.
- ☐ The transcriber's first bar: in 5 of 16 takes the score written from the sound began about a bar early; a shift of one bar in the datasheet.
- ☐ Viktor's own test pass of the room.
- 💡 Seed-VC (singing voice conversion) and AudioSR-class restoration as Refiner steps.

## Artist

- ✅ rc3 early preview: a prompt of one's own in 1:1, 16:9 and 9:16 from one seed, variations, Krea 2 Muse Q4 and Q8, the live preview step by step, runs and a gallery with stars, Set as cover.
- ✅ 1270: Draw is Stop while a run waits or draws. 1271: three columns (the prompt | the stage, where a run develops and the picked picture stands with its run's data | the library), the edges dragged.
- ☐ **The most of InvokeAI** (Viktor 09.10: «Для Artist бери максимум фич из InvokeAI»; its code is Apache-2.0 and already runs Krea 2): a reference picture (image to image), repaint and outpaint on a canvas with a mask, regional prompts, a style reference, several LoRAs at once, boards, compare, the upscale (SeedVR), lettering on a cover, the versions of a take's picture.
- ☐ **Models**: Qwen/Qwen-Image-2.1 as the base (Viktor 09.10), a good finetune he picks on Civitai; the Krea 2 Muse finetunes we tried; a portrait adapter he trains himself.
- ☐ The trash in the room (a run comes back today only through its folder or the API).

## Videographer · 2.1.0

- ☐ **A room between the Artist and the Librarian, Ctrl+Alt+6**: a music video for the song. The pipeline from Maestro (Blizaine/Maestro), with an AI helper prompting its scenes; the key frames painted by our Artist. Viktor 09.10: «И это в 2.1.0 как недостижимый многими желанный ахуй… нужны и мощности (они у меня есть), и время».

## Librarian

- ✅ rc1–rc3: workspaces and sections, locks and freezing, pins, filters in a window (and, or, nor), the menu on every checked take, dragging takes, 💎 workspaces from Hugging Face, artwork with the old one kept.
- ❓ 1268 took the peek on hover away (it showed a take's prompt and lyrics, what Viktor had taken out of the player's tip); the sheet on click stays. Back on his word.

## LoRA Trainer

- ✅ Our own trainer, a voice's kind by pitch on the raw folder, runs, telemetry, epochs worth hearing first; the duduk and shofar adapters.
- ☐ **Diction adapters** from the audiobook archive: one voice at rank 16, cohorts at rank 64 (the music half learns diction at 24 kHz; the sound half wants a source above it). Real readers' voices and Viktor's own stay private.
- ☐ The material checked in the raw pane for every user: repeats (a loop of the same minutes), what CLAP and the listener hear in each stretch, a VAE round trip (if the decoder cannot carry the sound, no LoRA will).
- ☐ The lyrics adapter (`heresy/docs/LYRICS-ADAPTER-PLAN.md`).
- ☐ A real shofar laid in: seven prompts gave trumpets and horns, SUNO cannot either.

## Engine and the page

- ✅ rc3: Updates from GitHub's releases; Folders' code in the lab (where the user's work lives, moved with a checked copy); the cards live as btop draws them. 1266: the logo the name alone, the bar of one height, the favicon the name's first letter in the page's language. 1272: the unfolded server log 180 px narrower.
- ✅ 1283: **Engine → Folders**: the card to choose and move where the generations, the trash, the Artist's and the Writer's work live (Windows paths through WSL understood; planned, then a second yes; the old copy kept).
- ☐ Fewer requests from the page while a song renders (the browser's six connections a host).
- ✅ 1274: **the page offline**: abcjs (6.7.1) in the page, the ten font families (Raleway, Roboto and Lato joined at Viktor's word; Latin, Cyrillic, Greek) served by the lab with a year's cache; no CDN left.
- ☐ The new strings (the Artist, Stop, the stage, the editor's keys) in Russian, Ukrainian, Belarusian, Greek, Spanish and Italian: one pass before 2.0.0.
- ✅ 1273: the logo's words and the favicon's letter ready for the languages planned next: French (ROUAH STUDIO, a proposal), Portuguese (RUACH ESTÚDIO), German, Japanese (ルアハ スタジオ, ル), Chinese (鲁阿赫 工作室, 鲁). ☐ The languages themselves (Chinese first, then French, Portuguese, German, Japanese; right to left only when the page can).
- ☐ A take that does not play on late in the long page test (buffered at readyState 1), and the WAV fallback that does not resume a take asked to play.
- ☐ The never-break-lines pass over the page's strings and the docs: a paragraph is one line, the box wraps it (code comments stay as they are).

## Install and platforms

- ✅ rc3: Pinokio on Linux (Install, Start, Open, More models, Update, Reset; its own CUDA 12.8 where the machine has none).
- ☐ Viktor's own Pinokio install at home with rc3; then the registry: an Issue at pinokiocomputer/pinokio (Featured asked; Community otherwise).
- ☐ Pinokio's own CUDA path tested on a machine without a toolkit.
- ☐ **Windows**: the Pinokio launcher through WSL2 (Windows paths with backslashes and drive letters understood).
- ☐ **Desktop**: a PWA manifest first, then Electron (Linux first: the services checked and started, a tray, asked on exit whether to stop them; Ctrl+digit for the rooms), an AppImage. No Flatpak (Viktor: «растрата дискового места и интернет трафика»).
- ☐ From the audit: build.sh's page guard and folders with common names; the in-page updater under Pinokio. ✅ 1285: the extras are made by fetch-heresy.sh itself (convert-extras.py), no convert-models.sh on a fresh install.

## Models, Hugging Face, data

- ✅ The Models, LoRAs and Starter Sets repos and the 💎 bucket public on Hugging Face.
- ✅ 1289: Engine → Models and LoRAs: what the install brings, here or not, fetched again from the studio (a part at a time or all), and the extras each asked with its size.
- ✅ 1290: the converted models in a repo of their own, [goldhub/Ruach_Studio_Models_v2](https://huggingface.co/goldhub/Ruach_Studio_Models_v2): the legacy and blend decoders and the 16 sliders, production only, byte for byte; the install fetches no checkpoints.
- ☐ Every approved 💎 probe made again full length on its own seeds before 2.0.0.
- ☐ Reading examples: Jude in Greek, Hebrew, Russian and Ukrainian, and English from Young's Literal Translation (public domain).
- ☐ CLAP beside Omni for judging probes.
- ❓ Pictures for the instruments the painter cannot draw (candidates from Wikimedia Commons, downloaded only on his word).
- ❓ Backups of the generations (restic or rsync, nightly).

## Docs and the site

- ✅ README, CHANGELOG, INSTALL, the guide in seven languages, the visiting card in seven languages with its logo and icon in each, six rooms counted.
- ☐ The screenshots of the guide, the README and the site for 2.0.0, in one go.
- ❓ The site's `/favicon.ico` comes from the server's shared icons (nginx): a location of the site's own, on Viktor's word.
- ☐ Posts (Reddit, Hugging Face, X) when Viktor says.

## Upstreams and the community

- ☐ Watch IronWolve/yue2-kit (issue #2: a licence for the Kit), ServeurpersoCom/yue2.cpp (our engine patches offered upstream), ostris/ai-toolkit, multimodal-art-projection/YuE, jplenio/Plenio; a weekly look on Viktor's yes.
- ☐ Issues and pull requests on igrbible/Ruach_Studio: read, answered, merged.
- ☐ abcjs's releases: `heresy/tools/check-vendored.sh` says when a newer one is out (`--abcjs` takes it, `--fonts` takes the fonts again).

## From SUNO v6

Viktor's screenshots of SUNO's newest interface, 09.10.2026 (its Studio, a DAW, at 35 dollars a month): «Наша студия уже круче, чем СУНО». What we take, the quick ones first; ours stand on the score, which knows every section and every bar.

**Quick, one patch each:**

- ✅ 1282: **sections on the wave**: the take's sections from its score as labelled lines over the player's waveform; a click by one goes to its start. ☐ The same over the take's own waveform in the room.
- ☐ **Fade in**, beside End at… (which fades the last seconds): the first seconds faded in.
- ☐ **Crop** and **Remove a section** on the score's bar lines, each cut healed by a short crossfade (SUNO: Crop, Remove Section, Heal Edits).
- ☐ **Adjust speed** without changing the pitch (a time stretch), the new tempo written into the score.
- ☐ **A loop from the song**: 1, 2, 4 or 8 bars cut on the score's bar lines, seamless, as a WAV (SUNO's Sounds: loops and one-shots with BPM and key).
- ✅ 1281: **vocal gender** at a click (male, female): its words put into the Style (♂ ♀ in its head).
- ☐ **Tighten these lyrics** in the lyrics box, by the Writer's model; **style suggestions** as chips under the Style, made anew on demand (SUNO's ✦ and ↻ under its Styles).
- ☐ **A/B in one window**: the original and each version of a take switched while the music plays on at the same second, the disliked hidden (SUNO's Remaster: Original | #4 | #1).

**2.1.0, weighty:**

- ☐ **Exclude styles**: what the song must not have (SUNO's «drones, beats, drums…») as the guidance's negative condition in the engine (yue2.cpp's CFG takes its unconditional pass from an empty style today).
- ☐ **The Song Editor**: the take on a timeline of its score's sections; replace a section (its words or its music), extend, remove; saved as a new take.
- ☐ **Simple and Advanced** in the Creator: three knobs for a newcomer (SUNO's Weirdness, Style Influence, Variety) mapped onto our sampling, the whole form behind Advanced.
- ☐ **Speech** and **Sounds** beside Songs: a script with its tone and a background on or off (our Speech profile behind it); short samples, one-shots and loops with BPM and key.
- ☐ **More stems**: up to twelve instruments, one instrument against the rest, MIDI from each stem, matched to the project's tempo (SUNO's Extract Stems and MIDI).
- ☐ **The studio's assistant**: one line to ask the studio in words («a gritty delay on this track», «an 8-bar drum loop here», «remaster it brighter»), answered by the Writer's model calling our own API (the MCP server has the tools already).
- ☐ **Mashup**, **Song radio**, **Use as inspiration** (an audio prompt), **Personalize** (my taste, from my likes).
- ☐ **The DAW timeline** with Plenio: takes and stems as clips, split, duplicate, heal edits, MIDI from a clip.

## The far shelf

- 💡 ZNAC, an audio archiver of Viktor's own (a separate project; only on his word).
