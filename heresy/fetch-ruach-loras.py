#!/usr/bin/env python3
"""HERESY 1285 (Viktor 09.10.2026, his first install through Pinokio: «LoRA пока что не скачались»): Ruach Studio's own adapters,
goldhub/Ruach_Studio_LoRAs (six voices and two instruments, rank 16, 0.8 GB), into loras/ under the names the takes of the 💎 sets
use (voice-ru-f-contralto-154/voice-ru-f-contralto-154-e026.safetensors: the repo's voices/ and instruments/ folders left out), at
the revision heresy/hf-revisions.txt pins, each file counted only at that revision's exact size. Safe to run again: what is here
stays; a failed file is tried once more after half a minute (Hugging Face answers a burst of requests with 429), and its reason
is said. Its samples (mp3) and pictures stay on Hugging Face.

    .venv/bin/python heresy/fetch-ruach-loras.py           fetch what is missing
    .venv/bin/python heresy/fetch-ruach-loras.py --check   say what is here and what is missing, download nothing
    .venv/bin/python heresy/fetch-ruach-loras.py --replace a file here that differs from the pinned one too (set aside first)

HERESY 1296: a file here of another size is someone's own copy (the Forge's voices are the published ones with their readers' names
still in the header): kept and said «differs», never taken for missing or written over without --replace.
HERESY 1441 (Viktor 14.10.2026: «пользователь волен переименовать скачанное»): known by its content first: the same tensors with another
header (goldhub/Ruach_Studio_Models_v2's MANIFEST.tsv names them), or the same file under another name in loras/, is here.

The last line is for heresy/fetch-heresy.sh: «#counts here=N fetched=N missing=N failed=N differs=N».
"""
import os
import shutil
import sys
import time

# HERESY 1445 (Viktor 14.10.2026: «Лучше всё тянуть Студии из одного репо»): from our models repo v2, where loras/<folder>/ holds
# the same files as goldhub/Ruach_Studio_LoRAs; the folders of the Kit's library there are its own downloader's (tools/download-loras.sh)
REPO = "goldhub/Ruach_Studio_Models_v2"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = "--check" in sys.argv[1:]
REPLACE = "--replace" in sys.argv[1:]            # HERESY 1296
COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G, Y, R, D, X = ("\033[1;32m", "\033[1;33m", "\033[1;31m", "\033[2m", "\033[0m") if COLOR else ("",) * 5
counts = {"here": 0, "fetched": 0, "missing": 0, "failed": 0, "differs": 0}


def kit_folders():
    """the folders tools/download-loras.sh fills (its entries' first field): the Kit's library, not ours to fetch"""
    import re
    try:
        return set(re.findall(r'^\s*"([^|"]+)\|', open(os.path.join(ROOT, "tools", "download-loras.sh"), encoding="utf-8").read(), re.M))
    except OSError:
        return set()


def say(kind, what, note=""):
    colour = {"here": G, "fetched": G, "missing": Y, "failed": R, "differs": Y}[kind]
    print(f"{colour}{kind:<9}{X} {what} {D}{note}{X}".rstrip())
    counts[kind] += 1


def pin():
    """ours first (heresy/hf-revisions.txt), then the Kit's (tools/hf-revisions.txt); none: main, said aloud"""
    for f in (os.path.join(ROOT, "heresy", "hf-revisions.txt"), os.path.join(ROOT, "tools", "hf-revisions.txt")):
        try:
            for line in open(f, encoding="utf-8"):
                parts = line.split("#")[0].split()
                if len(parts) >= 2 and parts[0] == REPO:
                    return parts[1]
        except OSError:
            pass
    return "main"


def by_content():
    """HERESY 1441: tools/hf_expect.py's finder with v2's MANIFEST.tsv at its pin (the tensors' sums); None when it cannot be had."""
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("hf_expect", os.path.join(ROOT, "tools", "hf_expect.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
    except (OSError, ImportError, SyntaxError):
        return None
    if not hasattr(m, "find_by_content"):
        return None
    v2 = ""
    for f in (os.path.join(ROOT, "heresy", "hf-revisions.txt"),):
        try:
            for line in open(f, encoding="utf-8"):
                parts = line.split()
                if len(parts) >= 2 and parts[0] == "goldhub/Ruach_Studio_Models_v2":
                    v2 = parts[1]
        except OSError:
            pass
    tens = m.manifest_tensors("goldhub/Ruach_Studio_Models_v2@" + v2) if v2 else {}
    ids = m.load_ids()

    def find(folder, size, sha):
        hit = m.find_by_content(folder, size, sha, tens.get(sha or ""), ids)
        m.save_ids(ids)
        return hit
    return find


def main():
    try:
        from huggingface_hub import HfApi, hf_hub_download
    except ImportError:
        say("failed", "loras/ (the studio's own)", "(no huggingface_hub in .venv: tools/hf-env.sh installs it)")
        return
    rev = pin()
    tag = f"({REPO} @ {rev[:7]})" if rev != "main" else f"({REPO} @ main: not pinned)"
    try:
        info = HfApi().model_info(REPO, revision=rev, files_metadata=True)
    except Exception as e:                                   # offline, or the repo gone: not a verdict on what is here
        print(f"{Y}unknown{X}   loras/ (the studio's own) {D}{tag}: the file list could not be read ({str(e)[:160]}){X}")
        return
    kit = kit_folders()                                   # HERESY 1445: loras/<folder>/<file>, the Kit's folders left out
    files = [s for s in info.siblings if s.rfilename.endswith(".safetensors") and len(s.rfilename.split("/")) == 3
             and s.rfilename.split("/")[0] == "loras" and s.rfilename.split("/")[1] not in kit]
    hfx = by_content()                                    # HERESY 1441
    stage = os.path.join(ROOT, "tmp", "ruach-loras")
    for s in sorted(files, key=lambda s: s.rfilename):
        parts = s.rfilename.split("/")                      # loras/<folder>/<file>
        rel = os.path.join(parts[1], parts[-1])
        dest = os.path.join(ROOT, "loras", rel)
        if os.path.isfile(dest) and os.path.getsize(dest) == s.size:
            say("here", "loras/" + rel, tag)
            continue
        if hfx:                                              # HERESY 1441: the same adapter, another name or header
            other = hfx(os.path.join(ROOT, "loras"), s.size, s.lfs.sha256 if s.lfs else None)
            if other:
                same = os.path.exists(dest) and os.path.samefile(other, dest)
                say("here", "loras/" + rel, f"{tag} — " + ("its header its own, the same weights" if same else
                                                         f"as loras/{os.path.relpath(other, os.path.join(ROOT, 'loras'))}, the same weights"))
                continue
        if os.path.isfile(dest) and (CHECK or not REPLACE):  # HERESY 1296: someone's own copy, kept
            say("differs", "loras/" + rel, f"{tag} — kept: the copy here differs from the published file (--replace fetches it)")
            continue
        if os.path.isfile(dest):                           # --replace: the old copy steps aside whole
            aside = os.path.join(ROOT, "tmp", "replaced", time.strftime("%Y%m%d-%H%M%S"), "loras", rel)
            os.makedirs(os.path.dirname(aside), exist_ok=True)
            shutil.move(dest, aside)
            print(f"{D}          the old copy → {os.path.relpath(aside, ROOT)}{X}")
        if CHECK:
            say("missing", "loras/" + rel, f"{tag}, {s.size / 2**20:.0f} MB")
            continue
        why = ""
        for attempt in (1, 2):
            try:
                got = hf_hub_download(REPO, s.rfilename, revision=rev, local_dir=stage)
                if os.path.getsize(got) != s.size:
                    raise OSError(f"{os.path.getsize(got)} bytes, the pinned file has {s.size}")
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                shutil.move(got, dest)                       # a rename on the same disk; a copy when loras/ lives on another
                why = ""
                break
            except Exception as e:
                why = str(e).strip().splitlines()[-1][:200] if str(e).strip() else type(e).__name__
                if attempt == 1:
                    print(f"{D}          failed once ({why}); once more in 30 s{X}")
                    time.sleep(30)
        if why:
            say("failed", "loras/" + rel, f"{tag}: {why}")
        else:
            say("fetched", "loras/" + rel, f"{tag}, {s.size / 2**20:.0f} MB")
    shutil.rmtree(stage, ignore_errors=True)                 # what the downloader kept beside the files (its own metadata)


main()
print("#counts " + " ".join(f"{k}={v}" for k, v in counts.items()))
sys.exit(1 if counts["failed"] else 0)
