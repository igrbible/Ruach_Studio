"""HERESY 1635 (RIVALS 8, Viktor 20.10.2026: «ОДОБРЯЮ для 2.0.0»): a download carries its song: the title, the lyrics, the style, the cover, the
studio that made it, so a phone's player shows it whole. The engine's FLAC has TITLE and LYRICS (build/src/flac-enc.h) and no picture; its MP3 and
WAV had nothing (only C2PA, signed after these, HERESY 1489). Here, on the lab's way out (c2pa_file), before the signature:
  · FLAC: Vorbis comments (TITLE, LYRICS, DESCRIPTION = the style, ARTIST when an author is set, DATE, ENCODER) and the cover as a PICTURE block;
  · MP3: ID3v2.4 (TIT2, TPE1, USLT, COMM, TDRC, TSSE, APIC front cover);
  · WAV: an ID3 chunk with the same (players that read WAV tags read that one).
The audio frames are not touched; a file that cannot be read as its format goes out as it came (said)."""
import io, json, time
from pathlib import Path


def song_of(d):
    """The take's words for its tags: title, lyrics, style, date, the cover's bytes and type."""
    d = Path(d)
    meta, req = {}, {}
    for name, into in (("meta.json", meta), ("request.json", req)):
        try:
            into.update(json.load(open(d / name, encoding="utf-8")))
        except (OSError, ValueError):
            pass
    cover = None
    for name, mime in (("artwork.jpg", "image/jpeg"), ("artwork.png", "image/png"), ("artwork.webp", "image/webp")):
        if (d / name).is_file():
            cover = ((d / name).read_bytes(), mime)
            break
    created = meta.get("created") or (d.stat().st_mtime if d.is_dir() else time.time())
    return {"title": str(meta.get("title") or req.get("title") or d.name), "lyrics": str(req.get("lyrics") or ""),
            "style": str(req.get("style") or ""), "date": time.strftime("%Y-%m-%d", time.localtime(created)), "cover": cover}


def tag(data, fmt, song, author="", software="Ruach Studio"):
    """(bytes, said): the file with its tags, or as it came and why not."""
    try:
        if fmt == "flac":
            return _flac(data, song, author, software), "tagged"
        if fmt == "mp3":
            return _id3_file(data, song, author, software, "mp3"), "tagged"
        if fmt == "wav":
            return _id3_file(data, song, author, software, "wav"), "tagged"
    except Exception as e:                                # never the download for its tags
        return data, f"untagged: {type(e).__name__}: {e}"
    return data, "untagged: no tags for ." + fmt


def _flac(data, song, author, software):
    from mutagen.flac import FLAC, Picture
    buf = io.BytesIO(data)
    f = FLAC(buf)
    f["TITLE"] = song["title"]
    if song["lyrics"]:
        f["LYRICS"] = song["lyrics"]
    if song["style"]:
        f["DESCRIPTION"] = song["style"]
    if author:
        f["ARTIST"] = author
    f["DATE"] = song["date"]
    f["ENCODER"] = software
    if song["cover"]:
        pic = Picture()
        pic.type, pic.mime, pic.desc, pic.data = 3, song["cover"][1], "Cover", song["cover"][0]
        f.clear_pictures()
        f.add_picture(pic)
    buf.seek(0)
    f.save(buf)
    return buf.getvalue()


def _id3_frames(song, author, software):
    from mutagen.id3 import APIC, COMM, TDRC, TIT2, TPE1, TSSE, USLT
    out = [TIT2(encoding=3, text=song["title"]), TDRC(encoding=3, text=song["date"]), TSSE(encoding=3, text=software)]
    if author:
        out.append(TPE1(encoding=3, text=author))
    if song["lyrics"]:
        out.append(USLT(encoding=3, lang="xxx", desc="", text=song["lyrics"]))
    if song["style"]:
        out.append(COMM(encoding=3, lang="xxx", desc="Style", text=song["style"]))
    if song["cover"]:
        out.append(APIC(encoding=3, mime=song["cover"][1], type=3, desc="Cover", data=song["cover"][0]))
    return out


def _id3_file(data, song, author, software, kind):
    buf = io.BytesIO(data)
    if kind == "mp3":
        from mutagen.mp3 import MP3
        f = MP3(buf)
    else:
        from mutagen.wave import WAVE
        f = WAVE(buf)
    if f.tags is None:
        f.add_tags()
    if song["lyrics"]:
        f.tags.delall("USLT")                              # the lyrics frame the engine wrote (eng) and ours are one song: one frame
    for frame in _id3_frames(song, author, software):
        f.tags.add(frame)
    buf.seek(0)
    f.save(buf, v2_version=4) if kind == "mp3" else f.save(buf)
    return buf.getvalue()
