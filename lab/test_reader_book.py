"""HERESY 2344: the Reader's long form without a card. A text with [split] read as a book in one run through the real worker on the processor
(a made-up engine that writes down the reference it was given): one voice through the book, the anchor of its first long piece held into every
part; each part landed as a run and a take of its own, at the book's one gain, its heading its name, the child of the part before it in the family
tree, filed in a section of the workspace named after the book; the book fixed only part by part; a part fixed piece by piece as any take."""
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
assert r._part_title("Глава первая\n\nТекст главы.", 1) == "Глава первая" and r._part_title("Длинный абзац без заголовка. Ещё.", 2) == "part 2"
assert r._part_title("Анна: реплика\n\nдальше", 3) == "part 3" and r._part_title("[calm] Пролог\n\nТекст.", 4) == "Пролог"

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    eng = kit / "user/reader/engines/fake"
    eng.mkdir(parents=True)
    (eng / "engine.py").write_text(
        "import numpy as np, hashlib, json\n"
        "def load(device, kit):\n    return {'kit': kit}\n"
        "def reference(h, wav, sr, text):\n    return {'n': len(wav), 'text': text}\n"
        "def say(h, text, ref, opts):\n"
        "    open(h['kit'] + '/refs.txt', 'a', encoding='utf-8').write(json.dumps({'text': text, 'ref': ref}, ensure_ascii=False) + '\\n')\n"
        "    n = int(24000 * (0.6 + 0.04 * len(text)))\n"
        "    f = 150.0 + int(hashlib.md5(text.encode()).hexdigest()[:2], 16)\n"
        "    y = (0.25 * np.sin(2 * np.pi * f * np.arange(n) / 24000)).astype(np.float32)\n"
        "    return np.concatenate([np.zeros(2400, np.float32), y, np.zeros(2400, np.float32)]), 24000\n")
    j = json.load(open(HERE / "reader_engines/drama3/engine.json"))
    j.update(id="fake", label="Fake · test", python={"cpu": sys.executable}, need_mb=100, sample_rate=24000)
    j.pop("stress_lang", None)                            # HERESY 2454 gave Drama 3 the capitals for Russian; this fake tests the acute path
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
    collection.collection_post(cfg, outputs, {"op": "ws-create", "workspace": "Книги", "realm": "reader"})
    text = ("Пролог\n\nПервая фраза держит голос книги и долго звучит. Вторая фраза пролога.\n\n[split]\n\n"
            "Глава первая\n\nТретья фраза уже в главе. Четвёртая фраза главы.\n\n[split]\n\n"
            "Глава вторая\n\nПятая фраза. [pause:2s] Шестая фраза книги.")
    res = r.say({"mode": "narration", "text": text, "card": "cpu", "engine": "fake", "seed": 5, "hear": False, "stress": False, "title": "Книга проб",
                 "workspace": "Книги"})
    for _ in range(1200):
        if "reader:" + res["id"] not in jobs:
            break
        time.sleep(0.1)
    d = r.runs_home() / res["id"]
    run = json.load(open(d / "run.json", encoding="utf-8"))
    assert run["status"] == "done" and len(run["takes"]) == 3, (run.get("error"), said[-4:])
    assert [p["title"] for p in run["takes"]] == ["Пролог", "Глава первая", "Глава вторая"], run["takes"]
    # one voice through the book: every piece after the anchor read with the same reference, across the parts
    refs = [json.loads(x) for x in (kit / "refs.txt").read_text(encoding="utf-8").splitlines()]
    after = [x["ref"] for x in refs[2:]]                 # the heading «Пролог» is too short to hold the voice; the next piece holds it
    assert refs[0]["ref"] is None and refs[1]["ref"] is None and len(after) == 5 and all(a == after[0] for a in after), refs
    assert after[0]["text"].startswith("Первая фраза") and run["anchors"] == {"": 1}, (after[0], run["anchors"])
    # each part a run and a take of its own, chained, at the book's gain, in the book's section
    takes, prev = [], None
    for k, p in enumerate(run["takes"]):
        pr = json.load(open(r.runs_home() / p["run"] / "run.json", encoding="utf-8"))
        assert pr["status"] == "done" and pr["take"] == p["take"] and pr["book"]["k"] == k + 1 and pr["book"]["of"] == 3 and pr["gain"] == run["gain"], pr
        assert [q["i"] for q in pr["pieces"]] == list(range(len(pr["pieces"]))) and all((r.runs_home() / p["run"] / f"piece-{q['i']:03d}.wav").is_file() for q in pr["pieces"])
        req = json.load(open(outputs / p["take"] / "request.json", encoding="utf-8"))
        assert no_train.of_take(outputs / p["take"]) and req["reader"]["run"] == p["run"], req
        assert (req.get("parent") == prev) and (req.get("what") == "the book's next part" if prev else "what" not in req), req
        prev = p["take"]
        takes.append(sf.read(str(outputs / p["take"] / "audio.wav"), dtype="float32")[0])
    assert run["takes"][2]["title"] == "Глава вторая" and json.load(open(r.runs_home() / run["takes"][2]["run"] / "run.json"))["pieces"][1].get("pause") == 2.0
    marks = collection.load(cfg)
    sec = "Книги / Книга проб"
    assert sorted(marks["workspaces"].get(sec, [])) == sorted(p["take"] for p in run["takes"]) and collection.realm_ws(marks, sec) == "reader", marks["workspaces"]
    lv = [20 * np.log10(np.sqrt(np.mean(t[np.abs(t).mean(1) > 0.01] ** 2))) for t in takes]
    assert max(lv) - min(lv) < 0.5, lv                                   # the book's one level on every part
    assert r.runs()["runs"][0]["book"] is not None
    # the book fixed only part by part; a part as any take
    try:
        r.fix({"id": res["id"], "piece": 0, "text": "x"})
        raise AssertionError("the book fixed whole")
    except ValueError as e:
        assert "part by part" in str(e)
    p1 = run["takes"][1]["run"]
    f = r.fix({"id": p1, "piece": 0, "text": "Третья фраза уже в главе, исправлена."})
    for _ in range(600):
        if "reader:" + p1 + "~fix" not in jobs:
            break
        time.sleep(0.1)
    assert r.run_detail(p1)["pieces"][0]["v"] == 1, r.run_detail(p1)["pieces"][0]
    # HERESY 2343: the test without acutes: every acute out, the author's too; a reading for keeps keeps them
    for off in (True, False):
        res2 = r.say({"mode": "narration", "text": "Доро́га до́мой длинная и тихая.", "card": "cpu", "engine": "fake", "hear": False, "stress": False, "acutes_off": off})
        for _ in range(600):
            if "reader:" + res2["id"] not in jobs:
                break
            time.sleep(0.1)
        last = json.loads((kit / "refs.txt").read_text(encoding="utf-8").splitlines()[-1])["text"]
        run2 = json.load(open(r.runs_home() / res2["id"] / "run.json", encoding="utf-8"))
        assert run2["status"] == "done" and ("\u0301" not in last) == off and run2["acutes_off"] is off, (off, last, run2.get("error"))
    r.unload()
    if rs.Z["con"] is not None:
        rs.Z["con"].close()
        rs.Z["con"] = None
print("test_reader_book: ok")
