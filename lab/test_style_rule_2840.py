"""HERESY 2840 (Viktor 18.11.2026: «В промптах к LLM ещё раз перепроверь лимиты, даже если человек будет просить описательный длинный промпт. Пересмотри
SOUL для обоих миров в Писателе»): the Writer's worlds on the lab's side. The Narrator's charter says its reading style's limit as the field and the lab
count it (160, spaces counted) and keeps it over the brief and the SOUL; a SOUL stands over the charter save the length limits; the Musician world's
chip «Style for YuE2» asks for the rule, the same words as the page's own.   python3 lab/test_style_rule_2840.py"""
import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import writer_worlds as WW  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


CHIP = ("Rewrite the style for YuE2 within 200 characters without spaces, never over 400: keep its most telling audible details, drop what it cannot hear, "
        "and make key, meter and tempo agree with the score.")

ch = WW.charter()
check("the Narrator's charter: «voice» at most 160 characters, the spaces counted, the field's own limit (Drama 3) and Higgs' tags",
      'in plain words, at most 160 characters with the spaces counted: the Narrator\'s style field takes no more for Drama 3 and refuses a longer one '
      '(Higgs takes only its own tags, up to 200)' in ch, ch[:600])
check("  kept over a brief or a SOUL that asks for more; the rest in notes and the cast's hints",
      "Keep to it even when the brief or the SOUL asks for a richer description: the rest goes in notes and in the cast's hints." in ch)
check("  its final pass checks the 160", '"voice" short and audible, 160 characters at most;' in ch)
check("  no «about 160» left, and no word of the Musician's rule (another world's)", "about 160" not in ch and "without spaces" not in ch and "400" not in ch)
check("  the field's limit is the engine's own (drama3/engine.json style.max 160)",
      json.load(open(HERE / "reader_engines" / "drama3" / "engine.json", encoding="utf-8"))["style"]["max"] == 160
      if (HERE / "reader_engines" / "drama3" / "engine.json").is_file() else True)

check("a SOUL stands over the charter save the length limits", WW.SOUL_HEADING.endswith(
    "where the two disagree, follow this, except the length limits above, of a song's style and of a reading's voice, which hold over it)"), WW.SOUL_HEADING)
with tempfile.TemporaryDirectory() as tmp:
    wd = Path(tmp)
    WW.soul_put(wd, "reader", "Describe every voice richly, at length: a whole paragraph for each reader.")
    w = WW.world(wd, "reader")
    check("  the Narrator's system: the charter, the heading with its exception, then the SOUL",
          w["system"].startswith(ch) and ("\n\n" + WW.SOUL_HEADING + "\nDescribe every voice richly") in w["system"], w["system"][-400:])
    c = WW.world(wd, "creator")
    check("  the Musician's world from the lab keeps no system of its own (the page's charter)", c["system"] == "" and c["charter"] == "")

chip = [x for x in WW.CREATOR["chips"] if x[0] == "Style for YuE2"]
check("the Musician world's chip «Style for YuE2» asks for the rule", chip and chip[0][1] == CHIP, chip)
page = HERE.parent / "build" / "tools" / "console" / "heresy-assist.js"
if page.is_file():
    s = page.read_text(encoding="utf-8")
    check("  the page's own chip says the same words", '["Style for YuE2", ' + json.dumps(CHIP) + "]" in s)
    check("  the page's charter has the rule under its heading, and last", "STYLE LENGTH (this Studio's hard rule" in s and "LAST, WHATEVER THE BRIEF OR THE SOUL ASKS" in s)
    # HERESY 2842 (SOUL-7): the Musician's SOUL under the lab's own heading, word for word; SOUL-1, -4, -5 in the charter
    check("  2842: the page's SOUL heading is the lab's, word for word", "var SOUL_HEADING = " + json.dumps(WW.SOUL_HEADING, ensure_ascii=False) + ";" in s)
    check("  2842: the output contract names style_tags; the author's letters; his phonetic spellings never removed",
          '\\"style\\", \\"style_tags\\" and \\"notes\\"' in s and "THE AUTHOR'S LETTERS" in s and "never remove the author's own phonetic spellings" in s
          and "USER WRITING PREFERENCES" not in s)
    rule = re.search(r'var STYLE_RULE = "([^"]+)";', s)
    check("  the page's rule: without spaces, 200 the aim, never over 400, even when asked for a long one",
          bool(rule) and "without spaces" in rule.group(1) and "aim at 200 or fewer" in rule.group(1) and "never return more than 400" in rule.group(1)
          and "long, descriptive or detailed style" in rule.group(1), rule and rule.group(1))

print("\n2840 lab: " + ("all passed" if not bad else str(len(bad)) + " failed: " + "; ".join(bad)))
sys.exit(1 if bad else 0)
