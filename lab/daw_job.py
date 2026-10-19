"""HERESY 1470 · the DAW's mixdown: a set of stems through Plenio's stem mixer (plenio_core.audio.stems, Apache-2.0), each strip
the version picked for it, the rest as Plenio keeps it (the source less the set's own parts); written beside the take's other
branches. A mix that peaks above −0.3 dBFS is lowered to it and says by how much (the master is the next step, not this one).
    daw_job.py TAKE_DIR SPEC.json OUTDIR      SPEC: {"set": …, "mix": plenio.stem_mix/1 | ruach.mix/1, "versions": {strip: path}, "print": bool}
HERESY 1531: a ruach.mix/1 value is the Refiner's mixer (daw_mix.py), rendered in the order the page plays it; "print" writes each
audible strip after its pan and each return as its own file beside the mix (stems/NAME.flac).
Prints one line of JSON: the file, the report, the loudness and the time."""
import json, sys, time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw
import daw_mix   # HERESY 1531
from plenio_core.audio import stems as pst
from plenio_core.audio.effects import effects_for
from plenio_core.audio.loudness import measure

t0 = time.time()
d, spec, out = Path(sys.argv[1]), json.load(open(sys.argv[2], encoding="utf-8")), Path(sys.argv[3])
derived = []
for m in sorted((d / "derived").glob("*/manifest.json")):
    try:
        derived.append(json.load(open(m, encoding="utf-8")))
    except ValueError:
        pass
info = daw.set_info(d, spec["set"], derived)
picked = spec.get("versions") or {}


def read(rel):
    x, sr = sf.read(str(daw._inside(d, rel)), dtype="float32", always_2d=True)
    return x.T


source = read(info["source"]).astype(np.float64)
frames, ch = source.shape[1], source.shape[0]


def fit(x):
    if x.shape[0] != ch:
        x = np.repeat(x[:1], ch, axis=0) if x.shape[0] == 1 else x[:ch]
    return np.pad(x, ((0, 0), (0, max(0, frames - x.shape[1]))))[:, :frames]


names, signals, residual, used = [], [], source.copy(), {}
for s in info["strips"]:
    own = fit(read(s["path"]))
    residual -= own                                   # the rest: what the source holds beyond the set's own parts
    path = picked.get(s["name"]) or s["path"]
    if path not in [v["path"] for v in s["versions"]]:
        raise SystemExit(f"{path} is not a version of {s['name']}")
    names.append(s["name"])
    signals.append((own if path == s["path"] else fit(read(path))).astype(np.float32))
    used[s["name"]] = path
files = [{"name": "mix", "file": "mix.flac", "seconds": round(frames / info["rate"], 2)}]
out.mkdir(parents=True, exist_ok=True)
if (spec.get("mix") or {}).get("schema") == daw_mix.SCHEMA:     # HERESY 1531: the Refiner's mixer
    mixed, report, printed = daw_mix.render(info["rate"], [(n, x.astype(np.float64)) for n, x in zip(names, signals)] + [(daw.REST, residual)],
                                           spec["mix"], keep=bool(spec.get("print")))
    lowered = report["lowered_db"]
    if printed:
        (out / "stems").mkdir(exist_ok=True)
        for n, y in printed.items():
            sf.write(str(out / "stems" / f"{n}.flac"), np.clip(y.T, -1.0, 1.0).astype(np.float32), info["rate"], subtype="PCM_24")
            files.append({"name": n, "file": f"stems/{n}.flac", "seconds": round(frames / info["rate"], 2)})
else:
    stems = pst.Stems(info["rate"], tuple(names), tuple(signals), residual.astype(np.float32), source=info["set"])
    settings = pst.parse_mix(json.dumps(spec.get("mix") or {"schema": pst.MIX_SCHEMA, "strips": {}}))
    mixed, report = pst.mix(stems, settings, effects=effects_for(settings.buses))
    peak = float(np.max(np.abs(mixed))) if mixed.size else 0.0
    lowered = 0.0
    if peak > 10 ** (-0.3 / 20):
        lowered = round(20 * np.log10(peak) + 0.3, 2)
        mixed = mixed * (10 ** (-0.3 / 20) / peak)
sf.write(str(out / "mix.flac"), np.clip(mixed.T, -1.0, 1.0).astype(np.float32), info["rate"], subtype="PCM_24")
loud = measure(mixed, info["rate"]).to_dict()
print(json.dumps({"files": files, "report": report,
                  "versions": used, "lowered_db": lowered, "loudness": loud, "took": round(time.time() - t0, 1)}, ensure_ascii=False, default=str))
