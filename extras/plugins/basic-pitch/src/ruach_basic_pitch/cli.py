"""Command-line contract with the Ruach lab: ``AUDIO OUTDIR PARAMS.json``.

On success the result is printed as one JSON line, the last line of standard
output. On failure the reason goes to standard error (the lab shows its last
line) and a non-zero :class:`~ruach_basic_pitch.contract.ExitCode` is returned.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence
from pathlib import Path

from .contract import ExitCode
from .manifest import ManifestError, load_stems
from .params import load_params
from .runner import run_step
from .transcriber import Transcriber, basic_pitch_transcriber

USAGE = "usage: transcribe.py AUDIO OUTDIR PARAMS.json"


def main(
    argv: Sequence[str],
    transcribe: Transcriber = basic_pitch_transcriber,
) -> ExitCode:
    """Run the step as the lab does.

    Args:
        argv: ``[AUDIO, OUTDIR, PARAMS.json]`` (without the program name).
        transcribe: The transcriber to use; tests inject a fake.

    Returns:
        :attr:`ExitCode.OK` on success; :attr:`ExitCode.FAILED` if the inputs
        are unusable or every stem failed; :attr:`ExitCode.USAGE` if ``argv`` is
        the wrong length.
    """
    if len(argv) != 3:
        print(USAGE, file=sys.stderr)
        return ExitCode.USAGE
    audio_dir, out_dir, params_path = Path(argv[0]), Path(argv[1]), Path(argv[2])

    try:
        stems = load_stems(audio_dir)
        params = load_params(params_path)
    except (ManifestError, OSError, ValueError) as exc:
        # json.JSONDecodeError is a ValueError subclass.
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return ExitCode.FAILED

    result = run_step(stems, out_dir, params, transcribe)
    if not result.succeeded:
        first = next(o for o in result.outcomes if o.status == "error")
        print(f"every stem failed; first: {first.name}: {first.detail}", file=sys.stderr)
        return ExitCode.FAILED

    print(json.dumps(result.to_payload()))
    return ExitCode.OK
