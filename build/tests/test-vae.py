#!/usr/bin/env python3
"""Parity of the Oobleck VAE decoder, plain decode and tiled decode.

Owns both sides: builds the torch reference from the modeling code shipped in
the checkpoint, runs the GGML harness, compares, exits non zero on failure.
The tiled case compares against the torch decode of the whole sequence, so
the halo crop is validated and not merely reproduced.
Run from the tests/ directory.

Usage:
    ./test-vae.py
    GGML_BACKEND=CPU ./test-vae.py
"""
import os
import subprocess
import sys
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

import numpy as np
import torch

BIN = "../build/test-vae"
CKPT = "../checkpoints/YuE2-Vae"
GGUF = "../models/YuE2-Vae-F32.gguf"
TMP = "tmp"
MAX_REL = 1e-2

# label, latent frames, tile core frames (None = single pass)
CASES = [("vae", 64, None), ("vae-tiled", 200, 64)]


def report(label, ref, got, max_rel):
    if ref.size != got.size:
        print("[Parity] %s FAIL size %d vs %d" % (label, ref.size, got.size))
        return False
    rel = float(np.sqrt(((ref - got) ** 2).mean()) / (np.sqrt((ref ** 2).mean()) + 1e-20))
    mx = float(np.abs(ref - got).max())
    ok = rel <= max_rel
    print("[Parity] %s: rel rms %.3e max abs %.3e %s" % (label, rel, mx, "OK" if ok else "FAIL"))
    return ok


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP, exist_ok=True)

    sys.path.insert(0, CKPT)
    from modeling_vae import YuE2VAE

    model = YuE2VAE.from_pretrained(CKPT, decoder_only=True, device="cpu", local_files_only=True)
    model.eval()

    ok = True
    for label, t_latent, core in CASES:
        torch.manual_seed(42)
        latent = torch.randn(1, 64, t_latent)
        with torch.no_grad():
            audio = model.decode(latent)

        # latent time-major [T, 64], audio planar [2, T_audio]
        latent.squeeze(0).T.contiguous().numpy().astype("float32").tofile(TMP + "/latent.bin")
        ref = audio.squeeze(0).contiguous().numpy().astype("float32").ravel()

        args = [BIN, GGUF, TMP + "/latent.bin", str(t_latent), TMP + "/audio.bin"]
        if core is not None:
            args.append(str(core))
        subprocess.run(args, check=True)

        got = np.fromfile(TMP + "/audio.bin", dtype="float32")
        ok = report(label, ref, got, MAX_REL) and ok

    sys.exit(0 if ok else 1)


main()
