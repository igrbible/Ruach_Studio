"""HERESY 1533 · the DAW's mixes kept on Forge, beside the set of stems they mix (derived/<set>/mixes.json): the working mix, saved as
it is set, so the DAW opens as it was left on any machine and in any browser; and mixes kept by name, to come back to. The page's own
state is kept as it sends it (its strips, versions, returns, master, A and B): the lab checks only that it is an object of JSON and not
too big, never what it holds (the render checks a mix when it is mixed)."""
import json
import os
import re
import tempfile
import threading
import time
from pathlib import Path

LIMIT = 512 * 1024
NAME_RE = re.compile(r"[^\x00-\x1f\\/]{1,80}")
_lock = threading.Lock()


def _path(set_dir):
    return Path(set_dir) / "mixes.json"


def load(set_dir):
    """What is kept; a file that cannot be read is said (broken), never taken for «nothing kept»: the next write sets it aside first."""
    p = _path(set_dir)
    try:
        d = json.load(open(p, encoding="utf-8"))
        if not isinstance(d, dict):
            raise ValueError("not an object")
    except FileNotFoundError:
        d = {}
    except (OSError, ValueError):
        return {"working": None, "named": [], "broken": p.name}
    named = [m for m in d.get("named", []) if isinstance(m, dict) and isinstance(m.get("name"), str) and isinstance(m.get("state"), dict)]
    working = d.get("working") if isinstance(d.get("working"), dict) and isinstance(d["working"].get("state"), dict) else None
    return {"working": working, "named": named}


def _write(set_dir, d):
    p = _path(set_dir)
    if load(set_dir).get("broken"):                     # the unreadable file kept aside, as it was, before anything new is written
        os.replace(p, p.with_name(f"mixes.broken-{time.strftime('%Y%m%d-%H%M%S')}.json"))
    d.pop("broken", None)
    fd, tmp = tempfile.mkstemp(prefix=".mixes-", suffix=".json", dir=str(p.parent))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, p)


def _state(state):
    if not isinstance(state, dict):
        raise ValueError("a mix is an object")
    if len(json.dumps(state)) > LIMIT:
        raise ValueError(f"a mix is at most {LIMIT // 1024} KB")
    return state


def keep_working(set_dir, state):
    with _lock:
        d = load(set_dir)
        d["working"] = {"state": _state(state), "saved": time.time()}
        _write(set_dir, d)
        return d


def save_as(set_dir, name, state):
    name = str(name or "").strip()
    if not NAME_RE.fullmatch(name):
        raise ValueError("a mix's name: 1 to 80 characters, no slashes")
    with _lock:
        d = load(set_dir)
        d["named"] = [m for m in d["named"] if m["name"] != name] + [{"name": name, "state": _state(state), "saved": time.time()}]
        d["named"].sort(key=lambda m: m["saved"])
        _write(set_dir, d)
        return d


def delete(set_dir, name):
    with _lock:
        d = load(set_dir)
        left = [m for m in d["named"] if m["name"] != str(name)]
        if len(left) == len(d["named"]):
            raise ValueError(f"no mix named {name!r}")
        d["named"] = left
        _write(set_dir, d)
        return d
