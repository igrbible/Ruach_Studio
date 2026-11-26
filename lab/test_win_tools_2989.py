"""HERESY 2989 (Viktor 25.11.2026: «В Windows сборку включи самый стабильный ffmpeg.exe, чтобы не иметь лишней зависимости. И другие тулзы так
же, если есть что-то, что мы пропустили ранее»; «По всем моделям и по не ASCII путям с пробелами всё зафикси в Windows порте»): offline, nothing
downloaded, Windows faked where it is asked. The programs the Windows package brings are pinned once (launcher/win_tools.py: a release build
each, its size and SHA-256), the builder and fetch-heresy.sh use those pins, an archive is unpacked into runtime/<name> under a path with a space
and Cyrillic with its licence and SOURCE.txt and nothing else, refused whole when it lacks a program, and «here» only from the pinned archive;
lab/winx puts runtime/<name> first on PATH once; Engine → Models has a part «programs» on Windows, which the twin checks, fetches and then finds
here; the rooms that need ffmpeg say so in words with where it comes from (the Debunker, the Remaster, the Bank Builder, the Trainer's set,
the upload guard), and a file's «never for training» tag is not read as absent without ffprobe; the Orchestra's FluidSynth comes from the
package on Windows and an SFZ says it does not play there; .venv-art and .venv-read are planned and made on Windows by uv, for the card or the
processor, at narrator-higgs-setup.sh's pins.
    .venv/bin/python lab/test_win_tools_2989.py"""
import contextlib
import hashlib
import importlib.util
import inspect
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
import zipfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
sys.path.insert(0, str(LAB))
import winx  # noqa: E402
import weights  # noqa: E402
import orchestra  # noqa: E402
import no_train  # noqa: E402
import upload_guard  # noqa: E402


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


twin = load("fetch_heresy", KIT / "launcher" / "fetch_heresy.py")
wt = twin.win_tools
vw = twin.venvs_win
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


def fake_zip(path, members):
    with zipfile.ZipFile(path, "w") as z:
        for n, b in members.items():
            z.writestr(n, b)
    return path


@contextlib.contextmanager
def no_programs():
    """PATH holds no ffmpeg, ffprobe nor fluidsynth for the block"""
    old = os.environ.get("PATH", "")
    with tempfile.TemporaryDirectory() as empty:
        os.environ["PATH"] = empty
        try:
            yield
        finally:
            os.environ["PATH"] = old


# ── the pins: release builds, each held to a size and a SHA-256 ───────────────────────────────────────────────────────────────
for n, p in wt.PINS.items():
    check(p["url"].startswith("https://github.com/") and "/releases/download/" in p["url"]
          and not re.search(r"latest|master|snapshot|nightly|autobuild|git-|-g[0-9a-f]{7}", p["url"], re.I),
          f"{n}: a tagged release's own file, not a snapshot nor a «latest» ({p['url']})")
    check(isinstance(p["size"], int) and p["size"] > 1_000_000 and re.fullmatch(r"[0-9a-f]{64}", p["sha256"]), f"{n}: its size and SHA-256 pinned")
    check(p["exes"] and all(x.endswith(".exe") for x in p["exes"]) and p["licence"] and p["source"], f"{n}: its programs, licence and source named")
check("ffmpeg-9.0.2-essentials_build.zip" in wt.PINS["ffmpeg"]["url"] and wt.PINS["ffmpeg"]["exes"] == ["ffmpeg.exe", "ffprobe.exe"]
      and "GPL-3.0" in wt.PINS["ffmpeg"]["licence"], "ffmpeg: FFmpeg 9.0.2, Gyan.dev's static release essentials, GPL-3.0 (x264, x265, rubberband in it)")
yml = next(p for p in (KIT / "heresy" / "root" / "github" / "workflows" / "windows.yml", KIT / ".github" / "workflows" / "windows.yml")
           if p.is_file()).read_text(encoding="utf-8")   # a release tree (the clean clone) has it as .github
check('python3 launcher/win_tools.py --into "$S" ffmpeg fluidsynth' in yml, "the builder unpacks both by launcher/win_tools.py's pins into the package")
check(all(k in yml for k in ('runtime\\ffmpeg\\ffmpeg.exe', '"rubberband"', '"loudnorm"', '"libx264"', '"libx265"', "0x041F", "winx.runtime_path")),
      "the unpacked package's check: ffmpeg's filters and encoders by name, a Cyrillic path with a space, the lab's PATH")
sh = (KIT / "heresy" / "fetch-heresy.sh").read_text(encoding="utf-8")
check(f'part programs "{wt.TITLE}"' in sh and "--verdicts " + " ".join(wt.PINS) in sh, "fetch-heresy.sh's part «programs»: the twin's title and every pin")

# ── an archive unpacked into runtime/<name>, under a path with a space and Cyrillic ────────────────────────────────────────────
with tempfile.TemporaryDirectory() as d:
    root = Path(d) / "Мои песни" / "Ruach Studio"
    (root / "engine" / "cpu").mkdir(parents=True)
    for x in ("vcruntime140.dll", "msvcp140.dll", "ggml.dll"):
        (root / "engine" / "cpu" / x).write_bytes(b"dll")
    top = "ffmpeg-9.0.2-essentials_build/"
    fz = fake_zip(Path(d) / "ff.zip", {top + "bin/ffmpeg.exe": b"FF", top + "bin/ffprobe.exe": b"FP", top + "bin/ffplay.exe": b"PL",
                                       top + "LICENSE": b"GPLv3", top + "README.txt": b"commit 946fcce07b", top + "doc/x/LICENSE": b"not this"})
    out = wt.unpack("ffmpeg", fz, root)
    names = sorted(f.name for f in out.iterdir())
    check(out == root / "runtime" / "ffmpeg" and names == [".ruach-pin", "LICENSE", "README.txt", "SOURCE.txt", "ffmpeg.exe", "ffprobe.exe"],
          f"ffmpeg: its two programs, its LICENSE and README, SOURCE.txt and the mark, no ffplay ({names})")
    check((out / "LICENSE").read_bytes() == b"GPLv3" and "ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz" in (out / "SOURCE.txt").read_text(encoding="utf-8"),
          "the build's own LICENSE (the shallowest), and where its source is")
    check(wt.here("ffmpeg", root), "here: its programs and the pinned archive's mark")
    (out / wt.MARK).write_text("0" * 64, encoding="utf-8")
    check(not wt.here("ffmpeg", root), "another archive's mark: not here")
    (out / wt.MARK).write_text(wt.PINS["ffmpeg"]["sha256"], encoding="utf-8")
    fs = fake_zip(Path(d) / "fs.zip", {"fluidsynth-v2.5.7/bin/fluidsynth.exe": b"FS", "fluidsynth-v2.5.7/bin/libfluidsynth-3.dll": b"L",
                                       "fluidsynth-v2.5.7/bin/SDL3.dll": b"S", "fluidsynth-v2.5.7/lib/fluidsynth.lib": b"lib",
                                       "fluidsynth-v2.5.7/lib/other.dll": b"o", "../evil.dll": b"e"})
    out = wt.unpack("fluidsynth", fs, root)
    names = sorted(f.name for f in out.iterdir())
    check(names == [".ruach-pin", "LGPL-2.1.txt", "SDL3.dll", "SOURCE.txt", "fluidsynth.exe", "libfluidsynth-3.dll", "msvcp140.dll", "vcruntime140.dll"],
          f"fluidsynth: its program and the DLLs beside it, the LGPL, the engine's MSVC runtime, nothing from elsewhere ({names})")
    check(not (root / "runtime" / "evil.dll").exists() and not (Path(d) / "evil.dll").exists(), "a name reaching out of its folder lands nowhere")
    bad = fake_zip(Path(d) / "bad.zip", {top + "bin/ffmpeg.exe": b"FF"})
    shutil.rmtree(root / "runtime" / "ffmpeg")
    try:
        wt.unpack("ffmpeg", bad, root)
        check(False, "an archive without ffprobe.exe is refused")
    except ValueError as e:
        check("ffprobe.exe" in str(e) and not (root / "runtime" / "ffmpeg").exists() and not (root / "runtime" / "ffmpeg.part").exists(),
              f"an archive without ffprobe.exe is refused whole: {e}")

    # bring(): through a fetcher (the twin's), the archive gone after; a fetch's words given back as they are
    got = []

    def copy_in(src):
        def fetch(url, dst, size, sha):
            got.append(url)
            Path(dst).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            return None
        return fetch
    check(wt.bring("ffmpeg", root, fetch=copy_in(fz)) is None and wt.here("ffmpeg", root) and got == [wt.PINS["ffmpeg"]["url"]]
          and not any((root / "tmp" / "runtime").glob("*.zip")), "bring: fetched by the pin's address, unpacked, the archive not kept")
    check(wt.bring("ffmpeg", root, fetch=lambda *a: "github.com did not give it") == "github.com did not give it", "bring: the fetch's words")
    nz = Path(d) / "nz.zip"
    nz.write_bytes(b"not a zip")
    check("could not be unpacked" in (wt.bring("ffmpeg", root, fetch=copy_in(nz)) or ""), "bring: a broken archive said, nothing replaced")

    # get(): the builder's downloader holds the file to its size and SHA-256 (a file:// address, no network)
    b = fz.read_bytes()
    dst = Path(d) / "dl" / "x.zip"
    check(wt.get(fz.as_uri(), dst, len(b), hashlib.sha256(b).hexdigest()) is None and dst.read_bytes() == b, "get: the file whole, at its SHA-256")
    why = wt.get(fz.as_uri(), Path(d) / "dl" / "y.zip", len(b), "0" * 64)
    check(why and "not the pinned" in why and not (Path(d) / "dl" / "y.zip").exists() and not (Path(d) / "dl" / "y.zip.incomplete").exists(),
          f"get: another file's SHA-256 refused and removed ({why})")
    check("pinned size" in (wt.get(fz.as_uri(), Path(d) / "dl" / "z.zip", len(b) + 5, "0" * 64, tries=1) or ""), "get: a short file is not taken")

    # the verdicts fetch-heresy.sh reads
    so = io.StringIO()
    with contextlib.redirect_stdout(so):
        rc = wt.main(["--studio", str(root), "--check", "--verdicts", "ffmpeg", "fluidsynth"])
    lines = so.getvalue().splitlines()
    check(rc == 0 and lines[0].startswith("here\truntime/ffmpeg\t(FFmpeg 9.0.2") and lines[1].startswith("here\truntime/fluidsynth\t"),
          f"--verdicts: a line each, verdict, what and words tab-separated ({lines})")
    with contextlib.redirect_stderr(io.StringIO()):
        check(wt.main(["--into"]) == 2 and wt.main(["--studio", str(root), "--verdicts", "sox"]) == 2, "--verdicts: arguments it does not take")

    # ── lab/winx: runtime/<name> first on PATH, once; nothing elsewhere ──────────────────────────────────────────────────────
    (root / "runtime" / "notes").mkdir()
    (root / "runtime" / "notes" / "a.txt").write_text("x", encoding="utf-8")
    (root / "runtime" / "ffmpeg.part").mkdir()
    (root / "runtime" / "ffmpeg.part" / "ffmpeg.exe").write_bytes(b"")
    dirs = winx.runtime_dirs(root, nt=True)
    check([Path(x).name for x in dirs] == ["ffmpeg", "fluidsynth"], f"the folders with a program, by name, no half-made one ({dirs})")
    env = {"Path": "C:\\Windows\\system32;" + dirs[0].upper() + "\\;C:\\Old\\ffmpeg\\bin"}
    put = winx.runtime_path(root, env, nt=True)
    check(put == dirs and env["Path"] == ";".join(dirs) + ";C:\\Windows\\system32;C:\\Old\\ffmpeg\\bin" and set(env) == {"Path"},
          f"first on Windows' own «Path», an older mention taken out ({env['Path'][:80]}…)")
    check(winx.runtime_path(root, env, nt=True) == [] and env["Path"].startswith(dirs[0] + ";"), "a second time changes nothing")
    env = {"PATH": "/usr/bin"}
    check(winx.runtime_dirs(root, nt=False) == [] and winx.runtime_path(root, env, nt=False) == [] and env == {"PATH": "/usr/bin"},
          "Linux and macOS: nothing put on PATH")
    check(winx.runtime_path(Path(d) / "none", {"PATH": "x"}, nt=True) == [], "no runtime folder: nothing changes")

    # ── Engine → Models: the part «programs» on Windows ───────────────────────────────────────────────────────────────────────
    check(weights.parts_of(KIT, nt=True).get("programs") == weights.PROGRAMS_SIZE and "programs" not in weights.parts_of(KIT, nt=False),
          "the Models card lists the programs' part on Windows alone")
    check(weights._args({"part": "programs"}) == (["--only", "programs"], weights.NAMES["programs"]) and weights._bytes(weights.PROGRAMS_SIZE),
          "a fetch of the part: --only programs, its size read for the progress")
    real_win = twin.ON_WIN
    twin.ON_WIN = True
    try:
        a, steps = twin.plan(["--only", "programs"], KIT)
        check([s["op"] for s in steps] == ["part", "runtime", "runtime"] and steps[0]["title"] == wt.TITLE
              and [s["name"] for s in steps[1:]] == list(wt.PINS), "Windows: --only programs is the part and a step each")
        a, steps = twin.plan(["--check"], KIT)
        check(steps[0]["op"] == "part" and steps[0]["id"] == "programs", "Windows: a whole check starts with the programs")
        a, steps = twin.plan(["--only", "none", "--higgs", "bf16", "--yes"], KIT)
        check(any(s["op"] == "tool" and s.get("make") == "read" and s["what"] == ".venv-read" for s in twin.flat(steps)),
              "Windows: Higgs's fetch makes .venv-read")
        a, steps = twin.plan(["--only", "none", "--qwen", "2512-q4", "--yes"], KIT)
        check(any(s["op"] == "tool" and s.get("make") == "art" for s in twin.flat(steps)), "Windows: a painter's fetch makes .venv-art")
    finally:
        twin.ON_WIN = real_win
    twin.ON_WIN = False
    try:
        a, steps = twin.plan(["--only", "programs"], KIT)
        check(steps == [], "Linux: no programs part (the system's ffmpeg)")
        a, steps = twin.plan(["--only", "none", "--qwen", "2512-q4", "--yes"], KIT)
        check(all("make" not in s for s in twin.flat(steps) if s["op"] == "tool"), "Linux: the art environment's line as before")
    finally:
        twin.ON_WIN = real_win

    # the twin's run: missing, fetched (its downloader stubbed with the fake archives at their own pins), then here
    k = Path(d) / "Другая папка" / "Studio"
    (k / "tmp").mkdir(parents=True)
    saved = {n: dict(p) for n, p in wt.PINS.items()}
    try:
        for n, z in (("ffmpeg", fz), ("fluidsynth", fs)):
            wt.PINS[n].update(size=z.stat().st_size, sha256=hashlib.sha256(z.read_bytes()).hexdigest())
        src = {wt.PINS["ffmpeg"]["url"]: fz, wt.PINS["fluidsynth"]["url"]: fs}

        class Stub(twin.Fetch):
            def url_get(self, url, dst, size=None, sha=None):
                Path(dst).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src[url], dst)
                return None if hashlib.sha256(Path(dst).read_bytes()).hexdigest() == sha else "sha"
        steps = [twin.head("part", "programs", wt.TITLE)] + [{"op": "runtime", "name": n} for n in wt.PINS]
        said = []
        for mode in ("check", "fetch", "check"):
            o = io.StringIO()
            f = Stub(k, mode, False, out=o)
            f.steps(steps)
            said.append([ln.split()[0] for ln in o.getvalue().splitlines() if weights.LINE.match(ln)])
        check(said == [["missing", "missing"], ["fetched", "fetched"], ["here", "here"]], f"the twin: missing, fetched, then here ({said})")
        check((k / "runtime" / "ffmpeg" / "ffprobe.exe").is_file() and (k / "runtime" / "fluidsynth" / "fluidsynth.exe").is_file(),
              "the twin put both under a path with a space and Cyrillic")
    finally:
        for n, p in saved.items():
            wt.PINS[n].clear()
            wt.PINS[n].update(p)

# ── the rooms that need ffmpeg say so in words, with where it comes from ────────────────────────────────────────────────────────
w_nt, w_lx = winx.no_program("ffmpeg", nt=True), winx.no_program("ffprobe", nt=False)
check("Engine → Models" in w_nt and "Windows programs" in w_nt and "runtime" in w_nt, f"Windows: where it comes from ({w_nt})")
check("sudo apt install ffmpeg" in w_lx, f"Linux: the system's ({w_lx})")
try:
    winx.need("ffmpeg-not-here-2989")
    check(False, "need: a program not here raises")
except winx.ProgramMissing as e:
    check(isinstance(e, FileNotFoundError) and winx.said(e) == winx.no_program("ffmpeg-not-here-2989") and "[Errno" not in winx.said(e),
          "need: ProgramMissing, a FileNotFoundError the lab answers 404 with its words alone")
with no_programs():
    import debunker
    so = io.StringIO()
    with contextlib.redirect_stdout(so):
        r = debunker.run_ffmpeg(["-i", "x.wav", "y.wav"], "a test")
    check(r is False and winx.no_program("ffmpeg") in so.getvalue(), "the Debunker's run_ffmpeg: no ffmpeg said in words, no traceback")
    import bankbuilder
    try:
        bankbuilder.start(KIT, {"step": "clean", "bank": "test-2989"}, lambda mb: 0)
        check(False, "the Bank Builder refuses without ffmpeg")
    except winx.ProgramMissing as e:
        check("ffmpeg" in str(e), f"the Bank Builder: {e}")
    with tempfile.TemporaryDirectory() as d:
        wav = io.BytesIO()
        with wave.open(wav, "wb") as wv:
            wv.setnchannels(1)
            wv.setsampwidth(2)
            wv.setframerate(48000)
            wv.writeframes(b"\0\0" * 4800)
        was = upload_guard.FFMPEG
        upload_guard.FFMPEG = "ffmpeg"
        try:
            upload_guard.check(wav.getvalue())
            check(False, "the upload guard refuses what it cannot check")
        except upload_guard.Refused as e:
            check(winx.no_program("ffmpeg") in str(e) and "cannot be checked" in str(e), f"the upload guard: {str(e)[:90]}…")
        finally:
            upload_guard.FFMPEG = was
        a = Path(d) / "a.wav"
        a.write_bytes(wav.getvalue())
        why = no_train.of_file(a)
        check(why and "cannot be read" in why and no_train._tag(a) == "", f"never for training: not «unmarked» without ffprobe ({why})")
        take, outdir = Path(d) / "take", Path(d) / "out"
        take.mkdir()
        (Path(d) / "cfg.json").write_text("{}", encoding="utf-8")
        r = subprocess.run([sys.executable, str(LAB / "remaster_job.py"), str(take), str(outdir), str(Path(d) / "cfg.json")],
                           capture_output=True, text=True, env=dict(os.environ))
        check(r.returncode == 1 and r.stderr.strip().splitlines()[-1] == "the Remaster stopped: " + winx.no_program("ffmpeg"),
              f"the Remaster stops at its start in words ({(r.stderr.strip().splitlines() or [''])[-1][:80]}…)")
import training  # noqa: E402
check('winx.need("ffmpeg")' in inspect.getsource(training), "the Trainer's set: ffmpeg asked for before its tracks are made")

# ── the Orchestra on Windows: FluidSynth from the package, an SFZ said not to play ────────────────────────────────────────────
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    check(orchestra.fluidsynth(k, nt=True) == k / "runtime" / "fluidsynth" / "fluidsynth.exe" and orchestra.sfizz(k, nt=True).name == "sfizz_render.exe",
          "Windows: the renderers' paths in runtime\\")
    check("Windows programs" in orchestra.renderers_missing(k, nt=True), "Windows without FluidSynth: where it comes from")
    (k / "runtime" / "fluidsynth").mkdir(parents=True)
    (k / "runtime" / "fluidsynth" / "fluidsynth.exe").write_bytes(b"")
    check(orchestra.renderers_missing(k, nt=True) is None and "SF2" in orchestra.SFZ_NOT_HERE, "Windows with FluidSynth: a version renders; an SFZ says why not")
    check(orchestra.renderers_missing(k, nt=False) == "the renderers are not built: heresy/MISC/claude-tc/midi/build-renderers.sh builds them",
          "Linux: both renderers built, as before")

# ── .venv-art and .venv-read on Windows: planned and made by uv, for the card or the processor ─────────────────────────────────
hig = (KIT / "tools" / "narrator-higgs-setup.sh").read_text(encoding="utf-8")
check(f"TORCH={vw.TORCH};" in hig and f"TRANSFORMERS={vw.TRANSFORMERS} " in hig, f"Higgs's pins as narrator-higgs-setup.sh's: torch {vw.TORCH}, transformers {vw.TRANSFORMERS}")
check(vw.device([8.6]) == "cuda" and vw.device([6.1, 7.0]) == "cpu" and vw.device([]) == "cpu", "the card's PyTorch from compute 7.5 (2686), else the processor's")
cpu, cuda = vw.art_requirements(KIT, "cpu"), vw.art_requirements(KIT, "cuda")
check(not any("+cu" in x for x in cpu) and f"--extra-index-url {vw.CPU_INDEX}" in cpu and any("+cu128" in x for x in cuda)
      and any(x.startswith("diffusers") for x in cpu), "the art requirements: CPU index and plain pins for the processor, cu128 for the card")
with tempfile.TemporaryDirectory() as d:
    root = Path(d) / "Мої пісні" / "Ruach Studio"
    p = vw.plan("art", root, "cuda", "uv.exe", nt=True)
    check(p[0] == ["uv.exe", "venv", "--python", "3.12", "--seed", str(root / ".venv-art")]
          and p[1][:5] == ["uv.exe", "pip", "install", "--python", str(root / ".venv-art" / "Scripts" / "python.exe")]
          and p[1][-1] == str(root / "tmp" / "requirements-art-cuda.txt") and p[-1][:2] == [str(root / ".venv-art" / "Scripts" / "python.exe"), "-c"],
          "art: the venv by uv with Python 3.12, its requirements, its imports")
    p = vw.plan("read", root, "cpu", "uv.exe", nt=True)
    check(p[1][-3:] == [f"torchaudio=={vw.TORCH}", "--index-url", vw.CPU_INDEX] and f"transformers=={vw.TRANSFORMERS}" in p[2],
          "read: torch for the processor, then transformers 5")
    check(vw.plan("read", root, "cuda", "uv", nt=True)[1][-1] == vw.CUDA_INDEX, "read: torch for the card (CUDA 12.8)")
    ran = []

    def run(c, **kw):
        ran.append(c)
        if c[1:2] == ["venv"]:
            (Path(c[-1]) / "Scripts").mkdir(parents=True)
            (Path(c[-1]) / "Scripts" / "python.exe").write_bytes(b"")
        return subprocess.CompletedProcess(c, 0, "", "")
    lines = []
    check(vw.make("read", root, "cpu", out=lines.append, run=run, uv="uv.exe", nt=True) is None and vw.here("read", root, nt=True)
          and len(ran) == 4 and (root / ".venv-read" / vw.MADE).read_text(encoding="utf-8").strip() == "cpu",
          "read: made, its mark says for what")
    check(vw.make("read", root, "cpu", run=lambda c, **kw: check(False, "nothing runs again"), uv="uv.exe", nt=True) is None, "read: a second time runs nothing")

    def fail(c, **kw):
        return subprocess.CompletedProcess(c, 1 if c[1:2] == ["pip"] else 0, "", "error: no wheel for torch==2.11.0\n")
    (root / ".venv-art" / "Scripts").mkdir(parents=True)
    (root / ".venv-art" / "Scripts" / "python.exe").write_bytes(b"")
    why = vw.make("art", root, "cuda", out=lines.append, run=fail, uv="uv.exe", nt=True)
    check(why and "requirements-art.txt" in why and not vw.here("art", root, nt=True), f"art: no requirements here, said ({why})")
    (root / "lab").mkdir()
    shutil.copyfile(LAB / "requirements-art.txt", root / "lab" / "requirements-art.txt")
    why = vw.make("art", root, "cuda", out=lines.append, run=fail, uv="uv.exe", nt=True)
    check(why and "no wheel for torch" in why and not vw.here("art", root, nt=True) and (root / "tmp" / "requirements-art-cuda.txt").is_file(),
          f"art: a failed install said with uv's last words, not here ({why})")
    check(vw.make("art", root, "cuda", uv="", nt=True).startswith("no uv here"), "no uv: said")

    # the twin's environment step: missing in a check, made by a fetch, then here
    saved, real_nt = vw.make, vw.NT
    try:
        vw.make = lambda n, r, out=None: (r / ".venv-art" / vw.MADE).write_text("cuda\n", encoding="utf-8") and None
        vw.NT = True
        s = twin.tool(".venv-art", [".venv-art/Scripts/python.exe"], None, "(the painters' environment)", make="art")
        said = []
        for mode in ("check", "fetch", "check"):
            o = io.StringIO()
            twin.Fetch(root, mode, False, out=o).steps([s])
            said.append(o.getvalue().split()[:1])
        check(said == [["missing"], ["fetched"], []], f"the twin: .venv-art missing, made, then here (nothing said, as bash) ({said})")
    finally:
        vw.make = saved
        vw.NT = real_nt

print(f"\n{ok} passed")
