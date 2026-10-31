"""HERESY 1881: the MIDI orchestra's parts on the processor. python3 lab/test_orchestra.py"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import mido  # noqa: E402
import orchestra as O  # noqa: E402

KIT = Path(__file__).resolve().parent.parent
bad = []


def check(what, ok, got=""):
    print(("  ok    " if ok else "  FAIL  ") + what + ("" if ok else "  (" + str(got) + ")"))
    if not ok:
        bad.append(what)


check("a stem's groups: bass", O.only_for("derived/stems-eight/bass.flac").startswith("electric_bass"), O.only_for("x/bass.flac"))
check("a stem's groups: drums alone", O.only_for("derived/stems-eight/drums.flac") == "drums")
check("anything else: every group", O.only_for("audio.wav") == "")
check("every group of a stem is MuScriptor's", all(g in O.GROUPS for gs in O.STEMS.values() for g in gs))

with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    # an A4 note at full level and one 12 dB lower: velocities 127 and 127·10^(-12/40) ≈ 64
    sr = 32000
    tt = np.arange(int(4 * sr)) / sr
    y = np.zeros_like(tt)
    for on, amp in ((0.5, 0.5), (2.5, 0.5 * 10 ** (-12 / 20))):
        m = (tt >= on) & (tt < on + 1.0)
        y[m] = amp * np.sin(2 * np.pi * 440 * tt[m])
    sf.write(t / "stem.wav", y.astype(np.float32), sr)
    notes = [[0.5, 1.5, 69, 0, 0], [2.5, 3.5, 69, 0, 0]]
    v = O.velocities(notes, t / "stem.wav")
    check("velocity: the loud note 127", v[0] >= 120, v)
    check("velocity: 12 dB lower about 64", 56 <= v[1] <= 72, v)
    # a kick in the low band and a hat in the high one: each scaled on its own (drums one part)
    d = np.zeros_like(tt)
    k = (tt >= 1.0) & (tt < 1.1)
    d[k] = 0.8 * np.sin(2 * np.pi * 60 * tt[k])
    h = (tt >= 2.0) & (tt < 2.05)
    d[h] = 0.2 * np.random.default_rng(1).standard_normal(int(h.sum()))
    sf.write(t / "drums.wav", d.astype(np.float32), sr)
    dv = O.velocities([[1.0, 1.1, 36, 128, 1], [2.0, 2.05, 42, 128, 1]], t / "drums.wav")
    check("drums: a kick read in its own band", dv[0] >= 100, dv)

    mid = O.write_mid(notes + [[1.0, 1.1, 36, 128, 1]], v + [90], t / "song.mid")
    mm = mido.MidiFile(mid)
    on = [m for tr in mm.tracks for m in tr if m.type == "note_on" and m.velocity > 0]
    check("the MIDI: three notes on", len(on) == 3, len(on))
    check("the MIDI: the velocities kept", sorted(m.velocity for m in on) == sorted(v + [90]), [m.velocity for m in on])
    check("the MIDI: the drums on channel 10", any(m.channel == 9 and m.note == 36 for m in on))
    check("the MIDI: lasts the notes and the tail", 5.0 <= mm.length <= 6.0, mm.length)

    lib = O.library(KIT)
    gu = [i for i in lib if i["kind"] == "sf2" and i["set"] == "generaluser-gs"]
    check("the library: GeneralUser GS read", bool(gu))
    if gu:
        pre = gu[0]["presets"]
        check("its presets: a piano at bank 0 preset 0", any(p["bank"] == 0 and p["preset"] == 0 for p in pre), pre[:3])
        check("its presets: drum kits at bank 128", any(p["bank"] == 128 for p in pre))
    sal = [i for i in lib if i["kind"] == "sfz" and i["set"] == "salamander"]
    check("the library: Salamander's SFZ", bool(sal))

    one = O.write_mid([[0.2, 1.2, 60, 0, 0], [1.4, 2.0, 64, 0, 0]], [110, 70], t / "two.mid")
    for name, inst in (("FluidSynth on GeneralUser GS", gu[0] if gu else None), ("sfizz on Salamander", sal[0] if sal else None)):
        if not inst:
            check(name, False, "no instrument")
            continue
        out = O.render(KIT, one, dict(inst, preset=0, bank=0) if inst["kind"] == "sf2" else inst, t / (inst["kind"] + ".wav"))
        a, r = sf.read(out)
        peak = float(np.abs(a).max()) if len(a) else 0.0
        check(name + ": sound, at 48 kHz", r == 48000 and peak > 0.01, (r, peak))
        check(name + ": the notes and their releases (sfizz to the voices' end, FluidSynth 2 s past the MIDI)", 3.5 <= len(a) / r <= 6.5, len(a) / r)

with tempfile.TemporaryDirectory() as t:              # HERESY 1883–1884: a take's own map over the studio's; the studio's never written here
    take = Path(t)
    studio_before = O.map_file(KIT).read_bytes() if O.map_file(KIT).is_file() else None
    sal = [i for i in O.library(KIT) if i["kind"] == "sfz" and i["set"] == "salamander"]
    if sal:
        inst = {"kind": "sfz", "file": sal[0]["file"], "label": "Salamander"}
        m = O.set_map(KIT, "acoustic_piano", inst, take)
        check("a take's map: its piano is its own", m.get("acoustic_piano") == inst, m.get("acoustic_piano"))
        check("a take's map: in its own folder", (take / "orchestra.json").is_file())
        m = O.set_map(KIT, "acoustic_piano", None, take)
        check("a take's map: cleared, the studio's again", m.get("acoustic_piano") == O.instrument_map(KIT).get("acoustic_piano"))
    try:
        O.set_map(KIT, "kazoo", {"kind": "sfz", "file": "x.sfz"}, take)
        check("a group not MuScriptor's refused", False)
    except ValueError:
        check("a group not MuScriptor's refused", True)
    after = O.map_file(KIT).read_bytes() if O.map_file(KIT).is_file() else None
    check("the studio's map untouched by the test", after == studio_before)

check("every stem with words has them", all(k in O.WORDS for k in ("piano", "bass", "drums", "guitar", "winds", "other")), sorted(O.WORDS))
for st in ("piano", "bass", "drums", "other"):          # HERESY 1884: what the console offers a stem
    sg = O.suggest(KIT, st, 12)
    check(f"suggest {st}: the map first", sg and sg[0]["instrument"] is None, sg[:1])
    labels = " | ".join(x["label"].lower() for x in sg[1:])
    check(f"suggest {st}: no multi-mic part, no mapping", "/multi" not in labels and "mapping" not in labels, labels)
    if st == "bass":
        check("suggest bass: no bassoon", "bassoon" not in labels, labels)
    if st == "piano":
        check("suggest piano: nothing of a bass", "bass" not in labels, labels)
    lib = O.library(KIT)
    has = any(any(w in (i["set"] + " " + i["file"]).lower() for w in O.WORDS.get(st if st != "other" else "other", ())) for i in lib if i["kind"] == "sfz")
    check(f"suggest {st}: a set of its own offered when the library has one", len(sg) > 1 or not has, [x["label"] for x in sg])
    for x in sg[1:]:
        i = x["instrument"]
        files = [r[2]["file"] for r in i["ranges"]] if i["kind"] == "split" else [i["file"]]
        check(f"suggest {st}: {x['label']} is here", all((KIT / "models" / "instruments" / f).is_file() for f in files), files)

sq = O.squeeze([8, 20, 64, 100, 127, 127], 60, 112)          # HERESY 1887: his ear's narrower range, the order kept
check("squeeze: into its range, the order kept", min(sq) >= 60 and max(sq) <= 112 and sq == sorted(sq), sq)
for st in ("bass", "drums", "piano"):
    labels = " ".join(x["label"].lower() for x in O.suggest(KIT, st, 12))
    check(f"suggest {st}: the GM banks he liked right after the map", "generaluser gs · gm" in labels, labels)

bb = [i for i in O.library(KIT) if i["file"].endswith("03-babyblue_all.sfz")]   # HERESY 1888: a bass heard an octave under its key
if bb:
    km = O.keymap(KIT, {"kind": "sfz", "file": bb[0]["file"]})
    check("keymap: Baby Blue sounds an octave under its key", km["offset"] == -12, km)
    rm = O.remap([[0, 1, 28, 33, 0], [1, 2, 40, 33, 0], [2, 3, 90, 33, 0], [3, 4, 36, 128, 1]], km)
    check("remap: the written E1 on its key an octave up, a note above the range an octave down, drums as they are",
          rm[0][2] == 40 and rm[1][2] == 52 and km["low"] <= rm[2][2] <= km["high"] and rm[3][2] == 36, rm)
sn = [i for i in O.library(KIT) if i["file"].endswith("02-sneakybass_pluck.sfz")]   # HERESY 1891: an octave slip is its note
if sn:
    km = O.keymap(KIT, {"kind": "sfz", "file": sn[0]["file"]})
    check("keymap: Sneakybass's low keys, read at their second harmonic, are its notes", km["offset"] == -12 and
          all(k in km["keys"] for k in (36, 37, 38, 40, 41, 42, 44, 48)) and 64 not in km["keys"], km)
check("a noise patch never offered", not any("noise" in x["label"].lower() for st in ("bass", "guitar", "drums") for x in O.suggest(KIT, st, 24)))
labels = " ".join(x["label"].lower() for x in O.suggest(KIT, "piano", 12) + O.suggest(KIT, "drums", 12))
check("his word: Big Rusty Drums and Scary Piano never offered", "rusty" not in labels and "scary" not in labels, labels)
bs = [x for x in O.suggest(KIT, "bass", 12) if x["instrument"] and "karoryfer" in x["label"].lower()]
check("Karoryfer's basses offered again, through their own keymap", bool(bs) and all(x["instrument"].get("keymap") == "auto" for x in bs), bs[:2])

offered = {x["instrument"]["file"]: x for x in O.suggest(KIT, "drums", 12) if x["instrument"] and x["instrument"].get("keymap") == "drums"}
for name, dk in O.DRUM_KITS.items():                  # HERESY 1889: Karoryfer's drum kits through a drum keymap of their own
    f = next((f for f in offered if f"/{name}/" in "/" + f), None)
    if f is None:
        if any(f"/{name}/" in "/" + i["file"] for i in O.library(KIT)):
            check(f"{name}: offered for the drums, through its drum keymap", False, sorted(offered))
        continue
    heard = {k for k, _db, _p, _c in O.probe(KIT, {"kind": "sfz", "file": f})}
    check(f"{name}: every key GM's pieces land on sounds", set(dk["keys"].values()) <= heard, sorted(set(dk["keys"].values()) - heard))
    inst = {"kind": "sfz", "file": f, "keymap": "drums"}
    with tempfile.TemporaryDirectory(dir=str(KIT / "tmp")) as t:
        t = Path(t)
        lack = next(k for k in (39, 54, 69, 82) if k not in dk["keys"])
        mid = O.write_mid([[0.0, 0.2, 36, 128, 1], [1.5, 1.7, lack, 128, 1]], [100, 100], t / "lack.mid")
        a, r = sf.read(O.render(KIT, mid, inst, t / "lack.wav"), always_2d=True)
        w = a[int(1.5 * r):int(2.1 * r)]
        db = 20 * np.log10(float(np.sqrt(np.mean(w ** 2))) + 1e-9)
        check(f"{name}: a piece it lacks (GM {lack}) played by the GM bank", db > -60, round(db, 1))
        tails = {}
        for k in (42, 46):
            mid = O.write_mid([[0.0, 0.1, k, 128, 1]], [100], t / f"h{k}.mid")
            a, r = sf.read(O.render(KIT, mid, inst, t / f"h{k}.wav"), always_2d=True)
            tails[k] = 20 * np.log10(float(np.sqrt(np.mean(a[int(0.4 * r):int(1.2 * r)] ** 2))) + 1e-9)
        check(f"{name}: GM's open hat rings past its closed one", tails[46] > tails[42] + 6, {k: round(v, 1) for k, v in tails.items()})

for st in ("guitar", "bass", "piano", "other", "winds", "drums"):     # HERESY 1924: every offer sounds, no fragment offered
    sg = O.suggest(KIT, st, 12)
    quiet = [x["label"] for x in sg[1:] if O.sounds(KIT, x["instrument"], st) <= O.SILENT_DB]
    frag = [x["label"] for x in sg[1:] if x["instrument"]["kind"] == "sfz" and any(w in x["instrument"]["file"] for w in ("/modules/", "/includes/", "/keymaps/"))]
    check(f"suggest {st}: every offer sounds, no fragment of a program", not quiet and not frag, quiet + frag)
print("test_orchestra:", "FAILED " + ", ".join(bad) if bad else "all passed")
sys.exit(1 if bad else 0)
