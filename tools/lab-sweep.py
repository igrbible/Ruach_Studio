#!/usr/bin/env python3
"""HERESY 2937 (the agent's item A5 after 2.1.0-rc1: the class «failed only on Windows» caught before a tag): every GET route of the lab asked
once, with no arguments, and its answer judged, as the Windows soak's sweep did by hand in the VM (sweep.ps1, 182 routes). The routes are
read from lab/lab.py's own GET handler, so a room added tomorrow is asked too.

A path handled twice in one handler fails first (its second handler never answers). A route fails when it answers 500 for a reason of its own (a 500 that only names a third-party package the machine lacks, «No module named
'numpy'», is the runner's, not the Studio's: CI runs the lab without its packages), when an answer carries a system's raw words («[WinError
2]», «[Errno 2]», a Python traceback, «module 'os' has no attribute»), or when the lab stops answering. 4xx is the answer to a question asked
without its arguments, and passes. Standard library only (CI's bare Python, Windows, macOS and Linux alike).

    python3 tools/lab-sweep.py [http://127.0.0.1:41870] [--routes] [--out FILE]
exit 0 when every route passed, 1 when one failed, 2 when the lab does not answer at all"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"/art/draw"}        # a GET that starts a picture when it is given a take: asked by name only, never by a sweep
RAW = re.compile(r"\[WinError -?\d+\]|\[Errno -?\d+\]|Traceback \(most recent call last\)|module 'os' has no attribute|"
                 r"has no attribute '(killpg|getpgid|nice|fchmod|statvfs|uname|getuid)'")
# 23.11.2026 (the 2.1.0-rc2 CI): the lab's own words for a missing package too (plenio_core/errors.py: «… needs the Python package 'scipy',
# which is not installed.»), not only Python's; scipy is in lab/requirements-lock.txt, so a real install has it and the bare runner does not
MISSING = re.compile(r"No module named '([A-Za-z0-9_.]+)'|needs the Python package '([A-Za-z0-9_.]+)'")
STDLIB = set(getattr(sys, "stdlib_module_names", ())) | {"winx", "paths"}


def routes(lab_py=None):
    """The GET routes of the lab, from its do_GET: url.path == "/x", url.path.startswith("/x"), url.path in ("/x", …)."""
    s = Path(lab_py or ROOT / "lab" / "lab.py").read_text(encoding="utf-8")
    g = s[s.index("    def do_GET(self):"):s.index("    def do_POST(self):")]
    found = re.findall(r'url\.path == "(/[^"]*)"', g) + re.findall(r'url\.path\.startswith\("(/[^"]*)"\)', g)
    for group in re.findall(r"url\.path in \(([^)]*)\)", g):
        found += re.findall(r'"(/[^"]*)"', group)
    return sorted(set(found) - SKIP)


def shadowed(lab_py=None):
    """HERESY 2936b: a path handled twice in one of the lab's handlers ({"GET": [...], "POST": [...]}): the second «if url.path == …» never
    answers (2936's GET /listen sat behind the player's Opus stream, 1851, and the page asked it in vain)."""
    s = Path(lab_py or ROOT / "lab" / "lab.py").read_text(encoding="utf-8")
    out = {}
    for name, a, b in (("GET", "    def do_GET(self):", "    def do_POST(self):"), ("POST", "    def do_POST(self):", "    def log_message(self")):
        g = s[s.index(a):s.index(b)] if b in s else s[s.index(a):]
        seen = re.findall(r'^\s*if url\.path == "(/[^"]*)":', g, re.M)
        out[name] = sorted({p for p in seen if seen.count(p) > 1})
    return out


def ask(base, route, timeout=60):
    try:
        with urllib.request.urlopen(base.rstrip("/") + route, timeout=timeout) as r:
            return r.status, r.read(400000)
    except urllib.error.HTTPError as e:
        return e.code, e.read(400000)
    except (OSError, ValueError) as e:
        return -1, str(e).encode()


def verdict(code, body):
    """'' when it passes, else why not."""
    text = body.decode("utf-8", "replace")
    raw = RAW.search(text)
    if raw:
        return "a system's raw words in the answer: " + raw.group(0)
    if code == -1:
        return "no answer: " + text[:160]
    if code >= 500:
        m = MISSING.search(text)
        pkg = m and (m.group(1) or m.group(2)).split(".")[0]
        if pkg and pkg not in STDLIB and not (ROOT / "lab" / (pkg + ".py")).is_file():
            return ""                                       # a package this machine lacks (the runner's bare Python), not the Studio's fault
        try:
            why = json.loads(text).get("error", "")
        except (ValueError, AttributeError):
            why = text
        return f"{code}: {str(why)[:200]}"
    return ""


def main(argv):
    base = next((a for a in argv if a.startswith("http")), "http://127.0.0.1:41870")
    out = argv[argv.index("--out") + 1] if "--out" in argv else ""
    rs = routes()
    if "--routes" in argv:
        print("\n".join(rs))
        return 0
    twice = shadowed()
    if twice["GET"] or twice["POST"]:                     # said before any question: the second handler of a path never answers
        print("lab-sweep: a path handled twice in lab.py, its second handler never answers: " +
              "; ".join(f"{k} {', '.join(v)}" for k, v in twice.items() if v))
        return 1
    code, _ = ask(base, "/health", 10)
    if code != 200:
        print(f"lab-sweep: the lab does not answer at {base}/health ({code})")
        return 2
    rows, bad, t0 = [], [], time.time()
    for r in rs:
        code, body = ask(base, r)
        why = verdict(code, body)
        rows.append(f"{code}\t{r}\t" + re.sub(r"[\x00-\x1f\x7f\x85\u2028\u2029]", " ", body[:220].decode("utf-8", "replace")))   # one row a route, a picture's bytes too
        if why:
            bad.append(f"{r}: {why}")
        if code == -1 and ask(base, "/health", 10)[0] != 200:
            bad.append(f"the lab stopped answering after {r}")
            break
    if out:
        Path(out).write_text("\n".join(rows) + "\n", encoding="utf-8")
    counts = {}
    for row in rows:
        k = row.split("\t", 1)[0]
        counts[k] = counts.get(k, 0) + 1
    print(f"lab-sweep: {len(rows)} of {len(rs)} GET routes in {time.time() - t0:.0f} s · " + ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())))
    for b in bad:
        print("  FAIL " + b)
    print("lab-sweep: " + ("every route passed" if not bad else f"{len(bad)} failed"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
