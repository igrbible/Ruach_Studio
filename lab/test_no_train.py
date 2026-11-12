"""HERESY 2241: no_train.py: a take marked in its meta or its request, a file by its take folder or by its own comment tag (ffmpeg keeps it through a
conversion), an unmarked one left alone; the CLI's exit code for the bash kitchens; the Trainer's preparation refuses a marked file."""
import json, subprocess, sys, tempfile, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import no_train as k
import training

with tempfile.TemporaryDirectory() as t:
    root = Path(t)
    take = root / "outputs" / "20261107-120000-01-read-x"; take.mkdir(parents=True)
    json.dump(k.mark({"title": "x"}, "the Reader · pro", "its terms"), open(take / "meta.json", "w"))
    plain = root / "outputs" / "20261107-120000-01-song"; plain.mkdir(parents=True)
    json.dump({"title": "song"}, open(plain / "meta.json", "w"))
    assert k.of_take(take) and "its terms" in k.of_take(take) and k.of_take(plain) is None
    req_only = root / "outputs" / "r"; req_only.mkdir()
    json.dump({"no_train": True}, open(req_only / "request.json", "w"))
    assert k.of_take(req_only)
    src = root / "tone.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=330:d=0.5", "-metadata", "comment=" + k.comment("the Reader · pro", "x"), str(src)], check=True)
    flac = root / "tone.flac"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), str(flac)], check=True)
    clean = root / "clean.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=330:d=0.5", str(clean)], check=True)
    assert k.of_file(src) and k.of_file(flac) and k.of_file(clean) is None, (k.of_file(src), k.of_file(flac))
    assert subprocess.run([sys.executable, str(HERE / "no_train.py"), str(clean), str(plain)]).returncode == 0
    assert subprocess.run([sys.executable, str(HERE / "no_train.py"), str(clean), str(flac)], capture_output=True).returncode == 1
    # the Trainer's preparation: a raw folder holding a marked file is refused, said by name
    kit = root / "kit"
    raw = kit / "datasets" / "raw" / "mix"; raw.mkdir(parents=True)
    for name, f in (("a.wav", clean), ("b.flac", flac)):
        (raw / name).write_bytes(f.read_bytes())
    job = training.prepare(kit, {"from": "mix", "name": "mixset", "tracks": [{"file": "a.wav"}, {"file": "b.flac"}]})
    for _ in range(200):
        st = training.prepare_status("mixset")
        if st.get("status") != "running":
            break
        time.sleep(0.1)
    assert st.get("status") == "failed" and "never for training" in str(st.get("error")) and "b.flac" in str(st.get("error")), st
    assert not (kit / "datasets" / "prepared" / "mixset").exists()
print("test_no_train: ok")
