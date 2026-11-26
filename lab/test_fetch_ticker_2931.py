"""HERESY 2931: the models' download says how far it came, from the unfinished part's size: one line kept up to date in a console, a line a
minute in a log, nothing before the first byte.
    .venv/bin/python lab/test_fetch_ticker_2931.py"""
import io, sys, tempfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "launcher"))
import fetch_models as fm

ok = 0
def check(cond, what):
    global ok
    if not cond:
        print("FAIL", what); sys.exit(1)
    ok += 1; print("PASS", what)

class Console(io.StringIO):
    def isatty(self):
        return True

def run(part, out, size=2_600_000_000, grow=None):
    stop = threading.Event()
    t = threading.Thread(target=fm.ticker, args=(part, size, stop, out, 0.02, 60.0))
    t.start(); time.sleep(0.05); grow and grow(); time.sleep(0.2); stop.set(); t.join()
    return out.getvalue()

with tempfile.TemporaryDirectory() as d:
    part = Path(d) / ".ruach-part"
    check(run(part, Console()) == "" and run(part, io.StringIO()) == "", "nothing said before the first byte (no part yet)")
    rec = part / ".cache" / "huggingface" / "download"
    rec.mkdir(parents=True)
    inc = rec / "YuE2-3B-Q5_K_M.gguf.0a1b.incomplete"

    def grow():                                    # HERESY 2986: the part comes while the ticker runs (one that stays as it was is another file's)
        with open(inc, "wb") as f:
            f.truncate(1_300_000_000)              # sparse: the size without the bytes
    con = run(part, Console(), grow=grow)
    check("\r          1.3 GB of 2.6 GB (50%)" in con and con.endswith("\r" + " " * 48 + "\r"), "a console: one line kept up to date, cleared at the end")
    inc.unlink()
    log = run(part, io.StringIO(), grow=grow)
    check(log == "          1.3 GB of 2.6 GB (50%)\n", "a log: one line, not one every two seconds")
print(f"{ok} passed")
