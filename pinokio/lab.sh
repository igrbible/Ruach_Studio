#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): the lab, the studio's Python neighbour, in this terminal as its systemd unit runs it
# (systemd/heresy-lab.service). A lab that answers already (its unit, a hand start) is left alone; this terminal only says so.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${LAB_PORT:-41870}"
if curl -sf -m 3 "http://127.0.0.1:$PORT/health" >/dev/null; then
    echo "heresy-lab already on :$PORT (started elsewhere: its systemd unit or ./lab/start-lab.sh); Stop here leaves it running"
    exec sleep infinity
fi
cd "$ROOT/lab" || exit 1
export PYTHONUNBUFFERED=1
"$ROOT/.venv/bin/python" "$ROOT/lab/lab.py"
echo "ruach start stopped: the lab ended (exit $?); its last lines are above"
