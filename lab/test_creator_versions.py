"""HERESY 1519: the Creator's versions. python3 lab/test_creator_versions.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import creator_versions as cv  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def refused(what, fn):
    try:
        fn()
        check("refused: " + what, False, "done")
    except ValueError:
        check("refused: " + what, True)


with tempfile.TemporaryDirectory() as t:
    check("none at first", cv.listing(t) == {"titles": []} and cv.get(t, title="Крик")["versions"] == [])
    w = {"title": "Крик", "style": "epic", "lyrics": "[verse]\\nа", "abc": "X:1", "mode": "full"}
    cv.post(t, {"op": "keep", **w, "takes": ["krik-1"]})
    b = cv.post(t, {"op": "keep", **w, "takes": ["krik-2", "a/b"]})
    check("the same words again: one version, its takes added (a path refused as a take)", len(b["versions"]) == 1 and b["versions"][0]["takes"] == ["krik-1", "krik-2"], b)
    b = cv.post(t, {"op": "keep", **dict(w, title="  крик ", lyrics="[verse]\\nб"), "takes": ["krik-3"]})
    check("other words under the same title (any case, any spacing): a second version, numbered", [v["n"] for v in b["versions"]] == [1, 2] and b["versions"][1]["lyrics"].endswith("б"), b)
    cv.post(t, {"op": "keep", "title": "Другая", "style": "x", "takes": []})
    ls = cv.listing(t)["titles"]
    check("the titles listed, the newest first, with their counts", [x["title"] for x in ls] == ["Другая", "крик"] and ls[1]["versions"] == 2 and ls[1]["takes"] == 3, ls)
    vid = cv.base_id("Крик")
    b = cv.post(t, {"op": "mark", "id": vid, "n": 1, "label": "  the first   one ", "star": True})
    check("a label (tidied) and a star", b["versions"][0]["label"] == "the first one" and b["versions"][0]["star"] is True, b["versions"][0])
    cv.post(t, {"op": "mark", "id": vid, "n": 1, "lock": True})
    refused("deleting a locked version", lambda: cv.post(t, {"op": "delete", "id": vid, "n": 1}))
    b = cv.post(t, {"op": "delete", "id": vid, "n": 2})
    check("deleted: into the title's trash, not gone", [v["n"] for v in b["versions"]] == [1] and [v["n"] for v in b["trash"]] == [2], b)
    b = cv.post(t, {"op": "keep", **dict(w, lyrics="[verse]\\nв"), "takes": []})
    check("a new version after a deletion takes a new number, not the trashed one's", [v["n"] for v in b["versions"]] == [1, 3], b)
    b = cv.post(t, {"op": "undelete", "id": vid, "n": 2})
    check("back from the trash, in its place by number", [v["n"] for v in b["versions"]] == [1, 2, 3] and b["trash"] == [], b)
    refused("a bad id", lambda: cv.post(t, {"op": "mark", "id": "../x", "n": 1}))
    refused("a version that is not there", lambda: cv.post(t, {"op": "mark", "id": vid, "n": 9, "star": True}))
    refused("an op that is not one", lambda: cv.post(t, {"op": "wipe"}))
    cv.post(t, {"op": "keep", "title": "Крик", "style": "s", "takes": []}, scope="claude")
    check("a test page's scope keeps its own", len(cv.get(t, title="Крик", scope="claude")["versions"]) == 1 and len(cv.get(t, title="Крик")["versions"]) == 3)
# HERESY 1522: in the Writer's backup and back
import writer  # noqa: E402

with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
    A, B = Path(a), Path(b)
    cv.post(A, {"op": "keep", "title": "Крик", "style": "s1", "lyrics": "l1", "takes": ["t1"]})
    cv.post(A, {"op": "keep", "title": "Крик", "style": "s2", "lyrics": "l2", "takes": ["t2"]})
    cv.post(A, {"op": "mark", "id": cv.base_id("Крик"), "n": 1, "star": True, "label": "first"})
    cv.post(A, {"op": "keep", "title": "Тишина", "style": "q", "takes": []})
    cv.post(A, {"op": "delete", "id": cv.base_id("Тишина"), "n": 1})
    exp = writer.post(A, {"op": "export"})
    check("the Writer's export carries the Creator's versions, version 2", exp["version"] == 2 and sorted(x["title"] for x in exp["creator_versions"]) == ["Крик", "Тишина"], exp.get("creator_versions"))
    cv.post(B, {"op": "keep", "title": "Крик", "style": "s2", "lyrics": "l2", "takes": ["t9"]})
    r = writer.post(B, {"op": "import", "backup": exp})
    k = cv.get(B, title="Крик")
    check("into a studio with one of the titles: the missing title whole, the other gains the version it lacked, its own kept",
          r["imported"]["creator_versions"]["titles"] == 1 and [v["style"] for v in k["versions"]] == ["s2", "s1", "s2"] and k["versions"][1]["star"] is True and k["versions"][1]["label"] == "first" and k["versions"][0]["takes"] == ["t9"], (r["imported"], k["versions"]))
    check("  numbered after its own, the trashed one come back into the trash", [v["n"] for v in k["versions"]] == [1, 2, 3] and len(cv.get(B, title="Тишина")["trash"]) == 1)
    r2 = writer.post(B, {"op": "import", "backup": exp})
    check("the same backup again: nothing doubled", r2["imported"]["creator_versions"]["versions"] == 0 and len(cv.get(B, title="Крик")["versions"]) == 3, r2["imported"])
    old = dict(exp)
    old.pop("creator_versions")
    old["version"] = 1
    check("a backup from before the versions: imported as before", "creator_versions" not in writer.post(B, {"op": "import", "backup": old})["imported"])
    check("a broken book is skipped, not an error", cv.import_all(B, [{"title": "x", "versions": "no"}, 5]) == {"titles": 0, "versions": 0, "same": 0, "skipped": 2})
print("test_creator_versions:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
