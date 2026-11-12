"""HERESY 2175, 2176, 2177: the lab's own Handler on a port of its own (the lab imported; its library a temporary folder, nothing reaches the Studio,
no card is touched). 2175 (H02): a cover is taken off by a POST /art/remove {name} under the lease (a page that does not hold it is refused, the
picture stays), a GET there changes nothing. 2176 (H04): every answer says nosniff, a JSON, a file, a 304, an error and an answer that says it
itself (once). 2177 (H05): the https hand-over through the Handler, bound to the visitor the Studio names in X-Remote-Addr.
    python3 lab/test_labsec_2175.py"""
import importlib.util
import json
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
import lease  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:400] + ")"))
    if not ok:
        bad.append(what)


tmp = Path(tempfile.mkdtemp(prefix="ruach-t2175-"))
lab.OUTPUTS = tmp / "outputs"
lab.CACHE = tmp / "cache"
T = "20261106-120000-01-t2175"
d = lab.OUTPUTS / T
d.mkdir(parents=True)
(d / "request.json").write_text(json.dumps({"title": "t2175"}), encoding="utf-8")
(d / "artwork.jpg").write_bytes(b"\xff\xd8\xff the cover \xff\xd9")

srv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()


def ask(path, method="GET", body=None, headers=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=body, method=method,
                                 headers=dict({"Host": f"127.0.0.1:{port}", "Content-Type": "application/json"}, **(headers or {})))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


def js(b):
    try:
        return json.loads(b or b"{}")
    except ValueError:
        return {}


# 2175 (H02)
st, b, h = ask("/art/remove?name=" + T)
check("a GET /art/remove changes nothing: 405, its words, the cover where it was", st == 405 and "POST" in js(b).get("error", "") and (d / "artwork.jpg").is_file(), (st, b))
HOLDER, OTHER = "holder-0001", "intruder-01"
lease.post({}, json.dumps({"op": "claim", "id": HOLDER}).encode())
st, b, h = ask("/art/remove?inst=" + OTHER, "POST", json.dumps({"name": T}).encode())
check("a POST from a page that does not hold the lease: 409, the cover where it was", st == 409 and (d / "artwork.jpg").is_file(), (st, b))
st, b, h = ask("/art/remove?inst=" + HOLDER, "POST", json.dumps({"name": T}).encode())
kept = list((d / "artwork-removed").glob("*.jpg")) if (d / "artwork-removed").is_dir() else []
check("the holder's POST takes it off: 200, kept beside the take", st == 200 and js(b).get("removed") == T and not (d / "artwork.jpg").exists() and len(kept) == 1, (st, b))
st, b, h = ask("/art/remove?inst=" + HOLDER, "POST", json.dumps({"name": T}).encode())
check("again: 409 with the lab's words (no cover), nothing pretended", st == 409 and "no artwork" in js(b).get("error", ""), (st, b))
lease.post({}, json.dumps({"op": "release", "id": HOLDER}).encode())

# 2176 (H04)
(d / "artwork.jpg").write_bytes(b"\xff\xd8\xff another cover \xff\xd9")
seen = {}
st, b, h = ask("/lease")
seen["a JSON answer"] = (st, h.get_all("X-Content-Type-Options"))
st, b, h = ask("/no/such/route")
seen["a 404"] = (st, h.get_all("X-Content-Type-Options"))
st, b, h = ask("/art?name=" + T + "&v=x")
seen["a file"] = (st, h.get_all("X-Content-Type-Options"))
st, b, h2 = ask("/art?name=" + T + "&v=x", headers={"If-None-Match": h.get("ETag", "")})
seen["a 304"] = (st, h2.get_all("X-Content-Type-Options"))
st, b, h = ask("/art/remove?name=" + T)
seen["a 405"] = (st, h.get_all("X-Content-Type-Options"))
st, b, h = ask("/daw/ir?preset=room&rate=48000")
seen["the room's impulse"] = (st, h.get_all("X-Content-Type-Options"))
check("every answer says nosniff, once: " + ", ".join(seen), all(v[1] == ["nosniff"] for v in seen.values()), seen)
check("D04: /daw/ir asked again each time (no-cache, with its validator)", h.get("Cache-Control") == "no-cache" and h.get("ETag", "").startswith('W/"'), dict(h))
src = (HERE / "lab.py").read_text(encoding="utf-8")
check("D04: the other three keep their max-age (lora-picture 10 min twice, spectrogram an hour, luts/preview 10 min)",
      src.count('cache="private, max-age=600", keyed="")') == 3 and src.count('cache="private, max-age=3600", keyed="")') == 1)

# 2177 (H05) through the Handler
A, B = "192.0.2.5", "192.0.2.6"                         # RFC 5737 documentation addresses
st, b, h = ask("/handoff", "POST", json.dumps({"storage": {"yue2.tab": "post", "yue2.chatUrl": "http://x.example"}}).encode(), {"X-Remote-Addr": A})
tok = js(b).get("token", "")
check("the hand-over made: the page's setting kept, the address left out and said", st == 200 and js(b).get("keys") == 1 and js(b).get("dropped") == ["yue2.chatUrl"], b)
st, b, h = ask("/handoff?token=" + tok, headers={"X-Remote-Addr": B})
check("taken from another computer: 400 with the reason", st == 400 and "another computer" in js(b).get("error", ""), (st, b))
st, b, h = ask("/handoff", "POST", json.dumps({"storage": {"yue2.tab": "post"}}).encode(), {"X-Remote-Addr": A})
st, b, h = ask("/handoff?token=" + js(b).get("token", ""), headers={"X-Remote-Addr": A})
check("taken by the computer that made it: its settings", st == 200 and js(b).get("storage") == {"yue2.tab": "post"}, (st, b))

srv.shutdown()
print("all passed" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
