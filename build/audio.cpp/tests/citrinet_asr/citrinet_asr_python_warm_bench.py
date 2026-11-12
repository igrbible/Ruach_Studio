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
LOG_EPS = float(np.ldexp(1.0, -24))
BN_EPS = 1.0e-3
NORM_EPS = 1.0e-5


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


class RefCitrinet:
    def __init__(self, model_dir: Path, device: torch.device):
        model_path = model_dir / "citrinet_256.safetensors"
        self.device = device
        self.tensors: dict[str, torch.Tensor] = {}
        with safe_open(str(model_path), framework="pt", device="cpu") as f:
            self.metadata = {
                key: json.loads(value)
                if value.startswith(("[", "{", "\"")) or value in {"true", "false", "null"} or value.lstrip("-").isdigit()
                else value
                for key, value in f.metadata().items()
            }
            for key in f.keys():
                self.tensors[key] = f.get_tensor(key).float().contiguous().to(device)
        self.sample_rate = int(self.metadata["sample_rate"])
        self.n_mels = int(self.metadata["n_mels"])
        self.n_fft = int(self.metadata["n_fft"])
        self.hop = int(round(float(self.metadata["window_stride"]) * self.sample_rate))
        self.win = int(round(float(self.metadata["window_size"]) * self.sample_rate))
        self.pad_to = int(self.metadata["pad_to"])
        self.blank_id = int(self.metadata["blank_id"])
        self.jasper = list(self.metadata["jasper"])
        self.window = self.tensors["preprocessor.featurizer.window"]
        self.fb = self.tensors["preprocessor.featurizer.fb"].view(self.n_mels, self.n_fft // 2 + 1)
        vocab_path = model_dir / str(self.metadata["vocab_file"])
        self.vocab = [piece[:-1] if piece.endswith("\r") else piece for piece in vocab_path.read_text().split("\n")]

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

    def squeeze_excite(self, x: torch.Tensor, block: int, repeat: int) -> torch.Tensor:
        se_index = 3 if repeat == 1 else repeat * 5 - 2
        y = x.mean(dim=-1, keepdim=True)
        y = self.conv1d(y, f"encoder.encoder.{block}.mconv.{se_index}.fc.0", 1, 1, 0, 1, False)
        y = F.relu(y)
        y = self.conv1d(y, f"encoder.encoder.{block}.mconv.{se_index}.fc.2", 1, 1, 0, 1, False)
        return x * torch.sigmoid(y)

    def block(self, x: torch.Tensor, block_index: int, cfg: dict) -> torch.Tensor:
        residual_x = x
        repeat = int(cfg["repeat"])
        kernel = int(cfg["kernel"])
        dilation = int(cfg["dilation"])
        for r in range(repeat):
            base = r * 5 if cfg["separable"] else r * 3
            stride = int(cfg["stride"]) if r + 1 == repeat else 1
            padding = dilation * (kernel - 1) // 2
            if cfg["separable"]:
                x = self.conv1d(x, f"encoder.encoder.{block_index}.mconv.{base}.conv", stride, dilation, padding, x.shape[1], False)
                x = self.conv1d(x, f"encoder.encoder.{block_index}.mconv.{base + 1}.conv", 1, 1, 0, 1, False)
                x = self.bn(x, f"encoder.encoder.{block_index}.mconv.{base + 2}")
            else:
                x = self.conv1d(x, f"encoder.encoder.{block_index}.mconv.{base}.conv", stride, dilation, padding, 1, False)
                x = self.bn(x, f"encoder.encoder.{block_index}.mconv.{base + 1}")
            if r + 1 != repeat:
                x = F.relu(x)
        if cfg.get("se", False):
            x = self.squeeze_excite(x, block_index, repeat)
        if cfg["residual"]:
            residual_stride = int(cfg["stride"]) if cfg.get("residual_mode") == "stride_add" else 1
            res = self.conv1d(residual_x, f"encoder.encoder.{block_index}.res.0.0.conv", residual_stride, 1, 0, 1, False)
            res = self.bn(res, f"encoder.encoder.{block_index}.res.0.1")
            x = x + res
        return F.relu(x)

    def compute_features(self, waveform: np.ndarray) -> tuple[torch.Tensor, int]:
        xt = torch.from_numpy(waveform.astype(np.float32, copy=False)).to(self.device).unsqueeze(0)
        stft = torch.stft(
            xt,
            n_fft=self.n_fft,
            hop_length=self.hop,
            win_length=self.win,
            window=self.window,
            center=True,
            pad_mode="constant",
            normalized=False,
            onesided=True,
            return_complex=True,
        )
        mel = torch.matmul(self.fb, stft.abs().pow(2.0)[0]).transpose(0, 1)
        feats = torch.log(mel + LOG_EPS)
        raw_frames = int(feats.shape[0])
        mean = feats.mean(dim=0, keepdim=True)
        var = ((feats - mean) ** 2).sum(dim=0, keepdim=True) / max(raw_frames - 1, 1)
        feats = (feats - mean) / (torch.sqrt(var) + NORM_EPS)
        if self.pad_to > 1:
            padded = ((raw_frames + self.pad_to - 1) // self.pad_to) * self.pad_to
            if padded != raw_frames:
                feats = F.pad(feats, (0, 0, 0, padded - raw_frames))
        return feats, raw_frames

    def output_frames(self, input_frames: int) -> int:
        frames = input_frames
        for cfg in self.jasper:
            stride = int(cfg["stride"])
            if stride > 1:
                frames = (frames + stride - 1) // stride
        return frames

    def infer_features(self, features: torch.Tensor) -> torch.Tensor:
        x = features.float().t().unsqueeze(0)
        for block_index, cfg in enumerate(self.jasper):
            x = self.block(x, block_index, cfg)
        logits = self.conv1d(x, "decoder.decoder_layers.0", 1, 1, 0, 1, True)
        return logits.squeeze(0).transpose(0, 1).contiguous()

    def greedy_decode(self, logits: torch.Tensor) -> str:
        rows = logits.detach().cpu().numpy()
        ids: list[int] = []
        prev = -1
        for row in rows:
            best = int(np.argmax(row))
            if best == prev:
                continue
            prev = best
            if best != self.blank_id:
                ids.append(best)
        text = ""
        for idx in ids:
            piece = self.vocab[idx]
            if piece.startswith("##"):
                text += piece[2:]
            elif not text or text[-1] in {"'", "-"} or piece in {".", ",", "!", "?", ":", ";", "'", "\"", ")", "]", "}", "-", "/", "\\"}:
                text += piece
            else:
                text += " " + piece
        return text

    def transcribe(self, audio_path: Path) -> str:
        waveform, sample_rate = read_wav_pcm_f32(audio_path)
        waveform = resample_linear_mono(waveform, sample_rate, self.sample_rate)
        features, raw_frames = self.compute_features(waveform)
        logits = self.infer_features(features)
        return self.greedy_decode(logits[: self.output_frames(raw_frames)])


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    return [Path(item) for item in value.split(",") if item] if value else [fallback]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/citrinet")
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
    model = RefCitrinet(REPO_ROOT / args.model, device)
    warmup_audio = Path(args.warmup_audio) if args.warmup_audio else Path(args.audio)
    request_paths = parse_csv_paths(args.audio_sequence, Path(args.audio))

    for _ in range(args.warmup):
        model.transcribe(warmup_audio)
        if device.type == "cuda":
            torch.cuda.synchronize(device)

    steps = []
    for index, path in enumerate(request_paths):
        text = ""
        total_ms = 0.0
        for _ in range(args.iterations):
            start = time.perf_counter()
            text = model.transcribe(path)
            if device.type == "cuda":
                torch.cuda.synchronize(device)
            total_ms += (time.perf_counter() - start) * 1000.0
        wall_ms = total_ms / args.iterations
        print(f"average[{index}]")
        print(f"citrinet_asr.wall_ms={wall_ms}")
        steps.append({
            "request_index": index,
            "audio": str(path),
            "text_output": text,
            "word_timestamps": [],
            "metrics": {"wall_ms": wall_ms},
        })
    print("summary_json=" + json.dumps({"family": "citrinet_asr", "backend": args.backend, "sequence_steps": steps}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
