"""HERESY 2031: the Bank Builder on made-up recordings (no separator, no Listener: a winds stem written as clean() would leave it).
    .venv/bin/python lab/test_bankbuilder.py"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bankbuilder as B  # noqa: E402

RATE = 44100
fails = 0


def check(cond, what):
    global fails
    print(("ok  " if cond else "FAIL") + " " + what)
    fails += 0 if cond else 1


def tone(midi, secs, vib_hz=5.0, vib_ct=15.0, rate=RATE, amp=0.3):
    """A reedy tone: its harmonics falling off, a vibrato, a soft attack and release."""
    t = np.arange(int(secs * rate)) / rate
    f = 440 * 2 ** ((midi - 69) / 12) * 2 ** (vib_ct / 1200 * np.sin(2 * np.pi * vib_hz * t))
    ph = 2 * np.pi * np.cumsum(f) / rate
    y = sum(np.sin(k * ph) / k ** 1.3 for k in range(1, 9))
    env = np.minimum(1, t / 0.05) * np.minimum(1, (secs - t) / 0.08)
    return (amp * y * env).astype(np.float32)


def fake_bank(kit, bank, mode, y, source="winds"):
    """The work folder clean() leaves: plan.json, one file of one piece, its winds stem (or, source mix, the recording in datasets/raw) and
    every second kept."""
    w = B.work_dir(kit, bank)
    fid = B.file_id("made-up.flac")
    pd = w / "files" / fid / "p000"
    pd.mkdir(parents=True)
    if source == "mix":
        raw = kit / "datasets" / "raw" / "made-up"
        raw.mkdir(parents=True, exist_ok=True)
        sf.write(str(raw / "made-up.flac"), np.stack([y, y], 1), RATE, subtype="PCM_24")
    else:
        sf.write(str(pd / "winds.flac"), np.stack([y, y], 1), RATE, subtype="PCM_24")
    secs = int(len(y) / RATE) + 1
    rows = [{"s": s, "kind": "wind alone", "kept": True} for s in range(secs)]
    (w / "files" / fid / "rows.json").write_text(json.dumps(rows))
    plan = {"bank": bank, "folder": "made-up", "instrument": "duduk" if mode == "chromatic" else "shofar", "mode": mode, "source": source,
            "files": [{"file": "made-up.flac", "id": fid, "seconds": secs, "title": "made up", "uploader": "the test", "url": "", "licence": "CC0"}]}
    (w / "plan.json").write_text(json.dumps(plan))
    return w


with tempfile.TemporaryDirectory() as tmp:
    kit = Path(tmp)
    # YIN: a tone's pitch, and noise unpitched
    x = tone(57, 2.0, vib_ct=0)
    xs = np.interp(np.arange(0, len(x), RATE / B.SR_AN), np.arange(len(x)), x).astype(np.float32)
    f0, _ = B.yin(xs)
    v = f0[~np.isnan(f0)]
    check(len(v) > 0.8 * len(f0) and abs(np.median(v) - 220.0) < 1.5, f"YIN: A3 at {np.median(v):.1f} Hz, {len(v)}/{len(f0)} frames pitched")
    nz = np.random.default_rng(1).normal(0, 0.1, B.SR_AN * 2).astype(np.float32)
    f0n, _ = B.yin(nz)
    check(np.isnan(f0n).mean() > 0.9, f"YIN: noise unpitched in {np.isnan(f0n).mean():.0%} of its frames")

    # chromatic: four notes, each twice (louder the second time), with gaps; a fifth note with a drone under it is refused
    gap = np.zeros(int(0.5 * RATE), np.float32)
    parts = [gap]                                   # a note at the piece's very first frame has no breath before it: refused as cut
    for amp in (0.15, 0.4):
        for m in (57, 60, 62, 64):
            parts += [tone(m, 2.2, amp=amp), gap]
    parts += [tone(67, 2.0) + tone(43, 2.0, vib_ct=0, amp=0.3), gap]
    y = np.concatenate(parts)
    fake_bank(kit, "dk", "chromatic", y)
    summ = B.notes(kit, "dk")
    keys = sorted(int(k) for k, s in summ["by_key"].items() if s["clean"])
    check(keys == [57, 60, 62, 64], f"notes: clean keys {keys} (the droned G4 refused)")
    meta = B.build(kit, "dk", "Made-up duduk", round_robins=2, layers=2)
    sfz = kit / "banks" / "Made-up-duduk" / "Made-up-duduk.sfz"
    text = sfz.read_text() if sfz.is_file() else ""
    check(sfz.is_file() and text.count("<region>") == 8, f"build: {text.count('<region>')} regions in {sfz.name}")
    check("lovel=1 hivel=63" in text and "lovel=64 hivel=127" in text, "build: two velocity layers")
    check("loop_mode=loop_continuous" in text, "build: the steady notes looped")
    check(meta["range"] == [57, 64] and meta["may_ship"] is True and meta["kind"] == "instrument", f"bank.json: range {meta['range']}, may ship")
    smp = sorted((kit / "banks" / "Made-up-duduk" / "samples").glob("*.flac"))
    info = sf.info(str(smp[0])) if smp else None
    check(len(smp) == 8 and info.samplerate == 48000 and info.subtype == "PCM_24", f"samples: {len(smp)}, 48 kHz 24-bit")
    import banks
    card = next((c for c in banks.shelf(kit, fresh=True) if c["id"] == "user:Made-up-duduk"), None)
    check(bool(card) and card["sfz"] == ["Made-up-duduk.sfz"] and card["kind"] == "instrument", "the shelf lists it")

    # the page's side: the works, a bank's state, a file's strip, a key's notes, a snippet
    ws = B.works(kit)
    dk = next((x for x in ws if x["slug"] == "dk"), {})
    check(dk.get("built") is True and dk.get("mode") == "chromatic", "works: the bank in the making, built")
    st = B.work(kit, "dk")
    check(st["built"] and st["built"]["name"] == "Made-up duduk" and st["range"] == (52, 76), f"work: built, range {st['range']}")
    fid = st["files"][0]["id"]
    sp = B.strip(kit, "dk", fid)
    check(set(sp["kinds"]) == {"W"}, "strip: every second a kept «wind alone»")
    kn = B.key_notes(kit, "dk", 57)
    check(len(kn) == 2 and all(n["ok"] for n in kn) and kn[0]["id"].startswith(fid + ":"), f"key notes: A3 twice, {[n['id'] for n in kn]}")
    wav = B.snippet(kit, "dk", fid, 1.0, 2.0)
    check(wav[:4] == b"RIFF" and len(wav) > 48000 * 2 * 2 * 1.9, f"snippet: {len(wav)} bytes of WAV")

    # sfizz plays it: a note between two sampled keys sounds
    try:
        import orchestra
        real = HERE.parent
        if orchestra.sfizz(real).is_file():
            mid, wav = kit / "t.mid", kit / "t.wav"
            orchestra.write_mid([[0.0, 1.5, 59, 0, 0]], [100], str(mid))
            orchestra.render(real, str(mid), {"kind": "sfz", "file": str(sfz)}, str(wav), rate=48000)
            out, sr = sf.read(str(wav))
            check(B.db(np.asarray(out).ravel()) > -40, f"sfizz: B3 (between A3 and C4) at {B.db(np.asarray(out).ravel()):.1f} dBFS")
        else:
            print("skip sfizz: not built here")
    except ImportError as e:
        print("skip sfizz:", e)

    # blasts: a tekiah, a shevarim, a teruah, a tekiah gedolah, a long silence between the calls
    sil = np.zeros(int(1.5 * RATE), np.float32)
    short = np.zeros(int(0.15 * RATE), np.float32)
    tiny = np.zeros(int(0.1 * RATE), np.float32)
    calls = [tone(58, 2.0, vib_ct=0), sil]
    calls += [tone(58, 0.8, vib_ct=0), short, tone(58, 0.8, vib_ct=0), short, tone(58, 0.8, vib_ct=0), sil]
    calls += sum(([tone(58, 0.2, vib_ct=0), tiny] for _ in range(9)), []) + [sil]
    calls += [tone(58, 6.0, vib_ct=0), sil]
    fake_bank(kit, "sh", "blasts", np.concatenate(calls), source="mix")      # a shofar is measured and cut from the recording itself
    summ = B.notes(kit, "sh")
    got = sorted(summ["by_key"])
    check(got == sorted(B.CALLS), f"blasts: {got}")
    meta = B.build(kit, "sh", "Made-up shofar")
    d = kit / "banks" / "Made-up-shofar"
    check(len(meta["sfz"]) == 2 and (d / meta["sfz"][1]).is_file(), f"build: {meta['sfz']}")
    t = (d / "Made-up-shofar.sfz").read_text()
    check(all(f"key={k}" in t for k in B.CALLS.values()) and "pitch_keytrack=0" in t, "the calls on their keys, at their own pitch")
    smp = sorted((d / "samples").glob("*.flac"))
    check(len(smp) == 4 and all(B.db(sf.read(str(x))[0].ravel()) > -30 for x in smp), f"the calls cut from the recording itself: {len(smp)} samples, none silent")
    sec = B.seconds_table(np.concatenate(calls[:2]).astype(np.float32)[::2], np.concatenate(calls[:2]).astype(np.float32)[::2], None, np.zeros(len(np.concatenate(calls[:2])) // 2, np.float32))
    check(any(r["kind"] == "wind alone" for r in sec) and all(r["rest"] is None for r in sec), "seconds of the recording itself: a pitched blast is the instrument's, no rest")

# a long recording heard in pieces spread through it; a file claimed by one worker is not taken by another, a dead worker's claim taken over
ps = B.pieces_of(12 * 3600)
check(len(ps) == 6 and ps[0] == 0 and ps[-1] == 71 and B.pieces_of(3000) == [0, 1, 2, 3, 4], f"pieces: {ps} of a twelve-hour file, all five of fifty minutes")
with tempfile.TemporaryDirectory() as tmp:
    fd = Path(tmp)
    first = B.claim(fd)
    (fd / ".claim").write_text(f"{__import__('socket').gethostname()} 1")       # init's pid: alive, someone else's
    check(first and not B.claim(fd), "a file another worker holds is left to it")
    (fd / ".claim").write_text(f"{__import__('socket').gethostname()} 999999999")   # no such process
    check(B.claim(fd), "a dead worker's claim is taken over")

print("FAILED" if fails else "all well", fails)
sys.exit(1 if fails else 0)
