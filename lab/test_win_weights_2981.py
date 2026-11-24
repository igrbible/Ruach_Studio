"""HERESY 2981 (the 2.1.0-rc2 Windows soak, round 2): Engine -> Models where there is no bash (Windows without Git for Windows).
The transcriber's part says the size fetch_models.py brings (2.9 GB, the F32 pair and the Refined mode), not fetch-heresy.sh's 1.0 GB; and a
base-only fetch is not followed by fetch-heresy.sh's check, which needs bash and told the user to install Git for Windows under a fetch that
worked. With bash (Linux, macOS, Windows with Git for Windows) both stay as they were. Offline: nothing is downloaded, nothing is run.
    .venv/bin/python lab/test_win_weights_2981.py"""
import sys
from pathlib import Path
LAB = Path(__file__).resolve().parent
KIT = LAB.parent
sys.path.insert(0, str(LAB))
import weights

ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

real_bash = weights._bash
weights._bash = lambda: None
check(weights.parts_of(KIT)["transcriber"] == "2.9 GB", "no bash: the transcriber's part says 2.9 GB, what fetch_models.py brings")
check(weights._bytes(weights.parts_of(KIT)["transcriber"]) == 2_900_000_000, "no bash: the progress expects 2.9 GB")
weights._bash = lambda: "/usr/bin/bash"
check(weights.parts_of(KIT)["transcriber"] == "1.0 GB", "with bash: the transcriber's part keeps fetch-heresy.sh's 1.0 GB (the Q8_0 pair)")
check(weights.PARTS["transcriber"] == "1.0 GB", "PARTS itself is not changed")

# the run: which fetches are followed by the check, with and without bash (_say stubbed: nothing runs)
said = []
def fake_say(kit, args, token=None):
    said.append(list(args))
    return 0
weights._say = fake_say

def run(args, then_check, bash):
    said.clear()
    weights._bash = (lambda: None) if bash is None else (lambda: bash)
    weights.JOB.update(lines=[], counts=None, status="running", rc=None, checking=False, after=None, kind="fetch")
    weights._run(KIT, args, then_check)
    return [a for a in said], weights.JOB["status"], list(weights.JOB["lines"])

calls, status, lines = run(["--only", "transcriber"], True, None)
check(calls == [["--only", "transcriber"]], "no bash: the transcriber fetched, and no --check after it")
check(status == "done" and not any("Git for Windows" in l for l in lines), "no bash: done, no «install Git for Windows» under it")
calls, status, lines = run(["--only", "none", "--refined", "F16", "--yes"], True, None)
check(calls == [["--only", "none", "--refined", "F16", "--yes"]], "no bash: the Refined mode fetched, and no --check after it")
calls, status, lines = run(["--only", "transcriber"], True, "/usr/bin/bash")
check(calls == [["--only", "transcriber"], ["--check"]], "with bash: the check still follows a part fetched alone")
calls, status, lines = run(["--only", "loras"], True, None)
check(calls == [["--only", "loras"], ["--check"]], "no bash, a part that is not base-only: its run is unchanged (the check says what bash says)")

weights._bash = real_bash
print(f"test_win_weights_2981: {ok} passed")
