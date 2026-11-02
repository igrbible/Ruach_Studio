"""HERESY 1985 (Viktor 01.11.2026: «авторедирект с 7777 на 7443, модалка с предупреждением, чреватыми последствиями при возврате на 7777… при отказе
уведомляем, что не будет работать в сетапе с удалённой машиной Студии»; «По самоподписному корневому сертификату поддерживаю твою идею»): the lab's side
of the Studio over https.
· The door (tls_door.py, 1805) is started by the lab itself when nothing answers on its port, so it runs under Pinokio and ./start.sh as under systemd
  (RUACH_TLS=0 keeps it off); it dies with the lab's own group.
· What the page needs to know: whether the door answers, on which port, whether its certificate is signed by the Studio's own authority (and that
  authority's certificate to download and trust once), their fingerprints.
· A page moving from http to https hands its settings over: its localStorage, once, by a token that lives ten minutes (two origins never share it).
    status(kit) · start(kit) · handoff_put(data) → token · handoff_take(token) → data"""
import hashlib
import json
import os
import secrets
import socket
import ssl
import subprocess
import sys
import threading
import time
from pathlib import Path

PORT = int(os.environ.get("RUACH_TLS_PORT", "7443"))
LOCK = threading.Lock()
HANDOFF = {}
TTL = 600
MAX = 2_000_000


def tls_dir(kit):
    return Path(kit) / "user" / "tls"


def answers(port=PORT):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.6):
            return True
    except OSError:
        return False


def start(kit):
    """The door started beside the lab when nothing answers on its port (a systemd unit of its own, or a door left running, answers already)."""
    if os.environ.get("RUACH_TLS", "1") in ("0", "") or answers():
        return False
    log = Path(kit) / "tmp" / "tls-door.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.Popen([sys.executable, str(Path(kit) / "lab" / "tls_door.py")], cwd=str(kit), stdin=subprocess.DEVNULL,
                         stdout=open(log, "ab"), stderr=subprocess.STDOUT)
    except OSError as e:
        print(f"[lab] the https door did not start: {e}", file=sys.stderr, flush=True)
        return False
    print(f"[lab] the https door started on :{PORT} (its log tmp/tls-door.log)", file=sys.stderr, flush=True)
    return True


def _fp(pem_file):
    try:
        der = ssl.PEM_cert_to_DER_cert(Path(pem_file).read_text(encoding="ascii"))
    except (OSError, ValueError):
        return ""
    h = hashlib.sha256(der).hexdigest().upper()
    return ":".join(h[i:i + 2] for i in range(0, len(h), 2))


def status(kit):
    d = tls_dir(kit)
    leaf = {}
    try:
        leaf = json.load(open(d / "leaf.json", encoding="utf-8"))
    except (OSError, ValueError):
        pass
    return {"door": answers(), "port": PORT, "ca": (d / "ca.pem").is_file(), "ca_sha256": _fp(d / "ca.pem"), "cert_sha256": _fp(d / "cert.pem"),
            "names": leaf.get("names") or [], "until": leaf.get("until") or 0, "off": os.environ.get("RUACH_TLS", "1") in ("0", "")}


def ca_file(kit):
    f = tls_dir(kit) / "ca.pem"
    if not f.is_file():
        raise FileNotFoundError("the Studio has no certificate authority yet: the https door makes it when it starts")
    return f


def handoff_put(data):
    raw = json.dumps(data, ensure_ascii=False)
    if len(raw) > MAX:
        raise ValueError("too much to hand over")
    if not isinstance(data, dict) or not isinstance(data.get("storage"), dict):
        raise ValueError("say {storage: {key: value}}")
    store = {str(k): str(v) for k, v in data["storage"].items() if isinstance(k, str) and isinstance(v, str)}
    token = secrets.token_urlsafe(24)
    now = time.time()
    with LOCK:
        for t in [t for t, (at, _) in HANDOFF.items() if now - at > TTL]:
            del HANDOFF[t]
        HANDOFF[token] = (now, store)
    return {"token": token, "keys": len(store)}


def handoff_take(token):
    with LOCK:
        got = HANDOFF.pop(str(token or ""), None)
    if not got or time.time() - got[0] > TTL:
        raise FileNotFoundError("no such hand-over, or too old: open the Studio over https and choose again")
    return {"storage": got[1]}
