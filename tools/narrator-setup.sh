#!/bin/bash
# Ruach Studio · tools/narrator-setup.sh — the Narrator made ready on this machine (HERESY 2374; Viktor 11.11.2026: the Narrator public in 2.0.7)
#
#   bash tools/narrator-setup.sh            what is here, then audio.cpp's server built if it is not, then Drama 3 fetched if it is not (Q4_K)
#   bash tools/narrator-setup.sh --quant Q6_K   the same with another quant: Q4_K (24.8 GB), Q6_K (33.1 GB) or Q8_0 (40.9 GB)
#   bash tools/narrator-setup.sh --check    0 when audio.cpp's server is here (for a card where there is one, else for the processor), 1 when not
#   bash tools/narrator-setup.sh --where    the server's path
#   bash tools/narrator-setup.sh --build [--cpu]   audio.cpp's server built from build/audio.cpp: for the card when the CUDA toolkit (nvcc)
#                                           and a card are here, else for the processor; --cpu builds the processor's even beside a card
#
# The Narrator reads with Fish Audio Drama 3 through audio.cpp (Apache-2.0), vendored in build/audio.cpp at its pin and never fetched from
# upstream here. Its model comes from goldhub/Ruach_Studio_Models_v2 with the Fish Audio Community License 1.0 beside it (heresy/fetch-heresy.sh
# --narrator, or Engine → Models → Narrator in the Studio). Built with Fish Audio.
# Needs for the build: cmake (3.21 or newer), a C++ compiler (g++ 11 or newer), and for a card the CUDA toolkit (12.x); about 10 minutes for
# this machine's card alone, about 2 GB of disk under build/audio.cpp/build/.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/build/audio.cpp"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi
QUANT=Q4_K; DO=all; CPU=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) DO=check ;; --where) DO=where ;; --build) DO=build ;; --cpu) CPU=1 ;;
    --quant) QUANT="${2:-}"; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 2 ;;
  esac
  shift
done
case "$QUANT" in Q4_K|Q6_K|Q8_0) ;; *) echo "--quant takes Q4_K, Q6_K or Q8_0"; exit 2 ;; esac

card() { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L 2>/dev/null | grep -q "^GPU "; }
nvcc_bin() { command -v nvcc 2>/dev/null || { [ -x /usr/local/cuda/bin/nvcc ] && echo /usr/local/cuda/bin/nvcc; }; }
backend() { [ $CPU = 0 ] && card && [ -n "$(nvcc_bin)" ] && echo cuda || echo cpu; }
# the same places the engine looks (lab/reader_engines/drama3/engine.py, BIN): the release's own build first
server() {
  local b="$1" p
  for p in "$SRC/build/linux-$b-release/bin/audiocpp_server" "$ROOT/heresy/MISC/audio.cpp/build/linux-$b-release/bin/audiocpp_server"; do
    [ -x "$p" ] && { echo "$p"; return 0; }
  done
  return 1
}
want() { card && [ $CPU = 0 ] && echo cuda || echo cpu; }   # the build this machine reads with

case $DO in
  check) server "$(want)" >/dev/null || { [ "$(want)" = cpu ] && server cuda >/dev/null; }; exit $? ;;
  where) server "$(want)" || server cuda || server cpu; exit $? ;;
esac

build() {
  local be; be=$(backend)
  [ -f "$SRC/CMakeLists.txt" ] || { echo "${R}no build/audio.cpp here: this Studio carries no Narrator's engine source${X}"; return 1; }
  command -v cmake >/dev/null 2>&1 || { echo "${R}cmake is not here: install cmake (3.21 or newer) and run this again${X}"; return 1; }
  command -v g++ >/dev/null 2>&1 || command -v c++ >/dev/null 2>&1 || { echo "${R}no C++ compiler here: install g++ and run this again${X}"; return 1; }
  if [ "$be" = cpu ] && card && [ $CPU = 0 ]; then
    echo "${Y}a card is here but not the CUDA toolkit (nvcc): the server is built for the processor, about seven times slower than real time.${X}"
    echo "${Y}Install the CUDA toolkit (12.x) and run this again to read on the card.${X}"
  fi
  local nv; nv=$(nvcc_bin)
  [ -n "$nv" ] && export PATH="$(dirname "$nv"):$PATH"
  local args=(--backend "$be" --model-set custom --models fish_drama3 --target audiocpp_server -j "${NARRATOR_JOBS:-$(nproc)}")   # NARRATOR_JOBS: fewer compilers beside other work
  [ "$be" = cuda ] && args+=(--cuda-arch native)
  echo "${B}building audio.cpp's server for the $([ "$be" = cuda ] && echo card || echo processor)${X} ${D}(build/audio.cpp, fish_drama3 only; the log in tmp/narrator-build.log)${X}"
  mkdir -p "$ROOT/tmp"
  if ( cd "$SRC" && bash scripts/build_linux.sh "${args[@]}" ) >"$ROOT/tmp/narrator-build.log" 2>&1 && server "$be" >/dev/null; then
    echo "${G}built${X}     $(server "$be")"
    return 0
  fi
  echo "${R}the build failed${X}: $(grep -a -i -E "error|not found|could not" "$ROOT/tmp/narrator-build.log" | head -3 | tr '\n' ' ' | cut -c1-400)"
  echo "${D}the whole log: $ROOT/tmp/narrator-build.log${X}"
  return 1
}

if [ $DO = build ]; then build; exit $?; fi

# all: what is here, the server, then the model
rc=0
echo "${B}Ruach Studio · the Narrator on this machine${X}"
if p=$(server "$(want)"); then echo "${G}here${X}      audio.cpp's server ${D}$p${X}"
else build || rc=1; fi
bash "$ROOT/heresy/fetch-heresy.sh" --only none --narrator "$QUANT" || rc=1
[ $rc = 0 ] && echo "${G}the Narrator is ready${X}: open its room in the Studio (the lab picks up a new model at the next reading)"
exit $rc
