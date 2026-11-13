"""HERESY 2403: the Narrator's stock voices (lab/reader_voices, made by Drama 3 with no voice given) put among a kit's voices once: twelve, one a
language, six men and six women, each a WAV and a record of kind «stock» (made by drama3, never for training, Built with Fish Audio); a fresh
install's timbre groups made of them, a kit with made-up voices of its own keeping its groups from those; one put aside staying aside; the
shipped clips whole (their FLAC's never-for-training tag, voices.json and NOTICE beside them). Kept home with the Narrator's other checks.
    .venv/bin/python lab/test_reader_stock_voices.py"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import no_train  # noqa: E402
import reader as r  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


man = json.loads((r.STOCK / "voices.json").read_text(encoding="utf-8"))
vs = man["voices"]
check(len(vs) == 12 and len({v["lang"] for v in vs}) == 12, "twelve voices, one a language")
check(sum(v["gender"] == "male" for v in vs) == 6 and sum(v["gender"] == "female" for v in vs) == 6, "six men and six women")
check(len({(v["gender"], v["register"]) for v in vs}) == 6, "every timbre group has a stock voice")
check((r.STOCK / "NOTICE").is_file() and "Built with Fish Audio" in (r.STOCK / "NOTICE").read_text(encoding="utf-8"), "the NOTICE says Built with Fish Audio")
for v in vs:
    f = r.STOCK / v["file"]
    check(f.is_file() and no_train.MARK in no_train._tag(str(f)), f"{v['file']}: whole and tagged never for training")
    check(v["text"] and v["f0"] and r.VOICE_RE.match(v["id"]), f"{v['id']}: its words and pitch")

old = r.H.get("kit")
said = []
r.H.setdefault("say", said.append)
with tempfile.TemporaryDirectory() as tmp:
    r.H["kit"] = Path(tmp)
    try:
        got = r.voices()
        rows = [x for x in got["voices"] if x["kind"] == "stock"]
        check(len(rows) == 12, f"a fresh kit offers the twelve ({len(rows)})")
        check(all(x["made_by"] == "drama3" and x["gender"] in ("male", "female") and x["f0"] for x in rows), "each with its gender and pitch")
        check(len(got["groups"]) == 6 and all(g["centre"].startswith("stock-") for g in got["groups"]), "a fresh kit's six timbre groups are the stock voices'")
        rec = json.loads((r.voices_home() / "stock-ru.json").read_text(encoding="utf-8"))
        check(rec["kind"] == "stock" and rec["no_train"] is True and rec["credit"] == "Built with Fish Audio", "the record says what it is")
        check(r.voice_file("stock-ru").is_file(), "the engines read it as any voice's WAV")
        check(r._stock_sync() == 0, "put in once")
        r.voice_remove({"id": "stock-ja"})
        check(r._stock_sync() == 0 and not (r.voices_home() / "stock-ja.wav").exists(), "one put aside stays aside")
        # a kit with a made-up voice of its own keeps its groups from those
        shutil.copy2(r.voices_home() / "stock-de.wav", r.voices_home() / "made-x-m.wav")
        (r.voices_home() / "made-x-m.json").write_text(json.dumps({"name": "x", "lang": "de", "kind": "made", "made_by": "pro", "gender": "male",
                                                                   "f0": 90.0, "f0_by": "pyin", "bright": 900, "text": "x"}), encoding="utf-8")
        got = r.voices()
        check([g["centre"] for g in got["groups"]] == ["made-x-m"], f"the made-up voices form the groups where there are any ({got['groups']})")
        check(sum(x["kind"] == "stock" for x in got["voices"]) == 11, "the stock voices still listed beside them")
    finally:
        if old is None:
            r.H.pop("kit", None)
        else:
            r.H["kit"] = old
print(f"test_reader_stock_voices: {ok} checks passed")
