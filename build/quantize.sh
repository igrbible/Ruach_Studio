#!/bin/bash

set -eu

Q="./build/quantize"

quantize() {
    local native="$1" type="$2"
    local out="${native%-*.gguf}-${type}.gguf"
    if [ -f "$out" ]; then
        echo "[Skip] $out"
    else
        $Q "$native" "$out" "$type"
    fi
}

# Backbone 3.6B (native BF16): no Q4_K_M, an audio code LM breaks below Q5
for type in Q5_K_M Q6_K Q8_0; do
    quantize models/YuE2-3B-BF16.gguf "$type"
done

# Audio encoder 632M, transcriber head 57M and audio tokenizer head 43M
# (native F32): Q8_0 alone, the quant a head and its encoder share; the
# linear projections, convolutions, tables, positions and LoRA factors kept
# exact
quantize models/MERT-v2-FullSong-F32.gguf Q8_0
quantize models/SheetSage2-F32.gguf Q8_0
quantize models/yue2-mothersuperior-realaudio-tokenizer-v4-F32.gguf Q8_0

# VAE: never quantized, its weights carry the audio and stay native F32
