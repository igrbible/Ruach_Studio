#!/usr/bin/env python3
"""HERESY 2330: the one source of the weights' places (lab/paths.py) and the guard over it.
  1. launcher/paths.sh is what lab/paths.py writes (python3 lab/paths.py --sh > launcher/paths.sh), byte for byte;
  2. the shell's map is Python's, path for path, and so are their hf_place and engine_gguf;
  3. the map: every place of the new tree a fixed point, every 2.0.6 folder somewhere, the user's own folders nowhere;
  4. the guard: no hard-coded models/…, checkpoints/…, artwork/…, separation/…, whisper/…, universr/… in the code (a string, not a comment
     or a docstring; a path made with / "models" too) of lab/, build/ (the page's scripts, convert.py) and the root's scripts: every one comes
     from lab/paths.py or launcher/paths.sh. A line that names a path inside a Hugging Face repo (they keep 2.0.6's layout) says so with
     «paths: repo», one that names 2.0.6's own place on purpose with «paths: 2.0.6»;
  5. no 2.0.6 place left anywhere a reader sees it (the docs, the page, the catalogs, the comments): checkpoints/…, artwork/…,
     separation/…, whisper/…, universr/…, models/<a 2.0.6 folder or file>.
Run where it lies: in the Studio (launcher → heresy/root/launcher), in a release (launcher/, no heresy/), in a worktree of the three repos.
  .venv/bin/python lab/test_paths.py"""
import io
import os
import re
import subprocess
import sys
import tokenize
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0
KIT = Path(__file__).resolve().parent.parent
HERESY = KIT / "heresy"
ROOTF = HERESY / "root" if (HERESY / "root").is_dir() else KIT          # the root's own files: their master copies, or the release's
SHOW = int(os.environ.get("PATHS_SHOW", "40"))   # how many offenders a failure lists
TOPS = ("models", "checkpoints", "artwork", "separation", "whisper", "universr")


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def rel(p):
    return Path(p).resolve().relative_to(KIT).as_posix() if str(Path(p).resolve()).startswith(str(KIT)) else str(p)


SH = ROOTF / "launcher" / "paths.sh"
CORPUS = """models/YuE2-3B-Q8_0.gguf
models/YuE2-3B-BF16.gguf
models/YuE2-3B-Q5_K_M.gguf
models/YuE2-3B-RS-TW-2.0x0.75-Q8_0.gguf
models/YuE2-3B-RS-FW-9.9-mine-BF16.gguf
models/YuE2-3B-RS-FW-3.4m0.75s0.6-BF16.gguf
models/YuE2-3B-IRAE-IRv2-Q6_K.gguf
models/YuE2-3B-IRA-BF16.gguf
models/YuE2-Vae-F32.gguf
models/YuE2-Vae-legacy-F32.gguf
models/YuE2-VAE-RS-x3_v2-F32.gguf
models/yue2-mothersuperior-realaudio-tokenizer-v4-F32.gguf
models/SheetSage2-F32.gguf
models/MERT-v2-FullSong-Q8_0.gguf
models/RS-TW-2.0x0.9/hf-upload/x.json
models/YuE2-VAE-RS/STABLE/a b.safetensors
models/eagle3/README.md
models/muscriptor/v1/muscriptor-large-f16.gguf
models/upbundle/apollo/look2hear/models/x.py
models/instruments/pianoteq/Pianoteq 9/x86-64bit/Pianoteq 9
models/instruments/sfz/Brush Snare Hits & Rolls.sfz
models/ambient/rain/bank.json
models/minimax-h3/original/FL2VA/text_encoder/config.json
models/luts/ruach/a.cube
models/seedvr2/seedvr2_ema_7b_sharp-Q6_K.gguf
models/reader/_src/x
checkpoints/YuE2-3B/model-00001-of-00002.safetensors
checkpoints/YuE2-Vae-merge-0.666/x
checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/tokenizer_head_joint_v4.pt
checkpoints/YuE2-hum-to-song/x
checkpoints/particle-sliders/catalog.json
checkpoints/Qwen2.5-Omni-7B-AWQ/x
checkpoints/audiobox-aesthetics/x
checkpoints/Qwopus3.5-9B-GGUF/LICENSE
checkpoints/MERT-v2-30s/x
checkpoints/SheetSage2/x
checkpoints/comfy/checkpoints/yue2_3b_int8_convrot.safetensors
separation/vr/17_HP-Wind_Inst-UVR.pth
universr/config.yaml
whisper/whisper-large-v3-ct2-float16/vocabulary.json
artwork/Qwen-Image-2512/gguf/qwen-image-2512-Q6_K.gguf
artwork/loras/qwen-image-2512/PUBLIC/QWEN-2512-Lightning-8steps-V1.0-bf16.safetensors
models/my-experiment/private.gguf
models/my-own/x.gguf
checkpoints/someone-elses/x
loras/voice/a.safetensors
outputs/song/take.flac""".splitlines()

print("the shell twin")
want = subprocess.run([sys.executable, str(KIT / "lab" / "paths.py"), "--sh"], capture_output=True, text=True).stdout
check("launcher/paths.sh is what lab/paths.py writes", SH.is_file() and SH.read_text(encoding="utf-8") == want,
      f"{rel(SH)}: python3 lab/paths.py --sh > {rel(SH)}")
script = (f'ROOT={str(KIT)!r}; source {str(SH)!r}; while IFS= read -r l; do rs_new_of "$l" || echo; done; '
          'for n in YuE2-3B-Q8_0.gguf YuE2-3B-RS-TW-2.0x0.75-BF16.gguf YuE2-Vae-F32.gguf other.gguf; do rs_engine_gguf "$n"; done; '
          'for i in "artwork/Qwen-Image-2512/scheduler/*" models/YuE2-Vae-legacy-F32.gguf "whisper/whisper-large-v3-ct2-float16/*" '
          '"checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors" "models/upbundle/apollo/*"; do rs_hf_place "$i"; done')
out = subprocess.run(["bash", "-c", script], input="\n".join(CORPUS) + "\n", capture_output=True, text=True).stdout.splitlines()
py = [paths.new_of(c) or "" for c in CORPUS]
py += [str(paths.engine_gguf(n, KIT)) for n in ("YuE2-3B-Q8_0.gguf", "YuE2-3B-RS-TW-2.0x0.75-BF16.gguf", "YuE2-Vae-F32.gguf", "other.gguf")]
py += ["\t".join(paths.hf_place(i)) for i in ("artwork/Qwen-Image-2512/scheduler/*", "models/YuE2-Vae-legacy-F32.gguf",
                                             "whisper/whisper-large-v3-ct2-float16/*", "checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors",
                                             "models/upbundle/apollo/*")]
check(f"the shell's map is Python's ({len(CORPUS)} paths, engine_gguf, hf_place)", out == py,
      [(a, b) for a, b in zip(out, py) if a != b][:4] or (len(out), len(py)))

print("the map")
check("every place of the new tree is a fixed point", all(paths.new_of(v + "/x") is None for v in paths.PLACES.values()))
check("every 2.0.6 weight has a place", all(paths.new_of(c) for c in CORPUS[:42]), [c for c in CORPUS[:42] if not paths.new_of(c)])
check("what is not the Studio's (a private experiment, the user's own, loras/, outputs/) has none", all(paths.new_of(c) is None for c in CORPUS[42:]))
check("the public fine-tunes repo's VAE-RS/ lands with the decoders (HERESY 2330, 11.11)",
      paths.new_of("VAE-RS/YuE2-VAE-RS-x3_v1-F32.gguf") == paths.ENGINE_VAE + "/YuE2-VAE-RS-x3_v1-F32.gguf"
      and paths.hf_place("VAE-RS/YuE2-VAE-RS-x3_v2-F32.gguf") == ("VAE-RS/", paths.ENGINE_VAE))
check("SheetSage2-Refined: its GGUF and its LICENSE and NOTICE in one folder with SheetSage2 (the engine looks for the overlay beside its base)",
      paths.new_of("models/SheetSage2-Refined-F16.gguf") == paths.MISC + "/SheetSage2-Refined-F16.gguf"
      and paths.new_of("models/SheetSage2-Refined/LICENSE") == paths.MISC + "/SheetSage2-Refined/LICENSE")
check("a weight several rooms load is in models/misc/", all(paths.new_of(c).startswith(paths.MISC + "/") for c in CORPUS if
                                                         re.search(r"whisper/|seedvr2/|MERT|SheetSage", c) and paths.new_of(c)))
check("the engine's GGUFs keep their names (start.sh reads a backbone's name from its file)",
      all(paths.new_of(c).rsplit("/", 1)[1] == c.rsplit("/", 1)[1] for c in CORPUS[:42]))

# ── the guard ────────────────────────────────────────────────────────────────────────────────────────────────────────
MARK = re.compile(r"paths: (repo|2\.0\.6)")
# a place's name at a path's head: from the Studio's folder ($ROOT/, KIT/, a string's start); «checkpoints» only with a path after it (a folder of
# that name inside a painter's folder is not the 2.0.6 place)
CODE = re.compile(r"(?:(?<=^)|(?<=[\s=:,({\[\"'`])|(?<=\$ROOT/)|(?<=\{ROOT\}/)|(?<=KIT/)|(?<=\}/))(?:" + "|".join(TOPS) + r")/(?=[\w.$<{-])")
# a path made of segments from the Studio's folder: KIT / "models", os.path.join(kit, "checkpoints", …), Path(kit).joinpath("artwork", …)
SEG = re.compile(r"""(?:\b(?:KIT|kit|ROOT|root|STUDIO|K|kit\(\)|H\["kit"\]|Path\(kit\)|self\.kit|base|parent|parents\[\d\])\s*/\s*|(?:join|joinpath)\(\s*(?:a\.)?(?:KIT|kit|ROOT|root|STUDIO|kit\(\)|H\["kit"\])\s*,\s*|(?:Path\((?:KIT|kit|ROOT|root)\)|KIT|kit)\.joinpath\(\s*)["'](""" + "|".join(TOPS) + r""")["']""")
OWN = {"lab/paths.py", "lab/migrate_models.py", "lab/test_migrate_models.py", "lab/test_paths.py"}
VENDORED = ("lab/h3rt/minimax_h3/", "lab/h3rt/quant/", "lab/seedvr2rt/")
UPSTREAM = {"build/server.sh", "build/quantize.sh", "build/checkpoints.sh", "build/models.sh"}   # yue2.cpp's own standalone layout


def py_code_hits(path):
    """(line, text) of every string in the code (docstrings, comments left out) that names a place by hand"""
    src = Path(path).read_text(encoding="utf-8")
    lines = src.splitlines()
    out = []
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(src).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return [(0, "does not tokenize")]
    prev, depth = None, 0
    for i, t in enumerate(toks):
        if t.type == tokenize.OP and t.string in "([{":
            depth += 1
        elif t.type == tokenize.OP and t.string in ")]}":
            depth -= 1
        if t.type == tokenize.STRING or t.type == getattr(tokenize, "FSTRING_MIDDLE", -1):
            doc = (t.type == tokenize.STRING and depth == 0 and
                   (prev is None or prev.type in (tokenize.INDENT, tokenize.DEDENT, tokenize.NEWLINE, tokenize.NL)))
            line = lines[t.start[0] - 1] if t.start[0] - 1 < len(lines) else ""
            if not doc and not MARK.search(line):
                if CODE.search(t.string):
                    out.append((t.start[0], t.string[:120]))
        if t.type not in (tokenize.COMMENT, tokenize.NL, tokenize.INDENT, tokenize.DEDENT):
            prev = t
    for n, line in enumerate(lines, 1):
        code = line.split("  # ")[0]
        if SEG.search(code) and not MARK.search(line) and not code.lstrip().startswith("#"):
            out.append((n, code.strip()[:120]))
    return sorted(set(out))


def line_code_hits(path, comment):
    out = []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        s = line.lstrip()
        if not s or s.startswith(comment) or MARK.search(line):
            continue
        if comment == "#":
            s = re.sub(r"\s#\s.*$", "", s)
        elif comment == "//":
            s = re.sub(r"\s//\s.*$", "", s)
        if re.fullmatch(r"!?/?[\w.-]+/(\*)?", s.strip()):        # an ignore list's folder pattern (a heredoc of a .gitignore)
            continue
        if CODE.search(s):
            out.append((n, s.strip()[:120]))
    return out


def files():
    out = []
    for p in sorted((KIT / "lab").rglob("*.py")):
        r = rel(p)
        if "__pycache__" in r or r in OWN or r.startswith(VENDORED) or "/.venv" in r:
            continue
        out.append((p, "py"))
    for p in sorted((KIT / "lab").rglob("engine.json")):
        out.append((p, "json"))
    # the page's scripts: their words are a reader's (5 below reads them), the page's paths come from the lab
    if (KIT / "build" / "convert.py").is_file():
        out.append((KIT / "build" / "convert.py", "py"))
    for pat in ("*.sh", "launcher/*.sh", "tools/*.sh"):
        out += [(p, "sh") for p in sorted(ROOTF.glob(pat)) if p.name != "paths.sh"]
    out += [(p, "py") for p in sorted(ROOTF.glob("tools/*.py"))]
    out += [(p, "js") for p in sorted(ROOTF.glob("*.js")) + sorted(ROOTF.glob("launcher/*.js"))]
    for p in (HERESY / "fetch-heresy.sh", HERESY / "tools" / "make-release.sh"):
        if p.is_file():
            out.append((p, "sh"))
    return [(p, k) for p, k in out if rel(p) not in UPSTREAM]


print("the guard: no place by hand in the code")
bad = []
n_files = 0
for p, kind in files():
    n_files += 1
    if kind == "py":
        hits = py_code_hits(p)
    elif kind == "json":
        hits = [(n, l.strip()[:120]) for n, l in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
                if re.search(r'"model":\s*"', l) and CODE.search(l.split('"model":')[1])]
    else:
        hits = line_code_hits(p, "#" if kind == "sh" else "//")
    bad += [f"{rel(p)}:{n}: {t}" for n, t in hits]
check(f"{n_files} files of code take every place from lab/paths.py or launcher/paths.sh", not bad, "\n      " + "\n      ".join(bad[:SHOW])
      + (f"\n      … and {len(bad) - SHOW} more" if len(bad) > SHOW else ""))

print("no 2.0.6 place left where a reader sees it")
OLD = re.compile(r"(?<![\w.$\-/])(?:(artwork|separation|universr)/|checkpoints/(?=[\w<-])|whisper/whisper-large|models/(?!(?:"
                 + "|".join(re.escape(t) for t in paths.NEW_TOPS) + r")(?:/|\b)|<|$|[\s\"'`)*,.;:、，。）])([^\s\"'`)/,;]+))")
prose = [p for p, _ in files()]
for d in ("docs",):
    prose += sorted((ROOTF / d).glob("*.md"))
prose += [p for p in (ROOTF / "README.md", ROOTF / "INSTALL.md", ROOTF / "INSTALL_WINDOWS.md", ROOTF / "INSTALL_by_LLM_Agent.md",
                      KIT / "build" / "tools" / "console" / "index.html") if p.is_file()]
prose += sorted((KIT / "build" / "tools" / "console").glob("*.js"))
prose += [p for p in (KIT / "lab" / "paths.py", KIT / "lab" / "migrate_models.py")]
old = []
for p in prose:
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if MARK.search(line):
            continue
        quoted = [(m.start(), m.end()) for m in re.finditer(r"«[^»]*»", line)]
        for m in OLD.finditer(line):
            if any(a <= m.start() < b for a, b in quoted):
                continue
            if p.name in ("paths.py", "migrate_models.py", "MODELS.md"):
                continue                                          # the map's own patterns, its words and its document about 2.0.6
            old.append(f"{rel(p)}:{n}: {line.strip()[:140]}")
            break
check(f"{len(prose)} files read: none names a 2.0.6 place", not old, "\n      " + "\n      ".join(old[:SHOW])
      + (f"\n      … and {len(old) - SHOW} more" if len(old) > SHOW else ""))

print(f"\ntest_paths  {G if not failed else R}{passed} passed, {failed} failed{X}")
sys.exit(1 if failed else 0)
