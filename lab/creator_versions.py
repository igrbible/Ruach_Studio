"""HERESY 1519 (Viktor's TODO 14.10.2026: «Version control of the Creator (style, lyrics, score kept under the base title on each Generate,
a diff of two, restore into the form, labels and stars)»; HERESY 1596, 19.10.2026: «Испортил, применил, F5, и ... проебал основу… Каждый
Ctrl+S или запуск генерации на изменённых текстах, параметрах, данных ABC сохраняет свою diff»; 13.10.2026: «В Писателя нужно автоматом отправлять все версии как в отдельный
бакет, чтобы потом, даже после удаления треков, можно было восстановить "потерянное"»): the Creator's words kept apart from the takes, one
file per base title in KIT/writer-versions/ (writer-versions-SCOPE for a test page, as the Writer's notebook): every Generate keeps the
title, style, lyrics and score it was sent with, its mode and the takes it made; the same words again only add their takes. Nothing is
deleted here: a version deleted goes into its title's trash and comes back from it; a locked one is not deleted at all.

HERESY 1614 (Viktor 19.10.2026: «привязывая древо изменений к имени трека как к базе, и ветвя по суффиксным номерам версий… vN.N»): a title
«Name vN.N» is the root «Name» and the branch «N.N»; one book per root, every version with its branch («» for none). The books kept under a
«Name vN.N» title before come into their root's book once, numbered after it in their time order, the old files moved to .adopted/. A whole
tree deleted («как это сделано с драфтами в Писателе») goes into .trash/ and comes back from it; a tree with a locked version stays."""
import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

LOCK = threading.Lock()
WORDS = ("title", "style", "lyrics", "abc")


def _dir(kit, scope=""):
    scope = re.sub(r"[^a-z0-9_-]", "", (scope or "").lower())[:20]
    d = Path(kit) / (f"writer-versions-{scope}" if scope else "writer-versions")
    d.mkdir(parents=True, exist_ok=True)
    return d


def clean_title(title):
    return re.sub(r"\s+", " ", str(title or "")).strip()[:120] or "Untitled"


VERSION_TAIL = re.compile(r"^(.*\S)\s+v(\d+(?:\.\d+)*)$", re.I)   # HERESY 1614: «Name v4.2.3»


def split_title(title):
    """(root, branch): «01. Крик. v4.2.3» -> («01. Крик.», «4.2.3»); a title with no version tail is its own root"""
    t = clean_title(title)
    m = VERSION_TAIL.match(t)
    return (m.group(1), m.group(2)) if m else (t, "")


def clean_version(v):
    """digits and dots only, no dot at either end, none doubled (the page's guard, again here)"""
    v = re.sub(r"\.{2,}", ".", re.sub(r"[^0-9.]", "", str(v or ""))).strip(".")
    return v[:24]


def _adopt(d):
    """HERESY 1614: every book whose title carries a version, or that shares its root with another, comes into its root's book once"""
    books = []
    for p in sorted(d.glob("*.json")):
        try:
            books.append((p, json.load(open(p, encoding="utf-8"))))
        except ValueError:
            continue
    roots = {}
    for p, b in books:
        root, branch = split_title(b.get("title"))
        roots.setdefault(root.lower(), []).append((p, b, root, branch))
    for key, group in roots.items():
        root = group[0][2]
        rid = base_id(root)
        if all(p.stem == rid and not br for p, b, r, br in group):
            continue
        target = next((b for p, b, r, br in group if p.stem == rid), None) or {"id": rid, "title": root, "created": time.time(), "versions": [], "trash": []}
        n = max([v.get("n", 0) for v in target.get("versions", []) + target.get("trash", [])] + [0])
        moved = []
        for p, b, r, branch in sorted(group, key=lambda g: g[1].get("created") or 0):
            if p.stem == rid:
                for v in b.get("versions", []) + b.get("trash", []):     # the root's own: a version tail in a version's title is its branch
                    vr, vb = split_title(v.get("title"))
                    if not v.get("version") and vb:
                        v["version"], v["title"] = vb, vr
                continue
            for into in ("versions", "trash"):
                for v in sorted(b.get(into) or [], key=lambda x: x.get("at") or 0):
                    n += 1
                    vr, vb = split_title(v.get("title"))
                    target.setdefault(into, []).append({**v, "n": n, "title": vr, "version": v.get("version") or vb or branch})
            moved.append(p)
        target["versions"] = sorted(target.get("versions", []), key=lambda x: x.get("n", 0))
        target["title"], target["updated"] = root, max([target.get("updated") or 0] + [g[1].get("updated") or 0 for g in group])
        _write(d, target)
        if moved:
            (d / ".adopted").mkdir(exist_ok=True)
            for p in moved:
                os.replace(p, d / ".adopted" / p.name)


def base_id(title):
    """a base title's file: the same title in any case and spacing is one"""
    return hashlib.sha1(clean_title(title).lower().encode("utf-8")).hexdigest()[:12]


def _path(d, vid):
    if not re.fullmatch(r"[0-9a-f]{12}", vid or ""):
        raise ValueError("bad id")
    return d / f"{vid}.json"


def _read(d, vid):
    p = _path(d, vid)
    if not p.is_file():
        raise FileNotFoundError("no versions under this title")
    return json.load(open(p, encoding="utf-8"))


def _write(d, book):
    p = _path(d, book["id"])
    tmp = Path(str(p) + ".part")
    json.dump(book, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def _find(book, n):
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("which version?")
    v = next((x for x in book.get("versions") or [] if x.get("n") == n), None)
    if not v:
        raise ValueError(f"no version {n} under this title")
    return v


def listing(kit, scope=""):
    out, d = [], _dir(kit, scope)
    with LOCK:
        _adopt(d)                                         # HERESY 1614
    for p in d.glob("*.json"):
        try:
            b = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        vs = b.get("versions") or []
        out.append({"id": b["id"], "title": b.get("title") or "Untitled", "versions": len(vs), "updated": b.get("updated"),
                    "stars": sum(1 for v in vs if v.get("star")), "takes": sum(len(v.get("takes") or []) for v in vs),
                    "trash": len(b.get("trash") or []), "branches": len({v.get("version") or "" for v in vs})})
    out.sort(key=lambda x: -(x["updated"] or 0))
    dropped = []                                          # HERESY 1614: the trees deleted whole, to bring back
    for p in sorted((d / ".trash").glob("*.json")) if (d / ".trash").is_dir() else []:
        try:
            b = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        dropped.append({"file": p.name, "title": b.get("title") or "Untitled", "versions": len(b.get("versions") or []), "dropped": b.get("dropped")})
    dropped.sort(key=lambda x: -(x["dropped"] or 0))
    return {"titles": out, "dropped": dropped}


def get(kit, vid="", title="", scope=""):
    d = _dir(kit, scope)
    with LOCK:
        _adopt(d)                                         # HERESY 1614
    root = split_title(title)[0]                          # a title with its version opens its root's tree
    vid = vid or base_id(root)
    try:
        return _read(d, vid)
    except FileNotFoundError:
        return {"id": vid, "title": root, "versions": [], "trash": []}


def post(kit, data, scope=""):
    op, d = data.get("op"), _dir(kit, scope)
    with LOCK:
        if op == "keep":                                  # a Generate's words and the takes they made
            _adopt(d)                                     # HERESY 1614: the root's tree, its branch from the title or the version given
            title, branch = split_title(data.get("title"))
            branch = clean_version(data.get("version")) or branch
            words = {f: str(data.get(f) or "") for f in WORDS}
            params = data.get("params") if isinstance(data.get("params"), dict) else {}          # HERESY 1596: the form's knobs
            knobs = json.dumps(params, sort_keys=True, ensure_ascii=False)
            if len(knobs) > 16000:
                params, knobs = {}, "{}"
            why = re.sub(r"[^a-z-]", "", str(data.get("why") or "generate").lower())[:16] or "generate"
            words["title"] = title
            takes = [n for n in data.get("takes") or [] if isinstance(n, str) and n and "/" not in n]
            vid = base_id(title)
            try:
                book = _read(d, vid)
            except FileNotFoundError:
                book = {"id": vid, "title": title, "created": time.time(), "versions": [], "trash": []}
            vs, now = book["versions"], time.time()
            last = next((v for v in reversed(vs) if (v.get("version") or "") == branch), None)   # HERESY 1614: the branch's last
            if last and all(last.get(f, "") == words[f] for f in WORDS) and json.dumps(last.get("params") or {}, sort_keys=True, ensure_ascii=False) == knobs:
                last["takes"] = sorted(set(last.get("takes") or []) | set(takes))   # the same words again: their takes only
            else:
                n = max([v.get("n", 0) for v in vs + (book.get("trash") or [])] + [0]) + 1
                vs.append({"n": n, "at": now, **words, "version": branch, "mode": str(data.get("mode") or "")[:12], "takes": takes, "label": "", "star": False,
                           "lock": False, "why": why, "params": params})
            book["title"], book["updated"] = title, now
            _write(d, book)
            return book
        if op == "mark":                                  # its label, its star, its lock
            book = _read(d, data.get("id"))
            v = _find(book, data.get("n"))
            if "label" in data:
                v["label"] = re.sub(r"\s+", " ", str(data.get("label") or "")).strip()[:80]
            for k in ("star", "lock"):
                if k in data:
                    v[k] = bool(data.get(k))
            _write(d, book)
            return book
        if op == "delete":                                # into the title's trash; a locked one stays
            book = _read(d, data.get("id"))
            v = _find(book, data.get("n"))
            if v.get("lock"):
                raise ValueError("this version is locked: unlock it first")
            book["versions"].remove(v)
            book.setdefault("trash", []).append({**v, "deleted": time.time()})
            _write(d, book)
            return book
        if op == "undelete":                              # back from the trash, in its place by number
            book = _read(d, data.get("id"))
            n = int(data.get("n", -1))
            v = next((x for x in book.get("trash") or [] if x.get("n") == n), None)
            if not v:
                raise ValueError(f"no version {n} in this title's trash")
            book["trash"].remove(v)
            v.pop("deleted", None)
            book["versions"].append(v)
            book["versions"].sort(key=lambda x: x.get("n", 0))
            _write(d, book)
            return book
        if op == "drop":                                  # HERESY 1614: the whole tree into .trash/; a locked version keeps it here
            book = _read(d, data.get("id"))
            locked = [v.get("n") for v in book.get("versions") or [] if v.get("lock")]
            if locked:
                raise ValueError("version " + ", ".join(f"#{n}" for n in locked) + " is locked: unlock it to delete the whole tree")
            (d / ".trash").mkdir(exist_ok=True)
            book["dropped"] = time.time()
            name = f"{book['id']}-{int(book['dropped'])}.json"
            json.dump(book, open(d / ".trash" / name, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            _path(d, book["id"]).unlink()
            return {"dropped": name, "title": book.get("title"), "versions": len(book.get("versions") or [])}
        if op == "undrop":                                # back whole; a tree grown again under its root meanwhile takes it in
            name = str(data.get("file") or "")
            if not re.fullmatch(r"[0-9a-f]{12}-\d+\.json", name) or not (d / ".trash" / name).is_file():
                raise ValueError("no such deleted tree")
            book = json.load(open(d / ".trash" / name, encoding="utf-8"))
            book.pop("dropped", None)
            try:
                here = _read(d, book["id"])
            except FileNotFoundError:
                here = None
            if here:
                n = max([v.get("n", 0) for v in here.get("versions", []) + here.get("trash", [])] + [0])
                for into in ("versions", "trash"):
                    for v in book.get(into) or []:
                        n += 1
                        here.setdefault(into, []).append({**v, "n": n})
                book = here
            _write(d, book)
            (d / ".trash" / name).unlink()
            return book
    raise ValueError("keep, mark, delete, undelete, drop or undrop")


# ---- HERESY 1522 (Viktor 17.10.2026: «бакет версий Творца включай в Export All как глобальный бекап/экспорт»): every title's book in the
# Writer's backup, and back: a title missing here comes in whole; one here gains the versions it lacks (the same words at the same moment
# are the same version), numbered after its own; nothing here is written over or taken away
def export_all(kit, scope=""):
    out = []
    for p in sorted(_dir(kit, scope).glob("*.json")):
        try:
            out.append(json.load(open(p, encoding="utf-8")))
        except ValueError:
            continue
    return out


def _clean_version(v):
    out = {"n": int(v.get("n") or 0), "at": float(v.get("at") or time.time()), "mode": str(v.get("mode") or "")[:12],
           "takes": [n for n in v.get("takes") or [] if isinstance(n, str) and n and "/" not in n],
           "label": re.sub(r"\s+", " ", str(v.get("label") or "")).strip()[:80], "star": bool(v.get("star")), "lock": bool(v.get("lock"))}
    for f in WORDS:
        out[f] = "" if v.get(f) is None else str(v.get(f))
    out["title"] = clean_title(out["title"])
    if v.get("deleted"):
        out["deleted"] = float(v.get("deleted"))
    return out


def import_all(kit, books, scope=""):
    told = {"titles": 0, "versions": 0, "same": 0, "skipped": 0}
    d = _dir(kit, scope)
    key = lambda v: (round(float(v.get("at") or 0), 3),) + tuple(v.get(f, "") for f in WORDS)
    with LOCK:
        for b in books if isinstance(books, list) else []:
            if not isinstance(b, dict) or not isinstance(b.get("versions") or [], list):
                told["skipped"] += 1
                continue
            try:
                vs = [_clean_version(v) for v in b.get("versions") or [] if isinstance(v, dict)]
                trash = [_clean_version(v) for v in b.get("trash") or [] if isinstance(v, dict)]
            except (TypeError, ValueError):
                told["skipped"] += 1
                continue
            title = clean_title(b.get("title"))
            vid = base_id(title)                              # by its title, as every Generate finds it
            try:
                mine = _read(d, vid)
            except FileNotFoundError:
                _write(d, {"id": vid, "title": title, "created": float(b.get("created") or time.time()),
                           "updated": float(b.get("updated") or time.time()), "versions": vs, "trash": trash})
                told["titles"] += 1
                told["versions"] += len(vs)
                continue
            have = {key(v) for v in mine["versions"] + (mine.get("trash") or [])}
            n = max([v.get("n", 0) for v in mine["versions"] + (mine.get("trash") or [])] + [0])
            added = 0
            for v, into in [(v, "versions") for v in vs] + [(v, "trash") for v in trash]:
                if key(v) in have:
                    told["same"] += 1
                    continue
                n += 1
                v["n"] = n
                mine.setdefault(into, []).append(v)
                have.add(key(v))
                added += 1 if into == "versions" else 0
            if added or len(mine.get("trash") or []) != len(trash):
                mine["updated"] = time.time()
                _write(d, mine)
            told["versions"] += added
    return told

