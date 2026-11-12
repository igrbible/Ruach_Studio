"""HERESY 2301 (Viktor 09.11.2026: «По аналоговой петле нужен будет сторож с секирой, чтобы не пропустил из двух+ инстансов или потоков той же
сессии параллельные сливы в лампу. Раутинг-то настроен, но нужен сторож и очередь к Лампе»): one stream through the analog gateway at a time on
this machine, across every Studio instance, page, session and guest.

A step its plugin marks «hardware» takes the lamp for its whole processing (both passes of a stems print, not each pass alone): a kernel lock on
a file every instance on the machine shares (LOCK). It is let go when the step ends, fails or is taken off, and when its process dies: the
kernel frees a dead holder's lock, so no lock outlives its owner; a hung step ends at the lab's own four-hour timeout of a plugin step. Who
waits stands in a queue (QUEUE, under its own short lock), first come first served, Viktor's own runs first when user/lamp.json says
owner_first (a guest's run waits behind his); a waiting job says its place and the time ahead of it (job["lamp"], job["waiting"]), and only the head of the queue reaches for
the lamp, so nobody slips past the line. An entry whose process is gone, or older than STALE_S, is dropped by the next reader.
"""
import fcntl
import json
import os
import threading
import time
from pathlib import Path

STALE_S = 6 * 3600                 # a queue entry this old is dropped whatever its process says (the step's own timeout is 4 h)
POLL_S = 1.0


def where():
    """The lamp's folder: one for the whole machine (RUACH_LAMP_DIR for the tests)."""
    return Path(os.environ.get("RUACH_LAMP_DIR") or "/tmp")


def _open(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o666)
    try:
        os.fchmod(fd, 0o666)                         # another instance of the Studio (another user too) waits in the same line
    except OSError:
        pass
    return fd


def _alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except ProcessLookupError:
        return False
    except (PermissionError, ValueError, TypeError, OverflowError):
        return True


class _Queue:
    """The queue file under its own lock, its dead and stale entries dropped on reading."""

    def __enter__(self):
        d = where()
        self.path = d / "ruach-lamp.queue.json"
        self.fd = _open(d / "ruach-lamp.queue.lock")
        fcntl.flock(self.fd, fcntl.LOCK_EX)
        try:
            items = json.loads(self.path.read_text(encoding="utf-8") or "[]")
        except (OSError, ValueError):
            items = []
        now = time.time()
        self.items = [e for e in items if isinstance(e, dict) and isinstance(e.get("id"), str) and _alive(e.get("pid"))
                      and now - float(e.get("since") or 0) < STALE_S]
        return self

    def save(self):
        tmp = self.path.with_name(f".ruach-lamp.queue.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(self.items, ensure_ascii=False), encoding="utf-8")
        try:
            os.chmod(tmp, 0o666)
        except OSError:
            pass
        os.replace(tmp, self.path)

    def __exit__(self, *exc):
        fcntl.flock(self.fd, fcntl.LOCK_UN)
        os.close(self.fd)
        return False


def ordered(items, owner_first=False):
    """The line as it goes: the one in the lamp first, then who waits: by arrival, Viktor's own runs before a guest's when owner_first."""
    holding = [e for e in items if e.get("holding")]
    waiting = sorted((e for e in items if not e.get("holding")),
                     key=lambda e: ((0 if e.get("owner") else 1) if owner_first else 0, float(e.get("since") or 0)))
    return holding + waiting


def snapshot(owner_first=False):
    """The line now (the panel's view): [{who, owner, label, since, eta, holding}] in the order it goes."""
    with _Queue() as q:
        return [{k: e.get(k) for k in ("who", "owner", "label", "since", "eta", "holding", "started")} for e in ordered(q.items, owner_first)]


def owner_first(user_dir):
    """user/lamp.json {"owner_first": true}: Viktor's own runs go before a guest's in the lamp's line."""
    try:
        return bool(json.loads(Path(user_dir, "lamp.json").read_text(encoding="utf-8")).get("owner_first"))
    except (OSError, ValueError, AttributeError):
        return False


def _left(e, now):
    if e.get("holding"):
        return max(0.0, float(e.get("eta") or 0) - (now - float(e.get("started") or now)))
    return float(e.get("eta") or 0)


class turn:
    """with turn(job, who, eta, label): the step's whole processing in the lamp. who: a guest's name when a proxy in front of the Studio names
    the run (the step's params._lamp_who), '' for Viktor's own;
    eta the step's expected seconds. Taken off while it waits (job["cancel"]) it raises RuntimeError(off) and leaves the line."""

    def __init__(self, job, who="", eta=0.0, label="", owner_first=lambda: False, off="taken off the queue", poll=POLL_S):
        self.job, self.who, self.eta, self.label, self.first, self.off, self.poll = job, who or "", float(eta or 0), label, owner_first, off, poll
        self.me = f"{os.getpid()}-{threading.get_ident()}-{time.time():.6f}"
        self.fd = None

    def _put(self, **change):
        with _Queue() as q:
            for e in q.items:
                if e["id"] == self.me:
                    e.update(change)
            q.save()

    def _leave(self):
        with _Queue() as q:
            q.items = [e for e in q.items if e["id"] != self.me]
            q.save()

    def __enter__(self):
        with _Queue() as q:
            q.items.append({"id": self.me, "pid": os.getpid(), "who": self.who, "owner": not self.who, "since": time.time(), "eta": self.eta,
                            "label": self.label})
            q.save()
        self.fd = _open(where() / "ruach-lamp.lock")
        try:
            while True:
                if self.job.get("cancel"):
                    raise RuntimeError(self.off)
                now = time.time()
                with _Queue() as q:
                    line = ordered(q.items, self.first())
                    at = next((i for i, e in enumerate(line) if e["id"] == self.me), None)
                    if at is None:                           # dropped by a reader (a clock jump past STALE_S): stand in line again
                        q.items.append({"id": self.me, "pid": os.getpid(), "who": self.who, "owner": not self.who, "since": now, "eta": self.eta,
                                        "label": self.label})
                        q.save()
                        line, at = ordered(q.items, self.first()), None
                        at = next(i for i, e in enumerate(line) if e["id"] == self.me)
                    ahead = line[:at]
                    head = all(e.get("holding") for e in ahead)
                if head:
                    try:
                        fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        pass                                 # the lamp is held by someone not in the line (an older Studio): wait
                    else:
                        self._put(holding=True, started=time.time())
                        self.job.pop("lamp", None)
                        self.job.pop("waiting", None)
                        return self
                eta = round(sum(_left(e, now) for e in ahead))
                self.job["lamp"] = {"position": at + 1, "ahead": len(ahead), "eta": eta}
                self.job["waiting"] = f"the lamp's queue: number {at + 1}, about {eta // 60}:{eta % 60:02d}"
                time.sleep(self.poll)
        except BaseException:
            self._leave()
            os.close(self.fd)
            self.fd = None
            raise

    def __exit__(self, *exc):
        try:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
        finally:
            os.close(self.fd)
            self.fd = None
            self._leave()
        return False


def seconds_of(audio, rate=1.0):
    """The step's expected seconds: the source's length (a set of stems: its longest file) times the step's pace; 0 when unreadable."""
    try:
        import soundfile as sf
        p = Path(audio)
        files = [p] if p.is_file() else [f for f in p.iterdir() if f.suffix.lower() in (".wav", ".flac", ".ogg", ".mp3")]
        return max([sf.info(str(f)).duration for f in files] or [0.0]) * float(rate or 1.0)
    except Exception:  # noqa: BLE001 — a guess for the line's clock, never a reason to refuse the step
        return 0.0
