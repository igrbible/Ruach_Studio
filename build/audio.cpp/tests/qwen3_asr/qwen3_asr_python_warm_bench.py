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

from qwen_asr import Qwen3ASRModel  # noqa: E402


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
    context: str,
    requested_language: str,
    wall_ms: float,
) -> dict[str, Any]:
    timestamps = []
    if getattr(result, "time_stamps", None) is not None:
        for item in getattr(result.time_stamps, "items", []):
            timestamps.append({
                "word": getattr(item, "text", ""),
                "start_sec": getattr(item, "start_time", 0.0),
                "end_sec": getattr(item, "end_time", 0.0),
            })
    return {
        "request_index": request_index,
        "audio": str(audio),
        "context": context,
        "requested_language": requested_language,
        "language": getattr(result, "language", ""),
        "text_output": getattr(result, "text", ""),
        "word_timestamps": timestamps,
        "metrics": {"wall_ms": wall_ms},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Python reference Qwen3-ASR long-lived warmbench.")
    parser.add_argument("--model", default="models/Qwen3-ASR-0.6B")
    parser.add_argument("--audio", default="resources/sample.wav")
    parser.add_argument("--warmup-audio", default="")
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--backend", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--language", default="English")
    parser.add_argument("--language-sequence", default="")
    parser.add_argument("--request-language", action="append", default=[])
    parser.add_argument("--warmup-language", default="")
    parser.add_argument("--context", default="")
    parser.add_argument("--context-sequence", default="")
    parser.add_argument("--request-context", action="append", default=[])
    parser.add_argument("--warmup-context", default="")
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
    model = Qwen3ASRModel.from_pretrained(
        str(model_path),
        dtype=torch.float32,
        device_map=device_map,
        max_inference_batch_size=1,
        max_new_tokens=args.max_new_tokens,
    )

    warmup_audio = Path(args.warmup_audio) if args.warmup_audio else Path(args.audio)
    request_paths = parse_csv_paths(args.audio_sequence, Path(args.audio))
    request_languages = parse_csv_keep_empty(args.language_sequence)
    request_contexts = parse_csv_keep_empty(args.context_sequence)
    default_language = args.language
    default_context = args.context
    warmup_language = args.warmup_language or default_language
    warmup_context = args.warmup_context or default_context

    timing_lines: list[str] = [f"qwen3_asr.python_tf32_disabled 1"]
    warmup_audio_path = REPO_ROOT / warmup_audio if not warmup_audio.is_absolute() else warmup_audio
    for _ in range(args.warmup):
        model.transcribe(
            audio=str(warmup_audio_path),
            context=warmup_context,
            language=warmup_language or None,
            return_time_stamps=False,
        )
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
        context = (
            request_contexts[request_index]
            if request_index < len(request_contexts)
            else repeated_arg(args.request_context, request_index, default_context)
        )
        result = None
        total_ms = 0.0
        for _ in range(args.iterations):
            start = time.perf_counter()
            result = model.transcribe(
                audio=str(audio_path),
                context=context,
                language=language or None,
                return_time_stamps=False,
            )[0]
            if args.backend == "cuda":
                torch.cuda.synchronize(args.device)
            total_ms += (time.perf_counter() - start) * 1000.0
        wall_ms = total_ms / args.iterations
        print(f"average[{request_index}]")
        print(f"qwen3_asr.wall_ms={wall_ms}")
        timing_lines.append(f"qwen3_asr.transcribe_wall_ms {wall_ms:.6f}")
        steps.append(result_to_step(result, request_index, audio, context, language, wall_ms))

    if args.timing_file:
        timing_path = Path(args.timing_file)
        timing_path.parent.mkdir(parents=True, exist_ok=True)
        timing_path.write_text("\n".join(timing_lines) + "\n", encoding="utf-8")
    print("summary_json=" + json.dumps(
        {"family": "qwen3_asr", "backend": args.backend, "sequence_steps": steps},
        separators=(",", ":"),
        ensure_ascii=False,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
