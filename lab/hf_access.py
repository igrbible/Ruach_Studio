"""The one-time Hugging Face token and the gates, for Engine → Models (night 11→12.11.2026, lane models-safety).

Viktor 11.11.2026: «предлагаем им кнопку скачать, ввести их HF токен без сохранения как одноразовый ввод в поле, и если модель
потребует гейта, объясняем, что нужно идти по этой-то ссылке, согласиться с условиями и подождать… Стрессуем, что наша Руах Студия
не нарушает ни одного лицензионного ограничения… есть неудобства, и они однократные. Не перегружаем страницу и оверлеи.»

    access(repos, token=None) -> {"repos": [...], "token": {...} | None, "ready": bool}

For each (repo, revision, path) the extra takes, one HEAD at the pin, the first answer only (never the CDN, nothing downloaded):
    open          Hugging Face serves it to anyone
    ok            it serves it with this token
    login         gated: a token is needed, from an account that has accepted the conditions (401 GatedRepo)
    wait          gated, and this token's account has not been let in yet: accept the conditions, or wait for the authors' yes
                  when the gate is manual (403 GatedRepo)
    gone          the repo or the pinned commit is not there (404): our pin is stale or the authors took it down
    offline       no answer
With a token, whoami first: a token Hugging Face does not know is «invalid» before any gate is asked.

The token: used for these requests and for the one fetch it is given with (as HF_TOKEN in that run's environment only: the Studio's
own HF_HOME holds no token, and the lab writes none), never written to a file, a log, the run's record or an answer. scrub() takes any
hf_… out of a line before the page sees it.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

HF = os.environ.get("RUACH_HF_ENDPOINT", "https://huggingface.co")   # another endpoint for the tests
TOKEN_RE = re.compile(r"hf_[A-Za-z0-9]{20,}")
UA = "ruach-studio-lab"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_OPEN = urllib.request.build_opener(_NoRedirect)


def scrub(text):
    return TOKEN_RE.sub("hf_…", text) if text else text


def clean(token):
    """The token as given, trimmed, or None; ValueError for anything that is not one (said without echoing it)."""
    t = str(token or "").strip()
    if not t:
        return None
    if not re.fullmatch(r"hf_[A-Za-z0-9]{20,200}", t):
        raise ValueError("that is not a Hugging Face token (it begins with hf_)")
    return t


def _ask(url, token=None, method="HEAD"):
    h = {"User-Agent": UA}
    if token:
        h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, method=method, headers=h)
    try:
        with _OPEN.open(req, timeout=20) as r:
            return r.status, r.headers, (r.read() if method == "GET" else b"")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, b""
    except (urllib.error.URLError, OSError, TimeoutError):
        return 0, {}, b""


def whoami(token):
    st, _, body = _ask(HF + "/api/whoami-v2", token, "GET")
    if st == 200:
        try:
            d = json.loads(body)
            return {"ok": True, "name": d.get("name") or ""}
        except ValueError:
            return {"ok": True, "name": ""}
    if st == 0:
        return {"ok": None, "error": "Hugging Face did not answer"}
    return {"ok": False, "error": "Hugging Face does not know this token (HTTP %d)" % st}


def gate_kind(repo):
    """"auto", "manual" or False, as the repo's card says (an unreadable card: None)."""
    st, _, body = _ask(f"{HF}/api/models/{repo}", None, "GET")
    if st != 200:
        return None
    try:
        return json.loads(body).get("gated")
    except ValueError:
        return None


def one(repo, rev, path, token=None):
    st, h, _ = _ask(f"{HF}/{repo}/resolve/{rev}/{urllib.parse.quote(path)}", token)
    code = (h.get("X-Error-Code") if h else "") or ""
    out = {"repo": repo, "rev": rev, "link": f"{HF}/{repo}", "status": st}
    if st in (200, 302, 307):
        out["state"] = "ok" if token else "open"
    elif code == "GatedRepo" or st in (401, 403) and token:
        out["state"] = "wait" if (token and st == 403) else "login"
        out["gated"] = gate_kind(repo)
    elif st == 401:                                   # a private or deleted repo answers 401 to anyone without access
        out["state"] = "gone"
    elif st == 404:
        out["state"] = "gone"
    elif st == 0:
        out["state"] = "offline"
    else:
        out["state"] = "error"
    return out


def access(items, token=None):
    """items: [(repo, rev, path)], one file a repo is enough (a gate is the repo's). The verdict for the page."""
    tok = whoami(token) if token else None
    if tok and tok.get("ok") is False:
        return {"repos": [], "token": {"ok": False, "error": tok["error"]}, "ready": False}
    seen, repos = set(), []
    for repo, rev, path in items:
        if repo in seen:
            continue
        seen.add(repo)
        repos.append(one(repo, rev, path, token))
    ready = all(r["state"] in ("open", "ok") for r in repos)
    return {"repos": repos, "token": ({"ok": tok.get("ok"), "name": tok.get("name", "")} if tok else None), "ready": ready}
