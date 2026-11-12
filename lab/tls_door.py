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

HERESY 2238 (Viktor 07.11.2026: «H2 ставь»): a browser that offers HTTP/2 gets it (ALPN «h2» first, «http/1.1» kept for the rest): one connection
carries every request of the page as its own stream, so a long stream (the events, an audio range) no longer holds one of the six connections
HTTP/1.1 gives a host. Each stream becomes the very request the HTTP/1.1 way makes to the Studio (its own connection, Host from :authority, the
visitor's address as X-Ruach-Peer), and the answer comes back as the stream's frames. It needs the «h2» package (pure Python, in the Studio's .venv);
a Python without it offers http/1.1 alone and says so at the start. RUACH_TLS_H2=0 keeps it off.

    tls_door.py [--port 7443] [--to 127.0.0.1:7777] [--make-cert]      (systemd/ruach-tls-door.service runs it)"""
import asyncio
import ipaddress
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import time
from pathlib import Path

try:                                                       # HERESY 2238: HTTP/2, when the Python running the door has it
    import h2.config
    import h2.connection
    import h2.errors
    import h2.events
    import h2.exceptions
    import h2.settings
except ImportError:
    h2 = None

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


async def pipe(r, w, refused=None):
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
            if refused and refused.get("why"):                  # HERESY 2222: after the answers the Studio gave, the door's own 400 and why
                w.write(bad_request(refused["why"]))
            w.close()
        except (OSError, RuntimeError):
            pass


# HERESY 2222 (the audit of 06.11.2026, §2.5): the door read a request's framing more loosely than the Studio behind it: two Content-Length of
# different values, Transfer-Encoding beside Content-Length, a coding other than chunked, a name with a space before its colon or a line folded
# onto the one above, a chunk's size in anything but hex. Where two readers of one stream disagree on where a body ends, the bytes one takes for
# a body the other takes for a request, and such a request never passes the door's own reading (its X-Ruach-Peer, HERESY 2011). Today's engine
# (cpp-httplib 0.44) refuses all of these by itself; the door no longer leans on that: it answers 400, as RFC 9112 asks, and passes nothing of it.
TOKEN = frozenset(b"!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
HEX = frozenset(b"0123456789abcdefABCDEF")


class Framing(ValueError):
    """A request whose framing the door refuses: its words are the 400's."""


def bad_request(why):
    body = ("The Studio's https door refused this request: " + why + ".").encode("utf-8")
    return (b"HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: "
            + str(len(body)).encode("ascii") + b"\r\n\r\n" + body)


def field_line(ln):
    """One header (or trailer) line as (name, value), the name lowercased; a line the RFC says to refuse raises Framing."""
    k, sep, v = ln.partition(b":")
    if not sep or not k or not all(c in TOKEN for c in k):
        raise Framing("a header line that is not «name: value» (no colon, a space before it, or folded onto the line above)")
    if any(c in b"\r\n\x00" for c in v):
        raise Framing("a header with a bare CR, LF or NUL in its value")
    return k.lower(), v.strip()


def body_framing(keep):
    """("chunked", None) or ("length", N) for a request's header lines, or Framing for what RFC 9112 §6 refuses."""
    lengths, codings = [], []
    for ln in keep:
        k, v = field_line(ln)
        if k == b"content-length":
            lengths += [x.strip() for x in v.split(b",")]
        elif k == b"transfer-encoding":
            codings.append(v.lower())
    if codings:
        if lengths:
            raise Framing("Transfer-Encoding and Content-Length together")
        if codings != [b"chunked"]:
            raise Framing("a Transfer-Encoding other than one «chunked»")
        return "chunked", None
    if not lengths:
        return "length", 0
    if not all(x.isdigit() for x in lengths) or len(set(lengths)) > 1:
        raise Framing("a Content-Length that is not one number")
    return "length", int(lengths[0])


def chunk_size(line):
    size = line[:-2].split(b";", 1)[0].strip(b" \t")
    if not line.endswith(b"\r\n") or not size or len(size) > 16 or not all(c in HEX for c in size):
        raise Framing("a chunk whose size is not a hex number")
    return int(size, 16)


# HERESY 2011 (the audit of 02.11.2026, S3): to the engine every visitor through the door came from this very computer, which it trusts: the API's
# token was never asked, and the lockout guard saw no one. So each request's head now carries X-Ruach-Peer, the visitor's own address (one the
# visitor sent is dropped), which the engine takes from a loopback caller alone; the body passes as it is, by its length or by its chunks, and
# a connection upgraded to another protocol passes byte for byte from there on.
def heads(head):
    lines = head[:-4].split(b"\r\n")
    keep = [ln for ln in lines[1:] if not ln.lower().startswith(b"x-ruach-peer:")]
    named = {}
    for ln in keep:
        k, sep, v = ln.partition(b":")
        if sep:
            named[k.strip().lower()] = v.strip().lower()
    return lines[0], keep, named


async def requests(r, w, peer, refused=None):
    tag = b"X-Ruach-Peer: " + peer.split("%")[0].encode("ascii", "replace") + b"\r\n"
    try:
        while True:
            try:
                head = await r.readuntil(b"\r\n\r\n")
            except asyncio.IncompleteReadError as e:
                if e.partial:
                    w.write(e.partial)
                    await w.drain()
                break
            first, keep, named = heads(head)
            how, length = body_framing(keep)                                        # HERESY 2222: refused before a byte of it passes
            w.write(b"\r\n".join([first] + keep) + b"\r\n" + tag + b"\r\n")
            if b"upgrade" in named.get(b"connection", b""):
                await w.drain()
                return await pipe(r, w)
            if how == "chunked":
                while True:
                    line = await r.readuntil(b"\r\n")
                    left = chunk_size(line)
                    w.write(line)
                    if left == 0:
                        while (t := await r.readuntil(b"\r\n")) != b"\r\n":     # the trailers, to the empty line
                            field_line(t[:-2])
                            w.write(t)
                        w.write(b"\r\n")
                        break
                    while left > 0:                                                 # the chunk, then its CRLF and nothing else
                        b = await r.readexactly(min(65536, left))
                        w.write(b)
                        left -= len(b)
                        await w.drain()
                    if await r.readexactly(2) != b"\r\n":
                        raise Framing("a chunk longer than its size says")
                    w.write(b"\r\n")
            else:
                left = length
                while left > 0:
                    b = await r.read(min(65536, left))
                    if not b:
                        raise ConnectionError("the visitor left in the middle of a body")
                    w.write(b)
                    left -= len(b)
                    await w.drain()
            await w.drain()
    except Framing as e:
        say("refused a request from", peer, "(" + str(e) + ")")
        if refused is not None:
            refused["why"] = str(e)
    except (ConnectionError, OSError, ValueError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.CancelledError):
        pass
    finally:
        try:
            if refused and refused.get("why") and w.can_write_eof():
                w.write_eof()          # HERESY 2222: the Studio ends the answers it owes, then closes; the door's 400 follows them
            else:
                w.close()
        except (OSError, RuntimeError):
            pass


# ---- HERESY 2238 (Viktor 07.11.2026: «H2 ставь»): HTTP/2 on the door's side, HTTP/1.1 to the Studio, one stream = one request
# What 2222 refuses holds here too, in HTTP/2's own terms. The h2 package refuses (and ends the connection with GOAWAY) an uppercase or non-token
# header name, a CR, LF or NUL in a value, Connection, Transfer-Encoding, Upgrade, Keep-Alive, a TE other than «trailers», :authority and Host that
# differ, and a body longer or shorter than its Content-Length. The door refuses with 400, before a byte reaches the Studio, what would read apart
# once written as HTTP/1.1: a method that is not a token or is CONNECT, a :path with a space or a control character or not starting with «/», an
# :authority that is not a host name or address (with or without a port), two Content-Length of different values or one that is not a number,
# a header list over H2_HEADERS (431). A body by its length passes its last bytes only with the stream's end: a body that runs past its length
# never reaches the Studio whole. Each stream has a connection of its own to the Studio (Connection: close), so no stream can ride on another's.
H2_STREAMS = 32                # streams at once on one connection: well under the engine's threads (cpp-httplib: one per connection), far over six
H2_HEADERS = 65536             # a header list's size, as HTTP/1.1 here (asyncio's line limit)
H2_WINDOW = 1 << 20            # each stream's window for what the visitor sends (an upload): acknowledged as the Studio takes it
H2_CONN_WINDOW = 16 << 20      # the connection's
H2_HOP = frozenset((b"connection", b"keep-alive", b"proxy-connection", b"transfer-encoding", b"upgrade", b"te", b"host", b"x-ruach-peer", b"expect",
                    b"http2-settings", b"content-length", b"cookie"))
H2_ANSWER_HOP = frozenset((b"connection", b"keep-alive", b"proxy-connection", b"transfer-encoding", b"upgrade", b"te", b"http2-settings"))
AUTHORITY = re.compile(rb"(?:\[[0-9A-Fa-f:.]{2,45}\]|[A-Za-z0-9._-]{1,253})(?::[0-9]{1,5})?")


def h2_on():
    return h2 is not None and os.environ.get("RUACH_TLS_H2", "1") not in ("0", "")


def context(cert, key):
    """The door's TLS: 1.2 and up, the Studio's certificate, ALPN «h2» first when this Python has it, «http/1.1» always."""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(str(cert), str(key))
    ctx.set_alpn_protocols(["h2", "http/1.1"] if h2_on() else ["http/1.1"])
    return ctx


class H2Refused(Exception):
    """A stream the door answers itself (status, words) and passes nothing of to the Studio."""


def h2_request(headers, ended, peer):
    """An HTTP/2 request's header list as the HTTP/1.1 head the Studio is sent, and how its body goes: (head, None | length | "chunked")."""
    pseudo, fields, cookies, lengths, size = {}, [], [], [], 0
    for k, v in headers:
        size += len(k) + len(v) + 32
        if k.startswith(b":"):
            pseudo[k] = v
        elif k == b"cookie":
            cookies.append(v)
        elif k == b"content-length":
            lengths += [x.strip() for x in v.split(b",")]
        elif k not in H2_HOP:
            if not all(c in TOKEN for c in k) or any(c in b"\r\n\x00" for c in v):
                raise H2Refused(400, "a header line that is not «name: value»")
            fields.append(k + b": " + v)
    if size > H2_HEADERS:
        raise H2Refused(431, "a header list over " + str(H2_HEADERS) + " bytes")
    method, path, authority = pseudo.get(b":method", b""), pseudo.get(b":path", b""), pseudo.get(b":authority")
    if authority is None:
        authority = dict(headers).get(b"host", b"")                       # h2 has already refused a Host that differs from :authority
    if not method or not all(c in TOKEN for c in method) or method == b"CONNECT":
        raise H2Refused(400, "a method the door does not pass")
    if not (path.startswith(b"/") or (path == b"*" and method == b"OPTIONS")) or not all(0x21 <= c <= 0x7E for c in path):
        raise H2Refused(400, "a path with a space or a control character in it")
    if not AUTHORITY.fullmatch(authority):
        raise H2Refused(400, "a host that is not a name or an address")
    if lengths and (not all(x.isdigit() for x in lengths) or len(set(lengths)) > 1):
        raise H2Refused(400, "a Content-Length that is not one number")
    body = int(lengths[0]) if lengths else (None if ended else "chunked")
    lines = [method + b" " + path + b" HTTP/1.1", b"Host: " + authority] + fields
    if cookies:
        lines.append(b"Cookie: " + b"; ".join(cookies))                  # RFC 9113 §8.2.3: one line again for HTTP/1.1
    if isinstance(body, int):
        lines.append(b"Content-Length: " + str(body).encode("ascii"))
    elif body == "chunked":
        lines.append(b"Transfer-Encoding: chunked")
    lines += [b"Connection: close", b"X-Ruach-Peer: " + peer.split("%")[0].encode("ascii", "replace")]
    return b"\r\n".join(lines) + b"\r\n\r\n", body


class H2Visit:
    """One visitor's HTTP/2 connection: frames read in one loop, each stream relayed by a task of its own; a protocol error ends the connection
    with GOAWAY and every stream with it (no stream is left half passed), a stream the visitor resets ends with its Studio connection."""

    def __init__(self, r, w, peer, refused=False):
        self.r, self.w, self.peer, self.refused = r, w, peer, refused
        self.tasks, self.bodies, self.ended, self.room = {}, {}, set(), {}

    async def flush(self):
        out = self.conn.data_to_send()
        if out:
            self.w.write(out)
            await self.w.drain()

    async def run(self):
        if self.refused:
            say("refused", self.peer, "(user/access.json:", access()[0] + ") over HTTP/2")
        cfg = h2.config.H2Configuration(client_side=False, header_encoding=None, validate_inbound_headers=True, normalize_inbound_headers=True,
                                        validate_outbound_headers=True, normalize_outbound_headers=True)
        self.conn = h2.connection.H2Connection(config=cfg)
        S = h2.settings.SettingCodes
        self.conn.local_settings = h2.settings.Settings(client=False, initial_values={
            S.MAX_CONCURRENT_STREAMS: H2_STREAMS, S.MAX_HEADER_LIST_SIZE: H2_HEADERS, S.INITIAL_WINDOW_SIZE: H2_WINDOW})
        try:
            self.conn.initiate_connection()
            self.conn.increment_flow_control_window(H2_CONN_WINDOW - 65535)
            await self.flush()
            while True:
                data = await self.r.read(65536)
                if not data:
                    break
                try:
                    events = self.conn.receive_data(data)
                except h2.exceptions.ProtocolError as e:            # h2 has queued its GOAWAY: sent, and every stream ends here
                    say("HTTP/2: closed the connection of", self.peer, "(" + (str(e) or type(e).__name__) + ")")
                    await self.flush()
                    break
                if not self.on(events):
                    break
                await self.flush()
        except (ConnectionError, OSError, ssl.SSLError, asyncio.CancelledError, h2.exceptions.H2Error):
            pass
        finally:
            for t in list(self.tasks.values()):
                t.cancel()
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
            try:
                if self.conn.state_machine.state != h2.connection.ConnectionState.CLOSED:
                    self.conn.close_connection()
                    self.w.write(self.conn.data_to_send())
            except (h2.exceptions.H2Error, OSError, RuntimeError):
                pass
            try:
                self.w.close()
            except (OSError, RuntimeError):
                pass

    def on(self, events):
        """Each event of a read; False when the connection is over (the visitor's GOAWAY: h2 sends nothing after it)."""
        E = h2.events
        for ev in events:
            if isinstance(ev, E.RequestReceived):
                sid = ev.stream_id
                if ev.stream_ended is not None:
                    self.ended.add(sid)
                self.bodies[sid] = asyncio.Queue()
                self.room[sid] = asyncio.Event()
                self.tasks[sid] = asyncio.get_running_loop().create_task(self.stream(sid, ev.headers, ev.stream_ended is not None))
                self.tasks[sid].add_done_callback(lambda t, sid=sid: self.forget(sid))
            elif isinstance(ev, E.DataReceived):
                q = self.bodies.get(ev.stream_id)
                if q is not None:
                    q.put_nowait((ev.data, ev.flow_controlled_length))
                elif ev.flow_controlled_length:
                    self.conn.acknowledge_received_data(ev.flow_controlled_length, ev.stream_id)   # a stream already answered: its window back
            elif isinstance(ev, E.StreamEnded):
                self.ended.add(ev.stream_id)
                q = self.bodies.get(ev.stream_id)
                if q is not None:
                    q.put_nowait(None)
            elif isinstance(ev, E.StreamReset):
                t = self.tasks.get(ev.stream_id)
                if t is not None:
                    t.cancel()
            elif isinstance(ev, (E.WindowUpdated, E.RemoteSettingsChanged)):
                for sid, room in self.room.items():
                    if isinstance(ev, E.RemoteSettingsChanged) or ev.stream_id in (0, sid):
                        room.set()
            elif isinstance(ev, E.ConnectionTerminated):
                return False
        return True

    def forget(self, sid):
        for d in (self.tasks, self.bodies, self.room):
            d.pop(sid, None)
        self.ended.discard(sid)

    async def send(self, sid, data, end=False):
        """Data on a stream as the visitor's windows allow (the stream's and the connection's), never more; a stream waiting for room holds no other."""
        while data:
            n = min(len(data), self.conn.local_flow_control_window(sid), self.conn.max_outbound_frame_size)
            if n <= 0:
                room = self.room[sid]
                room.clear()
                await room.wait()
                continue
            self.conn.send_data(sid, data[:n])
            data = data[n:]
            await self.flush()
        if end:
            self.conn.end_stream(sid)
            await self.flush()

    async def answer(self, sid, status, body, ctype=b"text/plain; charset=utf-8"):
        self.conn.send_headers(sid, [(b":status", str(status).encode("ascii")), (b"content-type", ctype),
                                     (b"content-length", str(len(body)).encode("ascii"))], end_stream=not body)
        if body:
            await self.send(sid, body, end=True)

    async def stream(self, sid, headers, ended):
        sr = sw = pump = None
        answered = False
        try:
            if self.refused:
                await self.answer(sid, 403, REFUSED.split("\r\n\r\n", 1)[1].format(addr=self.peer).encode("utf-8"), b"text/html; charset=utf-8")
                answered = True
                self.conn.close_connection()         # as over HTTP/1.1: the page said why, and the door closes
                await self.flush()
                self.w.close()
                return
            try:
                head, body = h2_request(headers, ended, self.peer)
            except H2Refused as e:
                status, why = e.args
                say("refused a request from", self.peer, "over HTTP/2 (" + why + ")")
                await self.answer(sid, status, ("The Studio's https door refused this request: " + why + ".").encode("utf-8"))
                answered = True
                return
            try:
                sr, sw = await asyncio.open_connection(TO_HOST, TO_PORT)
            except OSError as e:
                say("the Studio does not answer on", f"{TO_HOST}:{TO_PORT}:", e)
                await self.answer(sid, 502, b"The studio does not answer on its port.")
                answered = True
                return
            sw.write(head)
            await sw.drain()
            pump = asyncio.get_running_loop().create_task(self.pump(sid, sw, body))
            answered = await self.relay(sid, sr, dict(headers).get(b":method") == b"HEAD")
        except asyncio.CancelledError:
            pass
        except (h2.exceptions.H2Error, ConnectionError, OSError, ValueError, asyncio.IncompleteReadError, asyncio.LimitOverrunError) as e:
            if not answered:
                say("HTTP/2: a stream of", self.peer, "ended unanswered (" + (str(e) or type(e).__name__) + ")")
        finally:
            if pump is not None:
                pump.cancel()
                await asyncio.gather(pump, return_exceptions=True)
            if sw is not None:
                sw.close()
            try:                                     # an answer given before the visitor's body ended: the rest is not wanted (RFC 9113 §8.1)
                if answered and sid not in self.ended:
                    self.conn.reset_stream(sid, h2.errors.ErrorCodes.NO_ERROR)
                elif not answered:
                    self.conn.reset_stream(sid, h2.errors.ErrorCodes.INTERNAL_ERROR)
                self.w.write(self.conn.data_to_send())
            except (h2.exceptions.H2Error, OSError, RuntimeError):
                pass                                 # the stream is closed already (reset by the visitor, or both ends done)

    async def pump(self, sid, sw, body):
        """The visitor's body to the Studio: by its length, its last bytes held back until the stream's end (a body that runs past its length is
        refused by h2 and never reaches the Studio whole), or chunked, its last chunk written only at the stream's end. The window is given back
        as the Studio takes each piece."""
        q, sent, held = self.bodies[sid], 0, b""
        while True:
            item = await q.get()
            if item is None:
                if body == "chunked":
                    sw.write(held + b"0\r\n\r\n")
                elif held:
                    sw.write(held)
                await sw.drain()
                return
            data, flow = item
            if body == "chunked":
                if data:
                    sw.write(b"%x\r\n" % len(data) + data + b"\r\n")
            elif isinstance(body, int):
                sent += len(data)
                if sent >= body:
                    held += data                     # h2 has checked it is not past the length; it passes with END_STREAM
                else:
                    sw.write(data)
            await sw.drain()
            if flow:
                self.conn.acknowledge_received_data(flow, sid)
                await self.flush()

    async def relay(self, sid, sr, head_only):
        """The Studio's HTTP/1.1 answer as the stream's HEADERS and DATA; True once the visitor has its end. An answer cut short by the Studio is
        reset on the stream, never ended as if whole."""
        while True:
            raw = await sr.readuntil(b"\r\n\r\n")
            lines = raw[:-4].split(b"\r\n")
            parts = lines[0].split(b" ", 2)
            if len(parts) < 2 or not parts[0].startswith(b"HTTP/1.") or not (len(parts[1]) == 3 and parts[1].isdigit()):
                raise ValueError("the Studio's answer has no status line")
            status = int(parts[1])
            if status >= 200:
                break
            if status == 101:
                raise ValueError("the Studio switched protocols on an HTTP/2 stream")     # 100, 103: interim, not passed
        fields = [field_line(ln) for ln in lines[1:]]
        named = {}
        for k, v in fields:
            named.setdefault(k, []).append(v)
        drop = set(H2_ANSWER_HOP) | {t.strip().lower() for v in named.get(b"connection", []) for t in v.split(b",")}
        codings = [c.strip().lower() for v in named.get(b"transfer-encoding", []) for c in v.split(b",") if c.strip()]
        length = None
        if head_only or status in (204, 304):
            how = "none"
        elif codings:
            how = "chunked" if codings[-1] == b"chunked" else "close"
            drop.add(b"content-length")
        elif b"content-length" in named:
            vals = {x.strip() for v in named[b"content-length"] for x in v.split(b",")}
            if len(vals) != 1 or not next(iter(vals)).isdigit():
                raise ValueError("the Studio's answer has no single Content-Length")
            how, length = "length", int(vals.pop())
        else:
            how = "close"
        out = [(b":status", str(status).encode("ascii"))] + [(k, v) for k, v in fields if k not in drop]
        self.conn.send_headers(sid, out, end_stream=how == "none" or length == 0)
        await self.flush()
        if how == "none" or length == 0:
            return True
        if how == "length":
            while length > 0:
                b = await sr.read(min(65536, length))
                if not b:
                    raise ConnectionError("the Studio ended an answer before its length")
                length -= len(b)
                await self.send(sid, b, end=length == 0)
        elif how == "chunked":
            while True:
                size = chunk_size(await sr.readuntil(b"\r\n"))
                if size == 0:
                    while await sr.readuntil(b"\r\n") != b"\r\n":            # the Studio's trailers: not passed
                        pass
                    await self.send(sid, b"", end=True)
                    break
                while size > 0:
                    b = await sr.readexactly(min(65536, size))
                    size -= len(b)
                    await self.send(sid, b)
                if await sr.readexactly(2) != b"\r\n":
                    raise ValueError("a chunk of the Studio's answer longer than its size")
        else:
            while b := await sr.read(65536):
                await self.send(sid, b)
            await self.send(sid, b"", end=True)
        return True


async def visit(r, w):
    peer = w.get_extra_info("peername") or ("?", 0)
    tls = w.get_extra_info("ssl_object")
    if tls is not None and tls.selected_alpn_protocol() == "h2":            # HERESY 2238: the same door, spoken in HTTP/2
        return await H2Visit(r, w, str(peer[0]), refused=not allowed(peer[0])).run()
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
    refused = {}                                                            # HERESY 2222: why the door refused a request, said last
    try:
        await asyncio.gather(requests(r, sw, str(peer[0]), refused), pipe(sr, w, refused))       # HERESY 2011 (S3)
    finally:
        sw.close()


async def main():
    why = "asked" if "--make-cert" in args else stale()       # HERESY 1985
    if why:
        say("the certificate made anew:", why)
        make_cert()
        if "--make-cert" in args:
            return
    ctx = context(CERT, KEY)
    server = await asyncio.start_server(visit, host=None, port=PORT, ssl=ctx, reuse_address=True)   # every address, IPv4 and IPv6 (on "::" asyncio serves IPv6 alone)
    names, ips = own_names()
    say(f"https on :{PORT} → the Studio at {TO_HOST}:{TO_PORT}; for", ", ".join(names + ips), "· who may: user/access.json,", access()[0])
    say("HTTP/2 offered (h2 " + h2.__version__ + "), http/1.1 kept" if h2_on() else
        "http/1.1 only: " + ("RUACH_TLS_H2=0" if h2 else "this Python (" + sys.executable + ") has no «h2» package (pip install h2 in the Studio's .venv)"))
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
