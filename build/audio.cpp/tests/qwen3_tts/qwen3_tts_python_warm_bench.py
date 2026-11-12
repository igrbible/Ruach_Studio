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
REFERENCE_ROOT = REPO_ROOT / "reference" / "Qwen3-TTS"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Python reference Qwen3 TTS long-lived warmbench.")
    parser.add_argument("--model", type=Path, default=Path("models/Qwen3-TTS-12Hz-0.6B-Base"))
    parser.add_argument("--backend", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--text", action="append", dest="texts", default=[])
    parser.add_argument("--warmup-text", default="The warmup voice sounds steady and natural today.")
    parser.add_argument("--clone-audio", type=Path, default=None)
    parser.add_argument(
        "--reference-text",
        default="Some call me nature. Others call me Mother Nature. I've been here for over 4.5 billion years. 22,500 times longer than you.",
    )
    parser.add_argument("--task", choices=("tts", "voice_design", "custom_voice"), default="tts")
    parser.add_argument("--language", default="Auto")
    parser.add_argument("--speaker", default="")
    parser.add_argument("--warmup-speaker", default="")
    parser.add_argument("--request-speaker", action="append", dest="request_speakers", default=[])
    parser.add_argument("--voice-design-instruct", default="")
    parser.add_argument("--instruct", default="")
    parser.add_argument("--warmup-instruct", default="")
    parser.add_argument("--request-instruct", action="append", dest="request_instructs", default=[])
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--do-sample", choices=("true", "false"), default="true")
    parser.add_argument("--subtalker-do-sample", choices=("true", "false"), default="true")
    parser.add_argument("--top-k", type=int, default=50)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument("--temperature", type=float, default=0.9)
    parser.add_argument("--subtalker-top-k", type=int, default=50)
    parser.add_argument("--subtalker-top-p", type=float, default=1.0)
    parser.add_argument("--subtalker-temperature", type=float, default=0.9)
    parser.add_argument("--disable-tf32", action="store_true")
    parser.add_argument("--audio-out", type=Path, default=Path("qwen3_tts_python_audio.wav"))
    parser.add_argument("--audio-out-dir", type=Path, default=None)
    parser.add_argument("--timing-file", type=Path, default=Path("qwen3_tts_python_timing.log"))
    return parser.parse_args()


def parse_bool(value: str) -> bool:
    return value in {"1", "true", "yes"}


def write_wav(path: Path, sample_rate: int, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    audio = np.asarray(audio, dtype=np.float32)
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def summary_json(audio: np.ndarray, sample_rate: int, wall_ms: float) -> str:
    audio = np.asarray(audio, dtype=np.float32)
    count = max(1, int(audio.size))
    payload = {
        "family": "qwen3_tts",
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
    texts = args.texts or ["The benchmark request should produce clear speech for comparison."]
    if args.task in {"voice_design", "custom_voice"} and args.request_instructs and len(args.request_instructs) < len(texts):
        raise ValueError(
            f"need {len(texts)} --request-instruct values, only received {len(args.request_instructs)}"
        )
    if args.task == "custom_voice" and args.request_speakers and len(args.request_speakers) < len(texts):
        raise ValueError(
            f"need {len(texts)} --request-speaker values, only received {len(args.request_speakers)}"
        )
    if args.task == "custom_voice" and not args.speaker:
        raise ValueError("Qwen3 custom voice warmbench requires --speaker")

    import transformers457 as _transformers457
    sys.modules["transformers"] = _transformers457
    sys.path.insert(0, str(REFERENCE_ROOT))
    import torch
    from qwen_tts import Qwen3TTSModel

    disable_tf32 = args.disable_tf32 or os.environ.get("ENGINE_QWEN3_DISABLE_TF32") == "1"
    if disable_tf32:
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        torch.set_float32_matmul_precision("highest")

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda":
        torch.cuda.set_device(args.device)
        device_map = f"cuda:{args.device}"
    else:
        device_map = "cpu"

    model = Qwen3TTSModel.from_pretrained(
        str(args.model),
        torch_dtype=torch.float32,
        device_map=device_map,
    )
    voice_clone_prompt = None
    voice_prompt_build_ms = 0.0
    if args.task == "tts":
        if args.clone_audio is None:
            raise ValueError("Qwen3 voice clone warmbench requires --clone-audio")
        prompt_started = time.perf_counter()
        voice_clone_prompt = model.create_voice_clone_prompt(
            ref_audio=str(args.clone_audio),
            ref_text=args.reference_text,
        )
        if args.backend == "cuda":
            torch.cuda.synchronize(args.device)
        prompt_ended = time.perf_counter()
        voice_prompt_build_ms = (prompt_ended - prompt_started) * 1000.0

    def run_once(text: str, instruct: str = "", speaker: str = "") -> tuple[np.ndarray, int, float]:
        torch.manual_seed(args.seed)
        if args.backend == "cuda":
            torch.cuda.manual_seed_all(args.seed)
        do_sample = parse_bool(args.do_sample)
        subtalker_do_sample = parse_bool(args.subtalker_do_sample)
        started = time.perf_counter()
        if args.task == "voice_design":
            audio_list, sample_rate = model.generate_voice_design(
                text=text,
                instruct=instruct,
                language=args.language,
                max_new_tokens=args.max_new_tokens,
                do_sample=do_sample,
                top_k=args.top_k,
                top_p=args.top_p,
                temperature=args.temperature,
                repetition_penalty=1.05,
                subtalker_dosample=subtalker_do_sample,
                subtalker_top_k=args.subtalker_top_k,
                subtalker_top_p=args.subtalker_top_p,
                subtalker_temperature=args.subtalker_temperature,
            )
        elif args.task == "custom_voice":
            audio_list, sample_rate = model.generate_custom_voice(
                text=text,
                speaker=speaker,
                instruct=instruct,
                language=args.language,
                max_new_tokens=args.max_new_tokens,
                do_sample=do_sample,
                top_k=args.top_k,
                top_p=args.top_p,
                temperature=args.temperature,
                repetition_penalty=1.05,
                subtalker_dosample=subtalker_do_sample,
                subtalker_top_k=args.subtalker_top_k,
                subtalker_top_p=args.subtalker_top_p,
                subtalker_temperature=args.subtalker_temperature,
            )
        else:
            if voice_clone_prompt is None:
                raise ValueError("Qwen3 voice clone prompt was not initialized")
            audio_list, sample_rate = model.generate_voice_clone(
                text=text,
                voice_clone_prompt=voice_clone_prompt,
                language=args.language,
                max_new_tokens=args.max_new_tokens,
                do_sample=do_sample,
                top_k=args.top_k,
                top_p=args.top_p,
                temperature=args.temperature,
                repetition_penalty=1.05,
                subtalker_dosample=subtalker_do_sample,
                subtalker_top_k=args.subtalker_top_k,
                subtalker_top_p=args.subtalker_top_p,
                subtalker_temperature=args.subtalker_temperature,
            )
        if args.backend == "cuda":
            torch.cuda.synchronize(args.device)
        ended = time.perf_counter()
        audio = np.asarray(audio_list[0], dtype=np.float32)
        return audio, int(sample_rate), (ended - started) * 1000.0

    args.timing_file.parent.mkdir(parents=True, exist_ok=True)
    with args.timing_file.open("w", encoding="utf-8") as timing:
        timing.write(f"qwen3_tts.python_tf32_disabled {1 if disable_tf32 else 0}\n")
        if args.task == "tts":
            timing.write(f"qwen3_tts.voice_prompt_build_ms {voice_prompt_build_ms:.6f}\n")
        default_instruct = args.instruct or args.voice_design_instruct
        warmup_instruct = args.warmup_instruct or default_instruct
        warmup_speaker = args.warmup_speaker or args.speaker
        request_instructs = (
            args.request_instructs[: len(texts)]
            if args.request_instructs
            else [default_instruct] * len(texts)
        )
        request_speakers = (
            args.request_speakers[: len(texts)]
            if args.request_speakers
            else [args.speaker] * len(texts)
        )
        warmup_outputs: list[tuple[np.ndarray, int, float]] = []
        for _ in range(max(0, args.warmup)):
            result = run_once(args.warmup_text, warmup_instruct, warmup_speaker)
            warmup_outputs.append(result)
            timing.write(f"qwen3_tts.synthesize_wall_ms {result[2]:.6f}\n")

        last_outputs: list[tuple[np.ndarray, int, float]] = []
        for text, instruct, speaker in zip(texts, request_instructs, request_speakers):
            current: tuple[np.ndarray, int, float] | None = None
            for _ in range(max(1, args.iterations)):
                current = run_once(text, instruct, speaker)
                timing.write(f"qwen3_tts.synthesize_wall_ms {current[2]:.6f}\n")
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
        print(f"qwen3_tts.synthesize_wall_ms={wall_ms}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
