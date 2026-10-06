# Install a complete local YuE2 music studio, exactly like the original (instructions for an AI coding agent)

Kit v{{KITVER}}, {{DATE}}.

You are an AI coding agent running on my computer with a shell. A friend has given me his
local setup for **YuE2** (m-a-p/YuE2-3B, an AI model that writes whole songs with vocals from a
style prompt and lyrics). Install it for me by following this document, so that it works,
looks and behaves exactly like his.

Everything comes from public GitHub and Hugging Face sources, plus this kit:
- his code changes as git patches, each with a note of what it does and why (`engines/cpp/PATCHES.md`);
- his scripts;
- his LoRA library list with its descriptions;
- his settings;
- screenshots of his screens.

**Nothing on my machine exists yet**: no models, no model folder, no caches. Everything is
downloaded into one install folder and runs from there.

**The app** is `yue2.cpp` (ServeurpersoCom/yue2.cpp), a fast C++/GGML engine for YuE2 that you
compile. It gets {{NPATCH}} patches from my friend, which give it his web page and everything
below. They were made for upstream commit `{{BASE}}` of {{BASEDATE}}: upstream may be newer by now. It
runs on port 41867.

## Before anything: is something already here?

**This app is already installed from an earlier version of this kit** (`ROOT` has `start.sh`, `outputs/`
and the engine in `build/`, or in `repo/` for kits before v6): **upgrade it, do not reinstall.**
- **First, a running server**: if a `yue-server` started from this ROOT is running (`pgrep -af yue-server`),
  ask me to stop it (Ctrl-C in its terminal) before you change anything: it keeps the old code and holds
  the port. At the end, remind me to start it again (`./start.sh`) and to press Ctrl+Shift+R in the browser.
- Read this kit's `CHANGELOG.md` for what changed, and follow the ground rules in section 0.
- Keep my songs (`outputs/`), models, sliders, LoRAs, venvs (`tmp/venv`, `tmp/hf-venv`) and
  `settings.json` (drop any setting the changelog says was removed). Download or convert nothing unless
  the changelog says so.
- First save my local code edits and changed scripts in `install-record/`, and tell me what they were.
- Redo section 3's code step: `upstream/` and a fresh `build/` from the kit's base commit and patches,
  then the tree check. A kit before v6 had the engine in `repo/`: keep that folder until the new
  `build/` passes the tests, then ask me before deleting it.
- Copy the kit's `app/` over mine, then re-apply my machine's settings from section 7.
- **Leftovers of older installers**: list what is there and ask me, for each, to keep it, move it to
  `install-record/old/`, or delete it: `kit/` (an old copy of a kit), `SETUP-LOG.md` and `logs/` (an older
  installer's record), `tools/log-step.py` and `tools/run-cpu-validation.py` (replaced by
  `tools/record.sh` and `tools/test-real.sh`), and `repo/` (see above).
- **This install's own `README.md`**, if an earlier installer wrote one: bring it up to date (the layout
  with `upstream/` and `build/`, the kit version and tree hash, where `install-record/` is), or ask me
  whether to replace it with a short one.
- Rebuild (section 4), then run `tools/verify-install.sh` and the CPU tests. Ask me before any GPU run.
- Report what changed, what you saved, and the test results.

**I already have my own yue2.cpp somewhere else: leave it alone.** This kit never changes an existing
checkout; it installs into its own folder. To put these patches on a newer upstream instead, read
`engines/cpp/PATCHES.md`: try them in a scratch copy, and redo a patch that fails by hand from its note.

**Two platforms:**
- **Linux or Windows WSL2 with an NVIDIA GPU**: his own platform, tested end to end.
- **macOS on Apple Silicon**, built with Metal and Apple's Accelerate.
  - **On a Mac, read the kit's `app/tools/kit/MACOS-NOTES.md` first.** My direction for a Mac: do not build
    this C++ version; use the MLX engine with my improvements. That port does not exist yet, so stop
    and ask me before building anything on a Mac.
  - Verified: an M1 Mac mini with 8 GiB. The build, the conversion, the page tests, and a
    generation on the CPU.
  - Later, a full song on Metal (the GPU) did finish, but took 1,702 s for 183 s of music: that is
    why a Mac should not use this C++ version (MACOS-NOTES.md). BF16 inference, covers and other Macs
    were never tried.

Each step below says when it differs by platform.

What it has (all of it comes with the patches; you do not build any of it by hand):
- **Song form**:
  - title, a music seed and a sound seed (the dice puts a seed in or clears it; blank = random);
  - a style prompt that grows with its text and counts tokens (about 11,400 for style and lyrics together);
  - lyrics, an official **Instrumental** switch, and three modes: Full plan, Melody only, Direct;
  - a supplied or editable ABC score; **Cover or remix** from a recording or from a take (two parts of the
    same shape: each control on its own line, the buttons on the left; a chosen recording can be played with
    **▶ Listen** first);
  - sampling controls, versions per pass, and Plan score only;
  - **Start from an idea**: a local chat model drafts title, style and lyrics. An Idea box (two lines) that grows as you
    type; Structure, and the writer model on its own line under it; then, under a thin line, a square **Chat Server
    Connected** (green) or **Chat Server Offline** (red) button and **Write the brief**, the same size on the
    left, and "Generate the song right after". The chat button's tip says what to do; a click checks again.
- **Add-ons, marked ADD-ON everywhere**:
  - **VAE**: Standard and Legacy are stock; Blend is an add-on. One per song. Each explains itself on
    hover (Standard: the quality choice and the newer model; Blend: two thirds Standard, one third Legacy).
  - **{{NSLIDER}} voice and genre sliders**.
  - **{{NLORA}} LoRAs** in an even grid of buttons. Each button shows a short name, the half it steers
    (MUSIC / SOUND / BOTH) and a few words of what it does. Each LoRA gets its own strength for
    the music half and the sound half, plus a trigger-word button.
- **Top bar**:
  - the logo: "YuE2" links to the model's GitHub, the CPP badge to the engine's;
  - status and hardware readout;
  - a Model menu (BF16, Q5_K_M);
  - a theme picker with **51 themes** (the default is Studio, a dark warm palette; DMM is a zinc and
    electric purple one with its own fonts and play button);
  - Open/Save, Load example (110 official demos), Clear, a **New song** button, Unload model;
  - **Engine**.
- **Three columns** (song form, song page, library): drag the line on either side of the middle one to
  resize the song form or the library; a double-click puts one back, and the browser remembers.
- **Downloads** are named after the song (`Last Train Home.wav`); the Takes list's ⋯ menu can put the
  date back in the names.
- **Library** (right): a tinted card with a ▶ PLAYING badge for the song that plays; favourites and
  versions; a double-click on a song plays it.
- **Song page** (middle):
  - the title with **▶ Play this song** beside it, and Favourite, Rename and a red Delete as icons on the
    right; under it: age, length and render time;
  - buttons in three groups: Download (WAV, FLAC, MP3 with its bitrate), Make again (**Retake**: the
    exact same song again; **Reuse**: same prompt, lyrics and settings, new music; Re-render sound),
    Files (Request, Score);
  - one compact details card: **Song | Sound | Shape** side by side (mode, format; VAE, model, steps;
    Composition, Performance and Style on five-dot scales), then **Sliders | LoRAs** with each strength
    beside its name, then the two seeds with copy buttons;
  - a new VAE version of a take in seconds, the prompt, lyrics (with export) and the score;
  - a live score, progress and waveform while a song is made.
- **Player bar** (bottom): the song's name (its style prompt on hover), play, waveform, volume, and a
  **status pill**: Rendering, Queued, Playing, Paused or Idle (a click shows the run or opens the song).
- **Engine page** (its own page, with a pinned "⚙ Engine" band and a dotted backdrop):
  - server, compute, memory presets (8/12/16/24/32 GB) and hardware cards;
  - VAE tiles marked STOCK/ADD-ON;
  - LoRA tiles, each with its source link and an (i) recap;
  - a Sliders card, the idea writer (a local chat server), an **Appearance** card (the theme; hover
    highlights in the theme's colour, an accent glow around cards, the corners, a calmer page; and the text,
    heading and number fonts: the app's own, a line, then this computer's; all kept per browser) and the server log;
  - an **About** card at the end: "Customized Collection by SeattleSysop" with his GitHub, then YuE2,
    yue2.cpp and ggml with their links, and every add-on's own page.
- **An (i) help tip on every setting.**

---

## 0. Ground rules for you

1. **One install folder, nothing outside it.** Ask me for the folder. The default is
   `~/yue2-studio`, called `ROOT` below. Every build file, Python venv, cache, temp file, model,
   LoRA and song lives under `ROOT`:
   - For every command, set `TMPDIR=$ROOT/tmp`.
   - The kit's scripts pin every Hugging Face and pip cache into `ROOT/tmp`. A globally exported
     `HF_HUB_CACHE` beats `HF_HOME`, so never run `hf` yourself without pinning all of them.
   - Links only point inside `ROOT`, and relative, so the folder can be moved or renamed later.
   - The only exception is system packages via apt, and only after I say yes.
2. **Ask me before:**
   - any `sudo` or apt install;
   - the big downloads (tell me the total first; see section 1);
   - the first time anything runs on the GPU.
3. **Testing uses the CPU only**: `CUDA_VISIBLE_DEVICES= GGML_BACKEND=CPU`.
   - Keep CPU work polite: `nice -n 15`, and at most a quarter of the cores for builds (2 on an
     8 GiB Mac).
   - Never start a test that runs more than a few minutes without asking.
   - A GPU generation test (`tools/test-real.sh --gpu`) needs my separate OK. On a Mac it is the
     first Metal generation ever tried with this kit.
4. **Apply the patches with `git am`** so the history stays intact. Set a local committer:
   `-c user.name=install -c user.email=install@localhost`.
5. **Do not hand-edit the app's code.** The patched tree is byte-identical to the original
   (checked by a git tree hash below), and that is what makes it look and behave like his. If
   something fails, fix the environment (packages, paths, flags), not the code, and tell me.
6. **Never run upstream's own scripts in `upstream/` or `build/`** (`update.sh`, `buildwebui.sh`, `buildcuda.sh`,
   `server.sh`, `models.sh`, `checkpoints.sh`, `quantize.sh`). The kit's scripts replace them:
   `buildwebui.sh` would overwrite his page, and the others write outside this layout or use
   every CPU core.
7. **Keep a record inside the install** (`install-record/`).
   - From section 3 on, run every stage through `tools/record.sh STAGE -- COMMAND`. It saves the
     command, the start and end times, the exit status, the attempt number and the full output.
   - Record every adaptation for this machine with `tools/record.sh note "..."`: a workaround, a
     changed setting, or a step skipped.
   - Run `tools/record.sh versions` once the tools are in place, and again at the end.
   - Copy the kit's `VERSIONS.txt`, `MANIFEST.txt` and `CHANGELOG.md` into `install-record/`.
   - After each stage, also give me a short report: what was done, sizes, times, and anything
     skipped.
8. **Never bypass an integrity check.**
   - Do not edit a hash, a pin or a check to make a step pass.
   - If a patch really has to change, the owner regenerates the tree hash and the manifest with his
     kit builder; tell me instead of working around it.
9. **Background reading**, if something is unclear:
   - `engines/cpp/PATCHES.md` says what each patch changes, why, and which files it touches.
   - `docs/screenshots/` shows how the finished pages look.

## 1. Check the machine first, then ask me

The zip is in the folder you were started in. Unzip it (that only makes `yue2-install-{{DATE}}-v{{KITVER}}/`), then run the machine
check. (A clone of the kit's git repository, yue2-kit, works the same: that folder is the kit, so skip the
unzip and use its name wherever these steps say `yue2-install-{{DATE}}-v{{KITVER}}`.) It changes nothing. It also finds tools that are installed but **not on PATH**: on WSL, `nvcc`
is often in `/usr/local/cuda/bin` and `nvidia-smi` in `/usr/lib/wsl/lib`.

```bash
unzip -q -n yue2-install-{{DATE}}-v{{KITVER}}.zip       # makes yue2-install-{{DATE}}-v{{KITVER}}/ (-n: never overwrites a file)
mkdir -p install-record && bash yue2-install-{{DATE}}-v{{KITVER}}/app/tools/check-machine.sh . 2>&1 | tee install-record/check-machine.txt
```

Summarise its report. The rules that follow from it:

- **The check says which platform this is** (Linux/WSL or macOS). Follow that platform's lines
  below and in sections 4 and 7.
- **Found but not on PATH**: it prints an `export PATH=...` line. Use that line in every shell from now
  on. Do not install anything for these tools.
- **An NVIDIA GPU is expected.**
  - compute_cap **12.x** (RTX 50-series) needs CUDA **12.8 or newer**; the check says so.
  - compute_cap **8.0 or newer** (RTX 30/40/50, A-series): BF16 tensor cores; nothing to add.
  - compute_cap **7.x** (RTX 20-series, Volta): FP16 but no BF16 tensor cores. `start.sh` turns on
    `--fp16-matmul` by itself there and says so (`matmul  FP16 tensor cores`): measured on an RTX 2070
    Super Max-Q laptop (8 GB), a 196 s song went from 440 s to 215 s. It changes the output slightly,
    so a seed from before does not give the same song. `YUE2CPP_FP16_MATMUL=0` turns it off.
    `--clamp-fp16` stays the fallback if a song comes out as noise; that laptop did not need it.
  - compute_cap **6.x or older** (GTX 10-series and older): no tensor cores, so the flag stays off;
    add `--clamp-fp16` to the start command if songs come out as noise. Untested.
  - Without an NVIDIA GPU, stop and tell me. Upstream also builds for Vulkan and Apple Metal, but this
    kit is untested there.
- **CUDA**: propose installing the toolkit only if the check found no `nvcc` anywhere.
  - Install `cuda-toolkit-12-8` or newer. On WSL2, use NVIDIA's WSL-Ubuntu repo, and install the
    toolkit only.
  - **Never install a Linux NVIDIA driver inside WSL.** WSL's driver and `nvidia-smi` come from the
    Windows NVIDIA driver.
  - nvcc only accepts some gcc versions. If the build says the host compiler is unsupported, pass
    `-DCMAKE_CUDA_HOST_COMPILER=g++-NN` with a supported version.
- **Three groups of packages.** For each missing group, show me one `sudo apt install ...` line and wait
  for my OK:

  | Group | Needed for | Ubuntu packages |
  |---|---|---|
  | **core** (required) | build, convert, download | `git curl unzip build-essential cmake ninja-build python3-venv` (cmake 3.24+; `python3-venv` brings ensurepip) |
  | **optional tests** | the page tests, the FLAC test | Node.js 22+ (NodeSource or nvm), `google-chrome-stable` (Google's repo), `flac`, `ffmpeg` |
  | **page fonts** | drawing the page's symbols in a browser on this machine (the headless test Chrome, or a Linux desktop browser) | `fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk` (the CJK set has the fullwidth "＋" in "＋ New song") |

  The fonts do not affect the build or the songs. A browser on Windows, opening the app through
  localhost, uses Windows' own fonts.
- **macOS** (Apple Silicon):
  - **Xcode Command Line Tools** are required (`xcode-select --install` asks me in a window). They
    bring clang, git, curl, unzip and python3.
  - **CMake 3.24+ and Ninja**: if the check finds none, install them inside the project, not
    system-wide: `python3 -m venv tmp/build-venv && tmp/build-venv/bin/pip install cmake ninja`
    (CMake 4.4.3 and Ninja 1.13.2 were verified). Then use the check's `export PATH=...` line.
  - **Python 3.11+** is best: the converter's pinned packages need it. On an older Python the
    converter says so and installs other versions.
  - **Optional tests**: Node.js 22+, Google Chrome (or Chromium) in `/Applications` (the tests find
    it there), and `flac` / `ffmpeg` (Homebrew). If they live elsewhere, set `YUE2_NODE` /
    `YUE2_CHROME`.
  - **GNU tools are not needed.** The kit's scripts run on macOS's own tools and `/bin/bash` 3.2.
  - Never change a global shell profile: keep PATH changes to the shells you run.
  - **Memory**: a Mac's memory is unified, shared by the CPU, the GPU and macOS. It is not
    dedicated GPU VRAM (see section 7).

Disk use when everything is done (measured on the original machine):

| What | Size |
|---|---|
| Hugging Face checkpoints in `checkpoints/` (deletable after conversion) | 11.9 GB |
| GGUF models: BF16 6.7 + Q5_K_M 2.4 + 3 VAEs 1.5 + transcriber 2.5 | 13.1 GB |
| Sliders, LoRAs | 1.5 GB |
| Build, converter venv | 0.5 GB |
| **Total** | **about 27 GB** (15 GB after deleting `checkpoints/`), plus room for songs |

The downloads are about 13.2 GB: 11.9 GB of checkpoints and 1.3 GB of LoRAs.

Then ask me, in one message:
1. the install folder (default `~/yue2-studio`);
2. OK to download about 13.2 GB;
3. confirm my GPU size, so you can pick the settings in section 7.

## 2. Layout you will create (the same as his)

```
ROOT/
  yue2-install-{{DATE}}-v{{KITVER}}/     this kit (unzipped here, or the yue2-kit clone); call it KIT
  upstream/          github.com/ServeurpersoCom/yue2.cpp @ {{BASE}} (+ ggml submodule), never edited
  build/             upstream + the {{NPATCH}} patches + the built page: compiled and run from here
  build/checkpoints -> ../checkpoints       build/models -> ../models
  checkpoints/       the Hugging Face checkpoints the converter reads
  models/            the GGUF files the app loads (made here, no download)
  sliders/           the 16 sliders, converted
  loras/             the LoRA library (8 folders) + sources.json
  outputs/           the song library
  tmp/               build and test files, the converter/downloader venv, every cache
  tools/             his tests and download scripts
  start.sh  build-page.sh  convert-models.sh  convert-extras.py  download-models.sh  settings.json
```

```bash
ROOT=~/yue2-studio            # the folder I chose (you are already in it)
mkdir -p "$ROOT" && cd "$ROOT" && unzip -q yue2-install-{{DATE}}-v{{KITVER}}.zip    # makes yue2-install-{{DATE}}-v{{KITVER}}/ (skip if already unzipped)
KIT=$ROOT/yue2-install-{{DATE}}-v{{KITVER}}
export TMPDIR=$ROOT/tmp && mkdir -p tmp outputs tools
```

## 3. Code

```bash
cd "$ROOT"
# every temp file and the compiler cache stay in ROOT (ggml uses ccache whenever it is installed)
export TMPDIR="$ROOT/tmp" CCACHE_DIR="$ROOT/tmp/ccache" CCACHE_BASEDIR="$ROOT" YUE2_ROOT="$ROOT"
mkdir -p "$TMPDIR" install-record tools && cp "$KIT"/app/tools/record.sh tools/ && chmod +x tools/record.sh   # the recorder, first
git clone --recurse-submodules {{UPSTREAM}} upstream       # the engine as its author ships it
git -C upstream checkout -B master {{BASE}} && git -C upstream submodule update --init --recursive
git clone upstream build && git -C build remote set-url origin {{UPSTREAM}}   # the copy that gets patched
git -C build checkout -B master {{BASE}}
git -C build submodule update --init --recursive --reference "$ROOT/upstream/ggml" --dissociate   # ggml from upstream/, not the network again
(cd build && git -c user.name=install -c user.email=install@localhost am "$KIT"/engines/cpp/patches/*.patch)
cp "$KIT"/engines/cpp/page/index.html.gz build/tools/public/index.html.gz   # the built page (not in the patches)
git -C build -c user.name=install -c user.email=install@localhost commit -q -am "Add the built page"
[ "$(git -C build rev-parse HEAD^{tree})" = {{TREE}} ] && echo "code OK: identical to the original"
ln -s ../checkpoints build/checkpoints && ln -s ../models build/models
printf 'checkpoints\nmodels\n' >> build/.git/info/exclude
cp -r "$KIT"/app/. . && chmod +x *.sh tools/*.sh      # his root scripts and his whole tools/ folder
cp "$KIT"/settings/settings.json settings.json
cp "$KIT"/VERSIONS.txt "$KIT"/MANIFEST.txt "$KIT"/CHANGELOG.md install-record/ && tools/record.sh versions
```

`git am` may warn about whitespace ("new blank line at EOF"): harmless, the tree check below decides.
If the tree check does not print `code OK`, a patch was skipped or the base commit is wrong.
Start `build/` over; never fix it by hand. (`upstream/` stays clean: `tools/apply-patches.sh` rebuilds
`build/` from it and the kit's patches later, for a newer upstream.)

## 4. Build (for my GPU only)

**Linux / WSL (NVIDIA)**: the architecture comes from `compute_cap`. Drop the dot, and append `a`
for 12.x. So 8.6 → `86`, 8.9 → `89`, 12.0 → `120a`, 7.5 → `75`; `tools/check-machine.sh` prints it.

```bash
ARCH=86   # from compute_cap
tools/record.sh configure -- cmake -S build -B build/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON -DGGML_CUDA=ON \
  -DCMAKE_CUDA_COMPILER="$(command -v nvcc)" -DCMAKE_CUDA_ARCHITECTURES=$ARCH
tools/record.sh build -- env TMPDIR="$ROOT/tmp" CCACHE_DIR="$ROOT/tmp/ccache" CCACHE_BASEDIR="$ROOT" \
  nice -n 15 cmake --build build/build -j $(( $(nproc) / 4 > 2 ? $(nproc) / 4 : 2 ))
```

The compiler cache (`tmp/ccache`, only used when `ccache` is installed) makes the next upgrade's rebuild
much faster: `build/` stays at the same path from kit v6 on.

**macOS (Apple Silicon)**: Metal for the GPU, Accelerate for the math libraries. This exact line built
and ran on an 8 GiB M1:

```bash
tools/record.sh configure -- cmake -S build -B build/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON \
  -DCMAKE_C_COMPILER=/usr/bin/clang -DCMAKE_CXX_COMPILER=/usr/bin/clang++ \
  -DGGML_CUDA=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_BLAS=ON -DGGML_BLAS_VENDOR=Apple
tools/record.sh build -- env TMPDIR="$ROOT/tmp" CCACHE_DIR="$ROOT/tmp/ccache" CCACHE_BASEDIR="$ROOT" \
  nice -n 15 cmake --build build/build -j 2     # more on a bigger Mac: a quarter of the cores
```

Both:

```bash
build/build/yue-server --help 2>&1 | head -3    # prints its usage; see below
```

`yue-server --help` prints valid usage and then exits with status 1. That is how upstream wrote it,
not a build failure: judge the build by the usage text.

The web page is already built into the server (the kit's `engines/cpp/page/`, now `build/tools/public/index.html.gz`).
`./build-page.sh` is only for someone who edits the page's source files.

## 5. Models (ask me first; about 11.9 GB of downloads)

```bash
tools/download-checkpoints.sh --check     # asks Hugging Face that all 7 repos are there, at his revisions (no download)
tools/record.sh checkpoints -- tools/download-checkpoints.sh     # -> checkpoints/ (11.9 GB); checks every file
tools/download-checkpoints.sh --verify    # all 7 must say "have" (particle-sliders: 16 weights, about 246 MiB)
tools/record.sh convert -- ./convert-models.sh                    # -> models/ + sliders/ (a few minutes, CPU)
```

Then his smaller model copies (about a minute each):

```bash
{{QUANTIZE}}
```

His `models/` holds exactly: {{MODELS}}. Yours should match.
- The **converted** files match his byte for byte, on any platform.
- A **quantized** copy (Q5_K_M) may not. Quantizing can round differently on another platform or
  compiler: on the Mac, 392 of its 627 tensors differed in their Q5_K/Q6_K data, with identical names,
  shapes and types. `tools/verify-install.sh` compares such copies by structure, not by bytes, and a
  generation test checks that they work.

**Everything is pinned to his exact files.**
- **The downloader.** The scripts install `huggingface_hub[hf_xet]==0.36.2`
  (`tools/downloader-requirements.txt`) into their own venv, `tmp/hf-venv`. Do not upgrade it: version
  2.0.0 silently dropped the include patterns, and the sliders came down as metadata only.
- **Exit status 0 is not proof.** The scripts check every file against the pinned revision's own list
  (names and sizes), and every slider weight against `catalog.json` (with its SHA-256). A partial
  download is fetched again, not skipped. Trust their `have` / `done` / `failed`.
- `tools/hf-revisions.txt` gives every download the Hugging Face revision his copies came from, even
  where the repo has changed since. Do not delete or edit it.
- `tools/converter-requirements.txt` gives the converter his package versions, so the GGUF files come
  out the same. If this Python cannot install them, `convert-models.sh` says so and uses defaults;
  tell me if that happens.

**Interruptions and low memory** (both handled by `convert-models.sh`):
- **Interruptions**: every output is written as `<name>.partial` and renamed only when complete. On the
  next run, anything an interrupted run left behind is found and made again. The quantize lines above
  do the same.
- **Low memory**: below 16 GiB of RAM, the converter keeps the tensors in a temporary file in `tmp/`
  instead of in memory. It peaked at 1.5 GB of RAM for the 7.2 GB backbone, but it needs about 7.5 GB
  more free disk while it runs. Force it with `YUE2_LOWMEM=1`, or turn it off with `YUE2_LOWMEM=0`.
  The files come out the same either way.

`convert-models.sh` makes these (`tools/verify-install.sh` checks them):
- `models/`: YuE2-3B-BF16 (6.7 GB), YuE2-Vae-F32, YuE2-Vae-legacy-F32, YuE2-Vae-blend-F32
  (0.5 GB each): byte-identical to his, checked by SHA-256;
- `models/`: SheetSage2-F32 (2.5 GB, the transcriber for covers): checked by structure (every tensor's
  name, shape and type). Its conversion merges weights in float32, which rounds differently on another
  CPU, so its bytes can differ from his while the file is correct;
- `sliders/`: {{NSLIDER}} sliders + `catalog.json` (0.25 GB): byte-identical, checked by SHA-256.

It installs its own small Python packages into `tmp/venv`, separate from the downloader's `tmp/hf-venv`.

- **After converting**, `checkpoints/` is only needed to convert again. Offer to delete it,
  which frees 11.9 GB.
- **If a repo is gated**, I have to accept its terms on huggingface.co first. On the kit's date
  every repo was public.

## 6. LoRAs

{{NLORA}} LoRA files from {{NLORAREPO}} repos, about 1.3 GB, at his revisions. The folder names must stay as the
script makes them, because `sources.json` is keyed by them.

```bash
tools/download-loras.sh --check           # asks Hugging Face that every file exists at his revisions (no download)
tools/record.sh loras -- tools/download-loras.sh                 # -> loras/; checks every file's size
tools/download-loras.sh --verify          # every folder must say "have"
cp "$KIT"/loras/sources.json loras/sources.json
```

`loras/sources.json` is the part that makes the add-on screens look like his:
- each LoRA's short name and blurb (the text inside its button);
- its source link and its (i) recap;
- a trigger word for the one file that carries none (Death metal: `deathmetal`);
- the VAE and slider links and recaps, and which VAEs are stock.

The app reads it at start. Do not edit it; he wrote it from each repo's model card.

## 7. Settings: his, adjusted to my GPU

His machine has a 32 GB card. His settings (`settings.json`, which the page's Engine panel also
writes) are: {{SETTINGS}}. `start.sh` passes up to {{BATCH}} songs per pass.

Use them as they are on **24 GB or more**. On smaller cards, change only these keys. They are
the same values as the Engine page's memory presets, and I can change them there later.

| My GPU | `settings.json` | `start.sh` |
|---|---|---|
| 24 GB+ | as his | as his |
| 16 GB | `keep_loaded` false, `vae_core` 512 | as his |
| 12 GB | `keep_loaded` false, `max_seq` 16384, `vae_core` 512 | `BATCH="${YUE2CPP_BATCH:-{{BATCH}}}"` → `:-1` |
| 8 GB | `keep_loaded` false, `max_seq` 12288, `vae_core` 256 | `BATCH="${YUE2CPP_BATCH:-{{BATCH}}}"` → `:-1` |

- **Never set `max_seq` below 12288.** The music stage needs its prefix (about 1,500 tokens) plus 9,000
  tokens of room: at 8192 every song fails with `prefix ... + budget 9000 + end exceeds context 8192`,
  and only after the score has been written. 12288 worked for a full song.
- **8 GB on an RTX 20 card**: `model` BF16 with the automatic FP16 flag measured closer to the full
  precision render than Q8_0, and about 15% slower than Q5_K_M. The two BF16 halves do not fit 8 GB
  together, so `keep_loaded` stays false.

**What to expect** (measured; songs differ, so treat these as rough):

| Machine | Music | Took | How |
|---|---:|---:|---|
| RTX 5090 32 GB, WSL2 (his) | 298 s | 117 s | Q5_K_M, new song, 32 steps, 2 sliders |
| RTX 5090 32 GB | 255 s | 121 s | BF16, new song, 32 steps, 2 sliders, guidance 1.15 |
| RTX 5090 32 GB | 298 s | 41 s | BF16, the sound made again from a finished song |
| RTX 2070 Super Max-Q 8 GB laptop, WSL2 | 196 s | 215 s | BF16 + the FP16 flag, 32 steps (440 s without it) |
| M1 Mac mini 8 GiB, Metal | 183 s | 1,702 s | Q5_K_M on this C++ version, two diagnostic pauses included: do not use it on a Mac |

The biggest costs you choose: guidance other than 1.0 doubles the music stage's work; each slider adds
to every music token; BF16 writes music tokens more slowly than Q5_K_M.

**A Mac (Apple Silicon)**: the memory is unified, shared by the CPU, the GPU and macOS itself. Do not
treat it as GPU VRAM from the table above. Start from these, and treat them as untested for full songs:

| My Mac's memory | `settings.json` | `start.sh` |
|---|---|---|
| 8 GiB | `model` Q5_K_M, `keep_loaded` false, `max_seq` 12288, `vae_core` 256 (8192, the earlier advice, cannot fit a song; see above) | `BATCH="${YUE2CPP_BATCH:-{{BATCH}}}"` → `:-1` |
| 16 GiB | `model` Q5_K_M, `keep_loaded` false, `max_seq` 12288, `vae_core` 256 (untested) | `:-1` as above |
| 24 GiB+ | `model` Q5_K_M, `keep_loaded` false, `vae_core` 512 (untested) | `:-1` as above |

- Keep the model on **Q5_K_M** on every size: it is his pick and the smallest copy the C++ author
  recommends. On 16 GB or more of GPU memory (not a Mac's unified memory), BF16 (the full model) also
  fits: pick it in the Model menu.
- `start.sh` starts the model `settings.json` picks. If that file is missing, it uses the first copy
  present, so an install with only Q5_K_M starts. `YUE2CPP_DRY_RUN=1 ./start.sh` shows the command
  without starting anything.
- Edit JSON by changing only those keys; never rewrite the whole file. In `start.sh`, change only the
  `BATCH=` line: its stats block and the server command both read it.

## 8. Tests (CPU only; ask me before the longer ones)

| Test | What it checks | Needs | Time |
|---|---|---|---|
| `tools/verify-install.sh` | the whole install against his: the code tree, {{NGGUF}} GGUF files ({{NMODEL}} models + {{NSLIDER}} sliders), {{NLORA}} LoRAs (pinned sizes, then the server's LoRA reader), `sources.json`, settings | nothing | ~10 s |
| `tools/test_downloaders.sh` | the download scripts: the include patterns reach the downloader literally, and incomplete downloads are caught | nothing | seconds |
| `node tools/cdp-console.mjs` | the whole page against a stand-in server: {{CDP_CHECKS}} checks | node, google-chrome, python3 | ~75 s |
| `tools/test-real.sh` | the real server and page, including a real 1-second song on the CPU: 6 checks + 13 page checks | node, google-chrome, the models | ~1–3 min |
| `tmp/venv/bin/python tools/test_flac.py --no-song` | the built-in FLAC encoder, bit-exact against flac and ffmpeg | flac, ffmpeg | ~20 s |
| `tools/test_downloaders.sh --online` | also the real pinned downloader on two include patterns (about 16 MB) | network | ~10 s |

Run the first three without asking. The page test makes its own test page from the committed one
(`build/tools/public/index.html.gz`) when the page sources are unchanged: never run `./build-page.sh` for it.

`tools/test-real.sh` works on a fresh install. It:
- writes one clearly labelled **synthetic fixture** take (a 1-second tone, not model output) into an
  isolated test library, `tmp/test-real/library`;
- starts its **own** server with the GPU hidden, on a free port, with test settings, on a quarter of
  the cores;
- runs the page checks and a real 1-second generation, all under time limits;
- stops exactly the server and browser it started;
- checks that my `outputs/` and `settings.json` were not touched.

`tools/test-real.sh --gpu` runs the same test on the GPU (CUDA, or Metal on a Mac). **Only with my
separate OK**; on a Mac it would be the first Metal generation verified with this kit.

The page tests find Chrome or Chromium on PATH or in `/Applications` (macOS), and Node on PATH. Set
`YUE2_CHROME=/path/to/chrome` or `YUE2_NODE=/path/to/node` otherwise. Each run uses a new, empty browser
profile. Every browser command gives up after 60 s and names itself, so a stall never hangs the suite.

**Expected, harmless messages** (do not treat these as failures, and do not change the app to hide them):
- a missing **NCCL** library: it is only used across several GPUs, and a single GPU does not need it;
- **"no CUDA-capable device"** during the CPU tests: they hide the GPU on purpose;
- `yue-server --help` **exit status 1**: it printed valid usage (section 4);
- on a Mac, the server **compiles its Metal shaders at start**, even for a CPU run: `test-real.sh` gives
  it up to 3 minutes to answer.

## 9. First real run: ask me before using the GPU

```bash
cd ~/yue2-studio && ./start.sh      # -> http://127.0.0.1:41867
```

Give me that command to run in my own terminal; I want the console output.
- Ctrl-C stops it. Songs are saved in `outputs/`.
- On WSL2, if the port will not bind, start it with `YUE2CPP_PORT=` set to another port between
  40000 and 44000.
- On a Mac, the first real song may run on the GPU (Metal), which this kit has not verified. If it
  fails or sounds wrong, tell me; `GGML_BACKEND=CPU ./start.sh` runs it on the CPU, which is verified
  but slow.

A good first song:
- a short verse and chorus, with the style "English, female vocals, acoustic folk, gentle
  guitar, warm";
- VAE Standard, no sliders, no LoRA, Full plan.

Then try a LoRA:
- tap **Death metal** in the LoRA grid;
- press its trigger button to put `deathmetal` into the style;
- keep the music strength at 1.0.

## 10. It should look like this

Compare with the kit's `docs/screenshots/`:
- `compose-page.png`: the song form with the ADD-ON marks and the LoRA grid;
- `song-page.png`: a song open: the grouped buttons, the compact details card, the player bar;
- `song-page-narrow.png`: the same in a narrower window (the details card folds);
- `engine-page.png`: the Engine page with its band and dotted backdrop;
- `engine-tiles.png`: VAE, LoRA and Sliders tiles with links and (i);
- `engine-about.png`: the end of the Engine page, with the About card (YuE2 on the left, the engine, the
  layout and ggml on the right);
- `theme-picker.png`: the themes.

The screenshots were taken against a stand-in server that had his real LoRAs, VAEs and sliders; the
songs and the hardware readout are examples. The layout, text, colours and controls are what I should see.

- The top bar, left to right: the music note (opens this kit's GitHub page), the "YuE2" logo (the model's
  repo), the small "cpp" tag (the engine's repo), the server status, and on the right a two-line GPU readout
  (the GPU, its memory in GB) right beside the Model menu, then the theme menu and the buttons.
- The default theme is **Studio (warm)**, a dark warm palette with amber accents, one of 51 (DMM is the
  purple one with its own fonts). The theme menu in the top bar changes it per browser (and the browser
  remembers).
- Downloads are named after the song (`Last Train Home.wav`); the Takes list's ⋯ menu puts the date back.
- Text and headings are in IBM Plex Sans (headings at medium weight), numbers in IBM Plex Mono; only the
  "YuE2" logo is in the Bodoni Moda serif. The Engine page's **Appearance** card changes them per browser.
- The page loads its fonts (Google Fonts: Bodoni Moda, IBM Plex Sans, IBM Plex Mono, and Michroma and
  Space Grotesk for the DMM theme) and the score renderer (abcjs from cdnjs) from the internet, beside the
  page rather than before it: on a first visit the text can show in a plain font for a moment, then switch. Without internet it still works but
  keeps plain fonts, and scores show as text.
- After the app is updated, press Ctrl+Shift+R so the browser reloads the page.

## 11. Model copies

**There is no smaller YuE2 model**, only smaller copies of the same model (about 3.6B
parameters). The app loads any of these that `start.sh` finds in `models/`.

| Copy | Size | Quality |
|---|---|---|
| BF16 | 6.7 GB | the full model |
| Q8_0 | 3.8 GB | "near lossless" (the C++ author); make it like Q5_K_M if I ask |
| Q6_K | 2.9 GB | small loss; the same, if I ask |
| **Q5_K_M** | 2.4 GB | **his pick**; the smallest the author recommends (the model degrades below Q5) |

- LoRAs work with every copy. They are merged into the weights they touch while the model loads
  for a song; on the smaller copies those weights are kept at Q8_0 so small LoRA changes survive.
- There is no F32 option any more. It widened the BF16 weights to F32 for a quality gain nobody
  measured, at twice the memory and about 60% slower; it was removed on 2026-09-26.

## 12. Licences (tell me briefly at the end)

- **YuE2 weights**: CC BY-NC 4.0. The official GitHub repo's `MODEL_LICENSE`
  (github.com/multimodal-art-projection/YuE) adds a creator permission: individual musicians may
  sell and publish the songs they make; companies need a licence.
- **Code**: yue2.cpp and the sliders are MIT.
- **LoRAs and the Blend VAE** are community add-ons. Most are CC BY-NC 4.0, following the base
  model. Each one's model card (the link on its Engine tile) has its terms.

## 13. Troubleshooting

| Symptom | Cause, fix |
|---|---|
| build: host compiler not supported | pass `-DCMAKE_CUDA_HOST_COMPILER=g++-NN` with a version this nvcc accepts |
| build: unsupported gpu architecture | nvcc too old for this GPU (RTX 50 needs 12.8+) |
| the tree check does not print `code OK` | wrong base commit, or a patch was skipped: start the clone over; never edit by hand |
| `convert-models.sh`: missing checkpoint | a download failed: run `tools/download-checkpoints.sh` again |
| "Ignoring --include since filenames have been explicitly set", or a `particle-sliders` folder of about 1 MiB | a huggingface_hub other than 0.36.2 was used: delete `tmp/hf-venv` and run the script again (it installs the pinned one) |
| a download script says `failed` although the downloader finished | files missing or the wrong size: run it again (it resumes); if it repeats, check disk space and the network |
| `nvcc` or `nvidia-smi` "not found", but installed | not on PATH: use the `export PATH=...` line `tools/check-machine.sh` prints |
| messages about a missing NCCL library | harmless on a single GPU |
| "no CUDA-capable device" in the tests | expected: the CPU tests hide the GPU |
| `yue-server --help` exits with status 1 | normal: it printed its usage |
| boxes instead of symbols (＋ ⚙ ↗ ★) in a browser on this machine | the page fonts are missing (section 1, third group) |
| macOS: "no Chrome or Chromium found" | install Chrome in `/Applications`, or set `YUE2_CHROME` |
| macOS: a test server is slow to answer at first | it is compiling Metal shaders: expected, and `test-real.sh` waits up to 3 minutes |
| macOS: conversion runs out of memory | it should not: below 16 GiB the low-memory mode is automatic; check `YUE2_LOWMEM` is not 0 |
| a quantized copy's SHA-256 differs from his | expected across platforms (section 5): `verify-install.sh` compares its structure instead |
| a script fails with "unbound variable" or a syntax error on a Mac | report it with the line: the scripts are written for macOS's bash 3.2, so it is a kit bug |
| files appear in `~/.cache/huggingface` | `hf` was run by hand: use the kit's scripts, which pin every cache |
| LoRA buttons show file names instead of short names and blurbs | `loras/sources.json` missing: copy it from the kit (section 6) |
| the Engine's LoRA tiles say "no source link" | the same, or a LoRA folder was renamed |
| no song sound, or noise, on an old GPU | add `--clamp-fp16` to the `./start.sh` command |
| the page will not start: address in use | pick another port (section 9) |
| out of memory | Engine page: a smaller memory preset; turn off Keep models loaded; batch 1 |
| the page looks old after an update | Ctrl+Shift+R |

## 14. Final report

When everything is done, show me:
- a table of what was installed, with sizes (`du -sh` of each big folder);
- the tree check (`code OK`), and `tools/verify-install.sh`'s summary line;
- `tools/record.sh show` (every step, its exit status and its retries), and the notes;
- the start command and URL;
- the test results;
- the model copies in `models/`, and the settings you chose for my GPU;
- anything skipped, and why.

Keep it short and plain.
