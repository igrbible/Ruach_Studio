"""HERESY 2321: a trainer from a plugin (training.plugin_trainers and the rest): offered, its bases taken by the Studio's trainer (an overlay
carried), its plan started in the run's own unit as the room reads a run, its Pause by its stop file, no adapter of it into loras/; and the
trainer loading a checkpoint of any depth with an overlay (trainer/load.py). python3 lab/test_plugin_trainer.py"""
import json, os, sqlite3, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import training  # noqa: E402
import paths  # noqa: E402   HERESY 2330: where the weights live

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


kit = Path(tempfile.mkdtemp())
(kit / "datasets" / "prepared" / "set1").mkdir(parents=True)
(kit / "datasets" / "prepared" / "set1" / "dataset.json").write_text(json.dumps({"tracks": [{"stem": "a"}, {"stem": "b"}]}))
(kit / "training").mkdir()
paths.at(paths.MODELS, kit).mkdir()
(paths.at(paths.MODELS, kit) / "deep.safetensors").write_bytes(b"x")
(paths.at(paths.MODELS, kit) / "over.safetensors").write_bytes(b"x")
check("no plugin: no trainer of a plugin, the Studio's own alone", training.plugin_trainers(kit) == {} and training.plugin_engines(kit) == [])
pl = kit / "user" / "plugins" / "p1"
pl.mkdir(parents=True)
(pl / "plugin.json").write_text(json.dumps({"id": "p1", "name": "P1", "python": sys.executable, "trainers": [{"id": "deep", "script": "t.py"}, {"id": "ruach", "script": "t.py"}, {"id": "out", "script": "../x.py"}]}))
(pl / "t.py").write_text('''import json, sys
req = json.loads(sys.stdin.read())
kit = req.get("kit")
if sys.argv[1] == "describe":
    print(json.dumps({"label": "Deep", "say": "a test", "cards": 1, "fields": [{"key": "lr", "type": "number", "default": 1}],
                      "bases": [{"id": "b1", "label": "Deep as built", "path": kit + "/models/deep.safetensors"},
                                {"id": "b2", "label": "Deep with a save", "path": kit + "/models/deep.safetensors", "overlay": kit + "/models/over.safetensors"}]}))
elif sys.argv[1] == "plan":
    if req["spec"].get("lr") == 0:
        print(json.dumps({"error": "lr 0 refused"})); sys.exit()
    print("noise before the answer")
    print(json.dumps({"cmd": ["sleep", "600"], "env": {"X_TEST": "1"}, "cards": 1, "steps": 100, "per_epoch": 10, "epochs": 10, "save_every": 5,
                      "step": 0, "options": {"lr": req["spec"].get("lr")}, "facts": [["learns", "everything"]], "stop_file": "STOP", "stop_grace_s": 30}))
''')
t = training.plugin_trainers(kit)
check("a plugin's trainer found; one named ruach or out of its folder is not", list(t) == ["deep"], t)
e = training.plugin_engines(kit)
check("offered with its label, fields and bases", len(e) == 1 and e[0]["label"] == "Deep" and len(e[0]["bases"]) == 2, e)
P = training.paths(kit)
c, q, b = training.base_checkpoint(P, {"base": "plugin:deep:b1"})
check("its base taken by the Studio's trainer: the file, bf16, said", c.name == "deep.safetensors" and q == "bf16" and b == "plugin:deep:b1", (c, q, b))
check("a base with an overlay says it", training.plugin_base(kit, "plugin:deep:b2").get("overlay", "").endswith("over.safetensors"))
for ref, why in (("plugin:deep:nope", "a base it does not offer"), ("plugin:none:b1", "a trainer that is not there")):
    try:
        training.base_checkpoint(P, {"base": ref}); check("refused: " + why, False, "taken")
    except FileNotFoundError:
        check("refused: " + why, True)
calls = []
picker = lambda need, role: (calls.append((need, role)) or (1, 24000))  # noqa: E731
try:
    training.train(kit, {"dataset": "set1", "name": "r0", "engine": "deep", "lr": 0}, picker); check("its refusal said", False, "started")
except ValueError as ex:
    check("its refusal said", "lr 0 refused" in str(ex), ex)
started = []
real_run, real_thread = training.subprocess.run, training.threading.Thread


def fake_run(cmd, *a, **k):
    if cmd and cmd[0] == "systemd-run":
        started.append(cmd)

        class R:
            returncode, stdout, stderr = 0, "", ""
        return R()
    return real_run(cmd, *a, **k)


training.subprocess.run = fake_run
training._unit_state = lambda run: "gone" if not started else "active"
watched = []
training.threading.Thread = lambda target, args, daemon: type("T", (), {"start": lambda self: watched.append(args)})()
m = training.train(kit, {"dataset": "set1", "name": "r1", "engine": "deep", "lr": 2}, picker)
meta = json.load(open(kit / "training" / "r1" / "run.json"))
cmd = started[-1] if started else []
check("started in the run's own unit, on the card picked, with its env", "--unit=ruach-train-r1" in cmd and "--setenv=CUDA_VISIBLE_DEVICES=1" in cmd and "--setenv=X_TEST=1" in cmd and cmd[-2:] == ["sleep", "600"], cmd)
check("run.json as the room reads a run", meta["status"] == "running" and meta["steps"] == 100 and meta["tracks"] == 10 and meta["options"]["engine"] == "deep"
      and meta["options"]["save_every"] == 5 and meta["plugin"] == "p1" and meta["no_adapter"] and meta["facts"] == [["learns", "everything"]], meta)
check("its options kept for a resume", meta["options"].get("lr") == 2, meta["options"])
# the step log the trainer writes: the watcher's progress from it
out = kit / "training" / "r1" / "output" / "r1"
out.mkdir(parents=True)
con = sqlite3.connect(out / "loss_log.db")
con.execute("CREATE TABLE steps (step INTEGER PRIMARY KEY, wall_time REAL)")
con.execute("CREATE TABLE metrics (step INTEGER, key TEXT, value_real REAL, value_text TEXT, PRIMARY KEY (step, key))")
for s in range(1, 41):
    con.execute("INSERT INTO steps VALUES(?, ?)", (s, 1000.0 + 8 * s + (500 if s > 30 else 0)))
    con.execute("INSERT INTO metrics VALUES(?, 'loss/loss', ?, NULL)", (s, 2.0))
con.commit()
con.close()
p = training._plugin_progress(out / "loss_log.db")
check("its progress from its step log: the step, the loss, the seconds a step (a pause in it says nothing)", p and p[0] == 40 and abs(p[1] - 2.0) < 1e-9 and p[3] == 8.0, p)
# Pause: its stop file, not SIGINT
sysd = []
training._systemctl = lambda *a: (sysd.append(a), type("R", (), {"stdout": "inv1", "stderr": "", "returncode": 0})())[1]
training.threading.Thread = lambda target, daemon: type("T", (), {"start": lambda self: None})()
r = training.stop(kit, "r1", pause=True)
check("Pause puts its stop file and sends no signal", (kit / "training" / "r1" / "STOP").is_file() and not any(a[0] == "kill" for a in sysd), sysd)
(out / "r1_000000005.safetensors").write_bytes(b"x")
try:
    training.publish(kit, "r1", "output/r1/r1_000000005.safetensors"); check("no save of it into loras/", False, "published")
except ValueError as ex:
    check("no save of it into loras/", "loras/" in str(ex), ex)
check("its saves listed as the room lists a run's", [c["step"] for c in training.checkpoints(kit, "r1")] == [5])
# the trainer's side: a checkpoint of any depth, an overlay over it
training.threading.Thread, training.subprocess.run = real_thread, real_run
sys.path.insert(0, str(Path(__file__).resolve().parent / "trainer"))
import load  # noqa: E402
check("depth_of: the music half's layer count", load.depth_of({"text_encoders.model.layers.37.mlp.x": 0, "text_encoders.model.layers.3.y": 0, "model.diffusion_model.model.layers.40.z": 0}) == 38)
check("depth_of: none", load.depth_of({"a.b": 0}) == 0)
print("test_plugin_trainer: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
