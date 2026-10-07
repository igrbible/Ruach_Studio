# Ruach Studio on Windows 11

Ruach Studio is a Linux program: its engine, its lab (Python), its scripts and its two services. On Windows 11 it runs
inside **WSL2**, Windows' own Linux: Ubuntu 24.04 in a light virtual machine, the NVIDIA card reached through the
Windows driver, the studio opened in your Windows browser. Everything else is as in [INSTALL.md](INSTALL.md).

> **Said plainly:** we make and test the studio on Ubuntu 24.04 itself and have not yet run it under WSL2. The steps
> below are WSL2's and NVIDIA's documented way for CUDA programs; if a step differs on your machine, open an issue and
> the guide is corrected.

## What it needs

| | |
|---|---|
| Windows | **Windows 11** (22H2 or newer), virtualization on in the BIOS/UEFI (it usually is) |
| GPU | NVIDIA, as on Linux: **24 GB** for everything at full precision, **16 GB** with the Q8_0 model, **12 GB** with Q6_K or Q5_K_M |
| driver | the current NVIDIA driver **for Windows** (Game Ready or Studio). It carries CUDA into WSL2: **never install a Linux NVIDIA driver inside WSL** |
| disk | on the Windows drive that holds WSL: about **100 GB** free (program, Python, models, your songs) |

## 1 · WSL2 and Ubuntu 24.04

In **PowerShell as administrator**:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart Windows when asked, open **Ubuntu 24.04** from the Start menu, and choose a Linux user name and password.
Then, in that Ubuntu window, the card must be seen:

```bash
nvidia-smi
```

It lists your card (the tool comes from the Windows driver). If it does not: update the Windows driver, and in
PowerShell `wsl --update`, then `wsl --shutdown` and open Ubuntu again.

**systemd** (the studio's two services use it) is on by default in Ubuntu 24.04 under WSL. Check:

```bash
cat /etc/wsl.conf
```

If it has no `[boot]` with `systemd=true`, add those two lines (`sudo nano /etc/wsl.conf`), run `wsl --shutdown` in
PowerShell, and open Ubuntu again.

## 2 · The tools and CUDA 12.8, inside Ubuntu

```bash
sudo apt update
sudo apt install git cmake ninja-build build-essential python3.12-venv ffmpeg curl
```

CUDA: NVIDIA's repository **for WSL-Ubuntu** (developer.nvidia.com → CUDA Toolkit 12.8 → Linux → x86_64 →
**WSL-Ubuntu** → 2.0), the `cuda-toolkit-12-8` package. That one brings the compiler and libraries without a driver,
which is what WSL needs. Then:

```bash
echo 'export PATH=/usr/local/cuda-12.8/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
nvcc --version
```

## 3 · The studio

Into Ubuntu's own home folder, **not** under `/mnt/c`: Windows folders reached from WSL are many times slower, and the
models are large.

```bash
cd ~
git clone https://github.com/igrbible/Ruach_Studio.git Ruach_Studio && cd Ruach_Studio

./lab/install-venv.sh      # Python: torch for CUDA 12.8 and the studio's packages, in .venv (about 8 GB, a few minutes)
./fetch-models.sh          # every model the studio uses, pinned and checked (asks before the big ones)
./build.sh --server        # the page and the engine (the first build of the engine: a few minutes)
./systemd/install-units.sh # the two services
systemctl --user enable --now heresy-lab ruach-studio
sudo loginctl enable-linger $USER    # once: the services start with Ubuntu, not only with a login
```

Without the services: `./lab/start-lab.sh` and then `./start.sh` (it stays in that window).

## 4 · Open it

In your Windows browser: **http://localhost:41867**. WSL2 hands `localhost` over to Ubuntu.

WSL stops Ubuntu some time after its last window closes, and the studio with it. Keep one Ubuntu window open while
you make songs; opening Ubuntu again starts the two services again by themselves (they are enabled, and lingering).

**From another machine of your home network:** WSL2 sits behind its own small network by default, so the studio is
seen by this computer only. Windows 11 can share its own network with WSL instead: in your Windows user folder,
the file `.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Then `wsl --shutdown`, open Ubuntu again, and the studio answers at **http://THIS-PC'S-ADDRESS:41867**. Windows
Firewall may ask once whether to let it through on private networks. The studio itself answers private networks
only, never the internet.

## When something is wrong

| what you see | why | what to do |
|---|---|---|
| `nvidia-smi` not found or no card | the Windows driver is old, or WSL is | update the NVIDIA driver for Windows; `wsl --update`; `wsl --shutdown` |
| `build.sh` stops at cmake, *nvcc not found* | CUDA is not on the PATH | the `export PATH=/usr/local/cuda-12.8/bin:$PATH` line above |
| `systemctl --user` says it cannot connect | systemd is off in this WSL | the `[boot]` `systemd=true` lines in `/etc/wsl.conf`, then `wsl --shutdown` |
| everything is slow, the model loads for minutes | the studio is under `/mnt/c` | clone it again into `~` (Ubuntu's home) and move your `outputs/` across |
| the browser on Windows cannot reach it | the services are not running | in Ubuntu: `systemctl --user status ruach-studio`; or `./start.sh` in a window |

The rest (the rooms, updates, the tests, the API) is the same as on Linux: [INSTALL.md](INSTALL.md), and the guide
inside the studio (the **?** in the bar).

**Native Windows, without WSL:** the engine itself (yue2.cpp, by ServeurpersoCom) builds on Windows with Visual Studio
2026 and Ninja; the studio around it (the lab, its scripts and services) is Linux for now.
