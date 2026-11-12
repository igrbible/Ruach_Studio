#!/usr/bin/env python3
"""HERESY 2330 (Viktor 10.11.2026: «модели… разбросаны повсюду… всё отсортировать, упаковать под основную папку Models со своими поддиректориями… прикрутить миграцию для тех, кто на апдейте… до 2.0.6»): where the Studio's weights live, one line a place.

Every weight the Studio loads lies under models/, in the folder of the room that loads it; a weight several rooms load (Whisper, SeedVR2, MERT, SheetSage2) lies in models/misc/. No links, no caches: a file is in one place. training/ (the Trainer's runs) and datasets/ stay apart: they are made here, not downloaded.

Everything in lab/, build/ and the root's scripts that names a weight's folder takes it from here (Python) or from launcher/paths.sh, its twin for the shell, written from this file (python3 lab/paths.py --sh > launcher/paths.sh); test_paths.py keeps the two equal and turns red on a hard-coded old folder anywhere in the code.

MAP is the one map from the layout of 2.0.6 and before (models/ flat, checkpoints/, artwork/, separation/, whisper/, universr/) to this one: migrate_models.py moves an old install by it, and the downloads land by it (the models repo keeps the old layout: hf_place() says where a repo path lands). Its patterns are plain ERE, read alike by Python's re and bash's =~.

    python3 lab/paths.py --sh             the shell twin
    python3 lab/paths.py map OLD…|-       where each old path goes now (an empty line: not the Studio's, it stays); - reads them a line each
    python3 lab/paths.py hfplace INCLUDE  "STRIP<TAB>DIR": the repo prefix a download loses and the folder it lands in
Standard library only: the install's scripts run it before any venv exists.
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # the Studio's folder (lab/ is in it)

# ── the places, relative to the Studio's folder ─────────────────────────────────────────────────────────────────────
MODELS = "models"                                        # every weight, and only weights
ENGINE = "models/engine"                                 # what a song is sung with (yue2.cpp)
ENGINE_YUE2 = "models/engine/yue2"                       # m-a-p's YuE2-3B: its GGUFs and the safetensors they are made of (YuE2-3B/)
ENGINE_FINETUNES = "models/engine/finetunes"             # a folder a merge: RS-TW-<merge>/, RS-FW-<merge>/ (GGUFs and their source)
ENGINE_LEGACY = "models/engine/finetunes/legacy"         # IRA, IRAE and their kin
ENGINE_OWN = "models/engine/finetunes/own"               # a YuE2-3B merge of the user's own (models/YuE2-3B-<name>.gguf in 2.0.6)
ENGINE_VAE = "models/engine/vae"                         # the decoders (GGUF) and their sources
ENGINE_TOKENIZERS = "models/engine/tokenizers"           # the realaudio tokenizer
ENGINE_HELPERS = "models/engine/helpers"                 # hum-to-song, eagle3, the sliders
LISTENER = "models/listener"                             # Qwen2.5-Omni (GGUF, AWQ, whole), audiobox-aesthetics
WRITER = "models/writer"                                 # Qwopus3.5-9B (GGUF)
REFINER = "models/refiner"
REFINER_SEPARATION = "models/refiner/separation"         # roformer, demucs, vr
REFINER_UPSCALE = "models/refiner/upscale"               # UniverSR, the upbundle (Apollo-vocal, FlashSR)
REFINER_UNIVERSR = "models/refiner/upscale/universr"
REFINER_UPBUNDLE = "models/refiner/upscale/upbundle"
REFINER_MIDI = "models/refiner/midi"                     # MuScriptor
REFINER_INSTRUMENTS = "models/refiner/instruments"       # the sound banks, Pianoteq and its kin
REFINER_AMBIENT = "models/refiner/ambient"               # nature under a song
ARTIST = "models/artist"                                 # the painters, their prompt writer, LoRAs, upscalers, the filter
ARTIST_LORAS = "models/artist/loras"
ARTIST_UPSCALERS = "models/artist/upscalers"
VIDEOGRAPHER = "models/videographer"
VIDEO_H3 = "models/videographer/minimax-h3"
VIDEO_LUTS = "models/videographer/luts"
NARRATOR = "models/narrator"                             # the Reader's voices engines
MISC = "models/misc"                                     # what several rooms load
WHISPER = "models/misc/whisper"                          # the Creator, the Refiner, the Reader, the Trainer
SEEDVR2 = "models/misc/seedvr2"                          # the Artist, the Videographer
COMFY = "models/comfy"                                   # kept for ComfyUI's layout (the Trainer's base)
INCOMING = "models/.incoming"                            # a download's own folder until its files are put in place

PLACES = {k: v for k, v in dict(globals()).items() if k.isupper() and isinstance(v, str) and (v == "models" or v.startswith("models/"))}

QUANTS = "BF16|F16|F32|Q8_0|Q6_K|Q5_K_M|Q4_K_M|Q4_0"

# ── the map from 2.0.6 and before: (old, new), the first that matches wins; \1… are the old one's groups ──────────────
MAP = (
    (r"^models/(YuE2-3B-(" + QUANTS + r")\.gguf)$", r"models/engine/yue2/\1"),
    (r"^models/(YuE2-3B-RS-(FW|TW)-(.+)-(" + QUANTS + r")\.gguf)$", r"models/engine/finetunes/RS-\2-\3/\1"),
    (r"^models/(YuE2-3B-IRA[^/]*\.gguf)$", r"models/engine/finetunes/legacy/\1"),
    (r"^models/(YuE2-3B-[^/]*\.gguf)$", r"models/engine/finetunes/own/\1"),   # a merge of the user's own, as start.sh offered it
    (r"^models/(YuE2-(Vae|VAE)[^/]*\.gguf)$", r"models/engine/vae/\1"),
    (r"^models/(yue2-mothersuperior-realaudio-tokenizer[^/]*\.gguf)$", r"models/engine/tokenizers/\1"),
    (r"^models/((MERT|SheetSage)[^/]*\.gguf)$", r"models/misc/\1"),
    (r"^models/((MERT|SheetSage)[^/]*/.+)$", r"models/misc/\1"),   # SheetSage2-Refined/LICENSE and NOTICE.md beside its GGUF (11.11)
    (r"^models/RS-(FW|TW)-([^/]+)/(.+)$", r"models/engine/finetunes/RS-\1-\2/\3"),
    (r"^models/(YuE2-VAE-RS/.+)$", r"models/engine/vae/\1"),
    (r"^VAE-RS/(YuE2-VAE-RS[^/]*\.gguf)$", r"models/engine/vae/\1"),   # a repo path, not 2.0.6's: our decoders in goldhub/YuE2-RS-Finetunes (11.11)
    (r"^models/(eagle3/.+)$", r"models/engine/helpers/\1"),
    (r"^models/(muscriptor/.+)$", r"models/refiner/midi/\1"),
    (r"^models/upbundle/(.+)$", r"models/refiner/upscale/upbundle/\1"),
    (r"^models/instruments/(.+)$", r"models/refiner/instruments/\1"),
    (r"^models/ambient/(.+)$", r"models/refiner/ambient/\1"),
    (r"^models/minimax-h3/(.+)$", r"models/videographer/minimax-h3/\1"),
    (r"^models/luts/(.+)$", r"models/videographer/luts/\1"),
    (r"^models/seedvr2/(.+)$", r"models/misc/seedvr2/\1"),
    (r"^models/reader/(.+)$", r"models/narrator/\1"),
    (r"^checkpoints/(YuE2-3B/.+)$", r"models/engine/yue2/\1"),
    (r"^checkpoints/(YuE2-Vae[^/]*/.+)$", r"models/engine/vae/\1"),
    (r"^checkpoints/(yue2-mothersuperior-realaudio-tokenizer[^/]*/.+)$", r"models/engine/tokenizers/\1"),
    (r"^checkpoints/((YuE2-hum-to-song|particle-sliders)/.+)$", r"models/engine/helpers/\1"),
    (r"^checkpoints/((Qwen2\.5-Omni[^/]*|audiobox-aesthetics)/.+)$", r"models/listener/\1"),
    (r"^checkpoints/(Qwopus[^/]*/.+)$", r"models/writer/\1"),
    (r"^checkpoints/((MERT|SheetSage)[^/]*/.+)$", r"models/misc/\1"),
    (r"^checkpoints/comfy/(.+)$", r"models/comfy/\1"),
    (r"^separation/(.+)$", r"models/refiner/separation/\1"),
    (r"^universr/(.+)$", r"models/refiner/upscale/universr/\1"),
    (r"^whisper/(.+)$", r"models/misc/whisper/\1"),
    (r"^artwork/(.+)$", r"models/artist/\1"),
)
OLD_TOPS = ("models", "checkpoints", "artwork", "separation", "whisper", "universr")   # where 2.0.6 kept weights
NEW_TOPS = tuple(sorted({v.split("/")[1] for v in PLACES.values() if v.count("/") >= 1}))   # models/<these> are this layout's own
_COMPILED = [(re.compile(a), b) for a, b in MAP]


def _expand(m, template):
    return re.sub(r"\\(\d)", lambda g: m.group(int(g.group(1))) or "", template)


def new_of(old):
    """Where an old relative path (POSIX, from the Studio's folder) lies now; None: not the Studio's, it stays where it is."""
    if old.startswith("./"):
        old = old[2:]
    for rx, template in _COMPILED:
        m = rx.match(old)
        if m:
            return _expand(m, template)
    return None


def hf_place(include):
    """(strip, folder) for a path or pattern of a repo laid out as 2.0.6's folders: the prefix the file loses and the folder it lands
    in now, cut at a folder's edge (artwork/Qwen-Image-2512/* → ("artwork/", "models/artist")). Raises ValueError for one the map
    does not know."""
    new = new_of(include)
    if new is None:
        raise ValueError(f"{include}: the map knows no place for it (lab/paths.py MAP)")
    a, b = include.split("/"), new.split("/")
    n = 0
    while n < min(len(a), len(b)) - 1 and a[-1 - n] == b[-1 - n]:
        n += 1
    keep = a[len(a) - n:]
    strip = "/".join(a[:len(a) - n]) + "/"
    folder = "/".join(b[:len(b) - n])
    assert "/".join(keep) == "/".join(b[len(b) - n:])
    return strip, folder


def at(rel, kit=None):
    """A place (or a path below one) in a given Studio's folder (the lab's own by default), as a Path."""
    return Path(kit or ROOT) / rel


def engine_gguf(name, kit=None):
    """Where the engine's GGUF of this name lies (YuE2-3B-RS-TW-2.0x0.75-Q8_0.gguf in its merge's folder, the decoders in vae/…),
    as a Path; a name the map does not know is looked for in models/ itself."""
    rel = new_of("models/" + name) or ("models/" + name)
    return at(rel, kit)


def narrator_file(rel, kit=None):
    """a Reader engine's model as its engine.json names it: under models/narrator/; one of 2.0.6, named from the Studio's folder
    (models/reader/…), where the map put it"""
    rel = str(rel)
    moved = new_of(rel)
    return at(moved, kit) if moved else at(NARRATOR, kit) / rel


def backbones(kit=None):
    """Every YuE2-3B-*.gguf the engine may sing with: m-a-p's and every merge's, sorted by name."""
    base = Path(kit or ROOT)
    found = list((base / ENGINE_YUE2).glob("YuE2-3B-*.gguf")) + list((base / ENGINE_FINETUNES).glob("*/YuE2-3B-*.gguf"))
    return sorted(found, key=lambda p: p.name)


# ── the shell twin ──────────────────────────────────────────────────────────────────────────────────────────────────
def shell():
    out = ["# launcher/paths.sh: where the Studio's weights live, one line a place (HERESY 2330)",
           "# Written by `python3 lab/paths.py --sh > launcher/paths.sh` from lab/paths.py, the one source; do not edit by hand:",
           "# lab/test_paths.py turns red when the two differ. Sourced with ROOT set: every place is a path under $ROOT.",
           ': "${ROOT:?ROOT is the Studio folder}"']
    for k, v in PLACES.items():
        out.append(f'RS_{k}="$ROOT/{v}"')
    out.append("RS_MAP_OLD=(")
    out += [f"  '{a}'" for a, _ in MAP]
    out.append(")")
    out.append("RS_MAP_NEW=(")
    out += [f"  '{b}'" for _, b in MAP]
    out.append(")")
    out += [
        "# rs_new_of OLD: where an old relative path lies now (lab/paths.py new_of); nothing printed and status 1: not the Studio's",
        "rs_new_of() {",
        '  local old="$1" i k out rep',
        '  for i in "${!RS_MAP_OLD[@]}"; do',
        '    if [[ $old =~ ${RS_MAP_OLD[$i]} ]]; then',
        '      out="${RS_MAP_NEW[$i]}"',
        '      # the replacement quoted: bash 5.2 reads a bare & in it as the match (a file named «A & B» kept as it is)',
        '      for k in 9 8 7 6 5 4 3 2 1; do rep="${BASH_REMATCH[$k]:-}"; out="${out//\\\\$k/"$rep"}"; done',
        '      printf \'%s\\n\' "$out"; return 0',
        "    fi",
        "  done",
        "  return 1",
        "}",
        "# rs_engine_gguf NAME: the engine's GGUF of this name, as a path under $ROOT (lab/paths.py engine_gguf)",
        "rs_engine_gguf() {",
        '  local rel; rel=$(rs_new_of "models/$1") || rel="models/$1"',
        '  printf \'%s\\n\' "$ROOT/$rel"',
        "}",
        "# rs_hf_place INCLUDE: \"STRIP<TAB>DIR\" for a repo path laid out as 2.0.6's folders (lab/paths.py hf_place)",
        "rs_hf_place() {",
        '  local new a b; new=$(rs_new_of "$1") || { echo "$1: the map knows no place for it (lab/paths.py MAP)" >&2; return 1; }',
        '  a="$1"; b="$new"',
        '  while [[ $a == */* && $b == */* && ${a##*/} == "${b##*/}" ]]; do a="${a%/*}"; b="${b%/*}"; done',
        '  printf \'%s/\\t%s\\n\' "$a" "$b"',
        "}",
        "# rs_backbones: every YuE2-3B-*.gguf the engine may sing with, a path a line, sorted by name (lab/paths.py backbones)",
        "rs_backbones() {",
        '  local f; for f in "$RS_ENGINE_YUE2"/YuE2-3B-*.gguf "$RS_ENGINE_FINETUNES"/*/YuE2-3B-*.gguf; do [ -f "$f" ] && printf \'%s\\t%s\\n\' "${f##*/}" "$f"; done | LC_ALL=C sort | cut -f2',
        "}",
    ]
    return "\n".join(out) + "\n"


def main(argv):
    if argv[:1] == ["--sh"]:
        sys.stdout.write(shell())
        return 0
    if argv[:1] == ["map"]:
        for a in (sys.stdin.read().splitlines() if argv[1:] == ["-"] else argv[1:]):
            print(new_of(a) or "")
        return 0
    if argv[:1] == ["hfplace"] and len(argv) == 2:
        try:
            s, d = hf_place(argv[1])
        except ValueError as e:
            print(e, file=sys.stderr)
            return 1
        print(f"{s}\t{d}")
        return 0
    if argv[:1] == ["places"]:
        for k, v in PLACES.items():
            print(f"{k}\t{v}")
        return 0
    print("lab/paths.py --sh | map OLD… | hfplace INCLUDE | places", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
