#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  HERESY · наши патчи поверх YuE2 Kit v12 (Ruach Studio)
#
#  Слово Виктора 30.09.2026: «Наши фичи нужно оформлять патчами… счёт
#  нужен другой, потому что репо свежий, и из апстрима будут патчи
#  добавляться. Давай наш счёт с 1001 начинать».
#
#  В Ките ДВА апстрима, и патчи идут на оба:
#
#      kit/1001-….patch      на репо Кита (IronWolve): страница, скрипты
#      engine/1001-….patch   на yue2.cpp (build/): движок и сервер
#
#  Пуск:
#      ./apply.sh              наложить всё, чего ещё нет
#      ./apply.sh --export     выгрузить коммиты веток heresy в патчи
#      ./apply.sh --status     что наложено, что нет
#
#  ⚠ КОРНЕВЫЕ СКРИПТЫ (start.sh, convert-models.sh…) — НАШИ, В ПАТЧИ НЕ
#    ИДУТ. Слово Виктора: «для .sh скриптов в корне проекта [патчи] не
#    нужны. Просто выправь их. Они и так наши». Правятся напрямую.
#    Апстрим Кита (kit/app/) остаётся нетронутым.
#
#  ⚠ СТРАНИЦА — ЧАСТЬ build/, А НЕ kit/. build.sh собирает её из
#    build/tools/console; kit/page/src — зеркало для раздачи Кита.
#    Собранная страница в патчи НЕ входит (HERESY 1166): сервер читает
#    её с диска, build.sh собирает её из исходников. Патчи до 1166 несут
#    её index.html.gz бинарём, как у самого Кита («Add the built page»).
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
Z="\e[1;32m"; K="\e[1;31m"; S="\e[1;33m"; R="\e[0m"

base_of() {
    case "$1" in
        kit)   git -C "$ROOT/kit" describe --tags --abbrev=0 ;;
        build) echo "${ENGINE_BASE:-603be27}" ;;
    esac
}

# ⛔ СРАВНИВАТЬ ПО patch-id, А НЕ ПО ЗАГОЛОВКУ. Заголовок в .patch
#   закодирован в MIME (=?UTF-8?q?…?=), и кириллица с заголовком коммита
#   не совпадает. Первая редакция сравнивала заголовки — и врала: писала
#   «не наложен» и «наложено 1», хотя патч уже стоял и ничего не менялось.
#   patch-id — хэш самого изменения, ему безразличны и заголовок, и
#   кодировка, и номер строки.
pid_of_file()   { git patch-id --stable < "$1" | cut -d" " -f1; }
pids_of_range() { git -C "$1" log -p --binary --no-merges "$2" | git patch-id --stable | cut -d" " -f1; }
# ⚠ --binary ОБЯЗАТЕЛЕН: без него log показывает бинарь строкой «Binary files differ»,
#   а в .patch он лежит целиком — разное представление, разный patch-id, и
#   наложенный патч с собранной страницей числился бы «не наложенным».

do_export() {
    for pair in kit:kit build:engine; do
        local repo="${pair%%:*}" dir="$HERE/${pair##*:}" base n
        git -C "$ROOT/$repo" rev-parse --verify -q heresy >/dev/null || continue
        base=$(base_of "$repo")
        mkdir -p "$dir"; rm -f "$dir"/*.patch
        n=$(git -C "$ROOT/$repo" rev-list --count "$base..heresy")
        [ "$n" -gt 0 ] && git -C "$ROOT/$repo" format-patch -q --binary --start-number 1001 -o "$dir" "$base..heresy"
        echo -e "${Z}  $repo → ${pair##*:}/: $n патч(ей)${R}"
    done
}

do_status() {
    for pair in kit:kit build:engine; do
        local repo="${pair%%:*}" dir="$HERE/${pair##*:}" done_list
        echo -e "${Z}═══ $repo ═══${R}  ветка $(git -C "$ROOT/$repo" branch --show-current)"
        done_list=$(pids_of_range "$ROOT/$repo" "$(base_of "$repo")..HEAD")
        ls "$dir"/*.patch >/dev/null 2>&1 || { echo "  (патчей нет)"; continue; }
        for p in "$dir"/*.patch; do
            if grep -qxF "$(pid_of_file "$p")" <<< "$done_list"; then
                echo -e "  ${Z}✓${R} $(basename "$p")"
            else
                echo -e "  ${S}·${R} $(basename "$p")  — не наложен"
            fi
        done
    done
}

do_apply() {
    # ⚠ ИДЕМПОТЕНТНО: уже наложенный патч (тот же patch-id в ветке)
    #   пропускается. Иначе повторный запуск ронял бы git am на ровном месте.
    for pair in kit:kit build:engine; do
        local repo="${pair%%:*}" dir="$HERE/${pair##*:}" done_list new=0
        ls "$dir"/*.patch >/dev/null 2>&1 || continue
        if [ -n "$(git -C "$ROOT/$repo" status --porcelain | grep -v '^??' || true)" ]; then
            echo -e "${K}⛔ в $repo/ есть незакоммиченные правки — сперва разберись с ними${R}"; exit 1
        fi
        if git -C "$ROOT/$repo" rev-parse --verify -q heresy >/dev/null; then
            git -C "$ROOT/$repo" checkout -q heresy
        else
            git -C "$ROOT/$repo" checkout -q -b heresy
        fi
        done_list=$(pids_of_range "$ROOT/$repo" "$(base_of "$repo")..heresy")
        for p in "$dir"/*.patch; do
            grep -qxF "$(pid_of_file "$p")" <<< "$done_list" && continue
            git -C "$ROOT/$repo" -c user.name="heresy" -c user.email="heresy@local" am -q --3way "$p" \
                || { echo -e "${K}⛔ $(basename "$p") не лёг в $repo/ — git -C $repo am --abort, и смотреть конфликт${R}"; exit 1; }
            new=$((new+1))
        done
        echo -e "${Z}  $repo: новых наложено $new, всего наших $(ls "$dir"/*.patch | wc -l)${R}"
    done
    echo -e "${S}  Если менялся build/ — пересобрать сервер: cmake --build build/build -j${R}"
}

case "${1:-apply}" in
    --export)    do_export ;;
    --status)    do_status ;;
    apply)       do_apply ;;
    *)           echo -e "${K}ключи: --export · --status · без ключа — наложить${R}"; exit 1 ;;
esac
