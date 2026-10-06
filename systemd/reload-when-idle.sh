#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  RELOAD · перезапуск Студии или лабы, когда они пусты
#
#  Слово Виктора 05.10.2026: «Может и reload для сисюнитов докрутишь?»
#  Рестарт сервиса посреди дубля роняет очередь движка: она живёт в его
#  памяти, и кто ждал своё задание, ждёт уже несуществующее.
#
#      systemctl --user reload ruach-studio   перезапуск, когда движок пуст:
#                                             ничего не рендерит три замера подряд
#                                             (ждущий в очереди сразу встаёт на
#                                             место законченного, так что «не занят»
#                                             значит и «никто не ждёт»)
#      systemctl --user reload heresy-lab     перезапуск, когда у лабы нет работ
#                                             (/health: "jobs": {})
#
#  ExecReload сам не ждёт (systemd оборвал бы его по таймауту): он ставит
#  ожидающего отдельным юнитом (ruach-reload-studio / ruach-reload-lab),
#  тот дожидается пустоты и делает restart. Повторный reload, пока ждущий
#  жив, ничего не плодит. Ход ожидания: journalctl --user -u ruach-reload-studio
#
#  Руками:  reload-when-idle.sh studio|lab          поставить ждущего
#           reload-when-idle.sh studio|lab --wait   ждать здесь же
# ══════════════════════════════════════════════════════════════════
set -uo pipefail
WHAT="${1:-}"; MODE="${2:-}"
G="\e[1;32m"; Y="\e[1;33m"; R="\e[1;31m"; X="\e[0m"
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G=""; Y=""; R=""; X=""; fi
case "$WHAT" in
    studio) UNIT=ruach-studio.service; PORT="${YUE2CPP_PORT:-41867}" ;;
    lab)    UNIT=heresy-lab.service;   PORT="${HERESY_LAB_PORT:-41870}" ;;
    *)      echo -e "${R}reload-when-idle.sh studio|lab [--wait]${X}"; exit 2 ;;
esac

idle() {   # пусто ли сейчас: да — 0
    if [ "$WHAT" = studio ]; then
        curl -s -m 5 "http://127.0.0.1:$PORT/hardware" | grep -q '"busy":false'
    else
        curl -s -m 5 "http://127.0.0.1:$PORT/health" | grep -q '"jobs": {}'
    fi
}

if [ "$MODE" != "--wait" ]; then
    SELF="$(readlink -f "${BASH_SOURCE[0]}")"
    if systemctl --user is-active --quiet "ruach-reload-$WHAT"; then
        echo -e "${Y}ждущий уже стоит: ruach-reload-$WHAT${X}"; exit 0
    fi
    systemctl --user reset-failed "ruach-reload-$WHAT" 2>/dev/null
    systemd-run --user --quiet --collect --unit="ruach-reload-$WHAT" --setenv=NO_COLOR=1 "$SELF" "$WHAT" --wait
    echo -e "${G}$UNIT перезапустится, когда будет пуст (journalctl --user -u ruach-reload-$WHAT)${X}"
    exit 0
fi

echo "ждём, пока $UNIT пуст…"
calm=0; t0=$(date +%s)
while [ "$calm" -lt 3 ]; do
    if idle; then calm=$((calm + 1)); else
        [ "$calm" -gt 0 ] || [ $(( ($(date +%s) - t0) % 60 )) -ne 0 ] || echo "  занят, ждём ($(( $(date +%s) - t0 )) с)"
        calm=0
    fi
    sleep 1
done
echo "пуст: restart $UNIT (ждали $(( $(date +%s) - t0 )) с)"
exec systemctl --user restart "$UNIT"
