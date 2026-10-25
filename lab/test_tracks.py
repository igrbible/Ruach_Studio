"""HERESY 1626: a set's tracks as WAV files or packed into parquet, read alike; a raw folder's Hugging Face parquet shards as tracks; the Train
room's listing, scan, preparation and packing through them. On made-up audio in a temporary studio (no GPU, no model).

    .venv/bin/python lab/test_tracks.py"""
import io
import json
import os
import pathlib
import shutil
import sys
import tempfile
import time

import numpy as np
import soundfile as sf

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "trainer"))
import tracks  # noqa: E402
import training  # noqa: E402


def tone(seconds, freq, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    a = (np.sin(2 * np.pi * freq * t) * 0.3 * (2 ** 23 - 1)).astype(np.int32) << 8      # 24-bit values, as int32 reads them
    return np.stack([a, (a // 2)], axis=1)


def make_set(folder, n=3):
    folder.mkdir(parents=True)
    for i in range(n):
        sf.write(folder / f"{i + 1:03d}.wav", tone(1.5 + i, 220 * (i + 1)), 48000, subtype="PCM_24")
        (folder / f"{i + 1:03d}.txt").write_text(f"style {i}\n[Lyrics]\nla la {i}\n", encoding="utf-8")
    (folder / "_ruach_cache").mkdir()
    (folder / "_ruach_cache" / "001_ruach.safetensors").write_bytes(b"x")


def test_pack_unpack():
    with tempfile.TemporaryDirectory() as td:
        s = pathlib.Path(td) / "set"
        make_set(s)
        before = {st: sf.read(s / f"{st}.wav", dtype="int32", always_2d=True)[0] for st in tracks.wav_stems(str(s))}
        wav_bytes = sum((s / f"{st}.wav").stat().st_size for st in before)
        out = tracks.pack(str(s), say=lambda x: None)
        assert out["packed"] == 3 and out["flac_bytes"] < wav_bytes, out
        assert not list(s.glob("*.wav")) and len(tracks.packed_files(str(s))) == 1
        assert tracks.stems(str(s)) == ["001", "002", "003"]
        for st, data in before.items():
            got, sr = tracks.audio(str(s), st, "int32")
            assert sr == 48000 and np.array_equal(got, data), st
            with tracks.as_file(str(s), st) as w:
                back, _ = sf.read(w, dtype="int32", always_2d=True)
                assert np.array_equal(back, data) and sf.info(w).subtype == "PCM_24"
            assert not os.path.exists(w)
        import cache
        assert cache.missing(str(s)) == ["002", "003"], cache.missing(str(s))   # the cache's own count sees the packed tracks
        assert cache.missing_sheets(str(s), "full") == ["001", "002", "003"]
        assert tracks.pack(str(s), say=lambda x: None)["packed"] == 0         # packed already: nothing to pack
        sf.write(s / "004.wav", tone(1.0, 880), 48000, subtype="PCM_24")       # a WAV beside the packed ones: refused, nothing touched
        try:
            tracks.pack(str(s), say=lambda x: None)
        except ValueError:
            pass
        else:
            raise AssertionError("a set packed in part packed again")
        (s / "004.wav").unlink()
        tracks.unpack(str(s), say=lambda x: None)
        assert not tracks.packed_files(str(s))
        for st, data in before.items():
            assert np.array_equal(sf.read(s / f"{st}.wav", dtype="int32", always_2d=True)[0], data), st
    print("pack and unpack: the same samples, the WAVs gone and back, the cache's count alike")


def hf_shard(path, rows):
    import pyarrow as pa
    import pyarrow.parquet as pq
    audio = pa.struct([("bytes", pa.binary()), ("path", pa.string())])
    recs = {"audio": [], "title": [], "genres": [], "tags": [], "lyrics": []}
    for i, (sec, f) in enumerate(rows):
        buf = io.BytesIO()
        sf.write(buf, tone(sec, f).astype(np.int32), 48000, format="WAV", subtype="PCM_24")
        recs["audio"].append({"bytes": buf.getvalue(), "path": f"track{i}.wav"})
        recs["title"].append(f"Song {i}")
        recs["genres"].append(["Rock", "Folk"])
        recs["tags"].append(["live"])
        recs["lyrics"].append("" if i else "first line\nsecond line")
    t = pa.table(recs, schema=pa.schema([("audio", audio), ("title", pa.string()), ("genres", pa.list_(pa.string())), ("tags", pa.list_(pa.string())), ("lyrics", pa.string())]))
    pq.write_table(t, path, row_group_size=2)


def test_raw_parquet_and_training():
    with tempfile.TemporaryDirectory() as td:
        kit = pathlib.Path(td)
        raw = kit / "datasets" / "raw" / "fma-sample" / "data"
        raw.mkdir(parents=True)
        hf_shard(raw / "train-00000-of-00002.parquet", [(1.0, 300), (1.2, 330), (1.4, 360)])
        hf_shard(raw / "train-00001-of-00002.parquet", [(1.0, 400), (1.1, 440)])
        n, b = tracks.raw_count(str(raw.parent))
        assert n == 5 and b > 0, (n, b)
        rows = tracks.raw_rows(str(raw.parent))
        assert [r["file"] for r in rows][:2] == ["data/train-00000-of-00002.parquet#0", "data/train-00000-of-00002.parquet#1"], rows[:2]
        assert rows[0]["style"] == "Rock, Folk, live" and rows[0]["lyrics"].startswith("first line") and rows[4]["file"].endswith("00001-of-00002.parquet#1")
        b4, name = tracks.raw_audio(str(raw.parent), rows[4]["file"])
        assert name == "track1.wav" and sf.info(io.BytesIO(b4)).duration > 1.0
        (kit / "datasets" / "prepared").mkdir(parents=True)
        listing = training.datasets(kit)
        mine = [r for r in listing["raw"] if r["name"] == "fma-sample"][0]
        assert mine["tracks"] == 5 and mine["parquet_rows"] == 5, mine
        sc = training.scan(kit, "fma-sample")
        assert len(sc["tracks"]) == 5 and sc["tracks"][0]["lyrics_from"] == "parquet", sc["tracks"][0]
        job = training.prepare(kit, {"from": "fma-sample", "name": "fma-two", "style": "rock",
                                           "tracks": [{"file": sc["tracks"][0]["file"], "lyrics": "a"}, {"file": sc["tracks"][4]["file"]}]})
        for _ in range(200):
            if training.prepare_status("fma-two")["status"] != "running":
                break
            time.sleep(0.05)
        st = training.prepare_status("fma-two")
        assert st["status"] == "done", st
        made = kit / "datasets" / "prepared" / "fma-two"
        assert sorted(p.name for p in made.iterdir()) == ["001.txt", "001.wav", "002.txt", "002.wav", "dataset.json"], sorted(p.name for p in made.iterdir())
        assert abs(sf.info(made / "002.wav").duration - 1.1) < 0.01 and sf.info(made / "002.wav").subtype == "PCM_24"
        # packed through the lab's job; a set that is a link elsewhere refused
        training.pack(kit, {"name": "fma-two"})
        for _ in range(200):
            if training.prepare_status("fma-two")["status"] != "running":
                break
            time.sleep(0.05)
        st = training.prepare_status("fma-two")
        assert st["status"] == "done" and st["result"]["packed"] == 2 and not list(made.glob("*.wav")), st
        away = kit / "away" / "linked"
        away.mkdir(parents=True)
        (kit / "datasets" / "prepared" / "linked").symlink_to(away)
        try:
            training.pack(kit, {"name": "linked"})
        except ValueError as e:
            assert "another disk" in str(e)
        else:
            raise AssertionError("a linked set packed")
        # a raw folder that is a link (the Patriot) prepares from its own files
        far = kit / "away" / "voice"
        far.mkdir(parents=True)
        for i in range(2):
            sf.write(far / f"clip{i}.wav", tone(1.0, 500 + i), 48000, subtype="PCM_24")
        (kit / "datasets" / "raw" / "voice").symlink_to(far)
        training.prepare(kit, {"from": "voice", "name": "voice-set", "tracks": [{"file": "clip0.wav"}, {"file": "clip1.wav"}]})
        for _ in range(200):
            if training.prepare_status("voice-set")["status"] != "running":
                break
            time.sleep(0.05)
        st = training.prepare_status("voice-set")
        assert st["status"] == "done", st
    print("raw parquet shards: counted, scanned, prepared from; packed through the lab; a linked set refused; a linked raw folder prepares")


if __name__ == "__main__":
    test_pack_unpack()
    test_raw_parquet_and_training()
    print("all passed")
