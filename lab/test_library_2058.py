"""HERESY 2058: the catalog's instrumental flag (an Instrumental style, or lyrics without a word to sing; no lyrics key says nothing); an album holding a
whole workspace as one item (made with it, added, ordered, out again; a rename carries it; the catalogue lists it while the workspace is here); an
album's cover chosen (listed while its take is here, Automatic again with "", a take not in the library refused).   python3 lab/test_library_2058.py"""
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
    reqs = {"t1": {"style": "Instrumental, cinematic strings, no vocals", "lyrics": "[Intro]\n[Verse]"}, "t2": {"style": "rock", "lyrics": "[Verse]\nla la"},
            "t3": {"style": "ambient", "lyrics": "[Intro]\n\n[Outro]"}, "t4": {"style": "pop"}}
    for n, rq in reqs.items():
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
        (out / n / "request.json").write_text(json.dumps(rq), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
    al = lambda: C.load(cfg)["albums"]   # noqa: E731
    flags = {r["name"]: r["instrumental"] for r in C.catalog(out, cfg)["takes"]}
    check("instrumental: an Instrumental style, and lyrics of tags only; not a song with words, not a request without lyrics",
          flags == {"t1": True, "t2": False, "t3": True, "t4": False}, flags)
    post({"op": "ws-create", "workspace": "W"})
    post({"op": "ws-add", "workspace": "W", "names": ["t2", "t3"]})
    post({"op": "album-create", "album": "A", "names": ["t1", "@ws:W", "@ws:Nope"]})
    check("an album made with a take and a whole workspace (a workspace not here left out)", al() == [{"name": "A", "items": ["t1", "@ws:W"]}], al())
    post({"op": "album-create", "album": "B"})
    post({"op": "album-add", "album": "B", "names": ["@ws:W"], "where": "last"})
    post({"op": "album-add", "album": "B", "names": ["t4", "@ws:W"], "where": "first"})
    check("a whole workspace added to an album once", al()[1]["items"] == ["t4", "@ws:W"], al())
    post({"op": "album-order", "album": "B", "names": ["@ws:W", "t4"]})
    check("ordered with it", al()[1]["items"] == ["@ws:W", "t4"], al())
    post({"op": "ws-rename", "workspace": "W", "to": "W2"})
    check("a rename carries it in every album", al()[0]["items"] == ["t1", "@ws:W2"] and al()[1]["items"] == ["@ws:W2", "t4"], al())
    cat = C.catalog(out, cfg)["albums"]
    check("the catalogue lists it while the workspace is here", cat[0] == {"name": "A", "items": ["t1", "@ws:W2"]}, cat)
    post({"op": "album-remove", "album": "B", "names": ["@ws:W2"]})
    check("out of an album, whole", al()[1]["items"] == ["t4"], al())
    post({"op": "album-cover", "album": "A", "take": "t1"})
    cat = C.catalog(out, cfg)["albums"]
    check("a cover chosen: kept and listed", al()[0].get("cover") == "t1" and cat[0].get("cover") == "t1", cat)
    post({"op": "album-rename", "album": "A", "to": "A2"})
    check("a renamed album keeps its cover", al()[0] == {"name": "A2", "items": ["t1", "@ws:W2"], "cover": "t1"}, al())
    try:
        post({"op": "album-cover", "album": "A2", "take": "nope"}); said = ""
    except ValueError as e:
        said = str(e)
    check("a take not in the library refused as a cover", "in the library" in said, said)
    post({"op": "album-cover", "album": "A2", "take": ""})
    cat = C.catalog(out, cfg)["albums"]
    check("Automatic again: no cover kept, none listed", "cover" not in al()[0] and "cover" not in cat[0], cat)
    post({"op": "ws-delete", "workspace": "W2"})
    cat = C.catalog(out, cfg)["albums"]
    check("a workspace gone: the catalogue leaves it out of the album", cat[0]["items"] == ["t1"], cat)

print("\n" + ("all well" if not bad else str(len(bad)) + " failed"))
sys.exit(1 if bad else 0)
