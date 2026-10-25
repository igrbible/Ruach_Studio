#!/bin/bash
# Download YuE2 checkpoints from HuggingFace
# Usage: ./checkpoints.sh [--all]
#   default: YuE2-3B (MoT backbone + qwen.tiktoken) + YuE2-Vae (listening decoder)
#            + SheetSage2 and its MERT-v2-FullSong base model (audio to score),
#            both gated: accept their terms on HuggingFace and hf auth login first
#            + the v9 audio tokenizer head of Mothersuperior (audio to codes)
#   --all:   + YuE2-Vae-legacy (benchmark decoder)

set -eu

DIR="checkpoints"
mkdir -p "$DIR"

HF="hf download --quiet"

dl_repo() {
    local name="$1" repo="$2"
    local target="$DIR/$name"
    if [ -d "$target" ] && [ "$(ls "$target"/*.safetensors 2>/dev/null | wc -l)" -gt 0 ]; then
        echo "[OK] $name"
        return
    fi
    echo "[Download] $name <- $repo"
    $HF "$repo" --local-dir "$target"
}

dl_file() {
    local name="$1" repo="$2" file="$3"
    local target="$DIR/$name"
    if [ -f "$target/$file" ]; then
        echo "[OK] $name/$file"
        return
    fi
    echo "[Download] $name/$file <- $repo"
    $HF "$repo" "$file" --local-dir "$target"
}

# Core (required)
dl_repo "YuE2-3B" "m-a-p/YuE2-3B"
dl_repo "YuE2-Vae" "m-a-p/YuE2-Vae"
dl_repo "SheetSage2" "m-a-p/SheetSage2"
dl_repo "MERT-v2-FullSong" "m-a-p/MERT-v2-FullSong"
dl_file "yue2-mothersuperior-realaudio-tokenizer-v4" "Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4" \
    "tokenizer_head_joint_v9.safetensors"

# Every decoder from the YuE2 release
if [ "${1:-}" = "--all" ]; then
    dl_repo "YuE2-Vae-legacy" "m-a-p/YuE2-Vae-legacy"
fi

find "$DIR" -name '.cache' -type d -exec rm -rf {} + 2>/dev/null
echo "[Done] Checkpoints ready in $DIR"
echo "[Done] Run: ./convert.py"
