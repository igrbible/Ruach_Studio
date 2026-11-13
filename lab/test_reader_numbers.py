"""HERESY 2397: the Narrator's numbers said in words, in their case (reader_numbers.py). Run: python lab/test_reader_numbers.py
The words' stresses are checked against the stress indexes when they are on this machine (Zaliznyak's paradigm for Russian, lang-uk's for
Ukrainian): a numeral the index stresses one way must carry that stress."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader_numbers as rn  # noqa: E402

ACUTE = "́"
FAILS = []


def eq(got, want, what):
    if got != want:
        FAILS.append(f"{what}\n   got  {got}\n   want {want}")


def plain(t):
    return t.replace(ACUTE, "")


CASES = [
    ("ru", "Модель, заново выученную на 6650 часах музыки.", "Модель, заново выученную на шести тысячах шестистах пятидесяти часах музыки."),
    ("ru", "на 6 650 часах", "на шести тысячах шестистах пятидесяти часах"),
    ("ru", "за 6 недель", "за шесть недель"),
    ("ru", "27 лет", "двадцать семь лет"),
    ("ru", "1300 правок", "тысяча триста правок"),
    ("ru", "21 минута и 2 минуты", "двадцать одна минута и две минуты"),
    ("ru", "22 часа", "двадцать два часа"),
    ("ru", "более 650 лет", "более шестисот пятидесяти лет"),
    ("ru", "с 21 человеком", "с двадцатью одним человеком"),
    ("ru", "о 6650 долгих часах", "о шести тысячах шестистах пятидесяти долгих часах"),
    ("ru", "к 5 друзьям", "к пяти друзьям"),
    ("ru", "между 200 домами", "между двумястами домами"),
    ("ru", "в 1999 году", "в тысяча девятьсот девяносто девятом году"),
    ("ru", "до 2026 года", "до две тысячи двадцать шестого года"),
    ("ru", "к 2000 году", "к двухтысячному году"),
    ("ru", "в 2010 г.", "в две тысячи десятом году"),
    ("ru", "в 33 году", "в тридцать третьем году"),
    ("ru", "2 года и 1 год", "два года и один год"),
    ("ru", "5 мая", "пятого мая"),
    ("ru", "5-й день, 2-го числа, 3-я глава, в 5-м классе", "пятый день, второго числа, третья глава, в пятом классе"),
    ("ru", "50% и 1%", "пятьдесят процентов и один процент"),
    ("ru", "3,5 миллиона", "три целых пять десятых миллиона"),
    ("ru", "1 000 000 лет", "один миллион лет"),
    ("ru", "2 000 000 лет", "два миллиона лет"),
    ("ru", "Ин 3:16, 11.11.2026, 2.0.7, YuE2, 5-6, 1999–2000", "Ин 3:16, 11.11.2026, 2.0.7, YuE2, 5-6, 1999–2000"),
    ("ru", "[pause:600ms] 10 [5 sighs]", "[pause:600ms] десять [5 sighs]"),
    ("uk", "Модель, навчену наново на 6650 годинах музики.", "Модель, навчену наново на шести тисячах шестистах п’ятдесяти годинах музики."),
    ("uk", "27 років, 2 години, 2 роки, 2 дні, 21 хвилина", "двадцять сім років, дві години, два роки, два дні, двадцять одна хвилина"),
    ("uk", "у 1999 році, до 2026 року, у 2010 р., до 1 року", "у тисяча дев’ятсот дев’яносто дев’ятому році, до дві тисячі двадцять шостого року, у дві тисячі десятому році, до одного року"),
    ("uk", "з 5 друзями, понад 650 годин, 50%", "з п’ятьма друзями, понад шістсот п’ятдесят годин, п’ятдесят відсотків"),
    ("el", "σε 6.650 ώρες", "σε έξι χιλιάδες εξακόσιες πενήντα ώρες"),
    ("el", "3 ημέρες, 1 άνθρωπος, 200 μήνες, 21 χρόνια, 1.000 λέξεις", "τρεις ημέρες, ένας άνθρωπος, διακόσιοι μήνες, είκοσι ένα χρόνια, χίλιες λέξεις"),
    ("el", "των 1.300 διορθώσεων", "των χιλίων τριακοσίων διορθώσεων"),
    ("en", "6650 hours", "6650 hours"),
    ("he", "6650 שעות", "6650 שעות"),
]
import re  # noqa: E402
SKIP = re.compile(r"\[[^\[\]\n]{1,80}\]")
for lang, src, want in CASES:
    got, rep = rn.expand(src, lang, SKIP)
    eq(plain(got), want, f"{lang}: {src}")

# the stresses of the words it says
eq(rn.expand("на 6650 часах", "ru")[0], "на шести́ ты́сячах шестиста́х пяти́десяти часах", "ru stresses")
eq(rn.expand("в 2010 г.", "ru")[0], "в две ты́сячи деся́том году́", "ru году́")
eq(rn.expand("на 6650 годинах", "uk")[0], "на шести́ ти́сячах шестиста́х п’ятдесяти́ годинах", "uk stresses")

# every cardinal and ordinal 0..2100 in every case says something, and round numbers well
for lang in ("ru", "uk"):
    for n in list(range(0, 2101)) + [10 ** 6, 2 * 10 ** 6 + 3, 10 ** 9 + 21]:
        for c in rn.CASES:
            assert rn.cardinal(n, c, "m", lang), (lang, n, c)
            if n:
                for g in ("m", "f", "n", "p"):
                    assert rn.ordinal(n, c, g, lang), (lang, n, c, g)

# against the indexes, when here: every numeral word the index knows one way only carries that stress
try:
    import reader_stress as rs
    kit = Path(__file__).resolve().parents[1]
    rs.H["kit"] = kit
    have_uk, have_ru = rs.uk_ready(), rs.zaliznyak_ready() or rs.own_ready("ru")
except Exception as e:  # noqa: BLE001
    have_uk = have_ru = False
    print("no stress indexes here:", e)
checked = {"ru": 0, "uk": 0}
# gramdict/zalizniak-2010 itself: «во́семь числ., Т. восемью́//восьмью́»; the StarDict's «во́семью» is the noun во́семью (cf. се́мью)
GRAMDICT_SAYS = {"восемью́"}
for lang, have in (("ru", have_ru), ("uk", have_uk)):
    if not have:
        print(f"{lang}: the index is not on this machine; stresses checked by hand only")
        continue
    words = set()
    for n in list(range(1, 1001)) + [2000, 3000, 10 ** 6, 10 ** 9]:
        for c in rn.CASES:
            for g in ("m", "f", "n"):
                words.update(rn.cardinal(n, c, g, lang).split())
                words.update(rn.ordinal(n, c, g, lang).split())
            words.update(rn.ordinal(n, c, "p", lang).split())
    for w in sorted(words):
        k = rs.key(w)
        forms = (rs.uk_forms(k) if lang == "uk" else (rs.zaliznyak(k) if rs.Z["con"] is not None else rs.own_forms("ru", k)))
        forms = [f for f in (forms or []) if ACUTE in f or "ё" in f]
        if len(forms) != 1:
            continue
        mine = w.lower().replace("’", "'")
        theirs = forms[0].replace("’", "'")
        if mine in GRAMDICT_SAYS:                        # the paradigm's article of another word wins there; the dictionary itself says ours
            continue
        if "ё" in mine and (mine.replace("ё", "е") == theirs or mine.replace("ё", "е" + ACUTE) == theirs):
            continue                                     # трёхсо́т: the paradigm's StarDict writes е for the secondary ё (трё̀хсо́т in the dictionary)
        if ACUTE not in mine and "ё" not in mine and sum(ch in "аеёиоуыэюяєіїі" for ch in mine) <= 1:
            continue
        checked[lang] += 1
        if mine != theirs:
            FAILS.append(f"{lang} stress: mine {w}, the index {forms[0]}")
print("checked against the indexes:", checked)

if FAILS:
    print(f"{len(FAILS)} failed:")
    print("\n".join(FAILS))
    sys.exit(1)
print(f"test_reader_numbers: {len(CASES)} sentences and the tables, all pass")
