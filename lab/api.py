"""HERESY 1116 (Viktor, 02.10.2026): the studio's API, for this machine and its network (the engine answers private
addresses only, HERESY 1114). One door for a script, a DAW, an agent: the engine's /api/… comes here as it is.

    GET  /api/v1                          what this is, and every route
    GET  /api/v1/openapi.json             the same as OpenAPI 3.1
    GET  /api/v1/health                   the engine, the lab, the cards (the guard's verdict)
    POST /api/v1/songs                    make a song: {style, lyrics, title, mode, duration, min_seconds, abc | midi_b64, …} -> {job}
    POST /api/v1/score/from-midi          a MIDI file as a song's score, to see first: {midi_b64, key, ins} -> {abc, key, …}
    GET  /api/v1/jobs/ID                  its state; when done, the takes it made
    POST /api/v1/jobs/ID/cancel
    GET  /api/v1/takes                    ?workspace= &q= &limit= &offset=
    GET  /api/v1/takes/NAME               the take: what it was made with, its marks, its workspaces
    GET  /api/v1/takes/NAME/audio         -> the WAV (the engine serves it)
    POST /api/v1/takes/NAME/marks         {rating, favorite, note}
    POST /api/v1/takes/NAME/reaper        the take as a REAPER project -> where to fetch it
    GET  /api/v1/takes/NAME/artwork       -> its artwork (JPEG, 768 px), when it has one
    POST /api/v1/takes/NAME/artwork       draw it: {again, seed} -> {status} while drawing, then what was drawn
    GET  /api/v1/takes/NAME/derived       the Refiner's tree: every branch made from the take, and what runs
    GET  /api/v1/takes/NAME/file?path=…   one file of the tree (a redirect to it)
    POST /api/v1/takes/NAME/stems         {mode: vocals | four}
    POST /api/v1/takes/NAME/debuzz        {strength: 0.1–1, source}
    POST /api/v1/takes/NAME/remaster      {source, preset, lufs, tp, hz432, deess, cleanup, fade, formats …}
    POST /api/v1/takes/NAME/upscale       {mode: subtle | normal | high | extreme, variants: 1 | 2, keep, source}
    POST /api/v1/takes/NAME/lyrics-check  {source, again}: Whisper against the lyrics
    GET  /api/v1/workspaces
    POST /api/v1/workspaces/WS            {op: add | remove | move, names, from}

A token is asked only when RUACH_API_TOKEN is set, and only of callers not on this machine (Authorization: Bearer)."""
import base64, json, math, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

import midi_score                                       # HERESY 1145

VERSION = "1"
# HERESY 1136: the studio's own version beside the API's
STUDIO = (Path(__file__).resolve().parent.parent / "VERSION").read_text().strip() if (Path(__file__).resolve().parent.parent / "VERSION").is_file() else "?"
ENGINE = f"http://127.0.0.1:{os.environ.get('YUE2CPP_PORT', '41867')}"
MODES = {"direct": "off", "off": "off", "full": "full", "melody": "melody"}
INSTRUMENTAL = "[Intro]\n\n[Verse]\n\n[Outro]\n"


class Redirect(Exception):
    def __init__(self, url):
        self.url = url


def _engine(path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(ENGINE + path, data=data, method="POST" if data is not None else "GET",
                                 headers={"Content-Type": "application/json"} if data is not None else {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode() or "{}"
    return json.loads(raw)


def _authorized(headers):
    token = os.environ.get("RUACH_API_TOKEN", "")
    if not token:
        return True
    remote = (headers.get("X-Remote-Addr") or "127.0.0.1").replace("::ffff:", "")
    if remote in ("127.0.0.1", "::1"):
        return True
    return (headers.get("Authorization") or "") == "Bearer " + token


def _row(r):
    return {k: r.get(k) for k in ("name", "title", "created", "seconds", "kind", "rating", "favorite", "note", "workspaces", "hidden")}


_PENDING_LOCK = threading.Lock()


def _pending(ctx, add=None, done=None):
    """HERESY 1156: the filings owed, on disk (user/api-filing.json), so a lab restarted meanwhile still makes them."""
    with _PENDING_LOCK:
        p = ctx["config_dir"]() / "api-filing.json"
        try:
            rows = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            rows = []
        if add or done is not None:
            if add:
                rows.append(add)
            if done is not None:
                rows = [r for r in rows if str(r.get("job")) != str(done)]
            tmp = p.with_name(p.name + ".part")
            json.dump(rows, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
            os.replace(tmp, p)
        return rows


def _file_in_workspace(job, ws, ctx, remember=True):
    """After the job, its takes go into the workspace asked for (the page files its own; a script's need this).
    HERESY 1156: watched for as long as the job waits and runs (a queue of fifty two-minute probes outlives an hour, and
    the watch that gave up after one left the late takes in no workspace), and remembered on disk for a restart."""
    if remember:
        _pending(ctx, add={"job": str(job), "ws": ws, "t": int(time.time())})

    def watch():
        unknown = 0
        while True:
            time.sleep(3)
            try:
                st = _engine(f"/job?id={urllib.parse.quote(str(job))}")
                unknown = 0
            except urllib.error.HTTPError as e:
                if e.code == 404:                        # the engine does not know it (restarted): nothing will come
                    unknown += 1
                    if unknown > 20:
                        _pending(ctx, done=job)
                        return
                continue
            except OSError:
                continue
            if st.get("status") == "done":
                if st.get("takes"):
                    ctx["collection"].collection_post(ctx["config_dir"](), ctx["outputs"], {"op": "ws-add", "workspace": ws, "names": st["takes"]})
                _pending(ctx, done=job)
                return
            if st.get("status") in ("failed", "cancelled"):
                _pending(ctx, done=job)
                return
    threading.Thread(target=watch, daemon=True).start()


def resume_filing(ctx):
    """HERESY 1156: a restarted lab watches again the jobs whose takes it still owes a workspace."""
    rows = _pending(ctx)
    for r in rows:
        _file_in_workspace(r.get("job"), r.get("ws"), ctx, remember=False)
    return len(rows)


def openapi():
    def op(summary, body=None, params=None):
        o = {"summary": summary, "responses": {"200": {"description": "JSON"}}}
        if body:
            o["requestBody"] = {"content": {"application/json": {"schema": {"type": "object", "properties": body}}}}
        if params:
            o["parameters"] = [{"name": n, "in": w, "required": w == "path", "schema": {"type": t}} for n, w, t in params]
        return o
    s, i, b, a = {"type": "string"}, {"type": "integer"}, {"type": "boolean"}, {"type": "array"}
    song = {"style": s, "lyrics": s, "title": s, "mode": {"type": "string", "enum": ["direct", "full", "melody"]},
            "instrumental": b, "duration": {"type": "number"}, "min_seconds": {"type": "number"}, "music_seed": i, "sound_seed": i, "abc": s, "loras": a,
            "vae": s, "workspace": s, "midi_b64": s, "midi_key": s, "midi_ins": {"type": "string", "enum": ["auto", "keep", "none"]}}
    return {"openapi": "3.1.0",
            "info": {"title": "Ruach Studio API", "version": VERSION,
                     "description": "Songs from words on this machine. Private networks only; a token when RUACH_API_TOKEN is set."},
            "servers": [{"url": "/api/v1"}],
            "paths": {
                "/health": {"get": op("The engine, the lab and the cards")},
                "/songs": {"post": op("Make a song; returns the job. A score (abc, or a MIDI file as midi_b64) makes mode melody "
                                      "or full by itself; direct with a score is refused, as it would drop it", song)},
                "/score/from-midi": {"post": op("A MIDI file as a song's score, without making the song: the score and what "
                                                "it was made of (the key and where it came from, the notes kept and dropped)",
                                                {"midi_b64": s, "key": s, "ins": {"type": "string", "enum": ["auto", "keep", "none"]}})},
                "/jobs/{id}": {"get": op("A job's state and, when done, its takes", params=[("id", "path", "string")])},
                "/jobs/{id}/cancel": {"post": op("Cancel a job", params=[("id", "path", "string")])},
                "/takes": {"get": op("The takes", params=[("workspace", "query", "string"), ("q", "query", "string"),
                                                         ("limit", "query", "integer"), ("offset", "query", "integer")])},
                "/takes/{name}": {"get": op("One take: what it was made with, its marks", params=[("name", "path", "string")])},
                "/takes/{name}/audio": {"get": op("The take's WAV (a redirect to the engine)", params=[("name", "path", "string")])},
                "/takes/{name}/marks": {"post": op("Like (1), dislike (-1), none (0); favourite; a note",
                                                   {"rating": i, "favorite": b, "note": s}, [("name", "path", "string")])},
                "/takes/{name}/reaper": {"post": op("The take as a REAPER project", {"midi_b64": s}, [("name", "path", "string")])},
                "/takes/{name}/derived": {"get": op("The Refiner's tree of the take: branches, their files, what runs", params=[("name", "path", "string")])},
                "/takes/{name}/stems": {"post": op("Split into stems", {"mode": {"type": "string", "enum": ["vocals", "four"]}}, [("name", "path", "string")])},
                "/takes/{name}/debuzz": {"post": op("The VAE's frame buzz out", {"strength": {"type": "number"}, "source": s}, [("name", "path", "string")])},
                "/takes/{name}/remaster": {"post": op("The Debunker v6 remaster", {"source": s, "preset": s, "lufs": {"type": "number"}, "hz432": b}, [("name", "path", "string")])},
                "/takes/{name}/upscale": {"post": op("UniverSR upscale", {"mode": {"type": "string", "enum": ["subtle", "normal", "high", "extreme"]}, "variants": i, "keep": b, "source": s}, [("name", "path", "string")])},
                "/takes/{name}/lyrics-check": {"post": op("Whisper against the lyrics", {"source": s, "again": b}, [("name", "path", "string")])},
                "/takes/{name}/artwork": {"get": op("The take's artwork (a redirect to the JPEG)", params=[("name", "path", "string")]),
                                          "post": op("Draw the artwork: a prompt from the style and words, an SDXL picture; ask again until it is done",
                                                     {"again": b, "seed": i}, [("name", "path", "string")])},
                "/workspaces": {"get": op("The workspaces and how many takes each holds")},
                "/workspaces/{ws}": {"post": op("Add, take out or move takes", {"op": {"type": "string", "enum": ["add", "remove", "move"]},
                                                                               "names": a, "from": s}, [("ws", "path", "string")])},
            }}


def handle(method, path, query, body, headers, ctx):
    """(status, JSON) for /api/…; raises Redirect for a file the engine serves."""
    if not _authorized(headers):
        return 401, {"error": "a token is asked of callers not on this machine: Authorization: Bearer …"}
    m = re.match(r"^/api/v(\d+)(/.*)?$", path)
    if not m:
        return 404, {"error": "the API lives at /api/v1"}
    if m.group(1) != VERSION:
        return 404, {"error": f"API v{m.group(1)} does not exist; this studio speaks v{VERSION}"}
    rest = (m.group(2) or "/").rstrip("/") or "/"
    data = json.loads(body.decode("utf-8")) if body else {}
    col, outputs, cfg = ctx["collection"], ctx["outputs"], ctx["config_dir"]

    if method == "GET" and rest == "/":
        return 200, {"name": "Ruach Studio API", "version": VERSION, "studio": STUDIO, "openapi": "/api/v1/openapi.json",
                     "routes": [ln.strip() for ln in __doc__.split("\n\n")[1].splitlines() if ln.strip()]}
    if method == "GET" and rest == "/openapi.json":
        return 200, openapi()
    if method == "GET" and rest == "/health":
        out = {"lab": True}
        try:
            hw = _engine("/hardware", timeout=10)
            out["engine"] = {"busy": hw.get("busy"), "loaded_bytes": hw.get("loaded_bytes"), "gpus": [g.get("description") for g in hw.get("gpus", [])]}
        except OSError as e:
            out["engine"] = {"error": str(e)}
        try:
            out["cards"] = [{"index": c["index"], "free_mb": c["free_mb"], "ok": c["ok"], "why": c["why"]} for c in ctx["gpu_guard"].snapshot()]
        except Exception as e:                           # said, never "every card free"
            out["cards"] = {"error": str(e)}
        return 200, out

    # HERESY 1145: a MIDI file as the score (REAPER's Generate here sends its region's), read back before anything is spent
    if method == "POST" and rest == "/score/from-midi":
        try:
            return 200, midi_score.from_midi(base64.b64decode(str(data.get("midi_b64") or ""), validate=True), key=data.get("key") or None,
                                             ins_line=str(data.get("ins") or "auto"))
        except ValueError as e:                          # not base64, or not a score: the reason, in words
            return 400, {"error": f"this MIDI could not become a score: {e}"}

    if method == "POST" and rest == "/songs":
        style = str(data.get("style") or "").strip()
        if not style:
            return 400, {"error": "a style is needed"}
        score = None
        if data.get("midi_b64"):
            if str(data.get("abc") or "").strip():
                return 400, {"error": "a score (abc) or a MIDI file (midi_b64), not both"}
            try:
                score = midi_score.from_midi(base64.b64decode(str(data["midi_b64"]), validate=True), key=data.get("midi_key") or None,
                                             ins_line=str(data.get("midi_ins") or "auto"))
            except ValueError as e:
                return 400, {"error": f"this MIDI could not become a score: {e}"}
            data = dict(data, abc=score.pop("abc"))
        has_score = bool(str(data.get("abc") or "").strip())
        asked = str(data.get("mode") or "").lower()
        if has_score and not asked:                      # the score's own kind: chord symbols or none (a MIDI file: none)
            asked = "full" if re.search(r'"[A-G]', str(data["abc"])) else "melody"
        mode = MODES.get(asked or "direct")
        if not mode:
            return 400, {"error": "mode is direct, full or melody"}
        if has_score and mode == "off":                  # the engine would make the song and silently drop the score
            return 400, {"error": "direct makes the music without a score, and this one would be dropped: "
                                  "mode melody (a score without chord symbols) or full (with them)"}
        lyrics = INSTRUMENTAL if data.get("instrumental") else str(data.get("lyrics") or "")
        duration = data.get("duration") or (math.ceil(score["seconds"]) if score else 180)
        req = {"style": style, "lyrics": lyrics, "cot": mode, "title": str(data.get("title") or "")[:120],
               "duration": float(duration)}
        for k_in, k_out in (("music_seed", "lm_seed"), ("sound_seed", "seed")):
            if data.get(k_in) is not None:
                req[k_out] = int(data[k_in])
        # HERESY 1156 (Viktor: «Для проб стилей сто процентов 120 секунд пробы»): the music may not end before this; without
        # it the music half ends where its structure does (a «two-minute» probe of five sections came out 34–62 s)
        if data.get("min_seconds") is not None:
            req["semantic_sampling"] = {"min_tokens": int(max(0.0, min(float(data["min_seconds"]), float(duration))) * 25)}
        req["output_format"] = str(data.get("output_format") or "wav24")   # lossless, as the page asks: the Refiner and the exports want it
        for k in ("abc", "loras", "vae", "steps", "solver", "cfg_scale"):
            if data.get(k) is not None:
                req[k] = data[k]
        job = _engine("/synth", req)
        jid = job.get("id")
        if data.get("workspace") and jid is not None:
            _file_in_workspace(jid, str(data["workspace"]), ctx)
        out = {"job": jid, "poll": f"/api/v1/jobs/{jid}", "mode": asked or "direct", "duration": float(duration)}
        if score:
            out["score"] = score                         # where its key came from, the notes kept and dropped
        return 202, out

    m2 = re.match(r"^/jobs/([^/]+)(/cancel)?$", rest)
    if m2:
        jid = urllib.parse.quote(m2.group(1))
        if m2.group(2) and method == "POST":
            return 200, _engine(f"/job?id={jid}&cancel=1", {})
        if method == "GET":
            st = _engine(f"/job?id={jid}")
            if st.get("takes"):
                st["urls"] = [f"/api/v1/takes/{t}" for t in st["takes"]]
            return 200, st

    if method == "GET" and rest == "/takes":
        rows = col.catalog(outputs, cfg())["takes"]
        ws, q = query.get("workspace"), (query.get("q") or "").lower()
        rows = [r for r in rows if not r.get("hidden") and (not ws or ws in r.get("workspaces", []))
                and (not q or q in (r.get("title") or "").lower() or q in (r.get("note") or "").lower())]
        rows.sort(key=lambda r: r.get("created") or "", reverse=True)
        off, lim = int(query.get("offset") or 0), min(500, int(query.get("limit") or 50))
        return 200, {"total": len(rows), "takes": [_row(r) for r in rows[off:off + lim]]}

    m3 = re.match(r"^/takes/([^/]+)(?:/(audio|marks|reaper|artwork|derived|file|stems|debuzz|remaster|upscale|lyrics-check))?$", rest)
    if m3:
        name, what = m3.group(1), m3.group(2)
        d = outputs / name
        if "/" in name or name.startswith(".") or not (d / "meta.json").is_file():
            return 404, {"error": f"no take {name}"}
        if method == "GET" and not what:
            row = next((r for r in col.catalog(outputs, cfg())["takes"] if r["name"] == name), {})
            req = json.load(open(d / "request.json", encoding="utf-8")) if (d / "request.json").is_file() else {}
            made = {k: req.get(k) for k in ("style", "lyrics", "abc", "cot", "duration", "lm_seed", "seed", "loras", "vae", "steps", "solver")}
            art = ctx["art"]["info"](name) if ctx.get("art") else None
            return 200, dict(_row(row), request=made, audio=f"/api/v1/takes/{name}/audio",
                             artwork=f"/api/v1/takes/{name}/artwork" if art else None)
        if method == "GET" and what == "audio":
            raise Redirect("/library/audio?name=" + urllib.parse.quote(name))
        if method == "POST" and what == "marks":
            if "rating" in data:
                col.collection_post(cfg(), outputs, {"op": "rate", "names": [name], "value": int(data["rating"])})
            if "note" in data:
                col.collection_post(cfg(), outputs, {"op": "note", "names": [name], "text": str(data["note"])})
            if "favorite" in data:
                _engine("/library/update?name=" + urllib.parse.quote(name), {"favorite": bool(data["favorite"])})
            row = next((r for r in col.catalog(outputs, cfg())["takes"] if r["name"] == name), {})
            return 200, _row(row)
        if what == "artwork":                         # HERESY 1120
            if method == "GET":
                if not (d / "artwork.jpg").is_file():
                    return 404, {"error": "no artwork yet: POST to draw it"}
                raise Redirect("/lab/art?name=" + urllib.parse.quote(name))
            seed = data.get("seed")
            r = ctx["art"]["draw"](name, bool(data.get("again")), int(seed) if seed is not None else None)
            if r.get("status") == "failed":
                return 500, {"error": r.get("error", "no artwork")}
            return (202 if r.get("status") else 200), dict(r, artwork=f"/api/v1/takes/{name}/artwork")
        # HERESY 1144: the Refiner's steps; each answers 202 with its job while it runs (ask GET …/derived), or what it made
        rf = ctx.get("refine") or {}
        if method == "GET" and what == "derived":
            tree = rf["derived"](name)
            for m in tree.get("derived", []):
                for f in m.get("files", []):
                    f["url"] = f"/api/v1/takes/{name}/file?path=" + urllib.parse.quote(f.get("path", ""))
            return 200, tree
        if method == "GET" and what == "file":
            path = str(query.get("path") or "")
            if not path.startswith("derived/") or ".." in path:
                return 400, {"error": "a path in derived/ is asked"}
            raise Redirect("/library/file?name=" + urllib.parse.quote(name) + "&path=" + urllib.parse.quote(path))
        if method == "POST" and what in ("stems", "debuzz", "remaster", "upscale", "lyrics-check"):
            if what == "stems":
                r = rf["stems"](name, str(data.get("mode") or "four"), str(data.get("source") or ""))
            elif what == "debuzz":
                r = rf["debuzz"](name, str(data.get("source") or ""), data.get("strength", 0.8))
            elif what == "remaster":
                r = rf["remaster"](name, json.dumps(data))
            elif what == "upscale":
                r = rf["upscale"](name, str(data.get("mode") or "normal"), str(data.get("source") or ""),
                                  int(data.get("variants") or 2), bool(data.get("keep", True)))
            else:
                r = rf["gloss"](name, bool(data.get("again")), str(data.get("source") or ""))
            if isinstance(r, dict) and r.get("status") == "failed":
                return 500, {"error": r.get("error", what + " failed")}
            return (202 if isinstance(r, dict) and r.get("status") else 200), r
        if method == "POST" and what == "reaper":
            midi = base64.b64decode(data["midi_b64"]) if data.get("midi_b64") else None
            z, info = ctx["rpp"].build(ctx["kit"], outputs, name, midi=midi, cache=ctx["cache"])
            rel = str(z.relative_to(outputs / name))
            return 200, dict(info, path=rel, url="/library/file?name=" + urllib.parse.quote(name) + "&path=" + urllib.parse.quote(rel),
                             bytes=z.stat().st_size)

    if method == "GET" and rest == "/workspaces":
        cat = col.catalog(outputs, cfg())
        n = {}
        for r in cat["takes"]:
            for w in r.get("workspaces", []):
                n[w] = n.get(w, 0) + 1
        return 200, {"workspaces": [{"name": w, "takes": n.get(w, 0)} for w in cat["workspaces"]]}
    m4 = re.match(r"^/workspaces/(.+)$", rest)
    if m4 and method == "POST":
        ws, op = urllib.parse.unquote(m4.group(1)), data.get("op")
        names = [str(x) for x in data.get("names") or []]
        ops = {"add": "ws-add", "remove": "ws-remove", "move": "ws-move"}
        if op not in ops or not names:
            return 400, {"error": "op is add, remove or move, with names"}
        body2 = {"op": ops[op], "workspace": ws, "names": names}
        if op == "move":
            body2["from"] = str(data.get("from") or "")
        col.collection_post(cfg(), outputs, body2)
        return 200, {"ok": True}

    return 404, {"error": f"no such route: {method} /api/v{VERSION}{rest}"}
