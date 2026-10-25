"""HERESY 1512 (Viktor 16.10.2026: «Предлагаю отдельной вкладкой в Огранщике создать детект и настройку аудио интерфейсов как физических,
так и виртуальных»): the machine's audio interfaces, physical and virtual, and the analog gateway's choice of them.
  physical: ALSA's hardware PCMs (/proc/asound/pcm) of the real cards, each with its card's name and, for a USB one, its formats
            (stream0: channels, bits, rates);
  virtual:  a loopback card (snd-aloop), ALSA's software PCMs (null, dmix, dsnoop, pulse, pipewire, jack: aplay -L / arecord -L),
            PipeWire/Pulse sinks and sources (pactl) and JACK ports (jack_lsp), where they run; a tool missing is said, never «none»;
  the gateway: the output and the input it plays through and records from, and its rate, kept in user/audio.json;
  the floor: an input's own noise, measured by a short recording (arecord through plughw), said in dBFS per channel."""
import grp
import json
import os
import pwd
import re
import shlex
import subprocess
import tempfile
import threading
import time
import wave
from pathlib import Path

import numpy as np

SOFT = ("null", "default", "dmix", "dsnoop", "pulse", "pipewire", "jack", "lavrate", "samplerate", "speexrate", "upmix", "vdownmix")
HARDWARE_WRAPPERS = ("hw", "plughw", "sysdefault", "front", "rear", "center_lfe", "side", "surround21", "surround40", "surround41", "surround50",
                     "surround51", "surround71", "iec958", "hdmi", "usbstream")


def needs_sg():
    """16.10: the lab's service started before its user was given the audio group, so it cannot open /dev/snd while a shell can: then the
    ALSA tools go through sg audio (a member needs no password). False when the devices open as they are, or sg would not help."""
    try:
        ctl = sorted(Path("/dev/snd").glob("controlC*"))
        if not ctl or os.access(str(ctl[0]), os.R_OK | os.W_OK):
            return False
        g = grp.getgrnam("audio")
        return g.gr_gid not in os.getgroups() and pwd.getpwuid(os.getuid()).pw_name in g.gr_mem and _which("sg")
    except (KeyError, OSError):
        return False


def _cmd(cmd):
    return ["sg", "audio", "-c", " ".join(shlex.quote(str(x)) for x in cmd)] if needs_sg() else cmd


def _run(cmd, timeout=10):
    cmd = _cmd(cmd)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def cards(root="/proc/asound"):
    try:
        txt = Path(root, "cards").read_text()
    except OSError:
        return []
    out = []
    for m in re.finditer(r"^\s*(\d+)\s+\[(\S+)\s*\]:\s*(.+?)\s+-\s+(.+)$", txt, re.M):
        drv = m.group(3).strip()
        out.append({"card": int(m.group(1)), "id": m.group(2), "driver": drv, "name": m.group(4).strip(),
                    "virtual": drv.lower() == "loopback" or "loopback" in m.group(4).lower()})
    return out


def streams(root, card):
    """A USB card's formats each way, from its stream0: channels, bits, rates; {} for a card that has no such file."""
    p = Path(root, f"card{card}", "stream0")
    try:
        txt = p.read_text()
    except OSError:
        return {}
    res = {}
    for side, key in (("Playback", "out"), ("Capture", "in")):
        m = re.search(side + r":\n(.*?)(?=\n\S|\Z)", txt, re.S)
        if not m:
            continue
        blk = m.group(1)
        ch, bits, rates = re.search(r"Channels:\s*(\d+)", blk), re.search(r"Bits:\s*(\d+)", blk), re.search(r"Rates:\s*([\d, ]+)", blk)
        res[key] = {"channels": int(ch.group(1)) if ch else None, "bits": int(bits.group(1)) if bits else None,
                    "rates": [int(x) for x in rates.group(1).replace(" ", "").split(",") if x] if rates else []}
    return res


def pcms(root="/proc/asound"):
    """«04-00: USB Audio : USB Audio : playback 1 : capture 1» each line one device of a card, its ways."""
    try:
        txt = Path(root, "pcm").read_text()
    except OSError:
        return []
    out = []
    for line in txt.splitlines():
        m = re.match(r"(\d+)-(\d+):\s*([^:]*):", line)
        if not m:
            continue
        out.append({"card": int(m.group(1)), "device": int(m.group(2)), "name": m.group(3).strip(),
                    "out": bool(re.search(r":\s*playback\s+\d", line)), "in": bool(re.search(r":\s*capture\s+\d", line))})
    return out


def alsa_soft(direction):
    """ALSA's software PCMs one way (aplay -L / arecord -L), hardware wrappers left out; None when the tool is not there."""
    txt = _run(["aplay" if direction == "out" else "arecord", "-L"])
    if txt is None:
        return None
    out, cur = [], None
    for line in txt.splitlines():
        if not line.strip():
            continue
        if not line.startswith((" ", "\t")):
            base = line.split(":")[0]
            cur = None if base in HARDWARE_WRAPPERS else {"name": line.strip(), "description": ""}
            if cur and (base in SOFT or ":" not in line):
                out.append(cur)
            else:
                cur = None
        elif cur is not None:
            cur["description"] = (cur["description"] + " " + line.strip()).strip()
    return out


def pulse_nodes():
    """PipeWire's or Pulse's sinks and sources (pactl), None when neither answers."""
    if not _which("pactl"):
        return None
    out = []
    for kind, way in (("sinks", "out"), ("sources", "in")):
        txt = _run(["pactl", "-f", "json", "list", kind], timeout=5)
        if txt is None:
            return None
        try:
            for n in json.loads(txt):
                out.append({"name": n.get("name", ""), "description": n.get("description", ""), "way": way,
                            "monitor": str(n.get("name", "")).endswith(".monitor")})
        except ValueError:
            return None
    return out


def jack_ports():
    if not _which("jack_lsp"):
        return None
    txt = _run(["jack_lsp", "-p"], timeout=5)
    if txt is None:
        return None
    out, cur = [], None
    for line in txt.splitlines():
        if not line.startswith((" ", "\t")):
            cur = {"name": line.strip(), "way": ""}
            out.append(cur)
        elif cur is not None and "properties:" in line:
            cur["way"] = "out" if "input" in line else "in" if "output" in line else ""   # a playback port takes input from us
    return out


def _which(b):
    return any(os.access(os.path.join(d, b), os.X_OK) for d in os.environ.get("PATH", "").split(os.pathsep) if d)


def devices(root="/proc/asound", user_dir=None):
    cs = {c["card"]: c for c in cards(root)}
    physical, virtual, said = [], [], []
    for p in pcms(root):
        c = cs.get(p["card"], {"id": str(p["card"]), "name": "", "driver": "", "virtual": False})
        d = dict(p, id=c["id"], card_name=c["name"], driver=c["driver"], alsa=f"hw:CARD={c['id']},DEV={p['device']}",
                 formats=streams(root, p["card"]) if p["device"] == 0 else {})
        (virtual if c.get("virtual") else physical).append(dict(d, kind="loopback") if c.get("virtual") else d)
    if not cs:
        said.append("no sound card is seen here (/proc/asound has none)")
    if needs_sg():
        said.append("the lab reaches the sound devices through sg audio: its service started before the audio group was given")
    for way in ("out", "in"):
        soft = alsa_soft(way)
        if soft is None:
            said.append(("aplay" if way == "out" else "arecord") + " is not here: ALSA's software devices are not listed")
            continue
        for s in soft:
            hit = next((v for v in virtual if v.get("kind") == "alsa" and v["name"] == s["name"]), None)
            if hit:
                hit[way] = True
            else:
                virtual.append({"kind": "alsa", "name": s["name"], "description": s["description"], "out": way == "out", "in": way == "in"})
    pn = pulse_nodes()
    if pn is None:
        said.append("PipeWire / Pulse do not run here (no pactl answer)")
    else:
        virtual += [{"kind": "pipewire", "name": n["name"], "description": n["description"], "out": n["way"] == "out", "in": n["way"] == "in",
                     "monitor": n["monitor"]} for n in pn]
    jp = jack_ports()
    if jp is None:
        said.append("JACK does not run here (no jack_lsp)")
    else:
        virtual += [{"kind": "jack", "name": n["name"], "description": "", "out": n["way"] == "out", "in": n["way"] == "in"} for n in jp]
    return {"physical": physical, "virtual": virtual, "said": said, "gateway": gateway(user_dir) if user_dir else {},
            "monitor": monitor(user_dir) if user_dir else {}, "playing": monitor_state()}   # HERESY 1548


def gateway(user_dir):
    try:
        g = json.loads(Path(user_dir, "audio.json").read_text()).get("gateway") or {}
    except (OSError, ValueError):
        g = {}
    return {"out": g.get("out", ""), "in": g.get("in", ""), "rate": int(g.get("rate") or 0)}


# HERESY 1548: the monitor, a second output for listening on this machine
def monitor(user_dir):
    try:
        m = json.loads(Path(user_dir, "audio.json").read_text()).get("monitor") or {}
    except (OSError, ValueError):
        m = {}
    return {"out": m.get("out", ""), "rate": int(m.get("rate") or 0)}


def card_of(dev):
    """HERESY 1568: the card an ALSA name points at (hw:CARD=S24,DEV=0 → S24, plughw:4,0 → 4), or empty."""
    m = re.search(r"CARD=([^,]+)", dev or "") or re.match(r"(?:plug)?hw:(\d+)", dev or "")
    return m.group(1) if m else ""


def set_monitor(user_dir, out, rate):
    rate = int(rate or 0)
    if rate and rate not in (44100, 48000, 88200, 96000, 176400, 192000):
        raise ValueError(f"{rate} Hz is no rate a converter runs at")
    if out and not re.fullmatch(r"[\w.:=,@-]+", out):
        raise ValueError(f"{out} is no device name")
    g = gateway(user_dir)                     # HERESY 1568: the gateway's card opens once; a monitor there would fight it
    if out and card_of(out) and card_of(out) in {card_of(g["out"]), card_of(g["in"])}:
        raise ValueError(f"{out} is the gateway's own card, which opens once: choose another output for the monitor")
    p = Path(user_dir, "audio.json")
    try:
        cfg = json.loads(p.read_text())
    except (OSError, ValueError):
        cfg = {}
    cfg["monitor"] = {"out": out or "", "rate": rate}
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(cfg, indent=1))
    os.replace(tmp, p)
    return cfg["monitor"]


MON = {"proc": None, "stop": None, "what": None}
MON_LOCK = threading.Lock()


def monitor_state():
    with MON_LOCK:
        w = MON["what"]
        p = MON["proc"]
        if not w or p is None or p.poll() is not None:
            return {"playing": False}
        return dict(w, playing=True, at=round(w["from"] + time.time() - w["started"], 2))


def monitor_stop():
    with MON_LOCK:
        p, ev = MON["proc"], MON["stop"]
        MON.update(proc=None, stop=None, what=None)
    if ev is not None:
        ev.set()
    if p is not None and p.poll() is None:
        try:
            p.terminate()
            p.wait(timeout=3)
        except (OSError, subprocess.SubprocessError):
            try:
                p.kill()
            except OSError:
                pass
    return {"playing": False}


def monitor_play(user_dir, path, start=0.0, label=None, level_db=0.0):
    """A file through the monitor from `start` seconds, streamed in blocks (the converter's own rate by plughw); one at a time."""
    import soundfile as sf
    m = monitor(user_dir)
    if not m["out"]:
        raise ValueError("no monitor is chosen: choose one in Audio I/O and keep it")
    info = sf.info(str(path))
    start = max(0.0, min(float(start or 0), max(0.0, info.duration - 0.05)))
    monitor_stop()
    rate, ch = int(info.samplerate), 2
    dev = re.sub(r"^hw:", "plughw:", m["out"])
    proc = subprocess.Popen(_cmd(["aplay", "-q", "-D", dev, "-f", "S32_LE", "-r", str(rate), "-c", str(ch), "-t", "raw", "-"]),
                            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    stop = threading.Event()
    g = 10 ** (float(level_db or 0) / 20)

    def feed():
        try:
            with sf.SoundFile(str(path)) as f:
                f.seek(int(start * rate))
                while not stop.is_set():
                    x = f.read(rate // 10, dtype="float64", always_2d=True)
                    if not len(x):
                        break
                    if x.shape[1] == 1:
                        x = np.repeat(x, 2, axis=1)
                    proc.stdin.write((np.clip(x[:, :2] * g, -1, 1) * (2 ** 31 - 1)).astype(np.int32).tobytes())
            proc.stdin.close()
        except (OSError, ValueError, BrokenPipeError):
            pass
    with MON_LOCK:
        MON.update(proc=proc, stop=stop, what={"label": label or Path(path).name, "from": start, "started": time.time(), "seconds": round(info.duration, 2),
                                               "out": m["out"]})
    threading.Thread(target=feed, daemon=True).start()
    return monitor_state()


def monitor_tone(user_dir):
    """A 1 kHz tone at −20 dBFS through the monitor for 1.5 s (the loop test's own)."""
    m = monitor(user_dir)
    if not m["out"]:
        raise ValueError("no monitor is chosen")
    rate = m["rate"] or 48000
    with tempfile.TemporaryDirectory() as t:
        tone = Path(t) / "tone.wav"
        with wave.open(str(tone), "wb") as f:
            f.setnchannels(2); f.setsampwidth(4); f.setframerate(rate); f.writeframes(loop_signal(rate, -20.0).tobytes())
        r = _run(["aplay", "-q", "-D", re.sub(r"^hw:", "plughw:", m["out"]), str(tone)], timeout=15)
    return {"played": r is not None, "out": m["out"], "rate": rate}


def set_gateway(user_dir, out, inp, rate):
    rate = int(rate or 0)
    if rate and rate not in (44100, 48000, 88200, 96000, 176400, 192000):
        raise ValueError(f"{rate} Hz is no rate a converter runs at")
    for d in (out, inp):
        if d and not re.fullmatch(r"[\w.:=,@-]+", d):
            raise ValueError(f"{d} is no device name")
    p = Path(user_dir, "audio.json")
    try:
        cfg = json.loads(p.read_text())
    except (OSError, ValueError):
        cfg = {}
    cfg["gateway"] = {"out": out or "", "in": inp or "", "rate": rate}
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(cfg, indent=1))
    os.replace(tmp, p)
    return cfg["gateway"]


SETTLE = 1.5                                         # HERESY 1546: seconds an input may take to settle once its stream opens


def levels(path, skip=0.0):
    """A recording's level each channel: its RMS and its peak in dBFS (−inf as −200 for digital silence); `skip` seconds of its
    start left out (HERESY 1546: an input still settling)."""
    with wave.open(str(path), "rb") as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    dt = {2: np.int16, 4: np.int32}.get(sw)
    if dt is None:
        raise ValueError(f"{sw * 8}-bit frames are not read here")
    a = np.frombuffer(raw, dtype=dt).astype(np.float64).reshape(-1, ch) / float(2 ** (8 * sw - 1))
    with wave.open(str(path), "rb") as w:
        a = a[min(len(a) - 1, int(skip * w.getframerate())):] if skip > 0 and len(a) > 1 else a
    db = lambda x: round(float(20 * np.log10(x)), 1) if x > 0 else -200.0   # noqa: E731
    return {"rms_db": [db(np.sqrt(np.mean(a[:, c] ** 2))) for c in range(ch)], "peak_db": [db(np.max(np.abs(a[:, c]))) for c in range(ch)]}


def probe(device, rate=48000, seconds=2, channels=2):
    """An input's floor: a short recording through plughw (any format the card takes), its levels; a refusal (busy, no such device) said."""
    if not re.fullmatch(r"[\w.:=,@-]+", str(device or "")):
        raise ValueError("no input device named")
    dev = re.sub(r"^hw:", "plughw:", device)
    seconds = max(1, min(10, int(seconds)))
    with tempfile.TemporaryDirectory() as t:
        out = Path(t) / "floor.wav"
        try:
            r = subprocess.run(_cmd(["arecord", "-q", "-D", dev, "-f", "S32_LE", "-r", str(int(rate)), "-c", str(int(channels)), "-d", str(seconds + 2), "-t", "wav", str(out)]),
                               capture_output=True, text=True, timeout=seconds + 17)   # 1546: two seconds more, the first 1.5 left out
        except (OSError, subprocess.SubprocessError) as e:
            raise ValueError(f"arecord could not run: {e}")
        if r.returncode != 0 or not out.is_file():
            raise ValueError("the input refused: " + (r.stderr.strip().splitlines() or ["no answer"])[-1])
        res = levels(out, skip=SETTLE)
    res.update(device=device, rate=int(rate), seconds=seconds, settled_s=SETTLE)
    return res


# HERESY 1514: the gateway's loop: what goes out comes back, and how
TONE_HZ = 1000.0


def loop_signal(rate, level_db=-20.0):
    """0.30 s of silence, 1.50 s of a 1 kHz sine at level_db (both channels), 0.20 s of silence: int32 stereo frames."""
    rate = int(rate)
    a = 10 ** (level_db / 20.0)
    sil0, tone, sil1 = int(0.30 * rate), int(1.50 * rate), int(0.20 * rate)
    t = np.arange(tone) / rate
    ramp = np.minimum(1.0, np.minimum(t, t[::-1]) / 0.01)          # 10 ms in and out: no click of its own
    x = np.concatenate([np.zeros(sil0), a * np.sin(2 * np.pi * TONE_HZ * t) * ramp, np.zeros(sil1)])
    return (np.stack([x, x], 1) * (2 ** 31 - 1)).astype(np.int32)


def loop_measure(rec, rate, level_db=-20.0):
    """A recording of the loop (float frames, −1…1, [n, ch]) measured per channel: the tone found by its level rising over what came before;
    its gain against what was sent, the noise before it, its THD (2nd to 5th harmonic) at 1 kHz. A channel the tone never reached: None."""
    rate = int(rate)
    w = max(1, int(0.01 * rate))
    out = {"answered": False, "gain_db": [], "noise_db": [], "thd_pct": []}
    for c in range(rec.shape[1]):
        x = rec[:, c]
        n = len(x) // w
        if n < 20:
            out["gain_db"].append(None); out["noise_db"].append(None); out["thd_pct"].append(None)
            continue
        rms = np.sqrt(np.mean(x[: n * w].reshape(n, w) ** 2, axis=1)) + 1e-12
        floor = np.median(rms[: max(5, n // 10)])
        on = np.nonzero(rms > floor * 10 ** (20 / 20))[0]          # 20 dB over the first tenth
        if not len(on) or rms[on].max() < 10 ** (-80 / 20):
            out["gain_db"].append(None); out["noise_db"].append(round(float(20 * np.log10(floor)), 1)); out["thd_pct"].append(None)
            continue
        a, b = on[0] * w, (on[-1] + 1) * w
        mid0, mid1 = a + (b - a) // 6, b - (b - a) // 6                   # the middle of the tone, its edges left out
        seg = x[mid0:mid1]
        if len(seg) < rate // 4:
            out["gain_db"].append(None); out["noise_db"].append(None); out["thd_pct"].append(None)
            continue
        sent = 10 ** (level_db / 20.0) / np.sqrt(2)
        got = np.sqrt(np.mean(seg ** 2))
        before = x[: max(w, a - 2 * w)]
        noise = np.sqrt(np.mean(before ** 2)) if len(before) else 0.0
        win = np.hanning(len(seg))
        spec = np.abs(np.fft.rfft(seg * win))
        hz = np.fft.rfftfreq(len(seg), 1.0 / rate)
        def peak(f):
            k = int(round(f / (hz[1] - hz[0])))
            lo, hi = max(0, k - 3), min(len(spec), k + 4)
            return float(np.sqrt(np.sum(spec[lo:hi] ** 2))) if lo < hi else 0.0
        fund = peak(TONE_HZ)
        harm = [peak(TONE_HZ * k) for k in range(2, 6) if TONE_HZ * k < rate / 2]
        thd = 100.0 * np.sqrt(sum(h * h for h in harm)) / fund if fund > 0 else None
        out["answered"] = True
        out["gain_db"].append(round(float(20 * np.log10(got / sent)), 2))
        out["noise_db"].append(round(float(20 * np.log10(noise)), 1) if noise > 0 else -200.0)
        out["thd_pct"].append(round(float(thd), 4) if thd is not None else None)
    return out


def loop(out_dev, in_dev, rate=48000, level_db=-20.0):
    """The tone out of out_dev and back from in_dev at once; measured. A refusal (a device busy or not there) said."""
    for d in (out_dev, in_dev):
        if not re.fullmatch(r"[\w.:=,@-]+", str(d or "")):
            raise ValueError("an output and an input are both needed")
    level_db = max(-40.0, min(-6.0, float(level_db)))
    rate = int(rate)
    play_dev, rec_dev = re.sub(r"^hw:", "plughw:", out_dev), re.sub(r"^hw:", "plughw:", in_dev)
    with tempfile.TemporaryDirectory() as t:
        tone, rec = Path(t) / "tone.wav", Path(t) / "back.wav"
        frames = loop_signal(rate, level_db)
        with wave.open(str(tone), "wb") as f:
            f.setnchannels(2); f.setsampwidth(4); f.setframerate(rate); f.writeframes(frames.tobytes())
        secs = int(np.ceil(len(frames) / rate + 0.5 + SETTLE))   # 1546: the input settled before the tone goes out
        try:
            r = subprocess.Popen(_cmd(["arecord", "-q", "-D", rec_dev, "-f", "S32_LE", "-r", str(rate), "-c", "2", "-d", str(secs), "-t", "wav", str(rec)]),
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            import time as _t
            _t.sleep(SETTLE)
            pl = subprocess.run(_cmd(["aplay", "-q", "-D", play_dev, str(tone)]), capture_output=True, text=True, timeout=secs + 10)
            _, rerr = r.communicate(timeout=secs + 15)
        except (OSError, subprocess.SubprocessError) as e:
            raise ValueError(f"the loop could not run: {e}")
        if pl.returncode != 0:
            raise ValueError("the output refused: " + (pl.stderr.strip().splitlines() or ["no answer"])[-1])
        if r.returncode != 0 or not rec.is_file():
            raise ValueError("the input refused: " + ((rerr or "").strip().splitlines() or ["no answer"])[-1])
        with wave.open(str(rec), "rb") as f:
            raw, ch, sw = f.readframes(f.getnframes()), f.getnchannels(), f.getsampwidth()
    data = np.frombuffer(raw, dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float64).reshape(-1, ch) / float(2 ** (8 * sw - 1))
    res = loop_measure(data[int((SETTLE - 0.2) * rate):], rate, level_db)   # 1546: what came while it settled left out
    res.update(out=out_dev, input=in_dev, rate=rate, level_db=level_db)
    return res

