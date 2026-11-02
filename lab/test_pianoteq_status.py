"""HERESY 1986: the Engine's Pianoteq tab on a Pianoteq of our own making (a JSON-RPC server that answers as Pianoteq does): status() says what is
installed and activated and never the name or e-mail Pianoteq also knows; activate() refuses what is no serial, gives a good one through the RPC,
never in a command line, says Pianoteq's refusal without the serial, keeps the user's audio setup when Pianoteq rewrites its preferences on quitting,
and marks the catalog stale.   python3 lab/test_pianoteq_status.py"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


FAKE = r'''#!PYTHON
import json, os, re, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
HOME = os.environ["HOME"]
open(os.path.join(HOME, "argv.log"), "a").write(json.dumps(sys.argv[1:]) + "\n")
port = int(sys.argv[sys.argv.index("--serve") + 1].split(":")[-1])
prefs = None if "--prefs" in sys.argv else os.path.join(HOME, ".config/Modartt/Pianoteq92.prefs")
state = {"on": os.path.isfile(os.path.join(HOME, "activated"))}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        q = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        m, p = q["method"], q.get("params")
        err, r = None, None
        if m == "list": r = [{"name": "activate", "spec": "activate(serial,device_name)"}]
        elif m == "getInfo": r = [{"product_name": "Pianoteq", "version": "9.2.5", "build_date": "20260909"}]
        elif m == "getAudioDeviceInfo": r = [{"device_type": "ALSA", "audio_output_device_name": "Default ALSA Output", "status": "running"}]
        elif m == "getActivationInfo": r = [{"status": 1 if state["on"] else 0, "addons": ["Steinway D", ""] if state["on"] else [], "error_msg": "",
                                             "name": "Secret Person", "email": "secret@example.org", "hwname": "box"}]
        elif m == "getListOfPresets": r = [{"name": "NY Steinway D Classical", "instr": "Grand Steinway D (New York)", "class": "Acoustic Piano",
                                            "license_status": "ok" if state["on"] else "demo"},
                                           {"name": "U4 Felt", "instr": "Upright U4", "class": "Acoustic Piano", "license_status": "demo"}]
        elif m == "activate":
            if p.get("serial") == "GOOD-1234-5678": state["on"] = True
            else: err = {"code": 1, "message": "invalid serial " + str(p.get("serial"))}
        elif m == "quit":
            if prefs and state["on"]:
                t = open(prefs).read()
                t = re.sub(r'<VALUE name="audio-setup"[^>]*/>', '<VALUE name="audio-setup" val="REWRITTEN"/>', t)
                t = t.replace("</PROPERTIES>", '  <VALUE name="activation" val="yes"/>\n</PROPERTIES>')
                open(prefs, "w").write(t)
                open(os.path.join(HOME, "activated"), "w").write("1")
            r = True
        b = json.dumps({"jsonrpc": "2.0", "id": q.get("id"), **({"error": err} if err else {"result": r})}).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        if m == "quit":
            import threading; threading.Thread(target=srv.shutdown).start()
srv = HTTPServer(("127.0.0.1", port), H)
srv.serve_forever()
'''

with tempfile.TemporaryDirectory() as d:
    home, kit = Path(d) / "home", Path(d) / "kit"
    (home / ".config/Modartt").mkdir(parents=True)
    (kit / "user").mkdir(parents=True)
    (kit / "tmp").mkdir()
    prefs = home / ".config/Modartt/Pianoteq92.prefs"
    prefs.write_text('<?xml version="1.0"?>\n<PROPERTIES>\n  <VALUE name="audio-setup" val="MINE"/>\n</PROPERTIES>\n')
    fake = kit / "fake-pianoteq"
    fake.write_text(FAKE.replace("PYTHON", sys.executable))
    fake.chmod(0o755)
    (kit / "user" / "pianoteq.json").write_text(json.dumps({"path": str(fake)}))
    os.environ["HOME"] = str(home)
    import pianoteq_live as p   # noqa: E402
    p.IDLE = 5
    s = p.status(kit)
    flat = json.dumps(s)
    check("status: installed, its program shown inside the Studio, its version, not activated, presets counted by instrument",
          s["installed"] and s["program"] == "fake-pianoteq" and s["version"] == "9.2.5" and s["activation"]["status"] == 0 and
          s["presets"] == {"total": 2, "full": 0} and [r["instr"] for r in s["instruments"]] == ["Grand Steinway D (New York)", "Upright U4"], s)
    check("  never the name or the e-mail Pianoteq knows", "Secret" not in flat and "secret@" not in flat and "box" not in flat, flat)
    for bad in ("", "short", "under_score!", "x" * 80, "../../etc"):
        try:
            p.activate(kit, bad); said = ""
        except ValueError as e:
            said = str(e)
        check(f"  not a serial refused: {bad[:12]!r}", "serial" in said, said)
    p.Server(kit).stop()
    r = p.activate(kit, "WRONG-0000-0000")
    check("a serial Pianoteq refuses: its words said, the serial not in them, still not activated",
          r.get("said") and "WRONG-0000-0000" not in r["said"] and "invalid serial" in r["said"] and r["activation"]["status"] == 0, r)
    (kit / "user" / "pianoteq-catalog.json").write_text(json.dumps({"key": "k", "presets": []}))
    r = p.activate(kit, " GOOD-1234-5678 ")
    check("a good serial: activated, its add-ons, what plays in full counted again", not r.get("said") and r["activation"]["status"] == 1 and
          r["activation"]["addons"] == ["Steinway D"] and r["presets"]["full"] == 1, r)
    t = prefs.read_text()
    check("  the user's preferences keep their audio setup, Pianoteq's activation added", 'val="MINE"' in t and "REWRITTEN" not in t and 'name="activation"' in t, t)
    argv = (home / "argv.log").read_text()
    check("  the serial never in a command line", "GOOD-1234" not in argv and "WRONG-0000" not in argv and "--activate" not in argv, argv)
    check("  the catalog marked stale", json.loads((kit / "user" / "pianoteq-catalog.json").read_text()).get("stale") is True)
    check("  no folder of its own left behind", not list((kit / "tmp" / "pianoteq-live").glob("act-*")), list((kit / "tmp" / "pianoteq-live").glob("*")))
    p.Server(kit).stop()
    (kit / "user" / "pianoteq.json").unlink()
    os.environ["PATH"] = str(Path(d) / "nothing")
    s = p.status(kit)
    check("no Pianoteq: said so, nothing asked", s == {"installed": False, "program": "", "prefs": True}, s)
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
