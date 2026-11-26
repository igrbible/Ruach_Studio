"""HERESY 2982 (the plan's open row «Ночная очередь рендера. Спроектирована, проверка на живой карте»; VIDEOGRAPHER-PLAN.md, phase C: «Проект
клипа как документ с историей; ночная очередь рендера»; «Буратино» of 10.11 took five hours of stages started one after another by hand): a clip's
whole render as one order the lab runs by itself, tonight or now, on the free cards of the lab's jobs. Its stages, each only when asked and each
over every free card by the room's own machinery:

    frames    the shots with no picture yet drawn by the Artist (frames_job: the hero's by Qwen-Image 2.1, then 2512 over them with the rest,
              every free card at once, a painter loaded once a card)
    shoot     the shots with no video yet shot by MiniMax H3 (h3_shots: a worker a free card, the lab's collector spreading the queue)
    upscale   the shots with a video and no upscale made larger by SeedVR2 (upscale_shots: dealt over the free cards, idle H3 workers sent away)
    clip      the clip cut with the room's settings as they were when the order was given (the lab's clip job); after an upscale stage it takes
              SeedVR2's videos, as the room's «Upscale» sets it to

The page sends what its own buttons would send (the prompts it writes for the Artist and for H3, the hero's shots, the mode, the clip's
settings); what each stage has to do is counted when it begins, from the plan as it is then, so an order run again does only what is missing.
The queue is user/videos/.night/queue.json: it outlives a reload and a restart of the lab (an order a restart cut off goes again from what is
missing). One order at a time, in the order given; «at» (HH:MM, the lab's clock) holds an order until that time comes, else it goes at once. A
stage that fails is said in the order's log and the next ones go on with what there is (a clip of pictures where a shot has no video); taking
an order off while it runs stops its stage as the room's own Stop does.

    add(kit, name, order) · drop(kit, name) · listing(kit)
    start(kit, ops)   the runner, a thread; ops: more_gpus(need, most, exclude), clip(name, body), clip_job(name, body), say(text)
    run_one(kit, ops) one pass of the runner (the tests)"""
import json
import os
import re
import threading
import time
from pathlib import Path

import frames_job
import h3_shots
import upscale_shots
import videographer as vg

POLL = float(os.environ.get("VG_NIGHT_POLL_S") or 15)    # how often a stage's progress is looked at, s
CARDS_WAIT = float(os.environ.get("VG_NIGHT_CARDS_S") or 60)   # how long to wait before asking again for a card the night's other jobs hold
KEEP_DONE = 20                                           # finished orders kept for the room's list
STAGES = ("frames", "shoot", "upscale", "clip")
AT_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
LOCK = threading.RLock()
RUN = {"name": None, "cancel": False}                    # the order going now and whether it was taken off


def _file(kit):
    d = Path(kit) / "user" / "videos" / ".night"
    d.mkdir(parents=True, exist_ok=True)
    return d / "queue.json"


def _read(kit):
    try:
        q = json.loads(_file(kit).read_text(encoding="utf-8"))
        if isinstance(q.get("orders"), list) and isinstance(q.get("done"), list):
            return q
    except (OSError, ValueError, AttributeError):
        pass
    return {"orders": [], "done": []}


def _write(kit, q):
    f = _file(kit)
    tmp = f.with_suffix(".part")
    tmp.write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def due_of(at, now=None):
    """The moment an order given «at» HH:MM goes: that time today if it is still to come, else tomorrow; now when «at» is empty."""
    now = time.time() if now is None else now
    if not at:
        return now
    m = AT_RE.match(str(at).strip())
    if not m:
        raise ValueError("the hour to start: HH:MM, or none for now")
    lt = time.localtime(now)
    t = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, int(m.group(1)), int(m.group(2)), 0, 0, 0, -1))
    if t <= now:
        lt2 = time.localtime(now + 86400)
        t = time.mktime((lt2.tm_year, lt2.tm_mon, lt2.tm_mday, int(m.group(1)), int(m.group(2)), 0, 0, 0, -1))
    return t


def _prompts(d):
    out = {}
    for k, v in ((d or {}).get("prompts") or {}).items():
        if str(k).isdigit() and str(v or "").strip():
            out[str(int(k))] = str(v).strip()
    return out


def clean(plan, order, check_clip=None):
    """The order as kept: only the stages asked, each checked against the plan and the room's own choices (ValueError says what is wrong)."""
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    n = len(plan["shots"])
    out = {}
    f = order.get("frames")
    if f:
        p = {k: v for k, v in _prompts(f).items() if int(k) < n}
        if not p:
            raise ValueError("the Artist's stage: no shot's words to draw from")
        heroes = sorted({int(i) for i in f.get("heroes") or [] if str(i).isdigit() and str(int(i)) in p})
        if heroes and not plan.get("hero"):
            raise ValueError("the hero's picture first: pick it in «The look of the clip»")
        out["frames"] = {"prompts": p, "heroes": heroes, "refine": float(f["refine"]) if f.get("refine") is not None else frames_job.REFINE}
    s = order.get("shoot")
    if s:
        p = {k: v for k, v in _prompts(s).items() if int(k) < n}
        mode, size = str(s.get("mode") or "draft"), str(s.get("size") or "16:9")
        if mode not in h3_shots.MODES:
            raise ValueError("H3's stage: draft, fast or final")
        if size not in h3_shots.SIZES[mode]:
            raise ValueError("H3's stage: 16:9, 9:16 or 1:1")
        if not p:
            raise ValueError("H3's stage: no shot's words to shoot from")
        out["shoot"] = {"prompts": p, "mode": mode, "size": size}
    u = order.get("upscale")
    if u:
        model, res = str(u.get("model") or "7b"), int(u.get("res") or 1080)
        if model not in upscale_shots.MODELS or res not in upscale_shots.RES:
            raise ValueError("SeedVR2's stage: " + ", ".join(upscale_shots.MODELS) + "; 720, 1080 or 1440")
        out["upscale"] = {"model": model, "res": res}
    c = order.get("clip")
    if c:
        if not isinstance(c, dict):
            raise ValueError("the clip's stage: its settings as the room sends them")
        c = dict(c)
        if out.get("upscale"):                           # as the room's «Upscale» does: asked for, so the clip takes them
            c["upscale"] = "seedvr2"
        if check_clip:
            check_clip(c)
        out["clip"] = c
    if not out:
        raise ValueError("nothing to do: choose at least one stage")
    return out


def add(kit, name, order, check_clip=None, now=None):
    """An order for a take's plan into the queue (one a take: a waiting one is replaced, a running one refused). The queue."""
    plan = vg.get(kit, name)
    stages = clean(plan, order or {}, check_clip)
    at = str((order or {}).get("at") or "").strip()
    due = due_of(at, now)
    with LOCK:
        q = _read(kit)
        old = next((o for o in q["orders"] if o["name"] == name), None)
        if old and old.get("state") == "running":
            raise ValueError("this take's night render is going now: take it off first")
        q["orders"] = [o for o in q["orders"] if o["name"] != name]
        q["orders"].append(dict(stages, name=name, at=at, due=due, state="waiting", added=time.time(), log=[]))
        _write(kit, q)
    return listing(kit)


def drop(kit, name):
    """A take's order off the queue; a running one stops its stage as the room's Stop does (what was made is kept). The queue."""
    with LOCK:
        q = _read(kit)
        o = next((o for o in q["orders"] if o["name"] == name), None)
        if o is None:
            return listing(kit)
        if o.get("state") == "running" and RUN.get("name") == name:
            RUN["cancel"] = True
        else:
            q["orders"] = [x for x in q["orders"] if x["name"] != name]
            _write(kit, q)
    return listing(kit)


def listing(kit):
    with LOCK:
        q = _read(kit)
    now = time.time()
    for o in q["orders"]:
        o["in_s"] = max(0, round(o.get("due", now) - now)) if o.get("state") == "waiting" else 0
    return {"orders": q["orders"], "done": q["done"], "going": RUN.get("name")}


def _save(kit, order):
    with LOCK:
        q = _read(kit)
        q["orders"] = [order if o["name"] == order["name"] else o for o in q["orders"]]
        _write(kit, q)


def _finish(kit, order):
    with LOCK:
        q = _read(kit)
        q["orders"] = [o for o in q["orders"] if o["name"] != order["name"]]
        q["done"] = ([order] + q["done"])[:KEEP_DONE]
        _write(kit, q)


class Stopped(Exception):
    pass


def _nap(s):
    end = time.time() + s
    while time.time() < end:
        if RUN.get("cancel"):
            raise Stopped()
        time.sleep(min(1.0, max(0.0, end - time.time())))


def _shots(kit, name):
    plan = vg.get(kit, name)
    if not plan.get("exists"):
        raise ValueError("the take's plan is gone")
    return plan["shots"]


def stage_frames(kit, o, ops):
    """The shots with no picture drawn (frames_job, every free card): their count drawn and the failures. A drawing of this plan already going
    (the room's own) is waited for first."""
    name, f = o["name"], o["frames"]
    while frames_job.status(kit, name).get("state") == "running":
        _nap(POLL)
    shots = _shots(kit, name)
    todo = [i for i, s in enumerate(shots) if not s.get("frame") and str(i) in f["prompts"]]
    if not todo:
        return {"did": 0, "todo": 0}
    plan = vg.get(kit, name)
    heroes = [i for i in f["heroes"] if i in todo] if plan.get("hero") else []
    said = [] if plan.get("hero") or not f["heroes"] else ["the hero's picture was taken off: his shots drawn from their words"]
    frames_job.start(kit, name, todo, {str(i): f["prompts"][str(i)] for i in todo}, heroes, f.get("refine", frames_job.REFINE))
    try:
        while frames_job.status(kit, name).get("state") == "running":
            _nap(POLL)
    except Stopped:
        frames_job.cancel(kit, name)
        raise
    s = frames_job.status(kit, name)
    return {"did": s.get("done", 0), "todo": len(todo), "errors": s.get("errors") or [], "said": said, "took_s": s.get("elapsed")}


def _h3_busy(kit, name):
    """The plan's shots queued for H3, or being shot by a worker still alive (a shot left «running» by a worker that died is not waited for)."""
    st = h3_shots.status(kit, name)
    alive = {w["gpu"] for w in st.get("workers") or [] if w.get("alive")}
    return {j["i"] for j in st["jobs"] if j["state"] == "queued" or (j["state"] == "running" and j.get("gpu") in alive)}


def stage_shoot(kit, o, ops):
    """The shots with no video shot by MiniMax H3 (draft unless asked), each into a card's queue (a free card given a worker, the lab's collector
    spreading the rest); waited for until none of the plan's is queued or running."""
    name, s = o["name"], o["shoot"]
    busy = _h3_busy(kit, name)
    shots = _shots(kit, name)
    todo = [i for i, x in enumerate(shots) if not x.get("video") and str(i) in s["prompts"] and i not in busy]
    t0, left, said = time.time(), list(todo), []
    try:
        while left:
            cards = ops["more_gpus"](h3_shots.need_mb(s["mode"]), 3, ())
            try:
                while left:
                    j = h3_shots.shoot(kit, name, left[0], s["prompts"][str(left[0])], s["mode"], cards, None, True, s["size"])
                    if j.get("said") and j["said"] not in said:   # HERESY 2995: a plan that asked 2361's last frame, told so in the order's log
                        said.append(j["said"])
                    left.pop(0)
            except RuntimeError:                         # no card free for H3 now (the night's other jobs): asked again
                _nap(CARDS_WAIT)
        while _h3_busy(kit, name):
            _nap(POLL)
    except Stopped:
        h3_shots.cancel(kit, name)
        raise
    shots = _shots(kit, name)
    made = [i for i in todo if shots[i].get("video")]
    errs = {j["i"]: j.get("error") or "failed" for j in h3_shots.status(kit, name)["jobs"] if j["state"] == "failed" and j["i"] in todo and j["i"] not in made}
    return {"did": len(made), "todo": len(todo), "errors": [{"i": i, "error": errs.get(i, "no video came")} for i in todo if i not in made],
            "took_s": round(time.time() - t0), **({"said": said} if said else {})}


def _up_busy(kit, name):
    out = set()
    for j in upscale_shots.status(kit, name)["jobs"]:
        if j["state"] == "running":
            out.update(j["shots"])
    return out


def stage_upscale(kit, o, ops):
    """The shots with a video and no upscale made larger by SeedVR2, dealt over the free cards (idle H3 workers sent away first, as the room's
    «Upscale all» does); waited for until each job ended and was set into its shots."""
    name, u = o["name"], o["upscale"]
    busy = _up_busy(kit, name)
    shots = _shots(kit, name)
    todo = [i for i, x in enumerate(shots) if x.get("video") and not x.get("video_up") and i not in busy]
    t0 = time.time()
    try:
        if todo:
            need = upscale_shots.need_mb(u["res"], u["model"])
            while True:
                cards = list(ops["more_gpus"](need, 3, ()))
                if len(cards) < 3 and h3_shots.release_idle(kit):
                    cards += list(ops["more_gpus"](need, 3 - len(cards), tuple(cards)))
                if cards:
                    upscale_shots.start(kit, name, todo, u["model"], u["res"], cards)
                    break
                _nap(CARDS_WAIT)
        while _up_busy(kit, name) or any(j["state"] == "done" for j in upscale_shots.status(kit, name)["jobs"]):
            _nap(POLL)
    except Stopped:
        upscale_shots.cancel(kit, name)
        raise
    shots = _shots(kit, name)
    made = [i for i in todo if shots[i].get("video_up")]
    errs = {}
    for j in upscale_shots.status(kit, name)["jobs"]:
        for i in j["shots"]:
            errs[i] = j.get("error") or j["state"]
    return {"did": len(made), "todo": len(todo), "errors": [{"i": i, "error": errs.get(i, "no upscale came")} for i in todo if i not in made],
            "took_s": round(time.time() - t0)}


def stage_clip(kit, o, ops):
    """The clip cut with the room's settings (the lab's clip job), waited for to its end."""
    name, body = o["name"], o["clip"]
    t0 = time.time()
    ops["clip"](name, dict(body))
    while True:
        j = ops["clip_job"](name, body)
        if not j or j.get("status") not in ("queued", "running"):
            break
        _nap(POLL)
    if j and j.get("status") == "failed":
        return {"did": 0, "todo": 1, "errors": [{"i": -1, "error": str(j.get("error") or "the clip failed")}], "took_s": round(time.time() - t0)}
    return {"did": 1, "todo": 1, "took_s": round(time.time() - t0)}


RUNNERS = {"frames": stage_frames, "shoot": stage_shoot, "upscale": stage_upscale, "clip": stage_clip}


def run_order(kit, o, ops):
    """An order's stages one after another, each said in its log as it ends; a stage that fails is said and the next ones go on."""
    say = ops.get("say") or (lambda s: None)
    o.update(state="running", began=time.time())
    o.pop("ended", None)
    _save(kit, o)
    say(f"the night render · {o['name']} · begins: " + ", ".join(k for k in STAGES if o.get(k)))
    try:
        for k in STAGES:
            if not o.get(k):
                continue
            o["stage"] = k
            _save(kit, o)
            try:
                r = RUNNERS[k](kit, o, ops)
            except Stopped:
                raise
            except Exception as e:  # noqa: BLE001 — said in the order's log, the next stages go on
                r = {"did": 0, "errors": [{"i": -1, "error": str(e)[:300]}]}
            o["log"].append(dict(r, stage=k, at=time.time()))
            _save(kit, o)
            say(f"the night render · {o['name']} · {k}: {r.get('did', 0)} of {r.get('todo', r.get('did', 0))}"
                + (f", {len(r['errors'])} failed" if r.get("errors") else ""))
        o["state"] = "failed" if o["log"] and all(x.get("errors") and not x.get("did") for x in o["log"]) else "done"   # errors said in the log
    except Stopped:
        o["state"] = "stopped"
        say(f"the night render · {o['name']} · taken off: its stage stopped, what was made kept")
    o.pop("stage", None)
    o["ended"] = time.time()
    _finish(kit, o)
    return o


def run_one(kit, ops, now=None):
    """The first waiting order whose time has come, run to its end; the order, or None when none is due."""
    now = time.time() if now is None else now
    with LOCK:
        q = _read(kit)
        o = next((x for x in q["orders"] if x.get("state") == "waiting" and x.get("due", 0) <= now), None)
        if o is None:
            return None
        RUN.update(name=o["name"], cancel=False)
    try:
        return run_order(kit, o, ops)
    finally:
        RUN.update(name=None, cancel=False)


def resume(kit):
    """At the lab's start: an order a restart cut off waits again (its stages go again from what is missing)."""
    with LOCK:
        q = _read(kit)
        n = 0
        for o in q["orders"]:
            if o.get("state") == "running":
                o.update(state="waiting", due=time.time())
                o.pop("stage", None)
                o["log"].append({"stage": "restart", "at": time.time(), "said": ["the lab restarted: begun again from what is missing"]})
                n += 1
        if n:
            _write(kit, q)
    return n


def loop(kit, ops, every=None):
    while True:
        try:
            run_one(kit, ops)
        except Exception as e:  # noqa: BLE001 — the runner must not die of one odd order
            (ops.get("say") or print)(f"the night render: {e}")
        time.sleep(every or POLL)


def start(kit, ops):
    resume(kit)
    t = threading.Thread(target=loop, args=(kit, ops), daemon=True)
    t.start()
    return t
