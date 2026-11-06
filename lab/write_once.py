"""HERESY 2099 (Viktor 05.11.2026, his debug journal of that day, ticket RS-20261105-9bf61f: «POST /lab/collection 13:58:02 (50.2 s) and POST
/lab/settings 21:45:23 (32.1 s) fell without an error and without a retry»): a write the page sends again is done once.

The page sends each of its quick writes (a mark, a note, the settings, the Librarian's changes…) with a write id of its own (?wid=), and when no
answer comes in its time it sends the same write again, with the same id: the line stalled, and the first one may still reach the lab, or may
have reached it already and its answer been lost on the way back. So the lab keeps each answer by its id for ten minutes: a second sending is
answered with the first one's answer, byte for byte, and nothing is done twice (a workspace made twice, a playlist shuffled twice). A second
sending that comes while the first is still at work waits for it (up to a minute), then is answered the same way.

    wid(query) -> "" | the id          begin(wid) -> None (do it, then end()) | bytes (answer with these) | b"" (the first still at work)
    end(wid, raw)                      the answer kept (None: too long to keep; the next sending does it again)"""
import re
import threading
import time
import urllib.parse

TTL = 600              # an answer kept this long (s)
MAX = 2000             # and no more than so many
WAIT = 60              # a second sending waits this long for the first one's answer
_ID = re.compile(r"[A-Za-z0-9_-]{8,64}")
_LOCK = threading.Lock()
_SEEN = {}             # wid -> {"at", "done": Event, "raw": bytes | None}


def wid(query):
    w = (urllib.parse.parse_qs(query or "").get("wid") or [""])[0]
    return w if _ID.fullmatch(w) else ""


def _prune(now):
    for k in [k for k, v in _SEEN.items() if now - v["at"] > TTL]:
        _SEEN.pop(k, None)
    if len(_SEEN) > MAX:
        for k in sorted(_SEEN, key=lambda k: _SEEN[k]["at"])[:len(_SEEN) - MAX]:
            _SEEN.pop(k, None)


def begin(w):
    now = time.time()
    with _LOCK:
        _prune(now)
        e = _SEEN.get(w)
        if e is None:
            _SEEN[w] = {"at": now, "done": threading.Event(), "raw": None}
            return None
    if not e["done"].wait(WAIT):
        return b""
    if e["raw"] is None:               # its answer was too long to keep: done again
        with _LOCK:
            _SEEN[w] = {"at": time.time(), "done": threading.Event(), "raw": None}
        return None
    return e["raw"]


def end(w, raw):
    with _LOCK:
        e = _SEEN.get(w)
        if e is None:
            return
        e["raw"], e["at"] = raw, time.time()
    e["done"].set()


def code_of(raw):
    try:
        return int(raw.split(b" ", 2)[1])
    except (IndexError, ValueError):
        return 0
