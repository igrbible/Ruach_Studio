"""Step definitions for ``features/transcribe.feature`` (pytest-bdd)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from ruach_basic_pitch.cli import main
from ruach_basic_pitch.contract import ExitCode

from .conftest import FakeTranscriber, RunResult

scenarios("features/transcribe.feature")


def _write_manifest(audio_dir: Path, entries: list[dict[str, str]]) -> None:
    (audio_dir / "manifest.json").write_text(json.dumps({"stems": entries}), encoding="utf-8")


@given(parsers.parse('a stem set containing "{first}" and "{second}"'))
def stem_set(audio_dir: Path, first: str, second: str) -> None:
    entries: list[dict[str, str]] = []
    for name in (first, second):
        (audio_dir / f"{name}.wav").write_bytes(b"RIFF")
        entries.append({"name": name, "title": name.title(), "file": f"{name}.wav"})
    _write_manifest(audio_dir, entries)


@given("an audio folder without a manifest")
def no_manifest(audio_dir: Path) -> None:
    assert not (audio_dir / "manifest.json").exists()


@given("a stem set whose manifest points outside its folder")
def escaping_manifest(audio_dir: Path) -> None:
    _write_manifest(audio_dir, [{"name": "evil", "file": "../evil.wav"}])


@given(parsers.parse('the transcriber finds {count:d} notes in "{name}"'))
def finds_notes(transcriber: FakeTranscriber, count: int, name: str) -> None:
    transcriber.notes[name] = count


@given(parsers.parse('the transcriber fails on "{name}"'))
def fails_on(transcriber: FakeTranscriber, name: str) -> None:
    transcriber.failing.add(name)


@when("the step runs")
def run_step(
    audio_dir: Path,
    out_dir: Path,
    params_file: Path,
    transcriber: FakeTranscriber,
    run_result: RunResult,
    capsys: pytest.CaptureFixture[str],
) -> None:
    run_result.code = main([str(audio_dir), str(out_dir), str(params_file)], transcribe=transcriber)
    captured = capsys.readouterr()
    run_result.stdout, run_result.stderr = captured.out, captured.err


@then(parsers.parse('the file "{filename}" is written'))
def file_written(out_dir: Path, filename: str) -> None:
    assert (out_dir / filename).is_file()


@then(parsers.parse('no file "{filename}" is written'))
def file_not_written(out_dir: Path, filename: str) -> None:
    assert not (out_dir / filename).exists()


@then(parsers.parse('the report row for "{name}" says "{status}" with {count:d} notes'))
def report_row(out_dir: Path, name: str, status: str, count: int) -> None:
    with (out_dir / "report.csv").open(newline="", encoding="utf-8") as handle:
        rows = {row["stem"]: row for row in csv.DictReader(handle)}
    assert rows[name]["status"] == status
    assert int(rows[name]["notes"]) == count


@then(parsers.parse('the last line of output lists "{first}" and "{second}"'))
def last_line_lists(run_result: RunResult, first: str, second: str) -> None:
    payload = json.loads(run_result.stdout.strip().splitlines()[-1])
    listed = {entry["file"] for entry in payload["files"]}
    assert {first, second} <= listed


@then(parsers.parse("the step exits with code {code:d}"))
def exit_code(run_result: RunResult, code: int) -> None:
    assert run_result.code == ExitCode(code)


@then(parsers.parse('the error output mentions "{text}"'))
def error_mentions(run_result: RunResult, text: str) -> None:
    assert text in run_result.stderr
