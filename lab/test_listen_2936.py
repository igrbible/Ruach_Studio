"""HERESY 2936: where the Studio listens. Windows and macOS: this computer alone (127.0.0.1) while user/access.json says «this computer only»,
which their first start writes, so their firewall asks nothing; private networks or a list: every address from the next start. Linux unchanged
(start.sh, every address, the engine's gate deciding). The https door the same way; the lab on 127.0.0.1 everywhere; the launcher names no
address. Each place that chooses an address checked here (the launcher's own in launcher/win: TestStudioOnThisComputer).
    .venv/bin/python lab/test_listen_2936.py"""
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
ROOT = LAB.parent
sys.path.insert(0, str(LAB))
LAUNCHER = ROOT / "launcher" if (ROOT / "launcher" / "start.py").is_file() else ROOT / "heresy" / "root" / "launcher"
TOP = LAUNCHER.parent                                 # start.sh: the studio's root, or heresy/root in the dev tree

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


spec = importlib.util.spec_from_file_location("ruach_start", LAUNCHER / "start.py")
start = importlib.util.module_from_spec(spec)
spec.loader.exec_module(start)
said = []
start.say = lambda s="": said.append(s)
real_nt, real_platform = start.NT, sys.platform
tmp = Path(tempfile.mkdtemp(prefix="t2936-"))
try:
    acc = tmp / "user" / "access.json"
    env = {"RUACH_ACCESS": str(acc)}
    start.NT = True
    check(start.listen_host(env) == "127.0.0.1" and json.loads(acc.read_text())["mode"] == "local" and any("this computer only" in s for s in said),
          "Windows, a first start: this computer alone, «this computer only» written to user/access.json and said; no firewall question")
    acc.write_text(json.dumps({"mode": "private", "nets": [], "acknowledged": "2026-11-21 20:00"}))
    check(start.listen_host(env) == "0.0.0.0", "Windows, private networks chosen: every address (the firewall asks once, from that start)")
    acc.write_text(json.dumps({"mode": "list", "nets": ["10.99.0.0/24"]}))
    check(start.listen_host(env) == "0.0.0.0", "Windows, the networks listed: every address, the engine's gate answering only them")
    acc.write_text(json.dumps({"mode": "local", "nets": []}))
    check(start.listen_host(env) == "127.0.0.1", "Windows, this computer only kept: 127.0.0.1")
    acc.write_text("{ half written")
    check(start.listen_host(env) == "0.0.0.0", "a broken user/access.json: private networks, as the engine reads it")
    check(start.listen_host(dict(env, YUE2CPP_HOST="192.0.2.7")) == "192.0.2.7", "YUE2CPP_HOST overrides")
    acc.unlink()
    start.NT, sys.platform = False, "darwin"
    check(start.listen_host(env) == "127.0.0.1" and acc.is_file(), "macOS, a first start: this computer alone too, written down")
    acc.unlink()
    sys.platform = "linux"
    check(start.listen_host(env) == "0.0.0.0" and not acc.exists(), "start.py on Linux with no decision: every address as before, nothing written")
    start.NT, sys.platform = real_nt, real_platform
    src = (LAUNCHER / "start.py").read_text(encoding="utf-8")
    check('args = ["--host", host, "--port"' in src and "engine-listen.json" in src and '"--host", "0.0.0.0"' not in src,
          "start.py gives the engine the address it chose and writes it for the lab; no fixed 0.0.0.0 left")

    import listen
    (tmp / "tmp").mkdir()
    check(listen.state(tmp)["engine"] is None, "the lab's /engine/where with no word from start.py (Linux's start.sh): the engine not said")
    (tmp / "tmp" / "engine-listen.json").write_text(json.dumps({"host": "127.0.0.1", "port": 7777, "pid": 1}))
    os.environ["RUACH_LAUNCHER"] = "native"
    st = listen.state(tmp)
    check(st["engine"] == {"host": "127.0.0.1", "port": 7777} and st["launcher"] == "native" and st["system"] in ("linux", "macos", "windows"),
          "the lab's /engine/where: where the engine listens, as start.py wrote it, and which launcher runs it")
    real_os_name = os.name
    try:
        os.name = "nt"
        check(listen.system() == "windows", "the lab names Windows")
    finally:
        os.name = real_os_name
    os.environ.pop("RUACH_LAUNCHER", None)
    lab_src = (LAB / "lab.py").read_text(encoding="utf-8")
    get = lab_src[lab_src.index("    def do_GET(self):"):lab_src.index("    def do_POST(self):")]
    check(get.count('if url.path == "/engine/where":') == 1 and "return self.send(200, listen.state(KIT))" in get
          and 'fetch("/lab/engine/where")' in ((LAB.parent / "build/tools/console/app.js").read_text(encoding="utf-8") if (LAB.parent / "build/tools/console/app.js").is_file() else 'fetch("/lab/engine/where")'),
          "the lab answers GET /engine/where, and the page asks there (2936b: /listen was the player's Opus stream, earlier in the handler)")

    import tls_door
    tls_door.ACCESS = acc
    tls_door._seen.update(mtime=None)
    acc.write_text(json.dumps({"mode": "local", "nets": []}))
    sys.platform = "win32"
    check(tls_door.listen_hosts() == ["127.0.0.1", "::1"], "the https door on Windows with this computer only: the loopback addresses alone")
    os.utime(acc, (1, 1))
    acc.write_text(json.dumps({"mode": "private", "nets": []}))
    tls_door._seen.update(mtime=None)
    check(tls_door.listen_hosts() is None, "the https door on Windows with private networks: every address")
    sys.platform = "linux"
    acc.write_text(json.dumps({"mode": "local", "nets": []}))
    tls_door._seen.update(mtime=None)
    check(tls_door.listen_hosts() is None, "the https door on Linux: every address as before, whatever is chosen (its gate refuses the others)")
    sys.platform = real_platform

    lab = (LAB / "lab.py").read_text(encoding="utf-8")
    check('ThreadingHTTPServer((os.environ.get("LAB_HOST", "127.0.0.1"), PORT)' in lab, "the lab listens on 127.0.0.1 on every system (behind the engine)")
    sh = (TOP / "start.sh").read_text(encoding="utf-8")
    check(re.search(r"args=\(--host 0\.0\.0\.0 ", sh) is not None, "Linux: start.sh keeps every address, the engine's gate deciding (unchanged)")
    go = (TOP / "launcher" / "win" / "internal" / "native" / "native.go").read_text(encoding="utf-8")
    check("0.0.0.0" not in go and "YUE2CPP_HOST" not in go and 'Sprintf("http://127.0.0.1:%d/", c.Port)' in go,
          "RuachStudio.exe names no address to listen on and asks the Studio on 127.0.0.1")
finally:
    start.NT, sys.platform = real_nt, real_platform
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
print(f"{ok} passed")
