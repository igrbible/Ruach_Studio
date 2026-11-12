"""HERESY 2375: the furtive patach said before its letter (רוּחַ read «руах», not «руха»), Hebrew left in its letters, the ear comparing the text
as written; a helper's stderr gives its cause first (three last lines lost a Traceback's cause on 10.11)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader as r

P, AL = "ַ", "א"
ruach = "רוּח" + P                   # רוּחַ
out, n = r.furtive("И Руах: וְ" + ruach + " אֱלֹהִים")
assert n == 1 and ("רוּ" + AL + P + "ח") in out and out.startswith("И Руах: "), out
assert not any("a" <= c.lower() <= "z" or "а" <= c.lower() <= "я" for c in out.split(": ", 1)[1] if c.isalpha()), "Hebrew stays Hebrew"
assert r.furtive("שָׁמַע")[1] == 0      # שָׁמַע: the patach under מ, none under ע
assert r.furtive("פֶּתַח")[1] == 0      # פֶּתַח
assert r.furtive("גָּבֹה" + P + "ּ")[1] == 1   # גָּבֹהַּ: ה with its mappiq
assert r.furtive("רוח")[1] == 0                          # no points, nothing to move
h = r.Hearer.__new__(r.Hearer)
h.tag_re = r.re.compile(r"\[[^\]]*\]")
assert h.ref("[calm] " + out) == "И Руах: וְרוּח אֱלֹהִים", h.ref(out)
said, _ = r.said(ruach, {"stress": "acute", "tag_re": h.tag_re}, "he", "", False)
assert AL + P + "ח" in said, said
lines = ["loading", "Traceback (most recent call last):", '  File "x.py", line 3, in <module>', "    boom()",
         "torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2 GiB"] + [f"frame {i}" for i in range(8)]
w = r.stderr_why(lines)
assert w.startswith("Traceback") and "OutOfMemoryError" in w and "frame 7" in w and 'File "x.py"' not in w.split("…")[0], w
assert r.stderr_why(["a", "b"]) == "a | b"
assert r.HEAR_BEAM == 5
# HERESY 2374: a Studio fresh from a release, nothing of Drama 3 here: the room is told what is missing and how to set it up
import tempfile  # noqa: E402
with tempfile.TemporaryDirectory() as tmp:
    old = r.H.get("kit")
    r.H["kit"] = Path(tmp)
    try:
        d3 = next(e for e in r.engines_public()["engines"] if e["id"] == "drama3")
        assert [m["id"] for m in d3["missing"]] == ["model", "server", "licence"], d3["missing"]
        assert d3["setup"] == {"tier": "narrator", "command": "bash tools/narrator-setup.sh", "size": "24.8 GB"}, d3["setup"]
        (r.paths.at(r.paths.NARRATOR, tmp) / "drama-3-gguf").mkdir(parents=True)
        for n in ("drama-3-experts-Q4_K-backbone-Q8_0.gguf", "LICENSE", "NOTICE"):
            (r.paths.at(r.paths.NARRATOR, tmp) / "drama-3-gguf" / n).write_text("x")
        b = Path(tmp) / "build/audio.cpp/build/linux-cpu-release/bin"
        b.mkdir(parents=True)
        (b / "audiocpp_server").write_text("x")
        d3 = next(e for e in r.engines_public()["engines"] if e["id"] == "drama3")
        assert d3["missing"] == [], d3["missing"]
    finally:
        r.H["kit"] = old
print("test_reader_rules: ok")
