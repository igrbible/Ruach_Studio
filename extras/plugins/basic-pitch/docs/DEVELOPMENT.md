# Development guide

## Setup

```bash
git clone https://github.com/null-angel/ruach-basic-pitch-plugin
cd ruach-basic-pitch-plugin
python -m venv .venv
.venv/bin/pip install -e ".[dev]"      # pulls basic-pitch (and TensorFlow) too
```

If you only want to work on the plugin's own code, you can skip the heavy
dependency, exactly as CI does. Every test uses a fake transcriber:

```bash
.venv/bin/pip install --no-deps -e .
.venv/bin/pip install pytest pytest-bdd mypy ruff
```

Python 3.10 or newer.

## Everyday commands

| Task | Command |
| --- | --- |
| Run the tests | `pytest` |
| Lint | `ruff check .` |
| Format (check / apply) | `ruff format --check .` / `ruff format .` |
| Type-check | `mypy` |
| All of the above | `ruff check . && ruff format --check . && mypy && pytest` |

CI (`.github/workflows/ci.yml`) runs those four on Python 3.10, 3.11, 3.12 and
3.13.

## Typing policy

The whole repository, tests included, passes `mypy --strict`.

* Every function has full annotations (enforced by ruff's `ANN` rules).
* No `Any` in `src/`. Data from outside (`manifest.json`, `PARAMS.json`) enters as
  `object` and is narrowed with `isinstance` before use.
* Data is carried in `@dataclass(frozen=True, slots=True)` values; the wire format
  uses `TypedDict`s (`StepPayload`, `FileEntry`) declared once in `contract.py`.
* Closed sets are `Literal` (`Status`) or `IntEnum` (`ExitCode`), not bare strings
  or ints.
* Behaviour boundaries are `Protocol`s (`Transcriber`, `MidiLike`).
* The package ships `py.typed`, so downstream users get the types.
* The one untyped dependency is Basic Pitch; it is confined to
  `transcriber.py` and silenced there via a `mypy` override in `pyproject.toml`.

> mypy is not pinned to `python_version = "3.10"` because pytest's `TYPE_CHECKING`
> imports can pull in numpy stubs that use Python 3.12 syntax when numpy is
> installed. CI runs the type-check on every supported interpreter instead.

## Documentation policy

* Every module, class and public function has a Google-style docstring; ruff's
  `D` rules enforce it (tests are exempt; their names and the Gherkin are the docs).
* Docstrings state **why** and the failure modes (`Raises:`), not just what.
* Behaviour is specified in `tests/features/transcribe.feature` in plain English.
* Anything that depends on Ruach Studio's undocumented behaviour is labelled
  **(assumed)** in [PLUGIN_CONTRACT.md](PLUGIN_CONTRACT.md) and isolated in one
  module.

## Tests

Two layers:

* **BDD** (`tests/features/*.feature` + `tests/test_transcribe_steps.py`,
  [pytest-bdd](https://pytest-bdd.readthedocs.io/)). Scenarios drive the real CLI
  with a fake transcriber and assert on files, report rows, stdout and exit codes.
* **Unit** (`tests/test_units.py`). Pure helpers: params clamping, report text,
  manifest validation, CLI edge cases.
* **Drift guards** (`tests/test_plugin_manifest.py`). `plugin.json` must agree
  with the code.

The workflow for a change: add or edit a **scenario**, add the missing **step**,
make it pass with the **smallest code change**, then refactor.

## Adding a field

Say you want a `melodia_trick` toggle.

1. Add the attribute to `Params` in `params.py` (with a default and a docstring
   line), and parse it in `parse_params`. If numeric, add a `Bounds` constant.
2. Add the field to `plugin.json` under `steps[0].params` with the **same key,
   default and bounds**.
3. If it is numeric, add its key to `BOUNDS_BY_KEY` in
   `tests/test_plugin_manifest.py`. The drift tests will tell you if anything
   disagrees.
4. Pass it through in `transcriber.basic_pitch_transcriber`.
5. Add a row to the field tables in `README.md` and `docs/PLUGIN_CONTRACT.md`.
6. Add a line to `CHANGELOG.md`.

## Trying it against real audio

The unit tests never load Basic Pitch. To exercise the real path, build a tiny
stem folder by hand:

```bash
mkdir -p /tmp/stems && cp some-bass-stem.wav /tmp/stems/bass.wav
cat > /tmp/stems/manifest.json <<'JSON'
{"stems": [{"name": "bass", "title": "Bass", "file": "bass.wav"}]}
JSON
echo '{}' > /tmp/params.json

.venv/bin/python transcribe.py /tmp/stems /tmp/out /tmp/params.json
ls /tmp/out            # bass.mid  report.csv
```

The last line of output is the JSON the lab reads. The first run is slow because
it loads the model.

## Releasing

1. Update `version` in `pyproject.toml` and `__version__` in
   `src/ruach_basic_pitch/__init__.py`.
2. Move the `[Unreleased]` notes in `CHANGELOG.md` under the new version.
3. Make sure `ruff`, `mypy` and `pytest` are green.
4. Tag it: `git tag vX.Y.Z && git push --tags`.
