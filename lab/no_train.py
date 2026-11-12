"""HERESY 2241 (Viktor 07.11.2026: the Reader's engine is the Pro one, and what it makes never enters a dataset or a training run): a take marked
never for training, said in three places so that every way of gathering finds it, whatever it reads:

  meta.json and request.json   "no_train": true, and "provenance": {"no_train", "by", "why", "at"} in meta.json (the lab's catalogue, the kitchens)
  the take's audio.wav         its own comment tag holds MARK, so a copy of the file carried anywhere (a raw folder of the Trainer, a kitchen's
                               list) still says it; ffmpeg keeps the tag when it converts the file

    mark(meta, by, why)        the fields set on a take's meta (or request), returned
    comment(by, why)           the text of the audio's comment tag
    of_take(folder)            why a take folder must stay out of training, or None
    of_file(path)              why an audio file must, by its take folder (meta.json beside it) or by its own comment tag; None when unmarked

From bash: python3 lab/no_train.py FILE_OR_TAKE…  prints each marked one with its reason and exits 1 when any is marked, 0 when none."""
import json
import subprocess
import sys
import time
from pathlib import Path

MARK = "ruach:no-train"


def mark(meta, by="", why=""):
    meta["no_train"] = True
    meta["provenance"] = {"no_train": True, "by": str(by)[:80], "why": str(why)[:300], "at": time.strftime("%Y-%m-%d %H:%M")}
    return meta


def comment(by="", why=""):
    return " · ".join(x for x in (MARK, str(by)[:80], str(why)[:200]) if x)


def _json(p):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def of_take(folder):
    d = Path(folder)
    for name in ("meta.json", "request.json"):
        j = _json(d / name)
        if isinstance(j, dict) and j.get("no_train"):
            prov = j.get("provenance") if isinstance(j.get("provenance"), dict) else {}
            return "marked never for training" + (f" ({prov.get('why')})" if prov.get("why") else "")
    return None


def _tag(path):
    """The file's comment tag as ffprobe reads it (WAV INFO ICMT, a FLAC or Ogg comment, an MP3's ID3 comment); "" when it has none or ffprobe
    cannot read it."""
    try:
        p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(path)],
                           capture_output=True, text=True, timeout=30)
        tags = (json.loads(p.stdout or "{}").get("format") or {}).get("tags") or {}
    except (OSError, ValueError, subprocess.SubprocessError):
        return ""
    return " ".join(str(v) for k, v in tags.items() if str(k).lower() in ("comment", "icmt", "description"))


def of_file(path):
    p = Path(path)
    if (p.parent / "meta.json").is_file():
        why = of_take(p.parent)
        if why:
            return why
    tag = _tag(p)
    return "its comment tag says never for training" if MARK in tag else None


if __name__ == "__main__":
    hit = 0
    for a in sys.argv[1:]:
        why = of_take(a) if Path(a).is_dir() else of_file(a)
        if why:
            hit += 1
            print(f"{a}: {why}")
    sys.exit(1 if hit else 0)
