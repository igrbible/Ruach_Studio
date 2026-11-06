"""HERESY 2036: the Organteq step: pianoteq.py's way with Organteq (a pipe organ), the copy installed here (bought, or its trial).
    python organteq.py SET_DIR OUTDIR PARAMS.json"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pianoteq  # noqa: E402

if __name__ == "__main__":
    pianoteq.PRODUCT = "organteq"
    pianoteq.main(*sys.argv[1:4])
