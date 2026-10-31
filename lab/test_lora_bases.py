"""HERESY 1960: lora_bases — each adapter's base (the file, the run, assumed), the model's line from its GGUF, and the fit between them.
Run: .venv/bin/python lab/test_lora_bases.py"""
import json
import struct
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lora_bases as B  # noqa: E402

FAILS = []


def check(name, ok, got=""):
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  · {got}"))
    if not ok:
        FAILS.append(name)


def safetensors(p, meta):
    p.parent.mkdir(parents=True, exist_ok=True)
    head = json.dumps({"__metadata__": meta, "x": {"dtype": "F32", "shape": [1], "data_offsets": [0, 4]}}).encode()
    p.write_bytes(struct.pack("<Q", len(head)) + head + b"\0\0\0\0")


def gguf(p, recipe):
    """A GGUF with one string key (heresy.merged_loras) or none."""
    p.parent.mkdir(parents=True, exist_ok=True)
    kv = b""
    if recipe is not None:
        k, v = b"heresy.merged_loras", recipe.encode()
        kv = struct.pack("<Q", len(k)) + k + struct.pack("<I", 8) + struct.pack("<Q", len(v)) + v
    p.write_bytes(b"GGUF" + struct.pack("<I", 3) + struct.pack("<QQ", 0, 1 if recipe is not None else 0) + kv)


def run(kit, name, base):
    d = kit / "training" / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "run.json").write_text(json.dumps({"name": name, "options": {"base": base} if base is not None else {}}))


with tempfile.TemporaryDirectory() as t:
    kit = Path(t)
    L = kit / "loras"
    safetensors(L / "voice-a/voice-a-e010.safetensors", {"studio": "ruach"}); run(kit, "voice-a", None)
    safetensors(L / "fw34-style/fw34-style-e000.5.safetensors", {"studio": "ruach"}); run(kit, "fw34-style", "yue2_3b_RS-FW-e003.4-m0.75-s0.75_bf16.safetensors")
    safetensors(L / "new/new-e001.safetensors", {"base_model": "yue2_3b_RS-FW-e002.4-m0.75_bf16.safetensors"})
    safetensors(L / "hf/style.safetensors", {"base_model": "m-a-p/YuE2-3B"})
    safetensors(L / "kohya/sv.safetensors", {"ss_base_model_version": "yue2"})
    safetensors(L / "bare.safetensors", {})
    safetensors(L / "YuE2-RS-FW/YuE2-RS-FW-e002.4.safetensors", {}); run(kit, "YuE2-RS-FW", "")
    gguf(kit / "models/YuE2-3B-BF16.gguf", None)
    gguf(kit / "models/YuE2-3B-IRA-BF16.gguf", "loras/hf/style.safetensors@0.75,0; heresy/MISC/x/nar.safetensors@0,0.5")
    gguf(kit / "models/YuE2-3B-RS-FW-2.4x0.75-BF16.gguf", "loras/YuE2-RS-FW/YuE2-RS-FW-e002.4.safetensors@0.75,0.75")
    gguf(kit / "models/YuE2-3B-RS-FW-2.4-voice-BF16.gguf", "loras/voice-a/voice-a-e010.safetensors@0.5,0.5")
    gguf(kit / "models/Other-7B.gguf", None)

    check("names: an RS-FW epoch from a checkpoint, a model, a LoRA file", B.line_of("yue2_3b_RS-FW-e003.4-m0.75-s0.75_bf16.safetensors") == ("fw", "3.4")
          and B.line_of("YuE2-3B-RS-FW-2.4x0.75-BF16.gguf") == ("fw", "2.4") and B.line_of("YuE2-RS-FW-e004.safetensors") == ("fw", "4.0"))
    check("names: YuE2 by a file, a repo, kohya's word; nothing for a stranger", B.line_of("yue2_3b_bf16.safetensors") == ("yue2", "") and B.line_of("m-a-p/YuE2-3B") == ("yue2", "")
          and B.line_of("yue2") == ("yue2", "") and B.line_of("Other-7B.gguf") is None and B.line_of("") is None)

    r = B.report(kit, "YuE2-3B-RS-FW-2.4x0.75-BF16.gguf", [])["loras"]
    check("the run's base: YuE2 for an empty one, RS-FW 3.4 for a run on that checkpoint", r["voice-a/voice-a-e010.safetensors"]["base"] == "YuE2"
          and r["voice-a/voice-a-e010.safetensors"]["how"] == "run" and r["fw34-style/fw34-style-e000.5.safetensors"]["base"] == "RS-FW 3.4", r)
    check("the file's word first: base_model and kohya's version", r["new/new-e001.safetensors"]["base"] == "RS-FW 2.4" and r["new/new-e001.safetensors"]["how"] == "file"
          and r["kohya/sv.safetensors"]["base"] == "YuE2" and r["hf/style.safetensors"]["how"] == "file", r)
    check("nothing said: YuE2, said to be assumed", r["bare.safetensors"]["base"] == "YuE2" and r["bare.safetensors"]["how"] == "assumed", r)
    check("on RS-FW 2.4: YuE2's adapters other, 2.4's same, 3.4's near; the folded epoch inside", r["voice-a/voice-a-e010.safetensors"]["fit"] == "other"
          and r["new/new-e001.safetensors"]["fit"] == "same" and r["fw34-style/fw34-style-e000.5.safetensors"]["fit"] == "near"
          and r["YuE2-RS-FW/YuE2-RS-FW-e002.4.safetensors"]["inside"] and r["YuE2-RS-FW/YuE2-RS-FW-e002.4.safetensors"]["fit"] == "other", r)

    b = B.report(kit, "YuE2-3B-BF16.gguf", ["voice-a/voice-a-e010.safetensors", "fw34-style/fw34-style-e000.5.safetensors", "../x.safetensors"])
    check("on YuE2: its adapters same, a fine-tune's other; only the ids asked, none outside loras/", b["model"]["label"] == "YuE2" and
          b["loras"]["voice-a/voice-a-e010.safetensors"]["fit"] == "same" and b["loras"]["fw34-style/fw34-style-e000.5.safetensors"]["fit"] == "other" and len(b["loras"]) == 2, b)
    i = B.report(kit, "YuE2-3B-IRA-BF16.gguf", ["hf/style.safetensors", "voice-a/voice-a-e010.safetensors"])
    check("IRA is YuE2 with adapters folded in: YuE2's adapters same, the folded one inside", i["model"]["label"] == "YuE2" and i["loras"]["voice-a/voice-a-e010.safetensors"]["fit"] == "same"
          and i["loras"]["hf/style.safetensors"]["inside"], i)
    v = B.report(kit, "YuE2-3B-RS-FW-2.4-voice-BF16.gguf", ["voice-a/voice-a-e010.safetensors"])
    check("a voice folded into RS-FW 2.4 by name: the model RS-FW 2.4, the voice other and inside", v["model"]["label"] == "RS-FW 2.4"
          and v["loras"]["voice-a/voice-a-e010.safetensors"]["fit"] == "other" and v["loras"]["voice-a/voice-a-e010.safetensors"]["inside"], v)
    u = B.report(kit, "Other-7B.gguf", ["voice-a/voice-a-e010.safetensors"])
    n = B.report(kit, "../models/YuE2-3B-BF16.gguf", ["voice-a/voice-a-e010.safetensors"])
    check("a model told by nothing, or a path, is unknown: nothing flagged", not u["model"]["known"] and u["loras"]["voice-a/voice-a-e010.safetensors"]["fit"] == "unknown"
          and not n["model"]["known"], (u, n))

sys.exit(1 if FAILS else 0)
