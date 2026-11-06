"""HERESY 2049: a workspace archived (its sections with it): its takes marked archived unless also in a workspace not archived; the catalogue lists
it; a rename carries it; back again; a workspace that is not there refused.   python3 lab/test_archive.py"""
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
    post({"op": "ws-add", "workspace": "Old", "names": ["t1", "t2"]})
    post({"op": "ws-create", "workspace": "Old / Live"})
    post({"op": "ws-add", "workspace": "Old / Live", "names": ["t3"]})
    post({"op": "ws-add", "workspace": "Now", "names": ["t2"]})
    post({"op": "archive", "workspace": "Old", "on": True})
    cat = C.catalog(out, cfg)
    arc = {r["name"]: r["archived"] for r in cat["takes"]}
    check("archived: the catalogue lists it", cat["archived"] == ["Old"], cat["archived"])
    check("its takes and its section's marked archived; one also in «Now» not", arc == {"t1": True, "t2": False, "t3": True}, arc)
    post({"op": "ws-rename", "workspace": "Old", "to": "Older"})
    check("a rename carries it", C.load(cfg)["archived"] == ["Older"], C.load(cfg)["archived"])
    post({"op": "archive", "workspace": "Older", "on": False})
    arc = {r["name"]: r["archived"] for r in C.catalog(out, cfg)["takes"]}
    check("back again: nothing archived", C.load(cfg)["archived"] == [] and not any(arc.values()), (C.load(cfg)["archived"], arc))
    try:
        post({"op": "archive", "workspace": "Nowhere", "on": True}); said = ""
    except ValueError as e:
        said = str(e)
    check("a workspace that is not there is refused", said == "archive an existing workspace", said)
    post({"op": "archive", "workspace": "Older", "on": True})
    post({"op": "archive", "workspace": "Older / Live", "on": False})
    check("bringing a section back is its root's word: the archive stays whole", C.load(cfg)["archived"] == ["Older"], C.load(cfg)["archived"])

print("\n" + ("all well" if not bad else str(len(bad)) + " failed"))
sys.exit(1 if bad else 0)
