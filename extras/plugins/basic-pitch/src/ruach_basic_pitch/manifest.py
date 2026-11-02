"""Reading the stem set the Ruach lab hands a ``"input": "stems"`` step.

The lab passes a folder containing ``manifest.json``. Per Ruach Studio's
``docs/PLUGINS.md`` the manifest lists the stems, "each with ``name``, ``title``
and ``file``". The documentation does not spell out the top-level shape; a real
take writes ``{"files": [...]}`` (verified against the lab's ``stems-four``
branch), so :func:`load_stems` accepts ``{"files": [...]}``, ``{"stems": [...]}``
and a bare list. If a real take disagrees again, this is the only module that
needs to change.

The manifest is untrusted input: every value is narrowed from ``object`` before
use, and stem files are confined to the stem folder.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


class ManifestError(Exception):
    """The stem set is missing, unreadable, empty, or points outside its folder."""


@dataclass(frozen=True, slots=True)
class Stem:
    """One separated stem of a take.

    Attributes:
        name: Machine name from the manifest (for example ``"lead_vocal"``).
            Used to name the output file.
        title: Human-readable label; falls back to ``name`` when absent.
        path: Absolute, resolved path of the stem's audio file, guaranteed to
            lie inside the stem folder.
    """

    name: str
    title: str
    path: Path


def load_stems(audio_dir: Path) -> list[Stem]:
    """Load the stems listed in ``audio_dir/manifest.json``.

    Args:
        audio_dir: The stem set's folder, as passed by the lab (``AUDIO``).

    Returns:
        The stems in manifest order. Never empty.

    Raises:
        ManifestError: If ``manifest.json`` is missing, is not valid JSON, lists
            no stems, has an entry without ``name`` and ``file``, or has an
            entry whose ``file`` resolves outside ``audio_dir``.
    """
    manifest_path = audio_dir / "manifest.json"
    if not manifest_path.is_file():
        raise ManifestError(f"no manifest.json in {audio_dir}")
    try:
        raw: object = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ManifestError(f"manifest.json is not valid JSON: {exc}") from exc

    entries: object = (raw.get("stems") or raw.get("files")) if isinstance(raw, dict) else raw
    if not isinstance(entries, list) or not entries:
        raise ManifestError("manifest.json lists no stems")

    root = audio_dir.resolve()
    return [_to_stem(entry, root) for entry in entries]


def _to_stem(entry: object, root: Path) -> Stem:
    """Validate one manifest entry and turn it into a :class:`Stem`.

    Args:
        entry: A decoded JSON value, expected to be an object.
        root: The resolved stem folder; the stem's file must lie inside it.

    Raises:
        ManifestError: If the entry is malformed or escapes ``root``.
    """
    if not isinstance(entry, dict) or "name" not in entry or "file" not in entry:
        raise ManifestError(f"stem entry needs a name and a file: {entry!r}")
    file_value = str(entry["file"])
    path = (root / file_value).resolve()
    if root not in path.parents:
        raise ManifestError(f"stem file leaves its folder: {file_value}")
    name = str(entry["name"])
    return Stem(name=name, title=str(entry.get("title") or name), path=path)
