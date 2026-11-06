"""HERESY 1970 (Viktor 30–31.10.2026: «Что с Pianoteq плагином и его интерфейсом?… И в DAW обязательно интеграция… в постпроцессинге этот
Пианотек и нужен»; «По распространению Пианотек в паблик… подготовим для Plug-N-Play и дадим отдельный гайд по установке и активации»):
a stem of the set played again by the Pianoteq installed here, as a lane of its own in the DAW or as the stem's version.

The stem's MIDI is the take's own when the MIDI step already made one of it (lab.py's derived/midi-*), else MuScriptor transcribes it here,
on the CPU (orchestra.make_version's way). Each note's velocity is read from the stem at its attack (orchestra.velocities), the touch moves
them all, the sustain pedal is held through each phrase; then Pianoteq plays the MIDI headless, with a copy of its own preferences for that render
(where a bought one keeps its activation; the user's file never written), and the render stands at the stem's level, of its length.

Plug-N-Play: the Studio ships nothing of Pianoteq. It drives the copy the user installed and activated: user/pianoteq.json {"path": …}
first, then models/instruments/pianoteq*/ (the tarball unpacked there), then ~/pianoteq*/, then a `pianoteq` on the PATH. Without one the
step says where to put it. Modartt's licence (§1.2 f): Pianoteq's sound may not train a neural network; the branch says so in its measure.

    python pianoteq.py SET_DIR OUTDIR PARAMS.json
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB = HERE.parents[1]
KIT = LAB.parent
sys.path.insert(0, str(LAB))

# HERESY 2036: one script for Modartt's three; organteq.py and airteq.py set PRODUCT and call main(). Each its program's name, the stems it
# plays first, its keyboard (notes beyond it moved by octaves) and whether a sustain pedal means anything to it
PRODUCT = "pianoteq"
KINDS = {"pianoteq": {"name": "Pianoteq", "exe": "Pianoteq *", "first": ("piano", "other", "instrumental", "guitar"), "keys": (21, 108), "pedal": True,
                      "preset": "NY Steinway D Classical", "what": "a piano"},
         "organteq": {"name": "Organteq", "exe": "Organteq *", "first": ("piano", "other", "instrumental", "guitar"), "keys": (36, 96), "pedal": False,
                      "preset": "Romantic Cathedral", "what": "an organ"},
         "airteq": {"name": "Airteq", "exe": "Airteq", "first": ("winds", "other", "vocals", "instrumental", "piano"), "keys": (24, 108), "pedal": False,
                    "preset": "Classical Flute", "what": "Airteq"}}
FIRST = KINDS["pianoteq"]["first"]   # the stem asked when the set has none of that name (stem_file reads the product's own)


def licence():
    return f"{KINDS[PRODUCT]['name']} (Modartt): played by the copy installed here; by its licence its sound is not for training a neural network"


LICENCE = licence()


def find_pianoteq(kit):
    """The Pianoteq program installed here, or None."""
    return find_modartt(kit, "pianoteq")


def find_modartt(kit, slug):
    """HERESY 2036: the program of this Modartt product installed here (user/<slug>.json, models/instruments/<slug>*/, ~, the PATH), or None."""
    k = KINDS[slug]
    cfg = Path(kit) / "user" / f"{slug}.json"
    if cfg.is_file():
        try:
            p = Path(os.path.expanduser(str(json.load(open(cfg, encoding="utf-8")).get("path") or "")))
            if p.is_file() and os.access(p, os.X_OK):
                return p
        except (OSError, ValueError):
            pass
    roots = sorted((Path(kit) / "models" / "instruments").glob(f"{slug}*")) + sorted(Path.home().glob(f"{slug}*")) + sorted(Path.home().glob(f"{k['name']}*"))
    for root in roots:
        for arch in ("x86-64bit", "arm-64bit"):
            for b in sorted(root.glob(f"**/{arch}/{k['exe']}"), reverse=True):   # the newest version first; its .lv2 and .vst3 are folders, its .so a plugin
                if b.is_file() and b.suffix not in (".so", ".lv2", ".vst3") and os.access(b, os.X_OK):
                    return b
    for name in (slug, k["name"]):
        w = shutil.which(name)
        if w:
            return Path(w)
    return None


def own_prefs(work):
    """A copy of Pianoteq's own preferences for one render, in a folder of its own (0600): a bought Pianoteq keeps its activation there, and
    with a file of its own it plays silence (−91 dB, 31.10.2026), while --no-prefs rewrites the user's file as it quits. The copy goes with
    the render; the user's file is never written."""
    srcs = sorted(Path.home().glob(f".config/Modartt/{KINDS[PRODUCT]['name']}*.prefs"), key=lambda q: q.stat().st_mtime, reverse=True)
    dst = Path(tempfile.mkdtemp(prefix=f"{PRODUCT}-", dir=str(work))) / "prefs"
    if srcs:
        shutil.copyfile(srcs[0], dst)
        os.chmod(dst, 0o600)
    return dst


def stem_file(set_dir, want):
    """The set's file for the stem asked (or the first of FIRST it has), and its name."""
    have = {p.stem: p for p in Path(set_dir).iterdir() if p.suffix.lower() in (".flac", ".wav")}
    for name in [want] + [x for x in KINDS[PRODUCT]["first"] if x != want]:
        if name in have:
            return have[name], name
    raise FileNotFoundError(f"the set has no {want} stem (it has {', '.join(sorted(have)) or 'none'})")


def pedal(notes, gap=0.6):
    """CC 64 held through each phrase: down at its first note, up just after its last note ends (a phrase ends where nothing sounds for gap s)."""
    cc, start, end = [], None, -1.0
    for on, off, *_ in sorted(notes, key=lambda n: n[0]):
        if start is not None and on - end > gap:
            cc += [(start, 64, 127), (end + 0.05, 64, 0)]
            start = None
        if start is None:
            start = on
        end = max(end, off)
    if start is not None:
        cc += [(start, 64, 127), (end + 0.05, 64, 0)]
    return cc


def main(set_dir, outdir, params_file):
    import numpy as np
    import soundfile as sf
    import orchestra
    import muscriptor
    t0 = time.time()
    p = json.load(open(params_file, encoding="utf-8"))
    set_dir, outdir = Path(set_dir), Path(outdir)
    take = set_dir.parent.parent                       # derived/stems-…/ of a take
    K = KINDS[PRODUCT]
    N = K["name"]
    binary = find_modartt(KIT, PRODUCT)
    if binary is None:
        raise SystemExit(f"no {N} here: unpack the one you bought (or its trial) from modartt.com into models/instruments/{PRODUCT}/, activate it there, "
                         f"or name its program in user/{PRODUCT}.json {{\"path\": …}} (the guide: {N})")
    stem, name = stem_file(set_dir, str(p.get("stem") or K["first"][0]))
    source = f"derived/{set_dir.name}/{stem.name}"
    only = orchestra.only_for(source)
    folder = orchestra.midi_set_of(take, source, only)
    if folder is None:                                  # transcribed here, as the MIDI step and the orchestra write a set
        size = muscriptor.pick(KIT, "")
        if not size:
            raise SystemExit("no MuScriptor model here: Engine → Models → Sound to MIDI fetches one")
        did = f"midi-{size}-" + time.strftime("%Y%m%d-%H%M%S")
        tmp, folder = take / "derived" / (did + ".part"), take / "derived" / did
        r = muscriptor.run(KIT, stem, tmp, size, only, None)
        man = {"id": did, "kind": "midi", "parent": take.name, "source": source, "size": size, "only": only, "engine": r.get("engine"),
               "device": r.get("device"), "seconds": r.get("seconds"), "took": r.get("took"), "instruments": r.get("instruments", []),
               "notes": len(r.get("notes", [])),
               "files": [{"file": "song.mid", "path": f"derived/{did}/song.mid", "kind": "midi", "title": "MIDI"},
                         {"file": "notes.json", "path": f"derived/{did}/notes.json", "kind": "text", "title": "the notes"}],
               "created": time.strftime("%Y-%m-%d %H:%M")}
        json.dump(man, open(tmp / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        tmp.rename(folder)
    notes, _inst = orchestra.load_notes(folder)
    keys = str(p.get("parts") or "all") == "keys"
    notes = [n for n in notes if not n[4] and (not keys or int(n[3]) < 24)]   # no drums; «keys»: GM's pianos, chromatic percussion and organs
    if not notes:
        raise SystemExit(f"the stem's MIDI has no notes for {K['what']} to play")
    if str(p.get("dynamics") or "stem") == "stem":
        vel = orchestra.velocities(notes, stem)         # read at each note's own pitch, before any shift
    else:
        vel = [80] * len(notes)
    shift = int(float(p.get("shift") or 0))
    lo, hi = K["keys"]                                  # HERESY 2036: the product's own keyboard (a piano's 88 keys, an organ's manual C2–C7),
    def keyed(q):                                       # a note beyond it moved by octaves, not squashed onto its last key
        while q < lo:
            q += 12
        while q > hi:
            q -= 12
        return q
    notes = [[a, b, keyed(int(q) + shift), pr, dr] for a, b, q, pr, dr in notes]
    touch = int(float(p.get("touch") or 0))
    vel = [max(1, min(127, int(v) + touch)) for v in vel]
    cc = pedal(notes) if K["pedal"] and str(p.get("pedal") or "phrases") == "phrases" else []
    work = Path(KIT) / "tmp" / f"{PRODUCT}-step"
    work.mkdir(parents=True, exist_ok=True)
    mid = orchestra.write_mid([[a, b, q, 0, 0] for a, b, q, _pr, _dr in notes], vel, outdir / "part.mid", tail=3.0, cc=cc)
    info = sf.info(str(stem))
    rate, frames = info.samplerate, info.frames
    wav = outdir / f"{PRODUCT}.wav"
    preset = str(p.get("preset") or K["preset"])
    # HERESY 1977: the panel's own state (any of Pianoteq's presets, its small presets, the values set): a preset file made for this render
    # (saved for a moment into the bank «Ruach Studio», copied out, deleted there; pianoteq_live.fxp), played with --fxp
    try:
        st = json.loads(str(p.get("state") or "") or "{}")
    except ValueError:
        st = {}
    st = st if isinstance(st, dict) else {}
    preset = str(st.get("preset") or preset)
    import modartt
    pianoteq_live = modartt.live(PRODUCT)             # HERESY 2036: the product's own module (Pianoteq's when the step is Pianoteq)
    demo = pianoteq_live.licensed(KIT, preset, str(st.get("bank") or "")) is False   # a demo here: some of its keys are silent
    fx, changed = None, len(st.get("values") or {})
    if st.get("preset") or st.get("small") or changed:
        try:
            fx = pianoteq_live.fxp(KIT, dict(st, preset=preset), work / f"state-{os.getpid()}.fxp")
        finally:
            pianoteq_live.Server(KIT).stop()
    prefs = own_prefs(work)
    try:
        r = subprocess.run([str(binary), "--headless", "--quiet", "--prefs", str(prefs)] + (["--fxp", str(fx)] if fx else ["--preset", preset]) +
                           ["--midi", str(mid), "--wav", str(wav), "--rate", str(rate)], capture_output=True, text=True, timeout=7200)
    finally:
        shutil.rmtree(prefs.parent, ignore_errors=True)
        if fx:
            Path(fx).unlink(missing_ok=True)
    if not wav.is_file():
        raise SystemExit(f"{N} made no sound: " + ((r.stderr or "").strip() or (r.stdout or "").strip())[-300:])
    a, _ = sf.read(str(wav), always_2d=True, dtype="float32")
    if not a.size or 20 * np.log10(np.sqrt(np.mean(a.astype(np.float64) ** 2)) + 1e-12) < -70:   # silence is never raised to the stem's level
        wav.unlink()
        raise SystemExit(f"{N} played silence: is it activated? (run it once and activate it with your own serial; the guide: {N})")
    a = np.pad(a, ((0, max(0, frames - len(a))), (0, 0)))[:frames]
    if a.shape[1] != info.channels:
        a = np.repeat(a[:, :1], info.channels, axis=1) if a.shape[1] == 1 else a[:, :info.channels]
    s, _ = sf.read(str(stem), always_2d=True, dtype="float32")
    a = a * (orchestra._level(s) / orchestra._level(a))   # at the stem's level
    peak = float(np.abs(a).max()) if a.size else 0.0
    if peak > 0.98:
        a = a * (0.98 / peak)
    out = f"{PRODUCT}.flac"
    sf.write(str(outdir / out), a, rate, subtype="PCM_24")
    wav.unlink()
    Path(mid).unlink()                                  # the take keeps its MIDI set; the branch its sound
    lane = str(p.get("lay") or "lane") == "lane"
    f = {"name": f"{N} · {preset}" + (" ✎" if changed or st.get("small") else "") + f" · {name}", "file": out, "seconds": round(frames / rate, 2)}
    if lane:
        f["track"] = PRODUCT                            # a strip of its own in the DAW (1929's way), beside the stem it plays
    else:
        f["source"] = source                            # the stem's version: the DAW plays it instead
    print(json.dumps({"files": [f],
                      "measure": {"licence": licence(), "product": N, "preset": preset, "demo": demo, "changed": changed, "small": st.get("small") or {}, "stem": name, "notes": len(notes), "midi": folder.name, "touch": touch,
                                  "shift": shift, "pedal": bool(cc), "lowered_db": round(20 * np.log10(0.98 / peak), 2) if peak > 0.98 else 0.0},
                      "summary": f"{preset}" + (f" with {changed} setting{'' if changed == 1 else 's'} of its own" if changed else "") + f" played {len(notes)} notes of the {name} stem; " + ("a lane of its own in the DAW" if lane else "the stem's version in the DAW") +
                                 (f"; a demo in this {N}: some of its keys are silent" if demo else ""),
                      "took": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main(*sys.argv[1:4])
