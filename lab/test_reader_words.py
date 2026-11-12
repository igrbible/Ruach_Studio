"""HERESY 2295: the Reader's ear by words. Viktor's blind test of Drama 3's quants (09.11.2026): the three takes he marked down for a word that is
not in the text («прОбыв», «пувО», «пашидИм» after «глубоко» at 0:11) were heard by Whisper at 1.5–2.6 % of letters off, under 2266's 12 % line.
Their real transcripts (heresy/MISC/claude-arc/reader/drama3-quants, the blind key's F, L and Q, cer.json) are flagged by the words, and every
clean take's transcript of the same scene passes; the time of the inserted word in the take; a piece read up to three times, the best kept."""
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import reader as r

TAGS = re.compile(r"\[[^\[\]\n]{1,80}\]")
TEXT = ["[contemplative, slowly] Кузня просыпается раньше всех. Сначала оживают вентиляторы, [pause] и в комнате появляется ровный тёплый гул, "
        "как будто кто-то большой и добрый глубоко вздохнул во сне.",
        "[content] Три видеокарты ещё молчат, но уже ждут. На столе остывает чай, а на экране мигает курсор, терпеливо, как метроном перед первой нотой.",
        "[in awe] И вот первая нота звучит. Утро началось."]
REF = [" ".join(TAGS.sub(" ", t).split()) for t in TEXT]

# ---- the three takes he marked down: Whisper's words (beam 5, as the blind set was scored), CER 0.045, 0.030, 0.053 on the first turn
BAD = {"F CPU-F16": ("Кузня просыпается раньше всех. Сначала оживают вентиляторы, и в комнате появляется ровный теплый гул, как будто кто-то большой и "
                     "добрый глубоко пробов вздохнул во сне.", "пробов"),
       "L CPU-Q4_K": ("Кузня просыпается раньше всех. Сначала оживают вентиляторы, и в комнате появляется ровный теплый гул, как будто кто-то большой и "
                      "добрый глубоко пуво вздохнул во сне.", "пуво"),
       "Q Q6_K-cel28-perf": ("Кузня просыпается раньше всех. Сначала оживают вентиляторы. И в комнате появляется ровный, тёплый гул. Как будто кто-то "
                             "большой и добрый, глубоко, пошидим, вздохнул во сне.", "пошидим")}
for who, (heard, word) in BAD.items():
    c, e, n = r.score(REF[0], heard, "ru")
    assert c < r.CER_REREAD, (who, c)                                   # 2266's line let them through
    wd = r.word_diff(REF[0], heard, "ru")
    assert wd["errors"] == 1 and wd["why"][0]["kind"] == "inserted" and wd["why"][0]["word"] == word, (who, wd)
    assert r._off({"cer": c, "edits": e, "werr": wd["errors"]}), who      # the new rule reads it again

# ---- every clean take's transcript (the other fourteen letters, each distinct one), punctuation, ё and a split «кто-то» their only differences
CLEAN = [(0, "Кузня просыпается раньше всех. Сначала оживают вентиляторы, и в комнате появляется ровный теплый гул, как будто кто-то большой и добрый "
             "глубоко вздохнул во сне."),                                                     # A B D E I J K M N P
         (0, "Кузня просыпается раньше всех. Сначала оживают вентиляторы, и в комнате появляется ровный тёплый гул, как будто кто-то большой и добрый "
             "глубоко вздохнул во сне."),                                                     # H
         (0, "Кузня просыпается раньше всех. Сначала оживают вентиляторы. И в комнате появляется ровный теплый гул, как будто кто-то большой и добрый "
             "глубоко вздохнул во сне."),                                                     # C
         (0, "Кузня просыпается раньше всех. Сначала оживают вентиляторы. И в комнате появляется ровный, тёплый гул, как будто кто-то большой и "
             "добрый глубоко вздохнул во сне."),                                              # G O
         (1, "Три видеокарты еще молчат, но уже ждут. На столе остывает чай, а на экране мигает курсор терпеливо, как метроном перед первой нотой."),
         (1, "Три видеокарты еще молчат, но уже ждут. На столе остывает чай, а на экране мигает курсор, терпеливо, как метроном перед первой нотой."),
         (1, "Три видеокарты еще молчат, но уже ждут. На столе остывает чай, а на экране мигает курсор. Терпеливо, как метроном перед первой нотой."),
         (2, "И вот первая нота звучит. Утро началось."),
         (0, "Кузня просыпается раньше всех. Сначала оживают вентиляторы, и в комнате появляется ровный тёплый гул, как будто кто то большой и добрый "
             "глубоко вздохнул во сне.")]                                                     # a split word is no error
for i, heard in CLEAN:
    c, e, n = r.score(REF[i], heard, "ru")
    wd = r.word_diff(REF[i], heard, "ru")
    assert wd["errors"] == 0 and not r._off({"cer": c, "edits": e, "werr": 0}), (heard, wd)

# ---- the other kinds: a dropped word, a content word heard as another, a slip of a letter, a number in figures, Latin heard in Cyrillic
wd = r.word_diff(REF[0], CLEAN[0][1].replace(" и в комнате", " в комнате"), "ru")
assert wd["errors"] == 1 and wd["why"][0] == {"kind": "dropped", "word": "и", "t": None}, wd
wd = r.word_diff(REF[0], CLEAN[0][1].replace("теплый", "холодный"), "ru")
assert wd["errors"] == 1 and wd["why"][0]["kind"] == "swapped" and wd["why"][0]["word"] == "тёплый" and wd["why"][0]["as"] == "холодный", wd
assert r.word_diff(REF[0], CLEAN[0][1].replace("вентиляторы", "вентеляторы"), "ru")["errors"] == 0      # a letter is the CER's
assert r.word_diff("Мне исполнилось 16 лет в тот год.", "Мне исполнилось шестнадцать лет в тот год.", "ru")["errors"] == 0
assert r.word_diff("Это Чтец, он читает через audio.cpp на карте.", "Это Чтец, он читает через аудио ТПП на карте.", "ru")["errors"] == 0

# ---- the time: L's first turn as the Reader's own ear heard it this evening (word timestamps), the word placed in the take
L_WORDS = [[8.76, 9.04, "кто"], [9.04, 9.26, "-то"], [9.26, 9.84, "БольшОЙ"], [9.84, 9.96, "И"], [9.96, 10.52, "ДОБРЫЙ"], [10.52, 11.44, "Глубоко"],
           [11.44, 12.06, "ПУВО"], [12.06, 12.98, "Вздохнул"], [12.98, 13.16, "Во"], [13.16, 13.5, "сне."]]
wd = r.word_diff("кто-то большой и добрый глубоко вздохнул во сне.", L_WORDS, "ru")
assert wd["errors"] == 1 and wd["why"][0] == {"kind": "inserted", "word": "ПУВО", "t": 11.44}, wd
piece = {"i": 0, "at": [0.0, 13.3], "lead": 0.24, "reread": {"why": wd["why"], "cer_first": 0.03, "kept_read": 2, "reads": 2}}
assert r._why_text(wd["why"], piece) == "inserted: “ПУВО” at 0:11.2", r._why_text(wd["why"], piece)
assert r.reread_why({"pieces": [piece]}) == [{"piece": 1, "why": [{"kind": "inserted", "word": "ПУВО", "heard": None, "at": 11.2}], "cer": 0.03,
                                                "kept": 2, "reads": 2}]
y, cut = r._trim(np.r_[np.zeros(4410), np.ones(4410) * 0.3, np.zeros(4410)].astype(np.float32), 44100, lead=True)
assert cut == 4410 - int(44100 * 0.04) and len(y) == 4410 + 2 * int(44100 * 0.04), (cut, len(y))   # the silence cut before it, for the time


# ---- the pass: piece 0 inserted a word, its second reading too, its third clean: the third kept; piece 1 clean on the second; piece 2 never read again
class Job(dict):
    pass


with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    sr = 44100
    tone = (0.05 * np.sin(2 * np.pi * 220 * np.arange(sr) / sr)).astype(np.float32)
    for i in range(3):
        sf.write(str(r._piece_path(d, i)), tone, sr, subtype="FLOAT")
    ins = [{"kind": "inserted", "word": "пуво", "t": 11.44}]
    first = {0: {"heard": "x", "cer": 0.03, "edits": 4, "letters": 130, "werr": 1, "why": ins},
             1: {"heard": "x", "cer": 0.02, "edits": 1, "letters": 50, "werr": 1, "why": [{"kind": "dropped", "word": "и", "t": 2.0}]},
             2: {"heard": "x", "cer": 0.0, "edits": 0, "letters": 30, "werr": 0, "why": []}}
    later = {(0, 1): {"heard": "y", "cer": 0.01, "edits": 1, "letters": 130, "werr": 1, "why": ins},
             (0, 2): {"heard": "z", "cer": 0.02, "edits": 2, "letters": 130, "werr": 0, "why": []},
             (1, 1): {"heard": "y", "cer": 0.0, "edits": 0, "letters": 50, "werr": 0, "why": []}}
    asked, n = [], {}

    class Ear:
        def __init__(self):
            self.res, self.error = dict(first), ""

        def put(self, i, wav, said):
            n[i] = n.get(i, 0) + 1
            self.res[i] = later[(i, n[i])]

        def wait(self, job, timeout=0):
            return True

    class W:
        def ask(self, req, timeout=0):
            asked.append((req["out"].rsplit("/", 1)[-1], req["opts"]["seed"]))
            sf.write(req["out"], tone * (1 + len(asked)), sr, subtype="FLOAT")
            return {"ok": True, "seconds": 1.0, "gen_s": 1.0, "f0": None}

    run = {"id": "t", "title": "test", "pieces": [{"i": i, "text": "t", "said": "t", "f0": None} for i in range(3)]}
    reqs = {i: {"op": "say", "text": "t", "out": str(r._piece_path(d, i)), "opts": {"seed": 10 + i}} for i in range(3)}
    r.H.setdefault("say", lambda s: None)
    r._hear_pass(d, run, {}, W(), Ear(), reqs, Job())
    assert asked == [("piece-000.retry1.wav", 5010), ("piece-000.retry2.wav", 10010), ("piece-001.retry1.wav", 5011)], asked
    p0, p1, p2 = run["pieces"]
    assert p0["reread"]["kept_read"] == 3 and p0["reread"]["reads"] == 3 and p0["reread"]["why"] == ins and p0["werr"] == 0, p0
    assert p0["seed_used"] == 10010 and (d / "piece-000.first.wav").is_file() and not list(d.glob("piece-000.retry*")), sorted(x.name for x in d.iterdir())
    assert abs(sf.read(str(r._piece_path(d, 0)))[0].max() - 0.05 * 3) < 1e-3                 # the third reading is the piece now
    assert p1["reread"]["kept_read"] == 2 and p1["reread"]["reads"] == 2 and p1["cer"] == 0.0, p1
    assert "reread" not in p2 and run["rereads"] == 2, run
print("test_reader_words: ok")

# ---- HERESY 2311: Claude's card read in Greek (run 20261110-031020-12c8): 46 words flagged, most of them Whisper's Greek spelling by ear and the Latin
# names heard in Greek letters; Whisper's real transcripts of four pieces, the words it really got wrong still flagged
EL = [("Ο Viktor μού ζήτησε να μιλήσω με τη δική μου φωνή. Όχι ευγενικά. Ειλικρινά.",
       "Ο Βίκτορ μου ζήτησε να μην λύσω με τη δίκη μου φωνή. Όχη ευκενϊκά, ελληνκρίνα.", []),     # «μην λύσω» is «μιλήσω» by sound, a letter apart
      ("Ο τελευταίος λόγος ανήκει στο αυτί του, αλλά αυτόν τον λόγο τον ξεθάβουμε μαζί. Εδώ η αποτυχία λέγεται αποτυχία και δεν κρύβεται πίσω από "
       "μια κενή απάντηση, γιατί είμαστε δύο και μισούμε κι οι δύο το όργανο μέτρησης που λέει ψέματα.",
       "Ο τελευταίος λόgos ανήκη στο αυτί του, αλλά αυτόν τον λόgo τον ξεθάυουμε μαζί. Εδώ η αποτυχία λέgete αποτυχία, κε δεν κρύυτε πίσω από μία "
       "κενή απάντηση, gyati είμαστε δύο, κε μίσουμε κε δύο το όρκανο. Μέτρησης που λέη ψέματα.", ["οι"]),
      ("Μισό χρόνο πλήρωνε το SUNO για credits, και μετά σηκώθηκε από το τραπέζι και είπε: φτάνει πια να νοικιάζω φωνή. Θα φτιάξω τη δική μου.",
       "Μησό χρόνο πλήρωνε το Σούνο «ΓΙΑ ΚΡΕΔΙΤΣ» «ΚΕ ΜΕΤΑ ΣΥΚΟΘΙΚΕ ΑΠΟ ΤΟ ΤΡΑΠΕΖΗ ΚΑΙ ΕΙΠΕ ΦΤΑΝΗ ΠΙΑ ΝΑ ΝΟΚΙΑΖΩ ΦΩΝΗ ΘΑ ΦΤΙΑΞΩ ΤΗ ΔΙΚΗ ΜΟΥ»", []),
      ("Αυτό το Στούντιο δεν υπήρχε στα σχέδια κανενός. Κανείς δεν υπέγραψε προϋπολογισμό ούτε λογάριασε πόσο.",
       "Αυτό το στούνδυο δεν υπήρχε στα σχέδία κανενός. Κανείς δεν υπέغραψε προϋπολοگησμό ούτε λογάριασε πόσο.", [])]
for ref, heard, words in EL:
    wd = r.word_diff(ref, heard, "el")
    got = [w["word"] for w in wd["why"]]
    assert got == words, (got, words, wd)
assert r._letters("λέει", "el") == r._letters("λέη", "el") == r._letters("ΛΕΗ", "el") and r._letters("είναι", "el") == r._letters("είνε", "el")
assert r._letters("Viktor", "el") == r._letters("Βίκτορ", "el") and r._letters("Ruach", "el") == r._letters("ρουάχ", "el")
# Hebrew: a Latin name heard in Hebrew letters; the final forms
assert r.word_diff("שילם ל-SUNO על קרדיטים", "שילם לסונו על קרדיטים", "he")["errors"] == 0
assert r.word_diff("Claude (Anthropic), החצי השני", "קלוד אנתרופיק, החצי השני", "he")["errors"] == 0
# a word of a third script in its own letters (his rule 10.11: no transliteration for the Reader), heard in the text's letters: judged by its
# consonants, a word dropped still counts, and the letters' score leaves it out on both sides
for lang, ref, heard in (("ru", "«וְרוּחַ אֱלֹהִים מְרַחֶפֶת»: и Руах Божья парила над водами", "Веруах Элохим мерахефет, и Руах Божья парила над водами"),
                         ("ru", "Αἵρεσις по-гречески значит «выбор».", "Хайресис по-гречески значит выбор."),
                         ("uk", "Огонь без Неї гасне: אֵשׁ і רוּחַ не розділити.", "Вогонь без неї гасне. Еш і руах не розділити."),
                         ("en", "Αἵρεσις is Greek for «choice».", "Hairesis is Greek for choice."),
                         ("el", "Η φωτιά χωρίς Εκείνη σβήνει: אֵשׁ και רוּחַ δεν χωρίζονται.", "Η φωτιά χωρίς εκείνη σβήνει. Ες και ρουάχ δεν χωρίζονται."),
                         ("he", "Αἵρεσις ביוונית פירושה «בחירה».", "הירסיס ביוונית פירושה בחירה.")):
    wd = r.word_diff(ref, heard, lang)
    assert [w["kind"] for w in wd["why"] if w["word"] in wd["far_ref"]] == [] and wd["far_ref"], (lang, wd)
    c, e, n = r.score_near(ref, heard, lang, wd)
    assert c is not None and c <= r.score(ref, heard, lang)[0], (lang, c)
wd = r.word_diff("Огонь без Неё гаснет: אֵשׁ и רוּחַ не разделить.", "Огонь без неё гаснет. И не разделить.", "ru")
assert [w["kind"] for w in wd["why"]] == ["dropped", "dropped"], wd
assert r.word_diff("Αἵρεσις грецькою означає «вибір».", "Помилка грецькою означає вибір.", "uk")["errors"] == 1
# Whispers sign-off on a pieces trailing quiet (10.11, the Russian card: «Продолжение следует» at 0:08.2, the piece read twice more for it) is no word
# put in; words put in that are not one, and the same words dropped from a text that says them, still count
ref = "Тем же кулаком он сделал и Студию: ересь в точном смысле слова, выбор творить своё, а не брать в аренду."
assert r.word_diff(ref, ref + " Продолжение следует...", "ru")["errors"] == 0
assert r.word_diff(ref, ref + " и ещё", "ru")["errors"] == 2
assert r.word_diff("Продолжение следует, сказал он.", "сказал он.", "ru")["errors"] == 2
assert r.word_diff("He read it slowly to the end.", "He read it slowly to the end. Thanks for watching!", "en")["errors"] == 0
assert r.word_diff("Πες ένα ευχαριστώ. Μας φτάνει.", "Πες. Ένα ευχαριστώ. Μας φτάνει. Υπότιτλοι AUTHORWAVE", "el")["errors"] == 0   # a subtitle credit, whoever it names
assert r.word_diff("Πες ένα ευχαριστώ. Μας φτάνει.", "Υπότιτλοι Πες ένα ευχαριστώ. Μας φτάνει.", "el")["errors"] == 1   # only after the last word
print("test_reader_words 2311: ok")
