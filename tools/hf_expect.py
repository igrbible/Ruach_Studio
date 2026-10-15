#!/usr/bin/env python3
"""Is a local copy of a Hugging Face repo complete? Exit status 0 says so, 1 lists what is missing or
wrong, 2 means the expected file list could not be read (offline). An exit status 0 from the
downloader is not proof: this checks the files themselves.

    hf_expect.py --repo OWNER/NAME --rev COMMIT --dir LOCAL_DIR
                 [--include PATTERN ...]      only the files these patterns match (as the download did)
                 [--files PATH ...]           exactly these repo paths
                 [--strip PREFIX]             repo paths lose this prefix locally (a subfolder moved up)
                 [--catalog]                  also every slider weight catalog.json names, with its SHA-256
                 [--hash]                     also the SHA-256 of every large (LFS) file (slow on big ones)
                 [--by-content]               a file missing where the repo puts it (or of another size there) is looked for in
                                              the same folder by its content: its SHA-256, or a .safetensors' tensors' SHA-256
                 [--manifest OWNER/NAME@REV]  where the tensors' sums come from (a MANIFEST.tsv: path, bytes, sha256, tensors_sha256)

The expected list is the pinned revision's own (name, size, LFS SHA-256) from the Hugging Face API,
or, when YUE2_HF_EXPECTED=DIR is set, DIR/<owner>__<name>.json in the same shape (for the tests).
A pinned revision (a full commit id) never changes, so its list is cached in
tmp/hf/expect/<owner>__<name>@<commit>.json and Hugging Face is asked only once; a branch such as
"main" is never cached. YUE2_HF_CACHE_READONLY=1 reads the cache but writes nothing (the download
scripts' --check and --verify modes). Standard library only.
"""
import argparse
import fnmatch
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.request

# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G, Y, R, D, X = ("\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m") if COLOR else ("",) * 5
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the install: this file is in tools/
CACHE = os.path.join(ROOT, "tmp", "hf", "expect")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


# HERESY 1441 (Viktor 14.10.2026: «пользователь волен переименовать скачанное»): a file known by its content, not its name
IDS = os.path.join(ROOT, "tmp", "hf", "content-ids.json")


def tensors_sha256(path):
    """The SHA-256 of a .safetensors' tensors alone (each name and its data, in name order; the header's metadata aside): the same
    adapter whatever its file is called and whatever its header says of it."""
    import struct
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        if n > min(os.path.getsize(path), 1 << 28):            # not a .safetensors at all
            raise ValueError("no safetensors header")
        head = json.loads(f.read(n))
        base, h = 8 + n, hashlib.sha256()
        for k in sorted(k for k in head if k != "__metadata__"):
            a, b = head[k]["data_offsets"]
            f.seek(base + a)
            h.update(k.encode())
            left = b - a
            while left:
                chunk = f.read(min(left, 1 << 22))
                if not chunk:
                    break
                h.update(chunk)
                left -= len(chunk)
    return h.hexdigest()


def content_ids(path, want_tensors=False, ids=None):
    """{sha256, tensors} of a local file, kept in tmp/hf/content-ids.json by its real path, size and time (read once)."""
    ids = ids if ids is not None else {}
    st = os.stat(path)
    key = f"{os.path.realpath(path)}|{st.st_size}|{int(st.st_mtime)}"
    rec = ids.get(key) or {}
    if "sha256" not in rec:
        rec["sha256"] = sha256(path)
    if want_tensors and path.endswith(".safetensors") and "tensors" not in rec:
        try:
            rec["tensors"] = tensors_sha256(path)
        except Exception:                                     # not a .safetensors (whatever its name says): no sum
            rec["tensors"] = ""
    ids[key] = rec
    return rec


def load_ids():
    try:
        with open(IDS, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_ids(ids):
    if os.environ.get("YUE2_HF_CACHE_READONLY") == "1":
        return
    try:
        write_atomic(IDS, ids)
    except OSError:
        pass


def find_by_content(folder, size, sha, tensors=None, ids=None, skip=()):
    """A file under FOLDER that is the expected one by its content: of its size with its SHA-256, or a .safetensors with its tensors'
    SHA-256. Its path, or None."""
    if not os.path.isdir(folder):
        return None
    tensors = tensors if tensors not in ("", "-") else None
    found = None
    for dirpath, dirs, files in os.walk(folder, followlinks=True):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in files:
            p = os.path.join(dirpath, name)
            if p in skip or name.startswith("."):
                continue
            try:
                got = os.path.getsize(p)
                if size is not None and got == size and sha and content_ids(p, False, ids)["sha256"] == sha:
                    return p
                # a header rewritten moves the size by a few bytes: only those near its size are read for their tensors
                if tensors and name.endswith(".safetensors") and (size is None or abs(got - size) < (1 << 20)) and content_ids(p, True, ids).get("tensors") == tensors:
                    found = found or p
            except OSError:
                continue
    return found


def manifest_tensors(spec):
    """{file sha256: tensors sha256} from a repo's MANIFEST.tsv at a revision (OWNER/NAME@REV), cached as the file lists are."""
    if not spec or "@" not in spec:
        return {}
    repo, rev = spec.rsplit("@", 1)
    cached = os.path.join(CACHE, f"{repo.replace('/', '__')}@{rev}.manifest.json") if re.fullmatch(r"[0-9a-f]{40}", rev) else None
    if cached and os.path.isfile(cached):
        try:
            with open(cached, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            pass
    try:
        with urllib.request.urlopen(f"https://huggingface.co/{repo}/resolve/{rev}/MANIFEST.tsv", timeout=30) as r:
            text = r.read().decode("utf-8")
    except Exception:
        return {}
    out = {}
    for line in text.splitlines()[1:]:
        c = line.split("\t")
        if len(c) >= 4 and c[2] and c[3] not in ("", "-"):
            out[c[2]] = c[3]
    if cached and out and os.environ.get("YUE2_HF_CACHE_READONLY") != "1":
        try:
            write_atomic(cached, out)
        except OSError:
            pass
    return out


def cache_path(repo, rev):
    """Where a pinned revision's file list is cached, or None for a revision that can move (a branch)."""
    if not re.fullmatch(r"[0-9a-f]{40}", rev):
        return None
    return os.path.join(CACHE, f"{repo.replace('/', '__')}@{rev}.json")


def write_atomic(path, data):
    """Write JSON to a temporary file beside PATH, then rename it over PATH: never a half-written cache."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".", suffix=".part")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def expected_files(repo, rev):
    """{path: {size, sha256}} of the revision: from the fixtures (tests), the cache, or Hugging Face."""
    fixtures, cached = os.environ.get("YUE2_HF_EXPECTED"), None
    if fixtures:
        with open(os.path.join(fixtures, repo.replace("/", "__") + ".json"), encoding="utf-8") as f:
            data = json.load(f)
    else:
        cached = cache_path(repo, rev)
        if cached and os.path.isfile(cached):
            try:
                with open(cached, encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                pass                                   # unreadable: ask again (and rewrite it below)
        url = f"https://huggingface.co/api/models/{repo}/revision/{rev}?blobs=true"
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.load(r)
    out = {}
    for s in data.get("siblings", []):
        lfs = s.get("lfs") or {}
        out[s["rfilename"]] = {"size": lfs.get("size", s.get("size")), "sha256": lfs.get("sha256")}
    if not fixtures and cached and out and os.environ.get("YUE2_HF_CACHE_READONLY") != "1":
        try:
            write_atomic(cached, out)
        except OSError:
            pass                                       # a cache only: a read-only install still works
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--rev", default="main")
    ap.add_argument("--dir", required=True)
    ap.add_argument("--include", nargs="*", default=[])
    ap.add_argument("--files", nargs="*", default=[])
    ap.add_argument("--strip", default="")
    ap.add_argument("--catalog", action="store_true")
    ap.add_argument("--hash", action="store_true")
    ap.add_argument("--by-content", action="store_true")
    ap.add_argument("--manifest", default="")
    a = ap.parse_args()
    ids, tens, known = (load_ids(), manifest_tensors(a.manifest), []) if a.by_content else ({}, {}, [])

    try:
        remote = expected_files(a.repo, a.rev)
    except Exception as e:  # offline, or the revision is gone
        print(f"{Y}cannot read the file list of {a.repo} @ {a.rev[:12]}{X} {D}({e}){X}")
        return 2

    if a.files:
        wanted = list(a.files)
    elif a.include:
        wanted = [p for p in remote if any(fnmatch.fnmatch(p, pat) for pat in a.include)]
    else:
        wanted = list(remote)
    wanted = [p for p in wanted if os.path.basename(p) != ".gitattributes"]   # git metadata, not needed

    problems, total = [], 0
    for path in sorted(wanted):
        info = remote.get(path)
        if info is None:
            problems.append(f"{path}: not in {a.repo} at {a.rev[:12]}")
            continue
        rel = path[len(a.strip):] if a.strip and path.startswith(a.strip) else path
        local = os.path.join(a.dir, rel)
        if a.by_content and (not os.path.isfile(local) or (info["size"] is not None and os.path.getsize(local) != info["size"])):
            # HERESY 1441: there under another name, or its header rewritten: here all the same, nothing fetched again
            other = find_by_content(os.path.dirname(local) if os.path.isdir(os.path.dirname(local)) else a.dir, info["size"], info["sha256"],
                                    tens.get(info["sha256"] or ""), ids)
            if not other and os.path.dirname(local) != a.dir:
                other = find_by_content(a.dir, info["size"], info["sha256"], tens.get(info["sha256"] or ""), ids)
            if other:
                known.append(f"{rel} as {os.path.relpath(other, a.dir)}")
                total += os.path.getsize(other)
                continue
        if not os.path.isfile(local):
            problems.append(f"{rel}: missing")
            continue
        size = os.path.getsize(local)
        total += size
        if info["size"] is not None and size != info["size"]:
            problems.append(f"{rel}: {size} bytes, expected {info['size']} (incomplete or wrong)")
        elif a.hash and info["sha256"] and sha256(local) != info["sha256"]:
            problems.append(f"{rel}: SHA-256 differs from the pinned revision")
    if not wanted:
        problems.append("no files matched: the include patterns or the repo are wrong")

    if a.catalog:
        cat_path = os.path.join(a.dir, "catalog.json")
        try:
            with open(cat_path, encoding="utf-8") as f:
                catalog = json.load(f)
            sliders = catalog.get("sliders", [])
            if not sliders:
                problems.append("catalog.json lists no sliders")
            for s in sliders:
                w = os.path.join(a.dir, s.get("weights", ""))
                if not s.get("weights") or not os.path.isfile(w) or os.path.getsize(w) == 0:
                    problems.append(f"slider {s.get('id')}: weights {s.get('weights')} missing")
                elif s.get("sha256") and sha256(w) != s["sha256"]:
                    problems.append(f"slider {s.get('id')}: weights do not match catalog.json's SHA-256")
        except (OSError, ValueError) as e:
            problems.append(f"catalog.json unreadable: {e}")

    if a.by_content:
        save_ids(ids)
    name = f"{a.repo} @ {a.rev[:12]}"
    if problems:
        print(f"{R}incomplete{X} {name}: {len(problems)} problem(s) in {len(wanted)} expected file(s)")
        for p in problems[:12]:
            print(f"  {D}{p}{X}")
        if len(problems) > 12:
            print(f"  {D}... and {len(problems) - 12} more{X}")
        return 1
    extra = f", {len(catalog.get('sliders', []))} slider weights match catalog.json" if a.catalog else ""
    print(f"{G}complete{X} {name}: {len(wanted)} file(s), {total / 1048576:.1f} MiB{extra}")
    for k in known[:12]:                                   # HERESY 1441
        print(f"  {D}here by its content: {k}{X}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
