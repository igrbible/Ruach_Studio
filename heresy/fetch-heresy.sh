#!/bin/bash
# HERESY · fetch-heresy.sh — every weight and clone Ruach Studio needs beyond the Kit's download-models.sh.
#
#   heresy/fetch-heresy.sh --check     say what is here and what is missing, download nothing
#   heresy/fetch-heresy.sh             fetch what is missing; what is here stays as it is
#   heresy/fetch-heresy.sh --replace   also fetch the pinned copy over one that is here but differs
#   heresy/fetch-heresy.sh --writer quality|compact [--yes]
#                                      also the studio's writer (Qwopus3.5-9B-v3 as GGUF, HERESY 1811), asked first with its size;
#                                      it runs through llama.cpp's llama-server (vendor/llama.cpp, cloned here, built by launcher/extras.sh)
#   heresy/fetch-heresy.sh --listener Q8_0|Q5_K_M|Q4_K_M|bf16 [--yes]
#                                      also the style listener (Qwen2.5-Omni-7B), asked first with its size;
#                                      GGUF ones run through llama.cpp (vendor/llama.cpp, cloned here, built by you)
#   heresy/fetch-heresy.sh --artwork [--artwork-q8] [--yes]
#                                      also the artwork's models (HERESY 1120, 1167), asked first with their size: the
#                                      the covers' helpers: the prompt writer and the content filter (HERESY 1428: Krea 2 gone;
#                                      the painters are --qwen's), streamed
#                                      from RAM below; 1405: SDXL gone), from our models repo; the prompt writer (Qwen3-4B)
#   heresy/fetch-heresy.sh --qwen 2512-q4|2512-q6|2.1[,…] [--yes]
#                                      HERESY 1323: also the Artist's Qwen painters, each asked first with its size:
#                                      Qwen-Image-2512 with Lightning (Apache-2.0; Q4_K_M from a 16 GB card, Q6_K from 24)
#                                      and Qwen-Image-2.1 (Qwen's research licence: not for commercial use, the question says so)
#   heresy/fetch-heresy.sh --qwen-fine jibmix-v6|intorealism-v1|real-v2|base-fp8[,…] [--yes]
#                                      HERESY 1347: also an fp8 fine-tune of Qwen-Image-2512 from our models repo (a card of
#                                      24 GB), with 2512's own parts and Lightning when they are not here; shared there by
#                                      their authors' leave (Civitai: share and sell)
#   heresy/fetch-heresy.sh --art-loras all [--yes]
#                                      HERESY 1347: also the Artist's adapters whose authors let them be shared (ten, 7.5 GB)
#   heresy/fetch-heresy.sh --trainer bf16|int8 [--yes]
#                                      also the base for the studio's own LoRA trainer (lab/trainer), asked first
#                                      with its size; bf16 trains on unquantized weights, int8 on a smaller card
#   heresy/fetch-heresy.sh --backbone BF16|Q8_0|Q6_K|Q5_K_M [--yes]
#                                      also another YuE2 backbone beside the one the install took for the card, asked
#                                      first with its size (HERESY 1285: BF16 where a 16 GB card took Q8_0)
#   heresy/fetch-heresy.sh --ira BF16|Q8_0|Q6_K [--yes]
#                                      HERESY 1490: also the IRA merge (YuE2-3B with Mothersuperior's Instrumental and Real Audio
#                                      folded in, goldhub/YuE2-3B-Ruach_Studio-IRA-Merge) beside m-a-p's backbones, asked first
#   heresy/fetch-heresy.sh --irae IRAE|IRAEv2|IRAEv3|IRAE-IR|IRAE-IRv2-BF16|Q8_0|Q6_K [--yes]   (HERESY 1708: IRAE-IR, IRAE-IRv2)
#                                      HERESY 1689: also an IRAE merge (IRA with monsterovich's Epic Trailer on top), from the same repo
#   heresy/fetch-heresy.sh --fw 2.4x0.75-BF16|Q8_0|Q6_K [--yes]   (and 0.7x0.75, 1.5x0.75, 3.4x0.7, 3.4x0.75, 4.0x0.65, 4.0x0.7)
#                                      HERESY 1794: also a merge of Ruach Studio's own fine-tune, from goldhub/YuE2-RS-Finetunes; the
#                                      default one (2.4x0.75) comes with the install as the part «fw», at the backbone's quant
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
# HERESY 1445 (Viktor 14.10.2026: «Лучше всё тянуть Студии из одного репо, чем бегать по всему инету»): every weight v2 holds comes
# from v2 at its pin, the same files byte for byte as their authors publish them (checked against each author's repo at its pin):
# Whisper, UniverSR, the listener's GGUFs, the Artist's helpers and painters, the Trainer's base, the studio's own adapters. From
# their authors still: the stems' models (audio-separator reads its own list beside them), the Kit's library of adapters (its own
# downloader; three of them carry no licence to copy), Qwen2.5-Omni-7B whole (the listener at bf16), and the code cloned from git.
# Needs: python3, git, the lab venv for audio-separator (lab/install-venv.sh), ~8 GB of disk.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=fetch; LISTENER=""; TRAINER=""; ARTWORK=0; ARTQ8=0; YES=0; BACKBONE=""; ONLY=""; QWEN=""; QFINE=""; ARTLORAS=""; IRA=""; IRAE=""; FW=""; WRITER=""; MUSC=""; H3=""; UPSCALER=""   # HERESY 1794: FW; 1811: WRITER; 1834; 1867: H3: MUSC; 1876a: UPSCALER
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;; --replace) MODE=replace ;; --yes) YES=1 ;;
    --listener) LISTENER="${2:-}"; shift ;;
    --trainer) TRAINER="${2:-}"; shift ;;
    --backbone) BACKBONE="${2:-}"; shift ;;
    --ira) IRA="${2:-}"; shift ;;                   # HERESY 1490
    --irae) IRAE="${2:-}"; shift ;;                 # HERESY 1689
    --fw) FW="${2:-}"; shift ;;                     # HERESY 1794
    --writer) WRITER="${2:-}"; shift ;;             # HERESY 1811
    --muscriptor) MUSC="${2:-}"; shift ;;           # HERESY 1834
    --h3) H3="${2:-int8}"; shift ;;                 # HERESY 1867
    --upscaler) UPSCALER="${2:-7b}"; shift ;;       # HERESY 1876a
    --only) ONLY=",${2:-},"; shift ;;
    --artwork) ARTWORK=1 ;;
    --artwork-q8) ARTWORK=1; ARTQ8=1 ;;
    --qwen) QWEN="${2:-}"; shift ;;
    --qwen-fine) QFINE="${2:-}"; shift ;;           # HERESY 1347
    --art-loras) ARTLORAS="${2:-all}"; shift ;;
    *) echo "--check, --replace, --h3 int8|all|bf16, --upscaler 3b|7b|all, --muscriptor small|medium|large, --writer quality|compact, --listener Q8_0|Q5_K_M|Q4_K_M|bf16, --trainer bf16|int8, --backbone BF16|Q8_0|Q6_K|Q5_K_M, --ira BF16|Q8_0|Q6_K, --irae IRAE|IRAEv2|IRAEv3-BF16|Q8_0|Q6_K, --fw 2.4x0.75-BF16|Q8_0|Q6_K (and 0.7x0.75, 1.5x0.75, 3.4x0.7, 3.4x0.75, 4.0x0.65, 4.0x0.7), --artwork, --artwork-q8, --qwen 2512-q4|2512-q6|2.1, --qwen-fine jibmix-v6|intorealism-v1|real-v2|base-fp8, --art-loras all, --only extras,whisper,stems,upscale,loras|none, --yes"; exit 2 ;;
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
  # HERESY 1445 (Viktor 14.10.2026: «пользователь волен переименовать скачанное»): only what the check named missing or wrong is
  # fetched, by its own path: one adapter missing no longer brings again the nine here under names or in folders of the user's own
  # (found by their content). A check that names more than it shows («… and N more») fetches the whole pattern, as before
  local need inc=("$@")
  need=$( { printf '%s\n' "$out" | sed -n 's/^[[:space:]]*\(.*\): missing$/\1/p'; printf '%s\n' "$wrong"; } | sed '/^$/d')
  printf '%s\n' "$out" | grep -q '\.\.\. and [0-9]* more' && need=""
  [ -n "$need" ] && mapfile -t inc <<< "$need"
  again "$HF" download --quiet "$repo" --revision "$rev" --local-dir "$ROOT" --include "${inc[@]}"
  if hf_complete "$repo" "$rev" "$ROOT" --include "$@" >/dev/null 2>&1; then say_got "$what" "$tag"; else say_fail "$what" "$tag: $(why)"; fi
}

# --- files of a repo into a folder that may hold others (a second quant beside the first):  hf_into_at WHAT REPO DIR INCLUDE…
# HERESY 1323: as hf_into, at DIR: hf_repo would call a folder with a file missing «not the pinned copy» and keep it as it is
hf_into_at() {
  local what=$1 repo=$2 dir=$3 rev out rc wrong; shift 3; rev=$(pin "$repo")
  local tag="($repo @ ${rev:0:7})"; [ "$rev" = main ] && tag="($repo @ main: not pinned)"
  out=$(hf_complete "$repo" "$rev" "$dir" --include "$@" 2>&1); rc=$?
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
    while IFS= read -r f; do mkdir -p "$aside/$(dirname "$f")" && mv "$dir/$f" "$aside/$f"; done <<< "$wrong"
    echo "${D}          the old copies → ${aside#"$ROOT"/} (delete them when the new ones work)${X}"
  fi
  hf_ready >/dev/null || { say_fail "$what" "(the pinned downloader would not install: tools/hf-env.sh)"; return; }
  mkdir -p "$dir"
  again "$HF" download --quiet "$repo" --revision "$rev" --local-dir "$dir" --include "$@"
  if hf_complete "$repo" "$rev" "$dir" --include "$@" >/dev/null 2>&1; then say_got "$what" "$tag"; else say_fail "$what" "$tag: $(why)"; fi
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
  # HERESY 1449: the sliders no more (Viktor 15.10.2026: «Нахер убирай это слайдерное говно из нашей Студии»)
  part extras "The extra decoders, converted once (goldhub/Ruach_Studio_Models_v2)"
  hf_into "legacy and blend decoders (models/)" goldhub/Ruach_Studio_Models_v2 \
          "models/YuE2-Vae-legacy-F32.gguf" "models/YuE2-Vae-blend-F32.gguf"
fi

if want whisper; then
  part whisper "Whisper large-v3 (CTranslate2, float16): lyrics check, karaoke timing, trim to the text"
  hf_into "whisper/whisper-large-v3-ct2-float16" goldhub/Ruach_Studio_Models_v2 "whisper/whisper-large-v3-ct2-float16/*"   # HERESY 1445: Systran's
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
  # HERESY 1445: from v2 into universr/, where lab/upscale_job.py reads it; 1799 (Viktor 26.10.2026: «удаление .cache и hf_cache никогда не
  # должно сломать ни одного из пайплайнов Студии»): an older install's woongzip1's in hf_cache/ (the same bytes as v2's) is copied into
  # universr/, then checked by the pin like any download; nothing reads it where it lies
  snap="$ROOT/hf_cache/hub/models--woongzip1--universr-audio/snapshots/$(pin woongzip1/universr-audio)"
  if [ $MODE != check ] && [ ! -s "$ROOT/universr/pytorch_model.bin" ] && [ -s "$snap/pytorch_model.bin" ] && [ -s "$snap/config.yaml" ]; then
    mkdir -p "$ROOT/universr" && cp -L "$snap/config.yaml" "$snap/pytorch_model.bin" "$ROOT/universr/"
  fi
  hf_into "universr (woongzip1/universr-audio)" goldhub/Ruach_Studio_Models_v2 "universr/*"
  clone https://github.com/woongzip1/UniverSR.git "$ROOT/vendor/UniverSR"
  # HERESY 1583: the Voice upscale's bundle: Apollo-vocal (baicai1145, CC BY-NC-SA 4.0) and its model code, from v2 into models/upbundle/apollo/
  # where lab/upbundle_job.py reads them; FlashSR comes on first use (1611: its weights from our copy in v2, Apache-2.0 as its author stated on 20.10.2026; its code from him)
  hf_into "Apollo-vocal (baicai1145/Apollo-vocal-msst)" goldhub/Ruach_Studio_Models_v2 "models/upbundle/apollo/*"
fi

# HERESY 1079: the style listener, only when asked for, and asked again with its size: a download of 7 to 22 GB
# is never a surprise (Viktor: a user may be on a metered link). Peaks measured 02.10.2026 on a 120 s excerpt.
if [ -n "$LISTENER" ]; then
  asked listener "The style listener: Qwen2.5-Omni-7B ($LISTENER)"
  # HERESY 1077b: every GGUF with mradermacher's Q8_0 audio projector (1.5 GB): the ladder measured 02.10.2026
  # heard the same tags from Q8_0 down to Q4_K_M with it as with the f16 one (2.6 GB), a GB less and twice as fast
  OMNI="$ROOT/checkpoints/Qwen2.5-Omni-7B-GGUF"      # (not G: that one is the green of the output)
  # HERESY 1445: the GGUFs from v2, laid out as before (ggml-org's at the top, unsloth/, mradermacher/); bf16 from Qwen
  V2=goldhub/Ruach_Studio_Models_v2; O="checkpoints/Qwen2.5-Omni-7B-GGUF"
  P_REPO=$V2; P_DIR="$ROOT"; P_INC=(--include "$O/mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf")
  case "$LISTENER" in
    Q8_0)   SIZE="9.6 GB (Q8_0 8.1 + its audio projector Q8_0 1.5)"; PEAK="10.3 GB of VRAM"
            L_REPO=$V2; L_DIR="$ROOT"; L_INC=(--include "$O/Qwen2.5-Omni-7B-Q8_0.gguf") ;;
    Q5_K_M) SIZE="6.9 GB (Q5_K_M 5.4 + its audio projector Q8_0 1.5)"; PEAK="8.0 GB of VRAM"
            L_REPO=$V2; L_DIR="$ROOT"; L_INC=(--include "$O/unsloth/Qwen2.5-Omni-7B-Q5_K_M.gguf") ;;
    Q4_K_M) SIZE="6.2 GB (Q4_K_M 4.7 + its audio projector Q8_0 1.5)"; PEAK="7.3 GB of VRAM"
            L_REPO=$V2; L_DIR="$ROOT"; L_INC=(--include "$O/Qwen2.5-Omni-7B-Q4_K_M.gguf") ;;
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
    if [ "$L_REPO" = "$V2" ]; then hf_into "$O ($LISTENER and its audio projector)" "$V2" "${L_INC[@]:1}" "${P_INC[@]:1}"
    else hf_repo "$L_REPO" "$L_DIR" "${L_INC[@]}"; fi
  fi
  if [ "$LISTENER" != bf16 ]; then
    clone https://github.com/ggml-org/llama.cpp.git "$ROOT/vendor/llama.cpp"
    if [ -x "$ROOT/vendor/llama.cpp/build/bin/llama-mtmd-cli" ]; then say_here "llama-mtmd-cli" "(vendor/llama.cpp/build)"
    else say_miss "llama-mtmd-cli" "→ cd vendor/llama.cpp && cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER=\$(which nvcc) && cmake --build build -j --target llama-mtmd-cli"; fi
  fi
fi

# HERESY 1811 (Viktor 28.10.2026: «прикручивай как Local Studio LLM… пусть это будет опция по умолчанию для установок, где VRAM позволяет»): the studio's
# own writer, Qwopus3.5-9B-v3 as AutoRound moved into GGUF, from our models repo v2 at its pin; asked first with its size; it runs through llama-server
if [ -n "$WRITER" ]; then
  asked writer "The studio's writer: Qwopus3.5-9B-v3 ($WRITER)"
  V2=goldhub/Ruach_Studio_Models_v2; O="checkpoints/Qwopus3.5-9B-GGUF"
  case "$WRITER" in
    quality) SIZE="6.7 GB"; PEAK="about 7.5 GB of VRAM"; W_FILE="$O/Qwopus3.5-9B-v3-AR-Q4_0.gguf" ;;
    compact) SIZE="5.5 GB"; PEAK="about 6.5 GB of VRAM"; W_FILE="$O/Qwopus3.5-9B-v3-AR-compact.gguf" ;;
    *) echo "${R}--writer takes quality or compact${X}"; exit 2 ;;
  esac
  go=1
  if [ $MODE != check ] && [ $YES = 0 ] && ! hf_complete "$V2" "$(pin "$V2")" "$ROOT" --include "$W_FILE" >/dev/null 2>&1; then
    printf "%s" "Download $SIZE? It needs $PEAK when it writes. [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into "$O ($WRITER and its licence)" "$V2" "$W_FILE" "$O/LICENSE"
  clone https://github.com/ggml-org/llama.cpp.git "$ROOT/vendor/llama.cpp"
  if [ -x "$ROOT/vendor/llama.cpp/build/bin/llama-server" ]; then say_here "llama-server" "(vendor/llama.cpp/build)"
  else say_miss "llama-server" "→ bash launcher/extras.sh builds it (or: cd vendor/llama.cpp && cmake -B build -DGGML_CUDA=ON && cmake --build build -j --target llama-server)"; fi
fi

# HERESY 1834 (Viktor 28.10.2026: «забирай large модель muscriptor, и пропишешь все три размера в Engine»): the weights of the sound-to-MIDI
# transcriber, MuScriptor (Mirelo and Kyutai; CC BY-NC 4.0: non-commercial use only) as DamRsn converted it to GGUF, from his repo at its pin, into
# models/muscriptor with its notice and licence; asked first with its size. The program that reads it, build.sh builds (build/build-muscriptor)
if [ -n "$MUSC" ]; then
  asked muscriptor "Sound to MIDI: MuScriptor $MUSC (Mirelo and Kyutai, CC BY-NC 4.0: non-commercial use only)"
  case "$MUSC" in
    small) SIZE="209 MB" ;; medium) SIZE="618 MB" ;; large) SIZE="2.7 GB" ;;
    *) echo "${R}--muscriptor takes small, medium or large${X}"; exit 2 ;;
  esac
  M_REPO=DamRsn/muscriptor-gguf; go=1
  if [ $MODE != check ] && [ $YES = 0 ] && ! hf_complete "$M_REPO" "$(pin "$M_REPO")" "$ROOT/models/muscriptor" --include "v1/muscriptor-$MUSC-f16.gguf" >/dev/null 2>&1; then
    printf "%s" "Download $SIZE? [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into_at "models/muscriptor ($MUSC, its notice and licence)" "$M_REPO" "$ROOT/models/muscriptor" "v1/muscriptor-$MUSC-f16.gguf" "NOTICE.md" "LICENSE"
  if [ -x "$ROOT/build/build-muscriptor/ruach-muscriptor" ]; then say_here "ruach-muscriptor" "(build/build-muscriptor)"
  else say_miss "ruach-muscriptor" "→ ./build.sh builds it"; fi
fi

# HERESY 1867 (Viktor 29.10.2026: «BF16 веса H3 просчитай по затратам и их тоже пропиши в загрузчик, но мы не насилуем наше железо, достаточно int8
# с головой»): the Videographer's moving pictures, MiniMax H3 (MiniMax H3 Community License: not to be run in the US, the EU, the UK or South Korea
# without MiniMax's own leave; commercial use past its threshold needs a licence of MiniMax) as Comfy-Org packs it, and with «all» FastH3 (FastVideo),
# into models/minimax-h3 in its Comfy layout, at their pins; the original's tokenizer, processor and encoder config (64 MB) beside them. HERESY 1869:
# the drafts are H3 itself at 8 steps (measured 29.10: FastH3 is past 24 GB at 768p and knows no first frame), so int8 goes without FastH3
if [ -n "$H3" ]; then
  asked h3 "The Videographer's moving pictures: MiniMax H3 ($H3). Its licence (MiniMax H3 Community License) forbids running it in the US, the EU, the UK and South Korea without MiniMax's leave, and commercial use past its threshold needs MiniMax's licence: read it first (models/minimax-h3/original/LICENSE)"
  C_REPO=Comfy-Org/MiniMax-H3; F_REPO=FastVideo/FastVideo-FastH3-Comfy; O_REPO=MiniMaxAI/MiniMax-H3
  H3_INT8=(diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors
           text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors vae/minimax_h3_video_vae_fp16.safetensors vae/minimax_h3_audio_vae_fp32.safetensors
           loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors
           loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors)
  H3_ALL=(diffusion_models/minimax_h3_fl2va_int8_convrot.safetensors diffusion_models/minimax_h3_ref2va_int8_convrot.safetensors
          text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors vae/minimax_h3_sol_vae_fp16.safetensors
          loras/pika_h3_flex_fl2va_v1_bf16.safetensors loras/pika_h3_flex_ref2va_v1_bf16.safetensors
          model_patches/minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors model_patches/minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors)
  H3_BF16=(diffusion_models/minimax_h3_fl2va_bf16.safetensors diffusion_models/minimax_h3_ref2va_bf16.safetensors
           diffusion_models/minimax_h3_fl2va_pruned_bf16.safetensors diffusion_models/minimax_h3_ref2va_pruned_bf16.safetensors
           text_encoders/qwen3vl_32b_minimax_h3_bf16.safetensors
           model_patches/minimax_h3_fun_controlnet_union_2.0_pruned_bf16.safetensors model_patches/minimax_h3_fun_controlnet_union_pruned_bf16.safetensors)
  case "$H3" in
    int8) FILES=("${H3_INT8[@]}"); SIZE="69 GB; a card of 24 GB, a part of the DiT streamed from RAM (64 GB of RAM or more)"; FAST=0; EFFECTS=0 ;;
    all) FILES=("${H3_INT8[@]}" "${H3_ALL[@]}"); SIZE="192 GB: every int8 tier, FastH3, ControlNet Union, the effects; cards of 24 GB"; FAST=1; EFFECTS=1 ;;
    bf16) FILES=("${H3_INT8[@]}" "${H3_ALL[@]}" "${H3_BF16[@]}"); SIZE="469 GB: the int8 tiers and the unquantized DiTs (66 GB each whole, 40 GB pruned) and encoder (51.5 GB): for cards of 80 GB, or two and more of 48 GB; on 24 GB they only stream from RAM, slowly"; FAST=1; EFFECTS=1 ;;
    *) echo "${R}--h3 takes int8, all or bf16${X}"; exit 2 ;;
  esac
  go=1
  if [ $MODE != check ] && [ $YES = 0 ]; then
    printf "%s" "Download up to $SIZE? [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  if [ $go = 1 ]; then
    [ $EFFECTS = 1 ] && FILES+=(embeddings/minimaxh3_art_is_explosion.safetensors embeddings/minimaxh3_blooming_flowers.safetensors embeddings/minimaxh3_bullet_time.safetensors
                                embeddings/minimaxh3_dark_magic.safetensors embeddings/minimaxh3_fire_breath.safetensors embeddings/minimaxh3_four_seasons.safetensors
                                embeddings/minimaxh3_kiss_camera.safetensors embeddings/minimaxh3_spiral_ascent.safetensors embeddings/minimaxh3_storm_magic.safetensors
                                embeddings/minimaxh3_truman_show.safetensors)
    hf_into_at "models/minimax-h3 (MiniMax H3, $H3)" "$C_REPO" "$ROOT/models/minimax-h3" "${FILES[@]}" "README.md"
    [ $FAST = 1 ] && hf_into_at "models/minimax-h3 (FastH3, 8 steps)" "$F_REPO" "$ROOT/models/minimax-h3" "diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors"
    hf_into_at "models/minimax-h3/original (its tokenizer, processor and encoder config, its licence)" "$O_REPO" "$ROOT/models/minimax-h3/original" \
      FL2VA/tokenizer/merges.txt FL2VA/tokenizer/tokenizer.json FL2VA/tokenizer/tokenizer_config.json FL2VA/tokenizer/vocab.json \
      FL2VA/processor/chat_template.json FL2VA/processor/merges.txt FL2VA/processor/preprocessor_config.json FL2VA/processor/tokenizer.json \
      FL2VA/processor/tokenizer_config.json FL2VA/processor/video_preprocessor_config.json FL2VA/processor/vocab.json FL2VA/text_encoder/config.json \
      Ref2VA/tokenizer/merges.txt Ref2VA/tokenizer/tokenizer.json Ref2VA/tokenizer/tokenizer_config.json Ref2VA/tokenizer/vocab.json \
      Ref2VA/processor/chat_template.json Ref2VA/processor/merges.txt Ref2VA/processor/preprocessor_config.json Ref2VA/processor/tokenizer.json \
      Ref2VA/processor/tokenizer_config.json Ref2VA/processor/video_preprocessor_config.json Ref2VA/processor/vocab.json Ref2VA/text_encoder/config.json LICENSE README.md
  fi
fi

# HERESY 1876a (Viktor 29.10.2026: «SeedVR2 обе 3B и 7B просчитай по ресурсам и прогони 7B на предмет на OOM под 24GB VRAM… Прикручиваем в загрузчик оба
# веса»): the Videographer's upscaler, SeedVR2 (ByteDance, Apache-2.0) as numz packs it, into models/seedvr2 at its pin. Measured 29.10 on a 3090, 107 frames
# of 768p: 3B to 1080p 284 s, 18.6 GB of the card at its peak; 7B sharp to 1080p 367 s, 19.7 GB with 16 of its blocks in RAM (22.4 GB without: 1.2 GB to
# spare, which Comfy's own takes); 7B sharp to 1440p 592 s, 20.9 GB
if [ -n "$UPSCALER" ]; then
  S_REPO=numz/SeedVR2_comfyUI
  case "$UPSCALER" in
    3b) FILES=(seedvr2_ema_3b_fp16.safetensors); SIZE="7.3 GB: SeedVR2 3B, the quick one (18.6 GB of a card at 1080p)" ;;
    7b) FILES=(seedvr2_ema_7b_sharp_fp16.safetensors); SIZE="17 GB: SeedVR2 7B sharp, the studio's own (20 GB of a card at 1080p, 16 of its blocks in RAM)" ;;
    all) FILES=(seedvr2_ema_3b_fp16.safetensors seedvr2_ema_7b_sharp_fp16.safetensors seedvr2_ema_7b_fp16.safetensors); SIZE="41 GB: 3B, 7B sharp and 7B" ;;
    *) echo "${R}--upscaler takes 3b, 7b or all${X}"; exit 2 ;;
  esac
  go=1
  if [ $MODE != check ] && [ $YES = 0 ]; then
    printf "%s" "Download up to $SIZE? [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into_at "models/seedvr2 (SeedVR2, $UPSCALER)" "$S_REPO" "$ROOT/models/seedvr2" "${FILES[@]}" ema_vae_fp16.safetensors
fi

# HERESY 1120: artwork for takes, only when asked for, and asked again with its size (HERESY 1291: from our models repo v2, at its pin). The painter is CyberRealistic
# XL v10 (an SDXL finetune by Cyberdelia, CreativeML Open RAIL++-M), converted to diffusers fp16 and kept in our models
# repo (its author publishes it on Civitai only); the prompt writer is Qwen3-4B-Instruct-2507 from Qwen itself.
# HERESY 1167 (Viktor 05.10.2026, after the A/B on twelve instruments: «Muse - отличный файнтюн»; «Для карт ниже 24GB VRAM…
# оставим SDXL»): where a card has 16 GB, Krea 2 Muse by Stable Yogi (the author's GGUF, Q4; Q8 when asked) with Krea 2's
# text encoder, VAE and configs, all from our models repo (Krea 2 Community License: its LICENSE and NOTICE come along),
# and the content filter the licence asks for (Falconsai/nsfw_image_detection, Apache-2.0); SDXL below, as before.
# HERESY 1405 (Viktor 12.10.2026: «Да, удаляй лишний обвес SDXL. Лучше Krea 2 Q4, чем SDXL Q8»): Krea 2 Muse for any card: whole where one
# has 16 GB, its blocks streamed from RAM below (the lab says so to the painter); SDXL gone from the studio
# HERESY 1428 (Viktor 14.10.2026: «Krea вырезаем, однозначно»): Krea 2 Muse gone; --artwork brings what came with it and every painter uses:
# the prompt writer and the content filter (the painters are --qwen's); --artwork-q8 is taken as --artwork
if [ $ARTWORK = 1 ]; then
  asked artwork "Artwork: the covers' helpers, the prompt writer (Qwen3-4B-Instruct-2507) and the content filter (the painters are Qwen-Image's: --qwen)"
  go=1
  if [ $MODE != check ] && [ $YES = 0 ] && ! { [ -s "$ROOT/artwork/Qwen3-4B-Instruct-2507/config.json" ] && [ -s "$ROOT/artwork/nsfw-filter/model.safetensors" ]; }; then
    printf "%s" "Download 8.4 GB (the prompt writer 8.1, the filter 0.3)? [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  if [ $go = 1 ]; then
    hf_into "artwork/nsfw-filter (Falconsai/nsfw_image_detection)" goldhub/Ruach_Studio_Models_v2 "artwork/nsfw-filter/*"                         # HERESY 1445: from v2
    hf_into "artwork/Qwen3-4B-Instruct-2507" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen3-4B-Instruct-2507/*"
    [ -x "$ROOT/.venv-art/bin/python" ] || say_miss "$ROOT/.venv-art" "(the Artist paints in its own environment: lab/install-venv.sh --art)"
  fi
fi
# HERESY 1323 (Viktor 10.10.2026: «Забирай 2512 тоже в Студию»; «как альтернативу для менее мощных карт бери смело … Q6_K +
# Lightning… Для 16 ГБ — Q4_K_M»; on Qwen-Image-2.1: «мы предупреждаем пользователя по этому поводу»): the Artist's Qwen painters,
# only when asked for, each asked again with its size. Qwen-Image-2512 (Apache-2.0): the pipeline's parts from Qwen itself (the
# configs, the tokenizer, Qwen2.5-VL-7B as its text encoder, the VAE; not its 40.9 GB transformer), the transformer as GGUF from
# unsloth/Qwen-Image-2512-GGUF and Lightning's 8 steps from lightx2v (Apache-2.0 both). Qwen-Image-2.1 whole, from Qwen: its licence
# is Qwen's research licence, not for commercial use (a cover for a song that is sold is commercial use), and the question says so.
if [ -n "$QWEN" ]; then
  Q_DIR="$ROOT/artwork/Qwen-Image-2512"
  for q in ${QWEN//,/ }; do
    case "$q" in
      2512-q4|2512-q6)
        if [ "$q" = 2512-q4 ]; then quant=Q4_K_M; qsize=13.2; total=31; else quant=Q6_K; qsize=16.8; total=34.5; fi
        asked qwen "Artwork: Qwen-Image-2512 at $quant with Lightning (Apache-2.0)"
        go=1
        if [ $MODE != check ] && [ $YES = 0 ] && ! [ -s "$Q_DIR/gguf/qwen-image-2512-$quant.gguf" ]; then
          printf "%s" "Download up to $total GB (the transformer $quant $qsize, its text encoder and VAE 16.8, Lightning 0.85)? It paints on a card of $([ $quant = Q4_K_M ] && echo 16 || echo 24) GB. [y/N] "
          read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
        fi
        if [ $go = 1 ]; then
          hf_into "artwork/Qwen-Image-2512 (its parts)" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2512/model_index.json" "artwork/Qwen-Image-2512/README.md" "artwork/Qwen-Image-2512/scheduler/*" "artwork/Qwen-Image-2512/tokenizer/*" "artwork/Qwen-Image-2512/text_encoder/*" "artwork/Qwen-Image-2512/vae/*" "artwork/Qwen-Image-2512/transformer/config.json"
          hf_into "artwork/Qwen-Image-2512/gguf ($quant)" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2512/gguf/qwen-image-2512-$quant.gguf"   # HERESY 1445: from v2
          hf_into "artwork/Qwen-Image-2512/lightning" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2512/lightning/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors"
          [ -x "$ROOT/.venv-art/bin/python" ] || say_miss "$ROOT/.venv-art" "(the painters paint in their own environment: lab/install-venv.sh --art)"
        fi ;;
      2.1)
        asked qwen "Artwork: Qwen-Image-2.1 (Qwen's research licence: not for commercial use)"
        go=1
        if [ $MODE != check ] && [ $YES = 0 ] && ! [ -s "$ROOT/artwork/Qwen-Image-2.1/model_index.json" ]; then
          printf "%s" "Download 33 GB? Qwen-Image-2.1 is under Qwen's research licence: research and evaluation only, not for commercial use (a cover for a song that is sold is commercial use). It paints on a card of 24 GB. [y/N] "
          read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
        fi
        [ $go = 1 ] && hf_into "artwork/Qwen-Image-2.1" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2.1/model_index.json" "artwork/Qwen-Image-2.1/scheduler/*" "artwork/Qwen-Image-2.1/tokenizer/*" "artwork/Qwen-Image-2.1/processor/*" "artwork/Qwen-Image-2.1/text_encoder/*" "artwork/Qwen-Image-2.1/vae/*" "artwork/Qwen-Image-2.1/transformer/*" "artwork/Qwen-Image-2.1/LICENSE*" "artwork/Qwen-Image-2.1/NOTICE" ;;
      *) echo "--qwen takes 2512-q4, 2512-q6, 2.1 (several with commas)"; exit 2 ;;
    esac
  done
fi

# HERESY 1347 (Viktor 10.10.2026: «Залей в него все модели диффузные, что у нас накопились, и LoRA адаптеры, и настрой выборочное
# скачивание прямо в студии Художника»): the fp8 fine-tunes of Qwen-Image 2512 from our models repo, each only when asked for and
# asked again with its size, with 2512's own parts and Lightning when they are not here (as --qwen fetches them); only those whose
# authors let them be shared (Civitai: share and sell), the others are fetched by the user from Civitai itself. The same for the
# Artist's adapters.
if [ -n "$QFINE" ]; then
  Q_DIR="$ROOT/artwork/Qwen-Image-2512"
  for q in ${QFINE//,/ }; do
    case "$q" in
      jibmix-v6) f="JibMix QW2512 v6 fp8.safetensors"; who="Jib Mix Qwen v6 by J1B" ;;
      intorealism-v1) f="IntoRealism QW2512 v1 fp8.safetensors"; who="IntoRealism Qwen v1 by enzino" ;;
      real-v2) f="Real QW2512 v2 fp8.safetensors"; who="Real-Qwen-Image v2 by wikeeyang" ;;
      base-fp8) f="BASE QW2512 fp8_e4m3fn.safetensors"; who="Qwen-Image-2512 itself in fp8 (Civitai's own)" ;;
      *) echo "--qwen-fine takes jibmix-v6, intorealism-v1, real-v2, base-fp8 (several with commas)"; exit 2 ;;
    esac
    asked qwen-fine "Artwork: $who (an fp8 fine-tune of Qwen-Image-2512)"
    go=1
    if [ $MODE != check ] && [ $YES = 0 ] && ! [ -s "$Q_DIR/checkpoints/$f" ]; then
      printf "%s" "Download up to 38 GB (the fine-tune 20.4, Qwen-Image-2512's parts 16.8 and Lightning 0.85 when they are not here)? It paints on a card of 24 GB. [y/N] "
      read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
    fi
    if [ $go = 1 ]; then
      hf_into "artwork/Qwen-Image-2512 (its parts)" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2512/model_index.json" "artwork/Qwen-Image-2512/README.md" "artwork/Qwen-Image-2512/scheduler/*" "artwork/Qwen-Image-2512/tokenizer/*" "artwork/Qwen-Image-2512/text_encoder/*" "artwork/Qwen-Image-2512/vae/*" "artwork/Qwen-Image-2512/transformer/config.json"
      hf_into "artwork/Qwen-Image-2512/lightning" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2512/lightning/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors"
      hf_into "artwork/Qwen-Image-2512/checkpoints/$f" goldhub/Ruach_Studio_Models_v2 "artwork/Qwen-Image-2512/checkpoints/$f"
      [ -x "$ROOT/.venv-art/bin/python" ] || say_miss "$ROOT/.venv-art" "(the painters paint in their own environment: lab/install-venv.sh --art)"
    fi
  done
fi
if [ -n "$ARTLORAS" ]; then
  asked art-loras "Artwork: the Artist's adapters shared by their authors (ten, 7.5 GB: Qwen-Image 2.1 and 2512)"
  # HERESY 1441: each known by its content (v2's MANIFEST.tsv): renamed, or moved into a folder of the user's own, it is not fetched again
  HF_EXPECT_EXTRA="--by-content --manifest goldhub/Ruach_Studio_Models_v2@$(pin goldhub/Ruach_Studio_Models_v2)" \
    hf_into "artwork/loras (shared by their authors)" goldhub/Ruach_Studio_Models_v2 "artwork/loras/*"
fi

# HERESY 1086: the studio's own LoRA trainer (lab/trainer), only when asked for, and asked again with its size.
# Comfy-Org's YuE2 file carries the network, the VAE and the text tokenizer at once; the latent cache needs
# MERT-v2-FullSong and Mothersuperior's realaudio tokenizer head. HERESY 1445 (Viktor 14.10.2026: «MERT, realaudio и Comfy YuE2
# клади в v2»): all three from v2, unchanged, their authors named (CC BY-NC 4.0 lets them be shared, not for gain, with credit;
# checked byte for byte against their repos at the pins). HERESY 1303: MERT comes with it,
# 2.5 GB: a fresh install fetches no checkpoints since rc4, and the card said «missing → tools/download-checkpoints.sh».
if [ -n "$TRAINER" ]; then
  asked trainer "The LoRA trainer's base: Comfy-Org/YuE2 ($TRAINER)"
  case "$TRAINER" in
    bf16) T_FILE=checkpoints/yue2_3b_bf16.safetensors; SIZE="7.8 GB" ;;
    int8) T_FILE=checkpoints/yue2_3b_int8_convrot.safetensors; SIZE="4.0 GB" ;;
    *) echo "${R}--trainer takes bf16 or int8${X}"; exit 2 ;;
  esac
  go=1
  MERT_DIR="$ROOT/checkpoints/MERT-v2-FullSong"
  MERT_SAY=""; [ -s "$MERT_DIR/model.safetensors" ] || MERT_SAY=", and MERT-v2-FullSong 2.5 GB"     # HERESY 1303
  if [ $MODE != check ] && [ $YES = 0 ] && { [ -n "$MERT_SAY" ] || ! hf_complete goldhub/Ruach_Studio_Models_v2 "$(pin goldhub/Ruach_Studio_Models_v2)" "$ROOT" --include "checkpoints/comfy/$T_FILE" >/dev/null 2>&1; }; then
    printf "%s" "Download $SIZE$MERT_SAY? [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into "checkpoints/comfy/$T_FILE (Comfy-Org/YuE2)" goldhub/Ruach_Studio_Models_v2 "checkpoints/comfy/$T_FILE"
  hf_into "checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4 (its head)" goldhub/Ruach_Studio_Models_v2 "checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/*"
  if [ $go = 1 ] || [ $MODE = check ]; then hf_into "checkpoints/MERT-v2-FullSong (m-a-p)" goldhub/Ruach_Studio_Models_v2 "checkpoints/MERT-v2-FullSong/*"      # HERESY 1303: here, fetched, or said
  elif [ -s "$MERT_DIR/model.safetensors" ]; then say_here "$MERT_DIR" "(m-a-p/MERT-v2-FullSong)"
  else say_miss "$MERT_DIR" "(2.5 GB: --trainer fetches it with the base)"; fi
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

# HERESY 1490 (Viktor 16.10.2026: «Не забудь прикрутить скачивание этих GGUF в студии и выбор активной модели к базовым m-a-p весам»):
# the IRA merge beside m-a-p's backbones, from its own repo at its pin, asked with its size
if [ -n "$IRA" ]; then
  case "$IRA" in BF16) I_SIZE="7.2 GB" ;; Q8_0) I_SIZE="3.8 GB" ;; Q6_K) I_SIZE="2.9 GB" ;;
    *) echo "${R}--ira takes BF16, Q8_0 or Q6_K${X}"; exit 2 ;; esac
  asked ira "The IRA merge $IRA (YuE2-3B with Mothersuperior's Instrumental and Real Audio folded in: goldhub/YuE2-3B-Ruach_Studio-IRA-Merge)"
  go=1
  if [ $MODE = fetch ] && [ $YES = 0 ] && [ ! -s "$ROOT/models/YuE2-3B-IRA-$IRA.gguf" ]; then
    printf "%s" "Download $I_SIZE? The studio's Engine (Compute) chooses it beside m-a-p's backbones after its next start. [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into_at "models/YuE2-3B-IRA-$IRA.gguf (Ruach Studio's IRA merge)" goldhub/YuE2-3B-Ruach_Studio-IRA-Merge "$ROOT/models" "YuE2-3B-IRA-$IRA.gguf"
fi

# HERESY 1689 (Viktor 21.10.2026: «Собирай IRAE* мёрджи, пушай их в IRA репо и прикручивай к загрузчику»): an IRAE merge, IRA with monsterovich's
# Epic Trailer adapter folded in on top (IRAE 0.32 / 0.32, IRAEv2 0.28 / 0.24, IRAEv3 0.5 / 0.375), from the IRA repo at its pin, asked with its size
if [ -n "$IRAE" ]; then
  # HERESY 1708: and IRAE-IR, IRAE-IRv2 (Industrial Rock on top: experimental, highly unstable on lyrics, mostly for rock instrumentals)
  case "$IRAE" in IRAE-BF16|IRAEv2-BF16|IRAEv3-BF16|IRAE-IR-BF16|IRAE-IRv2-BF16) E_SIZE="7.2 GB" ;; IRAE-Q8_0|IRAEv2-Q8_0|IRAEv3-Q8_0|IRAE-IR-Q8_0|IRAE-IRv2-Q8_0) E_SIZE="3.8 GB" ;;
    IRAE-Q6_K|IRAEv2-Q6_K|IRAEv3-Q6_K|IRAE-IR-Q6_K|IRAE-IRv2-Q6_K) E_SIZE="2.9 GB" ;;
    *) echo "${R}--irae takes IRAE, IRAEv2, IRAEv3, IRAE-IR or IRAE-IRv2 with -BF16, -Q8_0 or -Q6_K (IRAEv2-Q8_0)${X}"; exit 2 ;; esac
  asked irae "The $IRAE merge (IRA with monsterovich's Epic Trailer adapter folded in on top: goldhub/YuE2-3B-Ruach_Studio-IRA-Merge)"
  go=1
  if [ $MODE = fetch ] && [ $YES = 0 ] && [ ! -s "$ROOT/models/YuE2-3B-$IRAE.gguf" ]; then
    printf "%s" "Download $E_SIZE? The studio's Engine (Compute) chooses it beside m-a-p's backbones after its next start. [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into_at "models/YuE2-3B-$IRAE.gguf (Ruach Studio's $IRAE merge)" goldhub/YuE2-3B-Ruach_Studio-IRA-Merge "$ROOT/models" "YuE2-3B-$IRAE.gguf"
fi

# HERESY 1794 (Viktor 25.10.2026: «2.4 ep - самый безопасный, и пусть он будет базовой моделью»; «Привязывай все эти варианты в Студию и в
# downloader»): Ruach Studio's own fine-tune, YuE2-RS-FW, folded into m-a-p's base at seven points of its training (epoch x strength), from
# goldhub/YuE2-RS-Finetunes. The install brings the default one, RS-FW 2.4x0.75, at the quant of m-a-p's backbone here (start.sh starts it
# when settings.json names no model); there is no Q5_K_M of it, so a Q5_K_M install keeps m-a-p's alone. --fw fetches any of the seven, asked.
FW_REPO=goldhub/YuE2-RS-Finetunes
if want fw; then
  FWQ=""; for q in BF16 Q8_0 Q6_K; do [ -s "$ROOT/models/YuE2-3B-$q.gguf" ] && { FWQ=$q; break; }; done
  part fw "Ruach Studio's own fine-tune: RS-FW 2.4x0.75, the studio's default"
  if [ -z "$FWQ" ]; then echo "${D}          no BF16, Q8_0 or Q6_K backbone here: m-a-p's alone (there is no Q5_K_M of the fine-tune)${X}"
  else hf_into_at "models/YuE2-3B-RS-FW-2.4x0.75-$FWQ.gguf (Ruach Studio's own fine-tune, the default)" $FW_REPO "$ROOT/models" "YuE2-3B-RS-FW-2.4x0.75-$FWQ.gguf"; fi
fi
if [ -n "$FW" ]; then
  case "$FW" in 0.7x0.75-*|1.5x0.75-*|2.4x0.75-*|3.4x0.7-*|3.4x0.75-*|4.0x0.65-*|4.0x0.7-*) ;; *) FW=none ;; esac
  case "$FW" in *-BF16) F_SIZE="7.2 GB" ;; *-Q8_0) F_SIZE="3.8 GB" ;; *-Q6_K) F_SIZE="2.9 GB" ;;
    *) echo "${R}--fw takes 0.7x0.75, 1.5x0.75, 2.4x0.75, 3.4x0.7, 3.4x0.75, 4.0x0.65 or 4.0x0.7 with -BF16, -Q8_0 or -Q6_K (2.4x0.75-Q8_0)${X}"; exit 2 ;; esac
  asked fw "The RS-FW merge $FW (Ruach Studio's own fine-tune folded into YuE2-3B: $FW_REPO)"
  go=1
  if [ $MODE = fetch ] && [ $YES = 0 ] && [ ! -s "$ROOT/models/YuE2-3B-RS-FW-$FW.gguf" ]; then
    printf "%s" "Download $F_SIZE? The studio's Engine (Compute) chooses it beside m-a-p's backbones after its next start. [y/N] "
    read -r answer; case "$answer" in y|Y|yes|да|Да) ;; *) go=0; echo "${D}          not downloaded${X}" ;; esac
  fi
  [ $go = 1 ] && hf_into_at "models/YuE2-3B-RS-FW-$FW.gguf (Ruach Studio's RS-FW $FW merge)" $FW_REPO "$ROOT/models" "YuE2-3B-RS-FW-$FW.gguf"
fi

# HERESY 1285 (Viktor 09.10.2026: «LoRA пока что не скачались. Только Standard VAE»): the LoRAs the 💎 sets were made with come
# with the install, each under the name their takes use: the Kit's library (11 adapters from 8 repos, 1.3 GB) and the studio's
# own (six voices, the duduk and the shofar, 0.8 GB; HERESY 1445: from goldhub/Ruach_Studio_Models_v2, as goldhub/Ruach_Studio_LoRAs has them)
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
  "$HPY" "$ROOT/heresy/fetch-ruach-loras.py" $([ $MODE = check ] && echo --check) $([ $MODE = replace ] && echo --replace) >"$OWN" 2>&1
  grep -av "^#counts " "$OWN" | grep -av "^[[:space:]]*$"
  # HERESY 1289: its verdicts into the list too, as the others' (the first word the verdict, the rest what and its words)
  if [ -n "$LIST" ]; then
    grep -av "^#counts " "$OWN" | grep -av "^[[:space:]]*$" | sed 's/\x1b\[[0-9;]*m//g' | while read -r st rest; do note "$st" "$rest" ""; done
  fi
  c=$(grep -a "^#counts " "$OWN" | tail -1)
  if [ -n "$c" ]; then
    n() { local v; v=$(echo "$c" | grep -o "$1=[0-9]*" | cut -d= -f2); echo "${v:-0}"; }
    have=$((have + $(n here))); got=$((got + $(n fetched))); miss=$((miss + $(n missing))); failed=$((failed + $(n failed))); odd=$((odd + $(n differs)))   # HERESY 1296
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
