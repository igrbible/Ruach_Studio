"""HERESY 2011 (the audit of 02.11.2026, S1) · who may ask the lab on its own port.

The lab answered every origin (Access-Control-Allow-Origin: *) and read every POST as JSON, a text/plain one too, which a page of any site sends
without asking a browser's leave: such a page could read the takes and empty the trash. The Studio's page reaches the lab through the engine, at
the engine's own origin (no CORS), and the engine refuses a page of another site (yue-server.cpp request_foreign); here the same rule for a request
that comes to the lab's own port. A name the lab cannot trust (a name of the attacker's own resolving to this machine: DNS rebinding), or a page
of another site, is refused; scripts, DAWs, curl and the engine send neither Origin nor Sec-Fetch-Site and pass as before.

    refusal(method, path, headers) → None, or the reason to answer with 403"""
import ipaddress
import os
import socket

# the engine's host_trusted (yue-server.cpp), repeated: one label, an address, a private suffix, this machine's name, RUACH_HOSTS
OWN_SUFFIXES = (".localhost", ".local", ".lan", ".home", ".home.arpa", ".internal", ".intranet", ".localdomain", ".corp", ".private", ".test",
                ".ts.net")


def host_name_of(host):
    h = (host or "").strip().lower()
    if h.startswith("["):
        return h[1:h.find("]")] if "]" in h else h
    if h.count(":") == 1:
        h = h.rsplit(":", 1)[0]
    return h[:-1] if h.endswith(".") else h


def host_trusted(host):
    if not host:
        return True
    h = host_name_of(host)
    try:
        ipaddress.ip_address(h)
        return True
    except ValueError:
        pass
    if "." not in h or any(h.endswith(s) and len(h) > len(s) for s in OWN_SUFFIXES):
        return True
    if h == socket.gethostname().lower():
        return True
    for n in (os.environ.get("RUACH_HOSTS") or "").replace(",", " ").lower().split():
        n = host_name_of(n)
        if n and (h == n or (n.startswith(".") and h.endswith(n) and len(h) > len(n))):
            return True
    return False


def foreign(method, path, headers):
    """A request a page of another site made, as the browser itself says (Sec-Fetch-Site), or, from a browser too old to say it, an Origin that is
    not the address asked on a request that writes. Opening a page by a link (GET / as a navigation) is not refused."""
    reads = method in ("GET", "HEAD")
    site = headers.get("Sec-Fetch-Site") or ""
    if site:
        bad = site in ("cross-site", "same-site")
    elif headers.get("Origin") is not None and not reads:
        bad = headers.get("Origin").lower().partition("://")[2] != (headers.get("Host") or "").lower()
    else:
        bad = False
    return bad and not (reads and path == "/" and headers.get("Sec-Fetch-Mode") == "navigate")


# HERESY 2138 (the audit of 06.11.2026, 2.1): the relay answers the page's own fetch() alone. Opened as a page (an address typed, a bookmark, a link from
# a messenger pass the gate above as Sec-Fetch-Site none) or put in a frame, an object or a script, what a chat server sent would run in the origin
# that asked; the engine refuses the same at /lab/relay (yue-server.cpp relay_opened). A fetch says Sec-Fetch-Dest empty; curl and scripts say nothing
RELAY = "/relay"


def opened(path, headers):
    dest = headers.get("Sec-Fetch-Dest") or ""
    return path == RELAY and (headers.get("Sec-Fetch-Mode") == "navigate" or dest not in ("", "empty"))


def refusal(method, path, headers):
    if not host_trusted(headers.get("Host") or ""):
        return "the lab does not answer this name: a site on the internet could point it at this machine (RUACH_HOSTS=name opens it)"
    if foreign(method, path, headers):
        return "the lab does not take requests a page of another site makes"
    if opened(path, headers):
        return "the relay answers the Studio's own requests only: it is not opened as a page, a frame or a script"
    return None
