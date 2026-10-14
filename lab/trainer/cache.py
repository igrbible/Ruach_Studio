"""Ruach Studio's own trainer (HERESY 1086): the latent cache of a prepared set, made by the studio.

Per track (NNN.wav, 48 kHz stereo as the Train room prepares it): the VAE's latents [T, 64] (float32
VAE, kept bf16) and the realaudio head's codec tokens [T] (int32), cut to the shorter of the two — what
AI-Toolkit's encode_audio makes, written in its file layout (keys "latent", "dto.tokens") into the set's
_ruach_cache/NNN_ruach.safetensors. AI-Toolkit's own _latent_cache is neither touched nor read. Audio as AI-Toolkit loads it: float in [-1, 1], stereo, no loudness normalisation.

    .venv/bin/python lab/trainer/cache.py SET_FOLDER [--only 001,002] [--device cuda] [--out DIR]"""
import argparse, glob, os, subprocess, sys, time

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


# HERESY 1420: score mode's sheets, by the engine's own transcriber (SheetSage2 GGUF, yue-transcribe): "full" melody and chords,
# "melody" the melody alone (--melody-only), as AI-Toolkit's SheetSage2Transcriber makes them per cot
SHEET_FLAGS = {"full": [], "melody": ["--melody-only"]}


def sheet_path(set_folder, stem, cot):
    return os.path.join(set_folder, "_ruach_cache", f"{stem}_ruach.{cot}.abc")


def missing_sheets(set_folder, cot):
    """The tracks without a sheet of this cot, neither made nor refused before (a refusal is kept beside it as .fail, said once)."""
    out = []
    for w in sorted(glob.glob(os.path.join(set_folder, "[0-9]*.wav"))):
        p = sheet_path(set_folder, os.path.basename(w)[:-4], cot)
        if not os.path.isfile(p) and not os.path.isfile(p + ".fail"):
            out.append(os.path.basename(w)[:-4])
    return out


def _transcriber(kit):
    exe = os.path.join(kit, "build", "build", "yue-transcribe")
    gguf = next((p for p in (os.path.join(kit, "models", n) for n in ("SheetSage2-Q8_0.gguf", "SheetSage2-F32.gguf")) if os.path.isfile(p)), None)
    if not os.path.isfile(exe) or not gguf:
        raise FileNotFoundError(f"score mode needs the engine's transcriber: {exe} and models/SheetSage2-*.gguf")
    return exe, gguf


def _transcribe(exe, gguf, wav, target, cot):
    """One recording's sheet into target; (True, characters) or (False, why), the why kept as target.fail."""
    r = subprocess.run([exe, "--model", gguf, "--audio", wav, "--out", target + ".part"] + SHEET_FLAGS[cot], capture_output=True, text=True, timeout=900)
    text = open(target + ".part", encoding="utf-8").read() if os.path.isfile(target + ".part") else ""
    if r.returncode != 0 or not text.strip():
        why = (r.stderr.strip().splitlines() or r.stdout.strip().splitlines() or ["no score written"])[-1]
        with open(target + ".fail", "w", encoding="utf-8") as f:
            f.write(why + "\n")
        if os.path.isfile(target + ".part"):
            os.remove(target + ".part")
        return False, why
    os.replace(target + ".part", target)
    return True, len(text)


# HERESY 1422: the separation's stems, by the studio's own separator (BS-Roformer ep317 through audio-separator, the Refiner's
# stems; AI-Toolkit splits with MelBandRoformer): each track into voice and instrumental, each stem's codec tokens cut to the
# mix's length (_ruach_cache/NNN_ruach.stems.safetensors: tokens_vocals, tokens_music) and, with a cot, each stem's sheet
# (NNN_ruach.vocals.COT.abc, NNN_ruach.music.COT.abc); the stems' audio itself is not kept
ROFORMER = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
STEMS = ("vocals", "music")


def stems_path(set_folder, stem):
    return os.path.join(set_folder, "_ruach_cache", f"{stem}_ruach.stems.safetensors")


def stem_sheet_path(set_folder, stem, variant, cot):
    return os.path.join(set_folder, "_ruach_cache", f"{stem}_ruach.{variant}.{cot}.abc")


def missing_stems(set_folder, cot="off"):
    """The tracks without their stems' tokens, or (with a cot) without a stem's sheet neither made nor refused."""
    out = []
    for w in sorted(glob.glob(os.path.join(set_folder, "[0-9]*.wav"))):
        stem = os.path.basename(w)[:-4]
        lack = not os.path.isfile(stems_path(set_folder, stem))
        if not lack and cot != "off":
            lack = any(not os.path.isfile(p) and not os.path.isfile(p + ".fail") for p in (stem_sheet_path(set_folder, stem, v, cot) for v in STEMS))
        if lack:
            out.append(stem)
    return out


def stems(set_folder, kit, cot="off", device="cuda", only=None):
    """Split, tokenize (and with a cot transcribe) every track that lacks it; the separator and the MERT head freed after."""
    from audio_separator.separator import Separator
    from safetensors import safe_open
    from safetensors.torch import save_file
    todo = only or missing_stems(set_folder, cot)
    if not todo:
        return 0
    exe, gguf = _transcriber(kit) if cot != "off" else (None, None)
    cache_dir = os.path.join(set_folder, "_ruach_cache")
    work = os.path.join(cache_dir, ".stems-work")
    os.makedirs(work, exist_ok=True)
    t0 = time.time()
    sep = Separator(model_file_dir=os.path.join(kit, "separation", "roformer"), output_dir=work, output_format="WAV",
                    sample_rate=SAMPLE_RATE, log_level=30)
    sep.load_model(model_filename=ROFORMER)
    tok = SemanticTokenizer(os.path.join(kit, "checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4", HEAD),
                            os.path.join(kit, "checkpoints/MERT-v2-FullSong")).to(device)
    print(f"stems: separator and MERT head ready in {time.time() - t0:.0f} s; {len(todo)} tracks", flush=True)
    for i, stem in enumerate(todo):
        with safe_open(os.path.join(cache_dir, f"{stem}_ruach.safetensors"), "pt") as f:
            n = f.get_tensor("dto.tokens").shape[0]               # the mix's length: the stems are cut to it
        files = [p if os.path.isabs(p) else os.path.join(work, os.path.basename(p)) for p in sep.separate(os.path.join(set_folder, stem + ".wav"))]
        found = {}
        for name, word in (("vocals", "(vocals)"), ("music", "(instrumental)")):
            hit = [p for p in files if word in os.path.basename(p).lower()]
            if not hit:
                raise RuntimeError(f"no {word} stem of {stem} among {[os.path.basename(p) for p in files]}")
            found[name] = hit[0]
        out, said = {}, []
        for name, path in found.items():
            w = stereo48(path)
            with torch.no_grad():
                t = tok.tokenize(w, SAMPLE_RATE)
            if t.shape[0] < n:                                    # a stem a frame short of the mix: its last token again
                t = torch.cat([t, t[-1:].repeat(n - t.shape[0])])
            out[f"tokens_{name}"] = t[:n].to(torch.int32).cpu()
            if cot != "off":
                ok, what = _transcribe(exe, gguf, path, stem_sheet_path(set_folder, stem, name, cot), cot)
                said.append(f"{name} sheet {what} characters" if ok else f"{name}: no sheet ({what})")
        target = stems_path(set_folder, stem)
        save_file(out, target + ".part", metadata={"filename": stem + ".wav", "separator": ROFORMER, "latent_space_version": VERSION,
                                                    "software": "ruach-studio lab/trainer/cache.py"})
        os.replace(target + ".part", target)
        for p in files:
            if os.path.isfile(p):
                os.remove(p)
        print(f"stems: {i + 1}/{len(todo)} {stem}: {n} frames" + ("; " + "; ".join(said) if said else ""), flush=True)
    del sep, tok
    if device == "cuda":
        torch.cuda.empty_cache()
    print(f"stems: done in {time.time() - t0:.0f} s", flush=True)
    return len(todo)


def read_stems(set_folder, stem):
    from safetensors import safe_open
    with safe_open(stems_path(set_folder, stem), "pt") as f:
        return {v: f.get_tensor(f"tokens_{v}") for v in STEMS}


def read_stem_sheet(set_folder, stem, variant, cot):
    p = stem_sheet_path(set_folder, stem, variant, cot)
    return open(p, encoding="utf-8").read() if os.path.isfile(p) else None


def sheets(set_folder, cot, kit, only=None):
    """The sheet of every track (or of `only`) that has none: yue-transcribe on the visible card. A track the transcriber cannot read
    is said by name and its reason kept as .fail: the trainer then trains it as Direct always, and says how many."""
    exe, gguf = _transcriber(kit)
    os.makedirs(os.path.join(set_folder, "_ruach_cache"), exist_ok=True)
    todo = only or missing_sheets(set_folder, cot)
    t0, made = time.time(), 0
    for i, stem in enumerate(todo):
        ok, what = _transcribe(exe, gguf, os.path.join(set_folder, stem + ".wav"), sheet_path(set_folder, stem, cot), cot)
        if not ok:
            print(f"sheet: {i + 1}/{len(todo)} {stem}: no score ({what}); it trains as Direct", flush=True)
            continue
        made += 1
        print(f"sheet: {i + 1}/{len(todo)} {stem}: {what} characters", flush=True)
    print(f"sheet: {made} of {len(todo)} in {time.time() - t0:.0f} s", flush=True)
    return made


def read_sheet(set_folder, stem, cot):
    """A track's sheet, or None when it has none (refused, or never made)."""
    p = sheet_path(set_folder, stem, cot)
    return open(p, encoding="utf-8").read() if os.path.isfile(p) else None


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
