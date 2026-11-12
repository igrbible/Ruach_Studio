from __future__ import annotations

import argparse
import json
import sys
import time
import wave
from datetime import datetime
from pathlib import Path

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_OMNIVOICE_ROOT = REPO_ROOT / "reference" / "OmniVoice"
if str(REFERENCE_OMNIVOICE_ROOT) not in sys.path:
    sys.path.insert(0, str(REFERENCE_OMNIVOICE_ROOT))

kDefaultWarmupText = "This is a fixed warmup request for the OmniVoice session benchmark."
def timestamp_seconds_local() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def write_pcm16_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    pcm16 = np.round(clipped * 32767.0).astype(np.int16, copy=False)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm16.tobytes())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Warm repeated Python benchmark for the OmniVoice reference model.")
    parser.add_argument("--model", type=Path, default=Path("models/OmniVoice"))
    parser.add_argument("--task", choices=("voice_clone", "voice_design", "auto_voice"), default="voice_clone")
    parser.add_argument("--text", action="append", dest="texts", default=[])
    parser.add_argument("--clone-audio", type=Path, default=None)
    parser.add_argument("--reference-text", default="")
    parser.add_argument("--instruct", default="")
    parser.add_argument("--warmup-instruct", default="")
    parser.add_argument("--request-instruct", action="append", dest="request_instructs", default=[])
    parser.add_argument("--language", default="en")
    parser.add_argument("--backend", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--warmup-text", default=kDefaultWarmupText)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--num-step", type=int, default=32)
    parser.add_argument("--guidance-scale", type=float, default=2.0)
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--duration", type=float, default=None)
    parser.add_argument("--t-shift", type=float, default=0.1)
    parser.add_argument("--denoise", choices=("true", "false"), default="true")
    parser.add_argument("--postprocess-output", choices=("true", "false"), default="true")
    parser.add_argument("--layer-penalty-factor", type=float, default=5.0)
    parser.add_argument("--position-temperature", type=float, default=5.0)
    parser.add_argument("--class-temperature", type=float, default=0.0)
    parser.add_argument("--audio-chunk-duration", type=float, default=15.0)
    parser.add_argument("--audio-chunk-threshold", type=float, default=30.0)
    parser.add_argument("--audio-out", type=Path, default=Path("omnivoice_python_audio.wav"))
    parser.add_argument("--audio-out-dir", type=Path, default=None)
    parser.add_argument("--timing-file", type=Path)
    parser.add_argument("--artifact-stamp", default="")
    return parser.parse_args()


def parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise RuntimeError(f"invalid boolean: {value}")


def summarize(audio: np.ndarray, sample_rate: int, text: str) -> dict[str, object]:
    audio = audio.astype(np.float32, copy=False)
    return {
        "sample_rate": sample_rate,
        "channels": 1,
        "samples": int(audio.shape[0]),
        "sum": float(audio.sum(dtype=np.float64)),
        "mean_abs": float(np.abs(audio).mean(dtype=np.float64)) if audio.size else 0.0,
        "rms": float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) if audio.size else 0.0,
        "min": float(audio.min()) if audio.size else 0.0,
        "max": float(audio.max()) if audio.size else 0.0,
        "request_char_count": len(text),
        "first_samples": audio[:32].tolist(),
    }


def timing_line(timestamp: str, key: str, value: object) -> str:
    if isinstance(value, str):
        return f"[TIMING ts={timestamp}] {key} {value}"
    if isinstance(value, bool):
        return f"[TIMING ts={timestamp}] {key} {1 if value else 0}"
    if isinstance(value, int):
        return f"[TIMING ts={timestamp}] {key} {value}"
    return f"[TIMING ts={timestamp}] {key} {float(value):.6f}"


def write_sectioned_timing_log(path: Path, sections: list[tuple[str, list[str]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as output:
        for index, (name, lines) in enumerate(sections):
            output.write(f"[{name}]\n")
            for line in lines:
                output.write(f"{line}\n")
            if index + 1 < len(sections):
                output.write("\n")


def synchronize_if_needed(torch_module, backend: str, device: int) -> None:
    if backend == "cuda":
        torch_module.cuda.synchronize(device)


def main() -> int:
    args = parse_args()
    texts = list(args.texts)
    if not texts:
        texts = ["Hello from OmniVoice. This benchmark should produce stable speech for comparison."]

    stamp = args.artifact_stamp or timestamp_seconds_local()
    timing_path = args.timing_file or (
        REPO_ROOT / "build" / "logs" / "parity" / "omnivoice" / f"omnivoice_python_{args.backend}-{stamp}.log"
    )

    import torch

    torch.set_num_threads(max(1, args.threads))
    device = f"cuda:{args.device}" if args.backend == "cuda" else "cpu"
    if args.backend == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA backend requested but torch.cuda.is_available() is false")

    from omnivoice.models.omnivoice import OmniVoice

    model = OmniVoice.from_pretrained(str(args.model), device_map=device, dtype=torch.float32)

    clone_audio = None
    if args.clone_audio:
        clone_audio = str((REPO_ROOT / args.clone_audio).resolve()) if not args.clone_audio.is_absolute() else str(args.clone_audio)

    if args.task == "voice_clone":
        if clone_audio is None:
            raise RuntimeError("OmniVoice warmbench voice_clone task requires --clone-audio")
        if not args.reference_text:
            raise RuntimeError("OmniVoice warmbench voice_clone task requires --reference-text")
    elif args.task == "voice_design":
        if clone_audio is not None:
            raise RuntimeError("OmniVoice warmbench voice_design task must not receive --clone-audio")
        if not ((args.warmup_instruct or args.instruct).strip()):
            raise RuntimeError("OmniVoice warmbench voice_design task requires a non-empty instruct")
    elif args.task == "auto_voice":
        if clone_audio is not None:
            raise RuntimeError("OmniVoice warmbench auto_voice task must not receive --clone-audio")
        if args.instruct.strip() or args.warmup_instruct.strip() or any(item.strip() for item in args.request_instructs):
            raise RuntimeError("OmniVoice warmbench auto_voice task must not receive instruct values")

    common_generate_kwargs = {
        "language": args.language,
        "ref_text": args.reference_text if clone_audio else None,
        "ref_audio": clone_audio,
        "duration": args.duration,
        "num_step": args.num_step,
        "guidance_scale": args.guidance_scale,
        "speed": args.speed,
        "t_shift": args.t_shift,
        "denoise": parse_bool(args.denoise),
        "postprocess_output": parse_bool(args.postprocess_output),
        "layer_penalty_factor": args.layer_penalty_factor,
        "position_temperature": args.position_temperature,
        "class_temperature": args.class_temperature,
        "audio_chunk_duration": args.audio_chunk_duration,
        "audio_chunk_threshold": args.audio_chunk_threshold,
    }

    log_sections: list[tuple[str, list[str]]] = []
    warmup_results: list[np.ndarray] = []
    for warmup_index in range(max(0, args.warmup)):
        warmup_kwargs = dict(common_generate_kwargs)
        warmup_kwargs["instruct"] = (args.warmup_instruct or args.instruct) or None
        synchronize_if_needed(torch, args.backend, args.device)
        started = time.perf_counter()
        warmup_audio = model.generate(text=args.warmup_text, **warmup_kwargs)[0]
        synchronize_if_needed(torch, args.backend, args.device)
        wall_ms = (time.perf_counter() - started) * 1000.0
        warmup_results.append(np.asarray(warmup_audio, dtype=np.float32))
        ts = timestamp_seconds_local()
        log_sections.append((
            f"warmup{warmup_index + 1}",
            [
                timing_line(ts, "omnivoice.request_char_count", len(args.warmup_text)),
                timing_line(ts, "omnivoice.request_wall_ms", wall_ms),
            ],
        ))

    last_audios: list[np.ndarray] = [np.zeros(0, dtype=np.float32) for _ in texts]
    wall_sums = [0.0 for _ in texts]
    last_wall_ms = [0.0 for _ in texts]
    sample_rate = int(model.sampling_rate)
    for request_index, text in enumerate(texts):
        request_kwargs = dict(common_generate_kwargs)
        request_instruct = args.request_instructs[request_index] if request_index < len(args.request_instructs) else args.instruct
        request_kwargs["instruct"] = request_instruct or None
        for iteration in range(max(1, args.iterations)):
            synchronize_if_needed(torch, args.backend, args.device)
            started = time.perf_counter()
            generated = model.generate(text=text, **request_kwargs)[0]
            synchronize_if_needed(torch, args.backend, args.device)
            last_wall_ms[request_index] = (time.perf_counter() - started) * 1000.0
            wall_sums[request_index] += last_wall_ms[request_index]
            last_audios[request_index] = np.asarray(generated, dtype=np.float32)
            ts = timestamp_seconds_local()
            log_sections.append((
                f"iteration{iteration + 1}.request{request_index + 1}",
                [
                    timing_line(ts, "omnivoice.request_char_count", len(text)),
                    timing_line(ts, "omnivoice.request_wall_ms", last_wall_ms[request_index]),
                ],
            ))

    write_sectioned_timing_log(timing_path, log_sections)

    for warmup_index, audio in enumerate(warmup_results):
        print(f"warmup_text[{warmup_index}]={args.warmup_text}")
        print(f"warmup_summary_json[{warmup_index}]={json.dumps(summarize(audio, sample_rate, args.warmup_text), ensure_ascii=False)}")
    for request_index, text in enumerate(texts):
        print(f"text[{request_index}]={text}")
        print(f"summary_json[{request_index}]={json.dumps(summarize(last_audios[request_index], sample_rate, text), ensure_ascii=False)}")
        if len(texts) == 1 and request_index == 0:
            print(f"text={text}")
            print(f"summary_json={json.dumps(summarize(last_audios[request_index], sample_rate, text), ensure_ascii=False)}")
    print(f"timing_out={timing_path}")

    if args.audio_out_dir is not None:
        args.audio_out_dir.mkdir(parents=True, exist_ok=True)
        for request_index, audio in enumerate(last_audios):
            request_audio_out = args.audio_out_dir / f"request_{request_index}.wav"
            write_pcm16_wav(request_audio_out, audio, sample_rate)
            print(f"audio_out[{request_index}]={request_audio_out}")

    write_pcm16_wav(args.audio_out, last_audios[-1], sample_rate)
    print(f"audio_out={args.audio_out}")

    for request_index, wall_sum in enumerate(wall_sums):
        print(f"average[{request_index}]")
        print(f"omnivoice.request_wall_ms={wall_sum / float(max(1, args.iterations))}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
