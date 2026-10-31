"""HERESY 1881 (Viktor 29.10.2026, the Refiner's MIDI orchestra, phase 1: «нет слов… ОГОНЬ. Не используем wine — к хуям этот костыль»):
a take's stems into MIDI parts with their own dynamics, and the parts back into sound through sampled instruments, on the processor.

  · STEMS: the MuScriptor groups each of stems_job.py's stems is transcribed with (/midi?source=…&only=…), so a stem's MIDI holds its own
    instruments only (the whole mix gave a gospel take woodwinds that were not there, muscriptor.py);
  · velocities(): each note's velocity from its stem at its attack (MuScriptor gives every note 100): the power in the note's own band (its
    fundamental and two harmonics; a drum by its kit piece's band) over the 50 ms from its onset, the part's loud end (its 98th percentile)
    at 127 and the rest by the General MIDI curve (the level in dB is 40·log10 of the velocity's share of 127);
  · write_mid(): notes.json's notes with those velocities into a MIDI file, a track an instrument, the drums on channel 10;
  · library(): the sets under models/instruments/<set>/: SFZ instruments (sfizz) and SF2 banks with their presets (FluidSynth; SF3 needs
    libsndfile, which our FluidSynth is built without);
  · render(): a part through an SFZ (sfizz_render) or an SF2 preset (fluidsynth -F, raw PCM wrapped by ffmpeg) into a 48 kHz WAV, faster than
    the song. The renderers are built by heresy/MISC/claude-tc/midi/build-renderers.sh into build/build-sfizz and build/build-fluidsynth."""
import json
import os
import struct
import subprocess
import tempfile
from pathlib import Path

GROUPS = ("acoustic_piano", "electric_piano", "chromatic_percussion", "organ", "acoustic_guitar", "clean_electric_guitar",
          "distorted_electric_guitar", "acoustic_bass", "electric_bass", "violin", "viola", "cello", "contrabass", "orchestral_harp", "timpani",
          "string_ensemble", "synth_strings", "voice", "orchestra_hit", "trumpet", "trombone", "tuba", "french_horn", "brass_section",
          "soprano_and_alto_sax", "tenor_sax", "baritone_sax", "oboe", "english_horn", "bassoon", "clarinet", "flutes", "synth_lead",
          "synth_pad", "drums")
WINDS = ("trumpet", "trombone", "tuba", "french_horn", "brass_section", "soprano_and_alto_sax", "tenor_sax", "baritone_sax", "oboe",
         "english_horn", "bassoon", "clarinet", "flutes")
# a stem of stems_job.py → the groups its MIDI may hold (the eight's names; four and six use the same files)
STEMS = {
    "drums": ("drums",),
    "bass": ("electric_bass", "acoustic_bass", "contrabass", "synth_lead"),
    "piano": ("acoustic_piano", "electric_piano"),
    "guitar": ("acoustic_guitar", "clean_electric_guitar", "distorted_electric_guitar"),
    "winds": WINDS,
    "other": ("string_ensemble", "violin", "viola", "cello", "contrabass", "synth_strings", "organ", "orchestral_harp", "timpani",
              "chromatic_percussion", "synth_pad", "synth_lead", "orchestra_hit", "electric_piano"),
    "lead_vocal": ("voice",),
    "vocals": ("voice",),
}
SR = 32000                       # the velocity's analysis rate: 16 kHz at the top covers the hats and the cymbals
HOP, NFFT, ATTACK = 256, 4096, 0.05
# a GM drum key → its kit piece's band (Hz), for its velocity
DRUM_BANDS = [((35, 36), (30, 150)), ((37, 38, 39, 40), (150, 4000)), ((42, 44, 46), (5000, 16000)),
              ((41, 43, 45, 47, 48, 50), (60, 600)), ((49, 51, 52, 53, 55, 57, 59), (3000, 16000))]
TICKS = 960                      # MIDI ticks a second (480 a beat at 120 bpm)


def stem_of(path):
    """A stem file's name without its extension ("bass" for derived/stems-eight/bass.flac), or None if it is not one of STEMS."""
    s = Path(str(path)).stem
    return s if s in STEMS else None


def only_for(path):
    """The --only list a stem is transcribed with ("" for anything else: every group)."""
    s = stem_of(path)
    return ",".join(STEMS[s]) if s else ""


def _band(pitch, drum):
    if drum:
        for keys, band in DRUM_BANDS:
            if pitch in keys:
                return [band]
        return [(200, 8000)]
    f0 = 440.0 * 2 ** ((pitch - 69) / 12)
    return [(k * f0 * 2 ** (-1 / 24), k * f0 * 2 ** (1 / 24)) for k in (1, 2, 3) if k * f0 < SR / 2]


def velocities(notes, audio):
    """[velocity] for notes.json's notes ([onset, offset, pitch, program, drum]) from the stem they came from. A part (a program, or the
    drums) is scaled on its own: its loud end at 127."""
    import librosa
    import numpy as np
    y, _ = librosa.load(str(audio), sr=SR, mono=True)
    if not len(y) or not notes:
        return [100] * len(notes)
    win = np.hanning(NFFT).astype(np.float32)
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    span = max(1, int(round(ATTACK * SR / HOP)))
    level = []
    for on, _off, pitch, _program, drum in notes:            # a few frames at each note's attack: no whole-song spectrogram held
        rows = []
        for lo, hi in _band(int(pitch), bool(drum)):
            idx = np.nonzero((freqs >= lo) & (freqs <= hi))[0]
            rows.extend(idx.tolist() if len(idx) else [int(np.argmin(np.abs(freqs - (lo + hi) / 2)))])
        rows = np.array(sorted(set(rows)))
        a, e = int(on * SR), 0.0
        for k in range(span):
            s = a + k * HOP - NFFT // 2                      # a frame centred on its hop, as librosa's
            seg = y[max(0, s):max(0, s + NFFT)]
            seg = np.pad(seg, (max(0, -s), NFFT - len(seg) - max(0, -s)))
            e = max(e, float((np.abs(np.fft.rfft(seg * win)) ** 2)[rows].sum()))
        level.append(10 * np.log10(e + 1e-12))
    level = np.array(level)
    part = np.array([128 if n[4] else int(n[3]) for n in notes])
    vel = np.full(len(notes), 100, dtype=int)
    for p in set(part.tolist()):
        m = part == p
        ref = np.percentile(level[m], 98)
        vel[m] = np.clip(np.round(127 * 10 ** ((level[m] - ref) / 40)), 8, 127).astype(int)
    return vel.tolist()


def squeeze(vel, lo, hi):
    """HERESY 1887 (his ear on the 29.10 stand: the flat 100 renders of Splendid, MuseScore and Naked Drums 💎, the stem's whole 8–127 not):
    the stem's velocities into [lo, hi], their order kept: its 5th percentile at lo, its 95th at hi, the rest in a line between, clipped."""
    import numpy as np
    v = np.asarray(vel, dtype=float)
    if not len(v):
        return []
    a, b = np.percentile(v, 5), np.percentile(v, 95)
    out = lo + (v - a) * (hi - lo) / (b - a) if b > a else np.full(len(v), (lo + hi) / 2)
    return np.clip(np.round(out), lo, hi).astype(int).tolist()


def write_mid(notes, vel, path, programs=None, tail=2.0, cc=None):
    """notes ([onset, offset, pitch, program, drum]) with their velocities into a MIDI file: a track a program (programs: {program: new
    program} to play a part on another GM instrument), the drums on channel 10; the end of track tail seconds after the last note, a controller
    nothing listens to (CC 110) just before it, so sfizz_render --use-eot plays the releases up to it and stops there (without --use-eot it
    waits for every voice to end, and on 29.10 a cello's 563 overlapping notes kept one sounding for ten minutes and more). cc (HERESY 1886):
    [(seconds, controller, value)] for every melodic track, a piano's sustain pedal (CC 64) among them."""
    import mido
    mid = mido.MidiFile(ticks_per_beat=480)
    tempo = mido.MidiTrack()
    tempo.append(mido.MetaMessage("set_tempo", tempo=500000, time=0))
    mid.tracks.append(tempo)
    end = max((n[1] for n in notes), default=0.0) + tail
    parts = {}
    for n, v in zip(notes, vel):
        parts.setdefault(128 if n[4] else int(n[3]), []).append((n, v))
    free = [c for c in range(16) if c != 9]
    for prog in sorted(parts):
        ch = 9 if prog == 128 else free.pop(0) if free else 0
        tr = mido.MidiTrack()
        if prog != 128:
            tr.append(mido.Message("program_change", channel=ch, program=int((programs or {}).get(prog, prog)) & 127, time=0))
        ev = []
        for (on, off, pitch, _p, _d), v in parts[prog]:
            a = max(0, int(round(on * TICKS)))            # never before the file's start (a hand's jitter on a first beat)
            ev.append((a, 1, int(pitch), int(v)))
            ev.append((max(int(round(off * TICKS)), a + 1), 0, int(pitch), 0))
        if prog != 128:
            ev += [(max(0, int(round(a * TICKS))), 2, int(c), int(x)) for a, c, x in (cc or []) if a <= end]
        ev.sort(key=lambda e: (e[0], e[1]))          # at one tick a note's end before the next start of the same key, a controller after both
        t = 0
        for tick, kind, pitch, v in ev:
            if kind == 2:
                tr.append(mido.Message("control_change", channel=ch, control=pitch & 127, value=v & 127, time=tick - t))
            else:
                tr.append(mido.Message("note_on" if kind else "note_off", channel=ch, note=pitch, velocity=v, time=tick - t))
            t = tick
        tr.append(mido.Message("control_change", channel=ch, control=110, value=0, time=max(0, int(round(end * TICKS)) - t)))   # the end's mark
        tr.append(mido.MetaMessage("end_of_track", time=0))
        mid.tracks.append(tr)
    mid.save(str(path))
    return str(path)


def sf2_presets(path):
    """An SF2 bank's presets: [{name, bank, preset}] from its phdr chunk."""
    with open(path, "rb") as f:
        head = f.read(12)
        if head[:4] != b"RIFF" or head[8:12] != b"sfbk":
            raise ValueError(f"{path} is not an SF2 bank")
        while True:
            h = f.read(8)
            if len(h) < 8:
                return []
            cid, size = h[:4], struct.unpack("<I", h[4:])[0]
            if cid == b"LIST" and f.read(4) == b"pdta":
                end = f.tell() + size - 4
                while f.tell() < end:
                    sh = f.read(8)
                    sid, ssize = sh[:4], struct.unpack("<I", sh[4:])[0]
                    if sid == b"phdr":
                        raw = f.read(ssize)
                        out = []
                        for i in range(0, len(raw) - 38, 38):     # the last record is the end-of-presets one
                            name, preset, bank = struct.unpack("<20sHH", raw[i:i + 24])
                            out.append({"name": name.split(b"\0")[0].decode("latin-1").strip(), "bank": bank, "preset": preset})
                        return out
                    f.seek(ssize + (ssize & 1), 1)
                return []
            f.seek(size + (size & 1) - (4 if cid == b"LIST" else 0), 1)


_LIB = {}


def library(kit, fresh=False):
    """The instrument sets: [{set, kind: sfz|sf2, file (under models/instruments), name, presets (sf2)}], archives left out; kept a minute
    (HERESY 1884: the page asks often, the sets are thousands of files)."""
    import time as _t
    root = Path(kit) / "models" / "instruments"
    hit = _LIB.get(str(root))
    if hit and not fresh and _t.time() - hit[0] < 60:
        return hit[1]
    out = []
    _LIB[str(root)] = (_t.time(), out)
    if not root.is_dir():
        return out
    for s in sorted(p for p in root.iterdir() if p.is_dir()):
        for f in sorted(s.rglob("*")):
            ext = f.suffix.lower()
            if ext == ".sfz":
                out.append({"set": s.name, "kind": "sfz", "file": str(f.relative_to(root)), "name": f.stem})
            elif ext == ".sf2":
                try:
                    pre = sf2_presets(f)
                except (OSError, ValueError, struct.error):
                    continue
                out.append({"set": s.name, "kind": "sf2", "file": str(f.relative_to(root)), "name": f.stem, "presets": pre})
    return out


def sfizz(kit):
    return Path(kit) / "build" / "build-sfizz" / "out" / "library" / "bin" / "sfizz_render"


def fluidsynth(kit):
    return Path(kit) / "build" / "build-fluidsynth" / "out" / "src" / "fluidsynth"


# ---- HERESY 1889: a drum kit with keys of its own (Karoryfer's): GM's pieces on the kit's, as its own keymap files name each key (every
# mapped key heard in test_orchestra); GM's pieces it has not (a clap, a tambourine, a shaker) played by the GM bank, so a part loses
# nothing; cc set on its channel before the first note (Swirly's hi-hat is closed until its pedal, CC 4, says open: GM's 46 is an open hat).
DRUM_KITS = {
    "karoryfer.swirly-drums": {"keys": {35: 36, 36: 36, 38: 38, 40: 38, 41: 41, 42: 42, 43: 43, 44: 44, 45: 45, 46: 46, 47: 47, 48: 48,
                                        49: 49, 50: 48, 51: 51, 52: 53, 55: 55, 56: 66, 57: 57, 59: 51, 60: 71, 61: 69},
                               "cc": [(4, 127)]},
    "karoryfer.unruly-drums": {"keys": {35: 36, 36: 36, 37: 37, 38: 38, 40: 38, 41: 41, 43: 41, 42: 42, 44: 44, 45: 45, 46: 46, 47: 45,
                                        48: 47, 50: 47, 49: 49, 51: 51, 53: 53, 57: 55, 59: 51, 76: 60, 77: 59},
                               "cc": [(4, 127)]},
}


def drum_kit(inst):
    """The DRUM_KITS entry of an instrument's kit, or None."""
    return next((v for k, v in DRUM_KITS.items() if f"/{k}/" in "/" + inst.get("file", "")), None)


def _render_kit(kit, mid, inst, out, rate):
    """A MIDI file through a drum kit with its own keys (DRUM_KITS): the drums GM's pieces on the kit's keys, the ones it lacks through the
    GM bank, the two summed into out. Returns out."""
    import mido
    import numpy as np
    import soundfile as sf
    dk = drum_kit(inst)
    if dk is None:
        raise ValueError(f"no drum keymap for {inst['file']}")
    m = mido.MidiFile(str(mid))
    own, rest = mido.MidiFile(ticks_per_beat=m.ticks_per_beat), mido.MidiFile(ticks_per_beat=m.ticks_per_beat)
    lacking = 0
    for tr in m.tracks:
        drums = any(x.type == "note_on" and x.channel == 9 for x in tr)
        ev_own, ev_rest, t = [], [], 0
        for x in tr:
            t += x.time
            if x.type in ("note_on", "note_off") and x.channel == 9:
                k = dk["keys"].get(x.note)
                if k is None:
                    ev_rest.append((t, x))
                    lacking += x.type == "note_on" and x.velocity > 0
                else:
                    ev_own.append((t, x.copy(note=k)))
            elif x.type in ("note_on", "note_off"):
                ev_own.append((t, x))                     # a melodic note asked of a kit plays its key, as render() plays it
            else:
                ev_own.append((t, x))
                ev_rest.append((t, x))
        if drums:
            ev_own = [(0, mido.Message("control_change", channel=9, control=c, value=v)) for c, v in dk["cc"]] + ev_own
        for f, ev in ((own, ev_own), (rest, ev_rest)):
            nt, last = mido.MidiTrack(), 0
            for at, x in ev:
                nt.append(x.copy(time=at - last))
                last = at
            f.tracks.append(nt)
    out = Path(out)
    with tempfile.TemporaryDirectory(dir=str(out.parent)) as tmp:
        own.save(str(Path(tmp) / "own.mid"))
        a, _ = sf.read(render(kit, Path(tmp) / "own.mid", {"kind": "sfz", "file": inst["file"]}, Path(tmp) / "own.wav", rate), always_2d=True)
        gm = gm_bank(kit)
        if lacking and gm:
            rest.save(str(Path(tmp) / "rest.mid"))
            b, _ = sf.read(render(kit, Path(tmp) / "rest.mid", {"kind": "sf2", "file": gm}, Path(tmp) / "rest.wav", rate), always_2d=True)
            n = max(len(a), len(b))
            a = np.pad(a, ((0, n - len(a)), (0, 0))) + np.pad(b, ((0, n - len(b)), (0, 0)))
        sf.write(str(out), a.astype(np.float32), rate, subtype="FLOAT")
    return str(out)


def render(kit, mid, inst, out, rate=48000):
    """A MIDI file through one instrument into a WAV at rate: inst {kind: sfz, file} (every channel to it) or {kind: sf2, file[, bank,
    preset]} (the file's own program changes, or every part to bank:preset). file is under models/instruments. Returns out."""
    root = Path(kit) / "models" / "instruments"
    f = root / inst["file"]
    if not f.is_file():
        raise FileNotFoundError(f"no instrument {inst['file']}")
    out = Path(out)
    if inst["kind"] == "sfz" and inst.get("keymap") == "drums":          # HERESY 1889: GM's pieces on the kit's own keys
        return _render_kit(kit, mid, inst, out, rate)
    if inst["kind"] == "sfz":
        p = subprocess.run([str(sfizz(kit)), "--sfz", str(f), "--midi", str(mid), "--wav", str(out), "--samplerate", str(rate), "--use-eot"],   # to the end's mark
                           capture_output=True, text=True, timeout=3600)
        if p.returncode != 0 or not out.is_file():
            raise RuntimeError("sfizz_render: " + (p.stderr.strip() or p.stdout.strip())[-300:])
        return str(out)
    if inst["kind"] != "sf2":
        raise ValueError(f"an instrument is sfz or sf2, not {inst['kind']}")
    with tempfile.TemporaryDirectory(dir=str(out.parent)) as tmp:
        play = Path(mid)
        if "preset" in inst:                          # every melodic part to the one preset; the drums stay on channel 10
            import mido
            m = mido.MidiFile(str(mid))
            for tr in m.tracks:
                for i, msg in enumerate(tr):
                    if msg.type == "program_change" and msg.channel != 9:
                        tr[i] = msg.copy(program=int(inst["preset"]) & 127)
                chans = sorted({msg.channel for msg in tr if hasattr(msg, "channel") and msg.channel != 9})
                for ch in chans:
                    tr.insert(0, mido.Message("control_change", channel=ch, control=0, value=int(inst.get("bank", 0)) & 127, time=0))
            play = Path(tmp) / "part.mid"
            m.save(str(play))
        raw = Path(tmp) / "out.raw"
        p = subprocess.run([str(fluidsynth(kit)), "-ni", "-q", "-R", "0", "-C", "0", "-g", "0.6", "-r", str(rate), "-T", "raw", "-O", "s16",
                            "-F", str(raw), str(f), str(play)], capture_output=True, text=True, timeout=3600)
        if p.returncode != 0 or not raw.is_file():
            raise RuntimeError("fluidsynth: " + (p.stderr.strip() or p.stdout.strip())[-300:])
        q = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(rate), "-ac", "2", "-i", str(raw), str(out)],
                           capture_output=True, text=True, timeout=600)
        if q.returncode != 0:
            raise RuntimeError("ffmpeg: " + q.stderr.strip()[-200:])
    return str(out)


def render_split(kit, notes, vel, ranges, out, rate=48000):
    """A part played by sections, as an orchestra's strings: ranges [(lowest key, highest key, inst)], each note to the section its key
    falls in, each section rendered (render) and the sections summed into out. Returns out."""
    import numpy as np
    import soundfile as sf
    out = Path(out)
    with tempfile.TemporaryDirectory(dir=str(out.parent)) as tmp:
        mix = None
        for k, (lo, hi, inst) in enumerate(ranges):
            sel = [(n, v) for n, v in zip(notes, vel) if lo <= int(n[2]) <= hi]
            if not sel:
                continue
            mid = write_mid(prepare(kit, [n for n, _ in sel], inst), [v for _, v in sel], Path(tmp) / f"s{k}.mid")
            a, _ = sf.read(render(kit, mid, inst, Path(tmp) / f"s{k}.wav", rate), always_2d=True)
            if mix is None:
                mix = a
            else:
                n = max(len(mix), len(a))
                mix = np.pad(mix, ((0, n - len(mix)), (0, 0))) + np.pad(a, ((0, n - len(a)), (0, 0)))
        if mix is None:
            raise ValueError("no note falls in any section")
        sf.write(str(out), mix.astype(np.float32), rate, subtype="FLOAT")
    return str(out)


def prepare(kit, notes, inst):
    """A part's notes as the instrument wants them: through its heard keymap when it asks for one ("keymap": "auto")."""
    if inst.get("kind") == "sfz" and inst.get("keymap") == "auto":
        return remap(notes, keymap(kit, inst))
    return notes


def part(notes, which):
    """The notes of one part: a program number, or "drums"."""
    return [n for n in notes if (n[4] if which == "drums" else (not n[4] and int(n[3]) == int(which)))]


def load_notes(folder):
    """A MIDI set's notes.json (lab.py midi_async's derived/midi-*/): its notes and its instruments."""
    d = json.load(open(os.path.join(folder, "notes.json"), encoding="utf-8"))
    return d.get("notes", []), d.get("instruments", [])


# ---- HERESY 1883: a stem's MIDI render as a version of it in the Refiner's DAW (daw.py takes a branch made from a stem, its first file of the
# take's length, as a version of that strip): «instead» the render alone, «over» the stem and the render, «octave» the stem and the render an
# octave away (−6 dB). The render is matched to the stem's level. The map group → instrument lives in user/orchestra.json; a group without one
# plays its General MIDI program in the first GM bank here.
MODES = ("instead", "over", "octave")
GM_BANKS = ("generaluser-gs/GeneralUser-GS.sf2", "musescore-general/MuseScore_General.sf2", "fluidr3/FluidR3_GM.sf2")


def gm_bank(kit):
    root = Path(kit) / "models" / "instruments"
    return next((b for b in GM_BANKS if (root / b).is_file()), None)


def map_file(kit, d=None):
    """The map's file: the studio's (user/orchestra.json), or a take's own (its folder's orchestra.json, over the studio's)."""
    return Path(d) / "orchestra.json" if d else Path(kit) / "user" / "orchestra.json"


def _read_map(f):
    try:
        m = json.load(open(f, encoding="utf-8")).get("map", {})
    except (OSError, ValueError):
        m = {}
    return {g: m[g] for g in GROUPS if isinstance(m.get(g), dict)}


def instrument_map(kit, d=None):
    """{group: instrument} as the user set it: the studio's map, a take's own (d) over it; a group missing plays its GM program."""
    return dict(_read_map(map_file(kit)), **(_read_map(map_file(kit, d)) if d else {}))


def set_map(kit, group, inst, d=None):
    """One group's instrument into the studio's map, or a take's own (d); inst None: the group back to the studio's map (a take) or to
    its GM program (the studio). Returns the map in force (the take's over the studio's)."""
    if group not in GROUPS:
        raise ValueError(f"no instrument group {group}")
    if inst is not None:
        if inst.get("kind") not in ("sfz", "sf2", "split"):
            raise ValueError("an instrument is sfz, sf2 or split")
        for f in ([inst] if inst["kind"] != "split" else [x[2] for x in inst.get("ranges", [])]):
            if not (Path(kit) / "models" / "instruments" / f.get("file", "")).is_file():
                raise FileNotFoundError(f"no instrument {f.get('file')}")
    f = map_file(kit, d)
    try:
        doc = json.load(open(f, encoding="utf-8"))
    except (OSError, ValueError):
        doc = {}
    m = doc.get("map", {})
    if inst is None:
        m.pop(group, None)
    else:
        m[group] = inst
    doc["map"] = m
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".part")
    json.dump(doc, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    tmp.replace(f)
    return instrument_map(kit, d)


def midi_set_of(d, source, only):
    """A take's MIDI set made from `source` with `only` (lab.py midi_async's derived/midi-*), the newest, or None."""
    for man in sorted(Path(d).glob("derived/midi-*/manifest.json"), reverse=True):
        try:
            m = json.load(open(man, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if m.get("source") == source and m.get("only", "") == only and (man.parent / "notes.json").is_file():
            return man.parent
    return None


def _level(x):
    import numpy as np
    return float(np.sqrt(np.mean(np.asarray(x, dtype=np.float64) ** 2)) + 1e-12)


def make_version(kit, d, source, inst=None, mode="instead", shift=12, size="", job=None, oid=None):
    """The stem `source` (derived/stems-…/NAME.flac of take folder d) played by `inst` (None: each group as the map says, else its GM
    program) in `mode`, as a branch derived/orchestra-<time>/ (oid: its id named beforehand, so a job can be watched by it) the DAW lists
    among the stem's versions. Transcribes the stem first when the take has no MIDI set of it (MuScriptor, its groups). Returns the
    branch's manifest."""
    import time as _t
    import numpy as np
    import soundfile as sf
    import muscriptor
    d = Path(d)
    if mode not in MODES:
        raise ValueError("the mode is instead, over or octave")
    stem = (d / source).resolve()
    if d.resolve() not in stem.parents or not stem.is_file():
        raise FileNotFoundError(f"no stem {source} in the take")
    only = only_for(source)
    folder = midi_set_of(d, source, only)
    if folder is None:                                # transcribed as lab.py's midi_async writes its sets
        size = muscriptor.pick(kit, size)
        if not size:
            raise FileNotFoundError("no MuScriptor model here: Engine → Models → Sound to MIDI fetches one")
        did = f"midi-{size}-" + _t.strftime("%Y%m%d-%H%M%S")
        tmp, folder = d / "derived" / (did + ".part"), d / "derived" / did
        r = muscriptor.run(kit, stem, tmp, size, only, job)
        man = {"id": did, "kind": "midi", "parent": d.name, "source": source, "size": size, "only": only, "engine": r.get("engine"),
               "device": r.get("device"), "seconds": r.get("seconds"), "took": r.get("took"), "instruments": r.get("instruments", []),
               "notes": len(r.get("notes", [])),
               "files": [{"file": "song.mid", "path": f"derived/{did}/song.mid", "kind": "midi", "title": "MIDI"},
                         {"file": "notes.json", "path": f"derived/{did}/notes.json", "kind": "text", "title": "the notes"}],
               "created": _t.strftime("%Y-%m-%d %H:%M")}
        json.dump(man, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        tmp.rename(folder)
    notes, _inst = load_notes(folder)
    if not notes:
        raise ValueError("the stem's MIDI has no notes")
    if job is not None:
        job.update(status="running", stage="velocity")
    vel = velocities(notes, stem)
    if mode == "octave":
        notes = [[a, b, min(127, max(0, p + shift)) if not dr else p, pr, dr] for a, b, p, pr, dr in notes]
    info = sf.info(str(stem))
    rate, frames = info.samplerate, info.frames
    oid = oid or "orchestra-" + _t.strftime("%Y%m%d-%H%M%S")
    tmp = d / "derived" / (oid + ".part")
    tmp.mkdir(parents=True, exist_ok=True)
    if job is not None:
        job.update(stage="render")
    groups = {}                                       # each part on its own instrument: the one asked, or the map's, or its GM program
    cmap = instrument_map(kit, d) if inst is None else {}       # the take's own map over the studio's
    gm = gm_bank(kit)
    label = (inst or {}).get("label") or ("the map" if inst is None else Path(inst.get("file", "")).stem)
    for n, v in zip(notes, vel):
        groups.setdefault(128 if n[4] else int(n[3]), []).append((n, v))
    mix = None
    for prog, sel in sorted(groups.items()):
        ns, vs = [x[0] for x in sel], [x[1] for x in sel]
        use = inst
        if use is None:
            g = "drums" if prog == 128 else next((i.get("label") for i in _inst if int(i.get("program", -1)) == prog), None)
            use = cmap.get(g) or ({"kind": "sf2", "file": gm} if gm else None)
            if use is None:
                raise FileNotFoundError("no instrument for it: no GM bank here (models/instruments)")
        part_wav = tmp / f"part-{prog}.wav"
        if use["kind"] == "split":
            render_split(kit, ns, vs, [(lo, hi, x) for lo, hi, x in use["ranges"]], part_wav, rate)
        else:
            render(kit, write_mid(prepare(kit, ns, use), vs, tmp / f"part-{prog}.mid"), use, part_wav, rate)
        a, _ = sf.read(str(part_wav), always_2d=True, dtype="float32")
        a = np.pad(a, ((0, max(0, frames - len(a))), (0, 0)))[:frames]
        if a.shape[1] != info.channels:
            a = np.repeat(a[:, :1], info.channels, axis=1) if a.shape[1] == 1 else a[:, :info.channels]
        mix = a if mix is None else mix + a
    s, _ = sf.read(str(stem), always_2d=True, dtype="float32")
    mix = mix * (_level(s) / _level(mix))             # the render at the stem's level
    out = mix if mode == "instead" else s + mix * (1.0 if mode == "over" else 10 ** (-6 / 20))
    peak = float(np.abs(out).max())
    if peak > 0.98:                                   # a sum over full scale is lowered to it, said in the manifest
        out = out * (0.98 / peak)
    name = f"{Path(source).stem}-{mode}.flac"
    sf.write(str(tmp / name), out, rate, subtype="PCM_24")
    for f in tmp.glob("part-*"):
        f.unlink()
    shown = {"instead": "instead", "over": "over", "octave": f"octave {'+' if shift >= 0 else ''}{shift}"}[mode]
    man = {"id": oid, "kind": "orchestra", "parent": d.name, "source": source, "label": f"MIDI · {label} · {shown}", "mode": mode,
           "shift": shift if mode == "octave" else 0, "instrument": inst, "midi": str(folder.relative_to(d)), "notes": len(notes),
           "lowered_db": round(20 * np.log10(0.98 / peak), 2) if peak > 0.98 else 0.0,
           "files": [{"file": name, "name": f"MIDI · {label} · {shown}", "path": f"derived/{oid}/{name}", "source": source, "kind": "audio"}],
           "created": _t.strftime("%Y-%m-%d %H:%M")}
    json.dump(man, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    tmp.rename(d / "derived" / oid)
    return man


# ---- HERESY 1884: a few instruments to offer a stem in the Refiner's console (the library is hundreds): the sets whose set or file speaks
# of the stem's instruments (NOT: words that hide in others, a bassoon in «bass»), one patch a set: its main one (a kit's GM map first, then
# «kit», then a name repeating the set's own, then the shallowest, then the shortest; a multi-mic part or a mapping never); VSCO 2's string
# sections as one for the rest; the map (each group as user/orchestra.json says, else its GM program) always first.
# not «keys» among the piano words: a keyswitched bass is no piano
WORDS = {"piano": ("piano", "grand"), "bass": ("bass",), "drums": ("drum", "kit"), "guitar": ("guitar",),
         "winds": ("trumpet", "horn", "trombone", "tuba", "sax", "flute", "clarinet", "oboe", "bassoon", "brass", "wind"),
         "other": ("violin", "viola", "cello", "contrabass", "string", "organ", "harp", "pad"), "lead_vocal": ("choir", "voice", "vox", "aah"),
         "vocals": ("choir", "voice", "vox", "aah")}
NOT = {"bass": ("bassoon", "bassdrum", "bass drum", "bass_drum"), "drums": ("steeldrum", "steel drum", "steel_drum", "steel"),
       "other": ("banjo", "zither", "guitar")}
COLLECTIONS = ("vsco2-ce", "vcsl", "sonatina-sso", "Discord-SFZ-GM-Bank")   # many instruments in one set: a patch for each word
# HERESY 1887: his ear on the 29.10 stand (the fork read his marks by bank): the sets he liked offered first, the rest by name; the ones he
# disliked not offered (Karoryfer's characterful basses, drums and piano, DSmolken's and bigcat's own keymaps and keyswitches: low notes
# landed on switches, GM drums on the wrong pieces); the GM banks he liked for bass, drums and strings, each note's own program, after the map
FIRST = ("SplendidGrandPiano", "BengtNilsson.HeadroomPiano", "salamander", "SMDrums", "DrumGizmo.DRSKit", "WilkinsonAudio.NakedDrums", "vsco2-ce")
AVOID = ("karoryfer.big-rusty-drums", "karoryfer.scarypiano")          # his word 29.10: «к чертям в ад, там им место, однозначно»
# HERESY 1888: sets with their own keys (Karoryfer's, DSmolken's, bigcat's: a bass an octave under its key, switches below) play through the
# keymap heard from them; their drum kits through a drum keymap of their own (1889: DRUM_KITS), the ones without one not offered
KEYMAPPED = ("karoryfer", "Karoryfer", "dsmolken.")
GM_LIKED = (("GeneralUser GS · GM", "generaluser-gs/GeneralUser-GS.sf2"), ("FluidR3 · GM", "fluidr3/FluidR3_GM.sf2"),
            ("MuseScore General · GM", "musescore-general/MuseScore_General.sf2"))
PREFER = {"bass": r"pizz|finger|pick"}                 # a stem's own articulation first (a bass plucked, not bowed); else a sustained one
VSCO_SECTIONS = [(0, 35, "ContrabassSusVB.sfz"), (36, 47, "CelloEnsSusVib.sfz"), (48, 54, "ViolaEnsSusVib.sfz"), (55, 127, "ViolinEnsSusVib.sfz")]


def _main_patch(stem, key, i):
    """A set's patch ranked for being its main one: lower is better."""
    import re
    f, name = i["file"].lower(), i["name"].lower()
    if "/multi" in f or "mapping" in f or "noise" in name:     # 1891: a noise patch (a bass's fingering noise) is no instrument
        return (9, 0, 0, 0, 0, 0, 0)
    if any(w in f for w in ("/modules/", "/includes/", "/keymaps/")):   # 1924: a fragment a program includes plays nothing of its own
        return (9, 0, 0, 0, 0, 0, 0)
    gm = 0 if stem == "drums" and re.search(r"\bgm\b", name) else 1
    kit = 0 if "kit" in name else 1
    own = 0 if any(w in name for w in re.split(r"[^a-z]+", key.lower().split(".")[-1]) if len(w) > 3) else 1
    short = r"stac|spic|trem|arco|mute" + ("" if stem in PREFER and "pizz" in PREFER[stem] else "|pizz")
    art = (0 if re.search(PREFER.get(stem, r"sus|vib"), name) else 2 if re.search(r"-ks\b|keysw|switch", name)
           else 3 if re.search(short, name) else 1)       # the 29.10 stand: a keyswitched double bass met 0.25 of the onsets
    lead = re.match(r"\d+", name)                           # a GM bank's patches by their program: 000 Acoustic Grand before 004 Honky-tonk
    return (gm, kit, own, art, int(lead.group()) if lead and key.split()[0] in COLLECTIONS else 999, f.count("/"), len(name))


# ---- HERESY 1924: an offer must sound: heard once, six notes of the stem's range as make_version plays them, its peak kept.
SOUNDS = "_sounds.json"
STEM_RANGE = {"guitar": (45, 64), "bass": (31, 50), "piano": (48, 72), "other": (55, 79), "winds": (62, 79), "lead_vocal": (55, 79),
              "vocals": (55, 79)}
DRUM_TEST = (36, 38, 42, 46, 49, 51)
SILENT_DB = -50.0


def sounds(kit, inst, stem):
    """The peak in dB of six notes of a stem's range played by inst (through its keymap, a split one by sections), heard once and kept
    in models/instruments/_keymaps/_sounds.json; an instrument that fails to render is silent (and not kept, so it is heard again)."""
    import numpy as np
    import soundfile as sf
    store = Path(kit) / "models" / "instruments" / KEYMAPS / SOUNDS
    seen = json.load(open(store, encoding="utf-8")) if store.is_file() else {}
    files = [r[2]["file"] for r in inst["ranges"]] if inst["kind"] == "split" else [inst["file"]]
    tag = "|".join(files + [stem, inst.get("keymap", ""), str(inst.get("preset", ""))])
    if tag in seen:
        return seen[tag]
    drum = stem == "drums"
    lo, hi = STEM_RANGE.get(stem, (48, 72))
    notes = [[i * 0.5, i * 0.5 + 0.45, DRUM_TEST[i] if drum else lo + (hi - lo) * i // 5, 128 if drum else 0, int(drum)] for i in range(6)]
    with tempfile.TemporaryDirectory(dir=str(Path(kit) / "tmp")) as t:
        try:
            if inst["kind"] == "split":
                w = render_split(kit, notes, [100] * 6, [(a, b, c) for a, b, c in inst["ranges"]], Path(t) / "s.wav")
            else:
                w = render(kit, write_mid(prepare(kit, notes, inst), [100] * 6, Path(t) / "s.mid"), inst, Path(t) / "s.wav")
            a, _ = sf.read(w, always_2d=True)
        except Exception:                             # noqa: BLE001 — a set that will not render is offered nothing, said in its peak
            return -120.0
    peak = round(float(20 * np.log10(np.abs(a).max() + 1e-9)), 1)
    seen = json.load(open(store, encoding="utf-8")) if store.is_file() else {}
    seen[tag] = peak
    store.parent.mkdir(parents=True, exist_ok=True)
    json.dump(seen, open(store, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return peak


def suggest(kit, stem, most=12):
    """[{label, instrument}] for a stem's name (piano, bass, drums…): the map first (instrument None), then a patch a set that fits, each
    heard to sound (1924)."""
    out = [{"label": "map", "instrument": None}]
    words, nots = WORDS.get(stem, ()), NOT.get(stem, ())
    if not words:
        return out
    root = Path(kit) / "models" / "instruments"
    out += [{"label": lb, "instrument": {"kind": "sf2", "file": f, "label": lb}} for lb, f in GM_LIKED if (root / f).is_file()
            and sounds(kit, {"kind": "sf2", "file": f}, stem) > SILENT_DB]
    lib = library(kit)
    if stem == "other":
        files = {Path(i["file"]).name: i["file"] for i in lib if i["set"] == "vsco2-ce" and i["kind"] == "sfz"}
        if all(f in files for _, _, f in VSCO_SECTIONS):
            split = {"kind": "split", "label": "VSCO 2 · string sections", "ranges": [[lo, hi, {"kind": "sfz", "file": files[f]}] for lo, hi, f in VSCO_SECTIONS]}
            if sounds(kit, split, stem) > SILENT_DB:
                out.append({"label": "VSCO 2 · string sections", "instrument": split})
    best = {}
    for i in lib:
        if i["kind"] != "sfz":
            continue
        hay = (i["set"] + " " + i["file"]).lower()
        for w in nots:
            hay = hay.replace(w, " ")
        hit = [w for w in words if w in hay]
        if not hit:
            continue
        key = i["file"].split("/")[1] if i["set"] == "sfzinstruments" and "/" in i["file"] else i["set"]   # an sfzinstruments repo its own set
        if key.startswith(AVOID) or (key.startswith(KEYMAPPED) and stem == "drums" and key not in DRUM_KITS):
            continue
        if i["set"] in COLLECTIONS:
            key = f"{i['set']} {hit[0]}"
        if _main_patch(stem, key, i)[0] == 9:
            continue
        if key not in best or _main_patch(stem, key, i) < _main_patch(stem, key, best[key]):
            best[key] = i
    first = lambda k: (FIRST.index(k.split()[0]) if k.split()[0] in FIRST else len(FIRST),
                       _main_patch(stem, k, best[k])[:2] if stem == "drums" else (), k.lower())   # 1889: a kit before a drum alone
    for key in sorted(best, key=first):
        if len(out) >= most:
            break
        i = best[key]
        shown = f"{key.split()[0]} · {i['name']}"
        inst = {"kind": "sfz", "file": i["file"], "label": shown}
        if key.startswith(KEYMAPPED):
            inst["keymap"] = "drums" if stem == "drums" else "auto"
        if sounds(kit, inst, stem) <= SILENT_DB:       # 1924: heard silent (a sample path its own player's, a kit off GM's keys)
            continue
        out.append({"label": shown, "instrument": inst})
    return out


# ---- HERESY 1888 (Viktor 29.10.2026: «рано выбрасывать эти наборы… нужно разобраться»): an instrument's own keymap, heard rather than read.
# Every key played once through it, each one's sound, pitch (pyin) and band measured; a pitched instrument's offset between the key and what
# it sounds (Karoryfer's basses sound an octave under the key, as a bass's part is written) and the keys that sound with a pitch (a key that
# sounds without one is a noise or a switch: never played); a note moved by that offset, and by octaves into the range when outside it.
# Probed once an instrument, kept under models/instruments/_keymaps/.
KEYMAPS = "_keymaps"


def probe(kit, inst, gap=0.7, length=0.45):
    """[(key, dB, sounding pitch or None, band centre Hz)] for the keys that sound."""
    import librosa
    import numpy as np
    import soundfile as sf
    with tempfile.TemporaryDirectory(dir=str(Path(kit) / "tmp")) as t:
        notes = [[k * gap, k * gap + length, k, 0, 0] for k in range(128)]
        mid = write_mid(notes, [100] * 128, Path(t) / "keys.mid", tail=1.0)
        wav = render(kit, mid, {"kind": "sfz", "file": inst["file"]}, Path(t) / "keys.wav", 48000)
        y, sr = sf.read(wav, always_2d=True, dtype="float32")
    y = y.mean(axis=1)
    out = []
    for k in range(128):
        seg = y[int(k * gap * sr):int((k + 1) * gap * sr)]
        if not len(seg):
            continue
        db = 20 * np.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-9)
        if db < -60:
            continue
        f0, vo, _ = librosa.pyin(librosa.resample(seg, orig_sr=sr, target_sr=16000), fmin=30, fmax=2000, sr=16000)
        f0 = float(np.nanmedian(f0[vo])) if np.any(vo) else float("nan")
        cen = float(np.mean(librosa.feature.spectral_centroid(y=seg, sr=sr)))
        out.append((k, round(db, 1), round(float(librosa.hz_to_midi(f0)), 2) if np.isfinite(f0) else None, round(cen)))
    return out


def keymap(kit, inst, fresh=False):
    """{offset, low, high, keys} of a pitched SFZ, heard (probe) and kept: what to play for a pitch is pitch − offset, inside [low, high]."""
    root = Path(kit) / "models" / "instruments"
    cache = root / KEYMAPS / (inst["file"].replace("/", "__") + ".json")
    if cache.is_file() and not fresh:
        km = json.load(open(cache, encoding="utf-8"))
        if km.get("v") == 2:                          # 1891: one of the first reading (an octave slip a hole) is heard again
            return km
    rows = probe(kit, inst)
    pitched = [(k, p) for k, _db, p, _c in rows if p is not None and abs((p - k) - round(p - k)) < 0.35]
    offs = [round(p - k) for k, p in pitched]
    off = int(max(set(offs), key=offs.count)) if offs else 0            # the offset most keys agree on
    if offs and offs.count(off - 12) >= 0.25 * offs.count(off):          # pyin slips up an octave, not down: the lower of two readings
        off -= 12
    run = sorted(k for k, p in pitched if round(p - k) == off)          # the range: the keys heard at the offset exactly
    lo, hi = (run[0], run[-1]) if run else (0, 127)
    near = lambda d: min(abs(d), abs(d - 12)) < 0.6                     # its note (a unison's detune), or its second harmonic (pyin's slip)
    keys = sorted(k for k, _db, p, _c in rows if lo <= k <= hi and (p is None or near(p - k - off)))   # 1891: no pitch heard is a pluck missed
    km = {"v": 2, "file": inst["file"], "offset": off, "low": lo, "high": hi, "keys": keys, "sounding": len(rows)}
    cache.parent.mkdir(parents=True, exist_ok=True)
    json.dump(km, open(cache, "w", encoding="utf-8"), indent=1)
    return km


def remap(notes, km):
    """A part's notes on an instrument's own keys: each pitch less its offset, moved by octaves into its range, on a key that sounds."""
    keys, out = set(km["keys"]), []
    for on, off, p, prog, dr in notes:
        if dr:
            out.append([on, off, p, prog, dr])
            continue
        k = int(p) - km["offset"]
        while k < km["low"] and k + 12 <= km["high"]:
            k += 12
        while k > km["high"] and k - 12 >= km["low"]:
            k -= 12
        if keys and k not in keys:                    # a hole (a switch, a noise): the nearest key that sounds, an octave first
            near = [x for x in (k + 12, k - 12) if x in keys] or sorted(keys, key=lambda x: abs(x - k))[:1]
            k = near[0]
        out.append([on, off, k, prog, dr])
    return out
