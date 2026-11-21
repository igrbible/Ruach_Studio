"""HERESY 2905: the Musician's song kept in its Writer document: made on the first save, a changed text keeping the one before as a version (a new
version number too), the same text twice no version, a Generate's takes linked, the Narrator's readings and another song's document never touched.
python3 lab/test_song_keep_2905.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import writer as w  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


kit = Path(tempfile.mkdtemp())
r = w.post(kit, {"op": "song_keep", "title": "Как закалялся кремний v1.0.1", "style": "rock", "lyrics": "[Verse]\nla", "params": {"cot": "full"}})
did = r["doc"]["id"]
check("the first save makes the song's document, in the Musician's realm", r["created"] and not r["kept"] and w.get(kit, did).get("realm") == "creator", r)
r = w.post(kit, {"op": "song_keep", "title": "Как закалялся кремний v1.0.1", "style": "rock", "lyrics": "[Verse]\nla", "params": {"cot": "full"}})
check("the same words again: the same document, no version", r["doc"]["id"] == did and not r["created"] and not r["kept"] and r["doc"]["versions"] == 0, r)
r = w.post(kit, {"op": "song_keep", "title": "Как закалялся кремний v1.0.2", "style": "rock", "lyrics": "[Verse]\nla la", "takes": ["20261120-171702-a"]})
d = w.get(kit, did)
check("a new version number with new words: the same document, the text before kept as a version, the take linked",
      r["doc"]["id"] == did and r["kept"] and len(d["versions"]) == 1 and d["versions"][0]["title"] == "Как закалялся кремний v1.0.1" and d["title"].endswith("v1.0.2")
      and d["takes"] == ["20261120-171702-a"] and d["params"] == {"cot": "full"}, d)
rd = w.post(kit, {"op": "reader_keep", "title": "Как закалялся кремний", "text": "a reading"})
r = w.post(kit, {"op": "song_keep", "title": "Как закалялся кремний v1.0.3", "style": "rock", "lyrics": "[Verse]\nla la la"})
check("a reading of the same title stays the Narrator's: the song goes into its own document", r["doc"]["id"] == did and rd["doc"]["id"] != did, [r, rd])
o = w.post(kit, {"op": "song_keep", "title": "Другая песня", "style": "pop", "lyrics": "x"})
check("another song: a document of its own", o["created"] and o["doc"]["id"] != did, o)
for body, why in (({"op": "song_keep", "title": "", "style": "a"}, "no title"), ({"op": "song_keep", "title": "Untitled", "style": "a"}, "Untitled"),
                  ({"op": "song_keep", "title": "X", "style": " ", "lyrics": ""}, "no words")):
    try:
        w.post(kit, body)
        check(why + " refused", False)
    except ValueError:
        check(why + " refused", True)
d = w.post(kit, {"op": "put", "title": "Plain", "style": "s", "lyrics": "l"})
d2 = w.post(kit, {"op": "put", "id": d["id"], "title": "Plain", "style": "s2", "lyrics": "l"})
check("op put as before: a save keeps the version before", len(d2["versions"]) == 1, d2)
print("test_song_keep_2905:", "FAIL " + str(len(bad)) if bad else "all ok")
sys.exit(1 if bad else 0)
