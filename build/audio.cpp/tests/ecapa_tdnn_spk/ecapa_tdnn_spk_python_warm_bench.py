#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
import time
import types
import wave
from pathlib import Path

import numpy as np
import torch


REPO_ROOT = Path(__file__).resolve().parents[2]
REF_ROOT = REPO_ROOT / "reference" / "speechbrain"
REF_PY = REF_ROOT / "speechbrain" / "lobes" / "models" / "ECAPA_TDNN.py"
MODEL_DIR = REPO_ROOT / "models" / "ecapa_tdnn"


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


def load_reference_module():
    import importlib.util
    import torch.nn as nn

    sb = types.ModuleType("speechbrain")
    sb_dataio = types.ModuleType("speechbrain.dataio")
    sb_dataio_dataio = types.ModuleType("speechbrain.dataio.dataio")
    sb_nnet = types.ModuleType("speechbrain.nnet")
    sb_nnet_cnn = types.ModuleType("speechbrain.nnet.CNN")
    sb_nnet_linear = types.ModuleType("speechbrain.nnet.linear")
    sb_nnet_norm = types.ModuleType("speechbrain.nnet.normalization")

    def length_to_mask(lengths, max_len=None, device=None):
        lengths = lengths.to(device=device)
        if max_len is None:
            max_len = int(lengths.max().item())
        steps = torch.arange(max_len, device=device).unsqueeze(0)
        return steps < lengths.long().unsqueeze(1)

    class Conv1d(nn.Module):
        def __init__(
            self,
            out_channels,
            kernel_size,
            input_shape=None,
            in_channels=None,
            stride=1,
            dilation=1,
            padding="same",
            groups=1,
            bias=True,
            padding_mode="reflect",
            skip_transpose=True,
            **kwargs,
        ):
            super().__init__()
            del skip_transpose, kwargs
            if input_shape is None and in_channels is None:
                raise ValueError("input_shape or in_channels is required")
            if in_channels is None:
                in_channels = input_shape[1]
            self.kernel_size = kernel_size
            self.stride = stride
            self.dilation = dilation
            self.padding = padding
            self.padding_mode = padding_mode
            self.conv = nn.Conv1d(in_channels, out_channels, kernel_size, stride=stride, dilation=dilation, padding=0, groups=groups, bias=bias)

        def forward(self, x):
            if self.padding == "same":
                pad = self.dilation * (self.kernel_size - 1) // 2
                x = torch.nn.functional.pad(x, (pad, pad), mode=self.padding_mode)
            elif self.padding == "causal":
                pad = self.dilation * (self.kernel_size - 1)
                x = torch.nn.functional.pad(x, (pad, 0))
            elif self.padding != "valid":
                raise ValueError(f"unsupported padding: {self.padding}")
            return self.conv(x)

    class Linear(nn.Module):
        def __init__(self, input_size, n_neurons, **kwargs):
            super().__init__()
            self.w = nn.Linear(input_size, n_neurons, **kwargs)

        def forward(self, x):
            return self.w(x)

    class BatchNorm1d(nn.Module):
        def __init__(self, input_size, *args, skip_transpose=True, **kwargs):
            super().__init__()
            del skip_transpose
            self.norm = nn.BatchNorm1d(input_size, *args, **kwargs)

        def forward(self, x):
            return self.norm(x)

    sb_dataio_dataio.length_to_mask = length_to_mask
    sb_nnet_cnn.Conv1d = Conv1d
    sb_nnet_linear.Linear = Linear
    sb_nnet_norm.BatchNorm1d = BatchNorm1d
    sys.modules["speechbrain"] = sb
    sys.modules["speechbrain.dataio"] = sb_dataio
    sys.modules["speechbrain.dataio.dataio"] = sb_dataio_dataio
    sys.modules["speechbrain.nnet"] = sb_nnet
    sys.modules["speechbrain.nnet.CNN"] = sb_nnet_cnn
    sys.modules["speechbrain.nnet.linear"] = sb_nnet_linear
    sys.modules["speechbrain.nnet.normalization"] = sb_nnet_norm
    sys.path.insert(0, str(REF_ROOT))
    spec = importlib.util.spec_from_file_location("sb_ecapa_ref", REF_PY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def load_labels(model_dir: Path) -> list[str]:
    labels: dict[int, str] = {}
    for line in (model_dir / "reference" / "label_encoder.txt").read_text().splitlines():
        if "=>" not in line or "'" not in line:
            continue
        label = line.split("'")[1]
        index = int(line.split("=>", 1)[1].strip())
        labels[index] = label
    ordered = [""] * (max(labels) + 1)
    for index, label in labels.items():
        ordered[index] = label
    return ordered


def compute_reference_fbank(waveform: np.ndarray, device: torch.device) -> torch.Tensor:
    wav = torch.from_numpy(waveform).to(device).unsqueeze(0)
    window = torch.hamming_window(400, periodic=True, device=device)
    stft = torch.stft(
        wav,
        n_fft=400,
        hop_length=160,
        win_length=400,
        window=window,
        center=True,
        pad_mode="constant",
        normalized=False,
        onesided=True,
        return_complex=True,
    )
    power = torch.view_as_real(stft).transpose(2, 1).pow(2).sum(-1)
    n_mels = 80
    n_stft = 201
    mel = torch.linspace(2595 * math.log10(1 + 0 / 700), 2595 * math.log10(1 + 8000 / 700), n_mels + 2, device=device)
    hz = 700 * (10 ** (mel / 2595) - 1)
    band = (hz[1:] - hz[:-1])[:-1]
    f_central = hz[1:-1]
    all_freqs = torch.linspace(0, 8000, n_stft, device=device)
    slope = (all_freqs.repeat(f_central.shape[0], 1) - f_central[:, None]) / band[:, None]
    fbank_matrix = torch.maximum(torch.zeros(1, device=device), torch.minimum(slope + 1.0, -slope + 1.0)).transpose(0, 1)
    fbanks = torch.matmul(power, fbank_matrix)
    x_db = 10 * torch.log10(torch.clamp(fbanks, min=1e-10))
    new_x_db_max = x_db.amax(dim=(-2, -1)) - 80.0
    feats = torch.max(x_db, new_x_db_max.view(x_db.shape[0], 1, 1))
    return feats - feats.mean(dim=1, keepdim=True)


class RefEcapa:
    def __init__(self, model_dir: Path, device: torch.device):
        self.device = device
        ref = load_reference_module()
        self.model = ref.ECAPA_TDNN(
            input_size=80,
            channels=[1024, 1024, 1024, 1024, 3072],
            kernel_sizes=[5, 3, 3, 3, 1],
            dilations=[1, 2, 3, 4, 1],
            attention_channels=128,
            lin_neurons=192,
        )
        self.model.load_state_dict(torch.load(model_dir / "reference" / "embedding_model.ckpt", map_location="cpu"), strict=True)
        self.model.eval().to(device)
        self.classifier_weight = torch.load(model_dir / "reference" / "classifier.ckpt", map_location="cpu")["weight"].to(device)
        self.glob_mean = torch.load(model_dir / "reference" / "mean_var_norm_emb.ckpt", map_location="cpu")["glob_mean"].to(device)
        self.labels = load_labels(model_dir)

    def classify(self, audio_path: Path) -> dict[str, float | int | str]:
        waveform, sample_rate = read_wav_pcm_f32(audio_path)
        waveform = resample_linear_mono(waveform, sample_rate, 16000)
        feats = compute_reference_fbank(waveform, self.device)
        with torch.no_grad():
            emb = self.model(feats).squeeze(1)
            emb = emb - self.glob_mean.unsqueeze(0)
            logits = torch.nn.functional.linear(torch.nn.functional.normalize(emb), torch.nn.functional.normalize(self.classifier_weight))
            if self.device.type == "cuda":
                torch.cuda.synchronize(self.device)
        index = int(torch.argmax(logits, dim=1).item())
        return {"label": self.labels[index], "index": index, "score": float(logits[0, index].item())}


def parse_csv_paths(value: str, fallback: Path) -> list[Path]:
    return [Path(item) for item in value.split(",") if item] if value else [fallback]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/ecapa_tdnn")
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
    model = RefEcapa(REPO_ROOT / args.model, device)
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
        print(f"ecapa_tdnn_spk.wall_ms={wall_ms}")
        steps.append({
            "request_index": index,
            "audio": str(path),
            "label": classified["label"],
            "index": classified["index"],
            "score": classified["score"],
            "metrics": {"wall_ms": wall_ms},
        })
    print("summary_json=" + json.dumps({"family": "ecapa_tdnn_spk", "backend": args.backend, "sequence_steps": steps}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
