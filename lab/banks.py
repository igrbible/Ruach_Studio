"""HERESY 2006 (Viktor 01.11.2026: «подключать… банки эффектов или инструментов в SFZ формате… Сразу определить путь хранилища таких банков, выбор
доступных из списка, их описания с полным инфо, что это за банка или консерва»): the shelf of banks.

Three places, one shelf:
  banks/<name>/            the user's own banks (made by the Bank Builder, or put there by hand): an .sfz or more, its samples, bank.json
  models/ambient/<layer>/  the ambient layers' banks (HERESY 1927–1928): field recordings, each with its source, recordist and licence
  models/instruments/…     the instrument sets the MIDI orchestra plays (VCSL, VSCO 2, Sonatina, sfzinstruments' collections…), read only
A bank's card: id, name, kind (instrument · ambience · effect · drone · voice), where, its .sfz files, author, licence, whether it may ship, its
source, a description, how many samples and how large. A user bank says these in its bank.json; the others are read from what they hold (a
LICENSE or README, the ambient bank.json). A licence not found is said as unknown, never guessed as free.
    import banks; banks.shelf(KIT) → [card, …];  banks.card(KIT, id) → card"""
import json
import re
import time
from pathlib import Path

KINDS = ("instrument", "ambience", "effect", "drone", "voice")
AUDIO = {".wav", ".flac", ".ogg", ".aif", ".aiff"}
_CACHE = {}

# what a LICENSE or README says, the first match wins
LICENCES = [
    (r"\bCC0\b|creativecommons\.org/publicdomain/zero|Creative Commons Zero|No Rights Reserved", "CC0", True),
    (r"public\s*domain|publicdomain/mark", "Public domain", True),
    (r"Attribution[- ]ShareAlike|CC[- ]BY[- ]SA|by-sa/", "CC BY-SA", True),
    (r"Attribution[- ]NonCommercial|CC[- ]BY[- ]NC|by-nc", "CC BY-NC", False),
    (r"Creative Commons Attribution|CC[- ]BY\b|licenses/by/", "CC BY", True),
    (r"GNU General Public License|\bGPL\b", "GPL", False),
    (r"\bMIT License\b|Permission is hereby granted, free of charge", "MIT", True),
    (r"Sampling\s*Plus", "CC Sampling Plus", False),
]


def licence_of(text):
    for rx, name, ships in LICENCES:
        if re.search(rx, text or "", re.I):
            return name, ships
    return "unknown", False


def _read(p, n=6000):
    try:
        return p.read_text(encoding="utf-8", errors="replace")[:n]
    except OSError:
        return ""


def _papers(d, depth=3):
    """A folder's LICENSE and README files, the nearest first."""
    out = []
    for p in sorted(d.rglob("*"), key=lambda q: len(q.parts)):
        if len(p.relative_to(d).parts) > depth:
            break
        if p.is_file() and re.match(r"(licen[cs]e|copying|readme)", p.name, re.I) and p.suffix.lower() in ("", ".txt", ".md", ".rtf"):
            out.append(p)
    return out


def _describe(text):
    """A README's first real paragraph, a line or two."""
    for para in re.split(r"\n\s*\n", text or ""):
        s = re.sub(r"[-=~]{3,}|[#*_`>\[\]]", " ", para).strip()
        if len(s) > 40 and not re.match(r"(copyright|licen|this (work|software) is)", s, re.I):
            return re.sub(r"\s+", " ", s)[:400]
    return ""


def _size(d):
    n, b = 0, 0
    for p in d.rglob("*"):
        if p.is_file() and p.suffix.lower() in AUDIO:
            n += 1
            try:
                b += p.stat().st_size
            except OSError:
                pass
    return n, round(b / 1e6, 1)


def _user(kit):
    root = Path(kit) / "banks"
    out = []
    for d in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")) if root.is_dir() else []:   # HERESY 2031: a bank made again steps aside as .NAME.date.old
        meta = {}
        if (d / "bank.json").is_file():
            try:
                meta = json.loads((d / "bank.json").read_text(encoding="utf-8"))
            except ValueError:
                meta = {"said": "its bank.json does not read"}
        lic, ships = (meta.get("licence"), bool(meta.get("may_ship"))) if meta.get("licence") else licence_of(" ".join(_read(p) for p in _papers(d)))
        n, mb = _size(d)
        out.append({"id": "user:" + d.name, "name": meta.get("name") or d.name, "kind": meta.get("kind") if meta.get("kind") in KINDS else "effect",
                    "where": "banks/" + d.name, "sfz": sorted(str(p.relative_to(d)) for p in d.rglob("*.sfz")), "author": meta.get("author", ""),
                    "licence": lic, "may_ship": ships, "source": meta.get("source", ""), "description": meta.get("description", ""),
                    "samples": n, "mb": mb, "own": True, "range": meta.get("range") if isinstance(meta.get("range"), list) else None})   # HERESY 2031
    return out


def _ambient(kit):
    root = Path(kit) / "models" / "ambient"
    out = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()) if root.is_dir() else []:
        f = d / "bank.json"
        if not f.is_file():
            continue
        try:
            items = json.loads(f.read_text(encoding="utf-8")).get("items", [])
        except ValueError:
            continue
        items = [i for i in items if not i.get("refused")]
        public = [i for i in items if i.get("public")]
        lics = sorted({i.get("licence", "") for i in items if i.get("licence")})
        n, mb = _size(d)
        out.append({"id": "ambient:" + d.name, "name": d.name.capitalize(), "kind": "ambience", "where": "models/ambient/" + d.name, "sfz": [],
                    "author": ", ".join(sorted({i.get("recordist", "") for i in items if i.get("recordist")}))[:200],
                    "licence": "; ".join(sorted({licence_of(x)[0] for x in lics})) or "unknown", "may_ship": bool(items) and len(public) == len(items),
                    "source": "radio aporee on the Internet Archive" if any("aporee" in i.get("source", "") for i in items) else "",
                    "description": f"{len(items)} pieces of field recordings ({len(public)} free to ship): " + "; ".join(i.get("title", "") for i in items[:3])[:300],
                    "samples": n, "mb": mb, "own": False})
    return out


def _instruments(kit):
    root = Path(kit) / "models" / "instruments"
    out = []
    for s in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("_")) if root.is_dir() else []:
        # a collection of collections (sfzinstruments): each its own bank, with its own licence
        units = [c for c in sorted(s.iterdir()) if c.is_dir()] if s.name == "sfzinstruments" else [s]
        for d in units:
            sfz = sorted(str(p.relative_to(root)) for p in d.rglob("*.sfz"))
            if not sfz:
                continue
            papers = _papers(d)
            text = " ".join(_read(p) for p in papers)
            lic, ships = licence_of(text)
            readme = next((p for p in papers if p.name.lower().startswith("readme")), None)
            n, mb = _size(d)
            out.append({"id": "inst:" + str(d.relative_to(root)), "name": d.name.replace("-", " ").replace("_", " "), "kind": "instrument",
                        "where": "models/instruments/" + str(d.relative_to(root)), "sfz": sfz[:400], "sfz_count": len(sfz), "author": "",
                        "licence": lic, "may_ship": ships, "source": "", "description": _describe(_read(readme)) if readme else "",
                        "samples": n, "mb": mb, "own": False})
    return out


def shelf(kit, fresh=False):
    """Every bank on the shelf, the user's first; kept five minutes (thousands of files)."""
    hit = _CACHE.get(str(kit))
    if hit and not fresh and time.time() - hit[0] < 300:
        return hit[1]
    out = _user(kit) + _ambient(kit) + _instruments(kit)
    _CACHE[str(kit)] = (time.time(), out)
    return out


def card(kit, bank_id):
    for c in shelf(kit):
        if c["id"] == bank_id:
            return c
    raise ValueError(f"no bank {bank_id} on the shelf")
