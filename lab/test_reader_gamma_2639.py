"""HERESY 2639: the soft «г» written as γ takes the stress of its г word and keeps its γ."""
import reader_stress as rs

U = {"гарний": {"word": "гарний", "form": "га́рний"}, "гора": {"word": "гора", "form": "гора́"}, "гей": {"word": "гей", "form": "ге́й"}}


def test_gamma_word_takes_its_stress_and_keeps_gamma():
    out, rep = rs.stress("Який γарний день, ой Γора висока", "uk", "acute", None, U)
    assert "γа́рний" in out and "Γора́" in out, out
    assert rep["user"] == 2


def test_no_gamma_text_unchanged_path():
    out, _ = rs.stress("Який гарний день", "uk", "acute", None, U)
    assert "га́рний" in out and "γ" not in out


def test_his_own_mark_kept_with_gamma():
    out, _ = rs.stress("γа́рний", "uk", "acute", None, U)
    assert out == "γа́рний"


def test_greek_text_untouched():
    out, _ = rs.stress("γεια σου", "el", "acute", None, {})
    assert "γ" in out
