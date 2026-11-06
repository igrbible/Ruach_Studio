"""HERESY 2103 (Viktor 05.11.2026, his debug journal of that day, ticket RS-20261105-9bf61f: of 19 025 lines the lab wrote, not one said how long a
request took): the lab's own log, a line a request, written when its answer is out: when it came (to the millisecond), how long it took, the bytes
sent, who asked (the Studio names its visitor in X-Remote-Addr, as it does for the API; nobody named: «-»). With it, the lab's own work that takes
time says when it started and when it was done (align, loudness, derived, chain), so a stall on the way and a slow count here can be told apart.

    Counted(wfile)                     a handler's wfile that counts what it sends (and keeps it, for a write said once: write_once.py)
    stamp(t) -> "HH:MM:SS.mmm"         line(handler, came, done) -> the access line
    trace(text)                        a line of the lab's own, with its time to the millisecond
    took(what, name)                   a with-block: «started» as it begins, «done in N s» (or «failed after N s: why») as it ends"""
import contextlib
import sys
import time

KEEP = 1 << 20                     # a write's answer kept for its second sending, up to a megabyte (theirs are a few hundred bytes)


class Counted:
    """the handler's wfile: what it sends counted (n), and kept while record() asks it to"""

    def __init__(self, raw):
        self.raw, self.n, self.kept, self.over = raw, 0, None, False

    def write(self, b):
        out = self.raw.write(b)
        self.n += len(b)
        if self.kept is not None:
            if len(self.kept) + len(b) <= KEEP:
                self.kept += bytes(b)
            else:
                self.kept = None           # too long to keep: a second sending is done again, not answered from here
                self.over = True
        return out

    def record(self):
        self.kept, self.over = b"", False

    def recorded(self):
        got, self.kept = self.kept, None
        return None if self.over else got

    def __getattr__(self, k):
        return getattr(self.raw, k)


def stamp(t):
    return time.strftime("%H:%M:%S", time.localtime(t)) + ".%03d" % int(t * 1000 % 1000)


def line(h, came, done):
    peer = (h.headers.get("X-Remote-Addr") if getattr(h, "headers", None) else "") or "-"
    code = getattr(h, "_code", "-")
    return (f'{time.strftime("%H:%M:%S", time.localtime(done))} [lab] "{getattr(h, "requestline", "")}" {code} {getattr(h.wfile, "n", 0)} B · '
            f"came {stamp(came)} · {round((done - came) * 1000)} ms · peer {peer.replace('::ffff:', '')}")


def trace(text):
    print(f"{stamp(time.time())} [lab] {text}", file=sys.stderr, flush=True)


@contextlib.contextmanager
def took(what, name=""):
    t0 = time.time()
    who = f"{what} {name}".strip()
    trace(f"{who}: started")
    try:
        yield
    except Exception as e:
        trace(f"{who}: failed after {time.time() - t0:.2f} s: {str(e)[:200]}")
        raise
    trace(f"{who}: done in {time.time() - t0:.2f} s")
