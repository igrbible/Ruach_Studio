"""HERESY 2294 (Viktor 09.11.2026: «для Чтеца будет та же Библиотека, но со своими пространствами, древами и т.п. … Каждый трек принадлежит своему
оригиналу Творца или Чтеца, не перемещается из рэлма, но может линковаться. Огранщик также привязывается к оригинальному корню»): a take's realm is
its root's; a workspace's is its top's, the Reader's when made from its realm; a move never takes a take out of its realm, an add links it; pour and
merge never join two realms; a rename and a delete carry and drop the mark. No lab, no card: a folder of takes in a temporary Studio."""
import json
import tempfile
from pathlib import Path

import collection as c


def take(out, name, req=None, meta=None):
    d = out / name
    d.mkdir(parents=True)
    json.dump(dict({"title": name, "created": 1, "seconds": 1.0}, **(meta or {})), open(d / "meta.json", "w"))
    json.dump(req or {"style": "x", "lyrics": ""}, open(d / "request.json", "w"))


def refused(cfg, out, data, word):
    try:
        c.collection_post(cfg, out, data)
    except ValueError as e:
        assert word in str(e), e
        return
    raise AssertionError(f"not refused: {data}")


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    out, cfg = kit / "outputs", kit / "user"
    cfg.mkdir()
    take(out, "song")                                                               # the Creator's
    take(out, "song-refined", {"parent": "song", "semantic_tokens": True})         # the Refiner's, from it
    take(out, "read", {"reader": {"mode": "narration"}, "no_train": True}, {"model": "reader", "no_train": True})
    take(out, "read-fixed", {"parent": "read"})                                     # made from the Reader's take: the Reader's
    take(out, "read-import", {"imported": {"file": "a.wav"}}, {"model": "import", "provenance": {"by": "the Reader · drama3 (blind quants set)"}})
    take(out, "loop-a", {"parent": "loop-b"})                                       # a cycle stops where it closes
    take(out, "loop-b", {"parent": "loop-a"})
    cat = c.catalog(out, cfg)
    realm = {r["name"]: r["realm"] for r in cat["takes"]}
    kind = {r["name"]: r["kind"] for r in cat["takes"]}
    assert realm == {"song": "creator", "song-refined": "creator", "read": "reader", "read-fixed": "reader", "read-import": "reader",
                     "loop-a": "creator", "loop-b": "creator"}, realm
    assert kind["read"] == "narrated" and kind["song"] == "generated", kind
    assert all("own_realm" not in r for r in cat["takes"]) and cat["ws_realm"] == {}
    assert c.take_realms(out, ["read-fixed", "song-refined", "gone"]) == {"read-fixed": "reader", "song-refined": "creator", "gone": "creator"}

    c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Songs"})
    cat = c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Readings / Psalms", "realm": "reader"})
    assert cat["ws_realm"] == {"Readings": "reader"}, cat["ws_realm"]
    c.collection_post(cfg, out, {"op": "ws-add", "workspace": "Readings / Psalms", "names": ["read", "read-fixed"]})
    c.collection_post(cfg, out, {"op": "ws-add", "workspace": "Songs", "names": ["song"]})
    # out of its realm: refused, from nowhere named or from its own realm's workspace
    refused(cfg, out, {"op": "ws-move", "workspace": "Songs", "names": ["read"], "from": "Readings / Psalms"}, "link them")
    refused(cfg, out, {"op": "ws-move", "workspace": "Songs", "names": ["read"]}, "belong to the Narrator")
    refused(cfg, out, {"op": "ws-move", "workspace": "Readings", "names": ["song"], "from": "Songs"}, "belong to the Musician")
    # linked: the take stays in its own workspace and stands in the other realm's too
    c.collection_post(cfg, out, {"op": "ws-add", "workspace": "Songs", "names": ["read"]})
    ws = {r["name"]: r["workspaces"] for r in c.catalog(out, cfg)["takes"]}
    assert ws["read"] == ["Readings / Psalms", "Songs"], ws["read"]
    # a link moved between the other realm's workspaces is a link still
    c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Songs 2"})
    c.collection_post(cfg, out, {"op": "ws-move", "workspace": "Songs 2", "names": ["read"], "from": "Songs"})
    ws = {r["name"]: r["workspaces"] for r in c.catalog(out, cfg)["takes"]}
    assert ws["read"] == ["Readings / Psalms", "Songs 2"], ws["read"]
    # within its realm a move goes as before
    c.collection_post(cfg, out, {"op": "ws-move", "workspace": "Readings", "names": ["read-fixed"], "from": "Readings / Psalms"})
    # a new top made by a move from the Reader's realm is the Reader's, and takes the Reader's takes
    cat = c.collection_post(cfg, out, {"op": "ws-move", "workspace": "Chapters", "names": ["read-fixed"], "from": "Readings", "realm": "reader"})
    assert cat["ws_realm"] == {"Readings": "reader", "Chapters": "reader"}, cat["ws_realm"]
    # pour and merge never join two realms
    refused(cfg, out, {"op": "ws-pour", "workspace": "Readings", "to": "Songs"}, "two realms")
    refused(cfg, out, {"op": "ws-merge", "workspace": "Songs 2", "to": "Chapters"}, "two realms")
    # a section never goes under the other realm's top; a top renamed keeps its realm, deleted takes it along
    refused(cfg, out, {"op": "ws-rename", "workspace": "Readings / Psalms", "to": "Songs / Psalms"}, "stays in its realm")
    cat = c.collection_post(cfg, out, {"op": "ws-rename", "workspace": "Readings", "to": "Scripture"})
    assert cat["ws_realm"] == {"Scripture": "reader", "Chapters": "reader"} and "Scripture / Psalms" in cat["workspaces"], cat
    cat = c.collection_post(cfg, out, {"op": "ws-delete", "workspace": "Chapters"})
    assert cat["ws_realm"] == {"Scripture": "reader"}, cat["ws_realm"]
    c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Chapters"})     # one of that name later is born the Creator's
    assert c.catalog(out, cfg)["ws_realm"] == {"Scripture": "reader"}
    # a top given to a realm when none of its takes is the other's
    c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Old readings"})
    c.collection_post(cfg, out, {"op": "ws-add", "workspace": "Old readings", "names": ["read-import"]})
    refused(cfg, out, {"op": "ws-realm", "workspace": "Songs", "realm": "reader"}, "other realm")
    assert c.collection_post(cfg, out, {"op": "ws-realm", "workspace": "Old readings", "realm": "reader"})["ws_realm"]["Old readings"] == "reader"

# HERESY 2298 (Viktor 09.11.2026: «Огранщик и Видеограф, соответственно, должны иметь доступ к обоим мирам. Если только музыка обрабатывается, все
# деривативы в мире Творца, а вот если Чтец, но даже с музыкой, оригинально деривативы у Чтеца, а музыка… остаётся у себя в Творце, но также линкуется
# в Чтеца»): a realm written on a take anchors its line; a derivative's realm is worked out once from all it took in; its Creator's sources are linked
with tempfile.TemporaryDirectory() as tmp:
    import lineage
    kit = Path(tmp)
    out, cfg = kit / "outputs", kit / "user"
    cfg.mkdir()
    take(out, "song")
    take(out, "song2")
    take(out, "tts", {"imported": {"file": "speech.wav"}}, {"model": "import", "realm": "reader"})        # an imported TTS root, its realm written on it
    take(out, "tts-trim", {"parent": "tts"})                                                              # follows its root
    take(out, "narr", {"parent": "song"}, {"realm": "reader"})                                            # a voice over the song: frozen the Reader's
    take(out, "narr-cut", {"parent": "narr"})                                                             # follows the frozen one, not the song
    take(out, "song-v", {"parent": "tts"}, {"realm": "creator"})                                          # frozen the Creator's under a Reader root
    realm = {r["name"]: r["realm"] for r in c.catalog(out, cfg)["takes"]}
    assert realm == {"song": "creator", "song2": "creator", "tts": "reader", "tts-trim": "reader", "narr": "reader", "narr-cut": "reader",
                     "song-v": "creator"}, realm
    assert c.take_realms(out, ["narr-cut", "song-v", "tts-trim"]) == {"narr-cut": "reader", "song-v": "creator", "tts-trim": "reader"}
    assert all("fixed_realm" not in r for r in c.catalog(out, cfg)["takes"])
    # music only: the Creator's, at home; any Reader take in it: the Reader's, home with the Reader's take, whichever it was made on
    assert c.mixed_realm(out, "song", []) == {"realm": "creator", "home": "song", "inputs": [{"take": "song", "realm": "creator"}]}
    assert c.mixed_realm(out, "song", ["song2", "song"])["realm"] == "creator"
    m = c.mixed_realm(out, "song", ["tts-trim", "song2"])
    assert m == {"realm": "reader", "home": "tts-trim", "inputs": [{"take": "song", "realm": "creator"}, {"take": "tts-trim", "realm": "reader"},
                                                                   {"take": "song2", "realm": "creator"}]}, m
    assert c.mixed_realm(out, "tts", ["song"])["home"] == "tts"
    # the music stays the Creator's and is linked into the Reader's workspaces its home stands in, not moved
    c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Songs"})
    c.collection_post(cfg, out, {"op": "ws-add", "workspace": "Songs", "names": ["song", "song2"]})
    c.collection_post(cfg, out, {"op": "ws-create", "workspace": "Readings / Drama", "realm": "reader"})
    c.collection_post(cfg, out, {"op": "ws-add", "workspace": "Readings / Drama", "names": ["tts-trim"]})
    assert c.link_sources(cfg, out, c.mixed_realm(out, "song", [])) == []
    assert c.link_sources(cfg, out, m) == ["Readings / Drama"]
    ws = {r["name"]: r["workspaces"] for r in c.catalog(out, cfg)["takes"]}
    assert ws["song"] == ["Readings / Drama", "Songs"] and ws["song2"] == ["Readings / Drama", "Songs"], ws
    assert {r["name"]: r["realm"] for r in c.catalog(out, cfg)["takes"]}["song"] == "creator"
    # its home in no Reader workspace: nothing linked, said as [] (the lab writes it in the manifest), never a link pretended
    assert c.link_sources(cfg, out, c.mixed_realm(out, "song", ["narr"])) == []
    # the family tree: the version's realm and its other takes as links, with their titles
    dv = out / "tts-trim" / "derived" / "plugin-mix-1"
    dv.mkdir(parents=True)
    json.dump({"id": "plugin-mix-1", "kind": "plugin", "label": "Voice over music", "parent": "tts-trim", "made_on": "song", "source": "take:song",
               "realm": "reader", "inputs": m["inputs"], "created": "2026-11-09 20:00"}, open(dv / "manifest.json", "w"))
    t = lineage.tree(kit, "tts-trim")
    got = next(k for k in t["root"]["children"] if k["name"] == "tts-trim")["derived"][0]
    assert got["realm"] == "reader" and got["links"] == [{"take": "song", "realm": "creator", "title": "song"}, {"take": "song2", "realm": "creator", "title": "song2"}], got
print("test_collection_realm: ok")
