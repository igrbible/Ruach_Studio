"""Running the step: stems in, MIDI files and a report out.

The flow is pure with respect to the two things that make code hard to test:
the transcriber and the clock are both injected. Disk writes happen only for the
outputs the lab asked for (``<stem>.mid`` and ``report.csv``).
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from .contract import MIDI_SUFFIX, REPORT_FILE, FileEntry, StepPayload
from .manifest import Stem
from .params import Params
from .report import StemOutcome, render_report_csv, summarize
from .transcriber import Transcriber

Clock = Callable[[], float]
"""A monotonic clock returning seconds; injectable so tests need not sleep."""


@dataclass(frozen=True, slots=True)
class StepResult:
    """The outcome of a whole step run.

    Attributes:
        outcomes: One entry per stem, in manifest order.
        took: Wall-clock seconds, rounded to one decimal.
    """

    outcomes: Sequence[StemOutcome]
    took: float

    @property
    def succeeded(self) -> bool:
        """Whether the step as a whole succeeded.

        The step fails only when *every* stem failed. Silent stems are not
        failures: a drum stem with no pitched notes is a normal result.
        """
        return any(o.status != "error" for o in self.outcomes)

    def to_payload(self) -> StepPayload:
        """Build the JSON object the lab reads from the last line of output."""
        files: list[FileEntry] = [
            {"name": f"{o.title} (MIDI)", "file": o.midi_file}
            for o in self.outcomes
            if o.midi_file is not None
        ]
        files.append({"name": "note counts", "file": REPORT_FILE})
        return {"files": files, "summary": summarize(list(self.outcomes)), "took": self.took}


def transcribe_stem(
    stem: Stem, out_dir: Path, filename: str, params: Params, transcribe: Transcriber
) -> StemOutcome:
    """Transcribe one stem and write its MIDI file if any notes were found.

    Both the transcription and the MIDI write become an ``"error"`` outcome
    instead of an exception, so one bad stem never loses the others.

    Args:
        stem: The stem to transcribe.
        out_dir: Folder the MIDI file is written into (must exist).
        filename: MIDI file name to write; unique within this run.
        params: Transcription settings.
        transcribe: The transcriber to use.

    Returns:
        The stem's outcome.
    """
    try:
        result = transcribe(stem.path, params)
    except Exception as exc:
        # Deliberately broad: Basic Pitch / TensorFlow can raise many unrelated
        # exception types, and one unreadable stem must not lose the others.
        return StemOutcome(stem.name, stem.title, "error", detail=f"{type(exc).__name__}: {exc}")

    if result.note_count == 0:
        return StemOutcome(stem.name, stem.title, "silent")

    try:
        result.midi.write(str(out_dir / filename))
    except Exception as exc:
        # A full disk or a read-only output folder must fail this stem alone,
        # not abort the step after earlier stems were already written.
        return StemOutcome(
            stem.name,
            stem.title,
            "error",
            detail=f"writing MIDI failed: {type(exc).__name__}: {exc}",
        )
    return StemOutcome(stem.name, stem.title, "ok", notes=result.note_count, midi_file=filename)


def _unique_midi_filenames(stems: Sequence[Stem]) -> list[str]:
    """A distinct ``<name>.mid`` for each stem, in manifest order.

    Any directory parts of a stem's ``name`` are dropped (a stem may not write
    outside the output folder), and two stems that share a base name are kept
    apart with a numeric suffix so neither overwrites the other's MIDI.
    """
    used: set[str] = set()
    names: list[str] = []
    for stem in stems:
        base = Path(stem.name).name or "stem"
        candidate = f"{base}{MIDI_SUFFIX}"
        suffix = 2
        while candidate in used:
            candidate = f"{base}-{suffix}{MIDI_SUFFIX}"
            suffix += 1
        used.add(candidate)
        names.append(candidate)
    return names


def run_step(
    stems: Sequence[Stem],
    out_dir: Path,
    params: Params,
    transcribe: Transcriber,
    clock: Clock = time.monotonic,
) -> StepResult:
    """Transcribe every stem and write ``report.csv``.

    Args:
        stems: The stems to process, in order.
        out_dir: Output folder; created if missing.
        params: Transcription settings.
        transcribe: The transcriber to use.
        clock: Monotonic clock in seconds, used to time the run.

    Returns:
        The collected outcomes and the elapsed time.
    """
    started = clock()
    out_dir.mkdir(parents=True, exist_ok=True)
    filenames = _unique_midi_filenames(stems)
    outcomes = [
        transcribe_stem(stem, out_dir, filename, params, transcribe)
        for stem, filename in zip(stems, filenames, strict=True)
    ]
    (out_dir / REPORT_FILE).write_text(render_report_csv(list(outcomes)), encoding="utf-8")
    return StepResult(outcomes=outcomes, took=round(clock() - started, 1))
