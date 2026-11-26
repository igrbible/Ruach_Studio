#!/usr/bin/env python3
"""HERESY 2879 (Viktor 20.11.2026: «Давай и у нас в репо прикрутим такое», Pinokio's «Powered by»), HERESY 3000: the model cards of the models
the Studio runs on, each the README.md of its own Hugging Face repository, into models/misc/cards/<owner>--<name>/ (a few KB each): their
licences and credits beside the weights, readable offline. Until 2.1.0-rc3 only Pinokio's install.js fetched them; now the native install
does: launcher/install.sh on Linux, launcher/setup_win.py on Windows and macOS. A card of ours comes at the revision heresy/hf-revisions.txt
pins for its repository, m-a-p's at their main. Safe to run again: a card that is here stays.

    python launcher/fetch_cards.py          fetch what is missing; each card said: here, fetched, or failed with its reason
    python launcher/fetch_cards.py --check  say what is here and what is missing; nothing is fetched
Exit 0 when every card is here, 1 when one is missing (a card that did not come is said with its reason, never passed over in silence;
the Studio runs without them, and Install again fetches them).
"""
import argparse
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(os.path.abspath(__file__)).parent.parent
sys.path.insert(0, str(ROOT / "lab"))
import paths  # noqa: E402  (HERESY 2330: every place from lab/paths.py)

CARDS = [
    "goldhub/YuE2-RS-Finetunes",        # Ruach Studio's own fine-tunes and decoders (YuE2-VAE-RS), CC BY-NC-SA 4.0
    "goldhub/Ruach_Studio_Models_v2",   # m-a-p's models as GGUF (Serveurperso's, byte for byte), the Standard decoder, Whisper and the rest
    "m-a-p/YuE2-3B",                    # YuE2 itself, CC BY-NC 4.0
    "m-a-p/YuE2-Vae",                   # its decoder, CC BY-NC 4.0
    "m-a-p/SheetSage2",                 # the Musician's transcriber (Cover, Make it mine), CC BY-NC 4.0
]
CARDS_DIR = ROOT / paths.MISC / "cards"


def rev(repo):
    """The revision heresy/hf-revisions.txt pins for repo (its first «repo commit» line, not a «repo#part» one), else main."""
    for f in (os.environ.get("HF_REVS", ""), str(ROOT / "heresy" / "hf-revisions.txt")):
        if f and os.path.isfile(f):
            for line in open(f, encoding="utf-8"):
                p = line.split()
                if len(p) >= 2 and p[0] == repo:
                    return p[1]
    return "main"


def card_path(repo):
    return CARDS_DIR / repo.replace("/", "--") / "README.md"


def context():
    """certifi's roots where they are (a fresh Windows' Python trusts none yet, HERESY 2649), else the system's."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch(repo, timeout=30):
    """One card into its folder through a .part file; returns "" when it came, else the reason in words."""
    url = f"{os.environ.get('HF_ENDPOINT', 'https://huggingface.co').rstrip('/')}/{repo}/resolve/{rev(repo)}/README.md"
    dst = card_path(repo)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RuachStudio-install"})
        with urllib.request.urlopen(req, timeout=timeout, context=context()) as r:
            body = r.read(1 << 20)
    except urllib.error.HTTPError as e:
        return f"Hugging Face answered {e.code}"
    except (urllib.error.URLError, OSError, ValueError) as e:
        return f"no answer ({getattr(e, 'reason', e)})"
    if not body.strip():
        return "Hugging Face gave an empty card"
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_name(dst.name + ".part")
    part.write_bytes(body)
    os.replace(part, dst)
    return ""


def main(argv):
    ap = argparse.ArgumentParser(description=f"the model cards into {paths.MISC}/cards/")
    ap.add_argument("--check", action="store_true", help="say what is here and what is missing; fetch nothing")
    a = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # HERESY 2998: a console in cp1251 never stops a line
    except (AttributeError, ValueError):
        pass
    missing = 0
    for repo in CARDS:
        dst = card_path(repo)
        if dst.is_file() and dst.stat().st_size > 0:
            print(f"  card  {repo}: here")
            continue
        if a.check:
            print(f"  card  {repo}: missing")
            missing += 1
            continue
        why = fetch(repo)
        if why:
            print(f"  card  {repo}: failed, {why}")
            missing += 1
        else:
            print(f"  card  {repo}: fetched ({dst.stat().st_size} bytes)")
    try:
        rel = CARDS_DIR.relative_to(ROOT).as_posix()
    except ValueError:
        rel = CARDS_DIR.as_posix()
    print(f"  the model cards: {len(CARDS) - missing} of {len(CARDS)} in {rel}/" + ("" if not missing else " (the Studio runs without them; Install again fetches them)"))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
