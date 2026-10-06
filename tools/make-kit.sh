#!/usr/bin/env bash
# Fill the distribution repo, repo/, from this install, and release a kit from it:
#
#   repo/engines/cpp/   the engine patches, their notes, the base and the built page (tools/export-patches.sh)
#   repo/app/           every root script and the whole tools/ folder (by rule, so a new script is never left out)
#   repo/settings/ loras/ docs/, and INSTALL.md, README.md, CHANGELOG.md, VERSIONS.txt, MANIFEST.txt,
#   with the Hugging Face revisions this install has and the converter's package versions (so a friend's
#   files come out the same). It stops on anything the kit could not rebuild, then commits in repo/.
#
#   tools/make-kit.sh                        sync repo/ with this install (no version yet)
#   tools/make-kit.sh --release              also tag the next version and write kits/yue2-install-<date>-vN.zip
#                                            (an exact snapshot of that tag)
#   tools/make-kit.sh --release --verify     also clone upstream fresh, apply the patches and the page,
#                                            and compare the tree hash (network, ~5 s)
#   tools/make-kit.sh --version N            use kit version N (default: one more than the highest in kits/
#                                            or repo/'s tags)
#
# An owner's tool: it runs on the owner's Linux machine (GNU find, sha256 via coreutils). A friend's
# install never needs it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build" DIST="$ROOT/repo"
G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' D=$'\e[2m' B=$'\e[1m' X=$'\e[0m'
# plain text when NO_COLOR is set or the output is not a terminal (a log file, a pipe)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G="" Y="" R="" C="" D="" B="" X=""; fi
t0=$(date +%s); DATE=$(date +%F); OUTDIR="$ROOT/kits"; VERIFY=0; RELEASE=0; warn=0; KITVER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --verify) VERIFY=1 ;;
    --release) RELEASE=1 ;;
    --out) OUTDIR="$(mkdir -p "$2" && cd "$2" && pwd)"; shift ;;
    --version) KITVER="${2#v}"; shift ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
  shift
done
fail() { echo "${R}stop${X}  $*"; exit 1; }
note() { echo "${Y}note${X}  $*"; warn=$((warn + 1)); }
git() { command git -C "$BUILD" "$@"; }
export TMPDIR="$ROOT/tmp" PYTHONDONTWRITEBYTECODE=1    # the tools/ modules imported below leave no __pycache__

# --- 1. the code must be committed, built and free of anything the patches would not carry
[ -d "$DIST/.git" ] || fail "no repo/ (the distribution repo): git init it first"
[ -z "$(command git -C "$DIST" status --porcelain)" ] || fail "repo/ has uncommitted changes: commit or drop them first"
[ -z "$(git status --porcelain)" ] || fail "build/ has uncommitted or untracked files: commit them first ($(git status --porcelain | head -3 | awk '{print $2}' | tr '\n' ' '))"
stray=$(git status --porcelain --ignored | awk '$1 == "!!" {print $2}' | command grep -v -E '^(build/|checkpoints|models|tools/public/index.html|.*__pycache__/)$' || true)
[ -z "$stray" ] || fail "build/ has ignored files the kit would not carry: $stray"
[ -z "$(command git -C "$BUILD/ggml" status --porcelain)" ] || fail "the ggml submodule has local changes (the kit only pins its commit)"
[ "$(git submodule status ggml | cut -c1)" = " " ] || fail "the ggml submodule is not at the commit build/ pins: git submodule update"
gz="$BUILD/tools/public/index.html.gz"   # the copy the server embeds (build.sh writes it when it builds the server)
[ -z "$(find "$BUILD/tools/console" -type f -newer "$gz" | head -1)" ] || fail "the page sources are newer than the embedded page: run ./build.sh --server and commit"
# the engine part first: the patches, their notes and the page into repo/engines/cpp (verified there)
"$ROOT/tools/export-patches.sh" | sed 's/^/  /' || fail "tools/export-patches.sh failed"
ENGB="$DIST/engines/cpp/BASE.txt"
binfo() { awk -F= -v k="$1" '$1 == k {print $2; exit}' "$ENGB"; }
BASE=$(binfo base); BASE7=${BASE:0:7}; BASEDATE=$(binfo base_date); NPATCH=$(binfo patches); TREE=$(binfo tree)
GGML=$(binfo ggml | cut -c1-7)
UPSTREAM=$(binfo upstream)
[ "$TREE" = "$(git rev-parse 'HEAD^{tree}')" ] || fail "repo/engines/cpp does not match build/ (the export above should have)"

# kit version: one more than the highest in kits/ (older zips: yue2-install-...-vN.zip) or repo/'s tags
if [ -z "$KITVER" ]; then
  KITVER=$(( $( { ls "$OUTDIR" 2>/dev/null; command git -C "$DIST" tag -l 'v*'; } | awk '
      /^yue2-(install|kit)-.*\.zip$/ { v = 1; if (match($0, /-v[0-9]+\.zip$/)) v = substr($0, RSTART + 2, RLENGTH - 6) + 0 }
      /^v[0-9]+$/ { v = substr($0, 2) + 0 }
      { if (v > m) m = v; v = 0 } END { print m + 0 }') + 1 ))
fi
[[ "$KITVER" =~ ^[0-9]+$ ]] || fail "the kit version must be a number, not $KITVER"
ZIP="$OUTDIR/yue2-install-$DATE-v$KITVER.zip"   # his name for the kits: yue2-install-<date>-v<N>.zip
if [ "$RELEASE" = 1 ]; then
  [ -e "$ZIP" ] && fail "${ZIP#"$ROOT"/} already exists: pick another --version"
  command git -C "$DIST" rev-parse -q --verify "refs/tags/v$KITVER" >/dev/null && fail "repo/ already has a tag v$KITVER: pick another --version"
fi
echo "${B}kit v$KITVER${X}  upstream ${C}$BASE7${X} + ${G}$NPATCH${X} patches, tree ${D}${TREE:0:12}${X}"

# the download scripts' regression checks (offline, seconds): a kit is never built on a broken downloader
"$ROOT/tools/test_downloaders.sh" > "$ROOT/tmp/kit-test-downloaders.txt" 2>&1 \
  || { tail -5 "$ROOT/tmp/kit-test-downloaders.txt"; fail "tools/test_downloaders.sh failed (full output: tmp/kit-test-downloaders.txt)"; }
echo "${G}tested${X}  $(tail -1 "$ROOT/tmp/kit-test-downloaders.txt")"   # written to a file: plain text
rm -f "$ROOT/tmp/kit-test-downloaders.txt"

# --- 2. what is published, by name: an explicit list, so nothing private rides along (a key, a log, a note).
#     A root or tools/ file on neither list stops the run before repo/ is touched: a new file is never
#     published, or left out, without a decision.
PUBLISH_ROOT="build.sh convert-extras.py convert-models.sh download-models.sh start.sh"
PRIVATE_ROOT="AGENTS.md LOCAL-CHANGES.md settings.json .kit-denylist"   # settings.json is published as settings/ below
PUBLISH_TOOLS="apply-patches.sh cdp-common.mjs cdp-console.mjs cdp-real.mjs check-machine.sh download-checkpoints.sh download-loras.sh downloader-requirements.txt export-patches.sh flac_check.cpp gguf_atomic.py gguf_check.py hf-env.sh hf_expect.py kit/CHANGELOG.md kit/INSTALL-PROMPT.md kit/MACOS-NOTES.md kit/README.md kit/readme_downloads.py local-changes.sh make-kit.sh mock_server.py record.sh screenshots.mjs test-real.sh test_downloaders.sh test_flac.py verify-install.sh"
PRIVATE_TOOLS=""
listed() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }
unlisted=""
for f in $(cd "$ROOT" && find . -maxdepth 1 -type f -printf '%P\n'); do
  listed "$f" "$PUBLISH_ROOT $PRIVATE_ROOT" || unlisted="$unlisted $f"
done
for f in $(cd "$ROOT/tools" && find . -type f ! -path '*/__pycache__/*' -printf '%P\n'); do
  listed "$f" "$PUBLISH_TOOLS $PRIVATE_TOOLS" || unlisted="$unlisted tools/$f"
done
[ -z "$unlisted" ] || fail "not on the publish or the private list in tools/make-kit.sh:$unlisted"

# the rest of repo/ is made again from this install on every run (the engine part is done above)
STAGE="$DIST"
FACTS="$ROOT/tmp/kit-facts.json"
rm -rf "$STAGE/app" "$STAGE/loras" "$STAGE/settings" "$STAGE/docs"
mkdir -p "$STAGE"/{app,loras,settings,docs/screenshots}
# names no published file may carry: attribution trailers, and the vendor names in the owner's untracked
# .kit-denylist (one extended regex; a dotfile, so the root copy below never takes it along)
DENY='co-authored-by|generated with'
[ -f "$ROOT/.kit-denylist" ] && DENY="$DENY|$(tr -d '\n' < "$ROOT/.kit-denylist")"
if command grep -l -i -E "$DENY" "$DIST"/engines/cpp/patches/*.patch >/dev/null 2>&1; then
  fail "a patch carries an attribution trailer or a name from .kit-denylist"
fi

# --- 3. the listed root scripts and tools, and nothing else
for f in $PUBLISH_ROOT; do cp "$ROOT/$f" "$STAGE/app/"; done
for f in $PUBLISH_TOOLS; do mkdir -p "$STAGE/app/tools/$(dirname "$f")"; cp "$ROOT/tools/$f" "$STAGE/app/tools/$f"; done
cp "$ROOT/settings.json" "$STAGE/settings/settings.json"
cp "$ROOT/loras/sources.json" "$STAGE/loras/sources.json"
if command grep -rlF "$HOME" "$STAGE/app" >/dev/null 2>&1; then
  fail "a script names this home folder ($HOME): $(command grep -rlF "$HOME" "$STAGE/app" | head -3 | tr '\n' ' ')"
fi
extra=$(find "$ROOT/loras" -mindepth 1 -maxdepth 1 ! -name sources.json ! -type d ! -xtype d -printf '%f ' || true)
[ -z "$extra" ] || fail "loras/ holds files the kit does not carry: $extra"

# --- 4. coverage: the kit must rebuild every LoRA, model and slider this install has; pins for the downloads
KITVER_LABEL="v$KITVER" TREE_HASH="$TREE" python3 - "$ROOT" "$STAGE" "$FACTS" <<'PY'
import collections, glob, json, os, re, sys, urllib.request
root, stage, out = sys.argv[1:4]
problems, notes = [], []

def entries(script, var):
    body = open(os.path.join(root, "tools", script), encoding="utf-8").read()
    block = re.search(var + r"=\(\n(.*?)\n\)", body, re.S).group(1)
    return [line.strip().strip('"').split("|") for line in block.splitlines() if line.strip().startswith('"')]

# LoRAs: every file on disk is in download-loras.sh, every listed file is on disk, sources.json covers each
listed = {}
lora_entries = entries("download-loras.sh", "LORAS")
for folder, repo, sub, files in lora_entries:
    for f in files.split():
        if f.endswith(".safetensors"):
            listed[folder + "/" + f] = repo
on_disk = set()
for d, dirs, files in os.walk(os.path.join(root, "loras"), followlinks=True):
    dirs[:] = [x for x in dirs if not x.startswith(".")]
    on_disk |= {os.path.relpath(os.path.join(d, f), os.path.join(root, "loras")) for f in files
                if f.endswith(".safetensors") and not f.startswith(".")}
for i in sorted(on_disk - set(listed)):
    problems.append(f"LoRA {i} is not in tools/download-loras.sh: add it there (folder|repo|subfolder|files)")
for i in sorted(set(listed) - on_disk):
    problems.append(f"tools/download-loras.sh lists {i}, which this install does not have")
src = json.load(open(os.path.join(root, "loras", "sources.json"), encoding="utf-8"))
for i in sorted(on_disk):
    if not any(i == k or i.startswith(k) for k in src.get("loras", {})):
        problems.append(f"loras/sources.json has no entry for {i}")

# models: every GGUF is made by the kit's steps (convert, or a quantize line generated here)
converted = {"YuE2-3B-BF16.gguf", "YuE2-Vae-F32.gguf", "YuE2-Vae-legacy-F32.gguf", "YuE2-Vae-blend-F32.gguf", "SheetSage2-F32.gguf"}
models = sorted(os.path.basename(p) for p in glob.glob(os.path.join(root, "models", "*.gguf")))
quantize = []
for m in models:
    if m in converted:
        continue
    q = re.fullmatch(r"(YuE2-3B|SheetSage2)-(Q\w+)\.gguf", m)
    if q:
        src_model = "YuE2-3B-BF16.gguf" if q.group(1) == "YuE2-3B" else "SheetSage2-F32.gguf"
        # written as .partial and renamed when done: an interrupted run never leaves a finished-looking file
        quantize.append(f"nice -n 15 build/build/quantize models/{src_model} models/{m}.partial {q.group(2)} && mv models/{m}.partial models/{m}")
    else:
        problems.append(f"models/{m}: the kit has no step that makes it")
for m in sorted(converted - set(models)):
    notes.append(f"models/{m} is not in this install, but convert-models.sh makes it anyway")
sliders = len(glob.glob(os.path.join(root, "sliders", "*.gguf")))
vaes = ["standard"] + [v for v in ("legacy", "blend") if f"YuE2-Vae-{v}-F32.gguf" in models]
for v in vaes:
    if v not in src.get("vaes", {}):
        problems.append(f"loras/sources.json has no entry for the {v} VAE")

# pins: the exact revision this install downloaded, from each copy's Hugging Face download records
ckpt = os.path.realpath(os.path.join(root, "build", "checkpoints"))
def local_dirs(kind, name, repo, folder):
    owner, rname = repo.split("/")
    if kind == "ckpt":
        return [os.path.join(ckpt, name), os.path.join(ckpt, "..", owner, rname)]
    return [os.path.realpath(os.path.join(root, "loras", folder))]
def recorded(dirs, levels=4):
    for d in dirs:
        d = os.path.realpath(d)
        for _ in range(levels):
            meta = os.path.join(d, ".cache", "huggingface", "download")
            if os.path.isdir(meta):
                shas = collections.Counter()
                for m in glob.glob(os.path.join(meta, "**", "*.metadata"), recursive=True):
                    with open(m, encoding="utf-8") as f:
                        shas[f.readline().strip()] += 1
                return shas
            d = os.path.dirname(d)
    return collections.Counter()
def main_sha(repo):
    try:
        with urllib.request.urlopen(f"https://huggingface.co/api/models/{repo}", timeout=15) as r:
            return json.load(r).get("sha", "")
    except Exception:
        return ""
repos = {}
for name, repo, only in entries("download-checkpoints.sh", "REPOS"):
    repos.setdefault(repo, local_dirs("ckpt", name, repo, None))
for folder, repo, sub, files in lora_entries:
    repos.setdefault(repo, local_dirs("lora", None, repo, folder))
# the GGUF download (download-models.sh, the alternative to converting): its one repo, into models/, where
# the downloader keeps its records (models/.cache; no walking up: that folder may be in a shared library)
with open(os.path.join(root, "download-models.sh"), encoding="utf-8") as f:
    gguf_repo = re.search(r'^REPO="([^"]+)"', f.read(), re.M).group(1)
repos.setdefault(gguf_repo, [os.path.join(root, "models")])
levels = {gguf_repo: 1}
pins, table = [], []
for repo, dirs in repos.items():
    shas, now = recorded(dirs, levels.get(repo, 4)), main_sha(repo)
    if shas:
        sha = shas.most_common(1)[0][0]
        if len(shas) > 1:
            notes.append(f"{repo}: files from {len(shas)} revisions; pinned the most common, {sha[:12]}")
        how = "this install's files"
    elif now:
        sha, how = now, "newest (no download record here)"
        notes.append(f"{repo}: no download record in this install; pinned the newest revision {sha[:12]}")
    else:
        problems.append(f"{repo}: no download record here and Hugging Face did not answer")
        continue
    pins.append(f"{repo} {sha}")
    table.append((repo, sha[:12], how, "" if not now or now == sha else f"main is now {now[:12]}"))
# how the friend's files compare with his: converted files byte for byte (SHA-256); quantized copies and
# the transcriber by structure (quantizing, and the transcriber's conversion-time merge of its adapter
# weights in floating point, can round differently on another CPU, platform or compiler)
by_structure = {"SheetSage2-F32.gguf"}
sys.path.insert(0, os.path.join(root, "tools"))
import gguf_check
cache_path = os.path.join(root, "tmp", "kit-hash-cache.json")
try:
    cache = json.load(open(cache_path))
except (OSError, ValueError):
    cache = {}
def cached_sha(path):
    st = os.stat(path); key = f"{os.path.realpath(path)}|{st.st_size}|{st.st_mtime}"
    if key not in cache:
        cache[key] = gguf_check.sha256(path)
    return cache[key]
exact, struct_ = {}, {}
for m in models:
    full = os.path.join(root, "models", m)
    if m in converted and m not in by_structure:
        exact["models/" + m] = cached_sha(full)
    else:
        struct_["models/" + m] = gguf_check.structure(full)
for g in sorted(glob.glob(os.path.join(root, "sliders", "*.gguf"))):
    exact["sliders/" + os.path.basename(g)] = cached_sha(g)
json.dump(cache, open(cache_path, "w"))
with open(os.path.join(stage, "app", "tools", "expected-install.json"), "w", encoding="utf-8") as f:
    json.dump({"kit": os.environ.get("KITVER_LABEL", ""), "tree": os.environ.get("TREE_HASH", ""), "models": models,
               "sliders": sliders, "loras": len(on_disk), "exact_sha256": exact, "quantized_structure": struct_}, f, indent=1)
with open(os.path.join(stage, "app", "tools", "hf-revisions.txt"), "w", encoding="utf-8") as f:
    f.write("# owner/repo commit: the exact Hugging Face revisions the kit's owner has (the download scripts read this)\n")
    f.write("\n".join(pins) + "\n")

json.dump({"problems": problems, "notes": notes, "quantize": quantize, "models": models, "sliders": sliders,
           "loras": len(on_disk), "lora_repos": len({r for _, r, _, _ in lora_entries}), "pins": table},
          open(out, "w"), indent=1)
PY
facts() { python3 -c 'import json, sys; print("\n".join(json.load(open(sys.argv[1]))[sys.argv[2]]))' "$FACTS" "$1"; }
while IFS= read -r line; do [ -n "$line" ] && note "$line"; done < <(facts notes)
probs=$(facts problems)
[ -z "$probs" ] || { echo "$probs" | sed "s/^/${R}gap${X}   /"; fail "the kit could not rebuild everything above"; }

# the converter's exact packages (the friend's convert-models.sh installs these)
if [ -x "$ROOT/.venv/bin/pip" ]; then
  { echo "# the converter's packages on the kit owner's machine ($("$ROOT/.venv/bin/python" --version))"
    "$ROOT/.venv/bin/pip" freeze 2>/dev/null | command grep -v -E '^(-e |pkg[-_]resources)'; } > "$STAGE/app/tools/converter-requirements.txt"
else
  note "no .venv here: the kit carries no converter package pins"
fi

cp "$ROOT/tools/kit/CHANGELOG.md" "$STAGE/CHANGELOG.md"

# --- 5. the screenshots, optional. The owner's working notes (AGENTS.md, LOCAL-CHANGES.md) stay private: the
#     technical content a friend needs is in INSTALL.md and engines/cpp/PATCHES.md. New screenshots come from
#     tools/screenshots.mjs (only for a GitHub push, or when he wants them in a kit); otherwise repo/'s stay.
SHOTS="$ROOT/tmp/shots/showcase"
page_built=$(stat -c %Y "$BUILD/tools/public/index.html.gz")
shots_new=0 shots_kept=0
for name in compose-page song-page song-page-narrow engine-page engine-tiles engine-about theme-picker; do
  from="$SHOTS/$name.png"
  if [ -f "$from" ] && [ "$(stat -c %Y "$from")" -ge "$page_built" ]; then
    cp "$from" "$STAGE/docs/screenshots/$name.png"; shots_new=$((shots_new + 1))
  elif command git -C "$DIST" cat-file -e "HEAD:docs/screenshots/$name.png" 2>/dev/null; then
    # docs/ was emptied in step 2: keep the last committed copy
    command git -C "$DIST" show "HEAD:docs/screenshots/$name.png" > "$STAGE/docs/screenshots/$name.png"; shots_kept=$((shots_kept + 1))
  fi
done
[ "$shots_kept" = 0 ] || note "screenshots: $shots_kept kept from repo/ (older than the page; fine unless this is for GitHub)"
# the install guide describes the page: a page changed after the guide was last touched may not be in it
page_changed=$(git log -1 --format=%ct -- tools/console)
if [ "$(stat -c %Y "$ROOT/tools/kit/INSTALL-PROMPT.md")" -lt "$page_changed" ]; then
  [ "$RELEASE" = 1 ] && fail "the page changed after tools/kit/INSTALL-PROMPT.md: bring its feature list (What it has, section 10) up to date first"
  note "the page changed after tools/kit/INSTALL-PROMPT.md: its feature list may be out of date"
fi

# --- 6. the prompt and README, filled in from this install
# start.sh's default batch (BATCH="${YUE2CPP_BATCH:-N}"): one awk over the file, no "| head" under pipefail
BATCH=$(awk 'match($0, /YUE2CPP_BATCH:-[0-9]+/) {print substr($0, RSTART + 15, RLENGTH - 15); exit}' "$ROOT/start.sh")
[ -n "$BATCH" ] || fail "start.sh has no YUE2CPP_BATCH default for the install guide"
CDP=$(command grep -o '[0-9]* passed' "$ROOT/tmp/cdp-console.log" 2>/dev/null | tail -1 | cut -d' ' -f1 || true)
[ -n "$CDP" ] || { CDP="all"; note "no page-test log: run node tools/cdp-console.mjs first for the check count"; }
# the README's download list: every model, VAE, slider set and LoRA with its link, pin and size
if ! python3 "$ROOT/tools/kit/readme_downloads.py" "$STAGE/app/tools/hf-revisions.txt" "$UPSTREAM" "$BASE7" "$GGML" "$NPATCH" \
     "$ROOT/tmp/showcase/props.json" > "$ROOT/tmp/kit-downloads.md" 2> "$ROOT/tmp/kit-downloads.err" || [ -s "$ROOT/tmp/kit-downloads.err" ]; then
  [ "$RELEASE" = 1 ] && fail "the README's download list is incomplete: $(head -3 "$ROOT/tmp/kit-downloads.err" | tr '\n' ' ')"
  note "the README's download list is incomplete (offline?): $(head -1 "$ROOT/tmp/kit-downloads.err")"
fi
[ -f "$ROOT/tmp/showcase/props.json" ] || note "no tmp/showcase/props.json: the README cannot say which half each LoRA steers (node tools/screenshots.mjs URL)"
for pair in INSTALL-PROMPT.md:INSTALL.md README.md:README.md; do
  python3 - "$ROOT/tools/kit/${pair%%:*}" "$STAGE/${pair#*:}" "$ROOT/settings.json" "$FACTS" <<PY
import json, sys
s = open(sys.argv[1], encoding="utf-8").read()
st = json.load(open(sys.argv[3])); facts = json.load(open(sys.argv[4]))
ctx = "the whole context (\`max_seq\` 0 = 24,576)" if not st.get("max_seq") else f"\`max_seq\` {st['max_seq']}"
settings = (f"model **{st.get('model', 'BF16')}**, "
            f"{'**keep models loaded** between songs' if st.get('keep_loaded') else 'models unloaded after each song'}, "
            f"{ctx}, VAE tiles **{st.get('vae_core', 512)}** frames")
quant = "\n".join(facts["quantize"]) or "# (no smaller copies in the original install)"
fill = {"HOME": "~", "DATE": "$DATE", "KITVER": "$KITVER", "BASE": "$BASE7", "BASEDATE": "$BASEDATE", "NPATCH": "$NPATCH", "TREE": "$TREE",
        "UPSTREAM": "$UPSTREAM", "GGML": "$GGML", "BATCH": "$BATCH", "CDP_CHECKS": "$CDP", "SETTINGS": settings,
        "QUANTIZE": quant, "MODELS": ", ".join(facts["models"]), "NLORA": str(facts["loras"]),
        "NLORAREPO": str(facts["lora_repos"]), "NSLIDER": str(facts["sliders"]),
        "NMODEL": str(len(facts["models"])), "NGGUF": str(len(facts["models"]) + facts["sliders"]),
        "DOWNLOADS": open("$ROOT/tmp/kit-downloads.md", encoding="utf-8").read().strip()}
for k, v in fill.items():
    s = s.replace("{{" + k + "}}", v)
assert "{{" not in s, "unfilled placeholder in " + sys.argv[1]
open(sys.argv[2], "w", encoding="utf-8").write(s)
PY
done

# --- 7. VERSIONS.txt: what the patches apply to, the byte-check, every pin, what is left out on purpose
python3 - "$FACTS" > "$STAGE/VERSIONS.txt" <<PY
import json, sys
f = json.load(open(sys.argv[1]))
print("YuE2 studio install reference kit v$KITVER, $DATE")
print()
print("Code:   $UPSTREAM  @ $BASE7 of $BASEDATE (branch master; ggml submodule at $GGML)")
print("        + $NPATCH patches (engines/cpp/patches, git am) + the built page (engines/cpp/page)")
print("Check:  after the patches and the page, git rev-parse HEAD^{tree} = $TREE (checked $DATE)")
print()
print("Hugging Face revisions (app/tools/hf-revisions.txt; the download scripts fetch exactly these):")
for repo, sha, how, now in f["pins"]:
    print(f"  {repo:58s} {sha}  {how}{'; ' + now if now else ''}")
print()
print("Model files the install makes (models/): " + ", ".join(f["models"]))
print(f"Add-ons: {f['sliders']} sliders, {f['loras']} LoRA files from {f['lora_repos']} repos")
print("Converter packages: app/tools/converter-requirements.txt")
print("Built and tested with: $(nvcc --version 2>/dev/null | tail -2 | head -1 | sed 's/.*release /CUDA /;s/,.*//'), $(gcc --version | head -1 | awk '{print "gcc " $NF}'), $(cmake --version | head -1)")
print()
print("Not in the kit, on purpose:")
print("  - songs (outputs/)")
print("  - browser-side choices (the theme picked, fonts, favourites, form drafts): they live in each browser")
print("  - the built programs: each install compiles for its own GPU")
print("  - the model, slider and LoRA files: downloaded at the revisions above and converted locally")
print("  - tmp/: test runs, caches, the converter venv (rebuilt from converter-requirements.txt)")
PY

# --- 8. every script still parses
bad=0
while IFS= read -r f; do bash -n "$f" || { echo "${R}bad${X} $f"; bad=1; }; done < <(find "$STAGE/app" -name '*.sh')
while IFS= read -r f; do node --check "$f" 2>/dev/null || { echo "${R}bad${X} $f"; bad=1; }; done < <(find "$STAGE/app" -name '*.mjs')
while IFS= read -r f; do python3 -m py_compile "$f" || { echo "${R}bad${X} $f"; bad=1; }; done < <(find "$STAGE/app" -name '*.py')
find "$STAGE" -path "$STAGE/.git" -prune -o -name __pycache__ -type d -prune -exec rm -rf {} +
[ "$bad" = 0 ] || fail "a script in the kit does not parse"

# --- 9. optional: the patches rebuild this exact tree on a fresh clone of upstream
if [ "$VERIFY" = 1 ]; then
  V="$ROOT/tmp/kit-verify"; rm -rf "$V"
  command git clone --quiet --filter=blob:none "$UPSTREAM" "$V" 2>/dev/null || fail "--verify: could not clone $UPSTREAM (offline?)"
  command git -C "$V" checkout --quiet -B master "$BASE" 2>/dev/null || fail "--verify: the fresh clone has no commit $BASE7"
  # a patch that does not apply stops here with git's own reason (not a bare exit status from set -e)
  if ! am_out=$(cd "$V" && command git -c user.name=kit -c user.email=kit@localhost am --quiet "$DIST"/engines/cpp/patches/*.patch 2>&1); then
    fail "--verify: the patches do not apply to a fresh clone of upstream $BASE7: $(printf '%s\n' "$am_out" | awk 'NF && n++ < 3' | tr '\n' ' ')(the clone is kept in tmp/kit-verify)"
  fi
  cp "$DIST/engines/cpp/page/index.html.gz" "$V/tools/public/index.html.gz"
  command git -C "$V" -c user.name=kit -c user.email=kit@localhost commit --quiet -am "Add the built page" \
    || fail "--verify: could not commit the built page in tmp/kit-verify"
  got=$(command git -C "$V" rev-parse 'HEAD^{tree}'); rm -rf "$V"
  [ "$got" = "$TREE" ] && echo "${G}verified${X}  a fresh clone + the patches + the page gives this exact tree" || fail "the patches give tree $got, not $TREE"
fi

# --- audit: what this kit carries, counted from the files themselves, and what it leaves out on purpose
nsrc=$(find "$BUILD/tools/console" -type f | wc -l | tr -d ' '); nsrc_kit=$(find "$DIST/page/src" -type f 2>/dev/null | wc -l | tr -d ' ')
[ "$nsrc_kit" = "$nsrc" ] || fail "repo/page/src has $nsrc_kit of the page's $nsrc source files"
nroot=$(echo $PUBLISH_ROOT | wc -w | tr -d ' ')
nroot_kit=$(find "$DIST/app" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$nroot_kit" = "$nroot" ] || fail "repo/app has $nroot_kit of the $nroot root scripts"
echo "${B}audit${X}  engine: ${G}$NPATCH${X} patches + PATCHES.md notes + BASE.txt ($BASE7, $BASEDATE) + the built page"
echo "       page as plain files: ${G}$nsrc_kit${X} sources in page/src + page/index.html"
echo "       app: ${G}$nroot_kit${X} root scripts, tools/ with $(find "$DIST/app/tools" -type f | wc -l | tr -d ' ') files; settings.json; loras/sources.json"
echo "       downloads pinned: $(( $(wc -l < "$STAGE/app/tools/hf-revisions.txt") - 1 )) Hugging Face repos; converter packages: $( [ -f "$STAGE/app/tools/converter-requirements.txt" ] && echo yes || echo NO)"
echo "       docs: $(ls "$STAGE/docs/screenshots" | wc -l | tr -d ' ') screenshots; INSTALL.md, README.md, CHANGELOG.md, VERSIONS.txt; .gitignore"
echo "       ${D}kept private: $PRIVATE_ROOT${X}"
echo "       look: the page's default theme (Studio); each browser keeps its own theme and other choices"
echo "       ${D}left out on purpose: songs, compiled programs, model/LoRA files (downloaded at the pins), tmp/, the theme generator (lost with the old app)${X}"

# the published repo ignores what must never be committed, should a file slip past the lists above
cat > "$STAGE/.gitignore" <<'IGN'
# never published: secrets, local settings, logs, caches, runtime data
.env
.env.*
*.pem
*.key
*.p12
*credentials*
*secret*
token-cache*
*.log
__pycache__/
*.pyc
.DS_Store
tmp/
outputs/
models/
checkpoints/
IGN
# --- 10. manifest of every file, then commit in repo/; with --release, tag it and zip exactly that tag
(cd "$STAGE" && find . -path ./.git -prune -o -type f ! -name MANIFEST.txt -printf '%P\n' | sort | xargs -d '\n' sha256sum) > "$STAGE/MANIFEST.txt"
# nothing published names his home folder, carries an attribution or names a denied vendor (whole repo, not just app/)
# (grep finds nothing = exit 1: "|| true" keeps set -e from stopping the run here; the trailer words are left
# out, since the guards themselves spell them)
VENDORS=$(tr -d '\n' < "$ROOT/.kit-denylist" 2>/dev/null || true)
# token shapes: GitHub, Hugging Face, "sk-" API keys, AWS keys, Slack, and PEM private keys (built from parts, so
# this script never matches itself)
SECRETS='(github_pat_|gh[pousr]_)[A-Za-z0-9_]{30,}|hf_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}'
SECRETS="$SECRETS|-----BEGIN [A-Z ]*PRIV""ATE KEY-----"
leaks=$( { command grep -r -l -F "$HOME" "$STAGE" --exclude-dir=.git || true
           [ -z "$VENDORS" ] || command grep -r -l -i -E "$VENDORS" "$STAGE" --exclude-dir=.git || true
           command grep -r -l -I -E "$SECRETS" "$STAGE" --exclude-dir=.git || true; } 2>/dev/null |
         sed "s|^$STAGE/||" | sort -u | awk 'NR <= 5' | tr '\n' ' ')   # awk reads it all: no early exit under pipefail
# a sync stops too: nothing like this may even reach a commit
[ -z "$leaks" ] || fail "published files name the home folder, a denied name or something shaped like a secret: $leaks"
command git -C "$DIST" add -A
if command git -C "$DIST" diff --cached --quiet; then
  state="no change in repo/"
else
  command git -C "$DIST" commit --quiet -m "$([ "$RELEASE" = 1 ] && echo "Release kit v$KITVER" || echo "Sync the app, docs and settings")"
  state="committed in repo/ as $(command git -C "$DIST" rev-parse --short HEAD)"
fi
files=$(command git -C "$DIST" ls-files | wc -l | tr -d ' ')
pins=$(( $(wc -l < "$STAGE/app/tools/hf-revisions.txt") - 1 ))
echo
if [ "$RELEASE" = 1 ]; then
  command git -C "$DIST" tag -a "v$KITVER" -m "Kit v$KITVER"
  mkdir -p "$OUTDIR"
  command git -C "$DIST" archive --format=zip --prefix="yue2-install-$DATE-v$KITVER/" -o "$ZIP" "v$KITVER"
  unzip -tq "$ZIP" >/dev/null || fail "the zip does not test clean"
  echo "${B}stats${X}  ${G}${ZIP#"$ROOT"/}${X}  kit v$KITVER (tag v$KITVER), $(du -h "$ZIP" | cut -f1), $files files, $NPATCH patches, $pins repos pinned, $( [ "$VERIFY" = 1 ] && echo "tree verified" || echo "tree not re-verified (--verify)"), $state, notes $warn, $(( $(date +%s) - t0 ))s"
else
  echo "${B}stats${X}  repo/ synced for kit v$KITVER (not released: --release tags it and zips it), $files files, $NPATCH patches, $pins repos pinned, $state, notes $warn, $(( $(date +%s) - t0 ))s"
fi
rm -f "$FACTS"
