"""HERESY 1470 · the Refiner's DAW, its lab half (Viktor 15.10.2026: «нужно начать интеграцию Plenio's DAW. Даже то же самое
сведение… в DAW можно регулировать кучу всего по стемам, резать их, понижать/повышать»; «нужна опция для двух версий стемов, и при
сведении нужна прослушка в общей компоновке в вкл/выкл версий стемов, чтобы собрать идеал из того, что получили»).

A set of stems as the DAW's strips: its parts (a set's instrumental gives way to the drums, bass… made of it; its whole voice to
the lead and the backing), and **rest**, what the source holds beyond their sum (Plenio's residual: a neutral mix is the source
again, so a separation's misses are heard only where the mix is changed). Each strip may play a **version** of its stem: the
first file of a branch made from that stem, of the same length (a cleaned voice…). The mix itself is Plenio's stem mixer
(plenio_core, Apache-2.0: gain, mute, solo, compression, muted ranges, reverb and delay sends), rendered in daw_job.py.
"""
import io
import json
import os
import re
import time
from pathlib import Path

import numpy as np
import soundfile as sf

PARTS = {"instrumental": ("drums", "bass", "other", "guitar", "piano", "winds"), "vocals": ("lead_vocal", "backing_vocals")}
REST = "rest"
SOURCE = "source"                                    # HERESY 1755: what the set was split from, the DAW's reference
MAX_CHUNK = 30.0


def _inside(d, rel):
    p = (Path(d) / rel).resolve()
    if Path(d).resolve() not in p.parents:
        raise ValueError(f"{rel} is not inside the take")
    return p


def set_info(d, rel, derived):
    """The DAW's strips of the set at `rel` (derived/stems-…) of take folder `d`; `derived`: the take's branch manifests."""
    sd = _inside(d, rel)
    man = json.load(open(sd / "manifest.json", encoding="utf-8"))
    if man.get("kind") != "stems":
        raise ValueError(f"{rel} is not a set of stems")
    files = [f for f in man.get("files", []) if (sd / f["file"]).is_file()]
    names = [f["name"] for f in files]
    parts = [f for f in files if not any(n in names for n in PARTS.get(f["name"], ()))]
    src = man.get("source") or "the take"
    if src == "the take":
        source = next((f for f in ("audio.wav", "audio.flac") if (Path(d) / f).is_file()), None)
        if not source:
            raise FileNotFoundError("the take has no audio.wav to measure the rest against")
    else:
        source = src
        _inside(d, source)
    info = sf.info(str(Path(d) / source))
    seconds = info.frames / info.samplerate
    rel_set = sd.relative_to(Path(d).resolve()).as_posix()
    strips = []
    for f in parts:
        own = f"{rel_set}/{f['file']}"
        versions = [{"id": "", "label": "as split", "path": own}]
        known, taken, grew = {own}, set(), True
        while grew:                                  # HERESY 1553: a version of a version is a version of the stem
            grew = False
            for m in derived:
                if not m.get("files") or m.get("id") in taken:
                    continue
                mine = [x for x in m["files"] if x.get("source") in known]   # a branch's file that names this stem (or a version of it)
                if not mine and str(m.get("source", "")) not in known:
                    continue
                first = mine[0] if mine else m["files"][0]
                path = first.get("path") or f"derived/{m['id']}/{first['file']}"
                taken.add(m.get("id"))
                try:
                    fi = sf.info(str(_inside(d, path)))
                except (OSError, RuntimeError, ValueError):
                    continue
                if abs(fi.frames / fi.samplerate - seconds) < 0.05 and fi.samplerate == info.samplerate:
                    versions.append({"id": m["id"], "label": (first.get("name") if mine else None) or m.get("label") or m.get("kind") or m["id"], "path": path,
                                     "created": m.get("created", "")})
                    known.add(path)
                    grew = True
        versions[1:] = sorted(versions[1:], key=lambda v: v.get("created", ""))
        strips.append({"name": f["name"], "title": f.get("title") or f["name"].replace("_", " ").capitalize(), "path": own, "versions": versions})
    strips += added_strips(d, derived, seconds, info.samplerate, {s["name"] for s in strips})
    return {"set": rel_set, "mode": man.get("mode"), "source": source, "seconds": round(seconds, 3), "rate": info.samplerate,
            "channels": info.channels, "strips": strips, "rest": REST}


def added_strips(d, derived, seconds, rate, taken):
    """HERESY 1929: the strips a step adds (a file that says "track", of the take's length): one a track, its first file its own, a later
    one its version; a name the set already has is left out."""
    out = {}
    for m in sorted(derived, key=lambda m: m.get("created", "")):
        for f in m.get("files") or []:
            tr = str(f.get("track") or "")
            if not tr or tr in taken:
                continue
            path = f.get("path") or f"derived/{m.get('id')}/{f.get('file')}"
            try:
                fi = sf.info(str(_inside(d, path)))
            except (OSError, RuntimeError, ValueError):
                continue
            if abs(fi.frames / fi.samplerate - seconds) >= 0.05 or fi.samplerate != rate:
                continue
            v = {"id": m.get("id", ""), "label": f.get("name") or m.get("label") or tr, "path": path, "created": m.get("created", "")}
            if tr in out:
                out[tr]["versions"].append(v)
            else:
                out[tr] = {"name": tr, "title": f.get("title") or tr.replace("_", " ").capitalize(), "path": path, "added": True,
                           "versions": [dict(v, id="")]}
    return list(out.values())


def _slice(path, a, n, channels):
    with sf.SoundFile(str(path)) as f:
        f.seek(min(a, f.frames))
        x = f.read(n, dtype="float32", always_2d=True)
    if x.shape[1] != channels:
        x = np.repeat(x[:, :1], channels, axis=1) if x.shape[1] == 1 else x[:, :channels]
    return np.pad(x, ((0, n - len(x)), (0, 0)))


def chunk(d, info, strip, path, start, seconds):
    """A strip's stretch [start, start+seconds) as 16-bit FLAC bytes; `strip` rest: the source less the set's own parts; source
    (HERESY 1755): the source as it came, the reference."""
    rate, ch = info["rate"], info["channels"]
    seconds = max(0.05, min(MAX_CHUNK, float(seconds)))
    a, n = max(0, int(round(float(start) * rate))), int(round(seconds * rate))
    if strip == SOURCE:
        x = _slice(_inside(d, info["source"]), a, n, ch)
    elif strip == REST:
        x = _slice(_inside(d, info["source"]), a, n, ch).astype(np.float64)
        for s in info["strips"]:
            if not s.get("added"):                    # HERESY 1929: an added strip is no part of the set
                x -= _slice(_inside(d, s["path"]), a, n, ch)
    else:
        s = next((s for s in info["strips"] if s["name"] == strip), None)
        if not s or path not in [v["path"] for v in s["versions"]]:
            raise ValueError(f"{path} is not a version of {strip}")
        x = _slice(_inside(d, path), a, n, ch)
    buf = io.BytesIO()
    sf.write(buf, np.clip(x, -1.0, 1.0), rate, format="FLAC", subtype="PCM_16")
    return buf.getvalue()


def source_loudness(d, info):
    """HERESY 1755: the set's source as the page's loudness meter reads it (heresy-mixdsp.js): the K-weighted power of each 100 ms
    block, BS.1770 with Plenio's filters, the two sides summed (a mono source as the page plays it, on both); and its integrated
    loudness. The page gates the blocks of the stretch that has played as it gates the mix's, and plays the reference as loud."""
    from plenio_core.audio import loudness as pl
    x, rate = sf.read(str(_inside(d, info["source"])), dtype="float64", always_2d=True)
    x = x.T if x.shape[1] > 1 else np.repeat(x.T, 2, axis=0)
    p = pl._weighted_power(x[:2], rate, pl.no_cancel)
    k = round(0.1 * rate)
    z = p[: len(p) // k * k].reshape(-1, k).mean(axis=1)
    whole = pl.integrated_from_blocks(pl._block_powers(p, rate, pl.BLOCK_S, pl.STEP_S))
    return {"block": 0.1, "rate": rate, "z": [float(f"{v:.5g}") for v in z], "integrated": round(whole, 2) if whole is not None else None}


def file_peaks(d, rel, n=400):
    """HERESY 1487: any sound of the take's tree (rel inside the take's folder) as the loudest sample of each of n stretches, 0…1,
    three decimals, and its length in seconds."""
    n = max(50, min(4000, int(n)))
    with sf.SoundFile(str(_inside(d, rel))) as f:
        frames, rate = f.frames, f.samplerate
        step = max(1, frames // n)
        out = []
        block = step * 64
        for a in range(0, step * n, block):
            y = f.read(min(block, step * n - a), dtype="float32", always_2d=True)
            if not len(y):
                break
            m = np.abs(y).max(axis=1)
            k = len(m) // step
            out.extend(round(float(v), 3) for v in m[: k * step].reshape(k, step).max(axis=1))
    return out[:n] + [0.0] * (n - len(out[:n])), frames / rate


def peaks(d, info, strip, path, n=1200):
    """A strip's wave for the page: the loudest sample of each of n stretches (both channels), 0…1, three decimals; rest likewise."""
    n = max(100, min(4000, int(n)))
    rate, ch = info["rate"], info["channels"]
    frames = int(round(info["seconds"] * rate))
    step = max(1, frames // n)
    if strip != REST:
        s = next((s for s in info["strips"] if s["name"] == strip), None)
        if not s or path not in [v["path"] for v in s["versions"]]:
            raise ValueError(f"{path} is not a version of {strip}")
        files = [(_inside(d, path), 1.0)]
    else:
        files = [(_inside(d, info["source"]), 1.0)] + [(_inside(d, s["path"]), -1.0) for s in info["strips"] if not s.get("added")]   # 1929
    out = np.zeros(n)
    block = step * 64
    handles = [(sf.SoundFile(str(p)), k) for p, k in files]
    try:
        for a in range(0, step * n, block):
            m = min(block, step * n - a)
            x = np.zeros((m, ch))
            for f, k in handles:
                f.seek(min(a, f.frames))
                y = f.read(m, dtype="float32", always_2d=True)
                if y.shape[1] != ch:
                    y = np.repeat(y[:, :1], ch, axis=1) if y.shape[1] == 1 else y[:, :ch]
                x[: len(y)] += k * y
            v = np.abs(x).max(axis=1)
            i0 = a // step
            out[i0: i0 + m // step] = v[: (m // step) * step].reshape(-1, step).max(axis=1)
    finally:
        for f, _k in handles:
            f.close()
    return [round(float(v), 3) for v in np.clip(out, 0, 1)]


# HERESY 2315 (Viktor's plan of 08.11.2026, §2.4: «Эталон из любого дубля или чужой песни на равной громкости»): the reference from anywhere: a
# sound of this take's tree, another take, a song of your own (kept in user/references/ as FLAC, 48 kHz, two sides, by the first twelve hex
# of its bytes' SHA-256, its name and length beside it). Measured block by block as the source is (source_loudness), streamed in stretches
# at its own rate (the page's audio resamples), from the same second as the mix.
REF_ID = re.compile(r"[0-9a-f]{12}")
REF_EXT = (".wav", ".flac", ".mp3", ".m4a", ".ogg", ".aiff", ".aif", ".opus")
REF_MAX_S = 1200


def file_loudness(path):
    """source_loudness() for any sound file: the K-weighted power of each 100 ms block, both sides summed (a mono file on both), and its
    integrated loudness; its length."""
    from plenio_core.audio import loudness as pl
    x, rate = sf.read(str(path), dtype="float64", always_2d=True)
    x = x.T if x.shape[1] > 1 else np.repeat(x.T, 2, axis=0)
    p = pl._weighted_power(x[:2], rate, pl.no_cancel)
    k = round(0.1 * rate)
    z = p[: len(p) // k * k].reshape(-1, k).mean(axis=1)
    whole = pl.integrated_from_blocks(pl._block_powers(p, rate, pl.BLOCK_S, pl.STEP_S))
    return {"block": 0.1, "rate": rate, "seconds": round(x.shape[1] / rate, 3), "z": [float(f"{v:.5g}") for v in z],
            "integrated": round(whole, 2) if whole is not None else None}


def file_chunk(path, start, seconds):
    """A stretch [start, start+seconds) of any sound file as 16-bit FLAC at its own rate, two sides (a mono file on both); silence past its end."""
    seconds = max(0.05, min(MAX_CHUNK, float(seconds)))
    with sf.SoundFile(str(path)) as f:
        rate = f.samplerate
        a, n = max(0, int(round(float(start) * rate))), int(round(seconds * rate))
        if a < f.frames:
            f.seek(a)
            x = f.read(n, dtype="float32", always_2d=True)
        else:
            x = np.zeros((0, max(1, f.channels)), dtype="float32")
    x = np.repeat(x[:, :1], 2, axis=1) if x.shape[1] == 1 else x[:, :2]
    x = np.pad(x, ((0, n - len(x)), (0, 0)))
    buf = io.BytesIO()
    sf.write(buf, np.clip(x, -1.0, 1.0), rate, format="FLAC", subtype="PCM_16")
    return buf.getvalue()


def ref_path(outputs, refs_dir, spec):
    """The file a reference names: "take:NAME" (that take's own sound), "take:NAME:derived/…" (a file of its tree) or "own:ID" (a song of
    your own); never a file outside a take's folder or the references."""
    spec = str(spec or "")
    if spec.startswith("own:"):
        rid = spec[4:]
        if not REF_ID.fullmatch(rid):
            raise ValueError("own:ID, twelve hex digits")
        p = Path(refs_dir) / f"{rid}.flac"
        if not p.is_file():
            raise FileNotFoundError("no such reference of yours")
        return p
    if not spec.startswith("take:"):
        raise ValueError("a reference is take:NAME, take:NAME:PATH or own:ID")
    name, _, rel = spec[5:].partition(":")
    if not name or "/" in name or name.startswith("."):
        raise ValueError("bad take name")
    d = Path(outputs) / name
    if not (d / "meta.json").is_file():
        raise FileNotFoundError(f"no take {name}")
    if not rel:
        p = next((d / f for f in ("audio.wav", "audio.flac", "audio.mp3") if (d / f).is_file()), None)
        if p is None:
            raise FileNotFoundError(f"{name} has no sound of its own")
        return p
    p = _inside(d, rel)
    if not p.is_file() or p.suffix.lower() not in REF_EXT:
        raise ValueError(f"{rel} is not a sound of {name}")
    return p


def refs_list(refs_dir):
    """Your references, the newest first: [{id, title, seconds, added, spec}]."""
    out = []
    for m in sorted(Path(refs_dir).glob("*.json")):
        try:
            j = json.loads(m.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if REF_ID.fullmatch(str(j.get("id", ""))) and (Path(refs_dir) / f"{j['id']}.flac").is_file():
            out.append({"id": j["id"], "title": str(j.get("title") or j["id"])[:200], "seconds": j.get("seconds"), "added": j.get("added", ""),
                        "spec": "own:" + j["id"]})
    return sorted(out, key=lambda r: r["added"], reverse=True)


def refs_add(refs_dir, filename, body, title=""):
    """A song of your own kept as a reference: FLAC, 48 kHz, two sides; the same bytes twice are one reference. Its entry."""
    import hashlib
    import subprocess
    ext = Path(str(filename or "")).suffix.lower()
    if ext not in REF_EXT:
        raise ValueError("WAV, FLAC, MP3, M4A, OGG, OPUS or AIFF")
    if not body:
        raise ValueError("no file in the body")
    rid = hashlib.sha256(body).hexdigest()[:12]
    rd = Path(refs_dir)
    rd.mkdir(parents=True, exist_ok=True)
    out, meta = rd / f"{rid}.flac", rd / f"{rid}.json"
    if out.is_file() and meta.is_file():
        return next((r for r in refs_list(rd) if r["id"] == rid), {"id": rid, "spec": "own:" + rid})
    src = rd / f".{rid}{ext}.part"
    src.write_bytes(body)
    part = rd / f".{rid}.part.flac"
    try:
        p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-t", str(REF_MAX_S), "-ac", "2", "-ar", "48000", "-c:a", "flac",
                            "-sample_fmt", "s32", "-bits_per_raw_sample", "24", str(part)], capture_output=True, text=True, timeout=600)
        if p.returncode != 0:
            raise ValueError("ffmpeg could not read it: " + ((p.stderr or "").strip().splitlines() or ["?"])[-1][-200:])
        secs = sf.info(str(part)).duration
        os.replace(part, out)
    finally:
        src.unlink(missing_ok=True)
        part.unlink(missing_ok=True)
    entry = {"id": rid, "title": (str(title or "").strip() or Path(str(filename)).stem)[:200], "file": Path(str(filename)).name[:200],
             "seconds": round(secs, 3), "added": time.strftime("%Y-%m-%d %H:%M:%S")}
    meta.write_text(json.dumps(entry, ensure_ascii=False), encoding="utf-8")
    return dict(entry, spec="own:" + rid)


def refs_delete(refs_dir, rid):
    """A reference of yours gone (its sound and its entry); the list after it."""
    if not REF_ID.fullmatch(str(rid or "")):
        raise ValueError("an id of twelve hex digits")
    for f in (Path(refs_dir) / f"{rid}.flac", Path(refs_dir) / f"{rid}.json"):
        f.unlink(missing_ok=True)
    return refs_list(refs_dir)


def take_sounds(name, d, derived):
    """The sounds of a take a reference may be: the take as it came, then each file of its branches (not a set of stems), the newest first."""
    out = []
    own = next((f for f in ("audio.wav", "audio.flac", "audio.mp3") if (Path(d) / f).is_file()), None)
    if own:
        out.append({"spec": f"take:{name}", "label": "the take as it came", "kind": "take", "created": ""})
    for m in sorted(derived, key=lambda m: m.get("created", ""), reverse=True):
        if m.get("kind") == "stems":
            continue
        for f in m.get("files") or []:
            path = f.get("path") or f"derived/{m.get('id')}/{f.get('file')}"
            if Path(str(path)).suffix.lower() not in REF_EXT or f.get("track"):
                continue
            out.append({"spec": f"take:{name}:{path}", "label": str(m.get("label") or m.get("kind") or m.get("id"))[:80] + " · " + str(f.get("name") or f.get("file"))[:80],
                        "kind": m.get("kind", ""), "created": m.get("created", ""), "seconds": f.get("seconds")})
            if len(out) >= 60:
                return out
    return out
