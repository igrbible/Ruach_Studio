#!/usr/bin/env python3
"""HERESY 2982: the Videographer's night queue on a studio of its own in a temporary folder (never this Studio's), the Artist, H3, SeedVR2 and the
clip played by stand-ins: an order is checked when given (the plan, its stages, the hero, H3's mode, SeedVR2's choice, the clip's settings by the
lab's own clip_ask), waits for its hour, runs its stages in their order over only what is missing, logs each, survives a restart, and taken off it
stops its stage. The processor only, seconds.
  .venv/bin/python lab/test_vg_night.py"""
import importlib.util
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import videographer as v  # noqa: E402
import vg_night as nq  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def raises(fn, words):
    try:
        fn()
    except ValueError as e:
        return words in str(e)
    return False


class Room:
    """The room's machinery played: frames_job, h3_shots and upscale_shots each make what they are asked at once (or fail, or hang until
    cancelled), writing into the plan as the real ones do; every call kept."""

    def __init__(self, kit, name):
        self.kit, self.name, self.calls, self.fail, self.hang = kit, name, [], set(), set()
        self.frames_state, self.h3_jobs, self.up_jobs = "", [], []

    def _edit(self, fn):
        p = v.get(self.kit, self.name)
        p.pop("exists", None)
        for i, s in enumerate(p["shots"]):
            fn(i, s)
        v._write(self.kit, self.name, p)

    # frames_job
    def frames_start(self, kit, name, shots, prompts, heroes, refine=0.35, seed=None):
        self.calls.append(("frames", list(shots), sorted(heroes), dict(prompts)))
        if "frames" in self.hang:
            self.frames_state = "running"
            return {}
        self._edit(lambda i, s: s.update(frame=f"f{i}.png") if i in shots else None)
        self.frames_state = "done"
        return {}

    def frames_status(self, kit, name):
        last = next((c for c in reversed(self.calls) if c[0] == "frames"), None)
        return {"state": self.frames_state, "done": len(last[1]) if last and self.frames_state == "done" else 0, "errors": [], "elapsed": 1}

    def frames_cancel(self, kit, name):
        self.calls.append(("frames-cancel",))
        self.frames_state = "stopped"
        return {}

    # h3_shots
    def shoot(self, kit, name, i, prompt, mode="draft", free_cards=(), seed=None, first=True, size="16:9"):
        if not free_cards and not any(c[0] == "shoot" for c in self.calls):
            raise RuntimeError("no card free for MiniMax H3 now")
        self.calls.append(("shoot", i, prompt, mode, size, list(free_cards)))
        if i in self.fail:
            self.h3_jobs.append({"i": i, "state": "failed", "error": "out of memory"})
        else:
            self._edit(lambda k, s: s.update(video=f"v{k}.mp4") if k == i else None)
        return {"file": f"{name}--{i:03d}"}

    def h3_status(self, kit, name):
        return {"jobs": list(self.h3_jobs), "workers": [{"gpu": 1, "alive": True}]}

    def h3_cancel(self, kit, name, i=None):
        self.calls.append(("h3-cancel",))
        return {}

    def release_idle(self, kit, wait=45):
        self.calls.append(("release",))
        return []

    # upscale_shots
    def up_start(self, kit, name, shots, model="7b", res=1080, free_cards=()):
        self.calls.append(("upscale", list(shots), model, res, list(free_cards)))
        self._edit(lambda i, s: s.update(video_up=f"v{i}-up.mp4") if i in shots else None)
        return {"jobs": []}

    def up_status(self, kit, name):
        return {"jobs": list(self.up_jobs)}

    def up_cancel(self, kit, name):
        self.calls.append(("up-cancel",))
        return {}


kit = Path(tempfile.mkdtemp(prefix="claude-vgn-"))
try:
    nq.POLL = nq.CARDS_WAIT = 0.01
    import frames_job, h3_shots, upscale_shots  # noqa: E401,E402
    plan = {"name": "t", "title": "a test", "seconds": 20, "look": {}, "seed": 1000, "hero": {"run": "h", "file": "01-16x9-s1.png"},
            "shots": [{"t0": i * 4.0, "t1": i * 4.0 + 4, "scene": {"shot": f"s{i}"}} for i in range(4)]}
    plan["shots"][0]["frame"] = "old.png"                # shot 1 has its picture already: the Artist's stage leaves it
    v._write(kit, "t", plan)
    room = Room(kit, "t")
    frames_job.start, frames_job.status, frames_job.cancel = room.frames_start, room.frames_status, room.frames_cancel
    h3_shots.shoot, h3_shots.status, h3_shots.cancel, h3_shots.release_idle = room.shoot, room.h3_status, room.h3_cancel, room.release_idle
    upscale_shots.start, upscale_shots.status, upscale_shots.cancel = room.up_start, room.up_status, room.up_cancel
    cards = {"left": [[], [1, 2]]}                       # H3's first ask finds no card (the night's other jobs), the next two
    clips = []

    def more_gpus(need, most, exclude):
        return cards["left"].pop(0) if cards["left"] else [0, 1, 2][:most]
    ops = {"more_gpus": more_gpus, "say": lambda s: None, "clip": lambda name, body: clips.append((name, body)) or {"status": "running"},
           "clip_job": lambda name, body: None}
    words = {str(i): f"w{i}" for i in range(4)}
    order = {"frames": {"prompts": words, "heroes": [1, 2]}, "shoot": {"prompts": {k: "m" + x for k, x in words.items()}, "mode": "draft"},
             "upscale": {"model": "7b-fp8", "res": 720}, "clip": {"between": "cut", "shape": "16:9", "upscale": "lanczos"}}

    print("an order checked when given")
    check("no plan: refused", raises(lambda: nq.add(kit, "nope", order), "no plan"))
    check("no stage: refused", raises(lambda: nq.add(kit, "t", {}), "nothing to do"))
    check("H3's mode not one of the room's: refused", raises(lambda: nq.add(kit, "t", {"shoot": {"prompts": words, "mode": "turbo"}}), "draft, fast or final"))
    check("SeedVR2's model not one of the room's: refused", raises(lambda: nq.add(kit, "t", {"upscale": {"model": "9b", "res": 720}}), "SeedVR2"))
    check("an hour that is no hour: refused", raises(lambda: nq.add(kit, "t", dict(order, at="25:00")), "HH:MM"))
    p2 = dict(plan, name="u")
    p2.pop("hero")
    v._write(kit, "u", p2)
    check("the hero's shots and no hero's picture: refused as the room refuses", raises(lambda: nq.add(kit, "u", order), "hero's picture first"))
    seen = []
    nq.add(kit, "t", order, check_clip=lambda c: seen.append(dict(c)))
    q = nq.listing(kit)
    o = q["orders"][0] if q["orders"] else {}
    check("given: waiting, its stages kept; the clip checked, and set to take SeedVR2's upscales as the room's «Upscale» does",
          o.get("state") == "waiting" and o.get("shoot", {}).get("mode") == "draft" and seen and seen[0]["upscale"] == "seedvr2" and o["clip"]["upscale"] == "seedvr2", (o, seen))
    now = time.mktime((2026, 11, 24, 22, 0, 0, 0, 0, -1))
    check("«at» 23:00 at 22:00: today at 23:00; at 23:30: tomorrow", nq.due_of("23:00", now) == now + 3600 and nq.due_of("23:00", now + 5400) == now + 3600 + 86400,
          (nq.due_of("23:00", now) - now, nq.due_of("23:00", now + 5400) - now))

    print("its hour, then its stages in order over what is missing")
    nq.add(kit, "t", dict(order, at="23:00"), now=now)
    check("before its hour: nothing runs", nq.run_one(kit, ops, now=now + 60) is None and not room.calls, room.calls)
    done = nq.run_one(kit, ops, now=now + 3601)
    kinds = [c[0] for c in room.calls]
    fr = next((c for c in room.calls if c[0] == "frames"), None)
    check("the Artist draws only the shots with no picture, the hero's among them", fr is not None and fr[1] == [1, 2, 3] and fr[2] == [1, 2] and fr[3] == {"1": "w1", "2": "w2", "3": "w3"}, fr)
    sh = [c for c in room.calls if c[0] == "shoot"]
    check("H3 waited for a card the night's other jobs held, then shot every shot with no video, with its own words, mode and size",
          [c[1] for c in sh] == [0, 1, 2, 3] and all(c[2] == "mw%d" % c[1] and c[3] == "draft" and c[4] == "16:9" for c in sh) and sh[0][5] == [1, 2], sh)
    up = next((c for c in room.calls if c[0] == "upscale"), None)
    check("SeedVR2 took every shot with a video, its model and resolution, on the cards", up is not None and up[1] == [0, 1, 2, 3] and up[2:4] == ("7b-fp8", 720) and up[4], up)
    check("the stages in their order, the clip last with the room's settings", kinds.index("frames") < kinds.index("shoot") < kinds.index("upscale")
          and clips and clips[-1][0] == "t" and clips[-1][1]["between"] == "cut", (kinds, clips))
    q = nq.listing(kit)
    check("the order finished: off the queue, in the done list with each stage's log", done and done["state"] == "done" and not q["orders"] and q["done"][0]["name"] == "t"
          and [x["stage"] for x in q["done"][0]["log"]] == ["frames", "shoot", "upscale", "clip"] and q["done"][0]["log"][1]["did"] == 4, q)

    print("an order run again does only what is missing; a stage that fails is said and the next go on")
    room.calls.clear()
    clips.clear()
    p = v.get(kit, "t")
    p.pop("exists", None)
    p["shots"][3].pop("video")
    p["shots"][3].pop("video_up")
    v._write(kit, "t", p)
    room.fail = {3}
    nq.add(kit, "t", order)
    done = nq.run_one(kit, ops)
    sh = [c[1] for c in room.calls if c[0] == "shoot"]
    lg = {x["stage"]: x for x in done["log"]}
    check("nothing to draw: the Artist not asked; H3 asked for shot 4 alone", not any(c[0] == "frames" for c in room.calls) and sh == [3] and lg["frames"]["did"] == 0, room.calls)
    check("H3's failure said for its shot, with its reason; SeedVR2 had nothing new; the clip still cut", lg["shoot"]["errors"] == [{"i": 3, "error": "out of memory"}]
          and not any(c[0] == "upscale" for c in room.calls) and clips and done["state"] == "done", done["log"])

    print("a restart, and an order taken off")
    nq.add(kit, "t", order)
    qq = nq._read(kit)
    qq["orders"][0]["state"] = "running"
    nq._write(kit, qq)
    check("after a restart the cut-off order waits again, said in its log", nq.resume(kit) == 1 and nq.listing(kit)["orders"][0]["state"] == "waiting"
          and nq.listing(kit)["orders"][0]["log"][-1]["stage"] == "restart")
    nq.drop(kit, "t")
    check("a waiting order taken off is gone", not nq.listing(kit)["orders"])
    p = v.get(kit, "t")
    p.pop("exists", None)
    p["shots"][2].pop("frame")
    v._write(kit, "t", p)
    room.calls.clear()
    room.hang = {"frames"}
    nq.add(kit, "t", {"frames": {"prompts": words, "heroes": []}, "clip": {"between": "cut"}})
    import threading
    th = threading.Thread(target=nq.run_one, args=(kit, ops), daemon=True)
    th.start()
    for _ in range(200):
        if nq.RUN.get("name") == "t" and any(c[0] == "frames" for c in room.calls):
            break
        time.sleep(0.01)
    nq.drop(kit, "t")
    th.join(5)
    q = nq.listing(kit)
    check("taken off while it draws: the Artist's Stop asked, the order «stopped», the clip never cut",
          ("frames-cancel",) in room.calls and q["done"][0]["state"] == "stopped" and not q["orders"] and not any(c[0] == "shoot" for c in room.calls), (room.calls, q))

    print("a shot left «running» by a worker that died is not waited for")
    room.h3_jobs = [{"i": 0, "state": "running", "gpu": 2}, {"i": 1, "state": "running", "gpu": 1}, {"i": 2, "state": "queued", "gpu": 2}]
    check("running on a dead worker's card: not busy; on a live one, and queued: busy", nq._h3_busy(kit, "t") == {1, 2}, nq._h3_busy(kit, "t"))
    room.h3_jobs = []

    print("the lab's own clip check (lab.clip_ask)")
    spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
    lab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lab)
    check("a clip's settings the room does not have: refused when the order is given, by the route's own words",
          raises(lambda: lab.clip_ask("t", {"between": "wipe"}, check=True), "between the shots") and raises(lambda: lab.clip_ask("t", {"upscale": "x"}, check=True), "lanczos or seedvr2"))
    check("good settings: checked, no job started", lab.clip_ask("t", {"between": "dissolve", "shape": "9:16"}, check=True) is None and lab.clip_job("t", {"shape": "9:16"}) is None)
    check("the night queue's routes and its runner are in the lab", all(x in (HERE / "lab.py").read_text(encoding="utf-8") for x in
          ('"/video/night"', '"/video/night-off"', "vg_night.start(KIT", "vg_night.listing(KIT)")))
finally:
    shutil.rmtree(kit, ignore_errors=True)
print(f"\ntest_vg_night  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
