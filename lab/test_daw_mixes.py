"""HERESY 1533: the DAW's mixes kept beside their set: the working mix, named ones, refused names and sizes. python3 lab/test_daw_mixes.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mixes as dm  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as t:
    check("nothing kept yet: no working mix, no named ones", dm.load(t) == {"working": None, "named": []})
    st = {"strips": {"drums": {"pan": -0.3}}, "buses": {"reverb": {"preset": "plate"}}, "t": 1}
    dm.keep_working(t, st)
    check("the working mix kept as it was sent", dm.load(t)["working"]["state"] == st and dm.load(t)["working"]["saved"] > 0)
    dm.save_as(t, "Вокал вперёд", st)
    dm.save_as(t, "Dry", {"strips": {}})
    dm.save_as(t, "Вокал вперёд", {"strips": {"lead_vocal": {"gain_db": 2}}})
    names = [m["name"] for m in dm.load(t)["named"]]
    check("named mixes in the order saved; a name saved again is replaced, not doubled", names == ["Dry", "Вокал вперёд"] and dm.load(t)["named"][1]["state"]["strips"]["lead_vocal"]["gain_db"] == 2, names)
    dm.delete(t, "Dry")
    check("a named mix deleted", [m["name"] for m in dm.load(t)["named"]] == ["Вокал вперёд"] and dm.load(t)["working"]["state"] == st)
    for nm, why in (("", "an empty name"), ("a/b", "a slash"), ("x" * 81, "a name too long")):
        try:
            dm.save_as(t, nm, st)
            check("refused: " + why, False, "saved")
        except ValueError:
            check("refused: " + why, True)
    for state, why in (([1, 2], "a list for a mix"), ({"x": "y" * (600 * 1024)}, "a mix over 512 KB")):
        try:
            dm.keep_working(t, state)
            check("refused: " + why, False, "kept")
        except ValueError:
            check("refused: " + why, True)
    try:
        dm.delete(t, "nobody")
        check("refused: deleting a mix that is not there", False, "deleted")
    except ValueError:
        check("refused: deleting a mix that is not there", True)
    (Path(t) / "mixes.json").write_text("{not json", encoding="utf-8")
    check("a file broken by hand is said broken, not taken for «nothing kept»", dm.load(t) == {"working": None, "named": [], "broken": "mixes.json"})
    dm.keep_working(t, st)
    aside = list(Path(t).glob("mixes.broken-*.json"))
    check("  the next write sets the broken one aside as it was, then keeps the new", len(aside) == 1 and aside[0].read_text() == "{not json" and dm.load(t)["working"]["state"] == st and "broken" not in dm.load(t))
    check("no temporary files left beside it", not list(Path(t).glob(".mixes-*")))
print("test_daw_mixes:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
