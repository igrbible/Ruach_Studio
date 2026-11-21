"""HERESY 2913: the transcribed MIDI written on the take's own beats (midi_export.py)."""
import io
import zipfile

import mido

import midi_export as X


def main():
    # beats at 100 bpm drifting to 102: a beat's tick is its index · 480 after the first one's
    beats = [0.5 + i * 0.6 for i in range(8)] + [0.5 + 8 * 0.6 + i * 0.588 for i in range(1, 9)]
    c = X.Clock(beats, 4)
    assert c.t0 == round(0.5 / 0.6 * 480) == 400
    assert c.tick(beats[0]) == 400 and c.tick(beats[3]) == 400 + 3 * 480 and c.tick(beats[12]) == 400 + 12 * 480
    assert c.tick(beats[3] + 0.3) == 400 + 3 * 480 + 240        # half a beat
    assert c.tick(0) == 0 and c.tick(beats[-1] + 0.588) == 400 + 16 * 480
    tempos = c.tempos()
    assert tempos[0] == (0, 600000) and tempos[1] == (400, 600000) and tempos[9] == (400 + 8 * 480, 588000)
    # 6/8: a beat an eighth (240 ticks), a quarter two of them
    c8 = X.Clock([0, 0.25, 0.5, 0.75], 8)
    assert c8.step == 240 and c8.tempos()[1] == (0, 500000)
    # parts, names, channels, the drums on 10
    notes = [[beats[0], beats[1], 40, 33, False], [beats[1], beats[2], 36, 0, True], [beats[2] + 0.01, beats[3], 64, 0, False]]
    parts = X.parts_of(notes, [90, 120, 70], stem="bass")
    names = sorted(p["name"] for p in parts.values())
    assert names == ["bass · Acoustic Grand Piano", "bass · Drums", "bass · Electric Bass (finger)"], names
    b = X.write(parts, c, "off", 4, 4, "Кремний")
    m = mido.MidiFile(file=io.BytesIO(b), charset="utf-8")
    assert m.tracks[0].name == "Кремний"
    assert m.type == 1 and m.ticks_per_beat == 480 and len(m.tracks) == 4
    cond = [x for x in m.tracks[0] if x.type == "set_tempo"]
    assert len(cond) == len(beats) and cond[0].tempo == 600000
    drums = [t for t in m.tracks if any(getattr(x, "channel", None) == 9 for x in t)]
    assert len(drums) == 1 and not any(x.type == "program_change" for x in drums[0])
    piano = [t for t in m.tracks if t.name == "bass · Acoustic Grand Piano"][0]
    on = 0
    for x in piano:
        on += x.time
        if x.type == "note_on" and x.velocity:
            break
    assert on == c.tick(beats[2] + 0.01) and on != 400 + 2 * 480    # not moved by default
    q = mido.MidiFile(file=io.BytesIO(X.write(parts, c, "1/16", 4, 4)), charset="utf-8")
    piano = [t for t in q.tracks if t.name == "bass · Acoustic Grand Piano"][0]
    on = 0
    for x in piano:
        on += x.time
        if x.type == "note_on" and x.velocity:
            break
    assert on % 120 == 0 and abs(on - (400 + 2 * 480)) <= 120   # on the 1/16 grid
    vel = [x.velocity for t in m.tracks for x in t if x.type == "note_on" and x.velocity]
    assert sorted(vel) == [70, 90, 120]
    # no beats heard: 120 bpm from 0
    assert X.Clock([], 4).tick(1.0) == 960 and X.Clock([], 4, bpm=60).tick(1.0) == 480
    z = zipfile.ZipFile(io.BytesIO(X.zip_of({"bass.mid": b, "drums.mid": b})))
    assert sorted(z.namelist()) == ["bass.mid", "drums.mid"]
    sets = [{"size": "medium", "took": 70, "seconds": 100}, {"size": "medium", "took": 80, "seconds": 100}, {"size": "medium", "took": 90, "seconds": 100}]
    assert X.estimate(sets, "medium", 200) == 160 and X.estimate(sets, "small", 100) == 35 and X.estimate([], "large", 100, stems=6) == 1500
    print("test_midi_export_2913: ok")


if __name__ == "__main__":
    main()
