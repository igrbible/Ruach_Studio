"""HERESY 2862 (Viktor 19.11.2026: «При изменении версии тупо перезаписывается предыдущая»): a new version number in a title keeps the one before
even inside the autosave's quiet ten minutes (v1.2.7 edited, then saved as v1.2.8 a minute later, was written over); typing the name or the text
inside a sitting still keeps one version a sitting. The Narrator's readings kept under their title: the first makes the reading, a changed text
or version keeps the one before as a version, the same text keeps nothing; reader_find finds it by the title without its version."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import writer as w

assert w.version_of("Царю мій v1.2.8") == "1.2.8" and w.version_of("01. МАНИФЕСТ_ Крик. v4.3.0.1") == "4.3.0.1" and w.version_of("Песня") == ""
assert w.stem_key("Царю мій v1.2.8") == w.stem_key("царю  мій v1.2.7") == "царю мій" and w.stem_key("Я - буратино - v9.5.0") == "я - буратино"

kit = Path(tempfile.mkdtemp())
d = w.post(kit, {"op": "put", "title": "Царю мій v1.2.6", "style": "rock", "lyrics": "a"})
did = d["id"]
d = w.post(kit, {"op": "put", "id": did, "title": "Царю мій v1.2.7", "style": "rock", "lyrics": "b", "autosave": True})
assert [v["title"] for v in d["versions"]] == ["Царю мій v1.2.6"], d["versions"]
d = w.post(kit, {"op": "put", "id": did, "title": "Царю мій v1.2.7", "style": "rock", "lyrics": "bb", "autosave": True})   # the same sitting
assert len(d["versions"]) == 1, d["versions"]
d = w.post(kit, {"op": "put", "id": did, "title": "Царю мій v1.2.8", "style": "rock", "lyrics": "bb", "autosave": True})   # a new version, a minute later
assert [v["title"] for v in d["versions"]] == ["Царю мій v1.2.6", "Царю мій v1.2.7"] and d["versions"][-1]["lyrics"] == "bb", d["versions"]
d = w.post(kit, {"op": "put", "id": did, "title": "Царю мой v1.2.8", "style": "rock", "lyrics": "bb", "autosave": True})   # the name typed: one a sitting
assert len(d["versions"]) == 2 and d["title"] == "Царю мой v1.2.8"
print("a new version number keeps the one before inside a sitting; the name typed does not")

r = w.post(kit, {"op": "reader_keep", "title": "Псалом 23 v1", "text": "Господь пастырь мой"})
assert r["created"] and not r["kept"] and r["doc"]["versions"] == 0
rid = r["doc"]["id"]
r = w.post(kit, {"op": "reader_keep", "title": "Псалом 23 v1", "text": "Господь пастырь мой"})
assert r["doc"]["id"] == rid and not r["kept"] and r["doc"]["versions"] == 0
r = w.post(kit, {"op": "reader_keep", "title": "Псалом 23 v2", "text": "Господь — Пастырь мой", "style": "calm"})
assert r["doc"]["id"] == rid and r["kept"] and r["doc"]["versions"] == 1
doc = w.get(kit, rid)
assert doc["title"] == "Псалом 23 v2" and doc["lyrics"] == "Господь — Пастырь мой" and doc["style"] == "calm" and doc["realm"] == "reader"
assert doc["versions"][0]["title"] == "Псалом 23 v1" and doc["versions"][0]["lyrics"] == "Господь пастырь мой"
assert w.post(kit, {"op": "reader_find", "title": "Псалом 23 v7"})["doc"]["id"] == rid
assert w.post(kit, {"op": "reader_find", "title": "Царю мой v1.2.8"})["doc"] is None     # a song is not a reading
assert w.post(kit, {"op": "reader_keep", "title": "Псалом 24", "text": "x"})["doc"]["id"] != rid
try:
    w.post(kit, {"op": "reader_keep", "title": "", "text": "x"})
    raise AssertionError("an untitled reading kept")
except ValueError:
    pass
print("the Narrator's readings kept under their title, never written over")
print("OK")
