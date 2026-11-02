"""HERESY 2006 · Layer (Viktor 01.11.2026: «универсальный плагин эффектов в сам DAW… подключать… банки эффектов или инструментов в SFZ формате.
Новая дорожка для наложения эффектов. Брать как нотный референс один из стемов, задавать значения выше/ниже… либо подсовывать готовый
стемированный MIDI»): a bank from the shelf (lab/banks.py) laid under the song as a strip of its own in the DAW (1929's way).

  an ambience bank (models/ambient): its field recordings as a bed, looped without a seam (lab/ambient.py), as the Ambient step lays them;
  an SFZ bank (an instrument, an effect, a drone, a voice): played by sfizz from
    bed    one note held through the song, struck again before it dies (an effect's or a pad's own sound),
    drone  the song's key, its root and fifth low, held the same way (the key found from the song, or the note asked),
    notes  a MIDI file of the tree (a stem's notes from MuScriptor or Basic Pitch, or one of yours), moved up or down by semitones;
  then sat under the song: its level the dB asked against the song where both sound, faded in and out, the song's length. Made again with the
  same bank, it is that strip's version; the curves are the DAW's own lines on its lane.
    layer.py STEMS_DIR OUTDIR PARAMS.json"""
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

LAB = Path(__file__).resolve().parents[2]
KIT = Path(os.environ.get("RUACH_KIT") or LAB.parent)   # a kit of its own for the checks
sys.path.insert(0, str(LAB))
import banks as B  # noqa: E402
import orchestra as O  # noqa: E402

NAMES = "C C# D D# E F F# G G# A A# B".split()


def note_of(s):
    """«C3», «F#2», «60» → a MIDI note; None for «auto»."""
    s = str(s or "auto").strip()
    if s.lower() in ("", "auto"):
        return None
    if s.isdigit():
        return max(0, min(127, int(s)))
    m = re.fullmatch(r"([A-Ga-g])(#|b)?(-?\d)", s)
    if not m:
        raise SystemExit(f"a note is like C3, F#2 or 48, or auto: {s!r}")
    pc = NAMES.index(m.group(1).upper()) + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return max(0, min(127, (int(m.group(3)) + 1) * 12 + pc % 12))


def key_root(song, rate):
    """The song's tonic as a pitch class, by its chroma summed (the strongest class, with its fifth's weight): rough, a drone's ground."""
    import librosa
    mono = song.mean(axis=0) if song.ndim == 2 else song
    y = librosa.resample(mono[: rate * 240], orig_sr=rate, target_sr=22050) if rate != 22050 else mono[: rate * 240]
    c = librosa.feature.chroma_cqt(y=y, sr=22050).mean(axis=1)
    score = c + 0.5 * np.roll(c, -7)
    return int(np.argmax(score))


def held(notes, seconds, every=8.0):
    """notes struck together, again every `every` seconds through the song, each held up to the next strike and its release sounding past it
    (a key held past its own next strike ends that strike: MIDI knows a key, not a voice, and on 01.11 the overlap left the bed silent half the
    song); the last held two seconds past the end."""
    out, t = [], 0.0
    while t < seconds:
        for p in notes:
            out.append([t, t + every if t + every < seconds else seconds + 2.0, int(p), 0, 0])
        t += every
    return out


def sat(x, song, level_db, fade_in, fade_out, rate):
    """The layer under the song: its loudness where it sounds the song's (where the song sounds) + level_db; faded in and out."""
    win = int(0.4 * rate)
    def rms_where(v):
        m = v.mean(axis=0)
        n = len(m) // win
        if n < 1:
            return float(np.sqrt(np.mean(m ** 2)) + 1e-12)
        r = np.sqrt(np.mean(m[: n * win].reshape(n, win) ** 2, axis=1))
        on = r[r > r.max() * 10 ** (-40 / 20)] if r.max() > 0 else r
        return float(np.sqrt(np.mean(on ** 2)) + 1e-12) if len(on) else 1e-12
    g = rms_where(song) / rms_where(x) * 10 ** (level_db / 20)
    x = x * g
    n = x.shape[1]
    env = np.ones(n)
    a, b = int(fade_in * rate), int(fade_out * rate)
    if a > 0:
        env[: min(a, n)] = np.linspace(0, 1, min(a, n)) ** 2
    if b > 0:
        env[n - min(b, n):] *= np.linspace(1, 0, min(b, n)) ** 2
    return x * env


def main():
    t0 = time.time()
    sdir, outdir, pfile = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    p = json.load(open(pfile, encoding="utf-8"))
    card = B.card(KIT, str(p.get("bank") or ""))
    how = str(p.get("how") or "bed")
    level, fin, fout = float(p.get("level", -18)), float(p.get("fade_in", 4)), float(p.get("fade_out", 6))
    man = json.load(open(sdir / "manifest.json", encoding="utf-8"))
    rel = sdir.resolve()
    take = rel.parent.parent if rel.parent.name == "derived" else rel.parent
    src = man.get("source") or "the take"
    song_path = next((take / f for f in ("audio.wav", "audio.flac") if (take / f).is_file()), None) if src == "the take" else take / src
    if not song_path or not song_path.is_file():
        raise SystemExit("the set's source is not there to lay the layer under")
    song, rate = sf.read(str(song_path), dtype="float64", always_2d=True)
    song = song.T if song.shape[1] > 1 else np.repeat(song.T, 2, axis=0)
    frames, seconds = song.shape[1], song.shape[1] / rate
    slug = re.sub(r"[^a-z0-9]+", "_", card["id"].split(":", 1)[1].lower()).strip("_")[:40]
    said = ""
    if card["kind"] == "ambience" and not card["sfz"]:    # the ambient layers' field recordings, as the Ambient step lays them
        import ambient as A
        layer = card["id"].split(":", 1)[1]
        s48 = song if rate == A.SR else __import__("librosa").resample(song, orig_sr=rate, target_sr=A.SR)
        x = A.render(KIT, layer, "bank", seconds, song=s48, seed=int(p.get("seed", 7)), level_db=level, fade_in=fin, fade_out=fout,
                     breathe_db=3.0, public_only=False)
        if rate != A.SR:
            x = __import__("librosa").resample(x, orig_sr=A.SR, target_sr=rate)
        x = np.pad(x, ((0, 0), (0, max(0, frames - x.shape[1]))))[:, :frames]
        said = "its field recordings, looped"
    else:
        base = KIT / card["where"]
        sfz = str(p.get("sfz") or "").strip() or card["sfz"][0]
        f = (KIT / "models" / "instruments" / sfz) if card["id"].startswith("inst:") else (base / sfz)
        if not f.is_file():
            raise SystemExit(f"{card['name']} has no {sfz}")
        shift = int(float(p.get("transpose", 0) or 0))
        if how == "notes":
            mid = str(p.get("midi") or "")
            if not mid or not Path(mid).is_file():
                raise SystemExit("notes: choose a MIDI file of the tree (a stem's notes, from MIDI or Basic Pitch)")
            import mido
            notes, vel = [], []
            m = mido.MidiFile(mid)
            t, on = 0.0, {}
            for msg in m:
                t += msg.time
                if msg.type == "note_on" and msg.velocity > 0:
                    on[(msg.channel, msg.note)] = (t, msg.velocity)
                elif msg.type in ("note_off", "note_on") and (msg.channel, msg.note) in on:
                    a, v = on.pop((msg.channel, msg.note))
                    if msg.channel != 9:
                        notes.append([a, max(a + 0.05, t), max(0, min(127, msg.note + shift)), 0, 0]); vel.append(v)
            if not notes:
                raise SystemExit("the MIDI file holds no notes to play")
            said = f"{len(notes)} notes of {Path(mid).name}" + (f", {shift:+d} semitones" if shift else "")
        else:
            root = note_of(p.get("note"))
            if how == "drone":
                pc = key_root(song, rate) if root is None else root % 12
                low = 36 + pc + shift
                notes, said = held([low, low + 7], seconds), f"a drone on {NAMES[pc % 12]} (its root and fifth)"
            else:
                n0 = (60 if root is None else root) + shift
                notes, said = held([n0], seconds), f"held on {NAMES[n0 % 12]}{n0 // 12 - 1}"
            vel = [90] * len(notes)
        with tempfile.TemporaryDirectory() as tmp:
            midf, wav = Path(tmp) / "layer.mid", Path(tmp) / "layer.wav"
            O.write_mid(notes, vel, str(midf))
            O.render(KIT, str(midf), {"kind": "sfz", "file": str(f)}, str(wav), rate=rate)
            y, r2 = sf.read(str(wav), dtype="float64", always_2d=True)
        y = y.T if y.shape[1] > 1 else np.repeat(y.T, 2, axis=0)
        if r2 != rate:
            y = __import__("librosa").resample(y, orig_sr=r2, target_sr=rate)
        y = np.pad(y, ((0, 0), (0, max(0, frames - y.shape[1]))))[:, :frames]
        if not np.any(y):
            raise SystemExit(f"{Path(sfz).name} gave silence for these notes (its keys may lie elsewhere: try another note or a transpose)")
        x = sat(y, song, level, fin, fout, rate)
    pk = float(np.abs(x).max()) if x.size else 0.0
    if pk > 0.999:
        x *= 0.999 / pk
    name = f"layer_{slug}.flac"
    sf.write(str(Path(outdir) / name), x.T.astype(np.float32), rate, subtype="PCM_24")
    print(json.dumps({"files": [{"name": f"{card['name']} · {said}", "file": name, "seconds": round(frames / rate, 2), "track": f"layer_{slug}",
                                 "title": card["name"]}],
                      "measure": {"bank": card["id"], "how": how if card["sfz"] else "bed", "licence": card["licence"], "may_ship": card["may_ship"], "level_db": level},
                      "summary": f"{card['name']} under the song ({said}), {level:g} dB against it; a strip of its own in the DAW · licence: {card['licence']}"
                                 + ("" if card["may_ship"] else " (not to ship as it stands)"),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
