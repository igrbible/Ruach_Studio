"""HERESY 2241: the Reader without a card. The text into pieces (narration by sentence and by verse, a dialog by its speakers, the tags kept or
taken out), the engine registry (a good engine, a broken one, one whose module leaves its folder), the timbre groups and their centre voices, and
a whole run on the processor through the real worker with a made-up engine (a tone a piece): queued, read, joined, landed in the Library as a take
marked never for training in its meta, its request and its WAV's comment tag, its note holding the text and the settings."""
import json, subprocess, sys, tempfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection
import no_train
import reader as r

TAGS = {"tag_re": __import__("re").compile(r"<\|[a-z]+:[a-z_]+\|>"), "max_chars": 120}

# ---- pieces
ps = r.pieces("Первое предложение. Второе, подлиннее!\n\nНовый абзац? Да.", "narration", "sentence", TAGS, False, 0.3, 0.5, 0.9)
assert [p["text"] for p in ps] == ["Первое предложение. Второе, подлиннее!", "Новый абзац? Да."], ps
assert ps[0]["gap"] == 0.9 and ps[-1]["gap"] == 0.0, ps                     # a paragraph's end the longer pause; nothing after the last
long = "Слово, " * 60 + "конец."
assert all(len(p["text"]) <= 120 for p in r.pieces(long, "narration", "sentence", TAGS, False, 0.3, 0.5, 0.9))
v = r.pieces("1 В начале был Ло́гос [3056],\n2 Ин 1:2 Он был в начале.\n", "narration", "verse", TAGS, False, 0.3, 0.5, 0.9)
assert [p["text"] for p in v] == ["В начале был Ло́гос,", "Он был в начале."], v   # the verse number, the address and Strong's numbers not read
t = "<|emotion:awe|>Свет! <|prosody:pause|> Тьма."
assert r.pieces(t, "narration", "sentence", TAGS, False, 0.3, 0.5, 0.9)[0]["text"] == "Свет! Тьма."
assert r.pieces(t, "narration", "sentence", TAGS, True, 0.3, 0.5, 0.9)[0]["text"] == t
d = r.pieces("Вступление без имени.\nИван: <|emotion:anger|>Ты где был?\nМария: Дома.\nи ещё строка\nИван: Ладно.", "dialog", "sentence", TAGS, True, 0.3, 0.5, 0.9)
assert [(p["speaker"], p["plain"]) for p in d] == [("", "Вступление без имени."), ("Иван", "Ты где был?"), ("Мария", "Дома. и ещё строка"), ("Иван", "Ладно.")], d
assert d[1]["text"].startswith("<|emotion:anger|>") and d[1]["gap"] == 0.5
assert r.speakers("Иван: а\nМария: б\nИван: в\nдлинная строка: с двоеточием внутри неё здесь") == ["Иван", "Мария"]
assert r.speakers("10:30 пришёл") == []
assert r.drifted(97, 246) and not r.drifted(97, 181) and r.drifted(240, 120) and not r.drifted(240, 180) and not r.drifted(None, 300)   # the line of gender

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    eng = kit / "user/reader/engines"
    good = eng / "good"; good.mkdir(parents=True)
    (good / "engine.py").write_text(
        "import numpy as np\n"
        "def load(device, kit):\n    return {'device': device}\n"
        "def reference(h, wav, sr, text):\n    return {'n': len(wav), 'text': text}\n"
        "def say(h, text, ref, opts):\n"
        "    n = int(24000 * (0.3 + 0.03 * len(text)))\n"
        "    f = 220.0 if ref is None else 330.0\n"
        "    return (0.2 * np.sin(2 * np.pi * f * np.arange(n) / 24000)).astype(np.float32), 24000\n")
    json.dump({"id": "good", "label": "Good · test", "python": {"cpu": sys.executable}, "tag_re": "<\\|[a-z]+:[a-z_]+\\|>", "need_mb": 100,
               "tags": {"open": "<|", "close": "|>", "groups": [{"id": "emotion", "cat": "emotion", "place": "sentence", "items": ["awe"]}]}},
              open(good / "engine.json", "w"))
    bad = eng / "bad"; bad.mkdir()
    (bad / "engine.json").write_text("{not json")
    out = eng / "out"; out.mkdir()
    json.dump({"id": "out", "module": "../good/engine.py"}, open(out / "engine.json", "w"))
    said = []
    jobs, lock = {}, threading.Lock()

    class Cancelled(Exception):
        pass

    class Turn:
        def __init__(self, job):
            self.job = job

        def __enter__(self):
            self.job["status"] = "running"
            return self

        def __exit__(self, *a):
            return False

    outputs, cfg = kit / "outputs", kit / "user"
    outputs.mkdir()
    r.setup(kit=kit, jobs=jobs, lock=lock, wait_card=None, turn=Turn, free_gpu=None, say=said.append, outputs=outputs, config_dir=lambda: cfg,
            collection=collection, slug=lambda s: "-".join(s.lower().split())[:40] or "x", gpus_state=lambda: {"cards": [], "roles": {"jobs": []}, "arc": []},
            studio_now=lambda: None, engine_url="http://127.0.0.1:9", unload_engine=lambda why: 0, cancelled=Cancelled)
    es = [e for e in r.engines_public()["engines"] if e["own"]]                  # the Studio's own (lab/reader_engines, 2247) listed before
    assert [e["id"] for e in es] == ["good"] and es[0]["devices"] == ["cpu"] and es[0]["ready"]["cpu"], es
    assert any("bad" in s for s in said) and any("out" in s and "own folder" in s for s in said), said
    # ---- voices and their groups (the made-up ones by gender and register, each group read by its centre)
    vh = r.voices_home()
    for vid, f0, g in (("made-a", 98.0, "male"), ("made-b", 101.0, "male"), ("made-c", 210.0, "female"), ("own-x", 120.0, "male")):
        (vh / (vid + ".wav")).write_bytes(b"RIFF")
        json.dump({"name": vid, "lang": "ru", "text": "слова", "kind": "own" if vid.startswith("own") else "made", "f0": f0, "gender": g, "f0_by": "pyin"},
                  open(vh / (vid + ".json"), "w"))
    vs = r.voices()
    gs = {x["id"]: x for x in vs["groups"]}
    assert set(gs) == {"male-low", "female-middle"} and gs["male-low"]["voices"] == ["made-a", "made-b"], gs   # one's own voice is in no group
    assert gs["male-low"]["centre"] in ("made-a", "made-b")
    assert r._voice("g:female-middle", vs["groups"], vs["voices"])[0] == "made-c"
    try:
        r._voice("v:nobody", vs["groups"], vs["voices"])
        raise AssertionError("an unknown voice taken")
    except ValueError:
        pass
    try:
        r.voice_add({"name": "x", "audio_b64": "AAAA"})
        raise AssertionError("a voice of one's own kept without consent")
    except ValueError as e:
        assert "consent" in str(e)
    # ---- a whole run on the processor
    for k in [k for k in list(vh.iterdir())]:
        k.unlink()                                     # the stand-in clips are not audio: the run reads with the engine's own voice
    res = r.say({"mode": "narration", "text": "Первая фраза достаточно длинная, чтобы держать голос. Вторая.\n\nТретья <|emotion:awe|>с тегом.",
                 "card": "cpu", "engine": "good", "seed": 7, "workspace": "Тест"})
    assert res["of"] == 2 and res["status"] == "queued", res
    for _ in range(600):
        if "reader:" + res["id"] not in jobs:
            break
        time.sleep(0.1)
    run = json.load(open(r.runs_home() / res["id"] / "run.json", encoding="utf-8"))
    assert run["status"] == "done", (run.get("status"), run.get("error"), said[-5:])
    assert run["tags"] is False and "<|" not in run["pieces"][1]["text"], run["pieces"]                 # narration: plain by default
    take = outputs / run["take"]
    meta = json.load(open(take / "meta.json", encoding="utf-8"))
    req = json.load(open(take / "request.json", encoding="utf-8"))
    assert meta["no_train"] and meta["provenance"]["no_train"] and req["no_train"] and req["reader"]["engine"] == "good", (meta, req)
    assert no_train.of_take(take) and no_train.of_file(take / "audio.wav")
    tag = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=comment", "-of", "csv=p=0", str(take / "audio.wav")],
                         capture_output=True, text=True).stdout
    assert no_train.MARK in tag, tag                                                                  # the file itself says it
    cop = Path(tmp) / "copy.wav"
    cop.write_bytes((take / "audio.wav").read_bytes())
    assert no_train.of_file(cop), "a copy of the take's audio, away from its folder, must still say never for training"
    c = json.load(open(cfg / "collection.json", encoding="utf-8"))
    note = c["notes"][run["take"]]
    assert "Первая фраза" in note and "seed 7" in note and "never for training" in note, note
    assert run["take"] in c["workspaces"]["Тест"], c["workspaces"]
    assert collection.take_kind(run["take"], meta, req) == "narrated"
    rows = r.runs()["runs"]
    assert rows[0]["id"] == res["id"] and rows[0]["status"] == "done" and rows[0]["take"] == run["take"], rows[0]
    # ---- a stop between pieces
    res2 = r.say({"mode": "dialog", "text": "А: " + "раз два три. " * 3 + "\nБ: четыре.\nА: пять.", "card": "cpu", "engine": "good"})
    r.stop({"id": res2["id"]})
    for _ in range(600):
        if "reader:" + res2["id"] not in jobs:
            break
        time.sleep(0.1)
    run2 = json.load(open(r.runs_home() / res2["id"] / "run.json", encoding="utf-8"))
    assert run2["status"] in ("stopped", "done"), run2.get("status")
    assert run2["tags"] is True                                                                       # a dialog: tags read by default
    try:
        r.say({"text": "x", "card": 2, "engine": "good"})
        raise AssertionError("a card the lab's jobs do not have was taken")
    except ValueError:
        pass
    r.unload()
print("test_reader: ok")
