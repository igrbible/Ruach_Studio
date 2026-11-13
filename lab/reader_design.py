"""HERESY 2455 (Viktor 12.11.2026: «Строитель голосов для Drama 3 у нас есть? Если нет, а знаю, что под капотом он есть, выноси в интерфейс
Чтеца»): the voice builder of the Narrator. A voice described in words (an engine whose style is a free-form bracket: Drama 3), a language, a
gender if one is wanted, two to four candidates, each its own seed: one run of the Narrator on the card chosen (a dialog whose speakers are the
candidates, each reading the same words in the engine's own voice, held from its first piece), no take in the Library. Each candidate measured as
the testimony's probe and the stock voices were (HERESY 2448, 2449): its pitch (pYIN's median, its 10th and 90th percentiles, the spread between
them in semitones), its brightness (the spectral centroid's median, as the voices' list measures it), its background (the room tone in its quiet
stretches above 300 Hz, in dB under the speech; under 58 dB it is heard as noise, the line drawn on his marks of 12.11) and its creak (the share of
its voiced frames under 70 Hz for a man, under 150 Hz for a woman). One kept by name becomes a made-up voice like any other: its clip and its
words in reader/voices, marked never for training (an engine's output), its engine's credit beside it.

    POST /reader/design {describe, lang, gender, n, seeds, text, engine, card, tier, temperature}   the run, 202
    GET  /reader/design?id=RUN                                                                       its candidates and their measures
    POST /reader/design-keep {id, cand, name}                                                        a candidate kept as a voice
    GET  /reader/design-text?lang=                                                                   the words a language's candidates read
"""
import json
import os
import random
import re
import time
from pathlib import Path

LETTERS = "abcd"
NAMES = {"a": "A", "b": "B", "c": "C", "d": "D"}          # the speakers of the run (a name never starts in lower case)
QUIET_DB = 58.0                                          # HERESY 2448: his noisy probes at 55 dB or less, his clean ones at 66.8 and more
CREAK = {"male": 70.0, "female": 150.0}                  # the creak floors the narrator lane measured by (de 26 % under 70, ja 30 % under 150)
NAME_BAD = re.compile(r'[/\\*~?:"<>|]')                 # the Library's and the file system's own marks never in a voice's name
DESCRIBE_MAX = 160
TEXT_MAX = 300
GENDER_SAID = {"male": "a man's voice", "female": "a woman's voice"}
SAMPLE = {                                               # the Studio's own words where no stock voice of the language is here
    "en": "The evening settles slowly over the harbour. I open the book and read to you aloud, word by word.",
}


def _r():
    import reader                                        # noqa: PLC0415  the lab's own module (it imports this one)
    return reader


def sample_text(lang):
    """The words a language's candidates read: its stock voice's (the Studio's own words), else a line of the Studio's own."""
    r = _r()
    try:
        man = json.loads((r.STOCK / "voices.json").read_text(encoding="utf-8"))
        for v in man.get("voices") or []:
            if v.get("lang") == lang and v.get("text"):
                return str(v["text"])
    except (OSError, ValueError):
        pass
    return SAMPLE.get(lang, SAMPLE["en"])


def steer(describe, gender):
    """The bracket the engine reads before each piece: the description, the gender asked said first unless the words already say one."""
    d = " ".join(str(describe or "").split()).strip("[] ")
    if not d:
        raise ValueError("describe the voice in a few words first")
    if len(d) > DESCRIBE_MAX:
        raise ValueError(f"the description: {DESCRIBE_MAX} characters at most")
    if gender in GENDER_SAID and not re.search(r"\b(man|men|male|woman|women|female|boy|girl|lady|gentleman)('s)?\b", d, re.I):
        d = (GENDER_SAID[gender] + ", " + d)[:DESCRIBE_MAX]
    return d


def start(body):
    """The candidates' run queued (the Narrator's own say(), its card, its tier, its turn); its id and how many pieces."""
    r = _r()
    eng = r._engine(str(body.get("engine") or ""))
    if not eng.get("style") or eng["style"]["kind"] != "bracket":
        raise ValueError(f"{eng['label']} takes no description of a voice: the builder needs an engine with a free-form bracket (Drama 3)")
    lang = str(body.get("lang") or "").lower()
    if eng["langs"] and lang not in eng["langs"]:
        raise ValueError(f"{eng['label']} does not read {lang or 'that language'}: " + ", ".join(eng["langs"]))
    gender = body.get("gender") if body.get("gender") in ("male", "female") else ""
    style = steer(body.get("describe"), gender)
    try:
        n = int(body.get("n") or 3)
    except (TypeError, ValueError):
        n = 3
    if not 2 <= n <= 4:
        raise ValueError("two to four candidates")
    raw = body.get("seeds")
    raw = re.split(r"[\s,;]+", raw.strip()) if isinstance(raw, str) else raw if isinstance(raw, list) else []
    seeds = []
    for s in raw:
        s = str(s).strip()
        if not s:
            continue
        if not re.fullmatch(r"\d{1,10}", s) or int(s) > 2 ** 31 - 100:
            raise ValueError(f"a seed is a whole number from 0 to {2 ** 31 - 100}: «{s[:20]}»")
        seeds.append(int(s))
    if len(seeds) > n:
        raise ValueError(f"{len(seeds)} seeds for {n} candidates")
    while len(seeds) < n:
        s = random.randint(1000, 999999999)
        if s not in seeds:
            seeds.append(s)
    text = " ".join(str(body.get("text") or "").split()) or sample_text(lang)
    if len(text) > TEXT_MAX:
        raise ValueError(f"the words: {TEXT_MAX} characters at most")
    if re.search(r"^\s*[^\s:]{1,40}\s*[:：]", text):
        raise ValueError("the words begin like a speaker's name (a word and a colon): write them without it")
    letters = LETTERS[:n]
    say = {"mode": "dialog", "engine": eng["id"], "lang": lang, "card": body.get("card", "auto"), "tags": False, "hear": False, "stress": True,
           "style": style, "voices": {}, "temperature": body.get("temperature") if body.get("temperature") not in (None, "") else 0.8,
           "seed": seeds[0], "title": f"voice builder · {lang} · {style[:60]}",
           "text": "\n".join(f"{NAMES[k]}: {text}" for k in letters)}
    if body.get("tier"):
        say["tier"] = body["tier"]
    design = {"describe": " ".join(str(body.get("describe") or "").split())[:DESCRIBE_MAX], "steer": style, "gender": gender, "lang": lang, "text": text,
              "seeds": {NAMES[k]: s for k, s in zip(letters, seeds)}, "n": n, "credit": (eng.get("license") or {}).get("credit") or ""}
    return r.say(say, design=design)


def seeds_of(ps, design):
    """Each piece's seed: its candidate's own, the pieces after its first one after it (a long text read in two pieces keeps its voice by the
    first one's sound, the anchor; the seed only draws its reading)."""
    seen = {}
    for p in ps:
        k = seen.get(p["speaker"], 0)
        p["seed"] = int(design["seeds"][p["speaker"]]) + k
        seen[p["speaker"]] = k + 1


def quiet_db(x, sr):
    """dB from the speech down to the room tone above 300 Hz in the quiet stretches (200 ms or more, 35 dB under the speech, 60 ms off each
    edge); None when the sound never falls 35 dB under its speech (a noisy voice by itself). HERESY 2448's measure, on one raw piece (a join's
    digital silence would read as a perfect room)."""
    import numpy as np
    from scipy.signal import butter, sosfilt
    n = int(sr * 0.02)
    if len(x) < n * 20:
        return None
    fr = x[: len(x) // n * n].reshape(-1, n)
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    speech = float(np.percentile(db, 90))
    q = db < speech - 35
    inner, i = [], 0
    while i < len(q):
        if q[i]:
            j = i
            while j < len(q) and q[j]:
                j += 1
            if j - i >= 10:
                inner += list(range(i + 3, j - 3))
            i = j
        else:
            i += 1
    if len(inner) < 3:
        return None
    hp = sosfilt(butter(4, 300, "highpass", fs=sr, output="sos"), x)[: len(x) // n * n].reshape(-1, n)
    hdb = 20 * np.log10(np.sqrt((hp[inner] ** 2).mean(axis=1)) + 1e-9)
    return round(speech - float(np.median(hdb)), 1)


def measures(y, sr, raw=None, rsr=None):
    """A candidate's pitch, spread, brightness, background and creak."""
    import librosa
    import numpy as np
    y22 = librosa.resample(y, orig_sr=sr, target_sr=22050) if sr != 22050 else y
    f0, voiced, _p = librosa.pyin(y22, fmin=50.0, fmax=600.0, sr=22050, frame_length=2048)
    f = f0[voiced & ~np.isnan(f0)] if f0 is not None else np.array([])
    y16 = librosa.resample(y, orig_sr=sr, target_sr=16000) if sr != 16000 else y
    bright = float(np.median(librosa.feature.spectral_centroid(y=y16, sr=16000)[0])) if len(y16) else 0.0
    out = {"seconds": round(len(y) / sr, 2), "bright": round(bright), "quiet_db": quiet_db(raw if raw is not None else y, rsr or sr)}
    out["noisy"] = out["quiet_db"] is None or out["quiet_db"] < QUIET_DB
    if len(f) < 10:
        return dict(out, f0=None, gender="", f0_p10=None, f0_p90=None, span_st=None, creak=None)
    med = float(np.median(f))
    gender = "male" if med < 160.0 else "female"
    p10, p90 = float(np.percentile(f, 10)), float(np.percentile(f, 90))
    return dict(out, f0=round(med, 1), gender=gender, f0_p10=round(p10, 1), f0_p90=round(p90, 1), span_st=round(12 * np.log2(p90 / p10), 1),
                creak=round(float(np.mean(f < CREAK[gender])), 3))


def land(d, run, eng):
    """The run's end, in place of a take: each candidate's pieces joined (trimmed, faded, its speech at -20 dBFS) into cand-X.wav and measured."""
    import numpy as np
    import soundfile as sf
    r = _r()
    cands, total = [], 0.0
    for k in LETTERS[: int(run["design"]["n"])]:
        spk = NAMES[k]
        ps = [p for p in run["pieces"] if p["speaker"] == spk]
        ys, sr, raw, rsr = [], eng["sample_rate"], None, None
        for p in ps:
            x, sr = sf.read(str(r._piece_path(d, p["i"], 0)), dtype="float32", always_2d=True)
            x = x.mean(1)
            if raw is None or len(x) > len(raw):
                raw, rsr = x, sr
            ys += [r._fade(r._trim(x, sr), sr), np.zeros(int(sr * 0.35), np.float32)]
        y = np.concatenate(ys[:-1]) if ys else np.zeros(0, np.float32)
        y = r._level(y, sr)
        sf.write(str(d / f"cand-{k}.wav"), y, sr, subtype="PCM_16")
        m = measures(y, sr, raw, rsr)
        cands.append(dict(m, cand=k, seed=int(run["design"]["seeds"][spk]), words=" ".join(p["plain"] for p in ps), file=f"cand-{k}.wav"))
        total += m["seconds"]
    run["design"]["candidates"] = cands
    return {"name": "", "seconds": round(total, 2)}


def detail(rid):
    """A builder's run: its state, its progress and its candidates with their measures."""
    r = _r()
    d, run = r._run_of(rid)
    if not isinstance(run.get("design"), dict):
        raise ValueError("not a run of the voice builder")
    with r.H["lock"]:
        job = dict(r.H["jobs"].get("reader:" + rid) or {})
    status = job.get("status") or run.get("status")
    if not job and status in ("queued", "running") and float(run.get("created") or 0) < r.LAB_START:
        status, run["error"] = "failed", r.STOPPED
    keep = ("describe", "steer", "gender", "lang", "text", "seeds", "n", "candidates", "kept", "credit")
    return {"id": rid, "status": status, "done": run.get("done"), "of": run.get("of"), "error": run.get("error"), "where": run.get("where"),
            "tier": (run.get("tier") or {}).get("quant"), "waiting": job.get("waiting"), "expect": job.get("expect"), "engine": run.get("engine"),
            "engine_label": run.get("engine_label"), **{k: run["design"].get(k) for k in keep}}


def name_ok(name):
    """A voice's name: one rule with every name of the Studio (name_rule, where this lab has it), spaces made one, 60 characters at most."""
    name = " ".join(str(name or "").split())
    if not name:
        raise ValueError("give the voice a name")
    try:
        import name_rule                                 # noqa: PLC0415  the Studio's one rule for every name
    except ImportError:
        name_rule = None
    if name_rule is not None:
        return name_rule.check(name, 60)
    if len(name) > 60:
        raise ValueError("a voice's name: 60 characters at most")
    bad = sorted(set(NAME_BAD.findall(name)))
    if bad:
        raise ValueError("a voice's name never holds " + " ".join(bad) + " (none of / \\ * ~ ? : \" < > |)")
    return name


def keep(body):
    """A candidate kept as a made-up voice: its clip, its words and its measures in reader/voices (never for training, its engine's credit)."""
    import shutil
    r = _r()
    d, run = r._run_of(str(body.get("id") or ""))
    des = run.get("design") if isinstance(run.get("design"), dict) else None
    if not des or run.get("status") != "done":
        raise ValueError("only a finished run of the voice builder gives a voice")
    k = str(body.get("cand") or "")
    c = next((x for x in des.get("candidates") or [] if x["cand"] == k), None)
    if not c or not (d / c["file"]).is_file():
        raise ValueError(f"no candidate {k or '?'} in this run")
    name = name_ok(body.get("name"))
    if any(v["name"].casefold() == name.casefold() for v in r._voice_rows()):
        raise ValueError(f"a voice named «{name}» is here already")
    vid = "made-" + time.strftime("%Y%m%d-%H%M%S-") + os.urandom(2).hex()
    home = r.voices_home()
    shutil.copy2(d / c["file"], home / (vid + ".wav"))
    v = {"name": name, "lang": des["lang"], "text": c["words"], "kind": "made", "made_by": run["engine"], "f0_by": "pyin",
         "f0": c.get("f0"), "gender": c.get("gender") or "", "bright": c.get("bright"), "seconds": c.get("seconds"), "no_train": True,
         "credit": des.get("credit") or "", "design": {"describe": des["describe"], "steer": des["steer"], "gender": des["gender"], "seed": c["seed"],
                                                       "run": run["id"], "cand": k, "measures": {x: c.get(x) for x in ("f0", "f0_p10", "f0_p90", "span_st", "bright", "quiet_db", "creak")}},
         "note": f"a take of {run['engine_label']} with no reference (the voice builder, run {run['id']}, candidate {k.upper()}, seed {c['seed']}); never a person"}
    if not v["f0"]:                                      # no pitch heard: the list measures it as it measures any voice
        v.pop("f0_by")
    r._write(home / (vid + ".json"), v)
    if not v.get("f0"):
        with r.MEASURE_LOCK:
            r._measure_one(home / (vid + ".json"))
    des.setdefault("kept", {})[k] = {"id": vid, "name": name}
    r._write(d / "run.json", run)
    r._say(f"a voice made by the voice builder kept: {name} ({vid}), candidate {k.upper()} of {run['id']}")
    return next((x for x in r._voice_rows() if x["id"] == vid), {"id": vid, "name": name})
