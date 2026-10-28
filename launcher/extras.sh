#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): the models the studio starts without, each asked first with its size by
# heresy/fetch-heresy.sh (answer y or n in this terminal), chosen by the biggest card here: the Artist's painter (Qwen-Image 2512:
# Q6 on 24 GB, Q4 below, streamed from RAM on a card under 16 GB; HERESY 1428: Krea 2 gone), the style listener (Qwen2.5-Omni, Q8_0 from 12 GB, else Q4_K_M)
# and the base the LoRA trainer trains on (bf16 on 24 GB, else int8); HERESY 1285: and the BF16 backbone where the install took
# Q8_0 (Viktor 09.10.2026: «на эту видеокарту RTX5000 можно ли будет со студии докачать BF16?»). From a terminal: bash launcher/extras.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
stop() { echo; echo "ruach models stopped: $1"; exit 1; }
. "$ROOT/launcher/env.sh"
V=$(ruach_vram)
ART=(--artwork)
# HERESY 1323: Qwen-Image 2512 with Lightning (Q6_K on 24 GB, Q4_K_M below: whole on 16 GB, its blocks streamed from RAM on a smaller card);
# Qwen-Image 2.1 only when asked by name (its licence). HERESY 1428: Krea 2 gone, --artwork brings the prompt writer and the filter
[ "$V" -ge 23000 ] && ART+=(--qwen 2512-q6) || ART+=(--qwen 2512-q4)
LISTENER=Q8_0; [ "$V" -lt 12000 ] && LISTENER=Q4_K_M
# HERESY 1811: the studio's writer by the biggest card: the AutoRound quant as it is from 12 GB, the compact one from 8 GB, none below
WRITER=quality; [ "$V" -lt 11500 ] && WRITER=compact; [ "$V" -lt 7500 ] && WRITER=""
W=(); [ -n "$WRITER" ] && W=(--writer "$WRITER")
TRAINER=bf16; [ "$V" -lt 23000 ] && TRAINER=int8
BB=(); [ -s "$ROOT/models/YuE2-3B-BF16.gguf" ] || BB=(--backbone BF16)
echo "a card of $V MiB: the painter ${ART[*]}, the listener $LISTENER, the writer ${WRITER:-none (a card under 8 GB)}, the trainer's base $TRAINER$([ ${#BB[@]} -gt 0 ] && echo ", the BF16 backbone")"
bash heresy/fetch-heresy.sh "${ART[@]}" --listener "$LISTENER" --trainer "$TRAINER" "${W[@]}" "${BB[@]}" || stop "a download did not complete (the lines marked failed above say which and why): run it again to go on"

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
# HERESY 1811: the studio's writer runs through llama.cpp's llama-server: built here too, with the same toolchain
if ls "$ROOT"/checkpoints/Qwopus3.5-9B-GGUF/*.gguf >/dev/null 2>&1 && [ -d "$L" ] && [ ! -x "$L/build/bin/llama-server" ]; then
    echo; echo "── llama-server for the studio's writer (a few minutes)"
    [ -n "$RUACH_CUDA_HOME" ] || stop "no CUDA toolkit 12.8 to build llama-server with"
    ruach_tools || stop "cmake and ninja could not be put into .venv"
    cmake -S "$L" -B "$L/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER="$RUACH_CUDA_HOME/bin/nvcc" \
          -DCMAKE_CUDA_ARCHITECTURES=native -DLLAMA_CURL=OFF >/dev/null || stop "llama.cpp did not configure"
    nice -n 10 cmake --build "$L/build" -j "$(nproc)" --target llama-server || stop "llama-server did not build"
fi
echo; echo "done: the studio sees what came at its next start"
