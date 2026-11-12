#!/usr/bin/env python3
"""HERESY VG1 · VG2: the Videographer's key frames as batch runs and H3's spread, on a studio of their own in a temporary folder (never this
Studio's), the Artist and the cards played by stand-ins: the hero's shots go first to 2.1 from the hero's picture, then one 2512 run takes their
pictures (at the refine strength) with the shots from words; each picture lands in its shot; a picture the filter kept back and a failed run are
said for their shots; Stop stops the run. H3: waiting shots start a worker on a free card only beyond one a worker. The processor only, seconds.
  .venv/bin/python lab/test_vg_batch.py"""
import json
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import videographer as v  # noqa: E402
import frames_job as fj  # noqa: E402
import h3_shots  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


class Artist:
    """artist's stand-in: draw() makes a run whose pictures come one by one; read(), picture(), stop()."""
    PROMPT_MAX = 4000

    def __init__(self, kit, flag=(), fail_painter=None):
        self.kit, self.runs, self.asked, self.flag, self.fail = kit, {}, [], set(flag), fail_painter

    def draw(self, body):
        rid = f"r{len(self.runs)}"
        self.asked.append(dict(body, id=rid))
        run = {"status": "running", "gpus": [0, 1, 2], "pictures": []}
        self.runs[rid] = run

        def go():
            for k, x in enumerate(body["batch"]):
                time.sleep(0.02)
                if run["status"] == "stopped":
                    return
                if self.fail == body["painter"] and k == 1:
                    run.update(status="failed", error="out of memory")
                    return
                kept = x["prompt"] not in self.flag
                run["pictures"].append({"n": k + 1, "kept": kept, **({"file": f"{k + 1:02d}-16x9-s{x['seed']}.png"} if kept else {})})
            run["status"] = "done"
        threading.Thread(target=go, daemon=True).start()
        return {"id": rid}

    def run_dir(self, rid):
        return rid

    def read(self, rid):
        return dict(self.runs[rid], pictures=list(self.runs[rid]["pictures"]))

    def picture(self, rid, f):
        p = self.kit / "pics" / f"{rid}-{f}"
        p.parent.mkdir(exist_ok=True)
        from PIL import Image
        Image.new("RGB", (64, 36), (len(rid) * 40 % 255, 90, 120)).save(p, "PNG")
        return p, None

    def stop(self, rid):
        self.runs[rid]["status"] = "stopped"


def wait(name):
    for _ in range(600):
        s = fj.status(kit, name)
        if s["state"] != "running":
            return s
        time.sleep(0.05)
    return fj.status(kit, name)


kit = Path(tempfile.mkdtemp(prefix="claude-vgb-"))
try:
    fj.time = type("T", (), {"time": staticmethod(time.time), "sleep": staticmethod(lambda s: time.sleep(min(s, 0.05)))})
    plan = {"name": "t", "title": "a test", "seconds": 20, "look": {}, "shots": [{"t0": i * 4.0, "t1": i * 4.0 + 4, "scene": {"shot": f"s{i}"}} for i in range(5)],
            "hero": {"run": "h", "file": "01-16x9-s1.png"}, "seed": 1000}
    v._write(kit, "t", plan)
    print("the drawing as batch runs (VG1)")
    a = Artist(kit)
    fj.artist = a
    fj.start(kit, "t", [0, 1, 2, 3, 4], {str(i): f"p{i}" for i in range(5)}, [0, 2, 4])
    s = wait("t")
    first, second = a.asked[0], a.asked[1] if len(a.asked) > 1 else {}
    check("two runs: the hero's shots by 2.1 from the hero's picture, then one 2512 run", len(a.asked) == 2 and first["painter"] == fj.HERO and second["painter"] == fj.POLISH,
          [x["painter"] for x in a.asked])
    check("the 2.1 run: the hero's three shots, the hero's picture to EDIT (2356, no more by its style), the plan's seed + the shot",
          [x["seed"] for x in first["batch"]] == [1000, 1002, 1004] and all(x["ref"] == {"id": "h", "file": "01-16x9-s1.png"} for x in first["batch"])
          and first.get("ref_as") == "edit" and first["batch"][0]["prompt"].startswith(fj.EDIT_LEAD), first)
    check("the 2512 run: the three pictures at the refine strength, then the two shots from words, the realism adapters asked",
          [x["ref"]["id"] if x["ref"] else None for x in second["batch"]] == ["r0", "r0", "r0", None, None] and second.get("strength") == fj.REFINE
          and [x["prompt"] for x in second["batch"]] == ["p0", "p2", "p4", "p1", "p3"] and "loras" in second, second)
    q = v.get(kit, "t")
    check("every shot has its picture, the hero's marked", s["state"] == "done" and s["done"] == 5 and all(x.get("frame") for x in q["shots"])
          and [x["frame_from"]["hero"] for x in q["shots"]] == [True, False, True, False, True], (s, [x.get("frame_from") for x in q["shots"]]))
    print("a picture kept back, a failed run, Stop")
    a = Artist(kit, flag={"p1"})
    fj.artist = a
    fj.start(kit, "t", [1, 3], {"1": "p1", "3": "p3"}, [])
    s = wait("t")
    check("no hero shot: one 2512 run; the filtered picture said for its shot", len(a.asked) == 1 and s["done"] == 1 and [e["i"] for e in s["errors"]] == [1], s)
    a = Artist(kit, fail_painter=fj.HERO)
    fj.artist = a
    fj.start(kit, "t", [0, 2, 4], {str(i): f"p{i}" for i in (0, 2, 4)}, [0, 2, 4])
    s = wait("t")
    check("2.1's run failed after one picture: the other two said, the one made polished", sorted(e["i"] for e in s["errors"]) == [2, 4] and s["done"] == 1, s)
    a = Artist(kit)
    fj.artist = a
    fj.start(kit, "t", [0, 1, 2, 3, 4], {str(i): f"p{i}" for i in range(5)}, [])
    fj.cancel(kit, "t")
    s = wait("t")
    check("Stop: the run stopped, the job «stopped»", s["state"] == "stopped" and all(r["status"] in ("stopped", "done") for r in a.runs.values()), s)
    print("H3 spread over the free cards (VG2)")
    sp = kit / "user/videos/.h3/gpu0-h3"
    sp.mkdir(parents=True)
    spawned, asked = [], []
    h3_shots._spawn = lambda k, g, m: spawned.append(g)
    (sp / "worker.json").write_text(json.dumps({"status": "busy", "pid": __import__("os").getpid(), "gpu": 0, "at": time.time()}))
    for n in range(4):
        (sp / f"t--{n:03d}--x.json").write_text("{}")
    got = h3_shots.spread(kit, lambda most, exclude: asked.append((most, list(exclude))) or [1, 2][:most])
    check("four shots waiting, one worker: two free cards started", got == [1, 2] and spawned == [1, 2] and asked == [(3, [0])], (got, spawned, asked))
    for n in range(3):
        (sp / f"t--{n:03d}--x.json").unlink()
    spawned.clear(); asked.clear()
    got = h3_shots.spread(kit, lambda most, exclude: asked.append(most) or [1])
    check("one shot waiting, one worker: no other card asked", got == [] and not asked and not spawned, (got, asked))
    print("an idle H3 worker gives its card back (2323)")
    import os, subprocess
    sp1 = kit / "user/videos/.h3/gpu1-h3"
    sp1.mkdir(parents=True)
    idle = subprocess.Popen(["sleep", "60"], start_new_session=True)
    (sp1 / "worker.json").write_text(json.dumps({"status": "ready", "pid": idle.pid, "gpu": 1, "at": time.time()}))
    for n in range(4):
        (sp / f"t--{n:03d}--x.json").unlink(missing_ok=True)
    busy = subprocess.Popen(["sleep", "60"], start_new_session=True)
    (sp / "worker.json").write_text(json.dumps({"status": "busy", "pid": busy.pid, "gpu": 0, "at": time.time()}))
    (sp / "t--009--x.json").write_text("{}")
    got = h3_shots.release_idle(kit, wait=10)
    time.sleep(0.3)
    check("the idle worker sent away and gone, the busy one with a shot waiting kept", got == [1] and idle.poll() is not None and busy.poll() is None,
          (got, idle.poll(), busy.poll()))
    busy.kill()
finally:
    shutil.rmtree(kit, ignore_errors=True)
print(f"\ntest_vg_batch  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
