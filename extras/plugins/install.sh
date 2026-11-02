#!/bin/bash
# HERESY 1979: a plugin made by someone else that ships with the Studio (extras/plugins/NAME), installed on your word into user/plugins/NAME
# with a Python environment of its own, apart from the Studio's. Run it again later: the plugin's files brought up to date, its environment kept.
#     extras/plugins/install.sh basic-pitch
set -euo pipefail
G="\e[1;32m"; R="\e[1;31m"; Y="\e[1;33m"; X="\e[0m"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT="$(cd "$HERE/../.." && pwd)"
NAME="${1:-}"
if [ -z "$NAME" ] || [ ! -f "$HERE/$NAME/plugin.json" ]; then
    echo -e "${R}which plugin? one of: $(cd "$HERE" && ls -d */ 2>/dev/null | tr -d / | tr '\n' ' ')${X}"; exit 1
fi
DEST="$KIT/user/plugins/$NAME"
mkdir -p "$DEST"
echo -e "${G}── its files into user/plugins/$NAME${X}"
rsync -a --delete --exclude .venv --exclude __pycache__ "$HERE/$NAME/" "$DEST/"
# HERESY 1994: a plugin that names no "python" of its own runs in the Studio's environment (numpy, scipy, soundfile): nothing to make for it
if grep -q '"python"' "$DEST/plugin.json"; then
    PY="${PYTHON:-python3}"
    if [ ! -x "$DEST/.venv/bin/python" ]; then
        echo -e "${G}── its own environment (${PY})${X}"
        "$PY" -m venv "$DEST/.venv"
    fi
    VP="$DEST/.venv/bin/python"
    VER="$("$VP" -c 'import sys; print("%d%02d" % sys.version_info[:2])')"
    echo -e "${G}── what it needs${X}"
    case "$NAME" in
        basic-pitch)
            if [ "$VER" -ge 312 ]; then           # Basic Pitch's TensorFlow has no wheel past Python 3.11: its ONNX Runtime way (its README)
                "$VP" -m pip install -q --no-deps "basic-pitch==0.4.0"
                "$VP" -m pip install -q -r "$DEST/requirements-onnx.txt"
            else
                "$VP" -m pip install -q -r "$DEST/requirements.txt"
            fi ;;
        *)
            [ -f "$DEST/requirements.txt" ] && "$VP" -m pip install -q -r "$DEST/requirements.txt" ;;
    esac
else
    echo -e "${G}── it runs in the Studio's own environment: nothing to install${X}"
fi
echo -e "${G}$NAME is in user/plugins/$NAME: reload the Studio's page, its step is in the Refiner${X}"
echo -e "${Y}to take it away: delete user/plugins/$NAME${X}"
