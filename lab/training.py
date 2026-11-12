"""HERESY 1063: LoRA training for YuE2, the lab's side (Viktor, 01.10.2026). Imported by lab.py.

The trainer is the Studio's own (lab/trainer, ported line by line from Ostris' AI-Toolkit, MIT; HERESY 1083–1086, score
mode 1420, the separation 1422): one LoRA over both experts, the NAR flow loss always, the AR next-token loss when
ar_loss_weight > 0, anchored to the base model by ar_kl_weight (the AR learns the training songs by heart on a small set: its
notes). AI-Toolkit itself left the Studio on 13.10.2026 (HERESY 1422), once all it trained was here. The lab prepares,
starts, watches and collects:

  datasets/raw/NAME/        the raw material, as it came (WAV, FLAC, MP3, with or without .txt)
  datasets/prepared/NAME/   48 kHz stereo WAV + one caption .txt each (AI-Toolkit's layout, kept):
                            the style line, then [Lyrics] and the lyrics (its parse_caption)
  training/RUN/             config.json, train.log, the trainer's output (checkpoints, loss_log.db)
  loras/RUN/                the finished LoRA, where the engine finds it

The weights it trains on are Comfy-Org's repack of YuE2 (the tokenizer embedded), in models/comfy/
(heresy/fetch-heresy.sh --trainer); the semantic head is the realaudio tokenizer in
models/engine/tokenizers/yue2-mothersuperior-realaudio-tokenizer-v4/. A run takes a GPU of its own for hours, so
it does not hold the lab's heavy lock (Whisper and the stems go on beside it).
"""
import json, math, os, re, shutil, signal, sqlite3, subprocess, sys, threading, time
from pathlib import Path

import paths as studio_paths       # HERESY 2330: where the weights live (not «paths»: paths(kit) below is this file's own)

AUDIO = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
RUNS = {}            # run name -> what its watcher knows: status, step, steps, loss, log tail, VRAM peak
LOCK = threading.Lock()
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


def paths(kit):
    return {"raw": kit / "datasets" / "raw", "prepared": kit / "datasets" / "prepared", "runs": kit / "training",
            "loras": kit / "loras", "models": studio_paths.at(studio_paths.COMFY, kit),
            "head": studio_paths.at(studio_paths.ENGINE_TOKENIZERS, kit) / "yue2-mothersuperior-realaudio-tokenizer-v4",
            "merges": studio_paths.at(studio_paths.ENGINE_FINETUNES, kit)}                       # HERESY 2112: a merge's own folder, its trainer file beside its GGUFs


def _seconds(p):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                             capture_output=True, text=True, timeout=30).stdout.strip()
        return round(float(out), 1)
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def _trk():
    """HERESY 1626: lab/trainer/tracks.py, loaded by its path (the trainer's folder is not put on the lab's own path: its modules would shadow)."""
    m = sys.modules.get("ruach_tracks")
    if m is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location("ruach_tracks", str(Path(__file__).resolve().parent / "trainer" / "tracks.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        sys.modules["ruach_tracks"] = m
    return m


def _parquet_ref(ref):
    """SHARD.parquet#ROW: a row of a raw folder's parquet shard (HERESY 1626)."""
    head, _, row = str(ref).rpartition("#")
    return head.endswith(".parquet") and row.isdigit()


def _safe_dir(base, name):
    d = (base / name).resolve()
    if base.resolve() not in d.parents or not d.is_dir():
        # HERESY 1623 (Viktor 20.10.2026: the datasets moved to the Patriot, each linked in its place): a link standing in its own place
        # is the set of that name, wherever it points; a name that climbs out of its parent is refused as before
        link = base / name
        if link.is_symlink() and link.parent.resolve() == base.resolve() and link.is_dir():
            return link
        raise FileNotFoundError(f"no such dataset: {name}")
    return d


def _voice(d):
    """HERESY 1169: the voice measured on a raw folder (voice_kind.py keeps it beside the songs), or None."""
    try:
        return json.loads((d / "voice-kind.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# HERESY 2034: a raw folder's count (its tracks, bytes, captions, parquet rows) kept while neither its own time nor its subfolders' change,
# and at most RAW_TTL seconds: walking 95 folders whole took 15–25 s at each of the Trainer's calls (every 5 s while a run trains)
RAW_COUNTS = {}
RAW_TTL = 600


def _raw_sig(d):
    try:
        sig = [d.stat().st_mtime_ns]
        with os.scandir(d) as it:
            sig += sorted(e.stat().st_mtime_ns for e in it if e.is_dir())
        return tuple(sig)
    except OSError:
        return None


def _raw_count(d):
    sig, hit = _raw_sig(d), RAW_COUNTS.get(str(d))
    if sig is not None and hit and hit[0] == sig and time.time() - hit[1] < RAW_TTL:
        return hit[2]
    files = [f for f in d.rglob("*") if f.suffix.lower() in AUDIO]
    rows, rbytes = _trk().raw_count(str(d)) if any(d.rglob("*.parquet")) else (0, 0)   # HERESY 1626: a dataset's parquet shards, a row a track
    out = {"tracks": len(files) + rows, "bytes": sum(f.stat().st_size for f in files) + rbytes,
           "captions": sum(1 for f in files if f.with_suffix(".txt").is_file()), "parquet_rows": rows}
    if sig is not None:
        RAW_COUNTS[str(d)] = (sig, time.time(), out)
    return out


def datasets(kit):
    """The raw folders and the prepared sets, with what the trainer needs to know."""
    P = paths(kit)
    raw = []
    for d in sorted(P["raw"].iterdir()) if P["raw"].is_dir() else []:
        if d.is_dir():
            raw.append(dict({"name": d.name, "voice": _voice(d)}, **_raw_count(d)))
    prepared = []
    for d in sorted(P["prepared"].iterdir()) if P["prepared"].is_dir() else []:
        man = d / "dataset.json"
        if man.is_file():
            m = json.load(open(man, encoding="utf-8"))
            prepared.append({"name": d.name, "tracks": len(m.get("tracks", [])), "from": m.get("from"), "made": m.get("made"),
                             "seconds": round(sum(t.get("seconds") or 0 for t in m.get("tracks", []))),
                             "sheets_by": set_transcriber(d)})   # HERESY 2359: the transcriber whose sheets the set holds, "" for none yet
    # HERESY 1086: what the Studio's own trainer needs, each said by name (heresy/fetch-heresy.sh --trainer fetches it)
    own = {q: (P["models"] / "checkpoints" / f).is_file() for q, f in OWN_CKPT.items()}
    own.update(mert=(studio_paths.at(studio_paths.MISC, kit) / "MERT-v2-FullSong" / "model.safetensors").is_file(),
               head=(P["head"] / "tokenizer_head_joint_v4.pt").is_file())
    return {"raw": raw, "prepared": prepared, "own": own,
            "head": P["head"].is_dir(), "runs": runs(kit)["runs"], "gpus": gpus(), "engines": plugin_engines(kit)}   # HERESY 2321


# ---- HERESY 2359 (Viktor 11.11.2026: «Захерачим три режима SheetSage2 для FULL и Instrumental?»; the lead's advice he took: a set keeps the
# transcriber its sheets were written by, a new set gets SheetSage2 with bf16 angles): who wrote a set's sheets, read from their names
# (lab/trainer/cache.py: NNN_ruach[.VARIANT].COT[.bf16|.refined].abc), the most files deciding; a directory read once until it changes
TRANSCRIBERS = ("sheetsage2", "sheetsage2-bf16", "refined")
NEW_SET_TRANSCRIBER = "sheetsage2-bf16"
_SHEETS_BY = {}


def set_transcriber(set_dir):
    cache = Path(set_dir) / "_ruach_cache"
    try:
        stamp = cache.stat().st_mtime_ns
    except OSError:
        return ""
    if _SHEETS_BY.get(str(cache), (None,))[0] == stamp:
        return _SHEETS_BY[str(cache)][1]
    n = {t: 0 for t in TRANSCRIBERS}
    try:
        with os.scandir(cache) as it:
            for e in it:
                name = e.name
                if not name.endswith(".abc") or "_ruach." not in name:
                    continue
                if name.endswith((".full.refined.abc", ".melody.refined.abc")):
                    n["refined"] += 1
                elif name.endswith((".full.bf16.abc", ".melody.bf16.abc")):
                    n["sheetsage2-bf16"] += 1
                elif name.endswith((".full.abc", ".melody.abc")):
                    n["sheetsage2"] += 1
    except OSError:
        return ""
    best = max(TRANSCRIBERS, key=lambda t: n[t]) if any(n.values()) else ""
    _SHEETS_BY[str(cache)] = (stamp, best)
    return best


# ---- HERESY 2321 (Viktor 10.11.2026: «Тренер должен уметь прямо из Студии работать с этими весами, и все LoRA адаптеры»): a trainer from a plugin.
# A plugin (user/plugins/NAME/plugin.json, plugins.py) may bring trainers of its own: "trainers": [{"id", "script"}]. The script answers three
# words, a JSON object on its stdin and one line of JSON as the last it prints ({"error": why} refuses):
#   describe {kit}                    → {label, say, fields: [plugins.py's params], cards, bases: [{id, label, path, overlay?}], confirm?}
#   plan {kit, run, dir, dataset, spec} → {cmd: [argv], env: {}, cards, need_mb, steps, per_epoch, epochs, save_every, step, options: {its fields},
#                                         facts: [[what, said]], stop_file?, stop_grace_s?, kind?}
# The lab starts cmd in the run's own unit (ruach-train-RUN, as its own runs), on the cards it picks among those given to training, and watches
# what the trainer writes where the room reads its own runs: train.log, output/RUN/loss_log.db, output/RUN/val.json and the saves numbered
# output/RUN/RUN_<step>.safetensors. Pause and Stop put stop_file in the run's folder (when said; else SIGINT) and wait stop_grace_s before a
# hard stop. A plugin's run makes weights of its own, not adapters: nothing of it goes into loras/. Its bases are offered to the Studio's own
# trainer too (a LoRA on them): "plugin:TRAINER:BASE". Without the folder there is none, and the Trainer offers the Studio's own trainer alone.
PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
DESCRIBED = {}                                        # trainer id -> (the script's mtime, its answer, when asked)


def plugin_trainers(kit):
    """{id: {id, plugin, folder, script, python}} of the user's plugins' trainers; a broken plugin.json is passed over."""
    out = {}
    root = kit / "user" / "plugins"
    for spec in sorted(root.glob("*/plugin.json")) if root.is_dir() else []:
        try:
            raw = json.load(open(spec, encoding="utf-8"))
            folder = spec.parent.resolve()
            py = str(raw.get("python") or "")
            py = (folder / py) if py and not Path(py).is_absolute() else Path(py) if py else kit / ".venv" / "bin" / "python"
            for t in raw.get("trainers") or []:
                tid = str((t or {}).get("id") or "")
                script = (folder / str(t.get("script") or "")).resolve()
                if PLUGIN_ID.match(tid) and tid != "ruach" and tid not in out and script.is_file() and folder in script.parents:
                    out[tid] = {"id": tid, "plugin": str(raw.get("id") or folder.name), "folder": str(folder), "script": str(script), "python": str(py)}
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return out


def _plugin_call(t, verb, payload, timeout=60):
    """One word to a plugin's trainer; its last line of JSON. Its refusal ({"error"}) a ValueError, its failure a RuntimeError, each said."""
    try:
        r = subprocess.run([t["python"], t["script"], verb], input=json.dumps(payload), capture_output=True, text=True, timeout=timeout, cwd=t["folder"])
    except (OSError, subprocess.SubprocessError) as e:
        raise RuntimeError(f"the trainer {t['id']} could not be asked to {verb}: {e}")
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    try:
        out = json.loads(lines[-1]) if lines else None
    except ValueError:
        out = None
    if not isinstance(out, dict):
        why = (r.stderr.strip().splitlines() or ["it printed nothing"])[-1]
        raise RuntimeError(f"the trainer {t['id']} failed to {verb} (exit {r.returncode}): {why[:400]}")
    if out.get("error"):
        raise ValueError(str(out["error"])[:600])
    return out


def plugin_engines(kit):
    """What the Trainer offers of each plugin trainer (a minute's cache: its bases grow as its runs save); one that cannot say is listed with why."""
    out = []
    for tid, t in plugin_trainers(kit).items():
        try:
            stamp = os.stat(t["script"]).st_mtime_ns
        except OSError:
            continue
        hit = DESCRIBED.get(tid)
        if hit and hit[0] == stamp and time.time() - hit[2] < 60:
            d = hit[1]
        else:
            try:
                d = _plugin_call(t, "describe", {"kit": str(kit)})
            except (RuntimeError, ValueError) as e:
                d = {"error": str(e)}
            DESCRIBED[tid] = (stamp, d, time.time())
        out.append({"id": tid, "label": str(d.get("label") or tid), **{k: d.get(k) for k in ("say", "fields", "cards", "bases", "confirm", "error")}})
    return out


def plugin_base(kit, ref):
    """A base a plugin's trainer offers ("plugin:TRAINER:BASE"): {id, label, path, overlay?}; refused aloud when it is not offered now."""
    parts = str(ref).split(":", 2)
    if len(parts) != 3 or parts[0] != "plugin":
        raise ValueError(f"not a plugin's base: {ref}")
    for e in plugin_engines(kit):
        if e["id"] == parts[1]:
            for b in e.get("bases") or []:
                if str(b.get("id")) == parts[2] and Path(str(b.get("path") or "")).is_file():
                    if b.get("overlay") and not Path(str(b["overlay"])).is_file():
                        raise FileNotFoundError(f"{ref}: the save laid over it is gone ({b['overlay']})")
                    return b
            raise FileNotFoundError(f"the trainer {parts[1]} does not offer the base {parts[2]} now")
    raise FileNotFoundError(f"no trainer {parts[1]} among the plugins")


def gpus():
    """HERESY 1076: the cards, their memory and what is free now, for the trainer's VRAM gate. A failure of
    nvidia-smi is said, not shown as "no GPU"."""
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=index,name,memory.total,memory.free", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=20).stdout
        return [{"index": int(i), "name": n.strip(), "total_mb": int(t), "free_mb": int(f)}
                for i, n, t, f in (l.split(",") for l in out.strip().splitlines())]
    except (OSError, ValueError, subprocess.SubprocessError) as e:
        return {"error": f"nvidia-smi did not answer: {e}"}


SECTION = re.compile(r"^\s*\[[^\]]+\]\s*$")
CUE = re.compile(r"^\s*\([^()]*\)\s*$")


# the sections YuE2 knows; any other [Tag] is weight the model does not need (Viktor)
KNOWN = {"intro": "Intro", "verse": "Verse", "pre-chorus": "Pre-Chorus", "prechorus": "Pre-Chorus", "chorus": "Chorus",
         "bridge": "Bridge", "interlude": "Interlude", "inst": "Inst", "instrumental": "Inst", "outro": "Outro"}
INLINE_CUE = re.compile(r"\s*\([^()]*\)")


def clean_lyrics(text):
    """A SUNO-style text made a training caption's lyrics: whole-line (cues) and (cues) inside lines go,
    [Tags] YuE2 does not know go, the head before the first section goes to hints (style words, not lyrics); the
    sections YuE2 knows and the words stay. ע inside a Russian word stays (HERESY 1168, Viktor 07.10.2026: «Оставляй ע как
    есть»: YuE2 sings it as a soft о/а, as he writes it; it used to become о, when YuE2 was thought to stumble on it)."""
    lines, hints, started = [], [], False
    for line in str(text or "").splitlines():
        if SECTION.match(line) or line.strip().startswith("["):
            started = True
            for tag in re.findall(r"\[([^\]]+)\]", line):
                key = re.split(r"\s+-\s+|:", tag.strip().lower())[0].strip()
                key = re.sub(r"\s*\d+$", "", key)
                if "instrumental" in key:                     # [Instrumental Break - 30s] and the like
                    key = "inst"
                elif key.endswith(("intro", "outro", "verse", "chorus", "bridge")) and key.split()[-1] in KNOWN:
                    key = key.split()[-1]                     # [Extended Outro] → [Outro]
                if key in KNOWN and (not lines or lines[-1] != "[" + KNOWN[key] + "]"):
                    lines.append("[" + KNOWN[key] + "]")
            rest = re.sub(r"\[[^\]]*\]", "", line).strip()
            if rest and not CUE.match(rest):
                lines.append(INLINE_CUE.sub("", rest).strip())
        elif not started:
            if line.strip():
                hints.append(line.strip().strip("()"))
        elif CUE.match(line):
            continue
        else:
            line = INLINE_CUE.sub("", line).rstrip()
            if line.strip() or not lines or lines[-1]:
                lines.append(line)
    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    out = re.sub(r"(\[[^\]]+\])\s*\n(?=\[)", "", out)          # a section left empty by its cues goes
    return out, hints


def _lyrics_for(f, texts):
    """The .txt beside a track, else the longest .txt whose name begins the track's: one text per version."""
    own = f.with_suffix(".txt")
    if own.is_file():
        return own
    best = None
    for t in texts:
        if f.stem.casefold().startswith(t.stem.casefold()) and (best is None or len(t.stem) > len(best.stem)):
            best = t
    return best


def scan(kit, name):
    """One raw folder, track by track: length, its text (beside it or by version name), cleaned."""
    P = paths(kit)
    d = _safe_dir(P["raw"], name)
    texts = [t for t in d.rglob("*.txt") if not t.name.endswith(".style.txt")]
    rows = []
    for f in sorted(x for x in d.rglob("*") if x.suffix.lower() in AUDIO):
        t = _lyrics_for(f, texts)
        lyrics, hints = clean_lyrics(t.read_text(encoding="utf-8", errors="replace")) if t else ("", [])
        own = f.with_suffix(".style.txt")              # HERESY 1073: a track's own style beside it (its own labels)
        rows.append({"file": str(f.relative_to(d)), "seconds": _seconds(f), "bytes": f.stat().st_size,
                     "lyrics": lyrics[:12000], "lyrics_from": str(t.relative_to(d)) if t else "", "hints": hints[:12],
                     "style": " ".join(own.read_text(encoding="utf-8").split()) if own.is_file() else ""})
    if any(d.rglob("*.parquet")):                       # HERESY 1626: a dataset's parquet shards: a row a track, the first 5000 shown
        for r in _trk().raw_rows(str(d)):
            lyrics, hints = clean_lyrics(r["lyrics"]) if r["lyrics"] else ("", [])
            rows.append({"file": r["file"], "seconds": r["seconds"], "bytes": r["bytes"], "lyrics": lyrics[:12000],
                         "lyrics_from": "parquet" if r["lyrics"] else "", "hints": hints[:12], "style": r["style"], "title": r["title"]})
    return {"name": name, "tracks": rows}


def caption(style, lyrics):
    """AI-Toolkit's native YuE2 caption: the style, then [Lyrics] and the lyrics (empty for instrumentals)."""
    style = " ".join(str(style or "").split())
    lyrics = str(lyrics or "").strip()
    return style + ("\n[Lyrics]\n" + lyrics if lyrics else "") + "\n"


PREP = {}            # dataset name -> its preparation job


def prepare(kit, spec):
    """spec: {from, name, style, tracks: [{file, include, style, lyrics}]}. Writes datasets/prepared/NAME/."""
    P = paths(kit)
    src = _safe_dir(P["raw"], str(spec.get("from", "")))
    name = str(spec.get("name") or src.name)
    if not NAME_RE.match(name):
        raise ValueError("a dataset name of letters, digits, _ . - (no spaces), up to 64")
    tracks = [t for t in spec.get("tracks") or [] if t.get("include", True)]
    if len(tracks) < 2:
        raise ValueError("at least two tracks")
    with LOCK:
        job = PREP.get(name)
        if job and job["status"] == "running":
            return dict(job, name=name)
        job = {"status": "running", "done": 0, "total": len(tracks), "started": time.time(), "kind": "prepare"}
        PREP[name] = job

    def work():
        try:
            import no_train                           # HERESY 2241: a file marked never for training (an engine's terms: the Reader's speech), refused by name
            marked = [t["file"] for t in tracks if not _parquet_ref(t["file"]) and no_train.of_file(src / t["file"])]
            if marked:
                raise ValueError(f"{len(marked)} of its tracks are marked never for training: " + ", ".join(marked[:5]) + (" …" if len(marked) > 5 else ""))
            out = P["prepared"] / name
            tmp = P["prepared"] / (name + ".part")
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True)
            rows = []
            for i, t in enumerate(tracks):
                stem = f"{i + 1:03d}"                     # short, ASCII names: the trainer's caches key by them
                if _parquet_ref(t["file"]):               # HERESY 1626: a row of a parquet shard, its audio out for ffmpeg
                    b, was = _trk().raw_audio(str(src), t["file"])
                    f = tmp / (stem + ".source" + (Path(was).suffix.lower() or ".bin"))
                    f.write_bytes(b)
                else:
                    f = (src / t["file"]).resolve()
                    if src.resolve() not in f.parents or not f.is_file():   # HERESY 1626: a raw folder linked to the Patriot resolves there
                        raise FileNotFoundError(t["file"])
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le",
                                str(tmp / (stem + ".wav"))], check=True, timeout=600)
                if _parquet_ref(t["file"]):
                    f.unlink()
                text = caption(t.get("style") or spec.get("style", ""), t.get("lyrics", ""))
                (tmp / (stem + ".txt")).write_text(text, encoding="utf-8")
                rows.append({"stem": stem, "file": t["file"], "seconds": _seconds(tmp / (stem + ".wav")),
                             "lyrics": bool(str(t.get("lyrics") or "").strip())})
                job["done"] = i + 1
            json.dump({"from": src.name, "style": spec.get("style", ""), "tracks": rows, "made": time.strftime("%Y-%m-%d %H:%M")},
                      open(tmp / "dataset.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            if out.exists():                              # a set made again: the old one steps aside, whole
                shutil.move(str(out), str(P["prepared"] / f".{name}.{time.strftime('%Y%m%d-%H%M%S')}.old"))
            tmp.rename(out)
            job.update(status="done", ended=time.time())
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


def pack(kit, spec):
    """HERESY 1626: a prepared set's WAVs packed into parquet (FLAC 24-bit, the same samples, read back alike before the WAVs go), or back
    ({name, undo}). A set that is a link (moved to another disk, as the Patriot) is not packed: that would write there."""
    P = paths(kit)
    name = str(spec.get("name", ""))
    d = _safe_dir(P["prepared"], name)
    if (P["prepared"] / name).is_symlink():
        raise ValueError("this set lives on another disk (a link in its place): packing would write there")
    undo = bool(spec.get("undo"))
    with LOCK:
        job = PREP.get(name)
        if job and job["status"] == "running":
            return dict(job, name=name)
        job = {"status": "running", "done": 0, "total": 0, "started": time.time(), "kind": "unpack" if undo else "pack"}
        PREP[name] = job

    def work():
        try:
            T = _trk()
            said = []
            out = (T.unpack if undo else T.pack)(str(d), say=said.append)
            job.update(status="done", ended=time.time(), result=out, said=said[-1] if said else "")
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


def prepare_status(name):
    job = PREP.get(name)
    return dict(job, name=name) if job else {"status": "none", "name": name}


# ---- the run
DEFAULTS = {"steps": 1500, "rank": 32, "rank_ar": 0, "rank_nar": 0, "lr": 1e-4, "save_epochs": 1.0, "cot": "off", "transcriber": "sheetsage2", "ar_loss_weight": 0.5,
            "ar_kl_weight": 0.2, "ar_lr_multiplier": 0.5, "train_window_frames": 1500, "do_separation": False,
            "quant": "bf16", "engine": "ruach",
            "val_fraction": 0.0, "patience": 0,              # HERESY 1497: held-out tracks and the early stop (train.py)
            "nar_phase_epochs": 12,                          # HERESY 1622: at the plateau the sound half on alone, up to 12 epochs
            "ema_epochs": 1.0, "ar_max_tokens": 0,           # HERESY 1662: the moving average's span and the AR's tokens, as train.py's defaults
            "lr_tail_epochs": 0.0, "lr_tail_floor": 0.0,     # HERESY 1752: the rate's fade over the last epochs, down to floor × itself
            "vram_meter": False, "ar_cap_tokens": 0, "long_off_card0": False,   # HERESY 1832: 1815's meter and guard, off as train.py's own
            "val_groups": {}, "stop_ce_groups": [], "stop_ce_rises": 2, "stop_kl_max": 0.0}   # HERESY 1944: held-out by group, the stop-crane (train.py)
# HERESY 1085: engine "ruach" is the Studio's own trainer (lab/trainer, ported from Ostris' MIT code, exact on
# parity: lab/trainer/PARITY.md), bf16 weights (Viktor: "не квантуй ничего"), Direct, score mode (1420), separated (1422).
# HERESY 1422: the only one: AI-Toolkit, kept as the reference till then, left the Studio.
OWN_CKPT = {"bf16": "yue2_3b_bf16.safetensors", "int8": "yue2_3b_int8_convrot.safetensors"}
BASE_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,160}\.safetensors$")
# HERESY 2112 (Viktor 27.10.2026: «адаптеры голосовые нужно тюнить/тренировать на тех весах YuE2, на которых собираешься их использовать»): the Studio's
# default since 2.0.6, RS-TW 2.0x0.75, a run's base too. A merge named by itself (RS-TW-2.0x0.75) is its trainer file, yue2_3b_<merge>_bf16.safetensors,
# as the fold writes it beside the merge's GGUFs in models/<merge>/ (comfy-made.json there says its size and sha256)
MERGE_RE = re.compile(r"^RS-(?:FW|TW)-\d+(?:\.\d+)?x\d+(?:\.\d+)?$")
FOLDED_RE = re.compile(r"^yue2_3b_(RS-(?:FW|TW)-\d+(?:\.\d+)?x\d+(?:\.\d+)?)_bf16\.safetensors$")


def base_checkpoint(P, spec):
    """HERESY 1792: the weights a run trains on, (path, quant, base): «base», a file of models/comfy/checkpoints/ named by itself (a merge
    folded into the trainer's own layout: heresy/MISC/claude-tc/finetune/fold_base.py), bf16; else the Studio's own by its quant, as before.
    HERESY 2112: or a merge by its name (RS-TW-2.0x0.75), or its trainer file where the fold left it, models/<merge>/; the base said is the file's name"""
    base = str(spec.get("base") or "").strip()
    if base.startswith("plugin:"):                     # HERESY 2321: a base a plugin's trainer offers (its file; train() lays its overlay over it)
        b = plugin_base(P["runs"].parent, base)
        return Path(b["path"]), "bf16", base
    if base:
        if MERGE_RE.match(base):
            base = f"yue2_3b_{base}_bf16.safetensors"
        if not BASE_RE.match(base) or ".." in base:
            raise ValueError("base: a .safetensors file name of " + studio_paths.COMFY + "/checkpoints/ or a merge's name (RS-TW-2.0x0.75), no folders")
        ckpt = P["models"] / "checkpoints" / base
        folded = FOLDED_RE.match(base)
        if not ckpt.is_file() and folded and P.get("merges"):
            ckpt = P["merges"] / folded.group(1) / base
        if not ckpt.is_file():
            raise FileNotFoundError(f"{base} is not in {studio_paths.COMFY}/checkpoints/" + (f" nor in {studio_paths.ENGINE_FINETUNES}/{folded.group(1)}/" if folded else ""))
        return ckpt, "bf16", base
    quant = str(spec.get("quant") or "bf16")
    ckpt = P["models"] / "checkpoints" / OWN_CKPT.get(quant, OWN_CKPT["bf16"])
    if not ckpt.is_file():
        raise FileNotFoundError(f"{ckpt.name} is not in {studio_paths.COMFY}/checkpoints/")
    return ckpt, (quant if quant in OWN_CKPT else "bf16"), ""


CKPT_RE = re.compile(r"_(\d{6,})\.safetensors$")


SERIES = {}                                           # HERESY 1507: (path) -> ((size, mtime_ns), curves)


class _Restarting(Exception):
    """HERESY 1823: the step log's copy in short steps gave up on a writer faster than its steps."""


def _series(d, keep=400):
    """HERESY 1067: a run's step log (AI-Toolkit's loss_log.db) as curves for its card: flow loss, ar_ce,
    ar_kl, each averaged into at most `keep` points; with the wall time, the seconds a step."""
    dbs = sorted((d / "output").rglob("loss_log.db")) if (d / "output").is_dir() else []
    if not dbs:
        return {}
    # HERESY 1507: a run died of this read (16.10, his voice at step 35189: the trainer's commit waited 5 s on a lock the whole
    # log's query held). The log is copied into memory in short steps (the lock held milliseconds between them) and read
    # there; a log not changed since is not read again
    try:
        st = dbs[0].stat()
        stamp = (st.st_size, st.st_mtime_ns)
        for side in ("-wal", "-journal"):
            w = Path(str(dbs[0]) + side)
            if w.exists():
                ws = w.stat()
                stamp += (ws.st_size, ws.st_mtime_ns)
    except OSError as e:
        return {"error": f"the step log could not be read: {e}"}
    hit = SERIES.get(str(dbs[0]))
    if hit and hit[0] == stamp:
        return hit[1]
    try:
        src = sqlite3.connect(f"file:{dbs[0]}?mode=ro", uri=True, timeout=5)
        con = sqlite3.connect(":memory:")
        t0 = time.monotonic()

        def slow(status, remaining, total):            # HERESY 1823: a commit during the copy starts it again; not for ever
            if time.monotonic() - t0 > 3.0:
                raise _Restarting()
        try:
            src.backup(con, pages=256, sleep=0.002, progress=slow)
        except _Restarting:                            # copied in one go: a read lock of milliseconds
            con.close()
            con = sqlite3.connect(":memory:")
            src.backup(con)
        src.close()
        rows = con.execute("SELECT step, key, value_real FROM metrics WHERE value_real IS NOT NULL AND key IN "
                           "('loss/loss', 'loss/ar_ce', 'loss/ar_kl', 'loss/flow') ORDER BY step").fetchall()
        wall = con.execute("SELECT MIN(step), MAX(step), MIN(wall_time), MAX(wall_time) FROM steps").fetchone()
        vram = (con.execute("SELECT key, step, value_real FROM metrics WHERE key LIKE 'vram/peak_gb_card%' AND value_real IS NOT NULL").fetchall()
                if (_meta(d).get("options") or {}).get("vram_meter") else [])   # HERESY 1832: only a run with the meter on
        con.close()
    except sqlite3.Error as e:
        return {"error": f"the step log could not be read: {e}"}      # said aloud: not "no steps"
    out = {}
    if not any(k == "loss/flow" for _, k, _ in rows):
        # HERESY 1090: AI-Toolkit logs the whole sum only; the sound half's own loss is what is left of it once
        # the music half's weighted part is taken off (the weights from the run's own options)
        o = (_meta(d).get("options") or {})
        wa, wk = float(o.get("ar_loss_weight") or 0), float(o.get("ar_kl_weight") or 0)
        by = {}
        for st, k, v in rows:
            by.setdefault(st, {})[k] = v
        rows = rows + [(st, "loss/flow", m["loss/loss"] - wa * m.get("loss/ar_ce", 0.0) - wk * m.get("loss/ar_kl", 0.0))
                       for st, m in sorted(by.items()) if "loss/loss" in m and (wa == 0 or "loss/ar_ce" in m)]
    for key in ("loss/loss", "loss/ar_ce", "loss/ar_kl", "loss/flow"):
        pts = [(st, v) for st, k, v in rows if k == key and math.isfinite(v)]
        if not pts:
            continue
        size = max(1, math.ceil(len(pts) / keep))
        curve = []
        for i in range(0, len(pts), size):
            chunk = pts[i:i + size]
            curve.append([chunk[-1][0], round(sum(v for _, v in chunk) / len(chunk), 5)])
        tail = [v for _, v in pts[-min(len(pts), 25):]]
        out[key.split("/")[1]] = {"curve": curve, "last": round(sum(tail) / len(tail), 4),
                                  "min": round(min(v for _, v in pts), 4), "first": round(pts[0][1], 4)}
    if wall and wall[1] and wall[1] > wall[0]:
        out["sec_per_step"] = round((wall[3] - wall[2]) / (wall[1] - wall[0]), 2)
    peaks = {}
    for k, st, v in vram:                              # HERESY 1832: each card's highest of the run (by its rank in the run), with its step
        r = k.rsplit("card", 1)[1]
        if r.isdigit() and math.isfinite(v) and v > peaks.get(r, (0.0, 0))[0]:
            peaks[r] = (round(v, 2), st)
    if peaks:
        out["vram_cards"] = {r: {"gb": g, "step": st} for r, (g, st) in sorted(peaks.items(), key=lambda x: int(x[0]))}
    SERIES[str(dbs[0])] = (stamp, out)
    if len(SERIES) > 64:
        SERIES.pop(next(iter(SERIES)))
    return out


def epoch_tag(epoch):
    """HERESY 1658: a save's name by its epoch: e001 for a whole one, e001.3 for a tenth past it"""
    e = round(float(epoch), 1)
    return f"e{int(e):03d}" if abs(e - round(e)) < 0.05 else f"e{int(e):03d}.{int(round((e - int(e)) * 10))}"


def checkpoints(kit, run, d=None):
    """The run's saved checkpoints, one per epoch (HERESY 1067), with the epoch each one closes."""
    P = paths(kit)
    d = d or _safe_dir(P["runs"], run)
    meta = json.load(open(d / "run.json", encoding="utf-8")) if (d / "run.json").is_file() else {}
    per = meta.get("tracks") or (meta.get("options") or {}).get("steps_per_epoch") or 0
    out = []
    files = sorted((d / "output").rglob("*.safetensors")) if (d / "output").is_dir() else []
    # HERESY 1167 (Viktor: «последний чекпоинт дублируется в списке. В каждой сессии»): the final file, no step in its name,
    # is the last epoch's twin: listed only when no numbered checkpoint has its step
    numbered = {int(m.group(1)) for m in (CKPT_RE.search(f.name) for f in files) if m}
    for f in files:
        m = CKPT_RE.search(f.name)
        step = int(m.group(1)) if m else meta.get("step")
        if not m and step in numbered:
            continue
        name = f"{run}-{epoch_tag(step / per)}.safetensors" if per and step else None   # HERESY 1658
        out.append({"file": str(f.relative_to(d)), "step": step, "epoch": round(step / per, 2) if per and step else None,
                    "bytes": f.stat().st_size, "saved": f.stat().st_mtime,
                    "lora": f"{run}/{name}" if name and (P["loras"] / run / name).is_file() else None})
    return out


def gone(kit, run, d=None, cks=None):
    """HERESY 1816 (Viktor 28.10.2026: «опознания исчезнувших чекпоинтов, чтобы они помечались в ранах как отсутствующие/удалённые»): the saves the run
    made that are not on disk any more: every save_every up to the step it reached, and the steps its held-out measures name, less the files there."""
    P = paths(kit)
    d = d or _safe_dir(P["runs"], run)
    try:
        meta = json.load(open(d / "run.json", encoding="utf-8")) if (d / "run.json").is_file() else {}
    except (OSError, ValueError):
        meta = {}
    o = meta.get("options") or {}
    every, reached = int(o.get("save_every") or 0), int(meta.get("step") or 0)
    per = meta.get("tracks") or o.get("steps_per_epoch") or 0
    want = set(range(every, reached + 1, every)) if every > 0 and reached >= every else set()
    try:   # HERESY 1973: a run that began from a save carried in (output/RUN/carried.json {"from", "step"}) made none before that step
        start = int(json.load(open(d / "output" / run / "carried.json", encoding="utf-8")).get("step") or 0)
        want = {s for s in want if s >= start}
    except (OSError, ValueError, AttributeError, TypeError):
        pass
    try:
        v = json.load(open(d / "output" / run / "val.json", encoding="utf-8"))
        want |= {e["step"] for e in v.get("history") or [] if isinstance(e, dict) and isinstance(e.get("step"), int)}
    except (OSError, ValueError, AttributeError):
        pass
    have = {c["step"] for c in (cks if cks is not None else checkpoints(kit, run, d))}
    return [{"step": s, "epoch": round(s / per, 2) if per else None} for s in sorted(want - have)]


def publish(kit, run, file):
    """One checkpoint into loras/RUN/ as RUN-eNNN.safetensors, where Create finds it: a hard link (no
    second copy on disk), a copy where links cannot be made."""
    P = paths(kit)
    d = _safe_dir(P["runs"], run)
    if (d / "run.json").is_file() and _meta(d).get("no_adapter"):   # HERESY 2321: a plugin's run makes weights of its own, never an adapter
        raise ValueError(f"{run} saves weights of its own, not adapters: nothing of it goes into loras/")
    for c in checkpoints(kit, run, d):
        if c["file"] == file:
            if not c["epoch"]:
                raise ValueError("this checkpoint has no epoch to name it by")
            dest = P["loras"] / run
            dest.mkdir(parents=True, exist_ok=True)
            target = dest / f"{run}-{epoch_tag(c['epoch'])}.safetensors"   # HERESY 1658
            if not target.exists():
                try:
                    os.link(d / file, target)
                except OSError:
                    shutil.copy2(d / file, target)
            return {"name": run, "lora": f"{run}/{target.name}"}
    raise FileNotFoundError(f"no checkpoint {file} in {run}")


def publish_best(kit, run, d=None):
    """HERESY 1521: the held-out's best checkpoint (output/…/val.json, 1497) into loras/ beside the last: the early stop runs patience
    saves past the best, so the last is not it. None when the run measured nothing held out or the best's file is not there."""
    d = d or _safe_dir(paths(kit)["runs"], run)
    for v in sorted((d / "output").rglob("val.json")) if (d / "output").is_dir() else []:
        try:
            step = int((json.load(open(v, encoding="utf-8")).get("best") or {}).get("step") or 0)
        except (OSError, ValueError, TypeError, AttributeError):
            continue
        hit = [c for c in checkpoints(kit, run, d) if c.get("epoch") and c["step"] == step]
        if hit:
            return publish(kit, run, hit[0]["file"])["lora"]
    return None


# ---- HERESY 1090 (Viktor, 02.10.2026): a run kept, archived, or put in the trash; an epoch taken back out of loras/
def archive(kit, run, on):
    d = _safe_dir(paths(kit)["runs"], run)
    meta = _meta(d)
    meta["archived"] = bool(on)
    _save_meta(d, meta)
    return {"name": run, "archived": bool(on)}


def run_trash(kit):
    return kit / "trash" / "training"


def _bytes(folder):
    """What a folder holds on disk: a hard-linked file (an epoch in loras/ and its checkpoint) counted once."""
    seen, total = set(), 0
    for x in folder.rglob("*"):
        if x.is_file():
            st = x.stat()
            if (st.st_dev, st.st_ino) not in seen:
                seen.add((st.st_dev, st.st_ino))
                total += st.st_size
    return total


def delete_run(kit, run, with_loras):
    """The run's folder into trash/training/RUN@STAMP (and its adapters in loras/RUN/ with it, when asked);
    a running one must be stopped first. Nothing is deleted here: the trash keeps it until emptied."""
    P = paths(kit)
    if _unit_state(run) == "active":
        raise ValueError(f"{run} is running: stop it first")
    d = _safe_dir(P["runs"], run)
    if protected(d):                                       # HERESY 1817
        raise ValueError(f"{run} is protected: ⋯ → Unprotect first")
    dest = run_trash(kit) / f"{run}@{time.strftime('%Y%m%d-%H%M%S')}"
    dest.mkdir(parents=True)
    shutil.move(str(d), str(dest / "run"))
    moved = []
    if with_loras and (P["loras"] / run).is_dir():
        moved = sorted(f.name for f in (P["loras"] / run).glob("*.safetensors"))
        shutil.move(str(P["loras"] / run), str(dest / "loras"))
    (dest / "trashed.json").write_text(json.dumps({"run": run, "when": time.time(), "loras": moved}, indent=1), encoding="utf-8")
    RUNS.pop(run, None)
    return {"name": run, "trash": dest.name, "loras": moved}


# ---- HERESY 1817 (Viktor 28.10.2026: «…опцию выбора чекпоинтов для удаления, но не скопом… FW вообще не трогаем, а защищаем такие раны тренинга»): a run
# protected (a mark beside it, not in run.json, which a live run writes) gives neither its saves nor itself to deletion; the saves of an unprotected,
# stopped run go one by one, as chosen, and their twins in loras/ only when asked
PROTECT = ".protected"


def protected(d):
    return (Path(d) / PROTECT).is_file()


def protect(kit, run, on):
    d = _safe_dir(paths(kit)["runs"], run)
    m = d / PROTECT
    if on:
        m.write_text(time.strftime("%F %T") + "\n", encoding="utf-8")
    elif m.exists():
        m.unlink()
    return {"name": run, "protected": bool(on)}


def delete_saves(kit, run, files, with_loras):
    """The saves chosen, deleted for good (the space is what the user asked for); their twins in loras/ (the same file, a hard link) with them only
    when asked, else they stay usable in the Creator and the space stays taken."""
    P = paths(kit)
    d = _safe_dir(P["runs"], run)
    if protected(d):
        raise ValueError(f"{run} is protected: ⋯ → Unprotect first")
    if _unit_state(run) == "active":
        raise ValueError(f"{run} is running: stop it first")
    have = {c["file"] for c in checkpoints(kit, run, d)}
    picked = sorted(set(str(f) for f in files or []))
    if not picked or any(f not in have for f in picked):
        raise ValueError("choose saves of this run")
    inos = {}
    for f in picked:
        st = (d / f).stat()
        inos[(st.st_dev, st.st_ino)] = f
    twins = []
    ld = P["loras"] / run
    for q in sorted(ld.glob("*.safetensors")) if ld.is_dir() else []:
        st = q.stat()
        if (st.st_dev, st.st_ino) in inos:
            twins.append(q)
    freed = 0
    for f in picked:
        st = (d / f).stat()
        (d / f).unlink()
        if st.st_nlink == 1:
            freed += st.st_size
    out = []
    for q in twins:
        if with_loras:
            st = q.stat()
            q.unlink()
            if st.st_nlink == 1:
                freed += st.st_size
            out.append(q.name)
    return {"name": run, "deleted": picked, "loras_deleted": out, "loras_kept": [q.name for q in twins if q.name not in out], "freed": freed}


def trashed_runs(kit):
    out = []
    base = run_trash(kit)
    for t in sorted(base.iterdir(), reverse=True) if base.is_dir() else []:
        f = t / "trashed.json"
        if not f.is_file():
            continue
        info = json.load(open(f, encoding="utf-8"))
        meta = _meta(t / "run") if (t / "run").is_dir() else {}
        size = _bytes(t)
        out.append({"id": t.name, "name": info.get("run"), "trashed": info.get("when"), "loras": info.get("loras") or [],
                    "bytes": size, "kind": meta.get("kind"), "dataset": meta.get("dataset"), "steps": meta.get("steps"),
                    "step": meta.get("step"), "started": meta.get("started"), "options": meta.get("options")})
    return {"trash": out}


def restore_run(kit, tid):
    P = paths(kit)
    t = run_trash(kit) / Path(tid).name
    if not (t / "trashed.json").is_file():
        raise FileNotFoundError(f"nothing in the trash as {tid}")
    run = json.load(open(t / "trashed.json", encoding="utf-8"))["run"]
    if (P["runs"] / run).exists():
        raise ValueError(f"a run named {run} is there again: rename or delete it first")
    shutil.move(str(t / "run"), str(P["runs"] / run))
    back = []
    if (t / "loras").is_dir() and not (P["loras"] / run).exists():
        shutil.move(str(t / "loras"), str(P["loras"] / run))
        back = sorted(f.name for f in (P["loras"] / run).glob("*.safetensors"))
    shutil.rmtree(t, ignore_errors=True)
    return {"name": run, "loras": back}


def purge_run(kit, tid):
    """Gone for good: asked twice on the page, never done by the Studio on its own."""
    t = run_trash(kit) / Path(tid).name
    if not (t / "trashed.json").is_file():
        raise FileNotFoundError(f"nothing in the trash as {tid}")
    size = _bytes(t)
    shutil.rmtree(t)
    return {"id": t.name, "freed": size}


def unpublish(kit, run, lora):
    """One adapter out of loras/RUN/: only while its checkpoint still lives in the run (the two are the same
    file, a hard link; or a copy of it), so nothing is lost and a click puts it back."""
    P = paths(kit)
    f = P["loras"] / run / Path(lora).name
    if not f.is_file():
        raise FileNotFoundError(f"{lora} is not in loras/{run}/")
    d = _safe_dir(P["runs"], run)
    if not any((d / c["file"]).is_file() and c.get("lora") == f"{run}/{f.name}" for c in checkpoints(kit, run, d)) and f.name != f"{run}.safetensors":
        raise ValueError(f"{f.name} has no checkpoint left in the run: it is the only copy, and stays")
    f.unlink()
    if not any((P["loras"] / run).iterdir()):
        (P["loras"] / run).rmdir()
    return {"name": run, "removed": f.name}


def delete_loras(kit, ids, dry=True):
    """HERESY 1496 (Viktor 16.10.2026: «те адаптеры, которые сторонние… в попапе согласие на безвозвратное удаление из loras/»): adapter
    files out of loras/ for good, on the page's second word: a dry run first says what goes (the files, a folder left with no adapter in
    it, the bytes). Not into a trash. A file of one's own run is a hard link of its checkpoint: the checkpoint stays in the run."""
    root = paths(kit)["loras"].resolve()
    files = []
    for i in ids:
        f = (root / str(i)).resolve()
        if root not in f.parents or f.suffix != ".safetensors" or not f.is_file():
            raise ValueError(f"{i}: not an adapter file in loras/")
        if f not in files:
            files.append(f)
    gone, folders = set(files), []
    for f in files:                                   # a folder goes when no other adapter is left in it, up to loras/ itself
        d = f.parent
        while d != root and not any(x not in gone for x in d.rglob("*.safetensors")):
            folders.append(d)
            d = d.parent
    tops = [d for d in sorted(set(folders), key=lambda x: len(x.parts)) if not any(q in folders for q in d.parents)]
    loose = [f for f in files if not any(t in f.parents for t in tops)]
    size = sum(f.stat().st_size for f in loose) + sum(_bytes(t) for t in tops)
    plan = {"files": [str(f.relative_to(root)) for f in files], "folders": [str(t.relative_to(root)) for t in tops], "bytes": size, "deleted": False}
    if dry:
        return plan
    for f in loose:
        f.unlink()
    for t in tops:
        shutil.rmtree(t)
    return dict(plan, deleted=True)


def checkpoint_file(kit, run, file):
    """A checkpoint of the run as a file to download, named as it is called in loras/ (RUN-eNNN.safetensors)."""
    P = paths(kit)
    d = _safe_dir(P["runs"], run)
    for c in checkpoints(kit, run, d):
        if c["file"] == file:
            name = f"{run}-e{round(c['epoch']):03d}.safetensors" if c.get("epoch") else Path(file).name
            return d / file, name
    raise FileNotFoundError(f"no checkpoint {file} in {run}")


def runs(kit):
    """Every run, newest first, with what its card shows: options, outcome, curves, checkpoints."""
    P = paths(kit)
    out = []
    for d in sorted(P["runs"].iterdir(), reverse=True) if P["runs"].is_dir() else []:
        f = d / "run.json"
        if f.is_file():
            r = json.load(open(f, encoding="utf-8"))
            live = RUNS.get(d.name)
            if live:
                r.update({k: live.get(k) for k in ("status", "step", "steps", "loss", "ar_ce", "error", "lora", "vram_peak_mb")})
            r["series"] = _series(d)
            vj = d / "output" / d.name / "val.json"               # HERESY 1497: the held-out measures and the best of them
            if vj.is_file():
                try:
                    r["val"] = json.load(open(vj, encoding="utf-8"))
                except (OSError, ValueError):
                    r["val"] = {"error": "val.json unreadable"}
            r["checkpoints"] = checkpoints(kit, d.name, d)
            r["gone"] = gone(kit, d.name, d, r["checkpoints"])   # HERESY 1816
            r["protected"] = protected(d)                         # HERESY 1817
            if live and r.get("plugin"):                  # HERESY 2321: a plugin's run, from its own step log
                r.update({k: live.get(k) for k in ("elapsed_s", "eta_s", "sec_per_step")})
            elif live and live.get("tail"):               # HERESY 1090: the time it has run and has left, from tqdm's line
                m = ETA_RE.search(live["tail"][-1])
                if m:
                    r["elapsed_s"], r["eta_s"] = _hms(m.group(1)), _hms(m.group(2))
            r["loras"] = sorted(f.name for f in (P["loras"] / d.name).glob("*.safetensors")) if (P["loras"] / d.name).is_dir() else []
            out.append(r)
    out.sort(key=lambda r: r.get("started") or 0, reverse=True)
    return {"runs": out}


STEP_RE = re.compile(r"(\d+)/(\d+) \[")
ETA_RE = re.compile(r"\[((?:\d+:)?\d+:\d+)<((?:\d+:)?\d+:\d+)")


def _hms(t):
    s = 0
    for part in t.split(":"):
        s = s * 60 + int(part)
    return s
LOSS_RE = re.compile(r"loss: ([0-9.eE+-]+)")
DONE_RE = re.compile(r"done: (\d+) steps in ")          # HERESY 1649: the trainer's last line


# HERESY 1072 (02.10.2026): a run lives in a systemd unit of its own, ruach-train-RUN, not under the lab.
# The lab was its parent, and a restart of the lab (its cgroup killed whole) killed the run with it. The
# lab now only starts the unit and watches it: the log file, the step log, the GPU; when the lab starts
# again it finds the runs still going and watches them again; whoever sees a run end collects its LoRA.
def _unit(run):
    return "ruach-train-" + run


def _systemctl(*args):
    return subprocess.run(["systemctl", "--user", *args], capture_output=True, text=True, timeout=20)


def _unit_state(run):
    """active | failed | gone (ended well, or never was: a transient unit leaves when it ends well)."""
    state = _systemctl("is-active", _unit(run) + ".service").stdout.strip()   # one word, unlike show --value
    if state in ("active", "activating", "deactivating", "reloading"):
        return "active"
    return "failed" if state == "failed" else "gone"


def _tail(d, n=12):
    """The last lines of train.log (tqdm redraws with \\r: each redraw is a line)."""
    f = d / "train.log"
    if not f.is_file():
        return []
    with open(f, "rb") as fh:
        fh.seek(0, 2)
        fh.seek(max(0, fh.tell() - 16384))
        text = fh.read().decode("utf-8", "replace")
    return [l[-300:] for l in re.split(r"[\r\n]+", text) if l.strip()][-n:]


def _meta(d):
    return json.load(open(d / "run.json", encoding="utf-8"))


def _save_meta(d, meta):
    tmp = d / "run.json.part"
    json.dump(meta, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    tmp.replace(d / "run.json")


def log_tail(kit, run, lines=400):
    """HERESY 2208 (the audit of 06.11.2026, item 16: «The log» fetched the whole train.log every 3 s, 5.6 MB, about 110 MB a minute through the door):
    the last lines of a run's train.log, read from its last 512 KiB (tqdm redraws with \\r: each redraw is a line). FileNotFoundError when the run has
    no log yet, said so by the lab, never an empty text."""
    f = _safe_dir(paths(kit)["runs"], run) / "train.log"
    with open(f, "rb") as fh:
        fh.seek(0, 2)
        size = fh.tell()
        fh.seek(max(0, size - 524288))
        text = fh.read().decode("utf-8", "replace")
    rows = [l for l in re.split(r"[\r\n]+", text) if l.strip()]
    if size > 524288 and rows:
        rows = rows[1:]                                   # the first, cut where the read began
    return "\n".join(rows[-max(1, min(int(lines), 5000)):])


def _last_save(d, run):
    """HERESY 2209: the step of the run's last numbered save (RUN_NNNNNNNNN.safetensors under output/), the one its trainer goes on from; 0 when none."""
    steps = [int(m.group(1)) for m in (CKPT_RE.search(f.name) for f in (d / "output").rglob(run + "_*.safetensors")) if m] if (d / "output").is_dir() else []
    return max(steps or [0])


def _watch(kit, run):
    """While the unit runs: step, loss and the log tail from train.log, the GPU's peak; when it ends:
    its outcome, and the last checkpoint into loras/RUN/ where the engine looks."""
    P = paths(kit)
    d = P["runs"] / run
    meta = _meta(d)
    if meta.get("plugin"):                              # HERESY 2321: a plugin's run, watched by its own step log
        return _watch_plugin(kit, run)
    # HERESY 2209: watched again at the lab's start, from the step run.json knows (a resumed run's last save at the least), not from 0
    job = RUNS.setdefault(run, {"status": "running", "step": int(meta.get("step") or 0), "steps": meta.get("steps"), "loss": None, "ar_ce": None, "tail": []})
    job["vram_peak_mb"] = max(job.get("vram_peak_mb") or 0, meta.get("vram_peak_mb") or 0)
    gpu, total = meta.get("gpu"), meta.get("steps")
    while True:
        state = _unit_state(run)
        tail = _tail(d)
        job["tail"] = tail
        for line in reversed(tail):
            m = STEP_RE.search(line)
            if m and (int(m.group(2)) == total or line.startswith(run + ":")):   # HERESY 1649: the trainer's own bar, whatever its total
                job["step"] = int(m.group(1))
                lm = LOSS_RE.search(line)
                if lm:
                    job["loss"] = float(lm.group(1))
                break
        if state != "active":
            break
        try:
            out = subprocess.run(["nvidia-smi", "-i", str(gpu), "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=10).stdout.strip()
            job["vram_peak_mb"] = max(job["vram_peak_mb"], int(out.split()[0]))
        except (ValueError, IndexError, OSError, subprocess.SubprocessError):
            pass
        if int(time.time()) % 60 < 5:                    # now and then into run.json, so a restart loses nothing
            m = _meta(d)                                  # as it is on disk: a stop may have marked it
            m.update(step=job["step"], loss=job["loss"], vram_peak_mb=job["vram_peak_mb"])
            _save_meta(d, m)
        time.sleep(5)
    meta = _meta(d)
    if meta.get("pausing"):                              # HERESY 1659: paused, to go on from its last save
        job["status"] = "paused"
    elif meta.get("stopping"):
        job["status"] = "stopped"
    elif state == "failed" or any("Traceback" in l for l in tail):
        who = "The Studio's trainer" if (meta.get("options") or {}).get("engine") == "ruach" else "AI-Toolkit"
        job.update(status="failed", error=who + " ended badly: " + (tail[-1] if tail else "no output"))
        _systemctl("reset-failed", _unit(run) + ".service")
    else:
        # HERESY 1649: the trainer's own word: «done: N steps» (an early stop and the sound half's phase end before the planned steps)
        said = next((DONE_RE.match(l) for l in reversed(tail) if DONE_RE.match(l)), None)
        if said:
            job["step"] = int(said.group(1))
        job["status"] = "done" if said or job["step"] >= (total or 0) else "stopped"
    saved = sorted((d / "output").rglob("*.safetensors"), key=lambda f: f.stat().st_mtime)
    # HERESY 1167 (Viktor: «финальную эпоху пишем кошерно, с номером эпохи»): the run's LoRA under its epoch, RUN-eNNN, a hard
    # link to that epoch's checkpoint, never written over by a later run of the same name; the bare name only when the run
    # has no numbered checkpoint
    numbered = [c for c in checkpoints(kit, run, d) if c.get("epoch")]
    if numbered:
        job["lora"] = publish(kit, run, max(numbered, key=lambda c: c["step"])["file"])["lora"]
        best = publish_best(kit, run, d)                  # HERESY 1521: the held-out's best is the run's LoRA, the last beside it
        if best and best != job["lora"]:
            job["lora_last"], job["lora"] = job["lora"], best
    elif saved:                                           # the last one written: the run's LoRA, where the engine looks
        dest = P["loras"] / run
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy2(saved[-1], dest / (run + ".safetensors"))
        job["lora"] = f"{run}/{run}.safetensors"
    meta.update({k: job.get(k) for k in ("status", "step", "loss", "error", "lora", "lora_last", "vram_peak_mb")}, ended=time.time())
    _save_meta(d, meta)


def resume(kit):
    """At the lab's start: every run its run.json calls running is watched again (or closed, if it ended
    while no one watched)."""
    P = paths(kit)
    for d in sorted(P["runs"].iterdir()) if P["runs"].is_dir() else []:
        try:
            if (d / "run.json").is_file() and _meta(d).get("status") == "running" and d.name not in RUNS:
                threading.Thread(target=_watch, args=(kit, d.name), daemon=True).start()
        except (ValueError, OSError):
            continue


def run_cards(meta):
    """HERESY 1631: the cards a run holds: its gpus, or its one gpu"""
    g = meta.get("gpus") or ([meta["gpu"]] if meta.get("gpu") is not None else [])
    return [int(x) for x in g]


def train(kit, spec, gpu_picker, more_cards=None):
    """spec: {dataset, name, steps, save_epochs, rank, lr, cot, ar_loss_weight, ar_kl_weight, ar_lr_multiplier,
    do_separation, quant, gpu, kind, note}. A run of the same name goes on from its last checkpoint."""
    P = paths(kit)
    dataset = str(spec.get("dataset", ""))
    _safe_dir(P["prepared"], dataset)
    t = plugin_trainers(kit).get(str(spec.get("engine") or "ruach"))
    if t:                                               # HERESY 2321: a plugin's trainer
        return _train_plugin(kit, spec, t, gpu_picker, more_cards)
    if str(spec.get("engine") or "ruach") != "ruach":       # HERESY 1422: said, not run
        raise ValueError("AI-Toolkit left the Studio (13.10.2026): its own trainer trains every mode now, Direct, with a score, separated")
    own = True
    run = str(spec.get("name") or f"{dataset}-{time.strftime('%Y%m%d-%H%M')}")
    if not NAME_RE.match(run):
        raise ValueError("a run name of letters, digits, _ . - (no spaces), up to 64")
    o = dict(DEFAULTS)
    for k, v in spec.items():
        if k in DEFAULTS:
            o[k] = type(DEFAULTS[k])(v) if not isinstance(DEFAULTS[k], bool) else bool(v)
    if not spec.get("transcriber"):                    # HERESY 2359: unsaid, the set's own (its sheets' transcriber); a set without sheets, bf16
        o["transcriber"] = set_transcriber(P["prepared"] / dataset) or NEW_SET_TRANSCRIBER
    # HERESY 1668: a new run given its rank alone, the halves 1:2 (the music half at half, the sound half at the rank)
    if not (P["runs"] / run / "run.json").is_file() and not o["rank_ar"] and not o["rank_nar"]:
        o["rank_ar"], o["rank_nar"] = max(4, int(o["rank"]) // 2), int(o["rank"])
    with LOCK:
        if _unit_state(run) == "active":
            raise ValueError(f"{run} is already running")
    # HERESY 1662: an epoch counts each track as many times as its weight (dataset.json's "weight", 1 when absent)
    tracks = sum(max(1, int(t.get("weight") or 1)) for t in json.load(open(P["prepared"] / dataset / "dataset.json", encoding="utf-8")).get("tracks", []))
    if tracks < 1:
        raise ValueError(f"{dataset} has no tracks")
    o["steps_per_epoch"] = tracks                     # batch 1: one step a track
    o["lr_tail_epochs"] = max(0.0, min(float(o["lr_tail_epochs"]), 1000.0))   # HERESY 1752: none below 0; one longer than the run fades all of it
    o["lr_tail_floor"] = max(0.0, min(float(o["lr_tail_floor"]), 1.0))
    o["ar_cap_tokens"] = max(0, min(int(o["ar_cap_tokens"]), 65536))   # HERESY 1832: 0 no cap
    # HERESY 1944: at most 12 groups of 64 tracks, their names as strings; 1…10 rises; a KL ceiling 0 (off) … 10
    o["val_groups"] = {str(g)[:24]: [str(n) for n in (v or [])][:64] for g, v in list(dict(o["val_groups"] or {}).items())[:12]}
    o["stop_ce_groups"] = [str(g)[:24] for g in (o["stop_ce_groups"] or [])][:12]
    o["stop_ce_rises"] = max(1, min(int(o["stop_ce_rises"]), 10))
    o["stop_kl_max"] = max(0.0, min(float(o["stop_kl_max"]), 10.0))
    o["steps"] = math.ceil(o["steps"] / tracks) * tracks  # whole epochs: the last save closes one too
    o["save_every"] = max(1, round(tracks * min(100.0, max(0.1, o["save_epochs"]))))   # HERESY 1658: every tenth of an epoch at the least
    if str(spec.get("gpu", "")).strip().isdigit():     # a card named: the Studio's own is never taken by chance
        gpu = int(spec["gpu"])
        import gpu_guard                               # HERESY 1112: a named card passes the guard too
        gpu_guard.check(gpu, 20000, kit)
    else:
        gpu, free = gpu_picker(20000, "train")          # HERESY 1091: only a card given to training
    # HERESY 1631: more cards asked: the others given to training with room now, the freest first; each holds the whole model
    want = max(1, min(8, int(spec.get("cards") or 1)))
    cards = [gpu]
    if want > 1:
        extra = more_cards(20000, exclude=cards, most=want - 1, role="train") if more_cards else []
        if len(extra) < want - 1:
            raise RuntimeError(f"{want} cards asked: {1 + len(extra)} of the cards given to training have room now (Engine \u2192 GPUs says which card does what)")
        cards += [int(c) for c in extra]
    o["cards"] = len(cards)
    # runs side by side on different cards (02.10: two cards idle at night is waste); never two on one card
    for r, j in RUNS.items():
        if j["status"] == "running" and r != run:
            other = run_cards(_meta(P["runs"] / r) if (P["runs"] / r / "run.json").is_file() else {})
            both = sorted(set(other) & set(cards))
            if both:
                raise ValueError(f"{r} is training on GPU{both[0]}: one run a card")
    d = P["runs"] / run
    d.mkdir(parents=True, exist_ok=True)
    P["models"].mkdir(parents=True, exist_ok=True)
    if own:
        o["engine"] = "ruach"
        if o["cot"] not in ("off", "full", "melody"):
            raise ValueError("mode: off, full or melody")
        if o["cot"] != "off" and not ((kit / "build" / "build" / "yue-transcribe").is_file() and list(studio_paths.at(studio_paths.MISC, kit).glob("SheetSage2-*.gguf"))):
            raise FileNotFoundError(f"score mode needs the engine's transcriber (build/build/yue-transcribe and {studio_paths.MISC}/SheetSage2-*.gguf)")   # HERESY 1420
        if o["transcriber"] not in TRANSCRIBERS:  # HERESY 2328: the sheets by SheetSage2 or SheetSage2-Refined; 2359: SheetSage2 by its angles
            raise ValueError("transcriber: sheetsage2-bf16 (Heretical), refined (Refined) or sheetsage2 (Standard, the sheets before 2.0.7)")   # HERESY 2377
        if o["cot"] != "off" and o["transcriber"] == "refined" and not (studio_paths.at(studio_paths.MISC, kit) / "SheetSage2-Refined-F16.gguf").is_file():
            raise FileNotFoundError(f"SheetSage2-Refined is not installed: {studio_paths.MISC}/SheetSage2-Refined-F16.gguf")
        if o["do_separation"] and not (studio_paths.at(studio_paths.REFINER_SEPARATION, kit) / "roformer" / "model_bs_roformer_ep_317_sdr_12.9755.ckpt").is_file():
            raise FileNotFoundError(f"the separation needs the Studio's separator ({studio_paths.REFINER_SEPARATION}/roformer/model_bs_roformer_ep_317_sdr_12.9755.ckpt)")   # HERESY 1422
        ckpt, o["quant"], base = base_checkpoint(P, spec)   # HERESY 1792: a base the run names (a merge), else the Studio's own
        if base:
            o["base"] = base
        if base.startswith("plugin:"):                 # HERESY 2321: a plugin's base may be a save laid over a file, both said
            ov = plugin_base(kit, base).get("overlay")
            o["overlay"] = str(ov) if ov else ""
        # the set's latent cache: train.py makes what is missing (lab/trainer/cache.py) before it loads the model
        cfg = {"name": run, "out": str(d), "dataset": str(P["prepared"] / dataset), "checkpoint": str(ckpt),
               **{k: o[k] for k in ("steps", "save_every", "rank", "rank_ar", "rank_nar", "lr", "ar_loss_weight", "ar_kl_weight", "ar_lr_multiplier", "train_window_frames", "cot", "transcriber",
                                    "val_fraction", "patience", "nar_phase_epochs", "steps_per_epoch", "ema_epochs", "ar_max_tokens",
                                    "lr_tail_epochs", "lr_tail_floor", "vram_meter", "ar_cap_tokens", "long_off_card0",
                                    "val_groups", "stop_ce_groups", "stop_ce_rises", "stop_kl_max")}}   # HERESY 1944   # HERESY 1497, 1622, 1662, 1752, 1832
        if o.get("overlay"):
            cfg["overlay"] = o["overlay"]               # HERESY 2321: load.py lays it over the checkpoint
        if o["cot"] != "off":                         # HERESY 1420: score mode, AI-Toolkit's abc_dropout
            cfg["abc_dropout"] = 0.5
        if o["do_separation"]:                        # HERESY 1422: the separation, AI-Toolkit's weights
            cfg.update(do_separation=True, separation_vocals_weight=0.5, separation_music_weight=1.0)
        (d / "config.json").write_text(json.dumps(cfg, indent=1, ensure_ascii=False), encoding="utf-8")
    # HERESY 2209 (the audit of 06.11.2026: a resumed run that failed in its first minute read «step 0 of 107 310, took 0 min», its saves half an epoch
    # on): a run of this name goes on from its last save, so it starts at that save's step; its first start and the time of its earlier sittings carried
    try:
        old = _meta(d) if (d / "run.json").is_file() else {}
    except (OSError, ValueError):
        old = {}
    went_on = _last_save(d, run)
    now = time.time()
    meta = {"name": run, "dataset": dataset, "options": o, "gpu": gpu, "gpus": cards, "started": now, "status": "running",
            "steps": o["steps"], "tracks": tracks, "epochs": round(o["steps"] / tracks, 1), "kind": str(spec.get("kind") or ""),
            "note": str(spec.get("note") or "")[:500], "unit": _unit(run), "step": went_on}
    if old.get("started"):
        sat = max(0.0, float(old.get("ended") or old["started"]) - float(old["started"]))   # a sitting the lab never saw end adds nothing
        meta.update(first_started=old.get("first_started") or old["started"], took_before=round(float(old.get("took_before") or 0) + sat, 1))
    if went_on:
        meta["went_on_from"] = went_on
    _save_meta(d, meta)
    _systemctl("reset-failed", _unit(run) + ".service")     # a failed unit of the same name would block the name
    env = {"CUDA_VISIBLE_DEVICES": ",".join(str(c) for c in cards), "CUDA_DEVICE_ORDER": "PCI_BUS_ID", "MODELS_PATH": str(P["models"]),
           "HF_HOME": str(kit / "hf_cache"), "PYTHONUNBUFFERED": "1", "HF_HUB_DISABLE_PROGRESS_BARS": "1",
           "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"}   # HERESY 1669: no fragments (r192/r384 fits a 3090 so, 21.1 GB)
    log = d / "train.log"
    cmd = ["systemd-run", "--user", "--unit=" + _unit(run), "--working-directory=" + str(kit),
           "-p", f"StandardOutput=append:{log}", "-p", f"StandardError=append:{log}"]
    cmd += ["--setenv=" + k + "=" + v for k, v in env.items()]
    cmd += [str(kit / ".venv" / "bin" / "python")]
    if len(cards) > 1:                                 # HERESY 1631: a process a card, torchrun's (the first card writes the log)
        cmd += ["-m", "torch.distributed.run", "--standalone", f"--nproc_per_node={len(cards)}"]
    cmd += [str(kit / "lab" / "trainer" / "train.py"), str(d / "config.json")]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        meta.update(status="failed", error="systemd-run: " + (r.stderr.strip() or r.stdout.strip()))
        _save_meta(d, meta)
        raise RuntimeError(meta["error"])
    RUNS[run] = {"status": "running", "step": went_on, "steps": o["steps"], "loss": None, "ar_ce": None, "tail": [], "vram_peak_mb": 0}
    threading.Thread(target=_watch, args=(kit, run), daemon=True).start()
    return dict(meta)


def _train_plugin(kit, spec, t, gpu_picker, more_cards):
    """HERESY 2321: a run of a plugin's trainer: its plan asked, its cards picked as training's (each with the room it says), its run.json written
    the way the room reads a run, its command in the run's own unit; then watched (_watch_plugin)."""
    P = paths(kit)
    dataset = str(spec.get("dataset", ""))
    run = str(spec.get("name") or f"{dataset}-{time.strftime('%Y%m%d-%H%M')}")
    if not NAME_RE.match(run):
        raise ValueError("a run name of letters, digits, _ . - (no spaces), up to 64")
    with LOCK:
        if _unit_state(run) == "active":
            raise ValueError(f"{run} is already running")
    d = P["runs"] / run
    plan = _plugin_call(t, "plan", {"kit": str(kit), "run": run, "dir": str(d), "dataset": str(_safe_dir(P["prepared"], dataset)), "spec": spec}, 300)
    if not isinstance(plan.get("cmd"), list) or not plan["cmd"]:
        raise RuntimeError(f"the trainer {t['id']} gave no command")
    want, need = max(1, min(8, int(plan.get("cards") or 1))), int(plan.get("need_mb") or 20000)
    gpu, _ = gpu_picker(need, "train")
    cards = [gpu]
    if want > 1:
        extra = more_cards(need, exclude=cards, most=want - 1, role="train") if more_cards else []
        if len(extra) < want - 1:
            raise RuntimeError(f"{want} cards asked: {1 + len(extra)} of the cards given to training have room now (Engine \u2192 GPUs says which card does what)")
        cards += [int(c) for c in extra]
    cards = sorted(int(c) for c in cards)              # in their own order: a rank keeps its card from sitting to sitting
    for r, j in RUNS.items():
        if j["status"] == "running" and r != run:
            both = sorted(set(run_cards(_meta(P["runs"] / r) if (P["runs"] / r / "run.json").is_file() else {})) & set(cards))
            if both:
                raise ValueError(f"{r} is training on GPU{both[0]}: one run a card")
    d.mkdir(parents=True, exist_ok=True)
    try:
        old = _meta(d) if (d / "run.json").is_file() else {}
    except (OSError, ValueError):
        old = {}
    stop_file = str(plan.get("stop_file") or "")
    if stop_file and not NAME_RE.match(stop_file):
        raise ValueError(f"the trainer {t['id']} named a stop file that is not a plain name: {stop_file}")
    o = dict(plan.get("options") or {}, engine=t["id"], save_every=int(plan.get("save_every") or 0), steps_per_epoch=int(plan.get("per_epoch") or 0))
    now = time.time()
    meta = {"name": run, "dataset": dataset, "options": o, "gpu": cards[0], "gpus": cards, "started": now, "status": "running",
            "steps": int(plan.get("steps") or 0), "tracks": int(plan.get("per_epoch") or 0), "epochs": plan.get("epochs"),
            "kind": str(spec.get("kind") or plan.get("kind") or ""), "note": str(spec.get("note") or "")[:500], "unit": _unit(run),
            "step": int(plan.get("step") or 0), "plugin": t["plugin"], "engine_label": next((e["label"] for e in plugin_engines(kit) if e["id"] == t["id"]), t["id"]),
            "facts": [[str(a)[:40], str(b)[:300]] for a, b in (plan.get("facts") or [])][:24], "no_adapter": True,
            "stop_file": stop_file, "stop_grace_s": max(30, min(int(plan.get("stop_grace_s") or 60), 3600))}
    if old.get("started"):
        sat = max(0.0, float(old.get("ended") or old["started"]) - float(old["started"]))
        meta.update(first_started=old.get("first_started") or old["started"], took_before=round(float(old.get("took_before") or 0) + sat, 1))
    if meta["step"]:
        meta["went_on_from"] = meta["step"]
    _save_meta(d, meta)
    _systemctl("reset-failed", _unit(run) + ".service")
    env = {"CUDA_VISIBLE_DEVICES": ",".join(str(c) for c in cards), "CUDA_DEVICE_ORDER": "PCI_BUS_ID", "PYTHONUNBUFFERED": "1",
           **{str(k): str(v) for k, v in (plan.get("env") or {}).items()}}
    log = d / "train.log"
    cmd = ["systemd-run", "--user", "--unit=" + _unit(run), "--working-directory=" + str(kit),
           "-p", f"StandardOutput=append:{log}", "-p", f"StandardError=append:{log}"]
    cmd += ["--setenv=" + k + "=" + v for k, v in env.items()]
    cmd += [str(x) for x in plan["cmd"]]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        meta.update(status="failed", error="systemd-run: " + (r.stderr.strip() or r.stdout.strip()))
        _save_meta(d, meta)
        raise RuntimeError(meta["error"])
    RUNS[run] = {"status": "running", "step": meta["step"], "steps": meta["steps"], "loss": None, "ar_ce": None, "tail": [], "vram_peak_mb": 0}
    threading.Thread(target=_watch, args=(kit, run), daemon=True).start()
    return dict(meta)


def _plugin_progress(db):
    """HERESY 2321: a plugin's run as its step log says it: (step, loss, ar_ce, seconds a step over its last steps), or None"""
    if not db.is_file():
        return None
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
        rows = con.execute("SELECT step, wall_time FROM steps ORDER BY step DESC LIMIT 41").fetchall()
        if not rows:
            con.close()
            return None
        last = rows[0][0]
        got = dict(con.execute("SELECT key, AVG(value_real) FROM metrics WHERE step > ? AND key IN ('loss/loss', 'loss/ar_ce') GROUP BY key", (last - 25,)).fetchall())
        con.close()
    except sqlite3.Error:
        return None
    gaps = sorted((a[1] - b[1]) / (a[0] - b[0]) for a, b in zip(rows, rows[1:]) if a[0] > b[0] and a[1] > b[1])
    return last, got.get("loss/loss"), got.get("loss/ar_ce"), (gaps[len(gaps) // 2] if gaps else None)   # the median: a pause in the window says nothing


def _watch_plugin(kit, run):
    """HERESY 2321: _watch for a plugin's run: its step, loss and time left from its own step log, every card's peak; at its end the outcome, no
    adapter (its saves are weights of their own)."""
    P = paths(kit)
    d = P["runs"] / run
    meta = _meta(d)
    job = RUNS.setdefault(run, {"status": "running", "step": int(meta.get("step") or 0), "steps": meta.get("steps"), "loss": None, "ar_ce": None, "tail": []})
    job["vram_peak_mb"] = max(job.get("vram_peak_mb") or 0, meta.get("vram_peak_mb") or 0)
    cards, total, db = run_cards(meta), int(meta.get("steps") or 0), d / "output" / run / "loss_log.db"
    while True:
        state = _unit_state(run)
        job["tail"] = _tail(d)
        got = _plugin_progress(db)
        if got:
            job["step"] = max(int(meta.get("step") or 0), got[0])
            job["loss"], job["ar_ce"] = got[1], got[2]
            job["sec_per_step"] = got[3]
            job["eta_s"] = round(max(0, total - job["step"]) * got[3]) if got[3] and total else None
        job["elapsed_s"] = round(time.time() - float(meta.get("started") or time.time()))
        if state != "active":
            break
        for g in cards:
            try:
                out = subprocess.run(["nvidia-smi", "-i", str(g), "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                     capture_output=True, text=True, timeout=10).stdout.strip()
                job["vram_peak_mb"] = max(job["vram_peak_mb"], int(out.split()[0]))
            except (ValueError, IndexError, OSError, subprocess.SubprocessError):
                pass
        if int(time.time()) % 60 < 10:
            m = _meta(d)
            m.update(step=job["step"], loss=job["loss"], vram_peak_mb=job["vram_peak_mb"])
            _save_meta(d, m)
        time.sleep(10)
    meta = _meta(d)
    said = next((DONE_RE.match(l) for l in reversed(job["tail"]) if DONE_RE.match(l)), None)
    if meta.get("pausing"):
        job["status"] = "paused"
    elif meta.get("stopping"):
        job["status"] = "stopped"
    elif state == "failed" or (not said and any("Traceback" in l for l in job["tail"])):
        job.update(status="failed", error=f"{meta.get('engine_label') or 'The trainer'} ended badly: " + (job["tail"][-1] if job["tail"] else "no output"))
        _systemctl("reset-failed", _unit(run) + ".service")
    else:
        if said:
            job["step"] = int(said.group(1))
        job["status"] = "done" if said or job["step"] >= total else "stopped"
    job["eta_s"] = None
    meta.update({k: job.get(k) for k in ("status", "step", "loss", "error", "vram_peak_mb")}, ended=time.time())
    _save_meta(d, meta)


def run_status(kit, run):
    job = RUNS.get(run)
    if job:
        out = {"name": run, **{k: job.get(k) for k in ("status", "step", "steps", "loss", "ar_ce", "error", "lora", "tail", "vram_peak_mb")}}
        ser = _series(paths(kit)["runs"] / run)        # ar_ce is not on tqdm's line: from the step log
        if ser.get("ar_ce"):
            out["ar_ce"] = ser["ar_ce"]["last"]
        if ser.get("sec_per_step"):
            out["sec_per_step"] = ser["sec_per_step"]
        return out
    f = paths(kit)["runs"] / run / "run.json"
    if f.is_file():
        return json.load(open(f, encoding="utf-8"))
    raise FileNotFoundError(f"no run {run}")


def stop(kit, run, pause=False):
    """SIGINT to the run's unit (AI-Toolkit saves on Ctrl-C), then a stop after a minute. HERESY 1659: pause, the same, the run called paused."""
    if _unit_state(run) != "active":
        raise ValueError(f"{run} is not running")
    d = paths(kit)["runs"] / run
    meta = _meta(d)
    meta["stopping"] = True
    if pause:
        meta["pausing"] = True
    _save_meta(d, meta)
    # HERESY 1973 (31.10.2026: a pause at 12:02:45 and a resume at 12:03:15 under the same unit name; the minute's stop came at 12:03:45 and
    # ended the resumed run): the late stop is for the start that was paused, known by its unit's InvocationID, never for a later one
    inv = _systemctl("show", "-p", "InvocationID", "--value", _unit(run) + ".service").stdout.strip()
    grace = 60
    if meta.get("stop_file") and NAME_RE.match(str(meta["stop_file"])):   # HERESY 2321: a plugin's run asked by its file, saves at its step's end
        (d / meta["stop_file"]).write_text(("pause" if pause else "stop") + "\n", encoding="utf-8")
        grace = int(meta.get("stop_grace_s") or 60)
    else:
        _systemctl("kill", "--signal=SIGINT", _unit(run) + ".service")

    def later():
        time.sleep(grace)
        now = _systemctl("show", "-p", "InvocationID", "--value", _unit(run) + ".service").stdout.strip()
        if _unit_state(run) == "active" and (not inv or now == inv):
            _systemctl("stop", _unit(run) + ".service")
    threading.Thread(target=later, daemon=True).start()
    return {"name": run, "status": "pausing" if pause else "stopping"}


def resume_run(kit, run, gpu_picker, more_cards=None):
    """HERESY 1659: a paused run started again, the same set, knobs, steps and number of cards; the trainer goes on from its last save"""
    d = _safe_dir(paths(kit)["runs"], run)
    meta = _meta(d)
    if meta.get("status") != "paused":
        raise ValueError(f"{run} is not paused")
    spec = dict(meta.get("options") or {}, dataset=meta.get("dataset"), name=run, kind=meta.get("kind") or "", note=meta.get("note") or "",
                cards=len(meta.get("gpus") or [meta.get("gpu")]))
    return train(kit, spec, gpu_picker, more_cards)


# ---- HERESY 1078: the listener in the wizard. Omni hears the set and drafts each track's style; the user
# corrects the drafts; they go into the captions as "trigger, the track's tags. the shared line".
# The engine is chosen by the cards, on measured peaks (02.10.2026, one 120 s excerpt).
# (what, the model under checkpoints, its audio projector or None, peak MB measured, needs a card of at least MB).
# HERESY 1077b: the whole ladder measured 02.10.2026 on one 120 s excerpt (tmp/listener-bench/table.md): Q8_0 down
# to Q4_K_M hear the same tags with either projector; the Q8_0 projector saves a GB and halves the time. Q3_K_M
# already drifts (modal -> minor), UD-Q2_K_XL invents (dubstep, drum machine, fast): neither is offered.
_G = "Qwen2.5-Omni-7B-GGUF/"
_P8 = _G + "mradermacher/Qwen2.5-Omni-7B.mmproj-Q8_0.gguf"
LISTENERS = [
    ("Qwen2.5-Omni-7B bf16", "Qwen2.5-Omni-7B", None, 18750, 23000),
    ("Omni Q8_0 + projector Q8_0 (llama.cpp)", _G + "Qwen2.5-Omni-7B-Q8_0.gguf", _P8, 10550, 11500),
    ("Omni Q5_K_M + projector Q8_0 (llama.cpp)", _G + "unsloth/Qwen2.5-Omni-7B-Q5_K_M.gguf", _P8, 8200, 9000),
    ("Omni Q4_K_M + projector Q8_0 (llama.cpp)", _G + "Qwen2.5-Omni-7B-Q4_K_M.gguf", _P8, 7480, 8200),
    ("Omni Q8_0 + projector f16 (llama.cpp)", _G + "Qwen2.5-Omni-7B-Q8_0.gguf", _G + "mmproj-Qwen2.5-Omni-7B-f16.gguf", 11560, 12000),
    ("Omni Q4_K_M + projector f16 (llama.cpp)", _G + "Qwen2.5-Omni-7B-Q4_K_M.gguf", _G + "mmproj-Qwen2.5-Omni-7B-f16.gguf", 8564, 9000),
]
LISTEN = {}


def listeners(kit, cards=None):
    """The listeners present on disk, each with whether a card here can hold it."""
    cards = cards if cards is not None else gpus()
    big = max((c["total_mb"] for c in cards), default=0) if isinstance(cards, list) else 0
    out = []
    for what, rel, proj, peak, need in LISTENERS:
        lis = studio_paths.at(studio_paths.LISTENER, kit)
        present = (lis / rel).exists() and (proj is None or (lis / proj).is_file())
        out.append({"what": what, "path": rel, "mmproj": proj, "peak_mb": peak, "needs_mb": need, "present": present, "fits": big >= need})
    return out


def listen(kit, spec, gpu_picker):
    """spec: {dataset, model (a path from listeners(), or empty: the best that fits)}. A job: listener.py."""
    P = paths(kit)
    name = str(spec.get("dataset", ""))
    d = _safe_dir(P["prepared"], name)
    choice = [l for l in listeners(kit) if l["present"] and l["fits"] and (not spec.get("model") or l["path"] == spec["model"])]
    if not choice:
        raise ValueError("no listener fits here: a GGUF needs 8.2 GB on one card (Q4_K_M with the Q8_0 projector), bf16 23 GB; or none is downloaded")
    pick = choice[0]
    if (d / "styles.json").is_file():                   # the drafts heard before (and corrected) are kept aside, not lost
        shutil.copy2(d / "styles.json", d / f"styles.{time.strftime('%Y%m%d-%H%M%S')}.json")
    with LOCK:
        job = LISTEN.get(name)
        if job and job["status"] == "running":
            return dict(job, name=name)
        gpu, free = gpu_picker(pick["needs_mb"])
        job = {"status": "running", "done": 0, "total": len(json.load(open(d / "dataset.json", encoding="utf-8"))["tracks"]),
               "model": pick["what"], "gpu": gpu, "started": time.time(), "tail": []}
        LISTEN[name] = job

    def work():
        cmd = [str(kit / ".venv" / "bin" / "python"), str(Path(__file__).resolve().parent / "listener.py"),
               name, "--gpu", str(gpu), "--model", str(studio_paths.at(studio_paths.LISTENER, kit) / pick["path"])]
        if pick.get("mmproj"):
            cmd += ["--mmproj", str(studio_paths.at(studio_paths.LISTENER, kit) / pick["mmproj"])]
        try:
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in p.stdout:
                line = line.rstrip()
                if re.match(r"^\d+/\d+ ", line):
                    job["done"] = int(line.split("/")[0])
                if line.strip() and "System prompt modified" not in line:
                    job["tail"] = (job["tail"] + [line[-300:]])[-8:]
            rc = p.wait()
            job.update(status="done" if rc == 0 else "failed", ended=time.time())
            if rc != 0:
                job["error"] = job["tail"][-1] if job["tail"] else f"listener.py ended with {rc}"
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


VOICE = {}           # raw folder name -> its voice measure (HERESY 1169)


def measure_voice(kit, spec):
    """HERESY 1169 (Viktor 05.10.2026: «Ты можешь у Тренера прикрутить… что определяет тип голоса? Мужской или женский,
    регистр? Нам не нужны Имена человеков, а нужны именно их тональности»). spec: {name, voice: "" | male | female,
    mode: speech | sung}: voice_kind.py over the raw folder, in a thread (pYIN on twelve tracks, a minute or so); the
    result kept beside the songs as voice-kind.json, where the folder list reads it."""
    P = paths(kit)
    name = str(spec.get("name", ""))
    d = _safe_dir(P["raw"], name)
    voice = spec.get("voice") if spec.get("voice") in ("male", "female") else None
    mode = "sung" if spec.get("mode") == "sung" else "speech"
    with LOCK:
        job = VOICE.get(name)
        if job and job["status"] == "running":
            return dict(job, name=name)
        job = {"status": "running", "started": time.time(), "mode": mode}
        VOICE[name] = job

    def work():
        try:
            import voice_kind
            r = voice_kind.measure(d, voice=voice, mode=mode)
            if r.get("error"):
                job.update(status="failed", error=r["error"], ended=time.time())
                return
            (d / "voice-kind.json").write_text(json.dumps(r, indent=1), encoding="utf-8")
            job.update(status="done", result=r, ended=time.time())
        except Exception as e:  # noqa: BLE001: said in the job, never lost
            job.update(status="failed", error=str(e), ended=time.time())
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


def voice_status(kit, name):
    P = paths(kit)
    d = _safe_dir(P["raw"], name)
    return dict(VOICE.get(name) or {"status": "none"}, name=name, kept=_voice(d))


def listen_status(kit, name):
    P = paths(kit)
    d = _safe_dir(P["prepared"], name)
    job = LISTEN.get(name) or {"status": "none"}
    s = json.load(open(d / "styles.json", encoding="utf-8")) if (d / "styles.json").is_file() else {}
    man = json.load(open(d / "dataset.json", encoding="utf-8"))
    rows = []
    for t in man.get("tracks", []):
        cap = (d / (t["stem"] + ".txt")).read_text(encoding="utf-8").split("\n", 1)[0] if (d / (t["stem"] + ".txt")).is_file() else ""
        rows.append({"stem": t["stem"], "file": t["file"], "tags": (s.get("tags") or {}).get(t["stem"], ""), "caption": cap})
    return {"name": name, **{k: v for k, v in job.items() if k != "tail"}, "tail": job.get("tail", []),
            "styles_model": s.get("model"), "rows": rows, "listeners": listeners(kit)}


def apply_styles(kit, spec):
    """spec: {dataset, trigger, shared, tags: {stem: corrected tags}}: each caption's first line becomes
    "trigger, tags. shared"; the lyrics below it stay; styles.json keeps what was written and that it was
    corrected by hand."""
    P = paths(kit)
    name = str(spec.get("dataset", ""))
    d = _safe_dir(P["prepared"], name)
    trigger, shared = str(spec.get("trigger") or "").strip(), " ".join(str(spec.get("shared") or "").split())
    tags = {str(k): " ".join(str(v).split()) for k, v in (spec.get("tags") or {}).items()}
    n = 0
    for stem, t in tags.items():
        f = d / (stem + ".txt")
        if not re.fullmatch(r"\d{3,}", stem) or not f.is_file():
            continue
        head, sep, rest = f.read_text(encoding="utf-8").partition("\n")
        style = ", ".join(x for x in (trigger, t) if x) + (". " + shared if shared else "")
        f.write_text(style + "\n" + rest, encoding="utf-8")
        n += 1
    sp = d / "styles.json"
    s = json.load(open(sp, encoding="utf-8")) if sp.is_file() else {}
    s.setdefault("tags", {}).update(tags)
    s.update(applied=time.strftime("%Y-%m-%d %H:%M"), applied_trigger=trigger, applied_shared=shared)
    json.dump(s, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return {"name": name, "captions": n}
