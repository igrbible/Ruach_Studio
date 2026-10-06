"""One Whisper pass in its own process: load, transcribe, write JSON, exit.

The weights live in VRAM only while this process runs (Viktor 30.09.2026: load only
when needed and unload at once). Run by lab.py with the GPU already chosen.

    whisper_job.py AUDIO OUT.json LANGUAGE [MODEL] [words]
"words" (HERESY 1056): each segment carries its words with their times, for karaoke timing.
"""
import json, sys, time
from faster_whisper import WhisperModel

audio, out, lang = sys.argv[1], sys.argv[2], sys.argv[3]
MODEL = sys.argv[4] if len(sys.argv) > 4 else None
WORDS = len(sys.argv) > 5 and sys.argv[5] == "words"
t0 = time.time()
import os                                          # HERESY 1141: the CPU when the lab found no card for it (int8 there)
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
model = WhisperModel(MODEL, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8",
                     cpu_threads=min(16, os.cpu_count() or 4))
t1 = time.time()
# condition_on_previous_text=False: with it Whisper loops on its own hallucination over
# music ("Субтитры подогнал «Симон»" ×15) — four of six measurements on 30.09 were that.
# HERESY 1021: the audio is read here (soundfile, torchaudio) and handed over as 16 kHz mono:
# faster-whisper's own reader calls PyAV with an argument PyAV 15+ no longer has.
import numpy as np, soundfile as sf, torch, torchaudio
data, rate = sf.read(audio, dtype="float32", always_2d=True)
wave = torch.from_numpy(data.mean(axis=1))
if rate != 16000:
    wave = torchaudio.functional.resample(wave, rate, 16000)
segments, info = model.transcribe(wave.numpy().astype(np.float32), language=lang or None, condition_on_previous_text=False,
                                  vad_filter=False, beam_size=5, word_timestamps=WORDS)
segs = []
for s in segments:
    seg = {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
    if WORDS:
        seg["words"] = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.probability, 3)}
                        for w in (s.words or [])]
    segs.append(seg)
json.dump({"segments": segs, "language": info.language, "duration": round(info.duration, 2),
           "load_s": round(t1 - t0, 1), "listen_s": round(time.time() - t1, 1)},
          open(out, "w"), ensure_ascii=False)
