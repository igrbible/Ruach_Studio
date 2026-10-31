"""HERESY 1928 (Viktor 30.10.2026: «амбиентный гром с молнией и шум леса, шум водопада и горной реки… звуки тропических птиц, таких как
канарейка… это всё можем определить в ноду амбиентных эффектов, а в DAW дорожками со своими затуханиями и пиками»; «У Суно такого нет…
ни камина, ни грома, ни воды, ни дождя, ни птиц»): ambient layers under a song.

A layer is a bed (fire, rain, forest, waterfall, river, tropical birds), strikes (thunder) or a song (canary). Its sound comes from the banks
(models/ambient/LAYER/: the steadiest stretches of field recordings, each with its source, licence and whether it may ship, bank.json) or
from synthesis (fire after the fork's procedural_fire, rain, falling and running water, thunder's crack near and roll far, a canary's tours).
A bed is looped from its stretches with crossfades and random starts, so it does not repeat to the ear. Then its shape: its level under the
song, a fade in and out, swells and peaks, and if asked it breathes with the song (louder where the song is, within a few dB); thunder may
strike on the song's own peaks.
    import ambient; x = ambient.render(KIT, "rain", "synth", 240.0, song=None, level_db=-18, fade_in=4, fade_out=6)"""
import json
from pathlib import Path

import numpy as np

SR = 48000
LAYERS = {"fire": "bed", "rain": "bed", "thunder": "strikes", "forest": "bed", "waterfall": "bed", "river": "bed", "birds": "bed", "canary": "song"}
SYNTH = {"rain": ["synth"], "thunder": ["synth"]}   # 1934, 1936: only what his ear let pass (light rain, thunder); the rest out, its code kept
BANK = ("models", "ambient")


# ---- the banks
def bank(kit, layer, public_only=False):
    """The bank's pieces of a layer: [{file, kind, source, title, licence, public, …}] (none when it has no bank)."""
    f = Path(kit).joinpath(*BANK, layer, "bank.json")
    items = json.load(open(f, encoding="utf-8"))["items"] if f.is_file() else []
    return [i for i in items if (i.get("public") or not public_only) and not i.get("refused")]   # 1936: what his ear refused, never played


def preferred(kit, layer, public_only=False):
    """HERESY 1934: a layer's sources in his order (bank.json's «prefer», first), then the rest by steadiness."""
    f = Path(kit).joinpath(*BANK, layer, "bank.json")
    prefer = json.load(open(f, encoding="utf-8")).get("prefer", []) if f.is_file() else []
    items = bank(kit, layer, public_only)
    rest = sorted({i["source"] for i in items} - set(prefer), key=lambda s: min(i.get("steadiness_db", 0) for i in items if i["source"] == s))
    return [s for s in prefer if any(i["source"] == s for i in items)] + rest


def variants(kit, layer, public_only=False):
    """[(variant, label, public)]: each source of the bank (its pieces taken together), then the synthesized ones."""
    seen, out = {}, []
    for i in bank(kit, layer, public_only):
        if i["source"] not in seen:
            seen[i["source"]] = True
            out.append((i["source"], i.get("title") or i["source"], bool(i.get("public"))))
    return out + [(v, v.replace("synth", "synthesis").replace("-", " · "), True) for v in SYNTH.get(layer, [])]


def _read(kit, layer, name):
    import soundfile as sf
    x, r = sf.read(str(Path(kit).joinpath(*BANK, layer, name)), always_2d=True, dtype="float32")
    x = x.T.astype(np.float64)
    if r != SR:
        import librosa
        x = librosa.resample(x, orig_sr=r, target_sr=SR)
    return x


# ---- beds
def loop_bed(pieces, seconds, rng, xfade=3.0):
    """Pieces chained to `seconds`: chunks of 20–40 s from random starts, joined by equal-power crossfades."""
    n, x = int(seconds * SR), int(xfade * SR)
    out = np.zeros((2, n + x))
    at = 0
    while at < n:
        p = pieces[rng.integers(len(pieces))]
        ln = min(p.shape[1], int(rng.uniform(20, 40) * SR))
        a = int(rng.integers(0, max(1, p.shape[1] - ln)))
        chunk = p[:, a:a + ln].copy()
        k = min(x, chunk.shape[1] // 2)
        if at > 0:
            chunk[:, :k] *= np.sin(np.linspace(0, np.pi / 2, k)) ** 1
        chunk[:, -k:] *= np.cos(np.linspace(0, np.pi / 2, k))
        end = min(out.shape[1], at + chunk.shape[1])
        out[:, at:end] += chunk[:, :end - at]
        at = end - k
    return out[:, :n]


# ---- synthesis
def _band(x, lo, hi, order=2):
    from scipy.signal import butter, sosfilt
    nyq = SR / 2
    if lo <= 0:
        return sosfilt(butter(order, min(hi, nyq - 100), fs=SR, output="sos"), x, axis=-1)
    if hi >= nyq - 100:
        return sosfilt(butter(order, lo, btype="high", fs=SR, output="sos"), x, axis=-1)
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x, axis=-1)


def _lfo(n, rng, f, depth):
    return 1 + depth * np.sin(2 * np.pi * f * np.arange(n) / SR + rng.uniform(0, 6.28))


def synth_fire(seconds, rng):
    """The fork's procedural_fire (heresy/MISC/claude-tc/guitar/fireside.py): crackles in calm and busy spells, pops, a breathing hiss, a
    low roar."""
    n = int(seconds * SR)
    out = np.zeros((2, n))
    t, busy = 0.0, False
    while t < seconds:
        busy = (rng.random() < 0.08) != busy if rng.random() < 0.05 else busy
        t += rng.exponential(1 / (14 if busy else 4))
        i = int(t * SR)
        if i >= n:
            break
        pop = rng.random() < 0.04
        ln = int(SR * (rng.uniform(0.02, 0.06) if pop else rng.uniform(0.001, 0.008)))
        burst = rng.standard_normal(ln) * np.exp(-np.linspace(0, 6, ln))
        lo, hi = (300, 1500) if pop else sorted(rng.uniform(1500, 7000, 2) + [0, 800])
        burst = _band(burst, lo, hi) * np.exp(rng.normal(np.log(0.25 if pop else 0.12), 0.6))
        pan = rng.uniform(0.25, 0.75)
        j = min(n, i + ln)
        out[0, i:j] += burst[:j - i] * (1 - pan)
        out[1, i:j] += burst[:j - i] * pan
    hiss = _band(rng.standard_normal((2, n)), 2000, 9000) * 0.006 * _lfo(n, rng, 0.13, 0.4)
    roar = _band(np.cumsum(rng.standard_normal((2, n)), axis=1) * 0.002, 0, 200)
    roar = (roar - _band(roar, 0, 20, 1)) * 0.25 * _lfo(n, rng, 0.31, 0.5)
    return out + hiss + roar


def synth_rain(seconds, rng, heavy=False):
    """A wash (pink-ish noise 400 Hz–9 kHz, slowly breathing), drops on leaves (short noise bursts ringing 1–8 kHz, a few hundred a second),
    and now and then a fat drip near, lower and louder."""
    n = int(seconds * SR)
    white = rng.standard_normal((2, n))
    pink = _band(np.cumsum(white, axis=1) * 0.02 + white * 0.3, 400, 9000) * (0.05 if heavy else 0.03) * _lfo(n, rng, 0.07, 0.3)
    out = pink
    rate = 900 if heavy else 350
    count = int(rate * seconds)
    at = rng.integers(0, n - 2000, count)
    for a in at:
        ln = int(rng.uniform(0.002, 0.015) * SR)
        f = rng.uniform(1000, 8000)
        t = np.arange(ln) / SR
        drop = np.sin(2 * np.pi * f * t) * np.exp(-t * rng.uniform(300, 900)) * rng.standard_normal() * 0.02
        pan = rng.uniform(0, 1)
        out[0, a:a + ln] += drop * (1 - pan)
        out[1, a:a + ln] += drop * pan
    for a in rng.integers(0, n - 8000, int(seconds * (2 if heavy else 0.6))):
        ln = int(0.05 * SR)
        t = np.arange(ln) / SR
        drip = np.sin(2 * np.pi * rng.uniform(400, 1200) * t * (1 + 2 * t)) * np.exp(-t * 60) * 0.08
        out[:, a:a + ln] += drip * rng.uniform(0.3, 1.0, (2, 1))
    return out


def synth_water(seconds, rng, kind="river"):
    """Falling water: deep and bright noise in a slowly wandering balance, the two sides apart. Running water: a lighter wash, with bubbles
    rising (short chirps 300–1500 Hz, tens a second) that make a stream gurgle."""
    n = int(seconds * SR)
    w = rng.standard_normal((2, n))
    if kind == "waterfall":
        deep = _band(np.cumsum(w, axis=1) * 0.01, 30, 900) * _lfo(n, rng, 0.05, 0.25)
        bright = _band(w, 800, 7000) * 0.04 * _lfo(n, rng, 0.11, 0.3)
        return deep * 0.6 + bright
    out = _band(w, 300, 6000) * 0.02 * _lfo(n, rng, 0.09, 0.4)
    for a in rng.integers(0, n - 4000, int(seconds * 45)):
        ln = int(rng.uniform(0.015, 0.06) * SR)
        t = np.arange(ln) / SR
        f0 = rng.uniform(300, 900)
        ph = 2 * np.pi * np.cumsum(f0 * (1 + t / t[-1] * rng.uniform(0.5, 1.5))) / SR
        b = np.sin(ph) * np.sin(np.pi * t / t[-1]) ** 2 * rng.uniform(0.005, 0.03)
        pan = rng.uniform(0.2, 0.8)
        out[0, a:a + ln] += b * (1 - pan)
        out[1, a:a + ln] += b * pan
    return out


def synth_strike(rng, near=True):
    """One strike, 9 s: near, a crack (a sharp broadband tear over 1 kHz, 40–120 ms) and right on it a roll; far, no crack, the roll lower
    and later, as the sky carries it. The roll: low noise (30–250 Hz) in three to six bumps, each dying away."""
    n = int(9.0 * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    start = 0.05 if near else rng.uniform(0.3, 1.2)
    if near:
        ln = int(rng.uniform(0.04, 0.12) * SR)
        crack = _band(rng.standard_normal((2, ln)), 1000, 16000) * np.exp(-np.linspace(0, 5, ln)) * 0.8
        a = int(start * SR)
        out[:, a:a + ln] += crack
    roll = _band(np.cumsum(rng.standard_normal((2, n)), axis=1) * 0.004, 25, 250 if near else 140, 3)
    env = np.zeros(n)
    for _ in range(int(rng.integers(3, 7))):
        b = start + rng.uniform(0.02, 3.5 if near else 5.0)
        env += np.where(t >= b, np.exp(-(t - b) / rng.uniform(0.6, 2.2)) * (1 - np.exp(-(t - b) / (0.02 if near else 0.25))), 0) * rng.uniform(0.4, 1)
    out += roll * env * (1.0 if near else 0.5)
    return out


def _syllable(f0, f1, ms, rng, vib=0.0, bright=0.18):
    ln = int(ms / 1000 * SR)
    t = np.arange(ln) / SR
    f = f0 + (f1 - f0) * (t / t[-1]) ** rng.uniform(0.6, 1.6) + vib * np.sin(2 * np.pi * 70 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.sin(np.pi * t / t[-1]) ** 2
    return (np.sin(ph) + bright * np.sin(2 * ph)) * env


def synth_canary(seconds, rng, style="wild"):
    """A canary's song as tours: one syllable repeated 12–30 times a second for one to four seconds, the next tour another syllable, with
    breaths between phrases. Roller: low and rolling (1.8–3.5 kHz, soft); timbrado: metallic, quicker, brighter (3–5 kHz); wild: tours of
    every kind and leaps, as a canary in the open sings."""
    n = int(seconds * SR)
    out = np.zeros(n)
    t = rng.uniform(0.3, 1.5)
    while t < seconds - 1:
        phrase_end = t + rng.uniform(5, 14)
        while t < min(phrase_end, seconds - 1):
            if style == "roller":
                f0 = rng.uniform(1800, 2800); f1 = f0 + rng.uniform(-300, 600); ms = rng.uniform(35, 60); rate = rng.uniform(14, 22); bright = 0.08
            elif style == "timbrado":
                f0 = rng.uniform(3000, 4500); f1 = f0 + rng.uniform(-800, 800); ms = rng.uniform(20, 35); rate = rng.uniform(22, 30); bright = 0.3
            else:
                f0 = rng.uniform(2000, 5500); f1 = rng.uniform(1800, 6500); ms = rng.uniform(18, 70); rate = rng.uniform(10, 28); bright = 0.2
            dur = rng.uniform(0.8, 3.5)
            syl = _syllable(f0, f1, ms, rng, vib=rng.uniform(0, 120), bright=bright)
            k = 0
            while k / rate < dur:
                a = int((t + k / rate) * SR)
                if a + len(syl) >= n:
                    break
                out[a:a + len(syl)] += syl * rng.uniform(0.7, 1.0) * (0.6 if style == "roller" else 0.8)
                k += 1
            t += dur + rng.uniform(0.03, 0.25)
        t += rng.uniform(1.0, 4.0)
    out = _band(out, 1200, 9000)
    pan = rng.uniform(-0.3, 0.3)
    return np.stack([out * (1 - pan) / 2 + out * 0.5, out * (1 + pan) / 2 + out * 0.5]) * 0.5


# ---- strikes and their times
def strike_times(seconds, rng, song=None, count=4):
    """[(time s, near)]: on the song's own peaks (its loudest moments, 20 s apart at least) when there is a song, else spread at random."""
    if song is not None:
        m = np.abs(song.mean(axis=0))
        hop = SR // 2
        k = len(m) // hop
        env = np.convolve(m[:k * hop].reshape(k, hop).mean(axis=1), np.ones(6) / 6, mode="same")
        order, picked = np.argsort(-env), []
        for i in order:
            t = i * hop / SR
            if 5 < t < seconds - 9 and all(abs(t - p) >= 20 for p, _n in picked):
                picked.append((t, len(picked) % 2 == 0))
            if len(picked) >= count:
                break
        return sorted(picked)
    ts = sorted(rng.uniform(4, max(5, seconds - 10), count))
    return [(float(t), bool(rng.random() < 0.5)) for t in ts]


def strikes_layer(kit, variant, seconds, rng, times, public_only=False):
    """Thunder alone (no rain under it: that is the rain layer's): each strike at its time, near or far, from the bank's strikes (near ones
    where the bank has them) or synthesized."""
    n = int(seconds * SR)
    out = np.zeros((2, n + 10 * SR))
    pieces = [i for i in bank(kit, "thunder", public_only) if variant in ("bank", i["source"])] if variant != "synth" else []
    for t, near in times:
        if pieces:
            pool = [i for i in pieces if bool(i.get("near")) == near] or pieces
            s = _read(kit, "thunder", pool[rng.integers(len(pool))]["file"])
            if not near:
                s = _band(s, 0, 2500)
        else:
            s = synth_strike(rng, near)
        a = int(t * SR)
        out[:, a:a + s.shape[1]] += s[:, :out.shape[1] - a] * (1.0 if near else 0.6)
    return out[:, :n]


# ---- the shape
def _db_curve(n, points):
    """A gain in dB a sample from [(t, dB)] breakpoints, linear between them."""
    if not points:
        return np.zeros(n)
    ts, ds = zip(*sorted(points))
    return np.interp(np.arange(n) / SR, ts, ds)


def _sounding_db(x, win=0.5):
    """The level of a layer where it sounds: the RMS of its louder half of half-second windows."""
    m = (x ** 2).mean(axis=0)
    w = int(win * SR)
    k = max(1, len(m) // w)
    e = m[:k * w].reshape(k, w).mean(axis=1) if len(m) >= w else np.array([m.mean()])
    return 10 * np.log10(np.mean(np.sort(e)[len(e) // 2:]) + 1e-12)


def voice_entry(voice, rate, hold=2.0, below=25.0):
    """HERESY 1931: when a voice comes in: the first moment its half-second level stays within `below` dB of its loudest for `hold` s."""
    m = (voice ** 2).mean(axis=0) if voice.ndim == 2 else voice ** 2
    w = int(0.5 * rate)
    k = len(m) // w
    if k < 4:
        return None
    e = 10 * np.log10(m[:k * w].reshape(k, w).mean(axis=1) + 1e-12)
    on = e > e.max() - below
    need = int(hold / 0.5)
    for i in range(k - need):
        if on[i:i + need].all():
            return i * 0.5
    return None


def shape(x, level_db, fade_in=0.0, fade_out=0.0, song=None, breathe_db=0.0, swells=(), peaks=(), closer=None):
    """x at `level_db` under the song (its RMS against the song's; against −20 dBFS when there is none), faded in and out (from −60 dB),
    breathing with the song (its smoothed loudness, within ±breathe_db), with swells [(start s, length s, dB)] and peaks [(time s, dB)];
    closer (HERESY 1931): (the voice's entry s, dB): that much louder before the voice, settling over the 6 s before it comes in."""
    n = x.shape[1]
    ref = 20 * np.log10(np.sqrt(np.mean(song ** 2)) + 1e-12) if song is not None else -20.0
    own = _sounding_db(x)                               # a thunder or a canary by its strikes and phrases, not by its silences
    g = np.full(n, ref + level_db - own)
    t = np.arange(n) / SR
    if fade_in > 0:
        g += np.where(t < fade_in, -60 * (1 - t / fade_in), 0)
    if fade_out > 0:
        g += np.where(t > n / SR - fade_out, -60 * (t - (n / SR - fade_out)) / fade_out, 0)
    if song is not None and breathe_db > 0:
        m = song.mean(axis=0) ** 2
        hop = SR // 4
        k = len(m) // hop
        e = 10 * np.log10(m[:k * hop].reshape(k, hop).mean(axis=1) + 1e-12)
        e = np.convolve(e, np.ones(12) / 12, mode="same")      # 3 s
        live = e > e.max() - 40
        if live.any():
            d = np.clip(e - np.median(e[live]), -breathe_db, breathe_db)
            g += np.interp(t, np.arange(k) * hop / SR, d)[:n]
    if closer and closer[0] and closer[1]:
        v, db = float(closer[0]), float(closer[1])
        g += np.where(t < v - 6, db, np.where(t < v, db * (v - t) / 6, 0.0))
    for a, ln, db in swells:
        g += np.where((t >= a) & (t <= a + ln), db * np.sin(np.pi * np.clip((t - a) / max(ln, 1e-3), 0, 1)) ** 2, 0)
    for a, db in peaks:
        g += db * np.exp(-0.5 * ((t - a) / 0.6) ** 2)
    return x * 10 ** (g / 20)


def limit(x, rate=SR, ceiling=0.999, hold=0.02):
    """HERESY 1941: x with no sample over `ceiling`, its level kept: the gain dips only around a peak that would pass it (the least gain
    the peak needs, held `hold` s each side, then averaged over no wider a window, so it never comes back above what the peak needs),
    instead of the whole layer scaled by its loudest sample, where one crack in a recording put eight minutes 11 dB under their level."""
    a = np.abs(x).max(axis=0) if x.ndim == 2 else np.abs(x)
    if not a.size or a.max() <= ceiling:
        return x
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    h = max(1, int(hold * rate))
    need = np.minimum(1.0, ceiling / np.maximum(a, 1e-12))
    return x * uniform_filter1d(minimum_filter1d(need, 2 * h + 1, mode="nearest"), 2 * h + 1, mode="nearest")


# ---- a layer
def render(kit, layer, variant, seconds, song=None, seed=7, level_db=-18.0, fade_in=3.0, fade_out=5.0, breathe_db=0.0, swells=(), peaks=(),
           strikes=4, on_peaks=True, public_only=False, closer=None):
    """One layer of `seconds` (a song's length) as [2, frames] at 48 kHz, shaped. variant: a bank's source, "bank" or "bank2", or one
    of SYNTH's; public_only (HERESY 1930): only pieces that may ship; "bank" and "bank2" (1934): the layer's first and second recording
    (bank.json's «prefer», else the steadiest)."""
    if layer not in LAYERS:
        raise ValueError(f"a layer is one of {', '.join(LAYERS)}")
    rng = np.random.default_rng(seed)
    if layer == "thunder":
        times = strike_times(seconds, rng, song if on_peaks else None, strikes)
        x = strikes_layer(kit, variant, seconds, rng, times, public_only)
    elif variant.startswith("synth"):
        x = {"fire": lambda: synth_fire(seconds, rng), "rain": lambda: synth_rain(seconds, rng, heavy=variant.endswith("heavy")),
             "waterfall": lambda: synth_water(seconds, rng, "waterfall"), "river": lambda: synth_water(seconds, rng, "river"),
             "canary": lambda: synth_canary(seconds, rng, variant.split("-", 1)[1] if "-" in variant else "wild")}.get(layer, lambda: None)()
        if x is None:
            raise ValueError(f"{layer} has no synthesis: it is played from its bank")
    else:
        if variant in ("bank", "bank2"):                # 1934: the layer's first recording (his choice, else the steadiest), or its second
            order = preferred(kit, layer, public_only)
            variant = order[min(0 if variant == "bank" else 1, len(order) - 1)] if order else variant
        items = [i for i in bank(kit, layer, public_only) if i["kind"] == "bed" and variant in ("bank", i["source"])]
        if not items:
            raise FileNotFoundError(f"no {layer} piece from {variant}")
        x = loop_bed([_read(kit, layer, i["file"]) for i in items], seconds, rng)
    return shape(x, level_db, fade_in, fade_out, song, breathe_db, swells, peaks, closer)
