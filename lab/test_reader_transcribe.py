"""HERESY 2269: a recording into a transcript without a card or Whisper: the recording kept as it came, read to 16 kHz by ffmpeg, heard by a
stand-in Whisper (its whisper_job.py arguments checked), its paragraphs at the pauses, the list and the transcript read back, a script kept
beside it with its acute, the transcript removed; a refusal for a file that is no recording."""
import json
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader as r

with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    fake = kit / "fake_whisper.py"            # stands in for the lab's Python running whisper_job.py: AUDIO OUT LANG MODEL
    fake.write_text(
        "import json, sys\n"
        "job, audio, out, lang, model = sys.argv[1:6]\n"
        "assert job.endswith('whisper_job.py') and audio.endswith('audio16k.wav') and model == 'MODEL', sys.argv\n"
        "import soundfile as sf\n"
        "i = sf.info(audio)\n"
        "assert i.samplerate == 16000 and i.channels == 1, i\n"
        "segs = [{'start': 0.0, 'end': 1.0, 'text': ' Добрый вечер.'}, {'start': 1.2, 'end': 2.0, 'text': 'Сегодня о ветре.'},\n"
        "        {'start': 3.6, 'end': 4.5, 'text': 'И о море.'}]\n"
        "json.dump({'segments': segs, 'language': lang or 'ru', 'duration': i.duration}, open(out, 'w'), ensure_ascii=False)\n")
    jobs, lock = {}, threading.Lock()

    class Cancelled(Exception):
        pass

    @contextmanager
    def turn(job, need=None):
        class T:
            gpu = None
        yield T()

    r.setup(kit=kit, jobs=jobs, lock=lock, say=lambda s: None, cancelled=Cancelled, whisper_turn=turn,
            whisper_env=lambda gpu=None: ({}, "cpu", "on the CPU: test"), whisper_py=sys.executable, whisper_dir="MODEL")
    r.HERE = kit                                         # whisper_job.py looked up beside the stand-in
    (kit / "whisper_job.py").write_text("")
    real_run = subprocess.run

    def run(cmd, **kw):                                  # the lab's Python with whisper_job.py: the stand-in reads its arguments
        if cmd[0] == sys.executable and str(cmd[1]).endswith("whisper_job.py"):
            cmd = [sys.executable, str(fake)] + [str(x) for x in cmd[1:]]
        return real_run(cmd, **kw)
    r.subprocess.run = run
    wav = kit / "in.wav"
    real_run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=5", "-ar", "44100", "-ac", "2", str(wav)], check=True)
    try:
        r.transcribe(b"not audio", {"file": "notes.txt"})
        raise AssertionError("a text file taken for a recording")
    except ValueError:
        pass
    got = r.transcribe(wav.read_bytes(), {"file": "лекция.wav", "lang": "ru"})
    tid = got["id"]
    for _ in range(200):
        if not any(k.startswith("reader:tr-") for k in jobs):
            break
        time.sleep(0.05)
    t = r.transcript(tid)
    assert t["status"] == "done" and t["lang"] == "ru" and t["text"] == "Добрый вечер. Сегодня о ветре.\n\nИ о море.", t
    assert len(t["segments"]) == 3 and abs(t["seconds"] - 5.0) < 0.1 and not (kit / "reader/transcripts" / tid / "audio16k.wav").exists()
    row = r.transcripts()["transcripts"][0]
    assert row["id"] == tid and row["status"] == "done" and row["script"] is False and row["words"] == 8, row
    assert r.route_post("/reader/transcript-script", {"id": tid, "script": "Ведущий: [calm] Добрый ве́чер."}, {}) == (200, {"ok": True})
    assert r.transcript(tid)["script"] == "Ведущий: [calm] Добрый ве́чер." and r.transcripts()["transcripts"][0]["script"] is True
    assert r.route_get("/reader/transcripts", {})["transcripts"][0]["id"] == tid and r.route_get("/reader/nothing", {}) is None
    try:
        r.transcript("../../etc")
        raise AssertionError("a path taken for a transcript")
    except ValueError:
        pass
    assert r.route_post("/reader/transcript-remove", {"id": tid}, {}) == (200, {"ok": True}) and not r.transcripts()["transcripts"]
print("test_reader_transcribe: ok")
