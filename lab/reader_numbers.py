"""HERESY 2397 (Viktor 11.11.2026, his ear on the Narrator's readings: «650» read in the wrong case, «TTS лучше отдавать сложно склоняемые
числительные словами»; and «6.650 ώρες» in Greek): numbers written in figures said in words before the engine reads them, in the case the
sentence asks, with their stresses marked.

Russian and Ukrainian: a cardinal agrees with the noun after it and the preposition before it. The noun's own ending says the case when it can
(-ах/-ях the locative, -ам/-ям the dative, -ами/-ями the instrumental: «на 6650 часах» is «на шести́ ты́сячах шестиста́х пяти́десяти часа́х»);
else the preposition does («до 650 лет», «более 20», «через 5 минут»); else it is the nominative. A number ending in 1 or 2 takes its gender from
the noun («21 минута», «две минуты»). A year («в 1999 году», «до 2026 года», «у 1999 році», a four-digit number after в/с/до/к/після with no
noun) is said as an ordinal; so is a number with its ending written after a hyphen («5-й», «2-го», «3-я»). A percent sign is the noun in its
case («50%» «пятьдеся́т проце́нтов»). Greek: the gender of the noun after it (ώρες feminine: «έξι χιλιάδες εξακόσιες πενήντα ώρες»), the
genitive before -ων; «6.650» is six thousand six hundred fifty there (a dot groups the thousands), «6,5» six point five.

Never touched: a number glued to letters (YuE2, mp3), a time or a verse (3:16, 10:30), a date or a version (11.11.2026, 2.0.7), anything inside
an engine's tag or a pause mark, numbers of more than twelve digits, and every language other than ru, uk, el (their engines read figures).
The words carry their stresses (an acute after the vowel, ё in Russian), so the stress pass leaves them as written. expand() says how many
numbers it said and the first of them, for the run's report."""
import re

ACUTE = "́"
CASES = ("nom", "gen", "dat", "acc", "ins", "loc")
GAP = "[    ]"

# ---------------------------------------------------------------- Russian
RU_ONE = {"m": "оди́н одного́ одному́ оди́н одни́м одно́м", "f": "одна́ одно́й одно́й одну́ одно́й одно́й", "n": "одно́ одного́ одному́ одно́ одни́м одно́м"}
RU_TWO = {"m": "два двух двум два двумя́ двух", "f": "две двух двум две двумя́ двух"}
RU_CARD = {
    3: "три трёх трём три тремя́ трёх", 4: "четы́ре четырёх четырём четы́ре четырьмя́ четырёх",
    5: "пять пяти́ пяти́ пять пятью́ пяти́", 6: "шесть шести́ шести́ шесть шестью́ шести́", 7: "семь семи́ семи́ семь семью́ семи́",
    8: "во́семь восьми́ восьми́ во́семь восемью́ восьми́", 9: "де́вять девяти́ девяти́ де́вять девятью́ девяти́",
    10: "де́сять десяти́ десяти́ де́сять десятью́ десяти́",
    20: "два́дцать двадцати́ двадцати́ два́дцать двадцатью́ двадцати́", 30: "три́дцать тридцати́ тридцати́ три́дцать тридцатью́ тридцати́",
    40: "со́рок сорока́ сорока́ со́рок сорока́ сорока́", 50: "пятьдеся́т пяти́десяти пяти́десяти пятьдеся́т пятью́десятью пяти́десяти",
    60: "шестьдеся́т шести́десяти шести́десяти шестьдеся́т шестью́десятью шести́десяти",
    70: "се́мьдесят семи́десяти семи́десяти се́мьдесят семью́десятью семи́десяти",
    80: "во́семьдесят восьми́десяти восьми́десяти во́семьдесят восемью́десятью восьми́десяти",
    90: "девяно́сто девяно́ста девяно́ста девяно́сто девяно́ста девяно́ста", 100: "сто ста ста сто ста ста",
    200: "две́сти двухсо́т двумста́м две́сти двумяста́ми двухста́х", 300: "три́ста трёхсо́т трёмста́м три́ста тремяста́ми трёхста́х",
    400: "четы́реста четырёхсо́т четырёмста́м четы́реста четырьмяста́ми четырёхста́х",
    500: "пятьсо́т пятисо́т пятиста́м пятьсо́т пятьюста́ми пятиста́х", 600: "шестьсо́т шестисо́т шестиста́м шестьсо́т шестьюста́ми шестиста́х",
    700: "семьсо́т семисо́т семиста́м семьсо́т семьюста́ми семиста́х", 800: "восемьсо́т восьмисо́т восьмиста́м восемьсо́т восемьюста́ми восьмиста́х",
    900: "девятьсо́т девятисо́т девятиста́м девятьсо́т девятьюста́ми девятиста́х"}
for _n, _w in ((11, "оди́ннадцат"), (12, "двена́дцат"), (13, "трина́дцат"), (14, "четы́рнадцат"), (15, "пятна́дцат"), (16, "шестна́дцат"),
               (17, "семна́дцат"), (18, "восемна́дцат"), (19, "девятна́дцат")):
    RU_CARD[_n] = f"{_w}ь {_w}и {_w}и {_w}ь {_w}ью {_w}и"
RU_ZERO = "ноль нуля́ нулю́ ноль нулём нуле́"
RU_SCALE = {  # (gender of its count, singular by case, plural by case)
    1000: ("f", "ты́сяча ты́сячи ты́сяче ты́сячу ты́сячей ты́сяче", "ты́сячи ты́сяч ты́сячам ты́сячи ты́сячами ты́сячах"),
    10 ** 6: ("m", "миллио́н миллио́на миллио́ну миллио́н миллио́ном миллио́не", "миллио́ны миллио́нов миллио́нам миллио́ны миллио́нами миллио́нах"),
    10 ** 9: ("m", "миллиа́рд миллиа́рда миллиа́рду миллиа́рд миллиа́рдом миллиа́рде", "миллиа́рды миллиа́рдов миллиа́рдам миллиа́рды миллиа́рдами миллиа́рдах")}
RU_ORD = {1: "пе́рв", 2: "втор+", 3: "тре́т~", 4: "четвёрт", 5: "пя́т", 6: "шест+", 7: "седьм+", 8: "восьм+", 9: "девя́т", 10: "деся́т",
          11: "оди́ннадцат", 12: "двена́дцат", 13: "трина́дцат", 14: "четы́рнадцат", 15: "пятна́дцат", 16: "шестна́дцат", 17: "семна́дцат",
          18: "восемна́дцат", 19: "девятна́дцат", 20: "двадца́т", 30: "тридца́т", 40: "сороков+", 50: "пятидеся́т", 60: "шестидеся́т",
          70: "семидеся́т", 80: "восьмидеся́т", 90: "девяно́ст", 100: "со́т", 200: "двухсо́т", 300: "трёхсо́т", 400: "четырёхсо́т",
          500: "пятисо́т", 600: "шестисо́т", 700: "семисо́т", 800: "восьмисо́т", 900: "девятисо́т", 1000: "ты́сячн", 10 ** 6: "миллио́нн",
          10 ** 9: "миллиа́рдн"}
RU_ADJ = {  # endings by gender (m, f, n, p) and case; «+» a stressed ending, «~» тре́тий's soft one
    "": {"m": "ый ого ому ый ым ом", "f": "ая ой ой ую ой ой", "n": "ое ого ому ое ым ом", "p": "ые ых ым ые ыми ых"},
    "+": {"m": "о́й о́го о́му о́й ы́м о́м", "f": "а́я о́й о́й у́ю о́й о́й", "n": "о́е о́го о́му о́е ы́м о́м", "p": "ы́е ы́х ы́м ы́е ы́ми ы́х"},
    "~": {"m": "ий ьего ьему ий ьим ьем", "f": "ья ьей ьей ью ьей ьей", "n": "ье ьего ьему ье ьим ьем", "p": "ьи ьих ьим ьи ьими ьих"}}
RU_PCT = ("проце́нт", "проце́нта", "проце́нтов", "проце́нтам", "проце́нтами", "проце́нтах", "проце́нту", "проце́нтом", "проце́нте")
RU_FEM_SOFT = set("ночь жизнь часть вещь мысль дверь площадь область сеть речь смерть любовь кровь осень зима соль боль власть страсть помощь "
                  "мощь ложь рожь тетрадь печь степь цепь роль модель версия память новость скорость сторона".split())
RU_PREP = {
    "gen": set("без безо до из изо от ото у для около после кроме вокруг среди из-за из-под против мимо возле вместо близ свыше более менее больше "
               "меньше ниже выше порядка свыше насчёт насчет вне внутри вдоль сверх ради посреди позади впереди вроде".split()),
    "dat": set("к ко благодаря согласно навстречу вопреки подобно".split()),
    "ins": set("над надо перед передо между меж".split()),
    "loc": set("о об обо при".split()),
    "acc": set("про через сквозь спустя".split()),
    "acc|loc": set("в во на".split()), "acc|ins": set("за под подо".split()), "gen|ins": set("с со".split()), "dat|acc": set(["по"])}
RU_YEAR = re.compile(r"^(?:год|года|году|годом|годе|г|гг|годы|годов|годам|годами|годах)$")
RU_GOD = {"s": "год го́да го́ду год го́дом году́".split(), "p": "го́ды годо́в года́м го́ды года́ми года́х".split()}
RU_MONTHS = set("января февраля марта апреля мая июня июля августа сентября октября ноября декабря".split())

# ---------------------------------------------------------------- Ukrainian
UK_ONE = {"m": "оди́н одного́ одному́ оди́н одни́м одному́", "f": "одна́ одніє́ї одні́й одну́ одніє́ю одні́й", "n": "одне́ одного́ одному́ одне́ одни́м одному́"}
UK_TWO = {"m": "два двох двом два двома́ двох", "f": "дві двох двом дві двома́ двох"}
UK_CARD = {
    3: "три трьох трьом три трьома́ трьох", 4: "чоти́ри чотирьо́х чотирьо́м чоти́ри чотирма́ чотирьо́х",
    5: "п’ять п’яти́ п’яти́ п’ять п’ятьма́ п’яти́", 6: "шість шести́ шести́ шість шістьма́ шести́", 7: "сім семи́ семи́ сім сімома́ семи́",
    8: "ві́сім восьми́ восьми́ ві́сім вісьмома́ восьми́", 9: "де́в’ять дев’яти́ дев’яти́ де́в’ять дев’ятьма́ дев’яти́",
    10: "де́сять десяти́ десяти́ де́сять десятьма́ десяти́",
    20: "два́дцять двадцяти́ двадцяти́ два́дцять двадцятьма́ двадцяти́", 30: "три́дцять тридцяти́ тридцяти́ три́дцять тридцятьма́ тридцяти́",
    40: "со́рок сорока́ сорока́ со́рок сорока́ сорока́", 50: "п’ятдеся́т п’ятдесяти́ п’ятдесяти́ п’ятдеся́т п’ятдесятьма́ п’ятдесяти́",
    60: "шістдеся́т шістдесяти́ шістдесяти́ шістдеся́т шістдесятьма́ шістдесяти́",
    70: "сімдеся́т сімдесяти́ сімдесяти́ сімдеся́т сімдесятьма́ сімдесяти́",
    80: "вісімдеся́т вісімдесяти́ вісімдесяти́ вісімдеся́т вісімдесятьма́ вісімдесяти́",
    90: "дев’яно́сто дев’яно́ста дев’яно́ста дев’яно́сто дев’яно́ста дев’яно́ста", 100: "сто ста ста сто ста ста",
    200: "дві́сті двохсо́т двомста́м дві́сті двомаста́ми двохста́х", 300: "три́ста трьохсо́т трьомста́м три́ста трьомаста́ми трьохста́х",
    400: "чоти́риста чотирьохсо́т чотирьомста́м чоти́риста чотирмаста́ми чотирьохста́х",
    500: "п’ятсо́т п’ятисо́т п’ятиста́м п’ятсо́т п’ятьмаста́ми п’ятиста́х", 600: "шістсо́т шестисо́т шестиста́м шістсо́т шістьмаста́ми шестиста́х",
    700: "сімсо́т семисо́т семиста́м сімсо́т сімомаста́ми семиста́х", 800: "вісімсо́т восьмисо́т восьмиста́м вісімсо́т вісьмомаста́ми восьмиста́х",
    900: "дев’ятсо́т дев’ятисо́т дев’ятиста́м дев’ятсо́т дев’ятьмаста́ми дев’ятиста́х"}
for _n, _w, _o in ((11, "одина́дцят", "одинадцят"), (12, "двана́дцят", "дванадцят"), (13, "трина́дцят", "тринадцят"),
                   (14, "чотирна́дцят", "чотирнадцят"), (15, "п’ятна́дцят", "п’ятнадцят"), (16, "шістна́дцят", "шістнадцят"),
                   (17, "сімна́дцят", "сімнадцят"), (18, "вісімна́дцят", "вісімнадцят"), (19, "дев’ятна́дцят", "дев’ятнадцят")):
    UK_CARD[_n] = f"{_w}ь {_o}и́ {_o}и́ {_w}ь {_o}ьма́ {_o}и́"
UK_ZERO = "нуль нуля́ нулю́ нуль нулем нулі́"
UK_SCALE = {
    1000: ("f", "ти́сяча ти́сячі ти́сячі ти́сячу ти́сячею ти́сячі", "ти́сячі ти́сяч ти́сячам ти́сячі ти́сячами ти́сячах"),
    10 ** 6: ("m", "мільйо́н мільйо́на мільйо́ну мільйо́н мільйо́ном мільйо́ні", "мільйо́ни мільйо́нів мільйо́нам мільйо́ни мільйо́нами мільйо́нах"),
    10 ** 9: ("m", "мілья́рд мілья́рда мілья́рду мілья́рд мілья́рдом мілья́рді", "мілья́рди мілья́рдів мілья́рдам мілья́рди мілья́рдами мілья́рдах")}
UK_ORD = {1: "пе́рш", 2: "дру́г", 3: "тре́т~", 4: "четве́рт", 5: "п’я́т", 6: "шо́ст", 7: "сьо́м", 8: "во́сьм", 9: "дев’я́т", 10: "деся́т",
          11: "одина́дцят", 12: "двана́дцят", 13: "трина́дцят", 14: "чотирна́дцят", 15: "п’ятна́дцят", 16: "шістна́дцят", 17: "сімна́дцят",
          18: "вісімна́дцят", 19: "дев’ятна́дцят", 20: "двадця́т", 30: "тридця́т", 40: "сороко́в", 50: "п’ятдеся́т", 60: "шістдеся́т",
          70: "сімдеся́т", 80: "вісімдеся́т", 90: "дев’яно́ст", 100: "со́т", 200: "двохсо́т", 300: "трьохсо́т", 400: "чотирьохсо́т",
          500: "п’ятисо́т", 600: "шестисо́т", 700: "семисо́т", 800: "восьмисо́т", 900: "дев’ятисо́т", 1000: "ти́сячн", 10 ** 6: "мільйо́нн",
          10 ** 9: "мілья́рдн"}
UK_ADJ = {
    "": {"m": "ий ого ому ий им ому", "f": "а ої ій у ою ій", "n": "е ого ому е им ому", "p": "і их им і ими их"},
    "~": {"m": "ій ього ьому ій ім ьому", "f": "я ьої ій ю ьою ій", "n": "є ього ьому є ім ьому", "p": "і іх ім і іми іх"}}
UK_PCT = ("відсо́ток", "відсо́тки", "відсо́тків", "відсо́ткам", "відсо́тками", "відсо́тках", "відсо́тку", "відсо́тком", "відсо́тку")
UK_MASC_PL = set("роки дні тижні місяці рази дні вечори ранки віки бали метри кілометри долари рублі відсотки градуси бали голоси пункти "
                 "кроки уроки томи вірші розділи псалми апостоли учні брати сини чоловіки хлопці".split())
UK_PREP = {
    "gen": set("без до від од для біля коло після крім окрім близько навколо довкола серед з-за з-під проти замість протягом впродовж упродовж "
               "більше менше понад-усе вище нижче поза посеред позаду попереду щодо внаслідок".split()),
    "dat": set("завдяки всупереч назустріч наперекір".split()),
    "ins": set("над перед між поміж".split()),
    "loc": set("при".split()),
    "acc": set("про через крізь понад повз".split()),
    "acc|loc": set("в у на о об".split()), "acc|ins": set("за під".split()), "gen|ins": set("з із зі зо".split()), "dat|acc": set(["по"])}
UK_YEAR = re.compile(r"^(?:рік|року|році|роком|роки|років|рокам|роками|роках|р|рр)$")
UK_RIK = {"s": "рік ро́ку ро́ку рік ро́ком ро́ці".split(), "p": "ро́ки ро́ків ро́кам ро́ки ро́ками ро́ках".split()}
UK_MONTHS = set("січня лютого березня квітня травня червня липня серпня вересня жовтня листопада грудня".split())

# ---------------------------------------------------------------- Greek
EL_UNIT = {1: ("ένα", "ένας", "μία"), 2: ("δύο",) * 3, 3: ("τρία", "τρεις", "τρεις"), 4: ("τέσσερα", "τέσσερις", "τέσσερις"), 5: ("πέντε",) * 3,
           6: ("έξι",) * 3, 7: ("επτά",) * 3, 8: ("οκτώ",) * 3, 9: ("εννέα",) * 3, 10: ("δέκα",) * 3, 11: ("έντεκα",) * 3, 12: ("δώδεκα",) * 3,
           13: ("δεκατρία", "δεκατρείς", "δεκατρείς"), 14: ("δεκατέσσερα", "δεκατέσσερις", "δεκατέσσερις"), 15: ("δεκαπέντε",) * 3,
           16: ("δεκαέξι",) * 3, 17: ("δεκαεπτά",) * 3, 18: ("δεκαοκτώ",) * 3, 19: ("δεκαεννέα",) * 3}
EL_UNIT_GEN = {1: ("ενός", "ενός", "μίας"), 3: ("τριών",) * 3, 4: ("τεσσάρων",) * 3, 13: ("δεκατριών",) * 3, 14: ("δεκατεσσάρων",) * 3}
EL_TENS = {20: "είκοσι", 30: "τριάντα", 40: "σαράντα", 50: "πενήντα", 60: "εξήντα", 70: "εβδομήντα", 80: "ογδόντα", 90: "ενενήντα"}
EL_HUND = {2: "διακόσ", 3: "τριακόσ", 4: "τετρακόσ", 5: "πεντακόσ", 6: "εξακόσ", 7: "επτακόσ", 8: "οκτακόσ", 9: "εννιακόσ"}
EL_MASC_ES = set("μήνες άντρες άνδρες πατέρες αέρηδες ήρωες γείτονες αιώνες χειμώνες άρχοντες κανόνες αγώνες δαίμονες λέοντες γέροντες "
                 "ρήτορες σωτήρες αστέρες".split())
EL_PREP = set("σε στο στη στην στον στα στις στους από για με χωρίς μετά κατά παρά προς ως έως μέχρι περίπου".split())


def _forms(s):
    return s.split()


def _gender_ru(noun, case, last):
    """The gender a numeral ending in 1 or 2 takes from the noun after it (nominative or genitive singular, or an oblique singular after 1)."""
    w = noun.lower()
    if not w:
        return "m"
    if w in RU_FEM_SOFT:
        return "f"
    if last == 2 and case in ("nom", "acc"):
        return "f" if w[-1] in "ыи" else "m"
    if case in ("nom", "acc"):
        if w[-1] in "ая" or (case == "acc" and w[-1] in "ую" and len(w) > 2):
            return "f"
        if w[-1] in "оеё":
            return "n"
        return "m"
    if case == "gen":
        return "f" if w[-1] in "ыи" else "m"
    if case == "dat":
        return "f" if w[-1] in "еи" else "m"
    if case == "ins":
        return "f" if w.endswith(("ой", "ей", "ою", "ею", "ью")) else "m"
    return "f" if w[-1] == "и" else "m"


def _gender_uk(noun, case, last, known=None):
    w = noun.lower().replace("’", "'")
    if not w:
        return "m"
    if last == 2 and case in ("nom", "acc"):
        if w in UK_MASC_PL:
            return "m"
        if w[-1] in "ая":
            return "m"                                   # два вікна, два відра: neuter takes два
        if w[-1] in "иі" and known is not None:
            stem = w[:-1]
            return "f" if known(stem + "а") or known(stem + "я") or known(stem + "ь") and w[-1] == "і" and not known(stem + "ів") else "m"
        return "f" if w[-1] == "и" else "m"             # without the index: дві години, хвилини; два дні, тижні
    if case in ("nom", "acc"):
        if w[-1] in "ая" or (case == "acc" and w[-1] in "ую" and len(w) > 2):
            return "f"
        if w[-1] in "еєо":
            return "n"
        return "m"
    if case == "gen":
        return "f" if w[-1] in "иії" else "m"
    if case in ("dat", "loc"):
        return "f" if w[-1] in "іи" and not w.endswith(("ові", "еві", "єві")) else "m"
    if case == "ins":
        return "f" if w.endswith(("ою", "ею", "єю", "ю")) else "m"
    return "m"


def _end_case(noun, lang):
    """The case the noun's own ending says beyond doubt, or None."""
    w = noun.lower()
    if len(w) < 3 or w in NOT_NOUN:
        return None
    if w.endswith(("ами", "ями")):
        return "ins"
    if w.endswith(("ах", "ях")):
        return "loc"
    if w.endswith(("ам", "ям")):
        return "dat"
    return None


def _prep_case(prep, noun, lang, last1):
    table = RU_PREP if lang == "ru" else UK_PREP
    p = prep.lower()
    for case, words in table.items():
        if p in words:
            break
    else:
        return None
    if "|" not in case:
        return case
    w = noun.lower()
    a, b = case.split("|")
    if case == "acc|loc":                                # the ending decided -ах/-ях already; a singular after 1: -е/-і the locative
        return "loc" if last1 and w[-1:] in ("е", "і", "и") and len(w) > 2 else "acc"
    if case == "acc|ins":
        return "ins" if w.endswith(("ом", "ем", "ём", "ой", "ей", "ою", "ею", "єю")) else "acc"
    if case == "gen|ins":
        return "ins" if w.endswith(("ом", "ем", "ём", "ой", "ей", "ою", "ею", "єю")) else "gen"
    if case == "dat|acc":
        return "dat" if last1 and w[-1:] in ("у", "ю", "е", "і") else "acc"
    return a


def _triad(n, case, gender, lang):
    """1..999 as words in a case and gender."""
    card, one, two = (RU_CARD, RU_ONE, RU_TWO) if lang == "ru" else (UK_CARD, UK_ONE, UK_TWO)
    k = CASES.index(case)
    out = []
    h, rest = n // 100 * 100, n % 100
    if h:
        out.append(_forms(card[h])[k])
    if rest:
        if rest in card and rest >= 3:
            out.append(_forms(card[rest])[k])
        else:
            t, u = rest // 10 * 10, rest % 10
            if t >= 20:
                out.append(_forms(card[t])[k])
            if u == 1:
                out.append(_forms(one[gender])[k])
            elif u == 2:
                out.append(_forms(two["f" if gender == "f" else "m"])[k])
            elif u:
                out.append(_forms(card[u])[k])
    return out


def cardinal(n, case="nom", gender="m", lang="ru"):
    """A whole number as words, every part in the case; the count of a thousand feminine, of a million masculine."""
    zero, scales = (RU_ZERO, RU_SCALE) if lang == "ru" else (UK_ZERO, UK_SCALE)
    k = CASES.index(case)
    if n == 0:
        return _forms(zero)[k]
    out = []
    for size in (10 ** 9, 10 ** 6, 1000):
        c, n = n // size, n % size
        if not c:
            continue
        g, sg, pl = scales[size]
        if not (size == 1000 and c == 1):                # «ты́сяча», not «одна ты́сяча»
            out += _triad(c, case, g, lang)
        last2, last = c % 100, c % 10
        if last == 1 and last2 != 11:
            out.append(_forms(sg)[k])
        elif case in ("nom", "acc"):
            out.append(_forms(sg)[1] if 2 <= last <= 4 and not 12 <= last2 <= 14 and lang == "ru" else
                       _forms(pl)[0] if 2 <= last <= 4 and not 12 <= last2 <= 14 else _forms(pl)[1])
        else:
            out.append(_forms(pl)[k])
    if n:
        out += _triad(n, case, gender, lang)
    return " ".join(out)


def _ord_word(stem, case, gender, lang):
    adj = RU_ADJ if lang == "ru" else UK_ADJ
    kind = stem[-1] if stem[-1] in "+~" else ""
    base = stem.rstrip("+~")
    end = _forms(adj[kind][gender])[CASES.index(case)]
    if kind == "+":
        base = base.replace(ACUTE, "")
    return base + end


def _compound_gen(c, lang):
    """The count before «-ты́сячный»/«-ти́сячний» as one word: двух-, трёх-, пяти-, двадцатипяти-, сто-."""
    if c == 100:
        return "сто"
    if lang == "uk" and c in (2, 3, 4):
        return {2: "двох", 3: "трьох", 4: "чотирьох"}[c]
    return cardinal(c, "gen", "m", lang).replace(ACUTE, "").replace(" ", "")


def ordinal(n, case="nom", gender="m", lang="ru"):
    """A whole number as an ordinal: its last part an adjective in the case and gender, the parts before it cardinals in the nominative; a round
    thousand («двухты́сячный») or million one word. None for what it cannot say (zero, a round thousand of thousands)."""
    ords = RU_ORD if lang == "ru" else UK_ORD
    if n <= 0:
        return None
    for size in (10 ** 9, 10 ** 6, 1000):
        if n >= size and n % size == 0:
            c = n // size
            if c >= 1000:
                return None
            if c == 1:
                return _ord_word(ords[size], case, gender, lang)
            return _compound_gen(c, lang) + _ord_word(ords[size], case, gender, lang)
    r = n % 100
    if r == 0:
        last = n % 1000
    elif r < 20 or r % 10 == 0:
        last = r
    else:
        last = r % 10
    head = n - last
    word = _ord_word(ords[last], case, gender, lang)
    return word if not head else cardinal(head, "nom", "m", lang) + " " + word


def _ord_suffix(suf, noun, prep, lang):
    """The case and gender an ordinal's written ending says («5-й», «2-го», «3-я»), the noun and preposition deciding where it is ambiguous."""
    s, w = suf.lower(), noun.lower()
    if lang == "ru":
        if s in ("го", "ого", "его"):
            return "gen", "m"
        if s in ("му", "ому", "ему"):
            return "dat", "m"
        if s in ("я", "ая", "ья"):
            return "nom", "f"
        if s in ("ю", "ую", "ью"):
            return "acc", "f"
        if s in ("е", "ое", "ье"):
            return "nom", "n"
        if s in ("х", "ых", "их"):
            return "loc" if prep.lower() in ("в", "во", "на", "о", "об", "при") else "gen", "p"
        if s in ("ми", "ыми"):
            return "ins", "p"
        if s in ("м", "ым", "ом"):
            if w.endswith(("ом", "ем", "ём")):
                return "ins", "m"
            return ("loc", "m") if prep.lower() in ("в", "во", "на", "о", "об", "при") or w[-1:] == "е" else ("ins", "m")
        if s in ("й", "ый", "ой", "ий"):
            if w.endswith(("ы", "и", "е", "ой", "ей", "ою", "ею")) and not w.endswith(("ие",)):
                case = _end_case(w, lang) or {"ы": "gen", "и": "gen", "е": "loc"}.get(w[-1:], "ins")
                return case, "f"
            return "nom", "m"
        return None
    if s in ("го", "ого", "ього"):
        return "gen", "m"
    if s in ("му", "ому", "ьому"):
        return ("loc" if prep.lower() in ("в", "у", "на", "о", "при", "по") else "dat"), "m"
    if s in ("а", "я"):
        return "nom", "f"
    if s in ("у", "ю"):
        return "acc", "f"
    if s in ("е", "є"):
        return "nom", "n"
    if s in ("ї", "ої", "ьої"):
        return "gen", "f"
    if s in ("ій",):
        return ("loc" if prep.lower() in ("в", "у", "на", "о", "при", "по") else "dat"), "f"
    if s in ("ю", "ою", "ьою"):
        return "ins", "f"
    if s in ("м", "им", "ім"):
        return "ins", "m"
    if s in ("х", "их", "іх"):
        return "gen", "p"
    if s in ("й", "ий"):
        return "nom", "m"
    return None


# ---------------------------------------------------------------- Greek
def _el_gender(noun):
    w = noun.lower()
    if not w:
        return "n"
    if w in EL_MASC_ES:
        return "m"
    if w.endswith(("οι", "ους", "ος", "ός", "ας", "άς", "ης", "ής", "έας")):
        return "m"
    if w.endswith(("ες", "ές", "εις", "α", "ά", "η", "ή")) and not w.endswith(("ματα", "ια", "ιά", "η", "ή")):
        return "f"
    if w.endswith(("η", "ή")):
        return "f" if not w.endswith(("έτη", "μέρη", "λάθη", "βάρη", "μέλη", "πάθη", "ψέματα")) else "n"
    return "n"


def _el_triad(n, gender, gen):
    g = {"n": 0, "m": 1, "f": 2}[gender]
    out = []
    h, rest = n // 100, n % 100
    if h == 1:
        out.append("εκατό" if not rest else "εκατόν")
    elif h:
        stem = EL_HUND[h]
        if gen:
            out.append(stem.replace("ό", "ο") + "ίων")
        else:
            out.append(stem + ("ια", "ιοι", "ιες")[g])
    if rest:
        if rest in EL_UNIT:
            out.append((EL_UNIT_GEN.get(rest) or EL_UNIT[rest])[g] if gen else EL_UNIT[rest][g])
        else:
            t, u = rest // 10 * 10, rest % 10
            out.append(EL_TENS[t])
            if u:
                out.append((EL_UNIT_GEN.get(u) or EL_UNIT[u])[g] if gen else EL_UNIT[u][g])
    return out


def el_cardinal(n, gender="n", gen=False, acc=False):
    if n == 0:
        return "μηδέν"
    out = []
    for size, sg, pl, g2 in ((10 ** 9, "δισεκατομμύριο", "δισεκατομμύρια", "n"), (10 ** 6, "εκατομμύριο", "εκατομμύρια", "n")):
        c, n = n // size, n % size
        if c:
            out += _el_triad(c, g2, gen) + ([sg if not gen else sg[:-1] + "ίου"] if c == 1 else [pl if not gen else pl[:-1].replace("ύρι", "υρί") + "ων"])
    c, n = n // 1000, n % 1000
    if c == 1:
        out.append(("χίλια", "χίλιοι", "χίλιες")[{"n": 0, "m": 1, "f": 2}[gender]] if not gen else "χιλίων")
    elif c:
        out += _el_triad(c, "f", gen) + ["χιλιάδων" if gen else "χιλιάδες"]
    if n:
        out += _el_triad(n, gender, gen)
    s = " ".join(out)
    if acc and gender == "m":
        s = re.sub(r"\bένας$", "έναν", s)
    return s


# ---------------------------------------------------------------- the pass
NUM = {"ru": re.compile(r"(?<![\w\x00.,:/\-–—+])(\d{1,3}(?:" + GAP + r"\d{3})+|\d{1,12})(?:,(\d{1,3}))?(?:-([а-яё]{1,3}))?(" + GAP + r"?%)?(?:[  ]?(гг?\.))?(?![\w\x00]|[.:,/\-–—]\d)"),
       "uk": re.compile(r"(?<![\w\x00.,:/\-–—+’'])(\d{1,3}(?:" + GAP + r"\d{3})+|\d{1,12})(?:,(\d{1,3}))?(?:-([а-яєіїґ’']{1,4}))?(" + GAP + r"?%)?(?:[  ]?(рр?\.))?(?![\w\x00’']|[.:,/\-–—]\d)"),
       "el": re.compile(r"(?<![\w\x00.,:/\-–—+])(\d{1,3}(?:\.\d{3})+|\d{1,12})(?:,(\d{1,3}))?(" + GAP + r"?%)?(?![\w\x00]|[.:,/\-–—]\d)")}
PREP_BEFORE = re.compile(r"(?:^|[^\w’'\-])([^\W\d_][\w’'\-]*)[ \u00a0]+$")
NOUNS_AFTER = re.compile(r"(?:[ \u00a0]+[^\W\d_][\w’'\-]*){1,3}")
NOT_NOUN = set("там сам нам вам им ам сами нами вами ими сах страх запах размах монах прах крах шах взмах казах аллах".split())
LANGS = ("ru", "uk", "el")


def _decimal(intpart, frac, lang):
    """«3,5» in the nominative: три це́лых пять деся́тых."""
    places = len(frac)
    f = int(frac)
    if lang == "ru":
        whole = cardinal(intpart, "nom", "f", "ru") + " " + ("це́лая" if intpart % 10 == 1 and intpart % 100 != 11 else "це́лых")
        names = {1: "деся́т", 2: "со́т", 3: "ты́сячн"}[places]
        part = cardinal(f, "nom", "f", "ru") + " " + names + ("ая" if f % 10 == 1 and f % 100 != 11 else "ых")
    else:
        whole = cardinal(intpart, "nom", "f", "uk") + " " + ("ці́ла" if intpart % 10 == 1 and intpart % 100 != 11 else "ці́лих")
        names = {1: "деся́т", 2: "со́т", 3: "ти́сячн"}[places]
        part = cardinal(f, "nom", "f", "uk") + " " + names + ("а" if f % 10 == 1 and f % 100 != 11 else "их")
    return whole + " " + part


def _pct(n, case, lang):
    t = RU_PCT if lang == "ru" else UK_PCT
    last, last2 = n % 10, n % 100
    if last == 1 and last2 != 11:
        return {"nom": t[0], "acc": t[0], "gen": t[1] if lang == "ru" else t[6], "dat": t[6], "ins": t[7], "loc": t[8]}[case]
    if case in ("nom", "acc"):
        return t[1] if 2 <= last <= 4 and not 12 <= last2 <= 14 else t[2]
    return {"gen": t[2], "dat": t[3], "ins": t[4], "loc": t[5]}[case]


def expand(text, lang, skip=None, known=None):
    """(the text with its numbers said in words; the report {"numbers": n, "said": [[figures, words], …]}). skip: a pattern (an engine's tags)
    whose matches are never touched. known: a function telling whether a word form exists (Ukrainian gender of a plural after 2–4)."""
    lang = str(lang or "").lower()
    rep = {"numbers": 0, "said": []}
    if lang not in LANGS or not re.search(r"\d", text or ""):
        return text, rep

    def one(m, chunk):
        mb = PREP_BEFORE.search(chunk[max(0, m.start() - 40):m.start()])
        nouns = NOUNS_AFTER.match(chunk[m.end():m.end() + 80])
        prep = mb.group(1) if mb else ""
        nouns = nouns.group(0).split() if nouns else []
        try:
            words = say(m, lang, prep, nouns, known)
        except (KeyError, ValueError, IndexError):     # a number it has no words for is left as written
            return m.group(0)
        if not words:
            return m.group(0)
        rep["numbers"] += 1
        if len(rep["said"]) < 20:
            rep["said"].append([m.group(0), words])
        return words

    def sub(chunk):
        return NUM[lang].sub(lambda m: one(m, chunk), chunk)

    parts, at = [], 0
    for m in (skip.finditer(text) if skip is not None else ()):
        parts.append(sub(text[at:m.start()]))
        parts.append(m.group(0))
        at = m.end()
    parts.append(sub(text[at:]))
    return "".join(parts), rep


def _is_year(n, w):
    """Whether «N год/года/году…» (or the Ukrainian «рік/року/році…») names a year and not a span of years: «в 33 году», «до 2026 года», «у 1999
    році» are years; «2 года», «1 год», «27 років», «до 1 року» are spans."""
    if n >= 1000:
        return True
    if w in ("году", "годом", "годе", "році", "роком", "г", "р"):
        return True
    last, teen = n % 10, 11 <= n % 100 <= 14
    if w in ("года", "року"):
        return not (1 <= last <= 4) or teen
    if w in ("год", "рік"):
        return last != 1 or teen
    return False


def say(m, lang, prep, nouns, known=None):
    """One number's words, or None to leave it as written. nouns: up to three words after it (an adjective may stand before the noun)."""
    raw = m.group(1)
    noun = nouns[0] if nouns else ""
    if lang == "el":
        n = int(raw.replace(".", ""))
        frac, pct = m.group(2), m.group(3)
        if n >= 10 ** 12:
            return None
        if frac:
            return el_cardinal(n, "n") + " κόμμα " + el_cardinal(int(frac), "n") + (" τοις εκατό" if pct else "")
        if pct:
            return el_cardinal(n, "n") + " τοις εκατό"
        w = noun.lower()
        gen = w.endswith(("ων", "ών")) and len(w) > 3
        return el_cardinal(n, _el_gender(noun) if noun else "n", gen=gen, acc=prep.lower() in EL_PREP)
    n = int(re.sub(GAP, "", raw))
    frac, suf, pct = m.group(2), m.group(3), m.group(4)
    if n >= 10 ** 12:
        return None
    if frac:
        return _decimal(n, frac, lang) + ((" " + ("проце́нта" if lang == "ru" else "відсо́тка")) if pct else "")
    last1 = n % 10 == 1 and n % 100 != 11
    year_re, months = (RU_YEAR, RU_MONTHS) if lang == "ru" else (UK_YEAR, UK_MONTHS)
    if suf:
        cg = _ord_suffix(suf, noun, prep, lang)
        if cg is None:
            return None
        return ordinal(n, cg[0], cg[1], lang)
    w = noun.lower().rstrip(".")
    if w in ("г", "гг", "р", "рр") and not m.group(5):
        w = ""                                           # a lone letter, not the abbreviation of a year
    if m.group(5):
        w = m.group(5).rstrip(".").lower()
    if (year_re.match(w) and _is_year(n, w)) or w in months:
        if w in months:                                  # «5 мая»: the fifth (day) of May, neuter, genitive unless a preposition says else
            case = {"к": "dat", "ко": "dat", "до": "gen", "с": "gen", "со": "gen", "на": "acc", "по": "acc", "з": "gen", "від": "gen"}.get(prep.lower(), "gen")
            if lang == "uk":
                return ordinal(n, case if case != "acc" else "acc", "n", lang)
            return ordinal(n, case, "n", lang)
        case = _end_case(w, lang) if w.endswith(("ах", "ях", "ами", "ями", "ам", "ям")) else None
        if case is None:
            if lang == "ru":
                case = {"году": "loc", "года": "gen", "годом": "ins", "годе": "loc", "год": "nom", "годы": "nom", "годов": "gen"}.get(w)
                if w in ("г", "гг") or case is None:
                    case = {"в": "loc", "во": "loc", "к": "dat", "ко": "dat", "с": "gen", "со": "gen", "до": "gen", "от": "gen", "после": "gen",
                            "около": "gen", "за": "acc", "на": "acc", "через": "acc", "по": "acc"}.get(prep.lower(), "nom")
                if w == "году" and prep.lower() in ("к", "ко", "по"):
                    case = "dat"
            else:
                case = {"році": "loc", "року": "gen", "роком": "ins", "рік": "nom", "роки": "nom", "років": "gen"}.get(w)
                if w in ("р", "рр") or case is None:
                    case = {"в": "loc", "у": "loc", "до": "gen", "з": "gen", "із": "gen", "від": "gen", "після": "gen", "за": "acc", "на": "acc",
                            "через": "acc"}.get(prep.lower(), "nom")
        plural = w in ("годы", "годов", "годам", "годами", "годах", "гг", "роки", "років", "рокам", "роками", "роках", "рр")
        if case == "nom" and prep.lower() in (("в", "во", "на", "за", "через", "про") if lang == "ru" else ("в", "у", "на", "за", "через", "про")) and w in ("год", "рік"):
            case = "acc"
        words = ordinal(n, case, "p" if plural else "m", lang)
        if m.group(5) and words:                         # «г.», «гг.», «р.» said as the noun in the year's case
            nounf = (RU_GOD if lang == "ru" else UK_RIK)["p" if plural else "s"][CASES.index(case)]
            words += " " + nounf
        return words
    if (not noun or noun.lower() in ("по", "и", "или", "і", "та", "або", "до")) and 1000 <= n <= 2099 and prep.lower() in (("в", "во", "с", "со", "до", "к", "от", "после") if lang == "ru" else ("в", "у", "з", "до", "від", "після")):
        case = ({"в": "loc", "во": "loc", "к": "dat"} if lang == "ru" else {"в": "loc", "у": "loc"}).get(prep.lower(), "gen")
        return ordinal(n, case, "m", lang)
    case = None
    if pct:
        case = _prep_case(prep, "", lang, last1) if prep else "nom"
        case = case or "nom"
        return cardinal(n, case, "m", lang) + " " + _pct(n, case, lang)
    if nouns and not last1:
        case = next((c for c in (_end_case(x, lang) for x in nouns) if c), None)
    if case is None and prep:
        case = _prep_case(prep, noun, lang, last1)
    if case is None and last1 and noun:
        wl = noun.lower()
        if wl.endswith(("ом", "ем", "ём", "ою", "ею", "єю")):
            case = "ins"
    case = case or "nom"
    last = n % 10 if n % 100 not in (11, 12, 13, 14) else 0
    if last in (1, 2):
        g = _gender_ru(noun, case, last) if lang == "ru" else _gender_uk(noun, case, last, known)
    else:
        g = "m"
    return cardinal(n, case, g, lang)
