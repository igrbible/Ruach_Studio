"""HERESY 2860 (UIX №91): a Narrator's take note in the page's language. The words live in the room's catalog (heresy-reader-i18n.js,
reader.takeNote.*): every word the lab writes has its row, thirteen languages, its English the code's own word for word, the same slots in
every language, no banned root; the note's ear line, the check's line and its replacement in Russian; English when the page said nothing,
as the note was written before."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import note_words as NW
import reader as r

rows = NW.rows()
assert rows, "the catalog's take-note rows could not be read"
for k, en in NW.EN.items():
    row = rows.get(k)
    assert row and len(row) == 13, k
    assert row[0] == en, (k, row[0], en)
    slots = set(re.findall(r"\{#\d\}", en))
    for i, s in enumerate(row):
        assert set(re.findall(r"\{#\d\}", s)) == slots, (k, NW.LANGS[i], s)
    low = [s.lower() for s in row]
    assert "раб" not in low[1] and "работ" not in low[1], (k, row[1])
    assert "роб" not in low[2] and "роб" not in low[3], (k, row[2], row[3])
    assert "δουλ" not in low[4], (k, row[4])
assert not set(rows) - set(NW.EN), f"rows the lab never writes: {set(rows) - set(NW.EN)}"
print(f"catalog: {len(rows)} rows, thirteen languages each")

assert NW.lang_of("ru-RU") == "ru" and NW.lang_of("") == "en" and NW.lang_of("xx") == "en" and NW.lang_of(None) == "en"
assert NW.w("ru", "flagged", 1, "x", n=1) == "отмечено слов 1: x"
assert NW.w("en", "flagged", 1, "x", n=1) == "1 word flagged: x" and NW.w("en", "flagged", 2, "x", n=2) == "2 words flagged: x"
assert NW.w("en", "mended", 1, n=1) == "1 codec knock mended at the seams"

# the ear's line: English as before when the page said nothing, Russian when it asked
piece = {"i": 2, "at": [4.2, 5.95], "reread": {"why": [{"kind": "inserted", "word": "пуво", "t": 1.4}], "kept_read": 2, "reads": 2}}
run = {"cer": 0.031, "rereads": 1, "pieces": [piece], "tails": 2, "holes": 1, "lufs": -16.04, "mended": 1, "hear": True}
en = r._heard_note(run)
assert en.startswith(" · Whisper 3.1 % of letters off, 1 piece(s) read again (piece 3: inserted: “пуво” at "), en
assert en.endswith(", reading 2 of 2 kept) · 2 tail(s) after the last word cut (a voice or a tone) · a silence of a second or more inside 1 piece(s)"
                   " · -16.0 LUFS · 1 codec knock mended at the seams"), en
ru = r._heard_note(dict(run, ui="ru"))
assert "Whisper: ошибочных букв 3.1 %, перечитано кусков: 1 (кусок 3: вставлено: «пуво» на " in ru, ru
assert "оставлено прочтение 2 из 2)" in ru and "хвостов после последнего слова срезано (голос или тон): 2" in ru and "-16.0 LUFS" in ru, ru
assert "Whisper was off" not in en and "не прослушано: Whisper был выключен" in r._heard_note({"hear": False, "ui": "ru"})
print("the ear's line: English as before, Russian asked")

# Whisper's check: its line in Russian, an earlier English line replaced, the note's own words kept
res = {"cer": 0.0123, "flagged_n": 1, "flagged": [{"kind": "swapped", "word": "сон", "heard": "сонь", "at": 3.5}]}
assert r._check_line(res) == "1.2 % of letters off, 1 word flagged: “сон” heard as “сонь” at 0:03.5", r._check_line(res)
assert r._check_line(res, "ru") == "ошибочных букв 1.2 %, отмечено слов 1: «сон» услышано как «сонь» на 0:03.5", r._check_line(res, "ru")
assert r._check_line({"cer": None, "error": "no ear"}, "uk") == "не почуто: no ear"


class Coll:
    def __init__(self):
        self.notes = {"t1": "🗣 The Narrator · narration\n—\nмои слова\n🎧 Whisper's check 01.11.2026 10:00: 0.0 % of letters off, no word flagged"}

    def load(self, cfg):
        return {"notes": dict(self.notes)}

    def collection_post(self, cfg, out, data):
        for n in data["names"]:
            self.notes[n] = data["text"]


c = Coll()
r.H.update(config_dir=lambda: Path("/nonexistent"), outputs="/nonexistent", collection=c, say=lambda s: None)
r._check_note(Path("/nonexistent/t1"), res, "ru")
note = c.notes["t1"]
assert note.count("🎧 ") == 1 and "\n🎧 Проверка Whisper " in note and "мои слова" in note and "Whisper's check" not in note, note
r._check_note(Path("/nonexistent/t1"), res, "en")                       # and back: the Russian line found and replaced
assert c.notes["t1"].count("🎧 ") == 1 and "🎧 Whisper's check " in c.notes["t1"], c.notes["t1"]
print("the check's line: in the page's language, an earlier line in another language replaced")
print("OK")
