"""HERESY 1169 · 1360 (Viktor 11.10.2026: «ПО CivitAI согласен»: an adapter whose author does not let it be shared is not in our models
repository; the user fetches it from Civitai with their own key, by a button in the room): an adapter from Civitai into
artwork/loras/FAMILY/, on the user's word, one at a time.

    look(kit, ref, key, cache)     what a link names: a model's page (its newest version), its ?modelVersionId=, a version's number,
                                   a download link, an AIR (urn:air:…:civitai:MODEL@VERSION); the model's name and type, the
                                   version's name, base model and trigger words, the file that would come (a .safetensors only) with
                                   its size and SHA-256, the family its base model suits, the adapters here that are that file
    start(kit, body, scope, done)  {ref, key, family}: the version asked again and checked (an adapter, a .safetensors, room on the
                                   disk), then in a thread the file into FAMILY/.NAME.part, its SHA-256 checked against Civitai's
                                   and its header read as a safetensors' before it becomes NAME.safetensors; the version's answer
                                   beside it as NAME.civitai.info (its name, base model and trigger words for the library) and its
                                   first picture rated safe as NAME.preview.EXT; done(rel, row) gives the lab's cache its hash
    state() · cancel()             the fetch under way or the last one

The key goes to Civitai alone, as an Authorization header: never in an address, a log, an error or a file; the download's redirect
to Civitai's storage is followed by hand, without it. Only an adapter (LORA, LoCon, DoRA) and only a .safetensors: a pickle (.ckpt,
.pt, .bin) is code, not weights, and is never taken. A test page (?scope=…) looks but fetches nothing, as the Models card."""
import hashlib, http.client, json, os, re, shutil, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

import artist_loras

API = os.environ.get("LAB_CIVITAI_API", "https://civitai.com").rstrip("/")   # a test points it at a server of its own
SITES = ("civitai.com", "civitai.green", "civitai.red")
UA = "RuachStudio (an adapter fetched on the user's word)"
TYPES = ("LORA", "LoCon", "DoRA")
PICKLE = (".ckpt", ".pt", ".pth", ".bin", ".pkl")
# Civitai's base models (its /api/v1/enums, 11.10.2026) by the family whose painters take them: Qwen is Qwen-Image's own (2509, 2512)
BASES = {"qwen-image-2512": ("Qwen",), "qwen-image-2.1": ("Qwen 2.1",)}   # HERESY 1405: SDXL gone; 1800: Krea 2 (gone since 1428) too
ROOM = 256 * 2 ** 20                                   # what the disk keeps free beyond the file
LOCK = threading.Lock()
JOB = {}


class Missing(RuntimeError):
    """Civitai does not know what was asked (HTTP 404)."""


class _Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None                                    # each redirect followed by hand: the key stays with Civitai


OPENER = urllib.request.build_opener(_Stay)


def _host(url):
    return (urllib.parse.urlsplit(url).hostname or "").lower()


def _ours(url):
    """True for Civitai's own address (the API's host or below it): the only one the key is sent to."""
    h, a = _host(url), _host(API)
    return bool(h) and (h == a or h.endswith("." + a))


def _open(url, key, timeout=30, accept="application/json"):
    for _ in range(6):
        headers = {"User-Agent": UA, "Accept": accept}
        if key and _ours(url):
            headers["Authorization"] = "Bearer " + key
        try:
            return OPENER.open(urllib.request.Request(url, headers=headers), timeout=timeout)
        except urllib.error.HTTPError as e:
            where = e.headers.get("Location") if e.code in (301, 302, 303, 307, 308) else None
            if not where:
                raise
            e.close()
            url = urllib.parse.urljoin(url, where)
    raise RuntimeError("Civitai sent the request round too many times")


def _why(e, what):
    """What went wrong, said without the key."""
    if isinstance(e, urllib.error.HTTPError):
        if e.code in (401, 403):
            return (f"Civitai gives {what} only with an API key that may have it (HTTP {e.code}): put your own key in "
                    "(civitai.com → Account settings → API Keys)")
        if e.code == 404:
            return f"Civitai does not know {what}"
        if e.code == 429:
            return "Civitai asks to wait: too many requests for now"
        return f"Civitai answered HTTP {e.code} for {what}"
    if isinstance(e, ValueError):
        return f"Civitai's answer for {what} could not be read"
    return f"Civitai could not be reached: {getattr(e, 'reason', None) or e.__class__.__name__}"


def _json(path, key, what):
    try:
        with _open(API + path, key) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise Missing(_why(e, what)) from None
        raise RuntimeError(_why(e, what)) from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise RuntimeError(_why(e, what)) from None


def parse(ref):
    """(model, version) a link names, either None when it does not say; ValueError when it names neither."""
    s = str(ref or "").strip()
    if not s:
        raise ValueError("paste a link to the adapter's page on Civitai, or its version's number")
    if re.fullmatch(r"\d{1,10}", s):
        return None, int(s)
    m = re.fullmatch(r"urn:air:[\w.-]+:[\w.-]+:civitai:(\d{1,10})@(\d{1,10})", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    u = urllib.parse.urlsplit(s if "://" in s else "https://" + s)
    h = (u.hostname or "").lower()
    if not any(h == x or h.endswith("." + x) for x in SITES):
        raise ValueError("a link to Civitai (civitai.com/models/…), or a version's number")
    vid = (urllib.parse.parse_qs(u.query).get("modelVersionId") or [""])[0]
    m = re.match(r"/(?:api/download/models|api/v1/model-versions)/(\d{1,10})", u.path)
    if m:
        vid = m.group(1)
    m = re.match(r"/models/(\d{1,10})", u.path)
    mid = int(m.group(1)) if m else None
    if vid.isdigit():
        return mid, int(vid)
    if mid:
        return mid, None
    raise ValueError("this link names no model and no version on Civitai")


def version(ref, key):
    """The version's own answer (Civitai's /api/v1/model-versions/ID), the newest when only the model is named."""
    mid, vid = parse(ref)
    if vid is None:
        m = _json(f"/api/v1/models/{mid}", key, "this model")
        vs = [v for v in (m.get("modelVersions") or []) if isinstance(v, dict) and v.get("id")]
        if not vs:
            raise RuntimeError("this model has no version to fetch")
        vid = vs[0]["id"]
    try:
        v = _json(f"/api/v1/model-versions/{int(vid)}", key, "this version")
    except Missing:
        if mid is not None:
            raise
        m = _json(f"/api/v1/models/{int(vid)}", key, "a model or a version of this number")   # a bare number: a model's, then
        vs = [x for x in (m.get("modelVersions") or []) if isinstance(x, dict) and x.get("id")]
        if not vs:
            raise RuntimeError("this model has no version to fetch") from None
        v = _json(f"/api/v1/model-versions/{int(vs[0]['id'])}", key, "this version")
    if not isinstance(v, dict) or not v.get("id"):
        raise RuntimeError("Civitai's answer names no version")
    return v


def pick(v):
    """The file that would come: a .safetensors (the model's own before a pruned one, the primary first)."""
    files = [f for f in (v.get("files") or []) if isinstance(f, dict)]
    safe = [f for f in files if str(f.get("name") or "").lower().endswith(".safetensors")]
    if not safe:
        if any(str(f.get("name") or "").lower().endswith(PICKLE) for f in files):
            raise ValueError("this version comes only as a pickle (.ckpt, .pt, .bin): that is code, not weights, and the studio never takes it")
        raise ValueError("this version has no .safetensors file")
    safe.sort(key=lambda f: (f.get("type") not in (None, "Model"), not f.get("primary")))
    return safe[0]


def clean(name):
    """A file name as it may lie in a folder: no path, no leading dot, no character a file system minds; .safetensors kept."""
    stem = Path(str(name or "")).name
    stem = stem[:-len(".safetensors")] if stem.lower().endswith(".safetensors") else stem
    stem = re.sub(r"[\x00-\x1f/\\:*?\"<>|]+", "_", stem).strip(" .") or "adapter"
    return stem[:150] + ".safetensors"


def family_of(base):
    return next((fam for fam, bases in BASES.items() if base in bases), None)


def _sha(f):
    s = str((f.get("hashes") or {}).get("SHA256") or "").lower()
    return s if re.fullmatch(r"[0-9a-f]{64}", s) else ""


def look(kit, ref, key, cache=None):
    v = version(ref, key)
    model = v.get("model") or {}
    typ = str(model.get("type") or "")
    f = pick(v)
    sha = _sha(f)
    base = str(v.get("baseModel") or "")
    here = sorted(rel for rel, c in (cache or {}).items()
                  if sha and isinstance(c, dict) and c.get("sha256") == sha and (artist_loras.root(kit) / rel).is_file())
    return {"model": v.get("modelId"), "version": v.get("id"), "title": str(model.get("name") or ""), "name": str(v.get("name") or ""),
            "type": typ, "adapter": typ in TYPES, "base": base, "family": family_of(base), "words": artist_loras._words(v.get("trainedWords")),
            "file": clean(f.get("name")), "bytes": int(round(float(f.get("sizeKB") or 0) * 1024)), "sha256": sha, "nsfw": bool(model.get("nsfw")),
            "url": f"https://civitai.com/models/{v.get('modelId')}?modelVersionId={v.get('id')}", "here": here}


def state():
    with LOCK:
        j = {k: v for k, v in JOB.items() if not k.startswith("_")}
    if j.get("size"):
        j["pct"] = round(100.0 * j.get("got", 0) / j["size"], 1)
    return j or {"status": "idle"}


def cancel():
    with LOCK:
        if JOB.get("status") in ("starting", "running"):
            JOB["_stop"] = True
    return state()


def start(kit, body, scope="", done=None):
    if scope:
        raise ValueError("a test page fetches nothing: open the studio without ?scope= to fetch")
    body = body if isinstance(body, dict) else {}
    family = str(body.get("family") or "")
    if family not in artist_loras.FAMILIES:
        raise ValueError("into which family: " + ", ".join(artist_loras.FAMILIES))
    key = str(body.get("key") or "").strip() or os.environ.get("CIVITAI_API_KEY", "").strip()
    with LOCK:
        if JOB.get("status") in ("starting", "running"):
            raise ValueError(f"a fetch from Civitai is under way ({JOB.get('file')}): one at a time")
        JOB.clear()
        JOB.update(status="starting", file="", family=family, got=0, size=None, started=time.time(), ended=None, error=None, id=None)
    try:
        v = version(body.get("ref"), key)
        typ = str((v.get("model") or {}).get("type") or "")
        if typ not in TYPES:
            raise ValueError(f"this is a {typ or 'model of no type'} on Civitai, not an adapter (LORA, LoCon, DoRA)")
        f = pick(v)
        folder = artist_loras.root(kit) / family
        dest = folder / clean(f.get("name"))
        size = int(round(float(f.get("sizeKB") or 0) * 1024)) or None
        sha = _sha(f)
        if dest.exists():
            if sha and dest.stat().st_size == (size or -1) and _hash(dest) == sha:   # this very file, here already
                rel = dest.relative_to(artist_loras.root(kit)).as_posix()
                with LOCK:
                    JOB.update(status="done", file=dest.name, id=rel, here=True, size=size, got=size or 0, ended=time.time())
                return state()
            dest = folder / (dest.name[:-len(".safetensors")] + f".v{v['id']}.safetensors")
            if dest.exists():
                raise ValueError(f"{dest.name} is there already: rename or remove it first")
        folder.mkdir(parents=True, exist_ok=True)
        if size and shutil.disk_usage(folder).free < size + ROOM:
            raise ValueError(f"not room enough on the disk for {size / 2 ** 20:.0f} MB")
    except Exception as e:
        with LOCK:
            JOB.update(status="failed", error=str(e), ended=time.time())
        raise
    with LOCK:
        JOB.update(file=dest.name, size=size)
    threading.Thread(target=_run, args=(kit, v, f, dest, key, sha, size, done), daemon=True).start()
    return state()


def _hash(p):
    m = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(8 * 2 ** 20), b""):
            m.update(chunk)
    return m.hexdigest()


def _picture(dest, v):
    """The version's first picture rated safe (Civitai's nsfwLevel 1) as NAME.preview.EXT, never another."""
    for im in v.get("images") or []:
        if not isinstance(im, dict) or im.get("type", "image") != "image" or int(im.get("nsfwLevel") or 99) > 1 or not im.get("url"):
            continue
        try:
            with _open(str(im["url"]), None, timeout=30, accept="image/*") as r:
                ctype, data = r.headers.get("Content-Type", ""), r.read(12 * 2 ** 20 + 1)
        except (urllib.error.URLError, TimeoutError, OSError):
            return
        ext = {"image/png": ".png", "image/webp": ".webp", "image/jpeg": ".jpeg"}.get(ctype.split(";")[0].strip())
        if ext and len(data) <= 12 * 2 ** 20:
            (dest.parent / (dest.name[:-len(".safetensors")] + ".preview" + ext)).write_bytes(data)
        return


def _run(kit, v, f, dest, key, sha, size, done):
    part = dest.with_name("." + dest.name + ".part")
    url = str(f.get("downloadUrl") or "")
    if not _ours(url):
        url = f"{API}/api/download/models/{int(v['id'])}"
    try:
        m, got = hashlib.sha256(), 0
        try:
            r = _open(url, key, timeout=60, accept="*/*")
        except urllib.error.HTTPError as e:
            raise RuntimeError(_why(e, "this file")) from None
        with r:
            if r.headers.get("Content-Type", "").split(";")[0].strip() in ("text/html", "application/json"):
                raise RuntimeError("Civitai sent a page, not the file: this adapter wants your API key (civitai.com → Account settings → API Keys)")
            total = int(r.headers.get("Content-Length") or 0) or size
            with LOCK:
                JOB.update(status="running", size=total)
            read = getattr(r, "read1", r.read)
            with open(part, "wb") as out:
                while True:
                    with LOCK:
                        stop = JOB.get("_stop")
                    if stop:
                        raise InterruptedError("stopped")
                    chunk = read(2 ** 20)                # what has come, not a whole megabyte: the count and Stop at once
                    if not chunk:
                        break
                    out.write(chunk)
                    m.update(chunk)
                    got += len(chunk)
                    if total and got > total + 2 ** 20:
                        raise RuntimeError("more came than Civitai said this file is: stopped")
                    with LOCK:
                        JOB["got"] = got
        if total and got < total:
            raise RuntimeError(f"the download was cut short at {got / 2 ** 20:.0f} of {total / 2 ** 20:.0f} MB: try again")
        if sha and m.hexdigest() != sha:
            raise RuntimeError("the file came, but its SHA-256 is not the one Civitai gives for it: thrown away")
        if not artist_loras.tensors(part):
            raise RuntimeError("the file came, but it is not a safetensors adapter: thrown away")
        os.replace(part, dest)
        with open(dest.parent / (dest.name[:-len(".safetensors")] + ".civitai.info"), "w", encoding="utf-8") as fh:
            json.dump(v, fh, ensure_ascii=False, indent=1)
        _picture(dest, v)
        rel = dest.relative_to(artist_loras.root(kit)).as_posix()
        st = dest.stat()
        if done:
            done(rel, {"size": st.st_size, "mtime": int(st.st_mtime), "sha256": m.hexdigest(), "civitai": "found"})
        with LOCK:
            JOB.update(status="done", id=rel, got=got, ended=time.time())
    except InterruptedError:
        with LOCK:
            JOB.update(status="stopped", ended=time.time())
    except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as e:   # the network's, mid-file
        with LOCK:
            JOB.update(status="failed", error=_why(e, "this file") + ": try again", ended=time.time())
    except (RuntimeError, ValueError) as e:
        with LOCK:
            JOB.update(status="failed", error=str(e), ended=time.time())
    except OSError as e:                                 # the disk's
        with LOCK:
            JOB.update(status="failed", error=f"the file could not be written here: {e.strerror or e}", ended=time.time())
    finally:
        try:
            part.unlink()
        except OSError:
            pass
