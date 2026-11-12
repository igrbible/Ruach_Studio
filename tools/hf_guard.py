#!/usr/bin/env python3
"""hf_guard.py · the triple guard on every model file the Studio takes from our Hugging Face repos, and on what we give them.

Viktor 11.11.2026: «Тройного сторожа на выгрузках и скачиваниях моделей из наших репозиториев в 2.0.7 срезе. Сами репо не рефакторим,
чтобы не сломать 2.0.6 и ниже. Только локальное дерево с безопасным рефакторингом папок при апдейтах.»

    hf_guard.py download REPO [FILE ...] --revision REV --local-dir DIR [--include PATTERN ...] [--strip PREFIX] [--quiet]
        the guarded twin of «hf download», with its arguments: every file comes into DIR/.ruach-part/ first and is moved into its place
        only when (1) REV is a pinned commit, (2) the file has the pinned size, (3) its SHA-256 is the one our manifest
        (heresy/hf-manifest.tsv) holds for it at that pin. A file that fails a check never reaches its place: what was there stays,
        the part is removed, and its line says which check failed. A download that stops halfway leaves the downloader's own part
        (.incomplete, under DIR/.ruach-part/.cache) for the next run to go on from; nothing of it is used before it is whole and checked.
    hf_guard.py verify REPO --revision REV --local-dir DIR [FILE ...] [--include PATTERN ...] [--strip PREFIX]
        the same three checks on the files here, each hashed; nothing is downloaded
    hf_guard.py manifest REPO --revision REV [FILE ...] [--include PATTERN ...]
        our manifest's lines for a pin (the kitchen's, after an upload or a new pin): the large files' SHA-256 from the pinned list,
        the small ones (kept in git, not LFS) downloaded and hashed
    hf_guard.py upload REPO --parent REV --folder DIR [--path-in-repo P] [--message M] [--delete PATTERN ...] [--dry-run] [FILE ...]
        refused when the repo's head is not REV (a commit we did not read: someone else's, or a pin we never updated); committed with
        REV as its parent, so Hugging Face refuses it as well if the head moves meanwhile; then every uploaded file is downloaded back
        at the new commit and hashed against the local one. Prints the new commit; the manifest lines for it come from «manifest»
    hf_guard.py pins
        every pin of ours in heresy/hf-revisions.txt has its lines in our manifest (make-release asks it before a cut)

Our repos are goldhub/*: a file of theirs with no line in our manifest at its pin is refused («a pin moved without the manifest»), and
so is one whose pinned list disagrees with the manifest. Another's repo: the size and the SHA-256 its pinned commit lists (Hugging
Face's LFS record), said as such; a small file of theirs, its size. Our repos are never restructured for this: the paths stay as 2.0.6
and older read them.

Exit: 0 every file named is in place and checked; 1 something failed (each said on its line); 2 a pinned list could not be read
(offline); 3 an upload refused before anything was sent. Standard library only, except «upload» (huggingface_hub's HfApi).
YUE2_HF (another hf program), YUE2_HF_EXPECTED (fixture lists) and YUE2_HF_MANIFEST (another manifest) are for the tests
(tools/test_hf_guard.sh). (Claude, HERESY 2380, 11.11.2026)
"""
import argparse
import errno
import fnmatch
import hashlib
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                                   # the Studio: this file is in its tools/
sys.path.insert(0, HERE)
from hf_expect import expected_files  # noqa: E402  the pinned lists, and their cache in tmp/hf/expect

COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G, Y, R, D, X = ("\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m") if COLOR else ("",) * 5
OURS = ("goldhub/",)
PIN = re.compile(r"[0-9a-f]{40}")
PART = ".ruach-part"
RECORDS = os.path.join(".cache", "huggingface", "download")   # where the pinned downloader keeps a file's record beside a --local-dir


def ours(repo):
    return repo.startswith(OURS)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


def hf_program():
    return os.environ.get("YUE2_HF") or os.path.join(ROOT, ".venv", "bin", "hf")


def manifest_file():
    return os.environ.get("YUE2_HF_MANIFEST") or os.path.join(ROOT, "heresy", "hf-manifest.tsv")


def load_manifest():
    """{(repo, rev, path): (size, sha256)}; an unreadable or missing manifest is an empty one (and every file of ours is then refused)."""
    out = {}
    try:
        with open(manifest_file(), encoding="utf-8") as f:
            for line in f:
                if not line.strip() or line.startswith("#"):
                    continue
                cols = line.rstrip("\n").split("\t")
                if len(cols) >= 5 and cols[3].isdigit():
                    out[(cols[0], cols[1], cols[2])] = (int(cols[3]), cols[4].strip().lower())
    except OSError:
        pass
    return out


def wanted(remote, files, include, exclude=()):
    """The repo paths a call names, as the pinned downloader reads them: files as they are, else the include patterns (a pattern
    ending in «/» is the folder's every file), else the whole repo; never .gitattributes."""
    if files:
        names = list(files)
    elif include:
        pats = [p + "*" if p.endswith("/") else p for p in include]
        names = [p for p in remote if any(fnmatch.fnmatch(p, q) for q in pats)]
    else:
        names = list(remote)
    return sorted({p for p in names if os.path.basename(p) != ".gitattributes" and not any(fnmatch.fnmatch(p, q) for q in exclude)})


def expect(repo, rev, path, remote, man):
    """(what the file must be: {size, sha, by}, None) or (None, why it cannot be taken)."""
    info = remote.get(path)
    if info is None:
        return None, f"not in {repo} at {rev[:12]}"
    m = man.get((repo, rev, path))
    if m is None and ours(repo):
        return None, (f"no line in our manifest for {repo} @ {rev[:12]}: a pin moved without the manifest "
                      f"(tools/hf_guard.py manifest {repo} --revision {rev})")
    if m is not None:
        if info.get("size") is not None and info["size"] != m[0]:
            return None, f"the pinned list says {info['size']} bytes, our manifest {m[0]}: refused"
        if info.get("sha256") and info["sha256"] != m[1]:
            return None, "the pinned list's SHA-256 is not our manifest's: refused"
        return {"size": m[0], "sha": m[1], "by": "our manifest"}, None
    if info.get("size") is None:
        return None, "the pinned list gives no size"
    if info.get("sha256"):
        return {"size": info["size"], "sha": info["sha256"], "by": "the pinned commit's own SHA-256"}, None
    return {"size": info["size"], "sha": None, "by": "its size (a small file of another's repo)"}, None


def local_rel(path, strip):
    return path[len(strip):] if strip and path.startswith(strip) else path


def record_says(record, sha, local):
    """The downloader's record beside a file (line 2 its etag, the LFS SHA-256; line 3 when it was written) names this SHA-256 and the
    file was not touched since: trusted as the downloader itself trusts it, so a pack of files here is not hashed again on every run."""
    try:
        with open(record, encoding="utf-8") as f:
            lines = f.read().splitlines()
        return len(lines) >= 3 and lines[1].strip().strip('"') == sha and float(lines[2]) >= os.path.getmtime(local) - 1
    except (OSError, ValueError):
        return False


def check_file(local, exp, record=None):
    """None when LOCAL is what EXP says; else what is wrong with it."""
    if not os.path.isfile(local):
        return "missing"
    size = os.path.getsize(local)
    if size != exp["size"]:
        return f"{size} bytes, the pinned size is {exp['size']}"
    if exp["sha"] and not (record and record_says(record, exp["sha"], local)):
        got = sha256(local)
        if got != exp["sha"]:
            return f"SHA-256 {got[:16]}…, {exp['by']} says {exp['sha'][:16]}…"
    return None


def place(src, target, exp):
    """SRC (checked) into TARGET: a rename on the same disk; across disks a copy beside TARGET, checked again, then renamed over it.
    Either way TARGET is the old file or the whole new one, never a half."""
    os.makedirs(os.path.dirname(target), exist_ok=True)
    try:
        os.replace(src, target)
        return
    except OSError as e:
        if e.errno != errno.EXDEV:
            raise
    tmp = target + PART
    try:
        shutil.copyfile(src, tmp)
        with open(tmp, "rb+") as f:
            os.fsync(f.fileno())
        bad = check_file(tmp, exp)
        if bad:
            raise OSError(f"the copy across disks came out wrong: {bad}")
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    os.unlink(src)


def prune(folder):
    """The part folder gone when nothing unfinished is left in it (the downloader's own .gitignore and locks with it); else its empty
    folders only, bottom up, so a download cut halfway goes on from its part next time."""
    if not any(n.endswith(".incomplete") for _, _, fs in os.walk(folder) for n in fs):
        shutil.rmtree(folder, ignore_errors=True)
        return
    for d, _, _ in sorted(os.walk(folder), key=lambda w: -len(w[0])):
        try:
            os.rmdir(d)
        except OSError:
            pass


def read_list(repo, rev):
    try:
        return expected_files(repo, rev), None
    except Exception as e:  # offline, or the revision is gone: said, never guessed
        return None, f"{Y}cannot read the pinned file list of {repo} @ {rev[:12]}{X} {D}({e}){X}"


def cmd_download(a, verify_only=False):
    repo, rev, top = a.repo, a.revision, os.path.abspath(a.local_dir)
    if not PIN.fullmatch(rev):
        if ours(repo):
            print(f"{R}refused{X}   {repo} @ {rev}: not a pinned commit; our files come only at the commit heresy/hf-revisions.txt pins")
            return 1
        print(f"{Y}not pinned{X} {repo} @ {rev}: another's repo, checked by what its list says at this moment")
    remote, err = read_list(repo, rev)
    if remote is None:
        print(err)
        return 2
    man = load_manifest()
    names = wanted(remote, a.files, a.include, a.exclude)
    if not names:
        print(f"{R}failed{X}    {repo} @ {rev[:12]}: nothing matches {' '.join(a.files or a.include) or 'the repo'}")
        return 1
    failed, need, plan = 0, [], {}
    for path in names:
        exp, why = expect(repo, rev, path, remote, man)
        rel = local_rel(path, a.strip)
        if exp is None:
            print(f"{R}refused{X}   {rel}: {why}")
            failed += 1
            continue
        target = os.path.realpath(os.path.join(top, rel))   # a bridge (a link at an old path) leads to the file itself
        bad = check_file(target, exp, None if verify_only else os.path.join(top, RECORDS, rel + ".metadata"))
        if bad is None:
            if not a.quiet or verify_only:
                print(f"{G}here{X}      {rel}  {D}(size and {'SHA-256' if exp['sha'] else 'no hash'}: {exp['by']}){X}")
            continue
        if verify_only:
            print(f"{R}{'missing' if bad == 'missing' else 'differs'}{X}   {rel}: {bad}")
            failed += 1
            continue
        need.append(path)
        plan[path] = (exp, rel, target)
    if verify_only or not need:
        return 1 if failed else 0

    part = os.path.join(top, PART)
    os.makedirs(part, exist_ok=True)
    cmd = [hf_program(), "download", repo, *need, "--revision", rev, "--local-dir", part]
    if a.quiet:
        cmd.append("--quiet")
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True, errors="replace")
        said, rc = p.stdout or "", p.returncode
    except OSError as e:
        said, rc = str(e), 127
    last = " ".join(ln.strip() for ln in said.splitlines() if ln.strip() and "%|" not in ln)[-240:]
    for path in need:
        exp, rel, target = plan[path]
        got = os.path.join(part, path)
        rec = os.path.join(part, RECORDS, path + ".metadata")
        if not os.path.isfile(got):
            unfinished = any(n.endswith(".incomplete") for _, _, fs in os.walk(os.path.join(part, RECORDS)) for n in fs)
            print(f"{R}failed{X}    {rel}: the download did not complete (hf exit {rc}{': ' + last if last else ''})"
                  + (f"; its unfinished part stays in {os.path.relpath(part, top)}/ for the next run to go on from" if unfinished else "")
                  + ("; what was here stays as it was" if os.path.exists(target) else ""))
            failed += 1
            continue
        bad = check_file(got, exp)
        if bad:
            for f in (got, rec):
                if os.path.exists(f):
                    os.unlink(f)
            print(f"{R}failed{X}    {rel}: {bad}; the download is removed"
                  + ("; what was here stays as it was" if os.path.exists(target) else "; nothing was put in its place"))
            failed += 1
            continue
        try:
            place(got, target, exp)
        except OSError as e:
            print(f"{R}failed{X}    {rel}: checked, but could not be put in its place ({e}); what was here stays as it was")
            failed += 1
            continue
        if os.path.isfile(rec):                      # its record beside it, as the downloader leaves one (models_plan.py reads it)
            dst = os.path.join(top, RECORDS, rel + ".metadata")
            try:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                os.replace(rec, dst)
            except OSError:
                pass
        if not a.quiet:
            print(f"{G}checked{X}   {rel}  {D}({exp['size']} bytes, {'SHA-256' if exp['sha'] else 'size'}: {exp['by']}){X}")
    prune(part)
    return 1 if failed else 0


def cmd_manifest(a):
    if not PIN.fullmatch(a.revision):
        print(f"a manifest is written for a pinned commit, not «{a.revision}»", file=sys.stderr)
        return 1
    remote, err = read_list(a.repo, a.revision)
    if remote is None:
        print(err, file=sys.stderr)
        return 2
    names = wanted(remote, a.files, a.include)
    small = [p for p in names if not remote[p].get("sha256")]
    sums, where = {}, os.path.join(ROOT, "tmp", "hf-guard-manifest", a.repo.replace("/", "__") + "@" + a.revision)
    if small:
        os.makedirs(where, exist_ok=True)
        r = subprocess.run([hf_program(), "download", a.repo, *small, "--revision", a.revision, "--local-dir", where, "--quiet"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        for p in small:
            f = os.path.join(where, p)
            if not os.path.isfile(f) or os.path.getsize(f) != remote[p]["size"]:
                print(f"{p}: the small file did not come whole ({r.stderr.strip()[-200:]})", file=sys.stderr)
                shutil.rmtree(where, ignore_errors=True)
                return 1
            sums[p] = sha256(f)
        shutil.rmtree(where, ignore_errors=True)
    for p in names:
        print(f"{a.repo}\t{a.revision}\t{p}\t{remote[p]['size']}\t{remote[p].get('sha256') or sums[p]}")
    return 0


def pin_lines():
    """(repo, rev) of every pin of ours: heresy/hf-revisions.txt (a «REPO#part» line is the same repo at another pin)."""
    out = []
    for f in (os.path.join(ROOT, "heresy", "hf-revisions.txt"), os.path.join(ROOT, "tools", "hf-revisions.txt")):
        try:
            with open(f, encoding="utf-8") as h:
                for line in h:
                    cols = [] if line.lstrip().startswith("#") else line.split()
                    if len(cols) >= 2 and ours(cols[0]):
                        out.append((cols[0].split("#")[0], cols[1]))
        except OSError:
            pass
    return out


def cmd_pins(_a):
    man, bad = load_manifest(), 0
    pinned = {(r, v) for (r, v, _p) in man}
    for repo, rev in pin_lines():
        if (repo, rev) in pinned:
            print(f"{G}in the manifest{X} {repo} @ {rev[:12]} {D}({sum(1 for k in man if k[:2] == (repo, rev))} files){X}")
        else:
            print(f"{R}not in the manifest{X} {repo} @ {rev[:12]}: tools/hf_guard.py manifest {repo} --revision {rev} >> heresy/hf-manifest.tsv")
            bad += 1
    return 1 if bad else 0


def cmd_upload(a, api=None, fetch_back=None):
    """API and FETCH_BACK stand in for huggingface_hub in the tests; the real ones otherwise."""
    if api is None or fetch_back is None:
        from huggingface_hub import HfApi, hf_hub_download
        api = api or HfApi()
        fetch_back = fetch_back or (lambda repo, path, rev, into: hf_hub_download(repo, path, revision=rev, local_dir=into))
    from huggingface_hub import CommitOperationAdd, CommitOperationDelete
    folder = os.path.abspath(a.folder)
    files = a.files or sorted(os.path.relpath(os.path.join(d, n), folder) for d, ds, ns in os.walk(folder)
                              for n in ns if not os.path.relpath(d, folder).split(os.sep)[0] in (".cache", ".git"))
    if not files:
        print(f"{R}refused{X}   nothing to upload in {folder}")
        return 3
    head = api.repo_info(a.repo, revision=a.branch).sha
    if head != a.parent:
        print(f"{R}refused{X}   {a.repo}: its head is {head[:12]}, not {a.parent[:12]}: a commit since the one read (someone else's, or a pin not "
              f"updated). Read the repo at its head, then upload with --parent {head}")
        return 3
    prefix = a.path_in_repo.strip("/")
    local = {}
    for rel in files:
        src = os.path.join(folder, rel)
        local[(prefix + "/" + rel) if prefix else rel] = (src, os.path.getsize(src), sha256(src))
    ops = [CommitOperationAdd(path_in_repo=p, path_or_fileobj=v[0]) for p, v in sorted(local.items())]
    if a.delete:
        there = api.list_repo_files(a.repo, revision=head)
        ops += [CommitOperationDelete(path_in_repo=p) for p in there if p not in local and any(fnmatch.fnmatch(p, q) for q in a.delete)]
    print(f"{D}{a.repo} @ {head[:12]}: {len(local)} to upload{', ' + str(len(ops) - len(local)) + ' to delete' if len(ops) > len(local) else ''}{X}")
    if a.dry_run:
        return 0
    commit = api.create_commit(a.repo, operations=ops, commit_message=a.message, parent_commit=head, revision=a.branch)
    new = getattr(commit, "oid", None) or api.repo_info(a.repo, revision=a.branch).sha
    back = os.path.join(ROOT, "tmp", "hf-guard-back", new)
    failed = 0
    for p, (src, size, sha) in sorted(local.items()):
        try:
            got = fetch_back(a.repo, p, new, back)
            gsize, gsha = os.path.getsize(got), sha256(got)
        except Exception as e:  # said, never taken for a pass
            print(f"{R}failed{X}    {p}: could not be downloaded back at {new[:12]} ({e})")
            failed += 1
            continue
        if (gsize, gsha) != (size, sha):
            print(f"{R}failed{X}    {p}: downloaded back {gsize} bytes, SHA-256 {gsha[:16]}…; sent {size} bytes, {sha[:16]}…")
            failed += 1
        elif not a.quiet:
            print(f"{G}checked{X}   {p}  {D}(downloaded back at {new[:12]}: {size} bytes, the same SHA-256){X}")
    shutil.rmtree(back, ignore_errors=True)
    print(f"{a.repo} @ {new}: {len(local) - failed} of {len(local)} uploaded files downloaded back whole"
          + (f", {R}{failed} not{X}" if failed else "") + f"\n{D}next: the pin in heresy/hf-revisions.txt and "
          f"tools/hf_guard.py manifest {a.repo} --revision {new} into heresy/hf-manifest.tsv{X}")
    return 1 if failed else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("download", "verify", "manifest"):
        s = sub.add_parser(name)
        s.add_argument("repo")
        s.add_argument("files", nargs="*")
        s.add_argument("--revision", required=True)
        s.add_argument("--include", nargs="*", default=[])
        s.add_argument("--exclude", nargs="*", default=[])
        if name != "manifest":
            s.add_argument("--local-dir", required=True)
            s.add_argument("--strip", default="")
            s.add_argument("--quiet", action="store_true")
    s = sub.add_parser("upload")
    s.add_argument("repo")
    s.add_argument("files", nargs="*")
    s.add_argument("--parent", required=True)
    s.add_argument("--folder", required=True)
    s.add_argument("--branch", default="main")
    s.add_argument("--path-in-repo", default="")
    s.add_argument("--message", default="Upload through tools/hf_guard.py")
    s.add_argument("--delete", nargs="*", default=[])
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--quiet", action="store_true")
    sub.add_parser("pins")
    a = ap.parse_args(argv)
    if a.cmd == "download":
        return cmd_download(a)
    if a.cmd == "verify":
        return cmd_download(a, verify_only=True)
    if a.cmd == "manifest":
        return cmd_manifest(a)
    if a.cmd == "upload":
        return cmd_upload(a)
    return cmd_pins(a)


if __name__ == "__main__":
    sys.exit(main())
