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
    a = ap.parse_args()

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
    return 0


if __name__ == "__main__":
    sys.exit(main())
