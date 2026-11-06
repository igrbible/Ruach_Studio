"""HERESY 2042: a whole workspace in the playlist, one entry: added (first, last), a section too, never «Outside workspaces» nor one that is not
there, renamed with its workspace, dragged, taken out whole, gone from the list when its workspace is gone. python3 lab/test_playlist_ws.py"""
import json
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


with tempfile.TemporaryDirectory() as tmp:
    cfg, out = Path(tmp) / "user", Path(tmp) / "outputs"
    cfg.mkdir()
    for n in ("t1", "t2", "t3"):
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
    post({"op": "ws-add", "workspace": "Album", "names": ["t1"]})
    post({"op": "ws-create", "workspace": "Album / Live"})
    post({"op": "ws-add", "workspace": "Album / Live", "names": ["t2"]})
    post({"op": "playlist-add", "names": ["t3"], "where": "last"})
    post({"op": "playlist-add", "workspace": "Album", "names": [], "where": "first"})
    pl = C.load(cfg)["playlist"]
    check("a workspace goes in as one entry, first", pl == ["@ws:Album", "t3"], pl)
    post({"op": "playlist-add", "workspace": "Album / Live", "names": [], "where": "last"})
    pl = C.load(cfg)["playlist"]
    check("a section too, its «/» kept", pl == ["@ws:Album", "t3", "@ws:Album / Live"], pl)
    try:
        post({"op": "playlist-add", "workspace": "Nowhere", "names": [], "where": "last"}); said = ""
    except ValueError as e:
        said = str(e)
    check("a workspace that is not there is refused", said == "no such workspace", said)
    try:
        post({"op": "playlist-add", "workspace": "", "names": [], "where": "last"}); said = ""
    except ValueError as e:
        said = str(e)
    check("«Outside workspaces» (no name) adds nothing", said == "no such take", said)
    post({"op": "playlist-order", "names": ["t3", "@ws:Album / Live", "@ws:Album"]})
    pl = C.load(cfg)["playlist"]
    check("dragged: the order kept, the section's entry with it", pl == ["t3", "@ws:Album / Live", "@ws:Album"], pl)
    post({"op": "ws-rename", "workspace": "Album", "to": "Album 2"})
    pl = C.load(cfg)["playlist"]
    check("renamed: its entry and its section's follow", pl == ["t3", "@ws:Album 2 / Live", "@ws:Album 2"], pl)
    post({"op": "playlist-remove", "names": ["@ws:Album 2 / Live"]})
    pl = C.load(cfg)["playlist"]
    check("× takes the section out whole; its take stays in its workspace", pl == ["t3", "@ws:Album 2"] and "t2" in C.load(cfg)["workspaces"]["Album 2 / Live"], pl)
    try:
        post({"op": "ws-add", "workspace": "Album 2", "names": ["@ws:Album 2"]}); w = C.load(cfg)["workspaces"]["Album 2"]
    except ValueError:
        w = C.load(cfg)["workspaces"]["Album 2"]
    check("a «@ws:» name never reaches another op (no workspace gets it as a take)", "@ws:Album 2" not in w, w)
    cat = C.catalog(out, cfg)
    check("the catalog lists the workspace's entry", cat["playlist"] == ["t3", "@ws:Album 2"], cat["playlist"])
    d = C.load(cfg)
    d["workspaces"].pop("Album 2", None)
    d["workspaces"].pop("Album 2 / Live", None)
    C.save(cfg, d)
    cat = C.catalog(out, cfg)
    check("its workspace gone, the entry is gone from the list", cat["playlist"] == ["t3"], cat["playlist"])

print("test_playlist_ws:", "all passed" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
