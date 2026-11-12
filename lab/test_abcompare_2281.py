"""HERESY 2281 · 2286: the lab's /abcompare, First and second of two to four versions (1991's analyzer, the Refiner's node, each against the
first), for the compare window and the Library's menu: a job (202 while it runs, its name in /health's jobs), then a pair a folder (its numbers, its
verdict as templates, its pictures in the words given) and with more than two the spectrograms of all side by side; kept by the files, the names
and the words; a file of a take's tree as a side; one side or five, a path out of the take, an unknown take, a key or a file not of a report refused.
    python3 lab/test_abcompare_2281.py   (a lab of its own on a free port, its library in a temporary folder)"""
import importlib.util
import json
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
fails = 0


def check(what, ok, said=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else f"  ({said})"))


tmp = Path(tempfile.mkdtemp(prefix="ab2286-"))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
lab.OUTPUTS = tmp / "outputs"
lab.CACHE = tmp / "cache"
sr, n = 48000, 48000 * 10
rng = np.random.default_rng(7)
t = np.arange(n) / sr
music = 0.2 * np.sin(2 * np.pi * 220 * t) * (1 + 0.5 * np.sin(2 * np.pi * 0.5 * t)) + 0.05 * rng.standard_normal(n)
x = np.stack([music, 0.9 * music], 1)
takes = []
for name, y in (("20261109-120000-01-ab-a", x), ("20261109-120100-01-ab-b", np.clip(x * 1.6, -0.7, 0.7))):
    d = lab.OUTPUTS / name
    d.mkdir(parents=True)
    (d / "request.json").write_text(json.dumps({"title": name}), encoding="utf-8")
    sf.write(str(d / "audio.wav"), y, sr)
    takes.append(name)
tree = lab.OUTPUTS / takes[0] / "derived" / "r1"
tree.mkdir(parents=True)
sf.write(str(tree / "out.wav"), x * 0.5, sr)
srv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
P = srv.server_address[1]


def get(path):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{P}{path}", timeout=60) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def ask(sides, names, words=None):
    q = {"s": json.dumps(sides), "names": json.dumps(names)}
    if words:
        q["words"] = json.dumps(words, ensure_ascii=False)
    return "/abcompare?" + urllib.parse.urlencode(q)


def whole(sides, names, words=None):
    st, _h, b = get(ask(sides, names, words))
    t0 = time.time()
    while st == 202 and time.time() - t0 < 300:
        time.sleep(0.5)
        st, _h, b = get(ask(sides, names, words))
    return st, json.loads(b)


two = [[takes[0], ""], [takes[1], ""]]
st, _h, b = get(ask(two, ["1 · a", "2 · b"]))
j = json.loads(b)
check("asked: 202 and a job (queued or running), its key", st == 202 and j.get("status") in ("queued", "running") and len(j.get("key", "")) == 20, (st, j))
check("the job stands in /health's jobs while it runs (a restart sees it)", any(k.startswith("ab ") for k in json.loads(get("/health")[2]).get("jobs", {})))
st, R = whole(two, ["1 · a", "2 · b"])
p1 = (R.get("pairs") or [{}])[0]
check("two: 200, one pair, its sides numbered 1 and 2, its verdict as templates, no grid", st == 200 and R.get("n") == 2 and len(R["pairs"]) == 1 and p1.get("nums") == ["1", "2"]
      and p1.get("verdict12") and all(isinstance(s[0], str) for s in p1["verdict12"]) and R.get("grid") is False, (st, list(R)[:10]))
check("the second is louder by the measure", p1.get("level_db", 0) > 2 and any("louder than" in s[0] for s in p1["verdict12"]), p1.get("level_db"))
k = R["key"]
for f, ctype in (("pair1/compare.json", "application/json"), ("pair1/spectrograms.jpg", "image/jpeg"), ("pair1/measures.png", "image/png")):
    s_, h, body = get(f"/abcompare/file?key={k}&f={f}")
    check(f"its {f}: 200, {ctype}, not empty", s_ == 200 and h.get("Content-Type", "").startswith(ctype) and len(body) > 100, (s_, h.get("Content-Type")))
t1 = time.time()
st, _h, b = get(ask(two, ["1 · a", "2 · b"]))
check("asked again: 200 at once, the same key (kept)", st == 200 and json.loads(b)["key"] == k and time.time() - t1 < 2, st)
st, Rw = whole(two, ["1 · a", "2 · b"], {"time": "время, с", "diff": "{1} − {0} {7}"})
check("words given (the page's language) are a run of their own; a word that does not take its places is left out, not a failure", st == 200 and Rw["key"] != k, (st, Rw.get("error")))
three = two + [[takes[0], "derived/r1/out.wav"]]
st, R3 = whole(three, ["1 · a", "2 · b", "3 · tree"])
check("three, a file of the tree the third: two pairs (1 against 2, 1 against 3 at −6 dB), the grid of all", st == 200 and R3.get("n") == 3 and len(R3["pairs"]) == 2
      and R3["pairs"][1]["nums"] == ["1", "3"] and abs(R3["pairs"][1]["level_db"] + 6.02) < 0.3 and R3.get("grid") is True, (st, R3.get("error")))
s_, h, body = get(f"/abcompare/file?key={R3['key']}&f=grid.jpg")
check("its grid.jpg: 200, a picture", s_ == 200 and h.get("Content-Type", "").startswith("image/jpeg") and len(body) > 1000, s_)
check("one side, or five, refused (404)", get(ask(two[:1], []))[0] == 404 and get(ask(two * 2 + two[:1], []))[0] == 404)
check("a path out of the take refused (404)", get(ask([[takes[0], "../../etc/passwd"], two[1]], []))[0] == 404)
check("an unknown take refused (404)", get(ask([["20261109-000000-nope", ""], two[1]], []))[0] == 404)
check("a key not a report's, or a file not of it, refused (404)", get(f"/abcompare/file?key={k}&f=../many.json")[0] == 404 and get(f"/abcompare/file?key={k}&f=many.json")[0] == 404
      and get("/abcompare/file?key=../../x&f=grid.jpg")[0] == 404 and get(f"/abcompare/file?key={'0' * 20}&f=pair1/compare.json")[0] == 404)
check("no part folder left behind", not list((lab.CACHE / "ab").glob("*.part")))
srv.shutdown()
shutil.rmtree(tmp, ignore_errors=True)
print("all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
