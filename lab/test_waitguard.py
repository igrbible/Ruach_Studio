"""HERESY 2319 · 2320: the wait guard's long works, their time left by their own progress (unknown said as unknown, never 0), the estimate for a music
and a speech job, the holds (a later music or speech job waits behind the one the user chose to wait for), and /health's workers.
   .venv/bin/python lab/test_waitguard.py"""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import frames_job  # noqa: E402
import waitguard as wg  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def near(a, b, tol=3):
    return a is not None and abs(a - b) <= tol


kit = Path(tempfile.mkdtemp(prefix="waitguard-"))
now = time.time()
me = os.getpid()

# --- the Videographer's H3 workers: a busy one at step 2 of 8 for 60 s with a 10 s draft shot queued (no history: 33 s a second); an idle one
# ready 100 s ago (it leaves at 600 s idle); a dead one (its pid gone) is not a work
h3 = kit / "user/videos/.h3"
busy = h3 / "gpu1-h3"
busy.mkdir(parents=True)
run = busy / "clip--003--x.run"
run.write_text(json.dumps({"mode": "draft", "seconds": 6}), encoding="utf-8")
os.utime(run, (now - 60, now - 60))
(busy / "clip--004--y.json").write_text(json.dumps({"mode": "draft", "seconds": 10}), encoding="utf-8")
(busy / "worker.json").write_text(json.dumps({"status": "busy", "pid": me, "job": "clip--003--x", "step": 2, "steps": 8, "at": now}), encoding="utf-8")
idle = h3 / "gpu2-h3"
idle.mkdir(parents=True)
(idle / "worker.json").write_text(json.dumps({"status": "ready", "pid": me, "at": now - 100}), encoding="utf-8")
dead = h3 / "gpu0-h3"
dead.mkdir(parents=True)
(dead / "worker.json").write_text(json.dumps({"status": "busy", "pid": 999999999, "at": now}), encoding="utf-8")
(dead / "clip--001--z.json").write_text(json.dumps({"mode": "draft", "seconds": 5}), encoding="utf-8")

# --- a SeedVR2 job on GPU0: two shots of 100 frames, one made in 100 s
sr = kit / "user/videos/.sr/clip--20261110-gpu0"
(sr / "out").mkdir(parents=True)
(sr / "out/000.mp4").write_bytes(b"x")
(sr / "job.json").write_text(json.dumps({"name": "clip", "gpu": 0, "pid": me, "queued": now - 100,
                                         "items": [{"i": 0, "frames": 100}, {"i": 1, "frames": 100}]}), encoding="utf-8")

ACT = []
HOLDER = [None]
STUDIO = [100]
JOBS = {}
import threading  # noqa: E402
wg.setup(kit=kit, jobs=JOBS, lock=threading.Lock(), act_now=lambda: list(ACT), turn_holder=lambda: HOLDER[0], studio_now=lambda: STUDIO[0],
         reader=None, free_gpu=None, job_roles=lambda: [0, 1, 2])

ws = {w["key"]: w for w in wg.works()}
check("a busy H3 worker is a work, running", ws.get("h3 gpu1", {}).get("status") == "running", ws.get("h3 gpu1"))
check("its time left: the shot by its steps (180 s) and the queued one by the measured rate (330 s)", near(ws["h3 gpu1"]["eta_s"], 510), ws["h3 gpu1"]["eta_s"])
check("an idle H3 worker: idle, leaving its card in about 500 s", ws.get("h3 gpu2", {}).get("status") == "idle" and near(ws["h3 gpu2"]["eta_s"], 500), ws.get("h3 gpu2"))
check("a dead worker's spool is not a work", "h3 gpu0" not in ws, sorted(ws))
check("SeedVR2: half its frames in 100 s, about 100 s left", near(ws.get("seedvr2 clip--20261110-gpu0", {}).get("eta_s"), 100), ws.get("seedvr2 clip--20261110-gpu0"))

hj = wg.health_jobs()
check("/health's workers: the busy H3 running, the idle one idle, SeedVR2 running",
      hj.get("h3 gpu1") == "running" and hj.get("h3 gpu2") == "idle" and hj.get("seedvr2 clip--20261110-gpu0") == "running", hj)

# --- a plan's keyframes: 2 of 10 drawn in 200 s
frames_job.JOBS["clip"] = {"state": "running", "done": 2, "total": 10, "started": now - 200, "todo": [], "drawing": []}
ws = {w["key"]: w for w in wg.works()}
check("keyframes: 2 of 10 in 200 s, about 800 s left, a batch on the heavy turn", near(ws["frames clip"]["eta_s"], 800) and ws["frames clip"]["heavy"], ws["frames clip"])
check("/health sees the keyframes running", wg.health_jobs().get("frames clip") == "running")

# --- a speech job (on the processor: no card to wait for) behind the heavy turn: stems holding it (900 s left) and the keyframes (800 s)
ACT[:] = [{"key": "stems:take", "kind": "stems", "status": "running", "expect": 1000, "elapsed": 100, "gpu": 0, "what": "stems"},
          {"key": "reader:r1", "kind": "reader", "status": "queued"}]
HOLDER[0] = "stems:take"
e = wg.estimate("reader", {})
check("speech: waits for the heavy turn: the latest of what holds it, 900 s, known", e["wait_s"] == 900 and e["known"], e)
check("speech never waits behind speech: the other Reader run is not a long work", all(not b["key"].startswith("reader:") for b in e["behind"]), e["behind"])
frames_job.JOBS["clip"]["done"] = 0
e = wg.estimate("reader", {})
check("a batch with no shot drawn yet: its time not known, said so (not 0)", e["known"] is False and e["wait_s"] == 900, e)
frames_job.JOBS.clear()
ACT[:] = []
HOLDER[0] = None
e = wg.estimate("reader", {})
check("nothing holds the turn, nothing to wait for a card: 0, known", e["wait_s"] == 0 and e["known"] and not e["behind"], e)

# --- speech that must wait for a card nobody of the Studio holds (another program fills them): not known, never 0
class FakeReader:
    @staticmethod
    def _engine(eid):
        return {"id": eid, "tiers": [], "need_mb": 9000}

    @staticmethod
    def _held():
        return {}


def full(*a, **k):
    raise RuntimeError("no card can take this now")


wg.H.update(reader=FakeReader, free_gpu=full, kit=Path(tempfile.mkdtemp(prefix="waitguard-empty-")))
e = wg.estimate("reader", {"engine": "x", "card": "auto"})
check("speech waiting for cards another program fills: not known, said so", e["wait_s"] is None and not e["known"] and e["behind"][0]["key"] == "cards", e)
wg.H.update(kit=kit)
e = wg.estimate("reader", {"engine": "x", "card": "auto"})
check("speech waiting for a card: the first of the Studio's works on them to end (SeedVR2, about 100 s)", near(e["wait_s"], 100) and e["known"], e)
e = wg.estimate("reader", {"engine": "x", "card": "1"})
check("speech asking GPU1 waits for the first of GPU1's works: its H3 worker, about 510 s", near(e["wait_s"], 510) and e["known"] and e["where"] == "gpu1", e)
wg.H.update(reader=FakeReader, free_gpu=lambda *a, **k: (0, 20000))
e = wg.estimate("reader", {"engine": "x", "card": "auto"})
check("speech with a card free now: no wait", e["wait_s"] == 0 and e["where"] == "gpu", e)
wg.H.update(reader=None)

# --- music: the Studio on the Intel card waits behind no lab work; on GPU1 it waits behind the H3 worker there
STUDIO[0] = 100
e = wg.estimate("music", {})
check("music on the Intel card: no wait", e["wait_s"] == 0 and not e["behind"] and e["where"] == "arc", e)
STUDIO[0] = 1
e = wg.estimate("music", {})
check("music on GPU1: behind its H3 worker, about 510 s", near(e["wait_s"], 510) and [b["key"] for b in e["behind"]] == ["h3 gpu1"], e)
STUDIO[0] = 2
e = wg.estimate("music", {})
check("music on GPU2: an idle worker is no wait", e["wait_s"] == 0, e)
ACT[:] = [{"key": "train:run", "kind": "train", "status": "running", "gpu": "1+2", "what": "training"}]
e = wg.estimate("music", {})
check("music behind a training run with no ETA line: not known (never 0)", e["wait_s"] is None and e["known"] is False, e)
ACT[:] = []

# --- the holds
h = wg.hold({"kind": "music", "label": "Song A", "group": "g1", "wait_s": 1800})
check("a later speech job sees the music job waited for", (wg.held_for("reader") or {}).get("id") == h["id"])
check("the same song's other versions do not wait behind their own hold", wg.held_for("music", "g1") is None)
check("its own page asking does not see itself", wg.held_for("music", "", h["id"]) is None)
check("the page asking keeps it", wg.seen(h["id"]) == "held")
real = wg._now
wg._now = lambda: real() + wg.HOLD_IDLE_S + 5
check("a hold its page stopped asking about goes", wg.held_for("reader") is None)
wg._now = real
h = wg.hold({"kind": "music", "label": "Song B"})
out = wg.release({"id": h["id"], "cancel": True})
check("taken off the queue: released, and its page hears «cancelled»", out["released"] and wg.seen(h["id"]) == "cancelled", out)
check("a hold the lab does not know (it restarted): «gone», so the page holds again", wg.seen("nope") == "gone")
r = wg.hold({"kind": "reader", "label": "Chapter 1"})
wg.ref({"id": r["id"], "ref": "R1"})
JOBS["reader:R1"] = {"status": "queued"}
check("a Reader run waited for holds while it is queued", (wg.held_for("music") or {}).get("id") == r["id"])
gone = []
out = wg.release({"id": r["id"], "cancel": True}, cancel_job=lambda k: gone.append(k))
check("taken off: the queued Reader run is cancelled with it", gone == ["reader:R1"] and out.get("cancelled") == "R1", out)
r = wg.hold({"kind": "reader", "label": "Chapter 2"})
wg.ref({"id": r["id"], "ref": "R2"})
JOBS["reader:R2"] = {"status": "running"}
check("the Reader run began: the later ones go", wg.held_for("music") is None)
try:
    wg.estimate("other", {})
    check("an unknown kind refused", False)
except ValueError:
    check("an unknown kind refused", True)

print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
