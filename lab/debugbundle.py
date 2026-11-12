"""HERESY 2054 (Viktor 03.11.2026: «В Движке добавляем вкладку Debugging… ничего не отсылается никуда, кроме как по решению пользователя…
Анонимизация абсолютная… Сторож на приватные данные пользователя… "Скачать лог", "Отправить лог"»; 04.11: «Гони»): the debug journal's
bundle. The page sends its journal of the last day (already without what was typed, its elements named by their ids, never their words); here it
gets, beside it, the Studio's and the lab's own logs of the same hours and what machine this is, everything scrubbed the same way: every prompt
field (a style, lyrics, a title, a score, a note…) cut out whole wherever it stands, and a line of lyrics with a section tag; the home folder and
the user's name, the machine's name and addresses, mails, keys and tokens, the query values of every address; the takes' names and titles and the
workspaces' names, each a mark of the journal's own salt (the same mark for the same name everywhere in it, another in the next journal). Then the
guard reads the result once more for anything of those kinds left, and says what it found before anything leaves.

HERESY 2104 (Viktor's journal of 05.11.2026, ticket RS-20261105-9bf61f, read back: the scrub held, and left these): the folder of a vocabulary of
the user's own (user/vocab/NAME, /lab/vocab/NAME) and of a dataset of his songs (datasets/raw/NAME) a mark (vocab#…, set#…); a host on the
internet the class «external» (openrouter.ai on every load said nothing in the README); UUIDs, the engine's job ids and other long ids, and seeds,
marks (uuid#…, id#…, seed#…); a key event in a secret field (a password, the Pianoteq serial, the OpenRouter key, a field the page keeps from
autofill) dropped whole, its count said in the README; an address a mark of its own kind, lan#… or wan#… (so a refusal can be told to come from the
local network or not), never a browser's version (Chrome/142.0.0.0 was taken for one); a mail only with a TLD of letters (the screen «2560x1440@1.25»
was taken for one), and a mark too (mail#…).

    bundle(kit, outputs, data, workspaces, machine) → {"id", "bytes", "hours", "files", "findings"}: the ZIP kept in user/debug/ (one at a time)
    path(kit, id)                                  → the ZIP, for its download
    send(kit, id, note, version)                   → {"ticket"}: the ZIP posted to the receiver (extras/debug-receiver, on the Studio's card)
    clear(kit)                                     → {"cleared"}: the kept ZIP gone"""
import getpass
import hashlib
import hmac
import io
import ipaddress
import json
import os
import platform
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

# HERESY 2140 (Viktor 06.11.2026: «Меняй адрес в коде и готов замены в карточки репозиториев. Старый URL станет редиректом 301.»): the receiver at the card's own domain. The old address keeps /debug/ served ahead of its 301
# for the labs before this one: urllib turns a 301 into a GET without the body, and follows no 307 or 308
RECEIVER = os.environ.get("RUACH_DEBUG_RECEIVER", "https://ruachstudio.art/debug/upload")
KEEP_S = 24 * 3600
TAKE = re.compile(r"\b\d{8}-\d{6}(?:-\d\d)?-[\w.\-]+")
TOKENS = [re.compile(p) for p in (r"\bhf_[A-Za-z0-9]{20,}", r"\bgh[pousr]_[A-Za-z0-9]{20,}", r"\bgithub_pat_[A-Za-z0-9_]{20,}", r"\bsk-(?:or-)?[A-Za-z0-9_\-]{16,}",
                                  r"\bxox[abprs]-[A-Za-z0-9\-]{10,}", r"(?i)\bbearer\s+[A-Za-z0-9._\-]{12,}", r"\bAKIA[0-9A-Z]{16}\b",
                                  r"(?i)(?:token|api[_-]?key|secret|password|serial)\s*[=:]\s*[\"']?[^\s\"',;&]{8,}")]
MAIL = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b")       # HERESY 2104: a TLD of letters (not «2560x1440@1.25»)
# HERESY 2104: never a product's version («Chrome/142.0.0.0», «Version/17.0.0.0»: a word and a slash before it), nor a part of a longer dotted number
IPV4 = re.compile(r"(?<![A-Za-z]/)(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w]|\.\d)")
IPV6 = re.compile(r"(?<![\w:.])(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(?![\w:])")   # HERESY 2104: with its «::»; a time is no address (below)
# HERESY 2119 (the review of 2104: the guard read with the scrubber's own IPV4, so what the scrubber leaves it could not see: an address of this network with «peer/» before it
# stayed whole and the guard said nothing): the guard's own pattern, wider and of its own: four dotted groups of one to three digits wherever they stand
# (after a word and a slash, glued to a letter or an underscore, with leading zeros), not inside a longer dotted token (a card's «94.02.42.00.A0»); only
# a browser's version (Chrome/142.0.0.0: one of the browsers' own names and a slash before it) and this machine (127.*, 0.0.0.0) are let by
GUARD_IPV4 = re.compile(r"(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?!\d|\.\w)")
UA_VERSION = re.compile(r"(?:Chrome|Chromium|HeadlessChrome|CriOS|Version|Safari|AppleWebKit|Edg|EdgA|EdgiOS|OPR|Firefox|FxiOS|SamsungBrowser|YaBrowser|Vivaldi|Electron)/$")
# HERESY 2171 (C09: the guard named «cuDNN 9.1.0.70», a library's dotted version, as an address): four dotted numbers right after a version's word (v, ver,
# version), a GPU library's name (cuDNN, CUDA, cuBLAS, NCCL, TensorRT, a wheel's cuNN) or a pin (==) are a version, for the guard and the scrubber alike
VERSION_BEFORE = re.compile(r"(?i)(?:(?<![\w.])(?:v|ver|trt)|version|cudnn|cuda|cublas|nccl|tensorrt|vbios|firmware|cu\d{2,3})[\s:=/_@-]{0,3}$|==\s*$")
UUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
HEXID = re.compile(r"\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{12,64}\b")   # the engine's job ids (16), a page's (24), a write's, a hash
SEED = re.compile(r'(?i)(\b(?:lm_|sound_|art_|music_)?seeds?"?\s*[:=]\s*"?)(-?\d{1,20})\b')
URLHOST = re.compile(r"(?i)\b(https?|wss?)://(?:[^\s/@\"']+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?=[:/\s\"'?#]|$)")
BAREHOST = re.compile(r'("p"\s*:\s*")((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[/:"])')   # the page's journal: another site's request, host and path
OWNPATH = re.compile(r"(?i)((?:\buser|\blab)?/vocab/|\bdatasets/raw/)([^/\s\"'?&#\\]+)")
LOCAL_NAMES = {"localhost", "localhost.localdomain"}
LAN_TLDS = (".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain", ".intranet", ".corp")
SECRET_EL = re.compile(r"(?i)(?:input|textarea)(?:#[\w-]*(?:serial|key|token|pass|secret|otp)[\w-]*|\[type=password\])|#(?:ptqSerial|orKeyNew)\b")
# a prompt's field anywhere in a line (the engine prints its requests as JSON: «  "lyrics": "[Verse 1]\n…",»), its value cut whole
FIELD = re.compile(r'("(?:style|lyrics|title|abc|semantic_tokens|source_tokens|prompt|negative|negative_prompt|caption|note|notes|text|words|lyric|'
                   r'name_hint|workspace|album|artist|tags|description|story|scene|look)"\s*:\s*)"(?:[^"\\]|\\.)*"')
LYRIC = re.compile(r"\[(?:Verse|Chorus|Pre-Chorus|Post-Chorus|Bridge|Intro|Outro|Hook|Refrain|Instrumental|Interlude|Break|Drop|Spoken|Narration)\b[^\]\n]*\][^\n]*")
QUERY = re.compile(r"([?&][\w.\-\[\]]+)=([^&\s\"']*)")
KEEP_IP = {"127.0.0.1", "0.0.0.0", "255.255.255.255"}
WORD = re.compile(r"\w+")
CGNAT = ipaddress.ip_network("100.64.0.0/10")


class Scrub:
    """One journal's scrubbing: its salt, the names it hides, the marks it gives them."""

    def __init__(self, salt, titles=(), workspaces=()):
        self.salt = (salt or os.urandom(8).hex()).encode()
        home, user, host = str(Path.home()), getpass.getuser(), socket.gethostname()
        self.fixed = [(home, "~")]
        if len(user) >= 3:
            self.fixed.append((user, "user"))
        if len(host) >= 3:
            self.fixed += [(host, "host"), (host.split(".")[0], "host")]
        words = {}
        for kind, items in (("title", titles), ("ws", workspaces)):
            for w in items:
                for part in [str(w or "").strip()] + [p.strip() for p in str(w or "").split(" / ")]:
                    if len(part) >= 4 and not part.isdigit() and part not in words:
                        words[part] = kind
        # the longest first («Fosforida / Ballads» before «Fosforida»), each with its longest word: thousands of titles over a lab's log of megabytes
        # are looked for only where that word stands (28.7 s for a day's journal before, at 6 834 titles)
        self.words = sorted(((w, k, max(WORD.findall(w), key=len, default="")) for w, k in words.items()), key=lambda x: -len(x[0]))

    def present(self, s):
        """The names of this journal that stand in s as themselves (not inside a longer word: «Rain» leaves «Raining»), each with its pattern;
        looked for only where its longest word is among s's words."""
        there = set(WORD.findall(s))
        return [(w, k, re.compile(r"(?<!\w)" + re.escape(w) + r"(?!\w)")) for w, k, key in self.words if (not key or key in there) and w in s]

    def mark(self, kind, s):
        return kind + "#" + hmac.new(self.salt, s.encode("utf-8", "replace"), hashlib.sha256).hexdigest()[:6]

    def address(self, a):
        """HERESY 2104: an address as a mark of its kind: lan# for this network (private, link-local, the carrier's shared range), wan# for any other"""
        if a in KEEP_IP or a.startswith("127."):
            return a
        try:
            ip = ipaddress.ip_address(a.split("%")[0])
        except ValueError:
            return a                                 # not an address after all (a time, a counter): as it stands
        if ip.is_loopback:
            return a
        near = ip.is_private or ip.is_link_local or (ip.version == 4 and ip in CGNAT)
        return self.mark("lan" if near else "wan", a)

    def host(self, h):
        """HERESY 2104: a host's class: this machine as it is, a name of the local network a lan# mark, any other «external»"""
        h = h.lower()
        if h in LOCAL_NAMES or h.endswith(".localhost"):
            return h
        if h.endswith(LAN_TLDS):
            return self.mark("lan", h)
        return "external"

    def text(self, s):
        s = FIELD.sub(lambda m: m.group(1) + '"[removed]"', s)
        s = LYRIC.sub("[lyrics removed]", s)
        for a, b in self.fixed:
            s = s.replace(a, b)
        for rx in TOKENS:
            s = rx.sub("[token removed]", s)
        s = MAIL.sub(lambda m: self.mark("mail", m.group(0).lower()), s)
        s = URLHOST.sub(lambda m: m.group(1) + "://" + self.host(m.group(2)), s)          # HERESY 2104: another host, its class
        s = BAREHOST.sub(lambda m: m.group(1) + self.host(m.group(2)), s)
        s = UUID.sub(lambda m: self.mark("uuid", m.group(0).lower()), s)
        s = IPV4.sub(lambda m: m.group(0) if VERSION_BEFORE.search(m.string[max(0, m.start() - 24):m.start()]) else self.address(m.group(0)), s)   # 2171
        s = IPV6.sub(lambda m: self.address(m.group(0)), s)
        # HERESY 2172 (H18: the scrubber left an address with «peer/» before it, glued to a letter or an underscore, or with leading zeros, and only the
        # guard named it): what the guard's wider pattern still finds is marked as well, its leading zeros dropped for the mark («10.0.0.007» is
        # 10.0.0.7, the same mark); so what the guard can name, the scrubber has already hidden
        s = GUARD_IPV4.sub(lambda m: self.address(".".join(str(int(x)) for x in m.group(0).split("."))) if is_address(m.string, m) else m.group(0), s)
        s = TAKE.sub(lambda m: self.mark("take", m.group(0)), s)
        s = OWNPATH.sub(lambda m: m.group(1) + self.mark("set" if "datasets" in m.group(1).lower() else "vocab", m.group(2)), s)
        s = SEED.sub(lambda m: m.group(1) + self.mark("seed", m.group(2)), s)
        s = HEXID.sub(lambda m: self.mark("id", m.group(0)), s)
        for w, kind, rx in self.present(s):
            s = rx.sub(self.mark(kind, w), s)
        return QUERY.sub(lambda m: m.group(1) + "=" + ("" if not m.group(2) else "…"), s)


def is_address(text, m):
    """HERESY 2119, 2171: a GUARD_IPV4 match in text an address: each octet 0-255, not this machine, not a browser's version (Chrome/142.0.0.0)
    nor a library's (cuDNN 9.1.0.70)"""
    a = m.group(0)
    if any(int(x) > 255 for x in a.split(".")) or a in KEEP_IP or a.startswith("127."):
        return False
    before = text[max(0, m.start() - 24):m.start()]
    return not (UA_VERSION.search(before) or VERSION_BEFORE.search(before))


def guard_addresses(text):
    """HERESY 2119: the addresses still there by the guard's own pattern (GUARD_IPV4), each octet 0-255, a browser's version and this machine let by"""
    return [m.group(0) for m in GUARD_IPV4.finditer(text) if is_address(text, m)]


def guard(sc, files):
    """What of the private kinds is still there, file by file: [{kind, file, count, sample}], the sample masked but for its edges."""
    home, user, host = str(Path.home()), getpass.getuser(), socket.gethostname()
    checks = [("home folder", re.compile(re.escape(home))), ("mail", MAIL), ("address", None),   # HERESY 2119: its own pattern (guard_addresses)
              ("a take's name", TAKE), ("a line of lyrics", LYRIC)] + [("key or token", rx) for rx in TOKENS[:-1]]   # one by one: their (?i) stays at a start
    if len(user) >= 3:
        checks.append(("user name", re.compile(r"\b" + re.escape(user) + r"\b")))
    if len(host) >= 3:
        checks.append(("machine name", re.compile(r"\b" + re.escape(host) + r"\b")))
    out = []
    for name, text in files.items():
        for kind, rx in checks:
            hits = guard_addresses(text) if kind == "address" else [m.group(0) for m in rx.finditer(text)]
            if kind == "a take's name":
                hits = [h for h in hits if not h.startswith("take#")]
            if kind == "a line of lyrics":
                hits = [h for h in hits if h != "[lyrics removed]"]
            if hits:
                s = hits[0]
                out.append({"kind": kind, "file": name, "count": len(hits), "sample": s[:2] + "…" + s[-2:] if len(s) > 6 else "…"})
        for w, kind, rx in sc.present(text):
            n = len(rx.findall(text))
            if n:
                out.append({"kind": "a title" if kind == "title" else "a workspace", "file": name, "count": n, "sample": w[:1] + "…"})
    return out


def secret_keys(events):
    """HERESY 2104: (the events, how many were dropped): a key pressed in a secret field (a password, the Pianoteq serial, the OpenRouter key; the page
    of 2.0.6 keeps none, an older journal may carry them) goes whole, as does any event the page marked secret"""
    keep = [e for e in events if not (isinstance(e, dict) and (e.get("secret") or (e.get("k") in ("key", "input", "paste") and SECRET_EL.search(str(e.get("el") or "")))))]
    return keep, len(events) - len(keep)


def journal(unit, since_s):
    try:
        p = subprocess.run(["journalctl", "--user", "-u", unit, "--since", f"-{int(since_s)}s", "--no-pager", "-o", "short-iso"],
                           capture_output=True, text=True, timeout=60)
        return p.stdout if p.returncode == 0 and p.stdout.strip() else f"(journalctl had nothing for {unit}: {p.stderr.strip()[:200]})\n"
    except (OSError, subprocess.SubprocessError) as e:
        return f"(no journal for {unit} here: {e})\n"


def titles_of(outputs):
    """The takes' titles: what the journal hides beside their names (a name is caught by its shape)."""
    out = []
    for d in Path(outputs).iterdir() if Path(outputs).is_dir() else []:
        for f in ("meta.json", "request.json"):
            try:
                t = json.load(open(d / f, encoding="utf-8")).get("title") or ""
            except (OSError, ValueError, AttributeError):
                continue
            if t:
                out.append(t)
    return out


def bundle(kit, outputs, data, workspaces=(), machine=None):
    """data: {"events": [...], "salt": "...", "ua": "...", "screen": "...", "lang": "...", "since": seconds} from the page."""
    since = min(KEEP_S, max(600, int(data.get("since") or KEEP_S)))
    sc = Scrub(str(data.get("salt") or ""), titles_of(outputs), workspaces)
    events, secret = secret_keys(data.get("events") or [])
    page = json.dumps({"events": events, "ua": data.get("ua", ""), "screen": data.get("screen", ""), "lang": data.get("lang", "")},
                      ensure_ascii=False, indent=0)
    try:
        version = (Path(kit) / "VERSION").read_text(encoding="utf-8").strip()
    except OSError:
        version = "?"
    system = {"studio": version, "python": sys.version.split()[0], "os": platform.platform(), "machine": platform.machine(),
              "cpus": os.cpu_count(), "made": time.strftime("%Y-%m-%d %H:%M:%S %Z"), "hours": round(since / 3600, 1), "gpus": machine or {}}
    files = {"page.json": sc.text(page), "studio.log": sc.text(journal("ruach-studio", since)), "lab.log": sc.text(journal("heresy-lab", since)),
             "system.json": sc.text(json.dumps(system, ensure_ascii=False, indent=1))}
    files["README.md"] = ("# A Ruach Studio debug journal\n\nMade on " + system["made"] + " for the last " + str(system["hours"]) + " hours.\n\n"
                          "- page.json: the page's events: clicks and right-clicks (where, and what was pressed, by its id), keys pressed with Ctrl, Alt or "
                          "as commands (never what was typed), the rooms and windows opened, the requests to the Studio (method, path, status, time; no "
                          "values), the page's errors.\n- studio.log, lab.log: the Studio's and the lab's own logs of the same hours.\n- system.json: the "
                          "Studio's version, the system, the cards.\n\nScrubbed before it was made: every style, lyrics, title, score and note cut out whole, "
                          "the home folder and the user's name, the machine's name and addresses, mails, keys and tokens, the values of every address's "
                          "query, the takes' names and titles and the workspaces' names (each a mark like take#1a2b3c, the same mark for the same name "
                          "within this journal only). Addresses are marks of their kind (lan#… on the local network, wan#… beyond it), mails "
                          "marks (mail#…), every host on the internet «external», UUIDs, job ids and seeds marks (uuid#…, id#…, seed#…), a vocabulary's "
                          "and a dataset's folder of your own marks (vocab#…, set#…); keys pressed in a secret field (a password, a serial, a key) "
                          "are not in it at all" + (f" ({secret} such events of an older journal dropped here)" if secret else "") + ".\n")
    findings = guard(sc, files)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for n, t in files.items():
            z.writestr(n, t)
    d = Path(kit) / "user" / "debug"
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob("journal-*.zip"):                # one bundle kept at a time
        old.unlink()
    bid = time.strftime("%Y%m%d-%H%M%S") + "-" + os.urandom(4).hex()   # HERESY 2173 (C11): not its time alone, which anyone can guess
    (d / f"journal-{bid}.zip").write_bytes(buf.getvalue())
    return {"id": bid, "bytes": len(buf.getvalue()), "hours": system["hours"], "events": len(events),
            "files": {n: len(t.encode("utf-8")) for n, t in files.items()}, "findings": findings}


def path(kit, bid):
    if not re.fullmatch(r"\d{8}-\d{6}(?:-[0-9a-f]{8})?", str(bid or "")):   # HERESY 2173: with its random part (one made before it, without)
        raise ValueError("which journal?")
    p = Path(kit) / "user" / "debug" / f"journal-{bid}.zip"
    if not p.is_file():
        raise FileNotFoundError("that journal is gone: make it again")
    return p


def send(kit, bid, note="", version=""):
    body = path(kit, bid).read_bytes()
    req = urllib.request.Request(RECEIVER, data=body, method="POST", headers={
        "Content-Type": "application/zip", "X-Ruach-Version": re.sub(r"[^\w.+-]", "", version)[:40],
        "X-Ruach-Note": urllib.parse.quote(str(note or "")[:500]), "User-Agent": "RuachStudio-lab"})
    try:
        out = json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error") or str(e)
        except ValueError:
            msg = str(e)
        raise ValueError(f"the receiver said no: {msg}")
    except (OSError, ValueError) as e:
        raise RuntimeError(f"the receiver did not answer: {e}")
    if not out.get("ticket"):
        raise RuntimeError("the receiver gave no ticket")
    return {"ticket": out["ticket"]}


def clear(kit):
    n = 0
    for p in (Path(kit) / "user" / "debug").glob("journal-*.zip"):
        p.unlink()
        n += 1
    return {"cleared": n}
