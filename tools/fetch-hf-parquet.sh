#!/bin/bash
# HERESY 1626: a Hugging Face dataset's parquet shards into datasets/raw/NAME, as many as asked; the Train room reads them there as they are,
# a row a track (style from the genres and tags, lyrics where there is a column of them), and prepares from them without unpacking them first.
#   tools/fetch-hf-parquet.sh REPO NAME [FIRST [LAST]]   e.g. tools/fetch-hf-parquet.sh benjamin-paine/free-music-archive-full fma 0 9
#   (shards 00000…00009 of the repo's data/; no numbers: every shard)
cd "$(dirname "$0")/.." || exit 1
G='\e[1;32m'; R='\e[1;31m'; X='\e[0m'
REPO=${1:-}; NAME=${2:-}; A=${3:-}; B=${4:-$3}
[ -n "$REPO" ] && [ -n "$NAME" ] || { sed -n 4,5p "$0"; exit 1; }
DEST=datasets/raw/$NAME
[ -L "$DEST" ] && { echo -e "${R}$DEST is a link to another disk: the shards would be written there${X}"; exit 1; }
mkdir -p "$DEST"
INC=()
if [ -n "$A" ]; then
    for i in $(seq "$A" "$B"); do INC+=(--include "data/*-$(printf %05d "$i")-of-*.parquet"); done
else
    INC+=(--include "data/*.parquet")
fi
echo -e "${G}$REPO → $DEST${X} (${#INC[@]} pattern(s))"
HF_HOME=${HF_HOME:-$HOME/Documents/AI/HF_HOME} .venv/bin/hf download "$REPO" --repo-type dataset "${INC[@]}" --local-dir "$DEST" || { echo -e "${R}the download stopped${X}"; exit 1; }
.venv/bin/python lab/trainer/tracks.py info "$DEST"
du -sh "$DEST"
