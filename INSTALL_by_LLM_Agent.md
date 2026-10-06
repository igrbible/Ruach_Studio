# Installing Ruach Studio · for an AI agent

You are installing Ruach Studio for a person, on their Linux machine. Read `INSTALL.md` first: it is the same install
for people. This file adds what an agent needs: what to check before each step, what success looks like, where to
stop and ask, and what never to do.

## Rules

- **Ask before anything large or lasting**: a download over 1 GB, installing system packages (`sudo`), enabling
  services, `loginctl enable-linger`. Say the size and what it is for.
- **Never** run the studio as root, never put a token or key in a file of the repository, never set
  `RUACH_ALLOW_PUBLIC` (it opens the studio past the private network) unless the person asks in those words.
- **Never** set `CUDA_VISIBLE_DEVICES` for the studio: it picks its cards itself and refuses a card another heavy
  program holds. To give it another card: `YUE2CPP_GPU=N` for `start.sh`, or Engine → GPUs in the page.
- Downloads come pinned (`heresy/hf-revisions.txt`, `tools/hf-revisions.txt`) and are checked after; do not fetch
  models from elsewhere "to save time". The models' licences are mostly non-commercial: tell the person once.
- If a step fails, read its output, fix the cause, run the step again. Every step is safe to repeat.

## 0 · Check the machine

```bash
uname -m                                   # x86_64
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
command -v nvcc || ls /usr/local/cuda-12.8/bin/nvcc     # CUDA 12.8
cmake --version | head -1                  # 3.24 or newer
python3.12 --version
command -v git ffmpeg curl
df -h .                                    # 70 GB free or more
```

Missing pieces: tell the person, with the command (`sudo apt install git cmake ninja-build build-essential
python3.12-venv ffmpeg curl`; CUDA 12.8 from NVIDIA's repository). With less than 12 GB of GPU memory, say that only
short songs on the smallest model will run.

## 1 · Python

```bash
./lab/install-venv.sh
```

Success: its last line starts with `ok torch` and says `cuda True`. It also clones `vendor/UniverSR` (the upscale's
code) at the commit the studio was tested with.

## 2 · Models

```bash
./fetch-models.sh --check     # what is here and what is missing; nothing downloaded
./fetch-models.sh             # after the person agreed to the size
```

Success: the last line counts `missing 0 · failed 0`. On 12–16 GB cards, `./fetch-models.sh --quant Q8_0` (or `Q6_K`,
`Q5_K_M`) instead of the BF16 model. The extras (`heresy/fetch-heresy.sh --listener`, `--artwork`, `--trainer`) only
when the person wants them; each asks with its size.

## 3 · Build

```bash
./build.sh --server --no-restart
```

Success: `build/build/yue-server` exists and `build/tools/public/index.html` was written. The first build of the engine
compiles CUDA kernels for the card in the machine: a few minutes (two on a 32-core machine), mostly silent.

## 4 · Run

```bash
./systemd/install-units.sh
systemctl --user enable --now heresy-lab ruach-studio
sleep 5
curl -s http://127.0.0.1:41867/api/v1/health      # {"lab": true, "engine": {...}, "cards": [...]}
curl -s http://127.0.0.1:41867/api/v1 | head -c 200   # the studio's version
```

Then give the person the address `start.sh` printed (`journalctl --user -u ruach-studio | grep -m1 http`), and say:
the **?** in the bar is the guide.

## 5 · A first song, to prove it

Only with the person's agreement (it uses the GPU for a minute):

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"style":"Instrumental, solo piano, calm","instrumental":true,"duration":20,"workspace":"First test"}' \
  http://127.0.0.1:41867/api/v1/songs
# then GET /api/v1/jobs/ID until "done"; the take is in the Librarian, workspace "First test"
```

## 6 · The tests, when the person wants them

They need `flac` and `metaflac` (the FLAC test), Node.js 22+ and Chrome or Chromium (the page tests): ask before installing
any. None touches the person's songs, settings or services.

```bash
tools/test-real.sh                   # expect: 6 passed, 0 failed
node tools/cdp-console.mjs           # expect: 314 passed, 0 failed, 8 skipped (the skips say why)
node heresy/tools/check-player.mjs   # expect: 3 passed
tools/test_downloaders.sh            # expect: 14 passed (offline)
.venv/bin/python tools/test_flac.py  # expect: 18 passed
```

## If it goes wrong

`journalctl --user -u ruach-studio -n 80` and `journalctl --user -u heresy-lab -n 80` say why. `INSTALL.md` has the
common cases. The engine refusing a card names the program that holds it: ask the person before stopping anything of
theirs.
