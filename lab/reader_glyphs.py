"""HERESY 2270 (Viktor 09.11.2026: «гони сегодня Чтеца с Видеографом по максимуму»): the Reader's glyph map, how the letters of LCV are read.
Its source is Viktor's own table, heresy/MISC/claude-arc/reader/lcvr/lcvr2tts.map.tsv, which he edits by hand and lcvr2tts.sh reads: the Studio
reads it and never writes it. The room's editor keeps a user's copy in user/reader/glyphs.map.tsv (said so in the room); while that copy is
there it is the one applied, and Reset lets it go so his table is read again.

The format is his (one rule a line, the fields by TAB): kind, what, with, note; kind lit (a literal substring, wherever it stands), word (a whole
word: its neighbours are neither letters nor the acute) or re (gawk's ERE: \\1…\\9 its groups, & the whole match, \\& a literal ampersand). An
empty «with» takes it out. A line starting with # is a comment, blank lines are skipped. The order matters: the rules go top to bottom over
the text. The acute U+0301 is never touched by the map itself (his rule); a user's rule that would remove it is refused.

HERESY 2376 (Viktor 11.11.2026: «Я ещё должен мой кастомный LCV словарь замен поправить. Дай мне его для редактирования прямо в Студии»): the
room's editor now writes the table it read, his where his is the one applied, a user's copy everywhere else (a release carries no table of
his: the editor is the user's own replacement map there). Every save keeps the file as it was in user/reader/glyphs-backups/ with the time
in its name (50 kept per table), Undo puts the newest of them back and keeps what it replaced in glyphs-backups/undone/; nothing is deleted.
A broken rule is refused by its line before anything is written. Try reads a line by the map in the editor, saved or not."""
import re
import time
from pathlib import Path

KINDS = ("lit", "word", "re")
ACUTE = "́"
TEXT_MAX = 200_000


def his_path(kit):
    return Path(kit) / "heresy" / "MISC" / "claude-arc" / "reader" / "lcvr" / "lcvr2tts.map.tsv"


def user_path(kit):
    return Path(kit) / "user" / "reader" / "glyphs.map.tsv"


def _template(t):
    """gawk's replacement (\\1…\\9, &, \\&) as a list of parts: str or int (a group; 0 the whole match)."""
    out, i, buf = [], 0, ""
    while i < len(t):
        c = t[i]
        if c == "\\" and i + 1 < len(t) and (t[i + 1].isdigit() or t[i + 1] in "&\\"):
            n = t[i + 1]
            if n.isdigit():
                if buf:
                    out.append(buf)
                    buf = ""
                out.append(int(n))
            else:
                buf += n
            i += 2
            continue
        if c == "&":
            if buf:
                out.append(buf)
                buf = ""
            out.append(0)
        else:
            buf += c
        i += 1
    if buf:
        out.append(buf)
    return out


def parse(text):
    """(rules, errors): each rule {line, kind, what, with, note, rx}; an error names its line and why."""
    rules, errors = [], []
    for n, line in enumerate(str(text or "").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        f = line.split("\t")
        kind = f[0].strip()
        if kind not in KINDS:
            errors.append(f"line {n}: the kind is lit, word or re, not «{kind[:20]}»")
            continue
        if len(f) < 2 or f[1] == "":
            errors.append(f"line {n}: what to read is empty")
            continue
        what, rep, note = f[1], f[2] if len(f) > 2 else "", "\t".join(f[3:]) if len(f) > 3 else ""
        if ACUTE in what and ACUTE not in rep and kind != "re":
            errors.append(f"line {n}: it would take the acute away (U+0301 is never removed)")
            continue
        try:
            if kind == "re":
                rx = re.compile(what)
            elif kind == "word":
                rx = re.compile(r"(?<![\w" + ACUTE + r"])" + re.escape(what) + r"(?![\w" + ACUTE + r"])")
            else:
                rx = None
        except re.error as e:
            errors.append(f"line {n}: the pattern does not compile ({e})")
            continue
        rules.append({"line": n, "kind": kind, "what": what, "with": rep, "note": note, "rx": rx, "tpl": _template(rep) if kind == "re" else None})
    return rules, errors


def load(kit):
    """The table applied now: the user's copy when there is one, else his; (text, rules, errors, source, path)."""
    for src, p in (("user", user_path(kit)), ("his", his_path(kit))):
        if p.is_file():
            text = p.read_text(encoding="utf-8")
            rules, errors = parse(text)
            return text, rules, errors, src, p
    return "", [], [], "none", None


def apply(rules, text):
    """The text with the rules applied top to bottom; (text, hits: {line: count}). A rule of the kind re that took an acute away is undone
    for that match (the acute is never removed)."""
    hits = {}
    for r in rules:
        if r["kind"] == "lit":
            k = text.count(r["what"])
            if k:
                text = text.replace(r["what"], r["with"])
        else:
            def sub(m, r=r):
                out = r["with"] if r["kind"] == "word" else "".join(x if isinstance(x, str) else (m.group(x) or "") for x in r["tpl"])
                return m.group(0) if m.group(0).count(ACUTE) > out.count(ACUTE) else out
            text, k = r["rx"].subn(sub, text)
        if k:
            hits[r["line"]] = hits.get(r["line"], 0) + k
    return text, hits


BACKUPS_MAX = 50


def backups_dir(kit):
    return Path(kit) / "user" / "reader" / "glyphs-backups"


def _target(kit, source):
    """The file a save writes: his table only where it is here, else the user's copy."""
    return his_path(kit) if source == "his" and his_path(kit).is_file() else user_path(kit)


def _stem(p):
    return "his" if p.name == "lcvr2tts.map.tsv" else "user"


def backups(kit, source):
    """The kept versions of a table, newest first: [{name, at, bytes}]."""
    d = backups_dir(kit)
    stem = "his" if source == "his" else "user"
    out = []
    for p in sorted(d.glob(stem + ".*.tsv"), reverse=True) if d.is_dir() else []:
        try:
            out.append({"name": p.name, "at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime)), "bytes": p.stat().st_size})
        except OSError:
            continue
    return out


def _keep(kit, p):
    """A copy of the table as it is now, before it is written over; the oldest let go past BACKUPS_MAX (into undone/, never deleted)."""
    if not p.is_file():
        return None
    d = backups_dir(kit)
    d.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    k = 1
    b = d / f"{_stem(p)}.{stamp}-{k:02d}.tsv"            # the counter keeps two saves of one second in their order
    while b.exists():
        k += 1
        b = d / f"{_stem(p)}.{stamp}-{k:02d}.tsv"
    b.write_bytes(p.read_bytes())
    old = sorted(d.glob(_stem(p) + ".*.tsv"))[:-BACKUPS_MAX]
    if old:
        (d / "undone").mkdir(exist_ok=True)
        for o in old:
            o.replace(d / "undone" / o.name)
    return b


def _write(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".part")
    tmp.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
    tmp.replace(p)


def save_to(kit, text, source):
    """The table written where it was read from (his or the user's copy), the old one kept first; a broken rule refuses the whole save.
    (path written, backup kept or None)."""
    text = str(text or "")
    if len(text) > TEXT_MAX:
        raise ValueError(f"the glyph map: {TEXT_MAX} characters at most")
    _rules, errors = parse(text)
    if errors:
        raise ValueError("; ".join(errors[:6]))
    p = _target(kit, source)
    if p.is_file() and p.read_text(encoding="utf-8") == (text if text.endswith("\n") else text + "\n"):
        return p, None
    b = _keep(kit, p)
    _write(p, text)
    return p, b


def undo(kit, source):
    """The newest kept version put back; what it replaced kept in undone/. (path, the version put back) or ValueError when none is kept."""
    p = _target(kit, source)
    d = backups_dir(kit)
    kept = sorted(d.glob(_stem(p) + ".*.tsv")) if d.is_dir() else []
    if not kept:
        raise ValueError("nothing to undo: no version of this table is kept")
    last = kept[-1]
    if p.is_file():
        (d / "undone").mkdir(exist_ok=True)
        (d / "undone" / f"{_stem(p)}.{time.strftime('%Y%m%d-%H%M%S')}.replaced.tsv").write_bytes(p.read_bytes())
    _write(p, last.read_text(encoding="utf-8"))
    (d / "undone").mkdir(exist_ok=True)
    last.replace(d / "undone" / last.name)
    return p, last.name


def trial(text, sample):
    """A line read by a map given as text (the editor's, saved or not): {text, hits: {line: n}, errors}."""
    rules, errors = parse(text)
    out, hits = apply(rules, str(sample or "")[:20000])
    return {"text": out, "hits": {str(k): v for k, v in hits.items()}, "errors": errors}


def save(kit, text):
    """The user's copy written (his table never): refused while a rule is broken, so a copy that cannot be read is never kept."""
    text = str(text or "")
    if len(text) > TEXT_MAX:
        raise ValueError(f"the glyph map: {TEXT_MAX} characters at most")
    _rules, errors = parse(text)
    if errors:
        raise ValueError("; ".join(errors[:6]))
    p = user_path(kit)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".part")
    tmp.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
    tmp.replace(p)
    return p


def reset(kit):
    user_path(kit).unlink(missing_ok=True)
