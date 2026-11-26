# Installing Ruach Studio

One Linux machine with an NVIDIA card. The Studio runs there; you use it from a browser on that machine or on any other machine of your home network. Nothing goes to a cloud unless you ask (OpenRouter for the Writer, if you choose it). On Windows 11 the Studio runs natively from its own zip and `RuachStudio.exe` ([INSTALL_WINDOWS.md](INSTALL_WINDOWS.md)); on a Mac with Apple Silicon from its own zip too ([README › Windows and macOS](README.md#windows-and-macos-native-beta)).

## What it needs

| | |
|---|---|
| system | Linux x86_64. Made and tested on **Ubuntu 24.04** (kernel 7.0, driver 595). |
| GPU | NVIDIA, **24 GB** runs everything at full precision; **8 to 16 GB** run songs with the Q8_0 model (measured: 5.1 GB with a context of 12 288 rows, 7.7 GB with the whole); **6 GB** Q8_0 with shorter songs, less Q6_K; int8 training under 24 GB. |
| CUDA | the **CUDA toolkit 12.8** (`nvcc`), in `/usr/local/cuda-12.8` or on the `PATH`; a driver that supports it |
| tools | `git`, `cmake` 3.24 or newer, `ninja` (optional, faster), `gcc`/`g++` 13, `python3.12` with `python3.12-venv`, `ffmpeg`, `curl` |
| disk | **29.3 GB** for the install on a 12–16 GB or 8 GB card, **36.0 GB** on a 24 GB card, measured file by file (the models by the pinned lists 12.11.2026, the base set of 2.1.0 23.11.2026, the program and its Pythons on a fresh install 01.11.2026): the program 0.9 GB, its two Pythons 16.5 GB (8.7 GB downloaded), the models 11.9 or 18.6 GB (the whole of YuE2: Ruach Studio's own fine-tune and m-a-p's backbone at the card's quant, two decoders, the transcriber with its Refined mode); the Musician's other parts (7.8 GB) and each other room only when you take it (the Writer's 6 to 7 GB, the Refiner's 6 GB, the Narrator's 26 to 42 GB, the Artist's 39 to 43 GB, the Videographer's 86 GB, the Trainer's 13 to 20 GB): [README › What It Downloads](README.md#what-it-downloads); and room for your songs |
| tests only | `flac` and `metaflac` (`sudo apt install flac`) for the FLAC test; Node.js 22+ and Chrome or Chromium for the page tests. The Studio itself needs none of them: FLAC is made by the engine and by ffmpeg |

On Ubuntu 24.04, everything but CUDA in one line:

```bash
sudo apt install git cmake ninja-build build-essential python3.12-venv ffmpeg curl
```

CUDA 12.8: NVIDIA's own repository for Ubuntu 24.04 (developer.nvidia.com → CUDA Toolkit 12.8 → Linux → x86_64 → Ubuntu → 24.04), the `cuda-toolkit-12-8` package.

## Install

```bash
git clone https://github.com/igrbible/Ruach_Studio.git Ruach_Studio && cd Ruach_Studio

./lab/install-venv.sh      # Python: torch for CUDA 12.8 and the Studio's packages, in .venv and the Artist's .venv-art (16.5 GB together, 8.7 GB of it downloaded), a few minutes
./fetch-models.sh          # every model the Studio uses, pinned and checked (asks before the big ones)
./build.sh --server        # the page and the engine (the first build of the engine: a few minutes)
./systemd/install-units.sh # the two services
systemctl --user enable --now heresy-lab ruach-studio
```

**The Studio's port is 7777.** Open **http://127.0.0.1:7777** (on the same machine), or **http://THE-MACHINE'S-ADDRESS:7777** from another one on your network: `start.sh` prints it. The Studio answers this machine and private networks only (10.x, 172.16–31.x, 192.168.x, Tailscale's 100.64.x), never the internet (opened by a Tailscale address, it wants that address named: `RUACH_HOSTS=100.101.102.103`); its first start asks who may open it (this computer only, private networks, or the networks you list), and Engine → Security changes it.

To have it running after a reboot without logging in: `sudo loginctl enable-linger $USER` (once).

Without systemd: `./lab/start-lab.sh` and then `./start.sh` (it stays in the terminal).

### More, when you want it

```bash
heresy/fetch-heresy.sh --listener Q8_0   # the style listener (Qwen2.5-Omni) for training sets, 9.6 GB
heresy/fetch-heresy.sh --artwork         # the covers' helpers: the prompt writer and the content filter, 8.4 GB (the painters come with --qwen)
heresy/fetch-heresy.sh --qwen 2512-q4    # the Artist's Qwen-Image 2512 at Q4 with Lightning (Apache-2.0), 31 GB, a 16 GB card (2512-q6: 34.5 GB, 24 GB; 2.1: 33 GB, research licence)
heresy/fetch-heresy.sh --trainer bf16    # the base the LoRA trainer trains on, with MERT-v2-FullSong and the tokenizer head, 10.5 GB (int8: 6.7 GB)
heresy/fetch-heresy.sh --backbone BF16   # the full backbone beside a Q8_0 one, 7.2 GB
heresy/fetch-heresy.sh --fw 3.4x0.75-Q8_0   # another merge of Ruach Studio's own fine-tune (seven, each at BF16, Q8_0 and Q6_K); the Studio's default, RS-TW 2.0x0.75, comes with the install
./fetch-models.sh --check                # what is here, what is missing; downloads nothing
```

## In one script

`bash launcher/install.sh` does the steps above in one go, in the Studio's folder: it checks the machine, makes the Python environments, builds the engine and fetches the models with the backbone your card takes (BF16 from 24 GB, Q8_0 from 7, Q6_K below). Each step says what it does, and a step that fails ends the install with its reason on the last line; run it again and it goes on from there. Beside it, `bash launcher/extras.sh` brings the Artist's painter, the style listener, the trainer's base and, where the install took Q8_0, the BF16 backbone, each asked first with its size; `bash launcher/update.sh` takes the newest release (the code, the Pythons, the page, the engine when its code changed, the models it pins); `bash launcher/reset.sh` takes away the Python environments and the engine's build, never your songs, models or settings. Then start the Studio as above: the two services, or `./lab/start-lab.sh` and `./start.sh`.

Pinokio (Linux only, unsupported): its menu runs `bash launcher/install.sh --yes` (`--yes`: the models without their question), then the lab and `./start.sh`; on Windows and macOS it points to the Studio's own packages.

### Moving from a Pinokio install

Pinokio is not supported since 2.1.0-rc3 (25.11.2026). Its install is a clone of this repository in Pinokio's home (`~/pinokio/api/Ruach_Studio.git`, or under the home Pinokio's settings name), and what is yours is in that folder: the models in `models/`, your LoRAs and settings in `user/`, your songs in `outputs/`. Pinokio's bundle brought CUDA 12.8, git and ffmpeg: give the machine its own first ([What it needs](#what-it-needs)). Then, with Pinokio closed, take the folder out of it and install over it; the models already there are checked and kept, not downloaded again:

```bash
mv ~/pinokio/api/Ruach_Studio.git ~/Ruach_Studio && cd ~/Ruach_Studio
bash launcher/reset.sh                              # the Pythons and the engine Pinokio's toolchain built; songs, models and settings stay
RUACH_UPDATE_CODE_ONLY=1 bash launcher/update.sh    # the newest code
bash launcher/install.sh                            # the Pythons, the engine and the models, with the machine's own toolchain
```

## Intel Arc (beta)

An Intel Arc card runs the engine too, as a beta with no guarantees: songs in every mode, adapters, Extend and going on from kept music. Measured on an Arc Pro B50 (16 GB): a song of 30 s in 43 s (BF16) to 60 s (Q8_0, Full with an adapter), where an RTX 3090 takes about 12 s. On Arc, BF16 is the fastest copy; Q8_0 and Q5_K_M save memory, not time. Training, the Artist and the Refiner's GPU steps still want an NVIDIA card, and `launcher/install.sh` installs the NVIDIA way only.

It needs Intel's GPU driver with Level Zero (the compute runtime) and Intel's **oneAPI Base Toolkit** in `/opt/intel/oneapi` (icpx and the SYCL runtime). Then, in the steps above, instead of `./build.sh --server`:

```bash
./build.sh --sycl             # the engine for Intel Arc, in build/build-sycl (a CUDA engine beside it stays as it is)
YUE2_ENGINE=sycl ./start.sh   # or plain ./start.sh, where there is no CUDA engine
# or, with both engines built: Engine → GPUs, the Arc's radio in the «studio» column, Save, Restart (HERESY 2029)
```

With systemd and both kinds of engine on one machine: `systemctl --user edit ruach-studio`, and under `[Service]` the line `Environment=YUE2_ENGINE=sycl`. Several Intel GPUs: `ONEAPI_DEVICE_SELECTOR=level_zero:0` picks one. The kernels are compiled at each start (a few seconds before the first song): oneAPI's kernel cache stays off, because with it libsycl 2026.1 fails at the first kernel.

## After an update

```bash
git pull
./build.sh                 # the page (and the engine, when its code changed; then the restart, when the Studio is idle)
```

The page is read from disk at every load: `./build.sh` and a reload of the browser tab are enough.

## Tests, if you want to see it work on your machine

```bash
tools/test-real.sh                         # the engine on the CPU, its page and a 1-second song, in a library of its own (1–4 minutes)
node tools/cdp-console.mjs                 # the page against a stand-in server (about 2 minutes)
node heresy/tools/check-player.mjs         # the player: a click plays, play-on goes to the next take
tools/test_downloaders.sh                  # the model downloaders, offline
.venv/bin/python tools/test_flac.py        # the engine's FLAC against the reference flac (needs flac and metaflac)
```

Measured on the machine it was made on: 6 passed (the page part 14), 470 passed and 7 skipped, 3, 14 and 18 passed. None of them touches your songs, your settings or your services; the real-server test proves it at its end. The page tests take Chrome from `YUE2_CHROME` when it is not on the `PATH`; on Ubuntu 24.04, Playwright's *Chrome for Testing* needs `--no-sandbox` there (AppArmor), Google Chrome's own package does not.

## When something is wrong

| what you see | why | what to do |
|---|---|---|
| `build.sh` stops at cmake | no CUDA toolkit, or `nvcc` not found | install CUDA 12.8; `export PATH=/usr/local/cuda-12.8/bin:$PATH` |
| the page: *Forge is not answering* or a red lamp | the engine is not running | `systemctl --user status ruach-studio`; `journalctl --user -u ruach-studio -n 50` |
| *no card can take this now* | another program holds the card, or the job does not fit | the message names the program and the card; Engine → GPUs says which card does what |
| 403 «does not answer this name» | the Studio was opened by a name, not by an address: whoever answers for a name on a network (a site on the internet, the router's own names) can point it at any machine; or by a Tailscale address (100.64–127.x), the carrier-grade NAT's shared space | open it by its address on your network (or http://localhost:7777 on the Studio's own machine), or name it in the Studio's environment: `RUACH_HOSTS=studio.example.org` (a Tailscale address the same way: `RUACH_HOSTS=100.101.102.103`) |
| the Studio blank inside another page (a page of your own) | the Studio lets only its own pages (and `http://localhost:42000`) put it in a frame | name that page in the Studio's environment: `RUACH_FRAME_ANCESTORS=http://host:port` (commas or spaces between several) |
| 403 from another machine | it is not on a private network, or Engine → Security keeps the Studio to its own computer or to the networks listed | open it from your home network, or change Engine → Security on the Studio's computer (deleting `user/access.json` goes back to private networks); or put your own proxy and guard in front (`RUACH_ALLOW_PUBLIC=1`) |
| the Writer says *no chat server* | none is set | Engine → Chat server (vLLM, LM Studio, Ollama on your machine), or OpenRouter with your key in the Writer |
| upscale, stems or the lyrics check refuse | their models are missing | `./fetch-models.sh` (or `--check` to see which) |

The guide inside the Studio (the **?** in the bar) explains every room. `docs/API.md` is the API; `CHANGELOG.md` what is in this version; `heresy/docs/HERESY.md` every change with what was measured.
