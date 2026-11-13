"""HERESY 2434: Whisper's check of a Narrator's take already made, without a card or Whisper (a stub ear). The take cut where each piece of its
run sits and each cut heard against the words the engine was asked to read; a word flagged at its time in the take; the result beside the take
and its line at the end of the take's note (an earlier check's line replaced, the note's own words kept); the audio never touched; a take whose
run is gone heard whole against its text; a take that is not the Narrator's refused; an ear that could not load said, never a clean take; the
ear off in the room said in the take's note and on its run card."""
import hashlib
import json
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import reader as r


class Cancelled(Exception):
    pass


class Coll:
    """The Library's notes, as lab/collection.py keeps them."""
    def __init__(self):
        self.notes = {}

    def load(self, cfg):
        return {"notes": dict(self.notes)}

    def collection_post(self, cfg, out, data):
        assert data["op"] == "note", data
        for n in data["names"]:
            self.notes[n] = data["text"][:4000]


heard_by = []
EAR = r.Hearer                                                            # the run's own ear, its ref() kept for the stub


class Ear:
    """A stub of the run's ear: what each cut «hears» is set per piece; its words carry times inside the cut."""
    script = {}
    fail = ""

    def __init__(self, lang, tag_re, threads=8):
        self.lang, self.tag_re, self.res, self.error = lang, tag_re, {}, Ear.fail

    def ref(self, said):
        return EAR.ref(self, said)

    def put(self, i, wav, said):
        x, sr = sf.read(str(wav))
        heard_by.append((i, round(len(x) / sr, 2), self.ref(said)))
        text = Ear.script.get(i, self.ref(said))
        words = [[0.2 + 0.4 * k, 0.5 + 0.4 * k, w] for k, w in enumerate(text.split())]
        c, e, n = r.score(self.ref(said), text, self.lang)
        res = {"heard": text, "cer": c, "edits": e, "letters": n, "words": words}
        if c is not None:
            wd = r.word_diff(self.ref(said), words, self.lang)
            res.update(werr=wd["errors"], why=wd["why"])
        self.res[i] = res

    def wait(self, job, timeout=0):
        return True

    def close(self):
        pass


def wait_done(key, jobs):
    t0 = time.time()
    while key in jobs:
        assert time.time() - t0 < 20, "the check never ended"
        time.sleep(0.05)


with tempfile.TemporaryDirectory() as tmp:
    kit, out = Path(tmp) / "kit", Path(tmp) / "outputs"
    kit.mkdir()
    out.mkdir()
    coll, said_lines, jobs = Coll(), [], {}
    r.setup(kit=kit, jobs=jobs, lock=threading.Lock(), outputs=str(out), config_dir=lambda: str(kit / "user"), collection=coll,
            say=said_lines.append, cancelled=Cancelled)
    r.Hearer = Ear
    r._engine = lambda eid: {"tag_re": __import__("re").compile(r"\[[^\[\]\n]{1,160}\]")}

    # a take of three pieces, 48 kHz stereo as the Library keeps it; its run says where each piece sits
    sr = 48000
    x = (0.05 * np.random.default_rng(3).standard_normal((sr * 6, 2))).astype(np.float32)
    rid = "20261112-120000-abcd"
    (r.runs_home() / rid).mkdir(parents=True)
    pieces = [{"i": 0, "text": "[calm] Кузня просыпается раньше всех.", "said": "[calm] Ку́зня просыпа́ется ра́ньше всех.", "at": [0.0, 1.9]},
              {"i": 1, "text": "Сначала оживают вентиляторы.", "at": [2.3, 3.9]},
              {"i": 2, "text": "Кто-то большой глубоко вздохнул во сне.", "at": [4.2, 5.95]}]
    run = {"id": rid, "status": "done", "lang": "ru", "engine": "drama3", "take": "take1", "hear": False, "pieces": pieces, "text": "…"}
    r._write(r.runs_home() / rid / "run.json", run)
    t = out / "take1"
    t.mkdir()
    sf.write(str(t / "audio.wav"), x, sr, subtype="PCM_24")
    json.dump({"title": "Утро в Кузне", "lyrics": "…", "reader": {"run": rid, "engine": "drama3"}, "no_train": True}, open(t / "request.json", "w"))
    before = hashlib.sha256((t / "audio.wav").read_bytes()).hexdigest()
    coll.notes["take1"] = "🗣 The Narrator · narration\n—\nmy own words"

    Ear.script = {2: "Кто-то большой глубоко пуво вздохнул во сне"}    # a word inserted in the third piece
    got = r.check({"take": "take1"})
    assert got == {"take": "take1", "status": "running"}, got
    try:
        r.check({"take": "take1"})                                               # one check of a take at a time
        raise AssertionError("a second check of the same take started")
    except ValueError as e:
        assert "being heard" in str(e), e
    except AssertionError:
        pass                                                                  # the first may have ended already on a fast machine
    wait_done("reader:check:take1", jobs)
    res = json.load(open(t / r.CHECK_FILE))
    assert res.get("how") == "pieces" and res["pieces"] == 3 and res["heard"] == 3 and res["flagged_n"] == 1, res
    f = res["flagged"][0]
    assert f["kind"] == "inserted" and f["word"] == "пуво" and f["piece"] == 3, f
    assert abs(f["at"] - (4.2 - r.CHECK_PAD_S + 1.4)) < 0.02, f              # its time in the take: the cut's start plus its time in the cut
    assert 0 < res["cer"] < 0.2, res
    assert [h[0] for h in heard_by] == [0, 1, 2] and abs(heard_by[0][1] - (1.9 + r.CHECK_PAD_S)) < 0.01, heard_by   # the cuts, the first at 0
    assert heard_by[0][2] == "Ку́зня просыпа́ется ра́ньше всех.", heard_by[0]   # the words as the engine was asked, the tags out
    assert hashlib.sha256((t / "audio.wav").read_bytes()).hexdigest() == before          # the audio untouched
    note = coll.notes["take1"]
    assert note.startswith("🗣 The Narrator · narration\n—\nmy own words\n🎧 Whisper's check "), note
    assert "1 word flagged: inserted: “пуво” at 0:05.5" in note, note
    assert not any(p.name.startswith("check-") for p in r.runs_home().iterdir()), "the cuts left behind"
    assert r.check_get({"take": "take1"})["status"] == "done"
    jobs["reader:check:take1"] = {"status": "done"}                          # its job a moment before it is popped: the file is read, not the job
    assert r.check_get({"take": "take1"})["flagged_n"] == 1
    jobs.pop("reader:check:take1")

    # checked again: the earlier line replaced, the note's own words kept
    Ear.script = {}
    r.check({"take": "take1"})
    wait_done("reader:check:take1", jobs)
    note = coll.notes["take1"]
    assert note.count("🎧 Whisper's check") == 1 and "no word flagged" in note and "my own words" in note, note

    # the run card: the ear off said, the take's check beside it
    row = next(x for x in r.runs()["runs"] if x["id"] == rid)
    assert row["hear"] is False and row["check"]["flagged_n"] == 0 and row["check"]["cer"] == 0.0, row
    assert "not heard: Whisper was off" in r._heard_note(run) and "Whisper was off" not in r._heard_note(dict(run, hear=True))

    # a take whose run is gone: heard whole against its text
    t2 = out / "take2"
    t2.mkdir()
    sf.write(str(t2 / "audio.wav"), x[:sr * 2], sr, subtype="PCM_24")
    json.dump({"title": "x", "lyrics": "[sad] Один голос читает книгу.", "reader": {"run": "20991231-000000-0000"}}, open(t2 / "request.json", "w"))
    heard_by.clear()
    r.check({"take": "take2"})
    wait_done("reader:check:take2", jobs)
    res = json.load(open(t2 / r.CHECK_FILE))
    assert res.get("how") == "whole" and res["pieces"] == 1 and heard_by[0][2] == "Один голос читает книгу." and res["cer"] == 0.0, (res, heard_by)

    # an ear that could not load: said in the file and the note's line, never a clean take
    Ear.fail = "Whisper large-v3 is not in whisper/ on this machine"
    r.check({"take": "take2"})
    wait_done("reader:check:take2", jobs)
    res = json.load(open(t2 / r.CHECK_FILE))
    assert res["cer"] is None and "Whisper large-v3" in res["error"], res
    assert r.check_get({"take": "take2"})["cer"] is None
    assert coll.notes["take2"].startswith("🎧 Whisper's check ") and "not heard: Whisper large-v3" in coll.notes["take2"], coll.notes
    Ear.fail = ""

    # not a Narrator's take, a name that is no take: refused
    t3 = out / "take3"
    t3.mkdir()
    sf.write(str(t3 / "audio.wav"), x[:sr], sr, subtype="PCM_24")
    json.dump({"title": "a song", "lyrics": "[verse] la la"}, open(t3 / "request.json", "w"))
    for bad, why in (("take3", "Narrator"), ("../take1", "bad take"), ("nope", "no take")):
        try:
            r.check({"take": bad})
            raise AssertionError(f"checked {bad}")
        except (ValueError, FileNotFoundError) as e:
            assert why in str(e), (bad, e)
    assert not jobs, jobs

print("test_reader_check: ok")
