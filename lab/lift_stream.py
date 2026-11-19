"""HERESY 2837 (Viktor 18.11.2026: «По пересчётам дубля пусть Лаба считает, но в реал тайм. Если будем сохранять на диск, в два раза больше занимаемого места… Предлагаю считать на лету. Если файл отдаётся flac/ogg стримом — лаба, если полностью, клиент в браузере»): the player's lifted take streamed, made on the fly from the take's own audio.wav and never kept: each sample times the gain, rounded to the nearest step of 24 bits, and whatever passes full scale cut flat at ±8388607, exactly as the page's own copy is made (heresy-rsaudio.js, 2835) and as the old Peak clip cut before 2007. Nothing else touches it.

A 24-bit WAV at the take's own rate, so its length is known before a byte is made and any Range of it is computed from the same frames of the source: the element seeks in it as in any file, and nothing is written to disk. FLAC or Ogg made on the fly cannot say their length or where a second lies before they are made, so the element could not seek in them; the 24-bit WAV is about 28 % larger than these takes' FLAC (a 6-minute take: 105 MB against 82). One answer carries at most CAP bytes (a 206 of its piece): the browser asks on from there as its buffer drains, so a seek costs one piece and the engine's relay never holds more than one.

With Opus chosen for the player (1851, a slow line: his mobile link carries about 2 Mbit/s, less than a 24-bit WAV's 2.3), the lifted take is raised and cut the same way and then encoded as listen.opus is (libopus 128 kbit/s), in memory only: the last OPUS_KEEP of them kept in RAM, none on disk, served with Range from there. Like the take's own Opus it is lossy: what it decodes to is near clamp(file × gain), not equal to it."""
import collections
import math
import os
import struct
import subprocess
import threading

import numpy as np

FS = 8388607                                  # full scale in 24 bits, the old engine's clamp(±1) × 8388607
CAP = 8 << 20                                  # bytes in one answer at most: about 29 s of a 48 kHz stereo take
GAIN_MAX = 16.0                                # +24 dB: past any +dB (6 at most) and the volume past 100 % (1.5) together
OPUS_KEEP = 3                                  # lifted Opus copies kept in RAM (about 6 MB each for six minutes)
_OPUS = collections.OrderedDict()
_OPUS_LOCK = threading.Lock()                   # one encode at a time; the kept ones read under it too
SUPPORTED = ((1, 16), (1, 24), (1, 32), (3, 32))


def layout(path):
    """(format, channels, rate, bits, data offset, data bytes) of a WAV; ValueError for anything else"""
    with open(path, "rb") as f:
        head = f.read(12)
        if len(head) < 12 or head[:4] != b"RIFF" or head[8:12] != b"WAVE":
            raise ValueError("the take's sound is not a WAV")
        fmt = None
        while True:
            ck = f.read(8)
            if len(ck) < 8:
                break
            tag, size = ck[:4], struct.unpack("<I", ck[4:])[0]
            if tag == b"fmt ":
                body = f.read(size + (size & 1))
                code, ch, rate, _, _, bits = struct.unpack("<HHIIHH", body[:16])
                if code == 0xFFFE and len(body) >= 26:          # WAVE_FORMAT_EXTENSIBLE: the sub-format's code
                    code = struct.unpack("<H", body[24:26])[0]
                fmt = (code, ch, rate, bits)
                continue
            if tag == b"data":
                if not fmt:
                    raise ValueError("a WAV with its data before its format")
                start = f.tell()
                size = min(size, os.fstat(f.fileno()).st_size - start)
                return fmt + (start, size)
            f.seek(size + (size & 1), 1)
    raise ValueError("a WAV without its data")


def header(ch, rate, frames):
    data = frames * ch * 3
    return b"RIFF" + struct.pack("<I", 36 + data) + b"WAVE" + b"fmt " + struct.pack("<IHHIIHH", 16, 1, ch, rate, rate * ch * 3, ch * 3, 24) + \
        b"data" + struct.pack("<I", data)


def samples(raw, code, bits):
    """the source's samples as the browser's decoder hands them on (Float32), widened to doubles"""
    if code == 1 and bits == 24:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        k = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16))
        k = np.where(k >= 1 << 23, k - (1 << 24), k)
        x = k / 8388608.0
    elif code == 1 and bits == 16:
        x = np.frombuffer(raw, "<i2") / 32768.0
    elif code == 1 and bits == 32:
        x = np.frombuffer(raw, "<i4") / 2147483648.0
    elif code == 3 and bits == 32:
        x = np.frombuffer(raw, "<f4").astype(np.float64)
    else:
        raise ValueError(f"a WAV of {bits} bits, format {code}, is not lifted on the fly")
    return x.astype(np.float32).astype(np.float64)


def lifted(x, g):
    """x × g in steps of 24 bits, the nearest step (half up, as JavaScript's Math.round); past ±8388607 cut flat there"""
    q = np.floor(x * (g * 8388608.0) + 0.5)
    np.clip(q, -FS, FS, out=q)
    return q.astype("<i4").view(np.uint8).reshape(-1, 4)[:, :3].tobytes()


def opus(path, g):
    """the take raised by g and cut flat at full scale, encoded as listen.opus is, in RAM (the last OPUS_KEEP kept)"""
    st = os.stat(path)
    key = (str(path), st.st_mtime_ns, st.st_size, g)
    with _OPUS_LOCK:
        if key in _OPUS:
            _OPUS.move_to_end(key)
            return _OPUS[key]
        code, ch, rate, bits, at, size = layout(path)
        if (code, bits) not in SUPPORTED:
            raise ValueError(f"a WAV of {bits} bits, format {code}, is not lifted on the fly")
        fb_in = ch * bits // 8
        frames = size // fb_in
        pcm = bytearray()
        with open(path, "rb") as f:
            f.seek(at)
            for f0 in range(0, frames, 1 << 20):
                raw = f.read(min(1 << 20, frames - f0) * fb_in)
                pcm += lifted(samples(raw[:len(raw) - len(raw) % fb_in], code, bits), g)
        p = subprocess.run(["nice", "-n", "10", "ffmpeg", "-v", "error", "-f", "s24le", "-ar", str(rate), "-ac", str(ch), "-i", "-",
                            "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-application", "audio", "-f", "ogg", "-"],
                           input=bytes(pcm), capture_output=True, timeout=600)
        if p.returncode != 0 or not p.stdout:
            raise RuntimeError("ffmpeg: " + (p.stderr.decode(errors="replace").strip()[-300:] or "no output"))
        _OPUS[key] = p.stdout
        while len(_OPUS) > OPUS_KEEP:
            _OPUS.popitem(last=False)
        return p.stdout


def answer(h, total, span, ctype, g):
    """the head of an answer of a resource of total bytes; (start, end) to send, or None when nothing follows (416, HEAD)"""
    part = span(h.headers.get("Range", ""), total)
    if part == "unsatisfiable":
        h.send_response(416)
        h.send_header("Content-Range", f"bytes */{total}")
        h.send_header("Content-Length", "0")
        h.end_headers()
        return None
    start, end = part if part else (0, total - 1)
    end = min(end, start + CAP - 1)
    capped = not part and end < total - 1
    h.send_response(206 if part or capped else 200)
    h.send_header("Content-Type", ctype)
    h.send_header("Accept-Ranges", "bytes")
    if part or capped:
        h.send_header("Content-Range", f"bytes {start}-{end}/{total}")
    h.send_header("Content-Length", str(end - start + 1))
    h.send_header("Cache-Control", "no-store")
    h.send_header("X-Ruach-Lift", repr(g))
    h.end_headers()
    return None if h.command == "HEAD" else (start, end)


def write(h, out):
    try:
        h.wfile.write(out)
    except (BrokenPipeError, ConnectionResetError):
        pass                                   # the element moved on (a seek, another take)


def send(h, path, gain, span, codec=""):
    """the lifted take to the request handler h, whole or the one Range it asks (span: byte_ranges.span), at most CAP bytes in one answer;
    codec "opus": the Opus copy kept in RAM (above), else the 24-bit WAV made for each Range"""
    try:
        g = float(gain)
    except (TypeError, ValueError):
        raise ValueError("lift: a number, the gain")
    if not math.isfinite(g) or g < 1 or g > GAIN_MAX:
        raise ValueError(f"lift: a gain from 1 to {GAIN_MAX:g}")
    if codec == "opus":
        data = opus(path, g)
        se = answer(h, len(data), span, "audio/ogg", g)
        if se:
            write(h, data[se[0]:se[1] + 1])
        return
    code, ch, rate, bits, at, size = layout(path)
    if (code, bits) not in SUPPORTED:
        raise ValueError(f"a WAV of {bits} bits, format {code}, is not lifted on the fly")
    fb_in = ch * bits // 8
    frames = size // fb_in
    head = header(ch, rate, frames)
    total = len(head) + frames * ch * 3
    se = answer(h, total, span, "audio/wav", g)
    if not se:
        return
    start, end = se
    out = head[start:end + 1] if start < len(head) else b""
    fb = ch * 3
    d0, d1 = max(start, len(head)) - len(head), end + 1 - len(head)     # the data's bytes asked, [d0, d1)
    if d1 > d0:
        f0, f1 = d0 // fb, (d1 + fb - 1) // fb
        with open(path, "rb") as f:
            f.seek(at + f0 * fb_in)
            raw = f.read((f1 - f0) * fb_in)
        body = lifted(samples(raw[:len(raw) - len(raw) % fb_in], code, bits), g)
        out += body[d0 - f0 * fb:d1 - f0 * fb]
    write(h, out)
