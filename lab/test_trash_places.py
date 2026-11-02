"""HERESY 1996: a take going to the trash keeps where it stood; given back it stands there again, its workspaces and sections made again when they
are gone (a workspace deleted with its takes), the ones still there kept; a take that stood nowhere comes back as it was.   python3 lab/test_trash_places.py"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import collection  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


with tempfile.TemporaryDirectory() as d:
    kit = Path(d)
    out, cfg = kit / "outputs", kit / "user"
    out.mkdir()
    cfg.mkdir()
    for n in ("a", "b", "c"):
        (out / n).mkdir()
        (out / n / "meta.json").write_text(json.dumps({"title": n.upper()}))
    m = collection.load(cfg)
    m["workspaces"] = {"Lamp": ["a"], "Lamp / Gospel": ["a", "b"], "Keep": ["b"]}
    collection.save(cfg, m)
    r = collection.trash_move(kit, out, ["a", "b", "c"], cfg)
    check("three takes to the trash", sorted(r["moved"]) == ["a", "b", "c"], r)
    items = collection.trash_list(kit)["items"]
    places = {i["name"]: json.load(open(collection.trash_dir(kit) / i["day"] / i["name"] / ".places.json"))["workspaces"]
              for i in items if (collection.trash_dir(kit) / i["day"] / i["name"] / ".places.json").is_file()}
    check("  each keeps where it stood (c stood nowhere)", places == {"a": ["Lamp", "Lamp / Gospel"], "b": ["Keep", "Lamp / Gospel"]}, places)
    m = collection.load(cfg)
    for w in ("Lamp", "Lamp / Gospel"):                   # the workspace deleted, its section with it, as ws-delete does
        m["workspaces"].pop(w)
    collection.save(cfg, m)
    r = collection.trash_restore(kit, out, [{"day": i["day"], "name": i["name"]} for i in items], cfg)
    m = collection.load(cfg)
    check("everything back, each where it stood: the workspace and its section made again, the one still there kept",
          sorted(r["restored"]) == ["a", "b", "c"] and r["made_again"] == ["Lamp", "Lamp / Gospel"] and m["workspaces"]["Lamp"] == ["a"] and
          m["workspaces"]["Lamp / Gospel"] == ["a", "b"] and m["workspaces"]["Keep"] == ["b"], (r, m["workspaces"]))
    check("  no .places.json left in the library", not any((out / n / ".places.json").exists() for n in "abc") and all((out / n / "meta.json").is_file() for n in "abc"))
    r = collection.trash_restore(kit, out, [{"day": "x", "name": "nothing"}], cfg)
    check("  nothing there: nothing back, nothing made", r == {"restored": [], "made_again": []}, r)
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
