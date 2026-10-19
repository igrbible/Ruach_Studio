"""HERESY 1515: the Refiner's setups by name. python3 lab/test_refiner_profiles.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import refiner_profiles as rp  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as t:
    check("none at first", rp.load(t) == {"profiles": []})
    rp.save(t, "  Ballad  ", {"fields": {"pcStems": True, "rmPreset": "vocal"}, "canvas": {"take": [0, 0]}})
    rp.save(t, "Rap", {"fields": {"pcStems": False}, "canvas": {}})
    d = rp.load(t)
    check("two kept, by name, the name's spaces tidied", [p["name"] for p in d["profiles"]] == ["Ballad", "Rap"] and d["profiles"][0]["setup"]["fields"]["rmPreset"] == "vocal", d)
    rp.save(t, "Ballad", {"fields": {"rmPreset": "flat"}, "canvas": {}})
    d = rp.load(t)
    check("saved again under its name: the one replaced, not doubled", len(d["profiles"]) == 2 and d["profiles"][0]["setup"]["fields"] == {"rmPreset": "flat"}, d)
    rp.delete(t, "Rap")
    check("deleted", [p["name"] for p in rp.load(t)["profiles"]] == ["Ballad"])
    for args, why in ((("", {}), "an empty name"), (("x" * 61, {}), "a name over 60"), (("A", {"fields": "no"}), "fields that are no map"),
                      (("Big", {"fields": {"x": "y" * 70000}}), "a setup over 64 KB")):
        try:
            rp.save(t, *args)
            check("refused: " + why, False, "kept")
        except ValueError:
            check("refused: " + why, True)
    try:
        rp.delete(t, "Nobody")
        check("refused: deleting one that is not there", False, "deleted")
    except ValueError:
        check("refused: deleting one that is not there", True)
    Path(t, rp.NAME).write_text("not json")
    check("a broken file reads as none, not an error", rp.load(t) == {"profiles": []})
print("test_refiner_profiles:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
