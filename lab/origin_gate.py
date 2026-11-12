"""HERESY 2011 (the audit of 02.11.2026, S1) · who may ask the lab on its own port.

The lab answered every origin (Access-Control-Allow-Origin: *) and read every POST as JSON, a text/plain one too, which a page of any site sends
without asking a browser's leave: such a page could read the takes and empty the trash. The Studio's page reaches the lab through the engine, at
the engine's own origin (no CORS), and the engine refuses a page of another site (yue-server.cpp request_foreign); here the same rule for a request
that comes to the lab's own port. A name the lab cannot trust (a name of the attacker's own resolving to this machine: DNS rebinding), or a page
of another site, is refused; scripts, DAWs, curl and the engine send neither Origin nor Sec-Fetch-Site and pass as before.

    refusal(method, path, headers) → None, or the reason to answer with 403"""
import ipaddress
import os

# HERESY 2258 (Viktor 08.11.2026, asked whether names that look private stay trusted: «НЕТ. Только по IP локальных сетей»): the engine's
# host_trusted (yue-server.cpp), repeated. A name is no longer answered for how it looks (one label, .local, .lan, .home.arpa, .internal, a
# Tailscale .ts.net, this machine's own name): whoever answers for such a name on the network can point it anywhere. Answered: an address of a
# local network written as one (the engine's is_private_addr less 100.64/10: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7,
# fe80::/10, IPv4 in IPv6 dress), the name localhost (this machine by definition, never asked of the network), and what RUACH_HOSTS names
# (a name, ".example.org" with its subdomains, or an address)
# HERESY 2337 (Viktor 09.11.2026: «Да, убирай 100.64., а localhost оставляй»): 100.64/10, the shared space of carrier-grade NAT where Tailscale
# lives, is no longer answered as a Host for being private: it is the carrier's network as much as the home's. A Tailscale address is answered when
# RUACH_HOSTS names it; the engine still admits callers from it by Engine → Security, as before (is_private_addr, 1114)
LOCAL_NETS = tuple(ipaddress.ip_network(n) for n in ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16",
                                                     "::1/128", "fc00::/7", "fe80::/10"))


def host_name_of(host):
    h = (host or "").strip().lower()
    if h.startswith("["):
        return h[1:h.find("]")] if "]" in h else h
    if h.count(":") == 1:
        h = h.rsplit(":", 1)[0]
    return h[:-1] if h.endswith(".") else h


def local_address(h):
    """HERESY 2258: True for an address of a local network, False for any other address, None when h is no address at all."""
    try:
        a = ipaddress.ip_address(h.split("%", 1)[0])   # fe80::1%eth0: the zone is not the address
    except ValueError:
        return None
    if a.version == 6 and a.ipv4_mapped:
        a = a.ipv4_mapped
    return any(a in n for n in LOCAL_NETS)


def listed(h):
    """RUACH_HOSTS (commas or spaces between): the name itself, ".example.org" for its subdomains, or an address as the browser writes it."""
    for n in (os.environ.get("RUACH_HOSTS") or "").replace(",", " ").lower().split():
        n = host_name_of(n)
        if n and (h == n or (n.startswith(".") and h.endswith(n) and len(h) > len(n))):
            return True
    return False


def host_trusted(host):
    if not host:
        return True                                    # HTTP/1.0 without a Host: no browser sends that
    h = host_name_of(host)
    return local_address(h) is True or h == "localhost" or listed(h)   # HERESY 2258


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
