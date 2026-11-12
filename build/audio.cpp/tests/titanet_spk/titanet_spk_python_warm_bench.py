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
PREEMPH = 0.97
BN_EPS = 1.0e-3
NORM_EPS = 1.0e-5
LOG_EPS = float(np.ldexp(1.0, -24))


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


class RefTitaNet:
    def __init__(self, model_dir: Path, device: torch.device):
        self.device = device
        self.tensors: dict[str, torch.Tensor] = {}
        with safe_open(str(model_dir / "titanet_small.safetensors"), framework="pt", device="cpu") as f:
            for key in f.keys():
                self.tensors[key] = f.get_tensor(key).float().contiguous().to(device)
        self.window = self.tensors["preprocessor.featurizer.window"]
        self.fb = self.tensors["preprocessor.featurizer.fb"].view(FEATURE_DIM, N_FFT // 2 + 1)
        self.classifier = self.tensors["decoder.final.weight"]
        self.labels = [line for line in (model_dir / "titanet_small_labels.txt").read_text().splitlines() if line]

    def bn(self, x: torch.Tensor, prefix: str) -> torch.Tensor:
        w = self.tensors[f"{prefix}.weight"].view(1, -1, 1)
        b = self.tensors[f"{prefix}.bias"].view(1, -1, 1)
        mean = self.tensors[f"{prefix}.running_mean"].view(1, -1, 1)
        var = self.tensors[f"{prefix}.running_var"].view(1, -1, 1)
        return (x - mean) / torch.sqrt(var + BN_EPS) * w + b

    def conv1d(self, x: torch.Tensor, prefix: str, stride: int, dilation: int, padding: int, groups: int, bias: bool) -> torch.Tensor:
        weight = self.tensors[f"{prefix}.weight"]
        bias_t = self.tensors[f"{prefix}.bias"] if bias else None
        return F.conv1d(x, weight, bias=bias_t, stride=stride, padding=padding, dilation=dilation, groups=groups)

    def se(self, x: torch.Tensor, prefix: str) -> torch.Tensor:
        pooled = x.mean(dim=2, keepdim=True)
        h = F.relu(F.conv1d(pooled, self.tensors[f"{prefix}.fc.0.weight"][:, :, None]))
        y = torch.sigmoid(F.conv1d(h, self.tensors[f"{prefix}.fc.2.weight"][:, :, None]))
        return x * y

    def jasper_block(self, x: torch.Tensor, block: int) -> torch.Tensor:
        repeats = {0: 1, 1: 3, 2: 3, 3: 3, 4: 1}[block]
        kernels = {0: 3, 1: 7, 2: 11, 3: 15, 4: 1}[block]
        residual = x
        for r in range(repeats):
            base = r * 5
            x = self.conv1d(x, f"encoder.encoder.{block}.mconv.{base}.conv", 1, 1, kernels // 2, x.shape[1], False)
            x = self.conv1d(x, f"encoder.encoder.{block}.mconv.{base + 1}.conv", 1, 1, 0, 1, False)
            x = self.bn(x, f"encoder.encoder.{block}.mconv.{base + 2}")
            if r + 1 != repeats:
                x = F.relu(x)
        x = self.se(x, f"encoder.encoder.{block}.mconv.{(repeats - 1) * 5 + 3}")
        if 1 <= block <= 3:
            res = self.conv1d(residual, f"encoder.encoder.{block}.res.0.0.conv", 1, 1, 0, 1, False)
            res = self.bn(res, f"encoder.encoder.{block}.res.0.1")
            x = x + res
        return F.relu(x)

    def attentive_pool(self, x: torch.Tensor) -> torch.Tensor:
        t = x.shape[2]
        mean = x.mean(dim=2)
        std = torch.sqrt(((x - mean.unsqueeze(2)).pow(2).mean(dim=2)).clamp_min(1.0e-10))
        attn_in = torch.cat([x, mean.unsqueeze(2).repeat(1, 1, t), std.unsqueeze(2).repeat(1, 1, t)], dim=1)
        attn = self.conv1d(attn_in, "decoder._pooling.attention_layer.0.conv_layer", 1, 1, 0, 1, True)
        attn = torch.tanh(self.bn(F.relu(attn), "decoder._pooling.attention_layer.0.bn"))
        alpha = F.softmax(self.conv1d(attn, "decoder._pooling.attention_layer.2", 1, 1, 0, 1, True), dim=2)
        mu = torch.sum(alpha * x, dim=2)
        sg = torch.sqrt(torch.sum(alpha * (x - mu.unsqueeze(2)).pow(2), dim=2).clamp_min(1.0e-10))
        return torch.cat([mu, sg], dim=1).unsqueeze(2)

    def compute_features(self, waveform: np.ndarray) -> torch.Tensor:
        x = waveform.astype(np.float32).copy()
        x[1:] = x[1:] - PREEMPH * x[:-1]
        xt = torch.from_numpy(x).to(self.device).unsqueeze(0)
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
        mel = torch.matmul(self.fb, stft.abs().pow(2.0)[0]).t()
        feats = torch.log(mel + LOG_EPS)
        mean = feats.mean(dim=0, keepdim=True)
        std = feats.std(dim=0, correction=1, keepdim=True)
        return (feats - mean) / (std + NORM_EPS)

    def embed_features(self, features: torch.Tensor) -> torch.Tensor:
        x = features.float().t().unsqueeze(0)
        for block in range(5):
            x = self.jasper_block(x, block)
        x = self.attentive_pool(x)
        x = self.bn(x, "decoder.emb_layers.0.0")
        x = self.conv1d(x, "decoder.emb_layers.0.1", 1, 1, 0, 1, True)
        return x.squeeze(2)

    def classify(self, audio_path: Path) -> dict[str, float | int | str]:
        waveform, sample_rate = read_wav_pcm_f32(audio_path)
        waveform = resample_linear_mono(waveform, sample_rate, TARGET_SR)
        emb = self.embed_features(self.compute_features(waveform))
        logits = F.normalize(emb, p=2.0, dim=1) @ F.normalize(self.classifier, p=2.0, dim=1).t()
        if self.device.type == "cuda":
            torch.cuda.synchronize(self.device)
        index = int(torch.argmax(logits, dim=1).item())
        return {"label": self.labels[index], "index": index, "score": float(logits[0, index].item())}


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    return [Path(item) for item in value.split(",") if item] if value else [fallback]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/titanet")
    parser.add_argument("--audio", default="resources/sample.wav")
    parser.add_argument("--warmup-audio", default="")
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--backend", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=1)
    args = parser.parse_args()

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")
        device = torch.device(f"cuda:{args.device}")
    else:
        device = torch.device("cpu")
    model = RefTitaNet(REPO_ROOT / args.model, device)
    warmup_audio = Path(args.warmup_audio) if args.warmup_audio else Path(args.audio)
    request_paths = parse_csv_paths(args.audio_sequence, Path(args.audio))

    for _ in range(args.warmup):
        model.classify(warmup_audio)

    steps = []
    for index, path in enumerate(request_paths):
        classified: dict[str, float | int | str] = {}
        total_ms = 0.0
        for _ in range(args.iterations):
            start = time.perf_counter()
            classified = model.classify(path)
            total_ms += (time.perf_counter() - start) * 1000.0
        wall_ms = total_ms / args.iterations
        print(f"average[{index}]")
        print(f"titanet_spk.wall_ms={wall_ms}")
        steps.append({
            "request_index": index,
            "audio": str(path),
            "label": classified["label"],
            "index": classified["index"],
            "score": classified["score"],
            "metrics": {"wall_ms": wall_ms},
        })
    print("summary_json=" + json.dumps({"family": "titanet_spk", "backend": args.backend, "sequence_steps": steps}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
