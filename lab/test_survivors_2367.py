#!/usr/bin/env python3
"""HERESY 2367: lab/survivors.py with systemd itself, on the processor only, in a studio of its own in a temporary folder (never this Studio's).
A fake lab runs as a transient user unit with KillMode=process, as heresy-lab now does, and starts a fake MiniMax H3 worker, a fake SeedVR2
upscale (the same script names, so the same rule spares them), a tool in a session of its own and one in the lab's group with a child.
  ① the lab killed outright (SIGKILL, no ending of its own): systemd starts it again, and the new lab ends the old lab's tools, the survivors kept;
  ② the unit stopped (SIGTERM to the lab alone): the lab ends its own tools and goes within seconds, the survivors kept;
  ③ a lab of the real code (h3_shots, this process) finds the worker alive in its spool, and when it finishes, sets its video into the shot.
About twenty seconds.  .venv/bin/python lab/test_survivors_2367.py"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

G, R, X = ("\033[32m", "\033[31m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed += bool(ok)
    failed += not ok
    print(f"  {G + 'PASS' if ok else R + 'FAIL'}{X}  {name}" + (f"  ({detail})" if detail and not ok else ""))


def alive(pid):
    try:
        st = Path(f"/proc/{pid}/stat").read_text()
        return st[st.rindex(")") + 2] != "Z"
    except (OSError, ValueError):
        return False


def wait_for(fn, secs=15):
    t0 = time.time()
    while time.time() - t0 < secs:
        r = fn()
        if r:
            return r
        time.sleep(0.2)
    return fn()


FAKE_H3 = r'''
import json, os, sys, time
sp = sys.argv[sys.argv.index("--spool") + 1]
w = lambda st: open(os.path.join(sp, "worker.json"), "w").write(json.dumps({"status": st, "pid": os.getpid(), "gpu": 9, "at": time.time()}))
w("busy")
while not os.path.exists(os.path.join(sp, "go")):
    time.sleep(0.2)
spec = json.load(open(os.path.join(sp, "job.spec")))
open(os.path.join(sp, "t--001--x.done"), "w").write(json.dumps(spec))
w("ready")
'''
FAKE_UP = r'''
import os, sys, time
while not os.path.exists(os.path.join(sys.argv[1], "go")):
    time.sleep(0.2)
'''
FAKE_LAB = r'''
import json, os, signal, subprocess, sys, time
sys.path.insert(0, sys.argv[1])
import survivors
kit, bin_ = sys.argv[2], sys.argv[3]
said = []
survivors.install(say=said.append)
gen = 2 if os.path.exists(os.path.join(kit, "gen1.json")) else 1
py = sys.executable
out = {"lab": os.getpid(), "said": said}
if gen == 1:
    sp = os.path.join(kit, "user/videos/.h3/gpu9-h3")
    out["h3"] = subprocess.Popen(["nice", "-n", "5", py, "-u", os.path.join(bin_, "h3_worker.py"), "--gpu", "9", "--spool", sp], start_new_session=True).pid
    out["up"] = subprocess.Popen([py, "-u", os.path.join(bin_, "upscale_job.py"), os.path.join(kit, "upjob")], start_new_session=True).pid
    out["tool"] = subprocess.Popen(["sleep", "300"], start_new_session=True).pid
    g = subprocess.Popen(["bash", "-c", "sleep 301 & echo $! > " + os.path.join(kit, "grandchild") + "; wait"])
    out["group"] = g.pid
else:
    out["mine"] = subprocess.Popen(["sleep", "302"], start_new_session=True).pid
json.dump(out, open(os.path.join(kit, "gen%d.json" % gen), "w"))
while True:
    time.sleep(1)
'''

kit = Path(tempfile.mkdtemp(prefix="claude-surv-"))
U = f"claude-test-survivors-{os.getpid()}"
units = lambda *a: subprocess.run(["systemctl", "--user", *a], capture_output=True, text=True)
try:
    import videographer as v
    import h3_shots
    bin_ = kit / "bin"
    bin_.mkdir()
    (bin_ / "h3_worker.py").write_text(FAKE_H3)
    (bin_ / "upscale_job.py").write_text(FAKE_UP)
    (kit / "fake_lab.py").write_text(FAKE_LAB)
    (kit / "upjob").mkdir()
    sp = kit / "user/videos/.h3/gpu9-h3"
    sp.mkdir(parents=True)
    plan = {"name": "t", "title": "a test", "seconds": 6, "look": {}, "shots": [
        {"t0": 0, "t1": 3, "words": "one", "section": "verse", "sung": True, "scene": {"shot": "a red wall"}},
        {"t0": 3, "t1": 6, "words": "two", "section": "verse", "sung": True, "scene": {"shot": "a blue door"}}]}
    json.dump(plan, open(kit / "user/videos/t.json", "w"))
    sd = v.shots_dir(kit, "t")
    sd.mkdir(exist_ok=True)
    vid = sd / "20261111-120000-000-001.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(vid)], check=True)
    (sp / "job.spec").write_text(json.dumps({"name": "t", "i": 1, "t0": 3, "t1": 6, "out": str(vid), "mode": "draft", "steps": 8, "seed": 5}))

    print("outside the unit nothing changes")
    import survivors
    env = {k: val for k, val in os.environ.items() if k != "INVOCATION_ID"}
    r = subprocess.run([sys.executable, "-c", f"import sys; sys.path.insert(0, {str(HERE)!r}); import survivors; print(survivors.install(say=lambda s: None))"],
                       capture_output=True, text=True, env=env)
    check("a lab started by hand (no unit): install() does nothing", r.stdout.strip() == "False", r.stdout + r.stderr)

    print("① the lab killed outright")
    r = subprocess.run(["systemd-run", "--user", "--quiet", f"--unit={U}", "-p", "KillMode=process", "-p", "Restart=always", "-p", "RestartSec=1",
                        f"--setenv=HERESY_LAB_UNIT={U}.service", sys.executable, "-u", str(kit / "fake_lab.py"), str(HERE), str(kit), str(bin_)],
                       capture_output=True, text=True)
    check("the fake lab runs as a transient unit with KillMode=process", r.returncode == 0, r.stderr)
    g1 = wait_for(lambda: (kit / "gen1.json").is_file() and (kit / "grandchild").is_file() and json.load(open(kit / "gen1.json")))
    gc = int((kit / "grandchild").read_text())
    check("it started a worker, an upscale, a tool, a group with a child", all(alive(g1[k]) for k in ("h3", "up", "tool", "group")) and alive(gc), g1)
    units("kill", "--kill-whom=main", "-s", "SIGKILL", f"{U}.service")
    g2 = wait_for(lambda: (kit / "gen2.json").is_file() and json.load(open(kit / "gen2.json")), 20)
    check("systemd started the lab again (Restart=always)", bool(g2) and g2.get("lab") != g1["lab"], g2)
    check("the new lab ended the old lab's tool, its group and the group's child",
          wait_for(lambda: not alive(g1["tool"]) and not alive(g1["group"]) and not alive(gc), 6), [alive(g1["tool"]), alive(g1["group"]), alive(gc)])
    check("the H3 worker and the SeedVR2 upscale lived through it", alive(g1["h3"]) and alive(g1["up"]))
    check("the new lab said both", any("ended: 3" in s for s in g2.get("said", [])) and any("lived through the restart: 2" in s for s in g2.get("said", [])), g2.get("said"))

    print("② the unit stopped")
    t0 = time.time()
    units("stop", f"{U}.service")
    took = time.time() - t0
    check("the lab went within seconds", took < 8 and not alive(g2["lab"]), round(took, 1))
    check("it ended its own tool", not alive(g2["mine"]))
    check("the H3 worker and the SeedVR2 upscale still live", alive(g1["h3"]) and alive(g1["up"]))

    print("③ a new lab takes up the worker's shot")
    w = [x for x in h3_shots.workers(kit) if x["gpu"] == 9]
    check("the worker read alive and busy from its spool", w and w[0]["alive"] and w[0]["status"] == "busy", w)
    (sp / "go").touch()
    (kit / "upjob/go").touch()
    wait_for(lambda: list(sp.glob("*.done")), 10)
    done = h3_shots.collect(kit)
    shot = v.get(kit, "t")["shots"][1]
    check("its .done collected, the video set into its shot", done == ["t"] and shot.get("video") == vid.name, (done, shot))
    check("the worker and the upscale ended on their own", wait_for(lambda: not alive(g1["h3"]) and not alive(g1["up"]), 6))
finally:
    units("stop", f"{U}.service")
    units("reset-failed", f"{U}.service")
    for f in ("gen1.json", "gen2.json"):
        try:
            for k, pid in json.load(open(kit / f)).items():
                if isinstance(pid, int) and k != "lab" and alive(pid):
                    os.kill(pid, 9)
        except (OSError, ValueError):
            pass
    shutil.rmtree(kit, ignore_errors=True)

print(f"\ntest_survivors_2367  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
