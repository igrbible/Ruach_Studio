"""HERESY 1504 (Viktor 15.10.2026: likes, dislikes and stars on the branch and stem rows of the compare window): a take's marks on
the files made from it, kept beside them in outputs/TAKE/derived/marks.json as {path: {"rating": 1 or -1, "fav": true}}. A file with
neither has no entry; the entry of a file deleted since is left out when read and dropped at the next mark. The path is the file's
own, as the tree names it (derived/ID/FILE), and must be a file inside the take's derived/."""
import json
import os
from pathlib import Path

NAME = "marks.json"


def read(d):
    d = Path(d)
    try:
        m = json.load(open(d / "derived" / NAME, encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(m, dict):
        return {}
    return {k: v for k, v in m.items() if isinstance(v, dict) and (d / k).is_file()}


def mark(d, rel, rating=None, fav=None):
    """The mark of one file changed (rating 1, -1 or 0 for none; fav true or false; None leaves either as it is); all the take's marks back."""
    d = Path(d)
    base = (d / "derived").resolve()
    p = (d / str(rel)).resolve()
    if base not in p.parents or not p.is_file() or p.name in (NAME, NAME + ".tmp"):
        raise ValueError(f"{rel} is no file made from this take")
    rel = str(p.relative_to(d.resolve()))
    marks = read(d)
    e = dict(marks.get(rel) or {})
    if rating is not None:
        r = int(rating)
        if r not in (-1, 0, 1):
            raise ValueError("a rating is 1, -1 or 0")
        if r:
            e["rating"] = r
        else:
            e.pop("rating", None)
    if fav is not None:
        if fav:
            e["fav"] = True
        else:
            e.pop("fav", None)
    if e:
        marks[rel] = e
    else:
        marks.pop(rel, None)
    tmp = base / (NAME + ".tmp")
    tmp.write_text(json.dumps(marks, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, base / NAME)
    return marks
