"""HERESY 1757: a window sung anew with adapters of its own (section.window), against a fake engine: the draft sings on from the take's own codes
up to the ramp before the window, with the take's adapters fading out and the window's fading in on waves the engine reads (its curve's points,
half a cosine between them, as sliders.h); the replay joins the draft's codes to the ramp's end with the take's own after it, on the take's sound
seed, the same waves over the whole stream; replaced.json, the workspace and the note; the drafts to the trash; refusals.
python3 lab/test_section_window.py"""
import json
import math
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import section  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:600] + ")"))
    if not ok:
        bad.append(what)


def wave(c, t):
    """the engine's slider_curve_at (sliders.h): the first value before, the last after, half a cosine between points"""
    if not c:
        return 1.0
    c = sorted(c, key=lambda p: p[0])
    if t <= c[0][0]:
        return c[0][1]
    for i in range(1, len(c)):
        if t <= c[i][0]:
            t0, t1 = c[i - 1][0], c[i][0]
            u = (t - t0) / (t1 - t0) if t1 > t0 else 1.0
            return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * (0.5 - 0.5 * math.cos(math.pi * u))
    return c[-1][1]


# the waves, alone: the take's x at 0.6, the window's y at 0.8/0.5; window 10–20 s, ramps 2 s, over 40 s
own = [{"id": "x.safetensors", "ar": 0.6, "nar": 0.6}]
win = section.window_loras([{"id": "dir/y.safetensors", "ar": 0.8, "nar": 0.5}])
L = section.window_curves(own, win, 8, 10, 20, 22, 40)
X, Y = L[0], L[1]
at = lambda e, s: wave(e["curve"], s / 40)   # noqa: E731
check("the take's adapter: whole outside, gone over the window, half way down halfway through the ramp; its strengths its own",
      at(X, 4) == 1 and at(X, 30) == 1 and at(X, 15) == 0 and abs(at(X, 9) - 0.5) < 1e-9 and abs(at(X, 21) - 0.5) < 1e-9 and X["ar"] == 0.6 and "curve" in X, X)
check("  the window's: nothing outside, whole over the window, its own strengths (0.8 music, 0.5 sound)",
      at(Y, 4) == 0 and at(Y, 30) == 0 and at(Y, 15) == 1 and abs(at(Y, 9) - 0.5) < 1e-9 and Y["ar"] == 0.8 and Y["nar"] == 0.5 and Y["id"] == "dir/y.safetensors", Y)
both = section.window_curves([{"id": "x.safetensors", "ar": 0.6, "nar": 0.6}], section.window_loras([{"id": "x.safetensors", "ar": 0.3, "curve": "arch"}]), 8, 10, 20, 22, 40)
check("  one adapter in both: one entry at the take's strength, the window's share inside on its arch (0.5 × 0.15 at the edges, 0.5 at the middle)",
      len(both) == 1 and both[0]["ar"] == 0.6 and abs(wave(both[0]["curve"], 15 / 40) - 0.5) < 1e-9 and abs(wave(both[0]["curve"], 10 / 40) - 0.075) < 1e-9 and
      wave(both[0]["curve"], 30 / 40) == 1, both)
check("  at most 64 points a wave (the engine's limit)", all(len(e["curve"]) <= 64 for e in L + both))
for raw, why in (([{"id": "../x"}], "an id out of loras/"), ([{"id": "y", "ar": 2.5}], "a strength over 2"), ([{"id": "y", "curve": "zigzag"}], "a wave there is not"),
                 ([{"id": "y"}, {"id": "y"}], "one adapter twice"), ([{"id": str(i)} for i in range(9)], "nine adapters")):
    try:
        section.window_loras(raw)
        check("refused: " + why, False, "taken")
    except ValueError:
        check("refused: " + why, True)

# the run, end to end against a fake engine
root = Path(tempfile.mkdtemp())
out = root / "outputs"
FPS = section.FPS
take = "20261023-120000-take"
codes = [100 + (i % 500) for i in range(40 * FPS)]
(out / take).mkdir(parents=True)
json.dump({"title": "Take", "lyrics": "[verse]\nla la", "seed": 777, "lm_seed": 1, "semantic_tokens": ",".join(map(str, codes)), "duration": 40,
           "loras": own, "lora_groups": [], "semantic_sampling": {"max_tokens": 9000}}, open(out / take / "request.json", "w"))
sent, jobs, trashed, posted = [], {}, [], []
n = [0]


def engine(path, body=None):
    if path == "/synth":
        n[0] += 1
        jid, name = f"job{n[0]}", f"20261023-1300{n[0]:02d}-made"
        (out / name).mkdir()
        if body.get("semantic_tokens"):                # a replay: the codes given
            toks = body["semantic_tokens"]
        else:                                          # a draft: the kept start, then new codes to its length
            keep = [int(x) for x in str(body.get("semantic_keep") or "").split(",") if x]
            toks = ",".join(map(str, keep + [900 + i % 7 for i in range(round(body["duration"] * FPS) - len(keep))]))
        json.dump(dict(body, semantic_tokens=toks), open(out / name / "request.json", "w"))
        sent.append(body)
        jobs[jid] = name
        return {"id": jid}
    if path.startswith("/job?id="):
        return {"status": "done", "takes": [jobs[path.split("=", 1)[1]]]}
    raise AssertionError(path)


class Col:
    @staticmethod
    def load(cfg):
        return {"workspaces": {"Songs": [take], "\U0001f48e Kept": [take]}, "locks": {}}

    @staticmethod
    def frozen_ws(d, w):
        return False

    @staticmethod
    def collection_post(cfg, outputs, body):
        posted.append(body)


section.setup(outputs=out, engine=engine, say=lambda s: None, frozen=lambda: set(), trash=lambda names: trashed.extend(names), collection=Col, config_dir=lambda: root)
r = section.window(take, 10, 20, "[verse]\nla la", versions=1, pre=2, post=2, loras=[{"id": "dir/y.safetensors", "ar": 0.8, "nar": 0.5}])
for _ in range(300):                                   # the job polls the engine every two seconds: a draft and a replay
    st = section.job(r["id"])
    if st and st["status"] in ("done", "failed"):
        break
    time.sleep(0.05)
st = section.job(r["id"])
check("the job: one version made, said as «window 0:10–0:20», its stretch the window with its ramps (8–22 s)",
      st["status"] == "done" and len(st["takes"]) == 1 and st["section"] == "window 0:10–0:20" and st["a"] == 8 and st["b"] == 22, st)
draft, replay = sent[0], sent[1]
kA, kB = 8 * FPS, 22 * FPS
check("the draft sings on from the take's own codes up to the ramp before (8 s), its length the window's end and four seconds, a new music seed",
      draft["semantic_keep"] == ",".join(map(str, codes[:kA])) and draft["duration"] == 26 and draft["lm_seed"] != 1 and "semantic_tokens" not in draft, draft.get("duration"))
dl = {e["id"]: e for e in draft["loras"]}
check("  its adapters on waves over its own 26 s: the take's gone at 15 s, the window's whole there",
      wave(dl["x.safetensors"]["curve"], 15 / 26) == 0 and wave(dl["dir/y.safetensors"]["curve"], 15 / 26) == 1 and wave(dl["x.safetensors"]["curve"], 4 / 26) == 1, dl)
made_codes = [int(x) for x in json.load(open(out / st["takes"][0] / "request.json"))["semantic_tokens"].split(",")]
dcodes = [int(x) for x in json.load(open(out / "20261023-130001-made" / "request.json"))["semantic_tokens"].split(",")]
check("the replay: the draft's codes up to the ramp's end (22 s), the take's own from there; its length the take's", made_codes == dcodes[:kB] + codes[kB:] and len(made_codes) == len(codes),
      (len(made_codes), len(codes)))
rl = {e["id"]: e for e in replay["loras"]}
check("  on the take's own sound seed, its parent the take, the same waves over its 40 s stream",
      replay["seed"] == 777 and replay["parent"] == take and "semantic_keep" not in replay and wave(rl["x.safetensors"]["curve"], 30 / 40) == 1 and
      wave(rl["x.safetensors"]["curve"], 15 / 40) == 0 and wave(rl["dir/y.safetensors"]["curve"], 15 / 40) == 1 and wave(rl["dir/y.safetensors"]["curve"], 30 / 40) == 0, rl)
mk = section.mark(st["takes"][0])
check("replaced.json: the stretch 8–22 s for the player's mark, the window, its ramps and adapters", mk and mk["a"] == 8 and mk["b"] == 22 and mk["kind"] == "window" and
      mk["window"]["a"] == 10 and mk["window"]["loras"][0]["id"] == "dir/y.safetensors", mk)
check("  put in the take's open workspace, never the 💎 one; a note says what it is; the draft to the trash",
      [p["workspace"] for p in posted if p["op"] == "ws-add"] == ["Songs"] and any(p["op"] == "note" and "A window sung anew: 0:10–0:20 with y 0.8/0.5" in p["text"] for p in posted) and
      trashed == ["20261023-130001-made"], (posted, trashed))
for kw, why in (({"a": 30, "b": 45}, "a window past the take's end"), ({"a": 10, "b": 10.5}, "a window under a second"), ({"pre": 12}, "a ramp over ten seconds"),
                ({"versions": 3}, "three versions"), ({"lyrics": " "}, "no lyrics")):
    args = dict({"a": 10, "b": 20, "lyrics": "la", "versions": 1, "pre": 2, "post": 2, "loras": []}, **kw)
    try:
        section.window(take, **args)
        check("refused: " + why, False, "taken")
    except ValueError:
        check("refused: " + why, True)
req = json.load(open(out / take / "request.json"))
json.dump(dict(req, loras=[{"id": "x.safetensors", "ar": 0.6, "nar": 0.6, "curve": "arch"}]), open(out / take / "request.json", "w"))
try:
    section.window(take, 10, 20, "la", versions=1)
    check("refused: the take's own adapters on a wave of their own (not made yet, said)", False, "taken")
except ValueError as e:
    check("refused: the take's own adapters on a wave of their own (not made yet, said)", "wave of their own" in str(e), e)
print("test_section_window:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
