#!/bin/bash
# Ruach Studio · fetch-models.sh — every weight in one go: YuE2 (m-a-p's models as GGUF), then the studio's own.
#
#   ./fetch-models.sh                     BF16 backbone + F32 VAE + SheetSage2, then heresy/fetch-heresy.sh
#   ./fetch-models.sh --quant Q8_0        a Q8_0 backbone instead (3.8 GB; for 12-16 GB cards)
#   ./fetch-models.sh --check             say what is here and what is missing, download nothing
#
# The first part is ./download-models.sh (the Kit's downloader: pinned, every file checked after download); ours is
# heresy/fetch-heresy.sh (the extra decoders and the sliders, converted once, from goldhub/Ruach_Studio_Models_v2; Whisper,
# the stems' models, UniverSR, the LoRAs). Both are safe to run again: what is here stays.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK=0; KIT_ARGS=(--transcriber)
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --quant) [ -n "${2:-}" ] || { echo "--quant needs a value: BF16, Q8_0, Q6_K, Q5_K_M"; exit 2; }
             KIT_ARGS+=(--quant "$2"); shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 2 ;;
  esac
  shift
done
B=$'\e[1m' X=$'\e[0m'; if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then B="" X=""; fi
rc=0

echo "${B}1 · YuE2: m-a-p's models as GGUF (Serveurperso/YuE2-GGUF)${X}"
if [ $CHECK = 1 ]; then
  for f in "$ROOT"/models/YuE2-3B-*.gguf "$ROOT"/models/YuE2-Vae-F32.gguf "$ROOT"/models/SheetSage2-*.gguf; do
    [ -s "$f" ] && echo "here      ${f#"$ROOT"/}" || { echo "missing   ${f#"$ROOT"/}"; rc=1; }
  done
  echo "(a full check against the pinned files: tools/verify-install.sh --quick)"
else
  "$ROOT/download-models.sh" "${KIT_ARGS[@]}" || rc=1
fi

echo; echo "${B}2 · Ruach Studio's own${X}"
"$ROOT/heresy/fetch-heresy.sh" $([ $CHECK = 1 ] && echo --check) || rc=1

exit $rc
