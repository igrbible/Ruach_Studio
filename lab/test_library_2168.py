"""HERESY 2168: a Move or a Take out from a parent's view leaves its «Sourced for Regeneration» section alone, thawed as frozen (the parent's view does
not show that section, so it does not reach it); from the section's own view it is the place itself. HERESY 2170: the catalog's instrumental flag is the
take's own Instrumental field where the take keeps it (a boolean), and 2058's rule where it does not.   python3 lab/test_library_2168.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as C  # noqa: E402

bad = []
SRC = "W / Sourced for Regeneration"


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as tmp:
    cfg, out = Path(tmp) / "user", Path(tmp) / "outputs"
    cfg.mkdir()
    reqs = {"t1": {}, "t2": {}, "t3": {}, "t4": {}, "t5": {}, "t6": {},
            "i1": {"style": "rock", "lyrics": "[Verse]\nla la", "instrumental": True},
            "i2": {"style": "Instrumental, strings", "lyrics": "[Intro]", "instrumental": False},
            "i3": {"style": "Instrumental, strings", "lyrics": "[Intro]"},
            "i4": {"style": "pop", "lyrics": "[Verse]\nwords", "instrumental": "yes"}}
    for n, rq in reqs.items():
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
        (out / n / "request.json").write_text(json.dumps(rq), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
    W = lambda: C.load(cfg)["workspaces"]   # noqa: E731

    print("2170: the take's own Instrumental field first")
    flags = {r["name"]: r["instrumental"] for r in C.catalog(out, cfg)["takes"] if r["name"].startswith("i")}
    check("a take that says true is instrumental though it has words; one that says false is not though its style says Instrumental",
          flags.get("i1") is True and flags.get("i2") is False, flags)
    check("  a take from before (no field) by 2058's rule; a field that is not a boolean is no answer (2058's rule)",
          flags.get("i3") is True and flags.get("i4") is False, flags)

    print("2168: the parent's view and its «Sourced for Regeneration»")
    post({"op": "ws-create", "workspace": "W"})
    post({"op": "ws-create", "workspace": "W / Sec"})
    post({"op": "ws-create", "workspace": "Out"})
    post({"op": "ws-add", "workspace": "W", "names": ["t1", "t4", "t5"]})
    post({"op": "ws-add", "workspace": "W / Sec", "names": ["t2"]})
    C.keep_sourced(cfg, SRC, ["t1", "t3", "t4", "t5"])          # as the lab's regeneration files a replaced take (frozen)
    check("the section made frozen, as regeneration makes it", SRC in C.load(cfg)["frozen"], C.load(cfg)["frozen"])
    post({"op": "freeze", "workspace": SRC, "on": False})
    check("  thawed", SRC not in C.load(cfg)["frozen"], C.load(cfg)["frozen"])

    post({"op": "ws-move", "workspace": "Out", "from": "W", "tree": True, "names": ["t1", "t2"]})
    w = W()
    check("Move from the parent's view: out of «W» and its shown section «W / Sec», into «Out»",
          "t1" not in w["W"] and "t2" not in w["W / Sec"] and {"t1", "t2"} <= set(w["Out"]), w)
    check("  and the thawed «Sourced for Regeneration» keeps its take (the view did not show it there)", "t1" in w[SRC], w[SRC])

    post({"op": "ws-remove", "workspace": "W", "tree": True, "names": ["t4"]})
    w = W()
    check("Take out from the parent's view: out of «W»", "t4" not in w["W"], w["W"])
    check("  and the thawed «Sourced for Regeneration» keeps it", "t4" in w[SRC], w[SRC])

    post({"op": "ws-remove", "workspace": SRC, "tree": True, "names": ["t3"]})
    check("from the section's own view a Take out takes it out of the section", "t3" not in W()[SRC], W()[SRC])
    post({"op": "ws-move", "workspace": "Out", "from": SRC, "tree": True, "names": ["t1"]})
    w = W()
    check("  and a Move from there moves it out of the section", "t1" not in w[SRC] and "t1" in w["Out"], w)

    post({"op": "freeze", "workspace": SRC, "on": True})
    post({"op": "ws-move", "workspace": "Out", "from": "W", "tree": True, "names": ["t5"]})
    w = W()
    check("frozen as before: a Move from the parent leaves the section's take", "t5" not in w["W"] and "t5" in w[SRC] and "t5" in w["Out"], w)
    check("a workspace's own sections still listed by family() (ws-delete, rename and the rest unchanged)",
          set(C.family(C.load(cfg), "W")) == {"W", "W / Sec", SRC} and set(C.view_tree(C.load(cfg), "W")) == {"W", "W / Sec"},
          (C.family(C.load(cfg), "W"), C.view_tree(C.load(cfg), "W")))

print("\n" + ("all well" if not bad else str(len(bad)) + " failed"))
sys.exit(1 if bad else 0)
