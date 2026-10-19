"""HERESY 1547 · the Refiner's Digital Gateway (Viktor 17.10.2026: «Вот цифровой шлюз в паблик, и обогати его по максимуму.
Аналоговый — это приватный Pro»). A take, or a file made from it, through an analog character in numbers (numpy and scipy, no
plugin host): the character's curve at a drive, oversampled; its tone, its noise, its movement in time; then as loud as it came.

The characters:
  tape         record emphasis into a soft asymmetric curve and back out; the head bump and the top by the speed (30, 15 and
               7.5 ips, and 3.75 for a cassette's top); hiss; wow and flutter (the transport's speed wandering); azimuth (one
               side a few microseconds late, a head not quite square)
  console      the odd harmonics of a soft clip, the lows a little thicker, crosstalk from the other side (its highs)
  tube         the even harmonics of an asymmetric curve, a soft sag when it is pushed (the supply giving a little)
  transformer  the lows saturate first (the iron), the rest nearly clean
  vinyl        a mild curve, the lows folded to mono (as a cut must have them), the top rolled off, surface noise and crackle,
               rumble, wow

Every knob is the character's own unless set. The order: wow and flutter · emphasis (tape) · noise · sag (tube) · drive · the
curve at N× · back · the character's tone · azimuth · crosstalk · width · the source mixed in (parallel) · level (as it came, or
as it comes out) · trim · the true peak held under −0.3 dBTP (said). Stateful parts run at the file's own rate, the curve in
blocks at N×, so a long song costs no more memory than a short one.

    digital_gate.py IN OUT.flac PARAMS.json    → one line of JSON: what was set, the harmonics it adds to a −12 dBFS tone, levels
"""
import json
import math
import sys
import time

import numpy as np
import soundfile as sf
from scipy import signal

CHARS = ("tape", "console", "tube", "transformer", "vinyl")
SPEEDS = {"30": {"emph": 2.0, "bump": 100.0, "top": 22000.0}, "15": {"emph": 3.0, "bump": 55.0, "top": 18000.0},
          "7.5": {"emph": 4.5, "bump": 35.0, "top": 14000.0}, "3.75": {"emph": 6.0, "bump": 28.0, "top": 11000.0}}
DEFAULTS = {
    "tape": {"drive_db": 4.0, "grain_db": -72.0, "wow": 0.04, "flutter": 0.03, "crosstalk_db": -120.0, "azimuth_us": 0.0, "speed": "15"},
    "console": {"drive_db": 6.0, "grain_db": -92.0, "wow": 0.0, "flutter": 0.0, "crosstalk_db": -50.0},
    "tube": {"drive_db": 6.0, "grain_db": -86.0, "wow": 0.0, "flutter": 0.0, "crosstalk_db": -120.0, "sag": 0.3},
    "transformer": {"drive_db": 6.0, "grain_db": -100.0, "wow": 0.0, "flutter": 0.0, "crosstalk_db": -120.0},
    "vinyl": {"drive_db": 2.0, "grain_db": -64.0, "wow": 0.08, "flutter": 0.02, "crosstalk_db": -30.0, "crackle": 0.3, "rumble_db": -62.0,
              "mono_below_hz": 150.0},
}
COMMON = {"width": 1.0, "mix": 1.0, "oversample": 4, "level": "came", "trim_db": 0.0, "seed": 1547, "azimuth_us": 0.0, "sag": 0.0,
          "crackle": 0.0, "rumble_db": -120.0, "mono_below_hz": 0.0, "speed": "15"}
RANGES = {"drive_db": (-6, 24), "grain_db": (-120, -40), "wow": (0, 1), "flutter": (0, 0.5), "crosstalk_db": (-120, -20), "azimuth_us": (0, 60),
          "sag": (0, 1), "crackle": (0, 1), "rumble_db": (-120, -40), "mono_below_hz": (0, 400), "width": (0, 2), "mix": (0, 1), "trim_db": (-12, 12)}
OFF_DB = -119.5                                      # a level at or under this is off
CEILING = -0.3


def settings(raw):
    """The character's defaults under what was set; every number in its range, the rest refused by name."""
    raw = dict(raw or {})
    ch = raw.get("character", "tape")
    if ch not in CHARS:
        raise ValueError(f"the character is one of {list(CHARS)}, got {ch!r}")
    p = dict(COMMON, **DEFAULTS[ch])
    for k, v in raw.items():
        if k == "character":
            continue
        if k not in p:
            raise ValueError(f"unknown setting {k!r}")
        p[k] = v
    for k, (lo, hi) in RANGES.items():
        try:
            x = float(p[k])
        except (TypeError, ValueError):
            raise ValueError(f"{k} must be a number") from None
        if not (math.isfinite(x) and lo <= x <= hi):
            raise ValueError(f"{k} must be between {lo:g} and {hi:g}, got {x:g}")
        p[k] = x
    if str(p["speed"]) not in SPEEDS:
        raise ValueError(f"the tape speed is one of {list(SPEEDS)} ips")
    p["speed"] = str(p["speed"])
    if int(p["oversample"]) not in (2, 4, 8):
        raise ValueError("oversample is 2, 4 or 8")
    p["oversample"] = int(p["oversample"])
    if p["level"] not in ("came", "out"):
        raise ValueError('level is "came" (as loud as it came) or "out" (as it comes out)')
    p["seed"] = int(p["seed"])
    p["character"] = ch
    return p


# ---- RBJ biquads, as a second-order section each
def bq(kind, f, sr, gain_db=0.0, q=0.7071):
    f = min(float(f), 0.45 * sr)
    w = 2 * math.pi * f / sr
    c, s = math.cos(w), math.sin(w)
    a = 10 ** (gain_db / 40)
    al = s / (2 * q)
    if kind == "lowpass":
        b, d = [(1 - c) / 2, 1 - c, (1 - c) / 2], [1 + al, -2 * c, 1 - al]
    elif kind == "highpass":
        b, d = [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]
    elif kind == "peak":
        b, d = [1 + al * a, -2 * c, 1 - al * a], [1 + al / a, -2 * c, 1 - al / a]
    elif kind in ("lowshelf", "highshelf"):
        sq = 2 * math.sqrt(a) * al
        if kind == "lowshelf":
            b = [a * ((a + 1) - (a - 1) * c + sq), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - sq)]
            d = [(a + 1) + (a - 1) * c + sq, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - sq]
        else:
            b = [a * ((a + 1) + (a - 1) * c + sq), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - sq)]
            d = [(a + 1) - (a - 1) * c + sq, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - sq]
    else:
        raise ValueError(kind)
    return [b[0] / d[0], b[1] / d[0], b[2] / d[0], 1.0, d[1] / d[0], d[2] / d[0]]


def eq(x, sr, sections):
    return signal.sosfilt(np.array(sections), x, axis=0) if sections else x


def pink(count, rng):
    """Pink noise (Voss–McCartney, 16 rows), unit RMS."""
    out = np.zeros(count)
    for k in range(16):
        step = 2 ** k
        out += np.repeat(rng.standard_normal(count // step + 1), step)[:count]
    return out / (np.sqrt(np.mean(out ** 2)) + 1e-30)


def speed_wander(n, sr, wow, flutter, rng):
    """The transport's speed, relative (0 = true): a slow wow (0.55 Hz, a 33⅓ record's turn) and a flutter of two tones and a
    little noise between 3 and 20 Hz; its peaks the % asked."""
    t = np.arange(n) / sr
    s = (wow / 100) * np.sin(2 * math.pi * 0.55 * t + rng.uniform(0, 2 * math.pi))
    if flutter > 0:
        nz = signal.sosfiltfilt(signal.butter(2, [3, 20], btype="band", fs=sr, output="sos"), rng.standard_normal(n))
        nz /= np.max(np.abs(nz)) + 1e-30
        fl = 0.6 * np.sin(2 * math.pi * 6.3 * t + rng.uniform(0, 2 * math.pi)) + 0.4 * nz
        s = s + (flutter / 100) * fl / (np.max(np.abs(fl)) + 1e-30)
    return s


def read_at(x, pos):
    """x (frames, ch) read at fractional positions, Catmull-Rom between its samples."""
    n = len(x)
    i = np.floor(pos).astype(np.int64)
    f = (pos - i)[:, None]
    g = lambda k: x[np.clip(i + k, 0, n - 1)]   # noqa: E731
    p0, p1, p2, p3 = g(-1), g(0), g(1), g(2)
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))


def curve(u, ch, lo=None):
    """The character's curve, sample by sample (at N×); `lo`: the transformer's lows, given apart."""
    if ch == "tape":
        b = 0.12
        return np.tanh(u + b) - math.tanh(b)
    if ch == "console":
        return np.where(np.abs(u) < 1.5, u - u ** 3 / 6.75, np.sign(u))
    if ch == "tube":
        t = np.tanh(u)
        return t + 0.12 * t * t
    if ch == "transformer":
        return np.tanh(1.6 * lo) / 1.6 + u + 0.1 * (np.tanh(u) - u)
    return 0.98 * np.tanh(u) + 0.03 * np.tanh(u) ** 2   # vinyl: the cutter and the stylus, mild and even


def through(x, sr, p, lo=None):
    """The curve at N× in blocks: up, the curve at the drive, back down; exact to the whole-file way (the pads are the filters')."""
    os_, g, ch = p["oversample"], 10 ** (p["drive_db"] / 20), p["character"]
    n, B, P = len(x), 65536, 64
    out = np.empty_like(x)
    zero = np.zeros((P,) + x.shape[1:])
    for a in range(0, n, B):
        b = min(n, a + B)
        seg = np.concatenate([x[max(0, a - P):a] if a >= P else np.concatenate([zero[: P - a], x[:a]]), x[a:b],
                              x[b:b + P] if b + P <= n else np.concatenate([x[b:], zero[: P - (n - b)]])])
        u = signal.resample_poly(seg, os_, 1, axis=0) * g
        if lo is not None:
            ls = np.concatenate([lo[max(0, a - P):a] if a >= P else np.concatenate([zero[: P - a], lo[:a]]), lo[a:b],
                                 lo[b:b + P] if b + P <= n else np.concatenate([lo[b:], zero[: P - (n - b)]])])
            lu = signal.resample_poly(ls, os_, 1, axis=0) * g
            v = curve(u - lu, ch, lu)
        else:
            v = curve(u, ch)
        w = signal.resample_poly(v / g, 1, os_, axis=0)
        out[a:b] = w[P:P + (b - a)]
    return out


def delay_side(y, sr, us):
    """The second side `us` microseconds late (an exact fractional delay, in the frequency domain, padded)."""
    if y.shape[1] < 2 or us <= 0:
        return y
    n = len(y)
    m = 1 << int(math.ceil(math.log2(n + sr)))
    f = np.fft.rfftfreq(m, 1 / sr)
    Y = np.fft.rfft(y[:, 1], m) * np.exp(-2j * math.pi * f * us * 1e-6)
    y = y.copy()
    y[:, 1] = np.fft.irfft(Y, m)[:n]
    return y


def harmonics(sr, p):
    """What the curve adds to a 1 kHz tone at −12 dBFS: the 2nd and 3rd harmonics against it, dB, and the THD in %."""
    n = sr // 2
    t = np.arange(n) / sr
    x = (10 ** (-12 / 20) * np.sin(2 * math.pi * 1000 * t))[:, None]
    lo = eq(x, sr, [bq("lowpass", 120, sr)]) if p["character"] == "transformer" else None
    y = through(x, sr, dict(p, drive_db=p["drive_db"]), lo)[n // 4:, 0]
    w = np.hanning(len(y))
    spec = np.abs(np.fft.rfft(y * w))
    hz = np.fft.rfftfreq(len(y), 1 / sr)
    pk = lambda f: float(np.sqrt(np.sum(spec[max(0, int(round(f / hz[1])) - 3): int(round(f / hz[1])) + 4] ** 2)))   # noqa: E731
    f1, h = pk(1000), [pk(1000 * k) for k in range(2, 6) if 1000 * k < sr / 2]
    db = lambda v: round(20 * math.log10(v / f1 + 1e-30), 1)   # noqa: E731
    return {"h2_db": db(h[0]), "h3_db": db(h[1]), "thd_pct": round(100 * math.sqrt(sum(v * v for v in h)) / f1, 3)}


def process(x, sr, raw):
    """x (frames, channels) float64 → (y, report). The whole gateway."""
    from plenio_core.audio.loudness import measure, true_peak
    p = settings(raw)
    ch, n = p["character"], len(x)
    rng = np.random.default_rng(p["seed"])
    dry = x
    lufs_in = measure(x.T, sr, with_true_peak=False).integrated_lufs
    y = x.copy()
    # the transport
    if p["wow"] > 0 or p["flutter"] > 0:
        s = speed_wander(n, sr, p["wow"], p["flutter"], rng)
        pos = np.arange(n) + np.cumsum(s)
        pos -= np.linspace(0, pos[-1] - (n - 1), n)        # no drift over the song: it ends where it ended
        y = read_at(y, pos)
    sp = SPEEDS[p["speed"]]
    if ch == "tape":
        y = eq(y, sr, [bq("highshelf", 3000, sr, sp["emph"])])
    # the noise before the curve (it saturates with the sound), its colour the character's
    if p["grain_db"] > OFF_DB and ch != "vinyl":
        nz = np.stack([pink(n, rng) for _ in range(y.shape[1])], 1)
        if ch in ("console", "transformer"):
            nz = 0.5 * nz + 0.5 * rng.standard_normal(nz.shape)
        if ch == "tape":
            nz = eq(nz, sr, [bq("highshelf", 4000, sr, 4.0)])
        nz *= 10 ** (p["grain_db"] / 20) / (np.sqrt(np.mean(nz ** 2)) + 1e-30)
        y = y + nz
    if ch == "tube" and p["sag"] > 0:                       # the supply gives a little when it is pushed
        g = 10 ** (p["drive_db"] / 20)
        a = math.exp(-1 / (0.030 * sr))
        env = np.sqrt(signal.lfilter([1 - a], [1, -a], np.mean((y * g) ** 2, axis=1)) + 1e-30)
        y = y * (1 / (1 + p["sag"] * np.maximum(0, env - 0.3)))[:, None]
    lo = eq(y, sr, [bq("lowpass", 120, sr)]) if ch == "transformer" else None
    y = through(y, sr, p, lo)
    # the character's tone
    post = [bq("highpass", 10, sr)]
    if ch == "tape":
        post += [bq("highshelf", 3000, sr, -sp["emph"]), bq("peak", sp["bump"], sr, 1.5, 1.0), bq("peak", 2.3 * sp["bump"], sr, -0.7, 1.2),
                 bq("highpass", 18, sr)]
        if sp["top"] < 0.45 * sr:
            post.append(bq("lowpass", sp["top"], sr))
    elif ch == "console":
        post.append(bq("lowshelf", 80, sr, 0.4))
    elif ch == "tube":
        post += [bq("lowshelf", 100, sr, 0.5), bq("highshelf", 9000, sr, -0.8)]
    elif ch == "transformer":
        post.append(bq("lowshelf", 60, sr, 0.8))
        if 21000 < 0.45 * sr:
            post.append(bq("lowpass", 21000, sr))
    else:
        post += [bq("highpass", 20, sr)]
        if 16000 < 0.45 * sr:
            post.append(bq("lowpass", 16000, sr))
    y = eq(y, sr, post)
    if ch == "vinyl" and y.shape[1] == 2 and p["mono_below_hz"] > 0:   # the lows folded to mono, as a cut must have them
        side = (y[:, 0] - y[:, 1]) / 2                     # zero-phase: what is taken is exactly the side's lows
        side_lo = signal.sosfiltfilt(signal.butter(4, p["mono_below_hz"], fs=sr, output="sos"), side)
        y = y - np.stack([side_lo, -side_lo], 1)
    if ch == "vinyl":                                       # the surface: noise, crackle, rumble
        if p["grain_db"] > OFF_DB:
            nz = eq(np.stack([pink(n, rng) for _ in range(y.shape[1])], 1), sr, [bq("lowpass", 6000, sr)])
            y = y + nz * 10 ** (p["grain_db"] / 20) / (np.sqrt(np.mean(nz ** 2)) + 1e-30)
        if p["crackle"] > 0:
            k = rng.poisson(p["crackle"] * 30 * n / sr)
            at = rng.integers(0, max(1, n - sr // 100), k)
            cr = np.zeros(y.shape)
            for j, i0 in enumerate(at):
                ln = int(rng.integers(sr // 5000 + 1, sr // 1000 + 2))
                amp = 10 ** (rng.uniform(-52, -26) / 20) * (1 if rng.random() < 0.5 else -1)
                c0 = int(rng.integers(0, y.shape[1])) if y.shape[1] > 1 and rng.random() < 0.6 else -1
                burst = amp * np.exp(-np.arange(ln) / (ln / 3)) * rng.standard_normal(ln)
                if c0 < 0:
                    cr[i0:i0 + ln] += burst[:, None]
                else:
                    cr[i0:i0 + ln, c0] += burst
            y = y + eq(cr, sr, [bq("highpass", 1000, sr)])
        if p["rumble_db"] > OFF_DB:
            r = eq(rng.standard_normal(n)[:, None], sr, [bq("lowpass", 30, sr), bq("lowpass", 30, sr)])
            y = y + r * 10 ** (p["rumble_db"] / 20) / (np.sqrt(np.mean(r ** 2)) + 1e-30)
    if ch == "tape":
        y = delay_side(y, sr, p["azimuth_us"])
    if y.shape[1] == 2 and p["crosstalk_db"] > OFF_DB:      # the other side's highs leak in
        k = 10 ** (p["crosstalk_db"] / 20)
        hi = eq(y, sr, [bq("highpass", 1000, sr)])
        y = y + k * hi[:, ::-1]
    if y.shape[1] == 2 and p["width"] != 1:
        m, s2 = (y[:, 0] + y[:, 1]) / 2, (y[:, 0] - y[:, 1]) / 2 * p["width"]
        y = np.stack([m + s2, m - s2], 1)
    if p["mix"] < 1:
        y = (1 - p["mix"]) * dry + p["mix"] * y
    lufs_wet = measure(y.T, sr, with_true_peak=False).integrated_lufs
    match = 0.0
    if p["level"] == "came" and lufs_in is not None and lufs_wet is not None:
        match = lufs_in - lufs_wet
    y = y * 10 ** ((match + p["trim_db"]) / 20)
    tp = 20 * math.log10(true_peak(y.T, sr) + 1e-30)
    lowered = 0.0
    if tp > CEILING:
        lowered = tp - CEILING
        y = y * 10 ** (-lowered / 20)
    out = measure(y.T, sr)
    rep = {"character": ch, "settings": {k: p[k] for k in sorted(p)}, "harmonics": harmonics(sr, p),
           "lufs_in": None if lufs_in is None else round(lufs_in, 2), "lufs_out": None if out.integrated_lufs is None else round(out.integrated_lufs, 2),
           "tp_out": None if out.true_peak_dbtp is None else round(out.true_peak_dbtp, 2), "matched_db": round(match, 2), "lowered_db": round(lowered, 2),
           "seconds": round(n / sr, 2)}
    return y, rep


def main():
    t0 = time.time()
    src, dst, pfile = sys.argv[1], sys.argv[2], sys.argv[3]
    raw = json.load(open(pfile, encoding="utf-8"))
    x, sr = sf.read(src, dtype="float64", always_2d=True)
    y, rep = process(x, sr, raw)
    sf.write(dst, y.astype(np.float32), sr, subtype="PCM_24")
    rep["took"] = round(time.time() - t0, 1)
    print(json.dumps(rep, ensure_ascii=False))


if __name__ == "__main__":
    main()
