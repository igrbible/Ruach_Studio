"""HERESY 2459, 2460 (dictionaries lane, 12.11.2026): the Belarusian index found through ў, polytonic Greek read as monotonic."""
import sqlite3
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_stress as rs  # noqa: E402

A = rs.ACUTE


def test_be_u_short_finds_u():
    con = sqlite3.connect(":memory:", check_same_thread=False)
    con.execute("CREATE TABLE forms (k TEXT PRIMARY KEY, f TEXT)")
    con.execute("INSERT INTO forms VALUES (?, ?)", ("уласных", "ула" + A + "сных"))
    saved = rs.OWN.get("be")
    rs.OWN["be"] = {"state": "ready", "error": "", "con": con, "cap": False}
    try:
        assert rs.own_forms("be", "ўласных") == ["ўла" + A + "сных"]
        assert rs.own_forms("be", "уласных") == ["ула" + A + "сных"]
        assert rs.own_forms("be", "ўсё") == []
    finally:
        if saved is None:
            rs.OWN.pop("be", None)
        else:
            rs.OWN["be"] = saved


def test_el_polytonic_to_monotonic():
    t, n = rs.el_monotonic("Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.")
    assert t == "Εν αρχή ην ο λόγος, και ο λόγος ην προς τον θεόν, και θεός ην ο λόγος."
    assert n == 13


def test_el_decomposed_lunate_and_exceptions():
    t, _ = rs.el_monotonic(unicodedata.normalize("NFD", "τῇ ἡμέρᾳ αἵρεσις ἢ ποῦ πῶς υἱὸς προϊόν λόγοϲ ϲοφία"))
    assert t == unicodedata.normalize("NFC", "τη ημέρα αίρεσις ή πού πώς υιός προϊόν λόγος σοφία")


def test_el_leaves_monotonic_and_other_scripts():
    s = "Το αιρετικό δίδυμο καί. Ру́ах й ёлка Сѐргей, Viktor"
    assert rs.el_monotonic(s) == (s, 0)


def test_el_syllables():
    assert rs._el_syllables("και") == 1
    assert rs._el_syllables("θεός") == 2
    assert rs._el_syllables("προϊόν") == 3


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("test_reader_dicts_2459: ok")
