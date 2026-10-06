#!/bin/bash
# Download the pre-quantized YuE2 GGUF release from HuggingFace
#
# Usage: ./models.sh [options]
#   default:    Q8_0 backbone + F32 VAE + Q8_0 transcriber
#   --all:      every published quant
#   --quant X:  backbone and transcriber quant (BF16, Q8_0, Q6_K, Q5_K_M)

set -eu

REPO="Serveurperso/YuE2-GGUF"
DIR="models"
QUANT="Q8_0"
ALL=0

while [ $# -gt 0 ]; do
    case "$1" in
        --all)   ALL=1 ;;
        --quant) QUANT="$2"; shift ;;
        *)       echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

mkdir -p "$DIR"

dl() {
    local file="$1"
    if [ -f "$DIR/$file" ]; then
        echo "[OK] $file"
        return
    fi
    echo "[Download] $file"
    hf download --quiet "$REPO" "$file" --local-dir "$DIR"
}

if [ "$ALL" = 1 ]; then
    dl "YuE2-Vae-F32.gguf"
    dl "YuE2-3B-BF16.gguf"
    dl "YuE2-3B-Q5_K_M.gguf"
    dl "YuE2-3B-Q6_K.gguf"
    dl "YuE2-3B-Q8_0.gguf"
    dl "SheetSage2-F32.gguf"
    dl "SheetSage2-Q5_K_M.gguf"
    dl "SheetSage2-Q6_K.gguf"
    dl "SheetSage2-Q8_0.gguf"
    exit 0
fi

# Resolve the request to the closest published quant, rounding up.
# Matches the quantize.sh matrix: BF16, Q5_K_M, Q6_K, Q8_0, no Q4.
resolve_quant() {
    case "$1" in
        BF16|F32)      echo "BF16" ;;
        Q6_K)          echo "Q6_K" ;;
        Q5_K_M|Q4_K_M) echo "Q5_K_M" ;;
        *)             echo "Q8_0" ;;
    esac
}

dl "YuE2-Vae-F32.gguf"
dl "YuE2-3B-$(resolve_quant "$QUANT").gguf"
# The transcriber has no BF16, its native is F32
transcriber_quant="$(resolve_quant "$QUANT")"
[ "$transcriber_quant" = "BF16" ] && transcriber_quant="F32"
dl "SheetSage2-$transcriber_quant.gguf"
