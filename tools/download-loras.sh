#!/usr/bin/env bash
# The LoRA library: 11 LoRA files from 8 Hugging Face repos (about 1.3 GB) into ./loras, one folder
# each, with the small side files the app reads (trigger words, alpha, training mode), at the revisions
# in tools/hf-revisions.txt. The folder names matter: loras/sources.json is keyed by them.
#
#   tools/download-loras.sh           download what is missing or incomplete (safe to run again)
#   tools/download-loras.sh --check   only ask Hugging Face that every file is still there (no download)
#   tools/download-loras.sh --verify  only check the local files against the pinned sizes
#
# A file counts only when it is there with the pinned revision's exact size, before and after download.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" C="" D="" B="" X=""; fi
# shellcheck source=hf-env.sh
source "$ROOT/tools/hf-env.sh"

# folder | repo | folder inside the repo ("" = its top) | files
LORAS=(
  "YuE2-instrumental-cot-full-loras|Mothersuperior/YuE2-instrumental-cot-full-loras||README.md ar_lora_inst_v3abc.bf16.safetensors"
  "YuE2_Deathmetalv1_lora|pduncan/YuE2_Deathmetalv1_lora||README.md deathmetalv1_step-000600.safetensors"
  "sv-billie-yue2-lora|HaileyStorm/sv-billie-yue2-lora||README.md lora.json sv_billie.safetensors"
  "sv-dreampop|atomtanstudio/lora-library|yue2/dreampop|lora.json dreampop_sv_dreampop.safetensors"
  "yue2-industrial-rock-lora|monsterovich/yue2-industrial-rock-lora||README.md adapter-ar-179/adapter_config.json adapter-ar-179/lora.safetensors adapter-nar-179-v2/adapter_config.json adapter-nar-179-v2/lora.safetensors"
  "yue2-jpop-t4-lora|storagejuju/yue2-jpop-t4-lora||README.md training_config.json yue2_jpop_t4.safetensors"
  "yue2-mothersuperior-realaudio-tokenizer-v4|Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4||README.md nar_lora_joint_v4.bf16.safetensors nar_lora_joint_v9.bf16.safetensors"
  "yue2-steps-from-hell|monsterovich/yue2-steps-from-hell||README.md adapter-ar-195/adapter_config.json adapter-ar-195/lora.safetensors adapter-nar-194/adapter_config.json adapter-nar-194/lora.safetensors"
)

MODE="download"
case "${1:-}" in --check) MODE="check" ;; --verify) MODE="verify" ;; "") ;; *) echo "unknown option: $1"; exit 2 ;; esac
start=$(date +%s); got=0; have=0; failed=0; bytes=0
# only a download writes into the install; --check and --verify write nothing (not even hf_expect.py's
# file-list cache)
if [ "$MODE" = "download" ]; then
  mkdir -p "$ROOT/loras" "$ROOT/tmp"
  hf_ready || exit 1
else
  export YUE2_HF_CACHE_READONLY=1
fi
red_if() { [ "$1" -gt 0 ] && printf '%s' "$R"; }   # a count that is bad only when it is not 0

for entry in "${LORAS[@]}"; do
  IFS='|' read -r folder repo sub files <<< "$entry"
  rev=$(hf_rev "$repo")
  read -r -a names <<< "$files"
  paths=(); for f in "${names[@]}"; do paths+=("${sub:+$sub/}$f"); done
  strip=(); [ -n "$sub" ] && strip=(--strip "$sub/")
  echo "${B}${folder}${X}  ${D}${repo}${sub:+ / $sub} @ ${rev:0:12}${X}"

  if [ "$MODE" = "check" ]; then
    for i in "${!names[@]}"; do
      f="${names[$i]}" path="${paths[$i]}"
      head=$(curl -sI "https://huggingface.co/$repo/resolve/$rev/$path" || true)
      code=$(printf '%s' "$head" | awk 'NR==1 {print $2}')
      # big files report their size in x-linked-size; small text files are just "small"
      # the first x-linked-size, in awk itself: "| head -1" could fail the pipeline under pipefail
      size=$(printf '%s' "$head" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-linked-size" && !n++ {print $2}')
      ok_codes='^(200|302|307)$'    # in a variable: bash 3.2 (macOS /bin/bash) cannot parse ( ) inline here
      if [[ "$code" =~ $ok_codes ]]; then
        printf '  %sok%s      %-52s %s\n' "$G" "$X" "$f" "${D}$([ -n "$size" ] && human "$size" || echo small)${X}"
        got=$((got + 1)); bytes=$((bytes + ${size:-0}))
      else
        printf '  %smissing%s %-52s %s\n' "$R" "$X" "$f" "${D}HTTP ${code:-none}${X}"; failed=$((failed + 1))
      fi
    done
    continue
  fi

  # complete already? every file there with the pinned size
  if out=$(hf_complete "$repo" "$rev" "$ROOT/loras/$folder" --files "${paths[@]}" ${strip[@]+"${strip[@]}"}); then
    printf '  %shave%s    %s\n' "$G" "$X" "${D}${out#*: }${X}"; have=$((have + ${#names[@]})); continue
  fi
  if [ "$MODE" = "verify" ]; then
    printf '%s\n' "$out" | sed 's/^/  /'; failed=$((failed + 1)); continue
  fi

  for i in "${!names[@]}"; do
    f="${names[$i]}" path="${paths[$i]}"
    # skip a file only when it alone already checks out
    if hf_complete "$repo" "$rev" "$ROOT/loras/$folder" --files "$path" ${strip[@]+"${strip[@]}"} >/dev/null; then
      printf '  %shave%s    %s\n' "$G" "$X" "$f"; have=$((have + 1)); continue
    fi
    if [ -z "$sub" ]; then
      "$HF" download --quiet "$repo" "$path" --revision "$rev" --local-dir "$ROOT/loras/$folder" >/dev/null || true
    else
      # a folder inside the repo: fetch into tmp/, then move the file up into loras/<folder>/
      stage="$ROOT/tmp/lora-download/$folder"
      if "$HF" download --quiet "$repo" "$path" --revision "$rev" --local-dir "$stage" >/dev/null && [ -f "$stage/$path" ]; then
        mkdir -p "$(dirname "$ROOT/loras/$folder/$f")" && mv "$stage/$path" "$ROOT/loras/$folder/$f"
      fi
    fi
    # the downloader's exit status is not proof: check the file itself
    if hf_complete "$repo" "$rev" "$ROOT/loras/$folder" --files "$path" ${strip[@]+"${strip[@]}"} >/dev/null; then
      s=$(fsize "$ROOT/loras/$folder/$f"); bytes=$((bytes + s)); got=$((got + 1))
      printf '  %sdone%s    %-52s %s\n' "$C" "$X" "$f" "${D}$(human "$s")${X}"
    else
      printf '  %sfailed%s  %s %s\n' "$R" "$X" "$f" "${D}(missing or the wrong size after the download)${X}"; failed=$((failed + 1))
    fi
  done
done
[ "$MODE" = "download" ] && rm -rf "$ROOT/tmp/lora-download"

secs=$(( $(date +%s) - start ))
echo
case "$MODE" in
  check)  echo "${B}loras${X}  on Hugging Face: ${G}$got${X} files found, $(red_if "$failed")$failed${X} missing  ${D}($(human $bytes) in all, ${secs}s)${X}" ;;
  verify) echo "${B}loras${X}  complete files ${G}$have${X}, folders not complete $(red_if "$failed")$failed${X}  ${D}(${secs}s)${X}" ;;
  *)
    echo "${B}loras${X}  downloaded ${G}$got${X} ($(human $bytes))  already complete $have  failed $(red_if "$failed")$failed${X}  in ${secs}s"
    echo "       $(find -L "$ROOT/loras" -name '*.safetensors' -not -path '*/.*' | wc -l | tr -d ' ') LoRA files, folder $(du -shL "$ROOT/loras" | cut -f1), disk free $(df -h "$ROOT" | awk 'NR==2 {print $4}')"
    [ -f "$ROOT/loras/sources.json" ] || echo "       ${Y}loras/sources.json is missing${X} ${D}(copy it from the kit: names, blurbs, links and recaps)${X}" ;;
esac
[ "$failed" = 0 ]
