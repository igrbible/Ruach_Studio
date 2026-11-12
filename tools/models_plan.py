"""models_plan.py · what fetch-models.sh would download, file by file, before anything comes: each file with its size from the
pinned revision's list, here or missing or changed, the total and the disk that is free (Viktor 08.11.2026, the AppImage's
first start on his laptop: «Нужно сообщение, предупреждающее и дохерища файлов для скачивания»).

    models_plan.py ROOT [--update] < entries

    entries  a line each: repo, revision, a file or a pattern in the repo, the folder under ROOT it goes into ("" for ROOT),
             the pack it belongs to; tab-separated. A file is laid out under that folder by its path in the repo, as the
             pinned downloader lays it (hf download --local-dir).
    prints   a line a file: state, bytes, repo, revision, path, folder, pack; state is get (not here), changed (here, but not
             the pinned size: a newer pin), kept (here, not the pinned copy, and not as our downloader left it: someone's
             own, never replaced here), here, or gone (not in the repo at its pin). Then one line
             «#total  bytes to get  files to get  bytes free». A repo whose pinned list cannot be read: «#offline  repo».
    --update a file that is not here is not wanted: only what changed among the files here comes (a new pin of a file the
             user has); a pack not chosen stays not chosen. HERESY 2329: but a file of the pack «newdefault» is wanted though
             not here (a new default of the Studio, as YuE2-VAE-RS x3 v1 in 2.0.7, comes with the update once)

Exit 0, or 2 when a pinned list could not be read (nothing is then known of that repo's files). (Claude, 08.11.2026)
"""
import fnmatch
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hf_expect import expected_files  # noqa: E402  the same pinned lists (and their cache in tmp/hf/expect) as every check

PATHS = None


def place(root, base, path):
    """HERESY 2330: where a repo's file lies here: the folder and the repo's path name 2.0.6's place, lab/paths.py's map says where it lands
    now (models/<room>/…); one the map does not know (loras/…) lies where it did"""
    global PATHS
    rel = os.path.normpath(os.path.join(base, path)).replace(os.sep, "/")
    if PATHS is None:
        try:
            sys.path.insert(0, os.path.join(root, "lab"))
            import paths as PATHS_  # noqa: N811
            PATHS = PATHS_
        except ImportError:
            PATHS = False
    new = PATHS.new_of(rel) if PATHS else None
    return os.path.join(root, new or rel)


def ours_unchanged(root, base, path, local):
    """True when the pinned downloader fetched this file (its metadata beside it, .cache/huggingface/download/<path>.metadata:
    the commit, the etag, the time) and it is still byte for byte what it fetched: then a newer pin may replace it. A file with
    no metadata (put there by hand, or moved there from a stage, as heresy/fetch-ruach-loras.py moves the Studio's own LoRAs)
    or changed since is someone's own: 08.11.2026, the Forge's own shofar adapter had the pinned one's name and another size"""
    etag = None
    # HERESY 2330: the downloader's records where 2.0.6 left them, or in models/.incoming/, where a download goes before its room
    place(root, base, path)                               # (lab/paths.py read)
    stage = os.path.join(root, PATHS.INCOMING) if PATHS else ""
    for meta in (os.path.join(root, base, ".cache", "huggingface", "download", path + ".metadata"),
                 os.path.join(stage, base, ".cache", "huggingface", "download", path + ".metadata")):
        try:
            with open(meta, encoding="utf-8") as f:
                etag = (f.read().splitlines() + ["", ""])[1].strip().strip('"')
            break
        except OSError:
            continue
    if etag is None:
        return False
    if len(etag) != 64:                                   # a git blob's sha1 (a small text file): its size decides
        return True
    h = hashlib.sha256()
    with open(local, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest() == etag


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__.split("\n\n")[1])
        return 2
    root, update = args[0], "--update" in sys.argv[1:]
    lists, offline, seen, out = {}, [], set(), []
    get_bytes = get_files = 0
    for line in sys.stdin:
        cols = line.rstrip("\n").split("\t")
        if len(cols) < 5 or line.startswith("#"):
            continue
        repo, rev, pattern, base, pack = cols[:5]
        if (repo, rev) not in lists:
            try:
                lists[(repo, rev)] = expected_files(repo, rev)
            except Exception:  # offline, or the revision is gone: said, never guessed
                lists[(repo, rev)] = None
                offline.append(repo)
        remote = lists[(repo, rev)]
        if remote is None:
            continue
        names = [pattern] if pattern in remote else sorted(p for p in remote if fnmatch.fnmatch(p, pattern))
        if not names:
            out.append(("gone", 0, repo, rev, pattern, base, pack))
            continue
        for path in names:
            if os.path.basename(path) == ".gitattributes" or (repo, path, base) in seen:
                continue
            seen.add((repo, path, base))
            size = remote[path].get("size") or 0
            local = place(root, base, path)
            if not os.path.isfile(local):
                if update and pack != "newdefault":
                    continue
                state = "get"
            elif os.path.getsize(local) != size:
                state = "changed" if ours_unchanged(root, base, path, local) else "kept"
            else:
                state = "here"
            if state in ("get", "changed"):
                get_bytes += size
                get_files += 1
            out.append((state, size, repo, rev, path, base, pack))
    for row in out:
        print("\t".join(str(c) for c in row))
    for repo in offline:
        print(f"#offline\t{repo}")
    try:
        st = os.statvfs(root)
        free = st.f_bavail * st.f_frsize
    except OSError:
        free = -1
    print(f"#total\t{get_bytes}\t{get_files}\t{free}")
    return 2 if offline else 0


if __name__ == "__main__":
    sys.exit(main())
