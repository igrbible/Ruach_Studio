"""The seam between the plugin and Basic Pitch.

:class:`Transcriber` is a :class:`typing.Protocol`, so the runner depends on an
abstraction rather than on Basic Pitch (the dependency-inversion principle).
Tests pass a fake; production uses :func:`basic_pitch_transcriber`, which
imports Basic Pitch lazily so importing this package stays cheap and works
without TensorFlow installed.
"""

from __future__ import annotations

import functools
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .params import Params


class MidiLike(Protocol):
    """Anything that can write itself as a MIDI file.

    ``pretty_midi.PrettyMIDI`` (what Basic Pitch returns) satisfies this.
    """

    def write(self, filename: str) -> None:
        """Write the MIDI data to ``filename``."""
        ...


@dataclass(frozen=True, slots=True)
class Transcription:
    """The result of transcribing one stem.

    Attributes:
        midi: The transcribed notes, ready to be written to disk.
        note_count: Number of notes detected. Zero means the stem was silent
            (or nothing cleared the thresholds).
    """

    midi: MidiLike
    note_count: int


class Transcriber(Protocol):
    """Turns one audio file into MIDI."""

    def __call__(self, audio_path: Path, params: Params) -> Transcription:
        """Transcribe ``audio_path`` using ``params``.

        Implementations may raise any exception; the runner records it as a
        failed stem rather than aborting the step.
        """
        ...


@functools.cache
def _load_model() -> object:
    """Load Basic Pitch's bundled model once per process.

    ``predict()`` given only a path reloads the model on *every* call, which
    would cost one full load per stem. Basic Pitch documents passing a loaded
    ``Model`` instead; caching it here means a take with N stems loads it once.
    """
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import Model

    return Model(ICASSP_2022_MODEL_PATH)


def basic_pitch_transcriber(audio_path: Path, params: Params) -> Transcription:
    """Transcribe ``audio_path`` with Spotify's Basic Pitch.

    The model is loaded on first use (slow) and reused for every later stem in
    the same process. ``basic_pitch`` is imported lazily, never at module level.

    Args:
        audio_path: Audio file to transcribe.
        params: Thresholds and options forwarded to ``basic_pitch.inference.predict``.

    Returns:
        The MIDI data and the number of detected notes.
    """
    from basic_pitch.inference import predict

    note_events: Sequence[object]
    _, midi, note_events = predict(
        str(audio_path),
        _load_model(),
        onset_threshold=params.onset,
        frame_threshold=params.frame,
        minimum_note_length=params.min_note_ms,
        multiple_pitch_bends=params.bends,
    )
    return Transcription(midi=midi, note_count=len(note_events))
