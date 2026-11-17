#!/bin/bash
# HERESY 2649, the Mac kit (16.11.2026, a tester on an Apple M1): Ruach Studio on macOS with Apple Silicon, double-clicked in Finder.
# RuachStudio.cmd's twin: the first start installs (uv, Python 3.12 and the Studio's .venv inside this folder, then launcher/setup_win.py: the
# lab's packages and the models a song needs, the backbone sized by the Mac's memory), every start runs the lab in the background (its log in
# tmp/logs/lab.log) and the engine in this window (Metal), and opens the Studio in the browser. Closing this window stops the engine.
# macOS ships bash 3.2: nothing newer is used here.
cd "$(dirname "$0")" || exit 1
ROOT="$PWD"
export PYTHONUTF8=1 PYTHONUNBUFFERED=1
UV_VERSION=0.6.14
UV="$ROOT/tmp/uv/uv"

stop() { echo; echo "Ruach Studio: $1"; read -r -p "Press Enter to close this window. " _; exit 1; }
up() { curl -fs -m 2 -o /dev/null "$1"; }

[ "$(uname -m)" = arm64 ] || stop "this kit is for Apple Silicon (M1 and later); an Intel Mac is not supported yet."
# A browser's download carries Apple's quarantine mark: the engine is not signed (by decision), so the mark comes off this folder alone
xattr -dr com.apple.quarantine "$ROOT" 2>/dev/null

if [ ! -x .venv/bin/python ]; then
    echo "Ruach Studio $(cat VERSION 2>/dev/null) · $ROOT"
    if [ ! -x "$UV" ]; then
        echo "-- uv $UV_VERSION (the Python manager), into tmp/uv"
        mkdir -p tmp/uv
        curl -fsSL "https://github.com/astral-sh/uv/releases/download/$UV_VERSION/uv-aarch64-apple-darwin.tar.gz" \
            | tar -xz -C tmp/uv --strip-components 1 || stop "uv did not download: check the internet and start again."
    fi
    export UV_PYTHON_INSTALL_DIR="$ROOT/tmp/python" UV_CACHE_DIR="$ROOT/tmp/uv-cache"
    echo "-- Python 3.12 and the Studio's .venv"
    "$UV" venv --python 3.12 --seed .venv || stop "uv could not make .venv."
    .venv/bin/python launcher/setup_win.py "$@" || stop "the install stopped. The lines above say why; start RuachStudio.command again to go on where it stopped."
fi

mkdir -p tmp/logs
if ! up http://127.0.0.1:41870/health; then
    echo "-- the lab, in the background (tmp/logs/lab.log)"
    nohup .venv/bin/python lab/lab.py >> tmp/logs/lab.log 2>&1 &
fi
if up http://127.0.0.1:7777/hardware; then
    echo "The engine already runs: opening the Studio."
    open http://127.0.0.1:7777
    exit 0
fi
# the browser opens once the engine answers (up to five minutes); the engine itself runs in this window
( t=0; while [ $t -lt 300 ]; do up http://127.0.0.1:7777/hardware && { open http://127.0.0.1:7777; exit 0; }; sleep 2; t=$((t + 2)); done
  echo "The Studio did not answer in 5 minutes: the lines above say why." ) &
exec .venv/bin/python launcher/start.py
