#!/usr/bin/env bash
# yue2.cpp: the C++ YuE2 server and its own browser page.
# Everything it needs lives in this folder: build/ (the engine: upstream plus the patches, compiled in build/build), models/, tmp/.
#
#   ./start.sh                      the backbone settings.json picks (else the first one present)
#   YUE2CPP_QUANT=Q8_0 ./start.sh   a given backbone copy, if present
#   YUE2CPP_PORT=41868 ./start.sh   another port
#   YUE2CPP_GPU=1 ./start.sh        another card than user/gpus.json gives the studio
#   YUE2CPP_BATCH=1 ./start.sh      one song per pass instead of 2 (a GPU with 12 GB or less)
#   YUE2CPP_DRY_RUN=1 ./start.sh    only print the server command it would run
#   YUE2CPP_FP16_MATMUL=0 ./start.sh   keep BF16 maths on an RTX 20 / Volta card (the matmul block below)
#
# Extra arguments go to yue-server (for example --keep-loaded).
set -euo pipefail

export CUDA_HOME="${RUACH_CUDA_HOME:-/usr/local/cuda-12.8}"   # HERESY 1259: the toolkit pinokio/env.sh found (Pinokio's own where the machine has none)
export PATH="$CUDA_HOME/bin:$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="$CUDA_HOME/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export TORCH_CUDA_ARCH_LIST="8.6"
export PYTHONUNBUFFERED=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HPY="$ROOT/.venv/bin/python"; [ -x "$HPY" ] || HPY=python3   # HERESY 1080: the studio's one environment
# HERESY 1091: the studio's card (Engine -> GPUs in the page writes user/gpus.json); YUE2CPP_GPU overrides; 0 by default
STUDIO_GPU="${YUE2CPP_GPU:-}"
if [ -z "$STUDIO_GPU" ] && [ -f "$ROOT/user/gpus.json" ]; then
    STUDIO_GPU=$("$HPY" -c 'import json, sys; print(int(json.load(open(sys.argv[1])).get("studio", 0)))' "$ROOT/user/gpus.json" 2>/dev/null || true)
fi
# HERESY 1109 (Viktor): no CUDA_VISIBLE_DEVICES. Most have one card, and who has more knows the kitchen. The engine
# computes on the first card by itself; another studio card (Engine -> GPUs, or YUE2CPP_GPU) is named to it as
# GGML_BACKEND=CUDAn (CUDA_DEVICE_ORDER=PCI_BUS_ID keeps n = nvidia-smi's number). Measured 02.10.2026: with every
# card visible the engine opens a context of 256 MiB on each card as it lists them (the page asks for that list).
# HERESY 1112, 1113: the guard: the studio's card only with no heavy stranger on it (a service above 2 GiB, a vLLM's
# kind; the desktop's small ones are fine) and 8 GB free for the weights and their cache; else the freest card that
# passes; none passes: the saved card, said loudly (the engine may run out of memory)
GUARD_SAY=""
if [ -z "${YUE2CPP_GPU:-}" ] && command -v nvidia-smi >/dev/null 2>&1; then
    PICK=$("$HPY" "$ROOT/lab/gpu_guard.py" --pick "${STUDIO_GPU:-0}" 8000 2>"$ROOT/tmp/.gpu_guard.say" || true)
    GUARD_SAY=$(cat "$ROOT/tmp/.gpu_guard.say" 2>/dev/null || true)
    if [ -n "$PICK" ] && [ "$PICK" != "${STUDIO_GPU:-0}" ]; then GUARD_SAY="GPU${STUDIO_GPU:-0} did not pass the guard; GPU$PICK instead · $GUARD_SAY"; STUDIO_GPU="$PICK"
    elif [ -z "$PICK" ]; then GUARD_SAY="no card passes the guard; GPU${STUDIO_GPU:-0} all the same, it may run out of memory · $GUARD_SAY"
    else GUARD_SAY=""; fi
fi
if [ -n "$STUDIO_GPU" ] && [ "$STUDIO_GPU" != 0 ] && [ -z "${GGML_BACKEND:-}" ]; then export GGML_BACKEND="CUDA$STUDIO_GPU"; fi
export TMPDIR="$ROOT/tmp"

G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m' C=$'\e[36m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe), like the server's log
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X="" C=""; fi

PORT="${YUE2CPP_PORT:-41867}"
# songs the server renders together in one pass (YUE2CPP_BATCH): 1 on a small GPU
BATCH="${YUE2CPP_BATCH:-2}"
# The backbone: YUE2CPP_QUANT, else the one settings.json picks (the page saves it there), else the
# first copy present. Resolved before any file is required, so a Q5_K_M-only install starts.
QUANT="${YUE2CPP_QUANT:-}"
if [ -z "$QUANT" ] && [ -f "$ROOT/settings.json" ]; then
    QUANT=$("$HPY" -c 'import json, sys; print(json.load(open(sys.argv[1])).get("model") or "")' "$ROOT/settings.json" 2>/dev/null || true)
fi
if [ -z "$QUANT" ] || [ ! -f "$ROOT/models/YuE2-3B-$QUANT.gguf" ]; then
    wanted="$QUANT"; QUANT=""
    for q in BF16 Q8_0 Q6_K Q5_K_M; do [ -f "$ROOT/models/YuE2-3B-$q.gguf" ] && { QUANT="$q"; break; }; done
    [ -n "$wanted" ] && [ -n "$QUANT" ] && echo "${Y}no models/YuE2-3B-$wanted.gguf${X}: using $QUANT"
    [ -n "$QUANT" ] || QUANT="${wanted:-BF16}"      # nothing present: the check below names what is missing
fi
BIN="$ROOT/build/build/yue-server"
MODEL="$ROOT/models/YuE2-3B-$QUANT.gguf"
VAE="$ROOT/models/YuE2-Vae-F32.gguf"
SLIDERS="$ROOT/sliders"
OUTPUTS="$ROOT/outputs"
TRANSCRIBER="$ROOT/models/SheetSage2-Q8_0.gguf"     # downloaded; convert-models.sh makes F32
[ -f "$TRANSCRIBER" ] || TRANSCRIBER="$ROOT/models/SheetSage2-F32.gguf"

missing=0
for f in "$BIN" "$MODEL" "$VAE"; do
    if [ ! -f "$f" ]; then
        echo "${R}missing${X} ${f#"$ROOT"/}"
        missing=1
    fi
done
if [ "$missing" = 1 ]; then
    echo "${D}build: the cmake line in LOCAL-CHANGES.md (or the install kit); models: tools/download-checkpoints.sh then ./convert-models.sh, or ./download-models.sh${X}"
    exit 1
fi

size() { du -h "$1" 2>/dev/null | cut -f1 | tr -d ' '; }
count() { wc -l | tr -d ' '; }          # macOS pads wc's number with spaces
plural() { if [ "$1" = 1 ]; then printf '%s %s' "$1" "$2"; else printf '%s %ss' "$1" "$2"; fi; }   # plural 2 song -> 2 songs
row() { printf '  %s%-12s%s %s\n' "$C" "$1" "$X" "$2"; }
args=(--host 0.0.0.0 --port "$PORT" --model "$QUANT=$MODEL" --vae "standard=$VAE" --outputs "$OUTPUTS"
      --max-batch "$BATCH" --settings "$ROOT/settings.json")
# every other backbone that is present can be picked in the page (Engine -> Model)
models="${B}$QUANT${X} $(size "$MODEL") ${G}starts${X}"
for q in BF16 Q8_0 Q6_K Q5_K_M; do
    if [ "$q" != "$QUANT" ] && [ -f "$ROOT/models/YuE2-3B-$q.gguf" ]; then
        args+=(--model "$q=$ROOT/models/YuE2-3B-$q.gguf")
        models="$models, ${B}$q${X} $(size "$ROOT/models/YuE2-3B-$q.gguf")"
    fi
done
vaes="${B}standard${X}"
for extra in legacy blend; do
    if [ -f "$ROOT/models/YuE2-Vae-$extra-F32.gguf" ]; then
        args+=(--vae "$extra=$ROOT/models/YuE2-Vae-$extra-F32.gguf")
        vaes="$vaes, ${B}$extra${X}"
    fi
done

# The GPU: one query for its name, memory and compute capability (NVIDIA), else what runs instead.
# Older NVIDIA cards (compute capability 7.x: RTX 20, Volta) have FP16 but no BF16 tensor cores, so BF16
# prefills and the sound stage fall back to their FP32 cores. --fp16-matmul runs those on the FP16 tensor
# cores (measured on an RTX 2070 laptop: sound stage 9.25 -> 3.4 s per step, a song 440 -> 215 s). Newer
# cards have BF16 tensor cores and older ones none, so it stays off there. YUE2CPP_FP16_MATMUL=0 keeps
# it off, =1 forces it on.
CC="" GPU_NAME="" GPU_USED="" GPU_TOTAL=""
SMI="$(command -v nvidia-smi 2>/dev/null || true)"
if [ -z "$SMI" ] && [ -x /usr/lib/wsl/lib/nvidia-smi ]; then SMI=/usr/lib/wsl/lib/nvidia-smi; fi
if [ -n "$SMI" ]; then
    IFS=, read -r GPU_NAME GPU_USED GPU_TOTAL CC <<EOF
$("$SMI" -i "${STUDIO_GPU:-0}" --query-gpu=name,memory.used,memory.total,compute_cap --format=csv,noheader,nounits 2>/dev/null | head -1 || true)
EOF
    CC="$(printf '%s' "$CC" | tr -d ' ')"
fi
ON_GPU=1
if [ "${CUDA_VISIBLE_DEVICES-all}" = "" ]; then ON_GPU=0; fi
case "${GGML_BACKEND:-}" in CPU*) ON_GPU=0 ;; esac
FP16_MATMUL="${YUE2CPP_FP16_MATMUL:-auto}"
why="forced by YUE2CPP_FP16_MATMUL=1"
if [ "$FP16_MATMUL" = auto ]; then
    FP16_MATMUL=0
    why="compute $CC has no BF16 tensor cores; YUE2CPP_FP16_MATMUL=0 turns it off"
    case "$ON_GPU/$CC" in 1/7.*) FP16_MATMUL=1 ;; esac
fi
[ "$FP16_MATMUL" = 1 ] && args+=(--fp16-matmul)

# The page's address as a terminal hyperlink (OSC 8) when printing to a terminal: clickable even where
# the terminal does not spot links itself. Terminals without OSC 8 show the plain address; so do logs.
# HERESY 1133: the address this machine has on its network (the first one), or 127.0.0.1 without one
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
URL="http://${LAN_IP:-127.0.0.1}:$PORT"
TTY=0; [ -t 1 ] && TTY=1      # tested here: inside $(...) stdout is a pipe
link() { if [ "$TTY" = 1 ]; then printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$1"; else printf '%s' "$1"; fi; }
echo "${B}Ruach Studio $(cat "$ROOT/VERSION" 2>/dev/null || echo "?")${X} · $(basename "$ROOT")  ${G}$(link "$URL")${X}"   # HERESY 1136
[ -n "$GUARD_SAY" ] && echo "${Y}guard${X} $GUARD_SAY"
if [ -n "$GPU_NAME" ] && [ "$ON_GPU" = 1 ]; then
    row gpu "${B}$(printf '%s' "$GPU_NAME" | sed 's/^ *//')${X} ${D}·${X} $(awk -v u="$GPU_USED" -v t="$GPU_TOTAL" 'BEGIN { printf "%.1f of %.1f GiB in use", u / 1024, t / 1024 }') ${D}· compute $CC${X}"
elif [ -n "$GPU_NAME" ]; then
    row gpu "${Y}hidden${X}: this run uses the CPU ${D}(GGML_BACKEND=CPU or an empty CUDA_VISIBLE_DEVICES)${X}"
elif [ "$(uname -s)" = Darwin ]; then
    row gpu "Apple GPU (Metal) ${D}· memory shared with macOS${X}"
else
    row gpu "${Y}no NVIDIA GPU found${X}: runs on the CPU ${D}(slow)${X}"
fi
if [ "$FP16_MATMUL" = 1 ]; then
    row matmul "${G}FP16 tensor cores${X} ${D}($why)${X}"
fi
row backbones "$models  ${D}(the Engine page picks; settings.json remembers)${X}"
row vaes "$vaes"
LORAS="$ROOT/loras"
if [ -d "$LORAS" ]; then
    args+=(--loras "$LORAS")
    row loras "${B}$(find -L "$LORAS" -name '*.safetensors' -not -path '*/.*' 2>/dev/null | count)${X} files in ${B}$(find -L "$LORAS" -mindepth 1 -maxdepth 1 -type d -not -name '.*' 2>/dev/null | count)${X} folders ${D}· $(du -shL "$LORAS" 2>/dev/null | cut -f1 | tr -d ' ') · loras/: files, folders or links${X}"
fi
if [ -f "$SLIDERS/catalog.json" ]; then
    args+=(--sliders "$SLIDERS")
    row sliders "${B}$(ls "$SLIDERS"/*.gguf 2>/dev/null | count)${X} voice/genre sliders"
else
    row sliders "${Y}not converted${X} ${D}(./convert-models.sh)${X}"
fi
nsongs=$(find "$OUTPUTS" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | count)
row library "${B}$nsongs${X} $([ "$nsongs" = 1 ] && echo song || echo songs) ${D}· $(du -sh "$OUTPUTS" 2>/dev/null | cut -f1 | tr -d ' ') in ${OUTPUTS#"$ROOT"/}/${X}"
if [ -f "$TRANSCRIBER" ]; then
    args+=(--transcriber "$TRANSCRIBER")
    row transcriber "$(basename "$TRANSCRIBER") ${D}· $(size "$TRANSCRIBER") · covers from a recording${X}"
else
    row transcriber "${Y}not downloaded${X} ${D}(covers from a recording are off)${X}"
fi
if [ -f "$ROOT/settings.json" ]; then
    engine=$("$HPY" -c '
import json, sys
s = json.load(open(sys.argv[1]))
seq = s.get("max_seq") or 0
print("models " + ("kept loaded" if s.get("keep_loaded") else "unloaded after each song"),
      "context " + ("whole" if not seq else f"{seq:,}"), "VAE tiles " + str(s.get("vae_core", 512)), sep=" · ")' "$ROOT/settings.json" 2>/dev/null || true)
    row engine "${engine:-${Y}settings.json unreadable${X}} ${D}· up to $(plural "$BATCH" song) per pass${X}"
else
    row engine "defaults ${D}(no settings.json yet: the Engine page saves one) · up to $(plural "$BATCH" song) per pass${X}"
fi
echo "  ${D}Ctrl-C to stop · NO_COLOR=1 for a plain log${X}"

cd "$ROOT"
# HERESY 1130: the server reads the page from disk at every load; built here when it is missing or older than its sources
export RUACH_PAGE="$ROOT/build/tools/public/index.html"
if [ ! -s "$RUACH_PAGE" ] || [ -n "$(find "$ROOT/build/tools/console" "$ROOT/heresy/examples" -type f -newer "$RUACH_PAGE" 2>/dev/null | head -1)" ]; then
  NO_COLOR=1 "$ROOT/build.sh" --no-restart >/dev/null 2>&1 || echo "the page could not be built: ./build.sh says why" >&2
fi
if [ -n "${YUE2CPP_DRY_RUN:-}" ]; then
    printf '%q ' "$BIN" "${args[@]}" "$@"; echo
    exit 0
fi
exec "$BIN" "${args[@]}" "$@"
