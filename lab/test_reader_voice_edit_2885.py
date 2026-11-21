"""HERESY 2885: one's own voice edited: renamed, its words and its language written anew, its clip replaced by a new piece on the word of
consent (the old clip put aside under its time, its pitch measured again); nothing changed, nothing written; a stock voice, an empty name or
words refused; a reference's key follows the clip and the words, so a worker's cache never reads an edited voice as it was. Kept home with
the Narrator's other checks.
    .venv/bin/python lab/test_reader_voice_edit_2885.py"""
import base64
import io
import json
import math
import struct
import sys
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reader as r  # noqa: E402

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


def tone(hz, seconds=2.0, sr=24000):
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * hz * i / sr) * (0.6 + 0.4 * math.sin(2 * math.pi * 3 * i / sr))))
                               for i in range(int(seconds * sr))))
    return base64.b64encode(b.getvalue()).decode()


def refused(fn, word):
    try:
        fn()
    except ValueError as e:
        return word in str(e)
    return False


old = r.H.get("kit")
said = []
r.H.setdefault("say", said.append)
with tempfile.TemporaryDirectory() as tmp:
    r.H["kit"] = Path(tmp)
    try:
        r.voices_home().mkdir(parents=True, exist_ok=True)
        v = r.voice_add({"name": "Мой голос", "lang": "ru", "text": "первые слова", "consent": True, "audio_b64": tone(140), "ext": "wav"})
        vid = v["id"]
        rec = lambda: json.loads((r.voices_home() / (vid + ".json")).read_text(encoding="utf-8"))
        check(vid.startswith("own-") and v["name"] == "Мой голос", f"a voice of one's own kept ({v})")
        e = r.voice_edit({"id": vid, "name": "Мой голос"})
        check(e["changed"] == [] and e["name"] == "Мой голос", f"nothing changed, nothing said changed ({e})")
        vs = {x["id"]: x for x in r._voice_rows()}
        k0 = r._voice_ref(vid, vs)["key"]
        e = r.voice_edit({"id": vid, "name": "  Новое   имя ", "lang": "uk"})
        check(e["changed"] == ["name", "language"] and e["name"] == "Новое имя" and e["lang"] == "uk", f"renamed, its language set ({e})")
        e = r.voice_edit({"id": vid, "text": "другие слова этого отрезка"})
        vs = {x["id"]: x for x in r._voice_rows()}
        k1 = r._voice_ref(vid, vs)["key"]
        check(e["changed"] == ["words"] and rec()["text"] == "другие слова этого отрезка" and k1 != k0, f"its words written anew, the reference's key with them ({k0} → {k1})")
        check(refused(lambda: r.voice_edit({"id": vid, "name": "  "}), "name"), "an empty name refused")
        check(refused(lambda: r.voice_edit({"id": vid, "text": ""}), "words"), "empty words refused")
        check(refused(lambda: r.voice_edit({"id": vid, "audio_b64": tone(220)}), "consent"), "a new clip without the word of consent refused")
        before = (r.voices_home() / (vid + ".wav")).read_bytes()
        e = r.voice_edit({"id": vid, "audio_b64": tone(220), "consent": True, "ext": "wav"})
        after = (r.voices_home() / (vid + ".wav")).read_bytes()
        gone = list((r.voices_home().parent / "voices-removed").glob(vid + ".*.wav"))
        vs = {x["id"]: x for x in r._voice_rows()}
        k2 = r._voice_ref(vid, vs)["key"]
        check(e["changed"] == ["clip"] and after != before and len(gone) == 1 and gone[0].read_bytes() == before, f"a new clip, the old one put aside whole ({gone})")
        check(rec()["consent"]["given"] is True and "new clip" in rec()["consent"]["how"], "the consent kept for the new clip")
        check(rec().get("f0_by") == "pyin" and rec().get("f0"), f"its pitch measured again ({rec().get('f0')})")
        check(k2 != k1, "the reference's key follows the clip")
        check(not list(r.voices_home().glob("*.new.wav")) and not list(r.voices_home().glob("*.source*")), "nothing half-made left beside the voices")
        (r.voices_home() / "made-x.wav").write_bytes(after)
        (r.voices_home() / "made-x.json").write_text(json.dumps({"name": "x", "kind": "made", "text": "x"}), encoding="utf-8")
        check(refused(lambda: r.voice_edit({"id": "made-x", "name": "y"}), "one's own"), "a voice not one's own refused")
        check(any("edited" in s and vid in s for s in said), "the lab's log says each edit")
    finally:
        if old is None:
            r.H.pop("kit", None)
        else:
            r.H["kit"] = old
print(f"test_reader_voice_edit_2885: {ok} passed")
