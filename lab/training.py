"""HERESY 1063: LoRA training for YuE2, the lab's side (Viktor, 01.10.2026). Imported by lab.py.

The trainer is Ostris' AI-Toolkit (MIT; extensions_built_in/audio_models/yue2): one LoRA over both
experts, the NAR flow loss always, the AR next-token loss when ar_loss_weight > 0, anchored to the
base model by ar_kl_weight (the AR learns the training songs by heart on a small set: its notes).
The studio only prepares, starts, watches and collects:

  datasets/raw/NAME/        the raw material, as it came (WAV, FLAC, MP3, with or without .txt)
  datasets/prepared/NAME/   48 kHz stereo WAV + one caption .txt each, AI-Toolkit's own layout:
                            the style line, then [Lyrics] and the lyrics (its parse_caption)
  training/RUN/             config.yaml, train.log, AI-Toolkit's output (checkpoints, samples)
  loras/RUN/                the finished LoRA, where the engine finds it

The weights it trains on are Comfy-Org's repack of YuE2 (the tokenizer embedded), fetched by
AI-Toolkit into checkpoints/comfy/ (MODELS_PATH); the semantic head is the realaudio tokenizer in
checkpoints/yue2-mothersuperior-realaudio-tokenizer-v4/. A run takes a GPU of its own for hours, so
it does not hold the lab's heavy lock (Whisper and the stems go on beside it).
"""
import json, math, os, re, shutil, signal, sqlite3, subprocess, threading, time
from pathlib import Path

AUDIO = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
RUNS = {}            # run name -> what its watcher knows: status, step, steps, loss, log tail, VRAM peak
LOCK = threading.Lock()
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


def paths(kit):
    aitk = Path(os.environ.get("AITK_ROOT", kit.parent / "AI_Toolkit"))
    return {"raw": kit / "datasets" / "raw", "prepared": kit / "datasets" / "prepared", "runs": kit / "training",
            "loras": kit / "loras", "models": kit / "checkpoints" / "comfy", "aitk": aitk,
            "aitk_py": aitk / ".venv" / "bin" / "python",
            "head": kit / "checkpoints" / "yue2-mothersuperior-realaudio-tokenizer-v4"}


def _seconds(p):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                             capture_output=True, text=True, timeout=30).stdout.strip()
        return round(float(out), 1)
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def _safe_dir(base, name):
    d = (base / name).resolve()
    if base.resolve() not in d.parents or not d.is_dir():
        raise FileNotFoundError(f"no such dataset: {name}")
    return d


def datasets(kit):
    """The raw folders and the prepared sets, with what the trainer needs to know."""
    P = paths(kit)
    raw = []
    for d in sorted(P["raw"].iterdir()) if P["raw"].is_dir() else []:
        if d.is_dir():
            files = [f for f in d.rglob("*") if f.suffix.lower() in AUDIO]
            raw.append({"name": d.name, "tracks": len(files), "bytes": sum(f.stat().st_size for f in files),
                        "captions": sum(1 for f in files if f.with_suffix(".txt").is_file())})
    prepared = []
    for d in sorted(P["prepared"].iterdir()) if P["prepared"].is_dir() else []:
        man = d / "dataset.json"
        if man.is_file():
            m = json.load(open(man, encoding="utf-8"))
            prepared.append({"name": d.name, "tracks": len(m.get("tracks", [])), "from": m.get("from"), "made": m.get("made"),
                             "seconds": round(sum(t.get("seconds") or 0 for t in m.get("tracks", [])))})
    ready = P["aitk_py"].is_file() and (P["aitk"] / "run.py").is_file()
    # HERESY 1086: what the studio's own trainer needs, each said by name (heresy/fetch-heresy.sh --trainer fetches it)
    own = {q: (P["models"] / "checkpoints" / f).is_file() for q, f in OWN_CKPT.items()}
    own.update(mert=(kit / "checkpoints" / "MERT-v2-FullSong" / "model.safetensors").is_file(),
               head=(P["head"] / "tokenizer_head_joint_v4.pt").is_file())
    return {"raw": raw, "prepared": prepared, "aitk": str(P["aitk"]), "aitk_ready": ready, "own": own,
            "head": P["head"].is_dir(), "runs": runs(kit)["runs"], "gpus": gpus()}


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
        own = f.with_suffix(".style.txt")              # HERESY 1073: a track's own style beside it (GTSinger's labels)
        rows.append({"file": str(f.relative_to(d)), "seconds": _seconds(f), "bytes": f.stat().st_size,
                     "lyrics": lyrics[:12000], "lyrics_from": str(t.relative_to(d)) if t else "", "hints": hints[:12],
                     "style": " ".join(own.read_text(encoding="utf-8").split()) if own.is_file() else ""})
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
            out = P["prepared"] / name
            tmp = P["prepared"] / (name + ".part")
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True)
            rows = []
            for i, t in enumerate(tracks):
                f = (src / t["file"]).resolve()
                if src not in f.parents or not f.is_file():
                    raise FileNotFoundError(t["file"])
                stem = f"{i + 1:03d}"                     # short, ASCII names: the trainer's caches key by them
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le",
                                str(tmp / (stem + ".wav"))], check=True, timeout=600)
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


def prepare_status(name):
    job = PREP.get(name)
    return dict(job, name=name) if job else {"status": "none", "name": name}


# ---- the run
DEFAULTS = {"steps": 1500, "rank": 32, "lr": 1e-4, "save_epochs": 1, "cot": "off", "ar_loss_weight": 0.5,
            "ar_kl_weight": 0.2, "ar_lr_multiplier": 0.5, "train_window_frames": 1500, "do_separation": False,
            "quant": "int8", "engine": "ai-toolkit"}
# HERESY 1085: engine "ruach" is the studio's own trainer (lab/trainer, ported from Ostris' MIT code, exact on
# parity: lab/trainer/PARITY.md), bf16 weights (Viktor: "не квантуй ничего"), Direct mode; "ai-toolkit" runs
# Ostris' AI-Toolkit, kept as the reference.
OWN_CKPT = {"bf16": "yue2_3b_bf16.safetensors", "int8": "yue2_3b_int8_convrot.safetensors"}


def config_yaml(kit, run, dataset, o):
    """AI-Toolkit's job file for a YuE2 LoRA (JSON is YAML: no YAML library needed in the lab)."""
    P = paths(kit)
    ckpt = ("Comfy-Org/YuE2/checkpoints/yue2_3b_int8_convrot.safetensors" if o["quant"] == "int8"
            else "Comfy-Org/YuE2/checkpoints/yue2_3b_bf16.safetensors")
    model = {"arch": "yue2", "name_or_path": ckpt, "quantize": o["quant"] == "int8", "quantize_te": False, "low_vram": False,
             "model_kwargs": {"cot": o["cot"], "abc_dropout": 0.5, "ar_loss_weight": o["ar_loss_weight"],
                              "ar_kl_weight": o["ar_kl_weight"], "ar_lr_multiplier": o["ar_lr_multiplier"],
                              "train_window_frames": o["train_window_frames"], "do_separation": o["do_separation"],
                              "semantic_head_path": str(P["head"] / "tokenizer_head_joint_v4.pt"),
                              "nar_lora_path": str(P["head"] / "nar_lora_joint_v4.pt")}}
    if o["quant"] == "int8":
        model["qtype"] = "convrot8"
    cfg = {"job": "extension", "config": {"name": run, "process": [{
        "type": "sd_trainer", "training_folder": str(P["runs"] / run / "output"), "device": "cuda:0",
        "network": {"type": "lora", "linear": o["rank"], "linear_alpha": o["rank"]},
        # HERESY 1067 (Viktor, 02.10): a checkpoint per epoch, not per so many steps, and every one kept, so
        # the epochs can be heard against each other; the step loss into loss_log.db (AI-Toolkit's UI logger)
        "save": {"dtype": "bf16", "save_every": o["save_every"], "max_step_saves_to_keep": o["steps"] // o["save_every"] + 2},
        "logging": {"log_every": 1, "use_ui_logger": True},
        "datasets": [{"folder_path": str(P["prepared"] / dataset), "caption_ext": "txt", "caption_dropout_rate": 0,
                      "cache_latents_to_disk": True, "resolution": [512]}],
        "train": {"batch_size": 1, "steps": o["steps"], "gradient_accumulation": 1, "train_unet": True,
                  "train_text_encoder": False, "gradient_checkpointing": True, "noise_scheduler": "flowmatch",
                  "timestep_type": "sigmoid", "optimizer": "adamw8bit", "lr": o["lr"], "dtype": "bf16",
                  "unload_text_encoder": False, "disable_sampling": True},
        "model": model}]}, "meta": {"name": run, "version": "1.0", "studio": "Ruach Studio"}}
    return cfg


CKPT_RE = re.compile(r"_(\d{6,})\.safetensors$")


def _series(d, keep=400):
    """HERESY 1067: a run's step log (AI-Toolkit's loss_log.db) as curves for its card: flow loss, ar_ce,
    ar_kl, each averaged into at most `keep` points; with the wall time, the seconds a step."""
    dbs = sorted((d / "output").rglob("loss_log.db")) if (d / "output").is_dir() else []
    if not dbs:
        return {}
    try:
        con = sqlite3.connect(f"file:{dbs[0]}?mode=ro", uri=True, timeout=5)
        rows = con.execute("SELECT step, key, value_real FROM metrics WHERE value_real IS NOT NULL AND key IN "
                           "('loss/loss', 'loss/ar_ce', 'loss/ar_kl', 'loss/flow') ORDER BY step").fetchall()
        wall = con.execute("SELECT MIN(step), MAX(step), MIN(wall_time), MAX(wall_time) FROM steps").fetchone()
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
    return out


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
        name = f"{run}-e{round(step / per):03d}.safetensors" if per and step else None
        out.append({"file": str(f.relative_to(d)), "step": step, "epoch": round(step / per, 2) if per and step else None,
                    "bytes": f.stat().st_size, "saved": f.stat().st_mtime,
                    "lora": f"{run}/{name}" if name and (P["loras"] / run / name).is_file() else None})
    return out


def publish(kit, run, file):
    """One checkpoint into loras/RUN/ as RUN-eNNN.safetensors, where Create finds it: a hard link (no
    second copy on disk), a copy where links cannot be made."""
    P = paths(kit)
    d = _safe_dir(P["runs"], run)
    for c in checkpoints(kit, run, d):
        if c["file"] == file:
            if not c["epoch"]:
                raise ValueError("this checkpoint has no epoch to name it by")
            dest = P["loras"] / run
            dest.mkdir(parents=True, exist_ok=True)
            target = dest / f"{run}-e{round(c['epoch']):03d}.safetensors"
            if not target.exists():
                try:
                    os.link(d / file, target)
                except OSError:
                    shutil.copy2(d / file, target)
            return {"name": run, "lora": f"{run}/{target.name}"}
    raise FileNotFoundError(f"no checkpoint {file} in {run}")


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
    """Gone for good: asked twice on the page, never done by the studio on its own."""
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
            r["checkpoints"] = checkpoints(kit, d.name, d)
            if live and live.get("tail"):                 # HERESY 1090: the time it has run and has left, from tqdm's line
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


def _watch(kit, run):
    """While the unit runs: step, loss and the log tail from train.log, the GPU's peak; when it ends:
    its outcome, and the last checkpoint into loras/RUN/ where the engine looks."""
    P = paths(kit)
    d = P["runs"] / run
    meta = _meta(d)
    job = RUNS.setdefault(run, {"status": "running", "step": 0, "steps": meta.get("steps"), "loss": None, "ar_ce": None, "tail": []})
    job["vram_peak_mb"] = max(job.get("vram_peak_mb") or 0, meta.get("vram_peak_mb") or 0)
    gpu, total = meta.get("gpu"), meta.get("steps")
    while True:
        state = _unit_state(run)
        tail = _tail(d)
        job["tail"] = tail
        for line in reversed(tail):
            m = STEP_RE.search(line)
            if m and int(m.group(2)) == total:
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
    if meta.get("stopping"):
        job["status"] = "stopped"
    elif state == "failed" or any("Traceback" in l for l in tail):
        who = "The studio's trainer" if (meta.get("options") or {}).get("engine") == "ruach" else "AI-Toolkit"
        job.update(status="failed", error=who + " ended badly: " + (tail[-1] if tail else "no output"))
        _systemctl("reset-failed", _unit(run) + ".service")
    else:
        job["status"] = "done" if job["step"] >= (total or 0) else "stopped"
    saved = sorted((d / "output").rglob("*.safetensors"), key=lambda f: f.stat().st_mtime)
    # HERESY 1167 (Viktor: «финальную эпоху пишем кошерно, с номером эпохи»): the run's LoRA under its epoch, RUN-eNNN, a hard
    # link to that epoch's checkpoint, never written over by a later run of the same name; the bare name only when the run
    # has no numbered checkpoint
    numbered = [c for c in checkpoints(kit, run, d) if c.get("epoch")]
    if numbered:
        job["lora"] = publish(kit, run, max(numbered, key=lambda c: c["step"])["file"])["lora"]
    elif saved:                                           # the last one written: the run's LoRA, where the engine looks
        dest = P["loras"] / run
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy2(saved[-1], dest / (run + ".safetensors"))
        job["lora"] = f"{run}/{run}.safetensors"
    meta.update({k: job.get(k) for k in ("status", "step", "loss", "error", "lora", "vram_peak_mb")}, ended=time.time())
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


def train(kit, spec, gpu_picker):
    """spec: {dataset, name, steps, save_epochs, rank, lr, cot, ar_loss_weight, ar_kl_weight, ar_lr_multiplier,
    do_separation, quant, gpu, kind, note}. A run of the same name goes on from its last checkpoint."""
    P = paths(kit)
    dataset = str(spec.get("dataset", ""))
    _safe_dir(P["prepared"], dataset)
    own = str(spec.get("engine") or DEFAULTS["engine"]) == "ruach"
    if not own and not P["aitk_py"].is_file():
        raise FileNotFoundError(f"AI-Toolkit is not at {P['aitk']} (set AITK_ROOT, or clone ostris/ai-toolkit there)")
    run = str(spec.get("name") or f"{dataset}-{time.strftime('%Y%m%d-%H%M')}")
    if not NAME_RE.match(run):
        raise ValueError("a run name of letters, digits, _ . - (no spaces), up to 64")
    o = dict(DEFAULTS)
    for k, v in spec.items():
        if k in DEFAULTS:
            o[k] = type(DEFAULTS[k])(v) if not isinstance(DEFAULTS[k], bool) else bool(v)
    with LOCK:
        if _unit_state(run) == "active":
            raise ValueError(f"{run} is already running")
    tracks = len(json.load(open(P["prepared"] / dataset / "dataset.json", encoding="utf-8")).get("tracks", []))
    if tracks < 1:
        raise ValueError(f"{dataset} has no tracks")
    o["steps_per_epoch"] = tracks                     # batch 1: one step a track
    o["steps"] = math.ceil(o["steps"] / tracks) * tracks  # whole epochs: the last save closes one too
    o["save_every"] = tracks * max(1, o["save_epochs"])
    if str(spec.get("gpu", "")).strip().isdigit():     # a card named: the studio's own is never taken by chance
        gpu = int(spec["gpu"])
        import gpu_guard                               # HERESY 1112: a named card passes the guard too
        gpu_guard.check(gpu, 20000, kit)
    else:
        gpu, free = gpu_picker(20000, "train")          # HERESY 1091: only a card given to training
    # runs side by side on different cards (02.10: two cards idle at night is waste); never two on one card
    for r, j in RUNS.items():
        if j["status"] == "running" and r != run:
            other = (_meta(P["runs"] / r) if (P["runs"] / r / "run.json").is_file() else {}).get("gpu")
            if other == gpu:
                raise ValueError(f"{r} is training on GPU{gpu}: one run a card")
    d = P["runs"] / run
    d.mkdir(parents=True, exist_ok=True)
    P["models"].mkdir(parents=True, exist_ok=True)
    if own:
        o["engine"] = "ruach"
        if o["cot"] != "off":
            raise ValueError("the studio's own trainer runs Direct mode (cot off) for now")
        quant = str(spec.get("quant") or "bf16")
        ckpt = P["models"] / "checkpoints" / OWN_CKPT.get(quant, OWN_CKPT["bf16"])
        if not ckpt.is_file():
            raise FileNotFoundError(f"{ckpt.name} is not in checkpoints/comfy/checkpoints/")
        o["quant"] = quant if quant in OWN_CKPT else "bf16"
        # the set's latent cache: train.py makes what is missing (lab/trainer/cache.py) before it loads the model
        cfg = {"name": run, "out": str(d), "dataset": str(P["prepared"] / dataset), "checkpoint": str(ckpt),
               **{k: o[k] for k in ("steps", "save_every", "rank", "lr", "ar_loss_weight", "ar_kl_weight", "ar_lr_multiplier", "train_window_frames")}}
        (d / "config.json").write_text(json.dumps(cfg, indent=1, ensure_ascii=False), encoding="utf-8")
    else:
        o["engine"] = "ai-toolkit"
        cfg = config_yaml(kit, run, dataset, o)
        (d / "config.yaml").write_text(json.dumps(cfg, indent=1, ensure_ascii=False), encoding="utf-8")
    meta = {"name": run, "dataset": dataset, "options": o, "gpu": gpu, "started": time.time(), "status": "running",
            "steps": o["steps"], "tracks": tracks, "epochs": round(o["steps"] / tracks, 1), "kind": str(spec.get("kind") or ""),
            "note": str(spec.get("note") or "")[:500], "unit": _unit(run)}
    _save_meta(d, meta)
    _systemctl("reset-failed", _unit(run) + ".service")     # a failed unit of the same name would block the name
    env = {"CUDA_VISIBLE_DEVICES": str(gpu), "CUDA_DEVICE_ORDER": "PCI_BUS_ID", "MODELS_PATH": str(P["models"]),
           "HF_HOME": str(kit / "hf_cache"), "PYTHONUNBUFFERED": "1", "HF_HUB_DISABLE_PROGRESS_BARS": "1"}
    log = d / "train.log"
    cmd = ["systemd-run", "--user", "--unit=" + _unit(run), "--working-directory=" + str(kit if own else P["aitk"]),
           "-p", f"StandardOutput=append:{log}", "-p", f"StandardError=append:{log}"]
    cmd += ["--setenv=" + k + "=" + v for k, v in env.items()]
    if own:
        cmd += [str(kit / ".venv" / "bin" / "python"), str(kit / "lab" / "trainer" / "train.py"), str(d / "config.json")]
    else:
        cmd += [str(P["aitk_py"]), "run.py", str(d / "config.yaml")]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        meta.update(status="failed", error="systemd-run: " + (r.stderr.strip() or r.stdout.strip()))
        _save_meta(d, meta)
        raise RuntimeError(meta["error"])
    RUNS[run] = {"status": "running", "step": 0, "steps": o["steps"], "loss": None, "ar_ce": None, "tail": [], "vram_peak_mb": 0}
    threading.Thread(target=_watch, args=(kit, run), daemon=True).start()
    return dict(meta, step=0)


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


def stop(kit, run):
    """SIGINT to the run's unit (AI-Toolkit saves on Ctrl-C), then a stop after a minute."""
    if _unit_state(run) != "active":
        raise ValueError(f"{run} is not running")
    d = paths(kit)["runs"] / run
    meta = _meta(d)
    meta["stopping"] = True
    _save_meta(d, meta)
    _systemctl("kill", "--signal=SIGINT", _unit(run) + ".service")

    def later():
        time.sleep(60)
        if _unit_state(run) == "active":
            _systemctl("stop", _unit(run) + ".service")
    threading.Thread(target=later, daemon=True).start()
    return {"name": run, "status": "stopping"}


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
        present = (kit / "checkpoints" / rel).exists() and (proj is None or (kit / "checkpoints" / proj).is_file())
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
               name, "--gpu", str(gpu), "--model", str(kit / "checkpoints" / pick["path"])]
        if pick.get("mmproj"):
            cmd += ["--mmproj", str(kit / "checkpoints" / pick["mmproj"])]
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
