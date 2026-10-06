"""HERESY 1145: a MIDI file becomes the song's score, for the callers that have no page (REAPER's Generate here, the
API, the MCP server). A port of the page's HeresyAbc.fromMidi (heresy-abc.js, 1028): the same decisions in the same
order, so a file gives here the score it gives in the Creator's MIDI import.

  · each track with notes is one melodic line; the first two become Vocal and Ins, by name when a track is called
    vocal/voice/vox/melody/sing or ins/instr/accomp, else in order; the tracks after those two are left out (said)
  · a line is made monophonic: of notes starting together the highest stays, a note ends where the next begins
    (the notes it costs are counted and said)
  · a second track of chords gives no Ins line (here, not in the page): its top notes as the instruments' melody let an
    instrument take the tune. Measured 02.10.2026 on one REAPER melody, an accordion waltz style, seeds 11 · 22 · 33,
    each take written back by the transcriber: with the chords' top line the instruments carried the tune in two takes
    of three (the voice in one, 95%); with the sung line alone the voice carried it in all three (90 · 90 · 100% of
    its notes). A gusli ballad style kept it in the voice either way (4 of 4). The chords still count for the key;
    ins_line="keep" keeps their top line as the page does, "none" leaves out any second line
  · the grid is 1/16; the meter and the tempo are the file's (4/4 and 120 when it has none)
  · the key: the one asked, else the file's key signature, else the one the notes suggest (Krumhansl's profiles;
    the page writes C there). Which of the three it was is said beside the score
  · the score is read back by YuE2 Studio's own checker (abc_tools.py) and must give back the very notes it was
    written from: a score that does not is refused, never sent on

    python lab/midi_score.py SONG.mid [KEY]     the score and what it was made of, as JSON"""
import json, math, re, sys
from fractions import Fraction

import abc_tools as A

MAJOR_BY_SF = {-7: "Cb", -6: "Gb", -5: "Db", -4: "Ab", -3: "Eb", -2: "Bb", -1: "F", 0: "C", 1: "G", 2: "D", 3: "A",
               4: "E", 5: "B", 6: "F#", 7: "C#"}
MINOR_BY_SF = {-7: "Abm", -6: "Ebm", -5: "Bbm", -4: "Fm", -3: "Cm", -2: "Gm", -1: "Dm", 0: "Am", 1: "Em", 2: "Bm",
               3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m"}
VOCAL_NAME = re.compile(r"vocal|voice|vox|melody|sing", re.I)
INS_NAME = re.compile(r"^ins|instr|inst\.?$|accomp", re.I)
PIECES = (48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1)         # the lengths the dialect writes, in grid units
ACCIDENTAL = {-2: "__", -1: "_", 0: "=", 1: "^", 2: "^^"}
# a tonic's key, spelled with the fewer accidentals where two spellings exist; for the guess only
MAJOR_AT = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
MINOR_AT = ("Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm")
# Krumhansl–Kessler: how well each step above the tonic fits a major and a minor key
KK_MAJOR = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
KK_MINOR = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)


def _round(x):
    return math.floor(x + 0.5)                          # JavaScript's Math.round, as the page rounds (halves up)


def read_midi(data):
    """A standard MIDI file: its tracks that have notes ([start, pitch, length] in ticks, by start, the higher first),
    and the first tempo, meter and key signature it carries."""
    data, p = bytes(data), 0

    def vlq():
        nonlocal p
        v = 0
        while True:
            b = data[p]
            p += 1
            v = (v << 7) | (b & 127)
            if not b & 128:
                return v

    A.fail(data[:4] != b"MThd", "Not a MIDI file")
    fmt, ntr, div = (int.from_bytes(data[i:i + 2], "big") for i in (8, 10, 12))
    p = 8 + int.from_bytes(data[4:8], "big")
    A.fail(div & 0x8000, "SMPTE-timed MIDI files are not supported")
    tracks, tempo, meter, key, t = [], None, None, None, 0
    while t < ntr and p < len(data):
        A.fail(data[p:p + 4] != b"MTrk", "Broken MIDI track")
        end = p + 8 + int.from_bytes(data[p + 4:p + 8], "big")
        p += 8
        now, run, name, on, notes = 0, 0, "", {}, []
        while p < end:
            now += vlq()
            st = data[p]
            if st & 0x80:
                p += 1
                if st < 0xF0:
                    run = st
            else:
                st = run                                # running status
            kind = st & 0xF0
            if st == 0xFF:
                mt = data[p]
                p += 1
                n = vlq()
                body = data[p:p + n]
                p += n
                if mt == 0x03 and not name:
                    name = body.decode("utf-8", "replace")
                if mt == 0x51 and tempo is None:
                    mpq = (body[0] << 16) | (body[1] << 8) | body[2]
                    A.fail(mpq == 0, "The MIDI file's tempo is zero")
                    tempo = _round(60000000 / mpq)
                if mt == 0x58 and meter is None:
                    meter = (body[0], 2 ** body[1])
                if mt == 0x59 and key is None:
                    key = (body[0] - 256 if body[0] > 127 else body[0], body[1] == 1)
            elif st in (0xF0, 0xF7):
                n = vlq()
                p += n
            elif kind in (0x90, 0x80):
                pitch, vel = data[p], data[p + 1]
                p += 2
                if kind == 0x90 and vel > 0:
                    on[pitch] = now
                elif pitch in on:
                    notes.append([on[pitch], pitch, now - on[pitch]])
                    del on[pitch]
            elif kind in (0xC0, 0xD0):
                p += 1
            else:
                p += 2
        p = end
        if notes:
            notes.sort(key=lambda n: (n[0], -n[1]))
            tracks.append({"name": name, "notes": notes})
        t += 1
    return {"format": fmt, "ppq": div, "tracks": tracks, "tempo": tempo, "meter": meter, "key": key}


def _spell(pitch, key):
    """A MIDI pitch written in a key: (letter, alteration, octave)."""
    sig, sharp_side, pc, best = A.key_accidentals(key), A.KEYS[key] >= 0, pitch % 12, None
    for letter in "CDEFGAB":
        for a in range(-2, 3):
            if (A.NATURAL[letter] + a) % 12 != pc:
                continue
            score = (0 if a == sig[letter] else 10) + abs(a) + (1 if a < 0 and sharp_side else 0) + (1 if a > 0 and not sharp_side else 0)
            if best is None or score < best[2]:
                best = (letter, a, score)
    return best[0], best[1], (pitch - A.NATURAL[best[0]] - best[1]) // 12 - 1


def _written(letter, octave):
    s = letter.lower() if octave >= 5 else letter
    return s + "'" * max(0, octave - 5) + "," * max(0, 4 - octave)


def _pieces(units):
    out = []
    while units > 0:
        u = next(x for x in PIECES if x <= units)
        out.append(u)
        units -= u
    return out


def guess_key(lines):
    """The key the notes suggest: each pitch class weighed by how long it sounds, against the 24 keys' profiles; the
    best correlation wins (major first on a tie). None when every pitch class weighs the same, nothing to go by."""
    weight = [0.0] * 12
    for line in lines:
        for _, pitch, length in line:
            weight[pitch % 12] += length
    mean = sum(weight) / 12
    dev = [w - mean for w in weight]
    norm = math.sqrt(sum(d * d for d in dev))
    if norm == 0:
        return None
    best = None
    for profile, names in ((KK_MAJOR, MAJOR_AT), (KK_MINOR, MINOR_AT)):
        pm = sum(profile) / 12
        for tonic in range(12):
            prof = [profile[(pc - tonic) % 12] - pm for pc in range(12)]
            r = sum(a * b for a, b in zip(dev, prof)) / (norm * math.sqrt(sum(b * b for b in prof)))
            if best is None or r > best[0]:
                best = (r, names[tonic])
    return best[1]


def from_midi(data, key=None, bpm=None, meter=None, unit=16, ins_line="auto"):
    """The score a MIDI file gives, and what it was made of:
    {abc, key, key_from, bpm, meter, bars, seconds, notes: {Vocal, Ins}, dropped: {Vocal, Ins}, ins_line, from: {…}}.
    Raises abc_tools.AbcError, with the reason in words, for a file that cannot become a score."""
    try:
        m = read_midi(data)
    except IndexError:
        raise A.AbcError("Broken MIDI file: it ends inside an event") from None
    tracks = m["tracks"]
    A.fail(not tracks, "No notes in this MIDI file")
    vocal = next((t for t in tracks if VOCAL_NAME.search(t["name"])), None) or tracks[0]
    ins = next((t for t in tracks if INS_NAME.search(t["name"])), None)
    if ins is None or ins is vocal:
        ins = next((t for t in tracks if t is not vocal), None)
    if isinstance(meter, str):
        meter = A.meter_value(meter.strip())
    meter = tuple(meter or m["meter"] or (4, 4))
    bpm = _round(float(bpm or m["tempo"] or 120))
    A.fail(bpm < 1, f"Tempo {bpm} is not a tempo")
    L = unit
    ticks_per_unit = m["ppq"] / (L / 4)
    bar_units = meter[0] * L / meter[1]
    A.fail(bar_units != int(bar_units), f"The meter {meter[0]}/{meter[1]} does not fit a 1/{L} grid")
    bar_units = int(bar_units)

    def line(t):                                        # quantized, monophonic: a note ends where the next begins
        if not t:
            return []
        out = []
        for n in ([_round(n[0] / ticks_per_unit), n[1], max(1, _round(n[2] / ticks_per_unit))] for n in t["notes"]):
            prev = out[-1] if out else None
            if prev and n[0] <= prev[0]:
                continue                                # a chord: its top note stays
            if prev and prev[0] + prev[2] > n[0]:
                prev[2] = n[0] - prev[0]
            out.append(n)
        return out

    lines = {"Vocal": line(vocal), "Ins": line(ins)}
    heard = list(lines.values())                        # the key is guessed from both, whatever Ins becomes
    A.fail(ins_line not in ("auto", "keep", "none"), f"ins_line is auto, keep or none, not {ins_line!r}")
    chorded = (len(ins["notes"]) - len(lines["Ins"])) if ins else 0
    if not ins:
        ins_said = "none: one track"
    elif ins_line == "none":
        ins_said, lines["Ins"] = "left out, as asked", []
    elif ins_line == "auto" and chorded * 4 > len(ins["notes"]):
        ins_said, lines["Ins"] = (f"left out: chords ({chorded} of its {len(ins['notes'])} notes start with another), and "
                                  "their top line as the instruments' melody lets an instrument take the tune; the "
                                  "instruments play freely"), []
    else:
        ins_said = "kept: its top line is the instruments' melody"
    if key:
        key_from = "as asked"
    elif m["key"]:
        sf, minor = m["key"]
        key, key_from = (MINOR_BY_SF if minor else MAJOR_BY_SF).get(sf), "from the file's key signature"
        A.fail(key is None, f"The file's key signature is broken: {abs(sf)} {'sharps' if sf > 0 else 'flats'} (seven at most)")
    else:
        key = guess_key(heard)
        key_from = ("guessed from the notes: the file has no key signature" if key
                    else "C: the file has no key signature, and its notes give nothing to guess from")
        key = key or "C"
    sig = A.key_accidentals(key)
    end_units = max((l[-1][0] + l[-1][2]) if l else 0 for l in lines.values())
    nbars = max(1, -(-end_units // bar_units))

    def bars(notes):                                    # per bar, its tokens; a note crossing a bar line is tied
        out, i, carry = [], 0, None
        for b in range(nbars):
            start = b * bar_units
            stop, at, toks, local = start + bar_units, start, [], {}

            def emit(pitch, length, tie):
                letter, alt, octave = _spell(pitch, key)
                accs = ""
                if alt != local.get(letter, sig[letter]):
                    accs = ACCIDENTAL[alt]
                    local[letter] = alt
                parts = _pieces(length)
                for k, u in enumerate(parts):
                    toks.append((accs if k == 0 else "") + _written(letter, octave) + ("" if u == 1 else str(u))
                                + ("-" if k < len(parts) - 1 or tie else ""))

            def rest(length):
                for u in _pieces(length) if length > 0 else ():
                    toks.append("z" + ("" if u == 1 else str(u)))

            if carry:
                cl = min(carry[1], bar_units)
                emit(carry[0], cl, carry[1] > cl)
                at = start + cl
                carry = (carry[0], carry[1] - cl) if carry[1] > cl else None
            while i < len(notes) and notes[i][0] < stop:
                n = notes[i]
                if n[0] < at:
                    i += 1
                    continue
                rest(n[0] - at)
                length = min(n[2], stop - n[0])
                emit(n[1], length, n[2] > length)
                if n[2] > length:
                    carry = (n[1], n[2] - length)
                at = n[0] + length
                i += 1
            if not carry:
                rest(stop - at)
            out.append("Z" if all(x[0] == "z" for x in toks) else "".join(toks))
        return out

    vb, ib = bars(lines["Vocal"]), bars(lines["Ins"])
    text = ["X:1", "T:", f"M:{meter[0]}/{meter[1]}", f"L:1/{L}", f"Q:1/4={bpm}",
            'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"', 'V: Ins clef=treble name="Ins Melody" snm="Inst."',
            f"K:{key}"]
    for b in range(0, nbars, 4):
        text += ["V: Vocal", "|".join(vb[b:b + 4]) + "|", "V: Ins", "|".join(ib[b:b + 4]) + "|"]
    abc = "\n".join(text)
    score = A.parse(abc)                                # fail closed, as the page does
    for name, notes in lines.items():                   # and the notes must come back as they went in
        want = [[Fraction(4 * s, L), p, Fraction(4 * n, L)] for s, p, n in notes]
        A.fail(score.voices[name].notes != want, f"{name}: the score does not give back the notes it was written from")
    return {"abc": abc, "key": key, "key_from": key_from, "bpm": bpm, "meter": f"{meter[0]}/{meter[1]}",
            "bars": nbars, "seconds": round(float(score.voices["Vocal"].time) * 60 / bpm, 2),
            "notes": {"Vocal": len(lines["Vocal"]), "Ins": len(lines["Ins"])},
            "dropped": {"Vocal": len(vocal["notes"]) - len(lines["Vocal"]), "Ins": chorded if lines["Ins"] else 0},
            "ins_line": ins_said,
            "from": {"vocal": vocal["name"] or "track 1", "ins": (ins["name"] or "track 2") if ins else "(none)",
                     "tracks": len(tracks), "left_out": [t["name"] or "(unnamed)" for t in tracks if t is not vocal and t is not ins]}}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    try:
        r = from_midi(open(sys.argv[1], "rb").read(), key=sys.argv[2] if len(sys.argv) > 2 else None)
    except A.AbcError as e:
        sys.exit(f"This MIDI could not become a score: {e}")
    print(json.dumps(r, ensure_ascii=False, indent=1))
