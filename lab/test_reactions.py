"""HERESY 1873: a take's reaction kept by the lab: one a take, set, changed, cleared, an unknown one refused, a frozen take's refused, an older list
read as its first, the catalogue saying it. python3 lab/test_reactions.py"""
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
for n in ("a", "b", "ice", "old"):
    (outputs / n).mkdir(); json.dump({"title": n}, open(outputs / n / "meta.json", "w"))
row = lambda cat, n: next(r for r in cat["takes"] if r["name"] == n)   # noqa: E731
cat = c.catalog(outputs, conf)
check("no reaction before any", row(cat, "a")["react"] == "", row(cat, "a"))
cat = c.collection_post(conf, outputs, {"op": "react", "react": "lol", "names": ["a", "b"]})
check("set for each take named", row(cat, "a")["react"] == "lol" and row(cat, "b")["react"] == "lol", (row(cat, "a"), row(cat, "b")))
cat = c.collection_post(conf, outputs, {"op": "react", "react": "mindblown", "names": ["a"]})
check("one a take: another replaces it, the others kept", row(cat, "a")["react"] == "mindblown" and row(cat, "b")["react"] == "lol", row(cat, "a"))
cat = c.collection_post(conf, outputs, {"op": "react", "react": "", "names": ["a"]})
check("none clears it and leaves no line", row(cat, "a")["react"] == "" and "a" not in c.load(conf)["reacts"], c.load(conf)["reacts"])
try:
    c.collection_post(conf, outputs, {"op": "react", "react": "skull", "names": ["a"]})
    check("an unknown reaction refused", False)
except ValueError:
    check("an unknown reaction refused", True)
check("the fourteen, their zones' order", c.REACTIONS == ("love", "adore", "hundred", "party", "lol", "mindblown", "wow", "tears", "think", "look", "nerd", "peek", "melt", "poop"), c.REACTIONS)
d = c.load(conf)
d["reacts"]["old"] = ["tears", "lol"]
d["workspaces"] = {"Cold": ["ice"]}
d["frozen"] = ["Cold"]
c.save(conf, d)
check("an older list reads as its first", row(c.catalog(outputs, conf), "old")["react"] == "tears", row(c.catalog(outputs, conf), "old"))
try:
    c.collection_post(conf, outputs, {"op": "react", "react": "wow", "names": ["ice"]})
    check("a frozen take's reaction refused", False)
except ValueError as e:
    check("a frozen take's reaction refused", "frozen" in str(e), e)

print("test_reactions  " + ("ALL OK" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
