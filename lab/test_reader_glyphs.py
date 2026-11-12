"""HERESY 2270: the Reader's glyph map without a card: his table's kinds (lit, word, re with \\1, & and \\&), the acute never taken away, a
broken rule named by its line, the user's copy read before the author's table and never the other way, his table never written, Reset."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader as r
import reader_glyphs as g

rules, errors = g.parse("# a comment\n\nre\t([аеёиоуыэюяАЕЁИОУЫЭЮЯ]́?)ѵ\t\\1в\tижица\nlit\tѵ\tи\nword\tазъ\tаз\nre\t⸂([^⸃]*)⸃\t\\1\n"
                        "lit\tѓ\tה\nre\tX+\t<&>\\&\nlit\tа́\tа\nbad\tx\ty\nre\t(\tz\nword\t\t\n")
assert [e.split(":")[0] for e in errors] == ["line 9", "line 10", "line 11", "line 12"], errors     # the acute, a kind, a pattern, an empty what
out, hits = g.apply(rules, "Даѵи́д и ѵмн, азъ и разъ, ⸂вставка⸃ ХаллелуЙа́ѓ XX")
assert out == "Дави́д и имн, аз и разъ, вставка ХаллелуЙа́ה <XX>&", out
assert hits == {3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1}, hits
rx, _ = g.parse("re\t([оа])́\t\\1\n")                            # an re that would take the acute: the match kept as it was
assert g.apply(rx, "доро́га")[0] == "доро́га"

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    r.H["kit"] = kit
    try:
        r._glyphs("ѓ")
        raise AssertionError("a map read where there is none")
    except ValueError as e:
        assert "no glyph map" in str(e)
    his = g.his_path(kit)
    his.parent.mkdir(parents=True)
    his.write_text("lit\tѓ\tה\tего слово\n", encoding="utf-8")
    before = his.read_bytes()
    assert r._glyphs("Авраѓа́м") == ("Авраהа́м", {"source": "his", "rules": 1, "hits": 1})
    assert r.glyphs_get()["source"] == "his" and r.glyphs_get()["path"].endswith("lcvr2tts.map.tsv")
    try:
        r.route_post("/reader/glyphs", {"text": "lit\tѓ\tх\nre\t(\tz\n"}, {})
        raise AssertionError("a broken copy kept")
    except ValueError as e:
        assert "line 2" in str(e)
    # HERESY 2376: a save writes the table it read (his, where his is applied), the old one kept first; Undo puts it back; a test page writes nothing
    code, ans = r.route_post("/reader/glyphs", {"text": "lit\tѓ\tх\tего правка"}, {"scope": "claude"})
    assert ans.get("test") and his.read_bytes() == before, ans
    code, ans = r.route_post("/reader/glyphs", {"text": "lit\tѓ\tх\tего правка"}, {})
    assert code == 200 and ans["source"] == "his" and ans["saved"].endswith("lcvr2tts.map.tsv") and ans["kept"].startswith("his."), ans
    assert r._glyphs("Авраѓа́м")[0] == "Аврахáм".replace("a", "а") and not g.user_path(kit).exists()
    assert len(ans["backups"]) == 1 and (g.backups_dir(kit) / ans["kept"]).read_bytes() == before
    assert r.route_post("/reader/glyphs", {"text": "lit\tѓ\tх\tего правка"}, {})[1]["kept"] == ""   # the same text: nothing kept twice
    code, ans = r.route_post("/reader/glyphs-undo", {}, {})
    assert ans["restored"].startswith("his.") and his.read_bytes() == before and ans["backups"] == [], ans
    assert list((g.backups_dir(kit) / "undone").glob("his.*.replaced.tsv")), "what Undo replaced is kept"
    try:
        r.route_post("/reader/glyphs-undo", {}, {})
        raise AssertionError("an undo with nothing kept")
    except ValueError as e:
        assert "nothing to undo" in str(e)
    t = r.route_post("/reader/glyphs-try", {"map": "lit\tѓ\tה\nre\t(\tz\n", "text": "Авраѓа́м"}, {})[1]
    assert t["text"] == "Авраהа́м" and t["hits"] == {"1": 1} and t["errors"] and t["errors"][0].startswith("line 2"), t
    # a user's copy (a machine without his table, or one made before): its own saves and backups, his table untouched
    g.save(kit, "lit\tѓ\tх\tмоя копия")
    code, ans = r.route_post("/reader/glyphs", {"text": "lit\tѓ\tг\tмоя копия 2"}, {})
    assert ans["source"] == "user" and ans["saved"] == "user/reader/glyphs.map.tsv" and ans["kept"].startswith("user.") and his.read_bytes() == before
    assert r.route_post("/reader/glyphs-reset", {}, {})[1]["source"] == "his" and not g.user_path(kit).exists()
    assert r.route_get("/reader/glyphs", {})["rules"] == 1
print("test_reader_glyphs: ok")
