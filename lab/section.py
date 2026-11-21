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
                gen["nar_pieces"] = True                   # HERESY 2509: a draft sings to its cut even past one window (a long take was made so)
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
    on the processor, in the Studio's environment (setup's py, as stems_job's): [[start, end], …], or the reason it could not say"""
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
            gen["nar_pieces"] = True                       # HERESY 2509: a draft sings to its cut even past one window (a long take was made so)
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
            gen["nar_pieces"] = True                       # HERESY 2509: a draft sings to its cut even past one window (a long take was made so)
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


# ---------------------------------------------------------------- HERESY 2811–2814: the Section editor's queue sung as one take
# (Viktor 18.11.2026: «Редактор по секциям делай на 2.1.0 как описал.»). The page's queue of section edits (heresy-seceditor.js) comes as one body,
# and the chain sings it on one stream of the take's music codes, `joined`, each step exactly one of today's jobs, unchanged (their request-building
# lines are copied here: 1414, 1715, 1717 and 1757 above stay as they are):
#   A  Replace a section and Re-sing a line (1414, 1718), from the song's start on: a draft on the take's own score, its stretch laid in, the length
#      unchanged, so every place is still the source's;
#   B  Sing it once more and the interludes (1715, 1717), from the song's end back: a draft, its voice split off, whole bars laid in at the cut's end;
#      an insertion moves only what lies after it, and all of that is done already;
#   C  the ending, Re-sing from here (2690) or Extend (1651): the take written on from the stream, which IS the new take; else
#   D  one render of the whole stream on the take's own sound seed, when anything was sung;
#   E  Repeat and Remove (1714, 1356) on the score's bar lines: 1714's arrange on the render's sound (the take's own when nothing is sung), the new
#      take's codes the render's arranged by the same spans in its own request; the render then goes to the trash, so one take is made.
# Each draft sings on the text of its own stream (lyrics_a for A, each B op its own, the final for C and D): the model finds its place in the lyrics
# only from the kept codes after them. The drafts are hidden as they land and go to the trash once their codes (and in B their voice) are taken; the
# ledger (cache/section-chain/ID.json) is written after every step, so a failure, a Stop or a restart of the lab goes on from its step (2812).
import math, os, re, shutil, signal, subprocess  # noqa: E402,E401
from pathlib import Path  # noqa: E402

CHAIN = {"poll": 2.0, "full_every": 15.0, "full_for": 1800.0, "away_for": 180.0, "lost": 20}   # the waits, seconds (the test makes them short)
A_OPS, B_OPS, ENDS, CUTS = ("replace", "line"), ("once", "interlude"), ("from", "extend"), ("copy", "remove", "insert")
# HERESY 2887 (Viktor 20.11.2026 on §19 №3, the ninth edit): «insert», a copy of a score part put in at a gap between two sections (a bar line), cut and
# laid in by E's pass as Repeat and Remove are; it takes no stretch of its own, so the section before the gap may have its own edit in the same
# assembly («replace the bridge and insert an interlude after it»): its place is what the rules weigh, as a once more's or an interlude's
MAX_ALL, MAX_SUNG, MAX_LEN = 12, 8, 900.0          # twelve edits a queue, eight sung (1414's own cap), the page's 15:00 (Extend's own cap)
CHAIN_WS = "Section editor"
KEEP_FAILED, KEEP_DONE = 24 * 3600, 7 * 24 * 3600   # a ledger after a failure or a stop; one cut down to its take after the take is made
RUNS = {}                                           # chain id -> {cancel, job (the engine's under way), pid (the voice split's)}


class Stopped(Exception):
    """Stop pressed: the step under way cancelled, the chain ended «cancelled»"""


class Lost(Exception):
    """the engine lost the step's job (a restart between two steps): sent once more"""


class Result(RuntimeError):
    """the step's own result failed it (the model ended too soon, sang on, left no rest): a resume gives it a new music seed"""


def _f(x, what):
    try:
        v = float(x)
    except (TypeError, ValueError):
        raise ValueError(f"{what}: a number of seconds") from None
    if not math.isfinite(v):
        raise ValueError(f"{what}: a number of seconds")
    return v


def _mss(t):
    t = max(0.0, float(t))
    return f"{int(t) // 60}:{int(t) % 60:02d}"


def _tags(text):
    return len(re.findall(r"^\s*\[[^\]\n]+\]", str(text or ""), re.M))


def _seconds(name):
    """a take's length: its meta.json, else its audio.wav; 0 when neither says"""
    d = P["outputs"] / name
    try:
        s = float(json.load(open(d / "meta.json", encoding="utf-8")).get("seconds") or 0)
        if s > 0:
            return s
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    try:
        import soundfile as sf
        i = sf.info(str(d / "audio.wav"))
        return i.frames / i.samplerate
    except Exception:
        return 0.0


def _said(o):
    """an edit as the new take's title and the steps say it"""
    k, s = o["op"], o.get("section") or "the section"
    if k == "once":
        return s + " once more" + (", after a breath" if o.get("gap") else "")
    return {"replace": s + " anew", "line": s + " anew", "interlude": "an interlude after " + s, "copy": s + " twice", "remove": "without " + s,
            "from": "from " + _mss(o.get("at", 0)), "extend": "+" + _mss(o.get("more", 0)),
            "insert": s + " after " + (o.get("after") or "the start")}[k]


def _stretches(o):
    """an edit's stretches in the source's seconds (Extend's lies past the end: none; an Insert's copies one and takes none: 2887)"""
    if o["op"] == "insert":
        return []
    if o["op"] in CUTS:
        return [tuple(x) for x in o["spans"]]
    return [] if o["op"] == "extend" else [(o["a"], o["b"])]


def _place_of(o):
    """where something goes in, in the source's seconds: a once more's and an interlude's cut end, a Repeat's copied stretch's end"""
    return o["b"] if o["op"] in B_OPS else o["spans"][-1][1] if o["op"] == "copy" else o["at"] if o["op"] == "insert" else None


def _ops(raw, end):
    """the body's ops checked and made plain, in the order sent (each with its index n)"""
    if not isinstance(raw, list) or not raw:
        raise ValueError("the queue is empty")
    if len(raw) > MAX_ALL:
        raise ValueError("Twelve edits at most in one queue")
    out = []
    for i, o in enumerate(raw):
        if not isinstance(o, dict) or o.get("op") not in A_OPS + B_OPS + ENDS + CUTS:
            raise ValueError(f"edit {i + 1}: replace, line, once, interlude, copy, remove, insert, from or extend")
        k, sec = o["op"], str(o.get("section") or "the section")[:60]
        e = {"op": k, "section": sec, "n": i}
        if k in A_OPS + B_OPS:
            a, b = round(_f(o.get("a"), sec), 2), round(_f(o.get("b"), sec), 2)
            if not (0 <= a < b <= end + 0.01) or b - a < 2:
                raise ValueError(f"{sec}: a section must lie inside the take (0–{end:.1f} s), two seconds at least")
            ln = o.get("lines") if isinstance(o.get("lines"), list) and len(o["lines"]) == 2 else [a, b]
            l0, l1 = round(_f(ln[0], sec), 2), round(_f(ln[1], sec), 2)
            if not (a - 0.01 <= l0 < l1 <= b + 0.01):
                raise ValueError(f"{sec}: its heard lines must lie inside its cut")
            e.update(a=a, b=b, lines=[l0, l1])
            if k in B_OPS:
                gap = round(_f(o.get("gap") or 0, sec), 2)
                if not 0 <= gap <= 20 or (k == "interlude" and gap < 2):
                    raise ValueError("a breath of 0 to 20 seconds; an interlude of 2 to 20")
                e.update(gap=gap, lyrics=str(o.get("lyrics") or ""))
        elif k == "insert":                            # HERESY 2887: the part copied, one stretch, and its place between two sections
            sp = o.get("spans")
            if not isinstance(sp, list) or len(sp) != 1 or not isinstance(sp[0], (list, tuple)) or len(sp[0]) != 2:
                raise ValueError(f"{sec}: the part to put in, one [start, end] in seconds")
            x, y = round(_f(sp[0][0], sec), 2), round(_f(sp[0][1], sec), 2)
            at = round(_f(o.get("at"), sec), 2)
            if not (0 <= x < y <= end + 0.01) or y - x < 0.5:
                raise ValueError(f"{sec}: the part must lie inside the take (0–{end:.1f} s), half a second at least")
            if not 0 <= at <= end + 0.01:
                raise ValueError(f"{sec}: its place must lie inside the take (0–{end:.1f} s)")
            e.update(spans=[[x, y]], at=at, a=at, b=at, after=str(o.get("after") or "")[:60])
        elif k in CUTS:
            sp = o.get("spans")
            if not isinstance(sp, list) or not sp or len(sp) > 16:
                raise ValueError(f"{sec}: its parts, one to sixteen [start, end] in seconds")
            spans = sorted([round(_f(x[0], sec), 2), round(_f(x[1], sec), 2)] for x in sp if isinstance(x, (list, tuple)) and len(x) == 2)
            if len(spans) != len(sp) or any(not (0 <= x < y <= end + 0.01) or y - x < 0.5 for x, y in spans):
                raise ValueError(f"{sec}: each part must lie inside the take (0–{end:.1f} s), half a second at least")
            if any(spans[j + 1][0] < spans[j][1] - 0.01 for j in range(len(spans) - 1)):
                raise ValueError(f"{sec}: its parts overlap")
            if k == "copy" and len(spans) > 1:
                raise ValueError(f"{sec}: a Repeat is one stretch, from the first part ticked to the last")
            e.update(spans=spans, a=spans[0][0], b=spans[-1][1])
        elif k == "from":
            at = round(_f(o.get("at"), "the re-sing"), 2)
            if not 5 <= at <= end - 5:
                raise ValueError("The break is under 5 seconds from an end of the take")
            e.update(at=at, a=at, b=end)
        else:
            more = round(_f(o.get("more"), "Extend"), 2)
            if not 15 <= more <= 120:
                raise ValueError("Between 0:15 and 2:00")
            e.update(more=more, a=end, b=end + more)
        out.append(e)
    return out


def _rules(ops, end):
    """§9.3's rules 2 to 7, checked again on the lab's side (the page's word is never trusted alone)"""
    if sum(1 for o in ops if o["op"] not in CUTS) > MAX_SUNG:
        raise ValueError("Eight sung edits at most in one take")
    if sum(1 for o in ops if o["op"] in ENDS) > 1:
        raise ValueError("One ending at a time: re-sing to the end, or extend")
    if any(o["op"] == "extend" for o in ops) and any(o["op"] == "remove" and o["spans"][-1][1] >= end - 0.3 for o in ops):
        raise ValueError("Extend goes on from the end this Remove takes away")
    frm = next((o for o in ops if o["op"] == "from"), None)
    if frm:
        for o in ops:
            if o is not frm and (o["op"] == "extend" or max([s[1] for s in _stretches(o)] + [_place_of(o) or 0]) > frm["at"] + 0.25):   # 2887: an Insert by its place
                raise ValueError(f"Nothing can go after the re-sing to the end ({_mss(frm['at'])})")
    for i, o in enumerate(ops):                        # 2: no two stretches over each other by more than 0.25 s; a Repeat's or a Remove's never
        for p in ops[i + 1:]:                          # into a sung edit's at all: the page has moved that cut to the bar line (it meets it there)
            strict = (o["op"] in CUTS) != (p["op"] in CUTS) and "from" not in (o["op"], p["op"])
            for s in _stretches(o):
                for t in _stretches(p):
                    if min(s[1], t[1]) - max(s[0], t[0]) > (0.02 if strict else 0.25):
                        raise ValueError(f"It overlaps {o['section']} in the queue ({_mss(s[0])}–{_mss(s[1])})")
    for o in ops:                                      # 3: a place where something goes in never inside another's stretch
        p = _place_of(o)
        if p is None:
            continue
        for q in ops:
            if q is o:
                continue
            m = 0.01 if q["op"] in CUTS else 0.25
            for t in _stretches(q):
                if t[0] + m < p < t[1] - m:
                    raise ValueError(f"It would go in inside {q['section']} ({_mss(t[0])}–{_mss(t[1])})")
    total = end
    for o in ops:                                      # 7: the new take within 15:00
        k = o["op"]
        total += (o["gap"] + o["b"] - o["a"] if k == "once" else o["gap"] if k == "interlude" else o["more"] if k == "extend" else
                  sum(y - x for x, y in o["spans"]) * (1 if k in ("copy", "insert") else -1) if k in CUTS else 0)
    if total > MAX_LEN + 0.01:
        raise ValueError("The new take would run past 15:00")


def _ldir():
    d = Path(P["cache"]) / "section-chain"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _lsave(led):
    """the ledger written whole, then put in place"""
    p = _ldir() / (led["id"] + ".json")
    tmp = p.with_name(p.name + ".part")
    tmp.write_text(json.dumps(led, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def _lload(cid):
    if not re.fullmatch(r"\d{8}-\d{6}-\d{4}", str(cid)):
        raise ValueError("no such chain")
    try:
        return json.loads((_ldir() / (str(cid) + ".json")).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ValueError("no such chain: its ledger is gone") from None


def _request(name):
    try:
        req = json.load(open(P["outputs"] / name / "request.json", encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if isinstance(req, dict):
        req.pop("nar_ladder", None)                    # HERESY 1768: as _codes: a redo decodes the standard way
        return req
    return None


def _running(name=None, cid=None):
    with LOCK:
        return [k for k, v in LIVE.items() if v.get("kind") == "chain" and v.get("status") in ("queued", "running")
                and (name is None or v.get("name") == name) and (cid is None or k == cid)]


def chain(body):
    """POST /section/chain: (code, answer). A queue → 202 {id, name, steps}; {resume: id} → 202; {discard: id} → 200; 409 {id} when a chain of that
    take runs (a double press, a second window: the page follows that one); a ValueError (400) with the reason, nothing started"""
    body = body if isinstance(body, dict) else {}
    if body.get("resume"):
        return resume(str(body["resume"]))
    if body.get("discard"):
        return discard(str(body["discard"]))
    name = str(body.get("name") or "")
    if not name or "/" in name or name.startswith("."):
        raise ValueError("bad take name")
    busy = _running(name)
    if busy:
        return 409, {"id": busy[0], "error": "a chain of this take is running"}
    if name in (P["frozen"]() or set()):
        raise ValueError("frozen with its workspace: unfreeze it first")
    v = str(body.get("v") or "A")
    if not re.fullmatch(r"[A-Z]", v):
        raise ValueError("v: a version's letter, A to Z")
    raw = body.get("ops")
    sings = isinstance(raw, list) and any(isinstance(o, dict) and o.get("op") not in CUTS for o in raw)
    req = _request(name)
    edited = bool(req and req.get("edited"))
    if sings:
        if req is None:
            raise ValueError("no request kept: an imported take cannot be sung anew")
        if edited:                                     # HERESY 2813: its own codes by its token map; the request holds its source's whole stream
            try:
                codes = [int(x) for x in str(body.get("codes") or "").split(",") if x.strip()]
            except ValueError:
                raise ValueError("codes: the music codes, numbers parted by commas") from None
            if not codes:
                raise ValueError("an edited take (Crop, Remove, Repeat or Insert) keeps its source's whole stream of codes: its own come by its token map, and none were sent")
            secs = _seconds(name)
            if secs and abs(len(codes) / FPS - secs) > 0.5:
                raise ValueError(f"its codes run {len(codes) / FPS:.1f} s against its {secs:.1f} s of sound")
        else:
            codes = [int(x) for x in str(req.get("semantic_tokens") or "").split(",") if x.strip()]
            if not codes:
                raise ValueError("this take kept no music codes")
        end = len(codes) / FPS
    else:
        codes, end = [], _seconds(name)
        if not end:
            raise ValueError("this take has no sound to cut")
    ops = _ops(raw, end)
    _rules(ops, end)
    lyrics, lyrics_a = str(body.get("lyrics") or ""), str(body.get("lyrics_a") or "")
    A = sorted((o for o in ops if o["op"] in A_OPS), key=lambda o: o["a"])
    B = sorted((o for o in ops if o["op"] in B_OPS), key=lambda o: -o["b"])
    C = [o for o in ops if o["op"] in ENDS]
    E = [o for o in ops if o["op"] in CUTS]
    if sings and not lyrics.strip():
        raise ValueError("the lyrics are empty")
    if (A or B) and not lyrics_a.strip():
        raise ValueError("the lyrics of the replaced sections (lyrics_a) are empty")
    for o in B:                                        # each B op sings on its own step's text: the insertions from it to the end, none before
        if not o["lyrics"].strip():
            raise ValueError(f"{o['section']}: its own step's lyrics are empty")
        if _tags(o["lyrics"]) <= _tags(lyrics_a):
            raise ValueError(f"{o['section']}: its step's lyrics hold no block more than lyrics_a, and an insertion always adds one")
    for k in ("abc_render", "abc_after"):
        x = body.get(k)
        if x is not None and (not isinstance(x, str) or len(x) > 2 ** 20):
            raise ValueError(f"{k}: ABC text, a megabyte at most")
    try:
        bar = float(body.get("bar")) if body.get("bar") and 0.3 <= float(body.get("bar")) <= 8 else None
    except (TypeError, ValueError):
        bar = None
    bar = _bar((req or {}).get("abc")) or bar          # the take's own score first: its tempo is the one the model sang to
    st = lambda ph, o=None, cuts=None: ({"ph": ph, "ops": [c["n"] for c in cuts], "op": "arrange", "section": " · ".join(_said(c) for c in cuts)} if cuts else   # noqa: E731
                                        {"ph": ph, "ops": [], "op": "render", "section": "the whole take"} if o is None else
                                        {"ph": ph, "ops": [o["n"]], "op": o["op"], "section": _said(o)})
    steps = [st("A", o) for o in A] + [st("B", o) for o in B] + ([st("C", C[0])] if C else [st("D")] if A or B else []) + ([st("E", cuts=E)] if E else [])
    for s in steps:
        s.update(status="queued", phase="", engine="", took=None, error="")
    cid = time.strftime("%Y%m%d-%H%M%S") + "-" + str(random.randrange(1000, 9999))
    title = str(body.get("title") or "").strip()[:200] or (str((req or {}).get("title") or name) + " · " + " · ".join(_said(o) for o in ops) + " " + v)
    led = {"id": cid, "name": name, "v": v, "vi": ord(v) - 65, "title": title, "src_title": str((req or {}).get("title") or name),
           "lyrics": lyrics, "lyrics_a": lyrics_a, "ws": str(body.get("ws") or "")[:200], "abc_render": body.get("abc_render"),
           "abc_after": body.get("abc_after"), "bar": bar, "window_held": bool(body.get("window_held")), "edited_src": edited, "ops": ops,
           "steps": steps, "next": 0, "joined": codes, "ins": [], "render": None, "take": None, "job": None, "job_k": None, "want": "",
           "sent_at": 0, "drafts": [], "status": "queued", "why": "", "at": time.time()}
    _lsave(led)
    _go(led)
    P["say"](f"section editor · {name} · version {v}: {len(ops)} edit{'s' if len(ops) > 1 else ''} in {len(steps)} step{'s' if len(steps) > 1 else ''} queued")
    return 202, {"id": cid, "name": name, "steps": len(steps)}


def _go(led):
    """the chain's state for the page (/section/job, /section/live, /health as before) and its thread"""
    cid = led["id"]
    sung = sorted((o for o in led["ops"] if o["op"] not in ENDS + CUTS), key=lambda o: o["a"])
    state = {"name": led["name"], "kind": "chain", "chain": cid, "section": " · ".join(_said(o) for o in sorted(led["ops"], key=lambda o: (o["a"], o["b"]))),
             "a": sung[0]["a"] if sung else 0, "b": sung[-1]["b"] if sung else 0, "status": "queued", "since": time.time(), "step": led["next"] + 1,
             "of": len(led["steps"]), "steps": led["steps"], "versions": [{"v": led["v"], "status": "queued"}], "why": ""}
    RUNS[cid] = {"cancel": False, "job": None, "pid": None}
    with LOCK:
        LIVE[cid] = state
    threading.Thread(target=_chain_run, args=(led, state), daemon=True).start()


def _stopping(run, jid=None):
    """Stop pressed: the engine's job of the step asked to stop too"""
    if not run["cancel"]:
        return
    if jid:
        try:
            P["engine"]("/job?id=" + urllib.parse.quote(str(jid)) + "&cancel=1", {})
        except Exception:
            pass
    raise Stopped()


def _nap(sec, run):
    end = time.time() + sec
    while time.time() < end:
        _stopping(run)
        time.sleep(min(0.25, max(0.0, end - time.time())))


def _send(led, s, body, run):
    """the step sent to the engine: a full queue (429, 2674) and the Arc being reset (503, 2358) waited out, asked again every 15 s for 30
    minutes; an engine that does not answer (a reload between two steps) waited for three minutes; its job's id"""
    t0, away = time.time(), None
    while True:
        _stopping(run)
        try:
            r = P["engine"]("/synth", body)
            jid = (r or {}).get("id")
            if not jid:
                raise RuntimeError("the engine took no job: " + str(r)[:160])
            return jid
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503):
                try:
                    why = json.loads(e.read().decode() or "{}").get("error") or ""
                except Exception:
                    why = ""
                raise RuntimeError(f"the engine refused the step (HTTP {e.code}{': ' + str(why)[:200] if why else ''})") from None
            s["phase"] = "the engine's queue is full: waiting" if e.code == 429 else "the Arc is being reset: waiting"
            if time.time() - t0 > CHAIN["full_for"]:
                raise RuntimeError(s["phase"].split(":")[0] + f" for {CHAIN['full_for'] / 60:.0f} minutes: the step was not sent") from None
            _nap(CHAIN["full_every"], run)
        except OSError:
            away = away or time.time()
            if time.time() - away > CHAIN["away_for"]:
                raise RuntimeError(f"the engine did not answer for {CHAIN['away_for'] / 60:.0f} minutes") from None
            s["phase"] = "waits for the engine"
            _nap(min(5.0, CHAIN["full_every"]), run)


def _poll(jid, s, run):
    """the engine's job to its end: its first take's name. Lost (unknown 20 times, or no answer for two minutes): the step is sent once more"""
    lost, away = 0, None
    while True:
        time.sleep(CHAIN["poll"])
        _stopping(run, jid)
        try:
            st = P["engine"]("/job?id=" + urllib.parse.quote(str(jid)))
            lost, away = 0, None
        except urllib.error.HTTPError as e:
            lost += 1 if e.code == 404 else 0
            if lost > CHAIN["lost"]:
                raise Lost("the engine lost its job") from None
            continue
        except OSError:
            away = away or time.time()
            if time.time() - away > 120:
                raise Lost("the engine went away (no answer for two minutes)") from None
            continue
        status = st.get("status")
        s["engine"] = status or ""
        if status == "done":
            names = [x for x in (st.get("takes") or []) if isinstance(x, str)]
            if not names:
                raise RuntimeError("the engine made no take")
            return names[0]
        if status == "cancelled" and run["cancel"]:
            raise Stopped()
        if status in ("failed", "cancelled"):
            raise RuntimeError(status + (": " + str(st.get("error")) if st.get("error") else ""))


def _landed(led):
    """the step's take sent before the lab stopped: by its title (the chain's id is in it) in outputs/, made after it was sent; or None"""
    want = led.get("want")
    if not want:
        return None
    since = time.strftime("%Y%m%d-%H%M%S", time.localtime((led.get("sent_at") or 0) - 5))
    try:
        names = sorted(n for n in os.listdir(P["outputs"]) if not n.startswith(".") and n >= since)
    except OSError:
        return None
    for n in names:
        try:
            rq = json.load(open(P["outputs"] / n / "request.json", encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(rq, dict) or rq.get("title") != want or (led.get("want_seed") is not None and rq.get("lm_seed") != led["want_seed"]):
            continue
        if led["steps"][led["job_k"]]["ph"] not in ("A", "B") and rq.get("parent") != led["name"]:
            continue
        if led.get("want_n") and len([x for x in str(rq.get("semantic_tokens") or "").split(",") if x.strip()]) != led["want_n"]:
            continue                                   # a render: its stream's length is its own
        return n
    return None


def _recover(led, s, run):
    """the step under way when the lab stopped: by its engine job (while the engine keeps it), else by its take in outputs/; never sung twice"""
    jid = led.get("job")
    if jid:
        try:
            st = P["engine"]("/job?id=" + urllib.parse.quote(str(jid)))
            if st.get("status") == "done":
                names = [x for x in (st.get("takes") or []) if isinstance(x, str)]
                if names:
                    return names[0]
            elif st.get("status") in ("queued", "running"):
                run["job"] = jid
                return _poll(jid, s, run)
        except (Lost, urllib.error.HTTPError, OSError):
            pass
    return _landed(led)


def _hide(names):
    try:
        P["collection"].collection_post(P["config_dir"](), P["outputs"], {"op": "hide", "names": list(names)})
    except Exception as e:
        P["say"](f"section editor · {', '.join(names)} not hidden: {e}")


def _trash(led, names):
    names = [n for n in names if n]
    if not names:
        return
    try:
        P["trash"](names)
    except Exception as e:
        P["say"](f"section editor · {', '.join(names)} not put in the trash: {e}")
    led["drafts"] = [d for d in led.get("drafts", []) if d not in names]


def _engine_step(led, s, body, run, phase, hidden):
    """one engine job of the chain: the writer off the Arc first (2463), sent, followed; a take of it that landed before a restart of the lab used
    instead of singing it again; a draft (or a render an arrange pass follows) hidden the moment it lands"""
    k = led["steps"].index(s)
    name = None
    if led.get("job_k") == k and led.get("recover"):
        name = _recover(led, s, run)
        if name:
            P["say"](f"section editor · {led['name']} · step {k + 1}: its take {name}, made before the lab stopped, is used: not sung again")
    led["recover"] = False
    if not name:
        if P.get("yield_arc"):
            try:
                P["yield_arc"]("the Section editor")
            except Exception:
                pass
        led.update(job=None, job_k=k, want=body.get("title") or "", want_seed=body.get("lm_seed"), sent_at=time.time(),
                   want_n=len(led["joined"]) if body.get("semantic_tokens") else None)
        s["phase"] = "waits for the engine"
        for attempt in (0, 1):
            jid = _send(led, s, body, run)
            led["job"] = run["job"] = jid
            _lsave(led)
            s["phase"] = phase
            try:
                name = _poll(jid, s, run)
                break
            except Lost as e:
                if attempt:
                    raise RuntimeError(str(e)) from None
                P["say"](f"section editor · {led['name']} · step {k + 1}: {e}: sent once more")
                s["phase"] = "waits for the engine"
        run["job"] = None
    if hidden:
        _hide([name])
        led["drafts"] = led.get("drafts", []) + [name]
    led["job"] = None
    s["engine"] = ""
    _lsave(led)
    return name


def _codes_of(name):
    return _codes(name)[1]


def _chain_voice(wav, a, b, run):
    """vocal_rest.py as _voice runs it, at nice 19 in a chain (nice 9 before it, its own os.nice(10) on top: a trainer's loader goes first),
    its pid kept so Stop can end it"""
    import sys as _sys
    cmd = ["nice", "-n", "9", str(P.get("py") or _sys.executable), os.path.join(os.path.dirname(os.path.abspath(__file__)), "vocal_rest.py"), str(wav),
           f"{a:.2f}", f"{b:.2f}"]
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=dict(os.environ, CUDA_VISIBLE_DEVICES=""))
    except Exception as e:
        return f"the voice could not be split ({type(e).__name__})"
    run["pid"] = p.pid
    try:
        out, _ = p.communicate(timeout=600)
        j = json.loads((out.strip().splitlines() or ["{}"])[-1])
    except subprocess.TimeoutExpired:
        p.kill()
        return "the voice could not be split (TimeoutExpired)"
    except Exception as e:
        return f"the voice could not be split ({type(e).__name__})"
    finally:
        run["pid"] = None
    _stopping(run)
    return j["voice"] if isinstance(j.get("voice"), list) else "the voice could not be split (" + str(j.get("error") or "no answer")[:120] + ")"


def _draft_title(led, s, o):
    return led["src_title"] + " · " + _said(o) + " · draft " + led["id"] + "." + str(led["steps"].index(s) + 1)


def _score_heard(name):
    """HERESY 2895 (Viktor 20.11.2026: «не начнут ли СУНОвскую лажу гнать… нужно изначально до первейшего действия такой трек транскрибировать через
    SheetSage2 для составления настоящей партитуры»): the score the transcriber wrote from the take's sound (lab.py /score keeps it beside the take,
    score-from-sound.abc), for a take with none of its own: the Section editor has it written before the first edit, and a section sung anew then
    goes out as a planned take's does, cot full on that score (the kept codes before the cut, the score whole, as 1414's draft of a planned take),
    instead of a bare continuation of the sound; or None"""
    try:
        abc = (P["outputs"] / name / "score-from-sound.abc").read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    return abc if abc.strip().startswith("X:") and len(abc) <= 2 ** 20 else None


def _phase_a(led, s, req, run):
    """1414's part (section.py _run), unchanged: the draft sings on from the codes before the cut on lyrics_a, its stretch laid in"""
    o = led["ops"][s["ops"][0]]
    joined = led["joined"]
    ka, kb = round(o["a"] * FPS), min(round(o["b"] * FPS), len(joined))
    seed = s.get("seed") or random.randint(1000, 999999999)
    s["seed"] = seed
    gen = {k: y for k, y in req.items() if k not in ("semantic_tokens", "semantic_keep", "parent", "end_at", "fade_in", "fade_out", "edited")}
    gen.update(lyrics=led["lyrics_a"], semantic_keep=",".join(map(str, joined[:ka])), duration=round(o["b"] + TAIL, 1), lm_seed=seed,
               title=_draft_title(led, s, o), plan_only=False)
    gen["nar_pieces"] = True                           # HERESY 2509
    heard = None if req.get("abc") else _score_heard(led["name"])
    if heard:                                          # HERESY 2895: a take with no score of its own sings to the one written from its sound
        gen.update(cot="full", abc=heard, abc_continue=False)
        gen.pop("harmony", None)
        s["score"] = "written from its sound"
    elif led.get("edited_src") and not req.get("abc"):
        gen["cot"] = "off"                             # an edit whose score could not be cut: a cot with no abc would plan a score of its own
    draft = _engine_step(led, s, gen, run, "the draft is sung", True)
    new = _codes_of(draft)
    if new[:ka] != joined[:ka]:
        raise RuntimeError("the kept start came back changed")
    if len(new) < kb:
        raise Result(f"{o['section']}: the model ended the song at {len(new) / FPS:.1f} s, before the cut at {o['b']:.1f} s")
    led["joined"] = new[:kb] + joined[kb:]
    s["phase"] = "laid in"
    _trash(led, [draft])


def _phase_b(led, s, req, run):
    """1715's and 1717's (section.py _repeat_run), unchanged: the draft keeps the codes to the cut's end, sings on its op's own text, its voice
    split off, whole bars of it laid in at the cut's end"""
    o = led["ops"][s["ops"][0]]
    joined, kind, gap, bar = led["joined"], "repeat" if o["op"] == "once" else "interlude", o["gap"], led.get("bar")
    ka, kb = round(o["a"] * FPS), min(round(o["b"] * FPS), len(joined))
    L0 = round(gap * FPS) + (kb - ka if kind == "repeat" else 0)
    extra = (2 * (bar or 2) + 1.5) if kind == "interlude" else 14.0 + max(TAIL, 3.0)
    try:
        base = int(req.get("lm_seed"))
    except (TypeError, ValueError):
        base = led.setdefault("base_seed", random.randint(1000, 999999999))
    seed = s.get("seed") or base + 1 + led["vi"]       # his «сид на +1», and the version's index
    s["seed"] = seed
    total = (kb + L0) / FPS + extra
    gen = {k: y for k, y in req.items() if k not in ("semantic_tokens", "semantic_keep", "parent", "end_at", "fade_in", "fade_out", "abc",
                                                      "abc_continue", "plan_only", "harmony", "edited")}
    ss = dict(req.get("semantic_sampling") or {})
    ss.update(max_tokens=int(round(total * FPS)), min_tokens=int(kb + L0))
    gen.update(cot="off", lyrics=o["lyrics"], semantic_keep=",".join(map(str, joined[:kb])), duration=round(total, 1), semantic_sampling=ss,
               lm_seed=seed, lm_batch_size=1, synth_batch_size=1, title=_draft_title(led, s, o))
    gen["nar_pieces"] = True                           # HERESY 2509
    draft = _engine_step(led, s, gen, run, "the draft is sung", True)
    new = _codes_of(draft)
    if new[:kb] != joined[:kb]:
        raise RuntimeError("the kept start came back changed: nothing made from it")
    s["phase"] = "the voice is found"
    voice = (P.get("voice") or _chain_voice)(P["outputs"] / draft / "audio.wav", max(0.0, (o["a"] if kind == "repeat" else o["b"]) - 0.5), len(new) / FPS, run)
    _stopping(run)
    if isinstance(voice, str):
        raise RuntimeError(voice + ": nothing cut blind")
    try:
        spans, how = _cut(voice, ka, kb, len(new), gap, kind, bar, L0)
    except RuntimeError as e:
        raise Result(str(e)) from None
    copy = [c for s0, s1 in spans for c in new[s0:s1]]
    L = len(copy)
    led["joined"] = joined[:kb] + copy + joined[kb:]
    led["ins"] = led["ins"] + [{"n": o["n"], "p": o["b"], "L": L}]
    s.update(L=L, how=how, phase="laid in")
    P["say"](f"section editor · {led['name']} · {_said(o)}: {L / FPS:.2f} s in after {o['b']:.2f} s; {how}")
    _trash(led, [draft])


def _removed(led):
    return sum(y - x for o in led["ops"] if o["op"] == "remove" for x, y in o["spans"])


def _measure(led, more=0.0):
    """before C or D: what B put in is known only once sung, so the new take's length is checked against 15:00 again here"""
    secs = len(led["joined"]) / FPS + more + sum(y - x for o in led["ops"] if o["op"] in ("copy", "insert") for x, y in o["spans"]) - _removed(led)
    if secs > MAX_LEN + 0.5:
        raise RuntimeError("The new take would run past 15:00")


def _cuts_follow(led):
    return any(s["ph"] == "E" for s in led["steps"])


def _end_title(led):
    return led["src_title"] + " · render " + led["id"] if _cuts_follow(led) else led["title"]


def _phase_c(led, s, req, run):
    """the ending: Re-sing from here as 2690 sends it (app.js ruachRegenFrom's handler) or Extend as 1651 does; its take is the new take (or the
    render an arrange pass follows)"""
    o = led["ops"][s["ops"][0]]
    joined, ins = led["joined"], led["ins"]
    sumL = sum(x["L"] for x in ins)
    seed = s.get("seed") or random.randint(1000, 999999999)
    s["seed"] = seed
    body = {k: y for k, y in req.items() if k not in ("plan_only", "semantic_tokens", "semantic_keep", "nar_ladder", "end_at", "edited")}
    body.update(lyrics=led["lyrics"], lm_seed=seed, lm_batch_size=1, synth_batch_size=1, parent=led["name"], title=_end_title(led))
    if o["op"] == "from":
        at = o["at"]
        near = [x["p"] for x in ins if at < x["p"] <= at + 0.25]   # an insertion on the section before the break sits at the cut itself
        if near:
            at = max(near)
        tp = at + sum(x["L"] for x in ins if x["p"] <= at + 1e-6) / FPS   # t′: at or before it, never «before» alone
        keep = min(len(joined) - 1, round(tp * FPS))
        s["t"] = round(keep / FPS, 2)
        body["semantic_keep"] = ",".join(map(str, joined[:keep]))
        if sumL:                                       # the budget counts the kept frames: raised by what was put in, as 1651 raises it
            ss = dict(req.get("semantic_sampling") or {})
            for key in ("max_tokens", "min_tokens"):
                if isinstance(ss.get(key), (int, float)) and ss[key] > 0:
                    ss[key] = int(ss[key]) + sumL
            body["semantic_sampling"] = ss
            body["duration"] = round(float(req.get("duration") or len(joined) / FPS) + sumL / FPS, 1)
            for key in ("abc", "abc_continue", "harmony"):
                body.pop(key, None)
            body["cot"] = "off"                        # the score no longer lines up
        _measure(led)
    else:
        more = o["more"]
        total = min(900, math.ceil(len(joined) / FPS + more))
        for key in ("abc", "abc_continue", "harmony"):
            body.pop(key, None)
        body.update(cot="off", semantic_keep=",".join(map(str, joined)), duration=total)
        body["semantic_sampling"] = dict(req.get("semantic_sampling") or {}, max_tokens=round(total * FPS),
                                         min_tokens=min(round(total * FPS), len(joined) + round(more * FPS * 0.75)))
        if led.get("window_held"):
            body["nar_pieces"] = True                  # HERESY 2666
        s["t"] = round(len(joined) / FPS, 2)
        _measure(led, more)
    led["render"] = _engine_step(led, s, body, run, "the whole take is rendered", _cuts_follow(led))
    s["R"] = round(_seconds(led["render"]), 2)            # its length, kept: an arrange pass sends it to the trash


def _phase_d(led, s, req, run):
    """one replay as 1414's: the whole stream on the take's own sound seed, the final lyrics, end_at moved by what was put in (1715's way)"""
    joined, sumL = led["joined"], sum(x["L"] for x in led["ins"])
    rep = {k: y for k, y in req.items() if k not in ("semantic_keep", "edited")}
    rep.update(lyrics=led["lyrics"], semantic_tokens=",".join(map(str, joined)), duration=round(len(joined) / FPS + 2, 1), parent=led["name"],
               title=_end_title(led))
    if sumL:
        if rep.get("end_at") not in (None, ""):
            rep["end_at"] = round(float(rep["end_at"]) + sumL / FPS, 2)
        if led.get("abc_render"):                      # only straight-on repeats with a score of their own: the page's score, each such part twice
            rep["abc"] = led["abc_render"]
            rep.pop("abc_continue", None)
            rep.pop("harmony", None)
        else:                                          # out of the request, not only cot off, or the source's score would ride along misaligned
            for key in ("abc", "abc_continue", "harmony"):
                rep.pop(key, None)
            rep["cot"] = "off"
    _measure(led)
    led["render"] = _engine_step(led, s, rep, run, "the whole take is rendered", _cuts_follow(led))


def _spans(led, cuts, R):
    """E's spans in the render's seconds: each stretch moved by the L of every insertion whose place is at or before its start, removed ones left
    out and repeated ones followed by their copy, the spans that meet merged; a kept piece under half a second goes with the removal beside it"""
    ins = led["ins"]
    ev, put = [], []
    for c in cuts:
        if c["op"] == "insert":                        # HERESY 2887: the copy goes in at its place, moved as every stretch is; before a cut that starts there
            d0 = sum(x["L"] for x in ins if x["p"] <= c["at"] + 1e-6) / FPS
            a, b = c["spans"][0]
            d = sum(x["L"] for x in ins if x["p"] <= a + 1e-6) / FPS
            put.append((c["at"] + d0, a + d, min(b + d, R)))
            continue
        for a, b in c["spans"]:
            d = sum(x["L"] for x in ins if x["p"] <= a + 1e-6) / FPS
            ev.append((a + d, b + d, c["op"]))
    ev.sort()
    put.sort()
    out, at = [], 0.0

    def lay(upto):                                     # the copies whose place is reached: the kept music up to the place, then the copy
        nonlocal at
        while put and put[0][0] <= upto + 1e-6:
            p, x, y = put.pop(0)
            p = min(max(p, at), R)
            if p - at > 1e-6:
                out.append([at, p])
                at = p
            if y - x > 1e-6:
                out.append([x, y])
    for a, b, k in ev:
        lay(a)
        a, b = max(a, at), min(b, R)
        if b - a <= 1e-6:
            continue
        if a - at > 1e-6:
            out.append([at, a])
        if k == "copy":
            out += [[a, b], [a, b]]
        at = b
    lay(R)
    if R - at > 1e-6:
        out.append([at, R])

    def merge(xs):
        m = []
        for x in xs:
            if m and abs(m[-1][1] - x[0]) < 1e-6:
                m[-1][1] = x[1]
            else:
                m.append(list(x))
        return m
    m = merge(out)
    short = [x for x in m if x[1] - x[0] < 0.5]
    m = merge([x for x in m if x[1] - x[0] >= 0.5])
    if not m or sum(b - a for a, b in m) < 1.0:
        raise RuntimeError("Nothing would be left of the take")
    return [[round(a, 3), round(b, 3)] for a, b in m], [[round(a, 2), round(b, 2)] for a, b in short]


def _mapper(spans):
    """a moment of the render to the arranged take's (its first span holding it), or None when it was cut out"""
    def at(t):
        n = 0.0
        for a, b in spans:
            if a - 1e-6 <= t <= b + 1e-6:
                return n + (t - a)
            n += b - a
        return None
    return at


def _arranged(led, spans):
    """the render's sound arranged by takeedit.arrange (1714) into a new take's folder, made as takeedit.make makes one (a «.part» folder put in
    place): its request the render's with its codes arranged by the same spans in frames, the score after Repeat and Remove (or none), the source
    its parent and no `edited`: its codes are its own, as any take's"""
    src = P["outputs"] / led["render"]
    stem = re.sub(r"[^a-z0-9]+", "-", led["name"].split("-", 3)[-1].lower()).strip("-")[:40] or "take"
    for _ in range(4):
        new = time.strftime("%Y%m%d-%H%M%S") + "-01-seced-" + stem
        if not (P["outputs"] / new).exists() and not (P["outputs"] / ("." + new + ".part")).exists():
            break
        time.sleep(1.05)
    else:
        raise RuntimeError("a take of that name is there already")
    tmp = P["outputs"] / ("." + new + ".part")
    tmp.mkdir(parents=True)
    try:
        said = P["takeedit"].arrange(src / "audio.wav", spans, tmp / "audio.wav")
        rq = json.loads((src / "request.json").read_text(encoding="utf-8"))
        meta = json.loads((src / "meta.json").read_text(encoding="utf-8")) if (src / "meta.json").is_file() else {}
        codes = [int(x) for x in str(rq.get("semantic_tokens") or "").split(",") if x.strip()]
        arr = [c for a, b in spans for c in codes[round(a * FPS):round(b * FPS)]]
        rq.update(semantic_tokens=",".join(map(str, arr)), parent=led["name"], title=led["title"], duration=round(len(arr) / FPS + 2, 1))
        for k in ("edited", "semantic_keep", "nar_ladder"):
            rq.pop(k, None)
        if led.get("abc_after"):
            rq["abc"] = led["abc_after"]
        else:
            for k in ("abc", "abc_continue", "harmony"):
                rq.pop(k, None)
        if rq.get("end_at") not in (None, ""):         # an ended take's end, where it lands now (cut out with its part: none)
            e = _mapper(spans)(float(rq["end_at"]))
            if e is None:
                rq.pop("end_at", None)
            else:
                rq["end_at"] = round(e, 2)
        meta.update({"title": led["title"], "created": int(time.time()), "seconds": said["seconds"], "favorite": False, "truncated": False})
        for k in ("rating", "edited"):
            meta.pop(k, None)
        (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=4), encoding="utf-8")
        (tmp / "request.json").write_text(json.dumps(rq, ensure_ascii=False), encoding="utf-8")
        tmp.rename(P["outputs"] / new)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return new, said


def _phase_e(led, s, req, run):
    """Repeat and Remove: one pass of 1714's arrange under the lab's cpu lock, as /take/edit runs"""
    cuts = [led["ops"][n] for n in s["ops"]]
    s["phase"] = "cut on the bar lines"
    if not led.get("render"):                          # nothing sung: 1714's own take, edited.from the source, its codes by the token map
        spans, short = _spans(led, cuts, _seconds(led["name"]))
        with P["cpu"]:
            r = P["takeedit"].make(P["outputs"], led["name"], {"op": "arrange", "spans": spans, "abc": led.get("abc_after") or "", "title": led["title"]},
                                   P["take_dir"])
        led["take"] = r["name"]
    else:
        spans, short = _spans(led, cuts, _seconds(led["render"]))
        with P["cpu"]:
            led["take"], _ = _arranged(led, spans)
        _trash(led, [led["render"]])                   # nothing hidden outlives the chain
    s.update(spans=spans, short=short)


def _parts(led):
    """the stretches sung anew, in the new take's own time (through E), for replaced.json and the player's tint"""
    ins, ops = led["ins"], led["ops"]
    before = lambda t, strict: sum(x["L"] for x in ins if (x["p"] < t - 1e-6 if strict else x["p"] <= t + 1e-6)) / FPS   # noqa: E731
    out = []
    for o in ops:
        if o["op"] in A_OPS:
            d = before(o["a"], False)
            out.append({"n": o["n"], "a": o["a"] + d, "b": o["b"] + d, "section": _said(o)})
    for x in ins:
        o = ops[x["n"]]
        p = o["b"] + before(o["b"], True)
        out.append({"n": o["n"], "a": p, "b": p + x["L"] / FPS, "section": _said(o)})
    c = next((st for st in led["steps"] if st["ph"] == "C"), None)
    if c and c.get("t") is not None and c.get("R"):
        out.append({"n": c["ops"][0], "a": c["t"], "b": c["R"], "section": c["section"]})
    e = next((st for st in led["steps"] if st["ph"] == "E" and st.get("spans")), None)
    if e and led.get("render"):
        at = _mapper(e["spans"])
        moved = []
        for p in out:
            a, b = at(p["a"]), at(p["b"])
            if a is not None and b is not None and b > a:
                moved.append(dict(p, a=a, b=b))
        out = moved
    return sorted(({"n": p["n"], "a": round(p["a"], 2), "b": round(p["b"], 2), "section": p["section"]} for p in out), key=lambda p: p["a"])


def _note(led):
    words, vi = [], led["vi"]
    order = sorted(led["ops"], key=lambda o: (o["a"], _place_of(o) or o["b"]))
    step = {n: s for s in led["steps"] for n in s["ops"]}
    for o in order:
        s, k = step.get(o["n"], {}), o["op"]
        if k in A_OPS:
            words.append(f"{_said(o)}, music seed {s.get('seed')}")
        elif k in B_OPS:
            words.append((f"an interlude after {o['section']}" if k == "interlude" else f"{o['section']} once more" + (f" after about {o['gap']:g} s of music" if o["gap"] else "")) +
                         f", {s.get('L', 0) / FPS:.1f} s, seed + {1 + vi}: {s.get('how') or ''}")
        elif k in CUTS:
            words.append(f"{_said(o)}, on the bar lines")
        elif k == "from":
            words.append(f"from {_mss(s.get('t', o['at']))} to the end anew, music seed {s.get('seed')}")
        else:
            words.append(f"+{_mss(o['more'])} after the end, music seed {s.get('seed')}")
    e = next((s for s in led["steps"] if s["ph"] == "E"), None)
    tail = ""
    if e and e.get("short"):
        tail = "; " + ", ".join(f"{_mss(a)}–{_mss(b)}" for a, b in e["short"]) + " (under half a second between the cuts) went with the part beside it"
    return f"Section editor, version {led['v']}: " + "; ".join(f"{i}) {w}" for i, w in enumerate(words, 1)) + tail + f". The rest is {led['name']}'s own."


def _record(led):
    """meta.json's section_editor (written whole, then put in place), replaced.json for the player's tint, the place and the note"""
    take, name = led["take"], led["name"]
    step = {n: s for s in led["steps"] for n in s["ops"]}
    parts = _parts(led)
    res = {p["n"]: [p["a"], p["b"]] for p in parts}
    parts = [{k: v for k, v in p.items() if k != "n"} for p in parts]
    ops = []
    for o in led["ops"]:
        s = step.get(o["n"], {})
        ops.append({k: v for k, v in {"op": o["op"], "section": o["section"], "src": o["spans"] if o["op"] in CUTS else [o["a"], o["b"]],
                                      "res": res.get(o["n"]), "seed": s.get("seed"), "gap": o.get("gap"), "more": o.get("more"), "how": s.get("how"),
                                      "L": round(s["L"] / FPS, 2) if s.get("L") else None}.items() if v is not None})
    render = next(((led["ops"][s["ops"][0]]["op"] if s["ph"] == "C" else "replay") for s in led["steps"] if s["ph"] in ("C", "D")), "none")
    rec = {"from": name, "v": led["v"], "chain": led["id"], "ops": ops, "render": render, "at": time.strftime("%Y-%m-%d %H:%M")}
    mp = P["outputs"] / take / "meta.json"
    try:
        meta = json.loads(mp.read_text(encoding="utf-8")) if mp.is_file() else {}
        meta["section_editor"] = rec
        tmp = mp.with_name("meta.json.part")
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=4), encoding="utf-8")
        tmp.replace(mp)
    except (OSError, ValueError) as e:
        P["say"](f"section editor · {take}: its record not written into meta.json: {e}")
    if parts:
        json.dump({"from": name, "kind": "chain", "a": parts[0]["a"], "b": parts[0]["b"], "section": parts[0]["section"], "parts": parts,
                   "version": led["v"], "at": time.strftime("%Y-%m-%d %H:%M")}, open(P["outputs"] / take / "replaced.json", "w", encoding="utf-8"), ensure_ascii=False)
    col, cfg = P["collection"], P["config_dir"]()
    d = col.load(cfg)
    ok = lambda w: not w.startswith("\U0001f48e") and not (d.get("locks") or {}).get(w) and not col.frozen_ws(d, w)   # noqa: E731
    places = [w for w, ns in d["workspaces"].items() if name in ns and ok(w)] or ([led["ws"]] if led.get("ws") and ok(led["ws"]) else [CHAIN_WS])
    for w in places:
        try:
            col.collection_post(cfg, P["outputs"], {"op": "ws-add", "workspace": w, "names": [take]})
        except Exception as e:
            P["say"](f"section editor · {take} not added to «{w}»: {e}")
    try:
        col.collection_post(cfg, P["outputs"], {"op": "note", "names": [take], "text": _note(led)})
    except Exception:
        pass


def _chain_run(led, state):
    cid, name = led["id"], led["name"]
    run = RUNS.get(cid) or {"cancel": False, "job": None, "pid": None}
    s, why = None, ""
    req = _request(name) or {}
    state["status"] = led["status"] = "running"
    state["versions"][0]["status"] = "running"
    try:
        while led["next"] < len(led["steps"]):
            k = led["next"]
            s = led["steps"][k]
            state["step"] = k + 1
            _stopping(run)
            s.update(status="running", error="", phase="waits for the engine" if s["ph"] != "E" else "cut on the bar lines")
            s.pop("result", None)
            t0 = time.time()
            _lsave(led)
            {"A": _phase_a, "B": _phase_b, "C": _phase_c, "D": _phase_d, "E": _phase_e}[s["ph"]](led, s, req, run)
            s.update(status="done", phase="done", engine="", took=round(time.time() - t0, 1))
            led.update(next=k + 1, job=None, job_k=None, want="")
            _lsave(led)
        if not led.get("take"):
            led["take"] = led["render"]
        s = None
        _record(led)
        led["status"] = "done"
        P["say"](f"section editor · {name} · version {led['v']}: {led['take']}")
    except Stopped:
        if s:
            s.update(status="cancelled", phase="cancelled", engine="")
        led["status"], why = "cancelled", "cancelled"
        P["say"](f"section editor · {name} · version {led['v']}: stopped at step {led['next'] + 1}")
    except Exception as e:
        if s:
            s.update(status="failed", phase="failed", engine="", error=str(e))
            if isinstance(e, Result):
                s["result"] = True
        led["status"], why = "failed", str(e)
        P["say"](f"section editor · {name} · version {led['v']} · step {led['next'] + 1}: {e}")
    finally:
        if led.get("drafts"):                          # a draft never stays: hidden, then to the trash (the render stays hidden while E can resume)
            _trash(led, [d for d in led["drafts"] if d != led.get("render")])
        led["at"], led["why"] = time.time(), why
        if led["status"] == "done":
            _lsave({"id": cid, "name": name, "v": led["v"], "status": "done", "take": led["take"], "at": led["at"], "steps": len(led["steps"])})
        elif led["status"] == "running":               # an error out of the frame itself: said as a failure
            led["status"] = "failed"
            _lsave(led)
        else:
            _lsave(led)
        RUNS.pop(cid, None)
        # the page's state after the ledger: /section/chains never says less than /section/job
        state["why"] = why
        if led["status"] == "done":
            state["versions"][0].update(status="done", take=led["take"])
            state["takes"] = [led["take"]]
        else:
            state["versions"][0].update(status=led["status"], **({"error": why} if led["status"] == "failed" else {}))
        state["status"] = led["status"]
        with LOCK:
            LIVE[cid] = state
        threading.Timer(600, lambda: LIVE.pop(cid, None)).start()


def resume(cid):
    """{resume: id}: from the step that failed, was stopped or was cut by a restart; the done steps not sung again, the failed one on a new music
    seed when its own result failed it"""
    led = _lload(cid)
    if _running(cid=cid):
        return 409, {"id": cid, "error": "it runs"}
    busy = _running(led.get("name"))
    if busy:
        return 409, {"id": busy[0], "error": "a chain of this take is running"}
    if led.get("status") == "done":
        raise ValueError(f"this chain is done: its take is {led.get('take')}")
    k = led["next"]
    s = led["steps"][k]
    cut = led.get("status") in ("queued", "running")   # cut by a restart: the step under way is looked for first
    led["recover"] = cut and led.get("job_k") == k
    if not cut:
        led.update(job=None, job_k=None, want="")
    if s.get("result"):                                # its own result failed it: a new music seed (B's own would be the same + 1 again)
        s["seed"] = random.randint(1000, 999999999)
    s.update(status="queued", error="", phase="")
    led.update(status="queued", why="")
    _lsave(led)
    _go(led)
    P["say"](f"section editor · {led['name']} · version {led['v']}: resumed from step {k + 1}")
    return 202, {"id": cid, "name": led["name"], "steps": len(led["steps"]), "from": k + 1}


def discard(cid):
    """{discard: id}: the ledger gone; the render it names and any draft of it still there to the trash, so nothing hidden is left behind"""
    led = _lload(cid)
    if _running(cid=cid):
        raise ValueError("it runs: stop it first")
    names = [n for n in [led.get("render")] + list(led.get("drafts") or []) + ([_landed(led)] if led.get("job_k") is not None else [])
             if n and n != led.get("take") and (P["outputs"] / n).is_dir()]
    if names:
        _trash(led, sorted(set(names)))
    try:
        (_ldir() / (str(cid) + ".json")).unlink()
    except OSError:
        pass
    with LOCK:
        LIVE.pop(cid, None)
    return 200, {"discarded": cid, "trashed": sorted(set(names))}


def cancel(cid):
    """POST /section/cancel {id}: the flag set, the step's engine job asked to stop, the voice split (no engine job then) ended by its pid"""
    cid = str(cid)
    run = RUNS.get(cid)
    if not run:
        raise ValueError("no chain of that id runs")
    run["cancel"] = True
    if run.get("job"):
        try:
            P["engine"]("/job?id=" + urllib.parse.quote(str(run["job"])) + "&cancel=1", {})
        except Exception:
            pass
    if run.get("pid"):
        try:
            os.kill(run["pid"], signal.SIGTERM)
        except OSError:
            pass
    return {"cancel": True}


def _prune():
    """a ledger past its keep: 24 h after a failure, a stop or a cut; 7 days for a done one (cut down to its take). What a failed one names
    goes to the trash with it"""
    now = time.time()
    for p in list(_ldir().glob("*.json")):
        try:
            led = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if _running(cid=led.get("id")):
            continue
        age = now - float(led.get("at") or 0)
        if led.get("status") == "done":
            if age > KEEP_DONE:
                try:
                    p.unlink()
                except OSError:
                    pass
        elif age > KEEP_FAILED:
            try:
                discard(led["id"])
            except Exception:
                pass


def chains(name):
    """GET /section/chains?name=: the chains of a take, as their ledgers say: running, failed, cancelled, cut by a restart (status «cut»), and the
    done ones for 7 days with their take, so an editor opened later knows what this queue made"""
    _prune()
    out = []
    for p in sorted(_ldir().glob("*.json")):
        try:
            led = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if led.get("name") != name:
            continue
        st = led.get("status")
        if st in ("queued", "running") and not _running(cid=led.get("id")):
            st = "cut"
        steps = led.get("steps")
        of = len(steps) if isinstance(steps, list) else int(steps or 0)
        out.append({"id": led["id"], "v": led.get("v"), "step": of if st == "done" else int(led.get("next", 0)) + 1, "of": of, "status": st,
                    "why": led.get("why") or "", "at": led.get("at"), "take": led.get("take")})
    return {"chains": out}
