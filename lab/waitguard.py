"""HERESY 2319 (Viktor 10.11.2026: «если все ресурсы заняты, не просто ставить в очередь… в очереди будет стоять генерация либо в музыканте, либо в
чтеце… очередь там час, ё-моё, это ненормально… ставить такого сторожа и реально уведомлять, что извиняй, это придётся целый час ждать. Либо ждём и
блокируем последующие очереди по музыке и ТТС, либо просто снимаем с очереди этот трек»): the wait guard, and the long works the lab's /health
did not see.

The long works: what holds the cards or the lab's heavy turn for long, each with how long it has left by its own progress: the Videographer's
MiniMax H3 workers (their shot's step, the shots queued on their card by the seconds per second of video their card has made), its SeedVR2 upscales
(the shots made of the job's), the Artist's runs (pictures and steps made), a plan's keyframes (frames_job: the shots drawn), the lab's other jobs
(their own expected time), the training runs (the trainer's own ETA). Unknown is said as unknown (None), never as 0.

    works()                       the long works now: [{key, room, what, label, cards, status, eta_s, heavy}]
    health_jobs()                 {key: status} for /health: running, queued, or idle (a worker that holds a card and waits for a shot)
    estimate(kind, q)             how long a music (the Studio's engine) or a speech (the Reader) job would wait now, and behind what
    hold(body) · ref(body) · release(body)   a job the user chose to wait for: the later music and speech wait behind it

HERESY 2320 (the lab restart at "jobs": {} that killed three H3 workers, 10.11.2026): /health lists the Videographer's workers and the Artist's
kept painters (health_jobs), so a reload that waits for the lab to be empty waits for them too; systemd kills the unit's whole cgroup."""
import json
import os
import threading
import time

import artist
import frames_job
import h3_shots
import upscale_shots

H = {}                     # kit, jobs, lock, act_now, turn_holder, studio_now, reader, free_gpu, job_roles
ARC_BASE = 100
H3_RATE = {"draft": 33.0, "final": 225.0}      # seconds of work a second of video, when a card has made none yet (draft: 29.8–37.6 on a 3090, 10.11;
                                               # final: ~45 min for a 12 s shot, 10.11)
IDLE_S = 600                                   # h3_shots._spawn's --idle: an idle worker leaves its card after it
TALK = ("reader", "section", "regen")          # music and speech themselves: never a «long work» another music or speech job waits behind
HOLD_IDLE_S = 90                               # a hold its page no longer asks about is let go
HOLDS, CANCELLED, LOCK = {}, {}, threading.Lock()


def setup(**parts):
    H.update(parts)


def _now():
    return time.time()


def _cards(gpu):
    """A job's cards from its gpu field: 1, "1+2", "cpu", "arc", None."""
    if isinstance(gpu, bool) or gpu is None:
        return []
    if isinstance(gpu, int):
        return [gpu]
    out = []
    for x in str(gpu).split("+"):
        x = x.strip()
        if x.isdigit():
            out.append(int(x))
    return out


def _json(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# ------------------------------------------------------------------ the Videographer's workers
def _h3_rate(sp, mode):
    """Seconds of work a second of video on this card's spool, by its last six shots of this mode; the measured default when it has none."""
    rows = []
    for f in sorted(list(sp.glob("*.set")) + list(sp.glob("*.done")) + list(sp.glob("*.aside")), key=lambda f: f.stat().st_mtime)[-24:]:
        j = _json(f)
        if j and j.get("mode") == mode and j.get("took_s") and j.get("seconds"):
            rows.append((float(j["took_s"]), float(j["seconds"])))
    rows = rows[-6:]
    if not rows:
        return H3_RATE.get(mode, H3_RATE["draft"])
    return sum(r[0] for r in rows) / max(0.1, sum(r[1] for r in rows))


def h3_works(kit):
    out = []
    root = h3_shots._root(kit)
    for sp in sorted(root.glob("gpu*-*")) if root.is_dir() else []:
        try:
            gpu = int(sp.name[3:].split("-", 1)[0])
        except ValueError:
            continue
        w = h3_shots._alive(sp)
        if not w:                                 # no worker: its records are history (a .json left with no worker runs nowhere)
            continue
        runs = list(sp.glob("*.run"))
        queued = [j for j in sp.glob("*.json") if j.name != "worker.json"]
        left = 0.0
        for r in runs:
            spec = _json(r) or {}
            mode = spec.get("mode") or "draft"
            took = _now() - r.stat().st_mtime
            step, steps = w.get("step"), w.get("steps")
            if w.get("job") == r.stem and step and steps and step >= 1:
                left += max(0.0, took / step * steps - took)
            else:
                left += max(0.0, _h3_rate(sp, mode) * float(spec.get("seconds") or 8) - took)
        for q in queued:
            spec = _json(q) or {}
            left += _h3_rate(sp, spec.get("mode") or "draft") * float(spec.get("seconds") or 8)
        status = "running" if runs or w.get("status") in ("loading", "busy") else "queued" if queued else "idle"
        if w.get("status") == "loading" and not runs and not queued:
            status = "running"                    # loading its model: a restart now throws its minute and a half away
        if status == "idle":                      # it leaves the card after its idle minutes (h3_worker --idle 600) from its last «ready»
            left = max(0.0, IDLE_S - (_now() - float(w.get("at") or _now())))
        out.append({"key": f"h3 gpu{gpu}", "room": "videographer", "what": "MiniMax H3", "label": "", "shots": len(runs) + len(queued),
                    "cards": [gpu], "status": status, "eta_s": round(left), "heavy": False})
    return out


def seedvr2_works(kit):
    out = []
    root = upscale_shots._root(kit)
    for jd in sorted(root.glob("*--*")) if root.is_dir() else []:
        if not upscale_shots._alive(jd):
            continue
        job = _json(jd / "job.json") or {}
        items = job.get("items") or []
        made = len(list((jd / "out").glob("*.mp4"))) if (jd / "out").is_dir() else 0
        took = _now() - float(job.get("queued") or _now())
        frames = sum(int(x.get("frames") or 0) for x in items)
        eta = None
        if made and frames:                       # the shots made, by their frames (the job takes them in its own order: the made ones' frames
            made_names = {p.stem for p in (jd / "out").glob("*.mp4")}   # are known by name)
            done_frames = sum(int(x.get("frames") or 0) for x in items if f"{int(x['i']):03d}" in made_names)
            if done_frames:
                eta = round(took / done_frames * max(0, frames - done_frames))
        elif made and items:
            eta = round(took / made * max(0, len(items) - made))
        out.append({"key": "seedvr2 " + jd.name, "room": "videographer", "what": "SeedVR2", "label": str(job.get("name") or ""), "made": made, "of": len(items),
                    "cards": [int(job["gpu"])] if str(job.get("gpu", "")).isdigit() else [], "status": "running", "eta_s": eta, "heavy": False})
    return out


def frames_works():
    out = []
    with frames_job.LOCK:
        rows = [(k, dict(v)) for k, v in frames_job.JOBS.items() if v.get("state") == "running"]
    for name, j in rows:
        done, total = int(j.get("done") or 0), int(j.get("total") or 0)
        took = _now() - float(j.get("started") or _now())
        eta = round(took / done * max(0, total - done)) if done else None
        out.append({"key": "frames " + name, "room": "videographer", "what": "keyframes (the Artist)", "label": name, "made": done, "of": total,
                    "cards": [], "status": "running", "eta_s": eta, "heavy": True, "batch": True})
    return out


def kept_works():
    """The Artist's kept painters: idle ones hold a card's worth of weights in RAM (a restart costs their load, nothing made); a busy one's run is
    in the jobs already."""
    out = []
    for s in artist.kept():
        try:
            alive = s.alive()
        except Exception:  # noqa: BLE001
            alive = False
        if alive and not s.busy:
            out.append({"key": f"painter gpu{s.gpu}", "room": "artist", "what": "a kept painter", "label": s.painter or "", "cards": [s.gpu],
                        "status": "idle", "eta_s": 0, "heavy": False})
    return out


# ------------------------------------------------------------------ the lab's own jobs
def _artist_left(rid, row):
    run = artist.read(artist.run_dir(rid)) or {}
    began, of = run.get("began"), int(run.get("of") or 0)
    if not began or not of:
        return None
    lives = run.get("lives") or ([run["live"]] if run.get("live") else [])
    part = sum(float(x.get("step") or 0) / float(x.get("of") or 1) for x in lives if x.get("of"))
    f = (len(run.get("pictures") or []) + part) / of
    if f < 0.03:
        return None
    took = _now() - float(began)
    return max(0.0, took / f - took)


def job_works():
    out = []
    holder = H["turn_holder"]() if H.get("turn_holder") else None
    for r in H["act_now"]():
        kind = r.get("kind") or r["key"].split(":", 1)[0]
        if kind in TALK:
            continue
        eta = None
        if kind == "train":
            eta = r.get("eta")
        elif r.get("status") == "running" and kind == "artist":
            eta = _artist_left(r["key"].split(":", 1)[1], r)
        elif r.get("status") == "running" and r.get("expect") and r.get("elapsed") is not None:
            eta = max(0.0, float(r["expect"]) - float(r["elapsed"]))
        room = {"artist": "artist", "art": "artist", "video": "videographer", "train": "training", "listen": "training"}.get(kind, "lab")
        out.append({"key": r["key"], "room": room, "what": r.get("what") or kind, "label": r.get("label") or r.get("name") or "",
                    "cards": _cards(r.get("gpu")), "status": r.get("status") or "running", "eta_s": round(eta) if eta is not None else None,
                    "heavy": holder is not None and holder == r["key"], "queued": r.get("status") == "queued"})
    return out


def works():
    kit = H["kit"]
    out = []
    for f in (lambda: h3_works(kit), lambda: seedvr2_works(kit), frames_works, kept_works, job_works):
        try:
            out += f()
        except Exception as e:  # noqa: BLE001 — one odd record must not blind the guard: said as a work of unknown length
            out.append({"key": "unread " + getattr(f, "__name__", "?"), "room": "lab", "what": "a work the guard could not read", "label": str(e)[:120],
                        "cards": [], "status": "running", "eta_s": None, "heavy": False})
    return out


def health_jobs():
    """HERESY 2320: the workers and the kept painters /health did not see, {key: status}."""
    kit = H["kit"]
    out = {}
    for f in (lambda: h3_works(kit), lambda: seedvr2_works(kit), frames_works, kept_works):
        try:
            for w in f():
                out[w["key"]] = w["status"]
        except Exception:  # noqa: BLE001 — never «empty» because a record could not be read: said running
            out["unread"] = "running"
    return out


# ------------------------------------------------------------------ the estimate
def _fmt(ws):
    return [{k: w.get(k) for k in ("key", "room", "what", "label", "cards", "status", "eta_s", "shots", "made", "of") if k in w} for w in ws]


def _soonest(ws):
    """The first of these to end (a card comes free when one leaves): (seconds, known)."""
    known = [w["eta_s"] for w in ws if w.get("eta_s") is not None]
    if not known:
        return None, False
    return min(known), len(known) == len(ws)


def _latest(ws):
    """The last of these to end (all of them hold what is needed): (seconds, known)."""
    known = [w["eta_s"] for w in ws if w.get("eta_s") is not None]
    if len(known) != len(ws):
        return (max(known) if known else None), False
    return (max(known) if known else 0), True


def _reader_needs(q):
    """Where the Reader would read this run now: ("cpu" | "xpu" | "cuda", the card asked or None, it must wait for a card)."""
    rd = H.get("reader")
    if rd is None:
        return "cpu", None, False
    card = str(q.get("card") or "auto")
    if card not in ("auto", "cpu"):
        try:
            card = int(card)
        except ValueError:
            card = "auto"
    if card == "cpu" or (isinstance(card, int) and card >= ARC_BASE):
        return ("cpu" if card == "cpu" else "xpu"), (None if card == "cpu" else card), False
    try:
        eng = rd._engine(str(q.get("engine") or ""))
    except ValueError:
        return "cpu", None, False
    if eng.get("tiers"):
        try:
            pick = rd.tier_pick(eng, str(q.get("tier") or "auto-speed"), card)
        except ValueError:
            return "cuda", (None if card == "auto" else card), True
        if pick["card"] == "cpu":
            return "cpu", None, False
        return "cuda", pick["card"], bool(pick["wait"])
    try:
        H["free_gpu"](eng["need_mb"], why="the wait guard", only=None if card == "auto" else card, claim=False, unload=False, held=rd._held())
        return "cuda", None if card == "auto" else card, False
    except RuntimeError:
        return "cuda", None if card == "auto" else card, True


def estimate(kind, q):
    """{kind, wait_s (None: not known), known, behind [the works it waits behind], where, held (a job the user chose to wait for, by another ask)}"""
    ws = works()
    behind, wait, known, where = [], 0, True, ""
    if kind == "reader":
        dev, card, card_wait = _reader_needs(q)
        where = "cpu" if dev == "cpu" else "arc" if dev == "xpu" else (f"gpu{card}" if card is not None else "gpu")
        parts = []
        if card_wait:                              # a card: the first of the works on the cards it may read on to leave
            roles = set(H["job_roles"]() or []) if H.get("job_roles") else set()
            mine = {card} if card is not None else roles
            on = [w for w in ws if w["cards"] and (not mine or set(w["cards"]) & mine)]
            if not on:                             # full, and none of the Studio's own works holds them: another program (a training of its own,
                on = [{"key": "cards", "room": "other", "what": "other programs on the cards", "label": "",   # a chat server): how long is not
                       "cards": sorted(mine), "status": "running", "eta_s": None}]                        # known, never said as 0
            behind += on
            parts.append(_soonest(on))
        heavy = [w for w in ws if w.get("heavy") or w.get("batch") or (w.get("queued") and w["room"] != "training")]
        if heavy:                                  # the lab's one heavy turn: what holds it, a batch that takes it again, the jobs queued for it
            hold_ = [w for w in heavy if not w.get("queued")]
            t, k = _latest(hold_) if hold_ else (0, True)
            ahead = [w for w in heavy if w.get("queued")]
            k = k and all(w.get("eta_s") is not None for w in ahead)
            t = None if t is None else t + sum(w["eta_s"] or 0 for w in ahead)
            behind += [w for w in heavy if w not in behind]
            parts.append((t, k))
        vals = [p[0] for p in parts if p[0] is not None]
        wait = max(vals) if vals else (None if parts else 0)
        known = all(p[1] for p in parts) and all(p[0] is not None for p in parts)
    elif kind == "music":
        studio = H["studio_now"]() if H.get("studio_now") else None
        if studio is None or studio >= ARC_BASE:   # the Studio on the Intel card (or not running): no lab work takes that card
            where = "arc" if studio is not None else "none"
        else:
            where = f"gpu{studio}"
            on = [w for w in ws if studio in w["cards"] and w["status"] != "idle"]
            if on:
                wait, known = _latest(on)
                behind += on
    else:
        raise ValueError("music or reader")
    if not behind:
        wait, known = 0, True
    behind = [w for w in behind if w["status"] != "idle" or w.get("eta_s")]
    return {"kind": kind, "wait_s": None if wait is None else int(round(wait)), "known": bool(known), "behind": _fmt(behind), "where": where,
            "held": held_for(kind, q.get("group") or "", q.get("hold") or ""), "at": _now()}


# ------------------------------------------------------------------ the holds
def _alive_hold(h):
    if h.get("ref"):
        rd_key = "reader:" + h["ref"]
        with H["lock"]:
            job = H["jobs"].get(rd_key)
        return bool(job) and job.get("status") == "queued"       # it began (or ended, or was taken off): the later ones go
    return _now() - h["seen"] < HOLD_IDLE_S


def holds():
    with LOCK:
        for k in [k for k, h in HOLDS.items() if not _alive_hold(h)]:
            HOLDS.pop(k, None)
        return [dict(h) for h in sorted(HOLDS.values(), key=lambda h: h["at"])]


def held_for(kind, group="", own=""):
    """The first job the user chose to wait for that a new music or speech job would wait behind (not its own group's, not its own hold)."""
    for h in holds():
        if h["id"] == own or (group and h.get("group") == group):
            continue
        return {k: h.get(k) for k in ("id", "kind", "label", "wait_s", "at", "ref")}
    return None


def hold(body):
    kind = str(body.get("kind") or "")
    if kind not in ("music", "reader"):
        raise ValueError("music or reader")
    hid = str(body.get("id") or "") or time.strftime("%H%M%S-") + os.urandom(3).hex()
    with LOCK:
        old = HOLDS.get(hid, {})
        HOLDS[hid] = {"id": hid, "kind": kind, "label": " ".join(str(body.get("label") or "").split())[:120], "group": str(body.get("group") or "")[:80],
                      "wait_s": body.get("wait_s"), "at": old.get("at") or _now(), "seen": _now(), "ref": old.get("ref") or str(body.get("ref") or "")}
        CANCELLED.pop(hid, None)
    return {"id": hid}


def seen(hid):
    """A page waiting with its hold asks again: the hold kept alive; 'cancelled' when taken off, 'gone' when the lab no longer knows it."""
    with LOCK:
        if hid in CANCELLED:
            return "cancelled"
        h = HOLDS.get(hid)
        if not h:
            return "gone"
        h["seen"] = _now()
        return "held"


def ref(body):
    hid, rid = str(body.get("id") or ""), str(body.get("ref") or "")
    with LOCK:
        h = HOLDS.get(hid)
        if not h:
            raise ValueError("no such hold")
        h["ref"], h["seen"] = rid, _now()
    return {"id": hid, "ref": rid}


def release(body, cancel_job=None):
    """A hold let go: its job went (sent, or the page gave up), or taken off the queue (cancel: a Reader run waiting is cancelled too)."""
    hid = str(body.get("id") or "")
    with LOCK:
        h = HOLDS.pop(hid, None)
        if body.get("cancel"):
            CANCELLED[hid] = _now()
            for k in [k for k, t in CANCELLED.items() if _now() - t > 3600]:
                CANCELLED.pop(k, None)
    out = {"id": hid, "released": bool(h)}
    if h and body.get("cancel") and h.get("ref") and cancel_job:
        try:
            cancel_job("reader:" + h["ref"])
            out["cancelled"] = h["ref"]
        except (ValueError, FileNotFoundError) as e:
            out["error"] = str(e)
    return out
