"""The step's fields, as the lab writes them to ``PARAMS.json``.

The lab already cleans each value to the field's kind and bounds before running
a step, but this module clamps again so the step is safe to run by hand. The
bounds here are the single source of truth: ``plugin.json`` repeats them for the
lab's UI, and a test (``tests/test_plugin_manifest.py``) fails if they drift.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final


@dataclass(frozen=True, slots=True)
class Bounds:
    """An inclusive numeric range for one field.

    Attributes:
        low: Smallest accepted value.
        high: Largest accepted value.
    """

    low: float
    high: float

    def clamp(self, value: float) -> float:
        """Return ``value`` limited to ``[low, high]``."""
        return max(self.low, min(self.high, value))


ONSET_BOUNDS: Final = Bounds(0.1, 0.9)
FRAME_BOUNDS: Final = Bounds(0.1, 0.9)
MIN_NOTE_MS_BOUNDS: Final = Bounds(20.0, 500.0)


@dataclass(frozen=True, slots=True)
class Params:
    """Settings for one run of the step.

    Defaults mirror Basic Pitch's own defaults.

    Attributes:
        onset: Onset threshold. Higher gives fewer, surer notes.
        frame: Frame threshold. Higher gives shorter, tidier notes.
        min_note_ms: Shortest note kept, in milliseconds.
        bends: Whether to keep pitch-bend messages in the MIDI.
    """

    onset: float = 0.5
    frame: float = 0.3
    min_note_ms: float = 127.0
    bends: bool = True


def _as_float(value: object) -> float | None:
    """Coerce a JSON value to ``float``, or ``None`` if it is not numeric.

    Booleans are rejected on purpose: ``True`` is an ``int`` in Python, but a
    check box sent where a number is expected is a mistake, not the number 1.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _number(raw: Mapping[str, object], key: str, bounds: Bounds, default: float) -> float:
    """Read ``raw[key]`` as a number within ``bounds``, else ``default``."""
    number = _as_float(raw.get(key))
    return default if number is None else bounds.clamp(number)


def parse_params(raw: Mapping[str, object]) -> Params:
    """Build :class:`Params` from the lab's decoded ``PARAMS.json``.

    Missing, non-numeric or out-of-range values fall back to the defaults or are
    clamped; nothing here raises.

    Args:
        raw: The decoded JSON object.

    Returns:
        A fully populated, in-range :class:`Params`.
    """
    d = Params()
    bends = raw.get("bends")
    return Params(
        onset=_number(raw, "onset", ONSET_BOUNDS, d.onset),
        frame=_number(raw, "frame", FRAME_BOUNDS, d.frame),
        min_note_ms=_number(raw, "min_note_ms", MIN_NOTE_MS_BOUNDS, d.min_note_ms),
        bends=bends if isinstance(bends, bool) else d.bends,
    )


def load_params(path: Path) -> Params:
    """Read and parse the ``PARAMS.json`` the lab wrote.

    Args:
        path: Path to ``PARAMS.json``.

    Raises:
        OSError: If the file cannot be read.
        json.JSONDecodeError: If the file is not valid JSON.
        ValueError: If the JSON is valid but is not an object.
    """
    decoded: object = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("PARAMS.json must contain a JSON object")
    return parse_params(decoded)
