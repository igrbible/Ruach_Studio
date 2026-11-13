"""HERESY 2475 (Viktor 12.11.2026, his two test texts; his rule, «на 100 %»: a form with more than one dictionary stress stays unmarked unless
he marks it). Through the stress pass with his marks and without, on a small index of its own: his marks kept as written, every homograph he
did not mark left bare and named, the words with one stress marked; «по полу» is read both ways in his own text, so it is no set phrase.
python3 lab/test_reader_homographs_2475.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_dict_build as b  # noqa: E402
import reader_stress as rs  # noqa: E402

A = "́"
bad = []

ZAMOK = ("За́мок замо́к. Но замо́к — не за́мок. Из-за того что за́мок замо́к, замо́к заржавел, так что не под замко́м за́мок, хотя… замо́к под "
         "замо́чным за́мком. Не под замко́м.")
MUKA = ("Рассыпалась мука́ по полу́, и по́ полу пробежалась хвостиком мышка. Му́ка не в том, что рассыпалась мука́, а в том, что мука́ для хозяйки "
        "теперь превратилась в му́ку.")


def check(what, cond, got=""):
    print(("  ok    " if cond else "  FAIL  ") + what + (("  → " + got) if got and not cond else ""))
    if not cond:
        bad.append(what)


def words(t):
    return [w.strip(".,…—«»:;!?") for w in t.split() if w.strip(".,…—«»:;!?")]


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    rs.H["kit"] = kit
    rs.Z["con"] = None
    rs.OWN.clear()
    forms = ["за" + A + "мок", "замо" + A + "к", "за" + A + "мком", "замко" + A + "м", "замо" + A + "чным", "заржаве" + A + "л", "того" + A,
             "хотя" + A, "му" + A + "ка", "мука" + A, "му" + A + "ку", "муку" + A, "по" + A + "лу", "полу" + A, "по" + A + "лю", "рассыпа" + A + "лась",
             "пробежа" + A + "лась", "хво" + A + "стиком", "мы" + A + "шка", "хозя" + A + "йки", "тепе" + A + "рь", "преврати" + A + "лась"]
    src = kit / "ru.txt"
    src.write_text("\n".join(forms) + "\n", encoding="utf-8")
    b.build("ru", src, rs.own_dir("ru") / "forms.sqlite")

    for name, marked in (("За́мок замо́к", ZAMOK), ("Рассыпалась мука́", MUKA)):
        got, rep = rs.stress(marked, "ru")
        mine = [w for w in words(marked) if A in w]
        out = words(got)
        check(f"{name}, his marks: every marked word as he wrote it ({len(mine)})",
              all(m in out for m in mine) and [w for w in out if w.replace(A, "") in {x.replace(A, "") for x in mine}] ==
              [w for w in words(marked) if w.replace(A, "") in {x.replace(A, "") for x in mine}], got)
        check(f"{name}, his marks: nothing named as a homograph", not rep["homographs"], str(rep["homographs"]))
        plain = marked.replace(A, "")
        got2, rep2 = rs.stress(plain, "ru")
        named = {h["word"] for h in rep2["homographs"]}
        homo = {"замок", "замком"} if name.startswith("За") else {"мука", "муку", "полу"}
        bare = [w for w in words(got2) if w.lower().replace(A, "") in homo]
        check(f"{name}, no marks: the homographs {sorted(homo)} bare ({len(bare)} places)", bare and all(A not in w for w in bare), got2)
        check(f"{name}, no marks: and named", homo <= named, str(sorted(named)))
        if name.startswith("Рас"):
            check("«по полу» never forced: no stress on по", "по" + A not in got2.lower(), got2)
            check("ordinary words still marked (рассыпа́лась, хво́стиком, хозя́йки)",
                  all(x in got2 for x in ("Рассыпа" + A + "лась", "хво" + A + "стиком", "хозя" + A + "йки")), got2)
        else:
            check("ordinary words still marked (замо́чным, заржаве́л, того́, хотя́)",
                  all(x in got2 for x in ("замо" + A + "чным", "заржаве" + A + "л", "того" + A, "хотя" + A)), got2)
    got, _ = rs.stress("Шли по полю.", "ru")
    check("«по́ полю» kept as his word of 2451 has it", "по" + A + " полю" in got, got)
    for marked in ("по полу" + A, "по" + A + " полу"):
        got, _ = rs.stress("Мука " + marked + ".", "ru")
        check(f"his «{marked}» kept", marked in got, got)

print(("FAILED " + str(len(bad))) if bad else "test_reader_homographs_2475: ok")
sys.exit(1 if bad else 0)
