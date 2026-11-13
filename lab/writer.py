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

try:
    import writer_worlds as worlds   # HERESY 2486, 2487: the two worlds (a SOUL per world, its tasks, templates, draft shape; the migration)
except ImportError:                  # the stand-in server loads this file by its path
    import importlib.util as _ilu
    _sp = _ilu.spec_from_file_location("writer_worlds", Path(__file__).with_name("writer_worlds.py"))
    worlds = _ilu.module_from_spec(_sp)
    _sp.loader.exec_module(worlds)

LOCK = threading.Lock()
KEEP = 100
QUIET = 600
FIELDS = ("title", "style", "lyrics", "notes", "params")
REALMS = ("creator", "reader")   # HERESY 2480: whose document it is, as a Library take's realm: a song for the Musician or a reading for the Narrator
DRAFTS_KEEP = 60                 # HERESY 2481: the Writing room's answers kept per document (and for the Musician's song)


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
    with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
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
                    "realm": d.get("realm") if d.get("realm") in REALMS else "creator",   # HERESY 2480: one without it is a song, as before
                    "realm_set": d.get("realm") in REALMS,   # HERESY 2487: a world stored (by hand, by the Narrator or the migration), not the default
                    "from_reader": d.get("from_reader") if isinstance(d.get("from_reader"), dict) else None,
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
            if data.get("realm") in REALMS and data.get("realm") != doc.get("realm"):   # HERESY 2480: no version of its own, the text is the same
                doc["realm"] = data["realm"]
                changed = True
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
        if op == "unlink":                                # HERESY 2493: a take linked by mistake taken off the document (it stays in the Library)
            doc = _read(wd, data.get("id"))
            gone = set(n for n in data.get("takes") or [] if isinstance(n, str))
            doc["takes"] = [n for n in (doc.get("takes") or []) if n not in gone]
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
            return {"kind": BACKUP_KIND, "version": 2, "made": time.time(),
                    "docs": _all(wd), "trash": _all(wd / ".trash"),
                    "drafts": {p.stem: _drafts_read(p) for p in sorted((wd / "drafts").glob("*.json"))} if (wd / "drafts").is_dir() else {},   # HERESY 2481
                    "creator_versions": _versions().export_all(kit, scope),   # HERESY 1522: the Creator's versions with the notebook
                    "souls": worlds.souls_export(wd)}          # HERESY 2486: each world's SOUL
        if op == "import":                                # a backup back: what is missing comes in, nothing is written over
            return _import(kit, wd, data.get("backup"), scope)
        if op == "trash":                                 # HERESY 2479: what the trash holds, the newest thrown first
            return {"trash": _trash_list(wd)}
        if op == "untrash":                               # HERESY 2479: a document back from writer/.trash (beside a namesake id here, a new id)
            src = _path(wd / ".trash", data.get("id"))
            if not src.is_file():
                raise FileNotFoundError("no such document in the trash")
            doc = json.load(open(src, encoding="utf-8"))
            if _path(wd, doc["id"]).is_file():
                old = doc["id"]
                doc["id"] = uuid.uuid4().hex[:12]
                d0, d1 = _drafts_path(wd, old), _drafts_path(wd, doc["id"])
                if d0.is_file():
                    shutil.copy(str(d0), str(d1))
            doc["updated"] = time.time()
            _write(wd, doc)
            src.unlink()
            return dict(listing(kit, scope), doc=doc)
        if op == "draft":                                 # HERESY 2481: one answer of the Writing room kept, for a document or the Musician's song
            did = _drafts_id(data.get("id"))
            rec = _draft_clean(data.get("draft"))
            p = _drafts_path(wd, did)
            kept = _drafts_read(p)
            kept.append(rec)
            _drafts_write(p, kept[-DRAFTS_KEEP:])
            return {"drafts": kept[-DRAFTS_KEEP:]}
        if op == "drafts":                                # HERESY 2481: the answers kept, the oldest first
            return {"drafts": _drafts_read(_drafts_path(wd, _drafts_id(data.get("id"))))}
        # HERESY 2486: the two worlds of the Writer, each its charter, SOUL (versioned), tasks, templates and draft shape
        if op == "world":                                 # a world as a whole, by its name or by a document's (none stored: the Musician's)
            realm = data.get("realm")
            if data.get("id"):
                realm = _read(wd, data["id"]).get("realm") or "creator"
            return worlds.world(wd, realm)
        if op == "soul":                                  # read, or with "text" written (the text before kept as a version)
            realm = worlds.realm_of(data.get("realm"))
            return worlds.soul(wd, realm) if data.get("text") is None else worlds.soul_put(wd, realm, data.get("text"))
        if op == "soul_version":
            return worlds.soul_version(wd, data.get("realm"), data.get("name"))
        if op == "soul_seed":                             # «Your preferences» moved into the world's SOUL once, only where it is empty
            return worlds.soul_seed(wd, worlds.realm_of(data.get("realm")), data.get("text"))
        if op == "template":                              # the user's own template of a world: put, or with "delete" taken away
            return worlds.template_put(wd, worlds.realm_of(data.get("realm")), data, _name_check())
        # HERESY 2487: a document between the worlds
        if op == "candidates":                            # the one-time migration: documents of no world that look like readings, and why
            return worlds.candidates(_all(wd), wd)
        if op == "migrate":                               # the ones Viktor ticked become readings; the migration marked done either way
            ids = [i for i in data.get("ids") or [] if isinstance(i, str) and re.fullmatch(r"[0-9a-f]{12}", i)]
            moved = 0
            for did in ids:
                try:
                    doc = _read(wd, did)
                except FileNotFoundError:
                    continue
                if doc.get("realm") not in REALMS:        # a world set meanwhile (by hand) is left as it is
                    doc["realm"] = "reader"
                    doc["updated"] = time.time()
                    _write(wd, doc)
                    moved += 1
            return dict(listing(kit, scope), migrated=moved, done=worlds.mark_migrated(wd, ids))
        if op == "to_reader":                             # «Read in the Narrator»: stamped, and a document of no world yet a reading
            doc = _read(wd, data.get("id"))
            doc["from_reader"] = dict(doc.get("from_reader") if isinstance(doc.get("from_reader"), dict) else {}, at=time.time())
            if doc.get("realm") not in REALMS:
                doc["realm"] = "reader"
            _write(wd, doc)
            return doc
        if op == "from_reader":                           # the Narrator's «Edit in the Writer»: its document, its text saved in as a version, or a new reading
            return _from_reader(kit, wd, data, scope)
        if op == "delete":                                # into writer/.trash, never deleted here
            p = _path(wd, data.get("id"))
            if p.is_file():
                t = wd / ".trash"
                t.mkdir(exist_ok=True)
                shutil.move(str(p), str(t / p.name))
            return listing(kit, scope)
    raise ValueError("put, snapshot, link, restore, delete, trash, untrash, draft, drafts, export, import, world, soul, soul_version, soul_seed, "
                     "template, candidates, migrate, to_reader or from_reader")


def _name_check():
    """HERESY 2462: the names' rule (name_rule.py beside this file); None when the stand-in has no such file"""
    try:
        import name_rule
        return name_rule.check
    except ImportError:
        return None


# HERESY 2487: the Narrator's «Edit in the Writer». The document its text came from: when the Narrator's text differs (it stays editable there,
# Viktor's word of 12.11), that text goes in as a new version, the one before kept as every save keeps it; title, style and knobs only where the
# document has none. No document, or one gone: a new reading of that text. The caller holds LOCK.
def _from_reader(kit, wd, data, scope=""):
    text = str(data.get("text") or "")
    did, now = str(data.get("doc") or ""), time.time()
    doc = None
    if re.fullmatch(r"[0-9a-f]{12}", did):
        try:
            doc = _read(wd, did)
        except FileNotFoundError:
            doc = None
    if doc is not None:
        updated = bool(text.strip()) and text != (doc.get("lyrics") or "")
        if updated:
            doc["versions"].append({"at": doc.get("updated") or now, "label": "before the Narrator's text", **{f: doc.get(f) for f in FIELDS}})
            doc["versions"] = doc["versions"][-KEEP:]
            doc["lyrics"] = text
            for f in ("title", "style"):
                if not doc.get(f) and data.get(f):
                    doc[f] = str(data[f])[:120 if f == "title" else 60000]
            if not doc.get("params") and isinstance(data.get("params"), dict):
                doc["params"] = data["params"]
            doc["updated"] = now
        doc["from_reader"] = dict(doc.get("from_reader") if isinstance(doc.get("from_reader"), dict) else {}, back=now)
        _write(wd, doc)
        return {"doc": doc, "created": False, "updated": updated}
    if not text.strip():
        raise ValueError("the Narrator has no text to bring")
    did = uuid.uuid4().hex[:12]
    doc = {"id": did, "created": now, "updated": now, "takes": [], "versions": [], "realm": "reader", "from_reader": {"at": now, "back": now},
           "title": (str(data.get("title") or "").strip() or worlds.first_line(text) or "Untitled")[:120], "style": str(data.get("style") or "")[:60000],
           "lyrics": text, "notes": "", "params": data.get("params") if isinstance(data.get("params"), dict) else {}}
    _write(wd, doc)
    return {"doc": doc, "created": True, "updated": False}


# HERESY 2487: the Narrator's takes linked to the document they were read from, by the lab when the run lands (the page may be closed by then)
def link_takes(kit, did, names, scope=""):
    wd = _dir(kit, scope)
    names = [n for n in names or [] if isinstance(n, str) and n and "/" not in n]
    if not names or not re.fullmatch(r"[0-9a-f]{12}", str(did or "")):
        return None
    with LOCK:
        doc = _read(wd, did)                              # FileNotFoundError for a document gone: the caller says so
        doc["takes"] = sorted(set(doc.get("takes") or []) | set(names))
        _write(wd, doc)
        return doc


# HERESY 2479: the trash as a list (its documents are files that were moved there; the move's time is the file's)
def _trash_list(wd):
    out = []
    for p in (wd / ".trash").glob("*.json") if (wd / ".trash").is_dir() else []:
        try:
            d = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        lyr = (d.get("lyrics") or "").strip().split("\n")
        first = next((l for l in lyr if l.strip() and not l.strip().startswith("[")), "")
        out.append({"id": d.get("id"), "title": d.get("title") or "Untitled", "updated": d.get("updated"), "deleted": p.stat().st_mtime,
                    "realm": d.get("realm") if d.get("realm") in REALMS else "creator", "versions": len(d.get("versions") or []),
                    "excerpt": first[:120]})
    out.sort(key=lambda x: -(x["deleted"] or 0))
    return out


# HERESY 2481: the Writing room's answers, a file per document beside the documents (writer/drafts/ID.json, song.json for the Musician's song),
# so a document's own file and every save of it stay small; a trashed document keeps its file there and finds it again when brought back
def _drafts_id(did):
    did = str(did or "song")
    if did != "song" and not re.fullmatch(r"[0-9a-f]{12}", did):
        raise ValueError("bad document id")
    return did


def _drafts_path(wd, did):
    d = wd / "drafts"
    d.mkdir(exist_ok=True)
    return d / f"{did}.json"


def _drafts_read(p):
    try:
        v = json.load(open(p, encoding="utf-8"))
        return [r for r in v if isinstance(r, dict)] if isinstance(v, list) else []
    except (OSError, ValueError):
        return []


def _drafts_write(p, kept):
    tmp = Path(str(p) + ".part")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(kept, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


def _draft_clean(r):
    """one answer as the page sends it, its strings bounded (a raw answer of 200 000 characters at most) and nothing else kept"""
    if not isinstance(r, dict):
        raise ValueError("a draft is an object")
    s = lambda v, n: ("" if v is None else str(v))[:n]
    out = {"at": float(r.get("at") or time.time()), "brief": s(r.get("brief"), 20000), "task": s(r.get("task"), 40),
           "structure": s(r.get("structure"), 40), "model": s(r.get("model"), 200), "via": s(r.get("via"), 40),
           "seconds": float(r.get("seconds") or 0), "tokens_in": int(r.get("tokens_in") or 0), "tokens_out": int(r.get("tokens_out") or 0),
           "cut": bool(r.get("cut")), "blank": bool(r.get("blank")), "target": "doc" if r.get("target") == "doc" else "song",
           "song": s(r.get("song"), 200), "raw": s(r.get("raw"), 200000), "draft": None}
    d = r.get("draft")
    out["realm"] = "reader" if r.get("realm") == "reader" else "creator"   # HERESY 2486: whose world the answer was asked in
    if isinstance(d, dict):
        out["draft"] = {k: s(d.get(k), 60000) for k in ("title", "style", "style_tags", "lyrics", "notes")}
        if out["realm"] == "reader":                     # HERESY 2486: the Narrator world's draft: its text, voice and cast
            out["draft"].update(text=s(d.get("text"), 200000), voice=s(d.get("voice"), 2000),
                                cast=[{"name": s(c.get("name"), 80), "voice_hint": s(c.get("voice_hint"), 400)}
                                      for c in (d.get("cast") if isinstance(d.get("cast"), list) else [])[:40] if isinstance(c, dict)])
    return out


# HERESY 1168 (Viktor 07.10.2026: «В комнате Писателя добавить глобальный экспорт/импорт всех данных скопом для бекапа»):
# every document with its versions and the takes made from it, and the trash, in one JSON file; brought back, a document
# missing here comes in as it was (a trashed one into the trash), the same one is left alone, and one that differs from
# the document of its id here comes in beside it as a copy with a new id: nothing here is ever written over
BACKUP_KIND = "ruach-writer-backup"


def _versions():
    """HERESY 1522: creator_versions.py beside this file (the lab has it imported already; the stand-in server loads this file by its path)"""
    try:
        import creator_versions
        return creator_versions
    except ImportError:
        import importlib.util
        spec = importlib.util.spec_from_file_location("creator_versions", Path(__file__).with_name("creator_versions.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m


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
    if doc.get("realm") in REALMS:                        # HERESY 2480
        out["realm"] = doc["realm"]
    if isinstance(doc.get("from_reader"), dict):          # HERESY 2487
        out["from_reader"] = {k: float(v) for k, v in doc["from_reader"].items() if k in ("at", "back") and isinstance(v, (int, float))}
    return out


def _import(kit, wd, backup, scope=""):
    if not isinstance(backup, dict) or backup.get("kind") != BACKUP_KIND or not isinstance(backup.get("docs"), list):
        raise ValueError("not a Writer backup (a file this room exported)")
    told = {"added": 0, "same": 0, "copies": 0, "trashed": 0, "skipped": 0}
    trash = wd / ".trash"
    drafts = backup.get("drafts") if isinstance(backup.get("drafts"), dict) else {}   # HERESY 2481: a backup from before carries none

    def bring(old, new):                                  # the answers of a document of the backup, those missing here added (by their time)
        got = [r for r in drafts.get(old) or [] if isinstance(r, dict)]
        if not got:
            return
        p = _drafts_path(wd, new)
        kept = _drafts_read(p)
        seen = {(r.get("at"), r.get("model")) for r in kept}
        for r in got:
            try:
                r = _draft_clean(r)
            except ValueError:
                continue
            if (r["at"], r["model"]) not in seen:
                kept.append(r)
        kept.sort(key=lambda r: r.get("at") or 0)
        _drafts_write(p, kept[-DRAFTS_KEEP:])
    if drafts.get("song"):
        bring("song", "song")
    for doc, into in [(d, wd) for d in backup["docs"]] + [(d, trash) for d in backup.get("trash") or []]:
        if not isinstance(doc, dict) or not re.fullmatch(r"[0-9a-f]{12}", str(doc.get("id", ""))):
            told["skipped"] += 1
            continue
        doc = _clean(doc)
        old_id = doc["id"]
        here = next((d / f"{doc['id']}.json" for d in (wd, trash) if (d / f"{doc['id']}.json").is_file()), None)
        if here is not None:
            try:
                mine = json.load(open(here, encoding="utf-8"))
            except ValueError:
                mine = {}
            if all(mine.get(f) == doc[f] for f in FIELDS) and len(mine.get("versions") or []) >= len(doc["versions"]):
                told["same"] += 1
                bring(old_id, old_id)
                continue
            doc["id"] = uuid.uuid4().hex[:12]
            doc["title"] = (doc["title"] + " · from the backup")[:120]
            told["copies"] += 1
        else:
            told["trashed" if into is trash else "added"] += 1
        into.mkdir(exist_ok=True)
        tmp = into / f"{doc['id']}.json.part"
        with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
            json.dump(doc, fh, ensure_ascii=False, indent=1)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, into / f"{doc['id']}.json")
        bring(old_id, doc["id"])
    if isinstance(backup.get("souls"), dict):              # HERESY 2486: written where empty here, else kept as a version
        told["souls"] = worlds.souls_import(wd, backup["souls"])
    if isinstance(backup.get("creator_versions"), list):   # HERESY 1522: a backup from before carries none
        told["creator_versions"] = _versions().import_all(kit, backup["creator_versions"], scope)
    return dict(listing(kit, scope), imported=told)
