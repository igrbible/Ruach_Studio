#!/bin/bash
# build.sh VERSION [OUT] · RuachStudio.exe, the Windows launcher of the native package (HERESY 2685, 2880; the WSL one's out, 2999)
#   VERSION  the Studio's version, X.Y.Z or X.Y.Z-rcN: the launcher's own (its User-Agent, its log, --status) and the exe's version
#            resource (X.Y.Z.0: Windows' resource takes four numbers)
#   OUT      where the exe goes (default: tmp/claude-packaging/out/RuachStudio.exe), with its .sha256 beside it
# Go as go.mod's toolchain line says (the system go fetches it), GOOS=windows, CGO_ENABLED=0, a GUI exe; the icon and the manifest
# (per-monitor DPI, common controls, asInvoker, and since HERESY 2998 activeCodePage UTF-8: cmd/ruachstudio/winres) through go-winres
# (go install github.com/tc-hib/go-winres@v0.3.3). The tests first:
# go vet, go test (the launcher's decisions) and testdata/e2e-native.sh (the real binary of this machine on a made-up native Studio). Unsigned, by Viktor's word of 08.11.2026: Windows asks once, «More info → Run anyway».
# The Windows workflow (.github/workflows/windows.yml) builds the same exe into the native zip.
set -euo pipefail
V=${1:?version X.Y.Z}; [[ "$V" =~ ^([0-9]+\.[0-9]+\.[0-9]+)(-rc[0-9]+)?$ ]] || { echo "the version is X.Y.Z or X.Y.Z-rcN"; exit 2; }
FV="${BASH_REMATCH[1]}.0"
L="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=${2:-$HOME/Documents/AI/Ruach_Studio/tmp/claude-packaging/out/RuachStudio.exe}
WINRES=${GOWINRES:-$HOME/go/bin/go-winres}
G=$'\e[1;32m' X=$'\e[0m'
cd "$L"
echo "${G}── tests${X}"
go vet ./... 2>&1 | sed 's/^/  /'
go test ./... 2>&1 | sed 's/^/  /'
bash testdata/e2e-native.sh 2>&1 | tail -1 | sed 's/^/  /'
echo "${G}── the version resource: $FV${X}"
"$WINRES" make --arch amd64 --in cmd/ruachstudio/winres/winres.json --out cmd/ruachstudio/rsrc --file-version "$FV" --product-version "$FV"
echo "${G}── RuachStudio.exe $V${X}"
mkdir -p "$(dirname "$OUT")"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui -X main.version=$V" -o "$OUT" ./cmd/ruachstudio
(cd "$(dirname "$OUT")" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "  $OUT · $(stat -c %s "$OUT") bytes · $(file -b "$OUT" | cut -d, -f1) · sha256 $(cut -c1-16 "$OUT.sha256")…"
strings -el "$OUT" | grep -A1 -E "^(FileVersion|ProductVersion)$" | paste - - - | sed 's/^/  /'
