"""HERESY 1358 (from SUNO v6, TODO.md: «The boundaries snapped to the music's own changes (spectral novelty) and the instrumental breaks
found by the voice's absence; a slice of the spectrogram in the card (Viktor 10.10)»): where a take's music changes, heard from its own sound,
and a picture of its spectrum over a stretch.

changes(): the sound at 22 050 Hz, mono; its timbre (20 MFCCs) and harmony (12 chroma bins) every HOP seconds, each frame's features
normalised; their self-similarity, and Foote's novelty: a checkerboard kernel KERNEL seconds wide (Gaussian-tapered) slid along the
diagonal, peaking where what came before is unlike what comes after. The peaks at least GAP seconds apart and above the curve's own
middle (a median plus a share of its spread) and above FAINT are the changes, each with its strength (0–1, the strongest 1); none within EDGE seconds of the song's own
start or end (the self-similarity mirrored past them). Kept beside the take (changes.json) for its audio's time and size.

spectrogram(): a mel spectrogram of the stretch (64 bands, 20 Hz–16 kHz) in decibels against the stretch's own loudest, drawn in a
dark-to-amber map W × H, as a PNG; kept in the lab's cache by the take, its audio's time and the stretch."""
import hashlib, io, json, os
from pathlib import Path

import numpy as np

SR, HOP, KERNEL, GAP, EDGE, FAINT = 22050, 0.25, 8.0, 4.0, 1.0, 0.15


def _load(path, offset=0.0, duration=None):
    import librosa
    y, _ = librosa.load(str(path), sr=SR, mono=True, offset=offset, duration=duration)
    return y


def changes(take_dir):
    """[{t, strength}] where the take's music changes, newest kept in changes.json beside it."""
    d = Path(take_dir)
    wav = d / "audio.wav"
    if not wav.is_file():
        raise FileNotFoundError("this take has no audio.wav")
    st = wav.stat()
    keep = d / "changes.json"
    try:
        old = json.loads(keep.read_text(encoding="utf-8"))
        if old.get("mtime") == int(st.st_mtime) and old.get("size") == st.st_size and old.get("kernel") == KERNEL:
            return old
    except (OSError, ValueError):
        pass
    import librosa
    y = _load(wav)
    hop = int(SR * HOP)
    mf = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=20, hop_length=hop)
    ch = librosa.feature.chroma_stft(y=y, sr=SR, hop_length=hop)
    f = np.vstack([mf / (np.linalg.norm(mf, axis=0, keepdims=True) + 1e-9), ch / (np.linalg.norm(ch, axis=0, keepdims=True) + 1e-9)])
    f = f / (np.linalg.norm(f, axis=0, keepdims=True) + 1e-9)
    n = f.shape[1]
    s = f.T @ f                                          # cosine self-similarity, frames × frames
    L = max(4, int(round(KERNEL / HOP / 2)))
    g = np.exp(-0.5 * (np.linspace(-2, 2, 2 * L)) ** 2)
    k = np.outer(g, g) * np.sign(np.outer(np.r_[-np.ones(L), np.ones(L)], np.r_[-np.ones(L), np.ones(L)]))
    nov = np.zeros(n)
    sp = np.pad(s, L, mode="reflect")                  # the edges mirrored: the song's own start and end are not unlike their outside
    for i in range(n):
        nov[i] = np.sum(sp[i:i + 2 * L, i:i + 2 * L] * k)
    nov = np.maximum(nov, 0)
    nov = nov / (nov.max() + 1e-9)
    floor = float(np.median(nov) + 0.5 * np.std(nov))
    wait = int(round(GAP / HOP))
    peaks, i = [], 0
    order = np.argsort(-nov)
    taken = np.zeros(n, dtype=bool)
    for i in order:                                      # the strongest first, each keeping its neighbours off
        if nov[i] < max(floor, FAINT):
            break
        if taken[max(0, i - wait):i + wait + 1].any() or i * HOP < EDGE or (n - 1 - i) * HOP < EDGE:
            continue                                     # the song's own start and end are no changes
        taken[i] = True
        peaks.append(i)
    out = {"mtime": int(st.st_mtime), "size": st.st_size, "kernel": KERNEL, "hop": HOP,
           "seconds": round(len(y) / SR, 3), "changes": [{"t": round(float(i * HOP), 2), "strength": round(float(nov[i]), 3)} for i in sorted(peaks)]}
    try:
        keep.write_text(json.dumps(out), encoding="utf-8")
    except OSError:
        pass
    return out


def _map(x):
    """0–1 to a dark-to-amber colour, as the studio's wave is drawn: night blue, plum, red, amber, pale gold."""
    stops = np.array([[11, 12, 26], [52, 22, 74], [150, 36, 72], [230, 110, 40], [252, 214, 120]], dtype=np.float32)
    x = np.clip(x, 0, 1) * (len(stops) - 1)
    i = np.minimum(np.floor(x).astype(int), len(stops) - 2)
    t = (x - i)[..., None]
    return (stops[i] * (1 - t) + stops[i + 1] * t).astype(np.uint8)


def spectrogram(take_dir, t0, t1, w=320, h=80, cache=None):
    """The mel spectrogram of the take from t0 to t1 as PNG bytes, w × h (kept in cache by the take's audio and the stretch)."""
    d = Path(take_dir)
    wav = d / "audio.wav"
    if not wav.is_file():
        raise FileNotFoundError("this take has no audio.wav")
    t0, t1, w, h = float(t0), float(t1), int(w), int(h)
    if not (0 <= t0 < t1 and t1 - t0 <= 600 and 64 <= w <= 1200 and 32 <= h <= 400):
        raise ValueError("a stretch of up to ten minutes, 64 to 1200 by 32 to 400 pixels")
    st = wav.stat()
    key = hashlib.sha1(f"{d.name}|{int(st.st_mtime)}|{st.st_size}|{t0:.2f}|{t1:.2f}|{w}|{h}".encode()).hexdigest()[:24]
    if cache:
        hit = Path(cache) / (key + ".png")
        if hit.is_file():
            return hit.read_bytes()
    import librosa
    from PIL import Image
    y = _load(wav, offset=t0, duration=t1 - t0)
    if not len(y):
        raise ValueError("the stretch is past the take's end")
    hop = max(64, int(len(y) / w))
    m = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=64, fmin=20, fmax=16000, hop_length=hop, n_fft=2048)
    db = librosa.power_to_db(m, ref=np.max)
    x = (np.clip(db, -70, 0) + 70) / 70
    img = Image.fromarray(_map(x[::-1])).resize((w, h), Image.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    if cache:
        Path(cache).mkdir(parents=True, exist_ok=True)
        tmp = Path(cache) / (key + ".part")
        tmp.write_bytes(data)
        os.replace(tmp, Path(cache) / (key + ".png"))
        olds = sorted(Path(cache).glob("*.png"), key=lambda p: p.stat().st_mtime)
        for p in olds[:-400]:                            # the newest four hundred kept
            p.unlink(missing_ok=True)
    return data


def spectrogram_file(take_dir, t0, t1, w, h, cache):
    """spectrogram()'s PNG as a file in cache, for the lab to send as it sends its files."""
    data = spectrogram(take_dir, t0, t1, w, h, cache)
    key = hashlib.sha1(data).hexdigest()[:24]
    p = Path(cache) / ("by-" + key + ".png")
    if not p.is_file():
        p.write_bytes(data)
    return p
