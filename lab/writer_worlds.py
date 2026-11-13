"""HERESY 2486, 2487: the Writer's two worlds, the lab's side. Imported by writer.py (which holds the lock and the notebook's folder).

Viktor 12.11.2026: «Я бы хотел, чтобы у Писателя было также два мира — Музыканта и Чтеца, со своими промптами, темплейтами, SOUL.md
и т.п. … Студия одна, Писатель один, два Творца». One notebook, one Writer; a world decides the charter the model gets (the built-in one
plus the author's SOUL of that world, appended: his word of the same evening), the tasks, the chips, the templates and the draft's shape.
The Musician's world (creator) keeps its charter in the page (heresy-assist.js), as before; the Narrator's world (reader) has its charter
here (writer_worlds/reader-charter.md), a DRAFT until Viktor reads it.

2487: a document between the worlds: the one-time migration's candidates (the dialog never pre-ticks a text with section tags: Viktor,
12.11: «Иуда · LCVr» stays a song for now), a document sent to the Narrator, the Narrator's «Edit in the Writer», and its takes linked back.
"""
import json, os, re, time, shutil
from pathlib import Path

REALMS = ("creator", "reader")
SOUL_MAX = 200000
SOUL_KEEP = 30
LONG = 10000                     # the Musician's lyrics hold 10 000 (2480): past it a text is a reading's
HERE = Path(__file__).resolve().parent
CHARTER = HERE / "writer_worlds" / "reader-charter.md"
CHARTER_DRAFT = True             # until Viktor has read the Narrator world's charter (his «???» of 12.11 evening: a first draft asked)
SOUL_HEADING = ("THE AUTHOR'S SOUL FOR THIS WORLD (his own standing word: it stands over everything above; where the two disagree, "
                "follow this)")

CREATOR = {
    "tasks": [["song", "Lyrics + musical style"], ["lyrics", "Lyrics only"], ["style", "Musical style only"],
              ["review", "Review & refine lyrics"], ["adapt", "Adapt lyrics for a cover"]],
    "chips": [["Find the hook", "Give this song a stronger, more memorable chorus while keeping its story."],
              ["Make it personal", "Make the lyrics more personal and specific, with natural conversational phrasing."],
              ["Polish a draft", "Review the lyrics for singability, natural stress, rhyme, and story development. Revise weak lines."],
              ["Style for YuE2", "Rewrite the style for YuE2: keep every audible detail, drop what it cannot hear, and make key, meter and tempo agree with the score."]],
    "templates": [["simple", "Verse · Chorus"], ["bridge", "Verse · Chorus · Bridge"], ["prechorus", "With a pre-chorus"],
                  ["full", "Full arc — intro, pre-chorus, bridge, outro"]],
    "lyric_tasks": ["song", "lyrics", "adapt"],
    "schema": {"type": "object", "additionalProperties": False, "required": ["title", "style", "style_tags", "lyrics", "notes"],
               "properties": {k: {"type": "string"} for k in ("title", "style", "style_tags", "lyrics", "notes")}},
    "fields": {"lyrics": "LYRICS", "style": "STYLE", "params": "the Musician's knobs"},
    "tools": ["meter", "rhyme", "sections", "worn", "textprofiles"],
}

READER = {
    "tasks": [["chapter", "Chapter"], ["scene", "Scene"], ["dialog", "Dialogue by roles"], ["narration", "Narration"],
              ["prepare", "Prepare the text for reading"], ["review", "Review & polish the reading"]],
    "chips": [["Stresses", "Mark the stress of every Russian word a reader could stress wrongly with a capital vowel, as the charter says; change no word."],
              ["Numbers in words", "Write every number, date, abbreviation and symbol out in words as it is to be said; change nothing else."],
              ["Pauses and breath", "Shape the pauses: paragraphs where the thought turns, … where the voice hangs, [split] between chapters; keep every word."],
              ["Roles and voices", "Write the dialogue as «Name: words» lines, one turn a line, and fill the cast with a voice hint for every role."],
              ["Feelings", "Put the engine's emotion tags at the head of the sentences that need them, sparingly, as the charter says; change no word."]],
    "templates": [
        ["chapter", "Chapter",
         "\n\nShape, exactly: the chapter's heading on its own first line; then the narration in paragraphs of three to six sentences; dialogue as «Name: words» lines where people speak; end the chapter on a line that leaves the listener a reason to hear the next.",
         "Chapter …\n\n…\n\n…\n"],
        ["scene", "Scene",
         "\n\nShape, exactly: one place, one time, one turn of events. Open with two or three sentences that set the place for the ear (sound, light, who is there); then the action and the dialogue; close the scene on the changed situation, not on a summary.",
         "…\n\nName: …\nName: …\n\n…\n"],
        ["dialog", "Dialogue by roles",
         "\n\nShape, exactly: every turn its own line as «Name: words», the same name spelled the same way every time; a narrator's line between turns only where the ear needs it (who moved, who fell silent), written as plain narration with no name; fill the cast with every name and a voice hint.",
         "Name: …\nName: …\n\n…\n\nName: …\n"],
        ["narration", "Narration",
         "\n\nShape, exactly: continuous narration in paragraphs, no dialogue lines; sentences a reader can say on one breath (mostly under twenty-five words); a blank line where the thought turns.",
         "…\n\n…\n"],
    ],
    "lyric_tasks": ["chapter", "scene", "dialog", "narration"],
    "schema": {"type": "object", "additionalProperties": False, "required": ["title", "text", "voice", "notes", "cast"],
               "properties": {"title": {"type": "string"}, "text": {"type": "string"}, "voice": {"type": "string"}, "notes": {"type": "string"},
                              "cast": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name", "voice_hint"],
                                                                  "properties": {"name": {"type": "string"}, "voice_hint": {"type": "string"}}}}}},
    "fields": {"lyrics": "TEXT", "style": "VOICE AND MANNER", "params": "the Narrator's knobs"},
    "tools": ["stress", "tags", "numbers", "pauses", "roles", "split", "clean", "textprofiles"],
}


def realm_of(v):
    if v not in REALMS:
        raise ValueError("realm is creator or reader")
    return v


# ---------------------------------------------------------------- the SOUL of a world, with its versions
def _soul_path(wd, realm):
    return wd / f"soul-{realm_of(realm)}.md"


def _vdir(wd):
    d = wd / "souls" / ".versions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_text(p, text):
    tmp = Path(str(p) + ".part")
    with open(tmp, "w", encoding="utf-8") as fh:   # HERESY 2083: written whole and on the disk before it takes the file's place
        fh.write(text)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


def _read_text(p):
    """"" only for a file that is not there: one that is there and cannot be read raises (an empty SOUL would be written over it)"""
    if not p.is_file():
        return ""
    return p.read_text(encoding="utf-8")


def _versions(wd, realm):
    out = []
    for p in sorted(_vdir(wd).glob(f"{realm}-*.md"), reverse=True):
        t = _read_text(p)
        out.append({"at": p.stat().st_mtime, "name": p.name, "chars": len(t), "first": next((l.strip() for l in t.split("\n") if l.strip()), "")[:120]})
    return out


def _keep_version(wd, realm, text, tail=""):
    """the text before kept as a version (the newest SOUL_KEEP per world; older ones moved to .trash beside, never deleted)"""
    d = _vdir(wd)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    p, k = d / f"{realm}-{stamp}{tail}.md", 1
    while p.exists():
        k += 1
        p = d / f"{realm}-{stamp}{tail}-{k}.md"
    _write_text(p, text)
    old = sorted(d.glob(f"{realm}-*.md"), reverse=True)[SOUL_KEEP:]
    if old:
        t = d / ".trash"
        t.mkdir(exist_ok=True)
        for q in old:
            shutil.move(str(q), str(t / q.name))


def soul(wd, realm):
    p = _soul_path(wd, realm)
    return {"realm": realm, "text": _read_text(p), "updated": p.stat().st_mtime if p.is_file() else None, "versions": _versions(wd, realm)}


def soul_put(wd, realm, text):
    if not isinstance(text, str):
        raise ValueError("a SOUL is a text")
    if len(text) > SOUL_MAX:
        raise ValueError(f"a SOUL holds {SOUL_MAX} characters at most")
    p = _soul_path(wd, realm)
    before = _read_text(p)
    if before == text and p.is_file():
        return soul(wd, realm)
    if before.strip():
        _keep_version(wd, realm, before)
    _write_text(p, text)
    return soul(wd, realm)


def soul_seed(wd, realm, text):
    """«Your preferences» moved into the Musician world's SOUL once: written only where that SOUL is absent or empty"""
    if _read_text(_soul_path(wd, realm)).strip() or not str(text or "").strip():
        return dict(soul(wd, realm), seeded=False)
    return dict(soul_put(wd, realm, str(text)), seeded=True)


def soul_version(wd, realm, name):
    realm_of(realm)
    if not re.fullmatch(re.escape(realm) + r"-[0-9]{8}-[0-9]{6}[A-Za-z0-9-]*\.md", str(name or "")):
        raise ValueError("no such version")
    p = _vdir(wd) / name
    if not p.is_file():
        raise FileNotFoundError("no such version")
    return {"realm": realm, "name": name, "text": _read_text(p)}


def souls_export(wd):
    return {r: _read_text(_soul_path(wd, r)) for r in REALMS}


def souls_import(wd, souls):
    """a backup's SOUL written where this one is empty; one that differs from a non-empty SOUL here kept as a version, never written over"""
    told = {}
    for r in REALMS:
        t = souls.get(r) if isinstance(souls, dict) else None
        if not isinstance(t, str) or not t.strip():
            continue
        here = _read_text(_soul_path(wd, r))
        if not here.strip():
            _write_text(_soul_path(wd, r), t[:SOUL_MAX])
            told[r] = "written"
        elif here != t:
            _keep_version(wd, r, t[:SOUL_MAX], "-from-backup")
            told[r] = "kept as a version"
    return told


# ---------------------------------------------------------------- the user's own templates of a world
def _wdir(wd):
    """KIT/writer/worlds: the worlds' JSON files, apart from the documents (the notebook lists every *.json beside them as a document)"""
    d = wd / "worlds"
    d.mkdir(exist_ok=True)
    return d


def _tpl_path(wd, realm):
    return _wdir(wd) / f"templates-{realm_of(realm)}.json"


def _user_templates(wd, realm):
    try:
        v = json.load(open(_tpl_path(wd, realm), encoding="utf-8"))
        return [t for t in v if isinstance(t, dict) and t.get("name")] if isinstance(v, list) else []
    except (OSError, ValueError):
        return []


def templates(wd, realm):
    base = CREATOR["templates"] if realm == "creator" else READER["templates"]
    out = [{"id": t[0], "label": t[1], "request": t[2] if len(t) > 2 else "", "skeleton": t[3] if len(t) > 3 else "", "builtin": True} for t in base]
    out += [{"id": "u:" + t["name"], "label": t["name"], "request": t.get("request") or "", "skeleton": t.get("skeleton") or "", "builtin": False,
             "saved": t.get("saved")} for t in _user_templates(wd, realm)]
    return out


def template_put(wd, realm, data, name_check=None):
    name = str(data.get("name") or "").strip()
    if not name or len(name) > 80:
        raise ValueError("a template's name: 1–80 characters")
    kept = [t for t in _user_templates(wd, realm) if t.get("name") != name]
    if not data.get("delete"):
        if name_check and not any(t.get("name") == name for t in _user_templates(wd, realm)):
            name_check(name, 80)                      # HERESY 2462: a new name keeps the names' rule
        req, sk = str(data.get("request") or "")[:20000], str(data.get("skeleton") or "")[:60000]
        if not req.strip() and not sk.strip():
            raise ValueError("a template is a request, a skeleton or both")
        kept.append({"name": name, "request": req, "skeleton": sk, "saved": time.strftime("%Y-%m-%d %H:%M")})
        kept.sort(key=lambda t: t["name"].lower())
    p = _tpl_path(wd, realm)
    tmp = Path(str(p) + ".part")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(kept, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)
    return {"realm": realm, "templates": templates(wd, realm)}


# ---------------------------------------------------------------- a world as a whole
def _engine_tags():
    out = {}
    for f in sorted((HERE / "reader_engines").glob("*/engine.json")):
        try:
            e = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        tg = e.get("tags") or {}
        if not tg.get("open"):
            continue
        groups = [g for g in tg.get("groups") or [] if isinstance(g, dict)]
        out[e.get("id") or f.parent.name] = {"label": e.get("label") or f.parent.name, "open": tg.get("open"), "close": tg.get("close"),
                                              "sentence": [str(i) for g in groups if g.get("place") != "inline" for i in g.get("items") or []],
                                              "inline": [str(i) for g in groups if g.get("place") == "inline" for i in g.get("items") or []]}
    return out


def charter():
    """the Narrator world's charter as the model gets it: the file's leading HTML comment (its DRAFT mark for Viktor) left out"""
    return re.sub(r"^\s*<!--.*?-->\s*", "", _read_text(CHARTER), flags=re.S).strip()


def world(wd, realm):
    W = CREATOR if realm_of(realm) == "creator" else READER
    s = soul(wd, realm)
    out = {"realm": realm, "charter": "", "charter_draft": False,
           "soul": {"text": s["text"], "updated": s["updated"], "versions": len(s["versions"])}, "soul_heading": SOUL_HEADING, "system": "",
           "tasks": [{"id": t[0], "label": t[1]} for t in W["tasks"]], "chips": [{"label": c[0], "brief": c[1]} for c in W["chips"]],
           "templates": templates(wd, realm), "lyric_tasks": list(W["lyric_tasks"]), "schema": W["schema"], "fields": dict(W["fields"]),
           "tools": list(W["tools"])}
    if realm == "reader":
        ch = charter()
        own = s["text"].strip()
        out.update(charter=ch, charter_draft=CHARTER_DRAFT, tags=_engine_tags(),
                   system=ch + ("\n\n" + SOUL_HEADING + "\n" + own if own else ""))
    return out


# ---------------------------------------------------------------- 2487: the one-time migration
NAME_LINE = re.compile(r"^\s*[^\s:\[\]()][^:\[\]]{0,40}:\s+\S")


def _state_path(wd):
    return _wdir(wd) / "state.json"


def state(wd):
    try:
        v = json.load(open(_state_path(wd), encoding="utf-8"))
        return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}


def _state_put(wd, st):
    p = _state_path(wd)
    tmp = Path(str(p) + ".part")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(st, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


def reasons(doc):
    text = str(doc.get("lyrics") or "")
    lines = [l for l in text.split("\n") if l.strip()]
    sections = sum(1 for l in lines if l.strip().startswith("[") and "]" in l and not l.strip().lower().startswith("[split]"))
    named = sum(1 for l in lines if NAME_LINE.match(l))
    why = []
    if not sections:
        why.append("no_sections")
    if len(text) > LONG:
        why.append("long")
    if lines and named / len(lines) >= 0.6:
        why.append("dialog")
    if "lcv" in str(doc.get("title") or "").lower():
        why.append("lcv")
    if isinstance(doc.get("from_reader"), dict):
        why.append("sent")
    pretick = not sections and any(w in why for w in ("long", "dialog", "sent"))
    return why, sections, pretick


def candidates(docs, wd):
    out = []
    for d in docs:
        if not isinstance(d, dict) or not d.get("id"):
            continue
        if d.get("realm") in REALMS:                    # a world set (by hand or by «Read in the Narrator»): never a candidate
            continue
        why, sections, pretick = reasons(d)
        if why:
            out.append({"id": d["id"], "title": d.get("title") or "Untitled", "chars": len(str(d.get("lyrics") or "")), "updated": d.get("updated"),
                        "reasons": why, "sections": sections, "pretick": pretick})
    out.sort(key=lambda c: (not c["pretick"], -(c["updated"] or 0)))
    return {"done": state(wd).get("migrated_at"), "candidates": out}


def mark_migrated(wd, ids):
    st = state(wd)
    st["migrated_at"] = time.time()
    st["migrated"] = sorted(set(st.get("migrated") or []) | set(ids))
    _state_put(wd, st)
    return st["migrated_at"]


def first_line(text):
    for l in str(text or "").split("\n"):
        l = l.strip().strip("#").strip()
        if l and not l.startswith("["):
            return l[:120]
    return ""
