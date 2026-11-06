"""HERESY 2011: the audit of 02.11.2026 in the lab's modules, on a library of our own making. C2 the ZIP takes an MP3 take's song as it was made, a FLAC
asked as WAV in 24 bits, and says a take with no song; C6 C8 the family tree sees a take made by Edit and a rename; S5 the relay asks a chat server as
a chat client does, says a redirect without following it, and judges an IPv4 address in IPv6 dress as the IPv4; P3 a song read for its first seconds
alone.   python3 lab/test_audit2011.py"""
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ab_compare  # noqa: E402
import collection  # noqa: E402
import lineage  # noqa: E402
import relay  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def take(out, name, audio=None, req=None, title=None):
    d = out / name
    d.mkdir(parents=True)
    json.dump({"title": title or name, "created": int(time.time())}, open(d / "meta.json", "w"))
    json.dump(req or {"title": name}, open(d / "request.json", "w"))
    if audio:
        sf.write(str(d / "audio.wav"), np.zeros((4800, 2), np.float32), 48000, subtype="PCM_24")
        if audio != "wav":
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(d / "audio.wav")] + (["-b:a", "128k"] if audio == "mp3" else []) + [str(d / f"audio.{audio}")],
                           check=True, timeout=60)
            (d / "audio.wav").unlink()
    return d


with tempfile.TemporaryDirectory() as k:
    kit = Path(k)
    out = kit / "outputs"
    out.mkdir()
    take(out, "t-wav", "wav")
    take(out, "t-mp3", "mp3")
    take(out, "t-flac", "flac")
    take(out, "t-none")
    for fmt in ("wav", "flac"):
        j = collection.export_start(kit, out, ["t-wav", "t-mp3", "t-flac", "t-none"], fmt, False)
        for _ in range(300):
            s = collection.export_status(j["id"])
            if s["status"] != "running":
                break
            time.sleep(0.1)
        z = zipfile.ZipFile(kit / "tmp" / "exports" / s["file"])
        names = sorted(z.namelist())
        check(f"C2 · {fmt}: the MP3 take's song in the ZIP as its MP3, the FLAC's as asked, the WAV's as asked: {names}",
              names == sorted(["t-mp3.mp3", f"t-flac.{fmt}", f"t-wav.{fmt}"]), names)
        check(f"C2 · {fmt}: a take with no song said (no_song 1), not counted whole in silence", s.get("no_song") == 1, s)
        if fmt == "wav":
            info = sf.info(z.open("t-flac.wav"))
            check("C2 · a FLAC take asked as WAV is 24 bits", info.subtype == "PCM_24", info.subtype)

    # C8: a take made by Edit is its source's child; C6: a rename shows
    take(out, "src", req={"title": "src"}, title="The source")
    take(out, "src-01-crop-x", req={"title": "c", "edited": {"op": "crop", "from": "src"}})
    t = lineage.tree(kit, "src")
    kids = [c["name"] for c in t["root"]["children"]]
    check("C8 · a cropped take stands under the take it was cut from", "src-01-crop-x" in kids, kids)
    what = next((c.get("what") for c in t["root"]["children"] if c["name"] == "src-01-crop-x"), None)
    check("C8 · and says what it is of it: cropped", what == "cropped", what)
    time.sleep(0.02)
    m = json.load(open(out / "src" / "meta.json"))
    m["title"] = "The source, renamed"
    json.dump(m, open(out / "src" / "meta.json", "w"))
    t = lineage.tree(kit, "src")
    check("C6 · a rename shows in the tree at once", t["root"]["title"] == "The source, renamed", t["root"]["title"])

    # P3: the first seconds alone
    f = kit / "long.wav"
    sf.write(str(f), np.zeros((48000 * 20, 2), np.float32), 48000)
    x = ab_compare.read(f, seconds=5)
    check("P3 · a 20 s song read for its first 5 s alone", x.shape[0] == 5 * ab_compare.SR, x.shape)
    check("P3 · and whole when no seconds are given", ab_compare.read(f).shape[0] == 20 * ab_compare.SR)

# S5: the relay
for url, method, ok in (("http://127.0.0.1:9/v1/chat/completions", "POST", True), ("http://127.0.0.1:9/v1/models", "GET", True),
                        ("http://127.0.0.1:9/cgi-bin/x/models", "POST", False), ("http://127.0.0.1:9/v1/chat/completions", "GET", False),
                        ("http://[::ffff:8.8.8.8]:9/v1/models", "GET", False), ("http://[::ffff:192.0.2.1]:9/v1/models", "GET", True)):
    try:
        relay.allowed(url, method)
        said = True
    except ValueError as e:
        said = str(e)
    check(f"S5 · {method} {url}: {'relayed' if ok else 'refused'}", (said is True) == ok, said)


class Moved(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(302)
        self.send_header("Location", "http://8.8.8.8/v1/models")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), Moved)
threading.Thread(target=srv.serve_forever, daemon=True).start()
code, body, ctype = relay.relay(f"http://127.0.0.1:{srv.server_port}/v1/models", "GET", timeout=5)
check("S5 · a redirect is said, not followed (502 naming where it led)", code == 502 and b"8.8.8.8" in body and b"not followed" in body, (code, body[:120]))
srv.shutdown()
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
