#!/usr/bin/env python3
"""HERESY 2361 (Viktor 11.11.2026: «Пока что делай как советуешь там», the night report's advice for the Videographer taken): on a studio of its own
in a temporary folder (never this Studio's), the processor only, no card:
  the final at 1280 × 704 with 28 steps (one pass holds a shot of 5 s), asking the draft's room;
  the hero's own picture as the last frame of his shots when the plan asks it (hero.last): which shots are his, the job's «last», a picture asked
  and not found said, never taken for «not asked»; the choice saved and kept across another hero;
  MiniMax H3's sampler with a last frame (FL2VA's «last» anchor at the target's last latent frame, its rows after the first frame's, its
  condition noise drawn after the first's), and without one exactly as before; the runtime gives the last picture cover-cropped to the canvas,
  shown to the encoder after the first, and none in FastH3;
  the editor's project (OTIO, EDL) at the clip's 24 fps;
  the cuts on the DAW's own bar grid (bargrid) when the lab hands it over, said when it could not be had, the bars heard as before then.
  .venv-art/bin/python lab/test_vg_2361.py"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
import videographer as v  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
bad = []


def check(name, ok, detail=""):
    print(f"  {G + 'ok  ' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))
    if not ok:
        bad.append(name)


kit = Path(tempfile.mkdtemp(prefix="vg2361-"))
try:
    from PIL import Image
    name = "t"
    (kit / "user/videos").mkdir(parents=True)

    print("the final at 1280 × 704, 28 steps")
    stub = types.ModuleType("artist")
    pics = {}

    def picture(rid, f):
        p = pics.get((rid, f))
        if not p:
            raise FileNotFoundError("no such picture")
        return p, "image/png"
    stub.picture = picture
    stub.run_dir = lambda rid: kit / "artist" / str(rid)
    stub.read = lambda d: {}
    sys.modules["artist"] = stub
    import h3_shots as h
    check("the final 1280 × 704 (9:16 704 × 1280), 28 steps, the draft's room; one pass 124 frames (5.17 s)",
          h.SIZES["final"]["16:9"] == (1280, 704) and h.SIZES["final"]["9:16"] == (704, 1280) and h.MODES["final"]["steps"] == 28
          and h.need_mb("final") == h.need_mb("draft") and h.pass_frames(*h.SIZES["final"]["16:9"]) == 124)

    print("the hero as the last frame")
    plan = {"name": name, "title": "a test", "seconds": 15.0, "look": {}, "shots": [
        {"t0": 0.0, "t1": 5.0, "scene": {}, "frame_from": {"by": "frames", "hero": True}},
        {"t0": 5.0, "t1": 10.0, "scene": {}, "frame_from": {"by": "frames", "hero": False}, "hero": True},
        {"t0": 10.0, "t1": 15.0, "scene": {}, "hero": True}],
        "hero": {"run": "r1", "file": "01.png", "words": "a wooden boy"}}
    v._write(kit, name, plan)
    hero_png = kit / "hero.png"
    Image.new("RGB", (512, 768), (10, 200, 30)).save(hero_png)
    pics[("r1", "01.png")] = hero_png
    check("whose shot: his picture's word first (drawn from the hero, or not), else chosen so",
          [h.hero_shot(s) for s in plan["shots"]] == [True, False, True] and h.hero_shot({"t0": 0, "t1": 1}) is False)
    p = v.get(kit, name)
    check("not asked: no last frame", h.hero_last(kit, p, p["shots"][0]) == ("", ""))
    q = v.save(kit, name, {"hero_last": True})
    check("asked (hero_last), kept on the hero", q["hero"].get("last") is True, q.get("hero"))
    check("his shot gets his picture; a shot drawn without him none",
          h.hero_last(kit, q, q["shots"][0]) == (str(hero_png), "") and h.hero_last(kit, q, q["shots"][1]) == ("", ""))
    h.ready = lambda k: {"ready": True, "missing": []}
    sp = kit / "user/videos/.h3/gpu0-h3"
    sp.mkdir(parents=True)
    (sp / "worker.json").write_text(json.dumps({"status": "ready", "pid": os.getpid(), "gpu": 0, "at": time.time()}))
    j0 = h.shoot(kit, name, 0, "a prompt", "final")
    j1 = h.shoot(kit, name, 1, "a prompt", "final")
    jf = h.shoot(kit, name, 0, "a prompt", "fast")
    check("the job: his shot «last» = his picture, at 1280 × 704 and 28 steps; a shot without him none", j0.get("last") == str(hero_png) and "last" not in j1
          and j0["width"] == 1280 and j0["height"] == 704 and j0["steps"] == 28 and j0.get("frames") is None, {k: j0.get(k) for k in ("last", "width", "steps", "frames")})
    check("«fast» too (832 × 480, the same worker kind): the last frame goes with it", jf.get("last") == str(hero_png))
    st = h.status(kit, name)
    check("the queue says which shots carry the hero's last frame", any(j["i"] == 0 and j["last"] for j in st["jobs"]) and any(j["i"] == 1 and not j["last"] for j in st["jobs"]))
    pics.clear()
    j2 = h.shoot(kit, name, 2, "a prompt", "draft")
    check("asked and his picture gone: no last frame, and it says why (never «not asked»)", "last" not in j2 and "not here" in (j2.get("last_missing") or ""), j2.get("last_missing"))
    st = h.status(kit, name)
    check("… and the queue says it too", any(j["i"] == 2 and "not here" in (j.get("last_missing") or "") for j in st["jobs"]))
    pics[("r1", "01.png")] = hero_png
    h.cancel(kit, name)
    import frames_job as fj
    pics[("r2", "02.png")] = hero_png
    q = fj.hero_set(kit, name, "r2", "02.png")
    check("another hero picked: the last-frame choice stays", q["hero"].get("last") is True and q["hero"]["run"] == "r2", q.get("hero"))
    q = v.save(kit, name, {"hero_last": False})
    check("unpressed: taken off", "last" not in q["hero"], q.get("hero"))
    q = v.save(kit, name, {"hero_last": "yes"})
    check("an odd value left out", "last" not in q["hero"], q.get("hero"))
    done = {"out": str(v.shots_dir(kit, name) / "20261111-120000-000-000.mp4"), "t0": 0.0, "t1": 5.0, "mode": "final", "steps": 28, "seed": 1,
            "width": 1280, "height": 704, "first": "x.jpg", "last": str(hero_png)}
    v.shots_dir(kit, name).mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x36:d=0.5:r=24", "-c:v", "libx264", "-pix_fmt", "yuv420p", done["out"]],
                   check=True, capture_output=True)
    q = v.shot_video_set(kit, name, done)
    check("a shot's video keeps what its last frame was", q["shots"][0]["video_from"].get("last") == str(hero_png), q["shots"][0].get("video_from"))

    print("MiniMax H3's sampler with a last frame (a stub transformer, the CPU)")
    import torch
    from h3rt.minimax_h3 import packing
    from h3rt.minimax_h3.pipeline import MiniMaxH3Pipeline

    class Model:
        device_torch = torch.device("cpu")
        torch_dtype = torch.float32
        max_text_length = 512
        sample_step_hook = None

        def __init__(self):
            self.seen = []
            self.transformer = self.forward

        def forward(self, hidden_states, audio_hidden_states, position_ids, **kw):
            self.seen.append({"video": hidden_states.clone(), "pos": position_ids.clone()})
            return torch.zeros_like(hidden_states), torch.zeros_like(audio_hidden_states)

        def encode_keyframe_latents(self, frame):
            return frame.mean(1, keepdim=True).expand(-1, 24, -1, -1, -1)[:, :, :, ::16, ::16].float().contiguous()

        def _pdd_weights(self, *a):
            return None

    class Emb:
        text_embeds = [torch.zeros(5, 8)]
        text_token_tags = [torch.ones(5, dtype=torch.long)]

    W, H = 64, 64
    first_img, last_img = Image.new("RGB", (W, H), (250, 250, 250)), Image.new("RGB", (W, H), (10, 10, 10))

    def run(**kw):
        m = Model()
        r = MiniMaxH3Pipeline(m)(Emb(), height=H, width=W, num_frames=22, num_inference_steps=2, generator=torch.manual_seed(5), with_audio=False,
                                 decode=False, **kw)
        return m, r["latents"]
    m0, l0 = run(ctrl_img=first_img)
    m1, l1 = run(ctrl_img=first_img, last_img=last_img)
    m2, _ = run(last_img=last_img)
    rows = (H // 16 // 2) * (W // 16 // 2)
    t_lat = packing.video_latent_num_frames(packing.align_num_frames_down(22))
    n_text = 5
    v0, v1 = m0.seen[0]["video"], m1.seen[0]["video"]
    check("the first frame alone: one keyframe's rows; with a last frame: two, the first frame's rows the same as without it",
          v0.shape[1] == rows + t_lat * rows and v1.shape[1] == 2 * rows + t_lat * rows and torch.equal(v0[:, :rows], v1[:, :rows]), (v0.shape, v1.shape))
    last_t = float(n_text) + packing._temporal_position_span(t_lat) - packing._ROPE_FRAME_RESCALE
    pos1 = m1.seen[0]["pos"][0]
    cond0 = n_text
    check("the last frame's rows pinned at the target's last latent frame (FL2VA's «last»), the first's at frame 0",
          bool((pos1[cond0:cond0 + rows, 0] == float(n_text)).all()) and bool((pos1[cond0 + rows:cond0 + 2 * rows, 0] == last_t).all()), (float(pos1[cond0 + rows, 0]), last_t))
    lr = v1[:, rows:2 * rows]
    check("its rows are the last picture's (dark), not the first's (light)", float(lr.mean()) < float(v1[:, :rows].mean()), (float(lr.mean()), float(v1[:, :rows].mean())))
    check("a last frame alone: one keyframe's rows, at the last frame's time", m2.seen[0]["video"].shape[1] == rows + t_lat * rows
          and bool((m2.seen[0]["pos"][0][n_text:n_text + rows, 0] == last_t).all()))
    m0b, l0b = run(ctrl_img=first_img)
    check("without a last frame the same seed draws the same as before (the same rows, the same latents)", torch.equal(l0, l0b)
          and all(torch.equal(a["video"], b["video"]) for a, b in zip(m0.seen, m0b.seen)))
    try:
        run(ref_images=[first_img], last_img=last_img)
        refused = ""
    except ValueError as e:
        refused = str(e)
    check("a last frame with references refused (ref2va has no keyframes)", "without references" in refused, refused)

    print("the runtime gives the last frame on")
    import h3rt.runtime as rt
    calls = {}
    import paths   # HERESY 2330: where the weights live
    h3 = rt.H3(paths.at(paths.VIDEO_H3, kit), device="cpu")

    def pe(prompt, picture=None, last=None):
        calls.setdefault("pe", []).append((picture, last))
        return "embeds"

    def pipe(**kw):
        calls["pipe"] = kw
        return {"video": torch.zeros(1, 4, 4, 3, dtype=torch.uint8), "fps": 24}
    h3.prompt_embeds, h3.pipeline = pe, pipe
    rt.write_mp4 = lambda *a, **k: None
    first_png = kit / "first.png"
    first_img.resize((1280, 720)).save(first_png)
    h3.shoot("a prompt", kit / "o.mp4", width=1280, height=704, frames=124, steps=28, seed=3, first=str(first_png), last=str(hero_png))
    tail = calls["pipe"].get("last_img")
    check("the hero's picture cover-cropped to the canvas (1280 × 704), not stretched; given as the last frame",
          tail is not None and tail.size == (1280, 704) and calls["pipe"]["ctrl_img"].size == (1280, 704))
    check("shown to the encoder after the first frame's picture", calls["pe"][-1][0] == str(first_png) and calls["pe"][-1][1] is tail)
    calls.clear()
    h3.shoot("a prompt", kit / "o.mp4", width=1280, height=704, frames=124, steps=28, seed=3, first=str(first_png))
    check("no last asked: none given, the encoder shown the first frame alone", calls["pipe"].get("last_img") is None and calls["pe"][-1] == (str(first_png), None))
    calls.clear()
    h3.fast = True
    h3.shoot("a prompt", kit / "o.mp4", width=832, height=480, frames=124, steps=8, seed=3, first=str(first_png), last=str(hero_png))
    check("FastH3 (text alone): neither", calls["pipe"].get("last_img") is None and calls["pipe"].get("ctrl_img") is None)
    h3.fast = False

    print("the editor's project at 24 fps")
    wav = kit / "a.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "6", str(wav)], check=True, capture_output=True)
    p = v.get(kit, name)
    p["shots"] = [{"t0": 0.0, "t1": 3.3, "scene": {}}, {"t0": 3.3, "t1": 6.0, "scene": {}}]
    p.pop("exists")
    v._write(kit, name, p)
    v.frame_set(kit, name, 0, hero_png, "disk")
    tl = v.edit_timeline(kit, name, wav, "t")
    clip = next(c for c in tl["otio"]["tracks"]["children"][0]["children"] if c["OTIO_SCHEMA"] == "Clip.1")
    check("OTIO at 24 fps, a shot of 3.3 s 79 frames (at 25 it was 82)", v.EDIT_FPS == 24 == v.FPS and clip["source_range"]["duration"]["rate"] == 24.0
          and clip["source_range"]["duration"]["value"] == 79.0 and tl["otio"]["metadata"]["ruach"]["fps"] == 24, clip["source_range"])
    check("the EDL's timecodes count 24 frames a second (3.3 s ends at 00:00:03:07)", "00:00:03:07" in tl["edl"], tl["edl"][:300])

    print("the cuts on the DAW's bar grid")
    p = v.get(kit, name)
    p["shots"] = [{"t0": 0.0, "t1": 4.1, "section": "verse", "scene": {}}, {"t0": 4.1, "t1": 8.3, "section": "chorus", "scene": {}},
                  {"t0": 8.3, "t1": 12.0, "section": "chorus", "scene": {}}]
    p["seconds"] = 12.0
    p.pop("exists")
    v._write(kit, name, p)
    grid = {"how": "heard", "bars": [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0], "beats": [round(k * 0.5, 3) for k in range(25)], "bpm": 120.0,
            "seconds": 12.0, "settings": {"downbeat": 0.0}, "said": "120 bpm heard (score: 120, +0.0 %); 4/4, bar 1 at 0.00 s (set by hand)"}
    heard = []
    real_bt = v.beat_times
    v.beat_times = lambda audio, strength=False: (heard.append(1), ([round(k * 0.5 + 0.11, 3) for k in range(24)], 120.0, [1.0] * 24))[1]
    out = v.on_beat(kit, name, wav, how="sections", changes=[], grid=grid)
    q = v.get(kit, name)
    check("the change of section on the DAW's bar (4.1 → 4.0), its grid «daw», nothing heard again",
          q["shots"][0]["t1"] == 4.0 and q["shots"][1]["t0"] == 4.0 and out["grid"] == "daw" and q["rhythm"]["bars"] == grid["bars"] and not heard, out)
    check("what the DAW's grid says of itself said with the answer", out.get("grid_said") == grid["said"] and "grid_error" not in out, out)
    out = v.on_beat(kit, name, wav, how="beats", changes=[], grid=grid)
    q = v.get(kit, name)
    check("«beats»: the cut inside the chorus on the grid's beat (8.3 → 8.5)", q["shots"][1]["t1"] == 8.5 and q["shots"][2]["t0"] == 8.5, [(s["t0"], s["t1"]) for s in q["shots"]])
    out = v.on_beat(kit, name, wav, how="sections", changes=[], grid={"how": "none", "bars": [], "beats": [], "said": "too few beats heard in the take's sound to lay a grid on"})
    check("a DAW grid with no bars: the bars heard as before, and it says why", heard and out["grid"] == "heard" and "too few beats" in out.get("grid_error", ""), out)
    out = v.on_beat(kit, name, wav, how="sections", changes=[], grid=None, grid_error="no take t")
    check("the grid not had at all: said with the answer", out.get("grid_error") == "no take t", out)
    out = v.on_beat(kit, name, wav, how="sections", changes=[])
    check("no grid asked (an older lab): as before, nothing said of it", "grid_error" not in out and "grid_said" not in out and out["grid"] == "heard", out)
    v.beat_times = real_bt
finally:
    shutil.rmtree(kit, ignore_errors=True)

print(f"\n{'all passed' if not bad else str(len(bad)) + ' FAILED'}")
sys.exit(1 if bad else 0)
