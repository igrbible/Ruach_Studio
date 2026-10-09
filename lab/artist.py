"""HERESY 1169 · 1255: the Artist room, an early preview (Viktor 08.10.2026: «RC3 завтра или послезавтра с Artist Early
Preview»; «Код Художника оправданнее строит на рабочем Krea2, который у тебя уже bulletproof»).

A run is what one press of Draw asks for: a prompt of one's own, the shapes (1:1, 16:9, 9:16, all from one seed), one to
four variations (the seed, the seed + 1, …), the painter (Krea 2 Muse at Q4 or Q8). artist_job.py draws it in .venv-art
on a card the guard gives, in the lab's queue with its other heavy jobs, and the run is kept in KIT/artist/RUN/: ask.json
(what was asked), run.json (that and what came, picture by picture), the pictures as PNG and their thumbnails (thumbs/).
A square picture becomes a take's artwork on the user's word, the old one kept in artwork-removed/ as a redraw keeps it.
A run goes to KIT/trash/artist/ and comes back from there.

    POST /artist/draw {prompt, shapes, seed, count, painter, take}   202: the run, queued
    GET  /artist/runs                       every run, the newest first, the drawing ones with their state
    GET  /artist/file?id=RUN&file=F         a picture (PNG) or its thumbnail (thumbs/….jpg)
    POST /artist/cover {id, file, name}     a square picture becomes the take's artwork
    POST /artist/star {id, file, star}      HERESY 1257: a picture starred or not
    POST /artist/trash {id} · POST /artist/restore {id}   the run to the trash and back
    GET  /artist/prompt?name=TAKE           a prompt to start from: the one the take's artwork was drawn from, else
                                            one from its title and style"""
import collections, json, os, random, re, shutil, subprocess, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
H = {}                     # the lab's own parts (setup): kit, jobs, lock, wait_card, turn, free_gpu, say, take_dir, pair, copy, painter, py
SHAPES = ("1:1", "16:9", "9:16")
RUN_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")
FILE_RE = re.compile(r"^(?:(?:thumbs/)?\d{2}-(?:1x1|16x9|9x16)-s\d+\.(?:png|jpg)|preview/\d{2}\.jpg)$")   # 1257: a step's picture
# the card a run needs at its largest shape, the VAE in tiles (RTX 3090, 08.10.2026, reserved at the peak: Q8 15.1 GB at
# 1024², 15.9 at 1280², 16.9 at 1920×1088; Q4 9.3, 10.1, 11.1; untiled the VAE's decode alone took 4 to 8 GB more), with a
# margin for the card's own context
NEED = {"krea2-q8": 18500, "krea2-q4": 12500}
KEEP = 1024                # a take's artwork, as art_job.py writes it
PROMPT_MAX = 4000
STOPPED = "the lab restarted while it was drawing"


def setup(**parts):
    H.update(parts)


def home():
    return H["kit"] / "artist"


def run_dir(rid):
    if not RUN_RE.match(str(rid or "")):
        raise ValueError("bad run id")
    d = home() / rid
    if not (d / "run.json").is_file():
        raise FileNotFoundError(f"no run {rid}")
    return d


def read(d):
    try:
        return json.load(open(d / "run.json", encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write(d, run):
    part = d / "run.json.part"
    with open(part, "w", encoding="utf-8") as f:
        json.dump(run, f, ensure_ascii=False, indent=1)
    part.replace(d / "run.json")


def runs():
    """Every run, the newest first; a drawing one with its job's state (waiting: why); one the lab lost while it drew
    (a restart) said so, not shown drawing for ever."""
    out = []
    if home().is_dir():
        for d in sorted(home().iterdir(), reverse=True):
            if d.is_dir() and RUN_RE.match(d.name):
                r = read(d)
                if r:
                    out.append((d, r))
    with H["lock"]:
        live = {k[7:]: dict(v) for k, v in H["jobs"].items() if k.startswith("artist:")}
    for d, r in out:
        job = live.get(r.get("id"))
        if job:
            r.update(status=job.get("status"), waiting=job.get("waiting"), gpu=job.get("gpu", r.get("gpu")))
        elif r.get("status") in ("queued", "running"):
            r.update(status="failed", error=STOPPED)
            write(d, r)
    return {"runs": [r for _, r in out]}


def draw(body):
    """A run, asked for and queued; its thread waits for a card and draws it."""
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("write what to paint first")
    if len(prompt) > PROMPT_MAX:
        raise ValueError(f"the prompt is too long: {PROMPT_MAX} characters at most")
    shapes = [s for s in SHAPES if s in (body.get("shapes") or [])]
    if not shapes:
        raise ValueError("pick a shape: 1:1, 16:9 or 9:16")
    try:
        count = int(body.get("count") or 1)
    except (TypeError, ValueError):
        raise ValueError("variations: a number, one to four")
    if not 1 <= count <= 4:
        raise ValueError("variations: one to four")
    seed = body.get("seed")
    seed = int(seed) if re.fullmatch(r"\d{1,10}", str(seed if seed is not None else "").strip()) else random.randint(0, 2**31 - 1)
    seed = min(seed, 2**31 - 1 - count)
    painter = H["painter"](body.get("painter"))
    if painter not in NEED:
        raise ValueError("the Artist paints with Krea 2 Muse, which is not on this machine: heresy/fetch-heresy.sh --artwork")
    take = str(body.get("take") or "").strip() or None
    if take:                                         # the take in hand, kept with the run; one gone meanwhile is not kept
        try:
            H["take_dir"](take)
        except (FileNotFoundError, ValueError):
            take = None
    rid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    d = home() / rid
    d.mkdir(parents=True)
    ask = {"prompt": prompt, "shapes": shapes, "seed": seed, "count": count, "preview": body.get("preview") is not False}
    with open(d / "ask.json", "w", encoding="utf-8") as f:
        json.dump(ask, f, ensure_ascii=False, indent=1)
    run = dict(ask, id=rid, painter=painter, take=take, created=time.time(), status="queued", of=count * len(shapes), pictures=[])
    write(d, run)
    job = {"status": "queued", "started": time.time(), "kind": "artist"}
    with H["lock"]:
        H["jobs"]["artist:" + rid] = job
    threading.Thread(target=work, args=(d, run, job), daemon=True).start()
    return run


def work(d, run, job):
    key, need, gpu = "artist:" + run["id"], NEED[run["painter"]], None
    try:
        while True:                                  # in the queue for a card, then for its turn (as the artwork waits)
            H["wait_card"](job, need, f"the Artist · {run['id']}")
            with H["turn"](job):
                try:
                    gpu, _ = H["free_gpu"](need)     # asked again now that its turn has come
                except RuntimeError:
                    job["status"] = "queued"         # the card was taken meanwhile: back to waiting for one
                    continue
                job.update(status="running", gpu=gpu)
                job.pop("waiting", None)
                run.update(status="running", gpu=gpu, began=time.time())
                write(d, run)
                env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", ART_PAINTER=run["painter"])
                p = subprocess.Popen([str(H["py"]), str(HERE / "artist_job.py"), str(d)], env=env, text=True,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                errs = collections.deque(maxlen=40)
                t = threading.Thread(target=lambda: errs.extend(p.stderr), daemon=True)
                t.start()
                # a painter that hangs is stopped: the loading and five times a picture's time at the largest shape
                watch = threading.Timer(180 + 240 * run["of"], p.kill)
                watch.start()
                try:
                    for line in p.stdout:            # each picture as it comes, so the page shows them one by one
                        try:
                            row = json.loads(line)
                        except ValueError:
                            continue
                        if row.get("done"):
                            run["took"] = row.get("took")
                        elif "live" in row:          # HERESY 1257: the step being painted, its picture an eighth the size
                            run["live"] = dict(row, t=time.time())
                            write(d, run)
                        else:
                            run.pop("live", None)
                            run["pictures"].append(row)
                            write(d, run)
                    p.wait(timeout=60)
                finally:
                    watch.cancel()
                t.join(timeout=5)
                if p.returncode != 0:
                    last = [x.strip() for x in errs if x.strip()]
                    raise RuntimeError("the painter stopped: " + (last[-1][-300:] if last else f"exit {p.returncode}"))
            break
        kept = [x for x in run["pictures"] if x.get("kept")]
        flagged = len(run["pictures"]) - len(kept)
        run.pop("live", None)
        run.update(status="done", ended=time.time())
        write(d, run)
        H["say"](f"the Artist ({run['painter']}) · {run['id']} · {len(kept)} of {run['of']} picture(s) in {run.get('took') or 0:.0f} s "
                 f"on GPU {gpu}" + (f" · {flagged} not kept: the content filter flagged them" if flagged else ""))
    except Exception as e:                           # Cancelled (taken off the queue) included
        run.pop("live", None)
        run.update(status="failed", error=str(e), ended=time.time())
        write(d, run)
        H["say"](f"the Artist · {run['id']} · failed: {e}")
    finally:
        with H["lock"]:
            H["jobs"].pop(key, None)


def picture(rid, name):
    """A picture of a run, or its thumbnail: (path, type)."""
    d = run_dir(rid)
    if not FILE_RE.match(str(name or "")):
        raise ValueError("bad picture name")
    p = d / name
    if not p.is_file():
        raise FileNotFoundError("no such picture")
    return p, "image/png" if p.suffix == ".png" else "image/jpeg"


def cover(body):
    """A square picture of a run becomes the take's artwork (1024 px JPEG, as art_job.py writes one); the picture it
    replaces is kept in the take's artwork-removed/ (as a redraw keeps it), the take's MP3s, which carry the old one,
    made again when asked; the other letter of an A/B pair gets it too when it has none."""
    rid, name, take = str(body.get("id") or ""), str(body.get("file") or ""), str(body.get("name") or "")
    p, _ = picture(rid, name)
    if p.suffix != ".png" or "-1x1-" not in p.name:
        raise ValueError("a cover is square: choose a 1:1 picture")
    d = H["take_dir"](take)
    run = read(run_dir(rid)) or {}
    pic = next((x for x in run.get("pictures") or [] if x.get("file") == name), {})
    from PIL import Image
    part = d / "artwork.part.jpg"
    Image.open(p).convert("RGB").resize((KEEP, KEEP), resample=Image.LANCZOS).save(part, "JPEG", quality=90, optimize=True)
    kept = None
    if (d / "artwork.jpg").is_file():
        keep = d / "artwork-removed"
        keep.mkdir(exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        (d / "artwork.jpg").replace(keep / f"{stamp}.jpg")
        if (d / "artwork.json").is_file():
            (d / "artwork.json").replace(keep / f"{stamp}.json")
        kept = f"artwork-removed/{stamp}.jpg"
    meta = {"painter": run.get("painter"), "prompt": run.get("prompt"), "seed": pic.get("seed"), "by": "the Artist room",
            "run": rid, "file": name, "created": time.strftime("%Y-%m-%d %H:%M")}
    with open(d / "artwork.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    part.replace(d / "artwork.jpg")
    for mp3 in d.glob("audio-*k.mp3"):
        mp3.unlink(missing_ok=True)
    for sib in H["pair"](take):
        H["copy"](d, sib, "the other letter of its A/B pair")
    run.setdefault("covers", []).append({"take": take, "file": name, "when": time.time()})
    write(run_dir(rid), run)
    H["say"](f"the Artist · {rid} · {name} is the artwork of {take}" + (f" (the old one kept: {kept})" if kept else ""))
    return {"cover": take, "file": name, "kept": kept}


def star(body):
    """HERESY 1257: a picture starred or not, kept with its run (the gallery's ★ shows the starred)."""
    rid, name, on = str(body.get("id") or ""), str(body.get("file") or ""), bool(body.get("star"))
    picture(rid, name)
    with H["lock"]:                                  # the drawing run writes its own run.json: a star then would be lost
        if "artist:" + rid in H["jobs"]:
            raise ValueError("it is drawing: star its pictures when it ends")
    d = run_dir(rid)
    run = read(d) or {}
    pic = next((x for x in run.get("pictures") or [] if x.get("file") == name), None)
    if pic is None:
        raise FileNotFoundError("no such picture in the run")
    if on:
        pic["star"] = True
    else:
        pic.pop("star", None)
    write(d, run)
    return {"star": on, "file": name}


def trash(rid):
    d = run_dir(rid)
    with H["lock"]:
        if "artist:" + rid in H["jobs"]:
            raise ValueError("it is drawing: let it end first")
    to = H["kit"] / "trash" / "artist" / rid
    to.parent.mkdir(parents=True, exist_ok=True)
    if to.exists():
        raise ValueError("the trash has a run of this name already")
    shutil.move(str(d), str(to))
    return {"trashed": rid}


def restore(rid):
    if not RUN_RE.match(str(rid or "")):
        raise ValueError("bad run id")
    src, to = H["kit"] / "trash" / "artist" / rid, home() / rid
    if not (src / "run.json").is_file():
        raise FileNotFoundError(f"no run {rid} in the trash")
    if to.exists():
        raise ValueError("a run of this name is here already")
    home().mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(to))
    return {"restored": rid}


def prompt_for(name):
    """A prompt to start from: the one the take's artwork was drawn from, else one from its title and style."""
    d = H["take_dir"](name)
    try:
        meta = json.load(open(d / "artwork.json", encoding="utf-8"))
        if str(meta.get("prompt") or "").strip():
            return {"prompt": meta["prompt"].strip(), "from": "artwork"}
    except (OSError, ValueError, AttributeError):
        pass
    req = {}
    try:
        req = json.load(open(d / "request.json", encoding="utf-8"))
    except (OSError, ValueError):
        pass
    title = str(req.get("title") or name).strip()
    style = " ".join(str(req.get("style") or "").split())[:600]
    return {"prompt": f"Cover art for the song «{title}»" + (f": {style}" if style else "") + ". No text, no letters.", "from": "style"}
