"""Ruach Studio's own trainer (HERESY 1086): the latent cache of a prepared set, made by the studio.

Per track (NNN.wav, 48 kHz stereo as the Train room prepares it): the VAE's latents [T, 64] (float32
VAE, kept bf16) and the realaudio head's codec tokens [T] (int32), cut to the shorter of the two — what
AI-Toolkit's encode_audio makes, written in its file layout (keys "latent", "dto.tokens") into the set's
_ruach_cache/NNN_ruach.safetensors. AI-Toolkit's own _latent_cache is neither touched nor read. Audio as AI-Toolkit loads it: float in [-1, 1], stereo, no loudness normalisation.

    .venv/bin/python lab/trainer/cache.py SET_FOLDER [--only 001,002] [--device cuda] [--out DIR]"""
import argparse, glob, os, sys, time

import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from semantic import SemanticTokenizer  # noqa: E402
from vae import SAMPLE_RATE, YuE2VAE  # noqa: E402

HEAD = "tokenizer_head_joint_v4.pt"
VERSION = "yue2_tokenizer-head-joint-v4"


def load_vae(checkpoint, device):
    """Only the vae.* tensors (the rest of the checkpoint stays on disk), float32 as the reference runs it."""
    from safetensors import safe_open
    with safe_open(checkpoint, framework="pt", device="cpu") as f:
        sd = {k[len("vae."):]: f.get_tensor(k) for k in f.keys() if k.startswith("vae.")}
    return YuE2VAE.load_from_state_dict(sd, torch.float32).to(device).eval().requires_grad_(False)


def stereo48(path):
    import soundfile as sf
    import torchaudio
    data, sr = sf.read(path, dtype="float32", always_2d=True)          # [samples, channels]
    w = torch.from_numpy(data.T.copy())
    if w.shape[0] == 1:
        w = w.repeat(2, 1)
    elif w.shape[0] > 2:
        w = w[:2]
    if sr != SAMPLE_RATE:
        w = torchaudio.functional.resample(w, sr, SAMPLE_RATE)
    return w


def missing(set_folder):
    """The tracks of a set without a cache of ours (AI-Toolkit's _latent_cache does not count: the trainer
    reads nothing another program made)."""
    return [os.path.basename(w)[:-4] for w in sorted(glob.glob(os.path.join(set_folder, "[0-9]*.wav")))
            if not os.path.isfile(os.path.join(set_folder, "_ruach_cache", os.path.basename(w)[:-4] + "_ruach.safetensors"))]


def build(set_folder, checkpoint, kit, device="cuda", only=None, out_dir=None):
    """Write the cache of every track (or of `only`) that has no file of ours yet; models freed after."""
    out_dir = out_dir or os.path.join(set_folder, "_ruach_cache")
    os.makedirs(out_dir, exist_ok=True)
    wavs = sorted(glob.glob(os.path.join(set_folder, "[0-9]*.wav")))
    if only:
        wavs = [w for w in wavs if os.path.basename(w)[:-4] in only]
    wavs = [w for w in wavs if not os.path.isfile(os.path.join(out_dir, os.path.basename(w)[:-4] + "_ruach.safetensors"))]
    if not wavs:
        return 0
    t0 = time.time()
    vae = load_vae(checkpoint, device)
    tok = SemanticTokenizer(os.path.join(kit, "checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4", HEAD),
                            os.path.join(kit, "checkpoints/MERT-v2-FullSong")).to(device)
    print(f"cache: VAE and MERT head ready in {time.time() - t0:.0f} s; {len(wavs)} tracks", flush=True)
    from safetensors.torch import save_file
    for i, wav in enumerate(wavs):
        stem = os.path.basename(wav)[:-4]
        w = stereo48(wav)
        with torch.no_grad():
            lat = vae.encode(w[None].to(device, torch.float32))[0].T.contiguous()       # [T, 64]
            tokens = tok.tokenize(w, SAMPLE_RATE)
        n = min(lat.shape[0], tokens.shape[0])
        target = os.path.join(out_dir, f"{stem}_ruach.safetensors")
        save_file({"latent": lat[:n].to(torch.bfloat16).cpu(), "dto.tokens": tokens[:n].to(torch.int32).cpu()}, target + ".part",
                  metadata={"filename": stem + ".wav", "is_audio_model": "true", "latent_space_version": VERSION,
                            "sample_rate": str(SAMPLE_RATE), "software": "ruach-studio lab/trainer/cache.py"})
        os.replace(target + ".part", target)
        print(f"cache: {i + 1}/{len(wavs)} {stem}: {n} frames", flush=True)
    del vae, tok
    if device == "cuda":
        torch.cuda.empty_cache()
    print(f"cache: done in {time.time() - t0:.0f} s", flush=True)
    return len(wavs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("set")
    ap.add_argument("--checkpoint", default="")
    ap.add_argument("--kit", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    ap.add_argument("--only", default="")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--out", default="", help="another folder for the files (a parity test); default SET/_ruach_cache")
    a = ap.parse_args()
    ckpt = a.checkpoint or os.path.join(a.kit, "checkpoints/comfy/checkpoints/yue2_3b_bf16.safetensors")
    build(a.set, ckpt, a.kit, a.device, [x for x in a.only.split(",") if x] or None, a.out or None)


if __name__ == "__main__":
    main()
