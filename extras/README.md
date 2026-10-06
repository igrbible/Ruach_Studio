# Extras

Helpers we wrote for our own work on the studio and kept because they are useful beyond it: preparing sets for
the LoRA Trainer, checking material before training on it, weighing a LoRA's rank.

> **No warranty.** We use these ourselves and they work here. They are not part of the studio, nobody tests them
> on your machine, and if one eats your files or your afternoon, that is on you. Read a script before you run it;
> point it at copies when in doubt.

| tool | what it does |
|---|---|
| [`loops.py`](loops.py) | How much of a long recording is new: finds where it repeats itself (proved on the waveform, not guessed) and, with `--keep DIR`, cuts the new stretches out. Two "three hour" instrument recordings turned out to hold 26 and 17 new minutes. |
| [`yt-audio.sh`](yt-audio.sh) | The audio of videos, as the site has it, with each page's info beside it: links or ids, or a file of them. One video a link, never a playlist. Mind the rights of what you fetch. |
| [`set-slice.py`](set-slice.py) | A slice of a training set, about N MB: one singer, plain singing first, every song heard. The starter samples in `datasets/raw/` were cut with it. |
| [`regen-workspace.py`](regen-workspace.py) | Every take of one workspace made again with fresh random seeds into another, under the same titles; the old ones to the Librarian's trash (`--keep` leaves them). For probes the ear rejected: an instrument one seed missed, another may bring. |
| [`lora-cost.py`](lora-cost.py) | What a rank costs on YuE2: parameters, share of the weights adapted, file size, per half, read from an adapter's own shapes. |
| [`../lab/gtsinger.py`](../lab/gtsinger.py) | GTSinger (one language of it) into a training folder: phrases joined into songs, lyrics from the word timings, a style line from its labels. It lives in the lab; it is a converter all the same. |

## Clients of the studio's API

These two are part of the studio and tested with it (docs/API.md), kept here because they run elsewhere: in an
agent's process, inside REAPER.

| client | what it does |
|---|---|
| [`ruach-mcp.py`](ruach-mcp.py) | The studio as an MCP server for agents (Claude Desktop, Claude Code, any MCP client): twelve tools, from making a song to refining it, its artwork and its REAPER project. |
| [`reaper/`](reaper/README.md) | Three REAPER actions: make a song from inside REAPER (it lands at the time selection), bring a take from the Librarian, settings. |

Python tools want numpy and ffmpeg; run them with the studio's environment: `.venv/bin/python extras/loops.py …`.
