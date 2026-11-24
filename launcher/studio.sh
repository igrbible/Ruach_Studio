#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): the Studio's server in this terminal through start.sh, as its systemd unit runs it
# (systemd/ruach-studio.service). A studio that answers already on its port is left alone; this terminal only says where.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${YUE2CPP_PORT:-7777}"
if curl -sf -m 3 -o /dev/null "http://127.0.0.1:$PORT/hardware"; then
    echo "[Server] Listening on http://127.0.0.1:$PORT (started elsewhere: its systemd unit or ./start.sh); Stop here leaves it running"
    exec sleep infinity
fi
. "$ROOT/launcher/env.sh"
# HERESY 2980 (a tester's debug journal, Windows native 2.1.0-rc1, 23.11.2026: its studio.log and lab.log said «no journal … [WinError 2]» and nothing else): the engine's lines to tmp/logs/engine.log too
LOG="$ROOT/tmp/logs/engine.log"; mkdir -p "$ROOT/tmp/logs"
[ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 4000000 ] && mv -f "$LOG" "$ROOT/tmp/logs/engine.1.log"
bash "$ROOT/start.sh" 2>&1 | tee -a "$LOG"
echo "ruach start stopped: the Studio's server ended (exit ${PIPESTATUS[0]}); its last lines are above"
