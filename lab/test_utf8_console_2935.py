"""HERESY 2935: the Studio's text in UTF-8 through a Windows console and into a file: winx.utf8_console switches a Windows console to UTF-8
and makes a stream in the system's code page UTF-8 (Linux's left as it is); taskkill's localized answer is read in its own code page; the https
door asks no «hostname -I» off Linux; the install's scripts and the engine's start say non-Latin letters into a cp1251 file.
    .venv/bin/python lab/test_utf8_console_2935.py"""
import ctypes
import io
import os
import subprocess
import sys
import types
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import winx

ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


real_out, real_err, real_nt, real_platform, real_run = sys.stdout, sys.stderr, winx.NT, sys.platform, subprocess.run
WORDS = "── «Снег над Саскатуном» · Ѓа·Шем"
try:
    # Linux: UTF-8 streams are left as they are
    a, b = sys.stdout, sys.stderr
    winx.utf8_console()
    check(sys.stdout is a and sys.stderr is b and sys.stdout.encoding.lower().replace("-", "") == "utf8", "Linux: stdout and stderr left as they are (UTF-8 already)")

    # a file in cp1251 (a Windows Python with no PYTHONUTF8, its output redirected by hand): UTF-8 after it, nothing refused
    raw = io.BytesIO()
    sys.stdout = io.TextIOWrapper(raw, encoding="cp1251", errors="strict")
    try:
        print(WORDS)
        check(False, "cp1251 refuses «──»")
    except UnicodeEncodeError:
        pass
    winx.utf8_console()
    print(WORDS)
    sys.stdout.flush()
    got = raw.getvalue().decode("utf-8", "replace")
    sys.stdout = real_out
    check(WORDS in got, "a stream in cp1251 made UTF-8: «──» and Cyrillic written whole, no UnicodeEncodeError")

    # Windows: its console switched to code page 65001 (faked kernel32)
    calls = []
    winx.NT = True
    real_windll = getattr(ctypes, "windll", None)
    ctypes.windll = types.SimpleNamespace(kernel32=types.SimpleNamespace(SetConsoleOutputCP=lambda cp: calls.append(("out", cp)) or 1,
                                                                          SetConsoleCP=lambda cp: calls.append(("in", cp)) or 1))
    try:
        winx.utf8_console()
    finally:
        if real_windll is None:
            del ctypes.windll
        else:
            ctypes.windll = real_windll
    check(calls == [("out", 65001), ("in", 65001)], "Windows: the console's output and input code pages set to 65001, so yue-server's UTF-8 reads right in it")

    # taskkill's answer in the console's code page (cp866 «УСПЕШНО»): read so, never a UnicodeDecodeError
    seen = {}

    def fake_run(cmd, **kw):
        seen.update(kw, cmd=cmd)
        return subprocess.CompletedProcess(cmd, 0, "УСПЕШНО", "")
    subprocess.run = fake_run
    try:
        winx.kill_group(4242)
    finally:
        subprocess.run = real_run
    check(seen.get("encoding") == "oem" and seen.get("errors") == "replace" and seen["cmd"][:4] == ["taskkill", "/PID", "4242", "/T"],
          "taskkill read in the console's own code page (oem), what will not read replaced")
    winx.NT = real_nt

    # the https door off Linux: no «hostname -I» (Windows' hostname refuses it in the console's code page)
    import tls_door
    sys.platform = "win32"
    subprocess.run = lambda *x, **k: (_ for _ in ()).throw(AssertionError("hostname -I asked off Linux"))
    try:
        names, ips = tls_door.own_names()
    finally:
        subprocess.run, sys.platform = real_run, real_platform
    check("localhost" in names and "127.0.0.1" in ips, "the https door's names off Linux: from the resolver, no «hostname -I»")

    # the install's scripts and the engine's start, run with their output in a cp1251 file
    root = LAB.parent
    launcher = root / "launcher" if (root / "launcher" / "setup_win.py").is_file() else root / "heresy" / "root" / "launcher"
    sys.path.insert(0, str(launcher))
    import setup_win
    raw = io.BytesIO()
    sys.stdout = io.TextIOWrapper(raw, encoding="cp1251", errors="strict")
    setup_win.utf8_out()
    print(WORDS)
    sys.stdout.flush()
    got = raw.getvalue().decode("utf-8", "replace")
    sys.stdout = real_out
    check(WORDS in got, "setup_win.py's own output made UTF-8 before its first «──»")
    env = dict(os.environ, PYTHONUTF8="0", PYTHONIOENCODING="cp1251:strict")
    for script in ("fetch_models.py", "start.py"):
        src = (launcher / script).read_text(encoding="utf-8")
        first = min(i for i in (src.find("print("), src.find("say(")) if i >= 0)
        check(0 <= src.find("winx.utf8_console()") < first, f"{script} makes its output UTF-8 before it says anything")
    r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import winx; winx.utf8_console(); print(sys.argv[2])",
                        str(LAB), WORDS], env=env, capture_output=True)
    check(r.returncode == 0 and r.stdout.decode("utf-8").strip() == WORDS, "a Python whose output is cp1251 (PYTHONIOENCODING) writes UTF-8 after utf8_console")
    raw = (launcher / "install.ps1").read_bytes()
    ps = raw.decode("utf-8-sig")
    check("[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false" in ps and all(ord(c) < 128 for c in ps) and raw.startswith(b"\xef\xbb\xbf"),
          "install.ps1 puts its console in UTF-8, and stays ASCII after its UTF-8 BOM (HERESY 2998: Windows PowerShell reads a .ps1 with no BOM in the ANSI code page)")
finally:
    sys.stdout, sys.stderr, winx.NT, sys.platform, subprocess.run = real_out, real_err, real_nt, real_platform, real_run
print(f"{ok} passed")
