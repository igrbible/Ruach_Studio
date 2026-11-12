#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import json
import random
import tempfile
import sys
import time
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import soundfile as sf


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = REPO_ROOT / "models" / "VoxCPM2"
DEFAULT_REFERENCE_SRC = REPO_ROOT / "reference" / "VoxCPM" / "src"
DEFAULT_CASE_CATALOG = REPO_ROOT / "tools" / "voxcpm2" / "voxcpm2_warm_bench_cases.json"
DEFAULT_CASE_NAME = "realistic_mixed_longform"
DEFAULT_TEXT = "VoxCPM2 generates a clear reference sentence for a benchmark request."
DENOISER_DISABLED_REASON = "VoxCPM2 denoising is disabled; models/VoxCPM2 must be self-contained."

GENERATE_KEYS = {
    "text",
    "prompt_wav_path",
    "prompt_text",
    "reference_wav_path",
    "cfg_value",
    "inference_timesteps",
    "min_len",
    "max_len",
    "normalize",
    "denoise",
    "retry_badcase",
    "retry_badcase_max_times",
    "retry_badcase_ratio_threshold",
}
REQUEST_META_KEYS = {
    "seed",
    "id",
}
PATH_KEYS = {
    "prompt_wav_path",
    "reference_wav_path",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Python reference VoxCPM2 warmbench.")
    parser.add_argument("--family", default="voxcpm2")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--reference-src", type=Path, default=DEFAULT_REFERENCE_SRC)
    parser.add_argument("--backend", choices=("cpu", "cuda"), default="cuda")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--warmup", type=int, default=0)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--run-mode", choices=("offline", "streaming"), default="offline")
    parser.add_argument("--text", action="append", dest="texts", default=[])
    parser.add_argument("--warmup-text", default=DEFAULT_TEXT)
    parser.add_argument("--case-catalog", type=Path, default=DEFAULT_CASE_CATALOG)
    parser.add_argument("--case-name", default=DEFAULT_CASE_NAME)
    parser.add_argument("--request-json", default="")
    parser.add_argument("--request-sequence-json", default="")
    parser.add_argument("--warmup-request-json", default="")
    parser.add_argument("--cfg-value", type=float, default=2.0)
    parser.add_argument("--inference-timesteps", type=int, default=10)
    parser.add_argument("--min-len", type=int, default=2)
    parser.add_argument("--max-len", type=int, default=4096)
    parser.add_argument("--retry-badcase", choices=("true", "false"), default="true")
    parser.add_argument("--normalize", action="store_true")
    parser.add_argument("--optimize", action="store_true")
    parser.add_argument("--dtype", choices=("float32",), default="float32")
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--noise-file", default="")
    parser.add_argument("--audio-out", type=Path, default=Path("voxcpm2_python_audio.wav"))
    parser.add_argument("--audio-out-dir", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--timing-file", type=Path, default=Path("voxcpm2_python_timing.log"))
    return parser.parse_args()


def resolve_repo_path(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def parse_bool(value: str) -> bool:
    return value in {"1", "true", "yes"}


def request_bool(request: dict[str, Any], key: str, default: bool) -> bool:
    if key not in request:
        return default
    value = request[key]
    if isinstance(value, bool):
        return value
    raise RuntimeError(f"VoxCPM2 request field {key} must be a JSON boolean")


def load_json_requests(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.request_sequence_json:
        payload = json.loads(args.request_sequence_json)
        if not isinstance(payload, list):
            raise RuntimeError("--request-sequence-json must decode to a list")
        return [require_request_object(item) for item in payload]
    if args.request_json:
        payload = json.loads(args.request_json)
        return [require_request_object(payload)]
    if args.texts:
        return [{"text": text} for text in args.texts]
    return load_case(args.case_catalog, args.case_name)["requests"]


def load_warmup_request(args: argparse.Namespace) -> dict[str, Any]:
    if args.warmup_request_json:
        return require_request_object(json.loads(args.warmup_request_json))
    if not args.request_sequence_json and not args.request_json and not args.texts:
        return load_case(args.case_catalog, args.case_name)["warmup"]
    return {"text": args.warmup_text}


def load_case(catalog_path: Path, case_name: str) -> dict[str, Any]:
    path = resolve_repo_path(catalog_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"invalid VoxCPM2 case catalog: {path}")
    case = payload.get(case_name)
    if not isinstance(case, dict):
        available = ", ".join(sorted(str(key) for key in payload))
        raise RuntimeError(f"unknown VoxCPM2 case name {case_name!r}; available: {available}")
    warmup = case.get("warmup", {"text": DEFAULT_TEXT})
    requests = case.get("requests")
    if not isinstance(warmup, dict):
        raise RuntimeError(f"VoxCPM2 case {case_name!r} warmup must be an object")
    if not isinstance(requests, list) or not requests:
        raise RuntimeError(f"VoxCPM2 case {case_name!r} must contain non-empty requests")
    return {
        "warmup": require_request_object(warmup),
        "requests": [require_request_object(request) for request in requests],
    }


def require_request_object(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RuntimeError("VoxCPM2 request JSON must decode to an object")
    return dict(payload)


def normalize_request(request: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    unknown = set(request) - GENERATE_KEYS - REQUEST_META_KEYS
    if unknown:
        raise RuntimeError(f"unknown VoxCPM2 request field(s): {', '.join(sorted(unknown))}")
    out: dict[str, Any] = {
        "text": request.get("text", DEFAULT_TEXT),
        "cfg_value": float(request.get("cfg_value", args.cfg_value)),
        "inference_timesteps": int(request.get("inference_timesteps", args.inference_timesteps)),
        "min_len": int(request.get("min_len", args.min_len)),
        "max_len": int(request.get("max_len", args.max_len)),
        "normalize": request_bool(request, "normalize", args.normalize),
        "denoise": request_bool(request, "denoise", False),
        "retry_badcase": request_bool(request, "retry_badcase", parse_bool(args.retry_badcase)),
    }
    for key in (
        "prompt_text",
        "retry_badcase_max_times",
        "retry_badcase_ratio_threshold",
    ):
        if key in request:
            out[key] = request[key]
    for key in PATH_KEYS:
        if key in request and request[key] is not None:
            out[key] = str(resolve_repo_path(Path(str(request[key]))))
    if not isinstance(out["text"], str) or not out["text"].strip():
        raise RuntimeError("VoxCPM2 request requires non-empty text")
    if out["denoise"]:
        raise RuntimeError(DENOISER_DISABLED_REASON)
    return out


def add_reference_source(reference_src: Path) -> None:
    source = resolve_repo_path(reference_src)
    package = source / "voxcpm" / "__init__.py"
    if not package.is_file():
        raise RuntimeError(f"missing VoxCPM reference package: {package}")
    sys.path.insert(0, str(source))


def load_voxcpm_class(reference_src: Path):
    add_reference_source(reference_src)
    from voxcpm import VoxCPM
    import voxcpm

    module_path = Path(voxcpm.__file__).resolve()
    expected_root = resolve_repo_path(reference_src).resolve()
    try:
        module_path.relative_to(expected_root)
    except ValueError as exc:
        raise RuntimeError(f"VoxCPM imported from {module_path}, expected under {expected_root}") from exc
    return VoxCPM, module_path


@contextlib.contextmanager
def model_root_with_dtype(model_root: Path, dtype: str) -> Iterator[Path]:
    config_path = model_root / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("dtype") == dtype:
        yield model_root
        return
    with tempfile.TemporaryDirectory(prefix="voxcpm2-fp32-model-") as tmp:
        tmp_root = Path(tmp)
        for child in model_root.iterdir():
            if child.name == "config.json":
                continue
            target = tmp_root / child.name
            target.symlink_to(child.resolve(), target_is_directory=child.is_dir())
        config["dtype"] = dtype
        (tmp_root / "config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        yield tmp_root


def set_seed(seed: int, backend: str, device: int) -> None:
    import torch

    torch.manual_seed(seed)
    if backend == "cuda":
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed & 0xFFFFFFFF)
    random.seed(seed)


def sync_device(backend: str, device: int) -> None:
    if backend == "cuda":
        import torch

        torch.cuda.synchronize(device)


@contextlib.contextmanager
def controlled_cfm_noise(noise_file: str, in_channels: int) -> Iterator[None]:
    if not noise_file:
        yield
        return
    import torch

    noise_values = np.fromfile(noise_file, dtype=np.float32)
    if noise_values.size == 0:
        raise RuntimeError(f"VoxCPM2 CFM controlled noise file is empty: {noise_file}")
    original_randn = torch.randn
    offset = 0
    used = False

    def randn(*args: Any, **kwargs: Any) -> torch.Tensor:
        nonlocal offset, used
        shape = args[0] if args else kwargs.get("size")
        if (
            isinstance(shape, (tuple, list, torch.Size))
            and len(shape) == 3
            and int(shape[0]) == 1
            and int(shape[1]) == in_channels
        ):
            count = int(np.prod([int(dim) for dim in shape]))
            if noise_values.size < offset + count:
                raise RuntimeError(
                    f"VoxCPM2 CFM controlled noise file is too short: expected at least {offset + count} floats, "
                    f"got {noise_values.size}"
                )
            array = noise_values[offset : offset + count].reshape(tuple(int(dim) for dim in shape)).copy()
            offset += count
            used = True
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
        raise RuntimeError("VoxCPM2 CFM controlled noise was not consumed")


def configure_torch(args: argparse.Namespace) -> str:
    import torch

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA backend requested but torch.cuda.is_available() is false")
        torch.cuda.set_device(args.device)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        return f"cuda:{args.device}"
    return "cpu"


def summarize_audio(audio: np.ndarray, sample_rate: int, wall_ms: float, chunk_count: int) -> dict[str, Any]:
    flat = np.asarray(audio, dtype=np.float32).reshape(-1)
    if flat.size == 0:
        raise RuntimeError("VoxCPM2 warmbench received empty audio")
    return {
        "family": "voxcpm2",
        "sample_rate": int(sample_rate),
        "channels": 1,
        "samples": int(flat.size),
        "duration_sec": float(flat.size / sample_rate) if sample_rate else 0.0,
        "sum": float(np.sum(flat, dtype=np.float64)),
        "mean_abs": float(np.mean(np.abs(flat), dtype=np.float64)),
        "rms": float(np.sqrt(np.mean(np.square(flat, dtype=np.float64)))),
        "min": float(np.min(flat)),
        "max": float(np.max(flat)),
        "synthesize_wall_ms": float(wall_ms),
        "chunk_count": int(chunk_count),
    }


def write_audio(path: Path, audio: np.ndarray, sample_rate: int) -> np.ndarray:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.asarray(audio, dtype=np.float32).reshape(-1), int(sample_rate), subtype="PCM_16")
    written, _ = sf.read(str(path), always_2d=False, dtype="float32")
    return np.asarray(written, dtype=np.float32).reshape(-1)


def run_once(model: Any, request: dict[str, Any], args: argparse.Namespace) -> tuple[np.ndarray, int, float, int]:
    seed = int(request.get("seed", args.seed))
    if seed < 0:
        raise RuntimeError("VoxCPM2 seed must be non-negative")
    set_seed(seed, args.backend, args.device)
    kwargs = normalize_request(request, args)
    sync_device(args.backend, args.device)
    started = time.perf_counter()
    with controlled_cfm_noise(args.noise_file, int(model.tts_model.feat_decoder.in_channels)):
        if args.run_mode == "streaming":
            chunks = [
                np.asarray(chunk, dtype=np.float32).reshape(-1)
                for chunk in model.generate_streaming(**kwargs)
            ]
            wav = np.concatenate(chunks) if chunks else np.empty(0, dtype=np.float32)
            chunk_count = len(chunks)
        else:
            wav = model.generate(**kwargs)
            chunk_count = 0
    sync_device(args.backend, args.device)
    wall_ms = (time.perf_counter() - started) * 1000.0
    return (
        np.asarray(wav, dtype=np.float32).reshape(-1),
        int(model.tts_model.sample_rate),
        wall_ms,
        chunk_count,
    )


def main() -> int:
    args = parse_args()
    if args.family != "voxcpm2":
        raise RuntimeError(f"unsupported VoxCPM2 warmbench family: {args.family}")

    model_root = resolve_repo_path(args.model)
    if not model_root.is_dir():
        raise RuntimeError(f"VoxCPM2 model root not found: {model_root}")

    VoxCPM, module_path = load_voxcpm_class(args.reference_src)
    device = configure_torch(args)
    set_seed(args.seed, args.backend, args.device)

    load_start = time.perf_counter()
    with model_root_with_dtype(model_root, args.dtype) as runtime_model_root:
        model = VoxCPM.from_pretrained(
            str(runtime_model_root),
            load_denoiser=False,
            optimize=args.optimize,
            device=device,
        )
        sync_device(args.backend, args.device)
        load_ms = (time.perf_counter() - load_start) * 1000.0

    requests = load_json_requests(args)
    warmup_request = load_warmup_request(args)
    output_dir = args.audio_out_dir or args.output_dir

    timing_lines = [
        f"voxcpm2.reference_module {module_path}",
        f"voxcpm2.backend {args.backend}",
        f"voxcpm2.run_mode {args.run_mode}",
        f"voxcpm2.model_load_ms {load_ms:.6f}",
        "voxcpm2.load_denoiser 0",
        f"voxcpm2.optimize {1 if args.optimize else 0}",
        f"voxcpm2.dtype {args.dtype}",
        f"voxcpm2.case_name {args.case_name}",
    ]

    warmup_outputs: list[tuple[np.ndarray, int, float, int]] = []
    for _ in range(max(0, args.warmup)):
        result = run_once(model, warmup_request, args)
        warmup_outputs.append(result)
        timing_lines.append(f"voxcpm2.synthesize_wall_ms {result[2]:.6f}")

    last_outputs: list[tuple[np.ndarray, int, float, int]] = []
    for request in requests:
        current: tuple[np.ndarray, int, float, int] | None = None
        for _ in range(max(1, args.iterations)):
            current = run_once(model, request, args)
            timing_lines.append(f"voxcpm2.synthesize_wall_ms {current[2]:.6f}")
        assert current is not None
        last_outputs.append(current)

    args.timing_file.parent.mkdir(parents=True, exist_ok=True)
    args.timing_file.write_text("\n".join(timing_lines) + "\n", encoding="utf-8")

    for index, (audio, sample_rate, wall_ms, chunk_count) in enumerate(warmup_outputs):
        print(f"warmup_text[{index}]={warmup_request.get('text', DEFAULT_TEXT)}")
        print(
            f"warmup_summary_json[{index}]="
            + json.dumps(summarize_audio(audio, sample_rate, wall_ms, chunk_count), ensure_ascii=False, separators=(",", ":"))
        )

    sequence_steps: list[dict[str, Any]] = []
    for index, (request, output) in enumerate(zip(requests, last_outputs)):
        audio, sample_rate, wall_ms, chunk_count = output
        summary = summarize_audio(audio, sample_rate, wall_ms, chunk_count)
        print(f"text[{index}]={request.get('text', DEFAULT_TEXT)}")
        print(
            f"summary_json[{index}]="
            + json.dumps(summary, ensure_ascii=False, separators=(",", ":"))
        )
        step_audio_path = ""
        if output_dir is not None:
            out_path = output_dir / f"request_{index}.wav"
            write_audio(out_path, audio, sample_rate)
            step_audio_path = str(out_path)
            print(f"audio_out[{index}]={out_path}")
        stem: dict[str, Any] = {
            "name": "audio",
            "summary": summary,
        }
        if step_audio_path:
            stem["audio"] = step_audio_path
        sequence_steps.append(
            {
                "request_index": index,
                "stems": [stem],
                "metrics": {"wall_ms": wall_ms, "chunk_count": chunk_count},
            }
        )

    print(
        "summary_json="
        + json.dumps(
            {
                "family": "voxcpm2",
                "backend": args.backend,
                "mode": args.run_mode,
                "sequence_steps": sequence_steps,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )

    final_audio, final_sample_rate, _, _ = last_outputs[-1]
    write_audio(args.audio_out, final_audio, final_sample_rate)
    print(f"audio_out={args.audio_out}")
    print(f"timing_out={args.timing_file}")
    for index, (_audio, _sample_rate, wall_ms, _chunk_count) in enumerate(last_outputs):
        print(f"average[{index}]")
        print(f"voxcpm2.synthesize_wall_ms={wall_ms}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
