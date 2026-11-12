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
    """The marks as the engine takes them: acute (as written), plus (a + before the vowel), none (taken out). The secondary grave never goes."""
    t = text.replace(GRAVE, "")
    if how == "plus":
        return re.sub(r"([^\W\d_])" + ACUTE, lambda m: "+" + m.group(1), t)
    if how == "none":
        return t.replace(ACUTE, "")
    return t


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


def own_forms(lang, k, name=False):
    """A key's stressed forms in a language's own index ([] none, None not open), its names first when name."""
    d = OWN.get(lang)
    if not d or d.get("con") is None:
        return None
    k = k.translate(UK_APOS)
    with ZLOCK:
        r = d["con"].execute("SELECT f FROM cap WHERE k = ?", (k,)).fetchone() if name and d.get("cap") else None
        if r is None:
            r = d["con"].execute("SELECT f FROM forms WHERE k = ?", (k,)).fetchone()
    return r[0].split("|") if r else []


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
    own = lang != "uk" and (lang != "ru" or Z["con"] is None) and own_ready(lang)   # HERESY 2374: a language's own index
    if lang == "ru" and not own:
        rep["dict"] = "zaliznyak" if Z["con"] is not None else "zaliznyak " + zaliznyak_state()
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
        k = key(w)
        u = user.get(k)
        if u:
            rep["user"] += 1
            return with_case(w, u["form"])
        if vowels(w, lang) <= 1:
            return w
        if own:                                          # HERESY 2374: as Ukrainian's, names by their capital inside a sentence
            forms = own_forms(lang, k, _name_at(m, w))
            if forms is not None and not forms and "-" in w and lang == "ru":
                forms = [_rehyphen(w, f) for f in (own_forms(lang, k.replace("-", "")) or [])]
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
    for n in ("own", "user", "marked", "unknown"):
        a[n] = a.get(n, 0) + b.get(n, 0)
    seen = {h["word"] for h in a["homographs"]}
    a["homographs"] += [h for h in b.get("homographs") or [] if h["word"] not in seen][:200 - len(a["homographs"])]
    return a
