"""Remaster one take with the Debunker v6 pipeline (lab/debunker.py), HERESY 1022.

The Debunker's own gnat() runs as it is, on the settings the page sends: the take itself, or
a set of its stems mixed by the Debunker with a preset and per-stem levels; then metadata
strip, cleanup and fade, de-ess, 432 Hz (or 440: off), loudnorm to LUFS / true peak, export.
The input and the output are measured for loudness (the Debunker's measure_lufs), so the page
can compare them honestly, at the same loudness.

    remaster_job.py TAKE_DIR OUTDIR SETTINGS.json
SETTINGS: {"source": "" | "derived/stems-four" | "derived/stems-vocals" | "derived/ID/file.flac", "preset": "balanced",
           "levels": {"vocals": 0.5, ...}, "cleanup": true, "fade": 0, "trim_start": 0, "trim_end": 0,
           "deess": false, "deess_mode": "subtle", "hz432": true, "loudnorm": true, "lufs": -14, "tp": -1,
           "formats": ["wav", "flac"]}
Prints one line of JSON: the files, the loudness in and out, the log.
"""
import contextlib, io, json, os, shutil, sys, time
from pathlib import Path

take, outdir, cfg = Path(sys.argv[1]), Path(sys.argv[2]), json.load(open(sys.argv[3]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import debunker as db  # noqa: E402

t0 = time.time()
outdir.mkdir(parents=True, exist_ok=True)
n = db.nastrojki_po_umolchaniyu()
src = cfg.get("source") or ""
single = src and (take / src).resolve().is_file()        # HERESY 1030: one file of the tree (a debuzzed take)
if single:
    sf_ = (take / src).resolve()
    if take.resolve() not in sf_.parents:
        raise SystemExit("bad source")
    n.update(input=str(sf_))
    reference = n["input"]
elif src:
    sd = (take / src).resolve()
    if take.resolve() not in sd.parents or not sd.is_dir():
        raise SystemExit("bad stems source")
    # the stems the Debunker mixes: with drums, bass and other present, the instrumental is
    # their sum already and would count twice — it stays out
    names = [p.stem for p in sd.glob("*.flac")]
    use = [x for x in names if not (x == "instrumental" and {"drums", "bass", "other"} <= set(names))]
    mixdir = outdir / ".stems"
    shutil.rmtree(mixdir, ignore_errors=True)
    mixdir.mkdir()
    for x in use:
        os.link(sd / f"{x}.flac", mixdir / f"{x}.flac")
    stems = db.find_stems(str(mixdir))
    db.apply_preset(stems, cfg.get("preset", "balanced"))
    for s in stems:                                  # the page's own levels win over the preset
        key = Path(s["path"]).stem
        if key in (cfg.get("levels") or {}):
            s["db_adjust"] = float(cfg["levels"][key])
    n.update(input=str(mixdir), stems=stems, stems_tuned=True)
    reference = str(take / "audio.wav")
else:
    n.update(input=str(take / "audio.wav"))
    reference = n["input"]
n.update(output=str(outdir), name="remaster", preset=cfg.get("preset", "balanced"),
         cleanup=bool(cfg.get("cleanup", True)), fade=float(cfg.get("fade", 0)),
         trim_start=float(cfg.get("trim_start", 0)), trim_end=float(cfg.get("trim_end", 0)),
         deess=bool(cfg.get("deess", False)), deess_mode=cfg.get("deess_mode", "subtle"), deess_engine="ffmpeg",
         hz432=bool(cfg.get("hz432", True)), skip_loudnorm=not cfg.get("loudnorm", True),
         lufs=float(cfg.get("lufs", -14)), tp=float(cfg.get("tp", -1)), sr=48000,
         formats=list(cfg.get("formats") or ["wav", "flac"]))
log = io.StringIO()
os.environ["NO_COLOR"] = "1"
with contextlib.redirect_stdout(log):
    ok = db.gnat(n)
shutil.rmtree(outdir / ".stems", ignore_errors=True)
if not ok:
    sys.stderr.write(log.getvalue()[-2000:])
    raise SystemExit("the Debunker stopped: see its log")
files = []
for fmt in n["formats"]:
    p = outdir / f"remaster_FINAL.{fmt}"
    if p.is_file():
        files.append({"name": "remaster" + ("" if fmt == "wav" else " · " + fmt.upper()), "file": p.name, "format": fmt})
(outdir / "debunker.log").write_text(log.getvalue(), encoding="utf-8")
lufs_in = db.measure_lufs(reference)
lufs_out = db.measure_lufs(str(outdir / "remaster_FINAL.wav")) if (outdir / "remaster_FINAL.wav").is_file() else None
print(json.dumps({"files": files, "lufs_in": lufs_in, "lufs_out": lufs_out, "settings": cfg,
                  "took": round(time.time() - t0, 1)}, ensure_ascii=False))
