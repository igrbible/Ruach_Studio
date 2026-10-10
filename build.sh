#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  BUILD · одна команда Студии: страница, сервер, перезапуск
#  (the studio's one build command: the page, the server when its C++ changed, the restart when idle)
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
HPY="$ROOT/.venv/bin/python"; [ -x "$HPY" ] || HPY=python3   # HERESY 1080: the studio's one environment
export TMPDIR="$ROOT/tmp"
mkdir -p "$TMPDIR"
export CUDA_HOME="${RUACH_CUDA_HOME:-/usr/local/cuda-12.8}"   # HERESY 1259: the toolkit pinokio/env.sh found (Pinokio's own where the machine has none)
export PATH="$CUDA_HOME/bin:$PATH"
PORT="${YUE2CPP_PORT:-41867}"
G="\e[1;32m"; R="\e[1;31m"; Y="\e[1;33m"; D="\e[2m"; X="\e[0m"
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G=""; R=""; Y=""; D=""; X=""; fi
cd "$ROOT"
step() { echo -e "${G}── $1${X}"; }

PATCHES=0; SERVER=0; RESTART=1
for a in "$@"; do
    case "$a" in
        --status)     heresy/apply.sh --status; exit 0 ;;
        --patches)    PATCHES=1 ;;
        --server)     SERVER=1 ;;
        --no-restart) RESTART=0 ;;
        --page)       ;;                                # the old key: the page is always built
        *) echo -e "${R}keys: --server · --patches · --no-restart · --status · none: the page (and the server when needed)${X}"; exit 1 ;;
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
T0=$(date +%s%N)
stats=$("$HPY" - "$SRC" "$EXAMPLES" "$PAGE.part" "$(basename "$ROOT")" <<'PY'
import json, pathlib, re, sys

src, examples, page = (pathlib.Path(a) for a in sys.argv[1:4])
folder = sys.argv[4]
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "app.css").read_text(encoding="utf-8")


# HERESY 1169 (Viktor 07.10.2026: «три кнопочки svg -, +, reset для скейла… В минус шагом 2pt до минус 4, а в плюс… до макс 8pt…
# глобальный скейл шрифтов с минус 2 и плюс до 4»): every font size of the stylesheets, in px or pt (never 0), is written
# calc(N + var(--fs, 0pt)), so the text grows and the layout does not; the page sets --fs (☰, a lifted frame), unset it is 0
def scaled(text):
    text = re.sub(r"(font-size:\s*)(?!0(?:\.0+)?(?:px|pt)\b)(\d+(?:\.\d+)?(?:px|pt))(?=\s*[;}!])", r"\1calc(\2 + var(--fs, 0pt))", text)
    return re.sub(r"(\bfont:\s*(?:(?:italic|oblique|normal|bold|bolder|lighter|small-caps|[1-9]00)\s+)*)(\d+(?:\.\d+)?(?:px|pt))(?=[\s/])",
                  r"\1calc(\2 + var(--fs, 0pt))", text)


css = scaled(css)
js = (src / "app.js").read_text(encoding="utf-8")
ins = (src / "instrumental.js").read_text(encoding="utf-8")
helps = (src / "help.js").read_text(encoding="utf-8")
lorajs = (src / "loras.js").read_text(encoding="utf-8")
vaejs = (src / "vaes.js").read_text(encoding="utf-8")
themecss = (src / "themes.css").read_text(encoding="utf-8")
themecss = scaled(themecss)
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
    text = (src / name).read_text(encoding="utf-8")
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
out, at = [], 0
for index, marker, replacement in found:
    out.append(html[at:index])
    out.append(replacement)
    at = index + len(marker)
out.append(html[at:])
result = "".join(out)

# The folder name is data: the page must not carry it, nor an absolute home path. External links whose
# name happens to match (upstream's own repo, which the CPP badge opens, and the collection's own repo, which
# the status note opens) are not paths, so they are left out.
EXTERNAL = ("https://github.com/ServeurpersoCom/yue2.cpp", "https://github.com/IronWolve/yue2-kit")
checked = re.sub(r"<!-- credits:.*?<!-- /credits -->", "", result, flags=re.S)   # the About card's upstream names
for url in EXTERNAL:   # the whole link (its text names the project too), then any bare mention of the URL
    checked = re.sub(r'<a\b[^>]*href="' + re.escape(url) + r'"[^>]*>.*?</a>', "", checked, flags=re.S)
    checked = checked.replace(url, "")
for bad in (folder, "/home/"):
    if bad and bad in checked:
        sys.exit(f"the page contains {bad!r}; paths and the folder name must not be baked in")

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
echo -e "  ${PAGE#"$ROOT"/} · $(( s_page / 1024 )) KB · $((1 + n_css + n_js)) files and $n_ex examples inside · $(( ($(date +%s%N) - T0) / 1000000 )) ms"

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

# ── ③ сервер: только если его C++ новее бинаря (или --server)
BIN="$ROOT/build/build/yue-server"
if [ $SERVER = 0 ] && [ -x "$BIN" ] && [ -z "$(find "$ROOT/build/tools" "$ROOT/build/src" "$ROOT/build/CMakeLists.txt" \
        \( -name "*.cpp" -o -name "*.h" -o -name "*.hpp" -o -name "*.c" -o -name "*.cu" -o -name CMakeLists.txt \) -newer "$BIN" 2>/dev/null | head -1)" ]; then
    echo -e "${G}  done: reload the browser tab (the server reads the page from disk)${X}"
    exit 0
fi
step "③ the server"
if [ ! -f "$ROOT/build/build/CMakeCache.txt" ]; then                 # a fresh clone: configure once, as Forge's was
    GEN=(); ninja --version >/dev/null 2>&1 && GEN=(-G Ninja)   # HERESY 1259: a ninja that answers (a pip wrapper without its module is on a PATH too)
    NVCC="$(command -v nvcc || echo "$CUDA_HOME/bin/nvcc")"
    echo -e "  configuring cmake (the first time): CUDA ($NVCC), flash attention, Release"
    cmake -S "$ROOT/build" -B "$ROOT/build/build" "${GEN[@]}" -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DGGML_CUDA_FA=ON \
          -DCMAKE_CUDA_COMPILER="$NVCC" -DCMAKE_CUDA_ARCHITECTURES=native >/dev/null || { echo -e "${R}⛔ cmake did not configure: it needs the CUDA toolkit 12.8 (nvcc)${X}"; exit 1; }
fi
T1=$(date +%s)
nice -n 10 cmake --build build/build -j "$(nproc)" 2>&1 | grep -E "error|Linking CXX executable yue-server|no work" || true
[ "${PIPESTATUS[0]}" = 0 ] || { echo -e "${R}⛔ the build failed: cmake --build build/build says why${X}"; exit 1; }
echo -e "  built in $(( $(date +%s) - T1 )) s"

[ $RESTART = 1 ] || { echo -e "${Y}  not restarted: systemctl --user restart ruach-studio${X}"; exit 0; }

# ── ④ перезапуск: сервер — новый бинарь; только когда Студия свободна
step "④ the restart"
if ! systemctl --user is-active --quiet ruach-studio 2>/dev/null; then
    if pgrep -x yue-server >/dev/null; then
        echo -e "${Y}⚠ a server runs outside systemd, on the old binary: stop it and run ./start.sh${X}"
    else
        echo -e "${G}  the studio is not running: ./start.sh (or systemctl --user start ruach-studio)${X}"
    fi
    exit 0
fi
BUSY=$(curl -s -m 5 "http://127.0.0.1:$PORT/hardware" | grep -o '"busy": *[a-z]*' | grep -o '[a-z]*$' || true)
if [ "$BUSY" = "true" ]; then
    echo -e "${Y}⚠ the studio is rendering: left alone. When it is done: systemctl --user restart ruach-studio${X}"
    exit 0
fi
systemctl --user restart ruach-studio
for i in $(seq 1 30); do
    sleep 1
    curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/health" && { echo -e "${G}  the studio is up in ${i} s: reload the page${X}"; exit 0; }
done
echo -e "${R}⛔ the studio did not answer in 30 s: journalctl --user -u ruach-studio -n 50${X}"
exit 1
