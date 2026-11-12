"""HERESY 1988 (Viktor 01.11.2026: «Огромное упущение у нас в карточках треков - если трек модифицировался через Огранщика, пометок мало, нужно полное
родословное дерево, и я предлагаю внедрить это в контекстное меню, плюс кнопочку ДРЕВА родителей и потомков, и в попапе выводить… подобное тому древу,
что в Огранщике, с быстрым переходом на нужной дериватив или производный»): a take's family. Two lines of descent, both written down already:
· between takes: a take made from another (cropped, trimmed, sung again, a section replaced, extended; imported as a version of it) names it in its
  request.json «parent»;
· inside a take: what the Refiner made of it (stems, remaster, upscale, MIDI, the DAW's mixes…) lives in its derived/, each with a manifest naming
  its kind and what it came from (the take, a stem, another version).
· made again: a take regenerated with a new seed from another is kept in the Library's marks (regen_of), read here beside them.
    tree(kit, name, regen=None) → {"focus": name, "root": node, "ancestors": [names, oldest first], "gone_parent": a parent no longer here}
    node = {"name", "title", "created", "what", "here", "derived": [{"id", "kind", "label", "source", "when"}], "children": [node…]}
The takes' parents are read once and kept while outputs/ is unchanged (its folder's mtime and its count)."""
import json
import os
import re
import threading
import time
from pathlib import Path

LOCK = threading.Lock()
_IDX = {"sig": None, "parent": {}, "kids": {}, "info": {}}
SAFE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$")
WHAT = {"trim": "trimmed to the text", "crop": "cropped", "cut": "a section removed", "repeat": "a section repeated", "insert": "a part inserted",
        "speed": "its speed changed", "extend": "extended", "end": "ended earlier", "fade": "faded in", "replay": "sung again", "resing": "a line sung again",
        "replace": "a section replaced", "once": "sung once more", "interlude": "an interlude inserted", "window": "a window sung anew", "vla": "through the analog loop"}


EDITED = {"crop": "cropped", "remove": "a section removed", "cut": "a section removed", "arrange": "arranged", "speed": "its speed changed"}


def _sig(out):
    """outputs/' own mtime and count, and (HERESY 2011, the audit's C6) the newest meta.json and request.json in it: a rename changes a take's
    meta.json, not outputs/, and the tree kept the old title."""
    try:
        st, newest, n = out.stat(), 0, 0
        for e in os.scandir(out):
            n += 1
            for f in ("meta.json", "request.json"):
                try:
                    newest = max(newest, os.stat(os.path.join(e.path, f)).st_mtime_ns)
                except OSError:
                    pass
        return (int(st.st_mtime_ns), n, newest)
    except OSError:
        return None


def _index(kit):
    out = Path(kit) / "outputs"
    sig = _sig(out)
    with LOCK:
        if sig is not None and sig == _IDX["sig"]:
            return _IDX
        parent, kids, info = {}, {}, {}
        for e in os.scandir(out) if out.is_dir() else []:
            if not e.is_dir():
                continue
            d = Path(e.path)
            try:
                r = json.load(open(d / "request.json", encoding="utf-8"))
            except (OSError, ValueError):
                r = {}
            try:
                m = json.load(open(d / "meta.json", encoding="utf-8"))
            except (OSError, ValueError):
                m = {}
            p = str(r.get("parent") or "")
            ed = r.get("edited") if isinstance(r.get("edited"), dict) else {}
            if not p and ed.get("from"):                 # HERESY 2011 (the audit's C8): a take made by Edit names its source in edited.from
                p = str(ed["from"])
                if not r.get("what") and str(ed.get("op") or "") in EDITED:
                    r["what"] = EDITED[str(ed["op"])]
            if p and p != e.name:
                parent[e.name] = p
                kids.setdefault(p, []).append(e.name)
            info[e.name] = {"title": str(m.get("title") or r.get("title") or e.name), "created": m.get("created") or 0,
                            "what": str(r.get("what") or ""), "import": m.get("model") == "import"}
        for k in kids.values():
            k.sort(key=lambda n: (info.get(n, {}).get("created") or 0, n))
        _IDX.update(sig=sig, parent=parent, kids=kids, info=info)
        return _IDX


def _what(name, parent, i):
    """What a take is of its parent: its own word, else the word its name ends with (…-trim), else nothing."""
    if i.get("what"):
        return i["what"]
    tail = name.rsplit("-", 1)[-1].lower() if "-" in name else ""
    if tail in WHAT:
        return WHAT[tail]
    return "imported as a version of it" if i.get("import") else ""


def _when(v, f):
    """A manifest's time as seconds: a number as it is, the Refiner's «2026-10-24 19:28» read as local time, else the manifest's own mtime."""
    if isinstance(v, (int, float)) and v > 0:
        return int(v)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return int(time.mktime(time.strptime(str(v), fmt)))
        except (TypeError, ValueError):
            pass
    return int(f.stat().st_mtime)


def _derived(kit, name, info=None):
    """What the Refiner made inside a take: its derived/ manifests, oldest first (a broken one left out, as the Refiner leaves it). HERESY 2298: with the
    realm written on it when made, and the other takes it took in (a Reader's mix of voice and music: the music's take, a link) as `links`."""
    root = Path(kit) / "outputs" / name / "derived"
    out = []
    for m in sorted(root.glob("*/manifest.json")) if root.is_dir() else []:
        try:
            j = json.load(open(m, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        out.append({"id": str(j.get("id") or m.parent.name), "kind": str(j.get("kind") or ""), "label": str(j.get("label") or ""),
                    "source": str(j.get("source") or ""), "when": _when(j.get("when") or j.get("created"), m),
                    "realm": str(j.get("realm") or ""),
                    "links": [{"take": str(i.get("take")), "realm": str(i.get("realm") or ""), "title": str((info or {}).get(i.get("take"), {}).get("title") or i.get("take"))}
                              for i in (j.get("inputs") if isinstance(j.get("inputs"), list) else []) if isinstance(i, dict) and i.get("take") and i.get("take") != name]})
    out.sort(key=lambda x: (x["when"] or 0, x["id"]))
    return out


def tree(kit, name, regen=None):
    if not SAFE.match(str(name or "")):
        raise ValueError("no such take")
    idx = _index(kit)
    info, parent, kids = idx["info"], dict(idx["parent"]), {k: list(v) for k, v in idx["kids"].items()}
    again = set()
    for new, old in (regen or {}).items():          # the Library's «regen»: made again with a new seed from it, where nothing else is said
        if new in info and old and new not in parent and old != new:
            parent[new] = old
            kids.setdefault(old, []).append(new)
            again.add(new)
    if name not in info:
        raise FileNotFoundError("no such take: " + name)
    chain, seen, cur = [], {name}, name
    while cur in parent and parent[cur] not in seen and parent[cur] in info:   # up to the oldest one still here (one gone ends the chain, said)
        cur = parent[cur]
        seen.add(cur)
        chain.append(cur)
    chain.reverse()
    root = chain[0] if chain else name
    count = [0]

    def node(n, depth):
        count[0] += 1
        i = info.get(n)
        here = i is not None
        i = i or {"title": n, "created": 0, "what": "", "import": False}
        kid = [k for k in kids.get(n, []) if k != n]
        what = "made again with a new seed" if n in again else _what(n, parent.get(n, ""), i)
        return {"name": n, "title": i["title"], "created": i["created"], "here": here, "what": what,
                "derived": _derived(kit, n, info) if here else [],
                "children": [node(k, depth + 1) for k in kid] if depth < 40 and count[0] < 400 else []}

    top = parent.get(root, "")
    return {"focus": name, "ancestors": chain, "gone_parent": top if top and top not in info else "", "root": node(root, 0)}
