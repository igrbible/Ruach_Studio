# Ruach Studio · TODO

Everything planned, wished for and put off, in one place: gathered from Viktor's and Claude's chats of 30.09–09.10.2026, the finish-line notes, the rooms' audits and Viktor's first list of 28.09. Kept up to date as we go, in the open, as the chat itself is.

**Marks:** ✅ done (with the release or patch it came in) · ☐ open · ❓ Viktor's call · 💡 an idea, not decided. Patch numbers point to `heresy/docs/HERESY.md`.

## The road

- ✅ **2.0.0-rc1** (06.10.2026), **rc2** (07.10), **rc3** (09.10; cut again the same day with the logo the name alone everywhere, the GitHub pre-release with it).
- ✅ **2.0.0-rc4**, cut as a whole on Viktor's word of 10.10.2026 («собирай RC4 как unified version с багфиксом по факту воспроизведения поведения развёртывания Студии под Pinokio»): the models converted once in goldhub/Ruach_Studio_Models_v2, the install made whole, the Artist as it stands; tried from a clean clone and by a whole fresh install. The community's gate («при росте Issues и PR, и 100+ stars») moves to rc5.
- ✅ 2.0.0-rc6 cut and published 12.10.2026 (tag v2.0.0-rc6, the pre-release with its tarball, the card on rc6).
- ✅ 2.0.0-rc7 cut and published 13.10.2026 (tag v2.0.0-rc7, release commit 34e0b23, the pre-release with its tarball, the card on rc7).
- ✅ 2.0.0-pre cut and published 18.10.2026, tagged v2.0.0-rc9 (Viktor: «Разрешаю срез RC9 и пуш по всем репо»; release commit e2c9658, the pre-release with its tarball, the card on 2.0.0-pre): the Refiner as a canvas with pipelines, the DAW as a preview, the 2.0.0 shots, the release locked against a private plugin and unread pictures.
- ✅ 2.0.0-rc8 cut and published in the night of 14–15.10.2026 (Viktor: «смело собирай RC8»; tag v2.0.0-rc8, release commit c1d62e6, the pre-release with its tarball, the card on rc8): every weight from one repo, the release locked against private names.
- ✅ 1398: the spectrogram out of the section card's tip, only in the full scope (Viktor 12.10.2026).
- ☐ **2.0.0, the release** (Viktor 25.10.2026, the 2.0.0 briefing: «Заканчивайте эти мелкие долги и начинаем выкат»): the screenshots of the guide, the README and the site taken again (nothing private in them), the strings in every language, the DAW and the piano roll as a beta, the First Wave's merges public with the default his ear picks. What would hold it back goes to 2.0.x and 2.1.0 («То, что держит 2.0.0, уходит в 2.0.x и 2.1.0»); the promo video after it, «когда я буду дома, без стресса».
- ☐ **2.0.x** (out of 2.0.0 by the briefing of 25.10.2026): REAPER's lyrics as MIDI events, Bitwig's crash test, the transcriber's first bar, Viktor's fresh Pinokio install and the registry, Windows through WSL2.
- ☐ **2.1.0**: the Videographer room (below) and what SUNO's interface teaches us (below); the working release once issues and pull requests settle.
- ❓→2.1.0 (Viktor 12.10.2026: the DAW phase of the Refiner «нужно досконально обсудить и обмозговать», with SeedVR). The closing pass of 2.0.0 together, by RC6. Proposed for his choice: Extend from a position (2.0.0), Replace a section and an instrumental layer on the take's score (2.1.0).
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
- ✅ 1768: **the decode ladder as a Creator option** (Viktor 24.10.2026: «Делай это опцией Sampling блоке Творца… А этот в тултипе подсказки пометь как экспериментальный и отличающийся выхлопом»): «Sound decode» in Sampling › Sound and output, *Whole song · standard* by default, *Ladder · experimental* (pieces of about 20 s hearing 2 s past their edges, his «отлично» of the probes); the standard decode everywhere else in the Studio. ☐ Still to come: the pieces solved while the music half sings on (a second KV slot), the VAE piece by piece, streaming.
- ❓ **Sing a window anew** (1757, live since 23.10.2026): sung end to end on a take of the 2.0 probes; outside the window the codes are the take's own and the sound is decoded again (correlation 0.93 and 0.87). Viktor 24.10: the three A/B files noisy as the take itself is; in «as sung» and «spliced» drums come in about 58 s into the song, inside the window, where the original has none; «нужно ещё тестить». No verdict on splicing the window into the original sound yet.

## Writer

- ✅ rc3: OpenRouter's models with their prices; the notebook's export and import.
- ✅ 1268: the documents list as wide as its edge is dragged.
- ☐ A local chat model started by the studio itself (Ollama on a port of its own, under the guard).

## Refiner and the DAW

- ✅ **The DAW bundle**: ours instead (Viktor 25.10.2026, the 2.0.0 briefing: «Наш DAW и Piano Roll в разы лучше, чем у Plenio. Так что всё это идёт уже в 2.0.0, но как beta»): the DAW and the piano roll ship in 2.0.0 with a «beta» mark (1795). Plenio's score editor (jplenio/Plenio-Music-Production-System, Apache-2.0) stays a source of ideas.
- ☐ (2.0.x) The DAW over the whole window after its set came with the drawer shut: the console measured 0 px then (--mx-dock-h), so the lanes keep their height and the console stands under the window's edge until it is painted again (its button twice does); setFull asking it to paint did not change it (1797, 25.10.2026).
- ☐ (2.0.x) REAPER: the lyrics as MIDI lyric events; the sections from the score where they are not timed; a chord track as chord symbols.
- ☐ (2.0.x) Bitwig: our DAWproject opened by it, the crash test.
- ☐ (2.0.x) The transcriber's first bar: in 5 of 16 takes the score written from the sound began about a bar early; a shift of one bar in the datasheet.
- ☐ Viktor's own test pass of the room.
- 💡 Seed-VC (singing voice conversion) and AudioSR-class restoration as Refiner steps.

## Artist

- ✅ Qwen-Image 2.1's fine-tunes as brushes, its Turbo, Outpaint… (1442–1443).
- 💡 **Qwen-Image-3** announced (https://qwen.ai/blog?id=qwen-image-3.0), its weights not open yet: a brush when they are.
- ☐ The Artist's adapters their authors do not let be shared (Outpaint v2, Turbo 4step, FinalCut, and more): a fetch from Civitai by their SHA-256 in Engine → Models and LoRAs.

- ✅ rc3 early preview: a prompt of one's own in 1:1, 16:9 and 9:16 from one seed, variations, Krea 2 Muse Q4 and Q8, the live preview step by step, runs and a gallery with stars, Set as cover.
- ✅ 1270: Draw is Stop while a run waits or draws. 1271: three columns (the prompt | the stage, where a run develops and the picked picture stands with its run's data | the library), the edges dragged.
- ✅ 1389: **the Artist's mega-guide** in English, docs/ARTIST.md (Viktor 12.10.2026: «Художника закрыли на 95%, пока что только на английском как основу»). ✅ 1424 (13.10.2026): the other eleven languages, on his word («Доводи его до ума и на все языки»).
- ✅ 1390: the Writer's «Max tokens» (32K), an empty answer or a failure said over the page, the answer scrolled to the top. ✅ 1391: the lyrics' language for Whisper from the sung lines. ☐ Whisper on the vocal stem for the sections and the timing (the mix is the limit: 60 % of the lines heard on «01 v4.0.11», 85 % on its -ds take).
- ✅ 1316: LoRA adapters in the Artist (a library by folders, pictures, Civitai by hash, strengths, trigger words). ✅ 1365: their strength by steps (keyframes of a multiplier, ⏱ beside each, as Viktor's ComfyUI hooks).
- ✅ 1353 (Viktor's list of 11.10.2026): eight adapters in the list, four in the run; their trigger words into the prompt by themselves; the LoRA library's menu and an Info window (what an adapter is made for, read from its file; another model's named on its card); adapters into the art's trash and back; a PEFT file without a prefix loads (the bear's «dead» OilPaint was ours to mend); the picture's tip after a moment; the Upscale row centred. ✅ 1354: a run's formats on the lab's cards at once (two cards: Qwen fp8 6.4 min against 8.6). ✅ 1355: the upscalers' notes (what each is for, measured; an i and a window), an upscale in passes as Viktor's ComfyUI stack (his chain one click away), Upscayl looked into (ncnn on Vulkan: ESRGAN-family only; its ideas taken, not its binary); 4x_Nomos8k_atd_jpg mended (float32). ✅ 1364: from Upscayl, TTA (eight orientations averaged) and the pictures picked upscaled in one run; ☐ the painter's second pass over the upscaled picture (his workflow's 2× latent pass: noise 0.6, from step 20 of 60) as a pass of the chain. ✅ 1360: From Civitai… in the LoRA library, for the adapters only Civitai may give (the user's own key, kept local; agreed 11.10: «ПО CivitAI согласен»).
- ☐ **The most of InvokeAI** (Viktor 09.10: «Для Artist бери максимум фич из InvokeAI»; its code is Apache-2.0 and already runs Krea 2): a reference picture (image to image), repaint and outpaint on a canvas with a mask, regional prompts, a style reference, several LoRAs at once, boards, compare, the upscale (SeedVR), lettering on a cover, the versions of a take's picture. ✅ 1387: regional prompts (Regions, three at most). ✅ 1388: a style reference (Qwen-Image 2.1). ✅ 1394–1396: lettering on a cover. ☐ The rest: boards, the upscale by SeedVR (2.1.0), the versions of a take's picture.
- ✅ 1297: a painter no card can hold refused at once with the numbers; why an artwork waits said; the painters' rooms measured again (Krea 2 Muse Q4 12.6 GB, SDXL 14.2, Q8 17.4).
- ✅ 1305: **a reference picture** (image to image) for Krea 2 Muse: dropped, pasted, chosen, or the stage's «As reference», with how much it may change. ✅ 1306: **a mask** on it (inpaint), painted over the page. ✅ 1307: **painting around it** (outpaint), no seam. ✅ 1308: **two pictures compared** under a divider or side by side. ✅ 1316: several LoRAs at once. ✅ 1318: Qwen-Image 2512 and 2.1 as painters. ✅ 1320: the mask's grow, edge, soft and grain. ✅ 1321: pictures picked and put aside. ✅ 1322: **upscale** (spandrel, any upscaler in artwork/upscalers/). ✅ 1346: **the canvas, as InvokeAI's**: each shape's frame with the picture placed in it by hand or by numbers, the mask painted over it, the bare part painted around it. ✅ 1341: an adapter muted, kept in the list. ✅ 1342: a painter streamed from RAM when it does not fit the card (the fp8 Qwen; Krea 2 and the GGUF painters next, for 16 GB cards). Next of InvokeAI's: a second pass over the upscaled picture (hires fix, by tiles), regional prompts on the canvas, a style reference; one upscaler fetched with the painters (Real-ESRGAN x4plus, BSD-3-Clause) for those who have none.
- ✅ 1318: Qwen-Image 2512 (GGUF Q4/Q6, fp8 fine-tunes, Lightning) and 2.1 (its licence said) as the Artist's painters. ✅ 1323: their files fetched by heresy/fetch-heresy.sh --qwen and the Models card, sizes asked, 2.1's licence said. ✅ 1370: a painter that stays between runs (in RAM, its card free; let go after ten minutes idle, or by the Bar's Unload).
- ☐ **Models**: Qwen/Qwen-Image-2.1 as the base (Viktor 09.10; downloaded whole to the Forge 10.10, 33.1 GB at d26bb61, its pipeline in diffusers 0.41.0), a good finetune he picks on Civitai; the Krea 2 Muse finetunes we tried; a portrait adapter he trains himself. Three families by the card: SDXL for old cards, Krea 2 Muse the workhorse, Qwen Image 2.1. First look 10.10 on GPU2 (heresy/MISC/claude-artist/try_qi21.py, the fresh rc4 tree's .venv-art with diffusers 0.41.0, model CPU offload): a 1328² picture from words in 120 s at 30 steps, 16.4 GB at its peak, painterly and fine; an edit by an instruction on a cover («a snowy winter night outside…») in 122 s, 19.1 GB, the figures kept exactly, the scene turned (it made the poster a window). ✅ 1386: on a 16 GB card it streams from RAM (no GGUF needed: 4.1 GB at the peak from words, 7.9 editing). ✅ 1388: «Edit by words» beside the reference (Use it); the Forge's own .venv-art to diffusers 0.41. SDXL out since 1405 and Krea 2 Muse since 1428: Qwen-Image paints every picture.
- ✅ 1310: the trash in the room (a Trash look with Restore).

## Videographer · 2.1.0

- ☐ **A room between the Artist and the Librarian, Ctrl+Alt+6**: a music video for the song. The pipeline from Maestro (Blizaine/Maestro), with an AI helper prompting its scenes; the key frames painted by our Artist. Viktor 09.10: «И это в 2.1.0 как недостижимый многими желанный ахуй… нужны и мощности (они у меня есть), и время».

## Librarian

- ✅ rc1–rc3: workspaces and sections, locks and freezing, pins, filters in a window (and, or, nor), the menu on every checked take, dragging takes, 💎 workspaces from Hugging Face, artwork with the old one kept.
- ❓ 1268 took the peek on hover away (it showed a take's prompt and lyrics, what Viktor had taken out of the player's tip); the sheet on click stays. Back on his word.
- 💡 **Names of deleted takes kept in the workspaces' lists** (measured 24.10.2026): user/collection.json keeps 820 names whose takes are gone, deleted and the trash emptied (394 of them in the 💎 sets, the rest across his own workspaces). Nothing shows them: /catalog lists only the takes that exist, and every published 💎 set is whole on disk. If wanted, a lab patch drops a take's name from its workspaces when the trash is emptied, with one sweep of the old ones; Viktor's word, it is his own state.

## LoRA mixing

- ✅ 1447: the per-layer delta measured by the lab (/lab/lora/profile: ‖B·A‖ by layer and module, attention against MLP, how far an adapter moves a layer at 1.0, the overlap of two and the cosine of their deltas); the adapters that touch the same layers share a budget a half (Viktor's «1+2 в общую суммарную силу, либо 3 и 4 — отдельно»): Off, Share (Variant A: the sum capped at the red line, in proportion), In order (Variant B: the order dragged); the caps the red lines, music 2.25, sound 1.5. The six library adapters all reach the 28 layers (overlap 0.7–0.97), their deltas nearly at right angles (cosine 0.00–0.05).
- ✅ 1447: a LoRA's strength over the song as a wave (Flat, Arch, Draw; Viktor: «динамичную волну, именно ту, что ты воплотил в слайдерах стилей»), the engine applying the adapters at run time with the graph (lora-rt.h), not merged into the weights at load: token for token the same as merged.
- ✅ 1449: the voice and genre sliders out of the studio, the install and Models v2 (Viktor: «Нахер убирай это слайдерное говно из нашей Студии, но сами адаптации волнового инджеста забери»), measured first: no pull toward their genre.
- ✅ The sliders' code stays in the engine (Viktor 15.10.2026: «не чини то, что пока что не сломано. Легче воскресить, чем кремировать»); the LoRA wave lives on its slider_curve_at. ✅ 1451: the page's words that still named them.
- 💡 Rise and Fall beside Arch in the wave's editor: the request takes them already.

## LoRA Trainer

- ✅ Our own trainer, a voice's kind by pitch on the raw folder, runs, telemetry, epochs worth hearing first; the duduk and shofar adapters.
- ✅ 1298: a run's log as wide as its lines, beside the server log. 1299: the two curves one under the other at a click.
- ❓ **Closed for now, not to the end** (Viktor 10.10: «не на 100%, но Тренера закрываем также на данный момент. Но нужно будет все режимы и типы адаптеров перепроверить»). ☐ Every mode checked again (Direct, Full, Melody, separated vocals; the studio's trainer and AI-Toolkit) and every kind (style, voice, language, artist), each to a heard adapter.
- ✅ 1300: **a finished run goes on to more epochs** from its ⋯ menu (the studio's own trainer; tried 40 → 60 steps on GPU2); the rank's line is its tip's first line; **the guide explains every field**, and AR weight, anchor and speed as measured (the anchor counts as a share of the weight, the speed is the music half's throttle). AI-Toolkit out of the studio since 1422, so its runs' «go on» is not needed.
- ☐ **Diction adapters** from the audiobook archive: one voice at rank 16, cohorts at rank 64 (the music half learns diction at 24 kHz; the sound half wants a source above it). Real readers' voices and Viktor's own stay private.
- ☐ The material checked in the raw pane for every user: repeats (a loop of the same minutes), what CLAP and the listener hear in each stretch, a VAE round trip (if the decoder cannot carry the sound, no LoRA will).
- ☐ The lyrics adapter (`heresy/docs/LYRICS-ADAPTER-PLAN.md`).
- ☐ A real shofar laid in: seven prompts gave trumpets and horns, SUNO cannot either.

## Engine and the page

- ✅ 1450: the Engine as an overlay, its blocks in tabs at the left by theme, in the order one goes through them, centred (Viktor 14.10.2026).

- ✅ rc3: Updates from GitHub's releases; Folders' code in the lab (where the user's work lives, moved with a checked copy); the cards live as btop draws them. 1266: the logo the name alone, the bar of one height, the favicon the name's first letter in the page's language. 1272: the unfolded server log 180 px narrower.
- ✅ 1283: **Engine → Folders**: the card to choose and move where the generations, the trash, the Artist's and the Writer's work live (Windows paths through WSL understood; planned, then a second yes; the old copy kept).
- ✅ 1294: **a VRAM limit for each card** (Engine → GPUs); Compute's Auto fits the studio card's limit. 1295: the veil's words over its bar, the versions under it.
- ✅ 1297: **one card for everything**: the idle engine lets its models go when another job needs the card.
- ✅ 1304: **the first start scans the machine** and offers the backbone, Auto's knobs and the painter in one window; Auto's tiers as measured on GPU2 (the backbones, contexts and VAE tiles), down to 6 GB; Pinokio takes Q8_0 from 7 GB. ✅ 1359: its window in the six other languages (its words were there since 1339; the dialog's lines now kept in every language).
- ✅ 1301: **the server log's dock on either side**, an arrow on its inner edge, the side kept for each room.
- ✅ 1363: fewer requests while a song renders (props and the artwork list wait, the hardware every 15 s; measured: every poll already waits for its answer, the most at once is a take's opening, whose panels now ask at low priority).
- ✅ 1374: **the wave's scope**: the take's whole spectrogram over the full player when the pointer rests on the wave, with the sections, the centroid, the RMS and the moment's own spectrum under the pointer (Viktor 11.10.2026: «Максимум анализа по волне»).
- ✅ 1378: **the Artist's run on its kept painter's card, the lab's jobs on their own cards**: the kept painter's own memory counted as the run's; no lab job on a card not ticked for the lab (Viktor 11.10.2026: «повторный ран выбрал другую видеокарту… Это неправильно»).
- ✅ 1379: **five more languages**: French, Portuguese (Brazil), German, Japanese and Chinese, the page whole (the guide still English in them).
- ✅ 1381: the guide (GUIDE.fr/pt/de/ja/zh.md) in the five new languages.
- ✅ 1382: README's little story in the five new languages.
- ✅ 1383: the site's page (ruachstudio.igr.bible) in the five new languages, on Orpheus since 12.10.2026 (Viktor: «Выкладывай на Орфей»). ✅ rc6: the five's «Read the guide» on their own guides, the card's lines on rc6, twelve languages.
- ✅ 1384: **the Artist's second pass**, as Viktor's ComfyUI workflow: a picture painted over at ×1.5 or ×2 by its own run (Krea 2, Qwen-Image 2512). ✅ 1385: his extra latent noise (InjectLatentNoise+) under a reference and in the second pass (0.6 there, as his).
- ✅ 1380: The Artist stage's buttons keep the language they were made in when the page's language changes (Spanish left after a switch to Russian; a reload mends it): found by the 1379 probe.
- ✅ 1274: **the page offline**: abcjs (6.7.1) in the page, the ten font families (Raleway, Roboto and Lato joined at Viktor's word; Latin, Cyrillic, Greek) served by the lab with a year's cache; no CDN left.
- ✅ 1339: the new strings (the Artist, Stop, the stage, the editor's keys) in Russian, Ukrainian, Belarusian, Greek, Spanish and Italian: the page in all six, wall to wall; each patch since brings its own.
- ✅ 1273: the logo's words and the favicon's letter ready for the languages planned next: French (ROUAH STUDIO, a proposal), Portuguese (RUACH ESTÚDIO), German, Japanese (ルアハ スタジオ, ル), Chinese (鲁阿赫 工作室, 鲁). ✅ 1379: the five languages themselves; right to left only when the page can.
- ✅ 1379b: A choice list of words, not data, in the page's language: the updates question's Every week, Every day, Every month, Never stay English in every language (heresy-dialog.js marks a choice's label translate="no", for names and files); found 11.10 while probing 1374.
- ✅ 1361: the WAV fallback goes on with a take asked to play (Chrome had paused it silently before its error was heard); a take whose sound is all here and that does not start is loaded again in place, then said (the long test's readyState 1, met where it shows).
- ✅ 1349: the never-break-lines pass over the page's strings and the docs: no newline inside a sentence in the page's strings, no hard-wrapped paragraph in the docs, and the last three boxes measured in ch wrap at their column (code comments stay as they are).
- ✅ **EAGLE3, closed: dropped** (Viktor 24.10.2026: «Отбой по EAGLE3. Нет смысла в этом.»). Measured the night before: a draft of K 2 gave 1.77 codes a round, the same with the studio's sampler, and the draft head refuses CFG. The draft and engival's CPU build stay in heresy/MISC/claude-eagle3 as a record only.

## Install and platforms

- ✅ rc3: Pinokio on Linux (Install, Start, Open, More models, Update, Reset; its own CUDA 12.8 where the machine has none).
- ☐ (2.0.x) Viktor's own Pinokio install at home, fresh, with rc4 (10.10: the rc3 one removed to imitate a new user); then the registry: an Issue at pinokiocomputer/pinokio (Featured asked; Community otherwise).
- ☐ Pinokio's own CUDA path tested on a machine without a toolkit.
- ✅ 1352: **Pinokio's environment page** answered 500 on `/env` (the laptop, 10.10.2026): with our `pinokio/` folder Pinokio wrote its `ENVIRONMENT` there and looked for it in the root. The launcher's scripts are in `launcher/` now (Viktor 11.10: «Добро, переименовывай pinokio/ → launcher/»); an install of rc5 or before is led through its first update by the menu (Finish the update).
- ☐ (2.0.x) **Windows**: the Pinokio launcher through WSL2 (Windows paths with backslashes and drive letters understood).
- ☐ **Desktop**: a PWA manifest first, then Electron (Linux first: the services checked and started, a tray, asked on exit whether to stop them; Ctrl+digit for the rooms), an AppImage. No Flatpak (Viktor: «растрата дискового места и интернет трафика»).
- ✅ 1362: from the audit: build.sh's page guard (the install's own path, not its folder's name: studio and music build) and the in-page updater under Pinokio (it sends to Pinokio's Update). ✅ 1285: the extras are made by fetch-heresy.sh itself (convert-extras.py), no convert-models.sh on a fresh install.

## Models, Hugging Face, data

- ✅ goldhub/Ruach_Studio_Models_v2 rebuilt whole as the studio's own disk (1440), files known by their content (1441); v1 deleted by Viktor 15.10.2026 (Hugging Face would not make it private); nothing read it since rc8.
- ✅ Every weight from v2 at one pin (1445): the Trainer's base in it, the listener as the studio reads it; from their authors still the stems' models (audio-separator), the Kit's library of adapters, Qwen2.5-Omni-7B whole.
- ✅ 1446: the Kit's library's five licensed adapters in v2 (Instrumental, sv-billie, DreamPop v2, J-pop, Real audio v4 and v9) at the Kit's pins, each checked against its author's SHA-256; `tools/download-loras.sh` takes them from v2.
- ❓ Death metal, Industrial rock, Epic trailer (Steps from Hell) carry no licence: asked on Hugging Face 15.10.2026 ([1](https://huggingface.co/pduncan/YuE2_Deathmetalv1_lora/discussions/1), [2](https://huggingface.co/monsterovich/yue2-industrial-rock-lora/discussions/4), [3](https://huggingface.co/monsterovich/yue2-steps-from-hell/discussions/3)); fetched from their authors until they answer.
- ✅ 1449: v2 without the sliders, at 094e03a (163 files, 256 GB).

- ✅ The Models, LoRAs and Starter Sets repos and the 💎 bucket public on Hugging Face.
- ✅ 1289: Engine → Models and LoRAs: what the install brings, here or not, fetched again from the studio (a part at a time or all), and the extras each asked with its size.
- ✅ 1296: one's own copy of a published LoRA is kept and counted whole («differs», «own copies kept»).
- ✅ 1302: **Fetch's progress at the row pressed**. 1303: the trainer's base brings MERT-v2-FullSong. ✅ 1339: the Models card's strings in the six other languages.
- ✅ 1290: the converted models in a repo of their own, [goldhub/Ruach_Studio_Models_v2](https://huggingface.co/goldhub/Ruach_Studio_Models_v2): the legacy and blend decoders and the 16 sliders, production only, byte for byte; the install fetches no checkpoints. The sliders gone again with 1449.
- ☐ Every approved 💎 probe made again full length on its own seeds before 2.0.0.
- ☐ Reading examples: Jude in Greek, Hebrew, Russian and Ukrainian, and English from Young's Literal Translation (public domain).
- ☐ CLAP beside Omni for judging probes.
- ❓ Pictures for the instruments the painter cannot draw (candidates from Wikimedia Commons, downloaded only on his word).
- ❓ Backups of the generations (restic or rsync, nightly).

## Docs and the site

- ✅ README, CHANGELOG, INSTALL, the guide in seven languages, the visiting card in seven languages with its logo and icon in each, six rooms counted.
- ☐ The screenshots of the guide, the README and the site for 2.0.0, in one go.
- ✅ 1446: the visiting card counts its visitors (Umami on our own server, no cookies).
- ✅ 1448: the studio's name in every language as its logo says it, in the page and on the card.
- ✅ 1449: the guide in twelve languages without the sliders, a LoRA's wave and the budget in their place.
- ❓ The site's `/favicon.ico` comes from the server's shared icons (nginx): a location of the site's own, on Viktor's word.
- ☐ Posts (Reddit, Hugging Face, X) when Viktor says.

## Upstreams and the community

- ☐ Watch IronWolve/yue2-kit (issue #2: a licence for the Kit), ServeurpersoCom/yue2.cpp (our engine patches offered upstream), ostris/ai-toolkit, multimodal-art-projection/YuE, jplenio/Plenio; a weekly look on Viktor's yes.
- ☐ Issues and pull requests on igrbible/Ruach_Studio: read, answered, merged.
- ☐ abcjs's releases: `heresy/tools/check-vendored.sh` says when a newer one is out (`--abcjs` takes it, `--fonts` takes the fonts again).

## From SUNO v6

Viktor's screenshots of SUNO's newest interface, 09.10.2026 (its Studio, a DAW, at 35 dollars a month): «Наша студия уже круче, чем СУНО». What we take, the quick ones first; ours stand on the score, which knows every section and every bar.

**Quick, one patch each:**

- ✅ 1282: **sections on the wave**: the take's sections from its score as labelled lines over the player's waveform; a click by one goes to its start. ✅ 1315: the lyrics' own tags placed by ear (Whisper), a card with the section's words under the pointer. ✅ 1358: the boundaries snapped to the music's own changes (spectral novelty), the instrumental breaks found by the voice's absence (Break, Intro, Outro), a slice of the spectrogram in the card (Viktor 10.10). ☐ The same over the take's own waveform in the room.
- ✅ 1324: **Fade in…**, beside End at… (which fades the last seconds): the first seconds faded in (the engine's fade_in, from the take's kept latents).
- ✅ 1356: **Crop** and **Remove a section** on the score's bar lines, each cut healed by a short crossfade (SUNO: Crop, Remove Section, Heal Edits); a new take each time.
- ✅ 1356: **Adjust speed** without changing the pitch (Rubber Band), the new tempo written into the score.
- ✅ 1325: **A loop from the song**: 1, 2, 4 or 8 bars cut on the score's bar lines, seamless, as a WAV named with its BPM and key (SUNO's Sounds: loops and one-shots with BPM and key).
- ✅ 1281: **vocal gender** at a click (male, female): its words put into the Style (♂ ♀ in its head).
- ✅ 1357: **Tighten these lyrics** in the lyrics box, by the Writer's model (both texts side by side first); **style suggestions** as chips under the Style, made anew on demand (SUNO's ✦ and ↻ under its Styles).
- ✅ 1311: **A/B in one window**: the Refiner's «Compare all» holds the original, its branches and the same music in other takes, switched at the same second, the disliked left out.
- ✅ 1394: lettering on a cover (Viktor 12.10.2026: «A & B - лучшие. B - реально круто. Впиливай всю эту ересь! 🔥»; «По надписи всё правильно»): a title and a second line in fields of their own, painted with the picture (Qwen-Image 2512 or 2.1) or on the reference (Qwen-Image 2.1, «Letter it»), each picture read back by the listener and painted again when misspelled, up to three times.
- ✅ 1396–1401 (12.10.2026): lettering on Krea 2 Muse; two guidances (the music's and the lyrics', our yue2.cpp patch; Viktor: «наша величайшая находка за всю неделю»), their lights, the take's medcard, the section card without its spectrogram (RC7), the profiles at 1.6 / 2.2 and his «Musical Heresy of Creator's Ear».
- ✅ 1405 (12.10.2026): SDXL gone; Krea 2 Muse paints a take's artwork on any card, streamed from RAM below 16 GB.
- ✅ 1406 (12.10.2026): Trash (Art) as tiles; a click on a tile ticks it; the takes' Trash stays a list.
- ✅ 1409 (13.10.2026): «Wait: binding the lyrics to the wave…» on the wave and in the section card while Whisper binds them.
- ✅ 1410–1412 (13.10.2026): the Trainer in epochs, its knobs in three rows; Cancel run asks; the guidances a row each; Shape a band in the take's card.
- ✅ 1413 (13.10.2026): the engine's default output WAV 24-bit.
- ✅ 1414 (13.10.2026): Replace a section from the wave (early preview); ✅ 1452: its guide, in twelve languages, after we both had tried it.
- ✅ 1415 (13.10.2026): compare a take with its namesakes, or two to four checked, in one player.
- ✅ 1416 (13.10.2026): Free tempo (the score's Q: out before the music; on by the Style's own words; a score without Q: native).
- ✅ 1417 (13.10.2026): the lyrics' timing in two passes (hotwords, the vocal stem); stable-ts tried and dropped (its developer left it in June).
- ✅ 1419 (13.10.2026): the guidances as roads; Free tempo as the lyrics' toggles; every corner from Engine's profile; a take's hover tools in one row.
- ✅ 1420 (13.10.2026): score mode (Full, Melody) in the studio's own trainer; next: the separation, then AI-Toolkit out of the studio.
- ✅ 1421 (13.10.2026): compare plays on; the Style as one line; the find bar's ✕; Max length as typed; guidances in tenths; the take card's face; the sambuca in his words.
- ✅ 1422 (13.10.2026): the separation in the studio's own trainer; AI-Toolkit out of the studio (his own AI_Toolkit folder untouched).
- ✅ 1430 (14.10.2026): the audit's fixes: the lab's reload behind a failed job, timeouts, silences that lied, the critic's stand-ins, links from the internet.
- ✅ 1429 (14.10.2026): Engine → Security, who may open the studio (this computer, private networks, the networks listed), kept by the engine; the first start asks it.
- ✅ 1428 (14.10.2026): Krea 2 out of the studio; The Artist's brushes with ⚡ Lightning (fp8 BASE as the base); a picture's note; the rooms' font and the active room an arch.
- ✅ 1427 (14.10.2026): the lyrics' toggles by its title and the meter in blocks; Unbounded, Tektur and Jura.
- ✅ 1426 (14.10.2026): the voices among the lyrics' tags and the guide's lyrics in twelve languages; covers that do not lie; the Artist's stage as icons; Raleway, Michroma and Liberation Mono by default, carried by the studio; Unload reaches the Artist again.
- ✅ 1425 (13.10.2026): several sections replaced in one go, their versions named by section and stretch and in Takes as they land; compare at 1200 px with its wave, thumbs and «Hide disliked»; the Refiner's Colour (vinyl, tape, room); a cover to its namesakes; Compute's VAE, the memory preset gone; the scan suggests Qwen-Image 2512.
- ✅ 1423 (13.10.2026): covers by the cards: Qwen-Image 2512 where it fits whole, else Krea 2 Muse; the speeds measured. ☐ 2.1.0: a quicker Qwen cover (the Artist room's kept painter for covers, or nunchaku's int4 kernels, or a 4-step Lightning), on his go.

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
