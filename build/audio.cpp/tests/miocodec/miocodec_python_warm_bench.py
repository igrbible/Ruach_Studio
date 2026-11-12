#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from contextlib import nullcontext
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_ROOT = REPO_ROOT / "reference" / "MioCodec" / "src"
DEFAULT_MODEL = REPO_ROOT / "models" / "MioCodec-25Hz-44.1kHz-v2"
DEFAULT_AUDIO = REPO_ROOT / "resources" / "a.wav"
DEFAULT_WARMUP_AUDIO = REPO_ROOT / "resources" / "sample.wav"
TORCHAUDIO_WAVLM_FILENAME = "wavlm_base_plus.pth"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Python reference MioCodec warmbench.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--audio", type=Path, default=DEFAULT_AUDIO)
    parser.add_argument("--warmup-audio", type=Path, default=DEFAULT_WARMUP_AUDIO)
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--request-json", default="")
    parser.add_argument("--request-sequence-json", default="")
    parser.add_argument("--warmup-request-json", default="")
    parser.add_argument("--backend", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--max-audio-seconds", type=float, default=0.0)
    parser.add_argument("--audio-out", type=Path, default=Path("miocodec_python_audio.wav"))
    parser.add_argument("--audio-out-dir", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--timing-file", type=Path, default=Path("miocodec_python_timing.log"))
    parser.add_argument("--ssl-checkpoint", type=Path, default=None)
    parser.add_argument("--precision", choices=("fp32", "reference"), default="fp32")
    return parser.parse_args()


def resolve_repo_path(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    if not value:
        return [fallback]
    return [Path(item) for item in value.split(",") if item]


def load_json_requests(args: argparse.Namespace) -> list[dict[str, Any]]:
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
    return []


def require_request_path(request: dict[str, Any], key: str) -> Path:
    value = request.get(key)
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"MioCodec warmbench request missing required field: {key}")
    return Path(value)


def sync_device(backend: str, device: int) -> None:
    if backend == "cuda":
        import torch

        torch.cuda.synchronize(device)


def audio_summary(audio: np.ndarray, sample_rate: int, wall_ms: float) -> dict[str, Any]:
    flat = np.asarray(audio, dtype=np.float32).reshape(-1)
    if flat.size == 0:
        raise RuntimeError("MioCodec warmbench received empty decoded audio")
    return {
        "family": "miocodec",
        "sample_rate": int(sample_rate),
        "channels": 1,
        "samples": int(flat.size),
        "duration_sec": float(flat.size / sample_rate) if sample_rate else 0.0,
        "sum": float(np.sum(flat, dtype=np.float64)),
        "mean_abs": float(np.mean(np.abs(flat), dtype=np.float64)),
        "rms": float(np.sqrt(np.mean(np.square(flat, dtype=np.float64)))),
        "min": float(np.min(flat)),
        "max": float(np.max(flat)),
        "roundtrip_wall_ms": float(wall_ms),
    }


def write_audio(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.asarray(audio, dtype=np.float32), int(sample_rate))


def configure_local_model_loading(model_dir: Path, ssl_checkpoint_arg: Path | None) -> None:
    model_dir = model_dir.resolve()
    if not (model_dir / "config.yaml").is_file():
        raise RuntimeError(f"MioCodec config.yaml not found in local model dir: {model_dir}")
    if not (model_dir / "model.safetensors").is_file():
        raise RuntimeError(f"MioCodec model.safetensors not found in local model dir: {model_dir}")

    if ssl_checkpoint_arg is not None:
        ssl_checkpoint = resolve_repo_path(ssl_checkpoint_arg).resolve()
        if ssl_checkpoint.name != TORCHAUDIO_WAVLM_FILENAME:
            raise RuntimeError(f"MioCodec WavLM checkpoint must be named {TORCHAUDIO_WAVLM_FILENAME}")
        try:
            ssl_checkpoint.relative_to(model_dir)
        except ValueError as exc:
            raise RuntimeError(f"MioCodec WavLM checkpoint must live under the model dir: {model_dir}") from exc
        torch_hub_dir = ssl_checkpoint.parent.parent
    else:
        torch_hub_dir = model_dir / "torch_hub"
        ssl_checkpoint = torch_hub_dir / "checkpoints" / TORCHAUDIO_WAVLM_FILENAME
    if not ssl_checkpoint.is_file():
        raise RuntimeError(
            "MioCodec warmbench requires local WavLM weights under the model dir. "
            f"Expected: {ssl_checkpoint}. "
            "Do not rely on torchaudio downloads or ~/.cache for this benchmark."
        )

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TORCH_HOME"] = str(torch_hub_dir)

    import torch

    torch.hub.set_dir(str(torch_hub_dir))

    def reject_download(*_: object, **__: object) -> None:
        raise RuntimeError("network download attempted during MioCodec warmbench")

    torch.hub.download_url_to_file = reject_download


def main() -> int:
    args = parse_args()
    model_dir = resolve_repo_path(args.model)
    configure_local_model_loading(model_dir, args.ssl_checkpoint)

    if str(REFERENCE_ROOT) not in sys.path:
        sys.path.insert(0, str(REFERENCE_ROOT))

    import torch
    from miocodec import MioCodecModel, load_audio
    import miocodec.model as miocodec_model_module

    if args.precision == "fp32":
        def fp32_autocast_context(device_type: str):
            return nullcontext()

        miocodec_model_module._get_autocast_context = fp32_autocast_context
    print(f"reference_precision={args.precision}")

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA backend requested but torch.cuda.is_available() is false")
        torch.cuda.set_device(args.device)
        device = torch.device(f"cuda:{args.device}")
    else:
        device = torch.device("cpu")

    model = MioCodecModel.from_pretrained(
        config_path=str(model_dir / "config.yaml"),
        weights_path=str(model_dir / "model.safetensors"),
    ).eval().to(device)

    def load_request_audio(path: Path) -> torch.Tensor:
        waveform = load_audio(str(resolve_repo_path(path)), sample_rate=model.config.sample_rate)
        if args.max_audio_seconds > 0.0:
            max_samples = int(round(args.max_audio_seconds * model.config.sample_rate))
            waveform = waveform[:max_samples]
        if waveform.numel() == 0:
            raise RuntimeError(f"MioCodec warmbench loaded empty audio: {path}")
        return waveform.to(device)

    def run_vc_once(source_path: Path, target_path: Path) -> tuple[np.ndarray, int, float]:
        source = load_request_audio(source_path)
        target = load_request_audio(target_path)
        sync_device(args.backend, args.device)
        started = time.perf_counter()
        with torch.inference_mode():
            decoded = model.voice_conversion(source, target)
        sync_device(args.backend, args.device)
        wall_ms = (time.perf_counter() - started) * 1000.0
        return decoded.detach().cpu().float().numpy(), int(model.config.sample_rate), wall_ms

    timing_lines: list[str] = []
    json_requests = load_json_requests(args)
    if args.warmup_request_json:
        warmup_request = json.loads(args.warmup_request_json)
        if not isinstance(warmup_request, dict):
            raise RuntimeError("--warmup-request-json must decode to an object")
        warmup_source = resolve_repo_path(require_request_path(warmup_request, "source_audio"))
        warmup_target = resolve_repo_path(require_request_path(warmup_request, "target_audio"))
    else:
        warmup_source = resolve_repo_path(args.warmup_audio)
        warmup_target = warmup_source
    for warmup_index in range(max(0, args.warmup)):
        audio, sample_rate, wall_ms = run_vc_once(warmup_source, warmup_target)
        timing_lines.append(f"miocodec.roundtrip_wall_ms {wall_ms:.6f}")
        print(f"warmup_audio[{warmup_index}]={warmup_source}")
        print(
            f"warmup_summary_json[{warmup_index}]="
            + json.dumps(audio_summary(audio, sample_rate, wall_ms), ensure_ascii=False)
        )

    if json_requests:
        request_pairs = [
            (
                resolve_repo_path(require_request_path(request, "source_audio")),
                resolve_repo_path(require_request_path(request, "target_audio")),
            )
            for request in json_requests
        ]
    else:
        request_pairs = [
            (resolve_repo_path(path), resolve_repo_path(path))
            for path in parse_csv_paths(args.audio_sequence, args.audio)
        ]
    output_dir = args.audio_out_dir or args.output_dir
    last_outputs: list[tuple[np.ndarray, int, float]] = []
    sequence_steps: list[dict[str, Any]] = []
    for request_index, (source_path, target_path) in enumerate(request_pairs):
        current: tuple[np.ndarray, int, float] | None = None
        for _ in range(max(1, args.iterations)):
            current = run_vc_once(source_path, target_path)
            timing_lines.append(f"miocodec.roundtrip_wall_ms {current[2]:.6f}")
        assert current is not None
        last_outputs.append(current)
        audio, sample_rate, wall_ms = current
        print(f"audio[{request_index}]={source_path}")
        print(
            f"summary_json[{request_index}]="
            + json.dumps(audio_summary(audio, sample_rate, wall_ms), ensure_ascii=False)
        )
        out_path = None
        if output_dir is not None:
            out_path = output_dir / f"request_{request_index}.wav"
            write_audio(out_path, audio, sample_rate)
            print(f"audio_out[{request_index}]={out_path}")
        if out_path is not None:
            sequence_steps.append(
                {
                    "request_index": request_index,
                    "stems": [
                        {
                            "name": "audio",
                            "audio": str(out_path),
                            "summary": audio_summary(audio, sample_rate, wall_ms),
                        }
                    ],
                    "metrics": {"wall_ms": wall_ms},
                }
            )

    if last_outputs:
        audio, sample_rate, _ = last_outputs[-1]
        write_audio(args.audio_out, audio, sample_rate)
        print(f"audio_out={args.audio_out}")

    if json_requests:
        print(
            json.dumps(
                {
                    "family": "miocodec",
                    "backend": args.backend,
                    "steps": sequence_steps,
                },
                ensure_ascii=False,
            )
        )

    args.timing_file.parent.mkdir(parents=True, exist_ok=True)
    args.timing_file.write_text("\n".join(timing_lines) + "\n", encoding="utf-8")
    print(f"timing_out={args.timing_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
