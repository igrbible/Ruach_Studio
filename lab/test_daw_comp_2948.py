"""HERESY 2948 (the agent's item E18 after 2.1.0-rc1, Viktor's 11.11.2026 «Делай как советуешь»: the lane's spectral view, then comping by the
stem's versions): a stretch of a lane laid from another version of the same stem (an edit that names its path), crossfaded in 10 ms as any
laid stretch, in the bounce (daw_mix.render and bounce, given the versions), in the Forge way's pieces (daw_play, on a window) and in what the
mix job loads (daw_mix.comp_paths); a path on a move, a path that is no string, a version not given: refused, never the lane's own sound in its
place. On the processor, no take. python3 lab/test_daw_comp_2948.py"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw_mix as dm  # noqa: E402
import daw_play as dp  # noqa: E402
from plenio_core.errors import PlenioUserError  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:400] + ")"))
    if not ok:
        bad.append(what)


sr, n = 8000, 8000 * 6
t = np.arange(n) / sr
a = np.vstack([0.3 * np.sin(2 * np.pi * 220 * t)] * 2)          # the stem as split: 220 Hz all along
b = np.vstack([0.2 * np.sin(2 * np.pi * 330 * t)] * 2)          # another version of it: 330 Hz all along
P = "derived/clean-1/vocals.flac"
V = lambda strip: {"schema": dm.SCHEMA, "strips": {"v": strip}}
seg = lambda y, s0, s1: y[:, int(s0 * sr):int(s1 * sr)]
comp = {"op": "copy", "a": 2, "b": 3, "to": 2, "path": P}

print("the bounce")
c, rep, _p = dm.render(sr, [("v", a)], V({"edits": [comp]}), alts={"v": {P: b}})
check("2–3 s comped from the other version: its sound there, the lane's own everywhere else",
      np.abs(seg(c, 2.02, 2.98) - seg(b, 2.02, 2.98)).max() < 1e-9 and np.abs(seg(c, 0.5, 1.95) - seg(a, 0.5, 1.95)).max() < 1e-9
      and np.abs(seg(c, 3.05, 5.5) - seg(a, 3.05, 5.5)).max() < 1e-9)
edge = c[:, 2 * sr - 60:2 * sr + 140]
check("  its edges cross in 10 ms, no click (no step larger than the tones' own)", np.abs(np.diff(edge, axis=1)).max() < 0.08, np.abs(np.diff(edge, axis=1)).max())
check("  the report counts it comped", rep["strips"][0].get("edits") == 1 and rep["strips"][0].get("comped") == 1, rep["strips"][0])
sh, _r, _p = dm.render(sr, [("v", a)], V({"offset_s": 0.25, "edits": [comp]}), alts={"v": {P: b}})
check("a lane shifted: the comped version shifted with it (the stretch is the lane's time, both versions read alike)",
      np.abs(seg(sh, 2.02, 2.98) - b[:, int(2.02 * sr) - int(0.25 * sr):int(2.98 * sr) - int(0.25 * sr)]).max() < 1e-9)
mixd, _r, _p = dm.render(sr, [("v", a)], V({"edits": [comp, {"op": "copy", "a": 0.5, "b": 1.0, "to": 4.0}]}), alts={"v": {P: b}})
check("a comp beside a plain copy: each from its own source", np.abs(seg(mixd, 2.02, 2.98) - seg(b, 2.02, 2.98)).max() < 1e-9
      and np.abs(mixd[:, round(4.02 * sr):round(4.02 * sr) + round(0.46 * sr)] - a[:, round(0.52 * sr):round(0.52 * sr) + round(0.46 * sr)]).max() < 1e-9)
bo, _r = dm.bounce(sr, [("v", a)], V({"edits": [comp]}), ["v"], dry=True, alts={"v": {P: b}})
check("a dry bounce of the lane carries the comp too", np.abs(seg(bo, 2.02, 2.98) - seg(b, 2.02, 2.98)).max() < 1e-6, np.abs(seg(bo, 2.02, 2.98) - seg(b, 2.02, 2.98)).max())

print("refused, never quietly the lane's own")
for raw, kw, why in (([comp], {}, "a comped version the render was not given"),
                     ([dict(comp, op="move")], {"alts": {"v": {P: b}}}, "a path on a move"),
                     ([dict(comp, path=5)], {}, "a path that is no string"),
                     ([dict(comp, path="x" * 401)], {}, "a path past 400 characters")):
    try:
        dm.render(sr, [("v", a)], V({"edits": raw}), **kw)
        check("refused: " + why, False, "accepted")
    except PlenioUserError as e:
        check("refused: " + why + " («" + str(e)[:80] + "»)", True)
check("comp_paths: each strip's versions named, once each, none for plain copies",
      dm.comp_paths({"schema": dm.SCHEMA, "strips": {"v": {"edits": [comp, comp, {"op": "copy", "a": 0, "b": 1, "to": 2}]}, "w": {"edits": []}, "x": {}}}) == {"v": [P]}
      and dm.comp_paths(None) == {} and dm.comp_paths({"strips": {"v": "bad"}}) == {})

print("the Forge way's pieces")
spec = {"alts": {"v": {P: "unused"}}}
lane_at = lambda i, m, path="": (b if path == P else a)[:, max(0, i):max(0, i) + m]
win0, win_n = int(1.5 * sr), int(2.0 * sr)                           # a window over the comp's start
y = a[:, win0:win0 + win_n].copy()
w = dp._place(y, lane_at, win0, win_n, n, sr, [("copy", 2.0, 3.0, 2.0, P)], dm.EDGE_SECONDS)
whole = dm.place(a.copy(), a, sr, [("copy", 2.0, 3.0, 2.0, P)], {P: b})
check("a window of the piece laid as the whole render lays it (comp included)", np.abs(w - whole[:, win0:win0 + win_n]).max() < 1e-9, np.abs(w - whole[:, win0:win0 + win_n]).max())
w4 = dp._place(y, lane_at, win0, win_n, n, sr, [("copy", 2.0, 3.0, 2.0)], dm.EDGE_SECONDS)
check("  an old four-field edit still reads (a plain copy)", w4.shape == y.shape)

print("test_daw_comp_2948:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
