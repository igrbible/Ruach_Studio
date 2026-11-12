"""HERESY 1792, 2112: a run's base by name (training.base_checkpoint), RS-TW 2.0x0.75 among them. python3 lab/test_train_base.py"""
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
check("no base: the Studio's own bf16, as before", c.name == "yue2_3b_bf16.safetensors" and q == "bf16" and b == "", (c, q, b))
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
# HERESY 2112: the Studio's default, RS-TW 2.0x0.75, by its merge's name or its file's, from its merge's folder where the fold left it (2330: models/engine/finetunes/<merge>/)
(d / "finetunes" / "RS-TW-2.0x0.75").mkdir(parents=True)
(d / "finetunes" / "RS-TW-2.0x0.75" / "yue2_3b_RS-TW-2.0x0.75_bf16.safetensors").write_bytes(b"x")
P2 = {"models": d, "merges": d / "finetunes"}
c, q, b = training.base_checkpoint(P2, {"base": "RS-TW-2.0x0.75", "quant": "int8"})
check("RS-TW-2.0x0.75 by its name: its trainer file in its merge's folder, bf16, the file's name said", c == d / "finetunes" / "RS-TW-2.0x0.75" / "yue2_3b_RS-TW-2.0x0.75_bf16.safetensors"
      and q == "bf16" and b == "yue2_3b_RS-TW-2.0x0.75_bf16.safetensors", (c, q, b))
c, q, b = training.base_checkpoint(P2, {"base": "yue2_3b_RS-TW-2.0x0.75_bf16.safetensors"})
check("  by its file's name too, the same file", c.parent.name == "RS-TW-2.0x0.75" and b == c.name, (c, q, b))
(d / "checkpoints" / "yue2_3b_RS-TW-2.0x0.75_bf16.safetensors").write_bytes(b"x")
c, q, b = training.base_checkpoint(P2, {"base": "RS-TW-2.0x0.75"})
check("  one put into the trainer's own checkpoints (the comfy folder's) goes first, as every base there", c == d / "checkpoints" / "yue2_3b_RS-TW-2.0x0.75_bf16.safetensors", (c, q, b))
try:
    training.base_checkpoint(P2, {"base": "RS-TW-2.0x0.9"}); check("refused: RS-TW 2.0x0.9 not folded here, said where it was looked for", False, "taken")
except FileNotFoundError as e:
    check("refused: RS-TW 2.0x0.9 not folded here, said where it was looked for", training.studio_paths.ENGINE_FINETUNES + "/RS-TW-2.0x0.9/" in str(e), e)
check("the kit's paths name the merges' folder", training.paths(Path("/k"))["merges"] == training.studio_paths.at(training.studio_paths.ENGINE_FINETUNES, "/k"), training.paths(Path("/k")))
print("test_train_base: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
