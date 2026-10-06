#!/usr/bin/env python3
"""Parity of the token draw against torch.multinomial at equal seed.

Owns both sides: rebuilds the semantic distribution of the released sampler,
draws a run of tokens on the CUDA generator the release targets, runs the
GGML harness on the same probability vector, and requires the same ids.
The released package is expected as a sibling clone at ../../YuE.
Run from the tests/ directory.

Usage:
    ./test-draw.py
"""
import os
import subprocess
import sys

import numpy as np
import torch

BIN = "../build/test-draw"
YUE = "../../YuE/src"
TMP = "tmp"
SEED = 831001
DRAWS = 512
STEP = 300


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP, exist_ok=True)

    sys.path.insert(0, YUE)
    from yue2.protocol import CODEC_OFFSET, VOCAB_SIZE, GenerationConfig
    from yue2.sampling import distribution

    # The same semantic distribution the sampling test checks, drawn from here
    torch.manual_seed(7)
    logits = torch.randn(1, VOCAB_SIZE) * 3.0
    generator = torch.Generator().manual_seed(11)
    history = (torch.randint(0, 64, (160,), generator=generator) + CODEC_OFFSET).tolist()
    probs = distribution(logits, GenerationConfig().semantic, history, STEP, "semantic").softmax(-1)[0]

    probs.numpy().astype("float32").tofile(TMP + "/draw_probs.bin")

    cuda_probs = probs.cuda()
    cuda_gen = torch.Generator(device="cuda").manual_seed(SEED)
    ref = [int(torch.multinomial(cuda_probs, 1, generator=cuda_gen)[0]) for _ in range(DRAWS)]

    subprocess.run([BIN, TMP + "/draw_probs.bin", str(SEED), str(DRAWS), TMP + "/draw.bin"], check=True)
    got = np.fromfile(TMP + "/draw.bin", dtype="float32").astype("int64").tolist()

    if len(ref) != len(got):
        print("[Parity] draw FAIL size %d vs %d" % (len(ref), len(got)))
        sys.exit(1)
    diff = [i for i in range(len(ref)) if ref[i] != got[i]]
    print("[Parity] draw: %d draws, %d distinct ids, %d differing %s"
          % (len(ref), len(set(ref)), len(diff), "OK" if not diff else "FAIL"))
    sys.exit(0 if not diff else 1)


main()
