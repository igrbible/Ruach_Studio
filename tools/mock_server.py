#!/usr/bin/env python3
"""Stand-in for yue-server's HTTP API, to test the console page with no engine.

No GPU and no models: runs are simulated by one worker thread (FIFO, like the
real server), which prints the real server's log lines on /logs over a few
seconds and saves every take as a short sine WAV in the library folder.
Python standard library only; binds 127.0.0.1.

  python3 tools/mock_server.py                      # http://127.0.0.1:41869
  python3 tools/mock_server.py --port 0 --reset     # any free port, empty library

Serves build/tools/public/index.html at / (build it with ./build.sh). The library lives
in tmp/mock-outputs unless --outputs names another folder under tmp/.

Test helpers that the real server does not have:
  GET  /mock/requests    every /synth and /transcribe request received, raw
  GET  /mock/info        where its library is, relative to the install ({"outputs": "tmp/..."})
  POST /mock/clear       forget them
  POST /mock/flags       {"transcriber": bool, "outputs": bool, "peaks": bool} switches any off or on
Engine settings (/settings, /unload, /hardware) follow the server's rules: every
stage loads its module and, unless keep_loaded is on, drops it when done.
  /fakechat-loaded/...   a stand-in local chat server with a loaded model
  /fakechat-none/...     one that answers but has nothing loaded
  /fakechat-plain/...    one without the native model-state endpoint
A request whose style contains MOCK-FAIL fails in the sound stage; MOCK-HOLD runs eight times slower; MOCK-SLOW
makes that run take three times as long.
"""

import argparse
from array import array
import email.parser
import email.policy
import io
import json
import math
import os
import queue
import random
import re
import secrets
import shutil
import struct
import sys
import threading
import urllib.parse
import time
from collections import deque
from datetime import datetime
import socketserver
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class LoopbackServer(ThreadingHTTPServer):
    """ThreadingHTTPServer without its reverse-DNS lookup of the bound address: socket.getfqdn("127.0.0.1")
    took about 35 s on a Mac, longer than the page test waits for the mock to start."""

    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"
PAGE = TMP.parent / "build" / "tools" / "public" / "index.html"   # HERESY 1130: the page as build.sh makes it


def paints(stream):
    """ANSI colours only on a terminal: NO_COLOR (any value) turns them off, FORCE_COLOR keeps them for a pipe."""
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR", "") not in ("", "0"):
        return True
    try:
        return stream.isatty()
    except (AttributeError, ValueError):
        return False


G, Y, R, C, D, B, X = (("\033[32m", "\033[33m", "\033[31m", "\033[36m", "\033[2m", "\033[1m", "\033[0m")
                       if paints(sys.stdout) else ("",) * 7)
LOG_DIM, LOG_END = ("\033[2m", "\033[0m") if paints(sys.stderr) else ("", "")    # the echoed log lines go to stderr


def shown(path):
    """A path as the install sees it (tmp/..., relative to the root), for messages and /mock/info: never absolute."""
    for base, prefix in ((TMP.resolve(), "tmp/"), (ROOT, "")):
        try:
            return prefix + Path(path).resolve().relative_to(base).as_posix()
        except ValueError:
            pass
    return Path(path).name


def write_atomic(path, text):
    """The whole file or none of it: written beside it, then renamed over it, so a reader never sees half."""
    part = path.with_name("%s.%d-%d.part" % (path.name, os.getpid(), threading.get_ident()))
    try:
        part.write_text(text)
        os.replace(part, path)
    except BaseException:
        try:
            part.unlink()
        except OSError:
            pass
        raise


def disposition(how, folder, name, ext, q):
    """Content-Disposition as the real server writes it: named after the song (the title from meta.json, without
    the characters Windows refuses), or the library name when the page asks with names=library."""
    title = name
    if q.get("names") != "library":
        try:
            title = json.loads((folder / "meta.json").read_text(encoding="utf-8")).get("title") or name
        except (OSError, ValueError):
            pass
    safe = re.sub(r'[\x00-\x1f\x7f\\/:*?"<>|\s]+', " ", title).rstrip(" .").strip() or name
    safe += ext
    ascii_name = "".join(c if ord(c) < 128 else "_" for c in safe)
    return '%s; filename="%s"; filename*=UTF-8\'\'%s' % (how, ascii_name, urllib.parse.quote(safe, safe="-._~"))


def byte_range(header, size):
    """One Range of the form bytes=first-last, bytes=first- or bytes=-suffix, as (start, end). None when there is
    none or it is invalid (bytes=5-2, several ranges): the whole file is sent with 200, as RFC 9110 says an invalid
    Range is ignored. "unsatisfiable" when it starts past the end (416)."""
    m = re.fullmatch(r"\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*", header or "")
    if not m or not (m.group(1) or m.group(2)):
        return None
    if m.group(1):
        start = int(m.group(1))
        if m.group(2) and int(m.group(2)) < start:
            return None
        if start >= size:
            return "unsatisfiable"
        return start, min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
    suffix = int(m.group(2))
    if suffix == 0 or size == 0:
        return "unsatisfiable"
    return max(0, size - suffix), size - 1


VAES = [
    {"name": "standard", "label": "Standard", "repo": "m-a-p/YuE2-Vae"},
    {"name": "legacy", "label": "Legacy", "repo": "m-a-p/YuE2-Vae-legacy"},
    {"name": "blend", "label": "Blend", "repo": "Mothersuperior/YuE2-Vae-merge-0.666"},
]

# the real server's /props loras for the four files in loras/ (same fields as loras.py and lora.h)
LORAS = [
    {"id": "sv-billie-yue2-lora/sv_billie.safetensors", "name": "sv-billie", "size_mb": 117.5, "halves": ["ar", "nar"],
     "rank": 32, "layout": "fused", "pairs": 224, "trigger": "sv_billie", "hint": "", "mode": ""},
    {"id": "yue2-industrial-rock-lora/adapter-ar-179/lora.safetensors", "name": "yue2-industrial-rock-lora / adapter-ar-179",
     "size_mb": 34.9, "halves": ["ar"], "rank": 8, "layout": "unfused", "pairs": 196, "trigger": "", "hint": "", "mode": ""},
    {"id": "yue2-industrial-rock-lora/adapter-nar-179-v2/lora.safetensors", "name": "yue2-industrial-rock-lora / adapter-nar-179-v2",
     "size_mb": 140.0, "halves": ["nar"], "rank": 32, "layout": "unfused", "pairs": 198, "trigger": "", "hint": "", "mode": ""},
    {"id": "yue2-jpop-t4-lora/yue2_jpop_t4.safetensors", "name": "yue2_jpop_t4", "size_mb": 106.5, "halves": ["nar"],
     "rank": 48, "layout": "fused", "pairs": 112, "trigger": "jpstyle26",
     "hint": "Japanese pop, melodic vocals, polished studio production, clear drums, bass, guitars and synthesizers", "mode": "direct"},
    {"id": "broken/bad.safetensors", "name": "bad", "size_mb": 0.1, "halves": [], "error": "1 tensors do not land on the model, e.g. x"},
]

# loras/sources.json as the real server passes it through: links and recaps (a folder prefix, an exact id, a trigger fallback)
SOURCES = {
    "vaes": {"standard": {"official": True, "url": "https://example.org/std", "about": "The current official decoder."},
             "blend": {"official": False, "url": "https://example.org/blend", "about": "A community weight mix."},
             # not a web link: the page must show it as plain text, never as a link
             "legacy": {"official": True, "url": "javascript:alert(1)", "about": "The older official decoder."}},
    "loras": {"sv-billie-yue2-lora/": {"title": "sv-billie", "tag": "hushed bedroom pop", "repo": "someone/sv-billie",
                                        "url": "https://example.org/billie", "about": "Hushed bedroom pop."},
              "yue2-industrial-rock-lora/adapter-ar-179/": {"title": "Industrial rock", "tag": "riffs and drive", "repo": "someone/rock",
                                                             "url": "https://example.org/rock", "about": "Industrial rock, music half.",
                                                             "trigger": "rockword"}},
    "sliders": {"official": False, "repo": "someone/sliders", "url": "https://example.org/sliders", "about": "Voice and genre sliders, an add-on."},
}

SLIDERS = [
    ("female", "Female", "One adult female lead with clear melodic phrasing"),
    ("male", "Male", "One adult male lead with clear melodic phrasing"),
    ("pop", "Pop", "Clear hooks, crisp drums and a polished chorus"),
    ("hiphop", "Hip-Hop", "Rapped verses, deep sub bass and nimble hats"),
    ("rnb", "R&B", "Warm keys, deep pocket and fluid vocal phrasing"),
    ("indie-rock", "Indie Rock", "Chiming guitars, moving bass and a human drum kit"),
    ("pop-punk", "Pop Punk", "Palm-muted power chords and driving chorus drums"),
    ("metal", "Metal", "Heavy guitar riffs, tight kicks and big melodic choruses"),
    ("country", "Country", "Acoustic strum, twangy fills and an easy backbeat"),
    ("acoustic-folk", "Acoustic Folk", "Fingerpicked strings and a warm small-room performance"),
    ("house", "House", "Steady club kick, offbeat hats and a rolling bass line"),
    ("disco-funk", "Disco Funk", "Elastic bass, clipped guitar and bright dance-floor strings"),
    ("kpop", "K-pop", "Sharp synth hooks, tight edits and a big chorus lift"),
    ("reggaeton", "Reggaeton", "Dembow drums, rounded sub bass and clipped melodic hooks"),
    ("afrobeats", "Afrobeats", "Interlocking percussion, melodic bass and buoyant guitar"),
    ("lofi", "Lo-fi", "Soft swung drums, mellow keys and gentle tape warmth"),
]

# HERESY 1031, 1145: the engine's own defaults since Viktor's stable sampling became them (build/src/sampling.h); the Kit's
# (0.7 · 0.9 · 30 and 1.0 · 0.95 · 100) made a default song read "lowest" and "high" on the page's re-centred sliders
ABC_SAMPLING = {"temperature": 0.95, "top_p": 0.95, "top_k": 50, "repetition_penalty": 1.005,
                "penalty_window": 100, "min_tokens": 200, "max_tokens": 6144}
SEMANTIC_SAMPLING = {"temperature": 0.9, "top_p": 0.95, "top_k": 100, "repetition_penalty": 1.3,
                     "penalty_window": 100, "min_tokens": 750, "max_tokens": 12000}
DEFAULTS = {"style": "", "lyrics": "", "abc": "", "cot": "full", "duration": 360.0, "lm_seed": -1, "seed": -1,
            "steps": 32, "lm_batch_size": 1, "synth_batch_size": 1, "abc_sampling": ABC_SAMPLING,
            "semantic_sampling": SEMANTIC_SAMPLING, "semantic_tokens": "", "cfg_scale": -1.0,
            "output_format": "mp3", "peak_clip": 10, "mp3_bitrate": 128, "title": "", "vae": "",
            "sliders": [], "loras": [], "plan_only": False, "parent": ""}

SCORE_FULL = """X:1
T:
M:4/4
L:1/16
Q:1/4=92
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:G
% intro
V: Vocal
"G"z16|"D"z16|
V: Ins
B4d4g4d4|A4d4f4d4|
% verse
V: Vocal
"G"G2A2B2d2B2A2G4|"Em"E2G2A2B2A2G2E4|"C"c2B2A2G2A2B2c4|"D"d4B4A4z4|
V: Ins
Z4|
% chorus
V: Vocal
"G"d2d2e2d2B2A2G4|"C"e2e2g2e2d2B2A4|"Em"B2d2e2d2B2A2G4|"D"A4B4G4z4|
V: Ins
Z4|
"""

SCORE_TRANSCRIBED = """X:1
T:
M:4/4
L:1/16
Q:1/4=104
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:D
% verse
V: Vocal
"D"F2A2A2B2A4F4|"G"G2B2B2c2B4G4|"A"A2c2e2c2A4z4|"D"d8z8|
V: Ins
d4f4a4f4|g4b4d'4b4|a4c'4e'4c'4|d'8z8|
% chorus
V: Vocal
"Bm"B2d2f2d2B4z4|"G"G2B2d2B2G4z4|"A"A2c2e2a2e4c4|"D"d16|
V: Ins
Z4|
"""


def strip_chords(abc):
    out = []
    for line in abc.split("\n"):
        if re.match(r"\s*[A-Za-z]:", line) or line.lstrip().startswith("%"):
            out.append(line)
        else:
            out.append(re.sub(r'"[^"\n]*"', "", line))
    return "\n".join(out)


def slugify(title):
    out = ""
    for ch in title:
        if ch.isascii() and ch.isalnum():
            out += ch.lower()
        elif out and out[-1] != "-":
            out += "-"
        if len(out) >= 40:
            break
    return out.strip("-") or "song"


def random_seed():
    return secrets.randbits(63)


def sine_wav(seconds, fmt, seed, rate=48000):
    """A short stereo tone that swells like a song, so waveforms differ per take."""
    frames = max(1, int(seconds * rate))
    freq = 110.0 * 2 ** ((seed % 24) / 12.0)
    beat = 1.5 + (seed % 5) * 0.25
    w1, w2, wb, ws = 2 * math.pi * freq, 4 * math.pi * freq, 2 * math.pi * beat, 2 * math.pi * 2.5 / seconds
    phase = seed % 7
    sin = math.sin
    mono = [(0.35 + 0.45 * (0.5 + 0.5 * sin(ws * t + phase))) * (0.6 + 0.4 * max(0.0, sin(wb * t))) *
            min(1.0, t / 0.3, (seconds - t) / 0.5) * (0.72 * sin(w1 * t) + 0.18 * sin(w2 * t))
            for t in (n / rate for n in range(frames))]
    if fmt == "wav32":
        tag, bits = 3, 32
        data = array("f", [v for v in mono for _ in (0, 1)]).tobytes()
    elif fmt == "wav24":
        tag, bits = 1, 24
        raw = array("i", [int(v * 8388607) for v in mono for _ in (0, 1)]).tobytes()
        packed = bytearray(len(raw) // 4 * 3)
        packed[0::3], packed[1::3], packed[2::3] = raw[0::4], raw[1::4], raw[2::4]
        data = bytes(packed)
    else:   # wav16, and the mock's stand-in for mp3
        tag, bits = 1, 16
        data = array("h", [int(v * 32767) for v in mono for _ in (0, 1)]).tobytes()
    block = 2 * bits // 8
    fmt_chunk = struct.pack("<HHIIHH", tag, 2, rate, rate * block, block, bits)
    return (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt_chunk +
            b"data" + struct.pack("<I", len(data)) + data)


class Mock:
    def __init__(self, args):
        self.args = args
        self.log_lines = deque(maxlen=512)
        self.log_seq = 0
        self.log_cv = threading.Condition()
        self.jobs = {}
        self.order = []
        self.jobs_lock = threading.Lock()
        self.work = queue.Queue()
        self.library_lock = threading.Lock()
        self.requests = []
        self.slow = 1.0
        self.models = ["BF16", "Q8_0"]
        self.settings = {"model": "BF16", "keep_loaded": False, "max_seq": 0, "vae_core": 512}
        self.peaks_on = True
        self.loaded = {}          # module -> bytes in GPU memory
        self.active = None        # the job on the worker right now
        self.outputs = Path(args.outputs).resolve() if args.outputs else TMP / "mock-outputs"
        self.writer_kit = TMP / "mock-writer"   # HERESY 1168: the Writer's notebooks of the mock (writer/, writer-claude/)
        self.writer_kit.mkdir(parents=True, exist_ok=True)
        self.vaes = [v for v in VAES if v["name"] in args.vaes.split(",")]
        self.sliders = [] if args.no_sliders else SLIDERS
        self.version = "mock (2026-09-24)"
        threading.Thread(target=self.worker, daemon=True).start()

    # ------------------------------------------------------------------ log
    def log(self, line):
        with self.log_cv:
            self.log_lines.append((self.log_seq, line))
            self.log_seq += 1
            self.log_cv.notify_all()
        if not self.args.quiet:
            sys.stderr.write(LOG_DIM + line[:200] + (" …" if len(line) > 200 else "") + LOG_END + "\n")

    def log_request(self, prefix, req):
        text = json.dumps(req, indent=2, ensure_ascii=False)
        lines = text.split("\n")
        self.log(prefix + lines[0])
        for line in lines[1:]:
            self.log(line)

    # ----------------------------------------------------------------- jobs
    def new_job(self, kind, request):
        job = {"id": "%016x" % random.getrandbits(64), "kind": kind, "request": request, "status": "running", "started": False,
               "takes": [], "abc": "", "error": "", "cancel": False, "result": b"", "mime": "application/json"}
        with self.jobs_lock:
            self.jobs[job["id"]] = job
            self.order.append(job["id"])
            while len(self.order) > 32:
                old = self.jobs.get(self.order[0])
                if old and old["status"] == "running":
                    break
                self.jobs.pop(self.order.pop(0), None)
        return job

    def worker(self):
        while True:
            job = self.work.get()
            if job["kind"] == "call":           # settings and unload run between jobs
                job["fn"]()
                continue
            self.active = job
            job["started"] = True
            try:
                if job["kind"] == "transcribe":
                    self.run_transcribe(job)
                else:
                    self.run_synth(job)
            except Cancelled:
                job["status"] = "cancelled"
            except Exception as exc:  # the mock must never die on one job
                self.log("[Server] mock error: %s: %s" % (type(exc).__name__, exc))
                job["error"] = str(exc)
                job["status"] = "failed"
            finally:
                if not self.settings["keep_loaded"]:
                    self.unload_idle()
                self.active = None

    def pause(self, seconds):
        time.sleep(max(0.0, seconds * self.slow / self.args.speed))

    MB = 1024 * 1024
    SIZES = {"LM": {"BF16": 3583, "Q8_0": 1904}, "NAR": {"BF16": 3583, "Q8_0": 1904}, "VAE": {"BF16": 530, "Q8_0": 530},
             "SS2": {"BF16": 2708, "Q8_0": 2708}}

    def load(self, module):
        """One stage's module comes in; with keep_loaded off the others leave first."""
        if not self.settings["keep_loaded"]:
            for other in [m for m in self.loaded if m != module]:
                self.log("[Store] Evict %s (%.1f MB)" % (other, self.loaded.pop(other) / self.MB))
        if module not in self.loaded:
            size = self.SIZES[module][self.settings["model"]]
            self.loaded[module] = size * self.MB
            self.log("[Store] Load %s: %d ms" % (module, random.randint(300, 1500)))

    def unload_idle(self):
        freed = 0
        for module in list(self.loaded):
            size = self.loaded.pop(module)
            freed += size
            self.log("[Store] Unload %s (%.1f MB)" % (module, size / self.MB))
        return freed

    def run_between_jobs(self, fn, timeout=3.0):
        """Like the server: the change runs on the worker, at once when idle."""
        done = threading.Event()
        box = {}

        def call():
            box["value"] = fn()
            done.set()
        self.work.put({"kind": "call", "fn": call})
        return done.wait(timeout), box

    def check(self, job, where):
        if job["cancel"]:
            self.log(where)
            raise Cancelled()

    def run_synth(self, job):
        req = job["request"]
        started = time.time()
        self.slow = 8.0 if "MOCK-HOLD" in req["style"] else 3.0 if "MOCK-SLOW" in req["style"] else 1.0   # HOLD: 1168, a run to reload under
        sparse = {k: v for k, v in req.items() if DEFAULTS.get(k) != v}
        self.log_request("[Server] Job %s: " % job["id"], sparse)
        B = 1 if req["semantic_tokens"] else req["lm_batch_size"]
        M = req["synth_batch_size"]
        cot = req["cot"]
        replay = bool(req["semantic_tokens"].strip())
        steps = req["steps"]
        cfg = req["cfg_scale"] if req["cfg_scale"] >= 0 else (1.01 if cot == "off" else 1.0)
        prefix = 1800 + len(req["lyrics"]) // 3
        scores = [req["abc"]] * B
        if replay and req["lm_batch_size"] > 1:
            self.log("[Pipeline] Replay: lm_batch_size ignored")

        if not replay and cot != "off" and not req["abc"].strip():
            self.load("LM")
            self.pause(0.15)
            for i in range(B):
                self.log("[AR] Score song %d: %d tokens prefilled, %d ms" % (i, 380 + len(req["lyrics"]) // 3, random.randint(20, 60)))
            self.log("[AR] Score prefill: %d ms, CFG=1.00, top_k=%d, budget=%d, songs=%d, batch=%d" %
                     (random.randint(30, 90), req["abc_sampling"]["top_k"], req["abc_sampling"]["max_tokens"], B, B))
            ends = [random.randint(1200, 1700) for _ in range(B)]
            for step in range(0, max(ends) + 1, 100):
                self.check(job, "[AR] Cancelled at step %d" % step)
                self.log("[AR] Score %d/%d" % (step, req["abc_sampling"]["max_tokens"]))
                self.pause(0.9 / (max(ends) / 100))
                for i, end in enumerate(ends):
                    if step < end <= step + 100:
                        self.log("[AR] Score song %d: end token at step %d" % (i, end))
            for i, end in enumerate(ends):
                self.log("[AR] Score song %d: %d tokens" % (i, end))
            self.log("[AR] Score: %d tokens over %d songs, %d steps, %.1f s (%.1f ms/step)" %
                     (sum(ends), B, max(ends), 0.9 / self.args.speed, 900.0 / max(ends)))
            base = SCORE_FULL if cot == "full" else strip_chords(SCORE_FULL)
            scores = [base.replace("Q:1/4=92", "Q:1/4=%d" % (84 + 4 * i)) for i in range(B)]

        if req["plan_only"]:
            job["abc"] = scores[0]
            job["result"] = json.dumps({"abc": scores[0]}).encode()
            self.log("[Pipeline] Done: score only, %d song in %.1f s" % (B, time.time() - started))
            job["status"] = "done"
            return

        self.log("[Prompt] cot=%s, songs=%d, variations=%d, %d tracks" % (cot, B, M, B * M))
        if not replay:
            self.load("LM")
        seconds = min(self.args.seconds, req["duration"]) if req["duration"] > 0 else self.args.seconds
        if replay:
            codes = [[int(v) for v in req["semantic_tokens"].split(",") if v.strip()]]
            self.log("[Pipeline] Replay: %d frames supplied" % len(codes[0]))
        else:
            budget = req["semantic_sampling"]["max_tokens"]
            clamp = int(req["duration"] * 25)
            if 0 < clamp < budget:
                self.log("[AR] Frame budget clamped to %d by the requested duration (%.1f s)" % (clamp, req["duration"]))
                budget = clamp
            for s in req["sliders"]:
                self.log("[Sliders] %s at gain %.2f" % (s["id"], s["strength"]))
            for i in range(B):
                self.log("[AR] Semantic song %d: %d tokens prefilled, %d ms" % (i, prefix, random.randint(40, 90)))
            self.log("[AR] Semantic prefill: %d ms, CFG=%.2f, top_k=%d, budget=%d, songs=%d, batch=%d" %
                     (random.randint(60, 140), cfg, req["semantic_sampling"]["top_k"], budget, B, B if cfg == 1.0 else 2 * B))
            lengths = [max(25, int(seconds * 25) - 5 * i) for i in range(B)]
            longest = max(lengths)
            for step in range(0, longest + 1, 100 if longest > 300 else 25):
                self.check(job, "[AR] Cancelled at step %d" % step)
                if step % 100 == 0:
                    self.log("[AR] Semantic %d/%d" % (step, budget))
                self.pause(0.9 / max(1, longest / (100 if longest > 300 else 25)))
            for i, n in enumerate(lengths):
                self.log("[AR] Semantic song %d: end token at step %d" % (i, n))
            for i, n in enumerate(lengths):
                self.log("[AR] Semantic song %d: %d tokens" % (i, n))
            self.log("[AR] Semantic: %d tokens over %d songs, %d steps, %.1f s (%.1f ms/step)" %
                     (sum(lengths), B, longest, 0.9 / self.args.speed, 900.0 / longest))
            if req["sliders"]:
                self.log("[Sliders] Detached; the sound stage re-prefills its cache without them")
            rng = random.Random(req["lm_seed"])
            codes = [[rng.randrange(32768) for _ in range(n)] for n in lengths]

        self.load("NAR")
        per_step = 1.2 / max(1, steps * B)
        for i in range(B):
            frames = len(codes[i])
            self.log("[NAR] Song %d: %d frames (%.1f s), prefix %d, 1 chunk of %d, %d variation%s" %
                     (i, frames, frames / 25.0, prefix, 11000, M, "s" if M > 1 else ""))
            for step in range(steps):
                self.check(job, "[NAR] Cancelled at step %d" % step)
                if "MOCK-FAIL" in req["style"] and step == steps // 2:
                    self.log("[NAR] FATAL: graph alloc failed for T_lat=%d" % frames)
                    job["error"] = "graph alloc failed for T_lat=%d (mock failure)" % frames
                    job["status"] = "failed"
                    return
                self.log("[NAR] Step %d/%d, %d ms" % (step + 1, steps, random.randint(20, 40)))
                self.pause(per_step)
            self.log("[NAR] Solved: T_lat=%d, %d variations, %d steps, %d ms (%.1f ms/step)" % (frames, M, steps, 900, 30.0))
            self.log("[NAR] Song %d chunk 1/1: %d frames, cache %d rows, 1 forwarded, %.1f s" %
                     (i, frames, prefix + frames + 1, 1.2 / B / self.args.speed))
        self.load("VAE")
        tracks = B * M
        audio = []
        for t in range(tracks):
            self.check(job, "[VAE] Cancelled at tile 0/1")
            song, variation = divmod(t, M)
            self.log("[VAE] Track %d/%d: song %d variation %d" % (t + 1, tracks, song, variation))
            self.pause(0.4 / tracks)
            track_seconds = len(codes[song]) / 25.0
            self.log("[VAE] Decoded: T_latent=%d -> T_audio=%d (%.2fs @ 48kHz), %d ms" %
                     (len(codes[song]), int(track_seconds * 48000), track_seconds, random.randint(80, 200)))
            audio.append(sine_wav(track_seconds, req["output_format"], (req["seed"] + variation) ^ (req["lm_seed"] + song)))
        total = sum(len(codes[t // M]) / 25.0 for t in range(tracks))
        elapsed = time.time() - started
        self.log("[Pipeline] Done: %d tracks, %.1f s of audio in %.1f s (%.1fx realtime)" % (tracks, total, elapsed, total / elapsed))

        parts = []
        for t in range(tracks):
            song, variation = divmod(t, M)
            replay_req = dict(req, abc=scores[song] if not req["abc"] else req["abc"],
                              semantic_tokens=",".join(str(v) for v in codes[song]),
                              lm_seed=req["lm_seed"] + (0 if replay else song), seed=req["seed"] + variation,
                              lm_batch_size=1, synth_batch_size=1, plan_only=False)
            parts.append((replay_req, audio[t]))
            if not self.args.no_outputs:
                name = self.save(replay_req, audio[t], len(codes[song]) / 25.0, t, tracks, song, variation, elapsed,
                                 provided_score=bool(req["abc"].strip()))
                job["takes"].append(name)
                self.log("[Library] Saved %s" % name)
        boundary = "yue2-batch-boundary"
        body = io.BytesIO()
        for replay_req, wav in parts:
            body.write(("--%s\r\nContent-Type: application/json\r\n\r\n" % boundary).encode())
            body.write(json.dumps(replay_req, indent=2).encode() + b"\r\n")
            mime = "audio/mpeg" if req["output_format"] == "mp3" else "audio/wav"
            body.write(("--%s\r\nContent-Type: %s\r\n\r\n" % (boundary, mime)).encode())
            body.write(wav + b"\r\n")
        body.write(("--%s--\r\n" % boundary).encode())
        job["result"] = body.getvalue()
        job["mime"] = "multipart/mixed; boundary=" + boundary
        job["status"] = "done"

    def run_transcribe(self, job):
        info = job["request"]
        self.slow = 1.0
        self.log("[Server] Transcribe job %s: %.1f s of audio, %s" %
                 (job["id"], info["seconds"], "melody only" if info["melody_only"] else "full score"))
        self.load("SS2")
        for tick in range(6):
            self.check(job, "[SheetSage] Cancelled")
            self.pause(0.25)
        abc = strip_chords(SCORE_TRANSCRIBED) if info["melody_only"] else SCORE_TRANSCRIBED
        job["abc"] = ""
        job["result"] = json.dumps({"abc": abc}).encode()
        job["status"] = "done"

    # -------------------------------------------------------------- library
    def save(self, req, wav, seconds, track, tracks, song, variation, render_seconds, provided_score=False, when=None):
        when = time.time() if when is None else when
        with self.library_lock:
            self.outputs.mkdir(parents=True, exist_ok=True)
            base = datetime.fromtimestamp(when).strftime("%Y%m%d-%H%M%S") + "-" + slugify(req["title"])
            if tracks > 1:
                base += "-%d" % (track + 1)
            name, n = base, 2
            while (self.outputs / name).exists():
                name = "%s-v%d" % (base, n)
                n += 1
            folder = self.outputs / name
            folder.mkdir()
            ext = "mp3" if req["output_format"] == "mp3" else "wav"   # the mock writes WAV data either way
            (folder / ("audio." + ext)).write_bytes(wav)
            (folder / "request.json").write_text(json.dumps(req, indent=2, ensure_ascii=False))
            meta = {"title": req["title"], "created": int(when), "seconds": round(seconds, 3),
                    "format": req["output_format"], "favorite": False, "truncated": False,
                    "render_seconds": round(render_seconds, 2), "song": song, "variation": variation,
                    "provided_score": provided_score, "model": self.settings["model"]}
            if when is None or when >= time.time() - 1:   # HERESY 1168: a take made now keeps its latents (the demo ones, older, do not)
                (folder / "latents.f32").write_bytes(b"\x02\x00\x00\x00\x01\x00\x00\x00\x40\x00\x00\x00" + b"\x00" * 256)
            write_atomic(folder / "meta.json", json.dumps(meta, indent=2))   # last: a take is listed once this exists
            return name

    def entry(self, name):
        folder = self.outputs / name
        try:
            meta = json.loads((folder / "meta.json").read_text())
            req = json.loads((folder / "request.json").read_text())
        except (OSError, ValueError):
            return None
        e = dict(meta, name=name)
        e.update({"style": req.get("style", ""), "lyrics": req.get("lyrics", ""), "cot": req.get("cot", "full"),
                  "lm_seed": req.get("lm_seed", -1), "seed": req.get("seed", -1),
                  "vae": req.get("vae") or self.vaes[0]["name"], "sliders": req.get("sliders", []), "loras": req.get("loras", []),
                  "steps": req.get("steps", 32), "cfg_scale": req.get("cfg_scale", -1.0),
                  "duration": req.get("duration", 360.0), "parent": req.get("parent", ""),
                  "has_score": bool(req.get("abc")), "latents": (folder / "latents.f32").is_file()})
        return e

    def library(self):
        if not self.outputs.is_dir():
            return []
        names = sorted((p.name for p in self.outputs.iterdir() if (p / "meta.json").is_file()), reverse=True)
        return [e for e in (self.entry(n) for n in names) if e]

    def name_ok(self, name):
        """A take's folder name and nothing else: no separators, nothing hidden or relative ("." and ".." included),
        and it must resolve to a folder directly inside the library (so "." cannot name the library itself)."""
        if not name or name.startswith(".") or ".." in name or any(c in name for c in "/\\\0"):
            return False
        try:
            folder = (self.outputs / name).resolve()
            return folder.parent == self.outputs.resolve() and folder.is_dir()
        except (OSError, ValueError, RuntimeError):
            return False

    def demo(self, count):
        styles = ["English, warm piano pop, expressive female voice, acoustic piano, rounded bass, 88 BPM",
                  "English, dark country, baritone male voice, fiddle, banjo, half-time groove, 86 BPM",
                  "German, synth pop, bright female voice, analog synths, four-on-the-floor, 118 BPM"]
        titles = ["City Lights", "Ridge Road", "Nachtzug"]
        now = time.time()
        for i in range(count):
            lm_seed, seed = random_seed(), random_seed()
            req = dict(DEFAULTS, title=titles[i % 3], style=styles[i % 3], cot=["full", "melody", "off"][i % 3],
                       lyrics="[Verse]\nFootsteps keep the time of rain\nFold the night and leave it here\n\n"
                              "[Chorus]\nLet the day come into view\nEvery road begins with you\n",
                       lm_seed=lm_seed, seed=seed, output_format="wav24", vae="standard",
                       abc="" if i % 3 == 2 else (SCORE_FULL if i % 3 == 0 else strip_chords(SCORE_FULL)),
                       semantic_tokens=",".join(str(random.randrange(32768)) for _ in range(100)))
            # one second apart, like the real names, and in the past: no take made later can share a name
            self.save(req, sine_wav(4.0, "wav24", lm_seed ^ seed), 4.0, 0, 1, 0, 0, 40.0 + i, when=now - (count - i))


class Cancelled(Exception):
    pass


def parse_request(body, mock):
    """Read and check a /synth body the way yue-server does; return (request, error)."""
    try:
        raw = json.loads(body)
        if not isinstance(raw, dict):
            raise ValueError
    except ValueError:
        return None, "invalid JSON"
    req = json.loads(json.dumps(DEFAULTS))
    for key, value in raw.items():
        if key in ("abc_sampling", "semantic_sampling") and isinstance(value, dict):
            req[key].update(value)
        elif key in req:
            req[key] = value
    if req["cot"] not in ("full", "melody", "off"):
        return None, "cot must be full, melody or off"
    if req["output_format"] not in ("mp3", "wav16", "wav24", "wav32"):
        return None, "unknown output format"
    for key in ("style", "lyrics", "abc", "cot", "semantic_tokens", "output_format", "title", "vae", "parent"):
        if not isinstance(req[key], str):
            req[key] = DEFAULTS[key]
    if not isinstance(req["sliders"], list):
        req["sliders"] = []
    if not isinstance(req["loras"], list):
        req["loras"] = []
    for key in ("lm_seed", "seed", "steps", "lm_batch_size", "synth_batch_size", "peak_clip", "mp3_bitrate"):
        if not isinstance(req[key], int) or isinstance(req[key], bool):
            req[key] = DEFAULTS[key]
    if req["steps"] < 1:
        return None, "steps must be positive"
    if not 1 <= req["lm_batch_size"] <= mock.args.max_batch:
        return None, "lm_batch_size exceeds --max-batch"
    if not 1 <= req["synth_batch_size"] <= 9:
        return None, "synth_batch_size must be between 1 and 9"
    for name in ("abc_sampling", "semantic_sampling"):
        s = req[name]
        ok = (0 <= s["temperature"] <= 5 and 0 < s["top_p"] <= 1 and s["top_k"] >= 1 and s["repetition_penalty"] > 0 and
              1 <= s["penalty_window"] <= 100 and 0 <= s["min_tokens"] <= s["max_tokens"] and s["max_tokens"] >= 1)
        if not ok:
            return None, "sampling preset outside the protocol bounds"
    if req["vae"] and req["vae"] not in [v["name"] for v in mock.vaes]:
        return None, "unknown decoder (see /props vaes)"
    seen = set()
    for item in req["sliders"] or []:
        if not isinstance(item, dict) or item.get("id") not in [s[0] for s in mock.sliders]:
            return None, "unknown slider (see /props sliders)"
        if not 0 <= float(item.get("strength", 1.0)) <= 1:
            return None, "slider strength must be between 0 and 1"
        if item["id"] in seen:
            return None, "a slider is listed twice"
        seen.add(item["id"])
        item["strength"] = float(item.get("strength", 1.0))
    known = {e["id"]: e for e in LORAS}
    kept = []
    for item in req["loras"]:
        entry = known.get(item.get("id")) if isinstance(item, dict) else None
        if entry is None:
            return None, "unknown LoRA (see /props loras)"
        if entry.get("error"):
            return None, "the LoRA %s cannot load: %s" % (entry["name"], entry["error"])
        ar, nar = float(item.get("ar", 1.0)), float(item.get("nar", 1.0))
        if not (0 <= ar <= 2 and 0 <= nar <= 2):
            return None, "LoRA strengths go from 0 to 2"
        if any(k["id"] == entry["id"] for k in kept):
            return None, "a LoRA is listed twice"
        ar, nar = (ar if "ar" in entry["halves"] else 0.0), (nar if "nar" in entry["halves"] else 0.0)
        if ar or nar:
            kept.append({"id": entry["id"], "ar": ar, "nar": nar})
    req["loras"] = kept
    if req["plan_only"] and (req["cot"] == "off" or req["abc"] or req["semantic_tokens"]):
        return None, "plan_only needs full or melody mode, no supplied score and no semantic stream"
    if req["lm_seed"] < 0:
        req["lm_seed"] = random_seed()
    if req["seed"] < 0:
        req["seed"] = random_seed()
    req["vae"] = req["vae"] or mock.vaes[0]["name"]
    return req, None


def wav_peaks(data, buckets=900):
    """900 peaks (0..1, both channels) and the length, like the server's /library/peaks."""
    tag, channels, rate = struct.unpack("<HHI", data[20:28])
    bits = struct.unpack("<H", data[34:36])[0]
    body = data[44:]
    if bits == 24:
        n = len(body) // 3
        widened = bytearray(n * 4)            # each sample shifted into the top of an int32
        widened[1::4], widened[2::4], widened[3::4] = body[0:n * 3:3], body[1:n * 3:3], body[2:n * 3:3]
        values, scale = array("i", bytes(widened)), 2147483648.0
    elif bits == 32 and tag == 3:
        values, scale = array("f", body[:len(body) // 4 * 4]), 1.0
    else:
        values, scale = array("h", body[:len(body) // 2 * 2]), 32768.0
    channels = max(1, channels)
    frames = len(values) // channels
    size = max(1, frames // buckets)
    peaks = []
    for b in range(buckets):
        chunk = values[b * size * channels:(b + 1) * size * channels]
        if not chunk:
            break
        peaks.append(round(max(max(chunk), -min(chunk)) / scale, 3))
    return peaks, frames / float(rate or 48000)


def wav_seconds(data):
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        rate = struct.unpack("<I", data[24:28])[0] or 1
        block = struct.unpack("<H", data[32:34])[0] or 1
        return max(0.0, (len(data) - 44) / block / rate)
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return len(data) / 16000.0      # about 128 kbps
    return None


def make_handler(mock):
    class Handler(BaseHTTPRequestHandler):
        server_version = "yue-server-mock"

        replied = False

        def log_message(self, *args):
            pass

        def send_response(self, code, message=None):
            self.replied = True
            super().send_response(code, message)

        def guarded(self, route):
            """Any exception in a route answers 400 with a JSON error (bad input), like the real server, instead
            of dropping the connection with no reply."""
            self.replied = False
            try:
                route()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as exc:
                mock.log("[Server] %s %s failed: %s: %s" % (self.command, urlparse(self.path).path, type(exc).__name__, exc))
                if not self.replied:        # once the status line is out, nothing more can be said
                    try:
                        self.error(400, "bad request: %s" % exc)
                    except OSError:
                        pass

        def do_GET(self):
            self.guarded(self.route_get)

        def do_POST(self):
            self.guarded(self.route_post)

        # -------------------------------------------------------- helpers
        def send(self, code, body, mime="application/json", extra=None):
            if isinstance(body, (dict, list)):
                body = json.dumps(body).encode()
            elif isinstance(body, str):
                body = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def error(self, code, message):
            self.send(code, {"error": message})

        def body(self):
            length = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(length) if length else b""

        def query(self):
            return {k: v[0] for k, v in parse_qs(urlparse(self.path).query, keep_blank_values=True).items()}

        def writer(self, fn):
            """the lab's own lab/writer.py answers, on the mock's folder; its refusals as the lab sends them"""
            try:
                import importlib.util
                here = Path(__file__).resolve()   # the studio's lab/, the nearest above the mock (a kitchen copy sits deeper)
                found = next((d / "lab" / "writer.py" for d in here.parents if (d / "lab" / "writer.py").is_file()), None)
                if found is None:
                    raise ImportError("no lab/writer.py above " + str(here.parent))
                spec = importlib.util.spec_from_file_location("lab_writer", found)
                w = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(w)
            except (OSError, ImportError) as e:
                return self.error(404, "no lab/writer.py beside the mock: %s" % e)
            try:
                return self.send(200, fn(w))
            except FileNotFoundError as e:
                return self.error(404, str(e))
            except ValueError as e:
                return self.error(400, str(e))

        # ----------------------------------------------------------- GET
        def route_get(self):
            path, q = urlparse(self.path).path, self.query()
            if path == "/":
                if not PAGE.is_file():
                    return self.send(404, "build/tools/public/index.html is missing: run ./build.sh first\n", "text/plain")
                return self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8", {"Cache-Control": "no-store"})
            if path == "/lab/trash":   # HERESY 1168
                return self.send(200, {"items": []})
            if path == "/lab/writer":   # HERESY 1168: the Writer's notebook, the lab's own code on a folder of the mock's
                return self.writer(lambda w: w.get(mock.writer_kit, q["id"], q.get("scope", "")) if q.get("id")
                                   else w.listing(mock.writer_kit, q.get("scope", "")))
            if path == "/health":
                return self.send(200, {"status": "ok"})
            if path == "/props":
                return self.send(200, {
                    "version": mock.version, "model": "models/YuE2-3B-%s.gguf" % mock.settings["model"],
                    "vae": "models/YuE2-Vae-F32.gguf", "sample_rate": 48000, "frame_rate": 25, "context": 24576,
                    "vaes": mock.vaes, "default_vae": mock.vaes[0]["name"],
                    "sliders": [{"id": s[0], "label": s[1], "description": s[2]} for s in mock.sliders],
                    "loras": LORAS, "sources": SOURCES,
                    "max_batch": mock.args.max_batch, "transcriber": not mock.args.no_transcriber,
                    "outputs": not mock.args.no_outputs, "defaults": DEFAULTS})
            if path == "/logs":
                return self.stream_logs()
            if path == "/settings":
                return self.send(200, self.settings_json())
            if path == "/hardware":
                gpus = [] if mock.args.no_gpu else [{
                    "name": "CUDA0", "description": mock.args.gpu_name, "total_bytes": 34190917632,
                    "free_bytes": 34190917632 - 1181116006 - sum(mock.loaded.values())}]
                return self.send(200, {"gpus": gpus, "loaded_bytes": sum(mock.loaded.values()),
                                       "loaded_modules": len(mock.loaded), "busy": mock.active is not None})
            if path == "/job":
                return self.get_job(q)
            if path.startswith("/library") and not mock.args.no_outputs:
                return self.get_library(path, q)
            if path == "/mock/requests":
                return self.send(200, mock.requests)
            if path == "/mock/info":
                return self.send(200, {"outputs": shown(mock.outputs)})
            if path.startswith("/fakechat-"):
                return self.fake_chat_get(path)
            self.error(404, "not found")

        def stream_logs(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            with mock.log_cv:
                backlog = list(mock.log_lines)
                cursor = mock.log_seq
            try:
                for _, line in backlog:
                    self.wfile.write(("data: %s\n\n" % line).encode())
                self.wfile.flush()
                while True:
                    with mock.log_cv:
                        mock.log_cv.wait_for(lambda: mock.log_seq > cursor, timeout=2)
                        fresh = [(s, l) for s, l in mock.log_lines if s >= cursor]
                        cursor = mock.log_seq
                    for _, line in fresh:
                        self.wfile.write(("data: %s\n\n" % line).encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return

        def get_job(self, q):
            with mock.jobs_lock:
                job = mock.jobs.get(q.get("id", ""))
            if not job:
                return self.error(404, "job not found")
            if "result" not in q:
                out = {"status": "queued" if job["status"] == "running" and not job["started"] else job["status"]}
                if job["kind"] == "synth":
                    out["lm_seed"] = job["request"]["lm_seed"]
                    out["seed"] = job["request"]["seed"]
                if job["status"] == "done":
                    out["takes"] = job["takes"]
                    if job["abc"]:
                        out["abc"] = job["abc"]
                if job["status"] == "failed" and job["error"]:
                    out["error"] = job["error"]
                return self.send(200, out)
            if job["status"] != "done":
                return self.error(404, "result not ready")
            return self.send(200, job["result"], job["mime"])

        def get_library(self, path, q):
            if path == "/library":
                return self.send(200, {"takes": mock.library()})
            name = q.get("name", "")
            if not mock.name_ok(name):
                return self.error(404, "no such take")
            folder = mock.outputs / name
            if path == "/library/peaks":
                mock.requests.append({"path": "/library/peaks", "name": name})
                if not mock.peaks_on:
                    return self.error(500, "cannot decode the audio")
                cache = folder / "peaks.json"
                if not cache.is_file():
                    audio = folder / "audio.mp3"
                    if not audio.is_file():
                        audio = folder / "audio.wav"
                    peaks, seconds = wav_peaks(audio.read_bytes())
                    write_atomic(cache, json.dumps({"peaks": peaks, "seconds": round(seconds, 3)}))
                return self.send(200, cache.read_bytes())
            if path == "/library/request":
                return self.send(200, (folder / "request.json").read_bytes())
            if path == "/library/flac":
                mock.requests.append({"path": "/library/flac", "name": name})
                if (folder / "audio.mp3").is_file():
                    return self.error(400, "this take was made as MP3; a FLAC of it would not sound any better")
                return self.send(200, b"fLaC" + bytes(64), "audio/flac",
                                 {"Content-Disposition": disposition("attachment", folder, name, ".flac", q)})
            if path == "/library/mp3":
                # The real server encodes and tags; the page only needs the request and the file name
                kbps = q.get("kbps", "320")
                mock.requests.append({"path": "/library/mp3", "name": name, "kbps": kbps})
                if kbps not in ("128", "192", "256", "320"):
                    return self.error(400, "kbps must be 128, 192, 256 or 320")
                return self.send(200, b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\xff\xfb" * 64, "audio/mpeg",
                                 {"Content-Disposition": disposition("attachment", folder, name, ".mp3", q)})
            # HERESY 1053, 1145: the player listens through /library/listen (FLAC on the real server); here the same audio as
            # /library/audio, so the page's player plays as it does at home instead of falling back to the WAV
            if path in ("/library/audio", "/library/listen"):
                mock.requests.append({"path": path, "name": name, "range": bool(self.headers.get("Range"))})
                audio = folder / "audio.mp3"
                if not audio.is_file():
                    audio = folder / "audio.wav"
                data = audio.read_bytes()
                mime = "audio/mpeg" if audio.suffix == ".mp3" else "audio/wav"
                # saved copies are named after the song, and played in place (like the real server)
                head = {"Accept-Ranges": "bytes", "Content-Disposition": disposition("inline", folder, name, audio.suffix, q)}
                span = byte_range(self.headers.get("Range"), len(data))
                if span == "unsatisfiable":
                    return self.send(416, b"", mime, dict(head, **{"Content-Range": "bytes */%d" % len(data)}))
                if span:
                    start, end = span
                    return self.send(206, data[start:end + 1], mime, dict(head, **{"Content-Range": "bytes %d-%d/%d" % (start, end, len(data))}))
                return self.send(200, data, mime, head)
            self.error(404, "not found")

        # ---------------------------------------------------------- POST
        def route_post(self):
            path, q = urlparse(self.path).path, self.query()
            if path == "/synth":
                raw = self.body()
                mock.requests.append({"path": "/synth", "body": raw.decode("utf-8", "replace")})
                req, error = parse_request(raw, mock)
                if error:
                    return self.error(400, error)
                job = mock.new_job("synth", req)
                mock.work.put(job)
                return self.send(200, {"id": job["id"]})
            if path == "/lab/writer":   # HERESY 1168: the notebook's ops (put, export, import…) as the lab answers them
                raw = self.body()
                mock.requests.append({"path": "/lab/writer", "body": raw.decode("utf-8", "replace")[:2000]})
                try:
                    data = json.loads(raw or b"{}")
                except ValueError:
                    return self.error(400, "bad JSON")
                return self.writer(lambda w: w.post(mock.writer_kit, data, q.get("scope", "")))
            if path == "/lab/trash":   # HERESY 1168: the lab's trash as the page sees it; nothing is moved here
                raw = self.body()
                mock.requests.append({"path": "/lab/trash", "body": raw.decode("utf-8", "replace")})
                try:
                    req = json.loads(raw or b"{}")
                except ValueError:
                    return self.error(400, "bad JSON")
                if req.get("op") == "move":
                    return self.send(200, {"moved": [n for n in req.get("names") or [] if mock.name_ok(n)], "locked": []})
                return self.send(200, {"restored": [], "emptied": []})
            if path == "/transcribe" and not mock.args.no_transcriber:
                return self.transcribe()
            if path == "/settings":
                return self.post_settings()
            if path == "/unload":
                mock.requests.append({"path": "/unload"})
                applied, box = mock.run_between_jobs(mock.unload_idle)
                return self.send(200, {"applied": applied, "freed_mb": round(box.get("value", 0) / mock.MB) if applied else 0})
            if path == "/job":
                with mock.jobs_lock:
                    job = mock.jobs.get(q.get("id", ""))
                if not job:
                    return self.error(404, "job not found")
                if "cancel" in q:
                    job["cancel"] = True
                    mock.log("[Server] Cancel requested for job %s" % job["id"])
                return self.send(200, {"status": job["status"]})
            if path in ("/library/update", "/library/delete") and not mock.args.no_outputs:
                return self.post_library(path, q)
            if path == "/mock/clear":
                mock.requests.clear()
                return self.send(200, {"cleared": True})
            if path == "/mock/flags":
                flags = json.loads(self.body() or b"{}")
                if isinstance(flags.get("transcriber"), bool):
                    mock.args.no_transcriber = not flags["transcriber"]
                if isinstance(flags.get("outputs"), bool):
                    mock.args.no_outputs = not flags["outputs"]
                if isinstance(flags.get("peaks"), bool):
                    mock.peaks_on = flags["peaks"]
                return self.send(200, {"transcriber": not mock.args.no_transcriber, "outputs": not mock.args.no_outputs})
            if path.startswith("/fakechat-"):
                return self.fake_chat_post(path)
            self.error(404, "not found")

        def transcribe(self):
            raw = self.body()
            ctype = self.headers.get("Content-Type", "")
            if not ctype.startswith("multipart/form-data"):
                return self.error(400, "multipart audio part required")
            msg = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
                b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + raw)
            fields = {}
            for part in msg.iter_parts():
                name = part.get_param("name", header="content-disposition")
                fields[name] = (part.get_filename(), part.get_payload(decode=True) or b"")
            mock.requests.append({"path": "/transcribe", "fields": sorted(fields),
                                  "filename": fields.get("audio", (None,))[0],
                                  "bytes": len(fields.get("audio", (None, b""))[1])})
            if "audio" not in fields:
                return self.error(400, "multipart audio part required")
            seconds = wav_seconds(fields["audio"][1])
            if seconds is None:
                return self.error(400, "cannot decode audio")
            job = mock.new_job("transcribe", {"seconds": seconds, "melody_only": "melody_only" in fields})
            mock.work.put(job)
            return self.send(200, {"id": job["id"]})

        def settings_json(self, extra=None):
            out = dict(mock.settings, models=mock.models, max_seq_full=24576)
            out.update(extra or {})
            return out

        def post_settings(self):
            raw = self.body()
            mock.requests.append({"path": "/settings", "body": raw.decode("utf-8", "replace")})
            try:
                body = json.loads(raw or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
            except ValueError:
                return self.error(400, "invalid JSON")
            change = {}                 # only the posted fields
            if isinstance(body.get("model"), str):
                if body["model"] not in mock.models:
                    return self.error(400, "unknown model")
                change["model"] = body["model"]
            if isinstance(body.get("keep_loaded"), bool):
                change["keep_loaded"] = body["keep_loaded"]
            if isinstance(body.get("max_seq"), int) and not isinstance(body.get("max_seq"), bool):
                n = body["max_seq"]
                if not (n == 0 or 4096 <= n <= 24576):
                    return self.error(400, "context must be 0 (whole) or between 4096 and 24576")
                change["max_seq"] = n
            if isinstance(body.get("vae_core"), int) and not isinstance(body.get("vae_core"), bool):
                n = body["vae_core"]
                if not 64 <= n <= 4096:
                    return self.error(400, "VAE tile frames must be between 64 and 4096")
                change["vae_core"] = n

            def apply():
                # merged here, on the worker, when it runs: two saves queued behind one render both land
                old = mock.settings
                nxt = dict(old, **change)
                if nxt["model"] != old["model"]:
                    mock.log("[Server] Backbone now %s (models/YuE2-3B-%s.gguf)" % (nxt["model"], nxt["model"]))
                    mock.unload_idle()
                if not nxt["keep_loaded"]:
                    mock.unload_idle()
                if nxt["max_seq"] != old["max_seq"]:
                    mock.log("[Server] Context now %d rows" % (nxt["max_seq"] or 24576))
                mock.settings = nxt
                return nxt
            applied, box = mock.run_between_jobs(apply)
            now = box.get("value") or dict(mock.settings, **change)    # still queued behind a render: what it will be
            return self.send(200, dict(self.settings_json(), **now, applied=applied))

        def post_library(self, path, q):
            name = q.get("name", "")
            if not mock.name_ok(name):
                return self.error(404, "no such take")
            folder = mock.outputs / name
            with mock.library_lock:
                if path == "/library/delete":
                    shutil.rmtree(folder)
                    return self.send(200, {"deleted": name})
                try:
                    change = json.loads(self.body() or b"{}")
                except ValueError:
                    return self.error(400, "invalid JSON")
                meta = json.loads((folder / "meta.json").read_text())
                if isinstance(change.get("title"), str):
                    meta["title"] = change["title"]
                if isinstance(change.get("favorite"), bool):
                    meta["favorite"] = change["favorite"]
                write_atomic(folder / "meta.json", json.dumps(meta, indent=2))
            return self.send(200, mock.entry(name))

        # ------------------------------------------------ fake chat server
        def fake_chat_get(self, path):
            m = re.match(r"^/fakechat-(loaded|none|plain)(/.*)$", path)
            if not m:
                return self.error(404, "not found")
            mode, rest = m.groups()
            if rest == "/v1/models":
                return self.send(200, {"data": [{"id": "model-a"}, {"id": "model-b"}]})
            if rest == "/api/v0/models" and mode != "plain":
                state = "loaded" if mode == "loaded" else "not-loaded"
                return self.send(200, {"data": [{"id": "model-a", "state": "not-loaded"}, {"id": "model-b", "state": state}]})
            self.error(404, "not found")

        def fake_chat_post(self, path):
            m = re.match(r"^/fakechat-(loaded|none|plain)/v1/chat/completions$", path)
            if not m:
                return self.error(404, "not found")
            body = json.loads(self.body() or b"{}")
            mock.requests.append({"path": path, "model": body.get("model"), "json_schema": "response_format" in body,
                                  "roles": [x.get("role") for x in body.get("messages", [])]})
            if "response_format" in body:
                return self.error(400, "response_format not supported")
            if (body.get("max_tokens") or 0) <= 8:
                text = "OK"
            else:
                text = json.dumps({"title": "Ridge Road",
                                   "style": "English, dark country, baritone male voice, fiddle, banjo, half-time groove, 86 BPM",
                                   "lyrics": "[Verse]\nTruck won't start till midnight\nBelt clicks on the empty seat\n"
                                             "[Chorus]\nRidin' where the ridge road goes\nCan't outrun what the passenger knows",
                                   # HERESY 1167: the Writer room reads the notes and the style as tags too
                                   "notes": "A night drive with somebody gone in the passenger seat.",
                                   "style_tags": "dark country, baritone male, fiddle, banjo, half-time, 86 BPM"})
            return self.send(200, {"choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
                                   "usage": {"completion_tokens": 42}})

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Stand-in for yue-server's API (no engine, no GPU).")
    parser.add_argument("--port", type=int, default=41869, help="0 picks any free port (default 41869)")
    parser.add_argument("--outputs", help="library folder, under tmp/ (default tmp/mock-outputs)")
    parser.add_argument("--reset", action="store_true", help="empty the library folder first")
    parser.add_argument("--demo", type=int, default=3, help="takes to create when the library is empty (default 3)")
    parser.add_argument("--speed", type=float, default=1.0, help="run faster (2 = half the time)")
    parser.add_argument("--seconds", type=float, default=5.0, help="length of each mock take (default 5)")
    parser.add_argument("--max-batch", type=int, default=4)
    parser.add_argument("--vaes", default="standard,legacy,blend")
    parser.add_argument("--no-transcriber", action="store_true")
    parser.add_argument("--no-outputs", action="store_true", help="no library, like a server started without --outputs")
    parser.add_argument("--no-sliders", action="store_true")
    parser.add_argument("--no-gpu", action="store_true", help="/hardware lists no GPU, like a CPU-only run")
    parser.add_argument("--quiet", action="store_true", help="do not echo the log lines")
    parser.add_argument("--props", help="a /props saved from a real server (curl .../props > tmp/x.json): its LoRAs, "
                                        "sliders, sources and version stand in for the made-up ones (for screenshots)")
    parser.add_argument("--gpu-name", default="Mock GPU (32 GB)", help="the GPU name /hardware reports")
    args = parser.parse_args()

    mock = Mock(args)
    if args.props:
        global LORAS, SOURCES
        real = json.loads(Path(args.props).read_text(encoding="utf-8"))
        LORAS, SOURCES = real.get("loras", LORAS), real.get("sources", SOURCES)
        if not args.no_sliders and real.get("sliders"):
            mock.sliders = [(x["id"], x["label"], x.get("description", "")) for x in real["sliders"]]
        mock.version = real.get("version", mock.version)
    outputs = mock.outputs
    if TMP.resolve() not in outputs.parents:
        sys.exit(R + "refusing: --outputs must be a folder under " + str(TMP) + X)
    if args.reset and outputs.exists():
        shutil.rmtree(outputs)
    outputs.mkdir(parents=True, exist_ok=True)
    started = time.time()
    if not args.no_outputs and args.demo and not mock.library():
        mock.demo(args.demo)

    server = LoopbackServer(("127.0.0.1", args.port), make_handler(mock))
    server.daemon_threads = True
    port = server.server_address[1]
    mock.log("[Server] yue-server mock")
    mock.log("[Server] Listening on http://127.0.0.1:%d" % port)
    print("%smock yue-server%s  %shttp://127.0.0.1:%d%s" % (B, X, G, port, X), flush=True)
    print("  library     %s%s%s  %d takes%s" % (C, shown(outputs), X, len(mock.library()),
                                                "  (off: --no-outputs)" if args.no_outputs else ""), flush=True)
    print("  page        %s%s%s  %s" % (C, shown(PAGE), X, "ok" if PAGE.is_file() else Y + "missing: run ./build.sh" + X), flush=True)
    print("  runs        %.1f s each at speed %.1f, %s s takes, max batch %d, VAEs %s%s" %
          (3.4 / args.speed, args.speed, args.seconds, args.max_batch, args.vaes,
           "" if not args.no_transcriber else ", no transcriber"), flush=True)
    print("  %sready in %.1f s; Ctrl-C to stop%s" % (D, time.time() - started, X), flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("%sstopped%s after %.0f s, %d requests recorded" % (D, X, time.time() - started, len(mock.requests)), flush=True)


if __name__ == "__main__":
    main()
