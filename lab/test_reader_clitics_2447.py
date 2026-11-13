"""HERESY 2447: Russian clitic groups read with one stress (Viktor's «не было» → «не́ было», 12.11.2026), on a small index of its own.
HERESY 2451: his word on it the same day: «не́ дали» out, жил/пил without a stressed не, no за shifted. HERESY 2452: a form the dictionary stresses
two ways inside one word (ве́селы́) is never forced, it is named.
python3 lab/test_reader_clitics_2447.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_dict_build as b  # noqa: E402
import reader_stress as rs  # noqa: E402

A = "́"
bad = []


def check(text, want):
    got, _rep = rs.stress(text, "ru")
    ok = got == want
    print(("  ok    " if ok else "  FAIL  ") + text + " → " + got + ("" if ok else "   (want " + want + ")"))
    if not ok:
        bad.append(text)


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    rs.H["kit"] = kit
    rs.Z["con"] = None
    rs.OWN.clear()
    forms = ["бы" + A + "ло", "была" + A, "бы" + A + "ли", "дала" + A, "да" + A + "ли", "дали" + A, "жи" + A + "ла", "жила" + A, "пи" + A + "ла",
             "пила" + A, "го" + A + "род", "по" + A + "лю", "поля" + A, "ру" + A + "ку", "ве" + A + "сти", "ко" + A + "му", "ма" + A + "ма",
             "о" + A + "чень", "не" + A + "жно", "сказа" + A + "ла", "би" + A + "тва", "до" + A + "лго", "э" + A + "той", "сту" + A + "дии",
             "жи" + A + "ли", "ве" + A + "селы" + A, "се" + A + "веро-за" + A + "падный"]
    src = kit / "ru.txt"
    src.write_text("\n".join(forms) + "\n", encoding="utf-8")
    b.build("ru", src, rs.own_dir("ru") / "forms.sqlite")
    check("Этой Студии не было.", "Э" + A + "той Сту" + A + "дии не" + A + " было.")
    check("Не было его.", "Не" + A + " было его.")
    check("Он не был, они не были.", "Он не" + A + " был, они не" + A + " были.")
    check("Она не была, не дала, не жила, не пила.", "Она не была" + A + ", не дала" + A + ", не жила" + A + ", не пила" + A + ".")
    check("Пила и жила.", "Пила и жила.")                                  # alone they are homographs: left, named
    check("Они не дали.", "Они не дали.")                                  # 2451: «никто так не говорит»; дали a homograph, left
    check("Он не дал.", "Он не" + A + " дал.")
    check("Он не жил, не пил, они не жили.", "Он не жил, не пил, они не жи" + A + "ли.")   # 2451: no stressed не before жил/пил
    check("Не за что. Не к кому.", "Не" + A + " за что. Не" + A + " к кому.")
    check("Не за город.", "Не за го" + A + "род.")                          # 2451: «с ЗА снимай ударность»
    check("Уехал за город по полю, пропал без вести.", "Уехал за го" + A + "род по" + A + " полю, пропал бе" + A + "з вести.")
    check("Взял за руку.", "Взял за ру" + A + "ку.")
    check("Упал на пол.", "Упал на" + A + " пол.")                          # kept by his word
    check("Они веселы.", "Они веселы.")                                      # 2452: ве́селы́, two stresses in one form: not forced
    got, rep = rs.stress("Они веселы.", "ru")
    ok = {"word": "веселы", "forms": sorted(["веселы" + A, "ве" + A + "селы"])} in rep["homographs"]
    print(("  ok    " if ok else "  FAIL  ") + "named: " + str(rep["homographs"]))
    if not ok:
        bad.append("variants named")
    check("Ветер северо-западный.", "Ветер се" + A + "веро-за" + A + "падный.")   # one stress per part of a compound: kept
    check("Они ве" + A + "селы.", "Они ве" + A + "селы.")                   # his own mark wins
    check("Не, было ли.", "Не, бы" + A + "ло ли.")                          # a comma between: no group
    check("не\nбыло", "не\nбы" + A + "ло")                                   # nor a line
    check("Не бы" + A + "ло.", "Не бы" + A + "ло.")                         # the author's mark on the host wins
    check("Не" + A + " было.", "Не" + A + " было.")                         # and on the clitic: the host bare
    check("за го" + A + "род", "за го" + A + "род")                         # «битва за го́род»: his mark keeps the sense
    check("Мама же ли бы то очень нежно сказала.", "Ма" + A + "ма же ли бы то о" + A + "чень не" + A + "жно сказа" + A + "ла.")
    check("не очень", "не о" + A + "чень")                                  # не before any other word: as before
    out, _ = rs.stress("Он не был.", "uk")
    print(("  ok    " if "не́" not in out else "  FAIL  ") + "Ukrainian untouched: " + out)
    if "не́" in out:
        bad.append("uk")
print(("FAILED " + str(len(bad))) if bad else "test_reader_clitics_2447: ok")
sys.exit(1 if bad else 0)
