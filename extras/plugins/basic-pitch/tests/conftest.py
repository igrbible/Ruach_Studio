"""Shared, fully typed fixtures: a fake transcriber so tests never load Basic Pitch."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ruach_basic_pitch.contract import ExitCode
from ruach_basic_pitch.params import Params
from ruach_basic_pitch.transcriber import Transcription


class FakeMidi:
    """Writes a MIDI header chunk, enough to prove a file was produced."""

    def write(self, filename: str) -> None:
        Path(filename).write_bytes(b"MThd")


@dataclass
class FakeTranscriber:
    """A scriptable :class:`~ruach_basic_pitch.transcriber.Transcriber`.

    Behaviour is looked up by the audio file's stem (``<name>.wav`` -> ``name``).

    Attributes:
        notes: Notes to report per stem name; absent means zero (silent).
        failing: Stem names that should raise.
    """

    notes: dict[str, int] = field(default_factory=dict)
    failing: set[str] = field(default_factory=set)

    def __call__(self, audio_path: Path, params: Params) -> Transcription:
        name = audio_path.stem
        if name in self.failing:
            raise RuntimeError(f"cannot hear {name}")
        return Transcription(midi=FakeMidi(), note_count=self.notes.get(name, 0))


@dataclass
class RunResult:
    """What one run of the CLI produced, captured for assertions."""

    code: ExitCode | None = None
    stdout: str = ""
    stderr: str = ""


@pytest.fixture
def transcriber() -> FakeTranscriber:
    return FakeTranscriber()


@pytest.fixture
def audio_dir(tmp_path: Path) -> Path:
    folder = tmp_path / "stems"
    folder.mkdir()
    return folder


@pytest.fixture
def out_dir(tmp_path: Path) -> Path:
    return tmp_path / "out"


@pytest.fixture
def params_file(tmp_path: Path) -> Path:
    path = tmp_path / "params.json"
    path.write_text('{"onset": 0.5, "bends": true}', encoding="utf-8")
    return path


@pytest.fixture
def run_result() -> RunResult:
    return RunResult()
