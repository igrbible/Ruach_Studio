#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import io
import importlib.util
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import soundfile as sf


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_ROOT = REPO_ROOT / "reference" / "SeedVC"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Python reference Seed-VC warmbench.")
    parser.add_argument("--family", default="seed_vc")
    parser.add_argument("--model", default=str(REPO_ROOT / "models" / "SeedVC"))
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


def resolve_path(path: str) -> Path:
    value = Path(path)
    return value if value.is_absolute() else REPO_ROOT / value


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
    raise RuntimeError("Seed-VC warmbench requires --request-json or --request-sequence-json")


def summarize_audio(path: Path) -> dict[str, Any]:
    audio, sample_rate = sf.read(str(path), always_2d=True, dtype="float32")
    flat = np.asarray(audio, dtype=np.float32).reshape(-1)
    if flat.size == 0:
        raise RuntimeError(f"Seed-VC warmbench received empty audio: {path}")
    return {
        "sample_rate": int(sample_rate),
        "channels": int(audio.shape[1]),
        "samples": int(flat.size),
        "frames": int(audio.shape[0]),
        "sum": float(np.sum(flat, dtype=np.float64)),
        "mean_abs": float(np.mean(np.abs(flat), dtype=np.float64)),
        "rms": float(np.sqrt(np.mean(np.square(flat), dtype=np.float64))),
        "min": float(np.min(flat)),
        "max": float(np.max(flat)),
    }


def generation_ms_from_reference_stdout(stdout: str, audio_summary: dict[str, Any], path: str) -> float | None:
    if path == "v2_vc":
        completed = re.search(r"Voice conversion completed in\s*([0-9.eE+-]+)\s*seconds", stdout)
        if completed is None:
            return None
        return float(completed.group(1)) * 1000.0
    if path.startswith("v1_"):
        rtf = re.search(r"RTF:\s*([0-9.eE+-]+)", stdout)
        if rtf is None:
            return None
        sample_rate = int(audio_summary["sample_rate"])
        frames = int(audio_summary["frames"])
        if sample_rate <= 0 or frames <= 0:
            raise RuntimeError("Seed-VC Python reference produced invalid audio duration for RTF timing")
        return float(rtf.group(1)) * (float(frames) / float(sample_rate)) * 1000.0
    return None


def build_reference_args(
    request: dict[str, Any],
    model_root: Path,
    output_dir: Path,
) -> tuple[str, dict[str, Any]]:
    seed = int(request.get("seed", 1234))
    if seed < 0:
        raise RuntimeError("Seed-VC warmbench requires a non-negative seed")
    path = str(request.get("path", "v2_vc"))
    output_dir.mkdir(parents=True, exist_ok=True)
    if path == "v2_vc":
        return path, {
            "source": str(resolve_path(str(request["source_audio"]))),
            "target": str(resolve_path(str(request["target_audio"]))),
            "output": str(output_dir),
            "diffusion_steps": int(request.get("diffusion_steps", 30)),
            "length_adjust": float(request.get("length_adjust", 1.0)),
            "compile": False,
            "intelligibility_cfg_rate": float(request.get("intelligibility_cfg_rate", 0.7)),
            "similarity_cfg_rate": float(request.get("similarity_cfg_rate", 0.7)),
            "top_p": float(request.get("top_p", 0.9)),
            "temperature": float(request.get("temperature", 1.0)),
            "repetition_penalty": float(request.get("repetition_penalty", 1.0)),
            "convert_style": bool(request.get("convert_style", False)),
            "anonymization_only": bool(request.get("anonymization_only", False)),
            "ar_checkpoint_path": str(model_root / "seed-vc/v2/ar_base.pth"),
            "cfm_checkpoint_path": str(model_root / "seed-vc/v2/cfm_small.pth"),
        }
    elif path in ("v1_svc", "v1_whisper_bigvgan_vc", "v1_xlsr_hift_vc"):
        if path == "v1_svc":
            checkpoint = model_root / "seed-vc/DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema_v2.pth"
            config = model_root / "seed-vc/config_dit_mel_seed_uvit_whisper_base_f0_44k.yml"
            default_f0_condition = True
            default_auto_f0_adjust = True
        elif path == "v1_whisper_bigvgan_vc":
            checkpoint = model_root / "seed-vc/DiT_seed_v2_uvit_whisper_small_wavenet_bigvgan_pruned.pth"
            config = model_root / "seed-vc/config_dit_mel_seed_uvit_whisper_small_wavenet.yml"
            default_f0_condition = False
            default_auto_f0_adjust = False
        else:
            checkpoint = model_root / "seed-vc/DiT_uvit_tat_xlsr_ema.pth"
            config = model_root / "seed-vc/config_dit_mel_seed_uvit_xlsr_tiny.yml"
            default_f0_condition = False
            default_auto_f0_adjust = False
        return path, {
            "source": str(resolve_path(str(request["source_audio"]))),
            "target": str(resolve_path(str(request["target_audio"]))),
            "output": str(output_dir),
            "diffusion_steps": int(request.get("diffusion_steps", 30)),
            "length_adjust": float(request.get("length_adjust", 1.0)),
            "inference_cfg_rate": float(request.get("inference_cfg_rate", 0.7)),
            "f0_condition": bool(request.get("f0_condition", default_f0_condition)),
            "auto_f0_adjust": bool(request.get("auto_f0_adjust", default_auto_f0_adjust)),
            "semi_tone_shift": int(request.get("semi_tone_shift", 0)),
            "fp16": bool(request.get("fp16", False)),
            "checkpoint": str(checkpoint),
            "config": str(config),
        }
    raise RuntimeError(f"unsupported Seed-VC warmbench path: {path}")


def latest_wav(directory: Path) -> Path:
    waves = sorted(directory.glob("*.wav"), key=lambda item: item.stat().st_mtime_ns)
    if not waves:
        raise RuntimeError(f"Seed-VC reference did not produce a wav in {directory}")
    return waves[-1]


def load_reference_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load Seed-VC reference module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reseed(seed: int, backend: str, device: int) -> None:
    import torch

    torch.manual_seed(seed)
    if backend == "cuda":
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed & 0xFFFFFFFF)
    random.seed(seed)


def run_reference_sequence(
    requests: list[dict[str, Any]],
    model_root: Path,
    output_root: Path,
    noise_file: str,
    backend: str,
    device: int,
    warmups: int,
    iterations: int,
) -> tuple[list[str], list[dict[str, Any]]]:
    if noise_file:
        raise RuntimeError("Seed-VC Python reference has no noise-file API; do not use --noise-file for Seed-VC warmbench")

    sys.path.insert(0, str(REFERENCE_ROOT))
    cwd = Path.cwd()
    os.chdir(REFERENCE_ROOT)
    try:
        module_v1 = load_reference_module("seedvc_reference_inference_v1", REFERENCE_ROOT / "inference.py")
        module_v2 = load_reference_module("seedvc_reference_inference_v2", REFERENCE_ROOT / "inference_v2.py")
    finally:
        os.chdir(cwd)

    def run_payload(payload: dict[str, Any]) -> dict[str, Any]:
        seed = int(payload["seed"])
        args = SimpleNamespace(**payload["args"])
        Path(args.output).mkdir(parents=True, exist_ok=True)
        reseed(seed, backend, device)
        module = module_v2 if payload["path"] == "v2_vc" else module_v1
        if payload["path"] == "v2_vc" and module.vc_wrapper_v2 is None:
            cwd_load = Path.cwd()
            os.chdir(REFERENCE_ROOT)
            try:
                module.vc_wrapper_v2 = module.load_v2_models(args)
            finally:
                os.chdir(cwd_load)
            reseed(seed, backend, device)
        started = time.perf_counter()
        cwd_inner = Path.cwd()
        os.chdir(REFERENCE_ROOT)
        stdout_buffer = io.StringIO()
        try:
            with contextlib.redirect_stdout(stdout_buffer):
                module.main(args)
        finally:
            os.chdir(cwd_inner)
        stdout = stdout_buffer.getvalue()
        print(stdout, end="")
        if backend == "cuda":
            import torch

            torch.cuda.synchronize(device)
        call_wall_ms = (time.perf_counter() - started) * 1000.0
        audio_path = latest_wav(Path(args.output))
        audio_summary = summarize_audio(audio_path)
        generation_wall_ms = generation_ms_from_reference_stdout(stdout, audio_summary, str(payload["path"]))
        wall_ms = generation_wall_ms if generation_wall_ms is not None else call_wall_ms
        return {
            "kind": payload["kind"],
            "request_index": payload["request_index"],
            "iteration": payload["iteration"],
            "audio": audio_path,
            "summary": audio_summary,
            "wall_ms": wall_ms,
        }

    payloads = []
    for warmup_index in range(max(0, warmups)):
        request = requests[0]
        path, args = build_reference_args(request, model_root, output_root / "warmup" / f"{warmup_index:02d}")
        payloads.append({
            "kind": "warmup",
            "request_index": 0,
            "iteration": warmup_index,
            "seed": int(request.get("seed", 1234)),
            "path": path,
            "args": args,
        })

    for request_index, request in enumerate(requests):
        for iteration in range(max(1, iterations)):
            path, args = build_reference_args(
                request,
                model_root,
                output_root / f"request_{request_index:02d}" / f"iter_{iteration:02d}",
            )
            payloads.append({
                "kind": "request",
                "request_index": request_index,
                "iteration": iteration,
                "seed": int(request.get("seed", 1234)),
                "path": path,
                "args": args,
            })

    results = [run_payload(payload) for payload in payloads]
    timing_lines: list[str] = []
    request_totals: dict[int, float] = {}
    request_audio: dict[int, Path] = {}
    request_counts: dict[int, int] = {}
    for result in results:
        request_index = int(result["request_index"])
        wall_ms = float(result["wall_ms"])
        if result["kind"] == "warmup":
            timing_lines.append(f"seed_vc.warmup{result['iteration']}.wall_ms {wall_ms:.6f}")
            continue
        request_totals[request_index] = request_totals.get(request_index, 0.0) + wall_ms
        request_counts[request_index] = request_counts.get(request_index, 0) + 1
        request_audio[request_index] = Path(result["audio"])

    steps = []
    for request_index, request in enumerate(requests):
        count = request_counts.get(request_index, 0)
        if count <= 0 or request_index not in request_audio:
            raise RuntimeError(f"Seed-VC reference did not produce request {request_index}")
        mean_wall = request_totals[request_index] / count
        audio_path = request_audio[request_index]
        timing_lines.append(f"seed_vc.request{request_index}.wall_ms {mean_wall:.6f}")
        steps.append({
            "request_index": request_index,
            "request": request,
            "stems": [{"name": "audio", "audio": str(audio_path), "summary": summarize_audio(audio_path)}],
            "metrics": {"wall_ms": mean_wall},
        })
    return timing_lines, steps


def main() -> int:
    args = parse_args()
    if args.family != "seed_vc":
        raise RuntimeError(f"unsupported Seed-VC warmbench family: {args.family}")
    model_root = resolve_path(args.model)
    if not model_root.is_dir():
        raise RuntimeError(f"Seed-VC model root not found: {model_root}")
    if not REFERENCE_ROOT.is_dir():
        raise RuntimeError(f"Seed-VC reference root not found: {REFERENCE_ROOT}")

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ["CUDA_VISIBLE_DEVICES"] = str(args.device) if args.backend == "cuda" else ""
    os.environ["OMP_NUM_THREADS"] = str(max(1, args.threads))

    requests = load_requests(args)
    noise_file = str(resolve_path(args.noise_file)) if args.noise_file else ""
    output_root = resolve_path(args.output_dir) if args.output_dir else REPO_ROOT / "build/logs/parity/seed_vc_python_outputs"
    timing_lines = [f"seed_vc.backend {args.backend}"]
    measured_lines, steps = run_reference_sequence(
        requests,
        model_root,
        output_root,
        noise_file,
        args.backend,
        args.device,
        args.warmup,
        args.iterations)
    timing_lines.extend(measured_lines)

    if args.timing_file:
        Path(args.timing_file).parent.mkdir(parents=True, exist_ok=True)
        Path(args.timing_file).write_text("\n".join(timing_lines) + "\n", encoding="utf-8")
    print(json.dumps({"family": "seed_vc", "backend": args.backend, "steps": steps}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
