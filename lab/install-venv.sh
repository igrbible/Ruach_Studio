#!/bin/bash
# HERESY 1080 (Viktor 02.10.2026): the studio has ONE Python environment, Ruach_Studio/.venv, and every
# script and unit names it. This makes it: torch (CUDA 12.8), audio-separator, faster-whisper and the lab's
# requirements; the Kit's downloader (huggingface_hub, pinned in tools/downloader-requirements.txt) and
# its converter's packages (gguf, mir_eval, pretty_midi) live in it too.
#
# HERESY 1167 (Viktor 05.10.2026: «отдельный venv для художника с transformers 5 - это стоит того»): the artist has its own,
# Ruach_Studio/.venv-art, from lab/requirements-art.txt:   install-venv.sh --art   (the art only; a plain run makes both)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
art_venv() {
    local A="$ROOT/.venv-art"
    [ -x "$A/bin/python" ] || python3.12 -m venv "$A"
    "$A/bin/pip" install -q -U pip wheel
    "$A/bin/pip" install -q -r "$ROOT/lab/requirements-art.txt"
    "$A/bin/python" -c "import torch, transformers, diffusers, gguf; print('ok art: torch', torch.__version__, 'cuda', torch.cuda.is_available(), 'transformers', transformers.__version__, 'diffusers', diffusers.__version__)"
}
if [ "${1:-}" = "--art" ]; then art_venv; exit 0; fi
V="$ROOT/.venv"
[ -x "$V/bin/python" ] || python3.12 -m venv "$V"
"$V/bin/pip" install -q -U pip wheel
"$V/bin/pip" install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu128
# HERESY 1137 (found by a fresh install of the release): UniverSR, the upscale's code, is cloned here at the commit
# the studio was tested with and installed from that folder; pip cannot take a relative path in a requirements file
U="$ROOT/vendor/UniverSR"; UREV=d8636623fe0c0704296239c1d3d3c5b911ecb2e0
if [ ! -d "$U/.git" ]; then git clone -q https://github.com/woongzip1/UniverSR.git "$U"; fi
git -C "$U" checkout -q "$UREV"
"$V/bin/pip" install -q -r "$ROOT/lab/requirements.txt"
"$V/bin/pip" install -q -e "$U"
"$V/bin/pip" install -q -r "$ROOT/tools/downloader-requirements.txt" "gguf==0.19.0" "mir_eval==0.8.2" "pretty_midi==0.2.10"
mkdir -p "$ROOT/tmp" && "$V/bin/pip" freeze > "$ROOT/tmp/requirements-installed.txt"   # what went in here; lab/requirements-lock.txt stays the tested set
"$V/bin/python" -c "import torch, audio_separator, soundfile, faster_whisper, huggingface_hub; print('ok torch', torch.__version__, 'cuda', torch.cuda.is_available(), 'audio-separator', __import__('importlib.metadata').metadata.version('audio-separator'), 'hub', huggingface_hub.__version__)"
art_venv                                             # HERESY 1167: and the artist's own
