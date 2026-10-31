"""HERESY 1876b: one card's upscale: SeedVR2 (lab/seedvr2rt) over a job folder's in/ (its shots' videos), the model loaded once and kept for all of
them, into out/; done.json with its return code and time. Run by lab/upscale_shots.py in the Artist's environment:
    .venv-art/bin/python lab/upscale_job.py user/videos/.sr/NAME--STAMP-gpuN"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
sys.path.insert(0, str(HERE))
import upscale_shots as us  # noqa: E402

jd = Path(sys.argv[1])
job = json.loads((jd / "job.json").read_text(encoding="utf-8"))
m = us.MODELS[job["model"]]
cmd = [sys.executable, "-u", "inference_cli.py", str(jd / "in"), "--output", str(jd / "out"), "--model_dir", str(KIT / "models/seedvr2"),
       "--dit_model", m["dit"], "--resolution", str(job["res"]), "--batch_size", "21", "--video_backend", "ffmpeg", "--color_correction", "lab",
       "--vae_decode_tiled", "--cache_dit", "--cache_vae"]
if job["res"] > 1080:
    cmd += ["--vae_encode_tiled"]
if m["swap"]:
    cmd += ["--blocks_to_swap", str(m["swap"]), "--dit_offload_device", "cpu"]
env = dict(os.environ, CUDA_DEVICE_ORDER="PCI_BUS_ID", CUDA_VISIBLE_DEVICES=str(job["gpu"]), HF_HUB_OFFLINE="1", PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True")
t0 = time.time()
p = subprocess.run(cmd, cwd=str(us.RT), env=env)
made = sorted(x.name for x in (jd / "out").glob("*.mp4"))
err = "" if p.returncode == 0 else ("out of memory" if "out of memory" in (jd / "log").read_text(encoding="utf-8", errors="replace")[-20000:].lower() else f"SeedVR2 stopped ({p.returncode})")
(jd / "done.json").write_text(json.dumps({"rc": p.returncode, "took_s": round(time.time() - t0, 1), "made": made, "error": err}), encoding="utf-8")
