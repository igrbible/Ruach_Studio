"""HERESY 2987 (Viktor 25.11.2026: «Подбери кандидатов NAM до среза и оформи всё в срез. Пусть пользователь имеет выбор.» «NAM — 🔥»): the
Refiner's step «Amp (NAM)», a stem played through a capture of an amp, a pedal or a rig made with Neural Amp Modeler. This module is its engine
and its list of captures; builtin_steps/ruach/nam.py is the step.

The engine is a forward pass in torch of NAM's .nam files, written from NeuralAmpModelerCore (Steven Atkinson, MIT, at its commit d3189ed; its
notice below) and held to the core's own C++ render: WaveNet A1 (standard, lite, feather, nano, gated or not), WaveNet A2 (no FiLM, no groups),
LSTM and the SlimmableContainer, −99…−140 dB from the C++ render on 30 null tests in the kitchen (heresy/MISC/claude-arc/refsec-nam/torch,
25.11.2026), and test_nam_amp_2987.py holds it there on the two captures of the core's repo. What it cannot read yet (FiLM, grouped
convolutions, blended gating, a condition DSP, a post-stack head) it says in words, never as silence (2955's rule). No new dependency:
torch, numpy, scipy and soundfile, which the lab has on every system (soxr where librosa brought it, else scipy's polyphase resampler).

The captures: the Studio's set in models/refiner/nam/<type>/<slug>.nam with captures.json beside it (who captured each, the gear, its maker,
the licence, where it came from), and the user's own .nam files anywhere under user/nam/, read anew at every listing (a file's reading kept
while its size and time stay the same).

Levels as the NAM plugin sets them by default: an interface at 12 dBu against the capture's input_level_dbu, the output normalized to −18 by
the capture's measured loudness; the drive on top of that. Then the generic cab where it is asked (HERESY 2994: a filter, not a recorded
cabinet: a guitar speaker's band and its mid curve, zero-phase; on Auto after the Studio's guitar amps captured without a cabinet), a 10 Hz
high-pass (a capture fed silence gives pure DC, and one of the core's
LSTMs carries DC 10 dB under its own signal: the kitchen's ear, 25.11.2026), the result brought to the stem's own loudness (a capture made
for a DI level put a mixed bass stem 23 dB under itself), dry/wet as an equal-power blend brought back to the stem's loudness (2994: «0 dB
keeps the stem's place» at every dry/wet, not at 100 % alone), the output knob last. Each channel takes a pass of its own
(an amp is not linear: the mid alone would sound otherwise) unless the side is 30 dB under the mid, then the mid alone, on both channels.
NAM adds no delay of its own, nor does the generic cab, so dry and wet line up sample for sample.

NeuralAmpModelerCore's notice, as its LICENSE asks it to travel with substantial portions:

    MIT License

    Copyright (c) 2023 Steven Atkinson

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
"""
import json
import math
import os
import re
import tempfile
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

import paths

STUDIO = paths.REFINER_NAM               # the Studio's set (Engine → Models' part «nam», HERESY 2994), with captures.json
USER = "user/nam"                         # the user's own .nam files, any depth
KINDS = (("guitar", "Guitar amps"), ("bass", "Bass amps"), ("pedal", "Pedals"), ("rig", "Full rigs"), ("outboard", "Outboard"), ("other", "Other captures"))
YOURS = ("yours", "Yours, from user/nam/")
DEFAULT_RATE = 48000                      # a .nam that says no rate was trained at 48 kHz (all of NAM's own)
INTERFACE_DBU = 12.0                      # the NAM plugin's default input calibration
TARGET = -18.0                            # its «Normalized» output
SIDE_DB = -30.0                           # under this the side is left alone: the mid takes one pass
PREWARM_BLOCK = 64                        # the core's render resets with a 64-sample buffer; prewarm runs whole buffers
HEADS = ("amp", "pedal_amp", "preamp")    # NAM's gear types captured without a cabinet (amp_cab, amp_pedal_cab and studio carry one)
# HERESY 2994 (the lead's finish of 2987: «most captures are amp HEADS (no cab)»): the generic cab, a filter and not a recorded cabinet: a guitar
# speaker's band (about 80 Hz to 5 kHz) and its mid curve, as (Hz, dB) points of its magnitude; drawn zero-phase (a centred linear-phase FIR)
CAB_CURVE = ((0, -60.0), (40, -30.0), (70, -10.0), (100, -2.0), (130, 1.0), (200, 0.0), (500, -2.5), (1000, 0.0), (2500, 3.0), (4000, 0.0),
             (5500, -10.0), (8000, -30.0), (12000, -48.0), (20000, -60.0))
CAB_SECONDS = 0.17                        # the filter's length: about 6 Hz of resolution at any rate, the 70–130 Hz knee drawn as written
NONE_HERE = "No NAM capture here yet: put .nam files in user/nam/ (any folder under it) and open the step again"


class Refused(Exception):
    """What the step says to the user, in its own words, instead of a sound."""


# ── the engine (NeuralAmpModelerCore's model, in torch) ─────────────────────────────────────────────────────────────────

def _act(spec):
    import torch
    import torch.nn.functional as F
    if isinstance(spec, dict):
        name, slope = spec["type"], spec.get("negative_slope", 0.01)
    else:
        name, slope = spec, 0.01
    table = {"Tanh": torch.tanh, "ReLU": F.relu, "Sigmoid": torch.sigmoid, "SiLU": F.silu, "Softsign": F.softsign,
             "Hardtanh": F.hardtanh, "LeakyReLU": lambda z: F.leaky_relu(z, slope)}
    if name not in table:
        raise NotImplementedError("the activation " + str(name))
    return table[name]


class _Weights:
    def __init__(self, flat):
        self.w, self.i = np.asarray(flat, dtype=np.float32), 0

    def take(self, *shape):
        import torch
        n = int(np.prod(shape))
        a = self.w[self.i:self.i + n]
        if len(a) != n:
            raise ValueError("it has fewer weights than its own shape needs")
        self.i += n
        return torch.from_numpy(a.reshape(shape).copy())

    def done(self):
        if self.i != len(self.w):
            raise ValueError(f"its weights do not fit its shape ({self.i} used of {len(self.w)})")


class WaveNet:
    def __init__(self, cfg, weights, sample_rate):
        if cfg.get("head") is not None or cfg.get("condition_dsp") is not None:
            raise NotImplementedError("a post-stack head or a condition DSP")
        self.sample_rate = sample_rate
        W = _Weights(weights)
        self.arrays, self.rf = [], 1
        for a in cfg["layers"]:
            ch, n = a["channels"], len(a["dilations"])
            bott = a.get("bottleneck", ch)
            ks = a["kernel_sizes"] if "kernel_sizes" in a else [a["kernel_size"]] * n
            acts = a["activation"] if isinstance(a["activation"], list) else [a["activation"]] * n
            gm = a.get("gating_mode", "gated" if a.get("gated") else "none")
            gm = gm if isinstance(gm, list) else [gm] * n
            if any(g not in ("none", "gated") for g in gm):
                raise NotImplementedError("blended gating")
            gated = [g == "gated" for g in gm]
            for k in ("conv_pre_film", "conv_post_film", "input_mixin_pre_film", "input_mixin_post_film", "activation_pre_film",
                      "activation_post_film", "layer1x1_post_film", "head1x1_post_film"):
                if (a.get(k) or {}).get("active"):
                    raise NotImplementedError("FiLM")
            if a.get("groups_input", 1) != 1 or a.get("groups_input_mixin", 1) != 1:
                raise NotImplementedError("grouped convolutions")
            l1, h1 = a.get("layer1x1", {"active": True, "groups": 1}), a.get("head1x1", {"active": False})
            if l1.get("groups", 1) != 1 or (h1.get("active") and h1.get("groups", 1) != 1):
                raise NotImplementedError("grouped convolutions")
            if a.get("head") is not None:
                hs, hk, hb, hd = a["head"]["out_channels"], a["head"]["kernel_size"], a["head"]["bias"], a["head"].get("head_dilation", 1)
            else:
                hs, hk, hb, hd = a["head_size"], 1, a["head_bias"], 1
            cs = a["condition_size"]
            arr = {"rechannel": W.take(ch, a["input_size"], 1), "layers": []}
            for i in range(n):
                mid = 2 * bott if gated[i] else bott
                L = {"d": a["dilations"][i], "k": ks[i], "act": _act(acts[i]), "gated": gated[i], "bott": bott,
                     "cw": W.take(mid, ch, ks[i]), "cb": W.take(mid), "mw": W.take(mid, cs, 1)}
                if l1["active"]:
                    L["lw"], L["lb"] = W.take(ch, bott, 1), W.take(ch)
                if h1.get("active"):
                    L["hw"], L["hb"] = W.take(h1["out_channels"], bott, 1), W.take(h1["out_channels"])
                arr["layers"].append(L)
                self.rf += (ks[i] - 1) * a["dilations"][i]
            hin = h1["out_channels"] if h1.get("active") else bott
            arr["hw"], arr["hb"], arr["hd"] = W.take(hs, hin, hk), (W.take(hs) if hb else None), hd
            self.rf += (hk - 1) * hd
            self.arrays.append(arr)
        self.head_scale = float(W.take(1)[0])
        W.done()

    def forward(self, x):
        """x: (1, 1, T + rf - 1) → (1, 1, T): 'valid' convolutions over a left-padded signal, as the core's causal ring buffers."""
        import torch
        import torch.nn.functional as F
        cond, y, head = x, x, None
        for arr in self.arrays:
            y = F.conv1d(y, arr["rechannel"])
            hacc = head
            for L in arr["layers"]:
                z = F.conv1d(y, L["cw"], L["cb"], dilation=L["d"])
                z = z + F.conv1d(cond[..., -z.shape[-1]:], L["mw"])
                if L["gated"]:
                    b = L["bott"]
                    a = L["act"](z[:, :b]) * torch.sigmoid(z[:, b:])
                else:
                    a = L["act"](z)
                y = y[..., -a.shape[-1]:] + F.conv1d(a, L["lw"], L["lb"]) if "lw" in L else a
                term = F.conv1d(a, L["hw"], L["hb"]) if "hw" in L else a
                hacc = term if hacc is None else hacc[..., -term.shape[-1]:] + term
            head = F.conv1d(hacc, arr["hw"], arr["hb"], dilation=arr["hd"])
            y = y[..., -head.shape[-1]:]
        return self.head_scale * head

    def process(self, x, block=65536):
        """x: 1-D float32 at the capture's rate → the same length, block by block with an overlap of rf - 1 (exact)."""
        import torch
        with torch.inference_mode():
            p = self.rf - 1
            xp = torch.from_numpy(np.concatenate([np.zeros(p, np.float32), np.asarray(x, np.float32)]))
            out = np.empty(len(x), np.float32)
            for s in range(0, len(x), block):
                e = min(s + block, len(x))
                out[s:e] = self.forward(xp[s:e + p].view(1, 1, -1))[0, 0].numpy()
            return out


class LSTM:
    def __init__(self, cfg, weights, sample_rate):
        import torch
        self.sample_rate = sample_rate
        I, H, N = cfg["input_size"], cfg["hidden_size"], cfg["num_layers"]
        W = _Weights(weights)
        self.core = torch.nn.LSTM(I, H, N, batch_first=True)
        h0, c0 = [], []
        with torch.no_grad():
            for i in range(N):
                ins = I if i == 0 else H
                w = W.take(4 * H, ins + H)
                getattr(self.core, f"weight_ih_l{i}").copy_(w[:, :ins])
                getattr(self.core, f"weight_hh_l{i}").copy_(w[:, ins:])
                getattr(self.core, f"bias_ih_l{i}").copy_(W.take(4 * H))
                getattr(self.core, f"bias_hh_l{i}").zero_()
                h0.append(W.take(H))
                c0.append(W.take(H))
            self.head_w, self.head_b = W.take(1, H), W.take(1)
        W.done()
        self.h0, self.c0 = torch.stack(h0)[:, None, :], torch.stack(c0)[:, None, :]
        self.core.eval()

    def prewarm_samples(self):
        n = max(int(0.5 * self.sample_rate) if self.sample_rate and self.sample_rate > 0 else 1, 1)
        return -(-n // PREWARM_BLOCK) * PREWARM_BLOCK

    def process(self, x, block=65536):
        import torch
        with torch.inference_mode():
            state = (self.h0.clone(), self.c0.clone())
            _, state = self.core(torch.zeros(1, self.prewarm_samples(), 1), state)
            x = torch.from_numpy(np.asarray(x, np.float32))
            out = np.empty(len(x), np.float32)
            for s in range(0, len(x), block):
                h, state = self.core(x[s:s + block].view(1, -1, 1), state)
                out[s:s + h.shape[1]] = (h[0] @ self.head_w.T + self.head_b)[:, 0].numpy()
            return out


def build(d, size=1.0):
    arch, sr = d.get("architecture"), d.get("sample_rate", -1.0)
    if arch == "WaveNet":
        return WaveNet(d["config"], d["weights"], sr)
    if arch == "LSTM":
        return LSTM(d["config"], d["weights"], sr)
    if arch == "SlimmableContainer":
        subs = d["config"]["submodels"]
        pick = next((s for s in subs if size < s["max_value"]), subs[-1]) if size < 1.0 else subs[-1]
        m = dict(pick["model"])
        m.setdefault("sample_rate", sr)
        return build(m)
    raise NotImplementedError(f"the architecture {arch}")


def load(path, size=1.0):
    """A capture ready to play, its metadata in .meta; NotImplementedError for what the Studio cannot read yet, ValueError for a broken file."""
    try:
        d = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError(f"not a NAM capture ({type(e).__name__})") from None
    if not isinstance(d, dict) or "architecture" not in d or "weights" not in d:
        raise ValueError("not a NAM capture (no architecture or weights)")
    try:
        m = build(d, size)
    except (KeyError, TypeError, IndexError) as e:
        raise ValueError(f"a NAM file the Studio cannot lay out (version {d.get('version', '?')}, {type(e).__name__} {e})") from None
    m.meta = d.get("metadata") or {}
    if d["architecture"] == "SlimmableContainer":
        sub = d["config"]["submodels"][-1]["model"]
        m.meta = {**(sub.get("metadata") or {}), **m.meta}
    m.rate = int(d["sample_rate"]) if isinstance(d.get("sample_rate"), (int, float)) and d["sample_rate"] > 0 else DEFAULT_RATE
    m.arch = d["architecture"]
    return m


def db_to_amp(db):
    return 10.0 ** (db / 20.0)


def gains(meta, interface_dbu=INTERFACE_DBU):
    """(input gain, output gain) in dB as the NAM plugin sets them around a capture: 0 dBFS is interface_dbu at the gear's input (the capture's
    input_level_dbu is the dBu of a 0 dBFS sine at its reamp), and the output normalized to −18 by the capture's measured loudness."""
    gi = interface_dbu - float(meta["input_level_dbu"]) if isinstance(meta.get("input_level_dbu"), (int, float)) else 0.0
    go = TARGET - float(meta["loudness"]) if isinstance(meta.get("loudness"), (int, float)) else 0.0
    return gi, go


# ── the sound around it ─────────────────────────────────────────────────────────────────────────────────────────────────

def resample(x, a, b):
    """x at a Hz → b Hz: soxr's very high quality where it is (librosa brings it), else scipy's polyphase filter."""
    if a == b:
        return np.asarray(x, np.float32)
    try:
        import soxr
        return np.asarray(soxr.resample(x, a, b, quality="VHQ"), np.float32)
    except ImportError:
        from scipy.signal import resample_poly
        g = math.gcd(int(a), int(b))
        return np.asarray(resample_poly(x, int(b) // g, int(a) // g), np.float32)


def cab_taps(rate):
    """The generic cab's taps at rate: CAB_CURVE up to the rate's Nyquist (its last value held beyond), an odd count, centred."""
    from scipy.signal import firwin2
    nyq = rate / 2.0
    fx, gx = [p[0] for p in CAB_CURVE], [p[1] for p in CAB_CURVE]
    f = [p for p in fx if p < nyq] + [nyq]
    return firwin2(int(CAB_SECONDS * rate) | 1, f, [db_to_amp(float(np.interp(v, fx, gx))) for v in f], fs=rate)


def cab(y, rate):
    """y (frames × channels) through the generic cab, zero-phase: no delay, the length kept."""
    from scipy.signal import oaconvolve
    h = cab_taps(rate)
    return oaconvolve(y, h[:, None] if np.ndim(y) == 2 else h, mode="same", axes=0)


def level_db(x, rate, ref=None):
    """The loudness of what sounds, in dB: the power of the 0.4 s blocks within 40 dB of the loudest (ref's blocks pick them when given)."""
    x = np.asarray(x, np.float64)
    x = x[:, None] if x.ndim == 1 else x
    r = x if ref is None else (np.asarray(ref, np.float64)[:, None] if np.asarray(ref).ndim == 1 else np.asarray(ref, np.float64))
    n = max(1, int(0.4 * rate))
    k = max(1, min(len(x), len(r)) // n)
    if len(x) < n:
        p = float(np.mean(x ** 2))
        return 10 * math.log10(p) if p > 0 else -200.0
    px = np.mean(x[:k * n].reshape(k, n, -1) ** 2, axis=(1, 2))
    pr = np.mean(r[:k * n].reshape(k, n, -1) ** 2, axis=(1, 2))
    top = float(pr.max())
    if top <= 0:
        return -200.0
    keep = pr >= top * 1e-4
    p = float(np.mean(px[keep]))
    return 10 * math.log10(p) if p > 0 else -200.0


def render(x, rate, model, drive_db=0.0, out_db=0.0, mix=1.0, threads=2, with_cab=False):
    """The stem x (frames × channels, float) at rate through the capture (and the generic cab with with_cab): (the result, what was done).
    Refused in words for a silent stem or a capture that gives no sound or no numbers."""
    x = np.asarray(x, np.float32)
    x = x[:, None] if x.ndim == 1 else x
    frames, chans = x.shape
    lin = level_db(x, rate)
    if lin < -70:
        raise Refused(f"the stem is silent ({lin:.0f} dB): nothing for the amp to play" if lin > -150 else "the stem is silent: nothing for the amp to play")
    gi, go = gains(model.meta)
    mid_only, side_db = False, None
    if chans == 2:
        mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
        side_db = level_db(side, rate, mid) - level_db(mid, rate)
        mid_only = side_db < SIDE_DB
        ins = [mid] if mid_only else [x[:, 0], x[:, 1]]
    else:
        ins = [x[:, c] for c in range(chans)]

    def one(sig):
        s = resample(sig, rate, model.rate) * np.float32(db_to_amp(gi + drive_db))
        y = model.process(s)
        if not np.all(np.isfinite(y)):
            raise Refused("the capture gave no numbers (NaN or infinity) for this stem: try less drive, or another capture")
        y = resample(y * np.float32(db_to_amp(go)), model.rate, rate)
        return np.pad(y, (0, max(0, frames - len(y))))[:frames]

    import torch
    torch.set_num_threads(max(1, min(2, (os.cpu_count() or 2) // 2)))
    with ThreadPoolExecutor(max(1, min(len(ins), threads))) as ex:
        outs = list(ex.map(one, ins))
    wet = np.stack(outs * chans if mid_only else outs, axis=1).astype(np.float64)
    dc_db = 20 * math.log10(float(np.abs(wet.mean(axis=0)).max()) + 1e-12)
    if with_cab:
        wet = cab(wet, rate)
    from scipy.signal import butter, sosfiltfilt
    wet = sosfiltfilt(butter(2, 10.0, "highpass", fs=rate, output="sos"), wet, axis=0)
    lwet = level_db(wet, rate, x)
    if lwet < -100:
        raise Refused(f"the capture gave silence for this stem ({lwet:.0f} dB): try more drive, or another capture")
    matched = lin - lwet
    wet *= db_to_amp(matched)
    mix = min(1.0, max(0.0, float(mix)))
    # HERESY 2994: equal power, and the blend brought back to the stem's loudness: the amp's harmonics and the stem's own sum otherwise
    # 0…3 dB under it at half, by how alike they are; so the output knob means the same at every dry/wet
    out = math.sqrt(mix) * wet + math.sqrt(1.0 - mix) * x.astype(np.float64)
    blend = 0.0
    if 0.0 < mix < 1.0:
        lb = level_db(out, rate, x)
        if lb > -150:
            blend = lin - lb
            out *= db_to_amp(blend)
    out *= db_to_amp(out_db)
    peak = float(np.abs(out).max())
    lowered = 0.0
    if peak > 0.98:
        lowered = 20 * math.log10(0.98 / peak)
        out *= 0.98 / peak
    return out.astype(np.float32), {"input_gain_db": round(gi, 2), "output_gain_db": round(go, 2), "drive_db": round(float(drive_db), 2),
                                    "matched_db": round(matched, 2), "out_db": round(float(out_db), 2), "mix": round(mix, 3),
                                    "blend_db": round(blend, 2), "cab": "generic" if with_cab else "",
                                    "mid_only": mid_only, "side_db": None if side_db is None else round(side_db, 1),
                                    "dc_db": round(dc_db, 1), "lowered_db": round(lowered, 2), "capture_rate": model.rate,
                                    "level_in_db": round(lin, 2)}


# ── the list ────────────────────────────────────────────────────────────────────────────────────────────────────────────
_seen = {}   # a file's path → ((size, mtime), its entry): read once while it stays the same


def _studio_info(root):
    try:
        d = json.loads((root / "captures.json").read_text(encoding="utf-8"))
        return {str(c.get("file")): c for c in d.get("captures") or [] if isinstance(c, dict)}
    except (OSError, ValueError, AttributeError):
        return {}


def _read(path):
    """name, gear, maker, author, architecture, rate and whether the Studio reads it, from the file itself."""
    st = path.stat()
    key = (st.st_size, st.st_mtime_ns)
    hit = _seen.get(str(path))
    if hit and hit[0] == key:
        return dict(hit[1])
    e = {"kb": round(st.st_size / 1024, 1), "ok": True, "why": ""}
    try:
        m = load(path)
        meta = m.meta
        e.update(arch=m.arch, rate=m.rate)
    except NotImplementedError as x:
        e.update(ok=False, why=f"the Studio cannot read its {x} yet")
        try:
            meta = json.loads(path.read_text(encoding="utf-8")).get("metadata") or {}
        except (OSError, ValueError, AttributeError):
            meta = {}
    except ValueError as x:
        e.update(ok=False, why=str(x))
        meta = {}
    meta = meta if isinstance(meta, dict) else {}
    s = lambda k: str(meta.get(k) or "").strip()[:120]   # noqa: E731
    e.update(name=s("name") or path.stem, gear=" ".join(x for x in (s("gear_make"), s("gear_model")) if x), maker=s("gear_make"),
             author=s("modeled_by"), kind=s("gear_type"), tone=s("tone_type"))
    _seen[str(path)] = (key, dict(e))
    return e


def _files(root):
    if not root.is_dir():
        return []
    return sorted((p for p in root.rglob("*") if p.suffix.lower() == ".nam" and p.is_file()), key=lambda p: p.relative_to(root).as_posix().lower())


def listing(kit):
    """The captures here, grouped: the Studio's set by kind, then the user's own (user/nam/, made if missing so it can be found)."""
    kit = Path(kit)
    studio, user = paths.at(STUDIO, kit), kit / USER        # the models' folder where the user moved it (places.py)
    try:
        user.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    info = _studio_info(studio)
    groups = {k: [] for k, _ in KINDS}
    for p in _files(studio):
        rel = p.relative_to(studio).as_posix()
        e, c = _read(p), info.get(rel, {})
        kind = str(c.get("type") or rel.split("/")[0])
        e.update(id="studio:" + rel, name=str(c.get("name") or e["name"]), gear=str(c.get("gear") or e["gear"]), maker=str(c.get("maker") or e["maker"]),
                 author=str(c.get("author") or e["author"]), licence=str(c.get("licence") or ""), source=str(c.get("source") or ""))
        kind = kind if kind in groups else "other"
        e["head"] = kind == "guitar" and (e.get("kind") in HEADS or not e.get("kind"))   # 2994: Auto puts the generic cab after it
        groups[kind].append(e)
    mine = []
    for p in _files(user):
        rel = p.relative_to(user).as_posix()
        e = _read(p)
        e.update(id="user:" + rel, file=rel, licence="", source="", head=False)   # 2994: the cab on yours only when asked
        mine.append(e)
    out = [{"id": k, "label": label, "captures": groups[k]} for k, label in KINDS if groups[k]]
    if mine:
        out.append({"id": YOURS[0], "label": YOURS[1], "captures": mine})
    n = sum(len(g["captures"]) for g in out)
    return {"groups": out, "count": n, "studio": any(g["id"] != YOURS[0] for g in out), "user_dir": USER + "/",
            "empty": NONE_HERE if not n else ""}


# HERESY 3012 (Viktor 25.11.2026, on NAM: «прикрути возможность подгружать собственные снимки, которые пользователи имеют у себя»): a capture of the
# user's own from the page's «Add capture…»: its bytes read as the step will play them (JSON, an architecture the engine above lays out, the
# torch model built from it), then kept in user/nam/ under a safe name; a refusal in words, nothing left behind. The largest NAM captures are a few
# MB (a slimmable container of four WaveNets); 64 MB is a file that is not one
ADD_MOST = 64 * 1024 * 1024
ADD_LEAST = 64
ARCHS = ("WaveNet", "LSTM", "SlimmableContainer")
_RESERVED = {"CON", "PRN", "AUX", "NUL"} | {f"{p}{i}" for p in ("COM", "LPT") for i in range(1, 10)}   # names Windows will not make


def safe_name(name, fallback=""):
    """A file name for user/nam/: the sent name's last part without its .nam, letters of any script, digits, space, «.», «_» and «-» kept, the rest
    «_», at most 80 characters, never hidden, never a name Windows reserves; the capture's own name, then «capture», when nothing is left."""
    def clean(s):
        s = unicodedata.normalize("NFC", str(s or "")).replace("\\", "/").rsplit("/", 1)[-1]
        if s.lower().endswith(".nam"):
            s = s[:-4]
        s = re.sub(r"[^\w .-]+", "_", s)
        s = re.sub(r"\s+", " ", s).strip(" ._-")
        return s[:80].rstrip(" ._-")
    stem = clean(name) or clean(fallback) or "capture"
    if stem.split(".")[0].upper() in _RESERVED:
        stem = "_" + stem
    return stem + ".nam"


def add(kit, data, name=""):
    """{id, file, name, arch, kb, same}: the capture kept in user/nam/ (the same bytes already there: that file, same true); Refused in words."""
    data = bytes(data or b"")
    if not data:
        raise Refused("no file was sent")
    if len(data) > ADD_MOST:
        raise Refused("a NAM capture is at most 64 MB")
    if len(data) < ADD_LEAST:
        raise Refused("too small to be a NAM capture")
    try:
        d = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise Refused("not a NAM capture: a .nam file is JSON, and this is not") from None
    if not isinstance(d, dict) or "architecture" not in d or "weights" not in d:
        raise Refused("not a NAM capture: it has no architecture or weights")
    arch = d.get("architecture")
    if arch not in ARCHS:
        raise Refused(f"its architecture «{str(arch)[:40]}» is not one the Studio plays (WaveNet, LSTM, or a slimmable container of them)")
    user = Path(kit) / USER
    user.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".adding-", suffix=".part", dir=str(user))   # not .nam: never listed while it is read
    part = Path(tmp)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        try:
            m = load(part)
        except NotImplementedError as e:
            raise Refused(f"the Studio cannot read its {e} yet") from None
        except ValueError as e:
            raise Refused(str(e)) from None
        meta = m.meta if isinstance(m.meta, dict) else {}
        target = user / safe_name(name, str(meta.get("name") or ""))
        same, k = False, 1
        while target.exists():
            try:
                if target.is_file() and target.read_bytes() == data:
                    same = True
                    break
            except OSError:
                pass
            k += 1
            target = user / (safe_name(name, str(meta.get("name") or ""))[:-4] + f"-{k}.nam")
        if not same:
            os.replace(part, target)
    finally:
        if part.exists():
            part.unlink()
    rel = target.relative_to(user).as_posix()
    return {"id": "user:" + rel, "file": rel, "name": str(meta.get("name") or "").strip()[:120] or target.stem, "arch": m.arch,
            "kb": round(len(data) / 1024, 1), "same": same}


def resolve(kit, cid):
    """A capture's id (studio:… or user:…) → its file here; Refused in words when it is not (any more), or points outside its folder."""
    cid = str(cid or "")
    where, _, rel = cid.partition(":")
    roots = {"studio": paths.at(STUDIO, Path(kit)), "user": Path(kit) / USER}
    if where not in roots or not rel:
        raise Refused("choose a capture first" if not cid else f"«{cid}» is not a capture of the Studio's or of user/nam/")
    root = roots[where].resolve()
    p = (root / rel).resolve()
    if root not in p.parents or p.suffix.lower() != ".nam" or not p.is_file():
        raise Refused(f"the capture {rel} is not here any more: choose another")
    return p


def describe(kit, cid):
    """The list's entry of one capture (its name, gear, maker, author, licence), or a bare one."""
    for g in listing(kit)["groups"]:
        for c in g["captures"]:
            if c["id"] == cid:
                return dict(c, group=g["id"])
    return {"id": cid, "name": str(cid).rpartition("/")[2], "gear": "", "maker": "", "author": "", "licence": "", "group": ""}
