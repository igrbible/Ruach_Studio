"""HERESY 2695: Higgs v3's bridge (the piece before joined to the reference) and its default, without the model.
.venv-read/bin/python lab/test_reader_higgs_bridge_2695.py"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
spec = importlib.util.spec_from_file_location("higgs_engine", LAB / "reader_engines" / "higgs" / "engine.py")
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)
fails = 0


def check(name, ok, detail=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


ref = {"codes": torch.arange(80, dtype=torch.int64).reshape(10, 8), "text": "Первый кусок."}
with tempfile.TemporaryDirectory() as d:
    f = Path(d) / "piece-001.codes.npz"
    np.savez_compressed(str(f), codes=np.arange(40, dtype=np.int16).reshape(8, 5))
    b = E.bridged(ref, [{"text": "<|emotion:awe|> Второй кусок.", "codes": str(f)}])
    check("the reference's 10 frames and the piece before's 5, frames × codebooks", tuple(b["codes"].shape) == (15, 8), b["codes"].shape)
    check("the piece before's codes follow, transposed from codebooks × frames", torch.equal(b["codes"][10:], torch.from_numpy(np.arange(40).reshape(8, 5).T.copy())))
    check("the words follow the reference's, its tag left out", b["text"] == "Первый кусок. Второй кусок.", b["text"])
    check("no piece before: the reference as it was", E.bridged(ref, None) is ref)
    bad = Path(d) / "piece-002.codes.npz"
    np.savez_compressed(str(bad), codes=np.zeros((10, 5), dtype=np.int16))
    try:
        E.bridged(ref, [{"text": "x", "codes": str(bad)}])
        check("ten codebooks fail the piece aloud", False, "no error")
    except RuntimeError as e:
        check("ten codebooks fail the piece aloud", "8 codebooks" in str(e), e)

sys.modules.setdefault("reader_engines", type(sys)("reader_engines"))
src = (LAB / "reader.py").read_text(encoding="utf-8")
i = src.index("def bridge_default(")
ns = {}
exec(src[i:src.index("\n\n\ndef ", i)], ns)
bd = ns["bridge_default"]
hg = json.loads((LAB / "reader_engines" / "higgs" / "engine.json").read_text(encoding="utf-8"))
dr = json.loads((LAB / "reader_engines" / "drama3" / "engine.json").read_text(encoding="utf-8"))
check("Higgs's narration reads with the bridge by default", bd({}, hg, "narration") is True)
check("Higgs's dialog does not", bd({}, hg, "dialog") is False)
check("a run that says no has none", bd({"bridge": False}, hg, "narration") is False)
check("Drama 3 keeps it off unless asked", bd({}, dr, "narration") is False and bd({"bridge": True}, dr, "narration") is True)
print("all ok" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
