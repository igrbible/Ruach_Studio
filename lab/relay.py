"""HERESY 2005 (01.11.2026: Viktor's Studio over https said «Не защищено» and the Writer's chat server on his network is http, on port 8008): a page
over https may not ask an http server anything (mixed content, blocked by the browser), so the Writer could not reach its chat server there. The
lab relays the chat server's own few paths for the page: only a server on this machine or the local network (loopback, private, link-local), only
the paths a chat client asks (…/models, …/chat/completions, LM Studio's /api/v0/models, Ollama's /api/ps), the body as it is, the answer as JSON.
    relay(target, method, body, content_type) → (status, bytes, content type)"""
import http.client
import ipaddress
import json
import socket
import urllib.parse

PATHS = ("/models", "/chat/completions", "/api/v0/models", "/api/ps")
JSON_TYPE = "application/json; charset=utf-8"


# HERESY 2011 (the audit of 02.11.2026, S5): the relay went further than chat servers: a POST to any path that ended in /models (a router's
# /cgi-bin/anything/models), a redirect followed wherever it led, an IPv4 address in IPv6 dress taken for private on Python 3.12.3. Now a question
# goes as a chat client asks it (POST to …/chat/completions, GET to the others), a redirect is said and not followed, and an address is judged as
# the IPv4 it carries.
# HERESY 2138 (the audit of 06.11.2026, 2.1): the relay checked the name's addresses, and urllib then looked the name up a second time to connect: a
# name that answers twice (DNS rebinding, TTL 0) was checked at one address and asked at another. It also gave the chat server's own type back, and
# opened at its address (a link, a bookmark) a text/html answer ran as a page of the Studio's origin. Now it connects to the very address it checked,
# the name kept for the Host header (and for TLS), and what it gives back is JSON alone: a chat server's answer that does not read as JSON is said.
def vetted(target, method=None):
    """(url, parts, addresses): the target the lab may relay to and the addresses its name was checked at, in the resolver's order; else a ValueError
    saying why."""
    u = urllib.parse.urlsplit(str(target or ""))
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("a chat server's http address is needed")
    if not any(u.path.endswith(p) for p in PATHS):
        raise ValueError("only a chat server's models and chat paths are relayed")
    if method and (method == "POST") != u.path.endswith("/chat/completions"):
        raise ValueError("a chat server is asked its chat by POST and the rest by GET: not relayed")
    try:
        port = u.port or (443 if u.scheme == "https" else 80)
        infos = socket.getaddrinfo(u.hostname, port, proto=socket.IPPROTO_TCP)
    except OSError as e:
        raise ValueError(f"{u.hostname}: not found ({e})")
    addrs = []
    for a in infos:
        if a[4][0] not in addrs:
            addrs.append(a[4][0])
    if not addrs:
        raise ValueError(f"{u.hostname}: not found")
    for a in addrs:
        ip = ipaddress.ip_address(a.split("%")[0])
        if ip.version == 6 and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not (ip.is_loopback or ip.is_private or ip.is_link_local):
            raise ValueError(f"{u.hostname} is not on this machine or the local network: not relayed")
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, u.query, "")), u, addrs


def allowed(target, method=None):
    """The target URL when the lab may relay to it, else a ValueError saying why."""
    return vetted(target, method)[0]


def pinned(conn, ip):
    """conn connects to ip, whatever its name resolves to by then; the name stays its host (the Host header, TLS's server name and certificate)."""
    conn._create_connection = lambda address, *a, **k: socket.create_connection((ip, address[1]), *a, **k)
    return conn


def said(code, words, **more):
    return code, json.dumps(dict({"error": words}, **more), ensure_ascii=False).encode("utf-8"), JSON_TYPE


def relay(target, method="GET", body=None, content_type="application/json", timeout=900):
    _, u, addrs = vetted(target, method)
    port = u.port or (443 if u.scheme == "https" else 80)
    path = (u.path or "/") + ("?" + u.query if u.query else "")
    headers = {"Content-Type": content_type or "application/json"} if method == "POST" else {}
    conn, failed = None, None
    for ip in addrs:                                   # each address the name was checked at, in turn, as a client tries them; the question goes once
        c = pinned(http.client.HTTPSConnection(u.hostname, port, timeout=timeout) if u.scheme == "https"
                   else http.client.HTTPConnection(u.hostname, port, timeout=timeout), ip)
        try:
            c.connect()
            conn = c
            break
        except OSError as e:
            failed = e
            c.close()
    if conn is None:
        return said(502, f"the chat server did not answer: {failed}")
    try:
        conn.request(method, path, body=body if method == "POST" else None, headers=headers)
        r = conn.getresponse()
        code, out, ctype, where = r.status, r.read(), r.getheader("Content-Type") or "", r.getheader("Location") or ""
    except (OSError, http.client.HTTPException) as e:
        return said(502, f"the chat server did not answer: {e}")
    finally:
        conn.close()
    if 300 <= code < 400:
        return said(502, f"the chat server sent the question on to {where or '(no address)'}: not followed")
    if not out.strip():
        return code, b"", JSON_TYPE
    try:
        json.loads(out)
    except ValueError:                                 # a page, a script, a plain text: said, its first words kept as a JSON string
        kind = ctype.split(";")[0].strip() or "no type"
        return said(code if code >= 400 else 502, f"the chat server answered HTTP {code} in {kind}, not JSON: not relayed",
                    said=out[:300].decode("utf-8", "replace"))
    return code, out, JSON_TYPE
