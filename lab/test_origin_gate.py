"""HERESY 2011 (the audit of 02.11.2026, S1): the lab's gate on its own port. The names it trusts (an address, localhost, one label, a private
suffix, RUACH_HOSTS) and the ones it refuses (a name a site on the internet could point at this machine); a page of another site refused by
Sec-Fetch-Site or, from an old browser, by an Origin that is not the address asked; the Studio's page, scripts and the engine passing as
before; opening a page by a link not refused. HERESY 2138 (the audit of 06.11.2026, 2.1): the relay opened as a page, a frame or a script refused,
the page's own fetch() passing.   python3 lab/test_origin_gate.py"""
import os
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
for h in ("127.0.0.1:41870", "localhost:41870", "[::1]:41870", "192.0.2.2:7777", "golem", "golem:7777", "forge.local", "studio.lan:7777",
          "box.home.arpa", "forge.tail1234.ts.net", "app.localhost", ""):
    check(f"trusted: {h!r}", g.host_trusted(h))
for h in ("attacker.example:41870", "rebind.evil.com", "127.0.0.1.nip.io:7777", ".local"):
    check(f"refused: {h!r}", not g.host_trusted(h))
os.environ["RUACH_HOSTS"] = "studio.example.org, .mine.net"
check("RUACH_HOSTS: a name of its own", g.host_trusted("studio.example.org:7777"))
check("RUACH_HOSTS: '.mine.net' takes its subdomains", g.host_trusted("a.b.mine.net") and not g.host_trusted("notmine.net"))
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
