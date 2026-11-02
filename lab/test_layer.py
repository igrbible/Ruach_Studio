"""HERESY 2006: the step «layer» on a kit of its own: a user's SFZ bank laid as a bed and as a drone, its level against the song and its fades,
a strip «layer_…» of the song's length; a bank not on the shelf refused. Needs sfizz_render (build/build-sfizz). python3 lab/test_layer.py"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parent
KIT0 = LAB.parent
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


if not (KIT0 / "build/build-sfizz/out/library/bin/sfizz_render").is_file():
    print("no sfizz_render here: skipped"); sys.exit(0)
sr = 48000
with tempfile.TemporaryDirectory() as k:
    k = Path(k)
    (k / "build").mkdir()
    os.symlink(KIT0 / "build/build-sfizz", k / "build/build-sfizz")
    b = k / "banks" / "test-pad"
    b.mkdir(parents=True)
    t = np.arange(int(3 * sr)) / sr
    sf.write(str(b / "pad.wav"), (0.3 * np.sin(2 * np.pi * 261.63 * t)).astype(np.float32), sr)
    (b / "pad.sfz").write_text("<region> sample=pad.wav pitch_keycenter=60 lokey=0 hikey=127 loop_mode=loop_continuous loop_start=4800 loop_end=139200 ampeg_attack=0.05 ampeg_release=0.5\n")
    (b / "bank.json").write_text(json.dumps({"name": "Test pad", "kind": "drone", "licence": "CC0", "may_ship": True}))
    take = k / "outputs" / "t1"
    sdir = take / "derived" / "stems-x"
    sdir.mkdir(parents=True)
    n = int(20 * sr)
    tt = np.arange(n) / sr
    song = 0.2 * np.sin(2 * np.pi * 110 * tt) * (1 + 0.5 * np.sin(2 * np.pi * 0.5 * tt))
    sf.write(str(take / "audio.wav"), np.stack([song, song], 1).astype(np.float32), sr)
    (sdir / "manifest.json").write_text(json.dumps({"kind": "stems", "source": "the take", "files": []}))
    env = dict(os.environ, RUACH_KIT=str(k))

    def run(params, out):
        out.mkdir(parents=True, exist_ok=True)
        pf = out / "p.json"
        pf.write_text(json.dumps(params))
        p = subprocess.run([sys.executable, str(LAB / "builtin_steps/ruach/layer.py"), str(sdir), str(out), str(pf)], capture_output=True, text=True, env=env, timeout=300)
        return p

    p = run({"bank": "user:test-pad", "how": "bed", "note": "C4", "level": -12, "fade_in": 2, "fade_out": 3}, k / "o1")
    ok = p.returncode == 0
    check("a bed: the step answers", ok, p.stderr[-400:])
    if ok:
        r = json.loads(p.stdout.strip().splitlines()[-1])
        f = r["files"][0]
        y, r2 = sf.read(str(k / "o1" / f["file"]), always_2d=True)
        rms = lambda v, a, b2: float(np.sqrt(np.mean(v[int(a * sr):int(b2 * sr)] ** 2)))
        lvl = 20 * np.log10(rms(y, 5, 15) / rms(np.stack([song, song], 1), 5, 15))
        check("  a strip «layer_test_pad» of the song's length", f["track"] == "layer_test_pad" and abs(len(y) / r2 - 20) < 0.01, (f["track"], len(y) / r2))
        check("  its level against the song about the dB asked (−12)", abs(lvl + 12) < 1.5, lvl)
        w = [rms(y, a, a + 0.4) for a in np.arange(2.5, 16.5, 0.5)]
        check("  it sounds the whole way, every strike held (01.11: a key held past its next strike ended it)", min(w) > max(w) / 2, (min(w), max(w)))
        check("  it fades in from silence and out to it", rms(y, 0, 0.05) < rms(y, 5, 15) / 20 and rms(y, 19.95, 20) < rms(y, 5, 15) / 20, (rms(y, 0, 0.05), rms(y, 19.95, 20)))
        check("  the licence said", r["measure"]["licence"] == "CC0" and "CC0" in r["summary"], r["summary"])
    p = run({"bank": "user:test-pad", "how": "drone", "note": "A2", "level": -18}, k / "o2")
    check("a drone on the note asked (its root and fifth)", p.returncode == 0 and "a drone on A" in p.stdout, (p.stdout[-200:], p.stderr[-300:]))
    p = run({"bank": "user:nothing", "how": "bed"}, k / "o3")
    check("a bank not on the shelf: refused, said", p.returncode != 0 and "no bank" in (p.stderr + p.stdout), p.stderr[-200:])
    p = run({"bank": "user:test-pad", "how": "notes", "midi": ""}, k / "o4")
    check("notes without a MIDI file: refused, said", p.returncode != 0 and "MIDI" in (p.stderr + p.stdout), p.stderr[-200:])
print("FAILED: " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
