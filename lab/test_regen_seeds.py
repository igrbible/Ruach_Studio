"""HERESY 2137 (the audit of 06.11.2026): a take made again with new seeds (/regen, same_seeds off) goes with seeds drawn by the lab in the page's
range (1000…999 999 999, HERESY 1877), not left for the engine's 63-bit ones; with same_seeds its own stay. The lab is imported with its engine,
its takes and its workspaces stood in for, so nothing reaches the Studio. python3 lab/test_regen_seeds.py"""
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
for n, seeds in (("a", (5555555555555555555, 4444444444444444444)), ("b", (11, 12))):
    (tmp / n).mkdir()
    json.dump({"title": "Song " + n, "style": "x", "lyrics": "", "lm_seed": seeds[0], "seed": seeds[1]}, open(tmp / n / "request.json", "w"))
    json.dump({"model": "BF16"}, open(tmp / n / "meta.json", "w"))
sent = []
lab.take_dir = lambda name: tmp / name
lab.collection.frozen_takes = lambda d: set()
lab.collection.load = lambda cfg: {}
lab.config_dir = lambda: tmp
lab.api._engine = lambda path, body=None, timeout=60: (sent.append(body) or {"id": len(sent)})
lab._regen_pending = lambda add=None, done=None: None
lab._regen_watch = lambda job, old: None
lab.act_say = lambda *a, **k: None

lab.regen(["a", "b"] * 20, same_seeds=False)
ok = all(isinstance(b.get("lm_seed"), int) and isinstance(b.get("seed"), int) and 1000 <= b["lm_seed"] <= 999999999 and 1000 <= b["seed"] <= 999999999
         for b in sent)
check("new seeds: both drawn by the lab, each within 1000…999 999 999 (40 takes)", len(sent) == 40 and ok, [(b.get("lm_seed"), b.get("seed")) for b in sent][:4])
check("  not the take's own", not any(b["lm_seed"] in (5555555555555555555, 11) for b in sent), [b["lm_seed"] for b in sent][:4])
check("  each take its own draw", len({b["lm_seed"] for b in sent}) > 30, len({b["lm_seed"] for b in sent}))
del sent[:]
lab.regen(["a", "b"], same_seeds=True)
check("same seeds: the take's own stay as they were, long or short", [(b["lm_seed"], b["seed"]) for b in sent] == [(5555555555555555555, 4444444444444444444), (11, 12)],
      [(b.get("lm_seed"), b.get("seed")) for b in sent])
print("test_regen_seeds:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
