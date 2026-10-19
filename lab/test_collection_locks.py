"""HERESY 1473: a lock of either kind keeps a workspace's takes (and its sections') from the trash and from a move out of every
other workspace; a locked workspace refuses to let takes out; an export says what it could not find."""
import json, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as c

root = Path(tempfile.mkdtemp())
kit, outputs, conf = root, root / "outputs", root / "user"
outputs.mkdir(); conf.mkdir()
for n in ("a", "b", "s1", "free", "both"):
    (outputs / n).mkdir(); json.dump({"title": n}, open(outputs / n / "meta.json", "w")); (outputs / n / "audio.wav").write_bytes(b"RIFF")
d = c.load(conf)
d["workspaces"] = {"💎 Set": ["a", "both"], "💎 Set / Part": ["s1"], "Mine": ["b", "both"], "Loose": ["free"]}
d["locks"] = {"💎 Set": {"workspace": True}}
c.save(conf, d)
d = c.load(conf)
assert c.ws_locked(d, "💎 Set") and c.ws_locked(d, "💎 Set / Part") and not c.ws_locked(d, "Mine")
assert c.locked_takes(d) == {"a", "both", "s1"}, c.locked_takes(d)
r = c.trash_move(kit, outputs, ["a", "b", "s1", "free", "both"], conf)
assert sorted(r["moved"]) == ["b", "free"] and sorted(r["locked"]) == ["a", "both", "s1"], r
assert (outputs / "a").is_dir() and not (outputs / "b").exists()
# a move from no workspace named takes a take out of every other, but a locked one keeps it; a named locked source refuses nothing
c.collection_post(conf, outputs, {"op": "ws-move", "workspace": "Loose", "names": ["a"]})
d = c.load(conf)
assert "a" in d["workspaces"]["💎 Set"] and "a" in d["workspaces"]["Loose"], d["workspaces"]
try:
    c.collection_post(conf, outputs, {"op": "ws-remove", "workspace": "💎 Set / Part", "names": ["s1"]}); raise SystemExit("a locked section let a take out")
except ValueError as e:
    assert "locked" in str(e)
# an export says what it could not find
j = c.export_start(kit, outputs, ["a", "gone", "free-gone"], "wav", False)
for _ in range(50):
    st = c.export_status(j["id"])
    if st["status"] != "running":
        break
    time.sleep(0.1)
assert st["status"] == "done" and st["done"] == 1 and st.get("missing") == 2, st
print("collection locks: 7 checks passed")
