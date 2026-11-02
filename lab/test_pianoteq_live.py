"""HERESY 1977: the Pianoteq here driven through its own JSON-RPC, on the real program when it is installed (skipped otherwise): its engine
on the silent device, the catalog (presets, small presets, free and locked parameters, scales in Pianoteq's own words, what plays in full
here), one preset's values (its own, not the last one's), a state made a preset file with Pianoteq's own presets folder left as it was, a
phrase heard with it and kept, a setting heard in the sound (a quieter volume plays quieter), the user's preferences untouched, the
server's copy gone."""
import shutil
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pianoteq_live as L

KIT = Path(__file__).resolve().parents[1]
ok = True
def check(what, cond):
    global ok
    print(("ok   " if cond else "FAIL ") + what); ok &= bool(cond)

if L.find(KIT) is None:
    print("skip: no Pianoteq installed here")
    sys.exit(0)
prefs = sorted(Path.home().glob(".config/Modartt/Pianoteq*.prefs"), key=lambda q: q.stat().st_mtime)
m0 = prefs[-1].stat().st_mtime if prefs else None
own = Path.home() / ".local/share/Modartt/Pianoteq/Presets"
def tree():
    return sorted((str(p), p.stat().st_mtime) for p in own.rglob("*")) if own.is_dir() else []
t0 = tree()
work = KIT / "tmp" / "pianoteq-test"
try:
    dev = L.Server(KIT).call("getAudioDeviceInfo")
    dev = dev[0] if isinstance(dev, list) else dev
    check("the engine runs on the silent device (ALSA's null sink of the server's own configuration)",
          dev.get("audio_output_device_name") == L.SILENT and dev.get("status") == "running")
    c = L.catalog(KIT)
    check("the catalog: presets, small presets of each kind, free and locked parameters",
          c["available"] and len(c["presets"]) > 10 and c["free"] > 20 and len(c["small"].get("reverb") or []) > 0 and "volume" in c["params"])
    vol = c["params"]["volume"]
    check("volume's scale in Pianoteq's own words: Off at 0, +12.0 at 1, a number", vol["scale"][0][2] == "Off" and vol["scale"][-1][2] == "+12.0" and vol["kind"] == "number")
    check("a switch is a switch; a pedal is the MIDI's, not a setting", c["params"]["reverb_switch"]["kind"] == "switch" and c["params"]["sustain_pedal"]["pedal"])
    check("every parameter in one section (the pedals in none)",
          sorted(pid for g in c["groups"] for pid in g["params"]) == sorted(pid for pid, m in c["params"].items() if not m["pedal"]))
    again = L.catalog(KIT)
    check("kept: asked again, the same catalog from user/pianoteq-catalog.json", again["built"] == c["built"])
    p = L.preset(KIT, "NY Steinway D Classical")
    check("a preset's values, normalized and in its words", isinstance(p["values"]["volume"][0], float) and isinstance(p["values"]["volume"][1], str))
    g = L.preset(KIT, "Classical Guitar Warm")
    check("each preset its own values (a guitar is not the Steinway read again)",
          sum(1 for k in p["values"] if p["values"][k][0] != g["values"].get(k, [None])[0]) > 20)
    j = L.preset(KIT, "NY Steinway D Jazz")
    bo = L.preset(KIT, "Bösendorfer VC Pop Mix")
    check("each effect slot named by its effect (HERESY 1981): a delay in one preset, a parametric EQ in another, its band's type a choice",
          j["effects"]["1"]["key"].startswith("DelMix") and bo["effects"]["1"]["key"].startswith("PEQ1F")
          and bo["effects"]["1"]["params"]["effect_1_param_4"]["kind"] == "choice")
    cj = L.preset(KIT, "NY Steinway D Jazz", "", {"reverb": "Cathedral"})
    check("a small preset in the base: the reverb it brings, said", cj["small"].get("reverb") == "Cathedral"
          and cj["values"]["reverb_duration"][1] != j["values"]["reverb_duration"][1])
    a = c.get("activation") or {}
    check("what plays in full here, by Pianoteq's word: the activation answers, its presets marked", a.get("status") is not None and
          any(q.get("ok") for q in c["presets"]) and all("ok" in q for q in c["presets"]))
    st = {"preset": "NY Steinway D Classical", "small": {"reverb": c["small"]["reverb"][0]["name"]}, "values": {"volume": 0.4, "reverb_mix": 0.6}}
    f = L.fxp(KIT, st, work / "t.fxp")
    check("a state made a preset file", f.is_file() and f.stat().st_size > 100)
    check("Pianoteq's own presets folder as it was (the moment's preset and its bank gone)", tree() == t0)
    w = L.preview(KIT, st, "chords", work / "pv")
    check("a phrase heard with the state, not silent", w.is_file() and w.stat().st_size > 100000)
    w2 = L.preview(KIT, st, "chords", work / "pv")
    check("the same state and phrase: the same file, kept", w2 == w)
    import numpy as np
    import soundfile as sf
    def rms(f):
        x, _sr = sf.read(str(f), dtype="float32", always_2d=True)
        return 20 * np.log10(float(np.sqrt(np.mean(np.square(x)))) + 1e-12)
    loud = L.preview(KIT, {"preset": "NY Steinway D Classical", "values": {"volume": 0.95}}, "chords", work / "pv")
    soft = L.preview(KIT, {"preset": "NY Steinway D Classical", "values": {"volume": 0.45}}, "chords", work / "pv")
    bare = L.preview(KIT, {"preset": "NY Steinway D Classical"}, "chords", work / "pv")
    lo, so, ba = rms(loud), rms(soft), rms(bare)
    print(f"     volume 0.95: {lo:.1f} dB · the preset's own: {ba:.1f} dB · volume 0.45: {so:.1f} dB")
    check("a setting heard in the sound, each way from the preset's own (HERESY 1981b: 0.45 had been lost to a race and played the bare preset)",
          lo - ba > 3 and ba - so > 3)
    d = L._SRV["dir"]
    L.Server(KIT).stop()
    check("the server stopped and its copy of the preferences gone", L._SRV["proc"] is None and (d is None or not Path(d).exists()))
    check("the user's preferences untouched", m0 is None or prefs[-1].stat().st_mtime == m0)
finally:
    L.Server(KIT).stop()
    shutil.rmtree(work, ignore_errors=True)
print("all ok" if ok else "FAILED")
sys.exit(0 if ok else 1)
