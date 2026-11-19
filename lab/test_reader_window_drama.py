"""HERESY 2698: Drama 3's window mode without a card: the server's context and the frame cap, a piece that ran out of frames read again with
the whole cap and said, the window's history (first pinned, the latest that fit), and the manifests reaching the lab (window, bridge 2695).
.venv/bin/python lab/test_reader_window_drama.py"""
import base64
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
spec = importlib.util.spec_from_file_location("drama_engine", LAB / "reader_engines" / "drama3" / "engine.py")
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)
fails = 0


def check(name, ok, detail=""):
    global fails
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  (" + str(detail) + ")"))


h = {"device": "xpu", "vk": 0, "threads": 8, "model": Path("m.gguf"), "cel": 28, "opts": {}}
check("the server's context: 4096 unless the window", E.config(h, 1)["models"][0]["session_options"]["fish_drama3.context_length"] == 4096)
h["ctx"], h["fcap"] = E.WINDOW_CONTEXT, E.WINDOW_FRAMES
check("the window's server: 16 384 rows", E.config(h, 1)["models"][0]["session_options"]["fish_drama3.context_length"] == 16384)
para = "Слово " * 200
check("a 1200-character paragraph: 1400 frames before, 2048 in the window", E.frames(para) == 1400 and E.frames(para, 2048) == 2048, (E.frames(para), E.frames(para, 2048)))

import io  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

buf = io.BytesIO()
sf.write(buf, np.zeros(4410, dtype=np.float32), 44100, format="WAV")
wav = base64.b64encode(buf.getvalue()).decode()
take = base64.b64encode(json.dumps({"vq_codes": [[1] * 5] * 10}).encode()).decode()
asked = []


def fake(limit_twice):
    def post(hh, b, timeout=0, path=""):
        asked.append(b["request"]["max_tokens"])
        lim = limit_twice or len(asked) == 1
        return json.dumps({"audio": wav, "artifacts": [{"kind": "acoustic_tokens", "id": "drama3_take", "payload": take}],
                           "custom_schema_output": {"schema": "drama3_generation_v1", "value": {"frames": 5, "reached_limit": lim}}}).encode()
    return post


with tempfile.TemporaryDirectory() as d:
    log = Path(d) / "s.log"
    log.write_text("start\n", encoding="utf-8")
    hh = {"tasks": True, "log": log, "fcap": 2048}
    E._post = fake(False)
    E.say(hh, "Короткий кусок.", None, {"temperature": 0.8})
    check("a piece that ran out of frames read again once, with the whole cap", asked == [E.frames("Короткий кусок.", 2048), 2048], asked)
    check("  and said: not limited the second time, retried", hh["last_codes"]["reached_limit"] is False and hh["last_codes"]["retried"] is True, hh["last_codes"])
    asked.clear()
    E._post = fake(True)
    with open(log, "a") as f:
        f.write("[fish_drama3] max_tokens reduced from 2048 to 1800 to fit fish_drama3.context_length after 14584 prompt rows\n")
    hh2 = {"tasks": True, "log": log, "fcap": 2048}
    E.say(hh2, "Короткий кусок.", None, {"temperature": 0.8})
    check("still out of frames at the cap: kept and said (reached_limit, max_tokens)", hh2["last_codes"]["reached_limit"] is True and hh2["last_codes"]["max_tokens"] == 2048, hh2["last_codes"])

src = (LAB / "reader.py").read_text(encoding="utf-8")
ns = {}
for fn in ("def _window_of(", "def window_history("):
    i = src.index(fn)
    exec(src[i:src.index("\n\n\ndef ", i)], ns)
win = ns["_window_of"](json.loads((LAB / "reader_engines" / "drama3" / "engine.json").read_text(encoding="utf-8"))["window"])
check("Drama 3's manifest: a window of 16 384, 2048 frames, 8192 rows of prompt, 1200 characters", win == {"context": 16384, "frames": 2048, "history_rows": 8192, "piece_chars": 1200}, win)
items = [(k, "x" * 1000, f"c{k}", 1500) for k in range(6)]     # each piece 1500 frames + 500 rows of words
hx = ns["window_history"](items, win, 300, 1000)               # 8192 − 300 − 500 = 7392: the first (2000) and the latest two (4000)
check("the window: the first piece pinned and the latest two that fit, in order", [x[0] for x in hx] == [0, 4, 5], [x[0] for x in hx])
check("nothing before the first piece: no history", ns["window_history"]([], win, 300, 1000) == [])
small = dict(win, history_rows=1000)
check("a first piece that does not fit leaves the latest that do", [x[0] for x in ns["window_history"]([(0, "a" * 4000, "c", 1500), (1, "b", "c", 100)], small, 300, 100)] == [1])

# the lab's own engine from each manifest: the window and the bridge reach it (2695's bridge never did)
import reader  # noqa: E402
reader.H.setdefault("kit", str(LAB.parent))          # the kit only, no threads (reader.setup starts its own)
dr = reader._engine_of(LAB / "reader_engines" / "drama3", False)
hg = reader._engine_of(LAB / "reader_engines" / "higgs", False)
check("the lab's Drama 3 has its window; its bridge off", dr["window"] == win and dr["bridge"] == "", (dr.get("window"), dr.get("bridge")))
check("the lab's Higgs has the bridge for a narration (2695), no window", hg["bridge"] == "narration" and hg["window"] is None, (hg.get("bridge"), hg.get("window")))
check("bridge_default on the lab's own engines: Higgs's narration yes, Drama's no", reader.bridge_default({}, hg, "narration") is True and reader.bridge_default({}, dr, "narration") is False)
print("all ok" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
