# Ruach Studio on Windows 11

Ruach Studio runs on Windows 11 natively, from one zip: `RuachStudio.exe` beside the Studio's own folders, nothing to build. It is a beta and not signed; the rooms come to Windows one by one, and Engine → Models says plainly which of them are not here yet.

## What it needs

| | |
|---|---|
| Windows | **Windows 11**, x64 |
| GPU | NVIDIA from Pascal to Blackwell, with the current NVIDIA driver for Windows: **24 GB** for everything at full precision, **16 GB** with the Q8_0 model, **12 GB** with Q6_K or Q5_K_M. Without a card the processor's engine (AVX2) sings, slowly |
| disk | room for the Studio's Python, the models ([README › What It Downloads](README.md#what-it-downloads) says each part) and your songs |

## Install

1. Download `RuachStudio-<version>-windows-x64-<commit>.zip` from the [releases](https://github.com/igrbible/Ruach_Studio/releases).
2. Unpack the whole zip (right-click it, *Extract All…*) into a short folder, for example `C:\RuachStudio`. Windows' 260-character paths reach into the Studio's Python, so a deep folder can stop the install.
3. Double-click `RuachStudio.exe` in the unpacked folder. SmartScreen asks once: *More info → Run anyway*.

The first start installs into that folder only: a console window brings Python 3.12, the lab's packages and the models a song needs, each step shown. Then the lab and the engine run in the background and the Studio opens in its own window (Edge's app window, else your browser) at **http://localhost:7777**. The zip carries two engines, CUDA 12.8 and the processor's, and the start picks by what `nvidia-smi` sees.

## Every day

`RuachStudio.exe` keeps an icon in the notification area. Its menu: **Open Ruach Studio**, **Logs** (the `logs\` folder: launcher.log, lab.log, engine.log), **Tester's report…** (the logs and this computer's card, memory and Windows in one .zip on the Desktop; nothing is sent), **Check for updates**, **Restart the Studio**, **Stop the Studio** and **Quit**. Starting `RuachStudio.exe` again while it runs only opens the page.

The Studio answers this computer only, so the firewall asks nothing. Engine → Security opens it to your home network from the next start; then Windows Firewall asks once.

## Updates

**Check for updates** opens the newest release's page. Quit the Studio from its icon, then unpack the new zip over the old folder: the songs, the settings and the models stay, the new version's packages come at its first start, and a model its install set gained since comes from Engine → Models.

## Removing it

Quit the Studio from its icon and delete its folder. Copy your songs out of `outputs\` first.

## When something is wrong

| what you see | what to do |
|---|---|
| «Ruach Studio does not find its folder beside RuachStudio.exe» | unpack the whole zip first, then start `RuachStudio.exe` inside the unpacked folder |
| the install or Engine → Models stops on a path that is too long | a shorter folder (`C:\RuachStudio`), or Windows' long paths turned on (`LongPathsEnabled`) |
| the songs are slow, the engine runs on the processor | update the NVIDIA driver for Windows; `nvidia-smi` in a console must list your card |
| anything else | the icon's **Tester's report…**, attached to an issue at [github.com/igrbible/Ruach_Studio/issues](https://github.com/igrbible/Ruach_Studio/issues) |

The rooms, the guide inside the Studio (the **?** in the bar) and the API are as on Linux: [INSTALL.md](INSTALL.md).
