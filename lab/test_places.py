#!/usr/bin/env python3
"""HERESY 1261: lab/places.py on a studio of its own in a temporary folder (never this studio's folders): a move on the same disk, one
to another disk (/dev/shm, when it is another device here), back to the studio's folder, the link put back from the record, the
lab's start, a Windows path under WSL and outside it, and the refusals (busy, a test page, no folder, no room). The page's keys in
user/settings.json must outlive every write of "paths".
  .venv/bin/python lab/test_places.py"""
import json
import os
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import places  # noqa: E402

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def wait_job(timeout=60):
    t = time.time()
    while time.time() - t < timeout:
        j = places.listing()["job"]
        if j and j["phase"] in ("done", "failed"):
            return j
        time.sleep(0.05)
    return places.listing()["job"]


def tree(top):
    out = {}
    for root, dirs, files in os.walk(top):
        for f in files:
            p = os.path.join(root, f)
            out[os.path.relpath(p, top)] = os.readlink(p) if os.path.islink(p) else open(p, "rb").read()
    return out


base = Path(tempfile.mkdtemp(prefix="claude-places-"))
shm = Path("/dev/shm") / ("claude-places-" + str(os.getpid()))
kit = base / "studio"
try:
    for d in ("outputs/take-a/derived", "outputs/take-b", "trash", "artist", "writer", "user"):
        (kit / d).mkdir(parents=True)
    (kit / "outputs/take-a/audio.wav").write_bytes(os.urandom(300_000))
    (kit / "outputs/take-a/meta.json").write_text('{"title": "A"}')
    (kit / "outputs/take-b/audio.mp3").write_bytes(os.urandom(120_000))
    os.symlink("../audio.wav", kit / "outputs/take-a/derived/link.wav")
    (kit / "writer/doc.json").write_text('{"title": "Песня"}')
    settings = kit / "user/settings.json"
    settings.write_text(json.dumps({"saved_at": 1, "keys": {"yue2.theme": "igr-day"}}))
    busy = {"on": False}
    places.setup(kit, busy=lambda: busy["on"], settings_lock=threading.Lock(), settings_file=settings, studio_port="9", say=lambda s: None)
    before = tree(kit / "outputs")

    print("the listing")
    rows = {r["name"]: r for r in places.listing()["places"]}
    check("four folders, all in the studio's folder, none linked", sorted(rows) == ["artist", "outputs", "trash", "writer"]
          and all(r["here"] and not r["linked"] for r in rows.values()), json.dumps(rows)[:300])

    print("the refusals")
    check("no folder there: nothing made out of a typo", not places.plan("outputs", str(base / "nowhere"))["ok"])
    check("inside the folder itself", not places.plan("outputs", str(kit / "outputs"))["ok"])
    check("inside the studio's folder", not places.plan("trash", str(kit / "user"))["ok"])
    busy["on"] = True
    try:
        places.move({"name": "outputs", "to": str(base)})
        check("refused while the lab works", False)
    except ValueError:
        check("refused while the lab works", True)
    busy["on"] = False
    try:
        places.move({"name": "outputs", "to": str(base)}, scope="claude")
        check("a test page moves nothing", False)
    except ValueError:
        check("a test page moves nothing", True)
    try:
        places.norm("D:\\Music\\Ruach")
        check("a Windows path outside WSL is refused", places._wsl())
    except ValueError:
        check("a Windows path outside WSL is refused", True)
    real_wsl = places._wsl
    places._wsl = lambda: True
    check("under WSL D:\\Music\\Ruach is /mnt/d/Music/Ruach", places.norm("D:\\Music\\Ruach") == "/mnt/d/Music/Ruach" and places.norm("e:/x/") == "/mnt/e/x")
    places._wsl = real_wsl

    print("a move on the same disk")
    (base / "same").mkdir()
    places.move({"name": "outputs", "to": str(base / "same")})
    j = wait_job()
    out = kit / "outputs"
    check("done, by a rename", j["phase"] == "done" and j["same_disk"] and not j["old"], json.dumps(j))
    check("  the studio's outputs is a link to the new place, the takes whole (a link inside kept a link)",
          out.is_symlink() and os.path.realpath(out) == str(base / "same/outputs") and tree(out) == before)
    d = json.load(open(settings))
    check("  user/settings.json keeps the place, and the page's keys", d.get("paths", {}).get("outputs", {}).get("at") == str(base / "same/outputs")
          and d.get("keys") == {"yue2.theme": "igr-day"}, json.dumps(d))

    if shm.parent.is_dir() and os.stat("/dev/shm").st_dev != os.stat(base).st_dev:
        print("a move to another disk (/dev/shm)")
        shm.mkdir()
        places.move({"name": "outputs", "to": str(shm)})
        j = wait_job()
        check("done, by a copy checked file by file", j["phase"] == "done" and not j["same_disk"] and j["done"] == 420_000 + len('{"title": "A"}'), json.dumps(j))
        check("  the link goes there, the takes whole", os.path.realpath(out) == str(shm / "outputs") and tree(out) == before)
        check("  the old copy kept, renamed, the same files", j["old"].startswith(str(base / "same/outputs.moved-")) and tree(j["old"]) == before, j["old"])
        check("  no .part left behind", not os.path.lexists(str(shm / "outputs.part")))
        print("back to the studio's folder")
        places.move({"name": "outputs", "to": ""})
        j = wait_job()
        check("done: a folder of the studio's own again, the takes whole", j["phase"] == "done" and not out.is_symlink() and out.is_dir() and tree(out) == before, json.dumps(j))
        check("  the copy on the other disk kept, renamed", j["old"].startswith(str(shm / "outputs.moved-")) and tree(j["old"]) == before, j["old"])
        check("  the record says the studio's folder", json.load(open(settings))["paths"]["outputs"]["at"] == "")
        print("no room there")
        keep = places.MARGIN
        places.MARGIN = 1 << 50
        (shm / "two").mkdir()
        places.listing()
        time.sleep(0.5)                                  # the size counted, as the page's first look counts it
        try:
            places.move({"name": "outputs", "to": str(shm / "two")})
            check("the size known: refused at once", False)
        except ValueError as e:
            check("the size known: refused at once, saying how much and how little", "free" in str(e), str(e))
        places.SIZES.clear()
        places.move({"name": "outputs", "to": str(shm / "two")})
        j = wait_job()
        places.MARGIN = keep
        check("  not yet counted: the move counts first and stops before a byte is copied, nothing left, the takes where they were",
              j["phase"] == "failed" and "free" in j["error"] and not os.path.lexists(str(shm / "two/outputs.part")) and tree(out) == before, json.dumps(j))
    else:
        print("  (no /dev/shm on another device here: the copy between disks is not tried)")

    print("the record and the lab's start")
    (base / "pics").mkdir()
    (base / "pics/artist").mkdir()
    (base / "pics/artist/run-1").mkdir()
    places._write_record("artist", {"at": str(base / "pics/artist"), "since": time.time(), "old": ""})
    rows = {r["name"]: r for r in places.listing()["places"]}
    check("the record says elsewhere, the studio's folder holds a folder of its own: said", rows["artist"].get("elsewhere") == str(base / "pics/artist"))
    places.relink({"name": "artist"})
    check("relinked: artist/ is the link to the recorded place", (kit / "artist").is_symlink() and os.path.realpath(kit / "artist") == str(base / "pics/artist"))
    (kit / "trash").rmdir()
    os.unlink(kit / "artist")
    places.boot()
    check("the lab's start: a folder with no record made again, one with a record linked back",
          (kit / "trash").is_dir() and not (kit / "trash").is_symlink() and (kit / "artist").is_symlink())
    (base / "pics/artist/run-1").rmdir()
    os.rename(base / "pics/artist", base / "pics/artist-away")
    rows = {r["name"]: r for r in places.listing()["places"]}
    check("a link to a folder that is not there is said (a disk not mounted)", rows["artist"].get("missing") is True)
    try:
        places.plan("artist", str(base))
        ok = not places.plan("artist", str(base))["ok"]
    except ValueError:
        ok = True
    check("  and nothing moves it", ok)
    d = json.load(open(settings))
    check("the page's keys outlived every write of paths", d.get("keys") == {"yue2.theme": "igr-day"}, json.dumps(d))
finally:
    shutil.rmtree(base, ignore_errors=True)
    shutil.rmtree(shm, ignore_errors=True)

print(f"\ntest_places  {G if not failed else R}{passed} passed, {failed} failed{X}")
sys.exit(1 if failed else 0)
