#!/bin/bash
# Installs Ruach Studio's systemd user units, with the studio's real place written in (no path is
# fixed in the templates: move the studio, run this again). Starts nothing: see what it prints.
#   ./systemd/install-units.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DEST="$HOME/.config/systemd/user"
Z="\e[1;32m"; S="\e[1;33m"; R="\e[0m"
mkdir -p "$DEST"
for u in ruach-studio.service heresy-lab.service; do
    sed "s|@ROOT@|$ROOT|g" "$HERE/$u" > "$DEST/$u.part" && mv "$DEST/$u.part" "$DEST/$u"
    chmod 644 "$DEST/$u"
    echo -e "${Z}  ✓ $u → $DEST${R}  (root: $ROOT)"
done
# HERESY 1102: openDAW's unit is gone with openDAW (the DAW now is the user's own: REAPER or Waveform)
if [ -f "$DEST/ruach-daw.service" ]; then
    systemctl --user disable --now ruach-daw.service 2>/dev/null || true
    rm -f "$DEST/ruach-daw.service"
    echo -e "${Z}  ✓ ruach-daw.service removed (openDAW is no longer part of the studio)${R}"
fi
# the unit's earlier name, from the YuE2 Kit days
if [ -f "$DEST/yue2-kit.service" ]; then
    systemctl --user disable --now yue2-kit.service 2>/dev/null || true
    rm -f "$DEST/yue2-kit.service"
    echo -e "${Z}  ✓ yue2-kit.service removed (now ruach-studio.service)${R}"
fi
systemctl --user daemon-reload
echo
echo -e "${S}Next, one step at a time:${R}"
echo "  1. stop what holds the ports now: a server started by hand (Ctrl-C in its terminal), a lab started by hand:"
echo "       ./lab/start-lab.sh stop"
echo "  2. turn both on:"
echo "       systemctl --user enable --now heresy-lab ruach-studio"
echo "  3. to live without a login and come up at boot (once, needs sudo):"
echo "       sudo loginctl enable-linger \$USER"
echo "  logs:  journalctl --user -u ruach-studio -f   ·   journalctl --user -u heresy-lab -f"
