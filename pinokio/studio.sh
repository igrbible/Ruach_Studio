#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): the studio's server in this terminal through start.sh, as its systemd unit runs it
# (systemd/ruach-studio.service). A studio that answers already on its port is left alone; this terminal only says where.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${YUE2CPP_PORT:-41867}"
if curl -sf -m 3 -o /dev/null "http://127.0.0.1:$PORT/hardware"; then
    echo "[Server] Listening on http://127.0.0.1:$PORT (started elsewhere: its systemd unit or ./start.sh); Stop here leaves it running"
    exec sleep infinity
fi
. "$ROOT/pinokio/env.sh"
bash "$ROOT/start.sh"
echo "ruach start stopped: the studio's server ended (exit $?); its last lines are above"
