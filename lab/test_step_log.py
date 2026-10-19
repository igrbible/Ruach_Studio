"""HERESY 1507: the step log never ends a run on a lock, and the lab reads a live log without holding it. python3 lab/test_step_log.py"""
import os
import sqlite3
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "trainer"))
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


src = (Path(__file__).resolve().parent / "trainer" / "train.py").read_text(encoding="utf-8")
ns = {}
exec(compile(src[src.index("class StepLog"):src.index("def load_set")], "train.py", "exec"), {"sqlite3": sqlite3, "time": time, "print": print}, ns)
StepLog = ns["StepLog"]
import training  # noqa: E402

with tempfile.TemporaryDirectory() as t:
    run = Path(t) / "run"
    (run / "output" / "run").mkdir(parents=True)
    db = run / "output" / "run" / "loss_log.db"
    (run / "run.json").write_text("{\"options\": {\"ar_loss_weight\": 0.3, \"ar_kl_weight\": 0.3}}")
    log = StepLog(str(db))
    mode = log.con.execute("PRAGMA journal_mode").fetchone()[0]
    check("the step log in WAL", mode == "wal", mode)
    for st in range(1, 2001):
        log.log(st, {"loss/loss": 1.0 / st, "loss/ar_ce": 2.0, "loss/ar_kl": 0.5})
    log.commit()
    s = training._series(run)
    check("the lab reads the log: its curves", "loss" in s and "ar_ce" in s and len(s["loss"]["curve"]) <= 400, list(s))
    check("read twice unchanged: the same answer kept, not read again", training._series(run) is s)
    # a reader holding the old-style lock a long while: a write transaction elsewhere holds the file; the log says so and goes on
    blocker = sqlite3.connect(str(db), timeout=1)
    blocker.execute("BEGIN EXCLUSIVE")
    log.con.close()
    log2 = StepLog.__new__(StepLog)
    log2.con = sqlite3.connect(str(db), timeout=0.2)
    log2.refused = 0
    out = []
    import builtins
    real_print = builtins.print
    ns_print = lambda *a, **k: out.append(" ".join(str(x) for x in a))   # noqa: E731
    ns["print"] = ns_print
    StepLog.log.__globals__["print"] = ns_print
    StepLog.commit.__globals__["print"] = ns_print
    try:
        log2.log(2010, {"loss/loss": 0.1})
        log2.commit()
        died = False
    except Exception as e:  # noqa: BLE001
        died = repr(e)
    check("a locked log never ends the run", died is False, died)
    check("  and it says so in the run's log", any("step log" in x for x in out), out)
    blocker.rollback(); blocker.close()
    log2.log(2020, {"loss/loss": 0.05}); log2.commit()
    n = sqlite3.connect(str(db)).execute("SELECT COUNT(*) FROM steps WHERE step = 2020").fetchone()[0]
    check("free again: the steps written", n == 1, n)
    # the lab's read while the trainer writes: the writer never waits more than a moment
    waits, stop = [], False
    def writer():
        log3 = StepLog(str(db))   # its own thread, as the trainer has
        st = 3000
        while not stop:
            st += 10
            a = time.time()
            log3.log(st, {"loss/loss": 0.01, "loss/ar_ce": 1.0})
            log3.commit()
            waits.append(time.time() - a)
    th = threading.Thread(target=writer)
    th.start()
    for _ in range(20):
        training.SERIES.clear()
        training._series(run)
    time.sleep(0.3)
    stop = True
    th.join()
    check("the trainer writing while the lab reads: no write waited a second", max(waits) < 1.0, round(max(waits), 3))
print("test_step_log:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
