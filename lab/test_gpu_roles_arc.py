"""HERESY 2029: an Intel card (index 100 and up) may hold the Studio: kept when read, taken when saved with the card there, refused without it."""
import json
import tempfile
from pathlib import Path

import gpu_roles as g

ok = True


def check(what, cond, got=""):
    global ok
    print(("  ok    " if cond else "  FAIL  ") + what, "" if cond else got)
    ok = ok and cond


cards = [{"index": 0, "total_mb": 24576}, {"index": 1, "total_mb": 24576}]
with tempfile.TemporaryDirectory() as kit:
    (Path(kit) / "user").mkdir()
    saved = g.save(kit, {"studio": 100, "train": [0, 1], "jobs": [0, 1], "limits": {"100": 12288}}, cards, [100])
    check("an Arc saved as the Studio's card, its limit kept", saved["studio"] == 100 and saved["limits"] == {"100": 12288}, saved)
    r = g.load(kit, cards)
    check("read back, the Arc still the Studio's, its limit kept", r["studio"] == 100 and r["limits"].get("100") == 12288, r)
    try:
        g.save(kit, {"studio": 101, "train": [0], "jobs": [0]}, cards, [100])
        check("an Arc that is not there refused", False)
    except ValueError:
        check("an Arc that is not there refused", True)
    try:
        g.save(kit, {"studio": 100, "train": [100], "jobs": [0]}, cards, [100])
        check("training on an Arc refused (PyTorch on CUDA)", False)
    except ValueError:
        check("training on an Arc refused (PyTorch on CUDA)", True)
    g.save(kit, {"studio": 1, "train": [0], "jobs": [0, 1]}, cards, [100])
    check("back to a CUDA card", g.load(kit, cards)["studio"] == 1)
print("test_gpu_roles_arc  " + ("ALL OK" if ok else "FAILED"))
raise SystemExit(0 if ok else 1)
