#!/usr/bin/env python3
"""GGML vs Python cosine similarity comparison for the YuE2 acoustic stack.

Run from tests/ directory. All paths relative to CWD.

The GGML side runs the full yue-synth pipeline with --dump on a request that
carries its semantic stream, so the autoregression reduces to one prefill.
The Python side reloads the dumped AR sequence and initial noise, prefills
the reference backbone (../../YuE, CUDA float32) into a CachedNAR, then walks
the same midpoint schedule with probes mirroring the GGML names, and decodes
the latents with the reference VAE. Sharing the sequence and the noise
isolates the prefill, the flow matching stack and the decoder from the
stochastic AR stage, whose logits and draws are covered by the parity tests.

Usage:
    cd tests/
    ./debug-nar-cossim.py                   # backbone BF16
    ./debug-nar-cossim.py --quant Q6_K      # backbone Q6_K

Backend follows GGML_BACKEND; the archive loop lives in debug-nar-cossim.sh.
"""
import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import warnings

import numpy as np

warnings.filterwarnings("ignore", category=FutureWarning)

SEED = 42
KEY_LAYERS = [0, 7, 14, 21, 27]


def save_dump(path, data):
    import torch

    if isinstance(data, torch.Tensor):
        data = data.detach().float().cpu().numpy()
    data = np.ascontiguousarray(data.astype(np.float32))
    shape = data.shape
    header = struct.pack("i", len(shape))
    for s in shape:
        header += struct.pack("i", s)
    with open(path, "wb") as f:
        f.write(header)
        f.write(data.tobytes())


def load_dump(path):
    raw = np.fromfile(path, dtype=np.float32)
    ndim = int(struct.unpack("i", struct.pack("f", raw[0]))[0])
    shape = [int(struct.unpack("i", struct.pack("f", raw[1 + i]))[0]) for i in range(ndim)]
    data = raw[1 + ndim:]
    return data, shape


def _cos_flat(a, b):
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    a, b = a[:n], b[:n]
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / d) if d > 1e-10 else 0.0


def cos(a, b, shape_a=None, shape_b=None):
    if shape_a and shape_b and len(shape_a) == 2 and len(shape_b) == 2:
        if shape_a[0] == shape_b[1] and shape_a[1] == shape_b[0]:
            ra = a.reshape(shape_a)
            rb = b.reshape(shape_b)
            c_normal = _cos_flat(ra.flatten(), rb.flatten())
            c_transposed = _cos_flat(ra.T.flatten(), rb.flatten())
            if c_transposed > c_normal:
                return c_transposed
            return c_normal
    return _cos_flat(a, b)


def stft_cos(a, b, win=2048, hop=512):
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    window = np.hanning(win)
    frames = (n - win) // hop + 1
    sa = np.zeros((frames, win // 2 + 1))
    sb = np.zeros((frames, win // 2 + 1))
    for i in range(frames):
        s = i * hop
        sa[i] = np.abs(np.fft.rfft(a[s:s + win] * window))
        sb[i] = np.abs(np.fft.rfft(b[s:s + win] * window))
    return _cos_flat(sa.flatten(), sb.flatten())


# GGML runner

def run_ggml(dump_dir, req, quant):
    ggml_bin = "../build/yue-synth"
    if not os.path.isfile(ggml_bin):
        print(f"[GGML] binary not found: {ggml_bin}")
        return False
    os.makedirs(dump_dir, exist_ok=True)

    merged = dict(req)
    merged["seed"] = SEED
    merged["lm_seed"] = SEED
    merged["output_format"] = "wav16"

    request_json = os.path.join(dump_dir, "request0.json")
    with open(request_json, "w") as f:
        json.dump(merged, f, indent=4)

    model = f"../models/YuE2-3B-{quant}.gguf"
    cmd = [ggml_bin, "--model", model, "--vae", "../models/YuE2-Vae-F32.gguf", "--request", request_json,
           "--dump", dump_dir, "--out", os.path.join(dump_dir, "output.wav")]
    print(f"[GGML] Running YuE2-3B-{quant}.gguf...")
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=None, text=True)
    n = len([f for f in os.listdir(dump_dir) if f.endswith(".bin")])
    if r.returncode != 0:
        print(f"[GGML] FAILED (exit {r.returncode})")
        return False
    print(f"[GGML] Done, {n} dump files")
    return True


# Python runner

def run_python(dump_dir, ggml_dir, req):
    sys.path.insert(0, "../../YuE/src")
    sys.path.insert(0, "../checkpoints/YuE2-Vae")
    import torch
    import torch.nn.functional as F
    from yue2.modeling_yue2 import YuE2ForCausalLM
    from yue2.nar import CachedNAR, Chunk
    from modeling_vae import YuE2VAE

    os.makedirs(dump_dir, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    ids_raw, _ = load_dump(os.path.join(ggml_dir, "ar_ids.bin"))
    noise_raw, noise_shape = load_dump(os.path.join(ggml_dir, "noise.bin"))
    ids = [int(v) for v in ids_raw]
    noise = torch.from_numpy(noise_raw.reshape(noise_shape))  # [T, 64]
    T = noise_shape[0]
    steps = int(req.get("steps", 32))

    print(f"[Python] Initializing backbone on {device} (prefix={len(ids)}, T={T}, {steps} steps)...")
    model = YuE2ForCausalLM.from_pretrained("../checkpoints/YuE2-3B", dtype=torch.float32,
                                            local_files_only=True)
    model.eval().to(device)
    engine = CachedNAR(model, Chunk(ar_tokens=ids, noise=noise))

    _dumps = {}

    # The velocity of CachedNAR with the probes of the first evaluation
    def velocity(state, raw_t, probe):
        x_nar = F.pad(state, (0, 0, 1, 1))
        shifted = model._shift_t_value(raw_t, engine.device, engine.dtype)
        temb = model.time_embedder(shifted.expand(engine.nar_length))[None]
        x = model.vae2llm(x_nar[None]) + temb + engine.pos_emb
        if probe:
            _dumps["temb_t"] = temb[0, 0]
            _dumps["hidden_after_input"] = x[0]
        for li, (layer, (ar_k, ar_v)) in enumerate(zip(model.model.layers, engine.cache)):
            q, k, v = layer.nar_self_attn.project_qkv(layer.nar_input_layernorm(x), engine.cos, engine.sin)
            k, v = torch.cat((ar_k, k[0])), torch.cat((ar_v, v[0]))
            h = layer.nar_self_attn.o_proj(engine._attention(q[0], k, v).flatten(1)[None])
            if probe and li == 0:
                _dumps["layer0_sa_output"] = h[0]
            x = x + h
            x = x + layer.nar_mlp(layer.nar_pre_mlp_layernorm(x))
            if probe and li in KEY_LAYERS:
                _dumps[f"hidden_after_layer{li}"] = x[0]
        return model.llm2vae(model.model.norm(x))[0, 1:-1]

    # Midpoint schedule identical to nar.h: t from 1 down to 0, dt = 1 / steps
    print("[Python] Solving...")
    state = noise.to(device=engine.device, dtype=engine.dtype)
    dt = 1.0 / steps
    with torch.inference_mode():
        for i in range(steps):
            t = 1.0 - i * dt
            raw = torch.logit(torch.tensor(t, dtype=torch.float64)).clamp(-20, 20).item()
            first = velocity(state, raw, i == 0)
            mid = state - first * (dt / 2)
            raw_mid = torch.logit(torch.tensor(t - dt / 2, dtype=torch.float64)).clamp(-20, 20).item()
            second = velocity(mid, raw_mid, False)
            state = state - second * dt
            _dumps[f"nar_step{i}_first"] = first
            _dumps[f"nar_step{i}_second"] = second
            _dumps[f"nar_step{i}_xt"] = state
    _dumps["nar_x0"] = state
    _dumps["noise"] = noise
    engine.close()

    print("[Python] Decoding audio...")
    vae = YuE2VAE.from_pretrained("../checkpoints/YuE2-Vae", decoder_only=True, device=device,
                                  local_files_only=True)
    vae.eval()
    with torch.inference_mode():
        audio = vae.decode(state.T[None])  # [1, 2, N]
    _dumps["vae_audio"] = audio[0].T  # [N, 2] interleaved like the GGML dump

    for name, tensor in sorted(_dumps.items()):
        save_dump(os.path.join(dump_dir, f"{name}.bin"), tensor)
    print(f"[Python] Done, {len(_dumps)} dump files")
    return True


# comparison

def build_stages(steps):
    stages = ["noise", "temb_t", "hidden_after_input", "layer0_sa_output"]
    stages += [f"hidden_after_layer{li}" for li in KEY_LAYERS]
    if steps <= 8:
        step_indices = list(range(steps))
    else:
        step_indices = list(range(0, steps, 5))
        if (steps - 1) not in step_indices:
            step_indices.append(steps - 1)
    for si in step_indices:
        stages.append(f"nar_step{si}_first")
        stages.append(f"nar_step{si}_second")
        if si < steps - 1:
            stages.append(f"nar_step{si}_xt")
    stages += ["nar_x0", "vae_audio"]
    return stages


def compare(dirs, stages, tag):
    labels = sorted(dirs.keys())
    pairs = [(labels[i], labels[j]) for i in range(len(labels)) for j in range(i + 1, len(labels))]

    print(f"[{tag}] Cosine similarities GGML vs Python")

    for stage in stages:
        data = {}
        for label, d in dirs.items():
            f = os.path.join(d, stage + ".bin")
            if os.path.isfile(f):
                data[label] = load_dump(f)
        if not data:
            continue
        parts = []
        for a, b in pairs:
            if a in data and b in data:
                da, sa = data[a]
                db, sb = data[b]
                c = cos(da, db, sa, sb)
                parts.append(f"{a} vs {b} {c:.6f}")
            else:
                parts.append(f"{a} vs {b} N/A")
        print(f"{stage}: " + ", ".join(parts))

    vae_data = {}
    for label, d in dirs.items():
        f = os.path.join(d, "vae_audio.bin")
        if os.path.isfile(f):
            vae_data[label] = load_dump(f)
    if len(vae_data) >= 2:
        parts = []
        for a, b in pairs:
            if a in vae_data and b in vae_data:
                left_a = vae_data[a][0].reshape(-1, 2)[:, 0]
                left_b = vae_data[b][0].reshape(-1, 2)[:, 0]
                c = stft_cos(left_a, left_b)
                parts.append(f"{a} vs {b} {c:.6f}")
            else:
                parts.append(f"{a} vs {b} N/A")
        print("vae_audio (STFT cosine): " + ", ".join(parts))

    if len(pairs) > 0:
        a_label, b_label = pairs[0]
        a_dir, b_dir = dirs[a_label], dirs[b_label]
        xt_stages = [s for s in stages if "_xt" in s]
        if xt_stages:
            print(f"[{tag}] Error growth GGML vs Python")
            for stage in xt_stages:
                fa = os.path.join(a_dir, stage + ".bin")
                fb = os.path.join(b_dir, stage + ".bin")
                if os.path.isfile(fa) and os.path.isfile(fb):
                    da, sa = load_dump(fa)
                    db, sb = load_dump(fb)
                    n = min(len(da), len(db))
                    da, db = da[:n], db[:n]
                    c = _cos_flat(da, db)
                    diff = np.abs(da - db)
                    print(f"{stage}: cos {c:.6f}, max_err {diff.max():.6f}, mean_err {diff.mean():.6f},"
                          f" mean_A {da.mean():.6f}, std_A {da.std():.6f},"
                          f" mean_B {db.mean():.6f}, std_B {db.std():.6f}")
                else:
                    missing = []
                    if not os.path.isfile(fa):
                        missing.append(a_label)
                    if not os.path.isfile(fb):
                        missing.append(b_label)
                    print(f"{stage}: missing {', '.join(missing)}")


# main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quant", default="BF16", help="backbone GGUF quant suffix (BF16, Q8_0, Q6_K, Q5_K_M)")
    args = ap.parse_args()

    if not os.path.isfile("request0.json"):
        print("[Error] request0.json not found in CWD")
        sys.exit(1)
    with open("request0.json") as f:
        req = json.load(f)
    print("[Request] Loaded request0.json")

    dump_ggml = "ggml-nar"
    dump_python = "python-nar"
    steps = int(req.get("steps", 32))

    print(f"[NAR] steps={steps} | YuE2-3B-{args.quant}.gguf")

    if os.path.isdir(dump_ggml):
        shutil.rmtree(dump_ggml)
    if not run_ggml(dump_ggml, req, args.quant):
        print("[NAR] GGML failed")
        sys.exit(1)

    if os.path.isdir(dump_python):
        shutil.rmtree(dump_python)
    if not run_python(dump_python, dump_ggml, req):
        print("[NAR] Python failed")
        sys.exit(1)

    compare({"ggml": dump_ggml, "python": dump_python}, build_stages(steps), "NAR")


if __name__ == "__main__":
    main()
