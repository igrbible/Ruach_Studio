#!/bin/bash
# heresy-lab: the studio's Python neighbour (port 41870, LAB_PORT to change it). Log in lab/lab.log.
#   ./lab/start-lab.sh          start (or say it is already running)
#   ./lab/start-lab.sh stop     stop
# In production it is the systemd user unit heresy-lab (systemd/install-units.sh); this is for a hand start.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$HERE/../.venv/bin/python"   # HERESY 1080: the studio's one environment
PORT="${LAB_PORT:-41870}"
pid_of() { for p in /proc/[0-9]*; do cat "$p/cmdline" 2>/dev/null | tr "\0" " " | grep -q "$HERE/lab.py" && echo "${p#/proc/}"; done; }   # a process may end while it is read
if [ "${1:-}" = stop ]; then P=$(pid_of); [ -n "$P" ] && kill $P && echo "heresy-lab остановлен ($P)" || echo "heresy-lab не запущен"; exit 0; fi
P=$(pid_of); [ -n "$P" ] && { echo "heresy-lab уже работает ($P), порт $PORT"; exit 0; }
cd "$HERE" && (setsid nohup "$PY" "$HERE/lab.py" >> "$HERE/lab.log" 2>&1 &)
sleep 1; curl -s "http://127.0.0.1:$PORT/health" && echo
