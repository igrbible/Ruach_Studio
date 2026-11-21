"""HERESY 2927: the score's MIDI laid on the take's heard beats (midi_export.retime): each note at its heard time, the conductor's tempo at
each beat, the meter the grid's, the key and the section markers carried, the parts and their programs kept, a UTF-8 title; no beats heard:
the bytes as they came, said.
    .venv/bin/python lab/test_midi_score_2927.py"""
import io, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import mido
import midi_export as mx

ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

def page_midi():                                  # as heresy-abc.js toMidi writes one: type 1, 480 a quarter, the score's Q
    m = mido.MidiFile(type=1, ticks_per_beat=480, charset="utf-8")
    c = mido.MidiTrack()
    c += [mido.MetaMessage("set_tempo", tempo=500000, time=0), mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0),
          mido.MetaMessage("key_signature", key="Am", time=0), mido.MetaMessage("marker", text="Verse", time=0),
          mido.MetaMessage("marker", text="Chorus", time=480 * 8), mido.MetaMessage("end_of_track", time=0)]
    v = mido.MidiTrack()
    v += [mido.MetaMessage("track_name", name="Vocal", time=0), mido.Message("program_change", program=52, channel=0, time=0)]
    t = 0
    for q in (0, 1, 2, 4, 9):
        v.append(mido.Message("note_on", note=60 + q, velocity=90, channel=0, time=q * 480 - t)); t = q * 480
        v.append(mido.Message("note_off", note=60 + q, velocity=0, channel=0, time=240)); t += 240
    v.append(mido.MetaMessage("end_of_track", time=0))
    i = mido.MidiTrack()
    i += [mido.MetaMessage("track_name", name="Ins", time=0), mido.Message("program_change", program=33, channel=1, time=0),
          mido.Message("note_on", note=40, velocity=80, channel=1, time=480 * 8), mido.Message("note_off", note=40, velocity=0, channel=1, time=480 * 2),
          mido.MetaMessage("end_of_track", time=0)]
    m.tracks += [c, v, i]
    b = io.BytesIO(); m.save(file=b); return b.getvalue()

def times(data):                                   # (seconds, note) of every note start through the file's own tempo map
    m = mido.MidiFile(file=io.BytesIO(data), charset="utf-8")
    out, t = [], 0.0
    for msg in m:
        t += msg.time
        if msg.type == "note_on" and msg.velocity:
            out.append((round(t, 4), msg.note))
    return out, m

raw = page_midi()
# sung a little faster than the score's 120 (0.49 s a beat, not 0.5), the first bar at 0.30 s, and drifting: every beat 1 ms shorter
beats = [0.30]
for k in range(1, 48):
    beats.append(round(beats[-1] + 0.49 - 0.001 * k, 4))
grid = {"beats": beats, "bars": beats[::4], "num": 4, "den": 4, "bpm": 122.45}
data, said = mx.retime(raw, grid, "Как закалялся кремний · score")
got, m = times(data)
want = {60 + q: mx_t for q, mx_t in ((q, beats[q]) for q in (0, 1, 2, 4, 9))}
want[40] = beats[8]
check(len(got) == 6, f"six notes kept ({len(got)})")
worst = max(abs(t - want[n]) for t, n in got)
check(worst < 0.003, f"every note at its heard beat, the drift followed (worst {worst * 1000:.2f} ms)")
rawd, gotd = {n: t for t, n in times(raw)[0]}, {n: t for t, n in got}
check(abs(rawd[69] - 4.5) < 0.002 and abs(gotd[69] - beats[9]) < 0.003, f"the score's own tempo put the tenth beat at {rawd[69]:.2f} s; laid on the beats it is at {gotd[69]:.2f} s")
cond = m.tracks[0]
tempos = [x for x in cond if x.type == "set_tempo"]
check(len(tempos) >= len(beats) - 1, f"the conductor's tempo at each beat ({len(tempos)} changes for {len(beats)} beats)")
check(any(x.type == "time_signature" and (x.numerator, x.denominator) == (4, 4) for x in cond), "the meter the grid's")
check([x.text for x in cond if x.type == "marker"] == ["Verse", "Chorus"] and any(x.type == "key_signature" for x in cond), "the section markers and the key carried")
def abs_tick(tr, pred):
    t = 0
    for x in tr:
        t += x.time
        if pred(x):
            return t
mk = abs_tick(cond, lambda x: x.type == "marker" and x.text == "Chorus")
ins = abs_tick(m.tracks[2], lambda x: x.type == "note_on" and x.velocity)
check(mk and mk == ins, f"the Chorus marker and the part's note of the same quarter on one tick ({mk}, {ins})")
names = [next((x.name for x in tr if x.type == "track_name"), "") for tr in m.tracks]
check(names[0] == "Как закалялся кремний · score" and names[1:] == ["Vocal", "Ins"], f"the title in UTF-8, the parts kept in order ({names})")
progs = [next((x.program for x in tr if x.type == "program_change"), None) for tr in m.tracks[1:]]
check(progs == [52, 33], f"the programs kept ({progs})")
check(m.ticks_per_beat == mx.TPQ and m.type == 1, "type 1 at the transcriptions' 480 a quarter")
same, said0 = mx.retime(raw, {}, "x")
check(same == raw and "own tempo" in said0, f"no beats heard: the bytes as they came, said ({said0})")
same2, said2 = mx.retime(raw, {"beats": [0.5], "bars": [0.5], "said": "the sound could not be read"}, "x")
check(same2 == raw and "could not be read" in said2, "one beat only: the same, with the grid's own word")
print(f"test_midi_score_2927: {ok} passed")
