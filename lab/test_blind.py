"""HERESY 1874: a workspace for blind listening: the flag on and off, its sections with it, its rename carried, the catalogue saying it.
python3 lab/test_blind.py"""
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
d = c.load(conf)
d["workspaces"] = {"Blind": ["a"], "Blind / Part": ["b"], "Open": ["c", "a"]}
c.save(conf, d)
row = lambda cat, n: next(r for r in cat["takes"] if r["name"] == n)   # noqa: E731
cat = c.catalog(outputs, conf)
check("none blind at first", not any(r["blind"] for r in cat["takes"]) and cat["blind"] == [], cat["blind"])
cat = c.collection_post(conf, outputs, {"op": "blind", "workspace": "Blind", "on": True})
check("its takes blind, its section's too, a take also elsewhere still blind", row(cat, "a")["blind"] and row(cat, "b")["blind"] and not row(cat, "c")["blind"], cat["takes"])
cat = c.collection_post(conf, outputs, {"op": "ws-rename", "workspace": "Blind", "to": "Blind 2"})
check("the rename carries it", cat["blind"] == ["Blind 2"] and row(cat, "b")["blind"], cat["blind"])
cat = c.collection_post(conf, outputs, {"op": "blind", "workspace": "Blind 2", "on": False})
check("lifted, none blind", not any(r["blind"] for r in cat["takes"]) and cat["blind"] == [], cat["blind"])
try:
    c.collection_post(conf, outputs, {"op": "blind", "workspace": "Nowhere", "on": True})
    check("a workspace not there refused", False)
except ValueError:
    check("a workspace not there refused", True)

print("test_blind  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
