"""HERESY 2486, 2487: the Writer's two worlds on the lab's side. A world as a whole (charter, SOUL, tasks, templates, schema, the engines' tags),
a SOUL per world with its versions, the move of «Your preferences» once, the user's templates per world, the Narrator world's drafts, the
one-time migration (a text with section tags never pre-ticked), «Read in the Narrator», «Edit in the Writer» (into its document as a version,
or a new reading), the Narrator's takes linked back by the lab, the souls through export and import.   python3 lab/test_writer_worlds_2486.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import writer as W  # noqa: E402
import writer_worlds as WW  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


def raises(fn, kind=ValueError):
    try:
        fn()
    except kind:
        return True
    except Exception:  # noqa: BLE001
        return False
    return False


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    post = lambda body, scope="": W.post(kit, body, scope)   # noqa: E731
    wd = W._dir(kit)

    # a world as a whole
    c = post({"op": "world", "realm": "creator"})
    r = post({"op": "world", "realm": "reader"})
    check("creator: the five tasks of the page", [t["id"] for t in c["tasks"]] == ["song", "lyrics", "style", "review", "adapt"], c["tasks"])
    check("creator: no charter of the lab's (the page keeps it)", c["charter"] == "" and c["system"] == "" and "tags" not in c)
    check("creator: the five-string schema", c["schema"]["required"] == ["title", "style", "style_tags", "lyrics", "notes"])
    check("reader: its own tasks", [t["id"] for t in r["tasks"]][:4] == ["chapter", "scene", "dialog", "narration"], r["tasks"])
    check("reader: a charter, marked a draft, its comment left out", r["charter"].startswith("You are") and r["charter_draft"] is True
          and "<!--" not in r["charter"], r["charter"][:80])
    check("reader: the charter names no transliteration and capital stresses", "Never transliterate" in r["charter"] and "capital letter" in r["charter"])
    check("reader: system = charter while the SOUL is empty", r["system"] == r["charter"])
    check("reader: the schema asks for text, voice, cast", r["schema"]["required"] == ["title", "text", "voice", "notes", "cast"])
    check("reader: the engines' tags read from engine.json", "drama3" in r["tags"] and "sighs" in r["tags"]["drama3"]["inline"]
          and r["tags"]["higgs"]["open"] == "<|", list(r.get("tags", {})))
    check("reader: its built-in templates carry a request", all(t["request"].strip() for t in r["templates"] if t["builtin"]))
    check("a bad realm refused", raises(lambda: post({"op": "world", "realm": "both"})))

    # SOUL per world, versioned
    s = post({"op": "soul", "realm": "reader"})
    check("an empty SOUL at first", s["text"] == "" and s["versions"] == [] and s["updated"] is None)
    post({"op": "soul", "realm": "reader", "text": "Читать медленно.\n"})
    s = post({"op": "soul", "realm": "reader", "text": "Читать медленно. Без музыки.\n"})
    check("the text before kept as a version", len(s["versions"]) == 1 and s["versions"][0]["first"] == "Читать медленно.", s["versions"])
    s2 = post({"op": "soul", "realm": "reader", "text": "Читать медленно. Без музыки.\n"})
    check("the same text again: no new version", len(s2["versions"]) == 1)
    v = post({"op": "soul_version", "realm": "reader", "name": s["versions"][0]["name"]})
    check("a version read back", v["text"] == "Читать медленно.\n")
    check("a version name from elsewhere refused", raises(lambda: post({"op": "soul_version", "realm": "reader", "name": "../soul-creator.md"})))
    r = post({"op": "world", "realm": "reader"})
    check("reader: the SOUL appended under its heading", r["system"] == r["charter"] + "\n\n" + WW.SOUL_HEADING + "\nЧитать медленно. Без музыки.", r["system"][-80:])
    check("the creator SOUL untouched by the reader's", post({"op": "soul", "realm": "creator"})["text"] == "")
    for i in range(WW.SOUL_KEEP + 3):
        (wd / "souls" / ".versions" / f"reader-20200101-0000{i:02d}.md").write_text(f"old {i}", encoding="utf-8")
    post({"op": "soul", "realm": "reader", "text": "third"})
    check("thirty versions kept, the older moved aside, none deleted", len(post({"op": "soul", "realm": "reader"})["versions"]) == WW.SOUL_KEEP
          and len(list((wd / "souls" / ".versions" / ".trash").glob("reader-*.md"))) == 5)

    # «Your preferences» moved once
    a = post({"op": "soul_seed", "realm": "creator", "text": "Пиши по-русски, с акутами."})
    b = post({"op": "soul_seed", "realm": "creator", "text": "другое"})
    check("prefs seeded into an empty creator SOUL", a["seeded"] is True and a["text"] == "Пиши по-русски, с акутами.")
    check("a second seed changes nothing", b["seeded"] is False and b["text"] == "Пиши по-русски, с акутами.")
    check("a test scope has its own SOUL", post({"op": "soul", "realm": "creator"}, "claude")["text"] == "")

    # templates per world
    t = post({"op": "template", "realm": "reader", "name": "Притча", "request": "\n\nA parable: one image, one turn.", "skeleton": "…"})
    check("a user template of the reader world", any(x["id"] == "u:Притча" and not x["builtin"] for x in t["templates"]))
    check("not in the creator world", not any(x["id"] == "u:Притча" for x in post({"op": "world", "realm": "creator"})["templates"]))
    check("an empty template refused", raises(lambda: post({"op": "template", "realm": "reader", "name": "Пусто"})))
    t = post({"op": "template", "realm": "reader", "name": "Притча", "delete": True})
    check("a template taken away", not any(x["id"] == "u:Притча" for x in t["templates"]))

    # the Narrator world's drafts
    d = post({"op": "draft", "id": "song", "draft": {"realm": "reader", "task": "dialog", "raw": "{}",
                                                     "draft": {"title": "T", "text": "Анна: Да.", "voice": "calm", "notes": "",
                                                               "cast": [{"name": "Анна", "voice_hint": "alto"}, "junk"]}}})
    rec = d["drafts"][-1]
    check("a reader draft keeps realm, text, voice and cast", rec["realm"] == "reader" and rec["draft"]["text"] == "Анна: Да."
          and rec["draft"]["cast"] == [{"name": "Анна", "voice_hint": "alto"}], rec)
    d = post({"op": "draft", "id": "song", "draft": {"task": "song", "draft": {"title": "S", "lyrics": "[Verse]\nla"}}})
    check("an old-style draft is the creator's", d["drafts"][-1]["realm"] == "creator" and "cast" not in d["drafts"][-1]["draft"])

    # documents for the migration
    song = post({"op": "put", "title": "Песня", "lyrics": "[Verse]\nраз два\n[Chorus]\nтри"})
    iuda = post({"op": "put", "title": "Иуда · LCVr · тест Виктора", "lyrics": "[Verse]\n" + "Иуда, раб Иешуа.\n" * 700})
    long_ = post({"op": "put", "title": "Книга", "lyrics": "Слово за словом. " * 800})
    dialog = post({"op": "put", "title": "Разговор", "lyrics": "Анна: Ты пришёл?\nПётр: Пришёл.\nАнна: Поздно.\nОн молчал."})
    marked = post({"op": "put", "title": "Помеченная песня", "lyrics": "Без тегов.", "realm": "creator"})
    cand = post({"op": "candidates"})
    by = {x["id"]: x for x in cand["candidates"]}
    check("not done yet", cand["done"] is None)
    check("a song with sections is no candidate", song["id"] not in by, by.get(song["id"]))
    check("Иуда · LCVr: a candidate (long, lcv) never pre-ticked", iuda["id"] in by and not by[iuda["id"]]["pretick"]
          and "lcv" in by[iuda["id"]]["reasons"] and "long" in by[iuda["id"]]["reasons"], by.get(iuda["id"]))
    check("a long text with no sections pre-ticked", by.get(long_["id"], {}).get("pretick") is True, by.get(long_["id"]))
    check("a dialogue pre-ticked", by.get(dialog["id"], {}).get("pretick") is True and "dialog" in by[dialog["id"]]["reasons"], by.get(dialog["id"]))
    check("a document set to a world by hand is no candidate", marked["id"] not in by)
    check("the pre-ticked come first", cand["candidates"][0]["pretick"] is True)
    m = post({"op": "migrate", "ids": [long_["id"], dialog["id"], "nothex"]})
    rows = {x["id"]: x for x in m["docs"]}
    check("the ticked became readings", m["migrated"] == 2 and rows[long_["id"]]["realm"] == "reader" and rows[long_["id"]]["realm_set"])
    check("Иуда stays a song", rows[iuda["id"]]["realm"] == "creator" and not rows[iuda["id"]]["realm_set"])
    check("the migration marked done", post({"op": "candidates"})["done"] == m["done"] and m["done"])
    check("a migrated document keeps its versions as they were", len(W.get(kit, long_["id"])["versions"]) == len(long_["versions"]))

    # «Read in the Narrator», «Edit in the Writer»
    s1 = post({"op": "put", "title": "Притча", "lyrics": "Жил-был сеятель."})
    tr = post({"op": "to_reader", "id": s1["id"]})
    check("to_reader: stamped and a reading", tr["realm"] == "reader" and tr["from_reader"]["at"] > 0)
    tr2 = post({"op": "to_reader", "id": marked["id"]})
    check("to_reader: a world set by hand stays", tr2["realm"] == "creator" and "at" in tr2["from_reader"])
    fr = post({"op": "from_reader", "doc": s1["id"], "text": "Жил-был сеятель. Вышел сеять."})
    doc = W.get(kit, s1["id"])
    check("from_reader: the Narrator's text into its document", not fr["created"] and fr["updated"] and doc["lyrics"] == "Жил-был сеятель. Вышел сеять.")
    check("from_reader: the text before kept as a version", doc["versions"][-1]["lyrics"] == "Жил-был сеятель."
          and doc["versions"][-1]["label"] == "before the Narrator's text")
    fr = post({"op": "from_reader", "doc": s1["id"], "text": "Жил-был сеятель. Вышел сеять."})
    check("from_reader: the same text, no new version", not fr["updated"] and len(W.get(kit, s1["id"])["versions"]) == len(doc["versions"]))
    nw = post({"op": "from_reader", "doc": "", "text": "# Глава первая\n\nВ начале было Слово.", "params": {"mode": "narration"}})
    check("from_reader: no document, a new reading", nw["created"] and nw["doc"]["realm"] == "reader" and nw["doc"]["title"] == "Глава первая"
          and nw["doc"]["params"] == {"mode": "narration"}, nw["doc"].get("title"))
    gone = post({"op": "from_reader", "doc": "0123456789ab", "text": "Текст."})
    check("from_reader: a document gone, a new reading", gone["created"])
    check("from_reader: nothing to bring refused", raises(lambda: post({"op": "from_reader", "doc": "", "text": "  "})))

    # the Narrator's takes linked back
    W.link_takes(kit, s1["id"], ["take-a", "bad/name"])
    check("link_takes: the take on its document", W.get(kit, s1["id"])["takes"] == ["take-a"])
    check("link_takes: a document gone raises (the reader says so)", raises(lambda: W.link_takes(kit, "0123456789ab", ["x"]), FileNotFoundError))
    import reader as R  # noqa: E402
    said = []
    R.H.update(kit=str(kit), say=said.append)
    R._link_doc({"id": "run1", "doc": s1["id"], "take": "book-1", "takes": [{"take": "book-1"}, {"take": "book-2"}], "doc_scope": ""})
    check("reader: a book's parts all linked", set(W.get(kit, s1["id"])["takes"]) >= {"book-1", "book-2"} and "linked" in said[-1], said)
    R._link_doc({"id": "run2", "doc": "0123456789ab", "take": "t"})
    check("reader: a gone document said, not raised", "is gone" in said[-1], said)

    # export and import carry the souls
    exp = post({"op": "export"})
    check("export carries both souls", exp["souls"]["creator"] == "Пиши по-русски, с акутами." and exp["souls"]["reader"] == "third")
    with tempfile.TemporaryDirectory() as tmp2:
        k2 = Path(tmp2)
        W.post(k2, {"op": "soul", "realm": "creator", "text": "своё"})
        got = W.post(k2, {"op": "import", "backup": exp})
        check("import: an empty SOUL written, a full one kept as a version", got["imported"]["souls"] == {"reader": "written", "creator": "kept as a version"}
              and W.post(k2, {"op": "soul", "realm": "creator"})["text"] == "своё"
              and any(v["name"].endswith("-from-backup.md") for v in W.post(k2, {"op": "soul", "realm": "creator"})["versions"]), got["imported"])
        d2 = {x["title"]: x for x in got["docs"]}
        check("import keeps from_reader", W.get(k2, d2["Притча"]["id"]).get("from_reader", {}).get("at"))

print("\n" + ("all good" if not bad else f"{len(bad)} FAILED: " + "; ".join(bad)))
sys.exit(1 if bad else 0)
