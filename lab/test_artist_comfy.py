#!/usr/bin/env python3
"""HERESY 2332: his two ComfyUI workflows in the Artist (lab/artist_recipes.py, lab/artist_comfy.py, lab/artist.py draw and draw_grid,
lab/artist_job.py), on a kit of its own in a temporary folder (never this Studio's), no card and no painter: ComfyUI's way checked (2512
only, no Euler SDE, the guidance, a start from a step only over a picture, his encoder and VAE only when their files are here, a ComfyUI
seed up to 2^64), kept on the run's ask with the hooked adapter's room asked of the card; his grid laid out as cells (the fine-tunes
outermost, samplers × schedules innermost, 64 at most, every adapter named once), its run's pictures counted by cells; the job sends both
to artist_comfy; and the arithmetic that needs no card: ComfyUI's flow sampling and schedules (values measured against ComfyUI's own code
10.11.2026), his hook keyframes as ComfyUI steps them (pass 1 of his QWEN2_00075: 0, 0.4, 1, 1, 0.86…), the seed variance and the starting
noise reproducible from their seeds, the tokens packed and unpacked, Skimmed CFG's rule, and an adapter laid into an fp8 painter as ComfyUI lays
it (each layer's seed, the rounding by chance, the hooked adapter only while its entry paints), and the painter's forward in ComfyUI's
arithmetic on a small Qwen-Image. Under a minute on the CPU.
  .venv-art/bin/python lab/test_artist_comfy.py"""
import json
import shutil
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artist  # noqa: E402
import artist_comfy  # noqa: E402
import artist_job  # noqa: E402
import artist_recipes  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def drawn(body):
    artist.H["jobs"].clear()
    return artist.draw(body)


def gridded(body):
    artist.H["jobs"].clear()
    return artist.draw_grid(body)


def refused(fn, body):
    try:
        artist.H["jobs"].clear()
        fn(body)
    except ValueError as e:
        return str(e)
    return ""


kit = Path(tempfile.mkdtemp(prefix="claude-artist-comfy-"))
said, started = [], []
real_work = artist.work
try:
    q = artist.paths.at(artist.paths.ARTIST, kit) / "Qwen-Image-2512"
    for x in ("text_encoder", "vae", "tokenizer", "transformer", "checkpoints", "lightning"):
        (q / x).mkdir(parents=True, exist_ok=True)
    (q / "model_index.json").write_text("{}")
    (q / "transformer" / "config.json").write_text("{}")
    (q / "checkpoints" / "Hyphoria QW2512 v1 fp8.safetensors").write_bytes(b"x")
    (q / "checkpoints" / "JibMix QW2512 v6 fp8.safetensors").write_bytes(b"x")
    (q / "lightning" / "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors").write_bytes(b"x")
    lo = artist.paths.at(artist.paths.ARTIST_LORAS, kit) / "qwen-image-2512"
    (lo / "PRIVATE").mkdir(parents=True)
    (lo / "PUBLIC").mkdir(parents=True)
    for name in ("PRIVATE/character_r16_v1.safetensors", "PUBLIC/Detailz v1.safetensors", "PUBLIC/Qwen Enhancer v1.safetensors",
                 "PUBLIC/QWEN-2512-Lightning-8steps-V1.0-bf16.safetensors"):
        (lo / name).write_bytes(b"x" * (3 << 20))
    (kit / "artist").mkdir()
    artist.setup(kit=kit, jobs={}, lock=threading.Lock(), say=said.append, painter=lambda p: str(p or ""), take_dir=lambda t: kit / t)
    artist.work = lambda d, run, job: started.append(run)
    hyph = "Hyphoria QW2512 v1 fp8.safetensors"
    svit = "qwen-image-2512/PRIVATE/character_r16_v1.safetensors"
    first = {"prompt": "IMAGE & COMPOSITION STYLE: a goddess on luminous water.", "shapes": ["16:9"], "count": 1, "painter": "qwen2512-fp8", "model": hyph,
             "sampling": {"lightning": 0.55, "steps": 12, "sampler": "er_sde", "schedule": "bong_tangent"},
             "comfy": {"seed": "543175983116770", "cfg": 4.5, "skim": 2.5, "zero_neg": True, "also": "young woman, detailed face,",
                       "variance": {"pct": 50, "strength": 12, "switch": 25, "seed": 38137192928211},
                       "hook": {"id": svit, "weight": 0.8, "trigger": "charactername", "count": 12},
                       "sampling": {"kind": "flux", "max_shift": 3, "base_shift": 0.5}}}

    # ---- ComfyUI's way, refused with its reason
    why = {"q21": refused(lambda b: artist_recipes.comfy(b, "qwen21", kit), first),
           "sde": refused(artist.draw, dict(first, sampling=dict(first["sampling"], sampler="euler-sde"))),
           "cfg": refused(artist.draw, dict(first, comfy=dict(first["comfy"], cfg=12))),
           "start": refused(artist.draw, dict(first, comfy=dict(first["comfy"], start=20))),
           "enc": refused(artist.draw, dict(first, comfy=dict(first["comfy"], encoder="abliterated"))),
           "vae": refused(artist.draw, dict(first, comfy=dict(first["comfy"], vae="clear"))),
           "seed": refused(artist.draw, dict(first, comfy=dict(first["comfy"], seed=str(2 ** 64)))),
           "hook": refused(artist.draw, dict(first, comfy=dict(first["comfy"], hook={"id": "qwen-image-2512/PUBLIC/none.safetensors"})))}
    check("refused with the reason: Qwen-Image 2.1, Euler SDE, CFG past 10, a start without a picture, his encoder or VAE not here, a seed past 2^64, "
          "an adapter not here",
          "2512" in why["q21"] and "Euler SDE" in why["sde"] and "guidance" in why["cfg"] and "picture" in why["start"]
          and "encoders/" in why["enc"] and "vaes/" in why["vae"] and "seed" in why["seed"] and "adapter" in why["hook"], json.dumps(why)[:400])
    (q / "encoders").mkdir()
    (q / "encoders" / "Qwen2.5-VL-7B-Abliterated-bf16.safetensors").write_bytes(b"x")
    (q / "vaes").mkdir()
    (q / "vaes" / "qwen_image_clear_vae.safetensors").write_bytes(b"x")
    check("his encoder and VAE listed when their files are here", artist_recipes.parts(kit) == {"encoders": ["qwen", "abliterated"], "vaes": ["qwen", "clear"]},
          str(artist_recipes.parts(kit)))
    check("/artist/painters says them to the page (an older lab says nothing: the page waits for its restart)",
          artist.painters().get("comfy") == {"encoders": ["qwen", "abliterated"], "vaes": ["qwen", "clear"]}, str(artist.painters().get("comfy")))
    run = drawn(dict(first, comfy=dict(first["comfy"], encoder="abliterated", vae="clear")))
    ask = json.loads((kit / "artist" / run["id"] / "ask.json").read_text())
    c = ask.get("comfy") or {}
    check("his AIO #4 first pass kept on the ask: the ComfyUI seed whole, CFG with Lightning, Skimmed CFG, the negative as nothing, the second words, "
          "the variance, the hooked adapter with its room, his encoder and VAE, ModelSamplingFlux",
          c.get("seed") == 543175983116770 and c.get("cfg") == 4.5 and c.get("skim") == 2.5 and c.get("zero_neg") is True and c.get("also")
          and c.get("variance", {}).get("seed") == 38137192928211 and c.get("hook", {}).get("id") == svit and c["hook"].get("mb") == 3
          and c.get("encoder") == "abliterated" and c.get("vae") == "clear" and c.get("sampling") == {"kind": "flux", "max_shift": 3.0, "base_shift": 0.5}
          and ask["sampling"].get("lightning") == 0.55, json.dumps(c)[:500])
    # the second pass: over a picture of that run, from step 20 of 60, his #2 adapters
    pic = kit / "artist" / run["id"] / "01-16x9-s543175983116770.png"
    from PIL import Image
    Image.new("RGB", (1664, 928), (40, 30, 20)).save(pic)
    second = dict(first, ref={"id": run["id"], "file": pic.name}, strength=0.6, scale=2, inject=1.0,
                  sampling={"lightning": 0, "steps": 60, "sampler": "er_sde", "schedule": "bong_tangent"},
                  loras=[{"id": "qwen-image-2512/PUBLIC/Detailz v1.safetensors", "weight": 0.6}, {"id": "qwen-image-2512/PUBLIC/Qwen Enhancer v1.safetensors", "weight": 0.7}],
                  comfy=dict(first["comfy"], start=20, inject_seed=1069624475695525, match=True, variance=dict(first["comfy"]["variance"], seed=753839474893414)))
    artist.FILE_RE.match(pic.name) or check("the picture's name is the Artist's", False, pic.name)
    run2 = drawn(second)
    a2 = json.loads((kit / "artist" / run2["id"] / "ask.json").read_text())
    check("the second pass kept: ×2 by nearest, the extra noise and its seed, from step 20 of 60, colours matched, his #2 adapters",
          a2.get("scale") == 2.0 and a2.get("ref_resample") == "nearest" and a2.get("inject") == 1.0 and a2["comfy"].get("start") == 20
          and a2["comfy"].get("inject_seed") == 1069624475695525 and a2["comfy"].get("match") is True and len(a2.get("loras") or []) == 2, json.dumps(a2)[:400])
    check("a start past the steps refused", "of 60" in refused(artist.draw, dict(second, comfy=dict(second["comfy"], start=60))))
    # HERESY 2360: MAIN CONTROL kept on the ask, its curve and its span checked
    mc = {"from": 0, "to": 1, "how": "ease_in", "start": 0.3, "end": 1.0}
    run3 = drawn(dict(first, comfy=dict(first["comfy"], hook=dict(first["comfy"]["hook"], main=mc))))
    a3 = json.loads((kit / "artist" / run3["id"] / "ask.json").read_text())
    check("MAIN CONTROL kept on the ask with the hooked adapter: his 0 → 1, ease-in, 30 % → 100 %",
          a3["comfy"]["hook"].get("main") == {"from": 0.0, "to": 1.0, "how": "ease_in", "start": 0.3, "end": 1.0}, json.dumps(a3["comfy"]["hook"]))
    check("MAIN CONTROL refused with the reason: a curve not ComfyUI's, an end before its start",
          "curve" in refused(artist.draw, dict(first, comfy=dict(first["comfy"], hook=dict(first["comfy"]["hook"], main=dict(mc, how="bounce")))))
          and "after it starts" in refused(artist.draw, dict(first, comfy=dict(first["comfy"], hook=dict(first["comfy"]["hook"], main=dict(mc, start=0.8, end=0.5))))))
    check("no MAIN CONTROL asked, none kept (the run ComfyUI's own)", "main" not in c.get("hook", {}), json.dumps(c.get("hook")))

    # ---- his grid
    grid = {"prompt": "unused", "shapes": ["1:1"], "painter": "qwen2512-fp8", "model": hyph, "seed": 7,
            "grid": {"samplers": ["exp_heun_2_x0_sde", "er_sde", "res_3s"], "schedules": ["beta57", "kl_optimal", "bong_tangent"], "steps": [16], "cfgs": [1.2],
                     "fixed": [{"id": "qwen-image-2512/PUBLIC/QWEN-2512-Lightning-8steps-V1.0-bf16.safetensors", "weight": 0.8}],
                     "adapter": {"id": svit, "weights": [0.9]}, "prompts": ["portrait one", "portrait two"]},
            "comfy": {"negative": "Low resolution, blurry", "zero_neg": False}}
    g = gridded(grid)
    ga = json.loads((kit / "artist" / g["id"] / "ask.json").read_text())
    cells = ga["grid"]["cells"]
    check("his grid laid out: 3 samplers × 3 schedules × 2 prompts = 18 pictures, samplers × schedules innermost, one seed for all, every cell its adapters",
          g["of"] == 18 and len(cells) == 18 and [x["schedule"] for x in cells[:3]] == ["beta57", "kl_optimal", "bong_tangent"]
          and cells[3]["sampler"] == "er_sde" and cells[9]["prompt_i"] == 1 and len({x["seed"] for x in cells}) == 1
          and cells[0]["loras"] == {"qwen-image-2512/PUBLIC/QWEN-2512-Lightning-8steps-V1.0-bf16.safetensors": 0.8, svit: 0.9}, json.dumps(cells[:4])[:400])
    check("the grid's negative words kept (his grid guides against them), each adapter's room asked once",
          ga["comfy"].get("zero_neg") is False and ga["comfy"].get("negative") == "Low resolution, blurry" and len(g["loras"]) == 2, json.dumps(ga["comfy"]))
    two = dict(grid, grid=dict(grid["grid"], models=[hyph, "JibMix QW2512 v6 fp8.safetensors"], prompts=["one"]))
    cm = json.loads((kit / "artist" / gridded(two)["id"] / "ask.json").read_text())["grid"]["cells"]
    check("two fine-tunes: the first's nine cells before the second's (the painter loaded once each)",
          [x["model"] for x in cm] == [hyph] * 9 + ["JibMix QW2512 v6 fp8.safetensors"] * 9, str([x["model"] for x in cm]))
    big = dict(grid, grid=dict(grid["grid"], samplers=list(artist_recipes.SAMPLERS), schedules=list(artist_recipes.SCHEDULES)))
    check("more than 64 pictures refused", "64 at most" in refused(artist.draw_grid, big), refused(artist.draw_grid, big))
    check("a grid on Qwen-Image 2.1 refused", "2512" in refused(artist.draw_grid, dict(grid, painter="qwen21")))

    # ---- the job sends both to artist_comfy
    called = []
    real_main = artist_comfy.main
    artist_comfy.main = lambda run_, ask_, painter_: called.append((ask_.get("grid") is not None, painter_))
    import os
    os.environ["ART_PAINTER"] = "qwen2512-fp8"
    artist_job.main(kit / "artist" / run["id"])
    artist_job.main(kit / "artist" / g["id"])
    artist_comfy.main = real_main
    check("artist_job sends ComfyUI's way and the grid to artist_comfy", called == [(False, "qwen2512-fp8"), (True, "qwen2512-fp8")], str(called))

    # ---- the arithmetic, on the CPU
    import torch
    ms = artist_comfy.Sampling("flow", 1.15)
    check("Qwen-Image's own sampling: a thousand sigmas, 0.00115 to 1", len(ms.sigmas) == 1000 and abs(float(ms.sigma_min) - 0.00114983) < 1e-7 and float(ms.sigma_max) == 1.0)
    bt = artist_comfy.schedule(ms, "bong_tangent", 12)
    check("bong_tangent at 12 steps: 1 to 0, thirteen sigmas, the second 0.9823 (RES4LYF's, as ComfyUI ran it)",
          len(bt) == 13 and float(bt[0]) == 1.0 and float(bt[-1]) == 0.0 and abs(float(bt[1]) - 0.98235) < 1e-4, str([round(float(v), 5) for v in bt[:3]]))
    fx = artist_comfy.Sampling("flux", max_shift=3.0, base_shift=0.5, w=1664, h=928)
    check("his ModelSamplingFlux at 1664×928: shift 4.26, a quarter of the steps at σ 0.9953", abs(fx.shift - 4.26) < 0.01 and abs(fx.percent_to_sigma(0.25) - 0.99531) < 1e-4,
          f"{fx.shift} {fx.percent_to_sigma(0.25)}")
    kf = artist_comfy.Keyframes(artist_comfy.his_keys(12))
    sig = artist_comfy.schedule(fx, "bong_tangent", 12)
    kf.start(fx, float(sig.max()))
    run_sig = sig.clone()
    run_sig[0] = fx.percent_to_sigma(1e-4)
    got = [round(kf.strength(float(s)), 3) for s in run_sig[:-1]]
    check("his hook keyframes as ComfyUI steps them in pass 1 (measured against comfy/hooks.py)", got == [0.0, 0.4, 1.0, 1.0, 0.86, 0.826, 0.807, 0.802, 0.802, 0.802, 0.802, 0.802], str(got))
    # HERESY 2360: his MAIN CONTROL a working knob: its own keyframes stepped by the same rule, multiplied into the character's
    mk = artist_comfy.Keyframes(artist_comfy.main_keys(artist_comfy.MAIN, 12))
    mk.start(fx, float(sig.max()))
    gm = [mk.strength(float(s)) for s in run_sig[:-1]]
    kf.reset()
    both = artist_comfy.hook_keys({"count": 12, "main": dict(artist_comfy.MAIN)})
    both.start(fx, float(sig.max()))
    gb = [both.strength(float(s)) for s in run_sig[:-1]]
    plain = artist_comfy.hook_keys({"count": 12})
    plain.start(fx, float(sig.max()))
    pr = [plain.strength(float(s)) for s in run_sig[:-1]]
    gp = [round(x, 3) for x in pr]
    check("MAIN CONTROL's keyframes (0 → 1 ease-in, 30 % → 100 %) stepped as ComfyUI steps a group: 0 until they start, rising, never past 1",
          gm[0] == 0.0 and all(b_ >= a_ for a_, b_ in zip(gm, gm[1:])) and 0 < gm[-1] <= 1.0, str([round(x, 4) for x in gm]))
    check("MAIN CONTROL on: the character's keyframes times its envelope at every step; off: the character's alone, ComfyUI's to the bit",
          all(abs(x - c_ * m_) < 1e-9 for x, c_, m_ in zip(gb, pr, gm)) and gp == got and isinstance(both, artist_comfy.Both)
          and sum(gb) < sum(got), str([round(x, 3) for x in gb]))
    check("how the adapters are laid, as today's ComfyUI chooses: dynamic when nothing is hooked, classic under hooks or when fp8 is asked",
          artist_comfy.laying({}) == "dynamic" and artist_comfy.laying({"hook": {"id": "x"}}) == "classic" and artist_comfy.laying({"merge": "fp8"}) == "classic"
          and artist_comfy.laying({"merge": "dynamic", "hook": {"id": "x"}}) == "classic")
    e = [artist_comfy.Entry(torch.ones(1, 5, 8)), artist_comfy.Entry(torch.zeros(1, 7, 8), hooked=True)]
    v1 = artist_comfy.variance(e, 50, 12, 25, 1234)
    v2 = artist_comfy.variance(e, 50, 12, 25, 1234)
    check("the seed variance: the first entry noised until 25 %, the second from there, the same from the same seed",
          torch.equal(v1[0].emb, v2[0].emb) and not torch.equal(v1[0].emb, e[0].emb) and v1[0].end == 0.25 and v1[1].start == 0.25 and v1[1].hooked)
    n1, n2 = artist_comfy.comfy_noise(543175983116770, 116, 208), artist_comfy.comfy_noise(543175983116770, 116, 208)
    check("the starting noise from a ComfyUI seed, [1, 16, 1, h, w], the same twice", n1.shape == (1, 16, 1, 116, 208) and torch.equal(n1, n2))
    check("packed and unpacked: the same latent back", torch.equal(artist_comfy.unpack(artist_comfy.pack(n1), 116, 208), n1))
    x = torch.tensor([[1.0, -1.0, 0.5]])
    cnd, unc = torch.tensor([[2.0, -2.0, 0.1]]), torch.tensor([[1.0, -1.0, 0.4]])
    sk = artist_comfy.skimmed(x, cnd, unc, 4.5, 2.5)
    w = 2.5 / 4.5                                    # worked by hand from the node's rule: both ways round, the third value on the second
    check("Skimmed CFG: where full guidance would push further out the way both lean, the negative's answer moved toward the positive's",
          abs(float(sk[0, 0]) - (2.0 * (1 - w) + 1.0 * w)) < 1e-6 and abs(float(sk[0, 1]) + (2.0 * (1 - w) + 1.0 * w)) < 1e-6
          and abs(float(sk[0, 2]) - (0.1 * (1 - w) + 0.4 * w)) < 1e-6, str(sk))
    # ComfyUI's way of putting adapters into an fp8 painter (measured bit for bit against comfy/float.py and comfy/lora.py on the CPU,
    # 10.11.2026): each layer's seed the CRC-32 of its key, the sum rounded to fp8 by chance, the hooked adapter only while its entry paints
    import zlib
    keys = ["diffusion_model.transformer_blocks.0.img_mod.1.weight", "diffusion_model.transformer_blocks.59.txt_mlp.net.2.weight"]
    check("a layer's seed for its rounding is the CRC-32 of its key, as comfy.utils.string_to_seed",
          [artist_comfy.string_to_seed(k) for k in keys] == [zlib.crc32(k.encode()) for k in keys])
    F8 = torch.float8_e4m3fn
    v = torch.full((256, 256), 0.3, dtype=torch.float16)
    r1, r2, r3 = (artist_comfy.stochastic_fp8(v, F8, sd) for sd in (7, 7, 8))
    vals = sorted({float(x) for x in r1.float().flatten()})
    check("stochastic rounding to fp8: each value one of the two fp8 values around it, 0.3 on average, the same from the same seed",
          vals == [0.28125, 0.3125] and abs(float(r1.float().mean()) - 0.3) < 0.002 and torch.equal(r1.view(torch.uint8), r2.view(torch.uint8))
          and not torch.equal(r1.view(torch.uint8), r3.view(torch.uint8)), str((vals, float(r1.float().mean()))))
    from safetensors.torch import save_file

    class Tiny(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.transformer_blocks = torch.nn.ModuleList([torch.nn.Module()])
            self.transformer_blocks[0].attn = torch.nn.Module()
            self.transformer_blocks[0].attn.to_q = torch.nn.Linear(64, 96)
    tiny = Tiny()
    lin = tiny.transformer_blocks[0].attn.to_q
    torch.manual_seed(3)
    lin.weight.data = (torch.randn_like(lin.weight) * 0.05).to(F8)
    w0 = lin.weight.data.clone()
    up, down = torch.randn(96, 4) * 0.05, torch.randn(4, 64) * 0.05
    save_file({"transformer_blocks.0.attn.to_q.lora_down.weight": down.to(torch.bfloat16), "transformer_blocks.0.attn.to_q.lora_up.weight": up.to(torch.bfloat16),
               "transformer_blocks.0.attn.to_q.alpha": torch.tensor(4.0)}, str(kit / "base.safetensors"))
    save_file({"diffusion_model.transformer_blocks.0.attn.to_q.lora_A.weight": down.to(torch.bfloat16),
               "diffusion_model.transformer_blocks.0.attn.to_q.lora_B.weight": up.to(torch.bfloat16)}, str(kit / "hook.safetensors"))
    lay = artist_comfy.Fp8Lora(tiny, [(kit / "base.safetensors", 0.55)], kit / "hook.safetensors", kind=F8, device="cpu")
    lay.merge(keep=True)
    want = w0.float() + 0.55 * (up.to(torch.bfloat16).float() @ down.to(torch.bfloat16).float())
    step = 2.0 ** (torch.floor(torch.log2(want.abs().clamp_min(2 ** -6))) - 3)
    merged = lin.weight.data.clone()
    lay.s = 0.8
    lay._pre(lin, None)
    hooked = lin.weight.data.clone()
    lay._post(lin, None, None)
    back = torch.equal(lin.weight.data.view(torch.uint8), merged.view(torch.uint8))
    lay.restore()
    check("an adapter laid into an fp8 layer as ComfyUI lays it: within one fp8 step of the sum, the hooked one only while its entry paints, the weights given back",
          lin.weight.dtype == F8 and bool(((merged.float() - want).abs() <= step + 1e-6).all()) and not torch.equal(hooked.view(torch.uint8), merged.view(torch.uint8))
          and back and torch.equal(lin.weight.data.view(torch.uint8), w0.view(torch.uint8)) and lay.counts == [1] and len(lay.hook) == 1)
    # ComfyUI's dynamic VRAM's way: the first pass with the sum unrounded in bfloat16, then the sum rounded with the seed of the layer's name
    lin.weight.data = w0.clone()
    dyn = artist_comfy.Fp8Lora(tiny, [(kit / "base.safetensors", 0.55)], kind=F8, device="cpu")
    dyn.arm_dynamic()
    bf = torch.bfloat16
    xin, b16 = torch.randn(3, 64).to(bf), lin.bias.data.to(bf)
    first_sum = w0.to(bf) + (0.55 * (up.to(bf) @ down.to(bf))).to(bf)
    with torch.inference_mode():
        dyn._dyn_pre(lin, (xin,))
        got1 = torch.nn.functional.linear(xin, lin.weight.data.to(bf), b16)
        dyn._dyn_post(lin, (xin,), got1)
        later = artist_comfy.stochastic_fp8(first_sum, F8, artist_comfy.string_to_seed("diffusion_model.transformer_blocks.0.attn.to_q"))
        check("ComfyUI's dynamic VRAM's way: the first pass with the sum unrounded in bfloat16, then that sum rounded to fp8 with the seed of the layer's name",
              torch.equal(got1, torch.nn.functional.linear(xin, first_sum, b16)) and torch.equal(lin.weight.data.view(torch.uint8), later.view(torch.uint8))
              and not dyn.first)
    dyn.disarm()
    lin.weight.data = w0.clone()
    # the painter's forward in ComfyUI's arithmetic (measured on two of Hyphoria's blocks against ComfyUI's own model on the CPU: equal to
    # the bit, 10.11.2026): on a small Qwen-Image of diffusers' it paints what diffusers' forward paints, within bfloat16's rounding
    from diffusers.models.transformers.transformer_qwenimage import QwenImageTransformer2DModel as DQ

    def small():
        torch.manual_seed(11)
        return DQ(patch_size=2, in_channels=16, out_channels=4, num_layers=2, attention_head_dim=32, num_attention_heads=2, joint_attention_dim=24,
                  axes_dims_rope=(8, 12, 12)).to(torch.bfloat16).eval()
    own, cf = small(), small()
    artist_comfy.comfy_forward(cf)
    torch.manual_seed(12)
    xs, ws, ts = torch.randn(1, 6 * 10, 16).to(torch.bfloat16), torch.randn(1, 9, 24).to(torch.bfloat16), torch.tensor([0.7])
    kw = dict(hidden_states=xs, encoder_hidden_states=ws, encoder_hidden_states_mask=None, timestep=ts, img_shapes=[[(1, 6, 10)]], return_dict=False)
    with torch.inference_mode():
        a, a2, b = cf(**kw)[0].float(), cf(**kw)[0].float(), own(**kw)[0].float()
    rel = float((a - b).pow(2).mean().sqrt() / b.pow(2).mean().sqrt())
    pe = next(iter(cf._heresy_rope.values()))
    check("the painter's forward in ComfyUI's arithmetic: diffusers' picture within bfloat16's rounding, the same twice, the rotary table in bfloat16 for words and picture",
          a.shape == b.shape and rel < 0.05 and torch.equal(a, a2) and pe.dtype == torch.bfloat16 and tuple(pe.shape) == (1, 1, 9 + 60, 16, 2, 2), f"rel {rel:.4f}, table {tuple(pe.shape)}")
finally:
    artist.work = real_work
    shutil.rmtree(kit, ignore_errors=True)
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
