#!/usr/bin/env python3
"""Convert official ZipEnhancer PyTorch weights and fixtures.

ZipEnhancer ships both PyTorch and ONNX assets. The framework runtime uses the
PyTorch checkpoint converted to safetensors; ONNXRuntime is intentionally not a
runtime dependency for this utility.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import save_file


SAMPLE_RATE = 16000


def make_case(samples: int, base_hz: float, noise_hz: float) -> torch.Tensor:
    t = torch.arange(samples, dtype=torch.float32) / float(SAMPLE_RATE)
    clean = (
        0.22 * torch.sin(2.0 * torch.pi * base_hz * t)
        + 0.09 * torch.sin(2.0 * torch.pi * (base_hz * 1.7) * t + 0.31)
        + 0.04 * torch.sin(2.0 * torch.pi * (base_hz * 2.9) * t + 0.83)
    )
    noise = (
        0.035 * torch.sin(2.0 * torch.pi * noise_hz * t + 0.19)
        + 0.018 * torch.sin(2.0 * torch.pi * (noise_hz * 2.3) * t + 1.11)
    )
    envelope = torch.linspace(0.35, 1.0, samples, dtype=torch.float32)
    return ((clean + noise) * envelope).unsqueeze(0).contiguous()


def load_reference_model(reference_root: Path, checkpoint: Path, config_path: Path, device: torch.device):
    sys.path.insert(0, str(reference_root))
    from zipenhancer.models.zipenhancer import ZipenhancerDecorator  # type: ignore

    with config_path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    model_config = config["model"]
    decorator = ZipenhancerDecorator(str(checkpoint), **model_config)
    decorator.model.to(device)
    decorator.model.eval()
    return decorator


def run_modelscope_pipeline_reference(decorator, waveform: torch.Tensor, device: torch.device) -> torch.Tensor:
    window = SAMPLE_RATE * 2
    stride = int(window * 0.75)
    nsamples = waveform.shape[1]
    waveform = waveform.to(device)
    if nsamples < window:
        waveform = torch.nn.functional.pad(waveform, (0, window - nsamples))
    elif nsamples > window * 3:
        remainder = (nsamples - window) % stride
        if remainder != 0:
            waveform = torch.nn.functional.pad(waveform, (0, stride - remainder))

    if nsamples > window * 3:
        total = waveform.shape[1]
        outputs = torch.zeros((total,), dtype=torch.float32, device=device)
        give_up = (window - stride) // 2
        current = 0
        while current + window <= total:
            tmp = decorator.forward({"noisy": waveform[:, current : current + window]})["wav_l2"][0]
            if current == 0:
                outputs[current : current + window - give_up] = tmp[:-give_up]
            else:
                outputs[current + give_up : current + window - give_up] = tmp[give_up:-give_up]
            current += stride
        return outputs[:nsamples].unsqueeze(0).cpu()

    return decorator.forward({"noisy": waveform})["wav_l2"][:, :nsamples].cpu()


def convert(
    reference_root: Path,
    checkpoint: Path,
    config_path: Path,
    output_dir: Path,
    fixture_dir: Path,
    device_name: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    fixture_dir.mkdir(parents=True, exist_ok=True)
    device = torch.device(device_name)
    if device.type != "cuda" or not torch.cuda.is_available():
        raise RuntimeError("ZipEnhancer fixture conversion must run on CUDA")

    checkpoint_data = torch.load(checkpoint, map_location="cpu")
    if not isinstance(checkpoint_data, dict) or "generator" not in checkpoint_data:
        raise RuntimeError("ZipEnhancer checkpoint does not contain generator weights")
    state_dict = checkpoint_data["generator"]
    if not state_dict:
        raise RuntimeError("ZipEnhancer generator state_dict is empty")

    tensors: dict[str, torch.Tensor] = {}
    for name, tensor in state_dict.items():
        if not torch.is_tensor(tensor):
            raise RuntimeError(f"ZipEnhancer state entry is not a tensor: {name}")
        tensors[name] = tensor.detach().cpu().contiguous().clone()

    save_file(
        tensors,
        str(output_dir / "zipenhancer.safetensors"),
        metadata={
            "model": "ZipEnhancer",
            "source": "https://modelscope.cn/models/iic/speech_zipenhancer_ans_multiloss_16k_base",
            "reference": "https://github.com/gyj1201/zipEnhancer",
            "license": "Apache-2.0 for ModelScope model, MIT for standalone PyTorch reference code",
            "baseline": "ModelScope ANSZipEnhancerPipeline",
            "sample_rate": str(SAMPLE_RATE),
            "n_fft": "400",
            "hop_length": "100",
            "win_length": "400",
            "compress_factor": "0.3",
        },
    )

    decorator = load_reference_model(reference_root, checkpoint, config_path, device)

    cases = (
        make_case(12000, 147.0, 1810.0),
        make_case(32000, 190.0, 2410.0),
        make_case(47831, 311.0, 3770.0),
        make_case(118213, 239.0, 3290.0),
    )
    with torch.no_grad():
        for index, waveform in enumerate(cases):
            output = run_modelscope_pipeline_reference(decorator, waveform, device)
            save_file(
                {
                    "input": waveform.cpu().contiguous(),
                    "output": output.contiguous(),
                },
                str(fixture_dir / f"zipenhancer_case{index}.safetensors"),
                metadata={
                    "source": "ModelScope ANSZipEnhancerPipeline semantics using ZipEnhancer PyTorch reference",
                    "case": str(index),
                    "sample_rate": str(SAMPLE_RATE),
                },
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("assets/framework/audio_utilities/zipenhancer"))
    parser.add_argument("--fixture-dir", type=Path, default=Path("tests/assets/framework/audio_utilities/zipenhancer"))
    parser.add_argument("--device", default="cuda:0")
    args = parser.parse_args()
    convert(args.reference_root, args.checkpoint, args.config, args.output_dir, args.fixture_dir, args.device)


if __name__ == "__main__":
    main()
