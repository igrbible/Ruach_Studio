"""HERESY 2083 (Viktor 05.11.2026: «в Движок умолчанием пропиши ежесуточный/ежечасовой бекап json данных пользователя, с предвыбранной ротацией gz
бекапов. Это когда-то, да спасёт кого-то от потери всего… А восстановление только при одном единственном условии — реально битые файлы настроек,
библиотеки и т.п.»): the user's data backed up, and put back only over a file that is truly broken.

What is kept (EVERY, and DAILY once a day): the JSON the Studio writes as its user's own state
  user/settings.json        the page's settings (the rooms' choices, the Creator's draft, where the work lives)
  user/presets.json         styles, setups, text profiles, briefs
  user/collection.json      the Librarian: workspaces and their sections, notes, ratings, pins, locks, frozen and protected takes, the playlist,
                            albums, reactions, the LoRA notes, the workspaces' notes
  user/playback.json        where the player left each take
  user/refiner_profiles.json, user/writer.json, user/access.json, user/audio.json, user/analog_loop.json, user/c2pa.json, user/gpus.json
  user/llm.json             the Writer's hosts and their Active switches (HERESY 2097; the OpenRouter key beside it, user/secrets.json, never kept here)
  user/vocab/*.json         the user's own vocabularies
  user/videos/*.json        the Videographer's plans
  user/plugins/*/plugin.json  the Refiner's steps of one's own
  writer/*.json             the Writer's documents
  writer-versions/*.json    the Creator's words on each Generate
  outputs/*/meta.json       each take's card (its title, ♥, time): in the daily snapshot only
Not kept: a take's request.json (its recipe, written once with the take, about 23 KB each; the lab's own edit of it is atomic), the caches (the
Modartt catalogs, perf.sqlite), the queues (regen-pending, api-filing, updates), a test page's files (settings-SCOPE.json, writer-SCOPE/), a secret (user/secrets.json, the OpenRouter key: HERESY 2097).

A snapshot is one .json.gz in user/backups/ (hourly-…, daily-…, now-…): {format, kind, at, made, files: {path: text}, skipped: {path: why}},
written whole (a .part, fsync, a rename) and read back before an older one of its kind goes. A file that does not parse is never stored: the
snapshot's read failing is a read failing, so it is put back first from the newest snapshot that holds it whole, and that copy goes in. Hourly
keeps 24, daily 30 (both on by default, user/backups/config.json), Back up now its last 10.

Put back only over a file truly broken (it does not parse, read twice half a second apart): at the lab's start, when the lab's read of the
settings, the presets or the Librarian fails, or a snapshot's read. The broken file is copied to user/backups/broken/NAME.STAMP (never deleted),
the newest snapshot's copy that parses takes its place in one rename, and a notice waits for the page to say once which file and from when.
No button puts a snapshot back.

    setup(kit, outputs) · start(kit, outputs) · snapshot(kind) · status() · configure(d) · seen(ids) · recover(path) · read_json(path)
    check_all() · write_text(path, text)
Standard library only: the suite's mock loads this file by itself."""
import gzip
import hashlib
import json
import os
import re
import shutil
import sys
import threading
import time
from pathlib import Path

FORMAT = "ruach.backup/1"
EVERY = ("user/settings.json", "user/presets.json", "user/collection.json", "user/playback.json", "user/refiner_profiles.json", "user/writer.json",
         "user/access.json", "user/audio.json", "user/analog_loop.json", "user/c2pa.json", "user/gpus.json", "user/llm.json", "user/vocab/*.json",
         "user/videos/*.json", "user/plugins/*/plugin.json", "writer/*.json", "writer-versions/*.json")
DAILY = ("outputs/*/meta.json",)
PERIOD = {"hourly": 3600, "daily": 86400}
DEFAULTS = {"hourly": True, "daily": True, "keep_hourly": 24, "keep_daily": 30}
KEEP_NOW = 10
BIG = 64 * 1024 * 1024          # a file larger than this is not a settings file: said, not stored
_NAME = re.compile(r"^(hourly|daily|now)-(\d{8}-\d{6})(?:-(\d+))?\.json\.gz$")
H = {"kit": None, "out": None, "dir": None, "thread": None, "files": {}}
SNAP_LOCK, FIX_LOCK, NOTE_LOCK, CFG_LOCK = threading.Lock(), threading.Lock(), threading.Lock(), threading.Lock()


def say(*a):
    print("[lab] backups:", *a, file=sys.stderr, flush=True)


def setup(kit, outputs=None):
    kit = Path(kit)
    H["kit"], H["out"], H["dir"] = kit, Path(outputs) if outputs else kit / "outputs", kit / "user" / "backups"
    return H["dir"]


def start(kit, outputs=None):
    """the start's check of every file kept, then a snapshot whenever one is due (looked at once a minute)"""
    setup(kit, outputs)
    if H["thread"] is None:
        H["thread"] = threading.Thread(target=_loop, name="backups", daemon=True)
        H["thread"].start()


def _loop():
    try:
        n = check_all()
        if n:
            say(f"{n} broken file(s) at the start, put back from the snapshots")
    except Exception as e:                      # noqa: BLE001  the snapshots go on whatever the check met
        say(f"the start's check failed: {e}")
    while True:
        try:
            due()
        except Exception as e:                  # noqa: BLE001
            say(f"a snapshot failed: {e}")
        time.sleep(60)


# ------------------------------------------------------------------ files
def write_text(path, text):
    """written whole and on the disk before it takes the file's place: a .part beside it, fsync, one rename"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)
    _sync_dir(p.parent)


def _sync_dir(d):
    try:                                        # the rename itself on the disk (not on Windows, where a folder does not open)
        fd = os.open(str(d), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        pass


def _read_whole(p):
    """(text, None) when the file reads as JSON, else (None, why)"""
    try:
        if p.stat().st_size > BIG:
            return None, "too large for a settings file"
        text = p.read_bytes().decode("utf-8")
        json.loads(text)
        return text, None
    except FileNotFoundError:
        return None, "gone"
    except (UnicodeDecodeError, ValueError) as e:
        return None, f"does not parse: {str(e)[:160]}"
    except OSError as e:
        return None, f"does not read: {e}"


def _rel(p):
    """the file's name in the snapshots (outputs/… for a take's card, else from the Studio's folder), or None when it is not under them"""
    a = Path(os.path.abspath(p))
    for base, pre in ((H["out"], "outputs/"), (H["kit"], "")):
        if base is None:
            continue
        for b in (Path(os.path.abspath(base)), base.resolve()):
            try:
                return pre + a.relative_to(b).as_posix()
            except ValueError:
                pass
        try:
            return pre + a.resolve().relative_to(base.resolve()).as_posix()
        except (ValueError, OSError):
            pass
    return None


def _kitrel(p):
    try:
        return Path(p).relative_to(H["kit"]).as_posix()
    except ValueError:
        return str(p)


def _path(rel):
    return H["out"] / rel[len("outputs/"):] if rel.startswith("outputs/") else H["kit"] / rel


def _listed(rel, daily=True):
    from fnmatch import fnmatchcase
    pats = EVERY + (DAILY if daily else ())
    return any(fnmatchcase(rel, pat) and rel.count("/") == pat.count("/") for pat in pats)


def targets(daily=False):
    """(name, path) of every file kept that is there now"""
    out = []
    for pat in EVERY + (DAILY if daily else ()):
        base, sub, pre = (H["out"], pat[len("outputs/"):], "outputs/") if pat.startswith("outputs/") else (H["kit"], pat, "")
        if base is None or not base.is_dir():
            continue
        for p in sorted(base.glob(sub)):
            rel = p.relative_to(base).as_posix()
            if any(part.startswith(".") for part in rel.split("/")) or not p.is_file():
                continue
            out.append((pre + rel, p))
    return out


# ------------------------------------------------------------------ snapshots
def config():
    c = dict(DEFAULTS)
    try:
        d = json.loads((H["dir"] / "config.json").read_text(encoding="utf-8"))
        if isinstance(d, dict):
            c.update({k: d[k] for k in DEFAULTS if k in d})
    except (OSError, ValueError, TypeError):
        pass
    return c


def configure(d):
    if not isinstance(d, dict):
        raise ValueError("expected {hourly, daily, keep_hourly, keep_daily}")
    with CFG_LOCK:
        c = config()
        for k in ("hourly", "daily"):
            if k in d:
                c[k] = bool(d[k])
        for k in ("keep_hourly", "keep_daily"):
            if k in d:
                n = int(d[k])
                if not 1 <= n <= 1000:
                    raise ValueError("keep 1 to 1000 snapshots")
                c[k] = n
        write_text(H["dir"] / "config.json", json.dumps(c, indent=1))
    for kind in ("hourly", "daily"):
        prune(kind)
    return status()


def snapshots(kind=None):
    """the snapshots in the folder, newest first: {name, kind, at, size, path}"""
    d, out = H["dir"], []
    if d is None or not d.is_dir():
        return out
    for f in d.iterdir():
        m = _NAME.match(f.name)
        if not m or (kind and m.group(1) != kind) or not f.is_file():
            continue
        st = f.stat()
        out.append({"name": f.name, "kind": m.group(1), "at": st.st_mtime, "size": st.st_size, "path": f, "n": (m.group(2), int(m.group(3) or 0))})
    out.sort(key=lambda s: (s["at"], s["n"]), reverse=True)     # two in one second: by their number
    return out


def _load_snap(path):
    with open(path, "rb") as f:
        doc = json.loads(gzip.decompress(f.read()).decode("utf-8"))
    if not isinstance(doc, dict) or doc.get("format") != FORMAT or not isinstance(doc.get("files"), dict):
        raise ValueError("not a snapshot of the Studio's")
    return doc


def snapshot(kind="now"):
    if kind not in ("hourly", "daily", "now"):
        raise ValueError("kind is hourly, daily or now")
    with SNAP_LOCK:
        d = H["dir"]
        d.mkdir(parents=True, exist_ok=True)
        files, skipped = {}, {}
        for rel, p in targets(daily=kind in ("daily", "now")):
            text, why = _read_whole(p)
            if why and why != "gone" and why.startswith("does not parse") and recover(p, "a snapshot's read"):
                text, why = _read_whole(p)
            if why:
                if why != "gone":
                    skipped[rel] = why
                continue
            files[rel] = text
        now = time.time()
        doc = {"format": FORMAT, "kind": kind, "at": now, "made": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
               "files": files, "skipped": skipped}
        stem, n = f"{kind}-{time.strftime('%Y%m%d-%H%M%S', time.localtime(now))}", 0
        name = stem + ".json.gz"
        while (d / name).exists():
            n += 1
            name = f"{stem}-{n}.json.gz"
        data = gzip.compress(json.dumps(doc, ensure_ascii=False).encode("utf-8"), compresslevel=6, mtime=0)
        part = d / (name + ".part")
        try:
            with open(part, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            back = _load_snap(part)                       # read back whole before it counts
            if sorted(back["files"]) != sorted(files):
                raise ValueError("the snapshot read back differs")
            os.replace(part, d / name)
            _sync_dir(d)
        except BaseException:
            try:
                part.unlink()
            except OSError:
                pass
            raise
        gone = prune(kind)
        if skipped:
            say(f"{name}: {len(skipped)} file(s) not stored: " + "; ".join(f"{k} ({v})" for k, v in list(skipped.items())[:5]))
        return {"name": name, "kind": kind, "at": now, "size": len(data), "files": len(files), "skipped": skipped, "pruned": gone}


def prune(kind):
    """the oldest of a kind past its count go; never the one just written, read back whole"""
    c = config()
    keep = KEEP_NOW if kind == "now" else int(c.get("keep_" + kind) or DEFAULTS["keep_" + kind])
    gone = []
    for s in snapshots(kind)[max(1, keep):]:
        try:
            s["path"].unlink()
            gone.append(s["name"])
        except OSError:
            pass
    return gone


def due():
    """a snapshot of each kind on and older than its period (a minute of slack)"""
    c, now, made = config(), time.time(), []
    for kind in ("daily", "hourly"):
        if not c[kind]:
            continue
        last = snapshots(kind)
        if not last or now - last[0]["at"] >= PERIOD[kind] - 60:
            made.append(snapshot(kind))
    return made


# ------------------------------------------------------------------ putting back
def _notes():
    try:
        d = json.loads((H["dir"] / "notices.json").read_text(encoding="utf-8"))
        return d.get("notices", []) if isinstance(d, dict) else []
    except (OSError, ValueError):
        return []


def _note(n):
    with NOTE_LOCK:
        notes = [x for x in _notes() if not (n.get("restored") is False and x.get("file") == n["file"] and x.get("restored") is False)]
        notes.append(n)
        write_text(H["dir"] / "notices.json", json.dumps({"notices": notes[-50:]}, ensure_ascii=False, indent=1))


def seen(ids):
    ids = set(str(i) for i in (ids or []))
    with NOTE_LOCK:
        notes = _notes()
        for n in notes:
            if n.get("id") in ids:
                n["seen"] = True
        write_text(H["dir"] / "notices.json", json.dumps({"notices": notes[-50:]}, ensure_ascii=False, indent=1))
    return status()


def recover(path, why="a read"):
    """True when the file reads whole now: read again half a second later, or put back from the newest snapshot that holds it whole;
    False when it is not a file kept here, or no snapshot holds it whole (then it stays as it is, and the page is told once)"""
    if H["kit"] is None:
        return False
    p = Path(path)
    rel = _rel(p)
    if rel is None or not _listed(rel):
        return False
    with FIX_LOCK:
        time.sleep(0.5)                                   # a writer's rename on its way, a read half done: read again first
        text, bad = _read_whole(p)
        if not bad:
            return True
        if bad == "gone" or bad.startswith("too large"):
            return False
        for s in snapshots():
            try:
                body = _load_snap(s["path"])["files"].get(rel)
                if body is None:
                    continue
                json.loads(body)
            except (OSError, ValueError, EOFError):
                continue
            stamp = time.strftime("%Y%m%d-%H%M%S")
            aside = H["dir"] / "broken" / (rel.replace("/", "__") + "." + stamp)
            aside.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, aside)                        # the broken bytes kept, never deleted
            write_text(p, body)
            n = {"id": hashlib.sha1(f"{rel}{time.time()}".encode()).hexdigest()[:12], "file": rel, "restored": True, "from": s["at"],
                 "snapshot": s["name"], "aside": _kitrel(aside),
                 "at": time.time(), "why": why, "seen": False}
            _note(n)
            say(f"{rel} was broken ({bad}; found by {why}): put back from {s['name']}, the broken copy kept as {n['aside']}")
            return True
        if not any(x.get("file") == rel and x.get("restored") is False for x in _notes()):
            _note({"id": hashlib.sha1(f"{rel}{time.time()}".encode()).hexdigest()[:12], "file": rel, "restored": False, "at": time.time(),
                   "why": why, "seen": False})
        say(f"{rel} is broken ({bad}; found by {why}) and no snapshot holds it whole: left as it is")
        return False


def read_json(path):
    """json.load, and a file truly broken put back from the newest snapshot before it is read again"""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except ValueError:                                   # JSONDecodeError and UnicodeDecodeError both
        if not recover(path, "a read"):
            raise
        with open(path, encoding="utf-8") as f:
            return json.load(f)


def check_all():
    """at the start: every file kept that does not parse is put back"""
    n = 0
    for rel, p in targets(daily=True):
        text, why = _read_whole(p)
        if why and why.startswith("does not parse") and recover(p, "the start's check"):
            n += 1
    return n


def status():
    c, snaps = config(), snapshots()
    last = snaps[0] if snaps else None
    return {"on": {"hourly": c["hourly"], "daily": c["daily"]}, "keep": {"hourly": c["keep_hourly"], "daily": c["keep_daily"], "now": KEEP_NOW},
            "folder": str(H["dir"]), "count": len(snaps), "bytes": sum(s["size"] for s in snaps),
            "last": {k: last[k] for k in ("name", "kind", "at", "size")} if last else None,
            "kinds": {k: len([s for s in snaps if s["kind"] == k]) for k in ("hourly", "daily", "now")},
            "notices": [n for n in _notes() if not n.get("seen")], "what": list(EVERY), "daily_too": list(DAILY)}
