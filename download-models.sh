#!/usr/bin/env bash
# Fetch the GGUF models into ./models with the fast Xet transfer. Nothing is
# written outside this folder: the pinned downloader lives in .venv and every
# cache is pinned to tmp/.
# HERESY 1445 (Viktor 14.10.2026: «Лучше всё тянуть Студии из одного репо, чем бегать по всему инету»): from
# goldhub/Ruach_Studio_Models_v2 at its pin (heresy/hf-revisions.txt), the same files byte for byte as
# Serveurperso/YuE2-GGUF publishes them, laid out as models/ there.
#
#   ./download-models.sh                  BF16 backbone + F32 VAE (7.7 GB)
#   ./download-models.sh --quant Q8_0     Q8_0 backbone instead (3.8 GB)
#   ./download-models.sh --transcriber    also SheetSage2 Q8_0 for covers (1.0 GB)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="goldhub/Ruach_Studio_Models_v2"
QUANT="BF16"
TRANSCRIBER=0
usage() { awk 'NR == 1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${BASH_SOURCE[0]}"; exit 2; }   # the comment block above
while [ $# -gt 0 ]; do
    case "$1" in
        --quant) [ -n "${2:-}" ] && [ "${2#-}" = "$2" ] || { echo "--quant needs a value (BF16, Q8_0, ...)"; usage; }
                 QUANT="$2"; shift ;;
        --transcriber) TRANSCRIBER=1 ;;
        -h|--help) usage ;;
        *) echo "unknown option: $1"; usage ;;
    esac
    shift
done

G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi

# every cache in tmp/, the pinned downloader in .venv (tools/downloader-requirements.txt)
# shellcheck source=tools/hf-env.sh
source "$ROOT/tools/hf-env.sh"
hf_ready || exit 1
REV=$(awk -v k="$REPO" '$1 == k {print $2; exit}' "$ROOT/heresy/hf-revisions.txt" 2>/dev/null)
[ -n "$REV" ] || REV=$(hf_rev "$REPO")

files=("models/YuE2-3B-$QUANT.gguf" "models/YuE2-Vae-F32.gguf")
[ "$TRANSCRIBER" = 1 ] && files+=("models/SheetSage2-Q8_0.gguf")

mkdir -p "$ROOT/models"
start=$(date +%s); got=0; skipped=0; failed=0
for f in "${files[@]}"; do
    if hf_complete "$REPO" "$REV" "$ROOT" --files "$f" >/dev/null; then
        echo "${G}have${X}      $f  ${D}$(du -h "$ROOT/$f" | cut -f1)${X}"
        skipped=$((skipped + 1))
        continue
    fi
    echo "${Y}download${X}  $f"
    "$HF" download --quiet "$REPO" "$f" --revision "$REV" --local-dir "$ROOT" >/dev/null || true
    # the downloader's exit status is not proof: check the file itself
    if hf_complete "$REPO" "$REV" "$ROOT" --files "$f" >/dev/null; then
        echo "${G}done${X}      $f  ${D}$(du -h "$ROOT/$f" | cut -f1)${X}"
        got=$((got + 1))
    else
        echo "${R}failed${X}    $f"
        failed=$((failed + 1))
    fi
done

secs=$(( $(date +%s) - start ))
echo
echo "${B}models${X}  downloaded ${G}$got${X}  already here ${skipped}  failed $([ "$failed" -gt 0 ] && echo "$R")$failed${X}  in ${secs}s"
echo "        folder $(du -sh "$ROOT/models" | cut -f1), disk free $(df -h "$ROOT" | awk 'NR==2 {print $4}')"
[ "$failed" = 0 ]
