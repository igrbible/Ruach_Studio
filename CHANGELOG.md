# Changelog

Ruach Studio is a music studio on [YuE2](https://huggingface.co/m-a-p/YuE2-3B): one machine with an NVIDIA card, your own songs, nothing in a cloud. It grew over [YuE2 Kit](https://github.com/IronWolve/yue2-kit) v12 by IronWolve, which runs [yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp) by ServeurpersoCom. Every change has a number (HERESY 1001 and up); `heresy/docs/HERESY.md` tells each one with what was measured, and `heresy/engine/` keeps each change to the engine and the page as a patch of its own.

## 2.0.0 · In the Making

The closing pass goes on: the LoRAs mixed by the layers they touch, the Engine as an overlay, the strings in every language, the 💎 probes at full length (HERESY 1169, patches 1446 and up).

## 2.0.0-rc8 · 2026-10-14

The eighth release candidate: every weight from one repo, goldhub/Ruach_Studio_Models_v2, the LoRA Trainer's base in it and each file known by its content whatever its name; Krea 2 out and Qwen-Image painting every picture, 2.1's fine-tunes, Turbo and Outpaint; Engine → Security and the studio on port 7777; no take outside a workspace; the lyrics' arc and the voices among their tags; a font and a size for every role (HERESY 1169, patches 1426–1445).

- **Voices among the lyrics' tags** (HERESY 1426): Viktor's form, `[Vocal: Female - …]`, `[Vocal: Male - …]`, `[Spoken: Female - …]`, `[Spoken: Male - …]` (who, then how after a dash; no Solo, which YuE2 does not hear in a voice), offered under «[» after the sections and marked *not a section*; the meter reads a voice named with Solo as who sings, not as an instrument's solo. The guide's lyrics in twelve languages: round brackets are no command (a word or two sung as a choir's echo), square ones are; the stress mark holds in about 90 % of lines, a capital alone seldom; one syllable moves the whole song (the seed is the dice); YuE2 holds 8 to 9 minutes.
- **Covers that do not lie** (HERESY 1426): an instrument's cover painted from its look word for word (the painter never hears the name, which it half knows), the critic judging by the look, not the name; no picture at all when three tries never show it. The looks of the duduk, the gudok, the sambuca (Greek strings), the kemenche, the nyckelharpa, the kinnor, the slide guitar, a closed grand piano and a bugle said plainly.
- **The Artist's stage as icons** (HERESY 1426): two halves, what is made from the picture and how it is seen and kept.
- **Fonts** (HERESY 1426): Raleway, Michroma and Liberation Mono by default; Liberation Mono, Raleway whole, Lato 2.015 and Noto Sans' bold and italics in the studio itself; a chosen font falls back on the studio's own for the letters it lacks.
- **Unload reaches the Artist again** (HERESY 1426): the Bar's Unload let go of the Artist's kept painters only in words since 1370 (the lab refused its empty request); a painter at work is still never let go.
- **The lyrics' toggles by its title** (HERESY 1427): the line numbers and the spelling as icons at the right of the Lyrics' title; the meter's counts in readable blocks, their numbers bold.
- **Three heading fonts to try** (HERESY 1427): Unbounded, Tektur and Jura, carried by the studio with their Latin, Cyrillic and Greek.
- **Krea 2 out of the studio** (HERESY 1428): Qwen-Image paints every picture; a take's cover by the cards is Qwen-Image 2512 Q6 or Q4 whole, else Q4 streamed from RAM; `--artwork` fetches the covers' helpers only (the prompt writer and the content filter, 8.4 GB). What a studio fetched for Krea 2 (`artwork/Krea-2-Muse`, `artwork/Krea-2-Turbo`, `artwork/loras/krea2`, 33 GB) is no longer read and can be deleted.
- **The Artist's brushes** (HERESY 1428): one list for the painter and its fp8 file, grouped by model, ⚡ Lightning on a brush that paints with it by default; 2512's own fp8 BASE paints with Lightning at 1.0 and 8 steps; a file put into `checkpoints/` becomes a brush of its own.
- **A picture's note** (HERESY 1428): Note… on the Artist's stage, kept with the picture in its run and shown in its tip.
- **The rooms' names** (HERESY 1428): a font of their own (Look → Fonts → Rooms); the active room an arch of light, fading to both sides.
- **The audit** (HERESY 1430): the lab's reload no longer waits for ever behind a failed job nobody read; every ffmpeg and ffprobe it starts has a timeout; a folder's move waits when the studio does not answer instead of taking silence for idle; a hand-broken `user/gpus.json` keeps the roles and limits read before; a cover's critic saying YES while naming another instrument counts as NO; links that came from the internet (an adapter's Civitai page, an upscaler's) open web pages only.
- **Engine → Security** (HERESY 1429): who may open the studio: this computer only, this computer and private networks (the default), or this computer and the networks you list; the engine keeps it in `user/access.json` and answers by it at once. The first start asks it, with a short guide and «My decision is a conscious one»; a choice that would close the studio to the machine asking is asked again.
- **The studio's port is 7777** (HERESY 1433): start.sh says it in a bold line of its own, Pinokio's menu says «Open the studio · port 7777», and the docs, the extras and the checks use it; `YUE2CPP_PORT` still picks another.
- **No take outside a workspace** (HERESY 1434): whatever makes a take (Generate, Replace a section, Import) waits for a workspace in hand that takes new takes, never a 💎 set, its sections or a frozen one; the only open one comes into hand by itself, a new install gets «My songs», and otherwise the studio asks; nothing is sent while the Librarian does not answer. An import lands in the workspace in hand.
- **The veil ten seconds, its logo never English first** (HERESY 1435): its line runs from the first moment; «Loading…» and the versions come with the page's language, the logo and OSEM from 2.2 s in that language.
- **The lyrics' arc** (HERESY 1436): the verses numbered 1, 2, 3…, and Verse › Pre-Chorus › Chorus › Post-Chorus inside a verse's cycle (a section left out, none turned back) said amber in the meter, a press to the next; letters other than Latin in the Style named under it; ✦ Suggest reads the lyrics whole.
- **Fonts for the section marks and the buttons** (HERESY 1437): two more in Look → Fonts, and each role's size against the text's, −2 to +2 pt.
- **The Creator's long lists in the studio's dialog** (HERESY 1438): the Writer's documents, the profiles, the saved styles and the text profiles, as the workspace is.
- **The page's small things** (HERESY 1432): ▶ Play this song a filled icon two icons wide in the take's row; Save style and Delete as icons; the takes' ⋯ menu whole and opening upwards without room; the «[» list without a sideways scroll; the MP3 bitrate as its buttons; the bar's ☰ wider; a folded takes list opened over the take by the mouse; the Artist's Fine-tune field gone, Base weights and Fine-tune said first in the brushes, Batch for Variations.
- **Files known by their content** (HERESY 1441): an adapter or a model renamed, moved into a folder of your own or with its header rewritten is still here, known by its SHA-256 or its tensors' (the models repo's `MANIFEST.tsv`); the install fetches nothing again, Engine → Models and LoRAs says it is here.
- **Models v2 rebuilt whole** (HERESY 1440): goldhub/Ruach_Studio_Models_v2 is the studio's own disk, file for file (169 files, 256 GB with 1445): YuE2, its decoders and the transcriber, the sliders, Whisper, the stems, UniverSR, the style listener, the studio's own adapters, and the Artist's painters with the adapters their authors let be shared; `SHA256SUMS`, `MANIFEST.tsv` with each file's origin and licence; Krea 2 out of both model repos.
- **Qwen-Image 2.1's fine-tunes, Turbo and Outpaint** (HERESY 1442–1443): an fp8 single file in `artwork/Qwen-Image-2.1/checkpoints/` (FinalCut v1 the first) is a brush of 2.1; Turbo 4step is 2.1's speed-up as Lightning is 2512's (4 steps, 42 s against 96 at 1280² on an RTX 3090); Outpaint… on the stage paints a picture's edges on into a wider, taller or square canvas with Outpaint v2, the picture kept pixel for pixel.
- **Every weight from one repo** (HERESY 1445): the install takes YuE2's GGUFs, Whisper, UniverSR, the style listener, the Artist's helpers and painters, the LoRA Trainer's base (Comfy-Org's YuE2 in one file, MERT-v2-FullSong, Mothersuperior's realaudio tokenizer head) and the studio's own adapters from goldhub/Ruach_Studio_Models_v2 at its pin, each file byte for byte as its author publishes it, checked against each author's repo; the stems' models, the Kit's library of adapters and Qwen2.5-Omni-7B whole still come from their authors. An install from before keeps what it has, and a file missing brings that file alone: what is here under a name or in a folder of your own is not fetched again; About → Model weights points to v2.
- **The Artist's tenth shared adapter**: Sketch Smudge for Qwen-Image 2512 by prithivMLmods (Apache-2.0).

## 2.0.0-rc7 · 2026-10-13

The seventh release candidate: songs edited as the model writes them (Replace a section, several in one go, the seam unheard; Free tempo; two guidances, the style's and the lyrics'), compare with namesakes at 1200 px, the studio's own trainer with score mode and separation (AI-Toolkit out), covers by the cards on Qwen-Image 2512, the Refiner's Colour, the Artist's guide in twelve languages (HERESY 1169, patches 1390–1425).

### The Artist

- **Trash (Art) as tiles** (HERESY 1406; Viktor 12.10.2026: «Корзину треша Арта перерисуй в тайлы, но аудио корзину оставь списком как есть»): the picture square on top, the box on its corner, the prompt in three lines and what it is under it; a click on a tile ticks it. Its card had worn the class of a take's cover thumb and shrunk to its 28 px, the prompts running over each other; the takes' Trash stays a list.
- **SDXL gone** (HERESY 1405; Viktor: «Лучше Krea 2 Q4, чем SDXL Q8»): a take's artwork is Krea 2 Muse's on any card, whole on 16 GB, its blocks streamed from RAM on a smaller one (an 8 GB limit on a 3090: 68 s, the prompt writer before it); Krea's text encoder and the prompt writer go to the CPU when the card has no room for them; SDXL CyberRealistic left the fetchers, Engine → Artwork, the LoRA library's families, the docs.
- **Lettering on a cover** (HERESY 1394): a title and a second line in fields of their own, lettered as part of the painting, not laid over it: painted with the picture by Qwen-Image 2512 or 2.1, or on a finished picture by Qwen-Image 2.1 (**Letter it** on a picture). Each picture is read back by the listener (Qwen2.5-Omni) and painted again with another seed when it is misspelled, up to three times, the misspelled tries kept aside; a mark beside each picture says how it reads (Cyrillic too).
- **Lettering on Krea 2 Muse too** (1396), which wrote Viktor's Cyrillic title and second line exactly; the shapes of the hard Cyrillic letters said in the phrase.

### The LoRA Trainer

- **Why your own adapters** (HERESY 1395), a stop of the Trainer's guide in twelve languages: a bare open model falls short on instruments, styles and voices; your best tracks (made on SUNO on a paid plan, or anywhere whose rights you hold) trained into a Style adapter lift YuE2 further than any prompt.
- **Epochs, not steps** (HERESY 1410; Viktor 13.10.2026: «Нужно просчитывать эпоху по количеству семплов и вместо макс шагов иметь макс эпох»): the run's length in epochs, its steps said beside the field from the set picked; the kinds' own: Style 40, Voice 30, Language and Artist 20.
- **The knobs in three rows** (1411; «сделай его изящным… чтобы заголовки полей не схлопывались в две строки. Подсказки в тултипы»): every label on one line, the hints in the tooltips, the units inside their fields, the guide's links a «?».

### The Creator

- **Free tempo** (HERESY 1416; Viktor 13.10.2026: «Мой Буратино реп без Q ожил… Даже пустой Q: работает, либо вообще удалённый»; on КРИК: «Совсем другое исполнение, свободное. И музыкальная часть ещё живее стала. Больше эмоций, абсолютно. Теперь лирика не зависит от такта»): a switch in the Style's head; the music is made from the score without its tempo marks (Q:), the lyrics no longer tied to the bar; on by itself when the Style asks for rubato or non-linear and names no BPM, an honest word when a BPM stands in it; a score created alone comes without its tempo; a score without one reads as native (its statistics, MIDI and transposition at the nominal 120); the medcard says it.
- **Two guidances, the music's and the lyrics'** (HERESY 1397): the music stage guided by two scales at once, the style's pull and the words', a third branch (the prompt without its lyrics) beside the two guidance always had: our own patch of yue2.cpp, at about the same time. Viktor's ear: Guidance 4.0 with the lyrics at 2.2 the brightest; equal, half the lyrics drift into hallucination and the vowels lose their stress, so a light beside each field keeps his range (the music 1.0–4.0, the lyrics 1.0–2.6, the two 0.4–1.0 apart) without clamping anything (1400). A new song starts at 1.6 / 2.2.
- **Cancel run asks first** (1410; «Для `Cancel run` добавь диалоговое окно»), the run named; «Keep it running» keeps it.
- **The two guidances a row each** (1412), their fields at the right edge under the samplers; the take's card: Song | Sound, then Shape a band of its own, its three scales in one row, each name over its dots.
- **WAV 24 by default** (HERESY 1413; Viktor 13.10.2026: «Дефолт движка везде выставь на wav 24bit»): a request that names no format is rendered as WAV 24-bit (it was MP3 128); the page, the API and the regenerations named WAV 24 already.
- **Replace a section** (HERESY 1414; Viktor 13.10.2026: «Межтактная склейка - это правильный ход… Внедряй в полноформатный плеер»; an early preview, for both of us to try): a right click on a section of the wave heard by ear, «Replace this section…»; change its words, one or two versions; the section is sung anew between two rests, the rest of the take kept code for code; each version a take of its own, a child of this one, its stretch marked «anew» on the wave.
- **Compare with its namesakes** (HERESY 1415; Viktor 13.10.2026: «опцию сравнения одноимённых треков? Выбор до четырёх»): from a take's menu its namesakes (the same title past its version and suffixes), two to four ticked, or the Librarian's checked ones, in one player that switches at the same second.
- **The lyrics' timing in two passes** (HERESY 1417; Viktor 13.10.2026: «Лучше Whisper с Qwen-Omni допилить ещё малость»): a take heard under 85 % gets a second Whisper pass with its lyrics as hints (on its vocal stem when it has one), which times only the lines the first pass guessed, where they fit; the sections by ear land closer to where they are sung.
- **The guidances as roads** (HERESY 1419; Viktor 13.10.2026: «Может ползунками сделаем как с LoRA адаптерами?»): Guidance and Lyrics guidance each a road before its field, red under 1, green in Viktor's range, amber past it, red far past; the fields of the samplers' height. Free tempo dressed as the lyrics' toggles; every corner follows Engine's profile; a take's hover tools in one row, none over another in any language.
- **Score mode in the studio's own trainer** (HERESY 1420; Viktor 13.10.2026: «Режим можно выбрать только с AI-Toolkit. Это твоя недоработка в коде?»): Full (score) and Melody train in the Ruach trainer too, as AI-Toolkit trains them: every song's score by the engine's own transcriber before the run, half the steps without it so Direct is kept, the score in the music half's lesson and in the sound half's conditioning.
- **The separation in the studio's own trainer; AI-Toolkit out of the studio** (HERESY 1422; Viktor 13.10.2026: «Убирай AI-Toolkit внешний из Студии»): every song split into voice and instrumental by the studio's separator (once a set), the music half also learning the voice from the lyrics alone and the music from the tags alone, as AI-Toolkit trained it; with score mode (1420) all it trained is the studio's own, and the Trainer has the one trainer.
- **His small things** (HERESY 1421): the compare player plays on when a click goes back to a version; the Style goes to the engine as one line; the find bar's ✕ stays in its row; Max length reads 9 as 9:00 and an empty field as the default 8:00; the guidances in tenths; a take's card without mp3, Refine, download and delete (the take menu has them), playing and the decoder at the tail of the title's row; the sambuca asked for as «sambuca - greek strings», its probes made again, approved, their covers by Qwen-Image.
- **Covers by the cards** (HERESY 1423; Viktor 13.10.2026: «ставь на обложки 2512»): a take's artwork by Qwen-Image 2512 where a card holds it whole (Q6 from 20 GB, Q4 from 16 GB), else Krea 2 Muse Q4 streamed; Engine → Artwork keeps every painter to choose, its speeds as measured (a cover on a 3090: Krea 65 s, Qwen 125–131 s). Qwen-Image 2.1 never a default (its research licence).
- **Replace several sections in one go** (HERESY 1425): the dialog lists every section heard clearly, the one clicked ticked; each ticked one its own words; sung in turn on the codes so far, so the later cuts stay where the ear heard them. The versions' titles carry each section and its stretch (Chorus 1:02–1:25 anew A), past the 80 characters a typed title may have; they appear in Takes and the Librarian as they land, no F5; the wave marks each part.
- **Compare, wider and rated** (HERESY 1425): 1200 px (narrower with the window), the playing version's wave as the seek bar, each take's thumbs and star, «Hide disliked» as SUNO has it (kept for the next time).
- **The Refiner's Colour** (HERESY 1425): a layer under the song before the loudness, vinyl (surface, fine crackle, a click now and then, the player's rumble), tape (its hiss) or room (its air), −60 to −20 dB under the song's loudness, the noise new on every run.
- **A cover to its namesakes** (HERESY 1425): from a take's menu; the ones with a cover of their own replaced (kept beside them) or left.
- **Engine** (HERESY 1425): Compute has the VAE under the model (the ☰ menu's twin); the GPU memory preset gone (a card's VRAM limit sets the knobs); the machine scan suggests Qwen-Image 2512 by the cards where a card holds it; the Krea set's row named «Krea painter», its Qwen neighbours' notes as measured (the text encoder in the download, gone from the card before the painter comes).
- **The Artist in depth in twelve languages** (HERESY 1424): docs/ARTIST.md brought up to date (covers by the cards) and translated whole, each language with its own contents and a line to the others; the room's own name in each (Художник, Мастак, Peintre, Pintor, Maler, 絵師, 画室…), the controls as the studio names them there.
- **The take's medcard** (1399): under its seeds, how it was made: the Score Planner's and the Music Tokens' sampling, the tokens each wrote and their seconds, the guidance applied, the sound stage and the decoder.
- **The built-in profiles at 1.6 / 2.2** (1401); the third renamed «Musical Heresy of Creator's Ear», ten minutes long, Viktor's to save over.
- **«Wait: binding the lyrics to the wave…»** (HERESY 1409; Viktor 13.10.2026: «Нужно дописать ПОДОЖДИ! ИДЁТ ПРИВЯЗКА ЛИРИКИ К ВОЛНЕ...»): while Whisper binds a take's lyrics to its wave (a minute or so after a take is first played), the wave says so in its corner and the section card says the words are on their way; until then the sections are the score's marks, without words.
- **The section card without its spectrogram slice** (1398): the full scope over the player shows the spectrogram whole.

## 2.0.0-rc6 · 2026-10-12

The sixth release candidate: the Artist room nearly closed (regions, a reference edited by words or used for its style, a second pass and extra noise as Viktor's ComfyUI workflow, Qwen-Image 2.1 on a 16 GB card, the Artist in Depth), five more languages with the guide in all twelve, the visiting card in twelve, and SUNO's quick ideas (HERESY 1169, patches 1347–1389).

### The Artist

- **Get painters and adapters…** under the painter: what the studio can fetch for the Artist (Krea 2 Muse, the Qwen painters, the Qwen-Image 2512 fine-tunes, the adapters), each with its size, here or Fetch, through Engine → Models and LoRAs' own fetch; the painters and the adapters are read again when it ends.
- **The Qwen-Image 2512 fine-tunes and seven adapters in our models repository**, where their authors let them be shared (Civitai: share and sell): Jib Mix Qwen v6, IntoRealism Qwen v1, Real-Qwen-Image v2 and 2512 itself in fp8 (20.4 GB each, with 2512's own parts when they are not here); Cinematic Movie Still, Cinematic Dark Lighting and Lenovo UltraReal for Krea 2, Lenovo UltraReal and Frank Frazetta for Qwen-Image 2.1, Film Photography and Photostyle by Sean Archer for 2512. The others stay with their authors on Civitai.
- **The GGUF Qwen painters stream from RAM too**: Qwen-Image 2512 at Q4 or Q6 paints on a card of 8 GB, its blocks coming from RAM as they are needed (Q4: 34 s a square picture against 31 s whole on an RTX 3090, 2.2 GB of the card at the peak, the same picture).
- **Krea 2 Muse streams from RAM too**: Q4 or Q8 on a card of 8 GB, its blocks coming from RAM as they are needed (Q8: 40.5 s a square picture against 35.7 s whole on an RTX 3090, 4.4 GB of the card at the peak, the same picture).
- **Draw from the canvas**: a Draw beside Done (and Ctrl+Enter), as InvokeAI's Invoke by its canvas: the places kept, the canvas closed, the run asked.
- **Eight adapters in the list, four in the run**: a fifth comes in muted, and a muted one comes back when fewer than four are on; an adapter's **trigger words go into the prompt by themselves** when it comes into the run and out when it leaves it (off and on in the adapters' menu).
- **The LoRA library's own menu and an Info window** for each adapter: what it is made for (read from its file: another model's adapter is dimmed on its card with the model's name, and it is not added), its file and layers, its trigger words, Civitai, what its trainer wrote into it; **to the art's trash**, given back by the Librarian's Trash (Art).
- **An adapter saved by PEFT without its model's prefix loads**: such a file (tackbear's OilPaint for Qwen-Image) was read as reaching none of the painter's layers and stopped the run.
- **The picture's tip** beside it comes after a moment and stays a moment; **Upscale…'s row** stands centred under the picture's buttons.
- **A run's pictures on the lab's cards at once**: with two cards given to the lab's jobs, each loads the painter and paints its share, the time said for them (three shapes of Qwen-Image 2512 fp8: 6.4 min on two cards against about 8.6 on one; Krea 2 Muse Q8: 132 s against 163, the same pictures); only while RAM holds a painter for each, never a card of another role.
- **What each upscaler is for**: an i beside the choice says the chosen one's use, its time (measured on an RTX 3090) and its licence; a click on it opens the window of them all, by photos, faces and art, the non-commercial marked, each with its page (38 known models, read from their OpenModelDB and Civitai pages).
- **An upscale in passes**, as Viktor's ComfyUI stack: up to four passes, each a model and a factor of the picture's own size, how each lands, the long side after them, the colours put back to the picture's (hm-mvgd-hm); his Qwen-Image 2512 chain one click away (a 1920×1080 picture to 7680×4320 in about four minutes).
- **4x_Nomos8k_atd_jpg upscales**: the ATD model failed in half precision; each model's precision is now tried on a small tile first.
- **TTA and the pictures picked upscaled at once** (from Upscayl): TTA beside the upscaler sends each tile through it in its eight orientations and averages them (steadier edges, up to eight times the time), for one picture or the passes; «Upscale…» on the bar of the pictures picked (Ctrl or Shift + click) upscales them all in one run: 2K or 4K by the upscaler chosen, or the passes kept, shared over the lab's cards.
- **An adapter's strength over the steps** (as ComfyUI's LoRA hooks): ⏱ beside an adapter opens its keyframes, «0%:1, 50%:1, 60%:0», multipliers of its strength at shares of the steps (straight between them, a step where two share a place); for Krea 2 and the Qwen painters, Lightning kept as it is.
- **The Artist's columns by the window**: the prompt's 25–30 % of it, the library's 20–35 %, dragged within them; every field one height with the selects; the sampling block and the painter's selects narrow with their column (Schedule goes to the next row instead of a scroll sideways), the painter and its fine-tune a row each.
- **A picture protected**: the shield on the stage, in the gallery, over the picture in the view, in its menu and on the picked bar; a protected picture never goes to the trash (Trash leaves it in the room and says so), nor its run, and nothing protected is deleted for good; the gallery's filter shows the protected alone.
- **A take protected**: the shield beside the star on the Librarian's cards, in the Creator's column and in the take's head, in its menu (one or the checked) and on the checked bar; a protected take never goes to the trash nor is deleted for good (its Delete off, «Delete non-favourites…» passing it by, said); the Librarian's filter and count of the protected.
- **The Artist's library by the arrow keys**: ← → the picture before and after, ↑ ↓ a row of the gallery (in the runs, the run before and after), the stage following; the sampling's Lightning, Guidance and Reset on a row of their own.
- **The Artist's painter kept between runs**: the same painter with the same adapters paints the next run without loading (its strengths, keyframes and sampling the run's own); between runs its weights lie in RAM and its card is free; let go after ten minutes idle, for the RAM another painter needs, or by the Bar's Unload, which lets it go with the engine's models.
- **A long upscale pass no longer stopped as silent**: each pass says where it is, tile by tile (DAT with TTA takes 24 s a tile on an RTX 3090; the lab's watchdog stopped Viktor's chain at ten minutes).
- **A picture that is a take's cover, to the trash**: asked whether its cover comes off the take too or stays (the take keeps a copy of its own); a run's trash asks the same; no cover, no question.
- **♂ and ♀ in the middle of their buttons** in the Style's head (they stood 6 px right).
- **The wave's scope**: the pointer resting on the full player's wave brings up the take's whole spectrogram over the player, as wide as the wave and in time with it, a third of the window high, the section's card above it: the sections, the spectral centroid, the RMS in a lane at its foot, the playhead; under the pointer the moment's spectrum with its loudest frequency and note, and up in the picture the frequency, note and level there. Log or Linear in its head; a switch in the player turns it off.
- **The Artist's painters after a reload**: the lab's list of painters answered empty (since 1370 took its name), so the room had Krea alone and the painter kept in the browser fell back to Krea Q4; the painter and its fine-tune are now kept only once the lab's list has come. «From the take» is no longer «Takes: From the» in the other languages.
- **Whisper no longer waits behind the Artist**: the lyrics' timing, the lyrics check and Listen run on a free card of the lab's jobs beside an Artist run or an upscale; they used to wait behind the lab's one heavy turn (24 and 21 minutes behind a 29-minute upscale while GPU2 stood empty).
- **The Artist's run goes where its painter is kept, and the lab's jobs keep to their own cards**: a run of a kept painter counts the kept painter's own memory on its card as its own (that very process paints it), so a painter needing nearly the whole card no longer finds its card full, goes to another and loads again (five minutes), or on one card waits the ten minutes until the painter is let go; and a lab job no longer spills onto a card not ticked for the lab's jobs in Engine → GPUs (an Artist run had taken 22.7 GB of the studio's GPU0).
- **Five more languages**: French, Portuguese (Brazil), German, Japanese and Chinese (Simplified), the page whole as the six before it (every room, dialog, toast and menu, Engine, the cheat-sheet's instruments and styles), the Artist's room by its own name in each (Peintre, Pintor, Maler, 絵師, 画室), numbers, dates and plurals in each language's own way; Japanese and Chinese in the system's own CJK font. The guide (F1) in them too. The updates question's choices (Every week, Every day, Every month, Never) come in the page's language too.
- **The Artist follows a change of language**: the stage's buttons and the steps line under the form no longer keep the language they were made in when the page's language changes (they did until a reload).
- **The guide in the five new languages**: F1 opens it in French, Portuguese (Brazil), German, Japanese or Chinese as the page is, every heading where the page's links into the guide expect it, the rooms and buttons named as the page names them.
- **The Artist's log is the room's**: the server log's Artist view carries the room's name in every language, as the bar's tab (it said the Trainer's «performer» in some), and so does the Bar card's row of a painter kept between runs.
- **The Artist's second pass**: Second pass… on the stage paints a picture over at ×1.5 or ×2 by its own run's painter, fine-tune, adapters, prompt and seed, as Viktor's ComfyUI workflow does after its first pass (the picture brought up by nearest, then painted again from part of the way); how much it may change is yours, the steps and sampler the form's. Krea 2 at 2560² in 86 s, Qwen-Image 2512 fp8 at 3840×2160 in 220 s on a 3090.
- **Extra noise** under a reference picture and in the second pass: Viktor's ComfyUI workflow's InjectLatentNoise, fresh noise on the picture before the painting starts from it (0 first under a reference, 0.6 in the second pass, as his).
- **Qwen-Image 2.1 on a 16 GB card**: where neither its text encoder nor its painter fits whole, both stream from RAM (under a 15.5 GB limit: 4.1 GB at the peak from words, 7.9 editing, about the same time). A card's VRAM limit now counts as its ceiling: a run above it streams instead of waiting for ever.
- **Regions** in the Artist: up to three parts of the frame, each with words of its own (halves, thirds, quarters, the middle), blended into one picture as Latent Couple does; Krea 2 and Qwen-Image 2512.
- **Edit by words and a style reference**: under a reference picture, «Use it» to paint from (as before), to edit it by the prompt's words, or for its style alone (the prompt's own scene in the picture's technique, brushwork, palette and light); the last two by Qwen-Image 2.1.
- **The Artist in Depth** ([docs/ARTIST.md](docs/ARTIST.md)): the whole room, every control and how it is made inside, recipes, what goes wrong and why, the numbers and the API (English first).
- **The Writer says what went wrong**: «Max tokens» (32K by default), an empty answer or a failure of the model said over the page, an answer that came brought to the window's top.
- **The lyrics' language for Whisper from the sung lines**: the [tags] and the (directions) no longer count, so English directions around Russian words no longer leave Whisper to guess.
- **Long menus scroll**: a menu or submenu no taller than the window scrolls inside itself (the Workspaces list of a busy studio), its ticked row in sight.
- **A picture made in passes shows**: the lab refused its name (…-up4p) and served neither it nor its thumbnail.
- **From Civitai… in the LoRA library**: an adapter by its link (its page, a version's number, a download link), looked at first (its name, what it is made for, its trigger words, its file and size), then fetched by the lab into its family's folder with its words and its picture, its progress in the window. Your own Civitai key only when the adapter asks for one: kept in the page's memory, in this browser with Remember, never in the studio's settings file; it goes to civitai.com alone. Only a .safetensors (a pickle is code, never taken), its SHA-256 checked against Civitai's.

### The Creator and the take

- **Crop, Remove a section, Speed** (from SUNO v6), the take's Edit row: the sections from its score picked in a window, the take's own sound cut on their bar lines and each join healed by a short crossfade, the score cut along; or its speed changed with its pitch kept (Rubber Band), the new tempo written into its score. A new take each time; the take itself stays.
- **✦ Tighten these lyrics** and **✦ style suggestions** (from SUNO v6), by the Writer's own model (OpenRouter or the chat server): the lyrics tightened with every section tag kept, both texts side by side before anything changes (Ctrl+Z brings the old ones back); short style tags this song has not got, as chips under the Style, a click putting one in before its BPM, ↻ for others.
- **The wave's sections on the music's own changes** (from SUNO v6): the lab hears where a take's music changes and each section's start moves onto the nearest strong change; where no voice sings for seven seconds a Break is laid (Intro and Outro where the song has none); the section's card shows a slice of its spectrogram.
- **The player goes on**: a take asked to play keeps playing when the FLAC route fails and its WAV comes instead; a take whose sound is all here but that does not start is loaded again in place and asked once more, then said; a play refused on the way to the next take is said instead of passing in silence.
- **Fewer requests while a song renders**: the server's props and the artwork list wait, the memory readout comes every 15 s; a take opened asks for its panels' kept answers at low priority, so its sound is not queued behind them.

### Install and Pinokio

- **The launcher's scripts in `launcher/`** (they were in `pinokio/`): Pinokio keeps an app's environment in a folder named `pinokio/` when there is one, and its environment page answered 500 looking for it beside `pinokio.js`. An install of rc5 or before is led through its first update by the menu: the old Update stops halfway, then the menu moves what Pinokio wrote into the old folder out of its way (its `ENVIRONMENT` beside `pinokio.js`, the rest under `tmp/`) and offers **Finish the update**. An update that stops before its end is said in the menu the same way.
- **An install in a folder with a common name builds**: build.sh's guard looked for the folder's name in the page, and a clone into studio or music stopped there (the page says «studio» 940 times); it looks for the install's own path now.
- **Under Pinokio the page's updater sends you to Pinokio's Update**: its own would have left Pinokio's on a detached checkout; a machine without systemd-run is told the way by hand.

### Everywhere

- **A paragraph is one line, its box wraps it**: the last three text boxes measured in ch (the empty take's card, the guide's notes, the LoRA library's empty word) wrap at their column, as everything else.
- **A dialog keeps its lines in every language**: the first start's scan of the machine, a message of several lines, read as one paragraph in the six other languages; each of its lines is translated on its own line now.

## 2.0.0-rc5 · 2026-10-11

The fifth release candidate (HERESY 1169, patches 1291–1346): the Artist room grown nearly whole (a reference picture, its mask, painting around it, the canvas as InvokeAI's, LoRA adapters, the Qwen-Image painters with their samplers, an upscale, a painter streamed from RAM when it does not fit a card), the page in all six languages, the wave's sections from the lyrics' own tags, a new studio reading its machine at its first start, a VRAM limit for each card and one card for everything.

### Install and Pinokio

- **The Artist's models from goldhub/Ruach_Studio_Models_v2 too**, at its pin, byte for byte the files the studio paints with (Krea 2 Muse by Stable Yogi, Krea 2's text encoder and VAE, CyberRealistic XL): nothing reads the first models repository any more, and it goes after 17 October 2026.
- **Sizes as measured** on fresh installs, everywhere they are said: about 30 GB installed (the program and its two Pythons 16 GB, the models 13 GB for a 16 GB card, 16.5 GB for 24 GB), the Artist's models 26 GB more, the 💎 sets 5 GB; Pinokio's install says what its models step brings and what the disk holds at the end.

### Everywhere

- **The server log's frame keeps its height** beside the cards: it came back from full height no more and sank a pixel at every second; a card doing all three says all three roles.
- **The loading veil**: «Loading the Sound Heresy» just above its bar, the engine's and the studio's versions small under it.
- **The server log on either side**: an arrow on its inner edge takes it across the page, and each room keeps its side (the Artist left by default).
- **The Artist's own log** as a view of the server log's frame (Server and Artist, each room its own): what was asked, what the lab answered (a refusal in its own words), each run's way to its end; **⧉** opens the log in a window of its own, over every window (Chrome's Document Picture-in-Picture) or to carry to another monitor.
- **The wave's sections are the lyrics' own tags**, each where Whisper hears its first line (once a take, about half a minute; by itself on two cards or more, else the take's menu → Find the sections by ear): a Full take's plan marks only some of them (4 to 13 of 32 in one song). The pointer over the wave shows a card with the section's time and its lines as written, the line sung there lit; a section not heard clearly is marked ?, the lyrics a take never sang are left out.
- **The page in all six languages, wall to wall**: Russian, Ukrainian, Belarusian, Greek, Spanish and Italian now cover the Artist room, every dialog, toast and menu, Engine (Updates, Models and LoRAs, Folders, the cards live), the Creator's run stages and lyrics tools, the Library, the Writer, the Refiner, the Trainer and the help tips; a count says itself in the language's forms (1 картинка, 3 картинки, 5 картинок), and a dialog's paragraphs stay apart.
- Fixed: a lyrics line that happened to be a word the catalogs know (End, Outro) was translated in the box's mirror, and the marks after it slid off their letters; the lyrics' gutter named its sections in English in every language.
- **The cheat-sheet in your language**: the descriptions of the 200 instruments and 275 styles and the lyric tags' notes in Ukrainian, Belarusian, Greek, Spanish and Italian, as the Russian was.
- **The log's own window carries the cards**: the GPU column beside the log; the dock folds while the window is open and unfolds when it closes, if it was open.

### Engine and the cards

- **A new studio reads its machine at its first start** and offers in one window what suits it: the backbone (BF16 only where the card does BF16 in tensor cores; a Turing card takes Q8_0), Auto's context and VAE tiles, the painter that fits; set at a word, asked once; Engine → Compute's «Scan the machine» asks again.
- **Auto's tiers as measured**, and two more: from 5.4 GB Q8_0 at 8 192 rows, from 4.4 GB Q6_K; Pinokio's install takes Q8_0 from 7 GB (quicker than Q6_K, 5.1 GB with 12 288 rows).
- **A VRAM limit for each card** in Engine → GPUs, a slider in half gigabytes from 4 GB to the card's size: the lab's jobs and training take a card only when they fit under it, and Compute's Auto fits the engine's context and VAE tiles to the studio card's limit (rc4's «Auto within N GB» becomes that card's limit once).
- **One card for everything**: a job that finds no card with room asks the engine to let its models go when it is idle (they load again with the next song), so a single 8, 12 or 16 GB card paints, transcribes and trains between songs.
- **One's own copy of a published LoRA** (the same tensors, another header) is kept and counted whole in Engine → Models and LoRAs («own copies kept»), never taken for missing; `fetch-ruach-loras.py --replace` sets such a copy aside and fetches the published one.
- **A fetch's progress at the row pressed** in Engine → Models and LoRAs: its button says Fetching…, a bar fills under the row with how much of about how much.
- **The trainer's base brings MERT-v2-FullSong** (2.5 GB, from m-a-p at its pin): the set's latent cache needs it, and a fresh install fetches no checkpoints.
- **Engine → Artwork offers the Qwen painters** beside Krea 2 Muse and SDXL: Qwen-Image 2512 Q4 and Q6 with Lightning, each fp8 fine-tune its own line, 2.1 with its licence said; a take's artwork is painted by the one chosen (2512 Q4 with Lightning about a minute and a half with its loading on a 3090).

### The Refiner

- **Compare all holds the same music in other takes**: after the original, the take's re-renders under another VAE or sound seed (and the take they came from), each switched at the same second as the branches are, named by its VAE, its seed and when it was made; a disliked one is left out.

### The Artist

- **The Artist's canvas, as InvokeAI's**: Canvas… lays the reference in each shape's frame, to move and scale by hand or by numbers; a frame the picture covers is painted from it (image to image), the part it leaves bare is painted around it (outpaint); the inpaint mask is painted over it on the same board; Fit, Fill, Centre, Same in all, undo and redo, the shapes as tabs.
- **The Artist's fp8 painter streams from RAM what does not fit**: four adapters on a 24 GB card no longer refuse the run. The blocks that fit stay on the card, the rest come from RAM as each is needed: the same picture bit for bit, about a sixth slower with five of sixty blocks streamed, a third with all of them (then 2.3 GB of the card at the peak). The run says so in its data, with its card's peak.
- **Mute an Artist adapter** as in the Creator: a right click on its row, Mute: it stays in the list at its strength and leaves the run; an adapter at nought is not loaded either, and its card's room is no longer asked for it.
- **The Artist draws two runs at a time**: Draw stays Draw while a run goes and asks the next one, which waits behind it (Ctrl+Enter too); Stop is a button of its own beside it.
- **The Artist room fits a tall window**: from 920 px of height the page stands still and the form and the library scroll on their own. The picture fills the stage over its buttons; its data and prompt show beside it, over the library, while the pointer is on it; the run's progress lies across the stage's top; the form's hints are the studio's i; Draw's row stays at the form's foot, above the folded log; Seed is wider and Variations narrower; Sampling stays folded or open as left.
- **The Artist's form scrolls on its own** beside the stage, and the stage's prompt frame reaches down to the window's floor; a thumbnail clicked again while a run paints gives the stage back to the run; the LoRA library shows its pictures whole, not cropped.
- Fixed: a slow painter (fp8 without Lightning, three shapes) was stopped in its second picture by a cap on the whole run, and only the square came; now a painter is stopped only when it has said nothing for ten minutes while it loads, five once it paints, and its run says so.
- Fixed: the Artist's Stop showed with no run going.
- **A reference picture to paint from**, as InvokeAI's image to image: dropped, pasted (Ctrl+V), chosen from a file, or the stage's picture «As reference»; «How much it may change» from 0.2 (nearly as it is) to 1.0 (anew); «Again» paints from the run's own.
- **A mask on it** (inpaint): «Mask…» paints over the picture what to repaint (Paint, Erase, the brush, Invert, Clear); the rest of the picture stays exactly as it was.
- **The mask's options**: Grow, Edge (its softness), Soft (differential diffusion: a grey edge changes only in the last steps, no seam) and Grain (the kept part takes a share of the new paint, its grain sewn to it); Qwen-Image 2512 masks, paints from a reference and paints around through the same steps as Krea 2.
- **Paint around it** (outpaint): each shape holds the whole picture in its middle and paints the edges anew, without a seam: a square cover into a 16:9 for a video or a 9:16 for a short.
- **Two pictures compared**: the stage's «Compare…», then the other one picked; one over the other under a divider (the pointer, ← →), or side by side (S), swapped (X).
- **The take's cover as the reference** at a click: with «Paint around it» a square cover becomes a 16:9 for the take's video or a 9:16 for a short.
- **The trash in the room**: a Trash look beside Runs and Gallery, each trashed run with its pictures and Restore.
- **Pictures picked and put aside**: Ctrl (⌘) + click picks, Shift + click a range, a bar stars them or trashes them at once; the stage's Trash for one; the Trash look brings them back, one or all. The shapes and the star drawn, the sizes in the tips.
- **Upscale**: the stage's Upscale… makes a picture 2 or 4 times as large with an upscaler from `artwork/upscalers/` (ESRGAN, DAT, HAT, SPAN…, read by spandrel, MIT), in tiles, as a run of its own; the model picked is kept, Again upscales again.
- **The Qwen painters fetched**: Engine → Models and LoRAs has a Qwen painters row: Qwen-Image 2512 at Q4 (31 GB) or Q6 (34.5 GB) with Lightning's 8 steps (Apache-2.0), and Qwen-Image 2.1 (33.1 GB) with its research licence said in the question; `heresy/fetch-heresy.sh --qwen 2512-q4|2512-q6|2.1`; Pinokio's More models takes 2512 by the card; the Artist names the painters not here yet.
- **Fade in…** beside End at…: the take's first seconds rise from silence (2 s unless asked otherwise), from its kept latents, as a new take; the engine's `fade_in`, End at's fade mirrored.
- **Loop…**: 1, 2, 4 or 8 bars of a take on its score's bar lines, cut by the lab from the take's own WAV with a 30 ms seam crossfade (played round, the end runs into the start), saved as a WAV named with its bars, start, BPM and key.
- **Lightning, a switch**: Qwen-Image 2512's Lightning is a switch with its strength beside it; a fine-tune paints without it by default (30 steps, guidance 4: finished realism), the GGUF painters with it (drafts, smaller cards); guidance shows only without it; without its file there is no switch, and the lab refuses it.
- **The score asked about**: Generate with a score in the form asks first: on it, or a new one; the score remembers the adapters and music strengths that wrote it, and a line under it (and the question) says when those on now differ; in Full the score stays open while it holds one.
- **The bar and the log**: the Trainer's tab in the middle between the logo and the workspace; the server log with the cards 920 px wide, their column 390 and their numbers of one width (the frame no longer jumps); its outer edge drags it up to 1200 px.
- **Seed modes**: beside the Creator's music and sound seeds and the Artist's seed: Random (−1), Random fixed, Fixed, Next, Previous; Next and Previous move the seed past those a run used.
- **The Artist's room, tidier**: its header «Художник» in Russian as its tab says; Draw with a tip of its own, its word centred in capitals; the painter's and the fine-tune's choices the row wide, never narrower than their names; a progress bar under Draw; Upscale by **2K** and **4K** (the long side 2560 or 3840, the size exact), no factors to type.
- **His samplers and schedules**: ER-SDE, RES 2s and 3s with their ODE twins, Heun++ and the exponential Heun (exp_heun_2_x0, and its SDE) beside Euler and Euler SDE; Beta 57, KL optimal, SGM uniform and Bong tangent beside Simple, Karras, Exponential and Beta: the studio's own, from the methods' papers and ComfyUI's formulas (RES4LYF read for its mathematics only); the form says what each costs and times the run by it; the warning under the sampling says what two matrices showed: with Lightning, Karras, Exponential and KL optimal can paint the subject twice; without it, Euler SDE paints Qwen soft.
- **The adapters together**: from two adapters, their strengths' sum on the Creator's road (green to 1.2, amber to 1.8, red past it); dragged, it moves them all, each in proportion.
- **A picture's menu**: a right click on any picture (a run's, the gallery's, the stage's, the one over the page): over the page, to the stage, to the form (or all of it: painter, fine-tune, sampling, adapters), as reference, compare, set as cover, upscale to 2K or 4K, star, pick, copy the prompt or the seed, download, the file in a new tab, its run, the trash.
- **Delete for good** in the Trash look: each run and each picture put aside, and Wipe out for all of them, asked first; the covers taken off the takes wait in the library's Trash (Art).
- Fixed: Qwen-Image's text encoder read the prompt on any card of 20 GB or more and, with something else on a 24 GB card, could run out of memory there; it reads it on the card only when the room free holds it, else on the processor.
- Fixed: an fp8 run with three adapters waited for ever for a card a few MiB short; an empty card takes a job its estimate fits less 512 MiB, and a job no card can take is refused at once.
- Fixed: steps typed past their range were shown at its edge but kept and sent as typed («steps: 4 to 16 for this painter with Lightning» with 16 on the screen); Guidance stood beside Lightning on (a box's own display beat its hidden).
- Fixed: a Qwen-Image 2512 fp8 fine-tune was not sent when the sampling was the user's own, and the Artist refused to draw.
- **The buttons under the picture stay over the player** on any window: the picture gives up the height of its lines and buttons (with a three-line prompt on a 2K window they fell under the player).
- **The stage keeps its frame** from the queue to the picture: it no longer jumps when a run begins to paint or ends.
- **LoRA adapters in the Artist**, up to four, each at its strength, picked from a library of the painter's family in `artwork/loras/` (its folders the groups, the pictures beside the files on the cards), their trigger words a click into the prompt; **Look up on Civitai** by each file's SHA-256 alone, the answer kept beside it; what ComfyUI's LoRA Manager or Stability Matrix wrote is read too. A kohya file is renamed by the painter's own layers (diffusers took two of nine such files without a word and reached no layer); an adapter for another model stops the run, said.
- **Qwen-Image 2512 and 2.1 as painters**: 2512 (Apache-2.0) from a GGUF at Q4 (a 16 GB card) or Q6, or an fp8 fine-tune from ComfyUI's single files (24 GB), with Lightning's 8-step adapter, about half a minute a picture after some two minutes of loading, a reference painted from or a mask repainted; 2.1 under the Qwen Research Licence, said in the room (not for commercial use), edits a reference by the prompt's words. The choice holds the painters whose files are here; the Artist's environment on diffusers 0.41 (Krea checked on it).
- **Sampling** under the painter: the steps within the painter's range, Euler or Euler SDE, the schedule (Simple, Karras, Exponential, Beta), and for 2512 Lightning's strength (0 turns it off) and the guidance; kept per painter, the time estimated from them.
- **A painter no card here can hold is refused at once**, with the numbers and the painter that would fit, instead of waiting in the queue for three hours; an artwork that waits says why (the card's memory and what it needs); a volley of artworks ends at the first refusal.
- **The painters' rooms measured again** with the prompt writer before them: Krea 2 Muse Q4 12.6 GB, SDXL 14.2 GB, Q8 17.4 GB; Krea 2 Muse Q4 is the painter on a 16 GB card (SDXL needs more, not less).
- **The prompt writer counts as here** only when every shard of it is: a download cut short no longer shows as complete.

### The Librarian

- **Trash (Art)** under Out of sight: the Artist's runs in the trash, the pictures put aside and the covers taken off the takes (by a redraw, by Remove, by a new cover) in one list, each with its picture and what it weighs; ticked, given back (a cover to its take, the one it has kept in its place) or deleted for good, asked first; a frozen workspace's covers stay.

### The LoRA Trainer

- **A run's log** is as wide as its lines and stands beside the server log, never over it; the Trainer's own, not shown in the other rooms.
- **The two curves one under the other**, each the whole width, by a button beside The log; remembered.
- **A finished run goes on to more epochs** from its ⋯ menu: the same set and knobs, from its last save and the optimizer's state (the studio's own trainer).
- **The guide explains every field of the form**, and the music half's three knobs from the trainer's own loss: AR weight decides whether the music half learns, the anchor counts as a share of the weight, AR speed is its throttle; what was measured, and what to turn when. The knobs' tips say the same; the rank's share and size are the first line of its tip.
- **Male and female drawn** (mars and venus, as in the Creator) in the voice's chips and beside each folder and set: the text signs sat off the line.

## 2.0.0-rc4 · 2026-10-10

The fourth release candidate, cut as a whole: everything the studio does today, the Artist room as it stands among it, and what reproducing the install under Pinokio on Ubuntu 24.04 showed, made whole. The models the studio used to convert on every machine come converted now, from [goldhub/Ruach_Studio_Models_v2](https://huggingface.co/goldhub/Ruach_Studio_Models_v2), and the install fetches no checkpoints (HERESY 1169, patches 1268–1290). The Plenio score editor in the Refiner and the Artist's further tools go on toward the next candidate.

### Everywhere

- The unfolded server log 180 px narrower with its cards (720 px; tall 980).
- **TODO.md**: everything planned and wished for, in one list, kept up to date.
- **Nothing from the internet in the page**: abcjs (6.7.1), which draws the staff, is inside the page now, and the page's fonts are served by the studio itself (their Latin, Cyrillic and Greek). `heresy/tools/check-vendored.sh` says when a newer abcjs is out.
- **Raleway, Roboto and Lato** join the studio's own fonts in Engine → Appearance: ten now.
- **A sound when a run ends** (🔔 in the player, on by default): two notes up when a song, a score, a new version, the Artist's pictures, a Refiner's chain or a LoRA's training is done (a queue of runs once, when its last one ends), two down when one fails; none over a new song that starts playing by itself. As loud as the player, silent when it is muted.
- **Paragraphs with air between them**: a tip's lines, the guide's items and the cheat-sheet's «How the probes were made»; the lyrics' box untouched.
- **The veil**: OSEM and its words a fifth larger and further from the logo; the loading line at the foot, 160 px above the floor.
- **Untranslated words keep their s**: the catalogs' pattern for seconds («12s») took any English text ending in s, so a string not yet translated lost it («The studio's 💎 set с»); it takes a number only now.
- **Ctrl+N** is New song where the page is handed the key (Pinokio's window); a browser keeps Ctrl+N for its own new window.
- **The take's menu in the player**: a right click on the player's wave, its picture or its title opens the take's menu, as in a list.
- **Sections on the wave** (from SUNO v6): the player's wave shows the take's sections from its score (a thin line at each start, its name at the foot); a click by a line goes to the section's very start; the time under the pointer names its section.
- The logo's words and the icon's letter ready for the languages planned next: French, Portuguese, German, Japanese, Chinese.

### The Visiting Card and the README

- Six rooms counted, the Artist among them; each language's page wears its own icon (Р for the Cyrillic names, Π for the Greek).

### Creator

- **The lyrics' keys**: Alt+E lifts the lyrics over everything and puts them back; Shift+Tab over them puts them into the lifted form, the cursor in the lyrics; the Alt+K marks come back with their text after a reload or a take loaded.
- **Find and replace** in the lyrics, the style and the Writer's boxes: **F4** or **Ctrl+H**; Enter replaces the match in hand and goes on, Ctrl+Enter replaces them all, one Ctrl+Z takes it back; **Aa** (Alt+C) finds only as the case is typed.
- **The lyrics as plain text**: beside ⤢, one button saves them as a `.txt` named by the Title, the other puts a `.txt` in their place (asked first, Ctrl+Z brings the old words back; a file that is not UTF-8 is refused out loud; an empty Title takes the file's name).
- **A second and a third tag on a line**: a «[» after a line's tag gets its space by itself and offers the tags that are no section (who sings, Break, Silence); the tag stays on its line.
- **The voice's gender at a click** (from SUNO v6): ♂ and ♀ in the Style's head put «male vocals» or «female vocals» into the Style (in place of the other gender's word, else before the BPM); the lit one takes its tag out; one Ctrl+Z gives the Style back.
- **Ctrl+S and Ctrl+Shift+S** keep everything now (the song in the form, the Writer's open document, the settings), never the browser's Save page; **F5** asks only when something was typed since the page came or since Ctrl+S, and reloads at once otherwise.
- **Recite in sixteenths**: where eighths would leave lines out (a rap of 120 lines on a 2/4 score), a syllable is a sixteenth, as rap is said.
- The Writer's document in hand a chip on a line of its own under the Writer's row; the Score's tools right after its tabs, so the full screen stays on the row; the LoRA strength over the pointer at 14 pt.

### Writer

- **The documents list as wide as you drag its edge** (kept; ← → from the keyboard, a double click for its own width).

### Artist

- **Three columns**: the prompt and its knobs | the stage (the run being painted develops there, else the picture picked in the library, its run's data and actions under it) | the library; the outer two as wide as their edges are dragged. A click in the library picks a picture for the stage; the stage's picture opens it over the page.
- **Draw is Stop while a run waits or draws**: a waiting run leaves the queue, a drawing one ends at once, the pictures it finished stay; no second run is started meanwhile by a double press.
- **The gallery in even tiles**: equal columns filling the library edge to edge, every tile the same box (square, or the shape's own when one shape is shown), each picture whole in it.

### Librarian

- No peek in the corner on hover: a take's style and lyrics are a click away, in its sheet.

### Install and Pinokio

- **The converted models come converted**: the legacy and blend decoders and the sixteen sliders are fetched as GGUF from [goldhub/Ruach_Studio_Models_v2](https://huggingface.co/goldhub/Ruach_Studio_Models_v2) at a pinned revision (1.3 GB, byte for byte what a conversion of their pinned sources makes), straight into `models/` and `sliders/`; nothing is converted on your machine and no checkpoints are fetched, so `checkpoints/` leaves the repository (what lands there later is what you ask for: the style listener, the trainer's base).
- **The downloads made whole** (the first install through Pinokio, on a 16 GB laptop card): a download that fails says why and is tried again after half a minute; a folder or a file a download left unfinished goes on at the next run; the sliders no longer pull their source repository's 4.1 GB in 974 files, whose burst of requests earned a 429 that failed Whisper and the upscaler after it.
- **The LoRAs come with the install**: the Kit's library (11 adapters from 8 repos) and the studio's own (six voices, the duduk and the shofar), each under the name the 💎 sets' takes use.
- **BF16 beside Q8_0**: Pinokio's **More models** (or `heresy/fetch-heresy.sh --backbone BF16`) brings the full backbone to a card the install gave Q8_0.
- The install's log says YuE2's models are m-a-p's; Pinokio's own files beside its scripts and `.venv-art/` stay out of git, so **Update** keeps working.

### Engine

- **Folders**: where your work lives (the songs with the fetched workspaces, the trash, the Artist's pictures, the Writer's documents), what each holds and the room on its disk; **Move…** to any folder or disk, planned first and done on a second yes (on another disk copied, checked, then switched; the old copy kept until you remove it); **Back home**; **Link again** when a disk comes back.
- **Memory within N GB**: Auto for the whole card, or Auto within N GB (a laptop's desktop and browser keep their gigabyte or two: 14 of 16); the Compute card says where BF16 comes from when it is not here.
- **Models and LoRAs**: what the install brings, part by part (the extra decoders and the sliders, Whisper, the stems' models, UniverSR, the LoRAs), as its last run found it; a part not whole lists what is missing and is fetched again from here, a download cut short going on where it stopped; the extras (another backbone, the style listener, the Artist's painter, the trainer's base) each with its variants and sizes, asked first. When a backbone, a decoder or the sliders came, **Restart the engine** (LoRAs it reads each time).
- Engine → Updates no longer shows **Update** and **What's new** when there is nothing new.

## 2.0.0-rc3 · 2026-10-09

The third release candidate: the Artist room in an early preview, Pinokio on Linux, and what two days of the rooms' audit asked for (HERESY 1169, patches 1199–1267).

### Everywhere

- **Fewer tips**: none repeats a take's own words (the player's title shows no style on hover any more; a queue's name, a VAE tile's repository, a preset's text), a button's own label («Refine») or a sign everyone reads (like, dislike, the star; their names stay for a screen reader).
- **The player in two rows where songs are heard and compared** (the Creator, the Refiner, the Librarian), in one row in the Writer, the Artist, the Trainer and the Engine, and in the Creator while a frame is lifted or the lyrics are over everything (from 1660 px; below it one row everywhere, as before).
- **The player comes back after a reload** (F5) with its take and its place, and plays on where the browser lets it; kept in this browser as it pauses, seeks and plays, never in the settings file.
- **A lifted frame's larger text fits its selects**: the key, the Writer's and the profile's grow with it (their widths in em), the profile's buttons go to the next line rather than squeeze it; **the LoRA notes their own sign**, a short list, not a second i beside the section's.
- **English headings in title case**, by the rules for headings: the page's (Supply Your Own Score, Cover or Remix, Score Planner, The Song Now…), the guide's (Ruach Studio · The Guide), the README's and these notes'; the other languages keep their own rules and translations.
- **The guide by F1**, and larger: F1 (or Shift+F1) opens it on the room you are in and shuts it, the browser's help kept away; the window 10 % wider and taller, its own −, + and ⟲ for the text and ⤢ for the whole screen (kept in this browser).
- **A tidy right-click menu**: no hint written in its rows any more (they cut the names, *Redraw…* read *R…*); an item's hint shows beside the menu, level with it, when it is pointed at or reached by the keys.
- **The signs drawn**: the (i) of a tip is a drawn i with no circle, smaller, grey with a third of the theme's own colour, so it no longer looks like a button; the ⚠ of a warning (in a tip, under a field, in Whisper's report, the cheat-sheet, the guide, the LoRAs' notes) is a drawn triangle instead of the emoji font's yellow one.
- **No paragraph cut short any more**: the hints, the guide, the cheat-sheet and the rooms' notes flow to the edge of their box (they stopped at 62 to 150 characters, and half a 2K screen stayed empty beside them). The docs' paragraphs are one line each, as a viewer wraps them.
- **The songwriting instructions** no longer break thirteen of their sentences in the middle.

### Creator

- **A score the page puts into the form shows its rows at once**: a take loaded into the form, Edit score or an example, and Recite and the voice shift are there and MIDI lights (they waited for a key pressed in the score).
- **The profile's button says Save.**
- **Full plan by default** (Direct was, since rc1), and New song comes back to it; **the score's Max tokens up to 8192**, its default still 6144 (what the score takes, the music cannot have: the shared window is 24,576).
- **Create ABC Score** (once *Plan score only*), in every language: live in Full and Melody whenever the form is, a draft restored on load included (it stayed greyed there); with a score in the form it asks before writing over it.
- **The lyrics over everything: − and + scale the text alone**, its line numbers with it; the box, its buttons and the meter stay four tenths larger than the form.
- **A lifted frame's text up to +6 pt** (three steps of 2), and the fields and lists grow with it: Title, Style, the selects (they took their size from outside the frame).
- **The take's tools fill the column**: Download, Refiner and Files share its width equally, Make again under them; a group that wraps in a narrow column takes its row whole.
- **A LoRA's strength over the pointer** while it is on the slider or drags it: 16 pt, exact (0.875, where the number beside shows 0.88), framed in its road's colour; the label's tip stands aside meanwhile.
- **The Instrumental adapter stops at 1.0** on the music half, which is where it starts (its own limits in loras/sources.json): past it, its scores went astray.
- **The lyrics' numbers, marks and tag highlights stay on their lines at any page zoom**: at 125 % a line that fitted the box wrapped in the measuring copy (or the other way round) and every row after it stood one off; the copy now takes the box's own fractional width.
- **The server log stands at the left while a frame is lifted**, as wide as the room before the frame's bottom row allows (it lay over Generate), and back at the right in the room.
- **Recite the lyrics on a score** (the Score card, *Lay the lyrics on this score…*): the narrator of the studio's promo for any words. Each line on the bars of the score in the form, a syllable an eighth on a tone of its bar's chord (the nearest one, so the voice keeps its place), a breath after a comma and a full stop, the line's last syllable a quarter lower; each section of the lyrics on a two-bar phrase after a bar's rest, or a vocalise between them; the instruments, chords, key and tempo kept; the result a score the studio's strict reader takes. For spoken word, readings and rap over a bed.
- **Probes and Variations are drawn by the page**: a track filled to the thumb in the theme's accent and a round thumb, with no frame and no field behind them in any browser or theme (a desktop Chrome framed the native ones in the day theme).
- **End at…** (Make again): the same take ending at a chosen moment, its last 2 s faded out and nothing after it kept; from the take's kept latents in about ten seconds (the very sound up to the cut), else its music codes rendered again. For a song that runs on past its proper end: in Full the score may hold bars past the last words (on his rap, 27 bars of the same loop with the voice resting), and the engine plays them, dropping quiet and coming back loud.
- **Ctrl+F**'s mark and the tags offered under «[» stand on their letters along a line at any page zoom: in a lifted frame the mark ran left or right of its word, the more the larger the page.
- **What cannot be undone asks first**, and only when something would go: Remove score and an example score over another, Reset sampling, the sliders' reset, Reset output, Default look and fonts, Remove current artwork. At the defaults, or with nothing there, they act at once. (The deletes, the trash, the workspaces, Clear and New song asked already.)

- **The reload keys ask first** (F5, Shift+F5, Ctrl+R, Ctrl+Shift+R): what a reload takes and what it keeps, and with a song in the form *Save to the Writer, then reload*; Ctrl+F5 reloads at once.
- **Shift+Tab** is the Creator's frames key: a lifted frame turns to the other, none lifted lifts the form's.

- **One shape for the icon buttons**: framed, 2px corners; on hover the frame takes the hover colour and the icon grows a tenth (the player's buttons are as they were). **New song** is an icon now, a plus and a pair of notes, twice as wide.

- **Ctrl+Alt+1…9**: 1 Creator, 2 Writer, 3 Refiner, 5 Librarian, 7 Trainer, 8 out to your DAW, 9 the Engine; 4 is kept for the Artist room, 6 for a room to come (Ctrl+1…9 are the browser's own tabs; the desktop app will take them).
- **The take's frame over the room** stands as Compose's: ⇆ and ⤡ in its head's row, level with the take's buttons and ending where the frame's content ends, the take's icons Compose's size. **Style prompt** is **Style** now. The note under Generate (a run in progress…) stands on Generate's own row.
- **The take's head in the room**: ▶ and the take's buttons on the first row, ⤡ level with them at its end; the title under them on one line; its numbers under that. **👍 👎** beside ☆, the same mark as the player's and the cards'. Over the room ⇆ and ⤡ stand some forty pixels off the buttons before them: a click meant for ⇆ no longer lands on 🗑.
- **Probes × Variations** beside Generate, integer sliders (his names): Probes (the music written anew, a music seed each; the engine writes its batch at a time, the rest in further passes) times Variations (each probe's sound again, a sound seed each: time, hardly any memory), and how many takes that makes, in a column of its own. The old Takes field took 100 and quietly made 10. The music's Max length says the 24,576-token window in its own tip.
- **The questions' keys**: ← and → go along a dialog's buttons, Enter presses the one in focus (F5's among them).
- **The questions read larger** (title 20, words 17, buttons 15), and the Style's WARNING tip four points smaller.
- **Sampling and Denoising**: the Sound and output drawer is its lower section now, in the samplers' two columns; the two resets alike. The 💎 sets' window reads larger.
- **Frames over the room** take 97 % of the screen above the player (from 95); their heads and Generate's bar a little tighter.
- **The lyrics box as a code editor**: its lines numbered (a wrapped line once), **Alt+K** marks a line and **Alt+J** goes to the next mark (**Alt+Shift+J** the one before, **Alt+Shift+K** clears them; the marks follow their lines as you write), every [tag] under a thin amber layer; the Writer's lyrics too.
- **The tags under «[» go along a song's arc**, Intro to END. The ones a song has once and has already stay in their place, dimmed: ↑ ↓ and the pointer reach them to read what they are, and they are not put in twice.
- **More of mcedit in the lyrics**: **Alt+O** clears the marks, **Alt+L** goes to a line by its number, **Ctrl+Y** deletes the line, **Alt+↑** / **Alt+↓** move the line (or the lines selected) with its mark. *Keys* under the box lists the editor's keys and opens the guide there; the Writer's LYRICS label says them on hover.
- **The take's card compact**: its tools in framed groups (Download, Refiner, Files; Make again a row of its own); **Style** (once Prompt) over the lyrics on the left of a lifted take and the score on the right; a new take opens with Style and Lyrics folded.
- **Compose tidier**: the seeds stand first in Sampling and Denoising; **Instrumental** at the right of the planning mode's head, its words in its tip; the LoRA picker's notes in a tip beside the LoRAs' name (⚠ when one warns) instead of a paragraph under the list; the Takes head 7 px nearer its top.
- **The cheat-sheet asks where a name goes**: at the end of the Style on a line of its own, or in place of it (copied either way); a lyrics tag is only copied (in the editor, «[» offers them as you type).
- **The lyrics over everything**: ⤢ beside Lyrics lifts the box, 60 % of the screen and four tenths larger than the form, with its meter, numbers and marks, and its own −, + and ⟲ for the text's size (a tenth a press, two each way, kept in this browser); Esc puts it back.
- **The lyrics' brackets checked**: a «[» not closed, a «]» astray, a tag inside a tag or an empty one numbers its line red, round brackets astray amber, counted under the box (a press goes to the next); **Generate asks first** when a tag is broken (*Go to the line*, *Generate as it is*).
- **Viktor's conservative recipe for Russian** is a built-in profile: Composition low, Performance low, Style influence high, 32 steps with Midpoint (no speeding up, rap at a moderate pace); the guide has it under Sampling and Denoising.
- **Text size**: ☰ sets the whole page's text from −2 to +4 pt and a lifted frame has its own −, + and ⟲ on top of it (−4 to +8 pt), the layout as it is; each screen keeps its own.
- **The tags under «[»** write [End] as the official examples do (SUNO's [END] still counts as the song's end).
- **The take over the room in two columns**: what to do with it and its lyrics on the left; how it was made, its VAE and its prompt on the right; the score under both. A run's chain keeps the whole frame, and back in the room the card is as it was.
- **The cheat-sheet**: a click on a name still puts it into the Style, and now copies it too and marks it in the sheet; the click's words stand over the sheet (they stood under it, so a click looked like nothing happened); the sheet's text selects and copies again. The page's short messages stand over every window, and the pointer goes through them.
- **The tags under «[» in two columns**: the tags, and beside them, larger, what the one in hand is (in our words, after Genius's guide to song sections) and how often the 110 official examples write it; the box keeps its size as the list narrows. [Break] and [Inst] are gone (none of the examples writes them, and they did not work); Genius's sections none of them writes (Instrumental Outro, Skit, Segue, Part, Scatting, Yodeling, Non-Lyrical Vocals) come last, marked TEST.

### The Bar

- **The logo is the name alone**: RUACH and the STUDIO block, in each language its own words, without the figure: in the bar, on the veil the page boots under and in About; the bar keeps one height everywhere (the tall bar at the page's top is gone). The tab's icon is the name's first letter on the logo's cloud: R, Р for the Cyrillic names, Π for the Greek; the README's banner and the Pinokio launcher's icon with it.
- The rooms in the order a song goes through them: Creator, Writer, Refiner, the **Artist** (an early preview), Librarian; the logo in the middle, and the **Trainer** a pill of its own right of it (without the logo it follows the rooms).
- **Export to DAW** left the bar for ☰; the Refiner has it too, beside the take in hand and in its Stems.

### The Engine

- **The cards live, as btop draws them**: under each card in Engine → GPUs and beside the server log, its load and its memory a bar a second for two minutes, green to yellow to red, with its temperature and power; the unfolded log grows 300 px wider for a column of the cards that have a role, each headed by what it is given to (studio, training, lab jobs), the studio's card framed.
- **The settings file keeps what is not the page's** through the page's saves and its Reset; the lab knows where your own work lives (outputs, trash, artist, writer: a folder of the studio's, or a link of it to another disk), makes one that is missing at its start and links back one the settings file places elsewhere. The card that moves them (Engine → Folders) comes after this candidate.
- **One decoder on the card**: another VAE (Legacy, Blend) swaps out the idle one. Three side by side, each keeping a 3.1 GB working buffer, ran a 24 GB card out of memory on the third.
- **Out of GPU memory no longer kills the engine**: the sound half and the decoder renew their scheduler after a failed allocation and the run says why, with the card's numbers; the page then offers the next smaller copy of the model, honestly (Q8_0 near lossless; Q6_K the quality starts to suffer; Q5_K_M the music half hallucinates). Variations that do not fit at once go one at a time. The music's memory (its KV sets) is given back after a run of several probes: two long probes at once on BF16 had left 10.75 GB behind them for good.
- **Probes go together only as many as the card holds**, by the parts measured on a 24 GB card (the weights as their GGUF weighs, the music's memory per probe, the sound's by the length); the page says when they go one after another. On 24 GB with BF16: two of 2 minutes at once, one of 5.
- **Two or more sound variations no longer crash the engine**, on any copy of the model: flash attention's mask scan read one shared mask past its end from the second variation on (ggml-patches/0001, put on by build.sh; it could also cut a variation's attention short where it did not crash).
- **Transcription** (a score from the sound) no longer fails a whole score on a note or an interval its grid cannot hold, or on a measure whose beat numbers skip one: what the grid cannot hold is left out, and the log says how many; an odd measure is written with the beats it has. Ten of the 620 style takes had no score cover for it, and «Transcribe this take» failed on such songs.
- **Updates** (Engine → Updates): Ruach Studio's releases on GitHub against this version, on a schedule you choose (every day, week, month, never; release candidates too), *Check now*; when one is out, a window with what is new: ask, or update by itself when nothing runs, where the studio is a clone of its repository (elsewhere it says how to update by hand). After a day of use it asks how often to look. A new studio, and each update, offers the 💎 sets it lacks.

### Trainer

- **A voice's kind, measured** (Material): male or female and the register on speech, the range sung on singing, kept beside the songs and shown on the folder and beside the sets made from it; on speech a name for the set made of it, as the published voice adapters are named (`voice-ru-m-baritenor-117`): no person's name. ♂ or ♀ when the pitch alone cannot tell.

### Player

- **The status dot** (green while a take plays, the accent's colour while one is made), clicked while Compose is lifted, turns the lifted frame to the Musician's, where the take or the run it opens is.
- **⏪ and ⏩** go to the last or the next mark every 15 s from 0:00, ← and → to the marks every 5 s (Shift: 30); ⏮ on the list's first take goes back to its 0:00.

### 💎 Sets

- **Musical Styles complete in the bucket**: all 620 takes, each with its own score as its cover (it held 71, without covers); Instrumental Probe with the 66 covers it lacked.

### Refiner

- **The chain in the order of the work**: Debuzz › Upscale › Stems › Remaster › Upscale, then the checks. The stems are split from the debuzzed (and upscaled) take, no longer from the raw one after it all, and the remaster mixes them, so its preset and de-esser work in the chain too; the upscale at the end draws anew the top the stems and the remaster leave, and turns the whole file down if the new top passes the remaster's true-peak ceiling.
- **Stems four by default**, from the take or from a debuzzed or upscaled file of it (*Source*), each source with a set of its own; a REAPER project or a DAWproject takes the newest set of each kind.

### Artist (Early Preview)

- **The viewer's arrows over a slow link**: a step shows the next picture's thumb at once, at the size the full one takes, and the full one when it has come; it went on showing the picture before under the new caption while a PNG of 2 or 3 MB came through a VPN.
- **The Artist room opens** (Ctrl+Alt+4), an early preview: pictures for your songs from a prompt of your own, painted by Krea 2 Muse. **1:1** for the cover (1280²), **16:9** for a video (1920×1080), **9:16** for a short (1080×1920), any of them at once and all from one seed, so they come out as one series; one to four variations (the next seeds); Q4 or Q8. A press waits in the lab's queue for a card with room as the artwork does; the VAE decodes in tiles (Q8 at 1920×1080 peaks at 16.9 GB so, 22.7 GB at once, in the same 46 s); every picture passes the content filter. The runs stay in `artist/`, the newest on top: a picture over the page in its own shape, downloaded as PNG, or, when it is square, made the cover of the take in hand (the cover it had kept beside the take, the other letter of an A/B pair given it when it has none); a run's prompt and seed back to the form, the same again from a new seed, a run to `trash/artist/`. **From the take** starts from the prompt its artwork was drawn from.
- **A live preview** (on by default, as InvokeAI has it): the place of the picture being painted shows each step, from the noise to the picture, an eighth of its size and without the decoder (the Wan 2.1 VAE's latent-to-RGB factors, as InvokeAI carries them).
- **A gallery** beside the runs: every picture of every run in one grid, the newest first, by shape or starred, in three sizes; a picture opened from it walks the whole gallery, with ★, To the form, Set as cover and Download.
- **The room folds its Takes at first** and keeps its server log on the left, out of the way of the pictures.

### Librarian

- **Folding the workspaces keeps the columns**: the cards grow wider instead of one column more, so the eye keeps its place in the tiling.
- **The day wash over the cards at half its strength**: a slight glow of colour, no longer a grid of pink.
- **What the menu sends away leaves the choice**: after the trash, Hide, taking out of the workspace open, regenerating or a dislike, the bar of the checked lets those takes go and folds back into the pinned strip, as its own buttons did (three takes sent to the trash from the menu left it open, «3 selected»).
- **Filter** is a button at the end of the search row now (the search 240 to 320 px wide), and the filters a window of their own, as the workspace chooser: three groups of ticks (made · marked · has, with a note and with artwork among the marks), each with its icon and how many takes of the place, and how the ticked join: all (AND), any (OR) or none (NOR); Show says how many it will show, and the button how many are on and how they join.
- **The menu on a checked card acts on every checked take**: like, dislike, favourite, artwork (drawn one after another), the artwork taken off, workspaces, hiding, a ZIP; a line with a number says so. Drawing artwork for several and regenerating several ask first: «Human, … in one volley? Won't your graphics card waste away?» (in Russian, his own words).
- **A redraw keeps the old picture** beside its take, in artwork-removed/, as Remove does; before, a redraw wrote over it.
- **The bar of the checked** is one row of framed icons: the choice, the marks, the workspaces, the export, the trash at its end; each says itself on hover.
- **The 💎 workspaces** (the studio's public sets) stand at the tree's foot by name, and the 💎 … LoRA ones lowest of all.

### Writer

- **OpenRouter's models with their prices**, as you type: each suggestion with its price per million tokens in and out and its context; the chosen one's price under the field, and a name the list does not know said so; the quick picks with their prices in their tips.

### The Visiting Card and the README

- The heading in two lines, «Songs from words and chords / on your own machine», in all seven languages; the lines wrap without a one-letter word at a line's end or a lone word on a paragraph's last line; the lyrics editor shown, and its row in the honest table; the little story in the page's own language. The README's What comes next: what rc2 brought, and what is planned.

### The Guide

- **Two new tabs, in seven languages**: *Score*, YuE2's ABC read line by line (the head, groups and bars, notes and their lengths, chords, sections, time, the Vocal and Ins spaces, changing it in the studio, what the check refuses and why); *Voices on a Score*, how the promo's narrator and the women's vocalise came out of one take, each line timed to its scene.
- **Full or Direct**, in all seven languages: Viktor's word after a week of songs (Direct is SUNO's hit and miss; Full is the way for everyone) beside what was measured on his rap (the best take of all a Full one with his recipe; where Full fails it fails at the end, as a take is as long as its score; the 10–15 s after a song's proper fade are the score's leftover bars, not the guidance), and what to do with a Full take's end.
- **End at…**, the Librarian's filters and its menu on the checked takes, the redraw that keeps the old picture, the player's status dot: each where its room is told.

### Pinokio

- **A launcher for [Pinokio](https://pinokio.co)** (`pinokio.js` and `pinokio/`): Install, Start, Open the studio, More models, Update and Reset from Pinokio's menu, on Linux with an NVIDIA card, with Pinokio's own CUDA toolkit 12.8 where the machine has none. The work is done by bash scripts that run the same from a terminal; INSTALL.md › With Pinokio. Asked for in [#1](https://github.com/igrbible/Ruach_Studio/issues/1).
- **`build.sh` and `start.sh` take the CUDA toolkit the launcher found** (`RUACH_CUDA_HOME`; `/usr/local/cuda-12.8` when it is not set, as before), and `build.sh` takes ninja only when it answers: a pip wrapper left without its module had made cmake fail.
- **Engine → GPUs → Restart the studio says so where the studio is no service** (under Pinokio, or `./start.sh` by hand): it used to answer «restarting» and then «back», though nothing had restarted; the card is saved all the same.

## 2.0.0-rc2 · 2026-10-07

What a day and a night of making songs asked for (HERESY 1168).

### Everywhere

- The engine on **ggml 0.26.0**, with yue2.cpp's latest (ServeurpersoCom's ggml fork rebased on upstream: CUDA and Vulkan kernels and fixes; Windows build scripts for Visual Studio 2026). Measured on an RTX 3090: a two-minute song in 51 s, where the engine before took 54–61 s the same morning.
- **F5** during a run keeps its clock, and the run brought back lands in its workspace and plays when done; in the Librarian, F5 reads the library again and keeps the page, the music playing on (Ctrl+F5 reloads).
- **Copy** works on the machine's address (http://192.168.…): the browser has no clipboard API there, the page's own copy stands in.
- The short notes after an (i) are the first line of its tip.
- **Open** says what of a prompt file the form could not take in, and what it holds instead.
- **Windows 11**: [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md), through WSL2 (written from WSL's and NVIDIA's documented way; not yet run by us on Windows, and said so).

### Creator

- **Frames over the room**: the form and the take each lift over the room (95 % of the screen above the player, a fifth larger), a button to the other frame; Generate turns to the take's frame, Retake and Reuse to the form's; the player's clicks never fold it.
- **The VAE** is chosen in the **☰** menu, under the model; the Composer's VAE block is gone. **Another VAE in seconds**: every take keeps its acoustic latents beside its audio (about 3 MB for eight minutes), and a take's
  + Standard, + Legacy, + Blend decode them again with the VAE alone, about 2 s for two minutes (measured; the same VAE gives the same sound to the sample). A take made before rc2 renders its sound again, and its button says so.
- **The lyrics' meter**: each line's syllables against its group's ruler (verse and bridge one group, the pre-chorus, the chorus and every other section their own), what is in round brackets hatched after (it may be sung); under the box the lyrics' characters, syllables and lines, the tags, the brackets and the phonetic hand; the browser's spelling check in the lyrics' language; the box 16 rows growing to 26, drawn taller by hand it keeps its height.
- **Stress marks astray**: a mark (U+0301) off a vowel, at a line's start, after a space or a sign, on a consonant, doubled, or a spacing ´ in its place, in red; a word with two marks in amber; a button selects each in turn.
- **Ctrl+F** in the lyrics or the style finds in that box alone, in any keyboard layout and in a lifted frame; a stress mark, ё, and the phonetic hand's ע and Latin o and a do not stand in the way. A match under a lifted frame's Generate bar is scrolled into view (the mark never stands on the bar); words typed elsewhere in the box leave the view where it is, and Esc from the box closes the bar and leaves the cursor.
- **Tags under a «[»**: a «[» at a line's start in the lyrics (the Creator's and the Writer's) offers the section tags as a code editor offers its words: Verse, Chorus, Pre-Chorus, Bridge, Interlude, Break first, then Intro, Outro, END, then the rest; typed letters narrow it (a Russian or Ukrainian layout too), a number numbers the tag, numbered verses are offered the next; Enter or Tab puts it on its own line; Intro, Outro and END already there stand last, dimmed, with their line. Ctrl+Space opens it, and at a line's start types the «[» itself.
- **The meter by the sung sections**: a pause, a break, a silence, an interlude, a prelude or an instrumental cue inside a sung section opens no group of its own (the section's ruler goes on under it); a line of tags alone (`[Break] [Silence]`) is not counted, nor a tag inside a line. **A syllable by each language's rules**: Russian, Ukrainian and Belarusian one vowel letter, and as the meter measures the time a line takes, a word with no vowel (с, в, к, з, й, ў) and a stop closed against an affricate inside a word (глу-п-цо́в) are beats of their own, drawn lighter on the bar; Greek with its digraphs, diaeresis and glides; Spanish and Italian with their weak and strong vowels (their final e was taken for English and silent); English with its silent e, -es, -ed and -ing; Hebrew by its vowel points (ע and the shin's dot counted before); Chinese, Japanese and Korean one sign each (nothing before). The Latin words' language comes from the style, else from the lyrics' words.
- **The cheat-sheet's Lyrics tags**: the sections as the 110 official examples write them, counted; who sings; instrumental cues; the meta-tags; the phonetic hand. A click puts one into the lyrics.
- **Clear** takes the words (title, style, lyrics, score, seeds, loaded codes); **New song** the mode, sampling, sliders and LoRAs too; both dialogs say what stays.
- **Play this song** hides while a song is made and offers the finished one; the Score card of a take with no score holds only its from-the-sound button.
- **Max length** lives in Sampling, as the music's time (25 tokens a second) and with no lock; Sound and output has no length field of its own (the API keeps `duration`). **ODE steps** are **Denoising steps**; *Reset output* puts the solver back to midpoint too, and the solver spans two columns (its name whole, the two rows full).
- The **text profile** (a pasted text made ready to read) is off while the Creator's profile is music: it is for readings.

### Writer

- **Export all** and **Import**: the whole notebook in one file (every document with its versions, the takes made from it, the trash) and back; an import brings in what is missing and never writes over (a document that differs comes in beside its namesake as a copy).
- Its fields one height and dress; the API key wide, *Remember the key* beside it.

### Librarian

- ★ among the workspace's filters; the Takes' star drawn as the thumbs; a take moved to the trash leaves the player.

### Trainer

- The training lyrics keep **ע** inside Russian words: YuE2 sings it as a soft о/а.

### The Guide

- The lyrics' meter and the phonetic hand; Save, Open, Clear and New song; the VAE in the ☰ menu and decoded again in seconds; Ctrl+F in a box; the Writer's backup: in all seven languages. New words of the page itself are English only until the pass before 2.0.0.

## 2.0.0-rc1 · 2026-10-06

The release candidate: the alpha after three days of daily use and what that use asked for (HERESY 1167).

### Everywhere

- The page boots under a veil (the logo large, *Loading the Sound Heresy*, seven seconds at least); a test browser never gets it.
- **Cancel run** from wherever you are, in every room; the take frame at rest says *Smithery is Idle*.
- A field that refuses a value says why, in a note beside it (Guidance 1–4, sound steps 1–160, Max length, takes, peak clip); a number field cleared to nothing refills when you leave it, not while you type.
- What cannot be undone asks first (*Clear*, *New song*); tips show after 400 ms, the style chips' after 600 ms.
- The default look: *Scroll & Brick*, softer corners, the hover accent and its glow, Noto Sans with Noto Sans Mono; the day theme on #f8f9fa. The Creator, the Writer and the Refiner say in two lines what they are, beside their names.
- **Day and night follow the system** by default (☀ day · ☾ night · ◐ the system, its icon larger); a theme picked of the other kind than the system shows is a choice of day or night. The veil boots always at night; the rooms' names in capitals.
- **The workspace in hand** is a button in the bar: one click opens the studio's own chooser, every workspace and section with its count, a new workspace or a new section made from there. A song sent with none in hand asks first where its takes go. Names: 32 characters a level (a workspace, its section, the section's own).
- A tip no longer stays after a click; one reached by the keyboard stays while focused.

### Creator

- **Direct** by default (the model sings straight from the words; *Full* plans a score first, and *Plan* is off in Direct). Guidance (CFG) on one line, up to 4: measured, 1.4–1.6 is the steady ground, 2.0 moves more, 2.4 is the most that stays stable.
- The music's lengths in time beside their tokens, kept in step with *Max length*.
- **Play new takes**: a take made here plays when it is done. The Takes column hides a take you dislike (as SUNO does), stars a favourite on its row, and counts the workspace's own takes (the total under All Workspaces).
- The take card: Sliders over LoRAs, long names and values wrapped inside the card; an icon beside ☆ ✎ 🗑 leads back to the Librarian, the take's card found and flashed.
- Open, Save, Example and Clear beside **New song**; the Takes column's menu pins a take into the strip of the workspace it lives in (four at most).
- **LoRAs**: the sound half's strengths together on a slider of their own beside the music's (by ear, 2.0 together brought a heavy bass, 0.55 sounded right); an adapter of two files, music and sound, is one card (*both*); a right-click **mutes** one (left out of the run, its strengths kept) or takes one trained here out of the list (its checkpoint stays in its Trainer run); the adapters' **trigger words go at the style's end by themselves** when the song is made, never doubled.

### Writer

- **The style as tags** beside the readable one: short tags, the most important first, the tempo last, as an SD/SDXL prompt is written (YuE2 follows short tags best). *Into the form* puts the tags by default, or the readable style.
- **Saved briefs** by name, kept by the lab (every browser sees them); the writer and the model remembered; the request and its answer in the server log, OpenRouter's too; *Send the request to LLM* with its progress beside it.
- A request sent while the notebook has another document open asks first: put that one into the Creator and send on it, or send on the Creator's song as it is.

### Librarian

- Cards in whole rows, about thirty at a time; the bar follows the workspace opened; 👍 and 👎 filters beside the favourites (a dislike hides a take everywhere but under *Only the disliked*); the numbers in two lines.
- **Artwork** by **Krea 2 Muse** (Stable Yogi; GGUF Q4 from 16 GB, Q8 for a repaint), SDXL kept for the small cards; one artwork a take, shown at the card's full height and downloadable from the overlay; an artwork job waits for a card instead of failing.
- The search reads the workspaces' and sections' names too, and Ctrl+F goes to it; the peek is wider, waits 1.2 s for the pointer and opens downward with the whole style and lyrics; by day the cards wash from #f2edef to nothing.
- «Sourced for Regeneration» is never the workspace in hand (new takes go to its parent) and stays frozen, except to the regeneration that keeps the old takes there.

### Engine

- **Models auto unload**: the engine itself unloads the models idle from 15 minutes to 4 hours (60 by default), or 15 s after a song, whether a page is open or not.

### LoRA Trainer

- The last epoch is published under its number; the Runs column the window's height; the log in a frame at the page's foot.
- `lab/voice_kind.py`: a set's voice by measure (male or female, and the register from bass to tenor and contralto to soprano, by the speaking pitch; 140–175 Hz is shared, so there it asks), to name a voice adapter by its kind, never by a person.

### The Player

- The waveform on its own ground with its bars at 15 %, the player a little see-through.

### The Cheat-Sheet ♪

- Up to 1800 px wide, its texts 2 pt larger; its head in parts: the warning in a line, a legend of four, how the probes were made folded; the pictures said to be painted by an image model.

### Out of the Studio

- The README opens with the studio's banner, the website, GitHub, the guide and ☕ *Buy me a Coffee Machine*; it ends with a little story, in seven languages.
- The site, [ruachstudio.igr.bible](https://ruachstudio.igr.bible): the rooms, what makes it a studio, Ruach Studio and SUNO honestly, what you need (about 120 GB of disk with everything), what comes next, the licences, and the little story, in seven languages.
- **Six voice adapters** on Hugging Face (goldhub/Ruach_Studio_LoRAs `voices/`), named by the kind of voice, with their samples; the LoRAs and the starter sets open, and the 💎 workspaces' bucket (*💎 Voice Types LoRA* added).

### Languages

- Everything new in all seven languages: English, Russian, Ukrainian, Belarusian, Greek, Spanish, Italian; the browser's own language at the first visit. The cheat-sheet's older genre names stay English for now.

## 2.0.0-alpha · 2026-10-03

The first release under its own name: 166 changes over the Kit (HERESY 1001–1166). Stable in daily use on one machine (three RTX 3090) for its makers; *alpha* because it has not yet met other machines.

**Licence**: the code under the GNU AGPL, version 3 or later (a fork stays open); the logo, the name, and the audio and pictures published with the studio under CC BY-NC-ND 4.0 (`LICENSE-ASSETS.md`).

### Five Rooms

- **Creator · Writer · Refiner · Librarian · LoRA Trainer**, each with its own work, a bar that fits at any zoom, and **the guide** inside the studio (the `?`: every room, the DAW, the shortcuts), opened on the room you are in.
- **The player** at the bottom of every room: the waveform as one soft cloud, the take's artwork, shuffle and repeat, speed 0.50×–2.00× with the pitch kept, *play on click*, *play on*, media keys and the desktop's media panel, the time under the pointer, and a dot that beats while it plays.
- **22 themes** (day, night, warm, cool, high contrast), each giving its own tones and washes; lines that breathe (no hard line anywhere); the logo: RUACH, the winged woman out of a cloud, STUDIO; where the words do not fit, the same woman without them.
- **Languages**: the page whole in English, Russian, Ukrainian, Belarusian, Greek, Spanish and Italian (every room, menu, tip and message; numbers and dates in the language's own way; the guide too), at a click in the bar, kept with your settings; the logo's words follow: РУАХ СТУДИЯ, РУАХ СТУДІЯ, ΠΝΕΥΜΑ ΣΤΟΥΝΤΙΟ…
- A tip for every control that needs one; text selects only where it is meant to (fields, the log, the guide), and Ctrl+A only in a field.

### Creator

- **The kitchen**: the form in two columns of cards, the words beside the machine, over two thirds of the room; the take over its takes in the last third (compact cards, a line to drag, folded to a strip at the right); every LoRA not in use behind «Add a LoRA»; the player in one row; closed parts that read as closed.
- Songs up to **8 minutes** (speech up to 15), sound steps up to 160, four sound solvers, sampling tips that say what goes wrong; the form survives a reload; profiles (*Music*, *Speech*) and a library of styles.
- Planning modes: **Full plan** (melody and chords first), **Melody only**, **Direct**; your own score; covers from a take or a recording (the transcriber); **regenerate from here**; sound variations of a long song.
- Keys: the song's key beside the title, transposition, the score checked before the music is built on it (**Babel in the score**: a broken score stops the run before anything is spent on it, and says why).
- VAEs (standard, legacy, blend), sliders, LoRAs with strengths in safe zones and the music half's strengths together on a slider of their own (it moves them all, each in proportion); each voice or genre slider's **curve** through the song (flat, an arch, or drawn by hand: flares and fades); the instruments cheat-sheet ♪ (200 instruments with what YuE2 really plays, the ear's verdicts in English, and the prompts of the probes kept).

### Writer

- Songs as documents with versions and the takes made from each; text profiles; a writing room on a chat server of your own (vLLM, LM Studio, Ollama) or **OpenRouter** (Qwen and DeepSeek picks), which says where its words come from.
- The writing room knows what this engine plays: the instruments heard and not, those only the studio's LoRAs play, the styles kept by ear with their words, the voices given and not, and how to ask for speech with no singing.

### Refiner

- Numbered steps: **Spectrum · Artifacts · Debuzz · Lyrics check · Stems · Remaster · Upscale**, and **Run the chain** for all of them in order. Stems (BS-Roformer, htdemucs_ft), the Debunker v6 remaster (432 Hz, loudness in two passes), UniverSR upscale, debuzz of the VAE's 25-frame buzz, a lyrics check by Whisper, karaoke timing (LRC, SRT), trim to the text. The remaster's preset and de-esser act on stems, and are off where they would not.
- Everything made from a take hangs under it as a tree; progress shows where the eye is (the room's head, the step's own block, its tab); each step shows what it made; the column lists the takes refined, the newest first.
- **Import** a track from elsewhere: every tool works on it.

### Librarian

- Every take as a tile or a row (past 2K more tiles rather than wider ones, 6 at 4K, and the rows in two columns), searched (`*`, `?`), filtered, sorted; workspaces (locks, pins), the take in hand's workspace in the bar, hidden takes, the trash that gives back.
- Selection as in a file manager (a click, Shift, a rubber band, Ctrl+drag), the keyboard (**Ctrl+A, Esc, Delete, Ctrl+Z**) and **undo** for moves, pins, marks and the trash; like, dislike, favourite, notes; the peek, the sheet, the **datasheet** (all a take was made with, LoRAs and their strengths, its score drawn, or written from its sound).
- **Export to DAW** from any take's menu (REAPER project, DAWproject), your own DAW first.
- **💎 sets from Hugging Face**: the studio's approved probe sets (instruments, the LoRAs' A/B, styles, voices), each fetched on your word into a workspace of its own, locked; one of that name here is never written over unasked: rename yours first, or restore the original.
- **Freeze** a workspace you keep but do not use now: its takes are heard and read, never changed, moved or thrown away, and they leave All Workspaces and the search until you unfreeze it.
- **Artwork** for a take, asked for: a small model writes the picture's prompt from the style and the words, an SDXL model paints it; it shows in the player, on the card, in the media panel, and in the MP3 as its cover; a click shows it whole over the studio (‹ › through the cards' pictures), never in another tab. An instrument's picture is looked at by Omni and drawn again when its instrument is missing; the painter is any SDXL finetune behind `artwork/SDXL-Artwork-Model`; *Remove current artwork* keeps it beside the take.

### LoRA Trainer

- LoRA adapters for YuE2 from your own songs: the material, the set (captions by the listener, Qwen2.5-Omni), the knobs with the rank said in plain words, a VRAM gate, runs in units of their own, telemetry, the epochs worth hearing first, starter sets (GTSinger RU and EN samples). Our own trainer, needing nothing of AI-Toolkit.

### Out of the Studio

- **DAW**, two ways out and only two: the mixed track as it is (WAV, FLAC, MP3), or the whole take into your DAW: the **REAPER project** (the mix, every stem, the score as MIDI, the lyrics on the timeline, the sections as regions, checked by REAPER itself) and **DAWproject** (the same for Waveform 14, Bitwig, Studio One, Cubase, checked against its schema). REAPER can also make a song or bring a take from inside itself (`extras/reaper/`), the selected MIDI items as the song's melody: sung as written, the tempo, meter and key read or guessed, and said.
- **The API** (`/api/v1`, OpenAPI 3.1) for scripts, DAWs and agents on this machine and its network, and an **MCP server** for agents (`extras/ruach-mcp.py`, twelve tools); the Refiner's steps are on it too. A MIDI file can be a song's melody there as well (`midi_b64`, or `midi_file` for an agent), its score checked before anything is spent.
- **Compare** every version of a take in one player (the original, debuzz, remasters, upscales, stems), switching at the same second, as SUNO does.

### The Machine

- **The Engine page** in rows that fit a 1080p screen: server and hardware beside the log, compute beside the GPUs, the look beside the Writer, the VAEs beside the LoRAs (trained here apart from those from Hugging Face); a room in the bar leaves it, asking first about GPU roles not saved; the credits in three columns under their makers' marks.
- **What runs and what waits**, under the engine's lamp in the bar: the songs (the regenerations too) and the lab's work on the cards (artwork, stems, upscale, Whisper); a waiting one comes off its queue with its ✕, pressed twice.
- **Which card does what**, and a GPU guard: a job goes only to a card that has room for it, never to one a heavy program of someone else holds; the studio's own processes come first; Engine → GPUs shows its verdict on each card. Unload in the bar. Whisper runs on the CPU when no card can take it.
- The services come back after any fall; the line to the studio is watched (a far studio is answered at once and confirmed after); this machine and private networks only; settings on disk; one Python environment.
- The Kit's own tests pass against this page (the page test with the mock, the real server on the CPU), the real one never touching the user's lab; `heresy/tools/check-player.mjs` checks the player.
- `build.sh` builds the page (read from disk by the server, with no copy inside it and nothing gzipped: a reload shows it) and the server when its C++ changed; `fetch-models.sh` fetches every weight, pinned and checked (the listener and the artwork models when asked).
