#!/bin/bash
# yt-audio.sh · the audio of videos, as the site has it, for an instrument set (Ruach Studio extras)
#
#   extras/yt-audio.sh DIR LINK [LINK ...]      links or video ids
#   extras/yt-audio.sh DIR -f links.txt         one link a line; # starts a comment
#
# Only the one video of each link (a playlist or a "mix" in the link is ignored; a live broadcast is skipped: it
# would be recorded in real time, without end), its best audio stream without
# re-encoding, and its page's info as JSON beside it (title, channel, description: where the sound came from).
# Uses the studio's own yt-dlp (.venv, lab/requirements.txt) and node as YouTube's JS runtime.
# Mind the rights of what you fetch: a LoRA trained on someone's recording is for you, not for publishing.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YTDLP="$ROOT/.venv/bin/yt-dlp"
G="\e[1;32m"; R="\e[1;31m"; Y="\e[1;33m"; N="\e[0m"

[ $# -ge 2 ] || { echo "usage: $0 DIR LINK [LINK ...]  |  $0 DIR -f links.txt"; exit 2; }
dir="$1"; shift
if [ "$1" = "-f" ]; then
    [ -f "$2" ] || { echo -e "${R}no such file: $2${N}"; exit 2; }
    mapfile -t links < <(grep -v '^\s*#' "$2" | grep -v '^\s*$')
else
    links=("$@")
fi
[ -x "$YTDLP" ] || { echo -e "${R}no yt-dlp in the studio's .venv: .venv/bin/pip install -r lab/requirements.txt${N}"; exit 1; }
node=$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)
[ -n "$node" ] || echo -e "${Y}no node found: YouTube may refuse some formats without a JS runtime${N}"

mkdir -p "$dir" && cd "$dir" || exit 1
ok=0; bad=0; live=0
said=$(mktemp)
for l in "${links[@]}"; do
    if "$YTDLP" --no-playlist --match-filters "!is_live & live_status != is_upcoming" -f bestaudio --write-info-json --no-progress ${node:+--js-runtimes "node:$node"} \
        -o "%(id)s.%(ext)s" -- "$l" 2>&1 | tee "$said"; [ "${PIPESTATUS[0]}" -eq 0 ]; then
        if grep -q "does not pass filter" "$said"; then live=$((live + 1)); echo -e "${Y}  – $l: a live broadcast, skipped${N}"
        else ok=$((ok + 1)); echo -e "${G}  ✓ $l${N}"; fi
    else bad=$((bad + 1)); echo -e "${R}  ✗ $l${N}"; fi
done
rm -f "$said"
echo -e "${G}$ok fetched${N} into $(pwd)$( [ $live -gt 0 ] && echo -e ", ${Y}$live live skipped${N}")$( [ $bad -gt 0 ] && echo -e ", ${R}$bad failed${N}")"
[ $bad -eq 0 ]
