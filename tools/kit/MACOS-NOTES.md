# macOS notes (notes only)

Nothing in this file is built, installed or implemented by this kit. It records the owner's direction
for Macs and the facts from the first macOS installations (handoff of 2026-09-26), so the next Mac
installation starts from them.

## The owner's direction for a Mac

**Do not build the C++ (GGML) version of this app on a Mac. Use the MLX engine, with the owner's
improvements.**

- The owner's improvements are everything `LOCAL-CHANGES.md` lists: the page and its look (themes,
  Engine page, tiles, badges, help), the song library, LoRAs, the particle sliders, the VAE choices,
  settings, FLAC/MP3 downloads, and the rest. On a Mac they belong on top of the MLX engine.
- **None of that is ported to MLX yet.** The C++ server cannot load MLX packages, and the page's model
  menu is not connected to MLX. Downloading the MLX weights is not integration.
- **Why:** a full song on the C++ version with Metal is far too slow on the tested Mac (below): 182.92 s
  of audio took 1,702.3 s. The same app on an RTX 5090 made 164.8 s of audio in 90.3 s.
- The kit's C++ build steps (INSTALL-PROMPT.md sections 4 and on) are for Linux/WSL with NVIDIA. Its
  macOS lines record what was tried; they are not the way to install on a Mac.

## Sources and pinned identities

- MLX engine and its three converted model variants: https://huggingface.co/ahmadw/YuE2-3B-MLX at
  revision `fe0a9050fd658257b486b880422d8872ee1f81e3`. The engine files at that revision are
  `generate.py`, `yue2_model.py` and `yue2_vae.py`.
- MLX framework: https://github.com/ml-explore/mlx; install docs:
  https://ml-explore.github.io/mlx/build/html/install.html; tested release 0.32.2.
- This app (C++/GGML): https://github.com/ServeurpersoCom/yue2.cpp; GGUF models:
  https://huggingface.co/Serveurperso/YuE2-GGUF.
- Original weights: https://huggingface.co/m-a-p/YuE2-3B and https://huggingface.co/m-a-p/YuE2-Vae.
- Other MLX implementations, **researched only, not installed or tested**, so none of their features or
  benchmarks belong to the engine above: https://github.com/Rdx-ai-art/yue2-mlx.pinokio and
  https://github.com/daig/yue2-mlx.
- The Mac's C++ install was kit v3: upstream `f17d5268483db25c9d79a9d53967f9d31fd1ccd3` + 22 patches,
  ggml `765bc96f9bb8d4c397c91c23b4e5c52a93fcf9b0`, tree `d48e6e2e4a4e9bff24f8f60c943eddd976358df1`.
- Keep the upstream notices, model READMEs and licence files beside the pinned manifests.

## The tested Mac

- An Apple M1 with 8 GiB of unified memory, native arm64, on a current macOS with Python 3.14, Apple
  Clang 21, CMake 4.4 and Ninja 1.13.
- The C++ app and the MLX project live in separate folders (the MLX engine and models under
  `YuE2-3B-MLX/`, its Python under `.venv/`); an installer takes the folders as parameters.
- The MLX engine is the Python code from the model repository above, on MLX 0.32.2 and Metal. It needs
  no PyTorch and no CUDA.

## MLX models (downloaded and verified on the Mac)

| Folder | Backbone bytes | Quantization | Tested |
| --- | ---: | --- | --- |
| `bf16/` | 7,261,441,586 | BF16 | download, hash and header checks only; never loaded |
| `8bit/` | 4,264,488,042 | 8-bit affine, group 64 | short music + sound + VAE run passed |
| `4bit/` | 3,370,707,798 | 4-bit music half, 8-bit sound half, group 64 | short music + sound + VAE run passed |

- Each folder also holds a 265,441,814-byte F32 VAE, the tokenizer and the configs. The whole
  repository is 25 files, 15,700,696,396 bytes. All sizes and upstream hashes matched; all six
  safetensors files passed structural checks.
- The "4bit" variant's sound half is 8-bit: there is no 4-bit sound path.
- Backbone and VAE SHA-256:

```text
bf16 e6012e94aca961eebc2f57ae0c5417b1f40125c33c41e5f3a6ca0b28982361f7
8bit bb6ff9895114be4aaa6e1b3a7d272eee55b54c9e619716c67355b45673fe3d7c
4bit b782c22ef2d34a233e45106793b8248b0a2ef9de7e823177b02d4bab6e6b05ac
VAE  dc7bea8e4f8e764be6ee2ce3291606a5381aaa20f5c4eb26e86ca81dd1eeac6e
```

## The MLX environment as it was set up

Native arm64 Python only; refuse an x86/Rosetta Python with a clear message. MLX lists macOS 14 or newer;
only 26.6.2 was tested. Prebuilt MLX wheels, no MLX compile.

```sh
mkdir -p ~/work/yue2-mlx && cd ~/work/yue2-mlx
python3.14 -m venv .venv
.venv/bin/python -m pip install mlx==0.32.2 mlx-metal==0.32.2 numpy==2.5.3 tiktoken==0.14.0 huggingface_hub==2.0.0
.venv/bin/python -m pip freeze > requirements.lock.txt
.venv/bin/python -c 'import platform, mlx.core as mx; print(platform.machine(), mx.__version__, mx.device_info())'
```

- For an exact copy, install from that Mac's full `requirements.lock.txt` instead of resolving again.
- The download used the Python API with an explicit pattern list (not the `hf` command line, whose
  `--include` misread several patterns under huggingface_hub 2.0.0, see CHANGELOG v4):

```sh
.venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(repo_id="ahmadw/YuE2-3B-MLX", revision="fe0a9050fd658257b486b880422d8872ee1f81e3",
    local_dir="YuE2-3B-MLX",
    allow_patterns=["*.py", "README.md", ".gitattributes", "bf16/*", "8bit/*", "4bit/*"], max_workers=2)
PY
```

- A download is not done until every file's size and hash is checked. The Mac's handoff bundle has
  `scripts/download-models.py`, which does that and resumes. Download to temporary names and mark a
  variant ready only after the check. Reuse verified files; do not copy the weights into another cache.

## The Mac's MLX wrapper (its memory settings)

The handoff bundle has `run-mlx.sh`, `scripts/run-engine.py`, `scripts/download-models.py`,
`scripts/smoke-test.py` and the version records. The downloaded upstream code is unchanged. The wrapper:

```python
mx.set_cache_limit(128 * 1024 * 1024)
mx.set_memory_limit(mx.device_info()["max_recommended_working_set_size"])
```

- It decodes with `decode_tiled(latents, core=64)` (upstream default 1,024 frames; `--vae-tile` sets
  it). That changes only the VAE tiling. Tile seams on full songs are not checked yet.
- The M1 recommends a 5,726,633,984-byte Metal working set (about 5.33 GiB). That is a device
  recommendation, not the RAM size; the wrapper budgets to it.
- BF16 backbone + VAE weights alone need about 7.01 GiB, so the wrapper refuses BF16 on this Mac. Never
  claim BF16 full songs on an 8 GiB Mac from a successful download.
- Mixed 4-bit is the 8 GiB candidate; 8-bit when memory allows. Not yet shown to make a full song.
- Never lower the steps, cut songs short or switch precision silently. Do not copy a
  `total RAM - 8 GiB` formula onto an 8 GiB machine or raise system memory limits instead of budgeting.
- Launch example (a new output name each time: the upstream writer overwrites):

```sh
cd ~/work/yue2-mlx && mkdir -p outputs
./run-mlx.sh 4bit --style "acoustic folk, warm vocals" --lyrics-file /absolute/path/to/lyrics.txt \
  --cot full --steps 32 --vae-tile 64 --out outputs/new-song.wav
```

It writes dated logs. It has no browser page.

## What is measured, and what is not

- **C++/GGML with Metal, Q5_K_M**: one full song, 182.92 s of audio in 1,702.3 s, including two
  diagnostic pauses. The sound stage dominated: about 41-43 s per step, 32 midpoint steps (64 model
  passes). Its audio quality was not judged.
- **MLX mixed 4-bit and 8-bit**: a 16-frame, one-step run each (music, sound and VAE), giving 0.639 s of
  finite, non-silent stereo. Peak MLX memory about 3.77 GiB (4-bit) and 4.63 GiB (8-bit). The 4-bit
  launcher passed too. BF16: file checks and the expected memory refusal only.
- **One operation, not a song**: attention on real saved inputs from two sound-stage layers took about
  234 ms in MLX FP16, 321 ms MLX BF16, 413 ms MLX FP32, against about 350 ms in GGML without the mask.
  FP16 differed by about 0.0208% RMS. Do not convert the model to FP16 on this evidence.
- **GGML experiments on the Mac** (not in this kit): about 100 MiB of redundant zero-mask memory and
  214 MiB kept for debug probes. Removing the mask gave a small speed-up with identical velocities;
  dropping unused probe memory saved memory, no speed. Widening all sound-stage weights to F16 cost
  about 1.7 GiB for about 1.5% speed: rejected for 8 GiB. A one-line 8-to-16-row attention change was
  wrong and must not ship; a corrected simple version was slower.
- **Not tested at all**: a full MLX song, MLX with LoRAs, sliders, covers, transcription or the other
  VAEs, and MLX seed reproducibility (MLX draws differ from GGML's: compare backends with the same saved
  tokens and noise, not the same seed numbers).

## Porting the owner's improvements to MLX (to do, nothing started)

- A backend and model choice: GGUF files go to the C++ engine, MLX packages to an MLX worker. Check the
  worker's dependencies and the model before a job starts.
- The MLX worker takes the page's request format and returns progress (score, music, sound, VAE),
  errors and output paths, so the existing page, library and settings work on it.
- Keep style, lyrics, a supplied score, steps, seeds, cancel and the library. Every control MLX cannot
  honour yet (LoRAs, sliders, covers, transcription, other VAEs) must say so, not be ignored.
- Cancel stops the worker's whole process group and frees the GPU memory. One GPU job at a time; never
  benchmark beside a song being made.
- Check context and memory before a job, with a clear message when it cannot fit. Keep the user's songs,
  settings and server configuration through the change.

## `start.sh` on a Mac (to make with the port)

The Mac version ships one `./start.sh` that starts the MLX worker and the page, looking like the owner's
Linux one:

- **Colours with meaning**: bold title, green address, yellow for anything missing or reduced, red for
  what stops it, dim for hints.
- **A stats block** before it starts: the engine (MLX and its version), the model variant (4bit / 8bit)
  and the other variants present, the Metal working-set budget it will stay under (not the RAM size),
  the VAEs, LoRA and slider counts, the library's song count, and every control MLX cannot honour yet.
- **The page's address as a clickable link**: an OSC 8 terminal hyperlink when printing to a terminal,
  the plain address otherwise (exactly as this app's `start.sh` does; see its `link` function).
- It runs in the foreground with the console output visible, Ctrl-C stops the worker's whole process
  group, and a dry-run switch (like `YUE2CPP_DRY_RUN=1` here) prints the commands it would run.
- It finds its folder from its own location (never a fixed path or the current folder) and runs on
  macOS's own `/bin/bash` 3.2.

## The handoff's installer list against kit v4

| Item | In kit v4 |
| --- | --- |
| GNU-only commands (`df -B`, `stat -c`, `nproc`, `taskset`, `/proc`) | replaced with portable helpers; scripts run on bash 3.2 |
| slider weights missing though the download "succeeded" | pinned downloader, literal patterns, every file checked by size and hash |
| low-memory GGUF conversion, atomic outputs | done (automatic below 16 GiB) |
| launcher and settings picking different models | done |
| Metal shader start-up time | the real-server test waits up to 3 minutes |
| Chrome on macOS, fresh profile, DevTools time limits, reverse DNS, Blend tooltip test | done |
| interrupted downloads/conversions, install records, exact vs quantized hashes | done |
| `--help` exits 1 | handled in the checks; the server is unchanged |
| HTTP 406 without `Accept-Encoding: gzip` | unchanged (browsers send it; a scripted client must) |
| **context budget** | **docs fixed after v4, code not.** The default song budget is 9,000 music tokens, so a context of 8,192 fails: `prefix 1548 + budget 9000 + end exceeds context 8192`, and only after the score is written. Kit v4's Apple Silicon table said 8192 for 8 GiB; the next kit says 12288 and warns. Working the need out per song, before the score, is still to do. |
| "Metal generation not verified" in kit v4's text | outdated: the full GGML Metal song above completed |

## References

- MLX 0.30's Neural Accelerator support is for M5 chips only, not an M1 upgrade:
  https://github.com/ml-explore/mlx/releases/tag/v0.30.0
- Metal attention precision fix: https://github.com/ml-explore/mlx/pull/3119
- `force_fused` attention option (a bounded-memory fused path for supported shapes, not a general speed
  switch): https://github.com/ml-explore/mlx/pull/4185
