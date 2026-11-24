"""HERESY 2947 (Viktor's «голос по абзацам прямо в редакторе», the mockup of 18.11, its variant A): a narration's voice for each paragraph,
chosen beside it in the editor and sent as par_voices, one a paragraph («» as the one above, «*» the run's own voice again, «g:…», «v:…»).
Read through the real worker on the processor (a made-up engine that writes down the reference it was given): each paragraph in its voice,
the voice held by the paragraphs after it, a book's parts carrying the voice above them; kept in the run for Reuse and Regenerate (form_of);
refused when malformed or naming a voice not here; a dialog and a reading by verses never take it."""
import json, re, sys, tempfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import collection
import reader as r
import reader_stress as rs

HERE = Path(__file__).resolve().parent
ENG = {"tag_re": re.compile(r"\[[^\[\]\n]{1,80}\]"), "max_chars": 300}
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:600] + ")"))
    if not ok:
        bad.append(what)


print("the pieces' speakers")
TXT3 = "Один. Два.\n\nТри.\n\nЧетыре."
spk = lambda pv: [p["speaker"] for p in r.pieces(TXT3, "narration", "sentence", ENG, False, 0.35, 0.45, 0.9, par_voices=pv)]
check("a voice from the second paragraph on: its pieces «¶v:vb», the third as the one above", spk(["", "v:vb", ""]) == ["", "\u00b6v:vb", "\u00b6v:vb"], spk(["", "v:vb", ""]))
check("  «*» the run's own voice again", spk(["g:low", "*", ""]) == ["\u00b6g:low", "", ""], spk(["g:low", "*", ""]))
check("  none given, or fewer than the paragraphs: as before", spk(None) == ["", "", ""] and spk(["v:vb"]) == ["\u00b6v:vb"] * 3, (spk(None), spk(["v:vb"])))

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
    j.pop("stress_lang", None)
    j.pop("tiers", None)
    j.pop("voice_set", None)
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
    vh = r.voices_home()
    vh.mkdir(parents=True, exist_ok=True)
    VT = {"va": "Голос А читает ровно и спокойно.", "vb": "Голос Б читает выше и звонче."}
    for k, (vid, words) in enumerate(VT.items()):
        sf.write(str(vh / (vid + ".wav")), (0.2 * np.sin(2 * np.pi * (120 + 80 * k) * np.arange(24000 * 3) / 24000)).astype(np.float32), 24000)
        json.dump({"name": "Voice " + vid.upper(), "text": words, "seconds": 3.0}, open(vh / (vid + ".json"), "w", encoding="utf-8"), ensure_ascii=False)

    def wait(rid):
        for _ in range(1200):
            if "reader:" + rid not in jobs:
                break
            time.sleep(0.1)
        return json.load(open(r.runs_home() / rid / "run.json", encoding="utf-8"))

    def refs():
        p = kit / "refs.txt"
        return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines()] if p.is_file() else []

    print("a narration read through the worker")
    text = ("Первый абзац читает голос книги, долго и ровно, своим тембром.\n\nВторой абзац читает другой голос, звонче и выше, тоже долго.\n\n"
            "Третий абзац остаётся за вторым голосом, как абзац выше.")
    n0 = len(refs())
    res = r.say({"mode": "narration", "text": text, "card": "cpu", "engine": "fake", "seed": 5, "hear": False, "stress": False, "voice": "v:va",
                 "par_voices": ["", "v:vb", ""]})
    run = wait(res["id"])
    got = refs()[n0:]
    check("the run done, its pieces' speakers by paragraph", run["status"] == "done" and [p["speaker"] for p in run["pieces"]] == ["", "\u00b6v:vb", "\u00b6v:vb"],
          (run.get("error"), [p["speaker"] for p in run["pieces"]]))
    check("  its cast: the run's voice and the paragraph's, named; the paragraphs' voices kept",
          run["voices"] == {"": "va", "\u00b6v:vb": "vb"} and run["voice_labels"].get("\u00b6v:vb") == "Voice VB" and run["par_voices"] == ["", "v:vb", ""], run)
    check("  the first paragraph read on voice A's clip, the second on voice B's, the third held to the second's voice (never A's)",
          len(got) == 3 and got[0]["ref"]["text"] == VT["va"] and got[1]["ref"]["text"] == VT["vb"] and got[2]["ref"]["text"] != VT["va"]
          and not got[2]["ref"]["text"].startswith("Первый"), got)
    f = r.form_of(run)
    check("Reuse and Regenerate get the paragraphs' voices back, the cast's own entries derived again, nothing missing",
          f["par_voices"] == ["", "v:vb", ""] and f["voices"] == {} and f["voice"] == "va" and f["missing"]["voices"] == [], f)
    take = run.get("take") or ""
    req = json.load(open(outputs / take / "request.json", encoding="utf-8")) if take else {}
    check("  the take's style names the paragraph's voice plainly («¶ Voice VB»), never its key", "\u00b6 Voice VB" in req.get("style", "") and "\u00b6v:" not in req.get("style", ""),
          req.get("style"))

    print("a book's parts")
    book = ("Пролог читает голос книги, первый абзац пролога.\n\nВторой абзац пролога читает другой голос.\n\n[split]\n\n"
            "Глава первая продолжает голосом абзаца выше.\n\nПоследний абзац снова голосом книги, как прежде.")
    res = r.say({"mode": "narration", "text": book, "card": "cpu", "engine": "fake", "seed": 5, "hear": False, "stress": False, "voice": "v:va",
                 "title": "Книга голосов", "par_voices": ["", "v:vb", "", "*"]})
    run = wait(res["id"])
    check("the voice above a part carried into its first paragraph; «*» back to the book's voice",
          run["status"] == "done" and [(p.get("part"), p["speaker"]) for p in run["pieces"]] == [(0, ""), (0, "\u00b6v:vb"), (1, "\u00b6v:vb"), (1, "")],
          (run.get("error"), [(p.get("part"), p["speaker"]) for p in run["pieces"]]))

    print("refused, or never taken")
    for pv, word in ((["x:1"], "par_voices"), ("v:vb", "par_voices"), (["", 5], "par_voices"), (["v:zz"], "no voice zz")):
        try:
            r.say({"mode": "narration", "text": text, "card": "cpu", "engine": "fake", "hear": False, "stress": False, "par_voices": pv})
            check(f"  {pv!r} refused", False)
        except ValueError as e:
            check(f"  {pv!r} refused: «{e}»", word in str(e), e)
    res = r.say({"mode": "dialog", "text": "Анна: Здравствуй, как ты сегодня?\nБорис: Хорошо, спасибо тебе.", "card": "cpu", "engine": "fake", "hear": False,
                 "stress": False, "par_voices": ["x:1"]})
    run = wait(res["id"])
    check("a dialog never takes it (a voice a speaker)", run["status"] == "done" and "par_voices" not in run and not any(p["speaker"].startswith("\u00b6") for p in run["pieces"]), run.get("error"))
    res = r.say({"mode": "narration", "split": "verse", "text": "1 Первый стих читается.\n2 Второй стих читается.", "card": "cpu", "engine": "fake", "hear": False,
                 "stress": False, "par_voices": ["v:vb"]})
    run = wait(res["id"])
    check("  nor a reading by verses", run["status"] == "done" and "par_voices" not in run and all(p["speaker"] == "" for p in run["pieces"]), run.get("error"))
    res = r.say({"mode": "narration", "text": text, "card": "cpu", "engine": "fake", "hear": False, "stress": False, "par_voices": ["", "", ""]})
    run = wait(res["id"])
    check("  all «as above»: a plain narration, nothing kept", run["status"] == "done" and "par_voices" not in run and all(p["speaker"] == "" for p in run["pieces"]), run.get("error"))
    r.unload()
    if rs.Z["con"] is not None:
        rs.Z["con"].close()
        rs.Z["con"] = None

print("FAILED " + str(len(bad)) if bad else "test_reader_par_voices_2947: all passed")
sys.exit(1 if bad else 0)
