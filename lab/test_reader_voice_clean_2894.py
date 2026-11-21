"""HERESY 2894: one's own voice's clip cleaned before it is kept (Viktor 15.11.2026: «Шумодав и апскейлер для донорских семплов в блоке своих
голосов (опция)»): the TTS Voice Upscaler step asked with the mode and the voice's profile, its result kept at 24 kHz mono, the clip as recorded put
aside, the voice saying how it was cleaned; on an edit, a new clip cleaned before it takes the old one's place, or the clip it has cleaned; a word
that is no cleaning refused, a step that fails leaves the voice as it was, no Narrator's environment said so. The step stood in for by a script
that halves the clip's level and says what it was asked. Kept home with the Narrator's other checks.
    .venv/bin/python lab/test_reader_voice_clean_2894.py"""
import json
import os
import stat
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reader as r  # noqa: E402
import test_reader_voice_edit_2885 as t85  # noqa: E402,F401   its tone() and refused()

ok = 0


def check(cond, what):
    global ok
    assert cond, what
    ok += 1


FAKE = '''#!/bin/sh
# the step's stand-in: $1 the step, $2 the clip, $3 its folder, $4 its params
grep -q '"fail"' "$4" && { echo "the card is gone" >&2; exit 3; }
cp "$4" "$3/asked.json"
ffmpeg -v error -y -i "$2" -af volume=0.5 -c:a flac "$3/tts-upscaled.flac" || exit 2
echo '{"summary": "Clean on the processor (a stand-in)"}'
'''


def peak(p):
    with wave.open(str(p)) as w:
        fr, n = w.getframerate(), w.getnframes()
        import array
        a = array.array("h", w.readframes(n))
        return fr, w.getnchannels(), max(abs(x) for x in a)


old = r.H.get("kit")
with tempfile.TemporaryDirectory() as tmp:
    r.H["kit"] = Path(tmp)
    fake = Path(tmp) / "fakepy"
    fake.write_text(FAKE, encoding="utf-8")
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    try:
        r.voices_home().mkdir(parents=True, exist_ok=True)
        r.CLEAN_PY = None
        check(t85.refused(lambda: r.voice_add({"name": "Без среды", "lang": "ru", "text": "слова", "consent": True, "audio_b64": t85.tone(140), "ext": "wav", "clean": "clean"}),
                          "environment"), "no Narrator's environment: said, nothing kept")
        check(not list(r.voices_home().glob("own-*")), "nothing half-made left after the refusal")
        r.CLEAN_PY = str(fake)
        plain = r.voice_add({"name": "Как есть", "lang": "ru", "text": "слова", "consent": True, "audio_b64": t85.tone(140), "ext": "wav"})
        v = r.voice_add({"name": "Донор", "lang": "ru", "text": "слова", "consent": True, "audio_b64": t85.tone(200), "ext": "wav", "clean": "clean", "gender": "male"})
        vid = v["id"]
        rec = lambda: json.loads((r.voices_home() / (vid + ".json")).read_text(encoding="utf-8"))   # noqa: E731
        fr, ch, pk = peak(r.voices_home() / (vid + ".wav"))
        _, _, pk0 = peak(r.voices_home() / (plain["id"] + ".wav"))
        check(fr == 24000 and ch == 1, f"kept at 24 kHz mono ({fr}, {ch})")
        check(abs(pk - pk0 * 0.5) < pk0 * 0.05, f"the step's result kept (its level halved by the stand-in: {pk} against {pk0})")
        cc = rec().get("clip_cleaned") or {}
        check(cc.get("mode") == "clean" and cc.get("profile") == "male" and "stand-in" in cc.get("said", ""), f"the voice says how it was cleaned ({cc})")
        check(v["cleaned"] == "clean" and plain["cleaned"] == "", "its row says it; a voice kept as recorded says nothing")
        gone = list((r.voices_home().parent / "voices-removed").glob(vid + ".as-recorded.*.wav"))
        check(len(gone) == 1 and peak(gone[0])[2] > pk * 1.8, f"the clip as recorded put aside, whole ({gone})")
        check(rec().get("f0_by") == "pyin", "the cleaned clip measured")
        # an edit: the clip it has, cleaned (restore); a word that is no cleaning refused; a failing step leaves it as it was
        before = (r.voices_home() / (vid + ".wav")).read_bytes()
        e = r.voice_edit({"id": vid, "clean": "restore"})
        check(e["changed"] == ["cleaned"] and rec()["clip_cleaned"]["mode"] == "restore", f"the clip it has cleaned on an edit ({e['changed']})")
        check((r.voices_home() / (vid + ".wav")).read_bytes() != before, "its clip replaced by the cleaned one")
        check(t85.refused(lambda: r.voice_edit({"id": vid, "clean": "sparkle"}), "cleaning"), "a word that is no cleaning refused")
        now = (r.voices_home() / (vid + ".wav")).read_bytes()
        r.CLEAN_PY = str(fake)
        orig_mode = r._clean_clip
        r._clean_clip = lambda src, mode, prof, out: orig_mode(src, "fail", prof, out)
        check(t85.refused(lambda: r.voice_edit({"id": vid, "clean": "clean"}), "could not be cleaned"), "a step that fails is said")
        r._clean_clip = orig_mode
        check((r.voices_home() / (vid + ".wav")).read_bytes() == now and not list(r.voices_home().glob("*.clean.wav")), "and the voice is left as it was")
        # a new clip on an edit, cleaned before it takes the old one's place
        n0 = len(list((r.voices_home().parent / "voices-removed").glob(vid + ".*.wav")))
        e = r.voice_edit({"id": vid, "audio_b64": t85.tone(180), "consent": True, "ext": "wav", "clean": "clean"})
        n1 = len(list((r.voices_home().parent / "voices-removed").glob(vid + ".*.wav")))
        check(e["changed"] == ["clip", "cleaned"] and n1 == n0 + 2, f"a new clip cleaned: the old clip and the new one as recorded both put aside ({e['changed']}, {n0} → {n1})")
        asked = None
        check(not list(r.voices_home().glob("*.new*.wav")) and not list(r.voices_home().glob(".clean-*")), "nothing half-made beside the voices")
    finally:
        r.CLEAN_PY = None
        if old is None:
            r.H.pop("kit", None)
        else:
            r.H["kit"] = old
print(f"test_reader_voice_clean_2894: {ok} passed")
