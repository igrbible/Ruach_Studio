"""HERESY 2284: a workspace made by ws-add (and ws-move, ws-merge into a new name) keeps ws-create's PART_MAX characters a level (32 then, 56
since 09.11.2026); a decode script's ws-add made «🧪 VAE-RS · понедельник 09.11 на слух» (36 characters) after ws-create had refused it. A workspace already there takes takes
whatever its length; the API refuses such a name before its job, not after.
python3 lab/test_ws_name_2284.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as C  # noqa: E402
import api  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


LONG = ("\U0001f9ea VAE-RS \u00b7 понедельник 09.11 на слух " * 4)[:C.PART_MAX + 4].strip()   # the name of 09.11, made past any limit
with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    cfg, out = kit / "user", kit / "outputs"
    cfg.mkdir()
    for n in ("t1", "t2", "t3"):
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731

    def refused(body):
        try:
            post(body)
        except ValueError as e:
            return str(e)
        return ""

    ws = lambda: C.load(cfg)["workspaces"]   # noqa: E731
    check("the name is past PART_MAX", len(LONG) > C.PART_MAX, len(LONG))
    check("ws-create refuses it", f"{C.PART_MAX} characters" in refused({"op": "ws-create", "workspace": LONG}))
    check("ws-add refuses to make it", f"{C.PART_MAX} characters" in refused({"op": "ws-add", "workspace": LONG, "names": ["t1"]}), ws())
    check("and made nothing", LONG not in ws(), ws())
    check("ws-add of a section past PART_MAX under a short one refused",
          f"{C.PART_MAX} characters" in refused({"op": "ws-add", "workspace": "Short / " + "x" * (C.PART_MAX + 1), "names": ["t1"]}) and "Short" not in ws(), ws())
    post({"op": "ws-add", "workspace": "Fine", "names": ["t1"]})
    check("ws-move into a new long one refused", f"{C.PART_MAX} characters" in refused({"op": "ws-move", "workspace": LONG, "from": "Fine", "names": ["t1"]}))
    check("ws-merge into a new long one refused", f"{C.PART_MAX} characters" in refused({"op": "ws-merge", "workspace": "Fine", "to": LONG}))
    check("Fine kept its take", ws().get("Fine") == ["t1"], ws())
    check("ws-add of PART_MAX makes it", not refused({"op": "ws-add", "workspace": "y" * C.PART_MAX, "names": ["t2"]}) and ws().get("y" * C.PART_MAX) == ["t2"], ws())
    # one made before the rule (or by hand) still takes takes
    p = cfg / "collection.json"
    if not p.exists():
        p = next(cfg.rglob("*.json"))
    d = json.loads(p.read_text(encoding="utf-8"))
    d["workspaces"][LONG] = ["t1"]
    p.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    check("an existing long one takes an add", not refused({"op": "ws-add", "workspace": LONG, "names": ["t2"]}) and ws().get(LONG) == ["t1", "t2"], ws())
    check("an existing long one takes a move", not refused({"op": "ws-move", "workspace": LONG, "from": "y" * C.PART_MAX, "names": ["t2"]}))
    check("a new section under the existing long one: its own level counts",
          not refused({"op": "ws-add", "workspace": LONG + " / ok", "names": ["t3"]}) and LONG + " / ok" in ws(), ws())

    # the API refuses the name before the job (no engine is asked)
    asked = []
    api._engine = lambda path, body=None, timeout=60: asked.append(path) or {"id": 1}
    ctx = {"collection": C, "config_dir": lambda: cfg, "outputs": out}
    try:
        code, body = api.handle("POST", "/api/v1/songs", {}, json.dumps({"style": "x", "lyrics": "y", "workspace": "New " + "z" * C.PART_MAX}).encode(), {}, ctx)
    except Exception as e:   # noqa: BLE001
        code, body = "raised", repr(e)
    if code == 401 or (code == 404):
        print("  skip  the API's own check (its route or key differs here):", code, body)
    else:
        check("the API refuses it before the job", code == 400 and f"{C.PART_MAX} characters" in str(body) and not asked, (code, body, asked))

print("all good" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
