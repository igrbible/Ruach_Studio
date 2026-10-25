"""HERESY 1792: a run's base by name (training.base_checkpoint). python3 lab/test_train_base.py"""
import sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import training  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:200] + ")"))
    if not ok:
        bad.append(what)


d = Path(tempfile.mkdtemp())
(d / "checkpoints").mkdir()
(d / "checkpoints" / "yue2_3b_bf16.safetensors").write_bytes(b"x")
(d / "checkpoints" / "yue2_3b_RS-FW-e004-m0.75-s0.75_bf16.safetensors").write_bytes(b"x")
P = {"models": d}
c, q, b = training.base_checkpoint(P, {})
check("no base: the studio's own bf16, as before", c.name == "yue2_3b_bf16.safetensors" and q == "bf16" and b == "", (c, q, b))
c, q, b = training.base_checkpoint(P, {"base": "yue2_3b_RS-FW-e004-m0.75-s0.75_bf16.safetensors", "quant": "int8"})
check("a base named: that file, bf16, said", c.name == "yue2_3b_RS-FW-e004-m0.75-s0.75_bf16.safetensors" and q == "bf16" and b == c.name, (c, q, b))
for name, why in (("../yue2_3b_bf16.safetensors", "a folder"), ("x/y.safetensors", "a folder"), ("model.gguf", "not a safetensors")):
    try:
        training.base_checkpoint(P, {"base": name}); check("refused: " + why + " (" + name + ")", False, "taken")
    except ValueError:
        check("refused: " + why + " (" + name + ")", True)
try:
    training.base_checkpoint(P, {"base": "nothing_here.safetensors"}); check("refused: a file that is not there", False, "taken")
except FileNotFoundError:
    check("refused: a file that is not there", True)
try:
    training.base_checkpoint({"models": d / "none"}, {}); check("no own file: said, as before", False, "taken")
except FileNotFoundError:
    check("no own file: said, as before", True)
print("test_train_base: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
