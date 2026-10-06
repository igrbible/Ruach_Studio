#!/usr/bin/env python3
"""Parity of the SheetSage2 transcriber, from the waveform to the ABC score.

Owns both sides: synthesizes a deterministic piece (a sung melody over a
chord bed with a kick on every beat), runs the checkpoint in float32 on it
for the probes of every stage, the token stream and the two scores, runs the
GGML harness on the same 24 kHz waveform, compares. The tensors of the
network compare in relative RMS, the tokens and the scores must be identical.
The checkpoints are expected in ../checkpoints, MERT-v2-FullSong beside
SheetSage2.
Run from the tests/ directory.

Usage:
    ./test-sheetsage.py
    GGML_BACKEND=CPU ./test-sheetsage.py
"""
import os
import struct
import subprocess
import sys

import numpy as np
import torch

BIN = "../build/test-sheetsage"
CKPT = "../checkpoints/SheetSage2"
PARENT = "../checkpoints/MERT-v2-FullSong"
GGUF = "../models/SheetSage2-F32.gguf"
TMP = "tmp"
MAX_REL = 5e-2
SAMPLE_RATE = 24000
SECONDS = 24.0
BPM = 96.0

# A melody over the beats, MIDI pitches, one per beat
MELODY = [62, 64, 66, 67, 69, 67, 66, 64, 62, 62, 64, 66, 67, 69, 71, 69, 67, 66, 64, 62, 64, 66, 67, 69,
          71, 72, 71, 69, 67, 66, 64, 62, 62, 64, 66, 67, 69, 67, 66, 64]


def synth_piece():
    n = int(SECONDS * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    beat = 60.0 / BPM
    out = np.zeros(n, dtype=np.float64)
    # sustained chord bed, D major then G major every four beats
    for b in range(int(SECONDS / beat)):
        root = 62 if (b // 4) % 2 == 0 else 67
        s, e = int(b * beat * SAMPLE_RATE), int(min(SECONDS, (b + 1) * beat) * SAMPLE_RATE)
        tt = t[s:e]
        for p in (root - 12, root - 8, root - 5):
            out[s:e] += 0.08 * np.sin(2 * np.pi * 440.0 * 2 ** ((p - 69) / 12) * tt)
        pitch = MELODY[b % len(MELODY)]
        env = np.minimum(1.0, (tt - tt[0]) * 40) * np.exp(-(tt - tt[0]) * 2.5)
        out[s:e] += 0.35 * env * np.sin(2 * np.pi * 440.0 * 2 ** ((pitch - 69) / 12) * tt)
        kick = np.exp(-(tt - tt[0]) * 30) * np.sin(2 * np.pi * 60 * (tt - tt[0]))
        out[s:e] += 0.5 * kick
    # A seeded noise floor keeps every spectral bin above the dB clamp, where
    # pure tones would leave rounding noise to be measured
    out += 1e-3 * np.random.RandomState(7).standard_normal(n)
    return out.astype(np.float32)


def load_dump(path):
    raw = np.fromfile(path, dtype="float32")
    ndim = int(struct.unpack("i", struct.pack("f", raw[0]))[0])
    shape = [int(struct.unpack("i", struct.pack("f", raw[1 + i]))[0]) for i in range(ndim)]
    return raw[1 + ndim:].reshape(shape)


def report(label, ref, got, max_rel):
    if ref.size != got.size:
        print("[Parity] %s FAIL size %d vs %d" % (label, ref.size, got.size))
        return False
    rel = float(np.sqrt(((ref - got) ** 2).mean()) / (np.sqrt((ref ** 2).mean()) + 1e-20))
    mx = float(np.abs(ref - got).max())
    ok = rel <= max_rel
    print("[Parity] %s: rel rms %.3e max abs %.3e %s" % (label, rel, mx, "OK" if ok else "FAIL"))
    return ok


def report_same(label, ref, got):
    ok = ref == got
    print("[Parity] %s: %s" % (label, "identical OK" if ok else "differ FAIL"))
    return ok


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(TMP + "/sheetsage", exist_ok=True)
    from transformers import AutoModel

    audio = synth_piece()
    audio.tofile(TMP + "/sheetsage_audio.bin")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModel.from_pretrained(CKPT, trust_remote_code=True, base_model_path=PARENT,
                                      local_files_only=True).eval().to(device)
    with torch.inference_mode():
        wave = torch.from_numpy(audio)[None].to(device)
        prepared, _ = model._prepare_audio(wave)
        mel = model.encoder.feature_extractor(prepared)[0].cpu().numpy()
        feats = model.get_audio_features(wave, output_hidden_states=True)
    ref = {
        "mel": mel,
        "subsampled": feats.input_hidden_state[0].cpu().numpy(),
        "backbone": feats.backbone_last_hidden_state[0].cpu().numpy(),
        "mixed": feats.mixed_hidden_state[0].cpu().numpy(),
        "memory": feats.encoder_last_hidden_state[0].cpu().numpy(),
    }
    scores = {}
    for melody_only in (False, True):
        result = model.transcribe(audio, sampling_rate=SAMPLE_RATE, dtype="fp32", melody_only=melody_only)
        if result.get("abc_error"):
            print("[Parity] reference ABC unavailable: %s" % result["abc_error"])
            sys.exit(1)
        scores[melody_only] = result["abc"]
        tokens = result["tokens"][0].tolist()

    subprocess.run([BIN, GGUF, TMP + "/sheetsage_audio.bin", TMP + "/sheetsage"], check=True)

    ok = True
    for label in ("mel", "subsampled", "backbone", "mixed", "memory"):
        got = load_dump(TMP + "/sheetsage/%s.bin" % label)
        ok = report("sheetsage-" + label, ref[label].astype("float32").ravel(), got.ravel(), MAX_REL) and ok
    got_tokens = [int(line) for line in open(TMP + "/sheetsage/tokens.txt") if line.strip()]
    ok = report_same("sheetsage-tokens", tokens, got_tokens) and ok
    ok = report_same("sheetsage-abc", scores[False], open(TMP + "/sheetsage/score.abc").read()) and ok
    ok = report_same("sheetsage-abc-melody", scores[True], open(TMP + "/sheetsage/score-melody.abc").read()) and ok
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
