"""Drift guards: ``plugin.json`` (read by the lab) must agree with the code.

``plugin.json`` repeats field keys, defaults and bounds for the lab's UI. These
tests fail the build if it falls out of step with :mod:`ruach_basic_pitch.params`.
"""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path
from typing import Any

import pytest

from ruach_basic_pitch.params import FRAME_BOUNDS, MIN_NOTE_MS_BOUNDS, ONSET_BOUNDS, Bounds, Params

ROOT = Path(__file__).resolve().parent.parent
ID_PATTERN = re.compile(r"^[a-z0-9_-]+$")  # Ruach: lowercase letters, digits, - and _

BOUNDS_BY_KEY: dict[str, Bounds] = {
    "onset": ONSET_BOUNDS,
    "frame": FRAME_BOUNDS,
    "min_note_ms": MIN_NOTE_MS_BOUNDS,
}


@pytest.fixture(scope="module")
def plugin() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))
    return loaded


@pytest.fixture(scope="module")
def step(plugin: dict[str, Any]) -> dict[str, Any]:
    (only_step,) = plugin["steps"]
    assert isinstance(only_step, dict)
    return only_step


def test_ids_follow_the_labs_naming_rule(plugin: dict[str, Any], step: dict[str, Any]) -> None:
    assert ID_PATTERN.match(plugin["id"])
    assert ID_PATTERN.match(step["id"])
    assert all(ID_PATTERN.match(p["key"]) for p in step["params"])


def test_the_steps_script_exists_inside_the_plugin_folder(step: dict[str, Any]) -> None:
    assert (ROOT / step["script"]).is_file()


def test_the_step_takes_a_stem_set(step: dict[str, Any]) -> None:
    assert step["input"] == "stems"


def test_every_field_key_is_a_params_field(step: dict[str, Any]) -> None:
    fields = {f.name for f in dataclasses.fields(Params)}
    assert {p["key"] for p in step["params"]} == fields


def test_field_defaults_match_params_defaults(step: dict[str, Any]) -> None:
    defaults = dataclasses.asdict(Params())
    for field in step["params"]:
        assert field["default"] == defaults[field["key"]], field["key"]


def test_number_field_bounds_match_the_code(step: dict[str, Any]) -> None:
    for field in step["params"]:
        if field["type"] != "number":
            continue
        bounds = BOUNDS_BY_KEY[field["key"]]
        assert (field["min"], field["max"]) == (bounds.low, bounds.high), field["key"]


def test_py_typed_marker_ships_with_the_package() -> None:
    assert (ROOT / "src" / "ruach_basic_pitch" / "py.typed").is_file()
