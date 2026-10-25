"""HERESY 1752: the trainer's rate at a step (trainer/train.py tail_lr, tail_start) and the lab's knobs into config.json. python3 lab/test_lr_tail.py"""
import ast
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / "trainer/train.py").read_text(encoding="utf-8")
ns = {}
fns = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name in ("tail_lr", "tail_start")]
exec(compile(ast.Module(body=fns, type_ignores=[]), "train.py", "exec"), ns)
tail_lr, tail_start = ns["tail_lr"], ns["tail_start"]
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


b = 8.66e-5
check("no tail: the rate as set at every step", all(tail_lr(b, s, 131840, 0, 0.0) == b for s in (0, 65920, 131840)))
check("before the tail: as set", tail_lr(b, 115359, 131840, 115360, 0.0) == b)
check("its first step: as set", tail_lr(b, 115360, 131840, 115360, 0.0) == b)
check("half-way down: half (floor 0)", math.isclose(tail_lr(b, 123600, 131840, 115360, 0.0), b / 2))
check("the last step: the floor (0)", tail_lr(b, 131840, 131840, 115360, 0.0) == 0.0)
check("a floor of 0.1: a tenth at the end, 0.55 half-way", math.isclose(tail_lr(b, 131840, 131840, 115360, 0.1), b * 0.1) and
      math.isclose(tail_lr(b, 123600, 131840, 115360, 0.1), b * 0.55))
check("past the end (three cards step over it): the floor, never under", tail_lr(b, 131842, 131840, 115360, 0.0) == 0.0)
check("a tail set past the end: none", tail_lr(b, 10, 100, 200, 0.0) == b)
check("the wave's: the last 0.5 of 4 epochs of 32960 starts at 3.5 (step 115360)",
      tail_start({"steps": 131840, "steps_per_epoch": 32960, "lr_tail_epochs": 0.5}) == 115360)
check("gone on to 6 epochs, the same 0.5 starts at 5.5", tail_start({"steps": 197760, "steps_per_epoch": 32960, "lr_tail_epochs": 0.5}) == 181280)
check("none asked, or no epoch's length: no tail", tail_start({"steps": 131840, "steps_per_epoch": 32960, "lr_tail_epochs": 0}) == 0 and
      tail_start({"steps": 131840, "lr_tail_epochs": 0.5}) == 0)
check("longer than the run: from the first step", tail_start({"steps": 1000, "steps_per_epoch": 100, "lr_tail_epochs": 50}) == 1)
lab = (HERE / "training.py").read_text(encoding="utf-8")
check("the lab's defaults and its config.json carry both knobs", lab.count('"lr_tail_epochs"') >= 3 and lab.count('"lr_tail_floor"') >= 3)
print("\nall passed" if not bad else f"\n{len(bad)} failed")
sys.exit(1 if bad else 0)
