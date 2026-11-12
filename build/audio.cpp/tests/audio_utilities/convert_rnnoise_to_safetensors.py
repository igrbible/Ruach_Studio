#!/usr/bin/env python3
"""Convert official RNNoise PyTorch checkpoints and reference fixtures.

The input archive is the Xiph RNNoise model artifact listed in
docs/FrameworkAudioUtilityModelCandidates.md. Outputs stay outside models/ because
these are framework utility assets, not user-selectable model directories.
"""

from __future__ import annotations

import argparse
import math
import tarfile
import tempfile
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from safetensors.torch import save_file


CHECKPOINTS = ("rnnoise10Ga_12.pth", "rnnoise10Gb_15.pth")
SAMPLE_RATE = 48000
FRAME_SIZE = 480
WINDOW_SIZE = 960
FREQ_SIZE = 481
NB_BANDS = 32
NB_FEATURES = 65
PITCH_MIN_PERIOD = 60
PITCH_MAX_PERIOD = 768
PITCH_FRAME_SIZE = 960
PITCH_BUF_SIZE = PITCH_MAX_PERIOD + PITCH_FRAME_SIZE
EBAND20MS = np.array(
    [0, 2, 4, 6, 8, 10, 12, 15, 18, 21, 24, 28, 32, 36, 41, 47, 53,
     60, 68, 77, 87, 98, 110, 124, 140, 157, 176, 198, 223, 251, 282,
     317, 356, 400],
    dtype=np.int64,
)


class RnnoiseTorch(torch.nn.Module):
    def __init__(self, state_dict: dict[str, torch.Tensor]) -> None:
        super().__init__()
        self.conv1_weight = state_dict["conv1.weight"]
        self.conv1_bias = state_dict["conv1.bias"]
        self.conv2_weight = state_dict["conv2.weight"]
        self.conv2_bias = state_dict["conv2.bias"]
        self.gru1 = torch.nn.GRU(384, 384, batch_first=True)
        self.gru2 = torch.nn.GRU(384, 384, batch_first=True)
        self.gru3 = torch.nn.GRU(384, 384, batch_first=True)
        self.dense_out_weight = state_dict["dense_out.weight"]
        self.dense_out_bias = state_dict["dense_out.bias"]
        self.vad_dense_weight = state_dict["vad_dense.weight"]
        self.vad_dense_bias = state_dict["vad_dense.bias"]
        self.gru1.load_state_dict({k.removeprefix("gru1."): v for k, v in state_dict.items() if k.startswith("gru1.")})
        self.gru2.load_state_dict({k.removeprefix("gru2."): v for k, v in state_dict.items() if k.startswith("gru2.")})
        self.gru3.load_state_dict({k.removeprefix("gru3."): v for k, v in state_dict.items() if k.startswith("gru3.")})

    @staticmethod
    def causal_conv1d(x: torch.Tensor, weight: torch.Tensor, bias: torch.Tensor) -> torch.Tensor:
        kernel = weight.shape[-1]
        x_bct = x.transpose(1, 2)
        x_bct = F.pad(x_bct, (kernel - 1, 0))
        return F.conv1d(x_bct, weight, bias).transpose(1, 2)

    def forward(self, features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        x = torch.tanh(self.causal_conv1d(features, self.conv1_weight, self.conv1_bias))
        conv2 = torch.tanh(self.causal_conv1d(x, self.conv2_weight, self.conv2_bias))
        gru1, _ = self.gru1(conv2)
        gru2, _ = self.gru2(gru1)
        gru3, _ = self.gru3(gru2)
        head = torch.cat([conv2, gru1, gru2, gru3], dim=-1)
        gains = torch.sigmoid(F.linear(head, self.dense_out_weight, self.dense_out_bias))
        vad = torch.sigmoid(F.linear(head, self.vad_dense_weight, self.vad_dense_bias))
        return gains, vad


def rnnoise_half_window() -> np.ndarray:
    i = np.arange(FRAME_SIZE, dtype=np.float64)
    inner = np.sin(0.5 * np.pi * (i + 0.5) / FRAME_SIZE)
    return np.sin(0.5 * np.pi * inner * inner).astype(np.float32)


def apply_window(x: np.ndarray) -> np.ndarray:
    y = x.astype(np.float32, copy=True)
    w = rnnoise_half_window()
    y[:FRAME_SIZE] *= w
    y[WINDOW_SIZE - FRAME_SIZE:] *= w[::-1]
    return y


def compute_band_energy(spec: np.ndarray) -> np.ndarray:
    sums = np.zeros((NB_BANDS + 2,), dtype=np.float32)
    power = (spec.real * spec.real + spec.imag * spec.imag).astype(np.float32)
    for band in range(NB_BANDS + 1):
        start = int(EBAND20MS[band])
        size = int(EBAND20MS[band + 1] - EBAND20MS[band])
        for j in range(size):
            frac = j / size
            value = power[start + j]
            sums[band] += (1.0 - frac) * value
            sums[band + 1] += frac * value
    sums[1] = (sums[0] + sums[1]) * 2.0 / 3.0
    sums[NB_BANDS] = (sums[NB_BANDS] + sums[NB_BANDS + 1]) * 2.0 / 3.0
    return sums[1:NB_BANDS + 1].astype(np.float32)


def compute_band_corr(x: np.ndarray, p: np.ndarray) -> np.ndarray:
    sums = np.zeros((NB_BANDS + 2,), dtype=np.float32)
    corr = (x.real * p.real + x.imag * p.imag).astype(np.float32)
    for band in range(NB_BANDS + 1):
        start = int(EBAND20MS[band])
        size = int(EBAND20MS[band + 1] - EBAND20MS[band])
        for j in range(size):
            frac = j / size
            value = corr[start + j]
            sums[band] += (1.0 - frac) * value
            sums[band + 1] += frac * value
    sums[1] = (sums[0] + sums[1]) * 2.0 / 3.0
    sums[NB_BANDS] = (sums[NB_BANDS] + sums[NB_BANDS + 1]) * 2.0 / 3.0
    return sums[1:NB_BANDS + 1].astype(np.float32)


def interp_band_gain(gains: np.ndarray) -> np.ndarray:
    out = np.zeros((FREQ_SIZE,), dtype=np.float32)
    for band in range(1, NB_BANDS):
        start = int(EBAND20MS[band])
        size = int(EBAND20MS[band + 1] - EBAND20MS[band])
        for j in range(size):
            frac = j / size
            out[start + j] = (1.0 - frac) * gains[band - 1] + frac * gains[band]
    out[: EBAND20MS[1]] = gains[0]
    out[EBAND20MS[NB_BANDS] : EBAND20MS[NB_BANDS + 1]] = gains[NB_BANDS - 1]
    return out


def rnnoise_dct(values: np.ndarray) -> np.ndarray:
    out = np.empty((NB_BANDS,), dtype=np.float32)
    for i in range(NB_BANDS):
        total = 0.0
        for j in range(NB_BANDS):
            basis = math.cos((j + 0.5) * i * math.pi / NB_BANDS)
            if i == 0:
                basis *= math.sqrt(0.5)
            total += float(values[j]) * basis
        out[i] = total * math.sqrt(2.0 / 22.0)
    return out


def autocorr(x: np.ndarray, lag: int) -> np.ndarray:
    fast = len(x) - lag
    ac = np.empty((lag + 1,), dtype=np.float32)
    for k in range(lag + 1):
        tail = 0.0
        for i in range(k + fast, len(x)):
            tail += float(x[i]) * float(x[i - k])
        ac[k] = np.dot(x[:fast], x[k:k + fast]) + tail
    return ac


def lpc(ac: np.ndarray, order: int) -> np.ndarray:
    coeff = np.zeros((order,), dtype=np.float32)
    error = float(ac[0])
    if error == 0.0:
        return coeff
    for i in range(order):
        rr = sum(float(coeff[j]) * float(ac[i - j]) for j in range(i))
        rr += float(ac[i + 1]) / 8.0
        r = -8.0 * rr / error
        coeff[i] = r / 8.0
        for j in range((i + 1) // 2):
            a = float(coeff[j])
            b = float(coeff[i - 1 - j])
            coeff[j] = a + r * b
            coeff[i - 1 - j] = b + r * a
        error -= r * r * error
        if error < 0.001 * float(ac[0]):
            break
    return coeff


def fir5(x: np.ndarray, num: np.ndarray) -> np.ndarray:
    out = np.empty_like(x)
    mem = np.zeros((5,), dtype=np.float32)
    for i, sample in enumerate(x):
        out[i] = sample + np.dot(num, mem)
        mem[4] = mem[3]
        mem[3] = mem[2]
        mem[2] = mem[1]
        mem[1] = mem[0]
        mem[0] = sample
    return out


def pitch_downsample(x: np.ndarray) -> np.ndarray:
    y = np.zeros((len(x) // 2,), dtype=np.float32)
    y[0] = 0.25 * x[1] + 0.5 * x[0]
    for i in range(1, len(x) // 2):
        y[i] = 0.25 * x[2 * i - 1] + 0.5 * x[2 * i] + 0.25 * x[2 * i + 1]
    ac = autocorr(y, 4)
    ac[0] *= 1.0001
    for i in range(1, 5):
        ac[i] -= ac[i] * (0.008 * i) * (0.008 * i)
    coeff = lpc(ac, 4)
    tmp = 1.0
    for i in range(4):
        tmp *= 0.9
        coeff[i] *= tmp
    num = np.empty((5,), dtype=np.float32)
    num[0] = coeff[0] + 0.8
    num[1] = coeff[1] + 0.8 * coeff[0]
    num[2] = coeff[2] + 0.8 * coeff[1]
    num[3] = coeff[3] + 0.8 * coeff[2]
    num[4] = 0.8 * coeff[3]
    return fir5(y, num)


def find_best_pitch(xcorr: np.ndarray, y: np.ndarray, length: int, max_pitch: int) -> tuple[int, int]:
    syy = 1.0 + float(np.dot(y[:length], y[:length]))
    best_num = [-1.0, -1.0]
    best_den = [0.0, 0.0]
    best_pitch = [0, 1]
    for i in range(max_pitch):
        if xcorr[i] > 0:
            scaled = float(xcorr[i]) * 1e-12
            num = scaled * scaled
            if num * best_den[1] > best_num[1] * syy:
                if num * best_den[0] > best_num[0] * syy:
                    best_num[1], best_den[1], best_pitch[1] = best_num[0], best_den[0], best_pitch[0]
                    best_num[0], best_den[0], best_pitch[0] = num, syy, i
                else:
                    best_num[1], best_den[1], best_pitch[1] = num, syy, i
        syy += float(y[i + length] * y[i + length] - y[i] * y[i])
        syy = max(1.0, syy)
    return best_pitch[0], best_pitch[1]


def pitch_search(x_lp: np.ndarray, y: np.ndarray, length: int, max_pitch: int) -> int:
    lag = length + max_pitch
    x_lp4 = x_lp[0:length:2]
    y_lp4 = y[0:lag:2]
    xcorr = np.array([np.dot(x_lp4[: length // 4], y_lp4[i:i + length // 4]) for i in range(max_pitch // 4)], dtype=np.float32)
    best0, best1 = find_best_pitch(xcorr, y_lp4, length // 4, max_pitch // 4)
    xcorr = np.zeros((max_pitch // 2,), dtype=np.float32)
    for i in range(max_pitch // 2):
        if abs(i - 2 * best0) > 2 and abs(i - 2 * best1) > 2:
            continue
        xcorr[i] = max(-1.0, float(np.dot(x_lp[: length // 2], y[i:i + length // 2])))
    best0, _ = find_best_pitch(xcorr, y, length // 2, max_pitch // 2)
    offset = 0
    if 0 < best0 < max_pitch // 2 - 1:
        a, b, c = float(xcorr[best0 - 1]), float(xcorr[best0]), float(xcorr[best0 + 1])
        if c - a > 0.7 * (b - a):
            offset = 1
        elif a - c > 0.7 * (b - c):
            offset = -1
    return 2 * best0 - offset


def compute_pitch_gain(xy: float, xx: float, yy: float) -> float:
    return xy / math.sqrt(1.0 + xx * yy)


def remove_doubling(x: np.ndarray, pitch: int, prev_period: int, prev_gain: float) -> tuple[int, float]:
    second_check = [0, 0, 3, 2, 3, 2, 5, 2, 3, 2, 3, 2, 5, 2, 3, 2]
    max_period = PITCH_MAX_PERIOD // 2
    min_period = PITCH_MIN_PERIOD // 2
    min_period0 = PITCH_MIN_PERIOD
    t0 = pitch // 2
    prev_period //= 2
    length = PITCH_FRAME_SIZE // 2
    base = PITCH_MAX_PERIOD // 2
    if t0 >= max_period:
        t0 = max_period - 1
    current = x[base:base + length]
    xx = float(np.dot(current, current))
    past = x[base - t0:base - t0 + length]
    xy = float(np.dot(current, past))
    yy_lookup = np.empty((PITCH_MAX_PERIOD + 1,), dtype=np.float32)
    yy_lookup[0] = xx
    yy = xx
    for i in range(1, max_period + 1):
        yy += float(x[base - i] * x[base - i] - x[base + length - i] * x[base + length - i])
        yy_lookup[i] = max(0.0, yy)
    yy = float(yy_lookup[t0])
    best_xy, best_yy, best_t = xy, yy, t0
    g0 = compute_pitch_gain(xy, xx, yy)
    gain = g0
    for k in range(2, 16):
        t1 = (2 * t0 + k) // (2 * k)
        if t1 < min_period:
            break
        t1b = t0 if k == 2 and t1 + t0 > max_period else (t0 + t1 if k == 2 else (2 * second_check[k] * t0 + k) // (2 * k))
        xy1 = float(np.dot(current, x[base - t1:base - t1 + length]))
        xy2 = float(np.dot(current, x[base - t1b:base - t1b + length]))
        xy = 0.5 * (xy1 + xy2)
        yy = 0.5 * (float(yy_lookup[t1]) + float(yy_lookup[t1b]))
        g1 = compute_pitch_gain(xy, xx, yy)
        cont = prev_gain if abs(t1 - prev_period) <= 1 else (0.5 * prev_gain if abs(t1 - prev_period) <= 2 and 5 * k * k < t0 else 0.0)
        thresh = max(0.3, 0.7 * g0 - cont)
        if t1 < 3 * min_period:
            thresh = max(0.4, 0.85 * g0 - cont)
        elif t1 < 2 * min_period:
            thresh = max(0.5, 0.9 * g0 - cont)
        if g1 > thresh:
            best_xy, best_yy, best_t, gain = xy, yy, t1, g1
    best_xy = max(0.0, best_xy)
    pg = 1.0 if best_yy <= best_xy else best_xy / (best_yy + 1.0)
    xcorr = np.array([np.dot(current, x[base - (best_t + k - 1):base - (best_t + k - 1) + length]) for k in range(3)], dtype=np.float32)
    offset = 0
    if xcorr[2] - xcorr[0] > 0.7 * (xcorr[1] - xcorr[0]):
        offset = 1
    elif xcorr[0] - xcorr[2] > 0.7 * (xcorr[1] - xcorr[2]):
        offset = -1
    if pg > gain:
        pg = gain
    pitch = 2 * best_t + offset
    return max(pitch, min_period0), float(pg)


def pitch_filter(x: np.ndarray, p: np.ndarray, ex: np.ndarray, ep: np.ndarray, exp: np.ndarray, gains: np.ndarray) -> np.ndarray:
    r = np.empty((NB_BANDS,), dtype=np.float32)
    for band in range(NB_BANDS):
        if exp[band] > gains[band]:
            r[band] = 1.0
        else:
            corr2 = exp[band] * exp[band]
            gain2 = gains[band] * gains[band]
            r[band] = math.sqrt(min(1.0, max(0.0, corr2 * (1.0 - gain2) / (0.001 + gain2 * (1.0 - corr2)))))
        r[band] *= math.sqrt(ex[band] / (1e-8 + ep[band]))
    y = x + interp_band_gain(r).astype(np.complex64) * p
    newe = compute_band_energy(y)
    norm = np.sqrt(ex / (1e-8 + newe)).astype(np.float32)
    return y * interp_band_gain(norm).astype(np.complex64)


def biquad(x: np.ndarray, mem: np.ndarray) -> np.ndarray:
    a = np.array([-1.99599, 0.99600], dtype=np.float32)
    b = np.array([-2.0, 1.0], dtype=np.float32)
    y = np.empty_like(x)
    for i, xi in enumerate(x):
        yi = xi + mem[0]
        mem[0] = mem[1] + (b[0] * xi - a[0] * yi)
        mem[1] = b[1] * xi - a[1] * yi
        y[i] = yi
    return y


def make_waveform_case(case_index: int) -> np.ndarray:
    samples = 4800 + case_index * 960
    t = np.arange(samples, dtype=np.float32) / SAMPLE_RATE
    voiced = 0.22 * np.sin(2 * np.pi * (170 + 30 * case_index) * t)
    harmonic = 0.07 * np.sin(2 * np.pi * (340 + 40 * case_index) * t + 0.3)
    noise = 0.025 * np.sin(2 * np.pi * 1870 * t + 0.1 * case_index)
    envelope = np.minimum(1.0, np.arange(samples, dtype=np.float32) / 1200.0)
    return ((voiced + harmonic + noise) * envelope).astype(np.float32)


def process_waveform_reference(model: RnnoiseTorch, waveform: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    frames = math.ceil(len(waveform) / FRAME_SIZE)
    padded = np.zeros((frames * FRAME_SIZE,), dtype=np.float32)
    padded[: len(waveform)] = waveform
    analysis_mem = np.zeros((FRAME_SIZE,), dtype=np.float32)
    pitch_buf = np.zeros((PITCH_BUF_SIZE,), dtype=np.float32)
    highpass_mem = np.zeros((2,), dtype=np.float32)
    last_gain = 0.0
    last_period = 0
    frame_data = []
    features = []
    for frame in range(frames):
        current = biquad(padded[frame * FRAME_SIZE:(frame + 1) * FRAME_SIZE], highpass_mem)
        windowed = apply_window(np.concatenate([analysis_mem, current]))
        analysis_mem[:] = current
        spec = np.fft.rfft(windowed).astype(np.complex64)
        ex = compute_band_energy(spec)
        pitch_buf[:-FRAME_SIZE] = pitch_buf[FRAME_SIZE:]
        pitch_buf[-FRAME_SIZE:] = current
        pitch_lp = pitch_downsample(pitch_buf)
        pitch_index = pitch_search(pitch_lp[PITCH_MAX_PERIOD // 2:], pitch_lp, PITCH_FRAME_SIZE, PITCH_MAX_PERIOD - 3 * PITCH_MIN_PERIOD)
        pitch_index = PITCH_MAX_PERIOD - pitch_index
        pitch_index, last_gain = remove_doubling(pitch_lp, pitch_index, last_period, last_gain)
        last_period = pitch_index
        pitch_frame = apply_window(pitch_buf[PITCH_BUF_SIZE - WINDOW_SIZE - pitch_index:PITCH_BUF_SIZE - pitch_index])
        pitch_spec = np.fft.rfft(pitch_frame).astype(np.complex64)
        ep = compute_band_energy(pitch_spec)
        exp = compute_band_corr(spec, pitch_spec)
        exp = exp / np.sqrt(0.001 + ex * ep)
        feat = np.zeros((NB_FEATURES,), dtype=np.float32)
        feat[NB_BANDS:2 * NB_BANDS] = rnnoise_dct(exp)
        feat[2 * NB_BANDS] = 0.01 * (pitch_index - 300)
        energy = 0.0
        ly = np.empty((NB_BANDS,), dtype=np.float32)
        log_max = -2.0
        follow = -2.0
        for band in range(NB_BANDS):
            value = math.log10(1e-2 + float(ex[band]))
            value = max(log_max - 7.0, max(follow - 1.5, value))
            log_max = max(log_max, value)
            follow = max(follow - 1.5, value)
            energy += float(ex[band])
            ly[band] = value
        silence = energy < 0.04
        if not silence:
            feat[:NB_BANDS] = rnnoise_dct(ly)
            feat[0] -= 12.0
            feat[1] -= 4.0
        features.append(feat)
        frame_data.append((spec, pitch_spec, ex, ep, exp, silence))
    feature_tensor = torch.from_numpy(np.stack(features, axis=0)).unsqueeze(0)
    with torch.no_grad():
        gains_tensor, vad_tensor = model(feature_tensor)
    gains_all = gains_tensor.squeeze(0).cpu().numpy().astype(np.float32)
    vad = vad_tensor.squeeze(0).squeeze(-1).cpu().numpy().astype(np.float32)
    output = np.zeros_like(padded)
    synthesis_mem = np.zeros((FRAME_SIZE,), dtype=np.float32)
    delayed_x = np.zeros((FREQ_SIZE,), dtype=np.complex64)
    delayed_p = np.zeros((FREQ_SIZE,), dtype=np.complex64)
    delayed_ex = np.zeros((NB_BANDS,), dtype=np.float32)
    delayed_ep = np.zeros((NB_BANDS,), dtype=np.float32)
    delayed_exp = np.zeros((NB_BANDS,), dtype=np.float32)
    last_gains = np.zeros((NB_BANDS,), dtype=np.float32)
    for frame, (spec, pitch_spec, ex, ep, exp, silence) in enumerate(frame_data):
        if not silence:
            gains = gains_all[frame].copy()
            delayed_x = pitch_filter(delayed_x, delayed_p, delayed_ex, delayed_ep, delayed_exp, gains)
            for band in range(NB_BANDS):
                gains[band] = max(gains[band], 0.6 * last_gains[band])
                last_gains[band] = min(1.0, gains[band] * (delayed_ex[band] + 1e-3) / (ex[band] + 1e-3))
            delayed_x *= interp_band_gain(gains).astype(np.complex64)
        time = np.fft.irfft(delayed_x, WINDOW_SIZE).astype(np.float32)
        time = apply_window(time)
        output[frame * FRAME_SIZE:(frame + 1) * FRAME_SIZE] = time[:FRAME_SIZE] + synthesis_mem
        synthesis_mem[:] = time[FRAME_SIZE:]
        delayed_x = spec.copy()
        delayed_p = pitch_spec.copy()
        delayed_ex = ex.copy()
        delayed_ep = ep.copy()
        delayed_exp = exp.copy()
    return output[: len(waveform)].astype(np.float32), vad


def make_fixture_input(case_index: int, frames: int, feature_size: int = 65) -> torch.Tensor:
    values = torch.empty((1, frames, feature_size), dtype=torch.float32)
    for frame in range(frames):
        t = frame / 100.0
        for feature in range(feature_size):
            f = feature + 1
            voiced = 0.08 * math.sin(2.0 * math.pi * (0.7 + 0.01 * f) * t + 0.13 * case_index)
            harmonic = 0.05 * math.cos(2.0 * math.pi * (0.19 + 0.003 * f) * frame)
            tilt = 0.002 * ((feature % 13) - 6)
            values[0, frame, feature] = voiced + harmonic + tilt
    values[:, :, 0] += 1.0 + 0.05 * case_index
    values[:, :, 1] += 0.5
    return values


def load_checkpoint_from_archive(archive: Path, name: str) -> dict:
    with tarfile.open(archive, "r:gz") as tar:
        member = next((m for m in tar.getmembers() if Path(m.name).name == name), None)
        if member is None:
            raise RuntimeError(f"missing {name} in {archive}")
        with tempfile.TemporaryDirectory() as temp_dir:
            tar.extract(member, temp_dir, filter="data")
            return torch.load(Path(temp_dir) / member.name, map_location="cpu")


def convert_checkpoint(archive: Path, name: str, output_dir: Path, fixture_dir: Path) -> None:
    checkpoint = load_checkpoint_from_archive(archive, name)
    state_dict = {k: v.detach().contiguous().to(torch.float32) for k, v in checkpoint["state_dict"].items()}
    stem = Path(name).stem
    output_dir.mkdir(parents=True, exist_ok=True)
    fixture_dir.mkdir(parents=True, exist_ok=True)
    save_file(
        state_dict,
        output_dir / f"{stem}.safetensors",
        metadata={
            "source": "https://media.xiph.org/rnnoise/models/rnnoise_data-0a8755f8e2d834eff6a54714ecc7d75f9932e845df35f8b59bc52a7cfe6e8b37.tar.gz",
            "license": "BSD-3-Clause",
            "architecture": "rnnoise-feature-network-v1",
            "epoch": str(checkpoint.get("epoch", "")),
            "loss": str(checkpoint.get("loss", "")),
        },
    )

    model = RnnoiseTorch(state_dict).eval()
    with torch.no_grad():
        for case_index, frames in enumerate((6, 13)):
            features = make_fixture_input(case_index, frames)
            gains, vad = model(features)
            save_file(
                {
                    "features": features.squeeze(0).contiguous(),
                    "gains": gains.squeeze(0).contiguous(),
                    "vad": vad.squeeze(0).contiguous(),
                },
                fixture_dir / f"{stem}_case{case_index}.safetensors",
                metadata={
                    "source": "python torch reference",
                    "checkpoint": stem,
                    "frames": str(frames),
                },
            )
        for case_index in range(2):
            waveform = make_waveform_case(case_index)
            processed, vad = process_waveform_reference(model, waveform)
            save_file(
                {
                    "waveform_input": torch.from_numpy(waveform.reshape(1, -1)),
                    "waveform_output": torch.from_numpy(processed.reshape(1, -1)),
                    "waveform_vad": torch.from_numpy(vad.reshape(1, -1)),
                },
                fixture_dir / f"{stem}_waveform_case{case_index}.safetensors",
                metadata={
                    "source": "RNNoise official-DSP-equivalent Python reference",
                    "checkpoint": stem,
                    "sample_rate": str(SAMPLE_RATE),
                },
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("assets/framework/audio_utilities/rnnoise"))
    parser.add_argument("--fixture-dir", type=Path, default=Path("tests/assets/framework/audio_utilities/rnnoise"))
    args = parser.parse_args()
    for checkpoint in CHECKPOINTS:
        convert_checkpoint(args.archive, checkpoint, args.output_dir, args.fixture_dir)


if __name__ == "__main__":
    main()
