"""HERESY 1531 · the Refiner's mixer, its render (Viktor 18.10.2026: «Преврати твой DAW начаток в профессиональный миксер»).

The value ``ruach.mix/1`` is what the page's mixer holds and plays: every strip a channel of a console, in this order, the same
order the page's audio graph has, so what is heard while it is set is what is rendered here:

    the stem (its version) · the silence drawn on it (each cut's fall and rise its own, 1542) · trim and polarity · EQ (up to eight RBJ bands, Plenio's) ·
    compressor (Plenio's, linked feed-forward, 1 ms control) and its make-up · the fader · width (mid/side) ·
    pan (the Web Audio stereo panner's law) · mute and solo · the sends to the room and the delay, after the pan

Groups (1543) are a console's VCAs: no sound of their own, a group's fader adds its dB to each member's fader, its mute mutes them,
its solo solos them.

The room is Plenio's convolution reverb (the impulse the page plays is served from here, /daw/ir), the delay Plenio's feedback
delay with its low-pass in the loop; each return has its own level and mute. The master has its chain (1544): EQ, compressor and
Plenio's lookahead limiter (4× oversampled, a ceiling in dBTP), then its fader; then the song's fade in and out and its end (1756:
linear in dB from −60 dB and down to it, nothing after the end). A mix that peaks above
−0.3 dBFS is lowered to it and says by how much, as before; nothing else is done behind the user's back: no hidden normalising.

Unknown fields are refused, never ignored: a typo in a hand-edited value says so.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from plenio_core.audio import eq as peq
from plenio_core.audio.dynamics import Compressor, compress, limit, soft_knee_reduction_db
from plenio_core.audio.effects import DEFAULT_FEEDBACK, DEFAULT_LOWPASS_HZ, REVERB_PRESETS, delay as pdelay, impulse_response, reverb as preverb
from plenio_core.audio.stems import EDGE_SECONDS
from plenio_core.errors import PlenioUserError

SCHEMA = "ruach.mix/1"
REST = "rest"
CEILING_DBFS = -0.3
TAIL_FADE_SECONDS = 0.050
BAND_TYPES = ("peak", "low_shelf", "high_shelf", "highpass", "lowpass", "notch")
STRIP_KEYS = {"gain_db", "mute", "solo", "muted", "trim_db", "invert", "eq", "comp", "width", "pan", "reverb", "delay", "auto", "autos", "edits", "gate"}   # 1535: auto; 1559: autos; 1564: edits; 1760: gate
GATE_KEYS = {"on", "threshold_db", "ratio", "range_db", "attack_ms", "release_ms"}   # HERESY 1760: a downward expander
GATE_DEFAULT = {"on": True, "threshold_db": -50.0, "ratio": 4.0, "range_db": 40.0, "attack_ms": 2.0, "release_ms": 150.0}
MAX_EDITS = 64
AUTOS = {"pan": (-1.0, 1.0), "width": (0.0, 2.0), "reverb": (0.0, 1.0), "delay": (0.0, 1.0)}   # HERESY 1559: what else a lane draws over time
MAX_AUTO = 2000
MAX_FADE = 30.0                                       # HERESY 1542: a cut's fall or rise, seconds
COMP_KEYS = {"on", "threshold_db", "ratio", "knee_db", "attack_ms", "release_ms", "makeup_db", "key", "mix"}   # 1537: key; 1759: mix
EQ_KEYS = {"on", "bands"}
BAND_KEYS = {"id", "enabled", "type", "frequency_hz", "gain_db", "q"}
REVERB_KEYS = {"preset", "return_db", "mute", "predelay_ms", "lowcut_hz", "highcut_hz"}   # 1762: pre-delay, cuts
DELAY_KEYS = {"time_ms", "feedback", "lowpass_hz", "return_db", "mute", "lowcut_hz", "highcut_hz"}   # 1762: cuts
MASTER_KEYS = {"gain_db", "eq", "comp", "limit", "fade_in_s", "fade_out_s", "end_s"}     # 1544: the master's chain; 1756: the song's fade
FADE_FLOOR_DB = -60.0                                 # HERESY 1756: where a fade starts and ends
MAX_FADE_S = 120.0
LIMIT_KEYS = {"on", "ceiling_db", "drive_db", "release_ms"}
LOOKAHEAD_MS = 3.0
GROUP_KEYS = {"id", "name", "members", "gain_db", "mute", "solo"}   # HERESY 1543
MAX_GROUPS = 16
COMP_DEFAULT = {"on": True, "threshold_db": -18.0, "ratio": 2.0, "knee_db": 6.0, "attack_ms": 10.0, "release_ms": 120.0, "makeup_db": 0.0, "mix": 1.0}


def _num(v: Any, name: str, lo: float, hi: float) -> float:
    if isinstance(v, bool):
        raise PlenioUserError(f"{name} must be a number, not true or false.")
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise PlenioUserError(f"{name} must be a number.") from None
    if not math.isfinite(x) or not lo <= x <= hi:
        raise PlenioUserError(f"{name} must be between {lo:g} and {hi:g}, got {x:g}.")
    return x


def _flag(v: Any, name: str) -> bool:
    if not isinstance(v, bool):
        raise PlenioUserError(f"{name} must be true or false.")
    return v


def _known(d: Any, keys: set[str], where: str) -> dict:
    if not isinstance(d, dict):
        raise PlenioUserError(f"{where} must be an object.")
    extra = sorted(set(d) - keys)
    if extra:
        raise PlenioUserError(f"{where}: unknown fields {extra}.")
    return d


def comp_of(raw: Any, where: str) -> dict | None:
    if raw is None:
        return None
    c = dict(COMP_DEFAULT, **_known(raw, COMP_KEYS, where + " comp"))
    out = {"on": _flag(c["on"], where + " comp on"),
           "threshold_db": _num(c["threshold_db"], where + " threshold_db", -60, 0),
           "ratio": _num(c["ratio"], where + " ratio", 1, 10),
           "knee_db": _num(c["knee_db"], where + " knee_db", 0, 24),
           "attack_ms": _num(c["attack_ms"], where + " attack_ms", 1, 200),
           "release_ms": _num(c["release_ms"], where + " release_ms", 10, 2000),
           "makeup_db": _num(c["makeup_db"], where + " makeup_db", 0, 24),
           "mix": _num(c["mix"], where + " mix", 0, 1)}   # HERESY 1759: parallel compression, the compressed sound's share against the dry
    key = c.get("key", "") or ""                      # HERESY 1537: another strip it listens to; checked against the set in parse
    if not isinstance(key, str) or len(key) > 80:
        raise PlenioUserError(where + " comp key: a strip's name.")
    out["key"] = key
    return out


def gate_of(raw: Any, where: str) -> dict | None:
    """HERESY 1760: a strip's gate checked: every field known and in its range, what is not said its default"""
    if raw is None:
        return None
    g = dict(GATE_DEFAULT, **_known(raw, GATE_KEYS, where + " gate"))
    return {"on": _flag(g["on"], where + " gate on"), "threshold_db": _num(g["threshold_db"], where + " gate threshold_db", -90, 0),
            "ratio": _num(g["ratio"], where + " gate ratio", 1, 20), "range_db": _num(g["range_db"], where + " gate range_db", 0, 80),
            "attack_ms": _num(g["attack_ms"], where + " gate attack_ms", 0.1, 50), "release_ms": _num(g["release_ms"], where + " gate release_ms", 5, 2000)}


def gate_env(x: np.ndarray, rate: int, g: dict):
    """HERESY 1760: the gate's gain a sample, as the page's kernel draws it (heresy-mixdsp.js Comp): the level of each 1 ms cell (the RMS of
    both sides), below the threshold the ratio's reduction, (ratio − 1) × (level − threshold), never below −range; smoothed cell by cell,
    the attack's coefficient while it opens (the reduction lessening), the release's while it closes; linear in dB between the cells' ends."""
    n, cell = x.shape[1], max(1, round(rate / 1000))
    frames = (n + cell - 1) // cell
    missing = frames * cell - n
    shaped = np.pad(x, ((0, 0), (0, missing))).reshape(x.shape[0], frames, cell)
    power = np.sum(shaped * shaped, axis=(0, 2))
    divisor = np.full(frames, cell * x.shape[0], dtype=float)
    if missing:
        divisor[-1] = (cell - missing) * x.shape[0]
    level = 20 * np.log10(np.maximum(np.sqrt(power / divisor), 1e-15))
    a, r = math.exp(-cell / (rate * g["attack_ms"] / 1000)), math.exp(-cell / (rate * g["release_ms"] / 1000))
    red, prev = np.zeros(frames), 0.0
    for i, lv in enumerate(level):
        target = 0.0 if lv >= g["threshold_db"] else max(-g["range_db"], (g["ratio"] - 1) * (float(lv) - g["threshold_db"]))
        k = a if target > prev else r
        prev = k * prev + (1 - k) * target
        red[i] = prev
    positions = np.r_[0, np.minimum((np.arange(frames) + 1) * cell, n)]
    env = np.interp(np.arange(n), positions, np.r_[0, red])
    return 10 ** (env / 20), {"max_reduction_db": round(float(-red.min()), 3), "mean_reduction_db": round(float(-red.mean()), 3)}


def eq_of(raw: Any, where: str, rate: int) -> dict | None:
    if raw is None:
        return None
    e = _known(raw, EQ_KEYS, where + " eq")
    bands = e.get("bands", [])
    if not isinstance(bands, list) or len(bands) > peq.MAX_BANDS:
        raise PlenioUserError(f"{where} eq: at most {peq.MAX_BANDS} bands.")
    out = []
    upper = min(20000.0, 0.45 * rate)
    for i, b in enumerate(bands):
        b = _known(b, BAND_KEYS, f"{where} eq band {i + 1}")
        kind = b.get("type", "peak")
        if kind not in BAND_TYPES:
            raise PlenioUserError(f"{where} eq band {i + 1}: the type is one of {list(BAND_TYPES)}, got {kind!r}.")
        out.append({"id": str(b.get("id") or f"band-{i + 1}")[:64], "enabled": _flag(b.get("enabled", True), f"{where} eq band {i + 1} enabled"), "type": kind,
                    "frequency_hz": _num(b.get("frequency_hz", 1000), f"{where} eq band {i + 1} frequency_hz", 20, upper),
                    "gain_db": _num(b.get("gain_db", 0), f"{where} eq band {i + 1} gain_db", -12, 12),
                    "q": _num(b.get("q", 1 / math.sqrt(2)), f"{where} eq band {i + 1} q", 0.2, 10)})
    ids = [b["id"] for b in out]
    if len(set(ids)) != len(ids):
        raise PlenioUserError(f"{where} eq: band ids must be unique.")
    return {"on": _flag(e.get("on", True), where + " eq on"), "bands": out}


def parse(value: Any, names: list[str], rate: int) -> dict:
    """The mixer value checked: every field known and in its range; strips not of this set are named in the notes."""
    v = _known(value, {"schema", "strips", "reverb", "delay", "master", "groups", "buses"}, "the mix")   # 1543: groups; 1563: buses
    if v.get("schema") != SCHEMA:
        raise PlenioUserError(f'the mix must say "schema": "{SCHEMA}".')
    strips, notes = {}, []
    for name, raw in (v.get("strips") or {}).items():
        where = f"strip {name!r}"
        s = _known(raw, STRIP_KEYS, where)
        if name not in names:
            notes.append(f"{where} is not a strip of this set and was left out")
            continue
        muted = []
        for r in s.get("muted", []) or []:
            if not isinstance(r, (list, tuple)) or len(r) not in (2, 4):
                raise PlenioUserError(f"{where}: muted is a list of [start_s, end_s] or [start_s, end_s, fall_s, rise_s].")
            a, b = _num(r[0], where + " muted start", 0, 86400), _num(r[1], where + " muted end", 0, 86400)
            if b <= a:
                raise PlenioUserError(f"{where}: a muted range ends after it starts ({a:g} … {b:g} s).")
            fall, rise = ((_num(r[2], where + " muted fall", 0, MAX_FADE), _num(r[3], where + " muted rise", 0, MAX_FADE)) if len(r) == 4
                          else (EDGE_SECONDS, EDGE_SECONDS))   # HERESY 1542
            muted.append((a, b, fall, rise))
        auto = {}                                    # HERESY 1535: the lane's volume over time, [[t, dB], …]
        raw_auto = s.get("auto", []) or []
        if not isinstance(raw_auto, list) or len(raw_auto) > MAX_AUTO:
            raise PlenioUserError(f"{where}: auto is a list of at most {MAX_AUTO} [t, dB] points.")
        for pt in raw_auto:
            if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                raise PlenioUserError(f"{where}: auto is a list of [t, dB] points.")
            auto[_num(pt[0], where + " auto time", 0, 86400)] = _num(pt[1], where + " auto dB", -60, 12)
        autos = {}                                   # HERESY 1559: pan, width and the sends over time, [[t, value], …]
        raw_autos = s.get("autos") or {}
        if not isinstance(raw_autos, dict):
            raise PlenioUserError(f"{where}: autos is {{pan|width|reverb|delay: [[t, value], …]}}.")
        for k, pts in raw_autos.items():
            if k not in AUTOS:
                raise PlenioUserError(f"{where}: autos draws {', '.join(AUTOS)}, not {k!r}.")
            if not isinstance(pts, list) or len(pts) > MAX_AUTO:
                raise PlenioUserError(f"{where}: autos.{k} is a list of at most {MAX_AUTO} [t, value] points.")
            got = {}
            for pt in pts:
                if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                    raise PlenioUserError(f"{where}: autos.{k} is a list of [t, value] points.")
                got[_num(pt[0], f"{where} autos.{k} time", 0, 86400)] = _num(pt[1], f"{where} autos.{k}", *AUTOS[k])
            if got:
                autos[k] = sorted(got.items())
        edits = []                                   # HERESY 1564: a stretch copied or moved along the lane
        raw_edits = s.get("edits") or []
        if not isinstance(raw_edits, list) or len(raw_edits) > MAX_EDITS:
            raise PlenioUserError(f"{where}: edits is a list of at most {MAX_EDITS}.")
        for j, ed in enumerate(raw_edits):
            ew = f"{where} edit {j + 1}"
            ed = _known(ed, {"op", "a", "b", "to"}, ew)
            if ed.get("op") not in ("copy", "move"):
                raise PlenioUserError(f"{ew}: op is copy or move.")
            ea, eb, eto = _num(ed.get("a", 0), ew + " a", 0, 86400), _num(ed.get("b", 0), ew + " b", 0, 86400), _num(ed.get("to", 0), ew + " to", 0, 86400)
            if eb - ea < 0.01:
                raise PlenioUserError(f"{ew}: b comes after a.")
            edits.append((ed["op"], ea, eb, eto))
        strips[name] = {"gain_db": _num(s.get("gain_db", 0), where + " gain_db", -60, 12), "mute": _flag(s.get("mute", False), where + " mute"),
                        "auto": sorted(auto.items()), "autos": autos, "edits": edits,
                        "solo": _flag(s.get("solo", False), where + " solo"), "muted": muted,
                        "trim_db": _num(s.get("trim_db", 0), where + " trim_db", -24, 24), "invert": _flag(s.get("invert", False), where + " invert"),
                        "eq": eq_of(s.get("eq"), where, rate), "comp": comp_of(s.get("comp"), where), "gate": gate_of(s.get("gate"), where),   # 1760
                        "width": _num(s.get("width", 1), where + " width", 0, 2), "pan": _num(s.get("pan", 0), where + " pan", -1, 1),
                        "reverb": _num(s.get("reverb", 0), where + " reverb", 0, 1), "delay": _num(s.get("delay", 0), where + " delay", 0, 1)}
    for name, st in strips.items():                   # HERESY 1537: a key is a strip of this set, not the strip itself
        k = st["comp"] and st["comp"]["key"]
        if k and (k not in names or k == name):
            raise PlenioUserError(f"strip {name!r} comp key: {k!r} is not another strip of this set.")
    groups = groups_of(v.get("groups"), names, notes)   # HERESY 1543
    rv = _known(v.get("reverb") or {}, REVERB_KEYS, "the room")
    preset = rv.get("preset", "room")
    if preset not in REVERB_PRESETS:
        raise PlenioUserError(f"the room is one of {list(REVERB_PRESETS)}, got {preset!r}.")
    dl = _known(v.get("delay") or {}, DELAY_KEYS, "the delay")
    ms = _known(v.get("master") or {}, MASTER_KEYS, "the master")

    def cuts(d, who):                                 # HERESY 1762: a return's cuts; unsaid, 20 Hz and 20 kHz are none, as the page's knobs say Off
        lo, hi = d.get("lowcut_hz"), d.get("highcut_hz")
        lo = None if lo is None else _num(lo, who + " lowcut_hz", 20, 2000)
        hi = None if hi is None else _num(hi, who + " highcut_hz", 1000, 20000)
        return {"lowcut_hz": lo if lo and lo > 20 else None, "highcut_hz": hi if hi and hi < 20000 else None}
    return {"strips": strips, "notes": notes, "groups": groups, "buses": buses_of(v.get("buses"), names, notes, rate),   # HERESY 1563
            "reverb": dict({"preset": preset, "return_db": _num(rv.get("return_db", 0), "the room's return_db", -60, 6), "mute": _flag(rv.get("mute", False), "the room's mute"),
                            "predelay_ms": _num(rv.get("predelay_ms", 0), "the room's predelay_ms", 0, 250)}, **cuts(rv, "the room's")),   # 1762
            "delay": {"time_ms": _num(dl.get("time_ms", 375), "the delay's time_ms", 5, 2000), "feedback": _num(dl.get("feedback", DEFAULT_FEEDBACK), "the delay's feedback", 0, 0.8),
                      "lowpass_hz": _num(dl.get("lowpass_hz", DEFAULT_LOWPASS_HZ), "the delay's lowpass_hz", 20, 24000),
                      "return_db": _num(dl.get("return_db", 0), "the delay's return_db", -60, 6), "mute": _flag(dl.get("mute", False), "the delay's mute"),
                      **cuts(dl, "the delay's")},   # 1762
            "master": master_of(ms, rate)}


BUS_KEYS = {"id", "name", "members", "gain_db", "mute", "eq", "comp", "width", "pan"}
MAX_BUSES = 8


def buses_of(raw: Any, names: list[str], notes: list[str], rate: int) -> list[dict]:
    """HERESY 1563: the audio buses checked: an id each, members of this set (one bus a strip), a strip's own chain."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > MAX_BUSES:
        raise PlenioUserError(f"buses is a list of at most {MAX_BUSES}.")
    out, ids, taken = [], set(), {}
    for i, b in enumerate(raw):
        where = f"bus {i + 1}"
        b = _known(b, BUS_KEYS, where)
        bid = b.get("id")
        if not isinstance(bid, str) or not bid or len(bid) > 64 or bid in ids:
            raise PlenioUserError(f"{where}: an id of its own (a short string, unique).")
        ids.add(bid)
        members = b.get("members") or []
        if not isinstance(members, list):
            raise PlenioUserError(f"{where}: members is a list of strips.")
        mine = []
        for n in members:
            if n not in names:
                notes.append(f"{where}: {n!r} is not a strip of this set and was left out")
                continue
            if n in taken:
                raise PlenioUserError(f"{where}: {n!r} is in {taken[n]!r} already: a strip goes to one bus.")
            taken[n] = bid
            mine.append(n)
        comp = comp_of(b.get("comp"), where)
        if comp and comp["key"]:
            raise PlenioUserError(f"{where}: a bus's compressor listens to the bus itself: no key.")
        out.append({"id": bid, "name": str(b.get("name") or bid)[:40], "members": mine, "gain_db": _num(b.get("gain_db", 0), where + " gain_db", -60, 12),
                    "mute": _flag(b.get("mute", False), where + " mute"), "eq": eq_of(b.get("eq"), where, rate), "comp": comp,
                    "width": _num(b.get("width", 1), where + " width", 0, 2), "pan": _num(b.get("pan", 0), where + " pan", -1, 1)})
    return out


def master_of(ms: dict, rate: int) -> dict:
    """HERESY 1544: the master's fader and its chain; its compressor listens to itself."""
    comp = comp_of(ms.get("comp"), "the master")
    if comp and comp["key"]:
        raise PlenioUserError("the master's compressor listens to the master itself: no key.")
    lm = ms.get("limit")
    if lm is not None:
        lm = _known(lm, LIMIT_KEYS, "the master's limit")
        lm = {"on": _flag(lm.get("on", True), "the master's limit on"), "ceiling_db": _num(lm.get("ceiling_db", -1.0), "the master's ceiling_db", -12, -0.3),
              "drive_db": _num(lm.get("drive_db", 0), "the master's drive_db", -12, 24), "release_ms": _num(lm.get("release_ms", 100), "the master's release_ms", 10, 1000)}
    end = ms.get("end_s")                             # HERESY 1756: the song's end, everything after it silent; none: the song's own
    return {"gain_db": _num(ms.get("gain_db", 0), "the master's gain_db", -24, 12), "eq": eq_of(ms.get("eq"), "the master", rate), "comp": comp, "limit": lm,
            "fade_in_s": _num(ms.get("fade_in_s", 0), "the master's fade_in_s", 0, MAX_FADE_S), "fade_out_s": _num(ms.get("fade_out_s", 0), "the master's fade_out_s", 0, MAX_FADE_S),
            "end_s": None if end is None else _num(end, "the master's end_s", 0.05, 86400)}


def chain_on(ms: dict) -> dict:
    """What of the master's chain is at work: an EQ with a band on, a compressor on, a limiter on."""
    return {"eq": bool(ms["eq"] and ms["eq"]["on"] and any(b["enabled"] for b in ms["eq"]["bands"])), "comp": bool(ms["comp"] and ms["comp"]["on"]),
            "limit": bool(ms["limit"] and ms["limit"]["on"]), "fade": bool(ms.get("fade_in_s") or ms.get("fade_out_s") or ms.get("end_s") is not None)}   # 1756


def fade_envelope(frames: int, rate: int, fade_in: float, fade_out: float, end: float | None) -> np.ndarray:
    """HERESY 1756: the song's fade as a gain a sample: from −60 dB up to 0 over the first `fade_in` seconds, from 0 down to −60 dB over
    the `fade_out` seconds before `end` (none: the song's own end), linear in dB (as the page's exponential ramps are), each the lower
    where they meet; 0 from the end on."""
    t = np.arange(frames) / rate
    e = frames / rate if end is None else min(float(end), frames / rate)
    d = np.zeros(frames)
    if fade_in > 0:
        d = np.minimum(d, np.where(t < fade_in, FADE_FLOOR_DB * (1 - t / fade_in), 0.0))
    if fade_out > 0:
        d = np.minimum(d, np.where(t > e - fade_out, FADE_FLOOR_DB * (t - (e - fade_out)) / fade_out, 0.0))
    env = 10 ** (d / 20)
    env[t >= e] = 0.0
    return env


def groups_of(raw: Any, names: list[str], notes: list[str]) -> list[dict]:
    """HERESY 1543: the VCAs checked; a member not of this set is named in the notes and left out of it."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > MAX_GROUPS:
        raise PlenioUserError(f"groups is a list of at most {MAX_GROUPS}.")
    out, ids = [], set()
    for i, g in enumerate(raw):
        where = f"group {i + 1}"
        g = _known(g, GROUP_KEYS, where)
        gid = g.get("id")
        if not isinstance(gid, str) or not gid or len(gid) > 64 or gid in ids:
            raise PlenioUserError(f"{where}: an id of its own (a short string, unique).")
        ids.add(gid)
        name = g.get("name", gid)
        if not isinstance(name, str) or len(name) > 40:
            raise PlenioUserError(f"{where}: a name of at most 40 characters.")
        members = g.get("members", [])
        if not isinstance(members, list) or not all(isinstance(x, str) for x in members):
            raise PlenioUserError(f"{where}: members is a list of strips' names.")
        for x in members:
            if x not in names:
                notes.append(f"{where} ({name}): {x!r} is not a strip of this set and was left out of it")
        out.append({"id": gid, "name": name, "members": sorted({x for x in members if x in names}),
                    "gain_db": _num(g.get("gain_db", 0), where + " gain_db", -60, 12), "mute": _flag(g.get("mute", False), where + " mute"),
                    "solo": _flag(g.get("solo", False), where + " solo")})
    return out


def db(x: float) -> float:
    return float(10 ** (x / 20))


def pan_law(x: np.ndarray, pan) -> np.ndarray:
    """The Web Audio StereoPannerNode's law for a stereo input (the page plays through one): the centre is the input as it is.
    HERESY 1559: pan may be a value a sample (its automation), the law per sample as the node's a-rate param has it."""
    if x.shape[0] != 2:
        return x
    if np.ndim(pan):
        p = np.asarray(pan, dtype=np.float64)
        left, right = x[0], x[1]
        tl, tr, neg = (np.minimum(p, 0.0) + 1) * math.pi / 2, np.maximum(p, 0.0) * math.pi / 2, p <= 0
        return np.stack([np.where(neg, left + right * np.cos(tl), left * np.cos(tr)), np.where(neg, right * np.sin(tl), right + left * np.sin(tr))])
    if pan == 0:
        return x
    left, right = x[0], x[1]
    if pan <= 0:
        t = (pan + 1) * math.pi / 2
        return np.stack([left + right * math.cos(t), right * math.sin(t)])
    t = pan * math.pi / 2
    return np.stack([left * math.cos(t), right + left * math.sin(t)])


def width_of(x: np.ndarray, w: float) -> np.ndarray:
    """Mid/side: 0 mono, 1 as it is, 2 the side doubled (HERESY 1559: or a value a sample, its automation)."""
    if x.shape[0] != 2 or (not np.ndim(w) and w == 1):
        return x
    a, b = (1 + w) / 2, (1 - w) / 2
    return np.stack([x[0] * a + x[1] * b, x[0] * b + x[1] * a])


def eq_settings(e: dict) -> dict:
    """Plenio's EQ settings of the enabled bands (a shelf's slope is 1: the page's biquad has no other)."""
    return {"schema": peq.SCHEMA, "preamp_db": 0.0,
            "bands": [dict(b, slope=1.0) for b in e["bands"] if b["enabled"]]}


def compress_keyed(x: np.ndarray, key: np.ndarray, rate: int, c: dict):
    """HERESY 1537: Plenio's compressor (plenio_core.audio.dynamics.compress, its 1 ms control, no side-chain filter, no input gain) with
    its detector fed by `key`; the page's kernel (heresy-mixdsp.js) runs the same cells on the same signal."""
    n, cell = x.shape[1], max(1, round(rate / 1000))
    k = np.asarray(key, dtype=np.float64)
    k = np.pad(k, ((0, 0), (0, max(0, n - k.shape[1]))))[:, :n]
    frames = (n + cell - 1) // cell
    missing = frames * cell - n
    shaped = np.pad(k, ((0, 0), (0, missing))).reshape(k.shape[0], frames, cell)
    power = np.sum(shaped * shaped, axis=(0, 2))
    divisor = np.full(frames, cell * k.shape[0], dtype=float)
    if missing:
        divisor[-1] = (cell - missing) * k.shape[0]
    level_db = 20 * np.log10(np.maximum(np.sqrt(power / divisor), 1e-15))
    attack, release = math.exp(-cell / (rate * c["attack_ms"] / 1000)), math.exp(-cell / (rate * c["release_ms"] / 1000))
    red, prev = np.zeros(frames), 0.0
    for i, lv in enumerate(level_db):
        target = soft_knee_reduction_db(float(lv), c["threshold_db"], c["ratio"], c["knee_db"])
        coef = attack if target < prev else release
        prev = coef * prev + (1 - coef) * target
        red[i] = prev
    positions = np.r_[0, np.minimum((np.arange(frames) + 1) * cell, n)]
    env = np.interp(np.arange(n), positions, np.r_[0, red])
    return x * 10 ** (env / 20), {"max_reduction_db": round(float(-red.min()), 3), "mean_reduction_db": round(float(-red.mean()), 3)}


def cut_envelope(frames: int, rate: int, ranges) -> np.ndarray:
    """HERESY 1542: 1 outside the cuts, 0 inside; each cut's edges raised cosines inside it, of its own lengths: the fall into the
    silence at its start, the rise out of it at its end. Cuts that touch are one, the first's fall and the last's rise; a cut shorter
    than its two edges shares itself between them by their lengths. Ten ms each is Plenio's mute_envelope, sample for sample."""
    env, seconds, merged = np.ones(frames), frames / rate, []
    for a, b, fall, rise in sorted((max(0.0, a), min(seconds, b), f, r) for a, b, f, r in ranges if a < seconds and b > 0):
        if merged and a <= merged[-1][1]:
            if b > merged[-1][1]:
                merged[-1][1], merged[-1][3] = b, rise
        elif b > a:
            merged.append([a, b, fall, rise])
    for a, b, fall, rise in merged:
        start, end = round(a * rate), min(frames, round(b * rate))
        if end <= start:
            continue
        env[start:end] = 0.0
        n, fn, rn = end - start, (max(1, round(fall * rate)) if fall > 0 else 0), (max(1, round(rise * rate)) if rise > 0 else 0)
        if fn + rn > n:
            fn, rn = n * fn // (fn + rn), n * rn // (fn + rn)
        if fn:
            env[start:start + fn] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(fn) + 0.5) / fn)
        if rn:
            env[end - rn:end] = (0.5 + 0.5 * np.cos(np.pi * (np.arange(rn) + 0.5) / rn))[::-1]
    return env


def curve(pts, frames: int, rate: int) -> np.ndarray:
    """HERESY 1559: points [[t, value], …] as a value a sample: linear between them, the first's before, the last's after."""
    ts, vs = zip(*pts)
    return np.interp(np.arange(frames) / rate, ts, vs)


def place(y: np.ndarray, x: np.ndarray, rate: int, edits) -> np.ndarray:
    """HERESY 1564: each edit's stretch of the stem as it came (x) laid over the lane (y) at its «to», 10 ms raised-cosine crossfades
    at both edges; a move's source silenced first, as a cut of its own edges. In order; a later one over an earlier."""
    frames = y.shape[1]
    k0 = max(1, round(EDGE_SECONDS * rate))
    for op, a, b, to in edits:
        i0 = round(a * rate)
        n = min(frames, round(b * rate)) - i0
        if n <= 0:
            continue
        if op == "move":
            y = y * cut_envelope(frames, rate, [(a, b, EDGE_SECONDS, EDGE_SECONDS)])[None, :]
        d0 = round(to * rate)
        m = min(n, frames - d0)
        if m <= 0:
            continue
        w = np.ones(m)
        k = min(k0, m // 2)
        if k:
            ramp = 0.5 - 0.5 * np.cos(np.pi * (np.arange(k) + 0.5) / k)
            w[:k], w[-k:] = ramp, ramp[::-1]
        y = y.copy()
        y[:, d0:d0 + m] = y[:, d0:d0 + m] * (1 - w) + x[:, i0:i0 + m] * w
    return y


def pre(x: np.ndarray, rate: int, s: dict, item: dict) -> np.ndarray:
    """HERESY 1537: a strip up to its compressor: the silence drawn, trim and polarity, the EQ (what a key listens to)."""
    y = np.asarray(x, dtype=np.float64)
    if s["muted"]:
        env = cut_envelope(y.shape[1], rate, s["muted"])   # HERESY 1542
        y = y * env
        item["muted_seconds"] = round(float((1 - env).sum()) / rate, 3)
    if s.get("edits"):                                # HERESY 1564: copies and moves over the cuts
        y = place(y, np.asarray(x, dtype=np.float64), rate, s["edits"])
        item["edits"] = len(s["edits"])
    g = db(s["trim_db"]) * (-1.0 if s["invert"] else 1.0)
    if g != 1.0:
        y = y * g
    if s["eq"] and s["eq"]["on"] and any(b["enabled"] for b in s["eq"]["bands"]):
        y = peq.apply(y, rate, eq_settings(s["eq"]))
    return y


def strip(x: np.ndarray, rate: int, s: dict, item: dict, key: np.ndarray | None = None, ready: bool = False) -> np.ndarray:
    """One channel of the console, as the page's graph has it (the mute and solo decision is the mixer's); `key`: what its compressor
    listens to when it is keyed (HERESY 1537), `ready`: x has been through pre() already."""
    y = np.asarray(x, dtype=np.float64) if ready else pre(x, rate, s, item)
    gt, ge = s.get("gate"), None                      # HERESY 1760: the gate listens to the strip itself, before its compressor's gain
    if gt and gt["on"]:
        ge, gsaid = gate_env(y, rate, gt)
        item["gate_reduction_db"] = gsaid["max_reduction_db"]
    c = s["comp"]
    if c and c["on"]:
        dry = y                                       # HERESY 1759: for a blend
        if key is not None:
            y, said = compress_keyed(y, key, rate, c)
            item["key"] = c["key"]
        else:
            y, said = compress(y, rate, Compressor(threshold_db=c["threshold_db"], ratio=c["ratio"], knee_db=c["knee_db"], attack_ms=c["attack_ms"],
                                                   release_ms=c["release_ms"], sidechain_hz=0.0))
        item["gain_reduction_db"] = said["max_reduction_db"]
        item["mean_reduction_db"] = said["mean_reduction_db"]
        if c["makeup_db"]:
            y = y * db(c["makeup_db"])
        if c.get("mix", 1.0) < 1.0:                   # HERESY 1759: parallel compression: the dry beside the compressed
            y = dry * (1.0 - c["mix"]) + y * c["mix"]
            item["comp_mix"] = c["mix"]
    if ge is not None:                                # HERESY 1760: the gate's gain over the compressor's (both heard the strip as it came)
        y = y * ge[None, :]
    if s["gain_db"]:
        y = y * db(s["gain_db"])
    if s.get("auto"):                                 # HERESY 1535: after the fader, linear in dB between the points
        ts, ds = zip(*s["auto"])
        env = np.interp(np.arange(y.shape[1]) / rate, ts, ds)
        y = y * (10 ** (env / 20))[None, :]
        item["auto_points"] = len(ts)
    au = s.get("autos") or {}                         # HERESY 1559: drawn over time, in place of the knob
    y = pan_law(width_of(y, curve(au["width"], y.shape[1], rate) if au.get("width") else s["width"]),
                curve(au["pan"], y.shape[1], rate) if au.get("pan") else s["pan"])
    if au:
        item["autos"] = {k: len(v) for k, v in au.items()}
    pk = float(np.max(np.abs(y))) if y.size else 0.0
    item["peak_db"] = round(20 * math.log10(pk), 2) if pk > 0 else None
    return y


NEUTRAL = {"gain_db": 0.0, "mute": False, "solo": False, "muted": [], "trim_db": 0.0, "invert": False, "eq": None, "comp": None, "gate": None,
           "width": 1.0, "pan": 0.0, "reverb": 0.0, "delay": 0.0, "auto": [], "autos": {}, "edits": []}


def _tail_fade(x: np.ndarray, rate: int) -> np.ndarray:
    n = min(x.shape[1], round(TAIL_FADE_SECONDS * rate))
    if n:
        x = x.copy()
        x[:, -n:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / n)
    return x


def return_cuts(wet: np.ndarray, rate: int, d: dict) -> np.ndarray:
    """HERESY 1762: a return's low cut and high cut on its wet, Plenio's RBJ bands at Q 1/√2 (the page's biquads, as a strip's EQ cuts)"""
    bands = ([{"id": "lowcut", "enabled": True, "type": "highpass", "frequency_hz": d["lowcut_hz"], "gain_db": 0.0, "q": 1 / math.sqrt(2)}] if d.get("lowcut_hz") else []) + \
            ([{"id": "highcut", "enabled": True, "type": "lowpass", "frequency_hz": min(d["highcut_hz"], 0.45 * rate), "gain_db": 0.0, "q": 1 / math.sqrt(2)}] if d.get("highcut_hz") else [])
    return peq.apply(wet, rate, eq_settings({"on": True, "bands": bands})) if bands else wet


def reverb_ir(rate: int, preset: str) -> np.ndarray:
    """The room's impulse, as the render convolves with it: the page's convolver plays the same one (/daw/ir)."""
    if preset not in REVERB_PRESETS:
        raise PlenioUserError(f"the room is one of {list(REVERB_PRESETS)}, got {preset!r}.")
    p = REVERB_PRESETS[preset]
    return impulse_response(rate, seed=0, rt60=p["rt60"], damping=p["damping"], pre_delay_ms=p["pre_delay_ms"])


def ir_wav(rate: int, preset: str) -> bytes:
    """The room's impulse as a float WAV, for the page's convolver (/daw/ir)."""
    import io
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, reverb_ir(rate, preset).T.astype(np.float32), rate, format="WAV", subtype="FLOAT")
    return buf.getvalue()


def render(rate: int, signals: list[tuple[str, np.ndarray]], value: Any, *, keep: bool = False):
    """The mixdown of ``signals`` ([(name, [channels, frames]) …], the rest among them) as ``value`` says.

    Returns (mix, report, printed): ``printed`` the audible strips after their pan (their sends not in them) and the two returns,
    when ``keep``; a mix lowered to −0.3 dBFS when it peaked above it, the report says by how much."""
    names = [n for n, _x in signals]
    v = parse(value, names, rate)
    shape = signals[0][1].shape
    gr = v["groups"]                                  # HERESY 1543: the VCAs over their members
    vca = {n: sum(g["gain_db"] for g in gr if n in g["members"]) for n in names}
    gmute = {n: any(g["mute"] for g in gr if n in g["members"]) for n in names}
    gsolo = {n: any(g["solo"] for g in gr if n in g["members"]) for n in names}
    soloing = any(v["strips"].get(n, NEUTRAL)["solo"] or gsolo[n] for n in names)
    dry, sends = np.zeros(shape), {"reverb": np.zeros(shape), "delay": np.zeros(shape)}
    route = {n: b["id"] for b in v["buses"] for n in b["members"]}   # HERESY 1563: a member's strip into its bus, not the master
    subs = {b["id"]: np.zeros(shape) for b in v["buses"]}
    report, printed = [], {}
    keys = {st["comp"]["key"] for st in v["strips"].values() if st["comp"] and st["comp"]["on"] and st["comp"]["key"]}   # HERESY 1537
    pres = {n: pre(x, rate, v["strips"].get(n, NEUTRAL), {}) for n, x in signals if n in keys}
    for n, x in signals:
        s = v["strips"].get(n, NEUTRAL)
        audible = (s["solo"] or gsolo[n]) if soloing else not (s["mute"] or gmute[n])
        item = {"name": n, "audible": audible, "gain_db": s["gain_db"]}
        if vca[n]:                                    # HERESY 1543: the fader as its VCAs move it
            s = dict(s, gain_db=s["gain_db"] + vca[n])
            item["vca_db"] = round(vca[n], 3)
        report.append(item)
        if not audible:
            continue
        k = s["comp"] and s["comp"]["on"] and s["comp"]["key"]
        y = strip(x, rate, s, item, key=pres.get(k) if k else None)
        if n in route:                                # HERESY 1563
            subs[route[n]] += y
            item["bus"] = route[n]
        else:
            dry += y
        if keep:
            printed[n] = y
        for bus in ("reverb", "delay"):
            amt = curve(s["autos"][bus], y.shape[1], rate) if (s.get("autos") or {}).get(bus) else s[bus]   # HERESY 1559: a send drawn over time
            if np.any(amt):
                sends[bus] += y * amt
    report_buses = []
    for b in v["buses"]:                              # HERESY 1563: each bus's sum through a strip's own chain, into the master
        item = {"bus": b["id"], "name": b["name"], "members": b["members"], "audible": not b["mute"]}
        report_buses.append(item)
        if b["mute"] or not b["members"]:
            continue
        z = strip(subs[b["id"]], rate, dict(NEUTRAL, eq=b["eq"], comp=b["comp"], gain_db=b["gain_db"], width=b["width"], pan=b["pan"]), item)
        dry += z
        if keep:
            printed["bus-" + b["id"]] = z
    out = dry
    returns = {}
    if np.any(sends["reverb"]) and not v["reverb"]["mute"]:
        src, k = sends["reverb"], round(v["reverb"]["predelay_ms"] * rate / 1000)
        if k:                                         # HERESY 1762: the room's own pre-delay, on top of its preset's
            src = np.pad(src, ((0, 0), (k, 0)))[:, : src.shape[1]]
        wet = return_cuts(preverb(v["reverb"]["preset"])(src, rate), rate, v["reverb"])
        returns["room"] = _tail_fade(wet, rate) * db(v["reverb"]["return_db"])
    if np.any(sends["delay"]) and not v["delay"]["mute"]:
        d = v["delay"]
        wet = pdelay(time_ms=round(d["time_ms"] * rate / 1000) * 1000 / rate, feedback=d["feedback"], lowpass_hz=d["lowpass_hz"])(sends["delay"], rate)
        returns["delay"] = _tail_fade(return_cuts(wet, rate, d), rate) * db(d["return_db"])   # HERESY 1762: its cuts
    for k, w in returns.items():
        out = out + w
        if keep:
            printed["return-" + k] = w
    ms, on = v["master"], chain_on(v["master"])       # HERESY 1544: the master's chain, before its fader
    master = {k: x for k, x in on.items() if x}
    if on["eq"]:
        out = peq.apply(out, rate, eq_settings(ms["eq"]))
    if on["comp"]:
        c = ms["comp"]
        dry = out                                     # HERESY 1759
        out, said = compress(out, rate, Compressor(threshold_db=c["threshold_db"], ratio=c["ratio"], knee_db=c["knee_db"], attack_ms=c["attack_ms"],
                                                   release_ms=c["release_ms"], sidechain_hz=0.0))
        master["gain_reduction_db"] = said["max_reduction_db"]
        if c["makeup_db"]:
            out = out * db(c["makeup_db"])
        if c.get("mix", 1.0) < 1.0:                   # HERESY 1759: the master's compressor blended with its dry input
            out = dry * (1.0 - c["mix"]) + out * c["mix"]
            master["comp_mix"] = c["mix"]
    if on["limit"]:
        lm = ms["limit"]
        out, said = limit(out, rate, ceiling_dbtp=lm["ceiling_db"], drive_db=lm["drive_db"], lookahead_ms=LOOKAHEAD_MS, release_ms=lm["release_ms"])
        master["limit_reduction_db"] = said["max_reduction_db"]
    if ms["gain_db"]:
        out = out * db(ms["gain_db"])
        if keep and not master:
            printed = {k: w * db(ms["gain_db"]) for k, w in printed.items()}
    if on["fade"]:                                    # HERESY 1756: the song's fade after the fader; the printed strips are the master's input
        out = out * fade_envelope(out.shape[1], rate, ms["fade_in_s"], ms["fade_out_s"], ms["end_s"])[None, :]
        master["fade"] = {"in_s": ms["fade_in_s"], "out_s": ms["fade_out_s"], "end_s": ms["end_s"]}
    pk = float(np.max(np.abs(out))) if out.size else 0.0
    lowered = 0.0
    if pk > db(CEILING_DBFS):
        lowered = round(20 * math.log10(pk) - CEILING_DBFS, 2)
        k = db(CEILING_DBFS) / pk
        out = out * k
        if keep and not master:
            printed = {n: w * k for n, w in printed.items()}
    neutral = not soloing and all(v["strips"].get(n, NEUTRAL) == NEUTRAL for n in names) and v["master"]["gain_db"] == 0 and \
        not any(vca[n] or gmute[n] for n in names) and not master
    return out, {"schema": SCHEMA, "rate": rate, "neutral": neutral, "strips": report, "buses": report_buses, "returns": sorted(returns),
                 "master": master, "printed_at": "the master's input" if master else "the mix",
                 "peak_db": round(20 * math.log10(pk), 2) if pk > 0 else None, "lowered_db": lowered, "notes": v["notes"]}, printed
