"""HERESY 2132 (the audit of 06.11.2026): a regeneration the engine finished with no take in the library (or fewer than it made) is said aloud in the
lab's activity, with the engine's reason; a whole one is filed as before and says nothing of the kind. The lab is imported with its engine, its
workspaces and its thread stood in for, so nothing reaches the Studio. python3 lab/test_regen_said.py"""
import importlib.util
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


class Now:
    """the watcher's thread run at once, in this one"""
    def __init__(self, target=None, daemon=None):
        self.target = target

    def start(self):
        self.target()


tmp = Path(tempfile.mkdtemp())
said, posts, done = [], [], []
lab.threading.Thread = Now
lab.time.sleep = lambda s: None
lab.act_say = lambda line: said.append(line)
lab._regen_pending = lambda add=None, done_=None, **k: done.append(k.get("done"))
lab.config_dir = lambda: tmp
lab.OUTPUTS = tmp
lab.art_copy = lambda *a, **k: None
lab.collection.load = lambda cfg: {"workspaces": {"Ring": ["old"]}, "notes": {}, "ratings": {}}
lab.collection.collection_post = lambda cfg, out, body: posts.append(body) or {}
lab.collection.keep_sourced = lambda cfg, w, names: posts.append({"op": "keep_sourced", "workspace": w, "names": names})


def run(answer):
    del said[:], posts[:], done[:]
    lab.api._engine = lambda path, body=None, timeout=60: dict(answer)
    lab._regen_watch("7", "old")


run({"status": "done", "takes": [], "made": 1, "library_error": "cannot write /out/x"})
check("done with no take: said, with the engine's reason, and the old one stays", len(said) == 1 and "did not keep 1 of 1" in said[0]
      and "cannot write /out/x" in said[0] and "the old one stays where it was" in said[0], said)
check("  nothing filed, the old one not taken out of its workspace", not any(p.get("op") == "ws-remove" for p in posts), posts)
check("  the pending regeneration let go", done == ["7"], done)

run({"status": "done", "takes": []})
check("done with no take from an engine that says no count: said all the same", len(said) == 1 and "did not keep 1 of ?" in said[0]
      and "no reason" in said[0], said)

run({"status": "done", "takes": ["new1"], "made": 2})
check("one of two kept: the loss said, the one kept filed as before", any("did not keep 1 of 2 takes" in s for s in said)
      and any(p.get("op") == "ws-add" and p.get("names") == ["new1"] for p in posts), (said, posts))

run({"status": "done", "takes": ["new1"], "made": 1})
check("a whole one: nothing of a loss said, filed as before", not any("did not keep" in s for s in said)
      and any(p.get("op") == "ws-add" for p in posts), (said, posts))

print("test_regen_said:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
