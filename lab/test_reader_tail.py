"""HERESY 2335: the guard of each piece's tail, without a card or Whisper: a made-up voice (a gliding pitch with its harmonics, in syllables)
with what can follow its last word: a hum, a steady 8 kHz tone, a breath, nothing; a tone under its words; a silence inside it. Then the pass
over a run's pieces with the ear's words given: the hum and the tone cut where the speech ended (the reading as read kept beside it), the
breath left, the tone under the words and a piece far off the run's level said, the take's note saying it all."""
import sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import soundfile as sf
import reader as r
import reader_tail as rt

SR = 44100
rng = np.random.default_rng(7)


def voice(sec, f0a=110.0, f0b=140.0, level=0.3):
    """A spoken-like voice: its pitch gliding, ten harmonics falling off, in syllables of 0.2 s."""
    t = np.arange(int(SR * sec)) / SR
    f0 = f0a + (f0b - f0a) * t / max(sec, 1e-6) + 6 * np.sin(2 * np.pi * 3.1 * t)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    y = sum(np.sin(k * ph) / k for k in range(1, 11))
    env = 0.55 + 0.45 * np.sin(2 * np.pi * 2.5 * t) ** 2
    return (level * y / 3 * env).astype(np.float32)


def sil(sec):
    return np.zeros(int(SR * sec), np.float32)


def tone(sec, hz=8000.0, level=0.03):
    t = np.arange(int(SR * sec)) / SR
    return (level * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def hum(sec, level=0.12):
    return voice(sec, 150.0, 146.0, level)


def breath(sec, level=0.02):
    from scipy.signal import butter, sosfilt
    return (level * sosfilt(butter(4, [800, 6000], "band", fs=SR, output="sos"), rng.standard_normal(int(SR * sec)))).astype(np.float32)


WORDS = [[0.1, 0.9, "Первое"], [0.95, 1.5, "слово"], [1.55, 2.0, "конец."]]
SAID = "Первое слово конец."
fold = lambda s: r._letters(s, "ru")   # noqa: E731

with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    cases = {
        "hum": np.concatenate([sil(0.1), voice(1.9), sil(0.25), hum(0.6), sil(0.2)]),
        "tone": np.concatenate([sil(0.1), voice(1.9), sil(0.2), tone(0.9), sil(0.2)]),
        "breath": np.concatenate([sil(0.1), voice(1.9), sil(0.15), breath(0.5), sil(0.2)]),
        "clean": np.concatenate([sil(0.1), voice(1.9), sil(0.4)]),
    }
    got = {}
    for k, x in cases.items():
        sf.write(str(d / f"{k}.wav"), x, SR, subtype="FLOAT")
        got[k] = rt.check(d / f"{k}.wav", SAID, WORDS, fold)
    assert got["hum"]["tail"]["kind"] == "voiced" and 2.0 <= got["hum"]["tail"]["cut"] <= 2.25 and got["hum"]["tone"] is None, got["hum"]
    assert got["tone"]["tail"]["kind"] == "tone" and abs(got["tone"]["tail"]["hz"] - 8000) < 30, got["tone"]
    assert got["breath"]["tail"]["kind"] == "noise" and got["breath"]["tone"] is None, got["breath"]
    assert got["clean"]["tail"] is None and got["clean"]["tone"] is None and got["clean"].get("hole") is None, got["clean"]
    assert rt.check(d / "hum.wav", SAID, WORDS, fold, tag_end=True)["tail"] is None          # the text asked a sound at its end: kept
    sf.write(str(d / "joined.wav"), np.concatenate([sil(0.1), voice(1.9), hum(1.2), sil(0.2)]), SR, subtype="FLOAT")
    j = rt.check(d / "joined.wav", SAID, WORDS, fold)
    assert j["tail"] and j["tail"].get("joined") and j["tail"]["kind"] == "voiced", j           # no silence after the word: said, never cut
    assert rt.check(d / "hum.wav", SAID, [[0.1, 0.9, "Первое"]], fold)["tail"] is None          # its last word not heard: the word guard's
    # a tone under the words, a silence inside the speech
    x = np.concatenate([sil(0.1), voice(1.9), sil(0.3)])
    x[int(SR * 0.6):int(SR * 0.6) + len(tone(0.9))] += tone(0.9, level=0.02)
    sf.write(str(d / "under.wav"), x, SR, subtype="FLOAT")
    u = rt.check(d / "under.wav", SAID, WORDS, fold)
    assert u["tone"] and 0.5 <= u["tone"]["from"] <= 0.75 and u["tail"] is None, u
    sf.write(str(d / "hole.wav"), np.concatenate([sil(0.1), voice(0.8), sil(1.6), voice(1.0), sil(0.3)]), SR, subtype="FLOAT")
    h = rt.check(d / "hole.wav", SAID, [[0.1, 0.9, "Первое"], [2.5, 3.0, "слово"], [3.1, 3.5, "конец"]], fold)
    assert h["hole"] and abs(h["hole"]["s"] - 1.6) <= 0.1 and abs(h["hole"]["from"] - 0.9) <= 0.1, h
    n = rt.cut(d / "hum.wav", 2.1, d / "hum.tail.wav")
    y, _ = sf.read(str(d / "hum.wav"))
    assert abs(n - 2.1) < 0.01 and abs(len(y) / SR - 2.1) < 0.01 and (d / "hum.tail.wav").is_file() and abs(y[-1]) < 1e-6, n

    # ---- the pass over a run: cut, kept beside, said; a piece 6 dB off the run's level said
    run = {"id": "20261110-000000-abcd", "lang": "ru", "tags": False, "pieces": []}
    xs = [cases["hum"], cases["clean"], cases["tone"], cases["clean"] * 0.25, cases["clean"],
          np.concatenate([sil(0.1), voice(1.9), hum(1.2), sil(0.2)])]                      # piece 6: a hum joined to its last word
    for i, x in enumerate(xs):
        sf.write(str(d / f"piece-{i:03d}.wav"), x, SR, subtype="FLOAT")
        run["pieces"].append({"i": i, "text": SAID, "said": SAID, "plain": SAID, "speaker": "", "gap": 0.35})
    x = np.concatenate([sil(0.1), voice(1.9), sil(0.3)])
    x[int(SR * 0.6):int(SR * 0.6) + len(tone(0.9))] += tone(0.9, level=0.02)
    sf.write(str(d / "piece-001.wav"), x, SR, subtype="FLOAT")                            # piece 2: a tone under its words

    class Ear:
        res = {i: {"cer": 0.0, "words": WORDS} for i in range(len(xs))}

        def ref(self, said):
            return said

    said = []
    r.H["say"] = said.append
    r._tail_pass(d, run, Ear())
    P = run["pieces"]
    assert run["tails"] == 2 and run["tones"] == 1 and run["level_off"] == 1 and not run.get("tail_error"), (run, said)
    assert P[0]["tail"]["kind"] == "voiced" and (d / "piece-000.tail.wav").is_file() and P[0]["seconds"] < 2.3, P[0]
    assert P[2]["tail"]["kind"] == "tone" and (d / "piece-002.tail.wav").is_file() and "tone" not in P[2], P[2]   # the tone was the tail: cut, not said twice
    assert P[1]["tone"]["hz"] > 7900 and "tail" not in P[1], P[1]
    assert P[5]["tail"].get("joined") and not P[5]["tail"].get("cut_done") and not (d / "piece-005.tail.wav").is_file(), P[5]
    assert P[3]["level_off"] <= -6 and all(p.get("level_off") is None for k, p in enumerate(P) if k != 3), [p.get("level_off") for p in P]
    assert any("piece 1: a voice after its last word" in s for s in said) and any("piece 2: a steady tone" in s for s in said), said
    note = r._heard_note(run)
    assert "2 tail(s) after the last word cut" in note and "a steady tone under the words of 1 piece" in note and "1 piece(s) 6 dB" in note, note
    # a guard that could not look says so, never a clean piece by silence
    bad = {"id": "x", "lang": "ru", "pieces": [{"i": 0, "text": SAID, "said": SAID}]}
    (d / "piece-000.wav").write_bytes(b"not a wav")

    class Ear2(Ear):
        res = {0: {"cer": 0.0, "words": WORDS}}

    r._tail_pass(d, bad, Ear2())
    assert bad.get("tail_error") and "the tail guard could not look" in r._heard_note(bad), bad
print("test_reader_tail: ok")
