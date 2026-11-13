"""HERESY 2394 (Viktor 11.11.2026: the user may choose their own installed system font, «Local Font Access API, the file uploaded for the server render»):
the Videographer's own fonts. A font the page sends (from the system's fonts by Chrome's Local Font Access, or a file picked elsewhere) is kept in
user/fonts/ under its content's hash, with its family and style as the font itself names them; the clip's titles and karaoke are written in it by
libass, which finds it in the folder handed to ffmpeg's subtitles filter (fontsdir). TrueType and OpenType only: what libass and Pillow both read."""
import hashlib
import io
import json
import re
import shutil
import time
from pathlib import Path

MOST = 40 * 1024 * 1024                          # a font of 40 MB is a CJK family's whole; nothing a title needs is larger
ID_RE = re.compile(r"[0-9a-f]{16}\.(ttf|otf)")
STUDIO = "DejaVu Sans"                           # the Studio's own: Latin, Cyrillic, Greek and Hebrew


def _dir(kit):
    d = Path(kit) / "user" / "fonts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _kind(data):
    head = bytes(data[:4])
    if head in (b"\x00\x01\x00\x00", b"true"):
        return "ttf"
    if head == b"OTTO":
        return "otf"
    if head == b"ttcf":
        raise ValueError("a font collection (.ttc): send one of its faces as a .ttf or .otf")
    if head in (b"wOFF", b"wOF2"):
        raise ValueError("a web font (WOFF): send the font as a .ttf or .otf")
    raise ValueError("not a TrueType or OpenType font")


def names_of(data):
    """(family, style, the name libass matches) as the font names itself. libass looks a style's Fontname up among the legacy family names (name 1),
    the full names (4) and the PostScript name (6), never the typographic family (16) that FreeType and the font menus show: a Montserrat Thin's
    family reads «Montserrat», and an ASS asking for «Montserrat» fell back to DejaVu Sans (measured 12.11.2026). So the ASS names its name 1."""
    from PIL import ImageFont
    try:
        f = ImageFont.truetype(io.BytesIO(bytes(data)), 24)
    except OSError as e:
        raise ValueError(f"the font could not be read: {e}") from e
    family, style = f.getname()
    if not family:
        raise ValueError("the font names no family")
    ass = str(family)
    try:
        from fontTools.ttLib import TTFont
        names = {}
        for r in TTFont(io.BytesIO(bytes(data)), lazy=True)["name"].names:
            if r.nameID in (1, 4) and r.nameID not in names:
                try:
                    names[r.nameID] = r.toUnicode().strip()
                except UnicodeDecodeError:
                    continue
        ass = names.get(1) or names.get(4) or ass
    except Exception:                                  # noqa: BLE001  no fontTools, or a table it cannot read: FreeType's family, as before
        pass
    return str(family), str(style or ""), ass


def save(kit, data, hint=""):
    """The font's bytes kept once by their hash: {id, family, style, bytes, hint}; the same font sent again is the same id."""
    data = bytes(data or b"")
    if not data:
        raise ValueError("no font was sent")
    if len(data) > MOST:
        raise ValueError("a font is at most 40 MB")
    ext = _kind(data)
    family, style, ass = names_of(data)
    fid = hashlib.sha256(data).hexdigest()[:16] + "." + ext
    d = _dir(kit)
    f = d / fid
    if not f.is_file():
        part = d / (fid + ".part")
        part.write_bytes(data)
        part.replace(f)
    info = {"id": fid, "family": family, "style": style, "ass": ass, "bytes": len(data), "hint": " ".join(str(hint or "").split())[:120], "added": round(time.time(), 1)}
    meta = f.with_suffix(f.suffix + ".json")
    if not meta.is_file():
        part = meta.with_suffix(".part")
        part.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        part.replace(meta)
    return info


def path(kit, fid):
    if not ID_RE.fullmatch(fid or ""):
        raise ValueError("no such font")
    f = _dir(kit) / fid
    if not f.is_file():
        raise FileNotFoundError("no such font: it was taken away")
    return f


def info(kit, fid):
    f = path(kit, fid)
    try:
        return json.loads(f.with_suffix(f.suffix + ".json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        family, style, ass = names_of(f.read_bytes())
        return {"id": fid, "family": family, "style": style, "ass": ass, "bytes": f.stat().st_size, "hint": "", "added": f.stat().st_mtime}


def listing(kit):
    out = []
    for f in sorted(_dir(kit).glob("*.*")):
        if ID_RE.fullmatch(f.name):
            try:
                out.append(info(kit, f.name))
            except (OSError, ValueError):
                continue
    out.sort(key=lambda x: (x.get("family", "").lower(), x.get("style", "").lower()))
    return {"fonts": out, "studio": STUDIO}


def family(kit, fid):
    """The name an ASS style gives for this font id (its legacy family, which libass matches); the Studio's own for none."""
    if not fid:
        return STUDIO
    i = info(kit, fid)
    return i.get("ass") or i["family"]


def lay(kit, ids, into):
    """The fonts of these ids copied into the folder libass is handed (fontsdir); the families, by id. A font gone raises: never a silent DejaVu."""
    into = Path(into)
    into.mkdir(parents=True, exist_ok=True)
    out = {}
    for fid in {i for i in ids if i}:
        shutil.copyfile(path(kit, fid), into / fid)
        out[fid] = family(kit, fid)
    return out
