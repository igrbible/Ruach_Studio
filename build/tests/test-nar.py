#!/usr/bin/env python3
"""Parity of the backbone flow matching path, one velocity and the whole ODE.

Owns both sides: drives CachedNAR of the released implementation on seeded
states, runs the GGML harness on the same prefix and the same states,
compares. A case with several variations evaluates them in one graph on the
GGML side and one by one on the torch side. The FP16 clamp flag is specified
neutral, so every case runs again clamped against the same reference.
The released package is expected as a sibling clone at ../../YuE.
Run from the tests/ directory.

Usage:
    ./test-nar.py
    GGML_BACKEND=CPU ./test-nar.py
"""
import os
import subprocess
import sys

import numpy as np
import torch

BIN = "../build/test-nar"
CKPT = "../checkpoints/YuE2-3B"
GGUF = "../models/YuE2-3B-BF16.gguf"
YUE = "../../YuE/src"
TMP = "tmp"
MAX_REL = 5e-2

# The AR prefix the flow matching attends to, ending on the music end token
IDS = [151643, 22574, 11, 33897, 2220, 3122, 11, 8205, 2990, 25407, 198, 151847, 151848, 151851, 153087, 161729, 151852]

# label, latent frames, variations, mode, mode argument (raw timestep or step count)
CASES = [("nar", 24, 1, "velocity", 0.35), ("nar-ode", 8, 1, "solve", 8), ("nar-batch", 24, 3, "velocity", 0.35),
         ("nar-ode-batch", 8, 2, "solve", 8)]


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

    sys.path.insert(0, YUE)
    from yue2.modeling_yue2 import YuE2ForCausalLM
    from yue2.nar import CachedNAR, Chunk

    model = YuE2ForCausalLM.from_pretrained(CKPT, torch_dtype=torch.float32, local_files_only=True)
    model.eval()

    np.asarray(IDS, dtype="int32").tofile(TMP + "/nar_ids.bin")

    ok = True
    for label, t_lat, m, mode, arg in CASES:
        torch.manual_seed(42)
        states = torch.randn(m, t_lat, 64)
        states.numpy().astype("float32").tofile(TMP + "/nar_xt.bin")

        # solve reads its initial state from the chunk, velocity takes it as argument
        refs = []
        for state in states:
            engine = CachedNAR(model, Chunk(ar_tokens=IDS, noise=state))
            with torch.no_grad():
                result = engine.solve(arg) if mode == "solve" else engine.velocity(state, arg)
            refs.append(result.float().numpy().astype("float32").ravel())
        ref = np.concatenate(refs)

        for suffix, flags in (("", []), ("-clamp", ["--clamp-fp16"])):
            subprocess.run([BIN, GGUF, TMP + "/nar_ids.bin", TMP + "/nar_xt.bin", str(t_lat), str(m), mode, str(arg),
                            TMP + "/nar.bin"] + flags, check=True)
            got = np.fromfile(TMP + "/nar.bin", dtype="float32")
            ok = report(label + suffix, ref, got, MAX_REL) and ok

    sys.exit(0 if ok else 1)


main()
