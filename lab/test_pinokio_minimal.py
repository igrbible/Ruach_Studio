"""HERESY 3001 (Viktor 25.11.2026: «Windows-ветку Pinokio вырезай полностью. WSL2 в топку. Линукс как предложил», «Поддержка Pinokio окружения
минимальна»): Pinokio back after 2988, minimal and Linux-only: pinokio.js (Install, Start, Open; on Windows and macOS one item that points to
the Studio's own packages), pinokio.json («Linux + NVIDIA only, unsupported», platform linux, gpu nvidia, no posts), launcher/install.js
(bash launcher/install.sh --yes) and launcher/start.js (the lab, then start.sh); install.sh takes --yes and refuses any other option;
make-release.sh carries pinokio.js and pinokio.json; the engine still lets Pinokio's :42000 frame the Studio (2138).
    .venv/bin/python lab/test_pinokio_minimal.py"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
LAB = Path(__file__).resolve().parent
KIT = LAB.parent
R = KIT / "heresy" / "root" if (KIT / "heresy" / "root").is_dir() else KIT   # the root's master copies, or a release tree's own
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


NODE = r"""
const p = process.argv[1], plat = process.argv[2], state = JSON.parse(process.argv[3])
Object.defineProperty(process, "platform", { value: plat })
const m = require(p)
const info = { exists: (f) => state.exists.includes(f), running: (f) => state.running.includes(f), local: (f) => state.local[f] }
m.menu({ platform: plat }, info).then((items) => console.log(JSON.stringify({ title: m.title, description: m.description, items })))
"""


def node():
    """node on PATH, else the newest of nvm's (the suite's own way: cut210rc3-clean.sh names nvm's v24)."""
    n = shutil.which("node")
    if n:
        return n
    vs = sorted(Path.home().glob(".nvm/versions/node/v*/bin/node"), key=lambda p: [int(x) for x in re.findall(r"\d+", p.parent.parent.name)])
    return str(vs[-1]) if vs else None


NODE_EXE = node()


def menu(plat, exists=(), running=(), local=None):
    st = json.dumps({"exists": list(exists), "running": list(running), "local": local or {}})
    r = subprocess.run([NODE_EXE, "-e", NODE, str(R / "pinokio.js"), plat, st], capture_output=True, text=True, timeout=30)
    if r.returncode:
        print(r.stderr)
    return json.loads(r.stdout)


if not NODE_EXE:
    print("node is missing: the menu is not checked")
    sys.exit(1)
done = (".venv/bin/python", "build/build/yue-server")
for plat in ("win32", "darwin"):
    m = menu(plat, exists=done)
    check(len(m["items"]) == 1 and m["items"][0]["href"] == "https://github.com/igrbible/Ruach_Studio/releases"
          and "Linux + NVIDIA only" in m["items"][0]["text"], f"{plat}: one item, a refusal that points to the Studio's own packages")
m = menu("linux")
check([i["href"] for i in m["items"]] == ["launcher/install.js"] and "unsupported" in m["items"][0]["text"], "linux, nothing installed: Install")
check(menu("linux", running=["launcher/install.js"])["items"][0]["text"] == "Installing", "linux, installing: Installing")
check([i["href"] for i in menu("linux", exists=done)["items"]] == ["launcher/start.js"], "linux, installed: Start, nothing more")
check(menu("linux", exists=done, running=["launcher/start.js"])["items"][0]["text"] == "Starting", "linux, the engine not listening yet: Starting")
m = menu("linux", exists=done, running=["launcher/start.js"], local={"launcher/start.js": {"url": "http://127.0.0.1:7777"}})
check([i["href"] for i in m["items"]] == ["http://127.0.0.1:7777", "launcher/start.js"], "linux, started: Open the Studio and its terminal")
check(m["description"].startswith("Linux + NVIDIA only, unsupported."), "pinokio.js's description says Linux + NVIDIA only, unsupported")
js = (R / "pinokio.js").read_text(encoding="utf-8")
check(not re.search(r"extras\.js|update\.js|reset\.js|More models", js), "no menu of extras, update or reset")
pj = json.loads((R / "pinokio.json").read_text(encoding="utf-8"))
check(pj.get("platform") == "linux" and pj.get("gpu") == "nvidia" and "posts" not in pj and "links" not in pj
      and pj["description"] == m["description"], "pinokio.json: platform linux, gpu nvidia, no posts, the same description")
check((R / "src" / "brand" / "ruach-icon-512.png").is_file(), "the icon both name is there")
inst = (R / "launcher" / "install.js").read_text(encoding="utf-8")
check('message: "bash launcher/install.sh --yes"' in inst and 'requires: { bundle: "ai" }' in inst, "install.js: Pinokio's AI bundle, then bash launcher/install.sh --yes")
start = (R / "launcher" / "start.js").read_text(encoding="utf-8")
check(".venv/bin/python lab/lab.py" in start and ". launcher/env.sh && bash start.sh" in start and "daemon: true" in start,
      "start.js: the lab, then start.sh after env.sh, held as a daemon")
lab_ev = re.search(r'event: "/(heresy-lab[^"]*)/"', start).group(1).replace("\\\\", "\\")
lab_line = re.search(r'print\(f"(\[lab\] heresy-lab on :)\{PORT\}', (LAB / "lab.py").read_text(encoding="utf-8"))
check(lab_line is not None and re.search(lab_ev, lab_line.group(1) + "41870 · outputs"), "start.js's lab event matches lab.py's own line")
eng_ev = re.search(r'event: "/(Listening[^"]*)/"', start).group(1).replace("\\\\", "\\")
srv = (KIT / "build" / "tools" / "yue-server.cpp").read_text(encoding="utf-8", errors="replace")
check('"[Server] Listening on http://%s:%d\\n"' in srv and re.search(eng_ev, "[Server] Listening on http://0.0.0.0:7777").group(1) == "7777",
      "start.js's engine event matches yue-server's line and takes its port")
check('"http://localhost:42000"' in srv, "the engine still lets Pinokio's :42000 put the Studio in a frame (2138)")
sh = (R / "launcher" / "install.sh").read_text(encoding="utf-8")
check('bash fetch-models.sh ${Q:+--quant "$Q"} $YES' in sh and "--yes|-y) YES=--yes" in sh, "install.sh: --yes reaches fetch-models.sh")
r = subprocess.run(["bash", str(KIT / "launcher" / "install.sh"), "--bogus"], capture_output=True, text=True, timeout=30, env={"NO_COLOR": "1", "PATH": "/usr/bin:/bin"})
check(r.returncode == 1 and "ruach install stopped: no option --bogus here (bash launcher/install.sh [--yes])" in r.stdout and "① the machine" not in r.stdout,
      "install.sh refuses an option it does not know before any step")
MR = KIT / "heresy" / "tools" / "make-release.sh"
if MR.is_file():
    check(re.search(r"RuachStudio\.command pinokio\.js pinokio\.json; do", MR.read_text(encoding="utf-8")) is not None, "make-release.sh carries pinokio.js and pinokio.json")
else:
    check((KIT / "pinokio.js").is_file() and (KIT / "pinokio.json").is_file(), "a release tree (no make-release.sh): pinokio.js and pinokio.json at its root")
gi = (R / "gitignore" if (R / "gitignore").is_file() else KIT / ".gitignore").read_text(encoding="utf-8").splitlines()
check("/ENVIRONMENT" in gi and "/.pinokio-temp" in gi, "gitignore: what Pinokio writes beside pinokio.js")
for doc in ("README.md", "INSTALL.md"):
    check("Pinokio (Linux only, unsupported)" in (R / doc).read_text(encoding="utf-8"), f"{doc}: one line, Pinokio Linux only and unsupported")
# HERESY 3002: lab.py's refusal to restart a Studio that runs without its unit names no launcher by its brand, and says what the page's key says
labsrc = (LAB / "lab.py").read_text(encoding="utf-8")
web = (KIT / "build" / "tools" / "console" / "heresy-weights.js").read_text(encoding="utf-8")
check("the Studio does not run as a service here (its icon, or ./start.sh by hand): stop it and start it " in labsrc
      and "(RuachStudio.exe, Pinokio, or ./start.sh by hand)" not in labsrc, "lab.py: «as a service here (its icon, or ./start.sh by hand)»")
check('tr("The Studio does not run as a service here (its icon, or ./start.sh by hand)' in web and "/as a service/.test(e.message)" in web,
      "the page still knows the lab's refusal by «as a service» and says the same words")
print(f"{ok} passed")
