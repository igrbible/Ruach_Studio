"""HERESY 2050: the playlist's albums: made with takes, a take added once, renamed, ordered (its own takes only), a take out, the catalogue lists
them with the takes still there, deleted (the takes stay), a second of one name refused.   python3 lab/test_albums.py"""
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
        (out / n / "request.json").write_text("{}", encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
    al = lambda: C.load(cfg)["albums"]   # noqa: E731
    post({"op": "album-create", "album": "  Ballads  ", "names": ["t1", "nope"]})
    check("made with its takes (a take that is not there left out), its name trimmed", al() == [{"name": "Ballads", "items": ["t1"]}], al())
    post({"op": "album-add", "album": "Ballads", "names": ["t2", "t1"], "where": "last"})
    check("a take added once: t1 stays where it was", al()[0]["items"] == ["t1", "t2"], al())
    post({"op": "album-add", "album": "Ballads", "names": ["t3"], "where": "first"})
    check("first: at the top", al()[0]["items"] == ["t3", "t1", "t2"], al())
    try:
        post({"op": "album-order", "album": "Ballads", "names": ["t1", "t2"]}); said = ""
    except ValueError as e:
        said = str(e)
    check("an order that leaves one out is refused", "each once" in said, said)
    post({"op": "album-order", "album": "Ballads", "names": ["t2", "t3", "t1"]})
    check("dragged: the order kept", al()[0]["items"] == ["t2", "t3", "t1"], al())
    post({"op": "album-rename", "album": "Ballads", "to": "Ballads II"})
    post({"op": "album-remove", "album": "Ballads II", "names": ["t3"]})
    cat = C.catalog(out, cfg)["albums"]
    check("renamed, a take out; the catalogue lists it", cat == [{"name": "Ballads II", "items": ["t2", "t1"]}], cat)
    try:
        post({"op": "album-create", "album": "Ballads II"}); said = ""
    except ValueError as e:
        said = str(e)
    check("a second album of one name is refused", "there already" in said, said)
    post({"op": "album-delete", "album": "Ballads II"})
    check("deleted: no album, the takes still there", al() == [] and (out / "t1").is_dir(), al())

print("\n" + ("all well" if not bad else str(len(bad)) + " failed"))
sys.exit(1 if bad else 0)
