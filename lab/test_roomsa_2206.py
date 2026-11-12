"""HERESY 2206-2209: the Writer's early lines reach the Studio's log; a Videographer part merges; a resumed run keeps its step, first start and time;
train.log's tail. A temporary kit only, never user/. python3 lab/test_roomsa_2206.py"""
import json, sys, tempfile, threading, time, types
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


# 2206: writer_llm starts its idle thread as it is imported (it would look at the live writer's port); held while it is imported
_thread = threading.Thread
threading.Thread = lambda *a, **k: types.SimpleNamespace(start=lambda: None)
try:
    import writer_llm  # noqa: E402
finally:
    threading.Thread = _thread
writer_llm._say("its model (quality) on GPU 1, left by an earlier lab, taken over")
check("2206: said before the log is given: kept", writer_llm.EARLY == ["its model (quality) on GPU 1, left by an earlier lab, taken over"], writer_llm.EARLY)
got = []
writer_llm.speak(got.append)
check("2206: said into the log when it is given, in order", got == ["the Writer · its model (quality) on GPU 1, left by an earlier lab, taken over"], got)
check("2206: nothing kept after", writer_llm.EARLY == [], writer_llm.EARLY)
writer_llm._say("its model ready in 3 s")
check("2206: later lines straight into the log", got[-1] == "the Writer · its model ready in 3 s", got)
writer_llm.SAY = None
for i in range(30):
    writer_llm._say(f"line {i}")
check("2206: at most 20 kept", len(writer_llm.EARLY) == 20 and writer_llm.EARLY[0] == "line 10", writer_llm.EARLY[:2])
writer_llm.EARLY.clear()

# 2207: a part merged by videographer.save
import videographer  # noqa: E402
kit = Path(tempfile.mkdtemp())
plan = {"name": "t1", "title": "T", "look": {k: "" for k in videographer.LOOK_KEYS}, "brief": "his idea",
        "shots": [{"t0": 0, "t1": 2, "scene": {"shot": "his own", "camera": "", "motion": "", "light": ""}, "move": "push"},
                  {"t0": 2, "t1": 4, "scene": {k: "" for k in videographer.SCENE_KEYS}},
                  {"t0": 4, "t1": 6, "scene": {k: "" for k in videographer.SCENE_KEYS}}]}
videographer._write(kit, "t1", plan)
plan["look"]["palette"] = "his palette"
videographer._write(kit, "t1", plan)
q = videographer.save(kit, "t1", {"look": {"setting": "a desert"}, "scenes": [None, {"shot": "a wide dune", "camera": "low", "motion": "", "light": "dusk"}, None]})
check("2207: a shot sent as null stays (his own)", q["shots"][0]["scene"]["shot"] == "his own", q["shots"][0]["scene"])
check("2207: the part's shot written", q["shots"][1]["scene"] == {"shot": "a wide dune", "camera": "low", "motion": "", "light": "dusk"}, q["shots"][1]["scene"])
check("2207: a look field left out stays, the one sent is set", q["look"]["palette"] == "his palette" and q["look"]["setting"] == "a desert", q["look"])
check("2207: brief and move untouched", q.get("brief") == "his idea" and q["shots"][0].get("move") == "push", (q.get("brief"), q["shots"][0].get("move")))
q = videographer.save(kit, "t1", {"scenes": [None, None, {"camera": "handheld"}]})
check("2207: a field left out in a shot stays as it was", q["shots"][2]["scene"] == {"shot": "", "camera": "handheld", "motion": "", "light": ""}, q["shots"][2]["scene"])
q = videographer.save(kit, "t1", {"scenes": [None, {"shot": "", "camera": "low", "motion": "", "light": "dusk"}, None]})
check("2207: a field sent empty is emptied (the page's own save)", q["shots"][1]["scene"]["shot"] == "", q["shots"][1]["scene"])

# 2208, 2209: training
import training  # noqa: E402
kit = Path(tempfile.mkdtemp())
P = training.paths(kit)
run = "R1"
d = P["runs"] / run
(d / "output" / run).mkdir(parents=True)
try:
    training.log_tail(kit, run)
    check("2208: no train.log yet: FileNotFoundError, not an empty text", False, "returned")
except FileNotFoundError:
    check("2208: no train.log yet: FileNotFoundError, not an empty text", True)
(d / "train.log").write_bytes(b"".join(b"R1: %d/100 [00:01<00:02, loss: 0.5]\r" % i for i in range(5000)) + b"\nlast line\n")
t = training.log_tail(kit, run, 400)
rows = t.split("\n")
check("2208: the last 400 lines (tqdm's \\r a line)", len(rows) == 400 and rows[-1] == "last line" and rows[-2].startswith("R1: 4999/100"), rows[-2:])
big = b"x" * 600000 + b"\n" + b"".join(b"line %d\n" % i for i in range(10))
(d / "train.log").write_bytes(big)
rows = training.log_tail(kit, run, 400).split("\n")
check("2208: a log over 512 KiB: the line cut where the read began is left out", rows == ["line %d" % i for i in range(10)], rows[:2])
(d / "train.log").write_bytes(b"")
check("2208: an empty log is an empty text (it is empty)", training.log_tail(kit, run) == "")
check("2209: no save: 0", training._last_save(d, run) == 0)
for st in (5365, 10730, 53650):
    (d / "output" / run / f"{run}_{st:09d}.safetensors").write_bytes(b"x")
(d / "output" / run / f"{run}.safetensors").write_bytes(b"x")
(d / "output" / run / f"OTHER_{99999999:09d}.safetensors").write_bytes(b"x")
check("2209: the last numbered save of this run", training._last_save(d, run) == 53650, training._last_save(d, run))

# 2209: train() over an earlier sitting, with systemd, the cards and the base held
(P["prepared"] / "set").mkdir(parents=True)
(P["prepared"] / "set" / "dataset.json").write_text(json.dumps({"tracks": [{"name": f"t{i}"} for i in range(10)]}), encoding="utf-8")
first = time.time() - 5 * 86400
json.dump({"name": run, "dataset": "set", "options": {}, "started": first + 3600, "ended": first + 3600 + 7200, "first_started": first, "took_before": 1800,
           "status": "paused", "step": 0}, open(d / "run.json", "w"))
training.base_checkpoint = lambda P_, spec: (kit / "base.safetensors", "bf16", "")
training._systemctl = lambda *a: types.SimpleNamespace(stdout="", returncode=0)
training._unit_state = lambda r: "gone"
_run = training.subprocess.run
training.subprocess.run = lambda *a, **k: types.SimpleNamespace(returncode=0, stdout="", stderr="")
training.threading.Thread = lambda *a, **k: types.SimpleNamespace(start=lambda: None)
try:
    m = training.train(kit, {"dataset": "set", "name": run, "steps": 100, "gpu": ""}, lambda need, role: (1, 24000))
finally:
    training.subprocess.run = _run
    training.threading.Thread = _thread
disk = json.load(open(d / "run.json"))
check("2209: a resumed run starts at its last save", m["step"] == 53650 and disk["step"] == 53650 and training.RUNS[run]["step"] == 53650, (m.get("step"), disk.get("step")))
check("2209: its first start carried", disk.get("first_started") == first, disk.get("first_started"))
check("2209: the earlier sittings' time summed", disk.get("took_before") == 9000.0, disk.get("took_before"))
check("2209: said where it went on from", disk.get("went_on_from") == 53650, disk.get("went_on_from"))
shutil_ok = True
import shutil  # noqa: E402
shutil.rmtree(d)
(P["runs"]).mkdir(parents=True, exist_ok=True)
training.RUNS.pop(run, None)
training.subprocess.run = lambda *a, **k: types.SimpleNamespace(returncode=0, stdout="", stderr="")
training.threading.Thread = lambda *a, **k: types.SimpleNamespace(start=lambda: None)
try:
    m = training.train(kit, {"dataset": "set", "name": run, "steps": 100, "gpu": ""}, lambda need, role: (1, 24000))
finally:
    training.subprocess.run = _run
    training.threading.Thread = _thread
disk = json.load(open(d / "run.json"))
check("2209: a new run: step 0, no first start or earlier time", disk["step"] == 0 and "first_started" not in disk and "took_before" not in disk and "went_on_from" not in disk, disk)

print("FAIL: " + ", ".join(bad) if bad else "all ok")
sys.exit(1 if bad else 0)
