#!/usr/bin/env python3
"""Parity of the frozen text and ABC BPE.

Owns both sides: rebuilds the tokenizer of the reference from the checkpoint
ranks, encodes the torture corpus, runs the GGML harness on the same file,
and requires an exact id stream.
Run from the tests/ directory.

Usage:
    ./test-bpe.py
"""
import base64
import os
import subprocess
import sys
import unicodedata

import numpy as np
import tiktoken

BIN = "../build/test-bpe"
CKPT = "../checkpoints/YuE2-3B"
GGUF = "../models/YuE2-3B-BF16.gguf"
TEXT = "bpe-text.txt"
TMP = "tmp"

PATTERN = (r"(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}|"
           r" ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+")


def reference():
    ranks = {base64.b64decode(t): int(r) for t, r in
             (line.split() for line in open(CKPT + "/qwen.tiktoken", "rb").read().splitlines() if line)}
    if len(ranks) != 151643:
        raise SystemExit("Expected checkpoint-native qwen.tiktoken (151643 ordinary tokens)")
    specials = ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "<R>", "<S>", "<X>", "<mask>", "<sep>"]
    specials += ["<extra_%d>" % i for i in range(200)]
    specials[204:206] = ["<abc>", "</abc>"]
    enc = tiktoken.Encoding("YuE2", pat_str=PATTERN, mergeable_ranks=ranks,
                            special_tokens={s: i + len(ranks) for i, s in enumerate(specials)})
    text = open(TEXT, encoding="utf-8").read()
    return enc.encode_ordinary(unicodedata.normalize("NFC", text))


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP, exist_ok=True)

    ref = reference()
    subprocess.run([BIN, GGUF, TEXT, TMP + "/bpe.bin"], check=True)
    got = np.fromfile(TMP + "/bpe.bin", dtype="float32").astype("int64").tolist()

    if len(ref) != len(got):
        print("[Parity] bpe FAIL size %d vs %d" % (len(ref), len(got)))
        sys.exit(1)
    diff = [i for i in range(len(ref)) if ref[i] != got[i]]
    print("[Parity] bpe: %d ids, %d differing %s" % (len(ref), len(diff), "OK" if not diff else "FAIL"))
    if diff:
        i = diff[0]
        print("[Parity] first difference at %d: ref %d, got %d" % (i, ref[i], got[i]))
    sys.exit(0 if not diff else 1)


main()
