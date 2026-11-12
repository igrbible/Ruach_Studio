"""HERESY 2315: the DAW's reference from anywhere. A reference names a take's own sound, a file of its tree or a song of your own, never a file
outside them; a song of yours kept as FLAC, 48 kHz, two sides (the same bytes twice one reference), listed, forgotten; any file measured block by
block as the source is (its blocks' gating the integrated loudness Plenio measures) and streamed in stretches at its own rate, two sides.
python3 lab/test_daw_refs_2315.py"""
import io
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import daw  # noqa: E402
from plenio_core.audio import loudness as pl  # noqa: E402

bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


def gated(z):
    lufs = lambda p: -0.691 + 10 * math.log10(p) if p > 0 else -1e9   # noqa: E731
    win = [(z[k] + z[k - 1] + z[k - 2] + z[k - 3]) / 4 for k in range(3, len(z))]
    a = [w for w in win if lufs(w) > -70]
    rel = lufs(sum(a) / len(a)) - 10
    g = [w for w in a if lufs(w) > rel]
    return lufs(sum(g) / len(g))


with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    outputs, refs = root / "outputs", root / "user" / "references"
    take = outputs / "20261110-200000-a-take"
    (take / "derived" / "daw-1").mkdir(parents=True)
    (take / "meta.json").write_text("{}")
    rate = 44100
    t = np.arange(rate * 6) / rate
    x = 0.3 * np.sin(2 * np.pi * 440 * t)
    sf.write(str(take / "audio.wav"), np.stack([x, x]).T.astype(np.float32), rate)
    sf.write(str(take / "derived" / "daw-1" / "mix.flac"), np.stack([x, 0.5 * x]).T.astype(np.float32), rate, subtype="PCM_24")
    (take / "derived" / "daw-1" / "notes.txt").write_text("not a sound")
    (outputs / "secret.wav").write_bytes(b"x")

    check("take:NAME is its own sound", daw.ref_path(outputs, refs, "take:20261110-200000-a-take") == take / "audio.wav")
    check("take:NAME:PATH a file of its tree", daw.ref_path(outputs, refs, "take:20261110-200000-a-take:derived/daw-1/mix.flac").name == "mix.flac")
    for wrong in ("take:20261110-200000-a-take:../secret.wav", "take:../outputs", "take:20261110-200000-a-take:derived/daw-1/notes.txt", "own:../../x", "file:/etc/passwd", ""):
        try:
            daw.ref_path(outputs, refs, wrong)
            check(f"refused: {wrong!r}", False, "accepted")
        except (ValueError, FileNotFoundError):
            check(f"refused: {wrong!r}", True)
    sounds = daw.take_sounds(take.name, take, [{"id": "daw-1", "kind": "daw", "label": "DAW mix", "created": "2026-11-10 20:00",
                                               "files": [{"name": "mix", "file": "mix.flac"}, {"name": "notes", "file": "notes.txt"}]},
                                              {"id": "stems-x", "kind": "stems", "files": [{"name": "drums", "file": "drums.wav"}]},
                                              {"id": "lay-1", "kind": "plugin", "files": [{"name": "pad", "file": "pad.flac", "track": "pad"}]}])
    check("this take's sounds: as it came, then its branches' files (no stems, no lanes, no text)",
          [s["spec"] for s in sounds] == ["take:" + take.name, "take:" + take.name + ":derived/daw-1/mix.flac"], [s["spec"] for s in sounds])

    # a song of your own: an MP3 made here (ffmpeg), kept as FLAC 48 kHz two sides
    mp3 = root / "song.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=5:sample_rate=44100", "-ac", "1", str(mp3)], check=True, timeout=60)
    body = mp3.read_bytes()
    r = daw.refs_add(refs, "Someone's song.mp3", body, "")
    flac = refs / f"{r['id']}.flac"
    info = sf.info(str(flac))
    check("kept as FLAC, 48 kHz, two sides", flac.is_file() and info.samplerate == 48000 and info.channels == 2, (info.samplerate, info.channels))
    check("its title from its name, its length", r["title"] == "Someone's song" and abs(r["seconds"] - 5) < 0.1 and r["spec"] == "own:" + r["id"], r)
    again = daw.refs_add(refs, "copy.mp3", body, "")
    check("the same bytes twice: one reference", again["id"] == r["id"] and len(daw.refs_list(refs)) == 1, daw.refs_list(refs))
    check("own:ID names it", daw.ref_path(outputs, refs, r["spec"]) == flac)
    try:
        daw.refs_add(refs, "x.txt", b"hello", "")
        check("a file of no sound kind refused", False, "accepted")
    except ValueError:
        check("a file of no sound kind refused", True)
    try:
        daw.refs_add(refs, "x.wav", b"RIFF not really", "")
        check("a file ffmpeg cannot read refused, nothing left", False, "accepted")
    except ValueError:
        check("a file ffmpeg cannot read refused, nothing left", len(list(refs.glob("*"))) == 2 and not list(refs.glob(".*")), list(refs.glob("*")))

    # measured and streamed
    lo = daw.file_loudness(take / "derived" / "daw-1" / "mix.flac")
    want = pl.integrated_from_blocks(pl._block_powers(pl._weighted_power(np.stack([x, 0.5 * x]), rate, pl.no_cancel), rate, pl.BLOCK_S, pl.STEP_S))
    check("its blocks gated as the page gates them give Plenio's integrated loudness", abs(gated(lo["z"]) - want) < 0.05 and abs(lo["integrated"] - want) < 0.05, (gated(lo["z"]), want))
    check("its length and rate said", abs(lo["seconds"] - 6) < 0.01 and lo["rate"] == rate)
    data = daw.file_chunk(flac, 1.0, 2.0)
    y, sr = sf.read(io.BytesIO(data), always_2d=True)
    check("a stretch of it: FLAC at its own rate, two sides, as long as asked", sr == 48000 and y.shape == (96000, 2), (sr, y.shape))
    tail = daw.file_chunk(flac, 4.0, 3.0)
    y2, _ = sf.read(io.BytesIO(tail), always_2d=True)
    check("past its end, silence (the stretch as long as asked)", y2.shape[0] == 144000 and float(np.abs(y2[60000:]).max()) == 0.0, y2.shape)
    mono = daw.file_chunk(take / "audio.wav", 0, 1)
    ym, srm = sf.read(io.BytesIO(mono), always_2d=True)
    check("a take's own sound streamed too", srm == rate and ym.shape == (rate, 2))
    left = daw.refs_delete(refs, r["id"])
    check("forgotten: its sound and its entry gone", left == [] and not flac.exists(), left)

print("test_daw_refs_2315: " + ("all passed" if not bad else f"{len(bad)} FAILED"))
sys.exit(1 if bad else 0)
