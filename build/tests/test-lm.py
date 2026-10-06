#!/usr/bin/env python3
"""Parity of the backbone autoregressive path, prefill and decode.

Owns both sides: drives the trunk of the checkpoint modeling code directly so
the run stays on the AR weight set, runs the GGML harness on the same prompts,
compares the last token logits and the argmax. Two prompts of different
lengths prefill into their own KV sets and decode in one batched step, which
is the decode path of every generation. The FP16 clamp flag is specified
neutral, so the same cases run again clamped against the same reference.
Run from the tests/ directory.

Usage:
    ./test-lm.py
    GGML_BACKEND=CPU ./test-lm.py
"""
import os
import subprocess
import sys

import numpy as np
import torch

BIN = "../build/test-lm"
CKPT = "../checkpoints/YuE2-3B"
GGUF = "../models/YuE2-3B-BF16.gguf"
TMP = "tmp"
MAX_REL = 2e-2

# EOD, a short English prompt, the empty score slot, then two codec tokens,
# and a shorter prompt with one codec token, so the batch mixes cache lengths
IDS = [151643, 22574, 11, 33897, 2220, 3122, 11, 8205, 2990, 25407, 198, 151847, 151848, 151851, 153087, 161729]
IDS2 = [151643, 22574, 11, 33897, 198, 151847, 151848, 151851, 161729, 153087]
SEQS = [IDS, IDS2]


def report(label, ref, got, max_rel):
    if ref.size != got.size:
        print("[Parity] %s FAIL size %d vs %d" % (label, ref.size, got.size))
        return False
    rel = float(np.sqrt(((ref - got) ** 2).mean()) / (np.sqrt((ref ** 2).mean()) + 1e-20))
    mx = float(np.abs(ref - got).max())
    a, b = int(ref.argmax()), int(got.argmax())
    ok = rel <= max_rel and a == b
    print("[Parity] %s: rel rms %.3e max abs %.3e argmax %d vs %d %s" % (label, rel, mx, a, b, "OK" if ok else "FAIL"))
    return ok


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP, exist_ok=True)

    sys.path.insert(0, CKPT)
    from modeling_yue2 import YuE2ForCausalLM

    model = YuE2ForCausalLM.from_pretrained(CKPT, torch_dtype=torch.float32, local_files_only=True)
    model.eval()

    def logits_of(seq):
        tokens = torch.tensor([seq])
        positions = torch.arange(len(seq))[None]
        hidden, _ = model.model(input_ids=tokens, position_ids=positions, use_cache=False)
        return model.lm_head(hidden[0, -1]).numpy().astype("float32")

    with torch.no_grad():
        # The harness prefills every id but the last, then decodes that one
        ref = [(logits_of(seq[:-1]), logits_of(seq)) for seq in SEQS]

    args = []
    for s, seq in enumerate(SEQS):
        args += (["/"] if s else []) + [str(i) for i in seq]

    ok = True
    for suffix, flags in (("", []), ("-clamp", ["--clamp-fp16"])):
        subprocess.run([BIN, GGUF, TMP + "/lm"] + flags + args, check=True)
        for s in range(len(SEQS)):
            for label, ref_logits in (("lm-prefill", ref[s][0]), ("lm-decode", ref[s][1])):
                got = np.fromfile(TMP + "/lm_%s_%d_logits.bin" % (label[3:], s), dtype="float32")
                ok = report("%s-%d%s" % (label, s, suffix), ref_logits, got, MAX_REL) and ok

    sys.exit(0 if ok else 1)


main()
