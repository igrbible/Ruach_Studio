"""HERESY 2419-2422 (the narrator-sound lane, night 11→12.11.2026): the «тук» between the Narrator's sentences.
2419: Drama 3 reads a piece in one generation (audio.cpp's own 128-character cut off) and its codes come back beside the sound; the worker keeps
any engine's codes beside the piece. 2420: reader_seam finds the codec's drop of a breath or a room noise to its floor and mends it, nothing
else; the guard takes the offset and the lows under 20 Hz out; reader._seam does both on a piece. 2421: the de-clicker node's spots in a
Narrator take come from its pieces. 2422: «!».» loses its last period, and an engine error is asked again with another seed."""
import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "reader_engines" / "drama3"))
import reader_seam as seam  # noqa: E402

checks = 0


def ok(cond, what):
    global checks
    assert cond, what
    checks += 1


SR = 44100
rng = np.random.default_rng(2420)


def noise(sec, db):
    return rng.standard_normal(int(sec * SR)) * 10 ** (db / 20)


def voice(sec, db, f=150.0, tail=0.05):
    t = np.arange(int(sec * SR)) / SR
    env = np.ones(len(t))
    n = int(tail * SR)
    if n:
        env[-n:] = np.linspace(1, 0, n)                   # a voice dies away over 50 ms, as a word ends
    return np.sin(2 * np.pi * f * t) * 10 ** (db / 20) * np.sqrt(2) * env


FLOOR = -88.0
# the floor, a sentence, its breath in the pause, and the codec's drop of it to the floor at 1.6 s
x = np.concatenate([noise(0.3, FLOOR), voice(1.0, -20) + noise(1.0, FLOOR), noise(0.3, -68), noise(0.7, FLOOR)])
sp = seam.find(x, SR)
ok(len(sp) == 1 and abs(sp[0]["at"] - 1.6) < 0.003, f"the drop found at 1.6 s: {sp}")
y = seam.repair(x, SR, sp)
ok(seam.find(y, SR) == [], "mended, it is found no more")
a, b = int(round((sp[0]["at"] - seam.WIN_S - seam.AT_SPAN_S) * SR)), int(round((sp[0]["at"] + seam.TAIL_S + seam.AT_SPAN_S) * SR))
ok(np.array_equal(x[:a], y[:a]) and np.array_equal(x[b:], y[b:]), "outside its window, sample for sample")
m0, m1 = seam.measure(x, SR, sp)[0], seam.measure(y, SR, sp)[0]
ok(m0["step_db"] > 12 and m1["step_db"] < 6, f"the fall at the spot: {m0['step_db']} dB before, {m1['step_db']} after")
stereo = np.stack([x, x * 0.5])
ys = seam.repair(stereo, SR, sp)
ok(ys.shape == stereo.shape and np.allclose(ys[1], seam.repair(x * 0.5, SR, sp)), "both channels mended alike")

# what is not the codec's drop is never touched
gap = np.concatenate([noise(0.3, FLOOR), voice(1.0, -20) + noise(1.0, FLOOR), noise(0.3, -68), np.zeros(int(0.7 * SR))])
ok(seam.find(gap, SR) == [], "into digital silence (a join's own gap, faded there): no spot")
decay = np.concatenate([noise(0.3, FLOOR), voice(1.0, -20) + noise(1.0, FLOOR), noise(0.3, -68) * np.exp(-np.arange(int(0.3 * SR)) / (0.02 * SR)), noise(0.7, FLOOR)])
decay = decay + rng.standard_normal(len(decay)) * 10 ** (FLOOR / 20)
ok(seam.find(decay, SR) == [], "a breath that dies away by itself: no spot")
stop = np.concatenate([noise(0.3, FLOOR), voice(1.0, -22, tail=0) + noise(1.0, FLOOR), noise(0.7, FLOOR)])
ok(seam.find(stop, SR) == [], "the voice's own stop (far over the floor): no spot")
quiet = noise(2.0, FLOOR)
ok(seam.find(quiet, SR) == [] and np.array_equal(seam.repair(quiet, SR, []), quiet), "nothing found, nothing changed")

# the guard: the offset and the lows under 20 Hz out, the voice kept
g = seam.guard((voice(1.0, -20, 200.0, 0) + 0.01 + voice(1.0, -30, 8.0, 0)).astype(np.float32), SR)
mid = g[SR // 4:3 * SR // 4]
ok(abs(mid.mean()) < 2e-4, f"the offset out: {mid.mean():.2e}")
ok(abs(20 * np.log10(mid.std() / (10 ** (-20 / 20)))) < 0.2, "the 200 Hz voice within 0.2 dB")

# audio.cpp's own cut, as its split_text_chunks_default does
el = ("Αυτό το Στούντιο δεν υπήρχε στα σχέδια κανενός, σε καμία τριμηνιαία αναφορά. Κανείς δεν υπέγραψε προϋπολογισμό ούτε λογάριασε "
      "πόσο μπορεί να σε ξεζουμίσει κάθε μήνα. Το ξεκίνησε ένας άνθρωπος.")
ok([len(c) for c in seam.chunks(el)] == [76, 115], f"the Greek piece of 11.11 in two generations: {[len(c) for c in seam.chunks(el)]}")
ok(seam.chunks(el, 4096) == [el], "with the budget of 2419: one")
ok(len(seam.chunks("Πού είσαι; " * 14)) == 2 and seam.chunks("Πού είσαι; " * 14)[0].endswith(";"), "the Greek question mark: a clause stop there")

# 2420 in the join: reader._seam on a piece trimmed by 0.01 s
import reader  # noqa: E402
p = {}
cut = int(0.01 * SR)
yy = reader._seam(p, x, x[cut:].astype(np.float32), cut, SR)
ok(len(p["mended"]) == 1 and abs(p["mended"][0] - 1.6) < 0.003, f"the piece's knock mended and said: {p}")
ok(seam.find(yy, SR) == [] and len(yy) == len(x) - cut, "the trimmed piece keeps its length, the knock gone")
ok(reader.SEAM_FADE_S >= 0.025 and reader.FADE_S == 0.012, "a run since 2420 fades 30 ms; one before it joins again as it was")

# 2422: the endings that silence Drama 3, and nothing else
ok(reader.sane_ends("Он крикнул: «Стой!». Потом ушёл.") == "Он крикнул: «Стой!» Потом ушёл.", "«!».» loses its period")
ok(reader.sane_ends("«Кто там?».") == "«Кто там?»", "at the very end too")
ok(reader.sane_ends("He said “wait…”. Then") == "He said “wait…” Then", "…” followed by a period")
for keep in ("«Стой». Потом.", "Стой!. Потом", "Это (так!) сказано.", "Ну!».нет"):
    ok(reader.sane_ends(keep) == keep, f"untouched: {keep}")


class Worker:
    def __init__(self, answers, alive=True):
        self.answers, self.seeds, self.live = list(answers), [], alive

    def ask(self, req):
        self.seeds.append(req["opts"]["seed"])
        return self.answers.pop(0)

    def alive(self):
        return self.live


said = []
reader.H["say"] = said.append
w = Worker([{"ok": False, "error": "Drama 3 said 500"}, {"ok": True, "seconds": 3.0}])
piece, run = {"i": 4}, {"of": 9}
m = reader._ask_again(w, {"opts": {"seed": 100}}, "r1", piece, run)
ok(m["ok"] and w.seeds == [100, 100 + 7919] and piece["engine_tries"] == 2, "an engine error asked again with another seed")
ok(any("asked again with another seed" in s for s in said), "said in the log")
w = Worker([{"ok": False, "error": "e1"}] * 3)
try:
    reader._ask_again(w, {"opts": {"seed": 1}}, "r1", {"i": 0}, run)
    ok(False, "three failures end the run")
except RuntimeError as e:
    ok("piece 1 of 9: e1" in str(e) and len(w.seeds) == reader.ENGINE_TRIES, "three tries, then the run fails with the engine's word")
w = Worker([{"ok": False, "error": "dead"}], alive=False)
try:
    reader._ask_again(w, {"opts": {"seed": 1}}, "r1", {"i": 0}, run)
    ok(False, "a dead worker is not asked again")
except RuntimeError:
    ok(len(w.seeds) == 1, "a dead worker is not asked again")

# 2419: Drama 3's request reads the piece whole, through /v1/tasks/run, and its codes come back
import engine as drama  # noqa: E402
b = drama.body("Λόγος.", {"path": "/r.wav", "text": "ref"}, {"temperature": 0.8, "seed": 7})
ok(b["options"]["text_chunk_size"] == drama.WHOLE >= 600, "the whole piece in one generation")
t = drama.task(b)
ok(t["model"] == drama.MODEL_ID and t["request"]["text"] == "Λόγος." and t["request"]["seed"] == 7 and t["request"]["voice_ref"] == "/r.wav"
   and t["request"]["options"]["text_chunk_size"] == drama.WHOLE and t["request"]["max_tokens"] == b["max_tokens"], "the task route's request")
take = {"text": "Λόγος.", "vq_codes": [[k + j for j in range(5)] for k in range(10)]}
res = {"audio": "", "artifacts": [{"id": "drama3_take", "kind": "acoustic_tokens", "payload": base64.b64encode(json.dumps(take).encode()).decode(),
                                   "meta": {"schema": "drama3_take_v1"}}]}
c = drama.codes_of(res)
ok(c["codes"] == take["vq_codes"] and c["hop"] == 2048 and c["sample_rate"] == 44100, "the codes read from the artifact")
ok(drama.codes_of({"artifacts": []}) is None, "no artifact, no codes")

# the worker keeps an engine's codes beside the piece
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    (d / "fake.py").write_text(
        "import numpy as np\n"
        "def load(device, kit):\n    return {}\n"
        "def reference(h, wav, sr, text):\n    return None\n"
        "def say(h, text, ref, opts):\n"
        "    h['last_codes'] = {'codes': [[1, 2, 3], [4, 5, 6]], 'codec': 'fake', 'sample_rate': 8000}\n"
        "    return np.zeros(8000, np.float32), 8000\n")
    req = json.dumps({"op": "say", "id": 1, "text": "x", "opts": {}, "out": str(d / "piece-000.wav")}) + "\n" + json.dumps({"op": "quit"}) + "\n"
    r = subprocess.run([sys.executable, str(HERE / "reader_worker.py"), "--module", str(d / "fake.py"), "--device", "cpu", "--kit", str(d)],
                       input=req, capture_output=True, text=True, timeout=120)
    z = np.load(d / "piece-000.codes.npz")
    ok(z["codes"].tolist() == [[1, 2, 3], [4, 5, 6]] and json.loads(str(z["meta"]))["codec"] == "fake", "piece-000.codes.npz beside the piece")
    # and the take keeps them, the chosen version's
    run = {"id": "r", "engine": "fake", "pieces": [{"i": 0, "text": "x", "at": [0, 1], "lead": 0.0}]}
    take_dir = d / "take"
    take_dir.mkdir()
    reader._codes_to_take(d, take_dir, run)
    with np.load(take_dir / "reader-codes.npz") as tz:
        ok(tz["p000"].tolist() == [[1, 2, 3], [4, 5, 6]] and json.loads(str(tz["meta"]))["pieces"][0]["codec"] == "fake", "reader-codes.npz beside the take")
    ok(run.get("codes") == 1, "the run says how many")

# 2421: the de-clicker's spots in a Narrator take come from its pieces, placed by the run's layout
sys.path.insert(0, str(HERE / "builtin_steps" / "ruach"))
import speech_declick as dc  # noqa: E402
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    dc.LAB = d / "lab"
    rd = d / "reader" / "runs" / "r1"
    rd.mkdir(parents=True)
    sf.write(str(rd / "piece-000.wav"), x.astype(np.float32), SR, subtype="FLOAT")
    lead, at0 = 0.01, 2.0
    json.dump({"pieces": [{"i": 0, "v": 0, "lead": lead, "at": [at0, at0 + len(x) / SR - lead]}]}, open(rd / "run.json", "w"))
    take = d / "outputs" / "t1"
    take.mkdir(parents=True)
    json.dump({"reader": {"run": "r1"}}, open(take / "request.json", "w"))
    sf.write(str(take / "audio.wav"), np.zeros(int(6 * SR), np.float32), SR)
    got = dc.run_spots(take / "audio.wav", int(6 * SR), SR)
    ok(len(got) == 1 and abs(got[0]["at"] - (at0 + 1.6 - lead)) < 0.003 and got[0]["piece"] == 1, f"the piece's knock placed in the take: {got}")
    ok(dc.run_spots(take / "audio.wav", int(5 * SR), SR) is None, "a file not as long as the take: listened to as it is")

print(f"test_reader_seam_2420: {checks} checks passed")
