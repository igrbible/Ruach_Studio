"""HERESY 2019 (the audit of 02.11.2026, C4): the lab's table of jobs, which remembers a failed job taken out of it.

A job that ends well leaves the table, and a failed one leaves it too once someone has read it (a page asking with cached=1 pops it: «report once,
then allow a new try»). A chain waiting on that job saw it gone and took its step for done. The table now keeps, for an hour, each failed job
that was popped, so the chain asks failed_since(key, t0) before it calls a vanished job a success.

    jobs = Jobs()                      # a dict; pop() of a failed job is remembered
    jobs.failed_since(key, t0)         # its error when a failed job of that key was popped at or after t0, else None"""
import threading
import time

KEEP = 3600


class Jobs(dict):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._failed, self._lock = {}, threading.Lock()

    def pop(self, key, *default):
        v = super().pop(key, *default)
        if isinstance(v, dict) and v.get("status") == "failed":
            now = time.time()
            with self._lock:
                self._failed[key] = (now, str(v.get("error") or "failed"))
                for k in [k for k, (t, _e) in self._failed.items() if now - t > KEEP]:
                    del self._failed[k]
        return v

    def failed_since(self, key, t0):
        with self._lock:
            f = self._failed.get(key)
        return f[1] if f and f[0] >= t0 else None
