"""HERESY 1074: a take as a DAWproject. DAWproject is the open project format of Bitwig and PreSonus;
Bitwig, Studio One and Cubase import it. (It was made for openDAW beside the studio; openDAW left with
HERESY 1102, the format stays for the DAWs that read it.)

A track for the mix and one for every stem the take has (derived/stems-*/), each a clip from 0 over the
whole song. The tempo and the meter come from the score (Q:, M:) or "NN bpm" in the style, else 120 4/4;
the warp is linear (beats ↔ seconds at that tempo), so nothing is stretched. Audio goes in as 24-bit WAV.
The layout follows a Bitwig export, as openDAW's tests had it.

HERESY 1134: as full as the REAPER project (1104): the score as note tracks, one a voice (the page's MIDI of the
ABC, as REAPER gets it), the sections ([Verse], [Chorus] …) as markers once Whisper has timed the take, and the
lyrics with the style in the metadata's comment (DAWproject has no text on the timeline). Waveform 14 imports it
(File > Import Other > Import a DAWproject file), as Bitwig, Studio One and Cubase do. The schema followed is the
format's own Project.xsd: Notes inside a Clip, Markers after the Lanes in the Arrangement."""
import json, re, subprocess, time, uuid, zipfile
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

COLORS = {"mix": "#d99d10", "vocals": "#e05d5d", "instrumental": "#5d8de0", "drums": "#e0a85d", "bass": "#7d5de0",
          "other": "#5de09a", "piano": "#c0c0c0", "guitar": "#5dd0e0"}


def tempo_meter(req):
    """(bpm, numerator, denominator): the score's Q: and M:, else a bpm in the style, else 120 4/4."""
    abc, bpm, num, den = req.get("abc") or "", None, 4, 4
    m = re.search(r"^Q:\s*(?:(\d+)/(\d+)\s*=\s*)?(\d+(?:\.\d+)?)", abc, re.M)
    if m:
        q = float(m.group(3))
        if m.group(1):                                   # Q:1/8=160 is 80 quarter notes a minute
            q *= float(m.group(1)) / float(m.group(2)) * 4
        bpm = q
    m = re.search(r"^M:\s*(\d+)\s*/\s*(\d+)", abc, re.M)
    if m:
        num, den = int(m.group(1)), int(m.group(2))
    if bpm is None:
        m = re.search(r"(\d{2,3}(?:\.\d+)?)\s*bpm", req.get("style") or "", re.I)
        bpm = float(m.group(1)) if m else 120.0
    return max(20.0, min(666.0, bpm)), num, den


def _seconds(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    return float(out or 0)


def build(kit, outputs, name, midi=None, cache=None):
    """The take NAME as derived/dawproject/TITLE.dawproject inside the take (one, made again on each ask):
    the engine serves derived/ files itself (/library/file), whole and seekable, where the lab's proxy
    fails on files this big. Returns its path and what went in."""
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
    rows = None                                          # the lyric lines on Whisper's times, as the REAPER project reads them
    tpath = Path(cache) / f"{name}.timing.json" if cache else None
    if tpath and tpath.is_file() and tpath.stat().st_mtime >= sources[0][2].stat().st_mtime:
        t = json.load(open(tpath, encoding="utf-8"))
        rows = t.get("rows") if isinstance(t, dict) else t
    out_dir = d / "derived" / "dawproject"
    out_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w.-]+", "_", title, flags=re.UNICODE).strip("_") or name
    work = out_dir / f".{safe}-{uuid.uuid4().hex[:8]}"
    work.mkdir()
    ids = iter(range(10 ** 6))
    nid = lambda: f"id{next(ids)}"
    tracks, lanes, files = [], [], []
    master_track, master_ch = nid(), nid()
    for label, kind, src in sources:
        wav = work / f"{len(files):02d}-{kind}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ar", "48000", "-c:a", "pcm_s24le", str(wav)], check=True, timeout=600)
        secs = _seconds(wav)
        beats = secs * bpm / 60.0
        files.append(wav)
        tid, cid = nid(), nid()
        tracks.append(
            f'        <Track contentType="audio" loaded="true" id="{tid}" name={quoteattr(label)} color="{COLORS.get(kind, "#a0a0a0")}" comment="">\n'
            f'            <Channel audioChannels="2" destination="{master_ch}" role="regular" solo="false" id="{cid}">\n'
            f'                <Mute value="{"true" if kind == "mix" and len(sources) > 1 else "false"}" id="{nid()}" name="Mute"/>\n'   # the stems sound; the mix waits, muted
            f'                <Pan max="1.000000" min="0.000000" unit="normalized" value="0.500000" id="{nid()}" name="Pan"/>\n'
            f'                <Volume max="2.000000" min="0.000000" unit="linear" value="1.000000" id="{nid()}" name="Volume"/>\n'
            f'            </Channel>\n        </Track>\n')
        lanes.append(
            f'            <Lanes track="{tid}" id="{nid()}">\n                <Clips id="{nid()}">\n'
            f'                    <Clip time="0.0" duration="{beats:.6f}" playStart="0.0" loopStart="0.0" loopEnd="{beats:.6f}" fadeTimeUnit="beats" fadeInTime="0.0" fadeOutTime="0.0" enable="true" name={quoteattr(label)}>\n'
            f'                        <Clips id="{nid()}">\n'
            f'                            <Clip time="0.0" duration="{beats:.6f}" contentTimeUnit="beats" playStart="0.0" fadeTimeUnit="beats" fadeInTime="0.0" fadeOutTime="0.0">\n'
            f'                                <Warps contentTimeUnit="seconds" timeUnit="beats" id="{nid()}">\n'
            f'                                    <Audio algorithm="stretch" channels="2" sampleRate="48000" duration="{secs:.6f}" id="{nid()}">\n'
            f'                                        <File path="audio/{wav.name}"/>\n'
            f'                                    </Audio>\n'
            f'                                    <Warp time="0.0" contentTime="0.0"/>\n'
            f'                                    <Warp time="{beats:.6f}" contentTime="{secs:.6f}"/>\n'
            f'                                </Warps>\n                            </Clip>\n                        </Clips>\n'
            f'                    </Clip>\n                </Clips>\n            </Lanes>\n')
    said = [f"{len(sources)} audio track{'s' if len(sources) > 1 else ''}"]
    if midi:                                             # HERESY 1134: the score, a note track a voice
        from rpp import midi_tracks
        div, voices = midi_tracks(midi)
        for v in voices:
            notes, on = [], {}
            for t, ev in v["events"]:
                kind, ch = ev[0] >> 4, ev[0] & 0x0F
                if kind == 9 and len(ev) > 2 and ev[2] > 0:
                    on.setdefault((ch, ev[1]), []).append((t, ev[2]))
                elif kind in (8, 9) and len(ev) > 2 and on.get((ch, ev[1])):
                    t0, vel = on[(ch, ev[1])].pop(0)
                    if t > t0:
                        notes.append((t0 / div, (t - t0) / div, ch, ev[1], vel / 127.0))
            if not notes:
                continue
            notes.sort()
            end = max(n[0] + n[1] for n in notes)
            tid, cid = nid(), nid()
            label = "Score · " + v["name"]
            tracks.append(
                f'        <Track contentType="notes" loaded="true" id="{tid}" name={quoteattr(label)} color="#a078c8" comment="">\n'
                f'            <Channel audioChannels="2" destination="{master_ch}" role="regular" solo="false" id="{cid}">\n'
                f'                <Mute value="false" id="{nid()}" name="Mute"/>\n'
                f'                <Pan max="1.000000" min="0.000000" unit="normalized" value="0.500000" id="{nid()}" name="Pan"/>\n'
                f'                <Volume max="2.000000" min="0.000000" unit="linear" value="1.000000" id="{nid()}" name="Volume"/>\n'
                f'            </Channel>\n        </Track>\n')
            lanes.append(
                f'            <Lanes track="{tid}" id="{nid()}">\n                <Clips id="{nid()}">\n'
                f'                    <Clip time="0.0" duration="{end:.6f}" playStart="0.0" enable="true" name={quoteattr(label)}>\n'
                f'                        <Notes id="{nid()}">\n'
                + "".join(f'                            <Note time="{a:.6f}" duration="{b:.6f}" channel="{c}" key="{k}" vel="{v_:.6f}" rel="{v_:.6f}"/>\n'
                          for a, b, c, k, v_ in notes) +
                f'                        </Notes>\n                    </Clip>\n                </Clips>\n            </Lanes>\n')
        said.append(f"the score: {len(voices)} voice{'s' if len(voices) != 1 else ''} as notes")
    else:
        said.append("no score (the take has none, or the page sent none)")
    markers = ""
    if rows:                                             # the sections, where Whisper heard them begin
        from rpp import sections
        secs_ = sections(req.get("lyrics") or "", rows)
        if secs_:
            markers = (f'        <Markers id="{nid()}">\n' +
                       "".join(f'            <Marker time="{a * bpm / 60.0:.6f}" name={quoteattr(sec)} color="#9e9e9e"/>\n' for sec, a, b in secs_) +
                       '        </Markers>\n')
        said.append(f"sections: {len(secs_)} markers")
    else:
        said.append("no sections (the take is not timed yet: Refiner → Lyrics check)")
    project = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project version="1.0">\n'
        '    <Application name="Ruach Studio" version="2.0"/>\n    <Transport>\n'
        f'        <Tempo max="666.000000" min="20.000000" unit="bpm" value="{bpm:.6f}" id="{nid()}" name="Tempo"/>\n'
        f'        <TimeSignature denominator="{den}" numerator="{num}" id="{nid()}"/>\n    </Transport>\n    <Structure>\n'
        + "".join(tracks) +
        f'        <Track contentType="audio notes" loaded="true" id="{master_track}" name="Master" comment="">\n'
        f'            <Channel audioChannels="2" role="master" solo="false" id="{master_ch}">\n'
        f'                <Mute value="false" id="{nid()}" name="Mute"/>\n'
        f'                <Pan max="1.000000" min="0.000000" unit="normalized" value="0.500000" id="{nid()}" name="Pan"/>\n'
        f'                <Volume max="2.000000" min="0.000000" unit="linear" value="1.000000" id="{nid()}" name="Volume"/>\n'
        f'            </Channel>\n        </Track>\n    </Structure>\n'
        f'    <Arrangement id="{nid()}">\n        <Lanes timeUnit="beats" id="{nid()}">\n' + "".join(lanes) +
        f'            <Lanes track="{master_track}" id="{nid()}">\n                <Clips id="{nid()}"/>\n            </Lanes>\n'
        '        </Lanes>\n' + markers + '    </Arrangement>\n</Project>\n')
    metadata = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<MetaData>\n'
                f'    <Title>{escape(title)}</Title>\n    <Comment>{escape(("Style: " + (req.get("style") or "")[:2000] + ("\n\nLyrics:\n" + req["lyrics"][:20000] if (req.get("lyrics") or "").strip() else "")))}</Comment>\n'
                f'    <Year>{time.strftime("%Y")}</Year>\n    <Website>Ruach Studio</Website>\n</MetaData>\n')
    for old in out_dir.glob("*.dawproject"):            # one at a time: the last one made
        old.unlink()
    target = out_dir / f"{safe}.dawproject"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as z:        # WAV does not compress: stored is fast
        z.writestr("project.xml", project)
        z.writestr("metadata.xml", metadata)
        for f in files:
            z.write(f, "audio/" + f.name)
    for f in files:
        f.unlink()
    work.rmdir()
    return target, {"tracks": [s[0] for s in sources], "bpm": round(bpm, 2), "meter": f"{num}/{den}", "said": said}
