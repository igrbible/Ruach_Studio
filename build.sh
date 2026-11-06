#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  BUILD · одна команда Студии: страница, сервер, перезапуск
#  (the Studio's one build command: the page, the server when its C++ changed, the restart when idle)
#
#  Слово Виктора 02.10.2026: «Сделай build.sh основным без обвеса этим
#  build-page.sh» · «Система Студии для локальной машины и максимум
#  локальной сети. Нахера нам билдить gz версии?»
#
#  Страница собирается в build/tools/public/index.html, и сервер читает
#  её С ДИСКА при каждой загрузке (RUACH_PAGE из start.sh): собрал —
#  обнови вкладку браузера. Ни cmake, ни перезапуска, ни gzip.
#  Копии страницы внутри сервера нет (HERESY 1166, слово Виктора
#  04.10.2026: «избавиться от index.html.gz и других .gz»): нет её на
#  диске — сервер так и скажет: «запусти ./build.sh».
#
#  Пуск:
#      ./build.sh              страница; сервер — если менялся его C++ (и тогда перезапуск)
#      ./build.sh --server     и сервер тоже, даже без правок C++
#      ./build.sh --patches    сперва недостающие патчи heresy (heresy/apply.sh)
#      ./build.sh --no-restart сервер собрать, но не перезапускать
#      ./build.sh --status     что из патчей наложено
#
#  Перезапуск — только когда Студия не рендерит (спрашивает /hardware).
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HPY="$ROOT/.venv/bin/python"; [ -x "$HPY" ] || HPY=python3   # HERESY 1080: the Studio's one environment
export TMPDIR="$ROOT/tmp"
mkdir -p "$TMPDIR"
export CUDA_HOME="${RUACH_CUDA_HOME:-/usr/local/cuda-12.8}"   # HERESY 1259: the toolkit launcher/env.sh found (Pinokio's own where the machine has none)
export PATH="$CUDA_HOME/bin:$PATH"
PORT="${YUE2CPP_PORT:-7777}"
G="\e[1;32m"; R="\e[1;31m"; Y="\e[1;33m"; D="\e[2m"; X="\e[0m"
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G=""; R=""; Y=""; D=""; X=""; fi
cd "$ROOT"
step() { echo -e "${G}── $1${X}"; }

PATCHES=0; SERVER=0; SYCL=0; RESTART=1
for a in "$@"; do
    case "$a" in
        --status)     heresy/apply.sh --status; exit 0 ;;
        --patches)    PATCHES=1 ;;
        --server)     SERVER=1 ;;
        --sycl)       SYCL=1 ;;                         # HERESY 1656: the engine for Intel Arc (beta)
        --no-restart) RESTART=0 ;;
        --page)       ;;                                # the old key: the page is always built
        *) echo -e "${R}keys: --server · --sycl · --patches · --no-restart · --status · none: the page (and the server when needed)${X}"; exit 1 ;;
    esac
done

if [ $PATCHES = 1 ]; then
    step "① patches"
    heresy/apply.sh
fi

# ── ② страница: index.html со всеми стилями, скриптами и примерами внутри, одним файлом
step "② the page"
SRC="$ROOT/build/tools/console"
EXAMPLES="$ROOT/build/tools/webui/example"
PAGE="$ROOT/build/tools/public/index.html"
mkdir -p "$(dirname "$PAGE")"   # HERESY 1167: a fresh clone has no public/ (the page is the only thing in it, and it is made here)
for f in index.html app.css themes.css instrumental.js help.js loras.js vaes.js themes.js app.js; do
    [ -f "$SRC/$f" ] || { echo -e "${R}missing ${SRC#"$ROOT"/}/$f${X}"; exit 1; }
done
TS0=$(date +%s%N)
stats=$("$HPY" - "$SRC" "$EXAMPLES" "$PAGE.part" "$ROOT" <<'PY'
import json, pathlib, re, sys

src, examples, page = (pathlib.Path(a) for a in sys.argv[1:4])
root = sys.argv[4]                # HERESY 1362: the install's root (a bare name from an older caller still works)
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "app.css").read_text(encoding="utf-8")

# HERESY 2139 (Viktor 06.11.2026, from his remote connection: «Вот очередная загрузка шрифтов без кеширования - это неприятно на удалённом соединении.
# Да и все assets загружать с кешированием, но в каждом иметь ключ ?675tg9 релиз тега»): every URL of the page's own files gets its file's key, the
# first ten hex of its SHA-256 (?v=KEY), so a file that did not change keeps its key across builds and releases, the fonts above all, and one that
# did gets a new key at once. The engine and the lab keep a file a year (immutable) only under its own key (tools/asset-cache.h, lab/byte_ranges.py),
# anything else is asked again. Keyed here: the stylesheets' url() (the fonts' faces), the page's links (the manifest, its icon), the manifest's
# icons (the manifest goes beside the page, its icons keyed), and the files the page's scripts ask for by name (the piano roll's sounds), handed to
# them in window.RUACH_BUILD with the build's id and the release (VERSION). Only the page's line count is kept: every key goes inside a line
# (RUACH_BUILD_MAP stays true). A URL whose file is not here stays as it was, said below, never given a key made up
import hashlib, os
LAB = pathlib.Path(root) / "lab"
ASSET_ROOTS = (("/lab/fonts/", LAB / "fonts"), ("/lab/sounds/", LAB / "sounds"), ("/pwa/", src / "pwa"))
ASSET_URL = r"/(?:lab/fonts|lab/sounds|pwa)/[A-Za-z0-9._-]+"
asset_keys, asset_missing, asset_count = {}, [], {"css": 0, "links": 0, "manifest": 0}


def keyed(url, where=None):
    """url with ?v=KEY of the file it names; as it was (and said) when that file is not here"""
    for prefix, folder in ASSET_ROOTS:
        if url.startswith(prefix) and url not in asset_keys:
            f = folder / url[len(prefix):]
            if f.is_file():
                asset_keys[url] = hashlib.sha256(f.read_bytes()).hexdigest()[:10]
    if url not in asset_keys:
        asset_missing.append(url)
        return url
    if where:
        asset_count[where] += 1
    return url + "?v=" + asset_keys[url]


def keyed_css(text):
    return re.sub(r"url\(\s*(['\"]?)(" + ASSET_URL + r")\1\s*\)", lambda m: "url(" + m.group(1) + keyed(m.group(2), "css") + m.group(1) + ")", text)


manifest_src = src / "pwa" / "manifest.webmanifest"
if manifest_src.is_file():   # beside the page, its icons keyed: the engine serves this one (and the source's when there is none)
    mtext = re.sub(r'"(' + ASSET_URL + r')"', lambda m: '"' + keyed(m.group(1), "manifest") + '"', manifest_src.read_text(encoding="utf-8"))
    built_manifest = page.parent / "manifest.webmanifest"
    (page.parent / "manifest.webmanifest.part").write_text(mtext, encoding="utf-8")
    os.replace(page.parent / "manifest.webmanifest.part", built_manifest)
    asset_keys["/manifest.webmanifest"] = hashlib.sha256(built_manifest.read_bytes()).hexdigest()[:10]
html = re.sub(r'(\b(?:href|src)=")(' + ASSET_URL + r'|/manifest\.webmanifest)(")', lambda m: m.group(1) + keyed(m.group(2), "links") + m.group(3), html)
# the piano roll's sounds by name (heresy-roll.js asks window.RuachAsset): the names the lab's /sounds/ serves
for f in sorted((LAB / "sounds").glob("*.mp3")) if (LAB / "sounds").is_dir() else []:
    if re.fullmatch(r"[a-z]+-\d{2,3}\.mp3", f.name):
        keyed("/lab/sounds/" + f.name)
try:
    release = (pathlib.Path(root) / "VERSION").read_text(encoding="utf-8").strip()
except OSError:
    release = ""
    print("  \u26a0 no VERSION beside build.sh: the page says no release", file=sys.stderr)
runtime = {u: k for u, k in sorted(asset_keys.items()) if u.startswith("/lab/sounds/")}
BUILD_SLOT = 'window.RUACH_BUILD = { id: "dev", release: "dev", keys: {} };'
if html.count(BUILD_SLOT) > 1:
    sys.exit(f"{BUILD_SLOT!r} appears {html.count(BUILD_SLOT)} times in index.html (want exactly 1)")
had_slot = html.count(BUILD_SLOT) == 1
if not had_slot:   # an index.html from before the slot: the stylesheets and links are keyed all the same, the scripts' files are not
    print("  ⚠ index.html has no window.RUACH_BUILD slot: the files its scripts ask for by name go unkeyed (no-cache), the build's id in the meta only",
          file=sys.stderr)
html = html.replace(BUILD_SLOT, "window.RUACH_BUILD = " + json.dumps({"id": "dev", "release": release, "keys": runtime}, separators=(",", ":")) + ";")


# HERESY 1169 (Viktor 07.10.2026: «три кнопочки svg -, +, reset для скейла… В минус шагом 2pt до минус 4, а в плюс… до макс 8pt…
# глобальный скейл шрифтов с минус 2 и плюс до 4»): every font size of the stylesheets, in px or pt (never 0), is written
# calc(N + var(--fs, 0pt)), so the text grows and the layout does not; the page sets --fs (☰, a lifted frame), unset it is 0
def scaled(text):
    text = re.sub(r"(font-size:\s*)(?!0(?:\.0+)?(?:px|pt)\b)(\d+(?:\.\d+)?(?:px|pt))(?=\s*[;}!])", r"\1calc(\2 + var(--fs, 0pt))", text)
    return re.sub(r"(\bfont:\s*(?:(?:italic|oblique|normal|bold|bolder|lighter|small-caps|[1-9]00)\s+)*)(\d+(?:\.\d+)?(?:px|pt))(?=[\s/])",
                  r"\1calc(\2 + var(--fs, 0pt))", text)


css = keyed_css(scaled(css))   # HERESY 2139: and its files' keys
js = (src / "app.js").read_text(encoding="utf-8")
ins = (src / "instrumental.js").read_text(encoding="utf-8")
helps = (src / "help.js").read_text(encoding="utf-8")
lorajs = (src / "loras.js").read_text(encoding="utf-8")
vaejs = (src / "vaes.js").read_text(encoding="utf-8")
themecss = (src / "themes.css").read_text(encoding="utf-8")
themecss = keyed_css(scaled(themecss))
themejs = (src / "themes.js").read_text(encoding="utf-8")

prompts = []
# HERESY 1035: our own examples (heresy/examples/*.json) come after the official ones, each with
# its "group" (Readings…); the page offers them by name and keeps "random" to the official set.
ours = pathlib.Path(sys.argv[1]).resolve().parents[2] / "heresy" / "examples"   # build/tools/console -> Kit root
for path in (sorted(examples.glob("*.json")) if examples.is_dir() else []) + (sorted(ours.glob("*.json")) if ours.is_dir() else []):
    data = json.loads(path.read_text(encoding="utf-8"))
    prompts.append({k: data[k] for k in ("title", "style", "lyrics", "cot", "abc", "seed", "group")
                    if k in data and data[k] not in (None, "")})
# "</" inside a JSON string is written "<\/" so it can never close the script.
examples_js = ("window.YUE2_EXAMPLES = " +
               json.dumps(prompts, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + ";")

for name, text, closer in (("app.css", css, "</style"), ("instrumental.js", ins, "</script"), ("help.js", helps, "</script"), ("loras.js", lorajs, "</script"), ("vaes.js", vaejs, "</script"), ("themes.css", themecss, "</style"), ("themes.js", themejs, "</script"), ("app.js", js, "</script")):
    if closer in text.lower():
        sys.exit(f"{name} contains '{closer}>', which would end its inlined block")

# Each marker must appear exactly once; the page is assembled from slices of the
# original, so inlined text can never be mistaken for a later marker.
swaps = [
    ('<link rel="stylesheet" href="app.css" />', "<style>\n" + css + "</style>"),
    ('<link rel="stylesheet" href="themes.css" />', "<style>\n" + themecss + "</style>"),
    ('<script src="examples.js"></script>', "<script>" + examples_js + "</script>"),
    ('<script src="instrumental.js"></script>', "<script>\n" + ins + "</script>"),
    ('<script src="help.js"></script>', "<script>\n" + helps + "</script>"),
    ('<script src="loras.js"></script>', "<script>\n" + lorajs + "</script>"),
    ('<script src="vaes.js"></script>', "<script>\n" + vaejs + "</script>"),
    ('<script src="themes.js"></script>', "<script>\n" + themejs + "</script>"),
    ('<script src="app.js"></script>', "<script>\n" + js + "</script>"),
]
# HERESY: our own modules (heresy-*.js) are inlined wherever index.html names them,
# so a new one needs no edit here. The same checks as the kit's files apply.
for name in re.findall(r'<script src="(heresy-[a-z0-9-]+\.js)"></script>', html):
    text = (src / name).read_text(encoding="utf-8")
    if "</script" in text.lower():
        sys.exit(f"{name} contains '</script>', which would end its inlined block")
    swaps.append((f'<script src="{name}"></script>', "<script>\n" + text + "</script>"))
# HERESY 1274 (Viktor 09.10.2026: «abcjs и шрифты ложи всё в репо… Минимум интернета из Студии на локальной машине»): what the page
# carries of others' (vendor/: abcjs, the fonts' faces) is inlined as our own is; the font files themselves the lab serves (/lab/fonts/)
for name in re.findall(r'<script src="(vendor/[A-Za-z0-9._-]+\.js)"></script>', html):
    text = (src / name).read_text(encoding="utf-8")
    if "</script" in text.lower():
        sys.exit(f"{name} contains '</script>', which would end its inlined block")
    swaps.append((f'<script src="{name}"></script>', "<script>\n" + text + "\n</script>"))
for name in re.findall(r'<link rel="stylesheet" href="(vendor/[A-Za-z0-9._-]+\.css)" />', html):
    text = keyed_css((src / name).read_text(encoding="utf-8"))   # HERESY 2139: the fonts' faces by their files' keys
    if "</style" in text.lower():
        sys.exit(f"{name} contains '</style>', which would end its inlined block")
    swaps.append((f'<link rel="stylesheet" href="{name}" />', "<style>\n" + text + "</style>"))
found = []
for marker, replacement in swaps:
    count = html.count(marker)
    if count != 1:
        sys.exit(f"marker {marker!r} appears {count} times in index.html (want exactly 1)")
    found.append((html.index(marker), marker, replacement))
found.sort()
# HERESY 2102 (Viktor's debug journal of 05.11.2026: a stack pointed at line 108 976 of the built page, which no source has): as the page is put
# together, a map of its lines to their files ([its first line here, the file, that line in the file]) goes at its very end, where it moves no line,
# and the build's id (its time and the start of its hash) into its <meta name="ruach-build">; the debug journal writes both beside every stack
out, at, bmap, rline = [], 0, [], 1
for index, marker, replacement in found:
    seg = html[at:index]
    bmap.append([rline, "index.html", html.count("\n", 0, at) + 1])
    out.append(seg)
    rline += seg.count("\n")
    named = re.search(r'(?:src|href)="([^"]+)"', marker)
    bmap.append([rline + (1 if replacement.startswith(("<script>\n", "<style>\n")) else 0), named.group(1) if named else "?", 1])
    out.append(replacement)
    rline += replacement.count("\n")
    at = index + len(marker)
bmap.append([rline, "index.html", html.count("\n", 0, at) + 1])
out.append(html[at:])
result = "".join(out)
import hashlib, time
build_id = time.strftime("%Y%m%dT%H%M%S") + "-" + hashlib.sha1(result.encode("utf-8")).hexdigest()[:8]   # a T in it: «20261106-020305-…» read as a take's name, and the journal's scrub made it a take# mark
result = result.replace('<meta name="ruach-build" content="dev" />', '<meta name="ruach-build" content="' + build_id + '" />', 1)
if result.count('window.RUACH_BUILD = {"id":"dev",') > 1:   # HERESY 2139: beside the release, never in it (2104's test reads the id's form)
    sys.exit("window.RUACH_BUILD's id slot is in the page more than once")
result = result.replace('window.RUACH_BUILD = {"id":"dev",', 'window.RUACH_BUILD = {"id":"' + build_id + '",', 1)
missing = sorted(set(asset_missing))
print(f"  keys: {asset_count['css']} url() in the stylesheets, {asset_count['links']} links of the page, {asset_count['manifest']} icons of the manifest,"
      f" {len(runtime) if had_slot else 0} files the scripts ask for by name; release {release or '?'}", file=sys.stderr)
for u in missing:
    print(f"  \u26a0 not keyed, no such file here: {u} (asked for as it is: no-cache, never kept a year)", file=sys.stderr)
if "</body>" in result:
    at_end = result.rindex("</body>")
    result = result[:at_end] + "<script>window.RUACH_BUILD_MAP=" + json.dumps(bmap, separators=(",", ":")) + ";</script>" + result[at_end:]

# The install's own path is data: the page must not carry it, nor any home path. External links whose name happens to match
# (upstream's own repo, which the CPP badge opens, and the collection's own repo, which the status note opens) are not paths, so they
# are left out. HERESY 1362 (1259's audit): its path, not its folder's name: a clone into «studio» or «music» built nothing, the page
# saying «studio» 940 times and «music» 1951 as words; what would be baked in is the root as given or resolved, a home path, or the
# folder's name heading one of the tree's own folders (/NAME/build/, /NAME/outputs/ …), and none of those is in the page
import os
EXTERNAL = ("https://github.com/ServeurpersoCom/yue2.cpp", "https://github.com/IronWolve/yue2-kit")
checked = re.sub(r"<!-- credits:.*?<!-- /credits -->", "", result, flags=re.S)   # the About card's upstream names
for url in EXTERNAL:   # the whole link (its text names the project too), then any bare mention of the URL
    checked = re.sub(r'<a\b[^>]*href="' + re.escape(url) + r'"[^>]*>.*?</a>', "", checked, flags=re.S)
    checked = checked.replace(url, "")
folder = os.path.basename(root.rstrip("/")) or root
for bad in ([root, os.path.realpath(root)] if root.startswith("/") else []) + ["/home/"]:
    if bad and bad in checked:
        sys.exit(f"the page contains {bad!r}; paths must not be baked in")
inside = re.search("/" + re.escape(folder) + r"/(?:build|tools|outputs|heresy|lab|user|artwork|models|checkpoints|tmp)/", checked)
if inside:
    sys.exit(f"the page contains {inside.group(0)!r}; the install's own paths must not be baked in")

page.write_text(result, encoding="utf-8")
# the stats groups: every stylesheet and every script that was inlined
styles = (css, themecss)
scripts = (js, ins, helps, lorajs, vaejs, themejs)
sizes = [len(t.encode("utf-8")) for t in (html, "".join(styles), "".join(scripts), examples_js, result)]
lines = [t.count("\n") for t in (html, "".join(styles), "".join(scripts))]
print("\t".join(str(v) for v in sizes + lines + [len(prompts), len(styles), len(scripts)]))
PY
) || { echo -e "${R}⛔ the page did not build (above: why)${X}"; rm -f "$PAGE.part"; exit 1; }
mv "$PAGE.part" "$PAGE"
IFS=$'\t' read -r s_html s_css s_js s_ex s_page l_html l_css l_js n_ex n_css n_js <<<"$stats"
echo -e "  ${PAGE#"$ROOT"/} · $(( s_page / 1024 )) KB · $((1 + n_css + n_js)) files and $n_ex examples inside · $(( ($(date +%s%N) - TS0) / 1000000 )) ms"

# ── HERESY 1613 (Viktor 20.10.2026: «Докачиваем новый транскрайбер (1 ГБ) прямо в апдейте»): since 1604 the engine reads SheetSage2's
#    head with MERT-v2-FullSong beside it; an install whose transcriber is the older one-file kind, or a head with no MERT beside it, fetches
#    the pair once, here, as the updater runs this script after its checkout. Only an install that had a transcriber; a failed fetch is
#    said, and the build goes on (start.sh then leaves covers off and says what to run)
SS2="$ROOT/models/SheetSage2-Q8_0.gguf"; [ -f "$SS2" ] || SS2="$ROOT/models/SheetSage2-F32.gguf"
if [ -f "$SS2" ] && { [ ! -f "$ROOT/models/MERT-v2-FullSong-${SS2##*-}" ] || [ "$(wc -c < "$SS2" | tr -d ' ')" -ge 500000000 ]; }; then
    step "the transcriber"
    echo -e "  ${SS2#"$ROOT"/} is the older kind: fetching SheetSage2's head with MERT-v2-FullSong beside it (Q8_0, 1.0 GB)"
    if [ -x "$ROOT/download-models.sh" ] && NO_COLOR=1 "$ROOT/download-models.sh" --transcriber-only 2>&1 | sed 's/^/  /'; then
        echo -e "${G}  the transcriber as this engine reads it${X}"
    else
        echo -e "${Y}  not fetched: covers from a recording stay off until ./download-models.sh --transcriber${X}"
    fi
fi

# ── HERESY 1834 (Viktor 28.10.2026: «вживляй MuScriptor в Студию — в паспорт треков и в самого Огранщика»): the transcriber of any sound into
#    multi-instrument MIDI is a small program of its own (build/muscriptor: muscriptor.cpp at its pinned commit, with the ggml it pins), built into
#    build/build-muscriptor the first time and when its source is newer. Not the server's build: it never restarts the Studio. Its fetch needs
#    the network once; a failure is said and the build goes on (Engine → Models says the transcriber is missing)
MSC_BIN="$ROOT/build/build-muscriptor/ruach-muscriptor"
if [ -f "$ROOT/build/muscriptor/CMakeLists.txt" ] && { [ ! -x "$MSC_BIN" ] || [ -n "$(find "$ROOT/build/muscriptor" -type f -newer "$MSC_BIN" 2>/dev/null | head -1)" ]; }; then
    step "the MIDI transcriber (MuScriptor)"
    MSC_GEN=(); ninja --version >/dev/null 2>&1 && MSC_GEN=(-G Ninja)
    if { [ -f "$ROOT/build/build-muscriptor/CMakeCache.txt" ] || cmake -S "$ROOT/build/muscriptor" -B "$ROOT/build/build-muscriptor" "${MSC_GEN[@]}" \
            -DCMAKE_BUILD_TYPE=Release >"$ROOT/build/muscriptor-configure.log" 2>&1; } \
       && nice -n 10 cmake --build "$ROOT/build/build-muscriptor" -j "$(nproc)" >"$ROOT/build/muscriptor-build.log" 2>&1; then
        echo -e "${G}  build/build-muscriptor/ruach-muscriptor${X}"
    else
        echo -e "${Y}  not built (build/muscriptor-configure.log, build/muscriptor-build.log say why): sound to MIDI stays off${X}"
    fi
fi

# ── HERESY 1169: our fixes to ggml (a submodule, someone else's fork) are patch files of our own, build/ggml-patches/:
#    put on before the server is built, each once (one already on is passed over; one that no longer fits is said)
GGML_PUT=0
for p in "$ROOT"/build/ggml-patches/*.patch; do
    [ -f "$p" ] || continue
    if git -C "$ROOT/build/ggml" apply --check "$p" 2>/dev/null; then
        git -C "$ROOT/build/ggml" apply "$p" && GGML_PUT=1 && echo -e "  ggml: ${p##*/} put on"
    elif ! git -C "$ROOT/build/ggml" apply --check -R "$p" 2>/dev/null; then
        echo -e "${Y}  ggml: ${p##*/} does not fit this ggml${X}"
    fi
done
[ "$GGML_PUT" = 1 ] && SERVER=1

# ── HERESY 1656 (Viktor 21.10.2026: «Конечно, выпускай бета поддержку для интеловских карт»): Intel Arc (beta). --sycl builds the engine
#    with oneAPI's icpx into build/build-sycl, the CUDA one in build/build left as it is; start.sh runs it with YUE2_ENGINE=sycl, or by itself
#    where there is no CUDA engine. Measured 21.10.2026 on an Arc Pro B50 (16 GB): a song of 30 s in 43-60 s, adapters at run time, Full,
#    going on from kept music. icpx takes the newest GCC; when that one has no libstdc++ headers (GCC 14 on Ubuntu 24.04), the newest that has.
#    HERESY 1661: an install with a SYCL engine and no CUDA one goes this way by itself (the updater runs ./build.sh after its checkout); one
#    with both rebuilds the SYCL engine beside the CUDA one, so a studio on the Arc restarts on fresh code too
sycl_build() {
    step "${1:-③} the engine for Intel Arc (beta, SYCL)"
    [ -f /opt/intel/oneapi/setvars.sh ] || { echo -e "${R}⛔ Intel's oneAPI Base Toolkit is not at /opt/intel/oneapi: install it first (icpx and the SYCL runtime)${X}"; exit 1; }
    set +u; source /opt/intel/oneapi/setvars.sh >/dev/null 2>&1 || true; set -u
    local GF="" g TS1
    for g in $(ls -d /usr/lib/gcc/x86_64-linux-gnu/* 2>/dev/null | sort -V -r); do [ -d "/usr/include/c++/${g##*/}" ] && { GF="--gcc-install-dir=$g"; break; }; done
    if [ ! -f "$ROOT/build/build-sycl/CMakeCache.txt" ]; then
        echo -e "  configuring cmake (the first time): SYCL (icpx${GF:+, $GF}), Release"
        cmake -S "$ROOT/build" -B "$ROOT/build/build-sycl" -DCMAKE_BUILD_TYPE=Release -DGGML_SYCL=ON -DCMAKE_C_COMPILER=icx -DCMAKE_CXX_COMPILER=icpx \
              ${GF:+"-DCMAKE_C_FLAGS=$GF" "-DCMAKE_CXX_FLAGS=$GF" "-DCMAKE_EXE_LINKER_FLAGS=$GF" "-DCMAKE_SHARED_LINKER_FLAGS=$GF"} >/dev/null \
            || { echo -e "${R}⛔ cmake did not configure for SYCL: build/build-sycl/CMakeFiles/CMakeError.log says why${X}"; exit 1; }
    fi
    TS1=$(date +%s)
    nice -n 10 cmake --build build/build-sycl -j "$(nproc)" --target yue-server 2>&1 | grep -E "error|Linking CXX executable yue-server|no work" || true
    [ "${PIPESTATUS[0]}" = 0 ] || { echo -e "${R}⛔ the SYCL build failed: cmake --build build/build-sycl says why${X}"; exit 1; }
    echo -e "  built in $(( $(date +%s) - TS1 )) s: build/build-sycl/yue-server"
}
# the Studio runs the SYCL engine: start.sh would take it (YUE2_ENGINE=sycl in its unit, or no CUDA engine)
studio_on_sycl() {
    [ ! -f "$ROOT/build/build/yue-server" ] || systemctl --user show -p Environment --value ruach-studio 2>/dev/null | grep -q "YUE2_ENGINE=sycl"
}
[ $SYCL = 0 ] && [ ! -f "$ROOT/build/build/CMakeCache.txt" ] && [ -f "$ROOT/build/build-sycl/CMakeCache.txt" ] && SYCL=1
if [ $SYCL = 1 ]; then
    sycl_build
    echo -e "${Y}  Intel Arc (beta, no guarantees): YUE2_ENGINE=sycl ./start.sh; with no CUDA engine beside it, start.sh takes this one by itself${X}"
    if [ $RESTART = 0 ] || ! studio_on_sycl; then exit 0; fi
fi

# ── ③ сервер: только если его C++ новее бинаря (или --server)
BIN="$ROOT/build/build/yue-server"
if [ $SYCL = 1 ]; then :          # HERESY 1661: the SYCL way ran; on to the restart
elif [ $SERVER = 0 ] && [ -x "$BIN" ] && [ -z "$(find "$ROOT/build/tools" "$ROOT/build/src" "$ROOT/build/CMakeLists.txt" \
        \( -name "*.cpp" -o -name "*.h" -o -name "*.hpp" -o -name "*.c" -o -name "*.cu" -o -name CMakeLists.txt \) -newer "$BIN" 2>/dev/null | head -1)" ]; then
    echo -e "${G}  done: reload the browser tab (the server reads the page from disk)${X}"
    exit 0
fi
if [ $SYCL = 0 ]; then
    step "③ the server"
    if [ ! -f "$ROOT/build/build/CMakeCache.txt" ]; then                 # a fresh clone: configure once, as Forge's was
        GEN=(); ninja --version >/dev/null 2>&1 && GEN=(-G Ninja)   # HERESY 1259: a ninja that answers (a pip wrapper without its module is on a PATH too)
        NVCC="$(command -v nvcc || echo "$CUDA_HOME/bin/nvcc")"
        echo -e "  configuring cmake (the first time): CUDA ($NVCC), flash attention, Release"
        cmake -S "$ROOT/build" -B "$ROOT/build/build" "${GEN[@]}" -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DGGML_CUDA_FA=ON \
              -DCMAKE_CUDA_COMPILER="$NVCC" -DCMAKE_CUDA_ARCHITECTURES=native >/dev/null || { echo -e "${R}⛔ cmake did not configure: it needs the CUDA toolkit 12.8 (nvcc); an Intel Arc card: ./build.sh --sycl${X}"; exit 1; }
    fi
    TS1=$(date +%s)
    nice -n 10 cmake --build build/build -j "$(nproc)" 2>&1 | grep -E "error|Linking CXX executable yue-server|no work" || true
    [ "${PIPESTATUS[0]}" = 0 ] || { echo -e "${R}⛔ the build failed: cmake --build build/build says why${X}"; exit 1; }
    echo -e "  built in $(( $(date +%s) - TS1 )) s"
    # HERESY 1661: the Intel Arc engine beside it, on the same code
    if [ -f "$ROOT/build/build-sycl/CMakeCache.txt" ]; then sycl_build "③b"; fi
fi

[ $RESTART = 1 ] || { echo -e "${Y}  not restarted: systemctl --user restart ruach-studio${X}"; exit 0; }

# ── ④ перезапуск: сервер — новый бинарь; только когда Студия свободна
step "④ the restart"
if ! systemctl --user is-active --quiet ruach-studio 2>/dev/null; then
    if pgrep -x yue-server >/dev/null; then
        echo -e "${Y}⚠ a server runs outside systemd, on the old binary: stop it and run ./start.sh${X}"
    else
        echo -e "${G}  the Studio is not running: ./start.sh (or systemctl --user start ruach-studio)${X}"
    fi
    exit 0
fi
BUSY=$(curl -s -m 5 "http://127.0.0.1:$PORT/hardware" | grep -o '"busy": *[a-z]*' | grep -o '[a-z]*$' || true)
if [ "$BUSY" = "true" ]; then
    echo -e "${Y}⚠ the Studio is rendering: left alone. When it is done: systemctl --user restart ruach-studio${X}"
    exit 0
fi
systemctl --user restart ruach-studio
for i in $(seq 1 30); do
    sleep 1
    curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/health" && { echo -e "${G}  the Studio is up in ${i} s: reload the page${X}"; exit 0; }
done
echo -e "${R}⛔ the Studio did not answer in 30 s: journalctl --user -u ruach-studio -n 50${X}"
exit 1
