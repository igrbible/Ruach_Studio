"""HERESY 1944: the stop-crane (trainer/train.py crane) and the lab passing its keys. python3 lab/test_crane.py"""
import ast
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / "trainer/train.py").read_text(encoding="utf-8")
ns = {}
fns = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "crane"]
exec(compile(ast.Module(body=fns, type_ignores=[]), "train.py", "exec"), ns)
crane = ns["crane"]
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def h(step, ru, ua=1.0, narr=1.0, kl=0.05):
    return {"step": step, "flow": 0.5, "ar_ce": 1.0, "ar_kl": kl, "groups": {"RU": {"flow": 0.5, "ar_ce": ru}, "UA": {"flow": 0.5, "ar_ce": ua}, "narr": {"flow": 0.5, "ar_ce": narr}}}


G = ["RU", "UA", "narr"]
check("no history: no stop", crane([], G, 2, 0.07) == ("", 0))
check("falling ar_ce: no stop", crane([h(10, 2.0), h(20, 1.9), h(30, 1.8)], G, 2, 0.07)[0] == "")
check("one rise only: no stop", crane([h(10, 2.0), h(20, 1.9), h(30, 1.95)], G, 2, 0.07)[0] == "")
why, take = crane([h(10, 2.0), h(20, 1.9), h(30, 1.95), h(40, 2.01)], G, 2, 0.07)
check("RU rose two saves in a row: stop, take the save before the rise (20)", "RU" in why and take == 20, (why, take))
why, take = crane([h(10, 2.0, ua=1.5), h(20, 1.9, ua=1.6), h(30, 1.8, ua=1.7)], G, 2, 0.07)
check("UA rose two saves in a row: stop at UA, take 10", "UA" in why and take == 10, (why, take))
check("equal is no rise", crane([h(10, 2.0), h(20, 2.0), h(30, 2.0)], G, 2, 0.07)[0] == "")
why, take = crane([h(10, 2.0), h(20, 1.9, kl=0.071)], G, 2, 0.07)
check("KL over 0.07 since the save before: stop, take the one before (10)", "KL" in why and take == 10, (why, take))
check("KL ceiling 0: off", crane([h(10, 2.0), h(20, 1.9, kl=0.5)], G, 2, 0.0)[0] == "")
check("a group not measured (no ar_ce): never stops on it", crane([{"step": 10, "groups": {"RU": {"ar_ce": None}}}, {"step": 20, "groups": {"RU": {"ar_ce": None}}},
                                                                   {"step": 30, "groups": {"RU": {"ar_ce": None}}}], G, 2, 0.07)[0] == "")
check("a group outside stop_ce_groups rising: no stop", crane([h(10, 2.0, narr=1.0), h(20, 1.9, narr=1.1), h(30, 1.8, narr=1.2)], ["RU", "UA"], 2, 0.07)[0] == "")
lab = (HERE / "training.py").read_text(encoding="utf-8")
check("the lab passes the four keys to the trainer", all(lab.count(f'"{k}"') >= 2 for k in ("val_groups", "stop_ce_groups", "stop_ce_rises", "stop_kl_max")))
print("test_crane  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
