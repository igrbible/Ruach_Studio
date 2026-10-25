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
  GET /stems?name=TAKE&mode=vocals|four|six|eight   split into stems (stems_job.py, BS-Roformer + htdemucs_ft; six: + BS-Roformer-SW;
                                   eight: + the karaoke Mel-Roformer and UVR's winds; each stem with a proper title)
  GET /arts                        HERESY 1120: every take that has artwork (name -> time), the ones being drawn;
                                   HERESY 1156: the unseen (its subject not found by the critic: a guess)
  GET /art?name=TAKE               its artwork (JPEG, 768 px)
  GET /art/draw?name=TAKE[&again=1][&seed=N]   draw it (art_job.py): 202 while drawing, then what was drawn; a redraw keeps the old picture in artwork-removed/ (1235)
  GET /art/remove?name=TAKE        HERESY 1156: the picture taken off, kept beside the take (artwork-removed/)
  POST /artist/draw {prompt, shapes, seed, count, painter, take}   HERESY 1255: the Artist room (artist.py): a run of pictures
       from a prompt of one's own; GET /artist/runs · GET /artist/file?id=&file= · POST /artist/cover {id, file, name} ·
       POST /artist/trash {id} · POST /artist/restore {id} · GET /artist/prompt?name=TAKE ·
       POST /artist/star {id, file, star} (1257) · POST /artist/note {id, file, note} (1428) · POST /artist/protect {items, protect} (1367) · POST /artist/stop {id} (1270) · HERESY 1316: GET /artist/loras[?family=] ·
       GET /artist/lora-picture?id= · GET /artist/lora-info?id= · POST /artist/lora-civitai {id} · POST /artist/lora-trash {id} (the adapters in artwork/loras/, artist_loras.py) ·
       HERESY 1360: POST /artist/civitai-look {ref, key} (what a Civitai link names) · POST /artist/civitai-fetch {ref, key, family} | {cancel} ·
       GET /artist/civitai-fetch (the fetch under way or the last; civitai_fetch.py) ·
       HERESY 1337: GET /artist/bin (the art's trash: runs, pictures put aside, covers taken off) · GET /artist/bin-file?take=&stamp= ·
       POST /artist/bin {op: restore | delete | empty, items}
  GET  /fonts/NAME.woff2|.ttf      HERESY 1274: the page's fonts (lab/fonts/, OFL), cached a year (1426: Liberation Mono as TTF)
  GET  /sounds/NAME.mp3            HERESY 1586: the piano roll's instruments (lab/sounds/, CC BY 3.0), cached a year
  POST /jobs/cancel {key}          HERESY 1165: a job waiting for a card off the queue (a running one is refused)
  POST /regen {names, same_seeds}  HERESY 1160: made again, new seeds; same_seeds (1165): its own, at a probe's full length
  POST /section {name, a, b, lyrics, versions, section, parts}  HERESY 1414: a section sung anew (GET /section/live, /section/job?id=, /section/mark?name=)
  POST /section/window {name, a, b, lyrics, versions, pre, post, loras}  HERESY 1757: a window sung anew with adapters of its own, ramps round it
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
  POST /audio/monitor {out, rate} · /audio/monitor/tone · /audio/monitor/play {name, source, at} · /audio/monitor/stop
                                   HERESY 1548: the monitor, a second output on this machine: kept, a tone, a file of a take played
                                   through it from any second, stopped; GET /audio/devices says it and what plays
  GET /loudness?name=TAKE[&path=derived/…]  HERESY 1550: a file's integrated loudness and sample peak, kept per file (an honest A/B)
  POST /gate {name, source, params}  HERESY 1547: the Digital Gateway (digital_gate.py): tape, console, tube, transformer or
                                   vinyl in numbers, a branch of the tree of kind "gate" with what it set and measured
  GET /textend?name=TAKE[&force=1|&cached=1]   where the text of a reading ends (Whisper), for
                                   "Trim to the text": the frames to keep of the take's own tokens
  GET /derived?name=TAKE           everything made from a take: outputs/TAKE/derived/*/manifest.json (and its marks, 1504)
  POST /derived/mark               {name, path, rating, fav}: a like, a dislike or a star on a file made from a take (1504)
  POST /derived/delete             {name, id, with_children}: a branch into its take's derived/.trash/ (409: the children it has) (1527)
  POST /derived/restore · /empty   {name, id} back to the tree · {name} the take's trash gone for good (1527)
  GET /audio/devices               the audio interfaces, physical and virtual, and the gateway's choice (1512)
  POST /audio/gateway              {out, in, rate}: the analog gateway's devices (user/audio.json) (1512)
  POST /audio/probe                {device, rate, seconds}: an input's floor, dBFS per channel (1512)
  POST /audio/loop                 {out, in, rate, level}: a 1 kHz tone out and back: answered, gain, noise, THD (1514)
  GET /refiner/profiles            the Refiner's setups by name (1515); its «pipelines»: the studio's and the plugins' (1553)
  GET /chain/batch · POST /chain/batch {names, …a chain}   one chain on many takes, one after another (1562); POST /chain/batch/stop
  GET /writer/versions[?id=|?title=] · POST /writer/versions {op: keep|mark|delete|undelete}   the Creator's words on each
                                   Generate, one file per base title in KIT/writer-versions/ (1519)
  POST /refiner/profiles           {op: save|delete, name, setup} (1515)
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
  GET /loop?name=&start=&seconds=                 HERESY 1325: a loop cut from the take's WAV, seamless (audio/wav)
  GET /train/datasets · /train/scan?name= · /train/prepare?name= · /train/run?name= · /train/log?name=
  POST /train/prepare {from, name, style, tracks} · /train/run {dataset, name, steps…} · /train/stop {name} · /train/pack {name, undo} (HERESY 1626)
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
  GET /plugins · POST /plugin/run {name, source, plugin, step, params}   HERESY 1460: the Refiner's steps of one's own from
                                   user/plugins/*/plugin.json (plugins.py), each a branch of kind "plugin" in derived/
  GET /daw/set?name=&set=derived/stems-…   HERESY 1470: the Refiner's DAW: a set's strips, their versions, the rest (daw.py)
  GET /daw/chunk?name=&set=&strip=&path=&start=&seconds=   a strip's stretch as FLAC (rest: the source less the set's parts)
  GET /daw/peaks?name=&set=&strip=&path=[&n=1200]   a strip's wave, the loudest of each stretch, 0…1
  GET /daw/loudness?name=&set=   HERESY 1755: the set's source a 100 ms block as the DAW's loudness meter reads it, and its integrated loudness
                                 (the reference, matched to the mix; /daw/chunk with strip=source plays it)
  GET /peaks?name=&path=[&n=400]   any sound of the take's tree as its wave (HERESY 1487: the tree's players)
  GET /c2pa · POST /c2pa {on, author, contact, cert, key}   Content Credentials (HERESY 1489, c2pa_sign.py): its state and settings
  GET /c2pa/file?name=&format=wav|flac|mp3&from=/library/…[&path=derived/…]   the engine's download, signed on the way
  POST /daw/mix {name, set, mix, versions}   the mixdown by Plenio's stem mixer (daw_job.py), a branch of kind "daw"
  POST /daw/mix {…, mix: ruach.mix/1, print}  HERESY 1531: the Refiner's mixer (daw_mix.py); print: each strip and return its own file
  POST /daw/mix/stop {name, id}    HERESY 1539: a mix off the queue, or its process ended; no branch, its folder gone
  GET /daw/ir?preset=room|plate|hall&rate=48000   HERESY 1531: the room's impulse (WAV, float), the one the render convolves with
  GET /daw/mixes?name=&set=        HERESY 1533: the set's working mix and its named mixes (derived/<set>/mixes.json)
  POST /daw/mixes {name, set, working} | {…, save_as, state} | {…, delete}   the working mix kept, a mix kept by name, one deleted

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
import plugins as plugin_kit  # noqa: E402   HERESY 1460: the Refiner's steps of one's own (user/plugins/)
import daw as daw_kit  # noqa: E402   HERESY 1470: the Refiner's DAW (Plenio's stem mixer, plenio_core/)
import daw_mix  # noqa: E402   HERESY 1531: the Refiner's mixer, its render (ruach.mix/1)
import daw_mixes  # noqa: E402   HERESY 1533: the DAW's mixes kept beside their set
import merges  # noqa: E402   HERESY 1494: what a merged backbone carries, read from its file
import derived_marks  # noqa: E402   HERESY 1504: likes, dislikes and stars on the files made from a take
import chain_plan  # noqa: E402   HERESY 1508: the chain's steps, and «up to this node»
import audio_io  # noqa: E402   HERESY 1512: the audio interfaces, physical and virtual, and the analog gateway's choice
import refiner_profiles  # noqa: E402   HERESY 1515: the Refiner's setups by name
import creator_versions  # noqa: E402   HERESY 1519: the Creator's words on each Generate, apart from the takes
import derived_trash  # noqa: E402   HERESY 1527: a branch into its take's trash and back
import c2pa_sign  # noqa: E402   HERESY 1489: Content Credentials on the downloads
import file_tags  # noqa: E402   HERESY 1635: the song's tags on the downloads, before the signature
import gpu_live  # noqa: E402   HERESY 1264: the cards second by second, for the page's live graphs
import section  # noqa: E402   HERESY 1414: Replace a section
import machine  # noqa: E402   HERESY 1304: the machine as a new studio's first start reads it
import artist_loras  # noqa: E402   HERESY 1316: the Artist's adapters
import weights  # noqa: E402   HERESY 1289: the Engine's Models card over heresy/fetch-heresy.sh
import lora_alchemy  # HERESY 1447: what each LoRA touches, which share layers
import takeloop  # noqa: E402   HERESY 1325: a loop from a take
import takeedit  # noqa: E402   HERESY 1356: a take cropped, a section taken out, its speed changed: a new take
import takechanges  # noqa: E402   HERESY 1358: where a take's music changes; a slice of its spectrogram
import civitai_fetch  # noqa: E402   HERESY 1360: an adapter from Civitai on the user's word, with their own key

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
        unclaim()                                       # HERESY 1376b: its cards' claims go with its turn
        heavy.release()
        return False


class whisper_turn:
    """HERESY 1376 (Viktor 11.10.2026: «Да, делай Whisper мимо замка»): the turn of a Whisper job (the lyrics' timing, the lyrics
    check, Listen): one Whisper at a time, and not behind the lab's heavy turn when a card of the lab's jobs has room for it beside
    what runs (an Artist upscale of 29 minutes held the turn while GPU2 stood empty, and two timings waited 24 and 21 minutes). While
    no such card has room (a job just given a card holds its claim 90 s), it waits for whichever comes first: such a card, asked every
    5 s, or the heavy turn as before (Whisper then takes a card, or the processor). .gpu: the card claimed, else None."""

    def __init__(self, job, need=None):
        self.job, self.need, self.gpu, self.heavy = job, need, None, False

    def _gone(self):
        with jobs_lock:
            return self.job is not None and bool(self.job.get("cancel"))

    def _running(self):
        if self.job is not None:
            with jobs_lock:
                self.job["status"] = "running"

    def __enter__(self):
        whisper_lock.acquire()
        try:
            while True:
                if self._gone():
                    raise Cancelled(OFF_QUEUE)
                try:
                    self.gpu, _ = free_gpu(self.need, why="Whisper", unload=False, spill=False)
                except RuntimeError:
                    self.gpu = None
                if self.gpu is not None:
                    self._running()
                    return self
                if heavy.acquire(timeout=5):
                    self.heavy = True
                    if self._gone():
                        raise Cancelled(OFF_QUEUE)
                    self._running()
                    return self
        except BaseException:
            if self.heavy:
                heavy.release()
                self.heavy = False
            whisper_lock.release()
            raise

    def __exit__(self, *exc):
        try:
            unclaim()                                   # HERESY 1376b: its card's claim goes with its turn
            if self.heavy:
                heavy.release()
        finally:
            whisper_lock.release()
        return False


whisper_lock = threading.Lock()
# HERESY 1376: the cards given to jobs a moment ago, each with the need it was given for, held 90 s: a job's process takes its memory
# some seconds after its card is chosen, and the jobs no longer all wait behind one turn; a job's claims go with its turn (1376b: an
# Artist run's claim outlived the run, and the Whisper after it went to the processor beside an empty card)
CLAIMS, claims_lock, CLAIM_S = [], threading.Lock(), 90


def claimed():
    """HERESY 1376: the MiB claimed on each card these 90 s, {index: MiB} (the lock held by the caller)."""
    now = time.time()
    CLAIMS[:] = [c for c in CLAIMS if c[2] > now]
    out = {}
    for card, mb, *_ in CLAIMS:
        out[card] = out.get(card, 0) + mb
    return out


def unclaim():
    """HERESY 1376b: the claims this thread made, gone with its turn."""
    me = threading.get_ident()
    with claims_lock:
        CLAIMS[:] = [c for c in CLAIMS if c[3] != me]


def _pick(allowed, back, need, claim, held=None):
    """HERESY 1376: the guard's pick with the claims off each card's room; the card claimed for the need when it is given. HERESY
    1378: held, {index: MiB} of the job's own process already on a card (a kept painter), counted as free there."""
    with claims_lock:
        card, cards = gpu_guard.pick(allowed, fallback=back, need_mb=need, less=claimed(), held=held)
        if card and claim:
            CLAIMS.append((card["index"], need, time.time() + CLAIM_S, threading.get_ident()))
    return card, cards


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


ENGINE_URL = "http://127.0.0.1:" + os.environ.get("YUE2CPP_PORT", "7777")


def engine_unload(why):
    """HERESY 1297 (Viktor 10.10.2026: «На единственной видеокарте нужно автоматом выгружать модели, если другие задания требуют
    загрузку иных весов. Иначе никак»): the studio's engine lets its models go when it is idle and holds some, so a job that needs
    the card gets it; they load again with the next song. The MiB freed: 0 when there was nothing to free, or the engine renders,
    or it does not answer (the job then waits as before). The engine shows no queue, only «busy»: it must be idle at two looks
    three seconds apart, so the page's next take, sent the moment one ends, is not left without its models."""
    import urllib.request
    try:
        for look in (0, 1):
            if look:
                time.sleep(3)
            hw = json.load(urllib.request.urlopen(ENGINE_URL + "/hardware", timeout=5))
            if hw.get("busy") or (hw.get("loaded_bytes") or 0) < 256 * 2 ** 20:
                return 0
        req = urllib.request.Request(ENGINE_URL + "/unload", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
        r = json.load(urllib.request.urlopen(req, timeout=15))
        freed = int(r.get("freed_mb") or 0) if r.get("applied") else 0
    except (OSError, ValueError):
        return 0
    if freed:
        act_say(f"the engine's models left its card for {why} ({freed} MB): they load again with the next song")
        time.sleep(1.5)                                  # the driver hands the memory back
    return freed


# HERESY 1370b: a lab for tests keeps to its own cards (no fallback to any card the guard passes)
JOBS_ROLE_ONLY = os.environ.get("LAB_JOBS_ROLE_ONLY") == "1"


def free_gpu(need=None, role="jobs", why="a lab job", only=None, claim=True, unload=True, spill=False, held=None):
    """A card for a job, through the guard (HERESY 1112, 1113): no heavy stranger on it (a service above 2 GiB), and room
    for the job.
    The cards given to `role` (HERESY 1091: user/gpus.json), the most free first. HERESY 1378b: the lab's jobs keep to their
    own cards as training does (spill True, asked by no one now, would let them take any card the guard passes, the studio's
    among them). None will do: refused aloud, card by card."""
    need = need or NEED_MB
    # HERESY 1376: claim, the card held for the need 90 s (a look that only asks claims nothing); unload False, the idle engine's
    # models not asked to go; spill (1378b: False by default), the role's own cards only
    try:
        allowed = gpu_roles.load(KIT, training.gpus()).get(role) or []
        back = role == "jobs" and not JOBS_ROLE_ONLY and spill
        if only is not None:                            # HERESY 1370b: that card or none (a kept painter's)
            allowed, back = [c for c in allowed if c == only] if allowed else [only], False
        card, cards = _pick(allowed, back, need, claim, held)
        if not card and only is None and unload and engine_unload(why):   # HERESY 1297: the idle engine's models make room, then the guard again
            card, cards = _pick(allowed, back, need, claim, held)
    except (OSError, subprocess.SubprocessError) as e:
        raise RuntimeError(f"the cards could not be read: {e}")
    if not card:
        raise RuntimeError(f"no card can take this now (it needs {need} MB): {gpu_guard.verdict(cards)}."
                           " Engine \u2192 GPUs says which card does what")
    return card["index"], card["free_mb"]


def more_gpus(need, exclude=(), most=1, role="jobs"):
    """HERESY 1354: the other cards given to `role` with room for `need` now, the most free first; never a card of another role (no
    fallback): the Artist spreads a run's pictures over them."""
    if most < 1:
        return []
    try:
        allowed = gpu_roles.load(KIT, training.gpus()).get(role) or []
        cards = gpu_guard.snapshot()
    except (OSError, subprocess.SubprocessError, RuntimeError):
        return []
    with claims_lock:                                   # HERESY 1376: the claims off each card's room; the cards given claimed
        less = claimed()
        good = [c for c in cards if c["ok"] and c["index"] in allowed and c["index"] not in exclude and
                (c["room_mb"] - less.get(c["index"], 0) >= need or (not less.get(c["index"]) and gpu_guard.empty_fits(c, need)))]
        out = [c["index"] for c in sorted(good, key=lambda c: -(c["room_mb"] - less.get(c["index"], 0)))][:most]
        CLAIMS.extend((i, need, time.time() + CLAIM_S, threading.get_ident()) for i in out)
    return out


def job_cards():
    """HERESY 1354: the room of each card given to the lab's jobs (its limit, else its whole memory, less the CUDA runtime's), MiB: what
    a painter could have there."""
    try:
        allowed = gpu_roles.load(KIT, training.gpus()).get("jobs") or []
        return [int(c.get("limit_mb") or c["total_mb"]) - gpu_guard.SPARE_MB for c in gpu_guard.snapshot() if c["index"] in allowed]
    except (OSError, subprocess.SubprocessError, RuntimeError, KeyError, TypeError):
        return []


ART_WAIT_S = 3 * 3600              # HERESY 1167: how long an artwork waits in the queue for a card


def wait_card(job, need, what, held=None):
    """HERESY 1167 (Viktor: «Artwork не ставится в очередь»): a job that needs a card stands in the queue until one has
    room for it, instead of failing at once. The guard is asked every ten seconds, outside the lab's one heavy lock (the
    other jobs go on meanwhile); its verdict is kept in the job (job["waiting"]) and said in the activity once; taken off
    the queue (POST /jobs/cancel) the job ends; after ART_WAIT_S it fails, saying why."""
    t0, said = time.time(), False
    try:                                               # HERESY 1331: a job no card here could take even empty is refused at once
        allowed = gpu_roles.load(KIT, training.gpus()).get("jobs") or []
        # HERESY 1386: a card's VRAM limit is its ceiling for good (a job above it waited for ever, and a painter that could stream
        # from RAM never did): the largest card is the largest ceiling, its size or its limit
        cards = [c for c in gpu_guard.snapshot() if c["ok"] and (c["index"] in allowed or not allowed)]
        biggest = max([min(c["total_mb"], c["limit_mb"]) if c.get("limit_mb") else c["total_mb"] for c in cards] or [0])
        limited = any(c.get("limit_mb") and c["limit_mb"] < c["total_mb"] for c in cards)
    except (OSError, subprocess.SubprocessError, RuntimeError):
        biggest, limited = 0, False
    if biggest and need > biggest - gpu_guard.SPARE_MB:
        raise RuntimeError(f"no card here can take this (it needs {need} MB; the largest card holds {biggest} MiB" + (" under its limit" if limited else "") +
                           f", {gpu_guard.SPARE_MB} of them the CUDA runtime's): fewer adapters, a smaller quant, or a larger card")
    while True:
        if job.get("cancel"):
            raise Cancelled(OFF_QUEUE)
        try:
            # HERESY 1376: a look, not a pick: the turn asks again; 1378: held (or a function giving it, asked each time), the job's
            # own process on a card
            return free_gpu(need, why=what, claim=False, held=held() if callable(held) else held)
        except RuntimeError as e:
            if time.time() - t0 > ART_WAIT_S:
                raise RuntimeError(f"no card came free in {ART_WAIT_S // 3600} hours: {e}")
            job["waiting"] = str(e)
            if not said:                               # the activity says «waits for a card» itself: here, why
                act_say(f"{what} · {e}")
                said = True
            time.sleep(10)


LORA_LOCK = threading.Lock()


def lora_cache(save=None):
    """HERESY 1316: the adapters' hashes and the ones Civitai does not know (CACHE/artist-loras.json); with save, written."""
    p = CACHE / "artist-loras.json"
    if save is not None:
        CACHE.mkdir(exist_ok=True)
        tmp = Path(str(p) + ".part")
        tmp.write_text(json.dumps(save), encoding="utf-8")
        os.replace(tmp, p)
        return save
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def whisper_env(gpu=None):
    """HERESY 1141: the environment for a Whisper job: a card the guard gives, else the CPU (int8, slower: about the
    song's own length on 16 threads), said in the job's result. (env, device, why). HERESY 1376: gpu, the card its turn claimed."""
    base = dict(os.environ, LD_LIBRARY_PATH=f"{NV}/cudnn/lib:{NV}/cublas/lib:" + os.environ.get("LD_LIBRARY_PATH", ""))
    try:
        if gpu is None:
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
            for g in training.run_cards(training._meta(training.paths(KIT)["runs"] / name)):   # HERESY 1631: every card a run holds
                live[g] = name
    now = gpu_roles.studio_now()
    studio = now if now is not None else roles["studio"]
    try:                                                # HERESY 1140: the guard's verdict, card by card, as the jobs get it
        guard = [dict(c, foreign=[{"pid": p, "name": n, "mb": mb, "heavy": mb > gpu_guard.HEAVY_MB} for p, n, mb in c["foreign"]])
                 for c in gpu_guard.snapshot()]
    except (OSError, RuntimeError, subprocess.SubprocessError) as e:
        guard = {"error": str(e)}
    return {"cards": cards, "roles": roles, "saved": gpu_roles.path(KIT).is_file(), "studio_now": now, "guard": guard,
            "training": {str(g): n for g, n in live.items()},
            "studio_training": live.get(studio),
            "arc": [{"index": i, "bdf": b, "name": n, "total_mb": t} for i, b, h, n, t in gpu_live._xe_cards()]}   # HERESY 1680: the Intel cards


def machine_state():
    """HERESY 1304 (Viktor 10.10.2026: «при самом старте новой Студии сканирование устройств и выбор оптимальных настроек для YuE2
    BF16/кванта и для модели генерации обложек»): the cards with their compute capability, limits and BF16 tensor cores, the
    studio's card, and the painter that fits here: Qwen-Image 2512, Q6 or Q4 whole, Q4 streamed from RAM on a smaller card (1428: Krea 2 gone);
    none when no card has even that ({"error"} when the cards cannot be read)."""
    try:
        cards = machine.cards()
    except RuntimeError as e:
        return {"cards": [], "error": str(e)}
    roles = gpu_roles.load(KIT, [{"index": c["index"], "total_mb": c["total_mb"]} for c in cards])
    now = gpu_roles.studio_now()
    lim = {int(k): int(v) for k, v in (roles.get("limits") or {}).items()}
    for c in cards:
        c["limit_mb"] = lim.get(c["index"])
        c["bf16_cores"] = machine.has_bf16_cores(c["compute"])
    room = max((min(c["total_mb"], c["limit_mb"] or 10 ** 9) for c in cards), default=0)
    ready, fits, best = {}, [], ""                     # HERESY 1428: Krea 2 gone
    # HERESY 1425 (Viktor 13.10.2026: «На RTX3090 я бы однозначно советовал QWEN Image 2512, и тем более машине с тремя такими GPU»): where a
    # card holds it whole (its text encoder leaves the card before the transformer comes), Qwen-Image 2512 by the cards, as art_by_cards
    for q in ("qwen2512-q6", "qwen2512-q4"):
        ready[q] = artist.qwen_ready(q)
        if ART_NEED[q] <= room:
            fits.insert(0, q)
    if "qwen2512-q4" not in fits and ART_STREAM_NEED["qwen2512-q4"] <= room:   # HERESY 1428: a smaller card streams Q4 from RAM
        fits.append("qwen2512-q4")
    best = next((q for q in ("qwen2512-q6", "qwen2512-q4") if q in fits), best)
    return {"cards": cards, "studio": now if now is not None else roles.get("studio", 0), "room_mb": room,
            "painter": {"suggest": best, "ready": ready, "fits": fits, "need_mb": ART_NEED}}


def studio_restart():
    """Restart the studio (a new card for it, from user/gpus.json), only when it is not rendering."""
    port = os.environ.get("YUE2CPP_PORT", "7777")
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
    with whisper_turn(job) as wt:                        # HERESY 1165: off the queue while it waits; 1376: Whisper's own turn
        env, gpu, why = whisper_env(wt.gpu)              # HERESY 1141: a card, or the CPU when none can take it
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
            res = json.load(open(out, encoding="utf-8"))
            # HERESY 1646: a timing made before each word kept its time is aligned again from Whisper's words already heard (no new pass)
            if res.get("rows") and "tt" not in res["rows"][0] and words.is_file():
                try:
                    rows = timing.align(json.load(open(words, encoding="utf-8")), lyrics)
                    hint = CACHE / f"{name}.words-hint.json"
                    if hint.is_file():
                        rows = timing.merge(rows, timing.align(json.load(open(hint, encoding="utf-8")), lyrics))
                    if len(rows) == len(res["rows"]):
                        res["rows"] = rows
                        json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
                except (OSError, ValueError, KeyError):
                    pass                                 # the timing as it was: its words share their lines evenly
            return res
        if cached_only:
            raise FileNotFoundError("not timed yet")
        job = {"status": "queued", "started": time.time(), "kind": "timing"}
        jobs[key] = job

    def work():
        try:
            lang = timing.language(lyrics)
            if force or not words.is_file() or words.stat().st_mtime < audio.stat().st_mtime:
                with whisper_turn(job) as wt:            # HERESY 1376: Whisper's own turn
                    job["status"] = "running"
                    env, gpu, why = whisper_env(wt.gpu)  # HERESY 1141
                    job["gpu"] = gpu
                    part = Path(str(words) + ".part")
                    p = subprocess.run([str(WHISPER_PY), str(HERE / "whisper_job.py"), str(audio), str(part), lang or "",
                                        str(WHISPER_DIR), "words"], env=env, capture_output=True, text=True, timeout=1800)
                    if p.returncode != 0:
                        raise RuntimeError("Whisper failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                    os.replace(part, words)
            job["status"] = "running"
            rows = timing.align(json.load(open(words, encoding="utf-8")), lyrics)
            heard = sum(not r["guessed"] for r in rows) / len(rows)
            hinted, by = 0, ""
            # HERESY 1417 (Viktor: «Лучше Whisper с Qwen-Omni допилить ещё малость»): under 85 % heard, a second pass with the lyrics as
            # hotwords, on the vocal stem when the take has one; it only times the lines the first pass guessed (timing.merge)
            if heard < 0.85:
                d = take_dir(name)
                stem = next((p for p in sorted(d.glob("derived/stems-*/vocals.flac")) if p.is_file()), None)
                src = stem or audio
                words2 = CACHE / f"{name}.words-hint.json"
                try:
                    if force or not words2.is_file() or words2.stat().st_mtime < src.stat().st_mtime:
                        with whisper_turn(job) as wt:
                            env, gpu, why = whisper_env(wt.gpu)
                            env = dict(env, WHISPER_HOTWORDS=" ".join(timing.sung(lyrics).split())[:600])
                            part = Path(str(words2) + ".part")
                            p = subprocess.run([str(WHISPER_PY), str(HERE / "whisper_job.py"), str(src), str(part), lang or "",
                                                str(WHISPER_DIR), "words"], env=env, capture_output=True, text=True, timeout=1800)
                            if p.returncode != 0:
                                raise RuntimeError((p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                            os.replace(part, words2)
                    rows = timing.merge(rows, timing.align(json.load(open(words2, encoding="utf-8")), lyrics))
                    hinted = sum(1 for r in rows if r.get("hinted"))
                    by = "the vocal stem, the lyrics as hints" if stem else "the lyrics as hints"
                except Exception as e:                   # the second pass is a help, never a failure of the timing
                    act_say(f"lyrics timing · {name} · the second pass failed: {e}")
            res = {"name": name, "language": lang or "auto", "rows": rows, "hinted": hinted, "second_pass": by,
                   "heard": round(sum(not r["guessed"] for r in rows) / len(rows), 3), "at": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1719 (RIVALS 9, Match sections): the lyrics timed on a recording that is not a take (a cover's source). The recording is kept in the
# cache by its hash, so Whisper hears it once however often its lyrics change; the lines are aligned as a take's are (timing.align).
REC_JOBS = {}


def timing_recording(data):
    import base64, hashlib
    lyrics = str(data.get("lyrics") or "")
    if not timing.rows_of(lyrics):
        raise ValueError("no lyrics to time")
    try:
        raw = base64.b64decode(str(data.get("audio") or ""), validate=True)
    except ValueError:
        raise ValueError("the recording: base64, please")
    if len(raw) < 4096:
        raise ValueError("no recording")
    ext = Path(str(data.get("file") or "x.wav")).suffix.lower()
    ext = ext if ext in (".wav", ".mp3", ".flac", ".m4a", ".ogg", ".opus", ".aac") else ".wav"
    rid = hashlib.sha256(raw).hexdigest()[:16]         # the recording: its words, heard once
    sid = rid + "-" + hashlib.sha256(lyrics.encode("utf-8")).hexdigest()[:8]   # HERESY 1719b: the job, the recording with these lyrics
    CACHE.mkdir(exist_ok=True)
    src, words = CACHE / f"rec-{rid}{ext}", CACHE / f"rec-{rid}.words.json"
    with jobs_lock:
        job = REC_JOBS.get(sid)
        if job and job["status"] in ("queued", "running"):
            return dict({k: v for k, v in job.items() if k != "lyrics"}, id=sid)
        job = {"status": "queued", "started": time.time(), "kind": "timing", "lyrics": lyrics}
        REC_JOBS[sid] = job
    if not src.is_file():
        src.write_bytes(raw)

    def work():
        try:
            lang = timing.language(lyrics)
            if not words.is_file():
                with whisper_turn(job) as wt:
                    job["status"] = "running"
                    if not words.is_file():              # HERESY 1719b: another job may have heard it while this one waited its turn
                        env, gpu, why = whisper_env(wt.gpu)
                        job["gpu"] = gpu
                        part = Path(str(words) + ".part")
                        r = subprocess.run([str(WHISPER_PY), str(HERE / "whisper_job.py"), str(src), str(part), lang or "", str(WHISPER_DIR), "words"],
                                           env=env, capture_output=True, text=True, timeout=1800)
                        if r.returncode != 0:
                            raise RuntimeError("Whisper failed: " + (r.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                        os.replace(part, words)
            rows = timing.align(json.load(open(words, encoding="utf-8")), lyrics)
            job.update(status="done", rows=rows, language=lang or "auto", heard=round(sum(not x["guessed"] for x in rows) / len(rows), 3))
        except Exception as e:
            job.update(status="failed", error=str(e))
        finally:
            job.pop("lyrics", None)
            threading.Timer(600, lambda: REC_JOBS.pop(sid, None) if REC_JOBS.get(sid) is job else None).start()
    threading.Thread(target=work, daemon=True).start()
    return {"status": job["status"], "id": sid}


def timing_recording_job(sid):
    job = REC_JOBS.get(str(sid or ""))
    if not job:
        raise FileNotFoundError("no such timing: it ended over ten minutes ago, or was never asked")
    return dict({k: v for k, v in job.items() if k != "lyrics"}, id=sid)


# HERESY 1020: the spectrum, computed here instead of in the browser. CPU only, so it does not
# wait for the GPU lock; one at a time of its own. Needs numpy: the Whisper venv's python.
NUMPY_PY = Path(os.environ.get("LAB_NUMPY_PY", LAB_PY))
cpu = threading.Lock()


SPEC_MODES = ("mono", "lr", "ms", "pan")         # HERESY 1740: mono as before; left/right, mid/side, the pan map


def spec_mode(mode):
    mode = str(mode or "mono")
    if mode not in SPEC_MODES:
        raise ValueError(f"a spectrum is one of {list(SPEC_MODES)}")
    return mode


def spectrum_file(name, source="", mode="mono"):
    audio, tag = source_of(name, source)
    if not audio or not audio.is_file():
        raise FileNotFoundError(f"{name} has no audio")
    CACHE.mkdir(exist_ok=True)
    mode = spec_mode(mode)
    out = CACHE / f"{name}{tag}{'' if mode == 'mono' else '.' + mode}.spec"   # HERESY 1740: each mode its own file
    if out.is_file() and out.stat().st_mtime >= audio.stat().st_mtime:
        return out
    with cpu:
        tmp = out.with_name(out.name + ".part")
        p = subprocess.run([str(NUMPY_PY), str(HERE / "spectrum_job.py"), str(audio), str(tmp), mode],
                           capture_output=True, text=True, timeout=600)
        if p.returncode != 0:
            raise RuntimeError("spectrum failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1])
        tmp.replace(out)
    return out


def spectrum_async(name, source="", mode="mono"):
    """The file when it is ready; otherwise the job's state, starting the job if needed."""
    audio, tag = source_of(name, source)
    mode = spec_mode(mode)
    out = CACHE / f"{name}{tag}{'' if mode == 'mono' else '.' + mode}.spec"   # HERESY 1740
    key = "spectrum:" + name + tag + ("" if mode == "mono" else ":" + mode)
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
            spectrum_file(name, source, mode)
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
            out.append(json.load(open(m, encoding="utf-8"), parse_constant=lambda c: None))   # HERESY 1576: NaN/Infinity as null, the reply stays JSON
        except ValueError:
            pass
    with jobs_lock:
        running = [dict(v, key=k) for k, v in jobs.items()
                   if any(k.startswith(kind + ":" + name) for kind in ("stems", "remaster", "upscale", "debuzz", "plugin", "daw", "gate"))]   # 1460, 1470, 1547
    return {"name": name, "derived": out, "running": running, "marks": derived_marks.read(take_dir(name)),   # HERESY 1504
            "trash": derived_trash.listing(take_dir(name))}   # HERESY 1527


def derived_busy(name):
    """HERESY 1527: a job of this take running: its branches are not moved under it"""
    with jobs_lock:
        return any(k.split(":")[1:2] == [name] for k, v in jobs.items() if v.get("status") in ("queued", "running"))


DAW_SEEN, DAW_PEAKS = {}, {}
DAW_IR = {}   # HERESY 1531: the room's impulses, by preset and rate
DAW_LOUD = {}   # HERESY 1755: the sources' loudness blocks, by file and its time
DAW_PROCS = {}   # HERESY 1539: a running mix's process, by its job's key, so Stop can end it
FILE_PEAKS = collections.OrderedDict()               # HERESY 1487: (name, path, n) -> (stamp, peaks, seconds)


def studio_version():
    try:
        return (KIT / "VERSION").read_text(encoding="utf-8").strip() or "2"
    except OSError:
        return "2"


def c2pa_for(d, data, fmt, rel=""):
    """HERESY 1489: a file of take folder d signed, or why not: (bytes, said). Off or imported: as it came, said so; on and signable:
    signed, or ValueError with the reason (a download asked to be signed is never handed over unsigned in silence)."""
    s = c2pa_sign.load(config_dir())
    if not s["on"]:
        return data, "unsigned: off"
    try:
        req = json.load(open(d / "request.json", encoding="utf-8"))
    except (OSError, ValueError):
        req = {}
    if req.get("imported"):
        return data, "unsigned: imported (not made here)"
    ok, why = c2pa_sign.available()
    if not ok:
        raise ValueError("Content Credentials are on but cannot sign: " + why)
    try:
        title = json.load(open(d / "meta.json", encoding="utf-8")).get("title") or d.name
    except (OSError, ValueError):
        title = d.name
    return c2pa_sign.sign(config_dir(), data, fmt, title, studio_version(), c2pa_sign.edits_of(d, rel)), "signed"


def c2pa_file(q):
    name, fmt, src, rel = q.get("name", ""), q.get("format", ""), q.get("from", ""), q.get("path", "")
    d = take_dir(name)
    if not src.startswith("/library/") or "://" in src or ".." in src:
        raise ValueError("from is one of the engine's own /library/ downloads")
    if fmt not in c2pa_sign.MIME:
        raise ValueError("format: wav, flac or mp3")
    with urllib.request.urlopen(ENGINE_URL + src, timeout=900) as r:
        data, head = r.read(), {k: r.headers.get(k) for k in ("Content-Type", "Content-Disposition") if r.headers.get(k)}
    # HERESY 1635 (RIVALS 8): the title, the lyrics, the style, the cover and the studio in the file, so a player shows the song whole; signed after
    data, tagged = file_tags.tag(data, fmt, file_tags.song_of(d), author=str(c2pa_sign.load(config_dir()).get("author") or ""),
                                 software="Ruach Studio " + studio_version())
    head["X-Tags"] = tagged.encode("ascii", "replace").decode("ascii")[:200]   # a header is latin-1
    if q.get("sign") == "0":                         # HERESY 1635: the page asks for the tags alone (signing off or not available there)
        return data, head, "unsigned: not asked"
    data, said = c2pa_for(d, data, fmt, rel)
    return data, head, said


def file_peaks(name, rel, n):
    d = take_dir(name)
    p = daw_kit._inside(d, rel)
    st = p.stat()
    k, stamp = (name, rel, int(n)), (st.st_mtime_ns, st.st_size)
    hit = FILE_PEAKS.get(k)
    if not hit or hit[0] != stamp:
        pk, secs = daw_kit.file_peaks(d, rel, n)
        FILE_PEAKS[k] = hit = (stamp, pk, round(secs, 3))
        while len(FILE_PEAKS) > 400:
            FILE_PEAKS.popitem(last=False)
    return {"peaks": hit[1], "seconds": hit[2]}


def daw_info(name, rel):
    """HERESY 1470: the DAW's strips of a set, read again when the take's branches change (a chunk asks it every few seconds)."""
    d = take_dir(name)
    dd = d / "derived"
    stamp = (dd.stat().st_mtime_ns if dd.is_dir() else 0, rel)
    hit = DAW_SEEN.get((name, rel))
    if hit and hit[0] == stamp:
        return d, hit[1]
    info = daw_kit.set_info(d, rel, derived_list(name)["derived"])
    DAW_SEEN[(name, rel)] = (stamp, info)
    return d, info


def daw_async(name, rel, mix, versions, printed=False):
    """HERESY 1470: the set mixed as the DAW says, a branch of kind "daw" beside the take's others; 1531: the mixer's ruach.mix/1 too,
    checked before the job is queued, and `printed`: each strip and return as its own file beside the mix."""
    d, info = daw_info(name, rel)
    if not isinstance(mix, dict) or mix.get("schema") not in ("plenio.stem_mix/1", daw_mix.SCHEMA):
        raise ValueError('the mix is a ruach.mix/1 or a plenio.stem_mix/1 value: {"schema": "ruach.mix/1", "strips": {…}}')
    if mix.get("schema") == daw_mix.SCHEMA:
        try:
            daw_mix.parse(mix, [s["name"] for s in info["strips"]] + [daw_kit.REST], int(info["rate"]))
        except Exception as e:                       # a typo or a value out of range: said now, not in a failed job
            raise ValueError(str(e))
    versions = {k: str(v) for k, v in (versions or {}).items() if isinstance(k, str)}
    for s in info["strips"]:
        if s["name"] in versions and versions[s["name"]] not in [v["path"] for v in s["versions"]]:
            raise ValueError(f"{versions[s['name']]} is not a version of {s['name']}")
    did = "daw-" + time.strftime("%Y%m%d-%H%M%S")
    key = f"daw:{name}:{did}"
    job = {"status": "queued", "started": time.time(), "kind": "daw", "id": did, "label": "DAW mix"}
    with jobs_lock:
        jobs[key] = job

    tmp = d / "derived" / (did + ".part")

    def work():
        try:
            with cpu:
                if job.get("stop"):                   # HERESY 1539: stopped while it waited for the machine
                    raise RuntimeError("stopped")
                job["status"] = "running"
                tmp.mkdir(parents=True, exist_ok=True)
                spec = tmp / ".spec.json"
                json.dump({"set": info["set"], "mix": mix, "versions": versions, "print": bool(printed)}, open(spec, "w", encoding="utf-8"), ensure_ascii=False)
                p = subprocess.Popen([str(LAB_PY), str(HERE / "daw_job.py"), str(d), str(spec), str(tmp)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                DAW_PROCS[key] = p
                if job.get("stop"):
                    p.terminate()
                try:
                    out, err = p.communicate(timeout=3600)
                finally:
                    DAW_PROCS.pop(key, None)
                if job.get("stop"):
                    raise RuntimeError("stopped")
                if p.returncode != 0:
                    raise RuntimeError("the DAW mix failed: " + (err.strip().splitlines() or ["no output"])[-1][-300:])
                r = json.loads(out.strip().splitlines()[-1])
                spec.unlink()
            manifest = {"id": did, "kind": "daw", "label": "DAW mix", "parent": name, "source": info["set"], "mix": mix, "versions": r["versions"], "printed": bool(printed),
                        "report": r["report"], "loudness": r["loudness"], "lowered_db": r["lowered_db"],
                        "files": [dict(f, path=f"derived/{did}/{f['file']}") for f in r["files"]], "took": r["took"],
                        "created": time.strftime("%Y-%m-%d %H:%M")}
            json.dump(manifest, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            tmp.rename(d / "derived" / did)
            with jobs_lock:
                jobs.pop(key, None)
        except Exception as e:
            if job.get("stop"):                       # HERESY 1539: no branch, no half-written folder, off the list
                shutil.rmtree(tmp, ignore_errors=True)
                with jobs_lock:
                    jobs.pop(key, None)
                act_say(f"DAW mix · {name} · stopped")
                return
            job.update(status="failed", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


def daw_stop(name, did):
    """HERESY 1539: a DAW mix stopped by the hand: off the queue if it waits, its process ended if it runs."""
    key = f"daw:{name}:{did}"
    with jobs_lock:
        job = jobs.get(key)
        if not job or job.get("status") not in ("queued", "running"):
            raise FileNotFoundError("no such mix waiting or running")
        job["stop"] = True
        was = job.get("status")
        if was == "queued":                           # off the list at once; it leaves quietly when its turn comes
            jobs.pop(key, None)
        proc = DAW_PROCS.get(key)
    if proc and proc.poll() is None:
        proc.terminate()
    return {"stopping": did, "was": was}


def stems_async(name, mode, source=""):
    if mode not in ("vocals", "four", "six", "eight"):        # HERESY 1462: six, with BS-Roformer-SW; 1463: eight
        raise ValueError("mode is vocals, four, six or eight")
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


IMPORTED = "\U0001f6a8 IMPORTED"                     # HERESY 1481: where every import lands


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
    out = {"name": name, "title": title, "seconds": round(secs, 2)}
    try:                                                 # HERESY 1481: every import lands in 🚨 IMPORTED; said only when it did
        collection.collection_post(config_dir(), OUTPUTS, {"op": "ws-add", "workspace": IMPORTED, "names": [name]})
        out["workspace"] = IMPORTED
    except (OSError, ValueError) as e:
        print(f"[lab] {name} imported, not put in {IMPORTED}: {e}", file=sys.stderr, flush=True)
    return out


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
# HERESY 1460: a plugin's step on the take or a file of its tree, a branch of its own (plugins.py says what a plugin is). On the
# CPU, one at a time as the other CPU jobs; its files are checked to be where it said before the branch appears
PLUGINS = Path(os.environ.get("LAB_PLUGINS", KIT / "user" / "plugins"))
BUILTIN_STEPS = HERE / "builtin_steps"              # HERESY 1553: the studio's own steps, shipped (plugins.load_all)


def file_param(name, value, label):
    """HERESY 1557: a step's file field: a file of this take's tree («derived/…» or the take's own audio) or another take («take:NAME»,
    its audio); (its path, a name to say it by). Said when missing or outside."""
    v = str(value or "").strip()
    if not v:
        raise ValueError(f"{label}: choose a file")
    if v.startswith("take:"):
        other = v[5:]
        a = next((take_dir(other) / f for f in ("audio.wav", "audio.flac") if (take_dir(other) / f).is_file()), None)
        if not a:
            raise ValueError(f"{label}: {other} has no audio")
        return a, other
    d = take_dir(name)
    p = (d / v).resolve()
    if d.resolve() not in p.parents or not p.is_file():
        raise ValueError(f"{label}: {v} is not a file of this take")
    return p, v


def plugin_async(name, pid, sid, source="", given=None, versions=None, history=None):
    plugin, step = plugin_kit.find(plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)[0], pid, sid)
    params = plugin_kit.clean(step, given)
    d = take_dir(name)
    files_in = {}
    for fp in step["params"]:                          # HERESY 1557: a file field made a path now: a wrong one said before the queue
        if fp["type"] == "file":
            files_in[fp["key"]] = file_param(name, params.get(fp["key"]), fp["label"])
    if step["input"] == "stems":                     # HERESY 1464: a set of stems, its folder with its manifest
        sd = (d / source).resolve() if source else None
        man = sd / "manifest.json" if sd else None
        if not man or d.resolve() not in sd.parents or not man.is_file() or json.load(open(man, encoding="utf-8")).get("kind") != "stems":
            raise ValueError(f"{step['label']} works on a set of stems: split the take into stems, then pick the set")
        audio = sd
    else:
        audio, _tag = source_of(name, source)
    if not audio:
        raise FileNotFoundError(f"{name} has no audio")
    did = f"plugin-{pid}-{sid}-" + time.strftime("%Y%m%d-%H%M%S")
    key = f"plugin:{name}:{did}"
    job = {"status": "queued", "started": time.time(), "kind": "plugin", "id": did, "plugin": pid, "step": sid, "label": step["label"],
           "rate": step.get("rate"), "builtin": plugin.get("builtin", False)}   # HERESY 1549: a step's own pace (seconds of work a second of audio), for its progress
    with jobs_lock:
        jobs[key] = job

    def run(env=None):
        job["status"] = "running"
        tmp = d / "derived" / (did + ".part")
        tmp.mkdir(parents=True, exist_ok=True)
        pfile = tmp / ".params.json"
        told = dict(params)
        for k, (fpath, fname) in files_in.items():     # HERESY 1557
            told[k], told[k + "_name"] = str(fpath), fname
        if step["input"] == "stems" and versions:      # HERESY 1553: the set's stems as the chain left them, stem → file
            told["_versions"] = {k: str((d / v).resolve()) for k, v in versions.items() if (d / v).resolve().is_file() and d.resolve() in (d / v).resolve().parents}
            told["_history"] = {k: [str((d / v).resolve()) for v in vs if d.resolve() in (d / v).resolve().parents] for k, vs in (history or {}).items()}
        json.dump(told, open(pfile, "w", encoding="utf-8"))
        p = subprocess.run(plugin_kit.command(plugin, step, audio, tmp, pfile, LAB_PY), cwd=plugin["folder"], env=env,
                           capture_output=True, text=True, timeout=4 * 3600)
        if p.returncode != 0:
            raise RuntimeError(step["label"] + " failed: " + (p.stderr.strip().splitlines() or ["no output"])[-1][-300:])
        r = plugin_kit.result(p.stdout)
        pfile.unlink()
        return tmp, r

    def work():
        try:
            if step["gpu"]:                              # HERESY 1465: as the lab's own GPU jobs, never on the studio's card
                with turn(job):
                    job["status"] = "running"
                    gpu, _free = free_gpu(step["need_mb"], why=step["label"])
                    job["gpu"] = gpu
                    tmp, r = run(dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID"))
            elif step.get("hardware"):                # HERESY 1572: gear outside the machine, in real time: not the CPU's turn (its own lock queues the passes)
                tmp, r = run()
            else:
                with cpu:
                    tmp, r = run()
            for f in r["files"]:
                if not (tmp / f["file"]).is_file():
                    raise RuntimeError(f"{f['file']} is not where {step['label']} said")
            manifest = {"id": did, "kind": "plugin", "plugin": pid, "plugin_name": plugin["name"], "step": sid, "label": step["label"],
                        "builtin": plugin.get("builtin", False),   # HERESY 1553: the studio's own step, its name translated
                        "parent": name, "source": source or "the take", "params": params, "measure": r["measure"],
                        "summary": r.get("summary", ""),   # HERESY 1484: the step's own line
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


# HERESY 1547 (Viktor 17.10.2026: «Вот цифровой шлюз в паблик, и обогати его по максимуму»): the Digital Gateway, a branch
# of the tree like Debuzz's; its settings checked before it is queued (a typo said at once, not after the wait)
def gate_async(name, source="", params=None):
    import digital_gate
    p = digital_gate.settings(params or {})
    d = take_dir(name)
    audio, _tag = source_of(name, source)
    if not audio:
        raise FileNotFoundError(f"{name} has no audio")
    try:
        import soundfile as _sf
        secs = float(_sf.info(str(audio)).duration)
    except Exception:
        secs = 0.0
    did = f"gate-{p['character']}-" + time.strftime("%Y%m%d-%H%M%S")
    key = f"gate:{name}:{did}"
    job = {"status": "queued", "started": time.time(), "kind": "gate", "id": did, "seconds": round(secs, 2),
           "expect": round(10 + 0.13 * secs * p["oversample"] / 4, 1)}   # what a 3090's host took: 45 s for 6:37 at 4×
    with jobs_lock:
        jobs[key] = job

    def work():
        try:
            with cpu:
                job["status"] = "running"
                job["since"] = time.time()
                tmp = d / "derived" / (did + ".part")
                tmp.mkdir(parents=True, exist_ok=True)
                pf = tmp / "params.json"
                json.dump(dict(params or {}), open(pf, "w", encoding="utf-8"))
                r = subprocess.run([str(LAB_PY), str(HERE / "digital_gate.py"), str(audio), str(tmp / "gate.flac"), str(pf)],
                                   capture_output=True, text=True, timeout=7200)
                if r.returncode != 0:
                    raise RuntimeError("the gateway failed: " + (r.stderr.strip().splitlines() or ["no output"])[-1][-300:])
                rep = json.loads(r.stdout.strip().splitlines()[-1])
                pf.unlink()
            s = rep["settings"]
            manifest = {"id": did, "kind": "gate", "parent": name, "source": source or "the take", "character": rep["character"],
                        "settings": s, "measure": rep,
                        "files": [{"name": f"{rep['character']} {s['drive_db']:g} dB", "file": "gate.flac", "path": f"derived/{did}/gate.flac",
                                   "seconds": rep["seconds"]}],
                        "took": rep.get("took"), "created": time.strftime("%Y-%m-%d %H:%M")}
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
            with whisper_turn(job, 4500) as wt:          # HERESY 1376: Whisper's own turn
                job["status"] = "running"
                try:
                    gpu = wt.gpu if wt.gpu is not None else free_gpu(4500)[0]
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
        steps = chain_plan.pipeline(spec, plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)[0]) if spec.get("pipeline") else chain_plan.steps(spec)   # HERESY 1508; 1553: a pipeline
        for st in steps:
            st["status"] = "waiting"
        job = {"status": "running", "started": time.time(), "kind": "chain", "steps": steps, "final": "", "until": spec.get("until") or ""}
        CHAINS[name] = job

    def work():
        src, stems, st = "", "", None
        versions, flow, history = {}, "file", {}         # HERESY 1553: a set's versions made on the way (and each stem's way); what the last step made
        try:
            for st in steps:
                st["status"] = "running"
                job["current"] = st["step"]
                k = st["step"]
                if k == "gate":                         # HERESY 1553: the Digital Gateway on the file before
                    r = gate_async(name, src, st.get("params") or {})
                    _follow(r, f"gate:{name}:{r['id']}")
                    src, flow = _first_file(d, r["id"]), "file"
                    job["final"] = src
                    st["file"] = src
                    st["status"] = "done"
                    continue
                if k == "daw":                          # HERESY 1553: the set mixed as the DAW's value says, its versions as made
                    if not stems:
                        raise RuntimeError("the DAW mixes a set of stems: put Stems before it")
                    r = daw_async(name, stems, st.get("mix") or {"schema": daw_mix.SCHEMA, "strips": {}}, dict(st.get("versions") or {}, **versions), False)   # 1561: the DAW's own, then the chain's
                    _follow(r, f"daw:{name}:{r['id']}")
                    src, flow = _first_file(d, r["id"]), "file"
                    job["final"] = src
                    st["file"] = src
                    st["status"] = "done"
                    continue
                if k == "plugin":                       # HERESY 1553: a built-in step or the user's, on a file or on the set
                    _p, sp = plugin_kit.find(plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)[0], st["plugin"], st["sid"])
                    on = stems if sp["input"] == "stems" else src
                    if sp["input"] == "stems" and not stems:
                        raise RuntimeError(sp["label"] + " works on a set of stems: put Stems before it")
                    stem = st.get("stem") or ""
                    if stem:                            # one stem of the set: its last version in, the stem's new version out
                        smf = [x for x in json.load(open(d / stems / "manifest.json", encoding="utf-8")).get("files", []) if x["name"] == stem]
                        if not smf:
                            raise RuntimeError(f"the set has no stem {stem}: split it as a profile of this step asks")
                        on = versions.get(stem) or f"{stems}/{smf[0]['file']}"
                    r = plugin_async(name, st["plugin"], st["sid"], on, st.get("params") or {}, dict(versions), history)
                    _follow(r, f"plugin:{name}:{r['id']}")
                    man = json.load(open(d / "derived" / r["id"] / "manifest.json", encoding="utf-8"))
                    made = [f for f in man.get("files", []) if f.get("kind") not in ("text", "image")]
                    if made and stem:
                        versions[stem] = made[0]["path"]
                        history.setdefault(stem, []).append(made[0]["path"])
                        st["file"] = made[0]["path"]
                    elif made and all(f.get("source") for f in made):   # versions of the set's stems
                        for f in made:
                            stem = next((x["name"] for x in json.load(open(d / stems / "manifest.json", encoding="utf-8")).get("files", [])
                                         if f"{stems}/{x['file']}" == f["source"]), None)
                            if stem:
                                versions[stem] = f["path"]
                                history.setdefault(stem, []).append(f["path"])
                        st["file"] = "derived/" + r["id"]
                    elif made:
                        src, flow = made[0]["path"], "file"
                        job["final"] = src
                        st["file"] = src
                    st["status"] = "done"
                    continue
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
                elif k == "stems" and st.get("set"):     # HERESY 1553: a set the take has, as it is
                    sm = d / st["set"] / "manifest.json"
                    if not sm.is_file() or json.load(open(sm, encoding="utf-8")).get("kind") != "stems":
                        raise RuntimeError(f"{st['set']} is not a set of stems of this take")
                    stems = st["set"]
                    st["file"] = stems
                    versions, flow, history = {}, "stems", {}
                elif k == "stems":                      # from the file before, the take when nothing came before
                    r = stems_async(name, st["mode"], src)
                    _follow(r, f"stems:{name}:{st['mode']}" + (f":{src}" if src else ""))
                    stems = "derived/" + r["id"]
                    st["file"] = stems
                    versions, flow, history = {}, "stems", {}
                elif k == "remaster":
                    on_stems = bool(stems) and (flow == "stems" or not spec.get("pipeline"))   # HERESY 1553: after a mix, the mix
                    cfg = dict(st["settings"], source=stems if on_stems else src)
                    if on_stems and versions:
                        cfg["versions"] = dict(versions)
                    if not on_stems:                    # a single file has no voice of its own to de-ess
                        cfg["deess"] = False
                    r = remaster_async(name, json.dumps(cfg))
                    _follow(r, f"remaster:{name}:{r['id']}")
                    src = _first_file(d, r["id"])
                    job["final"] = src
                    flow = "file"
                elif k == "inspect":
                    _follow(inspect_async(name, src), "inspect:" + name + source_of(name, src)[1])
                elif k == "spectrum":
                    _follow(spectrum_async(name, src), "spectrum:" + name + source_of(name, src)[1])
                elif k == "gloss":                      # the words are the take's: heard on the take itself
                    _follow(gloss_async(name), name)
                st["status"] = "done"
                if k in ("debuzz", "upscale", "remaster"):
                    st["file"] = src
                    flow = "file"
            job.update(status="done", ended=time.time(), current="")
        except Exception as e:                          # said on the step that failed; what was made stays
            if st is not None:
                st.update(status="failed", error=str(e))
            job.update(status="failed", error=f"{st['step'] if st else 'chain'}: {e}", ended=time.time())
    threading.Thread(target=work, daemon=True).start()
    return dict(job, name=name)


# HERESY 1562: one chain on many takes, one after another; the take in hand finishes when stopped, the rest are skipped
BATCH = {"status": "none"}
BATCH_LOCK = threading.Lock()
MAX_BATCH = 500


def batch_async(spec):
    names = list(dict.fromkeys(str(n) for n in (spec.get("names") or []) if isinstance(n, str) and n))[:MAX_BATCH]
    if not names:
        raise ValueError("no takes to refine")
    for n in names:
        if not take_dir(n).is_dir():
            raise ValueError(f"{n} is not a take here")
    one = {k: v for k, v in spec.items() if k not in ("names", "name")}
    if one.get("pipeline"):                             # the chain checked once, before the first take
        chain_plan.pipeline(one, plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)[0])
    else:
        chain_plan.steps(one)
    with BATCH_LOCK:
        if BATCH.get("status") == "running":
            return dict(BATCH)
        BATCH.clear()
        BATCH.update(kind="batch", id="batch-" + time.strftime("%Y%m%d-%H%M%S"), status="running", started=time.time(), stop=False,
                     profile=str(spec.get("profile") or ""), items=[{"name": n, "status": "waiting"} for n in names])

    def work():
        for it in BATCH["items"]:
            if BATCH.get("stop"):
                it["status"] = "skipped"
                continue
            it.update(status="running", started=time.time())
            try:
                chain_async(it["name"], dict(one, name=it["name"]))
                while True:
                    j = CHAINS.get(it["name"]) or {}
                    if j.get("status") in ("done", "failed"):
                        break
                    time.sleep(2)
                it.update(status=j["status"], final=j.get("final", ""), error=j.get("error", ""))
            except Exception as e:                      # said on its take; the rest go on
                it.update(status="failed", error=str(e))
            it["ended"] = time.time()
        BATCH.update(status="stopped" if BATCH.get("stop") else "done", ended=time.time())
    threading.Thread(target=work, daemon=True).start()
    return dict(BATCH)


# HERESY 1120: artwork for a take (art_job.py, Viktor 02.10.2026: «просто иконка в плеере, в карточке и в mp3»): a
# small language model writes a picture prompt from the take's style and words, an SDXL finetune draws it. One at a
# time with the other heavy jobs, on a card the guard gives (the two models one after the other; measured 02.10.2026:
# 14.2 GB reserved at the peak, SDXL at 1024 px and its decoder).
ART_NEED_MB = 15000
# HERESY 1167 (Viktor 05.10.2026, the A/B: «Muse - отличный файнтюн»; «Для карт ниже 24GB VRAM… оставим SDXL»; «Изначальным
# выставь Q4»): the painters, each its room on a card at the peak with the prompter before it (RTX 3090, 05.10.2026: Krea 2
# Muse Q4 11.6 GB, Q8 17.4 GB; SDXL 14.2 GB) and its Python (Krea paints in .venv-art: transformers 5, diffusers 0.40)
# HERESY 1297: measured again on GPU2 10.10.2026, the prompter (Qwen3-4B) before the painter, at 1024 px: Krea 2 Muse Q4 12.6 GB
# (42 s), SDXL 14.2 GB (17 s); Q8 17.4 GB (05.10). A margin of about half a gigabyte: a 16 GB card (15 GB left by a desktop) takes Q4
ART_NEED = {}                                       # HERESY 1405: SDXL gone; 1428: Krea 2 gone (the Qwen painters below)
# HERESY 1405: a card too small for the painter whole: its blocks stream from RAM (artist.STREAM_NEED, with Krea's encoder and the prompt
# writer moving to the CPU when the card has no room for them), a little room over the streamed peak
ART_STREAM_NEED = dict(artist.STREAM_NEED)          # HERESY 1428: the Qwen painters' streamed peaks (artist.py)
ART_PY = Path(os.environ.get("LAB_ART_PY", HERE.parent / ".venv-art/bin/python"))


ART_NEED.update({k: v[1] for k, v in artist.QWEN.items()})   # HERESY 1338: the Qwen painters paint a take's artwork too (artist.py's peaks)


def art_here(asked):
    """HERESY 1338: the painter asked for as it can paint here ("" when it cannot): a key of ART_NEED whose files are here, a
    fine-tune of Qwen-Image 2512 as «qwen2512-fp8:FILE»."""
    k, _, model = str(asked or "").strip().partition(":")
    k = k.lower()
    if k not in ART_NEED:
        return ""
    if k.startswith("qwen"):
        if not artist.qwen_ready(k) or (model not in artist.qwen_models() if k == "qwen2512-fp8" else bool(model)):
            return ""
        return k + (":" + model if model else "")
    return ""


def art_painter(asked=None):
    """HERESY 1167: the painter for an artwork: the one asked for, else the user's setting (yue2.artPainter), else by the
    cards: Krea 2 Muse at Q4 (1405: streamed below 16 GB, SDXL gone); Krea only where its files and environment are. HERESY 1338: a Qwen
    painter as well (a fine-tune as «qwen2512-fp8:FILE»); one whose files are not here gives way to the cards' choice."""
    p = art_here(asked)
    if not p:
        try:
            p = art_here(json.load(open(KIT / "user/settings.json", encoding="utf-8")).get("keys", {}).get("yue2.artPainter"))
        except (OSError, ValueError, AttributeError):
            p = ""
    if p:
        return p
    return art_by_cards()


def art_by_cards():
    """HERESY 1423 (Viktor 13.10.2026: «ставь на обложки 2512… для 24GB+ имеем 2512 а для менее жирных оставляем Krea 2 Muse?»): the
    painter by the cards the lab's jobs may take: Qwen-Image 2512 where one holds it whole (Q6 from 20 GB, Q4 from 15.5 GB: it follows
    the prompt best and letters a title), else Krea 2 Muse Q4 (HERESY 1405: whole where it fits, streamed from RAM below); "" when
    neither's files are here. Measured on an RTX 3090 (13.10.2026, the prompt writer and the critic included): Qwen Q6 131 s, Q4 125 s,
    Krea Q4 65 s a cover: a Qwen cover takes twice Krea's time, and Q4 is no quicker than Q6 (the painting is compute, not memory)."""
    try:
        cards = training.gpus()
        roles = gpu_roles.load(KIT, cards)
        lim = {int(k): int(v) for k, v in (roles.get("limits") or {}).items()}
        mine = [c for c in cards if c["index"] in (roles.get("jobs") or [c["index"]])]
        room = max((min(c.get("total_mb", 0), lim.get(c["index"], 10 ** 9)) for c in mine), default=0)
    except Exception:
        room = 0
    for k in ("qwen2512-q6", "qwen2512-q4"):
        if room >= ART_NEED.get(k, 10 ** 9) and art_here(k):
            return k
    return art_here("qwen2512-q4") or ""               # HERESY 1428: Krea 2 gone; a smaller card streams Q4 from RAM (art_async)


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
            if kind in ("stems", "remaster", "upscale", "debuzz", "gate") and v.get("status") in ("queued", "running"):   # 1547
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


def art_refusal(painter, table=None, where="choose it in Engine → Artwork"):
    """HERESY 1297 (Viktor 10.10.2026: «сообщение о том, что модель выбранная не потянет на этом железе, не видно»): why no card
    here can hold this painter at all (its whole memory, or its VRAM limit from Engine → GPUs), with the numbers and the painter
    that would fit; "" when one can, or when the cards cannot be read (the guard then says why, as before). table: the painters'
    rooms in MiB (the take's artwork: ART_NEED, the prompt writer before the painter; the Artist room: its own); where: how the
    painter that fits is chosen there."""
    table = table or ART_NEED
    cards = training.gpus()
    if not isinstance(cards, list) or not cards or painter not in table:
        return ""
    lim = {int(k): int(v) for k, v in (gpu_roles.load(KIT, cards).get("limits") or {}).items()}
    room = max(min(c.get("total_mb", 0), lim.get(c["index"], 10 ** 9)) for c in cards)
    need = table[painter]
    if room >= need:
        return ""
    if table is ART_NEED and ART_STREAM_NEED.get(painter, 10 ** 9) <= room:   # HERESY 1405: it streams from RAM there
        return ""
    fits = [p for p in ("qwen2512-q4",) if p != painter and p in table and (table[p] <= room or ART_STREAM_NEED.get(p, 10 ** 9) <= room) and art_here(p)]
    names = {"qwen2512-q4": "Qwen-Image 2512 Q4",   # 1338; 1428: Krea 2 gone
             "qwen2512-q6": "Qwen-Image 2512 Q6", "qwen2512-fp8": "Qwen-Image 2512 fp8", "qwen21": "Qwen-Image 2.1", "qwen21-fp8": "Qwen-Image 2.1 fp8"}
    return (f"{names.get(painter, painter)} needs about {need / 1024:.1f} GB of VRAM (its peak with a margin), and the biggest card here "
            f"has {room / 1024:.1f} GB" + (" under its limit (Engine → GPUs)" if lim else "") + ": " +
            (f"{names[fits[0]]} fits: {where}" if fits else
             "no painter fits on this machine yet: Qwen-Image 2512 Q4 wants a card of 5 GB, its blocks streamed from RAM (and about 31 GB of RAM)"))


def art_async(name, again=False, seed=None, painter=None):
    d = take_dir(name)
    key = f"art:{name}"
    painter = art_painter(painter)                   # HERESY 1167; 1338: a fine-tune of Qwen as «qwen2512-fp8:FILE»
    if not painter:                                  # HERESY 1428: no Qwen painter's files here
        raise ValueError("no painter for the artwork here: Qwen-Image 2512 goes into artwork/ (Engine → Models and LoRAs → Qwen painters)")
    need = ART_NEED[painter.partition(":")[0]]
    stream = False                                   # HERESY 1405: no card here has the room whole: its blocks stream from RAM
    try:
        cards = training.gpus()
        roles = gpu_roles.load(KIT, cards)
        lim = {int(k): int(v) for k, v in (roles.get("limits") or {}).items()}
        mine = [c for c in cards if c["index"] in (roles.get("jobs") or [c["index"]])]   # the cards the lab's jobs may take
        room = max((min(c.get("total_mb", 0), lim.get(c["index"], 10 ** 9)) for c in mine), default=0)
        if room < need and ART_STREAM_NEED.get(painter.partition(":")[0], 10 ** 9) <= room:
            need, stream = ART_STREAM_NEED[painter.partition(":")[0]], True
    except Exception as e:                           # HERESY 1430: the cards unread: asked as a painter whole, and said
        print(f"[lab] artwork for {name}: the cards could not be read ({e}); asked as a painter whole", file=sys.stderr, flush=True)
    live = jobs.get(key)                             # HERESY 1297: refused at once, and only asked for a new job
    refuse = "" if live and live.get("status") in ("queued", "running") else art_refusal(painter.partition(":")[0])
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
        if refuse:                                   # HERESY 1297: rather than three hours in the queue
            act_say(f"{ACT_SAY['art']} · {name} · {refuse}")
            raise ValueError(refuse)
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
                    env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID", ART_PAINTER=painter.partition(":")[0],
                               ART_MODEL=painter.partition(":")[2], ART_STREAM="1" if stream else "")   # HERESY 1338; 1405
                    tmp = d / "artwork.part.jpg"
                    py = ART_PY                              # HERESY 1405: SDXL (the lab's own Python) gone
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


def art_to_namesakes(name, names, replace):
    """HERESY 1425 (Viktor 13.10.2026: «В Библиотекаре на треке с обложкой можно опцию "Скопировать обложку в одноимённые семплы"?»): the
    take's cover given to the takes the page found of its name; one with a cover of its own skipped, or (replace) its own taken off and kept
    beside it as «Remove current artwork» keeps it; never a frozen one (its workspace frozen), nor one whose picture is being drawn."""
    src = take_dir(name)
    if not (src / "artwork.jpg").is_file():
        raise ValueError("this take has no cover")
    frozen = collection.frozen_takes(collection.load(config_dir())) or set()
    done, skipped = [], []
    for n in [str(x) for x in names or []][:200]:
        d = take_dir(n)
        if n == name or not d.is_dir() or n in frozen:
            continue
        if (d / "artwork.jpg").is_file():
            if not replace or art_remove(n).get("error"):
                skipped.append(n)
                continue
        if art_copy(src, d, "copied from its namesake"):
            for mp3 in d.glob("audio-*k.mp3"):                 # the MP3s made with no cover, or the old one, made again
                mp3.unlink(missing_ok=True)
            ART_SEEN.pop(n, None)
            done.append(n)
    act_say(f"the cover of {name} copied to {len(done)} of its namesakes" + (f", {len(skipped)} kept their own" if skipped else ""))
    return {"copied": done, "skipped": skipped}


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
           "debuzz": "debuzz", "gate": "digital gateway", "timing": "lyrics timing (Whisper)", "textend": "lyrics check (Whisper)", "spectrum": "spectrum",
           "inspect": "inspection", "train": "LoRA training", "listen": "listener (Omni)", "artist": "the Artist"}


def act_say(text):
    with ACT_LOCK:
        ACT["seq"] += 1
        ACT["lines"].append([ACT["seq"], time.strftime("%H:%M:%S") + " " + text])
    print("[lab] " + text, file=sys.stderr, flush=True)


# HERESY 1550: a file's loudness for an honest comparison, kept per file and its time
LOUD = {}
LOUD_LOCK = threading.Lock()


def loudness_of(name, path=""):
    a, _tag = source_of(name, path)
    if not a:
        raise FileNotFoundError(f"{name} has no audio")
    key = (str(a), a.stat().st_mtime_ns)
    with LOUD_LOCK:
        if key in LOUD:
            return LOUD[key]
    import soundfile as _sf
    from plenio_core.audio.loudness import measure as _measure
    x, sr = _sf.read(str(a), dtype="float64", always_2d=True)
    m = _measure(x.T, sr, with_true_peak=False)       # the loudness is what an A/B needs; the true peak is the slow part
    r = {"name": name, "path": path, "lufs": None if m.integrated_lufs is None else round(m.integrated_lufs, 2),
         "sample_peak_dbfs": None if m.sample_peak_dbfs is None else round(m.sample_peak_dbfs, 2), "seconds": round(len(x) / sr, 2)}
    with LOUD_LOCK:
        LOUD[key] = r
    return r


# HERESY 1549: how long a job of the Refiner takes, seconds of work a second of the take, measured on Forge (the page's RATE too)
PACE = {"debuzz": 0.18, "remaster": 0.12, "upscale": 1.8, "stems": 0.9, "daw": 0.05, "gate": 0.12, "textend": 0.15, "timing": 0.15,
        "inspect": 0.05, "spectrum": 0.02}
TAKE_SECS = {}


def take_secs(name):
    """The take's length, read once (soundfile's header), 0 when it cannot be read."""
    if name not in TAKE_SECS:
        try:
            import soundfile as _sf
            a, _t = source_of(name, "")
            TAKE_SECS[name] = float(_sf.info(str(a)).duration) if a else 0.0
        except Exception:
            TAKE_SECS[name] = 0.0
    return TAKE_SECS[name]


def act_expect(kind, name, v):
    """What a job expects to take, seconds; None when nothing says."""
    if v.get("expect"):
        return float(v["expect"])
    secs = float(v.get("seconds") or 0) or take_secs(name)
    if not secs:
        return None
    if kind == "plugin" and v.get("rate"):
        return 5 + float(v["rate"]) * secs
    pace = PACE.get(kind)
    if not pace:
        return None
    if kind == "stems":
        pace *= {"four": 1.8, "six": 1.1, "eight": 2.1}.get(v.get("mode"), 1)
    if kind == "upscale":
        pace *= int(v.get("variants") or 1)
    return 5 + pace * secs


def act_now():
    """What runs now: the lab's jobs, the training runs (with their step), the listener; HERESY 1549: each with how far it is."""
    out = []
    now = time.time()
    with jobs_lock:
        for k, v in jobs.items():
            kind, _, name = k.partition(":")
            if v.get("status") in ("queued", "running"):
                take = name.split(":")[0]
                if v.get("status") == "running" and not v.get("since"):
                    v["since"] = now                          # the watch looks every second: when it was first seen running
                since = v.get("since") or v.get("started")
                r = {"key": k, "what": ACT_SAY.get(kind, kind), "name": take, "status": v.get("status"), "gpu": v.get("gpu"),
                     "since": v.get("started"), "kind": kind, "label": v.get("label")}
                if v.get("status") == "running" and since:
                    r["elapsed"] = round(now - since, 1)
                    ex = act_expect(kind, take, v)
                    if ex:
                        r["expect"] = round(ex, 1)
                out.append(r)
    for name, run in list(training.RUNS.items()):
        if run.get("status") in ("running", "stopping"):
            held = training.run_cards(training._meta(training.paths(KIT)["runs"] / name))   # HERESY 1631: "1+2" for a run on two
            gpu = "+".join(str(c) for c in held) if len(held) > 1 else (held[0] if held else None)
            r = {"key": "train:" + name, "what": ACT_SAY["train"], "name": name, "status": "running", "gpu": gpu,
                 "step": run.get("step"), "steps": run.get("steps")}
            m = training.ETA_RE.search((run.get("tail") or [""])[-1])   # HERESY 1617: the time it has run and has left, off the trainer's line
            if m:
                r["elapsed"], r["eta"] = training._hms(m.group(1)), training._hms(m.group(2))
            out.append(r)
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
                        if kind in ("stems", "remaster", "upscale", "debuzz", "gate"):   # 1547
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
            "regenerating": sorted({str(v.get("old")) for v in list(REGEN_LIVE.values()) if v.get("old")}),
            "painters": artist.kept_painters()}                  # HERESY 1370: the Artist's painters kept between runs (the Bar's Unload)


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
        if not req.get("backbone") and meta.get("model"):   # HERESY 1767: the backbone it was sung on, not today's default
            req["backbone"] = meta["model"]
        # 1165: an A/B sample is a probe too; 1166: and a voice («💎 Voice Types», voice-sung|spoken-…), at 120 s with the rest
        if re.match(r"^(probe|style|ab|voice|keys)\d*-", str(req.get("title") or "")):   # 1767: keys, the Keys Probe
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
artist.setup(kit=KIT, jobs=jobs, lock=jobs_lock, wait_card=wait_card, turn=turn, free_gpu=free_gpu, say=act_say, more_gpus=more_gpus, job_cards=job_cards,
             take_dir=take_dir, pair=art_pair, copy=art_copy, painter=art_painter, py=ART_PY, refusal=art_refusal,
             outputs=OUTPUTS, frozen=lambda: collection.frozen_takes(collection.load(config_dir())),   # HERESY 1337: the art's trash
             art_remove=art_remove)                       # HERESY 1372: a cover taken off with its picture

# HERESY 1414: Replace a section reaches the engine through api, the takes' trash for its drafts, the collection for its places
section.setup(kit=KIT, outputs=OUTPUTS, engine=api._engine, say=act_say, config_dir=config_dir, collection=collection, py=LAB_PY,   # 1717: vocal_rest.py's
              frozen=lambda: collection.frozen_takes(collection.load(config_dir())),
              trash=lambda names: collection.trash_move(KIT, OUTPUTS, names, config_dir()))


def lab_busy():
    """HERESY 1261: the lab works on something: the card is held, or a job waits or runs."""
    with jobs_lock:
        return heavy.locked() or any(v.get("status") in ("queued", "running") for v in jobs.values())


# HERESY 1261: where the user's work lives; its record beside the page's keys in user/settings.json, under the same lock
places.setup(KIT, busy=lab_busy, settings_lock=SETTINGS_LOCK, settings_file=config_dir() / "settings.json",
             studio_port=os.environ.get("YUE2CPP_PORT", "7777"), say=lambda s: print(s, file=sys.stderr, flush=True))


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
            if url.path == "/lora/profile":                 # HERESY 1447: LoRA alchemy: each adapter by layer, the pairs, the budgets
                return self.send(200, lora_alchemy.report((q.get("ids") or "").split(",")))
            if url.path == "/health":
                with jobs_lock:
                    active = {k: v["status"] for k, v in jobs.items()}
                if weights.running():                       # HERESY 1289: a download under way is a job too (a restart cuts it)
                    active["weights"] = "running"
                for x in section.live():                    # HERESY 1790: a section, a line or a window sung anew (its own thread) too
                    active["section " + x["id"]] = x["status"]
                for mod, what in ((diamond, "diamond"), (starter, "starter")):   # HERESY 1790: and a 💎 fetch or a starter set's download
                    for k, v in list(mod.JOBS.items()):
                        if isinstance(v, dict) and v.get("status") in ("queued", "running"):
                            active[what + " " + k] = v["status"]
                return self.send(200, {"ok": True, "busy": heavy.locked(), "jobs": active, "whisper": WHISPER_DIR.is_dir()})
            if url.path == "/gloss":
                if q.get("cached") == "1":
                    return self.send(200, gloss(q.get("name", ""), cached_only=True, source=q.get("source", "")))
                r = gloss_async(q.get("name", ""), q.get("force") == "1", q.get("source", ""))
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/refined":                       # HERESY 1132: takes with something the Refiner made, the newest first
                return self.send(200, refined())
            if url.path == "/changes":                       # HERESY 1358: where the take's music changes (its own sound, kept beside it)
                with cpu:
                    return self.send(200, takechanges.changes(take_dir(q.get("name", ""))))
            if url.path == "/spectrogram":                   # HERESY 1358: a slice of the take's spectrogram, as a PNG
                f = takechanges.spectrogram_file(take_dir(q.get("name", "")), q.get("t0", "0"), q.get("t1", "10"), q.get("w", "320"), q.get("h", "80"),
                                                 CACHE / "spectrograms")
                return self.send_file(f, "image/png", cache="private, max-age=3600")
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
                if not re.fullmatch(r"[A-Za-z0-9_-]+\.(woff2|ttf)", name) or not font.is_file():   # HERESY 1426: Liberation Mono as TTF
                    return self.send(404, {"error": "no such font"})
                return self.send_file(font, "font/ttf" if name.endswith(".ttf") else "font/woff2", cache="public, max-age=31536000, immutable")
            if url.path.startswith("/sounds/"):              # HERESY 1586: the piano roll's instruments, in the studio itself
                name = url.path[len("/sounds/"):]
                snd = HERE / "sounds" / name
                if name == "vowels.json" and snd.is_file():   # HERESY 1624: the sung vowels' loops, read fresh
                    return self.send_file(snd, "application/json", cache="no-cache")
                if not re.fullmatch(r"[a-z]+-\d{2,3}\.mp3", name) or not snd.is_file():
                    return self.send(404, {"error": "no such sound"})
                return self.send_file(snd, "audio/mpeg", cache="public, max-age=31536000, immutable")
            if url.path == "/artist/runs":                   # HERESY 1255: the Artist room
                return self.send(200, artist.runs())
            if url.path == "/artist/file":
                p, ctype = artist.picture(q.get("id", ""), q.get("file", ""), q.get("trash") == "1")   # HERESY 1310: a trashed run's too
                return self.send_file(p, ctype)
            if url.path == "/artist/trashed":                # HERESY 1310: the Artist's trash, seen from the room
                return self.send(200, artist.trashed())
            if url.path == "/artist/upscalers":              # HERESY 1322: the upscalers here
                return self.send(200, artist.upscalers())
            if url.path == "/artist/asides":                 # HERESY 1321: the pictures put aside
                return self.send(200, artist.asides())
            if url.path == "/artist/bin":                    # HERESY 1337: the art's trash: runs, pictures put aside, covers taken off
                return self.send(200, artist.bin_list())
            if url.path == "/artist/bin-file":               # HERESY 1337: a cover taken off, seen in the trash
                return self.send_file(artist.bin_file(q.get("take", ""), q.get("stamp", "")), "image/jpeg", cache="private, max-age=600")
            if url.path == "/artist/painters":               # HERESY 1318: the painters as this machine has them
                return self.send(200, artist.painters())
            if url.path == "/artist/civitai-fetch":          # HERESY 1360: the fetch from Civitai under way, or the last one
                return self.send(200, civitai_fetch.state())
            if url.path == "/artist/loras":                  # HERESY 1316: the adapters, each family's, its folders the groups
                return self.send(200, artist_loras.scan(KIT, q.get("family") or None, lora_cache()))
            if url.path == "/artist/lora-info":              # HERESY 1353: an adapter for its Info window
                return self.send(200, artist_loras.details(KIT, q.get("id", ""), lora_cache()))
            if url.path == "/artist/lora-picture":           # HERESY 1316: the picture beside an adapter
                pic = artist_loras.picture(artist_loras.path_of(KIT, q.get("id", "")))
                if not pic:
                    return self.send(404, {"error": "no picture beside this adapter"})
                w = q.get("w", "")
                if w.isdigit() and 64 <= int(w) <= 1024:      # small for the grid, kept in the cache
                    return self.send_file(artist_loras.small(pic, int(w), CACHE / "lora-pictures"), "image/jpeg", cache="private, max-age=600")
                return self.send_file(pic, artist_loras.TYPES.get(pic.suffix.lower(), "image/jpeg"), cache="private, max-age=600")
            if url.path == "/artist/prompt":
                return self.send(200, artist.prompt_for(q.get("name", "")))
            if url.path == "/art/draw":
                seed = q.get("seed", "")
                r = art_async(q.get("name", ""), q.get("again") == "1", int(seed) if seed.isdigit() else None, q.get("painter"))
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/stems":
                r = stems_async(q.get("name", ""), q.get("mode", "four"), q.get("source", ""))
                return self.send(500 if r.get("status") == "failed" else 202 if r.get("status") else 200, r)
            if url.path == "/loudness":                      # HERESY 1550
                try:
                    return self.send(200, loudness_of(q.get("name", ""), q.get("path", "")))
                except (ValueError, FileNotFoundError) as e:
                    return self.send(404, {"error": str(e)})
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
            if url.path == "/loop":                         # HERESY 1325: a loop cut from a take's own WAV, seamless
                d = take_dir(q.get("name", ""))
                src = d / "audio.wav"
                if not src.is_file():
                    raise FileNotFoundError("this take has no audio.wav")
                start, secs = float(q.get("start", "")), float(q.get("seconds", ""))
                box = CACHE / "loops"
                box.mkdir(parents=True, exist_ok=True)
                out = box / f"{d.name}-{start:.4f}-{secs:.4f}.wav"
                if not out.is_file():
                    takeloop.cut(src, start, secs, out)
                    for old in sorted(box.glob("*.wav"), key=lambda f: f.stat().st_mtime)[:-40]:
                        old.unlink(missing_ok=True)      # what the cache made, never a take's own
                return self.send_file(out, "audio/wav")
            if url.path == "/timing/recording":             # HERESY 1719: a recording's lyrics timing, as its job stands
                r = timing_recording_job(q.get("id", ""))
                return self.send(500 if r.get("status") == "failed" else 200 if r.get("status") == "done" else 202, r)
            if url.path == "/timing":                       # HERESY 1056: karaoke timing, as JSON, LRC or SRT
                r = timing_async(q.get("name", ""), q.get("force") == "1", q.get("cached") == "1")
                fmt = q.get("fmt", "json")
                if fmt in ("lrc", "lrcw", "srt") and "rows" in r:   # HERESY 1646: lrcw, every word timed
                    title = json.load(open(take_dir(q["name"]) / "meta.json", encoding="utf-8")).get("title", "")
                    text = timing.lrc(r["rows"], title) if fmt == "lrc" else timing.lrc_words(r["rows"], title) if fmt == "lrcw" else timing.srt(r["rows"])
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
            if url.path == "/machine":                       # HERESY 1304: the first start's scan
                return self.send(200, machine_state())
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
            if url.path == "/chain/batch":                  # HERESY 1562
                return self.send(200, dict(BATCH))
            if url.path == "/chain":                        # HERESY 1054: the chain's state for a take
                job = CHAINS.get(q.get("name", ""))
                return self.send(200, dict(job, name=q.get("name", "")) if job else {"status": "none", "name": q.get("name", "")})
            if url.path == "/derived":
                return self.send(200, derived_list(q.get("name", "")))
            if url.path == "/daw/set":                      # HERESY 1470: the Refiner's DAW
                return self.send(200, daw_info(q.get("name", ""), q.get("set", ""))[1])
            if url.path == "/refiner/profiles":         # HERESY 1515: the Refiner's setups by name
                plugs = plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)[0]
                return self.send(200, dict(refiner_profiles.load(config_dir()), pipelines=refiner_profiles.pipelines(HERE, plugs)))   # HERESY 1553
            if url.path == "/audio/devices":            # HERESY 1512: the machine's audio interfaces and the gateway's choice
                return self.send(200, audio_io.devices(user_dir=config_dir()))
            if url.path == "/models/merges":           # HERESY 1494: what each merged backbone carries, from its file
                return self.send(200, merges.merges(KIT))
            if url.path == "/peaks":                    # HERESY 1487
                return self.send(200, file_peaks(q.get("name", ""), q.get("path", ""), int(q.get("n", "400"))))
            if url.path == "/daw/peaks":
                d, info = daw_info(q.get("name", ""), q.get("set", ""))
                k = (q.get("name", ""), info["set"], q.get("strip", ""), q.get("path", ""), int(q.get("n", "1200")))
                if k not in DAW_PEAKS:
                    DAW_PEAKS[k] = daw_kit.peaks(d, info, q.get("strip", ""), q.get("path", ""), int(q.get("n", "1200")))
                    while len(DAW_PEAKS) > 400:
                        DAW_PEAKS.pop(next(iter(DAW_PEAKS)))
                return self.send(200, {"peaks": DAW_PEAKS[k], "seconds": info["seconds"]})
            if url.path == "/c2pa":                     # HERESY 1489
                return self.send(200, c2pa_sign.status(config_dir()))
            if url.path == "/c2pa/file":
                data, head, said = c2pa_file(q)
                self.send_response(200)
                for k, v in head.items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-C2PA", said)
                self.end_headers()
                self.wfile.write(data)
                return
            if url.path == "/daw/mixes":                    # HERESY 1533: the working mix and the named ones of a set
                d, info = daw_info(q.get("name", ""), q.get("set", ""))
                return self.send(200, daw_mixes.load(daw_kit._inside(d, info["set"])))
            if url.path == "/daw/ir":                       # HERESY 1531: the room's impulse, as the render convolves with it
                key = (q.get("preset", "room"), int(q.get("rate", "48000")))
                if key[1] not in (32000, 44100, 48000, 88200, 96000):
                    raise ValueError("rate is 32000, 44100, 48000, 88200 or 96000")
                if key not in DAW_IR:
                    DAW_IR[key] = daw_mix.ir_wav(key[1], key[0])
                data = DAW_IR[key]
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "max-age=86400")
                self.end_headers()
                self.wfile.write(data)
                return
            if url.path == "/daw/loudness":                 # HERESY 1755: the reference's loudness, block by block
                d, info = daw_info(q.get("name", ""), q.get("set", ""))
                src = daw_kit._inside(d, info["source"])
                key = (str(src), src.stat().st_mtime_ns)
                if key not in DAW_LOUD:
                    DAW_LOUD[key] = daw_kit.source_loudness(d, info)
                    while len(DAW_LOUD) > 16:
                        DAW_LOUD.pop(next(iter(DAW_LOUD)))
                return self.send(200, DAW_LOUD[key])
            if url.path == "/daw/chunk":
                d, info = daw_info(q.get("name", ""), q.get("set", ""))
                data = daw_kit.chunk(d, info, q.get("strip", ""), q.get("path", ""), float(q.get("start", "0")), float(q.get("seconds", "10")))
                self.send_response(200)
                self.send_header("Content-Type", "audio/flac")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
                return
            if url.path == "/plugins/midi":                 # HERESY 1589: a plugin's MIDI script, its text (the page runs it in a worker)
                plugs, _ = plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)
                hit = [m for p in plugs if p["id"] == q.get("plugin", "") for m in p.get("midi") or [] if m["id"] == q.get("id", "")]
                if not hit:
                    return self.send(404, {"error": "no such MIDI script"})
                data = Path(hit[0]["script"]).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if url.path == "/plugins":                      # HERESY 1460: the Refiner's steps of one's own
                plugs, broken = plugin_kit.load_all(PLUGINS, BUILTIN_STEPS)
                return self.send(200, {"plugins": plugin_kit.public(plugs), "errors": broken})
            if url.path == "/settings":
                return self.send(200, settings_get(q.get("scope", "")))
            if url.path == "/presets":
                return self.send(200, presets_get(q.get("scope", "")))
            if url.path == "/catalog":                      # HERESY 1041: the Collection
                return self.send(200, collection.catalog(OUTPUTS, config_dir()))
            if url.path == "/trash":
                return self.send(200, collection.trash_list(KIT))
            if url.path == "/section/live":              # HERESY 1414: the sections being replaced
                return self.send(200, {"live": section.live()})
            if url.path == "/section/job":               # HERESY 1425: one job as it stands, for the page to follow it to its takes
                st = section.job(q.get("id", ""))
                return self.send(200, st) if st else self.send(404, {"error": "no such job (ended more than ten minutes ago, or the lab restarted)"})
            if url.path == "/section/mark":              # HERESY 1414: what of a take was sung anew, for the player's mark
                return self.send(200, section.mark(q.get("name", "")) or {})
            if url.path == "/collection/diamonds":       # HERESY 1166: the 💎 workspaces on Hugging Face
                return self.send(200, diamond.listing(KIT, OUTPUTS, config_dir(), refresh=q.get("refresh") == "1"))
            if url.path == "/update":                     # HERESY 1169: this version, the last look at GitHub's releases
                return self.send(200, updates.status(KIT, config_dir()))
            if url.path == "/update/log":
                return self.send(200, updates.log_tail(KIT))
            if url.path == "/writer/versions":              # HERESY 1519: the titles, or one title's versions (?id= or ?title=)
                if q.get("id") or q.get("title"):
                    return self.send(200, creator_versions.get(KIT, q.get("id", ""), q.get("title", ""), q.get("scope", "")))
                return self.send(200, creator_versions.listing(KIT, q.get("scope", "")))
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
                r = spectrum_async(q.get("name", ""), q.get("source", ""), q.get("mode", "mono"))   # HERESY 1740: &mode=
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
                if url.path == "/artist/civitai-look":       # HERESY 1360: what a Civitai link names; nothing downloaded
                    return self.send(200, civitai_fetch.look(KIT, str(data.get("ref") or ""), str(data.get("key") or ""), lora_cache()))
                if url.path == "/artist/civitai-fetch":      # HERESY 1360: an adapter from Civitai on the user's word, with their own key
                    if data.get("cancel"):
                        return self.send(200, civitai_fetch.cancel())

                    def fetched(rel, row):                   # its hash into the lab's cache: the library knows it at once
                        with LORA_LOCK:
                            cache = lora_cache()
                            cache[rel] = row
                            lora_cache(cache)
                        act_say(f"the Artist · the adapter {Path(rel).stem} fetched from Civitai into {rel.split('/')[0]}")
                    return self.send(202, civitai_fetch.start(KIT, data, q.get("scope", ""), fetched))
                if url.path == "/artist/draw":
                    return self.send(202, artist.draw(data))
                if url.path == "/artist/cover":
                    return self.send(200, artist.cover(data))
                if url.path == "/artist/upscale":            # HERESY 1322: a picture upscaled, as a run of its own
                    return self.send(202, artist.upscale(data))
                if url.path == "/artist/aside":              # HERESY 1321: pictures put aside or brought back, one or many
                    return self.send(200, artist.aside(data))
                if url.path == "/artist/star":               # HERESY 1257
                    return self.send(200, artist.star(data))
                if url.path == "/artist/note":               # HERESY 1428: a picture's note of one's own
                    return self.send(200, artist.note(data))
                if url.path == "/artist/protect":            # HERESY 1367: pictures never to the trash, nor deleted for good
                    return self.send(200, artist.protect(data))
                if url.path == "/artist/unload":             # HERESY 1370: the painters kept between runs, let go
                    return self.send(200, artist.unload())
                if url.path == "/artist/trash":                # HERESY 1372: {id, covers}
                    return self.send(200, artist.trash_run(data))
                if url.path == "/artist/covers":             # HERESY 1372: the takes whose cover is one of these pictures
                    rid = str(data.get("id") or "")
                    items = data.get("items") or ([{"id": rid, "file": p.get("file")} for p in (artist.read(artist.run_dir(rid)) or {}).get("pictures") or [] if p.get("kept")] if rid else [])
                    return self.send(200, artist.covers_of(items))
                if url.path == "/artist/stop":               # HERESY 1270
                    return self.send(200, artist.stop(str(data.get("id") or "")))
                if url.path == "/artist/restore":
                    return self.send(200, artist.restore(str(data.get("id") or "")))
                if url.path == "/artist/bin":                # HERESY 1337: given back, or deleted for good, on the user's word
                    return self.send(200, artist.bin_act(data))
                if url.path == "/artist/lora-trash":         # HERESY 1353: an adapter into the art's trash, with what lies beside it
                    with LORA_LOCK:
                        r = artist_loras.trash(KIT, str(data.get("id") or ""))
                    act_say(f"the Artist · the adapter {Path(r['id']).stem} into the art's trash (Trash (Art) gives it back)")
                    return self.send(200, r)
                if url.path == "/artist/lora-civitai":       # HERESY 1316: an adapter looked up on Civitai by its SHA-256 alone
                    with LORA_LOCK:
                        cache = lora_cache()
                        try:
                            return self.send(200, artist_loras.civitai(KIT, str(data.get("id") or ""), cache))
                        finally:
                            lora_cache(cache)
            if url.path == "/jobs/cancel":                   # HERESY 1165: {key}: a waiting job off the queue
                return self.send(200, job_cancel(str(json.loads(body.decode("utf-8")).get("key") or "")))
            if url.path == "/take/edit":                     # HERESY 1356: {name, op: crop | remove | speed, spans, factor, abc, title}: a new take
                data = json.loads(body.decode("utf-8"))
                with cpu:
                    r = takeedit.make(OUTPUTS, str(data.get("name") or ""), data, take_dir)
                act_say(f"Edit · {r['title']} · {r['edited']['op']}: a new take of {r['seconds']:.0f} s")
                return self.send(200, r)
            if url.path == "/art/namesakes":                 # HERESY 1425: {name, to, replace}: a take's cover to its namesakes
                data = json.loads(body.decode("utf-8"))
                return self.send(200, art_to_namesakes(str(data.get("name") or ""), data.get("to") or [], bool(data.get("replace"))))
            if url.path == "/section/repeat":                # HERESY 1715: {name, a, b, lyrics, versions, section, abc}: a section sung once more
                data = json.loads(body.decode("utf-8"))
                return self.send(202, section.repeat(data.get("name"), data.get("a"), data.get("b"), data.get("lyrics"),
                                                     data.get("versions") or 2, data.get("section") or "", data.get("abc"),
                                                     data.get("gap") or 0, data.get("kind") or "repeat", data.get("bar")))   # HERESY 1717
            if url.path == "/timing/recording":             # HERESY 1719: {file, lyrics, audio}: the lyrics timed on a cover's source
                return self.send(202, timing_recording(json.loads(body.decode("utf-8"))))
            if url.path == "/section/window":                # HERESY 1757: {name, a, b, lyrics, versions, pre, post, loras}: a window anew, its own adapters
                data = json.loads(body.decode("utf-8"))
                return self.send(202, section.window(data.get("name"), data.get("a"), data.get("b"), data.get("lyrics"), data.get("versions") or 2,
                                                     data.get("pre", 2.0), data.get("post", 2.0), data.get("loras") or []))
            if url.path == "/section":                       # HERESY 1414: {name, a, b, lyrics, versions, section}: a section sung anew
                data = json.loads(body.decode("utf-8"))
                return self.send(202, section.start(data.get("name"), data.get("a"), data.get("b"), data.get("lyrics"),
                                                    data.get("versions") or 2, data.get("section") or "", data.get("parts")))
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
            if url.path == "/c2pa":                          # HERESY 1489: the switch, the author, one's own certificate
                return self.send(200, dict(c2pa_sign.save(config_dir(), json.loads(body.decode("utf-8"))), **c2pa_sign.status(config_dir())))
            if url.path in ("/collection", "/trash", "/export"):     # HERESY 1041
                data = json.loads(body.decode("utf-8"))
                if url.path == "/collection":
                    return self.send(200, collection.collection_post(config_dir(), OUTPUTS, data))
                if url.path == "/export":
                    return self.send(202, collection.export_start(KIT, OUTPUTS, [str(n) for n in data.get("names") or []],
                                                                  data.get("format", "flac"), bool(data.get("derived")), sign=c2pa_for))   # 1489
                op = data.get("op")
                if op == "move":
                    return self.send(200, collection.trash_move(KIT, OUTPUTS, [str(n) for n in data.get("names") or []], config_dir()))
                if op == "restore":
                    return self.send(200, collection.trash_restore(KIT, OUTPUTS, data.get("items") or []))
                if op == "empty":                      # the page asks first; items or everything
                    return self.send(200, collection.trash_empty(KIT, data.get("items"), config_dir=config_dir()))     # 1368: the protected stay
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
            if url.path == "/lora/delete":                  # HERESY 1496: adapter files out of loras/ for good, a dry run first
                data = json.loads(body.decode("utf-8"))
                return self.send(200, training.delete_loras(KIT, [str(x) for x in (data.get("ids") or [])], data.get("dry", True) is not False))
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
            if url.path in ("/train/prepare", "/train/run", "/train/stop", "/train/pause", "/train/resume", "/train/publish", "/train/listen", "/train/styles", "/train/pack"):     # HERESY 1063, 1067, 1078, 1626, 1659
                data = json.loads(body.decode("utf-8"))
                if url.path == "/train/pack":                # HERESY 1626: a prepared set packed into parquet (FLAC) or back; its state at GET /train/prepare
                    return self.send(202, training.pack(KIT, data))
                if url.path == "/train/listen":
                    return self.send(202, training.listen(KIT, data, free_gpu))
                if url.path == "/train/styles":
                    return self.send(200, training.apply_styles(KIT, data))
                if url.path == "/train/publish":
                    return self.send(200, training.publish(KIT, str(data.get("name", "")), str(data.get("file", ""))))
                if url.path == "/train/prepare":
                    return self.send(202, training.prepare(KIT, data))
                if url.path == "/train/run":
                    return self.send(202, training.train(KIT, data, free_gpu, more_gpus))   # HERESY 1631: and more cards
                if url.path == "/train/pause":               # HERESY 1659: a stop the run is called paused by
                    return self.send(200, training.stop(KIT, str(data.get("name", "")), pause=True))
                if url.path == "/train/resume":              # HERESY 1659: the paused run again, from its last save
                    return self.send(202, training.resume_run(KIT, str(data.get("name", "")), free_gpu, more_gpus))
                return self.send(200, training.stop(KIT, str(data.get("name", ""))))
            if url.path == "/chain/batch":                  # HERESY 1562: one chain on many takes
                return self.send(202, batch_async(json.loads(body.decode("utf-8"))))
            if url.path == "/chain/batch/stop":
                BATCH["stop"] = True
                return self.send(200, dict(BATCH))
            if url.path == "/chain":
                data = json.loads(body.decode("utf-8"))
                return self.send(202, chain_async(str(data.get("name", "")), data))
            if url.path == "/audio/gateway":                 # HERESY 1512: {out, in, rate}: the analog gateway's devices, kept in user/audio.json
                data = json.loads(body.decode("utf-8"))
                return self.send(200, {"gateway": audio_io.set_gateway(config_dir(), str(data.get("out") or ""), str(data.get("in") or ""), data.get("rate") or 0)})
            if url.path == "/refiner/profiles":              # HERESY 1515: {op: save|delete, name, setup}: the profiles back
                data = json.loads(body.decode("utf-8"))
                if data.get("op") == "delete":
                    return self.send(200, refiner_profiles.delete(config_dir(), data.get("name")))
                return self.send(200, refiner_profiles.save(config_dir(), data.get("name"), data.get("setup")))
            if url.path == "/audio/loop":                    # HERESY 1514: {out, in, rate, level}: a tone out and back, measured
                data = json.loads(body.decode("utf-8"))
                return self.send(200, audio_io.loop(str(data.get("out") or ""), str(data.get("in") or ""), int(data.get("rate") or 48000), float(data.get("level") or -20)))
            if url.path == "/audio/monitor":                 # HERESY 1548: {out, rate}: the monitor kept in user/audio.json
                data = json.loads(body.decode("utf-8"))
                return self.send(200, {"monitor": audio_io.set_monitor(config_dir(), str(data.get("out") or ""), data.get("rate") or 0)})
            if url.path == "/audio/monitor/tone":
                return self.send(200, audio_io.monitor_tone(config_dir()))
            if url.path == "/audio/monitor/stop":
                return self.send(200, audio_io.monitor_stop())
            if url.path == "/audio/monitor/play":            # {name, source, at}: the take, or a file of its tree
                data = json.loads(body.decode("utf-8"))
                path, _tag = source_of(str(data.get("name", "")), str(data.get("source", "") or ""))
                if not path:
                    return self.send(404, {"error": "no audio"})
                return self.send(200, audio_io.monitor_play(config_dir(), path, float(data.get("at") or 0), str(data.get("label") or "") or None))
            if url.path == "/audio/probe":                   # HERESY 1512: {device, rate, seconds}: an input's floor in dBFS per channel
                data = json.loads(body.decode("utf-8"))
                return self.send(200, audio_io.probe(str(data.get("device") or ""), int(data.get("rate") or 48000), int(data.get("seconds") or 2)))
            if url.path in ("/derived/delete", "/derived/restore", "/derived/empty"):   # HERESY 1527: {name, id, with_children} · {name, id} · {name}
                data = json.loads(body.decode("utf-8"))
                name = str(data.get("name", ""))
                if derived_busy(name):
                    return self.send(409, {"error": "a job runs on this take: its branches stay until it is done"})
                d = take_dir(name)
                if url.path == "/derived/delete":
                    try:
                        moved = derived_trash.delete(d, str(data.get("id", "")), bool(data.get("with_children")))
                    except derived_trash.HasChildren as e:
                        return self.send(409, {"error": str(e), "children": e.kids})
                    return self.send(200, dict(derived_list(name), moved=moved))
                if url.path == "/derived/restore":
                    return self.send(200, dict(derived_list(name), restored=derived_trash.restore(d, str(data.get("id", "")))))
                return self.send(200, dict(derived_list(name), emptied=derived_trash.empty(d)))
            if url.path == "/derived/mark":                  # HERESY 1504: {name, path, rating (1, -1, 0), fav}: the take's marks back
                data = json.loads(body.decode("utf-8"))
                name = str(data.get("name", ""))
                return self.send(200, {"name": name, "marks": derived_marks.mark(take_dir(name), str(data.get("path", "")), data.get("rating"), data.get("fav"))})
            if url.path == "/daw/mixes":                    # HERESY 1533: {name, set, working} · {…, save_as, state} · {…, delete}
                data = json.loads(body.decode("utf-8"))
                d, info = daw_info(str(data.get("name", "")), str(data.get("set", "")))
                sd = daw_kit._inside(d, info["set"])
                if "working" in data:
                    return self.send(200, daw_mixes.keep_working(sd, data["working"]))
                if "save_as" in data:
                    return self.send(200, daw_mixes.save_as(sd, data["save_as"], data.get("state")))
                if "delete" in data:
                    return self.send(200, daw_mixes.delete(sd, data["delete"]))
                return self.send(400, {"error": "working, save_as or delete"})
            if url.path == "/daw/mix/stop":                  # HERESY 1539: {name, id}
                data = json.loads(body.decode("utf-8"))
                return self.send(200, daw_stop(str(data.get("name", "")), str(data.get("id", ""))))
            if url.path == "/daw/mix":                       # HERESY 1470: {name, set, mix, versions}
                data = json.loads(body.decode("utf-8"))
                return self.send(202, daw_async(str(data.get("name", "")), str(data.get("set", "")), data.get("mix"), data.get("versions"),
                                                bool(data.get("print"))))   # HERESY 1531
            if url.path == "/gate":                          # HERESY 1547: {name, source, params}
                data = json.loads(body.decode("utf-8"))
                try:
                    return self.send(202, gate_async(str(data.get("name", "")), str(data.get("source", "") or ""), data.get("params")))
                except ValueError as e:
                    return self.send(400, {"error": str(e)})
            if url.path == "/plugin/run":                    # HERESY 1460: {name, source, plugin, step, params}
                data = json.loads(body.decode("utf-8"))
                return self.send(202, plugin_async(str(data.get("name", "")), str(data.get("plugin", "")), str(data.get("step", "")),
                                                   str(data.get("source", "") or ""), data.get("params")))
            if url.path == "/writer":
                return self.send(200, writer.post(KIT, json.loads(body.decode("utf-8")), q.get("scope", "")))
            if url.path == "/writer/versions":               # HERESY 1519: {op: keep|mark|delete|undelete, …}
                return self.send(200, creator_versions.post(KIT, json.loads(body.decode("utf-8")), q.get("scope", "")))
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
                gone = collection.trash_empty(KIT, older_than_days=days, config_dir=config_dir())["emptied"]   # 1368
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
