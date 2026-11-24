#!/bin/bash
# Ruach Studio under Pinokio (HERESY 1259): the lab, the Studio's Python neighbour, in this terminal as its systemd unit runs it
# (systemd/heresy-lab.service). A lab that answers already (its unit, a hand start) is left alone; this terminal only says so.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${LAB_PORT:-41870}"
if curl -sf -m 3 "http://127.0.0.1:$PORT/health" >/dev/null; then
    echo "heresy-lab already on :$PORT (started elsewhere: its systemd unit or ./lab/start-lab.sh); Stop here leaves it running"
    exec sleep infinity
fi
cd "$ROOT/lab" || exit 1
export PYTHONUNBUFFERED=1
# HERESY 2980 (a tester's debug journal, Windows native 2.1.0-rc1, 23.11.2026: its studio.log and lab.log said «no journal … [WinError 2]» and nothing else): under Pinokio the lab's lines go to tmp/logs/lab.log
# too (the debug journal reads it where there is no systemd journal); past 4 MB the file goes to lab.1.log at the next start
LOG="$ROOT/tmp/logs/lab.log"; mkdir -p "$ROOT/tmp/logs"
[ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 4000000 ] && mv -f "$LOG" "$ROOT/tmp/logs/lab.1.log"
export RUACH_LAUNCHER=pinokio   # HERESY 1362: the page's updater sends the user to Pinokio's own Update
"$ROOT/.venv/bin/python" "$ROOT/lab/lab.py" 2>&1 | tee -a "$LOG"
echo "ruach start stopped: the lab ended (exit ${PIPESTATUS[0]}); its last lines are above"
