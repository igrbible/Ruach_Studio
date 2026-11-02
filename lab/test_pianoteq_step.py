"""HERESY 1970: the Pianoteq step's own parts, nothing played: where it finds Pianoteq, which stem it takes, the pedal through each phrase, a
copy of the preferences that goes with the render. python3 lab/test_pianoteq_step.py"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "builtin_steps" / "ruach"))
import pianoteq as P  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


with tempfile.TemporaryDirectory() as t:
    kit = Path(t) / "kit"
    found = P.find_pianoteq(kit)
    check("an empty kit: nothing of its own found (only what lives outside it, the home or the PATH)", found is None or not str(found).startswith(str(kit)), found)
    prog = kit / "models" / "instruments" / "pianoteq" / "Pianoteq 9" / "x86-64bit" / "Pianoteq 9"
    prog.parent.mkdir(parents=True)
    prog.write_text("#!/bin/sh\n")
    os.chmod(prog, 0o755)
    (prog.parent / "Pianoteq 9.lv2").mkdir()
    check("the tarball unpacked under models/instruments/pianoteq: its program, not its .lv2 folder", P.find_pianoteq(kit) == prog, P.find_pianoteq(kit))
    own = Path(t) / "elsewhere" / "Pianoteq 9"
    own.parent.mkdir()
    own.write_text("#!/bin/sh\n")
    os.chmod(own, 0o755)
    (kit / "user").mkdir()
    (kit / "user" / "pianoteq.json").write_text(json.dumps({"path": str(own)}))
    check("user/pianoteq.json first", P.find_pianoteq(kit) == own, P.find_pianoteq(kit))
    s = Path(t) / "derived" / "stems-four"
    s.mkdir(parents=True)
    for n in ("vocals", "drums", "bass", "other"):
        (s / (n + ".flac")).write_bytes(b"")
    f, name = P.stem_file(s, "piano")
    check("no piano in a set of four: the other stem", name == "other" and f.name == "other.flac", name)
    f, name = P.stem_file(s, "bass")
    check("the stem asked when the set has it", name == "bass", name)
    try:
        P.stem_file(Path(t) / "derived", "piano")
        check("a folder without stems: said, not guessed", False)
    except FileNotFoundError as e:
        check("a folder without stems: said, not guessed", "has no piano stem" in str(e), e)
    cc = P.pedal([[0.0, 0.5, 60, 0, 0], [0.4, 1.0, 64, 0, 0], [2.0, 2.4, 67, 0, 0]])
    cc = [(round(t, 3), c, v) for t, c, v in cc]
    check("the pedal held through each phrase: down at its first note, up after its last ends", cc == [(0.0, 64, 127), (1.05, 64, 0), (2.0, 64, 127), (2.45, 64, 0)], cc)
    check("no notes, no pedal", P.pedal([]) == [], P.pedal([]))
    work = Path(t) / "work"
    work.mkdir()
    pr = P.own_prefs(work)
    check("its preferences a copy in a folder of its own, under the work folder (never the user's file)", pr.parent.parent == work and pr.name == "prefs", pr)
    if pr.is_file():
        check("the copy readable by its owner alone", oct(os.stat(pr).st_mode & 0o777) == "0o600", oct(os.stat(pr).st_mode & 0o777))
LAB = Path(__file__).resolve().parent                # the Studio's own steps as the lab reads them at each asking (plugins.load_all)
sys.path.insert(0, str(LAB))
import plugins as PK  # noqa: E402
with tempfile.TemporaryDirectory() as t:
    found, broken = PK.load_all(Path(t), LAB / "builtin_steps")
    st = next((x for p in found if p["id"] == "ruach" for x in p["steps"] if x["id"] == "pianoteq"), None)
    check("the lab lists Pianoteq among the Studio's own steps, on a set of stems in Mend, after the Ambient",
          bool(st) and st.get("input") == "stems" and st.get("group") == "mend" and st.get("after") == "pl-ruach-ambientPanel", st and {k: st.get(k) for k in ("input", "group", "after")})
    keys = [q["key"] for q in (st or {}).get("params", [])]
    check("its fields: stem, preset, lay, dynamics, touch, pedal, parts, shift, and the panel's state (HERESY 1977)",
          keys == ["stem", "preset", "lay", "dynamics", "touch", "pedal", "parts", "shift", "state"], keys)
    sq = next((q for q in (st or {}).get("params", []) if q["key"] == "state"), {})
    check("the state a text field, empty by default (the step's own preset then says it all)", sq.get("type") == "text" and sq.get("default") == "", sq)
    pr = next((q for q in (st or {}).get("params", []) if q["key"] == "preset"), {})
    check("18 presets, NY Steinway D Classical first and by default", len(pr.get("options", [])) == 18 and pr.get("default") == "NY Steinway D Classical"
          and pr["options"][0][0] == "NY Steinway D Classical", (len(pr.get("options", [])), pr.get("default")))
    check("no plugin broken by it", not broken, broken)
print("test_pianoteq_step:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
