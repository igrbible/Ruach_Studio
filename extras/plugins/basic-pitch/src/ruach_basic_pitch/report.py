"""Per-stem outcomes, the ``report.csv`` text, and the one-line summary."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import Final, Literal

from .contract import SUMMARY_MAX_CHARS

Status = Literal["ok", "silent", "error"]
"""How one stem ended: transcribed, no notes found, or failed."""

REPORT_COLUMNS: Final[tuple[str, ...]] = ("stem", "status", "notes", "detail")
"""Header row of ``report.csv``."""


@dataclass(frozen=True, slots=True)
class StemOutcome:
    """What happened to one stem.

    Attributes:
        name: The stem's machine name.
        title: The stem's display label.
        status: ``"ok"`` (MIDI written), ``"silent"`` (no notes, no file) or
            ``"error"`` (transcription raised).
        notes: Notes detected; zero unless ``status == "ok"``.
        midi_file: Name of the MIDI file written, or ``None``.
        detail: Error description when ``status == "error"``, else empty.
    """

    name: str
    title: str
    status: Status
    notes: int = 0
    midi_file: str | None = None
    detail: str = ""


def render_report_csv(outcomes: list[StemOutcome]) -> str:
    """Render ``outcomes`` as the text of ``report.csv``.

    Newlines inside ``detail`` are collapsed to single spaces so every stem is
    exactly one row.

    Args:
        outcomes: One outcome per stem, in manifest order.

    Returns:
        CSV text with a header row and Unix (LF) line endings.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(REPORT_COLUMNS)
    for outcome in outcomes:
        writer.writerow(
            [outcome.name, outcome.status, outcome.notes, " ".join(outcome.detail.split())]
        )
    return buffer.getvalue()


def summarize(outcomes: list[StemOutcome]) -> str:
    """Return the one-line summary the lab shows beside the branch.

    Example: ``"2 of 3 stems transcribed, 412 notes, 1 failed"``.

    The result is cut to ``SUMMARY_MAX_CHARS`` characters, the lab's limit.
    """
    done = [o for o in outcomes if o.status == "ok"]
    failed = [o for o in outcomes if o.status == "error"]
    text = f"{len(done)} of {len(outcomes)} stems transcribed, {sum(o.notes for o in done)} notes"
    if failed:
        text += f", {len(failed)} failed"
    return text[:SUMMARY_MAX_CHARS]
