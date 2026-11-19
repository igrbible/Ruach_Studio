"""HERESY 2762: a score-mode run with not one sheet is refused aloud (lab/trainer/train.py: sheetless_why), on the CPU.
python3 lab/test_sheetless_score_mode.py"""
import os, sys
from pathlib import Path
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
sys.path.insert(0, str(Path(__file__).resolve().parent / "trainer"))
import train as T  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:200] + ")"))
    if not ok:
        bad.append(what)


check("Direct needs no sheet", T.sheetless_why("off", 12, 0) == "")
check("full with every sheet starts", T.sheetless_why("full", 12, 12) == "")
check("full with one sheet of twelve starts (the rest Direct, said in the log as before)", T.sheetless_why("full", 12, 1) == "")
why = T.sheetless_why("full", 12, 0)
check("full with not one sheet is refused", why.startswith("score mode full: not one of the 12 tracks has a sheet"), why)
check("the refusal says what to do", "Start it as Direct" in why and ".fail" in why, why)
check("melody the same, one track said in the singular", "not one of the 1 track has" in T.sheetless_why("melody", 1, 0), T.sheetless_why("melody", 1, 0))
check("an empty set is not this guard's to judge", T.sheetless_why("full", 0, 0) == "")
print("all good" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
