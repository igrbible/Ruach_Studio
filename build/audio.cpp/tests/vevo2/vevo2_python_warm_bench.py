#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import soundfile as sf
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_ROOT = REPO_ROOT / "reference" / "Amphion"
if str(REFERENCE_ROOT) not in sys.path:
    sys.path.insert(0, str(REFERENCE_ROOT))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from models.svc.vevo2.vevo2_utils import Vevo2InferencePipeline  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Python reference Vevo2 warmbench.")
    parser.add_argument("--family", default="vevo2")
    parser.add_argument("--model", default=str(REPO_ROOT / "models" / "Vevo2"))
    parser.add_argument("--backend", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=0)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--timing-file", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--noise-file", default="")
    parser.add_argument("--request-json", default="")
    parser.add_argument("--request-sequence-json", default="")
    return parser.parse_args()


def resolve_path(path: str) -> str:
    value = Path(path)
    return str(value if value.is_absolute() else REPO_ROOT / value)


def normalize_device(backend: str, device_index: int) -> torch.device:
    if backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA backend requested but torch.cuda.is_available() is false")
        torch.cuda.set_device(device_index)
        return torch.device(f"cuda:{device_index}")
    return torch.device("cpu")


def sync_device(device: torch.device) -> None:
    if device.type == "cuda":
        torch.cuda.synchronize(device)


def set_request_seed(seed: int, device: torch.device) -> None:
    torch.manual_seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed & 0xFFFFFFFF)
    random.seed(seed)


def load_requests(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.request_sequence_json:
        payload = json.loads(args.request_sequence_json)
        if not isinstance(payload, list):
            raise RuntimeError("--request-sequence-json must decode to a list")
        return payload
    if args.request_json:
        payload = json.loads(args.request_json)
        if not isinstance(payload, dict):
            raise RuntimeError("--request-json must decode to an object")
        return [payload]
    raise RuntimeError("Vevo2 warmbench requires --request-json or --request-sequence-json")


def force_module_f32(module: Any, device: torch.device) -> None:
    if module is not None and hasattr(module, "to"):
        module.to(device=device, dtype=torch.float32)


def force_pipeline_f32(pipeline: Vevo2InferencePipeline, device: torch.device) -> None:
    for name in (
        "ar_model",
        "style_tokenizer",
        "content_style_tokenizer",
        "fmt_model",
        "mel_model",
        "vocoder_model",
        "whisper_model",
    ):
        force_module_f32(getattr(pipeline, name, None), device)
    if getattr(pipeline, "use_normed_whisper", False):
        pipeline.whisper_mean = pipeline.whisper_mean.to(device=device, dtype=torch.float32)
        pipeline.whisper_std = pipeline.whisper_std.to(device=device, dtype=torch.float32)


def load_pipeline(model_root: Path, device: torch.device) -> Vevo2InferencePipeline:
    content_style_tokenizer_ckpt_path = model_root / "tokenizer" / "contentstyle_fvq16384_12.5hz"
    prosody_tokenizer_ckpt_path = model_root / "tokenizer" / "prosody_fvq512_6.25hz"
    ar_root = model_root / "contentstyle_modeling" / "posttrained"
    fm_root = model_root / "acoustic_modeling" / "fm_emilia101k_singnet7k_repa"
    vocoder_root = model_root / "vocoder"
    pipeline = Vevo2InferencePipeline(
        prosody_tokenizer_ckpt_path=str(prosody_tokenizer_ckpt_path),
        content_style_tokenizer_ckpt_path=str(content_style_tokenizer_ckpt_path),
        ar_cfg_path=str(ar_root / "amphion_config.json"),
        ar_ckpt_path=str(ar_root),
        fmt_cfg_path=str(fm_root / "config.json"),
        fmt_ckpt_path=str(fm_root),
        vocoder_cfg_path=str(vocoder_root / "config.json"),
        vocoder_ckpt_path=str(vocoder_root),
        device=device,
    )
    force_pipeline_f32(pipeline, device)
    return pipeline


FM_ROUTES = {
    "fm",
    "inference_fm",
    "source_audio_to_target_voice",
    "style_preserved_vc",
    "style_preserved_svc",
    "vc",
    "svc",
}

AR_ROUTES = {
    "ar_and_fm",
    "inference_ar_and_fm",
    "text_prosody_to_target_voice",
    "zero_shot_tts",
    "tts",
    "text_to_speech",
    "text_to_singing",
    "svs",
    "singing_voice_synthesis",
    "style_converted_vc",
    "style_converted_svc",
    "style_conversion",
    "editing",
    "speech_editing",
    "singing_editing",
    "singing_style_conversion",
    "melody_control",
    "humming_to_singing",
    "instrument_to_singing",
}


def route_default_use_prosody(path: str) -> bool:
    return path in {
        "style_converted_vc",
        "style_converted_svc",
        "style_conversion",
        "editing",
        "speech_editing",
        "singing_editing",
        "singing_style_conversion",
        "melody_control",
        "humming_to_singing",
        "instrument_to_singing",
    }


def route_default_use_pitch_shift(path: str) -> bool:
    return path in {
        "style_preserved_vc",
        "style_preserved_svc",
        "vc",
        "svc",
        "style_converted_svc",
        "singing_style_conversion",
        "melody_control",
        "humming_to_singing",
        "instrument_to_singing",
    }


def route_uses_source_as_reference(path: str) -> bool:
    return path in {
        "style_converted_vc",
        "style_converted_svc",
        "style_conversion",
        "editing",
        "speech_editing",
        "singing_editing",
        "singing_style_conversion",
    }


def optional_audio_path(request: dict[str, Any], key: str) -> str | None:
    value = request.get(key)
    return resolve_path(str(value)) if value else None


@contextlib.contextmanager
def controlled_fm_noise(noise_file: str, mel_dim: int) -> Iterator[None]:
    if not noise_file:
        yield
        return
    noise_values = np.fromfile(noise_file, dtype=np.float32)
    if noise_values.size == 0:
        raise RuntimeError(f"Vevo2 FM controlled noise file is empty: {noise_file}")
    original_randn = torch.randn
    used = False

    def randn(*args: Any, **kwargs: Any) -> torch.Tensor:
        nonlocal used
        shape = args[0] if args else kwargs.get("size")
        if (
            not used
            and isinstance(shape, (tuple, list, torch.Size))
            and len(shape) == 3
            and int(shape[-1]) == mel_dim
        ):
            count = int(np.prod([int(dim) for dim in shape]))
            if noise_values.size < count:
                raise RuntimeError(
                    f"Vevo2 FM controlled noise file is too short: expected at least {count} floats, "
                    f"got {noise_values.size}"
                )
            used = True
            array = noise_values[:count].reshape(tuple(int(dim) for dim in shape)).copy()
            tensor = torch.from_numpy(array)
            target_device = kwargs.get("device")
            target_dtype = kwargs.get("dtype", torch.float32)
            if target_device is not None:
                tensor = tensor.to(device=target_device)
            if target_dtype is not None:
                tensor = tensor.to(dtype=target_dtype)
            return tensor
        return original_randn(*args, **kwargs)

    torch.randn = randn
    try:
        yield
    finally:
        torch.randn = original_randn
    if not used:
        raise RuntimeError("Vevo2 FM controlled noise was not consumed")


def summarize_audio(audio: np.ndarray, sample_rate: int) -> dict[str, Any]:
    if audio.ndim == 1:
        frames = int(audio.shape[0])
        channels = 1
        flat = audio.astype(np.float32, copy=False)
    else:
        frames = int(audio.shape[0])
        channels = int(audio.shape[1])
        flat = audio.astype(np.float32, copy=False).reshape(-1)
    if flat.size == 0:
        raise RuntimeError("Vevo2 warmbench summary received empty audio")
    return {
        "sample_rate": int(sample_rate),
        "channels": channels,
        "samples": int(flat.size),
        "frames": frames,
        "sum": float(np.sum(flat, dtype=np.float64)),
        "mean_abs": float(np.mean(np.abs(flat), dtype=np.float64)),
        "rms": float(np.sqrt(np.mean(np.square(flat), dtype=np.float64))),
        "min": float(np.min(flat)),
        "max": float(np.max(flat)),
    }


def write_audio(path: Path, waveform: torch.Tensor | np.ndarray, sample_rate: int = 24000) -> np.ndarray:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(waveform, torch.Tensor):
        audio = waveform.detach().cpu().numpy()
    else:
        audio = np.asarray(waveform)
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 2 and audio.shape[0] == 1:
        audio = audio[0]
    sf.write(str(path), audio, sample_rate, subtype="PCM_16")
    normalized, _ = sf.read(str(path), always_2d=True)
    return np.asarray(normalized, dtype=np.float32)


def run_request(
    pipeline: Vevo2InferencePipeline,
    request: dict[str, Any],
    output_dir: Path,
    device: torch.device,
    noise_file: str,
) -> tuple[dict[str, Any], list[str]]:
    seed = int(request.get("seed", 1234))
    if seed < 0:
        raise RuntimeError("Vevo2 warmbench requires a non-negative seed")
    set_request_seed(seed, device)
    path = str(request.get("path", "ar_and_fm"))
    started = time.perf_counter()
    with controlled_fm_noise(noise_file, int(pipeline.fmt_model.mel_dim)):
        use_pitch_shift = bool(request.get("use_pitch_shift", route_default_use_pitch_shift(path)))
        if path in FM_ROUTES:
            audio = pipeline.inference_fm(
                src_wav_path=resolve_path(str(request["source_wav_path"])),
                timbre_ref_wav_path=resolve_path(str(request["timbre_ref_wav_path"])),
                src_wav_text=str(request.get("source_wav_text", "")),
                timbre_ref_wav_text=str(request.get("timbre_ref_wav_text", "")),
                use_pitch_shift=use_pitch_shift,
                used_duration_of_timbre_ref_wav_path=request.get("used_duration_of_timbre_ref_seconds"),
                flow_matching_steps=int(request.get("flow_matching_steps", 32)),
                display_audio=False,
            )
        elif path in AR_ROUTES:
            source_wav_path = optional_audio_path(request, "source_wav_path")
            prosody_wav_path = optional_audio_path(request, "prosody_wav_path")
            style_ref_wav_path = optional_audio_path(request, "style_ref_wav_path")
            timbre_ref_wav_path = optional_audio_path(request, "timbre_ref_wav_path")
            if route_uses_source_as_reference(path):
                prosody_wav_path = prosody_wav_path or source_wav_path
                style_ref_wav_path = style_ref_wav_path or source_wav_path
                timbre_ref_wav_path = timbre_ref_wav_path or source_wav_path
            audio = pipeline.inference_ar_and_fm(
                target_text=str(request["target_text"]),
                prosody_wav_path=prosody_wav_path,
                style_ref_wav_path=style_ref_wav_path,
                style_ref_wav_text=str(request.get("style_ref_text", "")),
                timbre_ref_wav_path=timbre_ref_wav_path,
                use_prosody_code=bool(request.get("use_prosody_code", route_default_use_prosody(path))),
                predict_target_prosody=bool(request.get("predict_target_prosody", False)),
                top_k=int(request.get("top_k", 25)),
                top_p=float(request.get("top_p", 0.8)),
                temperature=float(request.get("temperature", 1.0)),
                use_pitch_shift=use_pitch_shift,
                prosody_wav_shifted_steps=int(request.get("prosody_wav_shifted_steps", 0)),
                style_ref_wav_shifted_steps=int(request.get("style_ref_wav_shifted_steps", 0)),
                target_duration=request.get("target_duration_seconds"),
                used_duration_of_timbre_ref_wav_path=request.get("used_duration_of_timbre_ref_seconds"),
                flow_matching_steps=int(request.get("flow_matching_steps", 32)),
                display_audio=False,
            )
        else:
            raise RuntimeError(f"unsupported Vevo2 warmbench path: {path}")
    sync_device(device)
    wall_ms = (time.perf_counter() - started) * 1000.0

    audio_path = output_dir / "audio.wav"
    written = write_audio(audio_path, audio)
    step = {
        "request": request,
        "stems": [
            {
                "name": "audio",
                "audio": str(audio_path),
                "summary": summarize_audio(written, 24000),
            }
        ],
        "metrics": {"wall_ms": wall_ms},
    }
    return step, [f"vevo2.wall_ms {wall_ms:.6f}"]


def main() -> int:
    args = parse_args()
    if args.family != "vevo2":
        raise RuntimeError(f"unsupported Vevo2 warmbench family: {args.family}")

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    torch.set_num_threads(max(1, args.threads))
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.backends.cudnn.benchmark = False
    device = normalize_device(args.backend, args.device)
    set_request_seed(0, device)

    model_root = Path(args.model)
    if not model_root.is_absolute():
        model_root = REPO_ROOT / model_root
    if not model_root.is_dir():
        raise RuntimeError(f"Vevo2 model root not found: {model_root}")
    noise_file = ""
    if args.noise_file:
        noise_path = Path(args.noise_file)
        noise_file = str(noise_path if noise_path.is_absolute() else REPO_ROOT / noise_path)
    os.chdir(REFERENCE_ROOT)
    pipeline = load_pipeline(model_root, device)

    requests = load_requests(args)
    output_root = Path(args.output_dir) if args.output_dir else REPO_ROOT / "build" / "logs" / "parity" / "vevo2_python_outputs"
    timing_lines: list[str] = [
        f"vevo2.backend {args.backend}",
        "vevo2.python_tf32_disabled 1",
        "vevo2.python_force_f32 1",
    ]
    for warmup_index in range(max(0, args.warmup)):
        _, warmup_timing = run_request(
            pipeline,
            requests[0],
            output_root / "warmup" / f"{warmup_index:02d}",
            device,
            noise_file,
        )
        timing_lines.extend(warmup_timing)

    steps: list[dict[str, Any]] = []
    for request_index, request in enumerate(requests):
        total_ms = 0.0
        last_step: dict[str, Any] | None = None
        for iteration in range(max(1, args.iterations)):
            step, run_timing = run_request(
                pipeline,
                request,
                output_root / f"request_{request_index:02d}" / f"iter_{iteration:02d}",
                device,
                noise_file,
            )
            total_ms += float(step["metrics"]["wall_ms"])
            last_step = step
            timing_lines.extend(run_timing)
        assert last_step is not None
        last_step = dict(last_step)
        last_step["request_index"] = request_index
        last_step["metrics"] = {"wall_ms": total_ms / float(max(1, args.iterations))}
        print(f"vevo2.wall_ms={last_step['metrics']['wall_ms']}")
        steps.append(last_step)

    if args.timing_file:
        timing_path = Path(args.timing_file)
        timing_path.parent.mkdir(parents=True, exist_ok=True)
        timing_path.write_text("\n".join(timing_lines) + "\n", encoding="utf-8")

    summary = {
        "family": "vevo2",
        "backend": args.backend,
        "sequence_steps": steps,
    }
    print(f"summary_json={json.dumps(summary, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
