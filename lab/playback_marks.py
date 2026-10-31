"""HERESY 1852 (Viktor 29.10.2026: «Нужен реестр/протокол по проигрышам. Запоминать место в проигрывании трека, если с него на другой перескочил, а
потом обратно, чтобы с начала не начинался тот, который уже играл. Запоминать последние, скажем, сотню треков, и сторожа на этот файл
реестра/протокола, чтобы при удалении трека из Студии вычищалась его запись»): where the player left each take, the last hundred, in the user's
playback.json. Its guard: a take gone from the outputs (deleted, or moved to the trash) has no line there; the trash's move forgets its takes at once,
and every read drops a take that is no longer in the outputs, whoever took it away."""
import json
import os
import threading
import time
from pathlib import Path

KEEP = 100
_lock = threading.Lock()


def _path(config_dir):
    return Path(config_dir) / "playback.json"


def _load(p):
    try:
        d = json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {n: v for n, v in d.items() if isinstance(v, dict) and isinstance(v.get("at"), (int, float))} if isinstance(d, dict) else {}


def _save(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def _here(outputs, name):
    return bool(name) and "/" not in name and not name.startswith(".") and (Path(outputs) / name / "request.json").is_file()


def listing(config_dir, outputs):
    """The marks of the takes still in the outputs; the others are dropped from the file as they are found."""
    p = _path(config_dir)
    with _lock:
        d = _load(p)
        kept = {n: v for n, v in d.items() if _here(outputs, n)}
        if len(kept) != len(d) and p.is_file():
            _save(p, kept)
    return kept


def mark(config_dir, outputs, name, at, seconds=0):
    """Where the player left a take (seconds), or None to forget it (played to its end, left at its start); the newest hundred are kept."""
    name = str(name or "")
    if not _here(outputs, name):
        raise FileNotFoundError(f"no take {name}")
    at = None if at is None else float(at)
    p = _path(config_dir)
    with _lock:
        d = _load(p)
        d.pop(name, None)
        if at is not None and at >= 1:
            d[name] = {"at": round(at, 2), "seconds": round(float(seconds or 0), 2), "ts": int(time.time())}
        if len(d) > KEEP:
            d = dict(sorted(d.items(), key=lambda kv: kv[1].get("ts", 0))[-KEEP:])
        _save(p, d)
    return d.get(name)


def forget(config_dir, names):
    """The takes gone from the studio (the trash's move): their lines go at once."""
    p = _path(config_dir)
    with _lock:
        d = _load(p)
        gone = [n for n in names if n in d]
        for n in gone:
            del d[n]
        if gone:
            _save(p, d)
    return gone
