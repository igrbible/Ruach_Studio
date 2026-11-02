"""Ruach Studio plugin: transcribe a take's stems to MIDI with Basic Pitch.

The package is split along the seams of the problem:

* :mod:`~ruach_basic_pitch.manifest` reads the stem set the lab provides.
* :mod:`~ruach_basic_pitch.params` parses the step's fields.
* :mod:`~ruach_basic_pitch.transcriber` defines the ``Transcriber`` protocol and
  the real Basic Pitch adapter.
* :mod:`~ruach_basic_pitch.runner` runs every stem and collects outcomes.
* :mod:`~ruach_basic_pitch.report` renders ``report.csv`` and the summary line.
* :mod:`~ruach_basic_pitch.contract` declares the wire format shared with the lab.
* :mod:`~ruach_basic_pitch.cli` is the command-line entry point.

The names below are the public API; everything else is an implementation detail.
"""

from __future__ import annotations

from .contract import ExitCode, FileEntry, StepPayload
from .manifest import ManifestError, Stem, load_stems
from .params import Params, parse_params
from .report import StemOutcome
from .runner import StepResult, run_step
from .transcriber import MidiLike, Transcriber, Transcription

__version__ = "0.2.0"

__all__ = [
    "ExitCode",
    "FileEntry",
    "ManifestError",
    "MidiLike",
    "Params",
    "Stem",
    "StemOutcome",
    "StepPayload",
    "StepResult",
    "Transcriber",
    "Transcription",
    "__version__",
    "load_stems",
    "parse_params",
    "run_step",
]
