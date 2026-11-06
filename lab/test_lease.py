"""HERESY 2081: the single writer's lease (lab/lease.py): claim, beat, take, release; the refusal of a page that does not hold it; a scope's lease
its own; a lease lapsed, a hidden holder's longer.   python3 lab/test_lease.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lease  # noqa: E402

bad = []


def ok(name, cond, got=""):
    if not cond:
        bad.append(name)
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({got})"))


def post(op, iid, scope="", **kw):
    return lease.post({"scope": scope} if scope else {}, json.dumps(dict(kw, op=op, id=iid)).encode())


A, B, C, D = "aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd"
s = post("claim", A, kind="app", port="7443")
ok("the first page holds the lease", s["held"] and not s["free"], s)
s = post("claim", B)
ok("a second page is refused and told who holds it", not s["held"] and s["holder"]["kind"] == "app" and s["holder"]["port"] == "7443" and "lost" not in s, s)
ok("a write of the holder passes", lease.refusal("/settings", {"inst": A}) is None)
r = lease.refusal("/settings", {"inst": B})
ok("a write of the second is refused, with the lab's words and the lease's state", bool(r) and r["error"] == lease.SAY and r["lease"]["held"] is False, r)
ok("reads and listening sent as POSTs pass", lease.refusal("/pianoteq/preview", {"inst": B}) is None and lease.refusal("/lease", {"inst": B}) is None)
ok("a request that names no page is untouched", lease.refusal("/settings", {}) is None and lease.refusal("/settings", {"inst": "bad id!"}) is None)
s = post("take", B)
ok("Work here takes it", s["held"], s)
s = post("beat", A, had=True)
ok("the page it was taken from learns so at its beat, and gets nothing back", not s["held"] and "lost" in s, s)
ok("and its write is refused", bool(lease.refusal("/collection", {"inst": A})))
s = post("claim", C, scope="claude")
ok("a scoped page holds its own lease, whoever holds the Studio's", s["held"] and lease.state("", B)["held"], s)
ok("and its writes name their scope", lease.refusal("/settings", {"inst": C + "@claude"}) is None and bool(lease.refusal("/settings", {"inst": C})))
s = post("release", B)
ok("released, the lease is free", s["free"], s)
ok("a page it was taken from gets it back by no write", bool(lease.refusal("/collection", {"inst": A})))
ok("nor by a beat", not post("beat", A, had=True)["held"])
ok("a page never refused takes a free lease by its write (a lab restarted under it)", lease.refusal("/collection", {"inst": D}) is None and lease.state("", D)["held"])
lease.LEASES[""]["at"] -= lease.TTL + 1
ok("without a beat the lease lapses", lease.state("", D)["free"])
s = post("beat", D, had=True)
ok("lapsed and taken by nobody, it comes back to its holder's beat", s["held"], s)
post("beat", D, had=True, hidden=True)
lease.LEASES[""]["at"] -= lease.TTL + 1
ok("a hidden holder keeps it longer", lease.state("", D)["held"])
lease.LEASES[""]["at"] -= lease.TTL_HIDDEN
ok("but not for ever", lease.state("", D)["free"])
s = post("claim", A)
ok("a page come up takes a lapsed lease", s["held"], s)
# HERESY 2152: a reloaded page lets its lease go, then sends its last write (the player's place on pagehide): the write passes, the lease stays
# free, and the page that comes up after the reload holds it without «already open in another window»
E, F = "eeeeeeeeeeee", "ffffffffffff"
lease.LEASES.clear(); lease.LOST.clear(); lease.GONE.clear()
post("claim", E, kind="app", port="7443")
s = post("release", E)
ok("a page reloaded lets its lease go", s["free"], s)
ok("its last write passes (the player's place on pagehide)", lease.refusal("/playback", {"inst": E}) is None)
ok("but takes nothing: the lease stays free", lease.state("", E)["free"] and not lease.state("", E)["held"], lease.state("", E))
ok("nor does a late beat of it", not post("beat", E, had=True)["held"])
s = post("claim", F, kind="app", port="7443")
ok("the page come up after the reload holds it, nobody asked", s["held"] and "lost" not in s, s)
ok("a gone page that claims again (back from the browser's memory) may hold a free lease", (post("release", F), post("claim", F))[1]["held"])
for body in (b"[]", b'{"op": "steal", "id": "aaaaaaaaaaaa"}', b'{"op": "claim", "id": "x"}'):
    try:
        lease.post({}, body)
        ok("a bad request is refused: " + body.decode(), False)
    except ValueError:
        ok("a bad request is refused: " + body.decode(), True)
try:
    lease.post({"scope": "../x"}, b'{"op": "claim", "id": "aaaaaaaaaaaa"}')
    ok("a bad scope is refused", False)
except ValueError:
    ok("a bad scope is refused", True)
print(f"{len(bad)} failed" if bad else "all passed")
sys.exit(1 if bad else 0)
