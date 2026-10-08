"""HERESY 1167 (Viktor, the night of 05.10.2026: «Ты можешь у Тренера прикрутить… что определяет тип голоса? Мужской или
женский, регистр? Нам не нужны Имена человеков, а нужны именно их тональности»): a set's voice by measure, not by name. The
pitch of the voiced frames (pYIN) over a sample of its tracks: the median and its spread, then male or female and the
register the median falls in, and a name made of them (voice-m-baritone-1). A draft by measure: the ear decides, and
the voice YuE2 then sings may sit higher or lower than the speech it learned from (Viktor heard a reader's adapter sing
as a baritenor).

Speaking pitch, the median of the voiced frames (Hz):
    men     bass < 95 · baritone 95–115 · baritenor 115–135 · tenor 135+
    women   contralto < 175 · mezzo 175–200 · soprano 200+          (the boundary between the two: 160)

HERESY 1169 (the Trainer shows it beside the set, «мерить на речи и на пении»): on singing the pitch follows the melody, so
the measure gives the range sung (its notes, low · middle · high at the 10th, 50th and 90th percentile) and male or female
only where the pitch alone says it (a middle under 200 Hz or over 300 Hz); the register is left to the ear there.

    python3 voice_kind.py [--male|--female] [--sung] datasets/raw/NAME [...]      prints and keeps NAME/voice-kind.json"""
import json, random, sys
from pathlib import Path

import numpy as np

MALE = [(95, "bass"), (115, "baritone"), (135, "baritenor"), (1e9, "tenor")]
FEMALE = [(175, "contralto"), (200, "mezzo"), (1e9, "soprano")]
SPLIT = 160.0


BAND = (140.0, 175.0)    # a low woman and a high man share it: the pitch alone does not tell them apart there
SUNG_BAND = (200.0, 300.0)   # sung, a tenor and a contralto share far more


def note(hz):
    """A pitch as the nearest note, A4 = 440 Hz (C4 the middle C)."""
    n = int(round(12 * np.log2(hz / 440.0))) + 57
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n % 12] + str(n // 12)


def measure(folder, tracks=12, seconds=20.0, seed=1167, voice=None, mode="speech"):
    """voice: "male" or "female" when it is known (the Trainer's choice, a set's label); else by the pitch, and in BAND
    «uncertain» (a woman's register is then given as well as a man's). mode "sung": the range sung, no register."""
    import librosa
    folder = Path(folder)
    files = sorted(f for f in folder.rglob("*") if f.suffix.lower() in {".wav", ".flac", ".mp3", ".ogg", ".m4a"})
    random.Random(seed).shuffle(files)
    f0s = []
    for f in files[:tracks]:
        try:
            y, sr = librosa.load(str(f), sr=16000, mono=True, duration=seconds)
        except Exception:                      # noqa: BLE001: a file that does not load is left out
            continue
        f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=600, sr=sr, frame_length=1024)
        v = f0[voiced & ~np.isnan(f0)]
        if v.size:
            f0s.append(v)
    if not f0s:
        return {"error": "no voiced frames found"}
    allf = np.concatenate(f0s)
    med, p10, p90 = (float(np.percentile(allf, q)) for q in (50, 10, 90))
    by = "given" if voice in ("male", "female") else "pitch"
    if mode == "sung":
        if by == "pitch":
            voice = "uncertain" if SUNG_BAND[0] <= med <= SUNG_BAND[1] else "female" if med > SUNG_BAND[1] else "male"
        return {"median_hz": round(med, 1), "p10_hz": round(p10, 1), "p90_hz": round(p90, 1), "voice": voice, "voice_by": by,
                "tracks": len(f0s), "mode": "sung", "low": note(p10), "mid": note(med), "high": note(p90), "name": None,
                "note": "by measure of the sung pitch, with the songs' music under it: the range sung; the ear names the voice"}
    if by == "pitch":
        voice = "uncertain" if BAND[0] <= med < BAND[1] else "female" if med >= SPLIT else "male"
    reg = lambda table: next(name for top, name in table if med < top)
    out = {"median_hz": round(med, 1), "p10_hz": round(p10, 1), "p90_hz": round(p90, 1), "voice": voice, "voice_by": by,
           "tracks": len(f0s), "mode": "speech", "low": note(p10), "mid": note(med), "high": note(p90),
           "note": "by measure of the speaking pitch; the ear decides, and the sung voice may sit elsewhere"}
    if voice == "uncertain":
        out.update(register_if_male=reg(MALE), register_if_female=reg(FEMALE),
                   name=None, ask="140–175 Hz is shared by a low woman and a high man: say which")
    else:
        out.update(register=reg(FEMALE if voice == "female" else MALE))
        out["name"] = f"voice-{'f' if voice == 'female' else 'm'}-{out['register']}"
    return out


if __name__ == "__main__":
    given = next((a[2:] for a in sys.argv[1:] if a in ("--male", "--female")), None)
    for arg in (a for a in sys.argv[1:] if not a.startswith("--")):
        r = measure(arg, voice=given, mode="sung" if "--sung" in sys.argv else "speech")
        Path(arg, "voice-kind.json").write_text(json.dumps(r, indent=1), encoding="utf-8")
        print(Path(arg).name, json.dumps(r), flush=True)
