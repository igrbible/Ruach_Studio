# Install reference kit: changelog

Kits v1 to v4 carry the same app: upstream yue2.cpp `f17d526` + 22 patches, tree
`d48e6e2e4a4e9bff24f8f60c943eddd976358df1`. v5 is the first kit that changes the app itself.

## v12 (2026-09-28)

58 patches, tree `41c64b6e1af2b3c7f135dea18a00517907b6c16b`. A friend's page changes brought onto v11, and a tidier page.

- **Downloads named after the song**: `Last Train Home.wav` instead of `20260927-183418-last-train-home.wav`,
  for WAV, MP3 and FLAC, named by the server and the page alike (the characters Windows refuses in a file
  name are left out). A rename renames them. The Takes list's ⋯ menu has **Put the date in download
  names** to go back to the library name.
- **The DMM theme**: zinc and electric purple with cyan and neon green, Michroma headings and Space Grotesk
  text, and a larger play button with drawn play and pause icons. It is one of the themes in the picker;
  Studio stays the default. Its two fonts are also in the Appearance card's font menus.
- **The play button says Play or Pause** to screen readers as it changes.
- **A cleaner bottom bar** in the compose column: **Takes** (was Versions) beside two slim buttons of one
  size, with a note only when it matters (a run queued, the server away, codes loaded).
- **Long song names wrap** in the player (two lines, a size smaller) instead of being cut off.
- Headings get the room a tall font needs (DMM's were clipped); DMM's hover highlights are purple.
- **An Appearance card** on the Engine page (was Fonts): the theme, plus options for any theme (hover
  highlights in the theme's colour, a soft accent glow around cards, Rounded, Softer or Square corners, a
  calmer page without animations) and the three fonts. Kept per browser; **Default look** resets them.
- **The top bar**: the music note in the top-left corner opens this kit's GitHub page. The GPU readout is two
  small lines (the GPU, its memory in GB) right beside the Model menu, so it stays visible on a small monitor;
  the rest is in its tip.
- **Tidier text**: sizes in GB (not GiB), tips wide enough that their lines stay whole, a shorter Model tip,
  and more room between a number and its arrows in the compose boxes.
- **The Engine page**: the Writer and Appearance cards each have a row of their own.
- **About**: two columns, YuE2 on the left and the engine, the layout and ggml on the right. The layout's
  inspiration, YuE2_WebUI, has its own section, and the credit links this kit's GitHub page.
- The real-server test now checks the download names too; its screenshots are taken only on request.

## v11 (2026-09-27)

51 patches, tree `10b2ed565bc7fe787eaf654989198819bc4c421d`. Mostly from a real upgrade of an RTX 2070 laptop from v3 to v10.

- **Install and upgrade**:
  - the page test runs on a fresh install without building the page (it unpacks the committed one);
  - the emoji font check no longer reports an installed font as missing;
  - temp files and the compiler cache stay inside the install (`tmp/`, `tmp/ccache`), which also makes the
    next upgrade's rebuild much faster; ggml is downloaded once, not twice;
  - the step recorder is in place from the first code step;
  - SheetSage2 is checked by structure: its conversion merges weights in float32, which rounds differently
    on another CPU, so its bytes can differ while the file is correct;
  - the batch limit is one line in `start.sh`, shown and passed alike;
  - the upgrade path covers a running server, older installers' leftovers and the install's own README;
  - `verify-install` shows the current settings.
- **Safer scripts**: `convert-models.sh` touches only the files it makes and moves a rejected one to
  `tmp/rejected/` instead of deleting it; a failed checkpoint download keeps its resume data; `--check` and
  `--verify` write nothing; colours turn off for pipes and `NO_COLOR`; the downloaders cache pinned file
  lists; the GGUF download path is pinned too.
- **Page**: a steadier start (a library that fails to load no longer restarts everything); a finished song
  stays finished; Space on a focused song opens it without toggling playback; a server back with other LoRAs
  is picked up; opening a song no longer rebuilds the list; polls rest in a hidden tab; keyboard focus shows
  everywhere; selected text and hovered buttons stay readable in every theme; reduced motion stops the
  spinners; narrow windows keep their layout; unused styles are removed.
- **Tests**: the page suite takes about 60 s, always stops its browser and stand-in server, and a check
  whose probe fails now fails; the stand-in server answers bad input like the real one.

## v10 (2026-09-27)

50 patches, tree `0c1ff5bd25a9e13a687290796cc841de56912ba7`. The kit's git repository is named **yue2-kit**, ready for GitHub.

- **Workspace**: drag the lines between the three columns to size them (double-click resets). The Compose
  heading stands alone; the empty song page has a friendlier welcome.
- **Idea writer**: a two-line idea box that grows; Structure and the writer model each on their own line;
  a square **Chat Server Connected / Offline** button (green or red, always the same size, what to do in
  its tip) beside **Write the brief**.
- **Cover or remix** and **Supply your own score** cleaned up the same way: labels with their (i), one
  control per line, square buttons of one size on the left. **▶ Listen** plays a chosen recording first.
- **Drawer headings**: the name, and one sentence under it.
- **Fonts**: headings now use the text font (IBM Plex Sans, medium); a **Fonts** card on the Engine page
  changes the text, heading and number fonts per browser (the app's fonts first, then this computer's).
- **Fixes**: the page no longer waits on the web fonts or the score engraver to start; a tip stays open
  while the server log scrolls. The About card credits the layout's inspiration.
- **The repository**: a GitHub README with every download (link, pinned revision, size) and the project
  links, and clean screenshots from `tools/screenshots.mjs` (optional for a kit).

## v9 (2026-09-27)

The app is the same as in v6 to v8: 36 patches, tree `46618fde37a376e5c80eb46d5ce3fef9334e6456`.

- **The kit's name is back to `yue2-install-<date>-v<N>.zip`**, as the owner named it from the start
  (v6 to v8 were wrongly called `yue2-kit-vN.zip`).
- **The install guide describes the page as it is now**: the song page's grouped buttons and compact
  details card (Song | Sound | Shape, Sliders | LoRAs, seeds), the player bar's status pill, the About
  card, the logo links, double-click to play, the VAE hover notes. **7 fresh screenshots** instead of 4,
  including the song page (wide and narrow) and the About card.
- **Release checks**: a release now refuses screenshots older than the page, an install guide older
  than the last page change, or a missing page source or root script, and prints what the kit carries.

## v8 (2026-09-27)

The app is the same as in v6 and v7: 36 patches, tree `46618fde37a376e5c80eb46d5ce3fef9334e6456`.

- **The web page as plain files**: `page/src/` has the page's HTML, CSS and JS sources as they are
  edited, and `page/index.html` the whole built page in one file. Before, they were only inside the
  patches and a compressed copy.

## v7 (2026-09-27)

The app is the same as in v6: 36 patches, tree `46618fde37a376e5c80eb46d5ce3fef9334e6456`.

- **Install guide**: `git am` may warn about whitespace ("new blank line at EOF") while applying the
  patches; the guide now says that is harmless and that the tree check decides.

## v6 (2026-09-27)

The app: 36 patches (14 new), tree `46618fde37a376e5c80eb46d5ce3fef9334e6456`.

- **The kit is now a git repository, and a zip is an exact snapshot of one of its tags.** It carries the
  engine's changes in `engines/cpp/`:
  - one readable patch per change (the built page is no longer repeated in each: 1.2 MB instead of 12 MB);
  - `PATCHES.md`, a note per patch (what, why, which files) and how to use them safely;
  - `BASE.txt`, the upstream commit and date they were made for;
  - the built page, once.
- **Install or upgrade, safely**: `INSTALL.md` (was INSTALL-PROMPT.md) first checks for an install from
  an earlier kit and upgrades it (songs, models and settings stay). It never touches an existing yue2.cpp
  checkout: the engine is built in the install's own folder, as `upstream/` (clean) plus `build/` (the
  patched copy that is compiled). Kits before v6 had the engine in `repo/`.

- **Song page**: the details are one compact card (Song | Sound | Shape, Sliders | LoRAs, the seeds) instead of pills; the
  Composition, Performance and Style influence sliders are shown by position; Favourite, Rename and Delete are
  icons on the title line; the buttons sit in Download, Make again and Files groups; the music seed is no
  longer shown twice. The logo links out: YuE2 to the model's repo, CPP to the engine's.

## v5 (2026-09-26)

The app: 31 patches (9 new), tree `c2f76913c2ea42090cbf7a5b7a984e3f69241509`.

- **The F32 option is removed** (the top-bar button, Engine → Precision, and the server setting). It
  widened the BF16 weights to F32 for "clearer words", a claim that was never measured, while doubling
  the backbone's memory; on the owner's RTX 5090 the same song took about 60% longer. A `precision` key
  left in an older `settings.json` is ignored. Songs made with it still say so on their page.
- **Faster sound stage on NVIDIA** (from an RTX 2070 laptop's install): the attention keys are padded
  with masked rows to a multiple of 256, which lets CUDA use its faster grouped-query attention. On
  that laptop the output stayed byte-identical; on the owner's RTX 5090 each sound-stage step got 36%
  faster and the output is near-identical, not bit-identical (spectrum similarity 0.99998). Other
  backends are unchanged: there the padding is 0 and the graph is the one from before the patch (a CPU
  render on the owner's machine was byte-identical; CPU renders can still differ from run to run with the
  thread count, patch or not).
- **`--fp16-matmul` for RTX 20 / Volta** (compute 7.x, no BF16 tensor cores): batched BF16 matrix
  products run on the FP16 tensor cores. On that laptop a 196 s song went from 440 s to 215 s.
  `start.sh` turns it on by itself only on compute 7.x and says so; `YUE2CPP_FP16_MATMUL=0/1`
  overrides. It changes the output slightly: earlier seeds do not reproduce exactly.
- **The page**: the playing song's card is coloured; ▶ Play this song sits right after the song's title,
  and a double-click on a song in the list plays it; the number boxes step finely enough for the values
  the docs and model cards use (temperature 0.01, top-p 0.005, music repetition penalty 0.01, guidance
  0.01, LoRA strength 0.025, shown to three decimals when needed); `start.sh` prints the address as a
  clickable terminal link.
- **Colour**: the server's log is coloured on the terminal (errors red, warnings yellow, a finished
  song green, stage summaries bold, chatter dim; the page's log stays plain), and `start.sh` opens with a
  coloured stats block (GPU and memory in use, model sizes, LoRA and song counts, engine settings).
  `NO_COLOR=1` turns both off; so does piping to a file.
- **Docs**: GPU generations in section 1 (compute 8.0+, 7.x, 6.x); a measured "what to expect" table in
  section 7; never a `max_seq` below 12288 (8192 cannot fit a song, and kit v4's Mac row said 8192);
  `app/tools/kit/MACOS-NOTES.md`, the owner's direction for Macs (use MLX, not this C++ version).
- **Local changes kept outside `repo/`**: `tools/export-patches.sh` saves every local commit to
  `patches/local-changes.mbox` (and proves it rebuilds the exact tree); `tools/apply-patches.sh` puts
  them back onto a clean, newer upstream. `LOCAL-CHANGES.md` section 7 has the update steps.
- **Not verified**: `--fp16-matmul` on any compute 7.x card other than that laptop.

## v4 (2026-09-26)

Fixes from a real installation of v3 (which succeeded once these were worked around).

- **Downloader pinned.** `huggingface_hub 2.0.0` read `--include a b c` as one pattern plus file names
  ("Ignoring --include since filenames have been explicitly set"), exited 0, and left `particle-sliders`
  with about 1 MiB of metadata and no slider weights.
  - The download scripts now install `huggingface_hub[hf_xet]==0.36.2`, the verified version, from one
    declared file, `tools/downloader-requirements.txt`.
  - They share `tools/hf-env.sh`, and install into their own venv, `tmp/hf-venv`. The converter's
    `tmp/venv` and its package pins stay separate.
  - A wrong version already in the venv is replaced.
- **Include patterns are passed as literal words.** Before, the shell could expand them against files in
  the current folder: `weights/.../*` or `LICENSE*` could turn into local file names.
- **Downloads are checked, not trusted.**
  - After every download, and before any skip, `tools/hf_expect.py` compares the files with the pinned
    revision's own file list (names and sizes). The sliders are also checked against `catalog.json`:
    every weight, with its SHA-256.
  - The old "some `.safetensors` exists" skip is gone, so a partial download is fetched again, not taken
    as done.
  - Both download scripts gained a `--verify` mode.
- **Regression checks:** `tools/test_downloaders.sh`.
  - Offline, seconds: the argument shape reaching the downloader (with decoy files that the patterns
    would match), a stand-in downloader that exits 0 and fetches nothing, metadata-only, truncated and
    wrong-hash copies, and the LoRA subfolder case.
  - `--online`: the real pinned downloader must fetch exactly the files two include patterns name.
  - `make-kit.sh` runs the offline checks before every build.
- **WSL tool discovery:** `tools/check-machine.sh` finds `nvcc` (`/usr/local/cuda*/bin`) and
  `nvidia-smi` (`/usr/lib/wsl/lib`) even when they are not on PATH, before anyone proposes a CUDA
  install. It prints the PATH line, and never suggests a Linux NVIDIA driver inside WSL.
- **Dependencies split into three groups:**
  - core build: `ninja-build`, `python3-venv` (ensurepip) and `unzip` were missing on a fresh Ubuntu;
  - optional tests: Node.js 22+, Chrome, FLAC, FFmpeg;
  - page fonts: `fonts-noto-core`, `fonts-noto-color-emoji`, `fonts-noto-cjk` (the fullwidth "＋" in
    "＋ New song"). The fonts are checked glyph by glyph.
- **Real-server test works on a fresh install:** `tools/test-real.sh`.
  - It writes a labelled synthetic fixture take into an isolated `tmp/test-real/library`, starts its own
    CPU-only server on a free port with test settings, and runs the page checks plus a real 1-second
    generation, all under time limits.
  - It stops only the server and browser it started, and checks that the user's `outputs/` and
    `settings.json` were not touched.
- **Final check:** `tools/verify-install.sh` compares an install with the kit's
  `tools/expected-install.json`: the tree hash, every GGUF model and slider (by header), the LoRAs
  (pinned sizes, then the server's LoRA reader), `sources.json` and settings.
- **Harmless messages documented, not suppressed:** a missing NCCL library (single GPU), "no
  CUDA-capable device" in the CPU tests (the GPU is hidden on purpose), and `yue-server --help` exiting
  with status 1 after printing its usage.
- **Unchanged:** the patches, the pinned model revisions, the converter package pins, the settings, and
  `sources.json`.

### From the first macOS installation (v3 on an 8 GiB M1 Mac mini, macOS 26.6.2)

**Observed on that Mac, now fixed:**
- **No macOS path.** The runbook required Linux/NVIDIA. It now has a macOS path:
  - `tools/check-machine.sh` detects the OS, architecture, Xcode tools, CMake/Ninja (also
    project-local) and unified memory;
  - the verified Metal + Accelerate build line;
  - memory settings for Apple Silicon, labelled untested for full songs.
- **GNU-only commands** (`stat -c`, `numfmt`, `nproc`, `date +%N`, `df -B`, `readlink -f`, `taskset`,
  `find -printf`, `sha256sum`) were replaced with Python helpers or used only when detected. The
  scripts now run on macOS's own tools and on bash 3.2.
  - Checked by building GNU bash 3.2 here: it found a regex that bash 3.2 cannot parse (fixed), and
    that empty arrays under `set -u` abort (guarded).
- **The downloader dropped the slider weights** under huggingface_hub 2.0.0 (the same bug as above).
- **Launcher defaults:** `start.sh` insisted on a BF16 file even when `settings.json` picks Q5_K_M. It
  now starts the model `settings.json` picks, else the first copy present, before checking files; and
  `YUE2CPP_DRY_RUN=1` shows the command.
- **Browser tests:**
  - Chrome is now found in the macOS app bundle (or through `YUE2_CHROME`), and Node through
    `YUE2_NODE`.
  - Every run uses a fresh profile instead of the storage reset that hung.
  - Every DevTools command has a 60 s limit that names it.
- **Stand-in server:** it no longer does a reverse-DNS lookup of 127.0.0.1 (about 35 s on the Mac). The
  page test captures its errors, polls until it answers (90 s), and cleans up on every failure path.
- **Blend tooltip test:** it now hovers the label's note. The ADD-ON badge has its own check.
- **Real-server test:** up to 3 minutes to start (Metal shaders compile even for a CPU run), and a
  `--gpu` flag for a separately authorized GPU test.

**Found by code review, now fixed (these paths were not exercised on the Mac):**
- `convert-models.sh` used an undefined colour variable in its fallback branch, which aborts under
  `set -u`. The converter's packages are now checked by version, not just by import.
- **Interrupted conversions:**
  - every GGUF output is written as `.partial` and renamed when complete (`tools/gguf_atomic.py`);
  - leftovers are found by a real header and tensor-table check (`tools/gguf_check.py`) and made again;
  - quantize writes `.partial` too.
  - Tested here: a truncated output and a stray `.partial` were detected, remade, and came out
    byte-identical.

**Added:**
- **Low-memory conversion** (automatic below 16 GiB, `YUE2_LOWMEM`): gguf's `use_temp_file`, with the
  temporary file in the project. Measured here: a 1.5 GB peak for the 7.2 GB backbone, with
  byte-identical output. It needs about 7.5 GB more free disk while running.
- **Exact vs structural checks:**
  - `verify-install.sh` checks converted files by SHA-256 (21 of 22 matched on the Mac);
  - quantized copies are checked by tensor structure, since they differ across platforms (the Mac's
    Q5_K_M differed in 392 of 627 tensors' Q5_K/Q6_K data, with identical names, shapes and types).
- **Install records:** `tools/record.sh` keeps commands, times, exit codes, retries, notes and version
  snapshots in `install-record/`.

**Still not verified:**
- generating on Metal;
- full-length songs, and BF16 inference on a Mac;
- covers and transcription on a Mac, and every add-on combination;
- other Apple hardware and older macOS versions.

## v3 (2026-09-26)

Rebuilt by the owner with the v2 builder; the same contents as v2.

## v2 (2026-09-26)

- Every root script and the whole `tools/` folder are copied by rule.
- Every Hugging Face download is pinned to the revision the owner's files came from
  (`tools/hf-revisions.txt`); the converter's packages are pinned too
  (`tools/converter-requirements.txt`).
- The build stops on any gap: a LoRA missing from the download list, a model file no step makes, stray
  files.
- Added `MANIFEST.txt`, and kit version numbers.

## v1 (2026-09-26)

- The first kit for the C++ app alone, installed exactly like the owner's folder.
