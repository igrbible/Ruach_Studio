#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259, Viktor 09.10.2026: «Пиши pinokio.js… Давай в RC3 включаем»): INSTALL.md's install in
# six steps, in the studio's folder. pinokio/install.js runs it; from a terminal it runs the same: bash pinokio/install.sh
# Each step says what it does; one that fails ends the install with its reason on the last line, «ruach install stopped: …»,
# the words pinokio/install.js stops on. Safe to run again: what is here stays, a download goes on where it stopped.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
G=$'\e[1;32m' Y=$'\e[1;33m' R=$'\e[1;31m' D=$'\e[2m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ]; then G="" Y="" R="" D="" X=""; fi
step() { echo; echo "${G}── $1${X}"; }
stop() { echo; echo "${R}ruach install stopped: $1${X}"; exit 1; }
echo "${D}Ruach Studio $(cat VERSION 2>/dev/null) · $ROOT${X}"

step "① the machine"
[ "$(uname -s)/$(uname -m)" = Linux/x86_64 ] || stop "the studio runs on Linux x86_64 with an NVIDIA card (on Windows: INSTALL_WINDOWS.md, through WSL)"
nvidia-smi -L >/dev/null 2>&1 || stop "no NVIDIA card answers nvidia-smi: the studio needs one, with its driver"
nvidia-smi --query-gpu=index,name,memory.total,compute_cap --format=csv,noheader | sed 's/^/  GPU/'
for t in git curl ffmpeg; do command -v "$t" >/dev/null || stop "$t is missing (on Ubuntu: sudo apt install $t)"; done

step "② the CUDA toolkit 12.8"
. "$ROOT/pinokio/env.sh"
[ -n "$RUACH_CUDA_HOME" ] || stop "no CUDA toolkit 12.8 (nvcc): Pinokio's AI bundle brings one, or NVIDIA's cuda-toolkit-12-8 (INSTALL.md)"
echo "  nvcc $(ruach_nvcc_release "$RUACH_CUDA_HOME/bin/nvcc") in $RUACH_CUDA_HOME · C++: ${CXX:-$(command -v c++ || command -v g++ || echo none)} $("${CXX:-g++}" -dumpversion 2>/dev/null)"

step "③ Python 3.12: .venv (the studio) and .venv-art (the Artist), about 10 GB"
for v in .venv .venv-art; do
    [ -x "$v/bin/python" ] && continue
    [ -e "$v" ] && stop "$v is here but has no Python in it: move it away (or Reset) and install again"
    if command -v python3.12 >/dev/null && python3.12 -m venv "$v" 2>/dev/null; then
        echo "  $v from $(command -v python3.12)"
    elif command -v uv >/dev/null; then
        rm -rf "$v"                                     # only what the failed python3.12 -m venv above left: $v was not here
        uv venv --seed --python 3.12 "$v" || stop "uv could not make $v"
    else
        stop "no Python 3.12 that makes a venv (on Ubuntu 24.04: sudo apt install python3.12-venv)"
    fi
done
bash lab/install-venv.sh || stop "the Python packages did not install (lab/install-venv.sh says why above)"

step "④ cmake 3.24+ and ninja"
ruach_tools || stop "cmake and ninja could not be put into .venv"
echo "  $(cmake --version | head -1) · ninja $(ninja --version)"

step "⑤ the engine (its first build takes a few minutes)"
# build.sh configures cmake only when build/build has no CMakeCache.txt; a configure that failed late (no CUDA found) leaves one,
# and Install again would build on it. Until the engine has been built once, the cache is made anew (the compiled parts stay).
[ -x build/build/yue-server ] || rm -f build/build/CMakeCache.txt
bash build.sh --server --no-restart || stop "the engine did not build (build.sh says why above)"

step "⑥ the models: pinned, checked, each with its size"
Q=$(ruach_quant)
echo "  the backbone for a card of $(ruach_vram) MiB: ${Q:-BF16}"
[ "$Q" = Q5_K_M ] && echo "${Y}  under 12 GB: the studio is made for 12 GB and more; short songs only${X}"
bash fetch-models.sh ${Q:+--quant "$Q"} || stop "a download did not complete (fetch-models.sh says which above): Install again goes on from there"

echo
echo "${G}Ruach Studio is installed.${X} Start it from Pinokio's menu (by hand: ./lab/start-lab.sh, then ./start.sh)."
echo "${D}More models when you want them, each asked first with its size: «More models» in the menu (heresy/fetch-heresy.sh).${X}"
