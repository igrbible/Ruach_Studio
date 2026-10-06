"""HERESY 1166: the 💎 workspaces from Hugging Face (Viktor 03.10.2026: a 💎 first in a workspace's name = approved and
published; 04.10.2026: «Воркспейсы с 💎 — именно эти идут в соответствующие репозитории. И допиши код подтягивания этих
воркспейсов из репо, по запросу пользователя, и если такой существует, спрашивать о восстановлении оригинальной копией,
и краткий быстрый гайд в попап оверлее… хотите сохранить это — сначала переименуйте воркспейс, а затем мы воссоздадим
запрошенное пространство из HF репозитория… Вдруг чел туда своего напишет, а мы перезатрём всё»).

A published workspace is a folder of the studio's Storage Bucket on Hugging Face (Viktor 04.10.2026: «Упаковывай
воркспейсы 💎 в goldhub/Ruach_Studio_Instruments_Probe_WS бакет»): each take as MP3 320k with its cover, and workspace.json
(heresy/tools/workspace_export.py writes it): the takes in order with their titles, notes and sections, the meta and the
request of each (seeds, settings, music codes). Fetched only on the user's word: the files into tmp/diamond/ first, then
each take into outputs/ (audio.mp3, the cover, request.json, meta.json last: the library sees a take only when it is
whole) and the workspace into the Collection, locked against deletion. A take already in outputs/ keeps its files.

A workspace of that name already here is never written over unasked: the answer is 409 and the page asks, saying how to
keep it (rename it first, then fetch: the original comes in beside it). Restoring puts the published copy back: the
takes it lacks come again, titles and notes return to the published ones, the workspace holds the published takes again
(what was added leaves it and stays in the library; sections of its own stay), and it is locked.

    GET  /collection/diamonds[?refresh=1]       the sets: where each is published, its takes and bytes, here or not, a job
    POST /collection/diamonds {name, restore}   fetch one; 409 while a workspace of that name is here and restore is false
"""
import json, os, re, shutil, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

import collection

# where the 💎 workspaces are published: one Storage Bucket, a folder each. heresy/tools/publish-workspaces.sh reads this
# list too, so the studio fetches from where the tool puts. A bucket is read over plain HTTPS: its files from
# /buckets/…/resolve/… (a redirect to the bytes); the studio's huggingface_hub (pinned 0.36) knows no buckets.
HUB = "https://huggingface.co"
BUCKET = "goldhub/Ruach_Studio_Instruments_Probe_WS"
SOURCES = [
    {"name": "💎 Instrumental Probe LoRA", "folder": "instrumental-probe-lora"},
    {"name": "💎 Instrumental Probe", "folder": "instrumental-probe"},
    {"name": "💎 Musical Styles", "folder": "musical-styles"},
    {"name": "💎 Voice Types", "folder": "voice-types"},
    {"name": "💎 Voice Types LoRA", "folder": "voice-types-lora"},   # HERESY 1167: the six voice adapters sung (Viktor 06.10)
]
MANIFEST = "workspace.json"
FORMAT = "ruach-workspace 1"
JOBS = {}
LOCK = threading.Lock()
CACHE = {}                                       # name -> (when, manifest or None, the hub's words when it failed)
TTL = 300
SAFE_NAME = re.compile(r"[0-9A-Za-z][0-9A-Za-z._-]{0,200}")
SAFE_FILE = re.compile(r"[0-9A-Za-z][0-9A-Za-z._ -]{0,200}\.(mp3|jpg|jpeg|png|webp)")


def _slug(name):
    return re.sub(r"[^0-9A-Za-z]+", "-", name).strip("-").lower() or "set"


def _url(src):
    return f"{HUB}/buckets/{BUCKET}/tree/{urllib.parse.quote(src['folder'])}"


def _token():
    """The owner's token while the repos are private: HF_TOKEN, HF_HOME's token, then the default place; none once they
    are public (never shown, never written anywhere)."""
    if os.environ.get("HF_TOKEN"):
        return os.environ["HF_TOKEN"]
    places = ([Path(os.environ["HF_HOME"]) / "token"] if os.environ.get("HF_HOME") else []) + [Path.home() / ".cache" / "huggingface" / "token"]
    for p in places:
        if p.is_file():
            t = p.read_text(encoding="utf-8").strip()
            if t:
                return t
    return None


class _TokenToTheHubOnly(urllib.request.HTTPRedirectHandler):
    """A file's bytes come from a signed address on another host: the token goes to the Hub only."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and urllib.parse.urlparse(newurl).hostname != urllib.parse.urlparse(HUB).hostname:
            new.remove_header("Authorization")
        return new


def _get(path, dest=None):
    """One file of the bucket: its bytes, or written into dest (by parts, whole or not at all)."""
    req = urllib.request.Request(f"{HUB}/buckets/{BUCKET}/resolve/{urllib.parse.quote(path, safe='')}",
                                 headers={"User-Agent": "RuachStudio (the diamond sets; a header carries latin-1 only)"})
    token = _token()
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.build_opener(_TokenToTheHubOnly).open(req, timeout=120) as r:
        if dest is None:
            return r.read()
        part = Path(str(dest) + ".part")
        with open(part, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        os.replace(part, dest)
        return dest


def _say(e):
    """The hub's failure in words (never an empty list: «not published» and «no answer» are not the same)."""
    first = (str(getattr(e, "reason", "") or e).strip().splitlines() or [""])[0][:220]
    if isinstance(e, urllib.error.HTTPError):
        if e.code == 404:
            return "not in the bucket yet: no " + MANIFEST
        if e.code in (401, 403):
            return "the bucket is not open to this studio (private: the owner's token is needed)"
        return f"Hugging Face answered {e.code}: {first}"
    if isinstance(e, (urllib.error.URLError, TimeoutError)):
        return "Hugging Face does not answer: " + first
    return type(e).__name__ + ": " + first


def _manifest(kit, src, refresh=False):
    hit = CACHE.get(src["name"])
    if hit and not refresh and time.time() - hit[0] < TTL:
        return hit[1], hit[2]
    try:
        m = json.loads(_get(src["folder"] + "/" + MANIFEST).decode("utf-8"))
        if m.get("format") != FORMAT:
            raise ValueError(f"{MANIFEST} is {m.get('format')!r}, this studio reads {FORMAT!r}")
        if m.get("workspace") != src["name"]:
            raise ValueError(f"{MANIFEST} holds {m.get('workspace')!r}, not {src['name']!r}")
        out = (m, "")
    except Exception as e:                       # noqa: BLE001: whatever the hub says, it is said, not swallowed
        out = (None, _say(e))
    CACHE[src["name"]] = (time.time(),) + out
    return out


def _here(d, outputs, name):
    return {n for w in collection.family(d, name) for n in d["workspaces"].get(w, []) if (outputs / n / "meta.json").is_file()}


def listing(kit, outputs, config_dir, refresh=False):
    d = collection.load(config_dir)
    got = {}
    threads = [threading.Thread(target=lambda s=s: got.__setitem__(s["name"], _manifest(kit, s, refresh)), daemon=True) for s in SOURCES]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    sets = []
    for s in SOURCES:
        m, err = got.get(s["name"], (None, "Hugging Face did not answer in 30 s"))
        here = s["name"] in d["workspaces"]
        item = {"name": s["name"], "repo": BUCKET + "/" + s["folder"], "type": "bucket", "url": _url(s), "here": here,
                "here_takes": len(_here(d, outputs, s["name"])) if here else 0, "published": bool(m), "error": err}
        if m:
            takes = m.get("takes") or []
            item.update(takes=len(takes), bytes=sum(int(t.get("bytes") or 0) for t in takes), date=m.get("published", ""),
                        missing=sum(1 for t in takes if not (outputs / str(t.get("name")) / "meta.json").is_file()))
        job = JOBS.get(s["name"])
        if job:
            item["job"] = {k: job.get(k) for k in ("status", "restore", "done", "total", "got", "bytes", "made", "titles", "error")}
        sets.append(item)
    return {"sets": sets}


def fetch(kit, outputs, config_dir, name, restore):
    """(code, body): 202 and the listing when it starts; 409 when a workspace of that name is here and restore is not asked."""
    src = next((s for s in SOURCES if s["name"] == name), None)
    if not src:
        return 400, {"error": f"no published workspace named {name}"}
    if JOBS.get(name, {}).get("status") == "running":
        return 202, listing(kit, outputs, config_dir)
    d = collection.load(config_dir)
    if name in d["workspaces"] and not restore:
        return 409, {"error": "exists", "name": name, "here_takes": len(_here(d, outputs, name))}
    m, err = _manifest(kit, src, refresh=True)
    if not m:
        return 502, {"error": err}
    with LOCK:
        if JOBS.get(name, {}).get("status") == "running":
            return 202, listing(kit, outputs, config_dir)
        JOBS[name] = {"status": "running", "restore": bool(restore), "started": time.time(), "done": 0, "total": 0, "got": 0, "bytes": 0}
    threading.Thread(target=_run, args=(kit, outputs, config_dir, src, m, bool(restore)), daemon=True).start()
    return 202, listing(kit, outputs, config_dir)


def _write_json(path, value):
    tmp = Path(str(path) + ".part")
    json.dump(value, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _run(kit, outputs, config_dir, src, m, restore):
    name, job = src["name"], JOBS[src["name"]]
    stage = kit / "tmp" / "diamond" / _slug(name)
    try:
        takes = []
        for t in m.get("takes") or []:
            n, audio, cover = str(t.get("name") or ""), str(t.get("audio") or ""), t.get("cover")
            if not SAFE_NAME.fullmatch(n) or ".." in n or not SAFE_FILE.fullmatch(audio) or (cover and not SAFE_FILE.fullmatch(str(cover))):
                raise ValueError(f"{MANIFEST} names a take or a file this studio will not write: {n!r}")
            takes.append(t)
        need = [t for t in takes if not (outputs / t["name"] / "meta.json").is_file()]
        fresh = {t["name"] for t in need}
        files = [t[k] for t in need for k in ("audio", "cover") if t.get(k)]
        job.update(total=len(files), bytes=sum(int(t.get("bytes") or 0) for t in need))
        if files:
            (stage / src["folder"]).mkdir(parents=True, exist_ok=True)
            for f in files:
                p = _get(src["folder"] + "/" + f, stage / src["folder"] / f)
                job["done"] += 1
                job["got"] += os.path.getsize(p)
        made = 0
        for t in need:
            dst, got = outputs / t["name"], stage / src["folder"]
            dst.mkdir(parents=True, exist_ok=True)
            shutil.move(str(got / t["audio"]), str(dst / "audio.mp3"))
            if t.get("cover"):
                shutil.move(str(got / t["cover"]), str(dst / "artwork.jpg"))
            if t.get("artwork"):
                _write_json(dst / "artwork.json", t["artwork"])
            _write_json(dst / "request.json", t.get("request") or {})
            meta = dict(t.get("meta") or {})
            meta.update(title=t.get("title") or meta.get("title") or t["name"], format="mp3")
            meta.setdefault("created", int(time.time()))
            _write_json(dst / "meta.json", meta)            # last: the library lists a take only once it is whole
            made += 1
        titles = 0
        if restore:                                         # the takes that were here: their published titles again
            import api                                      # the engine keeps meta.json; its own call writes it
            for t in takes:
                if t["name"] in fresh or not t.get("title"):
                    continue
                cur = json.load(open(outputs / t["name"] / "meta.json", encoding="utf-8")).get("title")
                if cur != t["title"]:
                    api._engine("/library/update?name=" + urllib.parse.quote(t["name"]), {"title": t["title"]})
                    titles += 1
        with collection.LOCK:
            d = collection.load(config_dir)
            places = {name: []}
            for t in takes:
                sec = str(t.get("section") or "")
                w = collection.ws_name(name + collection.SEP + sec) if sec else name
                places.setdefault(w, []).append(t["name"])
            for w, names in places.items():
                d["workspaces"][w] = sorted(set(names))     # the published takes; what was added leaves (it stays in the library)
            for t in takes:
                if t.get("note"):
                    d["notes"][t["name"]] = str(t["note"])[:4000]
                elif restore:
                    d["notes"].pop(t["name"], None)
            d["locks"].setdefault(name, {})["workspace"] = True
            collection.prune_pins(d)
            collection.save(config_dir, d)
        job.update(status="done", made=made, titles=titles, finished=time.time())
    except Exception as e:                                  # noqa: BLE001: said on the page, in the hub's own words
        job.update(status="failed", error=_say(e) if isinstance(e, (urllib.error.URLError, TimeoutError)) else str(e)[:300])
