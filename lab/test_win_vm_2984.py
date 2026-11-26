"""HERESY 2984: what the Windows VM's run of every model (25.11.2026) found, held.
  · stems_job.py on a machine with no ffmpeg (a Windows install carries none): audio-separator is let start, soundfile writes its work files
    as WAV and the stems come as FLAC all the same; with ffmpeg on PATH the call is as it was (FLAC through pydub)
  · the ticker of a direct download counts that file's own part, not another file's part kept beside it («21 MB of 2 KB (922636%)»)
  · a direct download whose connection is cut while bytes come is taken up again at once, not given up after two tries (ep317 on a mobile link)
  · the Refiner's stems and upscale on a machine with no NVIDIA card run on the processor («no nvidia-smi here» was the end of them);
    busy cards are refused aloud as before; UniverSR loads on the processor where torch sees no card
Offline: audio-separator is a stub here, no model is loaded.
    .venv/bin/python lab/test_win_vm_2984.py"""
import ast, hashlib, http.server, io, json, os, re, subprocess, sys, tempfile, threading, time
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KIT / "launcher"))
import fetch_models as fm      # noqa: E402
import fetch_heresy as twin    # noqa: E402
sys.path.insert(0, str(KIT / "lab"))
import paths                   # noqa: E402

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


# ── stems_job.py with and without ffmpeg, audio-separator stubbed ────────────────────────────────────────────────
STUB = r'''
import json, os, shutil
from pathlib import Path
import numpy as np
import soundfile as sf
class Separator:
    def __init__(self, model_file_dir=None, output_dir=None, output_format="WAV", sample_rate=44100, log_level=20, use_soundfile=False, **more):
        self.kw = dict(output_format=output_format, use_soundfile=use_soundfile, sample_rate=sample_rate)
        self.out = Path(output_dir)
        self.check_ffmpeg_installed()                   # as the real one does, in its setup
    def check_ffmpeg_installed(self):
        if shutil.which("ffmpeg") is None:
            raise FileNotFoundError("ffmpeg")
    def load_model(self, model_filename=None):
        self.model = model_filename
    def separate(self, source):
        with open(os.environ["STUB_LOG"], "a", encoding="utf-8") as f:
            f.write(json.dumps(dict(self.kw, model=self.model)) + "\n")
        data, rate = sf.read(str(source), always_2d=True)
        ext = self.kw["output_format"].lower()
        words = ("Vocals", "Instrumental") if "roformer" in self.model else ("Drums", "Bass", "Other", "Vocals")
        names = []
        for w in words:
            n = f"{Path(source).stem}_({w})_{Path(self.model).stem}.{ext}"
            sf.write(str(self.out / n), data * 0.5, rate)
            names.append(n)
        return names
'''

with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    pkg = d / "stub" / "audio_separator" / "separator"
    pkg.mkdir(parents=True)
    (d / "stub" / "audio_separator" / "__init__.py").write_text("", encoding="utf-8")
    (pkg / "__init__.py").write_text(STUB, encoding="utf-8")
    import numpy as np
    import soundfile as sf
    take = d / "audio.wav"
    sf.write(str(take), np.zeros((48000, 2), dtype="float32"), 48000, subtype="FLOAT")    # the take's own sample format: FLOAT, which FLAC cannot hold
    nobin = d / "nobin"
    nobin.mkdir()
    withbin = d / "withbin"
    withbin.mkdir()
    (withbin / "ffmpeg").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    (withbin / "ffmpeg").chmod(0o755)
    (withbin / "ffmpeg.exe").write_text("", encoding="utf-8")

    def split(bindir, mode, tag):
        log = d / f"{tag}.log"
        env = dict(os.environ, PYTHONPATH=str(d / "stub"), PATH=str(bindir), STUB_LOG=str(log), PATHEXT=".EXE")
        out = d / f"out-{tag}"
        p = subprocess.run([sys.executable, str(KIT / "lab" / "stems_job.py"), str(take), str(out), mode], env=env,
                           capture_output=True, text=True, timeout=300)
        calls = [json.loads(x) for x in log.read_text(encoding="utf-8").splitlines()] if log.is_file() else []
        return p, out, calls

    p, out, calls = split(nobin, "four", "none")
    check(p.returncode == 0, "no ffmpeg: the split runs (it was refused: «FFmpeg is not installed»)" + ("" if p.returncode == 0 else " · " + p.stderr[-400:]))
    r = json.loads(p.stdout.strip().splitlines()[-1])
    check([s["name"] for s in r["stems"]] == ["vocals", "instrumental", "drums", "bass", "other"] and r["models"][1] == "htdemucs_ft.yaml",
          "no ffmpeg: the four stems, ep317 then htdemucs_ft")
    check(all((out / s["file"]).is_file() and sf.info(str(out / s["file"])).format == "FLAC" and sf.info(str(out / s["file"])).subtype == "PCM_24"
              for s in r["stems"]), "no ffmpeg: every stem a FLAC of 24 bits, as with ffmpeg")
    check(len(calls) == 2 and all(c["output_format"] == "WAV" and c["use_soundfile"] for c in calls),
          "no ffmpeg: audio-separator writes its work files through soundfile, as WAV (the take's FLOAT goes into it)")
    check(not (out / ".work").exists(), "no ffmpeg: the work folder gone after")

    p, out, calls = split(withbin, "vocals", "ffmpeg")
    check(p.returncode == 0 and len(calls) == 1 and calls[0]["output_format"] == "FLAC" and not calls[0]["use_soundfile"],
          "ffmpeg on PATH: the call as it was, FLAC through audio-separator's own writer" + ("" if p.returncode == 0 else " · " + p.stderr[-400:]))


# ── the ticker: one file's own part ──────────────────────────────────────────────────────────────────────────────
def tick(part, size):
    out, stop = io.StringIO(), threading.Event()
    t = threading.Thread(target=fm.ticker, args=(part, size, stop, out, 0.02, 0.0))
    t.start()
    time.sleep(0.2)
    stop.set()
    t.join()
    return out.getvalue()


with tempfile.TemporaryDirectory() as d:
    part = Path(d) / ".ruach-part"
    part.mkdir()
    with open(part / "model_bs_roformer_ep_317_sdr_12.9755.ckpt.incomplete", "wb") as f:
        f.truncate(20_971_520)                          # ep317 cut short, kept for the next run
    check(tick(part, 2273) == "", "(a folder: another file's part kept from a run cut short is not counted, HERESY 2986)")
    check(tick(part / "model_bs_roformer_ep_317_sdr_12.9755.yaml.incomplete", 2273) == "", "one file's part: nothing before its first byte, the other's part not counted")
    (part / "model_bs_roformer_ep_317_sdr_12.9755.yaml.incomplete").write_bytes(b"x" * 1000)
    said = tick(part / "model_bs_roformer_ep_317_sdr_12.9755.yaml.incomplete", 2273)
    check("1000 B of 2273 B (43%)" in said or "1 KB of 2 KB (43%)" in said, "one file's part: its own bytes of its own size · " + said.strip().splitlines()[0])

seen = []
real = fm.ticker
fm.ticker = lambda part, size, stop, out=None, *a: seen.append((Path(part), size))
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    step = {"op": "direct", "what": "x", "dir": paths.REFINER_SEPARATION + "/roformer", "words": "(test)", "list": ("download_checks.json", "http://127.0.0.1:9/none"),
            "files": [{"name": "m.ckpt", "size": 10, "sha": "0" * 64, "urls": ["http://127.0.0.1:9/m.ckpt"]}]}
    twin.Fetch(k, "fetch", False, out=io.StringIO(), wait=0).direct(step)
fm.ticker = real
check(seen and seen[0][0].name == "m.ckpt.incomplete" and seen[0][0].parent.name == ".ruach-part",
      "the twin's direct download ticks on its own file's part")


# ── a connection cut again and again while bytes come: taken up at once from where it stopped ─────────────────────
BODY = os.urandom(300_000)
CHUNK = 40_000
ranges = []


class Cut(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        start = int(re.match(r"bytes=(\d+)-", self.headers.get("Range") or "bytes=0-").group(1))
        ranges.append(start)
        self.send_response(206 if start else 200)
        self.send_header("Content-Length", str(len(BODY) - start))
        self.end_headers()
        self.wfile.write(BODY[start:start + CHUNK])     # then the line goes dead, as on the road
        self.close_connection = True


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Cut)
threading.Thread(target=srv.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    url = f"http://127.0.0.1:{srv.server_address[1]}"
    step = {"op": "direct", "what": paths.REFINER_SEPARATION + "/roformer", "dir": paths.REFINER_SEPARATION + "/roformer", "words": "(test)",
            "list": ("download_checks.json", url + "/list"), "files": [{"name": "m.ckpt", "size": len(BODY), "sha": hashlib.sha256(BODY).hexdigest(), "urls": [url + "/m.ckpt"]}]}
    out = io.StringIO()
    f = twin.Fetch(k, "fetch", False, out=out, wait=3600)    # a second try after half a minute would hang the test: none is needed
    t0 = time.time()
    f.direct(step)
    got = k / step["dir"] / "m.ckpt"
    check(got.is_file() and got.read_bytes() == BODY and "failed once" not in out.getvalue() and time.time() - t0 < 60,
          f"a line cut every {CHUNK // 1000} KB: the file whole in one run, no half-minute wait ({len([r for r in ranges if r < len(BODY)])} connections)")
    check(ranges[:8] == [i * CHUNK for i in range(8)], "each taken up from where the last stopped (Range)")
srv.shutdown()

# ── the Refiner on a machine with no NVIDIA card ─────────────────────────────────────────────────────────────────
import winx                    # noqa: E402
src = (KIT / "lab" / "lab.py").read_text(encoding="utf-8")
fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "card_or_processor")
ns = {"winx": winx, "torch_sees_cards": lambda: True}   # HERESY 2986: torch reads on cards here (test_win_check_2986.py holds the other case)
exec(compile(ast.Module([fn], []), "lab.py", "exec"), ns)


def free(e):
    def f(need):
        if isinstance(e, Exception):
            raise e
        return e
    return f


ns["free_gpu"] = free((2, 9000))
check(ns["card_or_processor"](8000) == (2, 9000), "a card the guard gives: that card, as before")
ns["free_gpu"] = free(RuntimeError(winx.NO_NVSMI))
check(ns["card_or_processor"](8000) == (None, None), "no NVIDIA card on the machine: the processor")
ns["free_gpu"] = free(RuntimeError("no card can take this now (it needs 8000 MB): …"))
try:
    ns["card_or_processor"](8000)
    check(False, "busy cards refused aloud")
except RuntimeError as e:
    check("no card can take this now" in str(e), "busy cards: refused aloud, as before (never quietly on the processor)")
for fname, need in (("stems_async", "8000"), ("upscale_async", "11000")):
    body = ast.get_source_segment(src, next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.FunctionDef) and n.name == fname))
    check(f"card_or_processor({need})" in body and "free_gpu(" not in body and 'CUDA_VISIBLE_DEVICES="" if gpu is None else str(gpu)' in body
          and '"gpu": "processor" if gpu is None' in body, f"{fname}: a card, or the processor with no card visible to it, said in its manifest")   # 2986: or where torch ran
up = (KIT / "lab" / "upscale_job.py").read_text(encoding="utf-8")
check('DEVICE = "cuda" if torch.cuda.is_available() else "cpu"' in up and 'device=DEVICE)' in up and 'device="cuda")' not in up,   # 2986: named DEVICE
      "upscale_job.py: UniverSR on the processor where torch sees no card")

print(f"{ok} passed")
