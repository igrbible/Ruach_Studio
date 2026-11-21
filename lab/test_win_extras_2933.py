"""HERESY 2933: what the Linux install puts in beside lab/requirements.txt (lab/install-venv.sh) the Windows and macOS install puts in too
(launcher/setup_win.py's EXTRA), pin for pin; and each package of the lab's own imports that only the Linux extras bring is among them.
    .venv/bin/python lab/test_win_extras_2933.py"""
import ast, re, sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
ROOT = LAB.parent
ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

sh = (LAB / "install-venv.sh").read_text(encoding="utf-8")
line = next(l for l in sh.splitlines() if "downloader-requirements.txt" in l and "pip\" install" in l)
linux = set(re.findall(r'"([A-Za-z0-9_.\-]+==[^"]+)"', line))
tree = ast.parse((ROOT / "launcher" / "setup_win.py").read_text(encoding="utf-8"))
win = next(set(ast.literal_eval(n.value)) for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "EXTRA" for t in n.targets))
check(linux and linux == win, f"the same extras on Linux and on Windows/macOS: {sorted(linux)}")
check({"gguf", "pretty_midi"} <= {p.split("==")[0] for p in win}, "gguf (the LoRA's measure) and pretty_midi (mido for the score's MIDI) among them")
print(f"{ok} passed")
