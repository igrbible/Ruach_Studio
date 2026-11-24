"""HERESY 2943: a run's events for its charts (training.py _events): a tower frozen at a step, a resume from a save, a tower's learning-rate curve
changed at a start; read on as the log grows; a tower frozen from the start is no event; a run with no log has none."""
import json
import sys
import tempfile
from pathlib import Path

import training as T

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def write(p, rows, mode="a"):
    with open(p, mode, encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp) / "run"
    d.mkdir()
    check("no log: no events", T._events(d) == [])
    log = d / "log.jsonl"
    start = lambda at, ar, nar: {"kind": "start", "from_step": at, "towers": {"ar": {"curve": ar, "params": 1}, "nar": {"curve": nar, "params": 1}}}   # noqa: E731
    write(log, [start(0, "1.5:0.0", "1.5:5e-05,3.5:5e-05"), {"kind": "freeze", "tower": "ar", "step": 0, "since": 0}]
          + [{"kind": "step", "step": s, "loss": 1.0} for s in range(1, 50)]
          + [{"kind": "end", "step": 50}, {"kind": "resume", "step": 50}, start(50, "1.5:0.0", "1.5:5e-05,2.0:1e-05")]
          + [{"kind": "step", "step": s, "loss": 1.0} for s in range(51, 80)], mode="w")
    ev = T._events(d)
    check("a resume and the NAR's LR curve changed at it; the AR frozen from the start is no event",
          ev == [{"step": 50, "kind": "lr", "tower": "nar", "was": "1.5:5e-05,3.5:5e-05", "now": "1.5:5e-05,2.0:1e-05"}, {"step": 50, "kind": "resume"}], ev)
    write(log, [{"kind": "freeze", "tower": "ar", "step": 90, "since": 90}, {"kind": "step", "step": 91, "loss": 0.5},
                {"kind": "freeze", "tower": "ar", "step": 90, "since": 90}])
    ev = T._events(d)
    check("read on as the log grows: the AR frozen at 90, once", ev[-1] == {"step": 90, "kind": "freeze", "tower": "ar"} and len(ev) == 3, ev)
    with open(log, "a", encoding="utf-8") as f:
        f.write('{"kind": "resume", "st')                 # a line half written
    check("  a line half written waits for its end", len(T._events(d)) == 3)
    with open(log, "a", encoding="utf-8") as f:
        f.write('ep": 120}\n')
    check("  and counts once it is whole", T._events(d)[-1] == {"step": 120, "kind": "resume"}, T._events(d))
    write(log, [start(0, "1.5:0.0", "1.5:5e-05")], mode="w")
    check("a log written anew is read from its start", T._events(d) == [], T._events(d))

print("FAILED " + str(len(bad)) if bad else "all passed")
sys.exit(1 if bad else 0)
