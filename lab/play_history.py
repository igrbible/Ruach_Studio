"""HERESY 2912 (Viktor 20.11.2026: «историю проигрывания треков, но не с бесконечным списком… сегментация по дням, кнопка очистки истории… И ещё…
история скачиваний»): what the player played and what was downloaded, kept by the lab in the user's history.json (history-SCOPE.json for a page
opened with ?scope=SCOPE, so a test page never writes into Viktor's). Bounded: the plays of the last 30 days and at most 2000 of them, the downloads of
the last 90 days and at most 1000; the oldest go first, at every write and every read.

Why the lab and not the page's yue2.* keys: two thousand plays are some 300 KB, and the settings file is read whole and at once before the page
starts (heresy-settings.js), and sent again whenever a key changes; this file is read only when the history is opened, and one play is one small
write. It follows the Studio, not the browser: the installed app, a tab and another computer see one history.

A play: {id, t (its start, epoch seconds), name, title (as it was then: a take deleted later still says what it was), of (its length), heard (the
seconds it played), left (the moment it stopped at), through (it reached its end), loops (repeat one: the times it began again in the same hearing)}. A download: {id, t, name (the
take, or "" for a file of no take), title, file (the name it was saved under), fmt (its kind, from the file's ending)}. Ops: play, heard, download,
clear {kind: plays|downloads}, drop {kind, ids}, import {plays, downloads} (what a page kept itself while the lab did not know this path)."""
import json
import os
import re
import threading
import time
from pathlib import Path

KEEP = {"plays": (30 * 86400, 2000), "downloads": (90 * 86400, 1000)}
_lock = threading.Lock()
_ID = re.compile(r"[A-Za-z0-9_-]{1,40}")


def _load(p):
    try:
        d = json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    d = d if isinstance(d, dict) else {}
    return {k: [x for x in d.get(k) or [] if isinstance(x, dict) and _ID.fullmatch(str(x.get("id", "")))] for k in KEEP}


def _save(p, d):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


def _trim(d, now):
    """The kept window of each kind: newer than its days and no more than its count (the newest kept). True when anything went."""
    gone = False
    for k, (age, most) in KEEP.items():
        rows = sorted((x for x in d[k] if now - float(x.get("t") or 0) <= age), key=lambda x: float(x.get("t") or 0))[-most:]
        if len(rows) != len(d[k]):
            gone = True
        d[k] = rows
    return gone


def _num(v, lo, hi, dflt=0.0):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return dflt
    return dflt if v != v else max(lo, min(hi, v))


def _text(v, most):
    return str(v or "")[:most]


def _play(x, now):
    return {"id": str(x["id"]), "t": round(_num(x.get("t"), 0, now + 60, now), 2), "name": _text(x.get("name"), 200), "title": _text(x.get("title"), 300),
            "of": round(_num(x.get("of"), 0, 86400), 2), "heard": round(_num(x.get("heard"), 0, 864000), 2), "through": bool(x.get("through")),
            "loops": int(_num(x.get("loops"), 0, 100000)), "left": round(_num(x.get("left"), 0, 86400), 2)}


def _download(x, now):
    return {"id": str(x["id"]), "t": round(_num(x.get("t"), 0, now + 60, now), 2), "name": _text(x.get("name"), 200), "title": _text(x.get("title"), 300),
            "file": _text(x.get("file"), 300), "fmt": _text(x.get("fmt"), 16).lower()}


def _ok_id(x):
    if not isinstance(x, dict) or not _ID.fullmatch(str(x.get("id", ""))):
        raise ValueError("an id of letters, digits, - and _ (40 at most)")
    return x


def listing(path):
    now = time.time()
    with _lock:
        d = _load(path)
        if _trim(d, now) and Path(path).is_file():
            _save(path, d)
    return dict(d, keep={k: {"days": a // 86400, "most": m} for k, (a, m) in KEEP.items()})


def act(path, body):
    """One op on the file; returns what it changed."""
    op, now = str(body.get("op") or ""), time.time()
    with _lock:
        d = _load(path)
        out = {}
        if op == "play":
            x = _play(_ok_id(body), now)
            if not any(r["id"] == x["id"] for r in d["plays"]):   # sent twice (a retry): kept once
                d["plays"].append(x)
            out = {"play": x}
        elif op == "heard":
            _ok_id(body)
            r = next((r for r in d["plays"] if r["id"] == str(body["id"])), None)
            if r is None:
                out = {"play": None}
            else:
                r["heard"] = round(max(float(r.get("heard") or 0), _num(body.get("heard"), 0, 864000)), 2)
                r["through"] = bool(r.get("through")) or bool(body.get("through"))
                r["loops"] = max(int(r.get("loops") or 0), int(_num(body.get("loops"), 0, 100000)))
                if body.get("left") is not None:              # where the hearing stopped (the last moment it played)
                    r["left"] = round(_num(body.get("left"), 0, 86400), 2)
                if body.get("of") is not None:
                    r["of"] = round(_num(body.get("of"), 0, 86400), 2)
                out = {"play": r}
        elif op == "download":
            x = _download(_ok_id(body), now)
            if not any(r["id"] == x["id"] for r in d["downloads"]):
                d["downloads"].append(x)
            out = {"download": x}
        elif op == "clear":
            kinds = list(KEEP) if body.get("kind") == "all" else [str(body.get("kind") or "")]
            if any(k not in KEEP for k in kinds):
                raise ValueError("kind: plays, downloads or all")
            out = {"cleared": {k: len(d[k]) for k in kinds}}
            for k in kinds:
                d[k] = []
        elif op == "drop":
            k = str(body.get("kind") or "")
            if k not in KEEP:
                raise ValueError("kind: plays or downloads")
            ids = {str(i) for i in body.get("ids") or []}
            before = len(d[k])
            d[k] = [r for r in d[k] if r["id"] not in ids]
            out = {"dropped": before - len(d[k])}
        elif op == "import":
            n = {}
            for k, make in (("plays", _play), ("downloads", _download)):
                have = {r["id"] for r in d[k]}
                rows = [make(x, now) for x in body.get(k) or [] if isinstance(x, dict) and _ID.fullmatch(str(x.get("id", ""))) and str(x.get("id")) not in have]
                d[k].extend(rows)
                n[k] = len(rows)
            out = {"imported": n}
        else:
            raise ValueError("op: play, heard, download, clear, drop or import")
        _trim(d, now)
        _save(path, d)
    return out
