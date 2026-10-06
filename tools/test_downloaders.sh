#!/usr/bin/env bash
# Regression checks for the Hugging Face download scripts, run in a scratch copy (tmp/test-downloaders)
# so real folders are never touched.
#
#   tools/test_downloaders.sh            offline: how the include patterns reach the downloader, and that an
#                                        incomplete download is caught (a stand-in hf that exits 0 and fetches
#                                        nothing; fixture file lists instead of the Hugging Face API). Seconds.
#   tools/test_downloaders.sh --online   also the real pinned downloader: two include patterns on the slider
#                                        repo must fetch exactly those two files (about 16 MB). Needs network.
#
# Guards the kit v3 failure: huggingface_hub 2.0.0 took "--include a b c" as one pattern plus file names,
# printed "Ignoring --include since filenames have been explicitly set", exited 0, and the slider folder
# was left with metadata only, which the old "any .safetensors present" check could not see.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
G=$'\e[32m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" R="" D="" B="" X=""; fi
ONLINE=0; [ "${1:-}" = "--online" ] && ONLINE=1
export TMPDIR="$ROOT/tmp"      # the shell's own temporary files (here-strings on an older bash) stay in tmp/ too
T="$ROOT/tmp/test-downloaders"; rm -rf "$T"; mkdir -p "$T"
t0=$(date +%s); pass=0; fail=0
check() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "  ${G}PASS${X}  $1"; else fail=$((fail + 1)); echo "  ${R}FAIL${X}  $1${3:+ ${D}($3)${X}}"; fi; }

# --- a scratch install: the scripts, a stand-in hf, fixture file lists
S="$T/root"; mkdir -p "$S/tools" "$S/tmp" "$T/expected"
cp "$ROOT"/tools/{download-checkpoints.sh,download-loras.sh,hf-env.sh,hf_expect.py,downloader-requirements.txt} "$S/tools/"
printf 'ntc-ai/yue2-particle-sliders 33cf42fb0a54f60d8264d64cf6c20f038c4d172b\n' > "$S/tools/hf-revisions.txt"
cat > "$T/hf-stub" <<'STUB'
#!/bin/bash
# stand-in for hf: records its arguments, fetches nothing, and says it worked
{ printf '%s\n' "$@"; echo "--end--"; } >> "$HF_STUB_LOG"
exit 0
STUB
chmod +x "$T/hf-stub"
# the slider repo as a tiny fixture: 2 weights + their json, the catalog, docs, and a file outside the patterns
F="$T/fixture"; mkdir -p "$F/weights/particle-gmix-1600-v2" "$F/other"
printf 'AAAAAAAA' > "$F/weights/particle-gmix-1600-v2/a_step1600.safetensors"
printf 'BBBBBBBBBBBB' > "$F/weights/particle-gmix-1600-v2/b_step1600.safetensors"
printf '{}' > "$F/weights/particle-gmix-1600-v2/a_step1600.json"
printf '{}' > "$F/weights/particle-gmix-1600-v2/b_step1600.json"
for f in README.md USAGE.md MATH.md slider_runtime.py LICENSE; do printf 'doc' > "$F/$f"; done
printf 'not wanted' > "$F/other/big.bin"
python3 - "$F" <<'PY'
import hashlib, json, os, sys
f = sys.argv[1]; w = "weights/particle-gmix-1600-v2/"
cat = {"sliders": [{"id": n, "weights": w + n + "_step1600.safetensors",
                    "sha256": hashlib.sha256(open(os.path.join(f, w + n + "_step1600.safetensors"), "rb").read()).hexdigest()} for n in ("a", "b")]}
json.dump(cat, open(os.path.join(f, "catalog.json"), "w"))
PY
python3 - "$F" "$T/expected/ntc-ai__yue2-particle-sliders.json" <<'PY'
import hashlib, json, os, sys
root, out = sys.argv[1:3]; sib = []
for d, _, files in os.walk(root):
    for n in files:
        p = os.path.join(d, n); rel = os.path.relpath(p, root)
        sib.append({"rfilename": rel, "size": os.path.getsize(p), "lfs": {"sha256": hashlib.sha256(open(p, "rb").read()).hexdigest(), "size": os.path.getsize(p)}})
json.dump({"siblings": sib}, open(out, "w"))
PY
PATS="weights/particle-gmix-1600-v2/* catalog.json slider_runtime.py LICENSE* README.md USAGE.md MATH.md"
expect() { YUE2_HF_EXPECTED="$T/expected" python3 "$S/tools/hf_expect.py" --repo ntc-ai/yue2-particle-sliders --rev x --dir "$1" "${@:2}" >"$T/out.txt" 2>&1; }
read -r -a PAT_ARR <<< "$PATS"

echo "${B}incomplete downloads are caught${X}"
C="$T/copy"
rm -rf "$C"; cp -r "$F" "$C"; rm -rf "$C/other"
expect "$C" --include "${PAT_ARR[@]}" --catalog; check "a complete copy passes (a file outside the patterns is not required)" $?
rm -rf "$C"; mkdir -p "$C"; cp "$F"/{catalog.json,README.md,USAGE.md,MATH.md,slider_runtime.py,LICENSE} "$C/"
expect "$C" --include "${PAT_ARR[@]}" --catalog; r=$?
[ $r = 1 ] && command grep -q 'a_step1600.safetensors: missing' "$T/out.txt" && command grep -q 'slider a: weights' "$T/out.txt"
check "metadata only (the v3 failure) is incomplete: every missing weight is named" $? "exit $r"
rm -rf "$C"; cp -r "$F" "$C"; printf 'AAAA' > "$C/weights/particle-gmix-1600-v2/a_step1600.safetensors"
expect "$C" --include "${PAT_ARR[@]}"; r=$?
[ $r = 1 ] && command grep -q '4 bytes, expected 8' "$T/out.txt"; check "a truncated weight is caught by its size" $? "exit $r"
rm -rf "$C"; cp -r "$F" "$C"; printf 'ZZZZZZZZ' > "$C/weights/particle-gmix-1600-v2/a_step1600.safetensors"
expect "$C" --include "${PAT_ARR[@]}" --catalog; r=$?
[ $r = 1 ] && command grep -q "do not match catalog.json" "$T/out.txt"; check "a same-size but wrong weight is caught by catalog.json's SHA-256" $? "exit $r"
rm -rf "$C"; mkdir -p "$C"; cp "$F/weights/particle-gmix-1600-v2/a_step1600.safetensors" "$C/"
expect "$C" --files weights/particle-gmix-1600-v2/a_step1600.safetensors --strip weights/particle-gmix-1600-v2/; check "a file moved up out of a repo subfolder (the LoRA case) is found" $?
expect "$C" --files weights/particle-gmix-1600-v2/b_step1600.safetensors --strip weights/particle-gmix-1600-v2/; r=$?
[ $r = 1 ]; check "  and a missing one is reported" $? "exit $r"
YUE2_HF_EXPECTED="$T/nowhere" python3 "$S/tools/hf_expect.py" --repo ntc-ai/yue2-particle-sliders --rev x --dir "$C" >/dev/null 2>&1; r=$?
[ $r = 2 ]; check "no file list (offline) is its own answer (exit 2), never 'complete'" $? "exit $r"

echo "${B}the include patterns reach the downloader as literal words${X}"
# a folder full of files the patterns would match if the shell expanded them
DECOY="$T/decoy"; mkdir -p "$DECOY/weights/particle-gmix-1600-v2"; touch "$DECOY/weights/particle-gmix-1600-v2/decoy.safetensors" "$DECOY/LICENSE-decoy"
export HF_STUB_LOG="$T/hf-argv.txt"; : > "$HF_STUB_LOG"
(cd "$DECOY" && YUE2_HF="$T/hf-stub" YUE2_HF_EXPECTED="$T/expected" "$S/tools/download-checkpoints.sh" > "$T/run.txt" 2>&1); r=$?
call=$(awk '/^--end--$/ {if (keep) {print buf; exit} buf=""; keep=0; next} {buf = buf $0 "\n"; if ($0 == "ntc-ai/yue2-particle-sliders") keep=1}' "$HF_STUB_LOG")
got=$(printf '%s' "$call" | awk '/^--include$/ {on=1; next} /^--/ {on=0} on' | tr '\n' ' ' | sed 's/ $//')
[ "$got" = "$PATS" ]; check "the slider call passes exactly the 7 patterns after --include, unexpanded" $? "got: $got"
# (compared as whole strings: a "| head" or "| grep -q" can end early and fail the pipeline under pipefail)
first3=$(printf '%s\n' "$call" | awk 'NR <= 3' | tr '\n' ' ')
[ "$first3" = "download --quiet ntc-ai/yue2-particle-sliders " ]; check "  and no file names before them (the repo is the only positional argument)" $? "got: $first3"
printf '%s\n' "$call" | awk '$0 == "33cf42fb0a54f60d8264d64cf6c20f038c4d172b" {f = 1} END {exit !f}'; check "  at the pinned revision" $?
[ $r != 0 ] && command grep -q 'failed.*particle-sliders' "$T/run.txt"
check "a downloader that exits 0 but fetches nothing is reported as failed, not done" $? "exit $r"
command grep -q 'done.*particle-sliders' "$T/run.txt"; [ $? != 0 ]; check "  and particle-sliders is never called done" $?

echo "${B}the LoRA downloader too${X}"
: > "$HF_STUB_LOG"
(cd "$DECOY" && YUE2_HF="$T/hf-stub" YUE2_HF_EXPECTED="$T/expected" "$S/tools/download-loras.sh" > "$T/run.txt" 2>&1); r=$?
[ $r != 0 ] && ! command grep -q ' done ' "$T/run.txt"; check "exit 0 with nothing fetched is a failure for every LoRA file" $? "exit $r"
# per call (the stub ends each with --end--): the calls without --revision, out of all calls
read -r norev ncalls < <(awk '/^--end--$/ {calls++; if (!rev) bad++; rev = 0; next} $0 == "--revision" {rev = 1} END {print bad + 0, calls + 0}' "$HF_STUB_LOG")
[ "$ncalls" -gt 0 ] && [ "$norev" = 0 ]; check "  every LoRA call carries --revision" $? "$norev of $ncalls calls without it"

if [ "$ONLINE" = 1 ]; then
  echo "${B}the real pinned downloader (network, about 16 MB)${X}"
  # shellcheck source=hf-env.sh
  (ROOT="$ROOT"; source "$ROOT/tools/hf-env.sh"; hf_ready >/dev/null) ; check "the pinned downloader installs in .venv" $?
  v=$("$ROOT/.venv/bin/python" -c 'import huggingface_hub as h; print(h.__version__)' 2>/dev/null)
  want=$(command grep -o 'huggingface_hub[^=]*==[0-9.]*' "$ROOT/tools/downloader-requirements.txt" | sed 's/.*==//')
  [ "$v" = "$want" ]; check "  it is huggingface_hub $want" $? "got $v"
  REV=$(awk '$1 == "ntc-ai/yue2-particle-sliders" {print $2}' "$ROOT/tools/hf-revisions.txt" 2>/dev/null); REV=${REV:-33cf42fb0a54f60d8264d64cf6c20f038c4d172b}
  O="$T/online"; mkdir -p "$O"
  ( export ROOT="$ROOT"; source "$ROOT/tools/hf-env.sh"
    "$HF" download ntc-ai/yue2-particle-sliders --revision "$REV" \
      --include "weights/particle-gmix-1600-v2/female_step1600.safetensors" "catalog.json" --local-dir "$O" ) > "$T/online.txt" 2>&1; r=$?
  files=$(cd "$O" && find . -type f -not -path './.cache/*' | sort | tr '\n' ' ')
  [ $r = 0 ] && [ "$files" = "./catalog.json ./weights/particle-gmix-1600-v2/female_step1600.safetensors " ]
  check "two include patterns fetch exactly those two files" $? "exit $r; got: $files"
  ! command grep -q 'Ignoring --include' "$T/online.txt"; check "  no 'Ignoring --include' warning" $?
  python3 "$ROOT/tools/hf_expect.py" --repo ntc-ai/yue2-particle-sliders --rev "$REV" --dir "$O" \
    --files weights/particle-gmix-1600-v2/female_step1600.safetensors catalog.json --hash > "$T/out.txt" 2>&1
  check "  both match the pinned revision's sizes and SHA-256" $? "$(tail -2 "$T/out.txt" | tr '\n' ' ')"
fi

rm -rf "$T"
echo
echo "${B}test_downloaders${X}  $([ $fail = 0 ] && echo "$G" || echo "$R")$pass passed, $fail failed$X  ${D}$(( $(date +%s) - t0 )) s$([ $ONLINE = 1 ] && echo ", online" || echo ", offline")$X"
[ $fail = 0 ]
