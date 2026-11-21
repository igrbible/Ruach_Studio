"""HERESY 2919, 2919c: a workspace's emoji, its own field (collection.json ws_emoji): one emoji, never one of the Studio's own marks (💎 🙈 ❄ 👁‍🗨 🔒);
given with a name (ws-create, ws-rename) or alone (ws-emoji); carried through a rename, a merge, a pour and a deletion as the note is; the one-time
upgrade of the names that begin with one, a migration every install runs by itself (a copy beside collection.json first, a flag, never twice); and a
name sent as it was before («🧪 X / Y») filed into the workspace it means, never a second one. Made-up names only.
python3 lab/test_ws_emoji_2919.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collection as C  # noqa: E402
import ws_emoji as E  # noqa: E402

bad = []
LAB, FIRE, CHILI, BOOK, GEM, MONKEY = "\U0001f9ea", "\U0001f525", "\U0001f336️", "\U0001f4d6", "\U0001f48e", "\U0001f648"


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


# the parser
check("lead: one emoji and the rest", E.lead(LAB + " Probe P9") == (LAB, "Probe P9"), E.lead(LAB + " Probe P9"))
check("lead: with its variation sign, whole", E.lead(CHILI + " Перец") == (CHILI, "Перец"))
check("lead: a joined one whole (👁‍🗨)", E.lead("\U0001f441‍\U0001f5e8 x")[0] == "\U0001f441‍\U0001f5e8")
check("lead: a flag whole", E.lead("\U0001f1fa\U0001f1e6 Слава") == ("\U0001f1fa\U0001f1e6", "Слава"))
check("lead: only the first (🔥🎸)", E.lead(FIRE + "\U0001f3b8 Пример") == (FIRE, "\U0001f3b8 Пример"))
check("lead: none in a plain name, a number, ©", E.lead("Утренний туман")[0] == "" and E.lead("1.0.4 x")[0] == "" and E.lead("© x")[0] == "")
check("lead: one in the middle is not taken", E.lead("Wave \U0001f3a7 вслепую")[0] == "")
check("reserved: 💎 🙈 ❄️ 👁‍🗨 🔒", all(E.reserved(x) for x in (GEM, MONKEY, "❄️", "❄", "\U0001f441️‍\U0001f5e8️", "\U0001f512")))
check("not reserved: 🧪 🔥", not E.reserved(LAB) and not E.reserved(FIRE))
check("reserved: 🚨, the imports' shelf («🚨 IMPORTED», the lab's own name for it)", E.reserved("\U0001f6a8") and E.lead("\U0001f6a8 IMPORTED")[0] == "\U0001f6a8")


def refused_check(v):
    try:
        E.check(v)
    except ValueError as e:
        return str(e)
    return ""


check("check: one emoji passes, none is none", E.check(LAB) == LAB and E.check("") == "" and E.check(None) == "")
check("check: two, a word, a reserved one refused", all(refused_check(v) for v in (LAB + FIRE, "abc", LAB + " x", GEM, MONKEY)))


def kit():
    tmp = tempfile.mkdtemp(prefix="ruach-test-2919-")
    k = Path(tmp)
    cfg, out = k / "user", k / "outputs"
    cfg.mkdir()
    for n in ("t1", "t2", "t3", "t4"):
        (out / n).mkdir(parents=True)
        (out / n / "meta.json").write_text(json.dumps({"title": n, "created": 1}), encoding="utf-8")
    return cfg, out


cfg, out = kit()
post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731


def refused(body):
    try:
        post(body)
    except ValueError as e:
        return str(e)
    return ""


em = lambda: C.load(cfg)["ws_emoji"]   # noqa: E731
ws = lambda: C.load(cfg)["workspaces"]   # noqa: E731
cat = post({"op": "ws-create", "workspace": "Гитара", "emoji": "\U0001f3b8"})
check("ws-create with an emoji keeps it, the catalog says it", em().get("Гитара") == "\U0001f3b8" and cat["ws_emoji"].get("Гитара") == "\U0001f3b8", cat.get("ws_emoji"))
check("a new install is marked upgraded at once (nothing to move), no copy made", (C.load(cfg).get(E.FLAG) or {}).get("renamed") == 0 and not list(cfg.glob("collection.before-emoji-*")))
check("ws-create with a reserved one refused, nothing made", "Studio's own mark" in refused({"op": "ws-create", "workspace": "X", "emoji": GEM}) and "X" not in ws())
post({"op": "ws-create", "workspace": "Гитара / Бой"})
check("a section made without one has none", "Гитара / Бой" not in em())
post({"op": "ws-emoji", "workspace": "Гитара / Бой", "emoji": "\U0001f941"})
check("ws-emoji gives a section its own", em().get("Гитара / Бой") == "\U0001f941", em())
check("ws-emoji on no workspace refused", "existing workspace" in refused({"op": "ws-emoji", "workspace": "Nope", "emoji": FIRE}))
post({"op": "ws-create", "workspace": GEM + " Set"})
check("a 💎 set keeps 💎 in the emoji's place: an emoji on it refused", "keeps" in refused({"op": "ws-emoji", "workspace": GEM + " Set", "emoji": FIRE}))
post({"op": "ws-rename", "workspace": "Гитара", "to": "Гитара · перебор"})
check("a rename carries the emoji, its section's too", em().get("Гитара · перебор") == "\U0001f3b8" and em().get("Гитара · перебор / Бой") == "\U0001f941" and "Гитара" not in em(), em())
post({"op": "ws-rename", "workspace": "Гитара · перебор", "to": "Гитара", "emoji": "\U0001f3bc"})
check("a rename with an emoji sets it", em().get("Гитара") == "\U0001f3bc", em())
post({"op": "ws-rename", "workspace": "Гитара", "to": "Гитара 2", "emoji": ""})
check("a rename with an empty emoji takes it off, the section keeps its own", "Гитара 2" not in em() and em().get("Гитара 2 / Бой") == "\U0001f941", em())
post({"op": "ws-create", "workspace": "Другое", "emoji": FIRE})
post({"op": "ws-add", "workspace": "Другое", "names": ["t1"]})
post({"op": "ws-create", "workspace": "Цель"})
post({"op": "ws-merge", "workspace": "Другое", "to": "Цель"})
check("a merge gives its emoji to one that has none", em().get("Цель") == FIRE and "Другое" not in em(), em())
post({"op": "ws-delete", "workspace": "Гитара 2"})
check("a deletion takes the emoji with it, its section's too", not any(k.startswith("Гитара 2") for k in em()), em())
post({"op": "ws-create", "workspace": "Гитара 2"})
check("one made again under that name is born without it", "Гитара 2" not in em(), em())
post({"op": "ws-create", "workspace": "Pour", "emoji": "\U0001f30a"})
post({"op": "ws-pour", "workspace": "Pour", "to": "Цель"})
check("a pour takes its emoji away, the other keeps its own", "Pour" not in em() and em().get("Цель") == FIRE, em())
# a name sent with its emoji first, after the upgrade: the same workspace, or a new one without the emoji in its name
post({"op": "ws-add", "workspace": FIRE + " Цель", "names": ["t2"]})
check("«🔥 Цель» files into Цель (its own 🔥), no second workspace", "t2" in ws()["Цель"] and FIRE + " Цель" not in ws(), sorted(ws()))
post({"op": "ws-add", "workspace": LAB + " Свежее / Круг", "names": ["t3"]})
check("«🧪 Свежее / Круг» not there: made as Свежее (🧪 in its field) / Круг", ws().get("Свежее / Круг") == ["t3"] and em().get("Свежее") == LAB and LAB + " Свежее" not in ws(), (sorted(ws()), em()))
post({"op": "ws-add", "workspace": LAB + " Свежее / Круг", "names": ["t4"]})
check("  and sent again it lands there, nothing new", sorted(ws()["Свежее / Круг"]) == ["t3", "t4"] and len([w for w in ws() if "Свежее" in w]) == 2, sorted(ws()))
post({"op": "ws-create", "workspace": "\U0001f3b8 Цель"})
check("«🎸 Цель» with Цель wearing 🔥: another workspace, its name as given (two emoji never merge two)", "\U0001f3b8 Цель" in ws(), sorted(ws()))
check("a 💎 name is never split: «💎 Set» stays as it is", GEM + " Set" in ws() and "Set" not in ws())
post({"op": "ws-add", "workspace": "\U0001f6a8 IMPORTED", "names": ["t1"]})
check("the imports' shelf «🚨 IMPORTED» is made and kept by that name", "t1" in ws().get("\U0001f6a8 IMPORTED", []) and "IMPORTED" not in ws(), sorted(ws()))

# the migration: on an install whose names begin with emoji, once, by itself, with a copy beside the file
cfg, out = kit()
post = lambda body: C.collection_post(cfg, out, body)   # noqa: E731
raw = {"workspaces": {LAB + " Probe P9": ["t1"], LAB + " Probe P9 / Круг": ["t2"], LAB + " Probe P9 / " + FIRE + " Пламя": [], CHILI + " Перец": ["t3"],
                      GEM + " Demo Set": [], MONKEY + " Вслепую": [], "Борей": [], LAB + " Борей": [], FIRE: [], BOOK + " Летопись": [], "Notes A/B": [],
                      LAB + " Notes A/B · test": []},
       "locks": {GEM + " Demo Set": {"workspace": True}, LAB + " Probe P9": {"tracks": True}}, "ws_notes": {LAB + " Probe P9 / Круг": "a note"},
       "frozen": [BOOK + " Летопись"], "blind": [MONKEY + " Вслепую"], "archived": [CHILI + " Перец"], "pins": {LAB + " Probe P9": ["t1"]},
       "playlist": ["t1", "@ws:" + LAB + " Probe P9 / Круг"], "albums": [{"name": "A", "items": ["@ws:" + CHILI + " Перец", "t2"]}],
       "ws_realm": {LAB + " Probe P9": "reader"}, "fresh_since": 1}
p = cfg / "collection.json"
p.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
before = p.read_text(encoding="utf-8")
dry = post({"op": "ws-emoji-upgrade"})["upgrade"]
rows = {r["old"]: r for r in dry["rows"]}
check("the dry run writes nothing (the migration runs only through a write or a read of the catalog, and the dry op is neither)", dry["dry"] is True and p.read_text(encoding="utf-8") == before)
check("dry: the first emoji to its field, a section follows, its own emoji its own",
      rows[LAB + " Probe P9"]["new"] == "Probe P9" and rows[LAB + " Probe P9"]["emoji"] == LAB and rows[LAB + " Probe P9 / Круг"]["new"] == "Probe P9 / Круг" and
      rows[LAB + " Probe P9 / " + FIRE + " Пламя"]["new"] == "Probe P9 / Пламя" and rows[LAB + " Probe P9 / " + FIRE + " Пламя"]["emoji"] == FIRE, dry["rows"])
check("dry: 💎 and 🙈 stay in their names; a name another holds stays, said why; an emoji alone stays",
      rows[GEM + " Demo Set"]["new"] == GEM + " Demo Set" and rows[MONKEY + " Вслепую"]["new"] == MONKEY + " Вслепую" and "taken" in rows[LAB + " Борей"]["why"] and rows[FIRE]["why"], dry["counts"])
check("dry: a rest the names' rule would refuse today (an A/B) is moved all the same, as it was", rows[LAB + " Notes A/B · test"]["new"] == "Notes A/B · test", rows[LAB + " Notes A/B · test"])
cat = C.catalog(out, cfg)                        # the first read: the migration
d = C.load(cfg)
snaps = list(cfg.glob("collection.before-emoji-*.json"))
check("the migration: a copy beside collection.json first, dated, the file as it was", len(snaps) == 1 and snaps[0].read_text(encoding="utf-8") == before, [s.name for s in snaps])
check("  the flag with what it did; the catalog says it to the page", (d.get(E.FLAG) or {}).get("renamed") == 6 and d[E.FLAG]["emoji"] == 5 and len(d[E.FLAG]["kept"]) == 2 and
      cat.get("ws_emoji_upgraded", {}).get("emoji") == 5, (d.get(E.FLAG), cat.get("ws_emoji_upgraded")))
check("  the names moved with their takes, each level's emoji set", d["workspaces"].get("Probe P9") == ["t1"] and d["workspaces"].get("Probe P9 / Круг") == ["t2"] and
      d["ws_emoji"].get("Probe P9") == LAB and d["ws_emoji"].get("Probe P9 / Пламя") == FIRE and d["ws_emoji"].get("Перец") == CHILI, (sorted(d["workspaces"]), d["ws_emoji"]))
check("  locks, pins, notes, realm, frozen, blind, archive, playlist and albums followed",
      d["locks"].get("Probe P9") == {"tracks": True} and d["pins"].get("Probe P9") == ["t1"] and d["ws_notes"].get("Probe P9 / Круг") == "a note" and d["ws_realm"].get("Probe P9") == "reader" and
      d["frozen"] == ["Летопись"] and d["blind"] == [MONKEY + " Вслепую"] and d["archived"] == ["Перец"] and d["playlist"] == ["t1", "@ws:Probe P9 / Круг"] and
      d["albums"][0]["items"] == ["@ws:Перец", "t2"] and d["locks"].get(GEM + " Demo Set") == {"workspace": True}, d)
after = p.read_text(encoding="utf-8")
C._MIGRATED.discard(str(cfg))
C.catalog(out, cfg)
check("never twice: read again (the process's memory forgotten), the file the same, no second copy", p.read_text(encoding="utf-8") == after and len(list(cfg.glob("collection.before-emoji-*.json"))) == 1)
real = post({"op": "ws-emoji-upgrade", "dry": False})["upgrade"]
check("  the op's real run after it does nothing and says so", real.get("done_before") is True and p.read_text(encoding="utf-8") != "" and len(list(cfg.glob("collection.before-emoji-*.json"))) == 1)
# the scripts and the runs that still send the old names
post({"op": "ws-add", "workspace": LAB + " Probe P9 / Круг", "names": ["t3"]})
d = C.load(cfg)
check("a run sent with an old name lands where its workspace went, nothing made under the old name",
      "t3" in d["workspaces"]["Probe P9 / Круг"] and not any(w.startswith(LAB + " Probe") for w in d["workspaces"]), sorted(d["workspaces"]))
post({"op": "ws-add", "workspace": LAB + " Probe P9 / " + FIRE + " Пламя", "names": ["t4"]})
post({"op": "ws-create", "workspace": LAB + " Probe P9 / Refined"})
d = C.load(cfg)
check("  its section with its own emoji, and a section of it not made yet, under the new name", d["workspaces"].get("Probe P9 / Пламя") == ["t4"] and "Probe P9 / Refined" in d["workspaces"] and
      not any(w.startswith(LAB + " Probe") for w in d["workspaces"]), sorted(d["workspaces"]))
post({"op": "ws-rename", "workspace": "Probe P9", "to": "Probe P10"})
post({"op": "ws-add", "workspace": LAB + " Probe P9 / Круг", "names": ["t1"]})
d = C.load(cfg)
check("  renamed after the upgrade: the old name follows it on", "t1" in d["workspaces"].get("Probe P10 / Круг", []) and "Probe P9 / Круг" not in d["workspaces"], sorted(d["workspaces"]))
post({"op": "ws-add", "workspace": LAB + " Борей", "names": ["t2"]})
check("  a name the upgrade left as it was (a clash) is still itself", "t2" in C.load(cfg)["workspaces"][LAB + " Борей"])
again = post({"op": "ws-emoji-upgrade"})["upgrade"]
check("a dry run after it finds nothing more to move", again["counts"]["renamed"] == 0, again["counts"])

print("\n" + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
