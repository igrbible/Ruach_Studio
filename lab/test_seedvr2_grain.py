#!/usr/bin/env python3
"""HERESY 2276: SeedVR2 as a pass of the Artist's upscale, on a kit of its own in a temporary folder (never this Studio's), no card and no
model: the grains here in their order (7B sharp in every precision before 3B), the least a card needs, the best grain for a card's free memory
and the next one after a grain that ran out of memory; artist_upscale.seedvr2 with SeedVR2 itself mocked (it writes a picture of the size
asked, or says «out of memory»): the grain that fits taken, the next one after an out of memory and the note of it, a failure that is not
memory said with its last line, a card too small refused with its numbers, a picture above the cap made at the cap; a chain with a SeedVR2
pass between an upscaler's lands at the source's size × its factor; the lab lists SeedVR2 among the upscalers when its weights are here (not
when they are not), refuses it outside the passes, and a run whose passes hold it waits for a card with the least grain's memory.
  .venv/bin/python lab/test_seedvr2_grain.py"""
import shutil
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artist  # noqa: E402
import artist_upscale as au  # noqa: E402
import seedvr2_grain as sg  # noqa: E402
from PIL import Image  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def raised(fn, *a, **k):
    try:
        fn(*a, **k)
    except (RuntimeError, ValueError, FileNotFoundError) as e:
        return str(e)
    return ""


kit = Path(tempfile.mkdtemp(prefix="claude-seedvr2-"))
real = (au.KIT, sg.free_mb, sg.run_still)
calls = []
try:
    d = sg.model_dir(kit)
    d.mkdir(parents=True)
    check("no VAE: no grain, nothing a card needs", sg.present(kit) == [] and sg.least_mb(kit) == 0)
    for f in ("ema_vae_fp16.safetensors", "seedvr2_ema_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors", "seedvr2_ema_7b_sharp-Q6_K.gguf",
              "seedvr2_ema_3b-Q4_K_M.gguf"):
        (d / f).write_bytes(b"x" * 1024)
    g = sg.present(kit)
    check("the grains here in their order: 7B sharp fp8, Q6_K, then 3B Q4_K_M", [x["label"] for x in g] == ["7B sharp · fp8", "7B sharp · Q6_K", "3B · Q4_K_M"],
          str([x["label"] for x in g]))
    check("the least a card needs is the smallest grain's", sg.least_mb(kit) == 4800)
    check("a card with 12 GB free takes 7B sharp fp8", (sg.pick(12000, kit) or {}).get("label") == "7B sharp · fp8")
    check("with 10 GB free, 7B sharp Q6_K", (sg.pick(10000, kit) or {}).get("label") == "7B sharp · Q6_K")
    check("with 6 GB free, 3B Q4_K_M", (sg.pick(6000, kit) or {}).get("label") == "3B · Q4_K_M")
    check("with 4 GB free, none", sg.pick(4000, kit) is None)
    check("after fp8 ran out of memory on 12 GB, Q6_K", (sg.pick(12000, kit, below=g[0]) or {}).get("label") == "7B sharp · Q6_K")

    au.KIT = kit
    sg.free_mb = lambda: 12000
    oom = {"7B sharp · fp8"}

    def fake_run(src, out, grain, short, long_cap=0, seed=42, k=None, log=None):
        calls.append((grain["label"], short, long_cap, seed))
        if grain["label"] in oom:
            return 1, "torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB"
        if grain["label"] == "fail":
            return 1, "boom"
        w, h = Image.open(src).size
        k2 = short / min(w, h)
        Path(out).mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (round(w * k2), round(h * k2)), (90, 120, 150)).save(Path(out) / "in.png")
        return 0, "done"
    sg.run_still = fake_run
    img = Image.new("RGB", (100, 80), (200, 30, 30))
    big, grain, note = au.seedvr2(img, (200, 160), seed=7)
    check("out of memory in fp8: the next grain made it, at the size asked, and the note says so",
          grain["label"] == "7B sharp · Q6_K" and big.size == (200, 160) and "out of memory in 7B sharp · fp8" in note and
          [c[0] for c in calls] == ["7B sharp · fp8", "7B sharp · Q6_K"] and calls[-1][1:] == (160, 200, 7), f"{grain['label']} {big.size} {note} {calls}")
    oom.update({"7B sharp · Q6_K", "3B · Q4_K_M"})
    e = raised(au.seedvr2, img, (200, 160))
    check("out of memory in every grain: said, each named", "every grain" in e and "3B · Q4_K_M" in e, e)
    oom.clear()
    sg.run_still = lambda *a, **k: (2, "loading\nKeyError: 'blocks.35'\n")
    e = raised(au.seedvr2, img, (200, 160))
    check("a failure that is not memory: said with its last line, no next grain", "stopped (2)" in e and "blocks.35" in e, e)
    sg.run_still = fake_run
    sg.free_mb = lambda: 3000
    e = raised(au.seedvr2, img, (200, 160))
    check("a card too small: refused with its free memory and the least grain's", "3000 MB free" in e and "4800" in e, e)
    sg.free_mb = lambda: 12000
    calls.clear()
    big, grain, note = au.seedvr2(Image.new("RGB", (2000, 1500)), (8000, 6000))
    check("above the cap: SeedVR2 makes 16 MP at most and says the rest is the resample's", calls[-1][1] <= 3464 and "16 MP at most" in note, f"{calls} {note}")

    au.paths.at(au.paths.ARTIST_UPSCALERS, kit).mkdir(parents=True)
    calls.clear()
    out, done = au.chain(img, [{"model": "SeedVR2", "factor": 2}, {"model": "SeedVR2", "factor": 3}], "bilinear", device="cpu", seed=5)
    check("a chain of SeedVR2 passes lands at the source's size × the last factor, each pass its grain", out.size == (300, 240) and
          [x["grain"] for x in done] == ["7B sharp · fp8", "7B sharp · fp8"] and done[1]["scale"] == 1.5 and calls[0][3] == 5, f"{out.size} {done}")

    said = []
    artist.setup(kit=kit, jobs={}, lock=threading.Lock(), say=said.append, painter=lambda p: str(p or ""), take_dir=lambda t: kit / t)
    ups = artist.upscalers()["upscalers"]
    sr = [u for u in ups if u["name"] == "SeedVR2"]
    check("the lab lists SeedVR2 among the upscalers, its grains and the least it needs", len(sr) == 1 and sr[0]["kind"] == "seedvr2" and
          sr[0]["need_mb"] == 4800 and [x["label"] for x in sr[0]["grains"]][0] == "7B sharp · fp8" and sr[0]["info"]["license"] == "Apache-2.0", str(sr))
    sd = kit / "artist" / "20261109-120000-aaaa"
    sd.mkdir(parents=True)
    artist.write(sd, {"id": sd.name, "prompt": "A lighthouse.", "painter": "qwen2512-q4", "shapes": ["1:1"], "seed": 7, "status": "done",
                      "pictures": [{"n": 1, "shape": "1:1", "seed": 7, "w": 1024, "h": 1024, "kept": True, "file": "01-1x1-s7.png"}]})
    Image.new("RGB", (64, 64)).save(sd / "01-1x1-s7.png")
    e = raised(artist.upscale, {"id": sd.name, "file": "01-1x1-s7.png", "model": "SeedVR2", "target": "2k"})
    check("one picture with SeedVR2 outside the passes: refused, the passes named", "as a pass" in e, e)
    e = raised(artist.upscale, {"items": [{"id": sd.name, "file": "01-1x1-s7.png"}], "model": "SeedVR2", "target": "2k"})
    check("the pictures picked with SeedVR2 outside the passes: refused alike", "as a pass" in e, e)
    needs = []

    def wait_card(job, need, *a, **k):
        needs.append(need)
        raise RuntimeError("no card (test)")
    artist.H["wait_card"] = wait_card
    rd = kit / "artist" / "20261109-120000-bbbb"
    rd.mkdir(parents=True)
    run = {"id": "20261109-120000-bbbb", "painter": "upscale", "passes": [{"model": "4x_test.pth", "factor": 2}, {"model": "SeedVR2", "factor": 4}],
           "of": 1, "pictures": [], "status": "queued"}
    artist.work(rd, run, {"status": "queued"})
    run2 = dict(run, id="20261109-120000-cccc", passes=[{"model": "4x_test.pth", "factor": 2}])
    (kit / "artist" / run2["id"]).mkdir()
    artist.work(kit / "artist" / run2["id"], run2, {"status": "queued"})
    check("a run whose passes hold SeedVR2 waits for the least grain's memory; one without, for an upscaler's", needs == [4800, artist.NEED["upscale"]], str(needs))
    shutil.rmtree(d)
    check("SeedVR2's weights gone: not among the upscalers", not [u for u in artist.upscalers()["upscalers"] if u["name"] == "SeedVR2"])
finally:
    au.KIT, sg.free_mb, sg.run_still = real
    shutil.rmtree(kit, ignore_errors=True)
print(f"\ntest_seedvr2_grain  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
