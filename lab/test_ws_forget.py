"""HERESY 2129 (the audit of 06.11.2026, items 10 and 13): a workspace gone takes its marks with it, so a new one of its name inherits nothing
(archived, blind, a lock, a pin, a note, its entry in the playlist and the albums); poured or merged, its entries are the other's; a rename and a
creation clean what an old one of the new name left; a named locked source lets nothing out of a move; tree = out of a workspace and its sections;
a pin of a take not in the library holds no slot; a new order of the playlist or an album keeps a take in the trash where it stood; an album
deleted leaves its own takes in the playlist; the trash says what it skipped, and what it deletes for good leaves the marks.
python3 lab/test_ws_forget.py"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as C  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def refused(body):
    try:
        post(body)
    except ValueError as e:
        return str(e)
    return ""


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    cfg, out = kit / "user", kit / "outputs"
    cfg.mkdir()
    for n in ("t1", "t2", "t3", "t4", "t5", "t6"):
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
    D = lambda: C.load(cfg)   # noqa: E731

    print("a workspace gone leaves no mark for a new one of its name")
    post({"op": "ws-add", "workspace": "Ring", "names": ["t1"]})
    post({"op": "archive", "workspace": "Ring", "on": True})
    post({"op": "ws-delete", "workspace": "Ring"})
    post({"op": "ws-create", "workspace": "Ring"})
    check("archive → delete → create: the new «Ring» is not archived", "Ring" not in D()["archived"], D()["archived"])
    post({"op": "ws-add", "workspace": "Bl / Sec", "names": ["t2"]})
    post({"op": "blind", "workspace": "Bl", "on": True})
    post({"op": "lock", "workspace": "Bl / Sec", "what": "tracks", "on": True})
    post({"op": "ws-note", "workspace": "Bl", "text": "old note"})
    post({"op": "pin", "place": "Bl", "on": True, "names": ["t2"]})
    post({"op": "playlist-add", "workspace": "Bl / Sec", "names": [], "where": "last"})
    post({"op": "album-create", "album": "Al", "names": ["@ws:Bl", "t3"]})
    post({"op": "ws-delete", "workspace": "Bl"})
    d = D()
    check("deleted with its section: no blind, lock, note or pin left behind", "Bl" not in d["blind"] and not d["locks"] and "Bl" not in d["ws_notes"] and "Bl" not in d["pins"],
          [d["blind"], d["locks"], d["ws_notes"], d["pins"]])
    check("  its entries gone from the playlist and the album", "@ws:Bl / Sec" not in d["playlist"] and d["albums"][0]["items"] == ["t3"], [d["playlist"], d["albums"]])
    post({"op": "ws-create", "workspace": "Bl / Sec"})
    check("  made again: no lock refuses its takes' way out", refused({"op": "ws-add", "workspace": "Bl / Sec", "names": ["t2"]}) == "" and
          refused({"op": "ws-remove", "workspace": "Bl / Sec", "names": ["t2"]}) == "", D()["locks"])

    print("poured and merged: their entries become the other's, once")
    post({"op": "ws-add", "workspace": "P", "names": ["t1"]})
    post({"op": "ws-add", "workspace": "P / S", "names": ["t2"]})
    post({"op": "ws-add", "workspace": "Z", "names": ["t3"]})
    post({"op": "playlist-add", "workspace": "P / S", "names": [], "where": "last"})
    post({"op": "playlist-add", "workspace": "Z", "names": [], "where": "last"})
    post({"op": "archive", "workspace": "P", "on": True})
    post({"op": "archive", "workspace": "P", "on": False})
    post({"op": "blind", "workspace": "P / S", "on": True})
    post({"op": "ws-pour", "workspace": "P", "to": "Z"})
    d = D()
    check("ws-pour: «@ws:P / S» is «@ws:Z», once", [n for n in d["playlist"] if n.startswith("@ws:")] == ["@ws:Z"], d["playlist"])
    check("  and the section's blindness gone with it", "P / S" not in d["blind"], d["blind"])
    post({"op": "ws-add", "workspace": "M", "names": ["t4"]})
    post({"op": "album-add", "album": "Al", "names": ["@ws:M"], "where": "last"})
    post({"op": "ws-merge", "workspace": "M", "to": "Z"})
    check("ws-merge: its album entry is «@ws:Z»", D()["albums"][0]["items"] == ["t3", "@ws:Z"], D()["albums"])

    print("a rename and a creation clean what an old one of the name left")
    d = D()
    d["archived"].append("Ghost"); d["blind"].append("Ghost / Sec"); d["locks"]["Ghost"] = {"tracks": True}; d["ws_notes"]["Ghost"] = "stale"
    d["playlist"].append("@ws:Ghost")
    C.save(cfg, d)
    post({"op": "ws-add", "workspace": "Live", "names": ["t5"]})
    post({"op": "ws-rename", "workspace": "Live", "to": "Ghost"})
    d = D()
    check("renamed into a name with old marks: none of them", "Ghost" not in d["archived"] and not d["locks"].get("Ghost") and "Ghost" not in d["ws_notes"]
          and d["playlist"].count("@ws:Ghost") == 0, [d["archived"], d["locks"], d["ws_notes"], d["playlist"]])
    post({"op": "ws-create", "workspace": "Ghost / Sec"})
    check("  a section made where an old one was blind: not blind", "Ghost / Sec" not in D()["blind"], D()["blind"])

    print("a move under a lock, and out of a whole tree")
    post({"op": "ws-add", "workspace": "Lk", "names": ["t6"]})
    post({"op": "lock", "workspace": "Lk", "what": "tracks", "on": True})
    said = refused({"op": "ws-move", "workspace": "Free", "from": "Lk", "names": ["t6"]})
    check("ws-move from a named locked source is refused, as ws-remove", "locked" in said and "t6" in D()["workspaces"]["Lk"], said)
    check("  from nowhere named: the locked one keeps it, the move goes on", refused({"op": "ws-move", "workspace": "Free", "names": ["t6"]}) == ""
          and "t6" in D()["workspaces"]["Lk"] and "t6" in D()["workspaces"]["Free"], D()["workspaces"])
    post({"op": "ws-create", "workspace": "Lk / Sec"})
    check("  into a section of the locked one: it stays under the lock, the move goes on (as before)",
          refused({"op": "ws-move", "workspace": "Lk / Sec", "from": "Lk", "tree": True, "names": ["t6"]}) == ""
          and "t6" in D()["workspaces"]["Lk / Sec"] and "t6" not in D()["workspaces"]["Lk"], D()["workspaces"])
    post({"op": "lock", "workspace": "Lk / Sec", "what": "workspace", "on": True})
    said = refused({"op": "ws-move", "workspace": "Lk", "from": "Lk / Sec", "names": ["t6"]})
    check("  out of a section under its own lock into its parent: refused, the section's lock does not reach the parent",
          "Lk / Sec" in said and "t6" in D()["workspaces"]["Lk / Sec"], said)
    post({"op": "lock", "workspace": "Lk / Sec", "what": "workspace", "on": False})
    post({"op": "ws-create", "workspace": "Tr / A"})
    post({"op": "ws-add", "workspace": "Tr / A", "names": ["t1"]})
    post({"op": "ws-move", "workspace": "Out", "from": "Tr", "names": ["t1"]})
    check("without tree: a section's take stays in the section (as before)", "t1" in D()["workspaces"]["Tr / A"], D()["workspaces"])
    post({"op": "ws-move", "workspace": "Out", "from": "Tr", "tree": True, "names": ["t1"]})
    check("  with tree: out of the section, into «Out»", "t1" not in D()["workspaces"]["Tr / A"] and "t1" in D()["workspaces"]["Out"], D()["workspaces"])
    post({"op": "ws-add", "workspace": "Tr / A", "names": ["t2"]})
    post({"op": "ws-remove", "workspace": "Tr", "names": ["t2"]})
    check("ws-remove without tree leaves the section's take (as before)", "t2" in D()["workspaces"]["Tr / A"], D()["workspaces"])
    post({"op": "ws-remove", "workspace": "Tr", "tree": True, "names": ["t2"]})
    check("  with tree: out of the section too", "t2" not in D()["workspaces"]["Tr / A"], D()["workspaces"])
    post({"op": "ws-add", "workspace": "Tr / A", "names": ["t3"]})
    post({"op": "lock", "workspace": "Tr / A", "what": "workspace", "on": True})
    said = refused({"op": "ws-remove", "workspace": "Tr", "tree": True, "names": ["t3"]})
    check("  a locked section refuses it, named", "Tr / A" in said and "t3" in D()["workspaces"]["Tr / A"], said)
    said = refused({"op": "ws-move", "workspace": "Out", "from": "Tr", "tree": True, "names": ["t3"]})
    check("  and a tree move too", "Tr / A" in said and "t3" in D()["workspaces"]["Tr / A"], said)
    post({"op": "lock", "workspace": "Tr / A", "what": "workspace", "on": False})

    print("pins count the takes in the library only")
    d = D()
    d["pins"][""] = ["t1", "t2", "t3", "gone"]
    C.save(cfg, d)
    cat = C.catalog(out, cfg)
    check("the catalogue lists no pin of a take that is not here", cat["pins"][""] == ["t1", "t2", "t3"], cat["pins"])
    check("  a fourth pin goes in: the unseen one held no slot", refused({"op": "pin", "place": "", "on": True, "names": ["t4"]}) == "" and D()["pins"][""] == ["t1", "t2", "t3", "t4"], D()["pins"])
    check("  a fifth is still refused", "unpin one first" in refused({"op": "pin", "place": "", "on": True, "names": ["t5"]}), D()["pins"])

    print("a new order keeps a take in the trash where it stood")
    d = D()
    d["playlist"] = ["t1", "t2", "t4"]
    d["albums"] = [{"name": "Ord", "items": ["t1", "t2", "t4"]}]
    C.save(cfg, d)
    C.trash_move(kit, out, ["t4"], cfg)
    post({"op": "playlist-order", "names": ["t2", "t1"]})
    post({"op": "album-order", "album": "Ord", "names": ["t2", "t1"]})
    check("the playlist and the album hold t4 at its place", D()["playlist"] == ["t2", "t1", "t4"] and D()["albums"][0]["items"] == ["t2", "t1", "t4"], [D()["playlist"], D()["albums"]])
    item = [i for i in C.trash_list(kit)["items"] if i["name"] == "t4"]
    C.trash_restore(kit, out, item, cfg)
    cat = C.catalog(out, cfg)
    check("  given back, it is there again", cat["playlist"] == ["t2", "t1", "t4"] and cat["albums"][0]["items"] == ["t2", "t1", "t4"], [cat["playlist"], cat["albums"]])
    d = D()
    d["playlist"] = ["t1", "nowhere", "t2", "t4"]
    C.save(cfg, d)
    post({"op": "playlist-order", "names": ["t4", "t2", "t1"]})
    check("  an entry gone for good (not in the trash) leaves, as before", D()["playlist"] == ["t4", "t2", "t1"], D()["playlist"])

    print("an album deleted leaves its own takes in the playlist")
    d = D()
    d["playlist"] = ["t1"]
    d["albums"] = [{"name": "Gone", "items": ["t1", "t5", "t2", "@ws:Ghost"]}, {"name": "Other", "items": ["t2"]}]
    C.save(cfg, d)
    post({"op": "album-delete", "album": "Gone"})
    check("t5 (only there) and the workspace's entry join the playlist's end; t1 and t2 (elsewhere) not twice",
          D()["playlist"] == ["t1", "t5", "@ws:Ghost"], D()["playlist"])
    d = D()
    d["playlist"] = ["@ws:Ghost"]
    d["albums"] = [{"name": "In", "items": ["t5", "t6"]}]
    C.save(cfg, d)
    post({"op": "album-delete", "album": "In"})
    check("  a take inside a whole workspace's entry stays there, not added again", D()["playlist"] == ["@ws:Ghost", "t6"], D()["playlist"])

    print("the trash says what it skipped, and what it deletes leaves the marks")
    post({"op": "lock", "workspace": "Lk", "what": "tracks", "on": False})
    r = C.trash_move(kit, out, ["t6", "nope"], cfg)
    check("a take not in the library is said", r["moved"] == ["t6"] and r.get("missing") == [{"name": "nope", "why": "not in the library"}], r)
    it6 = [i for i in C.trash_list(kit)["items"] if i["name"] == "t6"]
    (out / "t6").mkdir()
    (out / "t6" / "meta.json").write_text("{}", encoding="utf-8")
    r = C.trash_restore(kit, out, it6, cfg)
    check("  given back over a live take of that name: skipped, said", r["restored"] == [] and r.get("skipped") and r["skipped"][0]["name"] == "t6", r)
    shutil.rmtree(out / "t6")
    d = D()
    d["pins"]["Free"] = ["t6"]
    d["albums"] = [{"name": "Keep", "items": ["t6", "t1"], "cover": "t6"}]
    C.save(cfg, d)
    r = C.trash_empty(kit, it6 + [{"day": "1999-01-01", "name": "never"}], config_dir=cfg)
    d = D()
    check("  emptied by the list given; an item not there said absent", r["emptied"] == ["t6"] and r.get("absent") == [{"day": "1999-01-01", "name": "never"}], r)
    check("  t6 gone from the pins, the workspaces, the playlist and the album (its cover too)", "Free" not in d["pins"] and all("t6" not in v for v in d["workspaces"].values())
          and "t6" not in d["playlist"] and d["albums"][0] == {"name": "Keep", "items": ["t1"]}, [d["pins"], d["playlist"], d["albums"]])

print("test_ws_forget:", "all passed" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
