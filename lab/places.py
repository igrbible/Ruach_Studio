"""HERESY 1261 (Viktor 09.10.2026: «время в движок Студии допилить кастомные пути для пользовательских данных. У нас на Големе
оставляем как есть. Предусмотри, чтобы RC3 автоматом подтягивал существующие пути развёртки, и в Engine — опции по выбору путей и
возможность изменения локации с переносом данных с одного места в другое. Всё сохраняем как и прежде — в пользовательском файле
настроек в самом репо… Мы менеджим кастомно только пути для самих генераций, скачанных воркспейсов и т.п.»): where the user's own
work lives.

The four folders the studio's .gitignore calls the user's work: outputs/ (the takes, and the workspaces fetched from Hugging Face,
which land there too), trash/, artist/ (the Artist's runs), writer/ (the Writer's documents). Each may live anywhere: its name in the
studio's folder is then a link to it, and every reader (the engine, the lab, the scripts, a file manager) goes on using outputs/ as
before; nothing else in the studio needs to know. The models, the LoRAs and the training sets keep their places.

Where a folder is now is what the studio's folder holds (a folder or a link): an install of any age is read as it is, nothing to
migrate. A move runs only while nothing renders or runs: on the same disk a rename; on another a copy into <to>.part, counted file by
file, a pass for anything written meanwhile, then the link switched. The old copy is never deleted here: it stays, renamed
<name>.moved-<stamp>, and the page says where, so its owner removes it after a look. Where each folder went is written into
user/settings.json under "paths", beside the page's keys (its saves and its Reset leave "paths" alone), so a fresh clone given the old
user/ links back by itself. Under WSL a Windows path (D:\\Music) is read as the drive's /mnt/d/Music.
"""
import json
import os
import re
import shutil
import threading
import time
import urllib.request
from pathlib import Path

PLACES = (("outputs", "Songs", "the takes, and the workspaces fetched from Hugging Face"),
          ("trash", "Trash", "what was deleted, until the trash is emptied"),
          ("artist", "Pictures", "the Artist's runs"),
          ("writer", "Writer", "the Writer's documents"))
NAMES = tuple(p[0] for p in PLACES)
H = {}                     # kit, busy (the lab's own work), settings_lock, settings_file, studio_port, say
JOB = {}                   # the one move at a time: name, phase, done, total, files, of, started, to, old, error
LOCK = threading.Lock()
SIZES = {}                 # name -> {"real", "files", "bytes", "at"}, counted in the background
COUNTING = set()
MARGIN = 1 << 30           # a copy wants this much more free room than it takes


def setup(kit, busy, settings_lock, settings_file, studio_port="41867", say=print):
    H.update(kit=Path(kit), busy=busy, settings_lock=settings_lock, settings_file=Path(settings_file), studio_port=str(studio_port), say=say)


def _wsl():
    try:
        return "microsoft" in Path("/proc/version").read_text(encoding="utf-8", errors="replace").lower()
    except OSError:
        return False


def norm(raw):
    """A folder as typed: quotes and spaces off, ~ and $VARS expanded; under WSL a Windows path is its drive's /mnt/x. Absolute only."""
    s = str(raw or "").strip().strip('"').strip("'").strip()
    if not s:
        return ""
    m = re.match(r"^([A-Za-z]):(?:[\\/](.*))?$", s)
    if m:
        if not _wsl():
            raise ValueError(f"{s} is a Windows path: it means something only under WSL (D:\\ is /mnt/d there)")
        s = "/mnt/" + m.group(1).lower() + "/" + (m.group(2) or "").replace("\\", "/")
    s = os.path.expandvars(os.path.expanduser(s))
    if not s.startswith("/"):
        raise ValueError("a full path, from / (or ~ for your home)")
    return os.path.normpath(s)


def _walk(top):
    """(files, bytes) under top, links inside not followed (a link counts as one file of no size)."""
    files = size = 0
    stack = [top]
    while stack:
        d = stack.pop()
        try:
            it = os.scandir(d)
        except OSError:
            continue
        with it:
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False):
                        stack.append(e.path)
                    else:
                        files += 1
                        if not e.is_symlink():
                            size += e.stat(follow_symlinks=False).st_size
                except OSError:
                    pass
    return files, size


def _count_soon(name, real):
    if name in COUNTING:
        return
    COUNTING.add(name)

    def run():
        try:
            f, b = _walk(real)
            SIZES[name] = {"real": real, "files": f, "bytes": b, "at": time.time()}
        finally:
            COUNTING.discard(name)
    threading.Thread(target=run, daemon=True).start()


def _settings():
    p = H["settings_file"]
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return {"saved_at": 0, "keys": {}}


def record():
    return (_settings().get("paths") or {})


def _write_record(name, value):
    """paths[name] in user/settings.json, under the lock the page's saves take, written whole or not at all."""
    p = H["settings_file"]
    with H["settings_lock"]:
        d = _settings()
        paths = d.get("paths") or {}
        paths[name] = value
        d["paths"] = paths
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.is_file():
            shutil.copy2(p, str(p) + ".bak")
        tmp = Path(str(p) + ".part")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        os.replace(tmp, p)


def listing(refresh=False):
    kit, rec = H["kit"], record()
    rows = []
    for name, label, what in PLACES:
        p = kit / name
        link = p.is_symlink()
        real = os.path.realpath(p)
        here = os.path.isdir(real)
        row = {"name": name, "label": label, "what": what, "path": str(p), "real": real, "linked": link, "here": here,
               "record": rec.get(name)}
        probe = real if here else os.path.dirname(real)
        try:
            row["free"] = shutil.disk_usage(probe).free
        except OSError:
            row["free"] = None
        if link and not here:
            row["missing"] = True                    # a link to a folder that is not there: a disk not mounted?
        at = (rec.get(name) or {}).get("at") or ""
        if at and not link and at != real:
            row["elsewhere"] = at                    # the record says it lives at `at`, the studio's folder holds a folder of its own
        size = SIZES.get(name)
        if here and (refresh or not size or size["real"] != real or time.time() - size["at"] > 600):
            _count_soon(name, real)
        if size and size["real"] == real:
            row.update(files=size["files"], bytes=size["bytes"], counted=size["at"])
        row["counting"] = name in COUNTING
        rows.append(row)
    with LOCK:
        job = dict(JOB) if JOB else None
    return {"places": rows, "job": job, "wsl": _wsl(), "home": str(kit)}


def _studio_busy():
    try:
        hw = json.load(urllib.request.urlopen(f"http://127.0.0.1:{H['studio_port']}/hardware", timeout=4))
        return bool(hw.get("busy"))
    except (OSError, ValueError):
        return False                                 # no studio answering: nothing of it writes


def _why_busy():
    if H["busy"]():
        return "the lab is working on something: move it when that is done"
    if _studio_busy():
        return "the studio is rendering: move it when the song is done"
    with LOCK:
        if JOB and JOB.get("phase") not in ("done", "failed"):
            return f"{JOB['name']} is moving now"
    return ""


def plan(name, to):
    """What a move would do, nothing done: the folder it ends in, the same disk or not, the room it needs and has, or why not."""
    if name not in NAMES:
        raise ValueError("no such folder of the studio: " + str(name))
    kit = H["kit"]
    p = kit / name
    real = os.path.realpath(p)
    home = not str(to or "").strip()
    if not os.path.isdir(real):
        return {"ok": False, "why": f"{name} is not there now ({real}): link it back, or mount its disk, first"}
    if home:
        if not p.is_symlink():
            return {"ok": False, "why": f"{name} is in the studio's folder already"}
        dest, parent = str(p), str(kit)
    else:
        parent = norm(to)
        dest = os.path.join(parent, name)
        if not os.path.isdir(parent):
            return {"ok": False, "why": f"no folder {parent}: make it first (the studio creates no folders out of a typo)", "dest": dest}
        if not os.access(parent, os.W_OK | os.X_OK):
            return {"ok": False, "why": f"{parent} is not writable for this user", "dest": dest}
        rp = os.path.realpath(dest)
        if rp == real:
            return {"ok": False, "why": f"{name} is there already", "dest": dest}
        if (rp + "/").startswith(real + "/"):
            return {"ok": False, "why": f"{dest} is inside {name} itself", "dest": dest}
        if (os.path.realpath(parent) + "/").startswith(str(kit) + "/"):
            return {"ok": False, "why": "inside the studio's folder: a folder there needs no link", "dest": dest}
        if os.path.lexists(dest) and not (os.path.isdir(dest) and not os.path.islink(dest) and not os.listdir(dest)):
            return {"ok": False, "why": f"{dest} is there already: choose another folder, or empty it", "dest": dest}
    same = os.stat(real).st_dev == os.stat(parent).st_dev
    size = SIZES.get(name)
    need = None if not size or size["real"] != real else size["bytes"]
    free = shutil.disk_usage(parent).free
    out = {"ok": True, "dest": dest, "home": home, "same_disk": same, "need": need, "free": free, "why": ""}
    if not same and need is not None and need + MARGIN > free:   # not counted yet: the move counts first and says so then
        out.update(ok=False, why=f"{need / 2**30:.1f} GB to copy and {free / 2**30:.1f} GB free there (with 1 GB to spare)")
    return out


def move(data, scope=""):
    if scope:
        raise ValueError("a test page moves no folders")
    name, to = str(data.get("name", "")), str(data.get("to", ""))
    why = _why_busy()
    if why:
        raise ValueError(why)
    pl = plan(name, to)
    if not pl["ok"]:
        raise ValueError(pl["why"])
    with LOCK:
        if JOB and JOB.get("phase") not in ("done", "failed"):
            raise ValueError(f"{JOB['name']} is moving now")
        JOB.clear()
        JOB.update(name=name, phase="starting", to=pl["dest"], home=pl["home"], same_disk=pl["same_disk"], done=0,
                   total=pl["need"] or 0, files=0, of=0, started=time.time(), old="", error="")
    threading.Thread(target=_run, args=(name, pl["dest"], pl["home"], pl["same_disk"]), daemon=True).start()
    return listing()


def _set(**kw):
    with LOCK:
        JOB.update(kw)


def _copy_tree(src, dst):
    """src into dst (made here), files with their times, links as links; JOB counts the bytes."""
    os.makedirs(dst)
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        to = dst if rel == "." else os.path.join(dst, rel)
        for d in list(dirs):
            s = os.path.join(root, d)
            if os.path.islink(s):
                os.symlink(os.readlink(s), os.path.join(to, d))
                dirs.remove(d)
                _set(files=JOB["files"] + 1)
            else:
                os.makedirs(os.path.join(to, d), exist_ok=True)
        for f in files:
            s, t = os.path.join(root, f), os.path.join(to, f)
            if os.path.islink(s):
                os.symlink(os.readlink(s), t)
            else:
                shutil.copy2(s, t)
                _set(done=JOB["done"] + os.path.getsize(t))
            _set(files=JOB["files"] + 1)


def _catch_up(src, dst):
    """A file of src that dst lacks, or holds at another size or time, copied again: how many there were."""
    n = 0
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        to = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(to, exist_ok=True)
        for d in list(dirs):
            if os.path.islink(os.path.join(root, d)):
                dirs.remove(d)
                if not os.path.lexists(os.path.join(to, d)):
                    os.symlink(os.readlink(os.path.join(root, d)), os.path.join(to, d))
                    n += 1
        for f in files:
            s, t = os.path.join(root, f), os.path.join(to, f)
            if os.path.islink(s):
                if not os.path.lexists(t):
                    os.symlink(os.readlink(s), t)
                    n += 1
                continue
            a = os.stat(s)
            try:
                b = os.stat(t, follow_symlinks=False)
                if a.st_size == b.st_size and int(a.st_mtime) == int(b.st_mtime):
                    continue
            except OSError:
                pass
            shutil.copy2(s, t)
            n += 1
    return n


def _run(name, dest, home, same):
    kit = H["kit"]
    p = kit / name
    real = os.path.realpath(p)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    built = str(kit / ("." + name + ".part")) if home else dest + ".part"
    old, made, gone = "", False, ""
    try:
        if os.path.lexists(built):
            raise RuntimeError(f"{built} is there from an earlier move: look into it, and remove it, first")
        if same:
            _set(phase="rename")
            os.rename(real, built)                   # the same disk: nothing copied, the folder itself goes
        else:
            _set(phase="count")
            f, b = _walk(real)
            free = shutil.disk_usage(os.path.dirname(built)).free
            if b + MARGIN > free:
                raise RuntimeError(f"{b / 2**30:.1f} GB to copy and {free / 2**30:.1f} GB free there (with 1 GB to spare); nothing was copied")
            _set(phase="copy", total=b, of=f)
            made = True
            _copy_tree(real, built)
            _set(phase="check")
            for _ in range(3):                       # what was written while it copied
                if not _catch_up(real, built):
                    break
            else:
                raise RuntimeError("the folder kept changing while it was copied: something writes into it; nothing was switched")
            a, c = _walk(real), _walk(built)
            if a != c:
                raise RuntimeError(f"the copy differs: {a[0]} files, {a[1]} bytes there, {c[0]}, {c[1]} in the copy; nothing was switched")
        _set(phase="switch")
        if home:
            os.unlink(p)                             # the link only: the folder it named stays
            os.rename(built, p)
        else:
            if os.path.isdir(dest) and not os.path.islink(dest):
                os.rmdir(dest)                       # an empty folder of that name, checked empty by plan()
            os.rename(built, dest)
            if p.is_symlink():
                tmp = kit / ("." + name + ".link")
                if os.path.lexists(tmp):
                    os.unlink(tmp)
                os.symlink(dest, tmp)
                os.replace(tmp, p)                   # the link points elsewhere in one step
            else:
                if os.path.lexists(p):               # the folder of the studio's own, full (a copy) or gone (a rename)
                    old = gone = str(p) + ".moved-" + stamp
                    os.rename(p, old)
                os.symlink(dest, p)
                gone = ""
        if not same and os.path.isdir(real) and os.path.realpath(p) != real and not old:
            old = real + ".moved-" + stamp           # the old copy elsewhere: renamed, kept
            os.rename(real, old)
        _write_record(name, {"at": "" if home else dest, "since": time.time(), "old": old})
        SIZES.pop(name, None)
        _set(phase="done", old=old, ended=time.time())
        H["say"](f"[places] {name} now at {os.path.realpath(p)}" + (f"; the old copy kept at {old}" if old else ""))
    except Exception as e:                           # every step before the switch leaves the folder where it was
        try:
            if gone and not os.path.lexists(p):
                os.rename(gone, p)                   # the switch half done: the studio's own folder back under its name
            if same and not os.path.lexists(real) and os.path.lexists(built):
                os.rename(built, real)               # a rename half done goes back
            elif made and os.path.isdir(built) and not os.path.islink(built):
                shutil.rmtree(built)                 # a copy left unfinished: this run's own, the folder itself untouched
        except OSError:
            pass
        _set(phase="failed", error=str(e), ended=time.time())
        H["say"](f"[places] moving {name} failed: {e}")


def relink(data, scope=""):
    """The record says where a folder lives; the studio's folder holds none, or an empty one: the link again."""
    if scope:
        raise ValueError("a test page links no folders")
    name = str(data.get("name", ""))
    if name not in NAMES:
        raise ValueError("no such folder of the studio: " + name)
    at = (record().get(name) or {}).get("at") or ""
    p = H["kit"] / name
    if not at:
        raise ValueError(f"no record of where {name} lives")
    if not os.path.isdir(at):
        raise ValueError(f"{at} is not there (a disk not mounted?)")
    if p.is_symlink():
        tmp = H["kit"] / ("." + name + ".link")
        if os.path.lexists(tmp):
            os.unlink(tmp)
        os.symlink(at, tmp)
        os.replace(tmp, p)
    else:
        if p.is_dir():
            if any(p.iterdir()):
                raise ValueError(f"{p} holds files of its own: both places hold some; move or merge them by hand first")
            p.rmdir()
        os.symlink(at, p)
    return listing()


def boot():
    """At the lab's start: a folder the record places elsewhere is linked back where the studio's folder holds none or an empty one
    (a fresh clone given the old user/); one with no record and no folder is made; a link to nothing is said loudly."""
    rec = record()
    for name in NAMES:
        p = H["kit"] / name
        at = (rec.get(name) or {}).get("at") or ""
        try:
            if at and not p.is_symlink() and os.path.isdir(at) and (not p.exists() or (p.is_dir() and not any(p.iterdir()))):
                if p.is_dir():
                    p.rmdir()
                os.symlink(at, p)
                H["say"](f"[places] {name} linked back to {at}, as user/settings.json keeps it")
            elif p.is_symlink() and not p.exists():
                H["say"](f"[places] ⚠ {name} is a link to {os.readlink(p)}, which is not there (a disk not mounted?)")
            elif not os.path.lexists(p):
                p.mkdir()
        except OSError as e:
            H["say"](f"[places] {name}: {e}")
