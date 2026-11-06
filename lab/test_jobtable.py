"""HERESY 2019 (the audit's C4): the lab's table of jobs remembers a failed job taken out of it. A job that ended well and was popped says nothing;
a failed one popped after the wait began gives its error; one popped before the wait began is an old one and says nothing.   python3 lab/test_jobtable.py"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jobtable  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


jobs = jobtable.Jobs()
jobs["old"] = {"status": "failed", "error": "an old failure"}
jobs.pop("old", None)
t0 = time.time()
jobs["done"] = {"status": "running"}
jobs.pop("done", None)
jobs["broke"] = {"status": "failed", "error": "stems: out of memory"}
jobs.pop("broke", None)
check("a job that ended well and was popped: nothing to say", jobs.failed_since("done", t0) is None)
check("a failed job popped after the wait began: its error", jobs.failed_since("broke", t0) == "stems: out of memory", jobs.failed_since("broke", t0))
check("a failed job popped before the wait began: an old one, nothing to say", jobs.failed_since("old", t0) is None)
check("still a dict: get, set, pop with a default", isinstance(jobs, dict) and jobs.pop("none", "x") == "x" and jobs.get("broke") is None)
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
