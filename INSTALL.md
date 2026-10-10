# Installing Ruach Studio

One Linux machine with an NVIDIA card. The studio runs there; you use it from a browser on that machine or on any other machine of your home network. Nothing goes to a cloud unless you ask (OpenRouter for the Writer, if you choose it).

## What it needs

| | |
|---|---|
| system | Linux x86_64. Made and tested on **Ubuntu 24.04** (kernel 7.0, driver 595). |
| GPU | NVIDIA, **24 GB** runs everything at full precision; **16 GB** runs songs with the Q8_0 model; **12 GB** with Q6_K or Q5_K_M (shorter songs, int8 training). |
| CUDA | the **CUDA toolkit 12.8** (`nvcc`), in `/usr/local/cuda-12.8` or on the `PATH`; a driver that supports it |
| tools | `git`, `cmake` 3.24 or newer, `ninja` (optional, faster), `gcc`/`g++` 13, `python3.12` with `python3.12-venv`, `ffmpeg`, `curl` |
| disk | about 10 GB for the program and its Python, **30–60 GB** for the models (the download says each size first), and room for your songs |
| tests only | `flac` and `metaflac` (`sudo apt install flac`) for the FLAC test; Node.js 22+ and Chrome or Chromium for the page tests. The studio itself needs none of them: FLAC is made by the engine and by ffmpeg |

On Ubuntu 24.04, everything but CUDA in one line:

```bash
sudo apt install git cmake ninja-build build-essential python3.12-venv ffmpeg curl
```

CUDA 12.8: NVIDIA's own repository for Ubuntu 24.04 (developer.nvidia.com → CUDA Toolkit 12.8 → Linux → x86_64 → Ubuntu → 24.04), the `cuda-toolkit-12-8` package.

## Install

```bash
git clone https://github.com/igrbible/Ruach_Studio.git Ruach_Studio && cd Ruach_Studio

./lab/install-venv.sh      # Python: torch for CUDA 12.8 and the studio's packages, in .venv (about 8 GB, a few minutes)
./fetch-models.sh          # every model the studio uses, pinned and checked (asks before the big ones)
./build.sh --server        # the page and the engine (the first build of the engine: a few minutes)
./systemd/install-units.sh # the two services
systemctl --user enable --now heresy-lab ruach-studio
```

Open **http://127.0.0.1:41867** (on the same machine), or **http://THE-MACHINE'S-ADDRESS:41867** from another one on your network: `start.sh` prints it. The studio answers this machine and private networks only (10.x, 172.16–31.x, 192.168.x, Tailscale's 100.64.x), never the internet.

To have it running after a reboot without logging in: `sudo loginctl enable-linger $USER` (once).

Without systemd: `./lab/start-lab.sh` and then `./start.sh` (it stays in the terminal).

### More, when you want it

```bash
heresy/fetch-heresy.sh --listener Q8_0   # the style listener (Qwen2.5-Omni) for training sets, 9.6 GB
heresy/fetch-heresy.sh --artwork         # artwork for takes (CyberRealistic XL + Qwen3-4B), 14 GB, a 16 GB card
heresy/fetch-heresy.sh --trainer bf16    # the base the LoRA trainer trains on, 7.8 GB (int8: 4.0 GB)
heresy/fetch-heresy.sh --backbone BF16   # the full backbone beside a Q8_0 one, 7.2 GB
./fetch-models.sh --check                # what is here, what is missing; downloads nothing
```

## With Pinokio

[Pinokio](https://pinokio.co) installs and starts the studio from its menu, on the same kind of machine: Linux x86_64 with an NVIDIA card. In Pinokio, download it from its address, `https://github.com/igrbible/Ruach_Studio`, and press **Install**. Pinokio first brings its AI bundle (conda, git, ffmpeg, uv and the CUDA toolkit 12.8; your own `/usr/local/cuda-12.8` is used instead when it is there), then the install does what the steps above do: the Python environments, the engine, and the models with the backbone your card takes (BF16 from 24 GB, Q8_0 from 16, Q6_K from 12). Each step says what it does, and a step that fails ends the install with its reason on the last line; **Install again** goes on from there.

**Start** runs the lab and the studio, each in a terminal of its own, and **Open the studio** opens the page (from another machine of your network: the address `start.sh` prints in that terminal). **More models** offers the Artist's painter, the style listener, the trainer's base and, where the install took Q8_0 for a smaller card, the BF16 backbone, each asked first with its size. The install itself brings the LoRAs the studio's 💎 sets were made with; a download that fails says why, and **Install** again goes on from where it stopped. The studio's **Engine → Models and LoRAs** says the same from inside: what is here, what is missing, and a **Fetch** for each part and for every extra, each asked first with its size. **Update** takes the newest release; **Reset** takes away the Python environments and the engine's build, never your songs, models or settings.

The work is done by the bash scripts in `pinokio/`, which run the same from a terminal (`bash pinokio/install.sh`). Under Pinokio there are no systemd units: stop, start and update the studio from Pinokio's menu. On Windows 11 the studio runs through WSL2, by hand for now ([INSTALL_WINDOWS.md](INSTALL_WINDOWS.md)).

## After an update

```bash
git pull
./build.sh                 # the page (and the engine, when its code changed; then the restart, when the studio is idle)
```

The page is read from disk at every load: `./build.sh` and a reload of the browser tab are enough.

## Tests, if you want to see it work on your machine

```bash
tools/test-real.sh                         # the engine on the CPU, its page and a 1-second song, in a library of its own (1–4 minutes)
node tools/cdp-console.mjs                 # the page against a stand-in server (about 2 minutes)
node heresy/tools/check-player.mjs         # the player: a click plays, play-on goes to the next take
node heresy/tools/check-pinokio.mjs        # the Pinokio launcher without Pinokio: its menu, its scripts, the lines it waits for
tools/test_downloaders.sh                  # the model downloaders, offline
.venv/bin/python tools/test_flac.py        # the engine's FLAC against the reference flac (needs flac and metaflac)
```

Measured on the machine it was made on: 6 passed (the page part 14), 470 passed and 7 skipped, 3, 62, 14 and 18 passed. None of them touches your songs, your settings or your services; the real-server test proves it at its end. The page tests take Chrome from `YUE2_CHROME` when it is not on the `PATH`; on Ubuntu 24.04, Playwright's *Chrome for Testing* needs `--no-sandbox` there (AppArmor), Google Chrome's own package does not.

## When something is wrong

| what you see | why | what to do |
|---|---|---|
| `build.sh` stops at cmake | no CUDA toolkit, or `nvcc` not found | install CUDA 12.8; `export PATH=/usr/local/cuda-12.8/bin:$PATH` |
| the page: *Forge is not answering* or a red lamp | the engine is not running | `systemctl --user status ruach-studio`; `journalctl --user -u ruach-studio -n 50` |
| *no card can take this now* | another program holds the card, or the job does not fit | the message names the program and the card; Engine → GPUs says which card does what |
| 403 from another machine | it is not on a private network | open it from your home network, or put your own proxy and guard in front (`RUACH_ALLOW_PUBLIC=1`) |
| the Writer says *no chat server* | none is set | Engine → Chat server (vLLM, LM Studio, Ollama on your machine), or OpenRouter with your key in the Writer |
| upscale, stems or the lyrics check refuse | their models are missing | `./fetch-models.sh` (or `--check` to see which) |

The guide inside the studio (the **?** in the bar) explains every room. `docs/API.md` is the API; `CHANGELOG.md` what is in this version; `heresy/docs/HERESY.md` every change with what was measured.
