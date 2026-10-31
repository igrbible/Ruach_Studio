"""HERESY 1817: the saves of an unprotected, stopped run deleted one by one, as chosen; a twin in loras/ only when asked; a protected run refuses.
A kit of its own in a temporary folder: nothing of the studio's is touched."""
import json, os, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import training

ok = True
def check(what, cond):
    global ok
    print(("ok   " if cond else "FAIL ") + what); ok &= bool(cond)

with tempfile.TemporaryDirectory() as t:
    kit = Path(t)
    P = training.paths(kit)
    d = P["runs"] / "probe-run"; (d / "output").mkdir(parents=True)
    json.dump({"tracks": 100, "step": 300, "options": {"save_every": 100}}, open(d / "run.json", "w"))
    for s in (100, 200, 300):
        (d / "output" / f"probe-run_{s:09d}.safetensors").write_bytes(b"x" * 1000 * s)
    cks = training.checkpoints(kit, "probe-run")
    check("three saves listed", len(cks) == 3)
    # the second one published into loras/ as a hard link, the way publish() does it
    two = [c for c in cks if c["step"] == 200][0]
    pub = training.publish(kit, "probe-run", two["file"])
    twin = P["loras"] / pub["lora"]
    check("its twin in loras/ is the same file", twin.is_file() and twin.stat().st_ino == (d / two["file"]).stat().st_ino)
    training.protect(kit, "probe-run", True)
    try:
        training.delete_saves(kit, "probe-run", [two["file"]], True); check("a protected run refuses", False)
    except ValueError:
        check("a protected run refuses", True)
    try:
        training.delete_run(kit, "probe-run", True); check("a protected run refuses its own deletion", False)
    except ValueError:
        check("a protected run refuses its own deletion", True)
    training.protect(kit, "probe-run", False)
    try:
        training.delete_saves(kit, "probe-run", ["../run.json"], False); check("a file not among its saves refuses", False)
    except ValueError:
        check("a file not among its saves refuses", True)
    one = [c for c in cks if c["step"] == 100][0]
    r = training.delete_saves(kit, "probe-run", [one["file"], two["file"]], False)
    check("two saves deleted", sorted(r["deleted"]) == sorted([one["file"], two["file"]]))
    check("the twin kept when not asked", twin.is_file() and r["loras_kept"] == [twin.name])
    check("only the unshared one counted as freed", r["freed"] == 100000)
    check("the third save untouched", (d / "output" / "probe-run_000000300.safetensors").is_file())
    gone = {g["step"] for g in training.gone(kit, "probe-run")}
    check("the deleted ones show as gone", gone == {100, 200})
sys.exit(0 if ok else 1)
