"""HERESY 2865 (Viktor 19.11.2026: «Делаем оба как переключаемые опции прямо в миксере DAW. Что человеку по душе, то и выберет»): the DAW's
second way to play, «Forge». The mix the page holds (ruach.mix/1, the value it sends to /daw/mix) is rendered here by the bounce's own code
(daw_mix.render) in pieces of PIECE seconds from where the playhead is, and the page plays them through one <audio> as a 24-bit WAV of the
song's whole length with Range, as the players play a lifted take (lift_stream.py, HERESY 2837): no AudioContext between the sound and the
speakers.

Measured before it was built (on the Studio's own processor, a set of eight
stems and the rest, 4:30 at 48 kHz): a neutral mix renders ×175 real time whole; a busy one (three EQ bands, a compressor, both sends, width
and pan on every strip, the master's EQ and limiter) only ×3.5 whole (78 s for the song), but ×10.7 in stretches of 10 s. So never the whole
song before the first sound: pieces, each with PRE seconds before it rendered and thrown away, so its EQs, compressors, gates, room and delay
start in the state the whole render would have them in; two worker processes render the piece asked for first and the next ones after it.

What depends on the time of the song is done here, over the piece's own window, exactly as daw_mix does it over the whole: a lane's channel
and shift (lane_of), the silence drawn on it (cut_envelope), the stretches laid along it (place), its automation (its points cut to the
window), the song's fade. The rest of the strip, the groups, buses, returns and the master's chain are daw_mix.render itself. Two things
differ from the bounce, both as the page's own live way plays: no lowering of a mix that peaks above −0.3 dBFS (a piece cannot know the
song's peak; what passes full scale is cut flat there, as the speakers would), and a change of a knob heard from the next piece rendered.

Each piece also brings its meters, a 100 ms block a key (each lane, the returns, the buses, the master): the peak and the sum of squares of
both sides, and for the master its K-weighted power (BS.1770, as the page's loudness meter), its correlation term and its peak, so the
console's meters and loudness move in this way too. The page's Mono is rendered here; its Dim is the element's volume; its reference
(HERESY 1755, 2315) is played in the mix's place at its matched gain when it is on.

    POST /daw/play {id?, name, set, mix, versions, ref: {on, spec, gain}, mono, at}  -> {id, rev, url, seconds, rate, channels, piece}
    GET  /daw/play.wav?id=&rev=     the mix as a 24-bit WAV of the song's length, with Range; one piece an answer at most
    GET  /daw/play/meters?id=&rev=&from=&to=   the meters of the pieces already made between from and to (seconds)
    POST /daw/play/stop {id}        the session let go

    python3 daw_play.py --worker    a renderer: one JSON line in (a piece asked), one JSON line and the piece's float32 samples out
"""
from __future__ import annotations

import collections
import copy
import hashlib
import json
import math
import os
import queue
import struct
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import numpy as np

import winx   # HERESY 2934: nice where the system has it

PIECE = 5.0                                   # seconds a piece; a multiple of the meters' 100 ms block
PRE = 3.0                                     # seconds rendered before a piece and thrown away: the room's longest preset rings 2.4 s
XF = 0.010                                    # seconds a piece runs on past its end, crossfaded into the next one's start
POST = 0.25                                   # seconds rendered after that and thrown away: daw_mix fades a return's last 50 ms (_tail_fade)
                                              # and the master's limiter looks 3 ms ahead; neither may see the window's end as the song's
BLOCK = 0.1
WORKERS = 2
KEEP_PIECES = 120                             # pieces kept in RAM over all sessions (about 2 MB each at 48 kHz stereo)
KEEP_SESSIONS = 4
IDLE_S = 900
WAIT_S = 90                                   # how long an answer waits for its piece
FS = 8388607
HERE = Path(__file__).resolve().parent


# --------------------------------------------------------------------------------------------------------------------------------------------
# the worker's side: its own process, so a busy render never holds the lab's threads

def _window(spec, path, i0, n):
    """[channels, n] of the song's frames i0 … i0+n of a file, zero outside the song and the file (daw_job's fit, on a window)"""
    import daw
    ch, total = spec["ch"], spec["frames"]
    out = np.zeros((ch, n))
    a, b = max(0, i0), min(total, i0 + n)
    if b > a:
        out[:, a - i0:b - i0] = daw._slice(path, a, b - a, ch).T
    return out


def _raw(spec, name, i0, n):
    """a strip's sound over a window, as the bounce reads it: its version's file, or for the rest the source less the set's own parts"""
    import daw
    if name == daw.REST:
        x = _window(spec, spec["source"], i0, n)
        for s in spec["strips"]:
            if not s["added"]:                         # HERESY 1929: an added strip is no part of the set
                x -= _window(spec, s["own"], i0, n)
        return x
    return _window(spec, spec["paths"][name], i0, n)


def _lane(spec, name, st, i0, n, rate, path=""):
    """daw_mix.lane_of over a window: the lane's channel, then its shift (later by silence, earlier by its start dropped), the song's length kept;
    `path` (HERESY 2948): another version of the stem, a comped stretch's, read the same way"""
    k = round(float(st.get("offset_s") or 0) * rate)
    y = _window(spec, spec["alts"][name][path], i0 - k, n) if path else _raw(spec, name, i0 - k, n)
    c = st.get("chan", "st")
    if c != "st" and y.shape[0] > 1:
        m = y[0] if c == "l" else y[1] if c == "r" else 0.5 * (y[0] + y[1])
        y = np.stack([m, m])
    return y


def _cuts(i0, n, total, rate, ranges):
    """daw_mix.cut_envelope's values for the frames i0 … i0+n of the song: the same cuts merged the same way, each edge its raised cosine"""
    env, seconds, merged = np.ones(n), total / rate, []
    for a, b, fall, rise in sorted((max(0.0, a), min(seconds, b), f, r) for a, b, f, r in ranges if a < seconds and b > 0):
        if merged and a <= merged[-1][1]:
            if b > merged[-1][1]:
                merged[-1][1], merged[-1][3] = b, rise
        elif b > a:
            merged.append([a, b, fall, rise])
    for a, b, fall, rise in merged:
        start, end = round(a * rate), min(total, round(b * rate))
        if end <= start:
            continue
        m, fn, rn = end - start, (max(1, round(fall * rate)) if fall > 0 else 0), (max(1, round(rise * rate)) if rise > 0 else 0)
        if fn + rn > m:
            fn, rn = m * fn // (fn + rn), m * rn // (fn + rn)
        j0, j1 = max(start, i0), min(end, i0 + n)
        if j1 <= j0:
            continue
        u = np.arange(j0, j1) - start
        seg = np.zeros(j1 - j0)
        if fn:
            f = u < fn
            seg[f] = 0.5 + 0.5 * np.cos(np.pi * (u[f] + 0.5) / fn)
        if rn:
            r = u >= m - rn
            seg[r] = 0.5 + 0.5 * np.cos(np.pi * ((rn - 1 - (u[r] - (m - rn))) + 0.5) / rn)
        env[j0 - i0:j1 - i0] = seg
    return env


def _place(y, lane_at, i0, n, total, rate, edits, edge):
    """daw_mix.place over a window: each laid stretch read from the lane as it came (lane_at(from, frames)), crossfaded in at its «to»;
    a comped one (HERESY 2948) from its own version of the stem (lane_at(from, frames, path))"""
    k0 = max(1, round(edge * rate))
    for e in edits:
        op, a, b, to = e[:4]
        path = e[4] if len(e) > 4 else ""
        e0 = round(a * rate)
        m0 = min(total, round(b * rate)) - e0
        if m0 <= 0:
            continue
        if op == "move":
            y = y * _cuts(i0, n, total, rate, [(a, b, edge, edge)])[None, :]
        d0 = round(to * rate)
        m = min(m0, total - d0)
        if m <= 0:
            continue
        j0, j1 = max(d0, i0), min(d0 + m, i0 + n)
        if j1 <= j0:
            continue
        u = np.arange(j0 - d0, j1 - d0)
        w = np.ones(len(u))
        k = min(k0, m // 2)
        if k:
            ramp = 0.5 - 0.5 * np.cos(np.pi * (np.arange(k) + 0.5) / k)
            lo, hi = u < k, u >= m - k
            w[lo] = ramp[u[lo]]
            w[hi] = ramp[::-1][u[hi] - (m - k)]
        y = y.copy()
        y[:, j0 - i0:j1 - i0] = y[:, j0 - i0:j1 - i0] * (1 - w) + (lane_at(e0 + (j0 - d0), j1 - j0, path) if path else lane_at(e0 + (j0 - d0), j1 - j0)) * w
    return y


def _cut_points(pts, t0, t1):
    """a line's points (laid out, in time order) for the window t0 … t1 only, its times from the window's start: its value at both ends, and
    every point between them"""
    ts, vs = [p[0] for p in pts], [p[1] for p in pts]
    out = [[0.0, float(np.interp(t0, ts, vs))]]
    out += [[t - t0, v] for t, v in pts if t0 < t < t1]
    out.append([t1 - t0, float(np.interp(t1, ts, vs))])
    if len(out) > 2000:                               # daw_mix.MAX_AUTO: a line this dense in one window keeps every n-th point and its ends
        out = out[:1] + out[1:-1][::int(math.ceil((len(out) - 2) / 1998))] + out[-1:]
    return out


def _fade(i0, n, total, rate, fade_in, fade_out, end):
    """daw_mix.fade_envelope's values for the frames i0 … i0+n of the song"""
    t = (i0 + np.arange(n)) / rate
    e = total / rate if end is None else min(float(end), total / rate)
    d = np.zeros(n)
    if fade_in > 0:
        d = np.minimum(d, np.where(t < fade_in, -60.0 * (1 - t / fade_in), 0.0))
    if fade_out > 0:
        d = np.minimum(d, np.where(t > e - fade_out, -60.0 * (t - (e - fade_out)) / fade_out, 0.0))
    env = 10 ** (d / 20)
    env[t >= e] = 0.0
    return env


def _meters(x, rate, b0, nb, kw=None):
    """per 100 ms block of x (the kept frames, block-aligned): the peak and the sum of squares of each side; with kw (the K-weighted power a
    frame) the master's blocks, the sides' product and the peak too"""
    k = round(BLOCK * rate)
    y = x[:, :nb * k]
    if y.shape[0] == 1:
        y = np.repeat(y, 2, axis=0)
    y = y[:2].reshape(2, nb, k)
    o = {"pk": np.round(np.abs(y).max(axis=2).T, 6).tolist(), "ss": np.round((y * y).sum(axis=2).T, 6).tolist(), "n": k}
    if kw is not None:
        o["kw"] = np.round(kw[:nb * k].reshape(nb, k).mean(axis=1), 9).tolist()
        o["xy"] = np.round((y[0] * y[1]).sum(axis=1), 6).tolist()
    return o


def render_piece(spec, k):
    """the piece k of the session's mix: (float32 [channels, frames] of [start, end + XF), its meters)"""
    import daw
    import daw_mix
    from plenio_core.audio import loudness as pl
    rate, total, ch = spec["rate"], spec["frames"], spec["ch"]
    pf = round(PIECE * rate)
    s, e = k * pf, min(total, (k + 1) * pf)
    if s >= total:
        raise ValueError("past the song's end")
    a = max(0, s - round(PRE * rate))
    b = min(total, e + round(XF * rate))
    c = min(total, e + round((XF + POST) * rate))    # rendered to c, kept to b
    n = c - a
    names = spec["names"]
    v = daw_mix.parse(spec["mix"], names, rate)        # the mix as the bounce reads it: its points laid out, its cuts and edits checked
    raw = copy.deepcopy(spec["mix"])
    strips = raw.setdefault("strips", {})
    t0, t1 = a / rate, c / rate
    signals = []
    for name in names:
        st = v["strips"].get(name, daw_mix.NEUTRAL)
        lane_at = lambda i, m, path="", name=name, st=st: _lane(spec, name, st, i, m, rate, path)
        y = lane_at(a, n)
        if st["muted"]:
            y = y * _cuts(a, n, total, rate, st["muted"])[None, :]
        if st.get("edits"):
            y = _place(y, lane_at, a, n, total, rate, st["edits"], daw_mix.EDGE_SECONDS)
        signals.append((name, y))
        if name in strips:                             # what is done here leaves the strip; its lines cut to the window
            r = strips[name]
            for key in ("muted", "edits"):
                r.pop(key, None)
            r.pop("offset_s", None)
            r.pop("chan", None)
            r["auto"] = _cut_points(st["auto"], t0, t1) if st["auto"] else []
            r["autos"] = {key: _cut_points(p, t0, t1) for key, p in (st.get("autos") or {}).items() if p}
    ms = v["master"]
    for key in ("fade_in_s", "fade_out_s", "end_s"):
        (raw.get("master") or {}).pop(key, None)
    daw_mix.CEILING_DBFS = 600.0                        # this process plays: no lowering of a peak it cannot see whole (the docstring)
    out, report, printed = daw_mix.render(rate, signals, raw, keep=True)
    if ms["fade_in_s"] or ms["fade_out_s"] or ms["end_s"] is not None:
        out = out * _fade(a, n, total, rate, ms["fade_in_s"], ms["fade_out_s"], ms["end_s"])[None, :]
    i, j = s - a, e - a
    nb = (e - s) // round(BLOCK * rate)
    kw = pl._weighted_power(out[:2] if out.shape[0] > 1 else np.repeat(out, 2, axis=0), rate, pl.no_cancel)
    meters = {"*": _meters(out[:, i:j], rate, s, nb, kw[i:j])}
    for key, w in printed.items():
        meters["~" + key[7:] if key.startswith("return-") else "%" + key[4:] if key.startswith("bus-") else key] = _meters(w[:, i:j], rate, s, nb)
    mon = out
    ref = spec.get("ref") or {}
    if ref.get("path"):                                # HERESY 1755: the reference in the mix's place, as loud as matched
        mon = _window(dict(spec, frames=total), ref["path"], a, n) * float(ref.get("gain") or 1.0)
    if spec.get("mono") and mon.shape[0] > 1:          # HERESY 1536: the monitor's Mono, after the meters
        mon = np.repeat(mon.mean(axis=0, keepdims=True), mon.shape[0], axis=0)
    keep_to = b - a
    piece = np.ascontiguousarray(mon[:, i:keep_to], dtype=np.float32)
    return piece, {"k": k, "start": s, "frames": e - s, "tail": keep_to - j, "b0": s // round(BLOCK * rate), "blocks": nb, "m": meters,
                   "peak_db": report.get("peak_db")}


def worker_main():
    sys.path.insert(0, str(HERE))
    import daw, daw_mix  # noqa: F401   imported before the first piece is asked
    from plenio_core.audio import loudness  # noqa: F401
    out = sys.stdout.buffer
    for line in sys.stdin.buffer:
        try:
            req = json.loads(line)
            t = time.time()
            piece, said = render_piece(req["spec"], int(req["k"]))
            said["ms"] = round(1000 * (time.time() - t))
            data = piece.tobytes()
            said.update(ok=True, ch=piece.shape[0], bytes=len(data))
            out.write(json.dumps(said).encode() + b"\n")
            out.write(data)
        except Exception as e:                          # said to the lab, never a dead worker
            out.write(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"[:400]}).encode() + b"\n")
        out.flush()


# --------------------------------------------------------------------------------------------------------------------------------------------
# the lab's side

class _Worker:
    def __init__(self, python):
        self.python = python
        self.p = None

    def spawn(self):
        if self.p is None or self.p.poll() is not None:
            self.p = subprocess.Popen(winx.nice(5) + [self.python, str(HERE / "daw_play.py"), "--worker"], stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=str(HERE),
                                      env=dict(os.environ, CUDA_VISIBLE_DEVICES="", OMP_NUM_THREADS="4"))

    def ask(self, req):
        self.spawn()
        self.p.stdin.write(json.dumps(req).encode() + b"\n")
        self.p.stdin.flush()
        head = self.p.stdout.readline()
        if not head:
            self.p = None
            raise RuntimeError("the DAW's renderer ended")
        said = json.loads(head)
        if not said.get("ok"):
            raise ValueError(said.get("error") or "the piece was not made")
        data = self.p.stdout.read(said["bytes"])
        return said, np.frombuffer(data, dtype=np.float32).reshape(said["ch"], -1)


class _Job:
    __slots__ = ("ev", "said", "pcm", "error", "at")

    def __init__(self):
        self.ev, self.said, self.pcm, self.error, self.at = threading.Event(), None, None, None, time.time()


LOCK = threading.Lock()
SESSIONS = collections.OrderedDict()          # id -> {id, rev, key, spec, hash, seconds, frames, rate, ch, last}
PIECES = collections.OrderedDict()            # (key, k) -> _Job
TODO = queue.PriorityQueue()
_SEQ = [0]
_STARTED = []


def _start(python):
    if _STARTED:
        return
    _STARTED.append(True)
    for _ in range(WORKERS):
        threading.Thread(target=_run, args=(_Worker(python),), daemon=True, name="daw-play").start()


def _run(w):
    try:
        w.spawn()                                     # started with the first play, so its imports are behind it when a piece is asked
    except OSError:
        pass
    while True:
        prio, _seq, key, k, spec, job = TODO.get()
        if job.ev.is_set():
            continue
        if prio > 0 and not _current(key):            # a piece ahead for a mix since changed: left, made again if it is ever asked
            job.error = "skipped: the mix changed"
            job.ev.set()
            continue
        try:
            job.said, job.pcm = w.ask({"key": key, "k": k, "spec": spec})
        except Exception as e:                        # said to whoever waits for it
            job.error = str(e) or type(e).__name__
        job.ev.set()


def _current(key):
    sid, _, rev = key.partition(":")
    with LOCK:
        sess = SESSIONS.get(sid)
        return bool(sess) and str(sess["rev"]) == rev


def _want(sess, k, prio):
    """the piece k of a session's current mix: made already, being made, or put in line (prio 0 first)"""
    key = (sess["key"], k)
    with LOCK:
        job = PIECES.get(key)
        if job is not None and job.error and job.ev.is_set():
            job = None                                # a failed piece is asked again
        if job is None:
            job = PIECES[key] = _Job()
            _SEQ[0] += 1
            TODO.put((prio, _SEQ[0], sess["key"], k, sess["spec"], job))
            while len(PIECES) > KEEP_PIECES:
                old_key, old = next(iter(PIECES.items()))
                if not old.ev.is_set():
                    break
                PIECES.pop(old_key)
        else:
            PIECES.move_to_end(key)
        return job


def _pieces(sess):
    return int(math.ceil(sess["frames"] / round(PIECE * sess["rate"])))


def _ahead(sess, k, n=4):
    for j in range(k + 1, min(_pieces(sess), k + 1 + n)):
        _want(sess, j, 1)


def _drop_idle():
    now = time.time()
    with LOCK:
        for sid in [s for s, x in SESSIONS.items() if now - x["last"] > IDLE_S]:
            SESSIONS.pop(sid, None)
        while len(SESSIONS) > KEEP_SESSIONS:
            SESSIONS.popitem(last=False)


def open_session(d, info, body, refs_path, python):
    """POST /daw/play: the session's mix set (a new rev when it changed) and its first pieces asked from `at`"""
    import daw
    import daw_mix
    import soundfile as sf
    _start(python)
    _drop_idle()
    mix = body.get("mix")
    if not isinstance(mix, dict) or mix.get("schema") != daw_mix.SCHEMA:
        raise ValueError('the mix is a ruach.mix/1 value: {"schema": "ruach.mix/1", "strips": {…}}')
    rate, ch = int(info["rate"]), int(info["channels"])
    names = [s["name"] for s in info["strips"]] + [daw.REST]
    try:
        daw_mix.parse(mix, names, rate)
    except Exception as e:                              # a typo or a value out of range: said now
        raise ValueError(str(e))
    versions = {k: str(v) for k, v in (body.get("versions") or {}).items() if isinstance(k, str)}
    paths, strips = {}, []
    for s in info["strips"]:
        p = versions.get(s["name"]) or s["path"]
        if p not in [x["path"] for x in s["versions"]]:
            raise ValueError(f"{p} is not a version of {s['name']}")
        paths[s["name"]] = str(daw._inside(d, p))
        strips.append({"name": s["name"], "own": str(daw._inside(d, s["path"])), "added": bool(s.get("added"))})
    alts = {}                                           # HERESY 2948: the versions the comped stretches name, each a version of its stem
    for n, ps in daw_mix.comp_paths(mix).items():
        s = next((x for x in info["strips"] if x["name"] == n), None)
        if s is None:
            raise ValueError(f"a stretch comped on {n}, which is no stem of this set")
        for p in ps:
            if p not in [x["path"] for x in s["versions"]]:
                raise ValueError(f"{p} is not a version of {n}")
            alts.setdefault(n, {})[p] = str(daw._inside(d, p))
    frames = sf.info(str(daw._inside(d, info["source"]))).frames
    ref = body.get("ref") or {}
    ref_said = {}
    if ref.get("on"):
        g = float(ref.get("gain") or 1.0)
        if not (math.isfinite(g) and 0 < g <= 16):
            raise ValueError("ref gain: 0 … 16")
        rp = refs_path(ref.get("spec")) if ref.get("spec") else daw._inside(d, info["source"])
        if sf.info(str(rp)).samplerate != rate:
            raise ValueError("the reference's rate is not the mix's: hear it in the Live way")
        ref_said = {"path": str(rp), "gain": g}
    spec = {"rate": rate, "ch": ch, "frames": frames, "names": names, "paths": paths, "strips": strips, "alts": alts,
            "source": str(daw._inside(d, info["source"])), "mix": mix, "ref": ref_said, "mono": bool(body.get("mono"))}
    h = hashlib.sha1(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:16]
    sid = str(body.get("id") or "")
    with LOCK:
        sess = SESSIONS.get(sid) if sid else None
        if sess is None:
            sid = uuid.uuid4().hex[:12]
            sess = SESSIONS[sid] = {"id": sid, "rev": 0, "hash": ""}
        if sess["hash"] != h:
            sess.update(rev=sess["rev"] + 1, hash=h, spec=spec, key=f"{sid}:{sess['rev'] + 1}", frames=frames, rate=rate, ch=ch)
            olds = sess.setdefault("specs", collections.OrderedDict())   # the mixes before it, played on until the page swaps
            olds[sess["rev"]] = spec
            while len(olds) > 3:
                olds.popitem(last=False)
        sess["last"] = time.time()
        SESSIONS.move_to_end(sid)
    at = max(0.0, float(body.get("at") or 0))
    k = min(_pieces(sess) - 1, int(at // PIECE))
    _want(sess, k, 0)
    _ahead(sess, k, 2)
    return {"id": sid, "rev": sess["rev"], "url": f"/lab/daw/play.wav?id={sid}&rev={sess['rev']}", "seconds": round(frames / rate, 3),
            "rate": rate, "channels": ch, "piece": PIECE}


def close_session(sid):
    with LOCK:
        SESSIONS.pop(str(sid or ""), None)
    return {"ok": True}


def _session(sid, rev):
    with LOCK:
        sess = SESSIONS.get(str(sid or ""))
    if not sess:
        raise FileNotFoundError("no such DAW session (it lapsed): press play again")
    if str(rev) != str(sess["rev"]):                  # an older mix of this session: played on until the page swaps to the new one
        try:
            r = int(rev)
            spec = sess["specs"][r]
        except (ValueError, KeyError):
            raise FileNotFoundError("that mix is no longer kept: press play again")
        return dict(sess, rev=r, key=f"{sess['id']}:{r}", spec=spec), False
    sess["last"] = time.time()
    return sess, True


def _pcm(sess, k, live, prio=0):
    with LOCK:
        job = PIECES.get((sess["key"], k))
    if job is None or (job.error and job.ev.is_set()):
        job = _want(sess, k, prio)
    if not job.ev.wait(WAIT_S):
        raise TimeoutError("the piece was not made in time")
    if job.error:
        raise ValueError(job.error)
    return job


def _int24(x):
    q = np.clip(np.rint(x.T.astype(np.float64) * 8388608.0), -FS, FS).astype("<i4")
    return np.ascontiguousarray(q).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()


def send_wav(h, sid, rev, span):
    """GET /daw/play.wav: the session's mix as a 24-bit WAV of the song's length, the Range asked, at most to the end of its piece"""
    import lift_stream
    sess, live = _session(sid, rev)
    ch, rate, frames = sess["ch"], sess["rate"], sess["frames"]
    head = lift_stream.header(ch, rate, frames)
    fb, pf = ch * 3, round(PIECE * rate)
    total = len(head) + frames * fb
    part = span(h.headers.get("Range", ""), total)
    if part == "unsatisfiable":
        h.send_response(416)
        h.send_header("Content-Range", f"bytes */{total}")
        h.send_header("Content-Length", "0")
        h.end_headers()
        return
    start, end = part if part else (0, total - 1)
    f0 = max(0, start - len(head)) // fb
    k = min(_pieces(sess) - 1, f0 // pf)
    job = _pcm(sess, k, live)
    if live:
        _ahead(sess, k)
    end = min(end, len(head) + min(frames, (k + 1) * pf) * fb - 1)
    out = head[start:end + 1] if start < len(head) else b""
    d0, d1 = max(start, len(head)) - len(head), end + 1 - len(head)
    if d1 > d0:
        x = job.pcm[:, :job.said["frames"]].astype(np.float64)
        if k > 0:                                     # the seam: the piece before runs on XF past its end into this one's start
            with LOCK:
                prev = PIECES.get((sess["key"], k - 1))
            if prev is not None and prev.ev.is_set() and prev.pcm is not None and prev.said["tail"]:
                t = min(prev.said["tail"], x.shape[1])
                w = 0.5 - 0.5 * np.cos(np.pi * (np.arange(t) + 0.5) / t)
                x = x.copy()
                x[:, :t] = prev.pcm[:, prev.said["frames"]:prev.said["frames"] + t] * (1 - w) + x[:, :t] * w
        body = _int24(x)
        base = k * pf * fb
        out += body[d0 - base:d1 - base]
    h.send_response(206)
    h.send_header("Content-Type", "audio/wav")
    h.send_header("Accept-Ranges", "bytes")
    h.send_header("Content-Range", f"bytes {start}-{end}/{total}")
    h.send_header("Content-Length", str(len(out)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    if h.command != "HEAD":
        try:
            h.wfile.write(out)
        except (BrokenPipeError, ConnectionResetError):
            pass                                      # the element moved on (a seek, a new mix)


def meters(sid, rev, t0, t1):
    """GET /daw/play/meters: the meters of the pieces made between t0 and t1 seconds (not waited for)"""
    sess, _live = _session(sid, rev)
    k0, k1 = max(0, int(float(t0) // PIECE)), min(_pieces(sess) - 1, int(float(t1) // PIECE))
    out = {}
    with LOCK:
        for k in range(k0, k1 + 1):
            job = PIECES.get((sess["key"], k))
            if job is not None and job.ev.is_set() and job.said:
                out[str(k)] = {"b0": job.said["b0"], "blocks": job.said["blocks"], "m": job.said["m"], "ms": job.said.get("ms")}
    return {"id": sess["id"], "rev": sess["rev"], "block": BLOCK, "piece": PIECE, "pieces": out}


if __name__ == "__main__" and "--worker" in sys.argv:
    worker_main()
