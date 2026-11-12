"""HERESY 2338 (the audit of 06.11.2026, 2.4 and §7 item 15: «GET оставить для чтения (так же с /dawproject)»): a DAWproject writes the take's
derived/dawproject/, so it is made by a POST /dawproject {name} under the single writer's lease, as the page has asked since 1134; a GET there
answers 405 and writes nothing. The lab's own Handler on a port of its own, its library a temporary folder: nothing reaches the Studio.
    python3 lab/test_dawproject_post.py"""
import importlib.util
import json
import sys
import tempfile
import threading
import urllib.error
import urllib.request
import wave
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


tmp = Path(tempfile.mkdtemp(prefix="ruach-tdaw-"))
lab.OUTPUTS = tmp / "outputs"
lab.CACHE = tmp / "cache"
T = "20261110-120000-01-tdaw"
d = lab.OUTPUTS / T
d.mkdir(parents=True)
(d / "meta.json").write_text(json.dumps({"title": "tdaw", "seconds": 1.0}), encoding="utf-8")
(d / "request.json").write_text(json.dumps({"title": "tdaw"}), encoding="utf-8")
w = wave.open(str(d / "audio.wav"), "wb")
w.setnchannels(2)
w.setsampwidth(2)
w.setframerate(48000)
w.writeframes(b"\0\0\0\0" * 4800)
w.close()
made = d / "derived" / "dawproject"

srv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()


def ask(path, method="GET", body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=body, method=method,
                                 headers={"Host": f"127.0.0.1:{port}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def js(b):
    try:
        return json.loads(b or b"{}")
    except ValueError:
        return {}


st, b = ask("/dawproject?name=" + T)
check("a GET /dawproject writes nothing: 405, its words name the POST, no derived/dawproject/", st == 405 and "POST /dawproject" in js(b).get("error", "") and not made.exists(), (st, b))
HOLDER, OTHER = "holder-0001", "intruder-01"
lease.post({}, json.dumps({"op": "claim", "id": HOLDER}).encode())
st, b = ask("/dawproject?inst=" + OTHER, "POST", json.dumps({"name": T}).encode())
check("a POST from a page that does not hold the lease: 409, nothing written", st == 409 and not made.exists(), (st, b))
st, b = ask("/dawproject?inst=" + HOLDER, "POST", json.dumps({"name": T}).encode())
files = list(made.glob("*.dawproject")) if made.is_dir() else []
check("the holder's POST makes it: 200, its path and bytes, the file in derived/dawproject/",
      st == 200 and js(b).get("path", "").endswith(".dawproject") and js(b).get("bytes", 0) > 0 and len(files) == 1, (st, b))
lease.post({}, json.dumps({"op": "release", "id": HOLDER}).encode())
st, b = ask("/dawproject", "POST", json.dumps({"name": "no-such-take"}).encode())
check("a take that is not here: 404 with the lab's words, never an empty project", st == 404 and "no take" in js(b).get("error", ""), (st, b))
src = (HERE / "lab.py").read_text(encoding="utf-8")
check("the lab's own list of routes names the POST, not a GET", "POST /dawproject {name" in src and "GET /dawproject?name=TAKE" not in src)

srv.shutdown()
print("all passed" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
