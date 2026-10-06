<h1 align="center">yue2-kit</h1>

<p align="center"><b>(Yue2 Installer)</b></p>

<p align="center">
  YuE2 install kit with new features, LoRAs, VAEs and more.<br>
  Whole songs with vocals, from a style prompt and lyrics, on your own GPU.
</p>

<p align="center">
  <img alt="kit v{{KITVER}}" src="https://img.shields.io/badge/kit-v{{KITVER}}-c8963e?style=flat-square">
  <img alt="yue2.cpp {{BASE}} + {{NPATCH}} patches" src="https://img.shields.io/badge/yue2.cpp-{{BASE}}%20%2B%20{{NPATCH}}%20patches-4a6b8a?style=flat-square">
  <img alt="{{NLORA}} LoRAs" src="https://img.shields.io/badge/LoRAs-{{NLORA}}-7a5c9e?style=flat-square">
  <img alt="3 VAEs" src="https://img.shields.io/badge/VAEs-3-3f8f6b?style=flat-square">
  <img alt="{{NSLIDER}} sliders" src="https://img.shields.io/badge/sliders-{{NSLIDER}}-b5653b?style=flat-square">
  <img alt="Linux or WSL2" src="https://img.shields.io/badge/runs%20on-Linux%20%7C%20WSL2-555555?style=flat-square">
</p>

<p align="center">
  <img src="docs/screenshots/song-page.png" alt="The studio: the song form, a finished song and the library" width="100%">
</p>

> **AI agent:** to install or upgrade, follow [INSTALL.md](INSTALL.md).

## What it is

[YuE2](https://map-yue2.github.io/) writes whole songs, vocals included. This kit sets it up on
[yue2.cpp](https://github.com/ServeurpersoCom/yue2.cpp), a fast C++ engine, and adds a full studio page,
{{NLORA}} LoRAs, 3 VAEs and {{NSLIDER}} voice and genre sliders on top. Your AI coding agent does the install:
it builds in its own folder and never changes an existing yue2.cpp install.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/compose-page.png" alt="Compose"><br><sub><b>Compose</b>: style, lyrics, VAE, sliders and LoRAs</sub></td>
    <td width="50%"><img src="docs/screenshots/engine-tiles.png" alt="Engine"><br><sub><b>Engine</b>: every VAE, LoRA and slider, with its source</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/theme-picker.png" alt="Themes"><br><sub><b>51 themes</b>, Studio by default</sub></td>
    <td width="50%"><img src="docs/screenshots/engine-about.png" alt="About"><br><sub><b>About</b>: every project and add-on, linked</sub></td>
  </tr>
</table>

## Features

- **A studio page**: song form, song page and library side by side, with columns you can drag wider or
  narrower, 51 colour themes with an Appearance card (fonts, corners, hover colour, glow), and an (i) help
  on every setting.
- **Add-ons**: 3 VAEs (Standard, Legacy and a Blend of the two), {{NSLIDER}} stackable voice and genre sliders,
  and {{NLORA}} LoRAs, each with its own strength for the music and the sound, and its trigger word.
- **Songs**: Full plan, Melody only and Direct modes, the official Instrumental mode, covers from a
  recording (listen to it first) or from a song, and an editable score. Retake, Reuse, or give a song
  another VAE in seconds.
- **Library**: every song kept on disk, with favourites and versions; FLAC, WAV and MP3 downloads named
  after the song (or with the date, if you prefer);
  double-click a song to play it; a status light in the player.
- **Idea writer**: a local chat model drafts the title, style and lyrics from one line; a Connected or
  Offline button shows the chat server's state at a glance.
- **Engine page**: memory presets from 8 to 32 GB, a hardware readout, the live server log, the Appearance card,
  and an About card with every link.
- **Engine patches**: the sound stage's steps take about a third less time on the GPU, a half-precision path
  for older cards, and a coloured server log.

## Install

1. Put this kit in an empty folder: the zip, or a clone of this repo.
2. Start your AI coding agent in that folder and say: *install this kit, follow its INSTALL.md*.
3. When it finishes, run `./start.sh` and open http://127.0.0.1:41867.

The agent checks the machine, asks before it installs or downloads anything, and keeps everything in that
one folder: models, caches and songs.

**You need:**
- Linux or Windows WSL2, with an NVIDIA GPU: 8 GB works, 24 GB or more runs my settings.
- About 40 GB of free disk and 16 GB of RAM.
- On a Mac, read [app/tools/kit/MACOS-NOTES.md](app/tools/kit/MACOS-NOTES.md) first.

## What's inside

```
INSTALL.md     the steps the agent follows (install or upgrade)
engines/cpp/   {{NPATCH}} patches for yue2.cpp {{BASE}} ({{BASEDATE}}), with a note for each
page/          the web page as plain files
app/           scripts: start, downloads, model conversion, tests
loras/         the LoRA, VAE and slider names, descriptions and links
docs/          screenshots
```

What changed in each version: [CHANGELOG.md](CHANGELOG.md).

## What it downloads

{{DOWNLOADS}}

## Links

| Project | Links |
|---|---|
| **YuE2**, the music model, by the Multimodal Art Projection team | [Project page](https://map-yue2.github.io/) · [Code and guides](https://github.com/multimodal-art-projection/YuE) · [Model weights](https://huggingface.co/m-a-p/YuE2-3B) · [Sound decoder](https://huggingface.co/m-a-p/YuE2-Vae) · [Technical report](https://github.com/multimodal-art-projection/YuE/blob/main/docs/technical_report.pdf) · [Paper](https://arxiv.org/abs/2503.08638) |
| **yue2.cpp**, the C++ engine and server | [Code](https://github.com/ServeurpersoCom/yue2.cpp) · [Ready-made model files](https://huggingface.co/Serveurperso/YuE2-GGUF) |
| **ggml**, the tensor library underneath | [Code](https://github.com/ggml-org/ggml) · [The fork yue2.cpp uses](https://github.com/ServeurpersoCom/ggml) |
| **This kit** | [SeattleSysop on GitHub](https://github.com/IronWolve) |

## Credits and licences

Customized Collection by **SeattleSysop** ([github.com/IronWolve](https://github.com/IronWolve)).

HTML layout inspired by [Ladypoly/YuE2_WebUI](https://github.com/Ladypoly/YuE2_WebUI).

- **YuE2 weights**: CC BY-NC 4.0, with a creator permission for selling your own songs (the
  `MODEL_LICENSE` in [multimodal-art-projection/YuE](https://github.com/multimodal-art-projection/YuE)).
- **Code**: yue2.cpp and the sliders are MIT.
- **LoRAs**: community add-ons; each one's page (linked above) has its terms.
