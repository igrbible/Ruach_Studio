#!/bin/bash
# e2e.sh · the real launcher binary (console mode) against fake-wsl.sh and a fake Studio health on :17790
set -uo pipefail
cd "$(dirname "$0")/.."
B=$(mktemp -d); export FAKE_WSL_STATE=$B/state RUACH_LAUNCHER_DATA=$B/data WSL_EXE=$PWD/testdata/fake-wsl.sh
mkdir -p "$FAKE_WSL_STATE"
go build -o "$B/ruachstudio" ./cmd/ruachstudio || exit 1
python3 -c '
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200 if s.path == "/health" else 404); s.end_headers(); s.wfile.write(b"{\"status\":\"ok\"}")
    def log_message(s, *a): pass
http.server.HTTPServer(("127.0.0.1", 17790), H).serve_forever()' &
H=$!
echo tar > "$B/RuachStudio-2.0.6-core.wsl"; (cd "$B" && sha256sum RuachStudio-2.0.6-core.wsl > RuachStudio-2.0.6-core.wsl.sha256)
ok=0; fail() { echo "✗ $*"; ok=1; }
"$B/ruachstudio" --console --port 17790 --wsl-file "$B/RuachStudio-2.0.6-core.wsl" > "$B/out" 2>&1 &
L=$!
for i in $(seq 1 50); do grep -q "Ctrl-C" "$B/out" && break; sleep 0.2; done
kill -INT $L; wait $L
cat "$B/out" | sed 's/^/  | /'
grep -q -- "--install --from-file $B/RuachStudio-2.0.6-core.wsl --name RuachStudio --location $B/data/wsl --no-launch" "$FAKE_WSL_STATE/calls" || fail "install call"
grep -q "\[open app\] http://localhost:17790/" "$B/out" || fail "open app"
grep -q -- "--exec /usr/local/bin/ruach-fetch-models" "$FAKE_WSL_STATE/calls" || fail "models fetched on the first start"
[ -f "$FAKE_WSL_STATE/installed" ] || fail "installed"
sleep 0.5; kill -0 "$(cat "$FAKE_WSL_STATE/alive.pid")" 2>/dev/null && fail "keep-alive left running"
"$B/ruachstudio" --status 2>&1 | sed 's/^/  status | /'
echo damaged > "$B/RuachStudio-2.0.6-core.wsl"; rm -f "$FAKE_WSL_STATE/installed"
"$B/ruachstudio" --console --port 17790 --wsl-file "$B/RuachStudio-2.0.6-core.wsl" > "$B/out2" 2>&1; c=$?
grep -q "is damaged" "$B/out2" && [ $c = 1 ] || fail "damaged file not refused (exit $c)"
grep "damaged" "$B/out2" | head -1 | sed 's/^/  | /'
touch "$FAKE_WSL_STATE/installed"
RUACH_LAUNCHER_ANSWER=no "$B/ruachstudio" --uninstall; [ -f "$FAKE_WSL_STATE/installed" ] || fail "a no still uninstalled"
RUACH_LAUNCHER_ANSWER=yes "$B/ruachstudio" --uninstall > /dev/null; [ -f "$FAKE_WSL_STATE/installed" ] && fail "uninstall"
kill $H; rm -rf "$B"
[ $ok = 0 ] && echo "✓ e2e: install, models on the first start, keep-alive, health, open, Ctrl-C, status, damaged file, uninstall (no and yes)"
exit $ok
