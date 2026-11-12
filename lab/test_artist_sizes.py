#!/usr/bin/env python3
"""HERESY 2278: the Artist's Advanced sizes (lab/artist.py, lab/artist_job.py), on a kit of its own in a temporary folder (never this Studio's),
no card and no painter: a size of one's own checked (multiples of 64, 256 at least, the model's ceiling, no second pass or canvas with it),
filed under the shape of its aspect, kept on the run's ask and drawn and kept as asked by the job; the card's need grows with its pixels
(the estimate the page shows, /artist/sizes); a run that runs out of the card's memory says so and offers a smaller size of the same aspect.
Under a second.
  .venv/bin/python lab/test_artist_sizes.py"""
import json
import shutil
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artist  # noqa: E402
import paths  # noqa: E402   HERESY 2330: where the weights live
import artist_job  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def drawn(body):
    artist.H["jobs"].clear()                       # work() is a mock here: no run ends, so none is left going
    return artist.draw(body)


def refused(body):
    try:
        drawn(body)
    except ValueError as e:
        return str(e)
    return ""


kit = Path(tempfile.mkdtemp(prefix="claude-artist-sizes-"))
said, started = [], []
real_work, real_settle = artist.work, artist._settle
try:
    q = paths.at(paths.ARTIST, kit) / "Qwen-Image-2512"
    for x in ("text_encoder", "vae", "tokenizer", "transformer", "gguf"):
        (q / x).mkdir(parents=True, exist_ok=True)
    (q / "model_index.json").write_text("{}")
    (q / "transformer" / "config.json").write_text("{}")
    (q / "gguf" / "qwen-image-2512-Q4_K_M.gguf").write_bytes(b"x")
    (kit / "artist").mkdir()
    artist.setup(kit=kit, jobs={}, lock=threading.Lock(), say=said.append, painter=lambda p: str(p or ""), take_dir=lambda t: kit / t)
    artist.work = lambda d, run, job: started.append(run)
    base = {"prompt": "A lighthouse at night.", "shapes": ["1:1"], "count": 1, "painter": "qwen2512-q4"}
    why = {k: refused(dict(base, size=v)) for k, v in {"odd": [1000, 1024], "floor": [192, 1024], "long": [3136, 1024],
                                                      "px": [3072, 2048], "words": ["a", 1024]}.items()}
    why["pass"] = refused(dict(base, size=[1536, 1536], scale=2))
    check("refused with the reason: not a multiple of 64, under 256, past the long side or the pixels, not numbers, a second pass with it",
          "multiples of 64" in why["odd"] and "256 px at least" in why["floor"] and "3072 px" in why["long"] and "megapixels" in why["px"] and
          "width and height in pixels" in why["words"] and "no second pass" in why["pass"], json.dumps(why))
    run = drawn(dict(base, size=[2048, 1152], shapes=[]))
    ask = json.loads((kit / "artist" / run["id"] / "ask.json").read_text()) if (kit / "artist" / run["id"] / "ask.json").exists() else run
    check("a wide size of one's own is one picture filed under 16:9, the size kept on the run (no shape needed)",
          run.get("shapes") == ["16:9"] and run.get("size") == [2048, 1152] and run.get("of") == 1 and ask.get("size") == [2048, 1152], json.dumps(run)[:300])
    tall, sq = drawn(dict(base, size=[768, 1344])), drawn(dict(base, size=[1280, 1152]))
    check("  a tall one under 9:16, a nearly square one under 1:1", tall["shapes"] == ["9:16"] and sq["shapes"] == ["1:1"])
    check("the job draws and keeps it as asked, the shapes' sizes otherwise",
          artist_job.sized(artist_job.SHAPES, "16:9", {"size": [2048, 1152]}) == ((2048, 1152), (2048, 1152)) and
          artist_job.sized(artist_job.SHAPES, "16:9", {}) == ((1920, 1088), (1920, 1080)))
    n0, n1 = artist.size_need_mb("qwen2512-q4", 1328, 1328), artist.size_need_mb("qwen2512-q4", 2048, 2048)
    lim = artist.size_limits([24576, 16384, None])
    check("the card's need: the painter's own at 1328² and more for each megapixel beyond; /artist/sizes says the parts and the largest card",
          n0 == artist.NEED["qwen2512-q4"] and n1 > n0 + 5000 and artist.size_need_mb("qwen2512-q4", 512, 512) == n0 and
          lim["floor"] == 256 and lim["step"] == 64 and lim["card_mb"] == 24576 and lim["need"]["qwen2512-q4"] == n0, f"{n0} {n1} {lim}")
    sm = artist.smaller(2048, 1152)
    check("a smaller size keeps the aspect, about 70 % of the pixels, multiples of 64, never under 256",
          sm[0] % 64 == 0 and sm[1] % 64 == 0 and 0.6 < sm[0] * sm[1] / (2048 * 1152) < 0.75 and abs(sm[0] / sm[1] - 16 / 9) < 0.15 and
          artist.smaller(256, 256) == [256, 256], str(sm))
    plain = drawn(base)                             # drawn while work() is still the mock: no thread of its own paints it
    artist.work = real_work
    artist._settle = lambda r: (_ for _ in ()).throw(RuntimeError("the painter stopped: torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.1 GiB"))
    d = kit / "artist" / run["id"]
    job = {"status": "queued"}
    artist.H["jobs"]["artist:" + run["id"]] = job
    r = artist.read(d)
    artist.work(d, r, job)
    r = artist.read(d)
    check("out of the card's memory at a size of one's own: said as such, a smaller size offered on the run",
          r.get("status") == "failed" and "out of the card's memory at 2048×1152" in r.get("error", "") and r.get("smaller") == sm, json.dumps(r)[:300])
    pd = kit / "artist" / plain["id"]
    pr = artist.read(pd)
    artist.H["jobs"]["artist:" + plain["id"]] = job
    artist.work(pd, pr, job)
    pr = artist.read(pd)
    check("  a run of the shapes keeps the error as it came (no size to make smaller)", "smaller" not in pr and "CUDA out of memory" in pr.get("error", ""))
finally:
    artist.work, artist._settle = real_work, real_settle
    shutil.rmtree(kit, ignore_errors=True)
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
