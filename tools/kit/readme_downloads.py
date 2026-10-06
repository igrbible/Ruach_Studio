#!/usr/bin/env python3
"""The README's "What it downloads" section, made from the lists the install itself uses: the download
scripts' repo and file lists, the pinned revisions, loras/sources.json, and each pinned revision's file
sizes from the Hugging Face API (cached in tmp/kit-hf-files/: a pinned revision never changes).

    readme_downloads.py PINS UPSTREAM BASE GGML NPATCH [PROPS]

PINS is the kit's hf-revisions.txt; PROPS, a /props saved from a running server, adds each LoRA's halves.
Prints Markdown; says on stderr what it could not size (offline), and names every listed file or pattern
the pinned revision does not have (an error, never counted as 0 bytes). Standard library only.
"""
import fnmatch
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import hf_expect  # noqa: E402

pins_path, upstream, base, ggml, npatch = sys.argv[1:6]
props = json.load(open(sys.argv[6], encoding="utf-8")) if len(sys.argv) > 6 and os.path.isfile(sys.argv[6]) else {}
pins = dict(l.split() for l in open(pins_path, encoding="utf-8") if l.strip() and not l.startswith("#"))
with open(os.path.join(ROOT, "loras", "sources.json"), encoding="utf-8") as _f:
    sources = json.load(_f)
missing = []       # what could not be sized (offline) or is not in the pinned revision; printed on stderr


def not_in_revision(repo, what):
    msg = f"{repo} @ {pins.get(repo, 'main')[:12]}: {what} is not in the pinned revision"
    if msg not in missing:
        missing.append(msg)


def entries(script, var):
    body = open(os.path.join(ROOT, "tools", script), encoding="utf-8").read()
    block = re.search(var + r"=\(\n(.*?)\n\)", body, re.S).group(1)
    return [line.strip().strip('"').split("|") for line in block.splitlines() if line.strip().startswith('"')]


def files_of(repo):
    """{path: size} of the pinned revision, or None when Hugging Face cannot be asked."""
    rev = pins.get(repo, "main")
    cache = os.path.join(ROOT, "tmp", "kit-hf-files", repo.replace("/", "__") + "@" + rev + ".json")
    if os.path.isfile(cache):
        try:
            with open(cache, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            pass                                   # unreadable: ask again and rewrite it
    try:
        got = {p: (v["size"] or 0) for p, v in hf_expect.expected_files(repo, rev).items()}
    except Exception as e:
        missing.append(f"could not size {repo}: {e}")
        return None
    if rev != "main":
        # a temporary file beside it, renamed over it: an interrupted run never leaves half a cache
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(cache), prefix=".", suffix=".part")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(got, f)
        os.replace(tmp, cache)
    return got


def sizes_of(repo, files, paths):
    """The summed size of PATHS in the revision, or None when it is unknown or one is not there."""
    if files is None:
        return None
    absent = [p for p in paths if p not in files]
    for p in absent:
        not_in_revision(repo, p)
    return None if absent else sum(files[p] for p in paths)


def size(n):
    if n is None:
        return "?"
    # no-break spaces and hyphens: a narrow table column must not split "6.8 GB" or "add-on" in two;
    # anything under a megabyte (but not nothing) shows as 1 MB
    if n >= 1024 ** 3:
        return f"{n / 1024 ** 3:.1f}\u00a0GB"
    return f"{max(1 if n else 0, round(n / 1024 ** 2))}\u00a0MB"


def hf(repo, url=None):
    return f"[{repo}]({url or 'https://huggingface.co/' + repo}) <sub>`{pins.get(repo, 'main')[:7]}`</sub>"


def first_sentence(text):
    return re.split(r"(?<=[.!?])\s", (text or "").strip())[0].rstrip(".")


total, unknown = 0, False


def count(n):
    global total, unknown
    if n is None:
        unknown = True
    else:
        total += n


# --- the model, the covers models, the decoders, the sliders: download-checkpoints.sh's list
ROLES = {
    "m-a-p/YuE2-3B": ("YuE2 3B", "The song model: writes the music, then the sound. Converted to GGUF on your machine."),
    "m-a-p/SheetSage2": ("SheetSage2", "The transcriber, for covers from a recording."),
    "m-a-p/MERT-v2-FullSong": ("MERT v2", "The audio encoder the transcriber listens with."),
}
vae_by_repo = {v["url"].split("huggingface.co/")[-1]: (k, v) for k, v in sources.get("vaes", {}).items()}
models, vaes, sliders = [], [], []
for name, repo, only in entries("download-checkpoints.sh", "REPOS"):
    files = files_of(repo)
    pats = only.split()
    n = None
    if files is not None:
        for x in pats:
            if not any(fnmatch.fnmatch(p, x) for p in files):
                not_in_revision(repo, f"pattern {x!r}")
        n = sum(s for p, s in files.items() if not pats or any(fnmatch.fnmatch(p, x) for x in pats))
    count(n)
    if repo in vae_by_repo:
        key, v = vae_by_repo[repo]
        kind = "stock" if v.get("official") else "add\u2011on"
        vaes.append(f"| **{key.capitalize()}** | {kind} | {first_sentence(v.get('about'))}. | {hf(repo)} | {size(n)} |")
    elif repo == sources.get("sliders", {}).get("repo"):
        labels = [s.get("label", s.get("id")) for s in props.get("sliders", [])]
        what = (", ".join(labels) + ".") if labels else first_sentence(sources["sliders"].get("about")) + "."
        sliders.append(f"| **{str(len(labels)) + chr(0xa0) + 'sliders' if labels else 'Sliders'}** | add\u2011on | {what} | {hf(repo)} | {size(n)} |")
    else:
        title, what = ROLES.get(repo, (name, ""))
        models.append(f"| **{title}** | {what} | {hf(repo)} | {size(n)} |")

# --- the LoRAs: download-loras.sh's list, named and described by sources.json
halves = {l["id"]: l.get("halves", []) for l in props.get("loras", [])}
HALF = {("ar",): "music", ("nar",): "sound", ("ar", "nar"): "music\u00a0+\u00a0sound"}
loras = []
lora_repos = {}
for folder, repo, sub, names in entries("download-loras.sh", "LORAS"):
    files = files_of(repo)
    wanted = [(sub + "/" if sub else "") + f for f in names.split()]
    count(sizes_of(repo, files, wanted))
    lora_repos[folder] = (repo, sub, names.split(), files)
for key, v in sources.get("loras", {}).items():
    folder, _, rest = key.partition("/")
    if folder not in lora_repos:
        continue
    repo, sub, names, files = lora_repos[folder]
    mine = [f for f in names if f.endswith(".safetensors") and f.startswith(rest)]
    n = sizes_of(repo, files, [(sub + "/" if sub else "") + f for f in mine])
    ids = [i for i in halves if i.startswith(key)]
    half = HALF.get(tuple(sorted(set(sum((halves[i] for i in ids), [])))), "")
    loras.append(f"| **{v.get('title', key)}** | {v.get('tag', '')} | {half} | {hf(repo, v.get('url'))} | {size(n)} |")

out = [f"Everything comes at a pinned revision, the exact files this kit was made from, and stays inside the "
       f"install's folder: {'about ' if not unknown else 'at least '}**{size(total)}** from Hugging Face, plus the code from GitHub.", ""]
out += ["### The model", "", "| | What it does | From | Size |", "|---|---|---|---:|", *models, ""]
out += ["### Sound decoders (VAEs)", "", "| | | What it is | From | Size |", "|---|---|---|---|---:|", *vaes, ""]
out += ["### Voice and genre sliders", "", "| | | Which | From | Size |", "|---|---|---|---|---:|", *sliders, ""]
out += [f"### LoRAs ({len(loras)})", "", "| LoRA | Sound | Steers | From | Size |", "|---|---|---|---|---:|", *loras, ""]
up = upstream.removesuffix(".git")
out += ["### Code", "", "| | What it is | From |", "|---|---|---|",
        f"| **yue2.cpp** | The C++ engine; the kit's {npatch} patches go on top | [{up.split('github.com/')[-1]}]({up}) <sub>`{base}`</sub> |",
        f"| **ggml** | Its tensor library (the engine's own fork) | [ServeurpersoCom/ggml](https://github.com/ServeurpersoCom/ggml) <sub>`{ggml[:7]}`</sub> |",
        "| **Python packages** | For the model converter, at pinned versions | [app/tools/converter-requirements.txt](app/tools/converter-requirements.txt) |"]
print("\n".join(out))
for m in missing:
    print(m, file=sys.stderr)
