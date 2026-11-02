"""HERESY 2005 (01.11.2026: Viktor's Studio over https said «Не защищено» and the Writer's chat server on his network is http, on port 8008): a page
over https may not ask an http server anything (mixed content, blocked by the browser), so the Writer could not reach its chat server there. The
lab relays the chat server's own few paths for the page: only a server on this machine or the local network (loopback, private, link-local), only
the paths a chat client asks (…/models, …/chat/completions, LM Studio's /api/v0/models, Ollama's /api/ps), the body and the answer as they are.
    relay(target, method, body, content_type) → (status, bytes, content type)"""
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request

PATHS = ("/models", "/chat/completions", "/api/v0/models", "/api/ps")


def allowed(target):
    """The target URL when the lab may relay to it, else a ValueError saying why."""
    u = urllib.parse.urlsplit(str(target or ""))
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("a chat server's http address is needed")
    if not any(u.path.endswith(p) for p in PATHS):
        raise ValueError("only a chat server's models and chat paths are relayed")
    try:
        addrs = {a[4][0] for a in socket.getaddrinfo(u.hostname, u.port or 80, proto=socket.IPPROTO_TCP)}
    except OSError as e:
        raise ValueError(f"{u.hostname}: not found ({e})")
    for a in addrs:
        ip = ipaddress.ip_address(a.split("%")[0])
        if not (ip.is_loopback or ip.is_private or ip.is_link_local):
            raise ValueError(f"{u.hostname} is not on this machine or the local network: not relayed")
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, u.query, ""))


def relay(target, method="GET", body=None, content_type="application/json", timeout=900):
    url = allowed(target)
    req = urllib.request.Request(url, data=body if method == "POST" else None, method=method,
                                 headers={"Content-Type": content_type or "application/json"} if method == "POST" else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "application/json")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get("Content-Type", "text/plain")
    except (urllib.error.URLError, OSError) as e:
        return 502, ("the chat server did not answer: " + str(getattr(e, "reason", e))).encode(), "text/plain; charset=utf-8"
