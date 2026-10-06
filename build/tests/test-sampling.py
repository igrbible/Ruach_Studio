#!/usr/bin/env python3
"""Parity of the sampling distribution of the two autoregressive stages.

Owns both sides: drives the released distribution() on a seeded logit vector
and a seeded history, runs the GGML harness on the same inputs, compares the
probability vector the draw runs on. The released package is expected as a
sibling clone at ../../YuE.
Run from the tests/ directory.

Usage:
    ./test-sampling.py
"""
import os
import subprocess
import sys

import numpy as np
import torch

BIN = "../build/test-sampling"
YUE = "../../YuE/src"
TMP = "tmp"
MAX_REL = 1e-4

# phase, step index inside the stage
CASES = [("abc", 10), ("semantic", 300)]


def report(label, ref, got, max_rel):
    if ref.size != got.size:
        print("[Parity] %s FAIL size %d vs %d" % (label, ref.size, got.size))
        return False
    rel = float(np.sqrt(((ref - got) ** 2).mean()) / (np.sqrt((ref ** 2).mean()) + 1e-20))
    mx = float(np.abs(ref - got).max())
    ok = rel <= max_rel
    print("[Parity] %s: rel rms %.3e max abs %.3e %s" % (label, rel, mx, "OK" if ok else "FAIL"))
    return ok


# The distribution of one stage plus the inputs it ran on, shared with the
# draw test which needs the same probability vector
def distribution_case(phase, step):
    sys.path.insert(0, YUE)
    from yue2.protocol import CODEC_OFFSET, EOD, VOCAB_SIZE, GenerationConfig
    from yue2.sampling import distribution

    config = GenerationConfig()
    sampling = config.abc if phase == "abc" else config.semantic

    torch.manual_seed(7)
    logits = torch.randn(1, VOCAB_SIZE) * 3.0

    # A history dense enough to fire the frequency penalty inside its window
    generator = torch.Generator().manual_seed(11)
    if phase == "abc":
        history = torch.randint(0, EOD, (160,), generator=generator).tolist()
    else:
        history = (torch.randint(0, 64, (160,), generator=generator) + CODEC_OFFSET).tolist()

    probs = distribution(logits, sampling, history, step, phase).softmax(-1)[0]
    return logits[0].numpy().astype("float32"), np.asarray(history, dtype="int32"), probs.numpy().astype("float32")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP, exist_ok=True)

    ok = True
    for phase, step in CASES:
        logits, history, ref = distribution_case(phase, step)
        logits.tofile(TMP + "/sampling_logits.bin")
        history.tofile(TMP + "/sampling_history.bin")

        subprocess.run([BIN, TMP + "/sampling_logits.bin", TMP + "/sampling_history.bin", str(step), phase,
                        TMP + "/sampling.bin"], check=True)

        got = np.fromfile(TMP + "/sampling.bin", dtype="float32")
        ok = report("sampling-" + phase, ref, got, MAX_REL) and ok

    sys.exit(0 if ok else 1)


main()
