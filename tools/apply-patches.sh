#!/usr/bin/env bash
# Rebuild build/ from upstream/ and the engine patches in repo/engines/cpp: the way to take a newer upstream.
#
#   tools/export-patches.sh             1. repo/ holds exactly what build/ has (checked below)
#   git -C upstream pull                2. upstream/ moves to the newer commit
#   tools/apply-patches.sh              3. build/ = upstream + the patches + the built page
#   tools/apply-patches.sh --base       the same on the base the patches were made for (BASE.txt), e.g. to
#                                       rebuild build/ exactly as it was
#
# Conflicts stop with the file names: fix them in build/, `git -C build add` them, run this again (it goes
# on with the same apply), or `git -C build am --abort` and redo that patch by hand from PATCHES.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# YUE2_BUILD / YUE2_UPSTREAM point it at other checkouts (the tests use scratch copies)
BUILD="${YUE2_BUILD:-$ROOT/build}" UP="${YUE2_UPSTREAM:-$ROOT/upstream}" ENG="$ROOT/repo/engines/cpp" PAGE="tools/public/index.html.gz"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" C="" D="" B="" X=""; fi
fail() { echo "${R}stopped${X}  $*"; exit 1; }
info() { awk -F= -v k="$1" '$1 == k {print $2; exit}' "$ENG/BASE.txt"; }
# git names its apply-in-progress folder relative to the checkout (absolute only in a worktree)
amdir() { local d; d=$(git -C "$BUILD" rev-parse --git-path rebase-apply); case "$d" in /*) echo "$d" ;; *) echo "$BUILD/$d" ;; esac; }
current() { head -1 "$(amdir)/final-commit" 2>/dev/null || true; }
in_am() { [ -d "$(amdir)" ]; }
t0=$(date +%s)
ONBASE=0; [ "${1:-}" = "--base" ] && ONBASE=1

[ -f "$ENG/BASE.txt" ] && ls "$ENG"/patches/*.patch >/dev/null 2>&1 || fail "no patches in repo/engines/cpp (tools/export-patches.sh first)"
[ -d "$BUILD/.git" ] && [ -d "$UP/.git" ] || fail "build/ and upstream/ must both be git checkouts"

if ! in_am; then
  [ -z "$(git -C "$BUILD" status --porcelain --untracked-files=no)" ] || fail "build/ has uncommitted changes"
  # never throw away a commit that only build/ has: repo/ must already hold exactly this tree
  [ "$(git -C "$BUILD" rev-parse 'HEAD^{tree}')" = "$(info tree)" ] || fail "build/ has changes repo/ does not hold yet: run tools/export-patches.sh first"
  if [ "$ONBASE" = 1 ]; then TARGET=$(info base); else TARGET=$(git -C "$UP" rev-parse HEAD); fi
  git -C "$BUILD" fetch --quiet "$UP" "$TARGET" 2>/dev/null || git -C "$BUILD" fetch --quiet "$UP"
  git -C "$BUILD" checkout --quiet -B master "$TARGET"
  git -C "$BUILD" submodule update --quiet --init --depth 1 ggml 2>/dev/null || git -C "$BUILD" submodule update --quiet --init ggml
  echo "${B}applying${X}  $(ls "$ENG"/patches/*.patch | wc -l | tr -d ' ') patches (made on upstream $(info base | cut -c1-7), $(info base_date)) onto ${C}$(git -C "$BUILD" rev-parse --short HEAD)${X} ${D}$(git -C "$BUILD" log -1 --format='%ad %s' --date=short | cut -c1-60)${X}"
  git -C "$BUILD" am -3 --quiet "$ENG"/patches/*.patch >/dev/null 2>&1 || true
else
  echo "${B}continuing${X}  the apply that stopped"
  GIT_EDITOR=true git -C "$BUILD" am --continue >/dev/null 2>&1 || true
fi
if in_am; then
  conflicted=$(git -C "$BUILD" diff --name-only --diff-filter=U)
  echo "${Y}conflict${X}  in: $(current)"
  [ -n "$conflicted" ] && printf '%s\n' "$conflicted" | sed "s/^/  ${R}both changed${X} /" || echo "  ${R}did not apply${X} (no conflict markers): redo it from repo/engines/cpp/PATCHES.md"
  echo "  ${D}the \"Local ...\" comments mark his side; keep both intents, git -C build add the files, run this again${X}"
  echo "  ${D}or go back: git -C build am --abort (build/ is then upstream plus the patches before this one)${X}"
  exit 1
fi

# the built page, as the last commit (the patches leave it out)
cp "$ENG/page/index.html.gz" "$BUILD/$PAGE"
git -C "$BUILD" add "$PAGE"
git -C "$BUILD" diff --cached --quiet || git -C "$BUILD" commit --quiet -m "Add the built page" -m "Made by build-page.sh from the page sources in the patches."
for l in models checkpoints; do [ -e "$BUILD/$l" ] || [ -L "$BUILD/$l" ] || ln -s "../$l" "$BUILD/$l"; done

got=$(git -C "$BUILD" rev-parse 'HEAD^{tree}')
if [ "$got" = "$(info tree)" ]; then
  echo "${G}identical${X}  build/ is exactly the code the patches were exported from (tree ${got:0:12})"
else
  echo "${G}applied${X}  on upstream ${C}$(git -C "$BUILD" rev-parse --short "HEAD~$(( $(ls "$ENG"/patches/*.patch | wc -l) + 1 ))" 2>/dev/null || echo '?')${X}: new code, so build and test it:"
  echo "  ${D}./build-page.sh   (if the page sources changed)${X}"
  echo "  ${D}TMPDIR=\$PWD/tmp CCACHE_DIR=\$PWD/tmp/ccache CCACHE_BASEDIR=\$PWD nice -n 15 cmake --build build/build -j 7${X}"
  echo "  ${D}node tools/cdp-console.mjs, tools/test-real.sh, then tools/export-patches.sh${X}"
fi
echo "${B}stats${X}  $(git -C "$BUILD" rev-list --count "$(info base)..HEAD" 2>/dev/null || echo '?') commits on top of the base, $(( $(date +%s) - t0 )) s"
