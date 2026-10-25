"""HERESY 1635: the tags on a take's FLAC, MP3 and WAV: what a player reads, the audio untouched (FLAC and WAV sample for sample, MP3 frame for
frame by its decoded PCM). On a made-up take folder with a cover (no GPU, no engine).

    .venv/bin/python lab/test_file_tags.py"""
import hashlib, io, json, pathlib, subprocess, sys, tempfile
import numpy as np, soundfile as sf
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import file_tags  # noqa: E402


def pcm(data, fmt):
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", fmt, "-i", "pipe:0", "-f", "s16le", "-"], input=data, capture_output=True, check=True)
    return hashlib.sha256(r.stdout).hexdigest()


with tempfile.TemporaryDirectory() as td:
    d = pathlib.Path(td) / "20261021-010101-test-song"
    d.mkdir()
    json.dump({"title": "Крик · test", "created": 1792537502}, open(d / "meta.json", "w"))
    json.dump({"lyrics": "[Verse]\nэто же (божественный экстаз!)", "style": "Russian, rock opera, female choir backing, solo lead"}, open(d / "request.json", "w"))
    from PIL import Image
    Image.new("RGB", (64, 64), (200, 30, 40)).save(d / "artwork.jpg")
    t = np.arange(48000 * 3) / 48000
    a = (np.stack([np.sin(2 * np.pi * 220 * t), np.sin(2 * np.pi * 330 * t)], 1) * 0.3).astype(np.float32)
    flac, wav = io.BytesIO(), io.BytesIO()
    sf.write(flac, a, 48000, format="FLAC", subtype="PCM_24"); sf.write(wav, a, 48000, format="WAV", subtype="PCM_24")
    mp3 = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-f", "mp3", "-b:a", "192k", "-"], input=wav.getvalue(), capture_output=True, check=True).stdout
    song = file_tags.song_of(d)
    assert song["title"] == "Крик · test" and song["cover"][1] == "image/jpeg" and song["date"].startswith("2026-10-2"), song
    from mutagen.flac import FLAC
    from mutagen.mp3 import MP3
    from mutagen.wave import WAVE
    out, said = file_tags.tag(flac.getvalue(), "flac", song, author="Viktor", software="Ruach Studio 2.0.0")
    assert said == "tagged", said
    f = FLAC(io.BytesIO(out))
    assert f["TITLE"] == ["Крик · test"] and f["LYRICS"][0].startswith("[Verse]") and f["ARTIST"] == ["Viktor"] and f["DESCRIPTION"][0].startswith("Russian") and len(f.pictures) == 1 and f.pictures[0].type == 3
    assert np.array_equal(sf.read(io.BytesIO(out), dtype="int32")[0], sf.read(io.BytesIO(flac.getvalue()), dtype="int32")[0])
    out, said = file_tags.tag(mp3, "mp3", song, software="Ruach Studio 2.0.0")
    assert said == "tagged", said
    m = MP3(io.BytesIO(out))
    assert str(m.tags["TIT2"]) == "Крик · test" and m.tags.getall("USLT")[0].text.startswith("[Verse]") and m.tags.getall("APIC")[0].type == 3 and "TPE1" not in m.tags
    assert pcm(out, "mp3") == pcm(mp3, "mp3")
    out, said = file_tags.tag(wav.getvalue(), "wav", song)
    assert said == "tagged", said
    w = WAVE(io.BytesIO(out))
    assert str(w.tags["TIT2"]) == "Крик · test" and w.tags.getall("APIC")
    assert np.array_equal(sf.read(io.BytesIO(out), dtype="int32")[0], sf.read(io.BytesIO(wav.getvalue()), dtype="int32")[0])
    out, said = file_tags.tag(b"not audio", "flac", song)
    assert out == b"not audio" and said.startswith("untagged:"), said
print("FLAC, MP3, WAV: title, lyrics, style, cover, the audio untouched; a broken file as it came, said")
