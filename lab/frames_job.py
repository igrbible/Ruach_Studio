"""HERESY 1913 (Viktor 30.10.2026: «Если тебе нужны ещё сутки для доведения Видеографа до работоспособного состояния, используй Видеокарты как
нужно»; «Картинки отличные Квен рисует. 2512, мне кажется лучше, чем 2.1… Отрисуй с 2512 и сравним»): the Artist draws a plan's shots itself, each
picture set into its shot as it comes, so a clip no longer waits for a hand on every 🎨.

A shot with the clip's hero (the plan's «hero»: one Artist picture of the person, the same face through the clip) is drawn by Qwen-Image 2.1 from
that picture, its look kept and the scene from the shot's words (ref_as «style»; probed 30.10: the face, beard and shirt held on a new stage), then
gone over by Qwen-Image 2512 at strength 0.35 (its light and texture, the face and the framing kept; at 0.5 the face began to drift). A shot without
the hero (the music alone, a landscape, a detail) is 2512's from words. Each shot's seed is the plan's seed and its number, so a shot drawn again comes
the same unless asked otherwise; 16:9. Two shots at a time (the Artist's own limit of two runs), each run on the card its guard gives; a run of the
user's own in the way is waited for. What a run made is put into the shot by videographer.frame_set (the picture it replaces put off, kept).

    start(kit, name, shots, prompts, heroes, refine)   a plan's drawing, in a thread: shots [i], prompts {i: words}, heroes [i] (with the hero)
    status(kit, name) · cancel(kit, name)              where it stands · the rest of the shots left undrawn (the ones drawing finish)
    hero_set(kit, name, run, file) · hero_off(kit, name)   the plan's hero, an Artist picture"""
import random
import threading
import time
from pathlib import Path

import artist
import videographer as vg

WORDS, HERO, POLISH = "qwen2512-q6", "qwen21", "qwen2512-q6"
REFINE = 0.35
# HERESY 1915 (Viktor 30.10.2026: «лучше к 2512 прикручивать LoRA реализма, чтобы меньше пластика было на коже»): 2512's passes with the skin detailer
# and film photography (probed 30.10 on the hero's stage: pores, lines and the shirt's weave come back, the face is the same), each only where its file is
REAL = (("qwen-image-2512/PUBLIC/Jibs Qwen Skin Detailer _ Imperfections v1.safetensors", 0.8), ("qwen-image-2512/PUBLIC/Film Photography v1.safetensors", 0.5))
LEAD = "The same person as in the reference picture: the same face, hair, beard and build. "
JOBS, LOCK, SET = {}, threading.Lock(), threading.Lock()      # SET: one picture written into a plan at a time


def hero_set(kit, name, run, file):
    """The plan's hero: an Artist picture (it must exist)."""
    artist.picture(str(run), str(file))
    plan = vg.get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    plan["hero"] = {"run": str(run), "file": str(file)}
    plan.pop("exists", None)
    vg._write(kit, name, plan)
    return vg.get(kit, name)


def hero_off(kit, name):
    plan = vg.get(kit, name)
    if plan.get("exists") and plan.pop("hero", None) is not None:
        plan.pop("exists", None)
        vg._write(kit, name, plan)
    return vg.get(kit, name)


def _real(kit):
    """The realism adapters that are on this machine, as a run asks for them."""
    root = Path(kit) / "artwork" / "loras"
    return [{"id": i, "weight": w} for i, w in REAL if (root / i).is_file()]


def _wait(rid, job):
    """A run until it ends: its record, or None when the job was cancelled while it waited for a card."""
    while True:
        r = artist.read(artist.run_dir(rid)) or {}
        if r.get("status") in ("done", "failed", "stopped"):
            return r
        if job.get("cancel") and r.get("status") == "queued":
            try:
                artist.stop(rid)
            except ValueError:
                pass
        time.sleep(3)


def _draw(body, job):
    """artist.draw, waiting while two runs (one of them perhaps the user's) are going; the run's record when it ends."""
    while True:
        if job.get("cancel"):
            return None
        try:
            rid = artist.draw(body)["id"]
            break
        except ValueError as e:
            if "two runs at a time" not in str(e):
                raise
            time.sleep(10)
    r = _wait(rid, job)
    if r.get("status") != "done" or not r.get("pictures"):
        raise RuntimeError(r.get("error") or f"the Artist's run {rid} ended {r.get('status')}")
    return r


def _one(kit, name, i, prompt, hero, refine, seed, job):
    plan = vg.get(kit, name)
    h = plan.get("hero") if hero else None
    if h:
        r = _draw({"prompt": (LEAD + prompt)[:artist.PROMPT_MAX], "shapes": ["16:9"], "count": 1, "painter": HERO, "seed": seed,
                   "ref": {"id": h["run"], "file": h["file"]}, "ref_as": "style", "strength": 0.6}, job)
        if r and refine:
            p = r["pictures"][0]["file"]
            r = _draw({"prompt": prompt[:artist.PROMPT_MAX], "shapes": ["16:9"], "count": 1, "painter": POLISH, "seed": seed,
                       "ref": {"id": r["id"], "file": p}, "strength": refine, "loras": _real(kit)}, job)
    else:
        r = _draw({"prompt": prompt[:artist.PROMPT_MAX], "shapes": ["16:9"], "count": 1, "painter": WORDS, "seed": seed, "loras": _real(kit)}, job)
    if not r:
        return False
    f = r["pictures"][0]["file"]
    with SET:
        vg.frame_set(kit, name, i, artist.picture(r["id"], f)[0], {"run": r["id"], "file": f, "by": "frames", "hero": bool(h)})
    return True


def _worker(kit, name, job):
    while True:
        with LOCK:
            if job.get("cancel") or not job["todo"]:
                job["workers"] -= 1
                if not job["workers"]:
                    job["state"] = "stopped" if job.get("cancel") else ("failed" if job["errors"] and not job["done"] else "done")
                    job["ended"] = time.time()
                return
            i = job["todo"].pop(0)
            job["drawing"].append(i)
        try:
            if _one(kit, name, i, job["prompts"].get(i, ""), i in job["heroes"], job["refine"], job["seed"] + i, job):
                with LOCK:
                    job["done"] += 1
        except Exception as e:  # noqa: BLE001
            with LOCK:
                job["errors"].append({"i": i, "error": str(e)[:300]})
        finally:
            with LOCK:
                job["drawing"].remove(i)


def start(kit, name, shots, prompts, heroes, refine=REFINE, seed=None):
    plan = vg.get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    n = len(plan["shots"])
    shots = [int(i) for i in shots if 0 <= int(i) < n]
    if not shots:
        raise ValueError("no shot to draw")
    for i in shots:
        if not str(prompts.get(str(i)) or prompts.get(i) or "").strip():
            raise ValueError(f"shot {i + 1} has nothing to draw: write its scene first")
    if not plan.get("seed"):                              # the plan's own seed, kept: a shot drawn again comes the same
        plan["seed"] = int(seed) if seed is not None else random.randint(1000, 999999)
        plan.pop("exists", None)
        vg._write(kit, name, plan)
    heroes = {int(i) for i in heroes or []}
    if heroes & set(shots) and not plan.get("hero"):
        raise ValueError("the hero's picture first: pick it in «The look of the clip»")
    with LOCK:
        old = JOBS.get(name)
        if old and old["state"] == "running":
            raise ValueError("this plan's shots are being drawn already")
        job = {"state": "running", "todo": list(shots), "total": len(shots), "done": 0, "drawing": [], "errors": [], "workers": 2,
               "prompts": {int(i): str(prompts.get(str(i)) or prompts.get(i)) for i in shots}, "heroes": heroes,
               "refine": float(refine) if refine else 0.0, "seed": int(seed) if seed is not None else int(plan["seed"]),
               "started": time.time()}
        JOBS[name] = job
    for _ in range(2):
        threading.Thread(target=_worker, args=(kit, name, job), daemon=True).start()
    return status(kit, name)


def status(kit, name):
    with LOCK:
        j = JOBS.get(name)
        if not j:
            return {"state": "", "total": 0, "done": 0, "drawing": [], "errors": []}
        return {k: (sorted(v) if isinstance(v, set) else list(v) if isinstance(v, list) else v) for k, v in j.items() if k not in ("prompts", "todo")} | {"left": len(j["todo"])}


def cancel(kit, name):
    with LOCK:
        j = JOBS.get(name)
        if j and j["state"] == "running":
            j["cancel"] = True
            j["todo"].clear()
    return status(kit, name)
