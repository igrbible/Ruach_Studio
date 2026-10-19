"""HERESY 1470: the DAW's lab half on a made-up take: the strips of a set (the instrumental and the whole voice give way to their
parts), a version from a branch of the stem's length, the rest, a chunk, and the mixdown: neutral is the source again, a muted
strip leaves exactly that strip out, a solo leaves only it."""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np, soundfile as sf
sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw

root = Path(tempfile.mkdtemp())
d = root / "take"; (d / "derived/stems-eight").mkdir(parents=True); (d / "derived/plugin-x-vocal-1").mkdir(parents=True)
rate, n = 48000, 48000 * 3
rng = np.random.default_rng(7)
parts = {k: (rng.standard_normal((n, 2)) * 0.05).astype(np.float32) for k in ("lead_vocal", "backing_vocals", "drums", "bass", "other")}
miss = (rng.standard_normal((n, 2)) * 0.01).astype(np.float32)          # what the separation missed
song = sum(parts.values()) + miss
sf.write(d / "audio.wav", song, rate, subtype="FLOAT")
for k, x in parts.items():
    sf.write(d / f"derived/stems-eight/{k}.flac", x, rate, subtype="PCM_24")
sf.write(d / "derived/stems-eight/instrumental.flac", parts["drums"] + parts["bass"] + parts["other"], rate, subtype="PCM_24")
sf.write(d / "derived/stems-eight/vocals.flac", parts["lead_vocal"] + parts["backing_vocals"], rate, subtype="PCM_24")
names = ["instrumental", "vocals", "lead_vocal", "backing_vocals", "drums", "bass", "other"]
json.dump({"id": "stems-eight", "kind": "stems", "mode": "eight", "source": "the take", "files": [{"name": k, "file": k + ".flac"} for k in names]},
          open(d / "derived/stems-eight/manifest.json", "w"))
clean = (parts["lead_vocal"] * 0.5).astype(np.float32)
sf.write(d / "derived/plugin-x-vocal-1/vocal.flac", clean, rate, subtype="PCM_24")
pm = {"id": "plugin-x-vocal-1", "kind": "plugin", "label": "Clean voice", "source": "derived/stems-eight/lead_vocal.flac",
      "files": [{"name": "voice", "file": "vocal.flac", "path": "derived/plugin-x-vocal-1/vocal.flac"}]}
json.dump(pm, open(d / "derived/plugin-x-vocal-1/manifest.json", "w"))
info = daw.set_info(d, "derived/stems-eight", [pm])
assert [s["name"] for s in info["strips"]] == ["lead_vocal", "backing_vocals", "drums", "bass", "other"], info["strips"]
assert [v["label"] for v in info["strips"][0]["versions"]] == ["as split", "Clean voice"] and len(info["strips"][1]["versions"]) == 1
try:
    daw.set_info(d, "../../etc", []); raise SystemExit("a path outside the take was taken")
except ValueError:
    pass
import io
x, _ = sf.read(io.BytesIO(daw.chunk(d, info, "rest", "", 1.0, 0.5)), dtype="float64")
assert x.shape == (24000, 2) and np.max(np.abs(x - miss[48000:72000])) < 2e-4, np.max(np.abs(x - miss[48000:72000]))
try:
    daw.chunk(d, info, "drums", "derived/plugin-x-vocal-1/vocal.flac", 0, 1); raise SystemExit("a version of another stem was played")
except ValueError:
    pass


def mixdown(mix, versions=None):
    out = root / f"out-{abs(hash(json.dumps(mix, sort_keys=True) + json.dumps(versions or {})))}"
    spec = root / "spec.json"
    json.dump({"set": "derived/stems-eight", "mix": mix, "versions": versions or {}}, open(spec, "w"))
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("daw_job.py")), str(d), str(spec), str(out)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-600:]
    res = json.loads(r.stdout.strip().splitlines()[-1])
    y, _ = sf.read(out / "mix.flac", dtype="float64")
    return y, res


S = "plenio.stem_mix/1"
y, res = mixdown({"schema": S, "strips": {}})
assert res["report"]["neutral"] and res["lowered_db"] == 0.0 and np.max(np.abs(y - song)) < 1e-4, np.max(np.abs(y - song))
y, res = mixdown({"schema": S, "strips": {"drums": {"mute": True}}})
assert np.max(np.abs(y - (song - parts["drums"]))) < 1e-4
y, res = mixdown({"schema": S, "strips": {"bass": {"solo": True}}})
assert np.max(np.abs(y - parts["bass"])) < 1e-4
y, res = mixdown({"schema": S, "strips": {}}, {"lead_vocal": "derived/plugin-x-vocal-1/vocal.flac"})
assert np.max(np.abs(y - (song - parts["lead_vocal"] + clean))) < 1e-4 and res["versions"]["lead_vocal"].endswith("vocal.flac")
y, res = mixdown({"schema": S, "strips": {"other": {"gain_db": -6.0, "muted": [[1.0, 2.0]]}}})
k = 10 ** (-6 / 20)
assert np.max(np.abs(y[:40000] - (song - parts["other"] + parts["other"] * k)[:40000])) < 1e-4
assert np.max(np.abs(y[49000:95000] - (song - parts["other"])[49000:95000])) < 1e-4
pk = daw.peaks(d, info, "drums", info["strips"][2]["path"], 300)
assert len(pk) == 300 and abs(max(pk) - float(np.abs(parts["drums"]).max())) < 2e-3, (len(pk), max(pk))
pr = daw.peaks(d, info, "rest", "", 300)
assert abs(max(pr) - float(np.abs(miss).max())) < 2e-3, max(pr)
# HERESY 1487: the wave of any file of the tree: n stretches, 0…1, its length; a path outside the take refused
def _check_file_peaks():
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        x = np.zeros((48000 * 2, 2), dtype="float32"); x[48000:48000 + 4800] = 0.5
        (d / "derived" / "b").mkdir(parents=True); sf.write(str(d / "derived" / "b" / "a.flac"), x, 48000)
        pk, secs = daw.file_peaks(d, "derived/b/a.flac", 100)
        assert len(pk) == 100 and abs(secs - 2.0) < 1e-6 and max(pk) == 0.5 and pk[0] == 0.0 and pk[50] == 0.5, (pk[:3], pk[48:53], secs)
        try:
            daw.file_peaks(d, "../x.flac", 100); raise SystemExit("read a file outside the take")
        except (ValueError, OSError):
            pass


_check_file_peaks()
print("daw: 15 checks passed")
