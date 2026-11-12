"""HERESY 2332 (Viktor 09.11.2026: «выход из ComfyUI… перенести мои два воркфлоу»): his two ComfyUI workflows in the Artist, the lab's
side (no torch here): what a run asks in ComfyUI's way (artist_comfy.py paints it) checked, and his Ultimate Samplers Testing grid laid out
as cells.

    comfy(body, painter, kit)       body["comfy"] checked: the dict the painter reads (ask["comfy"]), or None when not asked
    grid(body, painter, kit, model, models)   body["grid"] checked: (cells, axes), at most GRID_MAX cells
    parts(kit)                      his encoders and VAEs here, for the page's lists
"""
import itertools, random, re
from pathlib import Path

import artist_loras
import paths                       # HERESY 2330: where the weights live

SAMPLERS = ("euler", "er_sde", "res_2s", "res_2s_ode", "res_3s", "res_3s_ode", "heunpp2", "exp_heun_2_x0", "exp_heun_2_x0_sde")
SCHEDULES = ("simple", "normal", "sgm_uniform", "beta", "beta57", "kl_optimal", "karras", "exponential", "bong_tangent")
PAINTERS = ("qwen2512-fp8", "qwen2512-q4", "qwen2512-q6")   # ComfyUI's way is Qwen-Image 2512's
ENCODERS = {"qwen": None, "abliterated": "encoders/Qwen2.5-VL-7B-Abliterated-bf16.safetensors"}
VAES = {"qwen": None, "clear": "vaes/qwen_image_clear_vae.safetensors"}
SEED_MAX = 2 ** 64 - 1                               # ComfyUI's seeds
TEXT_MAX = 4000
GRID_MAX = 64                                        # the cells of one grid at most (his: 3 samplers × 3 schedules × 7 prompts = 63)


def _art(kit, rel):
    return paths.at(paths.ARTIST, kit) / "Qwen-Image-2512" / rel


def parts(kit):
    """His ComfyUI text encoders and VAEs that are here (the Studio's own always): {"encoders": [...], "vaes": [...]}."""
    return {"encoders": [k for k, rel in ENCODERS.items() if rel is None or _art(kit, rel).is_file()],
            "vaes": [k for k, rel in VAES.items() if rel is None or _art(kit, rel).is_file()]}


def _num(v, lo, hi, what, kind=float):
    try:
        x = kind(v)
    except (TypeError, ValueError):
        raise ValueError(f"{what}: a number from {lo} to {hi}")
    if not lo <= x <= hi:
        raise ValueError(f"{what}: a number from {lo} to {hi}")
    return x


def _seed(v, what="the ComfyUI seed"):
    s = str(v if v is not None else "").strip()
    if not re.fullmatch(r"\d{1,20}", s) or int(s) > SEED_MAX:
        raise ValueError(f"{what}: a whole number from 0 to {SEED_MAX}")
    return int(s)


def _text(v, what, most=TEXT_MAX):
    t = str(v or "").strip()
    if len(t) > most:
        raise ValueError(f"{what}: {most} characters at most")
    return t


def _adapter(kit, painter, x, what):
    """An adapter of the painter's family that is here: (its id, its MB)."""
    lid = str((x or {}).get("id") or "")
    try:
        p = artist_loras.path_of(kit, lid)
    except (ValueError, FileNotFoundError):
        raise ValueError(f"{what}: no such adapter here: {Path(lid).name or '?'}")
    if lid.split("/")[0] != artist_loras.family_of(painter):
        raise ValueError(f"{what}: {Path(lid).name} is not an adapter for Qwen-Image 2512")
    return lid, round(p.stat().st_size / 2 ** 20)


def comfy(body, painter, kit):
    """body["comfy"] checked: {cfg, skim, zero_neg, negative, also, variance, hook, encoder, vae, sampling, seed, start, inject_seed, match,
    keep_size}; None when not asked. The steps, sampler and schedule stay the run's own «sampling» (Euler SDE is diffusers', not ComfyUI's)."""
    c = body.get("comfy")
    if not c:
        return None
    if not isinstance(c, dict):
        raise ValueError("ComfyUI's way: its settings as an object")
    if painter not in PAINTERS:
        raise ValueError("ComfyUI's way is Qwen-Image 2512's: choose one of its brushes")
    s = body.get("sampling") or {}
    if s.get("sampler") == "euler-sde":
        raise ValueError("ComfyUI's way has no Euler SDE: choose ER-SDE, Euler, RES or Exp Heun")
    out = {"cfg": round(_num(c.get("cfg", 1.0), 1.0, 10.0, "guidance (CFG)"), 2)}
    skim = round(_num(c.get("skim") or 0, 0.0, 7.0, "Skimmed CFG"), 2)
    if skim:
        out["skim"] = skim
    out["zero_neg"] = c.get("zero_neg", True) is not False
    neg = _text(c.get("negative"), "the negative words")
    if neg:                                          # made nothing too: ComfyUI zeroes its tokens but keeps how many there are
        out["negative"] = neg
    also = _text(c.get("also"), "the second words", 2000)
    if also:
        out["also"] = also
    v = c.get("variance")
    if v:
        out["variance"] = {"pct": round(_num(v.get("pct", 50), 1, 100, "the variance's share of values"), 1),
                           "strength": round(_num(v.get("strength", 12), 0.0, 1000.0, "the variance's strength"), 4),
                           "switch": round(_num(v.get("switch", 25), 1, 99, "the variance's share of steps"), 1),
                           "seed": _seed(v.get("seed") if v.get("seed") not in (None, "") else random.randint(0, 2 ** 48), "the variance's seed")}
    hk = c.get("hook")
    if hk:
        lid, mb = _adapter(kit, painter, hk, "the hooked adapter")
        h = {"id": lid, "mb": mb, "weight": round(_num(hk.get("weight", 0.8), -2.0, 2.0, "the hooked adapter's strength"), 3),
             "trigger": _text(hk.get("trigger"), "the hooked adapter's trigger", 200), "count": int(_num(hk.get("count", 12), 2, 100, "keyframes", int))}
        keys = hk.get("keys")
        if keys:
            if not isinstance(keys, list) or not 1 <= len(keys) <= 400:
                raise ValueError("the hooked adapter's keyframes: one to 400, each [share of steps, strength, steps held]")
            h["keys"] = [[round(_num(k[0], 0, 1, "a keyframe's share"), 6), round(_num(k[1], 0, 10, "a keyframe's strength"), 6),
                          int(_num(k[2] if len(k) > 2 else 0, 0, 100, "a keyframe's steps held", int))] for k in keys]
        m = hk.get("main")                               # HERESY 2360: his MAIN CONTROL, an envelope multiplied into the keyframes
        if m:
            if not isinstance(m, dict):
                raise ValueError("MAIN CONTROL: {from, to, how, start, end}")
            how = str(m.get("how") or "ease_in")
            if how not in ("linear", "ease_in", "ease_out", "ease_in_out"):
                raise ValueError("MAIN CONTROL's curve: linear, ease_in, ease_out or ease_in_out")
            mm = {"from": round(_num(m.get("from", 0.0), 0, 10, "MAIN CONTROL's first strength"), 4),
                  "to": round(_num(m.get("to", 1.0), 0, 10, "MAIN CONTROL's last strength"), 4), "how": how,
                  "start": round(_num(m.get("start", 0.3), 0, 1, "where MAIN CONTROL starts (a share of the steps)"), 4),
                  "end": round(_num(m.get("end", 1.0), 0, 1, "where MAIN CONTROL ends (a share of the steps)"), 4)}
            if mm["end"] <= mm["start"]:
                raise ValueError("MAIN CONTROL ends after it starts")
            h["main"] = mm
        out["hook"] = h
    for key, table, what in (("encoder", ENCODERS, "the text encoder"), ("vae", VAES, "the VAE")):
        name = str(c.get(key) or "qwen")
        if name not in table:
            raise ValueError(f"{what}: one of " + ", ".join(table))
        if table[name] and not _art(kit, table[name]).is_file():
            raise ValueError(f"{what} «{name}» is not here: {Path(table[name]).name} goes into {paths.ARTIST}/Qwen-Image-2512/{Path(table[name]).parent}/")
        if name != "qwen":
            out[key] = name
    ms = c.get("sampling") or {}
    if ms.get("kind") == "flux":
        out["sampling"] = {"kind": "flux", "max_shift": round(_num(ms.get("max_shift", 1.15), 0.0, 100.0, "max shift"), 4),
                           "base_shift": round(_num(ms.get("base_shift", 0.5), 0.0, 100.0, "base shift"), 4)}
    elif ms:
        out["sampling"] = {"kind": "flow", "shift": round(_num(ms.get("shift", 1.15), 0.01, 20.0, "shift"), 4)}
    if c.get("seed") not in (None, ""):
        out["seed"] = _seed(c["seed"])
    if c.get("start"):
        if not body.get("ref"):
            raise ValueError("a start from a step goes with a picture to paint over (a second pass)")
        steps = int(s.get("steps") or 20)
        out["start"] = int(_num(c["start"], 1, steps - 1, f"the step to start from (of {steps})", int))
    if c.get("inject_seed") not in (None, ""):
        out["inject_seed"] = _seed(c["inject_seed"], "the extra noise's seed")
    if c.get("match"):
        out["match"] = True
    out["keep_size"] = c.get("keep_size", True) is not False
    return out


def _list(v, what, most):
    if not isinstance(v, list) or not 1 <= len(v) <= most:
        raise ValueError(f"{what}: one to {most}")
    return v


def grid(body, painter, kit, model, models):
    """His Ultimate Samplers Testing as cells: body["grid"] = {samplers, schedules, steps, cfgs, adapter: {id, weights}, fixed: [{id, weight}],
    models, prompts, seeds}; their product, the fine-tunes outermost (the painter loaded once each), the samplers × schedules innermost (one
    board). Returns (cells, axes); each cell {sampler, schedule, steps, cfg, loras {id: weight}, model, prompt, prompt_i, seed}."""
    g = body.get("grid")
    if not isinstance(g, dict):
        raise ValueError("the grid: its axes as an object")
    if painter not in PAINTERS:
        raise ValueError("the grid paints with Qwen-Image 2512: choose one of its brushes")
    samplers = _list(g.get("samplers") or ["er_sde"], "the grid's samplers", len(SAMPLERS))
    if any(x not in SAMPLERS for x in samplers):
        raise ValueError("the grid's samplers: " + ", ".join(SAMPLERS))
    schedules = _list(g.get("schedules") or ["simple"], "the grid's schedules", len(SCHEDULES))
    if any(x not in SCHEDULES for x in schedules):
        raise ValueError("the grid's schedules: " + ", ".join(SCHEDULES))
    steps = [int(_num(x, 1, 100, "the grid's steps", int)) for x in _list(g.get("steps") or [16], "the grid's steps", 4)]
    cfgs = [round(_num(x, 1.0, 10.0, "the grid's guidance"), 2) for x in _list(g.get("cfgs") or [1.0], "the grid's guidance", 4)]
    fixed = {}
    for x in g.get("fixed") or []:
        lid, _ = _adapter(kit, painter, x, "an adapter of the grid")
        fixed[lid] = round(_num(x.get("weight", 0.8), -2.0, 2.0, "an adapter's strength"), 3)
    if len(fixed) > 4:
        raise ValueError("the grid's adapters always on: four at most")
    stepped = [None]
    ad = g.get("adapter")
    if ad:
        lid, _ = _adapter(kit, painter, ad, "the stepped adapter")
        stepped = [(lid, round(_num(w, -2.0, 2.0, "the stepped adapter's strength"), 3)) for w in _list(ad.get("weights"), "the stepped adapter's strengths", 8)]
    ms = g.get("models") or [model]
    if painter == "qwen2512-fp8":
        ms = [Path(str(m)).name for m in _list(ms, "the grid's fine-tunes", 4)]
        if any(m not in models for m in ms):
            raise ValueError("the grid's fine-tunes: those of " + paths.ARTIST + "/Qwen-Image-2512/checkpoints/")
    else:
        ms = [""]
    prompts = [_text(p, "a prompt of the grid") for p in _list(g.get("prompts") or [body.get("prompt")], "the grid's prompts", 8)]
    if not all(prompts):
        raise ValueError("every prompt of the grid has its words")
    base = body.get("seed")
    base = _seed(base, "the grid's seed") if base not in (None, "") else random.randint(1000, 999999999)
    seeds = [base + k for k in range(int(_num(g.get("seeds") or 1, 1, 4, "the grid's seeds", int)))]
    cells = []
    for m, (pi, p), sd, st, n, cfg, sm, sc in itertools.product(ms, enumerate(prompts), seeds, stepped, steps, cfgs, samplers, schedules):
        loras = dict(fixed)
        if st:
            loras[st[0]] = st[1]
        cells.append({"sampler": sm, "schedule": sc, "steps": n, "cfg": cfg, "loras": loras, "model": m, "prompt": p, "prompt_i": pi, "seed": sd})
    if len(cells) > GRID_MAX:
        raise ValueError(f"the grid makes {len(cells)} pictures: {GRID_MAX} at most")
    axes = {"samplers": samplers, "schedules": schedules, "steps": steps, "cfgs": cfgs, "models": ms, "prompts": len(prompts), "seeds": seeds,
            "stepped": [w for _, w in stepped] if stepped != [None] else [], "adapter": stepped[0][0] if stepped != [None] else ""}
    return cells, axes


def grid_mb(kit, cells):
    """The adapters a grid's cells name, each once: [{id, mb}] (their room asked of the card)."""
    out = {}
    for c in cells:
        for lid in c["loras"]:
            if lid not in out:
                out[lid] = round(artist_loras.path_of(kit, lid).stat().st_size / 2 ** 20)
    return [{"id": k, "mb": v, "weight": 1.0} for k, v in out.items()]
