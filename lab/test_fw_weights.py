"""HERESY 1794: Ruach Studio's own fine-tune in weights.py: the extra «fw» (seven merges x three quants), the part «fw» at the quant of
m-a-p's backbone here (none on a Q5_K_M install), the fetch's arguments and sizes.   python3 lab/test_fw_weights.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import weights  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


fw = next((e for e in weights.EXTRAS if e and e["name"] == "fw"), None)
ids = [v["id"] for v in fw["variants"]] if fw else []
check("the extra «fw»: seven merges at BF16, Q8_0 and Q6_K, each its own file", len(ids) == 21 and "2.4x0.75-Q8_0" in ids and
      all(v["files"] == [f"models/YuE2-3B-RS-FW-{v['id']}.gguf"] for v in fw["variants"]), ids)
check("  the default's three marked, no other", [v["id"] for v in fw["variants"] if v.get("note")] == ["2.4x0.75-BF16", "2.4x0.75-Q8_0", "2.4x0.75-Q6_K"], fw)
check("  a variant fetched as an extra", weights._args({"fw": "3.4x0.7-Q6_K"}) == (["--only", "none", "--fw", "3.4x0.7-Q6_K", "--yes"], "the RS-FW merge 3.4x0.7-Q6_K"),
      weights._args({"fw": "3.4x0.7-Q6_K"}))
try:
    weights._args({"fw": "2.9x0.75-BF16"}); bad = False
except ValueError:
    bad = True
check("  a merge that is not one refused (2.9 failed, never merged)", bad)
check("  the part, by its name", weights._args({"part": "fw"}) == (["--only", "fw"], "Ruach Studio's own fine-tune"), weights._args({"part": "fw"}))
with tempfile.TemporaryDirectory() as d:
    k = Path(d); (k / "models").mkdir()
    check("no backbone here: no fine-tune part", "fw" not in weights.parts_of(k) and weights.fw_quant(k) == "", weights.parts_of(k))
    (k / "models" / "YuE2-3B-Q5_K_M.gguf").write_bytes(b"")
    check("  a Q5_K_M install: none (there is no Q5_K_M of it)", "fw" not in weights.parts_of(k), weights.parts_of(k))
    (k / "models" / "YuE2-3B-Q8_0.gguf").write_bytes(b"")
    check("  a Q8_0 backbone: the default at Q8_0, 3.8 GB, said and expected", weights.parts_of(k).get("fw") == "3.8 GB" and weights.fw_quant(k) == "Q8_0" and
          weights._which({"part": "fw"}, k) == ({"part": "fw"}, 3800000000), weights.parts_of(k))
    (k / "models" / "YuE2-3B-BF16.gguf").write_bytes(b"")
    check("  BF16 beside it: the fullest, 7.2 GB", weights.parts_of(k).get("fw") == "7.2 GB" and weights.listing(k)["parts"].get("fw") == "7.2 GB", weights.parts_of(k))
    (k / "models" / "YuE2-3B-RS-FW-2.4x0.75-BF16.gguf").write_bytes(b"x")
    (k / "tmp").mkdir(); (k / "tmp" / "fetch-heresy.list").write_text("##\tfw\tRuach Studio's own fine-tune\nhere\tmodels/x\t(y)\n", encoding="utf-8")
    last = weights.listing(k)["last"]   # 25.10: _last_run keeps a list named «parts»: a function of that name was a list there (/weights said «not callable»)
    check("  the last run's part «fw» said with its size", last and last["parts"][0]["part"] == "fw" and last["parts"][0]["size"] == "7.2 GB", last)
    ex = next(e for e in weights._extras(k) if e["name"] == "fw")
    here = [v["id"] for v in ex["variants"] if v.get("here")]
    check("  a merge's file here: its variant said here, the others not", here == ["2.4x0.75-BF16"], here)
check("the other parts as they were", all(weights.PARTS[p] for p in ("extras", "whisper", "stems", "upscale", "loras")) and "fw" not in weights.PARTS, weights.PARTS)
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
