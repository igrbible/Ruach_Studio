"""Unit tests for the pure helpers: params, report, manifest, runner, CLI edges."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ruach_basic_pitch.cli import main
from ruach_basic_pitch.contract import SUMMARY_MAX_CHARS, ExitCode
from ruach_basic_pitch.manifest import ManifestError, Stem, load_stems
from ruach_basic_pitch.params import Params, load_params, parse_params
from ruach_basic_pitch.report import StemOutcome, render_report_csv, summarize
from ruach_basic_pitch.runner import StepResult, run_step
from ruach_basic_pitch.transcriber import MidiLike, Transcription

from .conftest import FakeMidi, FakeTranscriber

# --- params -----------------------------------------------------------------


def test_params_default_when_empty() -> None:
    assert parse_params({}) == Params()


def test_params_are_clamped_to_the_field_bounds() -> None:
    p = parse_params({"onset": 5, "frame": -1, "min_note_ms": 9999})
    assert (p.onset, p.frame, p.min_note_ms) == (0.9, 0.1, 500.0)


def test_params_accept_numeric_strings() -> None:
    assert parse_params({"onset": "0.7"}).onset == 0.7


@pytest.mark.parametrize("bad", ["loud", None, [], {}, True])
def test_params_ignore_non_numeric_values(bad: object) -> None:
    assert parse_params({"onset": bad}).onset == Params().onset


@pytest.mark.parametrize(("given", "expected"), [(True, True), (False, False), ("no", True)])
def test_params_bends_only_accepts_real_booleans(given: object, expected: bool) -> None:
    assert parse_params({"bends": given}).bends is expected


def test_load_params_rejects_non_object_json(tmp_path: Path) -> None:
    path = tmp_path / "params.json"
    path.write_text("[1, 2]", encoding="utf-8")
    with pytest.raises(ValueError, match="JSON object"):
        load_params(path)


# --- report -----------------------------------------------------------------


def test_report_flattens_multiline_error_detail() -> None:
    outcome = StemOutcome("bass", "Bass", "error", detail="boom\nsecond line")
    assert "boom second line" in render_report_csv([outcome])


def test_report_has_a_header_row() -> None:
    assert render_report_csv([]).splitlines() == ["stem,status,notes,detail"]


def test_summary_counts_notes_and_failures() -> None:
    outcomes = [
        StemOutcome("a", "A", "ok", notes=3, midi_file="a.mid"),
        StemOutcome("b", "B", "error", detail="x"),
    ]
    assert summarize(outcomes) == "1 of 2 stems transcribed, 3 notes, 1 failed"


def test_summary_never_exceeds_the_lab_limit() -> None:
    many = [StemOutcome(f"s{i}", "S", "ok", notes=1, midi_file="s.mid") for i in range(200)]
    assert len(summarize(many)) <= SUMMARY_MAX_CHARS


# --- manifest ---------------------------------------------------------------


def _manifest(folder: Path, content: object) -> None:
    (folder / "manifest.json").write_text(json.dumps(content), encoding="utf-8")


def test_manifest_accepts_a_bare_list(tmp_path: Path) -> None:
    _manifest(tmp_path, [{"name": "bass", "file": "bass.wav"}])
    (stem,) = load_stems(tmp_path)
    assert (stem.name, stem.title, stem.path.name) == ("bass", "bass", "bass.wav")


def test_manifest_rejects_invalid_json(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text("{nope", encoding="utf-8")
    with pytest.raises(ManifestError, match="not valid JSON"):
        load_stems(tmp_path)


@pytest.mark.parametrize("content", [{"stems": []}, [], {"other": 1}, "text"])
def test_manifest_rejects_a_set_with_no_stems(tmp_path: Path, content: object) -> None:
    _manifest(tmp_path, content)
    with pytest.raises(ManifestError, match="no stems"):
        load_stems(tmp_path)


def test_manifest_rejects_an_entry_missing_its_file(tmp_path: Path) -> None:
    _manifest(tmp_path, [{"name": "bass"}])
    with pytest.raises(ManifestError, match="needs a name and a file"):
        load_stems(tmp_path)


# --- runner / cli -----------------------------------------------------------


def test_step_result_with_no_outcomes_does_not_count_as_success() -> None:
    # load_stems never returns an empty list, so this only guards the property itself.
    assert StepResult(outcomes=[], took=0.0).succeeded is False


def test_cli_rejects_the_wrong_number_of_arguments(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["only-one"], transcribe=FakeTranscriber()) is ExitCode.USAGE
    assert "usage:" in capsys.readouterr().err


def test_cli_reports_unreadable_params(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _manifest(tmp_path, [{"name": "bass", "file": "bass.wav"}])
    code = main([str(tmp_path), str(tmp_path / "out"), str(tmp_path / "missing.json")])
    assert code is ExitCode.FAILED
    assert "FileNotFoundError" in capsys.readouterr().err


def test_duplicate_stem_names_get_distinct_midi_files(tmp_path: Path) -> None:
    # Two stems whose names share a base must not overwrite each other's MIDI.
    out = tmp_path / "out"
    stems = [
        Stem("lead", "Lead", tmp_path / "a.wav"),
        Stem("lead", "Lead", tmp_path / "b.wav"),
    ]
    result = run_step(stems, out, Params(), FakeTranscriber(notes={"a": 3, "b": 4}))
    assert {o.status for o in result.outcomes} == {"ok"}
    assert (out / "lead.mid").is_file()
    assert (out / "lead-2.mid").is_file()


def test_a_failed_midi_write_is_isolated_to_its_stem(tmp_path: Path) -> None:
    # A write failure on one stem must be recorded as that stem's error, leaving
    # the others written and the step a success.
    class RaisingMidi:
        def write(self, filename: str) -> None:
            raise OSError("disk full")

    class OneWriteFails:
        def __call__(self, audio_path: Path, params: Params) -> Transcription:
            midi: MidiLike = RaisingMidi() if audio_path.stem == "bass" else FakeMidi()
            return Transcription(midi=midi, note_count=3)

    out = tmp_path / "out"
    stems = [
        Stem("vocals", "Vocals", tmp_path / "vocals.wav"),
        Stem("bass", "Bass", tmp_path / "bass.wav"),
    ]
    result = run_step(stems, out, Params(), OneWriteFails())
    by = {o.name: o for o in result.outcomes}
    assert by["vocals"].status == "ok"
    assert (out / "vocals.mid").is_file()
    assert by["bass"].status == "error"
    assert "writing MIDI failed" in by["bass"].detail
    assert not (out / "bass.mid").exists()
    assert result.succeeded is True
