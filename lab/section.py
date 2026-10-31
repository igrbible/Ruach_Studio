"""HERESY 1414 (Viktor 13.10.2026, on the night's probes: «Подверждаю: склейки не слышно. Всё идёт единым органичным потоком. Межтактная
склейка - это правильный ход»; «Внедряй в полноформатный плеер и будем оба тестить»; his plan of 12.10: «разрешить замену микро частей лирики,
но с честным предупреждением… со случайным сидом, две версии»): Replace a section.

A take's own music codes are kept up to a rest before the section (semantic_keep, HERESY 1037); the model sings on from there with the lyrics
changed in that section and a new music seed, its budget a little past the section's end (a draft, the engine's own take, put in the trash
after); its codes up to a rest after the section, then the take's own codes from there to its end, are rendered once more as one stream (a
replay: the sound stage on the joined codes, with the take's own sound seed, so what is not replaced sounds as it did). The cuts sit in rests
the page finds by ear (the lyrics' timing), at the same second in both: the new part was written from the same kept start at the same tempo,
so the bars go on. Each version a take of its own, a child of the take (parent), in the take's workspaces, with replaced.json beside it for
the player's mark.

    start(name, a, b, lyrics, versions, section, parts)   the job, in a thread of its own; the engine's runs show in the Creator's list
    live()                                          the jobs not ended, for the page
    job(id)                                         one job as it stands, ended ones too (kept ten minutes), for the page to follow
    mark(name)                                      replaced.json of a take made so, or None
    window(name, a, b, lyrics, versions, pre, post, loras)   HERESY 1757: a window sung anew with adapters of its own
"""
import json, random, threading, time, urllib.error, urllib.parse

FPS = 25                    # music codes a second
TAIL = 4.0                  # the draft's budget past the cut, in seconds
P = {}                      # setup: kit, outputs, engine, say, config_dir, frozen, trash, collection
LIVE = {}
LOCK = threading.Lock()


def setup(**kw):
    P.update(kw)


def mark(name):
    try:
        return json.load(open(P["outputs"] / str(name) / "replaced.json", encoding="utf-8"))
    except (OSError, ValueError):
        return None


def live():
    with LOCK:
        return [dict(v, id=k) for k, v in LIVE.items() if v.get("status") in ("queued", "running")]


def job(jid):
    with LOCK:
        st = LIVE.get(str(jid))
        return dict(st, id=str(jid)) if st else None


def span(a, b):
    """1:02–1:25: the stretch sung anew, as a title says it"""
    c = lambda t: f"{int(t) // 60}:{int(t) % 60:02d}"
    return c(a) + "\u2013" + c(b)


def label(parts):
    """HERESY 1425 (Viktor 13.10.2026: «добавляй не просто anew, и название секции, но и временной отрезок… позаботься о том, чтобы был
    оверрайд»): the sections and their stretches, as the versions' titles carry them (past the 80 characters a title typed may have)"""
    return " + ".join(f"{p['section']} {span(p['a'], p['b'])}" for p in parts)


def _wait(jid, state):
    """The engine's job to its end: its first take's name, or an error. An engine gone (its job unknown 20 times, or no answer for two
    minutes: it crashed or was restarted) is said as such, not waited for (a job left «running» for ever would lie)."""
    lost, gone = 0, 0
    while True:
        time.sleep(2)
        try:
            st = P["engine"]("/job?id=" + urllib.parse.quote(str(jid)))
            lost = gone = 0
        except urllib.error.HTTPError as e:
            lost += 1 if e.code == 404 else 0
            if lost > 20:
                raise RuntimeError("the engine lost its job")
            continue
        except OSError:
            gone += 1
            if gone > 60:
                raise RuntimeError("the engine went away (no answer for two minutes)")
            continue
        s = st.get("status")
        state["engine"] = s
        if s == "done":
            names = [x for x in (st.get("takes") or []) if isinstance(x, str)]
            if not names:
                raise RuntimeError("the engine made no take")
            return names[0]
        if s in ("failed", "cancelled"):
            raise RuntimeError(s + (": " + str(st.get("error")) if st.get("error") else ""))


def _codes(name):
    req = json.load(open(P["outputs"] / name / "request.json", encoding="utf-8"))
    req.pop("nar_ladder", None)                        # HERESY 1768: the ladder is the Creator's choice; a redo decodes the standard way
    return req, [int(x) for x in str(req.get("semantic_tokens") or "").split(",") if x.strip()]


def start(name, a, b, lyrics, versions=2, section="", parts=None):
    """HERESY 1425 (Viktor 13.10.2026: «Может можно добить так, чтобы множественные секции редактировать одним махом?»): parts, the sections
    [{a, b, section}] of one go; without them the one section a–b"""
    name, lyrics, versions = str(name), str(lyrics or ""), int(versions or 2)
    raw = parts if isinstance(parts, list) and parts else [{"a": a, "b": b, "section": section}]
    if len(raw) > 8:
        raise ValueError("eight sections at most in one go")
    parts = sorted(({"a": round(float(x.get("a")), 2), "b": round(float(x.get("b")), 2), "section": str(x.get("section") or "the section")[:60]}
                    for x in raw), key=lambda x: x["a"])
    if name in (P["frozen"]() or set()):
        raise ValueError("frozen with its workspace: unfreeze it first")
    try:
        req, codes = _codes(name)
    except (OSError, ValueError):
        raise ValueError("no request kept: an imported take cannot have a section replaced")
    if not codes:
        raise ValueError("this take kept no music codes")
    if not lyrics.strip():
        raise ValueError("the lyrics are empty")
    if versions not in (1, 2):
        raise ValueError("one version or two")
    end = len(codes) / FPS
    for i, x in enumerate(parts):
        if not (0 < x["a"] < x["b"] <= end + 0.01) or x["b"] - x["a"] < 2:
            raise ValueError(f"{x['section']}: a section must lie inside the take (0–{end:.1f} s), two seconds at least")
        if i and x["a"] < parts[i - 1]["b"]:
            raise ValueError(f"{parts[i - 1]['section']} and {x['section']} overlap")
    jid = time.strftime("%Y%m%d-%H%M%S") + "-" + str(random.randrange(1000, 9999))
    section = label(parts)
    state = {"name": name, "section": section, "a": parts[0]["a"], "b": parts[-1]["b"], "parts": parts, "status": "queued", "since": time.time(),
             "versions": [{"v": "AB"[i], "status": "queued"} for i in range(versions)]}
    with LOCK:
        LIVE[jid] = state
    threading.Thread(target=_run, args=(jid, name, req, codes, parts, lyrics, state), daemon=True).start()
    P["say"](f"replace a section · {name} · {section} · {versions} version{'s' if versions > 1 else ''} queued")
    return {"id": jid, "name": name, "versions": versions, "parts": len(parts)}


def _run(jid, name, req, codes, parts, lyrics, state):
    """Each section in turn on the codes so far: its draft sings on from the codes before it (the sections before it already new), its
    stretch is laid in, the codes after it stay; the length never changes, so the later cuts stay where the page heard them"""
    title, section = str(req.get("title") or name), label(parts)
    state["status"] = "running"
    made = []
    for ver in state["versions"]:
        v, seed = ver["v"], random.randint(1000, 999999999)
        ver.update(status="running", lm_seed=seed)
        drafts = []
        try:
            joined = list(codes)
            for i, x in enumerate(parts):
                ka, kb = round(x["a"] * FPS), min(round(x["b"] * FPS), len(codes))
                ver.update(part=i + 1, parts=len(parts))
                gen = {k: y for k, y in req.items() if k not in ("semantic_tokens", "semantic_keep", "parent", "end_at", "fade_in", "fade_out")}
                gen.update(lyrics=lyrics, semantic_keep=",".join(map(str, joined[:ka])), duration=round(x["b"] + TAIL, 1),
                           lm_seed=seed + i, title=title + " · " + x["section"] + " · draft " + v, plan_only=False)
                drafts.append(_wait(P["engine"]("/synth", gen).get("id"), ver))
                _, new = _codes(drafts[-1])
                if new[:ka] != joined[:ka]:
                    raise RuntimeError("the kept start came back changed")
                if len(new) < kb:
                    raise RuntimeError(f"{x['section']}: the model ended the song at {len(new) / FPS:.1f} s, before the cut at {x['b']:.1f} s")
                joined = new[:kb] + joined[kb:]
            rep = {k: y for k, y in req.items() if k not in ("semantic_keep",)}
            rep.update(lyrics=lyrics, semantic_tokens=",".join(map(str, joined)), duration=round(len(joined) / FPS + 2, 1), parent=name,
                       title=title + " · " + section + " anew " + v)
            take = _wait(P["engine"]("/synth", rep).get("id"), ver)
            json.dump({"from": name, "a": parts[0]["a"], "b": parts[0]["b"], "section": parts[0]["section"], "parts": parts, "version": v,
                       "lm_seed": seed, "at": time.strftime("%Y-%m-%d %H:%M")},
                      open(P["outputs"] / take / "replaced.json", "w", encoding="utf-8"), ensure_ascii=False)
            _place(name, take, section, v, seed)
            ver.update(status="done", take=take)
            made.append(take)
        except Exception as e:                         # a version that fails says why; the next one still tries
            ver.update(status="failed", error=str(e))
            P["say"](f"replace a section · {name} · version {v}: {e}")
            if "cancelled" in str(e):
                for rest in state["versions"]:
                    if rest["status"] == "queued":
                        rest.update(status="cancelled")
                break
        finally:
            if drafts:
                try:
                    P["trash"](drafts)
                except Exception:
                    pass
    state["status"] = "done" if made else "failed"
    state["takes"] = made
    P["say"](f"replace a section · {name} · {section}: " + (", ".join(made) if made else "nothing made"))
    with LOCK:                                         # kept a while for the page, then forgotten
        LIVE[jid] = state
    threading.Timer(600, lambda: LIVE.pop(jid, None)).start()


WS = "Replace a section"


def _place(name, take, section, v, seed, what=None):   # HERESY 1715: what, the note's own words
    """The new take where the old one is, in its workspaces that are open to it: never a 💎 one (a set kept for publishing), a locked or
    a frozen one (a lock keeps a workspace from deletion, not from an add: so said here); none left, in «Replace a section»; a note says what it is."""
    col, cfg = P["collection"], P["config_dir"]()
    d = col.load(cfg)
    open_ws = [w for w, ns in d["workspaces"].items() if name in ns and not w.startswith("\U0001f48e")
               and not (d.get("locks") or {}).get(w) and not col.frozen_ws(d, w)]
    for w in open_ws or [WS]:
        try:
            col.collection_post(cfg, P["outputs"], {"op": "ws-add", "workspace": w, "names": [take]})
        except Exception as e:                        # HERESY 1430: said, so a take missing from its workspace is not a mystery
            P["say"](f"replace a section · {take} not added to «{w}»: {e}")
    try:
        col.collection_post(cfg, P["outputs"], {"op": "note", "names": [take], "text":
            what or f"Replace a section: {section} sung anew, version {v}, music seed {seed}; the rest is {name}'s own"})
    except Exception:
        pass


# ---------------------------------------------------------------- HERESY 1715: a section sung once more right after itself
# ---------------------------------------------------------------- HERESY 1717: music before the repeat, an interlude after a section
# (Viktor 22.10.2026 on the probes: «Оно заработает, если будет музыкальный переход хоть 5-7 секунд»; «нужен микро проигрыш, который настроит
# лад для повторения»). The cuts by the draft's own voice (vocal_rest.py, split off on the processor) and on its bar lines: 1715's loudness of
# the whole mix found no rest in a dense one (Flood: none within 2 s, the length asked cut a line), and the model plays longer than asked
# (Flood: 10.5 s before the lines for 4 asked, 14 s and on for 7), so whole bars of its music come out of the middle instead.


def _bar(abc):
    """HERESY 1717: a bar's seconds from a score's head (M: and Q:), or None"""
    import re
    m = re.search(r"^M:\s*(C\|?|\d+\s*/\s*\d+)", str(abc or ""), re.M)
    q = re.search(r"^Q:\s*(?:(\d+)\s*/\s*(\d+)\s*=\s*)?(\d+(?:\.\d+)?)", str(abc or ""), re.M)
    if not m or not q or not float(q.group(3)):
        return None
    n, d = (4, 4) if m.group(1).startswith("C") else map(int, m.group(1).replace(" ", "").split("/"))
    meter = n / d                                      # C and C| are a whole note a bar each (4/4, 2/2)
    beat = int(q.group(1)) / int(q.group(2)) if q.group(1) else 0.25
    sec = meter / beat * 60 / float(q.group(3))
    return sec if 0.3 <= sec <= 8 else None


def _voice(wav, a, b):
    """HERESY 1717: where the voice sings in a–b of a take: vocal_rest.py beside this file, in a process of its own (torch never in the lab's)
    on the processor, in the studio's environment (setup's py, as stems_job's): [[start, end], …], or the reason it could not say"""
    import os, subprocess, sys as _sys
    try:
        p = subprocess.run([str(P.get("py") or _sys.executable), os.path.join(os.path.dirname(os.path.abspath(__file__)), "vocal_rest.py"), str(wav),
                            f"{a:.2f}", f"{b:.2f}"], capture_output=True, text=True, timeout=600, env=dict(os.environ, CUDA_VISIBLE_DEVICES=""))
        j = json.loads((p.stdout.strip().splitlines() or ["{}"])[-1])
    except Exception as e:
        return f"the voice could not be split ({type(e).__name__})"
    return j["voice"] if isinstance(j.get("voice"), list) else "the voice could not be split (" + str(j.get("error") or "no answer")[:120] + ")"


def repeat(name, a, b, lyrics, versions=2, section="", abc=None, gap=0.0, kind="repeat", bar=None):
    """HERESY 1715: the section a–b (cut at its rests, as Replace a section's) sung once more right after itself; lyrics have its lines twice,
    abc (the page's, the section's bars twice) the new take's score or None. HERESY 1717: gap, music before the repeat (about so many seconds; the
    lyrics an [Interlude] block between); kind «interlude», music after the section and nothing sung again (the lyrics an [Interlude] block after
    it); bar, a bar's seconds by the page's score when the take has none of its own"""
    name, lyrics, versions, section = str(name), str(lyrics or ""), int(versions or 2), str(section or "the section")[:60]
    a, b = round(float(a), 2), round(float(b), 2)
    gap, kind = round(float(gap or 0), 2), str(kind or "repeat")
    if kind not in ("repeat", "interlude"):
        raise ValueError("kind: repeat or interlude")
    if not 0 <= gap <= 20 or (kind == "interlude" and gap < 2):
        raise ValueError("a breath of 0 to 20 seconds; an interlude of 2 to 20")
    if name in (P["frozen"]() or set()):
        raise ValueError("frozen with its workspace: unfreeze it first")
    try:
        req, codes = _codes(name)
    except (OSError, ValueError):
        raise ValueError("no request kept: an imported take cannot have a section sung again")
    if not codes:
        raise ValueError("this take kept no music codes")
    if not lyrics.strip():
        raise ValueError("the lyrics are empty")
    if versions not in (1, 2):
        raise ValueError("one version or two")
    if abc is not None and (not isinstance(abc, str) or len(abc) > 2 ** 20):
        raise ValueError("the score: ABC text, a megabyte at most")
    end = len(codes) / FPS
    if not (0 <= a < b <= end + 0.01) or b - a < 2:
        raise ValueError(f"{section}: a section must lie inside the take (0–{end:.1f} s), two seconds at least")
    try:
        bar = float(bar) if bar and 0.3 <= float(bar) <= 8 else None
    except (TypeError, ValueError):
        bar = None
    bar = _bar(req.get("abc")) or bar                  # the take's own score first: its tempo is the one the model sang to
    jid = time.strftime("%Y%m%d-%H%M%S") + "-" + str(random.randrange(1000, 9999))
    said = ("an interlude after " + section) if kind == "interlude" else (section + " once more" + (", after a breath" if gap else ""))
    state = {"name": name, "section": said, "a": b, "b": round(b + gap + (b - a if kind == "repeat" else 0), 2), "parts": [{"a": a, "b": b, "section": section}],
             "kind": kind, "gap": gap, "status": "queued", "since": time.time(), "versions": [{"v": "AB"[i], "status": "queued"} for i in range(versions)]}
    with LOCK:
        LIVE[jid] = state
    threading.Thread(target=_repeat_run, args=(jid, name, req, codes, a, b, section, lyrics, abc, state, gap, kind, bar), daemon=True).start()
    P["say"](f"sing once more · {name} · {said} {span(a, b)} · {versions} version{'s' if versions > 1 else ''} queued" +
             (f" · bars of {bar:.2f} s" if bar else " · no score to give its bars: the cuts by the voice alone"))
    return {"id": jid, "name": name, "versions": versions, "parts": 1}


def _cut(voice, ka, kb, new_end, gap, kind, bar, L0):
    """HERESY 1717 (Viktor 22.10.2026: «Оно заработает, если будет музыкальный переход хоть 5-7 секунд»): what of the draft goes in after kb, as
    [(from, to), …] in its codes, and the words for the log; or raises with the reason. Every length a whole number of bars when the bar is
    known, so the take's own music after the insert goes on in its beat. The draft's voice (seconds) says where the model played and sang.
      interlude: the model's music after the section, whole bars near gap, before its voice comes back
      repeat:    the model's music before its lines (whole bars cut out of its middle down to about gap, its first bar and its lead-in kept),
                 its lines, then a rest of the voice after them, the cut on a bar line in it"""
    s_a, s_b, end = ka / FPS, kb / FPS, new_end / FPS
    on = [v for v in voice if v[0] > s_b - 0.05]       # the model's voice after the section (its own lines end before b, in a rest)
    t_on = on[0][0] if on else None
    if kind == "interlude":
        free = (t_on - 0.2 if t_on else end) - s_b
        if bar:
            k = max(1, round(gap / bar))
            while k > 1 and k * bar > free:
                k -= 1
            if k * bar > free:
                raise RuntimeError(f"the model sang on {free:.1f} s after the section: no room for a bar of music")
            L = round(k * bar * FPS)
            return [(kb, kb + L)], f"an interlude of {k} bar{'s' if k > 1 else ''} ({L / FPS:.1f} s)" + \
                (f"; the model played {t_on - s_b:.1f} s before its voice came back" if t_on else f"; the model played on to the draft's end ({end - s_b:.1f} s)")
        if free < 1.5:
            raise RuntimeError(f"the model sang on {free:.1f} s after the section: no room for music")
        L = round(min(gap, free) * FPS)
        return [(kb, kb + L)], f"an interlude of {L / FPS:.1f} s (no bars known: the length asked)"
    if t_on is None:
        raise RuntimeError("the model did not sing the lines again in its draft")
    sung = [v for v in voice if v[1] > s_a and v[0] < s_b - 0.05]   # the section's own lines (a cut in a rest before its first: that line too)
    long_ = (sung[-1][1] - sung[0][0]) if sung else (s_b - s_a)   # how long the section's lines took the first time
    head, words = [(kb, None)], []
    lead = t_on - s_b                                  # the model's music before its lines: it plays some even when none is asked (Flood: 9.4 s)
    keep = round(gap / bar) if bar else 0              # whole bars of it asked for; none, «straight on»: only its lead-in into the lines
    if bar and lead > keep * bar + bar / 2:
        n_all = int((lead - 0.1) // bar)               # whole bars of it before the voice
        drop = n_all - keep
        if drop > 0:
            h = 1 if keep >= 2 else 0                  # its first bar (the turn from the section) kept when two or more are asked
            d0, d1 = kb + round(h * bar * FPS), kb + round((h + drop) * bar * FPS)
            head = [(kb, d0), (d1, None)] if d0 > kb else [(d1, None)]
            words.append(f"the model played {lead:.1f} s before its lines: {drop} bar{'s' if drop > 1 else ''} of it taken out, " +
                         (f"{keep} kept" if keep else "its lead-in kept"))
    elif not bar and lead > gap + 1:                   # no bars known: the middle out, the beat not kept (said)
        d0, d1 = kb + round(gap / 2 * FPS), kb + round((lead - max(gap / 2, 0.5)) * FPS)
        head = [(kb, d0), (d1, None)] if d0 > kb else [(d1, None)]
        words.append(f"the model played {lead:.1f} s before its lines: the middle taken out (no bars known)")
    if len(words) == 0:
        words.append(f"the model sang its lines again {lead:.1f} s after the section")
    want = t_on + long_                                # where its lines should end
    rests = [(voice[i][1], voice[i + 1][0]) for i in range(len(voice) - 1)] + ([(voice[-1][1], end)] if voice else [])
    rests = [r for r in rests if r[0] > t_on + 0.6 * long_ and r[0] < t_on + 1.4 * long_ and r[1] - r[0] >= 0.2]
    if rests:
        r0, r1 = max(rests, key=lambda r: min(r[1] - r[0], 3) - 0.25 * abs(r[0] - want))
        words.append(f"the voice rests {r0:.2f}–{r1:.2f} s after its lines")
    elif voice and voice[-1][1] >= end - 0.1 and voice[-1][0] < want:
        raise RuntimeError(f"the model was still singing at its draft's end ({end:.1f} s): nothing cut in the middle of a line")
    elif any(v[0] < want < v[1] for v in voice):       # HERESY 1717b: where they should end is inside a line
        raise RuntimeError(f"no rest of the voice after its lines, and {want:.1f} s falls in a line: nothing cut in the middle of a line")
    else:
        r0 = r1 = want
        words.append(f"no rest of the voice after its lines: cut where they should end ({want:.2f} s), the voice silent there")
    if bar:                                            # on a bar line, counted from kb (what is taken out is whole bars)
        lines_ = [s_b + m * bar for m in range(1, int((end - s_b) / bar) + 1)]
        inside = [x for x in lines_ if r0 + 0.05 <= x <= r1 - 0.05]
        before = [x for x in lines_ if x <= r1 - 0.05]   # none inside: the last one before the voice sings again (a word's tail shorter,
        e = min(inside, key=lambda x: abs(x - (r0 + 0.3))) if inside else (max(before) if before else lines_[0])   # never a new line's start)
        words.append(f"cut on the bar line at {e:.2f} s" + ("" if inside else " (none inside the rest: the last before the voice comes back)"))
    else:
        e = r0 + min(0.6, (r1 - r0) / 2)
    E = min(new_end, round(e * FPS))
    if E <= head[-1][0] + FPS:
        raise RuntimeError("the copy came out under a second")
    head[-1] = (head[-1][0], E)
    return head, "; ".join(words)


def _repeat_run(jid, name, req, codes, a, b, section, lyrics, abc, state, gap=0.0, kind="repeat", bar=None):
    title, said = str(req.get("title") or name), state["section"]
    ka, kb = round(a * FPS), min(round(b * FPS), len(codes))
    L0 = round(gap * FPS) + (kb - ka if kind == "repeat" else 0)   # what is asked: the music, and the lines again
    # the draft long enough for what the model plays before its lines (longer than asked, and some when none is: 9.4–14 s on Flood) and a rest after
    extra = (2 * (bar or 2) + 1.5) if kind == "interlude" else 14.0 + max(TAIL, 3.0)
    try:
        base = int(req.get("lm_seed"))
    except (TypeError, ValueError):
        base = random.randint(1000, 999999999)
    state["status"] = "running"
    made = []
    for i, ver in enumerate(state["versions"]):
        v, seed = ver["v"], base + 1 + i               # his «сид на +1»: the take's own music seed and the next ones
        ver.update(status="running", lm_seed=seed)
        drafts = []
        try:
            total = (kb + L0) / FPS + extra
            gen = {k: y for k, y in req.items() if k not in ("semantic_tokens", "semantic_keep", "parent", "end_at", "fade_in", "fade_out", "abc",
                                                              "abc_continue", "plan_only", "harmony")}
            ss = dict(req.get("semantic_sampling") or {})
            ss.update(max_tokens=int(round(total * FPS)), min_tokens=int(kb + L0))   # it does go on past the copy's end, as Extend's
            gen.update(cot="off", lyrics=lyrics, semantic_keep=",".join(map(str, codes[:kb])), duration=round(total, 1), semantic_sampling=ss,
                       lm_seed=seed, lm_batch_size=1, synth_batch_size=1, title=title + " · " + said + " · draft " + v)
            drafts.append(_wait(P["engine"]("/synth", gen).get("id"), ver))
            _, new = _codes(drafts[-1])
            if new[:kb] != codes[:kb]:
                raise RuntimeError("the kept start came back changed: nothing made from it")
            ver.update(finding="the voice")            # HERESY 1717: where the model played and sang, by its own voice split off
            voice = _voice(P["outputs"] / drafts[-1] / "audio.wav", max(0.0, (a if kind == "repeat" else b) - 0.5), len(new) / FPS)   # a repeat: its lines' length too
            ver.pop("finding", None)
            if isinstance(voice, str):
                raise RuntimeError(voice + ": nothing cut blind")
            spans, how = _cut(voice, ka, kb, len(new), gap, kind, bar, L0)
            copy = [c for s0, s1 in spans for c in new[s0:s1]]
            L = len(copy)
            P["say"](f"sing once more · {name} · version {v}: {L / FPS:.2f} s in after {b:.2f} s; {how}")
            joined = codes[:kb] + copy + codes[kb:]
            rep = {k: y for k, y in req.items() if k not in ("semantic_keep", "abc", "abc_continue", "harmony")}
            rep.update(lyrics=lyrics, semantic_tokens=",".join(map(str, joined)), duration=round(len(joined) / FPS + 2, 1), parent=name,
                       title=title + " · " + said + " " + v)
            if rep.get("end_at") not in (None, ""):     # an ended take ends as late again as it grew (fade_out is a length: it stays)
                rep["end_at"] = round(float(rep["end_at"]) + L / FPS, 2)
            if abc and kind == "repeat" and not gap:
                rep["abc"] = abc                       # the page's score, the section's bars twice
            else:
                rep["cot"] = "off"                     # no score that matches what it plays
            take = _wait(P["engine"]("/synth", rep).get("id"), ver)
            json.dump({"from": name, "a": round(kb / FPS, 2), "b": round((kb + L) / FPS, 2), "section": said, "repeated": section,
                       "parts": [{"a": round(kb / FPS, 2), "b": round((kb + L) / FPS, 2), "section": said}], "version": v, "lm_seed": seed,
                       "kind": kind, "gap": gap, "bar": round(bar, 3) if bar else None, "how": how, "at": time.strftime("%Y-%m-%d %H:%M")},
                      open(P["outputs"] / take / "replaced.json", "w", encoding="utf-8"), ensure_ascii=False)
            _place(name, take, said, v, seed, what=(f"Insert an interlude: written by the model after {section}, version {v}, music seed {seed} "
                                                    f"(the take's own + {1 + i}); {how}; the rest is {name}'s own") if kind == "interlude" else
                   (f"Sing it once more: {section} sung once more right after itself" + (f", after about {gap:g} s of music" if gap else "") +
                    f", version {v}, music seed {seed} (the take's own + {1 + i}); {how}; the rest is {name}'s own"))
            ver.update(status="done", take=take, end=round((kb + L) / FPS, 2))
            made.append(take)
        except Exception as e:                         # a version that fails says why; the next one still tries
            ver.pop("finding", None)
            ver.update(status="failed", error=str(e))
            P["say"](f"sing once more · {name} · version {v}: {e}")
            if "cancelled" in str(e):
                for rest in state["versions"]:
                    if rest["status"] == "queued":
                        rest.update(status="cancelled")
                break
        finally:
            if drafts:
                try:
                    P["trash"](drafts)
                except Exception:
                    pass
    state["status"] = "done" if made else "failed"
    state["takes"] = made
    P["say"](f"sing once more · {name} · {section}: " + (", ".join(made) if made else "nothing made"))
    with LOCK:
        LIVE[jid] = state
    threading.Timer(600, lambda: LIVE.pop(jid, None)).start()

# ---------------------------------------------------------------- HERESY 1757: a window sung anew with adapters of its own (TODO 6а)
# (Viktor 15.10.2026: «растяжка до и после выбранного сегмента, в окне свои адаптеры, силы и волны»; 23.10.2026: «6б — начинай заканчивать»).
# A stretch a–b picked on the player's wave and a ramp before and after it: the model sings on from the take's own codes up to the ramp before
# (semantic_keep), the take's adapters fading out over that ramp and the window's fading in (each its strengths and its wave over the window),
# the window's alone over a–b, back over the ramp after; its codes up to the end of that ramp joined with the take's own after it, then one replay
# of the whole stream on the take's own sound seed with both sets of adapters on the same waves (the sound half follows a wave frame by frame,
# lora-rt.h), so what lies outside the window and its ramps sounds as it did. Each version a take of its own, a child of the take, marked as
# Replace a section's are (replaced.json, its stretch the window with its ramps).
SHAPES = {"": ((0.0, 1.0), (1.0, 1.0)), "arch": ((0.0, 0.15), (0.5, 1.0), (1.0, 0.15)), "rise": ((0.0, 0.1), (1.0, 1.0)), "fall": ((0.0, 1.0), (1.0, 0.1))}
RAMP_MAX = 10.0


def window_loras(raw):
    """The window's adapters checked: [{id, ar, nar, curve}], the curve its wave over the window (none, arch, rise or fall), eight at most"""
    if not isinstance(raw, list) or len(raw) > 8:
        raise ValueError("the window's adapters: a list of eight at most")
    out, seen = [], set()
    for i, x in enumerate(raw):
        lid = x.get("id") if isinstance(x, dict) else None
        if not isinstance(lid, str) or not lid.strip() or ".." in lid or lid.startswith("/") or len(lid) > 300:
            raise ValueError(f"adapter {i + 1}: its id, a file under loras/")
        if lid in seen:
            raise ValueError(f"{lid}: twice in the window")
        seen.add(lid)
        try:
            ar, nar = float(x.get("ar", 1.0)), float(x.get("nar", 1.0))
        except (TypeError, ValueError):
            raise ValueError(f"{lid}: its strengths are numbers") from None
        if not (0 <= ar <= 2 and 0 <= nar <= 2):
            raise ValueError(f"{lid}: strengths from 0 to 2")
        curve = str(x.get("curve") or "")
        if curve not in SHAPES:
            raise ValueError(f"{lid}: a wave of none, arch, rise or fall")
        out.append({"id": lid, "ar": round(ar, 3), "nar": round(nar, 3), "curve": curve})
    return out


def window_curves(own, win, A, a, b, B, T):
    """The adapters of one stage whose waves run over T seconds (the draft's: its requested length; the replay's: its stream). The take's own
    (`own`, its request's loras) at their strength outside the window, down to nothing over A–a, nothing over a–b, up again over b–B; the
    window's (`win`) from nothing at A to theirs at a, their own wave over a–b, back to nothing at B. Points (t, k), t = seconds / T, as the
    engine reads a wave (half a cosine between points). One adapter in both: one entry, the take's strengths, the window's share of them
    inside (its music half's: the engine has one wave for both halves)."""
    t = lambda s: round(min(1.0, max(0.0, s / T)), 5)   # noqa: E731

    def inside(shape, k0):                           # the window's wave over a–b, scaled
        return [[t(a + u * (b - a)), round(min(2.0, k * k0), 4)] for u, k in SHAPES[shape]]
    out, wins = [], {w["id"]: w for w in win}
    for x in own:
        e = dict(x)
        w = wins.pop(x["id"], None)
        mid = inside(w["curve"], w["ar"] / float(x.get("ar", 1.0)) if float(x.get("ar", 1.0)) else 0.0) if w else [[t(a), 0.0], [t(b), 0.0]]
        e["curve"] = [[0.0, 1.0], [t(A), 1.0]] + mid + [[t(B), 1.0], [1.0, 1.0]]
        out.append(e)
    for w in win:
        if w["id"] in wins:
            out.append({"id": w["id"], "ar": w["ar"], "nar": w["nar"], "curve": [[0.0, 0.0], [t(A), 0.0]] + inside(w["curve"], 1.0) + [[t(B), 0.0], [1.0, 0.0]]})
    return out


def window(name, a, b, lyrics, versions=2, pre=2.0, post=2.0, loras=None):
    """The window a–b of a take sung anew with the adapters `loras` (window_loras), ramps of `pre` and `post` seconds round it"""
    name, lyrics, versions = str(name), str(lyrics or ""), int(versions or 2)
    try:
        a, b, pre, post = round(float(a), 2), round(float(b), 2), round(float(pre or 0), 2), round(float(post or 0), 2)
    except (TypeError, ValueError):
        raise ValueError("the window and its ramps are seconds") from None
    win = window_loras(loras or [])
    if name in (P["frozen"]() or set()):
        raise ValueError("frozen with its workspace: unfreeze it first")
    try:
        req, codes = _codes(name)
    except (OSError, ValueError):
        raise ValueError("no request kept: an imported take cannot have a window sung anew")
    if not codes:
        raise ValueError("this take kept no music codes")
    if not lyrics.strip():
        raise ValueError("the lyrics are empty")
    if versions not in (1, 2):
        raise ValueError("one version or two")
    if not (0 <= pre <= RAMP_MAX and 0 <= post <= RAMP_MAX):
        raise ValueError(f"a ramp of 0 to {RAMP_MAX:g} seconds before the window and after it")
    end = len(codes) / FPS
    if not (0 <= a < b <= end + 0.01) or b - a < 1:
        raise ValueError(f"the window must lie inside the take (0–{end:.1f} s), a second at least")
    own = [x for x in (req.get("loras") or []) if isinstance(x, dict) and x.get("id")]
    if any(x.get("curve") for x in own):
        raise ValueError("the take's own adapters ride a wave of their own: a window over them is not made yet")
    A, B = round(max(0.0, a - pre), 2), round(min(end, b + post), 2)
    said = "window " + span(a, b)
    jid = time.strftime("%Y%m%d-%H%M%S") + "-" + str(random.randrange(1000, 9999))
    state = {"name": name, "section": said, "a": A, "b": B, "parts": [{"a": A, "b": B, "section": said}], "kind": "window",
             "window": {"a": a, "b": b, "pre": pre, "post": post, "loras": win}, "status": "queued", "since": time.time(),
             "versions": [{"v": "AB"[i], "status": "queued"} for i in range(versions)]}
    with LOCK:
        LIVE[jid] = state
    threading.Thread(target=_window_run, args=(jid, name, req, codes, own, win, a, b, A, B, lyrics, state), daemon=True).start()
    P["say"](f"a window anew · {name} · {span(a, b)}, ramps {pre:g} s and {post:g} s · {_lnames(win)} · {versions} version{'s' if versions > 1 else ''} queued")
    return {"id": jid, "name": name, "versions": versions, "parts": 1}


def _lnames(win):
    return ", ".join(f"{w['id'].split('/')[-1].rsplit('.', 1)[0]} {w['ar']:g}/{w['nar']:g}" + (f" {w['curve']}" if w["curve"] else "") for w in win) or "no adapters"


def _window_run(jid, name, req, codes, own, win, a, b, A, B, lyrics, state):
    title, said = str(req.get("title") or name), state["section"]
    kA, kB = round(A * FPS), min(round(B * FPS), len(codes))
    state["status"] = "running"
    made = []
    for ver in state["versions"]:
        v, seed = ver["v"], random.randint(1000, 999999999)
        ver.update(status="running", lm_seed=seed)
        drafts = []
        try:
            dur = round(B + TAIL, 1)
            mt = (req.get("semantic_sampling") or {}).get("max_tokens") if isinstance(req.get("semantic_sampling"), dict) else None
            span_d = min(dur, mt / FPS) if isinstance(mt, (int, float)) and mt > 0 else dur   # the music's frames the waves run over (pipeline.h lora_span)
            gen = {k: y for k, y in req.items() if k not in ("semantic_tokens", "semantic_keep", "parent", "end_at", "fade_in", "fade_out")}
            gen.update(lyrics=lyrics, semantic_keep=",".join(map(str, codes[:kA])), duration=dur, lm_seed=seed, plan_only=False,
                       title=title + " · " + said + " · draft " + v, loras=window_curves(own, win, A, a, b, B, span_d))
            drafts.append(_wait(P["engine"]("/synth", gen).get("id"), ver))
            _, new = _codes(drafts[-1])
            if new[:kA] != codes[:kA]:
                raise RuntimeError("the kept start came back changed")
            if len(new) < kB:
                raise RuntimeError(f"the model ended the song at {len(new) / FPS:.1f} s, before the window's end at {B:.1f} s")
            joined = new[:kB] + codes[kB:]
            rep = {k: y for k, y in req.items() if k not in ("semantic_keep",)}
            rep.update(lyrics=lyrics, semantic_tokens=",".join(map(str, joined)), duration=round(len(joined) / FPS + 2, 1), parent=name,
                       title=title + " · " + said + " anew " + v, loras=window_curves(own, win, A, a, b, B, len(joined) / FPS))
            take = _wait(P["engine"]("/synth", rep).get("id"), ver)
            json.dump({"from": name, "a": A, "b": B, "section": said, "parts": [{"a": A, "b": B, "section": said}], "version": v, "lm_seed": seed,
                       "at": time.strftime("%Y-%m-%d %H:%M"), "kind": "window", "window": state["window"]},
                      open(P["outputs"] / take / "replaced.json", "w", encoding="utf-8"), ensure_ascii=False)
            _place(name, take, said, v, seed, what=f"A window sung anew: {span(a, b)} with {_lnames(win)}, ramps of {state['window']['pre']:g} s and "
                   f"{state['window']['post']:g} s, version {v}, music seed {seed}; the rest is {name}'s own")
            ver.update(status="done", take=take)
            made.append(take)
        except Exception as e:                         # a version that fails says why; the next one still tries
            ver.update(status="failed", error=str(e))
            P["say"](f"a window anew · {name} · version {v}: {e}")
            if "cancelled" in str(e):
                for rest in state["versions"]:
                    if rest["status"] == "queued":
                        rest.update(status="cancelled")
                break
        finally:
            if drafts:
                try:
                    P["trash"](drafts)
                except Exception:
                    pass
    state["status"] = "done" if made else "failed"
    state["takes"] = made
    P["say"](f"a window anew · {name} · {said}: " + (", ".join(made) if made else "nothing made"))
    with LOCK:
        LIVE[jid] = state
    threading.Timer(600, lambda: LIVE.pop(jid, None)).start()

