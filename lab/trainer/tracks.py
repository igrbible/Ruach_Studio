"""HERESY 1626 (Viktor 20.10.2026: «Докодишь поддержку parquet и упаковку в этот формат? Так сэкономим место мы, и юзеры»): a set's tracks,
read alike whether they lie as files or packed.

A prepared set (datasets/prepared/NAME) holds its tracks as NNN.wav (48 kHz stereo, PCM 24-bit, as the Train room writes them) or packed into
tracks-NNNNN.parquet: a row a track (stem, audio as FLAC 24-bit with the very samples of the WAV, caption, seconds, the samples' sha256), each
row its own row group, so one track is read without the others. The captions (NNN.txt), dataset.json and _ruach_cache stay as files.

A raw folder (datasets/raw/NAME) may hold parquet shards as Hugging Face keeps datasets: an audio column of {bytes, path} beside the metadata.
Their rows are tracks named SHARD.parquet#ROW; the style comes from the genres and tags, the lyrics from a lyrics column where there is one.

    .venv/bin/python lab/trainer/tracks.py pack SET_FOLDER [--keep]     (the WAVs go once the packed copy reads back alike, sample for sample)
    .venv/bin/python lab/trainer/tracks.py unpack SET_FOLDER [--keep]   (the WAVs back, read back alike; then the parquet goes)
    .venv/bin/python lab/trainer/tracks.py info FOLDER
"""
import contextlib
import glob
import hashlib
import io
import json
import os
import sys
import tempfile

PACKED = "tracks-*.parquet"
SHARD_BYTES = 512 << 20                                  # a shard closes past half a gigabyte of FLAC
_INDEX = {}                                              # folder -> (the files and their times, {stem: (file, row group)})


def _pq():
    import pyarrow.parquet as pq
    return pq


# ---- a prepared set

def wav_stems(set_folder):
    return sorted(os.path.basename(w)[:-4] for w in glob.glob(os.path.join(set_folder, "[0-9]*.wav")))


def packed_files(set_folder):
    return sorted(glob.glob(os.path.join(set_folder, PACKED)))


def _index(set_folder):
    files = packed_files(set_folder)
    key = tuple((f, os.path.getmtime(f)) for f in files)
    hit = _INDEX.get(set_folder)
    if hit and hit[0] == key:
        return hit[1]
    pq, idx = _pq(), {}
    for f in files:
        pf = pq.ParquetFile(f)
        for rg in range(pf.num_row_groups):
            for s in pf.read_row_group(rg, columns=["stem"]).column("stem").to_pylist():
                idx[s] = (f, rg)
    _INDEX[set_folder] = (key, idx)
    return idx


def stems(set_folder):
    """Every track of the set, as files or packed, by its stem (001, 002…)."""
    return sorted(set(wav_stems(set_folder)) | set(_index(set_folder)))


def _row(set_folder, stem):
    f, rg = _index(set_folder)[stem]
    t = _pq().ParquetFile(f).read_row_group(rg)
    i = t.column("stem").to_pylist().index(stem)
    return {c: t.column(c)[i].as_py() for c in t.column_names}


def audio(set_folder, stem, dtype="float32"):
    """(samples [n, channels], sample rate) of one track, from its WAV or its packed row."""
    import soundfile as sf
    w = os.path.join(set_folder, stem + ".wav")
    if os.path.isfile(w):
        return sf.read(w, dtype=dtype, always_2d=True)
    return sf.read(io.BytesIO(_row(set_folder, stem)["audio"]), dtype=dtype, always_2d=True)


@contextlib.contextmanager
def as_file(set_folder, stem):
    """A WAV path for a tool that reads files (the separator, the transcriber): the track's own file, or a copy unpacked for the while."""
    w = os.path.join(set_folder, stem + ".wav")
    if os.path.isfile(w):
        yield w
        return
    import soundfile as sf
    fd, tmp = tempfile.mkstemp(suffix=".wav", prefix=f"ruach-{stem}-")
    os.close(fd)
    try:
        data, sr = audio(set_folder, stem, "int32")
        sf.write(tmp, data, sr, subtype="PCM_24")
        yield tmp
    finally:
        if os.path.isfile(tmp):
            os.remove(tmp)


def _digest(data):
    return hashlib.sha256(data.tobytes()).hexdigest()


def pack(set_folder, keep=False, shard_bytes=SHARD_BYTES, say=print):
    """The set's WAVs into tracks-*.parquet (FLAC 24-bit: the same samples), read back and compared sample for sample; the WAVs go after."""
    import pyarrow as pa
    import soundfile as sf
    pq = _pq()
    todo = wav_stems(set_folder)
    if not todo:
        return {"packed": 0, "wav_bytes": 0, "flac_bytes": 0}
    if packed_files(set_folder):
        raise ValueError("this set is packed already, in part: unpack it first")
    schema = pa.schema([("stem", pa.string()), ("audio", pa.binary()), ("caption", pa.string()), ("seconds", pa.float32()), ("sha256", pa.string())])
    digests, writer, shard, size, made, wav_bytes, flac_bytes = {}, None, -1, 0, [], 0, 0
    try:
        for i, stem in enumerate(todo):
            w = os.path.join(set_folder, stem + ".wav")
            data, sr = sf.read(w, dtype="int32", always_2d=True)
            buf = io.BytesIO()
            sf.write(buf, data, sr, format="FLAC", subtype="PCM_24")
            b = buf.getvalue()
            cap = os.path.join(set_folder, stem + ".txt")
            digests[stem] = _digest(data)
            if writer is None or size >= shard_bytes:
                if writer is not None:
                    writer.close()
                shard, size = shard + 1, 0
                part = os.path.join(set_folder, f"tracks-{shard:05d}.parquet.part")
                writer = pq.ParquetWriter(part, schema, compression="none")       # FLAC is compressed already
                made.append(part)
            writer.write_table(pa.table({"stem": [stem], "audio": [b], "caption": [open(cap, encoding="utf-8").read() if os.path.isfile(cap) else ""],
                                         "seconds": [len(data) / sr], "sha256": [digests[stem]]}, schema=schema))
            size += len(b)
            wav_bytes += os.path.getsize(w)
            flac_bytes += len(b)
            if (i + 1) % 50 == 0:
                say(f"pack: {i + 1}/{len(todo)}")
        writer.close()
        writer = None
        for part in made:
            os.replace(part, part[:-len(".part")])
        _INDEX.pop(set_folder, None)
        for stem in todo:                                # read back: every row decoded, its samples as the WAV's
            data, _ = audio_packed(set_folder, stem)
            if _digest(data) != digests[stem]:
                raise RuntimeError(f"{stem}: the packed samples differ from the WAV's")
    except BaseException:
        if writer is not None:
            writer.close()
        for part in made:
            for p in (part, part[:-len(".part")]):
                if os.path.isfile(p):
                    os.remove(p)
        _INDEX.pop(set_folder, None)
        raise
    if not keep:
        for stem in todo:
            os.remove(os.path.join(set_folder, stem + ".wav"))
    say(f"pack: {len(todo)} tracks, {wav_bytes / 1e9:.2f} GB of WAV in {flac_bytes / 1e9:.2f} GB of FLAC, read back alike" + ("" if keep else "; the WAVs gone"))
    return {"packed": len(todo), "wav_bytes": wav_bytes, "flac_bytes": flac_bytes}


def audio_packed(set_folder, stem):
    import soundfile as sf
    return sf.read(io.BytesIO(_row(set_folder, stem)["audio"]), dtype="int32", always_2d=True)


def unpack(set_folder, keep=False, say=print):
    """The packed tracks back as NNN.wav (PCM 24-bit), each read back against its recorded digest; the parquet goes after."""
    import soundfile as sf
    idx = _index(set_folder)
    for stem in sorted(idx):
        w = os.path.join(set_folder, stem + ".wav")
        if os.path.isfile(w):
            continue
        row = _row(set_folder, stem)
        data, sr = sf.read(io.BytesIO(row["audio"]), dtype="int32", always_2d=True)
        sf.write(w + ".part", data, sr, subtype="PCM_24", format="WAV")
        back, _ = sf.read(w + ".part", dtype="int32", always_2d=True)
        if _digest(back) != row.get("sha256", _digest(data)):
            os.remove(w + ".part")
            raise RuntimeError(f"{stem}: the unpacked samples differ from the packed ones")
        os.replace(w + ".part", w)
    if not keep:
        for f in packed_files(set_folder):
            os.remove(f)
        _INDEX.pop(set_folder, None)
    say(f"unpack: {len(idx)} tracks back as WAV" + ("" if keep else "; the parquet gone"))
    return {"unpacked": len(idx)}


# ---- a raw folder of Hugging Face parquet shards

def raw_shards(folder):
    return sorted(str(p) for p in __import__("pathlib").Path(folder).rglob("*.parquet") if not os.path.basename(p).startswith("tracks-"))


def _audio_column(schema):
    for f in schema:
        t = f.type
        if getattr(t, "num_fields", 0) and any(t.field(i).name == "bytes" for i in range(t.num_fields)):
            return f.name
    return None


def raw_count(folder):
    """(rows, bytes) of the parquet shards in a raw folder, from their footers alone."""
    pq, n, b = _pq(), 0, 0
    for f in raw_shards(folder):
        n += pq.ParquetFile(f).metadata.num_rows
        b += os.path.getsize(f)
    return n, b


def _labels(schema):
    """Hugging Face's ClassLabel names by column, as the datasets library keeps them in the schema's metadata (FMA's genres and licences are numbers)."""
    try:
        feats = json.loads(schema.metadata[b"huggingface"])["info"]["features"]
    except (KeyError, TypeError, ValueError):
        return {}
    out = {}
    for col, f in feats.items():
        g = f[0] if isinstance(f, list) and f else f.get("feature", f) if isinstance(f, dict) else None
        if isinstance(g, dict) and g.get("_type") == "ClassLabel" and g.get("names"):
            out[col] = g["names"]
    return out


def _words(v, names=None):
    if v is None:
        return []
    vs = v if isinstance(v, (list, tuple)) else [v]
    out = []
    for x in vs:
        if x in (None, ""):
            continue
        out.append(names[x] if names and isinstance(x, int) and 0 <= x < len(names) else str(x))
    return [w for w in out if w.strip()]


def raw_rows(folder, limit=5000):
    """The rows of a raw folder's shards as tracks: [{file: SHARD#ROW, style, lyrics, seconds, bytes}], up to `limit`."""
    pq, out = _pq(), []
    for f in raw_shards(folder):
        pf = pq.ParquetFile(f)
        acol = _audio_column(pf.schema_arrow)
        if not acol:
            continue
        meta = [c for c in pf.schema_arrow.names if c != acol]
        names = _labels(pf.schema_arrow)
        base, row = os.path.relpath(f, folder), 0
        for rg in range(pf.num_row_groups):
            for r in pf.read_row_group(rg, columns=meta).to_pylist():
                style = ", ".join(sum((_words(r.get(c), names.get(c)) for c in ("genres", "genre", "tags", "instrument", "mood_theme")), []))
                lyrics = str(r.get("lyrics") or "")
                secs = r.get("duration") or r.get("seconds") or 0
                lic = _words(r.get("license"), names.get("license"))
                yes = lambda c: (_words(r.get(c), names.get(c)) or [""])[0].lower() in ("yes", "1", "true")   # noqa: E731
                out.append({"file": f"{base}#{row}", "style": style, "lyrics": lyrics, "seconds": float(secs or 0),
                            "title": str(r.get("title") or ""), "bytes": 0, "artist": str(r.get("artist") or ""),
                            "license": lic[0] if lic else "", "instrumental": yes("instrumental"),
                            "derivatives": yes("allow_derivatives") if "allow_derivatives" in r else None,
                            "language": str(r.get("language") or "")})
                row += 1
                if len(out) >= limit:
                    return out
    return out


def raw_audio(folder, ref):
    """The audio bytes of SHARD#ROW (as the shard keeps them: MP3, FLAC, WAV…) and the name it had."""
    pq = _pq()
    shard, row = ref.rsplit("#", 1)
    f = os.path.join(folder, shard)
    if os.path.relpath(os.path.realpath(f), os.path.realpath(folder)).startswith(".."):
        raise FileNotFoundError(ref)
    pf, row = pq.ParquetFile(f), int(row)
    acol = _audio_column(pf.schema_arrow)
    for rg in range(pf.num_row_groups):
        n = pf.metadata.row_group(rg).num_rows
        if row < n:
            v = pf.read_row_group(rg, columns=[acol]).column(acol)[row].as_py()
            return v.get("bytes"), v.get("path") or ""
        row -= n
    raise FileNotFoundError(ref)


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("pack", "unpack", "info"):
        sys.exit(__doc__)
    cmd, folder, keep = sys.argv[1], sys.argv[2], "--keep" in sys.argv
    if cmd == "pack":
        pack(folder, keep)
    elif cmd == "unpack":
        unpack(folder, keep)
    else:
        n, b = raw_count(folder)
        print(json.dumps({"wav": len(wav_stems(folder)), "packed": len(_index(folder)) if packed_files(folder) else 0, "raw_rows": n, "raw_bytes": b}))


if __name__ == "__main__":
    main()
