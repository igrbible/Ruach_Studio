#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import wave
from pathlib import Path

import numpy as np
import torch


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_ROOT = REPO_ROOT / "reference" / "silero-vad" / "src"
TARGET_SR = 16000


def read_wav_pcm_f32(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        sample_width = wav.getsampwidth()
        data = wav.readframes(wav.getnframes())
    if sample_width == 2:
        pcm = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
    elif sample_width == 4:
        pcm = np.frombuffer(data, dtype="<f4").astype(np.float32)
    else:
        raise RuntimeError(f"unsupported WAV bit depth: {sample_width * 8}")
    if channels > 1:
        pcm = pcm.reshape(-1, channels).mean(axis=1)
    return pcm, sample_rate


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    return [Path(item) for item in value.split(",") if item] if value else [fallback]


def segments_for_audio(model, get_speech_timestamps, audio_path: Path, threshold: float, device: torch.device) -> list[dict[str, float | int]]:
    waveform, sample_rate = read_wav_pcm_f32(audio_path)
    if sample_rate != TARGET_SR:
        raise RuntimeError(f"Silero VAD warmbench expects 16 kHz audio, got {sample_rate}: {audio_path}")
    audio = torch.from_numpy(waveform.astype(np.float32, copy=False)).to(device)
    segments = get_speech_timestamps(
        audio,
        model,
        threshold=threshold,
        sampling_rate=sample_rate,
        return_seconds=False,
        visualize_probs=False,
    )
    return [
        {
            "start_sample": int(segment["start"]),
            "end_sample": int(segment["end"]),
            "confidence": 1.0,
        }
        for segment in segments
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="assets/framework/models/silero_vad")
    parser.add_argument("--audio", default="resources/sample.wav")
    parser.add_argument("--warmup-audio", default="")
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--backend", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.is_absolute():
        model_path = REPO_ROOT / model_path
    if not model_path.exists():
        raise RuntimeError(f"Silero VAD model path does not exist: {model_path}")

    torch.set_num_threads(max(1, args.threads))
    os.environ.setdefault("ENGINE_TRACE_ENABLED", "0")
    os.environ.setdefault("ENGINE_TIMING_ENABLED", "0")
    sys.path.insert(0, str(REPO_ROOT))
    sys.path.insert(0, str(REFERENCE_ROOT))
    from silero_vad import get_speech_timestamps, load_silero_vad

    model = load_silero_vad(onnx=False)
    torch.set_num_threads(max(1, args.threads))
    device = torch.device("cpu")
    if args.backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")
        device = torch.device(f"cuda:{args.device}")
        model = model.to(device)

    warmup_audio = Path(args.warmup_audio) if args.warmup_audio else Path(args.audio)
    request_paths = parse_csv_paths(args.audio_sequence, Path(args.audio))

    for _ in range(args.warmup):
        segments_for_audio(model, get_speech_timestamps, warmup_audio, args.threshold, device)
        if args.backend == "cuda":
            torch.cuda.synchronize(args.device)

    steps = []
    for index, path in enumerate(request_paths):
        segments: list[dict[str, float | int]] = []
        total_ms = 0.0
        for _ in range(args.iterations):
            start = time.perf_counter()
            segments = segments_for_audio(model, get_speech_timestamps, path, args.threshold, device)
            if args.backend == "cuda":
                torch.cuda.synchronize(args.device)
            total_ms += (time.perf_counter() - start) * 1000.0
        wall_ms = total_ms / args.iterations
        print(f"average[{index}]")
        print(f"silero_vad.wall_ms={wall_ms}")
        steps.append({
            "request_index": index,
            "audio": str(path),
            "speech_segments": segments,
            "metrics": {"wall_ms": wall_ms},
        })
    print("summary_json=" + json.dumps({"family": "silero_vad", "backend": args.backend, "sequence_steps": steps}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
