"""HERESY 1496: training.delete_loras takes adapter files out of loras/ for good, a dry run first, a folder with no adapter left going
with them, nothing outside loras/.   python3 lab/test_lora_delete.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import training  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


with tempfile.TemporaryDirectory() as d:
    kit = Path(d)
    L = kit / "loras"
    (L / "pair/adapter-ar-195").mkdir(parents=True)
    (L / "pair/adapter-nar-194").mkdir(parents=True)
    (L / "pair/adapter-ar-195/lora.safetensors").write_bytes(b"a" * 100)
    (L / "pair/adapter-nar-194/lora.safetensors").write_bytes(b"b" * 50)
    (L / "pair/README.md").write_text("card")
    (L / "two").mkdir()
    (L / "two/x-e001.safetensors").write_bytes(b"x" * 10)
    (L / "two/x-e002.safetensors").write_bytes(b"y" * 20)
    (L / "sources.json").write_text("{}")
    (kit / "outside.safetensors").write_bytes(b"o")
    plan = training.delete_loras(kit, ["pair/adapter-ar-195/lora.safetensors", "pair/adapter-nar-194/lora.safetensors"], dry=True)
    check("a dry run says the files, the folder left with no adapter (the pair's, its card with it) and the bytes, and deletes nothing",
          plan["folders"] == ["pair"] and plan["bytes"] == 154 and not plan["deleted"] and (L / "pair/adapter-ar-195/lora.safetensors").is_file(), plan)
    done = training.delete_loras(kit, ["pair/adapter-ar-195/lora.safetensors", "pair/adapter-nar-194/lora.safetensors"], dry=False)
    check("  asked for real: the folder is gone, sources.json and the rest of loras/ stay", done["deleted"] and not (L / "pair").exists() and (L / "sources.json").is_file() and (L / "two").is_dir(), done)
    one = training.delete_loras(kit, ["two/x-e001.safetensors"], dry=False)
    check("one epoch of two: only its file goes, the folder stays with the other", one["folders"] == [] and one["bytes"] == 10 and (L / "two/x-e002.safetensors").is_file() and not (L / "two/x-e001.safetensors").exists(), one)
    for bad in ["../outside.safetensors", "sources.json", "two/none.safetensors", "two"]:
        try:
            training.delete_loras(kit, [bad], dry=True)
            check(f"refused: {bad}", False, "no error")
        except ValueError:
            check(f"refused: {bad}", True)
    check("nothing outside loras/ touched", (kit / "outside.safetensors").is_file())

print("test_lora_delete:", "all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
