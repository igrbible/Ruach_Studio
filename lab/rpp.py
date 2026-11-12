"""HERESY 1104: a take as a REAPER project (Viktor, 02.10.2026: the whole take handed to the user's DAW, where the
rest happens outside the Studio). What the Studio knows of a song and no plain stems export carries:

  · the mix, and every stem the take has (derived/stems-*/), each on its own track from 0; the mix muted when
    there are stems, so the stems sound and the mix waits as the reference
  · the score as MIDI, one track a voice, as the page writes it from the ABC (the score as written: the song
    as sung may drift from it), on the score's own tempo and meter
  · the lyrics on the timeline, a line an empty item with the line as its note, and the sections ([Verse],
    [Chorus], …) as regions, both when Whisper has already timed the take (the Refiner's lyrics check); a take
    not timed goes out without them, and the answer says so
  · the recipe in the project's notes: title, style, seeds, the take's name
  · HERESY 2201: the markers of your own (K in the DAW) as REAPER's plain markers, their names exactly as typed
  · HERESY 2226: the timed lyrics once more as MIDI lyric events, a word each (REAPER's MIDI editor and notation show them)
  · HERESY 2227: the score's chord symbols on a Chords track, a MIDI item a chord, named by it and carrying it as a text event

Packed as derived/reaper/TITLE.zip in the take (the engine hands it over): TITLE/TITLE.RPP beside TITLE/audio/.
REAPER reads plain-text projects; the format here was checked by REAPER itself (7.81), not only written."""
import base64, json, re, subprocess, time, uuid, zipfile
from pathlib import Path

PPQ = 960                                               # REAPER's ticks a quarter note in a MIDI item
COLORS = {"mix": (217, 157, 16), "vocals": (224, 93, 93), "instrumental": (93, 141, 224), "drums": (224, 168, 93),
          "bass": (125, 93, 224), "other": (93, 224, 154), "piano": (192, 192, 192), "guitar": (93, 208, 224),
          "score": (160, 120, 200), "lyrics": (150, 150, 150)}



# HERESY 1475: what waits, muted, when the project opens: the mix beside stems; a set's instrumental or whole voice beside its own
# parts; every set less detailed than the most detailed one the take has (its parts would double the same sound)
PARTS = {"instrumental": ("drums", "bass", "other", "guitar", "piano", "winds"), "vocals": ("lead_vocal", "backing_vocals")}
RANK = {"vocals": 0, "four": 1, "six": 2, "eight": 3}


def waiting(sources, modes):
    top = max([RANK.get(m, 0) for m in modes[1:]] or [-1])
    have = {}
    for (label, kind, src), mode in zip(sources, modes):
        have.setdefault(mode, set()).add(kind)
    out = []
    for (label, kind, src), mode in zip(sources, modes):
        if mode == "mix":
            out.append(len(sources) > 1)
        else:
            out.append(RANK.get(mode, 0) < top or any(n in have[mode] for n in PARTS.get(kind, ())))
    return out

def _q(s):
    """A string as REAPER quotes it: double quotes, unless the text has them, then single or back quotes."""
    s = str(s).replace("\n", " ").replace("\r", " ")
    for q in ('"', "'", "`"):
        if q not in s:
            return q + s + q
    return '"' + s.replace('"', "'") + '"'


def _col(kind):
    r, g, b = COLORS.get(kind, (160, 160, 160))
    return 0x1000000 | (b << 16) | (g << 8) | r           # REAPER's custom colour: the flag and BGR


def _seconds(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    return float(out or 0)


# ---- a standard MIDI file into REAPER's event lines, a list per track that has notes
def _vlq(b, i):
    v = 0
    while True:
        c = b[i]; i += 1
        v = (v << 7) | (c & 0x7F)
        if not c & 0x80:
            return v, i


def midi_tracks(data):
    if data[:4] != b"MThd":
        raise ValueError("not a MIDI file")
    fmt, ntr, div = int.from_bytes(data[8:10], "big"), int.from_bytes(data[10:12], "big"), int.from_bytes(data[12:14], "big")
    if div & 0x8000:
        raise ValueError("SMPTE-timed MIDI is not read here")
    pos, out = 8 + int.from_bytes(data[4:8], "big"), []
    for _ in range(ntr):
        if data[pos:pos + 4] != b"MTrk":
            break
        end = pos + 8 + int.from_bytes(data[pos + 4:pos + 8], "big")
        i, t, status, name, evs = pos + 8, 0, 0, "", []
        while i < end:
            dt, i = _vlq(data, i); t += dt
            c = data[i]
            if c == 0xFF:
                typ = data[i + 1]; ln, j = _vlq(data, i + 2)
                if typ == 0x03 and not name:
                    name = data[j:j + ln].decode("utf-8", "replace")
                i = j + ln
                continue
            if c in (0xF0, 0xF7):
                ln, j = _vlq(data, i + 1); i = j + ln
                continue
            if c & 0x80:
                status = c; i += 1
            n = 1 if status >> 4 in (0xC, 0xD) else 2
            evs.append((t, bytes([status]) + data[i:i + n])); i += n
        pos = end
        if any(e[1][0] >> 4 == 9 and e[1][2] > 0 for e in evs):
            out.append({"name": name or f"Voice {len(out) + 1}", "ticks": t, "events": evs})
    return div, out


def _midi_chunk(div, tr):
    k = PPQ / div
    lines, last = ["HASDATA 1 960 QN"], 0
    for t, ev in tr["events"]:
        tt = round(t * k)
        lines.append("E %d %s" % (tt - last, " ".join("%02x" % c for c in ev)))
        last = tt
    end = round(tr["ticks"] * k)
    lines.append("E %d b0 7b 00" % max(0, end - last))   # all notes off, at the item's end
    return lines, end


# ---- HERESY 2201: the markers of your own (the DAW's K, HERESY 2016), as the page sends them: [{"t": seconds, "name": text}]
MARK_MAX = 64                                           # the page keeps 64 at most (heresy-mixer.js MARK_MAX)


def user_marks(v):
    """([(t, name)] sorted, how many were refused): a time finite and not below 0; the name as typed, 40 characters at
    most (Decision D07: no formula guard, REAPER is no spreadsheet). Refused ones are counted, so the answer says so."""
    out, bad = [], 0
    for m in (v if isinstance(v, list) else []):
        try:
            t = float(m.get("t"))
        except (AttributeError, TypeError, ValueError):
            bad += 1
            continue
        if not (t == t and 0 <= t < 1e7):                # NaN, below 0, beyond any song
            bad += 1
            continue
        out.append((round(t, 3), str(m.get("name") or "")[:40]))
    out.sort(key=lambda x: x[0])
    if len(out) > MARK_MAX:
        bad += len(out) - MARK_MAX
        out = out[:MARK_MAX]
    if v is not None and not isinstance(v, list):
        bad += 1
    return out, bad


def _marker(i, t, name):
    """A plain marker's lines. A name holding all three quote kinds cannot stand on the MARKER line as typed, so it goes
    as REAPER 7.81 itself writes one (read back from a project REAPER saved, 06.11.2026, HERESY 2202): the line's fields
    to the end and the whole name in a MARKER_TEXT block, which REAPER reads over the line's quoted copy."""
    n = str(name).replace("\n", " ").replace("\r", " ")
    if all(q in n for q in ('"', "'", "`")):
        return [f"MARKER {i} {t:.3f} {_q(n)} 0 0 1 B {{{str(uuid.uuid4()).upper()}}} 0 2", "<MARKER_TEXT", "|" + n, ">"]
    return [f"MARKER {i} {t:.3f} {_q(n)} 0"]


def marks_said(marks, bad):
    """The answer's line on them, '' when none was sent."""
    if not marks and not bad:
        return ""
    s = f"{len(marks)} marker{'s' if len(marks) != 1 else ''} of yours"
    return s + (f" ({bad} refused)" if bad else "")


# ---- the lyrics' sections and lines, on the timing Whisper gave
def sections(lyrics, rows):
    """[(name, start, end)] from the [Tag] lines, on the timed rows (rows follow timing.rows_of's order)."""
    out, cur, k = [], None, 0
    for raw in lyrics.splitlines():
        s = raw.strip()
        if not s:
            continue
        m = re.match(r"^\[([^\]]+)\]$", s)
        if m:
            cur = {"name": m.group(1).strip(), "start": None}
            out.append(cur)
            continue
        if s.startswith("(") or k >= len(rows) or rows[k]["text"] != s:
            continue
        if cur is not None and cur["start"] is None and rows[k].get("start") is not None:
            cur["start"] = rows[k]["start"]
        k += 1
    timed = [x for x in out if x["start"] is not None]
    return [(x["name"], x["start"], (timed[i + 1]["start"] if i + 1 < len(timed) else None)) for i, x in enumerate(timed)]


# ---- HERESY 2226 and 2227: the lyrics as MIDI lyric events and the score's chords as chord symbols, as REAPER 7.81 itself saves a
# MIDI item's text: a <X delta 0 block, the event's bytes (FF, its type, the text, no length) in base64, 40 bytes a line
# (read back from a project REAPER saved, 07.11.2026)
def _text_event(dt, kind, text):
    b = bytes([0xFF, kind]) + str(text).replace("\n", " ").replace("\r", " ").encode("utf-8")
    return [f"<X {dt} 0", *(base64.b64encode(b[i:i + 40]).decode("ascii") for i in range(0, len(b), 40)), ">"]


def lyric_events(rows):
    """[(seconds, text)] in time order: a word an event at the time Whisper heard it (the row's tt, HERESY 1646), a word
    not heard riding with the one before; a row without word times (older timing, a guessed line) one event at its start."""
    from gloss_core import norm                          # the tokens timing.align counted, so the words meet their times
    out = []
    for r in rows or []:
        if r.get("start") is None:
            continue
        text = re.sub(r"\([^)]*\)", "", r.get("text") or "")
        words, tt = text.split(), r.get("tt") or []
        counts = [len(norm(w).split()) for w in words]
        evs = []
        if words and tt and sum(counts) == len(tt):
            k = 0
            for w, c in zip(words, counts):
                t = next((x[0] for x in tt[k:k + c] if x), None)
                k += c
                if t is None and evs:
                    evs[-1][1] += " " + w
                else:
                    evs.append([r["start"] if t is None else t, w])
        elif words:
            evs = [[r["start"], " ".join(words)]]
        out += [(max(0.0, float(t)), w) for t, w in evs]
    out.sort(key=lambda x: x[0])                          # stable: words of one time keep their order
    return out


def chord_symbols(abc):
    """([(start, end, symbol)] in quarter notes from the score's start, why): the score's chord symbols ("Am" in the ABC),
    read by the lab's own checker of the score (abc_tools, HERESY 1145); a chord held over several bars is one span.
    WHY is '' when the score was read (with or without chords), else what kept it from being read."""
    if not (abc or "").strip():
        return [], ""
    import abc_tools
    try:
        score = abc_tools.parse_abc(abc)
    except (ValueError, KeyError, IndexError) as e:      # AbcError is a ValueError
        return [], str(e)[:120] or type(e).__name__
    marks = sorted((t, c) for v in score.voices.values() for t, c in v.chords)
    end = max(v.time for v in score.voices.values())
    out = []
    for t, c in marks:
        if out and out[-1][2] == c:
            continue
        out.append([t, None, c])
    for i, x in enumerate(out):
        x[1] = out[i + 1][0] if i + 1 < len(out) else max(end, x[0])
    return [(float(a), float(b), c) for a, b, c in out], ""


def chords_said(chords, why, abc):
    """The answer's words on them: '' when the take has no score."""
    if why:
        return f"no chord track (the score could not be read: {why})"
    if not (abc or "").strip():
        return ""
    return f"chords: {len(chords)} as chord symbols" if chords else "no chord symbols in the score"


def build(kit, outputs, name, midi=None, cache=None, marks=None):
    """The take NAME as derived/reaper/TITLE.zip; returns its path and what went in. MARKS: the markers of your own
    (HERESY 2201), as user_marks reads them."""
    from dawproject import tempo_meter                   # the score's Q: and M: (or the style's bpm), as there
    d = outputs / name
    if "/" in name or name.startswith(".") or not (d / "meta.json").is_file():
        raise FileNotFoundError(f"no take {name}")
    meta = json.load(open(d / "meta.json", encoding="utf-8"))
    req = json.load(open(d / "request.json", encoding="utf-8")) if (d / "request.json").is_file() else {}
    title = meta.get("title") or name
    bpm, num, den = tempo_meter(req)
    # the take's own audio, whatever the engine wrote (WAV from the page, MP3 by the engine's default): HERESY 1116
    sources = [("Mix", "mix", next((d / f for f in ("audio.wav", "audio.flac", "audio.mp3") if (d / f).is_file()), d / "audio.wav"))]
    # HERESY 1169: a take may hold several sets of one kind (split from the take, from its debuzzed or upscaled file):
    # the newest of each kind goes in, the others would only double its tracks
    newest = {}
    for man in sorted(d.glob("derived/stems-*/manifest.json")):
        m = json.load(open(man, encoding="utf-8"))
        kind = m.get("mode") or "vocals"
        if kind not in newest or str(m.get("created") or "") >= str(newest[kind].get("created") or ""):
            newest[kind] = m
    modes = ["mix"]                                      # HERESY 1475: each track's set, for what sounds when the project opens
    for m in (newest[k] for k in sorted(newest)):
        for f in m.get("files", []):
            p = d / f["path"]
            if p.is_file():
                sources.append(((f.get("title") or f["name"].capitalize()) + ("" if m.get("mode") in (None, "vocals") else f" ({m['mode']})"), f["name"], p))   # 1463
                modes.append(m.get("mode") or "vocals")
    mutes = waiting(sources, modes)
    if not sources[0][2].is_file():
        raise FileNotFoundError(f"{name} has no audio (audio.wav, .flac or .mp3)")
    rows = None
    tpath = Path(cache) / f"{name}.timing.json" if cache else None
    if tpath and tpath.is_file() and tpath.stat().st_mtime >= sources[0][2].stat().st_mtime:
        t = json.load(open(tpath, encoding="utf-8"))
        rows = t.get("rows") if isinstance(t, dict) else t
    safe = re.sub(r"[^\w.-]+", "_", title, flags=re.UNICODE).strip("_") or name
    out_dir = d / "derived" / "reaper"
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / f".{safe}-{uuid.uuid4().hex[:8]}"
    (work / "audio").mkdir(parents=True)
    said, tracks, length = [], [], 0.0
    for (label, kind, src), muted in zip(sources, mutes):
        wav = work / "audio" / f"{len(tracks):02d}-{kind}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ar", "48000", "-c:a", "pcm_s24le", str(wav)], check=True, timeout=600)
        secs = _seconds(wav); length = max(length, secs)
        mute = 1 if muted else 0                        # HERESY 1475: the parts sound, the rest waits
        tracks.append([f"<TRACK", f"NAME {_q(label)}", f"PEAKCOL {_col(kind)}", f"MUTESOLO {mute} 0 0",
                       "<ITEM", "POSITION 0", f"LENGTH {secs:.6f}", f"NAME {_q(label)}",
                       "<SOURCE WAVE", f"FILE {_q('audio/' + wav.name)}", ">", ">", ">"])
    said.append(f"{len(sources)} audio track{'s' if len(sources) > 1 else ''}")
    if midi:
        div, voices = midi_tracks(midi)
        for v in voices:
            lines, end = _midi_chunk(div, v)
            secs = end / PPQ * 60.0 / bpm
            tracks.append(["<TRACK", f"NAME {_q('Score · ' + v['name'])}", f"PEAKCOL {_col('score')}", "MUTESOLO 0 0 0",
                           "<ITEM", "POSITION 0", f"LENGTH {secs:.6f}", f"NAME {_q('Score · ' + v['name'])}", "<SOURCE MIDI", *lines, ">", ">", ">"])
        said.append(f"the score: {len(voices)} voice{'s' if len(voices) != 1 else ''} as MIDI")
    else:
        said.append("no score (the take has none, or the page sent none)")
    markers = []
    if rows:
        items = []
        for r in rows:
            if r.get("start") is None or r.get("end") is None or r["end"] <= r["start"]:
                continue
            items += ["<ITEM", f"POSITION {r['start']:.3f}", f"LENGTH {r['end'] - r['start']:.3f}", "<NOTES", "|" + r["text"].replace("\n", " "), ">", ">"]
        tracks.append(["<TRACK", f"NAME {_q('Lyrics')}", f"PEAKCOL {_col('lyrics')}", "MUTESOLO 0 0 0", *items, ">"])
        for i, (sec, a, b) in enumerate(sections(req.get("lyrics") or "", rows), 1):
            markers += [f"MARKER {i} {a:.3f} {_q(sec)} 1", f"MARKER {i} {(b if b is not None else length):.3f} \"\" 1"]
        lyr = f"lyrics: {sum(1 for r in rows if r.get('start') is not None)} lines, {len(markers) // 2} sections"
        words = lyric_events(rows)                       # HERESY 2226: the same words as MIDI lyric events (FF 05), a word each
        if words:
            ev, last, qps = [], 0, bpm / 60.0 * PPQ       # one tempo over the whole project: seconds to ticks at it
            for t, w in words:
                tt = round(t * qps)
                ev += _text_event(tt - last, 0x05, w)
                last = tt
            end = max(last, round(length * qps))
            tracks.append(["<TRACK", f"NAME {_q('Lyrics (MIDI)')}", f"PEAKCOL {_col('lyrics')}", "MUTESOLO 0 0 0",
                           "<ITEM", "POSITION 0", f"LENGTH {end / qps:.6f}", f"NAME {_q('Lyrics (MIDI)')}",
                           "<SOURCE MIDI", "HASDATA 1 960 QN", *ev, f"E {end - last} b0 7b 00", ">", ">", ">"])
            lyr += f", {len(words)} lyric events as MIDI"
    else:
        lyr = "no lyrics on the timeline (the take is not timed yet: Refiner → Lyrics check)"
    chords, why = chord_symbols(req.get("abc"))           # HERESY 2227: the score's chords, a MIDI item a chord named by it
    if chords:
        items, spq = [], 60.0 / bpm                      # seconds a quarter note, as the score's MIDI tracks run
        for a, b, c in chords:
            ticks = max(1, round((b - a) * PPQ))
            items += ["<ITEM", f"POSITION {a * spq:.6f}", f"LENGTH {ticks / PPQ * spq:.6f}", f"NAME {_q(c)}",
                      "<SOURCE MIDI", "HASDATA 1 960 QN", *_text_event(0, 0x01, c), f"E {ticks} b0 7b 00", ">", ">"]
        tracks.append(["<TRACK", f"NAME {_q('Chords')}", f"PEAKCOL {_col('score')}", "MUTESOLO 0 0 0", *items, ">"])
    cs = chords_said(chords, why, req.get("abc"))
    said.append(lyr + ("; " + cs if cs else ""))        # one line still: the page shows the third and, with markers, the last
    mine, refused = user_marks(marks)                    # HERESY 2201: plain markers (flag 0), numbered apart from the regions as REAPER numbers them
    for i, (t, n) in enumerate(mine, 1):
        markers += _marker(i, t, n)
    if marks_said(mine, refused):
        said.append(marks_said(mine, refused))
    notes = [title, f"Made in Ruach Studio, {time.strftime('%Y-%m-%d %H:%M')}: {name}", "",
             "Style: " + (req.get("style") or "").replace("\n", " "),
             f"Seeds: music {req.get('lm_seed', '?')} · sound {req.get('seed', '?')}",
             f"Tempo {bpm:g} bpm, {num}/{den}, " + ("from the score (the song as sung may drift from it)" if re.search(r"^Q:", req.get("abc") or "", re.M)
                 else "from the style" if re.search(r"\d{2,3}(?:\.\d+)?\s*bpm", req.get("style") or "", re.I) else "not given: a placeholder")]
    # the tempo as REAPER itself saves it (read back from a project REAPER wrote, 02.10.2026): the TEMPO line and the
    # tempo envelope's first point, which carries the tempo and the meter ((den << 16) | num). REAPER applies the map
    # a few UI cycles after loading: a script that asks at once still hears the default 120.
    rpp = [f'<REAPER_PROJECT 0.1 "7.81/linux-x86_64" {int(time.time())} 0', "<NOTES 0 2", *("|" + n for n in notes), ">",
           f"TEMPO {bpm:g} {num} {den} 0",
           "<TEMPOENVEX", "ACT 1 -1", "VIS 1 0 1", "LANEHEIGHT 0 0", "ARM 0", "DEFSHAPE 1 -1 -1",
           f'PT 0.000000000000 {bpm:.10f} 1 {(den << 16) | num} 0 1 0 "" 0 9 0 AB', ">", *markers]
    for t in tracks:
        rpp += t
    rpp.append(">")
    text, depth = [], 0                                    # indent as REAPER does: two spaces a level
    for line in rpp:
        if line == ">":
            depth -= 1
        text.append("  " * depth + line)
        if line.startswith("<"):
            depth += 1
    (work / f"{safe}.RPP").write_text("\n".join(text) + "\n", encoding="utf-8")
    z = out_dir / f"{safe}.zip"
    part = z.with_suffix(".zip.part")
    with zipfile.ZipFile(part, "w", zipfile.ZIP_STORED) as zf:
        for f in sorted(work.rglob("*")):
            if f.is_file():
                zf.write(f, f"{safe}/{f.relative_to(work)}")
    part.replace(z)
    for f in sorted(work.rglob("*"), reverse=True):        # the build folder is ours, made a moment ago
        f.unlink() if f.is_file() else f.rmdir()
    work.rmdir()
    return z, {"tracks": [t[1][5:].strip('"\'`') for t in tracks], "bpm": round(bpm, 2), "meter": f"{num}/{den}", "said": said, "marks": len(mine),
                "lyric_events": len(words) if rows else 0, "chords": len(chords)}
