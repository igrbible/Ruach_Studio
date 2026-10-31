"""HERESY 1852: where the player left each take, and its guard. python3 lab/test_playback_marks.py"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playback_marks as pm  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as t:
    cfg, out = Path(t) / "user", Path(t) / "outputs"
    for k in range(105):
        (out / f"take-{k:03d}").mkdir(parents=True)
        (out / f"take-{k:03d}" / "request.json").write_text("{}")
    check("no marks before any", pm.listing(cfg, out) == {}, pm.listing(cfg, out))
    pm.mark(cfg, out, "take-000", 93.456, 240)
    got = pm.listing(cfg, out)
    check("a mark kept with its length", got.get("take-000", {}).get("at") == 93.46 and got["take-000"]["seconds"] == 240, got)
    pm.mark(cfg, out, "take-000", 120, 240)
    check("a newer mark replaces it", pm.listing(cfg, out)["take-000"]["at"] == 120, pm.listing(cfg, out))
    pm.mark(cfg, out, "take-000", None)
    check("None forgets it (played to its end)", "take-000" not in pm.listing(cfg, out), pm.listing(cfg, out))
    pm.mark(cfg, out, "take-001", 0.4)
    check("under a second is its start: not kept", "take-001" not in pm.listing(cfg, out), pm.listing(cfg, out))
    try:
        pm.mark(cfg, out, "../etc", 10)
        check("a name outside the outputs refused", False)
    except FileNotFoundError:
        check("a name outside the outputs refused", True)
    try:
        pm.mark(cfg, out, "no-such-take", 10)
        check("a take not in the outputs refused", False)
    except FileNotFoundError:
        check("a take not in the outputs refused", True)
    raw = json.load(open(cfg / "playback.json", encoding="utf-8"))
    for k in range(105):
        raw[f"take-{k:03d}"] = {"at": 10 + k, "seconds": 300, "ts": 1000 + k}
    json.dump(raw, open(cfg / "playback.json", "w", encoding="utf-8"))
    pm.mark(cfg, out, "take-050", 77, 300)
    got = pm.listing(cfg, out)
    check("the newest hundred kept", len(got) == 100 and "take-050" in got and "take-000" not in got and "take-104" in got, len(got))
    pm.forget(cfg, ["take-104", "take-103"])
    got = pm.listing(cfg, out)
    check("the trash's move forgets its takes at once", "take-104" not in got and "take-103" not in got and len(got) == 98, len(got))
    shutil.rmtree(out / "take-102")
    got = pm.listing(cfg, out)
    disk = json.load(open(cfg / "playback.json", encoding="utf-8"))
    check("a take deleted by anyone: its line dropped on the next read, from the file too", "take-102" not in got and "take-102" not in disk, len(disk))
    (cfg / "playback.json").write_text("not json")
    check("a broken file reads as no marks", pm.listing(cfg, out) == {}, pm.listing(cfg, out))

print("ALL OK" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
