"""HERESY 1521: the held-out's best checkpoint published beside the last. python3 lab/test_publish_best.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import training  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def run_dir(kit, run, steps, best):
    d = Path(kit) / "training" / run
    o = d / "output" / run
    o.mkdir(parents=True)
    json.dump({"tracks": 10, "status": "stopped"}, open(d / "run.json", "w"))
    for s in steps:
        (o / f"{run}_{s:09d}.safetensors").write_bytes(b"x" * s)
    (o / f"{run}.safetensors").write_bytes(b"x" * steps[-1])
    if best is not None:
        json.dump({"best": {"step": best, "flow": 0.6}, "history": []}, open(o / "val.json", "w"))
    return d


with tempfile.TemporaryDirectory() as t:
    run_dir(t, "voice-a", [20, 30, 40, 50], 30)
    lora = training.publish_best(Path(t), "voice-a")
    f = Path(t) / "loras" / "voice-a" / "voice-a-e003.safetensors"
    check("the held-out best (step 30, epoch 3) published as RUN-e003, a link to its checkpoint", lora == "voice-a/voice-a-e003.safetensors" and f.is_file() and f.stat().st_size == 30, lora)
    check("published twice: the same file, no second", training.publish_best(Path(t), "voice-a") == lora and len(list((Path(t) / "loras" / "voice-a").iterdir())) == 1)
    run_dir(t, "voice-b", [20, 30], None)
    check("a run that measured nothing held out: nothing", training.publish_best(Path(t), "voice-b") is None)
    d = run_dir(t, "voice-c", [20, 30], 25)
    check("a best whose checkpoint is not there: nothing", training.publish_best(Path(t), "voice-c") is None)
    (d / "output" / "voice-c" / "val.json").write_text("not json")
    check("a broken val.json: nothing, no error", training.publish_best(Path(t), "voice-c") is None)
print("test_publish_best:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
