"""HERESY 2983 (a tester's Windows, 24.11.2026: «Стемы … скачано 0, не удалось 2»; Viktor 25.11.2026: «проверить загрузку и работу абсолютно всех
моделей»): Engine -> Models on a machine with no bash runs launcher/fetch_heresy.py, fetch-heresy.sh's twin in Python. Here, offline, nothing
downloaded from the network: every part, every extra's every variant and every tier item has a Windows plan that needs no bash, no git and no
audio-separator; every file the Models card counts as here is one the plan brings; the plan names the repos and paths fetch-heresy.sh names (bar the
ones it does differently on purpose); a run of the twin with its checker and downloader stubbed says what bash says (the lines, the sum, the list the
card reads); a file from its authors' address is resumed, held to its SHA-256 and refused in plain words; a path Windows would not open is refused
before a byte comes; tools/hf_guard.py reaches past 260 characters; and the lab runs the twin where it finds no bash.
    .venv/bin/python lab/test_win_fetch_2983.py"""
import fnmatch
import hashlib
import http.server
import importlib.util
import io
import os
import re
import shutil
import sys
import tempfile
import threading
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
sys.path.insert(0, str(LAB))
import paths  # noqa: E402
import weights  # noqa: E402


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


twin = load("fetch_heresy", KIT / "launcher" / "fetch_heresy.py")
guard = load("hf_guard_2983", KIT / "tools" / "hf_guard.py")

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


# ── every part, extra and tier: a plan, as Windows makes it ────────────────────────────────────────────────────────
bodies = [{"part": "missing"}] + [{"part": p} for p in list(weights.PARTS) + ["fw"]]
for e in weights.EXTRAS:
    name = e["name"] if e else "artwork"
    bodies += [{name: v["id"]} for v in (e or weights.ARTWORK_BIG)["variants"]]
# (a tier is its items, each an extra's variant: _fetch_tier runs _args({extra: variant}) for each, so every variant below covers every tier)
FETCHES = {"into", "at", "repo", "direct", "code", "loras_kit", "loras_own", "fwpart", "runtime"}   # HERESY 2989: runtime, Windows' programs
KNOWN = FETCHES | {"part", "asked", "gate", "tool", "note", "fail", "seplist", "snap", "ffmpeg"}
real_win = twin.ON_WIN
twin.ON_WIN = True
plans = {}
for b in bodies:
    args, what = weights._args(b)
    try:
        a, steps = twin.plan(args, KIT)
    except twin.Usage as e:
        check(False, f"{b}: the twin takes fetch-heresy.sh's arguments {args} ({e})")
    plans[str(b)] = steps
    ops = [s["op"] for s in twin.flat(steps)]
    check(ops and set(ops) <= KNOWN and FETCHES & set(ops), f"{b} → {' '.join(args) or '(all)'}: a Windows plan of {len(ops)} steps, something fetched")
    for s in twin.flat(steps):
        if s["op"] == "code":
            check(s["commit"], f"{b}: code comes at a pinned commit from GitHub's archive on Windows (no git): {s['what']}")
        if s["op"] == "into":
            strip, folder = twin.place(s["inc"])                  # raises when an include lands nowhere or elsewhere
            check(folder == paths.MODELS or folder.startswith(paths.MODELS + "/"), f"{b}: {s['inc'][0]} lands in {folder}")
        if s["op"] in ("into", "at", "repo"):
            check(twin.pin(s["repo"], KIT) != "main" and (s.get("pin_as") is None or re.fullmatch(r"[0-9a-f]{40}", s["pin_as"])),
                  f"{b}: {s['repo']} is pinned")
        if s["op"] == "direct":
            check(all(f["size"] and re.fullmatch(r"[0-9a-f]{64}", f["sha"]) and f["urls"] for f in s["files"]),
                  f"{b}: {s['what']} held to a size and a SHA-256")
check(len(plans) == len(bodies) and len(bodies) > 80, f"{len(bodies)} bodies planned: the parts, every extra's every variant")
for bad in (["--irae", "IRAE-Q5_K_M"], ["--fw", "9.9x1-Q8_0"], ["--qwen", "sdxl"], ["--nonsense"]):
    try:
        twin.plan(bad, KIT)
        check(False, f"{bad} refused")
    except twin.Usage as e:
        check(str(e), f"{bad} refused with its words: {str(e)[:60]}")


def made_by(steps):
    """the globs of where a plan's files land"""
    out = []
    for s in twin.flat(steps):
        if s["op"] == "into":
            strip, folder = twin.place(s["inc"])
            out += [folder + "/" + i[len(strip):] for i in s["inc"]]
        elif s["op"] == "at":
            out += [s["dir"] + "/" + i for i in s["inc"]]
        elif s["op"] == "repo":
            out += [s["dir"] + "/" + i for i in s["inc"]] + [s["dir"] + "/*/" + i for i in s["inc"]]
        elif s["op"] == "direct":
            out += [s["dir"] + "/" + f["name"] for f in s["files"]]
    return out


for e in weights.EXTRAS:
    e = e or weights.ARTWORK_BIG
    for v in e["variants"]:
        globs = made_by(plans[str({e["name"]: v["id"]})])
        for f in v["files"]:
            rel = f["path"] if isinstance(f, dict) else f
            check(any(fnmatch.fnmatch(rel, g) for g in globs), f"{e['name']} {v['id']}: the card's {rel} is a file the plan brings")

stems = plans[str({"part": "stems"})]
sj = (LAB / "stems_job.py").read_text(encoding="utf-8")
g = made_by(stems)
check(f"{paths.REFINER_SEPARATION}/roformer/model_bs_roformer_ep_317_sdr_12.9755.ckpt" in g and f"{paths.REFINER_SEPARATION}/roformer/model_bs_roformer_ep_317_sdr_12.9755.yaml" in g,
      "stems: BS-Roformer ep317 and its config where stems_job.py reads them")
check(any(fnmatch.fnmatch(f"{paths.REFINER_SEPARATION}/demucs/{n}", x) for x in g for n in ("htdemucs_ft.yaml", "f7e0c4bc-ba3fe64a.th")),
      "stems: htdemucs_ft where stems_job.py reads it, from our models repo at its pin")
check('ROFORMER = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"' in sj and 'DEMUCS = "htdemucs_ft.yaml"' in sj, "(stems_job.py loads those two)")
check(not any("audio-separator" in str(s.get("op")) for s in twin.flat(stems)), "stems: no audio-separator, which will not start without ffmpeg")
# HERESY 2994: the Amp (NAM)'s captures, from v2 under nam/ at their own pin, into the set folder nam_amp.py lists
nam_steps = [s for s in twin.flat(plans[str({"part": "nam"})]) if s["op"] == "into"]
check(len(nam_steps) == 1 and nam_steps[0]["inc"] == ["nam/*"] and twin.place(nam_steps[0]["inc"]) == ("nam/", paths.REFINER_NAM) and
      nam_steps[0]["pin_as"] == twin._pin_line(KIT / "heresy" / "hf-revisions.txt", "goldhub/Ruach_Studio_Models_v2#nam") and
      paths.REFINER_NAM == __import__("nam_amp").STUDIO, f"nam: nam/* into {paths.REFINER_NAM}, where nam_amp.py lists the Studio's set, at its own pin ({nam_steps})")

# ── against fetch-heresy.sh: the same repos and paths (bar what the twin does otherwise on purpose) ──────────────────
sh = (KIT / "heresy" / "fetch-heresy.sh").read_text(encoding="utf-8")
code = "\n".join(ln.split(" # ")[0] for ln in sh.splitlines() if not ln.lstrip().startswith("#"))
allp = [s for st in plans.values() for s in twin.flat(st)]
repos = {s["repo"] for s in allp if s["op"] in ("into", "at", "repo")}
WORDS_ONLY = {"Comfy-Org/YuE2"}   # named in the trainer's words; its file comes from our models repo
named = set(re.findall(r"\b((?:goldhub|bosonai|multimodalart|DamRsn|Comfy-Org|FastVideo|MiniMaxAI|numz|Qwen)/[A-Za-z0-9_.-]+)", code)) - WORDS_ONLY
check(named <= repos, f"every repo fetch-heresy.sh fetches from, the twin does too ({len(named)}): {sorted(named - repos)}")
incs = {i for s in allp if s["op"] in ("into", "at", "repo") for i in s["inc"]}
lits = set(re.findall(r'"((?:models|artwork|checkpoints|whisper|universr|VAE-RS|separation|nam)/[^"$]*)"', code))   # HERESY 2994: nam/, the Amp's captures
ON_PURPOSE = {"models/SheetSage2-Q8_0.gguf", "models/MERT-v2-FullSong-Q8_0.gguf"}   # paths: repo (the twin's transcriber is the install's F32 pair: 2952, 2981)
gap = sorted(x for x in lits - ON_PURPOSE if x not in incs and not any(i.startswith(x + "/") for i in incs))   # a folder named: its files are
check(not gap, f"every path fetch-heresy.sh names, the twin names ({len(lits)}): {gap}")
for opt in re.findall(r"^\s+--([a-z0-9-]+)\)", sh, re.M):
    if opt in ("check", "replace", "yes", "only", "artwork", "artwork-q8"):
        continue
    check(f'"--{opt}"' in (KIT / "launcher" / "fetch_heresy.py").read_text(encoding="utf-8"), f"the twin takes --{opt} as fetch-heresy.sh does")
twin.ON_WIN = False
lin = twin.plan(["--only", "none", "--writer", "quality", "--yes"], KIT)[1]
check(any(s["op"] == "code" and not s["commit"] for s in lin), "(elsewhere than Windows the twin would clone llama.cpp as bash does)")
twin.ON_WIN = real_win


# ── a run, its checker and downloader stubbed: bash's words, sum and list ─────────────────────────────────────────
class Stub(twin.Fetch):
    def __init__(self, *a, have=(), **k):
        super().__init__(*a, wait=0, **k)
        self.have, self.guarded_args = set(have), []

    def expect(self, repo, rev, d, args):
        inc = args[args.index("--include") + 1:] if "--include" in args else args[args.index("--files") + 1:]
        strip = args[args.index("--strip") + 1] if "--strip" in args else ""
        want = [Path(d) / (i[len(strip):] if strip and i.startswith(strip) else i) for i in inc if "*" not in i]
        if all(w.is_file() for w in want) and want:
            return 0, "complete"
        miss = [i[len(strip):] if strip and i.startswith(strip) else i for i in inc]
        return 1, f"incomplete {repo} @ {rev[:12]}: {len(miss)} problem(s) in {len(miss)} expected file(s)\n" + "".join(f"  {m}: missing\n" for m in miss)

    def guard(self, args):
        self.guarded_args.append(args)
        top = Path(args[args.index("--local-dir") + 1])
        for i in args[args.index("--include") + 1:]:
            (top / i).parent.mkdir(parents=True, exist_ok=True)
            (top / i).write_bytes(b"x")
        self.log.write_text("", encoding="utf-8")
        return 0

    def hf_program(self):
        return "hf"

    def landing(self, *a, **k):
        return []


with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    for rel in ("heresy/hf-revisions.txt", "tools/hf-revisions.txt", "tools/download-loras.sh"):
        (k / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(KIT / rel, k / rel)
    (k / "heresy" / "fetch-ruach-loras.py").write_text("print('here      loras/voice-x (pinned)')\nprint('#counts here=1 fetched=0 missing=0 failed=0 differs=0')\n",
                                                      encoding="utf-8")
    out = io.StringIO()
    a, steps = twin.plan(["--check"], k)
    f = Stub(k, "check", False, listing=True, out=out)
    f.steps(steps)
    rc = f.finish()
    text = out.getvalue()
    lines = text.splitlines()
    check(rc == 0 and weights.SUM.match(lines[-1]), f"--check: bash's sum line ({lines[-1]})")
    verdicts = [ln for ln in lines if weights.LINE.match(ln)]
    check(len(verdicts) >= 8 and all(re.match(r"^(here|differs|missing|fetched|unknown|failed)\s{1,6}\S", v) for v in verdicts), f"{len(verdicts)} verdict lines as bash prints them")
    check(any(v.startswith(f"missing   {paths.REFINER_SEPARATION}/roformer") for v in verdicts) and any(v.startswith("missing   vendor/UniverSR") for v in verdicts),
          "--check: the stems' ep317 and UniverSR's code said missing, nothing fetched")
    check(not f.guarded_args, "--check downloads nothing")
    last = weights._last_run(k)
    check(last and [p["part"] for p in last["parts"]] == ["extras", "transcriber", "whisper", "stems", "upscale", "nam", "fw", "loras"] and last["mode"] == "check",
          "the list the Models card reads: every part, in fetch-heresy.sh's order")
    check(last["counts"] and sum(last["counts"].values()) == sum(f.n.values()), "the list's sum is the run's")
    check(any(r["state"] == "here" and r["text"].startswith("loras/voice-x") for p in last["parts"] for r in p["rows"]), "fetch-ruach-loras.py's lines listed as bash lists them")

    # a fetch: what the check named comes into the download's own folder (paths.INCOMING) and is put in its room by lab/paths.py's map
    out = io.StringIO()
    a, steps = twin.plan(["--only", "extras"], k)
    f = Stub(k, "fetch", False, listing=False, out=out)
    f.steps(steps)
    f.finish()
    v1 = k / paths.ENGINE_VAE / "YuE2-VAE-RS-x3_v1-F32.gguf"
    check(v1.is_file() and (k / paths.ENGINE_VAE / "YuE2-VAE-RS-x3_v2-F32.gguf").is_file(), "fetch: our decoders landed in their room, settled from the download's own folder")
    check(not any(p.is_file() for p in (k / paths.INCOMING).rglob("*") if ".cache" not in p.parts), "fetch: nothing left in the download's own folder")
    check(f"fetched   {paths.ENGINE_VAE}/YuE2-VAE-RS-x3_v1-F32.gguf and _v2 (our decoders) (goldhub/YuE2-RS-Finetunes @ " in out.getvalue(),
          "fetch: «fetched» and the engine's folder, the line the lab asks the engine's restart after")
    check(f.guarded_args and f.guarded_args[0][:2] == ["--quiet", "goldhub/YuE2-RS-Finetunes"] and "--revision" in f.guarded_args[0] and
          re.fullmatch(r"[0-9a-f]{40}", f.guarded_args[0][f.guarded_args[0].index("--revision") + 1]), "fetch: through tools/hf_guard.py, at the pin")

    # a path Windows would not open: refused before the download, with what to do
    real_too = twin.too_long
    twin.too_long = lambda p, **kw: 300

    class Long(Stub):
        def landing(self, repo, rev, d, inc, strip=""):
            return [(Path(d) / "x.gguf", 1)]
    out = io.StringIO()
    f = Long(k, "fetch", False, listing=False, out=out)
    f.steps(twin.plan(["--only", "whisper"], k)[1])
    twin.too_long = real_too
    check(not f.guarded_args and f"failed    {paths.WHISPER}" in out.getvalue() and "past the 260" in out.getvalue() and "LongPathsEnabled" in out.getvalue(),
          "a path past 260 with long paths off: refused before a byte comes, with what to do")
check(twin.too_long("C:\\" + "a" * 300 + "\\f.bin", nt=True, on=False) == 309 and twin.too_long("C:\\" + "a" * 300, nt=True, on=True) is None
      and twin.too_long("C:\\RuachStudio\\models\\x.gguf", nt=True, on=False) is None and twin.too_long("/x" * 300, nt=False) is None,
      "too_long: Windows with long paths off alone, past 259 (a folder past 247)")
deep = "C:\\Users\\Тестер\\" + "d" * 240 + "/" + paths.INCOMING + "/.ruach-part/a/b.gguf"
lg = guard.L(deep, nt=True)
check(lg.startswith("\\\\?\\C:\\Users\\Тестер\\") and "/" not in lg and guard.L("C:\\short\\f", nt=True) == "C:\\short\\f"
      and guard.L("/srv/x/" + "y" * 300, nt=False) == "/srv/x/" + "y" * 300 and guard.L("C:\\a", nt=True, force=True) == "\\\\?\\C:\\a",
      "hf_guard.L: \\\\?\\ with backslashes past 247 characters on Windows (Cyrillic kept), the path itself elsewhere")
check(guard.L("\\\\srv\\share\\" + "z" * 260, nt=True).startswith("\\\\?\\UNC\\srv\\share\\"), "hf_guard.L: a network path as \\\\?\\UNC\\")
check(twin.lp(deep, nt=True).startswith("\\\\?\\C:\\") and twin.lp("/tmp/x", nt=False) == "/tmp/x", "the twin's own moves reach there too")

# ── a file from its authors' address: resumed, held to its SHA-256, refused in plain words ─────────────────────────
BODY = os.urandom(300_000)
seen = []


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        seen.append(self.headers.get("Range"))
        if self.path.startswith("/gone"):
            self.send_response(404)
            self.end_headers()
            return
        start = int(re.match(r"bytes=(\d+)-", self.headers.get("Range") or "bytes=0-").group(1))
        self.send_response(206 if start else 200)
        self.send_header("Content-Length", str(len(BODY) - start))
        self.end_headers()
        self.wfile.write(BODY[start:])


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}"
sha = hashlib.sha256(BODY).hexdigest()
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    step = {"op": "direct", "what": paths.REFINER_SEPARATION + "/roformer", "dir": paths.REFINER_SEPARATION + "/roformer", "words": "(test)",
            "list": ("download_checks.json", url + "/gone"), "files": [{"name": "m.ckpt", "size": len(BODY), "sha": sha, "urls": [url + "/gone", url + "/m.ckpt"]}]}
    part = k / step["dir"] / ".ruach-part"
    part.mkdir(parents=True)
    (part / "m.ckpt.incomplete").write_bytes(BODY[:100_000])
    out = io.StringIO()
    f = twin.Fetch(k, "fetch", False, out=out, wait=0)
    f.direct(step)
    got = k / step["dir"] / "m.ckpt"
    check(got.is_file() and got.read_bytes() == BODY and f"fetched   {paths.REFINER_SEPARATION}/roformer" in out.getvalue(),
          "direct: a gone address passed over, the next one given, the file whole and in place")
    check("bytes=100000-" in seen and not part.exists(), "direct: a cut-short part goes on from where it stopped, and its folder is gone after")
    check("download_checks.json for audio-separator did not come" in out.getvalue(), "direct: audio-separator's list that does not come is said, not a verdict")
    out = io.StringIO()
    f = twin.Fetch(k, "check", False, out=out, wait=0)
    f.direct(step)
    check(out.getvalue().startswith(f"here      {paths.REFINER_SEPARATION}/roformer"), "direct: here at its pinned size")
    got.write_bytes(BODY[:36_000])                                                 # audio-separator's cut-short file under the model's own name
    out = io.StringIO()
    twin.Fetch(k, "check", False, out=out, wait=0).direct(step)
    check(out.getvalue().startswith("missing") and "m.ckpt is 36000 bytes, the pinned 300000" in out.getvalue(),
          "direct: a cut-short file under the model's name is not «here» (bash's [ -s ] took it so)")
    step["files"][0]["sha"] = "0" * 64
    got.unlink()
    out = io.StringIO()
    f = twin.Fetch(k, "fetch", False, out=out, wait=0)
    f.direct(step)
    check(not got.exists() and f"failed    {paths.REFINER_SEPARATION}/roformer (test): m.ckpt: its SHA-256" in out.getvalue() and "nothing was put in its place" in out.getvalue(),
          "direct: another file's bytes refused in plain words, nothing put in place")
srv.shutdown()

# ── the lab: no bash → the twin, its words read as UTF-8 ───────────────────────────────────────────────────────────
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    (k / "launcher").mkdir()
    (k / "launcher" / "fetch_heresy.py").write_text(
        "import sys\nassert sys.argv[1:] == ['--only', 'whisper'], sys.argv\nsys.stdout.reconfigure(encoding='utf-8')\n"
        f"print('fetched   {paths.ENGINE_VAE}/x (Тест-Иванов)')\nprint('here 0 · unknown 0 · differs 0 · fetched 1 · missing 0 · failed 0')\n", encoding="utf-8")
    real_bash = weights._bash
    weights._bash = lambda: None
    try:
        weights.JOB.update(kind="fetch", lines=[], restart=False, counts=None)
        rc = weights._say(k, ["--only", "whisper"])
        check(rc == 0 and weights.JOB["counts"] == {"here": 0, "unknown": 0, "differs": 0, "fetched": 1, "missing": 0, "failed": 0},
              "no bash: the lab runs launcher/fetch_heresy.py and reads its sum")
        check(f"fetched   {paths.ENGINE_VAE}/x (Тест-Иванов)" in weights.JOB["lines"] and weights.JOB["restart"] is True,
              "no bash: its words read as UTF-8, the engine's restart asked after a decoder")
        (k / "launcher" / "fetch_heresy.py").unlink()
        weights.JOB.update(kind="fetch", lines=[], restart=False, counts=None)
        rc = weights._say(k, ["--only", "whisper"])
        check(rc == 1 and any("launcher/fetch_heresy.py" in x for x in weights.JOB["lines"]), "no bash and no twin: said, not a crash")
    finally:
        weights._bash = real_bash
check(weights._strip(KIT, str(KIT) + os.sep + paths.ENGINE_VAE + "/x") == paths.ENGINE_VAE + "/x", "the Studio's folder stripped from a line, either slash")
print(f"test_win_fetch_2983: {ok} passed")
