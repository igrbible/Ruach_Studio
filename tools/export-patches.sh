#!/usr/bin/env bash
# Save the engine changes (the commits in build/ on top of upstream) into the distribution repo, repo/:
#
#   repo/engines/cpp/patches/NNNN-*.patch   one readable patch per commit; the built page is left out of them
#   repo/engines/cpp/page/index.html.gz     the built page, once (./build-page.sh makes it from the sources)
#   repo/engines/cpp/BASE.txt               the upstream commit they were made on, its date, the ggml pin, the tree
#   repo/engines/cpp/PATCHES.md             a note per patch (what, why, which files) and how to use them safely
#   repo/page/src/                          the web page's sources as plain files (his HTML, CSS and JS)
#   repo/page/index.html                    the whole built page as one plain HTML file
#
# Then prove it: a scratch checkout of upstream/ at the base, the patches applied, the page added, must give
# exactly build/'s tree. Commits the change in repo/ when there is one.
#
#   tools/export-patches.sh      after committing in build/; tools/apply-patches.sh puts them back
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build" UP="$ROOT/upstream" DIST="$ROOT/repo"
ENG="$DIST/engines/cpp" PAGE="tools/public/index.html.gz"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" C="" D="" B="" X=""; fi
fail() { echo "${R}stopped${X}  $*"; exit 1; }
t0=$(date +%s)
export TMPDIR="$ROOT/tmp"

[ -d "$BUILD/.git" ] || fail "no build/ checkout"
[ -d "$UP/.git" ] || fail "no upstream/ checkout (git clone the engine's repo into upstream/)"
[ -d "$DIST/.git" ] || fail "no repo/ (the distribution repo): git init it first"
[ -z "$(git -C "$BUILD" status --porcelain)" ] || fail "build/ has uncommitted changes: commit them first ($(git -C "$BUILD" status --porcelain | head -3 | tr '\n' ' '))"
[ -z "$(find "$BUILD/tools/console" -type f -newer "$BUILD/$PAGE" | head -1)" ] || fail "the page sources are newer than the built page: ./build-page.sh, then commit"
UPREF="origin/master"
git -C "$UP" rev-parse -q --verify "$UPREF" >/dev/null || fail "no $UPREF in upstream/ (git -C upstream fetch)"
BASE=$(git -C "$BUILD" merge-base HEAD "$(git -C "$UP" rev-parse "$UPREF")" 2>/dev/null || true)
[ -n "$BASE" ] || BASE=$(git -C "$BUILD" merge-base HEAD origin/master)
N=$(git -C "$BUILD" rev-list --count "$BASE..HEAD")
[ "$N" -gt 0 ] || fail "no local commits in build/ on top of upstream ${BASE:0:7}"
TREE=$(git -C "$BUILD" rev-parse 'HEAD^{tree}')
GGML=$(git -C "$BUILD" ls-tree HEAD ggml | awk '{print $3}')
URL=$(git -C "$UP" remote get-url origin)
BASEDATE=$(git -C "$BUILD" log -1 --format=%ad --date=short "$BASE")

# write into a fresh folder first, then swap it in: an interrupted run leaves the old export whole
NEW="$ROOT/tmp/export-cpp"; rm -rf "$NEW"; mkdir -p "$NEW/patches" "$NEW/page"
git -C "$BUILD" format-patch --quiet --binary --no-signature -o "$NEW/patches" "$BASE..HEAD" -- . ":(exclude)$PAGE"
if command grep -l -i -E 'co-authored-by|generated with' "$NEW"/patches/*.patch >/dev/null 2>&1; then fail "a commit carries an attribution trailer"; fi
NP=$(ls "$NEW/patches" | wc -l | tr -d ' ')
cp "$BUILD/$PAGE" "$NEW/page/index.html.gz"
cat > "$NEW/BASE.txt" <<EOF
# The engine these patches were made for (tools/apply-patches.sh and the install read this file)
upstream=$URL
base=$BASE
base_date=$BASEDATE
ggml=$GGML
patches=$NP
tree=$TREE
made=$(date '+%Y-%m-%d %H:%M')
EOF

# the notes: every patch's own message, the files it touches, and how to use the set safely
python3 - "$BUILD" "$BASE" "$NEW" "$BASEDATE" "$URL" "$PAGE" <<'PY'
import subprocess, sys, os
build, base, new, basedate, url, page = sys.argv[1:7]
git = lambda *a: subprocess.run(["git", "-C", build, *a], capture_output=True, text=True, check=True).stdout
out = ["# The engine patches: notes", "",
       f"These patches change the C++ engine ({url.removesuffix('.git')}) at commit `{base[:7]}` of {basedate}.",
       "Each note below says what its patch does, why, and which files it touches, so the change can be",
       "redone by hand where a patch no longer applies. Changes inside upstream files carry a",
       "`// Local addition`, `// Local patch` or `// Local change` comment.", "",
       "## Use them safely", "",
       f"- **They were made for upstream `{base[:7]}` ({basedate}).** Upstream may have moved on since: the",
       "  newer it is, the likelier a patch needs redoing by hand.",
       "- **Never apply them to a working install in place.** Build in a separate folder: clone upstream at",
       f"  `{base[:7]}` (or a newer commit) into it and apply the patches there. An existing install stays as it is.",
       "- **Try first, in a scratch copy:** `git am -3 patches/*.patch`. If one fails: `git am --abort`,",
       "  and redo that change from its note (and the Local comments in the files) on the newer code.",
       f"- **The built page is not in the patches.** `page/index.html.gz` is it; copy it to `{page}`",
       "  and commit it, or make it with `./build-page.sh`. Then build and run the tests.",
       "- **Check:** on the base commit, all patches plus the page give the tree in `BASE.txt`.", ""]
revs = git("rev-list", "--reverse", f"{base}..HEAD").split()
n = 0
for rev in revs:
    files = [l for l in git("show", "--format=", "--numstat", rev, "--", ".", f":(exclude){page}").splitlines() if l.strip()]
    if not files:
        continue
    n += 1
    subject = git("log", "-1", "--format=%s", rev).strip()
    body = git("log", "-1", "--format=%b", rev).strip()
    date = git("log", "-1", "--format=%ad", "--date=short", rev).strip()
    out += [f"## {n:04d} {subject}", "", f"{date}" + (f". {body}" if body else "."), "", "Files:"]
    for l in files:
        add, rem, path = l.split("\t", 2)
        out.append(f"- `{path}`" + ("" if add == "-" else f" (+{add} −{rem})"))
    out.append("")
open(os.path.join(new, "PATCHES.md"), "w", encoding="utf-8").write("\n".join(out))
PY

# the proof: a scratch worktree of upstream/ at the base, the patches applied, the page committed on top
V="$ROOT/tmp/patch-verify"
git -C "$UP" worktree remove --force "$V" >/dev/null 2>&1 || true
rm -rf "$V"
git -C "$UP" worktree add --quiet --detach "$V" "$BASE" >/dev/null 2>&1 || fail "could not make a scratch checkout of ${BASE:0:7} from upstream/"
cleanup() { git -C "$UP" worktree remove --force "$V" >/dev/null 2>&1 || true; rm -rf "$V"; }
trap cleanup EXIT
git -C "$V" am --quiet "$NEW"/patches/*.patch >/dev/null 2>&1 || fail "the patches do not apply to upstream ${BASE:0:7}"
cp "$NEW/page/index.html.gz" "$V/$PAGE"
git -C "$V" add "$PAGE" && git -C "$V" commit --quiet --allow-empty -m "Add the built page" >/dev/null
got=$(git -C "$V" rev-parse 'HEAD^{tree}')
[ "$got" = "$TREE" ] || fail "applied to ${BASE:0:7} with the page, the export gives tree ${got:0:12}, not build/'s ${TREE:0:12}"

# swap it in and commit when it changed
mkdir -p "$ENG"
for part in patches page; do rm -rf "${ENG:?}/$part"; cp -r "$NEW/$part" "$ENG/$part"; done
cp "$NEW/PATCHES.md" "$ENG/PATCHES.md"
# the page as readable files too: the sources as he edits them, and the built page unpacked
rm -rf "$DIST/page"; mkdir -p "$DIST/page"
cp -r "$BUILD/tools/console" "$DIST/page/src"
gzip -dc "$BUILD/$PAGE" > "$DIST/page/index.html"
# BASE.txt's "made" line changes every run: keep the old file when nothing else in it changed
if [ -f "$ENG/BASE.txt" ] && diff -q <(command grep -v '^made=' "$ENG/BASE.txt") <(command grep -v '^made=' "$NEW/BASE.txt") >/dev/null; then :; else cp "$NEW/BASE.txt" "$ENG/BASE.txt"; fi
rm -rf "$NEW"
git -C "$DIST" add -A engines/cpp page
if git -C "$DIST" diff --cached --quiet; then
  state="no change in repo/"
else
  git -C "$DIST" commit --quiet -m "Sync the engine patches ($NP), the built page and its sources" -m "From build/ at tree ${TREE:0:12}, on upstream ${BASE:0:7} of $BASEDATE."
  state="committed in repo/ as $(git -C "$DIST" rev-parse --short HEAD)"
fi
size=$(du -sh "$ENG" | cut -f1 | tr -d ' ')
echo "${B}exported${X}  ${G}$NP${X} patches (from $N commits) on upstream ${C}${BASE:0:7}${X} ($BASEDATE) -> repo/engines/cpp ${D}($size)${X}"
echo "${G}verified${X}  upstream ${BASE:0:7} + the patches + the page gives build/'s exact tree ${D}(${TREE:0:12})${X}"
echo "${B}stats${X}  $NP patches, $(command grep -c '^diff --git' "$ENG"/patches/*.patch | awk -F: '{s += $2} END {print s}') file changes, $size, $state, $(( $(date +%s) - t0 )) s"
