#!/bin/bash
# HERESY 1626 (Viktor 20.10.2026: «Докодишь поддержку parquet и упаковку в этот формат? Так сэкономим место мы, и юзеры»): a prepared set's
# WAVs packed into parquet (FLAC 24-bit: the same samples, read back sample for sample before the WAVs go), or back. The trainer reads either.
# A set that is a link (moved to another disk, as the Patriot) is left alone: packing would write there.
#   tools/pack-set.sh NAME [--unpack] [--keep]
cd "$(dirname "$0")/.." || exit 1
G='\e[1;32m'; R='\e[1;31m'; X='\e[0m'
NAME=${1:-}; shift
[ -n "$NAME" ] || { sed -n 5p "$0"; exit 1; }
S=datasets/prepared/$NAME
[ -L "$S" ] && { echo -e "${R}$S is a link to another disk: packing would write there${X}"; exit 1; }
[ -d "$S" ] || { echo -e "${R}no set $S${X}"; exit 1; }
CMD=pack; KEEP=""
for a in "$@"; do case $a in --unpack) CMD=unpack ;; --keep) KEEP=--keep ;; esac; done
echo -e "${G}$CMD $S${X} ($(du -sh "$S" | cut -f1) now)"
.venv/bin/python lab/trainer/tracks.py "$CMD" "$S" $KEEP && echo -e "${G}$(du -sh "$S" | cut -f1) after${X}"
