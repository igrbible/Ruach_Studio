"""HERESY 2510 (Viktor 12.11.2026: «Сделай Чтеца практически зеркалом Музыканта»): a Narrator take read again. GET /reader/run?take= finds its
run by the take's name; the run's detail carries the reading as the room's form holds it (form_of), with whatever is gone from the machine named,
never replaced; again() reads it with all its settings and a new seed (or its own: a retake), the new take a child of the old; lab.regen() sends
a Narrator take there instead of singing its words in YuE2; say() checks the parent it is given.
python3 lab/test_reader_mirror_2510.py"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reader as r  # noqa: E402

bad = []


def ok(cond, what):
    print(("  ok    " if cond else "  FAIL  ") + what)
    if not cond:
        bad.append(what)


ENG = {"id": "drama3", "label": "Drama 3", "style": {"kind": "bracket", "max": 200}, "tiers": [{"id": "q8_0", "ready": True}]}
RID = "20261112-210000-ab12"
RUN = {"id": RID, "status": "done", "title": "Свидетельство", "mode": "dialog", "split": "sentence", "tags": True, "carry": True, "engine": "drama3",
       "engine_label": "Drama 3", "voices": {"": "v-anna", "Б": "v-boris"}, "voice_labels": {"": "Anna", "Б": "Boris"}, "card": "auto",
       "temperature": 0.7, "top_k": 40, "seed": 424242, "gap": 0.4, "turn_gap": 0.5, "text": "[calm] Ру́ах — Она́.\nБ: שָׁלוֹם", "lang": "he",
       "style": "[warm, slow]", "stress": True, "tier_ask": "q8_0", "hear": False, "glyphs": {"table": "his"}, "take": "Свидетельство",
       "workspace": "Readings", "pieces": [], "of": 2, "lufs": -16.1, "where": "Arc B50"}

with tempfile.TemporaryDirectory() as tmp:
    kit, outs = Path(tmp) / "kit", Path(tmp) / "outputs"
    (kit / "reader" / "runs" / RID).mkdir(parents=True)
    (kit / "reader" / "runs" / RID / "run.json").write_text(json.dumps(RUN, ensure_ascii=False), encoding="utf-8")
    (outs / "Свидетельство").mkdir(parents=True)
    (outs / "Свидетельство" / "request.json").write_text(json.dumps({"style": "spoken word · dialog", "reader": {"run": RID}}), encoding="utf-8")
    (outs / "a song").mkdir()
    (outs / "a song" / "request.json").write_text(json.dumps({"style": "rock", "lyrics": "la"}), encoding="utf-8")
    r.H.update(kit=str(kit), outputs=str(outs))
    r._engine = lambda eid: ENG if eid in ("", "drama3") else (_ for _ in ()).throw(ValueError(f"no engine {eid} here"))
    r.voices = lambda: {"voices": [{"id": "v-anna"}, {"id": "v-boris"}], "groups": [], "sets": {}}
    asked = []
    r.say = lambda body, design=None: asked.append(body) or {"id": "20261112-220000-cd34", "of": 2, "status": "queued"}

    ok(r.run_of_take("Свидетельство") == RID, "a take's run found by its name (GET /reader/run?take=)")
    for nm, why in (("a song", "a Musician's take"), ("nothing here", "a take that is not there"), ("../x", "a path")):
        try:
            r.run_of_take(nm)
            ok(False, f"{why} refused")
        except (ValueError, FileNotFoundError):
            ok(True, f"{why} refused")

    f = r.form_of(RUN)
    ok(f["style"] == "warm, slow", "Drama 3's bracket style back as the form writes it")
    ok(f["voice"] == "v-anna" and f["voices"] == {"Б": "v-boris"}, "the narrator's voice and the cast by speaker")
    ok(f["glyphs"] is True and f["hear"] is False and f["tier"] == "q8_0" and f["seed"] == 424242 and f["lang"] == "he", "glyphs, the ear, the tier, the seed, the language")
    ok(f["missing"] == {"voices": [], "engine": "", "tier": ""}, "nothing gone, nothing said gone")

    r.again("Свидетельство")
    b = asked[-1]
    ok("seed" not in b and b["parent"] == "Свидетельство" and b["what"] == "read again, a new seed", "Regenerate: a new seed, the old take its parent")
    ok(b["text"] == RUN["text"] and b["voices"] == {"Б": "v-boris"} and b["temperature"] == 0.7 and b["top_k"] == 40 and b["mode"] == "dialog"
       and b["gap"] == 0.4 and b["turn_gap"] == 0.5 and b["glyphs"] is True and b["tier"] == "q8_0" and b["workspace"] == "Readings",
       "and every other setting of its run")
    ok("missing" not in b and "voice_labels" not in b, "nothing but the form's fields sent")
    r.again("Свидетельство", same_seed=True)
    ok(asked[-1]["seed"] == 424242 and asked[-1]["what"].startswith("reread exactly"), "a retake keeps its seed")

    r.voices = lambda: {"voices": [{"id": "v-anna"}], "groups": [], "sets": {}}
    f2 = r.form_of(RUN)
    ok(f2["missing"]["voices"] == ["v-boris"] and f2["voices"] == {"Б": "v-boris"}, "a voice removed since is named, not replaced")
    try:
        r.again("Свидетельство")
        ok(False, "and reading it again is refused aloud")
    except ValueError as e:
        ok("v-boris" in str(e), "and reading it again is refused aloud, the voice named")
    ok(r.form_of(dict(RUN, engine="gone-eng"))["missing"]["engine"] == "gone-eng", "an engine no longer here named")
    ok(r.form_of(dict(RUN, tier_ask="q4_k"))["missing"]["tier"] == "q4_k", "a tier no longer here named")

# lab.regen() hands a Narrator take to the Narrator
src = (HERE / "lab.py").read_text(encoding="utf-8")
i = src.index("def regen(names")
body = src[i:src.index("\ndef ", i + 10)]
ok('isinstance(req.get("reader"), dict)' in body and "reader.again(name, same_seeds)" in body
   and body.index("reader.again") < body.index('api._engine("/synth"'), "lab.regen() reads a Narrator take again before any engine call")
ok("reader.run_of_take(q.get(\"take\"" in src, "GET /reader/run takes ?take=")

# say() checks the parent it is given (before anything is queued)
rs = (HERE / "reader.py").read_text(encoding="utf-8")
j = rs.index("def say(body")
ok('_reader_take(par)' in rs[j:rs.index("\ndef ", j + 10)], "say() takes a parent only if it is a Narrator take")

print("all ok" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
