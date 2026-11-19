"""HERESY 2700: the silence guard: more than 4 s of silence between a piece's first and last sound is a stall; less, or a file that cannot be read,
is none. .venv/bin/python lab/test_reader_stall_2700.py"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import reader_tail as rt  # noqa: E402

fails = 0


def check(name, ok, detail=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


sr = 44100
rng = np.random.default_rng(7)
speech = lambda s: (0.2 * rng.standard_normal(int(s * sr)) * np.sin(np.linspace(0, 40 * np.pi * s, int(s * sr))) ** 2).astype(np.float32)  # noqa: E731
quiet = lambda s: np.zeros(int(s * sr), dtype=np.float32)  # noqa: E731
with tempfile.TemporaryDirectory() as d:
    a, b, c = Path(d) / "a.wav", Path(d) / "b.wav", Path(d) / "c.wav"
    sf.write(a, np.concatenate([quiet(0.5), speech(3), quiet(5.0), speech(2), quiet(3.0)]), sr)
    sf.write(b, np.concatenate([quiet(0.5), speech(3), quiet(2.0), speech(2), quiet(6.0)]), sr)
    s = rt.stalled(a)
    check("5 s of silence between the words: a stall of about 5 s", 4.8 <= s <= 5.3, s)
    check("2 s inside and 6 s after the last word: none (the end is the tail guard's)", rt.stalled(b) == 0.0, rt.stalled(b))
    check("a file that is not there: none, the reading goes on", rt.stalled(c) == 0.0)
src = (LAB / "reader.py").read_text(encoding="utf-8")
check("the read loop asks it of every piece and reads a stalled one again with another seed", "hole = _stalled(d / f\"piece-{p['i']:03d}.wav\")" in src and "or hole):" in src)
print("all ok" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
