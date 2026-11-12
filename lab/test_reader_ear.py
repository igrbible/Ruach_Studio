"""HERESY 2266: the Reader's ear and loudness without a card or Whisper. The score (the acute, the tags and the punctuation off, ё folded), a
piece heard far off read again and the closer of the two kept (a worse second reading leaves the first in place), the soft knee's ceiling,
the loudness measured by ffmpeg, a take joined to -16 LUFS."""
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import reader as r

# ---- the score
said = r.Hearer.ref(type("E", (), {"tag_re": re.compile(r"\[[^\[\]\n]{1,80}\]")})(), "[calm, warm] Доро́га домой, — шла через лес!")
assert said == "Доро́га домой, — шла через лес!", said              # what the ear compares: the tags out, the acute kept
c, e, n = r.score(said, "дорога домой шла через лес", "ru")
assert c == 0.0 and e == 0, (c, e, n)                                 # the acute, the tag, the dash and the case are no error
c, e, n = r.score("Ёлка стоит у дома", "елка стоит у дома", "ru")
assert c == 0.0, c
c, e, n = r.score("Доро́га домой шла через лес", "дорога дорога домой шла через лес", "ru")
assert 0.2 < c < 0.4 and e == 6, (c, e)                                # a repeat is caught
assert r.score("Да.", "нет", "ru")[0] is None                         # too short to score
c, e, n = r.score("Это Чтец, он читает через audio.cpp на карте.", "Это Чтец, он читает через аудио ТПП на карте.", "ru")
assert e == 1 and c < 0.05, (c, e)                                      # a Latin word heard back in Cyrillic is no alarm (09.11)
assert r._letters("Доро́га", "ru") == "дорога" and "́" in "Доро́га"  # the key loses the acute, the text keeps it

# ---- the knee: nothing under -3 dBFS touched, no peak past -1 dBFS
x = np.array([0.1, -0.5, 0.7, 0.95, -1.4, 3.0], np.float32)
y = r._knee(x)
assert np.allclose(y[:3], x[:3]) and np.all(np.abs(y) <= r.LIM_CEIL + 1e-6) and y[4] < 0 and np.all(np.diff(np.abs(y[3:])) >= -1e-6), y


class Job(dict):
    pass


with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    sr = 44100
    t = np.arange(sr * 3) / sr
    tone = (0.05 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    sf.write(str(d / "tone.wav"), tone, sr, subtype="FLOAT")
    lufs = r._lufs(d / "tone.wav")
    assert lufs is not None and -33 < lufs < -26, lufs                   # a -26 dBFS sine reads about -29 LUFS
    assert r._lufs(d / "missing.wav") is None                           # a measure that failed is None, never a number

    # ---- the pass: piece 1 heard far off, read again; piece 2 heard far off, its second reading worse, the first kept
    for i in range(3):
        sf.write(str(r._piece_path(d, i)), tone, sr, subtype="FLOAT")
    run = {"id": "t", "title": "test", "pieces": [{"i": i, "text": f"piece {i}", "said": f"piece {i}", "f0": None} for i in range(3)]}
    heard = {0: {"heard": "ok", "cer": 0.0, "edits": 0, "letters": 20},
             1: {"heard": "bad", "cer": 0.3, "edits": 6, "letters": 20},
             2: {"heard": "bad", "cer": 0.2, "edits": 4, "letters": 20}}
    second = {1: {"heard": "good", "cer": 0.05, "edits": 1, "letters": 20}, 2: {"heard": "worse", "cer": 0.4, "edits": 8, "letters": 20}}
    asked = []

    class Ear:
        def __init__(self):
            self.res, self.error = dict(heard), ""

        def put(self, i, wav, said):
            self.res[i] = second[i]

        def wait(self, job, timeout=0):
            return True

    class W:
        def ask(self, req, timeout=0):
            asked.append(req)
            sf.write(req["out"], tone * 2, sr, subtype="FLOAT")
            return {"ok": True, "seconds": 3.0, "gen_s": 1.0, "f0": None}

    reqs = {i: {"op": "say", "text": f"piece {i}", "out": str(r._piece_path(d, i)), "opts": {"seed": 10 + i}, "keep": "a" if i == 0 else None}
            for i in range(3)}
    r.H.setdefault("say", lambda s: None)
    r._hear_pass(d, run, {}, W(), Ear(), reqs, Job())
    # piece 1 close enough on its second reading; piece 2 worse twice, read to HERESY 2295's three readings, its first kept
    assert [q["opts"]["seed"] for q in asked] == [5011, 5012, 10012] and all("keep" not in q for q in asked), asked
    p1, p2 = run["pieces"][1], run["pieces"][2]
    assert p1["reread"]["kept"] == "again" and p1["cer"] == 0.05 and (d / "piece-001.first.wav").is_file(), p1
    assert p2["reread"]["kept"] == "first" and p2["cer"] == 0.2 and not (d / "piece-002.first.wav").is_file(), p2
    assert abs(sf.read(str(r._piece_path(d, 1)))[0].max() - 0.1) < 1e-3 and abs(sf.read(str(r._piece_path(d, 2)))[0].max() - 0.05) < 1e-3
    assert run["rereads"] == 2 and run["heard"] == 3 and run["cer"] == round((0 + 1 + 4) / 60, 4), run

    # ---- a take joined to -16 LUFS (the run since 2264), and the old runs as they were
    run.update(lufs_target=-16.0, gain=None)
    for p in run["pieces"]:
        p["gap"] = 0.2
    secs = r._join(d, run, {"sample_rate": sr})
    assert secs > 8 and run["lufs"] is not None and abs(run["lufs"] + 16.0) < 0.6, run.get("lufs")
    x = sf.read(str(d / "take.wav"))[0]
    assert np.abs(x).max() <= r.LIM_CEIL + 1e-4
    g = run["gain"]
    r._join(d, run, {"sample_rate": sr})                                 # joined again: the same gain, the same take
    assert run["gain"] == g and np.array_equal(sf.read(str(d / "take.wav"))[0], x)
print("test_reader_ear: ok")
