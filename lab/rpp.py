"""HERESY 1104: a take as a REAPER project (Viktor, 02.10.2026: the whole take handed to the user's DAW, where the
rest happens outside the studio). What the studio knows of a song and no plain stems export carries:

  · the mix, and every stem the take has (derived/stems-*/), each on its own track from 0; the mix muted when
    there are stems, so the stems sound and the mix waits as the reference
  · the score as MIDI, one track a voice, as the page writes it from the ABC (the score as written: the song
    as sung may drift from it), on the score's own tempo and meter
  · the lyrics on the timeline, a line an empty item with the line as its note, and the sections ([Verse],
    [Chorus], …) as regions, both when Whisper has already timed the take (the Refiner's lyrics check); a take
    not timed goes out without them, and the answer says so
  · the recipe in the project's notes: title, style, seeds, the take's name

Packed as derived/reaper/TITLE.zip in the take (the engine hands it over): TITLE/TITLE.RPP beside TITLE/audio/.
REAPER reads plain-text projects; the format here was checked by REAPER itself (7.81), not only written."""
import json, re, subprocess, time, uuid, zipfile
from pathlib import Path

PPQ = 960                                               # REAPER's ticks a quarter note in a MIDI item
COLORS = {"mix": (217, 157, 16), "vocals": (224, 93, 93), "instrumental": (93, 141, 224), "drums": (224, 168, 93),
          "bass": (125, 93, 224), "other": (93, 224, 154), "piano": (192, 192, 192), "guitar": (93, 208, 224),
          "score": (160, 120, 200), "lyrics": (150, 150, 150)}


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


def build(kit, outputs, name, midi=None, cache=None):
    """The take NAME as derived/reaper/TITLE.zip; returns its path and what went in."""
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
    for man in sorted(d.glob("derived/stems-*/manifest.json")):
        m = json.load(open(man, encoding="utf-8"))
        for f in m.get("files", []):
            p = d / f["path"]
            if p.is_file():
                sources.append((f["name"].capitalize() + ("" if m.get("mode") in (None, "vocals") else f" ({m['mode']})"), f["name"], p))
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
    for label, kind, src in sources:
        wav = work / "audio" / f"{len(tracks):02d}-{kind}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ar", "48000", "-c:a", "pcm_s24le", str(wav)], check=True, timeout=600)
        secs = _seconds(wav); length = max(length, secs)
        mute = 1 if kind == "mix" and len(sources) > 1 else 0
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
        said.append(f"lyrics: {sum(1 for r in rows if r.get('start') is not None)} lines, {len(markers) // 2} sections")
    else:
        said.append("no lyrics on the timeline (the take is not timed yet: Refiner → Lyrics check)")
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
    return z, {"tracks": [t[1][5:].strip('"\'`') for t in tracks], "bpm": round(bpm, 2), "meter": f"{num}/{den}", "said": said}
