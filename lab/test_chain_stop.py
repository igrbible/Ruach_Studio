"""HERESY 1962: a chain's own processes known by their owner and ended by Stop; the job threads it starts inherit the owner; a wait in a stopped chain
ends; each step's pace kept for the next run's ETA. The lab is imported, nothing reaches the studio. python3 lab/test_chain_stop.py"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


# a process started with no owner: as before, nothing kept, the caller's own group
lab._TL.owner = None
p0 = subprocess.Popen(["sleep", "5"])
check("no owner: nothing kept, the process in the caller's group", not lab.OWNED and os.getpgid(p0.pid) == os.getpgid(0), lab.OWNED)
p0.kill(); p0.wait()

# owned: kept under the chain, in a group of its own; run() goes through it too
lab._TL.owner = "chain:t1962"
p1 = subprocess.Popen(["sleep", "30"])
r = subprocess.run(["true"], capture_output=True)
check("owned: kept under its chain, a group of its own; subprocess.run too", p1 in lab.OWNED["chain:t1962"] and os.getpgid(p1.pid) == p1.pid and len(lab.OWNED["chain:t1962"]) == 2 and r.returncode == 0,
      lab.OWNED)

# the threads a chain starts are its own
seen = []
done = threading.Event()
lab._spawn(lambda: (seen.append(getattr(lab._TL, "owner", None)), done.set()))
done.wait(5)
lab._TL.owner = None
seen2 = []
done2 = threading.Event()
lab._spawn(lambda: (seen2.append(getattr(lab._TL, "owner", None)), done2.set()))
done2.wait(5)
check("a job thread inherits the owner of the thread that started it, and none from none", seen == ["chain:t1962"] and seen2 == [None], (seen, seen2))

# Stop: only a running chain; its processes ended, the owner stopped
lab.CHAINS["t1962"] = {"status": "done", "steps": []}
check("a chain not running is not stopped", lab.chain_stop("t1962")["ok"] is False)
lab.CHAINS["t1962"] = {"status": "running", "steps": []}
out = lab.chain_stop("t1962")
t0 = time.time()
while p1.poll() is None and time.time() - t0 < 5:
    time.sleep(0.05)
check("Stop ends the chain's processes and marks it stopping", out["ok"] and out["ended"] == 1 and p1.poll() is not None and "chain:t1962" in lab.STOPS and lab.CHAINS["t1962"].get("stopping"),
      (out, p1.poll(), lab.STOPS))

# a stopped chain's thread: its wait ends, and it starts nothing more
lab._TL.owner = "chain:t1962"
lab.jobs["x:t1962"] = {"status": "running"}
try:
    lab._wait("x:t1962", timeout=10)
    waited = "returned"
except RuntimeError as e:
    waited = str(e)
try:
    subprocess.Popen(["sleep", "1"])
    started = "started"
except RuntimeError as e:
    started = str(e)
lab._TL.owner = None
lab.jobs.pop("x:t1962", None)
lab.STOPS.discard("chain:t1962")
check("in a stopped chain a wait ends as «stopped» and no new process starts", waited == "stopped" and started == "stopped", (waited, started))

# the pace: kept per step kind, the median of the last 20
tmp = Path(tempfile.mkdtemp())
lab.PACE_FILE = tmp / "user" / "refiner-pace.json"
st = {"step": "plugin", "plugin": "ruach-vocal", "sid": "pro"}
for r_ in (0.5, 0.2, 0.4):
    lab._pace_put(lab._pace_key(st), r_)
for i in range(25):
    lab._pace_put("stems:four", 1.0 + i)
d = json.load(open(lab.PACE_FILE, encoding="utf-8"))
check("each step's pace kept by its kind, the median read, twenty at most", lab._pace_key(st) == "plugin:ruach-vocal:pro" and lab._pace(lab._pace_key(st)) == 0.4 and len(d["stems:four"]) == 20
      and lab._pace("remaster:") is None and lab._pace_key({"step": "stems", "mode": "four"}) == "stems:four", d)

print("FAIL" if bad else "all ok")
sys.exit(1 if bad else 0)
