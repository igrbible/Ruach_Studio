#!/usr/bin/env bash
# HERESY 1274 (Viktor 09.10.2026: «abcjs и шрифты ложи всё в репо. abcjs периодически проверять на новые релизы. Минимум интернета из
# Студии на локальной машине»): what the studio carries of others' — abcjs in the page, the fonts the lab serves — against what is out now.
#     heresy/tools/check-vendored.sh            abcjs: ours against npm's latest (the fonts change seldom: --fonts takes them again)
#     heresy/tools/check-vendored.sh --abcjs    npm's latest abcjs into build/tools/console/vendor/ (then commit in build/ and ./build.sh)
#     heresy/tools/check-vendored.sh --fonts    the ten families again from Google Fonts, the same subsets: lab/fonts/ and vendor/fonts.css
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
V="$ROOT/build/tools/console/vendor"
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
G=$'\e[1;32m'; Y=$'\e[1;33m'; R=$'\e[1;31m'; X=$'\e[0m'

ours=$(head -c 200 "$V/abcjs-basic-min.js" | grep -o 'v[0-9][0-9.]*' | head -1 | tr -d v)
latest=$(curl -s -m 20 https://registry.npmjs.org/abcjs/latest | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
if [ -z "$latest" ]; then
    echo "${R}abcjs: npm did not answer${X} (ours ${ours:-?})"
elif [ "$ours" = "$latest" ]; then
    echo "${G}abcjs ${ours}: the latest${X}"
else
    echo "${Y}abcjs ${ours} here, ${latest} on npm${X}: heresy/tools/check-vendored.sh --abcjs takes it (its CHANGELOG: https://github.com/paulrosen/abcjs/releases)"
fi

if [ "${1:-}" = "--abcjs" ] && [ -n "$latest" ]; then
    tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
    url=$(curl -s -m 20 "https://registry.npmjs.org/abcjs/$latest" | grep -o '"tarball":"[^"]*"' | head -1 | cut -d'"' -f4)
    curl -s -m 120 -o "$tmp/abcjs.tgz" "$url"
    tar -xzf "$tmp/abcjs.tgz" -C "$tmp"
    if grep -qi "</script" "$tmp/package/dist/abcjs-basic-min.js"; then echo "${R}abcjs $latest holds </script>: not taken${X}"; exit 1; fi
    cp "$tmp/package/dist/abcjs-basic-min.js" "$tmp/package/dist/abcjs-basic-min.js.LICENSE" "$V/"
    cp "$tmp/package/LICENSE.md" "$V/abcjs-LICENSE.md"
    echo "${G}abcjs $latest in $V${X}: commit it in build/, run ./build.sh, then the page's suite (the staff is drawn by it)"
fi

if [ "${1:-}" = "--fonts" ]; then
    "$PY" - "$ROOT/lab/fonts" "$V/fonts.css" <<'PY'
import re, sys, urllib.request
from pathlib import Path
fonts, css_out = Path(sys.argv[1]), Path(sys.argv[2])
URL = ("https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,600&family=IBM+Plex+Mono:wght@400;500"
       "&family=IBM+Plex+Sans:wght@400;500;600&family=Michroma&family=Space+Grotesk:wght@400;500;600&family=Noto+Sans:wght@400;500;600"
       "&family=Noto+Sans+Mono:wght@400;500&family=Raleway:wght@400;500;600&family=Roboto:wght@400;500;600&family=Lato:wght@400;700"
       "&display=swap")   # HERESY 1274: Raleway, Roboto and Lato too (Viktor)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
css = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": UA}), timeout=60).read().decode()
KEEP = {"latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext"}
out, names = [], set()
for subset, block in re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})", css, flags=re.S):
    if subset not in KEEP:
        continue
    url = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", block).group(1)
    name = url.rsplit("/", 1)[1]
    if not (fonts / name).exists():
        (fonts / name).write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read())
    names.add(name)
    out.append(f"/* {subset} */\n" + block.replace(url, "/lab/fonts/" + name))
gone = [p for p in fonts.glob("*.woff2") if p.name not in names]
for p in gone:
    p.unlink()
head = "/* HERESY 1274: the page's fonts in the studio itself (lab/fonts/, OFL); made by heresy/tools/check-vendored.sh --fonts */\n"
css_out.write_text(head + "\n".join(out) + "\n", encoding="utf-8")
print(f"{len(out)} faces, {len(names)} files in {fonts} ({len(gone)} no longer used, removed); {css_out}")
PY
    echo "${G}the fonts taken again${X}: commit lab/fonts in lab/ and vendor/fonts.css in build/, then ./build.sh"
fi
