"""Split one take into stems on Forge (HERESY 1021). Runs in the studio's .venv (torch + audio-separator).

  vocals   BS-Roformer ep317 (SDR 12.97 on vocals; separation/roformer):
           vocals.flac + instrumental.flac
  four     the same, then htdemucs_ft (separation/demucs) on the instrumental:
           + drums.flac, bass.flac, other.flac

FLAC 24-bit at the take's own 48 kHz, into OUTDIR. The weights are used where they lie;
nothing is downloaded. Prints one line of JSON: the stems, their models and the time.

    stems_job.py AUDIO OUTDIR vocals|four
"""
import json, os, shutil, sys, time
from pathlib import Path

audio, outdir, mode = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
KIT = Path(__file__).resolve().parent.parent
# the weights live in the Kit (hard links to Maestro Studio's and UVR's copies, no download)
ROFORMER_DIR = os.environ.get("LAB_ROFORMER_DIR", str(KIT / "separation/roformer"))
ROFORMER = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
DEMUCS_DIR = os.environ.get("LAB_DEMUCS_DIR", str(KIT / "separation/demucs"))
DEMUCS = "htdemucs_ft.yaml"

import soundfile as sf
from audio_separator.separator import Separator

t0 = time.time()
outdir.mkdir(parents=True, exist_ok=True)
work = outdir / ".work"
shutil.rmtree(work, ignore_errors=True)
work.mkdir()
rate = sf.info(str(audio)).samplerate


def run(model_dir, model, source):
    sep = Separator(model_file_dir=model_dir, output_dir=str(work), output_format="FLAC",
                    sample_rate=rate, log_level=30)
    sep.load_model(model_filename=model)
    return [Path(work / Path(f).name) if not Path(f).is_absolute() else Path(f) for f in sep.separate(str(source))]


def pick(files, word):
    for f in files:
        if "(" + word.lower() + ")" in f.name.lower():
            return f
    raise RuntimeError(f"no {word} stem among {[f.name for f in files]}")


def keep(src, name):
    data, sr = sf.read(str(src), dtype="float32", always_2d=True)
    sf.write(str(outdir / f"{name}.flac"), data, sr, subtype="PCM_24")
    return {"name": name, "file": f"{name}.flac", "seconds": round(len(data) / sr, 2), "rate": sr}


stems, models = [], [ROFORMER]
first = run(ROFORMER_DIR, ROFORMER, audio)
stems.append(keep(pick(first, "Vocals"), "vocals"))
stems.append(keep(pick(first, "Instrumental"), "instrumental"))
if mode == "four":
    second = run(DEMUCS_DIR, DEMUCS, outdir / "instrumental.flac")
    models.append(DEMUCS)
    for word in ("Drums", "Bass", "Other"):
        stems.append(keep(pick(second, word), word.lower()))
shutil.rmtree(work, ignore_errors=True)
print(json.dumps({"stems": stems, "models": models, "mode": mode, "took": round(time.time() - t0, 1)}))
