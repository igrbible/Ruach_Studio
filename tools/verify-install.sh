#!/usr/bin/env bash
# Is this install complete and the same as the kit's owner's? Changes nothing.
# With tools/expected-install.json (the kit writes it: tree hash, model files, slider and LoRA counts)
# every item is compared with his install; without it, only checked for being present and readable.
#
#   tools/verify-install.sh           everything, including the SHA-256 of every converted file (about a minute)
#   tools/verify-install.sh --quick   skip the SHA-256s (structure and completeness are still checked)
#
# Converted files (BF16 backbone, VAEs, sliders) must match his byte for byte. Quantized copies (Q8_0, Q6_K,
# Q5_K_M...) and the transcriber (SheetSage2-F32: its conversion merges adapter weights in floating point)
# are compared by structure: they may round differently on another CPU, platform or compiler, so their
# bytes can differ while every tensor's name, shape and type match.
#
# Checks: the code (tree hash), the links, the built server, every GGUF model and slider (by header),
# the LoRAs (sizes against the pinned revisions, then the server's own LoRA reader), sources.json,
# settings.json, and the checkpoints if they are still there. Exit status 0 when nothing failed.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXP="${YUE2_EXPECTED:-$ROOT/tools/expected-install.json}"
QUICK=0; [ "${1:-}" = "--quick" ] && QUICK=1
GC="$ROOT/tools/gguf_check.py"
# his SHA-256 / structure digest for a file, "" when the kit has none
exp_of() { [ -f "$EXP" ] && python3 -c "import json,sys; d = json.load(open(sys.argv[1])); k = sys.argv[3]
v = d.get(sys.argv[2], {}).get(k); print(v['digest'] if isinstance(v, dict) else (v or ''))" "$EXP" "$1" "$2"; }
compare() {   # compare FILE KEY LABEL: completeness, then exact bytes or structure against his
  local f="$1" key="$2" label="$3" want got
  python3 "$GC" complete "$f" >/dev/null 2>&1 || { bad "$label" "incomplete or not a GGUF file (an interrupted conversion?)"; return 1; }
  want=$(exp_of exact_sha256 "$key")
  if [ -n "$want" ]; then
    [ "$QUICK" = 1 ] && { ok "$label" "complete $(du -h "$f" | cut -f1) (SHA-256 skipped: --quick)"; return 0; }
    got=$(python3 "$GC" sha256 "$f" | cut -d' ' -f1)
    [ "$got" = "$want" ] && { ok "$label" "$(du -h "$f" | cut -f1), byte for byte his"; return 0; }
    bad "$label" "its bytes differ from his (SHA-256 ${got:0:12}, his ${want:0:12})"; return 1
  fi
  want=$(exp_of quantized_structure "$key")
  if [ -n "$want" ]; then
    got=$(python3 "$GC" structure "$f" | python3 -c "import json,sys; print(json.load(sys.stdin)['digest'])")
    [ "$got" = "$want" ] && { ok "$label" "$(du -h "$f" | cut -f1), same tensors, shapes and types as his (compared by structure: its bytes may differ by platform)"; return 0; }
    bad "$label" "its tensor table differs from his"; return 1
  fi
  ok "$label" "complete $(du -h "$f" | cut -f1)$([ -f "$EXP" ] && echo " (nothing to compare with)")"
}
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi
# text search without a pipe into "grep -q", whose early exit can fail the pipeline under pipefail
contains() { case "$1" in *"$2"*) return 0 ;; esac; return 1; }
t0=$(date +%s); pass=0; fail=0; warn=0
ok()   { pass=$((pass + 1)); echo "  ${G}ok${X}      $1${2:+ ${D}$2${X}}"; }
bad()  { fail=$((fail + 1)); echo "  ${R}FAIL${X}    $1${2:+ ${D}$2${X}}"; }
note() { warn=$((warn + 1)); echo "  ${Y}note${X}    $1${2:+ ${D}$2${X}}"; }
exp() { [ -f "$EXP" ] && python3 -c "import json,sys; v = json.load(open(sys.argv[1])).get(sys.argv[2]); print(' '.join(v) if isinstance(v, list) else ('' if v is None else v))" "$EXP" "$1"; }
is_gguf() { [ -s "$1" ] && [ "$(head -c 4 "$1")" = "GGUF" ]; }
[ -f "$EXP" ] && echo "${D}comparing with $(basename "$EXP") (kit $(exp kit))${X}" || echo "${Y}no tools/expected-install.json: checking presence only${X}"

echo "${B}code${X}"
tree=$(git -C "$ROOT/build" rev-parse 'HEAD^{tree}' 2>/dev/null)
want=$(exp tree)
if [ -z "$tree" ]; then bad "build/ is not a git checkout"
elif [ -n "$want" ] && [ "$tree" != "$want" ]; then bad "tree $tree" "expected $want: a patch is missing or the code was edited"
else ok "tree ${tree:0:12}" "$([ -n "$want" ] && echo "identical to the original" || echo "(nothing to compare with)")"; fi
# --no-optional-locks: a status check must not rewrite git's index (verification writes nothing)
edits=$(git --no-optional-locks -C "$ROOT/build" status --porcelain 2>/dev/null)
[ -z "$edits" ] && ok "no local edits in build/" || bad "build/ has local edits" "$(printf '%s\n' "$edits" | awk 'NR <= 3' | tr '\n' ' ')"
for l in build/checkpoints build/models; do
  [ -L "$ROOT/$l" ] || { note "$l is not a link"; continue; }
  [ -e "$ROOT/$l" ] && ok "$l -> $(readlink "$ROOT/$l")" || { [ "$l" = build/checkpoints ] && note "$l -> $(readlink "$ROOT/$l")" "(the checkpoints were deleted after converting: fine)" || bad "$l -> $(readlink "$ROOT/$l")" "broken"; }
done

echo "${B}build${X}"
BIN="$ROOT/build/build/yue-server"
if [ -x "$BIN" ]; then
  # --help prints the usage and exits with status 1: that is how upstream wrote it, and it is fine. The
  # output is captured first, so that exit status cannot fail the check (as it would inside a pipeline).
  help_out=$("$BIN" --help 2>&1 || true)
  contains "$(printf '%s' "$help_out" | tr '[:upper:]' '[:lower:]')" usage && ok "yue-server runs" "(--help prints its usage; its exit status 1 is normal)" || bad "yue-server does not print its usage"
else bad "build/build/yue-server is not built"; fi
[ -x "$ROOT/build/build/quantize" ] && ok "quantize built" || note "build/build/quantize is not built"
[ -x "$ROOT/build/build/test-lora" ] && ok "test-lora built" || note "build/build/test-lora is not built (the LoRA reader check is skipped)"

echo "${B}models${X}"
models_ok=0
wanted=$(exp models); [ -n "$wanted" ] || wanted=$(cd "$ROOT/models" 2>/dev/null && ls *.gguf 2>/dev/null | tr '\n' ' ')
for m in $wanted; do
  if is_gguf "$ROOT/models/$m"; then compare "$ROOT/models/$m" "models/$m" "$m" && models_ok=$((models_ok + 1))
  else bad "$m" "missing, empty or not a GGUF file"; fi
done
for m in $(cd "$ROOT/models" 2>/dev/null && ls *.gguf 2>/dev/null); do
  case " $wanted " in *" $m "*) ;; *) note "$m" "(extra: not in the original install)" ;; esac
done
[ -n "$wanted" ] || bad "no models/*.gguf"

echo "${B}sliders${X}"
if [ -f "$ROOT/sliders/catalog.json" ]; then
  sl=(); while IFS= read -r line; do sl+=("$line"); done < <(python3 -c "import json,sys; [print(s.get('file') or s.get('gguf') or (s['id'] + '.gguf')) for s in json.load(open(sys.argv[1])).get('sliders', [])]" "$ROOT/sliders/catalog.json")
  sliders_ok=0; sliders_same=0
  for s in ${sl[@]+"${sl[@]}"}; do
    if ! is_gguf "$ROOT/sliders/$s" || ! python3 "$GC" complete "$ROOT/sliders/$s" >/dev/null 2>&1; then bad "slider $s" "missing, incomplete or not a GGUF file"; continue; fi
    sliders_ok=$((sliders_ok + 1)); want=$(exp_of exact_sha256 "sliders/$s")
    if [ -n "$want" ] && [ "$QUICK" = 0 ]; then
      [ "$(python3 "$GC" sha256 "$ROOT/sliders/$s" | cut -d' ' -f1)" = "$want" ] && sliders_same=$((sliders_same + 1)) || bad "slider $s" "its bytes differ from his (SHA-256)"
    fi
  done
  [ -f "$EXP" ] && [ "$QUICK" = 0 ] && [ "$sliders_same" -gt 0 ] && ok "$sliders_same sliders byte for byte his"
  want_s=$(exp sliders)
  if [ "$sliders_ok" = "${#sl[@]}" ] && { [ -z "$want_s" ] || [ "$sliders_ok" = "$want_s" ]; }; then ok "$sliders_ok sliders" "every one catalog.json lists, as GGUF"
  else bad "$sliders_ok of ${#sl[@]} sliders$([ -n "$want_s" ] && echo ", expected $want_s")"; fi
else bad "sliders/catalog.json is missing" "run ./convert-models.sh"; sliders_ok=0; fi

echo "${B}loras${X}"
# (the scripts it runs print plain text into a pipe: no colour codes to strip)
if out=$("$ROOT/tools/download-loras.sh" --verify 2>&1); then ok "every LoRA file has its pinned size" "$(printf '%s' "$out" | tail -1)"
elif contains "$out" 'cannot read the file list'; then note "LoRA sizes not checked" "(Hugging Face did not answer: offline?)"
else bad "LoRA files incomplete" "$(printf '%s\n' "$out" | command grep -i -E 'missing|expected' | awk 'NR <= 2' | tr '\n' ' ')"; fi
if [ -x "$ROOT/build/build/test-lora" ]; then
  res=$("$ROOT/build/build/test-lora" catalog "$ROOT/loras" 2>/dev/null | python3 -c "import json,sys; d = json.load(sys.stdin); print(len(d), sum(1 for e in d if e.get('error')))")
  n=${res% *}; errs=${res#* }; want_l=$(exp loras)
  if [ "$errs" = 0 ] && { [ -z "$want_l" ] || [ "$n" = "$want_l" ]; }; then ok "$n LoRA files read by the server's own LoRA reader" "no errors"
  else bad "LoRA reader: $n files, $errs with errors$([ -n "$want_l" ] && echo ", expected $want_l")"; fi
fi
python3 -c "import json,sys; d = json.load(open(sys.argv[1])); assert d['loras'] and d['vaes']" "$ROOT/loras/sources.json" 2>/dev/null \
  && ok "loras/sources.json" "(names, blurbs, links, recaps)" || bad "loras/sources.json missing or unreadable" "copy it from the kit"

echo "${B}settings${X}"
# the path goes in as an argument, never pasted into the Python source
settings=$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    s = json.load(f)
seq = s.get("max_seq") or 0
print("model", s.get("model") or "(first present)",
      "· models " + ("kept loaded" if s.get("keep_loaded") else "unloaded after each song"),
      "· context " + ("whole" if not seq else f"{seq:,}"), "· VAE tiles " + str(s.get("vae_core", 512)))' "$ROOT/settings.json" 2>/dev/null) \
  && ok "settings.json" "$settings" || bad "settings.json missing or unreadable"

if [ -d "$ROOT/checkpoints" ] && [ -n "$(ls -A "$ROOT/checkpoints" 2>/dev/null)" ]; then
  echo "${B}checkpoints${X}  ${D}(only needed to convert again)${X}"
  if out=$("$ROOT/tools/download-checkpoints.sh" --verify 2>&1); then ok "every checkpoint repo complete at its pinned revision" "$(printf '%s' "$out" | tail -1)"
  else note "checkpoints not complete" "(fine if they were partly deleted after converting)"; fi
fi

echo
echo "${B}verify-install${X}  $([ $fail = 0 ] && echo "$G" || echo "$R")$pass ok, $fail failed$X, $warn notes  ${D}GGUF files: $models_ok models + ${sliders_ok:-0} sliders = $((models_ok + ${sliders_ok:-0})), $(( $(date +%s) - t0 )) s${X}"
[ "$fail" = 0 ]
