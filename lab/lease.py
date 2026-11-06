"""HERESY 2081 (Viktor 05.11.2026: «впиши в код Сторожа… глобально, как для браузера, так и для PWA, чтобы обрубал новые/дублирующие вкладки Студии
и PWA, учитывая то, что в неё можно постучаться как на порту 7777, так и на 7443. Амэн? Нам хаос не нужен, и потенциальная порча json файлов
пользователя.»): one Studio at a time.

A page over http on :7777 and one over https on :7443 are two origins: no BroadcastChannel and no Web Lock reaches from one to the other. Both reach
the lab, so the guard lives here, as a single writer's lease for each settings scope (a page opened with ?scope=NAME keeps settings files of its
own, so its lease is its own: a check never blocks Viktor's window, nor his window a check).

· A page makes an id when it loads and claims the lease, then keeps it with a beat every 10 s. Without a beat the lease lapses after 30 s; a page
  its browser hides beats once a minute at most (Chrome's throttling of hidden pages), so a hidden holder keeps it 150 s.
· A claim that finds another live holder is refused, and the page asks. Work here takes the lease all the same ("take"); the instance it was taken
  from learns so at its next beat, or at its next write, refused, and turns read-only. Lapsed and taken by nobody, a lease comes back to the page
  that held it at its next beat (a lab restarted, a page asleep), never to a page it was taken from (Work here gives it back there).
· Every POST that names its page instance (?inst=ID, or ID@SCOPE for a scoped page) is refused with a 409 unless that instance holds the lease;
  when none does (a lab restarted under a working page), the writer takes it. The reads and the listening sent as POSTs pass (OPEN). A request
  that names no instance (an API client, a script, a page from before this) is untouched.

    post(q, body) -> state      the page's claim, beat, take and release
    state(scope, iid="")        who holds the lease (GET /lease, the checks)
    refusal(path, q) -> None | the 409's body

HERESY 2100 (Viktor's debug journal of 05.11.2026, ticket RS-20261105-9bf61f: on the road, 213 lease requests fell between 16:00 and 20:00, 201 of
them cut by the page's own 20 s timer): a page whose beats go unanswered says so in its next beat (missed: how many in a row), and the lab keeps
that holder's lease for TTL_SLOW, so a bad line costs more than one missed beat before another window may take the lease. Every change of the
lease's holder is said in the lab's log (who held it, who holds it now, by what, and how long the one before had been silent).
Nothing here touches a file: the lease lives in the lab's memory, and a restarted lab is given it back by the next beat or write."""
import json
import re
import sys
import threading
import time

BEAT = 10              # the page beats this often (s)
TTL = 30               # a lease without a beat lapses after this
TTL_HIDDEN = 150       # a page its browser hides beats once a minute at most
TTL_SLOW = 90          # HERESY 2100: a holder whose last beat said beats went unanswered (a bad line) keeps it this long
OPEN = frozenset(("/lease", "/lora/bases", "/pianoteq/preview", "/audio/monitor/tone", "/audio/monitor/play", "/audio/monitor/stop",
                  "/audio/probe", "/audio/loop", "/handoff",
                  "/debug/bundle", "/debug/send", "/debug/clear"))   # reads and listening sent as POSTs (HERESY 2102: and the debug journal, which writes
                                                                    # nothing of the user's: a read-only window's journal is the one most wanted); the
                                                                    # page's own list is the same
SAY = ("Not saved: this window is read-only, the Studio works in another one (one Studio at a time, so that no two windows write over "
       "each other's changes; Work here in this window takes it back)")
LOCK = threading.Lock()
LEASES = {}            # scope -> {"id", "at", "since", "hidden", "kind", "port"}
LOST = {}              # (scope, id) -> when the lease was taken from that instance
GONE = {}              # HERESY 2152: (scope, id) -> when that page let its lease go (closed, reloaded): its last write passes, takes nothing
_ID = re.compile(r"[A-Za-z0-9_-]{8,64}")
_SCOPE = re.compile(r"[A-Za-z0-9_-]{0,32}")


def _scope(s):
    s = str(s or "").strip()
    if not _SCOPE.fullmatch(s):
        raise ValueError("bad scope")
    return s


def _iid(s):
    s = str(s or "").strip()
    if not _ID.fullmatch(s):
        raise ValueError("bad instance id")
    return s


def _live(cur, now):
    return bool(cur) and now - cur["at"] < max(TTL_HIDDEN if cur.get("hidden") else TTL, TTL_SLOW if cur.get("missed") else 0)


def say(text):
    """HERESY 2100: the lease's changes in the lab's log (the mock's too), the time to the millisecond"""
    t = time.time()
    print(time.strftime("%H:%M:%S", time.localtime(t)) + ".%03d" % int(t * 1000 % 1000) + " [lab] lease " + text, file=sys.stderr, flush=True)


def _count(v):
    """HERESY 2100: the beats a page says went unanswered in a row before this one (0 for anything else)"""
    try:
        return max(0, min(99, int(v))) if not isinstance(v, bool) else 0
    except (TypeError, ValueError):
        return 0


def _who(iid, kind="", port="", hidden=False):
    return iid[:6] + (f" ({kind}" + (f" :{port}" if port else "") + (", hidden" if hidden else "") + ")" if kind or port else "")


def _hold(scope, iid, d, now, why=""):
    cur = LEASES.get(scope)
    since = cur["since"] if cur and cur["id"] == iid else now
    LEASES[scope] = {"id": iid, "at": now, "since": since, "hidden": bool(d.get("hidden")),
                     "kind": str(d.get("kind") or "")[:12], "port": str(d.get("port") or "")[:6], "missed": _count(d.get("missed"))}
    LOST.pop((scope, iid), None)
    if not cur or cur["id"] != iid:                # HERESY 2100: the holder changed, said
        new = LEASES[scope]
        was = "nobody" if not cur else _who(cur["id"], cur.get("kind"), cur.get("port"), cur.get("hidden")) + \
            ("" if _live(cur, now) else f", silent {now - cur['at']:.0f} s")
        say(f"{scope or 'studio'}: {was} → {_who(iid, new['kind'], new['port'], new['hidden'])} by {why or '?'}")


def _state(scope, iid, now):
    cur = LEASES.get(scope)
    live = _live(cur, now)
    out = {"scope": scope, "held": bool(live and iid and cur["id"] == iid), "free": not live, "beat": BEAT, "ttl": TTL}
    if live and cur["id"] != iid:
        out["holder"] = {"since": round(cur["since"]), "seen": round(now - cur["at"], 1), "kind": cur["kind"], "port": cur["port"],
                         "hidden": cur["hidden"]}
    if iid and (scope, iid) in LOST:
        out["lost"] = round(LOST[(scope, iid)])
    return out


def state(scope="", iid=""):
    with LOCK:
        return _state(_scope(scope), str(iid or ""), time.time())


def post(q, body):
    d = json.loads((body or b"{}").decode("utf-8") or "{}")
    if not isinstance(d, dict):
        raise ValueError("expected {op, id}")
    scope, iid, op = _scope(q.get("scope", "")), _iid(d.get("id")), str(d.get("op") or "")
    now = time.time()
    with LOCK:
        cur = LEASES.get(scope)
        live, mine = _live(cur, now), bool(cur) and cur["id"] == iid
        if op == "claim":                  # a page come up: the lease, when nobody else holds it
            if mine or not live:
                GONE.pop((scope, iid), None)
                _hold(scope, iid, d, now, "claim")
        elif op == "beat":                 # kept; or lapsed (a lab restarted, a page asleep) and taken by nobody since
            if (mine and live) or (not live and d.get("had") and (scope, iid) not in LOST and (scope, iid) not in GONE):
                _hold(scope, iid, d, now, "beat")
        elif op == "take":                 # Work here: from whoever holds it
            if live and not mine:
                LOST[(scope, cur["id"])] = now
            GONE.pop((scope, iid), None)
            _hold(scope, iid, d, now, "take (Create here)")
        elif op == "release":              # the page goes (closed, reloaded, left)
            GONE[(scope, iid)] = now        # HERESY 2152: gone for good (a page makes a new id when it loads)
            if mine:
                LEASES.pop(scope, None)
                say(f"{scope or 'studio'}: {_who(iid, cur.get('kind'), cur.get('port'))} → nobody by release")
        else:
            raise ValueError("op is claim, beat, take or release")
        for told in (LOST, GONE):
            if len(told) > 200:            # the oldest are told no more
                for k in sorted(told, key=told.get)[:100]:
                    told.pop(k, None)
        return _state(scope, iid, now)


def refusal(path, q):
    """None, or the body of the 409 for a POST from a page instance that does not hold its scope's lease"""
    inst = str(q.get("inst") or "")
    if not inst or path in OPEN:
        return None
    iid, _, scope = inst.partition("@")
    try:
        iid, scope = _iid(iid), _scope(scope)
    except ValueError:
        return None                        # not a page instance of ours: as an API client
    now = time.time()
    with LOCK:
        cur = LEASES.get(scope)
        if _live(cur, now):
            if cur["id"] == iid:
                cur["at"] = now            # a write is a beat too
                return None
            return {"error": SAY, "lease": _state(scope, iid, now)}
        if (scope, iid) in LOST:           # taken from this page: Work here gives it back, not a write
            return {"error": SAY, "lease": _state(scope, iid, now)}
        if (scope, iid) in GONE:           # HERESY 2152: a page that let its lease go (reloaded) sends its last write after the release (the player's
            return None                    # place on pagehide): it passes, and the lease stays free for the page that comes up (06.11: it took the
                                           # lease back 156 ms after its release, and the reloaded page asked «already open in another window»)
        _hold(scope, iid, {}, now, "a write")   # nobody holds it (a lab restarted under a working page): the writer does
        return None
