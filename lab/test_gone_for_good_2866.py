"""HERESY 2866 (the disk inventory of 19.11.2026; Viktor: «Баги, что найдены, чини»): a take emptied from the trash takes with it every mark of
its own in collection.json, its Narrator run (reader/runs/<id>/) and the Artist's run drawn for it; a take only in the trash keeps all three, so a
restore brings it back whole. The hourly pass drops what no take in the library or the trash names (runs older than a day only), and says it.
Everything in a temporary kit: never the Studio's own library or marks.   .venv/bin/python lab/test_gone_for_good_2866.py"""
import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import collection  # noqa: E402
import reader  # noqa: E402
import artist  # noqa: E402

fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


def take(out, n):
    (out / n).mkdir(parents=True)
    (out / n / "meta.json").write_text(json.dumps({"title": n.upper()}))


def marks_of(d, n):
    """Every key that still names n."""
    return sorted([k for k in collection.TAKE_LISTS if n in d[k]] + [k for k in collection.TAKE_MAPS if n in d[k]] + \
        (["pins"] if any(n in ns for ns in d["pins"].values()) else []) + \
        (["workspaces"] if any(n in ns for ns in d["workspaces"].values()) else []) + (["playlist"] if n in d["playlist"] else []) + \
        (["albums"] if any(n in al["items"] or al.get("cover") == n for al in d["albums"]) else []))


ALL = sorted(collection.TAKE_LISTS + collection.TAKE_MAPS + ("pins", "workspaces", "playlist", "albums"))
A_ALL = sorted(set(ALL) - {"protected"})                  # a is not protected (b is)

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    out, cfg = kit / "outputs", kit / "user"
    cfg.mkdir()
    for n in ("a", "b", "c", "keep"):
        take(out, n)
    m = collection.load(cfg)
    for n in ("a", "b"):
        for k in collection.TAKE_LISTS:
            m[k].append(n)
        m["ratings"][n], m["notes"][n], m["reacts"][n] = 1, "note of " + n, "love"
    m["protected"] = ["b"]                                # a protected take never leaves the trash: only a and the hourly pass are tried on it
    m["regen_of"] = {"a": "keep", "keep": "a", "c": "long-gone"}
    m["workspaces"] = {"W": ["a", "b", "keep"], "W / S": ["a"]}
    m["pins"] = {"W": ["a"], "": ["a", "keep"]}
    m["playlist"] = ["a", collection.PL_WS + "W", "keep"]
    m["albums"] = [{"name": "Al", "items": ["a", "keep"], "cover": "a"}]
    collection.save(cfg, m)

    # 1 · to the trash: every mark stays, the hourly pass leaves them, a restore finds them
    r = collection.trash_move(kit, out, ["a"], cfg)
    check("a to the trash", r["moved"] == ["a"], r)
    said = collection.tidy_marks(kit, cfg, out)
    m = collection.load(cfg)
    check("  in the trash it keeps every mark through the hourly pass", marks_of(m, "a") == A_ALL and not said, (marks_of(m, "a"), said))
    day = collection.trash_list(kit)["items"][0]["day"]
    collection.trash_restore(kit, out, [{"day": day, "name": "a"}], cfg)
    check("  given back, its marks are there", marks_of(collection.load(cfg), "a") == A_ALL)

    # 2 · emptied for good: every mark goes, the others' stay, the dropped note is in the log
    collection.trash_move(kit, out, ["a"], cfg)
    r = collection.trash_empty(kit, [{"day": day, "name": "a"}], config_dir=cfg)
    m = collection.load(cfg)
    check("a emptied from the trash", r["emptied"] == ["a"], r)
    check("  no key names it any more", marks_of(m, "a") == [], marks_of(m, "a"))
    check("  b and keep keep theirs", marks_of(m, "b") == sorted(set(ALL) - {"pins", "playlist", "albums", "regen_of"}) and "keep" in m["workspaces"]["W"],
          marks_of(m, "b"))
    check("  regen_of by its new take: a's own entry gone, keep's parent a stays (lineage says a gone parent)",
          "a" not in m["regen_of"] and m["regen_of"].get("keep") == "a" and m["regen_of"].get("c") == "long-gone", m["regen_of"])
    check("  the album's cover and a whole-workspace entry of the playlist", "cover" not in m["albums"][0] and m["playlist"] == [collection.PL_WS + "W", "keep"],
          (m["albums"], m["playlist"]))
    check("  the pin slot of only a went, the other kept keep", m["pins"] == {"": ["keep"]}, m["pins"])
    log = [json.loads(x) for x in (cfg / collection.DROPPED_LOG).read_text().splitlines()]
    check("  the log has the note's words", log and log[-1]["why"] == "emptied from the trash" and log[-1]["dropped"]["notes"] == {"a": "note of a"}, log)

    # 3 · the same name in two days of the trash: emptying one keeps the marks
    take(out, "twin")
    m = collection.load(cfg)
    m["notes"]["twin"] = "x"
    collection.save(cfg, m)
    collection.trash_move(kit, out, ["twin"], cfg)
    old = collection.trash_dir(kit) / "2000-01-01"
    old.mkdir()
    os.replace(collection.trash_dir(kit) / day / "twin", old / "twin")
    take(out, "twin")
    collection.trash_move(kit, out, ["twin"], cfg)
    collection.trash_empty(kit, [{"day": "2000-01-01", "name": "twin"}], config_dir=cfg)
    check("one of two twins emptied: the one left in the trash keeps the note", collection.load(cfg)["notes"].get("twin") == "x")

    # 4 · the hourly pass: names of nothing dropped and said; an unseen library drops nothing
    m = collection.load(cfg)
    m["workspaces"]["W"].append("ghost")
    m["notes"]["ghost"], m["ratings"]["ghost"] = "lost words", -1
    m["fire"].append("ghost")
    m["protected"].append("ghost")
    collection.save(cfg, m)
    empty = kit / "nothing-here"
    empty.mkdir()
    check("no library in sight: nothing dropped", collection.tidy_marks(kit, cfg, empty) == {} and "ghost" in collection.load(cfg)["notes"])
    said = collection.tidy_marks(kit, cfg, out)
    m = collection.load(cfg)
    check("the hourly pass drops the ghost from every key", marks_of(m, "ghost") == [] and said.get("workspaces") == {"W": ["ghost"]} and
          said.get("notes") == {"ghost": "lost words"} and said.get("fire") == ["ghost"] and said.get("protected") == ["ghost"], said)
    check("  b (protected, in the library) and keep untouched", "b" in m["protected"] and m["notes"].get("b") == "note of b" and "keep" in m["workspaces"]["W"])
    check("  said in the log", json.loads((cfg / collection.DROPPED_LOG).read_text().splitlines()[-1])["why"] == "neither in the library nor in the trash")
    check("  a second pass drops nothing", collection.tidy_marks(kit, cfg, out) == {})

    # 5 · the Narrator's runs
    jobs, lock = {}, threading.Lock()
    reader.H.update(kit=kit, jobs=jobs, lock=lock, outputs=out)
    home = reader.runs_home()
    now = time.time()

    def run(rid, age_h, **r):
        d = home / rid
        d.mkdir(parents=True)
        (d / "piece-000.wav").write_bytes(b"x")
        (d / "run.json").write_text(json.dumps(dict({"id": rid, "status": "done", "created": now - age_h * 3600}, **r)))
        t = now - age_h * 3600
        os.utime(d / "run.json", (t, t))
    run("20261101-000000-0001", 48, take="keep")                                   # its take is here
    run("20261101-000000-0002", 48, take="gone2")                                  # an orphan
    run("20261101-000000-0003", 2, take="young")                                   # an orphan, but young
    run("20261101-000000-0004", 48, take="busy")                                   # an orphan being fixed
    jobs["reader:20261101-000000-0004~fix"] = {"status": "running"}
    run("20261101-000000-0005", 48, status="failed")                               # never landed a take
    run("20261101-000000-0006", 48, design=True, take="whatever")                  # a voice builder's
    run("20261101-000000-0007", 48, take="gone7", takes=[{"take": "gone7"}, {"take": "keep"}])   # a book, one part still here
    run("20261101-000000-0008", 48, take="gone8", status="running")                # still reading
    take(out, "intrash")
    collection.trash_move(kit, out, ["intrash"], cfg)
    run("20261101-000000-0009", 48, take="intrash")                               # its take in the trash
    inbin = collection.trash_names(kit)

    def present(n):
        return n in inbin or (out / n).exists()
    got = reader.prune_runs(present)
    left = sorted(p.name for p in home.iterdir())
    check("the hourly pass deletes only the old orphan", got == ["20261101-000000-0002"] and "20261101-000000-0002" not in left and len(left) == 8, (got, left))
    got = reader.prune_runs(present, ["young"])
    check("  a take just emptied: its run at once, young as it is", got == ["20261101-000000-0003"], got)
    got = reader.prune_runs(present, ["busy", "gone8", "intrash"])
    check("  never one being fixed, one reading, or one whose take is in the trash", got == [], got)

    # 6 · the Artist's runs drawn for a take
    artist.setup(kit=kit, jobs=jobs, lock=lock, say=lambda s: None, outputs=out)
    ah = artist.home()

    def art(rid, age_h, **r):
        d = ah / rid
        d.mkdir(parents=True)
        (d / "run.json").write_text(json.dumps(dict({"id": rid, "created": now - age_h * 3600, "pictures": [{"file": "p.png", "kept": True}]}, **r)))
        t = now - age_h * 3600
        os.utime(d / "run.json", (t, t))
    art("20261101-000000-a001", 48, take="keep")                                   # its take is here
    art("20261101-000000-a002", 48, take="gone2")                                  # drawn for a take gone
    art("20261101-000000-a003", 48)                                                # the Artist's own: no take
    art("20261101-000000-a004", 48, take="gone2", covers=[{"take": "keep", "file": "p.png"}])   # it gave keep a cover
    art("20261101-000000-a005", 48, take="gone2")                                  # keep's artwork names it
    (out / "keep" / "artwork.json").write_text(json.dumps({"run": "20261101-000000-a005", "file": "p.png"}))
    art("20261101-000000-a006", 48, take="gone2", pictures=[{"file": "p.png", "protected": True}])
    art("20261101-000000-a007", 2, take="gone2")                                   # young
    roots = [out] + [d for d in collection.trash_dir(kit).iterdir() if collection.DAY_RE.match(d.name)]
    got = artist.prune_for_takes(present, roots)
    check("the Artist: only the old run drawn for a take gone, nothing else pointing at it, to its trash",
          got == ["20261101-000000-a002"] and (artist.trash_dir() / "20261101-000000-a002" / "run.json").is_file(), got)
    got = artist.prune_for_takes(present, roots, ["gone2"])
    check("  a take just emptied: the young one too; never one that gave a cover, one an artwork names, or a protected one",
          got == ["20261101-000000-a007"] and sorted(p.name for p in ah.iterdir()) == ["20261101-000000-a001", "20261101-000000-a003",
                                                                                         "20261101-000000-a004", "20261101-000000-a005",
                                                                                         "20261101-000000-a006"], got)
    check("  given back from the Artist's trash", artist.restore("20261101-000000-a002") == {"restored": "20261101-000000-a002"})
print(("FAILED " if fails else "all passed ") + str(fails))
sys.exit(1 if fails else 0)
