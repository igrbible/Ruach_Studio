"""HERESY 2998: the UTF-8 law on Windows, kept by a guard (Viktor 25.11.2026: «Эра KOI-866 и cp1251 канула в лета. Веди всё в Виндоуз сборке
легитимным UTF-8»). A Windows Python reads and writes text in the system's code page (cp1251 on a Russian Windows, cp1252 on an English one)
wherever no encoding is named: a file, a pipe, a child's output. So every text open(), read_text(), write_text() and every subprocess in text
mode in the lab, launcher/ and tools/ names encoding="utf-8" (a foreign program's output read with errors="replace"); the binary uses are left
alone and a short allow-list names what the scanner cannot judge. Beside it: every .ps1 is UTF-8 with a BOM and puts its console in UTF-8,
every .cmd starts with chcp 65001, the launcher gives the lab and the engine PYTHONUTF8=1 and PYTHONIOENCODING=utf-8, winx gives the lab's
own children the same, and windows.yml runs the lab and a job from a folder with spaces and Cyrillic. Test files (test_*.py) are not the
Studio and are not scanned.
    .venv/bin/python lab/test_utf8_law_2998.py"""
import ast
import os
import re
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
KIT = LAB.parent
HROOT = KIT / "heresy" / "root"

SUBPROC = {"run", "check_output", "Popen", "call", "check_call"}
SUBPROC_ALWAYS_TEXT = {"getoutput", "getstatusoutput"}
SUBPROC_MODS = {"subprocess", "sp", "_sp"}
TEMPS = {"NamedTemporaryFile", "TemporaryFile", "SpooledTemporaryFile"}
HANDLERS = {"FileHandler", "RotatingFileHandler", "TimedRotatingFileHandler", "WatchedFileHandler"}
# .open() of these is never a text file: archives, sound, pictures
NOT_TEXT = {"tarfile", "zipfile", "wave", "Image", "sf", "soundfile", "h5py", "aifc", "sunau", "av", "imageio", "zf", "z", "zip", "tar", "tf"}
MODE = re.compile(r"[rwxabtU+]{1,4}")

# what the scanner cannot judge, each read by eye: (file under the scanned root, the call's text)
ALLOW = {
    ("launcher/fetch_heresy.py", "open(lp(inc), mode)"),   # mode is "ab" or "wb": a download's bytes
}


def _kw(call, name):
    return next((k for k in call.keywords if k.arg == name), None)


def _str(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _mode(call, pos):
    k = _kw(call, "mode")
    if k is not None:
        return k.value
    return call.args[pos] if len(call.args) > pos else None


def _text(m):
    """True for a text mode, False for a binary one, None when it cannot be told (an expression)."""
    if m is None:
        return True
    s = _str(m)
    if s is None:
        if isinstance(m, ast.IfExp):
            a, b = _text(m.body), _text(m.orelse)
            return a if a == b else None
        return None
    return "b" not in s


def _dotted(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    parts.append(node.id if isinstance(node, ast.Name) else "?")
    return parts[::-1]


def findings(tree):
    """(call node, kind, fix) for every text I/O without an encoding; fix is what names it ("utf8" or "utf8-replace"), None when only a
    person can mend it."""
    names = {a.asname or a.name for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module == "subprocess" for a in n.names}
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        f, enc = node.func, _kw(node, "encoding")
        if enc is not None or any(k.arg is None for k in node.keywords):
            continue                                    # named, or handed on in **kw
        path = _dotted(f)
        name = path[-1]
        kind = None
        if path in (["open"], ["io", "open"], ["builtins", "open"], ["os", "fdopen"]):
            t = _text(_mode(node, 1))
            kind = None if t is False else ("open" if t else "open?")
        elif isinstance(f, ast.Attribute) and name in ("read_text", "write_text"):
            if len(node.args) <= (0 if name == "read_text" else 1):
                kind = name
        elif isinstance(f, ast.Attribute) and name == "open" and path[0] not in NOT_TEXT and path[-2:-1] != ["os"]:
            if path[0] in ("gzip", "bz2", "lzma"):
                s = _str(_mode(node, 1))
                kind = "open" if s and "t" in s else None
            else:
                m = _kw(node, "mode")
                m = m.value if m is not None else next((a for a in node.args[:2] if _str(a) is not None and MODE.fullmatch(_str(a))), None)
                if m is not None:
                    kind = "Path.open" if _text(m) else None
                elif not node.args:
                    kind = "Path.open"                  # Path.open() reads text; an opener's .open(request) is not a file
        elif name in TEMPS:
            m = _mode(node, 0)
            kind = "tempfile" if m is not None and _text(m) is not False else None
        elif name in HANDLERS or name == "TextIOWrapper":
            kind = name
        elif path[-2:] == ["os", "popen"]:
            kind = "os.popen"
        elif name in SUBPROC_ALWAYS_TEXT and (path == [name] and name in names or path[0] in SUBPROC_MODS):
            kind = "getoutput"
        elif name in SUBPROC and (path == [name] and name in names or len(path) == 2 and path[0] in SUBPROC_MODS):
            t = _kw(node, "text") or _kw(node, "universal_newlines")
            if t is not None and not (isinstance(t.value, ast.Constant) and not t.value.value) or _kw(node, "errors") is not None:
                kind = "subprocess"
        if kind:
            fix = None if kind.endswith("?") or kind in ("os.popen", "getoutput") else ("utf8-replace" if kind == "subprocess" else "utf8")
            out.append((node, kind, fix))
    return out


def roots():
    """The scanned trees: the lab, launcher/ and tools/ (heresy/root's master copies where they are, the release's own otherwise)."""
    got = [("lab", LAB)]
    for d in ("launcher", "tools"):
        got.append((d, HROOT / d if (HROOT / d).is_dir() else KIT / d))
    return got


def files():
    for label, root in roots():
        if not root.is_dir():
            continue
        for p in sorted(root.rglob("*.py")):
            if "__pycache__" in p.parts or p.name.startswith("test_") or "node_modules" in p.parts:
                continue
            yield label + "/" + p.relative_to(root).as_posix(), p


def scan():
    bad = []
    for rel, p in files():
        src = p.read_text(encoding="utf-8")
        try:
            tree = ast.parse(src)
        except SyntaxError as e:
            bad.append(f"{rel}: does not parse ({e})")
            continue
        for node, kind, _ in findings(tree):
            text = ast.get_source_segment(src, node) or ""
            if any(rel == a and text.startswith(b) for a, b in ALLOW):
                continue
            bad.append(f"{rel}:{node.lineno} {kind}: {' '.join(text.split())[:120]}")
    return bad


ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what)
        sys.exit(1)
    ok += 1
    print("PASS", what)


def main():
    # the scanner itself: what it must catch and what it must leave alone
    caught = """
import subprocess
from subprocess import run
open(p); open(p, "w"); open(p, mode="a"); Path(p).read_text(); Path(p).write_text(s); Path(p).open(); Path(p).open("w")
subprocess.run(c, text=True); run(c, universal_newlines=True); subprocess.Popen(c, errors="replace"); subprocess.check_output(c, text=t)
gzip.open(p, "rt"); io.TextIOWrapper(b); tempfile.NamedTemporaryFile("w"); logging.FileHandler(p); os.popen(c); subprocess.getoutput(c)
open(p, m)
"""
    left = """
import subprocess
open(p, "rb"); open(p, "wb"); open(p, encoding="utf-8"); open(p, "w", encoding="utf-8"); open(p, **kw); open(p, "ab" if a else "wb")
Path(p).read_text(encoding="utf-8"); Path(p).read_text("utf-8"); Path(p).write_text(s, "utf-8"); Path(p).read_bytes(); Path(p).open("rb")
subprocess.run(c); subprocess.run(c, capture_output=True); subprocess.run(c, text=True, encoding="utf-8"); subprocess.run(c, text=False)
tarfile.open(p, "r"); zipfile.ZipFile(p).open("data.json"); wave.open(p, "rb"); opener.open(req, timeout=9); gzip.open(p); Image.open(p)
tempfile.NamedTemporaryFile(); tempfile.NamedTemporaryFile("wb"); io.TextIOWrapper(b, encoding="utf-8"); os.fdopen(fd, "wb")
"""
    got = [k for _, k, _ in findings(ast.parse(caught))]
    check(len(got) == 18 and got.count("open?") == 1, f"the scanner catches every text use without an encoding ({len(got)} of 18: {got})")
    check(findings(ast.parse(left)) == [], f"the scanner leaves binary and named uses alone ({[k for _, k, _ in findings(ast.parse(left))]})")

    scanned = list(files())
    check(len(scanned) > 150 and any(r == "lab/lab.py" for r, _ in scanned) and any(r == "launcher/start.py" for r, _ in scanned)
          and any(r.startswith("tools/") for r, _ in scanned), f"the lab, launcher/ and tools/ are scanned ({len(scanned)} files)")
    bad = scan()
    for b in bad[:60]:
        print("   ", b)
    check(not bad, f"every text open, read_text, write_text and subprocess in text mode names its encoding ({len(bad)} do not)")

    launcher = HROOT / "launcher" if (HROOT / "launcher").is_dir() else KIT / "launcher"
    top = HROOT if HROOT.is_dir() else KIT
    for ps in sorted(launcher.rglob("*.ps1")):
        raw = ps.read_bytes()
        body = raw[3:].decode("utf-8") if raw.startswith(b"\xef\xbb\xbf") else ""
        check(raw.startswith(b"\xef\xbb\xbf") and "[Console]::OutputEncoding" in body and "UTF8Encoding" in body,
              f"{ps.name}: UTF-8 with a BOM (Windows PowerShell 5.1 reads one without it in the ANSI code page) and its console in UTF-8")
    cmds = sorted(p for p in list(top.glob("*.cmd")) + list(top.glob("*.bat")) + list(launcher.rglob("*.cmd")) + list(launcher.rglob("*.bat")))
    check(cmds, f"the .cmd files are found ({[p.name for p in cmds]})")
    for c in cmds:
        lines = [x.strip().lower() for x in c.read_text(encoding="utf-8").splitlines()]
        first = next((x for x in lines if x and not x.startswith(("@echo off", "rem ", "::"))), "")
        check(first == "chcp 65001 >nul", f"{c.name}: its first command is chcp 65001 >nul (got {first!r})")
        check("set pythonutf8=1" in lines and "set pythonioencoding=utf-8" in lines, f"{c.name}: PYTHONUTF8=1 and PYTHONIOENCODING=utf-8 for the Pythons it starts")

    gofile = launcher / "win" / "internal" / "native" / "native.go"            # not in a package: its launcher is RuachStudio.exe
    if gofile.is_file():
        go = gofile.read_text(encoding="utf-8")
        check('"PYTHONUTF8=1"' in go and '"PYTHONIOENCODING=utf-8"' in go,
              "the launcher's env for the lab, the engine and the install carries PYTHONUTF8=1 and PYTHONIOENCODING=utf-8 (go test checks each)")

    sys.path.insert(0, str(LAB))
    import winx
    env = {"PYTHONUTF8": "0"}
    winx.utf8_env(env, nt=True)
    check(env == {"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}, f"winx.utf8_env: on Windows every child Python in UTF-8 mode ({env})")
    env = {}
    winx.utf8_env(env, nt=False)
    check(env == {}, "winx.utf8_env: Linux and macOS left as they are")
    src = (LAB / "winx.py").read_text(encoding="utf-8")
    body = src[src.index("def utf8_console"):]
    body = body[:body.index("\ndef ", 10)]
    check("utf8_env()" in body, "winx.utf8_console (the lab's, start.py's and fetch_models.py's first call) gives the children UTF-8 too")

    wf = next((w for w in (HROOT / "github" / "workflows" / "windows.yml", KIT / ".github" / "workflows" / "windows.yml") if w.is_file()), None)
    if wf:
        y = wf.read_text(encoding="utf-8")
        check("HERESY 2998" in y and "/inspect?name=" in y and "Remove-Item Env:PYTHONUTF8" in y,
              "windows.yml starts the packaged lab from a folder with spaces and Cyrillic, without PYTHONUTF8, and runs a job there")
    print(f"{ok} passed")


if __name__ == "__main__":
    main()
