"""HERESY 1988: a take's family tree (lab/lineage.py) on a library of our own making: the chain up to the oldest take still here, every descendant
under it, what each is of its parent (its own word, its name's last word, an import, the Library's regeneration), what the Refiner made inside each,
a parent gone said, a name that is no take refused, the index read again when a take comes.   python3 lab/test_lineage.py"""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lineage  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def take(out, name, parent="", what="", model="", created=0, derived=()):
    d = out / name
    d.mkdir(parents=True)
    json.dump({"title": name.upper(), "created": created, "model": model}, open(d / "meta.json", "w"))
    json.dump(dict({"title": name}, **({"parent": parent} if parent else {}), **({"what": what} if what else {})), open(d / "request.json", "w"))
    for i, (kind, source) in enumerate(derived):
        m = d / "derived" / f"{kind}-{i}"
        m.mkdir(parents=True)
        json.dump({"id": f"{kind}-{i}", "kind": kind, "parent": name, "source": source, **({"when": 1793000000 + i} if i else {"created": "2026-10-24 19:28"})},
                  open(m / "manifest.json", "w"))


with tempfile.TemporaryDirectory() as d:
    kit = Path(d)
    out = kit / "outputs"
    take(out, "20261001-a", created=1, derived=[("stems", "the take"), ("remaster", "derived/stems-0/vocals.flac")])
    take(out, "20261002-a-trim", parent="20261001-a", created=2)
    take(out, "20261003-b", parent="20261002-a-trim", what="a section replaced", created=3, derived=[("upscale", "the take")])
    take(out, "20261004-01-import-a", parent="20261001-a", model="import", created=4)
    take(out, "20261005-c", created=5)
    take(out, "20261006-orphan", parent="20250101-gone", created=6)
    t = lineage.tree(kit, "20261003-b", {"20261005-c": "20261003-b"})
    r = t["root"]
    check("the chain up to the oldest take here, the take asked the focus", t["ancestors"] == ["20261001-a", "20261002-a-trim"] and t["focus"] == "20261003-b" and r["name"] == "20261001-a", t)
    kids = [k["name"] for k in r["children"]]
    check("  every descendant under the root, oldest first", kids == ["20261002-a-trim", "20261004-01-import-a"], kids)
    trim = r["children"][0]
    b = trim["children"][0]
    check("  what each is of its parent: the name's word, its own word, an import, the Library's regeneration",
          trim["what"] == "trimmed to the text" and b["what"] == "a section replaced" and r["children"][1]["what"] == "imported as a version of it" and
          b["children"][0]["name"] == "20261005-c" and b["children"][0]["what"] == "made again with a new seed", (trim["what"], b["what"], r["children"][1]["what"], b["children"]))
    check("  what the Refiner made inside each, oldest first, with what it came from",
          [(x["kind"], x["source"]) for x in r["derived"]] == [("stems", "the take"), ("remaster", "derived/stems-0/vocals.flac")] and [x["kind"] for x in b["derived"]] == ["upscale"], r["derived"])
    check("  a version's time from the Refiner's own words («2026-10-24 19:28») or its number", r["derived"][0]["when"] == int(time.mktime(time.strptime("2026-10-24 19:28", "%Y-%m-%d %H:%M"))) and
          r["derived"][1]["when"] == 1793000001, r["derived"])
    check("  titles from the takes' own meta", r["title"] == "20261001-A" and b["title"] == "20261003-B", (r["title"], b["title"]))
    o = lineage.tree(kit, "20261006-orphan")
    check("a parent no longer in the library: said, the take its own root", o["gone_parent"] == "20250101-gone" and o["root"]["name"] == "20261006-orphan" and o["ancestors"] == [], o)
    s = lineage.tree(kit, "20261005-c")
    check("without the Library's word a take stands alone", s["root"]["name"] == "20261005-c" and s["root"]["children"] == [], s)
    for bad in ("../etc", "", "a/b"):
        try:
            lineage.tree(kit, bad); said = ""
        except ValueError as e:
            said = str(e)
        check(f"  no take refused: {bad!r}", "no such take" in said, said)
    try:
        lineage.tree(kit, "20991231-none"); said = ""
    except FileNotFoundError as e:
        said = str(e)
    check("  a name not in the library: not found", "no such take" in said, said)
    time.sleep(0.02)
    take(out, "20261007-a-replay", parent="20261001-a", created=7)
    os.utime(out, None)
    t2 = lineage.tree(kit, "20261001-a")
    check("a take come since: the index read again", [k["name"] for k in t2["root"]["children"]][-1] == "20261007-a-replay" and t2["root"]["children"][-1]["what"] == "sung again", t2["root"]["children"])
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
