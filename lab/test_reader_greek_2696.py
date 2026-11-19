"""HERESY 2696: polytonic Greek kept as written but its iota subscript; monotonic and the probe's h on request. python lab/test_reader_greek_2696.py"""
import sys
import unicodedata
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import reader_stress as rs  # noqa: E402

fails = 0


def check(name, ok, detail=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


N = lambda s: unicodedata.normalize("NFC", s)  # noqa: E731
src = "Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν. Τῷ ᾍδῃ ᾼ ἐκκληϲία."
out, n = rs.el_polytonic(src)
check("breathings, acute, grave and circumflex kept", N("Ἐν") in out and N("ἦν") in out and N("ὁ λόγος") in out and N("πρὸς τὸν θεόν") in out and N("καὶ") in out, out)
check("the iota subscript out: ἀρχῇ → ἀρχῆ, Τῷ → Τῶ, ᾍδῃ → Ἅδη, ᾼ → Α", N("ἀρχῆ") in out and N("Τῶ") in out and N("Ἅδη") in out and " Α " in out, out)
check("the lunate sigma as σ inside a word", N("ἐκκλησία") in out, out)
check("only the words that changed are counted", n == 5, n)
mono, _m = rs.el_monotonic(src)
check("monotonic as 2460 made it: no breathing left", "\u0313" not in unicodedata.normalize("NFD", mono) and "\u0314" not in unicodedata.normalize("NFD", mono), mono)
h, _h = rs.el_polytonic("ὁ λόγος. Ὁ υἱός. ἁμαρτία", breath_h=True)
check("the probe's h: the rough breathing a Latin h before its word, the smooth one kept", h.startswith("hο ") and N("Hο υἱός") not in h and "Hο" in h and "hαμαρτία" in h, h)
src2 = (LAB / "reader.py").read_text(encoding="utf-8")
check("said(): polytonic unless the engine or the run asks for monotonic", "rs.el_polytonic(text, breath_h=how_el == \"h\")" in src2 and "el_greek=body[\"greek\"]" in src2)
print("all ok" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
