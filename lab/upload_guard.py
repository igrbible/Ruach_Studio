"""HERESY 2659 (Viktor 17.11.2026: «на все импорты wav, flac, ogg, mp3. Остальные форматы в бездну… поставь сторожа на загружаемые типы файлов…
парсер на заголовок часть тела для каждого загружаемого, во избежание загрузки вредоносного кода»): the one gate every sound brought into the
Studio passes, whatever room takes it (an import, a cover's source timed to its lyrics, a reference of one's own, the Narrator's recording and
voice). Four formats come in, and what the phones' voice recorders write (Viktor 17.11.2026: «добавляй айфоновские и андроидовские
диктофонные форматы»), told by their bytes, never by the file's name or the browser's word:
  WAV   RIFF/WAVE, its fmt PCM or IEEE float (or the extensible form of them), every chunk inside the size the file declares, nothing after it
  FLAC  fLaC, STREAMINFO first, every metadata block inside the file, a frame's sync after them
  OGG   OggS pages of one Vorbis or Opus stream (WhatsApp's and Telegram's .opus notes too), every page's CRC, numbered in turn, the last one
        marked last, nothing after it
  MP3   an ID3v2 tag or none, then MPEG Layer III frames: three in a row at the start, and every one after them to the end (an ID3v1, APE or
        Lyrics3 tag may close it)
  M4A   ISO base media (iPhone Voice Memos, Samsung's and Google's recorders; 3GP from the older Android ones): an ftyp of an audio brand
        first, every box inside the file and nothing after the last, one sound track of AAC, ALAC or AMR, no video track
  AAC   raw ADTS: an ID3v2 tag or none, then frames, three in a row at the start and every one after them to the end
  AMR   #!AMR or #!AMR-WB, then its frames, each of the size its type gives, to the end
Then the body: searched for what would hide a program, an archive or a script (a ZIP's directory, an ELF or a Windows program, a shebang, PHP,
a <script>, a PDF, RAR, 7z), and decoded whole once by ffmpeg, its demuxer forced to the format the bytes showed (nothing is ever read as a
playlist or another container) and its checksums checked, within DECODE_S seconds: refused when it does not decode cleanly, decodes outside the
bounds, or to another length than its header declares (and FLAC to another MD5). A refusal says what and why in plain words (the page's
catalogs translate them); nothing of a refused file stays on disk. An accepted one is written under the Studio's own name, its extension the
one its bytes showed. LIMIT_MB a file, unless a room keeps a smaller limit of its own (a voice's clip: 40 MB).
    python3 lab/upload_guard.py FILE…   each file's verdict, as the lab would give it
"""
import hashlib
import os
import struct
import subprocess
import sys
import threading
import zlib
from pathlib import Path

LIMIT_MB = 200
MIN_S, MAX_S = 0.1, 6 * 3600
RATES = (8000, 384000)
MAX_CH = 8
DECODE_S = 300
FFMPEG = os.environ.get("RUACH_FFMPEG") or "ffmpeg"
TMP = Path(__file__).resolve().parent.parent / "tmp" / "upload-guard"
EXT = {"wav": ".wav", "flac": ".flac", "ogg": ".ogg", "mp3": ".mp3", "m4a": ".m4a", "3gp": ".3gp", "aac": ".aac", "amr": ".amr"}
NAME = {"wav": "WAV", "flac": "FLAC", "ogg": "OGG", "mp3": "MP3", "m4a": "M4A", "3gp": "3GP", "aac": "AAC", "amr": "AMR"}
DEMUX = {"wav": "wav", "flac": "flac", "ogg": "ogg", "mp3": "mp3", "m4a": "mov", "3gp": "mov", "aac": "aac", "amr": "amr"}

# the words, English keys of the page's catalogs ({0}, {1}: the parts that change)
W_NONE = "Refused: only WAV, FLAC, OGG, MP3 and the phones' voice notes (M4A, AAC, 3GP, AMR) come in, and by its first bytes this file is {0}"
W_BAD = "Refused: it begins as {0}, but {1}"
W_BODY = "Refused: {0} does not decode cleanly: {1}"
W_SLOW = "Refused: {0} did not decode within {1} s"
W_BOUNDS = "Refused: {0} is outside the bounds (1 to 8 channels, 8 to 384 kHz, 0.1 s to 6 hours)"
W_LENGTH = "Refused: {0} declares {1} s of sound, but {2} s decode (cut off or padded)"
W_BIG = "Refused: the file is {0} MB, past the limit of {1} MB"
W_EMPTY = "Refused: the file came empty"
P_PROGRAM = "an archive or a program"
P_AUDIO = "another audio format (AIFF, WMA, MP1, MP2, MPA…)"
P_TEXT = "text or a script"
P_OTHER = "another kind of file (a picture, a document, a video…)"
R_HEADER = "its header is broken"
R_SHORT = "it ends before its sound does (cut off in transfer?)"
R_TAIL = "bytes that are not sound follow its end"
R_CODEC = "its sound is neither PCM nor float"
R_BOUNDS = "its rate, channels or bits are out of bounds"
R_STREAM = "its stream is neither Vorbis nor Opus"
R_FRAMES = "no three of its frames line up at its start"
R_TRACK = "its sound is neither AAC, ALAC nor AMR"
R_VIDEO = "it carries a video"
R_DAMAGED = "its body is damaged (a checksum or a frame does not match)"
R_HIDDEN = "a program, an archive or a script hides inside it"


class Refused(ValueError):
    """A file the gate refused; its words say what and why (the lab answers it as any ValueError: 400)."""


class Head:
    """What the header and the structure said: the kind, rate, channels, bits, the samples it declares (None: it does not), FLAC's MD5."""

    def __init__(self, kind, rate, channels, bits=16, declared=None, md5=None):
        self.kind, self.rate, self.channels, self.bits, self.declared, self.md5 = kind, rate, channels, bits, declared, md5
        self.ext, self.skip = EXT[kind], 0


def _bad(kind, why):
    return Refused(W_BAD.format(NAME[kind], why))


def _what(b):
    """What a file that is none of the four is, by its first bytes: the words of the refusal."""
    h = b[:512]
    if (h[:4] in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08", b"\x7fELF", b"\xca\xfe\xba\xbe", b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe",
                  b"\x28\xb5\x2f\xfd") or h[:2] == b"MZ" or h[:6] in (b"Rar!\x1a\x07", b"7z\xbc\xaf\x27\x1c", b"\xfd7zXZ\x00")
            or h[:3] in (b"\x1f\x8b\x08", b"BZh") or b[257:262] == b"ustar"):
        return P_PROGRAM
    if (h[:4] in (b"FORM", b"caff", b".snd", b"MThd", b"\x1aE\xdf\xa3", b"ADIF", b"RF64", b"BW64", b"\x30\x26\xb2\x75", b"wvpk", b"MAC ")
            or (len(h) > 1 and h[0] == 0xFF and h[1] & 0xE0 == 0xE0)):      # an MPEG sync that is not Layer III: MP1, MP2, AAC's ADTS
        return P_AUDIO
    try:
        t = h.decode("utf-8")
    except UnicodeDecodeError as e:                     # a letter of several bytes cut at the 512th is still text
        t = h[:e.start].decode("utf-8") if e.start >= len(h) - 3 else ""
    if t.strip() and all(c.isprintable() or c in "\r\n\t" for c in t):
        return P_TEXT
    return P_OTHER


# ---- WAV ----
GUID_TAIL = b"\x00\x00\x00\x00\x10\x00\x80\x00\x00\xaa\x00\x38\x9b\x71"   # KSDATAFORMAT_SUBTYPE_PCM / _IEEE_FLOAT after their first two bytes


def _wav(b):
    n = len(b)
    end = struct.unpack_from("<I", b, 4)[0] + 8
    if end > n + 1:                                     # one byte short is a last pad byte a writer left out
        raise _bad("wav", R_SHORT)
    if end < n - 1:
        raise _bad("wav", R_TAIL)
    end = min(end, n)
    pos, fmt, data = 12, None, None
    while pos + 8 <= end:
        cid, size = b[pos:pos + 4], struct.unpack_from("<I", b, pos + 4)[0]
        if not all(32 <= c < 127 for c in cid):
            raise _bad("wav", R_HEADER)
        if pos + 8 + size > end:
            raise _bad("wav", R_SHORT)
        if cid == b"fmt ":
            if fmt is not None or size < 16:
                raise _bad("wav", R_HEADER)
            tag, ch, rate, _, align, bits = struct.unpack_from("<HHIIHH", b, pos + 8)
            if tag == 0xFFFE:                           # WAVE_FORMAT_EXTENSIBLE: the format is its sub-format's
                if size < 40 or b[pos + 34:pos + 48] != GUID_TAIL:
                    raise _bad("wav", R_CODEC)
                tag = struct.unpack_from("<H", b, pos + 32)[0]
            fmt = (tag, ch, rate, align, bits)
        elif cid == b"data":
            if data is not None:
                raise _bad("wav", R_HEADER)
            data = size
        pos += 8 + size + (size & 1)
    if pos < end - 1 or fmt is None or data is None:
        raise _bad("wav", R_HEADER)
    tag, ch, rate, align, bits = fmt
    if tag not in (1, 3):
        raise _bad("wav", R_CODEC)
    if not (1 <= ch <= MAX_CH and RATES[0] <= rate <= RATES[1]) or bits not in ((8, 16, 24, 32) if tag == 1 else (32, 64)):
        raise _bad("wav", R_BOUNDS)
    if align != ch * bits // 8:
        raise _bad("wav", R_HEADER)
    return Head("wav", rate, ch, bits, declared=data // align)


# ---- FLAC ----
def _flac(b, p):
    n, pos, head = len(b), p + 4, None
    while True:
        if pos + 4 > n:
            raise _bad("flac", R_SHORT)
        t, size = b[pos], int.from_bytes(b[pos + 1:pos + 4], "big")
        typ = t & 0x7F
        if (head is None) != (typ == 0) or typ > 6:     # STREAMINFO first and once; no reserved block
            raise _bad("flac", R_HEADER)
        if pos + 4 + size > n:
            raise _bad("flac", R_SHORT)
        if typ == 0:
            if size != 34:
                raise _bad("flac", R_HEADER)
            s = b[pos + 4:pos + 38]
            minb, maxb = struct.unpack_from(">HH", s, 0)
            x = int.from_bytes(s[10:18], "big")
            rate, ch, bits, total = x >> 44, ((x >> 41) & 7) + 1, ((x >> 36) & 31) + 1, x & ((1 << 36) - 1)
            if minb < 16 or maxb < minb:
                raise _bad("flac", R_HEADER)
            if not RATES[0] <= rate <= RATES[1] or bits < 4:
                raise _bad("flac", R_BOUNDS)
            md5 = bytes(s[18:34])
            head = Head("flac", rate, ch, bits, declared=total or None, md5=md5 if any(md5) else None)
        pos += 4 + size
        if t & 0x80:
            break
    if pos + 2 > n:
        raise _bad("flac", R_SHORT)
    if b[pos] != 0xFF or b[pos + 1] & 0xFE != 0xF8:     # the first frame's sync
        raise _bad("flac", R_HEADER)
    return head


# ---- OGG ----
_REV = bytes(int(f"{i:08b}"[::-1], 2) for i in range(256))


def _ogg_crc(page):
    """Ogg's CRC-32 (0x04C11DB7, not reflected, from 0): zlib's reflected one over the bits turned round, turned back."""
    raw = zlib.crc32(page.translate(_REV), 0xFFFFFFFF) ^ 0xFFFFFFFF
    return int(f"{raw:032b}"[::-1], 2)


def _ogg(b):
    n, pos, serial, seq, head, eos, last = len(b), 0, None, -1, None, False, 0
    while pos < n:
        if eos:
            raise _bad("ogg", R_TAIL)
        if b[pos:pos + 4] != b"OggS":
            raise _bad("ogg", R_DAMAGED)
        if pos + 27 > n:
            raise _bad("ogg", R_SHORT)
        ver, flags = b[pos + 4], b[pos + 5]
        granule, ser, num, crc = struct.unpack_from("<qIII", b, pos + 6)
        nseg = b[pos + 26]
        if ver != 0 or flags > 7:
            raise _bad("ogg", R_HEADER)
        if pos + 27 + nseg > n:
            raise _bad("ogg", R_SHORT)
        end = pos + 27 + nseg + sum(b[pos + 27:pos + 27 + nseg])
        if end > n:
            raise _bad("ogg", R_SHORT)
        if _ogg_crc(b[pos:pos + 22] + b"\0\0\0\0" + b[pos + 26:end]) != crc:
            raise _bad("ogg", R_DAMAGED)
        if serial is None:
            body = b[pos + 27 + nseg:end]
            if not flags & 2:
                raise _bad("ogg", R_HEADER)
            if body[:7] == b"\x01vorbis" and len(body) >= 30:
                if struct.unpack_from("<I", body, 7)[0] != 0:
                    raise _bad("ogg", R_HEADER)
                head = Head("ogg", struct.unpack_from("<I", body, 12)[0], body[11])
            elif body[:8] == b"OpusHead" and len(body) >= 19:
                if body[8] & 0xF0:
                    raise _bad("ogg", R_HEADER)
                head = Head("ogg", 48000, body[9])
                head.skip = struct.unpack_from("<H", body, 10)[0]
            else:
                raise _bad("ogg", R_STREAM)
            if not (1 <= head.channels <= MAX_CH and RATES[0] <= head.rate <= RATES[1]):
                raise _bad("ogg", R_BOUNDS)
            serial = ser
        elif ser != serial or flags & 2:                # a second stream: one sound a file
            raise _bad("ogg", R_HEADER)
        if num != seq + 1:
            raise _bad("ogg", R_DAMAGED)
        seq = num
        if flags & 4:
            eos, last = True, granule
        pos = end
    if not eos:
        raise _bad("ogg", R_SHORT)
    head.declared = max(0, last - head.skip)
    return head


# ---- MP3 ----
_BR1 = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0)
_BR2 = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0)
_SR = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}


def _frame(b, p):
    """The MPEG Layer III frame at p: (length, version, rate, channels, crc) or None."""
    if p + 4 > len(b):
        return None
    h = int.from_bytes(b[p:p + 4], "big")
    ver, layer, br, sr, pad = (h >> 19) & 3, (h >> 17) & 3, (h >> 12) & 15, (h >> 10) & 3, (h >> 9) & 1
    if h >> 21 != 0x7FF or ver == 1 or layer != 1 or br in (0, 15) or sr == 3 or h & 3 == 2:
        return None
    rate = _SR[ver][sr]
    return ((144 if ver == 3 else 72) * (_BR1 if ver == 3 else _BR2)[br] * 1000 // rate + pad, ver, rate,
            1 if (h >> 6) & 3 == 3 else 2, not (h >> 16) & 1)


def _id3(b):
    """Where the sound begins after the ID3v2 tags (and the zeros some taggers leave after them); 0 when there is none."""
    p, n = 0, len(b)
    while b[p:p + 3] == b"ID3":
        if p + 10 > n or b[p + 3] not in (2, 3, 4) or any(c & 0x80 for c in b[p + 6:p + 10]):
            raise _bad("mp3", R_HEADER)
        size = 0
        for c in b[p + 6:p + 10]:
            size = size << 7 | c
        p += 10 + size + (10 if b[p + 3] == 4 and b[p + 5] & 0x10 else 0)
        if p > n:
            raise _bad("mp3", R_SHORT)
    q = p
    while p and q < n and q - p < 1 << 20 and b[q] == 0:
        q += 1
    return q


def _tags_end(b, p, kind):
    """Where the frames of an MP3 or an AAC end: before the tags that may close it (ID3v1, APEv2, Lyrics3 v2)."""
    end = len(b)
    for _ in range(4):
        if end - 128 >= p and b[end - 128:end - 125] == b"TAG":
            end -= 128
        elif end - 32 >= p and b[end - 32:end - 24] == b"APETAGEX":
            size, flags = struct.unpack_from("<I", b, end - 20)[0], struct.unpack_from("<I", b, end - 12)[0]
            end -= size + (32 if flags & 0x80000000 else 0)
            if size < 32 or end < p:
                raise _bad(kind, R_HEADER)
        elif end - 15 >= p and b[end - 9:end] == b"LYRICS200" and b[end - 15:end - 9].isdigit():
            end -= int(b[end - 15:end - 9]) + 15
            if end < p:
                raise _bad(kind, R_HEADER)
        else:
            break
    return end


def _mp3(b, p):
    f, q = [], p
    for _ in range(3):
        x = _frame(b, q)
        if not x or (f and x[1:3] != f[0][1:3]):
            raise _bad("mp3", R_FRAMES)
        f.append(x)
        q += x[0]
    end = _tags_end(b, p, "mp3")
    ver, rate, ch = f[0][1:4]
    frames, q = 0, p
    while q < end:
        x = _frame(b, q)
        if not x or x[1:3] != (ver, rate):
            raise _bad("mp3", R_TAIL)
        if q + x[0] > end:
            raise _bad("mp3", R_SHORT)
        q += x[0]
        frames += 1
    x = p + 4 + (2 if f[0][4] else 0) + ((32 if ch == 2 else 17) if ver == 3 else (17 if ch == 2 else 9))
    declared = None
    if b[x:x + 4] in (b"Xing", b"Info") and int.from_bytes(b[x + 4:x + 8], "big") & 1:   # the frames a Xing/Info header counts
        declared = int.from_bytes(b[x + 8:x + 12], "big") * (1152 if ver == 3 else 576)
    return Head("mp3", rate, ch, declared=declared)


# ---- AAC (ADTS) ----
_ADTS_RATES = (96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350)


def _adts(b, p):
    """The ADTS frame at p: (length, rate index, channel configuration, raw blocks) or None."""
    if p + 7 > len(b) or b[p] != 0xFF or b[p + 1] & 0xF6 != 0xF0:   # the sync, layer 00
        return None
    sfi, ch = (b[p + 2] >> 2) & 15, (b[p + 2] & 1) << 2 | b[p + 3] >> 6
    length = (b[p + 3] & 3) << 11 | b[p + 4] << 3 | b[p + 5] >> 5
    if sfi > 12 or not ch or length < (7 if b[p + 1] & 1 else 9):
        return None
    return length, sfi, ch, (b[p + 6] & 3) + 1


def _aac(b, p):
    f, q = [], p
    for _ in range(3):
        x = _adts(b, q)
        if not x or (f and x[1:3] != f[0][1:3]):
            raise _bad("aac", R_FRAMES)
        f.append(x)
        q += x[0]
    end, q, samples = _tags_end(b, p, "aac"), p, 0
    while q < end:
        x = _adts(b, q)
        if not x or x[1:3] != f[0][1:3]:
            raise _bad("aac", R_TAIL)
        if q + x[0] > end:
            raise _bad("aac", R_SHORT)
        q += x[0]
        samples += 1024 * x[3]
    rate, ch = _ADTS_RATES[f[0][1]], f[0][2]
    if rate < RATES[0]:
        raise _bad("aac", R_BOUNDS)
    return Head("aac", rate, 8 if ch == 7 else ch, declared=samples)


# ---- AMR ----
_AMR = {b"#!AMR\n": (8000, 160, (13, 14, 16, 18, 20, 21, 27, 32, 6, 0, 0, 0, 0, 0, 0, 1)),       # a frame's bytes by its type, 0: none
        b"#!AMR-WB\n": (16000, 320, (18, 24, 33, 37, 41, 47, 51, 59, 61, 6, 0, 0, 0, 0, 1, 1))}


def _amr(b):
    magic = b"#!AMR-WB\n" if b[:9] == b"#!AMR-WB\n" else b"#!AMR\n"
    rate, spf, sizes = _AMR[magic]
    p, n, frames = len(magic), len(b), 0
    while p < n:
        size = sizes[b[p] >> 3 & 15]
        if b[p] & 0x83 or not size:                     # its padding bits zero, a type that is one
            raise _bad("amr", R_FRAMES if frames < 3 else R_TAIL)
        if p + size > n:
            raise _bad("amr", R_SHORT)
        p, frames = p + size, frames + 1
    if frames < 3:
        raise _bad("amr", R_FRAMES)
    return Head("amr", rate, 1, declared=frames * spf)


# ---- M4A, 3GP (ISO base media) ----
_BRANDS = {b"M4A ", b"M4B ", b"mp41", b"mp42", b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"iso7", b"iso8", b"iso9", b"dash",
           b"MSNV", b"3gp4", b"3gp5", b"3gp6", b"3gp7", b"3gp8", b"3gp9", b"3g2a", b"3g2b", b"3g2c", b"3ge6", b"3ge7", b"3gg6"}
_AAC_OTI = (0x40, 0x66, 0x67, 0x68)                     # an esds's object type: MPEG-4 Audio, MPEG-2 AAC (Main, LC, SSR)


def _boxes(b, start, end, kind, top=False):
    """The boxes from start to end, [(type, body, end)], each inside its parent; Refused otherwise."""
    out, pos = [], start
    while pos < end:
        if pos + 8 > end:
            raise _bad(kind, R_TAIL if top else R_HEADER)
        size, typ = struct.unpack_from(">I4s", b, pos)
        head = 8
        if size == 1:
            if pos + 16 > end:
                raise _bad(kind, R_SHORT)
            size, head = struct.unpack_from(">Q", b, pos + 8)[0], 16
        elif size == 0:                                 # to the end of its parent
            size = end - pos
        if typ == b"\0\0\0\0" and not top:              # QuickTime's terminator inside a sound description
            pos += max(size, 8)
            continue
        if any(c < 32 or c == 127 for c in typ):
            raise _bad(kind, R_TAIL if top and out else R_HEADER)
        if size < head:
            raise _bad(kind, R_HEADER)
        if pos + size > end:
            raise _bad(kind, R_SHORT)
        out.append((typ, pos + head, pos + size))
        pos += size
    return out


def _child(b, box, typ, kind):
    found = [x for x in _boxes(b, box[1], box[2], kind) if x[0] == typ]
    if len(found) != 1:
        raise _bad(kind, R_HEADER)
    return found[0]


def _desc(b, p, end):
    """An MPEG-4 descriptor at p (inside an esds): its tag, body and end."""
    tag, p, size = b[p], p + 1, 0
    for _ in range(4):
        c, p = b[p], p + 1
        size = size << 7 | c & 0x7F
        if not c & 0x80:
            break
    if p + size > end:
        raise IndexError
    return tag, p, p + size


def _object_type(b, esds):
    """The objectTypeIndication of an esds's DecoderConfigDescriptor (MPEG-4 Audio is 0x40); -1 when it has none."""
    try:
        tag, s, e = _desc(b, esds[1] + 4, esds[2])
        if tag != 3:
            return -1
        flags, s = b[s + 2], s + 3
        s += (2 if flags & 0x80 else 0) + (1 + b[s + (2 if flags & 0x80 else 0)] if flags & 0x40 else 0)
        s += 2 if flags & 0x20 else 0
        tag, s, _ = _desc(b, s, e)
        return b[s] if tag == 4 else -1
    except IndexError:
        return -1


def _bmff(b):
    n = len(b)
    kind = "3gp" if b[8:11] in (b"3gp", b"3g2", b"3ge", b"3gg") else "m4a"
    top = _boxes(b, 0, n, kind, top=True)
    f1, f2 = top[0][1], top[0][2]
    if ({b[f1:f1 + 4]} | {b[i:i + 4] for i in range(f1 + 8, f2 - 3, 4)}).isdisjoint(_BRANDS):
        raise Refused(W_NONE.format(P_OTHER))           # a QuickTime film, a HEIC or AVIF picture, a camera's raw
    moov = [x for x in top if x[0] == b"moov"]
    if len(moov) != 1 or not any(x[0] in (b"mdat", b"moof") for x in top):
        raise _bad(kind, R_HEADER)
    sound = []
    for trak in _boxes(b, moov[0][1], moov[0][2], kind):
        if trak[0] != b"trak":
            continue
        mdia = _child(b, trak, b"mdia", kind)
        hdlr = _child(b, mdia, b"hdlr", kind)
        handler = b[hdlr[1] + 8:hdlr[1] + 12]
        if handler == b"vide":
            raise _bad(kind, R_VIDEO)
        if handler != b"soun":
            continue
        mdhd = _child(b, mdia, b"mdhd", kind)
        scale, dur = struct.unpack_from(">IQ" if b[mdhd[1]] == 1 else ">II", b, mdhd[1] + (20 if b[mdhd[1]] == 1 else 12))
        stsd = _child(b, _child(b, _child(b, mdia, b"minf", kind), b"stbl", kind), b"stsd", kind)
        entries = _boxes(b, stsd[1] + 8, stsd[2], kind)
        if len(entries) != 1:
            raise _bad(kind, R_HEADER)
        typ, s, e = entries[0]
        if s + 28 > e:
            raise _bad(kind, R_HEADER)
        ver = struct.unpack_from(">H", b, s + 8)[0]
        if ver == 2:                                    # QuickTime's sound description v2
            ch, rate, kids = struct.unpack_from(">I", b, s + 40)[0], int(struct.unpack_from(">d", b, s + 32)[0]), s + 64
        else:
            ch, rate, kids = struct.unpack_from(">H", b, s + 16)[0], struct.unpack_from(">I", b, s + 24)[0] >> 16, s + (44 if ver == 1 else 28)
        if kids > e:
            raise _bad(kind, R_HEADER)
        kids = _boxes(b, kids, e, kind)
        if typ == b"mp4a":
            esds = [x for x in kids if x[0] == b"esds"]
            for w in (x for x in kids if x[0] == b"wave" and not esds):
                esds = [x for x in _boxes(b, w[1], w[2], kind) if x[0] == b"esds"]
            if len(esds) != 1 or _object_type(b, esds[0]) not in _AAC_OTI:
                raise _bad(kind, R_TRACK)
        elif typ in (b"samr", b"sawb"):
            ch, rate = 1, 8000 if typ == b"samr" else 16000
        elif typ != b"alac":
            raise _bad(kind, R_TRACK)
        if not RATES[0] <= rate <= RATES[1]:            # ALAC past 65 kHz: its entry cannot hold the rate, the track's time scale does
            rate = scale
        sound.append((rate, ch, scale, dur))
    if len(sound) != 1:
        raise _bad(kind, R_HEADER)
    rate, ch, scale, dur = sound[0]
    if not (1 <= ch <= MAX_CH and RATES[0] <= rate <= RATES[1]) or not scale:
        raise _bad(kind, R_BOUNDS)
    return Head(kind, rate, ch, declared=None if dur in (0, 0xFFFFFFFF, (1 << 64) - 1) else dur * rate // scale)


# ---- what hides inside ----
_SIGNS = (b"PK\x03\x04\x14\x00", b"PK\x03\x04\x0a\x00", b"PK\x03\x04\x2d\x00", b"\x7fELF\x01\x01\x01", b"\x7fELF\x02\x01\x01",
          b"This program cannot be run in DOS mode", b"#!/bin/", b"#!/usr/bin/", b"<?php", b"<script", b"<SCRIPT", b"%PDF-1.",
          b"Rar!\x1a\x07", b"7z\xbc\xaf\x27\x1c")


def _hidden(b, kind):
    """A program, an archive or a script inside the sound (a polyglot): its signatures, long enough that sound never makes them by chance,
    and a ZIP's end record closing the file (what makes it a ZIP too)."""
    for s in _SIGNS:
        if b.find(s) >= 0:
            raise _bad(kind, R_HIDDEN)
    k = b.rfind(b"PK\x05\x06", max(0, len(b) - 65557))
    if k >= 0 and k + 22 + int.from_bytes(b[k + 20:k + 22], "little") == len(b):
        raise _bad(kind, R_HIDDEN)


def inspect(body, limit_mb=LIMIT_MB):
    """The header and the structure, before anything is written: a Head, or Refused with its words."""
    n = len(body) if body else 0
    if not n:
        raise Refused(W_EMPTY)
    if n > limit_mb * 2 ** 20:
        raise Refused(W_BIG.format(f"{n / 2 ** 20:.1f}", limit_mb))
    b = bytes(body)
    if b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        head = _wav(b)
    elif b[:4] == b"OggS":
        head = _ogg(b)
    elif b[4:8] == b"ftyp":
        head = _bmff(b)
    elif b[:6] == b"#!AMR\n" or b[:9] == b"#!AMR-WB\n":
        head = _amr(b)
    else:
        p = _id3(b)
        if b[p:p + 4] == b"fLaC":
            head = _flac(b, p)
        elif _frame(b, p):
            head = _mp3(b, p)
        elif _adts(b, p):
            head = _aac(b, p)
        elif p:
            raise _bad("mp3", R_FRAMES)
        else:
            raise Refused(W_NONE.format(_what(b)))
    if not 1 <= head.channels <= MAX_CH:
        raise _bad(head.kind, R_BOUNDS)
    if head.declared is not None and head.declared / head.rate > MAX_S:
        raise Refused(W_BOUNDS.format(NAME[head.kind]))
    _hidden(b, head.kind)
    return head


def _decode(path, head, limit_s=DECODE_S):
    """The whole body decoded once (the demuxer forced, checksums checked): {kind, ext, seconds, rate, channels}, or Refused."""
    name = NAME[head.kind]
    md5 = head.kind == "flac" and head.md5 is not None and head.bits in (16, 24, 32)
    width, ch = (head.bits // 8, head.channels) if md5 else (2, 1)
    fmt = {2: "s16le", 3: "s24le", 4: "s32le"}[width]
    cmd = [FFMPEG, "-nostdin", "-hide_banner", "-v", "error", "-xerror", "-err_detect", "crccheck", "-f", DEMUX[head.kind], "-i", str(path),
           "-map", "0:a:0", "-ac", str(ch), *([] if md5 else ["-ar", str(head.rate)]), "-c:a", "pcm_" + fmt, "-f", fmt, "pipe:1"]
    try:
        p = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError:
        import winx                                   # HERESY 2989: where ffmpeg comes from, in words (Windows names no program in its error)
        raise Refused(f"Refused: {name} cannot be checked here: {winx.no_program('ffmpeg')}")
    err, late, cap = [], [], (MAX_S + 1) * head.rate * width * ch
    reader = threading.Thread(target=lambda: err.append(p.stderr.read()), daemon=True)
    reader.start()
    timer = threading.Timer(limit_s, lambda: (late.append(1), p.kill()))
    timer.start()
    h, total = hashlib.md5() if md5 else None, 0
    try:
        while True:
            chunk = p.stdout.read(1 << 20)
            if not chunk:
                break
            total += len(chunk)
            if h:
                h.update(chunk)
            if total > cap:                             # more sound than the bounds hold (a bomb): stopped here
                p.kill()
                raise Refused(W_BOUNDS.format(name))
        rc = p.wait()
    finally:
        timer.cancel()
        if p.poll() is None:
            p.kill()
            p.wait()
        p.stdout.close()
    reader.join(10)
    p.stderr.close()
    if late:
        raise Refused(W_SLOW.format(name, limit_s))
    said = (err[0] if err else b"").decode("utf-8", "replace").strip().replace(str(path), name)   # the words name the file, never where it lies
    if rc != 0 or said:
        raise Refused(W_BODY.format(name, (said.splitlines() or [f"ffmpeg ended with code {rc}"])[-1].strip()[-200:]))
    secs = total // (width * ch) / head.rate
    if not MIN_S <= secs <= MAX_S:
        raise Refused(W_BOUNDS.format(name))
    if head.declared is not None:
        want = head.declared / head.rate
        if abs(want - secs) > max(0.25, 0.01 * want):
            raise Refused(W_LENGTH.format(name, f"{want:.2f}", f"{secs:.2f}"))
    if md5 and h.digest() != head.md5:
        raise _bad("flac", R_DAMAGED)
    return {"kind": head.kind, "ext": head.ext, "seconds": round(secs, 3), "rate": head.rate, "channels": head.channels}


def keep(body, folder, stem, head=None, limit_mb=LIMIT_MB):
    """The upload checked whole and written as folder/<stem><ext>, the Studio's own name with the extension its bytes showed: (the path,
    {kind, ext, seconds, rate, channels}); Refused, and nothing of it left on disk, otherwise."""
    head = head or inspect(body, limit_mb)
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    part = folder / f".{stem}.{os.urandom(4).hex()}.part"
    try:
        part.write_bytes(body)
        info = _decode(part, head)
        out = folder / (stem + head.ext)
        os.replace(part, out)
        return out, info
    finally:
        part.unlink(missing_ok=True)


def check(body, limit_mb=LIMIT_MB):
    """keep() for bytes that go on elsewhere (the door's way to the engine): checked in the Studio's tmp/, nothing kept; the info."""
    head = inspect(body, limit_mb)
    out, info = keep(body, TMP, "check-" + os.urandom(6).hex(), head)
    out.unlink(missing_ok=True)
    return info


if __name__ == "__main__":
    bad = 0
    for a in sys.argv[1:]:
        try:
            print(f"OK       {a}  {check(Path(a).read_bytes())}")
        except (Refused, OSError) as e:
            bad += 1
            print(f"REFUSED  {a}  {e}")
    sys.exit(1 if bad else 0)
