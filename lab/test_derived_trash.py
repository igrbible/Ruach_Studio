"""HERESY 1527: branches into a take's trash and back. python3 lab/test_derived_trash.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import derived_trash as dt  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def branch(take, bid, source="the take"):
    d = Path(take) / "derived" / bid
    d.mkdir(parents=True)
    json.dump({"id": bid, "kind": "x", "source": source, "created": "2026-10-17 14:00"}, open(d / "manifest.json", "w"))
    (d / "a.flac").write_bytes(b"x")


with tempfile.TemporaryDirectory() as t:
    branch(t, "debuzz-1")
    branch(t, "upscale-1", "derived/debuzz-1/debuzz.flac")
    branch(t, "stems-1", "derived/upscale-1/up.flac")
    branch(t, "remaster-1", "the take")
    check("the children of a branch, down the tree", dt.children(t, "debuzz-1") == ["upscale-1", "stems-1"], dt.children(t, "debuzz-1"))
    try:
        dt.delete(t, "debuzz-1")
        check("refused: a branch others were made from, alone", False, "deleted")
    except dt.HasChildren as e:
        check("refused: a branch others were made from, alone (its children named)", e.kids == ["upscale-1", "stems-1"] and (Path(t) / "derived/debuzz-1").is_dir())
    moved = dt.delete(t, "remaster-1")
    check("a branch alone into the trash, its folder whole", moved == ["remaster-1"] and (Path(t) / "derived/.trash/remaster-1/a.flac").is_file() and not (Path(t) / "derived/remaster-1").exists())
    moved = dt.delete(t, "debuzz-1", with_children=True)
    check("with its children: all three into the trash", sorted(moved) == ["debuzz-1", "stems-1", "upscale-1"] and not any((Path(t) / "derived" / x).exists() for x in moved))
    ls = dt.listing(t)
    check("the trash listed, each with when and with which", len(ls) == 4 and {x["id"]: x["with"] for x in ls}["stems-1"] == "debuzz-1" and all(x["deleted"] for x in ls), ls)
    check("back from the trash, to its place on the tree", dt.restore(t, "remaster-1") == "remaster-1" and (Path(t) / "derived/remaster-1/manifest.json").is_file() and not (Path(t) / "derived/remaster-1/.deleted.json").exists())
    branch(t, "debuzz-1")
    try:
        dt.restore(t, "debuzz-1")
        check("refused: back over a branch of the same id", False, "restored")
    except ValueError:
        check("refused: back over a branch of the same id", True)
    for bad_id in ("../x", "", ".trash"):
        try:
            dt.delete(t, bad_id)
            check("refused: a bad id " + repr(bad_id), False, "deleted")
        except ValueError:
            check("refused: a bad id " + repr(bad_id), True)
    check("emptied only when asked: what was there counted, gone for good", dt.empty(t) == 3 and not (Path(t) / "derived/.trash").exists() and dt.listing(t) == [])
print("test_derived_trash:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
