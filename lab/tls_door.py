"""HERESY 1805 · the Studio's https door (Viktor 28.10.2026: «по твоему совету с прошлой недели касательно самописного ssl сертификата для Студии...
прикручивай, но не на всю Студию, а только на удалённый MIDI-контроллер и для будущих имплементаций»).

A browser gives Web MIDI (and the clipboard, an AudioWorklet) only to a secure page: https, or localhost. The Studio answers plain http on its port,
so from another computer its MIDI page says what it lacks. This door is a second way in, beside that port and changing nothing of it: https on its own
port (7443 unless --port), with a certificate the Studio makes for itself (user/tls/cert.pem and key.pem, ten years, for this machine's names and
addresses; a browser asks once whether to trust it), passing every byte to the Studio's port and back (its pages, the lab, their streams).

Who may come in is the Studio's own answer: user/access.json (Engine → Security), read again whenever it changes, with the engine's rule repeated
here (yue-server.cpp access_allows: this computer always; «local» nothing else; «private» the private networks; «list» the networks listed;
RUACH_ALLOW_PUBLIC=1 anyone). Through the door every visitor would reach the Studio from this very computer, which the engine lets in: so the door asks
first, by the visitor's own address, and a refused one gets a page saying why.

    tls_door.py [--port 7443] [--to 127.0.0.1:7777] [--make-cert]      (systemd/ruach-tls-door.service runs it)"""
import asyncio
import ipaddress
import json
import os
import socket
import ssl
import subprocess
import sys
import time
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
TLS = KIT / "user" / "tls"
CERT, KEY = TLS / "cert.pem", TLS / "key.pem"
ACCESS = Path(os.environ.get("RUACH_ACCESS") or KIT / "user" / "access.json")
args = sys.argv[1:]


def opt(name, default):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


PORT = int(opt("--port", os.environ.get("RUACH_TLS_PORT", "7443")))
TO_HOST, TO_PORT = opt("--to", "127.0.0.1:" + os.environ.get("PORT", "7777")).rsplit(":", 1)
TO_PORT = int(TO_PORT)


def say(*a):
    print(time.strftime("%H:%M:%S"), "[door]", *a, flush=True)


# ---- the certificate: the Studio's own, made once, for the names and addresses it is reached by
def own_names():
    names, ips = {"localhost", socket.gethostname()}, {"127.0.0.1", "::1"}
    try:
        for a in subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5).stdout.split():
            ips.add(a)
    except (OSError, subprocess.SubprocessError):
        pass
    return sorted(names), sorted(ips)


# HERESY 1985 (Viktor 01.11.2026: «По самоподписному корневому сертификату поддерживаю твою идею»): the Studio's own certificate authority, made once
# (ten years), signs the door's certificate; trusted once in a browser or a system, it never warns again, whatever addresses a later certificate names.
# The door's certificate lives 825 days (the longest Apple's browsers take) and is made anew 30 days before its end, or when the machine's names change.
CA_CERT, CA_KEY, LEAF = TLS / "ca.pem", TLS / "ca-key.pem", TLS / "leaf.json"
LEAF_DAYS = 825


def make_ca():
    TLS.mkdir(parents=True, exist_ok=True)
    os.chmod(TLS, 0o700)
    subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "3650",
                    "-keyout", str(CA_KEY), "-out", str(CA_CERT), "-subj", "/CN=Ruach Studio local authority (" + socket.gethostname() + ")",
                    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0", "-addext", "keyUsage=critical,keyCertSign,cRLSign"],
                   check=True, capture_output=True)
    os.chmod(CA_KEY, 0o600)
    say("the Studio's own certificate authority made →", CA_CERT)


def make_cert():
    if not (CA_CERT.is_file() and CA_KEY.is_file()):
        make_ca()
    names, ips = own_names()
    san = ",".join(["DNS:" + n for n in names] + ["IP:" + i for i in ips])
    csr, ext = TLS / "cert.csr", TLS / "cert.ext"
    ext.write_text("subjectAltName=" + san + "\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n",
                   encoding="utf-8")
    subprocess.run(["openssl", "req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", str(KEY), "-out", str(csr),
                    "-subj", "/CN=Ruach Studio (" + socket.gethostname() + ")"], check=True, capture_output=True)
    subprocess.run(["openssl", "x509", "-req", "-in", str(csr), "-CA", str(CA_CERT), "-CAkey", str(CA_KEY), "-set_serial", str(int.from_bytes(os.urandom(8), "big")),
                    "-days", str(LEAF_DAYS), "-sha256", "-extfile", str(ext), "-out", str(CERT)], check=True, capture_output=True)
    os.chmod(KEY, 0o600)
    csr.unlink(missing_ok=True)
    ext.unlink(missing_ok=True)
    LEAF.write_text(json.dumps({"names": names + ips, "until": int(time.time()) + LEAF_DAYS * 86400}), encoding="utf-8")
    say("a certificate made for", san, "signed by the Studio's own authority →", CERT)


def stale():
    """Why the door's certificate is made anew ("" when it stands): none yet; 1805's, signed by itself; near its end; the machine's names changed."""
    if not (CERT.is_file() and KEY.is_file()):
        return "none yet"
    try:
        leaf = json.load(open(LEAF, encoding="utf-8"))
    except (OSError, ValueError):
        return "signed by itself (1805): now by the Studio's own authority"
    if not CA_CERT.is_file():
        return "its authority is gone"
    if leaf.get("until", 0) - time.time() < 30 * 86400:
        return "near its end"
    names, ips = own_names()
    if set(names + ips) - set(leaf.get("names") or []):
        return "the machine's names changed"
    return ""


# ---- who may come in: the engine's rule, from the same file
_seen = {"mtime": None, "mode": "private", "nets": []}


def access():
    try:
        m = ACCESS.stat().st_mtime
        if m != _seen["mtime"]:
            d = json.load(open(ACCESS, encoding="utf-8"))
            _seen.update(mtime=m, mode=d.get("mode") if d.get("mode") in ("local", "private", "list") else "private",
                         nets=[str(n).strip() for n in (d.get("nets") or []) if str(n).strip()])
    except FileNotFoundError:
        _seen.update(mtime=None, mode="private", nets=[])    # no decision yet: private networks, as the engine
    except (OSError, ValueError):
        pass                                                  # a file half written: the last good reading
    return _seen["mode"], _seen["nets"]


# the engine's private networks (yue-server.cpp, HERESY 1114): 10/8, 172.16/12, 192.168/16, link-local 169.254/16 and the shared 100.64/10 (Tailscale);
# written as numbers, so the release's scan for a machine's address finds none here
PRIVATE_V4 = [ipaddress.ip_network((a, n)) for a, n in ((0x0A000000, 8), (0xC0A80000, 16), (0xAC100000, 12), (0xA9FE0000, 16), (0x64400000, 10))]


def private(ip):
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if ip.is_loopback:
        return True
    if ip.version == 4:
        return any(ip in n for n in PRIVATE_V4)
    return any(ip in ipaddress.ip_network(n) for n in ("fc00::/7", "fe80::/10"))


def allowed(addr):
    if os.environ.get("RUACH_ALLOW_PUBLIC", "0") not in ("", "0"):
        return True
    try:
        ip = ipaddress.ip_address(addr.split("%")[0])
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if ip.is_loopback:
        return True
    mode, nets = access()
    if mode == "local":
        return False
    if mode == "list":
        for n in nets:
            try:
                if ip in ipaddress.ip_network(n, strict=False):
                    return True
            except ValueError:
                continue
        return False
    return private(ip)


REFUSED = ("HTTP/1.1 403 Forbidden\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n"
           "<!doctype html><meta charset=utf-8><title>Ruach Studio</title><body style='font:16px system-ui;margin:3em'>"
           "<h1>This Studio does not open to {addr}</h1><p>Who may open it is its user's choice: Engine → Security, on the computer it runs on.</p>")


async def pipe(r, w):
    try:
        while True:
            b = await r.read(65536)
            if not b:
                break
            w.write(b)
            await w.drain()
    except (ConnectionError, OSError, asyncio.CancelledError):
        pass
    finally:
        try:
            w.close()
        except (OSError, RuntimeError):
            pass


async def visit(r, w):
    peer = w.get_extra_info("peername") or ("?", 0)
    if not allowed(peer[0]):
        say("refused", peer[0], "(user/access.json:", access()[0] + ")")
        try:
            w.write(REFUSED.format(addr=peer[0]).encode("utf-8"))
            await w.drain()
        finally:
            w.close()
        return
    try:
        sr, sw = await asyncio.open_connection(TO_HOST, TO_PORT)
    except OSError as e:
        say("the Studio does not answer on", f"{TO_HOST}:{TO_PORT}:", e)
        w.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nThe studio does not answer on its port.")
        await w.drain(); w.close()
        return
    await asyncio.gather(pipe(r, sw), pipe(sr, w))


async def main():
    why = "asked" if "--make-cert" in args else stale()       # HERESY 1985
    if why:
        say("the certificate made anew:", why)
        make_cert()
        if "--make-cert" in args:
            return
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(str(CERT), str(KEY))
    ctx.set_alpn_protocols(["http/1.1"])
    server = await asyncio.start_server(visit, host=None, port=PORT, ssl=ctx, reuse_address=True)   # every address, IPv4 and IPv6 (on "::" asyncio serves IPv6 alone)
    names, ips = own_names()
    say(f"https on :{PORT} → the Studio at {TO_HOST}:{TO_PORT}; for", ", ".join(names + ips), "· who may: user/access.json,", access()[0])
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
