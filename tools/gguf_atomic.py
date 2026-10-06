#!/usr/bin/env python3
"""Run a GGUF converter (upstream convert.py, or convert-extras.py) with two safety changes that leave its
code and its output bytes alone:

- every output is written as <name>.partial and renamed into place only once it is complete, so an
  interrupted run never leaves a file that looks finished (the converters skip outputs that exist);
- with --low-memory (or YUE2_LOWMEM=1), gguf's own use_temp_file=True: the tensors wait in a temporary
  file in the install's tmp/ instead of in RAM, which an 8 GiB machine needs for the 7.2 GB backbone.
  It costs about the size of the largest output in free disk while it runs. Every temporary file goes
  to the install's tmp/ (found from this file's place), whatever TMPDIR says.

    python gguf_atomic.py [--low-memory] SCRIPT [ARGS...]
"""
import os
import runpy
import sys
import tempfile

# temporary files (gguf's spooled tensors, anything the converter makes) stay in the install's tmp/:
# never the system temporary folder, even when TMPDIR is unset
TMP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tmp")
os.makedirs(TMP, exist_ok=True)
os.environ["TMPDIR"] = TMP
tempfile.tempdir = TMP

import gguf  # noqa: E402
import gguf.gguf_writer  # noqa: E402

args = sys.argv[1:]
LOW = os.environ.get("YUE2_LOWMEM") == "1"
if args and args[0] == "--low-memory":
    LOW, args = True, args[1:]
if not args:
    sys.exit(__doc__)

Base = gguf.GGUFWriter


class AtomicWriter(Base):
    def __init__(self, path, *a, **k):
        self._final = os.fspath(path) if path else None
        if LOW:
            if len(a) >= 2:                       # (arch, use_temp_file, ...) given by position
                a = (a[0], True) + tuple(a[2:])
            else:
                k["use_temp_file"] = True
        super().__init__(self._final + ".partial" if self._final else path, *a, **k)

    def close(self):
        super().close()
        if self._final and os.path.exists(self._final + ".partial"):
            os.replace(self._final + ".partial", self._final)   # atomic on one filesystem


gguf.GGUFWriter = AtomicWriter
gguf.gguf_writer.GGUFWriter = AtomicWriter
script = os.path.abspath(args[0])
sys.argv = [script] + args[1:]
sys.path.insert(0, os.path.dirname(script))
runpy.run_path(script, run_name="__main__")
