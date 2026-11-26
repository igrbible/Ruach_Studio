"""HERESY 2992 (Viktor 25.11.2026: «По всем моделям и по не ASCII путям с пробелами всё зафикси в Windows порте»; «Веди всё в Виндоуз сборке
легитимным UTF-8»): the native programs the Windows package builds beside the engine (windows.yml's natives job) and how the Studio finds them:
winx.native_exe (engine\\cuda where a card answers, engine\\cpu otherwise, YUE2_ENGINE as start.py takes it), the Writer, the style listener,
the Bank Builder's Listener, sound to MIDI, Drama 3's server, the Narrator's Windows words, the twin's and fetch-heresy.sh's verdicts in step,
the job itself (five legs, static llama.cpp without OpenSSL, the UTF-8 manifest in every .exe, the package and its check) and ruach-muscriptor's
CMakeLists. Offline; Windows played by winx.NT, the modules' NT and the twin's ON_WIN, in a folder with a space and Cyrillic.
    .venv/bin/python lab/test_win_natives_2992.py"""
import contextlib
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
sys.path.insert(0, str(LAB))
import winx  # noqa: E402

YML = next((p for p in (KIT / "heresy" / "root" / "github" / "workflows" / "windows.yml", KIT / ".github" / "workflows" / "windows.yml")
            if p.is_file()), KIT / "heresy" / "root" / "github" / "workflows" / "windows.yml")   # a release tree (the clean clone) has it as .github
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@contextlib.contextmanager
def patched(*triples, env=None):
    """(object, name, value) set for the block and put back after; env: {name: value or None} the same for os.environ."""
    old = [(o, n, getattr(o, n)) for o, n, _ in triples]
    oldenv = {k: os.environ.get(k) for k in (env or {})}
    try:
        for o, n, v in triples:
            setattr(o, n, v)
        for k, v in (env or {}).items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        yield
    finally:
        for o, n, v in old:
            setattr(o, n, v)
        for k, v in oldenv.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)


def fresh():
    r = Path(tempfile.mkdtemp(prefix="ruach-2992-")) / "Мой Studio" / "RuachStudio"
    r.mkdir(parents=True)
    return r


def put(root, kind, name):
    p = root / "engine" / kind / (name + ".exe")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"MZ")
    p.chmod(0o755)
    return p


def windows(card=True, engine=None):
    return patched((winx, "NT", True), (winx, "_CARD", [card]), env={"YUE2_ENGINE": engine})


# ---- winx.native_exe
r = fresh()
put(r, "cpu", "llama-server")
with patched((winx, "NT", False)):
    check(winx.native_exe(r, "llama-server") is None, "Linux and macOS: no package's program, whatever lies in engine\\")
r = fresh()
with windows():
    c, p = put(r, "cuda", "llama-server"), put(r, "cpu", "llama-server")
    check(winx.native_exe(r, "llama-server") == c, "a card answers: engine\\cuda first")
    c.unlink()
    check(winx.native_exe(r, "llama-server") == p, "a card answers, no CUDA build: engine\\cpu")
r = fresh()
with windows(card=False):
    put(r, "cuda", "llama-server")
    check(winx.native_exe(r, "llama-server") is None, "no card: never the CUDA build (it loads the driver's nvcuda.dll)")
    p = put(r, "cpu", "llama-server")
    check(winx.native_exe(r, "llama-server") == p, "no card: engine\\cpu")
r = fresh()
c, p = put(r, "cuda", "audiocpp_server"), put(r, "cpu", "audiocpp_server")
with windows(engine="cpu"):
    check(winx.native_exe(r, "audiocpp_server") == p, "YUE2_ENGINE=cpu beside a card: engine\\cpu, as start.py picks the engine")
with windows(card=False, engine="cuda"):
    check(winx.native_exe(r, "audiocpp_server") == c, "YUE2_ENGINE=cuda: engine\\cuda, as start.py picks the engine")
r = fresh()
p = put(r, "cpu", "ruach-muscriptor")
with windows(engine="cuda"):
    check(winx.native_exe(r, "ruach-muscriptor", ("cpu",)) == p, "the folders a caller names are kept (YUE2_ENGINE picks only the default)")
    check(winx.native_exe(r, "ruach-muscriptor", ("cuda",)) is None, "a folder named and empty: None")
import shutil  # noqa: E402
with patched((winx, "_CARD", []), (winx, "NT", False), (shutil, "which", lambda n: None)):
    check(winx.nvidia_card() is False and winx._CARD == [False], "no nvidia-smi: no card, asked once")
w = winx.no_native("llama-server", "the Studio's own writer")
check(w.startswith("llama-server.exe (the Studio's own writer)") and "engine\\cuda" in w and "engine\\cpu" in w and "Linux" not in w,
      "the words name the program, whose it is and both folders")

# ---- the Writer
import writer_llm  # noqa: E402
r = fresh()
with windows():
    check(writer_llm.server(r).name == "llama-server.exe" and not writer_llm.server(r).is_file(), "the Writer on Windows: none here, none found")
    p = put(r, "cpu", "llama-server")
    check(writer_llm.server(r) == p and writer_llm.server(r, "cpu") == p, "the Writer on Windows: the package's engine\\cpu build")
    c = put(r, "cuda", "llama-server")
    check(writer_llm.server(r) == c, "the Writer on Windows with a card: the package's engine\\cuda build")
    check(writer_llm.server(r, "arc", "vulkan").parts[-3:] == ("build-vulkan", "bin", "llama-server"), "the Arc's build stays Linux's")
with patched((winx, "NT", False)):
    check(writer_llm.server(r) == r / "vendor" / "llama.cpp" / "build" / "bin" / "llama-server", "the Writer on Linux: unchanged")
src = (LAB / "writer_llm.py").read_text(encoding="utf-8")
check('server(kit).is_file() and server(kit).parent.name != "cpu"' in src, "only a CUDA build is put on a card (engine\\cpu's has no CUDA)")
check("the Writer on an Intel Arc runs on Linux for now" in src and "not in the Windows and Mac packages" not in src,
      "the Writer's words on Windows: the Arc said, not «no Intel Arc on this machine»; no «runs on Linux for now» for itself")

# ---- the style listener, the Bank Builder's Listener, sound to MIDI
listener = load("listener_2992", LAB / "listener.py")
r = fresh()
with windows():
    check(listener.mtmd_cli(r) == r / "engine" / "cpu" / "llama-mtmd-cli.exe", "the style listener on Windows: engine\\cpu's place when none is here")
    c = put(r, "cuda", "llama-mtmd-cli")
    check(listener.mtmd_cli(r) == c, "the style listener on Windows with a card: engine\\cuda")
with patched((winx, "NT", False)):
    check(listener.mtmd_cli(r) == r / "vendor" / "llama.cpp" / "build" / "bin" / "llama-mtmd-cli", "the style listener on Linux: unchanged")
check('winx.native_exe(self.kit, "llama-server")' in (LAB / "bankbuilder.py").read_text(encoding="utf-8"),
      "the Bank Builder's Listener takes the package's llama-server on Windows")
import muscriptor  # noqa: E402
r = fresh()
with windows():
    check(muscriptor.binary(r) == r / "engine" / "cpu" / "ruach-muscriptor.exe", "sound to MIDI on Windows: engine\\cpu's place")
    put(r, "cuda", "ruach-muscriptor")
    check(not muscriptor.binary(r).is_file(), "sound to MIDI: never a CUDA folder's (the processor's alone, as on Linux)")
    p = put(r, "cpu", "ruach-muscriptor")
    check(muscriptor.binary(r) == p, "sound to MIDI on Windows: the package's")
    check("engine\\cpu" in muscriptor.not_built() and "build.sh" not in muscriptor.not_built(), "sound to MIDI's words on Windows")
with patched((winx, "NT", False)):
    check(muscriptor.binary(r) == r / "build" / "build-muscriptor" / "ruach-muscriptor"
          and muscriptor.not_built() == "the MIDI transcriber is not built: ./build.sh builds it", "sound to MIDI on Linux: unchanged")

# ---- Drama 3's server and the Narrator's words
drama3 = load("drama3_2992", LAB / "reader_engines" / "drama3" / "engine.py")
r = fresh()
with patched((drama3, "NT", True), env={"READER_AUDIOCPP_SERVER": None, "READER_AUDIOCPP_VULKAN": None}):
    try:
        drama3.server_bin(r, "cuda")
        said = ""
    except RuntimeError as e:
        said = str(e)
    check("engine\\cuda: the Windows package brings it" in said and "bash" not in said, "Drama 3 on Windows, none here: said in words, no bash")
    p = put(r, "cpu", "audiocpp_server")
    check(drama3.server_bin(r, "cpu") == p, "Drama 3 on Windows on the processor: engine\\cpu's server")
    try:
        drama3.server_bin(r, "cuda")
        said = ""
    except RuntimeError as e:
        said = str(e)
    check("not in this Studio" in said, "Drama 3 on a card: the processor's build never stands in for the card's")
    c = put(r, "cuda", "audiocpp_server")
    check(drama3.server_bin(r, "cuda") == c, "Drama 3 on Windows on a card: engine\\cuda's server")
    try:
        drama3.server_bin(r, "xpu")
        said = ""
    except RuntimeError as e:
        said = str(e)
    check("Linux for now" in said, "Drama 3 on an Intel card on Windows: said, it reads on Linux for now")
with patched((drama3, "NT", False), env={"READER_AUDIOCPP_SERVER": None}):
    try:
        drama3.server_bin(fresh(), "cpu")
        said = ""
    except RuntimeError as e:
        said = str(e)
    check("bash tools/narrator-setup.sh" in said, "Drama 3 on Linux: its words unchanged")
man = json.loads((LAB / "reader_engines" / "drama3" / "engine.json").read_text(encoding="utf-8"))
server = next(n for n in man["needs"] if n["id"] == "server")
check({"engine/cuda/audiocpp_server.exe", "engine/cpu/audiocpp_server.exe"} <= set(server["any"][:8]), "the Narrator's manifest: the package's servers")
check(len(server["say_nt"]) <= 160 and len(man["setup"]["command_nt"]) <= 120, "the Narrator's Windows words fit what reader.py keeps")
import reader  # noqa: E402
with patched((reader, "kit", lambda: Path("/nonexistent-2992")), (reader, "NT", True)):
    check({"id": "server", "say": server["say_nt"]} in reader._missing(man["needs"], []), "the Narrator on Windows: its server's Windows words")
    check(reader._setup_of(man["setup"])["command"] == man["setup"]["command_nt"], "the Narrator's setup on Windows: Engine → Models, not bash")
with patched((reader, "kit", lambda: Path("/nonexistent-2992")), (reader, "NT", False)):
    check({"id": "server", "say": server["say"]} in reader._missing(man["needs"], [])
          and reader._setup_of(man["setup"])["command"] == "bash tools/narrator-setup.sh", "the Narrator on Linux: unchanged")

# ---- the twin and fetch-heresy.sh
twin = load("fetch_heresy_2992", KIT / "launcher" / "fetch_heresy.py")
with patched((twin, "ON_WIN", True)):
    a, steps = twin.plan(["--only", "none", "--writer", "quality", "--listener", "Q8_0", "--narrator", "Q4_K", "--muscriptor", "small", "--yes"], KIT)
tools = {s["what"]: s for s in steps if s.get("op") == "tool"}
for what, name, kinds in (("llama-server", "llama-server", ("cuda", "cpu")), ("llama-mtmd-cli", "llama-mtmd-cli", ("cuda", "cpu")),
                          ("audio.cpp's server", "audiocpp_server", ("cuda", "cpu")), ("ruach-muscriptor", "ruach-muscriptor", ("cpu",))):
    s = tools[what]
    check(all(f"engine/{k}/{name}.exe" in s["where"] for k in kinds) and "for now" not in s["miss"] and "yet" not in s["miss"]
          and "the Windows package brings it" in s["miss"], f"the twin on Windows: {what} looked for beside the engine, and said so")
check(not any(s.get("op") == "code" and s.get("repo") == "ggml-org/llama.cpp" for s in steps), "the twin on Windows clones no llama.cpp")
with patched((twin, "ON_WIN", False)):
    a, steps = twin.plan(["--only", "none", "--writer", "quality", "--yes"], KIT)
check(next(s for s in steps if s.get("what") == "llama-server")["here"] == "(vendor/llama.cpp/build)", "the twin on Linux: unchanged")
sh = (KIT / "heresy" / "fetch-heresy.sh").read_text(encoding="utf-8")
for v in ("BESIDE", "NO_NATIVE"):
    m = re.search(rf'^{v}="(.*)"$', sh, re.M)
    check(m and m.group(1).replace("\\\\", "\\") == getattr(twin, v), f"fetch-heresy.sh and the twin say {v} alike")
for call in ("native_here llama-server cuda cpu", "native_here llama-mtmd-cli cuda cpu", "native_here audiocpp_server cuda cpu",
             "native_here ruach-muscriptor cpu", "[ $ON_WIN = 1 ] || clone https://github.com/ggml-org/llama.cpp.git"):
    check(call in sh, f"fetch-heresy.sh under Git bash: {call}")
check("the Studio's own writer runs on Linux for now" not in sh, "fetch-heresy.sh: the Writer no longer «on Linux for now»")

# ---- the natives job, the package and its check
try:
    import yaml
except ImportError:
    yaml = None
if yaml:
    y = yaml.safe_load(YML.read_text(encoding="utf-8"))
    job = y["jobs"]["natives"]
    legs = {(i["what"], i["kind"]) for i in job["strategy"]["matrix"]["include"]}
    check(legs == {("llama", "cpu"), ("llama", "cuda12"), ("narrator", "cpu"), ("narrator", "cuda12"), ("muscriptor", "cpu")}, "the natives job: five legs")
    check(re.fullmatch(r"[0-9a-f]{40}", str(job["env"]["LLAMA_COMMIT"])) is not None, "llama.cpp at a whole commit")
    run = "\n".join(s.get("run", "") for s in job["steps"])
    for w in ("-DBUILD_SHARED_LIBS=OFF", "-DLLAMA_OPENSSL=OFF", "-DGGML_NATIVE=OFF", "build\\tools\\utf8.manifest", "-outputresource:",
              'Models = "fish_drama3"', "DeploymentBuild = $true", 'CpuArch = "avx2"', "-DRUACH_MSC_NATIVE=OFF", "activeCodePage", "-1073741515"):
        check(w in run, f"the natives job: {w}")
    up = next(s for s in job["steps"] if str(s.get("uses", "")).startswith("actions/upload-artifact"))
    check(up["with"]["name"] == "ruach-engine-windows-x64-${{ matrix.what }}-${{ matrix.kind }}", "its zips under the engines' pattern (engines_from takes them too)")
    pack = y["jobs"]["package-windows"]
    check("natives" in pack["needs"] and "needs.natives" not in pack["if"] and "needs.cpu.result != 'failure'" in pack["if"],
          "the package waits for the natives, and a failed leg does not stop it")
    asm = next(s["run"] for s in pack["steps"] if s.get("id") == "pack")
    check(all(f"{w}-{k}:{'cuda' if k == 'cuda12' else 'cpu'}" in asm for w, k in legs) and "unzip -q -n" in asm and "natives %s" in asm,
          "the package: each leg into engine\\cpu or engine\\cuda, never over the engine's files, named in BUILD.txt")
    chk = "\n".join(s.get("run", "") for s in y["jobs"]["check-windows"]["steps"])
    check("winx.native_exe" in chk and chk.count("activeCodePage") >= 1 and "ruach-muscriptor" in chk, "the package's check: UTF-8, DLLs, a start, the lab")
else:
    print("skip  the natives job (no yaml here)")
f = KIT / "build" / "muscriptor" / "CMakeLists.txt"
if f.is_file():
    t = f.read_text(encoding="utf-8")
    check('option(RUACH_MSC_NATIVE "' in t and '" ON)' in t and 'set(MUSCRIPTOR_NATIVE ${RUACH_MSC_NATIVE} CACHE BOOL "" FORCE)' in t,
          "ruach-muscriptor: native by default (build.sh), RUACH_MSC_NATIVE=OFF for the package")
    check("../tools/utf8.manifest" in t and (KIT / "build" / "tools" / "utf8.manifest").is_file(), "ruach-muscriptor: the engine's UTF-8 manifest on Windows")
else:
    print("skip  build/muscriptor (no build/ here)")

print(f"\n{ok} passed")
