"""HERESY 2006 · Layer (Viktor 01.11.2026: «универсальный плагин эффектов в сам DAW… подключать… банки эффектов или инструментов в SFZ формате.
Новая дорожка для наложения эффектов. Брать как нотный референс один из стемов, задавать значения выше/ниже… либо подсовывать готовый
стемированный MIDI»): a bank from the shelf (lab/banks.py) laid under the song as a strip of its own in the DAW (1929's way).

  an ambience bank (models/refiner/ambient): its field recordings as a bed, looped without a seam (lab/ambient.py), as the Ambient step lays them;
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
import paths  # noqa: E402   HERESY 2330: where the weights live

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


STRIKE_XF = 0.3                     # HERESY 2061: a key struck again this long before its sample ends (the Bank Builder's banks release in 0.3 s)
RESTRIKE_S = 2.0                    # HERESY 2061b: a key never struck again sooner than this after its last strike (a 0.48 s pizzicato was struck 240 times a minute)
SHORT_S = 1.5                       # HERESY 2061b: a sample shorter than this (a pluck, a pizzicato) keeps the old cadence, every `every` seconds


def held(notes, seconds, every=8.0, lasts=None):
    """notes struck together, again every `every` seconds through the song, each held up to the next strike and its release sounding past it
    (a key held past its own next strike ends that strike: MIDI knows a key, not a voice, and on 01.11 the overlap left the bed silent half the
    song); the last held two seconds past the end. HERESY 2061: lasts ({key: [seconds or None, …]}, lasts_of), each key on its own: struck
    again STRIKE_XF before its sample ends (its round robins in turn), every `every` seconds while it holds (a loop); without lasts, as before.
    HERESY 2061b (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»; the re-audit: CelloEnsPizz C3, 0.48 s, was struck four times a second): never sooner than RESTRIKE_S after the last strike, and a
    sample shorter than SHORT_S every `every` seconds, as before 2061."""
    out = []
    for p in notes:
        pat = (lasts or {}).get(int(p)) or [None]
        t, n = 0.0, 0
        while t < seconds:
            last = pat[n % len(pat)]
            step = every if last is None or last < SHORT_S else min(every, max(last - STRIKE_XF, RESTRIKE_S))   # HERESY 2061b
            out.append([t, t + step if t + step < seconds else seconds + 2.0, int(p), 0, 0])
            t, n = t + step, n + 1
    return sorted(out, key=lambda x: x[0])


def _voted(runs):
    """HERESY 2061b (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»; the re-audit of 2061): the probes of lasts_of outvote a play cut short. runs: [{key: [seconds or None, …]}, …], one dict a probe, the same strikes
    in each. Where the probes agree on a strike (within 0.1 s, or all heard through) it is kept as heard: a round robin short by itself (a short
    call beside a long one) is no cut. Where they disagree, a length under half the key's median (over every probe's lengths, a strike heard
    through left out of it) is a play cut short and dropped, and the strike takes the median of what is left of it: heard through in one probe
    and ending in another, its end (struck early never leaves a gap); every length of it dropped, the key's median."""
    def same(u, v):
        return (u is None) == (v is None) and (u is None or abs(u - v) <= 0.1)
    out = {}
    for k in runs[0]:
        cols = list(zip(*(run[k] for run in runs)))            # each strike's lengths, one per probe
        ends = [x for c in cols for x in c if x is not None]
        med = float(np.median(ends)) if ends else None
        ls = []
        for c in cols:
            if all(same(c[0], x) for x in c[1:]):
                ls.append(None if c[0] is None else float(np.median(c)))
                continue
            kept = [x for x in c if x is None or x >= med / 2]
            nums = [x for x in kept if x is not None]
            ls.append(float(np.median(nums)) if nums else (None if kept else med))
        out[k] = ls
    return out


def lasts_of(f, keys, every=8.0, strikes=10, rate=22050, probes=2):
    """HERESY 2061 (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»; the audit: a narrow bank's drone died after a breath, its
    samples unlooped and struck again only every 8 s): how long each strike of each key sounds through the SFZ f. Each key is struck `strikes`
    times alone, `every` seconds a strike, and sfizz plays them as it will play the song (its round robins in turn): None for a strike that still
    sounds at its end (a loop, or a long sound), else the seconds until it falls 12 dB under its body, when the sound is gone after it (30 dB
    under). Each key's pattern is kept to its own period (the round robins' count); one with no period gives its shortest to every strike.
    HERESY 2061b (the re-audit: sfizz_render now and then cuts a probe's play short, ~0.18 s at 22 050 Hz, and that strike's length went to every
    strike of the key, 6 runs of 16 on banks/Duduk-sample): the bank is probed `probes` times and the probes vote, strike by strike (_voted).
    {key: [seconds or None, …]}"""
    notes, at, t = [], [], 0.0
    for k in keys:
        for _ in range(strikes):
            notes.append([t, t + every, int(k), 0, 0])
            at.append((int(k), t))
            t += every + 1.0
    def probe():
        with tempfile.TemporaryDirectory() as tmp:
            midf, wav = Path(tmp) / "probe.mid", Path(tmp) / "probe.wav"
            O.write_mid(notes, [90] * len(notes), str(midf))
            O.render(KIT, str(midf), {"kind": "sfz", "file": str(f)}, str(wav), rate=rate)
            y, r = sf.read(str(wav), dtype="float64", always_2d=True)
        m = y.mean(axis=1)
        win = max(1, int(0.02 * r))
        got = {}
        for k, t0 in at:
            seg = m[int(t0 * r):int((t0 + every) * r)]
            n, last = len(seg) // win, None
            if n >= 40:
                lv = 20 * np.log10(np.sqrt(np.mean(seg[:n * win].reshape(n, win) ** 2, axis=1)) + 1e-12)
                on = lv[lv > -90]
                if len(on) >= 5:
                    body = float(np.percentile(on, 90))
                    if lv[-25:].max() < body - 30:        # its last half second silent: the sample ended before the strike did
                        last = float((np.where(lv >= body - 12)[0].max() + 1) * win / r)
            got.setdefault(k, []).append(last)
        return got

    out = _voted([probe() for _ in range(max(1, int(probes)))])   # HERESY 2061b: a play cut short in one probe is outvoted by the others

    def same(u, v):
        return (u is None) == (v is None) and (u is None or abs(u - v) <= 0.1)
    for k, ls in out.items():
        c = next(c for c in range(1, len(ls) + 1) if all(same(ls[j], ls[j + c]) for j in range(len(ls) - c)))
        out[k] = ls[:c] if c < len(ls) else [min((x for x in ls if x is not None), default=None)]
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
        f = (paths.at(paths.REFINER_INSTRUMENTS, KIT) / sfz) if card["id"].startswith("inst:") else (base / sfz)
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
                rng = card.get("range")                  # HERESY 2031: a bank that knows its range (a duduk's E3–E5) hears its drone there
                if rng and isinstance(rng, list) and len(rng) == 2:
                    lo, hi = rng[0] - 4, rng[1] + 4          # its samples reach four keys past their ends
                    ups = [low + 12 * k for k in range(7)]
                    low = next((x for x in ups if lo <= x and x + 7 <= hi), next((x for x in ups if lo <= x <= hi), low))   # root and fifth, else the root
                notes, said = held([low, low + 7], seconds, lasts=lasts_of(f, [low, low + 7])), f"a drone on {NAMES[pc % 12]} (its root and fifth)"   # HERESY 2061
            else:
                n0 = (60 if root is None else root) + shift
                notes, said = held([n0], seconds, lasts=lasts_of(f, [n0])), f"held on {NAMES[n0 % 12]}{n0 // 12 - 1}"   # HERESY 2061
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
