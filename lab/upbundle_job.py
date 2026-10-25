"""HERESY 1583 (Viktor 19.10.2026, after listening to the A/B on Krik's voice: «тройка в среднем и громчайший чистят отдельно в своём
ракурсе… одиночно каждый апскейлер что-то улучшает, а что-то режет на вокале… связка даёт баланс»): the two other upscalers of the
Voice upscale's bundle, on one voice file, on the card the lab gave:

    Apollo-vocal   baicai1145's Apollo trained on 92 hours of voices (CC BY-NC-SA 4.0: non-commercial), through the Apollo model code
                   of JusperLee as ZFTurbo's Music-Source-Separation-Training keeps it; 44.1 kHz, ten-second pieces
    FlashSR        Jaekwon Im's one-step audio super-resolution (his code MIT, the weights Apache 2.0, as he stated on 20.10.2026:
                   jakeoneijk/FlashSR_Inference issue 1); 48 kHz, its fixed 5.12-second pieces

Neither is shipped with the studio's code. Apollo-vocal and its model code come with the studio's models (goldhub/Ruach_Studio_Models_v2,
models/upbundle/apollo/, as its licence lets them be shared), or from their authors when an install lacks them. FlashSR comes on first
use: its weights from the studio's own copy (the same repository at its pin, models/upbundle/flashsr/weights/; HERESY 1611), else from
him, and its code from him at a pinned revision (it carries third-party parts under their own terms, so it is not copied). Each piece joins the next by an equal-power crossfade of a second (half a second for
FlashSR). Both come back at 48 kHz, whole, as they drew it: the Voice upscale keeps the original below its cut and blends the top.

    upbundle_job.py AUDIO OUTDIR [apollo,flashsr]      one line of JSON: the files, the seconds each took
"""
import io
import json
import math
import os
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample_poly

STUDIO = Path(__file__).resolve().parent.parent
HOME = STUDIO / "models" / "upbundle"
MSST_SHA = "6fdad13686bb7e84d029ec66f9dbe76e65c93ebf"            # ZFTurbo/Music-Source-Separation-Training: the Apollo model code
FLASH_SHA = "2292814a7ef74f61a5479c8d96e653d2f90f369d"           # jakeoneijk/FlashSR_Inference
APOLLO_REPO, APOLLO_REV = "baicai1145/Apollo-vocal-msst", "b4646cdc4081d90f0df3839838c198c33b95b620"
FLASH_REPO, FLASH_REV = "jakeoneijk/FlashSR_weights", "5701dea5f6a45ed964f5cb5b9280b3a1f9b39882"
OWN_REPO = "goldhub/Ruach_Studio_Models_v2"                     # HERESY 1611: FlashSR's weights kept beside the studio's other models
FLASH_FILES = ("student_ldm.pth", "sr_vocoder.pth", "vae.pth")


def fetch(url, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def apollo_code():
    """The model's two files at the pinned revision, a package of their own."""
    d = HOME / "apollo" / "look2hear"
    if (d / "apollo.py").is_file() and (d / "base_model.py").is_file():
        return d.parent
    d.mkdir(parents=True, exist_ok=True)
    base = f"https://raw.githubusercontent.com/ZFTurbo/Music-Source-Separation-Training/{MSST_SHA}/models/look2hear/models/"
    for f in ("apollo.py", "base_model.py"):
        (d / f).write_bytes(fetch(base + f))
    (d / "__init__.py").write_text("", encoding="utf-8")
    (d.parent / "SOURCE.txt").write_text("Apollo model code (JusperLee/Apollo, CC BY-SA 4.0) as kept in ZFTurbo/Music-Source-Separation-Training "
                                         f"(MIT), revision {MSST_SHA}\n", encoding="utf-8")
    return d.parent


def flash_code():
    d = HOME / "flashsr"
    if (d / "FlashSR" / "FlashSR.py").is_file():
        return d
    raw = fetch(f"https://codeload.github.com/jakeoneijk/FlashSR_Inference/tar.gz/{FLASH_SHA}", timeout=600)
    d.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as t:
        for m in t.getmembers():
            parts = m.name.split("/", 1)
            if len(parts) < 2 or not parts[1] or parts[1].startswith("Assets/") or ".." in parts[1]:
                continue
            m.name = parts[1]
            t.extract(m, d)
    (d / "SOURCE.txt").write_text(f"FlashSR inference code by Jaekwon Im, jakeoneijk/FlashSR_Inference revision {FLASH_SHA}: his code MIT, "
                                  "the parts from Diffusers, AudioSR and BigVGAN under their own licences (as he stated on 20.10.2026, "
                                  "issue 1); fetched from its author\n", encoding="utf-8")
    return d


def own_pin(repo):
    """The studio's pinned revision of one of its repositories (heresy/hf-revisions.txt), «main» without one."""
    try:
        for line in (STUDIO / "heresy" / "hf-revisions.txt").read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0] == repo:
                return parts[1]
    except OSError:
        pass
    return "main"


def flash_weights():
    """HERESY 1611: the folder FlashSR's three weights are in: the studio's own copy (fetched into models/upbundle/flashsr/weights/
    at the pin on first use), else its author's dataset at its pinned revision, as before; why the first did not come is said."""
    own = HOME / "flashsr" / "weights"
    if all((own / n).is_file() for n in FLASH_FILES):
        return own
    from huggingface_hub import hf_hub_download, snapshot_download
    try:
        for n in FLASH_FILES:
            hf_hub_download(OWN_REPO, "models/upbundle/flashsr/weights/" + n, revision=own_pin(OWN_REPO), local_dir=str(STUDIO))
        return own
    except Exception as e:  # noqa: BLE001 - offline, a pin before 1611: the author's copy is the same bytes
        print(f"FlashSR: the studio's copy of the weights did not come ({type(e).__name__}: {e}); from its author", file=sys.stderr)
        return Path(snapshot_download(FLASH_REPO, repo_type="dataset", revision=FLASH_REV))


def crossfade_chunks(x, length, overlap, run):
    """x (channels, n): pieces of `length` with `overlap`, each through run(piece) -> same shape, joined by equal-power crossfades."""
    n = x.shape[1]
    out = np.zeros_like(x, dtype=np.float64)
    fade = np.sin(np.linspace(0, math.pi / 2, overlap)) ** 2
    s = 0
    while s < n:
        e = min(n, s + length)
        piece = np.zeros((x.shape[0], length), np.float32)
        piece[:, : e - s] = x[:, s:e]
        y = run(piece)[:, : e - s]
        if s > 0:
            k = min(overlap, e - s)
            y[:, :k] = out[:, s:s + k] * (1 - fade[:k]) + y[:, :k] * fade[:k]
        out[:, s:e] = y
        if e == n:
            break
        s += length - overlap
    return out


def apollo(x48):
    from huggingface_hub import hf_hub_download
    sys.path.insert(0, str(apollo_code()))
    from look2hear.apollo import Apollo
    own = HOME / "apollo" / "model_apollo_vocals_ep_54.ckpt"   # from the studio's own v2 (fetch-heresy.sh), else from its author
    ckpt = str(own) if own.is_file() else hf_hub_download(APOLLO_REPO, "model_apollo_vocals_ep_54.ckpt", revision=APOLLO_REV)
    m = Apollo(sr=44100, win=20, feature_dim=384, layer=8)
    sd = torch.load(ckpt, map_location="cpu", weights_only=False)
    sd = sd.get("state_dict", sd) if isinstance(sd, dict) else sd
    m.load_state_dict(sd)
    m = m.to("cuda").eval()
    x = resample_poly(x48, 147, 160, axis=1)

    def run(piece):
        with torch.no_grad():
            return m(torch.from_numpy(piece)[None].to("cuda")).float().cpu().numpy()[0]
    y = crossfade_chunks(x, 441000, 44100, run)
    del m
    torch.cuda.empty_cache()
    return resample_poly(y, 160, 147, axis=1)[:, : x48.shape[1]]


def flashsr(x48):
    sys.path.insert(0, str(flash_code()))
    from FlashSR.FlashSR import FlashSR
    w = flash_weights()
    m = FlashSR(str(w / "student_ldm.pth"), str(w / "sr_vocoder.pth"), str(w / "vae.pth")).to("cuda").eval()

    def run(piece):
        with torch.no_grad():
            return m(torch.from_numpy(piece).to("cuda"), lowpass_input=False).float().cpu().numpy().reshape(piece.shape[0], -1)
    y = crossfade_chunks(x48.astype(np.float32), 245760, 24000, run)
    del m
    torch.cuda.empty_cache()
    return y


def main():
    t0 = time.time()
    audio, outdir = Path(sys.argv[1]), Path(sys.argv[2])
    which = (sys.argv[3] if len(sys.argv) > 3 else "apollo,flashsr").split(",")
    x, sr = sf.read(str(audio), dtype="float64", always_2d=True)
    if sr != 48000:
        g = math.gcd(int(sr), 48000)
        x = resample_poly(x, 48000 // g, int(sr) // g, axis=0)
    x48 = x.T.copy()
    files, took = [], {}
    for name, fn in (("apollo", apollo), ("flashsr", flashsr)):
        if name not in which:
            continue
        t1 = time.time()
        try:
            y = fn(x48)
        except (OSError, urllib.error.URLError) as e:
            raise SystemExit(f"{name}: its code or weights could not be fetched from its author ({e}); the bundle needs the network once")
        sf.write(str(outdir / f"{name}.flac"), y.T.astype(np.float32), 48000, subtype="PCM_24")
        files.append({"name": name, "file": f"{name}.flac"})
        took[name] = round(time.time() - t1, 1)
    print(json.dumps({"files": files, "took": took, "seconds": round(x48.shape[1] / 48000, 2), "total": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
