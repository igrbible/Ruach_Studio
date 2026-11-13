#!/bin/bash
# Ruach Studio · tools/narrator-setup.sh — the Narrator made ready on this machine (HERESY 2374; Viktor 11.11.2026: the Narrator public in 2.0.7)
#
#   bash tools/narrator-setup.sh            what is here, then audio.cpp's server built if it is not, then Drama 3 fetched if it is not:
#                                           Q8_0 (40.9 GB) when the biggest NVIDIA card has 24 GB or more, else Q4_K (24.8 GB) (HERESY 2441)
#   bash tools/narrator-setup.sh --quant Q6_K   the same with another quant: Q4_K (24.8 GB), Q6_K (33.1 GB) or Q8_0 (40.9 GB)
#   bash tools/narrator-setup.sh --check    0 when audio.cpp's server is here (for a card where there is one, else for the processor), 1 when not
#   bash tools/narrator-setup.sh --where    the server's path
#   bash tools/narrator-setup.sh --build [--cpu]   audio.cpp's server built from build/audio.cpp: for the card when the CUDA toolkit (nvcc)
#                                           and a card are here, else for the processor; --cpu builds the processor's even beside a card
#   bash tools/narrator-setup.sh --build --vulkan  its Vulkan build, for an Intel card (Arc): build/audio.cpp/build/linux-vulkan-release
#   bash tools/narrator-setup.sh --vulkan-check    what Vulkan needs here: the Intel card, the driver, the packages to install for this system
#
# Q8_0 is the room's default wherever it fits (HERESY 2435) and the download's on a card of 24 GB (2441, Viktor 12.11.2026: «Да, Драму по
# умолчанию Q8_0 скачиваем, если тем более 24GB VRAM есть на машине»); a smaller card fetches Q4_K, and --quant Q8_0 fetches it beside.
# An Intel card reads Q4_K only.
# On a machine with an Intel card (vendor 8086, driver xe or i915, its own sensors) the Vulkan build is made too (HERESY 2436); its system
# packages are named for this system and never installed here (Debian/Ubuntu, Fedora, Arch: docs/GUIDE-READER.md, «On an Intel Arc»).
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
QUANT=auto; DO=all; CPU=0; VK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) DO=check ;; --where) DO=where ;; --build) DO=build ;; --cpu) CPU=1 ;;
    --vulkan) VK=1 ;; --vulkan-check) DO=vkcheck ;;
    --quant) QUANT="${2:-}"; shift ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 2 ;;
  esac
  shift
done
case "$QUANT" in auto|Q4_K|Q6_K|Q8_0) ;; *) echo "--quant takes Q4_K, Q6_K or Q8_0"; exit 2 ;; esac
# HERESY 2441: the quant fetched when none is asked: Q8_0 on a card of 24 GB (a 3090 says 24576 MiB; 23000 as lab/weights.py judges the tiers), else Q4_K
biggest_mb() { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -1 | tr -dc 0-9; }
if [ "$QUANT" = auto ]; then
  MB=$(biggest_mb); MB=${MB:-0}
  if [ "$MB" -ge 23000 ]; then QUANT=Q8_0; else QUANT=Q4_K; fi
fi

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
want() { [ $VK = 1 ] && { echo vulkan; return; }; card && [ $CPU = 0 ] && echo cuda || echo cpu; }   # the build this machine reads with

# HERESY 2436: an Intel card as the lab finds one (lab/gpu_live.py: vendor 8086, driver xe or i915, sensors of its own, so not a processor's GPU)
intel_card() {
  local c dev drv
  for c in /sys/class/drm/card[0-9]*; do
    case "$c" in *-*) continue ;; esac
    dev="$c/device"
    drv=$(basename "$(readlink -f "$dev/driver" 2>/dev/null)")
    [ "$(cat "$dev/vendor" 2>/dev/null)" = 0x8086 ] && { [ "$drv" = xe ] || [ "$drv" = i915 ]; } && ls -d "$dev"/hwmon/hwmon* >/dev/null 2>&1 && return 0
  done
  return 1
}
distro() { . /etc/os-release 2>/dev/null; echo " ${ID:-} ${ID_LIKE:-} "; }
# the packages Vulkan's build and the Intel driver want, by this system's names
vk_packages() {
  case "$(distro)" in
    *" fedora "*|*" rhel "*) echo "sudo dnf install vulkan-loader-devel glslc spirv-headers-devel mesa-vulkan-drivers vulkan-tools" ;;
    *" arch "*) echo "sudo pacman -S --needed vulkan-icd-loader vulkan-headers shaderc spirv-headers vulkan-intel vulkan-tools" ;;
    *) echo "sudo apt install libvulkan-dev glslc spirv-headers mesa-vulkan-drivers vulkan-tools" ;;
  esac
}
# what is missing for the Vulkan build: the headers, the shader compiler, the SPIR-V header, the Intel driver's manifest
vk_missing() {
  local m=()
  [ -f /usr/include/vulkan/vulkan.h ] || m+=("the Vulkan headers")
  command -v glslc >/dev/null 2>&1 || m+=("glslc")
  [ -f /usr/include/spirv/unified1/spirv.hpp ] || m+=("the SPIR-V headers")
  ls /usr/share/vulkan/icd.d/intel_icd*.json >/dev/null 2>&1 || m+=("Mesa's Intel Vulkan driver")
  [ ${#m[@]} -gt 0 ] && { local IFS=,; echo "${m[*]}" | sed 's/,/, /g'; }
}
vk_check() {
  local miss
  if intel_card; then echo "${G}here${X}      an Intel card"; else echo "${Y}no Intel card here${X} ${D}(the Narrator sends Drama 3 to the Vulkan build only on one)${X}"; fi
  miss=$(vk_missing)
  if [ -n "$miss" ]; then echo "${R}missing${X}   $miss"; echo "          $(vk_packages)"; else echo "${G}here${X}      Vulkan's headers, glslc, the SPIR-V headers, Mesa's Intel driver"; fi
  if command -v vulkaninfo >/dev/null 2>&1; then
    vulkaninfo --summary 2>/dev/null | grep -E "deviceName|driverName" | sed 's/^[[:space:]]*/          /'
  else
    echo "${D}          vulkaninfo is not here (vulkan-tools): the card the driver sees is not shown${X}"
  fi
  if p=$(server vulkan); then echo "${G}here${X}      audio.cpp's Vulkan build ${D}$p${X}"; else echo "${Y}not built${X} audio.cpp's Vulkan build: bash tools/narrator-setup.sh --build --vulkan"; fi
  [ -z "$miss" ]
}

case $DO in
  check) server "$(want)" >/dev/null || { [ "$(want)" = cpu ] && server cuda >/dev/null; }; exit $? ;;
  where) server "$(want)" || { [ $VK = 0 ] && { server cuda || server cpu; }; }; exit $? ;;
  vkcheck) vk_check; exit $? ;;
esac

build() {
  local be; be=$(backend)
  [ "${1:-}" = vulkan ] && be=vulkan
  [ -f "$SRC/CMakeLists.txt" ] || { echo "${R}no build/audio.cpp here: this Studio carries no Narrator's engine source${X}"; return 1; }
  command -v cmake >/dev/null 2>&1 || { echo "${R}cmake is not here: install cmake (3.21 or newer) and run this again${X}"; return 1; }
  command -v g++ >/dev/null 2>&1 || command -v c++ >/dev/null 2>&1 || { echo "${R}no C++ compiler here: install g++ and run this again${X}"; return 1; }
  if [ "$be" = vulkan ]; then                         # HERESY 2436: the packages named for this system, never installed from here
    local miss; miss=$(vk_missing)
    if [ -n "$miss" ]; then
      echo "${R}the Vulkan build wants $miss${X}: install them, then run this again"
      echo "          $(vk_packages)"
      return 1
    fi
  fi
  if [ "$be" = cpu ] && card && [ $CPU = 0 ]; then
    echo "${Y}a card is here but not the CUDA toolkit (nvcc): the server is built for the processor, about seven times slower than real time.${X}"
    echo "${Y}Install the CUDA toolkit (12.x) and run this again to read on the card.${X}"
  fi
  local nv; nv=$(nvcc_bin)
  [ -n "$nv" ] && export PATH="$(dirname "$nv"):$PATH"
  local args=(--backend "$be" --model-set custom --models fish_drama3 --target audiocpp_server -j "${NARRATOR_JOBS:-$(nproc)}")   # NARRATOR_JOBS: fewer compilers beside other work
  [ "$be" = cuda ] && args+=(--cuda-arch native)
  echo "${B}building audio.cpp's server for the $(case $be in cuda) echo card ;; vulkan) echo "Intel card (Vulkan)" ;; *) echo processor ;; esac)${X} ${D}(build/audio.cpp, fish_drama3 only; the log in tmp/narrator-build.log)${X}"
  mkdir -p "$ROOT/tmp"
  if ( cd "$SRC" && bash scripts/build_linux.sh "${args[@]}" ) >"$ROOT/tmp/narrator-build.log" 2>&1 && server "$be" >/dev/null; then
    echo "${G}built${X}     $(server "$be")"
    return 0
  fi
  echo "${R}the build failed${X}: $(grep -a -i -E "error|not found|could not" "$ROOT/tmp/narrator-build.log" | head -3 | tr '\n' ' ' | cut -c1-400)"
  echo "${D}the whole log: $ROOT/tmp/narrator-build.log${X}"
  return 1
}

if [ $DO = build ]; then build "$([ $VK = 1 ] && echo vulkan)"; exit $?; fi

# all: what is here, the server, then the model
rc=0
echo "${B}Ruach Studio · the Narrator on this machine${X}"
if p=$(server "$(want)"); then echo "${G}here${X}      audio.cpp's server ${D}$p${X}"
else build "$([ $VK = 1 ] && echo vulkan)" || rc=1; fi
if [ $VK = 0 ] && intel_card; then                   # HERESY 2436: an Intel card reads through the Vulkan build, made beside the other
  if p=$(server vulkan); then echo "${G}here${X}      audio.cpp's Vulkan build ${D}$p${X}"
  elif ! build vulkan; then
    echo "${Y}the Intel card is here but not its Vulkan build: the Narrator reads elsewhere until it is built${X}"
    card || rc=1                                     # the Intel card the only one: the Narrator is not ready on it
  fi
fi
bash "$ROOT/heresy/fetch-heresy.sh" --only none --narrator "$QUANT" || rc=1
[ $rc = 0 ] && echo "${G}the Narrator is ready${X}: open its room in the Studio (the lab picks up a new model at the next reading)"
exit $rc
