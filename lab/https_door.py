"""HERESY 1985 (Viktor 01.11.2026: «авторедирект с 7777 на 7443, модалка с предупреждением, чреватыми последствиями при возврате на 7777… при отказе
уведомляем, что не будет работать в сетапе с удалённой машиной Студии»; «По самоподписному корневому сертификату поддерживаю твою идею»): the lab's side
of the Studio over https.
· The door (tls_door.py, 1805) is started by the lab itself when nothing answers on its port, so it runs under Pinokio and ./start.sh as under systemd
  (RUACH_TLS=0 keeps it off); it dies with the lab's own group.
· What the page needs to know: whether the door answers, on which port, whether its certificate is signed by the Studio's own authority (and that
  authority's certificate to download and trust once), their fingerprints.
· A page moving from http to https hands its settings over: its localStorage, once, by a token that lives ten minutes (two origins never share it).
    status(kit) · start(kit) · handoff_put(data, peer) → token · handoff_take(token, peer) → data

HERESY 2177 (H05; the audit of 06.11.2026, 2.5 and section 7 item 17: any computer of the network could make a hand-over with curl and send the link
https://studio:7443/#handoff=TOKEN, and the https page wrote what it carried into its storage; a hand-over gone stale stayed in memory until the next
one was made): a hand-over is taken only by the computer that made it (its peer, as the Studio names its visitor in X-Remote-Addr; this computer's
own addresses are one), it carries only the page's own settings (keys of the families yue2., ruach., heresy.), never a paid service's key nor a
setting that points the page at another address (a key named for a URL, a host, an endpoint or an origin), each name left out said in the answer
of both sides ("dropped"), and the stale ones go at every put and every take."""
import hashlib
import ipaddress
import json
import os
import re
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
FAMILY = re.compile(r"(?:yue2|ruach|heresy)[._-][A-Za-z0-9_.:-]{1,96}")   # HERESY 2177: the page's own settings
SECRETS = frozenset(("yue2.orKey", "yue2.civitaiKey"))                    # the page keeps them back (HeresySettings.secrets); the lab as well
POINTS = re.compile(r"(?i)url|host|endpoint|origin")                     # a setting that sends the page elsewhere (yue2.chatUrl)


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


def peer_of(addr):
    """HERESY 2177: the visitor as one computer: this computer's own addresses (and a request the engine did not name, which only this computer
    can make: the lab listens on 127.0.0.1) are one, «this computer»; an IPv4 address as IPv6 (::ffff:) is itself"""
    a = str(addr or "").strip().split("%")[0]
    if a.lower().startswith("::ffff:"):
        a = a[7:]
    if not a or a.lower() == "localhost":
        return "this computer"
    try:
        return "this computer" if ipaddress.ip_address(a).is_loopback else str(ipaddress.ip_address(a))
    except ValueError:
        return a


def _sweep(now):
    for t in [t for t, rec in HANDOFF.items() if now - rec[0] > TTL]:
        del HANDOFF[t]


def handoff_put(data, peer=""):
    raw = json.dumps(data, ensure_ascii=False)
    if len(raw) > MAX:
        raise ValueError("too much to hand over")
    if not isinstance(data, dict) or not isinstance(data.get("storage"), dict):
        raise ValueError("say {storage: {key: value}}")
    store, dropped = {}, []
    for k, v in data["storage"].items():
        if not (isinstance(k, str) and isinstance(v, str)):
            continue
        if FAMILY.fullmatch(k) and k not in SECRETS and not POINTS.search(k):
            store[k] = v
        else:
            dropped.append(k[:96])
    token = secrets.token_urlsafe(24)
    now = time.time()
    with LOCK:
        _sweep(now)
        HANDOFF[token] = (now, store, peer_of(peer), dropped)
    if dropped:
        print(f"[lab] https hand-over: {len(store)} settings kept, {len(dropped)} left out: {', '.join(dropped[:12])}", file=sys.stderr, flush=True)
    return {"token": token, "keys": len(store), "dropped": dropped}


def handoff_take(token, peer=""):
    now = time.time()
    with LOCK:
        _sweep(now)
        got = HANDOFF.pop(str(token or ""), None)
    if not got:
        raise FileNotFoundError("no such hand-over, or too old: open the Studio over https and choose again")
    if got[2] != peer_of(peer):                      # taken once all the same: a link sent from another computer is spent, not left to try again
        print(f"[lab] https hand-over refused: made by {got[2]}, asked by {peer_of(peer)}", file=sys.stderr, flush=True)
        raise ValueError("this hand-over was made on another computer: the settings come over only to the computer that moved them")
    return {"storage": got[1], "dropped": got[3]}
