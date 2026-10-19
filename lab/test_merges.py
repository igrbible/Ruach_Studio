"""HERESY 1494: merges.py reads what a merged backbone carries from its GGUF header, and names each adapter as the LoRA list does.
python3 lab/test_merges.py"""
import json
import struct
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import merges  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def s(t):
    b = t.encode()
    return struct.pack("<Q", len(b)) + b


def gguf(path, kv):
    out = b"GGUF" + struct.pack("<IQQ", 3, 0, len(kv))
    for key, t, val in kv:
        out += s(key) + struct.pack("<I", t) + val
    path.write_bytes(out + b"\0" * 64)


with tempfile.TemporaryDirectory() as d:
    kit = Path(d)
    (kit / "models").mkdir()
    (kit / "loras").mkdir()
    json.dump({"loras": {"YuE2-instrumental-cot-full-loras/": {"title": "Instrumental"},
                         "yue2-mothersuperior-realaudio-tokenizer-v4/nar_lora_joint_v9": {"title": "Real audio v9"},
                         "yue2-steps-from-hell/adapter-ar-195/": {"title": "Epic trailer"}}}, open(kit / "loras" / "sources.json", "w"))
    said = ("loras/YuE2-instrumental-cot-full-loras/ar_lora_inst_v3abc.safetensors@0.75,0; "
            "elsewhere/realaudio-v4/nar_lora_joint_v9.safetensors@0,0.85; "
            "loras/yue2-steps-from-hell/adapter-ar-195/lora.safetensors@0.32,0; "
            "loras/someone-else/thing.safetensors@0,0.5")
    tokens = struct.pack("<IQ", 8, 3) + s("a") + s("bb") + s("ccc")                 # an array of strings before the key
    ints = struct.pack("<IQ", 5, 4) + struct.pack("<4i", 1, 2, 3, 4)                 # and one of a fixed size
    gguf(kit / "models" / "YuE2-3B-IRA-Q8_0.gguf", [("general.architecture", 8, s("yue2")), ("tokenizer.tokens", 9, tokens),
                                                    ("x.ints", 9, ints), ("x.f", 6, struct.pack("<f", 1.5)), (merges.KEY, 8, s(said))])
    gguf(kit / "models" / "YuE2-3B-BF16.gguf", [("general.architecture", 8, s("yue2"))])
    (kit / "models" / "YuE2-3B-Broken-BF16.gguf").write_bytes(b"NOPE")
    r = merges.merges(kit)
    got = r["merges"].get("IRA-Q8_0") or []
    check("a merge's adapters read from the header past string and number arrays, at their strengths",
          [(x["ar"], x["nar"]) for x in got] == [(0.75, 0), (0, 0.85), (0.32, 0), (0, 0.5)], got)
    check("  named as the LoRA list names them: by folder, by file (a copy kept elsewhere found by its stem), by a sub-folder; else the folder",
          [x["name"] for x in got] == ["Instrumental", "Real audio v9", "Epic trailer", "someone-else"], got)
    check("m-a-p's own (no such key) is not a merge", "BF16" not in r["merges"], r)
    check("a file that cannot be read is said, not passed over", "Broken-BF16" in r["errors"] and "not a GGUF" in r["errors"]["Broken-BF16"], r["errors"])

print("test_merges:", "all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
