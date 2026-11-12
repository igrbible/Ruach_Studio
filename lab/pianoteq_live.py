"""HERESY 1977 (Viktor 31.10.2026: «Сделай интеграцию Pianoteq даже лучше и удобнее, чем официальный их X11 GUI»; «Да конечно разрешаю» to a
render through a preset saved for a moment): the Pianoteq installed here, driven through its own JSON-RPC server (`--serve`), as Modartt
publishes it. Nothing of Pianoteq is shipped or opened up: its program is run, asked and told.

  · the server runs on a copy of the user's preferences (where a bought Pianoteq keeps its activation; the user's file is never written), in a
    folder of its own (0700, the copy 0600), on a free port of 127.0.0.1, at a low priority; nobody asks it for IDLE seconds, it stops and
    the copy goes;
  · its engine runs on a silent device: headless without one, Pianoteq takes no setting (31.10.2026: setParameters reached no preset file,
    a loaded preset never read back), so the copy names ALSA's default output and this server alone is given an ALSA configuration whose
    default is ALSA's null sink, where no sound card of the machine can even be named; on any other device the server is stopped, not used;
  · catalog(): every preset (its instrument, class, collection and words), the small presets of each kind (reverb, tuning, velocity, mic,
    equalizer, effect), and each parameter: its name, locked or free in this edition, and its scale read back in Pianoteq's own words, so the
    page shows «-10.0 dB» where Pianoteq does; kept in user/pianoteq-catalog.json until the program or its packs change;
  · preset(): one preset's values and its small presets, for the page's defaults and its «changed» marks;
  · fxp(): a state (a preset, small presets, values) made a preset file: loaded, set, saved for a moment into the bank «Ruach Studio», copied
    out, deleted from Pianoteq's own folder (the bank's folder too when it was ours and empty); the render plays it with --fxp;
  · preview(): a short phrase (chords, arpeggios, a dynamic ladder, the keyboard's range) played with a state, cached by what it was;
  · keep(): a state saved as the user's own Pianoteq preset in the bank «Ruach Studio», where Pianoteq itself finds it (asked for, never by
    itself).
"""
import glob
import hashlib
import re
import importlib.util
import json
import os
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import paths                       # HERESY 2330: where the weights live

HERE = Path(__file__).resolve().parent
BANK = "Ruach Studio"
# HERESY 2036: the Modartt product this instance drives; lab/modartt.py loads this file once more for Organteq and for Airteq and sets them
NAME = "Pianoteq"
SLUG = "pianoteq"
IDLE = 20          # seconds: on the null sink nothing paces the engine, it spins a core and a quarter while up (31.10.2026); so it is up only while asked
KINDS = ("reverb", "tuning", "vel", "mic", "equ", "effect1")
SAMPLES = [i / 20 for i in range(21)]
_LOCK = threading.RLock()
_SRV = {"proc": None, "port": 0, "dir": None, "binary": None, "last": 0.0}
SILENT = "Default ALSA Output"                     # JUCE's name for ALSA's «default»: here, the null sink of the server's own ALSA configuration


def _step_module():
    """The step's own finder (one place says where Pianoteq is: user/pianoteq.json, models/refiner/instruments/, ~, the PATH)."""
    spec = importlib.util.spec_from_file_location("ruach_pianoteq_step", HERE / "builtin_steps" / "ruach" / "pianoteq.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def find(kit):
    return _step_module().find_modartt(kit, SLUG)


def _prefs_copy(kit):
    """The newest ~/.config/Modartt/Pianoteq*.prefs copied into a folder of its own under tmp/ (0700, the copy 0600)."""
    srcs = sorted(Path.home().glob(f".config/Modartt/{NAME}*.prefs"), key=lambda q: q.stat().st_mtime, reverse=True)
    root = Path(kit) / "tmp" / f"{SLUG}-live"
    root.mkdir(parents=True, exist_ok=True)
    d = Path(tempfile.mkdtemp(prefix="srv-", dir=str(root)))
    os.chmod(d, 0o700)
    p = d / "prefs"
    if srcs:
        shutil.copyfile(srcs[0], p)
        os.chmod(p, 0o600)
    return d, p


def _silent(d, prefs):
    """The server's engine on a device that cannot sound: its copy of the preferences names ALSA's default output, and its own ALSA
    configuration (ALSA_CONFIG_PATH, this process only) makes the default ALSA's null sink and defines nothing else."""
    conf = d / "alsa.conf"
    conf.write_text("pcm.default {\n    type null\n}\n", encoding="utf-8")
    setup = (f'<DEVICESETUP deviceType="ALSA" audioOutputDeviceName="{SILENT}" audioInputDeviceName="" audioDeviceRate="48000" '
             'audioDeviceBufferSize="1024"/>')
    val = setup.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    line = f'  <VALUE name="audio-setup" val="{val}"/>\n'
    if prefs.is_file():
        t = prefs.read_text(encoding="utf-8", errors="surrogateescape")
        t = re.sub(r'[ \t]*<VALUE name="audio-setup"(?:[^>]*/>|.*?</VALUE>)\s*\n?', "", t, flags=re.S)
        t = t.replace("</PROPERTIES>", line + "</PROPERTIES>", 1) if "</PROPERTIES>" in t else t
    else:
        t = '<?xml version="1.0" encoding="UTF-8"?>\n\n<PROPERTIES>\n' + line + "</PROPERTIES>\n"
    prefs.write_text(t, encoding="utf-8", errors="surrogateescape")
    os.chmod(prefs, 0o600)
    return dict(os.environ, ALSA_CONFIG_PATH=str(conf))


def sweep(kit):
    """At the lab's start: a server's folder left by a crash (its copy of the preferences) goes."""
    root = Path(kit) / "tmp" / f"{SLUG}-live"
    for d in root.glob("srv-*") if root.is_dir() else []:
        shutil.rmtree(d, ignore_errors=True)


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _call(port, method, params=None, timeout=30):
    body = json.dumps({"method": method, "params": params if params is not None else [], "jsonrpc": "2.0", "id": 1}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{port}/jsonrpc", body, {"Content-Type": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    if j.get("error"):
        raise RuntimeError(f"{NAME} {method}: {j['error'].get('message', j['error'])}")
    return j.get("result")


class Server:
    """One Pianoteq server for this process's work (the lab's page, or a step's render): started when asked, stopped by stop() or idle."""

    def __init__(self, kit):
        self.kit = kit

    def call(self, method, params=None, timeout=30):
        with _LOCK:
            self._up()
            _SRV["last"] = time.time()
            return _call(_SRV["port"], method, params, timeout)

    def _up(self):
        p = _SRV["proc"]
        if p is not None and p.poll() is None:
            return
        binary = find(self.kit)
        if binary is None:
            raise FileNotFoundError(f"no {NAME} here: unpack the one you bought (or its trial) from modartt.com into {paths.REFINER_INSTRUMENTS}/{SLUG}/ and "
                                    f"activate it, or name its program in user/{SLUG}.json {{\"path\": …}} (the guide: {NAME})")
        self.stop()
        d, prefs = _prefs_copy(self.kit)
        env = _silent(d, prefs)
        port = _free_port()
        proc = subprocess.Popen([str(binary), "--headless", "--quiet", "--prefs", str(prefs), "--serve", f"127.0.0.1:{port}"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, env=env,
                                preexec_fn=lambda: os.nice(10))
        _SRV.update(proc=proc, port=port, dir=d, binary=str(binary), last=time.time())
        for _ in range(80):
            try:
                _call(port, "list", timeout=3)
                break
            except Exception:  # noqa: BLE001 — not listening yet
                if proc.poll() is not None:
                    self.stop()
                    raise RuntimeError(f"{NAME} did not start: is it installed for this machine?")
                time.sleep(0.25)
        else:
            self.stop()
            raise RuntimeError(f"{NAME}'s server did not answer in 20 s")
        dev = {}
        for _ in range(24):                            # HERESY 2036: «started» a moment before «running» (Organteq), so asked until it runs
            try:
                dev = _call(port, "getAudioDeviceInfo", timeout=5)
                dev = (dev[0] if isinstance(dev, list) else dev) or {}
            except Exception:  # noqa: BLE001 — an older Pianoteq: said below as not running
                dev = {}
                break
            if dev.get("status") != "started":
                break
            time.sleep(0.25)
        if dev.get("device_type") != "ALSA" or dev.get("audio_output_device_name") != SILENT or dev.get("status") != "running":
            self.stop()
            raise RuntimeError(f"{NAME}'s engine did not start on the silent device (" + (dev.get("audio_output_device_name") or "none") +
                               "): without it no setting would reach the render")
        threading.Thread(target=self._idle, args=(proc,), daemon=True).start()

    def _idle(self, proc):
        while proc.poll() is None:
            time.sleep(2)
            with _LOCK:
                if _SRV["proc"] is proc and time.time() - _SRV["last"] > IDLE:
                    self.stop()
                    return

    def stop(self):
        with _LOCK:
            p, d, port = _SRV["proc"], _SRV["dir"], _SRV["port"]
            _SRV.update(proc=None, port=0, dir=None)
            if p is not None and p.poll() is None:
                try:
                    _call(port, "quit", timeout=2)          # asked to quit first: it leaves as it would
                except Exception:  # noqa: BLE001 — it is stopped below anyway
                    pass
                p.terminate()
                try:
                    p.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    p.kill()
            if d:
                shutil.rmtree(d, ignore_errors=True)


def _key(kit):
    """What the catalog depends on: the program, its version, and the packs beside it (a pack bought later changes the presets)."""
    b = find(kit)
    if b is None:
        return None
    packs = sorted(str(p.relative_to(b.parents[2])) + ":" + str(int(p.stat().st_mtime)) for p in b.parents[2].glob("**/*.ptq"))
    addons = Path.home() / f".local/share/Modartt/{NAME}/Addons"   # the free collections Pianoteq itself downloads (KIViR, Champagne)
    packs += sorted(p.name + ":" + str(int(p.stat().st_mtime)) for p in addons.glob("*")) if addons.is_dir() else []
    return hashlib.sha1(json.dumps([FORMAT, str(b), int(b.stat().st_mtime), packs]).encode()).hexdigest()[:16]


def _kind(texts):
    t = set(texts)
    if t <= {"Off", "On"}:
        return "switch"
    def num(s):
        try:
            float(s.replace("+", ""))
            return True
        except ValueError:
            return False
    nums = [x for x in texts if num(x) or x == "Off"]
    return "number" if len(nums) >= len(texts) - 1 else "choice"


GROUPS = [   # the page's sections, as Pianoteq's own window groups them; what is not named here goes to «More»
    ("main", ("volume", "dynamics", "condition", "velocity_offset", "diapason", "stereo_width", "post_effect_gain", "aftertouch", "mute")),
    ("design", ("unison", "octave_stretching", "unison_balance", "direct_sound", "hammer_noise", "hammer_hardness", "hammer_hardness_piano",
                "hammer_hardness_mezzo", "hammer_hardness_forte", "hammer_tone", "strike_point", "soft_level", "impedance", "impedance_cutoff",
                "q_factor", "string_length", "sympathetic_resonance", "duplex_scale_resonance", "quadratic_effect", "blooming_energy",
                "blooming_inertia", "morphing", "hammer_tine_noise", "attack_envelope", "smear")),
    ("spectrum", tuple(f"profil_{i}" for i in range(1, 9))),
    ("noises", ("damper_noise", "pedal_noise", "key_release_noise", "damper_position", "last_damper", "damping_duration")),
    ("mics", ("lid_position", "lid", "mic_level_compensation", "mic_delay_compensation", "wall_distance", "sound_speed", "bus_1_volume", "bus_1_pan")
             + tuple(f"mic_{i}_{k}" for i in range(1, 9) for k in ("mic_switch", "bus_1_volume", "bus_1_pan", "x", "y", "z", "azimuth", "elevation"))
             + ("head_x", "head_y", "head_z", "head_diameter", "head_angle")),
    ("reverb", ("reverb_switch", "reverb_duration", "reverb_mix", "room_dimensions", "reverb_pre_delay", "reverb_early_reflections", "reverb_tone",
                "reverb_highpass_cutoff", "reverb_envelope", "reverb_resampling")),
    ("effects", tuple(f"effect_{i}_{k}" for i in range(1, 4) for k in ["switch"] + [f"param_{j}" for j in range(1, 9)])),
    ("limiter", ("limiter_switch", "limiter_sharpness", "limiter_threshold", "limiter_gain", "equalizer_switch")),
    ("instrument", ("guitar_legato", "guitar_easy_fingering", "guitar_body", "fret", "virtuosity", "pinch_harmonic_point", "pickup_symmetry",
                    "pickup_distance", "clavinet_low_mic", "clavinet_high_mic", "harpsichord_register_1", "harpsichord_register_2",
                    "harpsichord_register_3", "external_audio_mix", "external_audio_tone")),
    ("bounce", ("bounce_switch", "bounce_delay", "bounce_sync", "bounce_sync_speed", "bounce_velocity_sensitivity", "bounce_delay_loss",
                "bounce_velocity_loss", "bounce_humanization")),
    ("nfx", ("nfx_lfo_shape", "nfx_lfo_skew", "nfx_lfo_rate", "nfx_lfo_phase", "nfx_lfo_phase_locked", "nfx_onset_duration", "nfx_vibrato",
             "nfx_vibrato_offset", "nfx_tremolo_depth", "nfx_tremolo_phase")),
]
# the pedals are the MIDI's (the step holds the sustain through each phrase); played by hand they are not a setting of a render
PEDALS = {"sustain_pedal", "soft_pedal", "sostenuto_pedal", "harmonic_pedal", "rattle_pedal", "lute_stop_pedal", "celeste_pedal", "mozart_rail",
          "super_sostenuto", "pinch_harmonic_pedal", "glissando_pedal", "thunder_pedal", "reversed_sustain", "pitch_bend", "keyboard_range_switch"}


FORMAT = 3   # 2: each preset says whether it plays in full here (ok) and under which licence; the activation's add-ons
             # 3: read from a running engine (on the silent device), each parameter on its preset's own values


def catalog(kit, refresh=False):
    """The presets, the small presets and the parameters of the Pianoteq here (built once, kept until it changes)."""
    key = _key(kit)
    if key is None:
        return {"available": False, "why": "no Pianoteq here: the guide's Pianoteq says where to put the one you bought"}
    cache = Path(kit) / "user" / f"{SLUG}-catalog.json"
    if not refresh and cache.is_file():
        try:
            c = json.load(open(cache, encoding="utf-8"))
            if c.get("key") == key and not c.get("stale"):   # HERESY 1986: an activation since makes it stale (what plays in full changed)
                return c
        except (OSError, ValueError):
            pass
    srv = Server(kit)
    info = srv.call("getInfo")
    info = info[0] if isinstance(info, list) else info
    presets = [dict({k: p.get(k, "") for k in ("name", "bank", "instr", "class", "collection", "comment", "author")},
                    ok=p.get("license_status", "ok") == "ok", licence=str(p.get("license") or "")) for p in srv.call("getListOfPresets")]
    try:                                             # what is activated here: its add-ons and its word; never the name, the e-mail, the serial
        a = srv.call("getActivationInfo")
        a = a[0] if isinstance(a, list) else a
        activation = {"status": a.get("status"), "addons": [x for x in a.get("addons") or [] if x], "error": str(a.get("error_msg") or "")}
    except Exception:  # noqa: BLE001 — an older Pianoteq without it
        activation = None
    small = {}
    for kind in KINDS:
        try:
            small[kind] = [{"name": p.get("name", ""), "bank": p.get("bank", "")} for p in srv.call("getListOfPresets", {"preset_type": kind})]
        except Exception:  # noqa: BLE001 — an older Pianoteq without this kind
            small[kind] = []
    first = next((p for p in presets if p.get("class") == "Acoustic Piano"), presets[0] if presets else {"name": "", "bank": ""})
    base = srv.call("getParameters")
    params = {}
    for q in base:
        pid, name = q["id"], str(q.get("name", ""))
        locked = name.startswith("(locked)")
        params[pid] = {"name": name.replace("(locked)", "").strip(), "locked": locked, "unit": q.get("unit", ""), "pedal": pid in PEDALS}
    free = [pid for pid, meta in params.items() if not meta["locked"] and not meta["pedal"]]
    if SLUG == "pianoteq":                           # each parameter on its own (1977's way)
        for pid in free:
            srv.call("loadPreset", {"name": first["name"], "bank": first.get("bank", "")})
            _settle(srv)
            scale = []
            for x in SAMPLES:
                srv.call("setParameters", {"list": [{"id": pid, "normalized_value": x}]})
                _settle(srv)
                r = next((r for r in srv.call("getParameters") if r["id"] == pid), None)
                if r is not None:
                    scale.append([round(x, 4), round(float(r.get("normalized_value", x)), 4), str(r.get("text", ""))])
            params[pid]["scale"] = scale
    else:                                            # HERESY 2036: hundreds of them (an organ's stops): a sample set on all at once, read back once
        for pid in free:
            params[pid]["scale"] = []
        for x in SAMPLES:
            srv.call("loadPreset", {"name": first["name"], "bank": first.get("bank", "")})
            _settle(srv)
            srv.call("setParameters", {"list": [{"id": pid, "normalized_value": x} for pid in free]})
            _settle(srv)
            got = {r["id"]: r for r in srv.call("getParameters")}
            for pid in free:
                r = got.get(pid)
                if r is not None:
                    params[pid]["scale"].append([round(x, 4), round(float(r.get("normalized_value", x)), 4), str(r.get("text", ""))])
    for pid in free:
        meta = params[pid]
        meta["kind"] = _kind([s[2] for s in meta["scale"]])
        if len({s[2] for s in meta["scale"]}) == 1:
            meta["locked"] = True                    # set and read back the same: this edition keeps it
    grouped = {pid for _g, ids in GROUPS for pid in ids}
    groups = [{"id": g, "params": [pid for pid in ids if pid in params]} for g, ids in GROUPS]
    groups.append({"id": "more", "params": [pid for pid in params if pid not in grouped and not params[pid]["pedal"]]})
    c = {"available": True, "key": key, "built": time.strftime("%Y-%m-%d %H:%M"), "version": info.get("version", ""),
         "product": info.get("product_name", ""), "activation": activation, "presets": presets, "small": small, "params": params, "groups": groups,
         "locked": sum(1 for m in params.values() if m["locked"]), "free": sum(1 for m in params.values() if not m["locked"] and not m["pedal"])}
    _save_catalog(kit, c)
    return c


# HERESY 1986: the Engine's Pianoteq tab. What is here, asked of Pianoteq itself; its activation in its own words (status, add-ons, its message),
# never the name, the e-mail or the serial it also knows
def _shown(kit, p):
    if p is None:
        return ""
    for root, say in ((Path(kit).resolve(), ""), (Path.home(), "~/")):
        try:
            return say + str(Path(p).resolve().relative_to(root))
        except ValueError:
            pass
    return str(p)


def status(kit):
    b = find(kit)
    prefs = sorted(Path.home().glob(f".config/Modartt/{NAME}*.prefs"), key=lambda q: q.stat().st_mtime, reverse=True)
    out = {"installed": b is not None, "program": _shown(kit, b), "prefs": bool(prefs)}
    if b is None:
        return out
    srv = Server(kit)
    info = srv.call("getInfo")
    info = (info[0] if isinstance(info, list) else info) or {}
    try:
        a = srv.call("getActivationInfo")
        a = (a[0] if isinstance(a, list) else a) or {}
        act = {"status": a.get("status"), "addons": [x for x in a.get("addons") or [] if x], "error": str(a.get("error_msg") or "")}
    except Exception:  # noqa: BLE001 — an older Pianoteq without it
        act = None
    presets = srv.call("getListOfPresets") or []
    by = {}
    for p in presets:
        k = (p.get("instr") or "", p.get("class") or "")
        n = by.setdefault(k, [0, 0])
        n[0] += 1
        n[1] += p.get("license_status", "ok") == "ok"
    inst = sorted(({"instr": i, "class": c, "presets": n, "full": ok} for (i, c), (n, ok) in by.items()), key=lambda r: (-r["full"], r["class"], r["instr"]))
    out.update(version=str(info.get("version") or ""), build=str(info.get("build_date") or ""), product=str(info.get("product_name") or ""),
               activation=act, presets={"total": len(presets), "full": sum(r["full"] for r in inst)}, instruments=inst, editable=None)
    try:                                             # what this edition lets one set, if the step's window has read it once
        c = json.load(open(Path(kit) / "user" / f"{SLUG}-catalog.json", encoding="utf-8"))
        if c.get("key") == _key(kit):
            out["editable"] = {"free": c.get("free"), "locked": c.get("locked")}
    except (OSError, ValueError):
        pass
    return out


SERIAL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{6,62}[A-Za-z0-9]$")


def _audio_setup(text):
    m = re.search(r'[ \t]*<VALUE name="audio-setup"(?:[^>]*/>|.*?</VALUE>)', text, flags=re.S)
    return m.group(0) if m else None


def activate(kit, serial):
    """The serial given to the Pianoteq here through its own JSON-RPC «activate», on the user's own preferences (where Pianoteq keeps its activation):
    a server started without a copy, its engine on no device (the null ALSA of _silent), asked to activate, asked what it now is, then asked to quit,
    as Pianoteq keeps its preferences when it quits. The audio setup in those preferences is put back if Pianoteq changed it. The serial lives only
    in this call: never in a command line, a log, a file or the answer. Returns status() after it."""
    serial = re.sub(r"\s+", "", str(serial or ""))
    if not SERIAL.match(serial):
        raise ValueError(f"a {NAME} serial is letters, digits and dashes, as your Modartt user area shows it")
    b = find(kit)
    if b is None:
        raise FileNotFoundError(f"no {NAME} here to activate: install it first (Engine → {NAME} → Install)")
    with _LOCK:
        Server(kit).stop()                           # its copy of the preferences would not see the activation
        prefs = sorted(Path.home().glob(f".config/Modartt/{NAME}*.prefs"), key=lambda q: q.stat().st_mtime, reverse=True)
        before = prefs[0].read_text(encoding="utf-8", errors="surrogateescape") if prefs else None
        root = Path(kit) / "tmp" / f"{SLUG}-live"
        root.mkdir(parents=True, exist_ok=True)
        d = Path(tempfile.mkdtemp(prefix="act-", dir=str(root)))
        os.chmod(d, 0o700)
        conf = d / "alsa.conf"
        conf.write_text("pcm.default {\n    type null\n}\n", encoding="utf-8")
        port = _free_port()
        proc = subprocess.Popen([str(b), "--headless", "--quiet", "--serve", f"127.0.0.1:{port}"], stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
                                env=dict(os.environ, ALSA_CONFIG_PATH=str(conf)))
        said = None
        try:
            for _ in range(80):
                try:
                    _call(port, "list", timeout=3)
                    break
                except Exception:  # noqa: BLE001 — not listening yet
                    if proc.poll() is not None:
                        raise RuntimeError(f"{NAME} did not start: is it installed for this machine?")
                    time.sleep(0.25)
            else:
                raise RuntimeError(f"{NAME} did not answer in 20 s")
            try:
                _call(port, "activate", {"serial": serial, "device_name": socket.gethostname()}, timeout=120)
            except RuntimeError as e:                # Pianoteq's own words, without the serial
                said = str(e).replace(serial, "…")
            a = _call(port, "getActivationInfo", timeout=10)
            a = (a[0] if isinstance(a, list) else a) or {}
            if said is None and a.get("status") != 1:
                said = str(a.get("error_msg") or f"{NAME} is still not activated")
        finally:
            serial = ""
            try:
                _call(port, "quit", timeout=5)
            except Exception:  # noqa: BLE001 — stopped below anyway
                pass
            try:
                proc.wait(timeout=20)
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
            shutil.rmtree(d, ignore_errors=True)
            if before is not None and prefs and prefs[0].is_file():   # its audio setup as the user left it
                now = prefs[0].read_text(encoding="utf-8", errors="surrogateescape")
                old, new = _audio_setup(before), _audio_setup(now)
                if old != new:
                    if new is not None and old is not None:
                        now = now.replace(new, old, 1)
                    elif new is not None:
                        now = now.replace(new, "", 1)
                    elif "</PROPERTIES>" in now:
                        now = now.replace("</PROPERTIES>", old + "\n</PROPERTIES>", 1)
                    prefs[0].write_text(now, encoding="utf-8", errors="surrogateescape")
        cache = Path(kit) / "user" / f"{SLUG}-catalog.json"
        if cache.is_file():                          # what plays in full may have changed: read again when the window next asks
            try:
                c = json.load(open(cache, encoding="utf-8"))
                c["stale"] = True
                _save_catalog(kit, c)
            except (OSError, ValueError):
                pass
    out = status(kit)
    if said:
        out["said"] = said
    return out


def _save_catalog(kit, c):
    cache = Path(kit) / "user" / f"{SLUG}-catalog.json"
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".part")
    json.dump(c, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, cache)
    return c


def licensed(kit, name, bank=""):
    """Whether a preset plays in full here, by the catalog already built (None: not known yet; nothing is asked of Pianoteq)."""
    try:
        c = json.load(open(Path(kit) / "user" / f"{SLUG}-catalog.json", encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if c.get("key") != _key(kit):
        return None
    p = next((p for p in c.get("presets") or [] if p.get("name") == name and (p.get("bank") or "") == (bank or "")), None)
    return None if p is None or "ok" not in p else bool(p["ok"])


def _settle(srv, limit=5.0):
    """Until the engine has taken what it was told (a preset loaded, values set): Pianoteq says so in getInfo."""
    t0 = time.time()
    while time.time() - t0 < limit:
        i = srv.call("getInfo")
        i = (i[0] if isinstance(i, list) else i) or {}
        if not i.get("computing_parameter_update"):
            return
        time.sleep(0.05)


def _info(srv):
    i = srv.call("getInfo")
    return (i[0] if isinstance(i, list) else i) or {}


def _until(srv, ok, limit=5.0):
    """Until Pianoteq's own word (getInfo) says the engine has taken what it was told; False when it never says so in `limit` seconds."""
    t0 = time.time()
    while time.time() - t0 < limit:
        i = _info(srv)
        if not i.get("computing_parameter_update") and ok(i):
            return True
        time.sleep(0.03)
    return False


def _mini(i, kind):
    v = ((i.get("current_preset") or {}).get("mini_presets") or {}).get(kind)
    return v.get("name") if isinstance(v, dict) else v


def _load_preset(srv, name, bank=""):
    srv.call("loadPreset", {"name": name, "bank": bank})
    if not _until(srv, lambda i: (i.get("current_preset") or {}).get("name") == name):
        raise RuntimeError(f"{NAME} did not load the preset «{name}»")


def _load_small(srv, kind, name):
    srv.call("loadPreset", {"name": name, "bank": "", "preset_type": kind})
    if not _until(srv, lambda i: _mini(i, kind) == name):
        raise RuntimeError(f"{NAME} did not load the small preset «{name}» ({kind})")


def _load(srv, state):
    """A state into the running Pianoteq: its preset, its small presets, its values (only what it names), each waited for until Pianoteq
    says it has taken it (HERESY 1981b: a file saved before that plays the bare preset)."""
    _load_preset(srv, str(state.get("preset") or "NY Steinway D Classical"), str(state.get("bank") or ""))
    for kind, name in (state.get("small") or {}).items():
        if kind in KINDS and name:
            _load_small(srv, kind, str(name))
    now = {r["id"]: float(r.get("normalized_value", 0)) for r in srv.call("getParameters")}
    vals = [{"id": str(k), "normalized_value": max(0.0, min(1.0, float(v)))} for k, v in (state.get("values") or {}).items()
            if isinstance(v, (int, float)) and abs(now.get(str(k), -1.0) - max(0.0, min(1.0, float(v)))) > 0.0005]
    if vals:
        srv.call("setParameters", {"list": vals})
        if not _until(srv, lambda i: bool(i.get("modified"))):
            raise RuntimeError(f"{NAME} did not take the settings: the render would play the bare preset")
        time.sleep(0.05)


def _effects(kit, srv, rows):
    """The loaded state's three effect slots: each slot's effect named by its parameters' names (Pianoteq's ids are the same for every
    effect), and each parameter's scale in Pianoteq's words, sampled on the slot the first time that effect is met and kept in the catalog."""
    cat = catalog(kit)
    scales = cat.setdefault("effect_scales", {})
    cur = {r["id"]: r for r in rows}
    out, learnt = {}, False
    for slot in (1, 2, 3):
        ids = [f"effect_{slot}_param_{k}" for k in range(1, 9) if f"effect_{slot}_param_{k}" in cur]
        if not ids:
            continue
        names = [re.sub(r"^\(locked\)\s*", "", str(cur[i].get("name", ""))) for i in ids]
        key = "|".join(re.sub(r"^Eff \d+ ", "", n) for n in names)
        if key not in scales:
            meta = []
            for i, n in zip(ids, names):
                was = float(cur[i].get("normalized_value", 0))
                sc = []
                for x in SAMPLES:
                    srv.call("setParameters", {"list": [{"id": i, "normalized_value": x}]})
                    _settle(srv)
                    r = next((r for r in srv.call("getParameters") if r["id"] == i), None)
                    if r is not None:
                        sc.append([round(x, 4), round(float(r.get("normalized_value", x)), 4), str(r.get("text", ""))])
                srv.call("setParameters", {"list": [{"id": i, "normalized_value": was}]})   # the slot as it was
                _settle(srv)
                texts = [s[2] for s in sc]
                meta.append({"name": re.sub(r"^Eff \d+ ", "", n), "kind": _kind(texts), "scale": sc, "locked": len(set(texts)) <= 1})
            scales[key] = meta
            learnt = True
        out[str(slot)] = {"key": key, "params": {i: scales[key][n] for n, i in enumerate(ids)}}
    if learnt:
        _save_catalog(kit, cat)
    return out


def preset(kit, name, bank="", small=None):
    """One preset's values (normalized and in Pianoteq's words), the small presets it carries, and its effects (what each slot is, its
    parameters' scales); with `small`, as those small presets leave it (the base a panel marks its changes against)."""
    srv = Server(kit)
    with _LOCK:
        _load_preset(srv, name, bank)                   # HERESY 1981b: its values read once the engine has it
        for kind, nm in (small or {}).items():
            if kind in KINDS and nm:
                _load_small(srv, kind, str(nm))
        info = srv.call("getInfo")
        info = info[0] if isinstance(info, list) else info
        cur = info.get("current_preset") or {}
        rows = srv.call("getParameters")
        effects = _effects(kit, srv, rows)
    return {"name": name, "bank": bank, "instr": cur.get("instrument", ""), "comment": cur.get("comment", ""),
            "small": {k: (v.get("name") if isinstance(v, dict) else v) for k, v in (cur.get("mini_presets") or {}).items()},
            "values": {r["id"]: [round(float(r.get("normalized_value", 0)), 4), str(r.get("text", ""))] for r in rows},
            "effects": effects}


def _bank_dir_known():
    """Whether the bank's folder is there already, where Pianoteq keeps its user presets on Linux (taken away after a save only if it was not)."""
    return (Path.home() / f".local/share/Modartt/{NAME}/Presets" / BANK).is_dir()


def _saved_file(srv, name):
    for p in srv.call("getListOfPresets"):
        if p.get("name") == name and p.get("bank") == BANK:
            return Path(p.get("file", ""))
    return None


def fxp(kit, state, dest):
    """The state as a preset file at dest: saved for a moment into the bank «Ruach Studio», copied out, deleted from Pianoteq's folder."""
    srv = Server(kit)
    name = f"ruach-{os.getpid()}-{int(time.time() * 1000)}"
    with _LOCK:
        _load(srv, state)
        had = _bank_dir_known()
        srv.call("savePreset", {"name": name, "bank": BANK})
        f = _saved_file(srv, name)
        try:
            if f is None or not f.is_file():
                raise RuntimeError(f"{NAME} saved no preset file")
            Path(dest).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, dest)
        finally:
            try:
                srv.call("deletePreset", {"name": name, "bank": BANK})
            except Exception:  # noqa: BLE001 — the file below is ours to take away all the same
                pass
            if f is not None:
                f.unlink(missing_ok=True)
                if not had and f.parent.name == BANK:
                    try:
                        f.parent.rmdir()            # the bank's folder only when this save made it and it is empty again
                    except OSError:
                        pass
    return Path(dest)


def keep(kit, state, name):
    """The state as the user's own Pianoteq preset, in the bank «Ruach Studio» (asked for by the user)."""
    name = " ".join(str(name or "").split())[:60]
    if not name:
        raise ValueError("a name for the preset")
    srv = Server(kit)
    with _LOCK:
        _load(srv, state)
        srv.call("savePreset", {"name": name, "bank": BANK})
    c = catalog(kit)                                     # HERESY 1981: the browser finds it at once, as Pianoteq itself does
    if not any(p.get("name") == name and p.get("bank") == BANK for p in c["presets"]):
        b = next((p for p in c["presets"] if p.get("name") == state.get("preset") and (p.get("bank") or "") == (state.get("bank") or "")), {})
        c["presets"].append({"name": name, "bank": BANK, "instr": b.get("instr", ""), "class": b.get("class", ""), "collection": b.get("collection", ""),
                             "comment": "", "author": "", "ok": b.get("ok", True), "licence": b.get("licence", "")})
        _save_catalog(kit, c)
    return {"name": name, "bank": BANK}


# ---- the phrases a state is heard with (a small SMF writer: notes and the sustain pedal)
def _smf(notes, cc, path, tempo=500000):
    ev = []
    for on, off, key, vel in notes:
        ev.append((on, 0x90, key, vel))
        ev.append((off, 0x80, key, 0))
    for t, num, val in cc:
        ev.append((t, 0xB0, num, val))
    ev.sort(key=lambda e: (e[0], 0 if e[1] == 0x80 else 1))
    tpq, data, last = 480, bytearray(), 0
    def vlq(n):
        out = [n & 0x7F]
        n >>= 7
        while n:
            out.insert(0, (n & 0x7F) | 0x80)
            n >>= 7
        return bytes(out)
    data += vlq(0) + bytes([0xFF, 0x51, 0x03]) + tempo.to_bytes(3, "big")
    for t, st, a, b in ev:
        tick = int(round(t * tpq * 1e6 / tempo))
        data += vlq(max(0, tick - last)) + bytes([st, a, b])
        last = max(last, tick)
    data += vlq(0) + bytes([0xFF, 0x2F, 0x00])
    Path(path).write_bytes(b"MThd" + struct.pack(">IHHH", 6, 0, 1, tpq) + b"MTrk" + struct.pack(">I", len(data)) + bytes(data))
    return Path(path)


def phrase(kind):
    """(notes, cc): chords (I–V–vi–IV with the pedal), arpeggios across four octaves, a ladder of one key from pianissimo to fortissimo,
    and the keyboard's range from its lowest A to its highest C."""
    notes, cc = [], []
    if kind == "arpeggio":
        t = 0.0
        for root in (48, 43, 45, 41):
            for k in (0, 7, 12, 16, 19, 24, 28, 31, 36):
                notes.append((t, t + 0.9, root + k, 70)); t += 0.16
            cc += [(t - 9 * 0.16, 64, 127), (t - 0.02, 64, 0)]
        return notes, cc
    if kind == "ladder":
        for i, v in enumerate(range(16, 128, 16)):
            notes.append((i * 0.7, i * 0.7 + 0.6, 60, v))
            notes.append((i * 0.7, i * 0.7 + 0.6, 67, v))
        return notes, cc
    if kind == "range":
        keys = list(range(21, 109, 7)) + [108]
        for i, k in enumerate(keys):
            notes.append((i * 0.45, i * 0.45 + 0.8, k, 80))
        return notes, cc
    t = 0.0                                          # chords
    for chord in ((48, 60, 64, 67, 72), (43, 59, 62, 67, 71), (45, 60, 64, 69, 72), (41, 60, 65, 69, 72)):
        cc += [(t, 64, 127), (t + 1.9, 64, 0)]
        for i, k in enumerate(chord):
            notes.append((t + i * 0.02, t + 1.95, k, 62 + 6 * (i == len(chord) - 1)))
        t += 2.0
    return notes, cc


def render(kit, fxp_file, midi, wav, rate=48000):
    """Pianoteq plays the MIDI with the preset file, on its own copy of the preferences (the step's way); silence is refused."""
    binary = find(kit)
    d, prefs = _prefs_copy(kit)
    try:
        r = subprocess.run([str(binary), "--headless", "--quiet", "--prefs", str(prefs), "--fxp", str(fxp_file), "--midi", str(midi),
                            "--wav", str(wav), "--rate", str(rate)], capture_output=True, text=True, timeout=600)
    finally:
        shutil.rmtree(d, ignore_errors=True)
    if not Path(wav).is_file():
        raise RuntimeError(f"{NAME} made no sound: " + ((r.stderr or "").strip() or (r.stdout or "").strip())[-300:])
    return Path(wav)


def preview(kit, state, kind="chords", cache=None):
    """A short phrase played with the state, kept by what it was (the last 40)."""
    kind = kind if kind in ("chords", "arpeggio", "ladder", "range") else "chords"
    box = Path(cache or (Path(kit) / "tmp" / f"{SLUG}-preview"))
    box.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(json.dumps([state, kind, _key(kit)], sort_keys=True).encode()).hexdigest()[:20]
    out = box / f"{h}.wav"
    if out.is_file():
        return out
    work = Path(tempfile.mkdtemp(prefix="pv-", dir=str(box)))
    try:
        f = fxp(kit, state, work / "state.fxp")
        notes, cc = phrase(kind)
        mid = _smf(notes, cc, work / "phrase.mid")
        render(kit, f, mid, work / "out.wav")
        import numpy as np
        import soundfile as sf
        a, _ = sf.read(str(work / "out.wav"), always_2d=True, dtype="float32")
        if not a.size or 20 * np.log10(np.sqrt(np.mean(a.astype(np.float64) ** 2)) + 1e-12) < -70:
            raise RuntimeError(f"{NAME} played silence: is it activated? (run it once and activate it with your own serial)")
        os.replace(work / "out.wav", out)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    for old in sorted(box.glob("*.wav"), key=lambda q: q.stat().st_mtime)[:-40]:
        old.unlink(missing_ok=True)
    return out
