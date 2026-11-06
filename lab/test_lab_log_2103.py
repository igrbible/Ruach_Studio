"""HERESY 2103, 2099, 2100: the lab's own log and its answers, through the lab's own Handler on a port of its own (the lab is imported; its library a
temporary folder, nothing reaches the Studio, no card is touched): an access line a request, with when it came to the millisecond, how long it took,
its bytes and its peer; 204, not 404, for a measurement of gloss, timing and inspect not made yet (404 stays for a take that is not there); a /relay
the chat server did not answer says why; a 416 says the Range and the size; started and done for loudness, align, derived and the chain; a write sent
again with the same ?wid= done once and answered as the first time; a change of the lease's holder said, and a holder on a bad line kept longer.
    python3 lab/test_lab_log_2103.py"""
import importlib.util
import io
import json
import re
import socket
import struct
import sys
import tempfile
import threading
import time
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


class Tee(io.StringIO):
    """the lab's stderr kept for the checks, and still shown"""
    def write(self, s):
        sys.__stderr__.write(s)
        return super().write(s)


log = Tee()
sys.stderr = log
lease.sys.stderr = log

tmp = Path(tempfile.mkdtemp(prefix="ruach-t2103-"))
lab.OUTPUTS = tmp / "outputs"
lab.CACHE = tmp / "cache"
T = "20261105-120000-01-t2103"
d = lab.OUTPUTS / T
d.mkdir(parents=True)
(d / "request.json").write_text(json.dumps({"title": "t2103", "lyrics": "[Verse]\nthe first line here\nthe second line here"}), encoding="utf-8")
with wave.open(str(d / "audio.wav"), "wb") as w:   # two seconds of a quiet tone, 48 kHz stereo
    w.setnchannels(2), w.setsampwidth(2), w.setframerate(48000)
    import math
    w.writeframes(b"".join(struct.pack("<hh", int(3000 * math.sin(i / 20)), int(3000 * math.sin(i / 20))) for i in range(96000)))

srv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{port}"


def ask(path, method="GET", body=None, headers=None):
    req = urllib.request.Request(BASE + path, data=body, method=method, headers=dict({"Host": f"127.0.0.1:{port}"}, **(headers or {})))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def lines(after=0):
    return log.getvalue()[after:].splitlines()


ACCESS = re.compile(r'^\d\d:\d\d:\d\d \[lab\] "(\w+) (\S+) HTTP/1\.\d" (\d{3}) (\d+) B · came (\d\d:\d\d:\d\d\.\d{3}) · (\d+) ms · peer (\S+)$')

# 1. the access line: when it came to the ms, how long, its bytes, its peer
at = len(log.getvalue())
code, body, _ = ask("/health", headers={"X-Remote-Addr": "192.0.2.5"})
time.sleep(0.1)
got = [ACCESS.match(x) for x in lines(at)]
got = [m for m in got if m and m.group(2) == "/health"]
check("an access line for GET /health: its time to the millisecond, its duration, its bytes, its peer", code == 200 and len(got) == 1 and
      got[0].group(3) == "200" and int(got[0].group(4)) > len(body) and got[0].group(7) == "192.0.2.5", lines(at))
at = len(log.getvalue())
ask("/health")
time.sleep(0.1)
got = [m for m in (ACCESS.match(x) for x in lines(at)) if m]
check("a request that names no peer: «peer -»", len(got) == 1 and got[0].group(7) == "-", lines(at))

# 2. 204 for not made yet; 404 for a take that is not there
for route in ("/gloss", "/timing", "/inspect"):
    code, body, head = ask(f"{route}?cached=1&name={T}")
    check(f"{route}?cached=1 of a take not measured yet: 204, empty, its reason in X-Ruach-Not-Yet", code == 204 and body == b"" and bool(head.get("X-Ruach-Not-Yet")),
          (code, body[:80], head.get("X-Ruach-Not-Yet")))
code, body, _ = ask("/gloss?cached=1&name=20261105-120000-01-nosuch")
check("a take that is not there: still 404 with its error", code == 404 and b"no take" in body, (code, body[:120]))

# 3. the relay's 502 with its reason
s = socket.socket()
s.bind(("127.0.0.1", 0))
closed = s.getsockname()[1]
s.close()
at = len(log.getvalue())
code, body, _ = ask(f"/relay?to=http://127.0.0.1:{closed}/v1/models")
time.sleep(0.1)
said = [x for x in lines(at) if "relay GET 127.0.0.1:" + str(closed) + "/v1/models: 502" in x]
check("a /relay whose chat server does not answer: 502 to the page, and the reason in the lab's log", code == 502 and len(said) == 1 and "did not answer" in said[0], lines(at))

# 4. a 416 says its Range and the size
guide = next((p for p in sorted((lab.KIT / "docs").glob("*.md"))), None)
if guide is None:
    check("a guide page to ask past its end", False, "no docs/*.md")
else:
    size = guide.stat().st_size
    at = len(log.getvalue())
    code, _, head = ask(f"/guide/{guide.name}", headers={"Range": f"bytes={size + 10}-"})
    time.sleep(0.1)
    said = [x for x in lines(at) if "[lab] 416 " in x]
    check("a Range past the end: 416, and its Range and the file's size in the log", code == 416 and len(said) == 1 and f"bytes={size + 10}-" in said[0] and
          f"{size} bytes" in said[0], lines(at))

# 5. started and done: loudness, align, derived, the chain
at = len(log.getvalue())
try:
    lab.loudness_of(T)
    lab.loudness_of(T)                                     # kept: says nothing more
except Exception as e:                                     # a lab without its loudness meter here: said, the line still checked
    print("  (loudness:", e, ")")
said = [x for x in lines(at) if "[lab] loudness " in x]
check("loudness: started and done once, the kept answer says nothing", len(said) == 2 and said[0].endswith(": started") and
      re.search(r": (done in|failed after) \d+\.\d\d s", said[1]), said)
at = len(log.getvalue())
try:
    lab.align_of(T, "", T, "")
except Exception as e:
    print("  (align:", e, ")")
said = [x for x in lines(at) if "[lab] align " in x]
check("align: started and done (or failed, with why)", len(said) == 2 and said[0].endswith(": started") and re.search(r": (done in|failed after) \d+\.\d\d s", said[1]), said)
at = len(log.getvalue())
code, _, _ = ask(f"/derived?name={T}")
time.sleep(0.1)
said = [x for x in lines(at) if "[lab] derived " in x]
check("derived: started and done", code == 200 and len(said) == 2 and said[0].endswith(": started") and "done in" in said[1], said)
was = lab.chain_plan.steps
lab.chain_plan.steps = lambda spec: []                     # a chain of no steps: its start and its end, nothing run
at = len(log.getvalue())
lab.chain_async(T, {})
for _ in range(50):
    if any("[lab] chain " + T + ": done" in x for x in lines(at)):
        break
    time.sleep(0.1)
lab.chain_plan.steps = was
said = [x for x in lines(at) if "[lab] chain " + T in x]
check("the chain: started (with its steps) and done after its time", len(said) == 2 and ": started, 0 steps" in said[0] and re.search(r": done after \d+\.\d s", said[1]), said)

# 6. a write sent again with the same ?wid=: done once, answered as the first time
A, B = "aaaa2103aaaa", "bbbb2103bbbb"
at = len(log.getvalue())
c1, b1, _ = ask("/lease?scope=t2103&wid=w2103once0001", "POST", json.dumps({"op": "claim", "id": A}).encode(), {"Content-Type": "application/json"})
c2, b2, _ = ask("/lease?scope=t2103&wid=w2103once0001", "POST", json.dumps({"op": "take", "id": B}).encode(), {"Content-Type": "application/json"})
time.sleep(0.1)
check("a write sent again with the same id: its first answer, byte for byte, and not done twice", c1 == c2 == 200 and b1 == b2 and json.loads(b1)["held"] and
      lease.state("t2103", A)["held"] and not lease.state("t2103", B)["held"], (c1, c2, b1[:120], b2[:120]))
check("and said in the lab's log as sent again", any("sent again, answered as the first time (200)" in x for x in lines(at)), lines(at))
c3, b3, _ = ask("/lease?scope=t2103&wid=w2103once0002", "POST", json.dumps({"op": "take", "id": B}).encode(), {"Content-Type": "application/json"})
check("another id is another write: done", c3 == 200 and lease.state("t2103", B)["held"], (c3, b3[:120]))

# 7. the lease: its holder's changes said; a holder on a bad line kept longer
said = [x for x in lines(at) if "[lab] lease t2103: " in x]
check("the lease's holders said: nobody → A by claim, A → B by take (Create here)", len(said) >= 2 and "nobody → aaaa21" in said[0] and " by claim" in said[0] and
      "aaaa21" in said[1] and "→ bbbb21" in said[1] and "take (Create here)" in said[1], said)
lease.post({"scope": "t2103"}, json.dumps({"op": "beat", "id": B, "had": True, "missed": 2}).encode())
lease.LEASES["t2103"]["at"] -= lease.TTL + 5
check("a holder whose beat said two went unanswered keeps the lease past the 30 s", lease.state("t2103", B)["held"], lease.LEASES.get("t2103"))
lease.LEASES["t2103"]["at"] -= lease.TTL_SLOW
check("but not past the bad line's 90 s", not lease.state("t2103", B)["held"], lease.LEASES.get("t2103"))
lease.post({"scope": "t2103"}, json.dumps({"op": "beat", "id": B, "had": True, "missed": 0}).encode())
lease.LEASES["t2103"]["at"] -= lease.TTL + 5
check("a good beat again: the plain 30 s", not lease.state("t2103", B)["held"], lease.LEASES.get("t2103"))
check("the debug journal's own routes pass a read-only window (OPEN)", all(p in lease.OPEN for p in ("/debug/bundle", "/debug/send", "/debug/clear")))

srv.shutdown()
sys.stderr = sys.__stderr__
print("all passed" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
