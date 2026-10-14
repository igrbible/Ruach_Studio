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
    POST /artist/unload                     HERESY 1370: the painters kept between runs, let go (the busy ones paint on)
    POST /artist/covers {items | id}        HERESY 1372: which takes have one of these pictures as their cover now
    GET  /artist/prompt?name=TAKE           a prompt to start from: the one the take's artwork was drawn from, else
                                            one from its title and style"""
import collections, json, os, queue, random, re, shutil, subprocess, threading, time
from pathlib import Path

import artist_loras                                   # HERESY 1316: the adapters a run asks for

HERE = Path(__file__).resolve().parent
H = {}                     # the lab's own parts (setup): kit, jobs, lock, wait_card, turn, free_gpu, say, take_dir, pair, copy, painter, py; 1337: outputs, frozen
SHAPES = ("1:1", "16:9", "9:16")
RUN_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")
FILE_RE = re.compile(r"^(?:(?:thumbs/)?\d{2}-(?:1x1|16x9|9x16)-s\d+(?:-up(?:\dx|[24]k|\dp))?\.(?:png|jpg)|preview/\d{2}\.jpg|ref\.(?:png|jpg|webp)|mask\.png)$")   # 1257: a step's picture; 1305: the reference; 1306: its mask; 1364: -upNp, a picture made in passes (1355)
# the card a run needs at its largest shape, the VAE in tiles (RTX 3090, 08.10.2026, reserved at the peak: Q8 15.1 GB at
# 1024², 15.9 at 1280², 16.9 at 1920×1088; Q4 9.3, 10.1, 11.1; untiled the VAE's decode alone took 4 to 8 GB more), with a
# margin for the card's own context
NEED = {}                                          # HERESY 1428: Krea 2 gone; the Qwen painters below
# HERESY 1318: the Qwen painters, by their peaks on an RTX 3090 (10.10.2026, 1328², Lightning on, the encoder gone by then) with a
# margin: 2512 Q4 14.3 GB (15.1 held), Q6 17.6 (19.1), an fp8 fine-tune 21.0 (21.3); Qwen-Image 2.1 16.4 painting from words, 19.1
# editing, its parts on the card in turn
QWEN = {"qwen2512-q4": ("Qwen-Image 2512 · Q4", 15500), "qwen2512-q6": ("Qwen-Image 2512 · Q6", 20000),
        "qwen2512-fp8": ("Qwen-Image 2512 · fp8", 22500), "qwen21": ("Qwen-Image 2.1 · research licence", 21000)}
NEED.update({k: v[1] for k, v in QWEN.items()})
NEED["upscale"] = 4000                                # HERESY 1322: a DAT 4x model peaked at 2.1 GB in tiles of 512 (RTX 3090)
QWEN21_STREAM_MB = 9500                              # HERESY 1386: Qwen-Image 2.1 streamed, encoder and transformer both: 4.1 GB at the peak from words, 7.9 editing (3090)
# HERESY 1342: the card a run needs when its painter's blocks stream from RAM (artist_qwen.place), asked when no card here takes it whole
STREAM_NEED = {"qwen2512-fp8": 6000, "qwen2512-q4": 5000, "qwen2512-q6": 5500, "qwen21": QWEN21_STREAM_MB}   # measured 10.10.2026: 2.3 GB at the peak with every block streamed (1328², Lightning, four adapters)
QWEN_NOTE = {"qwen21": "Qwen-Image 2.1 is under the Qwen Research Licence: research and evaluation only, not for commercial use "
             "(a cover for a song you sell is commercial use); a reference is a picture it edits by the prompt's words",
             "qwen2512-q4": "Qwen-Image 2512 (Apache-2.0) from a 4-bit GGUF: for a card of 16 GB",
             "qwen2512-q6": "Qwen-Image 2512 (Apache-2.0) from a 6-bit GGUF",
             "qwen2512-fp8": "Qwen-Image 2512 in fp8 from artwork/Qwen-Image-2512/checkpoints/ (ComfyUI's single files): 2512's own BASE file "
                             "paints with Lightning, a fine-tune its finished realism without it unless asked; a card of 24 GB"}
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


def is_base(model):
    """HERESY 1428: an fp8 file of 2512 itself (BASE QW2512 fp8_e4m3fn), not a fine-tune: artist_qwen.is_base's rule, without its imports."""
    return bool(model) and Path(str(model)).name.upper().startswith("BASE")


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
    out = []                                          # HERESY 1428: Krea 2 gone
    for k, (label, need) in QWEN.items():
        e = {"key": k, "label": label, "need_mb": need, "family": "qwen-image-2.1" if k == "qwen21" else "qwen-image-2512",
             "ready": qwen_ready(k), "note": QWEN_NOTE.get(k, "")}
        if k == "qwen2512-fp8":
            e["models"] = qwen_models()
            e["bases"] = [m for m in e["models"] if is_base(m)]   # HERESY 1428: 2512 itself in fp8: a brush with Lightning
        if k != "qwen21":
            e["lightning"] = _art("Qwen-Image-2512", "lightning", "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors").exists()
        out.append(e)
    cards = H["job_cards"]() if H.get("job_cards") else []   # HERESY 1354: the lab's cards, each one's room
    for e in out:
        e["cards"] = sum(1 for room in cards if room >= e["need_mb"]) or 1
    return {"painters": out}


SAMPLERS = ("euler", "euler-sde", "er_sde", "res_2s", "res_2s_ode", "res_3s", "res_3s_ode", "heunpp2", "exp_heun_2_x0", "exp_heun_2_x0_sde")   # HERESY 1333
SCHEDULES = ("simple", "karras", "exponential", "beta", "beta57", "kl_optimal", "sgm_uniform", "bong_tangent")


def sampling(painter, s, model=""):
    """HERESY 1319: a run's sampling as asked, checked by its painter; {} for the painter's own. 1428: the fp8 file it paints with
    (2512's own BASE paints with Lightning by default, a fine-tune without it)."""
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
    fine = painter == "qwen2512-fp8" and not is_base(model)
    fast = (painter.startswith("qwen2512") and (light > 0 if light is not None else not fine))
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
    letters = _letters(body)                         # HERESY 1394: the lettering's words, asked apart from the prompt
    if not prompt and not (letters and letters["way"] == "letter"):
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
    ref_as = str(body.get("ref_as") or "")            # HERESY 1388: the picture edited by words, or its style alone (Qwen-Image 2.1)
    if ref_as not in ("", "edit", "style"):
        raise ValueError("a reference is used to paint from, to edit by words («edit») or for its style («style»)")
    if ref_as and (painter != "qwen21" or not body.get("ref")):
        raise ValueError("editing by words and a style reference are Qwen-Image 2.1's: choose it as the painter, with a picture")
    if letters and painter not in QWEN:                # HERESY 1394
        raise ValueError("lettering is painted by Qwen-Image: choose one of its brushes")
    if letters and letters["way"] == "letter" and (painter != "qwen21" or not body.get("ref") or ref_as == "style"):
        raise ValueError("lettering a finished picture is Qwen-Image 2.1's edit by words: choose it as the painter, the picture as its reference")
    if letters and letters["way"] == "letter":
        ref_as = "edit"
    if painter == "qwen21" and (body.get("mask") or body.get("fit")):
        raise ValueError("Qwen-Image 2.1 edits a picture by the prompt's words: a mask or «Paint around it» wants Qwen-Image 2512")
    if painter not in NEED:
        raise ValueError("the Artist paints with Qwen-Image's brushes (Krea 2 left the studio, HERESY 1428): Engine → Models and LoRAs → Qwen painters")
    loras = artist_loras.chosen(H["kit"], painter, body.get("loras"))   # HERESY 1316: checked now, their size asked of the card too
    need = dict(NEED, **{painter: NEED[painter] + sum(x["mb"] for x in loras)})
    why = H["refusal"](painter, need, "choose it as the painter here") if H.get("refusal") else ""   # HERESY 1297: said now
    if why and painter in STREAM_NEED and not H["refusal"](painter, dict(need, **{painter: STREAM_NEED[painter]}), ""):
        why = ""                                     # HERESY 1342: too big for a card whole, it will stream its blocks from RAM
    if why:
        raise ValueError(why)
    ref, ref_from, strength = _reference(body)          # HERESY 1305: a picture to paint from, or None
    scale = _scale(body, painter, ref)               # HERESY 1384: a second pass over it at 1.5 or 2 times, or None
    regions = _regions(body, painter)                # HERESY 1387: checked before the run's folder is made
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
    if regions:
        ask["regions"] = regions                     # HERESY 1387: the regions' own words
    if ref_as:
        ask["ref_as"] = ref_as                       # HERESY 1388
    if letters:
        ask["letters"] = letters                     # HERESY 1394
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
    if scale:                                        # HERESY 1384: the second pass, the picture brought up by nearest as his workflow does
        ask.update(scale=scale, ref_resample="nearest")
    smp = sampling(painter, body.get("sampling"), model)   # HERESY 1428: by the fp8 file too
    if smp:
        ask["sampling"] = smp                            # HERESY 1319
    if ref:                                          # HERESY 1305: kept beside the run, read by artist_job.py
        name = "ref" + ref[0]
        (d / name).write_bytes(ref[1])
        ask.update(ref=name, strength=strength)
        inject = _inject(body)                       # HERESY 1385: his InjectLatentNoise+, fresh noise on the picture first
        if inject:
            ask["inject"] = inject
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
SCALE_MB = {}                                        # HERESY 1384: the more a second pass asks of the card, by painter (measured)


def second_pass_mb(run):
    """HERESY 1384: the MiB a second pass asks beyond its painter's own (its picture 1.5 or 2 times larger), 0 for a run of its own size."""
    s = float(run.get("scale") or 1)
    return 0 if s == 1 else int(SCALE_MB.get(run["painter"], 6000) * (s * s - 1) / 3)


def _scale(body, painter, ref):
    """HERESY 1384 (Viktor's ComfyUI workflow, AIO QWEN IMAGE 2512 HERESY Draft #4: «1st Pass + 2x Upscale», then the second KSampler
    from step 20 of 60): a second pass paints over a picture of an earlier run at 1.5 or 2 times its shape's size; None when not asked."""
    s = body.get("scale")
    if s in (None, "", 1, 1.0, "1"):
        return None
    try:
        s = float(s)
    except (TypeError, ValueError):
        raise ValueError("the second pass: 1.5 or 2 times the picture")
    if s not in (1.5, 2.0):
        raise ValueError("the second pass: 1.5 or 2 times the picture")
    if not ref:
        raise ValueError("a second pass paints over a picture: it goes with the picture to paint over")
    if painter == "qwen21":
        raise ValueError("Qwen-Image 2.1 edits a picture by the prompt's words: a second pass wants Qwen-Image 2512")
    if body.get("mask") or body.get("fit") or body.get("place"):
        raise ValueError("a second pass paints over the whole picture: no mask, no canvas")
    return s


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


def _regions(body, painter):
    """HERESY 1387: up to three regions, [{"prompt", "box": [x, y, w, h] in the frame's shares}]; a region without words is left out;
    none, []."""
    rs = body.get("regions") or []
    if not rs:
        return []
    if painter == "qwen21":
        raise ValueError("Qwen-Image 2.1 edits a picture by the prompt's words: regions want Qwen-Image 2512")
    if not isinstance(rs, list) or len(rs) > 3:
        raise ValueError("regions: three at most")
    out = []
    for r in rs:
        try:
            p = str(r.get("prompt") or "").strip()
            x, y, w, h = (float(v) for v in r.get("box"))
        except (TypeError, ValueError, AttributeError):
            raise ValueError("a region: its words and its box [x, y, w, h] in the frame's shares")
        if not p:
            continue
        if len(p) > 600:
            raise ValueError("a region's words: 600 characters at most")
        if not (0 <= x < 1 and 0 <= y < 1 and 0.05 <= w <= 1 and 0.05 <= h <= 1 and x + w <= 1.001 and y + h <= 1.001):
            raise ValueError("a region's box: inside the frame, at least a twentieth of it wide and high")
        out.append({"prompt": p, "box": [round(x, 4), round(y, 4), round(w, 4), round(h, 4)]})
    return out


LETTER_PLACES = ("top", "middle", "bottom")


def _letters(body):
    """HERESY 1394: a picture's lettering, its words in fields of their own: {"title", "sub", "look", "where", "way"} (way «paint»: painted
    with the picture; «letter»: a finished picture, the reference, lettered by Qwen-Image 2.1); no title, None."""
    L = body.get("letters")
    if not L:
        return None
    if not isinstance(L, dict):
        raise ValueError("lettering: its title, a second line, the look of the letters, where and how")
    title, sub, look = (" ".join(str(L.get(k) or "").split()) for k in ("title", "sub", "look"))
    if not title:
        return None
    if len(title) > 60 or len(sub) > 80 or len(look) > 400:
        raise ValueError("lettering: the title 60 characters at most, the second line 80, the look of the letters 400")
    where, way = str(L.get("where") or "top"), str(L.get("way") or "paint")
    if where not in LETTER_PLACES:
        raise ValueError("lettering: at the top, in the middle or at the bottom")
    if way not in ("paint", "letter"):
        raise ValueError("lettering: painted with the picture («paint») or on a finished one («letter»)")
    return {"title": title, "sub": sub, "look": look, "where": where, "way": way}


def _inject(body):
    """HERESY 1385: the noise added to the picture's latents before a run paints from it (his ComfyUI workflow's InjectLatentNoise+), 0 to 2;
    0 or none, None."""
    v = body.get("inject")
    if v in (None, "", 0, "0"):
        return None
    try:
        v = round(float(v), 2)
    except (TypeError, ValueError):
        raise ValueError("the extra noise is a number from 0 to 2")
    if not 0 <= v <= 2:
        raise ValueError("the extra noise is a number from 0 to 2")
    return v or None


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
    more = second_pass_mb(run)                       # HERESY 1384: a second pass's larger picture
    need += more
    try:
        _settle(run)                                 # HERESY 1370c: a kept painter putting its weights away, waited for
        while True:                                  # in the queue for a card, then for its turn (as the artwork waits)
            try:
                H["wait_card"](job, need, f"the Artist · {run['id']}", held=lambda: _kept_held(run))   # HERESY 1378
            except RuntimeError as e:                # HERESY 1342: no card here takes it whole: its painter's blocks stream from RAM
                if not str(e).startswith("no card here can take this") or run["painter"] not in STREAM_NEED or run.get("stream"):
                    raise
                run["stream"] = True
                need = STREAM_NEED[run["painter"]] + more   # HERESY 1384
                write(d, run)
                H["say"](f"the Artist · {run['id']} · no card here takes it whole: its painter's blocks will stream from RAM (slower)")
                continue
            with H["turn"](job):
                try:
                    gpu = _kept_card(run, need)      # HERESY 1370b: the card of its painter kept, when it has room
                    if gpu is None:
                        gpu, _ = H["free_gpu"](need, held=_kept_held(run))   # asked again now that its turn has come (1378: held)
                except RuntimeError:
                    job["status"] = "queued"         # the card was taken meanwhile: back to waiting for one
                    continue
                gpus = [gpu] + _more_cards(run, need, gpu)   # HERESY 1354: the lab's other cards with room for it, its pictures shared
                job.update(status="running", gpu=gpu)
                job.pop("waiting", None)
                run.update(status="running", gpu=gpu, began=time.time())
                if len(gpus) > 1:
                    run["gpus"] = gpus
                    H["say"](f"the Artist · {run['id']} · its {run['of']} pictures on {len(gpus)} cards at once: GPU " + ", ".join(str(g) for g in gpus))
                write(d, run)
                lock, lives, outs, threads = threading.Lock(), {}, [], []
                for g, only in zip(gpus, _shares(run["of"], len(gpus))):
                    o = {}
                    outs.append(o)
                    th = threading.Thread(target=_part_any, args=(d, run, job, g, only, lock, lives, o), daemon=True)   # HERESY 1370
                    th.start()
                    threads.append(th)
                for th in threads:
                    th.join()
                if job.get("stop"):                  # HERESY 1270: ended on purpose; what it finished is kept
                    raise Stopped()
                bad = [o for o in outs if o.get("code") != 0]
                if bad:
                    o = bad[0]
                    if o.get("why"):                 # HERESY 1340: the watchdog's reason, not the last progress line
                        raise RuntimeError(o["why"])
                    last = [x.strip() for x in o.get("errs") or [] if x.strip()]
                    raise RuntimeError("the painter stopped: " + (last[-1][-300:] if last else f"exit {o.get('code')}"))
            break
        kept = [x for x in run["pictures"] if x.get("kept")]
        flagged = len(run["pictures"]) - len(kept)
        run.pop("live", None)
        run.pop("lives", None)                       # HERESY 1354
        run.pop("chain_at", None)                    # HERESY 1355
        run.update(status="done", ended=time.time())
        write(d, run)
        H["say"](f"the Artist ({run['painter']}) · {run['id']} · {len(kept)} of {run['of']} picture(s) in {run.get('took') or 0:.0f} s "
                 f"on GPU {', '.join(str(g) for g in run.get('gpus') or [gpu])}" + (f" · {flagged} not kept: the content filter flagged them" if flagged else ""))
    except Exception as e:                           # Cancelled (taken off the queue) included
        run.pop("live", None)
        run.pop("lives", None)                       # HERESY 1354
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


CARDS_MAX = 4              # HERESY 1354: the cards a run's pictures are spread over, at most
# HERESY 1354: a painter's own RAM at its peak, GB (its VmHWM measured on the Forge 11.10.2026: Krea 2 Muse Q4 17.3, Q8 28.0; Qwen-Image
# 2512 Q4 30.0, Q6 33.4, an fp8 fine-tune 57.8; Qwen-Image 2.1 32.6), its adapters beside it, so that two at once are started only where
# RAM holds both with 8 GB left over
RAM_NEED_GB = {"qwen2512-q4": 31, "qwen2512-q6": 34, "qwen2512-fp8": 58, "qwen21": 33,
               "upscale": 6}                         # HERESY 1364: an upscaler's process (its model tens of MB, a picture of 600 MP at most)


def _ram_free_gb():
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / 2 ** 20
    except (OSError, ValueError, IndexError):
        pass
    return 0.0


def _more_cards(run, need, first):
    """HERESY 1354: the other cards given to the lab's jobs with room for this painter now (never a card of another role), so a run of
    two pictures or more is painted on them at once, each card loading the painter and painting its share; none when the painter
    streams from RAM, and only as many as RAM holds a painter for (the first one's counted)."""
    if int(run.get("of") or 1) < 2 or run.get("stream") or not H.get("more_gpus"):
        return []
    try:
        more = H["more_gpus"](need, exclude=[first], most=min(int(run["of"]), CARDS_MAX) - 1)
    except Exception:                                # a card that cannot be read leaves the run on the one it has
        return []
    each = RAM_NEED_GB.get(run["painter"], 58) + sum(x.get("mb", 0) for x in run.get("loras") or []) / 1024
    room = int((_ram_free_gb() - 8) // each) - 1
    return list(more[:max(0, room)])


def _shares(of, parts):
    """The pictures' numbers in the run (1…of, a variation's shapes in a row) dealt to the cards in turn: [[1, 3], [2]]; one card, [[]]
    (all of them, as before)."""
    if parts <= 1:
        return [[]]
    return [[n for n in range(1, of + 1) if (n - 1) % parts == k] for k in range(parts)]


def _part(d, run, job, gpu, only, lock, lives, out):
    """HERESY 1354: one painter on one card (only: the numbers of its pictures in the run; empty: all of them), its rows into the run
    as they come, under the run's lock; out: {code, why, errs} for the run's thread. The painter alone on the card as before when the
    run has one card: its rows, its watchdog and its Stop are 1340's."""
    try:
        env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", ART_PAINTER=run["painter"])
        if run.get("stream"):
            env["ART_STREAM"] = "1"                 # HERESY 1342
        if only:
            env["ART_ONLY"] = ",".join(str(n) for n in only)
        p = subprocess.Popen([str(H["py"]), str(HERE / "artist_job.py"), str(d)], env=env, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        with lock:
            job.setdefault("procs", []).append(p)    # HERESY 1270, 1354: for Stop, every card's painter
            job["proc"] = p
        errs = collections.deque(maxlen=40)
        # HERESY 1340: a painter is stopped when it is quiet, not when it is slow: no line, its progress on stderr included, for ten
        # minutes while it loads, five once it paints
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
            for line in p.stdout:                    # each picture as it comes, so the page shows them one by one
                seen["t"] = time.time()
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                with lock:
                    _row(d, run, gpu, only, lives, row)
            p.wait(timeout=60)
        finally:
            seen["over"] = True
        t.join(timeout=5)
        out.update(code=p.returncode, why=seen.get("why"), errs=list(errs))
    except Exception as e:                           # said as the run's failure, never lost in a thread
        out.update(code=-1, why=f"the painter on GPU {gpu} could not run: {e}")


def _row(d, run, gpu, only, lives, row):
    """A painter's line into its run (under the run's lock): its end, the streaming said, an upscale's pass, the adapters on, a step
    being painted, a picture; HERESY 1370: a painter kept from the run before, said."""
    if row.get("done"):
        run["took"] = max(run.get("took") or 0, row.get("took") or 0)   # the slowest card's
        if row.get("peak_gb") is not None:
            run["peak_gb"] = max(run.get("peak_gb") or 0, row["peak_gb"])   # HERESY 1342: the card's peak
    elif "stream" in row:            # HERESY 1342: the painter's blocks streamed from RAM (asked, or its own choice)
        run["streamed"] = {k: row.get(k) for k in ("weights_gb", "free_gb", "asked", "kept", "of")}
        write(d, run)
        H["say"](f"the Artist · {run['id']} · its painter streams from RAM: {row.get('weights_gb')} GB of weights, "
                 f"{row.get('free_gb')} GB free on its card, " + (f"{row.get('kept')} of its {row.get('of')} blocks kept on it"
                 if row.get("kept") else "every block streamed"))
    elif row.get("kept") is True and "n" not in row:   # HERESY 1370: no loading: the painter of the run before
        run["kept"] = True
        write(d, run)
        H["say"](f"the Artist · {run['id']} · its painter kept from the run before on GPU {gpu}: no loading")
    elif "letters_prompt" in row:    # HERESY 1394: the phrase the painter read for the lettering
        run["letters_prompt"] = row["letters_prompt"]
        write(d, run)
    elif "chain" in row:             # HERESY 1355: an upscale in passes: the pass just done
        run["chain_at"] = row["chain"]
        write(d, run)
    elif "loras" in row:             # HERESY 1316: the adapters on, each with the layers it reached
        run["loras_on"] = row["loras"]
        write(d, run)
    elif "live" in row:              # HERESY 1257: the step being painted, its picture an eighth the size
        lives[gpu] = dict(row, t=time.time())
        _live(run, lives)
        write(d, run)
    else:
        lives.pop(gpu, None)
        _live(run, lives)
        run["pictures"].append(row)
        if only:                     # HERESY 1354: in the run's own order, whichever card finished first
            run["pictures"].sort(key=lambda r: int(r.get("n") or 0))
        write(d, run)


# HERESY 1370 (Viktor 11.10.2026: «Да, отпускай модели Художника через 10 минут. Это правильно»): a painter kept between runs, one
# serving process a card (artist_job.py, ART_SERVE=1): the next run of the same painter with the same adapters paints without loading;
# between runs its weights lie in RAM and its card is free. Let go after KEPT_IDLE_S idle, for the RAM another painter needs, on Unload,
# or by Stop. A run that streams its painter, Qwen-Image 2.1 and the upscalers keep a process of their own as before.
KEPT_IDLE_S = int(os.environ.get("ART_KEPT_IDLE_S") or 600)
KEPT_PAINTERS = {"qwen2512-q4", "qwen2512-q6", "qwen2512-fp8"}
SERVED, SLOCK, REAPER = {}, threading.Lock(), []


class Served:
    """HERESY 1370: the serving painter of one card: its lines as they come (rows; None once it ended), its stderr's last lines and when
    it last spoke (1340's watchdog), busy from a run's start to its end, idle since when (None while it paints or puts itself away)."""

    def __init__(self, gpu):
        env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", ART_SERVE="1")
        env.pop("ART_ONLY", None)
        env.pop("ART_STREAM", None)
        self.gpu, self.painter, self.idle, self.busy, self.ok = gpu, "", None, True, True
        self.rows, self.errs, self.seen = queue.Queue(), collections.deque(maxlen=40), {"t": time.time(), "painting": False}
        self.p = subprocess.Popen([str(H["py"]), str(HERE / "artist_job.py")], env=env, text=True, bufsize=1,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        threading.Thread(target=self._out, daemon=True).start()
        threading.Thread(target=self._err, daemon=True).start()

    def _out(self):
        for line in self.p.stdout:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if isinstance(row, dict) and "idle" in row:      # its run put away: the weights in RAM, the card free
                if row["idle"]:
                    self.idle = time.time()
                else:
                    self.ok = False
                continue
            self.rows.put(row)
        self.ok = False
        self.rows.put(None)
        with SLOCK:
            if SERVED.get(self.gpu) is self:
                SERVED.pop(self.gpu, None)

    def _err(self):
        for x in self.p.stderr:
            self.errs.append(x)
            self.seen["t"] = time.time()
            if "it/s" in x or "s/it" in x:
                self.seen["painting"] = True

    def alive(self):
        return self.ok and self.p.poll() is None

    def ask(self, d, run, only):
        self.errs.clear()
        self.seen.update(t=time.time(), painting=False)
        self.idle, self.painter = None, run["painter"]
        self.p.stdin.write(json.dumps({"run": str(d), "painter": run["painter"], "only": list(only or []), "stream": bool(run.get("stream"))}) + "\n")
        self.p.stdin.flush()

    def end(self):
        self.ok = False
        if self.p.poll() is None:
            self.p.terminate()
            threading.Timer(5, lambda p=self.p: p.poll() is None and p.kill()).start()


def _served(gpu, ram_gb):
    """HERESY 1370: the card's kept painter for a run, claimed: idle, or putting itself away (a minute at most); a new one when there is
    none or it could not be kept (the other cards' idle painters let go first when RAM lacks ram_gb for it); None when it paints another
    run on this card (this one then paints apart, as before)."""
    with SLOCK:
        s = SERVED.get(gpu)
        if s is not None and s.alive() and s.busy:
            return None
        if s is not None:
            s.busy = True
    if s is not None:
        t0 = time.time()
        while s.alive() and s.idle is None and time.time() - t0 < 60:
            time.sleep(0.2)
        if s.alive() and s.idle is not None:
            return s
        s.end()
    if _ram_free_gb() < ram_gb:                      # another card's idle painter holds RAM a new one needs: let go first
        release_idle("RAM for another painter")
    s = Served(gpu)
    with SLOCK:
        SERVED[gpu] = s
    _reaper()
    return s


def _reaper():
    """HERESY 1370: once, a thread that lets a painter go after KEPT_IDLE_S idle."""
    if REAPER:
        return
    REAPER.append(True)

    def loop():
        while True:
            time.sleep(15)
            for s in _take_idle(lambda s: s.idle is not None and time.time() - s.idle > KEPT_IDLE_S):
                _let_go(s, f"{KEPT_IDLE_S // 60} minutes idle" if KEPT_IDLE_S >= 60 else f"{KEPT_IDLE_S} s idle")
    threading.Thread(target=loop, daemon=True).start()


def kept():
    with SLOCK:
        return list(SERVED.values())


def _take_idle(cond):
    """HERESY 1370: the kept painters not painting that meet cond, taken out under the lock (no run can claim them meanwhile)."""
    with SLOCK:
        out = [s for s in SERVED.values() if not s.busy and cond(s)]
        for s in out:
            SERVED.pop(s.gpu, None)
            s.busy = True
    return out


def _let_go(s, why):
    s.end()
    H["say"](f"the Artist · its painter ({s.painter or 'none yet'}) let go on GPU {s.gpu}: {why}")


def release_idle(why, gpu=None):
    """HERESY 1370: the kept painters not painting now (on that card, or all), let go: [{gpu, painter}]."""
    out = []
    for s in _take_idle(lambda s: gpu is None or s.gpu == gpu):
        _let_go(s, why)
        out.append({"gpu": s.gpu, "painter": s.painter})
    return out


def unload():
    """HERESY 1370 (Viktor 11.10.2026: «на кнопку ВЫГРУЗИТЬ в Баре тоже подключи выгруз не только YuE2 моделей, но абсолютно всего, что у
    нас в VRAM студийного»): POST /artist/unload: every kept painter not painting, let go; the busy ones said."""
    gone = release_idle("Unload")
    return {"released": gone, "busy": [{"gpu": s.gpu, "painter": s.painter} for s in kept() if s.busy]}


def kept_painters():
    """HERESY 1370: the kept painters, for the lab's activity (the Bar's Unload): [{gpu, painter, busy, idle_s}]. HERESY 1375: a name of
    its own: as painters() it took the place of the room's list of painters (1318) and GET /artist/painters said []."""
    now = time.time()
    return [{"gpu": s.gpu, "painter": s.painter, "busy": bool(s.busy), "idle_s": round(now - s.idle) if s.idle else None} for s in kept() if s.alive()]


def _part_kept(s, d, run, job, gpu, only, lock, lives, out):
    """HERESY 1370: a card's share of a run through its kept painter: as _part, its rows till its end ({"done"}); the painter stays."""
    try:
        with lock:
            job.setdefault("procs", []).append(s.p)  # HERESY 1270, 1354: Stop ends it (the next run starts another)
            job["proc"] = s.p
        s.ask(d, run, only)
        over = {"done": False, "why": None}

        def quiet():                                 # HERESY 1340: silent too long while loading or painting: stopped
            while s.alive() and not over["done"]:
                q = QUIET_PAINT if s.seen["painting"] else QUIET_LOAD
                if time.time() - s.seen["t"] > q:
                    over["why"] = f"its painter said nothing for {q // 60} minutes: stopped" if q >= 60 else f"its painter said nothing for {q} s: stopped"
                    s.p.kill()
                    return
                time.sleep(min(5, max(0.2, q / 10)))
        threading.Thread(target=quiet, daemon=True).start()
        while True:
            row = s.rows.get()
            if row is None:
                break
            s.seen["t"] = time.time()
            with lock:
                _row(d, run, gpu, only, lives, row)
            if row.get("done"):
                over["done"] = True
                break
        s.busy = False
        if over["done"]:
            out.update(code=0, why=None, errs=list(s.errs))
        else:
            try:
                s.p.wait(timeout=60)
            except subprocess.TimeoutExpired:
                s.p.kill()
            out.update(code=s.p.returncode if s.p.returncode is not None else -1, why=over["why"], errs=list(s.errs))
    except Exception as e:                           # said as the run's failure, never lost in a thread
        s.busy = False
        out.update(code=-1, why=f"the painter on GPU {gpu} could not run: {e}")


def _settle(run):
    """HERESY 1370c: a run of a kept painter waits (a minute at most) for any kept painter still putting its weights away, so the cards
    are measured as they will be."""
    if run["painter"] not in KEPT_PAINTERS or run.get("stream"):
        return
    t0 = time.time()
    while any(s.alive() and not s.busy and s.idle is None for s in kept()) and time.time() - t0 < 60:
        time.sleep(0.5)


def _kept_held(run):
    """HERESY 1378 (Viktor 11.10.2026: «повторный ран выбрал другую видеокарту… Это неправильно»): {card: MiB} the idle kept painters'
    own processes hold (their CUDA context, 428 MiB measured), for a run of a kept painter: on such a card that very process paints
    it (_served), so the memory is the run's own. Without it a painter needing nearly the whole card (qwen2512-fp8 with three
    adapters, 24 047 MB) found its kept card not empty, went to another one and loaded again; on one card it waited ten minutes."""
    if run["painter"] not in KEPT_PAINTERS or run.get("stream"):
        return {}
    idle = [s for s in kept() if s.alive() and not s.busy and s.idle is not None]
    if not idle:
        return {}
    try:
        a = subprocess.run(["nvidia-smi", "--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return {}
    mb = {}
    for line in a.stdout.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            mb[int(parts[0])] = mb.get(int(parts[0]), 0) + int(parts[1])
    return {s.gpu: mb[s.p.pid] for s in idle if mb.get(s.p.pid)}


def _kept_card(run, need):
    """HERESY 1370b: for a run of a kept painter, the card of an idle one of its painter when that card has room for it now; a kept
    painter still putting its weights away is waited for first (a minute at most), so its card's memory is back before any card is
    measured. None: the cards are asked as before."""
    if run["painter"] not in KEPT_PAINTERS or run.get("stream"):
        return None
    t0 = time.time()
    while any(s.alive() and not s.busy and s.idle is None for s in kept()) and time.time() - t0 < 60:
        time.sleep(0.5)
    for s in kept():
        if s.alive() and not s.busy and s.idle is not None and s.painter == run["painter"]:
            try:
                return H["free_gpu"](need, only=s.gpu, held=_kept_held(run))[0]   # HERESY 1378: its own process given back
            except (RuntimeError, TypeError):
                return None
    return None


def _part_any(d, run, job, gpu, only, lock, lives, out):
    """HERESY 1370: a card's share through the card's kept painter when its painter is kept, else a process of its own (_part)."""
    if run["painter"] in KEPT_PAINTERS and not run.get("stream") and not job.get("stop"):
        try:
            s = _served(gpu, RAM_NEED_GB.get(run["painter"], 58) + 8)
        except Exception:                            # a serving process that could not start: the run's own, as before
            s = None
        if s is not None:
            return _part_kept(s, d, run, job, gpu, only, lock, lives, out)
    return _part(d, run, job, gpu, only, lock, lives, out)


def _live(run, lives):
    """The step the stage shows: the lowest picture being painted (one card, its own, as before); with more cards, each card's step for
    the progress (run["lives"])."""
    if not lives:
        run.pop("live", None)
        run.pop("lives", None)
        return
    rows = sorted(lives.values(), key=lambda r: int(r.get("live") or 0))
    run["live"] = rows[0]
    if len(run.get("gpus") or []) > 1:
        run["lives"] = [{"live": r.get("live"), "step": r.get("step"), "of": r.get("of")} for r in rows]


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
        procs = list(job.get("procs") or ([job["proc"]] if job.get("proc") else []))   # HERESY 1354: every card's painter
    for p in procs:
        if p is not None and p.poll() is None:
            p.terminate()
            threading.Timer(5, lambda p=p: p.poll() is None and p.kill()).start()
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


NOTE_MAX = 4000


def note(body):
    """HERESY 1428 (Viktor 14.10.2026: «Вложи промпты маяка в студию. И к картинкам тоже прикрути поле для заметок плиз»): a picture's
    note of one's own (what it was made for, the words that lettered it, what to try next), kept with its run as star keeps its star; an
    empty note takes it off. Not while its run draws (the drawing run writes its own run.json). {note, file}"""
    rid, name, text = str(body.get("id") or ""), str(body.get("file") or ""), body.get("note")
    if text is not None and not isinstance(text, str):
        raise ValueError("a note is words")
    text = (text or "").replace("\r\n", "\n").rstrip()
    if len(text) > NOTE_MAX:
        raise ValueError(f"a note: up to {NOTE_MAX} characters")
    picture(rid, name)
    with H["lock"]:
        if "artist:" + rid in H["jobs"]:
            raise ValueError("it is drawing: write its pictures' notes when it ends")
    d = run_dir(rid)
    run = read(d) or {}
    pic = next((x for x in run.get("pictures") or [] if x.get("file") == name), None)
    if pic is None:
        raise FileNotFoundError("no such picture in the run")
    if text:
        pic["note"] = text
    else:
        pic.pop("note", None)
    write(d, run)
    return {"note": text, "file": name}


def protect(body):
    """HERESY 1367 (Viktor 11.10.2026: «добавь Protect опцию для картинок. Такое нельзя ни в коем случае упустить в корзину, а потом
    ненароком в бездну»): pictures protected, or let go with protect false. A protected picture is never put aside (aside() leaves it and
    says so), its run never goes to the trash, and nothing protected is deleted for good; one put aside comes back into the room when it
    is protected. Not while its run draws (the drawing run writes its own run.json). {protect, done: [{id, file}]}"""
    items, on = body.get("items") or [], body.get("protect") is not False
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
        raise ValueError("a run is drawing: protect its pictures when it ends")
    done = []
    for rid, names in by.items():
        d = run_dir(rid)
        run = read(d) or {}
        for pic in run.get("pictures") or []:
            if pic.get("file") in names:
                if on:
                    pic["protected"] = True
                    pic.pop("aside", None)
                else:
                    pic.pop("protected", None)
                done.append({"id": rid, "file": pic["file"]})
        write(d, run)
    if done:
        H["say"](f"the Artist · {len(done)} picture{'s' if len(done) != 1 else ''} " + ("protected: never to the trash" if on else "no longer protected"))
    return {"protect": on, "done": done}


def protected_in(run):
    """HERESY 1367: the run's protected pictures' files."""
    return [p.get("file") for p in (run or {}).get("pictures") or [] if p.get("protected")]


UPSCALE_MAX = 10240                                     # HERESY 1322: the long side of an upscaled picture, at most
TARGETS = {"2k": 2560, "4k": 3840}                      # HERESY 1332: the long side of 2K and 4K (QHD and UHD)


UP_INFO = None


def upscalers():
    """HERESY 1322: the upscalers in artwork/upscalers/ (a face restorer is not one), each with its scale by its name and its size; 1355: and
    its notes from lab/upscalers.json where it is a known one (what it is for, its author, licence and page, its time measured here)."""
    global UP_INFO
    if UP_INFO is None:
        try:
            with open(HERE / "upscalers.json", encoding="utf-8") as f:
                UP_INFO = json.load(f)
        except (OSError, ValueError):
            UP_INFO = {}
    known = UP_INFO.get("models") or {}
    d = _art("upscalers")
    out = []
    if d.exists():
        for p in sorted(d.rglob("*")):
            if p.suffix.lower() in (".pth", ".safetensors") and p.is_file() and not re.search(r"gfpgan|codeformer|restoreformer", p.name, re.I):
                m = re.match(r"^(\d)x", p.name, re.I)
                e = {"name": p.relative_to(d).as_posix(), "scale": int(m.group(1)) if m else 4, "mb": round(p.stat().st_size / 2 ** 20, 1)}
                if p.name in known:
                    e["info"] = known[p.name]
                    e["scale"] = int(known[p.name].get("scale") or e["scale"])
                out.append(e)
    return {"upscalers": out, "measured": UP_INFO.get("measured") or ""}


def upscale(body):
    """HERESY 1322: a picture upscaled 2 or 4 times, as a run of its own (its source, the model and the factor said)."""
    if body.get("items") is not None:                    # HERESY 1364: the pictures picked, in one run
        return _upscale_batch(body)
    rid, name = str(body.get("id") or ""), str(body.get("file") or "")
    picture(rid, name)
    src = read(run_dir(rid)) or {}
    pic = next((x for x in src.get("pictures") or [] if x.get("file") == name), None)
    if pic is None or not pic.get("kept"):
        raise FileNotFoundError("no such picture in the run")
    w0, h0 = int(pic.get("w") or 0), int(pic.get("h") or 0)
    if body.get("passes"):                               # HERESY 1355: in passes, as Viktor's ComfyUI stack
        return _upscale_chain(body, rid, name, src, pic, w0, h0)
    model = str(body.get("model") or "")
    if model not in [u["name"] for u in upscalers()["upscalers"]]:
        raise ValueError("pick an upscaler: one of artwork/upscalers/ (ESRGAN, DAT, HAT, SPAN… as .pth or .safetensors)")
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
    ask = {"source": {"id": rid, "file": name}, "model": model, "factor": factor, "shape": pic.get("shape") or "1:1", "seed": pic.get("seed") or 0,
           "tta": bool(body.get("tta"))}                 # HERESY 1364
    if size:
        ask.update(size=size, target=target)
    with open(d / "ask.json", "w", encoding="utf-8") as f:
        json.dump(ask, f, ensure_ascii=False, indent=1)
    run = {"id": nid, "kind": "upscale", "prompt": src.get("prompt", ""), "painter": "upscale", "model": model, "factor": factor, "target": target, "tta": ask["tta"],
           "shapes": [ask["shape"]], "seed": ask["seed"], "count": 1, "take": src.get("take"), "created": time.time(), "status": "queued", "of": 1,
           "pictures": [], "upscaled_from": {"id": rid, "file": name, "painter": src.get("painter")}}
    write(d, run)
    job = {"status": "queued", "started": time.time(), "kind": "artist"}
    with H["lock"]:
        H["jobs"]["artist:" + nid] = job
    threading.Thread(target=work, args=(d, run, job), daemon=True).start()
    return run


PASSES_MAX = 4


def _upscale_chain(body, rid, name, src, pic, w0, h0):
    """HERESY 1355: an upscale in passes (1 to 4, each a model of artwork/upscalers/ and a factor of the picture's size from 0.25 to 8), how
    each lands (bilinear, lanczos, bicubic), the long side after them (none, or 512 to UPSCALE_MAX) and the colours matched or not; a run
    of its own, as one model's upscale is."""
    names = [u["name"] for u in upscalers()["upscalers"]]
    passes = body.get("passes")
    if not isinstance(passes, list) or not 1 <= len(passes) <= PASSES_MAX:
        raise ValueError(f"the passes: one to {PASSES_MAX}")
    out = []
    for ps in passes:
        model = str((ps or {}).get("model") or "")
        if model not in names:
            raise ValueError("each pass: one of the upscalers in artwork/upscalers/")
        try:
            f = round(float((ps or {}).get("factor")), 3)
        except (TypeError, ValueError):
            raise ValueError("each pass's factor: a number")
        if not 0.25 <= f <= 8:
            raise ValueError("each pass's factor: from 0.25 to 8 (of the picture's own size)")
        out.append({"model": model, "factor": f})
    resample = str(body.get("resample") or "bilinear")
    if resample not in ("bilinear", "lanczos", "bicubic"):
        raise ValueError("how each pass lands: bilinear, lanczos or bicubic")
    long = int(body.get("long") or 0)
    if long and not 512 <= long <= UPSCALE_MAX:
        raise ValueError(f"the long side: 512 to {UPSCALE_MAX} px")
    if not (w0 and h0):
        raise ValueError("the picture's size is not known")
    side = long or round(max(w0, h0) * out[-1]["factor"])
    if side > UPSCALE_MAX:
        raise ValueError(f"too large: {side} px on the long side, {UPSCALE_MAX} is the most")
    nid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    d = home() / nid
    d.mkdir(parents=True)
    ask = {"source": {"id": rid, "file": name}, "passes": out, "resample": resample, "long": long or None, "match": bool(body.get("match")),
           "shape": pic.get("shape") or "1:1", "seed": pic.get("seed") or 0, "tta": bool(body.get("tta"))}   # HERESY 1364: tta
    with open(d / "ask.json", "w", encoding="utf-8") as f:
        json.dump(ask, f, ensure_ascii=False, indent=1)
    run = {"id": nid, "kind": "upscale", "prompt": src.get("prompt", ""), "painter": "upscale", "model": out[0]["model"], "passes": out,
           "factor": out[-1]["factor"], "target": "", "long": long or None, "match": ask["match"], "resample": resample, "tta": ask["tta"],
           "shapes": [ask["shape"]], "seed": ask["seed"], "count": 1, "take": src.get("take"), "created": time.time(), "status": "queued", "of": 1,
           "pictures": [], "upscaled_from": {"id": rid, "file": name, "painter": src.get("painter")}}
    write(d, run)
    job = {"status": "queued", "started": time.time(), "kind": "artist"}
    with H["lock"]:
        H["jobs"]["artist:" + nid] = job
    threading.Thread(target=work, args=(d, run, job), daemon=True).start()
    return run


BATCH_MAX = 64                                          # HERESY 1364: the pictures one batch upscales


def _upscale_batch(body):
    """HERESY 1364 (from Upscayl's batch, TODO.md: «a folder upscaled at once»): the pictures picked (Ctrl or Shift + click), each upscaled as
    the one would be (a model to 2K or 4K, ×2 or ×4, or the passes; tta for all), in one run whose pictures they become in their order,
    dealt to the lab's cards as a painter's are. {items: [{id, file}], model, target | factor, or passes, resample, long, match; tta}"""
    items = body.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= BATCH_MAX:
        raise ValueError(f"the pictures: one to {BATCH_MAX}")
    srcs, first = [], None
    for it in items:
        rid, name = str((it or {}).get("id") or ""), str((it or {}).get("file") or "")
        picture(rid, name)
        src = read(run_dir(rid)) or {}
        pic = next((x for x in src.get("pictures") or [] if x.get("file") == name), None)
        if pic is None or not pic.get("kept"):
            raise FileNotFoundError(f"no such picture in the run: {rid}/{name}")
        w0, h0 = int(pic.get("w") or 0), int(pic.get("h") or 0)
        if not (w0 and h0):
            raise ValueError(f"the size of {name} is not known")
        srcs.append({"id": rid, "file": name, "shape": pic.get("shape") or "1:1", "seed": pic.get("seed") or 0, "w": w0, "h": h0})
        first = first or (src, rid, name)
    names = [u["name"] for u in upscalers()["upscalers"]]
    ask = {"sources": srcs, "tta": bool(body.get("tta"))}
    if body.get("passes"):                               # the passes, as _upscale_chain checks them
        passes = body.get("passes")
        if not isinstance(passes, list) or not 1 <= len(passes) <= PASSES_MAX:
            raise ValueError(f"the passes: one to {PASSES_MAX}")
        out = []
        for ps in passes:
            model = str((ps or {}).get("model") or "")
            if model not in names:
                raise ValueError("each pass: one of the upscalers in artwork/upscalers/")
            try:
                f = round(float((ps or {}).get("factor")), 3)
            except (TypeError, ValueError):
                raise ValueError("each pass's factor: a number")
            if not 0.25 <= f <= 8:
                raise ValueError("each pass's factor: from 0.25 to 8 (of the picture's own size)")
            out.append({"model": model, "factor": f})
        resample = str(body.get("resample") or "bilinear")
        if resample not in ("bilinear", "lanczos", "bicubic"):
            raise ValueError("how each pass lands: bilinear, lanczos or bicubic")
        long = int(body.get("long") or 0)
        if long and not 512 <= long <= UPSCALE_MAX:
            raise ValueError(f"the long side: 512 to {UPSCALE_MAX} px")
        for s in srcs:
            side = long or round(max(s["w"], s["h"]) * out[-1]["factor"])
            if side > UPSCALE_MAX:
                raise ValueError(f"too large: {s['file']} would be {side} px on the long side, {UPSCALE_MAX} is the most")
        ask.update(passes=out, resample=resample, long=long or None, match=bool(body.get("match")))
        say = {"model": out[0]["model"], "passes": out, "factor": out[-1]["factor"], "target": "", "long": long or None, "match": ask["match"], "resample": resample}
    else:                                                # one model, as upscale() checks it
        model = str(body.get("model") or "")
        if model not in names:
            raise ValueError("pick an upscaler: one of artwork/upscalers/ (ESRGAN, DAT, HAT, SPAN… as .pth or .safetensors)")
        target = str(body.get("target") or "").lower()
        if target in TARGETS:
            for s in srcs:
                long0 = max(s["w"], s["h"])
                if long0 >= TARGETS[target]:
                    raise ValueError(f"{s['file']} is {s['w']}×{s['h']} already: {target.upper()} is {TARGETS[target]} px on its long side")
                s["size"] = [round(s["w"] * TARGETS[target] / long0), round(s["h"] * TARGETS[target] / long0)]
            factor = 4
        else:
            target = ""
            factor = 4 if int(body.get("factor") or 2) >= 4 else 2
            for s in srcs:
                if max(s["w"], s["h"]) * factor > UPSCALE_MAX:
                    raise ValueError(f"too large: {s['file']} at ×{factor}, {UPSCALE_MAX} px is the most on the long side")
        ask.update(model=model, factor=factor, target=target)
        say = {"model": model, "factor": factor, "target": target}
    src, rid, name = first
    nid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    d = home() / nid
    d.mkdir(parents=True)
    with open(d / "ask.json", "w", encoding="utf-8") as f:
        json.dump(ask, f, ensure_ascii=False, indent=1)
    run = dict(say, **{"id": nid, "kind": "upscale", "prompt": src.get("prompt", ""), "painter": "upscale", "tta": ask["tta"], "batch": len(srcs),
                       "shapes": sorted({s["shape"] for s in srcs}), "seed": srcs[0]["seed"], "count": len(srcs), "take": src.get("take"),
                       "created": time.time(), "status": "queued", "of": len(srcs), "pictures": [],
                       "upscaled_from": {"id": rid, "file": name, "painter": src.get("painter")},
                       "batch_from": [{"id": s["id"], "file": s["file"]} for s in srcs]})
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
    done, gone, kept = [], [], []
    for rid, names in by.items():
        d = run_dir(rid)
        run = read(d) or {}
        for pic in run.get("pictures") or []:
            if pic.get("file") in names:
                if on and pic.get("protected"):          # HERESY 1367: protected: it stays in the room, said
                    kept.append({"id": rid, "file": pic["file"], "why": "protected"})
                    continue
                if on:
                    pic["aside"] = True
                else:
                    pic.pop("aside", None)
                done.append({"id": rid, "file": pic["file"]})
        write(d, run)
        if on and not any(p.get("kept") and not p.get("aside") for p in run.get("pictures") or []):
            trash(rid)                                   # nothing of it left to show: the run itself to the trash
            gone.append(rid)
    out = {"aside": on, "done": done, "trashed": gone, "kept": kept}
    if on and done and body.get("covers") == "off":      # HERESY 1372: their covers taken off the takes too, on the user's word
        out["covers_off"] = covers_off(done)
    return out


def covers_of(items):
    """HERESY 1372 (Viktor 11.10.2026: «Если стоит обложкой на треке то, что у Художника, при удалении изображения из галлереи
    спрашивать, или снимать, или оставить»): the takes whose cover now is one of these pictures, by their artwork.json (its run and
    file; an A/B pair's other letter carries the same): {"covers": [{id, file, takes: [{name, title}]}]}. A cover is the take's own
    copy: the picture going leaves it as it is, unless it is taken off (covers_off)."""
    want = {(str((it or {}).get("id") or ""), str((it or {}).get("file") or "")) for it in items or []}
    found, root = {}, H.get("outputs")
    for a in sorted(root.glob("*/artwork.json")) if root and root.is_dir() else []:
        try:
            m = json.load(open(a, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        k = (str(m.get("run") or ""), str(m.get("file") or ""))
        if k not in want or not (a.parent / "artwork.jpg").is_file():
            continue
        try:
            title = json.load(open(a.parent / "meta.json", encoding="utf-8")).get("title") or a.parent.name
        except (OSError, ValueError):
            title = a.parent.name
        found.setdefault(k, []).append({"name": a.parent.name, "title": title})
    return {"covers": [{"id": k[0], "file": k[1], "takes": v} for k, v in found.items()]}


def covers_off(items):
    """HERESY 1372: the covers that are these pictures, taken off their takes (kept beside each take, as Remove current artwork keeps them;
    the takes' MP3s made again); a frozen workspace's take keeps its own. The takes' names."""
    frozen = H["frozen"]() if H.get("frozen") else set()
    off = []
    for c in covers_of(items)["covers"]:
        for t in c["takes"]:
            if t["name"] in frozen or t["name"] in off:
                continue
            r = H["art_remove"](t["name"])
            if not r.get("error"):
                off.append(t["name"])
    if off:
        H["say"](f"the Artist · the cover taken off {len(off)} take(s) with its picture: " + ", ".join(off[:4]) + ("…" if len(off) > 4 else ""))
    return off


def trash_run(body):
    """HERESY 1372: POST /artist/trash {id, covers}: the run to the trash; covers "off": the covers its pictures gave to takes taken off too."""
    rid = str(body.get("id") or "")
    items = [{"id": rid, "file": p.get("file")} for p in (read(run_dir(rid)) or {}).get("pictures") or [] if p.get("kept")] if RUN_RE.match(rid) else []
    out = trash(rid)
    if body.get("covers") == "off" and items:
        out["covers_off"] = covers_off(items)
    return out


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
    if protected_in(read(d)):                         # HERESY 1367
        raise ValueError("it holds a protected picture: take its protection off first")
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
    loras = artist_loras.trashed(H["kit"])             # HERESY 1353: the adapters taken out of the LoRA library
    return {"runs": runs, "pictures": pics, "covers": covers, "loras": loras, "bytes": sum(x["bytes"] for x in runs + pics + covers + loras)}


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
    if pic.get("protected"):                         # HERESY 1367: never, whatever brought it here
        raise ValueError("it is protected: never deleted")
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
    if protected_in(read(d)):                         # HERESY 1367: never, whatever brought it here
        raise ValueError("it holds a protected picture: never deleted")
    shutil.rmtree(d)


def bin_act(body):
    """HERESY 1337: {op: restore | delete | empty, items: [{kind: run, id} | {kind: picture, id, file} | {kind: cover, take, stamp} | {kind: lora, stamp}]}:
    each given back, or deleted for good; empty: all the trash lists but a frozen workspace's covers. {op, done, kept: [{…, why}]}"""
    op = str(body.get("op") or "")
    if op not in ("restore", "delete", "empty"):
        raise ValueError("op: restore, delete or empty")
    frozen = _frozen()
    if op == "empty":
        b = bin_list()
        items = [{"kind": "run", "id": r["id"]} for r in b["runs"]] + [{"kind": "picture", "id": p["id"], "file": p["file"]} for p in b["pictures"]] + \
                [{"kind": "cover", "take": c["take"], "stamp": c["stamp"]} for c in b["covers"] if not c["frozen"]] + \
                [{"kind": "lora", "stamp": x["stamp"]} for x in b["loras"]]
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
            elif kind == "lora":                     # HERESY 1353: an adapter back in artwork/loras/, or deleted for good
                (artist_loras.restore if op == "restore" else artist_loras.gone)(H["kit"], str(it.get("stamp") or ""))
            else:
                raise ValueError("kind: run, picture, cover or lora")
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
