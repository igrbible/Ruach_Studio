"""HERESY LAB · the Kit's Python neighbour on Forge.

The C++ server of the Kit renders songs; what needs Python models or numpy runs here,
on Forge, next to it (Viktor 30.09.2026: «Считай всё на Големе… Он для этого и
собирался»). The page calls it at the same host, port 41870.

  GET /health
  GET /gloss?name=TAKE[&force=1]   Whisper against the take's lyrics: the result when it is
                                   there, else {"status": "running" | "queued"} and a job starts
  GET /gloss?name=TAKE&cached=1    only an earlier measurement, 404 if there is none
  GET /spectrum?name=TAKE          the take's spectrum (spectrum_job.py), its binary block when
                                   ready, {"status": …} with 202 while it is computed
  GET /stems?name=TAKE&mode=vocals|four   split into stems (stems_job.py, BS-Roformer + htdemucs_ft)
  GET /arts                        HERESY 1120: every take that has artwork (name -> time), the ones being drawn;
                                   HERESY 1156: the unseen (its subject not found by the critic: a guess)
  GET /art?name=TAKE               its artwork (JPEG, 768 px)
  GET /art/draw?name=TAKE[&again=1][&seed=N]   draw it (art_job.py): 202 while drawing, then what was drawn; a redraw keeps the old picture in artwork-removed/ (1235)
  GET /art/remove?name=TAKE        HERESY 1156: the picture taken off, kept beside the take (artwork-removed/)
  POST /artist/draw {prompt, shapes, seed, count, painter, take}   HERESY 1255: the Artist room (artist.py): a run of pictures
       from a prompt of one's own; GET /artist/runs · GET /artist/file?id=&file= · POST /artist/cover {id, file, name} ·
       POST /artist/trash {id} · POST /artist/restore {id} · GET /artist/prompt?name=TAKE ·
       POST /artist/star {id, file, star} (1257) · POST /artist/stop {id} (1270)
  GET  /fonts/NAME.woff2           HERESY 1274: the page's fonts (lab/fonts/, OFL), cached a year
  POST /jobs/cancel {key}          HERESY 1165: a job waiting for a card off the queue (a running one is refused)
  POST /regen {names, same_seeds}  HERESY 1160: made again, new seeds; same_seeds (1165): its own, at a probe's full length
  GET /activity?since=SEQ          HERESY 1157: the lab's GPU work as it starts and ends, and what runs now
  POST /regen {names}              HERESY 1160: made again with new seeds; the new take takes the old one's places
  GET /remaster?name=TAKE&s=JSON   the Debunker v6 pipeline (remaster_job.py) on the take or its stems
  POST /import?file=NAME&title=T   a track from elsewhere (WAV, FLAC, MP3: a SUNO track…) as the body:
                                   becomes an ordinary take in the library, 48 kHz 24-bit, marked imported
  POST /lyrics?name=TAKE           the body (text) becomes the take's lyrics, for the lyrics check
  GET /upscale?name=TAKE&mode=subtle|normal|high|extreme[&source=derived/…][&variants=1|2][&keep=0]
                                   UniverSR redraws the top (upscale_job.py); keep=1 (default) keeps
                                   the original below the cutoff
  GET /inspect?name=TAKE[&source=derived/…][&force=1|&cached=1]   artifacts (inspect_job.py): tones, the VAE's
                                   frame buzz, clicks, clipping, dropouts, DC, stereo, loudness
  GET /debuzz?name=TAKE[&source=derived/…][&strength=0.8]   the VAE's 25-frame ripple out of the highs
                                   (debuzz.py), a new branch of the tree with its measure in and out
  GET /textend?name=TAKE[&force=1|&cached=1]   where the text of a reading ends (Whisper), for
                                   "Trim to the text": the frames to keep of the take's own tokens
  GET /derived?name=TAKE           everything made from a take: outputs/TAKE/derived/*/manifest.json
  GET /file?name=TAKE&path=derived/…     a derived file, with Range (the page's players seek)
  GET /settings · POST /settings   the page's own settings (its yue2.* keys) kept on disk in the
                                   studio's user/ folder (user/settings.json), so a cleared
                                   browser or another device gets them back
  GET /catalog · POST /collection   the Collection: every take with what is made from it, hidden,
                                   workspaces (user/collection.json); ops hide/show/ws-*/trash-days
  GET /trash · POST /trash         takes in KIT/trash/DATE/: list; move, restore, empty (asked first)
  POST /export · GET /export?id · GET /exportfile?id    a ZIP of chosen takes, built as a job
  GET /dawproject?name=TAKE      the take as a DAWproject in its derived/ (the engine serves it): mix + stems
  GET /timing?name=&fmt=json|lrc|srt[&force=1]   karaoke timing: lyric lines on Whisper's word times
  GET /train/datasets · /train/scan?name= · /train/prepare?name= · /train/run?name= · /train/log?name=
  POST /train/prepare {from, name, style, tracks} · /train/run {dataset, name, steps…} · /train/stop {name}
       /train/publish {name, file}: one epoch's checkpoint into loras/ (HERESY 1067)
       /train/archive {name, archived} · /train/delete {name, loras} (to trash/training/) · /train/restore {id}
       /train/purge {id} · /train/unpublish {name, lora} · GET /train/trash · /train/file?name=&file= (HERESY 1090)
  GET /gpus · POST /gpus {studio, train, jobs}: which card does what · POST /studio/restart (HERESY 1091)
       GET /train/listen?name= · POST /train/listen {dataset, model} · POST /train/styles {dataset, trigger, shared, tags} (1078)
       GET /train/starter · POST /train/starter {name}: the starter sets from Hugging Face into datasets/raw/ (HERESY 1100)
       GET /collection/diamonds · POST /collection/diamonds {name, restore}: the 💎 workspaces from Hugging Face (HERESY 1166)
       GET /weights · POST /weights/check · POST /weights/fetch {part | backbone | listener | artwork | trainer}: what the
       install brings, here or not, fetched again by heresy/fetch-heresy.sh, and the extras (weights.py, HERESY 1289)
  GET /daw                       which DAWs the studio's machine has: REAPER, Waveform, … (HERESY 1102)
  POST /daw/reaper {name, midi}  the take as a REAPER project in its derived/ (the engine serves it); midi: the
                                 page's MIDI of the score, base64 (HERESY 1104)
                                   LoRA training through AI-Toolkit (training.py)
  POST /chain {name, debuzz, strength, upscale, upscale_mode, stems, stems_mode, remaster: {…}, upscale_end,
             upscale_end_mode, inspect, spectrum, gloss} · GET /chain?name=   Post's steps in order, each on the file
             before: Debuzz, Upscale, Stems, Remaster (from the stems when they are split), Upscale at the end
  GET /writer[?id] · POST /writer  the Writer's notebook (KIT/writer/ID.json): documents with STYLE,
                                   LYRICS, NOTES, PARAMS, their takes and versions; ops put, snapshot, link,
                                   restore, delete (into writer/.trash)
  GET /presets · POST /presets     saved styles and profiles (presets.json in the same folder):
                                   {op: put|delete, kind: style|setup, name, data}
  /gloss and /spectrum take &source=derived/… to work on a derived file instead of the take

Asynchronous (Viktor 30.09.2026): a request never waits for the job. Jobs run in a
background thread, one heavy job at a time, in their own process on the GPU with the most
free memory, and leave VRAM when they end. The page asks again every two seconds.
"""
import base64, collections, json, os, re, shutil, subprocess, sys, threading, time, urllib.error, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
OUTPUTS = KIT / "outputs"
CACHE = HERE / "cache"
WHISPER_DIR = KIT / "whisper" / "whisper-large-v3-ct2-float16"
# HERESY 1021: everything inside the Kit (Viktor: «Ничего не привязываем к извне»). The lab's own
# venv has torch, audio-separator, faster-whisper and numpy; cuDNN 9 and cuBLAS come with torch.
LAB_PY = Path(os.environ.get("LAB_PY", HERE.parent / ".venv/bin/python"))   # HERESY 1080: the studio's one environment
WHISPER_PY = Path(os.environ.get("LAB_WHISPER_PY", LAB_PY))
NV = Path(os.environ.get("LAB_NVIDIA_LIBS", HERE.parent / ".venv/lib/python3.12/site-packages/nvidia"))
PORT = int(os.environ.get("LAB_PORT", "41870"))
NEED_MB = 5000                     # large-v3 float16 with room for a 7-minute song (UniverSR in 20 s chunks: ~10 GB)

sys.path.insert(0, str(HERE))
import gloss_core  # noqa: E402
import collection  # noqa: E402   HERESY 1041
import writer  # noqa: E402   HERESY 1047
import timing  # noqa: E402   HERESY 1056
import training  # noqa: E402   HERESY 1063
import dawproject  # noqa: E402   HERESY 1074
import gpu_roles  # noqa: E402   HERESY 1091
import starter  # noqa: E402   HERESY 1100
import gpu_guard  # noqa: E402   HERESY 1112
import api  # noqa: E402   HERESY 1116
import dawbridge  # noqa: E402   HERESY 1102
import rpp  # noqa: E402   HERESY 1104
import diamond  # noqa: E402   HERESY 1166
import updates  # noqa: E402   HERESY 1169
import artist  # noqa: E402   HERESY 1255
import places  # noqa: E402   HERESY 1261: where the user's work lives (outputs, trash, artist, writer)
import gpu_live  # noqa: E402   HERESY 1264: the cards second by second, for the page's live graphs
import weights  # noqa: E402   HERESY 1289: the Engine's Models card over heresy/fetch-heresy.sh

heavy = threading.Lock()
jobs = {}            # take name -> {"status": "queued" | "running" | "failed", "error": …, "started": …}
jobs_lock = threading.Lock()
OFF_QUEUE = "taken off the queue"


class Cancelled(Exception):
    """HERESY 1165: a job taken off the queue while it waited for its turn; it runs nothing."""


class turn:
    """HERESY 1165 (Viktor: «возможность удалить из очереди то или иное ожидающее действо»): the lab's one heavy lock
    for a job of the queue. A job taken off while it waited (POST /jobs/cancel) runs nothing when its turn comes: it
    ends failed with that reason, which the page's pollers already show and stop on, and a new request starts it anew."""

    def __init__(self, job):
        self.job = job

    def __enter__(self):
        heavy.acquire()
        with jobs_lock:
            if self.job is not None and self.job.get("cancel"):
                heavy.release()
                raise Cancelled(OFF_QUEUE)
            if self.job is not None:
                self.job["status"] = "running"
        return self

    def __exit__(self, *exc):
        heavy.release()
        return False


def job_cancel(key):
    """A job that waits for a card, off the queue; one already running is refused (it has its own Stop where it shows)."""
    with jobs_lock:
        job = jobs.get(key)
        if not job:
            raise FileNotFoundError("no such job in the queue")
        if job.get("status") != "queued":
            raise ValueError("it is already running: only a waiting job comes off the queue")
        job.update(status="failed", error=OFF_QUEUE, cancel=True)
    kind, _, name = key.partition(":")
    act_say(f"{ACT_SAY.get(kind, kind)} · {name.split(':')[0] or kind} · {OFF_QUEUE}")
    return {"cancelled": key}


def free_gpu(need=None, role="jobs"):
    """A card for a job, through the guard (HERESY 1112, 1113): no heavy stranger on it (a service above 2 GiB), and room
    for the job.
    The cards given to `role` first (HERESY 1091: user/gpus.json), the most free first; then, for the lab's jobs, any
    card the guard passes; training stays on its own cards. None will do: refused aloud, card by card."""
    need = need or NEED_MB
    try:
        allowed = gpu_roles.load(KIT, training.gpus()).get(role) or []
        card, cards = gpu_guard.pick(allowed, fallback=(role == "jobs"), need_mb=need)
    except (OSError, subprocess.SubprocessError) as e:
        raise RuntimeError(f"the cards could not be read: {e}")
    if not card:
        raise RuntimeError(f"no card can take this now (it needs {need} MB): {gpu_guard.verdict(cards)}."
                           " Engine \u2192 GPUs says which card does what")
    return card["index"], card["free_mb"]


ART_WAIT_S = 3 * 3600              # HERESY 1167: how long an artwork waits in the queue for a card


def wait_card(job, need, what):
    """HERESY 1167 (Viktor: «Artwork не ставится в очередь»): a job that needs a card stands in the queue until one has
    room for it, instead of failing at once. The guard is asked every ten seconds, outside the lab's one heavy lock (the
    other jobs go on meanwhile); its verdict is kept in the job (job["waiting"]) and said in the activity once; taken off
    the queue (POST /jobs/cancel) the job ends; after ART_WAIT_S it fails, saying why."""
    t0, said = time.time(), False
    while True:
        if job.get("cancel"):
            raise Cancelled(OFF_QUEUE)
        try:
            return free_gpu(need)
        except RuntimeError as e:
            if time.time() - t0 > ART_WAIT_S:
                raise RuntimeError(f"no card came free in {ART_WAIT_S // 3600} hours: {e}")
            job["waiting"] = str(e)
            if not said:                               # the activity says «waits for a card» itself: here, why
                act_say(f"{what} · {e}")
                said = True
            time.sleep(10)


def whisper_env():
    """HERESY 1141: the environment for a Whisper job: a card the guard gives, else the CPU (int8, slower: about the
    song's own length on 16 threads), said in the job's result. (env, device, why)"""
    base = dict(os.environ, LD_LIBRARY_PATH=f"{NV}/cudnn/lib:{NV}/cublas/lib:" + os.environ.get("LD_LIBRARY_PATH", ""))
    try:
        gpu, _ = free_gpu()
        return dict(base, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", WHISPER_DEVICE="cuda"), gpu, ""
    except RuntimeError as e:
        return dict(base, CUDA_VISIBLE_DEVICES="", WHISPER_DEVICE="cpu"), "cpu", f"on the CPU: {e}"


LIVE_ROLES = {"at": 0.0, "value": None}


def live_roles():
    """HERESY 1264: what each card is given to and what trains on it, for the live graphs' labels; read again every 15 s."""
    if LIVE_ROLES["value"] is None or time.time() - LIVE_ROLES["at"] > 15:
        try:
            s = gpus_state()
            r = s["roles"]
            LIVE_ROLES["value"] = {"studio": s["studio_now"] if s.get("studio_now") is not None else r["studio"],
                                   "train": r["train"], "jobs": r["jobs"], "training": s.get("training", {})}
        except Exception as e:                          # the graphs go on without their labels
            LIVE_ROLES["value"] = {"error": str(e)}
        LIVE_ROLES["at"] = time.time()
    return LIVE_ROLES["value"]


def gpus_state():
    """HERESY 1091: the cards, what each is given to, what runs on it now; the studio's card as saved and as
    running (they differ until a restart); and whether the studio's card is training (the page waits then)."""
    cards = training.gpus()
    roles = gpu_roles.load(KIT, cards)
    live = {}                                           # the live runs only (the full history is heavy to read)
    for name, job in list(training.RUNS.items()):
        if job.get("status") in ("running", "stopping"):
            g = training._meta(training.paths(KIT)["runs"] / name).get("gpu")
            if g is not None:
                live[int(g)] = name
    now = gpu_roles.studio_now()
    studio = now if now is not None else roles["studio"]
    try:                                                # HERESY 1140: the guard's verdict, card by card, as the jobs get it
        guard = [dict(c, foreign=[{"pid": p, "name": n, "mb": mb, "heavy": mb > gpu_guard.HEAVY_MB} for p, n, mb in c["foreign"]])
                 for c in gpu_guard.snapshot()]
    except (OSError, RuntimeError, subprocess.SubprocessError) as e:
        guard = {"error": str(e)}
    return {"cards": cards, "roles": roles, "saved": gpu_roles.path(KIT).is_file(), "studio_now": now, "guard": guard,
            "training": {str(g): n for g, n in live.items()},
            "studio_training": live.get(studio)}


def studio_restart():
    """Restart the studio (a new card for it, from user/gpus.json), only when it is not rendering."""
    port = os.environ.get("YUE2CPP_PORT", "41867")
    import urllib.request
    try:
        hw = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/hardware", timeout=5))
    except (OSError, ValueError) as e:
        raise RuntimeError(f"the studio does not answer: {e}")
    if hw.get("busy"):
        raise ValueError("the studio is rendering now: restart it when the run is done")
    # HERESY 1259: only a studio that runs as its systemd unit is restarted from here. Under Pinokio or by hand (./start.sh) there is
    # no unit: «restarting» was a word for nothing, and the page then said the studio was back. The card is saved all the same.
    if subprocess.run(["systemctl", "--user", "is-active", "--quiet", "ruach-studio"], timeout=10).returncode != 0:
        raise ValueError("the studio does not run as a service here (Pinokio, or ./start.sh by hand): stop it and start it again "
                         "there to move it; the card is saved")

    def later():
        time.sleep(1)
        subprocess.run(["systemctl", "--user", "restart", "ruach-studio"], timeout=120)
    threading.Thread(target=later, daemon=True).start()
    return {"status": "restarting"}


def take_dir(name):
    if not name or "/" in name or name.startswith("."):
        raise ValueError("bad take name")
    d = OUTPUTS / name
    if not (d / "request.json").is_file():
        raise FileNotFoundError(f"no take {name}")
    return d


def lyrics_language(lyrics):
    cyr = sum("Ѐ" <= c <= "ӿ" for c in lyrics)
    lat = sum(c.isascii() and c.isalpha() for c in lyrics)
    return "ru" if cyr > lat else "en"


def source_of(name, source):
    """The take's audio, or a derived file inside its folder (never outside it)."""
    d = take_dir(name)
    if not source:
        return next((d / f for f in ("audio.wav", "audio.flac", "audio.mp3") if (d / f).is_file()), None), ""
    p = (d / source).resolve()
    if d.resolve() not in p.parents or not p.is_file():
        raise ValueError("bad source")
    return p, "." + source.replace("/", "_")


def gloss(name, force=False, cached_only=False, source="", job=None):
    d = take_dir(name)
    CACHE.mkdir(exist_ok=True)
    src_audio, tag = source_of(name, source)
    cached = CACHE / f"{name}{tag}.gloss.json"
    req = json.load(open(d / "request.json", encoding="utf-8"))
    if cached.is_file() and not force:
        return json.load(open(cached, encoding="utf-8"))
    if cached_only:
        raise FileNotFoundError(f"{name} has not been measured yet")
    audio = src_audio
    if not audio:
        raise FileNotFoundError(f"no audio in {name}")
    lang = lyrics_language(req.get("lyrics", ""))
    with turn(job):                                      # HERESY 1165: off the queue while it waits
        env, gpu, why = whisper_env()                    # HERESY 1141: a card, or the CPU when none can take it
        raw = CACHE / f"{name}{tag}.whisper.json"
        t0 = time.time()
        p = subprocess.run([str(WHISPER_PY), str(HERE / "whisper_job.py"), str(audio), str(raw), lang, str(WHISPER_DIR)],
                           env=env, capture_output=True, text=True, timeout=1800)
        if p.returncode != 0:
            raise RuntimeError("Whisper failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1])
    w = json.load(open(raw, encoding="utf-8"))
    result = gloss_core.measure(w, req.get("lyrics", ""))
    result.update(name=name, source=source, language=lang, gpu=gpu, took=round(time.time() - t0, 1), device_note=why,
                  load_s=w.get("load_s"), listen_s=w.get("listen_s"), model="whisper-large-v3 (float16)",
                  at=time.strftime("%Y-%m-%d %H:%M"))
    json.dump(result, open(cached, "w", encoding="utf-8"), ensure_ascii=False)
    return result


def gloss_async(name, force=False, source=""):
    """The result if it is ready; otherwise the job's state, starting the job if needed."""
    take_dir(name)                                  # a bad name fails here, at once
    _, tag = source_of(name, source)
    cached = CACHE / f"{name}{tag}.gloss.json"
    key = name + tag
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed" and not force:
            jobs.pop(key)                           # report once, then allow a new try
            return dict(job, name=name)
        if cached.is_file() and not force:
            return json.load(open(cached, encoding="utf-8"))
        job = {"status": "queued", "started": time.time()}
        jobs[key] = job

    def work():
        try:
            job["status"] = "running" if not heavy.locked() else "queued"
            gloss(name, force=True, source=source, job=job)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:                      # kept for the next poll to report
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1056: karaoke timing. Whisper with word times (cached apart from the lyrics check, which
# it does not touch), then the lyric lines aligned to the heard words (timing.py). A change of the
# lyrics re-aligns without hearing the take again.
def timing_async(name, force=False, cached_only=False):
    d = take_dir(name)
    lyrics = json.load(open(d / "request.json", encoding="utf-8")).get("lyrics", "")
    if not timing.rows_of(lyrics):
        raise ValueError("this take has no lyrics to time")
    audio, _ = source_of(name, "")
    if not audio:
        raise FileNotFoundError(f"{name} has no audio")
    CACHE.mkdir(exist_ok=True)
    out, words = CACHE / f"{name}.timing.json", CACHE / f"{name}.words.json"
    key = "timing:" + name
    newest = max(audio.stat().st_mtime, (d / "request.json").stat().st_mtime)
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed" and not force:
            jobs.pop(key)
            return dict(job, name=name)
        if out.is_file() and not force and out.stat().st_mtime >= newest:
            return json.load(open(out, encoding="utf-8"))
        if cached_only:
            raise FileNotFoundError("not timed yet")
        job = {"status": "queued", "started": time.time(), "kind": "timing"}
        jobs[key] = job

    def work():
        try:
            lang = timing.language(lyrics)
            if force or not words.is_file() or words.stat().st_mtime < audio.stat().st_mtime:
                with turn(job):
                    job["status"] = "running"
                    env, gpu, why = whisper_env()        # HERESY 1141
                    job["gpu"] = gpu
                    part = Path(str(words) + ".part")
                    p = subprocess.run([str(WHISPER_PY), str(HERE / "whisper_job.py"), str(audio), str(part), lang or "",
                                        str(WHISPER_DIR), "words"], env=env, capture_output=True, text=True, timeout=1800)
                    if p.returncode != 0:
                        raise RuntimeError("Whisper failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                    os.replace(part, words)
            job["status"] = "running"
            rows = timing.align(json.load(open(words, encoding="utf-8")), lyrics)
            res = {"name": name, "language": lang or "auto", "rows": rows,
                   "heard": round(sum(not r["guessed"] for r in rows) / len(rows), 3), "at": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1020: the spectrum, computed here instead of in the browser. CPU only, so it does not
# wait for the GPU lock; one at a time of its own. Needs numpy: the Whisper venv's python.
NUMPY_PY = Path(os.environ.get("LAB_NUMPY_PY", LAB_PY))
cpu = threading.Lock()


def spectrum_file(name, source=""):
    audio, tag = source_of(name, source)
    if not audio or not audio.is_file():
        raise FileNotFoundError(f"{name} has no audio")
    CACHE.mkdir(exist_ok=True)
    out = CACHE / f"{name}{tag}.spec"
    if out.is_file() and out.stat().st_mtime >= audio.stat().st_mtime:
        return out
    with cpu:
        tmp = CACHE / f"{name}{tag}.spec.part"
        p = subprocess.run([str(NUMPY_PY), str(HERE / "spectrum_job.py"), str(audio), str(tmp)],
                           capture_output=True, text=True, timeout=600)
        if p.returncode != 0:
            raise RuntimeError("spectrum failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1])
        tmp.replace(out)
    return out


def spectrum_async(name, source=""):
    """The file when it is ready; otherwise the job's state, starting the job if needed."""
    audio, tag = source_of(name, source)
    out = CACHE / f"{name}{tag}.spec"
    key = "spectrum:" + name + tag
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed":
            jobs.pop(key)
            return dict(job, name=name)
        if out.is_file() and audio and audio.is_file() and out.stat().st_mtime >= audio.stat().st_mtime:
            return out
        job = {"status": "running", "started": time.time()}
        jobs[key] = job

    def work():
        try:
            spectrum_file(name, source)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1021: stems, and the tree of what is made from a take. Each derived thing is a folder
# outputs/TAKE/derived/ID/ with a manifest.json (kind, parent, models, files, when): deleting
# the take in the library deletes its children with it.
def derived_list(name):
    d = take_dir(name) / "derived"
    out = []
    for m in sorted(d.glob("*/manifest.json")) if d.is_dir() else []:
        try:
            out.append(json.load(open(m, encoding="utf-8")))
        except ValueError:
            pass
    with jobs_lock:
        running = [dict(v, key=k) for k, v in jobs.items()
                   if any(k.startswith(kind + ":" + name) for kind in ("stems", "remaster", "upscale", "debuzz"))]
    return {"name": name, "derived": out, "running": running}


def stems_async(name, mode, source=""):
    if mode not in ("vocals", "four"):
        raise ValueError("mode is vocals or four")
    d = take_dir(name)
    audio, did, key = d / "audio.wav", f"stems-{mode}", f"stems:{name}:{mode}"
    # HERESY 1169 (Viktor 08.10.2026: «Апскейлер нужен в двух местах - перед разделением на стемы…»): stems from a file of
    # the tree (a debuzzed or an upscaled take) are a set of their own beside the take's, their source in the manifest;
    # the same file split again answers with the set it gave
    if source:
        audio = source_of(name, source)[0]
        for man in sorted(d.glob(f"derived/stems-{mode}-*/manifest.json")):
            try:
                made = json.load(open(man, encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if made.get("source") == source:
                return made
        did, key = f"stems-{mode}-" + time.strftime("%Y%m%d-%H%M%S"), f"stems:{name}:{mode}:{source}"
    target = d / "derived" / did
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed":
            jobs.pop(key)
            return dict(job, name=name)
        if (target / "manifest.json").is_file():
            return json.load(open(target / "manifest.json", encoding="utf-8"))
        job = {"status": "queued", "started": time.time(), "kind": "stems", "mode": mode, "id": did}
        jobs[key] = job

    def work():
        try:
            with turn(job):
                job["status"] = "running"
                gpu, free = free_gpu(8000)             # BS-Roformer and htdemucs_ft
                job["gpu"] = gpu                       # HERESY 1157: said in the activity log and the bar's lamp
                env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID")
                tmp = d / "derived" / (did + ".part")
                shutil.rmtree(tmp, ignore_errors=True)
                p = subprocess.run([str(LAB_PY), str(HERE / "stems_job.py"), str(audio), str(tmp), mode],
                                   env=env, capture_output=True, text=True, timeout=3600)
                if p.returncode != 0:
                    raise RuntimeError("stems failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                r = json.loads(p.stdout.strip().splitlines()[-1])
            manifest = {"id": did, "kind": "stems", "parent": name, "mode": mode, "source": source or "the take", "models": r["models"],
                        "files": [dict(s, path=f"derived/{did}/{s['file']}") for s in r["stems"]],
                        "took": r["took"], "gpu": gpu, "created": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(manifest, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            shutil.rmtree(target, ignore_errors=True)
            tmp.rename(target)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1022: the Debunker v6 (lab/debunker.py) as a job. CPU and ffmpeg only, so it does not
# wait for the GPU; one at a time of its own. Each run is its own derived folder: remasters with
# different settings stand side by side in the tree, to be compared.
def remaster_async(name, settings):
    d = take_dir(name)
    try:
        cfg = json.loads(settings or "{}")
    except ValueError:
        raise ValueError("settings are not JSON")
    src = cfg.get("source") or ""
    if src and not (d / src / "manifest.json").is_file():
        if not (src.startswith("derived/") and source_of(name, src)[0]):   # HERESY 1030: or one file of the tree
            raise ValueError("no such stems: " + src)
    did = "remaster-" + time.strftime("%Y%m%d-%H%M%S")
    key = f"remaster:{name}:{did}"
    job = {"status": "queued", "started": time.time(), "kind": "remaster", "id": did}
    with jobs_lock:
        jobs[key] = job

    def work():
        try:
            with cpu:
                job["status"] = "running"
                tmp = d / "derived" / (did + ".part")
                tmp.mkdir(parents=True, exist_ok=True)
                cfgfile = tmp / "settings.json"
                json.dump(cfg, open(cfgfile, "w", encoding="utf-8"), ensure_ascii=False)
                p = subprocess.run([str(LAB_PY), str(HERE / "remaster_job.py"), str(d), str(tmp), str(cfgfile)],
                                   capture_output=True, text=True, timeout=3600)
                if p.returncode != 0:
                    raise RuntimeError("remaster failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                r = json.loads(p.stdout.strip().splitlines()[-1])
            secs = seconds_of(next((tmp / f["file"] for f in r["files"] if f["format"] in ("wav", "flac")), None))   # HERESY 1059
            manifest = {"id": did, "kind": "remaster", "parent": name, "source": src or "the take",
                        "models": ["Debunker v6.1"], "settings": cfg, "lufs_in": r["lufs_in"], "lufs_out": r["lufs_out"],
                        "files": [dict(f, path=f"derived/{did}/{f['file']}", seconds=secs) for f in r["files"] if f["format"] in ("wav", "flac")],
                        "took": r["took"], "created": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(manifest, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            tmp.rename(d / "derived" / did)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1023: a track from elsewhere becomes a take like the Kit's own, so every tool in Post
# works on it (Viktor: «чтобы в Ките даже СУНО треки препарировать»). The file is converted to
# the Kit's own format, 48 kHz 24-bit WAV; the original is kept beside it.
def seconds_of(path):
    """A file's length by ffprobe; None (said as unknown, not 0:00) when it cannot tell."""
    if not path or not Path(path).is_file():
        return None
    try:
        p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                           capture_output=True, text=True, timeout=30)
        return round(float(p.stdout.strip()), 2)
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def slug(text):
    import re, unicodedata
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40] or "track"


def import_track(filename, title, body):
    ext = Path(filename).suffix.lower()
    if ext not in (".wav", ".flac", ".mp3", ".m4a", ".ogg", ".aiff", ".aif"):
        raise ValueError("WAV, FLAC, MP3, M4A, OGG or AIFF")
    title = (title or Path(filename).stem).strip()[:200]
    name = time.strftime("%Y%m%d-%H%M%S") + "-01-import-" + slug(title)
    d = OUTPUTS / name
    d.mkdir(parents=True)
    original = d / ("original" + ext)
    original.write_bytes(body)
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(original), "-ac", "2", "-ar", "48000",
                        "-c:a", "pcm_s24le", str(d / "audio.wav")], capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        shutil.rmtree(d, ignore_errors=True)
        raise ValueError("ffmpeg could not read it: " + (p.stderr.strip().splitlines() or ["?"])[-1])
    import wave
    w = wave.open(str(d / "audio.wav"))
    secs = w.getnframes() / w.getframerate()
    json.dump({"title": title, "created": int(time.time()), "seconds": secs, "format": "wav24", "favorite": False,
               "truncated": False, "render_seconds": 0, "song": 0, "variation": 0, "provided_score": False,
               "model": "import"}, open(d / "meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=4)
    json.dump({"title": title, "style": "imported: " + filename, "lyrics": "", "cot": "off",
               "imported": {"file": filename, "bytes": len(body), "at": time.strftime("%Y-%m-%d %H:%M")}},
              open(d / "request.json", "w", encoding="utf-8"), ensure_ascii=False)
    return {"name": name, "title": title, "seconds": round(secs, 2)}


# HERESY 1027: the page's settings on disk, per platform, as other desktop programs keep theirs.
# HERESY 1066 (Viktor): the user's settings live in the studio itself, user/ (git ignores it): a
# single-user system leaves nothing in ~/.config. The first start copies what the old place held
# (~/.config/yue2_os, from the YuE2 OS days) and leaves the old folder as it was.
USER_DIR = KIT / "user"


def config_dir():
    if not (USER_DIR / "settings.json").exists():
        old = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "yue2_os"
        if old.is_dir():
            USER_DIR.mkdir(parents=True, exist_ok=True)
            for f in old.iterdir():
                if f.is_file() and not (USER_DIR / f.name).exists():
                    shutil.copy2(f, USER_DIR / f.name)
    USER_DIR.mkdir(parents=True, exist_ok=True)
    return USER_DIR


SETTINGS_LOCK = threading.Lock()


def scoped(stem, scope):
    """settings.json, or settings-SCOPE.json for a page opened with ?scope=SCOPE: a test page
    (Claude's, on another port) must never write into the file Viktor's browser keeps."""
    scope = (scope or "").strip()
    if scope and not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", scope):
        raise ValueError("bad scope")
    return config_dir() / (f"{stem}-{scope}.json" if scope else f"{stem}.json")


def settings_get(scope=""):
    p = scoped("settings", scope)
    if not p.is_file():
        return {"saved_at": 0, "keys": {}}
    return json.load(open(p, encoding="utf-8"))


def settings_put(body, scope=""):
    """Merge: the page sends the keys it changed and the ones it removed on purpose; keys it
    does not mention stay. {"reset": true} empties the file (the Engine room's button)."""
    data = json.loads(body.decode("utf-8"))
    keys, removed = data.get("keys") or {}, data.get("removed") or []
    ok = lambda k: isinstance(k, str) and k.startswith("yue2.")
    if not isinstance(keys, dict) or not all(ok(k) and isinstance(v, str) for k, v in keys.items()) or not all(ok(k) for k in removed):
        raise ValueError("expected {saved_at, keys: {yue2.*: string}, removed: [yue2.*]}")
    d = config_dir()
    d.mkdir(parents=True, exist_ok=True)
    p = scoped("settings", scope)
    with SETTINGS_LOCK:
        was = settings_get(scope)
        cur = {} if data.get("reset") else was.get("keys", {})
        cur.update(keys)
        for k in removed:
            cur.pop(k, None)
        # HERESY 1261: the parts of the file the page does not own (places' "paths") stay through its saves and its Reset
        out = {k: v for k, v in was.items() if k not in ("saved_at", "keys")}
        out.update(saved_at=float(data.get("saved_at") or time.time()), keys=cur)
        if p.is_file():
            shutil.copy2(p, str(p) + ".bak")               # one step back, if a write ever goes wrong
        tmp = Path(str(p) + ".part")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        os.replace(tmp, p)
    return {"ok": True, "path": str(p), "keys": len(cur)}


# HERESY 1032: the library of styles and profiles (presets.json beside settings.json)
def presets_get(scope=""):
    p = scoped("presets", scope)
    if not p.is_file():
        return {"styles": [], "setups": [], "textprofiles": [], "briefs": []}
    d = json.load(open(p, encoding="utf-8"))
    return {"styles": d.get("styles", []), "setups": d.get("setups", []), "textprofiles": d.get("textprofiles", []),
            "briefs": d.get("briefs", [])}            # HERESY 1167: the Writer's briefs, kept by name


def presets_put(body, scope=""):
    data = json.loads(body.decode("utf-8"))
    kind, name, op = data.get("kind"), str(data.get("name") or "").strip(), data.get("op", "put")
    if kind not in ("style", "setup", "textprofile", "brief") or not name or len(name) > 120:   # HERESY 1043; 1167: briefs
        raise ValueError("expected {op: put|delete, kind: style|setup|brief, name, data}")
    key = kind + "s"
    d = config_dir()
    d.mkdir(parents=True, exist_ok=True)
    p = scoped("presets", scope)
    with SETTINGS_LOCK:
        cur = presets_get(scope)
        items = [x for x in cur[key] if x.get("name") != name]
        if op == "put":
            item = {"name": name, "saved": time.strftime("%Y-%m-%d %H:%M")}
            if kind in ("style", "brief"):
                text = data.get("data")
                if not isinstance(text, str) or not text.strip():
                    raise ValueError(f"a {kind} is a text")
                item["text"] = text
            else:
                if not isinstance(data.get("data"), dict):
                    raise ValueError("a profile is an object of settings")
                item["request"] = data["data"]
            items.append(item)
            items.sort(key=lambda x: x["name"].lower())
        elif op != "delete":
            raise ValueError("op is put or delete")
        cur[key] = items
        if p.is_file():
            shutil.copy2(p, str(p) + ".bak")
        tmp = Path(str(p) + ".part")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cur, f, ensure_ascii=False, indent=1)
        os.replace(tmp, p)
    return cur


def set_lyrics(name, text):
    d = take_dir(name)
    r = json.load(open(d / "request.json", encoding="utf-8"))
    r["lyrics"] = text
    json.dump(r, open(d / "request.json", "w", encoding="utf-8"), ensure_ascii=False)
    for f in CACHE.glob(f"{name}*.gloss.json"):      # a measurement against the old lyrics no longer holds
        f.unlink()
    return {"name": name, "lines": len([l for l in text.splitlines() if l.strip()])}


# HERESY 1024: UniverSR upscaling. GPU, so it queues with the stems and Whisper; one run per
# mode and source is its own branch of the tree, its variants side by side to compare.
HF_HOME = KIT / "hf_cache"                     # the model's weights live in the Kit too


def upscale_async(name, mode, source="", variants=2, keep=True, ceiling=None):
    if mode not in ("subtle", "normal", "high", "extreme"):
        raise ValueError("mode is subtle, normal, high or extreme")
    d = take_dir(name)
    audio, tag = source_of(name, source)
    if not audio:
        raise FileNotFoundError(f"{name} has no audio")
    did = f"upscale-{mode}-" + time.strftime("%Y%m%d-%H%M%S")
    key = f"upscale:{name}:{did}"
    job = {"status": "queued", "started": time.time(), "kind": "upscale", "mode": mode, "id": did}
    with jobs_lock:
        jobs[key] = job

    def work():
        try:
            with turn(job):
                job["status"] = "running"
                gpu, free = free_gpu(11000)            # UniverSR on 20 s chunks peaks near 10 GB
                job["gpu"] = gpu
                tmp = d / "derived" / (did + ".part")
                tmp.mkdir(parents=True, exist_ok=True)
                env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", HF_HOME=str(HF_HOME))
                seeds = ",".join(str(1000 + i) for i in range(max(1, min(int(variants), 4))))
                p = subprocess.run([str(LAB_PY), str(HERE / "upscale_job.py"), str(audio), str(tmp), mode, seeds,
                                    "keep" if keep else "all"] + ([str(float(ceiling))] if ceiling is not None else []),
                                   env=env, capture_output=True, text=True, timeout=7200)
                if p.returncode != 0:
                    raise RuntimeError("upscale failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                r = json.loads(p.stdout.strip().splitlines()[-1])
            manifest = {"id": did, "kind": "upscale", "parent": name, "mode": mode, "source": source or "the take",
                        "models": ["UniverSR (universr-audio)"], "input_sr": r["input_sr"], "cutoff_hz": r["cutoff_hz"],
                        "keep_low": r["keep_low"], "gpu": gpu, **({"ceiling_db": r["ceiling_db"]} if r.get("ceiling_db") is not None else {}),
                        "files": [dict(f, path=f"derived/{did}/{f['file']}") for f in r["files"]],
                        "took": r["took"], "created": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(manifest, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            tmp.rename(d / "derived" / did)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1030: the VAE's frame ripple out of the highs (debuzz.py), a branch of the tree. CPU.
def debuzz_async(name, source="", strength=0.8, period=1920, rate=48000):
    strength = min(1.0, max(0.1, float(strength)))
    period, rate = int(period or 1920), int(rate or 48000)    # HERESY 1055: the model's, from the page's /props
    if not (256 <= period <= 16384 and 8000 <= rate <= 192000):
        raise ValueError("period or rate out of range")
    d = take_dir(name)
    audio, tag = source_of(name, source)
    if not audio:
        raise FileNotFoundError(f"{name} has no audio")
    did = f"debuzz-{round(strength * 100)}-" + time.strftime("%Y%m%d-%H%M%S")
    key = f"debuzz:{name}:{did}"
    job = {"status": "queued", "started": time.time(), "kind": "debuzz", "id": did}
    with jobs_lock:
        jobs[key] = job

    def work():
        try:
            with cpu:
                job["status"] = "running"
                tmp = d / "derived" / (did + ".part")
                tmp.mkdir(parents=True, exist_ok=True)
                p = subprocess.run([str(LAB_PY), str(HERE / "debuzz.py"), str(audio), str(tmp / "debuzz.flac"), str(strength),
                                    "2000", "50", "3", str(period), str(rate)],
                                   capture_output=True, text=True, timeout=3600)
                if p.returncode != 0:
                    raise RuntimeError("debuzz failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                r = json.loads(p.stdout.strip().splitlines()[-1])
            manifest = {"id": did, "kind": "debuzz", "parent": name, "source": source or "the take", "strength": strength,
                        "models": [f"frame fold ({period} samples)"], "measure": r,
                        "files": [{"name": f"debuzz {round(strength * 100)} %", "file": "debuzz.flac",
                                   "path": f"derived/{did}/debuzz.flac", "seconds": r["seconds"]}],
                        "took": r["took"], "created": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(manifest, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            tmp.rename(d / "derived" / did)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1034: where the text of a reading ends (textend_job.py), for "Trim to the text". Whisper
# on the freest GPU when one has room, on the CPU otherwise. Cached per take.
def textend_async(name, force=False, cached_only=False):
    d = take_dir(name)
    CACHE.mkdir(exist_ok=True)
    out = CACHE / f"{name}.textend.json"
    key = "textend:" + name
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed" and not force:
            jobs.pop(key)
            return dict(job, name=name)
        if out.is_file() and not force:
            return json.load(open(out, encoding="utf-8"))
        if cached_only:
            raise FileNotFoundError("not measured yet")
        job = {"status": "queued", "started": time.time(), "kind": "textend"}
        jobs[key] = job

    def work():
        try:
            with turn(job):
                job["status"] = "running"
                try:
                    gpu, _ = free_gpu(4500)
                    job["gpu"] = gpu
                    env, device = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID"), "cuda"
                except RuntimeError:
                    env, device = dict(os.environ, CUDA_VISIBLE_DEVICES=""), "cpu"
                p = subprocess.run([str(LAB_PY), str(HERE / "textend_job.py"), str(d), device],
                                   env=env, capture_output=True, text=True, timeout=3600)
                if p.returncode != 0:
                    raise RuntimeError("textend failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                r = json.loads(p.stdout.strip().splitlines()[-1])
                r["device"] = device
                json.dump(r, open(out, "w", encoding="utf-8"))
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1025: the artifact inspector. CPU and numpy; cached per take and source.
def inspect_async(name, source="", force=False, cached_only=False):
    audio, tag = source_of(name, source)
    if not audio:
        raise FileNotFoundError(f"{name} has no audio")
    CACHE.mkdir(exist_ok=True)
    out = CACHE / f"{name}{tag}.inspect.json"
    key = "inspect:" + name + tag
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed" and not force:
            jobs.pop(key)
            return dict(job, name=name)
        if out.is_file() and not force and out.stat().st_mtime >= audio.stat().st_mtime:
            return json.load(open(out, encoding="utf-8"))
        if cached_only:
            raise FileNotFoundError("not inspected yet")
        job = {"status": "queued", "started": time.time(), "kind": "inspect"}
        jobs[key] = job

    def work():
        try:
            with cpu:
                job["status"] = "running"
                p = subprocess.run([str(LAB_PY), str(HERE / "inspect_job.py"), str(audio), str(out) + ".part"],
                                   capture_output=True, text=True, timeout=1800)
                if p.returncode != 0:
                    raise RuntimeError("inspect failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                Path(str(out) + ".part").replace(out)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# ---- HERESY 1054: the chain (Viktor): Post's steps run in order, on Forge, one take at a time, each
# step working on the file the one before made: Debuzz (the YuE2 frame buzz) -> Upscale (optional) ->
# Remaster (always last but for the checks), then the checks on the final file (Artifacts, Spectrum),
# the lyrics on the take, and stems. The page only starts it and watches; closing it stops nothing.
CHAINS = {}


def _wait(key, timeout=7200):
    t0 = time.time()
    while True:
        with jobs_lock:
            j = jobs.get(key)
        if j is None:                                   # a job that ends well leaves the list
            return
        if j.get("status") == "failed":
            raise RuntimeError(j.get("error") or "failed")
        if time.time() - t0 > timeout:
            raise RuntimeError("took longer than " + str(timeout // 60) + " minutes")
        time.sleep(2)


def _follow(r, key):
    """A tool's answer: a job to wait for, a failure to say, or the result already made."""
    if isinstance(r, dict) and r.get("status") in ("queued", "running"):
        _wait(key)
    elif isinstance(r, dict) and r.get("status") == "failed":
        raise RuntimeError(r.get("error") or "failed")


def _first_file(d, did, fmt=("wav", "flac")):
    man = json.load(open(d / "derived" / did / "manifest.json", encoding="utf-8"))
    files = man.get("files") or []
    pick = next((f for f in files if str(f.get("path", "")).rsplit(".", 1)[-1] in fmt), files[0] if files else None)
    if not pick:
        raise RuntimeError(did + " made no file")
    return pick["path"]


def chain_async(name, spec):
    d = take_dir(name)
    with jobs_lock:
        job = CHAINS.get(name)
        if job and job["status"] == "running":
            return dict(job, name=name)
        # HERESY 1169 (Viktor 08.10.2026: «перепроверить пайплайн и его логичность. Апскейлер нужен в двух местах - перед
        # разделением на стемы и в конце после ремастера… По дефолту стеммер - four»): the stems come before the remaster,
        # split from the debuzzed (and upscaled) take instead of the raw one after it all, and the remaster mixes them: the
        # preset balances them and the de-esser has a voice of its own. The separators work at 44.1 kHz and the mix dulls
        # the top, so it may be drawn anew at the end, under the remaster's true-peak ceiling
        steps = []
        if spec.get("debuzz", True):
            steps.append({"step": "debuzz", "strength": min(1.0, max(0.1, float(spec.get("strength", 0.8))))})
        if spec.get("upscale"):
            steps.append({"step": "upscale", "mode": spec.get("upscale_mode") or "subtle"})
        if spec.get("stems"):
            steps.append({"step": "stems", "mode": spec.get("stems_mode") or "four"})
        steps.append({"step": "remaster", "settings": dict(spec.get("remaster") or {})})
        if spec.get("upscale_end"):
            steps.append({"step": "upscale", "mode": spec.get("upscale_end_mode") or "subtle", "end": True})
        for k in ("inspect", "spectrum", "gloss"):
            if spec.get(k):
                steps.append({"step": k})
        for st in steps:
            st["status"] = "waiting"
        job = {"status": "running", "started": time.time(), "kind": "chain", "steps": steps, "final": ""}
        CHAINS[name] = job

    def work():
        src, stems, st = "", "", None
        try:
            for st in steps:
                st["status"] = "running"
                job["current"] = st["step"]
                k = st["step"]
                if k == "debuzz":
                    r = debuzz_async(name, src, st["strength"], spec.get("period") or 1920, spec.get("rate") or 48000)
                    _follow(r, f"debuzz:{name}:{r['id']}")
                    src = _first_file(d, r["id"])
                elif k == "upscale":
                    ceiling = None
                    if st.get("end"):                   # the remaster's true-peak ceiling holds after the new top
                        rm = next(x for x in steps if x["step"] == "remaster")["settings"]
                        ceiling = float(rm.get("tp", -1)) if rm.get("loudnorm", True) else None
                    r = upscale_async(name, st["mode"], src, 1, True, ceiling)
                    _follow(r, f"upscale:{name}:{r['id']}")
                    src = _first_file(d, r["id"])
                    if st.get("end"):
                        job["final"] = src
                elif k == "stems":                      # from the file before, the take when nothing came before
                    r = stems_async(name, st["mode"], src)
                    _follow(r, f"stems:{name}:{st['mode']}" + (f":{src}" if src else ""))
                    stems = "derived/" + r["id"]
                    st["file"] = stems
                elif k == "remaster":
                    cfg = dict(st["settings"], source=stems or src)
                    if not stems:                       # a single file has no voice of its own to de-ess
                        cfg["deess"] = False
                    r = remaster_async(name, json.dumps(cfg))
                    _follow(r, f"remaster:{name}:{r['id']}")
                    src = _first_file(d, r["id"])
                    job["final"] = src
                elif k == "inspect":
                    _follow(inspect_async(name, src), "inspect:" + name + source_of(name, src)[1])
                elif k == "spectrum":
                    _follow(spectrum_async(name, src), "spectrum:" + name + source_of(name, src)[1])
                elif k == "gloss":                      # the words are the take's: heard on the take itself
                    _follow(gloss_async(name), name)
                st["status"] = "done"
                if k in ("debuzz", "upscale", "remaster"):
                    st["file"] = src
            job.update(status="done", ended=time.time(), current="")
        except Exception as e:                          # said on the step that failed; what was made stays
            if st is not None:
                st.update(status="failed", error=str(e))
            job.update(status="failed", error=f"{st['step'] if st else 'chain'}: {e}", ended=time.time())
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1120: artwork for a take (art_job.py, Viktor 02.10.2026: «просто иконка в плеере, в карточке и в mp3»): a
# small language model writes a picture prompt from the take's style and words, an SDXL finetune draws it. One at a
# time with the other heavy jobs, on a card the guard gives (the two models one after the other; measured 02.10.2026:
# 14.2 GB reserved at the peak, SDXL at 1024 px and its decoder).
ART_NEED_MB = 15000
# HERESY 1167 (Viktor 05.10.2026, the A/B: «Muse - отличный файнтюн»; «Для карт ниже 24GB VRAM… оставим SDXL»; «Изначальным
# выставь Q4»): the painters, each its room on a card at the peak with the prompter before it (RTX 3090, 05.10.2026: Krea 2
# Muse Q4 11.6 GB, Q8 17.4 GB; SDXL 14.2 GB) and its Python (Krea paints in .venv-art: transformers 5, diffusers 0.40)
ART_NEED = {"krea2-q4": 15000, "krea2-q8": 21000, "sdxl": ART_NEED_MB}   # with a margin over the peaks
ART_PY = Path(os.environ.get("LAB_ART_PY", HERE.parent / ".venv-art/bin/python"))
MUSE_FILES = {"krea2-q4": "museByStableYogi_v35Q4Extended.gguf", "krea2-q8": "museByStableYogi_v35Q8Extended.gguf"}


def krea_ready(painter):
    """Krea 2 can paint here: its environment, the fine-tune's file, Krea's encoder and VAE."""
    return (ART_PY.is_file() and (KIT / "artwork/Krea-2-Muse" / MUSE_FILES[painter]).is_file()
            and (KIT / "artwork/Krea-2-Turbo/text_encoder").is_dir() and (KIT / "artwork/Krea-2-Turbo/vae").is_dir())


def art_painter(asked=None):
    """HERESY 1167: the painter for an artwork: the one asked for, else the user's setting (yue2.artPainter), else by the
    cards: Krea 2 Muse at Q4 where one has 16 GB, SDXL below; Krea only where its files and environment are."""
    p = str(asked or "").strip().lower()
    if p not in ART_NEED:
        try:
            p = str(json.load(open(KIT / "user/settings.json", encoding="utf-8")).get("keys", {}).get("yue2.artPainter") or "")
        except (OSError, ValueError, AttributeError):
            p = ""
    if p not in ART_NEED:
        cards = training.gpus()
        big = max((c.get("total_mb", 0) for c in cards), default=0) if isinstance(cards, list) else 0
        p = "krea2-q4" if big >= 16000 else "sdxl"
    if p != "sdxl" and not krea_ready(p):
        p = "sdxl"
    return p


def art_info(name):
    """The take's artwork as the page and the API see it, or None."""
    d = take_dir(name)
    f = d / "artwork.jpg"
    if not f.is_file():
        return None
    meta = {}
    try:
        meta = json.load(open(d / "artwork.json", encoding="utf-8"))
    except (OSError, ValueError):
        pass
    return dict(meta, name=name, url="/lab/art?name=" + urllib.parse.quote(name) + "&v=" + str(int(f.stat().st_mtime)))


def refined():
    """HERESY 1132: every take something was made from in the Refiner (a manifest under derived/), with the time of
    the newest one; the ones running now count as now."""
    out = {}
    for f in OUTPUTS.glob("*/derived/*/manifest.json"):
        name, t = f.parents[2].name, int(f.stat().st_mtime)
        if t > out.get(name, 0):
            out[name] = t
    with jobs_lock:
        for k, v in jobs.items():
            kind, _, rest = k.partition(":")
            if kind in ("stems", "remaster", "upscale", "debuzz") and v.get("status") in ("queued", "running"):
                out[rest.split(":")[0]] = int(time.time())
    return {"refined": out}


ART_SEEN = {}                                    # name -> (artwork.json's time, its "seen", its credit), read again only when it changes


def art_credit(meta):
    """HERESY 1166: a picture someone made (a photograph from Wikimedia Commons, not drawn here): its credit line and its
    page, for the overlay; a drawn picture has none."""
    text = str(meta.get("credit") or "").strip()
    return {"text": text, "url": str(meta.get("page") or "")} if text else None


def art_copy(src, dst, why):
    """HERESY 1162: one take's picture given to another (a regenerated take, the other letter of an A/B pair), with what
    it was drawn from; never over a picture the other has."""
    if not (src / "artwork.jpg").is_file() or (dst / "artwork.jpg").is_file() or not dst.is_dir():
        return False
    shutil.copy2(src / "artwork.jpg", dst / "artwork.jpg")
    try:
        meta = json.load(open(src / "artwork.json", encoding="utf-8"))
    except (OSError, ValueError):
        meta = {}
    meta.update(copied_from=src.name, why=why)
    json.dump(meta, open(dst / "artwork.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return True


def art_pair(name):
    """HERESY 1162 (Viktor: «Для A/B семплов зачем нам мучиться с двумя картинками?»): the other letter's takes of an A/B
    pair (a title ending -a or -b), whichever of them there are."""
    try:
        title = json.load(open(OUTPUTS / name / "meta.json", encoding="utf-8")).get("title") or ""
    except (OSError, ValueError):
        return []
    m = re.match(r"^(.*)-([ab])$", title)
    if not m:
        return []
    other = m.group(1) + "-" + ("b" if m.group(2) == "a" else "a")
    out = []
    for f in OUTPUTS.glob("*/meta.json"):
        try:
            if json.load(open(f, encoding="utf-8")).get("title") == other:
                out.append(f.parent)
        except (OSError, ValueError):
            pass
    return out


def arts():
    """Every take that has artwork: name -> the file's time (the page's cache key). HERESY 1156: and "unseen", the
    pictures whose named subject the critic did not find in any try (the painter does not know it: a guess, which the
    page says, so a violin is not taken for a morin khuur). HERESY 1166: and "credits", the pictures someone made."""
    out, unseen, credits = {}, [], {}
    for f in OUTPUTS.glob("*/artwork.jpg"):
        name = f.parent.name
        out[name] = int(f.stat().st_mtime)
        meta = f.parent / "artwork.json"
        try:
            t = meta.stat().st_mtime
        except OSError:
            continue
        if ART_SEEN.get(name, (None,))[0] != t:
            try:
                m = json.load(open(meta, encoding="utf-8"))
                ART_SEEN[name] = (t, m.get("seen"), art_credit(m))
            except (OSError, ValueError):
                ART_SEEN[name] = (t, None, None)
        if ART_SEEN[name][1] is False:
            unseen.append(name)
        if ART_SEEN[name][2]:
            credits[name] = ART_SEEN[name][2]
    with jobs_lock:
        running = [k.split(":", 1)[1] for k, v in jobs.items() if k.startswith("art:") and v.get("status") in ("queued", "running")]
    return {"arts": out, "unseen": unseen, "running": running, "credits": credits}


def art_async(name, again=False, seed=None, painter=None):
    d = take_dir(name)
    key = f"art:{name}"
    painter = art_painter(painter)                   # HERESY 1167
    need = ART_NEED[painter]
    with jobs_lock:
        job = jobs.get(key)
        if job and job["status"] in ("queued", "running"):
            return dict(job, name=name)
        if job and job["status"] == "failed":
            jobs.pop(key)
            if not again:
                return dict(job, name=name)
        if not again and (d / "artwork.jpg").is_file():
            return art_info(name)
        if not again:                                # HERESY 1162: the pair's other letter has one: it is this one's too
            for sib in art_pair(name):
                if art_copy(sib, d, "the other letter of its A/B pair"):
                    return art_info(name)
        job = {"status": "queued", "started": time.time(), "kind": "art"}
        jobs[key] = job

    def work():
        try:
            while True:                                # HERESY 1167: it waits in the queue for a card, then for its turn
                wait_card(job, need, f"{ACT_SAY['art']} · {name}")
                with turn(job):
                    try:
                        gpu, free = free_gpu(need)           # asked again now that its turn has come
                    except RuntimeError:
                        job["status"] = "queued"             # the card was taken meanwhile: back to waiting for one
                        continue
                    job["status"] = "running"
                    job.pop("waiting", None)
                    job["gpu"] = gpu
                    env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", ART_PAINTER=painter)
                    tmp = d / "artwork.part.jpg"
                    py = ART_PY if painter != "sdxl" else LAB_PY
                    p = subprocess.run([str(py), str(HERE / "art_job.py"), str(d), str(tmp), str(seed if seed is not None else "")],
                                       env=env, capture_output=True, text=True, timeout=1200)
                    if p.returncode != 0:
                        raise RuntimeError("no artwork: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                    r = json.loads(p.stdout.strip().splitlines()[-1])
                break
            r.update(gpu=gpu, created=time.strftime("%Y-%m-%d %H:%M"))
            if (d / "artwork.jpg").is_file():           # HERESY 1169 · 1235 (Viktor 08.10.2026: «перепроверь, или мы не удаляем старые картинки с редженом новых»): the picture a redraw replaces is kept beside the take, as Remove keeps one
                keep = d / "artwork-removed"
                keep.mkdir(exist_ok=True)
                stamp = time.strftime("%Y%m%d-%H%M%S")
                (d / "artwork.jpg").replace(keep / f"{stamp}.jpg")
                if (d / "artwork.json").is_file():
                    (d / "artwork.json").replace(keep / f"{stamp}.json")
            json.dump(r, open(d / "artwork.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            tmp.replace(d / "artwork.jpg")
            for sib in art_pair(name):                 # HERESY 1162: the pair's other letter gets it too, when it has none
                art_copy(d, sib, "the other letter of its A/B pair")
            took = sum((r.get("took") or {}).values())
            act_say(f"artwork ({r.get('painter') or painter}) · {name} · done in {took:.0f} s on GPU {gpu}" +
                    ("" if r.get("seen") is None else f" · the critic {'found' if r['seen'] else 'did not find'} its subject"
                     f" in {len(r.get('tries') or [])} picture(s)") + (f" · {r['why']}" if r.get("why") else ""))
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


def art_remove(name):
    """HERESY 1156 (Viktor: «В меню мыши Remove current Artwork»): the take's picture taken off it, kept beside the take
    (artwork-removed/TIME.jpg with its .json), never deleted here: one taken off by a slip comes back by hand. The MP3s
    made with it as their cover go (the server's cache, made again on the next download): a cover that is gone would
    otherwise stay inside them, as the server makes an MP3 again only for a newer picture."""
    d = take_dir(name)
    with jobs_lock:
        job = jobs.get(f"art:{name}")
        if job and job.get("status") in ("queued", "running"):
            return {"error": "its picture is being drawn: take it off when it is done"}
    f = d / "artwork.jpg"
    if not f.is_file():
        return {"error": "this take has no artwork"}
    keep = d / "artwork-removed"
    keep.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    f.replace(keep / f"{stamp}.jpg")
    if (d / "artwork.json").is_file():
        (d / "artwork.json").replace(keep / f"{stamp}.json")
    for mp3 in d.glob("audio-*k.mp3"):
        mp3.unlink(missing_ok=True)
    ART_SEEN.pop(name, None)
    return {"removed": name, "kept": f"artwork-removed/{stamp}.jpg"}


def api_ctx():
    """What the API reaches of the lab (HERESY 1116); HERESY 1156: built once more at the start, to resume its filings."""
    return {"collection": collection, "outputs": OUTPUTS, "config_dir": config_dir, "gpu_guard": gpu_guard,
            "rpp": rpp, "kit": KIT, "cache": CACHE, "art": {"info": art_info, "draw": art_async},
            "refine": {"stems": stems_async, "debuzz": debuzz_async, "remaster": remaster_async, "upscale": upscale_async,
                       "gloss": gloss_async, "derived": derived_list}}


# HERESY 1157 (Viktor 03.10.2026: «SDXL рисовалка не идёт в системный лог. Перепроверь логирование всех GPU активностей»;
# «Зелёную точку в баре анимируй всегда, когда идёт GPU активность в студии, и тултипом при наведении running jobs
# status»): every job of the lab and every training run, as it waits, starts, ends or fails, in a log of its own the page
# merges into its Server log (the engine's log is the engine's stderr: the lab's work never reached it), and what runs
# now, for the bar's lamp. GET /activity?since=SEQ
ACT = {"seq": 0, "lines": collections.deque(maxlen=400), "seen": {}}
ACT_LOCK = threading.Lock()
ACT_SAY = {"art": "artwork", "stems": "stems (BS-Roformer, htdemucs)", "remaster": "remaster", "upscale": "upscale (UniverSR)",
           "debuzz": "debuzz", "timing": "lyrics timing (Whisper)", "textend": "lyrics check (Whisper)", "spectrum": "spectrum",
           "inspect": "inspection", "train": "LoRA training", "listen": "listener (Omni)", "artist": "the Artist"}


def act_say(text):
    with ACT_LOCK:
        ACT["seq"] += 1
        ACT["lines"].append([ACT["seq"], time.strftime("%H:%M:%S") + " " + text])
    print("[lab] " + text, file=sys.stderr, flush=True)


def act_now():
    """What runs now: the lab's jobs, the training runs (with their step), the listener."""
    out = []
    with jobs_lock:
        for k, v in jobs.items():
            kind, _, name = k.partition(":")
            if v.get("status") in ("queued", "running"):
                out.append({"key": k, "what": ACT_SAY.get(kind, kind), "name": name.split(":")[0], "status": v.get("status"),
                            "gpu": v.get("gpu"), "since": v.get("started")})
    for name, run in list(training.RUNS.items()):
        if run.get("status") in ("running", "stopping"):
            gpu = training._meta(training.paths(KIT)["runs"] / name).get("gpu")
            out.append({"key": "train:" + name, "what": ACT_SAY["train"], "name": name, "status": "running", "gpu": gpu,
                        "step": run.get("step"), "steps": run.get("steps")})
    for name, job in list(training.LISTEN.items()):
        if job.get("status") == "running":
            out.append({"key": "listen:" + name, "what": ACT_SAY["listen"], "name": name, "status": "running", "gpu": job.get("gpu"),
                        "step": job.get("done"), "steps": job.get("total")})
    return out


def act_watch():
    """Every second: what started, ended or failed since, said once."""
    while True:
        try:
            now = {r["key"]: r for r in act_now()}
            seen = ACT["seen"]
            for k, r in now.items():
                old = seen.get(k)
                age = time.time() - (r.get("since") or time.time())
                if r["status"] == "running" and (old is None or old.get("status") != "running") and (r.get("gpu") is not None or age > 3 or k.startswith(("train:", "listen:"))):
                    act_say(f"{r['what']} · {r['name']} · started" + (f" on GPU {r['gpu']}" if r.get("gpu") not in (None, "cpu") else " on the CPU" if r.get("gpu") == "cpu" else ""))
                    seen[k] = r
                elif old is None and r["status"] == "queued":
                    act_say(f"{r['what']} · {r['name']} · waits for a card")
                    seen[k] = r
            for k in list(seen):
                if k not in now:
                    kind, _, name = k.partition(":")
                    with jobs_lock:
                        failed = jobs.get(k, {}).get("status") == "failed"
                        err = jobs.get(k, {}).get("error", "")
                    if failed and err == OFF_QUEUE:              # HERESY 1165: said when it was taken off
                        pass
                    elif failed:
                        act_say(f"{seen[k]['what']} · {seen[k]['name']} · FAILED: {err}")
                    elif kind == "train":
                        run = training.RUNS.get(name, {})
                        act_say(f"{seen[k]['what']} · {name} · {run.get('status', 'ended')} at step {run.get('step')}/{run.get('steps')}")
                    elif kind != "art":                        # the artwork says its own end, with what the critic saw
                        act_say(f"{seen[k]['what']} · {seen[k]['name']} · done")
                        if kind in ("stems", "remaster", "upscale", "debuzz"):
                            refined_section(seen[k]["name"])
                    del seen[k]
        except Exception as e:                                 # the watch must not die of one odd record
            print(f"[lab] activity watch: {e}", file=sys.stderr, flush=True)
        time.sleep(1)


# HERESY 1161 (Viktor: «Туда же можно автоматом создавать подразделы при факте работы с рефайнером»): a take the Refiner
# has made something of goes into the section "Refined" of each workspace it stands in (of the workspace itself, not of a
# section: "Фосфорида / Refined"), made when first needed
REFINED = "Refined"


def refined_section(name):
    try:
        cfg = config_dir()
        d = collection.load(cfg)
        roots = sorted({w.split(collection.SEP)[0] for w, ns in d["workspaces"].items()
                        if name in ns and w.split(collection.SEP)[-1] != REFINED})
        for root in roots:
            collection.collection_post(cfg, OUTPUTS, {"op": "ws-add", "workspace": root + collection.SEP + REFINED, "names": [name]})
        if roots:
            act_say(f"refined · {name} · into “{REFINED}” of " + ", ".join(f"“{r}”" for r in roots))
    except (OSError, ValueError) as e:
        act_say(f"refined · {name} · not filed into a section: {e}")


def activity(since):
    with ACT_LOCK:
        lines = [l for l in ACT["lines"] if l[0] > since]
        seq = ACT["seq"]
    return {"seq": seq, "lines": lines, "running": act_now(), "queue": regen_queue(),   # HERESY 1165: and what waits
            # HERESY 1167: the takes being made again, waiting or running: their cards breathe till the new one lands
            "regenerating": sorted({str(v.get("old")) for v in list(REGEN_LIVE.values()) if v.get("old")})}


# HERESY 1160 (Viktor 03.10.2026: «Над писателем в меню — регенерировать этот же трек, но с другим случайным зерном. И
# тогда я меньше просить тебя буду. Авто замена существующего. Новая часть среди воркспейсов — Sourced for
# Regeneration»): a take made again from its own request with new seeds (its codes and its planned score dropped, a score
# brought by the user kept). When the new one lands it takes the old one's places (its workspaces, its note) and the old
# one moves to the workspace "Sourced for Regeneration", kept there until he empties it. A probe (probeNN-, style120-)
# runs two minutes, not ended before 90 s (his «держим близкое — полторы и выше»). Remembered on disk across a restart.
REGEN_WS = "Sourced for Regeneration"
REGEN_LOCK = threading.Lock()


def _regen_pending(add=None, done=None):
    with REGEN_LOCK:
        p = config_dir() / "regen-pending.json"
        try:
            rows = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            rows = []
        if add or done is not None:
            if add:
                rows.append(add)
            if done is not None:
                rows = [r for r in rows if str(r.get("job")) != str(done)]
            tmp = p.with_name(p.name + ".part")
            json.dump(rows, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
            os.replace(tmp, p)
        return rows


REGEN_LIVE = {}      # HERESY 1165: engine job -> {"old", "status", "since"}, as its watcher last read it (the bar's queue)


def regen_queue():
    """The regenerations the engine has not begun, oldest first: the page cannot see them (the engine's log names a
    run only when it starts) and lists them under the bar's lamp, each to be taken off with its engine job's cancel."""
    rows = [dict(v, job=k) for k, v in list(REGEN_LIVE.items()) if v.get("status") == "queued"]
    return sorted(rows, key=lambda r: r.get("since") or 0)


def _regen_watch(job, old):
    REGEN_LIVE[str(job)] = {"old": old, "status": "queued", "since": time.time()}

    def watch():
        try:
            run()
        finally:
            REGEN_LIVE.pop(str(job), None)

    def run():
        unknown = 0
        while True:
            time.sleep(3)
            try:
                st = api._engine(f"/job?id={urllib.parse.quote(str(job))}")
                unknown = 0
                if str(job) in REGEN_LIVE:
                    REGEN_LIVE[str(job)]["status"] = st.get("status")
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    unknown += 1
                    if unknown > 20:
                        act_say(f"regenerate · {old} · the engine lost its job: nothing replaced")
                        _regen_pending(done=job)
                        return
                continue
            except OSError:
                continue
            status = st.get("status")
            if status in ("failed", "cancelled"):
                act_say(f"regenerate · {old} · {status}: the old one stays where it was")
                _regen_pending(done=job)
                return
            if status != "done":
                continue
            new = st.get("takes") or []
            if new:
                cfg = config_dir()
                d = collection.load(cfg)
                wss = [w for w, ns in d["workspaces"].items() if old in ns and w.split(collection.SEP)[-1] != REGEN_WS]
                if not wss:      # HERESY 1165: made again from a take already set aside: the new one where its section's parent is
                    wss = sorted({collection.SEP.join(w.split(collection.SEP)[:-1]) for w, ns in d["workspaces"].items()
                                  if old in ns and w.split(collection.SEP)[-1] == REGEN_WS and collection.SEP in w})
                for w in wss:
                    collection.collection_post(cfg, OUTPUTS, {"op": "ws-add", "workspace": w, "names": new})
                # HERESY 1162 (Viktor: «При риджене оставляй в новой версии пометки»): its note, its like and its star, and its
                # picture go with it; a dislike does not (it is why a take is made again: the new one starts unjudged); what it
                # was made from is kept, for its card
                note = d["notes"].get(old)
                if note:
                    collection.collection_post(cfg, OUTPUTS, {"op": "note", "names": new, "text": note})
                if d["ratings"].get(old, 0) > 0:
                    collection.collection_post(cfg, OUTPUTS, {"op": "rate", "names": new, "value": 1})
                collection.collection_post(cfg, OUTPUTS, {"op": "regen-of", "names": new, "from": old})
                try:
                    if json.load(open(OUTPUTS / old / "meta.json", encoding="utf-8")).get("favorite"):
                        for n in new:
                            api._engine("/library/update?name=" + urllib.parse.quote(n), {"favorite": True})
                except (OSError, ValueError):
                    pass
                # HERESY 1166 (Viktor: «смело переименовывай все треки в законченных 💎 воркспейсах»): its title too: the new
                # one comes with its request's, the title it was first made with, and would undo a rename
                try:
                    old_title = json.load(open(OUTPUTS / old / "meta.json", encoding="utf-8")).get("title")
                    for n in new if old_title else []:
                        api._engine("/library/update?name=" + urllib.parse.quote(n), {"title": old_title})
                except (OSError, ValueError):
                    pass
                for n in new:
                    art_copy(OUTPUTS / old, OUTPUTS / n, "made again from " + old)
                for w in wss:
                    collection.collection_post(cfg, OUTPUTS, {"op": "ws-remove", "workspace": w, "names": [old]})
                # HERESY 1162 (Viktor: «Sourced for regen давай как подкатегорию исходного воркспейса»): a section of each of
                # its workspaces (of the workspace itself, not of a section); only a take in none goes to the one by that name
                roots = sorted({w.split(collection.SEP)[0] for w in wss})
                kept = [r + collection.SEP + REGEN_WS for r in roots] or [REGEN_WS]
                for w in kept:                     # HERESY 1167: past the freeze, and the section frozen
                    collection.keep_sourced(cfg, w, [old])
                act_say(f"regenerate · {old} → {', '.join(new)} · in {', '.join(wss) or 'no workspace'}, with its marks; the old one in "
                        + ", ".join(f"“{w}”" for w in kept))
            _regen_pending(done=job)
            return
    threading.Thread(target=watch, daemon=True).start()


def regen(names, same_seeds=False):
    """HERESY 1160; 1165: same_seeds keeps the take's own seeds (Viktor: «все пробы, что я одобряю в 💎 воркспейсы, перед
    публикацией репо перегенерим с теми же сидами карточек, по 2 минуты всё»): a probe made again at its full length."""
    out = []
    ice = collection.frozen_takes(collection.load(config_dir()))     # HERESY 1166: a frozen take is not made again
    for name in names:
        if name in ice:
            out.append({"name": name, "error": "frozen with its workspace: unfreeze it first"})
            continue
        try:
            d = take_dir(name)
            req = json.load(open(d / "request.json", encoding="utf-8"))
        except (OSError, ValueError, FileNotFoundError):
            out.append({"name": name, "error": "no request kept: an imported take cannot be made again"})
            continue
        try:
            meta = json.load(open(d / "meta.json", encoding="utf-8"))
        except (OSError, ValueError):
            meta = {}
        for k in ("semantic_tokens", "semantic_keep", "parent") + (() if same_seeds else ("lm_seed", "seed")):
            req.pop(k, None)
        if not meta.get("provided_score"):
            req.pop("abc", None)                             # the score the plan wrote: a new seed plans a new one
        # 1165: an A/B sample is a probe too; 1166: and a voice («💎 Voice Types», voice-sung|spoken-…), at 120 s with the rest
        if re.match(r"^(probe|style|ab|voice)\d*-", str(req.get("title") or "")):
            req["duration"] = 120.0
            ss = dict(req.get("semantic_sampling") or {})
            ss["min_tokens"] = max(int(ss.get("min_tokens") or 0), 90 * 25)
            req["semantic_sampling"] = ss
        job = api._engine("/synth", req)
        jid = job.get("id")
        if jid is None:
            out.append({"name": name, "error": job.get("error") or "the engine did not take it"})
            continue
        _regen_pending(add={"job": str(jid), "old": name, "t": int(time.time())})
        _regen_watch(jid, name)
        act_say(f"regenerate · {name} · queued " + ("with its own seeds" if same_seeds else "with new seeds"))
        out.append({"name": name, "job": jid})
    return {"regen": out, "workspace": REGEN_WS}


AUDIO_TYPES = {".flac": "audio/flac", ".wav": "audio/wav", ".mp3": "audio/mpeg"}


# HERESY 1255: the Artist rooms runs reach the labs queue, cards, activity and takes through these
artist.setup(kit=KIT, jobs=jobs, lock=jobs_lock, wait_card=wait_card, turn=turn, free_gpu=free_gpu, say=act_say,
             take_dir=take_dir, pair=art_pair, copy=art_copy, painter=art_painter, py=ART_PY)


def lab_busy():
    """HERESY 1261: the lab works on something: the card is held, or a job waits or runs."""
    with jobs_lock:
        return heavy.locked() or any(v.get("status") in ("queued", "running") for v in jobs.values())


# HERESY 1261: where the user's work lives; its record beside the page's keys in user/settings.json, under the same lock
places.setup(KIT, busy=lab_busy, settings_lock=SETTINGS_LOCK, settings_file=config_dir() / "settings.json",
             studio_port=os.environ.get("YUE2CPP_PORT", "41867"), say=lambda s: print(s, file=sys.stderr, flush=True))


class Handler(BaseHTTPRequestHandler):
    def send_file(self, path, ctype="application/octet-stream", download=None, cache=None):
        size = path.stat().st_size
        rng = self.headers.get("Range", "")
        start, end = 0, size - 1
        if rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, size - int(b))
            end = int(b) if a and b else size - 1
            end = min(end, size - 1)
        length = end - start + 1
        self.send_response(206 if rng else 200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        if rng:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Access-Control-Allow-Origin", "*")
        if cache:                                          # HERESY 1274: a file that never changes under its name (the fonts)
            self.send_header("Cache-Control", cache)
        if download:                                       # HERESY 1090: saved under this name
            self.send_header("Content-Disposition", 'attachment; filename="' + download.replace('"', "") + '"')
        self.send_header("Content-Length", str(length))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # HERESY 1116: the studio's API (lab/api.py), reached through the engine's /api/…
    def api(self, method, url, q, body):
        ctx = api_ctx()
        try:
            code, out = api.handle(method, url.path, q, body, self.headers, ctx)
        except api.Redirect as r:
            self.send_response(307)
            self.send_header("Location", r.url)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        except FileNotFoundError as e:
            code, out = 404, {"error": str(e)}
        except (ValueError, KeyError, TypeError) as e:
            code, out = 400, {"error": str(e)}
        except OSError as e:                             # the engine did not answer
            code, out = 502, {"error": f"the engine did not answer: {e}"}
        return self.send(code, out)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        if url.path.startswith("/api/"):
            return self.api("GET", url, q, None)
        try:
            if url.path == "/gpus/live":                    # HERESY 1264: the cards second by second, and what each is given to
                out = gpu_live.live(float(q.get("since") or 0))
                out["roles"] = live_roles()
                return self.send(200, out)
            if url.path == "/places":                       # HERESY 1261: where the user's work lives, and a move under way
                return self.send(200, places.listing(q.get("refresh") == "1"))
            if url.path == "/places/plan":
                return self.send(200, places.plan(q.get("name", ""), q.get("to", "")))
            if url.path == "/weights":                      # HERESY 1289: what the install brings, and a run under way
                return self.send(200, weights.listing(KIT))
            if url.path == "/health":
                with jobs_lock:
                    active = {k: v["status"] for k, v in jobs.items()}
                if weights.running():                       # HERESY 1289: a download under way is a job too (a restart cuts it)
                    active["weights"] = "running"
                return self.send(200, {"ok": True, "busy": heavy.locked(), "jobs": active, "whisper": WHISPER_DIR.is_dir()})
            if url.path == "/gloss":
                if q.get("cached") == "1":
                    return self.send(200, gloss(q.get("name", ""), cached_only=True, source=q.get("source", "")))
                r = gloss_async(q.get("name", ""), q.get("force") == "1", q.get("source", ""))
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/refined":                       # HERESY 1132: takes with something the Refiner made, the newest first
                return self.send(200, refined())
            if url.path == "/score":                         # HERESY 1131: the score the transcriber wrote from the sound
                d = take_dir(q.get("name", ""))
                f = d / "score-from-sound.abc"
                if not f.is_file():
                    return self.send(404, {"error": "no score from the sound yet"})
                meta = {}
                try:
                    meta = json.load(open(d / "score-from-sound.json", encoding="utf-8"))
                except (OSError, ValueError):
                    pass
                return self.send(200, dict(meta, abc=f.read_text(encoding="utf-8")))
            if url.path == "/activity":                      # HERESY 1157: the lab's GPU work, said and running
                since = q.get("since", "0")
                return self.send(200, activity(int(since) if since.isdigit() else 0))
            if url.path == "/arts":                          # HERESY 1120: which takes have artwork
                return self.send(200, arts())
            if url.path == "/art":
                f = take_dir(q.get("name", "")) / "artwork.jpg"
                if not f.is_file():
                    return self.send(404, {"error": "no artwork for this take"})
                return self.send_file(f, "image/jpeg")
            if url.path == "/art/remove":                    # HERESY 1156
                r = art_remove(q.get("name", ""))
                return self.send(409 if r.get("error") else 200, r)
            if url.path.startswith("/fonts/"):               # HERESY 1274: the page's fonts, in the studio itself (no CDN)
                name = url.path[len("/fonts/"):]
                font = HERE / "fonts" / name
                if not re.fullmatch(r"[A-Za-z0-9_-]+\.woff2", name) or not font.is_file():
                    return self.send(404, {"error": "no such font"})
                return self.send_file(font, "font/woff2", cache="public, max-age=31536000, immutable")
            if url.path == "/artist/runs":                   # HERESY 1255: the Artist room
                return self.send(200, artist.runs())
            if url.path == "/artist/file":
                p, ctype = artist.picture(q.get("id", ""), q.get("file", ""))
                return self.send_file(p, ctype)
            if url.path == "/artist/prompt":
                return self.send(200, artist.prompt_for(q.get("name", "")))
            if url.path == "/art/draw":
                seed = q.get("seed", "")
                r = art_async(q.get("name", ""), q.get("again") == "1", int(seed) if seed.isdigit() else None, q.get("painter"))
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/stems":
                r = stems_async(q.get("name", ""), q.get("mode", "four"), q.get("source", ""))
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/debuzz":
                return self.send(202, debuzz_async(q.get("name", ""), q.get("source", ""), q.get("strength", "0.8"),
                                                   q.get("period", "1920"), q.get("rate", "48000")))
            if url.path == "/textend":
                r = textend_async(q.get("name", ""), q.get("force") == "1", q.get("cached") == "1")
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/inspect":
                r = inspect_async(q.get("name", ""), q.get("source", ""), q.get("force") == "1", q.get("cached") == "1")
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/upscale":
                return self.send(202, upscale_async(q.get("name", ""), q.get("mode", "subtle"), q.get("source", ""),
                                                    q.get("variants", "2"), q.get("keep", "1") != "0"))
            if url.path == "/remaster":
                r = remaster_async(q.get("name", ""), q.get("s", ""))
                return self.send(202, r)
            if url.path == "/timing":                       # HERESY 1056: karaoke timing, as JSON, LRC or SRT
                r = timing_async(q.get("name", ""), q.get("force") == "1", q.get("cached") == "1")
                fmt = q.get("fmt", "json")
                if fmt in ("lrc", "srt") and "rows" in r:
                    title = json.load(open(take_dir(q["name"]) / "meta.json", encoding="utf-8")).get("title", "")
                    text = timing.lrc(r["rows"], title) if fmt == "lrc" else timing.srt(r["rows"])
                    data = text.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/train/datasets":               # HERESY 1063: LoRA training
                return self.send(200, training.datasets(KIT))
            if url.path == "/train/scan":
                return self.send(200, training.scan(KIT, q.get("name", "")))
            if url.path == "/train/starter":             # HERESY 1100: the starter sets
                return self.send(200, starter.listing(KIT))
            if url.path == "/daw":                        # HERESY 1102: which DAWs this machine has
                return self.send(200, dawbridge.detect())
            if url.path == "/train/prepare":
                return self.send(200, training.prepare_status(q.get("name", "")))
            if url.path == "/train/run":
                return self.send(200, training.run_status(KIT, q.get("name", "")))
            if url.path == "/train/listen":                 # HERESY 1078: the listener's drafts for a set
                return self.send(200, training.listen_status(KIT, q.get("name", "")))
            if url.path == "/train/voice":                  # HERESY 1169: a raw folder's voice, measured
                return self.send(200, training.voice_status(KIT, q.get("name", "")))
            if url.path == "/gpus":                          # HERESY 1091: which card does what
                return self.send(200, gpus_state())
            if url.path.startswith("/guide/"):              # HERESY 1096: docs/GUIDE.md and its pictures, for the page's guide
                base = (KIT / "docs").resolve()
                f = (base / urllib.parse.unquote(url.path[len("/guide/"):])).resolve()
                if base not in f.parents or not f.is_file():
                    raise FileNotFoundError("no such page of the guide")
                kinds = {".md": "text/markdown; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}
                return self.send_file(f, kinds.get(f.suffix.lower(), "application/octet-stream"))
            if url.path == "/train/trash":                  # HERESY 1090: deleted runs, kept until emptied
                return self.send(200, training.trashed_runs(KIT))
            if url.path == "/train/file":                   # HERESY 1090: a checkpoint, downloaded under its loras/ name
                path, name = training.checkpoint_file(KIT, q.get("name", ""), q.get("file", ""))
                return self.send_file(path, "application/octet-stream", name)
            if url.path == "/train/log":
                return self.send_file(training.paths(KIT)["runs"] / Path(q.get("name", "")).name / "train.log", "text/plain; charset=utf-8")
            if url.path == "/chain":                        # HERESY 1054: the chain's state for a take
                job = CHAINS.get(q.get("name", ""))
                return self.send(200, dict(job, name=q.get("name", "")) if job else {"status": "none", "name": q.get("name", "")})
            if url.path == "/derived":
                return self.send(200, derived_list(q.get("name", "")))
            if url.path == "/settings":
                return self.send(200, settings_get(q.get("scope", "")))
            if url.path == "/presets":
                return self.send(200, presets_get(q.get("scope", "")))
            if url.path == "/catalog":                      # HERESY 1041: the Collection
                return self.send(200, collection.catalog(OUTPUTS, config_dir()))
            if url.path == "/trash":
                return self.send(200, collection.trash_list(KIT))
            if url.path == "/collection/diamonds":       # HERESY 1166: the 💎 workspaces on Hugging Face
                return self.send(200, diamond.listing(KIT, OUTPUTS, config_dir(), refresh=q.get("refresh") == "1"))
            if url.path == "/update":                     # HERESY 1169: this version, the last look at GitHub's releases
                return self.send(200, updates.status(KIT, config_dir()))
            if url.path == "/update/log":
                return self.send(200, updates.log_tail(KIT))
            if url.path == "/writer":                       # HERESY 1047
                if q.get("id"):
                    return self.send(200, writer.get(KIT, q["id"], q.get("scope", "")))
                return self.send(200, writer.listing(KIT, q.get("scope", "")))
            if url.path == "/export":
                return self.send(200, collection.export_status(q.get("id", "")))
            if url.path == "/dawproject":                   # HERESY 1074: a take, its mix and stems, for any DAW
                path, info = dawproject.build(KIT, OUTPUTS, q.get("name", ""), cache=CACHE)
                return self.send(200, dict(info, path=str(path.relative_to(OUTPUTS / q["name"])), bytes=path.stat().st_size))
            if url.path == "/exportfile":
                return self.send_file(collection.export_path(KIT, q.get("id", "")), "application/zip")
            if url.path == "/file":
                p, _ = source_of(q.get("name", ""), q.get("path", ""))
                return self.send_file(p, AUDIO_TYPES.get(p.suffix.lower(), "application/octet-stream"))
            if url.path == "/spectrum":
                r = spectrum_async(q.get("name", ""), q.get("source", ""))
                if isinstance(r, Path):
                    return self.send_file(r)
                return self.send(500 if r.get("status") == "failed" else 202, r)
            self.send(404, {"error": "unknown path"})
        except FileNotFoundError as e:
            self.send(404, {"error": str(e)})
        except ValueError as e:
            self.send(400, {"error": str(e)})
        except Exception as e:           # the page shows it; the lab keeps running
            self.send(500, {"error": str(e)})

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        if url.path.startswith("/api/"):
            size = int(self.headers.get("Content-Length") or 0)
            return self.api("POST", url, q, self.rfile.read(size) if 0 < size <= 64 * 1024 * 1024 else None)
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if size <= 0 or size > 1024 ** 3:
                raise ValueError("send the file as the body, up to 1 GB")
            body = self.rfile.read(size)
            if url.path == "/weights/check":                # HERESY 1289
                return self.send(202, weights.check(KIT))
            if url.path == "/weights/fetch":                # HERESY 1289: on the user's word; a test page fetches nothing
                return self.send(202, weights.fetch(KIT, json.loads(body.decode("utf-8")), q.get("scope", "")))
            if url.path in ("/places/move", "/places/relink"):   # HERESY 1261
                data = json.loads(body.decode("utf-8"))
                fn = places.move if url.path == "/places/move" else places.relink
                return self.send(202 if url.path == "/places/move" else 200, fn(data, q.get("scope", "")))
            if url.path.startswith("/artist/"):             # HERESY 1255: the Artist room
                data = json.loads(body.decode("utf-8"))
                if url.path == "/artist/draw":
                    return self.send(202, artist.draw(data))
                if url.path == "/artist/cover":
                    return self.send(200, artist.cover(data))
                if url.path == "/artist/star":               # HERESY 1257
                    return self.send(200, artist.star(data))
                if url.path == "/artist/trash":
                    return self.send(200, artist.trash(str(data.get("id") or "")))
                if url.path == "/artist/stop":               # HERESY 1270
                    return self.send(200, artist.stop(str(data.get("id") or "")))
                if url.path == "/artist/restore":
                    return self.send(200, artist.restore(str(data.get("id") or "")))
            if url.path == "/jobs/cancel":                   # HERESY 1165: {key}: a waiting job off the queue
                return self.send(200, job_cancel(str(json.loads(body.decode("utf-8")).get("key") or "")))
            if url.path == "/regen":                         # HERESY 1160: {names}: made again with new seeds
                data = json.loads(body.decode("utf-8"))
                return self.send(202, regen([str(n) for n in data.get("names") or []], bool(data.get("same_seeds"))))
            if url.path == "/update":                     # HERESY 1169: {check, rc}: look now; {run: version}: update while nothing runs
                data = json.loads(body.decode("utf-8"))
                if data.get("run"):
                    with jobs_lock:
                        busy = heavy.locked() or any(v.get("status") in ("running", "queued") for v in jobs.values())
                    return self.send(*updates.run(KIT, config_dir(), str(data["run"]), busy))
                return self.send(200, updates.check(KIT, config_dir(), data.get("rc")))
            if url.path == "/collection/diamonds":       # HERESY 1166: one 💎 workspace, on the user's word (409: it is here)
                data = json.loads(body.decode("utf-8"))
                return self.send(*diamond.fetch(KIT, OUTPUTS, config_dir(), str(data.get("name", "")), bool(data.get("restore"))))
            if url.path in ("/collection", "/trash", "/export"):     # HERESY 1041
                data = json.loads(body.decode("utf-8"))
                if url.path == "/collection":
                    return self.send(200, collection.collection_post(config_dir(), OUTPUTS, data))
                if url.path == "/export":
                    return self.send(202, collection.export_start(KIT, OUTPUTS, [str(n) for n in data.get("names") or []],
                                                                  data.get("format", "flac"), bool(data.get("derived"))))
                op = data.get("op")
                if op == "move":
                    return self.send(200, collection.trash_move(KIT, OUTPUTS, [str(n) for n in data.get("names") or []], config_dir()))
                if op == "restore":
                    return self.send(200, collection.trash_restore(KIT, OUTPUTS, data.get("items") or []))
                if op == "empty":                      # the page asks first; items or everything
                    return self.send(200, collection.trash_empty(KIT, data.get("items")))
                raise ValueError("move, restore or empty")
            if url.path == "/score":                         # HERESY 1131: keep what the transcriber wrote
                d = take_dir(q.get("name", ""))
                abc = str(json.loads(body.decode("utf-8")).get("abc") or "")
                if not abc.strip() or len(abc) > 2_000_000:
                    raise ValueError("no score in the body")
                (d / "score-from-sound.abc").write_text(abc, encoding="utf-8")
                meta = {"by": "the transcriber (SheetSage2)", "made": time.strftime("%Y-%m-%d %H:%M")}
                json.dump(meta, open(d / "score-from-sound.json", "w", encoding="utf-8"), ensure_ascii=False)
                return self.send(200, meta)
            if url.path == "/gpus":                          # HERESY 1091
                saved = gpu_roles.save(KIT, json.loads(body.decode("utf-8")), training.gpus())
                return self.send(200, dict(gpus_state(), saved_roles=saved))
            if url.path == "/studio/restart":
                return self.send(202, studio_restart())
            if url.path == "/dawproject":                   # HERESY 1134: with the page's MIDI of the score, as REAPER gets it
                data = json.loads(body.decode("utf-8"))
                name = str(data.get("name", ""))
                midi = base64.b64decode(data["midi"]) if data.get("midi") else None
                path, info = dawproject.build(KIT, OUTPUTS, name, midi=midi, cache=CACHE)
                return self.send(200, dict(info, path=str(path.relative_to(OUTPUTS / name)), bytes=path.stat().st_size))
            if url.path == "/daw/reaper":                 # HERESY 1104: the take as a REAPER project
                data = json.loads(body.decode("utf-8"))
                name = str(data.get("name", ""))
                midi = base64.b64decode(data["midi"]) if data.get("midi") else None
                path, info = rpp.build(KIT, OUTPUTS, name, midi=midi, cache=CACHE)
                return self.send(200, dict(info, path=str(path.relative_to(OUTPUTS / name)), bytes=path.stat().st_size))
            if url.path == "/train/starter":             # HERESY 1100: one starter set, on the user's word
                data = json.loads(body.decode("utf-8"))
                return self.send(202, starter.fetch(KIT, str(data.get("name", ""))))
            if url.path in ("/train/archive", "/train/delete", "/train/restore", "/train/purge", "/train/unpublish"):   # HERESY 1090
                data = json.loads(body.decode("utf-8"))
                if url.path == "/train/archive":
                    return self.send(200, training.archive(KIT, str(data.get("name", "")), bool(data.get("archived", True))))
                if url.path == "/train/delete":
                    return self.send(200, training.delete_run(KIT, str(data.get("name", "")), bool(data.get("loras"))))
                if url.path == "/train/restore":
                    return self.send(200, training.restore_run(KIT, str(data.get("id", ""))))
                if url.path == "/train/purge":
                    return self.send(200, training.purge_run(KIT, str(data.get("id", ""))))
                return self.send(200, training.unpublish(KIT, str(data.get("name", "")), str(data.get("lora", ""))))
            if url.path == "/train/voice":                  # HERESY 1169: measure a raw folder's voice
                return self.send(202, training.measure_voice(KIT, json.loads(body.decode("utf-8"))))
            if url.path in ("/train/prepare", "/train/run", "/train/stop", "/train/publish", "/train/listen", "/train/styles"):     # HERESY 1063, 1067, 1078
                data = json.loads(body.decode("utf-8"))
                if url.path == "/train/listen":
                    return self.send(202, training.listen(KIT, data, free_gpu))
                if url.path == "/train/styles":
                    return self.send(200, training.apply_styles(KIT, data))
                if url.path == "/train/publish":
                    return self.send(200, training.publish(KIT, str(data.get("name", "")), str(data.get("file", ""))))
                if url.path == "/train/prepare":
                    return self.send(202, training.prepare(KIT, data))
                if url.path == "/train/run":
                    return self.send(202, training.train(KIT, data, free_gpu))
                return self.send(200, training.stop(KIT, str(data.get("name", ""))))
            if url.path == "/chain":
                data = json.loads(body.decode("utf-8"))
                return self.send(202, chain_async(str(data.get("name", "")), data))
            if url.path == "/writer":
                return self.send(200, writer.post(KIT, json.loads(body.decode("utf-8")), q.get("scope", "")))
            if url.path == "/import":
                return self.send(200, import_track(q.get("file", "track.wav"), q.get("title", ""), body))
            if url.path == "/settings":
                return self.send(200, settings_put(body, q.get("scope", "")))
            if url.path == "/presets":
                return self.send(200, presets_put(body, q.get("scope", "")))
            if url.path == "/lyrics":
                return self.send(200, set_lyrics(q.get("name", ""), body.decode("utf-8")))
            self.send(404, {"error": "unknown path"})
        except FileNotFoundError as e:
            self.send(404, {"error": str(e)})
        except ValueError as e:
            self.send(400, {"error": str(e)})
        except Exception as e:
            self.send(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s [lab] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))


# HERESY 1031: deleting a take removes its folder with everything derived from it; the lab's own
# measurements of it (spectrum, Whisper, artifacts in cache/) went on lying there. Dropped at
# start and every hour: a cache file stays while some take's name is its prefix.
def prune_cache():
    if not CACHE.is_dir():
        return 0
    takes = [p.name for p in OUTPUTS.iterdir() if p.is_dir()] if OUTPUTS.is_dir() else []
    if not takes:
        return 0                                       # no library in sight: never empty the cache for that
    gone = 0
    for f in CACHE.iterdir():
        if f.is_file() and not any(f.name.startswith(t + ".") for t in takes):
            f.unlink()
            gone += 1
    return gone


def prune_loop():
    while True:
        try:
            n = prune_cache()
            if n:
                print(f"[lab] cache: {n} measurement(s) of deleted takes dropped", file=sys.stderr, flush=True)
            collection.prune_exports(KIT)
            days = collection.load(config_dir()).get("trash_days", 0)
            if days:                                   # HERESY 1041: only when Viktor chose a term
                gone = collection.trash_empty(KIT, older_than_days=days)["emptied"]
                if gone:
                    print(f"[lab] trash: {len(gone)} take(s) older than {days} days emptied", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[lab] cache prune: {e}", file=sys.stderr, flush=True)
        time.sleep(3600)


if __name__ == "__main__":
    threading.Thread(target=prune_loop, daemon=True).start()
    threading.Thread(target=act_watch, daemon=True).start()     # HERESY 1157
    places.boot()                    # HERESY 1261: a folder linked back from the record, a missing one made, a dangling one said
    print(f"[lab] heresy-lab on :{PORT} · outputs {OUTPUTS} · whisper {WHISPER_DIR}", file=sys.stderr, flush=True)
    training.resume(KIT)            # HERESY 1072: runs still going in their own units are watched again
    for r in _regen_pending():           # HERESY 1160: regenerations still owed their swap
        _regen_watch(r.get("job"), r.get("old"))
    owed = api.resume_filing(api_ctx())  # HERESY 1156: the API's takes still owed a workspace are watched again
    if owed:
        print(f"[lab] {owed} API job(s) still to file into their workspaces: watched again", file=sys.stderr, flush=True)
    # HERESY 1114: this machine only; the page reaches the lab through the engine (/lab/), which keeps out the world
    ThreadingHTTPServer((os.environ.get("LAB_HOST", "127.0.0.1"), PORT), Handler).serve_forever()
