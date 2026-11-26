"""HERESY 2987: the Refiner's «Amp (NAM)», on the processor, nothing fetched: the torch pass against NeuralAmpModelerCore's own C++ render (the
two captures of the core's repo, MIT, and their renders of a tiny input in test_nam_2987/); what it cannot read said in words; the list (the
Studio's set by kind with captures.json, the user's own from user/nam/ read anew, a broken file listed with its reason, no path outside its
folder); the sound around it (the stem's loudness kept, the output knob, dry/wet, the DC gone, the mid alone only for a narrow stem, another
rate resampled, a silent stem refused); the step itself through its script's main (a lane, a version, every failure a sentence); its manifest.
    .venv/bin/python lab/test_nam_amp_2987.py"""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import nam_amp  # noqa: E402
import paths  # noqa: E402
import plugins  # noqa: E402

FIX = LAB / "test_nam_2987"
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


def db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.asarray(x, np.float64) ** 2)) + 1e-12)


# ── the engine against the core's C++ render ─────────────────────────────────────────────────────────────────────────
x, _ = sf.read(str(FIX / "in.wav"), dtype="float32")
for name, want in (("wavenet", -100), ("lstm", -90)):
    m = nam_amp.load(FIX / f"{name}.nam")
    ref, _ = sf.read(str(FIX / f"{name}.cpp.wav"), dtype="float32")
    y = m.process(x)
    res = db(y - ref) - db(ref)
    check(f"{name}.nam (Darkglass Microtubes 900 v2, the core's repo): the torch pass is the C++ render to {res:.1f} dB (under {want})",
          len(y) == len(ref) and res < want, res)
check("their metadata read: the gear, the rate, the arch", m.meta.get("gear_make") == "Darkglass Electronics" and m.rate == 48000 and m.arch == "LSTM", (m.meta.get("gear_make"), m.rate, m.arch))
gi, go = nam_amp.gains(nam_amp.load(FIX / "wavenet.nam").meta)
check("the plugin's levels: 12 dBu against its 18.3 dBu input, its −20.02 loudness to −18", abs(gi + 6.3) < 1e-6 and abs(go - 2.02) < 0.01, (gi, go))

with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    film = json.loads((FIX / "wavenet.nam").read_text())
    film["config"]["layers"][0]["conv_pre_film"] = {"active": True}
    (t / "film.nam").write_text(json.dumps(film))
    try:
        nam_amp.load(t / "film.nam")
        check("a capture with FiLM refused", False)
    except NotImplementedError as e:
        check("a capture with FiLM: refused by name, never played", str(e) == "FiLM", e)
    (t / "broken.nam").write_text("{not json")
    try:
        nam_amp.load(t / "broken.nam")
        check("a broken file refused", False)
    except ValueError as e:
        check("a broken file: «not a NAM capture»", "not a NAM capture" in str(e), e)

# ── the list ─────────────────────────────────────────────────────────────────────────────────────────────────────────
with tempfile.TemporaryDirectory() as t:
    kit = Path(t) / "kit"
    kit.mkdir()
    e = nam_amp.listing(kit)
    check("an empty Studio: no capture, the words say where to put one, user/nam/ made to be found",
          e["count"] == 0 and e["empty"] == nam_amp.NONE_HERE and (kit / "user" / "nam").is_dir() and not e["studio"], e)
    studio = paths.at(nam_amp.STUDIO, kit)
    (studio / "bass").mkdir(parents=True)
    (studio / "guitar").mkdir()
    (studio / "bass" / "darkglass.nam").write_bytes((FIX / "wavenet.nam").read_bytes())
    (studio / "guitar" / "toy-lstm.nam").write_bytes((FIX / "lstm.nam").read_bytes())
    (studio / "captures.json").write_text(json.dumps({"captures": [{"file": "bass/darkglass.nam", "name": "Darkglass MT900 v2", "type": "bass",
        "gear": "Darkglass Microtubes 900 v2", "maker": "Darkglass Electronics", "author": "Steven Atkinson", "licence": "MIT",
        "source": "https://github.com/sdatkinson/NeuralAmpModelerCore"}]}))
    u = kit / "user" / "nam"
    (u / "mine").mkdir()
    (u / "mine" / "MyAmp.NAM").write_bytes((FIX / "wavenet.nam").read_bytes())
    (u / "notes.txt").write_text("not a capture")
    (u / "film.nam").write_text(json.dumps(film))
    (u / "broken.nam").write_text("{")
    e = nam_amp.listing(kit)
    ids = [[c["id"] for c in g["captures"]] for g in e["groups"]]
    check("grouped: the guitar amps, the bass amps, then yours (the kinds in their order, an empty kind left out)",
          [g["id"] for g in e["groups"]] == ["guitar", "bass", "yours"] and e["count"] == 5 and e["studio"], [g["id"] for g in e["groups"]])
    check("ids by where and the path under it; another case of .nam is a capture too; a .txt is not",
          ids == [["studio:guitar/toy-lstm.nam"], ["studio:bass/darkglass.nam"], ["user:broken.nam", "user:film.nam", "user:mine/MyAmp.NAM"]], ids)
    dg = e["groups"][1]["captures"][0]
    check("captures.json says who and what (name, gear, maker, author, licence, source)",
          (dg["name"], dg["gear"], dg["maker"], dg["author"], dg["licence"], dg["ok"]) == ("Darkglass MT900 v2", "Darkglass Microtubes 900 v2", "Darkglass Electronics", "Steven Atkinson", "MIT", True), dg)
    toy = e["groups"][0]["captures"][0]
    check("without captures.json, the file's own metadata", (toy["name"], toy["gear"], toy["author"], toy["arch"]) == ("Test LSTM", "Darkglass Electronics Microtubes 900 v2", "Steve", "LSTM"), toy)
    mine = {c["id"]: c for c in e["groups"][2]["captures"]}
    check("yours: read, its licence left to you", mine["user:mine/MyAmp.NAM"]["ok"] and mine["user:mine/MyAmp.NAM"]["licence"] == "", mine["user:mine/MyAmp.NAM"])
    check("a FiLM capture listed, not playable, with its reason", not mine["user:film.nam"]["ok"] and "FiLM" in mine["user:film.nam"]["why"], mine["user:film.nam"])
    check("a broken file listed, not playable, with its reason", not mine["user:broken.nam"]["ok"] and "not a NAM capture" in mine["user:broken.nam"]["why"], mine["user:broken.nam"])
    (u / "new.nam").write_bytes((FIX / "lstm.nam").read_bytes())
    time.sleep(0.01)
    (u / "broken.nam").write_bytes((FIX / "wavenet.nam").read_bytes())
    e2 = nam_amp.listing(kit)
    mine2 = {c["id"]: c for c in e2["groups"][-1]["captures"]}
    check("read anew: a file added is listed, a file rewritten read again", "user:new.nam" in mine2 and mine2["user:broken.nam"]["ok"], sorted(mine2))
    for cid in ("user:../user/nam/new.nam", "studio:../../../user/nam/new.nam", "user:", "elsewhere:x.nam", "", "user:gone.nam", "user:notes.txt"):
        try:
            nam_amp.resolve(kit, cid)
            check(f"{cid!r} refused", False)
        except nam_amp.Refused as x_:
            check(f"{cid!r} refused in words: {x_}", bool(str(x_)), x_)
    check("a capture resolved to its file", nam_amp.resolve(kit, "user:mine/MyAmp.NAM") == (u / "mine" / "MyAmp.NAM").resolve())

    # ── the sound around it ──────────────────────────────────────────────────────────────────────────────────────────
    rate = 48000
    n = rate * 3
    tt = np.arange(n) / rate
    rng = np.random.default_rng(1)
    dry = (0.2 * np.sin(2 * np.pi * 82.4 * tt) * (1 + 0.5 * np.sin(2 * np.pi * 2 * tt)) + 0.02 * rng.standard_normal(n)).astype(np.float32)
    wide = np.stack([dry, np.roll(dry, 300) * 0.8 + 0.03 * rng.standard_normal(n).astype(np.float32)], axis=1)
    narrow = np.stack([dry, dry * 0.999], axis=1)
    wm = nam_amp.load(FIX / "wavenet.nam")
    out, info = nam_amp.render(narrow, rate, wm)
    check("a narrow stem (side 30 dB under): the mid alone, on both channels", info["mid_only"] and np.array_equal(out[:, 0], out[:, 1]), info)
    check("at the stem's own loudness (within 0.5 dB)", abs(nam_amp.level_db(out, rate) - nam_amp.level_db(narrow, rate)) < 0.5, (nam_amp.level_db(out, rate), nam_amp.level_db(narrow, rate)))
    check("no DC left (the 10 Hz high-pass)", float(np.abs(out.mean(axis=0)).max()) < 1e-3, out.mean(axis=0))
    check("no number lost, the length kept", out.shape == narrow.shape and np.all(np.isfinite(out)))
    out2, info2 = nam_amp.render(wide, rate, wm)
    check("a wide stem: each channel its own pass", not info2["mid_only"] and not np.allclose(out2[:, 0], out2[:, 1]), info2)
    o6, _ = nam_amp.render(narrow, rate, wm, out_db=-6.0)
    check("the output knob: −6 dB is 6 dB under the stem", abs((nam_amp.level_db(o6, rate) - nam_amp.level_db(out, rate)) + 6) < 0.05)
    o0, i0 = nam_amp.render(wide, rate, wm, mix=0.0)
    check("dry/wet 0: the stem as it was", np.allclose(o0, wide, atol=1e-6), i0)
    od, idr = nam_amp.render(narrow, rate, wm, drive_db=12.0)
    check("the drive: 12 dB more into the capture, said; the loudness kept", idr["drive_db"] == 12.0 and abs(nam_amp.level_db(od, rate) - nam_amp.level_db(narrow, rate)) < 0.5, idr)
    r44 = 44100
    d44 = dry[: r44 * 2]
    o44, _ = nam_amp.render(d44, r44, wm)
    check("a stem at 44.1 kHz: resampled to the capture's 48 kHz and back, its length kept", o44.shape == (len(d44), 1) and np.all(np.isfinite(o44)), o44.shape)
    try:
        nam_amp.render(np.zeros((rate, 2), np.float32), rate, wm)
        check("a silent stem refused", False)
    except nam_amp.Refused as x_:
        check(f"a silent stem refused in words: {x_}", "silent" in str(x_), x_)

    # ── the step ─────────────────────────────────────────────────────────────────────────────────────────────────────
    spec = importlib.util.spec_from_file_location("nam_step_2987", LAB / "builtin_steps" / "ruach" / "nam.py")
    step = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(step)
    step.KIT = kit
    take = kit / "outputs" / "t1"
    sd = take / "derived" / "stems-1"
    sd.mkdir(parents=True)
    sf.write(str(sd / "guitar.flac"), wide, rate, subtype="PCM_24")
    sf.write(str(sd / "bass.flac"), narrow, rate, subtype="PCM_24")
    (sd / "manifest.json").write_text(json.dumps({"kind": "stems"}))

    def run(params):
        od_ = Path(tempfile.mkdtemp(dir=t))
        pf = od_ / ".params.json"
        pf.write_text(json.dumps(params))
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                step.main(sd, od_, pf)
        except SystemExit as x_:
            return od_, None, str(x_)
        return od_, json.loads(buf.getvalue().strip().splitlines()[-1]), ""

    od_, r, err = run({"stem": "guitar", "capture": "user:mine/MyAmp.NAM", "drive": 3, "level": 0, "mix": 100, "lay": "lane"})
    f = (r or {}).get("files", [{}])[0]
    check("the step: a lane of its own in the DAW, at the stem's length, named by its capture and stem",
          not err and f.get("track") == "nam" and "source" not in f and f["name"] == "NAM · Test Model · guitar" and abs(f["seconds"] - 3.0) < 0.01 and (od_ / "nam.flac").is_file(), (err, r))
    ms = (r or {}).get("measure", {})
    check("its measure: the capture, the gains, the stem, the licence of your own file", ms.get("drive_db") == 3.0 and ms.get("stem") == "guitar" and ms.get("licence") == "your own file" and ms.get("architecture") == "WaveNet", ms)
    od_, r, err = run({"stem": "bass", "capture": "studio:bass/darkglass.nam", "mix": 50, "lay": "version"})
    f = (r or {}).get("files", [{}])[0]
    check("the stem's version: it names the stem it stands for; the Studio's capture by its captures.json name and licence",
          not err and f.get("source") == "derived/stems-1/bass.flac" and "track" not in f and r["measure"]["licence"] == "MIT" and "Darkglass MT900 v2" in r["summary"], (err, r))
    od_, r, err = run({"stem": "vocals", "capture": "studio:bass/darkglass.nam"})
    check("a stem the set lacks: a bass capture takes the bass stem", not err and r["measure"]["stem"] == "bass", (err, r))
    for params, words in (({"capture": ""}, "choose a capture first"), ({"capture": "user:gone.nam"}, "not here any more"),
                          ({"capture": "user:film.nam"}, "cannot read its FiLM"), ({"capture": "user:../x.nam"}, "not here any more")):
        _o, r, err = run(dict(params, stem="guitar"))
        check(f"{params['capture'] or 'no capture'}: said in words, no take ({err})", r is None and words in err, (r, err))
    sf.write(str(sd / "guitar.flac"), np.zeros((rate, 2), np.float32), rate, subtype="PCM_24")
    _o, r, err = run({"stem": "guitar", "capture": "user:mine/MyAmp.NAM"})
    check(f"a silent stem: said, no take ({err})", r is None and "silent" in err, (r, err))
    empty = Path(t) / "empty"
    empty.mkdir()
    step.KIT = empty
    _o, r, err = run({"stem": "guitar", "capture": ""})
    check("no capture anywhere: where to put one", r is None and err == nam_amp.NONE_HERE, err)

# ── the manifest and the lab ─────────────────────────────────────────────────────────────────────────────────────────
built, errs = plugins.load_all(LAB / "no-such-user-plugins", LAB / "builtin_steps")
ruach = [p for p in built if p["id"] == "ruach"][0]
ids = [s["id"] for s in ruach["steps"]]
s = ruach["steps"][ids.index("nam")]
keys = {p["key"]: p for p in s["params"]}
check("plugin.json: «Amp (NAM)» right after Airteq, on a set of stems, among the mending steps",
      s["label"] == "Amp (NAM)" and ids.index("nam") == ids.index("airteq") + 1 and s["after"] == "pl-ruach-airteqPanel" and s["input"] == "stems" and s["group"] == "mend" and not s["gpu"], s)
check("its fields: the stem, the capture (the panel's), the cabinet (2994), the drive, the output, dry/wet, where it lays",
      list(keys) == ["stem", "capture", "cab", "drive", "level", "mix", "lay"] and keys["capture"]["type"] == "text" and (keys["drive"]["min"], keys["drive"]["max"]) == (-12, 24) and
      (keys["mix"]["min"], keys["mix"]["max"], keys["mix"]["default"]) == (0, 100, 100), keys)
c = plugins.clean(s, {"drive": 99, "mix": -5, "capture": "user:x.nam", "lay": "nowhere"})
check("the page's values held to their bounds", c["drive"] == 24 and c["mix"] == 0 and c["capture"] == "user:x.nam" and c["lay"] == "lane", c)
src = (LAB / "lab.py").read_text(encoding="utf-8")
check("the lab lists the captures at /nam/captures (read anew each time the page asks)", 'url.path == "/nam/captures"' in src and "nam_amp.listing(KIT)" in src)

print(f"\ntest_nam_amp_2987: {len(bad)} failed" if bad else "\ntest_nam_amp_2987: all passed")
sys.exit(1 if bad else 0)
