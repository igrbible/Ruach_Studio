"""HERESY 2374 (Viktor 11.11.2026: «для какого бы то ни было языка пользователя написать гайд, как внедрить свой массивный словарь по примеру
формата наших Зализняка и украинского»): a language's own stress dictionary turned into the Narrator's index, the shape of the Ukrainian one
(reader_stress.py reads it): models/narrator/dicts/LANG/forms.sqlite. docs/NARRATOR-DICTIONARIES.md is the guide.

    python lab/reader_dict_build.py LANG SOURCE [--out FILE] [--source "where it is from"] [--licence "its licence"]

SOURCE is one of:
  * a plain list (.txt, .tsv, .csv): one word form a line in UTF-8, its stressed vowel marked by an acute after it (U+0301: моло́ко) or a +
    before it (мол+око); a second field after a Tab may say «name» (a proper name: looked up first for a word with a capital inside a
    sentence) or carry anything else, which is ignored; a line starting with # is a comment;
  * a StarDict (its .idx with .dict.dz or .dict beside it) whose articles list a headword's forms with stresses, separated by commas, as the
    Russian «full accented paradigm» does.
A form found with two different stresses is a homograph: both kept, the Narrator names it and never guesses. A form without any stress mark
is skipped (counted). The index says its source and licence in its table «about»; give them, so whoever shares it knows what it may carry."""
import argparse
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_stress as rs  # noqa: E402

APOS = str.maketrans("’ʼ`", "'''")


def norm_form(f):
    """A form as the index keeps it: the stress as its own mark U+0301 after the vowel (a + before it becomes that), lower case, the
    apostrophe as '. A letter written with its accent in one code point (Spanish ó, Greek ά) is a letter of the language, not a stress mark:
    it is kept as it is, as the text the Narrator reads keeps it."""
    return rs.normal_form(f.strip()).replace(rs.GRAVE, "").lower().translate(APOS)


def from_list(path):
    for line in open(path, encoding="utf-8-sig"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.rstrip("\n").replace(",", "\t", 1).split("\t") if path.suffix == ".csv" else line.rstrip("\n").split("\t")
        yield parts[0], len(parts) > 1 and parts[1].strip().lower() == "name"


def from_stardict(idx):
    base = idx.with_suffix("")
    for head, art in rs._stardict(base):
        for f in art.split(","):
            yield f.replace("`", ""), bool(head[:1].isupper())


def build(lang, src, out, source="", licence=""):
    t0 = time.time()
    rows = from_stardict(src) if src.suffix == ".idx" else from_list(src)
    forms, cap = {}, {}
    n = bare = bad = 0
    for raw, name in rows:
        n += 1
        f = norm_form(raw)
        if not f or not rs.WORD.fullmatch(f):
            bad += 1
            continue
        if rs.ACUTE not in f and "ё" not in f:            # HERESY 2399: ё is a stress of its own (берёшь), as the paradigm writes it
            bare += 1
            continue
        k = rs.key(f).translate(APOS)
        if name:                                         # HERESY 2399: a name only where a capital says so (То́го the country never hides того́)
            cap.setdefault(k, set()).add(f)
        else:
            forms.setdefault(k, set()).add(f)
    out.parent.mkdir(parents=True, exist_ok=True)
    part = out.with_suffix(".part")
    part.unlink(missing_ok=True)
    con = sqlite3.connect(str(part))
    con.execute("CREATE TABLE forms (k TEXT PRIMARY KEY, f TEXT) WITHOUT ROWID")
    con.executemany("INSERT INTO forms VALUES (?, ?)", ((k, "|".join(sorted(v))) for k, v in forms.items()))
    con.execute("CREATE TABLE cap (k TEXT PRIMARY KEY, f TEXT) WITHOUT ROWID")
    con.executemany("INSERT INTO cap VALUES (?, ?)", ((k, "|".join(sorted(v))) for k, v in cap.items()))
    homo = sum(1 for v in forms.values() if len(v) > 1)
    con.execute("CREATE TABLE about (k TEXT PRIMARY KEY, v TEXT)")
    con.executemany("INSERT INTO about VALUES (?, ?)", [("lang", lang), ("source", source or src.name), ("licence", licence or "not said"),
                                                          ("built", time.strftime("%Y-%m-%d")), ("lines", str(n)), ("keys", str(len(forms))),
                                                          ("homographs", str(homo)), ("names", str(len(cap))), ("no_stress", str(bare)),
                                                          ("not_a_word", str(bad))])
    con.commit()
    con.execute("VACUUM")
    con.close()
    part.replace(out)
    return {"lines": n, "keys": len(forms), "homographs": homo, "names": len(cap), "no_stress": bare, "not_a_word": bad,
            "s": round(time.time() - t0, 1), "out": str(out)}


def main():
    ap = argparse.ArgumentParser(description=f"A language's own stress dictionary into the Narrator's index ({rs.paths.NARRATOR}/dicts/LANG/forms.sqlite)")
    ap.add_argument("lang", help="the language's code, as the Narrator's language list: ru, uk, be, es, de…")
    ap.add_argument("source", help="a list of stressed forms (.txt, .tsv, .csv) or a StarDict's .idx")
    ap.add_argument("--out", help=f"the index; by default {rs.paths.NARRATOR}/dicts/LANG/forms.sqlite of this Studio")
    ap.add_argument("--source", dest="said", default="", help="where the dictionary is from, kept in the index")
    ap.add_argument("--licence", default="", help="its licence, kept in the index")
    a = ap.parse_args()
    lang = rs._lang(a.lang)
    src = Path(a.source)
    if not src.is_file():
        sys.exit(f"no such file: {src}")
    if lang == "uk":
        print("note: Ukrainian reads its own lang-uk index at this place; yours takes its place", file=sys.stderr)
    out = Path(a.out) if a.out else rs.paths.at(rs.paths.NARRATOR) / "dicts" / lang / "forms.sqlite"
    r = build(lang, src, out, a.said, a.licence)
    print(f"{r['lines']} lines, {r['keys']} words, {r['homographs']} homographs, {r['names']} names, {r['no_stress']} without a stress mark, "
          f"{r['not_a_word']} not a word, {r['s']} s -> {r['out']}")
    print("restart the lab (or the Studio) so the Narrator opens it")


if __name__ == "__main__":
    main()
