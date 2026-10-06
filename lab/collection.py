"""HERESY 1041: the Collection, the lab's side. Imported by lab.py.

catalog()            every take with what is made from it (stems, remaster, upscale, debuzz), its
                     kind (generated, imported, trimmed, regenerated, replayed) and the collection's
                     own marks: hidden, workspaces
collection_post()    hide / show, workspaces (create, rename, delete, add, remove), the trash policy
trash_*()            to the trash (trash/DATE/TAKE, never deleted here), list, restore, empty (the
                     page asks first), and an automatic empty after N days (0 = never, the default)
export_*()           a ZIP of chosen takes (FLAC or WAV, with or without what is made from them),
                     built as a job into tmp/exports and fetched as a file
The marks live in the studio's user/ folder (user/collection.json), as the settings do.
"""
import json, os, re, shutil, subprocess, threading, time, uuid, zipfile
from pathlib import Path

LOCK = threading.Lock()


def _store(config_dir):
    return config_dir / "collection.json"


def load(config_dir):
    p = _store(config_dir)
    d = json.load(open(p, encoding="utf-8")) if p.is_file() else {}
    d.setdefault("hidden", [])
    d.setdefault("workspaces", {})
    d.setdefault("trash_days", 0)
    d.setdefault("ratings", {})
    d.setdefault("notes", {})
    d.setdefault("locks", {})                    # HERESY 1070: {workspace: {"workspace": True, "tracks": True}}
    d.setdefault("pins", {})                     # HERESY 1103: {place: [take, …]}, four at most; "" = All Workspaces
    d.setdefault("frozen", [])                   # HERESY 1166: the workspaces frozen (their sections with them)
    # HERESY 1162 (Viktor: «карточку помечать лёгкой пунктирной обводкой и снимать её при первом же проигрывании трека. То же
    # самое и на новые треки. Так визуально видно, что свежий»): a take made after fresh_since and never played is fresh;
    # regen_of: {new take: the take it was made again from}
    d.setdefault("played", [])
    d.setdefault("regen_of", {})
    if "fresh_since" not in d:                   # from the day this came: the takes before it are not all fresh at once
        d["fresh_since"] = int(time.time())
        save(config_dir, d)
    return d


PINS_MAX = 4                                     # HERESY 1103: Viktor's number
# HERESY 1161 (Viktor 03.10.2026: «В воркспейсы можно один уровень подразделов? Максимум два. Так сортировка по отборам в
# воркспейсе будет доступна и не нужно будет плодить их каждый раз»): a sub-section is a workspace named by its path,
# "Parent / Section", two levels below a workspace at most; a parent shows its sections' takes too (the page)
SEP = " / "
DEPTH = 3
# HERESY 1167 (Viktor: «В именах воркспейсов перепроверь - не более 80 знаков. Всему должен быть лимит разумный, даже ереси,
# чтобы не распухла от гордости»): a workspace's whole name, its sections' path with it
# 06.10.2026: «Укорачиваю до… 32 символа макс. Исправь лимиты везде»: each level of the path 32 characters at most; a name
# already there is taken as it is (refused only when made or renamed), said aloud, never trimmed silently
PART_MAX = 32


def ws_name(raw):
    """A workspace's name, its path's parts trimmed of spaces, at most DEPTH deep; "" when there is none."""
    parts = [p.strip() for p in str(raw or "").split(SEP)]
    if not any(parts):
        return ""
    if not all(parts):
        raise ValueError("a section needs a name on each level")
    if len(parts) > DEPTH:
        raise ValueError(f"two levels of sections at most: “{parts[0]}” › section › section")
    return SEP.join(parts)


def fresh_parts(d, ws):
    """HERESY 1167: the levels of a name being made or given are PART_MAX characters at most (the ones already there pass)."""
    parts = ws.split(SEP)
    for i, p in enumerate(parts):
        if SEP.join(parts[:i + 1]) not in d["workspaces"] and len(p) > PART_MAX:
            raise ValueError(f"a workspace's name is {PART_MAX} characters at most on each level (“{p}” has {len(p)})")


def keep_sourced(config_dir, ws, names):
    """HERESY 1167 (Viktor, 06.10.2026: «Для `Sourced for Regeneration` делай по умолчанию `Freeze`, но внутри движка
    разрешай реждену бросать туда файлы/карточки»): the lab's regeneration files a replaced take into its «Sourced for
    Regeneration» section past the freeze, and the section is frozen (when made, and again if it was thawed)."""
    ws = ws_name(ws)
    if not ws or not names:
        return
    with LOCK:
        d = load(config_dir)
        parts = ws.split(SEP)
        for i in range(1, len(parts) + 1):
            d["workspaces"].setdefault(SEP.join(parts[:i]), [])
        d["workspaces"][ws] = sorted(set(d["workspaces"][ws]) | set(names))
        d["frozen"] = sorted(set(d["frozen"]) | {ws})
        save(config_dir, d)


def family(d, ws):
    """The workspace and every section below it."""
    return [w for w in d["workspaces"] if w == ws or w.startswith(ws + SEP)]


def prune_pins(d):
    """HERESY 1166 (Viktor: «Unpin исчез… И в меню нет Unpin»; «Анпинить можно только в воркспейсе, где прикреплено»): a
    workspace's pins hold only its own takes (its sections' too, as the page shows them), so a take moved out, taken out
    or merged away leaves no pin behind where nothing can unpin it; the pins of a workspace that is gone go with it. The
    places that are not workspaces ("" All Workspaces, __fav, __none…) keep theirs."""
    for place in list(d["pins"]):
        if place == "" or place.startswith("__"):
            continue
        if place not in d["workspaces"]:
            d["pins"].pop(place, None)
            continue
        have = set()
        for w in family(d, place):
            have.update(d["workspaces"].get(w, []))
        keep = [n for n in d["pins"][place] if n in have]
        if keep:
            d["pins"][place] = keep
        else:
            d["pins"].pop(place, None)


def locked(d, ws, what):
    return bool((d.get("locks") or {}).get(ws, {}).get(what))


def locked_takes(d):
    """The takes no deletion may reach: those in a workspace whose tracks are locked."""
    out = set()
    for ws, names in d["workspaces"].items():
        if locked(d, ws, "tracks"):
            out |= set(names)
    return out


# HERESY 1166 (Viktor 04.10.2026: «Деактивация воркспейса. Замораживаются все треки в этом представлении, никаких действий
# по ним, в `All Workspaces` и в поиске не отображаются. Сам деактивированный воркспейс немного засЕривается как
# неактивный»): a frozen workspace (its sections with it) keeps its takes and its membership as they are: they are heard
# and read, never changed, moved, pinned or thrown away, and the workspace is not renamed, merged or deleted while frozen.
# A take also in a workspace that is not frozen lives on there.
def frozen_ws(d, ws):
    return any(ws == f or ws.startswith(f + SEP) for f in d.get("frozen", []))


def frozen_takes(d):
    places = {}
    for ws, names in d["workspaces"].items():
        for n in names:
            places.setdefault(n, []).append(ws)
    return {n for n, wss in places.items() if all(frozen_ws(d, w) for w in wss)}


def _frozen_guard(d, op, ws, names, data):
    ice = frozen_takes(d)
    if op in ("hide", "show", "rate", "note", "pin", "ws-add", "ws-move", "ws-remove"):
        n = sum(1 for x in names if x in ice)
        if n:
            raise ValueError(f"{n} take{'s' if n > 1 else ''} frozen with {'their' if n > 1 else 'its'} workspace: unfreeze it first")
    places = []
    if op in ("ws-add", "ws-remove", "ws-move", "ws-create"):
        places.append(ws)
    if op in ("ws-rename", "ws-delete", "ws-merge") and ws in d["workspaces"]:
        places += family(d, ws)
    if op == "ws-merge" and data.get("to"):
        places.append(ws_name(data.get("to")))
    if op == "ws-move" and data.get("from"):
        places.append(ws_name(data.get("from")))
    if op == "pin":
        places.append(str(data.get("place") or ""))
    for w in places:
        if w and frozen_ws(d, w):
            f = next(f for f in d["frozen"] if w == f or w.startswith(f + SEP))
            raise ValueError(f"\u201c{f}\u201d is frozen: unfreeze it first (\u22ef beside its name)")


def save(config_dir, d):
    config_dir.mkdir(parents=True, exist_ok=True)
    p = _store(config_dir)
    tmp = Path(str(p) + ".part")
    json.dump(d, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def take_kind(name, meta, req):
    """generated · imported · regenerated (kept up to a moment, written anew after) · rerendered (the
    sound made again from a take's own codes: a new sound seed, another decoder, a trim)"""
    if "-import-" in name:
        return "imported"
    if req.get("semantic_keep"):
        return "regenerated"
    if req.get("parent") and req.get("semantic_tokens"):
        return "rerendered"
    return "generated"


def catalog(outputs, config_dir):
    marks = load(config_dir)
    prune_pins(marks)                            # HERESY 1166: shown as they stand (the file heals on the next change)
    hidden = set(marks["hidden"])
    ws_of = {}
    for ws, names in marks["workspaces"].items():
        for n in names:
            ws_of.setdefault(n, []).append(ws)
    rows, played, since = [], set(marks["played"]), marks.get("fresh_since") or 0
    ice = frozen_takes(marks)                    # HERESY 1166
    for d in sorted(outputs.iterdir()) if outputs.is_dir() else []:
        mp = d / "meta.json"
        if not mp.is_file():
            continue
        try:
            meta = json.load(open(mp, encoding="utf-8"))
        except ValueError:
            continue
        req = {}
        rp = d / "request.json"
        if rp.is_file():
            try:
                r = json.load(open(rp, encoding="utf-8"))
                req = {k: r.get(k) for k in ("cot", "parent", "plan_only") if k in r}
                req["semantic_keep"] = bool(r.get("semantic_keep"))
                req["semantic_tokens"] = bool(r.get("semantic_tokens"))
                req["lyrics_len"] = len(r.get("lyrics") or "")
                # HERESY 1156 (Viktor: «В шпаргалке указываем seed на каждый A/B»): the music and sound seeds, as text:
                # 64-bit seeds are past what a page's numbers hold exact (2^53), and a seed rounded is another seed
                if r.get("lm_seed") is not None or r.get("seed") is not None:
                    req["seeds"] = [str(r.get("lm_seed", "")), str(r.get("seed", ""))]
            except ValueError:
                pass
        kinds = set()
        der = d / "derived"
        if der.is_dir():
            for m in der.glob("*/manifest.json"):
                try:
                    kinds.add(json.load(open(m, encoding="utf-8")).get("kind"))
                except ValueError:
                    pass
        rows.append({"name": d.name, "title": meta.get("title") or d.name, "created": meta.get("created"),
                     "seconds": meta.get("seconds"), "favorite": bool(meta.get("favorite")),
                     "kind": take_kind(d.name, meta, req), "cot": req.get("cot"), "derived": sorted(k for k in kinds if k),
                     "hidden": d.name in hidden, "workspaces": sorted(ws_of.get(d.name, [])),
                     "rating": marks["ratings"].get(d.name, 0), "note": marks["notes"].get(d.name, ""), "seeds": req.get("seeds"),
                     "fresh": (meta.get("created") or 0) >= since and d.name not in played,     # HERESY 1162
                     "regen_of": marks["regen_of"].get(d.name, ""), "frozen": d.name in ice})
    return {"takes": rows, "workspaces": sorted(marks["workspaces"]), "trash_days": marks["trash_days"], "locks": marks["locks"],
            "pins": marks["pins"], "frozen": marks["frozen"]}


def collection_post(config_dir, outputs, data):
    op = data.get("op")
    names = [n for n in (data.get("names") or []) if isinstance(n, str) and "/" not in n and not n.startswith(".")]
    ws = ws_name(data.get("workspace"))
    with LOCK:
        d = load(config_dir)
        _frozen_guard(d, op, ws, names, data)      # HERESY 1166: nothing reaches a frozen workspace but its thaw
        if op == "freeze":                         # HERESY 1166: on = true | false; thawing a workspace thaws its sections
            if ws not in d["workspaces"]:
                raise ValueError("freeze an existing workspace")
            fz = set(d["frozen"])
            if data.get("on"):
                fz.add(ws)
            else:
                fz -= {f for f in fz if f == ws or f.startswith(ws + SEP)}
            d["frozen"] = sorted(fz)
        elif op == "hide":
            d["hidden"] = sorted(set(d["hidden"]) | set(names))
        elif op == "show":
            d["hidden"] = sorted(set(d["hidden"]) - set(names))
        elif op == "ws-create":
            if not ws:
                raise ValueError("a workspace needs a name")
            fresh_parts(d, ws)                         # HERESY 1167: 32 characters a level, for what is new
            parts = ws.split(SEP)
            for i in range(1, len(parts) + 1):         # a section's parents come with it
                d["workspaces"].setdefault(SEP.join(parts[:i]), [])
        elif op == "ws-rename":
            new = ws_name(data.get("to"))
            if not ws or not new or ws not in d["workspaces"] or new in d["workspaces"]:
                raise ValueError("rename from an existing workspace to a new name")
            fresh_parts(d, new)                        # HERESY 1167: the new name, 32 characters a level
            moves = [(w, new + w[len(ws):]) for w in family(d, ws)]          # its sections go with it (1161)
            for old, to in moves:
                if len(to.split(SEP)) > DEPTH:
                    raise ValueError(f"“{to}” would be more than two levels of sections deep")
                if old != ws and to in d["workspaces"]:
                    raise ValueError(f"“{to}” is there already")
            for old, to in moves:
                d["workspaces"][to] = d["workspaces"].pop(old)
                if old in d["locks"]:              # the locks go with the name
                    d["locks"][to] = d["locks"].pop(old)
                if old in d["pins"]:               # and the pins
                    d["pins"][to] = d["pins"].pop(old)
        elif op == "pin":                          # HERESY 1103: place = a workspace, "" (All), __fav, __none; on = true | false
            place = str(data.get("place") or "")[:200]
            have = [n for n in d["pins"].get(place, []) if n not in names]
            if data.get("on"):
                have = have + names
                if len(have) > PINS_MAX:
                    raise ValueError(f"{PINS_MAX} pins at most in one place: unpin one first")
            if have:
                d["pins"][place] = have
            else:
                d["pins"].pop(place, None)
        elif op == "lock":                         # HERESY 1070: what = workspace | tracks, on = true | false
            what = str(data.get("what") or "")
            if what not in ("workspace", "tracks") or ws not in d["workspaces"]:
                raise ValueError("lock an existing workspace: what is workspace or tracks")
            lk = d["locks"].setdefault(ws, {})
            if data.get("on"):
                lk[what] = True
            else:
                lk.pop(what, None)
            if not lk:
                d["locks"].pop(ws, None)
        elif op in ("ws-delete", "ws-merge") and any(locked(d, w, "workspace") for w in family(d, ws)):
            w = next(w for w in family(d, ws) if locked(d, w, "workspace"))
            raise ValueError(f"\u201c{w}\u201d is locked against deletion: unlock it first (right-click on its name)")
        elif op == "ws-merge" and len(family(d, ws)) > 1:
            raise ValueError(f"\u201c{ws}\u201d has sections: merge or delete them first")
        elif op == "ws-delete":            # the workspace goes, its sections with it (1161); its takes stay where they are
            for w in family(d, ws):
                d["workspaces"].pop(w, None)
                d["pins"].pop(w, None)
        elif op == "ws-add":
            if not ws:
                raise ValueError("which workspace?")
            d["workspaces"][ws] = sorted(set(d["workspaces"].get(ws, [])) | set(names))
        elif op == "ws-move":                      # HERESY 1050: into one workspace, out of the one it came from
            if not ws:
                raise ValueError("which workspace?")
            src = ws_name(data.get("from")) if data.get("from") else ""
            for w in ([src] if src else list(d["workspaces"])):   # from nowhere named: out of every other
                if w != ws and w in d["workspaces"] and not frozen_ws(d, w):     # a frozen one keeps its takes (1166)
                    d["workspaces"][w] = sorted(set(d["workspaces"][w]) - set(names))
            d["workspaces"][ws] = sorted(set(d["workspaces"].get(ws, [])) | set(names))
        elif op == "ws-merge":                     # HERESY 1050: a workspace's takes into another, then it goes
            to = ws_name(data.get("to"))
            if not ws or ws not in d["workspaces"] or not to or to == ws:
                raise ValueError("merge an existing workspace into another")
            d["workspaces"][to] = sorted(set(d["workspaces"].get(to, [])) | set(d["workspaces"].pop(ws)))
        elif op == "ws-remove":
            if ws in d["workspaces"]:
                d["workspaces"][ws] = sorted(set(d["workspaces"][ws]) - set(names))
        elif op == "rate":                         # HERESY 1042: like (1), dislike (-1), none (0), as SUNO has
            v = int(data.get("value") or 0)
            if v not in (-1, 0, 1):
                raise ValueError("value is 1, -1 or 0")
            for n in names:
                if v:
                    d["ratings"][n] = v
                else:
                    d["ratings"].pop(n, None)
        elif op == "note":                         # HERESY 1044: a note on a take, Viktor's own words
            text = str(data.get("text") or "").strip()[:4000]
            for n in names:
                if text:
                    d["notes"][n] = text
                else:
                    d["notes"].pop(n, None)
        elif op == "played":                       # HERESY 1162: a take heard once is fresh no more
            d["played"] = sorted(set(d["played"]) | set(names))
        elif op == "regen-of":                     # HERESY 1162: the lab records what a take was made again from
            src = str(data.get("from") or "")
            for n in names:
                d["regen_of"][n] = src
        elif op == "trash-days":
            days = int(data.get("days") or 0)
            if days not in (0, 7, 14, 28):
                raise ValueError("0 (never), 7, 14 or 28 days")
            d["trash_days"] = days
        else:
            raise ValueError("unknown op")
        prune_pins(d)                              # HERESY 1166: no pin left where its take is not
        save(config_dir, d)
    return catalog(outputs, config_dir)


# ---- trash: KIT/trash/DATE/TAKE; the date folder is when it went there
def trash_dir(kit):
    return kit / "trash"


def trash_list(kit):
    out = []
    base = trash_dir(kit)
    for day in sorted(base.iterdir()) if base.is_dir() else []:
        if not day.is_dir():
            continue
        for d in sorted(day.iterdir()):
            mp = d / "meta.json"
            if not mp.is_file():
                continue
            try:
                meta = json.load(open(mp, encoding="utf-8"))
            except ValueError:
                meta = {}
            size = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
            out.append({"name": d.name, "day": day.name, "title": meta.get("title") or d.name, "seconds": meta.get("seconds"),
                        "trashed": d.stat().st_mtime, "bytes": size})
    return {"items": out}


def trash_move(kit, outputs, names, config_dir=None):
    """Takes to the trash; a take in a workspace whose tracks are locked stays, and is said (HERESY 1070)."""
    day = trash_dir(kit) / time.strftime("%Y-%m-%d")
    day.mkdir(parents=True, exist_ok=True)
    moved, kept = [], []
    marks = load(config_dir) if config_dir else None
    guard = (locked_takes(marks) | frozen_takes(marks)) if marks else set()     # HERESY 1166: a frozen take stays too
    for n in names:
        if n in guard:
            kept.append(n)
            continue
        src = outputs / n
        if "/" in n or n.startswith(".") or not (src / "meta.json").is_file():
            continue
        dst = day / n
        if dst.exists():
            continue
        shutil.move(str(src), str(dst))
        os.utime(dst, None)                       # the time it went to the trash
        moved.append(n)
    return {"moved": moved, "locked": kept}


def trash_restore(kit, outputs, items):
    back = []
    for it in items:
        day, n = str(it.get("day", "")), str(it.get("name", ""))
        if "/" in day or "/" in n or day.startswith(".") or n.startswith("."):
            continue
        src = trash_dir(kit) / day / n
        if src.is_dir() and not (outputs / n).exists():
            shutil.move(str(src), str(outputs / n))
            back.append(n)
    return {"restored": back}


def trash_empty(kit, items=None, older_than_days=None):
    """Delete from the trash: the given items, or all, or those older than N days."""
    gone, now = [], time.time()
    for it in trash_list(kit)["items"]:
        if items is not None and not any(i.get("day") == it["day"] and i.get("name") == it["name"] for i in items):
            continue
        if older_than_days is not None and now - it["trashed"] < older_than_days * 86400:
            continue
        shutil.rmtree(trash_dir(kit) / it["day"] / it["name"], ignore_errors=True)
        gone.append(it["name"])
    for day in trash_dir(kit).iterdir() if trash_dir(kit).is_dir() else []:
        if day.is_dir() and not any(day.iterdir()):
            day.rmdir()
    return {"emptied": gone}


# ---- export: a ZIP built as a job, then fetched as a file
EXPORTS = {}


def _fname(title, used, ext):
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", title).strip()[:80] or "take"
    name, i = f"{base}{ext}", 2
    while name in used:
        name, i = f"{base} ({i}){ext}", i + 1
    used.add(name)
    return name


def export_start(kit, outputs, names, fmt, derived):
    if fmt not in ("flac", "wav"):
        raise ValueError("flac or wav")
    xid = uuid.uuid4().hex[:12]
    out_dir = kit / "tmp" / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    job = {"status": "running", "started": time.time(), "done": 0, "total": len(names), "file": None}
    EXPORTS[xid] = job

    def work():
        try:
            path = out_dir / f"yue2-os-{time.strftime('%Y%m%d-%H%M')}-{xid}.zip"
            used = set()
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as z:
                for n in names:
                    d = outputs / n
                    if "/" in n or not (d / "meta.json").is_file():
                        continue
                    meta = json.load(open(d / "meta.json", encoding="utf-8"))
                    title = meta.get("title") or n
                    src = d / "audio.wav"
                    if src.is_file():
                        if fmt == "wav":
                            z.write(src, _fname(title, used, ".wav"))
                        else:
                            tmp = out_dir / f"{xid}.flac"
                            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "flac", "-metadata", f"title={title}", str(tmp)], check=True)
                            z.write(tmp, _fname(title, used, ".flac"))
                            tmp.unlink()
                    if derived and (d / "derived").is_dir():
                        for m in sorted((d / "derived").glob("*/manifest.json")):
                            man = json.load(open(m, encoding="utf-8"))
                            for f in man.get("files", []):
                                fp = d / f.get("path", "")
                                if fp.is_file():
                                    z.write(fp, _fname(f"{title} - {f.get('name') or fp.stem}", used, fp.suffix))
                    job["done"] += 1
            job.update(status="done", file=path.name, bytes=path.stat().st_size)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, id=xid)


def export_status(xid):
    job = EXPORTS.get(xid)
    if not job:
        raise FileNotFoundError("no such export")
    return dict(job, id=xid)


def export_path(kit, xid):
    job = EXPORTS.get(xid)
    if not job or job.get("status") != "done":
        raise FileNotFoundError("the export is not ready")
    return kit / "tmp" / "exports" / job["file"]


def prune_exports(kit, hours=24):
    d = kit / "tmp" / "exports"
    for f in d.glob("*.zip") if d.is_dir() else []:
        if time.time() - f.stat().st_mtime > hours * 3600:
            f.unlink()
