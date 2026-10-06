#!/usr/bin/env bash
# What this machine has for the install. Changes nothing: it prints what is there, what is missing, and
# the exact lines to fix it. Linux/WSL (NVIDIA + CUDA) or macOS (Apple Silicon: Metal + Accelerate).
# It finds tools that are installed but not on PATH (WSL: nvcc in /usr/local/cuda/bin, nvidia-smi in
# /usr/lib/wsl/lib; macOS: the Chrome app, a project-local cmake/ninja): check here BEFORE installing.
#
#   tools/check-machine.sh [INSTALL_FOLDER]   (the folder is used for the free-disk check and .venv;
#                                              default: the install this script is in)
#
# Exit status 0 when the build can go ahead, 1 otherwise.
set -uo pipefail
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT}"; [ -d "$TARGET" ] || TARGET="$(dirname "$TARGET")"
OS=$(uname -s); ARCH=$(uname -m)
core_missing=(); opt_missing=(); font_missing=(); path_add=(); blockers=0

row() { printf '  %s%-9s%s %-16s %s\n' "$1" "$2" "$X" "$3" "${D}${4:-}${X}"; }
find_tool() {   # first of: on PATH, then the given places
  local name="$1"; shift
  local p; p=$(command -v "$name" 2>/dev/null) && { echo "$p"; return; }
  for p in "$@"; do [ -x "$p" ] && { echo "$p"; return; }; done
}
ver_ge() { python3 -c 'import sys; a, b = (tuple(int(x) for x in v.split(".")[:3] if x.isdigit()) for v in sys.argv[1:3]); sys.exit(0 if a >= b else 1)' "$1" "$2" 2>/dev/null; }
uniq_words() { printf '%s\n' "$@" | awk 'NF && !seen[$0]++' | tr '\n' ' ' | sed 's/ $//'; }
ram_gib() { python3 -c 'import os; print(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // 2**30)'; }
free_gib() { python3 -c 'import shutil, sys; print(shutil.disk_usage(sys.argv[1]).free // 2**30)' "$1"; }

if [ "$OS" = Darwin ]; then
  # ======================================================================= macOS
  echo "${B}machine${X}  macOS $(sw_vers -productVersion 2>/dev/null), $ARCH$([ "$ARCH" = arm64 ] && echo " (Apple Silicon)")"
  echo "${B}gpu${X}"
  if [ "$ARCH" = arm64 ]; then
    row "$G" ok GPU "Apple GPU through Metal; math libraries through Accelerate"
    row "$G" build flags "-DGGML_CUDA=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_BLAS=ON -DGGML_BLAS_VENDOR=Apple"
    row "$Y" note Metal "builds and starts; generating songs on Metal is not yet verified: CPU generation is"
  else
    row "$Y" note GPU "Intel Mac: the build works on the CPU (slow); this kit is untested here"
  fi
  mem=$(ram_gib)
  row "$([ "$mem" -ge 16 ] && echo "$G" || echo "$Y")" "$([ "$mem" -ge 16 ] && echo ok || echo low)" memory \
      "$mem GiB unified memory, shared by the CPU, the GPU and macOS itself: not dedicated VRAM$([ "$mem" -lt 16 ] && echo "; the converter uses its low-memory mode")"

  echo "${B}core${X}  ${D}(build, models, downloads)${X}"
  if xcode-select -p >/dev/null 2>&1 && [ -x /usr/bin/clang ]; then
    row "$G" ok "Xcode CLT" "$(/usr/bin/clang --version | head -1)"
  else
    row "$R" missing "Xcode CLT" "run: xcode-select --install (Apple's compiler and git)"; core_missing+=("xcode-select --install"); blockers=$((blockers + 1))
  fi
  for t in git curl unzip python3; do
    p=$(command -v "$t" 2>/dev/null) && row "$G" ok "$t" "$p" || { row "$R" missing "$t" "comes with the Xcode Command Line Tools"; blockers=$((blockers + 1)); }
  done
  if command -v python3 >/dev/null; then
    pv=$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')
    python3 -c "import venv, ensurepip" 2>/dev/null && row "$G" ok "python3 venv" "Python $pv, venv + ensurepip" || { row "$R" missing "python3 venv" "Python $pv has no venv/ensurepip"; blockers=$((blockers + 1)); }
    ver_ge "$pv" 3.11 || row "$Y" note "python3" "$pv: the converter's pinned packages want 3.11+ (it falls back to other versions and says so)"
  fi
  # cmake and ninja: on PATH, or project-local in .venv (pip wheels; no Homebrew needed)
  BV="$TARGET/.venv/bin"
  for t in cmake ninja; do
    p=$(find_tool "$t" "$BV/$t")
    if [ -z "$p" ]; then row "$R" missing "$t" "project-local: lab/install-venv.sh && .venv/bin/pip install cmake ninja"; core_missing+=(build-venv); blockers=$((blockers + 1))
    else
      [ "$p" = "$BV/$t" ] && path_add+=("$BV")
      v=$("$p" --version | head -1 | awk '{print $NF}')
      if [ "$t" = cmake ] && ! ver_ge "$v" 3.24; then row "$R" too-old cmake "$v at $p, needs 3.24+"; blockers=$((blockers + 1)); else row "$G" ok "$t" "$v, $p"; fi
    fi
  done

  echo "${B}optional${X}  ${D}(only for the page and FLAC tests)${X}"
  if p=$(command -v node 2>/dev/null); then
    v=$(node --version | tr -d v); ver_ge "$v" 22 && row "$G" ok node "$v" || { row "$Y" too-old node "$v, needs 22+"; opt_missing+=("Node.js 22+"); }
  else row "$Y" missing node "Node.js 22+ (nodejs.org, nvm or Homebrew; or set YUE2_NODE)"; opt_missing+=("Node.js 22+"); fi
  CH=$(find_tool google-chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium")
  [ -n "$CH" ] && row "$G" ok Chrome "$CH (the tests find it; YUE2_CHROME overrides)" || { row "$Y" missing Chrome "Google Chrome or Chromium in /Applications"; opt_missing+=(Chrome); }
  for t in flac metaflac ffmpeg; do
    command -v "$t" >/dev/null && row "$G" ok "$t" "$(command -v "$t")" || { row "$Y" missing "$t" "Homebrew: brew install $([ "$t" = metaflac ] && echo flac || echo "$t")"; opt_missing+=("$t"); }
  done
  echo "${B}page fonts${X}  ${D}(macOS's own fonts cover every symbol the page uses)${X}"
else
  # ======================================================================= Linux / WSL
  WSL=0; command grep -qi microsoft /proc/version 2>/dev/null && WSL=1
  echo "${B}machine${X}  $(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-unknown Linux}"), $ARCH$([ $WSL = 1 ] && echo ", WSL2")"
  echo "${B}gpu${X}"
  SMI=$(find_tool nvidia-smi /usr/lib/wsl/lib/nvidia-smi /usr/bin/nvidia-smi)
  CC=""
  if [ -n "$SMI" ]; then
    [ "$SMI" != "$(command -v nvidia-smi 2>/dev/null)" ] && path_add+=("$(dirname "$SMI")")
    gpu=$("$SMI" --query-gpu=name,memory.total,compute_cap,driver_version --format=csv,noheader 2>/dev/null | head -1)
    if [ -n "$gpu" ]; then
      CC=$(echo "$gpu" | awk -F', ' '{print $3}')
      row "$G" ok nvidia-smi "$SMI"; row "$G" ok GPU "$gpu"
    else
      row "$R" error nvidia-smi "$SMI runs but sees no GPU"; blockers=$((blockers + 1))
    fi
  else
    row "$R" missing nvidia-smi "$([ $WSL = 1 ] && echo "WSL gets it from the Windows NVIDIA driver: update that driver; never install a Linux NVIDIA driver inside WSL" || echo "install the NVIDIA driver for this distro")"
    blockers=$((blockers + 1))
  fi
  NVCC=$(find_tool nvcc /usr/local/cuda/bin/nvcc $(ls -d /usr/local/cuda-*/bin/nvcc /opt/cuda/bin/nvcc 2>/dev/null | sort -V -r))
  if [ -n "$NVCC" ]; then
    [ "$NVCC" != "$(command -v nvcc 2>/dev/null)" ] && path_add+=("$(dirname "$NVCC")")
    cuda=$("$NVCC" --version | sed -n 's/.*release \([0-9.]*\).*/\1/p')
    need="11.0"; [ -n "$CC" ] && [ "${CC%%.*}" -ge 12 ] 2>/dev/null && need="12.8"
    if ver_ge "$cuda" "$need"; then row "$G" ok nvcc "CUDA $cuda, $NVCC"
    else row "$R" too-old nvcc "CUDA $cuda, this GPU needs $need or newer"; blockers=$((blockers + 1)); fi
    if [ -n "$CC" ]; then arch="${CC/./}"; [ "${CC%%.*}" -ge 12 ] 2>/dev/null && arch="${arch}a"; row "$G" build arch "-DCMAKE_CUDA_ARCHITECTURES=$arch"; fi
  else
    row "$R" missing nvcc "no CUDA toolkit on PATH, in /usr/local/cuda* or /opt/cuda: install cuda-toolkit-12-8 or newer ($([ $WSL = 1 ] && echo "NVIDIA's WSL-Ubuntu repo, the toolkit only" || echo "NVIDIA's repo for this distro"))"
    blockers=$((blockers + 1))
  fi

  echo "${B}core${X}  ${D}(build, models, downloads)${X}"
  for t in git curl unzip gcc g++ make cmake ninja python3; do
    p=$(command -v "$t" 2>/dev/null)
    if [ -z "$p" ]; then
      case "$t" in gcc|g++|make) pkg=build-essential ;; ninja) pkg=ninja-build ;; *) pkg=$t ;; esac
      row "$R" missing "$t" "apt: $pkg"; core_missing+=("$pkg")
    elif [ "$t" = cmake ]; then
      v=$(cmake --version | head -1 | awk '{print $3}')
      if ver_ge "$v" 3.24; then row "$G" ok cmake "$v"; else row "$R" too-old cmake "$v, needs 3.24+"; core_missing+=(cmake); fi
    else
      row "$G" ok "$t" "$p"
    fi
  done
  if command -v python3 >/dev/null && python3 -c "import venv, ensurepip" 2>/dev/null; then row "$G" ok "python3 venv" "venv + ensurepip"
  else row "$R" missing "python3 venv" "apt: python3-venv (the converter and the downloader make venvs)"; core_missing+=(python3-venv); fi

  echo "${B}optional${X}  ${D}(only for the page and FLAC tests)${X}"
  if p=$(command -v node 2>/dev/null); then
    v=$(node --version | tr -d v)
    if ver_ge "$v" 22; then row "$G" ok node "$v"; else row "$Y" too-old node "$v, the page tests need 22+ (NodeSource or nvm)"; opt_missing+=("Node.js 22+"); fi
  else row "$Y" missing node "the page tests need Node.js 22+ (NodeSource or nvm; or set YUE2_NODE)"; opt_missing+=("Node.js 22+"); fi
  CH=$(find_tool google-chrome google-chrome-stable chromium chromium-browser)
  [ -n "$CH" ] && row "$G" ok Chrome "$CH" || { row "$Y" missing Chrome "google-chrome-stable from Google's apt repo, or Chromium (or set YUE2_CHROME)"; opt_missing+=(Chrome); }
  for t in flac metaflac ffmpeg; do
    if p=$(command -v "$t" 2>/dev/null); then row "$G" ok "$t" "$p"
    else row "$Y" missing "$t" "apt: $([ "$t" = metaflac ] && echo flac || echo "$t")"; opt_missing+=("$t"); fi
  done

  # fonts: what a browser on THIS machine (the headless test Chrome, or any local browser) can draw
  echo "${B}page fonts${X}  ${D}(rendering only: the build does not need them)${X}"
  if command -v fc-list >/dev/null; then
    for pair in "FF0B:＋ New song:fonts-noto-cjk" "2699:⚙ Engine:fonts-noto-core" "2197:↗ links:fonts-noto-core" "2715:✕ remove:fonts-noto-core" \
                "2605:★ favourites:fonts-noto-core" "2154:⅔ Blend note:fonts-noto-core" "25B6:▶ play:fonts-noto-core"; do
      IFS=: read -r cp what pkg <<< "$pair"
      fam=$(fc-list ":charset=$(echo "$cp" | tr 'A-F' 'a-f')" family 2>/dev/null | head -1)
      if [ -n "$fam" ]; then row "$G" ok "U+$cp" "$what: ${fam%%,*}"
      else row "$Y" missing "U+$cp" "$what: no font has it (apt: $pkg)"; font_missing+=("$pkg"); fi
    done
    # fontconfig's own family match (not "fc-list | grep -q": under pipefail grep's early exit can fail fc-list)
    if [ -n "$(fc-list 'Noto Color Emoji' family 2>/dev/null)" ]; then row "$G" ok emoji "Noto Color Emoji"
    else row "$Y" missing emoji "apt: fonts-noto-color-emoji"; font_missing+=(fonts-noto-color-emoji); fi
  else
    row "$Y" missing fc-list "apt: fontconfig (cannot check fonts)"; font_missing+=(fontconfig fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk)
  fi
fi

# ========================================================================= both
echo "${B}space${X}"
free_g=$(free_gib "$TARGET"); ram=$(ram_gib)
[ "$free_g" -ge 40 ] && row "$G" ok disk "$free_g GiB free at $TARGET (40 GB needed; the low-memory conversion needs about 7.5 GB more while it runs)" || { row "$R" low disk "$free_g GiB free at $TARGET, 40 GB needed"; blockers=$((blockers + 1)); }
[ "$ram" -ge 15 ] && row "$G" ok RAM "$ram GiB" || row "$Y" low RAM "$ram GiB: fine for the Q5_K_M copy with the small-memory settings (see the runbook)"

echo
if [ ${#path_add[@]} -gt 0 ]; then
  echo "${Y}on PATH${X}   installed but not on PATH; for this shell (never edit a global profile for it):"
  echo "          export PATH=\"$(uniq_words "${path_add[@]}" | tr ' ' ':'):\$PATH\""
fi
if [ ${#core_missing[@]} -gt 0 ]; then
  if [ "$OS" = Darwin ]; then echo "${R}core${X}      $(uniq_words "${core_missing[@]}" | sed 's/build-venv/python3 -m venv tmp\/build-venv \&\& tmp\/build-venv\/bin\/pip install cmake ninja/')"
  else echo "${R}core${X}      sudo apt install $(uniq_words "${core_missing[@]}")"; fi
  blockers=$((blockers + 1))
fi
if [ ${#opt_missing[@]} -gt 0 ]; then
  echo "${Y}tests${X}     missing for the optional tests: $(uniq_words "${opt_missing[@]}" | sed 's/ /, /g')"
fi
[ ${#font_missing[@]} -gt 0 ] && echo "${Y}fonts${X}     sudo apt install $(uniq_words "${font_missing[@]}")"
echo
echo "${B}stats${X}  $OS $ARCH, blockers $([ $blockers -gt 0 ] && echo "$R")$blockers${X}, core missing ${#core_missing[@]}, optional missing ${#opt_missing[@]}, font gaps ${#font_missing[@]}, not on PATH ${#path_add[@]}"
[ $blockers = 0 ]
