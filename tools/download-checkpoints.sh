#!/usr/bin/env bash
# The Hugging Face checkpoints ./convert-models.sh turns into this app's GGUF files, into ./checkpoints
# (build/checkpoints links there). About 11.9 GB, at the revisions in tools/hf-revisions.txt; every cache
# stays in tmp/. After converting, the checkpoints are only needed to convert again (the folder can go).
#
#   tools/download-checkpoints.sh           download what is missing or incomplete (safe to run again)
#   tools/download-checkpoints.sh --check   only ask Hugging Face that every repo is there (no download)
#   tools/download-checkpoints.sh --verify  only check the local copies against the pinned file lists
#
# A download counts only when the files are there: every repo is checked against its pinned revision's
# file list (names and sizes), and the sliders against catalog.json (every weight, with its SHA-256).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/checkpoints"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" C="" D="" B="" X=""; fi
# shellcheck source=hf-env.sh
source "$ROOT/tools/hf-env.sh"

# folder | repo | only these files ("" = the whole repo, as upstream's checkpoints.sh does)
REPOS=(
  "YuE2-3B|m-a-p/YuE2-3B|"
  "YuE2-Vae|m-a-p/YuE2-Vae|"
  "YuE2-Vae-legacy|m-a-p/YuE2-Vae-legacy|"
  "SheetSage2|m-a-p/SheetSage2|"
  "MERT-v2-FullSong|m-a-p/MERT-v2-FullSong|"
  "YuE2-Vae-merge-0.666|Mothersuperior/YuE2-Vae-merge-0.666|"
  "particle-sliders|ntc-ai/yue2-particle-sliders|weights/particle-gmix-1600-v2/* catalog.json slider_runtime.py LICENSE* README.md USAGE.md MATH.md"
)

MODE="download"
case "${1:-}" in --check) MODE="check" ;; --verify) MODE="verify" ;; "") ;; *) echo "unknown option: $1"; exit 2 ;; esac
start=$(date +%s); got=0; have=0; failed=0

[ "$MODE" = "download" ] && { hf_ready || exit 1; mkdir -p "$DIR"; }
# --check and --verify write nothing: not even hf_expect.py's file-list cache
[ "$MODE" = "download" ] || export YUE2_HF_CACHE_READONLY=1
red_if() { [ "$1" -gt 0 ] && printf '%s' "$R"; }   # a count that is bad only when it is not 0

for entry in "${REPOS[@]}"; do
  IFS='|' read -r name repo only <<< "$entry"
  rev=$(hf_rev "$repo")
  # the patterns as literal words: read -a never expands * against files in the current folder
  read -r -a pats <<< "$only"
  opts=(); [ ${#pats[@]} -gt 0 ] && opts=(--include "${pats[@]}")
  [ "$name" = "particle-sliders" ] && opts+=(--catalog)

  if [ "$MODE" = "check" ]; then
    info=$(curl -s "https://huggingface.co/api/models/$repo/revision/$rev" || true)
    if printf '%s' "$info" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('sha') and not d.get('gated') else 1)" 2>/dev/null; then
      printf '  %sok%s      %-24s %s\n' "$G" "$X" "$name" "${D}$repo @ ${rev:0:12}${X}"; got=$((got + 1))
    else
      printf '  %smissing%s %-24s %s\n' "$R" "$X" "$name" "${D}$repo @ ${rev:0:12} (not found, or gated: accept its terms and log in)${X}"; failed=$((failed + 1))
    fi
    continue
  fi

  # complete already? (not "some .safetensors is there": the whole pinned file list, by size)
  if [ -d "$DIR/$name" ] && out=$(hf_complete "$repo" "$rev" "$DIR/$name" ${opts[@]+"${opts[@]}"}); then
    printf '  %shave%s    %-24s %s\n' "$G" "$X" "$name" "${D}${out#*: }${X}"; have=$((have + 1)); continue
  fi
  if [ "$MODE" = "verify" ]; then
    printf '  %snot complete%s %s\n' "$R" "$X" "$name"; [ -d "$DIR/$name" ] && printf '%s\n' "$out" | sed 's/^/    /'
    failed=$((failed + 1)); continue
  fi

  echo "  ${Y}download${X} $name  ${D}$repo @ ${rev:0:12}${X}"
  if [ ${#pats[@]} -gt 0 ]; then
    "$HF" download --quiet "$repo" --revision "$rev" --include "${pats[@]}" --local-dir "$DIR/$name" >/dev/null || true
  else
    "$HF" download --quiet "$repo" --revision "$rev" --local-dir "$DIR/$name" >/dev/null || true
  fi
  # the downloader's exit status is not proof: check the files themselves
  if out=$(hf_complete "$repo" "$rev" "$DIR/$name" ${opts[@]+"${opts[@]}"}); then
    printf '  %sdone%s    %-24s %s\n' "$C" "$X" "$name" "${D}${out#*: }${X}"; got=$((got + 1))
  else
    printf '  %sfailed%s  %s  %s\n' "$R" "$X" "$name" "${D}(the download finished but the files are not all there)${X}"
    printf '%s\n' "$out" | sed 's/^/    /'; failed=$((failed + 1))
  fi
done

secs=$(( $(date +%s) - start ))
echo
case "$MODE" in
  check)  echo "${B}checkpoints${X}  on Hugging Face: ${G}$got${X} repos found, $(red_if "$failed")$failed${X} missing  ${D}(${secs}s)${X}" ;;
  verify) echo "${B}checkpoints${X}  complete ${G}$have${X}, not complete $(red_if "$failed")$failed${X}  ${D}(${secs}s)${X}" ;;
  *)
    # the downloader's .cache folders hold its resume data: kept until every repo is complete
    if [ "$failed" = 0 ]; then
      find "$DIR" -name '.cache' -type d -prune -exec rm -rf {} + 2>/dev/null || true
    else
      echo "${D}kept the downloader's resume data (.cache folders): run this again to continue${X}"
    fi
    echo "${B}checkpoints${X}  downloaded ${G}$got${X}  already complete $have  failed $(red_if "$failed")$failed${X}  in ${secs}s"
    echo "             folder $(du -sh "$DIR" | cut -f1), disk free $(df -h "$ROOT" | awk 'NR==2 {print $4}')  ${D}next: ./convert-models.sh${X}" ;;
esac
[ "$failed" = 0 ]
