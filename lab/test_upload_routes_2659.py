"""HERESY 2659: the lab's routes a user's sound comes in by, each through lab/upload_guard.py: POST /import (a FLAC named .mp3, an iPhone's M4A,
an Android's AMR come in as takes, original.<what their bytes are> beside audio.wav; a renamed ZIP and a WAV around a program refused with
words, no take's folder left), /daw/ref (an Opus kept, a program refused), and the refusals of /timing/recording, /reader/transcribe and
/reader/voice before any job or file is made (their accepting side starts Whisper or measures a voice: not run here).
    python3 lab/test_upload_routes_2659.py   (a lab of its own on a free port, its library, user folder and cache in a temporary folder)"""
import base64
import importlib.util
import io
import json
import shutil
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
tmp = Path(tempfile.mkdtemp(prefix="routes2659-"))
spec = importlib.util.spec_from_file_location("lab_under_test", HERE / "lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
lab.OUTPUTS, lab.USER_DIR, lab.CACHE = tmp / "outputs", tmp / "user", tmp / "cache"
lab.OUTPUTS.mkdir()
lab.USER_DIR.mkdir()
(lab.USER_DIR / "settings.json").write_text("{}")
srv = ThreadingHTTPServer(("127.0.0.1", 0), lab.Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
P = srv.server_address[1]
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed, failed = passed + bool(ok), failed + (not ok)
    print(("  PASS  " if ok else "  FAIL  ") + name + ("" if ok or not detail else "  (" + str(detail)[:300] + ")"))


def post(path, body, ctype="application/octet-stream"):
    r = urllib.request.Request(f"http://127.0.0.1:{P}{path}", data=body, method="POST", headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(r, timeout=120) as x:
            return x.status, json.loads(x.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def make(name, *args):
    out = tmp / name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=48000", "-ac", "2", *args, str(out)], check=True)
    return out.read_bytes()


flac, m4a, opus = make("a.flac", "-c:a", "flac"), make("v.m4a", "-c:a", "aac", "-f", "ipod"), make("o.opus", "-c:a", "libopus")
amr = b"#!AMR\n" + b"".join(bytes([0x3C]) + bytes((i * 37 + k) % 256 for k in range(31)) for i in range(150))
z = io.BytesIO()
with zipfile.ZipFile(z, "w") as zf:
    zf.writestr("x.sh", "rm -rf ~\n")
exe = (b"MZ\x90\x00" + b"\0" * 60 + b"This program cannot be run in DOS mode.\r\r\n$" + b"\0" * 400) * 8
w = make("w.wav", "-c:a", "pcm_s16le")
poly = b"RIFF" + (36 + len(exe)).to_bytes(4, "little") + w[8:36] + b"data" + len(exe).to_bytes(4, "little") + exe

print("POST /import")
for label, body, fname, ext in (("a FLAC named .mp3", flac, "song.mp3", ".flac"), ("an iPhone's M4A", m4a, "memo.m4a", ".m4a"),
                                ("an Android's AMR", amr, "rec.amr", ".amr")):
    code, out = post("/import?file=" + fname + "&title=", body)
    d = lab.OUTPUTS / str(out.get("name", "-"))
    check(f"{label}: a take, original{ext} beside its audio.wav, {out.get('seconds')} s", code == 200 and (d / ("original" + ext)).is_file() and
          (d / "audio.wav").is_file() and abs(out.get("seconds", 0) - 3) < 0.1 and not [p for p in d.iterdir() if p.name.endswith(".part")], (code, out))
takes = set(p.name for p in lab.OUTPUTS.iterdir())
for label, body, words in (("a renamed ZIP", z.getvalue(), "an archive or a program"), ("a WAV around a Windows program", poly, "hides inside it")):
    code, out = post("/import?file=song.wav&title=", body)
    check(f"{label}: 400, {out.get('error')}, no take's folder left", code == 400 and words in out.get("error", "") and
          set(p.name for p in lab.OUTPUTS.iterdir()) == takes, (code, out))

print("POST /daw/ref")
code, out = post("/daw/ref?file=voice.opus&title=Voice", opus)
refs = lab.USER_DIR / "references"
check(f"an Opus: a reference of one's own ({out.get('id')}), nothing of its source left", code == 200 and (refs / f"{out.get('id')}.flac").is_file() and
      not [p for p in refs.iterdir() if p.name.startswith(".")], (code, out, list(refs.iterdir()) if refs.is_dir() else []))
code, out = post("/daw/ref?file=song.wav&title=x", exe)
check(f"a program: 400, {out.get('error')}", code == 400 and "an archive or a program" in out.get("error", ""), (code, out))

print("refused before any job or file")
code, out = post("/timing/recording", json.dumps({"lyrics": "one line\nanother", "file": "s.wav", "audio": base64.b64encode(poly).decode()}).encode(),
                 "application/json")
check(f"/timing/recording, a polyglot: 400, {out.get('error')}, no job", code == 400 and "hides inside it" in out.get("error", "") and not lab.REC_JOBS and
      not (lab.CACHE.is_dir() and [p for p in lab.CACHE.iterdir() if p.name.startswith(("rec-", ".rec-"))]), (code, out))
if lab.reader:
    jobs = dict(lab.reader.H["jobs"])
    film = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=64x64:rate=10", "-f", "lavfi", "-i", "sine=duration=2",
                           "-c:v", "mpeg4", "-c:a", "aac", "-shortest", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "pipe:1"],
                          capture_output=True, check=True).stdout
    code, out = post("/reader/transcribe?file=lecture.mp4&lang=auto", film)
    check(f"/reader/transcribe, a video: 400, {out.get('error')}, no job", code == 400 and "carries a video" in out.get("error", "") and
          dict(lab.reader.H["jobs"]) == jobs, (code, out))
    code, out = post("/reader/voice", json.dumps({"name": "Test", "consent": True, "ext": "wav", "audio_b64": base64.b64encode(z.getvalue() * 20).decode()}).encode(),
                     "application/json")
    check(f"/reader/voice, a ZIP as .wav: 400, {out.get('error')}", code == 400 and "an archive or a program" in out.get("error", ""), (code, out))
else:
    check("the Reader's routes (its module did not load here)", False)

srv.shutdown()
shutil.rmtree(tmp, ignore_errors=True)
print(f"\ntest_upload_routes_2659: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
