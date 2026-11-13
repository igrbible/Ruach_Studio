"""HERESY 1041: the Collection, the lab's side. Imported by lab.py.

catalog()            every take with what is made from it (stems, remaster, upscale, debuzz), its
                     kind (generated, imported, trimmed, regenerated, replayed) and the collection's
                     own marks: hidden, workspaces
collection_post()    hide / show, workspaces (create, rename, delete, add, remove), the trash policy, protect (1368)
trash_*()            to the trash (trash/DATE/TAKE, never deleted here), list, restore, empty (the
                     page asks first), and an automatic empty after N days (0 = never, the default)
export_*()           a ZIP of chosen takes (FLAC or WAV, with or without what is made from them),
                     built as a job into tmp/exports and fetched as a file
The marks live in the Studio's user/ folder (user/collection.json), as the settings do.
"""
import json, os, random, re, shutil, subprocess, threading, time, uuid, zipfile
from pathlib import Path

import name_rule                                    # HERESY 2462: one rule for every name

LOCK = threading.Lock()


def _store(config_dir):
    return config_dir / "collection.json"


PL_WS = "@ws:"   # HERESY 2042: a whole workspace in the playlist, one entry


def pl_ws(n):
    return n[len(PL_WS):] if isinstance(n, str) and n.startswith(PL_WS) else None


def load(config_dir):
    p = _store(config_dir)
    try:
        d = json.load(open(p, encoding="utf-8")) if p.is_file() else {}
    except ValueError:                           # HERESY 2083: truly broken (read again first): put back from the newest snapshot that reads whole
        import backups                           # the lab's own (lab/backups.py)
        if not backups.recover(p, "the Librarian's read"):
            raise
        d = json.load(open(p, encoding="utf-8"))
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
    # HERESY 1368 (Viktor 11.10.2026: «И на аудио треки в студии тоже защиту добавь в опцию и в фильтр в Библиотеке не забудь эту
    # опцию»): the takes protected: never to the trash, never deleted for good (the page's direct deletion asks the same of it)
    d.setdefault("protected", [])
    # HERESY 1730: the playlist, one ordered list of takes apart from the workspaces (never renamed, deleted or frozen), and its crossfade (0–4 s)
    d.setdefault("playlist", [])
    # HERESY 1802 (Viktor 27.10.2026: «прикрутим к картам треков 🔥 и 💎»; «в воркспейсы и их подкатегории прикрутим Notes… к LoRA адаптерам заметки
    # пользовательские… ограничить длину заметок разумными 500-600 знаков»): two marks of a take's own, a note on a workspace, a note on an adapter
    d.setdefault("fire", [])
    d.setdefault("gems", [])
    d.setdefault("reacts", {})
    d.setdefault("blind", [])                  # HERESY 1874: the workspaces for blind listening (their sections with them)                 # HERESY 1873: a take's reaction, {name: key}
    d.setdefault("archived", [])               # HERESY 2049: the workspaces archived (their sections with them)
    d.setdefault("albums", [])                 # HERESY 2050: the playlist's albums, [{name, items}] in their order
    d.setdefault("ws_notes", {})
    d.setdefault("lora_notes", {})
    d.setdefault("ws_realm", {})               # HERESY 2294: {top workspace: "reader"}; a workspace not named here is the Creator's
    with_parents(d)                              # HERESY 1935: an orphan section of before gets its parents back
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
PART_MAX = 56                                       # 09.11.2026, Viktor: «Увеличь лимит имён пространств до 56 знаков»


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
    """HERESY 1167: the levels of a name being made or given are PART_MAX characters at most (the ones already there pass).
    HERESY 2462 (Viktor 12.11.2026: «сторожа, чтобы не пропускал спец символы в названия пространств»): and each new level keeps the names' rule
    (name_rule: no / \\ * ~ ? : " < > |, no control character, no dot first), so no level holds a / of its own. « / » between levels stays the
    Library's section mark, its parents made with it (1161, 1935): a script's «… Drama 3 / Higgs» meant as one name is a section by that contract
    (2437); the page never lets a typed name hold a /."""
    parts = ws.split(SEP)
    for i, p in enumerate(parts):
        if SEP.join(parts[:i + 1]) in d["workspaces"]:
            continue
        if len(p) > PART_MAX:
            raise ValueError(f"a workspace's name is {PART_MAX} characters at most on each level (“{p}” has {len(p)})")
        why = name_rule.refusal(p, 0)
        if why:
            raise ValueError(why)


def with_parents(d):
    """HERESY 1935: every section's parents, as ws-create makes them: a key «A / B» alone (put there by ws-add, ws-move or by hand)
    showed on the page under whatever workspace sorted before it (nine ambient sections under another workspace, 30.10.2026)."""
    for w in list(d["workspaces"]):
        parts = w.split(SEP)
        for i in range(1, len(parts)):
            d["workspaces"].setdefault(SEP.join(parts[:i]), [])
    return d


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


SOURCED = "Sourced for Regeneration"


def view_tree(d, ws):
    """HERESY 2168 (Viktor 06.11.2026: «Абсолютно все мелочи закрываем»; library-NOTES review): the workspace and the sections its view shows, as the
    page's inTree has it: a «Sourced for Regeneration» section below it is not shown in its parent (1162), so a Move or a Take out from the parent's view
    leaves that section's takes where they are, frozen or thawed; from the section's own view (ws is it) it is the place itself."""
    return [w for w in family(d, ws) if w == ws or w.split(SEP)[-1] != SOURCED]


def forget_ws(d, gone, to=""):
    """HERESY 2129 (the audit of 06.11.2026: «Удалённое пространство оставляет метки, и новое под тем же именем их наследует»): workspaces gone
    (deleted, poured or merged away) take their marks with them, so one made or renamed into such a name later is born clean: not archived,
    not blind, not frozen, not locked, no pins, no note. Their whole entries in the playlist and the albums go too; with `to` (their takes went
    there) each becomes that workspace's entry, once."""
    gone = {w for w in gone if w}
    if not gone:
        return
    for key in ("archived", "blind", "frozen"):
        d[key] = [w for w in d.get(key, []) if w not in gone]
    for key in ("locks", "pins", "ws_notes", "ws_realm"):   # HERESY 2294: and a top's realm
        for w in gone:
            d.get(key, {}).pop(w, None)

    def remap(items):
        out, seen = [], set()
        for n in items:
            w = pl_ws(n)
            if w is not None and w in gone:
                if not to:
                    continue
                n = PL_WS + to
            if pl_ws(n) is not None:                   # a whole workspace once in a list
                if n in seen:
                    continue
                seen.add(n)
            out.append(n)
        return out
    d["playlist"] = remap(d.get("playlist", []))
    for al in d.get("albums", []):
        al["items"] = remap(al["items"])


def born(d, ws):
    """HERESY 2129: a workspace about to be made (and its parents not there yet) inherits nothing a workspace of that name left behind."""
    parts = ws.split(SEP) if ws else []
    forget_ws(d, [SEP.join(parts[:i]) for i in range(1, len(parts) + 1) if SEP.join(parts[:i]) not in d["workspaces"]])


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


def ws_locked(d, ws):
    """HERESY 1473: a workspace under a lock of either kind, its own or that of the workspace it is a section of."""
    parts = ws.split(SEP)
    return any(locked(d, SEP.join(parts[:i]), what) for i in range(1, len(parts) + 1) for what in ("workspace", "tracks"))


def locks_on(d, ws):
    """The locks that reach a workspace, as ws_locked reads them (its own and its parents'), each (workspace, kind)."""
    parts = ws.split(SEP)
    return {(SEP.join(parts[:i]), what) for i in range(1, len(parts) + 1) for what in ("workspace", "tracks") if locked(d, SEP.join(parts[:i]), what)}


def locked_takes(d):
    """The takes no deletion may reach: those in a workspace under a lock (HERESY 1473: of either kind, a parent's too; until
    15.10.2026 only a lock on the tracks, and the 💎 sets, locked as workspaces, lost 600 takes to one trash from All Workspaces)."""
    out = set()
    for ws, names in d["workspaces"].items():
        if ws_locked(d, ws):
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


# HERESY 1873 (Viktor 29.10.2026: «Отсортируй их правильно по эмоциональным зонам»): a take's reactions, by their zones: love, a hit, laughter, wonder,
# tears, thought, awkward, refusal (the page holds their faces and words)
# one a take, Facebook's way («выбранной реакцией заменяй кнопку плюса»)
REACTIONS = ("love", "adore", "hundred", "party", "hot", "lol", "mindblown", "wow", "boom", "tears", "think", "look", "nerd", "peek", "melt", "poop")   # 2027: 🔥 hot, 💥 boom


def album_name(v):
    """HERESY 2050: an album's name as typed, 60 characters at most, no control characters."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(v or "")).strip()[:60]


def archived_ws(d, ws):
    """HERESY 2049: a workspace archived, or a section of one."""
    return any(ws == a or ws.startswith(a + SEP) for a in d.get("archived", []))


def archived_takes(d):
    """HERESY 2049: the takes whose every workspace is archived (one also in a workspace not archived lives on there)."""
    places = {}
    for ws, names in d["workspaces"].items():
        for n in names:
            places.setdefault(n, []).append(ws)
    return {n for n, wss in places.items() if all(archived_ws(d, w) for w in wss)}


def blind_takes(d):
    """HERESY 1874: the takes in a workspace for blind listening, or in one of its sections."""
    bl = [b for b in d.get("blind", []) if b in d["workspaces"]]
    return {n for w, names in d["workspaces"].items() if any(w == b or w.startswith(b + SEP) for b in bl) for n in names}


def _frozen_guard(d, op, ws, names, data):
    ice = frozen_takes(d)
    if op in ("hide", "show", "rate", "note", "pin", "ws-add", "ws-move", "ws-remove", "protect", "mark", "react"):
        n = sum(1 for x in names if x in ice)
        if n:
            raise ValueError(f"{n} take{'s' if n > 1 else ''} frozen with {'their' if n > 1 else 'its'} workspace: unfreeze it first")
    places = []
    if op in ("ws-add", "ws-remove", "ws-move", "ws-create"):
        places.append(ws)
    if op in ("ws-rename", "ws-delete", "ws-merge", "ws-pour") and ws in d["workspaces"]:
        places += family(d, ws)
    if op == "ws-rename" and data.get("to"):           # HERESY 1808: nor under a frozen one
        places.append(SEP.join(ws_name(data.get("to")).split(SEP)[:-1]))
    if op in ("ws-merge", "ws-pour") and data.get("to"):
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
    if isinstance(d.get("workspaces"), dict):
        with_parents(d)                          # HERESY 1935: none written without its parents
    with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
        json.dump(d, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


REALMS = ("creator", "reader")


def realm_ws(d, ws):
    """HERESY 2294 (Viktor 09.11.2026: «для Чтеца будет та же Библиотека, но со своими пространствами, древами»): the realm a workspace lives in,
    its top's: the Reader's when marked so at its making, else the Creator's."""
    return "reader" if (d.get("ws_realm") or {}).get(str(ws or "").split(SEP)[0]) == "reader" else "creator"


def own_realm(meta, req):
    """HERESY 2294: a take's own realm, by what made it: the Reader's speech (its request's reader block, its model, or the Reader's never-for-training
    provenance on an import of its takes), else the Creator's."""
    prov = meta.get("provenance") if isinstance(meta.get("provenance"), dict) else {}
    if meta.get("realm") in REALMS:
        return meta["realm"]
    return "reader" if req.get("reader") or meta.get("model") == "reader" or str(prov.get("by") or "").startswith("the Reader") else "creator"


def root_realms(rows):
    """HERESY 2294 («Каждый трек принадлежит своему оригиналу Творца или Чтеца, не перемещается из рэлма… Огранщик также привязывается к оригинальному
    корню»): each take's realm is its root's: the parent chain walked up to the first take with no parent here; a cycle stops where it closes."""
    by = {r["name"]: r for r in rows}
    out = {}
    for r in rows:
        seen, x = set(), r
        # HERESY 2298: a realm written on a take (an imported TTS root, a derivative frozen when it was made) anchors its line: the walk stops there
        while not x.get("fixed_realm") and x.get("parent") and x["parent"] in by and x["name"] not in seen:
            seen.add(x["name"])
            x = by[x["parent"]]
        out[r["name"]] = x.get("own_realm", "creator")
    return out


def take_realms(outputs, names):
    """HERESY 2294: the realm of these takes for a move's check: each read from its folder, the parent chain walked as root_realms does."""
    out = {}
    for n in names:
        seen, cur, realm = set(), n, "creator"
        while cur and cur not in seen and len(seen) < 64:
            seen.add(cur)
            try:
                meta = json.load(open(outputs / cur / "meta.json", encoding="utf-8"))
            except (OSError, ValueError):
                break
            try:
                req = json.load(open(outputs / cur / "request.json", encoding="utf-8"))
            except (OSError, ValueError):
                req = {}
            realm = own_realm(meta, req if isinstance(req, dict) else {})
            if meta.get("realm") in REALMS:            # HERESY 2298: written on the take, it anchors its line
                break
            cur = (req.get("parent") if isinstance(req, dict) else "") or ""
            if "/" in cur or cur.startswith("."):
                break
        out[n] = realm
    return out


def mixed_realm(outputs, host, inputs=()):
    """HERESY 2298 (Viktor 09.11.2026: «Огранщик и Видеограф, соответственно, должны иметь доступ к обоим мирам. Если только музыка обрабатывается,
    все деривативы в мире Творца, а вот если Чтец, но даже с музыкой, оригинально деривативы у Чтеца, а музыка, если линкуем в нодах и DAW
    саунд-треки, она остаётся у себя в Творце, но также линкуется в Чтеца»): the realm of what is made on `host` from it and the other takes it
    takes in (a node's sound input, a DAW track): the Reader's when any of them is the Reader's, else the Creator's. Worked out once, when it is made,
    and written on it (a manifest's or a take's «realm»), never worked out again.
    → {"realm", "home": the take it belongs with (the host when the host is of that realm, else the first take of it), "inputs": [{"take", "realm"}]}"""
    names = [host] + [n for n in dict.fromkeys(inputs or ()) if isinstance(n, str) and n and n != host]
    rl = take_realms(outputs, names)
    realm = "reader" if "reader" in rl.values() else "creator"
    home = host if rl.get(host) == realm else next(n for n in names if rl[n] == realm)
    return {"realm": realm, "home": home, "inputs": [{"take": n, "realm": rl[n]} for n in names]}


def link_sources(config_dir, outputs, mixed):
    """HERESY 2298: a Reader derivative's Creator sources stay in the Creator's realm and are linked (Add to workspace, never moved) into the Reader's
    workspaces where it lands, those its home take stands in. → the workspaces they were linked into; [] when it is the Creator's, when none of its
    sources is the Creator's, or when its home stands in no Reader workspace (said by the caller, not taken for a link made)."""
    if mixed.get("realm") != "reader":
        return []
    creators = [i["take"] for i in mixed.get("inputs") or [] if i.get("realm") == "creator"]
    if not creators:
        return []
    with LOCK:
        d = load(config_dir)
        homes = sorted(w for w, ns in d["workspaces"].items() if mixed["home"] in ns and realm_ws(d, w) == "reader" and not frozen_ws(d, w))
    for w in homes:
        collection_post(config_dir, outputs, {"op": "ws-add", "workspace": w, "names": creators})
    return homes


def take_kind(name, meta, req):
    """generated · imported · regenerated (kept up to a moment, written anew after) · rerendered (the
    sound made again from a take's own codes: a new sound seed, another decoder, a trim)"""
    if "-import-" in name:
        return "imported"
    if req.get("reader"):                         # HERESY 2241: the Reader's speech
        return "narrated"
    if req.get("semantic_keep"):
        return "regenerated"
    if req.get("parent") and req.get("semantic_tokens"):
        return "rerendered"
    return "generated"


def albums_out(marks, here):
    """HERESY 2050: the albums with the takes still here; 2058: and a whole workspace still here, and the take whose cover is the album's while
    it is here (none: Automatic, the page's mosaic of its first covers)."""
    out = []
    for a in marks["albums"]:
        al = {"name": a["name"], "items": [n for n in a["items"] if n in here or pl_ws(n) in marks["workspaces"]]}
        if a.get("cover") in here:
            al["cover"] = a["cover"]
        out.append(al)
    return out


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
    shield = set(marks["protected"])             # HERESY 1368
    fire, gems = set(marks["fire"]), set(marks["gems"])   # HERESY 1802
    reacts = marks["reacts"]                                # HERESY 1873: one a take (an older list reads as its first)
    blind = blind_takes(marks)                              # HERESY 1874
    arch = archived_takes(marks)                            # HERESY 2049
    react_of = lambda v: v if v in REACTIONS else (v[0] if isinstance(v, list) and v and v[0] in REACTIONS else "")   # noqa: E731
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
                req["reader"] = bool(r.get("reader"))   # HERESY 2294: the Reader's speech (take_kind's «narrated» never came: the block was not read)
                req["semantic_keep"] = bool(r.get("semantic_keep"))
                req["semantic_tokens"] = bool(r.get("semantic_tokens"))
                req["lyrics_len"] = len(r.get("lyrics") or "")
                # HERESY 2402: a Narrator's book's part (reader.py writes {run, title, k, of}): the Library shows the book as one card
                bk = r.get("book")
                if isinstance(bk, dict) and isinstance(bk.get("run"), str) and isinstance(bk.get("k"), int):
                    req["book"] = {"run": bk["run"], "title": str(bk.get("title") or "")[:120], "k": bk["k"], "of": int(bk.get("of") or 0)}
                # HERESY 2058 (Viktor 03.11.2026: «План (Full/Direct/Instrumental)»): an instrumental: its style begins with «Instrumental» (the Creator's
                # switch writes it so) or its lyrics hold no word to sing (only [section] tags, or nothing); a request without lyrics at all says nothing
                req["instrumental"] = bool(re.match(r"\s*instrumental\b", str(r.get("style") or ""), re.I)) or (
                    "lyrics" in r and not re.sub(r"\[[^\]]*\]", "", str(r.get("lyrics") or "")).strip())
                # HERESY 2170 (D06, Viktor's yes of 06.11.2026): a take that keeps the Creator's Instrumental box (the engine writes it since 2.0.6) says it
                # as the box was; a take from before, without the field, by 2058's rule above
                if isinstance(r.get("instrumental"), bool):
                    req["instrumental"] = r["instrumental"]
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
                     "regen_of": marks["regen_of"].get(d.name, ""), "frozen": d.name in ice, "protected": d.name in shield,
                     "parent": req.get("parent") or "",           # HERESY 1988: what it was made from, for its card's family tree
                     "fire": d.name in fire, "gem": d.name in gems,   # HERESY 1802
                     "no_train": bool(meta.get("no_train")),   # HERESY 2241: never for training (lab/no_train.py)
                     "react": react_of(reacts.get(d.name, "")),   # HERESY 1873
                     "blind": d.name in blind, "archived": d.name in arch,   # HERESY 1874; 2049
                     "instrumental": bool(req.get("instrumental")),   # HERESY 2058
                     "book": req.get("book"),   # HERESY 2402: a part of a Narrator's book, or None
                     "own_realm": own_realm(meta, req),   # HERESY 2294
                     "fixed_realm": meta.get("realm") in REALMS})   # HERESY 2298: written on it, it anchors its line
    here = {r["name"] for r in rows}
    roots = root_realms(rows)                    # HERESY 2294: a take's realm is its root's, the Refiner's and every derived take with it
    for r in rows:
        r["realm"] = roots[r["name"]]
        r.pop("own_realm", None)
        r.pop("fixed_realm", None)
    return {"takes": rows, "ws_realm": {w: "reader" for w in marks["workspaces"] if SEP not in w and realm_ws(marks, w) == "reader"}, "workspaces": sorted(marks["workspaces"]), "trash_days": marks["trash_days"], "locks": marks["locks"],
            "pins": {p: [n for n in ns if n in here] for p, ns in marks["pins"].items() if any(n in here for n in ns)},   # HERESY 2129: the takes here only
            "frozen": marks["frozen"], "archived": [a for a in marks["archived"] if a in marks["workspaces"]],   # HERESY 2049
            "blind": [b for b in marks["blind"] if b in marks["workspaces"]],   # HERESY 1874; 2057: out of 2049's comment again
            "albums": albums_out(marks, {r["name"] for r in rows}),   # HERESY 2050; 2058: a whole workspace in one, and the cover chosen
            "playlist": (lambda here: [n for n in marks["playlist"] if n in here or pl_ws(n) in marks["workspaces"]])({r["name"] for r in rows}),   # HERESY 1730, 2042
            "ws_notes": marks["ws_notes"]}   # HERESY 1802: the workspaces' notes; 2019 (D1): the playlist's crossfade, gone from the player in 1990, gone here


def trashed(outputs):
    """The names lying in the trash (KIT/trash/DATE/TAKE beside KIT/outputs, as lab.py has them): a take there comes back when given back."""
    base = trash_dir(outputs.parent)
    return {t.name for day in base.iterdir() if day.is_dir() for t in day.iterdir()} if base.is_dir() else set()


def in_order(old, new, here, keep):
    """HERESY 2129 (the audit of 06.11.2026: «Перестановка плейлиста или альбома молча выкидывает дубли из корзины»): a list given again in a new
    order, as the page shows it: its entries here take the new order, an entry whose take lies in the trash (keep) holds its place among them, so
    given back it is where it was; one gone for good leaves the list, as before."""
    it, out = iter(new), []
    for n in old:
        if here(n):
            x = next(it, None)
            if x is not None:
                out.append(x)
        elif n in keep:
            out.append(n)
    out.extend(it)
    return out


def covered(d, items):
    """The takes a list holds, a whole workspace's entry (HERESY 2042) with its takes and its sections'."""
    out = set()
    for n in items:
        out.add(n)
        w = pl_ws(n)
        if w is not None:
            for x in family(d, w):
                out |= set(d["workspaces"].get(x, []))
    return out


NOTE_MAX = 6000  # HERESY 1802: a workspace's or an adapter's note (Viktor: «500-600 знаков, чтобы тултипы не разлулись»); 2404 (11.11.2026): 1200, «Не жалко»;
#                  2438 (12.11.2026: «Скрипты свидетельств обрезаны в заметках. Поднимай лимит до 6000 знаков»): 6000
TAKE_NOTE_MAX = 6000  # HERESY 2438: a take's own note (4000 before), every note of the Studio's alike


def collection_post(config_dir, outputs, data):
    op = data.get("op")
    names = [n for n in (data.get("names") or []) if isinstance(n, str) and ((str(op).startswith(("playlist-", "album-")) and pl_ws(n)) or ("/" not in n and not n.startswith(".") and not pl_ws(n)))]   # HERESY 2042: a playlist's own entry, there only; 2058: and an album's
    ws = ws_name(data.get("workspace"))
    with LOCK:
        d = load(config_dir)
        _frozen_guard(d, op, ws, names, data)      # HERESY 1166: nothing reaches a frozen workspace but its thaw
        # HERESY 2294: a top that an add, a move, a merge or a making brings into being from the Readers realm is the Readers (marked once it is there)
        made = (ws_name(data.get("to")) if op == "ws-merge" else ws if op in ("ws-create", "ws-add", "ws-move") else "") or ""
        made = made.split(SEP)[0] if made and data.get("realm") == "reader" and made.split(SEP)[0] not in d["workspaces"] else ""
        if op == "freeze":                         # HERESY 1166: on = true | false; thawing a workspace thaws its sections
            if ws not in d["workspaces"]:
                raise ValueError("freeze an existing workspace")
            fz = set(d["frozen"])
            if data.get("on"):
                fz.add(ws)
            else:
                fz -= {f for f in fz if f == ws or f.startswith(ws + SEP)}
            d["frozen"] = sorted(fz)
        elif op == "ws-realm":                     # HERESY 2294: a top workspace given to a realm, when none of its takes belongs to the other
            top, realm = ws.split(SEP)[0] if ws else "", data.get("realm")
            if not top or top not in d["workspaces"] or realm not in REALMS:
                raise ValueError("give an existing workspace to a realm: creator or reader")
            held = sorted({n for w in family(d, top) for n in d["workspaces"][w]})
            other = [n for n, rl in take_realms(outputs, held).items() if rl != realm]
            if other:
                raise ValueError(f"\u201c{top}\u201d holds {len(other)} takes of the other realm: they would stand there as links")
            if realm == "reader":
                d["ws_realm"][top] = "reader"
            else:
                d["ws_realm"].pop(top, None)
        elif op == "take-realm":                   # HERESY 2437: an imported take of the Narrator's (a TTS file brought in before /import said its realm)
            realm = data.get("realm")              # given to its realm, written on it as 2298 wrote the first 117: only an import, only its own root
            if realm not in REALMS or not names:
                raise ValueError("take-realm: names and a realm, creator or reader")
            for n in names:
                mp, rp = Path(outputs) / n / "meta.json", Path(outputs) / n / "request.json"
                meta = json.loads(mp.read_text(encoding="utf-8"))
                req = json.loads(rp.read_text(encoding="utf-8")) if rp.is_file() else {}
                if meta.get("model") != "import" or req.get("parent"):
                    raise ValueError(f"{n}: only an imported take of its own (not a version of another) is given a realm")
            for n in names:
                mp = Path(outputs) / n / "meta.json"
                meta = json.loads(mp.read_text(encoding="utf-8"))
                meta["realm"] = realm
                tmp = mp.with_suffix(".json.part")
                tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=4), encoding="utf-8")
                tmp.replace(mp)
        elif op == "hide":
            d["hidden"] = sorted(set(d["hidden"]) | set(names))
        elif op == "show":
            d["hidden"] = sorted(set(d["hidden"]) - set(names))
        elif op == "ws-create":
            if not ws:
                raise ValueError("a workspace needs a name")
            fresh_parts(d, ws)                         # HERESY 1167: 32 characters a level, for what is new
            born(d, ws)                                # HERESY 2129: nothing inherited from one of that name gone
            parts = ws.split(SEP)
            for i in range(1, len(parts) + 1):         # a section's parents come with it
                d["workspaces"].setdefault(SEP.join(parts[:i]), [])
        elif op == "ws-rename":
            new = ws_name(data.get("to"))
            if not ws or not new or ws not in d["workspaces"] or new in d["workspaces"]:
                raise ValueError("rename from an existing workspace to a new name")
            fresh_parts(d, new)                        # HERESY 1167: the new name, 32 characters a level
            if SEP in new and new.split(SEP)[0] in d["workspaces"] and realm_ws(d, new) != realm_ws(d, ws):
                raise ValueError("a workspace stays in its realm (Musician or Narrator): link its takes into the other one instead")   # HERESY 2294
            moves = [(w, new + w[len(ws):]) for w in family(d, ws)]          # its sections go with it (1161)
            for old, to in moves:
                if len(to.split(SEP)) > DEPTH:
                    raise ValueError(f"“{to}” would be more than two levels of sections deep")
                if old != ws and to in d["workspaces"]:
                    raise ValueError(f"“{to}” is there already")
            realm = realm_ws(d, ws)                    # HERESY 2294: read before the names move
            for _old, to in moves:                     # HERESY 2129: the new names take nothing a workspace of theirs gone left behind
                born(d, to)
            for old, to in moves:
                d["workspaces"][to] = d["workspaces"].pop(old)
                if old in d["locks"]:              # the locks go with the name
                    d["locks"][to] = d["locks"].pop(old)
                if old in d["pins"]:               # and the pins
                    d["pins"][to] = d["pins"].pop(old)
                if old in d["ws_notes"]:           # HERESY 1802: and the note
                    d["ws_notes"][to] = d["ws_notes"].pop(old)
                if old in d["blind"]:              # HERESY 1874: and the blindness
                    d["blind"] = sorted((set(d["blind"]) - {old}) | {to})
                if old in d["archived"]:           # HERESY 2049: and the archive
                    d["archived"] = sorted((set(d["archived"]) - {old}) | {to})
                if SEP not in old:                     # HERESY 2294: a top's realm goes with its name
                    d["ws_realm"].pop(old, None)
                if SEP not in to and realm == "reader":
                    d["ws_realm"][to] = "reader"
                d["playlist"] = [PL_WS + to if n == PL_WS + old else n for n in d["playlist"]]   # HERESY 2042: and its place in the playlist
                for al in d["albums"]:                 # HERESY 2058: and in the albums
                    al["items"] = [PL_WS + to if n == PL_WS + old else n for n in al["items"]]
        elif op == "pin":                          # HERESY 1103: place = a workspace, "" (All), __fav, __none; on = true | false
            place = str(data.get("place") or "")[:200]
            # HERESY 2129 (the audit of 06.11.2026: «Призрачные пины»): a pin of a take not in the library (deleted for good, or in the trash) holds
            # no slot: the strip showed three, the fourth was refused, and the unseen one had nothing to unpin it
            have = [n for n in d["pins"].get(place, []) if n not in names and (outputs / n / "meta.json").is_file()]
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
        elif op in ("ws-delete", "ws-merge", "ws-pour") and any(locked(d, w, "workspace") for w in family(d, ws)):
            w = next(w for w in family(d, ws) if locked(d, w, "workspace"))
            raise ValueError(f"\u201c{w}\u201d is locked against deletion: unlock it first (right-click on its name)")
        elif op in ("ws-pour", "ws-merge") and ws in d["workspaces"] and ws_name(data.get("to")) and (
                ws_name(data.get("to")) in d["workspaces"] or ws_name(data.get("to")).split(SEP)[0] in d["workspaces"]) and realm_ws(d, ws) != realm_ws(d, ws_name(data.get("to"))):
            raise ValueError("workspaces of two realms are not merged: link the takes into the other one instead (Add to workspace)")   # HERESY 2294
        elif op == "ws-pour":                      # HERESY 1808: its takes and its sections' into another, then it goes with its sections
            to, fam = ws_name(data.get("to")), family(d, ws)
            if not ws or ws not in d["workspaces"] or not to or to not in d["workspaces"] or to in fam:
                raise ValueError("move the takes of an existing workspace into another one, not into itself or a section of its own")
            moved = set()
            for w in fam:
                moved |= set(d["workspaces"][w])
            d["workspaces"][to] = sorted(set(d["workspaces"][to]) | moved)
            for w in fam:
                d["workspaces"].pop(w, None)
                d["pins"].pop(w, None)
                d["ws_notes"].pop(w, None)
            forget_ws(d, fam, to)                      # HERESY 2129: their marks go; their entries in the playlist and albums are the other's now
        elif op == "ws-merge" and len(family(d, ws)) > 1:
            raise ValueError(f"\u201c{ws}\u201d has sections: merge or delete them first")
        elif op == "ws-delete":            # the workspace goes, its sections with it (1161); its takes stay where they are
            fam = family(d, ws)
            for w in fam:
                d["workspaces"].pop(w, None)
                d["pins"].pop(w, None)
                d["ws_notes"].pop(w, None)         # HERESY 1802
            forget_ws(d, fam)                      # HERESY 2129: and every other mark of theirs, their entries in the playlist and the albums
        elif op == "ws-add":
            if not ws:
                raise ValueError("which workspace?")
            # HERESY 2284: a name it makes keeps ws-create's PART_MAX characters a level (a decode script's add made a 36-character workspace
            # that ws-create had refused, under the limit of 32 then); one already there takes its takes whatever its length
            fresh_parts(d, ws)
            born(d, ws)                                # HERESY 2129: one made by adding to it is born clean too
            d["workspaces"][ws] = sorted(set(d["workspaces"].get(ws, [])) | set(names))
        elif op == "ws-move":                      # HERESY 1050: into one workspace, out of the one it came from
            if not ws:
                raise ValueError("which workspace?")
            src = ws_name(data.get("from")) if data.get("from") else ""
            # HERESY 2129 (the audit of 06.11.2026): tree = out of the named one and its sections, as its view shows them (a take of a section
            # moved from its parent's view stayed where it was, and the toast said «out of» the parent); a frozen section keeps its own (1166)
            froms = (view_tree(d, src) if data.get("tree") else [src]) if src else list(d["workspaces"])   # from nowhere named: out of every other
            # HERESY 2129: a named one under a lock lets nothing out, as ws-remove (1473); a move went round it. A move inside the lock's own tree (a
            # locked 💎 set's takes into its section) leaves them under every lock they were under, so it goes on as before
            for w in froms if src else []:
                if w != ws and w in d["workspaces"] and not frozen_ws(d, w) and ws_locked(d, w) and not locks_on(d, w) <= locks_on(d, ws) and set(d["workspaces"][w]) & set(names):
                    raise ValueError(f"\u201c{w}\u201d is locked: unlock it first to take takes out of it (right-click on its name)")
            fresh_parts(d, ws)                         # HERESY 2284: as ws-add, for a name it makes
            # HERESY 2294: a take stays in its realm; moved into the other realm's workspace only when it came from there (a link moved), else
            # it is linked (Add to workspace), never moved
            to_realm = "reader" if made and ws.split(SEP)[0] == made else realm_ws(d, ws)
            if not src or realm_ws(d, src) != to_realm:
                away = [n for n, rl in take_realms(outputs, names).items() if rl != to_realm]
                if away:
                    who = "the Narrator" if to_realm == "creator" else "the Musician"
                    raise ValueError(f"{len(away)} of these takes belong to {who} and stay in its realm: link them into \u201c{ws}\u201d instead (Add to workspace)")
            born(d, ws)
            for w in froms:
                if w != ws and w in d["workspaces"] and not frozen_ws(d, w) and (src or not ws_locked(d, w)):   # a frozen one keeps its takes (1166); a locked one too, unless named (1473)
                    d["workspaces"][w] = sorted(set(d["workspaces"][w]) - set(names))
            d["workspaces"][ws] = sorted(set(d["workspaces"].get(ws, [])) | set(names))
        elif op == "ws-merge":                     # HERESY 1050: a workspace's takes into another, then it goes
            to = ws_name(data.get("to"))
            if not ws or ws not in d["workspaces"] or not to or to == ws:
                raise ValueError("merge an existing workspace into another")
            fresh_parts(d, to)                         # HERESY 2284: as ws-add, for a name it makes
            born(d, to)                                # HERESY 2129: a new one to merge into is born clean
            d["workspaces"][to] = sorted(set(d["workspaces"].get(to, [])) | set(d["workspaces"].pop(ws)))
            if ws in d["ws_notes"]:                # HERESY 1802: its note goes to the other when that one has none
                d["ws_notes"].setdefault(to, d["ws_notes"].pop(ws))
            forget_ws(d, [ws], to)                     # HERESY 2129: its other marks go; its entries in the playlist and albums are the other's now
        elif op == "ws-remove":
            wss = [ws]
            if data.get("tree") and ws in d["workspaces"]:   # HERESY 2129: out of its sections too, as its view shows them; a frozen one keeps its own (1166)
                wss = [w for w in view_tree(d, ws) if w == ws or (not frozen_ws(d, w) and set(d["workspaces"][w]) & set(names))]   # 2168: as its view shows them
            for w in wss:
                if w in d["workspaces"] and ws_locked(d, w):          # HERESY 1473
                    raise ValueError(f"\u201c{w}\u201d is locked: unlock it first to take takes out of it (right-click on its name)")
            for w in wss:
                if w in d["workspaces"]:
                    d["workspaces"][w] = sorted(set(d["workspaces"][w]) - set(names))
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
            text = str(data.get("text") or "").strip()
            if len(text) > TAKE_NOTE_MAX:          # HERESY 2438: cut where it is cut, and said so with «…» (it went silently at 4000)
                text = text[:TAKE_NOTE_MAX - 2].rstrip() + " \u2026"
            for n in names:
                if text:
                    d["notes"][n] = text
                else:
                    d["notes"].pop(n, None)
        elif op == "mark":                         # HERESY 1802: 🔥 fire, 💎 gem; on = true | false
            key = {"fire": "fire", "gem": "gems"}.get(str(data.get("mark") or ""))
            if not key:
                raise ValueError("mark: fire or gem")
            d[key] = sorted(set(d[key]) | set(names)) if data.get("on") else sorted(set(d[key]) - set(names))
        elif op == "blind":                        # HERESY 1874: {workspace, on}: blind listening, its sections with it
            if ws not in d["workspaces"]:
                raise ValueError("blind listening in an existing workspace")
            d["blind"] = sorted(set(d["blind"]) | {ws}) if data.get("on") else sorted(b for b in d["blind"] if b != ws)
        elif op == "archive":                      # HERESY 2049: {workspace, on}: out of the tree into Archived, its sections with it; back again
            if ws not in d["workspaces"]:
                raise ValueError("archive an existing workspace")
            d["archived"] = sorted(set(d["archived"]) | {ws}) if data.get("on") else sorted(a for a in d["archived"] if a != ws and not a.startswith(ws + SEP))
        elif op == "react":                        # HERESY 1873: {react: key, or "" for none, names}: one a take
            key = str(data.get("react") or "")
            if key and key not in REACTIONS:
                raise ValueError("react: " + ", ".join(REACTIONS) + " or none")
            for n in names:
                if key:
                    d["reacts"][n] = key
                else:
                    d["reacts"].pop(n, None)
        elif op == "ws-note":                      # HERESY 1802: a workspace's or a section's note, its tip in the column
            if ws not in d["workspaces"]:
                raise ValueError("a note on an existing workspace")
            text = str(data.get("text") or "").strip()
            if len(text) > NOTE_MAX:
                raise ValueError(f"a note is {NOTE_MAX} characters at most ({len(text)} given)")
            if text:
                d["ws_notes"][ws] = text
            else:
                d["ws_notes"].pop(ws, None)
        elif op == "lora-note":                    # HERESY 1802: the user's note on an adapter, under a line in its tip in the Creator
            lid = str(data.get("id") or "").strip()
            if not lid or len(lid) > 300 or ".." in lid or lid.startswith("/"):
                raise ValueError("which adapter? (its id under loras/)")
            text = str(data.get("text") or "").strip()
            if len(text) > NOTE_MAX:
                raise ValueError(f"a note is {NOTE_MAX} characters at most ({len(text)} given)")
            if text:
                d["lora_notes"][lid] = text
            else:
                d["lora_notes"].pop(lid, None)
        elif op == "protect":                      # HERESY 1368: on = true | false; only a take in the library is protected
            if data.get("on"):
                have = [n for n in names if (outputs / n / "meta.json").is_file()]
                if len(have) < len(names):
                    raise ValueError(f"{len(names) - len(have)} of them not in the library: nothing protected")
                d["protected"] = sorted(set(d["protected"]) | set(have))
            else:
                d["protected"] = sorted(set(d["protected"]) - set(names))
        elif op == "played":                       # HERESY 1162: a take heard once is fresh no more
            d["played"] = sorted(set(d["played"]) | set(names))
        elif op == "regen-of":                     # HERESY 1162: the lab records what a take was made again from
            src = str(data.get("from") or "")
            for n in names:
                d["regen_of"][n] = src
        elif op == "playlist-add":                 # HERESY 1730: where = first | last | random; a take already in it moves there
            where = str(data.get("where") or "last")
            if where not in ("first", "last", "random"):
                raise ValueError("where: first, last or random")
            if ws and ws not in d["workspaces"]:       # HERESY 2042: a whole workspace, one entry; «Outside workspaces» is none
                raise ValueError("no such workspace")
            whole = [PL_WS + ws] if ws else []
            pl = [n for n in d["playlist"] if n not in names and n not in whole]
            add = whole or [n for n in names if (outputs / n).is_dir()]
            if not add:
                raise ValueError("no such take")
            if where == "first":
                pl = add + pl
            elif where == "last":
                pl = pl + add
            else:
                for n in add:
                    pl.insert(random.randint(0, len(pl)), n)
            d["playlist"] = pl
        elif op == "playlist-remove":              # HERESY 1730: out of the playlist; the take itself untouched
            d["playlist"] = [n for n in d["playlist"] if n not in names]
        elif op == "playlist-order":               # HERESY 1730: the whole list again, as the page dragged it (the same takes)
            here = [n for n in d["playlist"] if (outputs / n).is_dir() or pl_ws(n) in d["workspaces"]]   # HERESY 1730b, 2042: and a workspace still here
            if sorted(set(names)) != sorted(set(here)) or len(names) != len(set(names)):
                raise ValueError("the order must hold the playlist's own takes, each once")
            d["playlist"] = in_order(d["playlist"], names, lambda n: (outputs / n).is_dir() or pl_ws(n) in d["workspaces"], trashed(outputs))   # HERESY 2129
        elif op == "playlist-shuffle":             # HERESY 1730: a deck's shuffle
            pl = list(d["playlist"])
            random.shuffle(pl)
            d["playlist"] = pl
        elif op in ("album-create", "album-rename", "album-delete", "album-add", "album-remove", "album-order", "album-cover"):   # HERESY 2050: the playlist's albums
            name = album_name(data.get("album"))
            # HERESY 2058: an album's item is a take here, or a whole workspace here («@ws:NAME», one item, as in the playlist)
            al_ok = lambda n: pl_ws(n) in d["workspaces"] if pl_ws(n) else (outputs / n).is_dir()   # noqa: E731
            al = next((a for a in d["albums"] if a["name"] == name), None)
            if op == "album-create":
                name_rule.check(data.get("album"), 60)    # HERESY 2462: a new album's name keeps the names' rule, said, never cut quietly
                if not name:
                    raise ValueError("an album's name")
                if al:
                    raise ValueError("an album of that name is there already")
                d["albums"].append({"name": name, "items": [n for n in names if al_ok(n)]})
            elif not al:
                raise ValueError("no such album")
            elif op == "album-rename":
                name_rule.check(data.get("to"), 60)       # HERESY 2462
                to = album_name(data.get("to"))
                if not to or any(a["name"] == to for a in d["albums"]):
                    raise ValueError("a new name, not one taken")
                al["name"] = to
            elif op == "album-delete":                 # the album goes; its takes stay where they are
                d["albums"] = [a for a in d["albums"] if a is not al]
                # HERESY 2129 (the audit of 06.11.2026): «Its takes stay in the library and in the playlist» was not so for a take only in the album: it left
                # Everything. Such a take (or a whole workspace's entry) joins the playlist's end, in the album's order; one in the trash too, to come back
                held, bin_ = covered(d, d["playlist"] + [n for a in d["albums"] for n in a["items"]]), trashed(outputs)
                d["playlist"] = d["playlist"] + [n for n in al["items"] if n not in held and (al_ok(n) or n in bin_)]
            elif op == "album-add":                    # where = first | last; a take already in it stays where it stands
                add = [n for n in names if al_ok(n) and n not in al["items"]]
                al["items"] = add + al["items"] if data.get("where") == "first" else al["items"] + add
            elif op == "album-cover":                  # HERESY 2058 (Viktor: «1:1 обложку, которую подгружаем из обложек треков»): {take}, "" for Automatic
                take = str(data.get("take") or "")
                if take and (pl_ws(take) or "/" in take or take.startswith(".") or not (outputs / take / "meta.json").is_file()):
                    raise ValueError("the cover of a take in the library, or none")
                if take:
                    al["cover"] = take
                else:
                    al.pop("cover", None)
            elif op == "album-remove":
                al["items"] = [n for n in al["items"] if n not in names]
            elif op == "album-order":                  # the whole album again, as the page dragged or shuffled it
                here = [n for n in al["items"] if al_ok(n)]
                if sorted(set(names)) != sorted(set(here)) or len(names) != len(set(names)):
                    raise ValueError("the order must hold the album's own takes, each once")
                al["items"] = in_order(al["items"], names, al_ok, trashed(outputs))   # HERESY 2129: one in the trash keeps its place
        elif op == "trash-days":
            days = int(data.get("days") or 0)
            if days not in (0, 7, 14, 28, 30):            # HERESY 1996: 30 (28 still kept as it was set)
                raise ValueError("0 (never), 7, 14 or 30 days")
            d["trash_days"] = days
        else:
            raise ValueError("unknown op")
        if made and made in d["workspaces"]:
            d["ws_realm"][made] = "reader"
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
    """Takes to the trash; a take in a workspace whose tracks are locked stays, and is said (HERESY 1070); a protected one too, said
    apart (HERESY 1368)."""
    day = trash_dir(kit) / time.strftime("%Y-%m-%d")
    day.mkdir(parents=True, exist_ok=True)
    moved, kept, shielded, missing = [], [], [], []
    marks = load(config_dir) if config_dir else None
    guard = (locked_takes(marks) | frozen_takes(marks)) if marks else set()     # HERESY 1166: a frozen take stays too
    shield = set(marks["protected"]) if marks else set()
    for n in names:
        if n in shield:
            shielded.append(n)
            continue
        if n in guard:
            kept.append(n)
            continue
        src = outputs / n
        if "/" in n or n.startswith(".") or not (src / "meta.json").is_file():
            missing.append({"name": n, "why": "not in the library"})   # HERESY 2129: said, never left out silently
            continue
        dst = day / n
        if dst.exists():
            missing.append({"name": n, "why": "one of that name is in today's trash already"})
            continue
        shutil.move(str(src), str(dst))
        os.utime(dst, None)                       # the time it went to the trash
        places = sorted(w for w, ns in (marks["workspaces"].items() if marks else []) if n in ns)   # HERESY 1996: where it stood, to stand there again
        if places:
            (dst / ".places.json").write_text(json.dumps({"workspaces": places}, ensure_ascii=False), encoding="utf-8")
        moved.append(n)
    out = {"moved": moved, "locked": kept, "protected": shielded}
    if missing:
        out["missing"] = missing
    return out


def trash_restore(kit, outputs, items, config_dir=None):
    """Takes given back. HERESY 1996: with config_dir each stands again where it stood when it went (its .places.json), the workspaces and
    sections it stood in made again when they are gone; the list of those made again said."""
    back, stood, skipped = [], {}, []
    for it in items:
        day, n = str(it.get("day", "")), str(it.get("name", ""))
        if "/" in day or "/" in n or day.startswith(".") or n.startswith("."):
            continue
        src = trash_dir(kit) / day / n
        if src.is_dir() and (outputs / n).exists():    # HERESY 2129 (the audit of 06.11.2026: «0 back in the library» said nothing more)
            skipped.append({"name": n, "day": day, "why": "a take of that name is in the library already"})
        if src.is_dir() and not (outputs / n).exists():
            shutil.move(str(src), str(outputs / n))
            back.append(n)
            pf = outputs / n / ".places.json"
            if pf.is_file():
                try:
                    stood[n] = [str(w) for w in json.load(open(pf, encoding="utf-8")).get("workspaces") or [] if str(w).strip()]
                except (OSError, ValueError):
                    pass
                pf.unlink(missing_ok=True)
    made = []
    if config_dir and stood:
        with LOCK:
            d = load(config_dir)
            for n, ws in stood.items():
                for w in ws:
                    if w not in d["workspaces"]:
                        made.append(w)
                    d["workspaces"][w] = sorted(set(d["workspaces"].get(w, [])) | {n})
            save(config_dir, d)
    out = {"restored": back, "made_again": sorted(set(made))}
    if skipped:
        out["skipped"] = skipped
    return out


def forget_takes(config_dir, outputs, names):
    """HERESY 2129 (the audit of 06.11.2026): takes deleted for good leave no name behind where a name holds a place: the pins (a slot of four),
    the workspaces, the playlist and the albums. A take of the same name back in the library keeps its own."""
    gone = {n for n in names if not (outputs / n).exists()}
    if not gone:
        return
    with LOCK:
        d = load(config_dir)
        d["pins"] = {p: [n for n in ns if n not in gone] for p, ns in d["pins"].items() if any(n not in gone for n in ns)}
        for w in d["workspaces"]:
            d["workspaces"][w] = [n for n in d["workspaces"][w] if n not in gone]
        d["playlist"] = [n for n in d["playlist"] if n not in gone]
        for al in d["albums"]:
            al["items"] = [n for n in al["items"] if n not in gone]
            if al.get("cover") in gone:
                al.pop("cover", None)
        save(config_dir, d)


def trash_empty(kit, items=None, older_than_days=None, config_dir=None):
    """Delete from the trash: the given items, or all, or those older than N days. A protected take is never deleted, whatever
    brought it there (HERESY 1368): it stays, said. HERESY 2129: an item asked for and not in the trash is said (absent), and with config_dir
    the names deleted leave the marks (forget_takes)."""
    gone, now, kept, failed = [], time.time(), [], []
    shield = set(load(config_dir)["protected"]) if config_dir else set()
    listed = trash_list(kit)["items"]
    want = None if items is None else {(str(i.get("day", "")), str(i.get("name", ""))) for i in items if isinstance(i, dict)}
    there = {(it["day"], it["name"]) for it in listed}
    absent = [] if want is None else [{"day": k[0], "name": k[1]} for k in sorted(want - there)]
    for it in listed:
        if want is not None and (it["day"], it["name"]) not in want:
            continue
        if older_than_days is not None and now - it["trashed"] < older_than_days * 86400:
            continue
        if it["name"] in shield:
            kept.append(it["name"])
            continue
        shutil.rmtree(trash_dir(kit) / it["day"] / it["name"], ignore_errors=True)
        if (trash_dir(kit) / it["day"] / it["name"]).exists():   # HERESY 2129: a deletion that failed is not counted as done
            failed.append({"day": it["day"], "name": it["name"], "why": "could not be deleted (its files are held or not ours to delete)"})
            continue
        gone.append(it["name"])
    for day in trash_dir(kit).iterdir() if trash_dir(kit).is_dir() else []:
        if day.is_dir() and not any(day.iterdir()):
            day.rmdir()
    if config_dir and gone:
        forget_takes(config_dir, kit / "outputs", gone)
    out = {"emptied": gone, "protected": kept}
    if absent:
        out["absent"] = absent
    if failed:
        out["failed"] = failed
    return out


# ---- export: a ZIP built as a job, then fetched as a file
EXPORTS = {}


def _fname(title, used, ext):
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", title).strip()[:80] or "take"
    name, i = f"{base}{ext}", 2
    while name in used:
        name, i = f"{base} ({i}){ext}", i + 1
    used.add(name)
    return name


def export_start(kit, outputs, names, fmt, derived, sign=None):
    """HERESY 1489: sign(take_dir, bytes, fmt, rel) -> (bytes, said), the lab's Content Credentials; each audio file goes into the
    ZIP as it says, and the job counts the signed ones."""
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
                        job["missing"] = job.get("missing", 0) + 1     # HERESY 1473: said, never a short ZIP called whole
                        continue
                    meta = json.load(open(d / "meta.json", encoding="utf-8"))
                    title = meta.get("title") or n
                    def put(path, arc, kind, rel=""):          # HERESY 1489: signed on the way when the lab says so
                        if sign is None or kind not in ("wav", "flac", "mp3"):
                            return z.write(path, arc)
                        data, said = sign(d, path.read_bytes(), kind, rel)
                        job["signed" if said == "signed" else "unsigned"] = job.get("signed" if said == "signed" else "unsigned", 0) + 1
                        z.writestr(arc, data)
                    # HERESY 2011 (the audit, C2): the take's own song as the engine names it; an MP3 or a FLAC take was left out with no word
                    src = next((d / f for f in ("audio.wav", "audio.flac", "audio.mp3") if (d / f).is_file()), None)
                    if src is None:
                        job["no_song"] = job.get("no_song", 0) + 1
                    elif src.suffix == ".mp3" or (src.suffix == ".flac" and fmt != "wav"):   # as it was made: an MP3 made lossless only grows
                        put(src, _fname(title, used, src.suffix), src.suffix.lstrip("."))
                    elif src.suffix == ".flac":                # a FLAC take asked as WAV: 24 bits hold its 16 or 24 whole
                        tmp = out_dir / f"{xid}.wav"
                        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "pcm_s24le", str(tmp)], check=True, timeout=1800)
                        put(tmp, _fname(title, used, ".wav"), "wav")
                        tmp.unlink()
                    else:
                        if fmt == "wav":
                            put(src, _fname(title, used, ".wav"), "wav")
                        else:
                            tmp = out_dir / f"{xid}.flac"
                            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "flac", "-metadata", f"title={title}", str(tmp)], check=True, timeout=1800)
                            put(tmp, _fname(title, used, ".flac"), "flac")
                            tmp.unlink()
                    if derived and (d / "derived").is_dir():
                        for m in sorted((d / "derived").glob("*/manifest.json")):
                            man = json.load(open(m, encoding="utf-8"))
                            for f in man.get("files", []):
                                fp = d / f.get("path", "")
                                if fp.is_file():
                                    put(fp, _fname(f"{title} - {f.get('name') or fp.stem}", used, fp.suffix), fp.suffix.lower().lstrip("."), f.get("path", ""))
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
