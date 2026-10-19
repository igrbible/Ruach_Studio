"""HERESY 1508: the chain's steps from what the page asks, in the chain's order (Debuzz › Upscale › Stems › Remaster › Upscale, then
the checks), and «up to this node» (Viktor 16.10.2026: «прогнать до этой ноды включительно… как в Комфи»): until names the step the run
ends with, the ones after it and the checks left out. A step bypassed in the chain cannot be run up to: the page turns it on first."""

UNTIL = {"debuzz": ("debuzz", False), "upscale": ("upscale", False), "stems": ("stems", False), "remaster": ("remaster", False),
         "upscale_end": ("upscale", True)}


def steps(spec):
    out = []
    if spec.get("debuzz", True):
        out.append({"step": "debuzz", "strength": min(1.0, max(0.1, float(spec.get("strength", 0.8))))})
    if spec.get("upscale"):
        out.append({"step": "upscale", "mode": spec.get("upscale_mode") or "subtle"})
    if spec.get("stems"):
        out.append({"step": "stems", "mode": spec.get("stems_mode") or "four"})
    out.append({"step": "remaster", "settings": dict(spec.get("remaster") or {})})
    if spec.get("upscale_end"):
        out.append({"step": "upscale", "mode": spec.get("upscale_end_mode") or "subtle", "end": True})
    for k in ("inspect", "spectrum", "gloss"):
        if spec.get(k):
            out.append({"step": k})
    until = spec.get("until") or ""
    if until:
        if until not in UNTIL:
            raise ValueError(f"the chain has no step {until}")
        name, end = UNTIL[until]
        at = next((i for i, st in enumerate(out) if st["step"] == name and bool(st.get("end")) == end), None)
        if at is None:
            raise ValueError(f"{until} is bypassed in this chain: nothing to run up to")
        out = out[:at + 1]
    return out


# HERESY 1553: the chain as a list the page makes (a pipeline profile): each step checked, in its order; «until» an index
MODES_UP = ("subtle", "normal", "high", "extreme")
MODES_STEMS = ("four", "six", "eight", "vocals")


def pipeline(spec, plugins=()):
    raw = spec.get("pipeline")
    if not isinstance(raw, list) or not raw or len(raw) > 24:
        raise ValueError("a pipeline is a list of 1 to 24 steps")
    have = {(p["id"], s["id"]): s for p in plugins for s in p["steps"]}
    out, seen_stems = [], False
    for i, r in enumerate(raw):
        if not isinstance(r, dict):
            raise ValueError(f"step {i + 1} is not a step")
        k = r.get("step")
        if k == "debuzz":
            out.append({"step": k, "strength": min(1.0, max(0.1, float(r.get("strength", 0.8))))})
        elif k == "upscale":
            mode = r.get("mode") or "subtle"
            if mode not in MODES_UP:
                raise ValueError(f"step {i + 1}: upscale is one of {list(MODES_UP)}")
            out.append({"step": k, "mode": mode, "end": bool(r.get("end"))})
        elif k == "stems":
            mode = r.get("mode") or "eight"
            if mode not in MODES_STEMS:
                raise ValueError(f"step {i + 1}: stems are one of {list(MODES_STEMS)}")
            given = str(r.get("set") or "")
            if given and (not given.startswith("derived/") or ".." in given.split("/") or given.count("/") != 1):
                raise ValueError(f"step {i + 1}: a set is one of the take's derived/stems-…")
            out.append(dict({"step": k, "mode": mode}, **({"set": given} if given else {})))
            seen_stems = True
        elif k == "daw":
            if not seen_stems:
                raise ValueError(f"step {i + 1}: the DAW mixes stems: put Stems before it")
            mix = None if r.get("mix") == "current" else r.get("mix")
            if mix is not None and not isinstance(mix, dict):
                raise ValueError(f"step {i + 1}: the DAW's mix is its value or nothing")
            vers = r.get("versions") or {}             # HERESY 1561: the versions the DAW holds, stem → file of the take
            if not isinstance(vers, dict) or any(not isinstance(a, str) or not isinstance(b, str) or not b.startswith("derived/") or ".." in b.split("/")
                                                 for a, b in vers.items()):
                raise ValueError(f"step {i + 1}: the DAW's versions are stem → derived/… files")
            out.append(dict({"step": k, "mix": mix}, **({"versions": dict(vers)} if vers else {})))
        elif k == "gate":
            out.append({"step": k, "params": dict(r.get("params") or {})})
        elif k == "remaster":
            out.append({"step": k, "settings": dict(r.get("settings") or {})})
        elif k == "plugin":
            key = (str(r.get("plugin", "")), str(r.get("sid", "")))
            if key not in have:
                raise ValueError(f"step {i + 1}: no step {key[1]} of {key[0]} here")
            if have[key]["input"] == "stems" and not seen_stems:
                raise ValueError(f"step {i + 1}: {have[key]['label']} works on stems: put Stems before it")
            stem = str(r.get("stem") or "")
            if stem and (have[key]["input"] == "stems" or not seen_stems):
                raise ValueError(f"step {i + 1}: {have[key]['label']} on one stem needs a set before it and works on a file")
            out.append({"step": k, "plugin": key[0], "sid": key[1], "label": have[key]["label"], "params": dict(r.get("params") or {}), "stem": stem})
        elif k in ("inspect", "spectrum", "gloss"):
            out.append({"step": k})
        else:
            raise ValueError(f"step {i + 1}: no step {k!r}")
    if any(st["step"] == "upscale" and st["end"] for st in out) and not any(st["step"] == "remaster" for st in out):
        for st in out:
            st.pop("end", None) if st["step"] == "upscale" else None
    until = spec.get("until")
    if until is not None and until != "":
        try:
            u = int(until)
        except (TypeError, ValueError):
            raise ValueError("until is a step's index in the pipeline") from None
        if not 0 <= u < len(out):
            raise ValueError("until is past the pipeline's end")
        out = out[:u + 1]
    return out
