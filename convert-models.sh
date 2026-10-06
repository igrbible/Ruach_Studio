#!/usr/bin/env bash
# Make yue2.cpp's GGUF files from checkpoints already on disk, instead of
# downloading them. Reads build/checkpoints (a link to the folder holding
# YuE2-3B, YuE2-Vae, SheetSage2, MERT-v2-FullSong: a shared model library or the
# install's own checkpoints/), writes build/models and sliders/. Complete outputs are skipped.
#
#   YuE2-3B-BF16.gguf     7.2 GB  main model, byte-exact BF16
#   YuE2-Vae-F32.gguf     0.5 GB  Standard VAE (+ Legacy, Blend and the 16 sliders via convert-extras.py)
#   SheetSage2-F32.gguf   2.6 GB  transcriber (SheetSage2 + MERT), for covers
#
# Interruptions: every output is written as <name>.partial and renamed when complete
# (tools/gguf_atomic.py); an output an earlier run left incomplete is found (tools/gguf_check.py),
# moved to tmp/rejected/ and made again. Only this script's own output names are ever checked or moved:
# build/models and sliders/ may be links into a shared model folder that holds other files.
# Low memory: YUE2_LOWMEM=1 (automatic below 16 GiB of RAM; YUE2_LOWMEM=0 turns it off) keeps the
# tensors in a temporary file in tmp/ instead of RAM, which needs about 7.5 GB more free disk while
# the backbone converts. The output bytes are the same either way.
set -euo pipefail

export CUDA_HOME=/usr/local/cuda-12.8
export PATH="$CUDA_HOME/bin:$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="$CUDA_HOME/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES=0
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export TORCH_CUDA_ARCH_LIST="8.6"
export PYTHONUNBUFFERED=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HPY="$ROOT/.venv/bin/python"; [ -x "$HPY" ] || HPY=python3   # HERESY 1080: the studio's one environment
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi
export TMPDIR="$ROOT/tmp" PIP_CACHE_DIR="$ROOT/tmp/pip-cache" PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1
mkdir -p "$TMPDIR"
PY="$ROOT/.venv/bin/python"
# portable helpers (no GNU df/readlink needed)
real() { "$HPY" -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
free_gb() { "$HPY" -c 'import shutil, sys; print(shutil.disk_usage(sys.argv[1]).free // 2**30)' "$1"; }
ram_gb() { "$HPY" -c 'import os; print(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // 2**30)'; }

for need in YuE2-3B YuE2-Vae SheetSage2 MERT-v2-FullSong; do
    if [ ! -d "$ROOT/build/checkpoints/$need" ]; then
        echo "${R}missing${X} checkpoint $need in $(real "$ROOT/build/checkpoints")"
        exit 1
    fi
done

if [ ! -x "$PY" ]; then
    python3 -m venv "$ROOT/.venv"
fi
# tools/converter-requirements.txt, shipped in the friend kit, pins the converter's packages to its
# owner's versions (so the GGUFs come out the same); without it the versions below are used.
# The check compares the installed versions, not just whether the imports work.
REQ="$ROOT/tools/converter-requirements.txt"
pins_ok() {
    "$PY" - "$REQ" <<'PYCHK'
import subprocess, sys
norm = lambda n: n.lower().replace("_", "-")
want = {norm(l.split("==")[0]): l.split("==")[1].strip() for l in open(sys.argv[1]) if "==" in l and not l.startswith("#")}
out = subprocess.run([sys.executable, "-m", "pip", "freeze"], capture_output=True, text=True).stdout
have = {norm(l.split("==")[0]): l.split("==")[1].strip() for l in out.splitlines() if "==" in l}
bad = [f"{k} {have.get(k, 'missing')} (pinned {v})" for k, v in want.items() if have.get(k) != v]
print(", ".join(bad)); sys.exit(1 if bad else 0)
PYCHK
}
if [ -f "$REQ" ]; then
    if ! pins_ok >/dev/null; then
        echo "${D}installing the converter's pinned packages into .venv${X}"
        if "$ROOT/.venv/bin/pip" install --quiet -r "$REQ" && diff_out=$(pins_ok); then
            echo "${D}converter packages match $(basename "$REQ")${X}"
        else
            echo "${Y}the pinned converter packages do not install on this Python${X} ${D}($("$PY" --version); ${diff_out:-}); using the defaults below${X}"
            "$ROOT/.venv/bin/pip" install --quiet gguf numpy "mir_eval==0.8.2" "pretty_midi==0.2.10" "setuptools==78.1.1" safetensors
        fi
    fi
elif ! "$PY" -c "import gguf, numpy, mir_eval, pretty_midi, safetensors" 2>/dev/null; then
    echo "${D}installing the converter's packages into .venv${X}"
    # pretty_midi 0.2.10 still imports pkg_resources, which newer setuptools dropped
    "$ROOT/.venv/bin/pip" install --quiet gguf numpy "mir_eval==0.8.2" "pretty_midi==0.2.10" "setuptools==78.1.1" safetensors
fi
"$PY" -c "import gguf, numpy, mir_eval, pretty_midi, safetensors" || { echo "${R}the converter's packages do not import${X}"; exit 1; }

# low memory: automatic below 16 GiB of RAM (unified memory on a Mac counts: it is shared with the system)
LOW="${YUE2_LOWMEM:-}"
[ -n "$LOW" ] || { [ "$(ram_gb)" -lt 16 ] && LOW=1 || LOW=0; }
LOWARG=(); [ "$LOW" = 1 ] && LOWARG=(--low-memory)
# the output folders: on a fresh install build/models (-> ../models) and sliders/ may be links whose
# target does not exist yet; make the folder the link points to (or the folder itself)
for d in "$ROOT/build/models" "$ROOT/sliders"; do mkdir -p "$(real "$d")"; done
free_before=$(free_gb "$ROOT/build/models/")
need_gb=$([ "$LOW" = 1 ] && echo 22 || echo 15)    # 13.1 GB of outputs (+ a 7.5 GB temporary file in low-memory mode)
[ "$free_before" -ge "$need_gb" ] || echo "${Y}only ${free_before} GB free; converting everything needs about ${need_gb} GB${X} ${D}(complete outputs are skipped)${X}"

# The exact files this script makes: upstream convert.py's three, then convert-extras.py's own list (the
# two extra VAEs and one GGUF per slider). Nothing else in build/models or sliders/ is touched.
list_outputs() {
    local extras f
    extras=$("$PY" "$ROOT/convert-extras.py" --list-outputs) || { echo "${R}convert-extras.py cannot list its outputs${X}"; exit 1; }
    OUTPUTS=("build/models/YuE2-3B-BF16.gguf" "build/models/YuE2-Vae-F32.gguf" "build/models/SheetSage2-F32.gguf")
    while IFS= read -r f; do [ -n "$f" ] && OUTPUTS+=("$f"); done <<EOF
$extras
EOF
}
list_outputs

# what an interrupted run left behind, among those names only: its own .partial files (removed), and an
# output that is not a complete GGUF (moved to tmp/rejected/, never deleted, then made again)
partials=0 rejected=0
REJ="$ROOT/tmp/rejected"
for rel in "${OUTPUTS[@]}"; do
    f="$ROOT/$rel"
    [ -e "$f.partial" ] && { rm -f "$f.partial"; partials=$((partials + 1)); }
    [ -e "$f" ] || continue
    if ! "$HPY" "$ROOT/tools/gguf_check.py" complete "$f" >/dev/null 2>&1; then
        mkdir -p "$REJ"
        mv -f "$f" "$REJ/$(basename "$f")"
        echo "${Y}incomplete${X} $(basename "$f") ${D}(an earlier run was interrupted): moved to tmp/rejected/, made again${X}"
        rejected=$((rejected + 1))
    fi
done

start=$(date +%s)
echo "${D}converting$([ "$LOW" = 1 ] && echo " in low-memory mode (tensors wait in a temporary file in tmp/)")${X}"
cd "$ROOT/build"
nice -n 15 "$PY" "$ROOT/tools/gguf_atomic.py" ${LOWARG[@]+"${LOWARG[@]}"} convert.py
# Legacy + Blend VAEs and the 16 sliders
nice -n 15 "$PY" "$ROOT/tools/gguf_atomic.py" ${LOWARG[@]+"${LOWARG[@]}"} "$ROOT/convert-extras.py"
secs=$(( $(date +%s) - start ))
free_after=$(free_gb "$ROOT/build/models/")

# every output must now be there and a complete GGUF
bad=0
for rel in "${OUTPUTS[@]}"; do
    f="$ROOT/$rel"
    if [ ! -f "$f" ]; then echo "${R}missing${X} $rel"; bad=$((bad + 1)); continue; fi
    "$HPY" "$ROOT/tools/gguf_check.py" complete "$f" >/dev/null 2>&1 || { echo "${R}incomplete${X} $rel"; bad=$((bad + 1)); }
done

echo
echo "${B}converted${X} in ${secs}s into $(real "$ROOT/build/models")$([ "$LOW" = 1 ] && echo " ${D}(low-memory mode)${X}")"
for f in "$ROOT"/build/models/*.gguf; do
    [ -f "$f" ] && echo "  ${G}$(basename "$f")${X}  ${D}$(du -h "$f" | cut -f1)${X}"
done
echo "  sliders: $(ls "$ROOT"/sliders/*.gguf 2>/dev/null | wc -l | tr -d ' ') GGUF files, catalog $([ -f "$ROOT/sliders/catalog.json" ] && echo present || echo "${R}missing${X}")"
echo "  outputs checked: ${#OUTPUTS[@]}; from an interrupted run: $partials .partial removed, $rejected incomplete moved to tmp/rejected/$([ "$rejected" -gt 0 ] && echo " ${D}(delete them once this run is done)${X}"); incomplete or missing now: $([ $bad = 0 ] && echo "${G}0${X}" || echo "${R}$bad${X}")"
echo "  disk free ${free_before}G -> ${free_after}G"
[ "$bad" = 0 ]
