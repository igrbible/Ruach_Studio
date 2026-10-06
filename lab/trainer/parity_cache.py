"""Stage "cache" of the trainer's parity (HERESY 1086): our cache file against AI-Toolkit's for one track.

    .venv/bin/python lab/trainer/parity_cache.py OURS.safetensors AITK.safetensors [TRACK.wav [--device cuda]]
Latents: relative L2 difference, cosine; tokens: the share of equal frames. With the track: both latents
decoded by the same VAE and set against the track itself (SNR and a log-mel distance over the first 30 s) —
the VAE is the judge of which encoding it can render, where two encoders may legitimately differ."""
import argparse, os, sys

import torch
import torch.nn.functional as F
from safetensors.torch import load_file

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def logmel(w, sr=48000):
    import torchaudio
    m = torchaudio.transforms.MelSpectrogram(sr, n_fft=2048, hop_length=480, n_mels=128).to(w.device)(w.mean(0))
    return (m + 1e-5).log()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ours"); ap.add_argument("ref"); ap.add_argument("wav", nargs="?")
    ap.add_argument("--device", default="cuda"); ap.add_argument("--seconds", type=float, default=30)
    ap.add_argument("--checkpoint", default="checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors")
    a = ap.parse_args()
    ours, ref = load_file(a.ours), load_file(a.ref)
    x, y = ours["latent"].float(), ref["latent"].float()
    n = min(x.shape[0], y.shape[0])
    print(f"frames ours {x.shape[0]} ref {y.shape[0]}")
    x, y = x[:n], y[:n]
    print(f"latent rel L2 {((x - y).norm() / y.norm()).item():.3e}  cos {F.cosine_similarity(x.flatten(), y.flatten(), 0).item():.4f}")
    ta, tb = ours["dto.tokens"][:n], ref["dto.tokens"][:n]
    print(f"tokens equal {(ta == tb).float().mean().item() * 100:.2f} %  ({int((ta != tb).sum())} of {n} differ)")
    if not a.wav:
        return
    from cache import load_vae, stereo48
    vae = load_vae(a.checkpoint, a.device)
    frames = int(a.seconds * 25)
    w = stereo48(a.wav)[:, : frames * 1920].to(a.device)
    mw = logmel(w)
    for name, z in (("ours", x), ("ref", y)):
        with torch.no_grad():
            d = vae.decode(z[:frames].T[None].to(a.device))[0, :, : w.shape[1]]
        snr = 10 * torch.log10(w.pow(2).sum() / (d - w).pow(2).sum()).item()
        md = (logmel(d) - mw).abs().mean().item()
        print(f"decoded {name}: SNR {snr:.2f} dB  log-mel L1 {md:.4f}")


if __name__ == "__main__":
    main()
