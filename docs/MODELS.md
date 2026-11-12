# Where the Models Live

Every weight the Studio loads lies under one folder, `models/`, in the folder of the room that loads it. A weight that several rooms load (Whisper, SeedVR2, MERT, SheetSage2) lies in `models/misc/`, not under one of them. A file is in one place only: the Studio keeps no copy in a cache and needs no link, so emptying `~/.cache` or `hf_cache/` never breaks a room.

What the Studio makes rather than downloads stays apart: `training/` (the Trainer's runs, their epochs and reports), `datasets/` (the sets they learn from), `loras/` (the song adapters the engine offers), `outputs/` (your takes) and `user/` (your settings).

## The Tree

```
Ruach_Studio/
├── models/                              every weight, and only weights
│   ├── engine/                          what a song is sung with (yue2.cpp)
│   │   ├── yue2/                        m-a-p's YuE2-3B: its GGUFs (BF16, Q8_0, Q6_K, Q5_K_M) and the safetensors they are made of
│   │   ├── finetunes/
│   │   │   ├── RS-TW-2.0x0.75/          Ruach Studio's default: its GGUFs at each quant and the file they are made of
│   │   │   ├── RS-TW-2.0x0.9/
│   │   │   ├── RS-FW-<merge>/           a folder for each merge of the First Wave (0.7x0.75 … 4.0x0.7)
│   │   │   ├── legacy/                  IRA and the five IRAE merges
│   │   │   └── own/                     a YuE2-3B merge of your own (YuE2-3B-<name>.gguf)
│   │   ├── vae/                         the decoders: YuE2-VAE-RS x3 v1 and v2, m-a-p's Standard, and their sources
│   │   ├── tokenizers/                  the realaudio tokenizer
│   │   └── helpers/                     hum-to-song, the EAGLE3 draft, the particle sliders
│   ├── listener/                        Qwen2.5-Omni-7B (GGUF, AWQ, whole), audiobox-aesthetics
│   ├── writer/                          Qwopus3.5-9B (GGUF)
│   ├── refiner/
│   │   ├── separation/                  roformer, demucs, vr (the stems)
│   │   ├── upscale/
│   │   │   ├── universr/                UniverSR
│   │   │   └── upbundle/                Apollo-vocal, FlashSR (the Voice upscale)
│   │   ├── midi/                        MuScriptor (sound to MIDI)
│   │   ├── instruments/                 the sound banks the MIDI orchestra plays; Pianoteq, Organteq and Airteq if you put them here
│   │   └── ambient/                     the field recordings laid under a song
│   ├── artist/                          Qwen-Image 2512 (with Lightning) and 2.1, the prompt writer (Qwen3-4B-Instruct), the content filter
│   │   ├── loras/                       the painters' adapters, a folder for each painter's family
│   │   └── upscalers/                   the picture upscalers (ESRGAN, DAT, HAT, SPAN…)
│   ├── videographer/
│   │   ├── minimax-h3/                  MiniMax H3 in its Comfy layout
│   │   └── luts/                        the Studio's looks and the film pack
│   ├── narrator/                        the Narrator: its voice engines and their dictionaries
│   ├── misc/                            what several rooms load
│   │   ├── whisper/                     Whisper large-v3: the Creator, the Refiner, the Narrator, the Trainer
│   │   ├── seedvr2/                     SeedVR2: the Artist, the Videographer
│   │   ├── MERT-v2-FullSong/            and its GGUF: the transcriber, the Trainer
│   │   └── SheetSage2/                  and its GGUF: the transcriber (covers from a recording)
│   ├── comfy/                           Comfy-Org's YuE2 for the LoRA Trainer, in ComfyUI's layout
│   └── .incoming/                       a download's own folder until each file is whole and put in its room
├── training/                            the Trainer's runs (made here, not downloaded)
├── datasets/                            the sets the Trainer learns from
├── loras/                               the song adapters
└── outputs/                             your takes
```

## Who Loads What

| folder | the room | what reads it |
|---|---|---|
| `models/engine/` | the Creator | the engine at its start: the backbone the Engine page picks (every `YuE2-3B-*.gguf` under `yue2/` and `finetunes/*/` is offered by its name), the decoders, the tokenizer |
| `models/listener/` | the Trainer | the style listener that writes a set's tags |
| `models/writer/` | the Writer | the Studio's own language model through llama.cpp |
| `models/refiner/` | the Refiner | the stems, the upscales, sound to MIDI, the instruments and the ambient beds |
| `models/artist/` | the Artist | the painters, their adapters and upscalers, the prompt writer, the filter |
| `models/videographer/` | the Videographer | the moving pictures and the looks |
| `models/narrator/` | the Narrator | its engines' quants and dictionaries |
| `models/misc/` | several | Whisper, SeedVR2, MERT, SheetSage2 |
| `models/comfy/` | the Trainer | the base a LoRA learns on |

## An Update from 2.0.6 or Before

Up to 2.0.6 the weights lay in six folders beside each other: `models/` (its GGUFs side by side), `checkpoints/`, `artwork/`, `separation/`, `whisper/` and `universr/`. The first start of 2.0.7 (the engine's or the lab's, whichever comes first; the update moves them before it checks for newer files too) moves them into the tree above, once:

- by a rename on the same disk, file by file: instant, nothing copied;
- a file already in its new place is left as it is; a file of the same name that differs is refused and both are kept, the log says which;
- a download cut short (`.part`, `.incomplete`) is never touched: the next fetch begins it anew in its room;
- a link is moved as a link; an old folder that is a link to another disk (an `artwork/` you put elsewhere) becomes the room's folder as the same link, its files untouched;
- a file whose new place would be on another disk stays where it is and is said, never copied behind your back;
- anything the Studio does not know (a file of your own in `models/`) stays where it is.

Every step goes into `user/migration-2.0.7.log`. You can see the move before it happens, and take it back after:

```
python3 lab/migrate_models.py --dry      what would move, file by file; nothing moves
python3 lab/migrate_models.py --apply    the move
python3 lab/migrate_models.py --undo     everything the log says was moved, put back, the last first
```

To keep the move from happening at the start (a training reading the old places, a disk you want to look at first), create `user/migration-2.0.7.hold` or start with `RUACH_MODELS_MIGRATION=hold`: the start then only says how many files wait.

Scripts of your own that still name the old places can read on through bridges: a link at each old place to its new one (the old folder as one link where all of it moved, else each moved file), made after the move and kept in the same log. The Studio itself never reads through them, and the next start neither moves nor counts them.

```
python3 lab/migrate_models.py --bridge          a bridge at each old place (--bridge --look: what it would make)
python3 lab/migrate_models.py --bridges         the bridges there now
python3 lab/migrate_models.py --unbridge [OLD]  the bridges taken away, the named ones or all (the undo takes them first too)
```

## Every File Checked Before It Is Used

Every file the Studio takes from its own Hugging Face repositories (fetch-models.sh, download-models.sh, heresy/fetch-heresy.sh and through it Engine → Models, the launchers and the AppImage) goes through `tools/hf_guard.py` (HERESY 2380). It downloads into a part folder beside its place, and moves the file in only when three things hold: it came at the commit `heresy/hf-revisions.txt` pins, it has that commit's size, and its SHA-256 is the one `heresy/hf-manifest.tsv` lists for it at that pin. A file that fails any of them never reaches its place: the one that was there stays, the download is removed, and the line says which check failed. A download cut halfway leaves the downloader's own unfinished part, so the next run goes on from it; nothing of it is used before it is whole and checked. A file of another's repository is checked by its size and the SHA-256 its pinned commit lists. `tools/test_hf_guard.sh` proves the checks on a fake mirror.

## A Heavy Room on Another Disk

The Videographer (86 GB and more) or the Artist (40 GB and more) may live on another disk: stop the Studio, move the room's folder there and leave a link in its place, for example

```
mv models/videographer /mnt/big/ruach-videographer
ln -s /mnt/big/ruach-videographer models/videographer
```

The Studio reads through the link as through a folder, and the downloads land on that disk. The whole of `models/` can go the same way.

## For Whoever Changes the Code

Every place above is a line in `lab/paths.py`; the shell scripts read its twin, `launcher/paths.sh`, written from it (`python3 lab/paths.py --sh > launcher/paths.sh`). The map from 2.0.6's folders is there too, read alike by Python and bash: the move uses it, and so do the downloads, since the Studio's model repositories keep 2.0.6's layout (a repo path in a script says so with `paths: repo`); our decoders come from `VAE-RS/` in goldhub/YuE2-RS-Finetunes, a repo path the map knows too. `lab/test_paths.py` turns red on a folder written by hand anywhere in the code, and on a 2.0.6 place left in the docs or the page.
