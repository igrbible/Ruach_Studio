"""Allow ``python -m ruach_basic_pitch AUDIO OUTDIR PARAMS.json``."""

from __future__ import annotations

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
