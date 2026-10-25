"""HERESY 1767: a take made again (/regen) is made on the backbone it was sung on; a probe (and the Keys Probe) at full length. The lab is imported
with its engine, its takes and its workspaces stood in for, so nothing reaches the studio. python3 lab/test_regen_backbone.py"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


tmp = Path(tempfile.mkdtemp())
takes = {
    "old-probe": ({"title": "probe60-tanpura-drone-a", "style": "x", "lyrics": "", "lm_seed": 11, "seed": 12, "duration": 120.0,
                   "semantic_sampling": {"min_tokens": 2250}}, {"model": "BF16", "provided_score": False}),
    "keys": ({"title": "keys-probe-c", "style": "x", "lyrics": "", "lm_seed": 21, "seed": 22, "duration": 95.0,
              "semantic_sampling": {"min_tokens": 2000}}, {"model": "BF16"}),
    "named": ({"title": "Ring · ru · №1", "backbone": "IRAEv2-BF16", "lm_seed": 31, "seed": 32, "duration": 240.0}, {"model": "IRAEv2-BF16"}),
    "unknown": ({"title": "Old song", "lm_seed": 41, "seed": 42}, {}),
}
for n, (req, meta) in takes.items():
    (tmp / n).mkdir()
    json.dump(req, open(tmp / n / "request.json", "w"))
    json.dump(meta, open(tmp / n / "meta.json", "w"))
sent = []
lab.take_dir = lambda name: tmp / name
lab.collection.frozen_takes = lambda d: set()
lab.collection.load = lambda cfg: {}
lab.config_dir = lambda: tmp
lab.api._engine = lambda path, body=None, timeout=60: (sent.append(body) or {"id": len(sent)})
lab._regen_pending = lambda add=None, done=None: None
lab._regen_watch = lambda job, old: None
lab.act_say = lambda *a, **k: None
out = lab.regen(list(takes), same_seeds=True)
by = {b["title"]: b for b in sent}
check("all four sent to the engine", len(sent) == 4 and all("job" in o for o in out["regen"]), out)
check("a take whose request names no backbone: made on the one its meta says it was sung on (BF16), its own seeds",
      by["probe60-tanpura-drone-a"].get("backbone") == "BF16" and by["probe60-tanpura-drone-a"]["lm_seed"] == 11 and by["probe60-tanpura-drone-a"]["seed"] == 12,
      by["probe60-tanpura-drone-a"])
check("  a request that names its backbone keeps it", by["Ring · ru · №1"].get("backbone") == "IRAEv2-BF16", by["Ring · ru · №1"])
check("  no backbone and no meta to say one: none named (the engine's default, as before)", "backbone" not in by["Old song"], by["Old song"])
check("the Keys Probe at a probe's full length: 120 s, at least 90 s of music; a probe as before",
      by["keys-probe-c"]["duration"] == 120.0 and by["keys-probe-c"]["semantic_sampling"]["min_tokens"] == 2250
      and by["probe60-tanpura-drone-a"]["duration"] == 120.0 and by["probe60-tanpura-drone-a"]["semantic_sampling"]["min_tokens"] == 2250,
      (by["keys-probe-c"].get("duration"), by["keys-probe-c"].get("semantic_sampling")))
print("test_regen_backbone:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
