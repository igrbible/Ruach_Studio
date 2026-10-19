"""HERESY 1512: the audio interfaces read from a made-up /proc/asound, a recording's levels, the gateway kept. python3 lab/test_audio_io.py"""
import json
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audio_io as aio  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


CARDS = """ 0 [NVidia         ]: HDA-Intel - HDA NVidia
                      HDA NVidia at 0xf3080000 irq 117
 4 [S24            ]: USB-Audio - Studio 24
                      PreSonus Studio 24 at usb-0000:00:14.0-1, high speed
 5 [Loopback       ]: Loopback - Loopback
                      Loopback 1
"""
PCM = """00-03: HDMI 0 : HDMI 0 : playback 1
04-00: USB Audio : USB Audio : playback 1 : capture 1
05-00: Loopback PCM : Loopback PCM : playback 8 : capture 8
"""
STREAM = """PreSonus Studio 24 at usb-0000:00:14.0-1, high speed : USB Audio

Playback:
  Status: Stop
  Interface 2
    Altset 1
    Format: S32_LE
    Channels: 2
    Rates: 44100, 48000, 88200, 96000, 176400, 192000
    Bits: 24

Capture:
  Status: Stop
  Interface 1
    Altset 1
    Format: S32_LE
    Channels: 2
    Rates: 44100, 48000, 96000
    Bits: 24
"""
with tempfile.TemporaryDirectory() as t:
    root = Path(t) / "asound"
    (root / "card4").mkdir(parents=True)
    (root / "cards").write_text(CARDS); (root / "pcm").write_text(PCM); (root / "card4" / "stream0").write_text(STREAM)
    cs = aio.cards(str(root))
    check("three cards, the loopback one virtual", [(c["card"], c["id"], c["virtual"]) for c in cs] == [(0, "NVidia", False), (4, "S24", False), (5, "Loopback", True)], cs)
    ps = aio.pcms(str(root))
    check("the PCMs and their ways", [(p["card"], p["device"], p["out"], p["in"]) for p in ps] == [(0, 3, True, False), (4, 0, True, True), (5, 0, True, True)], ps)
    st = aio.streams(str(root), 4)
    check("the USB card's formats each way", st == {"out": {"channels": 2, "bits": 24, "rates": [44100, 48000, 88200, 96000, 176400, 192000]},
                                                   "in": {"channels": 2, "bits": 24, "rates": [44100, 48000, 96000]}}, st)
    check("a card without stream0: no formats, no error", aio.streams(str(root), 0) == {})
    d = aio.devices(str(root), user_dir=t)
    names = [(x["id"], x["device"]) for x in d["physical"]]
    check("physical: the HDMI out and the Studio 24 (with its formats); the loopback among the virtual",
          names == [("NVidia", 3), ("S24", 0)] and d["physical"][1]["alsa"] == "hw:CARD=S24,DEV=0" and d["physical"][1]["formats"]["in"]["channels"] == 2 and
          any(v.get("kind") == "loopback" for v in d["virtual"]), d["physical"])
    check("what does not run is said, not left out", isinstance(d["said"], list), d["said"])
    # a recording's levels: a −20 dBFS sine on the left, silence on the right
    w = Path(t) / "x.wav"
    n = 48000
    x = (0.1 * np.sqrt(2) * np.sin(np.arange(n) * 2 * np.pi * 1000 / 48000) * (2 ** 31 - 1)).astype(np.int32)
    with wave.open(str(w), "wb") as f:
        f.setnchannels(2); f.setsampwidth(4); f.setframerate(48000)
        f.writeframes(np.stack([x, np.zeros(n, np.int32)], 1).tobytes())
    lv = aio.levels(w)
    check("levels: −20 dBFS RMS on the left, digital silence said as −200 on the right", abs(lv["rms_db"][0] + 20) < 0.2 and lv["rms_db"][1] == -200.0, lv)
    check("  the left's peak 3 dB over its RMS (a sine)", abs(lv["peak_db"][0] - lv["rms_db"][0] - 3.0) < 0.2, lv)
    g = aio.set_gateway(t, "hw:CARD=S24,DEV=0", "hw:CARD=S24,DEV=0", 96000)
    check("the gateway kept and read back", aio.gateway(t) == g == {"out": "hw:CARD=S24,DEV=0", "in": "hw:CARD=S24,DEV=0", "rate": 96000}, aio.gateway(t))
    for args, why in ((("a", "b", 12345), "a rate no converter runs at"), (("hw:0;rm -rf /", "", 0), "a device name with a shell in it")):
        try:
            aio.set_gateway(t, *args)
            check("refused: " + why, False, "kept")
        except ValueError:
            check("refused: " + why, True)
    try:
        aio.probe("x; rm -rf /")
        check("probe refused: a device name with a shell in it", False, "ran")
    except ValueError:
        check("probe refused: a device name with a shell in it", True)
# HERESY 1514: the loop measured: a clean loop at −6 dB, one with a 2nd harmonic of 1 %, one that never answered
sig = aio.loop_signal(48000, -20.0).astype(np.float64) / (2 ** 31 - 1)
pad = np.zeros((4800, 2))
rec = np.concatenate([pad, sig * 10 ** (-6 / 20), pad]) + np.random.default_rng(1).normal(0, 1e-5, (len(sig) + 9600, 2))
m = aio.loop_measure(rec, 48000, -20.0)
check("a clean loop: it answered, gain −6 dB on both, noise about −100 dBFS, THD tiny", m["answered"] and all(abs(g + 6) < 0.1 for g in m["gain_db"]) and
      all(-103 < n < -97 for n in m["noise_db"]) and all(t < 0.05 for t in m["thd_pct"]), m)
t = np.arange(len(sig)) / 48000
dist = sig.copy(); dist[:, 0] += 0.01 * (10 ** (-20 / 20)) * np.sin(2 * np.pi * 2000 * t) * (np.abs(sig[:, 0]) > 0)
m2 = aio.loop_measure(np.concatenate([pad, dist, pad]), 48000, -20.0)
check("a 2nd harmonic of 1 % on the left: THD about 1 %, the right clean", abs(m2["thd_pct"][0] - 1.0) < 0.2 and m2["thd_pct"][1] < 0.05, m2)
m3 = aio.loop_measure(np.random.default_rng(2).normal(0, 1e-5, (len(sig) + 9600, 2)), 48000, -20.0)
check("nothing came back: not answered, no gain claimed, the noise said", not m3["answered"] and m3["gain_db"] == [None, None] and all(n is not None for n in m3["noise_db"]), m3)
try:
    aio.loop("hw:0", "", 48000)
    check("the loop refused without an input", False, "ran")
except ValueError:
    check("the loop refused without an input", True)
# HERESY 1546: an input still settling is left out of its floor
import tempfile as _tf, wave as _wv  # noqa: E402
with _tf.TemporaryDirectory() as _d:
    _p = Path(_d) / "settle.wav"
    _r = 48000
    _x = np.concatenate([np.full(int(0.4 * _r), 0.3), np.zeros(int(1.2 * _r)), np.random.default_rng(1546).standard_normal(_r) * 10 ** (-95 / 20)])
    with _wv.open(str(_p), "wb") as _f:
        _f.setnchannels(2); _f.setsampwidth(4); _f.setframerate(_r); _f.writeframes((np.stack([_x, _x], 1) * (2 ** 31 - 1)).astype(np.int32).tobytes())
    _all, _set = aio.levels(_p), aio.levels(_p, skip=aio.SETTLE)
    check("the floor read after the input settles: a thump at the start left out (−95 dBFS, not what the thump makes it)",
          abs(_set["rms_db"][0] + 95) < 0.5 and _all["rms_db"][0] > -30, (_all, _set))
print("test_audio_io:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
