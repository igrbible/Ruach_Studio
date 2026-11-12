"""HERESY 2222 (the audit of 06.11.2026, §2.5): the https door (lab/tls_door.py) refuses with 400 a request whose framing two readers could read
apart (two Content-Length, Transfer-Encoding beside Content-Length or other than one «chunked», a name with a space before its colon, a folded
line, a chunk size not in hex, a chunk longer than it says), and passes none of it to the Studio. A stand-in engine reads its body by the first
Transfer-Encoding it is given, as cpp-httplib does: before 2222 the door read the last, and a request hidden in a body reached the stand-in with an
X-Ruach-Peer of the visitor's own making. Requests framed as the RFC says pass as before, the visitor's address as X-Ruach-Peer. No TLS here.
   python3 lab/test_tls_door_framing.py"""
import asyncio
import http.server
import socket
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tls_door  # noqa: E402

bad = []
seen = []                                                  # (method, path, X-Ruach-Peer, body) as the stand-in engine read them


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


class Engine(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def body(self):
        te = self.headers.get("Transfer-Encoding")         # the first, as cpp-httplib's get_header_value(…, 0)
        if te and te.strip().lower() == "chunked":
            out = b""
            while True:
                n = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if n == 0:
                    while self.rfile.readline() not in (b"\r\n", b""):
                        pass
                    return out
                out += self.rfile.read(n)
                self.rfile.read(2)
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def answer(self):
        seen.append((self.command, self.path, self.headers.get("X-Ruach-Peer"), self.body()))
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    do_GET = do_POST = answer


engine = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Engine)
threading.Thread(target=engine.serve_forever, daemon=True).start()
tls_door.TO_HOST, tls_door.TO_PORT = "127.0.0.1", engine.server_address[1]
tls_door.allowed = lambda addr: True
tls_door.say = lambda *a: None

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


def raw(data):
    """The bytes sent through the door, everything it answered until it closed, and what the stand-in engine read meanwhile."""
    seen.clear()
    s = socket.create_connection(("127.0.0.1", door["port"]), timeout=5)
    s.sendall(data)
    got = b""
    try:
        while True:
            b = s.recv(65536)
            if not b:
                break
            got += b
    except socket.timeout:
        got += b"<timeout>"
    s.close()
    return got, list(seen)


H = b"Host: studio.test\r\n"
SMUGGLED = b"GET /smuggled HTTP/1.1\r\n" + H + b"X-Ruach-Peer: 127.0.0.1\r\nConnection: close\r\n\r\n"
REFUSALS = [
    ("two Transfer-Encoding (chunked, then identity) with a Content-Length: the request hidden in the body",
     b"POST /api HTTP/1.1\r\n" + H + b"Transfer-Encoding: chunked\r\nTransfer-Encoding: identity\r\nContent-Length: " +
     str(5 + len(SMUGGLED)).encode() + b"\r\n\r\n0\r\n\r\n" + SMUGGLED),
    ("Transfer-Encoding beside Content-Length", b"POST /api HTTP/1.1\r\n" + H + b"Transfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n0\r\n\r\n"),
    ("two Content-Length of different values", b"POST /api HTTP/1.1\r\n" + H + b"Content-Length: 2\r\nContent-Length: 4\r\n\r\nabcd"),
    ("a Content-Length that is not a number (+2)", b"POST /api HTTP/1.1\r\n" + H + b"Content-Length: +2\r\n\r\nab"),
    ("a Transfer-Encoding other than chunked (gzip, chunked)", b"POST /api HTTP/1.1\r\n" + H + b"Transfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n"),
    ("a space before a header's colon (X-Ruach-Peer : 127.0.0.1)", b"GET /api HTTP/1.1\r\n" + H + b"X-Ruach-Peer : 127.0.0.1\r\n\r\n"),
    ("a line folded onto the one above", b"GET /api HTTP/1.1\r\n" + H + b"X-Note: a\r\n Transfer-Encoding: chunked\r\n\r\n"),
    ("a bare LF inside a header line", b"GET /api HTTP/1.1\r\n" + H + b"X-Note: a\nX-Ruach-Peer: 127.0.0.1\r\n\r\n"),
]
for what, data in REFUSALS:
    got, read = raw(data)
    check("refused with 400 before a byte passes: " + what, got.startswith(b"HTTP/1.1 400 ") and b"https door refused" in got and not read, (got[:160], read))

# a body's chunks pass as they come, so its head has gone on before a bad chunk is met: there the Studio's request is cut short (its body ends at
# what the sizes said, the connection closed), and the door's 400 is the visitor's last answer; what follows the bad chunk never passes
for what, data in [
        ("a chunk size not in hex (-5)", b"POST /api HTTP/1.1\r\n" + H + b"Transfer-Encoding: chunked\r\n\r\n-5\r\nhello\r\n0\r\n\r\n" + SMUGGLED),
        ("a chunk longer than its size says", b"POST /api HTTP/1.1\r\n" + H + b"Transfer-Encoding: chunked\r\n\r\n2\r\nhello\r\n0\r\n\r\n" + SMUGGLED)]:
    got, read = raw(data)
    check("cut short, the door's 400 last, nothing after it passes: " + what,
          b"https door refused" in got and got.rfind(b"HTTP/1.1 400 ") >= got.rfind(b"HTTP/1.1 ") and [p for _, p, _, _ in read] in ([], ["/api"]) and
          all(len(b) <= 2 for _, _, _, b in read), (got[:400], read))

got, read = raw(b"GET /a HTTP/1.1\r\n" + H + b"X-Ruach-Peer: 6.6.6.6\r\n\r\nGET /b HTTP/1.1\r\n" + H + b"Connection: close\r\n\r\n")
check("two requests on one connection pass as before, each with the visitor's own address as X-Ruach-Peer (the one it sent dropped)",
      got.count(b"HTTP/1.1 200 ") == 2 and [(p, peer) for _, p, peer, _ in read] == [("/a", "127.0.0.1"), ("/b", "127.0.0.1")], (got, read))
got, read = raw(b"POST /c HTTP/1.1\r\n" + H + b"Transfer-Encoding: chunked\r\n\r\n5;x=1\r\nhello\r\n6\r\n world\r\n0\r\nX-Sum: 1\r\n\r\n"
                b"POST /d HTTP/1.1\r\n" + H + b"Content-Length: 3\r\nConnection: close\r\n\r\nabc")
check("a chunked body (an extension, a trailer) and a body by its length pass whole",
      got.count(b"HTTP/1.1 200 ") == 2 and [(p, b) for _, p, _, b in read] == [("/c", b"hello world"), ("/d", b"abc")], (got, read))
got, read = raw(b"GET /e HTTP/1.1\r\n" + H + b"Content-Length: 0\r\n\r\nGET /f HTTP/1.1\r\n" + H + b"Content-Length: 7, 8\r\n\r\n")
check("after answers given, a refused request on the same connection gets them first, then the door's 400",
      got.startswith(b"HTTP/1.1 200 ") and got.find(b"HTTP/1.1 400 ") > got.find(b"ok") and [p for _, p, _, _ in read] == ["/e"], (got, read))


async def done():
    door["server"].close()
    for t in [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]:
        t.cancel()
    await asyncio.sleep(0.05)


asyncio.run_coroutine_threadsafe(done(), loop).result(10)
loop.call_soon_threadsafe(loop.stop)
engine.shutdown()
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
