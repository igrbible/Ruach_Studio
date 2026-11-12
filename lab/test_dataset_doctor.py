"""HERESY 2351: the dataset doctor on a scratch kit (tmp/claude-doctor-kit, never datasets/): synthetic tracks made by ffmpeg, each with one
fault the doctor must say, and the ones it must not. python3 lab/test_dataset_doctor.py"""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import dataset_doctor as D  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got)[:300] + ")"))
    if not ok:
        bad.append(what)


KIT = Path(__file__).resolve().parent.parent / "tmp" / "claude-doctor-kit"
shutil.rmtree(KIT, ignore_errors=True)
RAW = KIT / "datasets" / "raw" / "doctortest"
RAW.mkdir(parents=True)


def ff(args, out):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y"] + args + [str(RAW / out)], check=True)


# music-like: pink noise under a kick at 120 BPM (a click every half second), full band
SRC = ["-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.25:sample_rate=48000",
       "-f", "lavfi", "-i", "sine=frequency=60:sample_rate=48000,volume='if(lt(mod(t,0.5),0.06),1.2,0)':eval=frame"]
MIX = ["-filter_complex", "[0][1]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo"]
for name, sec in (("Song v1.wav", 40), ("Song v2.wav", 41), ("Song (3).wav", 42), ("Other tune.wav", 45)):
    ff(SRC + MIX + ["-t", str(sec), "-c:a", "pcm_s16le"], name)
ff(SRC + MIX + ["-t", "45", "-c:a", "libmp3lame", "-b:a", "128k"], "From mp3.mp3")
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(RAW / "From mp3.mp3"), "-c:a", "flac", str(RAW / "Flac from mp3.flac")], check=True)
ff(SRC + MIX + ["-t", "20", "-c:a", "pcm_s16le"], "Short one.wav")
ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "5"] + [], "_sil.wav")
ff(SRC + MIX + ["-t", "40", "-c:a", "pcm_s16le"], "_body.wav")
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(RAW / "_sil.wav"), "-i", str(RAW / "_body.wav"), "-filter_complex", "[0][1]concat=n=2:v=0:a=1",
                str(RAW / "Silent start.wav")], check=True)
(RAW / "_sil.wav").unlink(); (RAW / "_body.wav").unlink()
ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=1.0:sample_rate=48000", "-af", "aformat=channel_layouts=stereo,volume=9dB", "-t", "40", "-c:a", "pcm_s16le"], "Too hot.wav")
ff(SRC + ["-filter_complex", "[0][1]amix=inputs=2:normalize=0,aformat=channel_layouts=mono,aresample=22050", "-t", "40", "-c:a", "pcm_s16le"], "Mono low rate.wav")
shutil.copy(RAW / "Other tune.wav", RAW / "Other tune copy.wav")

t0 = time.time()
j = D.start(KIT, {"name": "doctortest"})
check("starts in a thread", j.get("status") == "running", j)
while D.JOBS["doctortest"]["status"] == "running" and time.time() - t0 < 300:
    time.sleep(0.5)
st = D.status(KIT, "doctortest")
r = st.get("report") or {}
print("   took", round(time.time() - t0, 1), "s;", st.get("status"), st.get("error", ""))
check("done, the report fresh and kept in cache/train-doctor", st.get("status") == "done" and st.get("fresh") and (KIT / "cache" / "train-doctor" / "doctortest.json").is_file(), st)
check("tracks and songs: 11 files; the three versions of «song» one song, the copy of «other tune» one with it: 8 songs", r.get("tracks") == 11 and r.get("examined") == 11 and r.get("songs") == 8, (r.get("tracks"), r.get("examined"), r.get("songs"), [k for k in r.get("rows", [])][:0]))
check("versions of one song: «song» ×3", r.get("versions") and r["versions"][0][0] == "song" and r["versions"][0][1] == 3, r.get("versions"))
check("the same file twice", r.get("same") == [["Other tune copy.wav", "Other tune.wav"]] or r.get("same") == [["Other tune.wav", "Other tune copy.wav"]], r.get("same"))
check("under 0:30", r.get("short") == ["Short one.wav"], r.get("short"))
check("lossy: the MP3 only", r.get("lossy") == ["From mp3.mp3"], r.get("lossy"))
cut = {f for f, k in r.get("cut16", [])}
check("highs cut at 16 kHz: the MP3 and the FLAC made from it, no other", cut == {"From mp3.mp3", "Flac from mp3.flac"}, r.get("cut16"))
check("below 44.1 kHz and mono: the one", r.get("low_rate") == [["Mono low rate.wav", 22050]] and r.get("mono") == ["Mono low rate.wav"], (r.get("low_rate"), r.get("mono")))
check("clipping: the hot one only", [c[0] for c in r.get("clipped", [])] == ["Too hot.wav"], r.get("clipped"))
check("silence at an end: the silent start, about 5 s", [s[0] for s in r.get("silent_ends", [])] == ["Silent start.wav"] and 4.5 <= r["silent_ends"][0][1] <= 5.5, r.get("silent_ends"))
lo = r.get("loudness") or {}
check("loudness: the hot one apart", "Too hot.wav" in [a[0] for a in lo.get("apart", [])], lo)
te = r.get("tempo") or {}
kicked = sorted(x["bpm"] for x in r.get("rows", []) if x.get("bpm") and x["file"] != "Too hot.wav")   # the hot one is pink noise alone: any tempo
check("tempo by estimate: the kicked tracks near 120 BPM (the median, the tracker quantizes: 117.5 or 129.2), the set not called mixed", te.get("n", 0) >= 10 and kicked and 110 <= kicked[len(kicked) // 2] <= 132 and not te.get("mixed"), (te, kicked))
# a second start with nothing changed answers from the kept report; a changed folder is not fresh
j2 = D.start(KIT, {"name": "doctortest"})
time.sleep(1.0)
check("asked again with nothing changed: done at once from the kept report", D.JOBS["doctortest"]["status"] == "done", D.JOBS["doctortest"])
(RAW / "Short one.wav").unlink()
D.SEEN.clear()
check("a folder changed since: the report not fresh", D.status(KIT, "doctortest").get("fresh") is False)
shutil.rmtree(KIT, ignore_errors=True)
print("all ok" if not bad else f"{len(bad)} failed")
sys.exit(1 if bad else 0)
