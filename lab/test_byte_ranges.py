"""HERESY 2088: the lab's files sent as a file server sends them (lab/byte_ranges.py, the lab's send_file): the ranges the Opus stream's player asks
(from the start, from past the middle, the last byte, the last N, at and past the end), each a 206 with one Content-Range and the file's own bytes, or
416 with «bytes */SIZE»; a Range that does not read, or names several, the whole file with 200; HEAD the headers alone. HERESY 2138 (the audit of
06.11.2026, 2.5): a name with line breaks stays one Content-Disposition.
   python3 lab/test_byte_ranges.py"""
import http.client
import http.server
import os
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import byte_ranges  # noqa: E402

bad = []


def ok(name, cond, got=""):
    if not cond:
        bad.append(name)
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({got})"))


DATA = os.urandom(527170)                              # listen.opus's size, the take of Viktor's console
F = Path(tempfile.mkdtemp(prefix="ruach-ranges-")) / "listen.opus"
F.write_bytes(DATA)


# HERESY 2138 (the audit of 06.11.2026, 2.5): a title with line breaks in it (the Videographer's edit.zip is named after the take's title)
TITLE = "Two lines\r\nSet-Cookie: x=1\r\nX-Evil: \"yes\" \\ · edit.zip"


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/named":
            return byte_ranges.send(self, F, "application/zip", download=TITLE)
        byte_ranges.send(self, F, "audio/ogg", cache="no-cache")

    do_HEAD = do_GET

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def get(rng=None, method="GET"):
    c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10)
    c.request(method, "/listen", headers={"Range": rng} if rng else {})
    r = c.getresponse()
    body = r.read()
    heads = r.getheaders()
    c.close()
    return r.status, [v for k, v in heads if k.lower() == "content-range"], int(r.getheader("Content-Length") or -1), body


N = len(DATA)
for rng, a, b in (("bytes=0-", 0, N - 1), ("bytes=0-1", 0, 1), ("bytes=100000-", 100000, N - 1), (f"bytes={N // 2 + 1000}-", N // 2 + 1000, N - 1),
                  (f"bytes={N - 1000}-", N - 1000, N - 1), (f"bytes={N - 1}-", N - 1, N - 1), ("bytes=-1000", N - 1000, N - 1),
                  (f"bytes=10-{N + 50}", 10, N - 1), (f"bytes=-{N + 9}", 0, N - 1)):
    st, cr, ln, body = get(rng)
    ok(f"{rng}: 206, one Content-Range bytes {a}-{b}/{N}, the file's own bytes", st == 206 and cr == [f"bytes {a}-{b}/{N}"] and ln == b - a + 1 and body == DATA[a:b + 1],
       (st, cr, ln, len(body)))
for rng in (f"bytes={N}-", f"bytes={N + 5}-", "bytes=-0"):
    st, cr, ln, body = get(rng)
    ok(f"{rng}: 416, Content-Range bytes */{N}, nothing", st == 416 and cr == [f"bytes */{N}"] and body == b"", (st, cr, len(body)))
for rng in ("bytes=abc-", "bytes=0-1,5-9", "bytes=9-2", "items=0-5", "bytes=-"):
    st, cr, ln, body = get(rng)
    ok(f"{rng!r}: left out, the whole file with 200", st == 200 and cr == [] and body == DATA, (st, cr, len(body)))
st, cr, ln, body = get()
ok("no Range: 200, the whole file, no Content-Range", st == 200 and cr == [] and ln == N and body == DATA, (st, cr, ln))
st, cr, ln, body = get(f"bytes={N - 10}-", "HEAD")
ok("HEAD with a Range: its headers, no body", st == 206 and cr == [f"bytes {N - 10}-{N - 1}/{N}"] and ln == 10 and body == b"", (st, cr, ln, len(body)))
ok("span() as the mock's byte_range: a table", [byte_ranges.span(h, 10) for h in ("bytes=0-", "bytes=3-4", "bytes=-3", "bytes=10-", "bytes=-0", "bytes=4-2", "", None)] ==
   [(0, 9), (3, 4), (7, 9), "unsatisfiable", "unsatisfiable", None, None, None])
c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10)
c.request("GET", "/named")
r = c.getresponse()
r.read()
heads = r.getheaders()
c.close()
cd = [v for k, v in heads if k.lower() == "content-disposition"]
ok("a title with line breaks: one Content-Disposition, no header of its own (no Set-Cookie, no X-Evil)",
   len(cd) == 1 and not any(k.lower() in ("set-cookie", "x-evil") for k, v in heads), heads)
ok("  its breaks as spaces, its quotes and backslash out of the quoted name, the UTF-8 name encoded",
   cd and cd[0].startswith('attachment; filename="Two lines  Set-Cookie: x=1  X-Evil: yes _ _ edit.zip"; filename*=UTF-8\'\'Two%20lines%20%20Set-Cookie') and "%0D" not in cd[0], cd)
srv.shutdown()
print(("FAILED: " + ", ".join(bad)) if bad else "all byte-range checks pass")
sys.exit(1 if bad else 0)
