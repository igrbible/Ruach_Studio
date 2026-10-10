#!/bin/bash
# HERESY · fetch-heresy.sh — every weight and clone Ruach Studio needs beyond the Kit's download-models.sh.
#
#   heresy/fetch-heresy.sh --check     say what is here and what is missing, download nothing
#   heresy/fetch-heresy.sh             fetch what is missing; what is here stays as it is
#   heresy/fetch-heresy.sh --replace   also fetch the pinned copy over one that is here but differs
#   heresy/fetch-heresy.sh --listener Q8_0|Q5_K_M|Q4_K_M|bf16 [--yes]
#                                      also the style listener (Qwen2.5-Omni-7B), asked first with its size;
#                                      GGUF ones run through llama.cpp (vendor/llama.cpp, cloned here, built by you)
#   heresy/fetch-heresy.sh --artwork [--artwork-q8] [--yes]
#                                      also the artwork's models (HERESY 1120, 1167), asked first with their size: the
#                                      painter by the cards: Krea 2 Muse by Stable Yogi at Q4 (--artwork-q8: Q8 too) with
#                                      Krea 2's text encoder, VAE and the content filter where a card has 16 GB, else SDXL
#                                      (CyberRealistic XL v10); both from our models repo; the prompt writer (Qwen3-4B)
#   heresy/fetch-heresy.sh --trainer bf16|int8 [--yes]
#                                      also the base for the studio's own LoRA trainer (lab/trainer), asked first
#                                      with its size; bf16 trains on unquantized weights, int8 on a smaller card
#   heresy/fetch-heresy.sh --backbone BF16|Q8_0|Q6_K|Q5_K_M [--yes]
#                                      also another YuE2 backbone beside the one the install took for the card, asked
#                                      first with its size (HERESY 1285: BF16 where a 16 GB card took Q8_0)
#   heresy/fetch-heresy.sh --only extras,whisper,stems,upscale,loras
#                                      HERESY 1289: those parts of what the install brings, the others left alone; with
#                                      none, only what the options above ask for (the Engine's Models card fetches so)
#
# The LoRAs come too: the Kit's library (tools/download-loras.sh, 11 adapters from 8 repos) and the studio's own
# (heresy/fetch-ruach-loras.py: six voices, the duduk and the shofar), under the names the 💎 sets' takes use.
#
# Hugging Face repos come at the revisions in heresy/hf-revisions.txt (the Kit's tools/hf-revisions.txt
# for those it pins too), through the Kit's own pinned downloader (tools/hf-env.sh, in .venv), and
# count as here only when every file has the pinned revision's size (tools/hf_expect.py): a downloader
# that says "done" is not proof, and neither is one file being there.
# The legacy and blend decoders and the sliders come converted, from goldhub/Ruach_Studio_Models_v2 (HERESY 1290): no checkpoints.
# Needs: python3, git, the lab venv for audio-separator (lab/install-venv.sh), ~8 GB of disk.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=fetch; LISTENER=""; TRAINER=""; ARTWORK=0; ARTQ8=0; YES=0; BACKBONE=""; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;; --replace) MODE=replace ;; --yes) YES=1 ;;
    --listener) LISTENER="${2:-}"; shift ;;
    --trainer) TRAINER="${2:-}"; shift ;;
    --backbone) BACKBONE="${2:-}"; shift ;;
    --only) ONLY=",${2:-},"; shift ;;
    --artwork) ARTWORK=1 ;;
    --artwork-q8) ARTWORK=1; ARTQ8=1 ;;
    *) echo "--check, --replace, --listener Q8_0|Q5_K_M|Q4_K_M|bf16, --trainer bf16|int8, --backbone BF16|Q8_0|Q6_K|Q5_K_M, --artwork, --artwork-q8, --only extras,whisper,stems,upscale,loras|none, --yes"; exit 2 ;;
  esac
  shift
done
SEP="$ROOT/.venv/bin/audio-separator"
PINS="$ROOT/heresy/hf-revisions.txt"
G=$'\e[1;32m' Y=$'\e[1;33m' R=$'\e[1;31m' D=$'\e[2m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" X=""; fi
have=0; odd=0; got=0; miss=0; failed=0; unknown=0

say_here() { echo "${G}here${X}      $1 ${D}$2${X}"; have=$((have+1)); note here "$1" "$2"; }
say_odd()  { echo "${Y}differs${X}   $1 ${D}$2${X}"; odd=$((odd+1)); note differs "$1" "$2"; }
say_miss() { echo "${Y}missing${X}   $1 ${D}$2${X}"; miss=$((miss+1)); note missing "$1" "$2"; }
say_got()  { echo "${G}fetched${X}   $1 ${D}$2${X}"; got=$((got+1)); note fetched "$1" "$2"; }
say_unknown() { echo "${Y}unknown${X}   $1 ${D}$2${X}"; unknown=$((unknown+1)); note unknown "$1" "$2"; }
say_fail() { echo "${R}failed${X}    $1 ${D}$2${X}"; failed=$((failed+1)); note failed "$1" "$2"; }

# HERESY 1285 (Viktor 09.10.2026, his first install through Pinokio: «Некоторые вещи не скачались. Смотри в логе»): a download
# that fails says why (the downloader's last words, not only «failed»), and is tried once more after half a minute: a burst of
# requests earns a 429 from Hugging Face, and on his laptop every repo after the sliders' thousand files failed at once
mkdir -p "$ROOT/tmp"; LOG="$ROOT/tmp/fetch-heresy.last.log"

# HERESY 1289 (Viktor 10.10.2026: «И нужно в Engine добавить докачку моделей и LoRA»): each part of what the install brings says
# its name for --only; a whole run (an install's too) keeps its verdicts in tmp/fetch-heresy.list, a line each (the verdict, what,
# its words, tab-separated; a part's line starts with ##), put in place only when the run is over: the Engine's Models card shows
# the last whole run at once, asking no one, and fetches a part at a time
want() { [ -z "$ONLY" ] || [[ "$ONLY" == *",$1,"* ]]; }
LIST=""; [ -z "$ONLY" ] && LIST="$ROOT/tmp/fetch-heresy.list.part" && : >"$LIST"
note() { [ -n "$LIST" ] && printf '%s\t%s\t%s\n' "$1" "$2" "$3" >>"$LIST"; return 0; }
part() { echo; echo "$2 ${D}(--only $1)${X}"; note "##" "$1" "$2"; }    # a part of what the install brings
asked() { echo; echo "$2"; note "##" "$1" "$2"; }                         # what an option asks for
why() { grep -av "^[[:space:]]*$" "$LOG" 2>/dev/null | grep -aviE "it/s|%\||Fetching [0-9]+ files|Download complete|Moving file|Downloading" | tail -2 | tr '\n' ' ' | cut -c1-260; }
again() {   # again CMD…: run into $LOG; once more after 30 s when it fails
  "$@" >"$LOG" 2>&1 && return 0
  echo "${D}          failed once ($(why)); once more in 30 s${X}"
  sleep 30
  "$@" >"$LOG" 2>&1
}

# the Kit's machinery: pinned downloader, caches in tmp/, hf_complete (sizes against the pinned list)
# --check downloads no weights; it may cache a pinned revision's file list in tmp/hf/expect (a few KB)
# shellcheck source=../tools/hf-env.sh
source "$ROOT/tools/hf-env.sh"
pin() {   # ours first, then the Kit's; "main" when neither pins it (said aloud below)
  local r=""; [ -f "$PINS" ] && r=$(awk -v k="$1" '$1 == k {print $2; exit}' "$PINS")
  [ -n "$r" ] && { echo "$r"; return; }
  hf_rev "$1"
}

# --- a Hugging Face repo into a folder:  hf_repo REPO DIR [hf_expect options]
hf_repo() {
  local repo=$1 dir=$2; shift 2
  local rev; rev=$(pin "$repo")
  local tag="($repo @ ${rev:0:7})"; [ "$rev" = main ] && tag="($repo @ main: not pinned)"
  local state=missing rc
  if [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    hf_complete "$repo" "$rev" "$dir" "$@" >/dev/null 2>&1; rc=$?
    # 0 complete · 1 something differs · 2 the expected list could not be read (offline): not a verdict
    case $rc in 0) state=here ;; 1) state=differs ;; *) state=unknown ;; esac
    # HERESY 1285: a folder our own download began at this very revision is unfinished, not someone's other copy: it goes on
    # (the downloader keeps each file's revision under .cache/huggingface/download)
    [ "$state" = differs ] && grep -rqs -- "$rev" "$dir/.cache/huggingface/download" && state=partial
  fi
  case "$state:$MODE" in
    here:*)        say_here "$dir" "$tag"; return ;;
    unknown:*)     say_unknown "$dir" "$tag — the pinned file list could not be read (offline?); kept"; return ;;
    differs:check|differs:fetch) say_odd "$dir" "$tag — kept; not the pinned copy (--replace fetches it)"; return ;;
    missing:check) say_miss "$dir" "$tag"; return ;;
    partial:check) say_miss "$dir" "$tag — unfinished: a fetch goes on from there"; return ;;
  esac
  hf_ready >/dev/null || { say_fail "$dir" "(the pinned downloader would not install: tools/hf-env.sh)"; return; }
  if [ "$state" = differs ]; then          # --replace: the old copy steps aside whole, nothing of it mixes in
    local aside="$ROOT/tmp/replaced/$(basename "$dir").$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$ROOT/tmp/replaced" && mv "$dir" "$aside" && echo "${D}          the old copy → ${aside#"$ROOT"/} (delete it when the new one works)${X}"
  fi
  mkdir -p "$dir"
  again "$HF" download --quiet "$repo" --revision "$rev" --local-dir "$dir" "$@"
  if hf_complete "$repo" "$rev" "$dir" "$@" >/dev/null 2>&1; then say_got "$dir" "$tag"; else say_fail "$dir" "$tag: $(why)"; fi
}

# --- files of a repo laid out as the studio's own folders, straight into place:  hf_into WHAT REPO INCLUDE…
# HERESY 1290: what is missing comes (the downloader keeps a file that matches the pin, by its SHA-256); a file here that differs
# from the pin is kept, as hf_repo keeps a folder (--replace sets it aside into tmp/replaced/ and fetches the pinned one)
hf_into() {
  local what=$1 repo=$2 rev out rc wrong; shift 2; rev=$(pin "$repo")   # wrong, not odd: say_odd counts in the global odd
  local tag="($repo @ ${rev:0:7})"; [ "$rev" = main ] && tag="($repo @ main: not pinned)"
  out=$(hf_complete "$repo" "$rev" "$ROOT" --include "$@" 2>&1); rc=$?
  case $rc in
    0) say_here "$what" "$tag"; return ;;
    2) say_unknown "$what" "$tag — the pinned file list could not be read (offline?)"; return ;;
  esac
  wrong=$(printf '%s\n' "$out" | sed -n 's/^[[:space:]]*\(.*\): [0-9]* bytes, expected [0-9]* (incomplete or wrong)$/\1/p')
  if [ $MODE = check ]; then say_miss "$what" "$tag: $(printf '%s\n' "$out" | head -1 | sed 's/^[^:]*: //')"; return; fi
  if [ -n "$wrong" ] && [ $MODE != replace ]; then
    say_odd "$what" "$tag — kept: $(printf '%s\n' "$wrong" | wc -l | tr -d ' ') here differ from the pin, the first $(printf '%s\n' "$wrong" | head -1) (--replace fetches them)"
    return
  fi
  if [ -n "$wrong" ]; then
    local aside="$ROOT/tmp/replaced/$(date +%Y%m%d-%H%M%S)" f
    while IFS= read -r f; do mkdir -p "$aside/$(dirname "$f")" && mv "$ROOT/$f" "$aside/$f"; done <<< "$wrong"
    echo "${D}          the old copies → ${aside#"$ROOT"/} (delete them when the new ones work)${X}"
  fi
  hf_ready >/dev/null || { say_fail "$what" "(the pinned downloader would not install: tools/hf-env.sh)"; return; }
  again "$HF" download --quiet "$repo" --revision "$rev" --local-dir "$ROOT" --include "$@"
  if hf_complete "$repo" "$rev" "$ROOT" --include "$@" >/dev/null 2>&1; then say_got "$what" "$tag"; else say_fail "$what" "$tag: $(why)"; fi
}

# --- a repo kept in a Hugging Face cache (as the lab's code loads it):  hf_cached REPO HF_HOME
hf_cached() {
  local repo=$1 home=$2 rev; shift 2; rev=$(pin "$repo")
  local snap="$home/hub/models--${repo//\//--}/snapshots/$rev" tag="($repo @ ${rev:0:7}, cache)"
  local rc=1
  if [ -d "$snap" ]; then hf_complete "$repo" "$rev" "$snap" "$@" >/dev/null 2>&1; rc=$?; fi
  [ $rc = 0 ] && { say_here "$repo" "$tag"; return; }
  [ $rc = 2 ] && { say_unknown "$repo" "$tag — the pinned file list could not be read (offline?)"; return; }
  if [ $MODE = check ]; then
    if ls -d "$home"/hub/models--${repo//\//--}/snapshots/* >/dev/null 2>&1; then say_odd "$repo" "$tag — another revision is cached"; else say_miss "$repo" "$tag"; fi
    return
  fi
  hf_ready >/dev/null || { say_fail "$repo" "(the pinned downloader would not install)"; return; }
  again env HF_HOME="$home" HF_HUB_CACHE="$home/hub" "$HF" download --quiet "$repo" --revision "$rev" "$@"
  if [ -d "$snap" ] && hf_complete "$repo" "$rev" "$snap" "$@" >/dev/null 2>&1; then say_got "$repo" "$tag"; else say_fail "$repo" "$tag: $(why)"; fi
}

# --- a separation model through audio-separator (it keeps its own list; no Hugging Face pin):
#     sep_model FILE DIR FILE…  (every file named must be there and not empty)
sep_model() {
  local model=$1 dir=$2; shift 2
  local f ok=1; for f in "$@"; do [ -s "$dir/$f" ] || ok=0; done
  if [ $ok = 1 ]; then say_here "$dir" "(audio-separator: $model)"; return; fi
  if [ $MODE = check ]; then say_miss "$dir" "(audio-separator: $model)"; return; fi
  [ -x "$SEP" ] || { say_fail "$model" "(no audio-separator: lab/install-venv.sh)"; return; }
  mkdir -p "$dir"
  again "$SEP" --download_model_only -m "$model" --model_file_dir "$dir"
  ok=1; for f in "$@"; do [ -s "$dir/$f" ] || ok=0; done
  if [ $ok = 1 ]; then say_got "$dir" "(audio-separator: $model)"; else say_fail "$model" "→ $dir: $(why)"; fi
}

# --- a git clone:  clone URL DIR
clone() {
  local url=$1 dir=$2
  if [ -d "$dir/.git" ]; then say_here "$dir" "(git $(git -C "$dir" log -1 --format=%h 2>/dev/null))"; return; fi
  if [ $MODE = check ]; then say_miss "$dir" "($url)"; return; fi
  if git clone -q --depth 1 "$url" "$dir"; then say_got "$dir" "($url)"; else say_fail "$dir" "($url)"; fi
}

echo "${D}Ruach Studio · $ROOT · $MODE${X}"

# only the files that work are judged (a README that moved on is no reason to download 0.5 GB again)
WORK=(--include "*.safetensors" "*.bin" "*.json" "*.yaml" "*.py" "*.txt")

# HERESY 1290 (Viktor 10.10.2026: «зачем нам конвертировать модели каждый раз? Может в репо положим сконвертированные и пропишем их
# в коде вместо тех, что ты конвертируешь каждый раз у юзера?»; «в этот goldhub/Ruach_Studio_Models_v2 у нас идёт только продакшн»):
# the legacy and blend decoders and the 16 sliders come converted, from our models repo v2 at its pin, straight into models/ and
# sliders/ where the engine reads them (1.3 GB, converted once: byte for byte what convert-extras.py makes from the pinned
# checkpoints, which no install fetches any more; convert-models.sh stays for whoever wants to make them on their own machine)
if want extras; then
  part extras "The extra decoders and the sliders, converted once (goldhub/Ruach_Studio_Models_v2)"
  hf_into "legacy and blend decoders, 16 sliders (models/, sliders/)" goldhub/Ruach_Studio_Models_v2 \
          "models/YuE2-Vae-legacy-F32.gguf" "models/YuE2-Vae-blend-F32.gguf" "sliders/*"
fi

if want whisper; then
  part whisper "Whisper large-v3 (CTranslate2, float16): lyrics check, karaoke timing, trim to the text"
  hf_repo Systran/faster-whisper-large-v3 "$ROOT/whisper/whisper-large-v3-ct2-float16" "${WORK[@]}"
fi

if want stems; then
  part stems "Stems"
  sep_model model_bs_roformer_ep_317_sdr_12.9755.ckpt "$ROOT/separation/roformer" \
            model_bs_roformer_ep_317_sdr_12.9755.ckpt model_bs_roformer_ep_317_sdr_12.9755.yaml
  sep_model htdemucs_ft.yaml "$ROOT/separation/demucs" htdemucs_ft.yaml \
            f7e0c4bc-ba3fe64a.th d12395a8-e57c48e6.th 92cfc3b6-ef3bcb9c.th 04573f0d-f3cf25b2.th
fi

if want upscale; then
  part upscale "Upscale: UniverSR"
  hf_cached woongzip1/universr-audio "$ROOT/hf_cache" "${WORK[@]}"
  clone https://github.com/woongzip1/UniverSR.git "$ROOT/vendor/UniverSR"
fi

# HERESY 1079: the style listener, only when asked for, and asked again with its size: a download of 7 to 22 GB
# is never a surprise (Viktor: a user may be on a metered link). Peaks measured 02.10.2026 on a 120 s excerpt.
if [ -n "$LISTENER" ]; then
  asked listener "The style listener: Qwen2.5-Omni-7B ($LISTENER)"
  # HERESY 1077b: every GGUF with mradermacher's Q8_0 audio projector (1.5 GB): the ladder measured 02.10.2026
  # heard the same tags from Q8_0 down to Q4_K_M with it as with the f16 one (2.6 GB), a GB less and twice as fast
  OMNI="$ROOT/checkpoints/Qwen2.5-Omni-7B-GGUF"      # (not G: that one is the green of the output)
  P_REPO=mradermacher/Qwen2.5-Omni-7B-GGUF; P_DIR="$OMNI/mradermacher"; P_INC=(--include "Qwen2.5-Omni-7B.mmproj-Q8_0.gguf")
  case "$LISTENER" in
    Q8_0)   SIZE="9.6 GB (Q8_0 8.1 + its audio projector Q8_0 1.5)"; PEAK="10.3 GB of VRAM"
            L_REPO=ggml-org/Qwen2.5-Omni-7B-GGUF; L_DIR="$OMNI"; L_INC=(--include "Qwen2.5-Omni-7B-Q8_0.gguf") ;;
    Q5_K_M) SIZE="6.9 GB (Q5_K_M 5.4 + its audio projector Q8_0 1.5)"; PEAK="8.0 GB of VRAM"
            L_REPO=unsloth/Qwen2.5-Omni-7B-GGUF; L_DIR="$OMNI/unsloth"; L_INC=(--include "Qwen2.5-Omni-7B-Q5_K_M.gguf") ;;
    Q4_K_M) SIZE="6.2 GB (Q4_K_M 4.7 + its audio projector Q8_0 1.5)"; PEAK="7.3 GB of VRAM"
            L_REPO=ggml-org/Qwen2.5-Omni-7B-GGUF; L_DIR="$OMNI"; L_INC=(--include "Qwen2.5-Omni-7B-Q4_K_M.gguf") ;;
    bf16)   SIZE="22 GB (the whole model; the studio loads its thinker only)"; PEAK="18.3 GB of VRAM: a 24 GB card"
            L_REPO=Qwen/Qwen2.5-Omni-7B; L_DIR="$ROOT/checkpoints/Qwen2.5-Omni-7B"; L_INC=("${WORK[@]}"); P_REPO="" ;;
    *) echo "${R}--listener takes Q8_0, Q5_K_M, Q4_K_M or bf16${X}"; exit 2 ;;
  esac
  have_all() {
    hf_complete "$L_REPO" "$(pin "$L_REPO")" "$L_DIR" "${L_INC[@]}" >/dev/null 2>&1 &&
      { [ -z "$P_REPO" ] || hf_complete "$P_REPO" "$(pin "$P_REPO")" "$P_DIR" "${P_INC[@]}" >/dev/null 2>&1; }
  }
  go=1
  if [ $MODE != check ] && [ $YES = 0 ] && ! have_all; then
    printf "%s" "Download $SIZE? It needs $PEAK when it listens. [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  if [ $go = 1 ]; then
    hf_repo "$L_REPO" "$L_DIR" "${L_INC[@]}"
    [ -n "$P_REPO" ] && hf_repo "$P_REPO" "$P_DIR" "${P_INC[@]}"
  fi
  if [ "$LISTENER" != bf16 ]; then
    clone https://github.com/ggml-org/llama.cpp.git "$ROOT/vendor/llama.cpp"
    if [ -x "$ROOT/vendor/llama.cpp/build/bin/llama-mtmd-cli" ]; then say_here "llama-mtmd-cli" "(vendor/llama.cpp/build)"
    else say_miss "llama-mtmd-cli" "→ cd vendor/llama.cpp && cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER=\$(which nvcc) && cmake --build build -j --target llama-mtmd-cli"; fi
  fi
fi

# HERESY 1120: artwork for takes, only when asked for, and asked again with its size. The painter is CyberRealistic
# XL v10 (an SDXL finetune by Cyberdelia, CreativeML Open RAIL++-M), converted to diffusers fp16 and kept in our models
# repo (its author publishes it on Civitai only); the prompt writer is Qwen3-4B-Instruct-2507 from Qwen itself.
# HERESY 1167 (Viktor 05.10.2026, after the A/B on twelve instruments: «Muse - отличный файнтюн»; «Для карт ниже 24GB VRAM…
# оставим SDXL»): where a card has 16 GB, Krea 2 Muse by Stable Yogi (the author's GGUF, Q4; Q8 when asked) with Krea 2's
# text encoder, VAE and configs, all from our models repo (Krea 2 Community License: its LICENSE and NOTICE come along),
# and the content filter the licence asks for (Falconsai/nsfw_image_detection, Apache-2.0); SDXL below, as before.
if [ $ARTWORK = 1 ]; then
  BIG=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -1); BIG=${BIG:-0}
  if [ "$BIG" -ge 16000 ] 2>/dev/null; then
    asked artwork "Artwork: Krea 2 Muse (a card of ${BIG} MB here), its text encoder and VAE, the content filter, the prompt writer"
    K_MUSE="$ROOT/artwork/Krea-2-Muse"; K_TURBO="$ROOT/artwork/Krea-2-Turbo"
    K_WANT=("artwork/Krea-2-Muse/museByStableYogi_v35Q4Extended.gguf")
    [ $ARTQ8 = 1 ] && K_WANT+=("artwork/Krea-2-Muse/museByStableYogi_v35Q8Extended.gguf")
    k_here() { local f; for f in "${K_WANT[@]}"; do [ -s "$ROOT/$f" ] || return 1; done
               [ -s "$K_TURBO/text_encoder/model.safetensors" ] && [ -s "$K_TURBO/vae/diffusion_pytorch_model.safetensors" ]; }
    go=1
    if [ $MODE != check ] && [ $YES = 0 ] && ! { k_here && [ -s "$ROOT/artwork/Qwen3-4B-Instruct-2507/config.json" ]; }; then
      printf "%s" "Download $([ $ARTQ8 = 1 ] && echo 41 || echo 26) GB (Krea 2 Muse Q4 8.3$([ $ARTQ8 = 1 ] && echo ", Q8 14.6"), its encoder and VAE 9.4, the filter 0.3, the prompt writer 7.6)? [y/N] "
      read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
    fi
    if [ $go = 1 ]; then
      if k_here; then say_here "$K_MUSE" "(goldhub/Ruach_Studio_Models)"
      elif [ $MODE = check ]; then say_miss "$K_MUSE" "(goldhub/Ruach_Studio_Models)"
      else
        hf_ready >/dev/null || { say_fail "$K_MUSE" "(the pinned downloader would not install: tools/hf-env.sh)"; }
        again "$HF" download --quiet goldhub/Ruach_Studio_Models --include "${K_WANT[@]}" "artwork/Krea-2-Muse/NOTICE.txt" \
              "artwork/Krea-2-Muse/LICENSE.pdf" "artwork/Krea-2-Turbo/*" --local-dir "$ROOT"
        if k_here; then say_got "$K_MUSE" "(goldhub/Ruach_Studio_Models; Krea 2 Community License: LICENSE.pdf, NOTICE.txt)"
        else say_fail "$K_MUSE" "(goldhub/Ruach_Studio_Models: $(why))"; fi
      fi
      hf_repo Falconsai/nsfw_image_detection "$ROOT/artwork/nsfw-filter" --include "config.json" "model.safetensors" "preprocessor_config.json"
      hf_repo Qwen/Qwen3-4B-Instruct-2507 "$ROOT/artwork/Qwen3-4B-Instruct-2507" "${WORK[@]}" LICENSE
      [ -x "$ROOT/.venv-art/bin/python" ] || say_miss "$ROOT/.venv-art" "(Krea 2 paints in its own environment: lab/install-venv.sh --art)"
    fi
  fi
fi
if [ $ARTWORK = 1 ] && ! [ "${BIG:-0}" -ge 16000 ] 2>/dev/null; then
  asked artwork "Artwork: the painter and the prompt writer (SDXL: no card here has the 16 GB Krea 2 wants)"
  A_DIR="$ROOT/artwork/CyberRealistic-XL-v10"
  a_here() { [ -s "$A_DIR/model_index.json" ] && [ -s "$A_DIR/unet/diffusion_pytorch_model.safetensors" ]; }
  go=1
  if [ $MODE != check ] && [ $YES = 0 ] && ! { a_here && [ -s "$ROOT/artwork/Qwen3-4B-Instruct-2507/config.json" ]; }; then
    printf "%s" "Download 14 GB (the painter 6.5, the prompt writer 7.6)? It needs a 16 GB card when it draws. [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  if [ $go = 1 ]; then
    if a_here; then say_here "$A_DIR" "(goldhub/Ruach_Studio_Models)"
    elif [ $MODE = check ]; then say_miss "$A_DIR" "(goldhub/Ruach_Studio_Models)"
    else
      hf_ready >/dev/null || { say_fail "$A_DIR" "(the pinned downloader would not install: tools/hf-env.sh)"; }
      again "$HF" download --quiet goldhub/Ruach_Studio_Models --include "artwork/CyberRealistic-XL-v10/*" --local-dir "$ROOT"
      if a_here; then say_got "$A_DIR" "(goldhub/Ruach_Studio_Models)"; else say_fail "$A_DIR" "(goldhub/Ruach_Studio_Models: $(why))"; fi
    fi
    # HERESY 1156 (Viktor: «на нашу модель дать рядом относительный симлинк SDXL-Artwork-Model, чтобы на этот симлинк
    # можно было бы посадить другие веса SDXL»): the studio paints with whatever SDXL this link points at. Made once,
    # beside ours; a link the user pointed elsewhere is left as it is, and said
    A_LINK="$ROOT/artwork/SDXL-Artwork-Model"
    if [ -L "$A_LINK" ] || [ -e "$A_LINK" ]; then
      say_here "$A_LINK" "(→ $(readlink "$A_LINK" 2>/dev/null || echo "not a link"))"
    elif [ $MODE = check ]; then
      say_miss "$A_LINK" "(→ CyberRealistic-XL-v10: made by a run without --check)"
    elif a_here; then
      ln -s CyberRealistic-XL-v10 "$A_LINK" && say_got "$A_LINK" "(→ CyberRealistic-XL-v10, the painter; point it at another SDXL to change it)"
    fi
    hf_repo Qwen/Qwen3-4B-Instruct-2507 "$ROOT/artwork/Qwen3-4B-Instruct-2507" "${WORK[@]}" LICENSE
  fi
fi

# HERESY 1086: the studio's own LoRA trainer (lab/trainer), only when asked for, and asked again with its size.
# Comfy-Org's YuE2 file carries the network, the VAE and the text tokenizer at once; the latent cache needs
# MERT-v2-FullSong (the Kit's tools/download-checkpoints.sh) and Mothersuperior's realaudio tokenizer head
# (CC BY-NC 4.0, as MERT: fetched by the user from its authors, never shipped with the studio).
if [ -n "$TRAINER" ]; then
  asked trainer "The LoRA trainer's base: Comfy-Org/YuE2 ($TRAINER)"
  case "$TRAINER" in
    bf16) T_FILE=checkpoints/yue2_3b_bf16.safetensors; SIZE="7.8 GB" ;;
    int8) T_FILE=checkpoints/yue2_3b_int8_convrot.safetensors; SIZE="4.0 GB" ;;
    *) echo "${R}--trainer takes bf16 or int8${X}"; exit 2 ;;
  esac
  go=1
  if [ $MODE != check ] && [ $YES = 0 ] && ! hf_complete Comfy-Org/YuE2 "$(pin Comfy-Org/YuE2)" "$ROOT/checkpoints/comfy" --include "$T_FILE" >/dev/null 2>&1; then
    printf "%s" "Download $SIZE? [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_repo Comfy-Org/YuE2 "$ROOT/checkpoints/comfy" --include "$T_FILE"
  hf_repo Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4 "$ROOT/checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4" \
          --include "tokenizer_head_joint_v4.pt" "README.md"
  if [ -s "$ROOT/checkpoints/MERT-v2-FullSong/model.safetensors" ]; then say_here "$ROOT/checkpoints/MERT-v2-FullSong" "(the Kit's download)"
  else say_miss "$ROOT/checkpoints/MERT-v2-FullSong" "→ tools/download-checkpoints.sh"; fi
fi

# HERESY 1285 (Viktor 09.10.2026: «BF16 не скачалась, потому что ты честно вычислил backbone для 16GB VRAM, но, на эту видеокарту
# RTX5000 можно ли будет со студии докачать BF16?»): another backbone beside the one the install took, asked with its size.
# A card of compute 7.5 (Turing: Quadro RTX, RTX 20xx) has no BF16 tensor cores: BF16 runs there, slower than Q8_0
if [ -n "$BACKBONE" ]; then
  case "$BACKBONE" in BF16) B_SIZE="7.2 GB" ;; Q8_0) B_SIZE="3.8 GB" ;; Q6_K) B_SIZE="2.9 GB" ;; Q5_K_M) B_SIZE="2.6 GB" ;;
    *) echo "${R}--backbone takes BF16, Q8_0, Q6_K or Q5_K_M${X}"; exit 2 ;; esac
  B_FILE="$ROOT/models/YuE2-3B-$BACKBONE.gguf"
  asked backbone "The backbone YuE2-3B $BACKBONE (m-a-p's YuE2 as GGUF: Serveurperso/YuE2-GGUF)"
  if [ -s "$B_FILE" ]; then say_here "$B_FILE" "(download-models.sh)"
  elif [ $MODE = check ]; then say_miss "$B_FILE" "($B_SIZE: --backbone $BACKBONE fetches it)"
  else
    go=1
    if [ $YES = 0 ]; then
      CAP=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | sort -n | tail -1)
      [ "$BACKBONE" = BF16 ] && [ "${CAP%%.*}" -lt 8 ] 2>/dev/null && echo "${Y}          this card (compute $CAP) has no BF16 tensor cores: BF16 runs, slower than Q8_0${X}"
      printf "%s" "Download $B_SIZE? The studio's Engine (Compute) chooses between the backbones after its next start. [y/N] "
      read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
    fi
    if [ $go = 1 ]; then
      if again "$ROOT/download-models.sh" --quant "$BACKBONE" && [ -s "$B_FILE" ]; then say_got "$B_FILE" "(download-models.sh, $B_SIZE)"
      else say_fail "$B_FILE" "(download-models.sh: $(why))"; fi
    fi
  fi
fi

# HERESY 1285 (Viktor 09.10.2026: «LoRA пока что не скачались. Только Standard VAE»): the LoRAs the 💎 sets were made with come
# with the install, each under the name their takes use: the Kit's library (11 adapters from 8 repos, 1.3 GB) and the studio's
# own (goldhub/Ruach_Studio_LoRAs: six voices, the duduk and the shofar, 0.8 GB)
if want loras; then
  part loras "LoRAs: the Kit's library and Ruach Studio's own"
  if [ $MODE = check ]; then
    if "$ROOT/tools/download-loras.sh" --verify >"$LOG" 2>&1; then say_here "loras/ (the Kit's library)" "(tools/download-loras.sh)"
    else say_miss "loras/ (the Kit's library)" "(tools/download-loras.sh: $(why))"; fi
  else
    if again "$ROOT/tools/download-loras.sh"; then
      sum=$(grep -a "^loras" "$LOG" | tail -1 | sed 's/\x1b\[[0-9;]*m//g' | tr -s ' ' | cut -c7-120)
      case "$sum" in "downloaded 0 "*) say_here "loras/ (the Kit's library)" "($sum)" ;; *) say_got "loras/ (the Kit's library)" "($sum)" ;; esac
    else say_fail "loras/ (the Kit's library)" "(tools/download-loras.sh: $(why))"; fi
  fi
  OWN="$ROOT/tmp/fetch-ruach-loras.out"
  "$HPY" "$ROOT/heresy/fetch-ruach-loras.py" $([ $MODE = check ] && echo --check) >"$OWN" 2>&1
  grep -av "^#counts " "$OWN" | grep -av "^[[:space:]]*$"
  # HERESY 1289: its verdicts into the list too, as the others' (the first word the verdict, the rest what and its words)
  if [ -n "$LIST" ]; then
    grep -av "^#counts " "$OWN" | grep -av "^[[:space:]]*$" | sed 's/\x1b\[[0-9;]*m//g' | while read -r st rest; do note "$st" "$rest" ""; done
  fi
  c=$(grep -a "^#counts " "$OWN" | tail -1)
  if [ -n "$c" ]; then
    n() { echo "$c" | grep -o "$1=[0-9]*" | cut -d= -f2; }
    have=$((have + $(n here))); got=$((got + $(n fetched))); miss=$((miss + $(n missing))); failed=$((failed + $(n failed)))
  else
    say_fail "loras/ (the studio's own)" "(heresy/fetch-ruach-loras.py said nothing to count)"
  fi
fi

echo
echo "${D}Your own LoRAs go into loras/, a folder each, with an entry in loras/sources.json.${X}"
echo "here ${G}$have${X} · unknown $unknown · differs $([ $odd -gt 0 ] && echo "$Y")$odd${X} · fetched ${G}$got${X} · missing $([ $miss -gt 0 ] && echo "$Y")$miss${X} · failed $([ $failed -gt 0 ] && echo "$R")$failed${X}"
if [ -n "$LIST" ]; then   # HERESY 1289: the run is over: its list takes the last one's place, with its counts and when
  note "#sum" "$have $unknown $odd $got $miss $failed" "$MODE $(date +%s)"
  mv -f "$LIST" "${LIST%.part}"
fi
[ $failed = 0 ]
