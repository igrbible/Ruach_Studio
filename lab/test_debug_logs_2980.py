"""HERESY 2980: the debug journal's studio.log and lab.log where the services are not systemd's (Windows' RuachStudio.exe: logs\\lab.log and
logs\\engine.log; macOS and Pinokio: tmp/logs/): the end of their own files, said as such, the rotated file's end before the current one's;
journalctl's own lines first where it has them.
    .venv/bin/python lab/test_debug_logs_2980.py"""
import subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import debugbundle as db

ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

real_run = subprocess.run
def no_journalctl(*a, **k):
    raise FileNotFoundError("journalctl")
class Empty:
    returncode, stdout, stderr = 1, "", "No journal files were found."
def empty_journal(*a, **k):
    return Empty()

with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    db.subprocess.run = no_journalctl
    try:
        said = db.journal("heresy-lab", 3600, k)
        check(said.startswith("(no journal for heresy-lab here: no journalctl"), "no log file anywhere: said as before (2934), nothing invented")
        (k / "logs").mkdir()
        (k / "logs" / "engine.1.log").write_text("old line A\nold line B\n", encoding="utf-8")
        (k / "logs" / "engine.log").write_text("[Server] Listening on http://0.0.0.0:7777\n[AR] Semantic 100/1200\n", encoding="utf-8")
        (k / "logs" / "lab.log").write_text("[lab] heresy-lab on :41870\n", encoding="utf-8")
        s = db.journal("ruach-studio", 3600, k)
        check(s.startswith("(no systemd journal for ruach-studio: the end of its own log, logs/engine.log"), "Windows: the engine's own log named")
        check(s.index("old line B") < s.index("[Server] Listening"), "the rotated file's end comes before the current one's")
        check("[lab] heresy-lab on :41870" in db.journal("heresy-lab", 3600, k), "Windows: the lab's own log")
    finally:
        db.subprocess.run = real_run

with tempfile.TemporaryDirectory() as d:
    k = Path(d)
    (k / "tmp" / "logs").mkdir(parents=True)
    (k / "tmp" / "logs" / "lab.log").write_text("x" * 50 + "\n" + "[lab] the last line\n", encoding="utf-8")
    db.subprocess.run = empty_journal
    try:
        s = db.journal("heresy-lab", 3600, k)
        check("tmp/logs/lab.log" in s and s.endswith("[lab] the last line\n"), "macOS/Pinokio: journalctl with nothing for the unit → tmp/logs/lab.log")
        cut, where = db.log_tail(k, "heresy-lab", cap=30)
        check(where == "tmp/logs/lab.log" and cut == "[lab] the last line\n", "a tail starts at a whole line, at most the cap")
        check(db.journal("ruach-studio", 3600, k).startswith("(journalctl had nothing for ruach-studio"), "no engine log: said as before")
    finally:
        db.subprocess.run = real_run

class Has:
    returncode, stdout, stderr = 0, "2026-11-23T10:00:00 studio-box start.sh[1]: [Server] up\n", ""
db.subprocess.run = lambda *a, **k: Has()
try:
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "logs").mkdir()
        (Path(d) / "logs" / "engine.log").write_text("file line\n", encoding="utf-8")
        check(db.journal("ruach-studio", 3600, d) == Has.stdout, "systemd: journalctl's lines, as ever, the file not read")
finally:
    db.subprocess.run = real_run
print(f"{ok} passed")
