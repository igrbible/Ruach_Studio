"""HERESY 2986: what the check of 2984 found (25.11.2026), held offline: nothing downloaded, no card touched, the lab imported, not started.
  · UniverSR on Windows: its packages pinned in the install (launcher/setup_win.py) as lab/requirements-lock.txt, its code read from
    vendor/UniverSR where no «pip install -e» put it (lab/upscale_job.py), and Engine → Models says «here» only with those packages
  · the twin's hf_guard ticker counts the parts this download makes or adds to, not another file's part kept in the shared folder
  · Stems before Engine → Models: refused at once in words, never audio-separator's own fetch at no pin
  · the stems, the upscale and a backing's split name the processor where torch reads on it, though a card is there
  · /reader/engines says an engine ready only with its model, its server and its licence here
  · the Refined transcriber's answer says its own file's precision (F16), not the base's F32
    .venv/bin/python lab/test_win_check_2986.py"""
import ast
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(KIT / "launcher"))
import fetch_models as fm      # noqa: E402
import fetch_heresy as twin    # noqa: E402
import paths                   # noqa: E402
import setup_win               # noqa: E402
import weights                 # noqa: E402

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail)[:600] + ")"), flush=True)


# ── 1 · UniverSR on Windows ──────────────────────────────────────────────────────────────────────────────────────────
lock = {ln.split("==")[0].strip().lower(): ln.strip() for ln in (HERE / "requirements-lock.txt").read_text(encoding="utf-8").splitlines()
        if "==" in ln and not ln.startswith("-e")}
check("the install's UniverSR packages are lab/requirements-lock.txt's pins", setup_win.UNIVERSR and
      all(lock.get(p.split("==")[0].lower()) == p for p in setup_win.UNIVERSR), setup_win.UNIVERSR)
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "lab").mkdir()
    (Path(d) / "lab" / "requirements.txt").write_text((HERE / "requirements.txt").read_text(encoding="utf-8"), encoding="utf-8")
    real_root, setup_win.ROOT = setup_win.ROOT, Path(d)
    try:
        for cpu in (False, True):
            got = setup_win.requirements(cpu).read_text(encoding="utf-8").splitlines()
            check(f"the install brings them ({'CPU' if cpu else 'CUDA'} wheels)", set(setup_win.UNIVERSR) <= set(got), got[-8:])
    finally:
        setup_win.ROOT = real_root
V = KIT / "vendor" / "UniverSR"
if (V / "universr" / "inference.py").is_file():
    third = set()
    for rel in ("inference.py", "flow/solver.py", "flow/path.py", "models/unet.py", "utils/spectral_ops.py"):   # paths: repo (the files of UniverSR itself)
        for n in ast.parse((V / "universr" / rel).read_text(encoding="utf-8")).body:
            names = [a.name for a in n.names] if isinstance(n, ast.Import) else [n.module or ""] if isinstance(n, ast.ImportFrom) and not n.level else []
            third |= {x.split(".")[0] for x in names} - set(sys.stdlib_module_names) - {"universr"}
    base = {"torch", "torchaudio", "numpy", "yaml", "huggingface_hub", "tqdm", "soundfile"}   # lab/requirements.txt and what it brings
    own = {p.split("==")[0] for p in setup_win.UNIVERSR}
    check("what UniverSR's inference imports beyond the lab's packages is what the install pins for it", third - base == own, sorted(third))
    src = (HERE / "upscale_job.py").read_text(encoding="utf-8")
    block = src[src.index("try:\n    from universr import UniverSR"):]
    block = block[:block.index("\n\n")]
    probe = ("import sys\nfrom pathlib import Path\nV = " + repr(str(V)) + "\n"
             "class Hide:                     # Windows: no «pip install -e» of it, so no finder for it before vendor/UniverSR is on the path\n"
             "    def find_spec(self, name, path=None, target=None):\n"
             "        if name == 'universr' and V not in sys.path:\n"
             "            raise ModuleNotFoundError(\"No module named 'universr'\")\n"
             "sys.meta_path.insert(0, Hide())\n"
             "__file__ = " + repr(str(HERE / "upscale_job.py")) + "\n" + block + "\n"
             "import universr\nprint(V in sys.path, Path(universr.__file__).resolve().is_relative_to(Path(V).resolve()))\n")
    r = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True, timeout=600, env=dict(os.environ, CUDA_VISIBLE_DEVICES=""))
    check("lab/upscale_job.py imports UniverSR from vendor/UniverSR where it is not installed", r.stdout.split() == ["True", "True"], r.stdout + r.stderr[-400:])
else:
    print("(no vendor/UniverSR here: its imports and the upscale's import not tried)")
check("lab/upscale_job.py says the device it ran on", '"device": DEVICE' in (HERE / "upscale_job.py").read_text(encoding="utf-8"))

args, _what = weights._args({"part": "upscale"})
_a, steps = twin.plan(args, KIT)
code = [s for s in twin.flat(steps) if s["op"] == "code"]
check("the upscale part's code step names the packages it needs", len(code) == 1 and code[0].get("py") == setup_win.UNIVERSR, code)
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    (k / "tmp").mkdir()
    (k / "vendor" / "UniverSR").mkdir(parents=True)
    (k / "vendor" / "UniverSR" / ".ruach-commit").write_text(twin.UNIVERSR[1] + "\n", encoding="utf-8")
    gone = dict(code[0], py=["no_such_module_2986==1.0"])
    out = io.StringIO()
    f = twin.Fetch(k, "check", False, out=out, wait=0)
    check("the code here, a package not: quietly not here (the part's state)", f.code(gone, quiet=True) == 1 and f.code(dict(gone, py=[]), quiet=True) == 0)
    f.code(gone)
    check("--check: «missing», the package named", out.getvalue().startswith("missing") and "no_such_module_2986==1.0 not in this Python" in out.getvalue(),
          out.getvalue())
    out = io.StringIO()
    f = twin.Fetch(k, "check", False, out=out, wait=0)
    f.code(dict(gone, py=[p for p in setup_win.UNIVERSR if importlib.util.find_spec(p.split("==")[0])]))
    check("--check: «here» with every package in this Python", out.getvalue().startswith("here"), out.getvalue())
    real_uv = setup_win.uv
    try:
        setup_win.uv = lambda: None
        out = io.StringIO()
        twin.Fetch(k, "fetch", False, out=out, wait=0).code(gone)
        check("a fetch with no uv: failed, in words", out.getvalue().startswith("failed") and "no uv" in out.getvalue(), out.getvalue())
        fake = k / "tmp" / "uv"
        fake.write_text("#!/bin/sh\necho 'it went in, said uv'\nexit 0\n", encoding="utf-8")
        fake.chmod(0o755)
        setup_win.uv = lambda: str(fake)
        out = io.StringIO()
        twin.Fetch(k, "fetch", False, out=out, wait=0).code(gone)
        check("a fetch whose package still does not import: failed, never «fetched»", out.getvalue().startswith("failed") and
              "did not come into this Python" in out.getvalue(), out.getvalue())
    finally:
        setup_win.uv = real_uv

# ── 2 · the ticker over hf_guard's shared folder ─────────────────────────────────────────────────────────────────────


def tick(folder, size, during):
    out, stop = io.StringIO(), threading.Event()
    t = threading.Thread(target=fm.ticker, args=(folder, size, stop, out, 0.02, 0.0))
    t.start()
    time.sleep(0.1)
    during()
    time.sleep(0.2)
    stop.set()
    t.join()
    return out.getvalue()


with tempfile.TemporaryDirectory() as d:
    part = Path(d) / ".ruach-part"
    rec = part / ".cache" / "huggingface" / "download"
    rec.mkdir(parents=True)
    old = rec / "c2f1.cut-short.incomplete"
    old.write_bytes(b"x" * 4_000_000)                    # another file's part, kept from a run cut short
    said = tick(part, 22_000, lambda: (rec / "9a0b.yaml.incomplete").write_bytes(b"y" * 10_000))
    check("another file's kept part is not counted, this download's is («4 MB of 22 KB (15946%)» before)",
          "4 MB" not in said and "10 KB of 22 KB (45%)" in said, said)

    def resume():
        with open(old, "ab") as h:
            h.write(b"z" * 1000)
    said = tick(part, 5_000_000, resume)
    check("a kept part this download goes on with counts whole", "4 MB of 5 MB (80%)" in said, said)
    check("nothing moves: nothing said", tick(part, 5_000_000, lambda: None) == "")

# ── 3 and 4 · the stems' models, and the processor named where torch reads on it ────────────────────────────────────
spec = importlib.util.spec_from_file_location("lab_under_test_2986", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
check("the words: plain, with where to get them and their size", lab.STEMS_MISSING ==
      f"The stems' models are not whole in this Studio yet: Engine → Models and LoRAs fetches them ({weights.PARTS['stems']})", lab.STEMS_MISSING)
ckpt = next(f for f in twin.ROFORMER if f["name"].endswith(".ckpt"))
check("ep317's whole size is the twin's", [(n, s) for _r, n, s in lab.EP317 if s] == [(ckpt["name"], ckpt["size"])], lab.EP317)
with tempfile.TemporaryDirectory() as d:
    ro, de = Path(d) / "roformer", Path(d) / "demucs"
    ro.mkdir()
    de.mkdir()
    was = {k: os.environ.get(k) for k in ("LAB_ROFORMER_DIR", "LAB_DEMUCS_DIR")}
    os.environ.update(LAB_ROFORMER_DIR=str(ro), LAB_DEMUCS_DIR=str(de))

    def refused(mode):
        try:
            lab.need_stems(mode)
            return None
        except RuntimeError as e:
            return str(e)

    def put(room, name, size):
        with open(room / name, "wb") as h:
            h.truncate(size)                               # sparse: the size without the bytes

    try:
        check("no models: refused in words", refused("vocals") == lab.STEMS_MISSING)
        put(ro, ckpt["name"], 20_971_520)
        put(ro, "model_bs_roformer_ep_317_sdr_12.9755.yaml", 2273)
        check("ep317 cut short (21 MB): refused", refused("vocals") == lab.STEMS_MISSING)
        put(ro, ckpt["name"], ckpt["size"])
        check("ep317 whole: the voice splits", refused("vocals") is None)
        check("four without htdemucs_ft: refused", refused("four") == lab.STEMS_MISSING)
        for _r, n, s in lab.HTDEMUCS:
            put(de, n, s or 149)
        check("four with htdemucs_ft whole: splits", refused("four") is None)
    finally:
        for k, v in was.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
src = (HERE / "lab.py").read_text(encoding="utf-8")
body = src[src.index("def stems_async("):src.index("def _backing_card(")]
check("the Refiner's stems: refused before their turn", body.index("need_stems(mode)") < body.index("with turn(job)"))
body = src[src.index("def _backing_split("):]
check("a backing's split: refused before its turn", body.index('need_stems("vocals")') < body.index("with turn(job)"))
check("the upscale's manifest: «processor» when the job says it ran there", 'r.get("device") == "cpu" else gpu' in src)
CONSOLE = KIT / "build" / "tools" / "console"
if (CONSOLE / "heresy-i18n-ru.js").is_file():
    key = json.dumps(lab.STEMS_MISSING, ensure_ascii=False) + ": "
    langs = sorted(p.name[12:-3] for p in CONSOLE.glob("heresy-i18n-*.js"))
    check(f"the words in every catalog of the page ({len(langs)})", langs and all(key in (CONSOLE / f"heresy-i18n-{x}.js").read_text(encoding="utf-8")
                                                                         for x in langs), langs)

asked = []


def answer(said, rc=0):
    def run(cmd, **kw):
        asked.append((cmd, kw.get("env", {}).get("PYTORCH_NVML_BASED_CUDA_CHECK")))
        return subprocess.CompletedProcess(cmd, rc, said, "")
    return run


def no_guard(*a, **kw):
    raise AssertionError("the guard was asked")


real_run, real_free = subprocess.run, lab.free_gpu
try:
    lab._TORCH_CARDS.clear()
    subprocess.run, lab.free_gpu = answer("False\n"), no_guard
    check("torch on the processor, a card there: the processor, no card named or held", lab.card_or_processor(11000) == (None, None))
    check("a backing's split too", lab._backing_card("a test") is None)
    check("torch asked once, by NVML's count", len(asked) == 1 and asked[0][1] == "1", asked)
    lab._TORCH_CARDS.clear()
    subprocess.run, lab.free_gpu = answer("True\n"), (lambda need, **kw: (1, 20000))
    check("torch on cards: the card the guard gives, as before", lab.card_or_processor(11000) == (1, 20000))
    lab._TORCH_CARDS.clear()
    subprocess.run = answer("", 1)
    check("torch not asked: the card as before, asked again next time", lab.card_or_processor(11000) == (1, 20000) and not lab._TORCH_CARDS)
finally:
    subprocess.run, lab.free_gpu = real_run, real_free

# ── 5 · a Narrator's engine is ready when it is ──────────────────────────────────────────────────────────────────────
import reader as rd  # noqa: E402
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    e = k / "user" / "reader" / "engines" / "t2986"
    e.mkdir(parents=True)
    (e / "engine.py").write_text("", encoding="utf-8")
    (e / "engine.json").write_text(json.dumps({"id": "t2986", "label": "T", "python": {"cpu": sys.executable},
                                               "needs": [{"id": "server", "any": ["build/t/server"], "say": "its server is not built yet"}]}), encoding="utf-8")
    was = rd.H.get("kit")
    rd.H["kit"] = str(k)
    try:
        got = next(x for x in rd.engines_public()["engines"] if x["id"] == "t2986")
        check("/reader/engines: its Python here, its server not: not ready, the missing said", got["ready"] == {"cpu": False} and
              [x["say"] for x in got["missing"]] == ["its server is not built yet"], {x: got[x] for x in ("ready", "missing")})
        (k / "build" / "t").mkdir(parents=True)
        (k / "build" / "t" / "server").write_text("", encoding="utf-8")
        got = next(x for x in rd.engines_public()["engines"] if x["id"] == "t2986")
        check("/reader/engines: its server built: ready", got["ready"] == {"cpu": True} and got["missing"] == [], got["ready"])
    finally:
        rd.H["kit"] = was

# ── 6 · the Refined transcriber's precision ──────────────────────────────────────────────────────────────────────────
cpp = KIT / "build" / "tools" / "yue-server.cpp"
if cpp.is_file():
    s = cpp.read_text(encoding="utf-8")
    check("the engine reads Refined's precision from its file at the start", "g_transcriber_refined_prec = prec;" in s and
          "gguf_precision(g_transcriber_refined_path)" in s)
    check("the answer says it for Refined", "refined ? g_transcriber_refined_prec : std::string(\"F32\")" in s)
f16 = paths.at(paths.MISC, KIT) / "SheetSage2-Refined-F16.gguf"
if f16.is_file():
    from collections import Counter
    from gguf import GGUFReader
    n = Counter(t.tensor_type.name for t in GGUFReader(str(f16)).tensors if t.tensor_type.name != "F32")
    check("Refined's file: F16 the most common type beside F32 (what the engine says)", n.most_common(1)[0][0] == "F16", n)

print(f"test_win_check_2986  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
