"""HERESY 1460: plugins.py on a plugin made here: what is listed, what is left out, the fields cleaned, a step run as the lab runs it."""
import json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import plugins as k

with tempfile.TemporaryDirectory() as t:
    root = Path(t)
    good = root / "good"; good.mkdir()
    (good / "copy.py").write_text("import json, shutil, sys, pathlib\n"
                                   "a, o, pf = sys.argv[1:4]\np = json.load(open(pf))\n"
                                   "shutil.copy(a, pathlib.Path(o) / 'out.wav')\n"
                                   "print('a word before')\nprint(json.dumps({'files': [{'name': 'copy ' + str(p['gain']), 'file': 'out.wav'}], 'measure': {'p': p}, 'took': 0.1}))\n")
    json.dump({"id": "good", "name": "Good one", "steps": [
        {"id": "copy", "label": "Copy", "say": "a copy", "script": "copy.py", "params": [
            {"key": "gain", "type": "number", "min": -6, "max": 6, "step": 0.5, "default": 1},
            {"key": "mode", "type": "select", "options": [["a", "A"], ["b", "B"]], "default": "b"},
            {"key": "glue", "type": "check", "default": True},
            {"key": "bad key", "type": "number"}, {"key": "odd", "type": "slider"}]},
        {"id": "escape", "script": "../outside.py"}, {"id": "missing", "script": "nope.py"}]}, open(good / "plugin.json", "w"))
    bad = root / "bad"; bad.mkdir()
    (bad / "plugin.json").write_text("{not json")
    noid = root / "noid"; noid.mkdir()
    json.dump({"id": "Has Spaces", "steps": []}, open(noid / "plugin.json", "w"))
    plugs, errors = k.load(root)
    assert [p["id"] for p in plugs] == ["good"], plugs
    assert sorted(e["plugin"] for e in errors) == ["bad", "noid"], errors
    steps = plugs[0]["steps"]
    assert [s["id"] for s in steps] == ["copy"], steps                      # outside its folder and missing: left out
    assert [p["key"] for p in steps[0]["params"]] == ["gain", "mode", "glue"], steps[0]["params"]
    pub = k.public(plugs)
    assert "script" not in pub[0]["steps"][0] and "folder" not in pub[0], pub
    plugin, step = k.find(plugs, "good", "copy")
    assert k.clean(step, {"gain": "99", "mode": "z", "glue": "0"}) == {"gain": 6.0, "mode": "b", "glue": False}
    assert k.clean(step, None) == {"gain": 1.0, "mode": "b", "glue": True}
    try:
        k.find(plugs, "good", "nope"); raise SystemExit("found a step that is not there")
    except ValueError:
        pass
    src = root / "in.wav"; src.write_bytes(b"RIFF....WAVE")
    out = root / "out"; out.mkdir()
    pf = out / ".params.json"; json.dump(k.clean(step, {"gain": 2}), open(pf, "w"))
    r = subprocess.run(k.command(plugin, step, src, out, pf, sys.executable), cwd=plugin["folder"], capture_output=True, text=True)
    res = k.result(r.stdout)
    assert res["files"] == [{"name": "copy 2.0", "file": "out.wav", "seconds": None}] and (out / "out.wav").is_file(), res
    for said in ('{"files": [{"file": "../x.wav"}]}', '{"files": []}', ""):
        try:
            k.result(said); raise SystemExit("took " + said)
        except (RuntimeError, ValueError):
            pass
    # HERESY 1484: a report among a step's files is text (read, not played); its summary rides with the branch, 300 characters at most
    rep = k.result('{"files": [{"name": "report", "file": "report.txt"}, {"file": "out.flac"}], "summary": "' + "x" * 400 + '"}')
    assert rep["files"][0]["kind"] == "text" and "kind" not in rep["files"][1] and len(rep["summary"]) == 300, rep
    assert k.result('{"files": [{"file": "a.wav"}]}')["summary"] == ""
    # HERESY 1464: a step on a set of stems, with a python of its own
    other = root / "other"; other.mkdir()
    (other / "mix.py").write_text("print('{}')")
    json.dump({"id": "other", "steps": [{"id": "mix", "script": "mix.py", "input": "stems", "python": sys.executable},
                                        {"id": "lost", "script": "mix.py", "python": "nope/bin/python"}]}, open(other / "plugin.json", "w"))
    plugs, _ = k.load(root)
    o = [p for p in plugs if p["id"] == "other"][0]
    assert [s["id"] for s in o["steps"]] == ["mix"] and o["steps"][0]["input"] == "stems", o
    assert k.public(plugs)[[p["id"] for p in plugs].index("other")]["steps"][0]["input"] == "stems"
    assert k.command(o, o["steps"][0], src, out, pf, "/lab/python")[0] == sys.executable
    assert k.command(plugin, step, src, out, pf, "/lab/python")[0] == "/lab/python" and step["input"] == "file"
    # HERESY 1465: a GPU step and the room it asks for
    gpu = root / "gpu"; gpu.mkdir()
    (gpu / "g.py").write_text("print('{}')")
    json.dump({"id": "gpu", "steps": [{"id": "a", "script": "g.py", "gpu": True, "need_mb": 6000},
                                      {"id": "b", "script": "g.py", "gpu": True, "need_mb": "lots"},
                                      {"id": "c", "script": "g.py", "need_mb": 99999}]}, open(gpu / "plugin.json", "w"))
    plugs, _ = k.load(root)
    g = [p for p in plugs if p["id"] == "gpu"][0]["steps"]
    assert [(s["gpu"], s["need_mb"]) for s in g] == [(True, 6000), (True, 8000), (False, 24000)], g
    assert step["gpu"] is False and step["need_mb"] == 8000, step
    # HERESY 1465b: the files a step is made for, plain words only, said to the page
    json.dump({"id": "pref", "steps": [{"id": "v", "script": "g.py", "prefer": ["lead_vocal", "vocals", "../x", "Bad Name"]}]},
              open(gpu / "plugin.json", "w"))
    plugs, _ = k.load(root)
    v = [p for p in plugs if p["id"] == "pref"][0]["steps"][0]
    assert v["prefer"] == ["lead_vocal", "vocals"], v
    assert k.public(plugs)[[p["id"] for p in plugs].index("pref")]["steps"][0]["prefer"] == ["lead_vocal", "vocals"]
    # HERESY 1572: a step through gear outside the machine, and the one stem a step mends, kept and said to the page
    json.dump({"id": "hw", "steps": [{"id": "a", "script": "g.py", "hardware": True, "stem": "lead_vocal"}, {"id": "b", "script": "g.py", "stem": "../x"}]},
              open(gpu / "plugin.json", "w"))
    plugs, _ = k.load(root)
    h = [p for p in plugs if p["id"] == "hw"][0]["steps"]
    assert (h[0]["hardware"], h[0]["stem"], h[1]["hardware"], h[1]["stem"]) == (True, "lead_vocal", False, ""), h
    pub = k.public(plugs)[[p["id"] for p in plugs].index("hw")]["steps"]
    assert (pub[0]["hardware"], pub[0]["stem"]) == (True, "lead_vocal"), pub
print("plugins: 24 checks passed")


# HERESY 1589: MIDI scripts: a plugin of them alone is listed; a script outside its folder, not .js, or with a broken pattern is left out;
# what the page sees has no path
with tempfile.TemporaryDirectory() as t:
    root = Path(t)
    m = root / "midi-only"; (m / "midi").mkdir(parents=True)
    (m / "midi" / "ox.js").write_text("onMidi(function (b) { if (b[0] === 0x90 && b[1] === 0x5e && b[2]) studio.act('play'); });\n")
    (m / "midi" / "notjs.txt").write_text("x")
    json.dump({"id": "midi-only", "name": "Oxygen", "midi": [
        {"id": "ox", "name": "Oxygen DAW", "script": "midi/ox.js", "ports": "Oxygen.*(MIDIIN2|MIDI 2)"},
        {"id": "far", "script": "../far.js", "ports": "x"}, {"id": "txt", "script": "midi/notjs.txt", "ports": "x"},
        {"id": "badre", "script": "midi/ox.js", "ports": "(("}, {"id": "noports", "script": "midi/ox.js"}]}, open(m / "plugin.json", "w"))
    plugs, errors = k.load(root)
    assert [p["id"] for p in plugs] == ["midi-only"] and not errors, (plugs, errors)
    assert [x["id"] for x in plugs[0]["midi"]] == ["ox"], plugs[0]["midi"]
    pub = k.public(plugs)[0]
    assert pub["midi"] == [{"id": "ox", "name": "Oxygen DAW", "ports": "Oxygen.*(MIDIIN2|MIDI 2)", "tip": ""}] and pub["steps"] == [], pub
    empty = root / "empty"; empty.mkdir()
    json.dump({"id": "empty", "midi": [{"id": "far", "script": "../far.js", "ports": "x"}]}, open(empty / "plugin.json", "w"))
    plugs, errors = k.load(root)
    assert [e["plugin"] for e in errors] == ["empty"], errors
print("plugins: MIDI scripts ok")
