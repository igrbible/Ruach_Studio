"""HERESY 2138 (the audit of 06.11.2026, 2.2): the engine says on every answer who may put the Studio in a frame (X-Frame-Options, Content-Security-Policy
frame-ancestors) and the relay says it is JSON and runs nothing (nosniff, CSP sandbox). The https door (lab/tls_door.py) passes the engine's answers to
:7443 byte for byte: here a stand-in engine answers with those headers, the door's own visit() carries a request to it and the answer back, and every
header arrives as the engine said it (and the visitor's address as X-Ruach-Peer, HERESY 2011). No TLS here: the bytes inside it are the same.
   python3 lab/test_tls_door_headers.py"""
import asyncio
import http.client
import http.server
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tls_door  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


FRAME = "frame-ancestors 'self' http://localhost:42000 http://127.0.0.1:42000"
seen = {}


class Engine(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        seen["peer"] = self.headers.get("X-Ruach-Peer")
        body = b'{"error":"x"}' if self.path.startswith("/lab/relay") else b"<!doctype html><title>Ruach Studio</title>"
        self.send_response(200)
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Content-Security-Policy", FRAME)
        if self.path.startswith("/lab/relay"):
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "sandbox; default-src 'none'")
        else:
            self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


engine = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Engine)
threading.Thread(target=engine.serve_forever, daemon=True).start()
tls_door.TO_HOST, tls_door.TO_PORT = "127.0.0.1", engine.server_address[1]
tls_door.allowed = lambda addr: True                  # who may come in is user/access.json's: not this test's question

loop = asyncio.new_event_loop()
ready = threading.Event()
door = {}


def serve():
    asyncio.set_event_loop(loop)
    door["server"] = loop.run_until_complete(asyncio.start_server(tls_door.visit, "127.0.0.1", 0))
    door["port"] = door["server"].sockets[0].getsockname()[1]
    ready.set()
    loop.run_forever()


threading.Thread(target=serve, daemon=True).start()
ready.wait(10)


def through(path):
    c = http.client.HTTPConnection("127.0.0.1", door["port"], timeout=10)
    c.request("GET", path, headers={"X-Ruach-Peer": "6.6.6.6"})
    r = c.getresponse()
    r.read()
    heads = r.getheaders()
    c.close()
    return r.status, heads


st, heads = through("/")
named = [(k.lower(), v) for k, v in heads]
check("the page through the door: X-Frame-Options as the engine said it", ("x-frame-options", "SAMEORIGIN") in named, heads)
check("  Content-Security-Policy frame-ancestors as the engine said it", ("content-security-policy", FRAME) in named, heads)
check("  the visitor's address as X-Ruach-Peer, the one it sent dropped (2011)", seen.get("peer") == "127.0.0.1", seen)
st, heads = through("/lab/relay?to=http://127.0.0.1:9/v1/models")
named = [(k.lower(), v) for k, v in heads]
csp = [v for k, v in named if k == "content-security-policy"]
check("the relay through the door: nosniff, both policies (frames and sandbox), JSON",
      ("x-content-type-options", "nosniff") in named and FRAME in csp and "sandbox; default-src 'none'" in csp and
      ("content-type", "application/json; charset=utf-8") in named, heads)


async def done():                                      # the door's visits wait on the engine's open connections: ended here, not left pending
    door["server"].close()
    for t in [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]:
        t.cancel()
    await asyncio.sleep(0.05)


asyncio.run_coroutine_threadsafe(done(), loop).result(10)
loop.call_soon_threadsafe(loop.stop)
engine.shutdown()
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
