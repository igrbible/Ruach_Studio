"""HERESY 2334: the Reader's pauses without a card. The tags cut the pieces where they stand (narration, verse, dialog, a pause before the first
words and after the last), a run through the real worker on the processor with a made-up engine whose pieces keep a little quiet at their
edges, each pause heard in the take as it was asked to the hundredth of a second; then the editor's shaping: in place (the pieces bit for bit,
Undo back to the take as it was) and into a copy, a child take of the original in the family tree, the original untouched."""
import json, re, sys, tempfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import collection
import no_train
import reader as r
import reader_stress as rs

HERE = Path(__file__).resolve().parent
ENG = {"tag_re": re.compile(r"\[[^\[\]\n]{1,80}\]"), "max_chars": 300}


def ps(text, mode="narration", split="sentence", tags=False):
    return r.pieces(text, mode, split, ENG, tags, 0.35, 0.45, 0.9)


# ---- the tags: where the pieces end and how long each waits
p = ps("Первая фраза. [pause:600ms] Вторая фраза. Третья фраза.\n\n[pause:6s]\n\nНовый абзац [pause:1,25s] посреди фразы.")
assert [x["plain"] for x in p] == ["Первая фраза.", "Вторая фраза. Третья фраза.", "Новый абзац", "посреди фразы."], [x["plain"] for x in p]
assert [x.get("pause") for x in p] == [0.6, 6.0, 1.25, None] and [x["gap"] for x in p] == [0.6, 6.0, 1.25, 0.0], p
assert not any("\x00" in x["text"] or "pause" in x["text"] for x in p)
p = ps("[pause:2s] Слова после тишины. [pause:0.5][pause:1.5s] И ещё. [pause:10s]")
assert p[0].get("lead_pause") == 2.0 and p[0]["pause"] == 2.0 and p[-1]["pause"] == 10.0 and p[-1]["gap"] == 10.0, p   # pauses add up; one at the end stays
assert [x["plain"] for x in p] == ["Слова после тишины.", "И ещё."], p
p = ps("Мф 1:1 Слово первое [pause:3s] и второе.\n2 Стих второй.", split="verse")
assert [x["plain"] for x in p] == ["Слово первое", "и второе.", "Стих второй."] and p[0]["pause"] == 3.0 and p[1]["gap"] == 0.35, p
p = ps("Анна: Привет. [pause:2s] Как ты?\nБорис: [pause:4s] Хорошо.\n[pause:1s]\nАнна: [sighs] Ну вот.", mode="dialog", tags=True)
assert [(x["speaker"], x["plain"]) for x in p] == [("Анна", "Привет."), ("Анна", "Как ты?"), ("Борис", "Хорошо."), ("Анна", "Ну вот.")], p
assert [x["gap"] for x in p] == [2.0, 4.0, 1.0, 0.0] and p[3]["text"] == "[sighs] Ну вот.", p    # an engine's own tag stays its own
assert r.pause_s(r.PAUSE_RE.search("[pause:90s]")) == 60.0 and r.pause_s(r.PAUSE_RE.search("[Pause: 20 ms]")) == 0.05
assert ps("Без пауз. Совсем.")[0].get("pause") is None


def silences(x, sr):
    """The silences between the sounding stretches of a take, seconds (frames of 10 ms, 40 dB under its loudest)."""
    hop = sr // 100
    n = len(x) // hop
    db = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))
    on = db > db.max() - 40
    out = []
    edges = np.flatnonzero(np.diff(on.astype(int)))
    starts = [e + 1 for e in edges if not on[e] and on[e + 1]]
    ends = [e + 1 for e in edges if on[e] and not on[e + 1]]
    first = 0 if on[0] else (starts[0] if starts else 0)
    for e in ends:
        s = next((s for s in starts if s > e), None)
        if s is not None:
            out.append(round((s - e) * hop / sr, 2))
    lead = round(first * hop / sr, 2)
    return lead, out


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    eng = kit / "user/reader/engines/fake"
    eng.mkdir(parents=True)
    (eng / "engine.py").write_text(
        "import numpy as np, hashlib\n"
        "def load(device, kit):\n    return {'kit': kit}\n"
        "def reference(h, wav, sr, text):\n    return {'n': len(wav)}\n"
        "def say(h, text, ref, opts):\n"
        "    n = int(24000 * (0.5 + 0.03 * len(text)))\n"
        "    f = 150.0 + int(hashlib.md5(text.encode()).hexdigest()[:2], 16)\n"
        "    y = (0.25 * np.sin(2 * np.pi * f * np.arange(n) / 24000)).astype(np.float32)\n"
        "    q = np.zeros(int(24000 * 0.12), np.float32)\n"           # a little quiet at both edges, as an engine leaves it
        "    return np.concatenate([q, y, q]), 24000\n")
    j = json.load(open(HERE / "reader_engines/drama3/engine.json"))
    j.update(id="fake", label="Fake · test", python={"cpu": sys.executable}, need_mb=100, sample_rate=24000)
    j.pop("tiers", None)
    json.dump(j, open(eng / "engine.json", "w"))
    said, jobs, lock = [], {}, threading.Lock()

    class Cancelled(Exception):
        pass

    class Turn:
        def __init__(self, job):
            self.job = job

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    outputs, cfg = kit / "outputs", kit / "user"
    outputs.mkdir()
    r.setup(kit=kit, jobs=jobs, lock=lock, wait_card=None, turn=Turn, free_gpu=None, say=said.append, outputs=outputs, config_dir=lambda: cfg,
            collection=collection, slug=lambda s: "-".join(s.lower().split())[:40] or "x", gpus_state=lambda: {"cards": [], "roles": {"jobs": []}, "arc": []},
            studio_now=lambda: None, engine_url="http://127.0.0.1:9", unload_engine=lambda why: 0, cancelled=Cancelled)
    text = "[pause:1.5s] Первая фраза держит голос. [pause:600ms] Вторая фраза.\n\n[pause:6s]\n\nТретья фраза про голос.\n\nЧетвёртая."
    res = r.say({"mode": "narration", "text": text, "card": "cpu", "engine": "fake", "seed": 3, "hear": False, "stress": False})

    def wait(key):
        for _ in range(900):
            if key not in jobs:
                return
            time.sleep(0.1)
        raise AssertionError("never ended: " + key)

    wait("reader:" + res["id"])
    d = r.runs_home() / res["id"]
    run = json.load(open(d / "run.json", encoding="utf-8"))
    assert run["status"] == "done" and run["pauses"] == 3, (run.get("error"), run.get("pauses"), said[-3:])
    take0, sr = sf.read(str(d / "take.wav"), dtype="float32")
    lead, sil = silences(take0, sr)
    assert abs(lead - 1.5) <= 0.02 and abs(sil[0] - 0.6) <= 0.02 and abs(sil[1] - 6.0) <= 0.02, (lead, sil)   # each pause as heard
    assert abs(sil[2] - (0.9 + 0.08)) <= 0.02, sil               # a pause the text did not ask: the paragraph's gap and the quiet kept, as before
    rd = r.run_detail(res["id"])
    assert [x.get("pause") for x in rd["pieces"]] == [0.6, 6.0, None, None] and abs(rd["pieces"][0]["after"] - 0.6) <= 0.01, rd["pieces"]
    lib = outputs / run["take"]
    lib0 = (lib / "audio.wav").read_bytes()
    # ---- in place: the pause after the first piece made 2.25 s; the pieces as they were; Undo gives the take back bit for bit
    rd = r.fix_gaps({"id": res["id"], "gaps": {"0": 2.25}})
    take1, _ = sf.read(str(d / "take.wav"), dtype="float32")
    _l, sil1 = silences(take1, sr)
    assert abs(sil1[0] - 2.25) <= 0.02 and abs(sil1[1] - 6.0) <= 0.02 and len(rd["fixes"]) == 1 and rd["fixes"][0]["kind"] == "gaps", (sil1, rd["fixes"])
    a0, a1 = [int(round(x * sr)) for x in run["pieces"][0]["at"]]
    assert np.array_equal(take0[a0:a1], take1[a0:a1]), "a piece changed"
    rd = r.fix_undo({"id": res["id"]})
    take2, _ = sf.read(str(d / "take.wav"), dtype="float32")
    assert np.array_equal(take2, take0) and not rd["fixes"] and rd["pieces"][0]["pause"] == 0.6, "undo"
    try:
        r.fix_gaps({"id": res["id"], "gaps": {"9": 1}})
        raise AssertionError("a piece that is not there")
    except ValueError:
        pass
    try:
        r.fix_gaps({"id": res["id"], "gaps": {"0": 61}})
        raise AssertionError("a pause past the limit")
    except ValueError:
        pass
    # ---- into a copy: a child take of the original, its pauses shaped; the original take and its run as they were
    before = (lib / "audio.wav").read_bytes()
    cp = r.fix_gaps({"id": res["id"], "gaps": {"0": 0.85, "1": 12.0}, "copy": True})
    assert cp["copied_from"] == res["id"] and cp["id"] != res["id"] and cp["take"] != run["take"], cp
    child = outputs / cp["take"]
    req = json.load(open(child / "request.json", encoding="utf-8"))
    assert req["parent"] == run["take"] and req["what"] == "its pauses shaped" and req["no_train"] and no_train.of_take(child), req
    assert (lib / "audio.wav").read_bytes() == before and json.load(open(d / "run.json"))["fixes"] == [], "the original moved"
    tc, _ = sf.read(str(r.runs_home() / cp["id"] / "take.wav"), dtype="float32")
    _l, silc = silences(tc, sr)
    assert abs(silc[0] - 0.85) <= 0.02 and abs(silc[1] - 12.0) <= 0.02, silc
    n0 = int(round(run["pieces"][0]["at"][1] * sr))
    assert np.array_equal(tc[:n0], take0[:n0]), "the copy's first piece is not the original's"   # the same gain: untouched pieces bit for bit
    tree = r.run_detail(cp["id"])
    assert tree["pieces"][1]["pause"] == 12.0 and cp["title"].endswith("⏸"), tree["pieces"][1]
    r.unload()
    if rs.Z["con"] is not None:
        rs.Z["con"].close()
        rs.Z["con"] = None
print("test_reader_pauses: ok")
