"""HERESY 2238 (Viktor 07.11.2026: «H2 ставь»): the https door (lab/tls_door.py) speaks HTTP/2 to a browser that offers it and HTTP/1.1 to the rest.
Over TLS, against a stand-in engine (HTTP/1.1, as the Studio): ALPN gives «h2»; forty requests run at once on one connection while an event
stream stays open; a large range and a whole 8 MB answer arrive byte for byte; a stream the visitor stops reading holds no other; bodies by length
and without one reach the engine whole; each stream carries the visitor's own address as X-Ruach-Peer, its :authority as Host, its cookies on one
line. What 2222 refuses stays refused: a body longer or shorter than its Content-Length never reaches the engine whole (not even the one whose
last bytes came before the excess), two Content-Length or one not a number, a path with a space, a host that is not one, an uppercase or spaced header name,
Transfer-Encoding. A reset stream and a GOAWAY close the engine's side. The visitor refused by user/access.json gets the door's page; a Studio
that does not answer, a 502. HTTP/1.1 over the same TLS answers as before. Needs the Studio's .venv (h2, httpx).
   .venv/bin/python lab/test_tls_door_h2.py"""
import asyncio
import hashlib
import http.client
import http.server
import json
import os
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tls_door  # noqa: E402

import h2.config  # noqa: E402
import h2.connection  # noqa: E402
import h2.errors  # noqa: E402
import h2.events  # noqa: E402
import h2.exceptions  # noqa: E402
import httpx  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:600] + ")"))
    if not ok:
        bad.append(what)


BIG = os.urandom(8 << 20)
seen = []                                       # what the stand-in engine read: dicts, a POST only once its whole body came
events_closed = threading.Event()
stop_events = threading.Event()
SLOW = 0.3


class Engine(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def note(self, **more):
        seen.append(dict(method=self.command, path=self.path, peer=self.headers.get_all("X-Ruach-Peer"), host=self.headers.get("Host"),
                         cookie=self.headers.get_all("Cookie"), te=self.headers.get("Transfer-Encoding"), conn=self.headers.get("Connection"), **more))

    def send(self, code, body, ctype="application/json", extra=()):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        p = self.path
        self.note()
        if p == "/events":                           # an event stream: chunked, a tick every 0.1 s, until the door closes it
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            n = 0
            try:
                while not stop_events.is_set():
                    msg = b"data: tick %d\n\n" % n
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(msg), msg))
                    self.wfile.flush()
                    n += 1
                    time.sleep(0.1)
            except OSError:
                events_closed.set()
            self.close_connection = True
        elif p.startswith("/n/"):
            time.sleep(SLOW)
            self.send(200, json.dumps({"n": p[3:]}).encode())
        elif p == "/big":
            rng = self.headers.get("Range")
            if rng and rng.startswith("bytes="):
                a, b = rng[6:].split("-")
                a, b = int(a), int(b or len(BIG) - 1)
                self.send(206, BIG[a:b + 1], "application/octet-stream", [("Content-Range", f"bytes {a}-{b}/{len(BIG)}")])
            else:
                self.send(200, BIG, "application/octet-stream", [("Accept-Ranges", "bytes")])
        elif p == "/close":                          # an answer delimited by the close alone
            self.send_response(200)
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b"until the end" * 1000)
            self.close_connection = True
        else:
            self.send(200, b"{}")

    do_HEAD = do_GET

    def do_POST(self):
        te = self.headers.get("Transfer-Encoding")
        want = None
        try:
            if te and te.lower() == "chunked":
                body = b""
                while True:
                    n = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                    if n == 0:
                        while self.rfile.readline() not in (b"\r\n", b""):
                            pass
                        break
                    body += self.rfile.read(n)
                    self.rfile.read(2)
            else:
                want = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(want)
                if len(body) != want:
                    return                           # cut short: the engine never had this request whole
        except (OSError, ValueError):
            return
        self.note(n=len(body), sha=hashlib.sha256(body).hexdigest(), cl=want)
        self.send(200, json.dumps({"n": len(body), "sha": hashlib.sha256(body).hexdigest(), "te": te}).encode())


http.server.ThreadingHTTPServer.daemon_threads = True
engine = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Engine)
threading.Thread(target=engine.serve_forever, daemon=True).start()
tls_door.TO_HOST, tls_door.TO_PORT = "127.0.0.1", engine.server_address[1]
tls_door.allowed = lambda addr: True
tls_door.say = lambda *a: None

tmp = tempfile.TemporaryDirectory()
CERT, KEY = Path(tmp.name) / "c.pem", Path(tmp.name) / "k.pem"
subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-keyout", str(KEY),
                "-out", str(CERT), "-subj", "/CN=studio.test", "-addext", "subjectAltName=DNS:studio.test,IP:127.0.0.1"], check=True, capture_output=True)
if hasattr(tls_door, "context"):
    ctx = tls_door.context(CERT, KEY)
else:                                               # the door before 2238: its main() made this context
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(str(CERT), str(KEY))
    ctx.set_alpn_protocols(["http/1.1"])

loop = asyncio.new_event_loop()
ready = threading.Event()
door = {"visits": 0}


async def counted(r, w):
    door["visits"] += 1
    await tls_door.visit(r, w)


def serve():
    asyncio.set_event_loop(loop)
    door["server"] = loop.run_until_complete(asyncio.start_server(counted, "127.0.0.1", 0, ssl=ctx))
    door["port"] = door["server"].sockets[0].getsockname()[1]
    ready.set()
    loop.run_forever()


threading.Thread(target=serve, daemon=True).start()
ready.wait(10)
PORT = door["port"]


def client_ctx(alpn):
    c = ssl.create_default_context()
    c.check_hostname, c.verify_mode = False, ssl.CERT_NONE
    if alpn:
        c.set_alpn_protocols(alpn)
    return c


def wait(cond, secs):
    end = time.time() + secs
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.05)
    return cond()


# ---- ALPN, and HTTP/1.1 as before
s = client_ctx(["h2", "http/1.1"]).wrap_socket(socket.create_connection(("127.0.0.1", PORT), timeout=5), server_hostname="studio.test")
check("ALPN: a client offering h2 and http/1.1 is given h2", s.selected_alpn_protocol() == "h2", s.selected_alpn_protocol())
s.close()
for alpn in (["http/1.1"], None):
    seen.clear()
    c = http.client.HTTPSConnection("127.0.0.1", PORT, context=client_ctx(alpn), timeout=10)
    c.request("GET", "/n/1", headers={"Host": "studio.test", "X-Ruach-Peer": "6.6.6.6"})
    r = c.getresponse()
    body = r.read()
    c.close()
    check("HTTP/1.1 over TLS (ALPN " + str(alpn) + ") answers as before, the visitor's address as X-Ruach-Peer",
          r.status == 200 and body == b'{"n": "1"}' and [(x["path"], x["peer"], x["host"]) for x in seen] == [("/n/1", ["127.0.0.1"], "studio.test")],
          (r.status, body, seen))


# ---- httpx over HTTP/2: many streams at once beside an open event stream; large answers; bodies
async def through_httpx():
    out = {}
    async with httpx.AsyncClient(http2=True, verify=False, base_url=f"https://127.0.0.1:{PORT}", timeout=30) as c:
        v0 = door["visits"]
        async with c.stream("GET", "/events") as ev:
            it = ev.aiter_bytes()
            first = await it.__anext__()
            t0 = time.time()
            rs = await asyncio.gather(*[c.get(f"/n/{i}", headers={"x-ruach-peer": "6.6.6.6"}) for i in range(40)])
            out["dt"] = time.time() - t0
            out["open"] = not events_closed.is_set()
            later = await it.__anext__()
            out["events"] = (ev.http_version, ev.headers.get("content-type"), first[:12], later[:10])
        out["rs"] = [(r.status_code, r.http_version, r.json().get("n")) for r in rs]
        r = await c.get("/big", headers={"range": "bytes=1000000-5999999"})
        out["range"] = (r.status_code, r.http_version, r.headers.get("content-range"), len(r.content), r.content == BIG[1000000:6000000])
        r = await c.get("/big")
        out["big"] = (r.status_code, len(r.content), r.content == BIG)
        r = await c.head("/big")
        out["head"] = (r.status_code, r.headers.get("content-length"), len(r.content))
        r = await c.get("/close")
        out["close"] = (r.status_code, r.content == b"until the end" * 1000)
        body = os.urandom(3 << 20)
        r = await c.post("/up", content=body)
        out["post"] = (r.status_code, r.json(), hashlib.sha256(body).hexdigest())

        async def gen():
            for i in range(5):
                yield body[i * 1000:(i + 1) * 1000]
        r = await c.post("/up2", content=gen())
        out["post2"] = (r.status_code, r.json(), hashlib.sha256(body[:5000]).hexdigest())
        out["visits"] = door["visits"] - v0
    return out


seen.clear()
o = asyncio.run(through_httpx())
check("forty requests at once on HTTP/2 while an event stream stays open: all 200 over HTTP/2, each its own answer",
      sorted(o["rs"], key=lambda x: int(x[2])) == [(200, "HTTP/2", str(i)) for i in range(40)], o["rs"])
check(f"  they ran side by side ({o['dt']:.2f} s for 40 × {SLOW} s; six HTTP/1.1 connections would need {40 / 6 * SLOW:.1f} s), the stream still open",
      o["dt"] < 40 / 6 * SLOW * 0.75 and o["open"], (o["dt"], o["open"]))
check("  the event stream itself over HTTP/2, ticking before and after", o["events"][0] == "HTTP/2" and o["events"][1] == "text/event-stream" and
      o["events"][2].startswith(b"data: tick") and o["events"][3].startswith(b"data: tick"), o["events"])
check("  every one of them on one connection to the door", o["visits"] == 1, o["visits"])
peers = [(x["peer"], x["conn"]) for x in seen if x["path"].startswith("/n/")]
check("  each stream reached the engine with the visitor's own address as X-Ruach-Peer (the one it sent dropped), Connection: close",
      len(peers) == 40 and all(p == (["127.0.0.1"], "close") for p in peers), peers[:3])
check("a 5 MB range over HTTP/2: 206, its Content-Range, every byte", o["range"] == (206, "HTTP/2", "bytes 1000000-5999999/8388608", 5000000, True), o["range"])
check("a whole 8 MB answer over HTTP/2, every byte", o["big"] == (200, 8 << 20, True), o["big"])
check("HEAD: the length said, no body", o["head"] == (200, str(8 << 20), 0), o["head"])
check("an answer delimited by the engine's close arrives whole", o["close"] == (200, True), o["close"])
check("a 3 MB body by its length reaches the engine whole", o["post"][0] == 200 and o["post"][1]["sha"] == o["post"][2] and o["post"][1]["te"] is None,
      o["post"])
check("a body without a length goes to the engine chunked, whole", o["post2"][0] == 200 and o["post2"][1]["sha"] == o["post2"][2] and
      (o["post2"][1]["te"] or "").lower() == "chunked", o["post2"])


# ---- a raw HTTP/2 client: what the door refuses, flow control, resets, GOAWAY
class Raw:
    def __init__(self, window=None):
        self.s = client_ctx(["h2"]).wrap_socket(socket.create_connection(("127.0.0.1", PORT), timeout=5), server_hostname="studio.test")
        self.c = h2.connection.H2Connection(h2.config.H2Configuration(client_side=True, header_encoding=None, validate_outbound_headers=False,
                                                                      normalize_outbound_headers=False, validate_inbound_headers=False))
        self.c.initiate_connection()
        if window:
            self.c.increment_flow_control_window(window)
        self.out()
        self.st, self.goaway, self.eof, self.ack = {}, None, False, True

    def out(self):
        d = self.c.data_to_send()
        if d:
            self.s.sendall(d)

    def req(self, headers, body=None, end=True, sid=None):
        sid = sid or self.c.get_next_available_stream_id()
        self.st[sid] = {"status": None, "headers": [], "body": b"", "done": False, "reset": None}
        self.c.send_headers(sid, headers, end_stream=end and body is None)
        if body is not None:
            self.c.send_data(sid, body, end_stream=end)
        self.out()
        return sid

    def pump(self, until, secs=5):
        end = time.time() + secs
        self.s.settimeout(0.1)
        while time.time() < end and not until():
            try:
                d = self.s.recv(65536)
            except socket.timeout:
                continue
            except (OSError, ssl.SSLError):
                d = b""
            if not d:
                self.eof = True
                break
            try:
                evs = self.c.receive_data(d)
            except h2.exceptions.ProtocolError as e:
                self.goaway = "client: " + str(e)
                break
            for e in evs:
                st = self.st.get(getattr(e, "stream_id", None))
                if isinstance(e, h2.events.ResponseReceived):
                    st["headers"] = e.headers
                    st["status"] = int(dict(e.headers)[b":status"])
                elif isinstance(e, h2.events.DataReceived):
                    st["body"] += e.data
                    if self.ack and e.flow_controlled_length:
                        self.c.acknowledge_received_data(e.flow_controlled_length, e.stream_id)
                elif isinstance(e, h2.events.StreamEnded):
                    st["done"] = True
                elif isinstance(e, h2.events.StreamReset):
                    st["reset"] = e.error_code
                elif isinstance(e, h2.events.ConnectionTerminated):
                    self.goaway = e.error_code
            try:
                self.out()
            except OSError:
                pass
        return until()

    def ended(self, sid):
        return lambda: self.st[sid]["done"] or self.st[sid]["reset"] is not None or self.goaway is not None or self.eof

    def close(self):
        self.s.close()


def H(method=b"GET", path=b"/n/0", authority=b"studio.test", *more):
    return [(b":method", method), (b":path", path), (b":scheme", b"https"), (b":authority", authority)] + list(more)


raw = Raw()
raw.pump(lambda: raw.c.remote_settings.max_concurrent_streams != 2 ** 32 - 1 and raw.c.remote_settings.max_concurrent_streams < 1000, 3)
check("the door's settings: at most 32 streams at once, header lists to 64 KB",
      (raw.c.remote_settings.max_concurrent_streams, raw.c.remote_settings.max_header_list_size) == (32, 65536),
      (raw.c.remote_settings.max_concurrent_streams, raw.c.remote_settings.max_header_list_size))
seen.clear()
sid = raw.req(H(b"GET", b"/n/7", b"studio.test:7443", (b"cookie", b"a=1"), (b"cookie", b"b=2"), (b"x-ruach-peer", b"6.6.6.6")))
raw.pump(raw.ended(sid))
check("cookies in two fields reach the engine on one line; :authority as Host; X-Ruach-Peer the visitor's own, once",
      raw.st[sid]["status"] == 200 and [(x["cookie"], x["host"], x["peer"]) for x in seen] == [(["a=1; b=2"], "studio.test:7443", ["127.0.0.1"])],
      (raw.st[sid], seen))

# a stream the visitor stops reading holds no other: /big unread past its window, /n/2 answered meanwhile on the same connection
raw2 = Raw(window=16 << 20)
raw2.ack = False
big = raw2.req(H(b"GET", b"/big"))
raw2.pump(lambda: len(raw2.st[big]["body"]) >= 65535, 5)
held = len(raw2.st[big]["body"])
small = raw2.req(H(b"GET", b"/n/2"))
raw2.pump(raw2.ended(small), 5)
check("a stream its visitor stops reading gets no more than its window (65535) and holds no other stream",
      held == 65535 and raw2.st[small]["status"] == 200 and raw2.st[small]["done"] and len(raw2.st[big]["body"]) == 65535,
      (held, raw2.st[small], len(raw2.st[big]["body"])))
raw2.c.acknowledge_received_data(65535, big)
raw2.ack = True
raw2.out()
raw2.pump(raw2.ended(big), 20)
check("  and gets the rest, byte for byte, once it reads again", raw2.st[big]["done"] and raw2.st[big]["body"] == BIG, len(raw2.st[big]["body"]))
raw2.close()


def refused(what, headers, body=None, chunks=(), path=None, expect_400=True):
    seen.clear()
    r = Raw()
    sid = r.req(headers, body, end=not chunks)
    for i, (piece, end, pause) in enumerate(chunks):
        time.sleep(pause)
        r.c.send_data(sid, piece, end_stream=end)
        r.out()
    r.pump(r.ended(sid), 5)
    time.sleep(0.3)
    st = r.st[sid]
    reached = [x for x in seen if x["path"] == path] if path else list(seen)
    if expect_400:
        ok = st["status"] == 400 and b"https door refused" in st["body"] and not reached
    else:
        ok = (r.goaway is not None or st["reset"] is not None or st["status"] in (400, 431)) and st["status"] != 200 and not reached
    check(what, ok, (st, r.goaway, reached))
    r.close()


P = (b":method", b"POST")
refused("a body longer than its Content-Length: the connection ended (GOAWAY), nothing reaches the engine whole",
        H(b"POST", b"/cl1", b"studio.test", (b"content-length", b"10")), b"x" * 20, path="/cl1", expect_400=False)
refused("a body shorter than its Content-Length: the same",
        H(b"POST", b"/cl2", b"studio.test", (b"content-length", b"10")), b"x" * 5, path="/cl2", expect_400=False)
refused("a body whose length came whole before the excess: its last bytes are held for the stream's end, so the engine never has it whole",
        H(b"POST", b"/cl3", b"studio.test", (b"content-length", b"10")), chunks=[(b"x" * 5, False, 0), (b"y" * 5, False, 0.1), (b"z" * 5, True, 0.4)],
        path="/cl3", expect_400=False)
seen.clear()
r = Raw()
sid = r.req(H(b"POST", b"/cl4", b"studio.test", (b"content-length", b"10")), b"x" * 5, end=False)
r.c.send_data(sid, b"y" * 5, end_stream=True)
r.out()
r.pump(r.ended(sid))
check("  and a body that keeps its length passes whole in two pieces", r.st[sid]["status"] == 200 and [(x["path"], x["n"]) for x in seen] == [("/cl4", 10)],
      (r.st[sid], seen))
r.close()
refused("two Content-Length of different values: h2 ends the connection, nothing passes",
        H(b"POST", b"/cl5", b"studio.test", (b"content-length", b"2"), (b"content-length", b"4")), b"abcd", expect_400=False)
refused("a Content-Length that is not a number (2, 4 in one field): h2 ends the connection, nothing passes",
        H(b"POST", b"/cl6", b"studio.test", (b"content-length", b"2, 4")), b"abcd", expect_400=False)
refused("a path with a space (the request line would read apart): 400", H(b"GET", b"/a b"))
refused("a path that does not start with «/»: 400", H(b"GET", b"http://elsewhere/"))
refused("a host with a space in it: 400", H(b"GET", b"/n/1", b"studio.test evil"))
refused("a host with a user before it (user@studio.test): 400", H(b"GET", b"/n/1", b"user@studio.test"))
refused("CONNECT: not passed", [(b":method", b"CONNECT"), (b":authority", b"studio.test:443")], expect_400=False)
refused("an uppercase header name: h2 ends the connection, nothing passes", H(b"GET", b"/n/1", b"studio.test", (b"X-Bad", b"1")), expect_400=False)
refused("a header name with a space: h2 ends the connection, nothing passes", H(b"GET", b"/n/1", b"studio.test", (b"x bad", b"1")), expect_400=False)
refused("Transfer-Encoding on an HTTP/2 request: h2 ends the connection, nothing passes",
        H(b"POST", b"/te", b"studio.test", (b"transfer-encoding", b"chunked")), b"0\r\n\r\n", expect_400=False)
refused("a header list over 64 KB: refused (431 or the connection ended), nothing passes", H(b"GET", b"/n/1", b"studio.test", (b"x-big", b"a" * 70000)),
        expect_400=False)

# a reset stream closes its engine connection; the connection goes on
events_closed.clear()
r = Raw()
ev = r.req(H(b"GET", b"/events"))
r.pump(lambda: b"tick" in r.st[ev]["body"], 5)
r.c.reset_stream(ev, h2.errors.ErrorCodes.CANCEL)
r.out()
sid = r.req(H(b"GET", b"/n/3"))
r.pump(r.ended(sid), 5)
check("a stream the visitor resets: its engine connection closed, the next stream on the connection answered",
      wait(events_closed.is_set, 3) and r.st[sid]["status"] == 200, (events_closed.is_set(), r.st[sid]))
r.close()

# GOAWAY from the visitor with a stream open: the door closes the connection and the engine's side
events_closed.clear()
r = Raw()
ev = r.req(H(b"GET", b"/events"))
r.pump(lambda: b"tick" in r.st[ev]["body"], 5)
r.c.close_connection()
r.out()
r.pump(lambda: r.eof, 5)
check("GOAWAY from the visitor: the door closes the connection and the open stream's engine connection", r.eof and wait(events_closed.is_set, 3),
      (r.eof, events_closed.is_set()))
r.close()

# who may come in, and a Studio that does not answer
tls_door.allowed = lambda addr: False
seen.clear()
r = Raw()
sid = r.req(H(b"GET", b"/"))
r.pump(r.ended(sid), 5)
check("a visitor user/access.json refuses gets the door's page over HTTP/2 (403), nothing passes",
      r.st[sid]["status"] == 403 and b"does not open to" in r.st[sid]["body"] and not seen, (r.st[sid], seen))
r.close()
tls_door.allowed = lambda addr: True
keep = tls_door.TO_PORT
s = socket.socket()
s.bind(("127.0.0.1", 0))
tls_door.TO_PORT = s.getsockname()[1]
s.close()
r = Raw()
sid = r.req(H(b"GET", b"/"))
r.pump(r.ended(sid), 5)
check("a Studio that does not answer: 502 on the stream", r.st[sid]["status"] == 502, r.st[sid])
r.close()
tls_door.TO_PORT = keep
raw.close()


stop_events.set()


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
