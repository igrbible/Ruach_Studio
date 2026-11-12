"""HERESY 2351 (Timon's cherry ③, «Тимон YuE2-Studio - вишенки - 2026-11-07»: his #23, #145, #110, #149 and the beginner's #166 asking for warnings
before a run: too few or too many songs, poor quality, MP3, a «wildly mixed» set; the plan of 08.11.2026, the Trainer: «доктор набора перед
обучением LoRA»): the dataset doctor. Before a LoRA is trained, a raw folder (datasets/raw/NAME) is looked at track by track and said back
against the Studio's own guide (heresy/docs/LORA-TRAINING.md, §1 and §2): how many songs and how long (a style wants 20 or more, a voice
30 or a few hours, a language a hundred), versions of one song, the same file twice, under 0:30 or over 6:00, lossy sources and highs cut
at an encoder's ceiling (a WAV or FLAC made from an MP3 shows it too), below 44.1 kHz or mono, clipping, long silence at an end, a
loudness far from the rest, the tempo's spread. It decides nothing: the learner reads it and chooses.

Per track: ffprobe (codec, rate, channels, length); the whole file decoded at 11025 Hz mono (silence at the ends, loudness, the tempo by
librosa's beat tracker); 20 s from its middle at its own rate, both channels (the spectrum's cliff, clipping). A folder's report is kept
in cache/train-doctor/NAME.json under the folder's signature (its files, their sizes and times): looked at again only when they change.
At most MAX_TRACKS tracks are examined (spread over the folder); parquet rows are counted, not examined. One folder at a time, in a
thread, at nice 15. GET /train/doctor?name= says where it stands and the report; POST /train/doctor {name, again} starts it.
"""
import hashlib, json, os, re, subprocess, threading, time
from pathlib import Path

AUDIO = {".wav", ".flac", ".mp3", ".ogg", ".m4a", ".opus", ".aac", ".wma"}
LOSSY = {"mp3", "mp2", "aac", "vorbis", "opus", "wmav1", "wmav2", "wmapro", "ac3", "eac3"}
MAX_TRACKS = 400
JOBS = {}                       # folder name -> {status, done, total, started, ended, error}
LOCK = threading.Lock()


def _paths(kit):
    return Path(kit) / "datasets" / "raw", Path(kit) / "cache" / "train-doctor"


def _safe_dir(base, name):
    import training                                    # the lab's own rule for a raw folder's name (a link in its place counts)
    return training._safe_dir(base, name)


def _files(d):
    return sorted(f for f in d.rglob("*") if f.is_file() and f.suffix.lower() in AUDIO and not f.name.startswith("."))


def _signature(files):
    h = hashlib.sha1()
    for f in files:
        st = f.stat()
        h.update(f"{f}\0{st.st_size}\0{st.st_mtime_ns}\n".encode("utf-8", "surrogateescape"))
    return h.hexdigest()[:20]


def _run(cmd, timeout=120):
    return subprocess.run(["nice", "-n", "15"] + cmd, capture_output=True, timeout=timeout)


def _probe(f):
    r = _run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
              "-of", "json", str(f)], 60)
    try:
        j = json.loads(r.stdout.decode("utf-8", "replace") or "{}")
        s = (j.get("streams") or [{}])[0]
        return {"codec": s.get("codec_name") or "", "rate": int(s.get("sample_rate") or 0), "channels": int(s.get("channels") or 0),
                "seconds": round(float((j.get("format") or {}).get("duration") or 0), 1)}
    except (ValueError, TypeError):
        return {"codec": "", "rate": 0, "channels": 0, "seconds": 0.0}


def _pcm(f, rate, channels=1, start=None, length=None):
    import numpy as np
    cmd = ["ffmpeg", "-nostdin", "-v", "error"] + (["-ss", f"{start:.2f}"] if start else []) + ["-i", str(f)] + \
          (["-t", f"{length:.2f}"] if length else []) + ["-ac", str(channels), "-ar", str(rate), "-f", "f32le", "-"]
    r = _run(cmd, 300)
    x = np.frombuffer(r.stdout, dtype=np.float32)
    return x.reshape(-1, channels) if channels > 1 else x


def _cliff(x, rate):
    """The highs' cliff: the frequency (kHz) where the spectrum falls 25 dB or more within a kilohertz and stays down, or None.
    An encoder's lowpass is such a cliff (16 kHz at 128 kb/s, 19–20 at 320); a dark recording slopes, it does not fall off a cliff."""
    import numpy as np
    if rate < 32000 or len(x) < rate:
        return None
    n = 8192
    frames = len(x) // n
    if frames < 2:
        return None
    w = np.hanning(n).astype(np.float32)
    seg = x[:frames * n].reshape(frames, n) * w
    p = (np.abs(np.fft.rfft(seg, axis=1)) ** 2).mean(axis=0)
    fr = np.fft.rfftfreq(n, 1.0 / rate)
    band = 250.0                                          # 250 Hz bands
    edges = np.arange(1000.0, min(rate / 2.0, 22000.0), band)
    lv = np.array([10 * np.log10(p[(fr >= a) & (fr < a + band)].mean() + 1e-20) for a in edges])
    ref = np.median(lv[(edges >= 1000) & (edges < 4000)])
    best, at = 0.0, None
    for i in range(len(edges)):
        f0 = edges[i]
        if f0 < 11000 or f0 > 20500 or i < 4 or i + 4 > len(edges):
            continue
        drop = lv[i - 4:i].mean() - lv[i:i + 4].mean()      # a kilohertz under against a kilohertz over
        stays = lv[i:].max() < lv[i - 4:i].mean() - 15        # and nothing above climbs back
        if drop >= 25 and stays and lv[i - 4:i].mean() > ref - 60 and drop > best:
            best, at = drop, f0
    return round(at / 1000.0, 1) if at else None


def _tempo(x, rate):
    try:
        import numpy as np, librosa
        t = librosa.beat.beat_track(y=np.ascontiguousarray(x[: rate * 120]), sr=rate)[0]
        t = float(np.atleast_1d(t)[0])
        return round(t, 1) if t > 0 else None
    except Exception:                                      # noqa: BLE001: no tempo is said as none, never a guess
        return None


def _look(f):
    import numpy as np
    row = {"file": None, "bytes": f.stat().st_size}
    row.update(_probe(f))
    sec = row["seconds"]
    if sec <= 0:
        row["error"] = "unreadable"
        return row
    # the whole song, small: silence at its ends, its loudness, its tempo
    lo = _pcm(f, 11025)
    if len(lo) < 11025:
        row["error"] = "unreadable"
        return row
    hop = 551                                             # 50 ms
    k = len(lo) // hop
    rms = 10 * np.log10((lo[:k * hop].reshape(k, hop) ** 2).mean(axis=1) + 1e-12)
    loud = np.nonzero(rms > -45)[0]
    row["lead_s"] = round(float(loud[0] * 0.05), 1) if len(loud) else round(sec, 1)
    row["tail_s"] = round(float((k - 1 - loud[-1]) * 0.05), 1) if len(loud) else round(sec, 1)
    sound = rms[rms > -45]
    row["rms_db"] = round(float(10 * np.log10(np.mean(10 ** (sound / 10)))), 1) if len(sound) else None
    row["bpm"] = _tempo(lo, 11025)
    # 20 s from the middle at its own rate, both channels: the highs' cliff and clipping
    rate = row["rate"] if row["rate"] >= 8000 else 44100
    mid = _pcm(f, min(rate, 96000), 2, start=max(0.0, sec / 2 - 10), length=min(20.0, sec))
    if len(mid):
        row["cliff_khz"] = _cliff(mid.mean(axis=1), min(rate, 96000))
        a = np.abs(mid)
        row["clip_share"] = round(float((a >= 0.999).mean()) * 100, 3)   # per cent of samples at full scale
    row["sha"] = _hash(f)
    return row


def _hash(f):
    h, size = hashlib.sha1(), f.stat().st_size
    with open(f, "rb") as fh:
        h.update(fh.read(2 << 20))
        if size > 3 << 20:
            fh.seek(-(1 << 20), 2)
            h.update(fh.read())
    return h.hexdigest()[:16] + f"-{size}"


VERSION = re.compile(r"\b(?:v|ver|version|take|mix|remix|remaster(?:ed)?|edit|demo|alt|final|master|live|copy)(?=[\s._-]*\d|\b)[\s._-]*[\d.]*|\(\s*\d+\s*\)|\[\s*\d+\s*\]", re.I)


CUT = re.compile(r"(\bv(?:er(?:sion)?)?\.?\s*\d|\btake\s*\d|\(\s*\d+\s*\)|\[\s*\d+\s*\])", re.I)


def _song_key(name):
    """A file's name as a song's: everything from its first version mark on left out (v2.7 and the mix, the take, the copy's number), then a
    track number before it and the words of versions: «💎 01. МАНИФЕСТ_ Крик. v2.7 60-80 Extra (1)» and «… v2.2 20-80 7_24 (Remastered)» one song"""
    s = Path(name).stem
    m = CUT.search(s)
    if m and m.start() > 0:
        s = s[:m.start()]
    s = s.lower()
    s = re.sub(r"^[^\w]*\d{1,3}[\s._-]+", "", s)        # a track number (after a sign or two) before the name
    s = VERSION.sub(" ", s)
    s = re.sub(r"[\d_]+", " ", s)
    s = re.sub(r"[^\w]+", " ", s, flags=re.U)
    return " ".join(s.split())


def _sample(files):
    if len(files) <= MAX_TRACKS:
        return files
    step = len(files) / MAX_TRACKS
    return [files[int(i * step)] for i in range(MAX_TRACKS)]


def _report(name, d, files, rows, parquet):
    import numpy as np
    good = [r for r in rows if not r.get("error")]
    secs = sum(r["seconds"] for r in good)
    names = lambda rs: [r["file"] for r in rs]                       # noqa: E731
    out = {"name": name, "made": time.time(), "tracks": len(files), "examined": len(rows), "seconds": round(secs), "parquet_rows": parquet,
           "unreadable": names([r for r in rows if r.get("error")])}
    groups = {}
    for r in rows:
        k = _song_key(r["file"])
        if k:
            groups.setdefault(k, []).append(r["file"])
    out["songs"] = len(groups) or len(good)
    out["versions"] = sorted(([k, len(v), v[:6]] for k, v in groups.items() if len(v) >= 3), key=lambda x: -x[1])
    shas = {}
    for r in good:
        shas.setdefault(r.get("sha"), []).append(r["file"])
    out["same"] = [v for v in shas.values() if len(v) > 1]
    out["short"] = names([r for r in good if r["seconds"] < 30])
    out["long"] = names([r for r in good if r["seconds"] > 360])
    out["lossy"] = names([r for r in good if r["codec"] in LOSSY])
    # an MP3 of 128 kb/s or less: its lowpass near 16 kHz (16 at 44.1 kHz, up to 17 at 48); higher rates cut at 18–20
    out["cut16"] = [[r["file"], r["cliff_khz"]] for r in good if r.get("cliff_khz") and r["cliff_khz"] <= 17.2]
    out["cut"] = [[r["file"], r["cliff_khz"]] for r in good if r.get("cliff_khz") and 17.2 < r["cliff_khz"] < 19.6]
    out["low_rate"] = [[r["file"], r["rate"]] for r in good if 0 < r["rate"] < 44100]
    out["mono"] = names([r for r in good if r["channels"] == 1])
    out["clipped"] = [[r["file"], r["clip_share"]] for r in good if (r.get("clip_share") or 0) >= 0.05]
    out["silent_ends"] = [[r["file"], r["lead_s"], r["tail_s"]] for r in good if r.get("lead_s", 0) > 3 or r.get("tail_s", 0) > 3]
    levels = [r["rms_db"] for r in good if r.get("rms_db") is not None]
    if levels:
        med = float(np.median(levels))
        out["loudness"] = {"low": min(levels), "high": max(levels), "median": round(med, 1),
                           "apart": [[r["file"], r["rms_db"]] for r in good if r.get("rms_db") is not None and abs(r["rms_db"] - med) > 6]}
    bpm = [r["bpm"] for r in good if r.get("bpm")]
    if bpm:
        def fold(t):
            while t < 70:
                t *= 2
            while t >= 140:
                t /= 2
            return t
        f = [fold(t) for t in bpm]
        # called mixed by the middle eight tenths, so one odd track (a noise, a tracker's slip) does not make a set mixed
        p10, p90 = (float(np.percentile(bpm, q)) for q in (10, 90))
        f10, f90 = (float(np.percentile(f, q)) for q in (10, 90))
        out["tempo"] = {"low": round(min(bpm)), "high": round(max(bpm)), "fold_low": round(min(f)), "fold_high": round(max(f)),
                        "mixed": f90 / f10 > 1.35 and p90 / p10 > 1.5, "n": len(bpm)}
    out["rows"] = rows
    return out


SEEN = {}                       # folder name -> (when, its signature, its tracks): a big folder is not walked at every look


def _seen(d, name):
    hit = SEEN.get(name)
    if hit and time.time() - hit[0] < 30:
        return hit[1], hit[2]
    files = _files(d)
    SEEN[name] = (time.time(), _signature(files), len(files))
    return SEEN[name][1], SEEN[name][2]


def status(kit, name):
    raw, cache = _paths(kit)
    d = _safe_dir(raw, name)
    job = dict(JOBS.get(name) or {"status": "none"})
    rep = None
    p = cache / (name + ".json")
    if p.is_file():
        try:
            rep = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            rep = None
    try:
        sig, n = _seen(d, name) if job.get("status") != "running" else (None, job.get("total", 0))
    except OSError:
        sig, n = None, 0
    return dict(job, name=name, report=rep, fresh=bool(rep and sig and rep.get("signature") == sig), tracks=n)


def start(kit, spec):
    raw, cache = _paths(kit)
    name = str(spec.get("name", ""))
    d = _safe_dir(raw, name)
    with LOCK:
        job = JOBS.get(name)
        if job and job["status"] == "running":
            return dict(job, name=name)
        if any(j["status"] == "running" for j in JOBS.values()):
            return {"status": "busy", "name": name, "error": "another folder is being examined"}
        job = {"status": "running", "started": time.time(), "done": 0, "total": 0}
        JOBS[name] = job

    def work():
        try:
            files = _files(d)
            sig = _signature(files)
            p = cache / (name + ".json")
            if not spec.get("again") and p.is_file():
                try:
                    old = json.loads(p.read_text(encoding="utf-8"))
                    if old.get("signature") == sig:
                        job.update(status="done", ended=time.time(), done=old.get("examined", 0), total=old.get("examined", 0))
                        return
                except ValueError:
                    pass
            pick = _sample(files)
            job["total"] = len(pick)
            rows = []
            for f in pick:
                try:
                    r = _look(f)
                except Exception as e:                    # noqa: BLE001: one bad file is said, the rest go on
                    r = {"error": str(e)[:200], "seconds": 0, "codec": "", "rate": 0, "channels": 0}
                r["file"] = str(f.relative_to(d))
                rows.append(r)
                job["done"] += 1
            parquet = 0
            if any(d.rglob("*.parquet")):
                try:
                    import training
                    parquet = training._trk().raw_count(str(d))[0]
                except Exception:                         # noqa: BLE001: counted when it can be
                    parquet = 0
            rep = _report(name, d, files, rows, parquet)
            rep["signature"] = sig
            cache.mkdir(parents=True, exist_ok=True)
            tmp = cache / (name + ".json.part")
            tmp.write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, p)
            SEEN.pop(name, None)                          # the next look walks the folder again and finds the report fresh
            job.update(status="done", ended=time.time())
        except Exception as e:                            # noqa: BLE001: said in the job, never lost
            job.update(status="failed", error=str(e)[:300], ended=time.time())
    threading.Thread(target=work, daemon=True, name="train-doctor").start()
    return dict(job, name=name)
