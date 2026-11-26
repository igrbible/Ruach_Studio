"""HERESY 2997: peakedge.channels gives each channel's peaks on the engine's stretches (frames // n each), the louder of the two as "peaks"; a
one-channel file one list; a file shorter than n frames zeros after its frames. peakedge.take_peaks adds the channels to the engine's peaks.json and
keeps its list, writes the whole file when there is none, and reads nothing again once the channels are there.   python3 lab/test_peakedge_channels_2997.py"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import peakedge  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def engine_peaks(y, n):
    """/library/peaks's own rule (yue-server.cpp): size = T / n, stretch b over [b × size, (b + 1) × size), both channels"""
    size = max(1, len(y) // n)
    return [round(float(np.abs(y[b * size:(b + 1) * size]).max()), 3) for b in range(n) if b * size < len(y)]


with tempfile.TemporaryDirectory() as tmp:
    rate = 48000
    t = np.arange(rate * 10 + 123) / rate
    left = (0.8 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    right = (0.2 * np.sin(2 * np.pi * 330 * t) * (t > 5)).astype(np.float32)   # silent for its first half
    st = Path(tmp) / "stereo.wav"
    sf.write(str(st), np.stack([left, right], axis=1), rate, subtype="FLOAT")
    w = peakedge.channels(st, 900)
    L, R = np.array(w["channels"][0]), np.array(w["channels"][1])
    check("two channels of 900, the length said", len(w["channels"]) == 2 and len(L) == len(R) == len(w["peaks"]) == 900 and abs(w["seconds"] - 10.003) < 0.001,
          (len(w["channels"]), len(L), w["seconds"]))
    check("the left loud all through, the right quiet and silent in its first half", abs(L.mean() - 0.8) < 0.01 and R[:440].max() == 0 and abs(R[460:].mean() - 0.2) < 0.01,
          (L.mean(), R[:440].max(), R[460:].mean()))
    check("peaks the louder of the two in each stretch", w["peaks"] == [round(max(a, b), 3) for a, b in zip(L, R)])
    both = np.stack([left, right], axis=1)
    check("on the engine's stretches", w["peaks"] == engine_peaks(both, 900) and w["channels"][1] == engine_peaks(both[:, 1:], 900),
          next((i for i, (a, b) in enumerate(zip(w["peaks"], engine_peaks(both, 900))) if a != b), None))
    w4 = peakedge.channels(st, 4000)
    check("as many stretches as asked, to 4000", len(w4["peaks"]) == 4000 and len(w4["channels"][1]) == 4000)

    mono = Path(tmp) / "mono.flac"
    sf.write(str(mono), (0.5 * np.sin(2 * np.pi * 100 * t)).astype(np.float32), rate)
    m = peakedge.channels(mono, 300)
    check("a one-channel file gives one list, the same as peaks", len(m["channels"]) == 1 and m["channels"][0] == m["peaks"] and len(m["peaks"]) == 300)

    short = Path(tmp) / "short.wav"
    sf.write(str(short), np.full((50, 2), 0.25, dtype=np.float32), rate, subtype="FLOAT")
    s = peakedge.channels(short, 100)
    check("a file shorter than the stretches: one frame each, zeros after", len(s["peaks"]) == 100 and s["peaks"][:50] == [0.25] * 50 and s["peaks"][50:] == [0.0] * 50,
          s["peaks"][45:55])

    take = Path(tmp) / "take"
    take.mkdir()
    sf.write(str(take / "audio.wav"), both, rate, subtype="PCM_24")
    (take / "peaks.json").write_text('{"peaks":[0.5,0.25,0.125],"seconds":10.003}', encoding="utf-8")   # the engine's, three stretches
    out = peakedge.take_peaks(take)
    kept = json.loads((take / "peaks.json").read_text(encoding="utf-8"))
    check("the engine's list and length kept, its channels added on its stretches", kept["peaks"] == [0.5, 0.25, 0.125] and kept["seconds"] == 10.003 and
          len(kept["channels"]) == 2 and all(len(c) == 3 for c in kept["channels"]) and kept == out, kept)
    check("  no .part left beside it", not (take / ".peaks.json.part").exists())
    (take / "audio.wav").unlink()
    check("  read from the file once: no audio needed again", peakedge.take_peaks(take) == kept)

    fresh = Path(tmp) / "fresh"
    fresh.mkdir()
    sf.write(str(fresh / "audio.flac"), both, rate)
    f = peakedge.take_peaks(fresh)
    check("no peaks.json yet: the whole file on 900 stretches", len(f["peaks"]) == 900 and len(f["channels"]) == 2 and f["seconds"] == 10.003 and
          json.loads((fresh / "peaks.json").read_text(encoding="utf-8")) == f)
    (fresh / "peaks.json").write_text("{broken", encoding="utf-8")
    check("a broken peaks.json made again", len(peakedge.take_peaks(fresh)["channels"][0]) == 900)

    empty = Path(tmp) / "empty"
    empty.mkdir()
    try:
        peakedge.take_peaks(empty)
        check("a take with no audio says so", False, "no error")
    except FileNotFoundError:
        check("a take with no audio says so", True)

print("FAIL: " + "; ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
