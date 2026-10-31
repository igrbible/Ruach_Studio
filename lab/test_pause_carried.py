"""HERESY 1973: a pause's late stop ends only the start it paused (a run resumed within the minute under the same unit name lives on); a run begun
from a save carried in names no save before that step as gone. A kit of its own in a temporary folder, systemctl played: nothing of the studio's is touched."""
import json, sys, tempfile, threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import training

ok = True
def check(what, cond):
    global ok
    print(("ok   " if cond else "FAIL ") + what); ok &= bool(cond)


class Unit:                                        # systemctl --user as the lab calls it: is-active, show InvocationID, kill, stop
    def __init__(self, inv): self.inv, self.calls = inv, []
    def __call__(self, *args):
        self.calls.append(args)
        out = "active" if args[0] == "is-active" else self.inv if args[0] == "show" else ""
        return type("R", (), {"stdout": out + "\n", "stderr": "", "returncode": 0})()


def paused_then(kit, inv_after):
    unit = Unit("first-start")
    training._systemctl, sleep, Thread = unit, training.time.sleep, threading.Thread
    held = []
    training.threading.Thread = lambda target, daemon=None: type("T", (), {"start": lambda self: held.append(target)})()
    training.time.sleep = lambda s: None
    try:
        training.stop(kit, "probe-run", pause=True)
        unit.inv = inv_after                        # the minute passes: the same start still up, or a new one under the name
        held[0]()
    finally:
        training.time.sleep, training.threading.Thread = sleep, Thread
    return [c for c in unit.calls if c[0] == "stop"]


with tempfile.TemporaryDirectory() as t:
    kit = Path(t)
    P = training.paths(kit)
    d = P["runs"] / "probe-run"; (d / "output" / "probe-run").mkdir(parents=True)
    json.dump({"name": "probe-run", "status": "running", "tracks": 100, "step": 700, "options": {"save_every": 100}}, open(d / "run.json", "w"))
    check("the paused start still up after the minute is stopped", len(paused_then(kit, "first-start")) == 1)
    check("a start resumed within the minute is not", paused_then(kit, "second-start") == [])

    for s in (500, 600, 700):
        (d / "output" / "probe-run" / f"probe-run_{s:09d}.safetensors").write_bytes(b"x")
    gone = {g["step"] for g in training.gone(kit, "probe-run")}
    check("without a carried start the steps before its saves show as gone", gone == {100, 200, 300, 400})
    json.dump({"from": "other-run/other-run_000000260.safetensors", "step": 500}, open(d / "output" / "probe-run" / "carried.json", "w"))
    check("a carried start at 500: none gone", training.gone(kit, "probe-run") == [])
    (d / "output" / "probe-run" / f"probe-run_{600:09d}.safetensors").unlink()
    check("a save after it deleted still shows as gone", [g["step"] for g in training.gone(kit, "probe-run")] == [600])

print("all ok" if ok else "FAILED")
sys.exit(0 if ok else 1)
