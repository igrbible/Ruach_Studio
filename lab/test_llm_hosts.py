"""HERESY 2097: the Writer's hosts (lab/llm_hosts.py): the defaults, a change, the migration once, a scope's files its own, the OpenRouter key kept
600 and never read back, OpenRouter's two routes refusing while it is off or has no key, and a question carried to a stand-in OpenRouter on this
machine with the key added by the lab (never by the page).   python3 lab/test_llm_hosts.py"""
import json
import os
import stat
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm_hosts as L  # noqa: E402

bad = []
KEY = "sk-or-v1-" + "0123456789abcdef" * 4


def ok(name, cond, got=""):
    if not cond:
        bad.append(name)
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({got})"))


SEEN = []


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def answer(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        SEEN.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.endswith("/models"):
            return self.answer(200, {"data": [{"id": "test/one", "name": "Test: One", "description": "long words " * 50,
                                               "pricing": {"prompt": "0.0000004", "completion": "0.0000016"}, "context_length": 163840}, {"no": "id"}]})
        self.answer(404, {"error": {"message": "no"}})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        SEEN.append(("POST", self.path, self.headers.get("Authorization"), body))
        if self.headers.get("Authorization") != "Bearer " + KEY:
            return self.answer(401, {"error": {"message": "No auth credentials found", "code": 401}})
        self.answer(200, {"choices": [{"message": {"role": "assistant", "content": "OK"}, "finish_reason": "stop"}], "usage": {"completion_tokens": 1}})


srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
threading.Thread(target=srv.serve_forever, daemon=True).start()
L.OPENROUTER = f"http://127.0.0.1:{srv.server_address[1]}/api/v1"
d = Path(tempfile.mkdtemp(prefix="ruach-test-llm-"))
OWN = {"here": ["quality"], "server": True, "running": False}

s = L.state(d, "", OWN)
ok("no file: the defaults (own on where it is here, the servers off at their own ports, OpenRouter off without a key)",
   not s["exists"] and s["hosts"]["own"]["active"] and not any(s["hosts"][i]["active"] for i in ("vllm", "lmstudio", "ollama", "openrouter")) and
   s["defaults"]["lmstudio"].endswith(":1234/v1") and s["openrouter"] == {"key_set": False, "key_tail": ""}, s)
ok("  the own writer off where its weights are not here", not L.state(d, "", {"here": [], "server": True})["hosts"]["own"]["active"])
ok("OpenRouter's list refused while it is off, nothing asked", L.models(d)[0] == 400 and not SEEN, L.models(d))
c, out = L.chat(d, "", b'{"model": "test/one", "messages": []}')
ok("OpenRouter's chat refused while it is off, nothing asked", c == 400 and json.loads(out).get("setup") and not SEEN, out)

s = L.put(d, "", {"migrate": {"vllm": {"url": "http://192.0.2.2:8008/v1", "active": True}}}, OWN)
ok("the migration writes once: vLLM with the browser's address, on; the rest the defaults", s["migrated"] and s["exists"] and
   s["hosts"]["vllm"] == {"active": True, "url": "http://192.0.2.2:8008/v1"} and s["hosts"]["own"]["active"] and not s["hosts"]["openrouter"]["active"], s)
s = L.put(d, "", {"migrate": {"lmstudio": {"url": "http://x:1234/v1", "active": True}}}, OWN)
ok("  a second migration changes nothing", s["migrated"] is False and not s["hosts"]["lmstudio"]["active"] and s["hosts"]["vllm"]["active"], s)
s = L.put(d, "", {"hosts": {"vllm": {"active": False}, "ollama": {"active": True, "url": " http://127.0.0.1:11434/v1 "}}}, OWN)
ok("a change: vLLM off with its address kept, Ollama on with its own", not s["hosts"]["vllm"]["active"] and s["hosts"]["vllm"]["url"] == "http://192.0.2.2:8008/v1" and
   s["hosts"]["ollama"] == {"active": True, "url": "http://127.0.0.1:11434/v1"}, s)
for bad_put, why in (({"hosts": {"gpt": {"active": True}}}, "an unknown host"), ({"hosts": {"vllm": {"active": "yes"}}}, "active not a bool"),
                     ({"hosts": {"vllm": {"url": "http://a b"}}}, "a space in an address"), ({"hosts": {"own": {"url": "x"}}}, "a field the host has not"),
                     ({"hosts": {}, "migrate": {}}, "both at once")):
    try:
        L.put(d, "", bad_put, OWN)
        ok("refused: " + why, False)
    except ValueError:
        ok("refused: " + why, True)

s = L.set_key(d, "", KEY, OWN)
sec = d / "secrets.json"
ok("the key kept: the answer says so and its last four, never the key", s["openrouter"] == {"key_set": True, "key_tail": KEY[-4:]} and KEY not in json.dumps(s), s["openrouter"])
ok("  in secrets.json, the user's alone (600), not in llm.json", sec.is_file() and stat.S_IMODE(sec.stat().st_mode) == 0o600 and
   KEY not in (d / "llm.json").read_text(), oct(stat.S_IMODE(sec.stat().st_mode)))
ok("  a file that is there keeps OpenRouter off until it is ticked", not s["hosts"]["openrouter"]["active"])
c, out = L.chat(d, "", b'{"model": "test/one", "messages": []}')
ok("  and its chat still refused, nothing asked", c == 400 and not SEEN, out)
s = L.put(d, "", {"hosts": {"openrouter": {"active": True, "model": "test/one"}}}, OWN)
ok("OpenRouter on, with a default model", s["hosts"]["openrouter"] == {"active": True, "model": "test/one"}, s["hosts"]["openrouter"])
c, b = L.models(d)
ok("its list, the fields the Writer shows only", c == 200 and b["data"] == [{"id": "test/one", "name": "Test: One", "pricing": {"prompt": "0.0000004", "completion": "0.0000016"},
                                                                         "context_length": 163840}] and SEEN[-1][2] is None, (c, b, SEEN[-1:]))
n = len(SEEN)
ok("  kept: asked again, OpenRouter is not", L.models(d)[0] == 200 and len(SEEN) == n)
c, out = L.chat(d, "", json.dumps({"model": "test/one", "messages": [{"role": "user", "content": "Reply OK"}], "max_tokens": 8, "stream": True}).encode())
last = SEEN[-1]
ok("a question goes with the key the lab adds, whole (stream off)", c == 200 and json.loads(out)["choices"][0]["message"]["content"] == "OK" and
   last[2] == "Bearer " + KEY and last[3]["stream"] is False and last[3]["model"] == "test/one", (c, out, last[:3]))
c, out = L.chat(d, "", b"not json")
ok("  a body that is not JSON refused", c == 400)

s = L.state(d, "claude", OWN)
ok("a scope's files its own: no key, no hosts of the user's", not s["exists"] and not s["openrouter"]["key_set"], s)
c, out = L.chat(d, "claude", b'{"model": "test/one", "messages": []}')
ok("  its OpenRouter off: refused before anything leaves", c == 400 and json.loads(out)["setup"], out)
L.put(d, "claude", {"hosts": {"openrouter": {"active": True}}}, OWN)
n = len(SEEN)
c, out = L.chat(d, "claude", b'{"model": "test/one", "messages": []}')
ok("  on, but without a key: refused cleanly, nothing asked, the user's key never used", c == 400 and json.loads(out)["error"] == L.NO_KEY and len(SEEN) == n, out)
L.set_key(d, "claude", "sk-or-fake-claude-0000", OWN)
c, out = L.chat(d, "claude", b'{"model": "test/one", "messages": []}')
ok("  with its own (fake) key, that key goes, and the stand-in refuses it", c == 401 and SEEN[-1][2] == "Bearer sk-or-fake-claude-0000", (c, SEEN[-1][2]))
ok("  the user's files untouched by the scope", json.loads((d / "secrets.json").read_text())["openrouter_key"] == KEY and (d / "secrets-claude.json").is_file())
try:
    L.state(d, "../x")
    ok("a bad scope refused", False)
except ValueError:
    ok("a bad scope refused", True)
try:
    L.set_key(d, "", "has a space", OWN)
    ok("a key with a space refused, the old one kept", False)
except ValueError as e:
    ok("a key with a space refused without its words, the old one kept", "space" not in str(e).replace("spaces", "") and L.state(d)["openrouter"]["key_set"])
s = L.set_key(d, "", "", OWN)
ok("forgotten: no key, its file gone", not s["openrouter"]["key_set"] and not (d / "secrets.json").exists(), s["openrouter"])
L.OPENROUTER = "http://127.0.0.1:9/api/v1"
L.LIST["data"] = None
L.set_key(d, "", KEY, OWN)
c, out = L.chat(d, "", b'{"model": "test/one", "messages": []}')
ok("OpenRouter not reachable: 502 that says so, the key nowhere in it", c == 502 and KEY not in out.decode() and "did not answer" in out.decode(), out)
c, b = L.models(d)
ok("  its list too", c == 502 and "did not come" in b["error"], b)
srv.shutdown()
print(f"{len(bad)} failed" if bad else "all passed", "·", d)
sys.exit(1 if bad else 0)
