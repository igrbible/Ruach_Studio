"""HERESY 1073: GTSinger into a raw training folder (Viktor, 01.10.2026: "конвертор из разметки").

GTSinger (github.com/AaronZ345/GTSinger, huggingface.co/datasets/GTSinger/GTSinger; CC BY-NC-SA 4.0, its
use means its terms are accepted, so it is fetched only by the user's own hand) is dry studio singing
with word-level timing, notes, techniques and global labels. Each segment is a phrase of a few seconds:

    LANG/SINGER/TECHNIQUE/SONG/GROUP/0000.wav + 0000.json (words) + .TextGrid + .musicxml

This turns one language of it into datasets/raw/GTSinger-LANG/: the WAV, its lyrics as the studio reads
them (.txt: [Verse] and the sung words, a new line at every pause), and its own style (.style.txt):
language, method, the singer's range, the technique the group sings, pace, emotion, "a cappella, dry".
Paired speech is spoken, not sung: left out unless --speech. With --join (the default) the phrases of a
song and group, numbered in singing order, are joined into one track with all its lyrics: YuE2 learns
from songs, not five-second phrases. --phrases keeps them apart.

    python gtsinger.py SRC_LANG_DIR [--lang russian] [--out datasets/raw/GTSinger-RU] [--speech] [--phrases]

What it is good for, measured 02.10.2026: the Russian part is one alto, six songs, 195 phrases (~0.2 GB):
a diction sample of one voice, not a language adapter of many."""
import argparse, json, os, re, shutil, sys, wave
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
SILENT = {"<SP>", "<AP>", "<sp>", "<ap>", ""}
TECH = {"Breathy_Group": "breathy", "Glissando_Group": "glissando", "Vibrato_Group": "vibrato", "Pharyngeal_Group": "pharyngeal",
        "Mixed_Voice_Group": "mixed voice", "Falsetto_Group": "falsetto", "Control_Group": "", "Paired_Speech_Group": "spoken"}
RANGE = {"Soprano": "female soprano vocal", "Alto": "female alto vocal", "Tenor": "male tenor vocal", "Bass": "male bass vocal"}


def lyrics(words, gap=0.5):
    """The sung words, a line at every pause of `gap` seconds or more."""
    lines, cur = [], []
    for w in words:
        if w["word"] in SILENT:
            if cur and (w["end_time"] - w["start_time"]) >= gap:
                lines.append(" ".join(cur)); cur = []
            continue
        cur.append(w["word"])
    if cur:
        lines.append(" ".join(cur))
    return "\n".join(lines)


def style(words, lang, singer, group):
    first = next((w for w in words if w["word"] not in SILENT), words[0] if words else {})
    voice = next((v for k, v in RANGE.items() if k.lower() in singer.lower()), "solo vocal")
    parts = [lang, first.get("singing_method", ""), voice, TECH.get(group, group.replace("_Group", "").replace("_", " ").lower()),
             first.get("pace", "") and first["pace"] + " pace", first.get("emotion", ""), "a cappella, dry studio vocal, no instruments"]
    return ", ".join(p for p in parts if p)


def join(src, out, lang, speech):
    """One track a song and group: its phrases' WAVs end to end (a 0.3 s rest between them), its lyrics a
    line block a phrase under [Verse], its style from its labels."""
    songs = {}
    for js in sorted(src.rglob("*.json")):
        rel = js.relative_to(src).parts
        if len(rel) < 5 or not js.with_suffix(".wav").is_file():
            continue
        if rel[3] == "Paired_Speech_Group" and not speech:
            continue
        songs.setdefault(rel[:4], []).append(js)
    n = 0
    for (singer, tech, song, group), parts in sorted(songs.items()):
        parts.sort(key=lambda p: int(re.sub(r"\D", "", p.stem) or 0))
        frames, params, texts, words0 = [], None, [], None
        for js in parts:
            words = json.load(open(js, encoding="utf-8"))
            words0 = words0 or words
            t = lyrics(words)
            if t.strip():
                texts.append(t)
            with wave.open(str(js.with_suffix(".wav"))) as w:
                p = w.getparams()
                if params and (p.nchannels, p.sampwidth, p.framerate) != (params.nchannels, params.sampwidth, params.framerate):
                    raise ValueError(f"{js}: another format than the phrases before it")
                params = params or p
                frames.append(w.readframes(w.getnframes()))
                frames.append(b"\0" * int(0.3 * p.framerate) * p.sampwidth * p.nchannels)
        if not texts:
            continue
        stem = re.sub(r"[^\w.-]+", "_", f"{singer}_{song}_{tech}_{group}", flags=re.UNICODE)   # the control group recurs under every technique
        with wave.open(str(out / (stem + ".wav")), "wb") as w:
            w.setparams(params)
            w.writeframes(b"".join(frames[:-1]))
        (out / (stem + ".txt")).write_text("[Verse]\n" + "\n\n".join(texts) + "\n", encoding="utf-8")
        (out / (stem + ".style.txt")).write_text(style(words0, lang, singer, group) + "\n", encoding="utf-8")
        n += 1
    (out / "SOURCE.md").write_text(
        "From GTSinger (AaronZ345/GTSinger), CC BY-NC-SA 4.0: attribution, non-commercial, share-alike.\n"
        "An adapter trained on it carries the same terms. Phrases joined into songs by lab/gtsinger.py.\n", encoding="utf-8")
    print(f"{n} songs into {out} (phrases joined; speech {'kept' if speech else 'left out'})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="one language folder of GTSinger, e.g. .../GTSinger/Russian")
    ap.add_argument("--lang", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--speech", action="store_true")
    ap.add_argument("--phrases", action="store_true", help="one track a phrase, not joined into songs")
    a = ap.parse_args()
    src = Path(a.src).resolve()
    lang = (a.lang or src.name).lower()
    out = Path(a.out) if a.out else KIT / "datasets" / "raw" / ("GTSinger-" + src.name[:2].upper())
    out.mkdir(parents=True, exist_ok=True)
    n = skipped = 0
    if not a.phrases:
        return join(src, out, lang, a.speech)
    for js in sorted(src.rglob("*.json")):
        wav = js.with_suffix(".wav")
        if not wav.is_file():
            continue
        rel = js.relative_to(src).parts                  # SINGER/TECHNIQUE/SONG/GROUP/0000.json
        if len(rel) < 5:
            continue
        singer, tech, song, group = rel[0], rel[1], rel[2], rel[3]
        if group == "Paired_Speech_Group" and not a.speech:
            skipped += 1
            continue
        words = json.load(open(js, encoding="utf-8"))
        text = lyrics(words)
        if not text.strip():
            skipped += 1
            continue
        stem = re.sub(r"[^\w.-]+", "_", f"{singer}_{tech}_{song}_{group}_{js.stem}", flags=re.UNICODE)
        shutil.copy2(wav, out / (stem + ".wav"))
        (out / (stem + ".txt")).write_text("[Verse]\n" + text + "\n", encoding="utf-8")
        (out / (stem + ".style.txt")).write_text(style(words, lang, singer, group) + "\n", encoding="utf-8")
        n += 1
    (out / "SOURCE.md").write_text(
        "From GTSinger (AaronZ345/GTSinger), CC BY-NC-SA 4.0: attribution, non-commercial, share-alike.\n"
        "An adapter trained on it carries the same terms.\n", encoding="utf-8")
    print(f"{n} segments into {out} ({skipped} left out: speech or no words)")


if __name__ == "__main__":
    sys.exit(main())
