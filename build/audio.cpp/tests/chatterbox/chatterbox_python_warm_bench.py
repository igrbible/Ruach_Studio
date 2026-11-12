from __future__ import annotations

import argparse
import json
import os
import sys
import time
import wave
from pathlib import Path

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_SRC = REPO_ROOT / "reference" / "chatterbox" / "src"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Python reference Chatterbox voice-clone warmbench.")
    parser.add_argument("--model", type=Path, default=Path("models/chatterbox"))
    parser.add_argument("--backend", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--text", action="append", dest="texts", default=[])
    parser.add_argument("--warmup-text", default="This is a fixed warmup request for Chatterbox voice cloning.")
    parser.add_argument("--language", default="en")
    parser.add_argument("--clone-audio", type=Path, default=Path("resources/sample.wav"))
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--exaggeration", type=float, default=0.5)
    parser.add_argument("--cfg-weight", type=float, default=0.5)
    parser.add_argument("--s3gen-cfg-rate", type=float, default=0.7)
    parser.add_argument("--temperature", type=float, default=0.8)
    parser.add_argument("--repetition-penalty", type=float, default=1.2)
    parser.add_argument("--min-p", type=float, default=0.05)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument("--audio-out", type=Path, default=Path("chatterbox_python_audio.wav"))
    parser.add_argument("--audio-out-dir", type=Path, default=None)
    parser.add_argument("--timing-file", type=Path, default=Path("chatterbox_python_timing.log"))
    return parser.parse_args()


def add_repo_paths(repo_root: Path) -> None:
    sys.path.insert(0, str(repo_root))
    sys.path.insert(0, str(repo_root / "reference" / "chatterbox" / "src"))


def load_reference_chatterbox_tts(language: str):
    package_dir = REFERENCE_SRC / "chatterbox"
    if not package_dir.exists():
        raise RuntimeError(f"missing Chatterbox reference source: {package_dir}")
    add_repo_paths(REPO_ROOT)
    if language.lower() == "en":
        from chatterbox.tts import ChatterboxTTS

        return ChatterboxTTS
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    return ChatterboxMultilingualTTS


def write_wav(path: Path, sample_rate: int, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def summary_json(audio: np.ndarray, sample_rate: int, wall_ms: float) -> str:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    count = max(1, int(audio.size))
    payload = {
        "family": "chatterbox",
        "sample_rate": int(sample_rate),
        "channels": 1,
        "samples": int(audio.size),
        "duration_sec": float(audio.size / sample_rate) if sample_rate else 0.0,
        "sum": float(audio.sum(dtype=np.float64)) if audio.size else 0.0,
        "mean_abs": float(np.mean(np.abs(audio))) if audio.size else 0.0,
        "rms": float(np.sqrt(np.sum(audio.astype(np.float64) ** 2) / count)) if audio.size else 0.0,
        "min": float(audio.min()) if audio.size else 0.0,
        "max": float(audio.max()) if audio.size else 0.0,
        "synthesize_wall_ms": float(wall_ms),
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    args = parse_args()
    texts = args.texts or ["The benchmark request should produce clear cloned speech for comparison."]

    language = args.language.lower()
    ChatterboxTTS = load_reference_chatterbox_tts(language)
    import torch

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda":
        torch.cuda.set_device(args.device)
        device = f"cuda:{args.device}"
    else:
        device = "cpu"

    model = ChatterboxTTS.from_local(args.model, device=device)
    model.s3gen.flow.inference_cfg_rate = args.s3gen_cfg_rate

    def run_once(text: str) -> tuple[np.ndarray, int, float]:
        torch.manual_seed(args.seed)
        if args.backend == "cuda":
            torch.cuda.manual_seed_all(args.seed)
        started = time.perf_counter()
        if language == "en":
            wav = model.generate(
                text,
                audio_prompt_path=str(args.clone_audio),
                exaggeration=args.exaggeration,
                cfg_weight=args.cfg_weight,
                temperature=args.temperature,
                repetition_penalty=args.repetition_penalty,
                min_p=args.min_p,
                top_p=args.top_p,
            )
        else:
            wav = model.generate(
                text,
                language_id=language,
                audio_prompt_path=str(args.clone_audio),
                exaggeration=args.exaggeration,
                cfg_weight=args.cfg_weight,
                temperature=args.temperature,
                repetition_penalty=args.repetition_penalty,
                min_p=args.min_p,
                top_p=args.top_p,
            )
        if args.backend == "cuda":
            torch.cuda.synchronize(args.device)
        ended = time.perf_counter()
        audio = wav.detach().cpu().numpy().astype(np.float32).reshape(-1)
        return audio, int(model.sr), (ended - started) * 1000.0

    args.timing_file.parent.mkdir(parents=True, exist_ok=True)
    with args.timing_file.open("w", encoding="utf-8") as timing:
        timing.write(f"chatterbox.python_reference_src {REFERENCE_SRC}\n")
        warmup_outputs: list[tuple[np.ndarray, int, float]] = []
        for _ in range(max(0, args.warmup)):
            result = run_once(args.warmup_text)
            warmup_outputs.append(result)
            timing.write(f"chatterbox.synthesize_wall_ms {result[2]:.6f}\n")

        last_outputs: list[tuple[np.ndarray, int, float]] = []
        for text in texts:
            current: tuple[np.ndarray, int, float] | None = None
            for _ in range(max(1, args.iterations)):
                current = run_once(text)
                timing.write(f"chatterbox.synthesize_wall_ms {current[2]:.6f}\n")
            assert current is not None
            last_outputs.append(current)

    for index, (audio, sample_rate, wall_ms) in enumerate(warmup_outputs):
        print(f"warmup_text[{index}]={args.warmup_text}")
        print(f"warmup_summary_json[{index}]=" + summary_json(audio, sample_rate, wall_ms))

    for index, (text, output) in enumerate(zip(texts, last_outputs)):
        audio, sample_rate, wall_ms = output
        print(f"text[{index}]={text}")
        print(f"summary_json[{index}]=" + summary_json(audio, sample_rate, wall_ms))

    print(f"timing_out={args.timing_file}")
    if args.audio_out_dir is not None:
        args.audio_out_dir.mkdir(parents=True, exist_ok=True)
        for index, (audio, sample_rate, _wall_ms) in enumerate(last_outputs):
            out_path = args.audio_out_dir / f"request_{index}.wav"
            write_wav(out_path, sample_rate, audio)
            print(f"audio_out[{index}]={out_path}")

    final_audio, final_sample_rate, _ = last_outputs[-1]
    write_wav(args.audio_out, final_sample_rate, final_audio)
    print(f"audio_out={args.audio_out}")
    for index, (_audio, _sample_rate, wall_ms) in enumerate(last_outputs):
        print(f"average[{index}]")
        print(f"chatterbox.synthesize_wall_ms={wall_ms}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
