#!/usr/bin/env bash
# HERESY 1162: every file of the logo made again in one go, in this folder: the themed logos, the bar's copy and its
# compact cut, the icon, the copies with the Scroll & Brick colours written in (for Inkscape), the icon's pictures, and
# the logo in each language. Python with fontTools (PY=…), Inkscape for the pictures.
#     ./make_all.sh [PAGE_JS]      PAGE_JS: where the page's words go (build/tools/console/heresy-logo-words.js)
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python3}
BAR="FIG=3.0 WAIST=0.42 REACH=0.6 EDGE=0"
# the cloud: the theme's accent with a breath of white (HERESY 1162: 40 % lighter than the quarter of black it had)
DAY="cloud=#942736 word=#8e1a2e on=#ffffff fig=#ffffff fig-shade=#f1ebe3 glow=#ffffff edge=#8e1a2e"
NIGHT="cloud=${NIGHT_CLOUD:-#f17777} word=#f07171 on=#111111 fig=#ffffff fig-shade=#f3ece4 glow=#ffffff edge=#5a1a22"
G=$'\e[1;32m'; X=$'\e[0m'
say() { echo "${G}$*${X}"; }

say "① the logo, themed"
$PY make_logo.py ruach-logo.svg
env $BAR $PY make_logo.py ruach-logo-bar.svg
$PY make_compact.py ruach-logo-bar.svg ruach-logo-bar-compact.svg ratio=1.4 fade=0.12
$PY make_icon.py ruach-logo.svg ruach-icon.svg side=0.66 cy=0.42 square

say "② the copies with their colours written in"
$PY make_logo.py ruach-logo-day-inkscape.svg $DAY
$PY make_logo.py ruach-logo-night-inkscape.svg $NIGHT
env $BAR $PY make_logo.py ruach-logo-bar-day-inkscape.svg $DAY
env $BAR $PY make_logo.py ruach-logo-bar-night-inkscape.svg $NIGHT
$PY make_compact.py ruach-logo-bar-day-inkscape.svg ruach-logo-bar-compact-day-inkscape.svg ratio=1.4 fade=0.12
$PY make_compact.py ruach-logo-bar-night-inkscape.svg ruach-logo-bar-compact-night-inkscape.svg ratio=1.4 fade=0.12
$PY make_icon.py ruach-logo-day-inkscape.svg ruach-icon-day.svg side=0.66 cy=0.42 square
$PY make_icon.py ruach-logo-night-inkscape.svg ruach-icon-night.svg side=0.66 cy=0.42 square

say "③ the icon's pictures (the favicon is the 64)"
for s in 32 64 180 192 512; do
    inkscape ruach-icon-day.svg --export-type=png --export-width=$s --export-filename=ruach-icon-$s.png >/dev/null 2>&1
done

say "④ the logo in each language"
$PY make_words.py --svg
if [ $# -gt 0 ]; then $PY make_words.py "$1"; fi
say "done"
