#!/usr/bin/env python3
"""Parity of the PyTorch CPU generator the acoustic noise comes from.

Owns both sides: draws the reference stream on a seeded CPU generator, runs
the GGML harness on the same seed and count, compares. The uniform stream is
exact, the normal one carries the Box-Muller rounding.
Run from the tests/ directory.

Usage:
    ./test-rng.py
"""
import os
import subprocess
import sys

import numpy as np
import torch

BIN = "../build/test-rng"
TMP = "tmp"

# kind, seed, count, tolerance
CASES = [("uniform", 42, 4096, 0.0), ("normal", 1234, 12864, 1e-5)]


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

    ok = True
    for kind, seed, count, tol in CASES:
        generator = torch.Generator(device="cpu").manual_seed(seed)
        draw = torch.rand if kind == "uniform" else torch.randn
        ref = draw((count,), dtype=torch.float32, device="cpu", generator=generator).numpy().astype("float32")

        subprocess.run([BIN, str(seed), str(count), kind, TMP + "/rng.bin"], check=True)

        got = np.fromfile(TMP + "/rng.bin", dtype="float32")
        ok = report("rng-" + kind, ref, got, tol) and ok

    sys.exit(0 if ok else 1)


main()
