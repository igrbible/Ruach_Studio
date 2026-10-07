"""HERESY 1047: the Writer's notebook, the lab's side. Imported by lab.py.

A document is a song or a reading in the making: a title, STYLE, LYRICS, NOTES (Markdown) and
PARAMS (every knob of the Create form), the takes made from it, and its history, up to KEEP versions:
a save keeps the version before it; the page's autosave keeps one only after a pause of QUIET
seconds (so a sitting of typing is one version, not a hundred), and "snapshot" keeps the document
as it stands, under a label. Documents are the user's work, so
they live in the Kit beside the library (KIT/writer/ID.json); a deleted one goes to
KIT/writer/.trash/ and nothing is deleted here.
"""
import json, os, re, shutil, threading, time, uuid
from pathlib import Path

LOCK = threading.Lock()
KEEP = 100
QUIET = 600
FIELDS = ("title", "style", "lyrics", "notes", "params")


def _dir(kit, scope=""):
    """KIT/writer, or KIT/writer-SCOPE for a test page (?scope=NAME), as the settings do"""
    scope = re.sub(r"[^a-z0-9_-]", "", (scope or "").lower())[:20]
    d = kit / (f"writer-{scope}" if scope else "writer")
    d.mkdir(exist_ok=True)
    return d


def _path(d, did):
    if not re.fullmatch(r"[0-9a-f]{12}", did or ""):
        raise ValueError("bad document id")
    return d / f"{did}.json"


def _read(d, did):
    p = _path(d, did)
    if not p.is_file():
        raise FileNotFoundError("no such document")
    return json.load(open(p, encoding="utf-8"))


def _write(d, doc):
    p = _path(d, doc["id"])
    tmp = Path(str(p) + ".part")
    json.dump(doc, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def listing(kit, scope=""):
    out = []
    for p in sorted(_dir(kit, scope).glob("*.json")):
        try:
            d = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        lyr = (d.get("lyrics") or "").strip().split("\n")
        first = next((l for l in lyr if l.strip() and not l.strip().startswith("[")), "")
        out.append({"id": d["id"], "title": d.get("title") or "Untitled", "updated": d.get("updated"), "created": d.get("created"),
                    "takes": len(d.get("takes") or []), "versions": len(d.get("versions") or []),
                    "excerpt": first[:120], "style": (d.get("style") or "")[:120],
                    "hay": "\n".join(str(d.get(f) or "") for f in ("title", "style", "lyrics", "notes"))[:50000]})
    out.sort(key=lambda x: -(x["updated"] or 0))
    return {"docs": out}


def get(kit, did, scope=""):
    return _read(_dir(kit, scope), did)


def post(kit, data, scope=""):
    op = data.get("op")
    wd = _dir(kit, scope)
    with LOCK:
        if op == "put":                                   # create, or save over (keeping the version before)
            did = data.get("id") or uuid.uuid4().hex[:12]
            now = time.time()
            try:
                doc = _read(wd, did)
            except FileNotFoundError:
                if data.get("id"):
                    raise
                doc = {"id": did, "created": now, "takes": [], "versions": []}
                for f in FIELDS:
                    doc[f] = "" if f != "params" else {}
            new = {f: data.get(f, doc.get(f)) for f in FIELDS}
            new["title"] = str(new["title"] or "Untitled").strip()[:120]
            changed = any(new[f] != doc.get(f) for f in FIELDS)
            quiet = not data.get("autosave") or now - (doc.get("updated") or 0) > QUIET
            if changed and quiet and any(doc.get(f) for f in FIELDS):
                doc["versions"].append({"at": doc.get("updated") or now, "label": str(data.get("label") or "")[:80],
                                        **{f: doc.get(f) for f in FIELDS}})
                doc["versions"] = doc["versions"][-KEEP:]
            doc.update(new)
            if changed or "updated" not in doc:
                doc["updated"] = now
            _write(wd, doc)
            return doc
        if op == "snapshot":                              # the document as it stands, kept under a label
            doc = _read(wd, data.get("id"))
            doc["versions"].append({"at": time.time(), "label": str(data.get("label") or "")[:80], **{f: doc.get(f) for f in FIELDS}})
            doc["versions"] = doc["versions"][-KEEP:]
            _write(wd, doc)
            return doc
        if op == "link":                                  # takes made from the document
            doc = _read(wd, data.get("id"))
            names = [n for n in data.get("takes") or [] if isinstance(n, str) and "/" not in n]
            doc["takes"] = sorted(set(doc.get("takes") or []) | set(names))
            _write(wd, doc)
            return doc
        if op == "restore":                               # a version back on top (the current one kept as a version)
            doc = _read(wd, data.get("id"))
            i = int(data.get("version", -1))
            if not 0 <= i < len(doc["versions"]):
                raise ValueError("no such version")
            v = doc["versions"][i]
            doc["versions"].append({"at": doc.get("updated"), "label": "before restoring a version", **{f: doc.get(f) for f in FIELDS}})
            doc.update({f: v.get(f) for f in FIELDS})
            doc["updated"] = time.time()
            _write(wd, doc)
            return doc
        if op == "export":                                # HERESY 1168: the whole notebook in one file, for a backup
            return {"kind": BACKUP_KIND, "version": 1, "made": time.time(),
                    "docs": _all(wd), "trash": _all(wd / ".trash")}
        if op == "import":                                # a backup back: what is missing comes in, nothing is written over
            return _import(kit, wd, data.get("backup"), scope)
        if op == "delete":                                # into writer/.trash, never deleted here
            p = _path(wd, data.get("id"))
            if p.is_file():
                t = wd / ".trash"
                t.mkdir(exist_ok=True)
                shutil.move(str(p), str(t / p.name))
            return listing(kit, scope)
    raise ValueError("put, snapshot, link, restore, delete, export or import")


# HERESY 1168 (Viktor 07.10.2026: «В комнате Писателя добавить глобальный экспорт/импорт всех данных скопом для бекапа»):
# every document with its versions and the takes made from it, and the trash, in one JSON file; brought back, a document
# missing here comes in as it was (a trashed one into the trash), the same one is left alone, and one that differs from
# the document of its id here comes in beside it as a copy with a new id: nothing here is ever written over
BACKUP_KIND = "ruach-writer-backup"


def _all(d):
    out = []
    for p in sorted(d.glob("*.json")) if d.is_dir() else []:
        try:
            out.append(json.load(open(p, encoding="utf-8")))
        except ValueError:
            continue
    return out


def _clean(doc):
    """a document of a backup, its fields of the right kinds (a hand-edited file may not have them)"""
    out = {"id": doc["id"], "created": float(doc.get("created") or time.time()), "updated": float(doc.get("updated") or time.time()),
           "takes": [n for n in doc.get("takes") or [] if isinstance(n, str) and "/" not in n],
           "versions": [v for v in doc.get("versions") or [] if isinstance(v, dict)][-KEEP:]}
    for f in FIELDS:
        v = doc.get(f)
        out[f] = (v if isinstance(v, dict) else {}) if f == "params" else ("" if v is None else str(v))
    out["title"] = (out["title"] or "Untitled").strip()[:120]
    return out


def _import(kit, wd, backup, scope=""):
    if not isinstance(backup, dict) or backup.get("kind") != BACKUP_KIND or not isinstance(backup.get("docs"), list):
        raise ValueError("not a Writer backup (a file this room exported)")
    told = {"added": 0, "same": 0, "copies": 0, "trashed": 0, "skipped": 0}
    trash = wd / ".trash"
    for doc, into in [(d, wd) for d in backup["docs"]] + [(d, trash) for d in backup.get("trash") or []]:
        if not isinstance(doc, dict) or not re.fullmatch(r"[0-9a-f]{12}", str(doc.get("id", ""))):
            told["skipped"] += 1
            continue
        doc = _clean(doc)
        here = next((d / f"{doc['id']}.json" for d in (wd, trash) if (d / f"{doc['id']}.json").is_file()), None)
        if here is not None:
            try:
                mine = json.load(open(here, encoding="utf-8"))
            except ValueError:
                mine = {}
            if all(mine.get(f) == doc[f] for f in FIELDS) and len(mine.get("versions") or []) >= len(doc["versions"]):
                told["same"] += 1
                continue
            doc["id"] = uuid.uuid4().hex[:12]
            doc["title"] = (doc["title"] + " · from the backup")[:120]
            told["copies"] += 1
        else:
            told["trashed" if into is trash else "added"] += 1
        into.mkdir(exist_ok=True)
        tmp = into / f"{doc['id']}.json.part"
        json.dump(doc, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        os.replace(tmp, into / f"{doc['id']}.json")
    return dict(listing(kit, scope), imported=told)
