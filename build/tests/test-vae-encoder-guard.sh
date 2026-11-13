#!/bin/bash
# HERESY 2484: an engine whose VAE file carries no encoder (a VAE-RS decoder alone) refuses every encode
# with a clear error instead of crashing on a missing tensor; with Standard named it encodes as before.
#
#   tests/test-vae-encoder-guard.sh <bin dir> <model GGUF> <Standard VAE GGUF> <VAE-RS GGUF> [port]
#
# CPU only: run it with a CPU build (cmake -DGGML_CUDA=OFF) or CUDA_VISIBLE_DEVICES= so no card is touched.
# The server is bound to 127.0.0.1 on a spare port and stopped at the end.

BIN=${1:?bin dir}; MODEL=${2:?model GGUF}; STD=${3:?Standard VAE GGUF}; RS=${4:?VAE-RS GGUF}; PORT=${5:-17891}
G='\e[1;32m'; R='\e[1;31m'; X='\e[0m'
T=$(mktemp -d); FAIL=0; SRV=
trap '[ -n "$SRV" ] && kill $SRV 2>/dev/null; wait 2>/dev/null; rm -rf "$T"' EXIT

ok()  { echo -e "${G}  ok${X}   $1"; }
bad() { echo -e "${R}  FAIL${X} $1"; FAIL=1; }

# two seconds of a stereo sine at 44.1 kHz (the encoder resamples to 48 kHz)
python3 - "$T/tone.wav" <<'EOF'
import math, struct, sys, wave
w = wave.open(sys.argv[1], "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
w.writeframes(b"".join(struct.pack("<hh", int(8000 * math.sin(2 * math.pi * 440 * i / 44100)), int(8000 * math.sin(2 * math.pi * 660 * i / 44100))) for i in range(88200)))
w.close()
EOF

echo "neural-codec"
"$BIN/neural-codec" --vae "$RS" --encode -i "$T/tone.wav" -o "$T/rs.vae" >"$T/nc-rs.log" 2>&1; rc=$?
if [ $rc = 1 ] && grep -q "carries no VAE encoder" "$T/nc-rs.log"; then ok "a VAE-RS file: exit 1 and the reason"; else bad "a VAE-RS file: exit $rc (a crash is 128 and up): $(tail -1 "$T/nc-rs.log")"; fi
"$BIN/neural-codec" --vae "$STD" --encode -i "$T/tone.wav" -o "$T/std.vae" >"$T/nc-std.log" 2>&1; rc=$?
if [ $rc = 0 ] && [ -s "$T/std.vae" ]; then ok "the Standard VAE: encoded ($(stat -c %s "$T/std.vae") bytes)"; else bad "the Standard VAE: exit $rc: $(tail -1 "$T/nc-std.log")"; fi

serve() {   # serve <log> <--vae args...>: start, wait for /health, leave the pid in SRV
    local log=$1; shift
    "$BIN/yue-server" --host 127.0.0.1 --port "$PORT" --model "$MODEL" "$@" >"$log" 2>&1 &
    SRV=$!
    for _ in $(seq 120); do
        curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && return 0
        kill -0 $SRV 2>/dev/null || return 1
        sleep 0.5
    done
    return 1
}
stop() { kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; SRV=; }
encode() { curl -s -o "$T/body" -w "%{http_code}" -F "audio=@$T/tone.wav" "http://127.0.0.1:$PORT/vae"; }
wait_job() {   # wait_job <id>: the job's final JSON in $T/job
    for _ in $(seq 240); do
        curl -s "http://127.0.0.1:$PORT/job?id=$1" >"$T/job"
        grep -qE '"status" *: *"(done|failed|cancelled)"' "$T/job" && return 0
        sleep 0.5
    done
    return 1
}

echo "yue-server, a VAE-RS decoder alone"
if serve "$T/srv-rs.log" --vae "rs=$RS"; then
    grep -q "carries no VAE encoder" "$T/srv-rs.log" && ok "the start warns" || bad "no warning at the start"
    curl -s "http://127.0.0.1:$PORT/props" | grep -q '"vae_encoder":false' && ok "/props says vae_encoder false" || bad "/props has no vae_encoder false"
    code=$(encode)
    if [ "$code" = 503 ] && grep -q "no VAE encoder" "$T/body"; then ok "POST /vae audio: 503 and the reason"; else bad "POST /vae audio: HTTP $code $(head -c 200 "$T/body")"; fi
    curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && kill -0 $SRV 2>/dev/null && ok "the server still answers" || bad "the server died"
    stop
else
    bad "the server did not start: $(tail -3 "$T/srv-rs.log")"
fi

echo "yue-server, VAE-RS first and Standard last (start.sh's order)"
if serve "$T/srv-std.log" --vae "rs=$RS" --vae "standard=$STD"; then
    grep -q "carries no VAE encoder" "$T/srv-std.log" && bad "a warning with Standard named" || ok "no warning"
    curl -s "http://127.0.0.1:$PORT/props" | grep -q '"vae_encoder":true' && ok "/props says vae_encoder true" || bad "/props has no vae_encoder true"
    code=$(encode); id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$T/body" 2>/dev/null)
    if [ "$code" = 200 ] && [ -n "$id" ] && wait_job "$id" && grep -q '"done"' "$T/job"; then ok "POST /vae audio: encoded"; else bad "POST /vae audio: HTTP $code $(head -c 200 "$T/body") $(head -c 200 "$T/job" 2>/dev/null)"; fi
    stop
else
    bad "the server did not start: $(tail -3 "$T/srv-std.log")"
fi

[ $FAIL = 0 ] && echo -e "${G}all passed${X}" || { echo -e "${R}failed${X}"; exit 1; }
