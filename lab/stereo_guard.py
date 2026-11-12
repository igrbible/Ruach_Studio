"""HERESY 2340 (Viktor 05.11.2026: «Нам нужно убедиться, что мы не убили стерео нашими тренировками… если так, Тренера придётся фиксить и
дописывать»; the plan's Trainer item «Сторож стерео: TW сужает бас, воздух и панораму тем сильнее, чем сильнее мёрдж»): the probes of a fine-tune,
an adapter or a merge measured beside the base model on the same cards, and what narrows the stereo past a line said in the Trainer.

The measure is the one of 05.11.2026 (heresy/MISC/claude-arc/stereo/stereo_measure.py, its report REPORT-2026-11-05.md), number for number:
  · a take's audio decoded by ffmpeg to 48 kHz stereo float, at most its first 240 s, in 50 ms frames (STFT 4096, hop 2400);
  · the side's energy against the mid's in four bands, dB (mid = (L+R)/2, side = (L-R)/2): bass 20-200 Hz, middle 0.2-2 kHz, high 2-8 kHz,
    air 8-20 kHz; below -35 dB over the whole band the take is mono;
  · the panorama: the spread between the 5th and the 95th percentile of the level difference L/R per frame in 200 Hz-8 kHz (the frames within
    40 dB of the loudest), dB.
05.11 it found TW narrowing the bass by 1.6-2.7 dB, the air by 1.0-1.4 dB and the panorama by 7-8 %, the more the stronger the merge, with
200 Hz-8 kHz kept to tenths of a dB; Viktor's ear: «не смертельно, а даже лучше».

The guard: the takes of a workspace (its sections too) grouped by what sang them (the backbone, and the adapters with their strengths); the base
found on the same cards (the same style and lyrics) in the workspace or anywhere in the library, the same seed first: a stock YuE2 (no adapters)
unless another is named; the workspace's own base on a card before any other (sung beside the probes, by the same engine). For each group the
median over its pairs of (its number - the base's), dB in the bands, % of the base's spread for the
panorama, and a word: «as wide» / «narrower» past the first line / «too narrow» past the second. The lines (LINES below) are Viktor's since
11.11.2026 (HERESY 2369); user/stereo-guard.json changes them ({"lines": {"low": {"note": -1.5, "alarm": -3.5}, ...}}).

A take's numbers are kept in the lab's cache (cache/stereo/NAME.json, by its audio file's name, size and time); a guard runs as a job of its own,
listed in /health, its takes measured three at a time.

    stereo_guard.py WORKSPACE [--base SUBJECT] [--json]      the same guard from the shell (the daily probes of a training)"""
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SR, NFFT, HOP, SECONDS = 48000, 4096, 2400, 240
BANDS = {"low": (20, 200), "mid": (200, 2000), "high": (2000, 8000), "air": (8000, 20000)}
AUDIO = ("audio.wav", "audio.flac", "audio.mp3", "listen.flac")
MEASURE_V = 1                                         # a change of the measure's numbers asks every kept one again
# the lines, dB of side/mid against the base on the same cards (the panorama: % of the base's spread); «note» says narrower, «alarm» too narrow.
# Set by the Ring of 02-03.11.2026 (240 takes, 40 pairs a side, the same seeds, measured 10.11): RS-FW 1.5 as wide; RS-FW 0.7 and 2.4 narrower in
# the air (-1.3, -1.2 dB); RS-TW 2.0 ×0.75 narrower (bass -2.4, air -1.2 dB, panorama -11 %); ×0.9 narrower (bass -1.3, air -3.2 dB). Viktor's ear
# took them all (05.11: «не смертельно, а даже лучше»), so the alarm stands past them; the middle and the high, where the voice and the guitars
# live, kept within tenths of a dB by every side, alarm at a whole dB. HERESY 2369 (Viktor 11.11.2026, «Пока что делай как советуешь там»): taken as they are, amber (note)
# -1.5 / -0.5 / -0.5 / -1 dB / -7 %, red (alarm) -3.5 / -1 / -1 / -4 dB / -15 %; RS-TW 2.0 ×0.9's air at -3.2 dB stands just short of the red, for
# his ear to judge. user/stereo-guard.json moves them
LINES = {"low": {"note": -1.5, "alarm": -3.5}, "mid": {"note": -0.5, "alarm": -1.0}, "high": {"note": -0.5, "alarm": -1.0},
         "air": {"note": -1.0, "alarm": -4.0}, "pan": {"note": -7.0, "alarm": -15.0}}
STOCK = re.compile(r"^(BF16|F16|F32|Q\d\w*)$", re.I)   # a stock YuE2 by its backbone's name (a quant of m-a-p's own weights)
JOBS = {}                                             # key -> {status, done, of, ws, base, started, result | error}; /health lists the running
_lock = threading.Lock()
_index = {"at": 0.0, "rows": None}


# ------------------------------------------------------------------ the measure (stereo_measure.py of 05.11.2026, unchanged)
def pcm(path, seconds=SECONDS):
    import numpy as np
    y = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-t", str(seconds), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                       capture_output=True, check=True, timeout=300).stdout
    return np.frombuffer(y, dtype=np.float32).reshape(-1, 2).T


def _stft(x):
    import numpy as np
    n = 1 + (x.shape[-1] - NFFT) // HOP
    idx = np.arange(NFFT)[None] + HOP * np.arange(n)[:, None]
    return np.fft.rfft(x[idx] * np.hanning(NFFT).astype(np.float32), axis=-1).astype(np.complex64)


def _db(a, b):
    import numpy as np
    return float(10 * np.log10((a + 1e-20) / (b + 1e-20)))


def measure(path):
    """the numbers of one audio file, or {"error": why} (a file that does not decode is said, never skipped silently)"""
    import numpy as np
    try:
        w = pcm(path)
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        return {"error": str(e)[:200] or "ffmpeg failed"}
    if w.shape[1] < NFFT * 8:
        return {"error": "shorter than 0.7 s"}
    L, R = _stft(w[0]), _stft(w[1])
    f = np.fft.rfftfreq(NFFT, 1 / SR)
    M, S = (L + R) / 2, (L - R) / 2
    pm, ps = np.abs(M) ** 2, np.abs(S) ** 2
    pl, pr = np.abs(L) ** 2, np.abs(R) ** 2
    out = {"seconds": round(w.shape[1] / SR, 1), "sm_all": round(_db(ps.sum(), pm.sum()), 2)}
    for name, (lo, hi) in BANDS.items():
        b = (f >= lo) & (f < hi)
        out[f"sm_{name}"] = round(_db(ps[:, b].sum(), pm[:, b].sum()), 2)
        out[f"corr_{name}"] = round(float((L[:, b] * np.conj(R[:, b])).real.sum() / np.sqrt(pl[:, b].sum() * pr[:, b].sum() + 1e-30)), 4)
    b = (f >= 200) & (f < 8000)
    el, er = pl[:, b].sum(1), pr[:, b].sum(1)
    keep = (el + er) > (el + er).max() * 1e-4
    ild = 10 * np.log10((el[keep] + 1e-20) / (er[keep] + 1e-20))
    out["ild_p5"], out["ild_p95"] = round(float(np.percentile(ild, 5)), 2), round(float(np.percentile(ild, 95)), 2)
    out["ild_spread"] = round(out["ild_p95"] - out["ild_p5"], 2)
    out["panned_3db"] = round(float((np.abs(ild) > 3).mean()), 4)
    out["mono"] = out["sm_all"] < -35
    return out


# ------------------------------------------------------------------ a take: its audio, what sang it, its card
def audio_of(d):
    return next((d / f for f in AUDIO if (d / f).is_file()), None)


def take_numbers(outputs, cache, name):
    """a take's numbers, measured once and kept by its audio file's name, size and time"""
    d = Path(outputs) / name
    if "/" in name or name.startswith(".") or not d.is_dir():
        return {"error": "no take " + name}
    a = audio_of(d)
    if not a:
        return {"error": "no audio in the take"}
    st = a.stat()
    sig = {"file": a.name, "size": st.st_size, "mtime": st.st_mtime_ns, "v": MEASURE_V}
    kept = Path(cache) / "stereo" / (name + ".json")
    try:
        k = json.loads(kept.read_text(encoding="utf-8"))
        if k.get("sig") == sig:
            return k["m"]
    except (OSError, ValueError, KeyError):
        pass
    m = measure(a)
    if "error" not in m:                               # a failure is said each time, never kept as a measure
        kept.parent.mkdir(parents=True, exist_ok=True)
        tmp = kept.with_name(kept.name + ".%d.%d.part" % (os.getpid(), threading.get_ident()))   # two guards on one take never share a part
        tmp.write_text(json.dumps({"sig": sig, "m": m}), encoding="utf-8")
        os.replace(tmp, kept)
    return m


def _read(d, f):
    try:
        return json.loads((d / f).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _strength(x):
    return ("%g" % x) if isinstance(x, (int, float)) else str(x)


def vae_of(req):
    """the decoder a take was made with: "" for m-a-p's Standard (an empty field before 2306 meant it), else its name (rs-x3-v1…)"""
    v = str(req.get("vae") or "").strip().lower()
    return "" if v in ("", "standard", "none") else v


def subject(req, meta):
    """what sang a take: its backbone and its adapters with their strengths (AR / NAR), as one label, and its decoder when not Standard (the
    decoder has a stereo of its own: two decoders are two subjects)"""
    bb = str(req.get("backbone") or meta.get("model") or "?")
    ad = []
    for l in req.get("loras") or []:
        if isinstance(l, dict) and l.get("id"):
            nm = str(l["id"]).rsplit("/", 1)[-1].replace(".safetensors", "")
            ad.append(nm + " ×" + _strength(l.get("ar", l.get("weight", 1))) + ("/" + _strength(l["nar"]) if l.get("nar") is not None and l.get("nar") != l.get("ar") else ""))
    v = vae_of(req)
    return bb + (" + " + ", ".join(sorted(ad)) if ad else "") + (" · VAE " + v if v else "")


def stock(req, meta):
    return bool(STOCK.match(str(req.get("backbone") or meta.get("model") or ""))) and not (req.get("loras") or [])


def card(req):
    """the card a take was sung from: its style and lyrics (the Ring's twenty, a probe set's), None for a take with neither"""
    s, l = str(req.get("style") or "").strip(), str(req.get("lyrics") or "").strip()
    return hashlib.sha1((s + "\n␞\n" + l).encode("utf-8")).hexdigest()[:16] if (s or l) else None


def info(outputs, name):
    d = Path(outputs) / name
    req, meta = _read(d, "request.json"), _read(d, "meta.json")
    return {"name": name, "subject": subject(req, meta), "stock": stock(req, meta), "card": card(req), "seed": req.get("seed"),
            "vae": vae_of(req), "title": meta.get("title") or name}


def library(outputs, fresh=False):
    """every take of the library by its card (for a base sung elsewhere), kept a minute"""
    with _lock:
        if not fresh and _index["rows"] is not None and time.time() - _index["at"] < 60:
            return _index["rows"]
    rows = {}
    for d in sorted(Path(outputs).iterdir()) if Path(outputs).is_dir() else []:
        if (d / "request.json").is_file():
            t = info(outputs, d.name)
            if t["card"]:
                rows.setdefault(t["card"], []).append(t)
    with _lock:
        _index.update(at=time.time(), rows=rows)
    return rows


def ws_takes(user_dir, ws):
    """the takes of a workspace and its sections, in their order, each once"""
    try:
        c = json.loads((Path(user_dir) / "collection.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise RuntimeError("the workspaces could not be read: " + str(e)) from e
    W = c.get("workspaces") or {}
    if ws not in W:
        raise FileNotFoundError("no workspace " + ws)
    out = []
    for w in sorted(W):
        if w == ws or w.startswith(ws + " / "):
            out += [t for t in W[w] if t not in out]
    return out


def lines(user_dir):
    out = json.loads(json.dumps(LINES))
    try:
        mine = json.loads((Path(user_dir) / "stereo-guard.json").read_text(encoding="utf-8")).get("lines") or {}
        for k, v in mine.items():
            if k in out and isinstance(v, dict):
                out[k].update({x: float(v[x]) for x in ("note", "alarm") if isinstance(v.get(x), (int, float))})
    except (OSError, ValueError, AttributeError):
        pass
    return out


# ------------------------------------------------------------------ the guard: each group against the base on the same cards
def _median(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def compare(takes, base_rows, nums, base=None, line=None):
    """takes: the workspace's takes (info()); base_rows: card -> the library's takes on that card; nums: name -> numbers.
    The table: the base named, and each other group's medians against it"""
    line = line or LINES
    groups = {}
    for t in takes:
        groups.setdefault(t["subject"], []).append(t)
    if not base:                                       # the stock YuE2 sung most here, else the one sung most on these cards anywhere
        cands = {}
        for t in takes:
            if t["stock"]:
                cands[t["subject"]] = cands.get(t["subject"], 0) + 1
        if not cands:
            cards = {t["card"] for t in takes if t["card"]}
            for c in cards:
                for b in base_rows.get(c, []):
                    if b["stock"]:
                        cands[b["subject"]] = cands.get(b["subject"], 0) + 1
        base = max(sorted(cands), key=lambda k: cands[k]) if cands else None
    out = {"base": base, "lines": line, "groups": []}
    if not base:
        out["said"] = "no base on these cards: sing the same cards with the base model (a stock YuE2), or name the base"
    # the base's takes on each card: the workspace's own when it has them (sung beside the probes, by the same engine), else the library's
    by_card = {}
    for t in takes:
        if t["subject"] == base and t["card"]:
            by_card.setdefault(t["card"], {})[t["name"]] = t
    for c in {t["card"] for t in takes if t["card"]} - set(by_card):
        for b in base_rows.get(c, []):
            if b["subject"] == base:
                by_card.setdefault(c, {})[b["name"]] = b
    keys = ["sm_low", "sm_mid", "sm_high", "sm_air", "ild_spread"]
    for subj in sorted(groups):
        mine = groups[subj]
        ok = [t for t in mine if "error" not in nums.get(t["name"], {"error": 1})]
        g = {"subject": subj, "takes": len(mine), "measured": len(ok), "failed": [{"name": t["name"], "error": nums.get(t["name"], {}).get("error", "not measured")}
                                                                                 for t in mine if t not in ok][:5],
             "is_base": subj == base, "abs": {k: _median([nums[t["name"]].get(k) for t in ok]) for k in keys}}
        if subj != base and base:
            d = {k: [] for k in keys}
            seeded = carded = 0
            for t in ok:
                pool = [b for b in by_card.get(t["card"], {}).values() if "error" not in nums.get(b["name"], {"error": 1})]
                same = [b for b in pool if b["seed"] is not None and b["seed"] == t["seed"]]
                use = same or pool
                if not use:
                    continue
                seeded += bool(same)
                carded += not same
                for k in keys:
                    bv = _median([nums[b["name"]].get(k) for b in use])
                    tv = nums[t["name"]].get(k)
                    if bv is None or tv is None:
                        continue
                    if k == "ild_spread":
                        if bv > 0:
                            d[k].append(100.0 * (tv / bv - 1))
                    else:
                        d[k].append(tv - bv)
            g["pairs"], g["pairs_seed"], g["pairs_card"] = seeded + carded, seeded, carded
            bv = {b["vae"] for c in by_card.values() for b in c.values()}
            if mine and bv and mine[0]["vae"] not in bv:
                g["vae_other"] = True                   # the decoder's own stereo is in these numbers, said beside them
            delta = {"low": _median(d["sm_low"]), "mid": _median(d["sm_mid"]), "high": _median(d["sm_high"]), "air": _median(d["sm_air"]),
                     "pan": _median(d["ild_spread"])}
            g["delta"] = {k: (round(v, 2) if v is not None else None) for k, v in delta.items()}
            past = {k: ("alarm" if v <= line[k]["alarm"] else "note") for k, v in delta.items() if v is not None and v <= line[k]["note"]}
            g["past"] = past
            g["word"] = "too narrow" if "alarm" in past.values() else "narrower" if past else "as wide" if g["pairs"] else "no base on its cards"
            if g["pairs"] and g["pairs"] < 3:
                g["few"] = True                         # a hint, not a measure
        out["groups"].append(g)
    return out


def run_guard(outputs, cache, user_dir, ws, base=None, job=None, workers=3):
    names = ws_takes(user_dir, ws)
    takes = [info(outputs, n) for n in names if (Path(outputs) / n).is_dir()]
    rows = library(outputs)
    want = {t["name"] for t in takes}
    base_name = base
    if not base_name:                                  # the base is chosen before measuring, so only its takes on these cards are measured
        base_name = compare(takes, rows, {}, None)["base"]
    own = {t["card"] for t in takes if t["card"] and t["subject"] == base_name}   # a card with the base sung here takes no other base
    for c in {t["card"] for t in takes if t["card"]} - own:
        want |= {b["name"] for b in rows.get(c, []) if b["subject"] == base_name}
    want = sorted(want)
    if job is not None:
        job.update(of=len(want), done=0, base=base_name)
    nums = {}

    def one(n):
        m = take_numbers(outputs, cache, n)
        if job is not None:
            with _lock:
                job["done"] += 1
        return n, m
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for n, m in ex.map(one, want):
            nums[n] = m
    out = compare(takes, rows, nums, base_name, lines(user_dir))
    out.update(ws=ws, takes=len(takes), measured=sum(1 for n in want if "error" not in nums[n]), asked=len(want))
    return out


def guard(kit, outputs, cache, user_dir, q):
    """GET /stereo/guard?ws=&base=&again=1&peek=1 -> (status, body): 202 with the job's progress while it measures, 200 with the table when done;
    peek: what there is, {"status": "none"} when nothing was asked, never a start"""
    ws = str(q.get("ws") or "")
    if not ws:
        return 400, {"error": "name a workspace: ?ws="}
    base = str(q.get("base") or "")
    key = ws + " | " + (base or "auto")
    with _lock:
        j = JOBS.get(key)
        if q.get("peek") and not j:                    # the page opening: what is there, nothing started
            return 200, {"status": "none", "ws": ws, "base": base or None}
        if j and j["status"] == "running":
            return 202, {k: j.get(k) for k in ("status", "done", "of", "ws", "base", "started")}
        if j and j["status"] in ("done", "failed") and not q.get("again"):
            return (200 if j["status"] == "done" else 500), dict(j)
        j = JOBS[key] = {"status": "running", "done": 0, "of": 0, "ws": ws, "base": base or None, "started": time.time()}

    def work():
        try:
            r = run_guard(outputs, cache, user_dir, ws, base or None, j)
            j.update(status="done", result=r, ended=time.time())
        except FileNotFoundError as e:
            j.update(status="failed", error=str(e), ended=time.time())
        except Exception as e:                         # said on the page, never an empty table
            j.update(status="failed", error=f"{type(e).__name__}: {e}"[:300], ended=time.time())
    threading.Thread(target=work, daemon=True, name="stereo-guard").start()
    return 202, {k: j.get(k) for k in ("status", "done", "of", "ws", "base", "started")}


# ------------------------------------------------------------------ the shell
def _table(r):
    rows = ["%-46s %5s %6s %7s %7s %7s %7s %7s  %s" % ("what sang it", "takes", "pairs", "bass", "middle", "high", "air", "pan %", "word")]
    for g in r["groups"]:
        dl = g.get("delta") or {}
        f = lambda k: "%+7.2f" % dl[k] if dl.get(k) is not None else "      -"
        rows.append("%-46s %5d %6s %s %s %s %s %s  %s" % (g["subject"][:46], g["takes"], "base" if g["is_base"] else str(g.get("pairs", 0)),
                                                        f("low"), f("mid"), f("high"), f("air"), f("pan"),
                                                        "" if g["is_base"] else g.get("word", "") + (" (few pairs)" if g.get("few") else "")))
    return "\n".join(rows)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        print(__doc__.strip().splitlines()[-1].strip())
        sys.exit(2)
    here = Path(__file__).resolve().parent
    kit = here.parent
    b = a[a.index("--base") + 1] if "--base" in a else None
    res = run_guard(kit / "outputs", here / "cache", kit / "user", a[0], b)
    print(json.dumps(res, ensure_ascii=False, indent=1) if "--json" in a else
          f"{res['ws']}: {res['takes']} takes, {res['measured']} of {res['asked']} measured; the base: {res['base']}\n" + _table(res) +
          ("\n" + res["said"] if res.get("said") else ""))
    sys.exit(1 if any(g.get("word") == "too narrow" for g in res["groups"]) else 0)
