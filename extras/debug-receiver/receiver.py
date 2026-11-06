#!/usr/bin/env python3
"""Ruach Studio's debug-log receiver (HERESY 2054; Viktor 04.11.2026: «Гони. Организовуй свой приёмник на визитке Орфея… Уведомление мне
оправляем на имейл»). The Studio's lab sends here, only when its user presses Send in Engine › Debugging, a ZIP it has made and scrubbed on the
user's own machine: the page's journal of the last day, the Studio's and the lab's logs, what machine it runs on. Nothing else ever comes here,
and nothing comes unasked.

This is the whole of it, published so anyone can see what is kept and how:
  POST /debug/upload   the ZIP as the body (20 MB at most); X-Ruach-Version and X-Ruach-Note (URL-encoded, 500 characters) beside it.
                       Kept under STORE as <ticket>.zip with <ticket>.json (when, how big, its SHA-256, the version, the note, and a
                       salted hash of the sender's address, never the address); answered {"ticket": "RS-YYYYMMDD-xxxxxx"}.
  GET  /debug/health   {"ok": true}
  A sender's address may send 4 logs an hour; the store takes 300 MB a day; a ZIP must be a ZIP of text files (.json, .txt, .log, .md),
  200 MB unpacked at most. The Studio's maintainer gets a mail for each, the log attached when it is 8 MB or less.

Run behind the web server (it sets X-Real-IP), as an ordinary user:
  RUACH_DEBUG_STORE=~/ruach-debug/store RUACH_DEBUG_MAIL=you@example.org python3 receiver.py      (port 41990, RUACH_DEBUG_PORT)
Python's standard library only; mail through the machine's own mail server on port 25."""
import hashlib, http.server, io, json, os, re, secrets, smtplib, threading, time, urllib.parse, zipfile
from email.message import EmailMessage
from pathlib import Path

PORT = int(os.environ.get("RUACH_DEBUG_PORT", "41990"))
STORE = Path(os.environ.get("RUACH_DEBUG_STORE", "~/ruach-debug/store")).expanduser()
MAIL = os.environ.get("RUACH_DEBUG_MAIL", "")
MAX, UNPACKED, PER_HOUR, PER_DAY = 20 << 20, 200 << 20, 4, 300 << 20
KINDS = (".json", ".txt", ".log", ".md")
STORE.mkdir(parents=True, exist_ok=True)
SALT_F = STORE / ".salt"
if not SALT_F.exists():
    SALT_F.write_text(secrets.token_hex(16))
    SALT_F.chmod(0o600)
SALT = SALT_F.read_text().strip()
LOCK, SEEN = threading.Lock(), {}


def who(ip):
    return hashlib.sha256((SALT + ip).encode()).hexdigest()[:12]


def today_bytes():
    day = time.strftime("%Y%m%d")
    return sum(p.stat().st_size for p in STORE.glob(f"RS-{day}-*.zip"))


def check_zip(body):
    if not body.startswith(b"PK\x03\x04"):
        raise ValueError("not a ZIP")
    z = zipfile.ZipFile(io.BytesIO(body))
    names, total = z.namelist(), 0
    for i in z.infolist():
        if i.filename.startswith("/") or ".." in i.filename.split("/") or i.filename.count("/") > 1:
            raise ValueError("a path it may not hold: " + i.filename[:80])
        if not i.is_dir() and not i.filename.lower().endswith(KINDS):
            raise ValueError("only text files (.json, .txt, .log, .md): " + i.filename[:80])
        total += i.file_size
    if total > UNPACKED:
        raise ValueError("too large unpacked")
    if z.testzip() is not None:
        raise ValueError("a damaged ZIP")
    return [n for n in names if not n.endswith("/")]


def notify(meta, body, files):
    if not MAIL:
        return
    m = EmailMessage()
    m["From"], m["To"] = "Ruach Studio debug <" + os.environ.get("RUACH_DEBUG_FROM", "noreply@" + os.uname().nodename) + ">", MAIL
    m["Subject"] = f"Ruach Studio debug log {meta['ticket']} · {meta['version'] or 'version unknown'}"
    m.set_content("\n".join([
        f"Ticket:   {meta['ticket']}", f"When:     {meta['at']}", f"Version:  {meta['version']}", f"Size:     {meta['bytes'] / 1e6:.2f} MB, SHA-256 {meta['sha256']}",
        f"Sender:   {meta['sender']} (a salted hash, the same for the same address)", "", "The note:", meta["note"] or "(none)", "",
        "Files:", *("  " + f for f in files), "", f"Kept on the server: {STORE}/{meta['ticket']}.zip"]))
    if len(body) <= 8 << 20:
        m.add_attachment(body, maintype="application", subtype="zip", filename=meta["ticket"] + ".zip")
    try:                                      # the machine's own mail server, on its port 25 (a setgid sendmail cannot run under NoNewPrivileges)
        with smtplib.SMTP(os.environ.get("RUACH_DEBUG_SMTP", "127.0.0.1"), 25, timeout=60) as s:
            s.send_message(m)
    except (OSError, smtplib.SMTPException) as e:
        print(time.strftime("%F %T"), "mail not sent:", e, flush=True)


class H(http.server.BaseHTTPRequestHandler):
    server_version = "RuachDebug/1"

    def reply(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.split("?")[0] == "/debug/health":
            return self.reply(200, {"ok": True})
        self.reply(404, {"error": "nothing here"})

    def do_POST(self):
        if self.path.split("?")[0] != "/debug/upload":
            return self.reply(404, {"error": "nothing here"})
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX:
            return self.reply(413, {"error": "a log is 20 MB at most"})
        sender = who(ip)
        with LOCK:
            now = time.time()
            SEEN[sender] = [t for t in SEEN.get(sender, []) if now - t < 3600]
            if len(SEEN[sender]) >= PER_HOUR:
                return self.reply(429, {"error": "4 logs an hour from one place; try again later"})
            if today_bytes() + n > PER_DAY:
                return self.reply(503, {"error": "the receiver is full for today; try again tomorrow"})
            SEEN[sender].append(now)
        body = self.rfile.read(n)
        try:
            files = check_zip(body)
        except (ValueError, zipfile.BadZipFile) as e:
            return self.reply(400, {"error": str(e)})
        ticket = "RS-" + time.strftime("%Y%m%d") + "-" + secrets.token_hex(3)
        note = urllib.parse.unquote(self.headers.get("X-Ruach-Note") or "")[:500]
        version = re.sub(r"[^\w.+-]", "", self.headers.get("X-Ruach-Version") or "")[:40]
        meta = {"ticket": ticket, "at": time.strftime("%Y-%m-%d %H:%M:%S %Z"), "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                "version": version, "note": note, "sender": sender, "files": files}
        (STORE / f"{ticket}.zip").write_bytes(body)
        (STORE / f"{ticket}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        threading.Thread(target=notify, args=(meta, body, files), daemon=True).start()
        self.reply(200, {"ticket": ticket})

    def log_message(self, fmt, *args):          # no addresses in the log: the path and the code only
        print(time.strftime("%F %T"), self.command, self.path.split("?")[0], args[1] if len(args) > 1 else "", flush=True)


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
