"""HERESY 2276 (Viktor 09.11.2026: SeedVR2 as an image upscaler in the Artist room, beside the ESRGAN models of «Upscale in passes», the quant
picked by the card's free memory, so the Artist and the Videographer share one grain): SeedVR2's weights in models/misc/seedvr2 as grains, the
best first. 7B sharp (the Videographer's own) in every precision comes before 3B, so a still and a shot are made larger by one model where the
card allows it; 3B only where no 7B sharp fits. The community quants (Apache-2.0 as SeedVR2 itself): numz/SeedVR2_comfyUI (fp16, 3B fp8),
AInVFX/SeedVR2_comfyUI (7B sharp fp8 with block 35 in fp16, GGUF Q4_K_M and 3B Q8_0), cmeka/SeedVR2-GGUF (7B sharp Q6_K); heresy/fetch-heresy.sh
fetches them from our own HF repos. The runtime is lab/seedvr2rt (numz's CLI, which reads .safetensors fp16/fp8 and .gguf).

need_mb is what a still takes of a card at the most (its output at most CAP_PX), the DiT and the VAE each put back in RAM after its phase:
ESTIMATED from the weights' size and the 29.10 video measures, not yet measured on a still (the cards were busy on 09.11); a grain that runs out
of memory anyway is followed by the next one (artist_upscale.seedvr2)."""
import os
import subprocess
import sys
from pathlib import Path

import paths                                             # HERESY 2330: where the weights live

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
RT = HERE / "seedvr2rt"
VAE = "ema_vae_fp16.safetensors"
NAME = "SeedVR2"                                          # its name among the Artist's upscalers (no file of models/artist/upscalers/ has it)
CAP_PX = 16 * 10 ** 6                                     # the most SeedVR2 makes of a still (4096²); a pass larger than that lands by its resample
GRAINS = [  # file, label, need_mb (estimated), blocks in RAM
    ("seedvr2_ema_7b_sharp_fp16.safetensors", "7B sharp · fp16", 20500, 0),
    ("seedvr2_ema_7b_sharp_fp16.safetensors", "7B sharp · fp16 · swap 16", 13500, 16),
    ("seedvr2_ema_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors", "7B sharp · fp8", 11500, 0),
    ("seedvr2_ema_7b_sharp-Q6_K.gguf", "7B sharp · Q6_K", 10000, 0),
    ("seedvr2_ema_7b_sharp-Q4_K_M.gguf", "7B sharp · Q4_K_M", 8000, 0),
    ("seedvr2_ema_3b_fp16.safetensors", "3B · fp16", 9500, 0),
    ("seedvr2_ema_3b-Q8_0.gguf", "3B · Q8_0", 6500, 0),
    ("seedvr2_ema_3b_fp8_e4m3fn.safetensors", "3B · fp8", 6200, 0),
    ("seedvr2_ema_3b-Q4_K_M.gguf", "3B · Q4_K_M", 4800, 0),
]


def model_dir(kit=KIT):
    return paths.at(paths.SEEDVR2, kit)


def present(kit=KIT):
    """The grains whose weights are here (and the VAE and the runtime), the best first: [{file, label, need_mb, swap, mb}]."""
    d = model_dir(kit)
    if not (d / VAE).is_file() or not (RT / "inference_cli.py").is_file():
        return []
    out = []
    for f, label, need, swap in GRAINS:
        p = d / f
        if p.is_file():
            out.append({"file": f, "label": label, "need_mb": need, "swap": swap, "mb": round(p.stat().st_size / 2 ** 20, 1)})
    return out


def least_mb(kit=KIT):
    """The least a card must have free for any grain here; 0 when SeedVR2 is not here."""
    g = present(kit)
    return min(x["need_mb"] for x in g) if g else 0


def pick(free_mb, kit=KIT, below=None):
    """The best grain that fits free_mb (below: only those after that one, for a grain that ran out of memory); None when none fits."""
    g = present(kit)
    if below is not None:
        k = next((i for i, x in enumerate(g) if x["file"] == below["file"] and x["swap"] == below["swap"]), len(g))
        g = g[k + 1:]
    return next((x for x in g if x["need_mb"] <= free_mb), None)


def free_mb():
    """The free memory of the card this process sees (CUDA_VISIBLE_DEVICES), 0 when torch cannot say."""
    try:
        import torch
        f, _ = torch.cuda.mem_get_info()
        return int(f / 2 ** 20)
    except Exception:  # noqa: BLE001  (no card, no torch: no grain fits, and the caller says so)
        return 0


def run_still(src_png, out_dir, grain, short_side, long_cap=0, seed=42, kit=KIT, log=None):
    """One still through SeedVR2 at the grain: its short side to short_side (the long side at most long_cap), into out_dir/<its name>.png.
    Returns (the return code, the tail of its log). The DiT and the VAE go back to RAM after their phases; the VAE in tiles."""
    cmd = [sys.executable, "-u", "inference_cli.py", str(src_png), "--output", str(out_dir), "--output_format", "png", "--model_dir", str(model_dir(kit)),
           "--dit_model", grain["file"], "--resolution", str(int(short_side)), "--batch_size", "1", "--seed", str(int(seed)), "--color_correction", "lab",
           "--vae_encode_tiled", "--vae_decode_tiled", "--dit_offload_device", "cpu", "--vae_offload_device", "cpu"]
    if long_cap:
        cmd += ["--max_resolution", str(int(long_cap))]
    if grain.get("swap"):
        cmd += ["--blocks_to_swap", str(grain["swap"])]
    env = dict(os.environ, HF_HUB_OFFLINE="1", PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True")
    p = subprocess.run(cmd, cwd=str(RT), env=env, capture_output=True, text=True)
    tail = (p.stdout or "")[-6000:] + (p.stderr or "")[-6000:]
    if log:
        log(tail)
    return p.returncode, tail
