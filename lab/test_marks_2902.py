"""HERESY 2902: the linked reactions' one write (op marks): a like and 🔥 💎 set together, a dislike with both off, a part alone, refusals.
python3 lab/test_marks_2902.py"""
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
row = lambda cat, n: next(r for r in cat["takes"] if r["name"] == n)   # noqa: E731
look = lambda cat, n: (row(cat, n)["rating"], row(cat, n)["fire"], row(cat, n)["gem"])   # noqa: E731
cat = c.collection_post(conf, outputs, {"op": "marks", "names": ["a"], "fire": True, "rating": 1})
check("🔥 on with the like, in one write", look(cat, "a") == (1, True, False), look(cat, "a"))
cat = c.collection_post(conf, outputs, {"op": "marks", "names": ["a"], "gem": True, "rating": 1})
check("💎 on with the like; 🔥 kept", look(cat, "a") == (1, True, True), look(cat, "a"))
cat = c.collection_post(conf, outputs, {"op": "marks", "names": ["a", "b"], "rating": -1, "fire": False, "gem": False})
check("👎 on: the like, 🔥 and 💎 off together, for each take named", look(cat, "a") == (-1, False, False) and look(cat, "b") == (-1, False, False), [look(cat, "a"), look(cat, "b")])
cat = c.collection_post(conf, outputs, {"op": "marks", "names": ["b"], "rating": 0})
check("a part alone: the rating to none, the marks untouched", look(cat, "b") == (0, False, False) and look(cat, "a") == (-1, False, False), look(cat, "b"))
cat = c.collection_post(conf, outputs, {"op": "react", "names": ["c"], "react": "love"})
cat = c.collection_post(conf, outputs, {"op": "marks", "names": ["c"], "fire": True, "rating": 1})
check("a face (1873) is never touched", row(cat, "c")["react"] == "love" and look(cat, "c") == (1, True, False), row(cat, "c"))
for body, why in (({"op": "marks", "names": ["a"]}, "nothing to set"), ({"op": "marks", "names": ["a"], "rating": 2}, "a rating of 2"),
                  ({"op": "marks", "names": ["a"], "rating": True}, "a rating of true")):
    try:
        c.collection_post(conf, outputs, body)
        check(why + " refused", False)
    except ValueError:
        check(why + " refused", True)
d = c.load(conf); d["workspaces"]["Ice"] = ["a"]; d["frozen"] = ["Ice"]; c.save(conf, d)
try:
    c.collection_post(conf, outputs, {"op": "marks", "names": ["a"], "fire": True, "rating": 1})
    check("a take frozen with its workspace refused, as rate and mark are", False)
except ValueError:
    check("a take frozen with its workspace refused, as rate and mark are", True)
print("test_marks_2902:", "FAIL " + str(len(bad)) if bad else "all ok")
sys.exit(1 if bad else 0)
