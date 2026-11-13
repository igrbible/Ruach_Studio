#!/bin/bash
# Ruach Studio · tools/narrator-higgs-setup.sh — the Narrator's second engine made ready on this machine: Boson AI's Higgs TTS 3 (2.0.8)
#
#   bash tools/narrator-higgs-setup.sh           what is here; its Python made if it is not; then, after your yes to Boson's licence, the model
#                                                fetched from Boson's own repos if it is not here
#   bash tools/narrator-higgs-setup.sh --check   0 when its Python and the model are both here, 1 when not (says which)
#   bash tools/narrator-higgs-setup.sh --python [--cpu]   only its Python: .venv-read with torch and transformers 5; for the card when an
#                                                NVIDIA driver is here (CUDA 12.8 wheels), else for the processor; --cpu: the processor's even beside a card
#   bash tools/narrator-higgs-setup.sh --venv DIR   another folder for its Python (a test), instead of .venv-read
#   bash tools/narrator-higgs-setup.sh --yes     Boson's licence accepted without the question (you read it: docs/NARRATOR-HIGGS.md)
#
# Higgs TTS 3 is Boson AI's (Boson Higgs TTS 3 Research and Non-Commercial License; its tokenizer under the Boson Higgs Audio 2 Community
# License). Ruach Studio mirrors none of it: the model comes from bosonai/higgs-tts-3-4b and bosonai/higgs-audio-v2-tokenizer at the release's
# pins (heresy/fetch-heresy.sh --higgs bf16; in the Studio Engine → Models → Narrator · Higgs TTS 3). A gated repo: HF_TOKEN=hf_… in this
# command's environment alone, never kept. Needs: Python 3.10 or newer with venv, about 5 GB for its Python (CUDA wheels; 1 GB for the
# processor's) and 10.2 GB for the model. (Claude, night 11→12.11.2026)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/launcher/paths.sh"   # HERESY 2519: the Narrator's folder from the one file of places (lab/test_paths.py)
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi
DO=all; CPU=0; YES=0; VENV="$ROOT/.venv-read"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) DO=check ;; --python) DO=python ;; --cpu) CPU=1 ;; --yes) YES=1 ;;
    --venv) VENV="${2:-}"; shift ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 2 ;;
  esac
  shift
done
case "$VENV" in /*) ;; *) VENV="$ROOT/$VENV" ;; esac
PY="$VENV/bin/python"
TORCH=2.11.0; TRANSFORMERS=5.19.0             # what the Narrator was proven with (11.11.2026: Whisper heard all three test pieces word for word)
M="$RS_NARRATOR/higgs-tts-3-4b"; C="$RS_NARRATOR/higgs-audio-v2-tokenizer"

python_ok() {   # torch, torchaudio, transformers 5.5 or newer, soundfile and numpy importable in its Python
  [ -x "$PY" ] && "$PY" - <<'EOF' >/dev/null 2>&1
import torch, torchaudio, soundfile, numpy, safetensors, transformers
v = tuple(int(x) for x in transformers.__version__.split(".")[:2])
raise SystemExit(0 if v >= (5, 5) else 1)
EOF
}
model_ok() {
  local f
  for f in "$M/model.safetensors" "$M/tokenizer.json" "$M/config.json" "$M/configuration_higgs_multimodal_qwen3.py" \
           "$M/modeling_higgs_multimodal_qwen3.py" "$M/LICENSE" "$C/model.safetensors" "$C/config.json" "$C/LICENSE"; do
    [ -f "$f" ] || return 1
  done
}
say_state() {
  if python_ok; then echo "${G}✓${X} its Python: $PY (transformers $("$PY" -c 'import transformers; print(transformers.__version__)' 2>/dev/null))"
  else echo "${Y}·${X} its Python is not ready: $PY (torch, torchaudio and transformers 5.5 or newer)"; fi
  if model_ok; then echo "${G}✓${X} the model and its tokenizer, each with Boson's LICENSE: ${M#"$ROOT"/}, ${C##*/}"
  else echo "${Y}·${X} the model is not all here: ${M#"$ROOT"/} and ${C##*/} (docs/NARRATOR-HIGGS.md says what goes where)"; fi
}

make_python() {
  local base py idx
  for py in python3.12 python3.11 python3.10 python3; do
    command -v "$py" >/dev/null 2>&1 && "$py" -c 'import sys, venv; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null && { base="$py"; break; }
  done
  [ -n "${base:-}" ] || { echo "${R}Python 3.10 or newer with venv is needed (apt install python3-venv)${X}"; return 1; }
  if [ "$CPU" = 0 ] && command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then idx=https://download.pytorch.org/whl/cu128; echo "${B}its Python for the card${X} (CUDA 12.8 wheels, about 5 GB) into $VENV"
  else idx=https://download.pytorch.org/whl/cpu; echo "${B}its Python for the processor${X} (about 1 GB) into $VENV"; fi
  [ -x "$PY" ] || "$base" -m venv "$VENV" || { echo "${R}the venv could not be made in $VENV${X}"; return 1; }
  "$PY" -m pip install -q --upgrade pip || return 1
  "$PY" -m pip install -q "torch==$TORCH" "torchaudio==$TORCH" --index-url "$idx" || { echo "${R}torch $TORCH did not install from $idx${X}"; return 1; }
  "$PY" -m pip install -q "transformers==$TRANSFORMERS" soundfile numpy safetensors accelerate || { echo "${R}transformers $TRANSFORMERS did not install${X}"; return 1; }
  python_ok || { echo "${R}its Python is there, but torch or transformers do not import: $PY${X}"; return 1; }
  echo "${G}✓${X} its Python is ready: $PY"
}

fetch_model() {
  cat <<EOF

${B}Boson AI's Higgs TTS 3${X} comes from Boson's own repositories, under Boson's licences (read them: docs/NARRATOR-HIGGS.md, and the LICENSE
files that come beside the model). In short: research and non-commercial use; your own creative work may be published and monetized with
«This audio was created with Boson AI's Higgs Audio» in the audio or prominently beside it; hosting it for others, a product for third parties
or any other commercial use needs Boson's written licence; nothing it makes may train any model; no real person's voice without their
explicit, verifiable consent. Ruach Studio breaks none of these terms, mirrors nothing and keeps no token of yours.
EOF
  if [ "$YES" != 1 ]; then
    [ -t 0 ] || { echo "${Y}no terminal to ask in: run it again with --yes once you have read the licence${X}"; return 1; }
    read -r -p "Accept Boson's licences and fetch the model (10.2 GB)? [y/N] " a
    case "$a" in y|Y|yes|д|Д|да|так) ;; *) echo "nothing fetched"; return 1 ;; esac
  fi
  bash "$ROOT/heresy/fetch-heresy.sh" --only none --higgs bf16
}

case "$DO" in
  check) say_state; python_ok && model_ok; exit $? ;;
  python) python_ok && { say_state; exit 0; }; make_python; exit $? ;;
esac
say_state
python_ok || make_python || exit 1
model_ok || fetch_model || exit 1
model_ok || { echo "${R}the model is still not all here${X}"; exit 1; }
echo "${G}✓ the Narrator can read with Higgs TTS 3${X}: in the Narrator's room, the engine «Boson AI Higgs TTS 3»"
