"""HERESY 2913 (Viktor 20.11.2026: «экспорт в MIDI из всего, к чему он прикручен, поднимать модальное окно с диалогом, скачивать модель, если не
скачана, и давать выбор пользователю, либо скачивает, если есть партитура, которая при экспорте не сломается, обычный партитурный миди, либо пусть
прямо здесь запускает профессиональное стемирование через MuScriptor, и дожидается результата. Все такие стемы сразу привязываем к этому
родительскому треку, и их же можно в огранщике будет юзать»): the MIDI a take exports when it is transcribed, written on the take's own beats.

The page writes the score's MIDI itself (heresy-abc.js toMidi: the plan's melody and its instrument line). What the lab writes here is MuScriptor's
transcription (muscriptor.py) of the mix, or of each stem (orchestra.STEMS: a stem transcribed with its own groups only), as one type-1 MIDI file:
a track an instrument (its General MIDI program, the drums on channel 10), named by its stem and its instrument, and for the stems a zip of each
stem's own file beside it.

The time: a song as YuE2 sings it does not keep its score's tempo to the beat (bargrid.py, measured 10.11.2026: 0.1 to 1.3 % off, 5.6 s by the end of
seven minutes), so the file's tempo is the take's grid (bargrid: the beats heard, the score's bars laid on them when it has one): a tempo change at
every beat, the meter the grid's, so a DAW's bars and beats fall on the song's own. Nothing is moved by default; quantize (1/8, 1/16) puts each
note's start and end on the nearest step of that grid.

The velocities: the mix gives none that a note can be told by (every note at MuScriptor's 100); a stem's notes each take their stem's loudness at
their attack (orchestra.velocities, the General MIDI curve)."""
import io
import json
import zipfile
from pathlib import Path

TPQ = 480                                     # ticks a quarter
QUANT = {"off": 0, "1/8": 2, "1/16": 4}       # steps a quarter
GM = ["Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano", "Electric Piano 1", "Electric Piano 2", "Harpsichord",
      "Clavinet", "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer", "Drawbar Organ",
      "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion", "Acoustic Guitar (nylon)",
      "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar",
      "Distortion Guitar", "Guitar Harmonics", "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass", "Slap Bass 1",
      "Slap Bass 2", "Synth Bass 1", "Synth Bass 2", "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings",
      "Orchestral Harp", "Timpani", "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2", "Choir Aahs", "Voice Oohs",
      "Synth Voice", "Orchestra Hit", "Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1",
      "Synth Brass 2", "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet", "Piccolo", "Flute",
      "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina", "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)",
      "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)", "Pad 1 (new age)", "Pad 2 (warm)",
      "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)", "FX 1 (rain)",
      "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
      "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Bagpipe", "Fiddle", "Shanai", "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
      "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal", "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
      "Telephone Ring", "Helicopter", "Applause", "Gunshot"]


class Clock:
    """Seconds ↔ ticks on a take's beats: beat k at tick k·step (step: ticks a beat of the meter's unit); before the first beat and after the
    last one the nearest interval goes on. Tempo events: one at each beat (µs a quarter)."""

    def __init__(self, beats, den=4, bpm=None):
        b = sorted(float(x) for x in (beats or []) if x is not None and float(x) >= 0)
        if len(b) < 2:
            ibi = 60.0 / float(bpm or 120) * (4.0 / den)
            b = [0.0, ibi]
        self.b, self.den = b, int(den or 4)
        self.step = TPQ * 4 // self.den
        first = b[1] - b[0]
        self.t0 = round(b[0] / first * self.step)  # the first beat's tick: the time before it at the first interval's tempo

    def tick(self, t):
        b, s = self.b, self.step
        if t <= b[0]:
            return max(0, round(self.t0 - (b[0] - t) / (b[1] - b[0]) * s))
        if t >= b[-1]:
            return round(self.t0 + (len(b) - 1) * s + (t - b[-1]) / (b[-1] - b[-2]) * s)
        lo, hi = 0, len(b) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if b[mid] <= t:
                lo = mid
            else:
                hi = mid
        return round(self.t0 + (lo + (t - b[lo]) / (b[lo + 1] - b[lo])) * s)

    def tempos(self):
        """[(tick, µs a quarter)]: the first interval's from 0, then one at each beat."""
        b, q = self.b, 4.0 / self.den
        out = [(0, round((b[1] - b[0]) / q * 1e6))]
        for k in range(len(b) - 1):
            out.append((self.t0 + k * self.step, round((b[k + 1] - b[k]) / q * 1e6)))
        return out

    def snap(self, tick, steps_a_quarter):
        if not steps_a_quarter:
            return tick
        g = TPQ // steps_a_quarter
        return round(tick / g) * g


def name_of(program, drum, stem=""):
    head = "Drums" if drum else GM[int(program) & 127]
    return (stem + " · " + head) if stem else head


def parts_of(notes, vel=None, stem=""):
    """notes.json's notes ([onset, offset, pitch, program, drum]) with their velocities (none: 100) into parts by instrument: {key: {name, program,
    drum, notes: [(on, off, pitch, vel)]}}"""
    out = {}
    for i, n in enumerate(notes or []):
        on, off, pitch, program, drum = float(n[0]), float(n[1]), int(n[2]), int(n[3]), bool(n[4])
        key = (stem, 128 if drum else program)
        p = out.setdefault(key, {"name": name_of(program, drum, stem), "program": program, "drum": drum, "stem": stem, "notes": []})
        p["notes"].append((on, max(off, on + 0.01), pitch, int(vel[i]) if vel is not None and i < len(vel) else 100))
    return out


def write(parts, clock, quant="off", num=4, den=4, title=""):
    """The parts as a type-1 MIDI file's bytes: the conductor (its name, the meter, a tempo at each beat), then a track a part, the drums on
    channel 10, the rest on 1–9 and 11–16 in turn (a seventeenth part shares a channel, its program set again before its notes)."""
    import mido
    steps = QUANT.get(quant or "off", 0)
    mid = mido.MidiFile(type=1, ticks_per_beat=TPQ, charset="utf-8")   # a Cyrillic title as REAPER and the others read it (mido's own is latin-1)
    cond = mido.MidiTrack()
    cond.append(mido.MetaMessage("track_name", name=(title or "Ruach Studio")[:120], time=0))
    cond.append(mido.MetaMessage("time_signature", numerator=int(num or 4), denominator=int(den or 4), time=0))
    t = 0
    for tick, us in clock.tempos():
        cond.append(mido.MetaMessage("set_tempo", tempo=max(1, min(16777215, us)), time=max(0, tick - t)))
        t = max(t, tick)
    cond.append(mido.MetaMessage("end_of_track", time=0))
    mid.tracks.append(cond)
    melodic = [c for c in range(16) if c != 9]
    k = 0
    for key in sorted(parts, key=lambda x: (parts[x]["drum"], parts[x]["stem"], parts[x]["program"])):
        p = parts[key]
        ch = 9 if p["drum"] else melodic[k % len(melodic)]
        if not p["drum"]:
            k += 1
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=p["name"][:120], time=0))
        if not p["drum"]:
            tr.append(mido.Message("program_change", channel=ch, program=int(p["program"]) & 127, time=0))
        ev = []
        for on, off, pitch, v in p["notes"]:
            a = clock.snap(clock.tick(on), steps)
            z = clock.snap(clock.tick(off), steps)
            if z <= a:
                z = a + (TPQ // steps if steps else 1)
            ev.append((a, 1, pitch & 127, max(1, min(127, v))))
            ev.append((z, 0, pitch & 127, 0))
        ev.sort(key=lambda e: (e[0], e[1]))          # a note's end before the next start of the same key at one tick
        t = 0
        for tick, kind, pitch, v in ev:
            tr.append(mido.Message("note_on" if kind else "note_off", channel=ch, note=pitch, velocity=v, time=tick - t))
            t = tick
        tr.append(mido.MetaMessage("end_of_track", time=0))
        mid.tracks.append(tr)
    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()


def retime(midi_bytes, grid, title=""):
    """HERESY 2927 (Viktor 20.11.2026, his additions to 2913: the tempo from the heard beats, for the score's MIDI too): the score's MIDI as the page
    wrote it (heresy-abc.js toMidi, at its score's Q) laid on the take's heard beats. Each event keeps its place in the score's quarters; its time is
    the grid's (bargrid: the score's bars laid on the beats heard, the score's first bar the song's first), its tick the transcriptions' clock
    (a tempo change at every beat, write's conductor). The section markers and the key go with it. Returns (bytes, said); with no beats heard,
    the bytes as they came and said so: never a silent «as before»."""
    import mido
    import bargrid
    beats = [float(b) for b in ((grid or {}).get("beats") or [])]
    bars = (grid or {}).get("bars") or []
    if len(beats) < 2 or not bars:
        why = (grid or {}).get("said") or "no beats heard"
        return midi_bytes, f"the score's own tempo: {why}"
    num, den = int(grid.get("num") or 4), int(grid.get("den") or 4)
    b0 = min(range(len(beats)), key=lambda i: abs(beats[i] - float(bars[0])))   # the score's first bar on its heard beat
    src = mido.MidiFile(file=io.BytesIO(midi_bytes), charset="utf-8")
    tpq = src.ticks_per_beat or 480
    clock = Clock(beats, den, grid.get("bpm"))

    def at(tick):                                   # the score's tick → the tick of its time as sung
        return clock.tick(bargrid._time_at(beats, b0 + (tick / tpq) * den / 4.0))

    mid = mido.MidiFile(type=1, ticks_per_beat=TPQ, charset="utf-8")
    cond = mido.MidiTrack()
    head = [(0, mido.MetaMessage("track_name", name=(title or "Ruach Studio")[:120], time=0)),
            (0, mido.MetaMessage("time_signature", numerator=num, denominator=den, time=0))]
    carried = []                                    # the conductor's own events that are no tempo and no meter: the key, the section markers
    tracks = []
    for tr in src.tracks:
        t, ev, notes = 0, [], False
        for m in tr:
            t += m.time
            if m.is_meta and m.type in ("set_tempo", "time_signature", "end_of_track"):
                continue
            if not m.is_meta and m.type in ("note_on", "note_off"):
                notes = True
            ev.append((at(t), m))
        if notes:
            tracks.append(ev)
        else:
            carried += [(k, m) for k, m in ev if not (m.is_meta and m.type == "track_name")]
    tempos = [(k, mido.MetaMessage("set_tempo", tempo=max(1, min(16777215, us)), time=0)) for k, us in clock.tempos()]
    for evs, track in [(head + sorted(carried + tempos, key=lambda x: x[0]), cond)] + [(e, mido.MidiTrack()) for e in tracks]:
        t = 0
        for k, m in evs:                            # the order within a tick as written: the mapping never reorders
            track.append(m.copy(time=max(0, k - t)))
            t = max(t, k)
        track.append(mido.MetaMessage("end_of_track", time=0))
        mid.tracks.append(track)
    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue(), f"{grid.get('bpm') or ''} bpm heard, {len(beats)} beats".strip()


def zip_of(files):
    """{name: bytes} as a zip's bytes (stored: MIDI files are small and already dense enough)"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in files.items():
            z.writestr(n, b)
    return buf.getvalue()


def estimate(sets, size, seconds, stems=0):
    """Seconds this machine would take, from its own past runs at that size (the median of took / the sound's length), else the program's own
    guide (small 0.35, medium 0.75, large 2.5 of the song on the processor); stems: each stem a pass of its own."""
    rates = sorted(float(m["took"]) / float(m["seconds"]) for m in sets or []
                   if m.get("size") == size and (m.get("took") or 0) > 0 and (m.get("seconds") or 0) > 0)
    rate = rates[len(rates) // 2] if rates else {"small": 0.35, "medium": 0.75, "large": 2.5}.get(size, 1.0)
    return round(rate * float(seconds or 0) * max(1, stems or 1))


def kept(take_dir, way, size, quant):
    """The export made already for this way, size and grid step (newest first), or None"""
    for man in sorted(Path(take_dir).glob("derived/midi-export-*/manifest.json"), reverse=True):
        try:
            m = json.loads(man.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if m.get("way") == way and m.get("size") == size and m.get("quantize", "off") == (quant or "off"):
            return m
    return None
