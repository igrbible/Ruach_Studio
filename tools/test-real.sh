#!/usr/bin/env bash
# The real server and its page, end to end, on the CPU with the GPU hidden, in an isolated test library.
# Works on a fresh install (no songs yet): it writes one clearly labelled SYNTHETIC fixture take (a
# 1-second tone, not model output) into tmp/test-real/library, starts its own yue-server on a free port
# with --outputs and --settings inside tmp/test-real, runs tools/cdp-real.mjs (page checks + a real
# 1-second song through the form), then stops exactly the server and browser it started.
# The user's outputs/ and settings.json are never read or written; the script checks that too.
#
#   tools/test-real.sh          ~1-4 min on a quarter of the CPU cores
#   tools/test-real.sh --keep   keep tmp/test-real (library, server log) afterwards; it is kept on failure anyway
#   tools/test-real.sh --gpu    the same on the GPU (CUDA or Apple Metal) instead: only with the user's OK
#   YUE2_CHROME=/path/to/chrome, YUE2_NODE=/path/to/node   when they are not found on their own
#
# Expected, harmless lines in tmp/test-real/server.log: "no CUDA-capable device" (the GPU is hidden on
# purpose), messages about a missing NCCL library (only used across several GPUs), and on a Mac the
# Metal shaders being compiled at start even for a CPU run (why the server gets up to 3 minutes to start).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" D="" B="" X=""; fi
KEEP=0; GPU=0
for a in "$@"; do case "$a" in --keep) KEEP=1 ;; --gpu) GPU=1 ;; *) echo "unknown option: $a"; exit 2 ;; esac; done
T="$ROOT/tmp/test-real"; BIN="$ROOT/build/build/yue-server"
# a profile of its own for this run, so the cleanup can stop exactly this browser
PROFILE="$ROOT/tmp/chrome-home/profile-real-test-$$"; export YUE2_CHROME_PROFILE="$PROFILE"
t0=$(date +%s); pass=0; fail=0; SPID=""
check() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "  ${G}PASS${X}  $1"; else fail=$((fail + 1)); echo "  ${R}FAIL${X}  $1${3:+ ${D}($3)${X}}"; fi; }
stop() { echo "${R}stop${X}  $*"; exit 2; }

# --- what the test needs (found even off PATH: the macOS Chrome app, or YUE2_CHROME / YUE2_NODE)
for t in python3 curl; do command -v "$t" >/dev/null || stop "$t is needed for this test"; done
NODE="${YUE2_NODE:-$(command -v node || true)}"
[ -n "$NODE" ] && [ -x "$NODE" ] || stop "Node.js 22+ is needed (or set YUE2_NODE)"
nv=$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$nv" -ge 22 ] 2>/dev/null || stop "Node.js 22+ is needed, found $("$NODE" --version 2>/dev/null)"
CHROME="${YUE2_CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser; do command -v "$c" >/dev/null && { CHROME=$(command -v "$c"); break; }; done
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    [ -z "$CHROME" ] && [ -x "$c" ] && CHROME="$c"
  done
fi
[ -n "$CHROME" ] || stop "Chrome or Chromium is needed (or set YUE2_CHROME)"
export YUE2_CHROME="$CHROME"
[ -x "$BIN" ] || stop "build/build/yue-server is not built"
# HERESY 1145: the page as build.sh makes it, read from disk by the server (1130), never the copy the binary embeds
PAGE="$ROOT/build/tools/public/index.html"
[ -f "$PAGE" ] || stop "build/tools/public/index.html is missing: run ./build.sh"
[ -z "$(find "$ROOT/build/tools/console" -type f -newer "$PAGE" | head -1)" ] || stop "build/tools/public/index.html is older than its sources: run ./build.sh"
MODEL=""; for q in Q5_K_M Q8_0 Q6_K BF16; do [ -f "$ROOT/models/YuE2-3B-$q.gguf" ] && { MODEL="$q"; break; }; done
[ -n "$MODEL" ] || stop "no models/YuE2-3B-*.gguf: convert the models first"
for f in YuE2-Vae-F32.gguf YuE2-Vae-legacy-F32.gguf YuE2-Vae-blend-F32.gguf; do [ -f "$ROOT/models/$f" ] || stop "models/$f is missing"; done
[ -f "$ROOT/sliders/catalog.json" ] || stop "sliders/ is not converted"

# fingerprints of the user's own library and settings, to prove the test left them alone (portable: Python)
fp() { python3 - "$ROOT" <<'PY'
import hashlib, os, sys
root = sys.argv[1]; h = hashlib.sha256()
for d, dirs, files in sorted(os.walk(os.path.join(root, "outputs"))):
    dirs.sort()
    for f in sorted(files):
        st = os.stat(os.path.join(d, f)); h.update(f"{os.path.relpath(os.path.join(d, f), root)} {st.st_size} {st.st_mtime}\n".encode())
try:
    h.update(open(os.path.join(root, "settings.json"), "rb").read())
except OSError:
    h.update(b"no settings")
# HERESY 1145: and the studio's user/ folder: the page's settings, the workspaces, the styles (by content)
for f in sorted(os.listdir(os.path.join(root, "user"))) if os.path.isdir(os.path.join(root, "user")) else []:
    p = os.path.join(root, "user", f)
    if os.path.isfile(p):
        h.update(f.encode() + b"\0" + open(p, "rb").read())
print(h.hexdigest()[:16])
PY
}
before=$(fp)

rm -rf "$T"; mkdir -p "$T/library"
cleanup() {
  if [ -n "$SPID" ] && kill -0 "$SPID" 2>/dev/null; then
    kill "$SPID" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$SPID" 2>/dev/null || break; sleep 0.5; done
    kill -9 "$SPID" 2>/dev/null
  fi
  # only the browser this test's page check started (its own profile folder)
  pkill -9 -f -- "--user-data-dir=$PROFILE" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- the synthetic fixture: a take the library must list on a fresh install
FIX="$T/library/20000101-000000-synthetic-test-fixture"
python3 - "$FIX" "$MODEL" <<'PY'
import json, math, os, struct, sys, wave
d, model = sys.argv[1:3]; os.makedirs(d)
title = "SYNTHETIC TEST FIXTURE (a 1 s tone, not a song)"
json.dump({"title": title, "created": 946684800, "seconds": 1.0, "format": "wav24", "favorite": False,
           "truncated": False, "render_seconds": 0.0, "song": 0, "variation": 0, "provided_score": False,
           "precision": "bf16", "model": model, "synthetic_fixture": True}, open(os.path.join(d, "meta.json"), "w"), indent=1)
json.dump({"title": title, "style": "synthetic test fixture: a 440 Hz tone written by tools/test-real.sh, not model output",
           "lyrics": "", "cot": "off", "duration": 1.0, "steps": 2, "vae": "standard", "sliders": [], "loras": [],
           "output_format": "wav24", "plan_only": False, "parent": ""}, open(os.path.join(d, "request.json"), "w"), indent=1)
with wave.open(os.path.join(d, "audio.wav"), "wb") as w:          # 1 s, 48 kHz, stereo, 24-bit, -18 dBFS
    w.setnchannels(2); w.setsampwidth(3); w.setframerate(48000)
    amp = int(0.125 * 8388607)
    frames = bytearray()
    for i in range(48000):
        s = struct.pack("<i", int(amp * math.sin(2 * math.pi * 440 * i / 48000)))[:3]
        frames += s + s
    w.writeframes(bytes(frames))
PY
check "a labelled synthetic fixture take is in the isolated test library" $? "$FIX"

# --- its own server: free port, CPU only (unless --gpu), a quarter of the cores, test library and settings only
PORT=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
n=$(python3 -c 'import os; print(os.cpu_count() or 4)'); use=$(( n / 4 > 2 ? n / 4 : 2 ))
PIN=(); command -v taskset >/dev/null && PIN=(taskset -c "0-$((use - 1))")    # Linux only; macOS has no core pinning
HIDE=(env CUDA_VISIBLE_DEVICES= GGML_BACKEND=CPU); WHERE="CPU only"
[ "$GPU" = 1 ] && { HIDE=(env); WHERE="GPU"; }
cd "$ROOT"
export RUACH_PAGE="$PAGE"
# HERESY 1145: never the studio's own lab: the test page would read and write the user's page settings, workspaces and styles
# there (on 03.10.2026 it replaced Viktor's Creator draft). The test server's /lab goes to a port nobody listens on.
export LAB_PORT=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
${HIDE[@]+"${HIDE[@]}"} nice -n 15 ${PIN[@]+"${PIN[@]}"} "$BIN" --host 127.0.0.1 --port "$PORT" \
  --model "$MODEL=models/YuE2-3B-$MODEL.gguf" --vae "standard=models/YuE2-Vae-F32.gguf" --vae "legacy=models/YuE2-Vae-legacy-F32.gguf" --vae "blend=models/YuE2-Vae-blend-F32.gguf" \
  --loras loras --sliders sliders --outputs "$T/library" --settings "$T/settings.json" > "$T/server.log" 2>&1 &
SPID=$!
# up to 3 minutes: on a Mac the Metal shaders are compiled at start, even for a CPU run
up=""; for _ in $(seq 1 360); do curl -sf "http://127.0.0.1:$PORT/props" >/dev/null && { up=1; break; }; kill -0 "$SPID" 2>/dev/null || break; sleep 0.5; done
[ -n "$up" ]; check "the test server answers (port $PORT, $MODEL, $WHERE, $use cores)" $? "see $T/server.log"
[ -n "$up" ] || exit 1
curl -s "http://127.0.0.1:$PORT/library" | python3 -c "
import json, sys; t = json.load(sys.stdin)['takes']
sys.exit(0 if any(x['name'] == '20000101-000000-synthetic-test-fixture' and x['title'].startswith('SYNTHETIC') for x in t) else 1)"
check "the server lists the fixture from the isolated library" $?

# --- the page against it, bounded (cdp-real.mjs has its own 7-minute guard; this one is 8)
echo "${B}cdp-real${X}  ${D}(the page, then a real 1-second song on the CPU)${X}"
TO=(); command -v timeout >/dev/null && TO=(timeout 480)      # cdp-real.mjs also stops itself after 7 minutes
${TO[@]+"${TO[@]}"} "$NODE" "$ROOT/tools/cdp-real.mjs" "http://127.0.0.1:$PORT/" 2>&1 | tee "$T/cdp-real.txt" | sed 's/^/  /'
r=${PIPESTATUS[0]}
counts=$(command grep -o '[0-9]* passed, [0-9]* failed' "$T/cdp-real.txt" | tail -1)
[ "$r" = 0 ]; check "cdp-real: ${counts:-no result}" $? "exit $r"

cleanup; SPID=""
pgrep -f -- "--user-data-dir=$PROFILE" >/dev/null; [ $? != 0 ]; check "the test's server and browser are stopped" $?
[ "$(fp)" = "$before" ]; check "the user's outputs/, settings.json and user/ are untouched" $?
harmless=$(command grep -c -i -E 'no CUDA-capable device|nccl' "$T/server.log" || true)
[ "$harmless" -gt 0 ] && echo "  ${D}server log: $harmless expected line(s) about the hidden GPU / NCCL (harmless here)${X}"

secs=$(( $(date +%s) - t0 ))
if [ "$fail" = 0 ] && [ "$KEEP" = 0 ]; then rm -rf "$T"; else echo "  ${D}kept $T${X}"; fi
echo
rm -rf "$PROFILE"
echo "${B}test-real${X}  $([ $fail = 0 ] && echo "$G" || echo "$R")$pass passed, $fail failed$X  ${D}${secs} s, $MODEL, $WHERE$([ "$GPU" = 0 ] && echo " on $use cores")${X}"
[ "$fail" = 0 ]
