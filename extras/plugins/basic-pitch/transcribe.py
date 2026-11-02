"""Entry point the Ruach Studio lab runs: ``PYTHON transcribe.py AUDIO OUTDIR PARAMS.json``.

Deliberately thin. All behaviour lives in the ``ruach_basic_pitch`` package
under ``src/`` so it can be type-checked and tested without the studio.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from ruach_basic_pitch.cli import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
