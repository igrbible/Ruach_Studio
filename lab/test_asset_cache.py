"""HERESY 2139 (Viktor 06.11.2026: «все assets загружать с кешированием, но в каждом иметь ключ ?675tg9 релиз тега»): the lab's files with their keys
and validators. byte_ranges.key is the first ten hex of the file's SHA-256, read once for each size and time; send(…, keyed=) gives ETag and
Last-Modified, a year (immutable) only when the URL's key is the file's own, no-cache otherwise, and 304 to a request that has the file already
(If-None-Match weakly, a list, *, or If-Modified-Since when there is none); keyed=None sends as before. Then the lab's own routes, through its own
Handler on a port of its own (its library and docs temporary folders): /fonts, /sounds, /guide, /arts and /art (the user's own: private), and the
four routes whose URL does not name their content, each no-cache with its validator now: /artist/lora-picture, /daw/ir, /spectrogram, /luts/preview.
    python3 lab/test_asset_cache.py"""
import email.utils
import hashlib
import http.client
import http.server
import importlib.util
import json
import os
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import byte_ranges  # noqa: E402

bad = []


def ok(name, cond, got=""):
    if not cond:
        bad.append(name)
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({str(got)[:400]})"))


tmp = Path(tempfile.mkdtemp(prefix="ruach-assetcache-"))
F = tmp / "face.woff2"
DATA = os.urandom(70001)
F.write_bytes(DATA)
K = hashlib.sha256(DATA).hexdigest()[:10]

# ---- the key
ok("key(): the first ten hex of the file's SHA-256", byte_ranges.key(F) == K, (byte_ranges.key(F), K))
with open(F, "rb") as f:
    f.seek(123)
    ok("  from an open file: the same key, and the file left where it was read to", byte_ranges.key(F, f) == K and f.tell() == 123, f.tell())
st = os.stat(F)
os.utime(F, ns=(st.st_atime_ns, st.st_mtime_ns))
ok("  remembered for its size and time (a stat, no read: the entry is there)", byte_ranges._known[str(F)] == (st.st_size, st.st_mtime_ns, K))
DATA2 = os.urandom(70001)
F.write_bytes(DATA2)
os.utime(F, ns=(st.st_atime_ns, st.st_mtime_ns + 1000))
K2 = hashlib.sha256(DATA2).hexdigest()[:10]
ok("  the same size written again: a new time, a new key", byte_ranges.key(F) == K2 and K2 != K, (byte_ranges.key(F), K2))
try:
    byte_ranges.key(tmp / "none.woff2")
    ok("  a file that is not there: OSError, never a key made up", False, "a key")
except OSError:
    ok("  a file that is not there: OSError, never a key made up", True)
ok("cache_control: a year only for its own key", byte_ranges.cache_control(K2, K2) == "public, max-age=31536000, immutable" and
   byte_ranges.cache_control(K, K2) == "no-cache" and byte_ranges.cache_control("", K2) == "no-cache" and byte_ranges.cache_control(None, K2, "x") == "x")
ok("  the user's own (private): a year kept by the browser alone, never by a cache between",
   byte_ranges.cache_control(K2, K2, private=True) == "private, max-age=31536000, immutable" and
   byte_ranges.cache_control(K, K2, "private, no-cache", True) == "private, no-cache")
ok("matches(): weak, a list, *", byte_ranges.matches('W/"abc"', 'W/"abc"') and byte_ranges.matches('"abc"', 'W/"abc"') and
   byte_ranges.matches('"x", W/"abc"', 'W/"abc"') and byte_ranges.matches("*", 'W/"abc"') and not byte_ranges.matches('W/"abd"', 'W/"abc"') and
   not byte_ranges.matches("", 'W/"abc"') and not byte_ranges.matches(None, 'W/"abc"'))


# ---- send() over HTTP
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path, _, v = self.path.partition("?v=")
        if path == "/plain":
            return byte_ranges.send(self, F, "font/woff2", cache="no-cache")
        if path == "/fresh":
            return byte_ranges.send(self, F, "application/json", cache="no-cache", keyed=v)
        if path == "/mem":
            return byte_ranges.send_bytes(self, MEM[0], "audio/wav")
        return byte_ranges.send(self, F, "font/woff2", keyed=v)

    do_HEAD = do_GET

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def get(path, headers=None, method="GET", port=None):
    c = http.client.HTTPConnection("127.0.0.1", port or srv.server_address[1], timeout=20)
    c.request(method, path, headers=dict({"Host": "127.0.0.1:%d" % (port or srv.server_address[1])}, **(headers or {})))
    r = c.getresponse()
    body = r.read()
    heads = {k.lower(): v for k, v in r.getheaders()}
    c.close()
    return r.status, heads, body


MEM = [b"RIFF-one"]
TAG = 'W/"%s"' % K2
st, h, b = get("/f?v=" + K2)
ok("its own key: 200, a year and immutable, ETag of its key, Last-Modified, the bytes", st == 200 and h.get("cache-control") == "public, max-age=31536000, immutable"
   and h.get("etag") == TAG and h.get("last-modified") == email.utils.formatdate(os.stat(F).st_mtime, usegmt=True) and b == DATA2, (st, h))
st, h, b = get("/f?v=" + K)
ok("an old page's key: 200 with the file as it is now, no-cache (never a year under a key that is not its own)",
   st == 200 and h.get("cache-control") == "no-cache" and h.get("etag") == TAG and b == DATA2, (st, h))
st, h, b = get("/f")
ok("no key: no-cache with its validator", st == 200 and h.get("cache-control") == "no-cache" and h.get("etag") == TAG, (st, h))
st, h, b = get("/f?v=" + K2, {"If-None-Match": TAG})
ok("asked with its ETag: 304, no body, its ETag and the year said again", st == 304 and b == b"" and h.get("etag") == TAG and
   h.get("cache-control") == "public, max-age=31536000, immutable", (st, h, len(b)))
st, h, b = get("/f", {"If-None-Match": '"%s"' % K2})
ok("  the strong form of the same tag: 304 (If-None-Match compares weakly), no-cache when unkeyed", st == 304 and h.get("cache-control") == "no-cache", (st, h))
st, h, b = get("/f", {"If-None-Match": 'W/"0000000000", W/"%s"' % K2})
ok("  a list holding it: 304", st == 304, st)
st, h, b = get("/f", {"If-None-Match": "*"})
ok("  *: 304", st == 304, st)
st, h, b = get("/f", {"If-None-Match": 'W/"%s"' % K})
ok("  an old ETag: 200 and the file as it is now", st == 200 and b == DATA2 and h.get("etag") == TAG, (st, h))
future = email.utils.formatdate(time.time() + 3600, usegmt=True)
past = email.utils.formatdate(time.time() - 7 * 86400, usegmt=True)
st, h, b = get("/f", {"If-Modified-Since": future})
ok("If-Modified-Since after its time, no If-None-Match: 304", st == 304, st)
st, h, b = get("/f", {"If-Modified-Since": past})
ok("  before its time: 200", st == 200 and b == DATA2, st)
st, h, b = get("/f", {"If-None-Match": 'W/"%s"' % K, "If-Modified-Since": future})
ok("  If-None-Match wins over it: an old ETag with a later date is 200", st == 200, st)
st, h, b = get("/f?v=" + K2, {"Range": "bytes=10-19"})
ok("a Range on a keyed file: 206 of its bytes, with its validator", st == 206 and b == DATA2[10:20] and h.get("etag") == TAG and
   h.get("content-range") == "bytes 10-19/70001", (st, h))
st, h, b = get("/f?v=" + K2, method="HEAD")
ok("HEAD: its headers, no body", st == 200 and b == b"" and h.get("etag") == TAG and h.get("content-length") == "70001", (st, h))
st, h, b = get("/fresh")
ok("a route that keeps no-cache (vowels.json): no-cache and its validator", st == 200 and h.get("cache-control") == "no-cache" and h.get("etag") == TAG, h)
st, h, b = get("/plain", {"If-None-Match": TAG})
ok("keyed=None (every caller before): no ETag, no Last-Modified, no 304, its own Cache-Control", st == 200 and "etag" not in h and
   "last-modified" not in h and h.get("cache-control") == "no-cache" and b == DATA2, (st, h))
MT = 'W/"%s"' % hashlib.sha256(MEM[0]).hexdigest()[:10]
st, h, b = get("/mem")
ok("send_bytes(): bytes made in memory, no-cache with the ETag of their own key", st == 200 and b == MEM[0] and h.get("cache-control") == "no-cache" and
   h.get("etag") == MT and h.get("content-length") == str(len(MEM[0])), (st, h))
st, h, b = get("/mem", {"If-None-Match": MT})
ok("  asked with it: 304, no body", st == 304 and b == b"" and h.get("etag") == MT, (st, h))
MEM[0] = b"RIFF-two, made anew"
st, h, b = get("/mem", {"If-None-Match": MT})
ok("  made anew: the old ETag gets 200 and the new bytes", st == 200 and b == MEM[0] and h.get("etag") != MT, (st, h))
DATA3 = os.urandom(5000)
F.write_bytes(DATA3)
K3 = hashlib.sha256(DATA3).hexdigest()[:10]
st, h, b = get("/f?v=" + K2, {"If-None-Match": TAG})
ok("the file written anew: the old ETag and the old key get 200, the new bytes, no-cache, the new ETag",
   st == 200 and b == DATA3 and h.get("cache-control") == "no-cache" and h.get("etag") == 'W/"%s"' % K3, (st, h))
srv.shutdown()

# ---- the lab's own routes (its Handler on a port of its own; its library and docs in temporary folders)
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
lab.OUTPUTS = tmp / "outputs"
lab.CACHE = tmp / "cache"
lab.KIT = tmp
(tmp / "docs").mkdir()
(tmp / "docs" / "GUIDE.md").write_text("# The guide\n", encoding="utf-8")
take = lab.OUTPUTS / "20261106-120000-01-tcache"
take.mkdir(parents=True)
(take / "request.json").write_text(json.dumps({"title": "tcache"}), encoding="utf-8")   # a take is a folder with its request
COVER = os.urandom(30000)
(take / "artwork.jpg").write_bytes(COVER)
CK = hashlib.sha256(COVER).hexdigest()[:10]
lsrv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
threading.Thread(target=lsrv.serve_forever, daemon=True).start()
LP = lsrv.server_address[1]

font = next((f for f in sorted((HERE / "fonts").glob("*")) if f.suffix in (".woff2", ".ttf")), None)
if font is None:
    ok("lab/fonts/ has a font to ask for", False, "none")
else:
    FK = hashlib.sha256(font.read_bytes()).hexdigest()[:10]
    st, h, b = get("/fonts/" + font.name + "?v=" + FK, port=LP)
    ok("/fonts/NAME?v=its key: a year and immutable, its ETag", st == 200 and h.get("cache-control") == "public, max-age=31536000, immutable" and
       h.get("etag") == 'W/"%s"' % FK and len(b) == font.stat().st_size, (st, h))
    st, h, b = get("/fonts/" + font.name, port=LP)
    ok("  unkeyed: no-cache (was a year under a name that a new font could take)", st == 200 and h.get("cache-control") == "no-cache", h)
    st, h, b = get("/fonts/" + font.name + "?v=" + FK, {"If-None-Match": 'W/"%s"' % FK}, port=LP)
    ok("  asked again with its ETag: 304", st == 304 and b == b"", st)
snd = next((f for f in sorted((HERE / "sounds").glob("*.mp3"))), None)
if snd is not None:
    SK = hashlib.sha256(snd.read_bytes()).hexdigest()[:10]
    st, h, b = get("/sounds/" + snd.name + "?v=" + SK, port=LP)
    ok("/sounds/NAME.mp3?v=its key: a year and immutable", st == 200 and h.get("cache-control") == "public, max-age=31536000, immutable", h)
if (HERE / "sounds" / "vowels.json").is_file():
    st, h, b = get("/sounds/vowels.json", port=LP)
    ok("/sounds/vowels.json: read fresh as 1624 has it (no-cache), with its validator now", st == 200 and h.get("cache-control") == "no-cache" and
       h.get("etag", "").startswith('W/"'), h)
st, h, b = get("/guide/GUIDE.md", port=LP)
ok("/guide/GUIDE.md: no-cache with its validator", st == 200 and h.get("cache-control") == "no-cache" and h.get("etag", "").startswith('W/"') and
   b == b"# The guide\n", (st, h))
st, h, b = get("/guide/GUIDE.md", {"If-None-Match": h.get("etag", "")}, port=LP)
ok("  asked again with it: 304", st == 304, st)
st, h, b = get("/arts", port=LP)
arts = json.loads(b or b"{}").get("arts", {})
ok("/arts: each cover by its key (was its time)", st == 200 and arts.get(take.name) == CK, (st, arts))
st, h, b = get("/art?name=" + take.name + "&v=" + CK, port=LP)
ok("/art?name=&v=its key: a year and immutable, private (the user's own), its bytes", st == 200 and b == COVER and
   h.get("cache-control") == "private, max-age=31536000, immutable", h)
st, h, b = get("/art?name=" + take.name, port=LP)
ok("  without v (the Videographer's tiles): private, no-cache with its validator", st == 200 and h.get("cache-control") == "private, no-cache" and
   h.get("etag") == 'W/"%s"' % CK, h)
(take / "artwork.jpg").write_bytes(COVER[::-1])
st2, h2, b2 = get("/arts", port=LP)
new = json.loads(b2 or b"{}").get("arts", {}).get(take.name)
ok("  drawn anew: /arts says a new key at once", new and new != CK and new == hashlib.sha256(COVER[::-1]).hexdigest()[:10], (new, CK))
st, h, b = get("/art?name=" + take.name + "&v=" + CK, port=LP)
ok("  the old key now: the new cover, private, no-cache", st == 200 and b == COVER[::-1] and h.get("cache-control") == "private, no-cache", h)
(take / "artwork.jpg").unlink()
st, h, b = get("/arts", port=LP)
ok("  taken off: not listed", take.name not in json.loads(b or b"{}").get("arts", {}), b[:200])


# ---- the four routes whose URL does not name their content: each no-cache with its validator, so a file replaced is never shown old
def revalidated(name, path, want_cc, replace):
    """200 with want_cc and an ETag; asked with it a 304; after replace() the old ETag gets 200 and a new ETag"""
    st, h, b = get(path, port=LP)
    tag = h.get("etag", "")
    ok(name + ": 200, «" + want_cc + "» with its validator", st == 200 and len(b) > 0 and h.get("cache-control") == want_cc and tag.startswith('W/"'), (st, h))
    st, h, b = get(path, {"If-None-Match": tag}, port=LP)
    ok("  asked with its ETag: 304, no body", st == 304 and b == b"" and h.get("etag") == tag, (st, h))
    new = replace()
    st, h, b = get(path, {"If-None-Match": tag}, port=LP)
    ok("  replaced: the old ETag gets 200, the new bytes, a new ETag", st == 200 and b == new and h.get("etag", tag) != tag, (st, h))


fam = next(iter(lab.artist_loras.FAMILIES))
lora = tmp / "artwork" / "loras" / fam / "tcache.safetensors"
lora.parent.mkdir(parents=True)
lora.write_bytes(b"\0" * 16)
PIC = lora.with_suffix(".png")
PIC.write_bytes(os.urandom(4000))


def new_pic():
    data = os.urandom(4100)
    PIC.write_bytes(data)
    return data


revalidated("/artist/lora-picture (by the adapter's id, was 10 min)", "/artist/lora-picture?id=" + fam + "/tcache.safetensors", "private, no-cache", new_pic)
lab.DAW_IR[("room", 48000)] = b"RIFF-the room as this lab makes it"


def new_ir():
    lab.DAW_IR[("room", 48000)] = b"RIFF-the room as a newer lab makes it"
    return lab.DAW_IR[("room", 48000)]


revalidated("/daw/ir (by preset and rate, was a day)", "/daw/ir?preset=room&rate=48000", "no-cache", new_ir)
SPEC = tmp / "cache" / "spectrograms" / "by-test.png"
SPEC.parent.mkdir(parents=True, exist_ok=True)
SPEC.write_bytes(os.urandom(3000))
lab.takechanges.spectrogram_file = lambda *a, **k: SPEC                              # the slice as the take's audio would make it, without decoding


def new_spec():
    data = os.urandom(3100)
    SPEC.write_bytes(data)
    return data


revalidated("/spectrogram (by take and window, was an hour)", "/spectrogram?name=" + take.name + "&t0=0&t1=10", "private, no-cache", new_spec)
LOOK = tmp / "cache" / "luts" / "preview" / "test.jpg"
LOOK.parent.mkdir(parents=True, exist_ok=True)
LOOK.write_bytes(os.urandom(2000))
lab.luts.preview_path = lambda *a, **k: LOOK                                        # the cover through a look, without PIL


def new_look():
    data = os.urandom(2100)
    LOOK.write_bytes(data)
    return data


revalidated("/luts/preview (by look, take and strength, was 10 min)", "/luts/preview?name=" + take.name + "&id=none&s=1", "private, no-cache", new_look)
lsrv.shutdown()

print(("FAILED: " + ", ".join(bad)) if bad else "all asset-cache checks pass")
sys.exit(1 if bad else 0)
