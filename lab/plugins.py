"""HERESY 1460 · steps of one's own in the Refiner (Viktor 15.10.2026: «написать всё как единый плагин, который мы не выложим в
паблик, но он будет висеть у меня в пайплайне, — моя личная постобработка»).

HERESY 1465: a step that says "gpu": true runs on a card of the lab's jobs, in their turn (one heavy job at a time), the card
given to it as CUDA_VISIBLE_DEVICES; its "need_mb" (8000 when not said) is the room it asks for. A step on a file may say which
files it is made for, by name without the extension ("prefer": ["lead_vocal", "vocals"]): the page then picks the last of them as
its source, until the source is picked by hand.

A plugin is a folder in the studio's user/plugins/ (or a link to one) with a plugin.json:

    {"id": "my-post", "name": "My post", "python": ".venv/bin/python",          python: its own interpreter, relative to
     "steps": [{"id": "master", "label": "Master", "say": "a few words",         the folder; the lab's own when absent
                "tip": "what it does", "script": "master.py",
                "params": [{"key": "lufs", "label": "Loudness", "type": "select",
                            "options": [["-14", "−14 LUFS"], ["-9", "−9 LUFS"]], "default": "-14"},
                           {"key": "drive", "label": "Drive, dB", "type": "number", "min": 0, "max": 6, "step": 0.5, "default": 2},
                           {"key": "glue", "label": "Glue", "type": "check", "default": true}]}]}

A step runs as `PYTHON SCRIPT AUDIO OUTDIR PARAMS.json` in the plugin's folder and prints, as its last line, one line of
JSON: {"files": [{"name", "file", "seconds"?}], "measure"?: {…}, "took"?}. Its files land in the take's derived/ as a
branch of kind "plugin", beside the studio's own. Nothing of any plugin is in the studio: without the folder there is
nothing to list, and the Refiner shows its own steps only.

HERESY 1484: a file of the step's named .txt, .json, .md or .csv is a report, read and not played (its entry says "kind": "text"),
and the step's JSON may carry "summary": one line (300 characters at most) that the page shows with its branch.

HERESY 1464: a step may say "input": "stems" (a set of stems of the take, not one file: AUDIO is then the set's folder with its
manifest.json) and a "python" of its own (relative to the folder), which wins over the plugin's.
"""
import json
import re
from pathlib import Path

ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
TEXT = (".txt", ".json", ".md", ".csv")          # HERESY 1484: a step's report
IMAGE = (".png", ".jpg", ".jpeg", ".svg", ".webp")  # HERESY 1553: a step's picture
GROUPS = ("look", "mend", "finish")
TYPES = ("select", "number", "check", "file")    # HERESY 1557: file: a file of the take's tree or another take, the lab gives its path


def _step(raw, folder):
    if not isinstance(raw, dict) or not ID.match(str(raw.get("id", ""))):
        return None
    script = (folder / str(raw.get("script", ""))).resolve()
    if folder.resolve() not in script.parents or not script.is_file():
        return None
    params = []
    for p in raw.get("params") or []:
        if not isinstance(p, dict) or not ID.match(str(p.get("key", ""))) or p.get("type") not in TYPES:
            continue
        q = {"key": p["key"], "label": str(p.get("label") or p["key"]), "type": p["type"], "tip": str(p.get("tip") or "")}
        if p["type"] == "select":
            opts = [[str(o[0]), str(o[1] if len(o) > 1 else o[0])] for o in p.get("options") or [] if isinstance(o, (list, tuple)) and o]
            if not opts:
                continue
            q["options"] = opts
            q["default"] = str(p.get("default")) if str(p.get("default")) in [o[0] for o in opts] else opts[0][0]
        elif p["type"] == "number":
            lo, hi = float(p.get("min", 0)), float(p.get("max", 1))
            if hi < lo:
                lo, hi = hi, lo
            q.update(min=lo, max=hi, step=float(p.get("step") or (hi - lo) / 100 or 1))
            q["default"] = min(hi, max(lo, float(p.get("default", lo))))
        elif p["type"] == "file":
            q["default"] = ""
        else:
            q["default"] = bool(p.get("default", False))
        params.append(q)
    py = str(raw.get("python") or "")                 # HERESY 1464: a step's own interpreter wins over its plugin's
    if py:
        py = str(folder / py) if not Path(py).is_absolute() else py
        if not Path(py).exists():
            return None
    return {"id": raw["id"], "label": str(raw.get("label") or raw["id"]), "say": str(raw.get("say") or ""),
            "tip": str(raw.get("tip") or ""), "script": str(script), "gpu": bool(raw.get("gpu", False)), "params": params,
            "need_mb": _need(raw.get("need_mb")), "prefer": [str(w) for w in raw.get("prefer") or [] if ID.match(str(w))][:8],
            "input": "stems" if raw.get("input") == "stems" else "file", "python": py,
            "rate": _rate(raw.get("rate")),             # HERESY 1549/1553: its pace, kept (it was dropped here)
            "group": raw.get("group") if raw.get("group") in GROUPS else "finish", "after": str(raw.get("after") or "")[:48]}


def _rate(v):
    try:
        return max(0.001, min(50.0, float(v))) if v is not None else None
    except (TypeError, ValueError):
        return None


def _need(v):
    """HERESY 1465: the room a GPU step asks for, in MB (8000 when not said or not a number; kept within one card)."""
    try:
        return max(500, min(24000, int(v)))
    except (TypeError, ValueError):
        return 8000


def load_all(user_root, builtin_root):
    """HERESY 1553: the studio's built-in steps first (shipped in the lab, their names the page translates), then the user's plugins;
    a user's plugin of a built-in's id is left out, said."""
    built, e1 = load(builtin_root, builtin=True)
    users, e2 = load(user_root)
    ids = {p["id"] for p in built}
    for p in users:
        if p["id"] in ids:
            e2.append({"plugin": p["id"], "error": "the studio has a step of this id"})
    return built + [p for p in users if p["id"] not in ids], e1 + e2


def load(root, builtin=False):
    """Every plugin under root that reads whole: [{id, name, folder, python, steps}] (a broken one is left out, said in errors)."""
    root = Path(root)
    out, errors = [], []
    if not root.is_dir():
        return out, errors
    for spec in sorted(root.glob("*/plugin.json")):
        folder = spec.parent
        try:
            raw = json.load(open(spec, encoding="utf-8"))
            if not ID.match(str(raw.get("id", ""))):
                raise ValueError("its id is missing or not a plain word")
            py = str(raw.get("python") or "")
            if py:
                py = (folder / py) if not Path(py).is_absolute() else Path(py)
                if not Path(py).exists():
                    raise ValueError(f"its python is not there: {py}")
            steps = [s for s in (_step(r, folder) for r in raw.get("steps") or []) if s]
            if not steps:
                raise ValueError("no step with a script inside its folder")
            out.append({"id": raw["id"], "name": str(raw.get("name") or raw["id"]), "folder": str(folder.resolve()),
                        "python": str(py), "steps": steps, "builtin": bool(builtin),
                        "pipelines": [x for x in raw.get("pipelines") or [] if isinstance(x, dict)][:24]})   # HERESY 1553: its own profiles
        except (OSError, ValueError, TypeError, AttributeError) as e:
            errors.append({"plugin": folder.name, "error": str(e)})
    return out, errors


def public(plugins):
    """What the page sees: names, words and fields, not the paths."""
    return [{"id": p["id"], "name": p["name"], "builtin": p.get("builtin", False),
             "steps": [{k: s[k] for k in ("id", "label", "say", "tip", "gpu", "params", "input", "prefer", "group", "after")} for s in p["steps"]]}
            for p in plugins]


def find(plugins, pid, sid):
    for p in plugins:
        if p["id"] == pid:
            for s in p["steps"]:
                if s["id"] == sid:
                    return p, s
    raise ValueError(f"no step {sid} in a plugin {pid}")


def clean(step, given):
    """The step's fields from what the page sent: each in its kind and bounds, the default where it is missing."""
    given = given if isinstance(given, dict) else {}
    out = {}
    for p in step["params"]:
        v = given.get(p["key"], p["default"])
        if p["type"] == "select":
            out[p["key"]] = str(v) if str(v) in [o[0] for o in p["options"]] else p["default"]
        elif p["type"] == "number":
            try:
                v = float(v)
            except (TypeError, ValueError):
                v = p["default"]
            out[p["key"]] = min(p["max"], max(p["min"], v))
        elif p["type"] == "file":                       # HERESY 1557: checked and made a path by the lab (lab.file_param)
            out[p["key"]] = str(v or "")[:400]
        else:
            out[p["key"]] = v is True or str(v).lower() in ("1", "true", "on", "yes")
    return out


def command(plugin, step, audio, outdir, params_file, lab_py):
    return [step.get("python") or plugin["python"] or str(lab_py), step["script"], str(audio), str(outdir), str(params_file)]


def result(stdout):
    """The step's last line of JSON, its files checked to be plain names."""
    lines = [l for l in (stdout or "").strip().splitlines() if l.strip()]
    if not lines:
        raise RuntimeError("the step said nothing")
    r = json.loads(lines[-1])
    files = []
    for f in r.get("files") or []:
        name = str(f.get("file", ""))
        if not name or "/" in name or name.startswith("."):
            raise RuntimeError(f"a file name it gave is not plain: {name!r}")
        files.append({"name": str(f.get("name") or name), "file": name, "seconds": f.get("seconds")})
        if Path(name).suffix.lower() in TEXT:     # HERESY 1484: read, not played
            files[-1]["kind"] = "text"
        elif Path(name).suffix.lower() in IMAGE:  # HERESY 1553: looked at
            files[-1]["kind"] = "image"
        src = str(f.get("source") or "")          # HERESY 1553: the stem it is a version of, inside the take
        if src and src.startswith("derived/") and ".." not in src.split("/") and not src.startswith("/"):
            files[-1]["source"] = src
    if not files:
        raise RuntimeError("the step made no file")
    return {"files": files, "measure": r.get("measure") or {}, "took": r.get("took"), "summary": str(r.get("summary") or "")[:300]}
