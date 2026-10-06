# Shared by every Hugging Face download script (source it after setting ROOT). It keeps every cache in
# tmp/, installs the pinned downloader (tools/downloader-requirements.txt) into the studio's one venv, .venv (HERESY 1080),
# with the converter's packages, and reads the revision pins (tools/hf-revisions.txt).
#
#   YUE2_HF=/path/to/hf           use another hf program (the regression tests pass a stub)
#   YUE2_HF_EXPECTED=DIR          read expected file lists from DIR/<owner>__<repo>.json instead of asking
#                                 Hugging Face (the regression tests use it)
#   YUE2_HF_CACHE_READONLY=1      tools/hf_expect.py reads its cached file lists (tmp/hf/expect) but writes
#                                 none: the scripts' --check and --verify modes set it, so they write nothing

HPY="$ROOT/.venv/bin/python"; [ -x "$HPY" ] || HPY=python3   # HERESY 1080: the studio's one environment
export TMPDIR="$ROOT/tmp"
# a profile may export its own HF_HUB_CACHE, which beats HF_HOME: pin every cache
export HF_HOME="$ROOT/tmp/hf" HF_HUB_CACHE="$ROOT/tmp/hf/hub" HUGGINGFACE_HUB_CACHE="$ROOT/tmp/hf/hub"
export HF_ASSETS_CACHE="$ROOT/tmp/hf/assets" HF_XET_CACHE="$ROOT/tmp/hf/xet" HF_XET_HIGH_PERFORMANCE=1
export PIP_CACHE_DIR="$ROOT/tmp/pip-cache" HF_HUB_DISABLE_TELEMETRY=1 PYTHONNOUSERSITE=1

HF_VENV="$ROOT/.venv"
HF="${YUE2_HF:-$HF_VENV/bin/hf}"
HF_REQ="$ROOT/tools/downloader-requirements.txt"
HF_REVS="$ROOT/tools/hf-revisions.txt"
HF_EXPECT="$ROOT/tools/hf_expect.py"

# Portable file size and human size (no GNU stat/numfmt: macOS has neither)
fsize() { "$HPY" -c 'import os, sys; print(os.path.getsize(sys.argv[1]))' "$1"; }
human() { "$HPY" -c '
import sys
n = float(sys.argv[1] or 0)
for u in ("", "K", "M", "G", "T"):
    if n < 1024 or u == "T":
        print(f"{n:.0f}{u}" if u == "" else f"{n:.1f}{u}"); break
    n /= 1024' "${1:-0}"; }

# The revision a repo is pinned to ("main" when tools/hf-revisions.txt does not list it)
hf_rev() { local r=""; [ -f "$HF_REVS" ] && r=$(awk -v k="$1" '$1 == k {print $2; exit}' "$HF_REVS"); echo "${r:-main}"; }

# Make sure the pinned downloader is installed (and is the pinned version, not whatever was there)
hf_ready() {
  [ -n "${YUE2_HF:-}" ] && return 0
  local want
  # one awk over the file (no "| head": under pipefail an early exit can fail the command before it)
  want=$(awk '/^[[:space:]]*#/ {next} match($0, /huggingface_hub[^=]*==[0-9.]+/) {s = substr($0, RSTART, RLENGTH); sub(/.*==/, "", s); print s; exit}' "$HF_REQ")
  if [ -x "$HF_VENV/bin/python" ] && [ -x "$HF" ] && \
     [ "$("$HF_VENV/bin/python" -c 'import huggingface_hub as h; print(h.__version__)' 2>/dev/null)" = "$want" ]; then
    return 0
  fi
  echo "${D:-}setting up the pinned downloader (huggingface_hub $want) in .venv${X:-}"
  [ -x "$HF_VENV/bin/python" ] || python3 -m venv "$HF_VENV"
  "$HF_VENV/bin/pip" install --quiet -r "$HF_REQ"
  local got
  got=$("$HF_VENV/bin/python" -c 'import huggingface_hub as h; print(h.__version__)')
  [ "$got" = "$want" ] || { echo "the downloader is huggingface_hub $got, not the pinned $want"; return 1; }
}

# Check a local copy against the pinned revision's file list: hf_complete REPO REV DIR [hf_expect.py options]
hf_complete() {
  local repo="$1" rev="$2" dir="$3"; shift 3
  "$HPY" "$HF_EXPECT" --repo "$repo" --rev "$rev" --dir "$dir" "$@"
}
