"""HERESY 3012: a NAM capture of the user's own, added from the Refiner's Amp (NAM) step («Add capture…»): nam_amp.add reads the bytes as the step
will play them (JSON, an architecture the torch engine lays out, a sane size) and keeps them in user/nam/ under a safe name (any script's letters
kept, never outside user/nam/, never hidden, never a name Windows reserves; the same bytes again are the same file, another file of that name gets
-2); every refusal in words and nothing left behind; the lab's POST /nam/capture-add answers 400 with the words. Offline, on the processor.
    .venv/bin/python lab/test_nam_capture_add.py"""
import json
import sys
import tempfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import nam_amp  # noqa: E402

FIX = LAB / "test_nam_2987"
ok = bad = 0


def check(what, cond, info=""):
    global ok, bad
    if cond:
        ok += 1
    else:
        bad += 1
        print("FAIL", what, info)


def refused(kit, data, name="x.nam"):
    try:
        nam_amp.add(kit, data, name)
    except nam_amp.Refused as e:
        return str(e)
    return None


def first_key(d, key):
    if isinstance(d, dict):
        if key in d:
            return d
        for v in d.values():
            r = first_key(v, key)
            if r is not None:
                return r
    if isinstance(d, list):
        for v in d:
            r = first_key(v, key)
            if r is not None:
                return r
    return None


wave, lstm = (FIX / "wavenet.nam").read_bytes(), (FIX / "lstm.nam").read_bytes()
with tempfile.TemporaryDirectory(prefix="nam add ") as td:
    kit = Path(td) / "Студия 2.1"
    kit.mkdir()
    user = kit / "user" / "nam"

    a = nam_amp.add(kit, wave, "My Amp (Twin).nam")
    check("a WaveNet capture kept in user/nam/ under a safe name, read as the step reads it", a["id"] == "user:" + a["file"] and (user / a["file"]).read_bytes() == wave and
          a["arch"] == "WaveNet" and a["same"] is False and set(a["file"]) <= set("MyAmp _Twin-.nam") and a["file"].endswith(".nam"), json.dumps(a))
    b = nam_amp.add(kit, wave, "My Amp (Twin).nam")
    check("  the same bytes again: the same file, said, no copy", b["file"] == a["file"] and b["same"] is True and len(list(user.glob("*.nam"))) == 1, json.dumps(b))
    c = nam_amp.add(kit, lstm, "My Amp (Twin).nam")
    check("  another capture of that name: «-2», the first untouched", c["file"] == a["file"][:-4] + "-2.nam" and c["arch"] == "LSTM" and (user / a["file"]).read_bytes() == wave, json.dumps(c))
    d = nam_amp.add(kit, lstm, "Усилок «мой» 1.nam")
    check("  a Cyrillic name kept as it is, its marks made safe", d["file"] == "Усилок _мой_ 1.nam", d["file"])
    e = nam_amp.add(kit, wave, "../../../etc/passwd.nam")
    check("  a path in the name: its last part only, inside user/nam/", e["file"] == "passwd.nam" and (user / "passwd.nam").is_file() and not (kit / "etc").exists(), e["file"])
    f = nam_amp.add(kit, lstm, "C:\\Users\\x\\Downloads\\CON.nam")
    check("  a Windows path and a reserved name: «_CON.nam»", f["file"] == "_CON.nam", f["file"])
    g = nam_amp.add(kit, wave, "...nam")
    check("  no name left: the capture's own name, else «capture»", g["file"].endswith(".nam") and not g["file"].startswith(".") and len(g["file"]) > 4, g["file"])
    names = sorted(x["id"] for grp in nam_amp.listing(kit)["groups"] for x in grp["captures"] if grp["id"] == "yours")
    check("  the step's list has them all, each one playable", set(names) >= {a["id"], c["id"], d["id"], e["id"], f["id"]} and
          all(x["ok"] for grp in nam_amp.listing(kit)["groups"] for x in grp["captures"]), json.dumps(names, ensure_ascii=False))

    before = sorted(p.name for p in user.iterdir())
    check("refused: nothing sent", refused(kit, b"") == "no file was sent")
    check("  over 64 MB", refused(kit, b" " * (nam_amp.ADD_MOST + 1)) == "a NAM capture is at most 64 MB")
    check("  a few bytes", refused(kit, b"{}") == "too small to be a NAM capture")
    check("  not JSON (a WAV)", refused(kit, b"RIFF" + bytes(200)) == "not a NAM capture: a .nam file is JSON, and this is not")
    check("  JSON with no architecture or weights", refused(kit, json.dumps({"version": "0.5.4", "config": {}, "x": "y" * 80}).encode()) == "not a NAM capture: it has no architecture or weights")
    w = json.loads(wave)
    w2 = dict(w, architecture="Transformer")
    check("  an architecture the Studio does not play, named", (refused(kit, json.dumps(w2).encode()) or "").startswith("its architecture «Transformer» is not one the Studio plays"))
    w3 = dict(w, config={"layers": "broken"})
    r3 = refused(kit, json.dumps(w3).encode()) or ""
    check("  a WaveNet it cannot lay out, said as such", r3.startswith("a NAM file the Studio cannot lay out"), r3)
    w4 = json.loads(wave)
    first_key(w4, "activation")["activation"] = "Mish"
    r4 = refused(kit, json.dumps(w4).encode()) or ""
    check("  a part the engine cannot read yet, named (never silence)", r4 == "the Studio cannot read its the activation Mish yet", r4)
    check("  no refusal leaves a file behind (no .part, nothing new)", sorted(p.name for p in user.iterdir()) == before, json.dumps(sorted(p.name for p in user.iterdir()), ensure_ascii=False))

src = (LAB / "lab.py").read_text(encoding="utf-8")
check("the lab's POST /nam/capture-add: nam_amp.add with ?name=, a refusal 400 with its words",
      'if url.path == "/nam/capture-add":' in src and 'nam_amp.add(KIT, body, q.get("name", ""))' in src and 'except nam_amp.Refused as e:\n                    return self.send(400, {"error": str(e)})' in src)
print(f"{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
