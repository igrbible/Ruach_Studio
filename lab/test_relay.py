"""HERESY 2005: the lab relays a chat server on this machine or the local network, its own paths only. python3 lab/test_relay.py"""
import http.server
import json
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import relay  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


for url, why in (("http://127.0.0.1:8008/v1/models", "loopback"), ("http://172.20.1.7:8008/v1/chat/completions", "the local network"),
                 ("http://10.0.0.5:1234/api/v0/models", "LM Studio's own"), ("http://localhost:11434/api/ps", "Ollama's own")):
    try:
        relay.allowed(url)
        check("relayed: " + why, True)
    except ValueError as e:
        check("relayed: " + why, False, e)
for url, why in (("http://8.8.8.8/v1/models", "a server out on the internet"), ("http://127.0.0.1:7777/lab/trash", "a path no chat client asks"),
                 ("ftp://127.0.0.1/v1/models", "not http"), ("", "nothing")):
    try:
        relay.allowed(url)
        check("refused: " + why, False, "relayed")
    except ValueError as e:
        check("refused: " + why, True, e)


class Chat(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        out = json.dumps({"data": [{"id": "m", "owned_by": "vllm"}]}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        out = json.dumps({"echo": json.loads(body)}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Chat)
threading.Thread(target=srv.serve_forever, daemon=True).start()
port = srv.server_address[1]
code, out, ctype = relay.relay(f"http://127.0.0.1:{port}/v1/models", "GET")
check("GET models through the relay, as the server said it", code == 200 and json.loads(out)["data"][0]["id"] == "m" and "json" in ctype, (code, out))
code, out, _ = relay.relay(f"http://127.0.0.1:{port}/v1/chat/completions", "POST", json.dumps({"q": 1}).encode())
check("POST a question through the relay, the body as sent", code == 200 and json.loads(out)["echo"] == {"q": 1}, (code, out))
srv.shutdown()
code, out, _ = relay.relay(f"http://127.0.0.1:{port}/v1/models", "GET", timeout=3)
check("a server that is gone: 502, said", code == 502 and b"did not answer" in out, (code, out))
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
