"""HERESY 1068: the listener (Viktor, 02.10.2026). Qwen2.5-Omni hears a track and writes what is heard
as one line of style tags, so a training set gets a style of its own for every song instead of the SUNO
prompt (SUNO follows its prompt loosely: the prompt is not a description of its track).

Only Omni's thinker is loaded (the talker speaks; we need text). The lyrics are not asked for: the sets
carry the exact texts already. Runs as its own process on a GPU of its own and leaves nothing behind:

    .venv/bin/python lab/listener.py fosforida-v2 --gpu 2 [--model checkpoints/Qwen2.5-Omni-7B] [--seconds 120]

writes datasets/prepared/NAME/styles.json: {stem: tags}, with the model, the excerpt and the VRAM peak
(the figure the trainer's calculator and the listener's gate are built on).

HERESY 1077: a GGUF model goes through llama.cpp (vendor/llama.cpp, llama-mtmd-cli with --mmproj), one call
a track. Measured 02.10.2026 on one 120 s excerpt, peak VRAM: transformers bf16 18.3 GB · Q8_0 + mmproj-f16
11.3 GiB · Q4_K_M + mmproj-f16 8.4 GiB, about 5 s a track; the three hear the same, and all three are drafts
(Fosforida's harp and low strings came out as piano or synthesizer).

    .venv/bin/python lab/listener.py SET --gpu 1 --model checkpoints/Qwen2.5-Omni-7B-GGUF/Qwen2.5-Omni-7B-Q8_0.gguf"""
import argparse, json, os, subprocess, sys, time
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
PROMPT = ("Listen to this music and describe it as one line of comma-separated style tags, in this order where "
          "they apply: genre and sub-genre, mood, vocal type (male vocal, female vocal, duet, choir, instrumental), "
          "vocal delivery (breathy, belted, whispered, operatic, raw), every instrument you can hear, production "
          "(reverb-heavy, close-miked, lo-fi, wide), tempo feel, and harmony colour if it is clear (modal, minor, "
          "Phrygian). Concrete lowercase tags only: no sentences, no artist or song names, no lyrics. Name only "
          "instruments you really hear. Output the tag line and nothing else.")


def excerpt(path, start, seconds):
    """The track as 16 kHz mono float32 (what Omni's audio encoder takes), cut from `start`."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(seconds), "-i", str(path),
                          "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True, timeout=300).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def length(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, timeout=30).stdout.strip()
    return float(out or 0)


def gguf(a, d, stems):
    """The same listening through llama.cpp: a GGUF and its audio projector (mmproj-*.gguf beside it)."""
    import tempfile
    model = Path(a.model)
    proj = Path(a.mmproj) if a.mmproj else next(iter(sorted(model.parent.glob("mmproj-*f16.gguf")) or sorted(model.parent.glob("mmproj-*.gguf"))), None)
    cli = KIT / "vendor" / "llama.cpp" / "build" / "bin" / "llama-mtmd-cli"
    if not proj or not cli.is_file():
        sys.exit(f"needs {cli} and an mmproj-*.gguf beside the model")
    out_path = d / "styles.json"
    out = json.load(open(out_path, encoding="utf-8")) if out_path.is_file() else {}
    out.setdefault("tags", {})
    env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(a.gpu))
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        for i, stem in enumerate(stems):
            wav = d / (stem + ".wav")
            total = length(wav)
            start = max(0.0, min(total * 0.2, total - a.seconds))
            cut = Path(tmp) / "excerpt.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(a.seconds), "-i", str(wav), "-ac", "1", "-ar", "16000", str(cut)],
                           check=True, timeout=300)
            r = subprocess.run([str(cli), "-m", str(model), "--mmproj", str(proj), "--audio", str(cut), "-p", PROMPT,
                                "-ngl", "99", "-c", "8192", "-n", "160", "--temp", "0"], capture_output=True, text=True, env=env, timeout=600)
            lines = [l.strip() for l in r.stdout.splitlines() if l.strip()]
            if r.returncode != 0 or not lines:
                print(f"{i + 1}/{len(stems)} {stem} FAILED: {(r.stderr or '').strip().splitlines()[-1:] }", flush=True)
                continue                                   # said aloud, and no empty tags written as if heard
            out["tags"][stem] = " ".join(lines[-1].split())
            print(f"{i + 1}/{len(stems)} {stem} [{start:.0f}s+{a.seconds:.0f}s] {out['tags'][stem]}", flush=True)
            out.update(model=model.name, mmproj=proj.name, seconds=a.seconds, made=time.strftime("%Y-%m-%d %H:%M"))
            json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"done: {len(stems)} in {time.time() - t0:.0f} s (llama.cpp, {model.name})", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset")
    ap.add_argument("--gpu", default="0")
    ap.add_argument("--model", default=str(KIT / "checkpoints" / "Qwen2.5-Omni-7B"))
    ap.add_argument("--seconds", type=float, default=120.0)
    ap.add_argument("--only", default="", help="comma-separated stems, for a quick look")
    ap.add_argument("--mmproj", default="", help="a GGUF model's audio projector (default: mmproj-*.gguf beside it)")
    a = ap.parse_args()
    if a.model.endswith(".gguf"):
        d = KIT / "datasets" / "prepared" / a.dataset
        stems = [t["stem"] for t in json.load(open(d / "dataset.json", encoding="utf-8"))["tracks"]]
        return gguf(a, d, [s for s in stems if not a.only or s in a.only.split(",")])
    os.environ["CUDA_VISIBLE_DEVICES"] = str(a.gpu)
    import torch
    from transformers import Qwen2_5OmniProcessor, Qwen2_5OmniThinkerForConditionalGeneration

    d = KIT / "datasets" / "prepared" / a.dataset
    man = json.load(open(d / "dataset.json", encoding="utf-8"))
    stems = [t["stem"] for t in man["tracks"]]
    if a.only:
        stems = [s for s in stems if s in a.only.split(",")]
    t0 = time.time()
    proc = Qwen2_5OmniProcessor.from_pretrained(a.model)
    model = Qwen2_5OmniThinkerForConditionalGeneration.from_pretrained(a.model, torch_dtype=torch.bfloat16).to("cuda:0")   # no accelerate needed
    model.eval()
    loaded = time.time() - t0
    out_path = d / "styles.json"
    out = json.load(open(out_path, encoding="utf-8")) if out_path.is_file() else {}
    out.setdefault("tags", {})
    for i, stem in enumerate(stems):
        wav = d / (stem + ".wav")
        total = length(wav)
        start = max(0.0, min(total * 0.2, total - a.seconds))       # past the intro, into the body of the song
        audio = excerpt(wav, start, a.seconds)
        conv = [{"role": "system", "content": [{"type": "text", "text": "You are a music producer who names what is heard, precisely."}]},
                {"role": "user", "content": [{"type": "audio", "audio": "track"}, {"type": "text", "text": PROMPT}]}]
        text = proc.apply_chat_template(conv, add_generation_prompt=True, tokenize=False)
        inputs = proc(text=text, audio=[audio], sampling_rate=16000, return_tensors="pt", padding=True).to("cuda:0")
        inputs = {k: (v.to(torch.bfloat16) if v.dtype == torch.float32 else v) for k, v in inputs.items()}
        with torch.no_grad():
            ids = model.generate(**inputs, max_new_tokens=160, do_sample=False)
        tags = proc.batch_decode(ids[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0].strip().splitlines()
        tags = " ".join(tags[0].split()) if tags else ""
        out["tags"][stem] = tags
        print(f"{i + 1}/{len(stems)} {stem} [{start:.0f}s+{a.seconds:.0f}s] {tags}", flush=True)
        out.update(model=Path(a.model).name, seconds=a.seconds, loaded_in=round(loaded, 1),
                   vram_peak_mb=round(torch.cuda.max_memory_allocated() / 2 ** 20), made=time.strftime("%Y-%m-%d %H:%M"))
        json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"done: {len(stems)} in {time.time() - t0:.0f} s · VRAM peak {out.get('vram_peak_mb')} MB (torch)", flush=True)


if __name__ == "__main__":
    sys.exit(main())
