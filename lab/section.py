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
        v, seed = ver["v"], random.randrange(1, 2 ** 31)
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


def _place(name, take, section, v, seed):
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
            f"Replace a section: {section} sung anew, version {v}, music seed {seed}; the rest is {name}'s own"})
    except Exception:
        pass
