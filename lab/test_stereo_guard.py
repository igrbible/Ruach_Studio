"""HERESY 2340: the Trainer's stereo guard (lab/stereo_guard.py). Takes made here of noise whose side is a known share of its middle, so the
numbers are known before they are measured: the measure (side against middle in four bands, the panorama's spread, mono), the groups by what sang
them, the base found on the same cards (the same seed first, the library when the workspace has none), the words past the lines, a take that does
not decode said and never measured, the numbers kept and not measured twice, user/stereo-guard.json's lines, and the lab's own Handler answering
GET /stereo/guard (202 while it measures, listed in /health, 200 with the table, 400 and a failure said). Its library a temporary folder.
    python3 lab/test_stereo_guard.py"""
import importlib.util
import json
import zlib
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import stereo_guard as g  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:400] + ")"))
    if not ok:
        bad.append(what)


SR = 48000


def write_wav(p, L, R):
    x = np.stack([L, R], 1)
    x = np.clip(x / max(1e-9, float(np.abs(x).max())) * 0.7, -1, 1)
    w = wave.open(str(p), "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((x * 32767).astype("<i2").tobytes())
    w.close()


def noise_take(p, side_db, seconds=6.0, seed=1, pan_db=0.0):
    """mid and side two independent noises, the side side_db under the middle in every band; pan_db: the image swings that far L and R"""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    m, s = rng.standard_normal(n), rng.standard_normal(n) * 10 ** (side_db / 20)
    L, R = m + s, m - s
    if pan_db:
        k = 10 ** (pan_db / 40)                           # L/R level difference pan_db: L × k, R / k, every other second the other way
        sw = np.where((np.arange(n) // SR) % 2 == 0, k, 1 / k)
        L, R = L * sw, R / sw
    write_wav(p, L, R)


tmp = Path(tempfile.mkdtemp(prefix="ruach-tstereo-"))
OUT, CACHE, USER = tmp / "outputs", tmp / "cache", tmp / "user"
OUT.mkdir()
USER.mkdir()
cards = {"A": ("rock ballad, guitars left and right", "[Verse]\nla la"), "B": ("shoegaze", "[Verse]\nna na"), "C": ("folk", "[Verse]\nda da")}


def take(name, backbone, card, seed, side_db, loras=None, pan_db=0.0, audio=True, vae=""):
    d = OUT / name
    d.mkdir()
    req = {"backbone": backbone, "seed": seed, "loras": loras or [], "vae": vae}
    if card:
        req.update(style=cards[card][0], lyrics=cards[card][1])
    (d / "request.json").write_text(json.dumps(req), encoding="utf-8")
    (d / "meta.json").write_text(json.dumps({"title": name, "model": backbone}), encoding="utf-8")
    if audio is True:
        noise_take(d / "audio.wav", side_db, seed=zlib.crc32(name.encode()), pan_db=pan_db)
    elif audio:
        (d / "audio.wav").write_bytes(audio)
    return name


# the measure, on noise whose numbers are known
noise_take(tmp / "w10.wav", -10.0)
m = g.measure(tmp / "w10.wav")
check("side 10 dB under the middle reads -10 dB in every band (±0.6)", all(abs(m["sm_" + b] + 10) < 0.6 for b in g.BANDS), m)
w = tmp / "mono.wav"
x = np.random.default_rng(3).standard_normal(SR * 3)
write_wav(w, x, x)
check("a mono take reads mono", g.measure(w).get("mono") is True, g.measure(w))
noise_take(tmp / "p12.wav", -10.0, pan_db=12.0)
noise_take(tmp / "p6.wav", -10.0, pan_db=6.0)
s12, s6, s0 = g.measure(tmp / "p12.wav")["ild_spread"], g.measure(tmp / "p6.wav")["ild_spread"], m["ild_spread"]
check("the panorama's spread grows with the swing (0 < 6 < 12 dB)", s0 < s6 < s12 and abs(s12 - 24) < 4, (s0, s6, s12))
(tmp / "junk.wav").write_bytes(b"not a sound")
check("a file that does not decode is said, not measured", "error" in g.measure(tmp / "junk.wav"))

# a workspace of probes: the base (stock BF16) at -6 dB, X at -12 dB on the same cards and seeds, Y as wide, Z on a card with no base
names = [take("b-A1", "BF16", "A", 1, -6), take("b-A2", "BF16", "A", 2, -6), take("b-B1", "BF16", "B", 1, -6, pan_db=12),
         take("x-A1", "RS-TEST-1x0.9-BF16", "A", 1, -12), take("x-A2", "RS-TEST-1x0.9-BF16", "A", 2, -12), take("x-B1", "RS-TEST-1x0.9-BF16", "B", 1, -12, pan_db=6),
         take("y-A1", "BF16", "A", 1, -6, loras=[{"id": "Run/Run-e002.safetensors", "ar": 0.75, "nar": 0.75}]),
         take("z-C1", "RS-TEST-1x0.9-BF16", "C", 1, -12), take("imp", None, None, None, -6), take("broken", "RS-TEST-1x0.9-BF16", "A", 3, 0, audio=b"junk"),
         take("v-A1", "RS-TEST-1x0.9-BF16", "A", 1, -12, vae="rs-x3-v1"), take("s-A2", "BF16", "A", 2, -6, vae="standard")]
lib_only = take("b-C1-elsewhere", "BF16", "B", 7, -6)    # the base on card B with another seed, outside the workspace
coll = {"workspaces": {"🧪 T": names[:5], "🧪 T / a": names[5:], "🧪 Lib": ["x-A1", "x-A2"], "other": [lib_only]}}
(USER / "collection.json").write_text(json.dumps(coll, ensure_ascii=False), encoding="utf-8")
check("the workspace's takes with its sections, each once", g.ws_takes(USER, "🧪 T") == names, g.ws_takes(USER, "🧪 T"))
r = g.run_guard(OUT, CACHE, USER, "🧪 T")
G = {x["subject"]: x for x in r["groups"]}
check("the base: the stock YuE2 sung here", r["base"] == "BF16" and G["BF16"]["is_base"], r["base"])
X = G.get("RS-TEST-1x0.9-BF16", {})
check("X, 6 dB narrower on the same cards: about -6 dB in every band, too narrow",
      X.get("word") == "too narrow" and all(abs(X["delta"][b] + 6) < 0.8 for b in ("low", "mid", "high", "air")), X)
check("  its pairs: three by the same seed (A1, A2, B1), Z's card has no base, the broken take not among them", X.get("pairs_seed") == 3 and X.get("pairs") == 3, X)
check("  its panorama against the base's: B1 swings 6 dB where the base's swings 12, so the median of A1, A2, B1 is not above 0",
      X["delta"]["pan"] is not None and X["delta"]["pan"] <= 1, X["delta"])
check("  the broken take said as failed, never measured", any(f["name"] == "broken" for f in X.get("failed", [])), X.get("failed"))
Y = G.get("BF16 + Run-e002 ×0.75", {})
check("Y (an adapter) as wide as the base, one pair: a hint, not a measure", Y.get("word") == "as wide" and Y.get("few") is True and abs(Y["delta"]["mid"]) < 0.8, Y)
V = G.get("RS-TEST-1x0.9-BF16 · VAE rs-x3-v1", {})
check("another decoder is another subject, and said: decoded by another VAE than the base", V.get("vae_other") is True and V.get("pairs") == 1, V)
check("  «standard» and an empty field are one decoder (m-a-p's Standard): s-A2 is the base's own", "s-A2" not in json.dumps([x for x in r["groups"] if not x["is_base"]]) and G["BF16"]["takes"] == 4, G["BF16"])
I = G.get("?", {})
check("a take with no card (an import) stands alone, no pairs", I.get("word") == "no base on its cards" and I.get("pairs") == 0, I)
check("the table says how many it measured and of how many", r["asked"] >= len(names) and r["measured"] == r["asked"] - 1, (r["asked"], r["measured"]))
check("  a card with the base sung here takes no base from elsewhere: b-C1-elsewhere (card B) not even measured", r["asked"] == len(names), r["asked"])

# a workspace with no base: found in the library on the same cards
r2 = g.run_guard(OUT, CACHE, USER, "🧪 Lib")
X2 = next((x for x in r2["groups"] if x["subject"] == "RS-TEST-1x0.9-BF16"), {})
check("no base in the workspace: the stock YuE2 of the library on the same cards and seeds", r2["base"] == "BF16" and X2.get("pairs_seed") == 2 and X2.get("word") == "too narrow", r2)

# kept: the second guard measures nothing
real = g.measure
g.measure = lambda p: real(p) if "broken" in str(p) else (_ for _ in ()).throw(AssertionError("measured again: " + str(p)))   # a failure is asked again
try:
    r3 = g.run_guard(OUT, CACHE, USER, "🧪 T")
    check("the numbers are kept: a second guard measures only the take that failed, and says the same", json.dumps(r3["groups"], sort_keys=True) == json.dumps(r["groups"], sort_keys=True))
except AssertionError as e:
    check("the numbers are kept: a second guard measures only the take that failed, and says the same", False, e)
finally:
    g.measure = real

# the lines of user/stereo-guard.json
(USER / "stereo-guard.json").write_text(json.dumps({"lines": {"low": {"note": -10, "alarm": -20}, "mid": {"note": -10, "alarm": -20}, "high": {"note": -10, "alarm": -20},
                                                              "air": {"note": -10, "alarm": -20}, "pan": {"note": -90, "alarm": -95}}}), encoding="utf-8")
r4 = g.run_guard(OUT, CACHE, USER, "🧪 T")
X4 = next(x for x in r4["groups"] if x["subject"] == "RS-TEST-1x0.9-BF16")
check("user/stereo-guard.json moves the lines: the same 6 dB is as wide under -10/-20", X4["word"] == "as wide" and r4["lines"]["low"]["note"] == -10, X4)
(USER / "stereo-guard.json").unlink()

# the lab's own Handler
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
lab.OUTPUTS, lab.CACHE = OUT, CACHE
lab.config_dir = lambda: USER
slow = lab.stereo_guard.measure
lab.stereo_guard.measure = lambda p: (time.sleep(0.4), slow(p))[1]
for f in (CACHE / "stereo").glob("*.json"):
    f.unlink()
srv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()


def ask(path):
    req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, headers={"Host": f"127.0.0.1:{port}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


st, b = ask("/stereo/guard")
check("no workspace named: 400 with the lab's words", st == 400 and "workspace" in b.get("error", ""), (st, b))
q = "/stereo/guard?ws=" + urllib.parse.quote("🧪 T")
st, b = ask(q + "&peek=1")
check("a peek before any guard: 200, «none», nothing started", st == 200 and b.get("status") == "none" and not g.JOBS, (st, b, list(g.JOBS)))
st, b = ask(q)
check("a guard asked: 202 while it measures, its progress", st == 202 and b.get("status") == "running", (st, b))
time.sleep(0.3)
st, h = ask("/health")
check("  /health lists it while it measures (a restart would cut it)", any(k.startswith("stereo 🧪 T") for k in h.get("jobs", {})), h.get("jobs"))
for _ in range(120):
    st, b = ask(q)
    if st != 202:
        break
    time.sleep(0.5)
gr = {x["subject"]: x for x in ((b.get("result") or {}).get("groups") or [])}
check("  then 200 with the table: X too narrow, the base named", st == 200 and b["result"]["base"] == "BF16" and gr.get("RS-TEST-1x0.9-BF16", {}).get("word") == "too narrow", (st, b))
st, h = ask("/health")
check("  and /health no longer lists it", not any(k.startswith("stereo ") for k in h.get("jobs", {})), h.get("jobs"))
st, b = ask("/stereo/guard?ws=" + urllib.parse.quote("no such"))
for _ in range(40):
    if st != 202:
        break
    time.sleep(0.25)
    st, b = ask("/stereo/guard?ws=" + urllib.parse.quote("no such"))
check("a workspace that is not there: failed, said, never an empty table", st == 500 and "no workspace" in b.get("error", ""), (st, b))
srv.shutdown()
print("all passed" if not bad else f"{len(bad)} FAILED")
sys.exit(1 if bad else 0)
