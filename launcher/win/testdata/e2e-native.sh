#!/bin/bash
# e2e-native.sh · the real launcher binary (console mode) on a made-up native Studio, on test ports (never the Studio's own 7777 and
# 41870): the first start installs (a stand-in for install.ps1 makes .venv), the lab and the engine come up as two services and the
# page is opened; the engine killed is started again and the child it left is gone with it; Ctrl-C ends both and their children;
# --status; --report; an engine without models given up after five starts with its last line said; --selftest.
set -uo pipefail
cd "$(dirname "$0")/.."
PE=${E2E_PORT:-47791} PL=${E2E_LAB_PORT:-47871}
up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for p in $PE $PL; do up $p && { echo "✗ port $p is taken: E2E_PORT and E2E_LAB_PORT choose others"; exit 1; }; done
B=$(mktemp -d)
go build -o "$B/ruachstudio" ./cmd/ruachstudio || exit 1
S=$B/RuachStudio
mkdir -p "$S/lab" "$S/launcher"
echo 2.1.0 > "$S/VERSION"
cat > "$S/lab/lab.py" <<'EOF'
import http.server, os
port = int(os.environ.get("LAB_PORT", "41870"))
print("lab: listening on", port, "· PYTHONUTF8", os.environ.get("PYTHONUTF8"), flush=True)
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200 if s.path == "/health" else 404); s.end_headers(); s.wfile.write(b'{"status":"ok","jobs":{}}')
    def log_message(s, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
EOF
cat > "$S/launcher/start.py" <<'EOF'
import http.server, os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(os.path.join(root, "nomodels")):
    print("missing models/engine/yue2/YuE2-3B-Q8_0.gguf", flush=True)
    sys.exit(1)
port = int(os.environ.get("YUE2CPP_PORT", "7777"))
print(f"Ruach Studio 2.1.0 · RuachStudio  http://127.0.0.1:{port}", flush=True)
print("  engine       engine/cpu · up to 2 songs per pass", flush=True)
child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(600)"])   # yue-server under start.py
open(os.path.join(root, "child.pid"), "w").write(str(child.pid))
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200 if s.path in ("/health", "/hardware") else 404); s.end_headers(); s.wfile.write(b'{"backend":"CPU"}')
    def log_message(s, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
EOF
cat > "$B/install.sh" <<'EOF'
#!/bin/bash
mkdir -p "$1/.venv/bin" && ln -sf "$(command -v python3)" "$1/.venv/bin/python" && echo "install: .venv made"
EOF
chmod +x "$B/install.sh"
ok=0; fail() { echo "✗ $*"; ok=1; }
L=(--native --root "$S" --console --port "$PE" --lab-port "$PL" --restart-delay 300ms)
gone() { ! kill -0 "$1" 2>/dev/null || [ "$(ps -o stat= -p "$1" 2>/dev/null | cut -c1)" = Z ]; }

RUACH_INSTALL_EXE="$B/install.sh" "$B/ruachstudio" "${L[@]}" > "$B/out" 2>&1 &
P=$!
for i in $(seq 1 100); do grep -q "Ctrl-C ends it" "$B/out" && break; sleep 0.1; done
grep -q "install: .venv made" "$B/out" || fail "the first start did not install"
grep -q "\[open app\] http://127.0.0.1:$PE/" "$B/out" || fail "the page was not opened"
up $PL && up $PE || fail "the lab and the engine do not both answer"
grep -q "PYTHONUTF8 1" "$S/logs/lab.log" || fail "the lab's output did not reach logs/lab.log with PYTHONUTF8=1"
C1=$(cat "$S/child.pid")
E1=$(grep -o "engine started (pid [0-9]*)" "$S/logs/launcher.log" | tail -1 | grep -o "[0-9]*")
kill -9 "$E1"
for i in $(seq 1 50); do [ "$(grep -c "engine started" "$S/logs/launcher.log")" -ge 2 ] && up $PE && break; sleep 0.1; done
[ "$(grep -c "engine started" "$S/logs/launcher.log")" -ge 2 ] && up $PE || fail "the killed engine was not started again"
sleep 0.3; gone "$C1" || fail "the killed engine's child (pid $C1) outlived it"
C2=$(cat "$S/child.pid")
kill -INT $P; wait $P
sleep 0.5
up $PE && fail "the engine still answers after Ctrl-C"
up $PL && fail "the lab still answers after Ctrl-C"
gone "$C2" || fail "the engine's child (pid $C2) outlived Ctrl-C"
sed 's/^/  | /' "$B/out"
"$B/ruachstudio" "${L[@]}" --status > "$B/status" 2>&1
sed 's/^/  status | /' "$B/status"
grep -q "Studio       2.1.0" "$B/status" && grep -q "does not answer" "$B/status" || fail "--status"
"$B/ruachstudio" "${L[@]}" --report --report-dir "$B/rep" > "$B/rep.out" 2>&1 || fail "--report failed: $(cat "$B/rep.out")"
Z=$(ls "$B"/rep/RuachStudio-report-*.zip 2>/dev/null | head -1)
[ -n "$Z" ] && python3 -c 'import sys, zipfile; n = zipfile.ZipFile(sys.argv[1]).namelist(); print("  report |", " ".join(n)); sys.exit(0 if {"report.txt", "logs/lab.log", "logs/engine.log", "logs/launcher.log"} <= set(n) else 1)' "$Z" || fail "--report: no zip with report.txt and the three logs"
touch "$S/nomodels"
"$B/ruachstudio" "${L[@]}" > "$B/out2" 2>&1; c=$?
[ $c = 1 ] && grep -q "ended 5 times right after its start" "$B/out2" && grep -q "missing models" "$B/out2" || fail "an engine without models was not given up with its last line (exit $c)"
grep "ended 5 times" "$B/out2" | head -1 | sed 's/^/  | /'
up $PL && fail "the lab outlived a start given up"
"$B/ruachstudio" "${L[@]}" --selftest > "$B/self" 2>&1 || fail "--selftest: $(tail -3 "$B/self")"
grep "self-test" "$B/self" | sed 's/^/  | /'
up $PL && fail "the lab outlived the self-test"
rm -rf "$B"
[ $ok = 0 ] && echo "✓ e2e-native: install on the first start, two services, page, a killed engine started again without its old child, Ctrl-C ends all, status, report, a failing engine given up, self-test"
exit $ok
