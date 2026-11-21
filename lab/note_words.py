"""HERESY 2860 (UIX №91: a Narrator's take note was written in English whatever language the page spoke): the words of the take's note in
the page's language. They live in the room's catalog beside its other words (build/tools/console/heresy-reader-i18n.js, the ids
reader.takeNote.*), one translation in one place; the lab reads only those rows, each one JSON array of the thirteen languages in the catalog's
order, again whenever the file changes. The English below is the code's own (the note as it was written before, word for word) and the
fallback: a catalog that cannot be read, or a row it lacks, gives the English and says so in the log once, never a silent English."""
import json
import re
import threading
from pathlib import Path

LANGS = ("en", "ru", "uk", "be", "el", "es", "it", "fr", "pt", "de", "ja", "zh", "he")
CATALOG = Path(__file__).resolve().parent.parent / "build" / "tools" / "console" / "heresy-reader-i18n.js"
ROW = re.compile(r'"reader\.takeNote\.([\w.]+)":\s*\[')
SLOT = re.compile(r"\{#(\d)\}")

EN = {
    "narrator": "The Narrator", "narration": "narration", "dialog": "dialog", "ownVoice": "the engine’s own voice",
    "temperature": "temperature {#0}", "seed": "seed {#0}",
    "tagsMood": "inline tags read, each piece in its paragraph’s mood", "tagsRead": "inline tags read", "tagsOut": "inline tags taken out",
    "bySentence": "by sentence", "byVerse": "by verse", "byTurns": "by turns", "pieces": "{#0} pieces",
    "cpu": "the processor", "xpu": "the Intel card",
    "bridge": "each piece read after the one before it (history)",
    "window": "the window: whole paragraphs, each with its voice's sample, the first piece and the latest in the window",
    "limits": "{#0} pieces reached the frame budget", "scene": "a scene a pass, up to {#0} voices",
    "stalls": "{#0} pieces read again after a silence of more than 4 s inside", "pieceChars": "pieces up to {#0} characters",
    "read": "{#0} s read in {#1} s", "never": "never for training",
    "whisper": "Whisper {#0} % of letters off", "rereads": "{#0} piece(s) read again", "piece": "piece {#0}",
    "lettersOff": "{#0} % of letters off", "kept": "reading {#0} of {#1} kept",
    "swapped": "“{#0}” heard as “{#1}”", "inserted": "inserted: “{#0}”", "dropped": "dropped: “{#0}”", "at": "at {#0}",
    "notHeardBy": "not heard by Whisper: {#0}", "whisperOff": "not heard: Whisper was off",
    "tails": "{#0} tail(s) after the last word cut (a voice or a tone)", "tones": "a steady tone under the words of {#0} piece(s)",
    "holes": "a silence of a second or more inside {#0} piece(s)", "levelOff": "{#0} piece(s) {#1} dB or more off the reading's level",
    "tailError": "the tail guard could not look: {#0}",
    "mended": "{#0} codec knocks mended at the seams", "mended.one": "{#0} codec knock mended at the seams",
    "acutesOff": "read without acutes (a test)",
    "glyphsUser": "LCV glyphs by the user’s copy of the map, {#0} changes", "glyphsAuthor": "LCV glyphs by the author’s map, {#0} changes",
    "check": "Whisper's check", "checkNot": "not heard: {#0}", "noFlag": "no word flagged",
    "flagged": "{#0} words flagged: {#1}", "flagged.one": "{#0} word flagged: {#1}",
}

_lock = threading.Lock()
_cache = {"stamp": None, "rows": None}
_said = set()
say = print                                              # reader.py points it at its log


def lang_of(x):
    """The page's language as the request gave it (ru, ru-RU, uk…), or English."""
    x = str(x or "").strip().lower()[:2]
    return x if x in LANGS else "en"


def rows():
    """{key: [13 strings]} read from the catalog, again when it changed; {} when it cannot be read (said once)."""
    try:
        stamp = CATALOG.stat().st_mtime_ns
    except OSError:
        stamp = None
    with _lock:
        if _cache["rows"] is not None and _cache["stamp"] == stamp:
            return _cache["rows"]
        out, err = {}, ""
        try:
            src = CATALOG.read_text(encoding="utf-8")
            dec = json.JSONDecoder()
            for m in ROW.finditer(src):
                arr, _ = dec.raw_decode(src, m.end() - 1)
                if isinstance(arr, list) and len(arr) == len(LANGS) and all(isinstance(s, str) and s for s in arr):
                    out[m.group(1)] = arr
                else:
                    err = err or f"reader.takeNote.{m.group(1)} is not thirteen words"
        except (OSError, ValueError) as e:
            err = f"{CATALOG.name}: {e}"
        if err and err not in _said:
            _said.add(err)
            say(f"the take notes' words: {err}; the rows that could not be read are written in English")
        _cache.update(stamp=stamp, rows=out)
        return out


def w(lang, key, *args, n=None):
    """The note's word `key` in `lang`, its slots {#0} {#1} filled with args; n == 1 takes the key's «.one» form where there is one."""
    if n == 1 and key + ".one" in EN:
        key += ".one"
    lang = lang_of(lang)
    tpl = None
    if lang != "en":
        row = rows().get(key)
        if row:
            tpl = row[LANGS.index(lang)]
        elif ("row", key) not in _said:
            _said.add(("row", key))
            say(f"the take notes' words: reader.takeNote.{key} is not in {CATALOG.name}; written in English")
    if tpl is None:
        tpl = EN[key]
    return SLOT.sub(lambda m: str(args[int(m.group(1))]) if int(m.group(1)) < len(args) else m.group(0), tpl)


def check_heads():
    """Whisper's check's head in every language the catalog has (an earlier check's line is found whatever language wrote it)."""
    out = {EN["check"]}
    out.update(rows().get("check") or [])
    return out
