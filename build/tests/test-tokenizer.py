#!/usr/bin/env python3
"""Parity of the audio tokenizer, from the waveform to the semantic codes.

Owns both sides: synthesizes the deterministic piece of the SheetSage2
harness over 70 s, three MERT chunks of which the last is short, runs the
recipe of the tokenizer scripts in float32 on it (MERT-v2-FullSong layer
20 per 30 s chunk, linear resampling onto 25 Hz, instance norm, the head
over windows of 512 frames hopping by 256), runs the GGML harness on the
same 24 kHz waveform, compares. The features compare in relative RMS, the
codes by the share of frames that agree.
The checkpoints are expected in ../checkpoints.
Run from the tests/ directory.

Usage:
    ./test-tokenizer.py
    ./test-tokenizer.py --device CPU
"""
import importlib
import os
import subprocess
import sys

import numpy as np
import torch
import torch.nn as nn

BIN = "../build/test-tokenizer"
# A leading "--device <name>" is forwarded to the harness
DEVICE = ["--device", sys.argv[2]] if sys.argv[1:2] == ["--device"] else []
MERT = "../checkpoints/MERT-v2-FullSong"
HEAD = "../checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/tokenizer_head_joint_v9.safetensors"
GGUF = "../models/yue2-mothersuperior-realaudio-tokenizer-v4-F32.gguf"
TMP = "tmp"
MAX_REL = 5e-2
MIN_AGREE = 0.95
SAMPLE_RATE = 24000
SECONDS = 70.0
WIN, D, L, H, VOCAB = 512, 512, 8, 8, 32768


class Head(nn.Module):
    def __init__(s):
        super().__init__()
        s.inp = nn.Linear(1024, D)
        s.pos = nn.Parameter(torch.zeros(1, WIN, D))
        layer = nn.TransformerEncoderLayer(D, H, 4 * D, dropout=0.0, batch_first=True, norm_first=True,
                                           activation="gelu")
        s.enc = nn.TransformerEncoder(layer, L, enable_nested_tensor=False)
        s.norm = nn.LayerNorm(D)
        s.head = nn.Linear(D, VOCAB)

    def forward(s, x):
        return s.head(s.norm(s.enc(s.inp(x) + s.pos[:, :x.shape[1]])))


def reference(audio):
    from safetensors.torch import load_file
    from transformers import AutoModel
    mert = AutoModel.from_pretrained(MERT, trust_remote_code=True, local_files_only=True).eval()
    chunk = SAMPLE_RATE * 30
    frames = []
    with torch.inference_mode():
        for s in range(0, len(audio), chunk):
            c = audio[s:s + chunk]
            if len(c) >= SAMPLE_RATE:
                frames.append(mert(torch.from_numpy(c)[None], output_hidden_states=True).hidden_states[20][0])
        hidden = torch.cat(frames, 0)
        T = int(round(len(audio) / SAMPLE_RATE * 25))
        hidden = torch.nn.functional.interpolate(hidden.T[None], size=T, mode="linear", align_corners=False)[0].T
    x = hidden.numpy().astype(np.float32)
    x = (x - x.mean(0)) / (x.std(0) + 1e-5)
    head = Head()
    head.load_state_dict(load_file(HEAD))
    head.eval()
    codes = np.zeros(T, dtype=np.int64)
    starts = list(range(0, max(1, T - WIN + 1), WIN // 2))
    if starts[-1] + WIN < T:
        starts.append(max(0, T - WIN))
    with torch.inference_mode():
        for s0 in starts:
            xw = x[s0:s0 + WIN]
            n = len(xw)
            if n < WIN:
                xw = np.pad(xw, ((0, WIN - n), (0, 0)))
            pred = head(torch.from_numpy(xw)[None])[0, :n].argmax(-1).numpy()
            lo = s0 + (0 if s0 == 0 else WIN // 4)
            hi = s0 + n - (0 if s0 + n >= T else WIN // 4)
            codes[lo:hi] = pred[lo - s0:hi - s0]
    return x, codes


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP + "/tokenizer", exist_ok=True)
    sys.dont_write_bytecode = True
    sheetsage = importlib.import_module("test-sheetsage")
    sheetsage.SECONDS = SECONDS
    audio = sheetsage.synth_piece()
    audio.tofile(TMP + "/tokenizer_audio.bin")

    features, codes = reference(audio)
    subprocess.run([BIN] + DEVICE + [GGUF, TMP + "/tokenizer_audio.bin", TMP + "/tokenizer"], check=True)

    got = sheetsage.load_dump(TMP + "/tokenizer/tokenizer-mert.bin")
    mean = got.mean(0)
    std = got.std(0)
    ok = sheetsage.report("tokenizer-features", features.ravel(), ((got - mean) / (std + 1e-5)).ravel(), MAX_REL)
    got_codes = sheetsage.load_dump(TMP + "/tokenizer/tokenizer-codes.bin").ravel().astype(np.int64)
    agree = float((got_codes == codes).mean()) if got_codes.size == codes.size else 0.0
    passed = agree >= MIN_AGREE
    print("[Parity] tokenizer-codes: %d frames, %.4f agree %s" % (codes.size, agree, "OK" if passed else "FAIL"))
    sys.exit(0 if ok and passed else 1)


if __name__ == "__main__":
    main()
