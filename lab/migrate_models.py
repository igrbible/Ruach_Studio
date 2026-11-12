#!/usr/bin/env python3
"""HERESY 2330 (Viktor 10.11.2026: «прикрутить миграцию для тех, кто на апдейте… до 2.0.6»): an install of 2.0.6 or before, its weights
spread over models/, checkpoints/, artwork/, separation/, whisper/ and universr/, moved into models/<room>/ by lab/paths.py's MAP.

    python3 lab/migrate_models.py --dry     what would move, file by file; nothing moves (the log keeps it, marked dry)
    python3 lab/migrate_models.py --apply   move it
    python3 lab/migrate_models.py --undo    put back what the log says was moved, the last move first
    python3 lab/migrate_models.py --auto    what start.sh and the lab do at their start: --apply, unless held (below); silent when
                                            there is nothing to move
    --bridge                                after a move: a link at each old place to its new one (the old folder whole where it all
                                            moved, else each file of models/ itself), for scripts of the user's own that still name the
                                            old places; the log keeps them, --unbridge takes them away, --undo takes them first
    --unbridge [OLD…]                       the bridges taken away: those named, or every one
    --bridges                               the bridges there now, a line each
    --root DIR                              another Studio's folder (the tests' fake ones); the lab's own by default

A bridge (HERESY 2330, Viktor 11.11.2026: «А для Тренера временно симлинки на старые пути») is a link at an old place that reaches its own
new place: the move neither moves nor judges it, the hold's look does not count it, and nothing of the Studio reads through it.

How it moves:
- a rename on the same disk, file by file: instant, nothing copied. A file whose new place is on another disk (an old folder that is a
  link to another disk, or models/ itself on another disk) stays where it is and a link at its new place reaches it (HERESY 2390: the
  Studio reads it there, so nothing is downloaded again), and the log and the start say which: nothing is copied behind the user's back;
- a file already in its new place is skipped; a file of the same name already there is compared (size, then SHA-256): the same one is
  said so and the old copy left for its owner to delete, a different one is refused and both are kept;
- a download cut short (.part, .incomplete) is never touched: the next fetch begins it anew in the new place;
- a link is moved as a link (a folder the user put on another disk stays there: models/artist/ becomes the link to it when the whole of
  artwork/ was one), and a relative one is pointed again at where its target lies now;
- what the map does not know (the user's own files, a private experiment) stays where it is, said once;
- the old folders left empty go; the user's places (outputs/, trash/, artist/, writer/: lab/places.py) and loras/, training/, datasets/
  are not the map's and are never walked.
Every step goes into user/migration-2.0.7.log (tab-separated: when, run, verb, old, new, bytes, words), the last run's sums into
user/migration-2.0.7.json; --undo reads the log. One run at a time (user/.migration-2.0.7.lock): the engine's start and the lab's wait
for each other.

Held: user/migration-2.0.7.hold, or RUACH_MODELS_MIGRATION=hold in the environment, keeps --auto from moving anything (it says how much
waits); a machine whose models a training reads keeps it until its owner's word. Standard library only.
"""
import argparse
import fcntl
import hashlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402

LOG = "user/migration-2.0.7.log"
SUMS = "user/migration-2.0.7.json"
HOLD = "user/migration-2.0.7.hold"
LOCKF = "user/.migration-2.0.7.lock"
PARTIAL = (".part", ".incomplete", ".aria2", ".crdownload", ".download")
# an old folder whose whole content the map sends into one new folder: a link there is moved as the link (the user's own disk kept)
WHOLE = {"artwork": paths.ARTIST, "separation": paths.REFINER_SEPARATION, "whisper": paths.WHISPER, "universr": paths.REFINER_UNIVERSR}


def _rel(root, p):
    return Path(os.path.relpath(p, root)).as_posix()


def _new_dir_of(rel):
    """the new place of an old folder (a link to a folder is moved whole): its paths' map, the probe's tail cut off"""
    probe = paths.new_of(rel + "/\0probe")
    return probe[:-len("/\0probe")] if probe and probe.endswith("/\0probe") else None


def _device(p):
    """the disk a new file would be made on: its nearest existing folder's (a link to a folder followed)"""
    p = Path(p)
    while not os.path.exists(p):
        p = p.parent
    return os.stat(p).st_dev


def _sha(p, chunk=1 << 24):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                return h.hexdigest()
            h.update(b)


def _size(p):
    try:
        return os.lstat(p).st_size if os.path.islink(p) else os.path.getsize(p)
    except OSError:
        return 0


def gb(n):
    return f"{n / 1e9:.1f} GB"


class Log:
    def __init__(self, root, run, dry):
        self.f = None
        self.root, self.run, self.dry = Path(root), run, dry

    def __call__(self, verb, old="", new="", size=0, words=""):
        if self.f is None:
            p = self.root / LOG
            p.parent.mkdir(parents=True, exist_ok=True)
            self.f = open(p, "a", encoding="utf-8")
            if p.stat().st_size == 0:
                self.f.write("# Ruach Studio · the models' move into models/<room>/ (lab/migrate_models.py, HERESY 2330)\n"
                             "# when\trun\tverb\told\tnew\tbytes\twords\n")
        self.f.write("\t".join([time.strftime("%Y-%m-%d %H:%M:%S"), self.run, verb, old, new, str(size), words]) + "\n")

    def close(self):
        if self.f:
            self.f.flush()
            os.fsync(self.f.fileno())
            self.f.close()
            self.f = None


def entries(root):
    """(rel, kind) of every file and link under the old folders: kind file, link (to a file or a folder), top-link (an old folder that
    is itself a link); models/<this layout's own folders> are not walked"""
    root = Path(root)
    out = []
    for top in paths.OLD_TOPS:
        base = root / top
        if not os.path.lexists(base):
            continue
        if os.path.islink(base) and top in WHOLE:
            out.append((top, "top-link"))  # its whole content goes into one new folder: the link goes there
            continue
        # another old folder that is a link (models/, checkpoints/): walked; a file whose new place is on another disk is refused
        for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
            if Path(dirpath) == base and top == "models":
                dirnames[:] = [d for d in dirnames if d not in paths.NEW_TOPS]
            for d in list(dirnames):
                if os.path.islink(os.path.join(dirpath, d)):
                    dirnames.remove(d)
                    out.append((_rel(root, os.path.join(dirpath, d)), "link"))
            dirnames.sort()
            for f in sorted(filenames):
                p = os.path.join(dirpath, f)
                out.append((_rel(root, p), "link" if os.path.islink(p) else "file"))
    return out


def new_place(rel):
    """the new place of an old path: a file's by the map, a folder's by its paths' map (None: not the map's)"""
    return WHOLE.get(rel) or paths.new_of(rel) or _new_dir_of(rel)


def is_bridge(root, rel):
    """a link at an old place that reaches its own new place (HERESY 2330, --bridge): neither moved nor judged"""
    p = Path(root) / rel
    if not os.path.islink(p):
        return False
    new = new_place(rel)
    return bool(new) and os.path.lexists(Path(root) / new) and os.path.realpath(p) == os.path.realpath(Path(root) / new)


def plan(root):
    """[(verb, old, new, kind)]: move, top (a whole old folder that is a link), left (a cut-short download), unknown (not the map's),
    keep (.gitkeep of an old folder), bridge (a link at an old place to its new one: left as it is)"""
    root = Path(root)
    steps = []
    for rel, kind in entries(root):
        name = rel.rsplit("/", 1)[-1]
        if kind in ("top-link", "link") and is_bridge(root, rel):
            steps.append(("bridge", rel, new_place(rel), kind))
            continue
        if kind == "top-link":
            new = WHOLE.get(rel)
            steps.append(("top", rel, new, kind) if new else ("unknown", rel, "", kind))
            continue
        if name == ".gitkeep" and rel.count("/") == 1:
            steps.append(("keep", rel, "", kind))
            continue
        if name.endswith(PARTIAL):
            steps.append(("left", rel, "", kind))
            continue
        new = paths.new_of(rel)
        if new is None and kind == "link" and os.path.isdir(root / rel):
            new = _new_dir_of(rel)
        if new and kind in ("file", "link") and reaches(root, rel, new):
            steps.append(("linked", rel, new, kind))   # HERESY 2390: on another disk, its new place a link to it: served, neither moved nor judged
            continue
        steps.append(("move", rel, new, kind) if new else ("unknown", rel, "", kind))
    return steps


def reaches(root, old, new):
    """HERESY 2390: the new place is a link that reaches the old file (made for a file on another disk)"""
    n = Path(root) / new
    return os.path.islink(n) and os.path.exists(n) and os.path.realpath(n) == os.path.realpath(Path(root) / old)


def _names(xs, k=5):
    return ", ".join(xs[:k]) + (f" and {len(xs) - k} more" if len(xs) > k else "")


def _repoint(root, old_rel, new_rel):
    """a relative link's text again, from its new folder to where its target lies now (moved too, or not); None: as it was"""
    text = os.readlink(Path(root) / new_rel)
    if os.path.isabs(text):
        return None
    target = os.path.normpath(os.path.join(os.path.dirname(Path(root) / old_rel), text))
    trel = _rel(root, target)
    moved = None
    if not trel.startswith("../"):
        moved = paths.new_of(trel) or _new_dir_of(trel)
    dest = (Path(root) / moved) if moved else Path(target)
    if not os.path.lexists(dest) and os.path.lexists(target):
        dest = Path(target)           # its target stayed (refused, or not the map's): the link follows it there
    again = os.path.relpath(dest, os.path.dirname(Path(root) / new_rel))
    return again if again != text else None


def _same_file(a, b):
    try:
        if os.path.samefile(a, b):
            return True
    except OSError:
        return False
    if os.path.islink(a) or os.path.islink(b) or not (os.path.isfile(a) and os.path.isfile(b)):
        return False
    return os.path.getsize(a) == os.path.getsize(b) and _sha(a) == _sha(b)


def _prune(root, log, dry):
    """the old folders the move left empty go (models/ itself stays); an old top with only its .gitkeep goes with it"""
    root = Path(root)
    gone = 0
    if dry:
        return 0
    for top in paths.OLD_TOPS:
        base = root / top
        if not base.is_dir() or base.is_symlink():
            continue
        for dirpath, dirnames, filenames in os.walk(base, topdown=False, followlinks=False):
            d = Path(dirpath)
            if top == "models" and d != base and _rel(base, d).split("/")[0] in paths.NEW_TOPS:
                continue
            if d == base:
                if top == "models":
                    continue
                left = [x for x in os.listdir(d)]
                if left == [".gitkeep"] and os.path.getsize(d / ".gitkeep") == 0:
                    os.unlink(d / ".gitkeep")
                    log("gitkeep", _rel(root, d / ".gitkeep"), "", 0, "an empty marker of the old folder")
                    left = []
                if left:
                    continue
            try:
                os.rmdir(d)
                log("rmdir", _rel(root, d), "", 0, "left empty by the move")
                gone += 1
            except OSError:
                pass
    return gone


def apply(root, dry=False, say=print):
    """move what the plan says; returns the sums"""
    root = Path(root)
    run = time.strftime("%Y%m%d-%H%M%S") + ("-dry" if dry else "")
    log = Log(root, run, dry)
    steps = plan(root)
    sums = {"run": run, "dry": dry, "moved": 0, "bytes": 0, "same": 0, "same_bytes": 0, "refused": 0, "left": 0, "unknown": 0,
            "other_disk": 0, "links": 0, "linked": 0, "linked_list": [], "refused_list": [], "at": int(time.time())}
    if not any(v in ("move", "top") for v, *_ in steps):
        return dict(sums, nothing=True, unknown=sum(1 for v, *_ in steps if v == "unknown"),
                    left=sum(1 for v, *_ in steps if v == "left"))
    log("#run", "", "", 0, ("a dry run: nothing moves" if dry else "the move") + f" · {len(steps)} entries")
    verb_w = "would" if dry else "moved"
    left_over = set()
    steps = [x for x in steps if x[3] != "link"] + [x for x in steps if x[3] == "link"]   # links last: their targets are in place by then
    for verb, old, new, kind in steps:
        src, dst = root / old, root / (new or "")
        if verb == "unknown":
            log("unknown", old, "", _size(src), "not the Studio's (the map does not know it): stays where it is")
            sums["unknown"] += 1
            continue
        if verb == "left":
            log("left", old, "", _size(src), "a download cut short: never touched; the next fetch begins it anew in the new place")
            sums["left"] += 1
            continue
        if verb in ("keep", "bridge", "linked"):
            continue
        if verb == "top":
            # an old folder that is a link to another disk, whose whole content goes into one new folder: the link goes there
            if os.path.lexists(dst):
                log("refused", old, new, 0, f"{old} is a link to {os.readlink(src)}, and {new} is already there: link {new} to it by hand, or move its files")
                left_over.add(old)
                sums["refused"] += 1
                sums["refused_list"].append(old)
                continue
            if not dry:
                dst.parent.mkdir(parents=True, exist_ok=True)
                text = os.readlink(src)
                if not os.path.isabs(text):
                    text = os.path.relpath(os.path.normpath(os.path.join(src.parent, text)), dst.parent)
                os.symlink(text, dst)
                os.unlink(src)
            log("top" if not dry else "would", old, new, 0, f"the link to {os.readlink(src) if dry else os.readlink(dst)} (your own place): moved as a link, its files stay on their disk")
            sums["links"] += 1
            continue
        # verb == move
        size = _size(src)
        if os.path.lexists(dst):
            if _same_file(src, dst):
                log("same", old, new, size, "the same file is already in its new place: the old copy stays here; delete it when you like")
                left_over.add(old)
                sums["same"] += 1
                sums["same_bytes"] += size
            else:
                log("refused", old, new, size, f"another file of this name is already in its new place ({_size(dst)} bytes there, {size} here): both kept, compare them by hand")
                left_over.add(old)
                sums["refused"] += 1
                sums["refused_list"].append(old)
            continue
        if os.lstat(src).st_dev != _device(dst.parent):
            sums["other_disk"] += 1
            # HERESY 2390: a file stays on its own disk and a link at its new place reaches it (absolute: models/ itself may be a link to
            # another disk, and a relative link resolves from where it really lies); nothing copied, nothing for the Studio to fetch again
            if kind == "file" or os.path.exists(src):          # a link of the user's own: the new one reaches its target
                if not dry:
                    try:
                        dst.parent.mkdir(parents=True, exist_ok=True)
                        os.symlink(os.path.realpath(src), dst)
                    except OSError as e:
                        log("refused", old, new, size, f"its new place is on another disk, and the link there failed: {e} (link it by hand)")
                        left_over.add(old)
                        sums["refused"] += 1
                        sums["refused_list"].append(old)
                        continue
                log("linked" if not dry else "would", old, new, size, "its new place is on another disk: the file stays on its disk, and a link at its new place reaches it (nothing copied, nothing to fetch again)")
                sums["linked"] += 1
                sums["linked_list"].append(old)
                continue
            log("refused", old, new, size, "a link whose target is gone, and its new place is on another disk: it stays where it is")
            left_over.add(old)
            sums["refused"] += 1
            sums["refused_list"].append(old)
            continue
        again = None
        if not dry:
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                os.rename(src, dst)
            except OSError as e:
                log("refused", old, new, size, f"the rename failed: {e}")
                sums["refused"] += 1
                continue
            if kind == "link":
                again = _repoint(root, old, new)
                if again is not None:
                    was = os.readlink(dst)
                    os.unlink(dst)
                    os.symlink(again, dst)
                    log("link", old, new, 0, f"{was}\t{again}")
        log(verb_w, old, new, size, "a link, moved as a link" if kind == "link" else "")
        sums["moved"] += 1
        sums["bytes"] += size
    sums["rmdir"] = _prune(root, log, dry)
    sums["left_over"] = sorted(left_over)            # judged and left (refused, the same): --auto does not judge them again
    log("#sum", "", "", sums["bytes"], json.dumps(sums, ensure_ascii=False))
    log.close()
    if not dry:
        p = root / SUMS
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".json.part")
        tmp.write_text(json.dumps(sums, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, p)
    return sums


def _rows(root):
    p = Path(root) / LOG
    try:
        lines = p.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    out = []
    for line in lines:
        if line.startswith("#"):
            continue
        c = line.split("\t")
        if len(c) >= 6:
            out.append({"run": c[1], "verb": c[2], "old": c[3], "new": c[4], "words": "\t".join(c[6:])})
    return out


def undo(root, say=print):
    """every move of every run the log keeps (not a dry one), put back, the last first; what cannot go back is said and left"""
    root = Path(root)
    rows = [r for r in _rows(root) if not r["run"].endswith("-dry")]
    links = {(r["old"], r["new"]): r["words"].split("\t")[0] for r in rows if r["verb"] == "link"}
    pending = {}                      # (old, new) -> its moves not yet undone, in the log's order (a pair may move, come back, move again)
    for i, r in enumerate(rows):
        if r["verb"] in ("moved", "top", "gitkeep", "bridge", "linked"):
            pending.setdefault((r["old"], r["new"]), []).append(i)
        elif r["verb"] in ("undone", "unbridged") and pending.get((r["old"], r["new"])):
            pending[(r["old"], r["new"])].pop()
    todo = [rows[i] for i in sorted(i for v in pending.values() for i in v)]
    run = time.strftime("%Y%m%d-%H%M%S") + "-undo"
    log = Log(root, run, False)
    sums = {"run": run, "undone": 0, "cannot": 0}
    if not todo:
        return dict(sums, nothing=True)
    log("#run", "", "", 0, f"the undo · {len(todo)} steps")
    for r in reversed(todo):
        src, dst = root / r["new"], root / r["old"]
        if r["verb"] == "bridge":     # made after the moves: taken away before them
            if is_bridge(root, r["old"]):
                os.unlink(dst)
            log("unbridged", r["old"], r["new"], 0, "the bridge taken away by the undo")
            continue
        if r["verb"] == "linked":     # HERESY 2390: the file never moved; the link at its new place goes
            if reaches(root, r["old"], r["new"]):
                os.unlink(src)
                log("undone", r["old"], r["new"], 0, "the link at the new place taken away; the file never left its disk")
                sums["undone"] += 1
            else:
                log("cannot", r["old"], r["new"], 0, f"{r['new']} is no longer the link to {r['old']}: left as it is")
                sums["cannot"] += 1
            continue
        if r["verb"] == "gitkeep":
            dst.parent.mkdir(parents=True, exist_ok=True)
            if not dst.exists():
                dst.touch()
            log("undone", r["old"], r["new"], 0, "the empty marker again")
            sums["undone"] += 1
            continue
        if not os.path.lexists(src):
            log("cannot", r["old"], r["new"], 0, f"{r['new']} is not there any more")
            sums["cannot"] += 1
            continue
        if os.path.lexists(dst):
            log("cannot", r["old"], r["new"], 0, f"{r['old']} is taken again")
            sums["cannot"] += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if r["verb"] == "top":
            text = os.readlink(src)
            if not os.path.isabs(text):
                text = os.path.relpath(os.path.normpath(os.path.join(src.parent, text)), dst.parent)
            os.symlink(text, dst)
            os.unlink(src)
        else:
            os.rename(src, dst)
            was = links.get((r["old"], r["new"]))
            if was is not None:
                os.unlink(dst)
                os.symlink(was, dst)
        log("undone", r["old"], r["new"], _size(dst), "")
        sums["undone"] += 1
    # the new folders the undo left empty go
    for d in sorted({(root / r["new"]).parent for r in todo}, key=lambda p: -len(p.parts)):
        while d != root / paths.MODELS and str(d).startswith(str(root / paths.MODELS)):
            try:
                os.rmdir(d)
            except OSError:
                break
            d = d.parent
    log("#sum", "", "", 0, json.dumps(sums, ensure_ascii=False))
    log.close()
    return sums


def _alive(rows, verbs, ends):
    """the rows of these verbs that no later row of the ends' verbs took back, in the log's order"""
    pending = {}
    for i, r in enumerate(rows):
        if r["verb"] in verbs:
            pending.setdefault((r["old"], r["new"]), []).append(i)
        elif r["verb"] in ends and pending.get((r["old"], r["new"])):
            pending[(r["old"], r["new"])].pop()
    return [rows[i] for i in sorted(i for v in pending.values() for i in v)]


def bridge(root, dry=False):
    """HERESY 2330 (Viktor 11.11.2026: «А для Тренера временно симлинки на старые пути»): after a move, a link at each old place to its
    new one, so that scripts which still name the old places read on: an old folder whole where all of it moved (artwork/,
    checkpoints/<one>/, models/<one>/), else each moved file of it; a file of models/ or checkpoints/ itself, alone. Never over
    something that is there. Returns the sums."""
    root = Path(root)
    rows = [r for r in _rows(root) if not r["run"].endswith("-dry")]
    moved = [r for r in _alive(rows, ("moved", "top"), ("undone",))]
    have = {r["old"] for r in _alive(rows, ("bridge",), ("unbridged", "undone"))}
    want = []
    for r in moved:
        parts = r["old"].split("/")
        if parts[0] in WHOLE:
            cand = parts[0]
        elif len(parts) > 2:
            cand = "/".join(parts[:2])
        else:
            cand = r["old"]
        if os.path.isdir(root / cand) and not os.path.islink(root / cand):
            cand = r["old"]               # the folder still holds what did not move: a bridge a file
        if cand not in want:
            want.append(cand)
    run = time.strftime("%Y%m%d-%H%M%S") + ("-bridge-dry" if dry else "-bridge")
    log = Log(root, run, dry)
    sums = {"run": run, "made": 0, "there": 0, "taken": 0, "no_place": 0}
    for cand in want:
        p, new = root / cand, new_place(cand)
        if is_bridge(root, cand):
            sums["there"] += 1
            if cand not in have and not dry:
                log("bridge", cand, new, 0, "a bridge found there: kept in the log")
            continue
        if not new or not os.path.lexists(root / new):
            sums["no_place"] += 1
            continue
        if os.path.lexists(p):
            log("taken", cand, new, 0, "the old place holds something else: no bridge over it")
            sums["taken"] += 1
            continue
        if not dry:
            p.parent.mkdir(parents=True, exist_ok=True)
            os.symlink(os.path.relpath(root / new, p.parent), p)
        log("bridge" if not dry else "would", cand, new, 0, "a link at the old place to the new one, for scripts that still name it")
        sums["made"] += 1
    log.close()
    return sums


def unbridge(root, names=None):
    """the bridges taken away (those named, or every one the log keeps); the old folders they leave empty go. Returns the sums."""
    root = Path(root)
    rows = [r for r in _rows(root) if not r["run"].endswith("-dry")]
    run = time.strftime("%Y%m%d-%H%M%S") + "-unbridge"
    log = Log(root, run, False)
    sums = {"run": run, "taken": 0, "not_bridge": 0}
    names = {n.rstrip("/") for n in names} if names else None
    for r in reversed(_alive(rows, ("bridge",), ("unbridged", "undone"))):
        if names is not None and r["old"] not in names:
            continue
        p = root / r["old"]
        if is_bridge(root, r["old"]):
            os.unlink(p)
            sums["taken"] += 1
            log("unbridged", r["old"], r["new"], 0, "the bridge taken away")
        else:
            sums["not_bridge"] += 1
            log("unbridged", r["old"], r["new"], 0, "no bridge there any more (gone, or something else in its place): left as it is")
        d = p.parent
        while d != root and d != root / paths.MODELS:
            try:
                os.rmdir(d)
            except OSError:
                break
            d = d.parent
    log.close()
    return sums


def bridges(root):
    """the bridges there now, as the log keeps them: [(old, new)]"""
    rows = [r for r in _rows(root) if not r["run"].endswith("-dry")]
    return [(r["old"], r["new"]) for r in _alive(rows, ("bridge",), ("unbridged", "undone")) if is_bridge(root, r["old"])]


def waiting(root):
    """2.0.6's folders that still hold something the map moves, by a look at their tops (no walk): ["checkpoints/", "models/<a file>"…]"""
    root, out = Path(root), []
    for top in paths.OLD_TOPS:
        base = root / top
        if is_bridge(root, top):
            continue
        try:
            names = [n for n in os.listdir(base) if n != ".gitkeep" and not is_bridge(root, f"{top}/{n}")]
        except OSError:
            continue
        if top == "models":
            names = [n for n in names if n not in paths.NEW_TOPS and (paths.new_of(f"models/{n}") or paths.new_of(f"models/{n}/x"))]
        if names:
            out.append(f"{top}/")
    return out


def state(root=None):
    """GET /lab/models/migration: the last run's sums (user/migration-2.0.7.json; null before any), whether the move is held, which of
    2.0.6's folders still wait, where the log is"""
    root = Path(root or paths.ROOT)
    try:
        sums = json.loads((root / SUMS).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        sums = None
    return {"sums": sums, "held": held(root), "waiting": waiting(root), "log": LOG}


def held(root):
    return (Path(root) / HOLD).exists() or os.environ.get("RUACH_MODELS_MIGRATION", "").lower() in ("hold", "off", "0", "no")


class _Lock:
    def __init__(self, root):
        p = Path(root) / LOCKF
        p.parent.mkdir(parents=True, exist_ok=True)
        self.f = open(p, "a")

    def __enter__(self):
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def auto(root=None, say=print):
    """At the start of the engine and of the lab: the move, once; held, only how much waits; silent when nothing is left to move."""
    root = Path(root or paths.ROOT)
    with _Lock(root):
        if held(root):
            waits = waiting(root)
            if waits:
                say(f"[models] 2.0.6's folders wait to move into models/<room>/ ({', '.join(waits)}); held ({HOLD} or RUACH_MODELS_MIGRATION=hold): "
                    "python3 lab/migrate_models.py --dry shows them, --apply moves them")
            return {"held": True, "waiting": len(waits)}
        try:
            last = set(json.loads((root / SUMS).read_text(encoding="utf-8")).get("left_over") or [])
        except (OSError, ValueError):
            last = set()
        todo = {old for v, old, *_ in plan(root) if v in ("move", "top")}
        if todo and todo <= last:                    # only what the last run judged and left: said in its log, not judged again
            return {"nothing": True, "left_over": len(todo)}
        s = apply(root, dry=False)
        if not s.get("nothing"):
            say(f"[models] moved into models/<room>/: {s['moved']} files, {gb(s['bytes'])}"
                + (f"; {s['linked']} on another disk stay there, a link at each new place reaches them ({_names(s['linked_list'])})" if s["linked"] else "")
                + (f"; {s['refused']} refused, both copies kept: compare them by hand ({_names(s['refused_list'])})" if s["refused"] else "")
                + (f"; {s['same']} already in place (old copies kept, {gb(s['same_bytes'])})" if s["same"] else "")
                + f" · {LOG}")
        return s


def main(argv=None):
    ap = argparse.ArgumentParser(description="the Studio's weights into models/<room>/ (HERESY 2330)")
    ap.add_argument("--root", default=str(paths.ROOT))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--undo", action="store_true")
    g.add_argument("--auto", action="store_true")
    g.add_argument("--bridge", action="store_true")
    g.add_argument("--unbridge", nargs="*", metavar="OLD")
    g.add_argument("--bridges", action="store_true")
    ap.add_argument("--look", action="store_true", help="with --bridge: what it would make; nothing made")
    a = ap.parse_args(argv)
    root = Path(a.root).resolve()
    if a.auto:
        auto(root)
        return 0
    if a.bridges:
        for old, new in bridges(root):
            print(f"{old}\t{new}")
        return 0
    if a.bridge or a.unbridge is not None:
        with _Lock(root):
            if a.bridge:
                s = bridge(root, dry=a.look)
                print(f"{'would make' if a.look else 'bridges made'}: {s['made']} · there already: {s['there']} · an old place taken by something else: {s['taken']} · the log: {LOG}")
                return 0
            s = unbridge(root, a.unbridge or None)
            print(f"bridges taken away: {s['taken']} · not a bridge any more, left: {s['not_bridge']} · the log: {LOG}")
            return 0
    with _Lock(root):
        if a.undo:
            s = undo(root)
            print("nothing to undo" if s.get("nothing") else f"put back: {s['undone']} · could not: {s['cannot']} · {LOG}")
            return 0 if not s.get("cannot") else 1
        s = apply(root, dry=a.dry)
    if s.get("nothing"):
        print(f"nothing to move: the weights are in models/<room>/ already ({s['unknown']} not the Studio's, {s['left']} cut short, stay)")
        return 0
    head = "would move" if a.dry else "moved"
    print(f"{head}: {s['moved']} files, {gb(s['bytes'])} · links moved: {s['links']} · already in place: {s['same']} ({gb(s['same_bytes'])} of old copies kept)"
          f" · on another disk, kept there and linked from the new place: {s['linked']} · refused: {s['refused']} · cut short, left: {s['left']}"
          f" · not the Studio's, left: {s['unknown']} · the log: {LOG}")
    for verb, xs in (("linked", s["linked_list"]), ("refused", s["refused_list"])):
        for x in xs:
            print(f"  {verb}\t{x}")
    return 0 if not s["refused"] else 1


if __name__ == "__main__":
    sys.exit(main())
