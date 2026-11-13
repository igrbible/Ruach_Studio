"""HERESY 2255 (Viktor 08.11.2026: «По ударениям как минимум для русского предлагаю взять парадигму Зализняка… Также пользовательский словарь,
редактируемый прямо в комнате, и делающий точечный оверрайд записей Зализняка. По остальным языкам… только пользовательские словари»; his ear on the
blind round: «стукАють», «наспівувАв», «бармАшина»): the Reader's stresses, put into the text before an engine reads it.

    1. a word the author marked himself (an acute, U+0301, or a Russian or Belarusian ё) is left as he wrote it, always;
    2. the user's dictionary of that language (word -> its stressed or respelled form, edited in the room) comes next;
    3. Russian: A. A. Zaliznyak's full accented paradigm (StarDict, 86,839 headwords, every form of each): a form with one stress gets it; a form
       the paradigm stresses two ways (замок, мука, дома) is a homograph, left to the context and named to the user, never guessed;
    4. a word of one vowel needs no mark; a word found nowhere is left as it is and counted.
The mark goes to the engine in the way it takes it (engine.json "stress": "acute", the default, an acute after the vowel; "plus", a + before it;
"none", every mark taken out). Both tokenizers measured 08.11 keep U+0301 as its own token (their NFC normalizer leaves it), so the model sees it;
whether it heeds it is for the ear (heresy/MISC/claude-arc/reader/smoke/). The paradigm does not come with the Studio (nothing lets us pass it
on): a user who has it puts its StarDict into models/narrator/dicts/ru/zaliznyak/ (docs/NARRATOR-DICTIONARIES.md), and its forms are indexed
once into forms.sqlite beside it, out of the lab's memory. While that index is being built the pass says so: a
text read then is read without the paradigm, and the run's report names why (a silent «nothing found» would lie)."""
import json
import re
import sqlite3
import struct
import threading
import time
import zlib
from pathlib import Path

import paths                       # HERESY 2330: where the weights live

ACUTE, GRAVE = "́", "̀"
VOWELS = {"ru": "аеёиоуыэюя", "uk": "аеєиіїоуюя", "be": "аеёіоуыэюя"}
ANY_VOWELS = "аеёиоуыэюяєіїaeiouyáéíóúαεηιουωάέήίόύώ"
WORD = re.compile(r"(?:[^\W\d_]|[̀́])+(?:[-'’ʼ](?:[^\W\d_]|[̀́])+)*")
LANG_RE = re.compile(r"^[a-z]{2,3}$")
WORD_MAX, FORM_MAX, USER_MAX = 60, 80, 20000
H = {"kit": None}
ZLOCK = threading.Lock()
Z = {"state": "absent", "error": "", "con": None}


def key(w):
    """A word's key: lower case, no stress marks, ё read as е (a text without ё still finds the paradigm's ё)."""
    return w.lower().replace(ACUTE, "").replace(GRAVE, "").replace("ё", "е")


def vowels(w, lang="ru"):
    vs = VOWELS.get(lang, ANY_VOWELS)
    return sum(1 for c in w.lower() if c in vs)


def detect(text):
    """The language a text is written in, by its letters: і ї є ґ Ukrainian, ў Belarusian, other Cyrillic Russian, Greek, Hebrew, else en."""
    t = str(text or "")
    if re.search(r"[іїєґІЇЄҐ]", t) and not re.search(r"[ыэъЫЭЪ]", t):
        return "uk"
    if re.search(r"[ўЎ]", t):
        return "be"
    if re.search(r"[А-Яа-яЁё]", t):
        return "ru"
    if re.search(r"[Ͱ-Ͽἀ-῿]", t):
        return "el"
    if re.search(r"[֐-׿]", t):
        return "he"
    return "en"


def normal_form(form):
    """A form as the user writes it: an acute after the vowel, or a + before it (as Russian TTS tools write it), both kept as the acute."""
    f = " ".join(str(form or "").split())
    f = re.sub("\\+([" + ANY_VOWELS + ANY_VOWELS.upper() + "])", lambda m: m.group(1) + ACUTE, f)   # only a vowel takes it
    return f.replace("´", ACUTE).replace("'" + ACUTE, ACUTE)


def with_case(orig, form):
    """The form in the word's own case: letter by letter when they are the same letters, else all capitals or a capital first as the word."""
    base = [c for c in orig if c not in (ACUTE, GRAVE)]
    fb = [c for c in form if c not in (ACUTE, GRAVE)]
    if len(base) == len(fb) and all(a.lower().replace("ё", "е") == b.lower().replace("ё", "е") for a, b in zip(base, fb)):
        out, k = [], 0
        for c in form:
            if c in (ACUTE, GRAVE):
                out.append(c)
                continue
            out.append(c.upper() if base[k].isupper() else c.lower())
            k += 1
        return "".join(out)
    if len(base) > 1 and "".join(base).isupper():
        return form.upper()
    if base and base[0].isupper():
        return form[:1].upper() + form[1:]
    return form


def transport(text, how):
    """The marks as the engine takes them: acute (as written), plus (a + before the vowel), none (taken out); HERESY 2398 (Viktor 11.11.2026,
    his Suno recipe: «U+0301, заглавная буква на ударной гласной»): caps, the stressed vowel a capital and the acute taken out, caps+acute
    both. The secondary grave never goes."""
    t = text.replace(GRAVE, "")
    if how in ("caps", "caps+acute"):
        t = re.sub(r"([^\W\d_])" + ACUTE, lambda m: m.group(1).upper() + (ACUTE if how == "caps+acute" else ""), t)
        return t
    if how == "plus":
        return re.sub(r"([^\W\d_])" + ACUTE, lambda m: "+" + m.group(1), t)
    if how == "none":
        return t.replace(ACUTE, "")
    return t


# ---------------------------------------------------------------- HERESY 2460: polytonic Greek read as monotonic
# (Viktor 12.11.2026: «С греческим легче»: Greek carries its stress in its own spelling.) Read aloud today, a polytonic word sounds as its
# monotonic one: the breathings and the iota subscript are silent, and the acute, the grave and the circumflex all say one thing, the stress.
# The engines learnt from today's Greek, written monotonic; the polytonic letters (U+1F00 block) are rare in what they read. So each Greek
# word goes to the engine monotonic: the breathings, the iota subscript, the koronis, macron and breve out, every accent the tonos, the
# diaeresis kept; the lunate sigma (ϲ, the uncial texts' and Viktor's NA text's) the σ, at a word's end the ς. Only Greek words are touched
# (Russian й keeps its breve, a Russian acute and grave stay); the text in the editor is not changed, only what the engine reads.
EL_WORD = re.compile("[\u0370-\u03ff\u1f00-\u1fff][\u0300-\u036f\u0370-\u03ff\u1f00-\u1fff]*")
EL_DROP = set("\u0313\u0314\u0343\u0345\u0304\u0306")     # psili, dasia, koronis, ypogegrammeni, macron, breve
EL_TONOS = set("\u0300\u0301\u0340\u0341\u0342")           # varia, oxia (tonos), their old forms, perispomeni


EL_VOW = set("αεηιουωΑΕΗΙΟΥΩ")
EL_DIPH = {"αι", "ει", "οι", "υι", "αυ", "ευ", "ου", "ηυ"}


def _el_syllables(w):
    """A Greek word's syllables by its vowels, a diphthong one (καί one, θεός two); a diaeresis parts the pair (προϊόν three)."""
    import unicodedata
    letters = []
    for c in unicodedata.normalize("NFD", w):
        if unicodedata.category(c) == "Mn":
            if letters:
                letters[-1][1].add(c)
        else:
            letters.append([c, set()])
    n, i = 0, 0
    while i < len(letters):
        if letters[i][0] in EL_VOW:
            n += 1
            if i + 1 < len(letters) and (letters[i][0] + letters[i + 1][0]).lower() in EL_DIPH and "\u0308" not in letters[i + 1][1]:
                i += 1
        i += 1
    return n


def el_monotonic(text):
    """(the text with each Greek word monotonic; how many words changed)."""
    import unicodedata
    n = [0]

    def one(m):
        w = m.group(0)
        out = []
        for c in unicodedata.normalize("NFD", w):
            if c in EL_DROP:
                continue
            if c in EL_TONOS:
                if out and out[-1] == ACUTE:
                    continue
                c = ACUTE
            out.append(c)
        r = "".join(out)
        poly = any(c in EL_DROP or c in "\u0300\u0342" for c in unicodedata.normalize("NFD", w)) or any("\u1f00" <= c <= "\u1fff" for c in w)
        if poly and ACUTE in r and _el_syllables(r) == 1 and r.lower().replace(ACUTE, "") not in ("η", "που", "πως"):
            r = r.replace(ACUTE, "")                     # a monosyllable has no accent in monotonic (ἦν ην, καὶ και), but ή «or», πού, πώς
        r = re.sub("\u03f2(?=[\u0370-\u03ff\u0300-\u036f])", "σ", r).replace("\u03f2", "ς").replace("\u03f9", "Σ")
        r = unicodedata.normalize("NFC", r)
        if r != unicodedata.normalize("NFC", w):
            n[0] += 1
        return r

    return EL_WORD.sub(one, str(text or "")), n[0]


# ---------------------------------------------------------------- the user's dictionaries: KIT/user/reader/dicts/LANG.json
def setup(kit):
    H["kit"] = Path(kit)
    threading.Thread(target=lambda: (zaliznyak_ready(), uk_ready()), daemon=True, name="reader-zaliznyak").start()   # HERESY 2343: and Ukrainian


def _dicts():
    d = H["kit"] / "user" / "reader" / "dicts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _lang(lang):
    lang = str(lang or "").lower()
    if not LANG_RE.match(lang):
        raise ValueError("a language code: ru, uk, en…")
    return lang


ULOCK = threading.Lock()


def user_dict(lang):
    try:
        d = json.load(open(_dicts() / (_lang(lang) + ".json"), encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    w = d.get("words") if isinstance(d, dict) else None
    return {k: v for k, v in (w or {}).items() if isinstance(v, dict) and v.get("form")}


def dict_get(lang):
    lang = _lang(lang)
    rows = sorted(({"word": v.get("word") or k, "form": v["form"], "at": v.get("at", "")} for k, v in user_dict(lang).items()), key=lambda r: key(r["word"]))
    if lang != "uk":
        own_ready(lang)
    return {"lang": lang, "words": rows, "zaliznyak": zaliznyak_state() if lang == "ru" else "none",
            "lang_uk": uk_state() if lang == "uk" else "none",          # HERESY 2343
            "own": own_state(lang) if lang != "uk" else "none"}         # HERESY 2374: a language's own index


def dict_set(body):
    """One word into the user's dictionary of its language (its form: an acute or a + on the stressed vowel, or a respelling); no form: taken out."""
    lang = _lang(body.get("lang"))
    word = " ".join(str(body.get("word") or "").split())
    if not word or len(word) > WORD_MAX or not WORD.fullmatch(word):
        raise ValueError(f"one word, letters only, up to {WORD_MAX}")
    form = normal_form(body.get("form"))
    if len(form) > FORM_MAX:
        raise ValueError(f"the form: up to {FORM_MAX} characters")
    with ULOCK:
        p = _dicts() / (lang + ".json")
        words = user_dict(lang)
        k = key(word)
        if form:
            if len(words) >= USER_MAX and k not in words:
                raise ValueError(f"{USER_MAX} words at most in one dictionary")
            words[k] = {"word": word.replace(ACUTE, ""), "form": form, "at": time.strftime("%Y-%m-%d %H:%M")}
        else:
            words.pop(k, None)
        part = p.with_suffix(".json.part")
        json.dump({"lang": lang, "words": words}, open(part, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        part.replace(p)
    return dict_get(lang)


# ---------------------------------------------------------------- Zaliznyak: StarDict into forms.sqlite, once
def zaliznyak_dir():
    return paths.at(paths.NARRATOR, H["kit"]) / "dicts" / "ru" / "zaliznyak"


def zaliznyak_state():
    return Z["state"] if Z["state"] != "failed" else "failed: " + Z["error"]


def _stardict(base):
    """(headword, article) of a StarDict (.idx and .dict.dz or .dict): offsets and sizes big-endian, 32 bits."""
    idx = Path(str(base) + ".idx").read_bytes()
    dz = Path(str(base) + ".dict.dz")
    data = zlib.decompress(dz.read_bytes(), 31) if dz.is_file() else Path(str(base) + ".dict").read_bytes()
    i = 0
    while i < len(idx):
        j = idx.index(b"\0", i)
        off, size = struct.unpack(">II", idx[j + 1:j + 9])
        yield idx[i:j].decode("utf-8", "replace"), data[off:off + size].decode("utf-8", "replace")
        i = j + 9


def build_index(base, out):
    """Every form of every article (comma-separated, the secondary stress ` dropped) under its key; a key with two stressed forms keeps both."""
    part = Path(str(out) + ".part")
    part.unlink(missing_ok=True)
    con = sqlite3.connect(str(part))
    con.execute("CREATE TABLE raw (k TEXT, f TEXT)")
    rows, n = [], 0
    for _head, art in _stardict(base):
        for f in art.split(","):
            f = f.strip().replace("`", "").replace(GRAVE, "")
            if f and WORD.fullmatch(f):
                rows.append((key(f), f.lower()))
        if len(rows) > 200_000:
            con.executemany("INSERT INTO raw VALUES (?, ?)", rows)
            n += len(rows)
            rows = []
    con.executemany("INSERT INTO raw VALUES (?, ?)", rows)
    con.execute("CREATE TABLE forms (k TEXT PRIMARY KEY, f TEXT) WITHOUT ROWID")
    con.execute("INSERT INTO forms SELECT k, group_concat(f, '|') FROM (SELECT DISTINCT k, f FROM raw ORDER BY k, f) GROUP BY k")
    con.execute("DROP TABLE raw")
    con.commit()
    con.execute("VACUUM")
    con.close()
    part.replace(out)
    return n + len(rows)


def zaliznyak_ready():
    """The paradigm's index open (built first when the StarDict is newer or it is missing); its state said: absent, building, ready, failed."""
    with ZLOCK:
        if Z["con"] is not None:
            return True
        d = zaliznyak_dir()
        base = next((p.with_suffix("") for p in sorted(d.glob("*.idx"))), None) if d.is_dir() else None
        if base is None:
            Z["state"] = "absent"
            return False
        db = d / "forms.sqlite"
        try:
            if not db.is_file() or db.stat().st_mtime < Path(str(base) + ".idx").stat().st_mtime:
                Z["state"] = "building"
                build_index(base, db)
            Z["con"] = sqlite3.connect(f"file:{db}?mode=ro", uri=True, check_same_thread=False)
            Z["state"] = "ready"
            return True
        except Exception as e:                           # noqa: BLE001  said in every report, the text read without the paradigm
            Z["state"], Z["error"] = "failed", repr(e)[:200]
            return False


def zaliznyak(k):
    """The paradigm's stressed forms of a key: [] when it has none; None when the paradigm is not open (absent, building, failed)."""
    con = Z["con"]
    if con is None:
        return None
    with ZLOCK:
        r = con.execute("SELECT f FROM forms WHERE k = ?", (k,)).fetchone()
    return r[0].split("|") if r else []


# ---------------------------------------------------------------- HERESY 2343: Ukrainian, lang-uk's dictionary indexed as Zaliznyak's is
# The plan of 08.11.2026 (the Reader's stresses: «lang-uk для украинского»; his ear on the blind round: «стукАють», «наспівувАв»): the dictionary of
# ukrainian-word-stress (lang-uk, MIT; 2.9 million word forms, the package's own data/stress.trie) turned once into models/narrator/dicts/uk/forms.sqlite
# (MISC/claude-arc/reader/stress-uk-20261110/uk_index.py, in a throwaway venv: the lab needs neither marisa-trie nor the package). A form the
# dictionary stresses two ways is a homograph, named and never guessed (as the package's dictionary mode skips it); a word with a capital inside a
# sentence is looked for among the dictionary's names first (Ки́їв, not киї́в), one at a sentence's start never (Замок there is any замок).
UK = {"state": "absent", "error": "", "con": None}
UK_APOS = str.maketrans("’ʼ`", "'''")


def uk_dir():
    return paths.at(paths.NARRATOR, H["kit"]) / "dicts" / "uk"


def uk_state():
    return UK["state"] if UK["state"] != "failed" else "failed: " + UK["error"]


def uk_ready():
    """The Ukrainian index open; its state said: absent, ready, failed."""
    with ZLOCK:
        if UK["con"] is not None:
            return True
        db = uk_dir() / "forms.sqlite"
        if not db.is_file():
            UK["state"] = "absent"
            return False
        try:
            UK["con"] = sqlite3.connect(f"file:{db}?mode=ro", uri=True, check_same_thread=False)
            UK["con"].execute("SELECT 1 FROM forms LIMIT 1").fetchone()
            UK["state"] = "ready"
            return True
        except Exception as e:                           # noqa: BLE001  said in every report, the text read without it
            UK["con"] = None
            UK["state"], UK["error"] = "failed", repr(e)[:200]
            return False


def uk_forms(k, name=False):
    """A key's stressed forms in Ukrainian: the dictionary's own names first when name (a capital inside a sentence), else every form; [] when it
    has none; None when the index is not open."""
    con = UK["con"]
    if con is None:
        return None
    k = k.translate(UK_APOS)
    with ZLOCK:
        r = con.execute("SELECT f FROM cap WHERE k = ?", (k,)).fetchone() if name else None
        if r is None:
            r = con.execute("SELECT f FROM forms WHERE k = ?", (k,)).fetchone()
    return r[0].split("|") if r else []


# ---------------------------------------------------------------- HERESY 2374: any language's own big dictionary, in the format of ours
# (Viktor 11.11.2026: «для какого бы то ни было языка пользователя написать гайд, как внедрить свой массивный словарь по примеру формата наших
# Зализняка и украинского»): models/narrator/dicts/LANG/forms.sqlite (paths.NARRATOR), the Ukrainian index's own shape (table forms: k the key, lower case, no
# stress marks, ё as е, the apostrophe as '; f its stressed forms joined by «|», two or more a homograph, named and never guessed; table cap
# optional, the forms of names, looked up first for a word with a capital inside a sentence; table about optional, its source and licence).
# lab/reader_dict_build.py builds one from a plain list of stressed forms or a StarDict; docs/NARRATOR-DICTIONARIES.md says how. Russian
# reads Zaliznyak's StarDict first where it is here, and such an index where it is not; Ukrainian keeps its own path (uk_ready).
OWN = {}                                                 # lang -> {"state", "error", "con"}


def own_dir(lang):
    return paths.at(paths.NARRATOR, H["kit"]) / "dicts" / lang


def own_ready(lang):
    """A language's own index open; False when there is none (said: absent) or it does not open (said: failed and why)."""
    with ZLOCK:
        d = OWN.setdefault(lang, {"state": "absent", "error": "", "con": None})
        if d["con"] is not None:
            return True
        db = own_dir(lang) / "forms.sqlite"
        if not db.is_file():
            d["state"] = "absent"
            return False
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, check_same_thread=False)
            con.execute("SELECT k, f FROM forms LIMIT 1").fetchall()
            d["cap"] = bool(con.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cap'").fetchone())
            d["con"], d["state"] = con, "ready"
            return True
        except Exception as e:                           # noqa: BLE001  said in every report, the text read without it
            d["state"], d["error"] = "failed", repr(e)[:200]
            return False


def own_state(lang):
    d = OWN.get(lang) or {"state": "absent"}
    return d["state"] if d["state"] != "failed" else "failed: " + d.get("error", "")


def own_forms(lang, k, name=False, start=False):
    """A key's stressed forms in a language's own index ([] none, None not open), its names first when name. HERESY 2399: the builder keeps a
    name in the names' table alone (То́го the country never hides того́ in a sentence); a capital at a sentence's start may be either, so there
    the names' forms join the common ones, and two stresses between them make it a homograph, named and never guessed."""
    d = OWN.get(lang)
    if not d or d.get("con") is None:
        return None
    k = k.translate(UK_APOS)
    with ZLOCK:
        r = d["con"].execute("SELECT f FROM cap WHERE k = ?", (k,)).fetchone() if name and d.get("cap") else None
        if r is None:
            r = d["con"].execute("SELECT f FROM forms WHERE k = ?", (k,)).fetchone()
            if start and d.get("cap"):
                c = d["con"].execute("SELECT f FROM cap WHERE k = ?", (k,)).fetchone()
                if c:
                    r = ("|".join(sorted(set((r[0].split("|") if r else []) + c[0].split("|")))),)
    if r is None and lang == "be" and k[:1] == "ў":     # HERESY 2459: Belarusian writes у as ў after a vowel (яго́ ўла́сных); the index keeps у
        return ["ў" + f[1:] for f in (own_forms(lang, "у" + k[1:], name, start) or [])]
    return r[0].split("|") if r else []


def variants(form):
    """HERESY 2452 (Viktor 12.11.2026 on the dictionaries: «слова с переходными ударениями… Они многое испортят»): the single-stress readings of a
    form the dictionary stresses two ways inside one word (ве́селы́, бе́ся́щий, по́ми́лка: either stress is the norm), or None when every part has
    one stress at most (a hyphenated compound keeps one per part: се́веро-за́падный). Such a form is a homograph like за́мок/замо́к: left
    unmarked unless the user marked it, and named, never guessed."""
    parts = re.split(r"([- ])", form)
    if not any(x.count(ACUTE) > 1 for x in parts):
        return None
    out = [""]
    for x in parts:
        if x.count(ACUTE) > 1:
            at = [i for i, c in enumerate(x) if c == ACUTE]
            opts = ["".join(c for i, c in enumerate(x) if c != ACUTE or i == keep) for keep in at]
        else:
            opts = [x]
        out = [o + y for o in out for y in opts]
    return sorted(set(out))


def _name_at(m, w):
    """A word with a capital inside a sentence (a name), never one at a sentence's start."""
    before = m.string[:m.start()].rstrip()
    return w[:1].isupper() and bool(before) and before[-1] not in ".!?…:;\n\"«„“—–-"


# ---------------------------------------------------------------- the pass
def stress(text, lang, how="acute", skip=None, user=None):
    """(the text with its stresses, as the engine takes them; the report). skip: a pattern whose matches (an engine's tags) are never touched."""
    lang = _lang(lang)
    user = user_dict(lang) if user is None else user
    rep = {"lang": lang, "own": 0, "user": 0, "marked": 0, "unknown": 0, "homographs": {}, "dict": "none"}
    # HERESY 2374: a language's own index. HERESY 2440 (Viktor 12.11.2026 on the testimony: «маркертинг», «пабликовано», «клип под алям»): Russian
    # reads gramdict's index first when it is here (every form of Zaliznyak's Grammatical Dictionary, 2399: 2.25 million keys), the StarDict's
    # paradigm (1.5 million) for a word it lacks. Measured on the testimony's 226 words of two vowels or more: the StarDict knew 187 and had no
    # «маркетинг», «можно», «потому», «вместе», «говорит», «нельзя» (and «нежно» only as the short adjective нежно́, so «очень нежно» got
    # нежно́); gramdict knew 208 and agreed with every mark of the master
    own = lang != "uk" and own_ready(lang)
    if lang == "ru" and not own:
        rep["dict"] = "zaliznyak" if Z["con"] is not None else "zaliznyak " + zaliznyak_state()
    elif lang == "ru" and Z["con"] is not None:
        rep["dict"] = "own:ru + zaliznyak"
    elif lang == "uk":                                   # HERESY 2343: lang-uk's dictionary, or why not
        rep["dict"] = "lang-uk" if UK["con"] is not None or uk_ready() else "lang-uk " + uk_state()
    elif own:
        rep["dict"] = "own:" + lang
    ru_like = lang in ("ru", "be")

    def one(m):
        w = m.group(0)
        if ACUTE in w or (ru_like and "ё" in w.lower()):
            rep["own"] += 1
            return w
        if lang == "ru":                                 # HERESY 2447: a clitic group, one stress on it
            c = clitic(m)
            if c:
                rep["marked"] += c[0] == "lead"
                return c[1]
        k = key(w)
        u = user.get(k)
        if u:
            rep["user"] += 1
            return with_case(w, u["form"])
        if vowels(w, lang) <= 1:
            return w
        if own:                                          # HERESY 2374: as Ukrainian's, names by their capital inside a sentence
            name_at = _name_at(m, w)
            forms = own_forms(lang, k, name_at, w[:1].isupper() and not name_at)
            if forms is not None and not forms and "-" in w and lang == "ru":
                forms = [_rehyphen(w, f) for f in (own_forms(lang, k.replace("-", "")) or [])]
            if not forms and lang == "ru" and Z["con"] is not None:   # HERESY 2440: the StarDict's paradigm for a word gramdict lacks
                forms = [f for f in (zaliznyak(k) or []) if ACUTE in f or "ё" in f]
                if not forms and "-" in w:
                    forms = [_rehyphen(w, f) for f in (zaliznyak(k.replace("-", "")) or []) if ACUTE in f or "ё" in f]
            if forms and len(forms) == 1 and variants(forms[0]):   # HERESY 2452: two stresses in one form, never forced
                forms = variants(forms[0])
            if forms:
                if len(forms) == 1:
                    rep["marked"] += 1
                    ap = next((c for c in w if c in "’ʼ`"), None)
                    return with_case(w, forms[0].replace("'", ap) if ap else forms[0])
                rep["homographs"].setdefault(k.translate(UK_APOS), sorted(set(forms)))
                return w
        elif lang == "ru":
            forms = zaliznyak(k)
            if forms is None:
                return w
            if not forms and "-" in w:                 # «бор-машина»: the paradigm writes it whole
                forms = [_rehyphen(w, f) for f in (zaliznyak(k.replace("-", "")) or [])]
            if len(forms) == 1 and variants(forms[0]):   # HERESY 2452
                forms = variants(forms[0])
            if len(forms) == 1:
                rep["marked"] += 1
                return with_case(w, forms[0])
            if len(forms) > 1:
                rep["homographs"].setdefault(k, sorted(set(forms)))
                return w
        if lang == "uk":                                 # HERESY 2343: a name by its capital inside a sentence, never at its start
            before = m.string[:m.start()].rstrip()
            forms = uk_forms(k, w[:1].isupper() and bool(before) and before[-1] not in ".!?…:;\n\"«„“—–-")
            if forms is None:
                return w
            if len(forms) == 1 and variants(forms[0]):   # HERESY 2452: lang-uk's по́ми́лка, авта́ркі́я: 23,585 forms of the kind
                forms = variants(forms[0])
            if len(forms) == 1:
                rep["marked"] += 1
                ap = next((c for c in w if c in "’ʼ`"), None)   # the word's own apostrophe kept (the index writes it as ')
                return with_case(w, forms[0].replace("'", ap) if ap else forms[0])
            if len(forms) > 1:
                rep["homographs"].setdefault(k.translate(UK_APOS), sorted(set(forms)))
                return w
        rep["unknown"] += 1
        return w

    parts, at = [], 0
    for m in (skip.finditer(text) if skip is not None else ()):
        parts.append(WORD.sub(one, text[at:m.start()]))
        parts.append(m.group(0))
        at = m.end()
    parts.append(WORD.sub(one, text[at:]))
    out = "".join(parts)
    rep["homographs"] = [{"word": k, "forms": v} for k, v in list(rep["homographs"].items())[:200]]
    return transport(out, how), rep


# ---------------------------------------------------------------- HERESY 2447: Russian clitic groups, one stress on the group
# (the narrator lane's list of 12.11.2026, on Viktor's «не было»: the pass marked each word alone, «не́ бы́ло» or «не бы́ло», where Russian
# says one word «не́ было»). A clitic and its host are read as one word: the stress goes to the clitic and the host is left without one in
# the groups below; a single-vowel clitic (же, ли, бы, то, не, на…) otherwise never takes a mark (vowels ≤ 1), and the hyphenated ones
# (кто-то, скажи-ка) are one word whose mark the paradigm puts on its stem. The author's own mark on either word wins: the group is left as written.
#   не + был/было/были, дал/дало: не́ был, не́ было, не́ дал; не была́, не дала́, не жила́, не пила́ (the verb, never the noun жи́ла or пи́ла)
#   не + за/к/о/об/на/с/у/для/по + что/чем/кого/чего/кому/чему/ком/чём/кем: не́ за что, не́ к кому
#   a preposition before a noun in the set phrases where the norm moves the stress onto it (на́ пол, по́ полю, и́з дому, бе́з вести)
# HERESY 2451 (Viktor 12.11.2026 on 2447): «не́ дали» out («никто так не говорит»), жил/пил never with a stressed не (не жил, не пил, не жи́ли);
# every за out of the set phrases («с ЗА снимай ударность. Она редко ставится на ЗА»): за город, за руку read as the dictionary has them. Kept by
# his word: не́ было, не́ был, не́ были, на́ пол, по́ полю, бе́з вести, не́ за что, не́ к кому.
CLITIC_NE = {"был", "было", "были", "дал", "дало"}
CLITIC_NE_FEM = {"была": "была́", "дала": "дала́", "жила": "жила́", "пила": "пила́"}   # after не a verb: жи́ла and пи́ла, the nouns, out
CLITIC_NE_PREP = {"за", "к", "о", "об", "на", "с", "у", "для", "по", "про"}
CLITIC_NE_PRON = {"что", "чем", "кого", "чего", "кому", "чему", "ком", "кем"}
CLITIC_PREP = {
    "на": {"пол", "гору", "голову", "спину", "воду", "берег", "зиму", "ночь", "день", "год", "нос", "бок", "смех", "ветер", "душу", "сторону", "дом"},
    # HERESY 2475 (Viktor 12.11.2026, his test «Рассыпалась мука́ по полу́, и по́ полу пробежалась…»): «по полу» is read both ways, so it is
    # no set phrase: left to the dictionary, where полу has two stresses (по́лу, полу́) and stays bare, named, unless he marks it
    "по": {"полю", "лесу", "морю", "небу", "носу", "лбу", "уши", "двое", "трое", "сердцу", "миру"},
    "под": {"гору", "руки", "ноги", "вечер", "нос"},
    "из": {"дому", "лесу", "виду"},
    "без": {"вести", "толку", "году"},
    "об": {"пол"},
    "от": {"роду"},
}
PROCLITIC = ({"не"} | set(CLITIC_PREP) | CLITIC_NE_PREP) - {"о"}   # HERESY 2475: «о́» may be his interjection, not a preposition
_GAP = r"[ \t\u00a0]+"
_NEXT = re.compile(_GAP + "(" + WORD.pattern + ")")
_PREV = re.compile("(" + WORD.pattern + ")" + _GAP + "$")
_PREV2 = re.compile("(" + WORD.pattern + ")" + _GAP + "(" + WORD.pattern + ")" + _GAP + "$")


def _acute_one(w):
    """A single-vowel clitic with the acute after its vowel, its case kept (Не -> Не́)."""
    for i, c in enumerate(w):
        if c.lower() in VOWELS["ru"]:
            return w[:i + 1] + ACUTE + w[i + 1:]
    return w


def clitic(m):
    """HERESY 2447: ("lead", the clitic with its stress) when this word leads a group, ("host", the word bare) when it is a group's host, or None.
    The neighbours are read from the text around the match, one space or more between them and nothing else (no comma, no line)."""
    w, at, txt = m.group(0), m.start(), m.string
    if ACUTE in w:
        return None
    k = key(w)
    if k == "не" or k in CLITIC_PREP:
        n1 = _NEXT.match(txt, m.end())
        if not n1 or ACUTE in n1.group(1):
            return None
        k1 = key(n1.group(1))
        if k == "не" and k1 in CLITIC_NE:
            return ("lead", _acute_one(w))
        if k == "не" and k1 in CLITIC_NE_PREP:
            n2 = _NEXT.match(txt, n1.end())
            if n2 and ACUTE not in n2.group(1) and key(n2.group(1)) in CLITIC_NE_PRON:
                return ("lead", _acute_one(w))
        if k1 in CLITIC_PREP.get(k, ()):
            return ("lead", _acute_one(w))
        return None
    head = txt[max(0, at - 60):at]
    p1 = _PREV.search(head)
    if p1:                                   # the author's «Не́ было»: his stress on the clitic, the host bare
        kp = key(p1.group(1))
        if ACUTE in p1.group(1) and kp in PROCLITIC:   # HERESY 2475: his stress on any proclitic (по́ полу): the host bare, never named
            return ("host", w)
        if (kp == "не" and k in CLITIC_NE) or k in CLITIC_PREP.get(kp, ()):
            return ("host", w)
        if kp == "не" and k in CLITIC_NE_FEM:
            return ("host", with_case(w, CLITIC_NE_FEM[k]))
    if k in CLITIC_NE_PRON:
        p2 = _PREV2.search(head)
        if p2 and key(p2.group(1)) == "не" and key(p2.group(2)) in CLITIC_NE_PREP:
            return ("host", w)
    return None


def _rehyphen(w, f):
    """The paradigm's whole form given back the word's hyphens: «бормаши́на» for «бор-машина» -> «бор-маши́на»."""
    out, k, letters = [], 0, list(f)
    for c in w.replace(ACUTE, ""):
        if c == "-":
            out.append("-")
            continue
        if k < len(letters):
            out.append(letters[k])
            k += 1
        while k < len(letters) and letters[k] == ACUTE:
            out.append(ACUTE)
            k += 1
    out.extend(letters[k:])
    return "".join(out)


def merge(a, b):
    """Two reports of one run summed (each piece has its own)."""
    if not a:
        return dict(b, homographs=list(b.get("homographs") or []))
    for n in ("own", "user", "marked", "unknown", "numbers"):
        a[n] = a.get(n, 0) + b.get(n, 0)
    seen = {h["word"] for h in a["homographs"]}
    a["homographs"] += [h for h in b.get("homographs") or [] if h["word"] not in seen][:200 - len(a["homographs"])]
    return a
