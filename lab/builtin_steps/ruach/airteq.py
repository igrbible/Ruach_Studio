"""HERESY 2036: the Airteq step: pianoteq.py's way with Airteq (Modartt's air-driven instruments), the copy installed here (bought, or its trial).
    python airteq.py SET_DIR OUTDIR PARAMS.json"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pianoteq  # noqa: E402

if __name__ == "__main__":
    pianoteq.PRODUCT = "airteq"
    pianoteq.main(*sys.argv[1:4])
