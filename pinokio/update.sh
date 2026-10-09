#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): an update to the newest release on the branch (main): the code, the Python packages,
# the page and the engine (when its C++ changed), the models a new release pins. The studio stopped first (Pinokio's menu offers
# Update only then). From a terminal: bash pinokio/update.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
G=$'\e[1;32m' R=$'\e[1;31m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ]; then G="" R="" X=""; fi
step() { echo; echo "${G}── $1${X}"; }
stop() { echo; echo "${R}ruach update stopped: $1${X}"; exit 1; }

step "① the code"
changed=$(git status --porcelain --untracked-files=no | wc -l)
[ "$changed" = 0 ] || stop "$changed files git tracks were changed here: an update would mix them; update by hand"
before=$(cat VERSION 2>/dev/null)
git fetch --tags --force origin || stop "git could not reach the repository"
branch=$(git symbolic-ref -q --short HEAD) || { git checkout -q main || stop "git could not go back to main"; branch=main; }   # the page's own update leaves a release tag checked out
git pull --ff-only origin "$branch" || stop "$branch here has moved apart from the repository's: update by hand"
echo "  $before → $(cat VERSION 2>/dev/null)"

. "$ROOT/pinokio/env.sh"
step "② the Python packages"
bash lab/install-venv.sh || stop "the Python packages did not install (lab/install-venv.sh says why above)"
step "③ the page, and the engine when its code changed"
ruach_tools || stop "cmake and ninja could not be put into .venv"
bash build.sh --no-restart || stop "the build failed (build.sh says why above)"
step "④ the models this release pins"
Q=$(ruach_quant)
bash fetch-models.sh ${Q:+--quant "$Q"} || stop "a download did not complete (fetch-models.sh says which above): Update again goes on from there"
echo
echo "${G}Updated to $(cat VERSION 2>/dev/null).${X} Start it from Pinokio's menu."
