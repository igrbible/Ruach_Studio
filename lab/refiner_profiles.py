"""HERESY 1515 (Viktor 16.10.2026: «Профили по сетапу нод»): the Refiner's setups by name: what its steps are set to (the chain's checks
and modes, the remaster's preset, the debuzz's strength, a plugin's fields…) and where its canvas's nodes stand; never a take's own
sources. Kept in user/refiner_profiles.json, for every browser of this studio."""
import json
import os
import re
import time
from pathlib import Path

NAME = "refiner_profiles.json"
MAX_BYTES = 64 * 1024


def load(user_dir):
    try:
        d = json.loads(Path(user_dir, NAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"profiles": []}
    ps = [p for p in (d.get("profiles") or []) if isinstance(p, dict) and isinstance(p.get("name"), str) and isinstance(p.get("setup"), dict)]
    return {"profiles": sorted(ps, key=lambda p: p["name"].lower())}


def _write(user_dir, profiles):
    p = Path(user_dir, NAME)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"profiles": profiles}, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def _name(name):
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    if not name or len(name) > 60 or re.search(r"[\x00-\x1f]", name):
        raise ValueError("a profile's name is 1 to 60 characters, no control ones")
    return name


def save(user_dir, name, setup):
    name = _name(name)
    if not isinstance(setup, dict) or not isinstance(setup.get("fields", {}), dict):
        raise ValueError("a setup is its fields and its canvas")
    if len(json.dumps(setup)) > MAX_BYTES:
        raise ValueError("a setup larger than 64 KB is no setup")
    ps = [p for p in load(user_dir)["profiles"] if p["name"] != name]
    ps.append({"name": name, "saved": time.strftime("%Y-%m-%d %H:%M"), "setup": setup})
    _write(user_dir, ps)
    return load(user_dir)


def delete(user_dir, name):
    name = _name(name)
    ps = load(user_dir)["profiles"]
    if not any(p["name"] == name for p in ps):
        raise ValueError(f"no profile named {name}")
    _write(user_dir, [p for p in ps if p["name"] != name])
    return load(user_dir)


# HERESY 1553 (Viktor 18.10.2026: «сотвори несколько профилей пайплайна… для Про и Паблик»): the pipelines shipped with the studio
# (refiner_pipelines.json beside the lab) and those a plugin brings in its plugin.json, each checked against the steps here; one
# naming a step that is not here is left out (a plugin taken away takes its pipelines with it)
def pipelines(lab_dir, plugins):
    import chain_plan
    out, raw = [], []
    try:
        raw = [dict(p, group="public") for p in json.loads(Path(lab_dir, "refiner_pipelines.json").read_text(encoding="utf-8")).get("pipelines", [])]
    except (OSError, ValueError, AttributeError):
        pass
    for pl in plugins:
        raw += [dict(p, group="builtin" if pl.get("builtin") else "plugin", plugin=pl["id"], plugin_name=pl["name"]) for p in pl.get("pipelines") or []]
    seen = set()
    for p in raw:
        pid = str(p.get("id") or "")
        if not re.match(r"^[a-z0-9][a-z0-9_-]{0,47}$", pid) or pid in seen:
            continue
        try:
            chain_plan.pipeline({"pipeline": p.get("pipeline")}, plugins)
        except (ValueError, TypeError, KeyError):
            continue
        seen.add(pid)
        out.append({k: p[k] for k in ("id", "name", "say", "tip", "group", "plugin", "plugin_name", "pipeline") if k in p})
    return out
