#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): the models the studio starts without, each asked first with its size by
# heresy/fetch-heresy.sh (answer y or n in this terminal), chosen by the biggest card here: the Artist's painter (Krea 2 Muse
# where a card has 16 GB, its Q8 too on 24 GB; SDXL below), the style listener (Qwen2.5-Omni, Q8_0 from 12 GB, else Q4_K_M)
# and the base the LoRA trainer trains on (bf16 on 24 GB, else int8); HERESY 1285: and the BF16 backbone where the install took
# Q8_0 (Viktor 09.10.2026: «на эту видеокарту RTX5000 можно ли будет со студии докачать BF16?»). From a terminal: bash pinokio/extras.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
stop() { echo; echo "ruach models stopped: $1"; exit 1; }
. "$ROOT/pinokio/env.sh"
V=$(ruach_vram)
ART=(--artwork); [ "$V" -ge 23000 ] && ART+=(--artwork-q8)
LISTENER=Q8_0; [ "$V" -lt 12000 ] && LISTENER=Q4_K_M
TRAINER=bf16; [ "$V" -lt 23000 ] && TRAINER=int8
BB=(); [ -s "$ROOT/models/YuE2-3B-BF16.gguf" ] || BB=(--backbone BF16)
echo "a card of $V MiB: the painter ${ART[*]}, the listener $LISTENER, the trainer's base $TRAINER$([ ${#BB[@]} -gt 0 ] && echo ", the BF16 backbone")"
bash heresy/fetch-heresy.sh "${ART[@]}" --listener "$LISTENER" --trainer "$TRAINER" "${BB[@]}" || stop "a download did not complete (the lines marked failed above say which and why): run it again to go on"

# the listener's GGUF runs through llama.cpp's llama-mtmd-cli (fetch-heresy.sh clones it): built here, with the studio's toolchain
L="$ROOT/vendor/llama.cpp"
if ls "$ROOT"/checkpoints/Qwen2.5-Omni-7B-GGUF/*.gguf >/dev/null 2>&1 && [ -d "$L" ] && [ ! -x "$L/build/bin/llama-mtmd-cli" ]; then
    echo; echo "── llama-mtmd-cli for the listener (a few minutes)"
    [ -n "$RUACH_CUDA_HOME" ] || stop "no CUDA toolkit 12.8 to build llama-mtmd-cli with"
    ruach_tools || stop "cmake and ninja could not be put into .venv"
    cmake -S "$L" -B "$L/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER="$RUACH_CUDA_HOME/bin/nvcc" \
          -DCMAKE_CUDA_ARCHITECTURES=native -DLLAMA_CURL=OFF >/dev/null || stop "llama.cpp did not configure"
    nice -n 10 cmake --build "$L/build" -j "$(nproc)" --target llama-mtmd-cli || stop "llama-mtmd-cli did not build"
fi
echo; echo "done: the studio sees what came at its next start"
