"""HERESY 2455: the voice builder of the Narrator (lab/reader_design.py): the bracket it asks with, the run it queues (the candidates as a dialog's
speakers, each its own seed, no take), the measures of a candidate (pitch, spread, brightness, background, creak) on sounds made here, the
candidates joined from a run's pieces, one kept as a made-up voice by a name the Library can hold. HERESY 2456: the stock voices as Drama 3's own
set (its groups made of them beside a kit's made-up voices; listed first). No card, no engine.
    .venv/bin/python lab/test_reader_design_2455.py"""
import json
import sys
import tempfile
import threading
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import reader as r  # noqa: E402
import reader_design as rd  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


def refused(fn, *a, has=""):
    try:
        fn(*a)
    except ValueError as e:
        return has in str(e)
    return False


# the bracket
check(rd.steer("calm, warm, unhurried", "male") == "a man's voice, calm, warm, unhurried", "the gender asked said first")
check(rd.steer("a calm adult woman's voice", "female") == "a calm adult woman's voice", "a description that names one is left as written")
check(rd.steer("[deep and slow]", "") == "deep and slow", "its brackets taken off (the engine's own bracket wraps it)")
check(refused(rd.steer, "  ", "male", has="describe"), "an empty description refused")
check(refused(rd.steer, "x" * 161, "", has="160"), "161 characters refused")

# a voice's name
for bad in "/\\*~?:\"<>|":
    check(refused(rd.name_ok, "Голос " + bad + " один", has=bad), f"a name with {bad} refused")
check(rd.name_ok("  Тёплый   бас · ru  ") == "Тёплый бас · ru", "a name's spaces made one")
check(refused(rd.name_ok, "x" * 61, has="60"), "61 characters refused")
check(rd.name_ok("ФОСФОРИДА. Манифест.") == "ФОСФОРИДА. Манифест.", "a dot is a name's own")
check(refused(rd.name_ok, "", has="name"), "no name refused")

# the run it asks for
ENG = {"id": "drama3", "label": "Fish Audio Drama 3", "langs": ["ru", "ja"], "style": {"kind": "bracket", "max": 160, "ph": ""},
       "license": {"credit": "Built with Fish Audio"}}
got = {}
real_engine, real_say = r._engine, r.say
r._engine = lambda eid: ENG if eid in ("", "drama3") else (_ for _ in ()).throw(ValueError("no engine"))
r.say = lambda body, design=None: got.update(body=body, design=design) or {"id": "x", "of": 3, "status": "queued"}
try:
    rd.start({"describe": "low, warm", "lang": "ru", "gender": "male", "n": 3, "seeds": "7, 4242", "card": 100})
    b, d = got["body"], got["design"]
    check(b["mode"] == "dialog" and b["text"].split("\n")[0].startswith("A: ") and len(b["text"].split("\n")) == 3, "three candidates, three speakers")
    check(b["voices"] == {} and b["tags"] is False and b["hear"] is False and b["card"] == 100, "the engine's own voice, no tags, no ear, its card")
    check(b["style"] == "a man's voice, low, warm", "the bracket")
    check(d["seeds"]["A"] == 7 and d["seeds"]["B"] == 4242 and d["seeds"]["C"] not in (7, 4242), "the seeds given, the rest drawn")
    check(d["text"] == r.json.loads((r.STOCK / "voices.json").read_text(encoding="utf-8"))["voices"][0]["text"], "Russian reads its stock voice's words")
    check(refused(rd.start, {"describe": "x", "lang": "ru", "n": 5}, has="two to four"), "five candidates refused")
    check(refused(rd.start, {"describe": "x", "lang": "ru", "n": 2, "seeds": "1 2 3"}, has="3 seeds"), "more seeds than candidates refused")
    check(refused(rd.start, {"describe": "x", "lang": "ru", "n": 2, "seeds": "1x"}, has="whole number"), "a seed not a number refused")
    check(refused(rd.start, {"describe": "x", "lang": "de", "n": 2}, has="does not read"), "a language the engine does not read refused")
    check(refused(rd.start, {"describe": "x", "lang": "ru", "n": 2, "text": "Имя: слово"}, has="speaker"), "words that start like a speaker refused")
    ENG2 = dict(ENG, style=None, label="Higgs")
    r._engine = lambda eid: ENG2
    check(refused(rd.start, {"describe": "x", "lang": "ru"}, has="no description"), "an engine without a bracket refused")
finally:
    r._engine, r.say = real_engine, real_say

ps = [{"speaker": "A"}, {"speaker": "B"}, {"speaker": "A"}]
rd.seeds_of(ps, {"seeds": {"A": 10, "B": 20}})
check([p["seed"] for p in ps] == [10, 20, 11], "each piece its candidate's seed, a second piece the next")

# the measures, on sounds made here
SR = 24000


def voice(f0, secs=4.0, floor_db=-90.0, creak=0.0, seed=1):
    g = np.random.default_rng(seed)
    t = np.arange(int(SR * secs)) / SR
    f = np.full_like(t, f0)
    if creak:
        f[: int(len(t) * creak)] = f0 / 2.5                # a stretch far under its own voice
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = sum(np.sin(k * ph) / k for k in range(1, 8)) * 0.3
    y *= (np.sin(2 * np.pi * 0.5 * t) > -0.3)              # phrases and pauses
    return (y + g.normal(0, 10 ** (floor_db / 20), len(t))).astype(np.float32)


m = rd.measures(voice(110), SR)
check(m["gender"] == "male" and 104 < m["f0"] < 116 and m["span_st"] < 2, f"a steady man at 110 Hz ({m})")
check(m["quiet_db"] is not None and m["quiet_db"] > 58 and not m["noisy"], f"a quiet room is not noise ({m['quiet_db']})")
m = rd.measures(voice(110, floor_db=-45), SR)
check(m["noisy"], f"a room 45 dB under is noise ({m['quiet_db']})")
m = rd.measures(voice(220, creak=0.3), SR)
check(m["gender"] == "female" and m["creak"] > 0.15, f"a woman with a third of her voice far under her own creaks ({m['creak']})")
check(rd.measures(voice(220), SR)["creak"] < 0.05, "a steady woman does not")

# a run's candidates joined, measured, one kept
old = {k: r.H.get(k) for k in ("kit", "say", "lock", "jobs")}
said = []
with tempfile.TemporaryDirectory() as tmp:
    r.H.update(kit=Path(tmp), say=said.append, lock=threading.Lock(), jobs={})
    try:
        r.runs_home().mkdir(parents=True)
        r.voices_home().mkdir(parents=True)
        rid = "20261112-170000-abcd"
        d = r.runs_home() / rid
        d.mkdir()
        sf.write(str(d / "piece-000.wav"), voice(110), SR)
        sf.write(str(d / "piece-001.wav"), voice(200, seed=2), SR)
        run = {"id": rid, "status": "running", "created": 0, "engine": "drama3", "engine_label": "Fish Audio Drama 3", "of": 2, "done": 2,
               "pieces": [{"i": 0, "speaker": "A", "plain": "Слова один."}, {"i": 1, "speaker": "B", "plain": "Слова один."}],
               "design": {"describe": "low", "steer": "low", "gender": "", "lang": "ru", "text": "Слова один.", "seeds": {"A": 5, "B": 6}, "n": 2,
                          "credit": "Built with Fish Audio"}}
        res = rd.land(d, run, {"sample_rate": SR})
        cs = run["design"]["candidates"]
        check(res["name"] == "" and len(cs) == 2 and (d / "cand-a.wav").is_file() and (d / "cand-b.wav").is_file(), "two candidates, no take")
        check(cs[0]["gender"] == "male" and cs[1]["gender"] == "female" and cs[0]["seed"] == 5, "each measured with its seed")
        check(r.file(rid, "cand-b.wav").is_file(), "a candidate's file served")
        run["status"] = "done"
        r._write(d / "run.json", run)
        det = rd.detail(rid)
        check(det["status"] == "done" and len(det["candidates"]) == 2, "its panel reads it")
        check(refused(rd.keep, {"id": rid, "cand": "a", "name": "бас: тёплый"}, has=":"), "a name with a colon refused")
        check(refused(rd.keep, {"id": rid, "cand": "z", "name": "x"}, has="no candidate"), "a candidate not in the run refused")
        v = rd.keep({"id": rid, "cand": "a", "name": "Тёплый бас"})
        rec = json.loads((r.voices_home() / (v["id"] + ".json")).read_text(encoding="utf-8"))
        check(v["kind"] == "made" and rec["no_train"] is True and rec["credit"] == "Built with Fish Audio", "kept as a made-up voice, never for training")
        check(rec["design"]["seed"] == 5 and rec["text"] == "Слова один." and rec["f0_by"] == "pyin", "its seed, its words, its pitch")
        check(refused(rd.keep, {"id": rid, "cand": "b", "name": "тёплый бас"}, has="here already"), "a name already here refused")
        check(json.loads((d / "run.json").read_text(encoding="utf-8"))["design"]["kept"]["a"]["id"] == v["id"], "the run remembers what was kept")
        # HERESY 2456: Drama 3's own set
        vs = r.voices()
        kinds = [x["kind"] for x in vs["voices"]]
        check(kinds[0] == "stock" and kinds.index("made") > max(i for i, k in enumerate(kinds) if k == "stock"), "the stock voices listed first")
        check(all(g["centre"].startswith("stock-") for g in vs["sets"]["stock"]) and len(vs["sets"]["stock"]) == 6, "Drama 3's six groups are the stock voices'")
        check(any(g["centre"].startswith("made-") for g in vs["groups"]), "an engine without a set keeps the kit's made-up groups (2403)")
        eng = json.loads((HERE / "reader_engines/drama3/engine.json").read_text(encoding="utf-8"))
        check(eng.get("voice_set") == "stock", "Drama 3's manifest names its set")
        g = next(x for x in vs["sets"]["stock"] if x["id"] == "male-low")
        check(r._voice("g:male-low", vs["sets"]["stock"], vs["voices"])[0] == g["centre"], "a group resolves to its stock centre")
    finally:
        for k, v in old.items():
            if v is None:
                r.H.pop(k, None)
            else:
                r.H[k] = v
print(f"test_reader_design_2455: {ok} checks passed")
