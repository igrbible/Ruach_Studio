"""HERESY 2374: a language's own stress dictionary in the format of ours, built by reader_dict_build.py and read by the Narrator's stress pass:
a form with one stress marked, a homograph named and never guessed, a name by its capital inside a sentence, never at a sentence's start;
Russian reads such an index where Zaliznyak's StarDict is not here; a language without one counts its words unknown as before."""
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_dict_build as b
import reader_stress as rs

A = "́"
with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    rs.H["kit"] = kit
    src = kit / "be.tsv"
    src.write_text("# a test list\nмалако́\nза́мак\nзама́к\nВі́льня\tname\nвільня́\nхата\nп+оле\n", encoding="utf-8")
    r = b.build("be", src, rs.own_dir("be") / "forms.sqlite", "a test", "CC0")
    assert r["keys"] == 4 and r["homographs"] == 2 and r["names"] == 1 and r["no_stress"] == 1, r
    con = sqlite3.connect(str(rs.own_dir("be") / "forms.sqlite"))
    assert dict(con.execute("SELECT k, v FROM about").fetchall())["licence"] == "CC0"
    assert con.execute("SELECT f FROM forms WHERE k = 'поле'").fetchone()[0] == "по" + A + "ле"
    out, rep = rs.stress("Малако і замак. У полі.", "be")
    assert rep["dict"] == "own:be", rep
    assert "Малако" + A in out and "замак" in out, out
    assert rep["homographs"] == [{"word": "замак", "forms": sorted(["за" + A + "мак", "зама" + A + "к"])}], rep
    assert rs.dict_get("be")["own"] == "ready"
    # a name inside a sentence takes the names first; at a sentence's start the common word's forms (here the same)
    out, rep = rs.stress("Бачу Вільня. Вільня.", "be")
    assert out == "Бачу Ві" + A + "льня. Вільня.", out
    assert rep["homographs"] == [{"word": "вільня", "forms": sorted(["ві" + A + "льня", "вільня" + A])}], rep
    # Russian: such an index where Zaliznyak's StarDict is not here
    rs.Z["con"] = None
    ru = kit / "ru.txt"
    ru.write_text("молоко́\n", encoding="utf-8")
    b.build("ru", ru, rs.own_dir("ru") / "forms.sqlite")
    out, rep = rs.stress("Молоко.", "ru")
    assert rep["dict"] == "own:ru" and out == "Молоко" + A + ".", (out, rep)
    # a language with no index: its words counted unknown, as before
    out, rep = rs.stress("Leche fresca.", "es")
    assert rep["dict"] == "none" and rep["unknown"] == 2 and out == "Leche fresca.", rep
    assert rs.dict_get("es")["own"] == "absent"
print("test_reader_dicts: ok")
