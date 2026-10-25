"""HERESY 1768: the decode ladder is the Creator's own choice; a section redone, a window sung anew and the rest of section.py replay a ladder
take on the standard decode (Viktor 24.10.2026: «Везде в остальных местах Студии пусть остаётся оригинальный стабильный предсказуемый декод»).
Against a fake engine: no draft or replay carries nar_ladder, the take's own request.json keeps it.
python3 lab/test_section_ladder.py"""
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import section  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:600] + ")"))
    if not ok:
        bad.append(what)


root = Path(tempfile.mkdtemp())
out = root / "outputs"
FPS = section.FPS
take = "20261024-120000-take"
codes = [100 + (i % 500) for i in range(40 * FPS)]
(out / take).mkdir(parents=True)
json.dump({"title": "Take", "lyrics": "[verse]\nla la", "seed": 777, "lm_seed": 1, "semantic_tokens": ",".join(map(str, codes)), "duration": 40,
           "loras": [], "nar_ladder": True}, open(out / take / "request.json", "w"))
sent, jobs = [], {}
n = [0]


def engine(path, body=None):
    if path == "/synth":
        n[0] += 1
        jid, name = f"job{n[0]}", f"20261024-1300{n[0]:02d}-made"
        (out / name).mkdir()
        if body.get("semantic_tokens"):                # a replay: the codes given
            toks = body["semantic_tokens"]
        else:                                          # a draft: the kept start, then new codes to its length
            keep = [int(x) for x in str(body.get("semantic_keep") or "").split(",") if x]
            toks = ",".join(map(str, keep + [900 + i % 7 for i in range(round(body["duration"] * FPS) - len(keep))]))
        json.dump(dict(body, semantic_tokens=toks), open(out / name / "request.json", "w"))
        sent.append(body)
        jobs[jid] = name
        return {"id": jid}
    if path.startswith("/job?id="):
        return {"status": "done", "takes": [jobs[path.split("=", 1)[1]]]}
    raise AssertionError(path)


class Col:
    @staticmethod
    def load(cfg):
        return {"workspaces": {"Songs": [take]}, "locks": {}}

    @staticmethod
    def frozen_ws(d, w):
        return False

    @staticmethod
    def collection_post(cfg, outputs, body):
        pass


section.setup(outputs=out, engine=engine, say=lambda s: None, frozen=lambda: set(), trash=lambda names: None, collection=Col, config_dir=lambda: root)
req, got = section._codes(take)
check("the take's request read for a redo: without nar_ladder, its codes whole", "nar_ladder" not in req and got == codes, req.keys())


def finish(r):
    for _ in range(300):                               # the job polls the engine every two seconds: a draft and a replay
        st = section.job(r["id"])
        if st and st["status"] in ("done", "failed"):
            return st
        time.sleep(0.05)
    return section.job(r["id"])


for what, r in (("a section redone", lambda: section.start(take, 10, 20, "[verse]\nla la", versions=1, section="verse")),
                ("a window sung anew", lambda: section.window(take, 10, 20, "[verse]\nla la", versions=1, pre=2, post=2, loras=[]))):
    before = len(sent)
    st = finish(r())
    mine = sent[before:]
    check(what + ": a draft and a replay made", st["status"] == "done" and len(mine) == 2, st)
    check("  neither asks the engine for the ladder", all("nar_ladder" not in b for b in mine), [sorted(b) for b in mine])
check("the take's own request.json keeps nar_ladder (a redo does not rewrite it)", json.load(open(out / take / "request.json"))["nar_ladder"] is True)

print("all good" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
