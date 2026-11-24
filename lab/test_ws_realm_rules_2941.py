"""HERESY 2941 (Viktor 22.11.2026: «в ПЕРЕМЕСТИТЬ в пространство, если песня, и она оригинально принадлежит музыкальному миру, в списке не должны
появляться пространства из Чтеца, и наоборот. А вот ДОБАВИТЬ в пространство — это легитимно линковать и в другой мир. Ну и дальше, внутренние связи
и логику по пространствам и их связи по трекам нужно перепроверить и зафиксить»): the lab's rules between workspaces and takes, end to end, each
locked here. No lab, no card: a folder of takes in a temporary Studio.

The rules (lab/collection.py):
 1. A take's realm is its root's (root_realms); a workspace's is its top's (realm_ws), the Narrator's when made from its realm.
 2. ws-add links a take into any workspace, of either realm; the take keeps its home.
 3. ws-move keeps a take in its realm: into the other realm's workspace only when it comes from that realm's workspace (a link moved there).
 4. ws-move from nowhere named takes the take out of every other workspace of the realm it moves in; its links in the other realm stay.
 5. ws-move from a named workspace takes it out of that one (and its sections with tree), nowhere else.
 6. A frozen workspace takes nothing and lets nothing go; a frozen take (in frozen workspaces alone) is not moved, added, removed or pinned.
 7. A locked workspace lets nothing out (remove, a named move); a move from nowhere passes it by and it keeps its own.
 8. An add or a move that makes a workspace takes the emoji chosen beside its name; one already there keeps its own.
 9. A rename carries the realm, the emoji, the pins, the note, the archive, the locks; a delete drops them, and one made later of that name is born clean.
10. Pour and merge never join two realms; a section never goes under the other realm's top.
11. A pin holds only a take of its workspace's tree; a take moved or taken out leaves no pin behind.
12. The catalog lists a take in each workspace it stands in, once each, sorted."""
import json
import sys
import tempfile
from pathlib import Path

import collection as C

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def refused(f):
    try:
        f()
    except ValueError as e:
        return str(e)
    return ""


def take(out, name, req=None, meta=None):
    d = out / name
    d.mkdir(parents=True)
    (d / "meta.json").write_text(json.dumps(dict({"title": name, "created": 1, "seconds": 1.0}, **(meta or {}))), encoding="utf-8")
    (d / "request.json").write_text(json.dumps(req or {"style": "x", "lyrics": ""}), encoding="utf-8")


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    out, cfg = kit / "outputs", kit / "user"
    cfg.mkdir()
    take(out, "song")
    take(out, "song2")
    take(out, "read", {"reader": {"mode": "narration"}}, {"model": "reader", "no_train": True})
    take(out, "read-fix", {"parent": "read"})
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
    wsof = lambda: {r["name"]: r["workspaces"] for r in C.catalog(out, cfg)["takes"]}   # noqa: E731

    print("1 · realms")
    post({"op": "ws-create", "workspace": "Songs"})
    post({"op": "ws-create", "workspace": "Album"})
    post({"op": "ws-create", "workspace": "Book", "realm": "reader"})
    post({"op": "ws-create", "workspace": "Book / Ch 1", "realm": "reader"})
    cat = C.catalog(out, cfg)
    realm = {r["name"]: r["realm"] for r in cat["takes"]}
    check("a reading and its version are the Narrator's, the songs the Musician's", realm == {"song": "creator", "song2": "creator", "read": "reader", "read-fix": "reader"}, realm)
    check("a top made from the Narrator's realm is the Narrator's, its section with it", cat["ws_realm"] == {"Book": "reader"}
          and C.realm_ws(C.load(cfg), "Book / Ch 1") == "reader", cat["ws_realm"])

    print("2 · an add links across")
    post({"op": "ws-add", "workspace": "Songs", "names": ["song", "song2"]})
    post({"op": "ws-add", "workspace": "Book / Ch 1", "names": ["read"]})
    post({"op": "ws-add", "workspace": "Book / Ch 1", "names": ["song"]})          # a soundtrack linked into the book
    check("the song stands in its own workspace and, linked, in the book's section", wsof()["song"] == ["Book / Ch 1", "Songs"], wsof()["song"])

    print("3 · a move stays in its realm")
    why = refused(lambda: post({"op": "ws-move", "workspace": "Book", "names": ["song2"], "from": "Songs"}))
    check("a song moved into the Narrator's workspace is refused, a link offered", "link them" in why, why)
    why = refused(lambda: post({"op": "ws-move", "workspace": "Album", "names": ["read"], "from": "Book / Ch 1"}))
    check("a reading moved into the Musician's workspace is refused", "belong to the Narrator" in why, why)
    post({"op": "ws-move", "workspace": "Book", "names": ["song"], "from": "Book / Ch 1"})
    check("a link moved within the Narrator's realm is a link still", wsof()["song"] == ["Book", "Songs"], wsof()["song"])
    post({"op": "ws-move", "workspace": "Book / Ch 1", "names": ["song"], "from": "Book"})

    print("4 · a move from nowhere named keeps the links")
    post({"op": "ws-move", "workspace": "Album", "names": ["song"]})
    check("the song left «Songs» for «Album» and its link in the book stays", wsof()["song"] == ["Album", "Book / Ch 1"], wsof()["song"])
    post({"op": "ws-add", "workspace": "Songs", "names": ["read-fix"]})            # a reading linked among the songs
    post({"op": "ws-add", "workspace": "Book", "names": ["read-fix"]})
    post({"op": "ws-move", "workspace": "Book / Ch 1", "names": ["read-fix"]})
    check("a reading moved from nowhere leaves the Narrator's other workspaces, its link among the songs stays", wsof()["read-fix"] == ["Book / Ch 1", "Songs"], wsof()["read-fix"])

    print("5 · a move from a named workspace")
    post({"op": "ws-add", "workspace": "Songs", "names": ["song"]})
    post({"op": "ws-move", "workspace": "Songs", "names": ["song2"], "from": "Songs"})   # into itself: nothing lost
    check("a move into the workspace it comes from keeps it there", "Songs" in wsof()["song2"], wsof()["song2"])
    post({"op": "ws-move", "workspace": "Album", "names": ["song"], "from": "Songs"})
    check("out of the named one only: «Album» and the link stay", wsof()["song"] == ["Album", "Book / Ch 1"], wsof()["song"])

    print("6 · frozen")
    post({"op": "ws-create", "workspace": "Ice"})
    post({"op": "ws-add", "workspace": "Ice", "names": ["song2"]})
    post({"op": "freeze", "workspace": "Ice", "on": True})
    check("nothing added into a frozen workspace", "is frozen" in refused(lambda: post({"op": "ws-add", "workspace": "Ice", "names": ["song"]})))
    check("nothing moved out of a frozen workspace named", "is frozen" in refused(lambda: post({"op": "ws-move", "workspace": "Album", "names": ["song2"], "from": "Ice"})))
    post({"op": "ws-move", "workspace": "Album", "names": ["song2"]})
    check("a move from nowhere leaves the frozen one its take", wsof()["song2"] == ["Album", "Ice"], wsof()["song2"])
    post({"op": "ws-remove", "workspace": "Album", "names": ["song2"]})
    check("a take in frozen workspaces alone is frozen: not added anywhere", "frozen with its workspace" in refused(lambda: post({"op": "ws-add", "workspace": "Album", "names": ["song2"]})))
    check("  nor pinned", "frozen with its workspace" in refused(lambda: post({"op": "pin", "place": "Ice", "on": True, "names": ["song2"]})))
    post({"op": "freeze", "workspace": "Ice", "on": False})

    print("7 · locked")
    post({"op": "ws-add", "workspace": "Songs", "names": ["song2"]})
    post({"op": "lock", "workspace": "Songs", "what": "tracks", "on": True})
    check("a locked workspace lets nothing out", "is locked" in refused(lambda: post({"op": "ws-remove", "workspace": "Songs", "names": ["song2"]})))
    check("  nor a named move out of it", "is locked" in refused(lambda: post({"op": "ws-move", "workspace": "Album", "names": ["song2"], "from": "Songs"})))
    post({"op": "ws-move", "workspace": "Album", "names": ["song2"]})
    check("a move from nowhere passes it by: it keeps its own", "Songs" in wsof()["song2"] and "Album" in wsof()["song2"], wsof()["song2"])
    post({"op": "lock", "workspace": "Songs", "what": "tracks", "on": False})

    print("8 · the emoji of a workspace an add or a move makes")
    post({"op": "ws-add", "workspace": "Demos", "names": ["song"], "emoji": "🎸"})
    check("an add that makes it keeps its emoji", C.load(cfg)["ws_emoji"].get("Demos") == "🎸", C.load(cfg)["ws_emoji"])
    post({"op": "ws-move", "workspace": "Mixes", "names": ["song2"], "from": "Album", "emoji": "🎚"})
    check("a move that makes it too", C.load(cfg)["ws_emoji"].get("Mixes") == "🎚", C.load(cfg)["ws_emoji"])
    post({"op": "ws-add", "workspace": "Demos", "names": ["song2"], "emoji": "🥁"})
    check("one already there keeps its own", C.load(cfg)["ws_emoji"].get("Demos") == "🎸", C.load(cfg)["ws_emoji"])
    post({"op": "ws-move", "workspace": "Drafts", "names": ["read-fix"], "from": "Book / Ch 1", "emoji": "📖", "realm": "reader"})
    check("a move from the Narrator's realm makes the Narrator's workspace, with its emoji", C.realm_ws(C.load(cfg), "Drafts") == "reader"
          and C.load(cfg)["ws_emoji"].get("Drafts") == "📖", (C.load(cfg)["ws_realm"], C.load(cfg)["ws_emoji"]))
    check("a mark of the Studio's is no emoji", refused(lambda: post({"op": "ws-add", "workspace": "Gems", "names": ["song"], "emoji": "💎"})) != "")
    check("  and nothing was made", "Gems" not in C.load(cfg)["workspaces"])

    print("9 · rename and delete")
    post({"op": "pin", "place": "Demos", "on": True, "names": ["song"]})
    post({"op": "ws-note", "workspace": "Demos", "text": "first cuts"})
    post({"op": "ws-rename", "workspace": "Demos", "to": "Demos 2"})
    d = C.load(cfg)
    check("a rename carries the emoji, the pin and the note", d["ws_emoji"].get("Demos 2") == "🎸" and d["pins"].get("Demos 2") == ["song"]
          and d["ws_notes"].get("Demos 2") == "first cuts" and "Demos" not in d["ws_emoji"], (d["ws_emoji"], d["pins"], d["ws_notes"]))
    post({"op": "ws-rename", "workspace": "Drafts", "to": "Drafts R"})
    check("a Narrator's top renamed stays the Narrator's", C.realm_ws(C.load(cfg), "Drafts R") == "reader")
    post({"op": "ws-delete", "workspace": "Demos 2"})
    d = C.load(cfg)
    check("a delete drops its marks, its takes stay in the library", "Demos 2" not in d["ws_emoji"] and "Demos 2" not in d["pins"]
          and "song" in {r["name"] for r in C.catalog(out, cfg)["takes"]}, (d["ws_emoji"], d["pins"]))
    post({"op": "ws-create", "workspace": "Demos 2"})
    check("one made later of that name is born clean", "Demos 2" not in C.load(cfg)["ws_emoji"] and "Demos 2" not in C.load(cfg)["ws_notes"])

    print("10 · two realms never joined")
    check("pour across realms refused", "two realms" in refused(lambda: post({"op": "ws-pour", "workspace": "Mixes", "to": "Book"})))
    check("merge across realms refused", "two realms" in refused(lambda: post({"op": "ws-merge", "workspace": "Mixes", "to": "Drafts R"})))
    check("a section under the other realm's top refused", "stays in its realm" in refused(lambda: post({"op": "ws-rename", "workspace": "Book / Ch 1", "to": "Album / Ch 1"})))

    print("11 · pins follow their takes")
    post({"op": "ws-add", "workspace": "Album", "names": ["song"]})
    post({"op": "pin", "place": "Album", "on": True, "names": ["song"]})
    post({"op": "ws-move", "workspace": "Mixes", "names": ["song"], "from": "Album"})
    check("a take moved out leaves no pin behind", "song" not in (C.load(cfg)["pins"].get("Album") or []), C.load(cfg)["pins"])

    print("12 · the catalog")
    ws = wsof()
    check("each take once in each workspace, sorted", all(v == sorted(set(v)) for v in ws.values()), ws)

print("FAILED " + str(len(bad)) if bad else "all passed")
sys.exit(1 if bad else 0)
