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

# Transcriber 632M (native F32): the linear projections of the conformer
# and the decoder, convolutions and tables kept exact
for type in Q5_K_M Q6_K Q8_0; do
    quantize models/SheetSage2-F32.gguf "$type"
done

# VAE: never quantized, its weights carry the audio and stay native F32
