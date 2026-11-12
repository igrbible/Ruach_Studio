"""HERESY 1913 (Viktor 30.10.2026: «Если тебе нужны ещё сутки для доведения Видеографа до работоспособного состояния, используй Видеокарты как
нужно»; «Картинки отличные Квен рисует. 2512, мне кажется лучше, чем 2.1… Отрисуй с 2512 и сравним»): the Artist draws a plan's shots itself, each
picture set into its shot as it comes, so a clip no longer waits for a hand on every 🎨.

A shot with the clip's hero (the plan's «hero»: one Artist picture of the person, the same face through the clip) is drawn by Qwen-Image 2.1 from
that picture, its look kept and the scene from the shot's words (ref_as «style»; probed 30.10: the face, beard and shirt held on a new stage), then
gone over by Qwen-Image 2512 at strength 0.35 (its light and texture, the face and the framing kept; at 0.5 the face began to drift). A shot without
the hero (the music alone, a landscape, a detail) is 2512's from words. Each shot's seed is the plan's seed and its number, so a shot drawn again comes
the same unless asked otherwise; 16:9. HERESY 2322: the shots are drawn as batch runs (artist.draw_batch), each over every card of the lab's jobs
with room, a painter loaded once a card for its share: the hero's shots by 2.1 first, then 2512 over them with the shots from words in one run (the
plan of «Буратино», 10.11: forty runs one after another on one card, 2.1 loaded forty times, 100 minutes). A run of the user's own in the way is
waited for. What a run made is put into the shot by videographer.frame_set (the picture it replaces put off, kept), each as it comes.

    start(kit, name, shots, prompts, heroes, refine)   a plan's drawing, in a thread: shots [i], prompts {i: words}, heroes [i] (with the hero)
    status(kit, name) · cancel(kit, name)              where it stands · the rest of the shots left undrawn (the ones drawing finish)
    hero_set(kit, name, run, file) · hero_off(kit, name)   the plan's hero, an Artist picture"""
import json
import random
import re
import threading
import time
from pathlib import Path

import artist
import paths                                 # HERESY 2330: where the weights live
import videographer as vg

WORDS, HERO, POLISH = "qwen2512-q6", "qwen21", "qwen2512-q6"
REFINE = 0.35
# HERESY 1915 (Viktor 30.10.2026: «лучше к 2512 прикручивать LoRA реализма, чтобы меньше пластика было на коже»): 2512's passes with the skin detailer
# and film photography (probed 30.10 on the hero's stage: pores, lines and the shirt's weave come back, the face is the same), each only where its file is
REAL = (("qwen-image-2512/PUBLIC/Jibs Qwen Skin Detailer _ Imperfections v1.safetensors", 0.8), ("qwen-image-2512/PUBLIC/Film Photography v1.safetensors", 0.5))
LEAD = "The same person as in the reference picture: the same face, hair, beard and build. "
# HERESY 2356 (the diagnosis of «Буратино», 10.11.2026: the hero drifted, a median likeness of 0.82 in the key frames, 16 of 37 under 0.80): Qwen-Image
# 2.1 gets the hero's picture to EDIT (keep this very character, show it anew), no more as a «style» whose instruction said «Do not keep its subject»
# while the lead before it said «the same person… beard» (a beard on a wooden boy); on three shots of 10.11 the likeness went 0.76 → 0.82 so
EDIT_LEAD = ("Keep this exact character from the picture: the same face, the same eyes, the same nose, the same hair or headwear, the same clothes, "
             "colours and build. Show the character in a new scene, a new pose and a new framing: ")
JOBS, LOCK, SET = {}, threading.Lock(), threading.Lock()      # SET: one picture written into a plan at a time
# HERESY 2356: the hero picture's own words are the character's one line in every prompt: its prompt up to where the place, the pose or the photograph
# begin («Buratino, a life-sized boy puppet…, a defiant grin» of «…, standing in Carlo's tiny cupboard workshop…, gritty film photograph…»)
WHERE = re.compile(r"^(?:standing|sitting|seated|walking|running|leaning|kneeling|lying|crouching|posing|dancing|singing|rapping|playing|performing|"
                   r"seen|shown|framed|photographed|captured|in|at|on|inside|under|against|before|amid|among|beside|by|near|outside|behind|"
                   r"across|through|set in|lit by|background|backdrop|surrounded by)\b", re.I)
SHOT = re.compile(r"\b(?:photo(?:graph)?|film (?:photo\w*|grain|still)|still frame|cinematic|render(?:ed)?|digital art|illustration|oil painting|"
                  r"no text|8k|4k|bokeh|depth of field|close-up|wide shot|medium shot)\b", re.I)
# not human skin: the 2512 pass goes without the Skin Detailer (an adapter of human pores and lines, it pulled the wooden face towards a man's)
NOT_SKIN = re.compile(r"\b(?:wood(?:en)?|carved|puppet|marionette|doll|robot|android|cyborg|statue|sculpture|clay|plasticine|metal(?:lic)?|toy|"
                      r"plush|cartoon|animated|anime|creature|animal|dog|cat|fox|wolf|bear|bird|skeleton|mannequin|porcelain|figurine|stone|golem|"
                      r"alien|monster|lego|dragon)\b", re.I)


def hero_words(prompt):
    """HERESY 2356: the character's words of a hero picture's prompt (see WHERE): its parts by commas up to the first that says where, how
    posed or what kind of picture; a known lead taken off first. At most 600 characters."""
    s = " ".join(str(prompt or "").split())
    for lead in (LEAD, EDIT_LEAD):
        if s.startswith(lead):
            s = s[len(lead):]
    parts = [p.strip(" .") for p in re.split(r",\s*|;\s*|\.\s+", s) if p.strip(" .")]
    keep = []
    for p in parts:
        if keep and (WHERE.match(p) or SHOT.search(p)):
            break
        keep.append(p)
    return ", ".join(keep)[:600]


def human(hero):
    """HERESY 2356: whether the hero has a person's skin: as chosen (hero["human"]), else none of NOT_SKIN's words in his own."""
    if not isinstance(hero, dict):
        return True
    if isinstance(hero.get("human"), bool):
        return hero["human"]
    return not NOT_SKIN.search(str(hero.get("words") or ""))


def _hero_prompt(run, file):
    """The words a hero picture was drawn from: its own item's in a batch run, else the run's."""
    try:
        d = artist.run_dir(str(run))
        r = artist.read(d) or {}
        n = next((int(p.get("n") or 0) for p in r.get("pictures") or [] if p.get("file") == file), 0)
        ask = json.loads((d / "ask.json").read_text(encoding="utf-8")) if (d / "ask.json").is_file() else {}
        for x in ask.get("batch") or []:
            if int(x.get("n") or 0) == n:
                return str(x.get("prompt") or "")
        return str(r.get("prompt") or ask.get("prompt") or "")
    except (OSError, ValueError, StopIteration, AttributeError, KeyError, TypeError):
        return ""


def hero_fill(kit, name):
    """HERESY 2356: a plan whose hero was chosen before 2356 gets his own words once, read from his picture's prompt, so the page's prompts carry
    them (an empty line kept when none could be read: asked once). The plan."""
    plan = vg.get(kit, name)
    h = plan.get("hero")
    if not plan.get("exists") or not isinstance(h, dict) or "words" in h:
        return plan
    with vg.SETTING:
        plan = vg.get(kit, name)
        h = plan.get("hero")
        if isinstance(h, dict) and "words" not in h:
            h["words"] = hero_words(_hero_prompt(h.get("run"), h.get("file")))
            plan.pop("exists", None)
            vg._write(kit, name, plan)
            plan = vg.get(kit, name)
    return plan


def hero_set(kit, name, run, file):
    """The plan's hero: an Artist picture (it must exist). HERESY 2356: with its own words (hero_words of its prompt) and whether it has a
    person's skin (left to the words until chosen)."""
    artist.picture(str(run), str(file))
    plan = vg.get(kit, name)
    if not plan.get("exists"):
        raise ValueError("no plan for this take yet: Make the plan first")
    words = hero_words(_hero_prompt(run, file))
    was = plan.get("hero") if isinstance(plan.get("hero"), dict) else {}
    plan["hero"] = {"run": str(run), "file": str(file)}
    if was.get("last"):                                  # HERESY 2361: his last frame asked of the hero, kept for the next one
        plan["hero"]["last"] = True
    if words:
        plan["hero"]["words"] = words
    plan.pop("exists", None)
    vg._write(kit, name, plan)
    return vg.get(kit, name)


def hero_off(kit, name):
    plan = vg.get(kit, name)
    if plan.get("exists") and plan.pop("hero", None) is not None:
        plan.pop("exists", None)
        vg._write(kit, name, plan)
    return vg.get(kit, name)


def _real(kit, skin=True):
    """The realism adapters that are on this machine, as a run asks for them. HERESY 2356: skin False, without the Skin Detailer."""
    root = paths.at(paths.ARTIST_LORAS, kit)
    return [{"id": i, "weight": w} for i, w in REAL if (root / i).is_file() and (skin or "Skin Detailer" not in i)]


BATCH = 64                         # HERESY 2322: the pictures of one batch run at most (artist.BATCH_RUN_MAX)


def _run(body, job):
    """artist.draw_batch, waiting while two runs (one of them perhaps the user's) are going; the run's id, or None when cancelled meanwhile."""
    while True:
        if job.get("cancel"):
            return None
        try:
            return artist.draw(body)["id"]
        except ValueError as e:
            if "two runs at a time" not in str(e):
                raise
            time.sleep(10)


def _follow(rid, job, got):
    """A batch run until it ends, each picture handed to got(n, row) as it comes; the run's record at its end. Cancelled: the run stopped (what it
    finished is kept and set)."""
    seen, asked = set(), False
    while True:
        r = artist.read(artist.run_dir(rid)) or {}
        for p in sorted(r.get("pictures") or [], key=lambda p: int(p.get("n") or 0)):
            n = int(p.get("n") or 0)
            if n and n not in seen:
                seen.add(n)
                got(n, p)
        with LOCK:
            job["painted"] = len(seen)
            job["cards"] = r.get("gpus") or ([r["gpu"]] if r.get("gpu") is not None else [])
            if r.get("status") == "queued" and r.get("waiting"):
                job["waiting"] = r["waiting"]
            else:
                job.pop("waiting", None)
        if r.get("status") in ("done", "failed", "stopped"):
            return r
        if job.get("cancel") and not asked:
            try:
                artist.stop(rid)
            except ValueError:
                pass
            asked = True
        time.sleep(3)


def _set(kit, name, job, i, rid, row, hero):
    try:
        with SET:
            vg.frame_set(kit, name, i, artist.picture(rid, row["file"])[0], {"run": rid, "file": row["file"], "by": "frames", "hero": hero})
        with LOCK:
            job["done"] += 1
    except Exception as e:  # noqa: BLE001
        with LOCK:
            job["errors"].append({"i": i, "error": str(e)[:300]})


def _phase(job, step, painter, items, extra, put):
    """One step of the drawing: items [(shot, words, seed, reference or None)] as batch runs of one painter (BATCH at most each), every picture
    handed to put(shot, run, row) as it comes; a picture the content filter kept back, or a run that failed, said for its shots."""
    for k in range(0, len(items), BATCH):
        part = items[k:k + BATCH]
        if job.get("cancel") or not part:
            return
        with LOCK:
            job.update(step=step, of=len(part), painted=0, drawing=[x[0] for x in part], cards=[])
        try:
            rid = _run(dict(extra, painter=painter, by="videographer",
                            batch=[{"prompt": w[:artist.PROMPT_MAX], "seed": s, "ref": ref} for _, w, s, ref in part]), job)
        except Exception as e:  # noqa: BLE001
            with LOCK:
                job["errors"] += [{"i": x[0], "error": str(e)[:300]} for x in part]
                job["drawing"] = []
            continue
        if rid is None:
            return
        job["run"] = rid
        made = set()

        def got(n, row, part=part, rid=rid, made=made):
            i = part[n - 1][0]
            made.add(i)
            with LOCK:
                if i in job["drawing"]:
                    job["drawing"].remove(i)
            if row.get("kept") and row.get("file"):
                put(i, rid, row)
            else:
                with LOCK:
                    job["errors"].append({"i": i, "error": "the content filter kept the picture back"})
        r = _follow(rid, job, got)
        if r.get("status") == "failed":
            with LOCK:
                job["errors"] += [{"i": x[0], "error": str(r.get("error") or "the Artist's run failed")[:300]} for x in part if x[0] not in made]
        with LOCK:
            job["drawing"] = []


def _batch(kit, name, job):
    """HERESY 2322 (Viktor 10.11.2026: «держать художника загруженным… максимальная оптимизация ресурсов, а не просто на одной карте все херачить и
    перезагружать модели»): the shots drawn as two batch runs, each over every card of the lab's jobs with room, each card's painter loaded once:
    first the hero's shots by Qwen-Image 2.1 from the hero's picture, then 2512 over those (at «refine») together with the shots from words alone,
    one painter with the same adapters for both, so it is loaded once a card for all of them. Each picture is set into its shot as it comes."""
    try:
        plan = vg.get(kit, name)
        h = plan.get("hero")
        seed, refine = job["seed"], job["refine"]
        words = lambda i: job["prompts"].get(i, "")   # noqa: E731
        heroes = [i for i in job["todo"] if i in job["heroes"] and h]
        plain = [i for i in job["todo"] if i not in heroes]
        job["todo"] = []
        polish = []

        def from_hero(i, rid, row):
            if refine:
                polish.append((i, words(i), seed + i, {"id": rid, "file": row["file"]}))
            else:
                _set(kit, name, job, i, rid, row, True)
        if heroes:                                      # HERESY 2356: the hero's picture edited into each scene, his likeness kept
            _phase(job, "hero", HERO, [(i, EDIT_LEAD + words(i), seed + i, {"id": h["run"], "file": h["file"]}) for i in heroes],
                   {"ref_as": "edit", "strength": 0.6}, from_hero)
        second = sorted(polish) + [(i, words(i), seed + i, None) for i in plain]
        if second and not job.get("cancel"):
            hero_of = {x[0] for x in polish}
            job["skin"] = human(h) if h else True       # HERESY 2356: no Skin Detailer over a hero without a person's skin
            _phase(job, "paint", POLISH, second, {"strength": refine or 0.6, "loras": _real(kit, job["skin"])},
                   lambda i, rid, row: _set(kit, name, job, i, rid, row, i in hero_of))
    except Exception as e:  # noqa: BLE001
        with LOCK:
            job["errors"].append({"i": -1, "error": str(e)[:300]})
    finally:
        with LOCK:
            job["state"] = "stopped" if job.get("cancel") else ("failed" if job["errors"] and not job["done"] else "done")
            job["ended"] = time.time()
            job["drawing"] = []
            job.pop("waiting", None)


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
        job = {"state": "running", "todo": list(shots), "total": len(shots), "done": 0, "drawing": [], "errors": [], "step": "", "of": 0, "painted": 0,
               "prompts": {int(i): str(prompts.get(str(i)) or prompts.get(i)) for i in shots}, "heroes": heroes,
               "refine": float(refine) if refine else 0.0, "seed": int(seed) if seed is not None else int(plan["seed"]),
               "started": time.time()}
        JOBS[name] = job
    threading.Thread(target=_batch, args=(kit, name, job), daemon=True).start()   # HERESY 2322: batch runs over every card, not two runs at a time
    return status(kit, name)


def status(kit, name):
    with LOCK:
        j = JOBS.get(name)
        if not j:
            return {"state": "", "total": 0, "done": 0, "drawing": [], "errors": []}
        out = {k: (sorted(v) if isinstance(v, set) else list(v) if isinstance(v, list) else v) for k, v in j.items() if k not in ("prompts", "todo")}
        out["left"] = max(0, j["total"] - j["done"] - len({e["i"] for e in j["errors"] if e.get("i", -1) >= 0}))
        out["elapsed"] = round((j.get("ended") or time.time()) - j["started"])
        return out


def cancel(kit, name):
    with LOCK:
        j = JOBS.get(name)
        if j and j["state"] == "running":
            j["cancel"] = True
            j["todo"].clear()
    return status(kit, name)
