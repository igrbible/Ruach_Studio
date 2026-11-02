# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `requirements-onnx.txt` and install notes for Python 3.12+, where Basic Pitch's
  TensorFlow pin cannot be installed; verified with real Basic Pitch on Python 3.14.
- MIT `LICENSE`, so Ruach Studio's owner and its users can use, modify and
  redistribute the plugin without extra conditions.

## [0.2.0] - 2026-10-31

### Added
- `mypy --strict` across `src/` and `tests/`, with no `Any` in `src/`;
  `py.typed` marker so downstream users get the types.
- `contract.py`: `ExitCode`, `StepPayload` and `FileEntry` declare the wire format
  to the lab in one place.
- `ruff` (lint, format, annotation and docstring rules) and a GitHub Actions
  workflow running lint, format, type-check and tests on Python 3.10-3.13.
- Drift-guard tests: `plugin.json` must agree with `params.py` on keys, defaults
  and bounds.
- `python -m ruach_basic_pitch` entry point.
- Documentation: architecture, plugin contract, development guide,
  troubleshooting; Google-style docstrings throughout.

### Changed
- Basic Pitch's model is now loaded once per process and reused for every stem.
  Previously `predict()` was called with a path, which reloads the model on every
  call.
- `parse_params` accepts any mapping, rejects booleans where numbers are expected,
  and only accepts real booleans for `bends`.
- `load_params` raises a clear `ValueError` when `PARAMS.json` is not an object.
- Value types (`Stem`, `Params`, `StemOutcome`, `StepResult`, `Transcription`) are
  `frozen` and `slots` dataclasses.

## [0.1.0] - 2026-10-31

### Added
- Initial Refiner step **To MIDI**: transcribes each stem of a take to MIDI with
  Spotify's Basic Pitch and writes a per-stem `report.csv`.
- BDD scenarios (pytest-bdd) with an injected fake transcriber.
