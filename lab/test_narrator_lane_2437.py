"""HERESY 2437–2439 (Viktor 12.11.2026, the Narrator lane): the Narrator's takes in the Narrator's realm, notes of 6000 characters, a sentence
tag's mood carried through its paragraph.
  2437: an import with realm=reader is the Narrator's (written on it) and lands in the workspace named, made in the Narrator's realm; take-realm gives
        an imported root its realm and refuses a song or a version of another take; a Reader run's workspace is the Narrator's.
  2438: a workspace's, a section's and an adapter's note take 6000 and refuse 6001 saying so; a take's own note keeps 6000 and a longer one is cut
        with «…» (it went silently at 4000).
  2439: Drama 3's pieces of a paragraph each read in the mood said last before them; sounds and pauses are not carried; carry off reads as before;
        an engine without bracket tags carries nothing; the words the ear hears are the same.
  2446: the room's list never writes «the lab restarted» over a run of this lab whose job has just ended.
python3 lab/test_narrator_lane_2437.py"""
import json
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as C  # noqa: E402
import reader  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def refused(f):
    try:
        f()
    except ValueError as e:
        return str(e)
    return ""


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    cfg, out = kit / "user", kit / "outputs"
    cfg.mkdir()
    for n, meta, req in (("imp", {"title": "imp", "created": 1, "model": "import"}, {"title": "imp"}),
                         ("song", {"title": "song", "created": 2, "model": "yue2"}, {"title": "song"}),
                         ("ver", {"title": "ver", "created": 3, "model": "import"}, {"title": "ver", "parent": "song"})):
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        (out / n / "request.json").write_text(json.dumps(req), encoding="utf-8")
    post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731

    print("2438 · notes")
    check("the limit is 6000, a take's too", C.NOTE_MAX == 6000 and C.TAKE_NOTE_MAX == 6000, (C.NOTE_MAX, C.TAKE_NOTE_MAX))
    post({"op": "ws-create", "workspace": "W"})
    check("a workspace's note of 6000 kept whole", not refused(lambda: post({"op": "ws-note", "workspace": "W", "text": "n" * 6000}))
          and C.load(cfg)["ws_notes"].get("W") == "n" * 6000)
    why = refused(lambda: post({"op": "ws-note", "workspace": "W", "text": "n" * 6001}))
    check("6001 refused, the limit said", "6000 characters at most" in why and "6001 given" in why, why)
    check("an adapter's note of 6000 kept", not refused(lambda: post({"op": "lora-note", "id": "voice/a.safetensors", "text": "a" * 6000})))
    post({"op": "note", "names": ["imp"], "text": "t" * 5900})
    check("a take's note of 5900 kept whole (4000 cut it before)", len(C.load(cfg)["notes"]["imp"]) == 5900, len(C.load(cfg)["notes"]["imp"]))
    post({"op": "note", "names": ["imp"], "text": "t" * 7000})
    got = C.load(cfg)["notes"]["imp"]
    check("a longer one cut at 6000 and said so with «…»", len(got) <= 6000 and got.endswith("…"), (len(got), got[-3:]))

    print("2437 · realms")
    check("an imported take of the Musician's by the root rule", C.take_realms(out, ["imp"])["imp"] == "creator")
    post({"op": "take-realm", "names": ["imp"], "realm": "reader"})
    check("take-realm writes the Narrator's realm on it", json.loads((out / "imp" / "meta.json").read_text())["realm"] == "reader"
          and C.take_realms(out, ["imp"])["imp"] == "reader")
    check("take-realm refuses a song", "only an imported take" in refused(lambda: post({"op": "take-realm", "names": ["song"], "realm": "reader"})))
    check("take-realm refuses a version of another take", "only an imported take" in refused(lambda: post({"op": "take-realm", "names": ["ver"], "realm": "reader"})))
    check("  and writes nothing when one of them is refused", "realm" not in json.loads((out / "song" / "meta.json").read_text()))
    post({"op": "ws-add", "workspace": "🗣 T", "names": ["imp"], "realm": "reader"})
    check("a workspace a reading makes is the Narrator's", C.realm_ws(C.load(cfg), "🗣 T") == "reader")
    post({"op": "ws-create", "workspace": "Old"})
    post({"op": "ws-add", "workspace": "Old", "names": ["imp"]})
    check("a Musician's workspace that holds only the Narrator's takes can be given to the Narrator",
          not refused(lambda: post({"op": "ws-realm", "workspace": "Old", "realm": "reader"})) and C.realm_ws(C.load(cfg), "Old") == "reader")

print("2439 · moods")
eng = {"tags": {"open": "[", "close": "]", "groups": [{"place": "sentence", "items": ["calm", "determined"]},
                                                      {"place": "inline", "items": ["pause", "long pause", "sighs", "laughs"]}]},
       "tag_re": re.compile(r"\[[^\[\]\n]{1,160}\]"), "max_chars": 300}
text = ("[calm, warm] Первая фраза абзаца, довольно длинная, чтобы кусок вышел полным и следующая фраза ушла в другой кусок, как бывает. "
        "Вторая фраза абзаца, тоже длинная, и вот она уже идёт отдельным куском, потому что кусок не берёт больше двухсот сорока знаков. "
        "Третья [sighs] со вздохом, и тоже длинная, чтобы ушла в свой кусок, а не легла рядом с другой фразой в один и тот же кусок текста.\n\n"
        "Новый абзац без своего тега.")
ps = reader.pieces(text, "narration", "sentence", eng, True, 0.35, 0.45, 0.9)
check("three pieces in the first paragraph, one in the second", len(ps) == 4, [p["text"][:30] for p in ps])
check("the second and the third piece read in [calm, warm]", all(p["text"].startswith("[calm, warm] ") for p in ps[1:3]), [p["text"][:20] for p in ps])
check("a sound is not a mood: [sighs] stays where it is, not carried", ps[2]["text"].count("[sighs]") == 1)
check("a new paragraph starts without the old mood", not ps[3]["text"].startswith("["), ps[3]["text"][:20])
check("the words the ear hears are the same", [p["plain"] for p in ps] == [p["plain"] for p in reader.pieces(text, "narration", "sentence", eng, True, 0.35, 0.45, 0.9, False)])
off = reader.pieces(text, "narration", "sentence", eng, True, 0.35, 0.45, 0.9, False)
check("carry off: as before, the tag on the first piece only", off[0]["text"].startswith("[calm, warm]") and not off[1]["text"].startswith("["))
mid = reader.pieces("[calm] Он встал и сказал: [determined] хватит. " + "Длинная фраза, чтобы ушла дальше, очень длинная фраза, " * 4 + "конец. "
                    + "Ещё одна фраза после, тоже длинная, чтобы стала своим куском и взяла настроение, сказанное последним в куске перед ней.",
                    "narration", "sentence", eng, True, 0.35, 0.45, 0.9)
check("a mood said inside a piece is the one carried on", mid[-1]["text"].startswith("[determined] "), [p["text"][:20] for p in mid])
dia = reader.pieces("Alpha: [calm] Раз. " + "Длинная реплика, очень длинная реплика, " * 8 + "конец.\nBeta: Два.", "dialog", "sentence", eng, True, 0.35, 0.45, 0.9)
check("in a dialog the mood stays inside its turn", dia[1]["text"].startswith("[calm] ") and not dia[-1]["text"].startswith("["), [p["text"][:16] for p in dia])
higgs = dict(eng, tags={"open": "<|", "close": "|>", "groups": []})
check("an engine without bracket tags carries nothing", not reader.pieces(text, "narration", "sentence", higgs, True, 0.35, 0.45, 0.9)[1]["text"].startswith("["))
check("tags off: nothing carried, the plain words", reader.pieces(text, "narration", "sentence", eng, False, 0.35, 0.45, 0.9)[1]["text"] == ps[1]["plain"])

print("2446 · a run of this lab is never «restarted»")
import threading  # noqa: E402
import time  # noqa: E402
with tempfile.TemporaryDirectory() as tmp:
    reader.H.update(kit=tmp, lock=threading.Lock(), jobs={})
    home = Path(tmp) / "reader" / "runs"
    for rid, created in (("20261112-141747-aaaa", time.time()), ("20261111-101010-bbbb", reader.LAB_START - 3600)):
        (home / rid).mkdir(parents=True)
        (home / rid / "run.json").write_text(json.dumps({"id": rid, "status": "running", "created": created, "pieces": []}), encoding="utf-8")
    rows = {r["id"]: r for r in reader.runs()["runs"]}
    check("a run of this lab, its job just gone, is left to its own end", rows["20261112-141747-aaaa"]["status"] == "running"
          and json.loads((home / "20261112-141747-aaaa" / "run.json").read_text())["status"] == "running", rows["20261112-141747-aaaa"]["status"])
    check("a run made before this lab started is said stopped by the restart", rows["20261111-101010-bbbb"]["status"] == "failed"
          and rows["20261111-101010-bbbb"]["error"] == reader.STOPPED)

print(("FAILED " + str(len(bad))) if bad else "all ok")
sys.exit(1 if bad else 0)
