"""HERESY 1169 · 1255: the Artist room, an early preview (Viktor 08.10.2026: «RC3 завтра или послезавтра с Artist Early
Preview»; «Код Художника оправданнее строит на рабочем Krea2, который у тебя уже bulletproof»).

A run is what one press of Draw asks for: a prompt of one's own, the shapes (1:1, 16:9, 9:16, all from one seed), one to
four variations (the seed, the seed + 1, …), the painter (Krea 2 Muse at Q4 or Q8). artist_job.py draws it in .venv-art
on a card the guard gives, in the lab's queue with its other heavy jobs, and the run is kept in KIT/artist/RUN/: ask.json
(what was asked), run.json (that and what came, picture by picture), the pictures as PNG and their thumbnails (thumbs/).
A square picture becomes a take's artwork on the user's word, the old one kept in artwork-removed/ as a redraw keeps it.
A run goes to KIT/trash/artist/ and comes back from there.
HERESY 1337: the art put away (runs in the trash, pictures put aside, covers taken off the takes) listed as one trash, each given back
or deleted for good on the user's word (bin_list, bin_act).

    POST /artist/draw {prompt, shapes, seed, count, painter, take}   202: the run, queued
    GET  /artist/runs                       every run, the newest first, the drawing ones with their state
    GET  /artist/file?id=RUN&file=F         a picture (PNG) or its thumbnail (thumbs/….jpg)
    POST /artist/cover {id, file, name}     a square picture becomes the take's artwork
    POST /artist/star {id, file, star}      HERESY 1257: a picture starred or not
    POST /artist/trash {id} · POST /artist/restore {id}   the run to the trash and back
    POST /artist/stop {id}                  HERESY 1270: a waiting run off the queue, a drawing one's painter ended («stopped»)
    GET  /artist/prompt?name=TAKE           a prompt to start from: the one the take's artwork was drawn from, else
                                            one from its title and style"""
import collections, json, os, random, re, shutil, subprocess, threading, time
from pathlib import Path

import artist_loras                                   # HERESY 1316: the adapters a run asks for

HERE = Path(__file__).resolve().parent
H = {}                     # the lab's own parts (setup): kit, jobs, lock, wait_card, turn, free_gpu, say, take_dir, pair, copy, painter, py; 1337: outputs, frozen
SHAPES = ("1:1", "16:9", "9:16")
RUN_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")
FILE_RE = re.compile(r"^(?:(?:thumbs/)?\d{2}-(?:1x1|16x9|9x16)-s\d+(?:-up(?:\dx|[24]k))?\.(?:png|jpg)|preview/\d{2}\.jpg|ref\.(?:png|jpg|webp)|mask\.png)$")   # 1257: a step's picture; 1305: the reference; 1306: its mask
# the card a run needs at its largest shape, the VAE in tiles (RTX 3090, 08.10.2026, reserved at the peak: Q8 15.1 GB at
# 1024², 15.9 at 1280², 16.9 at 1920×1088; Q4 9.3, 10.1, 11.1; untiled the VAE's decode alone took 4 to 8 GB more), with a
# margin for the card's own context
NEED = {"krea2-q8": 18500, "krea2-q4": 12500}
# HERESY 1318: the Qwen painters, by their peaks on an RTX 3090 (10.10.2026, 1328², Lightning on, the encoder gone by then) with a
# margin: 2512 Q4 14.3 GB (15.1 held), Q6 17.6 (19.1), an fp8 fine-tune 21.0 (21.3); Qwen-Image 2.1 16.4 painting from words, 19.1
# editing, its parts on the card in turn
QWEN = {"qwen2512-q4": ("Qwen-Image 2512 · Q4", 15500), "qwen2512-q6": ("Qwen-Image 2512 · Q6", 20000),
        "qwen2512-fp8": ("Qwen-Image 2512 · fp8", 22500), "qwen21": ("Qwen-Image 2.1 · research licence", 21000)}
NEED.update({k: v[1] for k, v in QWEN.items()})
NEED["upscale"] = 4000                                # HERESY 1322: a DAT 4x model peaked at 2.1 GB in tiles of 512 (RTX 3090)
# HERESY 1342: the card a run needs when its painter's blocks stream from RAM (artist_qwen.place), asked when no card here takes it whole
STREAM_NEED = {"qwen2512-fp8": 6000}   # measured 10.10.2026: 2.3 GB at the peak with every block streamed (1328², Lightning, four adapters)
QWEN_NOTE = {"qwen21": "Qwen-Image 2.1 is under the Qwen Research Licence: research and evaluation only, not for commercial use "
             "(a cover for a song you sell is commercial use); a reference is a picture it edits by the prompt's words",
             "qwen2512-q4": "Qwen-Image 2512 (Apache-2.0) from a 4-bit GGUF: for a card of 16 GB",
             "qwen2512-q6": "Qwen-Image 2512 (Apache-2.0) from a 6-bit GGUF",
             "qwen2512-fp8": "a fine-tune of Qwen-Image 2512 in fp8 from artwork/Qwen-Image-2512/checkpoints/ (ComfyUI's single files): a card of 24 GB"}
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


def _art(*parts):
    return Path(H["kit"]).joinpath("artwork", *parts)


def qwen_models():
    """HERESY 1318: the fp8 fine-tunes of Qwen-Image 2512 here (artwork/Qwen-Image-2512/checkpoints/*.safetensors)."""
    d = _art("Qwen-Image-2512", "checkpoints")
    return sorted(p.name for p in d.glob("*.safetensors") if p.is_file()) if d.is_dir() else []


def qwen_ready(painter):
    """HERESY 1318: a Qwen painter's files are here."""
    if painter == "qwen21":
        return (_art("Qwen-Image-2.1", "model_index.json").is_file() and _art("Qwen-Image-2.1", "transformer").is_dir())
    base = all(_art("Qwen-Image-2512", x).exists() for x in ("model_index.json", "text_encoder", "vae", "tokenizer", "transformer/config.json"))
    if painter == "qwen2512-fp8":
        return base and bool(qwen_models())
    gg = {"qwen2512-q4": "qwen-image-2512-Q4_K_M.gguf", "qwen2512-q6": "qwen-image-2512-Q6_K.gguf"}.get(painter)
    return base and bool(gg) and _art("Qwen-Image-2512", "gguf", gg).is_file()


def painters():
    """HERESY 1318: the Artist's painters as this machine has them, for the room's choice."""
    krea = all(_art(*x).exists() for x in (("Krea-2-Turbo", "text_encoder"), ("Krea-2-Turbo", "vae")))
    out = [{"key": "krea2-q4", "label": "Krea 2 Muse · Q4", "need_mb": NEED["krea2-q4"], "family": "krea2",
            "ready": krea and _art("Krea-2-Muse", "museByStableYogi_v35Q4Extended.gguf").is_file()},
           {"key": "krea2-q8", "label": "Krea 2 Muse · Q8", "need_mb": NEED["krea2-q8"], "family": "krea2",
            "ready": krea and _art("Krea-2-Muse", "museByStableYogi_v35Q8Extended.gguf").is_file()}]
    for k, (label, need) in QWEN.items():
        e = {"key": k, "label": label, "need_mb": need, "family": "qwen-image-2.1" if k == "qwen21" else "qwen-image-2512",
             "ready": qwen_ready(k), "note": QWEN_NOTE.get(k, "")}
        if k == "qwen2512-fp8":
            e["models"] = qwen_models()
        if k != "qwen21":
            e["lightning"] = _art("Qwen-Image-2512", "lightning", "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors").exists()
        out.append(e)
    return {"painters": out}


SAMPLERS = ("euler", "euler-sde", "er_sde", "res_2s", "res_2s_ode", "res_3s", "res_3s_ode", "heunpp2", "exp_heun_2_x0", "exp_heun_2_x0_sde")   # HERESY 1333
SCHEDULES = ("simple", "karras", "exponential", "beta", "beta57", "kl_optimal", "sgm_uniform", "bong_tangent")


def sampling(painter, s):
    """HERESY 1319: a run's sampling as asked, checked by its painter; {} for the painter's own."""
    if not s:
        return {}
    if not isinstance(s, dict):
        raise ValueError("sampling: steps, sampler, schedule")
    out = {}
    light = None
    if painter.startswith("qwen2512") and s.get("lightning") is not None:
        light = float(s["lightning"])
        if not 0 <= light <= 1.5:
            raise ValueError("Lightning's strength: 0 (off) to 1.5")
        if light > 0 and not _art("Qwen-Image-2512", "lightning", "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors").exists():
            raise ValueError("Lightning is not on this machine: its file goes into artwork/Qwen-Image-2512/lightning/ (Engine → Models and LoRAs → Qwen painters)")
        out["lightning"] = round(light, 2)
    # HERESY 1328: not asked, a fine-tune paints without Lightning and a GGUF painter with it (artist_qwen.py's OFF_BY_DEFAULT)
    fast = painter.startswith("krea2") or (painter.startswith("qwen2512") and (light > 0 if light is not None else painter != "qwen2512-fp8"))
    lo, hi = (4, 16) if fast else (10, 60)
    if s.get("steps") is not None:
        n = int(s["steps"])
        if not lo <= n <= hi:
            raise ValueError(f"steps: {lo} to {hi} for this painter" + (" with Lightning" if painter.startswith("qwen2512") and fast else ""))
        out["steps"] = n
    if s.get("sampler"):
        if s["sampler"] not in SAMPLERS:
            raise ValueError("the sampler: one of " + ", ".join(SAMPLERS))
        out["sampler"] = s["sampler"]
    if s.get("schedule"):
        if s["schedule"] not in SCHEDULES:
            raise ValueError("the schedule: one of " + ", ".join(SCHEDULES))
        out["schedule"] = s["schedule"]
    if painter.startswith("qwen2512") and not fast and s.get("cfg") is not None:
        c = float(s["cfg"])
        if not 1 <= c <= 10:
            raise ValueError("guidance: 1 to 10")
        out["cfg"] = round(c, 2)
    return out


QUIET_LOAD, QUIET_PAINT = 600, 300   # HERESY 1340: a painter silent this long (s) is stopped: while it loads, once it paints
RUNS_MAX = 2       # HERESY 1340 (Viktor 10.10.2026: «разреши батчинг/очередь до двух батчей»): Artist runs waiting or drawing at a time


def draw(body):
    """A run, asked for and queued; its thread waits for a card and draws it."""
    with H["lock"]:
        going = [k for k in H["jobs"] if k.startswith("artist:")]
    if len(going) >= RUNS_MAX:
        raise ValueError(f"two runs at a time: the next one when one of them ends ({len(going)} going)")
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
    asked = str(body.get("painter") or "").strip().lower()
    painter = asked if asked in QWEN else H["painter"](body.get("painter"))   # HERESY 1318: a Qwen painter by its own name
    if painter in QWEN and not qwen_ready(painter):
        raise ValueError(QWEN[painter][0] + " is not on this machine: its files go into artwork/" + ("Qwen-Image-2.1" if painter == "qwen21" else "Qwen-Image-2512") + "/ (heresy/fetch-heresy.sh)")
    model = ""
    if painter == "qwen2512-fp8":                       # HERESY 1318: which fine-tune
        model = Path(str(body.get("model") or "")).name
        if model not in qwen_models():
            raise ValueError("pick the fine-tune: one of artwork/Qwen-Image-2512/checkpoints/")
    if painter == "qwen21" and (body.get("mask") or body.get("fit")):
        raise ValueError("Qwen-Image 2.1 edits a picture by the prompt's words: a mask or «Paint around it» wants Krea 2 or Qwen-Image 2512")
    if painter not in NEED:
        raise ValueError("the Artist paints with Krea 2 Muse, which is not on this machine: heresy/fetch-heresy.sh --artwork")
    loras = artist_loras.chosen(H["kit"], painter, body.get("loras"))   # HERESY 1316: checked now, their size asked of the card too
    need = dict(NEED, **{painter: NEED[painter] + sum(x["mb"] for x in loras)})
    why = H["refusal"](painter, need, "choose it as the painter here") if H.get("refusal") else ""   # HERESY 1297: said now
    if why and painter in STREAM_NEED and not H["refusal"](painter, dict(need, **{painter: STREAM_NEED[painter]}), ""):
        why = ""                                     # HERESY 1342: too big for a card whole, it will stream its blocks from RAM
    if why:
        raise ValueError(why)
    ref, ref_from, strength = _reference(body)          # HERESY 1305: a picture to paint from, or None
    mask = _mask(body) if ref else None              # HERESY 1306: and what of it to repaint, or None
    if body.get("mask") and not ref:
        raise ValueError("a mask goes with a reference picture: it says what of the picture to repaint")
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
    if loras:
        ask["loras"] = loras                             # HERESY 1316
    if model:
        ask["model"] = model                             # HERESY 1318: the fp8 fine-tune
    place = _places(body.get("place")) if ref else {}  # HERESY 1346: the canvas's places, shape by shape
    mo = body.get("mask_opts") if (body.get("mask") or body.get("fit") or place) else None   # HERESY 1320: the mask's options
    if mo:
        try:
            mo = {"grow": int(mo.get("grow") or 0), "edge": int(mo.get("edge", 12)), "soft": bool(mo.get("soft")), "grain": round(float(mo.get("grain") or 0), 2)}
        except (TypeError, ValueError, AttributeError):
            raise ValueError("the mask's options: grow and edge in pixels, soft, grain")
        if not (-64 <= mo["grow"] <= 128 and 0 <= mo["edge"] <= 96 and 0 <= mo["grain"] <= 0.6):
            raise ValueError("the mask's options: grow -64 to 128 px, edge 0 to 96 px, grain 0 to 0.6")
        ask["mask_opts"] = mo
    smp = sampling(painter, body.get("sampling"))
    if smp:
        ask["sampling"] = smp                            # HERESY 1319
    if ref:                                          # HERESY 1305: kept beside the run, read by artist_job.py
        name = "ref" + ref[0]
        (d / name).write_bytes(ref[1])
        ask.update(ref=name, strength=strength)
        if body.get("fit"):                          # HERESY 1307: the whole picture in each shape, the edges painted around it
            ask.update(fit=True) if place else ask.update(fit=True, strength=1.0)   # HERESY 1346: a placed shape keeps the strength asked
        if place:
            ask["place"] = place                     # HERESY 1346
        if mask:                                     # HERESY 1306: what to repaint
            (d / "mask.png").write_bytes(mask)
            ask["mask"] = "mask.png"
    with open(d / "ask.json", "w", encoding="utf-8") as f:
        json.dump(ask, f, ensure_ascii=False, indent=1)
    run = dict(ask, id=rid, painter=painter, take=take, created=time.time(), status="queued", of=count * len(shapes), pictures=[])
    if ref:
        run["ref_from"] = ref_from                   # HERESY 1305: «a picture of one's own» or the run and picture it came from
        if mask:
            run["masked"] = True                     # HERESY 1306
        if body.get("fit"):
            run["fit"] = True                        # HERESY 1307: painted around
    write(d, run)
    job = {"status": "queued", "started": time.time(), "kind": "artist"}
    with H["lock"]:
        H["jobs"]["artist:" + rid] = job
    threading.Thread(target=work, args=(d, run, job), daemon=True).start()
    return run


REF_MAX = 40 * 2 ** 20                               # HERESY 1305: a reference picture's bytes at most


def _places(p):
    """HERESY 1346: the canvas's places, checked: {shape: {x, y, s}}, x and y the picture's middle in the frame's share (-1 to 2), s its
    width in frame widths (0.05 to 6); none, {}."""
    if not p:
        return {}
    if not isinstance(p, dict):
        raise ValueError("the canvas's places: one a shape")
    out = {}
    for k, v in p.items():
        if k not in SHAPES or not isinstance(v, dict):
            continue
        try:
            x, y, s = float(v["x"]), float(v["y"]), float(v["s"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("a shape's place on the canvas: x, y and s, numbers")
        if not (-1 <= x <= 2 and -1 <= y <= 2 and 0.05 <= s <= 6):
            raise ValueError("a shape's place on the canvas: x and y from -1 to 2, s from 0.05 to 6")
        out[k] = {"x": round(x, 4), "y": round(y, 4), "s": round(s, 4)}
    return out


def _reference(body):
    """HERESY 1305: the reference picture a run paints from: (suffix, bytes) or None, where it came from, and the strength
    (0.2 to 1.0, 0.6 by default). Either a picture of one's own as a data URL (PNG, JPEG or WebP, told by its first bytes)
    or {"id", "file"}: a picture of an earlier run."""
    ref = body.get("ref")
    if not ref:
        return None, None, None
    try:
        strength = float(body.get("strength") if body.get("strength") is not None else 0.6)
    except (TypeError, ValueError):
        raise ValueError("the strength is a number from 0.2 to 1.0")
    if not 0.2 <= strength <= 1.0:
        raise ValueError("the strength is a number from 0.2 to 1.0")
    if isinstance(ref, dict):
        p, _ = picture(str(ref.get("id") or ""), str(ref.get("file") or ""))
        data, where = p.read_bytes(), f"{ref.get('id')}/{ref.get('file')}"
    else:
        import base64
        m = re.match(r"^data:image/[\w.+-]+;base64,(.+)$", str(ref), re.S)
        if not m:
            raise ValueError("the reference picture comes as a data URL (PNG, JPEG or WebP) or as a picture of a run")
        if len(m.group(1)) > REF_MAX * 4 // 3 + 4:
            raise ValueError(f"the reference picture is larger than {REF_MAX // 2 ** 20} MB")
        try:
            data = base64.b64decode(m.group(1), validate=False)
        except ValueError:
            raise ValueError("the reference picture could not be read")
        where = "a picture of one's own"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        suffix = ".png"
    elif data[:3] == b"\xff\xd8\xff":
        suffix = ".jpg"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        suffix = ".webp"
    else:
        raise ValueError("the reference picture is not a PNG, JPEG or WebP")
    return (suffix, data), where, round(strength, 2)


def _mask(body):
    """HERESY 1306: the mask a run repaints by (a PNG data URL: white repaints, black keeps), its bytes, or None."""
    m = body.get("mask")
    if not m:
        return None
    if isinstance(m, dict):                          # «Again»: the run's own mask
        p, _ = picture(str(m.get("id") or ""), str(m.get("file") or ""))
        data = p.read_bytes()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("the mask is not a PNG")
        return data
    import base64
    g = re.match(r"^data:image/png;base64,(.+)$", str(m), re.S)
    if not g or len(g.group(1)) > REF_MAX * 4 // 3 + 4:
        raise ValueError("the mask comes as a PNG data URL")
    data = base64.b64decode(g.group(1), validate=False)
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("the mask is not a PNG")
    return data


def work(d, run, job):
    key, need, gpu = "artist:" + run["id"], NEED[run["painter"]] + sum(x.get("mb", 0) for x in run.get("loras") or []), None   # HERESY 1316
    try:
        while True:                                  # in the queue for a card, then for its turn (as the artwork waits)
            try:
                H["wait_card"](job, need, f"the Artist · {run['id']}")
            except RuntimeError as e:                # HERESY 1342: no card here takes it whole: its painter's blocks stream from RAM
                if not str(e).startswith("no card here can take this") or run["painter"] not in STREAM_NEED or run.get("stream"):
                    raise
                run["stream"] = True
                need = STREAM_NEED[run["painter"]]
                write(d, run)
                H["say"](f"the Artist · {run['id']} · no card here takes it whole: its painter's blocks will stream from RAM (slower)")
                continue
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
                if run.get("stream"):
                    env["ART_STREAM"] = "1"                 # HERESY 1342
                p = subprocess.Popen([str(H["py"]), str(HERE / "artist_job.py"), str(d)], env=env, text=True,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                job["proc"] = p                      # HERESY 1270: for Stop
                errs = collections.deque(maxlen=40)
                # HERESY 1340: a painter is stopped when it is quiet, not when it is slow (a cap on the whole run stopped fp8 runs of
                # three shapes in their second picture): no line, its progress on stderr included, for ten minutes while it loads,
                # five once it paints
                seen = {"t": time.time(), "painting": False, "over": False}

                def drain():
                    for x in p.stderr:
                        errs.append(x)
                        seen["t"] = time.time()
                        if "it/s" in x or "s/it" in x:
                            seen["painting"] = True

                def quiet():
                    while p.poll() is None and not seen["over"]:
                        q = QUIET_PAINT if seen["painting"] else QUIET_LOAD
                        if time.time() - seen["t"] > q:
                            seen["why"] = f"its painter said nothing for {q // 60} minutes: stopped" if q >= 60 else f"its painter said nothing for {q} s: stopped"
                            p.kill()
                            return
                        time.sleep(min(5, max(0.2, q / 10)))
                t = threading.Thread(target=drain, daemon=True)
                t.start()
                watch = threading.Thread(target=quiet, daemon=True)
                watch.start()
                try:
                    for line in p.stdout:            # each picture as it comes, so the page shows them one by one
                        seen["t"] = time.time()
                        try:
                            row = json.loads(line)
                        except ValueError:
                            continue
                        if row.get("done"):
                            run["took"] = row.get("took")
                            if row.get("peak_gb") is not None:
                                run["peak_gb"] = row["peak_gb"]   # HERESY 1342: the card's peak
                        elif "stream" in row:        # HERESY 1342: the painter's blocks streamed from RAM (asked, or its own choice)
                            run["streamed"] = {k: row.get(k) for k in ("weights_gb", "free_gb", "asked", "kept", "of")}
                            write(d, run)
                            H["say"](f"the Artist · {run['id']} · its painter streams from RAM: {row.get('weights_gb')} GB of weights, "
                                     f"{row.get('free_gb')} GB free on its card, " + (f"{row.get('kept')} of its {row.get('of')} blocks kept on it"
                                     if row.get("kept") else "every block streamed"))
                        elif "loras" in row:         # HERESY 1316: the adapters on, each with the layers it reached
                            run["loras_on"] = row["loras"]
                            write(d, run)
                        elif "live" in row:          # HERESY 1257: the step being painted, its picture an eighth the size
                            run["live"] = dict(row, t=time.time())
                            write(d, run)
                        else:
                            run.pop("live", None)
                            run["pictures"].append(row)
                            write(d, run)
                    p.wait(timeout=60)
                finally:
                    seen["over"] = True
                t.join(timeout=5)
                if job.get("stop"):                  # HERESY 1270: ended on purpose; what it finished is kept
                    raise Stopped()
                if p.returncode != 0 and seen.get("why"):   # HERESY 1340: the watchdog's reason, not the last progress line
                    raise RuntimeError(seen["why"])
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
        if job.get("stop"):                          # HERESY 1270: Stop, waiting or drawing
            kept = [x for x in run["pictures"] if x.get("kept")]
            run.update(status="stopped", ended=time.time())
            write(d, run)
            H["say"](f"the Artist · {run['id']} · stopped: {len(kept)} of {run['of']} picture(s) kept")
            return
        run.update(status="failed", error=str(e), ended=time.time())
        write(d, run)
        H["say"](f"the Artist · {run['id']} · failed: {e}")
    finally:
        with H["lock"]:
            H["jobs"].pop(key, None)


class Stopped(Exception):
    """HERESY 1270: a run ended by Stop."""


def stop(rid):
    """HERESY 1270 (Viktor 09.10.2026: «Кнопку DRAW нужно заменять на STOP»): a run waiting for its card or its turn is taken off the
    queue; a drawing one has its painter ended (terminated, killed after five seconds if it lingers). Either ends «stopped», with the
    pictures it finished."""
    rid = str(rid or "")
    with H["lock"]:
        job = H["jobs"].get("artist:" + rid)
        if not job:
            raise ValueError("this run is not drawing")
        job["stop"] = job["cancel"] = True
        p = job.get("proc")
    if p is not None and p.poll() is None:
        p.terminate()
        threading.Timer(5, lambda: p.poll() is None and p.kill()).start()
    return {"id": rid, "stopping": True}


def trash_dir():
    """HERESY 1310: where the Artist's trashed runs lie."""
    return H["kit"] / "trash" / "artist"


def trashed():
    """HERESY 1310: the runs in the trash, the newest first, each as its run.json says it (with when it was trashed)."""
    out = []
    t = trash_dir()
    if t.is_dir():
        for d in sorted(t.iterdir(), reverse=True):
            if d.is_dir() and RUN_RE.match(d.name):
                r = read(d)
                if r:
                    try:
                        r["trashed_at"] = int(d.stat().st_mtime)
                    except OSError:
                        pass
                    out.append(r)
    return {"runs": out}


def picture(rid, name, in_trash=False):
    """A picture of a run, or its thumbnail: (path, type); HERESY 1310: of a run in the trash with in_trash."""
    if in_trash:
        if not RUN_RE.match(str(rid or "")) or not (trash_dir() / str(rid) / "run.json").is_file():
            raise FileNotFoundError(f"no run {rid} in the trash")
        d = trash_dir() / rid
    else:
        d = run_dir(rid)
    if not FILE_RE.match(str(name or "")):
        raise ValueError("bad picture name")
    p = d / name
    if not p.is_file():
        raise FileNotFoundError("no such picture")
    return p, {".png": "image/png", ".webp": "image/webp"}.get(p.suffix, "image/jpeg")


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


UPSCALE_MAX = 10240                                     # HERESY 1322: the long side of an upscaled picture, at most
TARGETS = {"2k": 2560, "4k": 3840}                      # HERESY 1332: the long side of 2K and 4K (QHD and UHD)


def upscalers():
    """HERESY 1322: the upscalers in artwork/upscalers/ (a face restorer is not one), each with its scale by its name and its size."""
    d = _art("upscalers")
    out = []
    if d.exists():
        for p in sorted(d.rglob("*")):
            if p.suffix.lower() in (".pth", ".safetensors") and p.is_file() and not re.search(r"gfpgan|codeformer|restoreformer", p.name, re.I):
                m = re.match(r"^(\d)x", p.name, re.I)
                out.append({"name": p.relative_to(d).as_posix(), "scale": int(m.group(1)) if m else 4, "mb": round(p.stat().st_size / 2 ** 20, 1)})
    return {"upscalers": out}


def upscale(body):
    """HERESY 1322: a picture upscaled 2 or 4 times, as a run of its own (its source, the model and the factor said)."""
    rid, name = str(body.get("id") or ""), str(body.get("file") or "")
    picture(rid, name)
    src = read(run_dir(rid)) or {}
    pic = next((x for x in src.get("pictures") or [] if x.get("file") == name), None)
    if pic is None or not pic.get("kept"):
        raise FileNotFoundError("no such picture in the run")
    model = str(body.get("model") or "")
    if model not in [u["name"] for u in upscalers()["upscalers"]]:
        raise ValueError("pick an upscaler: one of artwork/upscalers/ (ESRGAN, DAT, HAT, SPAN… as .pth or .safetensors)")
    w0, h0 = int(pic.get("w") or 0), int(pic.get("h") or 0)
    target, size = str(body.get("target") or "").lower(), None
    if target in TARGETS:                                # HERESY 1332: 2K or 4K by the long side, the size exact
        long = max(w0, h0)
        if not long:
            raise ValueError("the picture's size is not known")
        if long >= TARGETS[target]:
            raise ValueError(f"it is {w0}×{h0} already: {target.upper()} is {TARGETS[target]} px on its long side")
        size = [round(w0 * TARGETS[target] / long), round(h0 * TARGETS[target] / long)]
        factor = 4 if TARGETS[target] / long > 2 else 2
    else:
        target = ""
        factor = 4 if int(body.get("factor") or 2) >= 4 else 2
    side = max(size) if size else max(w0, h0) * factor
    if side > UPSCALE_MAX:
        raise ValueError(f"too large: {side} px on the long side, {UPSCALE_MAX} is the most (upscale the picture once, or ×2)")
    nid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    d = home() / nid
    d.mkdir(parents=True)
    ask = {"source": {"id": rid, "file": name}, "model": model, "factor": factor, "shape": pic.get("shape") or "1:1", "seed": pic.get("seed") or 0}
    if size:
        ask.update(size=size, target=target)
    with open(d / "ask.json", "w", encoding="utf-8") as f:
        json.dump(ask, f, ensure_ascii=False, indent=1)
    run = {"id": nid, "kind": "upscale", "prompt": src.get("prompt", ""), "painter": "upscale", "model": model, "factor": factor, "target": target,
           "shapes": [ask["shape"]], "seed": ask["seed"], "count": 1, "take": src.get("take"), "created": time.time(), "status": "queued", "of": 1,
           "pictures": [], "upscaled_from": {"id": rid, "file": name, "painter": src.get("painter")}}
    write(d, run)
    job = {"status": "queued", "started": time.time(), "kind": "artist"}
    with H["lock"]:
        H["jobs"]["artist:" + nid] = job
    threading.Thread(target=work, args=(d, run, job), daemon=True).start()
    return run


def aside(body):
    """HERESY 1321: pictures put aside (or brought back with aside false), one or many; their runs say so; a run with nothing left
    to show goes to the trash. {aside, done: [{id, file}], trashed: [run ids]}"""
    items, on = body.get("items") or [], body.get("aside") is not False
    if not isinstance(items, list) or not items or len(items) > 500:
        raise ValueError("the pictures: one to five hundred")
    by = {}
    for it in items:
        rid, name = str((it or {}).get("id") or ""), str((it or {}).get("file") or "")
        picture(rid, name)
        by.setdefault(rid, set()).add(name)
    with H["lock"]:
        busy = [r for r in by if "artist:" + r in H["jobs"]]
    if busy:
        raise ValueError("a run is drawing: put its pictures aside when it ends")
    done, gone = [], []
    for rid, names in by.items():
        d = run_dir(rid)
        run = read(d) or {}
        for pic in run.get("pictures") or []:
            if pic.get("file") in names:
                if on:
                    pic["aside"] = True
                else:
                    pic.pop("aside", None)
                done.append({"id": rid, "file": pic["file"]})
        write(d, run)
        if on and not any(p.get("kept") and not p.get("aside") for p in run.get("pictures") or []):
            trash(rid)                                   # nothing of it left to show: the run itself to the trash
            gone.append(rid)
    return {"aside": on, "done": done, "trashed": gone}


def asides():
    """HERESY 1321: the pictures put aside, the newest run first, each with its run's prompt, painter and time."""
    out = []
    for r in runs()["runs"]:
        for p in r.get("pictures") or []:
            if p.get("kept") and p.get("aside"):
                out.append({"id": r["id"], "file": p["file"], "thumb": p.get("thumb"), "shape": p.get("shape"), "seed": p.get("seed"),
                            "prompt": r.get("prompt", ""), "painter": r.get("painter", ""), "created": r.get("created")})
    return {"pictures": out}


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


# ------------------------------------------------------------------ HERESY 1337: the art's trash
# Viktor 10.10.2026: «картинки у нас куда удаляются с обложек треков и остального? Может отдельный Trash сделать в колонке воркспейсов?
# `Trash (Art)`. Вижу Trash у Артиста, но пока что очистки и удаления нет.» The art put away lies in three places: the Artist's runs in
# KIT/trash/artist/, the pictures put aside (in their runs still), the covers taken off the takes (each take's artwork-removed/: by a
# redraw, by Remove, by a new cover). Here they are one trash: each comes back, or goes for good on the user's word (the page asks
# first); a frozen workspace's takes keep theirs as they are.
STAMP_RE = re.compile(r"^\d{8}-\d{6}(?:-\d+)?$")


def _size(*paths):
    n = 0
    for p in paths:
        try:
            if p.is_dir():
                n += sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
            elif p.is_file():
                n += p.stat().st_size
        except OSError:
            pass
    return n


def _frozen():
    """The takes of the frozen workspaces (heard, never changed); the marks unread raise: no take is then taken for thawed."""
    return set(H["frozen"]()) if H.get("frozen") else set()


def _covers(frozen):
    """The covers taken off the takes, the newest first: each take's artwork-removed/STAMP.jpg, its .json saying what drew it."""
    out, root = [], H.get("outputs")
    if not root or not Path(root).is_dir():
        return out
    for d in Path(root).iterdir():
        keep = d / "artwork-removed"
        if not keep.is_dir():
            continue
        try:
            title = json.load(open(d / "meta.json", encoding="utf-8")).get("title") or d.name
        except (OSError, ValueError):
            title = d.name
        for f in keep.glob("*.jpg"):
            if not STAMP_RE.match(f.stem):
                continue
            try:
                meta = json.load(open(f.with_suffix(".json"), encoding="utf-8"))
            except (OSError, ValueError):
                meta = {}
            out.append({"take": d.name, "title": title, "stamp": f.stem, "when": int(f.stat().st_mtime), "bytes": _size(f, f.with_suffix(".json")),
                        "painter": meta.get("painter") or "", "prompt": meta.get("prompt") or "", "by": meta.get("by") or "", "frozen": d.name in frozen})
    out.sort(key=lambda c: (c["stamp"], c["take"]), reverse=True)
    return out


def bin_list():
    """HERESY 1337: the art's trash as one: {runs, pictures, covers, bytes}."""
    runs = trashed()["runs"]
    for r in runs:
        r["bytes"] = _size(trash_dir() / r["id"])
    pics = asides()["pictures"]
    for p in pics:
        d = run_dir(p["id"])
        p["bytes"] = _size(d / p["file"], *([d / p["thumb"]] if p.get("thumb") else []))
    covers = _covers(_frozen())
    return {"runs": runs, "pictures": pics, "covers": covers, "bytes": sum(x["bytes"] for x in runs + pics + covers)}


def bin_file(take, stamp):
    """HERESY 1337: a cover taken off a take, to be seen in the trash."""
    if not STAMP_RE.match(str(stamp or "")):
        raise ValueError("bad stamp")
    f = H["take_dir"](str(take or "")) / "artwork-removed" / f"{stamp}.jpg"
    if not f.is_file():
        raise FileNotFoundError("no such cover in the trash")
    return f


def _cover_back(take, stamp):
    """A cover given back to its take; the one it has now takes its place in artwork-removed/, as a redraw keeps one."""
    d = H["take_dir"](take)
    keep = d / "artwork-removed"
    f = keep / f"{stamp}.jpg"
    if not f.is_file():
        raise FileNotFoundError("no such cover in the trash")
    with H["lock"]:
        job = H["jobs"].get("art:" + take)
        if job and job.get("status") in ("queued", "running"):
            raise ValueError("its picture is being drawn: give the old one back when it is done")
    cur = d / "artwork.jpg"
    if cur.is_file():
        s, k = time.strftime("%Y%m%d-%H%M%S"), 2
        while (keep / f"{s}.jpg").exists():
            s, k = time.strftime("%Y%m%d-%H%M%S") + f"-{k}", k + 1
        cur.replace(keep / f"{s}.jpg")
        if (d / "artwork.json").is_file():
            (d / "artwork.json").replace(keep / f"{s}.json")
    f.replace(cur)
    os.utime(cur, None)                              # newer than the take's MP3s, made again with it; the page fetches it anew
    if f.with_suffix(".json").is_file():
        f.with_suffix(".json").replace(d / "artwork.json")
    for mp3 in d.glob("audio-*k.mp3"):               # they carry the cover they were made with: made again on the next download
        mp3.unlink(missing_ok=True)
    try:
        keep.rmdir()                                 # when nothing is left in it
    except OSError:
        pass


def _cover_gone(take, stamp):
    d = H["take_dir"](take)
    keep = d / "artwork-removed"
    f = keep / f"{stamp}.jpg"
    if not f.is_file():
        raise FileNotFoundError("no such cover in the trash")
    f.unlink()
    f.with_suffix(".json").unlink(missing_ok=True)
    try:
        keep.rmdir()
    except OSError:
        pass


def _picture_gone(rid, name):
    """A picture put aside deleted for good: its PNG and its thumbnail, and its line in run.json (a line without its picture
    would show as one the content filter took)."""
    picture(rid, name)
    with H["lock"]:
        if "artist:" + rid in H["jobs"]:
            raise ValueError("a run is drawing: delete its pictures when it ends")
    d = run_dir(rid)
    run = read(d) or {}
    pic = next((x for x in run.get("pictures") or [] if x.get("file") == name), None)
    if not pic or not pic.get("aside"):
        raise ValueError("only a picture put aside goes for good")
    for rel in [pic["file"]] + ([pic["thumb"]] if pic.get("thumb") else []):
        if FILE_RE.match(rel):
            (d / rel).unlink(missing_ok=True)
    run["pictures"] = [x for x in run["pictures"] if x is not pic]
    write(d, run)


def _run_gone(rid):
    if not RUN_RE.match(str(rid or "")):
        raise ValueError("bad run id")
    d = trash_dir() / rid
    if not (d / "run.json").is_file():
        raise FileNotFoundError(f"no run {rid} in the trash")
    shutil.rmtree(d)


def bin_act(body):
    """HERESY 1337: {op: restore | delete | empty, items: [{kind: run, id} | {kind: picture, id, file} | {kind: cover, take, stamp}]}:
    each given back, or deleted for good; empty: all the trash lists but a frozen workspace's covers. {op, done, kept: [{…, why}]}"""
    op = str(body.get("op") or "")
    if op not in ("restore", "delete", "empty"):
        raise ValueError("op: restore, delete or empty")
    frozen = _frozen()
    if op == "empty":
        b = bin_list()
        items = [{"kind": "run", "id": r["id"]} for r in b["runs"]] + [{"kind": "picture", "id": p["id"], "file": p["file"]} for p in b["pictures"]] + \
                [{"kind": "cover", "take": c["take"], "stamp": c["stamp"]} for c in b["covers"] if not c["frozen"]]
    else:
        items = body.get("items")
        if not isinstance(items, list) or not items or len(items) > 5000:
            raise ValueError("the items: one to five thousand")
    done, kept = [], []
    for it in items:
        it = it if isinstance(it, dict) else {}
        kind = str(it.get("kind") or "")
        try:
            if kind == "run":
                (restore if op == "restore" else _run_gone)(str(it.get("id") or ""))
            elif kind == "picture":
                rid, name = str(it.get("id") or ""), str(it.get("file") or "")
                if op == "restore":
                    aside({"items": [{"id": rid, "file": name}], "aside": False})
                else:
                    _picture_gone(rid, name)
            elif kind == "cover":
                take, stamp = str(it.get("take") or ""), str(it.get("stamp") or "")
                if not STAMP_RE.match(stamp):
                    raise ValueError("bad stamp")
                if take in frozen:
                    raise ValueError("its workspace is frozen: its takes are never changed")
                (_cover_back if op == "restore" else _cover_gone)(take, stamp)
            else:
                raise ValueError("kind: run, picture or cover")
            done.append(it)
        except (ValueError, FileNotFoundError, OSError) as e:
            kept.append(dict(it, why=str(e)))
    if done:
        H["say"](f"the art's trash · {'given back' if op == 'restore' else 'deleted for good'}: {len(done)}" + (f" · {len(kept)} stayed" if kept else ""))
    return {"op": op, "done": done, "kept": kept}


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
