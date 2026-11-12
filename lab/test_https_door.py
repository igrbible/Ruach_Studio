"""HERESY 1985: the Studio over https, on a copy of the door in a folder of its own (the user's certificates never touched): the door's certificate
signed by the Studio's own authority and verified against it; 1805's self-signed one made anew, the authority kept when the certificate is renewed;
the lab's status and the authority's fingerprint; a page's settings handed over once, by a token, and never twice.   python3 lab/test_https_door.py"""
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import https_door  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def door(kit, *a):
    return subprocess.run([sys.executable, str(kit / "lab" / "tls_door.py"), *a], capture_output=True, text=True, timeout=60)


with tempfile.TemporaryDirectory() as d:
    kit = Path(d)
    (kit / "lab").mkdir()
    shutil.copyfile(HERE / "tls_door.py", kit / "lab" / "tls_door.py")
    tls = kit / "user" / "tls"
    tls.mkdir(parents=True)
    # 1805's certificate, signed by itself
    subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "30", "-keyout", str(tls / "key.pem"),
                    "-out", str(tls / "cert.pem"), "-subj", "/CN=old"], check=True, capture_output=True)
    r = door(kit, "--make-cert")
    v = subprocess.run(["openssl", "verify", "-CAfile", str(tls / "ca.pem"), str(tls / "cert.pem")], capture_output=True, text=True)
    check("the door's certificate signed by the Studio's own authority, verified against it", r.returncode == 0 and v.returncode == 0 and "OK" in v.stdout, (r.stderr[-300:], v.stdout, v.stderr))
    ca = subprocess.run(["openssl", "x509", "-in", str(tls / "ca.pem"), "-noout", "-text"], capture_output=True, text=True).stdout
    leaf = subprocess.run(["openssl", "x509", "-in", str(tls / "cert.pem"), "-noout", "-text"], capture_output=True, text=True).stdout
    check("  the authority a CA that signs no further (pathlen 0), the certificate no CA, for a server, its names localhost and 127.0.0.1 among them",
          "CA:TRUE, pathlen:0" in ca and "CA:FALSE" in leaf and "TLS Web Server Authentication" in leaf and "DNS:localhost" in leaf and "IP Address:127.0.0.1" in leaf, leaf[-400:])
    j = json.load(open(tls / "leaf.json"))
    check("  825 days, its names kept beside it", 820 * 86400 < j["until"] - time.time() < 826 * 86400 and "localhost" in j["names"], j)
    check("  the keys readable by the user alone", oct((tls / "ca-key.pem").stat().st_mode)[-3:] == "600" and oct((tls / "key.pem").stat().st_mode)[-3:] == "600")
    sys.path.insert(0, str(kit / "lab"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("door_copy", kit / "lab" / "tls_door.py")
    dm = importlib.util.module_from_spec(spec)
    sys_argv = sys.argv
    sys.argv = ["tls_door.py"]
    spec.loader.exec_module(dm)
    sys.argv = sys_argv
    check("a certificate that stands is kept", dm.stale() == "", dm.stale())
    j["until"] = int(time.time()) + 5 * 86400
    (tls / "leaf.json").write_text(json.dumps(j))
    check("  near its end: made anew", dm.stale() == "near its end", dm.stale())
    j["until"] = int(time.time()) + 400 * 86400
    j["names"] = ["localhost"]
    (tls / "leaf.json").write_text(json.dumps(j))
    check("  the machine's names changed: made anew", dm.stale() == "the machine's names changed", dm.stale())
    ca_before = (tls / "ca.pem").read_bytes()
    door(kit, "--make-cert")
    check("  made anew, the authority kept (trusted once, it stays trusted)", (tls / "ca.pem").read_bytes() == ca_before and dm.stale() == "", dm.stale())
    s = https_door.status(kit)
    check("the lab's status: the authority there, its fingerprint and the certificate's, the names", s["ca"] and len(s["ca_sha256"]) == 95 and len(s["cert_sha256"]) == 95 and
          "127.0.0.1" in s["names"] and s["port"] == 7443, s)
    check("  the authority's file to download", https_door.ca_file(kit) == tls / "ca.pem")

t = https_door.handoff_put({"storage": {"yue2.tab": "post", "yue2.workspace": "Фосфорида", "n": 3}})
got = https_door.handoff_take(t["token"])
check("a page's settings handed over by a token (strings only), taken once", got == {"storage": {"yue2.tab": "post", "yue2.workspace": "Фосфорида"}, "dropped": []} and t["keys"] == 2, got)
try:
    https_door.handoff_take(t["token"]); said = ""
except FileNotFoundError as e:
    said = str(e)
check("  never twice", "no such hand-over" in said, said)
for bad in ({"storage": "x"}, {"other": {}}, []):
    try:
        https_door.handoff_put(bad); said = ""
    except ValueError as e:
        said = str(e)
    check(f"  not settings refused: {str(bad)[:20]}", "storage" in said, said)
try:
    https_door.handoff_put({"storage": {"k": "x" * 2_100_000}}); said = ""
except ValueError as e:
    said = str(e)
check("  too much refused", "too much" in said, said)
# HERESY 2177 (H05): bound to the computer that made it, the page's own settings alone, the stale ones swept at a take too
LAN_A, LAN_B = "192.0.2.5", "192.0.2.6"                 # RFC 5737 documentation addresses
t = https_door.handoff_put({"storage": {"yue2.tab": "post", "ruach.https.left": "[]", "heresy-x": "1", "yue2.chatUrl": "http://evil.example/v1",
                                        "yue2.orKey": "TEST-OR-NOT-REAL", "evil": "1", "remoteHost": "x"}}, LAN_A)
check("  only the page's own families kept; a paid key, a setting naming an address and a stranger left out, each said",
      t["keys"] == 3 and sorted(t["dropped"]) == ["evil", "remoteHost", "yue2.chatUrl", "yue2.orKey"], t)
try:
    https_door.handoff_take(t["token"], LAN_B); said = ""
except ValueError as e:
    said = str(e)
check("  taken from another computer: refused, and said why", "another computer" in said, said)
try:
    https_door.handoff_take(t["token"], LAN_A); said = ""
except FileNotFoundError as e:
    said = str(e)
check("  a refused hand-over is spent, not left to try again", "no such hand-over" in said, said)
t = https_door.handoff_put({"storage": {"yue2.tab": "post"}}, "::ffff:" + LAN_A)
got = https_door.handoff_take(t["token"], LAN_A)
check("  the same computer (an IPv4 address written as IPv6) takes it, the names left out said again", got == {"storage": {"yue2.tab": "post"}, "dropped": []}, got)
t = https_door.handoff_put({"storage": {"yue2.tab": "post"}}, "")
got = https_door.handoff_take(t["token"], "::1")
check("  this computer is one: a request the engine did not name and its loopback addresses", got["storage"] == {"yue2.tab": "post"}, got)
check("  peers as one computer: 127.0.0.1, ::1, localhost and none", len({https_door.peer_of(a) for a in ("127.0.0.1", "::1", "localhost", "", "127.0.1.1")}) == 1)
old_t = https_door.handoff_put({"storage": {"yue2.tab": "post"}}, LAN_A)["token"]
with https_door.LOCK:
    at, store, peer, dropped = https_door.HANDOFF[old_t]
    https_door.HANDOFF[old_t] = (at - https_door.TTL - 1, store, peer, dropped)
try:
    https_door.handoff_take("not-a-token", LAN_A)
except FileNotFoundError:
    pass
check("  a stale hand-over swept at a take, not only at the next put", old_t not in https_door.HANDOFF)
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
