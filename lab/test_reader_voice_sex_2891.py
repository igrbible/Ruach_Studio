"""HERESY 2891: one's own voice's profile set by hand (Viktor 15.11.2026: a high man's voice was taken for a woman's; «дать ручной выбор профиля
для своих голосов»): kept as gender_set over the measured one, said in its row with what its pitch gave, «auto» back to the pitch; a word not a
profile refused; and the TTS Voice Upscaler's Auto takes it for a reading in such voices (set_profile: one profile, Mixed when they differ,
nothing when any voice of the reading has none). Kept home with the Narrator's other checks.
    .venv/bin/python lab/test_reader_voice_sex_2891.py"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "builtin_steps" / "ruach"))
import reader as r  # noqa: E402
import test_reader_voice_edit_2885 as t85  # noqa: E402,F401   its tone() and refused(); its own checks run once more on import
try:
    import tts_upscale as tu  # noqa: E402
except ImportError:         # HERESY 2925: the TTS Voice Upscaler stays home (make-release, 2312): its part skipped in a public tree
    tu = None

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


old = r.H.get("kit")
with tempfile.TemporaryDirectory() as tmp:
    r.H["kit"] = Path(tmp)
    try:
        r.voices_home().mkdir(parents=True, exist_ok=True)
        v = r.voice_add({"name": "Высокий", "lang": "ru", "text": "слова", "consent": True, "audio_b64": t85.tone(200), "ext": "wav", "gender": "male"})
        vid = v["id"]
        rec = lambda: json.loads((r.voices_home() / (vid + ".json")).read_text(encoding="utf-8"))   # noqa: E731
        check(rec().get("gender_set") == "male" and v["gender"] == "male" and v["gender_set"] == "male", f"kept as male by hand ({v})")
        check(v["gender_heard"] == "female", f"its row says what its pitch gave too ({v['gender_heard']}, {v.get('f0')} Hz)")
        e = r.voice_edit({"id": vid, "gender": "male"})
        check(e["changed"] == [], "the same profile again: nothing changed")
        e = r.voice_edit({"id": vid, "gender": "auto"})
        check(e["changed"] == ["profile"] and "gender_set" not in rec() and e["gender"] == "female" and e["gender_set"] == "", f"«auto»: back to its pitch ({e})")
        e = r.voice_edit({"id": vid, "gender": "female"})
        check(e["changed"] == ["profile"] and rec()["gender_set"] == "female", "set to female by hand")
        check(t85.refused(lambda: r.voice_edit({"id": vid, "gender": "child"}), "profile"), "a word that is no profile refused")
        w = r.voice_add({"name": "Без", "lang": "ru", "text": "слова", "consent": True, "audio_b64": t85.tone(120), "ext": "wav"})
        check("gender_set" not in json.loads((r.voices_home() / (w["id"] + ".json")).read_text(encoding="utf-8")) and w["gender"] == "male", "none asked: measured as before")
        if tu is None:
            print("  skip  the upscaler's Auto: tts_upscale is not in this tree (it stays home)")
        else:
            # the upscaler's Auto: the take's request names its voices
            take = Path(tmp) / "outputs" / "t1"
            take.mkdir(parents=True)
            def told(voices):
                (take / "request.json").write_text(json.dumps({"reader": {"voices": voices}}), encoding="utf-8")
                return tu.set_profile(take, r.voices_home())
            r.voice_edit({"id": vid, "gender": "male"})
            check(told({"": vid}) == "male", "a reading in a voice set to male: Male, not measured")
            r.voice_edit({"id": w["id"], "gender": "female"})
            check(told({"A": vid, "B": w["id"]}) == "mixed", "two voices set apart: Mixed")
            check(told({"A": vid, "B": "made-ru-x"}) is None, "a voice without a profile set (or not there): measured as before")
            check(told({}) is None and tu.set_profile(Path(tmp) / "nowhere", r.voices_home()) is None, "no voices named, no request: measured as before")
            check(told({"": "../x"}) is None, "a voice id that is no name: nothing read")
    finally:
        if old is None:
            r.H.pop("kit", None)
        else:
            r.H["kit"] = old
print(f"test_reader_voice_sex_2891: {ok} passed")
