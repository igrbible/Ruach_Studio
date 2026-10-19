"""Split one take into stems on Forge (HERESY 1021). Runs in the studio's .venv (torch + audio-separator).

  vocals   BS-Roformer ep317 (SDR 12.97 on vocals; separation/roformer):
           vocals.flac + instrumental.flac
  four     the same, then htdemucs_ft (separation/demucs) on the instrumental:
           + drums.flac, bass.flac, other.flac
  six      HERESY 1462: the same voice, then BS-Roformer-SW (jarredou, separation/roformer) on the instrumental:
           + drums.flac, bass.flac, guitar.flac, piano.flac, other.flac
  eight    HERESY 1463: six, with the voice in two by becruily's karaoke Mel-Roformer (lead_vocal.flac, backing_vocals.flac; 1477:
           vocals.flac stays beside them, the whole voice) and the winds out of the rest by UVR's 17_HP-Wind_Inst (separation/vr): + winds.flac
  Each stem keeps a plain file name and carries a proper title (Lead Vocal, Backing Vocals, Drums…) for the tree and the DAW.

FLAC 24-bit at the take's own 48 kHz, into OUTDIR. The weights are used where they lie;
nothing is downloaded. Prints one line of JSON: the stems, their models and the time.

    stems_job.py AUDIO OUTDIR vocals|four|six|eight
"""
import json, math, os, shutil, sys, time
from pathlib import Path

audio, outdir, mode = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
KIT = Path(__file__).resolve().parent.parent
# the weights live in the Kit (hard links to Maestro Studio's and UVR's copies, no download)
ROFORMER_DIR = os.environ.get("LAB_ROFORMER_DIR", str(KIT / "separation/roformer"))
ROFORMER = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
DEMUCS_DIR = os.environ.get("LAB_DEMUCS_DIR", str(KIT / "separation/demucs"))
DEMUCS = "htdemucs_ft.yaml"
SIX = "BS-Roformer-SW.ckpt"                         # HERESY 1462: bass, drums, other, vocals, guitar, piano (its voice unused)
KARAOKE = "mel_band_roformer_karaoke_becruily.ckpt"   # HERESY 1463: Vocals (the lead) and Instrumental (on a vocal stem: the backing)
VR_DIR = os.environ.get("LAB_VR_DIR", str(KIT / "separation/vr"))
WIND = "17_HP-Wind_Inst-UVR.pth"                    # HERESY 1463: Woodwinds and No Woodwinds
TITLES = {"vocals": "Vocals", "instrumental": "Instrumental", "drums": "Drums", "bass": "Bass", "other": "Other", "guitar": "Guitar",
          "piano": "Piano", "lead_vocal": "Lead Vocal", "backing_vocals": "Backing Vocals", "winds": "Winds"}

import soundfile as sf
from audio_separator.separator import Separator

t0 = time.time()
outdir.mkdir(parents=True, exist_ok=True)
work = outdir / ".work"
shutil.rmtree(work, ignore_errors=True)
work.mkdir()
rate = sf.info(str(audio)).samplerate
frames = sf.info(str(audio)).frames                 # HERESY 1463: every stem as long as what was split


def run(model_dir, model, source, sr=None):        # HERESY 1463: sr, a model's own rate (UVR's VR models: 44.1 kHz)
    sep = Separator(model_file_dir=model_dir, output_dir=str(work), output_format="FLAC",
                    sample_rate=sr or rate, log_level=30)
    sep.load_model(model_filename=model)
    return [Path(work / Path(f).name) if not Path(f).is_absolute() else Path(f) for f in sep.separate(str(source))]


def pick(files, word):
    for f in files:
        if "(" + word.lower() + ")" in f.name.lower():
            return f
    raise RuntimeError(f"no {word} stem among {[f.name for f in files]}")


def keep(src, name):
    data, sr = sf.read(str(src), dtype="float32", always_2d=True)
    if sr != rate:                                   # HERESY 1463: back to the take's rate and length
        import numpy as np
        from scipy.signal import resample_poly
        g = math.gcd(rate, sr)
        data = resample_poly(data, rate // g, sr // g, axis=0).astype("float32")
        data = data[:frames] if len(data) >= frames else np.pad(data, ((0, frames - len(data)), (0, 0)))
        sr = rate
    sf.write(str(outdir / f"{name}.flac"), data, sr, subtype="PCM_24")
    return {"name": name, "title": TITLES.get(name, name.replace("_", " ").title()), "file": f"{name}.flac", "seconds": round(len(data) / sr, 2), "rate": sr}


stems, models = [], [ROFORMER]
first = run(ROFORMER_DIR, ROFORMER, audio)
stems.append(keep(pick(first, "Vocals"), "vocals"))
stems.append(keep(pick(first, "Instrumental"), "instrumental"))
if mode == "four":
    second = run(DEMUCS_DIR, DEMUCS, outdir / "instrumental.flac")
    models.append(DEMUCS)
    for word in ("Drums", "Bass", "Other"):
        stems.append(keep(pick(second, word), word.lower()))
if mode == "eight":
    for d_, f_ in ((ROFORMER_DIR, KARAOKE), (ROFORMER_DIR, SIX), (VR_DIR, WIND)):
        if not (Path(d_) / f_).is_file():
            raise SystemExit(f"the model {f_} is not in {d_}")
    lead = run(ROFORMER_DIR, KARAOKE, outdir / "vocals.flac")
    models.append(KARAOKE)
    stems.append(keep(pick(lead, "Vocals"), "lead_vocal"))
    stems.append(keep(pick(lead, "Instrumental"), "backing_vocals"))
    for s in stems:                                  # HERESY 1477: the whole voice stays beside its two parts (the Remaster and
        if s["name"] == "vocals":                    # the DAW take the parts and leave it out; a cleaning can take it whole)
            s["title"] = "Vocals (whole)"
    second = run(ROFORMER_DIR, SIX, outdir / "instrumental.flac")
    models.append(SIX)
    for word in ("Drums", "Bass", "Guitar", "Piano", "Other"):
        stems.append(keep(pick(second, word), word.lower()))
    third = run(VR_DIR, WIND, outdir / "other.flac", sr=44100)
    models.append(WIND)
    winds = keep(pick(third, "Woodwinds"), "winds")
    rest = keep(pick(third, "No Woodwinds"), "other")   # the rest without them, in other.flac's place
    stems = [s for s in stems if s["name"] != "other"] + [winds, rest]
if mode == "six":
    if not (Path(ROFORMER_DIR) / SIX).is_file():
        raise SystemExit(f"the six-stem model {SIX} is not in {ROFORMER_DIR}")
    second = run(ROFORMER_DIR, SIX, outdir / "instrumental.flac")
    models.append(SIX)
    for word in ("Drums", "Bass", "Guitar", "Piano", "Other"):
        stems.append(keep(pick(second, word), word.lower()))
shutil.rmtree(work, ignore_errors=True)
print(json.dumps({"stems": stems, "models": models, "mode": mode, "took": round(time.time() - t0, 1)}))
