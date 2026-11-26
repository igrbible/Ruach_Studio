#!/usr/bin/env python3
"""hf_channels.py · the second channel: where a model file comes from when Hugging Face does not give it whole and right.

HERESY 2946 (Viktor 21.11.2026): a second way to every model file of the Studio, held to the same SHA-256.

Hugging Face stays first, always, and is not listed. heresy/hf-channels.tsv lists the others in the order they are tried, one a line:

    name <TAB> kind <TAB> where <TAB> split

    kind «endpoint»  a Hugging Face-compatible host: «hf download» runs again with HF_ENDPOINT=where and Xet off
    kind «url»       the address of one file, its fields filled in: {sha256}, {sha1} and {sha2} (its first one and two hex digits), {repo},
                     {owner}, {name}, {rev}, {path}, {file}, and {part}: "" for a whole file, ".part000", ".part001"… for the pieces of a
                     file over SPLIT bytes (GitHub takes no file of 2 GiB); https:// and file:// (a disk or a share)
    a line starting with # is off

A channel is asked only for a file whose SHA-256 is known before it comes (our manifest, heresy/hf-manifest.tsv, for goldhub/*;
Hugging Face's own pinned list for another's repo), and what it sends is that SHA-256 or nothing: a channel is never trusted for
content, whoever runs it. tools/hf_guard.py calls deliver() for a file Hugging Face did not give; tools/hf_expect.py calls
manifest_list() for our repo's pinned list when Hugging Face's cannot be read. Standard library only.
YUE2_HF_CHANNELS (another list) and YUE2_HF_MANIFEST (another manifest) are for the tests (tools/test_hf_channels.sh).
"""
import hashlib
import http.client
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                         # the Studio: this file is in its tools/
OURS = ("goldhub/",)
TIMEOUT = 30                                         # seconds without a byte before a channel counts as failed
BLOCK = 1 << 22
SPOT = ".channels"                                   # each channel's own folder inside the guard's part folder


def channels_file():
    return os.environ.get("YUE2_HF_CHANNELS") or os.path.join(ROOT, "heresy", "hf-channels.tsv")


def manifest_file():
    return os.environ.get("YUE2_HF_MANIFEST") or os.path.join(ROOT, "heresy", "hf-manifest.tsv")


def load():
    """[{name, kind, where, split}] in their order; a missing or unreadable list is none: Hugging Face alone, as before."""
    out = []
    try:
        with open(channels_file(), encoding="utf-8") as f:
            for line in f:
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                c = [x.strip() for x in line.rstrip("\n").split("\t")]
                if len(c) >= 3 and c[0] and c[1] in ("endpoint", "url") and c[2]:
                    out.append({"name": c[0], "kind": c[1], "where": c[2], "split": int(c[3]) if len(c) > 3 and c[3].isdigit() else 0})
    except OSError:
        pass
    return out


def manifest_list(repo, rev):
    """{path: {size, sha256}} of our repo at a pin from our manifest, standing for Hugging Face's pinned list when that cannot be read;
    None for another's repo or a pin the manifest does not know (then nothing stands for it: offline, as before)."""
    if not repo.startswith(OURS):
        return None
    out = {}
    try:
        with open(manifest_file(), encoding="utf-8") as f:
            for line in f:
                c = line.rstrip("\n").split("\t")
                if len(c) >= 5 and c[0] == repo and c[1] == rev and c[3].isdigit():
                    out[c[2]] = {"size": int(c[3]), "sha256": c[4].strip().lower()}
    except OSError:
        return None
    return out or None


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(BLOCK), b""):
            h.update(block)
    return h.hexdigest()


def fill(template, repo, rev, path, sha, part=""):
    owner, _, name = repo.partition("/")
    q = lambda s: urllib.parse.quote(s, safe="/")  # noqa: E731
    vals = {"sha256": sha, "sha1": sha[:1], "sha2": sha[:2], "repo": repo, "owner": owner, "name": name, "rev": rev, "path": q(path),
            "file": q(os.path.basename(path)), "part": part}
    return re.sub(r"\{(\w+)\}", lambda m: vals.get(m.group(1), m.group(0)), template)


def shown(url):
    """An address as a line may say it: no query (a signed link's keys), no user:password."""
    u = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((u.scheme, u.hostname or "", u.path, "", "")) if u.scheme != "file" else url


def rehash(f, upto):
    h = hashlib.sha256()
    f.seek(0)
    left = upto
    while left:
        b = f.read(min(BLOCK, left))
        if not b:
            break
        h.update(b)
        left -= len(b)
    return h


def fetch_url(ch, repo, rev, path, size, sha, dest):
    """The file from a «url» channel into DEST: None when it came SIZE bytes with SHA (hashed as it streams), else why not. A piece cut
    short is gone on from by a Range next time; a whole file that came wrong is removed (it must not be gone on from)."""
    step = ch["split"] if ch["split"] and size > ch["split"] else 0
    if step and "{part}" not in ch["where"]:
        return f"no {{part}} in its address, and the file is over {step} bytes"
    pieces = -(-size // step) if step else 1
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "r+b" if os.path.isfile(dest) else "w+b") as f:
        f.seek(0, 2)
        have = f.tell()
        if have > size:
            f.truncate(0)
            have = 0
        h = rehash(f, have)
        for k in range(pieces):
            start, end = (k * step, min(size, (k + 1) * step)) if step else (0, size)
            if have >= end:
                continue
            url = fill(ch["where"], repo, rev, path, sha, f".part{k:03d}" if step else "")
            off = have - start
            req = urllib.request.Request(url, headers={"User-Agent": "RuachStudio-fetch", **({"Range": f"bytes={off}-"} if off else {})})
            try:
                r = urllib.request.urlopen(req, timeout=TIMEOUT)
            except urllib.error.HTTPError as e:
                return f"{shown(url)}: HTTP {e.code}"
            except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError) as e:
                return f"{shown(url)}: {getattr(e, 'reason', None) or e!r}"
            with r:
                if off and getattr(r, "status", None) != 206:       # the whole piece again: what was here of it goes
                    f.truncate(start)
                    have, h = start, rehash(f, start)
                f.seek(have)
                try:
                    for b in iter(lambda: r.read(BLOCK), b""):
                        if have + len(b) > end:
                            f.truncate(start)
                            return f"{shown(url)}: more than the {end - start} bytes it should be"
                        f.write(b)
                        h.update(b)
                        have += len(b)
                except (http.client.HTTPException, OSError, ValueError) as e:   # a cut: the bytes so far stay for the next run
                    return f"{shown(url)}: cut at {have} of {size} bytes ({e}); the next run goes on from there"
            if have != end:
                return f"{shown(url)}: {have - start} of {end - start} bytes; the next run goes on from there"
        f.flush()
        os.fsync(f.fileno())
    got = h.hexdigest()
    if got != sha:
        os.unlink(dest)
        return f"SHA-256 {got[:16]}…, not the pinned {sha[:16]}…: removed"
    return None


def fetch_endpoint(ch, hf, repo, rev, path, into):
    """The file from an «endpoint» channel (a Hugging Face-compatible host) into INTO/PATH: (its path, None) or (None, why not)."""
    env = dict(os.environ, HF_ENDPOINT=ch["where"].rstrip("/"), HF_HUB_DISABLE_XET="1")
    cmd = [hf, "download", repo, path, "--revision", rev, "--local-dir", into, "--quiet"]
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True, errors="replace", env=env, encoding="utf-8")
        said, rc = p.stdout or "", p.returncode
    except OSError as e:
        said, rc = str(e), 127
    got = os.path.join(into, path)
    if rc == 0 and os.path.isfile(got):
        return got, None
    last = " ".join(ln.strip() for ln in said.splitlines() if ln.strip() and "%|" not in ln)[-160:]
    return None, f"hf exit {rc}{': ' + last if last else ''}"


def deliver(repo, rev, path, size, sha, part, hf):
    """PATH of REPO at REV from the channels in their order, into the guard's part folder PART: (channel, file) for the first that
    sends SIZE bytes with SHA, or (None, ["channel: why not", …]). Never a file that is not that SHA-256."""
    tried = []
    for ch in load():
        try:
            got, why = one(ch, repo, rev, path, size, sha, part, hf)
        except Exception as e:  # a channel that breaks is a channel that failed, never a guard that falls over
            got, why = None, f"{type(e).__name__}: {e}"
        if why is None:
            return ch["name"], got
        tried.append(f"{ch['name']}: {why}")
    return None, tried


def one(ch, repo, rev, path, size, sha, part, hf):
    """(file, None) when channel CH sent PATH whole with SHA, else (None, why not)."""
    spot = os.path.join(part, SPOT, re.sub(r"[^A-Za-z0-9._-]", "_", ch["name"]))
    if ch["kind"] == "endpoint":
        got, why = fetch_endpoint(ch, hf, repo, rev, path, spot)
        if got:
            n = os.path.getsize(got)
            why = (f"{n} bytes, the pinned size is {size}" if n != size else
                   None if sha256(got) == sha else "its SHA-256 is not the pinned one")
            if why:
                os.unlink(got)
    else:
        dest = os.path.join(spot, path + ".incomplete")
        why = fetch_url(ch, repo, rev, path, size, sha, dest)
        got = dest[:-len(".incomplete")]
        if why is None:
            os.replace(dest, got)
        elif os.path.isfile(dest) and os.path.getsize(dest) == 0:
            os.unlink(dest)
    return (got, None) if why is None else (None, why)


def record(top, records, rel, rev, sha):
    """The record the pinned downloader keeps beside a file (the commit, the etag, the time), written for a file a channel delivered:
    models_plan.py then knows it as ours (a newer pin may replace it), hf_guard.py as checked, and hf download at that pin as here."""
    meta = os.path.join(top, records, rel + ".metadata")
    try:
        os.makedirs(os.path.dirname(meta), exist_ok=True)
        with open(meta, "w", encoding="utf-8") as f:
            f.write(f"{rev}\n{sha}\n{time.time()}\n")
    except OSError:
        pass
