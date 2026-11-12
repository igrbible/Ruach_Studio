from __future__ import annotations

import argparse
import json
import os
import sys
import time
import types
from contextlib import contextmanager
from pathlib import Path

import librosa


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_NEMO_ROOT = REPO_ROOT / "reference" / "nemo"
if str(REFERENCE_NEMO_ROOT) not in sys.path:
    sys.path.insert(0, str(REFERENCE_NEMO_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Warm repeated Python benchmark for the NeMo Sortformer diarizer.")
    parser.add_argument("--model", default="nvidia/diar_sortformer_4spk-v1")
    parser.add_argument("--audio", type=Path, default=Path("build/assets/parakeet/sample_10s_16k.wav"))
    parser.add_argument("--warmup-audio", type=Path, default=None)
    parser.add_argument("--audio-sequence", default="")
    parser.add_argument("--backend", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--warmup", type=int, default=2)
    parser.add_argument("--iterations", type=int, default=5)
    parser.add_argument("--session-len-sec", type=float, default=20.0)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--postprocessing-yaml", default=None)
    return parser.parse_args()


def parse_audio_sequence(args: argparse.Namespace) -> list[Path]:
    if not args.audio_sequence:
        return [args.audio]
    return [Path(item) for item in args.audio_sequence.split(",") if item]


def synchronize_if_needed(torch_module, backend: str) -> None:
    if backend == "cuda":
        torch_module.cuda.synchronize()


def json_escape(value: str) -> str:
    return json.dumps(value)[1:-1]


def make_jsonable(value: object) -> object:
    if isinstance(value, dict):
        return {str(key): make_jsonable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [make_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [make_jsonable(item) for item in value]
    if hasattr(value, "item") and callable(value.item):
        try:
            return value.item()
        except Exception:
            pass
    return value


def parse_segment_line(line: str) -> dict[str, object]:
    parts = line.strip().split()
    if len(parts) != 3:
        raise ValueError(f"unexpected diarization line: {line!r}")
    start_sec = float(parts[0])
    end_sec = float(parts[1])
    speaker = parts[2]
    speaker_idx = 0
    if speaker.startswith("speaker_"):
        try:
            speaker_idx = int(speaker.split("_", 1)[1])
        except Exception:
            speaker_idx = 0
    return {
        "start_sample": int(round(start_sec * 16000.0)),
        "end_sample": int(round(end_sec * 16000.0)),
        "speaker_id": f"SPEAKER_{speaker_idx:02d}",
        "confidence": 0.0,
    }


def normalize_diarize_output(output: object) -> list[dict[str, object]]:
    if not isinstance(output, list):
        return []
    lines: list[str] = []
    if output and isinstance(output[0], list):
        if len(output) != 1:
            raise RuntimeError(f"expected single-sample diarization output, got batch of {len(output)}")
        lines = [str(item) for item in output[0]]
    else:
        lines = [str(item) for item in output]
    return [parse_segment_line(line) for line in lines]


class SegmentTimer:
    def __init__(self, torch_module, backend: str):
        self._torch = torch_module
        self._backend = backend
        self._active = False
        self._metrics = {
            "frontend_ms": 0.0,
            "nest_encoder_ms": 0.0,
            "transformer_ms": 0.0,
            "postprocess_ms": 0.0,
        }

    def reset(self) -> None:
        for key in self._metrics:
            self._metrics[key] = 0.0

    def begin(self) -> None:
        self.reset()
        self._active = True

    def end(self) -> dict[str, float]:
        self._active = False
        encoder_ms = self._metrics["nest_encoder_ms"] + self._metrics["transformer_ms"]
        return {
            "sortformer.frontend_ms": self._metrics["frontend_ms"],
            "sortformer.nest_encoder_ms": self._metrics["nest_encoder_ms"],
            "sortformer.transformer_ms": self._metrics["transformer_ms"],
            "sortformer.encoder_ms": encoder_ms,
            "sortformer.postprocess_ms": self._metrics["postprocess_ms"],
        }

    @contextmanager
    def measure(self, key: str):
        if not self._active:
            yield
            return
        synchronize_if_needed(self._torch, self._backend)
        started = time.perf_counter()
        try:
            yield
        finally:
            synchronize_if_needed(self._torch, self._backend)
            ended = time.perf_counter()
            self._metrics[key] += (ended - started) * 1000.0


def install_segment_hooks(model, torch_module, backend: str):
    timer = SegmentTimer(torch_module, backend)

    original_process_signal = model.process_signal

    def process_signal_wrapped(self, *args, **kwargs):
        with timer.measure("frontend_ms"):
            return original_process_signal(*args, **kwargs)

    model.process_signal = types.MethodType(process_signal_wrapped, model)

    original_frontend_encoder = model.frontend_encoder

    def frontend_encoder_wrapped(self, *args, **kwargs):
        with timer.measure("nest_encoder_ms"):
            return original_frontend_encoder(*args, **kwargs)

    model.frontend_encoder = types.MethodType(frontend_encoder_wrapped, model)

    original_forward_infer = model.forward_infer

    def forward_infer_wrapped(self, *args, **kwargs):
        with timer.measure("transformer_ms"):
            return original_forward_infer(*args, **kwargs)

    model.forward_infer = types.MethodType(forward_infer_wrapped, model)

    original_output_processing = model._diarize_output_processing

    def output_processing_wrapped(self, *args, **kwargs):
        with timer.measure("postprocess_ms"):
            return original_output_processing(*args, **kwargs)

    model._diarize_output_processing = types.MethodType(output_processing_wrapped, model)
    return timer


def load_model(args: argparse.Namespace):
    import torch
    from nemo.collections.asr.models import SortformerEncLabelModel

    map_location = torch.device(f"cuda:{args.device}" if args.backend == "cuda" else "cpu")
    model_arg = str(args.model)
    if os.path.isfile(model_arg) and model_arg.endswith(".nemo"):
        model = SortformerEncLabelModel.restore_from(model_arg, map_location=map_location).to(map_location)
    elif os.path.isdir(model_arg):
        raise RuntimeError(
            "NeMo Sortformer warm bench expects a HuggingFace model id or a local .nemo file for --model; "
            f"got extracted directory: {model_arg}"
        )
    else:
        model = SortformerEncLabelModel.from_pretrained(model_name=model_arg, map_location=map_location).to(map_location)
    model.eval()
    return model


def main() -> int:
    args = parse_args()
    audio_sequence = parse_audio_sequence(args)

    import torch
    from nemo.collections.asr.parts.mixins.diarization import DiarizeConfig

    torch.set_num_threads(max(1, args.threads))
    if args.backend == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA backend requested but torch.cuda.is_available() is false")

    model = load_model(args)
    timer = install_segment_hooks(model, torch, args.backend)

    warmup_audio = args.warmup_audio if args.warmup_audio is not None else audio_sequence[0]
    warmup_audio_np, warmup_sample_rate = librosa.load(str(warmup_audio), sr=None, mono=False)
    request_audios: list[tuple[Path, object, int]] = []
    for audio_path in audio_sequence:
        audio_np, sample_rate = librosa.load(str(audio_path), sr=None, mono=False)
        request_audios.append((audio_path, audio_np, sample_rate))
    last_speaker_turns: list[dict[str, object]] = []
    sums: dict[str, float] = {}
    per_run: list[dict[str, float]] = []
    sequence_steps: list[dict[str, object]] = []

    def run_once_for_audio(audio_np, sample_rate: int) -> tuple[dict[str, float], list[dict[str, object]]]:
        timer.begin()
        synchronize_if_needed(torch, args.backend)
        started = time.perf_counter()
        diarize_cfg = DiarizeConfig(
            session_len_sec=args.session_len_sec,
            batch_size=args.batch_size,
            num_workers=0,
            sample_rate=sample_rate,
            verbose=False,
            include_tensor_outputs=False,
            postprocessing_yaml=args.postprocessing_yaml,
        )
        output = model.diarize(
            audio=audio_np,
            sample_rate=sample_rate,
            postprocessing_yaml=args.postprocessing_yaml,
            override_config=diarize_cfg,
        )
        synchronize_if_needed(torch, args.backend)
        ended = time.perf_counter()
        metrics = timer.end()
        metrics["sortformer.transcribe_wall_ms"] = (ended - started) * 1000.0
        speaker_turns = normalize_diarize_output(output)
        return metrics, speaker_turns

    for _ in range(max(0, args.warmup)):
        run_once_for_audio(warmup_audio_np, warmup_sample_rate)

    for _ in range(max(1, args.iterations)):
        run_metrics: dict[str, float] = {}
        last_sequence_steps = []
        for audio_path, audio_np, sample_rate in request_audios:
            metrics, speaker_turns = run_once_for_audio(audio_np, sample_rate)
            last_sequence_steps.append(
                {
                    "audio": str(audio_path),
                    "speaker_turns": speaker_turns,
                    "diagnostics": {},
                    "metrics": metrics,
                }
            )
            for key, value in metrics.items():
                run_metrics[key] = run_metrics.get(key, 0.0) + value
            last_speaker_turns = speaker_turns
        sequence_steps = last_sequence_steps
        per_run.append(run_metrics)
        for key, value in run_metrics.items():
            sums[key] = sums.get(key, 0.0) + value

    average = {
        key: sums[key] / float(max(1, args.iterations))
        for key in (
            "sortformer.frontend_ms",
            "sortformer.nest_encoder_ms",
            "sortformer.transformer_ms",
            "sortformer.encoder_ms",
            "sortformer.postprocess_ms",
            "sortformer.transcribe_wall_ms",
        )
        if key in sums
    }

    print(f"family=sortformer_diar")
    print(f"backend={args.backend}")
    print(f"threads={args.threads}")
    print(f"warmup={args.warmup}")
    print(f"iterations={args.iterations}")
    print(f"session_len_sec={args.session_len_sec:.6f}")
    print(f"speaker_turns={json.dumps(last_speaker_turns)}")
    for run_idx, metrics in enumerate(per_run, start=1):
        print(f"run={run_idx}")
        for key in (
            "sortformer.frontend_ms",
            "sortformer.nest_encoder_ms",
            "sortformer.transformer_ms",
            "sortformer.encoder_ms",
            "sortformer.postprocess_ms",
            "sortformer.transcribe_wall_ms",
        ):
            if key in metrics:
                print(f"{key}={metrics[key]:.6f}")
    print("average")
    for key, value in average.items():
        print(f"{key}={value:.6f}")

    print(
        "summary_json="
        + json.dumps(
            {
                "family": "sortformer_diar",
                "backend": args.backend,
                "device": args.device,
                "threads": args.threads,
                "warmup": args.warmup,
                "iterations": args.iterations,
                "session_len_sec": args.session_len_sec,
                "model": args.model,
                "warmup_audio": str(warmup_audio),
                "audio_sequence": [str(path) for path in audio_sequence],
                "audio": str(args.audio),
                "speaker_turns": make_jsonable(last_speaker_turns),
                "sequence_steps": make_jsonable(sequence_steps),
                "runs": [make_jsonable(metrics) for metrics in per_run],
                "average": make_jsonable(average),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
