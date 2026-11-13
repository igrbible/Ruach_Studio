"""The one-time Hugging Face token and the gates (lab/hf_access.py, weights.access, weights.fetch's hf_token), against a mock Hugging Face:
open, gated without a token, gated with a token not yet let in, gated and let in, gone, a token it does not know; and the token itself:
in the run's environment, nowhere in the run's record, its words or the listing; refused when it is not one. Night 11→12.11.2026.
    python3 lab/test_hf_access.py"""
import json
import os
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

GOOD, WAITING, UNKNOWN = "hf_" + "G" * 34, "hf_" + "W" * 34, "hf_" + "U" * 34


class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def answer(self, code, headers=None, body=b""):
        self.send_response(code)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command == "GET":
            self.wfile.write(body)

    def route(self):
        auth = self.headers.get("Authorization", "")
        tok = auth[7:] if auth.startswith("Bearer ") else ""
        p = self.path
        if p == "/api/whoami-v2":
            return self.answer(200, body=json.dumps({"name": "tester"}).encode()) if tok in (GOOD, WAITING) else self.answer(401)
        if p.startswith("/api/models/own/gated"):
            return self.answer(200, body=json.dumps({"gated": "manual"}).encode())
        if "/resolve/" in p:
            repo = "/".join(p.strip("/").split("/")[:2])
            if repo == "own/open":
                return self.answer(302, {"X-Linked-ETag": '"abc"'})
            if repo == "own/gated":
                if tok == GOOD:
                    return self.answer(302)
                if tok:
                    return self.answer(403, {"X-Error-Code": "GatedRepo"})
                return self.answer(401, {"X-Error-Code": "GatedRepo"})
            return self.answer(404, {"X-Error-Code": "RepoNotFound"})
        return self.answer(404)

    do_GET = do_HEAD = route


srv = HTTPServer(("127.0.0.1", 0), Mock)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["RUACH_HF_ENDPOINT"] = f"http://127.0.0.1:{srv.server_port}"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import hf_access  # noqa: E402
import weights  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


R = "0" * 40
v = hf_access.access([("own/open", R, "a"), ("own/gated", R, "b"), ("own/gone", R, "c")])
st = {r["repo"]: r["state"] for r in v["repos"]}
check("no token: open is open, the gated one asks for a login, a missing one is gone, not ready",
      st == {"own/open": "open", "own/gated": "login", "own/gone": "gone"} and not v["ready"], v)
check("  the gated one says its kind (manual: the authors let you in) and its link",
      v["repos"][1].get("gated") == "manual" and v["repos"][1]["link"].endswith("/own/gated"), v["repos"][1])
v = hf_access.access([("own/gated", R, "b")], WAITING)
check("a token not yet let in: «wait», the account named", v["repos"][0]["state"] == "wait" and v["token"] == {"ok": True, "name": "tester"}, v)
v = hf_access.access([("own/open", R, "a"), ("own/gated", R, "b")], GOOD)
check("a token let in: ok, ready", [r["state"] for r in v["repos"]] == ["open", "ok"] or [r["state"] for r in v["repos"]] == ["ok", "ok"], v)
check("  ready", v["ready"], v)
v = hf_access.access([("own/gated", R, "b")], UNKNOWN)
check("a token Hugging Face does not know: said before any gate, nothing asked", v["token"]["ok"] is False and v["repos"] == [] and UNKNOWN not in json.dumps(v), v)
try:
    hf_access.clean("not-a-token " + GOOD[:10])
    check("a string that is no token is refused", False, "accepted")
except ValueError as e:
    check("a string that is no token is refused, without echoing it", GOOD[:10] not in str(e), str(e))
check("scrub takes any hf_… out of a line", hf_access.scrub(f"Bearer {GOOD} failed") == "Bearer hf_… failed")

with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    (k / "heresy").mkdir()
    seen = k / "seen.txt"
    # a fetch-heresy.sh that says whether it got a token, prints it (as a careless tool might), and ends with the counts line
    (k / "heresy" / "fetch-heresy.sh").write_text(
        '#!/bin/bash\n[ -n "$HF_TOKEN" ] && echo "${#HF_TOKEN}" > "' + str(seen) + '"\n'
        'echo "fetched   something (own/gated @ 0000000) with $HF_TOKEN"\n'
        'echo "here 0 · unknown 0 · differs 0 · fetched 1 · missing 0 · failed 0"\n')
    (k / "heresy" / "hf-revisions.txt").write_text(f"own/gated {R}\n")
    out = weights.fetch(k, {"part": "whisper", "hf_token": GOOD})
    for _ in range(100):
        if weights.JOB.get("status") != "running":
            break
        time.sleep(0.05)
    check("the run got the token in its environment", seen.is_file() and seen.read_text().strip() == str(len(GOOD)), seen.read_text() if seen.is_file() else "no file")
    blob = json.dumps(weights.listing(k)) + json.dumps({k2: v2 for k2, v2 in weights.JOB.items()}, default=str) + json.dumps(out, default=str)
    check("the token is nowhere in the run's record, its words or the listing", GOOD not in blob, [x for x in weights.JOB.get("lines", [])])
    check("  its words say «hf_…» where a tool printed it", any("hf_…" in x for x in weights.JOB.get("lines", [])), weights.JOB.get("lines"))
    check("  no file of the kit holds it", not any(GOOD in p.read_text(errors="replace") for p in k.rglob("*") if p.is_file()))
    seen.unlink()
    weights.fetch(k, {"part": "whisper"})
    for _ in range(100):
        if weights.JOB.get("status") != "running":
            break
        time.sleep(0.05)
    check("the next run without a token gets none: it was that run's alone", not seen.exists() or os.environ.get("HF_TOKEN"))
    try:
        weights.fetch(k, {"part": "whisper", "hf_token": "garbage"})
        check("a fetch with something that is no token is refused", False)
    except ValueError:
        check("a fetch with something that is no token is refused", True)
    try:
        weights.fetch(k, {"part": "whisper", "hf_token": GOOD}, "claude")
        check("a test page fetches nothing, token or not", False)
    except ValueError:
        check("a test page fetches nothing, token or not", True)

kit = Path(__file__).resolve().parent.parent
names = {e["name"]: e for e in weights._extras(kit)}
check("H3 says its licence and the repos it pulls", names["h3"]["licence"]["url"].endswith("/LICENSE") and len(names["h3"]["access"]) == 3)
check("Higgs TTS 3 comes from Boson's own repos (the loader's three files from the port), its licence beside it",
      [a[0] for a in names["higgs"]["access"]][:2] == ["bosonai/higgs-tts-3-4b", "bosonai/higgs-audio-v2-tokenizer"] and "Non-Commercial" in names["higgs"]["licence"]["name"])
check("  each repo it pulls is pinned", all(len(weights._pin(kit, r)) == 40 for r, _ in names["higgs"]["access"] + names["h3"]["access"]))
srv.shutdown()
print(f"{'all passed' if not fails else str(fails) + ' failed'}")
sys.exit(1 if fails else 0)
