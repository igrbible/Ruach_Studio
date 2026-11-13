## Narrator

The Narrator, the room after the Videographer, turns a text into a voice: a chapter, a book, a radio play, a podcast, a voice over a clip. It reads in one steady voice or as a dialog of several, hears each piece it read, and puts the take into the Library as it puts a song.

![The Narrator by day: the text and its voice on the left, the runs on the right](guide/reader.png "The Narrator: the text, the voice, the engine, the runs")

### What It Does

**Mode** gives two ways to read. **Narration**: one voice reads the whole text, cut by **sentences** (pieces of about two hundred characters, a blank line a longer pause) or by **verses** (a line a piece, its verse number and Strong's numbers not read); the first piece that lasts 2.5 s becomes the reference of every piece after it, so the voice holds through a chapter. **Dialog**: a line a turn, written `Name: words`, a voice for each speaker; a line without a name goes on the turn before it.

**Read** starts the run. It waits in the queue as the lab's other heavy jobs do, its bar above the player and its lines in the log. Its card names the quant and the time left while it reads; when it is done, the length, its speed, what Whisper heard and the loudness.

### The Engine: Drama 3

The Narrator reads with Fish Audio Drama 3 (35B MoE, 3B active) through audio.cpp, from GGUF quants in `models/narrator/drama-3-gguf/` with its LICENSE and NOTICE beside them; without them the engine does not load. It reads Russian, Ukrainian, Hebrew, Greek, English, Spanish, Italian, French, Portuguese, German, Japanese and Chinese. An engine of your own plugs into `user/reader/engines/` with its own `engine.json` and appears in **Engine** beside it.

### Quants and Their Speed

![The Quant select and the line under it](guide/reader-tier.png "Quant: what reads, where, and how long this text will take")

**Quant** says which quant reads and where. **Auto · quality first** (the default) takes Q8_0 wherever it fits: 20 expert banks in RAM on a card with 23.6 GB free, else all 40 banks in the machine's memory on a card with 7.4 GB free and 40 GB of memory free; then Q6_K; Q4_K only where neither fits (a small card, little memory) and on an Intel card. **Auto · speed first** takes Q4_K first. Both choose by the memory free when the run starts; a quant named in the list keeps to it. Q8_0 is the default because it came out cleanest to the ear: in the raw test of 09.11.2026 no take of Q8_0 was marked wrong in 20, of Q6_K one in 20, of Q4_K seven in 50, every mark at one joint of one sentence. The setup fetches Q8_0 (41.1 GB) when the machine's biggest card has 24 GB or more, else Q4_K (24.9 GB); on a smaller card `bash tools/narrator-setup.sh --quant Q8_0` fetches Q8_0 beside it. Without it Auto reads in the quant that is here. The line under it says what would read now and on which card, a second of speech in how many seconds, and how long this text would take with the model's load.

Measured on one RTX 3090 on 09.11.2026 with a Russian piece of 27 s. RTF is the seconds it takes to read a second of speech; Whisper heard every letter right unless the row says otherwise:

| quant | expert banks in RAM | on the card | RAM | RTF | how it was measured |
|---|---|---|---|---|---|
| Q4_K | 4 | 21.5 GiB | 3 GiB | 0.62 | the card alone |
| Q6_K | 16 | 21.9 GiB | 11.2 GiB | 1.16 | the card alone |
| Q8_0 | 20 | 23.0 GiB | 17.3 GiB | 1.37 | the card alone |
| Q8_0 | 40 | 6.9 GiB | 33.2 GiB | 2.43 | the card alone |
| Q4_K | 20 | 15.7 GiB | 9.8 GiB | 1.34 | beside a dataset job |
| Q6_K | 28, cuda_perf | 13.8 GiB | 18.6 GiB | 1.74 | beside a dataset job; one word misheard |
| Q4_K | 40, cuda_perf | 7.3 GiB | 18.3 GiB | 1.75 | beside a dataset job |
| Q6_K | 40, cuda_perf | 7.3 GiB | 26.0 GiB | 2.46 | beside a dataset job |
| Q8_0 | the processor alone | — | 44 GB | 7.0 | the processor |

The rows beside a dataset job are pessimistic: the card's compute and the processor were shared with it, and a card of its own reads them faster. **Q8_0 · 20 expert banks in RAM, 40 on a shared card** keeps to Q8_0: 20 banks in RAM on a card with 23.6 GB free; when the card is shared, all 40 in the machine's memory; with **Auto** as the card, the processor last. The first reading loads the model; on a card it stays loaded between runs.

### On an Intel Arc or Another Vulkan Card

Drama 3 reads on an Intel card (Arc) through audio.cpp's Vulkan build, in a tier of its own: Q4_K with 28 of its 40 expert banks in the machine's memory, about 11 GB on the card and 16 GB of memory free. Measured on an Arc Pro B50 (16 GB) on 12.11.2026: a second of speech in 3.3 s, the model's load 53 s. When the card's memory runs short, the engine moves four banks more into the machine's memory and reads on. On an Intel card Auto takes this tier alone, and a quant meant for another card is refused there by name; Drama 3 never reads on the processor in the card's name: when the card cannot take it, the run says so. The Vulkan loader is shown Mesa's Intel driver alone, so the processor's software renderer is never taken for the card. For now the Narrator sends Drama 3 to the Vulkan build only on an Intel card; audio.cpp's Vulkan build runs on other Vulkan cards too, but the Narrator does not route them yet.

The system's packages, once (the Vulkan headers, the shader compiler glslc, the SPIR-V headers, Mesa's Vulkan drivers and vulkaninfo):

```
# Debian, Ubuntu
sudo apt install libvulkan-dev glslc spirv-headers mesa-vulkan-drivers vulkan-tools
# Fedora
sudo dnf install vulkan-loader-devel glslc spirv-headers-devel mesa-vulkan-drivers vulkan-tools
# Arch
sudo pacman -S --needed vulkan-icd-loader vulkan-headers shaderc spirv-headers vulkan-intel vulkan-tools
```

Check that the driver sees the card: `vulkaninfo --summary` lists it under Devices with Mesa's driver, as `deviceName = Intel(R) Arc(tm) Pro B50 Graphics (BMG G21)` and `driverName = Intel open-source Mesa driver`. A list with `llvmpipe` alone means the driver is not there. `bash tools/narrator-setup.sh --vulkan-check` says what is here and names the packages missing for your system.

Then the build: `bash tools/narrator-setup.sh` makes the Vulkan build by itself on a machine with an Intel card, beside the other one; `bash tools/narrator-setup.sh --build --vulkan` makes it alone, into `build/audio.cpp/build/linux-vulkan-release/`. It needs cmake and a C++ compiler, as the other builds do; the setup never installs a system package, it names it. Measured on Ubuntu 24.04 with Mesa 25.2 and Linux 7.0; the details are in `docs/NARRATOR-VULKAN.md`.

### Grades of the Quants

The Quant list paints each quant by the raw test of 09.11.2026: the first reading of two Russian pieces of 30 s (one with emotion tags, one plain), five seeds each, the Narrator's sampling (temperature 0.8, top_p 0.9), no re-read and no second seed; Whisper large-v3 listened for words inserted, dropped or swapped. **Green**, stable: no word wrong in any take. **Yellow**, medium: a word wrong in one take of ten; the Narrator's ear reads such a piece again. **Red**, undesirable: word errors in two takes or more, or a gross one; Auto never picks it, and its tooltip and the run card say so. Every card quant came out green, all 70 takes clean. Where the tensors are computed does matter, but the way a seed does: the same quant with the same seed, its experts on the card or in RAM (the lowest, middle or highest 20 layers), parts from the first 40–60 ms into another reading, while a run repeated on the same layout is the same to the bit. One seed shows one road of many: the word after «глубоко» in the blind set of 09.11 (all its takes on one seed) is a voiced insertion of 0.7–1 s, not a breath.

| quant | expert banks in RAM | takes with a word wrong | grade |
|---|---|---|---|
| Q4_K | 40 | 0 / 10 | green |
| Q6_K | 40 | 0 / 10 | green |
| Q8_0 | 40 | 0 / 10 | green |
| Q4_K | 20 · lowest | 0 / 10 | green |
| Q4_K | 20 · middle | 0 / 10 | green |
| Q4_K | 20 · highest | 0 / 10 | green |
| Q4_K | 40 · temperature 1.0 | 0 / 10 | green |
| Q4_K · Q6_K · Q8_0 | the processor alone | being measured | being measured |

### Text, Voices and Emotions

**Narrator's voice**: the engine's own voice, held from the first piece; or **Your own voice…**, a short clip of a voice that the engine follows, taken only under the red warning and with consent ticked (cloning a voice without its owner's consent is a crime in many countries, and the responsibility is yours). No ready-made voices come with the Studio. Each piece's pitch is measured as it is read; a piece whose voice crossed into the other gender is read again with another seed.

Emotions and sounds go in square brackets, as Drama 3 reads them: `[calm]`, `[sad]`, `[whispering]`, `[pause]`, `[laughs]`. **Tag palette** puts them in: an emotion, a pace or a style at the start of its sentence, a pause or a sound at the cursor. **Read the inline tags** is on by default in a dialog and off in a narration, where a clean book reading is wanted. **Style** gives the whole reading a bracket of its own, such as `calm, warm, unhurried narration`.

### Stresses and the Acute

**Put the stresses in** marks the stressed vowels before the engine reads: your own marks stay as written (the acute, U+0301, as in `звени́т`), then your **Stress dictionary**, then the language's big dictionary where one is here: Ukrainian's and Russian's come with the Studio (Ukrainian's from lang-uk, after ULIF's «Словники України»; Russian's A. A. Zaliznyak's Grammatical Dictionary, unfolded from gramdict's data, CC BY-NC 4.0: free for non-commercial use), and for any other language you plug in your own (`docs/NARRATOR-DICTIONARIES.md`); a word stressed two ways is left to its context. **Check stresses** shows the text as the engine will read it. A word misread in a take: **Fix** on its run, pick its piece, put the stress in, **Remember the stress in the dictionary**, and **Read this piece again**.

### The LCV Glyph Map

**Read LCV letters by the glyph map** turns LCV's own letters (Ѓ, Ђ, Љ, ѵ, Ѳ and the rest) into what the engine reads, by the author's table: `Авраѓа́ма` is read as `Авраהа́ма`. **LCV glyph map** under the dictionary shows the table; **Save as my copy** keeps your copy in `user/reader/glyphs.map.tsv`, and it is the one applied from then on; **Back to the author's table** lets it go. The switch is off by default.

### The Ear and the Loudness

**Hear each piece (Whisper)**, on by default: Whisper large-v3 on the processor hears each piece while the engine reads the next one. A piece where it hears a word inserted, dropped or swapped, or 12 % or more of its letters off its text (a repeat, a skip, a mumble), is read again with another seed, up to three readings, and the closest to the text is kept. The run’s card says which pieces were read again and why, a word with its time in the take. The take is joined to −16 LUFS, as podcasts are, its peaks never past −1 dBFS. An ear that could not load is said in the run and in the take's note, never taken for a clean reading. Off, the engine reads without hearing: no piece is read again for its words, no letters are scored, and the run's card and the take's note say «Whisper off», never a clean reading. **Check with Whisper** on a finished run, or in a Narrator's take menu in the Library, hears a take afterwards: the take as it sounds is cut where each piece sits and heard against the words the engine was asked to read; the letters off and each word flagged, with its time in the take, go into the take's note and into `whisper-check.json` beside it. Its audio is not touched.

### From a Recording

**From a recording** takes a lecture or a stream (any audio, or the sound of a video), and **Transcribe** hears it with Whisper: the words with their times, and a text in paragraphs at its pauses. **Clean up with the Writer's model** fixes what Whisper misheard, the punctuation and the capitals, keeping every word and its order; **Into the text** puts it into the Narrator's text, as a dialog when its lines are `Name: words`.

### Licences

Drama 3 is under the Fish Audio Community License v1.0: free for research and non-commercial use, and for commercial use while the annual revenue stays under USD 500,000. It allows no hosted TTS or voice-cloning service for others, no real person's voice cloned without consent, and nothing it makes used to train or distill another model; its watermark stays in the sound. Every take it reads carries **Built with Fish Audio** on its run's result, in the take's editor and in its Library note. Every take of the Narrator is marked never for training: its file carries the mark, the Trainer refuses a folder that holds it, and the dataset kitchens leave it out.

### A Reading in Six Steps

1. Paste the text, or bring it **From a recording**.
2. Choose **Mode**: **Narration** for a book, **Dialog** for voices.
3. Choose the **Narrator's voice**; in a dialog, one for each speaker.
4. Leave **Put the stresses in** on; for LCV, add **Read LCV letters by the glyph map**.
5. Look at **Quant** and the line under it: the quant, the card, how long it will take.
6. **Read**, then listen to the take; a piece that came out wrong goes through **Fix**.
