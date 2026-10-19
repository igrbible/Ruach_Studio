"""HERESY 1519 (Viktor's TODO 14.10.2026: «Version control of the Creator (style, lyrics, score kept under the base title on each Generate,
a diff of two, restore into the form, labels and stars)»; 13.10.2026: «В Писателя нужно автоматом отправлять все версии как в отдельный
бакет, чтобы потом, даже после удаления треков, можно было восстановить "потерянное"»): the Creator's words kept apart from the takes, one
file per base title in KIT/writer-versions/ (writer-versions-SCOPE for a test page, as the Writer's notebook): every Generate keeps the
title, style, lyrics and score it was sent with, its mode and the takes it made; the same words again only add their takes. Nothing is
deleted here: a version deleted goes into its title's trash and comes back from it; a locked one is not deleted at all."""
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
    out = []
    for p in _dir(kit, scope).glob("*.json"):
        try:
            b = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        vs = b.get("versions") or []
        out.append({"id": b["id"], "title": b.get("title") or "Untitled", "versions": len(vs), "updated": b.get("updated"),
                    "stars": sum(1 for v in vs if v.get("star")), "takes": sum(len(v.get("takes") or []) for v in vs),
                    "trash": len(b.get("trash") or [])})
    out.sort(key=lambda x: -(x["updated"] or 0))
    return {"titles": out}


def get(kit, vid="", title="", scope=""):
    d = _dir(kit, scope)
    vid = vid or base_id(title)
    try:
        return _read(d, vid)
    except FileNotFoundError:
        return {"id": vid, "title": clean_title(title), "versions": [], "trash": []}


def post(kit, data, scope=""):
    op, d = data.get("op"), _dir(kit, scope)
    with LOCK:
        if op == "keep":                                  # a Generate's words and the takes they made
            title = clean_title(data.get("title"))
            words = {f: str(data.get(f) or "") for f in WORDS}
            words["title"] = title
            takes = [n for n in data.get("takes") or [] if isinstance(n, str) and n and "/" not in n]
            vid = base_id(title)
            try:
                book = _read(d, vid)
            except FileNotFoundError:
                book = {"id": vid, "title": title, "created": time.time(), "versions": [], "trash": []}
            vs, now = book["versions"], time.time()
            last = vs[-1] if vs else None
            if last and all(last.get(f, "") == words[f] for f in WORDS):
                last["takes"] = sorted(set(last.get("takes") or []) | set(takes))   # the same words again: their takes only
            else:
                n = max([v.get("n", 0) for v in vs + (book.get("trash") or [])] + [0]) + 1
                vs.append({"n": n, "at": now, **words, "mode": str(data.get("mode") or "")[:12], "takes": takes, "label": "", "star": False, "lock": False})
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
    raise ValueError("keep, mark, delete or undelete")


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

