"""HERESY 2937: tools/lab-sweep.py, the sweep CI runs over every GET route of the lab on Windows and macOS: its routes read from lab.py's
own GET handler (the Windows soak's 182 among them), its verdicts (a 500 of the Studio's own, a system's raw words, a lab that stops answering
fail; a 4xx and a package the runner lacks pass), and a whole run against a small lab of its own.
    .venv/bin/python lab/test_lab_sweep_2937.py"""
import http.server
import importlib.util
import json
import sys
import threading
from pathlib import Path

LAB = Path(__file__).resolve().parent
ROOT = LAB.parent
TOOL = next(p for p in (ROOT / "tools" / "lab-sweep.py", ROOT / "heresy" / "root" / "tools" / "lab-sweep.py") if p.is_file())
spec = importlib.util.spec_from_file_location("lab_sweep", TOOL)
sw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sw)
sw.ROOT = ROOT                                         # the dev tree keeps tools/ in heresy/root: the lab is the studio's own

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


rs = sw.routes(LAB / "lab.py")
SOAK = ["/abcompare", "/activity", "/artist/sizes", "/audio/devices", "/gpus", "/gpus/live", "/machine", "/reader/cards", "/reader/tier", "/sys/live",
        "/train/datasets", "/train/log", "/update", "/weights", "/places", "/catalog", "/writer", "/video/shots", "/daw", "/lora/profile"]
check(len(rs) >= 182 and all(r in rs for r in SOAK) and "/art/draw" not in rs,
      f"the lab's GET routes read from its own handler: {len(rs)}, the soak's among them; /art/draw (it starts a picture) left out")
check(sw.shadowed(LAB / "lab.py") == {"GET": [], "POST": []}, "no path handled twice in the lab's GET and POST handlers (2936b: /listen was)")
import tempfile
twice = Path(tempfile.mkdtemp()) / "lab.py"
twice.write_text('    def do_GET(self):\n            if url.path == "/listen":\n                pass\n            if url.path == "/listen":   # x\n'
                 '                pass\n    def do_POST(self):\n            fn = a if url.path == "/places/move" else b\n            if url.path == "/places/move":\n'
                 '                pass\n    def log_message(self):\n', encoding="utf-8")
check(sw.shadowed(twice) == {"GET": ["/listen"], "POST": []}, "a path given a second «if url.path ==» is found; a mere test of the path inside a handler is not")
check(sw.verdict(400, b'{"error": "bad take name"}') == "" and sw.verdict(404, b'{"error": "no such run"}') == "" and sw.verdict(200, b"{}") == "",
      "a 4xx (a question asked without its arguments) and a 200 pass")
check(sw.verdict(500, b'{"error": "No module named \'torch\'"}') == "" and sw.verdict(500, b'{"error": "No module named \'faster_whisper.x\'"}') == "",
      "a 500 that names only a package the runner lacks passes (CI runs the lab without its packages)")
check(sw.verdict(500, b'{"error": "No module named \'winx\'"}') != "" and sw.verdict(500, b'{"error": "No module named \'reader_glyphs\'"}') != ""
      and sw.verdict(500, b'{"error": "No module named \'json\'"}') != "",
      "a 500 for a module of the lab's own, or of Python's, fails")
check(sw.verdict(500, b'{"error": "\'str\' object has no attribute \'get\'"}').startswith("500"), "a 500 of the Studio's own fails, its words said")
for body in (b'{"cards": {"error": "nvidia-smi did not answer: [WinError 2] The system cannot find the file specified"}}',
             b'{"error": "[Errno 2] No such file or directory: \'C:\\\\RuachStudio\\\\training\\\\train.log\'"}',
             b'{"error": "module \'os\' has no attribute \'killpg\'"}', b"Traceback (most recent call last):\n  File"):
    check(sw.verdict(200 if b"cards" in body else 404, body).startswith("a system's raw words"), "a system's raw words fail whatever the code: " + body[:48].decode())
check(sw.verdict(-1, b"timed out").startswith("no answer"), "no answer fails")

# a whole run against a small lab of our own: its routes are lab.py's, its answers made up
ANS = {"/health": (200, {"ok": True}), "/gpus": (200, {"cards": {"error": "no nvidia-smi here: no NVIDIA card, or its driver is not installed"}}),
       "/train/log": (404, {"error": "no log of the run x yet"}), "/reader/tier": (500, {"error": "No module named 'torch'"})}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        code, body = ANS.get(self.path, (400, {"error": "bad take name"}))
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}"
try:
    check(sw.main([base]) == 0, "a lab whose every route answers in words: the sweep passes (exit 0)")
    ANS["/artist/sizes"] = (500, {"error": "'str' object has no attribute 'get'"})
    ANS["/machine"] = (200, {"cards": [], "error": "nvidia-smi did not answer: [WinError 2] The system cannot find the file specified"})
    check(sw.main([base]) == 1, "a 500 of its own and a [WinError 2] in an answer: the sweep fails (exit 1)")
finally:
    srv.shutdown()
check(sw.main(["http://127.0.0.1:9"]) == 2, "no lab at the address: exit 2")
print(f"{ok} passed")
