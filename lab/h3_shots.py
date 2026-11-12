"""HERESY 1868 (Viktor 29.10.2026: «мне нужна реальная DDiT генерация живого видеоклипа, а не просто слайдшоу»; «Забирай все GPUs»): the Videographer's
shots made alive by MiniMax H3. A shot asked for goes as a job into a card's spool (user/videos/.h3/gpuN-KIND/); a worker a card (lab/h3_worker.py in the
Artist's environment, on the Studio's own runtime lab/h3rt since 1870) takes it, keeps H3 loaded while shots come and leaves the card when none has come for ten minutes. Both modes are H3 FL2VA with
the shot's picture as its first frame: «draft» at 8 steps and 832×480 (measured 29.10 on a 3090: 102 s, a peak of 15 GB, a clean picture), «final» at
28 steps and H3's own 768p; so one worker a card serves both. (HERESY 2356: the draft at 1280 × 704, the old one «fast»; HERESY 2361: the final at
1280 × 704 too, and a hero's shot may get the hero's own picture as its last frame.) What a worker made is set into the shot by collect() (the lab's thread and every
status): the video in NAME.shots/, its first frame beside it for the timeline, the one before put off (kept). A shot whose times changed since it was
asked for keeps its video aside, not set."""
import json
import os
import random
import signal
import subprocess
import threading
import time
from pathlib import Path

import paths                       # HERESY 2330: where the weights live
import videographer as vg
from h3rt.files import needed as h3_needed

WORKER = Path(__file__).resolve().parent / "h3_worker.py"
MODES = {"draft": {"steps": 8, "fast": False}, "fast": {"steps": 8, "fast": False}, "final": {"steps": 28, "fast": False}}   # 29.10: the Turbo LoRA
# through AI-Toolkit gave noise, FastH3 (its «fast»: True, text alone) is past 24 GB at 768p; the base model at 8 steps keeps the shot's picture and fits
# HERESY 2356 (Viktor 10.11.2026 on «Буратино»: «очень много артефактов на глазах… надо начинать на 720»; «лечи так, как качественнее, а не быстрее»):
# the draft at 1280 × 704 (H3 sees it in 40 × 22 cells of 32 px; at 832 × 480 a face of 30–80 px was one or two cells, an eye less than one, and
# moved it smeared and doubled; at 704p in the test of 10.11 faces came 7–45 % sharper and 12–44 % calmer, for 2.8 times the time, a peak of
# 22–23.8 GB); the old draft at 832 × 480 kept as «fast»
# HERESY 2361 (Viktor 11.11.2026, the night report's advice taken: «перевести чистовик на 1280×704, 28 шагов»): the final at the draft's 1280 × 704 with
# 28 steps; at H3's own 1344 × 768 one pass held 4.46 s, so a shot of 5 s got a seam there, at 704p one pass holds 5.17 s (124 frames). The steps
# change the time, not the room: it asks what the draft asks
SIZES = {"final": {"16:9": (1280, 704), "9:16": (704, 1280), "1:1": (896, 896)},
         "draft": {"16:9": (1280, 704), "9:16": (704, 1280), "1:1": (896, 896)},
         "fast": {"16:9": (832, 480), "9:16": (480, 832), "1:1": (640, 640)}}
NEED = {"draft": 23500, "fast": 17000, "final": 23500}   # HERESY 2356: a card's room a mode asks for (704p peaked at 23.8 GB on 10.11)
NEED_MB = 17000
STRETCH = vg.STRETCH                                     # HERESY 2356: a shot this much longer than one pass is made in one, the clip stretching it


def need_mb(mode="draft"):
    return NEED.get(mode, NEED["draft"])


def pass_frames(width, height):
    """HERESY 2356: the most frames one H3 pass holds at this size (lab/h3rt/runtime.chunk_latents, H3's grid of 17n + 5): 124 at 1280 × 704,
    277 at 832 × 480, 107 at 1344 × 768."""
    per = max(1, (int(height) // 32) * (int(width) // 32))
    lat = 5 * max(1, (33000 // per - 2) // 5) + 2
    return 17 * (lat - 2) // 5 + 5
LOCK = threading.Lock()


def _py(kit):
    return Path(os.environ.get("LAB_ART_PY") or Path(kit) / ".venv-art/bin/python")      # the Artist's environment (lab/install-venv.sh --art)


def ready(kit):
    """Whether shots can be made here: the Artist's environment and the H3 files (fetch-heresy.sh --h3 int8)."""
    missing = [str(p.relative_to(kit)) for p in h3_needed(paths.at(paths.VIDEO_H3, kit)) if not p.is_file()]
    if not _py(kit).is_file():
        missing.append(str(_py(kit)))
    return {"ready": not missing, "missing": missing}


def _root(kit):
    return Path(kit) / "user/videos/.h3"


def _kind(mode):
    """The model a mode needs: the modes of one kind share a card's worker (its spool gpuN-KIND)."""
    return "fast" if MODES[mode]["fast"] else "h3"


def _alive(sp):
    try:
        w = json.loads((sp / "worker.json").read_text(encoding="utf-8"))
        if int(w["pid"]) == 0:                              # just spawned: alive for two minutes while it loads
            return w if time.time() - float(w.get("at", 0)) < 120 else None
        os.kill(int(w["pid"]), 0)
    except (OSError, ValueError, KeyError):
        return None
    return w if w.get("status") in ("loading", "ready", "busy") else None


def workers(kit):
    out = []
    for sp in sorted(_root(kit).glob("gpu*-*")) if _root(kit).is_dir() else []:
        gpu, kind = sp.name[3:].split("-", 1)
        w = _alive(sp)
        if not w and kind not in {_kind(m) for m in MODES}:      # a spool of a kind gone (1868's gpuN-draft): its records kept, no worker
            continue
        out.append({"gpu": int(gpu), "kind": kind, "alive": bool(w), "status": (w or {}).get("status", "gone"), "queued": len([j for j in sp.glob("*.json") if j.name != "worker.json"]),
                    "running": len(list(sp.glob("*.run")))})
    return out


def _spawn(kit, gpu, mode):
    sp = _root(kit) / f"gpu{gpu}-{_kind(mode)}"
    sp.mkdir(parents=True, exist_ok=True)
    cmd = ["nice", "-n", "5", str(_py(kit)), "-u", str(WORKER), "--gpu", str(gpu), "--spool", str(sp), "--idle", "600"]
    if MODES[mode]["fast"]:
        cmd += ["--fast"]
    log = open(sp / "worker.log", "ab")
    subprocess.Popen(cmd, cwd=str(kit), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    (sp / "worker.json").write_text(json.dumps({"status": "loading", "pid": 0, "gpu": gpu, "at": time.time(), "spawned": True}), encoding="utf-8")


def hero_shot(s):
    """HERESY 2361: whether the hero is in shot s: its picture drawn from the hero (frame_from's hero), else chosen so (hero true)."""
    fr = s.get("frame_from")
    if isinstance(fr, dict) and isinstance(fr.get("hero"), bool):
        return fr["hero"]
    return s.get("hero") is True


def hero_last(kit, plan, s):
    """HERESY 2361 (the night report of 10→11.11: «в движении H3 в некоторых кадрах укорачивает нос даже со словами героя»; its first idea, taken
    on Viktor's «делай как советуешь»): the hero's own picture as the last frame of his shot (H3 FL2VA's «last» keyframe), when the plan's hero
    asks it (hero.last). (the picture's path or "", why there is none when it was asked): a picture asked and not found is said, never taken for
    «not asked»."""
    h = plan.get("hero")
    if not isinstance(h, dict) or not h.get("last") or not hero_shot(s):
        return "", ""
    try:
        import artist
        return str(artist.picture(str(h.get("run") or ""), str(h.get("file") or ""))[0]), ""
    except (OSError, ValueError, KeyError, TypeError) as e:
        return "", f"the hero's picture is not here: {e}"


def shoot(kit, name, i, prompt, mode="draft", free_cards=(), seed=None, first=True, size="16:9"):
    """A shot into a card's queue: the card already running a worker of this mode's kind with the shortest queue, else a free card (its worker started).
    HERESY 2361: a hero's shot takes the hero's picture as its last frame when the plan asks it (hero_last)."""
    if mode not in MODES:
        raise ValueError("draft, fast or final")
    r = ready(kit)
    if not r["ready"]:
        raise FileNotFoundError("MiniMax H3 is not here: " + ", ".join(r["missing"]) + " (heresy/fetch-heresy.sh --h3 int8)")
    plan = vg.get(kit, name)
    s = vg._shot_of(plan, i)
    prompt = str(prompt or "").strip()
    if not prompt:
        raise ValueError("no prompt for this shot: write its scene first")
    w, h = SIZES[mode].get(size, SIZES[mode]["16:9"])
    with LOCK:
        mine = [x for x in workers(kit) if x["alive"] and x["kind"] == _kind(mode)]
        cards = sorted(mine, key=lambda x: x["queued"] + x["running"])
        gpu = cards[0]["gpu"] if cards and (cards[0]["queued"] + cards[0]["running"] == 0 or not free_cards) else None
        busy = {x["gpu"] for x in workers(kit) if x["alive"]}
        fresh = [g for g in free_cards if g not in busy]
        if gpu is None and fresh:
            gpu = fresh[0]
            _spawn(kit, gpu, mode)
        if gpu is None and cards:
            gpu = cards[0]["gpu"]
        if gpu is None:
            raise RuntimeError("no card free for MiniMax H3 now: it needs about 17 GB of one card")
        sp = _root(kit) / f"gpu{gpu}-{_kind(mode)}"
        sp.mkdir(parents=True, exist_ok=True)
        now = time.time()
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + f"-{int(now * 1000) % 1000:03d}"
        out = vg.shots_dir(kit, name) / f"{stamp}-{i:03d}.mp4"
        pic = ""
        if first and s.get("frame"):
            try:
                pic = str(vg.frame_path(kit, name, s["frame"]))
            except (OSError, ValueError):
                pic = ""
        job = {"name": name, "i": i, "t0": s["t0"], "t1": s["t1"], "prompt": prompt, "seconds": round(max(4.0, min(15.0, s["t1"] - s["t0"])), 2),
               "width": w, "height": h, "steps": MODES[mode]["steps"], "seed": int(seed or random.randint(1000, 999999999)), "first": pic, "out": str(out),
               "mode": mode, "gpu": gpu, "queued": now}
        last, why = hero_last(kit, plan, s) if not MODES[mode]["fast"] else ("", "")   # HERESY 2361
        if last:
            job["last"] = last
        elif why:
            job["last_missing"] = why
        pf, want = pass_frames(w, h), int(round(job["seconds"] * 24))   # HERESY 2356: a little past one pass: one pass, no seam (the clip stretches it)
        if pf < want <= pf * STRETCH:
            job["frames"] = pf
        f = sp / f"{name}--{i:03d}--{stamp}.json"
        tmp = f.with_suffix(".part")
        tmp.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        tmp.replace(f)
    return dict(job, file=f.name)


COLLECTING = threading.Lock()   # HERESY 2308


def collect(kit):
    if not COLLECTING.acquire(blocking=False):      # HERESY 2308: another collect is at it: it sets them
        return []
    try:
        return _collect(kit)
    finally:
        COLLECTING.release()


def _collect(kit):
    """What the workers made, set into their shots (a .done becomes .set; a shot whose times changed keeps its video aside: .aside)."""
    done = []
    for f in sorted(_root(kit).glob("gpu*-*/*.done")) if _root(kit).is_dir() else []:
        try:
            job = json.loads(f.read_text(encoding="utf-8"))
            vg.shot_video_set(kit, job["name"], job)
            f.replace(f.with_suffix(".set"))
            done.append(job["name"])
        except vg.Moved:
            f.replace(f.with_suffix(".aside"))
        except (OSError, ValueError, KeyError):
            f.replace(f.with_suffix(".bad"))
    return done


def status(kit, name):
    """A take's shots on their way: queued, running (with how long), failed (and why); and the workers."""
    collect(kit)
    jobs = []
    for sp in sorted(_root(kit).glob("gpu*-*")) if _root(kit).is_dir() else []:
        w = _alive(sp) or {}
        for f in sp.iterdir():
            if not f.name.startswith(name + "--") or f.suffix not in (".json", ".run", ".failed"):
                continue
            try:
                j = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            job = {"i": j.get("i"), "state": {".json": "queued", ".run": "running", ".failed": "failed"}[f.suffix], "mode": j.get("mode"),
                   "gpu": j.get("gpu"), "since": round(time.time() - (f.stat().st_mtime if f.suffix == ".run" else j.get("queued", time.time()))),
                   "error": j.get("error", ""), "file": f.name, "last": bool(j.get("last"))}
            if j.get("last_missing"):                       # HERESY 2361: the hero's last frame asked and not found, said
                job["last_missing"] = j["last_missing"]
            if f.suffix == ".run" and w.get("job") == f.stem and w.get("steps"):      # HERESY 1870: the step it is at
                job.update(step=w.get("step"), steps=w.get("steps"))
            jobs.append(job)
    return {"name": name, "jobs": sorted(jobs, key=lambda j: (j["i"] or 0)), "workers": workers(kit), **ready(kit)}


def cancel(kit, name, i=None):
    """Queued shots of a take taken back (one, or all); a running one ends on its own."""
    n = 0
    for f in _root(kit).glob(f"gpu*-*/{name}--*.json") if _root(kit).is_dir() else []:
        if i is None or f.name.startswith(f"{name}--{int(i):03d}--"):
            f.unlink(missing_ok=True)
            n += 1
    return {"cancelled": n}


def stop_workers(kit):
    """The workers sent away now (their cards back): a running shot is lost."""
    n = 0
    for x in workers(kit):
        if x["alive"]:
            sp = _root(kit) / f"gpu{x['gpu']}-{x['kind']}"
            w = _alive(sp)
            try:
                os.killpg(os.getpgid(int(w["pid"])), signal.SIGTERM)
                n += 1
            except (OSError, ValueError, KeyError, TypeError):
                continue
            for run in sp.glob("*.run"):                    # HERESY 2305: the shot it was making is lost, and said so; a .run left behind
                try:                                        # read «running» for ever and counted against the card when the next shot was placed
                    spec = json.loads(run.read_text(encoding="utf-8"))
                    run.with_suffix(".failed").write_text(json.dumps(dict(spec, status="failed", error="stopped: the worker was sent away mid-shot"),
                                                                     ensure_ascii=False), encoding="utf-8")
                    run.unlink(missing_ok=True)
                except (OSError, ValueError):
                    pass
    return {"stopped": n}


def release_idle(kit, wait=45):
    """HERESY 2323 (the night test of 10.11: «Upscale all» right after the last H3 shot found no card, three idle H3 workers keeping theirs for
    their ten minutes): the workers with nothing queued or running sent away now, their cards back for SeedVR2; waited for until their
    processes are gone (wait seconds at most). The cards freed, [gpu]."""
    gone = []
    for x in workers(kit):
        if not x["alive"] or x["status"] != "ready" or x["queued"] or x["running"]:
            continue
        w = _alive(_root(kit) / f"gpu{x['gpu']}-{x['kind']}")
        try:
            pid = int(w["pid"])
            os.killpg(os.getpgid(pid), signal.SIGTERM)
            gone.append((x["gpu"], pid))
        except (OSError, ValueError, KeyError, TypeError):
            continue
    t0 = time.time()
    while gone and time.time() - t0 < wait:
        left = []
        for g, pid in gone:
            try:
                os.kill(pid, 0)
                left.append(pid)
            except OSError:
                pass
        if not left:
            break
        time.sleep(1)
    return [g for g, _ in gone]


def spread(kit, cards):
    """HERESY 2323 (Viktor 10.11.2026: «у меня в настройках в студии же выставлено на лабы 3 видеокарты. H3 он гнал на одной карте»): shots waiting
    in the queues while a card of the lab's jobs has room and no worker of H3: a worker started there (it takes the waiting shots of the other
    queues, h3_worker.steal), one a card, as many as shots wait beyond one for each worker there is (a single shot does not start a second
    card while its worker loads). cards(most, exclude): the lab's free cards (more_gpus), asked only then. The started cards, [gpu]."""
    root = _root(kit)
    if not root.is_dir():
        return []
    waiting = [j for j in root.glob("gpu*-h3/*.json") if j.name != "worker.json"]
    if not waiting:
        return []
    with LOCK:
        alive = [x["gpu"] for x in workers(kit) if x["alive"]]
        want = len(waiting) - len(alive)
        got = list(cards(want, alive) or []) if want > 0 else []
        for g in got:
            _spawn(kit, g, "draft")
    return got


def collector(kit, every=10, cards=None):
    while True:
        try:
            collect(kit)
            if cards:                                   # HERESY 2323: every free card of the lab's jobs takes a share of the waiting shots
                spread(kit, cards)
        except Exception:  # noqa: BLE001 — the thread must not die of one odd file
            pass
        time.sleep(every)
