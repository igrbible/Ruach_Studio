#!/usr/bin/env python3
"""Convert FlashSR ONNX weights and parity fixtures to local safetensors."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper
from safetensors.numpy import save_file


FLASHSR_TENSOR_MAP = {
    "/model/dec/Mul_output_0": "conv_pre.weight",
    "model.dec.conv_pre.bias": "conv_pre.bias",
    "model.dec.conv_post.weight": "conv_post.weight",
    "/model/dec/activation_post/act/Exp_output_0": "activation_post.alpha",
    "/model/dec/activation_post/act/Mul_output_0": "activation_post.inv_beta",
    "model.dec.resblocks.2.activations.0.upsample.filter": "activation_filter",
}


def resblock_weight_name(block_id: str, group: int, index: int) -> str:
    suffix = index * 2 if group == 1 else index * 2 + 1
    if suffix == 0:
        return f"/model/dec/resblocks.{block_id}/Mul_output_0"
    return f"/model/dec/resblocks.{block_id}/Mul_{suffix}_output_0"


for _block_id in ("0", "2"):
    for _group in (1, 2):
        for _index in range(3):
            FLASHSR_TENSOR_MAP[resblock_weight_name(_block_id, _group, _index)] = (
                f"resblocks.{_block_id}.convs{_group}.{_index}.weight"
            )
            FLASHSR_TENSOR_MAP[f"model.dec.resblocks.{_block_id}.convs{_group}.{_index}.bias"] = (
                f"resblocks.{_block_id}.convs{_group}.{_index}.bias"
            )
    for _index in range(6):
        FLASHSR_TENSOR_MAP[f"/model/dec/resblocks.{_block_id}/activations.{_index}/act/Exp_output_0"] = (
            f"resblocks.{_block_id}.activations.{_index}.alpha"
        )
        FLASHSR_TENSOR_MAP[f"/model/dec/resblocks.{_block_id}/activations.{_index}/act/Mul_output_0"] = (
            f"resblocks.{_block_id}.activations.{_index}.inv_beta"
        )


def make_case(samples: int, base_hz: float) -> np.ndarray:
    t = np.arange(samples, dtype=np.float32) / np.float32(16000.0)
    waveform = (
        np.float32(0.18) * np.sin(np.float32(2.0 * np.pi * base_hz) * t)
        + np.float32(0.05) * np.sin(np.float32(2.0 * np.pi * base_hz * 2.7) * t + np.float32(0.37))
        + np.float32(0.02) * np.sin(np.float32(2.0 * np.pi * base_hz * 5.1) * t + np.float32(1.13))
    )
    envelope = np.linspace(np.float32(0.25), np.float32(1.0), samples, dtype=np.float32)
    return (waveform * envelope).reshape(1, samples).astype(np.float32)


def convert(onnx_path: Path, output_dir: Path, fixture_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    fixture_dir.mkdir(parents=True, exist_ok=True)

    model = onnx.load(str(onnx_path))
    source_tensors: dict[str, np.ndarray] = {}
    for initializer in model.graph.initializer:
        array = numpy_helper.to_array(initializer)
        if array.dtype == np.float32:
            source_tensors[initializer.name] = np.ascontiguousarray(array)
    missing = sorted(name for name in FLASHSR_TENSOR_MAP if name not in source_tensors)
    if missing:
        raise RuntimeError(f"FlashSR source model is missing expected tensors: {missing}")
    tensors = {
        native_name: source_tensors[source_name]
        for source_name, native_name in sorted(FLASHSR_TENSOR_MAP.items(), key=lambda item: item[1])
    }
    save_file(
        tensors,
        output_dir / "flashsr.safetensors",
        metadata={
            "model": "FlashSR",
            "source": "https://huggingface.co/YatharthS/FlashSR",
            "license": "Apache-2.0 per upstream README/model card",
        },
    )

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    for index, waveform in enumerate((make_case(512, 220.0), make_case(777, 347.0))):
        reconstruction = session.run(None, {"audio_values": waveform})[0].astype(np.float32)
        save_file(
            {
                "audio_values": np.ascontiguousarray(waveform),
                "reconstruction": np.ascontiguousarray(reconstruction),
            },
            fixture_dir / f"flashsr_case{index}.safetensors",
            metadata={"source": "FlashSR ONNX Runtime fixture"},
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, required=True)
    args = parser.parse_args()
    convert(args.onnx, args.output_dir, args.fixture_dir)


if __name__ == "__main__":
    main()
