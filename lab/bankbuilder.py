"""HERESY 2031: the Bank Builder (Viktor 02.11.2026: «дудук уже проявляется в файнтюне, но мало. Шофара вообще не слышал… когда обработаешь их
Слушателем, с нотами и остальным как у нас заведено, можно из них две банки SFZ смастерить в Тренере, и проверим сразу и Тренера и дорожку SFZ
DAW… Нужно отсеять все посторонние звуки, инструменал, если есть человеческие голоса и крики, особенно в записях шофара»).

An SFZ bank from recordings of one wind instrument, in four steps; each leaves its work in datasets/banks/<bank>/, so a step can be made
again without the ones before it:

  material  a folder of datasets/raw/; a yt-dlp .info.json beside a file gives its title, uploader, page and licence
  clean     every file in ten-minute pieces, on a card: the winds out of the rest (UVR 17_HP-Wind_Inst), the voice by BS-Roformer (as a
            detector only: a duduk often lands in a voice stem, so a voice whose pitch is the winds' own is the winds); every second
            measured (the mix, the winds, the rest, the voice, in dB; the winds' pitch); then the Listener (Qwen2.5-Omni, llama-server on the
            same card) asked yes or no on every ten seconds that could be kept: a wind instrument, a human voice, drums, strings or keys, a
            crowd or noise. A second is kept when the winds stand alone (12 dB over the rest, pitched, no voice of their own) and the
            Listener heard nothing else around it
  notes     in the kept stretches: «chromatic» (a duduk) a note is a run of pitched frames within 0.6 semitone of its median, 0.35 s or more,
            with its key, cents, vibrato, level, the drone under it (the dam) and its tail (the room after it); «blasts» (a shofar) the
            calls cut by their envelope and told by their shape: tekiah, shevarim, teruah, tekiah gedolah
  build     the best of each key (or call) cut into samples (48 kHz, 24-bit FLAC; the breath before, the tail after; tuned by its cents;
            looped where a steady part loops cleanly, a wavering one over whole periods of its vibrato, HERESY 2061), velocity layers by
            level, round robins; banks/<bank>/<bank>.sfz and bank.json: every
            sample's source and place, the range, the licence (private unless every source says it may ship). The shelf (banks.py) and
            the DAW's Layer read it at once.

    bankbuilder.py clean BANK FOLDER INSTRUMENT MODE [--no-listen] [--no-voice]     (on the card CUDA_VISIBLE_DEVICES names; the lab starts it)
    bankbuilder.py notes BANK
    bankbuilder.py build BANK [NAME]"""
import base64
import hashlib
import io
import json
import math
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np

AUDIO_EXT = (".flac", ".wav", ".mp3", ".m4a", ".ogg", ".opus", ".webm", ".aif", ".aiff")
MODES = ("chromatic", "blasts")
PIECE_S = 600                       # a long recording (six and twelve hours of shofar) in ten-minute pieces
SR_AN, HOP = 22050, 256             # the analysis: 11.6 ms frames
WIND = "17_HP-Wind_Inst-UVR.pth"
VOICE = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
WINDOW_S = 10
QUESTION = ("This clip should be a wind instrument ({instrument}). Answer each question with yes or no, as one JSON object: "
            "{{\"wind_instrument\": is a wind instrument playing?, \"human_voice\": does a real human speak, shout, sing or pray?, "
            "\"drums\": any drums or percussion?, \"strings_or_keys\": any strings, guitar, piano or synthesizer?, "
            "\"crowd_or_noise\": a crowd, applause, wind noise, hiss or hum?}}. Output only the JSON.")
FOREIGN = ("human_voice", "drums", "strings_or_keys", "crowd_or_noise")
# an instrument's own range (MIDI keys): a periodicity outside it is not its note (the dam under a melody two octaves up reads as one low note)
RANGES = {"duduk": (52, 76)}
# the shofar's calls, by their shape (the blasts of a call, their lengths); on the keys from C3, the pitched tekiah from C4
CALLS = {"tekiah": 48, "shevarim": 50, "teruah": 52, "tekiah gedolah": 53}


def note_name(k):
    return f"{NAMES[k % 12]}{k // 12 - 1}"


def slug(s):
    s = re.sub(r"[^\w.-]+", "-", str(s or "").strip(), flags=re.U).strip("-.")
    return s[:60] or "bank"


def work_dir(kit, bank):
    return Path(kit) / "datasets" / "banks" / slug(bank)


def raw_dir(kit, folder):
    root = (Path(kit) / "datasets" / "raw").resolve()
    d = (root / folder).resolve()
    if root not in d.parents and d != root or not d.is_dir():
        raise ValueError(f"no folder {folder} in datasets/raw")
    return d


def say_progress(w, **kv):
    """The step's state for the lab's job (progress.json in the bank's work folder)."""
    p = w / "progress.json"
    try:
        old = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    old.update(kv, at=time.time())
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(old, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def seconds_of(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def info_of(p):
    """A yt-dlp .info.json beside the file: its title, uploader, page and licence (YouTube's standard one when it says none)."""
    for c in (p.with_suffix(".info.json"), p.parent / (p.stem + ".info.json")):
        if c.is_file():
            try:
                d = json.loads(c.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                break
            return {"title": d.get("title") or p.stem, "uploader": d.get("uploader") or d.get("channel") or "",
                    "url": d.get("webpage_url") or "", "licence": d.get("license") or ("YouTube standard licence" if "youtube" in str(d.get("extractor", "")).lower() else "")}
    return {"title": p.stem, "uploader": "", "url": "", "licence": ""}


def file_id(rel):
    return slug(Path(rel).stem)[:40] + "-" + hashlib.sha1(rel.encode()).hexdigest()[:8]


def material(kit, folder):
    """Step 1: the folder's recordings, each with its length and what its .info.json says."""
    d = raw_dir(kit, folder)
    out = []
    for p in sorted(q for q in d.rglob("*") if q.is_file() and q.suffix.lower() in AUDIO_EXT):
        rel = str(p.relative_to(d))
        out.append(dict({"file": rel, "id": file_id(rel), "seconds": round(seconds_of(p), 1)}, **info_of(p)))
    return out


def decode(p, rate, start=0.0, length=None, mono=True):
    """float32 samples by ffmpeg, mono (rate) or stereo (frames × 2)."""
    cmd = ["ffmpeg", "-v", "error", "-nostdin"] + (["-ss", f"{start:.3f}"] if start else []) + ["-i", str(p)]
    cmd += (["-t", f"{length:.3f}"] if length else []) + ["-ac", "1" if mono else "2", "-ar", str(rate), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)
    return x if mono else x.reshape(-1, 2)


def yin(x, sr=SR_AN, hop=HOP, fmin=80.0, fmax=1400.0, frame=2048, thr=0.15, block=2048):
    """A fast YIN (numpy, FFT autocorrelation), `block` frames at a time (a ten-minute piece whole would want gigabytes): f0 (Hz, nan where
    unpitched) and the aperiodicity (0 pure … 1 noise)."""
    n = 1 + max(0, len(x) - frame) // hop
    if len(x) < frame:
        return np.full(0, np.nan), np.ones(0)
    f0s, aps = [], []
    for b0 in range(0, n, block):
        f, a = _yin_frames(x, b0, min(n, b0 + block), sr, hop, fmin, fmax, frame, thr)
        f0s.append(f)
        aps.append(a)
    return np.concatenate(f0s), np.concatenate(aps)


def _yin_frames(x, f_from, f_to, sr, hop, fmin, fmax, frame, thr):
    n = f_to - f_from
    idx = np.arange(frame)[None, :] + hop * np.arange(f_from, f_to)[:, None]
    fr = x[idx].astype(np.float64)
    w = frame // 2
    # the first half window against the frame moved by tau: Σ_{j<w} x_j x_{j+tau} (a whole frame's autocorrelation sums past w and bends the pitch up)
    ac = np.fft.irfft(np.conj(np.fft.rfft(fr[:, :w], 2 * frame)) * np.fft.rfft(fr, 2 * frame))[:, :w]
    sq = np.cumsum(fr * fr, axis=1)
    e0 = sq[:, w - 1:w]                                 # the energy of the first half window
    shifted = sq[:, w - 1:2 * w - 1] - np.concatenate([np.zeros((n, 1)), sq[:, :w - 1]], axis=1)   # of the window moved by tau
    d = e0 + shifted - 2 * ac
    d[:, 0] = 0
    cm = np.cumsum(d[:, 1:], axis=1)
    cmnd = np.ones_like(d)
    cmnd[:, 1:] = d[:, 1:] * np.arange(1, w)[None, :] / np.maximum(cm, 1e-12)
    lo, hi = int(sr / fmax), min(w - 2, int(sr / fmin))
    seg = cmnd[:, lo:hi]
    below = seg < thr
    first = np.where(below.any(axis=1), below.argmax(axis=1), seg.argmin(axis=1))
    # down the dip from the first point under the threshold to its bottom
    for _ in range(8):
        nxt = np.minimum(first + 1, seg.shape[1] - 1)
        better = seg[np.arange(n), nxt] < seg[np.arange(n), first]
        first = np.where(better, nxt, first)
    tau = first + lo
    a = cmnd[np.arange(n), tau]
    # parabolic refinement
    l, r = cmnd[np.arange(n), np.maximum(tau - 1, 1)], cmnd[np.arange(n), np.minimum(tau + 1, w - 1)]
    den = l - 2 * a + r
    off = np.where(np.abs(den) > 1e-12, 0.5 * (l - r) / np.where(den == 0, 1, den), 0)
    f0 = sr / (tau + np.clip(off, -1, 1))
    loud = np.sqrt(np.mean(fr * fr, axis=1)) > 1e-4
    f0 = np.where((a < 0.35) & loud, f0, np.nan)
    return f0, np.clip(a, 0, 1)


def db(x):
    return float(20 * np.log10(np.sqrt(np.mean(np.square(x, dtype=np.float64))) + 1e-9)) if len(x) else -180.0


# —— step 2: clean ——————————————————————————————————————————————————————————————————————————————————————————————————————————————————————

class Seps:
    """The two separators, loaded once for the whole job (audio-separator, on the card the process sees)."""

    def __init__(self, kit):
        self.kit = Path(kit)
        self.s = {}

    def run(self, which, src, out):
        from audio_separator.separator import Separator
        d, m = (self.kit / "separation/vr", WIND) if which == "wind" else (self.kit / "separation/roformer", VOICE)
        if which not in self.s:
            sep = Separator(model_file_dir=str(d), output_dir=str(out), output_format="FLAC", sample_rate=44100, log_level=30)
            sep.load_model(model_filename=m)
            self.s[which] = sep
        sep = self.s[which]
        sep.output_dir = str(out)
        if getattr(sep, "model_instance", None) is not None:
            sep.model_instance.output_dir = str(out)
        return [Path(f) if Path(f).is_absolute() else out / Path(f).name for f in sep.separate(str(src))]

    def voice_of(self, wav, out, seconds, length):
        """The voice detector on the chosen seconds of a piece only: they are put end to end, split, and each second's voice put back in its
        place (SR_AN mono, `length` samples, silence where it was not asked)."""
        import soundfile as sf
        y, sr = sf.read(str(wav), dtype="float32", always_2d=True)
        part = np.concatenate([y[i * sr:(i + 1) * sr] for i in seconds if i * sr < len(y)])
        cw = out / "cand.wav"
        sf.write(str(cw), part, sr, subtype="FLOAT")
        got = self.split_voice(cw, out)
        v = decode(got["voice"], SR_AN)
        got["voice"].unlink(missing_ok=True)
        cw.unlink(missing_ok=True)
        full = np.zeros(length, dtype=np.float32)
        for j, i in enumerate(seconds):
            a, b = i * SR_AN, min(length, (i + 1) * SR_AN)
            seg = v[j * SR_AN:j * SR_AN + (b - a)]
            full[a:a + len(seg)] = seg
        return full

    def split_voice(self, wav, out):
        """voice.flac alone (the recording measured as it is: no wind split)."""
        got = {}
        for f in self.run("voice", wav, out):
            if "(vocals)" in f.name.lower():
                os.replace(f, out / "voice.flac")
                got["voice"] = out / "voice.flac"
            else:
                f.unlink(missing_ok=True)
        if "voice" not in got:
            raise RuntimeError("the voice detector gave no voice")
        return got

    def split(self, wav, out, voice=True):
        """winds.flac (the wind instrument) and voice.flac (the voice detector's) beside wav; the rest kept as rest.flac. voice False: no
        voice detector (a card-less trial: BS-Roformer on a processor is slower than the music)"""
        got = {}
        for which, names in (("wind", {"(woodwinds)": "winds", "(no woodwinds)": "rest"}), ("voice", {"(vocals)": "voice", "(instrumental)": None}))[: 2 if voice else 1]:
            for f in self.run(which, wav, out):
                for k, v in names.items():
                    if k in f.name.lower():
                        if v:
                            os.replace(f, out / f"{v}.flac")
                            got[v] = out / f"{v}.flac"
                        else:
                            f.unlink(missing_ok=True)
                        break
        missing = ({"winds", "rest"} | ({"voice"} if voice else set())) - set(got)
        if missing:
            raise RuntimeError(f"the separators gave no {', '.join(sorted(missing))}")
        return got


def seconds_table(mix, winds, rest, voice):
    """Every second: the levels, the winds' pitch and how much of it is pitched, the voice's pitch against the winds', and what it is. rest
    None: the recording measured as it is (a shofar: UVR's wind model hears the horn as no woodwind and puts it in the rest), a pitched second
    the instrument's, an unpitched one a bed; what else sounds there is the Listener's to say."""
    sr = SR_AN
    n = min(len(mix), len(winds), len(rest) if rest is not None else len(mix), len(voice)) // sr
    wf, _ = yin(winds[: n * sr])
    vf, _ = yin(voice[: n * sr])
    per = sr / HOP
    rows = []
    for s in range(n):
        a, b = s * sr, (s + 1) * sr
        fa, fb = int(s * per), int((s + 1) * per)
        w, v = wf[fa:fb], vf[fa:fb]
        wv, vv = w[~np.isnan(w)], v[~np.isnan(v)]
        same = None
        if len(wv) and len(vv):
            same = bool(abs(np.median(12 * np.log2(vv / np.median(wv)))) < 0.6)
        r = {"mix": round(db(mix[a:b]), 1), "winds": round(db(winds[a:b]), 1), "rest": round(db(rest[a:b]), 1) if rest is not None else None, "voice": round(db(voice[a:b]), 1),
             "pitched": round(float(len(wv) / max(1, len(w))), 2), "f0": round(float(np.median(wv)), 1) if len(wv) else None, "voice_same": same}
        if r["mix"] < -50:
            k = "silence"
        elif r["voice"] > r["mix"] - 10 and same is not True and r["pitched"] < 0.5:
            k = "voice"
        elif rest is None:
            k = "wind alone" if r["pitched"] >= 0.5 else "bed"
        elif r["winds"] - r["rest"] >= 12 and r["pitched"] >= 0.5:
            k = "wind alone"
        elif r["winds"] - r["rest"] >= 6:
            k = "wind over a bed"
        else:
            k = "bed"
        r["kind"] = k
        rows.append(r)
    return rows


class Listener:
    """Qwen2.5-Omni through llama-server on this process's card, asked yes or no about ten seconds at a time."""

    def __init__(self, kit, instrument):
        self.kit, self.instrument, self.proc, self.url = Path(kit), instrument, None, None

    def start(self):
        m = self.kit / "checkpoints" / "Qwen2.5-Omni-7B-GGUF"
        model, proj = m / "Qwen2.5-Omni-7B-Q8_0.gguf", m / "mmproj-Qwen2.5-Omni-7B-f16.gguf"
        srv = self.kit / "vendor" / "llama.cpp" / "build" / "bin" / "llama-server"
        if not (model.is_file() and proj.is_file() and srv.is_file()):
            raise FileNotFoundError("the Listener needs checkpoints/Qwen2.5-Omni-7B-GGUF (Q8_0 and its mmproj) and vendor/llama.cpp's llama-server")
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        gpu = os.environ.get("CUDA_VISIBLE_DEVICES", "") != ""
        self.proc = subprocess.Popen([str(srv), "-m", str(model), "--mmproj", str(proj), "--host", "127.0.0.1", "--port", str(port),
                                      "-ngl", "99" if gpu else "0", "-c", "4096", "-np", "1", "--temp", "0"] + ([] if gpu else ["-t", os.environ.get("OMP_NUM_THREADS", "16")]),
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.url = f"http://127.0.0.1:{port}"
        for _ in range(240):
            try:
                if json.load(urllib.request.urlopen(self.url + "/health", timeout=3)).get("status") == "ok":
                    return self
            except (OSError, ValueError):
                pass
            if self.proc.poll() is not None:
                break
            time.sleep(1)
        self.stop()
        raise RuntimeError("the Listener's server did not come up")

    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def ask(self, x16):
        """Ten seconds at 16 kHz mono → {question: True/False}, or None when its answer does not read."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes((np.clip(x16, -1, 1) * 32767).astype("<i2").tobytes())
        body = {"messages": [{"role": "user", "content": [
            {"type": "input_audio", "input_audio": {"data": base64.b64encode(buf.getvalue()).decode(), "format": "wav"}},
            {"type": "text", "text": QUESTION.format(instrument=self.instrument)}]}], "max_tokens": 80, "temperature": 0}
        req = urllib.request.Request(self.url + "/v1/chat/completions", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        try:
            text = json.load(urllib.request.urlopen(req, timeout=120))["choices"][0]["message"]["content"]
        except (OSError, ValueError, KeyError, IndexError):
            return None
        m = re.search(r"\{.*\}", text, re.S)
        try:
            d = json.loads(m.group(0)) if m else None
        except ValueError:
            return None
        if not isinstance(d, dict):
            return None
        return {k: str(d.get(k, "")).strip().lower().startswith("y") for k in ("wind_instrument",) + FOREIGN}


CAP_MIN = 60          # a recording longer than this is heard in pieces spread through it (six and twelve hours of shofar are loops of the same calls)


def pieces_of(seconds, cap_min=CAP_MIN):
    """The ten-minute pieces of a file to clean: all of them, or, past the cap, as many as the cap holds, spread evenly through it."""
    n = int(math.ceil(seconds / PIECE_S))
    want = max(1, int(cap_min * 60 // PIECE_S)) if cap_min else n
    if n <= want:
        return list(range(n))
    return sorted({int(round(i * (n - 1) / (want - 1))) for i in range(want)}) if want > 1 else [n // 2]


def claim(fd):
    """A file taken by one worker (several clean a bank at once, on the processor): its .claim made exclusively; a claim of a worker gone is
    taken over."""
    p = fd / ".claim"
    try:
        h = os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(h, f"{socket.gethostname()} {os.getpid()}".encode())
        os.close(h)
        return True
    except FileExistsError:
        try:
            host, pid = p.read_text().split()
            if host == socket.gethostname() and (pid == str(os.getpid()) or not os.path.exists(f"/proc/{pid}")):
                p.unlink(missing_ok=True)
                return claim(fd) if pid != str(os.getpid()) else True
        except (OSError, ValueError):
            pass
        return False


def clean_progress(w, files, cap_min):
    """How much of the bank's clean is done, read from disk (several workers write it)."""
    planned = done = 0.0
    for f in files:
        ks = pieces_of(f["seconds"], cap_min)
        planned += len(ks)
        fd = w / "files" / f["id"]
        if (fd / "clean.json").is_file():
            done += len(ks)
        else:
            done += sum(1 for k in ks if (fd / f"p{k:03d}" / "seconds.json").is_file())
    return round(done / planned, 4) if planned else 1.0


def clean(kit, bank, folder, instrument, mode, listen=True, voice=True, cap_min=CAP_MIN):
    """Step 2, file by file and piece by piece; a file whose clean.json is there is not made again, one another worker holds is left to it.
    The voice detector hears only the seconds that could be kept (BS-Roformer on a processor is slower than the music)."""
    if mode not in MODES:
        raise ValueError("the mode is chromatic or blasts")
    kit = Path(kit)
    w = work_dir(kit, bank)
    (w / "files").mkdir(parents=True, exist_ok=True)
    src_root = raw_dir(kit, folder)
    files = material(kit, folder)
    source = "mix" if mode == "blasts" else "winds"         # 02.11.2026, measured on the sample: a shofar lands in UVR's «no woodwinds» (134 s of 143)
    plan = {"bank": bank, "folder": folder, "instrument": instrument, "mode": mode, "source": source, "cap_min": cap_min, "files": files,
            "made": time.strftime("%Y-%m-%d %H:%M")}
    tmp = w / f"plan.json.{os.getpid()}"
    tmp.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, w / "plan.json")
    seps = Seps(kit)
    lis = None
    if listen:
        try:
            lis = Listener(kit, instrument).start()
        except (OSError, RuntimeError) as e:
            say_progress(w, said=f"the Listener is off: {e}")
    say_progress(w, step="clean", status="running", progress=clean_progress(w, files, cap_min), files=len(files))
    held = []
    try:
        for f in files:
            fd = w / "files" / f["id"]
            if (fd / "clean.json").is_file():
                continue
            fd.mkdir(parents=True, exist_ok=True)
            if not claim(fd):
                continue                                    # another worker's
            held.append(fd)
            src = src_root / f["file"]
            rows = []
            take = set(pieces_of(f["seconds"], cap_min))
            for k in range(int(math.ceil(f["seconds"] / PIECE_S))):
                start = k * PIECE_S
                if k not in take:                           # a piece left out of a long recording: its seconds said as such
                    rows += [{"s": start + i, "kind": "skipped", "kept": False} for i in range(int(min(PIECE_S, f["seconds"] - start)))]
                    continue
                pd = fd / f"p{k:03d}"
                pd.mkdir(exist_ok=True)
                if (pd / "seconds.json").is_file():
                    rows += json.loads((pd / "seconds.json").read_text(encoding="utf-8"))
                    continue
                say_progress(w, current=f["title"][:80], piece=k, progress=clean_progress(w, files, cap_min))
                wav = pd / "mix.wav"
                subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-ss", str(start), "-t", str(PIECE_S), "-i", str(src), "-ac", "2", "-ar", "44100",
                                "-c:a", "pcm_f32le", str(wav)], check=True)
                mix = decode(wav, SR_AN)
                got = {}
                if source == "winds":
                    got = seps.split(wav, pd, voice=False)
                    winds, rest = decode(got["winds"], SR_AN), decode(got["rest"], SR_AN)
                else:                                       # the recording itself (a shofar)
                    winds, rest = mix, None
                part = seconds_table(mix, winds, rest, np.zeros_like(mix))
                if voice:                                   # the voice detector on the seconds that could be kept, the rest never asked
                    cand = [i for i, r in enumerate(part) if r["kind"] in ("wind alone", "wind over a bed")]
                    if cand:
                        part = seconds_table(mix, winds, rest, seps.voice_of(wav, pd, cand, len(mix)))
                for i, r in enumerate(part):
                    r["s"] = start + i
                (pd / "seconds.json").write_text(json.dumps(part), encoding="utf-8")
                wav.unlink()
                if "rest" in got:                           # only the winds are cut from later; the rest was measured
                    got["rest"].unlink(missing_ok=True)
                rows += part
                say_progress(w, progress=clean_progress(w, files, cap_min))
            windows = []
            if lis:                                         # the Listener on every ten seconds where the winds could stand alone
                cand = [s for s in range(0, len(rows), WINDOW_S)
                        if sum(1 for r in rows[s:s + WINDOW_S] if r["kind"] in ("wind alone", "wind over a bed")) >= WINDOW_S // 2]
                for i, s in enumerate(cand):
                    if i % 20 == 0:
                        say_progress(w, current=f["title"][:80], listening=f"{i}/{len(cand)}")
                    ans = lis.ask(decode(src, 16000, start=s, length=WINDOW_S))
                    windows.append({"s": s, "said": ans})
            heard = {x["s"]: x["said"] for x in windows}
            for i, r in enumerate(rows):
                said = heard.get(i - i % WINDOW_S)
                r["listener"] = said
                foreign = [q for q in FOREIGN if said and said.get(q)]
                r["kept"] = r["kind"] == "wind alone" and (not lis or (said is not None and said.get("wind_instrument") and not foreign))
                if foreign:
                    r["foreign"] = foreign
            kinds = {}
            for r in rows:
                kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
            out = {"file": f["file"], "id": f["id"], "title": f["title"], "seconds": len(rows), "kinds": kinds,
                   "kept": sum(1 for r in rows if r["kept"]), "listener": bool(lis), "voice_detector": voice, "windows": len(windows),
                   "refused_by_listener": sum(1 for r in rows if r["kind"] == "wind alone" and not r["kept"]),
                   "heard_minutes": round(sum(1 for r in rows if r["kind"] != "skipped") / 60, 1)}
            (fd / "rows.json").write_text(json.dumps(rows), encoding="utf-8")
            (fd / "clean.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
            (fd / ".claim").unlink(missing_ok=True)
            held.remove(fd)
        if all((w / "files" / f["id"] / "clean.json").is_file() for f in files):
            say_progress(w, step="clean", status="done", progress=1.0)
    finally:
        if lis:
            lis.stop()
        for fd in held:                                     # a file left half made: free for the next worker or the next clean
            (fd / ".claim").unlink(missing_ok=True)


# —— step 3: notes ——————————————————————————————————————————————————————————————————————————————————————————————————————————————————————

def runs(mask):
    """The [start, end) frame runs where mask is True."""
    m = np.concatenate([[False], mask.astype(bool), [False]])
    d = np.diff(m.astype(int))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def chromatic_notes(x, kept, t0):
    """Notes of one piece's winds (mono, SR_AN): kept a 1-s mask of the piece; t0 the piece's start in the file."""
    f0, ap = yin(x)
    n = len(f0)
    per = SR_AN / HOP
    keep = np.array([kept[int(i / per)] if int(i / per) < len(kept) else False for i in range(n)])
    midi = np.where(~np.isnan(f0) & keep, 69 + 12 * np.log2(np.nan_to_num(f0, nan=440.0) / 440.0), np.nan)
    # a lone octave jump of a frame or two is YIN's slip, not a note
    for i in range(1, n - 1):
        if not np.isnan(midi[i]) and not np.isnan(midi[i - 1]) and not np.isnan(midi[i + 1]) and abs(midi[i] - midi[i - 1]) > 9 and abs(midi[i + 1] - midi[i - 1]) < 1:
            midi[i] = midi[i - 1]
    rms = np.array([np.sqrt(np.mean(np.square(x[i * HOP:i * HOP + 2048], dtype=np.float64)) + 1e-12) for i in range(n)])
    out, i = [], 0
    while i < n:
        if np.isnan(midi[i]):
            i += 1
            continue
        j, med = i, midi[i]
        while j + 1 < n and not np.isnan(midi[j + 1]) and abs(midi[j + 1] - med) < 0.6:
            j += 1
            if (j - i) % 8 == 0:
                med = float(np.median(midi[i:j + 1]))
        dur = (j - i + 1) / per
        if dur >= 0.35:
            seg = midi[i:j + 1]
            med = float(np.median(seg))
            dev = seg - med
            rate = depth = 0.0
            mid = dev[len(dev) // 5: len(dev) - len(dev) // 5] if len(dev) > 60 else dev
            if len(mid) > 30:
                sp = np.abs(np.fft.rfft(mid - mid.mean()))
                fr = np.fft.rfftfreq(len(mid), 1 / per)
                band = (fr >= 3) & (fr <= 9)
                if band.any() and sp[band].max() > 0:
                    rate = float(fr[band][np.argmax(sp[band])])
                    depth = float(np.std(mid) * 141)
            a, b = i * HOP, min(len(x), (j + 1) * HOP + 2048)
            sx = x[a:b]
            spec = np.abs(np.fft.rfft(sx * np.hanning(len(sx)))) ** 2
            fq = np.fft.rfftfreq(len(sx), 1 / SR_AN)
            f = 440 * 2 ** ((med - 69) / 12)
            own = spec[(fq > f * 0.94) & (fq < f * 1.06)].sum() + 1e-12
            under = spec[(fq > 40) & (fq < f * 0.84)].sum() + 1e-12
            lvl = 20 * np.log10(np.mean(rms[i:j + 1]))
            after = rms[j + 1 + int(0.25 * per): j + 1 + int(0.4 * per)]
            tail = float(20 * np.log10(np.mean(after)) - lvl) if len(after) else 0.0
            pre = rms[max(0, i - int(0.25 * per)):i]
            onset = float(lvl - 20 * np.log10(np.mean(pre))) if len(pre) else 0.0
            out.append({"start": round(t0 + i / per, 3), "end": round(t0 + (j + 1) / per, 3), "dur": round(dur, 2), "midi": round(med, 2),
                        "key": int(round(med)), "cents": int(round((med - round(med)) * 100)), "db": round(float(lvl), 1),
                        "vib_hz": round(rate, 1), "vib_cents": int(round(depth)), "drone_db": round(float(10 * np.log10(under / own)), 1),
                        "tail_db": round(tail, 1), "onset_db": round(onset, 1), "steady": round(float(np.std(seg) * 100), 1)})
        i = j + 1
    return out


def blasts(x, kept, t0):
    """The shofar's calls of one piece: blasts are runs over the floor + 18 dB (gaps under 60 ms closed), a call the blasts within 0.4 s of
    each other; told by their shape."""
    per = SR_AN / HOP
    n = 1 + max(0, len(x) - 2048) // HOP
    # a short window (23 ms): a long one fills a teruah's gaps and its nine blasts become one
    rms = np.array([np.sqrt(np.mean(np.square(x[i * HOP:i * HOP + 512], dtype=np.float64)) + 1e-12) for i in range(n)])
    lv = 20 * np.log10(rms)
    floor = np.percentile(lv, 10)
    on = lv > max(floor + 18, lv.max() - 40)
    keep = np.array([kept[int(i / per)] if int(i / per) < len(kept) else False for i in range(n)])
    gap = int(0.06 * per)
    rr = runs(on)
    merged = []
    for a, b in rr:
        if merged and a - merged[-1][1] <= gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    merged = [(a, b) for a, b in merged if b - a >= int(0.08 * per) and keep[a:b].mean() > 0.8]
    calls, cur = [], []
    for a, b in merged:
        if cur and a - cur[-1][1] > int(0.4 * per):
            calls.append(cur)
            cur = []
        cur.append((a, b))
    if cur:
        calls.append(cur)
    f0, _ = yin(x)
    out = []
    for c in calls:
        lens = [(b - a) / per for a, b in c]
        if len(c) == 1:
            kind = "tekiah gedolah" if lens[0] >= 5 else "tekiah" if lens[0] >= 0.9 else None
        elif len(c) == 3 and all(0.35 <= v <= 1.4 for v in lens):
            kind = "shevarim"
        elif len(c) >= 6 and all(v <= 0.4 for v in lens):
            kind = "teruah"
        else:
            kind = None
        if not kind:
            continue
        a, b = c[0][0], c[-1][1]
        pv = f0[a:b][~np.isnan(f0[a:b])]
        med = float(69 + 12 * np.log2(np.median(pv) / 440)) if len(pv) > 5 else None
        after = rms[b + int(0.25 * per): b + int(0.4 * per)]
        lvl = 20 * np.log10(np.mean(rms[a:b]))
        out.append({"call": kind, "start": round(t0 + a / per, 3), "end": round(t0 + b / per, 3), "dur": round((b - a) / per, 2), "blasts": len(c),
                    "midi": round(med, 2) if med else None, "key": int(round(med)) if med else None, "db": round(float(lvl), 1),
                    "tail_db": round(float(20 * np.log10(np.mean(after)) - lvl), 1) if len(after) else 0.0})
    return out


def piece_sound(kit, plan, f, pd, t0, rate, mono=True):
    """A piece's sound as the plan cleaned it: its winds stem, or (source mix) the recording itself at the piece's place."""
    if plan.get("source") == "mix":
        return decode(raw_dir(kit, plan["folder"]) / f["file"], rate, start=t0, length=PIECE_S, mono=mono)
    return decode(pd / "winds.flac", rate, mono=mono) if (pd / "winds.flac").is_file() else None


def notes(kit, bank):
    """Step 3: every cleaned file's notes (or calls) into notes.json beside its clean.json; a summary by key into the bank's notes.json."""
    kit = Path(kit)
    w = work_dir(kit, bank)
    plan = json.loads((w / "plan.json").read_text(encoding="utf-8"))
    mode, rng = plan["mode"], range_of(plan)
    allnotes = []
    say_progress(w, step="notes", status="running", progress=0.0)
    files = plan["files"]
    for fi, f in enumerate(files):
        fd = w / "files" / f["id"]
        if not (fd / "rows.json").is_file():
            continue
        rows = json.loads((fd / "rows.json").read_text(encoding="utf-8"))
        kept = [bool(r.get("kept")) for r in rows]
        found = []
        for pd in sorted(fd.glob("p[0-9][0-9][0-9]")):
            k = int(pd.name[1:])
            t0 = k * PIECE_S
            part = kept[t0:t0 + PIECE_S]
            if not any(part):
                continue
            x = piece_sound(kit, plan, f, pd, t0, SR_AN)
            if x is None:
                continue
            got = chromatic_notes(x, part, t0) if mode == "chromatic" else blasts(x, part, t0)
            for g in got:
                g.update(file=f["id"], piece=k)
            found += got
        if found:                                           # a file's own median level, so a quiet recording's notes are not all «soft»
            med = float(np.median([g["db"] for g in found]))
            for g in found:
                g["rel_db"] = round(g["db"] - med, 1)
        (fd / "notes.json").write_text(json.dumps(found), encoding="utf-8")
        allnotes += found
        say_progress(w, progress=round((fi + 1) / len(files), 3))
    summary = {}
    for g in allnotes:
        key = g.get("call") if mode == "blasts" else g["key"]
        if key is None:
            continue
        s = summary.setdefault(str(key), {"count": 0, "clean": 0, "longest": 0.0})
        s["count"] += 1
        s["clean"] += int(ok(g, mode, rng))
        s["longest"] = max(s["longest"], g["dur"])
    out = {"mode": mode, "range": rng, "notes": len(allnotes), "usable": sum(1 for g in allnotes if ok(g, mode, rng)), "by_key": summary,
           "made": time.strftime("%Y-%m-%d %H:%M")}
    (w / "notes.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    say_progress(w, step="notes", status="done", progress=1.0)
    return out


def ok(g, mode, rng=None):
    """A note (or call) fit for a sample: no drone under it, not far from its file's own level, long enough, near its key, in the
    instrument's range."""
    if mode == "blasts":
        return g.get("call") is not None and -12 <= g.get("rel_db", 0) <= 8
    # a duduk plays legato: a note out of a phrase (no silence before it, onset near 0 dB) is taken too, cut after its glide (cut_sample)
    return (g["dur"] >= 0.5 and g["drone_db"] < -20 and abs(g["cents"]) <= 45 and -15 <= g.get("rel_db", 0) <= 8 and g["onset_db"] >= -3
            and g["steady"] < 35 and (not rng or rng[0] <= g["key"] <= rng[1]))


def range_of(plan):
    r = plan.get("range") or RANGES.get(str(plan.get("instrument", "")).strip().lower())
    return tuple(r) if r else None


# —— step 4: build ——————————————————————————————————————————————————————————————————————————————————————————————————————————————————————

def score(g):
    """The better sample first: long enough to loop, dry (a short tail where the sound falls after it; a level that stays or rises is the next
    note of a phrase, not the room), a clean attack, steady."""
    tail = g.get("tail_db", 0)
    room = max(tail + 30, 0) * 0.08 if tail < -3 else 0.0
    return min(g["dur"], 4.0) * 2 - room + min(max(g.get("onset_db", 0), 0), 30) * 0.05 - g.get("steady", 0) * 0.02


SEAM_S = 0.04                       # HERESY 2061: a loop's seam crossfaded in the sample itself, as long as the .sfz's loop_crossfade


def vibrato_of(m, sr, a, b):
    """HERESY 2061 (Viktor 04.11.2026: «И твои трёхсуточного бдения долги тоже, плиз»; the audit's #20: a C4 with a 30-cent vibrato found no
    loop): the vibrato of m[a:b], from its pitch track (YIN every 5 ms at the analysis rate, in cents about its median, its slow drift taken
    out), as the sine between 3 and 9 Hz that fits it best by least squares; from its envelope (dB) when under half of it is pitched. {period
    (samples), depth (cents or dB), times (samples), cents (the track as it is, None from the envelope)}; None when it holds still (under 6
    cents, or 1 dB) or wavers without a period (the sine explains under half of it)."""
    q = SR_AN / sr                                            # YIN is made for SR_AN: at 48 kHz its dip is wider than its 8 steps down it
    lo, hi = max(0, a - int(1024 / q)), min(len(m), b + int(1536 / q))
    x = np.asarray(m[lo:hi], dtype=np.float64)
    x = np.interp(np.arange(int(len(x) * q)) / q, np.arange(len(x)), x)
    hop = SR_AN // 200
    if len(x) < 2048 + 20 * hop:
        return None
    f0, _ = yin(x, sr=SR_AN, hop=hop, fmin=60.0, fmax=1400.0, frame=2048)
    t = lo + (np.arange(len(f0)) * hop + 512) / q            # a frame's middle, as YIN's first half window hears it, in m's samples
    inside = (t >= a) & (t < b)
    voiced = inside & ~np.isnan(f0)
    pitched = bool(voiced.sum() >= max(20, 0.5 * inside.sum()))
    if pitched:
        tt, raw, floor = t[voiced], 1200 * np.log2(f0[voiced] / np.median(f0[voiced])), 6.0
    else:                                                     # the envelope: a note too breathy for its pitch to be heard through
        rms = np.array([db(x[i * hop:i * hop + 2048]) for i in range(len(f0))])
        tt, raw, floor = t[inside], rms[inside], 1.0
        if len(tt) < 20:
            return None
    sec = tt / sr
    tr = raw - np.polyval(np.polyfit(sec, raw, 1), sec)      # a slow drift is not a vibrato
    fr = np.arange(3.0, 9.0001, 0.02)
    ph = 2 * np.pi * fr[:, None] * sec[None, :]
    C, S = np.cos(ph), np.sin(ph)
    cc, ss, cs, yc, ys = (C * C).sum(1), (S * S).sum(1), (C * S).sum(1), C @ tr, S @ tr
    det = cc * ss - cs * cs
    det = np.where(np.abs(det) < 1e-12, 1e-12, det)
    A, B = (yc * ss - ys * cs) / det, (ys * cc - yc * cs) / det
    fit = A * yc + B * ys                                     # the part of the track the sine explains
    i = int(np.argmax(fit))
    depth = float(np.hypot(A[i], B[i]))
    if fit[i] < 0.5 * float(tr @ tr) or depth < floor:
        return None
    return {"period": sr / float(fr[i]), "depth": round(depth, 1), "times": tt, "cents": raw if pitched else None}


def loop_over_periods(m, sr, a, b, vib):
    """HERESY 2061: a loop of whole vibrato periods in m[a:b], so the pitch goes round without a jump: from a rising zero crossing in the first
    period, an end a whole number of periods on (a tenth of one either way: a played vibrato is no clock) where the 20 ms on both sides of the
    seam match the start's (correlation 0.85 or more: 40 ms against the plain match's 20, with the pitch and the level asked too, and the seam
    crossfaded), the level within 1.5 dB and the pitch within 10 cents; the longest such loop, the best match among equals. (start, end) or
    None."""
    P = vib["period"]
    win, tol = int(0.02 * sr), int(0.1 * P)
    zc = np.where((m[:-1] <= 0) & (m[1:] > 0))[0]

    def pitch(i):
        return float(np.interp(i, vib["times"], vib["cents"])) if vib["cents"] is not None else 0.0
    starts = zc[(zc >= max(a, win)) & (zc < min(a + P, b - win - P + tol))]
    if not len(starts):
        return None
    best = None
    for s in starts[:: max(1, len(starts) // 12)]:
        s = int(s)
        ref = m[s - win:s + win]
        ref = (ref - ref.mean()) / (ref.std() + 1e-9)
        lv0, p0 = db(m[s - win:s]), pitch(s)
        k = 1
        while s + k * P - tol < b - win:
            L = k * P
            for e in zc[(zc >= s + L - tol) & (zc <= s + L + tol) & (zc < b - win)]:
                e = int(e)
                seg = m[e - win:e + win]
                c = float(np.dot(ref, (seg - seg.mean()) / (seg.std() + 1e-9)) / len(ref))
                if c < 0.85 or abs(db(m[e - win:e]) - lv0) > 1.5 or abs(pitch(e) - p0) > 10:
                    continue
                if not best or (k, c) > (best[0], best[1]):
                    best = (k, c, s, e)
            k += 1
    return (best[2], best[3]) if best else None


def crossfade_seam(y, s, e, n):
    """HERESY 2061: a loop's seam crossfaded in the sample itself: its last n frames before the end blended into the n before its start, so the
    jump from the end lands on the sound it came from in any player (sfizz's own loop_crossfade on top of it blends the same sound again)."""
    n = min(int(n), s, e - s)
    if n < 2:
        return
    w = np.linspace(0.0, 1.0, n)
    w = w[:, None] if y.ndim == 2 else w
    y[e - n:e] = y[e - n:e] * (1 - w) + y[s - n:s] * w


def find_loop(y, sr, a, b):
    """A seamless loop in y[a:b] (the steady part): the end whose 20 ms best matches the start's, on rising zero crossings; None if none is
    good enough (correlation under 0.9). HERESY 2061: a note that wavers (a vibrato of 6 cents or more) is looped over whole periods of it
    first (loop_over_periods; a body of 0.25 s is enough there), and the plain match is the way when it finds none."""
    m = y.mean(axis=1) if y.ndim == 2 else y
    if b - a >= int(0.25 * sr):
        vib = vibrato_of(m, sr, a, b)
        got = loop_over_periods(m, sr, a, b, vib) if vib else None
        if got:
            return got
    if b - a < int(0.4 * sr):                         # 02.11: 0.8 s left a 1.2 s C4 without a loop, and a drone on it died after a breath
        return None
    win = int(0.02 * sr)
    zc = np.where((m[:-1] <= 0) & (m[1:] > 0))[0]
    starts = zc[(zc >= a) & (zc < a + int(0.1 * sr))]
    ends = zc[(zc > a + int(0.3 * sr)) & (zc < b - win)]
    if not len(starts) or not len(ends):
        return None
    best = None
    s = int(starts[0])
    ref = m[s:s + win]
    ref = (ref - ref.mean()) / (ref.std() + 1e-9)
    for e in ends[::max(1, len(ends) // 400)]:
        e = int(e)
        seg = m[e:e + win]
        if len(seg) < win:
            continue
        c = float(np.dot(ref, (seg - seg.mean()) / (seg.std() + 1e-9)) / win)
        lv = abs(db(m[e - win:e]) - db(m[s - win:s])) if s >= win else 0.0
        if lv > 1.5:
            continue
        if not best or c > best[0]:
            best = (c, s, e)
    return (best[1], best[2]) if best and best[0] >= 0.9 else None


def cut_sample(kit, w, plan, g, out, rate=48000):
    """One note into a sample: from the winds stem of its piece (the separation's own; the recording itself carries the bed), 40 ms of
    breath before, its tail after (up to 0.5 s, faded); peak-held at −1 dBFS, its gain said. Returns (frames, loop or None, gain dB)."""
    import soundfile as sf
    pd = w / "files" / g["file"] / f"p{g['piece']:03d}"
    t0 = g["piece"] * PIECE_S
    legato = plan["mode"] == "chromatic" and g.get("onset_db", 99) < 6
    # a note of a phrase: no breath before it, its first 25 ms the glide from the last; its end the next note's start, so a short tail
    pre = -0.025 if legato else 0.04
    tail = 0.08 if legato and g.get("tail_db", -99) >= -3 else 0.5 if plan["mode"] == "chromatic" else 0.8
    a = max(0.0, g["start"] - t0 - pre)
    length = (g["end"] - g["start"]) - max(0.0, -pre) + max(0.0, pre) + tail
    if plan.get("source") == "mix":                       # the recording itself, at the note's place in the whole file
        rel = next(x["file"] for x in plan["files"] if x["id"] == g["file"])
        y = decode(raw_dir(kit, plan["folder"]) / rel, rate, start=t0 + a, length=length, mono=False).astype(np.float64)
    else:
        y = decode(pd / "winds.flac", rate, start=a, length=length, mono=False).astype(np.float64)
    n = len(y)
    fi, fo = int((0.015 if legato else 0.004) * rate), int((0.06 if legato else 0.12) * rate)
    if n > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi)[:, None]
        y[-fo:] *= np.linspace(1, 0, fo)[:, None]
    peak = float(np.abs(y).max()) or 1.0
    gain = 10 ** (-1 / 20) / peak
    y *= gain
    loop = None
    if plan["mode"] == "chromatic" and g["dur"] >= 0.9:
        body_a = int((max(pre, 0.0) + 0.35) * rate)
        body_b = int((max(pre, 0.0) + g["dur"] - 0.25 - max(0.0, -pre)) * rate)
        loop = find_loop(y, rate, body_a, body_b)
        if loop:                                          # HERESY 2061: the seam crossfaded in the sample, so any player loops it clean
            crossfade_seam(y, loop[0], loop[1], SEAM_S * rate)
    sf.write(str(out), y.astype(np.float32), rate, subtype="PCM_24", format="FLAC")
    return n, loop, round(20 * math.log10(gain), 1)


def build(kit, bank, name=None, round_robins=3, layers=3, picks=None):
    """Step 4: banks/<bank>/ with its samples, its .sfz (and, for blasts, a pitched tekiah's) and bank.json. picks: {key: [note ids]} to
    take instead of the best by score (the Trainer's choice), an id being «file:start»."""
    kit = Path(kit)
    w = work_dir(kit, bank)
    plan = json.loads((w / "plan.json").read_text(encoding="utf-8"))
    mode = plan["mode"]
    name = name or bank
    out = kit / "banks" / slug(name)
    smp = out / "samples"
    if out.exists():                                     # made again: the old one steps aside whole, as a set does
        os.replace(out, out.with_name(f".{out.name}.{time.strftime('%Y%m%d-%H%M%S')}.old"))
    smp.mkdir(parents=True)
    say_progress(w, step="build", status="running", progress=0.0)
    every = []
    for f in plan["files"]:
        p = w / "files" / f["id"] / "notes.json"
        if p.is_file():
            every += json.loads(p.read_text(encoding="utf-8"))
    usable = [g for g in every if ok(g, mode, range_of(plan))]
    by = {}
    for g in usable:
        by.setdefault(g["call"] if mode == "blasts" else g["key"], []).append(g)
    chosen = {}
    for key, gs in by.items():
        want = [f"{g['file']}:{g['start']}" for g in gs]
        if picks and str(key) in picks:
            ids = set(picks[str(key)])
            gs = [g for g, i in zip(gs, want) if i in ids]
        else:
            gs = sorted(gs, key=score, reverse=True)[: round_robins * layers]
        if gs:
            chosen[key] = gs
    if not chosen:
        raise ValueError("no note was clean enough for a sample: see the notes step's table")
    titles = {f["id"]: f for f in plan["files"]}
    regions, samples, used = [], [], {}
    total = sum(len(v) for v in chosen.values())
    made = 0
    for key in sorted(chosen, key=lambda k: CALLS.get(k, 0) if mode == "blasts" else k):
        gs = sorted(chosen[key], key=lambda g: g["db"])     # soft to loud
        spread = gs[-1]["db"] - gs[0]["db"]                 # layers only where the playing itself was soft and loud (6 dB or more)
        nl = 1 if spread < 6 or len(gs) < 2 else min(layers, len(gs))
        groups = [gs[i * len(gs) // nl:(i + 1) * len(gs) // nl] for i in range(nl)]
        for li, grp in enumerate(groups):
            lo, hi = (1 + li * 127 // nl, (li + 1) * 127 // nl) if nl > 1 else (1, 127)
            for ri, g in enumerate(grp[:round_robins]):
                label = (g["call"].replace(" ", "-") if mode == "blasts" else note_name(key).replace("#", "s"))
                fn = f"{label}_v{li + 1}_rr{ri + 1}.flac"
                frames, loop, gain = cut_sample(kit, w, plan, g, smp / fn)
                samples.append({"sample": fn, "key": key, "layer": li + 1, "rr": ri + 1, "from": titles[g["file"]]["file"], "title": titles[g["file"]]["title"],
                                "at": g["start"], "dur": g["dur"], "cents": g.get("cents", 0), "gain_db": gain, "loop": bool(loop)})
                regions.append({"key": key, "lo": lo, "hi": hi, "rr": ri + 1, "rrn": min(len(grp), round_robins), "sample": fn, "loop": loop,
                                "cents": g.get("cents", 0), "midi": g.get("midi"), "layer": li + 1, "layers": nl})
                used[g["file"]] = used.get(g["file"], 0) + 1
                made += 1
                say_progress(w, progress=round(made / total, 3))
    sfz = [write_sfz(out, name, plan, regions, mode)]
    if mode == "blasts":
        sfz.append(write_pitched(out, name, plan, [r for r in regions if r["key"] == "tekiah" and r["midi"] is not None]))
    sources = [dict(uploader=titles[i]["uploader"], url=titles[i]["url"], licence=titles[i]["licence"] or "unknown", file=titles[i]["file"],
                    title=titles[i]["title"], samples=n) for i, n in sorted(used.items(), key=lambda kv: -kv[1])]
    free = all(re.search(r"creative commons|cc0|public domain", s["licence"], re.I) for s in sources)
    keys = sorted(r["key"] for r in regions if isinstance(r["key"], int))
    rng = [keys[0], keys[-1]] if keys else [min(CALLS.values()), max(CALLS.values())]
    meta = {"name": name, "kind": "instrument", "instrument": plan["instrument"], "mode": mode, "range": rng,
            "author": "Ruach Studio Bank Builder, from recordings by " + ", ".join(sorted({s["uploader"] for s in sources if s["uploader"]}))[:300],
            "licence": "; ".join(sorted({s["licence"] for s in sources})) + ("" if free else " (private: never shipped)"), "may_ship": free,
            "source": f"datasets/raw/{plan['folder']}", "sfz": [Path(s).name for s in sfz],
            "description": (f"{plan['instrument']}: {len(samples)} samples from {len(sources)} recordings, "
                            + (f"{note_name(rng[0])}–{note_name(rng[1])}, " if mode == "chromatic" else "the calls on C3, D3, E3, F3 (tekiah, shevarim, teruah, tekiah gedolah) and a pitched tekiah, ")
                            + "cleaned of voices and other instruments by the Bank Builder"),
            "sources": sources, "samples": samples, "made": time.strftime("%Y-%m-%d %H:%M")}
    (out / "bank.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    say_progress(w, step="build", status="done", progress=1.0, bank=str(out.relative_to(kit)))
    return meta


def _head(name, plan, extra=""):
    return (f"// {name} · made by Ruach Studio's Bank Builder, {time.strftime('%Y-%m-%d')}\n"
            f"// {plan['instrument']} from datasets/raw/{plan['folder']}; every sample's source and place: bank.json{extra}\n\n"
            "<control>\ndefault_path=samples/\n\n")


def write_sfz(out, name, plan, regions, mode):
    lines = [_head(name, plan)]
    if mode == "chromatic":
        lines.append("<global>\nampeg_attack=0.006\nampeg_release=0.3\namp_veltrack=60\n\n")
        keys = sorted({r["key"] for r in regions})
        span = {}
        for i, k in enumerate(keys):                          # each sampled key reaches halfway to its neighbours; the ends four semitones on
            lo = k - 4 if i == 0 else (keys[i - 1] + k) // 2 + 1
            hi = k + 4 if i == len(keys) - 1 else (k + keys[i + 1]) // 2
            span[k] = (max(0, lo), min(127, hi))
        for r in sorted(regions, key=lambda r: (r["key"], r["layer"], r["rr"])):
            lo, hi = span[r["key"]]
            s = (f"<region> sample={r['sample']} pitch_keycenter={r['key']} lokey={lo} hikey={hi} lovel={r['lo']} hivel={r['hi']} "
                 f"tune={-r['cents']} seq_length={r['rrn']} seq_position={r['rr']}")
            if r["loop"]:
                s += f" loop_mode=loop_continuous loop_start={r['loop'][0]} loop_end={r['loop'][1]} loop_crossfade=0.04"
            else:
                s += " loop_mode=no_loop"
            lines.append(s + "\n")
    else:
        lines.append("<global>\nampeg_attack=0.004\nampeg_release=0.4\namp_veltrack=60\npitch_keytrack=0\nloop_mode=one_shot\n\n")
        for r in sorted(regions, key=lambda r: (CALLS[r["key"]], r["layer"], r["rr"])):
            k = CALLS[r["key"]]
            lines.append(f"<region> sample={r['sample']} key={k} lovel={r['lo']} hivel={r['hi']} seq_length={r['rrn']} seq_position={r['rr']}  // {r['key']}\n")
    f = out / f"{slug(name)}.sfz"
    f.write_text("".join(lines), encoding="utf-8")
    return f


def write_pitched(out, name, plan, regions):
    """The shofar's tekiah over the keys: each blast at its own pitch, a fifth either way around it (round robins at the same keys)."""
    lines = [_head(name + " · pitched tekiah", plan, "; the tekiah's blasts at their own pitch, a fifth either way")]
    lines.append("<global>\nampeg_attack=0.004\nampeg_release=0.4\namp_veltrack=60\nloop_mode=one_shot\n\n")
    by = {}
    for r in regions:
        by.setdefault(int(round(r["midi"])), []).append(r)
    keys = sorted(by)
    for i, k in enumerate(keys):
        lo = k - 7 if i == 0 else (keys[i - 1] + k) // 2 + 1
        hi = k + 7 if i == len(keys) - 1 else (k + keys[i + 1]) // 2
        rs = by[k][:4]
        for j, r in enumerate(rs):
            cents = int(round((r["midi"] - k) * 100))
            lines.append(f"<region> sample={r['sample']} pitch_keycenter={k} lokey={max(0, lo)} hikey={min(127, hi)} tune={-cents} "
                         f"seq_length={len(rs)} seq_position={j + 1}\n")
    f = out / f"{slug(name)} · pitched tekiah.sfz"
    f.write_text("".join(lines), encoding="utf-8")
    return f


# —— the lab's side: the steps as jobs, the work for the page ————————————————————————————————————————————————————————————————————————

JOBS = {}                      # bank slug → {"step", "status", "started", "gpu", "tail", "error", "proc"}
NEED_MB = 16000                # the clean step on a card: the wind model, BS-Roformer and Omni Q8 with its projector beside them
STEPS = ("clean", "notes", "build")


def start(kit, spec, gpu_picker):
    """spec: {step: clean | notes | build, bank, and for clean: folder, instrument, mode, device (card | processor), listen; for build: name,
    round_robins, layers, picks}. One step of a bank at a time; clean on a card from gpu_picker(NEED_MB) (its refusal said as it is),
    or on the processor without the voice detector."""
    kit = Path(kit)
    step, bank = str(spec.get("step", "")), str(spec.get("bank", "")).strip()
    if step not in STEPS:
        raise ValueError("the step is clean, notes or build")
    if not bank:
        raise ValueError("the bank needs a name")
    key = slug(bank)
    w = work_dir(kit, bank)
    job = JOBS.get(key)
    if job and job["status"] == "running":
        raise ValueError(f"{bank} is already at its {job['step']} step")
    cmd = [sys.executable, str(Path(__file__).resolve()), step, bank]
    env = dict(os.environ)
    gpu = None
    if step == "clean":
        folder, inst, mode = str(spec.get("folder", "")), str(spec.get("instrument", "")).strip() or "wind instrument", str(spec.get("mode", "chromatic"))
        raw_dir(kit, folder)
        if mode not in MODES:
            raise ValueError("the mode is chromatic or blasts")
        cmd += [folder, inst, mode]
        if spec.get("listen") is False:
            cmd.append("--no-listen")
        if spec.get("device") == "processor":           # Viktor 02.11.2026: «Roformer сади на CPU»: workers of 12 threads on three quarters of the cores
            n = max(1, int((os.cpu_count() or 8) * 0.75) // 12)
            env.update(CUDA_VISIBLE_DEVICES="", OMP_NUM_THREADS="12", MKL_NUM_THREADS="12")
            cmd += ["--workers", str(n)]
        else:
            gpu, _ = gpu_picker(NEED_MB)
            env.update(CUDA_VISIBLE_DEVICES=str(gpu), CUDA_DEVICE_ORDER="PCI_BUS_ID")
    else:
        if not (w / "plan.json").is_file():
            raise ValueError(f"{bank} has not been cleaned yet")
        env["CUDA_VISIBLE_DEVICES"] = ""
        if step == "build":
            name = str(spec.get("name", "")).strip()
            if name:
                cmd.append(name)
            opts = {"round_robins": int(spec.get("round_robins", 3)), "layers": int(spec.get("layers", 3)), "picks": spec.get("picks") or None}
            if not (1 <= opts["round_robins"] <= 8 and 1 <= opts["layers"] <= 4):
                raise ValueError("round robins 1 to 8, layers 1 to 4")
            w.mkdir(parents=True, exist_ok=True)
            (w / "build-options.json").write_text(json.dumps(opts), encoding="utf-8")
    w.mkdir(parents=True, exist_ok=True)
    say_progress(w, step=step, status="running", progress=0.0, error=None)
    job = {"step": step, "status": "running", "started": time.time(), "gpu": gpu, "tail": []}
    JOBS[key] = job

    def work():
        try:
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env, cwd=str(kit))
            job["proc"] = p
            for line in p.stdout:
                line = line.rstrip()
                if line.strip() and "it/s]" not in line and "s/it]" not in line:
                    job["tail"] = (job["tail"] + [line[-300:]])[-8:]
            rc = p.wait()
            job.update(status="done" if rc == 0 else "stopped" if job.get("stop") else "failed", ended=time.time())
            if rc != 0 and not job.get("stop"):
                job["error"] = job["tail"][-1] if job["tail"] else f"the {step} step ended with {rc}"
                say_progress(w, status="failed", error=job["error"])
            elif job.get("stop"):
                say_progress(w, status="stopped")
        except Exception as e:  # noqa: BLE001 — said in the job
            job.update(status="failed", error=str(e))
        finally:
            job.pop("proc", None)
    import threading
    threading.Thread(target=work, daemon=True).start()
    return public(job)


def stop(bank):
    job = JOBS.get(slug(bank))
    if not job or job["status"] != "running" or not job.get("proc"):
        raise ValueError("nothing of this bank runs now")
    job["stop"] = True
    job["proc"].terminate()                     # clean() ends its Listener's server in its finally; a file half made is made again next time
    return public(job)


def public(job):
    return {k: v for k, v in (job or {}).items() if k != "proc"}


def _read(p, default=None):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def works(kit):
    """Every bank in the making: its plan's few words, its progress, its job, the bank on the shelf if it was built."""
    root = Path(kit) / "datasets" / "banks"
    out = []
    for d in sorted((p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")), key=lambda p: -p.stat().st_mtime) if root.is_dir() else []:
        plan = _read(d / "plan.json", {})
        prog = _read(d / "progress.json", {}) or {}
        built = Path(kit) / (prog.get("bank") or f"banks/{d.name}") / "bank.json"
        out.append({"bank": plan.get("bank") or d.name, "slug": d.name, "folder": plan.get("folder"), "instrument": plan.get("instrument"),
                    "mode": plan.get("mode"), "files": len(plan.get("files", [])), "progress": prog,
                    "job": public(JOBS.get(d.name)), "notes": bool((d / "notes.json").is_file()), "built": built.is_file()})
    return out


def work(kit, bank):
    """One bank's whole state for the page: the plan, every file's clean summary, the notes by key, the bank built."""
    kit = Path(kit)
    w = work_dir(kit, bank)
    plan = _read(w / "plan.json")
    if not plan:
        raise FileNotFoundError(f"no bank {bank} in the making")
    files = []
    for f in plan["files"]:
        c = _read(w / "files" / f["id"] / "clean.json", {})
        files.append(dict({k: f.get(k) for k in ("file", "id", "title", "uploader", "url", "licence", "seconds")}, clean=c or None))
    prog = _read(w / "progress.json", {}) or {}
    built = _read(kit / (prog.get("bank") or f"banks/{w.name}") / "bank.json")
    return {"plan": {k: plan.get(k) for k in ("bank", "folder", "instrument", "mode", "made")}, "range": range_of(plan), "files": files,
            "progress": prog, "job": public(JOBS.get(w.name)), "notes": _read(w / "notes.json"),
            "options": _read(w / "build-options.json", {}),
            "built": built and dict({k: built.get(k) for k in ("name", "range", "licence", "may_ship", "sfz", "description", "made")},
                                    samples=len(built.get("samples") or []), looped=sum(1 for x in built.get("samples") or [] if x.get("loop")))}   # HERESY 2061


KIND_LETTER = {"silence": "s", "voice": "v", "wind alone": "w", "wind over a bed": "o", "bed": "b", "skipped": "-"}


def strip(kit, bank, fid):
    """A file's seconds as letters for the page's strip (s silence, v voice, w wind alone, o wind over a bed, b bed; upper case when kept)."""
    rows = _read(work_dir(kit, bank) / "files" / re.sub(r"[^\w.-]", "", fid) / "rows.json")
    if rows is None:
        raise FileNotFoundError("this file is not cleaned yet")
    return {"id": fid, "kinds": "".join(KIND_LETTER.get(r.get("kind"), "?").upper() if r.get("kept") else KIND_LETTER.get(r.get("kind"), "?") for r in rows),
            "foreign": {str(i): r["foreign"] for i, r in enumerate(rows) if r.get("foreign")}}


def key_notes(kit, bank, key):
    """The notes (or calls) of one key across the bank's files, best first, each with whether it is fit and its id (file:start)."""
    w = work_dir(kit, bank)
    plan = _read(w / "plan.json", {})
    mode, rng = plan.get("mode"), range_of(plan)
    titles = {f["id"]: f.get("title") for f in plan.get("files", [])}
    out = []
    for f in plan.get("files", []):
        for g in _read(w / "files" / f["id"] / "notes.json", []) or []:
            if str(g.get("call") if mode == "blasts" else g.get("key")) == str(key):
                out.append(dict(g, id=f"{g['file']}:{g['start']}", title=titles.get(g["file"]), ok=ok(g, mode, rng), score=round(score(g), 2) if mode == "chromatic" else 0))
    out.sort(key=lambda g: (not g["ok"], -g["score"], -g["dur"]))
    return out


def snippet(kit, bank, fid, start, length, src="winds"):
    """Up to 30 s of a cleaned file as WAV bytes, from its winds stem (src winds) or the recording itself (src mix)."""
    kit = Path(kit)
    w = work_dir(kit, bank)
    plan = _read(w / "plan.json", {})
    f = next((x for x in plan.get("files", []) if x["id"] == fid), None)
    if not f:
        raise FileNotFoundError("no such file in this bank")
    start, length = max(0.0, float(start)), max(0.2, min(30.0, float(length)))
    if src == "mix" or plan.get("source") == "mix":
        p, at = raw_dir(kit, plan["folder"]) / f["file"], start
    else:
        k = int(start // PIECE_S)
        p, at = w / "files" / fid / f"p{k:03d}" / "winds.flac", start - k * PIECE_S
        length = min(length, PIECE_S - at)
    if not p.is_file():
        raise FileNotFoundError("its sound is not here")
    return subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{at:.3f}", "-t", f"{length:.3f}", "-i", str(p), "-ac", "2", "-ar", "48000",
                           "-c:a", "pcm_s16le", "-f", "wav", "-"], capture_output=True, check=True).stdout


if __name__ == "__main__":
    kit = Path(__file__).resolve().parent.parent
    a = sys.argv[1:]
    try:
        if a and a[0] == "clean" and len(a) >= 5:
            cap = int(a[a.index("--cap") + 1]) if "--cap" in a else CAP_MIN
            n = int(a[a.index("--workers") + 1]) if "--workers" in a else 1
            kids = []
            if n > 1:                                       # more workers on the processor, each its own threads; they share the files by claims
                import signal
                each = a[:5] + [x for x in ("--no-listen", "--no-voice") if x in a] + ["--cap", str(cap)]
                for _ in range(n - 1):
                    kids.append(subprocess.Popen([sys.executable, str(Path(__file__).resolve())] + each, env=os.environ.copy()))
                    time.sleep(20)                          # the first takes its file before the next looks
                signal.signal(signal.SIGTERM, lambda *_: ([k.terminate() for k in kids], sys.exit(143)))
            try:
                clean(kit, a[1], a[2], a[3], a[4], listen="--no-listen" not in a, voice="--no-voice" not in a, cap_min=cap)
            finally:
                for k in kids:
                    k.wait()
            if kids:
                w = work_dir(kit, a[1])
                plan = _read(w / "plan.json", {}) or {}
                if all((w / "files" / f["id"] / "clean.json").is_file() for f in plan.get("files", [])):
                    say_progress(w, step="clean", status="done", progress=1.0)
        elif a and a[0] == "notes" and len(a) >= 2:
            print(json.dumps(notes(kit, a[1]), ensure_ascii=False))
        elif a and a[0] == "build" and len(a) >= 2:
            o = _read(work_dir(kit, a[1]) / "build-options.json", {}) or {}
            m = build(kit, a[1], a[2] if len(a) > 2 and not a[2].startswith("--") else None, round_robins=o.get("round_robins", 3),
                      layers=o.get("layers", 3), picks=o.get("picks"))
            print(json.dumps({k: m[k] for k in ("name", "range", "licence", "may_ship", "sfz", "description")}, ensure_ascii=False))
        else:
            sys.exit(__doc__.split("\n\n")[-1])
    except Exception as e:  # noqa: BLE001 — said into progress.json for the lab, then raised
        if len(a) > 1:
            try:
                say_progress(work_dir(kit, a[1]), status="failed", error=str(e)[:400])
            except OSError:
                pass
        raise
