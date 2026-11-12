"""HERESY 2011 (the audit of 02.11.2026, S1): the lab's gate on its own port. The names it trusts (an address, localhost, one label, a private
suffix, RUACH_HOSTS) and the ones it refuses (a name a site on the internet could point at this machine); a page of another site refused by
Sec-Fetch-Site or, from an old browser, by an Origin that is not the address asked; the Studio's page, scripts and the engine passing as
before; opening a page by a link not refused. HERESY 2138 (the audit of 06.11.2026, 2.1): the relay opened as a page, a frame or a script refused,
the page's own fetch() passing. HERESY 2258 (Viktor 08.11.2026: «Только по IP локальных сетей»): the addresses of local networks, localhost and
RUACH_HOSTS trusted; a name of one label, a private suffix, this machine's own name and an address beyond the local networks refused.
HERESY 2337 (Viktor 09.11.2026: «Да, убирай 100.64., а localhost оставляй»): a Tailscale address (100.64/10) refused unless RUACH_HOSTS names it.
python3 lab/test_origin_gate.py"""
import os
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import origin_gate as g  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


os.environ.pop("RUACH_HOSTS", None)
# HERESY 2258: the remote use over a VPN (a VPN's address to the Studio's LAN address), a proxy in front and the launchers (127.0.0.1, localhost), IPv6 kin
# written as browsers write them, and a request without a Host (HERESY 2337: Tailscale's 100.64/10 no longer among them)
for h in ("127.0.0.1:41870", "127.0.0.1:7777", "localhost:41870", "LOCALHOST", "localhost.", "[::1]:41870", "10.20.30.40:7443",
          "10.20.30.40:7777", "172.20.0.1", "169.254.10.20:7777", "[fd00::1]:7777", "[fe80::1%25eth0]:7777",
          "[::ffff:127.0.0.1]:7777", "[::ffff:7f00:1]:7777", ""):
    check(f"trusted: {h!r}", g.host_trusted(h))
# the home network's own range checked as a range: no address of it is written out here (the release scan stops on any, as it cannot tell
# this machine's from another's), and a host of 10/8 and of 172.16/12 above stands for the same rule
check("the 192.168/16 range is among the local networks", any(n.with_prefixlen == "192.168.0.0/16" for n in g.LOCAL_NETS))
for h in ("studio-box", "studio-box:7777", "forge.local", "studio.lan:7777", "box.home.arpa", "forge.tail1234.ts.net", "app.localhost", "localhost.evil.com",
          socket.gethostname(), "192.0.2.2:7777", "8.8.8.8", "0.0.0.0:7777", "[::]:7777", "[2001:db8::1]:7777", "attacker.example:41870",
          "rebind.evil.com", "127.0.0.1.nip.io:7777", ".local",
          "100.101.102.103:7777", "100.64.0.1", "100.127.255.254:41870", "[::ffff:100.101.102.103]:7777", "[::ffff:6465:6667]:7777"):   # HERESY 2337
    check(f"refused: {h!r}", not g.host_trusted(h))
os.environ["RUACH_HOSTS"] = "studio.example.org, .mine.net studio-box 203.0.113.7"
check("RUACH_HOSTS: a name of its own", g.host_trusted("studio.example.org:7777"))
check("RUACH_HOSTS: '.mine.net' takes its subdomains", g.host_trusted("a.b.mine.net") and not g.host_trusted("notmine.net"))
check("RUACH_HOSTS: a name of one label, named there, is answered (and only it)", g.host_trusted("studio-box:7777") and not g.host_trusted("forge"))
check("RUACH_HOSTS: an address beyond the local networks, named there, is answered", g.host_trusted("203.0.113.7:7777") and not g.host_trusted("203.0.113.8"))
os.environ["RUACH_HOSTS"] = "100.101.102.103"                # HERESY 2337: a Tailscale address of one's own, named
check("RUACH_HOSTS: a Tailscale address named there is answered (and only it)", g.host_trusted("100.101.102.103:7777") and not g.host_trusted("100.101.102.104:7777"))
os.environ.pop("RUACH_HOSTS")

H = {"Host": "127.0.0.1:41870"}
check("a script, curl or the engine (no Origin, no Sec-Fetch-Site): passes", g.refusal("POST", "/trash", dict(H)) is None)
check("the page itself (same-origin): passes", g.refusal("POST", "/trash", dict(H, **{"Sec-Fetch-Site": "same-origin", "Origin": "http://127.0.0.1:41870"})) is None)
check("a typed address (Sec-Fetch-Site none): passes", g.refusal("GET", "/guide/x.html", dict(H, **{"Sec-Fetch-Site": "none"})) is None)
check("a page of another site, a text/plain POST: refused", g.refusal("POST", "/trash", dict(H, **{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"})))
check("another port of this machine (same-site): refused", g.refusal("POST", "/settings", dict(H, **{"Sec-Fetch-Site": "same-site", "Origin": "http://127.0.0.1:8080"})))
check("a cross-site GET that changes things (an <img>): refused", g.refusal("GET", "/art/remove", dict(H, **{"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors"})))
check("a cross-site link to a path that acts: refused", g.refusal("GET", "/art/remove", dict(H, **{"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})))
check("a link from another site to the page (GET / as a navigation): passes", g.refusal("GET", "/", dict(H, **{"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})) is None)
check("an old browser: a foreign Origin on a POST refused", g.refusal("POST", "/trash", dict(H, Origin="https://evil.example")))
check("an old browser: Origin null on a POST refused", g.refusal("POST", "/trash", dict(H, Origin="null")))
check("an old browser: its own Origin on a POST passes", g.refusal("POST", "/trash", dict(H, Origin="http://127.0.0.1:41870")) is None)
check("a rebinding name is refused whatever it says", g.refusal("POST", "/trash", {"Host": "rebind.evil.com:41870", "Sec-Fetch-Site": "same-origin"}))

# HERESY 2138 (the audit of 06.11.2026, 2.1): the relay opened as a page, a frame or a script is refused; the page's own fetch() and curl pass
R = "/relay"
for what, hd in (("an address typed or a bookmark (Sec-Fetch-Site none, a document)", {"Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}),
                 ("a frame of the Studio's own page", {"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe"}),
                 ("a <script src> of the same origin", {"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "script"}),
                 ("an <object> (navigate without a Dest from an old browser)", {"Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate"})):
    check(f"the relay opened as {what}: refused", "not opened as a page" in (g.refusal("GET", R, dict(H, **hd)) or ""), g.refusal("GET", R, dict(H, **hd)))
check("the relay asked by the page's fetch() (same-origin, cors, Dest empty): passes",
      g.refusal("GET", R, dict(H, **{"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty"})) is None)
check("  a question by POST from the page: passes", g.refusal("POST", R, dict(H, **{"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty",
                                                                                  "Origin": "http://127.0.0.1:41870"})) is None)
check("  curl, a script or the engine (no Sec-Fetch-*): passes", g.refusal("GET", R, dict(H)) is None)
check("  another path opened as a page is not the relay's business: passes", g.refusal("GET", "/guide/x.html", dict(H, **{"Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate",
                                                                                                                         "Sec-Fetch-Dest": "document"})) is None)
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
