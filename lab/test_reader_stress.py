"""HERESY 2256: the Reader's stresses without a card. A small StarDict in Zaliznyak's own form (forms by commas, ` for the secondary stress, two
articles of one word for a homograph) indexed into SQLite; his own marks kept; the user's dictionary over the paradigm; a homograph left and named;
ё found from е; a hyphened word found whole; the case kept; the marks given as an engine takes them; the language told by its letters; a pass while
the paradigm is not open says so instead of a silent «nothing found»."""
import gzip, struct, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_stress as rs

A = "́"
ARTS = [("замок", "замо́к, замки́, замка́"), ("замок", "за́мок, за́мки, за́мка"), ("бормашина", "бо`рмаши́на, бо`рмаши́ны, бо`рмаши́ну"),
        ("ёлка", "ёлка, ёлки"), ("стукать", "сту́кать, сту́кают, сту́кал"), ("дорога", "доро́га, доро́ги, доро́гу"), ("дом", "до́м, дома́, до́ма")]


def stardict(base):
    data, idx = b"", b""
    for head, art in sorted(ARTS):
        b = art.encode()
        idx += head.encode() + b"\0" + struct.pack(">II", len(data), len(b))
        data += b
    Path(str(base) + ".idx").write_bytes(idx)
    Path(str(base) + ".dict.dz").write_bytes(gzip.compress(data))
    Path(str(base) + ".ifo").write_text("StarDict's dict ifo file\nversion=2.4.2\nsametypesequence=m\n")


assert rs.detect("Вони стукають у двері") == "uk" and rs.detect("Ён ўвайшоў") == "be" and rs.detect("Замок") == "ru"
assert rs.detect("Λόγος") == "el" and rs.detect("שלום") == "he" and rs.detect("Hello") == "en"
assert rs.normal_form("зам+ок") == "замо" + A + "к" and rs.normal_form("замо́к") == "замо́к"
assert rs.with_case("ДОРОГА", "доро́га") == "ДОРО́ГА" and rs.with_case("Дорога", "доро́га") == "Доро́га" and rs.with_case("елка", "ёлка") == "ёлка"
assert rs.transport("доро́га", "plus") == "дор+ога" and rs.transport("доро́га", "none") == "дорога" and rs.transport("бо̀р", "acute") == "бор"

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    rs.H["kit"] = kit
    # ---- the paradigm not there: the pass reads on and says why, never a silent «nothing found»
    out, rep = rs.stress("Дорога домой.", "ru")
    assert out == "Дорога домой." and rep["dict"] == "zaliznyak absent", rep
    d = rs.zaliznyak_dir()
    d.mkdir(parents=True)
    stardict(d / "paradigm")
    assert rs.zaliznyak_ready() and rs.zaliznyak_state() == "ready"
    assert sorted(rs.zaliznyak("замок")) == ["за́мок", "замо́к"] and rs.zaliznyak("бормашина") == ["бормаши́на"] and rs.zaliznyak("нет") == []
    assert rs.zaliznyak("елка") == ["ёлка"]
    text = "Дорога к Замку. Бор-машина и бормашина стукают; замок висит. Ло́гос, ёлка, елка, ДОРОГУ, дом <|emotion:awe|> [дорога]."
    import re
    out, rep = rs.stress(text, "ru", "acute", re.compile(r"<\|[a-z]+:[a-z_]+\|>|\[[^\]]*\]"))
    assert "Доро́га" in out and "Замка́" not in out, out                       # Замку: not in this small paradigm, left
    assert "Бор-маши́на" in out and "бормаши́на" in out and "сту́кают" in out, out
    assert " замок " in out and {"word": "замок", "forms": ["за́мок", "замо́к"]} in rep["homographs"], (out, rep)   # a homograph left and named
    assert "Ло́гос" in out and "ёлка, ёлка" in out and "ДОРО́ГУ" in out, out  # his marks kept; ё put in from the paradigm; the case kept
    assert " дом " in out and "[дорога]" in out and "<|emotion:awe|>" in out, out   # one vowel: no mark; tags never touched
    assert rep["own"] == 2 and rep["dict"] == "zaliznyak", rep                # Ло́гос and the written ёлка
    # ---- the user's dictionary over the paradigm, by its key (case and ё aside); a respelling kept as written
    rs.dict_set({"lang": "ru", "word": "Замок", "form": "зам+ок"})
    rs.dict_set({"lang": "ru", "word": "дорога", "form": "доро́га"})
    rs.dict_set({"lang": "uk", "word": "стукають", "form": "сту́кають"})
    rs.dict_set({"lang": "uk", "word": "наспівував", "form": "наспі́вував"})
    g = rs.dict_get("ru")
    assert [w["word"] for w in g["words"]] == ["дорога", "Замок"] and g["zaliznyak"] == "ready", g
    out, rep = rs.stress("Замок на двери.", "ru")
    assert out.startswith("Замо́к") and rep["user"] == 1 and not rep["homographs"], (out, rep)
    out, rep = rs.stress("Вони стукають і наспівував він.", "uk", "plus")
    assert out == "Вони ст+укають і насп+івував він." and rep["dict"] == "lang-uk absent", (out, rep)   # 2343: without lang-uk's index, said
    rs.dict_set({"lang": "ru", "word": "замок", "form": ""})
    assert [w["word"] for w in rs.dict_get("ru")["words"]] == ["дорога"]
    for bad in ({"lang": "ru", "word": "два слова", "form": "x"}, {"lang": "r u", "word": "x", "form": "x"}, {"lang": "ru", "word": "x", "form": "y" * 90}):
        try:
            rs.dict_set(bad)
            raise AssertionError(f"taken: {bad}")
        except ValueError:
            pass
    m = rs.merge(None, {"own": 1, "user": 0, "marked": 2, "unknown": 0, "homographs": [{"word": "a", "forms": []}]})
    m = rs.merge(m, {"own": 0, "user": 1, "marked": 1, "unknown": 3, "homographs": [{"word": "a", "forms": []}, {"word": "b", "forms": []}]})
    assert (m["own"], m["user"], m["marked"], m["unknown"], [h["word"] for h in m["homographs"]]) == (1, 1, 3, 3, ["a", "b"]), m
    # ---- HERESY 2343: Ukrainian from lang-uk's dictionary, indexed: one stress marked, a homograph named, a name by its capital inside a sentence
    import sqlite3
    ud = rs.uk_dir()
    ud.mkdir(parents=True)
    con = sqlite3.connect(str(ud / "forms.sqlite"))
    con.execute("CREATE TABLE forms (k TEXT PRIMARY KEY, f TEXT) WITHOUT ROWID")
    con.execute("CREATE TABLE cap (k TEXT PRIMARY KEY, f TEXT) WITHOUT ROWID")
    con.executemany("INSERT INTO forms VALUES (?, ?)", [("стукають", "сту́кають"), ("замок", "за́мок|замо́к"), ("київ", "ки́їв|киї́в"), ("м'ясо", "м'я́со"),
                                                         ("голова", "голова́"), ("двері", "две́рі"), ("помилка", "по́ми́лка")])
    con.executemany("INSERT INTO cap VALUES (?, ?)", [("київ", "ки́їв"), ("замок", "за́мок")])
    con.commit()
    con.close()
    rs.dict_set({"lang": "uk", "word": "стукають", "form": ""})
    out, rep = rs.stress("Вони стукають у двері. Замок висить, а в Київ їде голова; м’ясо там. Київ далеко.", "uk")
    assert "сту́кають" in out and "две́рі" in out and "голова́" in out and "м’я́со" in out, out          # the word's own apostrophe kept
    assert "в Ки́їв" in out and "Київ далеко" in out and out.split(".")[1].strip().startswith("Замок"), out   # a name inside a sentence; at the start, never
    assert {"word": "замок", "forms": ["за́мок", "замо́к"]} in rep["homographs"] and {"word": "київ", "forms": ["ки́їв", "киї́в"]} in rep["homographs"], rep
    out, rep = rs.stress("Це помилка.", "uk")                  # HERESY 2452: two stresses in one form (по́ми́лка), never forced, named
    assert out == "Це помилка." and {"word": "помилка", "forms": sorted(["по́милка", "поми́лка"])} in rep["homographs"], (out, rep)
    out, rep = rs.stress("Це помилка, замок.", "uk")
    assert rep["dict"] == "lang-uk" and rs.uk_state() == "ready" and rs.dict_get("uk")["lang_uk"] == "ready", rep
    assert rs.uk_forms("наспівував") == [] and "насп+івував" in rs.stress("Він наспівував.", "uk", "plus")[0]    # the user's word still over the dictionary
    rs.UK["con"].close()
    rs.UK["con"] = None
    rs.Z["con"].close()
    rs.Z["con"] = None
print("test_reader_stress: ok")
