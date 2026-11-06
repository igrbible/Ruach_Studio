"""HERESY 2088 (Viktor's console 05.11.2026, over :7443: «/lab/listen?codec=opus&name=… Failed to load resource: 416 (Range Not Satisfiable)»): a file
of the lab's sent as a file server sends it, with one Range read as RFC 9110 reads it. The 416 itself was the engine's: its /lab/ relay forwarded the
Range, took the lab's 206 piece and let httplib cut the Range out of that piece again (yue-server.cpp, 2088's other half). Here the lab's part: the
length it says is the length of the very file it sends (opened first: a listen.opus made again meanwhile), a Range that does not read (or names
several) is left out and the file goes whole with 200, a start at or past the end (or a suffix of 0) is 416 with «bytes */SIZE».
   span(header, size) · send(handler, path, ctype, download, cache)   (the mock serves the stream through the same two)
HERESY 2103 (Viktor's debug journal of 05.11.2026: thirteen 416s on /listen the page's journal never saw): a 416 says in the lab's log the Range
asked and the size of the file it was asked of.
HERESY 2139 (Viktor 06.11.2026, from his remote connection: «Вот очередная загрузка шрифтов без кеширования - это неприятно на удалённом соединении.
Да и все assets загружать с кешированием, но в каждом иметь ключ ?675tg9 релиз тега»): an asset's key is the start of its own SHA-256, ten hex, so a
file that did not change keeps its key across builds and releases (the fonts above all) and a file that did gets a new one at once. build.sh writes
the key into the page's URLs (…?v=KEY), /arts says the covers by theirs. send(…, keyed=the URL's ?v=, "" for none) gives the file its validator
(ETag of its key, Last-Modified), answers 304 to a request that has it already, and keeps it a year (immutable) only when the URL's key is the
file's own; any other (no key, an old page's key) is no-cache, asked again each time. keyed=None, every caller before it, sends as before.
A file that is the user's own (private=True: the covers) is kept by the browser alone, never by a cache between (NETWORK-EDGE §3.2): «private,
max-age=31536000, immutable» under its key, «private, no-cache» otherwise; the Studio's own files (fonts, sounds, icons) stay public. send_bytes()
gives bytes made in memory (the DAW's impulses) the same validator, never kept without asking.
   key(path, f, st) · cache_control(want, have, otherwise, private) · etag(k) · fresh(headers, tag, mtime) · send_bytes(h, data, ctype, cache)
   (here, not in a module of their own: the mock loads this file by its path, with no lab/ on its import path)"""
import email.utils
import hashlib
import os
import re
import sys
import threading
import time
import urllib.parse

RANGE = re.compile(r"\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*")


# ---- HERESY 2139: the keys and the validators
IMMUTABLE = "public, max-age=31536000, immutable"
IMMUTABLE_PRIVATE = "private, max-age=31536000, immutable"   # the user's own files (the covers): the browser keeps them, a cache between never
KEY_LEN = 10                                           # build.sh's and the engine's (tools/asset-cache.h) length too
_known = {}                                            # path -> (size, mtime_ns, key)
_known_lock = threading.Lock()


def key(path, f=None, st=None):
    """the key of the file at path: the first ten hex of its SHA-256. f: the file already open (the very bytes about to be sent are the ones read);
    st: its stat. Read once for each size and time, then remembered. Raises OSError as open() and stat() do: no key is made up for a file not read"""
    p = str(path)
    if st is None:
        st = os.fstat(f.fileno()) if f is not None else os.stat(p)
    with _known_lock:
        hit = _known.get(p)
    if hit and hit[0] == st.st_size and hit[1] == st.st_mtime_ns:
        return hit[2]
    h = hashlib.sha256()
    if f is not None:
        at = f.tell()
        f.seek(0)
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
        f.seek(at)
    else:
        with open(p, "rb") as g:
            for chunk in iter(lambda: g.read(1 << 20), b""):
                h.update(chunk)
    k = h.hexdigest()[:KEY_LEN]
    with _known_lock:
        if len(_known) > 50000:                        # a library's covers come and go; the memory stays small
            _known.clear()
        _known[p] = (st.st_size, st.st_mtime_ns, k)
    return k


def cache_control(want, have, otherwise="no-cache", private=False):
    """a year and immutable only for the URL that names this very content; any other (no key, an old page's key) asked again each time.
    private: a file that is the user's own, kept by the browser alone"""
    return (IMMUTABLE_PRIVATE if private else IMMUTABLE) if want and want == have else otherwise


def etag(k):
    return 'W/"' + k + '"'


def _opaque(tag):
    tag = tag.strip()
    return tag[2:] if tag[:2] in ("W/", "w/") else tag


def matches(header, tag):
    """If-None-Match against tag, by the weak comparison RFC 9110 asks of it: a list, «*», W/ or not"""
    if not header:
        return False
    want = _opaque(tag)
    for part in header.split(","):
        part = part.strip()
        if part == "*" or (part and _opaque(part) == want):
            return True
    return False


def fresh(headers, tag, mtime):
    """the request has this very file already: If-None-Match decides when it is there, If-Modified-Since only when it is not"""
    inm = headers.get("If-None-Match")
    if inm is not None:
        return matches(inm, tag)
    ims = headers.get("If-Modified-Since")
    if not ims:
        return False
    try:
        return int(mtime) <= email.utils.parsedate_to_datetime(ims).timestamp()
    except (TypeError, ValueError, IndexError, OverflowError):
        return False


def last_modified(mtime):
    return email.utils.formatdate(mtime, usegmt=True)
# ---- the keys and the validators end


def span(header, size):
    """(start, end) of one Range; None when there is none, or it does not read, or names several (the whole file, 200); "unsatisfiable" (416)"""
    m = RANGE.fullmatch(header or "")
    if not m or not (m.group(1) or m.group(2)):
        return None
    if m.group(1):
        start = int(m.group(1))
        if m.group(2) and int(m.group(2)) < start:
            return None
        if start >= size:
            return "unsatisfiable"
        return start, min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
    suffix = int(m.group(2))
    if suffix == 0 or size == 0:
        return "unsatisfiable"
    return max(0, size - suffix), size - 1


def send(h, path, ctype="application/octet-stream", download=None, cache=None, keyed=None, private=False):
    """the file at path to the request handler h (a BaseHTTPRequestHandler), whole or the one Range it asks. keyed (HERESY 2139): the key the
    request's URL names ("" for none); the file then goes with its validator, as 304 when the request has it, a year when the key is its own.
    private (with keyed): a file that is the user's own, «private» in both its year and its no-cache"""
    with open(path, "rb") as f:
        st = os.fstat(f.fileno())
        size = st.st_size
        tag = None
        if keyed is not None:                          # HERESY 2139: the key of the very bytes about to go, read from this open file
            own = key(path, f, st)
            tag = etag(own)
            cache = cache_control(keyed, own, cache or ("private, no-cache" if private else "no-cache"), private)
            if fresh(h.headers, tag, st.st_mtime):
                h.send_response(304)
                h.send_header("ETag", tag)
                h.send_header("Cache-Control", cache)
                h.send_header("Last-Modified", last_modified(st.st_mtime))
                return h.end_headers()
        part = span(h.headers.get("Range", ""), size)
        if part == "unsatisfiable":                    # HERESY 2011 (C5): a range past the end is 416, not a 206 of nothing
            t = time.time()                            # HERESY 2103: the Range and the size, said
            print(time.strftime("%H:%M:%S", time.localtime(t)) + ".%03d" % int(t * 1000 % 1000) +
                  f" [lab] 416 {os.path.basename(os.path.dirname(str(path)))}/{os.path.basename(str(path))}: Range {h.headers.get('Range', '')!r}"
                  f" past the file's {size} bytes", file=sys.stderr, flush=True)
            h.send_response(416)
            h.send_header("Content-Range", f"bytes */{size}")
            h.send_header("Content-Length", "0")
            return h.end_headers()
        start, end = part if part else (0, size - 1)
        length = max(0, end - start + 1)
        h.send_response(206 if part else 200)
        h.send_header("Content-Type", ctype)
        h.send_header("Accept-Ranges", "bytes")
        if part:
            h.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if cache:                                      # HERESY 1274: a file that never changes under its name (the fonts)
            h.send_header("Cache-Control", cache)
        if tag:                                        # HERESY 2139: its validator, for the next request to ask with
            h.send_header("ETag", tag)
            h.send_header("Last-Modified", last_modified(st.st_mtime))
        if download:                                   # HERESY 1090: saved under this name; 1946: one beyond Latin-1 as RFC 5987 has it
            # HERESY 2138 (the audit of 06.11.2026, 2.5): a line break in a take's title cut the header and began another (Set-Cookie went out on
            # Python 3.12); the control characters become spaces, as the engine's download_header has it, and a backslash leaves the quoted form
            name = re.sub(r"[\x00-\x1f\x7f]", " ", download).replace('"', "")
            plain = name.encode("ascii", "replace").decode().replace("?", "_").replace("\\", "_")
            h.send_header("Content-Disposition", f"attachment; filename=\"{plain}\"; filename*=UTF-8''{urllib.parse.quote(name)}")
        h.send_header("Content-Length", str(length))
        h.end_headers()
        if h.command == "HEAD":
            return None
        f.seek(start)
        left = length
        while left > 0:
            chunk = f.read(min(1 << 20, left))
            if not chunk:
                break
            h.wfile.write(chunk)
            left -= len(chunk)
    return None


def send_bytes(h, data, ctype, cache="no-cache"):
    """HERESY 2139: bytes made in memory, not a file (the DAW's impulses), with the validator a file gets: ETag of their own key, a 304 to a
    request that has them already, never kept without asking (no-cache), so bytes made anew by a newer lab are never shown old"""
    tag = etag(hashlib.sha256(data).hexdigest()[:KEY_LEN])
    if matches(h.headers.get("If-None-Match"), tag):
        h.send_response(304)
        h.send_header("ETag", tag)
        h.send_header("Cache-Control", cache)
        return h.end_headers()
    h.send_response(200)
    h.send_header("Content-Type", ctype)
    h.send_header("Content-Length", str(len(data)))
    h.send_header("Cache-Control", cache)
    h.send_header("ETag", tag)
    h.end_headers()
    if h.command != "HEAD":
        h.wfile.write(data)
    return None
