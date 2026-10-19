"""HERESY 1557–1558: Before and after, and Match to a reference, on takes made here. python3 lab/test_builtin_steps.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import plugins as pk  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def run(script, audio, out, params):
    out.mkdir(parents=True, exist_ok=True)
    pf = out.parent / (out.name + ".json")
    json.dump(params, open(pf, "w"))
    p = subprocess.run([sys.executable, str(HERE / "builtin_steps/ruach" / script), str(audio), str(out), str(pf)], capture_output=True, text=True)
    return (pk.result(p.stdout) if p.returncode == 0 else None), p.stderr[-400:]


sr, n = 44100, 44100 * 12
rng = np.random.default_rng(1557)
white = rng.standard_normal((n, 2))
pink = np.cumsum(white, axis=0)
pink = sosfilt(butter(1, 20, "highpass", fs=sr, output="sos"), pink, axis=0)
pink = 0.1 * pink / np.abs(pink).max()


def shelf_up(x, db, f=5000):
    hi = sosfilt(butter(2, f, "highpass", fs=sr, output="sos"), x, axis=0)
    return x + hi * (10 ** (db / 20) - 1)


with tempfile.TemporaryDirectory() as t:
    take = Path(t, "take")
    (take / "derived").mkdir(parents=True)
    sf.write(str(take / "audio.wav"), pink.astype(np.float32), sr)
    br = take / "derived/x-1"
    br.mkdir()
    sf.write(str(br / "out.flac"), shelf_up(pink, 6).astype(np.float32), sr, subtype="PCM_24")
    json.dump({"id": "x-1", "kind": "upscale", "source": "the take", "files": [{"file": "out.flac", "path": "derived/x-1/out.flac"}]}, open(br / "manifest.json", "w"))
    r, err = run("report.py", br / "out.flac", Path(t, "r1"), {})
    check("Before and after runs on a branch", r is not None, err)
    if r:
        m = r["measure"]
        check("  its before is what it was made from (the take)", m["before"] and m["before"]["file"] == "audio.wav", m.get("before"))
        check("  the air's share up by the shelf, the lows' down", m["after"]["bands"]["air"] - m["before"]["bands"]["air"] > 3 and m["after"]["bands"]["lows"] <= m["before"]["bands"]["lows"],
              (m["after"]["bands"], m["before"]["bands"]))
        check("  a page and a picture, the page read and the picture looked at", [(f["file"], f.get("kind")) for f in r["files"]] == [("report.md", "text"), ("report.png", "image")], r["files"])
        check("  its line says the loudness and where it changed most", r["summary"].startswith("against audio.wav: +") and "Hz" in r["summary"], r["summary"])
    st = take / "derived/stems-1"
    st.mkdir()
    json.dump({"kind": "stems", "source": "the take", "files": []}, open(st / "manifest.json", "w"))
    dw = take / "derived/daw-1"
    dw.mkdir()
    sf.write(str(dw / "mix.flac"), (pink * 0.5).astype(np.float32), sr, subtype="PCM_24")
    json.dump({"id": "daw-1", "kind": "daw", "source": "derived/stems-1", "files": [{"file": "mix.flac"}]}, open(dw / "manifest.json", "w"))
    r2, err = run("report.py", dw / "mix.flac", Path(t, "r2"), {})
    check("  a mix of a set goes back to the file the set was split from", r2 and r2["measure"]["before"]["file"] == "audio.wav" and abs(r2["measure"]["after"]["lufs"] - r2["measure"]["before"]["lufs"] + 6.02) < 0.1,
          err or (r2 and r2["measure"]))
    r3, err = run("report.py", take / "audio.wav", Path(t, "r3"), {})
    check("  the take itself measured alone", r3 and r3["measure"]["before"] is None and "LUFS" in r3["summary"], err or (r3 and r3["summary"]))

    ref = Path(t, "ref.wav")
    sf.write(str(ref), (shelf_up(pink, 5) * 1.4).astype(np.float32), sr)
    r4, err = run("match.py", take / "audio.wav", Path(t, "m1"), {"reference": str(ref), "reference_name": "the reference", "amount": 100, "limit": 6, "bands": 6, "loudness": "came"})
    check("Match to a reference runs", r4 is not None, err)
    if r4:
        b = r4["measure"]["bands"]
        up = sum(x["gain_db"] for x in b if x["frequency_hz"] > 3500)
        check("  its bands lift the top toward the reference's shelf", up > 2 and all(abs(x["gain_db"]) <= 6.001 for x in b), b)
        check("  the DAW's own band form (peak, frequency, gain, Q)", all(set(x) == {"id", "type", "enabled", "frequency_hz", "gain_db", "q"} and x["type"] == "peak" for x in b), b[:1])
        y, _ = sf.read(str(Path(t, "m1/matched.flac")), always_2d=True)
        sys.path.insert(0, str(HERE))
        from plenio_core.audio import loudness as ld
        tp = 20 * np.log10(ld.true_peak(y.T, sr))
        lin = ld.measure(pink.T, sr, with_true_peak=False).integrated_lufs
        lout = ld.measure(y.T, sr, with_true_peak=False).integrated_lufs
        check("  as loud as it came, or turned down to hold −1 dBTP, said", (abs(lout - lin) < 0.1 or r4["measure"]["held_db"] < 0) and tp <= -0.99, (lin, lout, tp, r4["measure"]["held_db"]))
        check("  named by the name the lab gives", r4["summary"].startswith("toward the reference:") and r4["files"][0]["name"] == "Matched to the reference", r4["summary"])
    r5, err = run("match.py", take / "audio.wav", Path(t, "m2"), {"reference": ""})
    check("  no reference: said", r5 is None and "choose a reference" in err, err)

    steps = {s["id"]: s for s in pk.load_all(Path(t, "none"), HERE / "builtin_steps")[0][0]["steps"]}
    mp = {q["key"]: q for q in steps["match"]["params"]}
    check("a file field kept, its default empty, cleaned to a string", mp["reference"]["type"] == "file" and mp["reference"]["default"] == ""
          and pk.clean(steps["match"], {"reference": "take:x"})["reference"] == "take:x", mp["reference"])
    check("  Before and after among the looks, after Artifacts; Match in Finish, after the Remaster",
          (steps["report"]["group"], steps["report"]["after"], steps["match"]["group"], steps["match"]["after"]) == ("look", "inspectPanel", "finish", "remasterPanel"))
print("test_builtin_steps:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
