"""HERESY 1489: Content Credentials. python3 test_c2pa.py"""
import io, json, shutil, subprocess, tempfile, zipfile
from pathlib import Path
import numpy as np, soundfile as sf
import c2pa_sign as C
import collection

n = 0
td = Path(tempfile.mkdtemp())
cfg = td / "user"
x = (np.sin(np.arange(48000) / 9) * 0.2).astype("float32")


def enc(fmt):
    b = io.BytesIO()
    sf.write(b, x, 48000, format=fmt.upper(), subtype="PCM_16")
    return b.getvalue()


# the install's own signer, made once, its key for its owner alone
st = C.status(cfg)
assert st["available"] and st["on"] and st["signer"] == "own" and "Ruach Studio" in st["subject"], st; n += 1
assert (cfg / "c2pa" / "own-key.pem").stat().st_mode & 0o777 == 0o600; n += 1
# WAV and FLAC signed: valid, the sound untouched, «created by AI»; a file the Refiner made says its steps; the author rides along
for fmt in ("wav", "flac"):
    raw = enc(fmt)
    out = C.sign(cfg, raw, fmt, "A take", "2.0.0-test")
    r = C.read(out, fmt)
    assert r["state"] == "Valid" and r["actions"] == ["c2pa.created"] and r["failures"] == ["signingCredential.untrusted"], r
    assert np.array_equal(sf.read(io.BytesIO(out))[0], sf.read(io.BytesIO(raw))[0]); n += 1
if shutil.which("ffmpeg"):
    mp3 = subprocess.run(["ffmpeg", "-v", "error", "-f", "wav", "-i", "-", "-f", "mp3", "-"], input=enc("wav"), capture_output=True).stdout
    assert C.read(C.sign(cfg, mp3, "mp3", "A take", "2"), "mp3")["state"] == "Valid"; n += 1
C.save(cfg, {"author": "Someone", "contact": "https://example.org"})
r = C.read(C.sign(cfg, enc("wav"), "wav", "A take", "2", edits=["Debuzz", "Stems"]), "wav")
assert r["actions"] == ["c2pa.created", "c2pa.edited"] and r["author"] == [{"@type": "Person", "name": "Someone", "url": "https://example.org"}], r; n += 1
# a certificate needs its key, and both must be files
for bad in ({"cert": "/no/such.pem", "key": ""}, {"cert": "/no/such.pem", "key": "/no/key.pem"}):
    try:
        C.save(cfg, bad); raise SystemExit("took " + str(bad))
    except ValueError:
        pass
n += 1
# HERESY 2174 (H03): the certificate and its key from user/ alone: a path out of it refused before it is looked at (the same words for a file that is
# there and one that is not: no oracle), a link out of it too; one in user/, absolute or relative to it, read
for outside in ("/etc/hostname", "/no/such.pem", "../outside.pem", str(td / "outside.pem")):
    try:
        C.save(cfg, {"cert": outside, "key": outside}); raise SystemExit("took " + outside)
    except ValueError as e:
        assert str(e) == C.OUTSIDE, (outside, str(e))
(td / "outside.pem").write_text("-----BEGIN CERTIFICATE-----\n")
(cfg / "c2pa").mkdir(parents=True, exist_ok=True)
(cfg / "c2pa" / "link.pem").symlink_to(td / "outside.pem")
try:
    C.save(cfg, {"cert": "c2pa/link.pem", "key": "c2pa/link.pem"}); raise SystemExit("took a link out of user/")
except ValueError as e:
    assert str(e) == C.OUTSIDE, str(e)
mine = C.save(cfg, {"cert": str(cfg / "c2pa" / "own-chain.pem"), "key": "c2pa/own-key.pem"})
assert C.status(cfg)["signer"] == "yours" and mine["key"] == "c2pa/own-key.pem", C.status(cfg)
C.save(cfg, {"cert": "", "key": ""})
n += 1
# the steps a file came through, from the take on
take = td / "out" / "t1"
for bid, kind, src, label in (("debuzz-1", "debuzz", "the take", ""), ("stems-1", "stems", "derived/debuzz-1/d.flac", ""),
                              ("plugin-x", "plugin", "derived/stems-1/lead_vocal.flac", "Vocal step")):
    (take / "derived" / bid).mkdir(parents=True)
    json.dump({"id": bid, "kind": kind, "source": src, "label": label}, open(take / "derived" / bid / "manifest.json", "w"))
assert C.edits_of(take, "derived/plugin-x/vocal.flac") == ["Debuzz", "Stems", "Vocal step"] and C.edits_of(take, "") == []; n += 1
# the ZIP: each audio file as sign says, counted
json.dump({"title": "Take one"}, open(take / "meta.json", "w")); json.dump({}, open(take / "request.json", "w"))
sf.write(str(take / "audio.wav"), x, 48000, subtype="PCM_16")
sf.write(str(take / "derived" / "debuzz-1" / "d.flac"), x, 48000)
json.dump({"id": "debuzz-1", "kind": "debuzz", "source": "the take", "files": [{"name": "d", "path": "derived/debuzz-1/d.flac"}]}, open(take / "derived" / "debuzz-1" / "manifest.json", "w"))
for f in ("stems-1", "plugin-x"):
    shutil.rmtree(take / "derived" / f)
said = []
def sign(d, data, kind, rel=""):
    said.append((kind, rel))
    return C.sign(cfg, data, kind, "Take one", "2", C.edits_of(d, rel)), "signed"
job = collection.export_start(td, td / "out", ["t1"], "wav", True, sign=sign)
import time
for _ in range(100):
    if collection.export_status(job["id"])["status"] != "running":
        break
    time.sleep(0.1)
j = collection.export_status(job["id"])
assert j["status"] == "done" and j.get("signed") == 2 and said == [("wav", ""), ("flac", "derived/debuzz-1/d.flac")], (j, said)
with zipfile.ZipFile(collection.export_path(td, job["id"])) as z:
    names = sorted(z.namelist())
    assert C.read(z.read([a for a in names if a.endswith(".flac")][0]), "flac")["actions"] == ["c2pa.created", "c2pa.edited"]; n += 1
# HERESY 2333: a take of the Reader is speech, its engine and its credit named; never for training said by cawg.training-mining; a song says neither
C.save(cfg, {"author": "", "contact": ""})
req = {"no_train": True, "reader": {"engine": "drama3", "engine_label": "Fish Audio Drama 3", "credit": "Built with Fish Audio"}}
meta = {"no_train": True, "provenance": {"no_train": True, "why": "speech of an engine whose terms forbid training on what it makes"}}
made = C.made_of(req, meta)
assert made == {"speech": True, "no_train": True, "why": meta["provenance"]["why"], "engine": "Fish Audio Drama 3", "credit": "Built with Fish Audio"}, made
for fmt in ("wav", "flac"):
    r = C.read(C.sign(cfg, enc(fmt), fmt, "Глава первая", "2", ["Speech EQ"], made), fmt)
    assert r["state"] == "Valid" and r["actions"] == ["c2pa.created", "c2pa.edited"], r
    assert "speech" in r["made"] and "Fish Audio Drama 3" in r["made"] and "Built with Fish Audio" in r["made"] and "music" not in r["made"], r
    assert r["training"] == {k: "notAllowed" for k in C.TRAINING}, r["training"]
n += 1
song = C.read(C.sign(cfg, enc("wav"), "wav", "A song", "2", None, C.made_of({"style": "rock"}, {"title": "A song"})), "wav")
assert "music" in song["made"] and song["training"] == {}, song
assert C.made_of({"style": "rock"}, {})["speech"] is False and C.made_of({}, {"no_train": True})["no_train"] is True
assert C.read(C.sign(cfg, enc("wav"), "wav", "t", "2"), "wav")["training"] == {}                        # an old caller: as before
n += 1
print(f"c2pa: {n} checks passed")
