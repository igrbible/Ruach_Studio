"""HERESY 2994: the Amp (NAM) finished (2987's step): the Studio's set from Engine → Models (the part «nam»: goldhub/Ruach_Studio_Models_v2 under
nam/ at its own pin, every file in our manifest, landing in models/refiner/nam/ where nam_amp.py lists it); the generic cab (a filter drawn
zero-phase: a guitar speaker's band and mid curve, no delay, the length kept), on Auto after the Studio's guitar amp heads only; dry/wet as an
equal-power blend brought back to the stem's loudness, so «0 dB keeps the stem's place» holds at every dry/wet; the step's «cab» field.
Offline, on the processor, nothing fetched.
    .venv/bin/python lab/test_nam_finish_2994.py"""
import contextlib
import importlib.util
import io
import json
import re
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
sys.path.insert(0, str(LAB))
import nam_amp  # noqa: E402
import paths  # noqa: E402
import plugins  # noqa: E402
import weights  # noqa: E402

FIX = LAB / "test_nam_2987"
V2 = "goldhub/Ruach_Studio_Models_v2"
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else f"  ({got})"))
    if not ok:
        bad.append(what)


# ── the part: the pin, our manifest, where it lands ─────────────────────────────────────────────────────────────────────
pin = ""
for line in (KIT / "heresy" / "hf-revisions.txt").read_text(encoding="utf-8").splitlines():
    c = line.split()
    if c and c[0] == V2 + "#nam":
        pin = c[1]
check("heresy/hf-revisions.txt pins the captures on their own line (REPO#nam)", bool(re.fullmatch(r"[0-9a-f]{40}", pin)), pin)
man = [ln.split("\t") for ln in (KIT / "heresy" / "hf-manifest.tsv").read_text(encoding="utf-8").splitlines() if ln.startswith(V2 + "\t" + pin + "\t")]
files = {m[2]: (int(m[3]), m[4]) for m in man}
check("our manifest holds every file at that pin: captures.json, README.md and the captures, each with its size and SHA-256",
      "nam/captures.json" in files and "nam/README.md" in files and sum(f.endswith(".nam") for f in files) >= 10 and
      all(re.fullmatch(r"[0-9a-f]{64}", s) and n > 0 for n, s in files.values()), sorted(files))
total = sum(n for n, _ in files.values())
check(f"the part's size on the card is the pinned files' ({total} bytes)", abs(weights._bytes(weights.PARTS["nam"]) - total) < 100_000, (weights.PARTS["nam"], total))
check(f"nam/* lands in {paths.REFINER_NAM}/, the set nam_amp.py lists", paths.hf_place("nam/*") == ("nam/", paths.REFINER_NAM) == ("nam/", nam_amp.STUDIO) and
      paths.new_of("nam/guitar/x.nam") == paths.REFINER_NAM + "/guitar/x.nam")
check("Engine → Models fetches it as a part (fetch-heresy.sh --only nam), named in the run", weights._args({"part": "nam"}) == (["--only", "nam"], "the NAM amps"))
sh = (KIT / "heresy" / "fetch-heresy.sh").read_text(encoding="utf-8")
check("fetch-heresy.sh: the part at its own pin, nam/* through hf_into", "if want nam; then" in sh and 'k="goldhub/Ruach_Studio_Models_v2#nam"' in sh and
      'goldhub/Ruach_Studio_Models_v2 "nam/*"' in sh and 'PIN_AS="$NREV" hf_into' in sh)
check("launcher/paths.sh knows the set's folder and the map's line (lab/paths.py --sh)", f'RS_REFINER_NAM="$ROOT/{paths.REFINER_NAM}"' in
      (KIT / "launcher" / "paths.sh").read_text(encoding="utf-8") and "'^nam/(.+)$'" in (KIT / "launcher" / "paths.sh").read_text(encoding="utf-8"))

# ── the generic cab ────────────────────────────────────────────────────────────────────────────────────────────────────
for rate in (44100, 48000, 96000):
    h = nam_amp.cab_taps(rate)
    n = 1 << 20
    H = np.abs(np.fft.rfft(h, n))
    at = lambda f: 20 * np.log10(H[int(round(f * n / rate))] + 1e-12)   # noqa: E731
    check(f"{rate} Hz: an odd, symmetric filter (zero-phase once centred)", len(h) % 2 == 1 and np.allclose(h, h[::-1]), len(h))
    got = {f: round(float(at(f)), 1) for f in (40, 70, 130, 500, 1000, 2500, 5500, 8000)}
    check(f"{rate} Hz: a speaker's band and its mid curve as written (40 Hz −30, 130 Hz +1, 500 Hz −2.5, 2.5 kHz +3, 8 kHz −30)",
          got[40] < -24 and abs(got[130] - 1) < 1.5 and abs(got[500] + 2.5) < 1 and abs(got[1000]) < 1 and abs(got[2500] - 3) < 1 and got[5500] < -7 and got[8000] < -26, got)
imp = np.zeros((48000, 2))
imp[24000] = 1.0
y = nam_amp.cab(imp, 48000)
check("no delay: an impulse comes out where it went in, the length kept", y.shape == imp.shape and int(np.argmax(np.abs(y[:, 0]))) == 24000 and np.allclose(y[:, 0], y[:, 1]))

# ── the sound: the cab in the chain, dry/wet that keeps the stem's place ─────────────────────────────────────────────────
rate = 48000
tt = np.arange(rate * 3) / rate
rng = np.random.default_rng(7)
dry = (0.2 * np.sin(2 * np.pi * 110 * tt) * (1 + 0.5 * np.sin(2 * np.pi * 3 * tt)) + 0.02 * rng.standard_normal(len(tt))).astype(np.float32)
stem = np.stack([dry, np.roll(dry, 200) * 0.8 + 0.03 * rng.standard_normal(len(tt)).astype(np.float32)], axis=1)
wm = nam_amp.load(FIX / "wavenet.nam")
lin = nam_amp.level_db(stem, rate)
o1, i1 = nam_amp.render(stem, rate, wm, mix=1.0, with_cab=True)
check("through the generic cab: said, at the stem's loudness, its length, no DC", i1["cab"] == "generic" and abs(nam_amp.level_db(o1, rate) - lin) < 0.5 and
      o1.shape == stem.shape and float(np.abs(o1.mean(axis=0)).max()) < 1e-3, i1)
o1n, i1n = nam_amp.render(stem, rate, wm, mix=1.0)
check("without it: nothing said, another sound", i1n["cab"] == "" and not np.allclose(o1, o1n, atol=1e-3))
for mix in (0.25, 0.5, 0.75):
    o, info = nam_amp.render(stem, rate, wm, mix=mix)
    check(f"dry/wet {round(mix * 100)} %: at the stem's loudness (0 dB keeps its place at every dry/wet)", abs(nam_amp.level_db(o, rate) - lin) < 0.3,
          (nam_amp.level_db(o, rate), lin, info["blend_db"]))
o6, _ = nam_amp.render(stem, rate, wm, mix=0.5, out_db=-6.0)
check("the output knob at half: −6 dB is 6 dB under the stem", abs(nam_amp.level_db(o6, rate) - lin + 6) < 0.3, nam_amp.level_db(o6, rate) - lin)
o0, _ = nam_amp.render(stem, rate, wm, mix=0.0)
check("dry/wet 0 still the stem as it was", np.allclose(o0, stem, atol=1e-6))
src = (LAB / "nam_amp.py").read_text(encoding="utf-8")
check("equal power: the amp at √mix, the stem at √(1 − mix)", "math.sqrt(mix) * wet + math.sqrt(1.0 - mix)" in src)

# ── the list and the step: Auto is the cab after the Studio's guitar amp heads alone ─────────────────────────────────────
with tempfile.TemporaryDirectory() as t:
    kit = Path(t) / "kit"
    st = paths.at(nam_amp.STUDIO, kit)
    for sub in ("guitar", "bass"):
        (st / sub).mkdir(parents=True)
    head = json.loads((FIX / "wavenet.nam").read_text(encoding="utf-8"))
    combo = json.loads(json.dumps(head))
    combo["metadata"]["gear_type"] = "amp_cab"
    nameless = json.loads(json.dumps(head))
    nameless["metadata"].pop("gear_type", None)
    (st / "guitar" / "head.nam").write_text(json.dumps(head))
    (st / "guitar" / "combo.nam").write_text(json.dumps(combo))
    (st / "guitar" / "nameless.nam").write_text(json.dumps(nameless))
    (st / "bass" / "bhead.nam").write_text(json.dumps(head))
    (kit / "user" / "nam").mkdir(parents=True)
    (kit / "user" / "nam" / "mine.nam").write_text(json.dumps(head))
    heads = {c["id"]: c["head"] for g in nam_amp.listing(kit)["groups"] for c in g["captures"]}
    check("the list says which are amp heads: the Studio's guitar amps captured without a cabinet (its gear type amp or not said); not a combo, a bass amp or yours",
          heads == {"studio:guitar/combo.nam": False, "studio:guitar/head.nam": True, "studio:guitar/nameless.nam": True, "studio:bass/bhead.nam": False,
                    "user:mine.nam": False}, heads)
    spec = importlib.util.spec_from_file_location("nam_step_2994", LAB / "builtin_steps" / "ruach" / "nam.py")
    step = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(step)
    step.KIT = kit
    sd = kit / "outputs" / "t1" / "derived" / "stems-1"
    sd.mkdir(parents=True)
    sf.write(str(sd / "guitar.flac"), stem, rate, subtype="PCM_24")
    sf.write(str(sd / "bass.flac"), stem, rate, subtype="PCM_24")

    def run(params):
        od = Path(tempfile.mkdtemp(dir=t))
        (od / ".params.json").write_text(json.dumps(params))
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                step.main(sd, od, od / ".params.json")
        except SystemExit as e:
            return None, str(e)
        return json.loads(buf.getvalue().strip().splitlines()[-1]), ""

    for params, want in (({"capture": "studio:guitar/head.nam"}, "generic"), ({"capture": "studio:guitar/head.nam", "cab": "off"}, ""),
                         ({"capture": "studio:guitar/combo.nam", "cab": "auto"}, ""), ({"capture": "studio:bass/bhead.nam", "stem": "bass"}, ""),
                         ({"capture": "user:mine.nam"}, ""), ({"capture": "user:mine.nam", "cab": "generic"}, "generic")):
        r, err = run(dict({"stem": "guitar", "mix": 100}, **params))
        got = (r or {}).get("measure", {}).get("cab")
        check(f"the step, cab {params.get('cab', 'auto')} on {params['capture']}: {'the generic cab, said in the summary' if want else 'no cab'}",
              not err and got == want and (("through the generic cab" in r["summary"]) == bool(want)), (err, got, (r or {}).get("summary")))

# ── its field ─────────────────────────────────────────────────────────────────────────────────────────────────────────
built, errs = plugins.load_all(LAB / "no-such-user-plugins", LAB / "builtin_steps")
s = [x for x in [p for p in built if p["id"] == "ruach"][0]["steps"] if x["id"] == "nam"][0]
keys = {p["key"]: p for p in s["params"]}
cab = keys.get("cab", {})
check("plugin.json: «Cabinet» right after the capture, Auto by default, the generic cab or none",
      list(keys).index("cab") == list(keys).index("capture") + 1 and cab["type"] == "select" and cab["default"] == "auto" and
      [o[0] for o in cab["options"]] == ["auto", "generic", "off"] and "not a recorded cabinet" in cab["tip"], cab)
check("the page's value held to the options", plugins.clean(s, {"cab": "marshall-4x12"})["cab"] == "auto" and plugins.clean(s, {"cab": "off"})["cab"] == "off")
check("the output's and dry/wet's tips say what is true: at any dry/wet, an equal-power blend", "at any dry/wet" in keys["level"]["tip"] and "equal-power" in keys["mix"]["tip"])

print(f"\ntest_nam_finish_2994: {len(bad)} failed" if bad else "\ntest_nam_finish_2994: all passed")
sys.exit(1 if bad else 0)
