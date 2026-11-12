"""HERESY 2241 (Viktor 07.11.2026: «До ума доводи нашу TTS комнату. Дизайн в соответствие с идеологией всей Студии»): the Reader, the room of the
spoken word. A long text read in one voice (narration: cut by sentence or by verse, the voice held steady by the first piece's own sound as the
reference of every piece after it), or a dialog written «Name: line», a voice for each speaker; inline tags read by default in a dialog and taken
out of a narration (his word on the ten-voice probe: plain is a clean book reading, tags make a dialog live). The take lands in the Library with its
text and settings in its note, marked never for training (no_train.py): its meta, its request and its WAV's own comment tag.

Engines come from a registry, each a folder with an engine.json and a module (reader_worker.py says what the module gives):
    lab/reader_engines/ID/        the Studio's own (none yet: an open engine plugs in here)
    user/reader/engines/ID/       one's own, linked there; a private engine lives outside every release and is linked in on its machine
Each reads in its own Python (the manifest names one a device: cuda, xpu, cpu), kept alive between runs on a CUDA card, let go at once on an Intel
Arc (the Studio's engine needs it back) or the processor. The card: Auto (the cards Engine → GPUs gives the lab's jobs, the guard's choice), one of
them, an Intel Arc, or the processor. Voices: made-up ones (an engine's own take with no reference, never a person) and one's own, uploaded on the
user's word that its owner consented; gender and pitch by pYIN (never a bare autocorrelation: it heard a 202 Hz voice at 101 Hz); where made-up
voices are here, the page groups them by timbre, each group read by its centre voice, not persons (none come with the Studio: a fresh install
reads in the engine's own voice or one's own). Public with the room since 2.0.7 (HERESY 2374): make-release carries lab/reader*.py.

    GET  /reader/engines · /reader/voices · /reader/cards · /reader/runs · /reader/file?id=RUN&f=FILE · /reader/voice-file?id=VOICE
    POST /reader/say {mode, text, engine, voice, voices, tags, temperature, top_k, seed, card, split, gap, turn_gap, title, workspace}
    POST /reader/stop {id} · /reader/voice {name, lang, text, consent, audio_b64, ext} · /reader/voice-remove {id}

HERESY 2255–2257 (Viktor 08.11.2026: «гони Драму в комнату»; «правка ударения прямо из дубля, чтобы не регенерить снова полный»): the open engine in
lab/reader_engines/drama3; the stresses put in before an engine reads (reader_stress.py: his own marks first, then the user's dictionary, then
the language's big dictionary: Ukrainian's comes with the Studio, Zaliznyak's StarDict or an index of one's own where the user puts it); an engine's style (what it has: a free-form bracket, its own tags; neither engine has a system prompt) before each piece;
a finished take fixed piece by piece: a piece read again with its words or stresses corrected, its versions kept, the take joined anew from the
versions chosen (each piece's edges faded 12 ms into its silence, the take's own gain kept, the new version brought to the old one's level), undo
by the history, the Library's take rewritten in place.

    GET  /reader/run?id= · /reader/dict?lang=
    POST /reader/stress {text, lang, engine} · /reader/dict {lang, word, form} · /reader/fix {id, piece, text, seed} · /reader/fix-pick {id, piece, v}
         · /reader/fix-undo {id}

HERESY 2263 (Viktor 09.11.2026: «переводи Драму Чтеца на audio.cpp»): an engine's manifest may give tiers, each a quant and where it reads
(Drama 3 through audio.cpp: Q4_K or Q6_K on a card with 22 GB free, Q8_0 with its 40 expert banks in RAM on a card with 7 GB free and 40 GB of
the machine's memory, else the processor in the largest quant its memory holds). Auto picks by the room free now (speed first or quality
first, the room's choice); a named tier waits for its card. The worker gets its tier in READER_TIER and is kept per tier; the take and its
card say which tier read it and how fast.

    GET  /reader/tier?engine=&ask=&card=&chars=   the tier a run would take now, its expected speed and time

HERESY 2287 (Viktor 09.11.2026: «Среднюю ступень с Q4/Q6 замеришь, конечно, и выставишь как положено по просчётам»): the manifest's "auto"
gives the order Auto tries the card tiers in, speed first and quality first (Drama 3: Q4_K or Q6_K with all 40 expert banks in RAM and
cuda_perf on a card with 8 GB free, between the 22 GB tiers and Q8_0); a tier's "opts" go to its engine as session options; a tier with
"named": false is Auto's only, left out of the room's select.

HERESY 2266 (Viktor 08.11.2026, the room's vision: «Whisper сверяет прочитанное с текстом и перечитывает кусок при высоком CER: повторы,
пропуски, каша»; «громкость для начитки −16 LUFS, как в подкастах»): each piece heard by Whisper on the processor (reader_hear.py, kept for the
run) while the engine reads the next one; a piece whose letters came out 12 % or more off what it was asked to read (four edits at least) is
read once more with another seed and the closer of the two kept; the take joined to −16 LUFS (ffmpeg's EBU R128 measure, one gain, a soft knee
above −3 dBFS so no peak passes −1 dBFS). An ear that failed is said in the run and the take's note, never taken for a clean reading.

HERESY 2295 (Viktor 09.11.2026, the blind test of Drama 3's quants: the three takes he marked down for a word that is not in the text, «прОбыв»,
«пувО», «пашидИм» after «глубоко» at 0:11, were heard by Whisper at 1.5–2.6 % of letters off and let through by the 12 % line): the ear aligns
Whisper's words, each with its time, to the text's words (the score's own folding) and a piece with a word inserted, dropped or a content word
heard as another is read again too, up to three readings, the fewest word errors kept, then the fewest letters off; the run card and the take's
note say which pieces and why («inserted: “пуво” at 0:11.2», the time in the take).

HERESY 2269 (Viktor 09.11.2026: «гони сегодня Чтеца с Видеографом по максимуму»; the room's vision of 08.11: «Писатель: сценарии с репликами и
тегами эмоций»): a recording into a script. A lecture or a stream uploaded as it is (any audio, a video's sound), read to 16 kHz by ffmpeg, heard
by Whisper large-v3 in the lab's own Whisper turn (a card when one has room, else the processor), its words kept with their times and a text
in paragraphs at its pauses; the page cleans it up with the Writer's model (the hosts of Engine → Writer, 2097) into lines the Reader reads,
its speakers and its tags, and keeps that script beside the transcript.

    POST /reader/transcribe?file=NAME&lang=LANG   the recording as the body · GET /reader/transcripts · /reader/transcript?id=
    POST /reader/transcript-script {id, script} · /reader/transcript-remove {id}

HERESY 2270: the glyph map (reader_glyphs.py): LCV's own letters and marks read by Viktor's table (lcvr2tts.map.tsv, read only) or the user's
copy the room keeps in user/reader/glyphs.map.tsv, applied before the stresses when the run asks it; the take's note says which table and how
many changes.

    GET  /reader/glyphs · POST /reader/glyphs {text} (the user's copy) · /reader/glyphs-reset"""
import base64
import collections
import json
import os
import queue
import random
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

import sys

import no_train
import paths                       # HERESY 2330: where the weights live
import reader_glyphs as rg
import reader_stress as rs

H = {}
HERE = Path(__file__).resolve().parent
ARC_BASE = 100                      # gpu_roles.ARC_BASE: an Intel card's index
IDLE_S = 150                        # a worker kept on a CUDA card this long after its last piece
LOAD_S = 900                        # an engine's load, at most
PIECE_S = 600                       # one piece, at most
WAIT_S = 3 * 3600                   # a card waited for, at most (as the Artist)
TEXT_MAX = 100_000
PIECES_MAX = 2000
SPEAKERS_MAX = 16
ANCHOR_MIN_S = 2.5                  # the first piece that long holds the voice for the rest
RETRIES = 2                         # a piece whose voice drifted across the line of gender is read again, with another seed, this many times
TARGET = 240                        # a narration's piece gathers sentences up to this many characters
STOPPED = "the lab restarted while it was reading"
ACT_SAY = {"reader": "the Narrator"}
RUN_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")
VOICE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
MODES = ("narration", "dialog")
STRESS_HOW = ("acute", "plus", "none")
STYLE_KINDS = ("bracket", "tags")
FADE_S = 0.012                      # a piece's edges faded this long into its silence, so a piece read again joins without a click
SPLITS = ("sentence", "verse")
TIER_AUTO = ("auto-speed", "auto-quality")      # HERESY 2263: an engine with tiers picks by the room free now, speed or quality first
GRADES = ("green", "yellow", "red")          # HERESY 2300: a tier's grade from the raw test of its quant (no re-read): stable, medium, undesirable
TIER_DEV = ("cuda", "cpu")
SPEECH_CPS = 14.0                   # characters of plain text a second of speech (Drama 3's Russian piece: 397 characters, 26.8 s)
HEAR_THREADS = 8                    # HERESY 2266: Whisper's threads on the processor, beside an engine's own
HEAR_BEAM = 5                       # HERESY 2375: the ear's beam (it was greedy, 1): more exact, slower on the processor only
HEAR_S = 900                        # the ear's load or one piece, at most
CER_REREAD = 0.12                   # a piece heard this far off its words is read once more with another seed...
CER_EDITS = 4                       # ...when that many letters at least are off (a short piece's one slip is no reason)
CER_MIN_CHARS = 8                   # fewer letters than this: not scored
READS_MAX = 3                       # HERESY 2295: a piece with a word inserted, dropped or swapped is read up to this many times, the best kept
SWAP_FAR = 0.5                      # a word heard as another one: this share of its letters off at least (a slip of a letter is the CER's)
SWAP_MIN = 4                        # ...and a content word: this many letters at least (a short word misheard is no reason)
LUFS = -16.0                        # the joined reading's loudness, as podcasts
LIM_KNEE, LIM_CEIL = 10 ** (-3 / 20), 10 ** (-1 / 20)    # the soft knee above -3 dBFS, never a peak past -1 dBFS
HEAR_MAP = str.maketrans({"ё": "е", "э": "е", "ы": "и", "ʼ": "", "'": "", "’": "", "·": "", "ς": "σ"})
# a Latin word inside a Cyrillic text (audio.cpp, a name) heard back in Cyrillic: both sides in one script, so no false alarm (09.11: «аудио ТПП»)
LAT2CYR = str.maketrans({"a": "а", "b": "б", "c": "ц", "d": "д", "e": "е", "f": "ф", "g": "г", "h": "х", "i": "и", "j": "й", "k": "к", "l": "л",
                         "m": "м", "n": "н", "o": "о", "p": "п", "q": "к", "r": "р", "s": "с", "t": "т", "u": "у", "v": "в", "w": "в", "x": "кс",
                         "y": "и", "z": "з",
                         # HERESY 2270: the letters the glyph map puts into a Russian word (Авраהа́ма, θама́ры), folded as the probes' scorer does
                         "ה": "х", "ת": "т", "ו": "в", "ג": "г", "ש": "ш", "θ": "т", "ι": "и", "ο": "о", "α": "а", "ε": "е"})


# HERESY 2311: Greek letters by their sound, for the ear's score only (digraphs first, in _el_sound)
EL2LAT = str.maketrans({"α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th", "ι": "i", "κ": "k", "λ": "l", "μ": "m",
                        "ν": "n", "ξ": "ks", "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "i", "φ": "f", "χ": "h", "ψ": "ps",
                        "ω": "o"})
LAT2HEB = str.maketrans({"a": "", "e": "", "i": "י", "y": "י", "o": "ו", "u": "ו", "b": "ב", "c": "ק", "d": "ד", "f": "פ", "g": "ג", "h": "ה",
                         "j": "ג", "k": "ק", "l": "ל", "m": "מ", "n": "נ", "p": "פ", "q": "ק", "r": "ר", "s": "ס", "t": "ט", "v": "ו", "w": "ו",
                         "x": "קס", "z": "ז"})
HE_FOLD = str.maketrans({"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ", "ט": "ת", "כ": "ק"})


HOME_WORD = {"ru": "слово", "uk": "слово", "be": "слова", "el": "λόγος", "he": "מילה"}     # HERESY 2311: a word in the language's own letters
# HERESY 2311: what Whisper writes on a piece's trailing quiet from its subtitle years (10.11: «Продолжение следует» after «а не брать в аренду»,
# the piece read twice more for it); only a run of words put in after the piece's last word and only these, so a text that says them is read
SIGN_OFF = {"ru": ("Продолжение следует", "Продолжение следует...", "Субтитры сделал DimaTorzok", "Субтитры создавал DimaTorzok", "Редактор субтитров А.Синецкая",
                   "Спасибо за просмотр", "Спасибо за внимание"),
            "uk": ("Дякую за перегляд", "Субтитри зроблені", "Продовження буде", "Дякую за увагу"),
            "be": ("Дзякуй за прагляд", "Працяг будзе"),
            "en": ("Thanks for watching", "Thank you for watching", "Thank you", "Thanks for watching!", "To be continued", "Subtitles by the Amara.org community"),
            "el": ("Ευχαριστώ για την παρακολούθηση", "Υπότιτλοι", "Συνεχίζεται"),
            "he": ("תודה שצפיתם", "תודה רבה", "המשך יבוא"),
            "de": ("Vielen Dank fürs Zuschauen", "Untertitel im Auftrag des ZDF", "Fortsetzung folgt"),
            "es": ("Gracias por ver el video", "Subtítulos realizados por la comunidad de Amara.org", "Continuará"),
            "fr": ("Merci d'avoir regardé cette vidéo", "Sous-titres réalisés par la communauté d'Amara.org", "À suivre"),
            "it": ("Grazie per la visione", "Sottotitoli creati dalla comunità Amara.org", "Continua"),
            "pt": ("Obrigado por assistir", "Legendas pela comunidade Amara.org", "Continua")}
# ...and its subtitle credits, whoever they name (10.11, the Greek card: «Υπότιτλοι AUTHORWAVE» after «Μας φτάνει»): a run put in that begins so
SIGN_CREDIT = ("Субтитры", "Редактор субтитров", "Субтитри", "Υπότιτλοι", "Subtitles by", "Untertitel", "Sous-titres", "Subtítulos", "Sottotitoli", "Legendas")
SKEL = {"б": "b", "в": "v", "г": "g", "ґ": "g", "д": "d", "ж": "z", "з": "z", "к": "k", "л": "l", "м": "m", "н": "n", "п": "p", "р": "r", "с": "s",
        "т": "t", "ф": "f", "х": "h", "ц": "c", "ч": "c", "ш": "s", "щ": "s", "β": "v", "γ": "g", "δ": "d", "ζ": "z", "θ": "t", "κ": "k", "λ": "l",
        "μ": "m", "ν": "n", "ξ": "x", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "φ": "f", "χ": "h", "ψ": "ps", "ב": "v", "ג": "g", "ד": "d",
        "ז": "z", "ח": "h", "ט": "t", "כ": "k", "ך": "k", "ל": "l", "מ": "m", "ם": "m", "נ": "n", "ן": "n", "ס": "s", "פ": "f", "ף": "f", "צ": "c",
        "ץ": "c", "ק": "k", "ר": "r", "ש": "s", "ת": "t", "w": "v", "q": "k", "j": "", "x": "x"}


def setup(**parts):
    """kit, jobs, lock, wait_card, turn, free_gpu, say, outputs, config_dir, collection, slug, gpus_state, studio_now, engine_url, cancelled"""
    H.update(parts)
    for d in (runs_home(), voices_home()):
        d.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=_reaper, daemon=True, name="reader-reaper").start()
    threading.Thread(target=_measure_all, daemon=True, name="reader-pyin").start()
    rs.setup(kit())


def kit():
    return Path(H["kit"])


def runs_home():
    return kit() / "reader" / "runs"


def voices_home():
    return kit() / "reader" / "voices"


def _say(text):
    H["say"]("the Narrator · " + text)   # what a person reads in the strip above the player (the logs' own lines keep «the Reader»)


def _json(p, default=None):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write(p, obj):
    part = Path(str(p) + ".part")
    with open(part, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    part.replace(p)


# ---------------------------------------------------------------- engines
def _python(spec, device):
    rel = spec.get(device) if isinstance(spec, dict) else spec
    if not rel:
        return None
    p = Path(str(rel))
    return p if p.is_absolute() else kit() / p


def _engine_of(d, own):
    m = _json(d / "engine.json")
    if not isinstance(m, dict) or not ID_RE.match(str(m.get("id") or "")):
        raise ValueError("an engine.json with an id of a–z, 0–9 and -")
    base = d.resolve()
    mod = (base / str(m.get("module") or "engine.py")).resolve()
    if base not in mod.parents or not mod.is_file():
        raise ValueError("its module is not in its own folder")
    devs = [x for x in ("cuda", "xpu", "cpu") if _python(m.get("python"), x)]
    tags = m.get("tags") if isinstance(m.get("tags"), dict) else {}
    try:
        tag_re = re.compile(str(m.get("tag_re") or r"(?!x)x"))
    except re.error:
        tag_re = re.compile(r"(?!x)x")
    sty = m.get("style") if isinstance(m.get("style"), dict) and m["style"].get("kind") in STYLE_KINDS else None
    lic = m.get("license") if isinstance(m.get("license"), dict) else None
    tiers = _tiers_of(m.get("tiers"))
    return {"id": m["id"], "label": str(m.get("label") or m["id"])[:60], "own": own,
            "stress": m.get("stress") if m.get("stress") in STRESS_HOW else "acute", "seed": m.get("seed") is not False,
            "top_k": m.get("top_k") is not False,       # HERESY 2263: Drama 3 through audio.cpp keeps every candidate (a cap stalls it)
            "style": {"kind": sty["kind"], "max": max(10, min(int(sty.get("max") or 160), 400)), "ph": str(sty.get("ph") or "")[:160]} if sty else None,
            "license": {k: str(lic.get(k) or "")[:300] for k in ("name", "url", "terms", "credit")} if lic else None,
            "first_run": str(m.get("first_run") or "")[:400], "dir": str(base), "module": str(mod),
            "python": {x: str(_python(m.get("python"), x)) for x in devs}, "devices": devs,
            "ready": {x: _python(m.get("python"), x).is_file() for x in devs},
            "need_mb": int(m.get("need_mb") or 12000), "sample_rate": int(m.get("sample_rate") or 24000),
            "max_chars": max(80, min(int(m.get("max_chars") or 400), 2000)), "langs": [str(x) for x in m.get("langs") or []][:120],
            "tags": tags, "tag_re": tag_re, "note": str(m.get("note") or "")[:400], "tiers": tiers, "tier_auto": _auto_of(m.get("auto"), tiers),
            "missing": _missing(m.get("needs"), tiers), "setup": _setup_of(m.get("setup"))}


def _missing(needs, tiers):
    """HERESY 2374: what an engine still lacks on this machine, said in words (a model of no tier here, a part its manifest names: a built server,
    the licence files): [] when it is ready. A Studio fresh from a release shows the Narrator's setup instead of failing at the first reading."""
    out = []
    if tiers and not any(t["ready"] for t in tiers):
        out.append({"id": "model", "say": "no model of it is here"})
    for n in needs if isinstance(needs, list) else []:
        if not isinstance(n, dict) or not ID_RE.match(str(n.get("id") or "")):
            continue
        anyof, allof = [str(x) for x in n.get("any") or []][:8], [str(x) for x in n.get("all") or []][:8]
        ok = (not anyof or any((kit() / x).is_file() for x in anyof)) and all((kit() / x).is_file() for x in allof)
        if not ok:
            out.append({"id": n["id"], "say": str(n.get("say") or n["id"])[:160]})
    return out


def _setup_of(raw):
    """HERESY 2374: how an engine is set up here: the Engine's tier that fetches its model (and builds what it needs), a command, its size."""
    if not isinstance(raw, dict):
        return None
    return {k: str(raw.get(k) or "")[:120] for k in ("tier", "command", "size")}


def _tiers_of(raw):
    """HERESY 2263: an engine's tiers (a quant and where it reads), each ready when its model file is on this machine."""
    out = []
    for t in raw if isinstance(raw, list) else []:
        if not isinstance(t, dict) or not ID_RE.match(str(t.get("id") or "")) or t.get("device") not in TIER_DEV:
            continue
        rel = str(t.get("model") or "")
        try:
            out.append({"id": t["id"], "quant": str(t.get("quant") or t["id"])[:16], "model": rel, "device": t["device"],
                        "need_mb": int(t.get("need_mb") or 0), "ram_gb": float(t.get("ram_gb") or 0), "cel": int(t.get("cel") or 0),
                        "threads": int(t.get("threads") or 0), "rtf": float(t.get("rtf") or 1.0), "load_s": float(t.get("load_s") or 60),
                        "opts": _tier_opts(t.get("opts")), "named": t.get("named") is not False,
                        "fallback": [str(i) for i in t.get("fallback") or [] if ID_RE.match(str(i))][:4],
                        "grade": t.get("grade") if t.get("grade") in GRADES else None,   # HERESY 2300
                        "ready": bool(rel) and paths.narrator_file(rel, kit()).is_file()})
        except (TypeError, ValueError):
            continue
    return out


def _tier_opts(raw):
    """HERESY 2287: a tier's own session options for its engine (cuda_perf, disk experts): short keys, plain values, eight at most."""
    o = raw if isinstance(raw, dict) else {}
    return {str(k)[:64]: v for k, v in list(o.items())[:8] if isinstance(v, (bool, int, float)) or isinstance(v, str) and len(v) <= 64}


def _auto_of(raw, tiers):
    """HERESY 2287: the order Auto tries an engine's card tiers in, speed first and quality first, from its manifest (the tier table); the tiers
    it names that are not CUDA ones are left out. None for an engine without that order (the order of HERESY 2263 then)."""
    cuda = {t["id"] for t in tiers if t["device"] == "cuda"}
    out = {}
    for ask in TIER_AUTO:
        ids = (raw or {}).get(ask) if isinstance(raw, dict) else None
        if isinstance(ids, list):
            out[ask] = [str(i) for i in ids if str(i) in cuda]
    return out or None


def engines():
    out, seen = [], set()
    for base, own in ((HERE / "reader_engines", False), (kit() / "user" / "reader" / "engines", True)):
        if not base.is_dir():
            continue
        for d in sorted(base.iterdir()):
            if not (d / "engine.json").is_file():
                continue
            try:
                e = _engine_of(d, own)
            except (OSError, ValueError, TypeError) as x:
                _say(f"the engine in {d.name} is left out: {x}")
                continue
            if e["id"] not in seen:
                seen.add(e["id"])
                out.append(e)
    return out


def engines_public():
    return {"engines": [dict({k: e[k] for k in ("id", "label", "own", "devices", "ready", "need_mb", "langs", "tags", "note", "max_chars", "stress", "seed",
                                                "top_k", "style", "license", "first_run", "missing", "setup")},   # HERESY 2374: missing, setup
                             tiers=[{k: t[k] for k in ("id", "quant", "device", "need_mb", "ram_gb", "rtf", "load_s", "ready", "grade")} for t in e["tiers"]
                                    if t["named"]])
                        for e in engines()]}


def _engine(eid):
    es = engines()
    if not es:
        raise ValueError("no engine for the Narrator on this machine: an engine's folder goes into lab/reader_engines/ or user/reader/engines/")
    for e in es:
        if e["id"] == eid:
            return e
    if eid:
        raise ValueError(f"no engine {eid} here")
    return es[0]


# ---------------------------------------------------------------- voices
def _voice_rows():
    rows = []
    for j in sorted(voices_home().glob("*.json")):
        v = _json(j, {})
        if not isinstance(v, dict) or not VOICE_RE.match(j.stem) or not j.with_suffix(".wav").is_file():
            continue
        rows.append({"id": j.stem, "name": str(v.get("name") or j.stem)[:60], "lang": str(v.get("lang") or "")[:8],
                     "kind": "own" if v.get("kind") == "own" else "made", "made_by": str(v.get("made_by") or ""),
                     "gender": v.get("gender") if v.get("f0_by") == "pyin" else "", "f0": v.get("f0") if v.get("f0_by") == "pyin" else None,
                     "bright": v.get("bright"), "text": str(v.get("text") or "")[:300], "seconds": v.get("seconds")})
    return rows


REG = {"male": ((0, 105, "low"), (105, 135, "middle"), (135, 1e9, "high")), "female": ((0, 185, "low"), (185, 225, "middle"), (225, 1e9, "high"))}


def _groups(rows):
    """The timbre groups: by gender and register, each read by its centre voice (the one nearest the group's mean pitch and brightness)."""
    import math
    by = collections.defaultdict(list)
    for v in rows:
        if v["kind"] != "made" or v["gender"] not in REG or not v["f0"]:
            continue
        reg = next(name for lo, hi, name in REG[v["gender"]] if lo <= v["f0"] < hi)
        by[v["gender"] + "-" + reg].append(v)
    out = []
    for key in ("male-low", "male-middle", "male-high", "female-low", "female-middle", "female-high"):
        vs = by.get(key)
        if not vs:
            continue
        pt = lambda v: (12 * math.log2(v["f0"]), (v.get("bright") or 0) / 250.0)   # semitones, and the brightness a quarter-tone a 60 Hz
        mean = [sum(pt(v)[i] for v in vs) / len(vs) for i in (0, 1)]
        centre = min(vs, key=lambda v: sum((a - b) ** 2 for a, b in zip(pt(v), mean)))
        out.append({"id": key, "gender": key.split("-")[0], "register": key.split("-")[1], "voices": [v["id"] for v in vs],
                    "centre": centre["id"], "langs": sorted({v["lang"] for v in vs if v["lang"]})})
    return out


def voices():
    rows = _voice_rows()
    return {"voices": rows, "groups": _groups(rows)}


def measure(wav):
    """Pitch by pYIN (librosa) over the voiced frames, and the brightness (the spectral centroid's median), from a voice's clip."""
    import librosa
    import numpy as np
    y, sr = librosa.load(str(wav), sr=16000, mono=True)
    f0, voiced, _p = librosa.pyin(y, fmin=60.0, fmax=420.0, sr=sr, frame_length=1024)
    f = f0[voiced & ~np.isnan(f0)] if f0 is not None else np.array([])
    if len(f) < 10:
        return None
    med = float(np.median(f))
    bright = float(np.median(librosa.feature.spectral_centroid(y=y, sr=sr)[0]))
    return {"f0": round(med, 1), "gender": "male" if med < 160.0 else "female", "bright": round(bright), "f0_by": "pyin", "seconds": round(len(y) / sr, 2)}


MEASURE_LOCK = threading.Lock()


def _measure_one(j):
    v = _json(j, {})
    if not isinstance(v, dict) or v.get("f0_by") == "pyin":
        return v
    try:
        m = measure(j.with_suffix(".wav"))
    except Exception as e:                               # noqa: BLE001  said, the voice listed without its gender
        _say(f"the voice {j.stem} could not be measured: {e!r}"[:300])
        return v
    if m:
        v.update(m)
        _write(j, v)
    return v


def _measure_all():
    with MEASURE_LOCK:
        for j in sorted(voices_home().glob("*.json")):
            _measure_one(j)


def voice_file(vid):
    if not VOICE_RE.match(str(vid or "")):
        raise ValueError("bad voice id")
    p = voices_home() / (vid + ".wav")
    if not p.is_file():
        raise FileNotFoundError(f"no voice {vid}")
    return p


def voice_add(body):
    """One's own reference: refused without the user's word that the voice's owner consented (the page shows why, in red)."""
    if body.get("consent") is not True:
        raise ValueError("a voice of one's own is kept only on your word that its owner consented: cloning a voice without consent is a crime "
                         "in many countries, and the responsibility is yours")
    name = " ".join(str(body.get("name") or "").split())[:60]
    if not name:
        raise ValueError("give the voice a name")
    text = " ".join(str(body.get("text") or "").split())[:600]
    try:
        raw = base64.b64decode(str(body.get("audio_b64") or ""), validate=True)
    except (ValueError, TypeError):
        raise ValueError("the clip did not come whole")
    if not 2000 < len(raw) <= 40 * 2 ** 20:
        raise ValueError("a clip of a few seconds, up to 40 MB")
    ext = str(body.get("ext") or "wav").lower().strip(".")
    if ext not in ("wav", "flac", "mp3", "m4a", "ogg", "opus", "aiff", "aif", "webm"):
        raise ValueError("WAV, FLAC, MP3, M4A, OGG, Opus or AIFF")
    vid = "own-" + time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    src = voices_home() / (vid + ".source." + ext)
    src.write_bytes(raw)
    out = voices_home() / (vid + ".wav")
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-t", "30", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(out)],
                       capture_output=True, text=True, timeout=300)
    src.unlink(missing_ok=True)
    if p.returncode != 0 or not out.is_file():
        raise ValueError("ffmpeg could not read it: " + (p.stderr.strip().splitlines() or ["?"])[-1])
    v = {"name": name, "lang": str(body.get("lang") or "")[:8], "text": text, "kind": "own", "made_by": "",
         "consent": {"given": True, "at": time.strftime("%Y-%m-%d %H:%M"), "how": "the user's own word in the Reader, under the warning"}}
    _write(voices_home() / (vid + ".json"), v)
    with MEASURE_LOCK:
        _measure_one(voices_home() / (vid + ".json"))
    _say(f"a voice of one's own kept: {name} ({vid}), on the user's word of consent")
    return next((r for r in _voice_rows() if r["id"] == vid), {"id": vid})


def voice_remove(body):
    vid = str(body.get("id") or "")
    wav = voice_file(vid)
    gone = voices_home().parent / "voices-removed"
    gone.mkdir(exist_ok=True)
    for f in (wav, wav.with_suffix(".json")):
        if f.exists():
            shutil.move(str(f), str(gone / f.name))
    _say(f"the voice {vid} put aside (reader/voices-removed/)")
    return {"ok": True, "id": vid}


# ---------------------------------------------------------------- cards
def cards():
    try:
        s = H["gpus_state"]()
    except Exception:                                    # noqa: BLE001  the cards unread: Auto and the processor still offered
        s = {}
    names = {c.get("index"): c.get("name") for c in s.get("cards") or []}
    jobs = [i for i in (s.get("roles") or {}).get("jobs") or [] if i in names]
    return {"cuda": [{"index": i, "name": names[i]} for i in jobs],
            "arc": [{"index": a.get("index"), "name": a.get("name"), "studio": s.get("studio_now") == a.get("index")} for a in s.get("arc") or []],
            "studio": s.get("studio_now")}


# ---------------------------------------------------------------- text into pieces
END = re.compile(r"[.!?…]+[\"»”’)\]]*(?=\s)")
SPEAKER = re.compile(r"^\s*([^\s:<>|\d\[][^:<>|\n]{0,39}?)\s*[:：]\s*(.*)$")
VERSE_HEAD = re.compile(r"^\s*(?:[1-4]?[A-Za-zА-Яа-яЁёІіЇїЄєҐґЎў]{1,6}\.?\s+\d{1,3}:\d{1,3}|\d{1,3})[\s.:)]\s*")
STRONG = re.compile(r"\s*\[\d{1,5}\]")
# HERESY 2334 (Viktor 08.11.2026: «теги пауз [pause:600ms] и [pause:6s]… потом сторож и полуручная доводка: режем копию и удлиняем паузы до
# сотой секунды»): a pause written in the text ends its piece there and stands after it to the hundredth of a second, as heard (the quiet the
# trim leaves at the pieces' edges counted in): «[pause:600ms]», «[pause:6s]», «[pause:1.25s]», a bare number in seconds. The Studio's own tag,
# never an engine's (an engine's [pause] or [long pause] stays its own): the engine reads up to it as a phrase of its own, the silence is ours.
PAUSE_RE = re.compile(r"\[\s*pause\s*:\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(ms|s)?\s*\]", re.I)
PAUSE_MIN, PAUSE_MAX = 0.05, 60.0
MARK = re.compile(r"\x00(\d+(?:\.\d+)?)\x00")
MARK_SPLIT = re.compile(r"(\x00\d+(?:\.\d+)?\x00)")


def pause_s(m):
    """A pause tag's length in seconds, to the hundredth, within PAUSE_MIN..PAUSE_MAX."""
    v = float(m.group(1).replace(",", "."))
    v = v / 1000.0 if (m.group(2) or "s").lower() == "ms" else v
    return round(min(PAUSE_MAX, max(PAUSE_MIN, v)), 2)


def _marked(text):
    """The text with each pause tag as a mark the cutting keeps whole (a NUL, its seconds, a NUL)."""
    return PAUSE_RE.sub(lambda m: f" \x00{pause_s(m)}\x00 ", text)


# HERESY 2344 (the unified plan of 08.11.2026, the Reader's long form: «главы как дубли одной книги, один голос через всю книгу»; Viktor 08.11.2026:
# «тег [split] для очень длинных текстов: сегменты генерируются отдельными батчами под ОДНОЙ карточкой Библиотеки, с древом отец/сын по ним»):
# a text with [split] in it is a book. One run reads every part in turn, so one voice holds through the book (the anchor of its first long piece);
# each part then lands as a run and a take of its own (fixed piece by piece as any), the book's one gain on every part (one level through it),
# each part the child of the part before it in the family tree, filed in a section of the workspace named after the book.
SPLIT_RE = re.compile(r"\[\s*split\s*\]", re.I)
PARTS_MAX = 200


def _part_title(text, k):
    """A part's name: its first line when that is a heading (80 characters at most, no sentence's end, no speaker, a blank line after it or
    nothing), its bracketed tags left out; else «part K»."""
    lines = [x.strip() for x in str(text or "").strip().splitlines()]
    first = lines[0] if lines else ""
    if first and len(first) <= 80 and not re.search(r"[.!?…:;,]$", first) and not SPEAKER.match(first) and (len(lines) == 1 or lines[1] == ""):
        return " ".join(re.sub(r"\[[^\[\]\n]{0,80}\]", " ", first).split())[:80] or f"part {k}"
    return f"part {k}"


def sentences(par):
    out = []
    for chunk in MARK_SPLIT.split(par):                  # HERESY 2334: a pause's mark stands as a sentence of its own
        if MARK.fullmatch(chunk):
            out.append(chunk)
            continue
        at = 0
        for m in END.finditer(chunk):
            s = chunk[at:m.end()].strip()
            if s:
                out.append(s)
            at = m.end()
        if chunk[at:].strip():
            out.append(chunk[at:].strip())
    return out


def _cap(s, cap):
    """A sentence longer than the engine takes, cut where a comma, a semicolon, a colon or a dash lets it, else at a space."""
    out = []
    while len(s) > cap:
        cut = max(s.rfind(x, 0, cap) for x in (", ", "; ", ": ", " — ", " – "))
        if cut < cap // 3:
            cut = s.rfind(" ", 0, cap)
        if cut <= 0:
            cut = cap
        out.append(s[:cut + 1].strip())
        s = s[cut + 1:].strip()
    if s:
        out.append(s)
    return out


def _gather(sents, target, cap):
    out, cur = [], ""
    for s in sents:
        if MARK.fullmatch(s):                            # HERESY 2334: a pause ends the piece, its mark riding on it
            if cur:
                out.append(cur + " " + s)
                cur = ""
            else:
                out.append(s)                            # no words before it here: pieces() gives it to the piece before
            continue
        for part in _cap(s, cap):
            if cur and len(cur) + 1 + len(part) > target:
                out.append(cur)
                cur = part
            else:
                cur = (cur + " " + part).strip()
    if cur:
        out.append(cur)
    return out


def speakers(text):
    """A dialog's speakers in the order they first speak: lines «Name: words» (a name of up to four words, never starting in lower case, so a
    sentence with a colon in it is not one); a line without a name goes on the turn before it."""
    seen = []
    for line in str(text or "").splitlines():
        m = SPEAKER.match(line)
        if m and len(m.group(1).split()) <= 4 and not m.group(1)[0].islower() and m.group(1).strip() not in seen:   # a name: no lower-case start
            seen.append(m.group(1).strip())
    return seen[:SPEAKERS_MAX]


def pieces(text, mode, split, eng, tags_on, gap, turn_gap, para_gap):
    """[{i, speaker, text, plain, gap}]: what each call reads, the words without tags (a reference's own words), the silence after it."""
    strip = lambda s: " ".join(eng["tag_re"].sub(" ", s).split())
    cap, out = eng["max_chars"], []

    def add(spk, s, after):
        marks = [float(x) for x in MARK.findall(s)]      # HERESY 2334: a pause written after these words
        s = MARK.sub(" ", s)
        plain = strip(s)
        if not plain:
            if marks and out:                            # a pause with no words of its own: the piece before waits that long (pauses add up)
                out[-1]["pause"] = round(min(PAUSE_MAX, float(out[-1].get("pause") or 0) + sum(marks)), 2)
                out[-1]["gap"] = out[-1]["pause"]
            elif marks:
                lead.append(sum(marks))
            return
        out.append({"i": len(out), "speaker": spk, "text": " ".join(s.split()) if tags_on else plain, "plain": plain, "gap": after})
        if marks:
            out[-1]["pause"] = out[-1]["gap"] = round(min(PAUSE_MAX, sum(marks)), 2)

    lead = []                                            # HERESY 2334: a pause before the first words
    text = _marked(str(text or "").replace("\r\n", "\n").replace("\r", "\n"))
    if mode == "dialog":
        turns, names = [], speakers(text)
        for line in text.split("\n"):
            m = SPEAKER.match(line)
            if m and m.group(1).strip() in names:
                turns.append([m.group(1).strip(), m.group(2)])
            elif line.strip():
                if turns:
                    turns[-1][1] += " " + line.strip()
                else:
                    turns.append(["", line.strip()])
        for spk, words in turns:
            parts = _gather(sentences(words), cap, cap)
            for k, s in enumerate(parts):
                add(spk, s, gap if k < len(parts) - 1 else turn_gap)
    elif split == "verse":
        for line in text.split("\n"):
            s = STRONG.sub("", VERSE_HEAD.sub("", VERSE_HEAD.sub("", line, count=1), count=1)).strip()   # a verse number, then an address
            if s:
                for seg in MARK_SPLIT.split(s):          # HERESY 2334: a pause inside a verse ends a piece there
                    if MARK.fullmatch(seg):
                        add("", seg, gap)
                    elif seg.strip():
                        for part in _cap(seg.strip(), cap):
                            add("", part, gap)
    else:
        for par in re.split(r"\n\s*\n", text):
            parts = _gather(sentences(" ".join(par.split())), min(TARGET, cap), cap)
            for k, s in enumerate(parts):
                add("", s, gap if k < len(parts) - 1 else para_gap)
    if out and out[-1].get("pause") is None:            # HERESY 2334: a pause written at the very end stays (room for music after it)
        out[-1]["gap"] = 0.0
    if out and lead:                                     # a pause before the first words: silence before the take's first piece
        out[0]["lead_pause"] = round(min(PAUSE_MAX, sum(lead)), 2)
    return out


def drifted(target, f0):
    """A piece read in another gender than its voice (pYIN's medians): a man's voice (under 160 Hz) read above 190 Hz and above 1.7 times itself,
    or a woman's read under 140 Hz and under itself / 1.6. The ten-voice probe of 07.11 read its second man (97 Hz by pYIN) at 246 Hz in two turns
    of three (his ear: «второй голос оказался женщиной»); a shout or a whisper stays inside these bounds."""
    if not target or not f0:
        return False
    return f0 > max(190.0, target * 1.7) if target < 160 else f0 < min(140.0, target / 1.6)


# ---------------------------------------------------------------- the worker
class Worker:
    def __init__(self, eng, device, card, tier=None):
        env = dict(os.environ, HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", PYTHONUNBUFFERED="1",
                   HF_HOME=str(kit() / "hf_cache"))
        env.pop("ONEAPI_DEVICE_SELECTOR", None)
        if device == "cuda":
            env.update(CUDA_VISIBLE_DEVICES=str(card), CUDA_DEVICE_ORDER="PCI_BUS_ID")
        elif device == "xpu":                            # the N-th Intel card; its kernel cache never kept (arc-b50: a stale one hangs it)
            env.update(CUDA_VISIBLE_DEVICES="", ONEAPI_DEVICE_SELECTOR=f"level_zero:{card - ARC_BASE}", SYCL_CACHE_PERSISTENT="0")
        else:
            env.update(CUDA_VISIBLE_DEVICES="")
        if tier:                                         # HERESY 2263: the quant and its split, for the engine's load
            env["READER_TIER"] = json.dumps(tier)
        self.key, self.device, self.card, self.label = (eng["id"], device, card, (tier or {}).get("id", "")), device, card, eng["label"]
        self.p = subprocess.Popen([eng["python"][device], str(HERE / "reader_worker.py"), "--module", eng["module"], "--device", device,
                                   "--kit", str(kit())], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                  encoding="utf-8", bufsize=1, env=env, cwd=str(kit()), start_new_session=True)
        self.q, self.err, self.n, self.busy, self.used = queue.Queue(), collections.deque(maxlen=400), 0, True, time.time()
        threading.Thread(target=self._out, daemon=True).start()
        threading.Thread(target=self._errs, daemon=True).start()

    def _out(self):
        for line in self.p.stdout:
            try:
                self.q.put(json.loads(line))
            except ValueError:
                self.err.append(line.rstrip()[:400])
        self.q.put(None)

    def _errs(self):
        for line in self.p.stderr:
            self.err.append(line.rstrip()[:400])

    def tail(self, n=6):
        return stderr_why(list(self.err), n)             # HERESY 2375: the cause first, then the last lines (four lines lost a Traceback's cause)

    def _get(self, timeout):
        try:
            m = self.q.get(timeout=timeout)
        except queue.Empty:
            raise RuntimeError(f"its worker said nothing for {timeout} s")
        if m is None:
            raise RuntimeError("its worker ended: " + (self.tail() or "no word"))
        return m

    def ready(self):
        m = self._get(LOAD_S)
        if m.get("event") != "ready":
            raise RuntimeError(m.get("error") or "the engine did not load")
        return m

    def ask(self, req, timeout=PIECE_S):
        self.n += 1
        req["id"] = self.n
        self.p.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
        self.p.stdin.flush()
        while True:
            m = self._get(timeout)
            if m.get("id") == self.n:
                return m

    def alive(self):
        return self.p.poll() is None

    def close(self):
        try:
            self.p.stdin.write('{"op": "quit"}\n')
            self.p.stdin.flush()
            self.p.wait(timeout=20)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            try:
                os.killpg(self.p.pid, 9)                 # its own session: the worker and what it started, nothing else
            except OSError:
                pass


W = {"w": None}
W_LOCK = threading.Lock()


def _worker(eng, device, card, tier=None):
    """The worker for this engine on this device (and tier), the kept one when it matches, else a new one (the old let go first)."""
    with W_LOCK:
        w = W["w"]
        if w and w.alive() and w.key == (eng["id"], device, card, (tier or {}).get("id", "")):
            w.busy = True
            return w, False
        if w:
            W["w"] = None
            w.close()
        w = Worker(eng, device, card, tier)
        W["w"] = w
    try:
        m = w.ready()
    except Exception:
        with W_LOCK:
            if W["w"] is w:
                W["w"] = None
        w.close()
        raise
    _say(f"{eng['label']} loaded on " + ("GPU " + str(card) if device == "cuda" else "the Intel card" if device == "xpu" else "the processor") +
         (f" ({tier['quant']})" if tier else "") + f" in {m.get('load_s')} s")
    return w, True


def _release(w, keep):
    with W_LOCK:
        w.busy, w.used = False, time.time()
        if not keep and W["w"] is w:
            W["w"] = None
            w.close()


def _reaper():
    while True:
        time.sleep(15)
        with W_LOCK:
            w = W["w"]
            if w and not w.busy and (not w.alive() or time.time() - w.used > IDLE_S):
                W["w"] = None
                w.close()
                _say(f"{w.label} let its card go (idle {IDLE_S} s)")


def unload():
    """The kept worker let go now (a card wanted for something else)."""
    with W_LOCK:
        w = W["w"]
        if w and not w.busy:
            W["w"] = None
            w.close()
            return {"ok": True, "freed": True}
    return {"ok": True, "freed": False}


def _held():
    """{card: MiB} the kept, idle worker holds: its own memory, counted free for a run of the same engine there (as the Artist's kept painters)."""
    w = W["w"]
    if not w or w.busy or not w.alive() or w.device != "cuda":
        return {}
    try:
        a = subprocess.run(["nvidia-smi", "--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=20)
        mb = sum(int(r.split(",")[1]) for r in a.stdout.strip().splitlines() if _in_session(r.split(",")[0].strip(), w.p.pid))
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return {}
    return {w.card: mb} if mb else {}


def _in_session(pid, leader):
    """HERESY 2263: a process of the worker's own session (the worker, or the server an engine started under it)."""
    try:
        return int(pid) == leader or os.getpgid(int(pid)) == leader
    except (OSError, ValueError):
        return False


# ---------------------------------------------------------------- HERESY 2266: the ear and its score
def _el_sound(s):
    """HERESY 2311: a Greek word as it sounds, in Latin letters (s already lowercase, its marks off). Whisper writes Greek by ear: η, υ, ει, οι for
    one [i], αι for [e], ω for [o] (46 words flagged in Claude's card read in Greek on 10.11, most of them «λέη» for «λέει», «είνε» for «είναι»).
    A Latin word inside the Greek text (Viktor, SUNO, Ruach, credits) is heard back in Greek letters («Βίκτορ», «Σούνο», «ρουάχ»), and Whisper
    sometimes writes a Greek word in Latin («λόgos»): both sides go to one key. A letter of a script no reading of ours has (Whisper's slips for γ:
    «πληκτρολοぎου», «έغραψε») drops out; Hebrew and Cyrillic stay, for word_diff to compare by their consonants (_skeleton)."""
    s = re.sub(r"[a-z]+", lambda m: _lat_sound(m.group(0)), s)
    for a, b in (("ου", "u"), ("αι", "e"), ("ει", "i"), ("οι", "i"), ("υι", "i"), ("αυ", "av"), ("ευ", "ev"), ("ηυ", "iv"), ("μπ", "b"),
                 ("ντ", "d"), ("γκ", "g"), ("γγ", "g"), ("τσ", "ts"), ("τζ", "dz")):
        s = s.replace(a, b)
    s = s.translate(EL2LAT)
    s = "".join(c for c in s if "a" <= c <= "z" or not c.isalpha() or 0x0400 <= ord(c) <= 0x04FF or 0x0590 <= ord(c) <= 0x05FF)
    return re.sub(r"(.)\1+", r"\1", s)


def _lat_sound(w):
    """A Latin word as a Greek reader says it, in the same key as _el_sound: ch [x], th, ph [f], c/q [k], w [v], y [i], a silent final e."""
    for a, b in (("ch", "h"), ("ph", "f"), ("ck", "k"), ("au", "o"), ("ou", "u"), ("ee", "i"), ("oo", "u"), ("c", "k"), ("q", "k"), ("w", "v"),
                 ("x", "ks"), ("y", "i"), ("j", "i")):
        w = w.replace(a, b)
    return w[:-1] if len(w) > 3 and w.endswith("e") and w[-2] not in "aeiou" else w


def _he_latin(w):
    """HERESY 2311: a Latin word inside a Hebrew text (SUNO, Anthropic) as Whisper writes it back in Hebrew letters: its consonants, a vowel at its
    start as א, i/y as י, o/u as ו, a and e left out («ל-SUNO» heard «לסונו», «Anthropic» heard «אנתרופיק»)."""
    for a, b in (("sh", "ש"), ("ch", "ח"), ("th", "ת"), ("ph", "פ"), ("ck", "ק"), ("ts", "צ")):
        w = w.replace(a, b)
    w = re.sub(r"^[aeiou]", "א", w)
    return w.translate(LAT2HEB)


def _script(k):
    """HERESY 2311: the scripts a word's key is written in (cyr, el, he, lat; a key of digits has none), so a word of a third script is told
    even where the text's own fold put a few of its letters into the text's script (ι, ο, α, ε and ה, ו into Cyrillic)."""
    out = set()
    for c in k:
        o = ord(c)
        if 0x0400 <= o <= 0x04FF:
            out.add("cyr")
        elif 0x0370 <= o <= 0x03FF or 0x1F00 <= o <= 0x1FFF:
            out.add("el")
        elif 0x0590 <= o <= 0x05FF:
            out.add("he")
        elif c.isalpha():
            out.add("lat")
    return frozenset(out)


def _skeleton(k):
    """HERESY 2311 (Viktor 10.11.2026: «Не транслитерируй ничего для Чтеца. Пусть всё идёт на своих глифах»): a word of a third script in the text
    (Αἵρεσις in a Russian reading, וְרוּחַ in a Greek one) is heard back in the text's own letters; the two are compared by their consonants in
    Latin, the vowels and the letters that are vowels in Hebrew (א ה ו י ע inside a word) left out, so a name read right is no swap and a
    word dropped or put in still counts."""
    out = []
    for i, c in enumerate(k):
        if c in "וי" and i == 0:
            out.append("v" if c == "ו" else "")
            continue
        out.append(SKEL.get(c, "" if c in "aeiouyаеиоуыэюяєіїёйαεηιουωאהוייע" else c if "a" <= c <= "z" else ""))
    s = "".join(out).replace("ch", "h").replace("kh", "h").replace("ph", "f").replace("th", "t").replace("ks", "x").replace("ts", "c")
    return re.sub(r"(.)\1+", r"\1", s)


def _letters(s, lang):
    """The letters of a text for the score: lowercase, the marks off (the acute too: a key compared, never a text read or kept), the punctuation
    and the spaces off; ё/э/ы folded in Russian and Ukrainian as the probes' scorer does; Greek by its sound (_el_sound); in Hebrew a Latin word
    in Hebrew letters and the final forms folded (HERESY 2311)."""
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = unicodedata.normalize("NFC", "".join(c for c in s if unicodedata.category(c) != "Mn"))
    if lang in ("ru", "uk", "be", "el"):
        s = s.translate(HEAR_MAP)
    if lang in ("ru", "uk", "be"):
        s = s.translate(LAT2CYR).translate(HEAR_MAP)
    s = re.sub(r"[\W_]+", "", s)
    if lang == "el":
        s = _el_sound(s)
    elif lang == "he":
        s = re.sub(r"[a-z]+", lambda m: _he_latin(m.group(0)), s).translate(HE_FOLD)
    return s


def _ed(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (x != y))
    return d[len(b)]


def score(ref, heard, lang):
    """(CER, edits, letters) of what Whisper heard against what the engine was asked to read; (None, 0, n) for a piece too short to score."""
    r, h = _letters(ref, lang), _letters(heard, lang)
    if len(r) < CER_MIN_CHARS:
        return None, 0, len(r)
    e = _ed(r, h)
    return round(e / len(r), 4), e, len(r)


def _word_keys(text, lang):
    """HERESY 2295: the words of a text as the score sees them (the same _letters: the acute off, ё/э/ы and Latin folded, the glyph map's letters
    folded, the punctuation off), each with its own form for the report; a token left with no letters (a dash) is no word. A hyphen between
    letters parts the words on both sides (HERESY 2311: Whisper wrote «Γραμμή-Γραμμή» for «γραμμή γραμμή», «ל-SUNO» stays «ל» + «SUNO»)."""
    out = []
    for tok in re.sub(r"(?<=\w)[-‐‑](?=\w)", " ", str(text or "")).split():
        k = _letters(tok, lang)
        if k:
            out.append((k, tok.strip(".,;:!?…—–-«»\"“”„()[]")))
    return out


def word_diff(ref, heard, lang):
    """HERESY 2295 (Viktor 09.11.2026, the blind test of Drama 3's quants: three takes with a word that is not in the text, «прОбыв», «пувО»,
    «пашидИм» after «глубоко» at 0:11, heard by Whisper at 1.5–2.6 % of letters off, far under the 12 % line): Whisper's words aligned to the
    text's words. Each word INSERTED or DROPPED is an error, and a content word heard as another word (SWAP_MIN letters, SWAP_FAR of them off);
    a word Whisper split or joined («кто то» for «кто-то») is none, nor a slip of a letter, nor a number in figures on one side only (the
    letters' score keeps those). `heard` is Whisper's words with their times ([start, end, word]) or its text. {"errors": n, "why": [...]} with
    each why {"kind": inserted|dropped|swapped, "word": …, "as": …, "t": seconds in the piece or None}."""
    r = _word_keys(ref, lang)
    if isinstance(heard, list):
        h = []
        for w in heard:
            for k, tok in _word_keys(w[2], lang):
                h.append((k, tok, float(w[0])))
    else:
        h = [(k, tok, None) for k, tok in _word_keys(heard, lang)]
    n, m = len(r), len(h)

    def sub(a, b):
        if a == b:
            return 0.0
        if _script(a) != _script(b):                     # HERESY 2311: a word of another script heard in the text's own: their consonants
            a, b = _skeleton(a), _skeleton(b)
            if not a or not b:
                return 0.0 if a == b else 1.0
        return min(1.0, _ed(a, b) / max(len(a), len(b)))

    D = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        D[i][0] = float(i)
    for j in range(1, m + 1):
        D[0][j] = float(j)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i][j] = min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + sub(r[i - 1][0], h[j - 1][0]))
    ops, i, j = [], n, m                                 # back from the end: ("=", i, j) the same word, ("s", i, j), ("d", i, None), ("i", None, j)
    while i or j:
        if i and j and abs(D[i][j] - D[i - 1][j - 1] - sub(r[i - 1][0], h[j - 1][0])) < 1e-9:
            ops.append(("=" if r[i - 1][0] == h[j - 1][0] else "s", i - 1, j - 1))
            i, j = i - 1, j - 1
        elif i and abs(D[i][j] - D[i - 1][j] - 1) < 1e-9:
            ops.append(("d", i - 1, None))
            i -= 1
        else:
            ops.append(("i", None, j - 1))
            j -= 1
    ops.reverse()
    why, k = [], 0
    while k < len(ops):                                  # each run of differences between two words heard as written, judged as one
        if ops[k][0] == "=":
            k += 1
            continue
        e = k
        while e < len(ops) and ops[e][0] != "=":
            e += 1
        run, k = ops[k:e], e
        rs = "".join(r[x[1]][0] for x in run if x[1] is not None)
        hs = "".join(h[x[2]][0] for x in run if x[2] is not None)
        if rs == hs or (rs and hs and any(x[0] != "s" for x in run) and _ed(rs, hs) <= 1):
            continue                                     # split or joined, at most a letter off
        if re.search(r"\d", rs + hs):
            continue                                     # a number in figures: the letters' score has it
        if e == len(ops) and all(x[0] == "i" for x in run) and (hs in {_letters(x, lang) for x in SIGN_OFF.get(lang, ())}
                                                               or any(hs.startswith(_letters(x, lang)) for x in SIGN_CREDIT)):
            continue                                     # HERESY 2311: Whisper's own sign-off on a piece's trailing quiet, no word read
        prev_t = next((h[x[2]][2] for x in reversed(ops[:e - len(run)]) if x[2] is not None), None)
        next_t = next((h[x[2]][2] for x in ops[e:] if x[2] is not None), None)
        for op, a, b in run:
            if op == "i":
                why.append({"kind": "inserted", "word": h[b][1], "t": h[b][2]})
            elif op == "d":
                why.append({"kind": "dropped", "word": r[a][1], "t": next_t if next_t is not None else prev_t})
            elif len(r[a][0]) >= SWAP_MIN and sub(r[a][0], h[b][0]) >= SWAP_FAR:
                why.append({"kind": "swapped", "word": r[a][1], "as": h[b][1], "t": h[b][2]})
    home = _script(_letters(HOME_WORD.get(lang, "a"), lang))     # HERESY 2311: a word of a third script and what was heard for it, kept apart
    far = [x for x in ops if x[1] is not None and _script(r[x[1]][0]) != home]
    return {"errors": len(why), "why": why, "far_ref": [r[x[1]][1] for x in far],
            "far_heard": [h[x[2]][1] for x in far if x[2] is not None]}


def score_near(ref, heard, lang, wd):
    """HERESY 2311: the letters' score with the words of a third script left out on both sides (Αἵρεσις in a Russian reading and the «Хайресис»
    Whisper wrote for it): a word read right in other letters is no edit of the text's own, and word_diff judges it by its consonants."""
    if not wd.get("far_ref"):
        return score(ref, heard, lang)

    def without(text, words):
        left = list(words)
        out = []
        for tok in re.sub(r"(?<=\w)[-‐‑](?=\w)", " ", str(text or "")).split():
            t = tok.strip(".,;:!?…—–-«»\"“”„()[]")
            if t in left:
                left.remove(t)
                continue
            out.append(tok)
        return " ".join(out)
    return score(without(ref, wd["far_ref"]), without(heard, wd["far_heard"]), lang)


WHY_RE = re.compile(r"Traceback|Error\b|error:|exception|what\(\)|terminate|abort|killed|out of memory|No such file|not found|cannot|failed", re.I)


def stderr_why(lines, keep=6):
    """HERESY 2375 (his question of 10.11, why the Narrator fell on English: three lines of stderr lost the cause): a helper's last words for an
    error, up to four distinct lines that say why (a Traceback, an …Error, an exception, out of memory…) first, then «…» and its last lines; a
    traceback's own frames («  File …», «    code») never stand for the cause."""
    lines = [x.rstrip() for x in lines if x and x.strip()]
    frame = re.compile(r"^\s+(File \"|\S)")
    tail = lines[-keep:]
    why = list(dict.fromkeys(x.strip() for x in lines[:-keep] if WHY_RE.search(x) and not frame.match(x)))[-4:]
    return " | ".join(why + (["…"] if why else []) + tail)[:1400]


class Hearer:
    """The run's ear: reader_hear.py in the lab's own Python, Whisper on the processor, pieces handed over as they are read and heard in their
    order while the engine reads the next ones. A failure is kept in .error and said; a piece it could not hear has no score, never a clean one."""

    def __init__(self, lang, tag_re, threads=HEAR_THREADS):
        self.lang, self.tag_re, self.res, self.error, self.q = lang, tag_re, {}, "", queue.Queue()
        self.err, self.pending, self.lock = collections.deque(maxlen=200), 0, threading.Lock()
        model = paths.at(paths.WHISPER, kit()) / "whisper-large-v3-ct2-float16"
        self.p = None
        if not model.is_dir():
            self.error = "Whisper large-v3 is not in " + paths.WHISPER + "/ on this machine"
            return
        self.p = subprocess.Popen([sys.executable, str(HERE / "reader_hear.py"), "--model", str(model), "--threads", str(threads)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1,
                                  env=dict(os.environ, CUDA_VISIBLE_DEVICES="", PYTHONUNBUFFERED="1"), cwd=str(kit()), start_new_session=True)
        threading.Thread(target=self._errs, daemon=True).start()
        threading.Thread(target=self._run, daemon=True, name="reader-ear").start()

    def _errs(self):
        for line in self.p.stderr:
            self.err.append(line.rstrip()[:300])

    def _line(self):
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError("the ear ended: " + stderr_why(list(self.err)))
        return json.loads(line)

    def _run(self):
        try:
            m = self._line()
            if m.get("event") != "ready":
                raise RuntimeError(m.get("error") or "Whisper did not load")
            while True:
                item = self.q.get()
                if item is None:
                    break
                i, wav, ref = item
                self.p.stdin.write(json.dumps({"id": i, "wav": wav, "lang": self.lang, "nodigits": not re.search(r"\d", ref), "beam": HEAR_BEAM},
                                              ensure_ascii=False) + "\n")
                self.p.stdin.flush()
                a = self._line()
                with self.lock:
                    if a.get("ok"):
                        c, e, n = score(ref, a["text"], self.lang)
                        self.res[i] = {"heard": a["text"][:400], "cer": c, "edits": e, "letters": n, "s": a.get("s"),
                                       "words": (a.get("words") or [])[-8:]}   # HERESY 2335: the last words' times, for the tail guard
                        if c is not None:                # HERESY 2295: the words too, where the piece is long enough to score
                            wd = word_diff(ref, a.get("words") or a["text"], self.lang)
                            self.res[i].update(werr=wd["errors"], why=wd["why"][:8])
                            if wd["far_ref"]:            # HERESY 2311: the letters scored without the words of a third script
                                c2, e2, n2 = score_near(ref, a["text"], self.lang, wd)
                                if c2 is not None:
                                    self.res[i].update(cer=c2, edits=e2, letters=n2, far=wd["far_ref"][:6])
                    else:
                        self.res[i] = {"error": str(a.get("error"))[:200]}
                    self.pending -= 1
        except (OSError, ValueError, RuntimeError) as e:
            with self.lock:
                self.error = self.error or str(e)[:300]
                self.pending = 0
        finally:
            self.close()

    def ref(self, said):
        """What the engine was asked to read, its tags taken out: the words the ear compares (a furtive patach's alef taken out again, 2375)."""
        return " ".join(FURTIVE_BACK.sub("", self.tag_re.sub(" ", said or "")).split())

    def put(self, i, wav, said):
        if self.p is None or self.error:
            return
        with self.lock:
            self.pending += 1
            self.res.pop(i, None)
        self.q.put((i, str(wav), self.ref(said)))

    def wait(self, job, timeout=HEAR_S * 4):
        """Until every piece handed over is heard (or the ear failed, or the run was stopped); False when it ran out of time."""
        t0 = time.time()
        while True:
            with self.lock:
                if self.pending <= 0 or self.error:
                    return True
            if job.get("cancel"):
                raise H["cancelled"]("stopped")
            if time.time() - t0 > timeout:
                return False
            time.sleep(0.5)

    def close(self):
        if self.p is not None and self.p.poll() is None:
            try:
                self.q.put(None)
                self.p.stdin.write('{"op": "quit"}\n')
                self.p.stdin.flush()
                self.p.wait(timeout=20)
            except (OSError, ValueError, subprocess.TimeoutExpired):
                try:
                    os.killpg(self.p.pid, 9)
                except OSError:
                    pass


def _take_t(p, t):
    """HERESY 2295: a time inside a piece's reading as a time in the take (its place in the take less the silence trimmed before it)."""
    if t is None or not isinstance(p.get("at"), list):
        return None
    return round(max(float(p["at"][0]), float(p["at"][0]) + float(t) - float(p.get("lead") or 0)), 2)


def _mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def _why_text(why, p=None):
    """The words a piece was read again for, said in English for the log and the take's note: «inserted “пуво” at 0:11.2»."""
    out = []
    for x in why:
        t = _take_t(p, x.get("t")) if p is not None else x.get("t")
        at = f" at {_mmss(t)}" if t is not None else ""
        out.append(f"“{x['word']}” heard as “{x.get('as', '')}”{at}" if x["kind"] == "swapped" else f"{x['kind']}: “{x['word']}”{at}")
    return ", ".join(out)


def reread_why(run):
    """HERESY 2295: for the run card, each piece read again: which, why (its words with their times in the take, or its letters), the reading
    kept of how many."""
    out = []
    for p in run.get("pieces") or []:
        rr = p.get("reread")
        if not isinstance(rr, dict):
            continue
        why = [dict(kind=x["kind"], word=x["word"], heard=x.get("as"), at=_take_t(p, x.get("t"))) for x in (rr.get("why") or [])[:4]]
        out.append({"piece": p["i"] + 1, "why": why, "cer": rr.get("cer_first"), "kept": rr.get("kept_read") or (2 if rr.get("kept") == "again" else 1),
                    "reads": rr.get("reads") or 2})
    return out[:12]


def _off(r):
    """HERESY 2295: why a heard piece is read again: its words (inserted, dropped, a content word swapped) or its letters (2266's line)."""
    if r.get("cer") is None:
        return False
    return bool(r.get("werr")) or (r["cer"] >= CER_REREAD and r["edits"] >= CER_EDITS)


def _rank(r):
    """The better of a piece's readings: fewer word errors, then fewer letters off."""
    return (r.get("werr") or 0, r["cer"] if r.get("cer") is not None else 9.0)


def _hear_pass(d, run, eng, w, hearer, reqs, job):
    """After the engine read every piece: wait for the ear, then each piece heard off its words (HERESY 2295: a word inserted, dropped or
    swapped, or 2266's letters) read again with another seed, up to READS_MAX readings in all, the best kept (fewest word errors, then the
    fewest letters off; its first reading kept beside as piece-NNN.first.wav when another wins). Each piece keeps its score and why it was read
    again (p["reread"]: the first reading's words, every reading's score, the one kept); the run its whole score and its re-reads."""
    job["label"] = f"{run['title'][:40]} · Whisper"
    if not hearer.wait(job):
        hearer.error = hearer.error or "Whisper did not finish hearing in time"
    bad = [i for i, r in sorted(hearer.res.items()) if _off(r)]
    rereads = 0
    for i in bad:
        p, first = run["pieces"][i], dict(hearer.res[i])
        target = p.get("f0") if isinstance(p.get("f0"), float) else None
        reads, best, best_k, best_m = [first], first, 0, None
        for k in range(1, READS_MAX):
            if job.get("cancel"):
                raise H["cancelled"]("stopped")
            req = dict(reqs[i], opts=dict(reqs[i]["opts"], seed=reqs[i]["opts"]["seed"] + 5000 * k))
            req.pop("keep", None)
            retry = d / f"piece-{i:03d}.retry{k}.wav"
            req["out"] = str(retry)
            what = (f"{first['werr']} word(s) off ({_why_text(first['why'][:2])})" if first.get("werr")
                    else f"{first['cer'] * 100:.0f} % of its letters off")
            _say(f"{run['id']} · piece {i + 1}: Whisper heard {what}, reading {k + 1} of {READS_MAX} with another seed")
            m = w.ask(req)
            if not m.get("ok"):
                break
            hearer.put(i, retry, p.get("said") or p["text"])
            hearer.wait(job)
            again = dict(hearer.res.get(i) or {})
            if again.get("cer") is None or drifted(target, m.get("f0")):
                reads.append(dict(again, drifted=True) if again.get("cer") is not None else again)
                retry.unlink(missing_ok=True)
                continue
            reads.append(again)
            if _rank(again) < _rank(best):
                if best_k:
                    (d / f"piece-{i:03d}.retry{best_k}.wav").unlink(missing_ok=True)
                best, best_k, best_m = again, k, (m, req["opts"]["seed"])
            else:
                retry.unlink(missing_ok=True)
            if not _off(best):
                break
        if best_k:
            os.replace(_piece_path(d, i), d / f"piece-{i:03d}.first.wav")
            os.replace(d / f"piece-{i:03d}.retry{best_k}.wav", _piece_path(d, i))
            m, seed = best_m
            p.update(seconds=m.get("seconds"), gen_s=round(float(p.get("gen_s") or 0) + float(m.get("gen_s") or 0), 2), seed_used=seed)
        hearer.res[i] = best
        p["reread"] = {"cer_first": first["cer"], "cer_again": reads[1].get("cer") if len(reads) > 1 else None,
                       "kept": "again" if best_k else "first", "kept_read": best_k + 1, "reads": len(reads),
                       "why": first.get("why") or [], "scores": [{"cer": x.get("cer"), "werr": x.get("werr")} for x in reads]}
        rereads += 1
    tot_e = tot_n = 0
    for i, r in hearer.res.items():
        p = run["pieces"][i]
        p["cer"], p["heard"] = r.get("cer"), r.get("heard")
        if r.get("werr") is not None:
            p["werr"], p["why"] = r["werr"], r.get("why") or []
        if r.get("error"):
            p["hear_error"] = r["error"]
        if r.get("cer") is not None:
            tot_e, tot_n = tot_e + r["edits"], tot_n + r["letters"]
    run["cer"] = round(tot_e / tot_n, 4) if tot_n else None
    run["heard"] = sum(1 for r in hearer.res.values() if r.get("cer") is not None)
    run["rereads"] = rereads
    if hearer.error:
        run["hear_error"] = hearer.error
        _say(f"{run['id']} · not heard by Whisper: {hearer.error}")


# ---------------------------------------------------------------- HERESY 2335: the guard of each piece's tail, tones and level
LEVEL_OFF = 6.0                     # a piece's speech this many dB off the run's median is said (a whisper or a shout the text did not ask)


def _tail_pass(d, run, hearer):
    """The plan's guards on every piece (08.11.2026: «высота тона; «ummm» и тоны на хвостах; громкость»), after the ear and its re-reads, on
    each piece as kept (reader_tail.py): a voice or a steady tone after its last word cut where the speech ended, the reading as read kept
    beside it (piece-NNN.tail.wav); a breath left; a steady tone under the words, a silence of a second and more inside, and a piece 6 dB
    off the run's level said, for the take's editor (read that piece again). A guard that could not look says so in the run, never a clean
    piece by silence."""
    try:
        import reader_tail as rt
        lang = run.get("lang") or "ru"
        ends_in_tag = re.compile(r"\[[^\[\]\n]{1,80}\]\W*$")
        cuts = tones = holes = 0
        for i, r in sorted(hearer.res.items()):
            p, path = run["pieces"][i], _piece_path(d, i)
            if r.get("words") is None or not path.is_file():
                continue
            res = rt.check(path, hearer.ref(p.get("said") or p["text"]), r["words"], lambda s: _letters(s, lang),
                           bool(run.get("tags")) and bool(ends_in_tag.search(p["text"])))
            p["db"] = res["db"]
            t = res.get("tail")
            if t:
                p["tail"] = t
                if t["kind"] in ("voiced", "tone") and not t.get("joined"):
                    p["seconds"] = rt.cut(path, t["cut"], d / f"piece-{i:03d}.tail.wav")
                    t["cut_done"] = True
                    cuts += 1
                    _say(f"{run['id']} · piece {i + 1}: " + (f"a tone of {t.get('hz', 0) / 1000:.1f} kHz" if t["kind"] == "tone" else "a voice")
                         + f" after its last word ({t['s']:.1f} s) cut")
            tone = res.get("tone")
            if tone and tone["from"] < (t["cut"] if t and t.get("cut_done") else 1e9) - 0.2:
                p["tone"] = tone
                tones += 1
                _say(f"{run['id']} · piece {i + 1}: a steady tone of {tone['hz'] / 1000:.1f} kHz under its words at {tone['from']:.1f} s: "
                     "read that piece again in the take's editor")
            if res.get("hole") and not re.search(r"\[[^\[\]\n]*pause[^\[\]\n]*\]", p["text"], re.I):   # an engine's own pause asked is no stall
                p["hole"] = res["hole"]
                holes += 1
        dbs = sorted(p["db"] for p in run["pieces"] if p.get("db") is not None)
        if len(dbs) >= 3:
            med = dbs[len(dbs) // 2]
            for p in run["pieces"]:
                if p.get("db") is not None and abs(p["db"] - med) >= LEVEL_OFF:
                    p["level_off"] = round(p["db"] - med, 1)
        run.update(tails=cuts, tones=tones, holes=holes, level_off=sum(1 for p in run["pieces"] if p.get("level_off") is not None))
    except Exception as e:                               # noqa: BLE001  the guard said as not done, the reading stands
        run["tail_error"] = repr(e)[:200]
        _say(f"{run['id']} · the tail guard could not look: {e!r}"[:300])


# ---------------------------------------------------------------- HERESY 2269: a recording into a script
TR_EXT = (".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus", ".aac", ".wma", ".webm", ".mp4", ".mkv", ".mov", ".avi", ".aiff", ".aif")
TR_MAX = 4 * 1024 ** 3              # a recording's bytes, at most
TR_RE = re.compile(r"^tr-\d{8}-\d{6}-[0-9a-f]{4}$")
TR_PAUSE_S = 1.2                    # a pause this long between Whisper's segments starts a new paragraph
SCRIPT_MAX = 400_000
CLEAN_MODES = ("every", "proof")    # HERESY 2376: the Writer's cleanup, every word (texts, Scripture) or as in proofreading (streams)


def transcripts_home():
    return kit() / "reader" / "transcripts"


def transcribe(body, q):
    """The recording kept as it came and heard in its own thread; {id, status}."""
    name = Path(str(q.get("file") or "recording.wav")).name[:160]
    ext = Path(name).suffix.lower()
    if ext not in TR_EXT:
        raise ValueError("a recording: " + ", ".join(x[1:].upper() for x in TR_EXT))
    if not body:
        raise ValueError("the file came empty")
    if len(body) > TR_MAX:
        raise ValueError(f"the recording is too large: {TR_MAX // 1024 ** 3} GB at most")
    lang = str(q.get("lang") or "auto").lower()
    lang = "" if lang == "auto" else lang if re.fullmatch(r"[a-z]{2,3}", lang) else ""
    with H["lock"]:
        if sum(1 for k in H["jobs"] if k.startswith("reader:tr-")) >= 3:
            raise ValueError("three recordings are being heard already: the next one when one of them is done")
    tid = "tr-" + time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    d = transcripts_home() / tid
    d.mkdir(parents=True)
    (d / ("source" + ext)).write_bytes(body)
    meta = {"id": tid, "name": name, "lang": lang, "status": "queued", "created": time.time(), "bytes": len(body)}
    _write(d / "meta.json", meta)
    job = {"status": "queued", "started": time.time(), "label": "Transcribe · " + name[:48], "seconds": 0}
    with H["lock"]:
        H["jobs"]["reader:" + tid] = job
    threading.Thread(target=_tr_work, args=(d, meta, job), daemon=True, name="reader-" + tid).start()
    _say(f"{tid} · {name}: queued for Whisper")
    return {"id": tid, "status": "queued"}


def _tr_text(segs):
    """Whisper's segments as paragraphs, a new one at each pause of TR_PAUSE_S or more."""
    paras, cur, end = [], [], None
    for g in segs:
        t = " ".join(str(g.get("text") or "").split())
        if not t:
            continue
        if cur and end is not None and float(g.get("start") or 0) - end >= TR_PAUSE_S:
            paras.append(" ".join(cur))
            cur = []
        cur.append(t)
        end = float(g.get("end") or 0)
    if cur:
        paras.append(" ".join(cur))
    return "\n\n".join(paras)


def _tr_work(d, meta, job):
    key = "reader:" + meta["id"]
    t0 = time.time()
    try:
        src = next(d.glob("source.*"))
        wav = d / "audio16k.wav"
        p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)],
                           capture_output=True, text=True, timeout=7200)
        if p.returncode != 0 or not wav.is_file():
            raise RuntimeError("ffmpeg could not read the recording: " + (p.stderr.strip().splitlines() or ["no sound in it"])[-1][:200])
        import soundfile as sf
        dur = float(sf.info(str(wav)).duration)
        if dur < 0.5:
            raise RuntimeError("the recording holds no sound to hear")
        meta["seconds"] = round(dur, 1)
        with H["whisper_turn"](job) as wt:               # the lab's own Whisper turn: a card when one has room, else the processor
            env, gpu, why = H["whisper_env"](wt.gpu)
            job.update(status="running", since=time.time(), gpu=gpu, expect=round(20 + dur * (0.08 if gpu != "cpu" else 1.0)))
            meta.update(status="running", where="the processor" if gpu == "cpu" else f"GPU {gpu}", note=why)
            _write(d / "meta.json", meta)
            out = d / "whisper.json"
            p = subprocess.run([str(H["whisper_py"]), str(HERE / "whisper_job.py"), str(wav), str(out), meta["lang"], str(H["whisper_dir"])],
                               env=env, capture_output=True, text=True, timeout=max(3600, int(dur * 4)), cwd=str(kit()))
            if p.returncode != 0 or not out.is_file():
                raise RuntimeError("Whisper failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][:300])
        w = _json(out, {})
        segs = w.get("segments") or []
        text = _tr_text(segs)
        if not text.strip():
            raise RuntimeError("Whisper heard no words in it")
        meta.update(status="done", lang=meta["lang"] or str(w.get("language") or ""), took=round(time.time() - t0, 1), segments=len(segs),
                    words=len(text.split()), ended=time.time())
        (d / "transcript.txt").write_text(text, encoding="utf-8")
        _say(f"{meta['id']} · {meta['name']}: heard, {meta['words']} words in {meta['took']:.0f} s on {meta.get('where', '')}")
    except Exception as e:                               # noqa: BLE001  said, the recording kept for another try
        stopped = isinstance(e, H["cancelled"])
        meta.update(status="stopped" if stopped else "failed", error="" if stopped else str(e)[:400], ended=time.time())
        _say(f"{meta['id']} · {meta['name']}: " + ("stopped" if stopped else f"not heard: {str(e)[:200]}"))
    finally:
        (d / "audio16k.wav").unlink(missing_ok=True)
        _write(d / "meta.json", meta)
        with H["lock"]:
            if H["jobs"].get(key) is job:
                if meta.get("status") == "failed":
                    job["status"] = "failed"
                H["jobs"].pop(key, None)


def _tr_dir(tid):
    if not TR_RE.match(str(tid or "")):
        raise ValueError("no such transcript")
    d = transcripts_home() / tid
    if not (d / "meta.json").is_file():
        raise FileNotFoundError("no such transcript")
    return d


def transcripts():
    out = []
    home = transcripts_home()
    with H["lock"]:
        live = {k[7:]: dict(v) for k, v in H["jobs"].items() if k.startswith("reader:tr-")}
    for d in sorted((x for x in home.iterdir() if x.is_dir() and TR_RE.match(x.name)), reverse=True)[:40] if home.is_dir() else []:
        m = _json(d / "meta.json")
        if not isinstance(m, dict):
            continue
        job = live.get(m.get("id"))
        if job:
            m.update(status=job.get("status"), expect=job.get("expect"), waiting=job.get("waiting"),
                     elapsed=round(time.time() - job["since"], 1) if job.get("since") else None)
        elif m.get("status") in ("queued", "running"):
            m.update(status="failed", error="the lab restarted while Whisper was hearing it")
            _write(d / "meta.json", m)
        m["script"] = (d / "script.txt").is_file()
        out.append({k: m.get(k) for k in ("id", "name", "lang", "status", "created", "seconds", "where", "error", "words", "took", "expect",
                                          "elapsed", "waiting", "script")})
    return {"transcripts": out}


def transcript(tid):
    d = _tr_dir(tid)
    m = _json(d / "meta.json", {})
    w = _json(d / "whisper.json", {}) or {}
    return dict(m, text=(d / "transcript.txt").read_text(encoding="utf-8") if (d / "transcript.txt").is_file() else "",
                script=(d / "script.txt").read_text(encoding="utf-8") if (d / "script.txt").is_file() else "",
                script_mode=(d / "script.mode").read_text(encoding="utf-8").strip() if (d / "script.mode").is_file() else "",
                segments=[{k: g.get(k) for k in ("start", "end", "text")} for g in (w.get("segments") or [])][:20000])


def transcript_script(body):
    """The script the page made from a transcript (the Writer's model cleaned it up), kept beside it; the acute and every letter as sent."""
    d = _tr_dir(body.get("id"))
    script = str(body.get("script") or "")
    if len(script) > SCRIPT_MAX:
        raise ValueError(f"the script: {SCRIPT_MAX} characters at most")
    if script.strip():
        (d / "script.txt").write_text(script, encoding="utf-8")
        mode = str(body.get("mode") or "")               # HERESY 2376: how it was cleaned, every word or as in proofreading, kept beside it
        if mode in CLEAN_MODES:
            (d / "script.mode").write_text(mode, encoding="utf-8")
    else:
        (d / "script.txt").unlink(missing_ok=True)
        (d / "script.mode").unlink(missing_ok=True)
    return {"ok": True}


def transcript_remove(body):
    d = _tr_dir(body.get("id"))
    with H["lock"]:
        if ("reader:" + d.name) in H["jobs"]:
            raise ValueError("Whisper is hearing it now: stop it in the queue first")
    shutil.rmtree(d)
    return {"ok": True}


def _glyphs(text):
    """HERESY 2270: (the text read by the glyph map, {source, rules, hits}); a table with a broken rule is refused, said by its lines."""
    _t, rules, errors, src, _p = rg.load(kit())
    if src == "none":
        raise ValueError("no glyph map on this machine: the room's editor keeps a copy in user/reader/glyphs.map.tsv")
    if errors:
        raise ValueError("the glyph map has broken rules: " + "; ".join(errors[:4]))
    out, hits = rg.apply(rules, text)
    return out, {"source": src, "rules": len(rules), "hits": sum(hits.values())}


def glyphs_get():
    text, rules, errors, src, p = rg.load(kit())
    rel = lambda x: str(x.relative_to(kit())) if x is not None else ""   # noqa: E731
    target = "his" if src == "his" else "user"           # HERESY 2376: a save writes the table it read (his where his is applied)
    return {"text": text, "source": src, "path": rel(p), "his": rel(rg.his_path(kit())), "user": rel(rg.user_path(kit())),
            "rules": len(rules), "errors": errors, "target": rel(rg._target(kit(), target)), "backups": rg.backups(kit(), target)[:20],
            "kept_in": rel(rg.backups_dir(kit()))}


def route_get(path, q):
    """The Reader's later reads (lab.py hands them here)."""
    if path == "/reader/glyphs":
        return glyphs_get()
    if path == "/reader/transcripts":
        return transcripts()
    if path == "/reader/transcript":
        return transcript(q.get("id", ""))
    return None


def route_post(path, data, q):
    """The Reader's later writes: (code, answer), or None for a path not its own."""
    if path == "/reader/transcript-script":
        return 200, transcript_script(data)
    if path == "/reader/transcript-remove":
        return 200, transcript_remove(data)
    if path == "/reader/glyphs":                          # HERESY 2270, 2376: the table it read written, the old one kept first
        src = "his" if glyphs_get()["source"] == "his" else "user"
        if q.get("scope"):                               # a test page: the table checked, nothing written (it would change every run here)
            _r, errors = rg.parse(data.get("text"))
            if errors:
                raise ValueError("; ".join(errors[:6]))
            return 200, dict(glyphs_get(), saved=str(rg._target(kit(), src).relative_to(kit())), test=True)
        p, kept = rg.save_to(kit(), data.get("text"), src)
        return 200, dict(glyphs_get(), saved=str(p.relative_to(kit())), kept=kept.name if kept else "")
    if path == "/reader/glyphs-undo":                     # HERESY 2376: the newest kept version back
        src = "his" if glyphs_get()["source"] == "his" else "user"
        if q.get("scope"):
            return 200, dict(glyphs_get(), test=True)
        _p, name = rg.undo(kit(), src)
        return 200, dict(glyphs_get(), restored=name)
    if path == "/reader/glyphs-try":                      # HERESY 2376: a line read by the map in the editor, saved or not
        return 200, rg.trial(data.get("map"), data.get("text"))
    if path == "/reader/glyphs-reset":
        if not q.get("scope"):
            rg.reset(kit())
        return 200, glyphs_get()
    if path == "/reader/fix-gaps":                        # HERESY 2334: the pauses shaped by hand, in place or in a copy
        return 200, fix_gaps(data)
    return None


# ---------------------------------------------------------------- HERESY 2263: an engine's tiers
def _ram_gb():
    """The machine's memory free for a new reader (MemAvailable), GiB; None when it cannot be read (said so, never taken for none)."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / 2 ** 20
    except (OSError, ValueError, IndexError):
        pass
    return None


def _fits(t, card):
    """The job card with room for this tier now (a look through the guard: nothing claimed, the Studio's models not asked to go), or None."""
    try:
        c, _free = H["free_gpu"](t["need_mb"], why=f"the Reader · {t['quant']}", only=None if card == "auto" else card, claim=False, unload=False,
                                 held=_held())
        return c
    except RuntimeError:
        return None


def tier_pick(eng, ask, card):
    """Where and in which quant an engine with tiers reads now: {tier, card, wait, reason}. Auto: the card tiers in the order the manifest's
    tier table gives for speed first or quality first (HERESY 2287; without one, the speed quant or the quality one, then Q8_0 with its experts in
    RAM), the first whose card room and memory are free, else the processor in the largest quant the memory holds. A named tier waits for its
    card. ValueError when nothing here can read it."""
    ts = {t["id"]: t for t in eng.get("tiers") or [] if t["ready"]}
    ram = _ram_gb()

    def ram_ok(t):
        return ram is None or ram >= t["ram_gb"]

    cpus = [t for t in ts.values() if t["device"] == "cpu" and ram_ok(t)]
    cpus.sort(key=lambda t: t.get("grade") == "red")    # HERESY 2300: an undesirable quant last, and never Auto's (below)
    mem = "the machine's memory could not be read" if ram is None else f"{ram:.0f} GB of the machine's memory are free"
    named = ts.get(ask) if ask not in TIER_AUTO else None
    if card == "cpu" or (named and named["device"] == "cpu"):
        t = named if named and named["device"] == "cpu" and ram_ok(named) else cpus[0] if cpus else None
        if not t:
            least = min([x["ram_gb"] for x in ts.values() if x["device"] == "cpu"] or [0])
            raise ValueError(f"{eng['label']} on the processor wants {least:.0f} GB of the machine's memory free; {mem}")
        return {"tier": t, "card": "cpu", "wait": False, "reason": "cpu-asked", "ram_gb": ram}
    if ask not in TIER_AUTO:
        if not named:
            raise ValueError(f"no tier {ask} of {eng['label']} on this machine (its model file is not here)")
        if not ram_ok(named):
            raise ValueError(f"{named['quant']} wants {named['ram_gb']:.0f} GB of the machine's memory free; {mem}")
        c = _fits(named, card)
        if c is None and named.get("fallback"):        # HERESY 2290: Q8_0 by name, its experts in RAM when the card is shared, the processor last
            for i in named["fallback"]:
                t = ts.get(i)
                if not t or not ram_ok(t) or t.get("grade") == "red":   # HERESY 2300: a fallback is Auto's pick, never an undesirable quant
                    continue
                if t["device"] == "cpu" and card == "auto":
                    return {"tier": t, "card": "cpu", "wait": False, "reason": "no-card", "ram_gb": ram}
                if t["device"] == "cuda" and (c2 := _fits(t, card)) is not None:
                    return {"tier": t, "card": c2, "wait": False, "reason": "shared", "ram_gb": ram}
        return {"tier": named, "card": c, "wait": c is None, "reason": "asked" if c is not None else "wait", "ram_gb": ram}
    order = (eng.get("tier_auto") or {}).get(ask) or (("quality", "speed", "ram") if ask == "auto-quality" else ("speed", "quality", "ram"))
    tried = [ts[i] for i in order if i in ts and ts[i]["device"] == "cuda" and ts[i].get("grade") != "red"]   # HERESY 2300: never a red tier   # HERESY 2287: the manifest's tier table, in its order
    for t in tried:
        if ram_ok(t):
            c = _fits(t, card)
            if c is not None:
                return {"tier": t, "card": c, "wait": False, "reason": "fits", "ram_gb": ram}
    cpus = [t for t in cpus if t.get("grade") != "red"]   # HERESY 2300
    if cpus:                                             # why the processor: a card had room for a tier, the memory did not
        why = "no-ram" if any(not ram_ok(t) and _fits(t, card) is not None for t in tried) else "no-card"
        return {"tier": cpus[0], "card": "cpu", "wait": False, "reason": why, "ram_gb": ram}
    raise ValueError(f"{eng['label']}: no job card has room for it now and the processor wants more memory; {mem}")


def _picks(eng, ask):
    """HERESY 2290: a run whose tier is picked again at its turn: Auto, or a named tier with a fallback (Q8_0: its banks in RAM when the card is shared)."""
    if ask in TIER_AUTO:
        return True
    return any(t["id"] == ask and t.get("fallback") for t in eng.get("tiers") or [])


def _tier_public(t):
    return {k: t.get(k) for k in ("id", "quant", "device", "rtf", "need_mb", "ram_gb", "load_s", "grade")} if t else None


def tier_preview(q):
    """GET /reader/tier: the tier a run of `chars` characters would take now, where, and how long it would read (its load when not kept)."""
    try:
        eng = _engine(str(q.get("engine") or ""))
    except ValueError as e:
        return {"tiers": False, "error": str(e)}
    if not eng["tiers"]:
        return {"tiers": False}
    card = str(q.get("card") or "auto")
    if card not in ("auto", "cpu"):
        try:
            card = int(card)
        except ValueError:
            card = "auto"
    try:
        pick = tier_pick(eng, str(q.get("ask") or "auto-speed"), card)
    except ValueError as e:
        return {"tiers": True, "error": str(e)}
    t = pick["tier"]
    try:
        chars = max(0, min(TEXT_MAX, int(q.get("chars") or 0)))
    except ValueError:
        chars = 0
    w = W["w"]
    dev = "cpu" if pick["card"] == "cpu" else "cuda"
    kept = bool(w and w.alive() and w.key[0] == eng["id"] and w.key[1] == dev and w.key[3] == t["id"] and (dev == "cpu" or w.card == pick["card"]))
    speech = chars / SPEECH_CPS
    load = 0.0 if kept else t["load_s"]
    return {"tiers": True, "tier": _tier_public(t), "card": pick["card"], "wait": pick["wait"], "reason": pick["reason"], "kept": kept,
            "ram_gb": round(pick["ram_gb"], 1) if pick["ram_gb"] is not None else None, "speech_s": round(speech, 1),
            "expect_s": round(load + speech * t["rtf"]), "load_s": load}


def _tier_for(run, eng):
    """The tier this run reads in now (None for an engine without tiers); asked again each time it waits, so a card that filled meanwhile
    gives the next tier down."""
    if not eng.get("tiers"):
        return None
    return tier_pick(eng, run.get("tier_ask") or "auto-speed", run["card"])["tier"]


# ---------------------------------------------------------------- a run
def _num(body, key, lo, hi, default, kind=float):
    v = body.get(key)
    if v is None or v == "":
        return default
    try:
        v = kind(v)
    except (TypeError, ValueError):
        raise ValueError(f"{key}: a number from {lo} to {hi}")
    if not lo <= v <= hi:
        raise ValueError(f"{key}: a number from {lo} to {hi}")
    return v


def _voice(ref, groups, rows):
    """'' (the engine's own, kept from the first piece), 'v:ID' (a voice), 'g:GROUP' (a group: its centre voice) -> (voice id or '', label)."""
    ref = str(ref or "")
    if not ref:
        return "", "the engine's own voice"
    if ref.startswith("g:"):
        g = next((x for x in groups if x["id"] == ref[2:]), None)
        if not g:
            raise ValueError(f"no timbre group {ref[2:]} here")
        return g["centre"], f"group {g['id']} ({g['centre']})"
    vid = ref[2:] if ref.startswith("v:") else ref
    if not any(r["id"] == vid for r in rows):
        raise ValueError(f"no voice {vid} here")
    return vid, next(r["name"] for r in rows if r["id"] == vid)


def say(body):
    """A run asked for and queued; its thread waits for a card, then its turn, and reads it piece by piece."""
    mode = body.get("mode") if body.get("mode") in MODES else "narration"
    text = str(body.get("text") or "").strip()
    if not text:
        raise ValueError("write the text to read first")
    if len(text) > TEXT_MAX:
        raise ValueError(f"the text is too long: {TEXT_MAX} characters at most")
    eng = _engine(str(body.get("engine") or ""))
    read_text, glyphs = _glyphs(text) if body.get("glyphs") is True else (text, None)    # HERESY 2270: LCV's letters by the map
    split = body.get("split") if body.get("split") in SPLITS else "sentence"
    tags_on = bool(body["tags"]) if isinstance(body.get("tags"), bool) else mode == "dialog"
    gap = _num(body, "gap", 0.05, 3.0, 0.35)
    turn_gap = _num(body, "turn_gap", 0.05, 3.0, 0.45)
    book, shown = None, SPLIT_RE.split(text)             # HERESY 2344: [split] makes a book, its parts read in one run and landed apart
    said_parts = SPLIT_RE.split(read_text)
    if len(said_parts) > 1:
        if len(said_parts) != len(shown):
            raise ValueError("the glyph map changed a [split]: take it out of the map's rules")
        if len(said_parts) > PARTS_MAX:
            raise ValueError(f"{len(said_parts)} parts: {PARTS_MAX} at most in one book")
        ps, parts = [], []
        for k, (stext, rtext) in enumerate(zip(shown, said_parts)):
            sub = pieces(rtext, mode, split, eng, tags_on, gap, turn_gap, max(gap, 0.9)) if rtext.strip() else []
            if not sub:
                continue
            first = len(ps)
            for p in sub:
                p["i"], p["part"] = len(ps), len(parts)
                ps.append(p)
            parts.append({"k": len(parts), "first": first, "last": len(ps) - 1, "title": _part_title(stext, len(parts) + 1), "text": stext.strip()})
        book = {"parts": parts} if len(parts) > 1 else None
        if book is None:
            for p in ps:
                p.pop("part", None)
    else:
        ps = pieces(read_text, mode, split, eng, tags_on, gap, turn_gap, max(gap, 0.9))
    if not ps:
        raise ValueError("nothing to read: the text holds only tags or blank lines")
    if len(ps) > PIECES_MAX:
        raise ValueError(f"{len(ps)} pieces: {PIECES_MAX} at most in one run")
    lang = str(body.get("lang") or "auto").lower()
    lang = rs.detect(text) if lang == "auto" else rs._lang(lang)
    style, stress_on = _style(eng, body.get("style")), body.get("stress") is not False
    srep = said_pieces(ps, eng, lang, style, stress_on)
    acutes_off = body.get("acutes_off") is True          # HERESY 2343: a test only: every acute out, the author's too, the engine's own stresses heard
    if acutes_off:
        for p in ps:
            p["said"] = rs.transport(p["said"], "none")
    vs = voices()
    voice, label = _voice(body.get("voice"), vs["groups"], vs["voices"])
    cast, labels = {"": voice}, {"": label}
    if mode == "dialog":
        asked = body.get("voices") if isinstance(body.get("voices"), dict) else {}
        for spk in sorted({p["speaker"] for p in ps if p["speaker"]}):
            cast[spk], labels[spk] = _voice(asked.get(spk), vs["groups"], vs["voices"])
    card = body.get("card", "auto")
    if card not in ("auto", "cpu"):
        try:
            card = int(card)
        except (TypeError, ValueError):
            raise ValueError("the card: auto, cpu, or a card's index")
        cs = cards()
        if card >= ARC_BASE:
            if "xpu" not in eng["devices"] or not any(a["index"] == card for a in cs["arc"]):
                raise ValueError(f"{eng['label']} cannot read on that Intel card here")
        elif not any(c["index"] == card for c in cs["cuda"]):
            raise ValueError(f"GPU {card} is not one of the lab's job cards (Engine → GPUs)")
    elif card == "cpu" and "cpu" not in eng["devices"]:
        raise ValueError(f"{eng['label']} does not read on the processor")
    dev = "xpu" if isinstance(card, int) and card >= ARC_BASE else "cpu" if card == "cpu" else "cuda"
    if not eng["ready"].get(dev):
        raise ValueError(f"{eng['label']}: its Python for {dev} is not on this machine")
    tier_ask = str(body.get("tier") or "auto-speed")
    if eng["tiers"] and tier_ask not in TIER_AUTO and not any(t["id"] == tier_ask and t["ready"] for t in eng["tiers"]):
        raise ValueError(f"no tier {tier_ask} of {eng['label']} on this machine: " + ", ".join(list(TIER_AUTO) + [t["id"] for t in eng["tiers"] if t["ready"]]))
    seed = body.get("seed")
    seed = int(seed) if re.fullmatch(r"\d{1,10}", str(seed if seed is not None else "").strip()) else random.randint(1000, 999999999)
    seed = min(seed, 2 ** 31 - 1 - len(ps))
    title = " ".join(str(body.get("title") or "").split())[:120] or " ".join(re.sub(r"<\|[^|]*\|>", " ", text).split()[:8])[:80]
    with H["lock"]:
        going = [k for k in H["jobs"] if k.startswith("reader:")]
    if len(going) >= 4:
        raise ValueError("four runs wait already: the next one when one of them ends")
    rid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    d = runs_home() / rid
    d.mkdir(parents=True)
    run = {"id": rid, "status": "queued", "created": time.time(), "title": title, "mode": mode, "split": split, "tags": tags_on,
           "engine": eng["id"], "engine_label": eng["label"], "voices": cast, "voice_labels": labels, "card": card,
           "temperature": _num(body, "temperature", 0.1, 1.5, 0.8), "top_k": _num(body, "top_k", 1, 200, 50, int), "seed": seed,
           "gap": gap, "turn_gap": turn_gap, "text": text, "pieces": ps, "of": len(ps), "done": 0,
           "workspace": str(body.get("workspace") or "")[:200], "no_train": True, "lang": lang, "style": style, "stress": stress_on,
           "stress_report": srep, "tier_ask": tier_ask if eng["tiers"] else None, "acutes_off": acutes_off,
           "hear": body.get("hear") is not False, "lufs_target": LUFS, "glyphs": glyphs,
           "pauses": sum(1 for p in ps if p.get("pause") is not None) + (1 if ps and ps[0].get("lead_pause") else 0)}   # HERESY 2334
    if book:                                             # HERESY 2344: the book's name and its parts
        run["book"] = dict(book, title=title)
    _write(d / "run.json", run)
    job = {"status": "queued", "started": time.time(), "label": title[:60], "seconds": 0}
    with H["lock"]:
        H["jobs"]["reader:" + rid] = job
    threading.Thread(target=_work, args=(d, run, job), daemon=True, name="reader-" + rid).start()
    _say(f"{rid} · queued: {len(ps)} pieces, {mode}, {eng['label']}")
    return {"id": rid, "of": len(ps), "status": "queued"}


def _style(eng, s):
    """An engine's style before each piece, in its own form: a free-form bracket (Drama 3), or its own tags (an engine with sentence tags)."""
    s = " ".join(str(s or "").split())
    if not s:
        return ""
    st = eng.get("style")
    if not st:
        raise ValueError(f"{eng['label']} takes no style: it has neither a system prompt nor a free-form instruction")
    if len(s) > st["max"]:
        raise ValueError(f"the style: {st['max']} characters at most")
    if st["kind"] == "bracket":
        return "[" + s.strip("[] ").replace("[", "(").replace("]", ")") + "]"
    if eng["tag_re"].sub("", s).strip():
        raise ValueError(f"the style of {eng['label']}: only its own tags, as its palette gives them")
    return s


# HERESY 2375 (Claude's card read 10.11: רוּחַ in a Russian reading came out «руха», the whole line «веруха элохим мрахефет»; the advice «правило в
# самом Чтеце, без транслита» took on his word of 11.11): a furtive patach, the patach under a word's last ח, ע or הּ, is said BEFORE its letter
# (ru-ach, not ru-cha). The engine reads letters in order, so the Narrator writes that vowel where it is said: an alef with the patach before
# the letter, the letter left without it, every other mark kept. Hebrew stays Hebrew (his rule: no transliteration); a text without points
# has no patach to move. The ear compares the text as written (Hearer.ref takes the alef out again).
HE_WORD = re.compile(r"[\u05D0-\u05EA][\u0591-\u05C7\u05D0-\u05EA\u05F0-\u05F4]*")
HE_MARK = re.compile(r"[\u0591-\u05C7]")
PATACH, DAGESH, ALEF = "\u05B7", "\u05BC", "\u05D0"
FURTIVE_BACK = re.compile(ALEF + PATACH + r"(?=(?:[\u05D7\u05E2]|\u05D4)[\u0591-\u05C7]*(?![\u0590-\u05FF]))")


def furtive(text):
    """(the text with each furtive patach said before its letter, how many were moved)."""
    n = [0]

    def one(m):
        w = m.group(0)
        i = len(w)
        while i > 0 and HE_MARK.match(w[i - 1]):
            i -= 1
        if i == 0 or i == len(w):
            return w
        base, marks = w[i - 1], w[i:]
        if PATACH not in marks or not (base in "\u05D7\u05E2" or (base == "\u05D4" and DAGESH in marks)) or i < 2:
            return w
        if any(c in marks for c in "\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B8\u05B9\u05BA\u05BB\u05C7"):
            return w                                     # another vowel on the letter: no furtive patach
        n[0] += 1
        return w[:i - 1] + ALEF + PATACH + base + marks.replace(PATACH, "", 1)
    return HE_WORD.sub(one, text), n[0]


def said(text, eng, lang, style, stress_on, user=None):
    """(what the engine reads: the stresses put in and given as it takes them, the style in front; the stress report or None)."""
    rep = None
    text, _moved = furtive(text)                         # HERESY 2375
    if stress_on:
        text, rep = rs.stress(text, lang, eng["stress"], eng["tag_re"], user)
    else:
        text = rs.transport(text, eng["stress"])
    return ((style + " ") if style else "") + text, rep


def said_pieces(ps, eng, lang, style, stress_on):
    user, total = rs.user_dict(lang), None
    for p in ps:
        p["said"], rep = said(p["text"], eng, lang, style, stress_on, user)
        p["v"] = 0
        if rep:
            total = rs.merge(total, rep)
    return total


def stress_preview(body):
    """The text as the engine would read it, its marks shown as acutes, and what the pass found (his marks, the dictionary's, the homographs)."""
    text = str(body.get("text") or "")[:TEXT_MAX]
    lang = str(body.get("lang") or "auto").lower()
    lang = rs.detect(text) if lang == "auto" else rs._lang(lang)
    try:
        skip = _engine(str(body.get("engine") or ""))["tag_re"]
    except ValueError:
        skip = None
    glyphs = None
    if body.get("glyphs") is True:
        text, glyphs = _glyphs(text)
    text, moved = furtive(text)                          # HERESY 2375: Check shows the furtive patach where it is said
    out, rep = rs.stress(text, lang, "acute", skip)
    return dict(rep, text=out, glyphs=glyphs, furtive=moved)


def _place(run, job, eng, tier=None):
    """Waits for where it reads: (device, card). Auto and a named CUDA card through the guard; an Intel card and the processor at once. A tier
    picked by the room free now (HERESY 2263) does not wait: it fitted a moment ago, and the turn asks the guard again."""
    card, need, what = run["card"], (tier or {}).get("need_mb") or eng["need_mb"], f"the Reader · {run['id']}"
    if card == "cpu" or (tier and tier["device"] == "cpu"):
        return "cpu", None
    if isinstance(card, int) and card >= ARC_BASE:
        return "xpu", card
    if card == "auto":
        if not (tier and _picks(eng, run.get("tier_ask"))):
            H["wait_card"](job, need, what, held=_held)
        return "cuda", None
    t0, said = time.time(), False
    while True:
        if job.get("cancel"):
            raise H["cancelled"]("taken off the queue")
        try:
            H["free_gpu"](need, why=what, only=card, claim=False, held=_held())
            return "cuda", card
        except RuntimeError as e:
            if time.time() - t0 > WAIT_S:
                raise RuntimeError(f"GPU {card} did not come free in {WAIT_S // 3600} hours: {e}")
            job["waiting"] = str(e)
            if not said:
                _say(f"{run['id']} · waits for GPU {card}: {e}")
                said = True
            time.sleep(10)


def _studio_on(card):
    try:
        return H["studio_now"]() == card
    except Exception:                                    # noqa: BLE001
        return False


def _studio_busy():
    import urllib.request
    try:
        return bool(json.load(urllib.request.urlopen(H["engine_url"] + "/hardware", timeout=5)).get("busy"))
    except (OSError, ValueError):
        return False


def _trim(x, sr, lead=False):
    """The reading without its silence at the edges; with lead=True also the samples cut before it (HERESY 2295: a heard word's time in the take)."""
    import numpy as np
    hop = max(1, int(sr * 0.01))
    n = len(x) // hop
    a, b = 0, len(x)
    if n >= 3:
        db = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))
        on = np.where(db > max(-50.0, db.max() - 40.0))[0]
        if len(on):
            pad = int(sr * 0.04)
            a, b = max(0, on[0] * hop - pad), min(len(x), (on[-1] + 1) * hop + pad)
    y = x[a:b] if (a, b) != (0, len(x)) else x
    return (y, a) if lead else y


def _active_db(x, sr):
    """The level of a sound's active frames (those within 40 dB of its loudest, above -50 dBFS), dBFS."""
    import numpy as np
    hop = max(1, int(sr * 0.01))
    n = len(x) // hop
    db = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)) if n else np.array([-120.0])
    on = db > max(-50.0, db.max() - 40.0)
    return float(10 * np.log10(np.mean(10 ** (db[on] / 10)))) if on.any() else float(db.max())


def _gain(x, sr, target=-20.0):
    """One gain for the whole take, its speech at target dBFS (the active frames), never a clipped peak: a peak above 0.97 brings the gain down."""
    import numpy as np
    if not len(x):
        return 1.0
    g = 10 ** ((target - _active_db(x, sr)) / 20)
    pk = float(np.abs(x).max()) * g
    return g * (0.97 / pk) if pk > 0.97 else g


def _level(x, sr, target=-20.0):
    return x * _gain(x, sr, target) if len(x) else x


def _work(d, run, job):
    rid, key = run["id"], "reader:" + run["id"]
    w, dev, keep, hearer = None, None, False, None
    try:
        eng = _engine(run["engine"])
        vs = {r["id"]: r for r in _voice_rows()}
        chars = sum(len(p["plain"]) for p in run["pieces"])
        while True:
            tier = _tier_for(run, eng)
            dev, card = _place(run, job, eng, tier)
            with H["turn"](job):
                if dev == "cuda":
                    try:
                        card, _free = H["free_gpu"]((tier or eng)["need_mb"], why=f"the Reader · {rid}", only=card, held=_held())
                    except RuntimeError:
                        job["status"] = "queued"
                        if tier and _picks(eng, run.get("tier_ask")):
                            time.sleep(5)                # the card filled since the pick: the next look picks again
                        continue
                elif dev == "xpu" and _studio_on(card):
                    t0, said = time.time(), False
                    while _studio_busy():                # the Studio renders on that card: it keeps it until the song is done
                        if job.get("cancel") or time.time() - t0 > WAIT_S:
                            raise H["cancelled"]("taken off the queue") if job.get("cancel") else RuntimeError("the Studio kept the Intel card for 3 hours")
                        if not said:
                            _say(f"{rid} · waits for the Studio's song on the Intel card")
                            said = True
                        time.sleep(10)
                    H["unload_engine"]("the Reader")
                where = f"GPU {card}" if dev == "cuda" else "the Intel card" if dev == "xpu" else "the processor"
                job.update(status="running", gpu=card if dev == "cuda" else "arc" if dev == "xpu" else "cpu", since=time.time())
                job.pop("waiting", None)
                job["expect"] = 40 + chars * 0.12 * (2.2 if dev == "xpu" else 1.0)
                if tier:                                 # HERESY 2263: its load, then the tier's measured speed
                    job["expect"] = round(tier["load_s"] + chars / SPEECH_CPS * tier["rtf"])
                    job["tier"] = tier["quant"]
                    run["tier"] = _tier_public(tier)
                run.update(status="running", began=time.time(), where=where)
                _write(d / "run.json", run)
                _say(f"{rid} · reading {run['of']} pieces on {where}" + (f" in {tier['quant']} (RTF {tier['rtf']} measured on a 3090)" if tier else ""))
                w, fresh = _worker(eng, dev, card, tier)
                t1, anchors, said_s, gen, drifts, reqs = time.time(), {}, 0.0, 0.0, 0, {}
                # HERESY 2266: heard while the next piece is read; twice the threads when the engine leaves the processor free (a card, few banks in RAM)
                ear_threads = HEAR_THREADS * 2 if tier and tier["device"] == "cuda" and tier.get("cel", 40) <= 16 else HEAR_THREADS
                hearer = Hearer(run["lang"], eng["tag_re"], ear_threads) if run.get("hear") else None
                for p in run["pieces"]:
                    if job.get("cancel"):
                        raise H["cancelled"]("stopped")
                    spk, vid = p["speaker"], run["voices"].get(p["speaker"]) or ""
                    hold = run["mode"] == "narration" or not vid      # the voice held by its first long piece
                    akey = f"anchor:{rid}:{spk}"
                    ref = None
                    if hold and anchors.get(spk):
                        ref = {"key": akey}
                    elif vid and vid in vs:
                        ref = {"key": "voice:" + vid, "wav": str(voices_home() / (vid + ".wav")), "text": vs[vid]["text"]}
                    req = {"op": "say", "text": p.get("said") or p["text"], "plain": p["plain"], "ref": ref, "out": str(d / f"piece-{p['i']:03d}.wav"),
                           "opts": {"temperature": run["temperature"], "top_k": run["top_k"], "seed": run["seed"] + p["i"]}}
                    if hold and not anchors.get(spk):
                        req["keep"] = akey
                    held = anchors.get(spk)
                    target = held if hold and isinstance(held, float) else (vs.get(vid) or {}).get("f0") if vid else None
                    req["pitch"] = True
                    for k in range(RETRIES + 1):         # a voice that drifted across the line of gender read again with another seed
                        m = w.ask(req)
                        if not m.get("ok"):
                            raise RuntimeError(f"piece {p['i'] + 1} of {run['of']}: {m.get('error')}")
                        if k == RETRIES or not drifted(target, m.get("f0")):
                            break
                        drifts += 1
                        _say(f"{rid} · piece {p['i'] + 1} read at {m['f0']:.0f} Hz, its voice is {target:.0f} Hz: read again with another seed")
                        req["opts"]["seed"] += 1000
                    p["f0"], p["tries"] = m.get("f0"), k + 1
                    if req.get("keep") and m.get("seconds", 0) >= ANCHOR_MIN_S:
                        anchors[spk] = float(m["f0"]) if m.get("f0") else True
                        run.setdefault("anchors", {})[spk] = p["i"]
                    p["seconds"], p["gen_s"] = m.get("seconds"), m.get("gen_s")
                    said_s, gen = said_s + float(m.get("seconds") or 0), gen + float(m.get("gen_s") or 0)
                    reqs[p["i"]] = req
                    if hearer:
                        hearer.put(p["i"], d / f"piece-{p['i']:03d}.wav", p.get("said") or p["text"])
                    run["done"] = p["i"] + 1
                    el = time.time() - job["since"]
                    job["expect"] = round(el / run["done"] * run["of"] + 2, 1)
                    job["label"] = f"{run['title'][:48]} · {run['done']}/{run['of']}"
                    if run["done"] % 4 == 0 or run["done"] == run["of"]:
                        _write(d / "run.json", run)
                if hearer:                               # HERESY 2266: before the anchors go, a piece read again keeps its voice
                    try:
                        _hear_pass(d, run, eng, w, hearer, reqs, job)
                    finally:
                        hearer.close()
                    _tail_pass(d, run, hearer)           # HERESY 2335: each piece as kept: its tail, a tone, its level
                for k in anchors:
                    w.ask({"op": "forget", "key": f"anchor:{rid}:{k}"}, timeout=30)
                keep = dev == "cuda"
                run["gen_s"], run["read_s"], run["drifts"] = round(gen, 1), round(time.time() - t1, 1), drifts
                take = _land_book(d, run, eng) if run.get("book") else _land(d, run, eng)   # HERESY 2344: a book lands part by part
                if take.get("parts"):
                    run["takes"] = take["parts"]
                run.update(status="done", take=take["name"], seconds=take["seconds"], ended=time.time())
                _say(f"{rid} · done: {take['seconds']:.1f} s of speech in {run['read_s']:.0f} s, the take {take['name']}" +
                     (f" in “{take['workspace']}”" if take.get("workspace") else ""))
                break
    except Exception as e:                               # noqa: BLE001  the run ends said: stopped or failed, with why
        stopped = isinstance(e, H["cancelled"])
        run.update(status="stopped" if stopped else "failed", error=str(e)[:600] if not stopped else "", ended=time.time())
        if w is not None and not stopped and not w.alive():
            run["error"] += (" · " + w.tail()) if w.tail() else ""
        _say(f"{rid} · " + ("stopped" if stopped else f"failed: {str(e)[:300]}"))
        if not stopped:
            job["error"] = str(e)[:300]
    finally:
        if hearer is not None:                           # HERESY 2266: the ear never outlives its run
            hearer.close()
        if w is not None:
            _release(w, keep and run.get("status") == "done")
        with H["lock"]:
            if H["jobs"].get(key) is job:
                if run.get("status") == "failed":
                    job["status"] = "failed"              # jobtable remembers a failed job popped (the audit's C4)
                H["jobs"].pop(key, None)
        _write(d / "run.json", run)


def _land(d, run, eng):
    """The run's pieces joined (each trimmed, its silence after it), one gain, the take in the Library: 48 kHz 24-bit like an import, its meta
    and request marked never for training, its WAV's comment tag saying so too; the text and the settings in its note; filed where it was asked."""
    secs = _join(d, run, eng)
    out = Path(H["outputs"])
    stamp, k = time.strftime("%Y%m%d-%H%M%S"), 1
    while True:
        name = f"{stamp}-{k:02d}-read-" + H["slug"](run["title"])
        t = out / name
        try:
            t.mkdir(parents=True)
            break
        except FileExistsError:
            if k >= 99:
                raise
            k += 1
    by, why = f"the Reader · {eng['id']}", "speech of an engine whose terms forbid training on what it makes"
    try:
        _to_library(d, t, run, by, why)
    except RuntimeError:
        shutil.rmtree(t, ignore_errors=True)
        raise
    meta = {"title": run["title"], "created": int(time.time()), "seconds": secs, "format": "wav24", "favorite": False, "truncated": False,
            "render_seconds": run.get("read_s", 0), "song": 0, "variation": 0, "provided_score": False, "model": "reader"}
    no_train.mark(meta, by, why)
    json.dump(meta, open(t / "meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=4)
    voices_said = ", ".join((f"{s}: " if s else "") + run["voice_labels"].get(s, "") for s in run["voice_labels"]
                            if s or run["mode"] == "narration" or any(p["speaker"] == "" for p in run["pieces"]))
    settings = {k: run[k] for k in ("mode", "split", "tags", "engine", "engine_label", "voices", "voice_labels", "temperature", "top_k", "seed",
                                    "gap", "turn_gap", "card", "where", "of", "gen_s", "read_s", "tier") if k in run}
    if (eng.get("license") or {}).get("credit"):         # HERESY 2333: the engine's credit, said by the Content Credentials of its downloads
        settings["credit"] = eng["license"]["credit"]
    req = {"title": run["title"], "style": "spoken word · " + run["mode"] + (" · " + voices_said if voices_said else ""), "lyrics": run["text"],
           "cot": "off", "reader": dict(settings, run=run["id"]), "no_train": True}
    if run.get("parent_take"):                           # HERESY 2334: a copy with its pauses shaped, a child of its take in the family tree
        req.update(parent=run["parent_take"], what=run.get("parent_what") or "its pauses shaped")   # 2344: or the book's next part
    if run.get("book"):
        req["book"] = run["book"]
    json.dump(req, open(t / "request.json", "w", encoding="utf-8"), ensure_ascii=False)
    head = (f"🗣 The Narrator · {run['mode']} · {voices_said or 'the engine’s own voice'} · {run['engine_label']} · temperature {run['temperature']} · "
            + (f"top-k {run['top_k']} · " if eng.get("top_k", True) else "") + f"seed {run['seed']} · inline tags {'read' if run['tags'] else 'taken out'} · by {run['split'] if run['mode'] == 'narration' else 'turns'}"
            f" · {run['of']} pieces · {run.get('where', '')}" + (f" · {run['tier']['quant']}" if run.get("tier") else "") +
            f" · {secs:.1f} s read in {run.get('read_s', 0):.0f} s" + _heard_note(run) + " · never for training" +
            (f" · {eng['license']['credit']}" if (eng.get("license") or {}).get("credit") else "") + "\n—\n")
    note = head + run["text"]
    if len(note) > 4000:
        note = note[:3990].rstrip() + " …"
    res = {"name": name, "seconds": round(secs, 2)}
    cfg = H["config_dir"]()
    try:
        H["collection"].collection_post(cfg, out, {"op": "note", "names": [name], "text": note})
        if run.get("workspace"):
            H["collection"].collection_post(cfg, out, {"op": "ws-add", "workspace": run["workspace"], "names": [name]})
            res["workspace"] = run["workspace"]
    except (OSError, ValueError) as e:
        _say(f"{run['id']} · the take {name} is in the library, its note or workspace not set: {e}")
    return res


def _land_book(d, run, eng):
    """HERESY 2344: a book read in one run landed part by part. The whole joined once for the book's one gain (each part at the book's level);
    each part a run of its own (its pieces and their versions copied, numbered from 0, their words, ear and guard kept), its take landed in a
    section of the workspace named after the book, the child of the part before it. The book's run keeps the parts' takes (and is fixed part by
    part, never whole). Returns {name: the first part's take, seconds: all of them, parts: [{k, title, run, take, seconds}], workspace}."""
    book = run["book"]
    if run.get("gain") is None:
        _join(d, run, eng)                               # the whole book once: its gain, its loudness
    ws = run.get("workspace") or ""
    if ws and ws.count(" / ") < 2:
        ws = ws + " / " + (" ".join(book["title"].replace(" / ", " ").split())[:56] or "book")
    prev, parts, total = None, [], 0.0
    for part in book["parts"]:
        while True:
            rid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
            d2 = runs_home() / rid
            try:
                d2.mkdir(parents=True)
                break
            except FileExistsError:
                continue
        sub = []
        for j, p in enumerate(run["pieces"][part["first"]:part["last"] + 1]):
            for f in d.glob(f"piece-{p['i']:03d}.*wav"):    # moved, not copied: the book is fixed part by part, its own run never again
                os.replace(f, d2 / f.name.replace(f"piece-{p['i']:03d}", f"piece-{j:03d}", 1))
            q = dict(p, i=j)
            q.pop("part", None)
            sub.append(q)
        if sub[-1].get("pause") is None:
            sub[-1]["gap"] = 0.0
        heard = [q for q in sub if q.get("cer") is not None]
        r2 = {k: v for k, v in run.items() if k not in ("pieces", "book", "take", "takes", "anchors", "cer", "rereads", "heard", "lufs", "tails", "tones",
                                                         "holes", "level_off", "fixes", "pauses")}
        r2.update(id=rid, created=time.time(), pieces=sub, of=len(sub), done=len(sub), text=part["text"], status="done", workspace=ws,
                  title=(book["title"][:60] + " · " + part["title"])[:120], book={"run": run["id"], "title": book["title"], "k": part["k"] + 1, "of": len(book["parts"])},
                  gain=run["gain"], rereads=sum(1 for q in sub if q.get("reread")), heard=len(heard),
                  cer=round(sum(q["cer"] * len(q["plain"]) for q in heard) / max(1, sum(len(q["plain"]) for q in heard)), 4) if heard else None,
                  tails=sum(1 for q in sub if (q.get("tail") or {}).get("cut_done")), tones=sum(1 for q in sub if q.get("tone")),
                  holes=sum(1 for q in sub if q.get("hole")), level_off=sum(1 for q in sub if q.get("level_off") is not None))
        if prev:
            r2["parent_take"], r2["parent_what"] = prev, "the book's next part"
        take = _land(d2, r2, eng)
        r2.update(take=take["name"], seconds=take["seconds"], ended=time.time())
        _write(d2 / "run.json", r2)
        parts.append({"k": part["k"] + 1, "title": part["title"], "run": rid, "take": take["name"], "seconds": take["seconds"]})
        total += float(take["seconds"])
        prev = take["name"]
        _say(f"{run['id']} · part {part['k'] + 1} of {len(book['parts'])}: the take {take['name']}")
    (d / "take.wav").unlink(missing_ok=True)            # the whole joined only for the book's gain: its parts are the takes
    return {"name": parts[0]["take"], "seconds": round(total, 2), "parts": parts, "workspace": ws}


def _heard_note(run):
    """HERESY 2266: the ear's word and the loudness for the take's note."""
    out = ""
    if run.get("cer") is not None:
        out += f" · Whisper {run['cer'] * 100:.1f} % of letters off" + (f", {run['rereads']} piece(s) read again" if run.get("rereads") else "")
        for p in run.get("pieces") or []:                # HERESY 2295: which and why
            rr = p.get("reread")
            if isinstance(rr, dict):
                out += (f" (piece {p['i'] + 1}: " + (_why_text(rr.get("why") or [], p) or f"{(rr.get('cer_first') or 0) * 100:.0f} % of letters off")
                        + f", reading {rr.get('kept_read') or (2 if rr.get('kept') == 'again' else 1)} of {rr.get('reads') or 2} kept)")
    elif run.get("hear_error"):
        out += " · not heard by Whisper: " + run["hear_error"][:120]
    if run.get("tails"):                                 # HERESY 2335: the tail guard
        out += f" · {run['tails']} tail(s) after the last word cut (a voice or a tone)"
    if run.get("tones"):
        out += f" · a steady tone under the words of {run['tones']} piece(s)"
    if run.get("holes"):
        out += f" · a silence of a second or more inside {run['holes']} piece(s)"
    if run.get("level_off"):
        out += f" · {run['level_off']} piece(s) {LEVEL_OFF:g} dB or more off the reading's level"
    if run.get("tail_error"):
        out += " · the tail guard could not look: " + run["tail_error"][:80]
    if run.get("lufs") is not None:
        out += f" · {run['lufs']:.1f} LUFS"
    if run.get("acutes_off"):                            # HERESY 2343
        out += " · read without acutes (a test)"
    g = run.get("glyphs")
    if g:
        out += f" · LCV glyphs by {'the user’s copy of the map' if g.get('source') == 'user' else 'the author’s map'}, {g.get('hits', 0)} changes"
    return out


def _to_library(d, t, run, by, why):
    """take.wav into the Library's take folder t: 48 kHz 24-bit stereo, its comment tag saying never for training (written beside, then moved)."""
    part = t / "audio.part.wav"
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(d / "take.wav"), "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le",
                        "-metadata", "comment=" + no_train.comment(by, why), "-metadata", "title=" + run["title"], str(part)],
                       capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        part.unlink(missing_ok=True)
        raise RuntimeError("ffmpeg could not write the take: " + (p.stderr.strip().splitlines() or ["?"])[-1])
    part.replace(t / "audio.wav")


def _piece_path(d, i, v=0):
    return d / (f"piece-{i:03d}.v{v}.wav" if v else f"piece-{i:03d}.wav")


def _fade(y, sr):
    import numpy as np
    n = min(int(sr * FADE_S), len(y) // 2)
    if n > 1:
        ramp = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))).astype(np.float32)
        y[:n] *= ramp
        y[-n:] *= ramp[::-1]
    return y


def _quiet(y, sr):
    """HERESY 2334: the quiet a trimmed piece keeps at its head and its tail (frames under _trim's line), seconds: counted into a pause."""
    import numpy as np
    hop = max(1, int(sr * 0.01))
    n = len(y) // hop
    if n < 3:
        return 0.0, 0.0
    db = 20 * np.log10(np.sqrt((y[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))
    on = np.where(db > max(-50.0, db.max() - 40.0))[0]
    if not len(on):
        return 0.0, 0.0
    return on[0] * hop / sr, (len(y) - (on[-1] + 1) * hop) / sr


def _join(d, run, eng):
    """take.wav from each piece's chosen version (trimmed, its edges faded, a fixed version at its own level match), its silence after it, and
    the take's one gain (kept in the run from its first joining, so a take joined again keeps every untouched piece as it was). The seconds."""
    import numpy as np
    import soundfile as sf
    parts, sr, pos, ys = [], eng["sample_rate"], 0, []
    for p in run["pieces"]:
        v = int(p.get("v") or 0)
        x, sr = sf.read(str(_piece_path(d, p["i"], v)), dtype="float32", always_2d=True)
        y, cut = _trim(x.mean(1), sr, lead=True)
        y = _fade(y, sr)
        g = next((float(e.get("gain") or 1.0) for e in p.get("versions") or [] if e.get("v") == v), 1.0)
        ys.append((p, y * g if g != 1.0 else y, cut))
    if ys and ys[0][0].get("lead_pause"):              # HERESY 2334: a pause before the first words, as heard
        z = np.zeros(int(round(sr * max(0.0, float(ys[0][0]["lead_pause"]) - _quiet(ys[0][1], sr)[0]))), np.float32)
        pos += len(z)
        parts.append(z)
    for k, (p, y, cut) in enumerate(ys):
        if p.get("pause") is not None:                   # HERESY 2334: a pause asked (a tag, the editor) is the pause heard: the quiet at the
            nxt = _quiet(ys[k + 1][1], sr)[0] if k + 1 < len(ys) else 0.0   # pieces' edges counted in, to the sample
            gap = np.zeros(int(round(sr * max(0.0, float(p["pause"]) - _quiet(y, sr)[1] - nxt))), np.float32)
        else:
            gap = np.zeros(int(sr * float(p["gap"])), np.float32)
        p["at"] = [round(pos / sr, 3), round((pos + len(y)) / sr, 3)]
        p["lead"] = round(cut / sr, 3)
        if k + 1 < len(ys):                              # HERESY 2334: the pause heard after it, for the editor
            p["after"] = round((len(gap) / sr) + _quiet(y, sr)[1] + _quiet(ys[k + 1][1], sr)[0], 2)
        pos += len(y) + len(gap)
        parts += [y, gap]
    x = np.concatenate(parts) if parts else np.zeros(0, np.float32)
    loud = run.get("lufs_target") is not None             # HERESY 2266: a run since 2266 is joined to -16 LUFS
    if run.get("gain") is None:
        run["gain"] = _gain(x, sr)
        if loud and len(x):
            tmp = d / "take.measure.wav"
            sf.write(str(tmp), x, sr, subtype="FLOAT")
            lufs = _lufs(tmp)
            tmp.unlink(missing_ok=True)
            if lufs is None:
                run["lufs_error"] = "ffmpeg could not measure the loudness: the take kept at its speech level of -20 dBFS"
            else:
                run["gain"] = 10 ** ((float(run["lufs_target"]) - lufs) / 20)
    x = x * float(run["gain"])
    if loud:
        x = _knee(x)
    pk = float(np.abs(x).max()) if len(x) else 0.0
    if pk > 0.99:                                        # a fixed piece louder than its take allows: the take brought under the line
        x = x * (0.99 / pk)
    sf.write(str(d / "take.wav"), x, sr, subtype="PCM_24")
    if loud:
        run["lufs"] = _lufs(d / "take.wav")
    return len(x) / sr


def _knee(x):
    """A soft knee above -3 dBFS that never lets a peak past -1 dBFS (each sample on its own: a take joined again stays bit for bit)."""
    import numpy as np
    a = np.abs(x)
    over = a > LIM_KNEE
    if over.any():
        span = LIM_CEIL - LIM_KNEE
        x = x.copy()
        x[over] = np.sign(x[over]) * (LIM_KNEE + span * np.tanh((a[over] - LIM_KNEE) / span))
    return x.astype(np.float32)


def _lufs(path):
    """The integrated loudness of a file by ffmpeg's EBU R128 filter, LUFS; None when it cannot say (said by the caller)."""
    try:
        p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=600)
        m = re.findall(r"^\s*I:\s*(-?[\d.]+)\s*LUFS", p.stderr, re.M)
        return round(float(m[-1]), 2) if m else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


# ---------------------------------------------------------------- a take fixed piece by piece (HERESY 2257)
FIX_LOCK = threading.Lock()
VERSIONS_MAX = 40


def _run_of(rid):
    if not RUN_RE.match(str(rid or "")):
        raise ValueError("bad run")
    d = runs_home() / rid
    r = _json(d / "run.json")
    if not isinstance(r, dict):
        raise FileNotFoundError(f"no run {rid}")
    return d, r


def _fixable(r):
    if r.get("status") != "done" or not r.get("take"):
        raise ValueError("only a finished take is fixed")
    if r.get("book") and "parts" in r["book"]:           # HERESY 2344: a book is fixed part by part, each part its own run
        raise ValueError("a book is fixed part by part: open the take of the part")
    with H["lock"]:
        if "reader:" + r["id"] + "~fix" in H["jobs"]:
            raise ValueError("a piece of this take is being read again: the next fix when it is done")


def run_detail(rid):
    """A run for the take's editor: its pieces (words, what was read, where each sits in the take, its versions), its fixes, the history."""
    d, r = _run_of(rid)
    with H["lock"]:
        job = H["jobs"].get("reader:" + rid + "~fix")
        fixing = dict(job) if job else None
    keep = ("id", "status", "title", "mode", "engine", "engine_label", "lang", "style", "stress", "stress_report", "seconds", "take", "of", "fixes", "fix_error",
            "tier")
    out = {k: r.get(k) for k in keep}
    out["pieces"] = [{k: p.get(k) for k in ("i", "speaker", "text", "said", "plain", "at", "v", "versions", "seconds", "cer", "heard", "reread",
                                            "gap", "pause", "after", "tail", "tone", "hole", "db", "level_off")}   # HERESY 2334, 2335: pauses and the tail guard
                     for p in r.get("pieces") or []]
    out["fixing"] = {k: fixing.get(k) for k in ("status", "piece", "waiting")} if fixing else None
    return out


def fix(body):
    """One piece of a finished take read again: its words (corrected text or stresses) through the same stress pass and style, its voice the
    run's (the voice it was cast, or the run's own anchor piece as its reference), a new seed. Its own little job: waits for a card as a run."""
    d, r = _run_of(body.get("id"))
    _fixable(r)
    eng = _engine(r["engine"])
    try:
        i = int(body.get("piece"))
        p = r["pieces"][i]
    except (TypeError, ValueError, IndexError):
        raise ValueError("no such piece in this take")
    if len(p.get("versions") or []) >= VERSIONS_MAX:
        raise ValueError(f"{VERSIONS_MAX} versions of one piece at most: pick one of them")
    text = rs.normal_form(body.get("text") or p["text"])   # a stress written as a + before its vowel taken as the acute
    if not text:
        raise ValueError("the piece's words, at least one")
    if len(text) > eng["max_chars"] * 2:
        raise ValueError(f"a piece of {eng['max_chars'] * 2} characters at most")
    plain = " ".join(eng["tag_re"].sub(" ", text).split())
    words, rep = said(text, eng, r.get("lang") or rs.detect(text), r.get("style") or "", r.get("stress", True) is not False)
    if r.get("acutes_off"):                              # HERESY 2343: a test read without acutes is fixed without them too
        words = rs.transport(words, "none")
    seed = body.get("seed")
    seed = int(seed) if re.fullmatch(r"\d{1,9}", str(seed if seed is not None else "").strip()) else random.randint(1000, 999999999)
    job = {"status": "queued", "started": time.time(), "label": f"{r['title'][:40]} · piece {i + 1}", "seconds": 0, "piece": i}
    with H["lock"]:
        if "reader:" + r["id"] + "~fix" in H["jobs"]:
            raise ValueError("a piece of this take is being read again: the next fix when it is done")
        H["jobs"]["reader:" + r["id"] + "~fix"] = job
    threading.Thread(target=_fix_work, args=(d, r["id"], i, text, plain, words, seed, job), daemon=True, name="reader-fix-" + r["id"]).start()
    _say(f"{r['id']} · piece {i + 1} queued to be read again")
    return {"id": r["id"], "piece": i, "status": "queued", "said": words, "stress_report": rep}


def _ref_for(d, run, p, vs):
    """The voice a piece is read again in: its cast voice, else the run's anchor piece of its speaker (its chosen version, its plain words)."""
    spk, vid = p["speaker"], run["voices"].get(p["speaker"]) or ""
    if run["mode"] == "dialog" and vid and vid in vs:
        return {"key": "voice:" + vid, "wav": str(voices_home() / (vid + ".wav")), "text": vs[vid]["text"]}
    a = (run.get("anchors") or {}).get(spk)
    if a is None:                                        # a run before 2257: its speaker's first piece long enough
        a = next((q["i"] for q in run["pieces"] if q["speaker"] == spk and float(q.get("seconds") or 0) >= ANCHOR_MIN_S), None)
    if a is not None and a != p["i"]:
        q = run["pieces"][a]
        return {"key": f"fix:{run['id']}:{a}:{q.get('v') or 0}", "wav": str(_piece_path(d, a, int(q.get("v") or 0))), "text": q["plain"]}
    if vid and vid in vs:
        return {"key": "voice:" + vid, "wav": str(voices_home() / (vid + ".wav")), "text": vs[vid]["text"]}
    return None


def _fix_work(d, rid, i, text, plain, words, seed, job):
    key, w, dev, keep = "reader:" + rid + "~fix", None, None, False
    try:
        run = _json(d / "run.json")
        eng = _engine(run["engine"])
        vs = {x["id"]: x for x in _voice_rows()}
        while True:
            tier = _tier_for(run, eng)
            dev, card = _place(run, job, eng, tier)
            with H["turn"](job):
                if dev == "cuda":
                    try:
                        card, _free = H["free_gpu"]((tier or eng)["need_mb"], why=f"the Reader · {rid}", only=card, held=_held())
                    except RuntimeError:
                        job["status"] = "queued"
                        if tier and _picks(eng, run.get("tier_ask")):
                            time.sleep(5)
                        continue
                elif dev == "xpu" and _studio_on(card):
                    if _studio_busy():
                        raise RuntimeError("the Studio renders on the Intel card: fix the piece when its song is done")
                    H["unload_engine"]("the Reader")
                job.update(status="running", since=time.time(), expect=30 + len(plain) * 0.12, gpu=card if dev == "cuda" else "arc" if dev == "xpu" else "cpu")
                job.pop("waiting", None)
                if tier:
                    job["expect"], job["tier"] = round(tier["load_s"] + len(plain) / SPEECH_CPS * tier["rtf"]), tier["quant"]
                w, _fresh = _worker(eng, dev, card, tier)
                p = run["pieces"][i]
                vers = p.setdefault("versions", [{"v": 0, "text": p["text"], "said": p.get("said") or p["text"], "seconds": p.get("seconds"), "at": run.get("ended")}])
                v = max(e["v"] for e in vers) + 1
                ref = _ref_for(d, run, p, vs)
                m = w.ask({"op": "say", "text": words, "plain": plain, "ref": ref, "out": str(_piece_path(d, i, v)),
                           "opts": {"temperature": run["temperature"], "top_k": run["top_k"], "seed": seed}})
                if ref and ref["key"].startswith("fix:"):
                    w.ask({"op": "forget", "key": ref["key"]}, timeout=30)
                if not m.get("ok"):
                    raise RuntimeError(f"piece {i + 1}: {m.get('error')}")
                keep = dev == "cuda"
                break
        import soundfile as sf
        with FIX_LOCK:
            run = _json(d / "run.json")                  # the run as it is now (a pick or an undo may have come meanwhile)
            p = run["pieces"][i]
            vers = p.setdefault("versions", [{"v": 0, "text": p["text"], "said": p.get("said") or p["text"], "seconds": p.get("seconds"), "at": run.get("ended")}])
            if run.get("gain") is None:
                _join(d, run, eng)                       # a take landed before 2257: its gain from the take as it was
            old, _sr = sf.read(str(_piece_path(d, i, int(p.get("v") or 0))), dtype="float32", always_2d=True)
            new, sr = sf.read(str(_piece_path(d, i, v)), dtype="float32", always_2d=True)
            g_old = next((float(e.get("gain") or 1.0) for e in vers if e["v"] == int(p.get("v") or 0)), 1.0)
            match = _active_db(_trim(old.mean(1), sr), sr) - _active_db(_trim(new.mean(1), sr), sr)
            gain = g_old * 10 ** (max(-9.0, min(9.0, match)) / 20)
            vers.append({"v": v, "text": text, "said": words, "seconds": m.get("seconds"), "seed": seed, "gain": round(gain, 4), "at": time.time()})
            _choose(d, run, eng, i, v, "fix")
        _say(f"{rid} · piece {i + 1} read again (version {v}), the take joined anew")
    except Exception as e:                               # noqa: BLE001  said, the take as it was
        stopped = isinstance(e, H["cancelled"])
        _say(f"{rid} · piece {i + 1} " + ("not read again: stopped" if stopped else f"not read again: {str(e)[:300]}"))
        with FIX_LOCK:
            run = _json(d / "run.json")
            if isinstance(run, dict):
                run["fix_error"] = "" if stopped else f"piece {i + 1}: {str(e)[:300]}"
                _write(d / "run.json", run)
    finally:
        if w is not None:
            _release(w, keep)
        with H["lock"]:
            if H["jobs"].get(key) is job:
                H["jobs"].pop(key, None)


def _choose(d, run, eng, i, v, kind):
    """Piece i takes version v (under FIX_LOCK): the history keeps what it had, the take is joined anew and the Library's take rewritten."""
    p = run["pieces"][i]
    was = int(p.get("v") or 0)
    p["v"] = v
    e = next(x for x in p["versions"] if x["v"] == v)
    p["text"], p["said"], p["plain"] = e["text"], e["said"], " ".join(eng["tag_re"].sub(" ", e["text"]).split()) or p["plain"]
    run.setdefault("fixes", []).append({"n": len(run["fixes"]) + 1, "at": time.time(), "kind": kind, "piece": i, "v": v, "was": was})
    run["fix_error"] = ""
    _relanded(d, run, eng)


def _relanded(d, run, eng):
    secs = _join(d, run, eng)
    run["seconds"] = round(secs, 2)
    t = Path(H["outputs"]) / run["take"]
    if t.is_dir():
        _to_library(d, t, run, f"the Reader · {eng['id']}", "speech of an engine whose terms forbid training on what it makes")
        try:
            meta = json.load(open(t / "meta.json", encoding="utf-8"))
            meta.update(seconds=secs, edited=int(time.time()))
            json.dump(meta, open(t / "meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=4)
        except (OSError, ValueError) as x:
            _say(f"{run['id']} · the take's meta not updated: {x}")
    else:
        _say(f"{run['id']} · its take {run['take']} is no longer in the Library: the joined take stays in the run")
    _write(d / "run.json", run)


def fix_pick(body):
    """Piece i back to (or forward to) one of its versions."""
    d, r = _run_of(body.get("id"))
    _fixable(r)
    eng = _engine(r["engine"])
    with FIX_LOCK:
        d, r = _run_of(body.get("id"))
        try:
            i, v = int(body.get("piece")), int(body.get("v"))
            p = r["pieces"][i]
        except (TypeError, ValueError, IndexError):
            raise ValueError("no such piece in this take")
        if not any(e["v"] == v for e in p.get("versions") or []) or not _piece_path(d, i, v).is_file():
            raise ValueError(f"piece {i + 1} has no version {v}")
        if int(p.get("v") or 0) != v:
            _choose(d, r, eng, i, v, "pick")
    return run_detail(r["id"])


def fix_gaps(body):
    """HERESY 2334 (Viktor 08.11.2026: «режем копию и удлиняем паузы до сотой секунды… оригинальный выхлоп никогда не удаляется, всё дитя в
    древе дубля, как в Творце»): the pauses after the pieces shaped by hand, each to the hundredth of a second as heard: {id, gaps: {piece:
    seconds}, copy, title}. copy: the run copied, the copy's pauses set and its take landed beside the original as its child (the original
    left as it was, its pieces untouched in the copy bit for bit: the same gain). Without copy: in place, a step of the history Undo takes back."""
    d, r = _run_of(body.get("id"))
    _fixable(r)
    eng = _engine(r["engine"])
    asked = body.get("gaps") if isinstance(body.get("gaps"), dict) else {}
    gaps = {}
    for k, v in asked.items():
        try:
            i, s = int(k), round(float(v), 2)
        except (TypeError, ValueError):
            raise ValueError("a pause: a piece of this take and its seconds")
        if not 0 <= i < len(r["pieces"]) or not 0.0 <= s <= PAUSE_MAX:
            raise ValueError(f"a pause from 0 to {PAUSE_MAX:g} s after a piece of this take")
        gaps[i] = s
    if not gaps:
        raise ValueError("no pause changed")
    if body.get("copy"):
        rid = time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
        d2 = runs_home() / rid
        with FIX_LOCK:
            shutil.copytree(d, d2, ignore=shutil.ignore_patterns("take.wav", "take.measure.wav"))
        r2 = _json(d2 / "run.json")
        r2.update(id=rid, created=time.time(), parent_run=r["id"], parent_take=r["take"], fixes=[], fix_error="", status="done")
        r2["title"] = " ".join(str(body.get("title") or "").split())[:120] or (r["title"][:110] + " · ⏸")
        for i, s in gaps.items():
            r2["pieces"][i]["gap"] = r2["pieces"][i]["pause"] = s
        take = _land(d2, r2, eng)
        r2.update(take=take["name"], seconds=take["seconds"], ended=time.time())
        _write(d2 / "run.json", r2)
        _say(f"{r['id']} · its pauses shaped in a copy: the take {take['name']}, a child of {r['take']}")
        return dict(run_detail(rid), copied_from=r["id"])
    with FIX_LOCK:
        d, r = _run_of(body.get("id"))
        was = {}
        for i, s in gaps.items():
            p = r["pieces"][i]
            was[str(i)] = [p.get("gap"), p.get("pause")]
            p["gap"] = p["pause"] = s
        r.setdefault("fixes", []).append({"n": len(r["fixes"]) + 1, "at": time.time(), "kind": "gaps", "gaps": was, "piece": min(gaps), "v": None, "was": None})
        r["fix_error"] = ""
        _relanded(d, r, eng)
    return run_detail(r["id"])


def fix_undo(body):
    """The last step of the history taken back: its piece returns to the version it had before."""
    d, r = _run_of(body.get("id"))
    _fixable(r)
    eng = _engine(r["engine"])
    with FIX_LOCK:
        d, r = _run_of(body.get("id"))
        hist = r.get("fixes") or []
        if not hist:
            raise ValueError("nothing to undo in this take")
        last = hist.pop()
        if last.get("kind") == "gaps":                   # HERESY 2334: the pauses as they were before the shaping
            for k, (g, ps) in (last.get("gaps") or {}).items():
                p = r["pieces"][int(k)]
                p["gap"] = g
                if ps is None:
                    p.pop("pause", None)
                else:
                    p["pause"] = ps
            _relanded(d, r, eng)
            return run_detail(r["id"])
        p = r["pieces"][last["piece"]]
        p["v"] = last["was"]
        e = next((x for x in p.get("versions") or [] if x["v"] == last["was"]), None)
        if e:
            p["text"], p["said"] = e["text"], e["said"]
        _relanded(d, r, eng)
    return run_detail(r["id"])


# ---------------------------------------------------------------- the room's lists
def runs():
    out = []
    for d in sorted((x for x in runs_home().iterdir() if x.is_dir() and RUN_RE.match(x.name)), reverse=True)[:60] if runs_home().is_dir() else []:
        r = _json(d / "run.json")
        if isinstance(r, dict):
            out.append((d, r))
    with H["lock"]:
        live = {k[7:]: dict(v) for k, v in H["jobs"].items() if k.startswith("reader:")}
    rows = []
    for d, r in out:
        job = live.get(r.get("id"))
        if job:
            r.update(status=job.get("status"), waiting=job.get("waiting"), expect=job.get("expect"),
                     elapsed=round(time.time() - job["since"], 1) if job.get("since") else None)
        elif r.get("status") in ("queued", "running"):
            r.update(status="failed", error=STOPPED)
            _write(d / "run.json", r)
        row = {k: r.get(k) for k in ("id", "status", "created", "title", "mode", "split", "tags", "engine", "engine_label", "voice_labels", "card",
                                     "where", "temperature", "top_k", "seed", "of", "done", "take", "seconds", "error", "waiting", "expect", "elapsed",
                                     "read_s", "workspace", "tier", "tier_ask", "gen_s", "cer", "rereads", "heard", "hear_error", "lufs",
                                     "tails", "tones", "holes", "level_off", "tail_error", "pauses", "book", "takes")}   # HERESY 2334, 2335; 2344
        if isinstance(row.get("book"), dict) and isinstance(row["book"].get("parts"), list):   # HERESY 2344: a book's card says how many parts
            row["book"] = {"title": row["book"].get("title"), "parts": len(row["book"]["parts"])}
        fj = live.get(r.get("id", "") + "~fix")
        row["fixing"] = {"status": fj.get("status"), "piece": fj.get("piece")} if fj else None
        row["fixes"] = len(r.get("fixes") or [])
        row["reread_why"] = reread_why(r)
        row["lang"], row["stress_report"] = r.get("lang"), r.get("stress_report")
        row["chars"] = len(r.get("text") or "")
        row["text"] = (r.get("text") or "")[:400]
        rows.append(row)
    return {"runs": rows}


def file(rid, f):
    if not RUN_RE.match(str(rid or "")) or not re.fullmatch(r"take\.wav|piece-\d{3}(?:\.v\d{1,2})?\.wav", str(f or "")):
        raise ValueError("bad run or file")
    p = runs_home() / rid / f
    if not p.is_file():
        raise FileNotFoundError(f"no {f} in run {rid}")
    return p


def stop(body):
    rid = str(body.get("id") or "")
    with H["lock"]:
        job = H["jobs"].get("reader:" + rid)
        if job:
            job["cancel"] = True
    return {"ok": True, "id": rid, "live": bool(job)}
