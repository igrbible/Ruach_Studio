"""HERESY 1935: a section never stands without its parents: ws-add and ws-move into a section make them, an orphan already
in the file is repaired on load, a workspace's own takes stay its own.   python3 lab/test_ws_parents.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as c  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


root = Path(tempfile.mkdtemp())
outputs, conf = root / "outputs", root / "user"
outputs.mkdir(); conf.mkdir()
for n in ("a", "b", "c"):
    (outputs / n).mkdir(); json.dump({"title": n}, open(outputs / n / "meta.json", "w"))
json.dump({"workspaces": {"Songs": ["a"], "Ambient / waterfall": ["b"]}}, open(conf / "collection.json", "w"))
d = c.load(conf)
check("an orphan in the file gets its parent on load", d["workspaces"].get("Ambient") == [] and d["workspaces"]["Ambient / waterfall"] == ["b"], d["workspaces"])
c.collection_post(conf, outputs, {"op": "ws-add", "workspace": "Birds / tropical / canary", "names": ["c"]})
w = json.load(open(conf / "collection.json"))["workspaces"]
check("ws-add into a section writes both its parents", w.get("Birds") == [] and w.get("Birds / tropical") == [] and w["Birds / tropical / canary"] == ["c"], w)
c.collection_post(conf, outputs, {"op": "ws-move", "workspace": "Fire / Dartington", "names": ["a"], "from": "Songs"})
w = json.load(open(conf / "collection.json"))["workspaces"]
check("ws-move into a section writes its parent, the take leaves where it came from", w.get("Fire") == [] and w["Fire / Dartington"] == ["a"] and w["Songs"] == [], w)
check("the repaired parent was written too", w.get("Ambient") == [], w)
cat = c.catalog(outputs, conf)
names = cat.get("workspaces") or []
names = list(names) if not isinstance(names, dict) else list(names)
check("the catalogue lists no section without its parent", all(all(c.SEP.join(x.split(c.SEP)[:i]) in names for i in range(1, len(x.split(c.SEP)))) for x in names), names)
print("all good" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
