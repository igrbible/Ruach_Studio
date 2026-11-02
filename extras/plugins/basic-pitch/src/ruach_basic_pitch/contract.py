"""Types and constants for the contract between this plugin and the Ruach lab.

Everything the lab can observe about a step run lives here: the exit codes, the
names of the files the step writes, and the shape of the JSON line printed as
the last line of standard output. Keeping these in one module means the wire
format is declared once and type-checked everywhere it is produced.

See ``docs/PLUGIN_CONTRACT.md`` for the contract in prose.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Final, TypedDict

REPORT_FILE: Final[str] = "report.csv"
"""Name of the per-stem report written next to the MIDI files."""

MIDI_SUFFIX: Final[str] = ".mid"
"""Extension of every MIDI file the step writes."""

SUMMARY_MAX_CHARS: Final[int] = 300
"""Longest ``summary`` the lab shows beside a branch (per Ruach's PLUGINS.md)."""


class ExitCode(IntEnum):
    """Process exit codes of ``transcribe.py``.

    The lab treats any non-zero code as a failed step and shows the last line
    of standard error in the take's tree and the step's panel.
    """

    OK = 0
    """The step ran; at least one stem did not fail."""

    FAILED = 1
    """The inputs were unusable, or every stem failed."""

    USAGE = 2
    """Wrong number of command-line arguments."""


class FileEntry(TypedDict):
    """One output file the step reports to the lab.

    Attributes:
        name: Label shown in the take's tree.
        file: Plain file name inside ``OUTDIR`` (no directories).
    """

    name: str
    file: str


class StepPayload(TypedDict):
    """The JSON object printed as the last line of standard output.

    Attributes:
        files: Output files, MIDI first, then the report.
        summary: One line (at most ``SUMMARY_MAX_CHARS``) shown beside the branch.
        took: Wall-clock seconds the step took, rounded to one decimal.
    """

    files: list[FileEntry]
    summary: str
    took: float
