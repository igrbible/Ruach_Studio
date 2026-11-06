"""HERESY 2005: the lab relays a chat server on this machine or the local network, its own paths only. HERESY 2138 (the audit of 06.11.2026, 2.1): what
it gives back is JSON alone (a page, a script or a text from the server said as JSON, never passed on as they came), and it connects to the very
address it checked, the name kept for the Host header (a name that answers a second time elsewhere, DNS rebinding, is not asked again).
   python3 lab/test_relay.py"""
import http.server
import json
import socket
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
    hosts = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        Chat.hosts.append(self.headers.get("Host"))
        if self.path.startswith("/html/"):                # a server that answers a page with a script in it
            kind, out = "text/html", b"<!doctype html><script>fetch('/health').then(r => r.text()).then(t => document.title = t)</script>"
        elif self.path.startswith("/js/"):
            kind, out = "application/javascript", b"alert(document.domain)"
        elif self.path.startswith("/missing/"):
            self.send_response(404); self.send_header("Content-Type", "text/plain"); self.send_header("Content-Length", "9"); self.end_headers()
            return self.wfile.write(b"Not Found")
        elif self.path.startswith("/mislabelled/"):       # JSON said to be a page: what it is counts, not what it says it is
            kind, out = "text/html", json.dumps({"data": []}).encode()
        else:
            kind, out = "application/json", json.dumps({"data": [{"id": "m", "owned_by": "vllm"}]}).encode()
        self.send_response(200); self.send_header("Content-Type", kind); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)

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

# HERESY 2138 (2.1): JSON alone
for path, what, want in (("/html/v1/models", "a page with a script", 502), ("/js/v1/models", "a script", 502), ("/missing/v1/models", "a 404 in plain text", 404)):
    code, out, ctype = relay.relay(f"http://127.0.0.1:{port}{path}", "GET", timeout=5)
    try:
        said = json.loads(out)
    except ValueError:
        said = None
    check(f"{what}: {want}, said as JSON, never passed on as it came", code == want and ctype.startswith("application/json") and isinstance(said, dict) and
          "not JSON" in said.get("error", "") and not out.startswith(b"<") and not out.startswith(b"alert"), (code, ctype, out[:160]))
code, out, ctype = relay.relay(f"http://127.0.0.1:{port}/mislabelled/v1/models", "GET", timeout=5)
check("JSON a server calls text/html: relayed, as JSON", code == 200 and json.loads(out) == {"data": []} and ctype.startswith("application/json"), (code, ctype, out))

# HERESY 2138 (2.1): the address checked is the address asked. A stand-in resolver answers the name with this machine the first time and with an
# address on the internet after that; the relay must ask the server it checked, once, with the name in its Host header
real_gai, asked = socket.getaddrinfo, []


def rebinding(host, *a, **k):
    if host == "rebind.test":
        asked.append(host)
        return real_gai("127.0.0.1" if len(asked) == 1 else "8.8.8.8", *a, **k)
    return real_gai(host, *a, **k)


socket.getaddrinfo = rebinding
Chat.hosts.clear()
try:
    code, out, _ = relay.relay(f"http://rebind.test:{port}/v1/models", "GET", timeout=5)
finally:
    socket.getaddrinfo = real_gai
check("a name that answers elsewhere the second time: asked at the address checked, the name looked up once", code == 200 and len(asked) == 1, (code, asked, out[:120]))
check("  the server hears the name it was asked by (Host)", Chat.hosts == [f"rebind.test:{port}"], Chat.hosts)
asked.clear()
socket.getaddrinfo = lambda host, *a, **k: (asked.append(host), real_gai("8.8.8.8" if host == "rebind.test" else host, *a, **k))[1]
try:
    relay.relay(f"http://rebind.test:{port}/v1/models", "GET", timeout=5)
    check("a name that points out to the internet: refused before anything is sent", False, "relayed")
except ValueError as e:
    check("a name that points out to the internet: refused before anything is sent", "not on this machine" in str(e) and asked == ["rebind.test"], (e, asked))
finally:
    socket.getaddrinfo = real_gai

srv.shutdown()
code, out, ctype = relay.relay(f"http://127.0.0.1:{port}/v1/models", "GET", timeout=3)
check("a server that is gone: 502, said", code == 502 and b"did not answer" in out, (code, out))
check("  said as JSON", ctype.startswith("application/json") and "did not answer" in json.loads(out)["error"], (ctype, out))
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
