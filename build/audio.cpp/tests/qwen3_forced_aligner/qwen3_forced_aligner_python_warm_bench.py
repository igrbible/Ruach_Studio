#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import torch


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_ROOT = REPO_ROOT / "reference" / "Qwen3-ASR"
sys.path.insert(0, str(REFERENCE_ROOT))

from qwen_asr.inference.qwen3_forced_aligner import Qwen3ForcedAligner  # noqa: E402


def parse_csv_keep_empty(value: str) -> list[str]:
    return value.split(",") if value else []


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    return [Path(item) for item in value.split(",") if item] if value else [fallback]


def repeated_arg(values: list[str], index: int, fallback: str) -> str:
    return values[index] if index < len(values) else fallback


def result_to_step(
    result: Any,
    request_index: int,
    audio: Path,
    transcript: str,
    requested_language: str,
    wall_ms: float,
) -> dict[str, Any]:
    timestamps = []
    for item in getattr(result, "items", []):
        timestamps.append({
            "word": getattr(item, "text", ""),
            "start_sample": int(round(float(getattr(item, "start_time", 0.0)) * 16000.0)),
            "end_sample": int(round(float(getattr(item, "end_time", 0.0)) * 16000.0)),
            "confidence": 0.0,
        })
    return {
        "request_index": request_index,
        "audio": str(audio),
        "requested_language": requested_language,
        "language": requested_language,
        "text_output": transcript,
        "word_timestamps": timestamps,
        "metrics": {"wall_ms": wall_ms},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Python reference Qwen3 forced aligner warmbench.")
    parser.add_argument("--model", default="models/Qwen3-ForcedAligner-0.6B")
    parser.add_argument("--audio", default="resources/sample.wav")
    parser.add_argument("--warmup-audio", default="")
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--backend", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--language", default="English")
    parser.add_argument("--language-sequence", default="")
    parser.add_argument("--request-language", action="append", default=[])
    parser.add_argument("--warmup-language", default="")
    parser.add_argument("--transcript", default="")
    parser.add_argument("--transcript-sequence", default="")
    parser.add_argument("--request-transcript", action="append", default=[])
    parser.add_argument("--warmup-transcript", default="")
    parser.add_argument("--timing-file", default="")
    args = parser.parse_args()

    torch.set_num_threads(max(1, args.threads))
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    if args.backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")
        device_map = f"cuda:{args.device}"
    else:
        device_map = "cpu"

    model_path = REPO_ROOT / args.model if not Path(args.model).is_absolute() else Path(args.model)
    model = Qwen3ForcedAligner.from_pretrained(
        str(model_path),
        dtype=torch.float32,
        device_map=device_map,
    )

    warmup_audio = Path(args.warmup_audio) if args.warmup_audio else Path(args.audio)
    request_paths = parse_csv_paths(args.audio_sequence, Path(args.audio))
    request_languages = parse_csv_keep_empty(args.language_sequence)
    request_transcripts = parse_csv_keep_empty(args.transcript_sequence)
    default_language = args.language
    default_transcript = args.transcript
    warmup_language = args.warmup_language or default_language
    warmup_transcript = args.warmup_transcript or default_transcript

    timing_lines: list[str] = ["qwen3_forced_aligner.python_tf32_disabled 1"]
    warmup_audio_path = REPO_ROOT / warmup_audio if not warmup_audio.is_absolute() else warmup_audio
    for _ in range(args.warmup):
        model.align(audio=str(warmup_audio_path), text=warmup_transcript, language=warmup_language)
        if args.backend == "cuda":
            torch.cuda.synchronize(args.device)

    steps = []
    for request_index, audio in enumerate(request_paths):
        audio_path = REPO_ROOT / audio if not audio.is_absolute() else audio
        language = (
            request_languages[request_index]
            if request_index < len(request_languages) and request_languages[request_index]
            else repeated_arg(args.request_language, request_index, default_language)
        )
        transcript = (
            request_transcripts[request_index]
            if request_index < len(request_transcripts)
            else repeated_arg(args.request_transcript, request_index, default_transcript)
        )
        result = None
        total_ms = 0.0
        for _ in range(args.iterations):
            start = time.perf_counter()
            result = model.align(audio=str(audio_path), text=transcript, language=language)[0]
            if args.backend == "cuda":
                torch.cuda.synchronize(args.device)
            total_ms += (time.perf_counter() - start) * 1000.0
        wall_ms = total_ms / args.iterations
        print(f"average[{request_index}]")
        print(f"qwen3_forced_aligner.wall_ms={wall_ms}")
        timing_lines.append(f"qwen3_forced_aligner.align_wall_ms {wall_ms:.6f}")
        steps.append(result_to_step(result, request_index, audio, transcript, language, wall_ms))

    if args.timing_file:
        timing_path = Path(args.timing_file)
        timing_path.parent.mkdir(parents=True, exist_ok=True)
        timing_path.write_text("\n".join(timing_lines) + "\n", encoding="utf-8")
    print("summary_json=" + json.dumps(
        {"family": "qwen3_forced_aligner", "backend": args.backend, "sequence_steps": steps},
        separators=(",", ":"),
        ensure_ascii=False,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
