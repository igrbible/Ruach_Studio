"""HERESY 1527 (Viktor 17.10.2026: «У Огранщика также добавь удаление ненужного артефакта, чтобы не плодить мусорку в пайплайне»): a
branch made from a take (outputs/TAKE/derived/ID/ with its manifest) taken off the tree into the take's own derived/.trash/, as it was,
from where it comes back; a branch other branches were made from goes with them or not at all (HasChildren names them, so the page can
ask); the trash is emptied only when asked, and that is the only thing here that deletes."""
import json
import re
import shutil
import time
from pathlib import Path

ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,160}")


class HasChildren(ValueError):
    def __init__(self, kids):
        super().__init__(f"{len(kids)} branches were made from it")
        self.kids = kids


def _manifests(d):
    out = {}
    for m in sorted(d.glob("*/manifest.json")) if d.is_dir() else []:
        try:
            out[m.parent.name] = json.load(open(m, encoding="utf-8"))
        except ValueError:
            continue
    return out


def _parent(man):
    p = re.match(r"^derived/([^/]+)", str(man.get("source") or man.get("set") or ""))
    return p.group(1) if p else ""


def children(take, bid):
    """every branch made from bid, and from those, down"""
    ms, out = _manifests(Path(take) / "derived"), []

    def walk(x):
        for k, m in ms.items():
            if k != x and k not in out and _parent(m) == x:
                out.append(k)
                walk(k)
    walk(bid)
    return out


def delete(take, bid, with_children=False):
    d = Path(take) / "derived"
    if not ID_RE.fullmatch(str(bid or "")) or not (d / bid / "manifest.json").is_file():
        raise ValueError(f"no branch {bid} in this take")
    kids = children(take, bid)
    if kids and not with_children:
        raise HasChildren(kids)
    t = d / ".trash"
    t.mkdir(exist_ok=True)
    moved = []
    for x in [bid] + kids:
        dest = t / x
        if dest.exists():                                  # the same id deleted before and made again
            dest = t / f"{x}.{int(time.time() * 1000)}"
        shutil.move(str(d / x), str(dest))
        json.dump({"at": time.time(), "with": bid if x != bid else ""}, open(dest / ".deleted.json", "w", encoding="utf-8"))
        moved.append(dest.name)
    return moved


def listing(take):
    t = Path(take) / "derived" / ".trash"
    out = []
    for m in sorted(t.glob("*/manifest.json")) if t.is_dir() else []:
        try:
            man = json.load(open(m, encoding="utf-8"))
        except ValueError:
            continue
        try:
            gone = json.load(open(m.parent / ".deleted.json", encoding="utf-8"))
        except (OSError, ValueError):
            gone = {}
        out.append({"trash_id": m.parent.name, "id": man.get("id") or m.parent.name, "kind": man.get("kind", ""), "created": man.get("created", ""),
                    "mode": man.get("mode", ""), "deleted": gone.get("at"), "with": gone.get("with", ""), "manifest": man})
    out.sort(key=lambda x: -(x["deleted"] or 0))
    return out


def restore(take, tid):
    d = Path(take) / "derived"
    src = d / ".trash" / str(tid or "")
    if not ID_RE.fullmatch(str(tid or "")) or not (src / "manifest.json").is_file():
        raise ValueError(f"no branch {tid} in this take's trash")
    try:
        bid = json.load(open(src / "manifest.json", encoding="utf-8")).get("id") or src.name
    except ValueError:
        bid = src.name
    if not ID_RE.fullmatch(str(bid)) or (d / bid).exists():
        raise ValueError(f"a branch {bid} is on the tree already")
    (src / ".deleted.json").unlink(missing_ok=True)
    shutil.move(str(src), str(d / bid))
    return bid


def empty(take):
    """the take's trash gone for good: only when the page has asked"""
    t = Path(take) / "derived" / ".trash"
    n = len([p for p in t.iterdir() if p.is_dir()]) if t.is_dir() else 0
    if t.is_dir():
        shutil.rmtree(t)
    return n
