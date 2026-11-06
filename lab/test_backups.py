"""HERESY 2083: the user's data backed up (lab/backups.py): a snapshot written whole, what each kind keeps, rotation, a good file never touched,
a broken file put back with its broken copy kept and a notice said once, the start's check, a file that does not parse never stored, a file broken at
a snapshot's read put back before the snapshot takes it. A folder of its own under the system's temp, left there.   python3 lab/test_backups.py"""
import gzip
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backups as bk  # noqa: E402

bad = []


def ok(name, cond, got=""):
    if not cond:
        bad.append(name)
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({got})"))


kit = Path(tempfile.mkdtemp(prefix="ruach-backups-test-"))
bk.setup(kit)
BK = kit / "user" / "backups"
for d in ("user", "outputs/t1", "writer"):
    (kit / d).mkdir(parents=True, exist_ok=True)
S = json.dumps({"saved_at": 1, "keys": {"yue2.theme": "igr-night"}})
C = json.dumps({"workspaces": {"A": ["t1"]}, "notes": {"t1": "a note"}})
(kit / "user/settings.json").write_text(S)
(kit / "user/collection.json").write_text(C)
(kit / "writer/d1.json").write_text(json.dumps({"id": "d1", "title": "Song"}))
(kit / "outputs/t1/meta.json").write_text(json.dumps({"title": "Take"}))
(kit / "user/perf.json").write_text("{}")                    # not one of the files kept

h = bk.snapshot("hourly")
doc = json.loads(gzip.decompress((BK / h["name"]).read_bytes()))
ok("an hourly snapshot keeps the settings, the Librarian and the Writer's documents as they are",
   doc["files"].get("user/settings.json") == S and doc["files"].get("user/collection.json") == C and "writer/d1.json" in doc["files"], sorted(doc["files"]))
ok("but not each take's card, nor a file not kept", "outputs/t1/meta.json" not in doc["files"] and "user/perf.json" not in doc["files"])
d = bk.snapshot("daily")
ok("the daily one keeps each take's card too", "outputs/t1/meta.json" in bk._load_snap(BK / d["name"])["files"])
ok("no part file left", not list(BK.glob("*.part")))
bk.configure({"keep_hourly": 2})
for i in range(3):
    bk.snapshot("hourly")
    time.sleep(0.01)
ok("rotation keeps the last two hourly ones", len(bk.snapshots("hourly")) == 2, [s["name"] for s in bk.snapshots("hourly")])
ok("and leaves the daily one", len(bk.snapshots("daily")) == 1)
st = bk.status()
ok("the status says the last snapshot, the switches and the counts", st["last"]["kind"] == "hourly" and st["on"] == {"hourly": True, "daily": True} and
   st["keep"]["hourly"] == 2 and st["keep"]["daily"] == 30 and st["count"] == 3, st)

p = kit / "user/settings.json"
before = (p.stat().st_mtime_ns, p.read_bytes())
ok("a good file: recover() finds it whole and touches nothing", bk.recover(p) is True and (p.stat().st_mtime_ns, p.read_bytes()) == before)
ok("the start's check touches no good file", bk.check_all() == 0 and (p.stat().st_mtime_ns, p.read_bytes()) == before)

q = kit / "user/collection.json"
q.write_text('{"workspaces": {"A": [')
ok("a read of the broken Librarian puts it back from the newest snapshot first", bk.read_json(q) == json.loads(C))
ok("the file on disk whole again", q.read_text() == C)
aside = list((BK / "broken").iterdir())
ok("the broken copy kept aside, never deleted", len(aside) == 1 and aside[0].read_text() == '{"workspaces": {"A": [' and aside[0].name.startswith("user__collection.json."),
   [a.name for a in aside])
n = bk.status()["notices"]
ok("a notice says which file and from when", len(n) == 1 and n[0]["file"] == "user/collection.json" and n[0]["restored"] and n[0]["from"] > 0 and
   n[0]["aside"].startswith("user/backups/broken/"), n)
bk.seen([n[0]["id"]])
ok("said once: seen, it leaves the status", bk.status()["notices"] == [])

(kit / "writer/d1.json").write_text("")
ok("the start's check puts back an emptied Writer's document", bk.check_all() == 1 and json.loads((kit / "writer/d1.json").read_text())["title"] == "Song")

(kit / "user/vocab").mkdir()
(kit / "user/vocab/v.json").write_text("{not json")
s2 = bk.snapshot("now")
d2 = bk._load_snap(BK / s2["name"])
ok("a file that does not parse is never stored, and is said", "user/vocab/v.json" not in d2["files"] and "user/vocab/v.json" in d2["skipped"], d2["skipped"])
ok("broken with no snapshot to hold it whole, it stays as it is", (kit / "user/vocab/v.json").read_text() == "{not json")
vn = [x for x in bk.status()["notices"] if x["file"] == "user/vocab/v.json"]
ok("and the page is told so", len(vn) == 1 and vn[0]["restored"] is False, vn)
bk.snapshot("now")
ok("once", len([x for x in bk.status()["notices"] if x["file"] == "user/vocab/v.json"]) == 1)

q.write_text("garbage")
s3 = bk.snapshot("hourly")
ok("broken at a snapshot's read: put back first, and the good copy is what the snapshot keeps",
   bk._load_snap(BK / s3["name"])["files"].get("user/collection.json") == C and q.read_text() == C)
ok("a test page's file is none of the files kept", bk.recover(kit / "user/settings-claude.json") is False)
bk.configure({"hourly": False, "keep_daily": 5})
ok("the switches and the counts kept", bk.config()["hourly"] is False and bk.config()["keep_daily"] == 5 and bk.due() == [] and bk.snapshots("hourly")[0]["name"] == s3["name"])
try:
    bk.configure({"keep_hourly": 0})
    ok("a count of none is refused", False)
except ValueError:
    ok("a count of none is refused", True)
print(f"{len(bad)} failed" if bad else "all passed", "·", kit)
sys.exit(1 if bad else 0)
