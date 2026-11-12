"""HERESY 2226 and 2227: the REAPER project carries the timed lyrics as MIDI lyric events (FF 05, a word each) and the score's chord
symbols on a Chords track (a MIDI item a chord, named by it, a text event FF 01), in the form REAPER 7.81 saves them.
A take made in a temp folder: two seconds of sine. python3 lab/test_daw_text.py"""
import base64
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rpp  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


ABC = "\n".join(["X:1", "T:", "M:4/4", "L:1/32", "Q:1/4=120", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
                 'V: Ins clef=treble name="Ins Melody" snm="Inst."', "K:C", "V: Vocal", '"Am"A32|"Am"A32|"G/B"B16"C"c16|', "V: Ins", "Z3|"])


def events(block):
    """[(delta, kind, text)] of the <X …> blocks in a list of RPP lines."""
    out, i = [], 0
    while i < len(block):
        m = re.match(r"<X (\d+) 0$", block[i])
        if m:
            j = block.index(">", i)
            b = b"".join(base64.b64decode(x) for x in block[i + 1:j])
            out.append((int(m.group(1)), b[1], b[2:].decode("utf-8")))
            i = j
        i += 1
    return out


ev = rpp._text_event(0, 5, "x" * 50)
check("event: REAPER's form, 40 bytes a base64 line", ev[0] == "<X 0 0" and len(ev) == 4 and ev[-1] == ">" and base64.b64decode(ev[1])[:2] == b"\xff\x05", ev)

rows = [{"text": "Shine (oh) on me-now", "start": 0.2, "end": 0.9, "tt": [[0.2, 0.3], None, [0.5, 0.6], [0.7, 0.8]]},
        {"text": "a line guessed", "start": 1.0, "end": 1.8},
        {"text": "not timed", "start": None, "end": None}]
words = rpp.lyric_events(rows)
check("lyrics: a word at its own time, the unheard one riding with the word before, the (direction) out",
      words == [(0.2, "Shine on"), (0.5, "me-now"), (1.0, "a line guessed")], words)
check("lyrics: a row whose words do not meet their times is one event at its start",
      rpp.lyric_events([{"text": "two words", "start": 3.0, "tt": [[3.0, 3.2]]}]) == [(3.0, "two words")])

ch, why = rpp.chord_symbols(ABC)
check("chords: read from the score, a chord held over two bars one span", ch == [(0.0, 8.0, "Am"), (8.0, 10.0, "G/B"), (10.0, 12.0, "C")] and why == "", (ch, why))
ch2, why2 = rpp.chord_symbols("X:1\nT:\nnot a score")
check("chords: a score not read says why, no silent empty track", ch2 == [] and why2 and "could not be read" in rpp.chords_said(ch2, why2, "x"), why2)
check("chords: no score says nothing", rpp.chord_symbols("") == ([], "") and rpp.chords_said([], "", "") == "")
check("chords: a score without chords says so", rpp.chords_said([], "", ABC) == "no chord symbols in the score")

with tempfile.TemporaryDirectory() as tmp:
    out, cache = Path(tmp) / "outputs", Path(tmp) / "cache"
    take = out / "t1"
    take.mkdir(parents=True)
    cache.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", str(take / "audio.wav")], check=True)
    json.dump({"title": "Text test"}, open(take / "meta.json", "w"))
    json.dump({"lyrics": "[Verse]\nShine (oh) on me-now\n[Chorus]\na line guessed", "style": "pop", "abc": ABC}, open(take / "request.json", "w"))
    json.dump({"rows": rows[:2]}, open(cache / "t1.timing.json", "w"))
    z, info = rpp.build(None, out, "t1", cache=cache)
    text = zipfile.ZipFile(z).read("Text_test/Text_test.RPP").decode("utf-8")
    lines = [ln.strip() for ln in text.splitlines()]
    tracks = [lines[i + 1] for i, ln in enumerate(lines) if ln == "<TRACK"]
    check("RPP: a Lyrics (MIDI) and a Chords track beside the Lyrics one", 'NAME "Lyrics"' in tracks and 'NAME "Lyrics (MIDI)"' in tracks and 'NAME "Chords"' in tracks, tracks)
    a = lines.index('NAME "Lyrics (MIDI)"')
    lyr = events(lines[a:lines.index("<TRACK", a) if "<TRACK" in lines[a:] else len(lines)])
    # 120 bpm: a second is 2 quarters, 1920 ticks
    check("RPP: the lyric events FF 05 at their ticks (120 bpm)", lyr == [(384, 5, "Shine on"), (576, 5, "me-now"), (960, 5, "a line guessed")], lyr)
    c = lines.index('NAME "Chords"')
    chl = lines[c:]
    check("RPP: a chord an item, named by it, at its time", [ln for ln in chl if ln.startswith("NAME ")][1:] == ['NAME "Am"', 'NAME "G/B"', 'NAME "C"'] and
          [ln for ln in chl if ln.startswith("POSITION")] == ["POSITION 0.000000", "POSITION 4.000000", "POSITION 5.000000"], chl[:30])
    check("RPP: each carries its symbol as a text event FF 01", [(k, t) for _, k, t in events(chl)] == [(1, "Am"), (1, "G/B"), (1, "C")], events(chl))
    check("RPP: the answer, one line still, says both", len(info["said"]) == 3 and "3 lyric events as MIDI" in info["said"][2] and "chords: 3 as chord symbols" in info["said"][2]
          and info["lyric_events"] == 3 and info["chords"] == 3, info)
    check("RPP: blocks balanced", sum(ln.startswith("<") for ln in lines) == sum(ln == ">" for ln in lines))
    json.dump({"lyrics": "x", "style": "pop"}, open(take / "request.json", "w"))
    (cache / "t1.timing.json").unlink()
    z2, info2 = rpp.build(None, out, "t1", cache=cache)
    t2 = zipfile.ZipFile(z2).read("Text_test/Text_test.RPP").decode("utf-8")
    check("RPP: a take not timed and without a score: neither track, the lines as before", "Lyrics (MIDI)" not in t2 and '"Chords"' not in t2 and info2["said"][2].startswith("no lyrics on the timeline") and ";" not in info2["said"][2], info2)

print("FAILED: " + ", ".join(bad) if bad else "ALL OK")
sys.exit(1 if bad else 0)
