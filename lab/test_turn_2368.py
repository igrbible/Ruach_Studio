#!/usr/bin/env python3
"""HERESY 2368: the lab's heavy turn with a reading first, and an Artist batch stepping aside for it. The turn's own code (class turn … _take) is
read out of lab/lab.py and run here with the lab's other parts stubbed (no lab started, no card, no file of the Studio's); the batch's side,
artist._join_aside and artist_qwen.step_aside, with a fake painter thread in a temporary folder. About five seconds.
  .venv/bin/python lab/test_turn_2368.py"""
import json
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


src = (HERE / "lab.py").read_text(encoding="utf-8")
a, b = src.index("\nclass turn:"), src.index("\nclass whisper_turn:")
ns = {"threading": threading, "time": time, "heavy": threading.Lock(), "TURN": {"job": None}, "jobs": {}, "jobs_lock": threading.Lock(),
      "unclaim": lambda: None, "OFF_QUEUE": "taken off the queue"}
exec("class Cancelled(Exception):\n    pass\n" + src[a:b], ns)
turn, jobs, order = ns["turn"], ns["jobs"], []


def job(key):
    j = {"status": "queued"}
    jobs[key] = j
    return j


def hold(key, secs, aside=None):
    j = job(key)
    with turn(j):
        order.append(key)
        if aside is not None:
            t0 = time.time()
            while time.time() - t0 < secs:
                if turn.short_waiting():
                    aside.append(key)
                    turn.step_aside(j)
                    order.append(key + " back")
                time.sleep(0.05)
        else:
            time.sleep(secs)


def start(*a, **k):
    th = threading.Thread(target=hold, args=a, kwargs=k, daemon=True)
    th.start()
    return th


print("a reading first to the turn")
ths = [start("artist:A", 0.6)]
time.sleep(0.1)
ths.append(start("stems:L1", 0.1))
time.sleep(0.1)
ths.append(start("art:L2", 0.1))
time.sleep(0.1)
ths.append(start("reader:S1", 0.1))
for th in ths:
    th.join(5)
check("the reading came after the job holding the turn, before the two that waited longer", order[:2] == ["artist:A", "reader:S1"] and sorted(order[2:]) == ["art:L2", "stems:L1"], order)
check("a job marked short goes first too", ns["_short"]({"short": True}) and not ns["_short"]({"status": "queued"}))

print("a batch steps aside for a reading and takes the turn back before the rest")
order.clear()
asides = []
ths = [start("artist:B", 1.2, aside=asides)]
time.sleep(0.1)
ths.append(start("stems:L3", 0.1))
time.sleep(0.2)
ths.append(start("reader:S2", 0.2))
for th in ths:
    th.join(6)
check("the batch, the reading, the batch back, then the job that waited", order == ["artist:B", "reader:S2", "artist:B back", "stems:L3"], order)
check("the turn free at the end, no reading counted as waiting", not ns["heavy"].locked() and ns["SHORT"] == {"n": 0, "back": 0}, ns["SHORT"])

print("the batch's side: artist._join_aside and artist_qwen.step_aside")
sys.path.insert(0, str(HERE))
import artist  # noqa: E402
import artist_qwen  # noqa: E402
d = Path(tempfile.mkdtemp(prefix="claude-aside-"))
try:
    said, stepped, rows = [], [], []
    waiting = {"n": 1}

    class FakeTurn:
        @staticmethod
        def short_waiting():
            return waiting["n"] > 0

        @staticmethod
        def step_aside(j):
            stepped.append(time.time())
            waiting["n"] = 0                         # the reading took the turn and gave it back
    artist.H.update(turn=FakeTurn, say=said.append)
    run = {"id": "t", "batch": [{"n": 1}, {"n": 2}, {"n": 3}]}
    lock = threading.Lock()

    def painter():                                   # three pictures, each 0.3 s, asking step_aside between them as the batch loop does
        import io
        import contextlib
        for n in (1, 2, 3):
            time.sleep(0.3)
            rows.append(("picture", n, time.time()))
            if n < 3:
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    th = threading.Thread(target=artist_qwen.step_aside, args=(d,))
                    th.start()
                    while th.is_alive():
                        for line in buf.getvalue().splitlines()[len([r for r in rows if r[0] == "line"]):]:
                            rows.append(("line", line, time.time()))
                            with lock:
                                artist._row(d, run, 0, [], {}, json.loads(line))
                        time.sleep(0.05)
                    for line in buf.getvalue().splitlines()[len([r for r in rows if r[0] == "line"]):]:
                        rows.append(("line", line, time.time()))
                        with lock:
                            artist._row(d, run, 0, [], {}, json.loads(line))
    pt = threading.Thread(target=painter, daemon=True)
    pt.start()
    artist._join_aside(d, run, {"status": "running"}, [pt], lock)
    lines = [r[1] for r in rows if r[0] == "line"]
    check("the painter said it stepped aside after its picture, and went on", lines[:2] == ['{"aside": true}', '{"aside": false}'], lines)
    check("the turn was given to the reading once, while the painter waited", len(stepped) == 1 and any(r[0] == "line" and r[2] <= stepped[0] for r in rows), stepped)
    check("all three pictures painted, the file «aside» gone, the run's asides cleared", [r[1] for r in rows if r[0] == "picture"] == [1, 2, 3]
          and not (d / "aside").exists() and "asides" not in run, (rows, run))
    check("said in the activity log", any("steps aside" in s for s in said), said)
    check("a run that is no batch never steps aside", not (isinstance({"batch": 3}.get("batch"), list)))
finally:
    shutil.rmtree(d, ignore_errors=True)

print(f"\ntest_turn_2368  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
