"""HERESY 2097 (Viktor 05.11.2026: «Перенеси настройки все прямо в Движок по всем опциям выбора LLM хостов, а в писателе только динамично выводим то,
что доступно. И API OpenRouter давай всё же сохранять не в сессии браузера, а в файле пользовательских настроек Движка. И по подключениям к vLLM/
Ollama / LM Studio / Local Qwopus 9B / OpenRouter в движке предусмотри чекбоксы по активации соединений… будут опрашиваться и работать только те, что
отмечены галочкой как активные»): the Writer's hosts, all of them in Engine → Writer and Artwork.

Five connections, each with its Active switch: the Studio's own writer (writer_llm.py behind /llm/v1), vLLM, LM Studio and Ollama (each its own address;
the browser asks them itself as before, through /relay when the page came over https) and OpenRouter (through this lab, which adds the key). The page asks
only the active ones; here OpenRouter's two routes refuse while it is not active, and its chat without a key, before anything leaves the machine.

  user/llm.json      {"format", "saved_at", "hosts": {"own": {active}, "vllm"|"lmstudio"|"ollama": {active, url}, "openrouter": {active, model}}};
                     a page opened with ?scope=NAME keeps llm-NAME.json. Without the file the hosts are the defaults: each server at its own port and
                     not active, the Studio's own writer active where its weights and llama-server are here, OpenRouter active once a key is kept. An
                     address left empty is the server's default; a model left empty is DEFAULT_MODEL.
  user/secrets.json  the OpenRouter key alone, mode 600 (secrets-NAME.json for a scope). Never served: a read says whether a key is kept and its last
                     four characters. Never logged, never in the backups' snapshots (backups.py keeps llm.json, never this), never in the release
                     (its user/ ships empty).

    state(folder, scope, own) → what the page reads (own: writer_llm.status, the Studio's own writer as the lab knows it, nothing asked of it)
    put(folder, scope, data, own) → the state after {"hosts": {id: {…}}}, or after {"migrate": {id: {…}}}, written only while no file is there
    set_key(folder, scope, key, own) → the state; "" forgets the key
    models(folder, scope) → (status, body): OpenRouter's public list of models, kept an hour
    chat(folder, scope, body) → (status, bytes): a chat completion through OpenRouter, the key added here; answered whole (stream off)
Standard library only: the suite's mock loads this file by itself, OPENROUTER pointed at its own stand-in."""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

FORMAT = "ruach.llm/1"
IDS = ("own", "vllm", "lmstudio", "ollama", "openrouter")
SERVERS = ("vllm", "lmstudio", "ollama")
DEFAULT_URL = {"vllm": "http://127.0.0.1:8000/v1", "lmstudio": "http://127.0.0.1:1234/v1", "ollama": "http://127.0.0.1:11434/v1"}
DEFAULT_MODEL = "deepseek/deepseek-v4-pro"
OPENROUTER = os.environ.get("RUACH_OPENROUTER") or "https://openrouter.ai/api/v1"
# a thinking model's long answer comes back whole: the engine waits 900 s on a POST to /lab/, so the lab gives up first and says why
TIMEOUT_S = 870
LIST_S = 3600
OFF = "OpenRouter is not active: tick it under Engine → Writer and Artwork"
NO_KEY = "No OpenRouter key is kept: put it in under Engine → Writer and Artwork"
LOCK, LIST_LOCK = threading.Lock(), threading.Lock()
LIST = {"at": 0.0, "data": None, "src": ""}
_SCOPE = re.compile(r"[A-Za-z0-9_-]{0,32}")
_KEY = re.compile(r"[\x21-\x7e]{8,256}")              # one word of printable ASCII: an OpenRouter key is sk-or-v1-… and 64 hex
_URL = re.compile(r"[^\s\x00-\x1f\x7f]{0,300}")
_MODEL = re.compile(r"[\x21-\x7e]{1,200}")            # provider/model, its variant after a colon (…:free)


def _say(text):
    print(f"{time.strftime('%H:%M:%S')} [lab] llm: {text}", file=sys.stderr, flush=True)


def _file(folder, stem, scope):
    scope = str(scope or "").strip()
    if not _SCOPE.fullmatch(scope):
        raise ValueError("bad scope")
    return Path(folder) / (f"{stem}-{scope}.json" if scope else f"{stem}.json")


def _read(p):
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else None
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        _say(f"{Path(p).name} does not read ({type(e).__name__}): the defaults stand until the next change writes it whole")
        return None


def _write(p, d, private=False):
    """whole and on the disk before it takes the file's place; a secret's file is the user's alone (600) from its first byte"""
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o666)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    if private:
        os.chmod(tmp, 0o600)                            # a .part an earlier write left kept its own mode: O_CREAT's applies to a new file only
    os.replace(tmp, p)


def _clean(i, x, strict=True):
    """one host's fields as given: active (true or false), url (the three servers), model (OpenRouter); a field of another kind refused"""
    if not isinstance(x, dict):
        raise ValueError(f"{i}: expected an object of its fields")
    out = {}
    for k, v in x.items():
        if k == "active" and isinstance(v, bool):
            out[k] = v
        elif k == "url" and i in SERVERS and isinstance(v, str) and _URL.fullmatch(v.strip()):
            out[k] = v.strip()
        elif k == "model" and i == "openrouter" and isinstance(v, str) and (not v.strip() or _MODEL.fullmatch(v.strip())):
            out[k] = v.strip()
        elif strict:
            raise ValueError(f"{i}: {k} is not one of its fields, or not as it must be (active: true or false; url: an address of up to 300 characters "
                             "without spaces; model: provider/model)")
    return out


def _ready(own):
    own = own or {}
    return bool(own.get("here")) and bool(own.get("server"))


def _key(folder, scope):
    k = (_read(_file(folder, "secrets", scope)) or {}).get("openrouter_key")
    return k if isinstance(k, str) and _KEY.fullmatch(k) else ""


def _hosts(folder, scope, own_ready, key_set):
    p = _file(folder, "llm", scope)
    h = {"own": {"active": bool(own_ready)}}
    for i in SERVERS:
        h[i] = {"active": False, "url": ""}
    h["openrouter"] = {"active": bool(key_set), "model": ""}
    d = _read(p)
    if d and isinstance(d.get("hosts"), dict):
        for i in IDS:
            try:
                h[i].update(_clean(i, d["hosts"].get(i) or {}, strict=False))
            except ValueError:
                pass                                        # a host the file holds wrong: its defaults
    return h, p.exists()


def state(folder, scope="", own=None):
    key = _key(folder, scope)
    h, exists = _hosts(folder, scope, _ready(own), bool(key))
    return {"hosts": h, "exists": exists, "defaults": dict(DEFAULT_URL), "default_model": DEFAULT_MODEL,
            "openrouter": {"key_set": bool(key), "key_tail": key[-4:] if key else ""}, "own": own or {}}


def put(folder, scope, data, own=None):
    if not isinstance(data, dict) or ("hosts" in data) == ("migrate" in data):
        raise ValueError("expected {hosts: {own|vllm|lmstudio|ollama|openrouter: {active, url, model}}} or {migrate: {…}}")
    mig = "migrate" in data
    patch = data["migrate" if mig else "hosts"]
    if not isinstance(patch, dict) or not all(i in IDS for i in patch):
        raise ValueError("the hosts are own, vllm, lmstudio, ollama and openrouter")
    clean = {i: _clean(i, x) for i, x in patch.items()}
    with LOCK:
        p = _file(folder, "llm", scope)
        if mig and p.exists():                              # another page moved its browser's hosts first: they stand
            return dict(state(folder, scope, own), migrated=False)
        h, _ = _hosts(folder, scope, _ready(own), bool(_key(folder, scope)))
        for i, c in clean.items():
            h[i].update(c)
        _write(p, {"format": FORMAT, "saved_at": round(time.time(), 3), "hosts": h})
    if mig:
        _say("the Writer's hosts moved from a browser: " + ", ".join(f"{i} {'on' if c.get('active') else 'off'}" for i, c in clean.items())
             + (f" (scope {scope})" if scope else ""))
    out = state(folder, scope, own)
    if mig:
        out["migrated"] = True
    return out


def set_key(folder, scope, key, own=None):
    if not isinstance(key, str):
        raise ValueError("the key is a text")
    key = key.strip()
    if key and not _KEY.fullmatch(key):
        raise ValueError("an OpenRouter key is one word of 8 to 256 characters, without spaces")
    p = _file(folder, "secrets", scope)
    with LOCK:
        d = _read(p) or {}
        if key:
            d["openrouter_key"] = key
        else:
            d.pop("openrouter_key", None)
        if d:
            _write(p, d, private=True)
        elif p.exists():
            p.unlink()
    _say("the OpenRouter key " + ("kept" if key else "forgotten") + (f" (scope {scope})" if scope else ""))
    return state(folder, scope, own)


def _active(folder, scope):
    key = _key(folder, scope)
    return _hosts(folder, scope, False, bool(key))[0]["openrouter"]["active"], key


def _why(e):
    r = getattr(e, "reason", None)
    return str(r if r is not None else e)[:200]


def models(folder, scope=""):
    """OpenRouter's public list (no key asked), only the fields the Writer shows: the name, the price in and out, the context"""
    on, _ = _active(folder, scope)
    if not on:
        return 400, {"error": OFF, "setup": True}
    with LIST_LOCK:
        now = time.time()
        if LIST["data"] is not None and LIST["src"] == OPENROUTER and now - LIST["at"] < LIST_S:
            return 200, {"data": LIST["data"], "age_s": round(now - LIST["at"])}
        try:
            req = urllib.request.Request(OPENROUTER + "/models", headers={"Accept": "application/json", "X-Title": "Ruach Studio"})
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
        except (OSError, ValueError) as e:
            if LIST["data"] is not None and LIST["src"] == OPENROUTER:
                return 200, {"data": LIST["data"], "age_s": round(now - LIST["at"]), "stale": True}
            return 502, {"error": f"OpenRouter's list did not come: {_why(e)}"}
        out = []
        for m in (d.get("data") if isinstance(d, dict) else None) or []:
            if not isinstance(m, dict) or not isinstance(m.get("id"), str):
                continue
            p = m.get("pricing") if isinstance(m.get("pricing"), dict) else {}
            out.append({"id": m["id"], "name": str(m.get("name") or ""), "pricing": {"prompt": str(p.get("prompt", "")), "completion": str(p.get("completion", ""))},
                        "context_length": m.get("context_length") if isinstance(m.get("context_length"), (int, float)) else None})
        LIST.update(at=now, data=out, src=OPENROUTER)
        return 200, {"data": out, "age_s": 0}


def _json(d):
    return json.dumps(d, ensure_ascii=False).encode("utf-8")


def chat(folder, scope, body):
    on, key = _active(folder, scope)
    if not on:
        return 400, _json({"error": OFF, "setup": True})
    if not key:
        return 400, _json({"error": NO_KEY, "setup": True})
    try:
        data = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return 400, _json({"error": "a chat completion is JSON"})
    if not isinstance(data, dict) or not isinstance(data.get("model"), str) or not data["model"].strip() or not isinstance(data.get("messages"), list):
        return 400, _json({"error": "a chat completion names its model and its messages"})
    data["stream"] = False
    model = data["model"].strip()[:120]
    req = urllib.request.Request(OPENROUTER + "/chat/completions", data=_json(data),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key, "X-Title": "Ruach Studio"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            code, out = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, out = e.code, e.read()
    except (OSError, ValueError) as e:
        _say(f"OpenRouter, {model}: no answer after {time.time() - t0:.1f} s ({_why(e)})")
        return 502, _json({"error": f"OpenRouter did not answer: {_why(e)}"})
    n = None
    try:
        n = (json.loads(out).get("usage") or {}).get("completion_tokens")
    except (ValueError, AttributeError):
        pass
    _say(f"OpenRouter, {model}: {code} in {time.time() - t0:.1f} s" + (f", {n} tokens" if n else ""))
    return code, out
