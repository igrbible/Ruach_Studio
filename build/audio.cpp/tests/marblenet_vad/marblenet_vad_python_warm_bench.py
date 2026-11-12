#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import wave
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from safetensors import safe_open


REPO_ROOT = Path(__file__).resolve().parents[2]
FEATURE_DIM = 80
TARGET_SR = 16000
N_FFT = 512
HOP = 160
WIN = 400
LOG_EPS = float(np.ldexp(1.0, -24))
BN_EPS = 1.0e-3
OUTPUT_STRIDE = 2


def read_wav_pcm_f32(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        sample_width = wav.getsampwidth()
        data = wav.readframes(wav.getnframes())
    if sample_width == 2:
        pcm = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
    elif sample_width == 4:
        pcm = np.frombuffer(data, dtype="<f4").astype(np.float32)
    else:
        raise RuntimeError(f"unsupported WAV bit depth: {sample_width * 8}")
    if channels > 1:
        pcm = pcm.reshape(-1, channels).mean(axis=1)
    return pcm, sample_rate


def resample_linear_mono(waveform: np.ndarray, input_sample_rate: int, output_sample_rate: int) -> np.ndarray:
    if input_sample_rate == output_sample_rate:
        return waveform
    scale = output_sample_rate / input_sample_rate
    output_samples = int(round(len(waveform) * scale))
    pos = np.arange(output_samples, dtype=np.float64) / scale
    left = np.floor(pos).astype(np.int64)
    right = np.minimum(left + 1, len(waveform) - 1)
    frac = (pos - left).astype(np.float32)
    return waveform[left] * (1.0 - frac) + waveform[right] * frac


class RefMarbleNet:
    def __init__(self, model_dir: Path, device: torch.device):
        self.device = device
        self.tensors: dict[str, torch.Tensor] = {}
        with safe_open(str(model_dir / "marblenet_vad.safetensors"), framework="pt", device="cpu") as f:
            for key in f.keys():
                self.tensors[key] = f.get_tensor(key).float().contiguous().to(device)
        self.window = self.tensors["preprocessor.featurizer.window"]
        self.fb = self.tensors["preprocessor.featurizer.fb"].view(FEATURE_DIM, N_FFT // 2 + 1)

    def bn(self, x: torch.Tensor, prefix: str) -> torch.Tensor:
        w = self.tensors[f"{prefix}.weight"].view(1, -1, 1)
        b = self.tensors[f"{prefix}.bias"].view(1, -1, 1)
        mean = self.tensors[f"{prefix}.running_mean"].view(1, -1, 1)
        var = self.tensors[f"{prefix}.running_var"].view(1, -1, 1)
        return (x - mean) / torch.sqrt(var + BN_EPS) * w + b

    def conv1d(self, x: torch.Tensor, prefix: str, stride: int, dilation: int, padding: int, groups: int, bias: bool) -> torch.Tensor:
        weight = self.tensors[f"{prefix}.weight"]
        if weight.ndim == 2:
            weight = weight.unsqueeze(-1)
        bias_t = self.tensors[f"{prefix}.bias"] if bias else None
        return F.conv1d(x, weight, bias=bias_t, stride=stride, padding=padding, dilation=dilation, groups=groups)

    def block(self, x: torch.Tensor, block: int, repeat: int, kernel: int, stride: int, dilation: int, residual: bool, separable: bool) -> torch.Tensor:
        residual_x = x
        for r in range(repeat):
            if separable:
                base = r * 5
                x = self.conv1d(x, f"encoder.encoder.{block}.mconv.{base}.conv", stride, dilation, dilation * (kernel - 1) // 2, x.shape[1], False)
                x = self.conv1d(x, f"encoder.encoder.{block}.mconv.{base + 1}.conv", 1, 1, 0, 1, False)
                x = self.bn(x, f"encoder.encoder.{block}.mconv.{base + 2}")
            else:
                base = r * 3
                x = self.conv1d(x, f"encoder.encoder.{block}.mconv.{base}.conv", stride, dilation, dilation * (kernel - 1) // 2, 1, False)
                x = self.bn(x, f"encoder.encoder.{block}.mconv.{base + 1}")
            if r + 1 != repeat:
                x = F.relu(x)
        if residual:
            res = self.conv1d(residual_x, f"encoder.encoder.{block}.res.0.0.conv", 1, 1, 0, 1, False)
            res = self.bn(res, f"encoder.encoder.{block}.res.0.1")
            x = x + res
        return F.relu(x)

    def compute_features(self, waveform: np.ndarray) -> torch.Tensor:
        xt = torch.from_numpy(waveform.astype(np.float32, copy=False)).to(self.device).unsqueeze(0)
        stft = torch.stft(
            xt,
            n_fft=N_FFT,
            hop_length=HOP,
            win_length=WIN,
            window=self.window,
            center=True,
            pad_mode="constant",
            normalized=False,
            onesided=True,
            return_complex=True,
        )
        mel = torch.matmul(self.fb, stft.abs().pow(2.0)[0]).transpose(0, 1)
        feats = torch.log(mel + LOG_EPS)
        if feats.shape[0] % 2 != 0:
            feats = F.pad(feats, (0, 0, 0, 1))
        return feats

    def infer_features(self, features: torch.Tensor) -> torch.Tensor:
        x = features.float().t().unsqueeze(0)
        x = self.block(x, 0, repeat=1, kernel=11, stride=2, dilation=1, residual=False, separable=True)
        x = self.block(x, 1, repeat=2, kernel=13, stride=1, dilation=1, residual=True, separable=True)
        x = self.block(x, 2, repeat=2, kernel=15, stride=1, dilation=1, residual=True, separable=True)
        x = self.block(x, 3, repeat=2, kernel=17, stride=1, dilation=1, residual=True, separable=True)
        x = self.block(x, 4, repeat=1, kernel=29, stride=1, dilation=2, residual=False, separable=True)
        x = self.block(x, 5, repeat=1, kernel=1, stride=1, dilation=1, residual=False, separable=False)
        logits = self.conv1d(x, "decoder.layer0", 1, 1, 0, 1, True)
        return logits.squeeze(0).transpose(0, 1).contiguous()

    def detect(self, audio_path: Path, threshold: float) -> list[dict[str, float | int]]:
        waveform, sample_rate = read_wav_pcm_f32(audio_path)
        waveform = resample_linear_mono(waveform, sample_rate, TARGET_SR)
        logits = self.infer_features(self.compute_features(waveform)).detach().cpu().numpy()
        if logits.shape[1] == 1:
            probabilities = 1.0 / (1.0 + np.exp(-logits[:, 0]))
        else:
            shifted = logits[:, :2] - logits[:, :2].max(axis=1, keepdims=True)
            exp = np.exp(shifted)
            probabilities = exp[:, 1] / exp.sum(axis=1)
        segments: list[dict[str, float | int]] = []
        active = False
        start_frame = 0
        confidence_sum = 0.0
        confidence_count = 0
        frame_to_samples = HOP * OUTPUT_STRIDE
        for frame, probability in enumerate(probabilities):
            if float(probability) >= threshold:
                if not active:
                    active = True
                    start_frame = frame
                    confidence_sum = 0.0
                    confidence_count = 0
                confidence_sum += float(probability)
                confidence_count += 1
                continue
            if active:
                segments.append({
                    "start_sample": int(start_frame * frame_to_samples * sample_rate / TARGET_SR),
                    "end_sample": int(frame * frame_to_samples * sample_rate / TARGET_SR),
                    "confidence": confidence_sum / confidence_count,
                })
                active = False
        if active:
            segments.append({
                "start_sample": int(start_frame * frame_to_samples * sample_rate / TARGET_SR),
                "end_sample": int(len(probabilities) * frame_to_samples * sample_rate / TARGET_SR),
                "confidence": confidence_sum / confidence_count,
            })
        return segments


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    return [Path(item) for item in value.split(",") if item] if value else [fallback]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/marblenet_vad")
    parser.add_argument("--audio", default="resources/sample.wav")
    parser.add_argument("--warmup-audio", default="")
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--backend", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")
        device = torch.device(f"cuda:{args.device}")
    else:
        device = torch.device("cpu")
    model = RefMarbleNet(REPO_ROOT / args.model, device)
    warmup_audio = Path(args.warmup_audio) if args.warmup_audio else Path(args.audio)
    request_paths = parse_csv_paths(args.audio_sequence, Path(args.audio))

    for _ in range(args.warmup):
        model.detect(warmup_audio, args.threshold)
        if device.type == "cuda":
            torch.cuda.synchronize(device)

    steps = []
    for index, path in enumerate(request_paths):
        segments: list[dict[str, float | int]] = []
        total_ms = 0.0
        for _ in range(args.iterations):
            start = time.perf_counter()
            segments = model.detect(path, args.threshold)
            if device.type == "cuda":
                torch.cuda.synchronize(device)
            total_ms += (time.perf_counter() - start) * 1000.0
        wall_ms = total_ms / args.iterations
        print(f"average[{index}]")
        print(f"marblenet_vad.wall_ms={wall_ms}")
        steps.append({
            "request_index": index,
            "audio": str(path),
            "speech_segments": segments,
            "metrics": {"wall_ms": wall_ms},
        })
    print("summary_json=" + json.dumps({"family": "marblenet_vad", "backend": args.backend, "sequence_steps": steps}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
